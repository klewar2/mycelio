"use client";

import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// Renommé : `Map` entrerait en collision avec le Map natif de JavaScript, utilisé plus bas.
import MapGL, {
  GeolocateControl,
  Layer,
  Marker,
  NavigationControl,
  ScaleControl,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import { MapPin } from "lucide-react";
import { toast } from "sonner";
import "maplibre-gl/dist/maplibre-gl.css";

import { buildStyle, type BasemapId } from "@/lib/map/basemaps";
import type { Coords } from "@/lib/map/coordinates";
import { ALL_FAMILIES, groupByFamily, slugsFor, type Species } from "@/lib/map/families";
import { HORIZON, snapBounds, toGeoJSON, type Cell, type Forecast } from "@/lib/map/hexagons";
import {
  CELL_SHEET_HEIGHTS,
  MOBILE_NAV_CLEARANCE,
  POINT_SHEET_HEIGHTS,
  READING_SHEET_HEIGHTS,
} from "@/lib/map/sheet";
import type { Spot } from "@/lib/map/spots";
import type { WeatherSeries } from "@/lib/map/weather";
import { RAMP } from "@/lib/scoring/levels";
import { cn } from "@/lib/utils";
import { ReadingPanel } from "./reading-panel";
import { MapControls } from "./map-controls";
import { CellSheet } from "./cell-sheet";
import { PointSheet } from "./point-sheet";
import { QuickOuting } from "./quick-outing";

/**
 * Identités stables, hors du composant.
 *
 * `interactiveLayerIds` reconstruit à chaque rendu repose la liste dans MapLibre à chaque
 * rendu. Ce n'est pas la propriété qui avait tué la carte en production — c'étaient les
 * expressions de peinture — mais c'est la même erreur, et ce fichier a payé assez cher pour ne
 * plus la refaire nulle part.
 */
const MAILLES_INTERACTIVES = ["mailles"];
const AUCUNE_COUCHE_INTERACTIVE: string[] = [];

type Props = {
  center: [number, number];
  zoom: number;
  opacityRange: [number, number];
  /** Rendues par le Server Component : la carte ne peut rien demander avant de les connaître. */
  species: Species[];
  /** Les spots de l'utilisateur. Rendus côté serveur, donc posés dès le premier rendu. */
  spots: Spot[];
  canManageSpots: boolean;
};

export function MycelioMap({
  center,
  zoom,
  opacityRange,
  species,
  spots,
  canManageSpots,
}: Props) {
  const mapRef = useRef<MapRef>(null);
  // Le type de l'instance n'est pas ré-exporté par la bibliothèque : on le dérive.
  const geolocateRef = useRef<React.ComponentRef<typeof GeolocateControl>>(null);
  const [basemap, setBasemap] = useState<BasemapId>("plan");
  const [cells, setCells] = useState<Cell[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<{ bbox: [number, number, number, number]; detailed: boolean } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // Sélection par famille, et non par espèce : « Cèpes », pas « Boletus reticulatus ».
  // Par défaut, toutes — la première question d'un débutant n'est pas « où sont les girolles »
  // mais « est-ce que ça pousse en ce moment ».
  const [chosen, setChosen] = useState<string>(ALL_FAMILIES);
  const [forecast, setForecast] = useState<Map<string, Forecast>>(new Map());
  const [weather, setWeather] = useState<WeatherSeries | null>(null);
  const [day, setDay] = useState(0);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  // Possédés ici, et non par ReadingPanel/CellSheet, parce que le bouton flottant a besoin de
  // suivre la hauteur de la feuille active pour ne jamais se retrouver sous elle.
  const [sheetSnap, setSheetSnap] = useState(1);
  const [cellExpanded, setCellExpanded] = useState(false);
  // Relevé de coordonnées : un mode, parce qu'un tap ne peut pas vouloir dire deux choses.
  // Tant qu'il est actif, toucher la carte pose un point au lieu d'ouvrir une maille — y
  // compris pour en poser un autre, ce qui évite de ressortir puis rentrer dans le mode.
  const [pointing, setPointing] = useState(false);
  const [point, setPoint] = useState<Coords | null>(null);
  // L'identifiant, et non l'objet : le spot est relu dans `spots` à chaque rendu, donc la
  // feuille suit une renomination et se referme d'elle-même sur une suppression.
  const [spotId, setSpotId] = useState<string | null>(null);

  const families = useMemo(() => groupByFamily(species), [species]);
  const slugs = useMemo(() => slugsFor(families, chosen), [families, chosen]);
  /**
   * Ce qui déclenche un chargement, c'est la LISTE demandée, pas l'identité du tableau.
   *
   * `species` arrive du Server Component : chaque revalidation de /carte — l'enregistrement
   * d'un spot en provoque une — en rend un nouveau, donc de nouvelles `families`, donc de
   * nouveaux `slugs`. Sur l'identité, l'effet repartirait à chaque écriture sans qu'une seule
   * espèce ait changé. Sur la chaîne, il ne repart que si la sélection change vraiment.
   */
  const speciesParam = useMemo(() => slugs.join(","), [slugs]);

  /**
   * Mailles et scores, en un seul appel.
   *
   * Les deux arrivaient par deux routes distinctes, déclenchées par le même changement d'emprise
   * à la même milliseconde. Chacune payait sa pile d'authentification, et se dédoublait encore
   * par la pagination de PostgREST au-delà de 1 000 mailles — ce qui est le cas de la vue par
   * défaut. On ne demande plus qu'une chose : ce qu'il y a dans ce rectangle.
   *
   * Les scores changent avec la famille, jamais avec le jour : les huit jours arrivent ensemble,
   * et la barre de semaine ne déclenche aucun appel réseau.
   */
  useEffect(() => {
    if (!view || !speciesParam) return;
    let cancelled = false;
    const query = `species=${encodeURIComponent(speciesParam)}&bbox=${view.bbox.join(",")}&detailed=${view.detailed ? 1 : 0}`;
    fetch(`/api/map?${query}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const rows = (data.cells ?? []) as (Cell & { s: number[]; c: number })[];
        setCells(rows);
        const next = new Map<string, Forecast>();
        for (const row of rows) next.set(row.h, { h: row.h, s: row.s, c: row.c });
        setForecast(next);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [speciesParam, view]);

  // Une seule série pour toute la fenêtre, jamais par maille : la météo n'a pas de structure
  // plus fine que quelques kilomètres (voir pipeline/mycelio/weather.py), donc pas de sens à
  // relancer l'appel au changement de famille ou de jour — seul le déplacement de la carte
  // compte.
  useEffect(() => {
    if (!view) return;
    let cancelled = false;
    fetch(`/api/weather?bbox=${view.bbox.join(",")}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setWeather(data.weather ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [view]);

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
   * Meilleur score de la fenêtre, jour par jour — la matière du panneau de lecture.
   *
   * Le MAXIMUM et non la moyenne : « y a-t-il un bon coin dans ce que je regarde » est la
   * question, et une moyenne sur un département entier ne répondrait jamais oui. C'est aussi ce
   * que l'œil cherche sur la carte — la maille la plus foncée — donc le verdict et le rendu
   * disent la même chose.
   */
  const weekBest = useMemo(() => {
    const best = new Array<number>(HORIZON).fill(0);
    for (const row of forecast.values()) {
      for (let d = 0; d < HORIZON; d++) {
        const value = row.s?.[d] ?? 0;
        if (value > best[d]!) best[d] = value;
      }
    }
    return best;
  }, [forecast]);

  /**
   * Seuils de couleur, recalculés sur la fenêtre visible à chaque déplacement.
   *
   * Le classement reste relatif — exigence du cahier des charges, sans quoi une saison sèche
   * rendrait toute la carte uniformément pâle — mais il ne passe plus par les données : seules
   * les bornes de l'expression de couleur changent, ce qui ne coûte rien.
   *
   * C'est ce classement relatif que le panneau de lecture compense : lui donne la valeur
   * absolue, en toutes lettres. Sans quoi une carte bien contrastée un jour de sécheresse
   * laisserait croire à une bonne journée.
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
      // Marge, PUIS arrondi sur une grille (voir snapBounds). La marge seule ne suffisait pas :
      // elle chargeait bien un peu de carte hors écran, mais l'emprise restant continue, le
      // moindre panoramique changeait l'URL et redemandait tout. Arrondie, elle ne change qu'en
      // franchissant une case — d'où un déplacement servi par le cache la plupart du temps.
      const bbox = snapBounds(b.getWest(), b.getSouth(), b.getEast(), b.getNorth());
      // En dessous de ce zoom, une maille de 280 m fait moins d'un pixel : on bascule sur le
      // parent en résolution 7, agrégé côté serveur.
      //
      // Lu ICI, dans le try, et surtout PAS dans la fonction passée à `setView` : React appelle
      // cette fonction quand il veut, hors de la pile d'appel courante. Une exception levée par
      // MapLibre à ce moment-là — et `getZoom()` lève tant que la matrice de projection n'est
      // pas prête — passe à côté du try/catch, remonte dans la file de rendu de MapLibre et la
      // laisse bloquée sur « already running ». La carte s'affiche alors normalement et refuse
      // tout déplacement, sans la moindre erreur en console. C'est le piège décrit plus haut,
      // et il coûte une carte morte en production pour une lecture déplacée de trois lignes.
      const detailed = map.getZoom() >= 11;
      setView((current) => {
        // Identité référentielle : `view` est une dépendance d'effet. Sans cette comparaison,
        // chaque `idle` — il y en a un par inertie de glissement — rendrait un objet neuf et
        // relancerait la requête que l'arrondi vient précisément d'éviter.
        if (
          current &&
          current.detailed === detailed &&
          current.bbox[0] === bbox[0] &&
          current.bbox[1] === bbox[1] &&
          current.bbox[2] === bbox[2] &&
          current.bbox[3] === bbox[3]
        ) {
          return current;
        }
        return { bbox, detailed };
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
    onMove();
  }, [onMove]);

  /**
   * Première emprise, sans dépendre d'aucun événement de MapLibre.
   *
   * `load` comme `idle` supposent tous deux un style que MapLibre juge chargé. Quand cette
   * condition ne se réalise pas — et elle peut ne jamais se réaliser — aucun des deux n'est
   * émis : la carte se dessine, se déplace, et l'application n'apprend jamais ce qu'elle
   * regarde. C'est arrivé en production, sans une erreur en console.
   *
   * On ne fait donc plus reposer le démarrage sur un événement. On réessaie jusqu'à ce que
   * `getBounds()` réponde, ce qui n'exige que le conteneur dimensionné. `onMove` est idempotent
   * — il compare avant de remplacer — donc une tentative de trop ne coûte rien, et l'arrêt sur
   * `view` garantit qu'on ne boucle pas indéfiniment.
   */
  useEffect(() => {
    if (view) return;
    onMove();
    const timer = setInterval(onMove, 300);
    return () => clearInterval(timer);
  }, [view, onMove]);

  const onClick = useCallback(
    (event: MapLayerMouseEvent) => {
      // En mode relevé, la carte entière est un sélecteur de coordonnées : aucune maille ne
      // s'ouvre, et un second tap déplace le point plutôt que d'annuler le mode.
      if (pointing) {
        setPoint({ lat: event.lngLat.lat, lng: event.lngLat.lng });
        return;
      }
      setSpotId(null);
      const feature = event.features?.[0];
      setSelected(feature ? (feature.properties?.h as string) : null);
      setCellExpanded(false);
    },
    [pointing],
  );

  /**
   * Clic droit, et appui long sur la plupart des navigateurs mobiles.
   *
   * Raccourci, jamais l'unique chemin : Safari sur iOS n'émet pas toujours `contextmenu` sur un
   * canvas, et une fonctionnalité qui n'existerait que là serait invisible pour la moitié des
   * téléphones. Le bouton de la barre d'outils reste la voie principale.
   */
  const onContextMenu = useCallback((event: MapLayerMouseEvent) => {
    setSelected(null);
    setSpotId(null);
    setPointing(true);
    setPoint({ lat: event.lngLat.lat, lng: event.lngLat.lng });
  }, []);

  const togglePointing = useCallback(() => {
    setPointing((current) => !current);
    setPoint(null);
    setSpotId(null);
    setSelected(null);
  }, []);

  const closePoint = useCallback(() => {
    setPointing(false);
    setPoint(null);
    setSpotId(null);
  }, []);

  /** Coordonnées saisies à la main : on suit le point plutôt que de laisser l'épingle hors écran. */
  const onPointChange = useCallback((coords: Coords) => {
    setPoint(coords);
    try {
      mapRef.current?.getMap().easeTo({ center: [coords.lng, coords.lat], duration: 600 });
    } catch {
      // Carte pas encore projetable : l'épingle est posée, elle sera visible au prochain
      // déplacement. Jamais laisser MapLibre lever hors d'une pile qu'on contrôle.
    }
  }, []);

  const openSpot = useCallback((spot: Spot) => {
    setSpotId(spot.id);
    setPointing(false);
    setPoint(null);
    setSelected(null);
  }, []);

  const closeCell = useCallback(() => {
    setSelected(null);
    setSheetSnap(1);
  }, []);

  // Suit la feuille actuellement montrée au premier plan — la fiche « Ce coin » quand une
  // maille est sélectionnée, sinon le panneau de lecture — pour que le bouton flottant reste
  // toujours juste au-dessus, comme dans le mockup.
  const openedSpot = spotId ? (spots.find((s) => s.id === spotId) ?? null) : null;
  const pointSheetOpen = pointing || openedSpot !== null;

  const activeSheetHeight = pointSheetOpen
    ? openedSpot
      ? POINT_SHEET_HEIGHTS.spot
      : point
        ? POINT_SHEET_HEIGHTS.releve
        : POINT_SHEET_HEIGHTS.attente
    : selected
      ? CELL_SHEET_HEIGHTS[cellExpanded ? 1 : 0]
      : READING_SHEET_HEIGHTS[sheetSnap];

  const [minOpacity, maxOpacity] = opacityRange;

  /**
   * Mémoïsées, et ce n'est pas une micro-optimisation.
   *
   * react-map-gl repose les propriétés de peinture dès que leur identité change. Reconstruites
   * à chaque rendu, ces deux expressions salissaient donc le style à chaque rendu — et un style
   * perpétuellement sale ne « charge » jamais au sens de MapLibre, qui n'émet alors PLUS JAMAIS
   * `idle`. Or c'est `idle` qui relève l'emprise : la carte s'affichait, se déplaçait, et ne
   * demandait aucune donnée. Symptôme observé en production : hexagones absents et « Lecture du
   * secteur… » figé, sans une erreur en console.
   */
  const colorExpression = useMemo(
    () =>
      stops
        ? ["interpolate", ["linear"], ["get", `s${day}`], ...stops.flatMap((s, i) => [s, RAMP[i]])]
        : RAMP[2],
    [stops, day],
  );

  const opacityExpression = useMemo(
    () =>
      stops
        ? [
            "interpolate",
            ["linear"],
            ["get", `s${day}`],
            stops[0],
            minOpacity,
            stops[stops.length - 1],
            maxOpacity,
          ]
        : minOpacity,
    [stops, day, minOpacity, maxOpacity],
  );

  return (
    <div className="fixed inset-0 lg:left-16">
      <MapGL
        ref={mapRef}
        initialViewState={{ longitude: center[1], latitude: center[0], zoom }}
        mapStyle={style}
        onLoad={onLoad}
        // `idle` ET `moveend`. `idle` seul est un point de défaillance unique : il n'est émis
        // que si MapLibre considère son style entièrement chargé, et un style qu'on salit sans
        // arrêt ne l'est jamais. La carte reste alors parfaitement utilisable — elle se déplace,
        // elle se dessine — mais l'application ne demande jamais ses mailles, ce qui est le pire
        // des deux mondes : rien à voir, et rien qui signale pourquoi.
        //
        // `moveend` ne dépend, lui, que du déplacement. Les deux événements posent la MÊME
        // emprise arrondie, et `setView` compare avant de remplacer : le doublon ne coûte rien.
        onIdle={onMove}
        onMoveEnd={onMove}
        onClick={onClick}
        onContextMenu={onContextMenu}
        // Aucune couche interrogeable en mode relevé : sinon MapLibre repasse le curseur en
        // « pointer » au survol d'un hexagone, et la mire disparaît là où on vise justement.
        interactiveLayerIds={pointing ? AUCUNE_COUCHE_INTERACTIVE : MAILLES_INTERACTIVES}
        cursor={pointing ? "crosshair" : "grab"}
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

        {/* Marqueurs DOM plutôt qu'une couche symbole : quelques dizaines de spots au maximum,
            aucune image à charger dans le style, et un habillage qui suit les couleurs du
            thème. Une couche symbole se justifierait à partir de quelques milliers de points —
            et surtout, salir le style de la carte est exactement ce qui l'avait rendue muette
            en production. */}
        {spots.map((spot) => (
          <Marker
            key={spot.id}
            longitude={spot.lng}
            latitude={spot.lat}
            anchor="bottom"
            onClick={(event) => {
              event.originalEvent?.stopPropagation();
              openSpot(spot);
            }}
          >
            <MapPin
              className="size-7 cursor-pointer drop-shadow-md"
              style={{ fill: "var(--primary)", color: "#FFFFFF" }}
              strokeWidth={1.75}
              aria-label={spot.label}
            />
          </Marker>
        ))}

        {/* Le point relevé, volontairement différent d'un spot : un repère, pas une épingle
            plantée. Rien n'est encore enregistré, et le dessin doit le dire. */}
        {point && !openedSpot ? (
          <Marker longitude={point.lng} latitude={point.lat} anchor="center">
            <span className="border-background bg-foreground block size-4 rounded-full border-[3px] shadow-md ring-1 ring-black/20" />
          </Marker>
        ) : null}
      </MapGL>

      <ReadingPanel
        families={families}
        selected={chosen}
        onSelect={setChosen}
        day={day}
        onDayChange={setDay}
        weekBest={weekBest}
        hasData={forecast.size > 0}
        loading={loading}
        weather={weather}
        hidden={!!selected || pointSheetOpen}
        snap={sheetSnap}
        onSnapChange={setSheetSnap}
      />

      {/* Dans le pouce, au-dessus de la feuille active — panneau de lecture ou fiche « Ce
          coin » — quelle qu'elle soit : c'est le geste qu'on fait en rentrant de sortie,
          souvent d'une main.

          Caché au cran déplié, sur mobile : la feuille y occupe presque tout l'écran, et le
          bouton se retrouverait sinon coincé contre les commandes du haut plutôt qu'au-dessus
          du panneau. Ce n'est de toute façon pas le moment de ce geste-là — on est en train de
          lire le détail, pas de rentrer d'une sortie. */}
      <div
        className={cn(
          "pointer-events-none absolute right-3 z-30 transition-[bottom,opacity] duration-300 ease-out lg:!visible lg:!opacity-100",
          (sheetSnap === 2 || (selected && cellExpanded) || pointSheetOpen) &&
            "max-lg:invisible max-lg:opacity-0",
        )}
        style={{ bottom: `calc(${activeSheetHeight} + 1rem + ${MOBILE_NAV_CLEARANCE})` }}
      >
        <QuickOuting species={species} h3={selected} position={position} />
      </div>

      <MapControls
        basemap={basemap}
        onBasemapChange={setBasemap}
        loading={loading}
        onLocate={() => geolocateRef.current?.trigger()}
        pointing={pointing}
        onTogglePointing={togglePointing}
      />

      {pointSheetOpen ? (
        <PointSheet
          point={point}
          spot={openedSpot}
          canManage={canManageSpots}
          onPointChange={onPointChange}
          onClose={closePoint}
        />
      ) : null}

      <CellSheet
        h3={selected}
        day={day}
        onClose={closeCell}
        expanded={cellExpanded}
        onExpandedChange={setCellExpanded}
      />
    </div>
  );
}
