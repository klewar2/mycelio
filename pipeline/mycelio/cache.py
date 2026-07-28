"""Cache de téléchargement.

Les sources pèsent plusieurs gigaoctets et les serveurs de l'IGN ne sont pas rapides : rien ne
doit être retéléchargé deux fois. Chaque fichier est identifié par son nom dans `data/raw`, et un
téléchargement interrompu ne laisse jamais de fichier tronqué à sa place définitive.
"""

from __future__ import annotations

from pathlib import Path

import httpx
from tqdm import tqdm

from .config import RAW, ensure_dirs


def fetch(url: str, name: str, *, force: bool = False) -> Path:
    ensure_dirs()
    target = RAW / name

    if target.exists() and not force:
        return target

    # On écrit dans un fichier temporaire puis on renomme : une interruption laisse le cache
    # cohérent, et la reprise ne servira jamais un fichier à moitié écrit.
    tmp = target.with_suffix(target.suffix + ".part")
    tmp.parent.mkdir(parents=True, exist_ok=True)

    with httpx.stream("GET", url, follow_redirects=True, timeout=120.0) as response:
        response.raise_for_status()
        total = int(response.headers.get("content-length", 0))
        with (
            tmp.open("wb") as handle,
            tqdm(
                total=total or None, unit="o", unit_scale=True, desc=name, leave=False
            ) as progress,
        ):
            for chunk in response.iter_bytes(chunk_size=1 << 20):
                handle.write(chunk)
                progress.update(len(chunk))

    tmp.rename(target)
    return target


def fetch_json(url: str, name: str, *, force: bool = False, params: dict | None = None):
    import json

    ensure_dirs()
    target = RAW / name
    if target.exists() and not force:
        return json.loads(target.read_text())

    response = httpx.get(url, params=params, follow_redirects=True, timeout=120.0)
    response.raise_for_status()
    target.write_text(response.text)
    return response.json()
