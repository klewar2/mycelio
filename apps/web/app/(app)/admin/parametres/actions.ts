"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import { humanizeDbError } from "@/lib/auth/errors";

export type ActionState = { error: string | null; success: string | null };

/**
 * Une seule action pour TOUS les paramètres, quel que soit leur type.
 *
 * La valeur arrive encodée en JSON et n'est pas interprétée ici : c'est le trigger
 * `validate_setting` qui vérifie le type, les bornes et l'appartenance à l'énumération. Le
 * formulaire n'est qu'un confort ; la vérité est en base, et le rendu générique ne peut donc
 * pas laisser passer une valeur invalide.
 */
export async function updateSetting(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission("admin.settings.manage");

  const key = String(formData.get("key") ?? "");
  const raw = String(formData.get("value") ?? "");
  if (!key) return { error: "Requête invalide.", success: null };

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { error: "La valeur n'est pas un JSON valide.", success: null };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .update({ value: value as never })
    .eq("key", key);

  if (error) return { error: humanizeDbError(error.message), success: null };

  revalidatePath("/", "layout");
  return { error: null, success: "Paramètre enregistré." };
}
