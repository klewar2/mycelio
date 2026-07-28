"""Météo, depuis Open-Meteo (CC-BY 4.0, sans clé).

On n'interroge PAS une fois par maille. La météo n'a aucune structure fine à l'échelle de
740 m : le modèle sous-jacent a une maille de plusieurs kilomètres, et 13 000 requêtes
renverraient 13 000 fois la même chose. On échantillonne donc une grille de 0,1° — une
trentaine de kilomètres carrés par point, soit quelques centaines de points pour l'emprise —
et chaque maille reprend le point le plus proche.

Ce qui déclenche la fructification n'est pas la pluie elle-même : c'est le passage de
l'humidité dans l'horizon 7–28 cm, associé à une chute d'amplitude thermique nocturne. D'où le
délai de 12 à 20 jours, et d'où le fait qu'on récupère l'historique et pas seulement la
prévision.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import httpx
import numpy as np
import pandas as pd

API = "https://api.open-meteo.com/v1/forecast"

# Pas de la grille d'interrogation, en degrés. Plus fin serait du gaspillage : le modèle
# météo lui-même ne descend pas sous quelques kilomètres.
GRID_STEP = 0.1

# Open-Meteo accepte plusieurs coordonnées par requête, mais pas des centaines.
CHUNK = 100

DAILY = ["precipitation_sum", "temperature_2m_max", "temperature_2m_min"]
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

    def index_of(self, date: pd.Timestamp) -> int:
        return int(self.dates.get_loc(date.normalize()))


def _grid_points(lats: np.ndarray, lngs: np.ndarray) -> np.ndarray:
    """Points d'interrogation : les centres de grille effectivement couverts par des mailles."""
    keys = {
        (round(lat / GRID_STEP) * GRID_STEP, round(lng / GRID_STEP) * GRID_STEP)
        for lat, lng in zip(lats, lngs, strict=True)
    }
    return np.array(sorted(keys), dtype="float64")


def fetch(lats: np.ndarray, lngs: np.ndarray, past_days: int, forecast_days: int) -> WeatherGrid:
    points = _grid_points(lats, lngs)

    rain_rows, temp_rows, moist_rows, amp_rows = [], [], [], []
    dates: pd.DatetimeIndex | None = None

    for start in range(0, len(points), CHUNK):
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
        response = httpx.get(API, params=params, timeout=180.0)
        response.raise_for_status()
        payload = response.json()
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
