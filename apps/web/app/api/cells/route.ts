import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";

/**
 * Mailles de la grille, pour la carte.
 *
 * La charge utile est volontairement compacte — des clés d'un caractère et des valeurs
 * arrondies. Sur plusieurs milliers de mailles, la différence n'est pas cosmétique : le JSON
 * verbeux pèse trois à quatre fois plus lourd, et c'est ce qui sépare un chargement instantané
 * d'un chargement qu'on subit.
 *
 * On ne renvoie PAS la géométrie : le client reconstruit les hexagones depuis l'index H3, qui
 * tient en 15 caractères là où un polygone en pèse quelques centaines.
 */
export async function GET(request: Request) {
  await requirePermission("map.view");

  const { searchParams } = new URL(request.url);
  const dept = searchParams.get("dept");

  const supabase = await createClient();

  // PostgREST plafonne une réponse à 1 000 lignes. Sans pagination, on servirait silencieusement
  // un huitième de la grille — et la carte paraîtrait simplement « trouée » sans erreur.
  const PAGE = 1000;
  const rows: { h3_index: string; forest_share: number | null; essence: string | null; alt_m: number | null }[] = [];

  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from("cells")
      .select("h3_index, forest_share, essence, alt_m")
      .order("h3_index")
      .range(from, from + PAGE - 1);
    if (dept) query = query.eq("dept", dept);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  // Les essences sont une vingtaine de libellés répétés des milliers de fois : on envoie une
  // légende et un index. Sur 13 000 mailles, cela retire près d'un tiers de la charge utile.
  const legend: string[] = [];
  const indexOf = new Map<string, number>();
  for (const row of rows) {
    if (row.essence && !indexOf.has(row.essence)) {
      indexOf.set(row.essence, legend.push(row.essence) - 1);
    }
  }

  const cells = rows.map((cell) => ({
    h: cell.h3_index,
    f: cell.forest_share == null ? null : Math.round(cell.forest_share * 100) / 100,
    e: cell.essence ? indexOf.get(cell.essence) : null,
    a: cell.alt_m == null ? null : Math.round(cell.alt_m),
  }));

  return NextResponse.json(
    { cells, essences: legend },
    {
      // Les mailles ne bougent qu'au rejeu du pipeline, c'est-à-dire jamais en usage courant.
      headers: { "Cache-Control": "private, max-age=3600" },
    },
  );
}
