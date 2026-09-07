import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";

type MapCell = {
  h: string;
  f: number | null;
  e: string | null;
  a: number | null;
  s: number[] | null;
  c: number | null;
};

type MapPayload = { detailed: boolean; cells: MapCell[] };

/**
 * La fenêtre de carte : mailles ET scores, en un seul appel.
 *
 * Remplace `/api/cells` + `/api/forecast`. Les deux étaient toujours demandées ensemble, pour la
 * même emprise, à la même seconde — les séparer payait deux fois la pile d'authentification, et
 * la pagination de PostgREST doublait encore chacune dès 1 000 mailles. La vue par défaut, qui
 * en compte 2 000, faisait donc quatre requêtes là où une suffit.
 *
 * Côté base, `map_in_view` rend le tout en UNE ligne de `json` : le plafond `max_rows` de
 * PostgREST ne s'applique plus, et la pagination disparaît avec le risque de troncature
 * silencieuse qu'elle servait à couvrir.
 *
 * Tout l'horizon part d'un coup — changer de jour ne doit déclencher aucun appel réseau — mais
 * seulement pour les mailles visibles.
 */
export async function GET(request: Request) {
  await requirePermission("map.view");

  const { searchParams } = new URL(request.url);
  const species = (searchParams.get("species") ?? "")
    .split(",")
    .map((slug) => slug.trim())
    .filter(Boolean);
  const bbox = (searchParams.get("bbox") ?? "").split(",").map(Number);
  const detailed = searchParams.get("detailed") !== "0";

  if (species.length === 0) {
    return NextResponse.json({ error: "paramètre species requis" }, { status: 400 });
  }
  if (bbox.length !== 4 || bbox.some((v) => !Number.isFinite(v))) {
    return NextResponse.json({ error: "bbox requis : ouest,sud,est,nord" }, { status: 400 });
  }

  const [west, south, east, north] = bbox as [number, number, number, number];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("map_in_view", {
    species_slugs: species,
    west,
    south,
    east,
    north,
    detailed,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const payload = (data ?? { detailed, cells: [] }) as unknown as MapPayload;

  // Les essences sont une vingtaine de libellés répétés des milliers de fois : on envoie une
  // légende et un index plutôt que la chaîne à chaque ligne.
  const legend: string[] = [];
  const indexOf = new Map<string, number>();
  for (const cell of payload.cells) {
    if (cell.e && !indexOf.has(cell.e)) indexOf.set(cell.e, legend.push(cell.e) - 1);
  }

  return NextResponse.json(
    {
      detailed: payload.detailed,
      essences: legend,
      cells: payload.cells.map((cell) => ({
        h: cell.h,
        f: cell.f,
        e: cell.e ? indexOf.get(cell.e) : null,
        a: cell.a,
        s: cell.s ?? [],
        c: cell.c ?? 0,
      })),
    },
    {
      // Une demi-heure, et non cinq minutes : les scores ne changent qu'une fois par jour, à
      // 5 h UTC, et le client arrondit désormais son emprise pour que deux déplacements voisins
      // retombent sur la même URL (voir `snapBounds` dans lib/map/hexagons.ts). C'est ce couple
      // — clé stable, durée utile — qui rend un panoramique instantané ; l'un sans l'autre ne
      // servait à rien.
      headers: { "Cache-Control": "private, max-age=1800" },
    },
  );
}
