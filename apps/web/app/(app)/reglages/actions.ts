"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";

export type ActionState = { error: string | null; success: string | null };

export async function updateProfile(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireSession();
  const displayName = String(formData.get("display_name") ?? "").trim();

  if (!displayName) return { error: "Le nom affiché ne peut pas être vide.", success: null };

  const supabase = await createClient();
  // Client porteur de la session : la RLS et les triggers voient le vrai acteur. Le rôle et
  // l'activation restent hors d'atteinte, quoi qu'on envoie ici.
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName })
    .eq("id", ctx.userId);

  if (error) return { error: error.message, success: null };

  revalidatePath("/reglages");
  return { error: null, success: "Nom affiché enregistré." };
}

export async function updatePassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) {
    return { error: "Le mot de passe doit faire au moins 8 caractères.", success: null };
  }
  if (password !== confirm) {
    return { error: "Les deux mots de passe ne correspondent pas.", success: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) return { error: error.message, success: null };

  return { error: null, success: "Mot de passe modifié." };
}
