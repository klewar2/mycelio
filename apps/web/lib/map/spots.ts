/**
 * Un spot : un coin repéré, pas une sortie.
 *
 * La distinction porte tout le reste. Une sortie raconte le passé — j'y étais, j'ai trouvé ou
 * non — et c'est la matière du modèle. Un spot vise l'avenir : un endroit qu'on veut aller
 * voir, qu'on tient d'un ami ou qu'on a repéré sur la carte, sans date et sans observation.
 *
 * Il n'a volontairement pas de mode « partagé », contrairement à une sortie : un coin se garde.
 */
export type Spot = {
  id: string;
  label: string;
  notes: string | null;
  lat: number;
  lng: number;
};
