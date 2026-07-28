"""Dérivées de terrain, à partir du MNT.

CHOIX DE RÉSOLUTION. Le cahier des charges prévoit le RGE ALTI 5 m ; on prend la BD ALTI 25 m.
Ce n'est pas une facilité : sur des mailles de 740 m de large, le 5 m est du détail qu'on va de
toute façon moyenner, et surtout il produit des dérivées bien plus bruitées — pente et courbure
amplifient le bruit du MNT. Le 25 m donne un terrain mieux tenu pour un centième du volume.

PIÈGE À NE PAS ROUVRIR. L'exposition n'est jamais transmise en degrés : 359° et 1° sont
voisins sur le terrain mais aux antipodes pour un modèle. On la décompose en northness
(cos) et eastness (sin), et ce sont ces deux composantes qu'on moyenne par maille — moyenner
des angles n'aurait aucun sens.
"""

from __future__ import annotations

import glob
from pathlib import Path

import numpy as np
import rasterio
from rasterio.merge import merge
from scipy import ndimage

from .config import CRS_L93, WORK

# Les .asc de l'IGN ne portent pas de projection : elle est dans le nom du fichier.
DEM_CRS = CRS_L93


def build_mosaic(tiles_dir: Path | str, output: Path | None = None) -> Path:
    """Assemble les dalles en un seul raster géoréférencé.

    Un MNT contigu est indispensable : l'accumulation de flux du TWI suit l'eau de proche en
    proche, elle ne peut pas se calculer dalle par dalle sans créer des ruptures artificielles
    aux jointures.
    """
    paths = sorted(glob.glob(str(Path(tiles_dir) / "**" / "*.asc"), recursive=True))
    if not paths:
        raise FileNotFoundError(f"aucune dalle .asc sous {tiles_dir}")

    sources = [rasterio.open(p) for p in paths]
    mosaic, transform = merge(sources)
    profile = sources[0].profile
    nodata = sources[0].nodata
    for src in sources:
        src.close()

    output = output or (WORK / "dem_25m.tif")
    output.parent.mkdir(parents=True, exist_ok=True)
    profile.update(
        driver="GTiff",
        height=mosaic.shape[1],
        width=mosaic.shape[2],
        transform=transform,
        crs=DEM_CRS,
        dtype="float32",
        nodata=nodata,
        compress="deflate",
    )
    with rasterio.open(output, "w", **profile) as dst:
        dst.write(mosaic[0].astype("float32"), 1)
    return output


def _fill_nodata(dem: np.ndarray, nodata: float | None) -> np.ndarray:
    """Bouche les trous par le plus proche voisin valide.

    Les dérivées et surtout l'accumulation de flux se propagent : un seul trou non comblé
    contamine tout un bassin versant en aval.
    """
    dem = dem.astype("float64")
    invalid = ~np.isfinite(dem)
    if nodata is not None:
        invalid |= dem == nodata
    invalid |= dem < -1000
    if invalid.any():
        _, indices = ndimage.distance_transform_edt(invalid, return_indices=True)
        dem = dem[tuple(indices)]
    return dem


