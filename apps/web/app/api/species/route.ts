import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";

/** Espèces actives, pour le sélecteur de la carte. */
export async function GET() {
  await requirePermission("map.view");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("species")
    .select("slug, common_name_fr, scientific_name, notes_terrain")
    .eq("is_enabled", true)
    .order("sort_order");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    { species: data ?? [] },
    { headers: { "Cache-Control": "private, max-age=3600" } },
  );
}
