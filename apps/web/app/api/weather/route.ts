import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";

type WeatherRow = {
  rain_mm: number[] | null;
  tmin_c: number[] | null;
  tmax_c: number[] | null;
  soil_moisture: number[] | null;
  weather_code: number[] | null;
};

/**
 * Météo de la fenêtre de carte, pour la barre de semaine du panneau de lecture.
 *
 * Contrairement à `/api/forecast`, une seule série est renvoyée : la météo n'a pas de structure
 * plus fine que quelques kilomètres (voir pipeline/mycelio/weather.py), donc pas de sens à la
 * décliner par maille. Le serveur prend le point de grille le plus proche du centre de la
 * fenêtre visible.
 */
export async function GET(request: Request) {
  await requirePermission("map.view");

  const { searchParams } = new URL(request.url);
  const bbox = (searchParams.get("bbox") ?? "").split(",").map(Number);

  if (bbox.length !== 4 || bbox.some((v) => !Number.isFinite(v))) {
    return NextResponse.json({ error: "bbox requis : ouest,sud,est,nord" }, { status: 400 });
  }

  const [west, south, east, north] = bbox as [number, number, number, number];

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("weather_in_view", { west, south, east, north })
    .maybeSingle<WeatherRow>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      weather: data
        ? {
            rainMm: (data.rain_mm ?? []).map((v) => Math.round(v * 10) / 10),
            tminC: (data.tmin_c ?? []).map((v) => Math.round(v)),
            tmaxC: (data.tmax_c ?? []).map((v) => Math.round(v)),
            soilMoisture: (data.soil_moisture ?? []).map((v) => Math.round(v * 100) / 100),
            weatherCode: data.weather_code ?? [],
          }
        : null,
    },
    { headers: { "Cache-Control": "private, max-age=1800" } },
  );
}
