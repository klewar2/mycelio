/**
 * Lecture grand public de la météo brute renvoyée par `/api/weather`.
 *
 * Le pipeline stocke des valeurs (mm, °C, m³/m³, code WMO) ; ce module les traduit en ce qu'un
 * cueilleur veut savoir — un pictogramme, un état du sol — sans jamais prétendre à une précision
 * que la donnée n'a pas (voir pipeline/mycelio/weather.py : un point de grille couvre plusieurs
 * kilomètres, la même valeur vaut pour toute la fenêtre de carte).
 */

export type Sky = "sun" | "cloud" | "rain";

export type WeatherSeries = {
  rainMm: number[];
  tminC: number[];
  tmaxC: number[];
  soilMoisture: number[];
  weatherCode: number[];
};

/**
 * Code WMO du temps sensible → pictogramme.
 *
 * Trois pictogrammes seulement : c'est ce qui se distingue d'un coup d'œil dans une barre de
 * 8 jours large de quelques millimètres. Le détail (bruine, orage, neige...) n'y aurait pas sa
 * place ; ceux qui suivent la pluie de près regardent le mm affiché à côté, pas l'icône.
 */
export function skyOf(code: number): Sky {
  if (code >= 51) return "rain";
  if (code >= 2) return "cloud";
  return "sun";
}

/**
 * Humidité du sol (horizon 7–28 cm) → mot.
 *
 * Les seuils reprennent la référence déjà utilisée par le moteur de score : 0,30 m³/m³ y marque
 * le plein bénéfice de l'humidité (voir scoring.weather_factor). En dessous de 0,20, le sol
 * freine la fructification ; entre les deux, il ne la limite ni ne la favorise.
 */
export function soilOf(moisture: number): string {
  if (moisture < 0.2) return "sol sec";
  if (moisture < 0.3) return "sol frais";
  return "sol humide";
}

const SKY_WORDS: Record<Sky, string> = { sun: "grand soleil", cloud: "couvert", rain: "pluie" };

/** Forme dite à l'oral, pour la phrase de contexte du jour affiché. */
export function skyWord(sky: Sky): string {
  return SKY_WORDS[sky];
}

/** Le jour où la barre courante donne la lecture affichée en tête du panneau. */
export function weatherDay(series: WeatherSeries | null, day: number) {
  if (!series) return null;
  const tmin = series.tminC[day];
  const tmax = series.tmaxC[day];
  if (tmin == null || tmax == null) return null;
  return {
    sky: skyOf(series.weatherCode[day] ?? 0),
    soil: soilOf(series.soilMoisture[day] ?? 0.25),
    rainMm: series.rainMm[day] ?? 0,
    tempRange: `${tmin}–${tmax}°`,
  };
}
