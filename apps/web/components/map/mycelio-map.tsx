"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// Renommé : `Map` entrerait en collision avec le Map natif de JavaScript, utilisé plus bas.
import MapGL, { Layer, Source, type MapRef, type MapLayerMouseEvent } from "react-map-gl/maplibre";
import type { LngLatBounds } from "maplibre-gl";
import { cellToLatLng } from "h3-js";
import "maplibre-gl/dist/maplibre-gl.css";

import { buildStyle, type BasemapId } from "@/lib/map/basemaps";
import { computePercentiles, toGeoJSON, type Cell } from "@/lib/map/hexagons";
import { MapControls } from "./map-controls";
import { CellSheet } from "./cell-sheet";

type Props = {
  center: [number, number];
  zoom: number;
  opacityRange: [number, number];
};

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

  // Les centres ne dépendent que de l'index H3 : on les calcule une fois, pas à chaque
  // déplacement de la carte.
  const centers = useMemo(() => {
    const map = new Map<string, [number, number]>();
    for (const cell of cells) {
      const [lat, lng] = cellToLatLng(cell.h);
      map.set(cell.h, [lng, lat]);
    }
    return map;
  }, [cells]);

  // Le classement se refait à chaque déplacement : c'est tout l'intérêt du percentile sur la
  // fenêtre visible plutôt que sur la valeur absolue.
  const visible = useMemo(() => {
    if (!bounds) return cells;
    return cells.filter((cell) => {
      const center = centers.get(cell.h);
      return center ? bounds.contains(center) : false;
    });
  }, [cells, bounds, centers]);

  const geojson = useMemo(
    () => toGeoJSON(cells, computePercentiles(visible)),
    [cells, visible],
  );

  const style = useMemo(() => buildStyle(basemap), [basemap]);

  const onMove = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map) setBounds(map.getBounds());
  }, []);

  const onClick = useCallback((event: MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    setSelected(feature ? (feature.properties?.h as string) : null);
  }, []);

  const selectedCell = cells.find((c) => c.h === selected) ?? null;

  const [minOpacity, maxOpacity] = opacityRange;

  return (
    <div className="fixed inset-0 lg:left-16">
      <MapGL
        ref={mapRef}
        initialViewState={{ longitude: center[1], latitude: center[0], zoom }}
        mapStyle={style}
        onLoad={onMove}
        onMoveEnd={onMove}
        onClick={onClick}
        interactiveLayerIds={["mailles"]}
        attributionControl={{ compact: true }}
        style={{ width: "100%", height: "100%" }}
      >
        <Source id="cells" type="geojson" data={geojson}>
          <Layer
            id="mailles"
            type="fill"
            paint={{
              // Rampe séquentielle du beige pâle à l'ocre profond, pilotée par le RANG et non
              // par la valeur brute.
              "fill-color": [
                "interpolate",
                ["linear"],
                ["get", "percentile"],
                0,
                "#E8DCC0",
                0.5,
                "#C89B3C",
                1,
                "#8A5A16",
              ],
              // Jamais 1 : le relief et les chemins doivent rester lisibles dessous.
              "fill-opacity": [
                "interpolate",
                ["linear"],
                ["get", "percentile"],
                0,
                minOpacity,
                1,
                maxOpacity,
              ],
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

      <CellSheet cell={selectedCell} essences={essences} onClose={() => setSelected(null)} />
    </div>
  );
}

