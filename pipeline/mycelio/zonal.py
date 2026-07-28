"""Agrégation raster → maille hexagonale.

On rastérise les hexagones une seule fois sur la grille du MNT, puis on moyenne chaque couche
par groupe de pixels. Beaucoup plus rapide qu'un découpage géométrique maille par maille, et
surtout : une seule rastérisation sert à toutes les couches.
"""

from __future__ import annotations

import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio
from rasterio.features import rasterize

from .config import CRS_L93


def build_index(cells: gpd.GeoDataFrame, reference_raster) -> tuple[np.ndarray, list[str]]:
    """Rastérise les mailles : chaque pixel porte l'indice de la maille qui le contient.

    0 signifie « aucune maille », d'où le décalage de 1 sur les identifiants.
    """
    cells = cells.to_crs(CRS_L93).reset_index(drop=True)
    with rasterio.open(reference_raster) as src:
        shape, transform = (src.height, src.width), src.transform

    shapes = ((geom, i + 1) for i, geom in enumerate(cells.geometry))
    index = rasterize(
        shapes, out_shape=shape, transform=transform, fill=0, dtype="int32", all_touched=False
    )
    return index, list(cells["h3_index"])


def aggregate(
    index: np.ndarray, order: list[str], layers: dict[str, np.ndarray]
) -> pd.DataFrame:
    """Moyenne chaque couche par maille.

    np.bincount fait le travail d'un groupby en une passe, ce qui compte : on manipule des
    dizaines de millions de pixels.
    """
    flat = index.ravel()
    counts = np.bincount(flat, minlength=len(order) + 1).astype("float64")

    out: dict[str, np.ndarray] = {}
    for name, layer in layers.items():
        if name.startswith("_"):
            continue
        totals = np.bincount(flat, weights=layer.ravel(), minlength=len(order) + 1)
        with np.errstate(invalid="ignore", divide="ignore"):
            means = np.where(counts > 0, totals / counts, np.nan)
        out[name] = means[1:]  # on jette le groupe 0, hors mailles

    frame = pd.DataFrame(out)
    frame.insert(0, "h3_index", order)
    frame.insert(1, "pixels", counts[1:].astype("int64"))
    return frame
