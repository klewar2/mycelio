import type { StyleSpecification } from "maplibre-gl";

/**
 * Fonds de carte IGN, servis en WMTS par la Géoplateforme.
 *
 * Sans clé depuis 2021, et sous licence Etalab 2.0 : c'est ce qui permet de tenir la contrainte
 * de coût nul. On n'utilise surtout pas Mapbox, dont le style impose un jeton et un quota.
 *
 * SCAN 25 est volontairement absent : il demande encore une inscription.
 */
const WMTS = process.env.NEXT_PUBLIC_IGN_WMTS ?? "https://data.geopf.fr/wmts";

function wmtsUrl(layer: string, format: string): string {
  const params = new URLSearchParams({
    SERVICE: "WMTS",
    REQUEST: "GetTile",
    VERSION: "1.0.0",
    LAYER: layer,
    STYLE: "normal",
    TILEMATRIXSET: "PM",
    FORMAT: format,
    TILEMATRIX: "{z}",
    TILEROW: "{y}",
    TILECOL: "{x}",
  });
  // Les accolades des gabarits d'URL ne doivent pas être encodées : MapLibre les substitue.
  return `${WMTS}?${params.toString()}`.replace(/%7B/g, "{").replace(/%7D/g, "}");
}

export const BASEMAPS = {
  plan: {
    label: "Plan IGN",
    layer: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2",
    format: "image/png",
  },
  ortho: {
    label: "Photo aérienne",
    layer: "ORTHOIMAGERY.ORTHOPHOTOS",
    format: "image/jpeg",
  },
} as const;

export type BasemapId = keyof typeof BASEMAPS;

export function buildStyle(basemap: BasemapId): StyleSpecification {
  const { layer, format } = BASEMAPS[basemap];

  return {
    version: 8,
    // Police servie par la Géoplateforme : aucune dépendance à un service tiers.
    glyphs: "https://data.geopf.fr/annexes/ressources/vectorTiles/fonts/{fontstack}/{range}.pbf",
    sources: {
      ign: {
        type: "raster",
        tiles: [wmtsUrl(layer, format)],
        tileSize: 256,
        maxzoom: 19,
        attribution: "IGN — Géoplateforme (Etalab 2.0)",
      },
    },
    layers: [
      { id: "fond", type: "raster", source: "ign", paint: { "raster-opacity": 1 } },
    ],
  };
}
