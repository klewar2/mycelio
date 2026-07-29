"""Espaces protégés où la cueillette est interdite.

Le cahier des charges impose de MASQUER les mailles concernées, pas de les signaler : une
application qui désigne un bon coin dans une réserve biologique intégrale reste une application
qui envoie quelqu'un enfreindre la réglementation, même avec un bandeau.

Source : la couche `parc_ou_reserve` de la BD TOPO (IGN, Etalab 2.0), dont le champ
`nature_detaillee` distingue la réserve biologique INTÉGRALE de la réserve biologique DIRIGÉE.
La nuance est décisive : la cueillette est interdite dans la première, encadrée dans la seconde.

L'INPN aurait été la source de référence, mais son service WFS (ws.carmencarto.fr) ne répond
pas ; la BD TOPO couvre les mêmes périmètres et se requête comme le reste du pipeline.
"""

from __future__ import annotations

import geopandas as gpd
import pandas as pd

from .config import CRS_L93, CRS_WGS84
from .hydro import _fetch_layer

LAYER = "BDTOPO_V3:parc_ou_reserve"


def load_protected(
    cells: gpd.GeoDataFrame, dept: str, categories: list[str]
) -> gpd.GeoDataFrame:
    """Récupère les espaces protégés de l'emprise, filtrés sur les catégories à masquer."""
    west, south, east, north = cells.to_crs(CRS_WGS84).total_bounds
    areas = _fetch_layer(LAYER, (south, west, north, east), f"protected_{dept}")

    if areas.empty or "nature_detaillee" not in areas.columns:
        return areas.iloc[0:0]

    return areas[areas["nature_detaillee"].isin(categories)].to_crs(CRS_L93)


def mark_restricted(
    cells: gpd.GeoDataFrame, protected: gpd.GeoDataFrame
) -> pd.DataFrame:
    """Marque les mailles qui INTERSECTENT un espace protégé.

    Intersection et non contenance : une maille à cheval sur la limite d'une réserve envoie
    quand même chercher à l'intérieur. Dans le doute réglementaire, on retire.
    """
    out = pd.DataFrame(
        {
            "h3_index": cells["h3_index"].to_numpy(),
            "restricted": False,
            "restriction": None,
        }
    )
    if protected.empty:
        return out

    hits = gpd.sjoin(
        cells.to_crs(CRS_L93)[["h3_index", "geometry"]],
        protected[["toponyme", "geometry"]],
        how="inner",
        predicate="intersects",
    )
    if hits.empty:
        return out

    # Une maille peut toucher plusieurs espaces : on garde le premier nom, il ne sert qu'à
    # expliquer l'exclusion.
    names = hits.groupby("h3_index")["toponyme"].first()
    out = out.set_index("h3_index")
    out.loc[names.index, "restricted"] = True
    out.loc[names.index, "restriction"] = names
    return out.reset_index()
