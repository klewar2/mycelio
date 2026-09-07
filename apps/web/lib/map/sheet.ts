/**
 * Hauteurs des feuilles mobiles (panneau de lecture, fiche « Ce coin »).
 *
 * Des chaînes CSS, pas des nombres : `min()` et `dvh` ne se laissent pas réduire à un rem unique,
 * et ce sont pourtant des longueurs valides pour une transition — le navigateur anime la valeur
 * résolue en pixels, quelle que soit la notation de départ.
 */

/**
 * Distance à laisser entre le bas de l'écran et le bas des feuilles, sur mobile.
 *
 * `AppNav` (components/shell/app-nav.tsx) pose une barre d'onglets fixe, en z-50, au-dessus de
 * tout le reste — la carte y compris, qui passe volontairement dessous (voir son docstring). Une
 * feuille collée à `bottom-0` finirait donc en partie SOUS cette barre : pas coupée à l'écran,
 * puisqu'elle défile, mais son dernier écran de contenu resterait masqué en permanence, la barre
 * occupant physiquement cet espace quel que soit le défilement. C'est exactement la valeur déjà
 * utilisée par `app/(app)/layout.tsx` pour dégager la même barre.
 */
export const MOBILE_NAV_CLEARANCE = "calc(5.5rem + env(safe-area-inset-bottom))";

/** Repliée : juste le verdict. Par défaut : verdict, familles, semaine. Dépliée : détail jour par jour. */
export const READING_SHEET_HEIGHTS = ["7rem", "17rem", "min(70dvh, 38rem)"] as const;

/** Mi-hauteur : la carte reste visible derrière. Pleine hauteur : lecture complète du coin. */
export const CELL_SHEET_HEIGHTS = ["44dvh", "76dvh"] as const;

export function clampSnap(value: number, max: number): number {
  return Math.max(0, Math.min(max, value));
}

/**
 * Feuille du point relevé, selon ce qu'elle contient.
 *
 * Trois hauteurs et non une seule, parce que le mode « attente » doit rendre la carte : c'est
 * elle qu'on est en train de toucher pour poser le point. Une feuille à mi-hauteur pendant
 * qu'on vise reviendrait à masquer la cible.
 */
export const POINT_SHEET_HEIGHTS = {
  /** Rien de relevé encore : une barre, le champ de collage, et la carte reste dégagée. */
  attente: "10.5rem",
  /** Un point relevé : ses coordonnées, la copie, et de quoi l'enregistrer. */
  releve: "min(62dvh, 23rem)",
  /** Un spot enregistré : son nom, ses notes, ses coordonnées. */
  spot: "min(52dvh, 19rem)",
} as const;
