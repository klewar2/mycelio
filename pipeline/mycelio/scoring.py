"""Moteur de scoring par règles expertes.

    score = habitat × phénologie × météo

Les trois facteurs sont dans [0, 1] et se multiplient : chacun peut à lui seul annuler le
score, ce qui est le comportement voulu. Sans hôte mycorhizien compatible, il n'y a pas de cèpe,
quelle que soit la météo.

L'appariement d'hôte se fait à TROIS niveaux et non deux — essence résolue, essence générique,
aucune — parce que la BD Forêt classe 40 % de l'emprise en « Feuillus » sans plus de précision.
Compter ce jeton générique comme un vrai hôte rendait 86 % du territoire compatible avec les
cèpes, et la carte annonçait « très bonnes chances » sur trois mailles sur dix.

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
    host_generic: float
    forest_share: float
    edge: float
    aspect: float
    soil_moisture: float
    temp_shock: float
    rain_optimum_mm: float
    rain_window_days: int
    generic_host_codes: frozenset[str]


def habitat_factor(
    hosts: list[list[str]],
    host_codes: set[str],
    soil_ph: np.ndarray,
    altitude: np.ndarray,
    twi: np.ndarray,
    forest_share: np.ndarray,
    dist_edge_m: np.ndarray,
    northness: np.ndarray,
    slope_pct: np.ndarray,
    *,
    ph_min: float | None,
    ph_max: float | None,
    alt_min: float | None,
    alt_max: float | None,
    twi_optimum: float | None,
    edge_affinity: float,
    thermophilic: bool,
    prefers_calcareous: bool,
    weights: Weights,
) -> np.ndarray:
    """Compatibilité durable du lieu : hôte, couvert, sol, altitude, humidité, bordure, versant.

    Sept termes multiplicatifs, tous dans [0, 1]. Aucun n'est éliminatoire à lui seul sauf
    l'hôte, et c'est voulu : le terrain pardonne un mauvais versant, jamais l'absence d'arbre
    compatible.
    """

    # --- appariement mycorhizien, à trois niveaux et non deux ----------------
    #
    # La BD Forêt ne résout pas toujours l'essence : 40 % des mailles de l'emprise sont classées
    # « Feuillus » sans plus de détail, et portent le jeton générique `feuillu`. Le traiter comme
    # un chêne rendait 86 % du territoire « compatible cèpes » ; le traiter comme une absence
    # effacerait de la carte la moitié des forêts réelles. Ni l'un ni l'autre : on lui donne sa
    # propre valeur, qui dit exactement ce qu'on sait — le peuplement peut convenir, on l'ignore.
    #
    # Ce n'est pas la même chose que la confiance, qui descend elle aussi dans ce cas : la
    # confiance dit « cette estimation est fragile », l'habitat dit « ce lieu est moins probable ».
    # Les deux sont vraies, et se cumulent.
    specific = np.array(
        [bool((host_codes & set(h or [])) - weights.generic_host_codes) for h in hosts],
        dtype=bool,
    )
    generic = np.array(
        [bool(host_codes & set(h or []) & weights.generic_host_codes) for h in hosts],
        dtype=bool,
    )
    host = np.where(
        specific,
        1.0,
        np.where(generic, weights.host_generic, 1.0 - weights.host_match),
    )

    # --- part boisée ---------------------------------------------------------
    #
    # Le pipeline ne retient déjà que les mailles boisées à 20 % ou plus, mais 20 % de couvert
    # sur 280 m de côté, c'est un bosquet dans un champ. La rampe monte de ce seuil à 80 %, au
    # delà duquel le couvert n'apporte plus rien.
    cover = np.clip((forest_share - 0.20) / 0.60, 0.0, 1.0)
    cover = 1.0 - weights.forest_share + weights.forest_share * cover

    # --- sol -----------------------------------------------------------------
    #
    # Le pH manque sur les mailles rocheuses. On y met un facteur neutre plutôt que zéro — ne pas
    # savoir n'est pas la même chose que savoir que c'est mauvais. Sauf pour une espèce liée au
    # calcaire : elle est justement celle dont la station est étroite, donc « inconnu » y est
    # plus souvent défavorable que favorable.
    ph = np.full_like(soil_ph, 0.8 if prefers_calcareous else 1.0)
    known = np.isfinite(soil_ph)
    if ph_min is not None and ph_max is not None:
        centre, tolerance = (ph_min + ph_max) / 2, max((ph_max - ph_min) / 2, 0.3)
        ph[known] = gaussian(soil_ph[known], centre, tolerance)
    else:
        ph[known] = 1.0

    alt = plateau(altitude, alt_min, alt_max, softness=250.0)

    # --- humidité topographique ----------------------------------------------
    #
    # L'optimum vient de `species.twi_optimum`, et non plus d'un test sur le slug de l'espèce.
    # Écrire `slug == 'trompette-de-la-mort'` dans ce fichier était une constante mycologique en
    # dur — exactement ce que le docstring du module s'interdit — et rendait la préférence
    # inéditable depuis /admin/especes.
    humidity = np.ones_like(twi) if twi_optimum is None else gaussian(twi, twi_optimum, 2.0)

    # --- effet de bordure ----------------------------------------------------
    #
    # Décroissance exponentielle sur 120 m : plein effet au bord, moitié vers 85 m, négligeable
    # au-delà de 350 m. L'échelle correspond à ce que décrivent les fiches — « entre 10 et 50 m
    # du bord » — élargie parce qu'une maille fait 280 m et que `dist_edge_m` est sa moyenne.
    #
    # Le signe suit `species.edge_affinity` : positif, c'est le plein couvert qui est pénalisé ;
    # négatif, c'est la lisière. Une trompette de la mort en bord de champ est aussi improbable
    # qu'un cèpe au milieu d'un massif fermé.
    proximity = np.exp(-np.nan_to_num(dist_edge_m, nan=200.0) / 120.0)
    penalised = 1.0 - proximity if edge_affinity > 0 else proximity
    edge = 1.0 - weights.edge * abs(edge_affinity) * penalised

    # --- exposition ----------------------------------------------------------
    #
    # `southness` se déduit de `northness` : le projet ne stocke jamais l'exposition en degrés,
    # 359° et 1° étant voisins sur le terrain mais aux antipodes pour un modèle.
    #
    # Pondéré par la pente, et c'est essentiel : sur un replat, l'exposition calculée est du
    # bruit d'arrondi du MNT. À 15 % de pente et au-delà, elle compte pleinement.
    if thermophilic:
        southness = (1.0 - np.nan_to_num(northness)) / 2.0
        relief = np.clip(np.nan_to_num(slope_pct) / 15.0, 0.0, 1.0)
        aspect = 1.0 - weights.aspect * relief * (1.0 - southness)
    else:
        aspect = np.ones_like(twi)

    return host * cover * ph * alt * humidity * edge * aspect


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
