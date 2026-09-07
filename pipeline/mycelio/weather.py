"""Météo, depuis Open-Meteo (CC-BY 4.0, sans clé).

On n'interroge PAS une fois par maille. La météo n'a aucune structure fine à l'échelle de
280 m : le modèle sous-jacent a une maille de quelques kilomètres, et 86 000 requêtes
renverraient 86 000 fois la même chose. On échantillonne donc une grille dont le pas est calé
sur la résolution réellement mesurée du modèle (voir GRID_STEP), et chaque maille reprend le
point le plus proche.

Ce qui déclenche la fructification n'est pas la pluie elle-même : c'est le passage de
l'humidité dans l'horizon 7–28 cm, associé à une chute d'amplitude thermique nocturne. D'où le
délai de 12 à 20 jours, et d'où le fait qu'on récupère l'historique et pas seulement la
prévision.
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass

import httpx
import numpy as np
import pandas as pd

API = "https://api.open-meteo.com/v1/forecast"

# Pas de la grille d'interrogation, en degrés.
#
# Mesuré plutôt que supposé, sur un transect est-ouest de la Montagne Noire : sept points
# espacés de 0,05° rendent QUATRE cumuls de pluie distincts. Le champ de précipitation a donc
# bien une structure sous les 11 km d'un pas de 0,1°, et l'échantillonner à 0,1° la moyennait —
# ce qui compte dans un relief où l'orage s'accroche à un versant et laisse le suivant sec.
#
# L'humidité du sol, elle, ne rend que trois valeurs distinctes sur les mêmes 30 km : elle vient
# d'un modèle plus grossier. On ne gagne rien à l'échantillonner plus fin, mais rien ne se perd
# non plus — c'est la même requête.
#
# 943 points au lieu de 270 sur les trois départements, soit dix requêtes au lieu de trois. Le
# palier gratuit d'Open-Meteo en autorise 10 000 par jour ; c'est le temps d'exécution du cron
# qui borne, pas le quota. Descendre à 0,025° demanderait 34 requêtes pour une résolution que le
# modèle n'a pas.
GRID_STEP = 0.05

# Open-Meteo accepte plusieurs coordonnées par requête, mais pas des centaines. Le quota se
# compte en « poids » — points × variables × jours — et non en requêtes : des blocs plus petits
# passent mieux qu'un gros, à volume total égal.
CHUNK = 60

# Le quota est MINUTIER, et son dépassement rend un 429 sec : « Minutely API request limit
# exceeded. Please try again in one minute. » Le pipeline n'avait aucune reprise — un 429
# remontait jusqu'en haut, marquait le run en échec dans `forecast_runs`, et la carte gardait
# les scores de la veille sans que rien ne le dise. Sur trois requêtes le risque était faible ;
# sur seize il devient certain à la première minute chargée.
RETRIES = 4
COOLDOWN = 65.0

DAILY = ["precipitation_sum", "temperature_2m_max", "temperature_2m_min", "weathercode"]
HOURLY = ["soil_temperature_7_to_28cm", "soil_moisture_7_to_28cm"]


@dataclass
class WeatherGrid:
    """Séries météo journalières, indexées par point de grille."""

    points: np.ndarray  # (n, 2) latitude, longitude
    dates: pd.DatetimeIndex
    rain: np.ndarray  # (n, jours) mm
    soil_temp: np.ndarray  # (n, jours) °C, horizon 7–28 cm
    soil_moisture: np.ndarray  # (n, jours) m³/m³
    amplitude: np.ndarray  # (n, jours) °C, écart max–min
    tmin: np.ndarray  # (n, jours) °C
    tmax: np.ndarray  # (n, jours) °C
    # Code WMO du temps sensible (0 = ciel clair, 1-3 = nuageux, 51+ = précipitations…) — c'est
    # la seule variable d'Open-Meteo qui distingue le ciel voilé de la pluie ; on ne l'invente
    # pas depuis les précipitations, qui ne disent rien du couvert nuageux sans pluie.
    weather_code: np.ndarray  # (n, jours)

    def index_of(self, date: pd.Timestamp) -> int:
        return int(self.dates.get_loc(date.normalize()))


def _grid_points(lats: np.ndarray, lngs: np.ndarray) -> np.ndarray:
    """Points d'interrogation : les centres de grille effectivement couverts par des mailles."""
    keys = {
        (round(lat / GRID_STEP) * GRID_STEP, round(lng / GRID_STEP) * GRID_STEP)
        for lat, lng in zip(lats, lngs, strict=True)
    }
    return np.array(sorted(keys), dtype="float64")


def _get(params: dict[str, str]) -> object:
    """Une requête, avec attente et reprise sur dépassement de quota.

    Seul le 429 est repris, et par une attente franche d'une minute : c'est ce que répond
    l'API elle-même, et un repli exponentiel plus court ne ferait que consommer le quota de la
    minute suivante. Toute autre erreur remonte — un 400 sur un nom de variable ne s'arrange pas
    en attendant.
    """
    for attempt in range(RETRIES):
        response = httpx.get(API, params=params, timeout=180.0)
        if response.status_code != 429:
            response.raise_for_status()
            return response.json()
        if attempt < RETRIES - 1:
            print(f"  quota Open-Meteo atteint, reprise dans {COOLDOWN:.0f}s")
            time.sleep(COOLDOWN)
    response.raise_for_status()
    raise RuntimeError("quota Open-Meteo dépassé après plusieurs reprises")


