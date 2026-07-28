"""Moteur de scoring par règles expertes.

    score = habitat × phénologie × météo

Les trois facteurs sont dans [0, 1] et se multiplient : chacun peut à lui seul annuler le
score, ce qui est le comportement voulu. Sans hôte mycorhizien compatible, il n'y a pas de cèpe,
quelle que soit la météo — et ce seul facteur élimine 60 à 70 % de la carte, ce qui rend le
résultat immédiatement crédible.

Tous les paramètres viennent de `species` et d'`app_settings`. Aucune constante mycologique
n'est écrite ici : ce fichier ne contient que des formes de courbes.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


def gaussian(values: np.ndarray, optimum: float, tolerance: float) -> np.ndarray:
    """Cloche centrée sur l'optimum. Vaut 1 à l'optimum, décroît symétriquement."""
    if tolerance <= 0:
        return np.ones_like(values)
    return np.exp(-0.5 * ((values - optimum) / tolerance) ** 2)


def plateau(
    values: np.ndarray, low: float | None, high: float | None, softness: float
) -> np.ndarray:
    """Vaut 1 dans l'intervalle, décroît continûment au-delà.

    On évite volontairement un créneau net : une espèce donnée à « 100 à 800 m » ne disparaît
    pas à 801 m. Une frontière brutale produirait des ruptures visibles sur la carte, qui
    n'existent pas sur le terrain.
    """
    out = np.ones_like(values, dtype="float64")
    if low is not None:
        below = values < low
        out[below] = np.exp(-0.5 * ((low - values[below]) / softness) ** 2)
    if high is not None:
        above = values > high
        out[above] = np.exp(-0.5 * ((values[above] - high) / softness) ** 2)
    return out


def season_window(doy: np.ndarray, start: int, end: int, softness: float = 18.0) -> np.ndarray:
    """Fenêtre saisonnière, en jour de l'année, franchissant le nouvel an si besoin.

    Une saison d'octobre à décembre déborde parfois sur janvier : on raisonne donc en distance
    circulaire, sans quoi une espèce tardive s'éteindrait brutalement au 31 décembre.
    """
    length = (end - start) % 365 or 365
    position = (doy - start) % 365
    inside = position <= length
    distance = np.where(inside, 0.0, np.minimum(position - length, 365 - position))
    return np.exp(-0.5 * (distance / softness) ** 2)


@dataclass
class Weights:
    """Poids issus d'app_settings — modifiables depuis /admin/scoring sans redéploiement."""

    host_match: float
    soil_moisture: float
    temp_shock: float
    rain_optimum_mm: float
    rain_window_days: int


def habitat_factor(
    hosts: list[list[str]],
    host_codes: set[str],
    soil_ph: np.ndarray,
    altitude: np.ndarray,
    twi: np.ndarray,
    *,
    ph_min: float | None,
    ph_max: float | None,
    alt_min: float | None,
    alt_max: float | None,
    prefers_humid: bool,
    weights: Weights,
) -> np.ndarray:
    """Compatibilité durable du lieu : hôte, sol, altitude, humidité topographique."""

    # Appariement mycorhizien. Le facteur n'est pas binaire mais quasi : une maille sans hôte
    # compatible tombe à une valeur résiduelle plutôt qu'à zéro strict, parce que la BD Forêt ne
    # retient que l'essence DOMINANTE — un chêne isolé dans une pinède n'y figure pas.
    matched = np.array([bool(host_codes & set(h or [])) for h in hosts], dtype="float64")
    host = np.where(matched > 0, 1.0, 1.0 - weights.host_match)

    # Sol : le pH manque sur les mailles rocheuses. On y met un facteur neutre plutôt que zéro —
    # ne pas savoir n'est pas la même chose que savoir que c'est mauvais.
    ph = np.ones_like(soil_ph)
    known = np.isfinite(soil_ph)
    if ph_min is not None and ph_max is not None:
        centre, tolerance = (ph_min + ph_max) / 2, max((ph_max - ph_min) / 2, 0.3)
        ph[known] = gaussian(soil_ph[known], centre, tolerance)

    alt = plateau(altitude, alt_min, alt_max, softness=250.0)

    # Indice d'humidité topographique : recherché par les trompettes, indifférent ailleurs.
    humidity = gaussian(twi, 9.5, 2.0) if prefers_humid else np.ones_like(twi)

    return host * ph * alt * humidity


def phenology_factor(
    doy: int,
    altitude: np.ndarray,
    soil_temp: np.ndarray,
    *,
    season_start: int | None,
    season_end: int | None,
    temp_opt: float | None,
    temp_tol: float | None,
) -> np.ndarray:
    """Sommes-nous dans la saison, ici et à cette altitude ?"""
    if season_start is None or season_end is None:
        window = np.ones_like(altitude)
    else:
        # Correction d'altitude : environ 7 jours de retard par 100 m au printemps, et autant
        # d'avance à l'automne. On décale donc le jour perçu plutôt que la fenêtre.
        shift = (altitude - 300.0) / 100.0 * 7.0
        perceived = np.full_like(altitude, float(doy)) - shift
        window = season_window(perceived, season_start, season_end)

    if temp_opt is None or temp_tol is None:
        temperature = np.ones_like(altitude)
    else:
        temperature = gaussian(soil_temp, temp_opt, max(temp_tol, 1.0))

    return window * temperature


def weather_factor(
    rain_cumulative: np.ndarray,
    soil_moisture: np.ndarray,
    amplitude: np.ndarray,
    *,
    rain_optimum: float,
    weights: Weights,
) -> np.ndarray:
    """Déclencheur de fructification : pluie utile, sol humide, chute d'amplitude thermique."""

    # Trop peu de pluie ne déclenche rien ; beaucoup trop gorge le sol et arrête la
    # fructification. D'où une cloche et non une fonction croissante.
    rain = gaussian(rain_cumulative, rain_optimum, max(rain_optimum * 0.6, 10.0))

    # Humidité de l'horizon 7–28 cm : c'est elle, et non la pluie tombée, qui commande.
    moisture = np.clip(soil_moisture / 0.30, 0.0, 1.0)
    moisture = 1.0 - weights.soil_moisture + weights.soil_moisture * moisture

    # Chute d'amplitude thermique nocturne : une amplitude resserrée signale des nuits douces et
    # humides, favorables. Une forte amplitude signale un air sec.
    shock = np.clip(1.0 - (amplitude - 6.0) / 14.0, 0.0, 1.0)
    shock = 1.0 - weights.temp_shock + weights.temp_shock * shock

    return rain * moisture * shock


def confidence(
    soil_ph: np.ndarray, matched_host: np.ndarray, forest_share: np.ndarray
) -> np.ndarray:
    """Fiabilité du score, affichée telle quelle.

    Basse quand une donnée manque ou quand l'hôte n'est qu'un feuillu générique. Le cahier des
    charges demande de l'afficher honnêtement plutôt que de la masquer : un score élevé peu
    fiable et un score élevé bien étayé ne se valent pas sur le terrain.
    """
    known_soil = np.where(np.isfinite(soil_ph), 1.0, 0.55)
    host_quality = np.where(matched_host > 0, 1.0, 0.5)
    cover = np.clip(forest_share / 0.6, 0.4, 1.0)
    return np.clip(known_soil * host_quality * cover, 0.0, 1.0)
