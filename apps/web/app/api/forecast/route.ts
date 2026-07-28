import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";

/**
 * Scores de poussée pour une espèce, sur tout l'horizon.
 *
 * Les huit jours sont renvoyés d'un coup, volontairement : le curseur J → J+7 doit glisser sans
 * le moindre appel réseau. Une requête par jour rendrait le geste poussif alors que la charge
 * utile complète tient en quelques centaines de kilo-octets.
 *
 * Clés d'un caractère et scores à deux décimales, comme pour /api/cells : sur des dizaines de
 * milliers de lignes, le JSON verbeux coûte un facteur trois.
 */
export async function GET(request: Request) {
  await requirePermission("map.view");

  const { searchParams } = new URL(request.url);
  const species = searchParams.get("species");
  if (!species) {
    return NextResponse.json({ error: "paramètre species requis" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: row } = await supabase
    .from("species")
    .select("id")
    .eq("slug", species)
    .single();
  if (!row) {
    return NextResponse.json({ error: "espèce inconnue" }, { status: 404 });
  }

  // PostgREST plafonne à 1 000 lignes : sans pagination on ne servirait qu'une fraction de la
  // grille, et la carte paraîtrait trouée sans qu'aucune erreur ne le signale.
  const PAGE = 1000;
  const rows: { h3_index: string; day_offset: number; score: number; confidence: number }[] = [];

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("forecast")
      .select("h3_index, day_offset, score, confidence")
      .eq("species_id", row.id)
      .order("h3_index")
      .order("day_offset")
      .range(from, from + PAGE - 1);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  // Un objet par maille, portant la série des jours : c'est la forme que consomme le curseur.
  const byCell = new Map<string, { h: string; s: number[]; c: number }>();
  for (const r of rows) {
    let entry = byCell.get(r.h3_index);
    if (!entry) {
      entry = { h: r.h3_index, s: [], c: Math.round(r.confidence * 100) / 100 };
      byCell.set(r.h3_index, entry);
    }
    entry.s[r.day_offset] = Math.round(r.score * 100) / 100;
  }

  return NextResponse.json(
    { cells: [...byCell.values()] },
    // Les scores ne changent qu'au passage du cron nocturne.
    { headers: { "Cache-Control": "private, max-age=1800" } },
  );
}
