"""Propriétés du sol, depuis SoilGrids (ISRIC, CC-BY 4.0).

On interroge le WCS plutôt que l'API point par point : 9 000 requêtes HTTP pour 9 000 mailles
seraient absurdes alors qu'une seule extraction couvre tout le département.

Deux pièges de SoilGrids :

- La grille est servie en Homolosine de Goode (EPSG:152160), pas en WGS84 ni en Lambert. Il faut
  donc convertir l'emprise avant de demander, et reprojeter les points avant d'échantillonner.
- Les valeurs sont stockées en entiers, à une échelle qui n'est pas celle de la variable : le pH
  est ×10, l'argile en g/kg, le carbone en dg/kg. Les utiliser telles quelles donnerait des sols
  à pH 65.
"""

from __future__ import annotations

from pathlib import Path

import geopandas as gpd
import numpy as np
import rasterio
from pyproj import Transformer

from .cache import RAW
from .config import CRS_L93, CRS_WGS84, ensure_dirs

WCS = "https://maps.isric.org/mapserv?map=/map/{layer}.map"

# Horizon 5–15 cm : celui où vit l'essentiel du mycélium des espèces qui nous intéressent.
# Le facteur convertit l'entier stocké vers l'unité réelle de la variable.
PROPERTIES = {
    "soil_ph": ("phh2o", "phh2o_5-15cm_mean", 0.1),  # pH×10 → pH
    "soil_clay_pct": ("clay", "clay_5-15cm_mean", 0.1),  # g/kg → %
    "soil_soc": ("soc", "soc_5-15cm_mean", 0.1),  # dg/kg → g/kg
}

HOMOLOSINE = "+proj=igh +lat_0=0 +lon_0=0 +datum=WGS84 +units=m +no_defs"


def _bounds_homolosine(cells: gpd.GeoDataFrame, margin: float = 5000.0):
    west, south, east, north = cells.to_crs(CRS_WGS84).total_bounds
    transformer = Transformer.from_crs(CRS_WGS84, HOMOLOSINE, always_xy=True)
    corners = [
        transformer.transform(x, y)
        for x, y in ((west, south), (west, north), (east, south), (east, north))
    ]
    xs = [c[0] for c in corners]
    ys = [c[1] for c in corners]
    return min(xs) - margin, min(ys) - margin, max(xs) + margin, max(ys) + margin


def download(cells: gpd.GeoDataFrame, dept: str) -> dict[str, Path]:
    """Récupère une extraction WCS par propriété, mise en cache."""
    ensure_dirs()
    x_min, y_min, x_max, y_max = _bounds_homolosine(cells)
    paths: dict[str, Path] = {}

    for field, (layer, coverage, _) in PROPERTIES.items():
        target = RAW / f"soilgrids_{field}_{dept}.tif"
        if not target.exists():
            url = WCS.format(layer=layer)
            params = {
                "SERVICE": "WCS",
                "VERSION": "2.0.1",
                "REQUEST": "GetCoverage",
                "COVERAGEID": coverage,
                "FORMAT": "GEOTIFF_INT16",
                "SUBSET": [f"X({x_min:.0f},{x_max:.0f})", f"Y({y_min:.0f},{y_max:.0f})"],
                "SUBSETTINGCRS": "http://www.opengis.net/def/crs/EPSG/0/152160",
            }
            import httpx

            # httpx ne répète pas une clé de query pour une liste : on construit les deux
            # paramètres SUBSET à la main.
            query = "&".join(
                [f"{k}={v}" for k, v in params.items() if k != "SUBSET"]
                + [f"SUBSET={s}" for s in params["SUBSET"]]
            )
            response = httpx.get(f"{url}&{query}", timeout=300.0, follow_redirects=True)
            response.raise_for_status()
            target.write_bytes(response.content)
        paths[field] = target

    return paths


def sample(cells: gpd.GeoDataFrame, rasters: dict[str, Path]):
    """Échantillonne chaque propriété au centroïde des mailles."""
    import pandas as pd

    # Le centroïde se calcule en projection métrique : en degrés, il est faux.
    centroids = cells.to_crs(CRS_L93).geometry.centroid.to_crs(CRS_WGS84)
    transformer = Transformer.from_crs(CRS_WGS84, HOMOLOSINE, always_xy=True)
    points = [transformer.transform(p.x, p.y) for p in centroids]

    out = pd.DataFrame({"h3_index": cells["h3_index"].to_numpy()})

    for field, path in rasters.items():
        scale = PROPERTIES[field][2]
        with rasterio.open(path) as src:
            values = np.array(
                [v[0] for v in src.sample(points)], dtype="float64"
            )
            nodata = src.nodata
        if nodata is not None:
            values[values == nodata] = np.nan
        # SoilGrids code l'absence de sol — rocher, eau, glacier — par 0 autant que par des
        # valeurs négatives. Un pH de 0 n'existe pas : le laisser passer polluerait le score.
        values[values <= 0] = np.nan
        out[field] = values * scale

    return out
