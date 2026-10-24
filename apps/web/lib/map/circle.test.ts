import { describe, expect, it } from "vitest";
import {
  circleSentence,
  daysAgo,
  familyLabels,
  forFamily,
  summarize,
  zoneOf,
  type Signal,
} from "./circle";
import { groupByFamily, type Species } from "./families";

/**
 * Ce module transforme des signaux en phrases qu'un débutant lit d'un coup d'œil. Une erreur ne
 * se verrait nulle part ailleurs : une famille mal rattachée ou un « hier » décalé d'un jour
 * disent quelque chose de faux, avec assurance, sur le seul sujet où l'utilisateur fait
 * confiance au cercle plus qu'à la carte.
 */

const species: Species[] = [
  { id: 1, slug: "cepe-de-bordeaux", common_name_fr: "Cèpe de Bordeaux", scientific_name: "Boletus edulis", family: "Cèpes", notes_terrain: null },
  { id: 2, slug: "tete-de-negre", common_name_fr: "Tête de nègre", scientific_name: "Boletus aereus", family: "Cèpes", notes_terrain: null },
  { id: 4, slug: "girolle", common_name_fr: "Girolle", scientific_name: "Cantharellus cibarius", family: "Girolles", notes_terrain: null },
];
const families = groupByFamily(species);
const labels = familyLabels(families);
const today = new Date(2026, 9, 24, 21, 30); // un samedi soir, heure locale

// Deux secteurs de résolution 6 voisins de Toulouse.
const A = "863960057ffffff";
const B = "863960c57ffffff";

const signals: Signal[] = [
  { zone: A, occurred_on: "2026-10-22", found: true, species_ids: [2], mine: false },
  { zone: A, occurred_on: "2026-10-23", found: false, species_ids: [], mine: false },
  { zone: B, occurred_on: "2026-10-24", found: true, species_ids: [4], mine: true },
];

describe("daysAgo", () => {
  it("compte en jours calendaires locaux, pas en tranches de 24 h", () => {
    expect(daysAgo("2026-10-24", today)).toBe(0);
    expect(daysAgo("2026-10-23", today)).toBe(1);
    // 21 h 30 le 24 : le 22 est bien « il y a 2 jours », quelle que soit l'heure.
    expect(daysAgo("2026-10-22", today)).toBe(2);
  });
});

describe("forFamily", () => {
  it("rattache une tête de nègre aux cèpes, par la famille et non par le nom", () => {
    const cepes = forFamily(signals, families, "Cèpes");
    expect(cepes.filter((s) => s.found)).toHaveLength(1);
    expect(cepes.find((s) => s.found)?.species_ids).toEqual([2]);
  });

  it("garde les bredouilles pour toutes les familles", () => {
    expect(forFamily(signals, families, "Girolles").filter((s) => !s.found)).toHaveLength(1);
  });
});

describe("summarize et circleSentence", () => {
  it("annonce la trouvaille la plus récente, et les bredouilles à côté", () => {
    const zones = summarize(forFamily(signals, families, "Cèpes"), labels, today);
    expect(circleSentence(zones, 14)).toBe(
      "Le cercle a trouvé des cèpes il y a 2 jours par ici — et 1 sortie bredouille.",
    );
  });

  it("énumère les familles de la plus récente à la plus ancienne", () => {
    const zones = summarize(signals, labels, today);
    expect(circleSentence(zones, 14)).toBe(
      "Le cercle a trouvé des girolles et des cèpes aujourd'hui par ici — et 1 sortie bredouille.",
    );
  });

  it("dit les bredouilles seules quand rien n'a été trouvé", () => {
    const zones = summarize(signals.filter((s) => !s.found), labels, today);
    expect(circleSentence(zones, 14)).toBe(
      "1 sortie bredouille signalée par ici, la dernière hier.",
    );
  });

  it("dit aussi le silence, avec sa durée", () => {
    expect(circleSentence([], 14)).toBe("Rien de signalé par le cercle ici depuis 14 jours.");
  });
});

describe("zoneOf", () => {
  it("ramène une maille de 280 m à son secteur", () => {
    expect(zoneOf("893960056a3ffff", signals)).toBe(A);
  });

  it("ne rend rien tant qu'aucun signal n'a fixé la résolution", () => {
    expect(zoneOf("893960056a3ffff", [])).toBeNull();
  });
});
