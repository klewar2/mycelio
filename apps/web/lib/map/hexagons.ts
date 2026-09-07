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
 * Arrondit l'emprise visible sur une grille, pour que deux vues voisines partagent une URL.
 *
 * Sans cela, `getBounds()` rend des degrés continus : le moindre panoramique produit une emprise
 * inédite, donc une URL inédite, donc un appel réseau complet — alors que 95 % des mailles
 * demandées étaient déjà à l'écran une demi-seconde plus tôt. C'était la cause directe de la
 * lenteur ressentie au déplacement, bien plus que le temps de la requête elle-même.
 *
 * On arrondit donc vers l'extérieur sur un pas fixe. Tant que la carte reste dans la même case,
 * l'URL ne change pas et le cache du navigateur répond instantanément.
 *
 * Le pas est une puissance de deux du degré, prise autour du quart de la largeur visible : une
 * puissance de deux pour qu'un cran de molette ne change pas la grille sous les pieds — sinon on
 * regagnerait d'un côté ce qu'on perd de l'autre. La marge de 15 % garantit qu'il reste toujours
 * un peu de carte chargée hors écran, y compris quand l'arrondi tombe pile sur un bord.
 */
export function snapBounds(
  west: number,
  south: number,
  east: number,
  north: number,
): [number, number, number, number] {
  const span = Math.max(east - west, north - south, 1e-6);
  const step = 2 ** Math.round(Math.log2(span / 4));

  const padX = (east - west) * 0.15;
  const padY = (north - south) * 0.15;

  // `toFixed` en plus de l'arrondi : `Math.floor(x / step) * step` rend 1.2000000000000002 dès
  // que le pas n'est pas représentable exactement, et cette décimale parasite suffit à créer une
  // URL différente à chaque appel — soit exactement le défaut qu'on corrige ici.
  const decimals = Math.max(0, Math.min(8, Math.ceil(-Math.log10(step)) + 1));
  const grid = (value: number, direction: -1 | 1) =>
    Number(
      ((direction < 0 ? Math.floor(value / step) : Math.ceil(value / step)) * step).toFixed(
        decimals,
      ),
    );

  return [
    grid(west - padX, -1),
    grid(south - padY, -1),
    grid(east + padX, 1),
    grid(north + padY, 1),
  ];
}

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
