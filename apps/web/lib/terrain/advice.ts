/**
 * Conseils de terrain, produits par des règles déterministes.
 *
 * Pas de LLM, et ce n'est pas un pis-aller : c'est gratuit, instantané, reproductible et
 * débuggable. Chaque règle est une condition sur les attributs de la maille et produit une
 * phrase. On en garde les cinq plus pertinentes.
 *
 * Ces phrases décrivent le TERRAIN et où y chercher. Aucune ne porte sur l'identification ni
 * sur la comestibilité — c'est une limite absolue de l'application.
 */

export type TerrainCell = {
  alt_m: number | null;
  slope_pct: number | null;
  northness: number | null;
  eastness: number | null;
  tpi: number | null;
  twi: number | null;
  forest_share: number | null;
  essence: string | null;
  hosts: string[];
  dist_edge_m: number | null;
  dist_stream_m: number | null;
  soil_ph: number | null;
};

export type Advice = {
  text: string;
  /** Plus la priorité est basse, plus le conseil remonte. */
  priority: number;
};

/** Position topographique, dérivée du TPI centré-réduit sur la population des mailles. */
export function topographicPosition(tpi: number | null): string {
  if (tpi == null) return "indéterminée";
  if (tpi > 1) return "crête";
  if (tpi > 0.4) return "haut de versant";
  if (tpi > -0.4) return "mi-pente";
  if (tpi > -1) return "bas de versant";
  return "fond de vallon";
}

/**
 * Exposition en points cardinaux, recomposée depuis northness et eastness.
 *
 * On stocke le cosinus et le sinus plutôt que l'angle, parce que 359° et 1° sont voisins sur le
 * terrain mais aux antipodes pour un modèle. La recomposition n'a lieu qu'ici, pour l'affichage.
 */
export function aspectLabel(northness: number | null, eastness: number | null): string {
  if (northness == null || eastness == null) return "—";
  if (Math.abs(northness) < 0.08 && Math.abs(eastness) < 0.08) return "terrain plat";

  const degrees = (Math.atan2(eastness, northness) * 180) / Math.PI;
  const normalized = (degrees + 360) % 360;
  const points = ["nord", "nord-est", "est", "sud-est", "sud", "sud-ouest", "ouest", "nord-ouest"];
  return points[Math.round(normalized / 45) % 8]!;
}

const ACIDOPHILES = new Set(["girolle", "cepe-de-bordeaux"]);

