"""Le modèle sait-il dire QUAND les champignons sortent ?

    uv run python -m mycelio.backtest
    uv run python -m mycelio.backtest --saisons 2023 2024 2025

Confronte la partie temporelle du score — phénologie × météo, c'est-à-dire exactement
`score.temporal_factor`, le calcul du cron — à des observations réelles et datées :
iNaturalist, et Observation.org par l'intermédiaire de GBIF.

Le protocole neutralise l'habitat. Pour chaque observation, on compare le score du jour observé
à celui des autres jours de la saison, AU MÊME ENDROIT : le lieu étant fixé, seul le moment
compte. L'AUC qui en sort est la probabilité qu'un jour de trouvaille batte un jour quelconque
de la saison — 0,5 quand le modèle ne sait rien, 1 s'il ne se trompe jamais.

Les jours témoins ne dépendent pas du modèle : ce sont les jours de l'année où l'espèce est
réellement observée, du 2,5e au 97,5e centile de ses dates d'observation. Les borner par la
saison de la fiche d'espèce aurait rendu invisible l'erreur la plus grossière — une saison mal
placée —, et changé le jeu de test à chaque correction de la fiche.

Ce que ce test ne mesure pas : le « où ». Juger l'habitat demande des absences, que seules les
sorties bredouilles du carnet fourniront (phase 7). Et deux biais connus : on photographie plus
le week-end, et on sort davantage quand le bouche-à-oreille annonce une poussée. Le second est
plutôt bienvenu — c'est précisément le moment qu'on cherche à prévoir.

La météo vient de l'API de prévisions archivées d'Open-Meteo, mêmes modèles que le cron, et
non de la réanalyse ERA5 : on juge le modèle sur les données qu'il reçoit vraiment. Tout est
mis en cache dans `data/raw/backtest`, et seul le premier passage est long.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import sys
import time

import httpx
import numpy as np
import pandas as pd

from . import weather
from .config import RAW, ensure_dirs
from .db import connect
from .score import load_weights, temporal_factor

CACHE = RAW / "backtest"

# Le quart sud-ouest de la France, et non les trois départements. Ceux-ci ne suffisent pas :
# iNaturalist n'y compte que huit cèpes de Bordeaux pour toute la saison 2025. Le mécanisme qui
# déclenche une poussée — pluie, puis sol qui reste frais et tiède — ne change pas entre les
# Landes et la Montagne Noire ; c'est l'habitat qui change, et il n'est pas jugé ici.
BBOX = {"swlat": 42.3, "swlng": -2.0, "nelat": 46.5, "nelng": 4.5}

INAT = "https://api.inaturalist.org/v1"
GBIF = "https://api.gbif.org/v1"
OBSERVATION_ORG = "8a863029-f435-446a-821e-275f4f641165"
ARCHIVE = "https://historical-forecast-api.open-meteo.com/v1/forecast"
ELEVATION = "https://api.open-meteo.com/v1/elevation"

# Au-delà, une observation ne désigne plus un lieu mais une commune.
MAX_UNCERTAINTY_M = 2000

# La météo se demande par cellule de 0,1° : c'est la finesse que le modèle a réellement, et
# trois observations du même massif partagent ainsi une seule requête.
CELL = 0.1

# Sous ce nombre d'observations, l'intervalle de confiance couvre tout et l'AUC ne dit rien.
MIN_OBSERVATIONS = 30


def _cached(url: str, params: dict, *, pause: float = 1.0) -> object:
    """GET mis en cache sur disque, clé = URL et paramètres.

    Les observations d'une saison close ne bougent plus, et la météo archivée non plus : rien
    ne justifie de redemander. La pause ménage iNaturalist, qui demande une requête par seconde.
    """
    ensure_dirs()
    CACHE.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha1(json.dumps([url, params], sort_keys=True).encode()).hexdigest()[:20]
    target = CACHE / f"{key}.json"
    if target.exists():
        return json.loads(target.read_text())

    if url.startswith(("https://historical-forecast-api", ELEVATION)):
        payload = weather.get(params, api=url)
    else:
        for attempt in range(5):
            try:
                response = httpx.get(url, params=params, timeout=60.0)
                response.raise_for_status()
                payload = response.json()
                break
            except (httpx.TransportError, httpx.HTTPStatusError) as error:
                if attempt == 4:
                    raise
                print(f"  {url} : {error}, reprise")
                time.sleep(5.0 * (attempt + 1))
        time.sleep(pause)

    target.write_text(json.dumps(payload))
    return payload


def _inat_taxon(name: str) -> int | None:
    payload = _cached(f"{INAT}/taxa", {"q": name, "rank": "species", "per_page": 5})
    for taxon in payload["results"]:
        if taxon["name"].lower() == name.lower():
            return taxon["id"]
    return None


def _gbif_taxon(name: str) -> int | None:
    payload = _cached(f"{GBIF}/species/match", {"name": name}, pause=0)
    return payload.get("usageKey") if payload.get("rank") == "SPECIES" else None


def observations(name: str, seasons: list[int]) -> pd.DataFrame:
    """Observations datées et précises d'une espèce, dédoublonnées entre les deux sources."""
    rows: list[dict] = []

    taxon = _inat_taxon(name)
    for year in seasons if taxon else []:
        page = 1
        while True:
            payload = _cached(
                f"{INAT}/observations",
                {
                    "taxon_id": taxon,
                    "d1": f"{year}-01-01",
                    "d2": f"{year}-12-31",
                    "acc_below": MAX_UNCERTAINTY_M,
                    "per_page": 200,
                    "page": page,
                    "order_by": "id",
                    **BBOX,
                },
            )
            for item in payload["results"]:
                # Une position floutée par l'observateur est décalée de plusieurs kilomètres.
                if item.get("obscured") or not item.get("observed_on") or not item.get("geojson"):
                    continue
                lng, lat = item["geojson"]["coordinates"]
                rows.append({"date": item["observed_on"], "lat": lat, "lng": lng})
            if page * 200 >= payload["total_results"]:
                break
            page += 1

    key = _gbif_taxon(name)
    if key:
        offset = 0
        while True:
            payload = _cached(
                f"{GBIF}/occurrence/search",
                {
                    "taxonKey": key,
                    "datasetKey": OBSERVATION_ORG,
                    "decimalLatitude": f"{BBOX['swlat']},{BBOX['nelat']}",
                    "decimalLongitude": f"{BBOX['swlng']},{BBOX['nelng']}",
                    "eventDate": f"{min(seasons)}-01-01,{max(seasons)}-12-31",
                    "hasCoordinate": "true",
                    "limit": 300,
                    "offset": offset,
                },
                pause=0,
            )
            for item in payload["results"]:
                if (item.get("coordinateUncertaintyInMeters") or 0) > MAX_UNCERTAINTY_M:
                    continue
                if not item.get("eventDate"):
                    continue
                rows.append(
                    {
                        "date": item["eventDate"][:10],
                        "lat": item["decimalLatitude"],
                        "lng": item["decimalLongitude"],
                    }
                )
            if payload["endOfRecords"]:
                break
            offset += 300

    frame = pd.DataFrame(rows, columns=["date", "lat", "lng"])
    frame["date"] = pd.to_datetime(frame["date"], errors="coerce")
    frame = frame.dropna(subset=["date"])
    frame = frame[frame["date"].dt.year.isin(seasons)]
    # La même trouvaille publiée sur les deux plateformes ne compte qu'une fois.
    keys = zip(frame.lat.round(2), frame.lng.round(2), frame.date, strict=True)
    frame = frame.assign(_k=list(keys))
    return frame.drop_duplicates("_k").drop(columns="_k").reset_index(drop=True)


