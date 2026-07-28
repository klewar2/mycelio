"""Attributs forestiers par maille, à partir de la BD Forêt.

ÉCART AU CAHIER DES CHARGES, à connaître avant de lire la suite.

Le doc prévoit la BD Forêt **V2** et ses codes d'essence. La V2 n'est pas diffusée par la
Géoplateforme : son flux de téléchargement ne sert que la **V1** (400 entrées, toutes en 1-0), et
les motifs d'URL directs de la V2 répondent 400. On travaille donc sur la V1.

Ce que ça change, concrètement :

- La V1 nomme quand même les essences dominantes — chênes, hêtre, sapin, douglas — ce qui suffit
  à l'appariement mycorhizien, qui est tout l'enjeu. Sur le 31 : 57 000 ha de chênaies,
  13 000 ha de hêtraies.
- Elle ne distingue PAS le châtaignier, hôte important du cèpe et de la girolle dans la région.
  Il tombe dans « feuillus indifférenciés », qu'on traite donc comme hôte générique de moindre
  confiance plutôt que comme une absence d'hôte.
- Le millésime est ancien : inventaire de 1996 (champ ANREF). La composition en essences bouge
  lentement — une chênaie reste une chênaie — mais les coupes et plantations récentes seront
  fausses par endroits. À garder en tête au moment de calibrer sur le terrain.
"""

from __future__ import annotations

import geopandas as gpd
import pandas as pd

from .config import CRS_L93

# Codes TFIFN qui ne sont pas du boisement : landes, pelouses, friches, espaces verts urbains.
# Les exclure évite de compter comme « forêt » une pelouse alpine, ce qui gonflerait la part
# boisée de mailles d'altitude sans aucun hôte mycorhizien.
NON_FOREST = {"10", "44", "46", "48", "50", "64", "68"}

# Essences hôtes par code. Le suffixe 9 marque les forêts de protection, sans incidence sur
# l'essence : on le retire avant la correspondance.
#
# Ces jetons sont ceux qu'on stockera dans species.host_codes. Volontairement peu nombreux :
# la BD Forêt ne sait pas en dire plus, et un modèle nourri de fausses précisions ment.
HOSTS: dict[str, tuple[str, ...]] = {
    # Chênaies — hôte majeur du cèpe de Bordeaux, de la tête de nègre, de la girolle
    "HA": ("chene",),
    "QA": ("chene",),
    "AA": ("chene",),
    # Hêtraies — cèpe et trompette de la mort
    "AH": ("hetre",),
    # Feuillus indifférenciés : châtaignier, charme, frêne s'y cachent. Hôte générique.
    "HF": ("feuillu",),
    "QF": ("feuillu",),
    "AF": ("feuillu",),
    "WF": ("feuillu",),
    "EF": ("feuillu",),
    # Sapinières et mélanges à sapin — girolle, lactaire, pied-de-mouton
    "CU": ("sapin", "conifere"),
    "FU1": ("sapin", "conifere", "feuillu"),
    "FU2": ("sapin", "conifere", "feuillu"),
    "PU2": ("sapin", "conifere"),
    # Douglas et autres conifères de reboisement
    "EY": ("douglas", "conifere"),
    "PY1": ("douglas", "conifere", "feuillu"),
    "PY2": ("douglas", "conifere"),
    "ER": ("conifere",),
    "CR": ("conifere",),
    "WR": ("conifere",),
    "PR1": ("conifere", "feuillu"),
    "PR2": ("conifere",),
    "MR1": ("conifere", "feuillu"),
    "MR2": ("conifere",),
    "FR1": ("conifere", "feuillu"),
    "FR2": ("conifere", "feuillu"),
    # Peupleraie cultivée : boisement sans intérêt mycorhizien notable pour nos espèces.
    "50": (),
}


def normalize_code(code: str) -> str:
    """Retire le suffixe des forêts de protection, qui ne change pas l'essence."""
    code = (code or "").strip()
    return code[:-1] if len(code) > 2 and code.endswith("9") else code


def hosts_for(code: str) -> tuple[str, ...]:
    return HOSTS.get(normalize_code(code), ())


def load_bdforet(shapefile: str) -> gpd.GeoDataFrame:
    """Charge la BD Forêt V1 et ne garde que le boisement réel.

    L'encodage est Latin-1 : les shapefiles IGN de cette génération ne sont pas en UTF-8, et
    pyogrio échoue sans cette précision.
    """
    frame = gpd.read_file(shapefile, encoding="latin1")
    frame["code"] = frame["TFIFN"].map(normalize_code)
    frame = frame[~frame["code"].isin(NON_FOREST)].copy()
    return frame.to_crs(CRS_L93)


def cell_attributes(
    cells: gpd.GeoDataFrame, forest: gpd.GeoDataFrame
) -> pd.DataFrame:
    """Essence dominante, part boisée et distance à la lisière, par maille.

    Tout se calcule en Lambert 93 : en degrés, une surface et une distance n'ont pas de sens.
    """
    cells = cells.to_crs(CRS_L93)
    cells["cell_area"] = cells.geometry.area

    # Intersection maille × peuplement : une maille recoupe plusieurs peuplements, on veut la
    # surface de chacun pour départager l'essence dominante.
    pieces = gpd.overlay(
        cells[["h3_index", "geometry"]], forest[["code", "geometry"]], how="intersection"
    )
    pieces["area"] = pieces.geometry.area

    by_code = pieces.groupby(["h3_index", "code"], as_index=False)["area"].sum()
    dominant = by_code.sort_values("area").groupby("h3_index").tail(1)
    dominant = dominant.rename(columns={"code": "forest_code", "area": "dominant_area"})

    wooded = by_code.groupby("h3_index", as_index=False)["area"].sum()
    wooded = wooded.rename(columns={"area": "wooded_area"})

    out = (
        cells[["h3_index", "cell_area"]]
        .merge(dominant[["h3_index", "forest_code"]], on="h3_index", how="left")
        .merge(wooded, on="h3_index", how="left")
    )
    out["wooded_area"] = out["wooded_area"].fillna(0.0)
    out["forest_share"] = (out["wooded_area"] / out["cell_area"]).clip(0, 1)

    # Distance du centroïde à la lisière la plus proche. On mesure jusqu'à la FRONTIÈRE du
    # boisement, pas jusqu'au peuplement : la valeur est ainsi parlante des deux côtés — une
    # maille en pleine forêt est loin de sa lisière, une maille en plaine est loin d'une forêt.
    # La bande de lisière est la zone la plus productive pour les bolets.
    edges = forest.dissolve().boundary
    centroids = gpd.GeoDataFrame(
        {"h3_index": cells["h3_index"]},
        geometry=cells.geometry.centroid,
        crs=CRS_L93,
    )
    out["dist_edge_m"] = centroids.geometry.distance(edges.union_all())

    return out[["h3_index", "forest_code", "forest_share", "dist_edge_m"]]
