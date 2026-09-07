/**
 * Coordonnées géographiques : les écrire pour un GPS, et relire ce qu'on y colle.
 *
 * Un seul format en SORTIE — degrés décimaux, latitude puis longitude, séparés par une virgule
 * et un espace. C'est ce que comprennent, tel quel et sans réglage, Google Maps, Apple Plans,
 * Waze, OsmAnd et Organic Maps. Choisir les degrés-minutes-secondes pour « faire GPS » obligerait
 * la moitié des applications à refuser le collage.
 *
 * Cinq décimales, soit environ 1,1 m à cette latitude. Six seraient du bruit — la carte annonce
 * des mailles de 280 m, et une coordonnée au centimètre laisserait croire à une précision que ni
 * le modèle ni le doigt sur l'écran n'ont jamais eue. Quatre, en revanche, feraient déjà 11 m,
 * de quoi manquer l'arbre.
 *
 * En ENTRÉE, au contraire, on est aussi tolérant que possible : la coordonnée arrive d'un
 * message, d'une capture d'écran retapée, d'un autre GPS. Refuser un collage pour un degré mal
 * placé ferait retomber l'utilisateur sur la saisie manuelle, qui est exactement ce que cette
 * fonctionnalité doit éviter.
 */

/** Le format d'échange : « 43.45123, 1.89345 ». */
export function formatCoords(lat: number, lng: number, digits = 5): string {
  return `${lat.toFixed(digits)}, ${lng.toFixed(digits)}`;
}

export type Coords = { lat: number; lng: number };

type Axis = "lat" | "lng";
type Component = { value: number; axis: Axis | null };

/**
 * Lit un couple de coordonnées écrit à peu près n'importe comment.
 *
 * Sont acceptés : les degrés décimaux (`43.45123, 1.89345`), les degrés-minutes-secondes
 * (`43°27'04.4"N 1°53'36.4"E`, ce que copie Google Maps), les degrés-minutes décimales
 * (`43° 27.073' N`), les lettres d'hémisphère devant ou derrière — `O` comme Ouest compris —,
 * et la virgule décimale française.
 *
 * Rend `null` plutôt que d'inventer : mieux vaut un champ qui refuse qu'un spot posé à 300 km.
 * En particulier, aucune permutation n'est devinée — `1.89, 43.45` est refusé parce que 1,89
 * est une latitude parfaitement valide, et qu'un logiciel qui corrige silencieusement l'ordre
 * se trompera le jour où l'ordre était bon.
 */
export function parseCoords(input: string): Coords | null {
  const text = input
    .trim()
    // Espaces insécables (collage depuis un site français), apostrophes et guillemets
    // typographiques, symbole ordinal masculin employé comme degré.
    .replace(/[\u00A0\u202F\u2009]/g, " ")
    .replace(/[‘’′´`]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/º/g, "°")
    .toUpperCase();

  if (!text) return null;

  const parts = split(text);
  if (!parts) return null;

  const first = parseComponent(parts[0]);
  const second = parseComponent(parts[1]);
  if (!first || !second) return null;

  // Deux composantes sur le même axe (« 43N 44N ») ne décrivent pas un point.
  if (first.axis && first.axis === second.axis) return null;

  // Sans lettre d'hémisphère, l'ordre fait foi : latitude puis longitude, comme partout.
  const latFirst = first.axis ? first.axis === "lat" : second.axis !== "lat";
  const lat = latFirst ? first.value : second.value;
  const lng = latFirst ? second.value : first.value;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  return { lat, lng };
}

/**
 * Coupe la chaîne en deux composantes.
 *
 * La difficulté tient à la virgule, qui sépare les deux nombres en anglais et les décimales en
 * français — parfois les deux dans la même chaîne. Trois règles, dans cet ordre, couvrent ce
 * qu'on rencontre réellement :
 *
 *   `;` présent          → c'est lui le séparateur, toute virgule est décimale
 *   une seule virgule    → c'est elle le séparateur
 *   sinon                → l'espace sépare, et à défaut la virgule du milieu (« 43,45,1,89 »)
 */
function split(text: string): [string, string] | null {
  if (text.includes(";")) {
    const parts = text.split(";");
    return parts.length === 2 ? [parts[0]!, parts[1]!] : null;
  }

  const commas = (text.match(/,/g) ?? []).length;
  if (commas === 1) {
    const at = text.indexOf(",");
    return [text.slice(0, at), text.slice(at + 1)];
  }

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 2) return [words[0]!, words[1]!];

  if (commas === 3) {
    const at = text.indexOf(",", text.indexOf(",") + 1);
    return [text.slice(0, at), text.slice(at + 1)];
  }

  return null;
}

/** Degrés décimaux, DMS ou DMM, avec ou sans lettre d'hémisphère. */
function parseComponent(raw: string): Component | null {
  let text = raw.replace(/^[\s,;]+|[\s,;]+$/g, "");
  if (!text) return null;

  const head = /^([NSEWO])\s*/.exec(text);
  const tail = /\s*([NSEWO])$/.exec(text);
  // Une lettre de chaque côté (« N43N ») n'est pas une tolérance, c'est une faute de frappe.
  if (head && tail) return null;

  const letter = head?.[1] ?? tail?.[1] ?? null;
  if (head) text = text.slice(head[0].length);
  if (tail) text = text.slice(0, text.length - tail[0].length);
  text = text.trim();

  let sign = letter === "S" || letter === "W" || letter === "O" ? -1 : 1;
  const axis: Axis | null = letter ? (letter === "N" || letter === "S" ? "lat" : "lng") : null;

  if (text.startsWith("-")) {
    sign = -sign;
    text = text.slice(1).trim();
  } else if (text.startsWith("+")) {
    text = text.slice(1).trim();
  }

  const parsed =
    /^(\d+(?:[.,]\d+)?)\s*°?\s*(?:(\d+(?:[.,]\d+)?)\s*'?\s*(?:(\d+(?:[.,]\d+)?)\s*"?\s*)?)?$/.exec(
      text,
    );
  if (!parsed) return null;

  const degrees = decimal(parsed[1]!);
  const minutes = parsed[2] == null ? 0 : decimal(parsed[2]);
  const seconds = parsed[3] == null ? 0 : decimal(parsed[3]);

  // Sans ce contrôle, « 43 90 » passerait pour 44,5° : une chaîne qui n'est pas une coordonnée
  // rendrait une coordonnée plausible, ce qui est le seul résultat vraiment dangereux ici.
  if (minutes >= 60 || seconds >= 60) return null;

  return { value: sign * (degrees + minutes / 60 + seconds / 3600), axis };
}

function decimal(value: string): number {
  return Number(value.replace(",", "."));
}
