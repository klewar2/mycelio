"use client";

import dynamic from "next/dynamic";

// Importée depuis ce fragment statique, et pas seulement depuis le composant chargé
// dynamiquement, pour qu'elle entre dans le bundle CSS initial plutôt que d'arriver après le
// premier rendu de la carte. Sans elle, le canvas perd son positionnement absolu.
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * Charge la carte côté navigateur uniquement.
 *
 * MapLibre touche à WebGL et à `window` dès l'import : un rendu serveur échoue. `ssr: false`
 * n'étant pas autorisé depuis un Server Component, ce fragment client sert d'intermédiaire —
 * c'est son unique raison d'être.
 */
const MycelioMap = dynamic(
  () => import("./mycelio-map").then((m) => m.MycelioMap),
  {
    ssr: false,
    loading: () => (
      <div className="bg-background fixed inset-0 lg:left-16" aria-busy="true">
        <span className="sr-only">Chargement de la carte…</span>
      </div>
    ),
  },
);

export function MapShell(props: {
  center: [number, number];
  zoom: number;
  opacityRange: [number, number];
}) {
  return <MycelioMap {...props} />;
}
