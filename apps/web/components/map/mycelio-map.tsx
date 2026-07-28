"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// Renommé : `Map` entrerait en collision avec le Map natif de JavaScript, utilisé plus bas.
import MapGL, {
  GeolocateControl,
  Layer,
  NavigationControl,
  ScaleControl,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import type { LngLatBounds } from "maplibre-gl";
import { cellToLatLng } from "h3-js";
import "maplibre-gl/dist/maplibre-gl.css";

import { buildStyle, type BasemapId } from "@/lib/map/basemaps";
import { toGeoJSON, type Cell } from "@/lib/map/hexagons";
import { MapControls } from "./map-controls";
import { CellSheet } from "./cell-sheet";

type Props = {
  center: [number, number];
  zoom: number;
  opacityRange: [number, number];
};

/** Rampe séquentielle du beige pâle à l'ocre profond. */
const RAMP = ["#E8DCC0", "#D9BE7E", "#C89B3C", "#A87A28", "#8A5A16"];

export function MycelioMap({ center, zoom, opacityRange }: Props) {
  const mapRef = useRef<MapRef>(null);
  const [basemap, setBasemap] = useState<BasemapId>("plan");
  const [cells, setCells] = useState<Cell[]>([]);
  const [essences, setEssences] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [bounds, setBounds] = useState<LngLatBounds | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/cells")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setCells(data.cells ?? []);
        setEssences(data.essences ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Le GeoJSON est construit UNE SEULE FOIS, à l'arrivée des données.
   *
   * Le reconstruire à chaque déplacement — ce que faisait la première version pour recalculer
   * les percentiles — obligeait MapLibre à réanalyser 13 000 polygones et à les renvoyer au GPU
   * à chaque relâchement de la souris. Le fil principal gelait assez longtemps pour que la carte
   * paraisse tout simplement bloquée.
   */
  const geojson = useMemo(() => toGeoJSON(cells), [cells]);

  const centers = useMemo(() => {
    const byIndex = new Map<string, [number, number]>();
    for (const cell of cells) {
      const [lat, lng] = cellToLatLng(cell.h);
      byIndex.set(cell.h, [lng, lat]);
    }
    return byIndex;
  }, [cells]);

  const visible = useMemo(() => {
    if (!bounds) return cells;
    return cells.filter((cell) => {
      const center = centers.get(cell.h);
      return center ? bounds.contains(center) : false;
    });
  }, [cells, bounds, centers]);

  /**
   * Seuils de couleur, recalculés sur la fenêtre visible à chaque déplacement.
   *
   * Le classement reste relatif — exigence du cahier des charges, sans quoi une saison sèche
   * rendrait toute la carte uniformément pâle — mais il ne passe plus par les données : seules
   * les bornes de l'expression de couleur changent, ce qui ne coûte rien.
   */
  const stops = useMemo(() => {
    const values = visible
      .map((c) => c.f)
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b);
    if (values.length === 0) return null;

    const out: number[] = [];
    let previous = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < RAMP.length; i++) {
      const at = Math.round((i / (RAMP.length - 1)) * (values.length - 1));
      // MapLibre exige des bornes strictement croissantes : quand une fenêtre est très
      // homogène, plusieurs quantiles tombent sur la même valeur.
      const value = Math.max(values[at] ?? 0, previous + 1e-6);
      out.push(value);
      previous = value;
    }
    return out;
  }, [visible]);

  const style = useMemo(() => buildStyle(basemap), [basemap]);

  /**
   * Relève l'emprise visible, pour reclasser les couleurs.
   *
   * Branché sur `idle` et non sur `load` : `getBounds()` projette les coins de l'écran, ce qui
   * exige une matrice de projection complète et un conteneur déjà dimensionné. Appelé trop tôt,
   * il lève — et l'exception laisse la carte à moitié construite. Son `remove()` échoue alors au
   * double montage de React StrictMode, la file de rendu de MapLibre reste bloquée sur
   * « already running », et la carte devient impossible à déplacer tout en s'affichant
   * normalement.
   *
   * Le try/catch est une ceinture de plus : mieux vaut un classement des couleurs légèrement en
   * retard qu'une carte morte.
   */
  const onMove = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const canvas = map.getCanvas();
    if (!canvas || canvas.width === 0 || canvas.height === 0) return;
    try {
      setBounds(map.getBounds());
    } catch {
      // emprise indisponible à cet instant : on réessaiera au prochain idle
    }
  }, []);

  const onClick = useCallback((event: MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    setSelected(feature ? (feature.properties?.h as string) : null);
  }, []);

  const selectedCell = cells.find((c) => c.h === selected) ?? null;
  const [minOpacity, maxOpacity] = opacityRange;

  const colorExpression = stops
    ? ["interpolate", ["linear"], ["get", "value"], ...stops.flatMap((s, i) => [s, RAMP[i]])]
    : RAMP[2];

  const opacityExpression = stops
    ? [
        "interpolate",
        ["linear"],
        ["get", "value"],
        stops[0],
        minOpacity,
        stops[stops.length - 1],
        maxOpacity,
      ]
    : minOpacity;

  return (
    <div className="fixed inset-0 lg:left-16">
      <MapGL
        ref={mapRef}
        initialViewState={{ longitude: center[1], latitude: center[0], zoom }}
        mapStyle={style}
        onIdle={onMove}
        onClick={onClick}
        interactiveLayerIds={["mailles"]}
        cursor="grab"
        attributionControl={{ compact: true }}
        style={{ width: "100%", height: "100%" }}
      >
        {/* En haut à droite : hors d'atteinte du pouce, mais c'est la convention, et ces
            commandes sont secondaires face au geste direct. */}
        <NavigationControl position="top-right" showCompass={false} />
        <GeolocateControl
          position="top-right"
          // Suit la position pendant la marche, sans re-centrer de force à chaque relevé :
          // sinon impossible de regarder la maille d'à côté tout en avançant.
          trackUserLocation
          showUserLocation
          positionOptions={{ enableHighAccuracy: true }}
          fitBoundsOptions={{ maxZoom: 14 }}
        />
        <ScaleControl position="bottom-left" unit="metric" maxWidth={120} />

        <Source id="cells" type="geojson" data={geojson}>
          <Layer
            id="mailles"
            type="fill"
            paint={{
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              "fill-color": colorExpression as any,
              // Jamais 1 : le relief et les chemins doivent rester lisibles dessous.
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              "fill-opacity": opacityExpression as any,
            }}
          />
          <Layer
            id="mailles-contour"
            type="line"
            paint={{
              "line-color": [
                "case",
                ["==", ["get", "h"], selected ?? ""],
                "#E8E6DD",
                "rgba(0,0,0,0.12)",
              ],
              "line-width": ["case", ["==", ["get", "h"], selected ?? ""], 2.5, 0.5],
            }}
          />
        </Source>
      </MapGL>

      <MapControls
        basemap={basemap}
        onBasemapChange={setBasemap}
        loading={loading}
        count={visible.length}
      />

      <CellSheet
        cell={selectedCell}
        essences={essences}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
