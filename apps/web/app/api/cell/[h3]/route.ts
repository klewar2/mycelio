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

  // Une maille protégée est traitée comme inexistante, et non signalée comme protégée : la
  // carte ne la rend pas, l'API ne doit pas non plus permettre de l'inspecter en devinant son
  // index. Le masquage réglementaire n'aurait aucun sens s'il ne tenait qu'à l'affichage.
  if (error || !cell || cell.restricted) {
    return NextResponse.json({ error: "maille inconnue" }, { status: 404 });
  }

  // Probabilités du jour, toutes espèces, pour établir le trio de tête.
  const { data: scores } = await supabase
    .from("forecast")
    .select("species_id, scores, confidence")
    .eq("h3_index", h3);

  const { data: species } = await supabase
    .from("species")
    .select(
      "id, slug, common_name_fr, scientific_name, family, notes_terrain, dangerous_confusions, sort_order",
    )
    .eq("is_enabled", true)
    .order("sort_order");

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
        family: info?.family ?? info?.common_name_fr ?? "",
        order: info?.sort_order ?? 0,
        notes: info?.notes_terrain ?? null,
        confusions: info?.dangerous_confusions ?? null,
        // Série des huit jours : c'est elle qui porte la tendance.
        scores: entry.scores.map((s) => Math.round(s * 100) / 100),
        confidence: Math.round(entry.confidence * 100) / 100,
      };
    })
    .filter((s) => s.slug)
    .sort((a, b) => (b.scores[0] ?? 0) - (a.scores[0] ?? 0));

  /**
   * Regroupement par famille — la seule chose que lit le panneau d'inspection.
   *
   * Le maximum par jour, comme sur la carte : afficher « Cèpes » à la moyenne des trois espèces
   * ferait passer pour médiocre un coin où le cèpe d'été est en plein pic. L'espèce qui porte le
   * maximum du jour le plus fort est conservée à part : c'est elle qui donne les confusions
   * dangereuses à afficher, et il serait absurde d'avertir sur la tête de nègre quand c'est le
   * cèpe d'été qui pousse.
   */
  const families = [...new Map(ranked.map((s) => [s.family, s.family])).keys()]
    .map((label) => {
      const members = ranked.filter((s) => s.family === label);
      const length = Math.max(...members.map((m) => m.scores.length), 0);
      const best = Array.from({ length }, (_, day) =>
        Math.max(...members.map((m) => m.scores[day] ?? 0)),
      );
      const peak = Math.max(...best, 0);
      const leader =
        members.find((m) => m.scores.some((value) => value >= peak && peak > 0)) ?? members[0]!;
      return {
        label,
        scores: best,
        confidence: Math.max(...members.map((m) => m.confidence), 0),
        order: Math.min(...members.map((m) => m.order)),
        leader: {
          name: leader.name,
          scientific: leader.scientific,
          notes: leader.notes,
          confusions: leader.confusions,
        },
        members: members.map((m) => m.name),
      };
    })
    .sort((a, b) => a.order - b.order);

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
    { cell, families, advice },
    { headers: { "Cache-Control": "private, max-age=1800" } },
  );
}