def _elevations(frame: pd.DataFrame) -> np.ndarray:
    """Altitude de chaque observation : la phénologie s'en sert, comme de celle des mailles."""
    out: list[float] = []
    for start in range(0, len(frame), 100):
        block = frame.iloc[start : start + 100]
        payload = _cached(
            ELEVATION,
            {
                "latitude": ",".join(f"{v:.4f}" for v in block.lat),
                "longitude": ",".join(f"{v:.4f}" for v in block.lng),
            },
        )
        out.extend(payload["elevation"])
    return np.array(out, dtype="float64")


def _weather(
    cells: list[tuple[float, float]], first: dt.date, last: dt.date
) -> list[weather.WeatherGrid]:
    """Une série par cellule, ramenée à la forme que consomme le cron."""
    grids: list[weather.WeatherGrid] = []
    for start in range(0, len(cells), 8):
        block = cells[start : start + 8]
        payload = _cached(
            ARCHIVE,
            {
                "latitude": ",".join(f"{lat:.2f}" for lat, _ in block),
                "longitude": ",".join(f"{lng:.2f}" for _, lng in block),
                "start_date": first.isoformat(),
                "end_date": last.isoformat(),
                "daily": ",".join(weather.DAILY),
                "hourly": ",".join(weather.HOURLY),
                "timezone": "Europe/Paris",
            },
        )
        for (lat, lng), item in zip(
            block, payload if isinstance(payload, list) else [payload], strict=True
        ):
            daily, hourly = item["daily"], item["hourly"]
            dates = pd.DatetimeIndex(pd.to_datetime(daily["time"]))
            soil = pd.DataFrame(
                {
                    "t": np.array(hourly["soil_temperature_7_to_28cm"], dtype="float64"),
                    "m": np.array(hourly["soil_moisture_7_to_28cm"], dtype="float64"),
                },
                index=pd.DatetimeIndex(pd.to_datetime(hourly["time"])),
            )
            per_day = soil.groupby(soil.index.date).mean()
            per_day.index = pd.DatetimeIndex(per_day.index)
            per_day = per_day.reindex(dates)
            tmax = np.array(daily["temperature_2m_max"], dtype="float64")
            tmin = np.array(daily["temperature_2m_min"], dtype="float64")
            grids.append(
                weather.WeatherGrid(
                    points=np.array([[lat, lng]]),
                    dates=dates,
                    rain=np.nan_to_num(np.array([daily["precipitation_sum"]], dtype="float64")),
                    soil_temp=per_day["t"].to_numpy()[None, :],
                    soil_moisture=per_day["m"].to_numpy()[None, :],
                    amplitude=(tmax - tmin)[None, :],
                    tmin=tmin[None, :],
                    tmax=tmax[None, :],
                    weather_code=np.array([daily["weathercode"]], dtype="float64"),
                )
            )
    return grids


