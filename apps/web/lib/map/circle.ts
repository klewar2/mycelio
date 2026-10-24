import { cellToBoundary, cellToLatLng, cellToParent, getResolution } from "h3-js";
import type { FeatureCollection, Polygon } from "geojson";
import { ALL_FAMILIES, type Family } from "./families";

/**
 * Trouvailles du cercle — ce que la carte ne sait pas : est-ce que ça sort VRAIMENT.
 *
 * Un signal est une sortie qu'un membre du cercle a choisi de signaler, réduite par la base à
 * un secteur H3 (résolution 6 par défaut, 36 km²), une date, trouvé ou bredouille, et les
 * espèces trouvées. Jamais la maille, jamais les notes : `circle_signals()` ne les rend pas, et
 * la RLS interdit de les lire autrement (migration 0030, test pgTAP 10).
 *
 * Ce module ne fait que mettre ces lignes en phrases. La correspondance espèce → famille reste
 * celle de `species.family`, via les familles déjà construites pour la carte.
 */
export type Signal = {
  zone: string;
  /** AAAA-MM-JJ. */
  occurred_on: string;
  found: boolean;
  species_ids: number[];
  /** Une sortie de l'utilisateur courant — pour écrire « toi », jamais pour nommer un autre. */
  mine: boolean;
};

/** Jours calendaires écoulés, en heure locale : une sortie d'hier soir date d'hier, pas d'aujourd'hui. */
export function daysAgo(date: string, today: Date = new Date()): number {
  const [y, m, d] = date.split("-").map(Number);
  const then = new Date(y!, m! - 1, d!);
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((now.getTime() - then.getTime()) / 86_400_000);
}

export function whenLabel(days: number): string {
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  return `il y a ${days} jours`;
}

/** Forme courte, pour l'étiquette posée sur la carte. */
export function whenShort(days: number): string {
  if (days <= 0) return "auj.";
  if (days === 1) return "hier";
  return `${days} j`;
}

/**
 * Le secteur d'une maille, à la résolution des signaux.
 *
 * La résolution se lit sur les signaux eux-mêmes plutôt que sur le réglage : c'est celle que la
 * base a réellement appliquée, et les deux ne peuvent donc pas diverger.
 */
export function zoneOf(h3: string, signals: Signal[]): string | null {
  const first = signals[0];
  if (!first) return null;
  const resolution = getResolution(first.zone);
  return getResolution(h3) <= resolution ? h3 : cellToParent(h3, resolution);
}

/**
 * Les signaux qui parlent de la famille choisie.
 *
 * Une trouvaille ne compte que pour sa famille : des girolles ne disent pas que les cèpes sont
 * sortis. Une bredouille compte pour toutes — rien trouvé, c'est rien de rien.
 */
export function forFamily(signals: Signal[], families: Family[], chosen: string): Signal[] {
  if (chosen === ALL_FAMILIES) return signals;
  const ids = new Set(families.find((f) => f.key === chosen)?.species.map((s) => s.id) ?? []);
  return signals.filter((s) => !s.found || s.species_ids.some((id) => ids.has(id)));
}

/** Libellé de famille de chaque espèce — « Cèpes » pour la tête de nègre. */
export function familyLabels(families: Family[]): Map<number, string> {
  const out = new Map<number, string>();
  for (const family of families) for (const s of family.species) out.set(s.id, family.label);
  return out;
}

export type ZoneSummary = {
  zone: string;
  /** [lng, lat], pour poser l'étiquette. */
  center: [number, number];
  /** Jours depuis la dernière trouvaille, ou null s'il n'y en a pas. */
  lastFind: number | null;
  lastEmpty: number | null;
  finds: number;
  empties: number;
  /** Familles trouvées, de la plus récente à la plus ancienne. */
  found: string[];
};

export function summarize(
  signals: Signal[],
  labels: Map<number, string>,
  today: Date = new Date(),
): ZoneSummary[] {
  const byZone = new Map<string, Signal[]>();
  for (const signal of signals) {
    const list = byZone.get(signal.zone) ?? [];
    list.push(signal);
    byZone.set(signal.zone, list);
  }

  return [...byZone.entries()].map(([zone, list]) => {
    // La base les rend déjà du plus récent au plus ancien ; on ne s'y fie pas pour autant.
    const sorted = [...list].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));
    const finds = sorted.filter((s) => s.found);
    const empties = sorted.filter((s) => !s.found);
    const found: string[] = [];
    for (const signal of finds) {
      const names = signal.species_ids.length
        ? signal.species_ids.map((id) => labels.get(id) ?? "champignons")
        : ["champignons"];
      for (const name of names) if (!found.includes(name)) found.push(name);
    }
    const [lat, lng] = cellToLatLng(zone);
    return {
      zone,
      center: [lng, lat],
      lastFind: finds[0] ? daysAgo(finds[0].occurred_on, today) : null,
      lastEmpty: empties[0] ? daysAgo(empties[0].occurred_on, today) : null,
      finds: finds.length,
      empties: empties.length,
      found,
    };
  });
}

/** « des cèpes », « des cèpes et des girolles », « des cèpes, des girolles et des morilles ». */
export function listFamilies(labels: string[]): string {
  const items = labels.map((label) => `des ${label.toLocaleLowerCase("fr-FR")}`);
  if (items.length <= 1) return items[0] ?? "des champignons";
  return `${items.slice(0, -1).join(", ")} et ${items.at(-1)}`;
}

function sorties(count: number, word: string): string {
  return `${count} sortie${count > 1 ? "s" : ""} ${word}${count > 1 ? "s" : ""}`;
}

/**
 * Ce que le cercle a vu dans un ensemble de secteurs, en une phrase.
 *
 * Écrite pour un débutant, comme le reste de la carte : une phrase qu'on dirait à voix haute,
 * pas un tableau de compteurs.
 */
export function circleSentence(zones: ZoneSummary[], windowDays: number): string {
  const finds = zones.filter((z) => z.lastFind != null);
  const empties = zones.reduce((sum, z) => sum + z.empties, 0);
  const lastEmpty = zones.reduce<number | null>(
    (best, z) => (z.lastEmpty != null && (best == null || z.lastEmpty < best) ? z.lastEmpty : best),
    null,
  );

  if (finds.length > 0) {
    const latest = Math.min(...finds.map((z) => z.lastFind!));
    const found: string[] = [];
    for (const zone of [...finds].sort((a, b) => a.lastFind! - b.lastFind!)) {
      for (const name of zone.found) if (!found.includes(name)) found.push(name);
    }
    const head = `Le cercle a trouvé ${listFamilies(found)} ${whenLabel(latest)} par ici`;
    return empties > 0 ? `${head} — et ${sorties(empties, "bredouille")}.` : `${head}.`;
  }

  if (empties > 0 && lastEmpty != null) {
    return `${sorties(empties, "bredouille")} signalée${empties > 1 ? "s" : ""} par ici, la dernière ${whenLabel(lastEmpty)}.`;
  }

  return `Rien de signalé par le cercle ici depuis ${windowDays} jours.`;
}

/** Les secteurs, en polygones : la carte les dessine en pointillé, par-dessus les mailles. */
export function zonesGeoJSON(zones: ZoneSummary[]): FeatureCollection<Polygon> {
  return {
    type: "FeatureCollection",
    features: zones.map((zone) => ({
      type: "Feature" as const,
      geometry: { type: "Polygon" as const, coordinates: [cellToBoundary(zone.zone, true)] },
      properties: { zone: zone.zone, found: zone.lastFind != null ? 1 : 0 },
    })),
  };
}
