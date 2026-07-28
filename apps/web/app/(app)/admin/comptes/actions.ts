"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/session";
import { humanizeDbError } from "@/lib/auth/errors";
import { ROLES, type AppRole } from "@/lib/auth/permissions";

export type ActionState = { error: string | null; success: string | null };

function parseRole(value: FormDataEntryValue | null): AppRole | null {
  const role = String(value ?? "");
  return (ROLES as readonly string[]).includes(role) ? (role as AppRole) : null;
}

/**
 * Création d'un compte, en deux temps — et l'ordre est la sécurité même.
 *
 * `auth.admin.createUser` passe par service_role, qui n'a pas d'auth.uid() : les gardes
 * relatives à l'acteur y sont désarmées. Le trigger en base refuse donc de lire le rôle depuis
 * les métadonnées et crée systématiquement un `viewer`.
 *
 * Le rôle demandé est ensuite posé par un UPDATE distinct, avec le client porteur de la session
 * de l'administrateur. Cet UPDATE traverse les gardes sous une vraie identité : un admin qui
 * tente de fabriquer un super_admin est refusé PAR LA BASE.
 *
 * Si cette seconde étape échoue, le compte existe en `viewer` : un état sûr et corrigeable,
 * jamais sur-privilégié.
 */
export async function createAccount(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission("admin.users.manage");

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const role = parseRole(formData.get("role"));

  if (!email || !displayName) return { error: "Adresse et nom affiché sont requis.", success: null };
  if (password.length < 8) {
    return { error: "Le mot de passe doit faire au moins 8 caractères.", success: null };
  }
  if (!role) return { error: "Rôle inconnu.", success: null };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });

  if (error || !data.user) {
    return {
      error: error?.message.includes("already")
        ? "Un compte existe déjà avec cette adresse."
        : (error?.message ?? "La création du compte a échoué."),
      success: null,
    };
  }

  if (role !== "viewer") {
    const supabase = await createClient();
    const { error: roleError } = await supabase
      .from("profiles")
      .update({ role })
      .eq("id", data.user.id);

    if (roleError) {
      revalidatePath("/admin/comptes");
      return {
        error: `Compte créé, mais le rôle n'a pas pu être attribué : ${humanizeDbError(roleError.message)} Le compte reste en lecteur.`,
        success: null,
      };
    }
  }

  revalidatePath("/admin/comptes");
  return { error: null, success: `Compte créé pour ${email}.` };
}

export async function setRole(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("admin.users.manage");

  const userId = String(formData.get("user_id") ?? "");
  const role = parseRole(formData.get("role"));
  if (!userId || !role) return { error: "Requête invalide.", success: null };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);

  if (error) return { error: humanizeDbError(error.message), success: null };

  revalidatePath("/admin/comptes");
  return { error: null, success: "Rôle mis à jour." };
}

export async function setActive(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("admin.users.manage");

  const userId = String(formData.get("user_id") ?? "");
  const isActive = String(formData.get("is_active") ?? "") === "true";
  if (!userId) return { error: "Requête invalide.", success: null };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ is_active: isActive })
    .eq("id", userId);

  if (error) return { error: humanizeDbError(error.message), success: null };

  revalidatePath("/admin/comptes");
  return { error: null, success: isActive ? "Compte réactivé." : "Compte désactivé." };
}

export async function resetPassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission("admin.users.manage");

  const userId = String(formData.get("user_id") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!userId) return { error: "Requête invalide.", success: null };
  if (password.length < 8) {
    return { error: "Le mot de passe doit faire au moins 8 caractères.", success: null };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });

  if (error) return { error: error.message, success: null };
  return { error: null, success: "Mot de passe redéfini. Transmets-le à la personne." };
}

/**
 * Suppression d'un compte, elle aussi en deux temps.
 *
 * On supprime d'abord la ligne `profiles` avec le client utilisateur, pour que les gardes se
 * déclenchent sous une vraie identité. Ce n'est qu'ensuite qu'on supprime l'utilisateur Auth.
 * L'ordre inverse contournerait les gardes relatives à l'acteur.
 */
export async function deleteAccount(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission("admin.users.manage");

  const userId = String(formData.get("user_id") ?? "");
  if (!userId) return { error: "Requête invalide.", success: null };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").delete().eq("id", userId);

  if (error) return { error: humanizeDbError(error.message), success: null };

  const admin = createAdminClient();
  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError) {
    revalidatePath("/admin/comptes");
    return { error: `Profil supprimé, mais le compte Auth subsiste : ${authError.message}`, success: null };
  }

  revalidatePath("/admin/comptes");
  return { error: null, success: "Compte supprimé." };
}
