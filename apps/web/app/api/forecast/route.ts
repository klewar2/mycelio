import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";

/**
 * Scores de poussée dans la fenêtre de carte, pour une espèce.
 *
 * Tout l'horizon est renvoyé d'un coup — le curseur J → J+7 ne doit déclencher aucun appel
 * réseau — mais seulement pour les mailles visibles.
 *
 * À petite échelle, le serveur agrège sur le parent en résolution 7 par le MAXIMUM et non par la
 * moyenne : la question utile à cette échelle est « y a-t-il quelque chose de bon dans ce
 * secteur », pas « quelle est la moyenne du secteur ». Une moyenne noierait une bonne maille au
 * milieu de vingt médiocres.
 */
export async function GET(request: Request) {
  await requirePermission("map.view");

  const { searchParams } = new URL(request.url);
  const species = searchParams.get("species");
  const bbox = (searchParams.get("bbox") ?? "").split(",").map(Number);
  const detailed = searchParams.get("detailed") !== "0";

  if (!species) {
    return NextResponse.json({ error: "paramètre species requis" }, { status: 400 });
  }
  if (bbox.length !== 4 || bbox.some((v) => !Number.isFinite(v))) {
    return NextResponse.json({ error: "bbox requis : ouest,sud,est,nord" }, { status: 400 });
  }

  const [west, south, east, north] = bbox as [number, number, number, number];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("forecast_in_view", {
    species_slug: species,
    west,
    south,
    east,
    north,
    detailed,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      cells: (data ?? []).map((row) => ({
        h: row.h,
        s: (row.s ?? []).map((value: number) => Math.round(value * 100) / 100),
        c: Math.round((row.c ?? 0) * 100) / 100,
      })),
    },
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
}
