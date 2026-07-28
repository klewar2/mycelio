"""Accès à la base, côté pipeline.

Le pipeline écrit dans `cells` avec les droits du propriétaire (connexion Postgres directe, pas
PostgREST) : il n'est donc pas soumis à la RLS. C'est voulu — c'est le seul composant autorisé à
peupler la grille, et il tourne hors ligne.
"""

from __future__ import annotations

import json
from contextlib import contextmanager
from typing import Any

import psycopg

from .config import DATABASE_URL


@contextmanager
def connect():
    with psycopg.connect(DATABASE_URL) as conn:
        yield conn


def get_setting(key: str, default: Any = None) -> Any:
    """Lit un paramètre applicatif. La base est la seule source de vérité pour l'emprise."""
    with connect() as conn:
        row = conn.execute(
            "select value from public.app_settings where key = %s", (key,)
        ).fetchone()
    if row is None:
        if default is None:
            raise KeyError(f"paramètre absent de app_settings : {key}")
        return default
    return row[0] if not isinstance(row[0], str) else json.loads(row[0])


def departments() -> list[str]:
    return [str(d) for d in get_setting("pipeline.departments")]
