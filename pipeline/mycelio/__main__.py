"""Exécute le pipeline complet pour un ou plusieurs départements.

    uv run python -m mycelio            # tous les départements de app_settings
    uv run python -m mycelio 31         # un seul

Chaque étape met ses téléchargements en cache : un rejeu ne retélécharge rien et ne recalcule
que ce qui suit. Le MNT et les chemins étant les deux morceaux lents, c'est ce qui rend
l'itération supportable.
"""

from __future__ import annotations

import argparse
import glob
import sys
import time
from pathlib import Path

from . import db, forest, grid, hydro, protected, soil, terrain, upload, zonal
from .config import WORK, ensure_dirs

# Jeux de données IGN, par département.
BDFORET = "BDFORET_2-0__SHP_LAMB93_D{d}_{date}"
BDALTI = "BDALTIV2_2-0_25M_ASC_LAMB93-IGN69_D{d}_{date}"
DOWNLOAD = "https://data.geopf.fr/telechargement/download/{product}/{name}/{name}.7z"

# Les millésimes diffèrent d'un département à l'autre : ils sont donc explicites plutôt que
# devinés. Les compléter au fur et à mesure de l'extension de l'emprise.
VINTAGES: dict[str, dict[str, str]] = {
    "31": {"bdforet": "2019-01-09", "bdalti": "2021-05-12"},
    "81": {"bdforet": "2014-04-01", "bdalti": "2022-07-29"},
    "11": {"bdforet": "2018-11-20", "bdalti": "2023-10-04"},
}


def _extract(archive: Path, destination: Path) -> Path:
    import py7zr

    if not destination.exists():
        destination.mkdir(parents=True, exist_ok=True)
        with py7zr.SevenZipFile(archive) as z:
            z.extractall(destination)
    return destination


def _download(product: str, name: str) -> Path:
    """Télécharge un jeu IGN, en cachant sous son nom complet.

    La clé de cache porte la version ET le millésime, parce qu'ils font partie du nom IGN. Une
    clé plus courte — « bdforet_31 » — resservirait silencieusement l'ancien fichier après un
    changement de version, et la seule alerte serait une erreur d'encodage sans rapport
    apparent. C'est exactement ce qui s'est produit au passage de la V1 à la V2.
    """
    from .cache import fetch

    return fetch(DOWNLOAD.format(product=product, name=name), f"{name}.7z")


def run(dept: str) -> int:
    ensure_dirs()
    vintage = VINTAGES.get(dept)
    if vintage is None:
        raise SystemExit(
            f"millésimes inconnus pour le département {dept} — les ajouter dans VINTAGES"
        )

    resolution = int(db.get_setting("map.h3_resolution"))
    threshold = float(db.get_setting("pipeline.min_forest_share"))

    print(f"\n=== département {dept} — résolution H3 {resolution} ===")

    step = time.time()
    cells = grid.cells_polygons(list(grid.cells_frame(dept, resolution)["h3_index"]))
    print(f"  grille          {len(cells):>6} mailles   {time.time() - step:5.1f}s")

    # --- forêt ---------------------------------------------------------------
    step = time.time()
    name = BDFORET.format(d=dept.zfill(3), date=vintage["bdforet"])
    archive = _download("BDFORET", name)
    root = _extract(archive, WORK / name)
    shp = glob.glob(str(root / "**" / "FORMATION_VEGETALE*.shp"), recursive=True)
    if not shp:
        raise SystemExit(f"aucun shapefile de formation végétale sous {root}")
    forest_attrs = forest.cell_attributes(cells, forest.load_bdforet(shp[0]))
    print(f"  forêt           {len(forest_attrs):>6} mailles   {time.time() - step:5.1f}s")

    # --- terrain -------------------------------------------------------------
    step = time.time()
    name = BDALTI.format(d=dept.zfill(3), date=vintage["bdalti"])
    archive = _download("BDALTI", name)
    root = _extract(archive, WORK / name)
    dem = terrain.build_mosaic(root, WORK / f"dem_{dept}.tif")
    layers = terrain.derivatives(dem)
    layers["twi"] = terrain.wetness_index(dem, layers["_slope_rad"])
    index, order = zonal.build_index(cells, dem)
    terrain_attrs = terrain.standardize(zonal.aggregate(index, order, layers))
    del layers
    print(f"  terrain         {len(terrain_attrs):>6} mailles   {time.time() - step:5.1f}s")

    # --- sol -----------------------------------------------------------------
    step = time.time()
    soil_attrs = soil.sample(cells, soil.download(cells, dept))
    print(f"  sol             {len(soil_attrs):>6} mailles   {time.time() - step:5.1f}s")

    # --- réseaux -------------------------------------------------------------
    step = time.time()
    hydro_attrs = hydro.distances(cells, dept)
    print(f"  eau et chemins  {len(hydro_attrs):>6} mailles   {time.time() - step:5.1f}s")

    # --- espaces protégés ----------------------------------------------------
    step = time.time()
    categories = db.get_setting("pipeline.restricted_categories")
    areas = protected.load_protected(cells, dept, list(categories))
    protected_attrs = protected.mark_restricted(cells, areas)
    masked = int(protected_attrs["restricted"].sum())
    print(
        f"  protégé         {masked:>6} mailles masquées ({len(areas)} espaces)"
        f"   {time.time() - step:5.1f}s"
    )

    # --- assemblage ----------------------------------------------------------
    frame = upload.assemble(
        dept, forest_attrs, terrain_attrs, soil_attrs, hydro_attrs, protected_attrs, threshold
    )
    inserted = upload.load(frame, dept)

    missing = frame.isna().sum()
    missing = missing[missing > 0]
    print(f"  chargé          {inserted:>6} mailles boisées (seuil {threshold:.0%})")
    if len(missing):
        print(f"  incomplet       {dict(missing)}")

    return inserted


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Construit la table cells")
    parser.add_argument(
        "departments",
        nargs="*",
        help="codes INSEE ; par défaut, ceux de app_settings.pipeline_departments",
    )
    args = parser.parse_args(argv)

    targets = args.departments or db.departments()
    total = 0
    for dept in targets:
        total += run(dept)

    print(f"\ntotal : {total} mailles dans public.cells")
    return 0


if __name__ == "__main__":
    sys.exit(main())
