import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import { buildAdvice } from "@/lib/terrain/advice";

/**
 * Fiche complète d'une maille : lecture du terrain, probabilités et conseils.
 *
 * Les conseils sont calculés ICI, côté serveur, et non dans le navigateur : les règles sont
 * déterministes, la maille change rarement, et cela évite d'envoyer au client des attributs
 * qu'il n'affiche pas.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ h3: string }> },
) {
  await requirePermission("map.view");
  const { h3 } = await params;

  const supabase = await createClient();

  const { data: cell, error } = await supabase
    .from("cells")
    // "*" plutôt qu'une liste concaténée : Supabase infère le type des colonnes depuis le
    // littéral de sélection, et une concaténation lui fait perdre ce typage.
    .select("*")
    .eq("h3_index", h3)
    .single();

  if (error || !cell) {
    return NextResponse.json({ error: "maille inconnue" }, { status: 404 });
  }

  // Probabilités du jour, toutes espèces, pour établir le trio de tête.
  const { data: scores } = await supabase
    .from("forecast")
    .select("species_id, scores, confidence")
    .eq("h3_index", h3);

  const { data: species } = await supabase
    .from("species")
    .select("id, slug, common_name_fr, scientific_name, notes_terrain, dangerous_confusions")
    .eq("is_enabled", true);

  const byId = new Map((species ?? []).map((s) => [s.id, s]));

  // Une ligne par (maille, espèce), portant déjà la série des huit jours : depuis le passage en
  // résolution 9, le tableau remplace une ligne par jour — sept fois moins de lignes en base.
  const ranked = (scores ?? [])
    .map((row) => {
      const info = byId.get(row.species_id);
      const entry = { scores: row.scores ?? [], confidence: row.confidence };
      return {
        slug: info?.slug ?? "",
        name: info?.common_name_fr ?? "",
        scientific: info?.scientific_name ?? "",
        notes: info?.notes_terrain ?? null,
        confusions: info?.dangerous_confusions ?? null,
        // Série des huit jours : c'est elle qui porte la tendance.
        scores: entry.scores.map((s) => Math.round(s * 100) / 100),
        confidence: Math.round(entry.confidence * 100) / 100,
      };
    })
    .filter((s) => s.slug)
    .sort((a, b) => (b.scores[0] ?? 0) - (a.scores[0] ?? 0));

  const advice = buildAdvice(
    {
      alt_m: cell.alt_m,
      slope_pct: cell.slope_pct,
      northness: cell.northness,
      eastness: cell.eastness,
      tpi: cell.tpi,
      twi: cell.twi,
      forest_share: cell.forest_share,
      essence: cell.essence,
      hosts: cell.hosts ?? [],
      dist_edge_m: cell.dist_edge_m,
      dist_stream_m: cell.dist_stream_m,
      soil_ph: cell.soil_ph,
    },
    ranked[0]?.slug ?? null,
  );

  return NextResponse.json(
    { cell, species: ranked, advice },
    { headers: { "Cache-Control": "private, max-age=1800" } },
  );
}
