/**
 * Échelle de lecture grand public.
 *
 * Le moteur produit un score dans [0, 1] — habitat × phénologie × météo. Ce nombre est
 * parfaitement lisible pour qui a écrit le modèle, et parfaitement opaque pour tout le monde
 * d'autre : « 12 % » ne dit ni si c'est bon, ni si c'est mieux qu'hier. Cinq paliers nommés en
 * français répondent à la seule question que se pose un cueilleur : est-ce que ça vaut le
 * déplacement ?
 *
 * Formulation en CHANCES et non en probabilité : le score est un indice de faveur issu de
 * règles expertes, pas une probabilité calibrée. Écrire « 40 % de probabilité » serait un
 * mensonge poli ; « bonnes chances » est vrai.
 *
 * Les seuils sont calés sur la distribution réelle observée en base (86 000 mailles, 8 espèces,
 * 8 jours) : médiane vers 0,03, centile 99 vers 0,23, maximum saisonnier vers 0,45 sur une
 * espèce en pic. Ils se resserrent volontairement vers le haut — les très bons coins doivent
 * rester rares, sans quoi le mot « très bon » ne veut plus rien dire. C'est le premier réglage
 * à revoir après une saison de terrain, avec les poids de /admin/scoring.
 */

/** Rampe séquentielle du beige pâle à l'ocre profond — un palier par niveau. */
export const RAMP = ["#E8DCC0", "#D9BE7E", "#C89B3C", "#A87A28", "#8A5A16"] as const;

export type Level = {
  /** Borne basse, incluse. */
  min: number;
  /** Libellé complet, tel qu'il apparaît dans le verdict. */
  label: string;
  /** Forme courte, pour les listes et les légendes serrées. */
  short: string;
  color: string;
};

export const LEVELS: Level[] = [
  { min: 0, label: "Très faibles chances", short: "Très faible", color: RAMP[0] },
  { min: 0.02, label: "Faibles chances", short: "Faible", color: RAMP[1] },
  { min: 0.08, label: "Chances moyennes", short: "Moyen", color: RAMP[2] },
  { min: 0.2, label: "Bonnes chances", short: "Bon", color: RAMP[3] },
  { min: 0.4, label: "Très bonnes chances", short: "Très bon", color: RAMP[4] },
];

/** Indice de palier d'un score, de 0 à 4. */
export function levelIndex(score: number): number {
  let index = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (score >= LEVELS[i]!.min) index = i;
  }
  return index;
}

export function levelOf(score: number): Level {
  return LEVELS[levelIndex(score)]!;
}

/**
 * Position continue sur l'échelle, de 0 à 1 — la hauteur des barres de la semaine.
 *
 * Une hauteur par palier donnerait des semaines en escalier, où trois jours de suite en
 * « chances moyennes » ont exactement la même barre : on perdrait la seule chose que la barre
 * doit montrer, la poussée qui monte ou qui retombe. On interpole donc À L'INTÉRIEUR du palier,
 * la couleur restant, elle, strictement celle du palier — le sens ne se dilue pas.
 *
 * Le dernier palier n'a pas de borne haute : on lui en donne une, arbitraire mais jamais
 * atteinte en pratique, pour que sa barre ne soit pas systématiquement pleine.
 */
export function levelPosition(score: number): number {
  const index = levelIndex(score);
  const low = LEVELS[index]!.min;
  const high = LEVELS[index + 1]?.min ?? 0.8;
  const within = high > low ? Math.min(1, (score - low) / (high - low)) : 1;
  return (index + within) / LEVELS.length;
}

/**
 * Étiquette de jour, en français, telle qu'on la dit à l'oral.
 *
 * « aujourd'hui » et « demain » plutôt qu'une date : c'est ainsi qu'on se donne rendez-vous, et
 * cela évite au lecteur de recalculer quel jour on est.
 */
export function dayLabel(offset: number, from = new Date()): string {
  if (offset === 0) return "aujourd'hui";
  if (offset === 1) return "demain";
  const date = new Date(from);
  date.setDate(date.getDate() + offset);
  return date.toLocaleDateString("fr-FR", { weekday: "long" });
}

/** Forme abrégée pour la barre de semaine, où la place manque. */
export function dayShort(offset: number, from = new Date()): string {
  if (offset === 0) return "auj.";
  const date = new Date(from);
  date.setDate(date.getDate() + offset);
  return date.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "");
}
