"""Assemblage des couches et chargement dans `cells`.

Le chargement passe par COPY et non par des INSERT : sur des dizaines de milliers de lignes, la
différence n'est pas de quelques pour cent mais d'un ordre de grandeur.
"""

from __future__ import annotations

import io

import h3
import pandas as pd

from .db import connect

COLUMNS = [
    "h3_index",
    "h3_r7",
    "dept",
    "lat",
    "lng",
    "alt_m",
    "slope_pct",
    "northness",
    "eastness",
    "twi",
    "tpi",
    "curvature",
    "solar_index",
    "forest_code",
    "essence",
    "hosts",
    "forest_share",
    "dist_edge_m",
    "dist_stream_m",
    "dist_path_m",
    "soil_ph",
    "soil_clay_pct",
    "soil_soc",
    "restricted",
    "restriction",
]


def assemble(
    dept: str,
    forest: pd.DataFrame,
    terrain: pd.DataFrame,
    soil: pd.DataFrame,
    hydro: pd.DataFrame,
    protected: pd.DataFrame,
    min_forest_share: float,
) -> pd.DataFrame:
    """Joint les couches et ne garde que les mailles réellement boisées.

    Le filtre sur la part boisée n'est pas une optimisation de volume : une maille sans hôte
    mycorhizien a un score structurellement nul, et l'afficher reviendrait à teinter la carte
    là où il n'y a rien à chercher.
    """
    frame = (
        forest.merge(terrain, on="h3_index", how="inner")
        .merge(soil, on="h3_index", how="left")
        .merge(hydro, on="h3_index", how="left")
        .merge(protected, on="h3_index", how="left")
    )
    frame["restricted"] = frame["restricted"].fillna(False).astype(bool)
    frame = frame[frame["forest_share"] >= min_forest_share].copy()

    # Parent en résolution 7 : c'est sur lui que l'API agrège quand la carte est dézoomée,
    # 92 000 hexagones de 280 m étant sous-pixel à l'échelle d'un département.
    frame["h3_r7"] = [h3.cell_to_parent(index, 7) for index in frame["h3_index"]]

    centers = [h3.cell_to_latlng(index) for index in frame["h3_index"]]
    frame["lat"] = [lat for lat, _ in centers]
    frame["lng"] = [lng for _, lng in centers]
    frame["dept"] = dept

    return frame[COLUMNS]


def load(frame: pd.DataFrame, dept: str) -> int:
    """Remplace les mailles du département par celles fournies.

    On supprime puis on recharge, plutôt que de faire un upsert : le pipeline est la seule
    source de la grille, et un rejeu doit produire exactement le même état — y compris quand
    une maille cesse d'être retenue parce que le seuil forestier a changé.
    """
    frame = frame.copy()
    # COPY attend la syntaxe littérale d'un tableau Postgres — {chene,feuillu} — et non la
    # représentation Python d'une liste.
    frame["hosts"] = frame["hosts"].map(lambda v: "{" + ",".join(v or []) + "}")

    buffer = io.StringIO()
    # En format CSV, COPY lit un champ vide non quoté comme NULL — pas \N, qui est la
    # convention du format texte.
    frame.to_csv(buffer, index=False, header=False, na_rep="")
    buffer.seek(0)

    targets = ", ".join(c for c in COLUMNS if c not in ("lat", "lng"))

    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute("delete from public.cells where dept = %s", (dept,))
            cur.execute(
                "create temp table cells_in (like public.cells including defaults) on commit drop"
            )
            cur.execute("alter table cells_in drop column centroid, drop column updated_at")
            cur.execute("alter table cells_in add column lat double precision")
            cur.execute("alter table cells_in add column lng double precision")

            order = ", ".join(COLUMNS)
            with cur.copy(f"copy cells_in ({order}) from stdin with (format csv)") as copy:
                copy.write(buffer.read())

            cur.execute(
                f"""
                insert into public.cells ({targets}, centroid)
                select {targets},
                       extensions.st_setsrid(
                           extensions.st_makepoint(lng, lat), 4326
                       )::extensions.geography
                from cells_in
                """
            )
            inserted = cur.rowcount
        conn.commit()
    return inserted
