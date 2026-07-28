"""Distances à l'eau et aux chemins, depuis la BD TOPO (IGN, Etalab 2.0).

On passe par le WFS de la Géoplateforme plutôt que par le téléchargement départemental : la BD
TOPO complète pèse plusieurs gigaoctets alors qu'on n'a besoin que de deux couches linéaires.

`dist_path_m` mérite un mot, parce que son usage est contre-intuitif — c'est le piège que le
cahier des charges signale explicitement. La variable sert à l'ENTRAÎNEMENT, pour que le modèle
y absorbe le biais d'échantillonnage : les gens observent des champignons près des chemins, pas
parce qu'il y en a plus, mais parce qu'ils n'y vont pas autrement. À l'INFÉRENCE, on la fixe à sa
médiane sur toutes les mailles, ce qui retire le biais au lieu de le propager. Elle n'a donc
aucun effet sur les scores affichés, et c'est voulu.
"""

from __future__ import annotations

import json

import geopandas as gpd
import httpx
import pandas as pd
from tqdm import tqdm

from .cache import RAW
from .config import CRS_L93, CRS_WGS84, ensure_dirs

WFS = "https://data.geopf.fr/wfs/ows"
PAGE = 5000

# Voies effectivement empruntées pour aller en forêt. On écarte volontairement les routes
# principales : la question n'est pas « à quelle distance d'un axe » mais « à quelle distance
# d'un accès praticable à pied ».
PATH_KINDS = ("Chemin", "Sentier", "Route empierrée", "Piste cyclable")


def _fetch_layer(
    layer: str, bbox: tuple[float, float, float, float], name: str, cql: str | None = None
) -> gpd.GeoDataFrame:
    """Télécharge une couche WFS par pages, avec cache sur disque.

    Le WFS plafonne à quelques milliers d'entités par requête : sans pagination on récupère
    silencieusement un extrait tronqué, ce qui fausserait toutes les distances.
    """
    ensure_dirs()
    target = RAW / f"{name}.geojson"
    if target.exists():
        return gpd.read_file(target)

    south, west, north, east = bbox
    spatial = f"BBOX(geometrie,{south},{west},{north},{east})"
    where = f"{cql} AND {spatial}" if cql else spatial

    features: list[dict] = []
    start = 0
    with tqdm(desc=name, unit="ent.") as progress:
        while True:
            params = {
                "SERVICE": "WFS",
                "VERSION": "2.0.0",
                "REQUEST": "GetFeature",
                "TYPENAMES": layer,
                "SRSNAME": "EPSG:4326",
                "OUTPUTFORMAT": "application/json",
                "COUNT": str(PAGE),
                "STARTINDEX": str(start),
                "CQL_FILTER": where,
            }
            response = httpx.get(WFS, params=params, timeout=300.0, follow_redirects=True)
            response.raise_for_status()
            page = response.json().get("features", [])
            features.extend(page)
            progress.update(len(page))
            if len(page) < PAGE:
                break
            start += PAGE

    collection = {"type": "FeatureCollection", "features": features}
    target.write_text(json.dumps(collection))
    return gpd.read_file(target)


def distances(cells: gpd.GeoDataFrame, dept: str) -> pd.DataFrame:
    """Distance du centroïde de chaque maille au cours d'eau et au chemin les plus proches."""
    west, south, east, north = cells.to_crs(CRS_WGS84).total_bounds
    bbox = (south, west, north, east)

    streams = _fetch_layer("BDTOPO_V3:cours_d_eau", bbox, f"cours_d_eau_{dept}")
    kinds = ",".join(f"'{k}'" for k in PATH_KINDS)
    paths = _fetch_layer(
        "BDTOPO_V3:troncon_de_route", bbox, f"chemins_{dept}", cql=f"nature IN ({kinds})"
    )

    cells_l93 = cells.to_crs(CRS_L93)
    centroids = gpd.GeoDataFrame(
        {"h3_index": cells_l93["h3_index"].to_numpy()},
        geometry=cells_l93.geometry.centroid,
        crs=CRS_L93,
    )

    out = pd.DataFrame({"h3_index": centroids["h3_index"].to_numpy()})
    for field, layer in (("dist_stream_m", streams), ("dist_path_m", paths)):
        # sjoin_nearest s'appuie sur l'index spatial : indispensable ici, une distance naïve
        # contre 200 000 linéaires serait interminable.
        joined = gpd.sjoin_nearest(
            centroids,
            layer.to_crs(CRS_L93)[["geometry"]],
            how="left",
            distance_col="_d",
        )
        nearest = joined.groupby("h3_index", as_index=False)["_d"].min()
        out = out.merge(nearest.rename(columns={"_d": field}), on="h3_index", how="left")

    return out
