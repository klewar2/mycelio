"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import { humanizeDbError } from "@/lib/auth/errors";

export type ActionState = { error: string | null; success: string | null };

/**
 * Enregistre un spot repéré.
 *
 * Les coordonnées arrivent déjà en nombres : le client les a analysées pour poser l'épingle,
 * et lui en faire renvoyer le texte pour le réanalyser ici ferait exister deux analyseurs qui
 * peuvent diverger. On revalide en revanche les bornes — l'action serveur est une porte
 * publique, appelable sans passer par le formulaire.
 */
export async function saveSpot(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requirePermission("spots.manage");

  const label = String(formData.get("label") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const lat = Number(formData.get("lat"));
  const lng = Number(formData.get("lng"));

  if (!label) {
    return { error: "Donne un nom à ce spot pour le retrouver.", success: null };
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { error: "Ces coordonnées ne désignent aucun point sur la Terre.", success: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("spots").insert({
    user_id: ctx.userId,
    label: label.slice(0, 80),
    notes: notes?.slice(0, 500) ?? null,
    lat,
    lng,
  });

  if (error) return { error: humanizeDbError(error.message), success: null };

  revalidatePath("/carte");
  return { error: null, success: "Spot enregistré." };
}

export async function deleteSpot(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("spots.manage");

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Requête invalide.", success: null };

  const supabase = await createClient();
  // La RLS restreint déjà la suppression au propriétaire : filtrer sur user_id ici donnerait
  // l'illusion que c'est ce filtre qui protège. Même raison qu'au carnet de sorties.
  const { error } = await supabase.from("spots").delete().eq("id", id);

  if (error) return { error: humanizeDbError(error.message), success: null };

  revalidatePath("/carte");
  return { error: null, success: "Spot supprimé." };
}
