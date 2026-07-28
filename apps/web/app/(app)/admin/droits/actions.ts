"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import { humanizeDbError } from "@/lib/auth/errors";
import { ROLES, type AppRole } from "@/lib/auth/permissions";

export type ActionState = { error: string | null; success: string | null };

export async function togglePermission(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission("admin.roles.manage");

  const role = String(formData.get("role") ?? "");
  const permission = String(formData.get("permission") ?? "");
  const grant = String(formData.get("grant") ?? "") === "true";

  if (!(ROLES as readonly string[]).includes(role) || !permission) {
    return { error: "Requête invalide.", success: null };
  }

  const supabase = await createClient();

  const { error } = grant
    ? await supabase
        .from("role_permissions")
        .insert({ role: role as AppRole, permission })
    : await supabase
        .from("role_permissions")
        .delete()
        .eq("role", role as AppRole)
        .eq("permission", permission);

  if (error) return { error: humanizeDbError(error.message), success: null };

  // La matrice pilote la RLS et la navigation : on invalide tout l'arbre, pas la seule page.
  revalidatePath("/", "layout");
  return { error: null, success: null };
}
