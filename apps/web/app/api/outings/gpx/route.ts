import { cellToLatLng } from "h3-js";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";

/**
 * Export GPX des sorties personnelles.
 *
 * Format choisi parce qu'il s'ouvre partout — GPS de randonnée, OsmAnd, Garmin — sans conversion.
 *
 * On n'exporte QUE ses propres sorties, y compris pour un administrateur : la RLS s'en charge,
 * et le filtre explicite sur l'utilisateur ci-dessous n'est qu'une ceinture. Les sorties
 * partagées par d'autres ne sont volontairement pas incluses : leurs auteurs ont accepté de les
 * montrer dans l'application, pas de les voir repartir dans un fichier.
 */
export async function GET() {
  const ctx = await requirePermission("finds.export");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("outings")
    .select("id, occurred_on, found_nothing, notes, h3_index, finds(species_id, quantity_g)")
    .eq("user_id", ctx.userId)
    .order("occurred_on", { ascending: false });

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  const { data: cells } = await supabase
    .from("cells")
    .select("h3_index")
    .in("h3_index", (data ?? []).map((o) => o.h3_index).filter((h): h is string => !!h));

  const known = new Set((cells ?? []).map((c) => c.h3_index));

  const points = (data ?? [])
    .filter((o) => o.h3_index && known.has(o.h3_index))
    .map((o) => {
      // Le centre de la maille, et non une position exacte : la maille EST la précision de
      // l'application, et l'export ne doit pas laisser croire à mieux.
      const [lat, lng] = cellToLatLng(o.h3_index!);
      const label = o.found_nothing ? "Bredouille" : `${o.finds.length} trouvaille(s)`;
      return `  <wpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}">
    <name>${escapeXml(`${o.occurred_on} — ${label}`)}</name>
    <desc>${escapeXml(o.notes ?? "")}</desc>
    <type>${o.found_nothing ? "bredouille" : "trouvaille"}</type>
  </wpt>`;
    });

  // Fuseau explicite : le serveur tourne en UTC, et un export fait en soirée porterait la date
  // de la veille. L'application couvre le 31, le 81 et le 11 — Europe/Paris est le bon repère.
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });

  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Mycélio" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Sorties — ${escapeXml(ctx.profile.display_name)}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
${points.join("\n")}
</gpx>
`;

  return new Response(gpx, {
    headers: {
      "Content-Type": "application/gpx+xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="mycelio-sorties-${today}.gpx"`,
    },
  });
}


function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
