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
export function toGeoJSON(cells: Cell[]): FeatureCollection<Polygon> {
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
        value: cell.f ?? 0,
      },
    })),
  };
}

