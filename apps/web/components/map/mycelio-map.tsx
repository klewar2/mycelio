"use client";

import * as React from "react";
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
import { toast } from "sonner";
import "maplibre-gl/dist/maplibre-gl.css";

import { buildStyle, type BasemapId } from "@/lib/map/basemaps";
import { toGeoJSON, type Cell, type Forecast } from "@/lib/map/hexagons";
import { SpeciesPicker, type Species } from "./species-picker";
import { MapControls } from "./map-controls";
import { CellSheet } from "./cell-sheet";
import { QuickOuting } from "./quick-outing";

type Props = {
  center: [number, number];
  zoom: number;
  opacityRange: [number, number];
};

/** Rampe séquentielle du beige pâle à l'ocre profond. */
const RAMP = ["#E8DCC0", "#D9BE7E", "#C89B3C", "#A87A28", "#8A5A16"];

export function MycelioMap({ center, zoom, opacityRange }: Props) {
  const mapRef = useRef<MapRef>(null);
  // Le type de l'instance n'est pas ré-exporté par la bibliothèque : on le dérive.
  const geolocateRef = useRef<React.ComponentRef<typeof GeolocateControl>>(null);
  const [basemap, setBasemap] = useState<BasemapId>("plan");
  const [cells, setCells] = useState<Cell[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<{ bbox: [number, number, number, number]; detailed: boolean } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [species, setSpecies] = useState<Species[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [forecast, setForecast] = useState<Map<string, Forecast>>(new Map());
  const [day, setDay] = useState(0);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!view) return;
    let cancelled = false;
    const query = `bbox=${view.bbox.join(",")}&detailed=${view.detailed ? 1 : 0}`;
    fetch(`/api/cells?${query}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setCells(data.cells ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view]);

  useEffect(() => {
    fetch("/api/species")
      .then((r) => r.json())
      .then((data) => {
        const list: Species[] = data.species ?? [];
        setSpecies(list);
        setChosen((current) => current ?? list[0]?.slug ?? null);
      });
  }, []);

  // Les scores changent avec l'espèce, jamais avec le jour : les huit jours arrivent ensemble.
  useEffect(() => {
    if (!chosen || !view) return;
    let cancelled = false;
    const query = `species=${encodeURIComponent(chosen)}&bbox=${view.bbox.join(",")}&detailed=${view.detailed ? 1 : 0}`;
    fetch(`/api/forecast?${query}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const next = new Map<string, Forecast>();
        for (const row of data.cells ?? []) next.set(row.h, row);
        setForecast(next);
      });
    return () => {
      cancelled = true;
    };
  }, [chosen, view]);

  /**
   * Le GeoJSON suit la fenêtre, pas le curseur de jour.
   *
   * Il se reconstruit à chaque déplacement — mais le serveur ne renvoyant que la fenêtre
   * visible, cela représente quelques centaines à quelques milliers d'hexagones, pas les
   * 86 000 de la grille. En revanche, changer de jour ne le reconstruit PAS : les huit jours
   * sont écrits comme autant de propriétés `s0`..`s7`, et le curseur ne modifie qu'une
   * expression de couleur, ce qui est gratuit.
   */
  const geojson = useMemo(() => toGeoJSON(cells, forecast), [cells, forecast]);

  // Plus de filtrage côté client : le serveur ne renvoie déjà que la fenêtre visible.
  const visible = cells;

  /**
   * Seuils de couleur, recalculés sur la fenêtre visible à chaque déplacement.
   *
   * Le classement reste relatif — exigence du cahier des charges, sans quoi une saison sèche
   * rendrait toute la carte uniformément pâle — mais il ne passe plus par les données : seules
   * les bornes de l'expression de couleur changent, ce qui ne coûte rien.
   */
  const stops = useMemo(() => {
    const values = visible
      .map((c) => forecast.get(c.h)?.s?.[day] ?? 0)
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
  }, [visible, forecast, day]);

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
      const b = map.getBounds();
      // Une marge de 30 % autour de l'écran : le déplacement suivant trouve déjà ses mailles
      // chargées, et la carte ne se remplit pas par à-coups.
      const padX = (b.getEast() - b.getWest()) * 0.3;
      const padY = (b.getNorth() - b.getSouth()) * 0.3;
      setView({
        bbox: [b.getWest() - padX, b.getSouth() - padY, b.getEast() + padX, b.getNorth() + padY],
        // En dessous de ce zoom, une maille de 280 m fait moins d'un pixel : on bascule sur le
        // parent en résolution 7, agrégé côté serveur.
        detailed: map.getZoom() >= 11,
      });
    } catch {
      // emprise indisponible à cet instant : on réessaiera au prochain idle
    }
  }, []);

  /**
   * Demande la position dès que la carte est prête.
   *
   * Le contrôle de MapLibre n'agit qu'au clic. Or l'usage réel est d'ouvrir l'app en arrivant
   * sur place : devoir chercher un bouton pour se situer est une friction inutile. Le navigateur
   * ne demandera l'autorisation qu'une fois, et un refus est signalé par onError.
   */
  const onLoad = useCallback(() => {
    geolocateRef.current?.trigger();
  }, []);

  const onClick = useCallback((event: MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    setSelected(feature ? (feature.properties?.h as string) : null);
  }, []);

  const [minOpacity, maxOpacity] = opacityRange;

  const colorExpression = stops
    ? ["interpolate", ["linear"], ["get", `s${day}`], ...stops.flatMap((s, i) => [s, RAMP[i]])]
    : RAMP[2];

  const opacityExpression = stops
    ? [
        "interpolate",
        ["linear"],
        ["get", `s${day}`],
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
        onLoad={onLoad}
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
          ref={geolocateRef}
          position="top-right"
          // Suit la position pendant la marche, sans re-centrer de force à chaque relevé :
          // sinon impossible de regarder la maille d'à côté tout en avançant.
          trackUserLocation
          showUserLocation
          positionOptions={{ enableHighAccuracy: true }}
          fitBoundsOptions={{ maxZoom: 13 }}
          // Sans cela, un refus de permission ou une géolocalisation indisponible échouent en
          // silence : le bouton clignote et rien ne se passe, sans qu'on sache pourquoi.
          onGeolocate={(event) =>
            setPosition({
              lat: event.coords.latitude,
              lng: event.coords.longitude,
            })
          }
          onError={(error) => {
            const reason =
              error.code === 1
                ? "Autorisation refusée. Autorise la localisation pour ce site dans ton navigateur."
                : error.code === 3
                  ? "Position trop longue à obtenir. Réessaie à l'extérieur ou avec le Wi-Fi activé."
                  : "Position indisponible. Vérifie que la localisation est activée sur l'appareil.";
            toast.error(reason);
          }}
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

      <SpeciesPicker
        species={species}
        selected={chosen}
        onSelect={setChosen}
        day={day}
        onDayChange={setDay}
      />

      {/* Dans le pouce, au-dessus du sélecteur d'espèce : c'est le geste qu'on fait en
          rentrant de sortie, souvent d'une main. */}
      <div className="pointer-events-none absolute right-3 bottom-[calc(env(safe-area-inset-bottom)+13.5rem)] z-20 lg:bottom-24">
        <QuickOuting species={species} h3={selected} position={position} />
      </div>

      <MapControls
        basemap={basemap}
        onBasemapChange={setBasemap}
        loading={loading}
        count={visible.length}
      />

      <CellSheet h3={selected} day={day} onClose={() => setSelected(null)} />
    </div>
  );
}
