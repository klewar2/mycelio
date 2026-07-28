"""Attributs forestiers par maille, à partir de la BD Forêt V2 (IGN, Etalab 2.0).

La V2 porte deux champs utiles : `CODE_TFV`, la typologie de formation végétale, et `ESSENCE`,
l'essence dominante déjà normalisée. C'est `ESSENCE` qui sert à l'appariement mycorhizien —
c'est exactement la question posée : quel arbre pousse ici.

`forest_code` stocke le CODE_TFV, plus précis, mais les jetons d'hôte dérivent de l'essence.
Ce sont ces jetons que `species.host_codes` référencera.

Millésimes : 2019 pour la Haute-Garonne, 2018 pour l'Aude, 2014 pour le Tarn. Sans commune
mesure avec l'inventaire 1996 de la V1.
"""

from __future__ import annotations

import warnings

import geopandas as gpd
import pandas as pd

from .config import CRS_L93

# Formations sans couvert arboré : landes, pelouses, forêts déclarées sans arbre. Les compter
# comme boisées gonflerait la part forestière de mailles d'altitude sans aucun hôte.
NON_FOREST_PREFIXES = ("LA", "FF0")

# Essence BD Forêt → jetons d'hôte mycorhizien.
#
# Les jetons restent volontairement grossiers : la BD Forêt ne sait pas distinguer un chêne
# pubescent d'un chêne vert sur la majorité du territoire, et un modèle nourri de fausses
# précisions ment avec assurance.
HOSTS: dict[str, tuple[str, ...]] = {
    "Chênes décidus": ("chene",),
    "Chênes sempervirents": ("chene", "chene_vert"),
    "Hêtre": ("hetre",),
    "Châtaignier": ("chataignier",),
    "Sapin, épicéa": ("sapin", "conifere"),
    "Douglas": ("douglas", "conifere"),
    "Mélèze": ("conifere",),
    # Tous les pins portent le jeton « pin » : c'est l'hôte exclusif du lactaire délicieux.
    # Le pin d'Alep domine les garrigues audoises, le pin à crochets les étages montagnards.
    "Pin laricio, pin noir": ("pin", "conifere"),
    "Pin maritime": ("pin", "conifere"),
    "Pin sylvestre": ("pin", "conifere"),
    "Pin d'Alep": ("pin", "conifere"),
    "Pin à crochets, pin cembro": ("pin", "conifere"),
    "Pin autre": ("pin", "conifere"),
    "Pins mélangés": ("pin", "conifere"),
    "Conifères": ("conifere",),
    # Peuplements mélangés non résolus à l'essence : hôte générique, de moindre confiance.
    "Feuillus": ("feuillu",),
    "Mixte": ("feuillu", "conifere"),
    # Ni l'un ni l'autre : le peuplier et le robinier ne portent pas nos espèces cibles.
    "Peuplier": (),
    "Robinier": (),
    # Non cartographié / non renseigné.
    "NC": (),
    "NR": (),
}


def hosts_for(essence: object) -> tuple[str, ...]:
    # Une maille sans peuplement porte un NaN, et non None : `essence or ""` ne le rattrape pas,
    # NaN étant truthy en Python.
    if not isinstance(essence, str):
        return ()
    return HOSTS.get(essence.strip(), ())


def is_forest(code_tfv: str | None) -> bool:
    code = (code_tfv or "").strip()
    return bool(code) and not code.startswith(NON_FOREST_PREFIXES)


def load_bdforet(shapefile: str) -> gpd.GeoDataFrame:
    """Charge la BD Forêt V2 et ne garde que le boisement réel.

    La V2 est en UTF-8 — contrairement à la V1, qui est en Latin-1. Se tromper ne lève pas
    d'erreur ici : on obtient des essences aux noms mal décodés qui ne correspondent plus à
    aucune entrée de HOSTS, donc des mailles sans hôte, silencieusement.
    """
    frame = gpd.read_file(shapefile, encoding="utf-8")
    frame = frame[frame["CODE_TFV"].map(is_forest)].copy()

    # Une essence absente de HOSTS ne lève rien : elle produit juste des mailles sans hôte, qui
    # scoreront zéro sans qu'on sache pourquoi. Le pin d'Alep, qui domine les garrigues audoises
    # et porte le lactaire délicieux, était passé à travers exactement comme ça.
    unknown = sorted(set(frame["ESSENCE"].dropna().unique()) - set(HOSTS))
    if unknown:
        warnings.warn(
            f"essences absentes de HOSTS, traitées comme sans hôte : {', '.join(unknown)}",
            stacklevel=2,
        )

    return frame.to_crs(CRS_L93)


def cell_attributes(cells: gpd.GeoDataFrame, forest: gpd.GeoDataFrame) -> pd.DataFrame:
    """Essence dominante, part boisée et distance à la lisière, par maille.

    Tout se calcule en Lambert 93 : en degrés, une surface et une distance n'ont pas de sens.
    """
    cells = cells.to_crs(CRS_L93)
    cells["cell_area"] = cells.geometry.area

    pieces = gpd.overlay(
        cells[["h3_index", "geometry"]],
        forest[["CODE_TFV", "ESSENCE", "geometry"]],
        how="intersection",
    )
    pieces["area"] = pieces.geometry.area

    by_type = pieces.groupby(["h3_index", "CODE_TFV", "ESSENCE"], as_index=False)["area"].sum()
    dominant = by_type.sort_values("area").groupby("h3_index").tail(1)
    dominant = dominant.rename(columns={"CODE_TFV": "forest_code", "ESSENCE": "essence"})

    wooded = by_type.groupby("h3_index", as_index=False)["area"].sum()
    wooded = wooded.rename(columns={"area": "wooded_area"})

    out = (
        cells[["h3_index", "cell_area"]]
        .merge(dominant[["h3_index", "forest_code", "essence"]], on="h3_index", how="left")
        .merge(wooded, on="h3_index", how="left")
    )
    out["wooded_area"] = out["wooded_area"].fillna(0.0)
    out["forest_share"] = (out["wooded_area"] / out["cell_area"]).clip(0, 1)

    # Jetons d'hôte de la maille, dérivés de l'essence dominante. Stockés en clair pour que le
    # moteur de scoring n'ait pas à reproduire cette table de correspondance.
    out["hosts"] = out["essence"].map(lambda e: list(hosts_for(e)))

    # Distance du centroïde à la lisière la plus proche. On mesure jusqu'à la FRONTIÈRE du
    # boisement : la valeur est ainsi parlante des deux côtés — une maille en pleine forêt est
    # loin de sa lisière, une maille en plaine est loin d'une forêt. La bande de lisière est la
    # zone la plus productive pour les bolets.
    edges = forest.dissolve().boundary.union_all()
    centroids = cells.geometry.centroid
    out["dist_edge_m"] = centroids.distance(edges).to_numpy()

    return out[["h3_index", "forest_code", "essence", "hosts", "forest_share", "dist_edge_m"]]
