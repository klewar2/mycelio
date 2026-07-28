"""Configuration du pipeline.

Rien de ce qui décrit l'emprise ou la finesse de la grille n'est écrit ici : ces valeurs vivent
dans `app_settings`, en base, pour que l'application et le pipeline ne puissent pas diverger.
Ce module ne connaît que des chemins et des URL.
"""

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Cache des téléchargements. Volumineux (plusieurs Go), donc hors du dépôt.
DATA = Path(os.environ.get("MYCELIO_DATA", ROOT / "data"))
RAW = DATA / "raw"
WORK = DATA / "work"

# Base locale par défaut : celle que lance `pnpm db:start` à la racine du dépôt.
DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
)

# Contours administratifs, issus d'ADMIN EXPRESS et servis par Etalab. Le point d'entrée
# départemental ne renvoie pas la géométrie : on passe donc par les communes, qu'on fusionne.
GEO_API_COMMUNES = "https://geo.api.gouv.fr/departements/{dept}/communes"

# Projection métrique légale en France métropolitaine. Toute mesure de distance ou de surface
# se fait dedans — en degrés, une distance n'a pas de sens.
CRS_L93 = "EPSG:2154"
CRS_WGS84 = "EPSG:4326"


def ensure_dirs() -> None:
    for path in (RAW, WORK):
        path.mkdir(parents=True, exist_ok=True)
