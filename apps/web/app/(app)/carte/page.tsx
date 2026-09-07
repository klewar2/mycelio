import type { Metadata } from "next";
import { MapShell } from "@/components/map/map-shell";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Carte — Mycélio" };

function readSetting<T>(rows: { key: string; value: unknown }[], key: string, fallback: T): T {
  const row = rows.find((r) => r.key === key);
  return (row?.value as T) ?? fallback;
}

export default async function CartePage() {
  await requirePermission("map.view");

  // Le cadrage et l'opacité viennent d'app_settings : les modifier dans /admin/parametres
  // change la carte sans redéploiement.
  //
  // Les espèces partent d'ici, et non d'un `fetch('/api/species')` au montage : elles ne changent
  // qu'à l'édition d'une fiche, et la carte ne peut RIEN demander tant qu'elle ne les a pas —
  // c'est la famille sélectionnée qui détermine les scores. Les charger côté client posait donc
  // deux allers-retours en série avant le premier hexagone. Les deux requêtes ci-dessous, elles,
  // partent ensemble.
  const supabase = await createClient();
  const [settings, speciesRows] = await Promise.all([
    supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["map.default_center", "map.default_zoom", "map.opacity_range"]),
    supabase
      .from("species")
      .select("id, slug, common_name_fr, scientific_name, family, notes_terrain")
      .eq("is_enabled", true)
      .order("sort_order"),
  ]);

  const rows = settings.data ?? [];

  return (
    <MapShell
      center={readSetting<[number, number]>(rows, "map.default_center", [43.45, 1.35])}
      zoom={readSetting<number>(rows, "map.default_zoom", 9)}
      opacityRange={readSetting<[number, number]>(rows, "map.opacity_range", [0.35, 0.85])}
      species={speciesRows.data ?? []}
    />
  );
}
