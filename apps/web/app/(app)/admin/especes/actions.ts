"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import { humanizeDbError } from "@/lib/auth/errors";
import type { TablesInsert } from "@/types/database";

export type ActionState = { error: string | null; success: string | null };

function num(formData: FormData, name: string): number | null {
  const raw = String(formData.get(name) ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function readSpecies(formData: FormData): TablesInsert<"species"> {
  const hosts = String(formData.get("host_codes") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    slug: String(formData.get("slug") ?? "").trim(),
    scientific_name: String(formData.get("scientific_name") ?? "").trim(),
    common_name_fr: String(formData.get("common_name_fr") ?? "").trim(),
    // Vide = l'espèce s'affiche seule sur la carte, sous son propre nom.
    family: String(formData.get("family") ?? "").trim() || null,
    host_codes: hosts,
    ph_min: num(formData, "ph_min"),
    ph_max: num(formData, "ph_max"),
    alt_min_m: num(formData, "alt_min_m"),
    alt_max_m: num(formData, "alt_max_m"),
    season_start_doy: num(formData, "season_start_doy"),
    season_end_doy: num(formData, "season_end_doy"),
    rain_lag_days: num(formData, "rain_lag_days"),
    rain_optimum_mm: num(formData, "rain_optimum_mm"),
    prefers_calcareous: formData.get("prefers_calcareous") === "on",
    thermophilic: formData.get("thermophilic") === "on",
    is_enabled: formData.get("is_enabled") !== "off",
    notes_terrain: String(formData.get("notes_terrain") ?? "").trim() || null,
  };
}

export async function saveSpecies(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission("admin.species.manage");

  const id = String(formData.get("id") ?? "");
  const payload = readSpecies(formData);

  if (!payload.slug || !payload.scientific_name || !payload.common_name_fr) {
    return { error: "Identifiant, nom latin et nom français sont requis.", success: null };
  }

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("species").update(payload).eq("id", Number(id))
    : await supabase.from("species").insert(payload);

  if (error) {
    return {
      error: error.message.includes("species_slug_key")
        ? "Un identifiant identique existe déjà."
        : humanizeDbError(error.message),
      success: null,
    };
  }

  revalidatePath("/admin/especes");
  return { error: null, success: id ? "Espèce mise à jour." : "Espèce ajoutée." };
}

export async function deleteSpecies(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission("admin.species.manage");

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return { error: "Requête invalide.", success: null };

  const supabase = await createClient();
  const { error } = await supabase.from("species").delete().eq("id", id);

  if (error) return { error: humanizeDbError(error.message), success: null };

  revalidatePath("/admin/especes");
  return { error: null, success: "Espèce supprimée." };
}
