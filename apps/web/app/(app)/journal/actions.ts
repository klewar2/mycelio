"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import { humanizeDbError } from "@/lib/auth/errors";

export type ActionState = { error: string | null; success: string | null };

function coord(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Enregistre une sortie.
 *
 * Le chemin « bredouille » est volontairement sans champ obligatoire : une date, une position
 * si elle est connue, et c'est tout. Le cahier des charges est explicite là-dessus — une sortie
 * vide doit s'enregistrer aussi vite qu'une trouvaille, sans quoi personne ne le fera, et c'est
 * précisément cette donnée qui manque à tout le monde.
 */
export async function saveOuting(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requirePermission("finds.create");

  const foundNothing = formData.get("found_nothing") === "true";
  const lat = coord(formData.get("lat"));
  const lng = coord(formData.get("lng"));
  const h3 = String(formData.get("h3_index") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const occurred = String(formData.get("occurred_on") ?? "").trim();
  const duration = coord(formData.get("duration_min"));
  const speciesId = coord(formData.get("species_id"));
  const quantity = coord(formData.get("quantity_g"));
  const maturity = String(formData.get("maturity") ?? "").trim() || null;

  const supabase = await createClient();

  const { data: outing, error } = await supabase
    .from("outings")
    .insert({
      user_id: ctx.userId,
      occurred_on: occurred || new Date().toISOString().slice(0, 10),
      h3_index: h3,
      // PostGIS attend du WKT ; PostgREST le convertit à l'insertion en geography.
      location: lat != null && lng != null ? `SRID=4326;POINT(${lng} ${lat})` : null,
      duration_min: duration,
      found_nothing: foundNothing,
      notes,
      visibility: formData.get("visibility") === "shared" ? "shared" : "private",
    })
    .select("id")
    .single();

  if (error || !outing) {
    return { error: humanizeDbError(error?.message), success: null };
  }

  // Une trouvaille n'est enregistrée que si la sortie n'est pas bredouille et qu'une espèce est
  // renseignée — sans quoi on créerait des lignes vides.
  if (!foundNothing && speciesId != null) {
    const { error: findError } = await supabase.from("finds").insert({
      outing_id: outing.id,
      species_id: speciesId,
      quantity_g: quantity,
      maturity,
      location: lat != null && lng != null ? `SRID=4326;POINT(${lng} ${lat})` : null,
    });
    if (findError) {
      revalidatePath("/journal");
      return {
        error: `Sortie enregistrée, mais la trouvaille n'a pas pu l'être : ${humanizeDbError(findError.message)}`,
        success: null,
      };
    }
  }

  revalidatePath("/journal");
  revalidatePath("/carte");
  return {
    error: null,
    success: foundNothing ? "Sortie bredouille enregistrée." : "Sortie enregistrée.",
  };
}

export async function deleteOuting(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("finds.create");
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Requête invalide.", success: null };

  const supabase = await createClient();
  // La RLS restreint déjà la suppression au propriétaire : inutile de filtrer sur user_id ici,
  // et le faire donnerait l'illusion que c'est cette condition qui protège.
  const { error } = await supabase.from("outings").delete().eq("id", id);

  if (error) return { error: humanizeDbError(error.message), success: null };

  revalidatePath("/journal");
  return { error: null, success: "Sortie supprimée." };
}

export async function toggleVisibility(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission("finds.create");
  const id = String(formData.get("id") ?? "");
  const shared = formData.get("shared") === "true";

  const supabase = await createClient();
  const { error } = await supabase
    .from("outings")
    .update({ visibility: shared ? "shared" : "private" })
    .eq("id", id);

  if (error) return { error: humanizeDbError(error.message), success: null };

  revalidatePath("/journal");
  return {
    error: null,
    success: shared ? "Sortie partagée avec le cercle." : "Sortie redevenue privée.",
  };
}
