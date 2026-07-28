import type { Metadata } from "next";
import { MapShell } from "@/components/map/map-shell";
import { SafetyBanner } from "@/components/shell/safety-banner";
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
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", ["map.default_center", "map.default_zoom", "map.opacity_range"]);

  const rows = data ?? [];

  return (
    <>
      {/* Rendu côté serveur, en dehors de la carte : l'avertissement de sécurité alimentaire ne
          doit dépendre ni du chargement de MapLibre ni de JavaScript. */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-30 lg:left-16">
        <div className="pointer-events-auto mx-3 mt-[max(0.75rem,env(safe-area-inset-top))] max-w-2xl">
          <SafetyBanner />
        </div>
      </div>

      <MapShell
        center={readSetting<[number, number]>(rows, "map.default_center", [43.45, 1.35])}
        zoom={readSetting<number>(rows, "map.default_zoom", 9)}
        opacityRange={readSetting<[number, number]>(rows, "map.opacity_range", [0.35, 0.85])}
      />
    </>
  );
}
