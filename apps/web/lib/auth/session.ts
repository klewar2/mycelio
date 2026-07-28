import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { can, type SessionContext } from "./can";
import type { Permission } from "./permissions";

/**
 * Charge l'identité et les droits de l'utilisateur courant, une seule fois par requête.
 *
 * `cache()` mémoïse l'appel pour toute la durée du rendu : le layout, la page et les composants
 * peuvent l'appeler librement sans multiplier les allers-retours vers la base.
 *
 * On utilise `auth.getUser()` et non `auth.getSession()` : seul le premier revalide le jeton
 * auprès du serveur Auth. `getSession()` se contente de relire le cookie, qui est modifiable
 * côté client et ne prouve donc rien.
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // Un compte désactivé n'obtient aucun contexte : il est traité comme un visiteur anonyme.
  if (!profile || !profile.is_active) return null;

  const { data: rows } = await supabase
    .from("role_permissions")
    .select("permission")
    .eq("role", profile.role);

  return {
    userId: user.id,
    email: user.email ?? null,
    profile,
    permissions: new Set(rows?.map((r) => r.permission) ?? []),
  };
});

/** Exige une session. À utiliser dans les pages qui ne demandent aucune permission précise. */
export async function requireSession(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/connexion");
  return ctx;
}

/**
 * Exige une permission.
 *
 * À appeler dans CHAQUE page du groupe (admin), et pas seulement dans son layout : en App
 * Router, les pages se rendent indépendamment lors des navigations douces, un contrôle posé
 * uniquement sur le layout ne les couvrirait pas.
 */
export async function requirePermission(permission: Permission): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/connexion");
  if (!can(ctx, permission)) redirect("/carte");
  return ctx;
}
