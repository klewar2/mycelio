/**
 * Les clés de permission, en un seul endroit.
 *
 * Elles doublent la table `permissions` en base, mais uniquement pour donner de l'autocomplétion
 * et faire échouer `tsc` sur une clé mal orthographiée. La vérité reste la base : c'est elle qui
 * décide qui a quoi, via la matrice `role_permissions` éditable en UI.
 *
 * Un test pgTAP (07) vérifie qu'un droit change bien de valeur quand la matrice change, sans
 * redéploiement — c'est ce qui prouve qu'aucun rôle n'est codé en dur.
 */
export const PERMISSIONS = [
  "map.view",
  "finds.create",
  "finds.export",
  "admin.access",
  "admin.users.manage",
  "admin.roles.manage",
  "admin.settings.manage",
  "admin.species.manage",
  "admin.datasets.manage",
  "admin.pipeline.run",
  "admin.audit.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = ["super_admin", "admin", "member", "viewer"] as const;
export type AppRole = (typeof ROLES)[number];

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super-admin",
  admin: "Admin",
  member: "Membre",
  viewer: "Lecteur",
};

/**
 * Les rôles du plus faible au plus fort. Cet ordre n'est pas contraint en base — le super_admin
 * compose la matrice comme il veut — mais c'est le défaut, et c'est ce que la lecture en coupe
 * topographique de /admin/roles donne à voir.
 */
export const ROLES_ASCENDING: AppRole[] = ["viewer", "member", "admin", "super_admin"];
