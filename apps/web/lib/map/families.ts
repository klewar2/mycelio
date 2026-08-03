/**
 * Familles grand public.
 *
 * Personne ne part en forêt en se disant « je vais chercher du Boletus reticulatus plutôt que du
 * Boletus edulis ». On cherche des cèpes. Les trois espèces de cèpe occupent d'ailleurs des
 * créneaux saisonniers qui se relaient : les afficher séparément oblige le lecteur à comparer
 * trois cartes pour reconstituer ce qu'une seule dit mieux.
 *
 * Le regroupement lui-même vient de la colonne `species.family`, donc de la base : ce module ne
 * fait que le mettre en forme. Aucune correspondance espèce → famille n'est écrite ici.
 */

export type Species = {
  id: number;
  slug: string;
  common_name_fr: string;
  scientific_name: string;
  family: string | null;
  notes_terrain: string | null;
};

export type Family = {
  /** Clé de sélection. `ALL_FAMILIES` pour l'entrée « Tous les champignons ». */
  key: string;
  label: string;
  /** Les espèces qui la composent, dans l'ordre d'affichage de la base. */
  species: Species[];
  slugs: string[];
};

/** Sélection par défaut : le meilleur de toutes les espèces actives. */
export const ALL_FAMILIES = "*";

/**
 * Regroupe les espèces par famille, en conservant l'ordre de `sort_order`.
 *
 * L'API renvoyant déjà les espèces triées, un simple parcours suffit : la première apparition
 * d'une famille fixe sa position. Une espèce sans famille forme la sienne, sous son propre nom —
 * ajouter une espèce depuis /admin/especes sans y penser ne la fait donc pas disparaître.
 */
export function groupByFamily(species: Species[]): Family[] {
  const families: Family[] = [];
  const byLabel = new Map<string, Family>();

  for (const item of species) {
    const label = item.family?.trim() || item.common_name_fr;
    let family = byLabel.get(label);
    if (!family) {
      family = { key: label, label, species: [], slugs: [] };
      byLabel.set(label, family);
      families.push(family);
    }
    family.species.push(item);
    family.slugs.push(item.slug);
  }

  return families;
}

/** Les slugs interrogés pour une sélection donnée. */
export function slugsFor(families: Family[], key: string): string[] {
  if (key === ALL_FAMILIES) return families.flatMap((f) => f.slugs);
  return families.find((f) => f.key === key)?.slugs ?? [];
}
