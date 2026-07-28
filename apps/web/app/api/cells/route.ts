import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";

/**
 * Mailles visibles dans la fenêtre de carte.
 *
 * En résolution 9 la grille dépasse 90 000 mailles : les envoyer toutes ferait plusieurs
 * mégaoctets pour un résultat en grande partie hors écran ou sous-pixel. On interroge donc par
 * emprise, et le serveur agrège sur le parent en résolution 7 quand la carte est dézoomée.
 *
 * Charge utile compacte : clés d'un caractère, valeurs arrondies, et jamais de géométrie — le
 * client reconstruit les hexagones depuis l'index H3.
 */
export async function GET(request: Request) {
  await requirePermission("map.view");

  const { searchParams } = new URL(request.url);
  const bbox = (searchParams.get("bbox") ?? "").split(",").map(Number);
  const detailed = searchParams.get("detailed") !== "0";

  if (bbox.length !== 4 || bbox.some((v) => !Number.isFinite(v))) {
    return NextResponse.json({ error: "bbox requis : ouest,sud,est,nord" }, { status: 400 });
  }

  const [west, south, east, north] = bbox as [number, number, number, number];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cells_in_view", {
    west,
    south,
    east,
    north,
    detailed,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];

  // Les essences sont une vingtaine de libellés répétés des milliers de fois : on envoie une
  // légende et un index plutôt que la chaîne à chaque ligne.
  const legend: string[] = [];
  const indexOf = new Map<string, number>();
  for (const row of rows) {
    if (row.e && !indexOf.has(row.e)) indexOf.set(row.e, legend.push(row.e) - 1);
  }

  return NextResponse.json(
    {
      detailed,
      essences: legend,
      cells: rows.map((row) => ({
        h: row.h,
        f: row.f == null ? null : Math.round(row.f * 100) / 100,
        e: row.e ? indexOf.get(row.e) : null,
        a: row.a == null ? null : Math.round(row.a),
      })),
    },
    // Courte : l'emprise change à chaque déplacement, un cache long ne servirait à rien.
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
}