def fetch(lats: np.ndarray, lngs: np.ndarray, past_days: int, forecast_days: int) -> WeatherGrid:
    points = _grid_points(lats, lngs)

    rain_rows, temp_rows, moist_rows, amp_rows = [], [], [], []
    tmin_rows, tmax_rows, code_rows = [], [], []
    dates: pd.DatetimeIndex | None = None

    for start in range(0, len(points), CHUNK):
        # Un souffle entre les blocs : le quota se reconstitue en continu, et les enchaîner sans
        # pause suffit à le saturer là où deux secondes d'écart passent sans encombre.
        if start:
            time.sleep(2.0)
        block = points[start : start + CHUNK]
        params = {
            "latitude": ",".join(f"{lat:.4f}" for lat, _ in block),
            "longitude": ",".join(f"{lng:.4f}" for _, lng in block),
            "daily": ",".join(DAILY),
            "hourly": ",".join(HOURLY),
            "past_days": str(past_days),
            "forecast_days": str(forecast_days),
            "timezone": "Europe/Paris",
        }
        payload = _get(params)
        # Une coordonnée unique renvoie un objet, plusieurs renvoient une liste.
        blocks = payload if isinstance(payload, list) else [payload]

        for item in blocks:
            daily = item["daily"]
            if dates is None:
                dates = pd.DatetimeIndex(pd.to_datetime(daily["time"]))

            rain_rows.append(np.array(daily["precipitation_sum"], dtype="float64"))
            tmax = np.array(daily["temperature_2m_max"], dtype="float64")
            tmin = np.array(daily["temperature_2m_min"], dtype="float64")
            amp_rows.append(tmax - tmin)
            tmax_rows.append(tmax)
            tmin_rows.append(tmin)
            code_rows.append(np.array(daily["weathercode"], dtype="float64"))

            # Les variables de sol sont horaires : on les ramène à une moyenne journalière.
            hourly = item["hourly"]
            hours = pd.DatetimeIndex(pd.to_datetime(hourly["time"]))
            frame = pd.DataFrame(
                {
                    "t": np.array(hourly["soil_temperature_7_to_28cm"], dtype="float64"),
                    "m": np.array(hourly["soil_moisture_7_to_28cm"], dtype="float64"),
                },
                index=hours,
            )
            per_day = frame.groupby(frame.index.date).mean()
            per_day.index = pd.DatetimeIndex(per_day.index)
            aligned = per_day.reindex(dates)
            temp_rows.append(aligned["t"].to_numpy())
            moist_rows.append(aligned["m"].to_numpy())

    assert dates is not None
    return WeatherGrid(
        points=points,
        dates=dates,
        rain=np.nan_to_num(np.vstack(rain_rows)),
        soil_temp=np.vstack(temp_rows),
        soil_moisture=np.vstack(moist_rows),
        amplitude=np.vstack(amp_rows),
        tmin=np.vstack(tmin_rows),
        tmax=np.vstack(tmax_rows),
        weather_code=np.vstack(code_rows),
    )


def nearest_point(grid: WeatherGrid, lats: np.ndarray, lngs: np.ndarray) -> np.ndarray:
    """Associe chaque maille au point de grille le plus proche.

    Distance euclidienne sur les degrés, corrigée du cosinus de la latitude : à 43° de latitude,
    un degré de longitude vaut environ 0,73 degré de latitude. Sans cette correction, on
    choisirait parfois un point plus à l'est plutôt que le vrai plus proche.
    """
    scale = math.cos(math.radians(float(np.mean(lats))))
    grid_lat = grid.points[:, 0][None, :]
    grid_lng = grid.points[:, 1][None, :]
    d2 = (lats[:, None] - grid_lat) ** 2 + ((lngs[:, None] - grid_lng) * scale) ** 2
    return np.argmin(d2, axis=1)


def _pg_array(values: np.ndarray, fmt: str = "g") -> str:
    return "{" + ",".join(f"{v:{fmt}}" for v in values) + "}"


def to_rows(grid: WeatherGrid, run_id: str, start: pd.Timestamp, horizon: int) -> pd.DataFrame:
    """Une ligne par point de grille, prête pour un COPY dans `public.weather_grid`.

    Un seul point de grille couvre plusieurs milliers d'hexagones (voir le docstring du module) :
    on n'exporte donc jamais la météo à la résolution des mailles, seulement à celle, honnête, de
    la grille d'interrogation. C'est à la fenêtre de carte, côté serveur, de prendre le point le
    plus proche de ce qu'elle regarde.
    """
    indices = [grid.index_of(start + pd.Timedelta(days=offset)) for offset in range(horizon + 1)]

    rain = np.round(grid.rain[:, indices], 1)
    tmin = np.round(grid.tmin[:, indices], 1)
    tmax = np.round(grid.tmax[:, indices], 1)
    moisture = np.round(grid.soil_moisture[:, indices], 3)
    code = np.nan_to_num(grid.weather_code[:, indices]).astype(int)

    return pd.DataFrame(
        {
            "lng": grid.points[:, 1],
            "lat": grid.points[:, 0],
            "rain_mm": [_pg_array(row) for row in rain],
            "tmin_c": [_pg_array(row) for row in tmin],
            "tmax_c": [_pg_array(row) for row in tmax],
            "soil_moisture": [_pg_array(row, fmt=".3f") for row in moisture],
            "weather_code": [_pg_array(row, fmt="d") for row in code],
            "run_id": run_id,
        }
    )