def species_auc(sp: pd.Series, weights, seasons: list[int]) -> dict | None:
    obs = observations(sp["scientific_name"], seasons)
    if len(obs) < MIN_OBSERVATIONS:
        return {"n": len(obs)}

    # Les jours témoins : la période où l'espèce est réellement observée (voir le docstring).
    doy = obs.date.dt.dayofyear
    lo, hi = np.percentile(doy, [2.5, 97.5]).astype(int)
    obs = obs[(doy >= lo) & (doy <= hi)].reset_index(drop=True)
    obs["alt"] = _elevations(obs)
    obs["clat"] = (obs.lat / CELL).round() * CELL
    obs["clng"] = (obs.lng / CELL).round() * CELL
    obs["year"] = obs.date.dt.year

    # Assez d'historique avant le premier jour témoin pour le délai et la fenêtre de pluie.
    history = int(sp["rain_lag_days"] or 14) + weights.rain_window_days + 5

    ranks: list[float] = []
    for year, group in obs.groupby("year"):
        first = dt.date(year, 1, 1) + dt.timedelta(days=int(lo) - 1 - history)
        last = min(dt.date(year, 1, 1) + dt.timedelta(days=int(hi) - 1), dt.date(year, 12, 31))
        cells = sorted(set(zip(group.clat.round(2), group.clng.round(2), strict=True)))
        for (clat, clng), grid in zip(cells, _weather(cells, first, last), strict=True):
            here = group[(group.clat.round(2) == clat) & (group.clng.round(2) == clng)]
            days = [
                i for i, d in enumerate(grid.dates) if d.year == year and lo <= d.dayofyear <= hi
            ]
            altitude = here.alt.to_numpy()
            assign = np.zeros(len(here), dtype=int)
            # Une ligne par jour témoin, une colonne par observation de la cellule : chaque
            # observation est jugée à sa propre altitude.
            scores = np.vstack(
                [temporal_factor(sp, weights, grid, d, altitude, assign) for d in days]
            )
            dates = grid.dates[days]
            for column, when in enumerate(here.date):
                hit = np.flatnonzero(dates == when)
                if not len(hit):
                    continue
                observed = scores[hit[0], column]
                others = np.delete(scores[:, column], hit[0])
                ranks.append(float((others < observed).mean() + 0.5 * (others == observed).mean()))

    ranks_arr = np.array(ranks)
    rng = np.random.default_rng(0)
    boot = [rng.choice(ranks_arr, len(ranks_arr)).mean() for _ in range(2000)]
    return {
        "n": len(ranks_arr),
        "auc": float(ranks_arr.mean()),
        "low": float(np.percentile(boot, 2.5)),
        "high": float(np.percentile(boot, 97.5)),
        "ranks": ranks_arr,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Juge la partie temporelle du scoring")
    this_year = dt.date.today().year
    parser.add_argument(
        "--saisons",
        type=int,
        nargs="+",
        # Les saisons closes seulement : une saison en cours n'a pas fini d'être observée.
        default=list(range(this_year - 4, this_year)),
    )
    parser.add_argument("--especes", nargs="+", help="slugs à juger — toutes par défaut")
    args = parser.parse_args(argv)

    with connect() as conn:
        species = pd.read_sql(
            "select * from public.species where is_enabled order by sort_order", conn
        )
    if args.especes:
        species = species[species["slug"].isin(args.especes)]
    weights = load_weights()

    print(f"Saisons {', '.join(map(str, args.saisons))} — quart sud-ouest de la France\n")
    pooled: list[np.ndarray] = []
    for _, sp in species.iterrows():
        try:
            result = species_auc(sp, weights, args.saisons)
        except httpx.HTTPStatusError as error:
            # Le quota d'Open-Meteo est horaire autant que minutier : sur un premier passage,
            # on l'épuise. Ce qui a été téléchargé reste en cache, et relancer reprend là.
            if error.response.status_code != 429:
                raise
            print(
                f"\nQuota Open-Meteo épuisé avant « {sp['common_name_fr']} » : relancer plus tard."
            )
            break
        label = f"{sp['common_name_fr']} ({sp['scientific_name']})"
        if "auc" not in result:
            print(f"{label:<48} trop peu d'observations ({result['n']})")
            continue
        pooled.append(result["ranks"])
        print(
            f"{label:<48} AUC {result['auc']:.3f}  "
            f"[{result['low']:.3f}–{result['high']:.3f}]  n={result['n']}"
        )

    if pooled:
        everything = np.concatenate(pooled)
        rng = np.random.default_rng(0)
        boot = [rng.choice(everything, len(everything)).mean() for _ in range(2000)]
        print(
            f"\n{'Toutes espèces':<48} AUC {everything.mean():.3f}  "
            f"[{np.percentile(boot, 2.5):.3f}–{np.percentile(boot, 97.5):.3f}]  "
            f"n={len(everything)}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
