import { cellToBoundary } from "h3-js";
import type { FeatureCollection, Polygon } from "geojson";

export type Cell = {
  h: string;
  f: number | null;
  /** Index dans la légende des essences renvoyée par l'API, et non le libellé lui-même. */
  e: number | null;
  a: number | null;
};

/** Série de scores d'une maille pour l'espèce sélectionnée : un par jour, plus la confiance. */
export type Forecast = { h: string; s: number[]; c: number };

export const HORIZON = 8;

/**
 * Reconstruit les polygones des mailles côté client.
 *
 * On ne transporte que des index H3 : le serveur n'envoie jamais de géométrie. Un index tient
 * en 15 caractères, le polygone correspondant en quelques centaines — sur des milliers de
 * mailles, c'est ce qui rend le chargement instantané.
 *
 * Les huit jours sont écrits comme autant de propriétés `s0`..`s7`. C'est délibéré : le curseur
 * de jour ne change alors que l'expression de couleur, ce qui est gratuit, au lieu de forcer
 * MapLibre à réanalyser 13 000 polygones à chaque cran.
 */
export function toGeoJSON(
  cells: Cell[],
  forecast: Map<string, Forecast>,
): FeatureCollection<Polygon> {
  return {
    type: "FeatureCollection",
    features: cells.map((cell) => {
      const series = forecast.get(cell.h);
      const properties: Record<string, unknown> = { h: cell.h, c: series?.c ?? 0 };
      for (let day = 0; day < HORIZON; day++) {
        properties[`s${day}`] = series?.s?.[day] ?? 0;
      }
      return {
        type: "Feature" as const,
        geometry: {
          type: "Polygon" as const,
          // cellToBoundary renvoie [lat, lng] par défaut ; GeoJSON attend l'inverse.
          coordinates: [cellToBoundary(cell.h, true)],
        },
        properties,
      };
    }),
  };
}