export function buildAdvice(
  cell: TerrainCell,
  speciesSlug: string | null,
  date = new Date(),
): string[] {
  const out: Advice[] = [];
  const month = date.getMonth() + 1;

  // Le facteur le plus décisif passe en premier : sans hôte, le reste ne sert à rien.
  if (cell.hosts.length === 0) {
    out.push({
      priority: 0,
      text: "Aucune essence hôte identifiée dans cette maille. Le score y est structurellement bas, quelle que soit la météo.",
    });
  }

  if (cell.dist_edge_m != null && cell.dist_edge_m < 60) {
    out.push({
      priority: 1,
      text: `Bande de lisière, à ${Math.round(cell.dist_edge_m)} m du bord du peuplement : la zone la plus productive pour les bolets, grâce à l'apport de lumière et à la variation thermique.`,
    });
  }

  if (cell.northness != null && cell.northness > 0.5 && month <= 9) {
    out.push({
      priority: 2,
      text: "Versant nord : réservoir d'humidité en saison chaude, souvent en avance sur les versants sud lors des étés secs.",
    });
  }

  if (cell.northness != null && cell.northness < -0.5 && month >= 10) {
    out.push({
      priority: 2,
      text: "Versant sud : se réchauffe plus vite et prolonge la saison de deux à trois semaines après les premiers froids.",
    });
  }

  if (cell.tpi != null && cell.tpi < -1) {
    out.push({
      priority: 3,
      text: "Fond de vallon : l'eau s'y concentre. À privilégier en période sèche, à éviter après de fortes pluies — le sol s'y gorge et la fructification s'arrête.",
    });
  }

  if (cell.tpi != null && cell.tpi > 1) {
    out.push({
      priority: 3,
      text: "Position de crête, drainante : n'y monter qu'après un épisode pluvieux marqué.",
    });
  }

  if (cell.slope_pct != null && cell.slope_pct >= 5 && cell.slope_pct <= 20) {
    out.push({
      priority: 4,
      text: "Pente idéale : elle draine sans lessiver l'horizon organique.",
    });
  }

  if (cell.slope_pct != null && cell.slope_pct > 35) {
    out.push({
      priority: 4,
      text: `Pente forte (${Math.round(cell.slope_pct)} %) : terrain glissant, faible accumulation de litière, rendement généralement médiocre.`,
    });
  }

  if (cell.alt_m != null && cell.alt_m > 700) {
    // Règle empirique : environ 7 jours de décalage par 100 m au-dessus de la plaine.
    const shift = Math.round(((cell.alt_m - 300) / 100) * 7);
    out.push({
      priority: 5,
      text: `À ${Math.round(cell.alt_m)} m, compter environ ${shift} jours de décalage sur la plaine.`,
    });
  }

  if (cell.twi != null && cell.twi > 8 && speciesSlug === "trompette-de-la-mort") {
    out.push({
      priority: 2,
      text: "Indice d'humidité topographique élevé : conditions typiques des trompettes en litière de hêtre.",
    });
  }

  if (cell.soil_ph != null && cell.soil_ph > 7 && speciesSlug && ACIDOPHILES.has(speciesSlug)) {
    out.push({
      priority: 2,
      text: `Sol calcaire (pH ${cell.soil_ph.toFixed(1)}) : peu favorable à cette espèce. Chercher plutôt les lactaires ou les trompettes.`,
    });
  }

  if (cell.dist_stream_m != null && cell.dist_stream_m < 100) {
    out.push({
      priority: 6,
      text: `Cours d'eau à ${Math.round(cell.dist_stream_m)} m : atmosphère plus humide, intéressante en fin d'été.`,
    });
  }

  if (cell.forest_share != null && cell.forest_share < 0.35) {
    out.push({
      priority: 6,
      text: `Couvert forestier partiel (${Math.round(cell.forest_share * 100)} %) : la maille mêle bois et milieu ouvert, à prospecter par bandes.`,
    });
  }

  // ------------------------------------------------------------------------
  // Règles de fond, qui se déclenchent presque toujours.
  //
  // Sans elles, une maille banale — mi-pente, pente moyenne, loin d'une lisière — ne produirait
  // qu'une phrase ou deux, et le panneau paraîtrait vide là où il y a pourtant à dire. Elles
  // portent une priorité élevée : elles ne passent devant aucun conseil spécifique.
  // ------------------------------------------------------------------------

  if (cell.hosts.length > 0) {
    const known = cell.hosts.filter((h) => h in HOST_LABELS);
    if (known.length > 0) {
      out.push({
        priority: 7,
        text: `Peuplement à ${known.map((h) => HOST_LABELS[h]).join(", ")} : ${hostedSpecies(known)}.`,
      });
    }
  }

  if (cell.dist_edge_m != null && cell.dist_edge_m >= 60) {
    out.push({
      priority: 8,
      text: `À ${Math.round(cell.dist_edge_m)} m de la lisière la plus proche : plein couvert. Prospecter les trouées et les bords de piste, où la lumière pénètre.`,
    });
  }

  const position = topographicPosition(cell.tpi);
  if (position === "mi-pente" || position === "bas de versant") {
    out.push({
      priority: 9,
      text: `Position de ${position} : régime d'humidité intermédiaire, la situation la plus régulière d'une saison à l'autre.`,
    });
  }

  out.push({
    priority: 10,
    text: "Marcher lentement, transversalement à la pente : les fructifications s'alignent souvent sur les courbes de niveau.",
  });

  return out
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 5)
    .map((a) => a.text);
}

const HOST_LABELS: Record<string, string> = {
  chene: "chênes",
  chene_vert: "chêne vert",
  hetre: "hêtre",
  chataignier: "châtaignier",
  sapin: "sapin ou épicéa",
  pin: "pins",
  douglas: "douglas",
  conifere: "conifères",
  feuillu: "feuillus indifférenciés",
};

/** Ce que ce cortège d'hôtes peut porter — sans jamais affirmer la présence d'une espèce. */
function hostedSpecies(hosts: string[]): string {
  const set = new Set(hosts);
  const candidates: string[] = [];
  if (set.has("chene") || set.has("chene_vert")) candidates.push("cèpes et tête de nègre");
  if (set.has("hetre")) candidates.push("cèpe de Bordeaux et trompettes");
  if (set.has("chataignier")) candidates.push("cèpes et girolles");
  if (set.has("pin")) candidates.push("lactaire délicieux");
  if (set.has("sapin") || set.has("conifere")) candidates.push("girolles et pied-de-mouton");
  if (candidates.length === 0) return "hôte générique, sans espèce cible privilégiée";
  // Virgule et non « et » : les candidats contiennent déjà des « et » internes, et
  // « lactaire délicieux et girolles et pied-de-mouton » devient illisible.
  return `hôte possible pour ${candidates.slice(0, 2).join(", ")}`;
}
