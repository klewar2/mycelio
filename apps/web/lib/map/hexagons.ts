import { cellToBoundary } from "h3-js";
import type { FeatureCollection, Polygon } from "geojson";

export type Cell = {
  h: string;
  f: number | null;
  /** Index dans la légende des essences renvoyée par l'API, et non le libellé lui-même. */
  e: number | null;
  a: number | null;
};

/**
 * Reconstruit les polygones des mailles côté client.
 *
 * On ne transporte que des index H3 : le serveur n'envoie jamais de géométrie. Un index tient
 * en 15 caractères, le polygone correspondant en quelques centaines — sur des milliers de
 * mailles, c'est ce qui rend le chargement instantané.
 */
export function toGeoJSON(
  cells: Cell[],
  percentiles: Map<string, number>,
): FeatureCollection<Polygon> {
  return {
    type: "FeatureCollection",
    features: cells.map((cell) => ({
      type: "Feature",
      id: undefined,
      geometry: {
        type: "Polygon",
        // cellToBoundary renvoie [lat, lng] par défaut ; GeoJSON attend l'inverse.
        coordinates: [cellToBoundary(cell.h, true)],
      },
      properties: {
        h: cell.h,
        value: cell.f,
        percentile: percentiles.get(cell.h) ?? 0,
        essence: cell.e,
        alt: cell.a,
      },
    })),
  };
}

/**
 * Classe les mailles en percentiles SUR LA FENÊTRE VISIBLE, et non en valeur absolue.
 *
 * C'est une exigence du cahier des charges, et elle est loin d'être cosmétique : en août sec,
 * toutes les valeurs absolues s'effondrent et la carte devient uniformément pâle, donc
 * inutilisable. Le rang relatif garde toujours un contraste exploitable — la question utile
 * n'est pas « est-ce bon dans l'absolu » mais « où aller aujourd'hui, ici ».
 */
export function computePercentiles(cells: Cell[]): Map<string, number> {
  const scored = cells.filter((c) => c.f != null);
  const sorted = [...scored].sort((a, b) => (a.f ?? 0) - (b.f ?? 0));
  const out = new Map<string, number>();

  sorted.forEach((cell, i) => {
    out.set(cell.h, sorted.length > 1 ? i / (sorted.length - 1) : 1);
  });
  return out;
}