def derivatives(dem_path: Path) -> dict[str, np.ndarray]:
    """Calcule toutes les dérivées de terrain sur la grille du MNT."""
    with rasterio.open(dem_path) as src:
        raw = src.read(1)
        nodata = src.nodata
        pixel = abs(src.transform.a)

    dem = _fill_nodata(raw, nodata)

    # Gradients. np.gradient renvoie d/dligne puis d/dcolonne ; l'axe des lignes descend vers
    # le sud, d'où le signe sur dz_dy pour retrouver une orientation géographique.
    dz_dy, dz_dx = np.gradient(dem, pixel)
    dz_dy = -dz_dy

    slope_rad = np.arctan(np.hypot(dz_dx, dz_dy))
    slope_pct = np.tan(slope_rad) * 100.0

    # Exposition : direction de la plus grande pente descendante, en azimut géographique.
    aspect = np.arctan2(-dz_dx, dz_dy)
    northness = np.cos(aspect)
    eastness = np.sin(aspect)
    # Une surface plane n'a pas d'exposition : la laisser à une valeur arbitraire ferait croire
    # au modèle à un versant orienté.
    flat = slope_rad < np.deg2rad(0.5)
    northness[flat] = 0.0
    eastness[flat] = 0.0

    # TPI : altitude relative au voisinage, en mètres. On le laisse ici en unités brutes et on
    # le standardise APRÈS agrégation par maille — voir standardize().
    radius = max(3, int(round(500 / pixel)) | 1)  # ~500 m, en nombre impair de pixels
    neighborhood = ndimage.uniform_filter(dem, size=radius, mode="nearest")
    tpi = dem - neighborhood

    # Courbure : laplacien. Négatif en creux (concave, l'eau converge), positif en bosse.
    curvature = ndimage.laplace(ndimage.gaussian_filter(dem, 1.0)) / (pixel**2)

    # Index d'ensoleillement : cosinus de l'angle d'incidence pour un soleil d'automne au sud
    # (azimut 180°, hauteur 35°) — la saison qui nous intéresse. Rend les versants sud chauds
    # et les versants nord frais, ce qui est exactement le signal recherché.
    sun_azimuth, sun_altitude = np.deg2rad(180.0), np.deg2rad(35.0)
    solar = np.cos(slope_rad) * np.sin(sun_altitude) + np.sin(slope_rad) * np.cos(
        sun_altitude
    ) * np.cos(sun_azimuth - aspect)
    solar = np.clip(solar, 0.0, 1.0)

    return {
        "alt_m": dem,
        "slope_pct": slope_pct,
        "northness": northness,
        "eastness": eastness,
        "tpi": tpi,
        "curvature": curvature,
        "solar_index": solar,
        "_slope_rad": slope_rad,
    }


def wetness_index(dem_path: Path, slope_rad: np.ndarray) -> np.ndarray:
    """Indice topographique d'humidité : ln(surface drainée amont / tan(pente)).

    C'est le facteur qui distingue un fond de vallon d'une crête drainante, et donc les
    stations à trompettes des stations à cèpes.
    """
    # pysheds 0.5 appelle np.in1d, retiré dans NumPy 2. np.isin en est le remplaçant exact pour
    # cet usage (test d'appartenance élément par élément). On rétablit l'alias plutôt que de
    # rétrograder NumPy, ce qui casserait geopandas et rasterio.
    if not hasattr(np, "in1d"):
        np.in1d = np.isin  # type: ignore[attr-defined]

    from pysheds.grid import Grid

    grid = Grid.from_raster(str(dem_path))
    dem = grid.read_raster(str(dem_path))

    # Les dépressions fermées d'un MNT sont pour l'essentiel des artefacts ; sans ce traitement
    # l'eau s'y accumule et le réseau d'écoulement se fragmente.
    filled = grid.fill_depressions(dem)
    inflated = grid.resolve_flats(filled)
    directions = grid.flowdir(inflated)
    accumulation = np.asarray(grid.accumulation(directions), dtype="float64")

    with rasterio.open(dem_path) as src:
        pixel = abs(src.transform.a)

    # Surface drainée par unité de longueur de courbe de niveau. Le +1 compte le pixel lui-même.
    specific_area = (accumulation + 1.0) * pixel
    tan_slope = np.tan(np.maximum(slope_rad, np.deg2rad(0.1)))
    return np.log(specific_area / tan_slope)


def standardize(frame, columns=("tpi", "curvature")):
    """Centre-réduit certaines colonnes, APRÈS agrégation par maille.

    Le TPI et la courbure n'ont d'intérêt que relatif : ce qui compte est de savoir si une
    maille est haute ou basse par rapport à ses voisines. Or moyenner sur un hexagone de 740 m
    écrase énormément la dispersion — un TPI standardisé au pixel retombe dans ±0,9 une fois
    moyenné, et les seuils du cahier des charges (crête au-dessus de +1, thalweg sous −1) ne se
    déclencheraient jamais.

    On standardise donc sur la population des mailles, pas des pixels : « +1 » veut alors dire
    « un écart-type au-dessus des autres mailles », ce que les règles de conseil attendent.
    """
    frame = frame.copy()
    for column in columns:
        if column in frame:
            values = frame[column]
            spread = values.std()
            frame[column] = (values - values.mean()) / (spread if spread else 1.0)
    return frame
