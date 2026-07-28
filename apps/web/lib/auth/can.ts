import type { Permission } from "./permissions";
import type { Tables } from "@/types/database";

export type SessionContext = {
  userId: string;
  email: string | null;
  profile: Tables<"profiles">;
  permissions: ReadonlySet<string>;
};

/**
 * L'unique fonction d'autorisation côté TypeScript. Le code ne teste jamais un rôle : il teste
 * une permission, exactement comme les politiques RLS le font avec public.can().
 *
 * Fonction pure sur un Set, donc testable sans base.
 *
 * Portée : elle sert l'affichage et le confort — masquer un bouton, renvoyer un 403 propre. La
 * vraie frontière de sécurité reste la RLS. Les deux lisent la même table `role_permissions`,
 * donc la matrice paramétrable garde son sens de bout en bout.
 */
export function can(ctx: SessionContext | null, permission: Permission): boolean {
  return ctx?.permissions.has(permission) ?? false;
}

export function canAny(ctx: SessionContext | null, permissions: Permission[]): boolean {
  return permissions.some((p) => can(ctx, p));
}
