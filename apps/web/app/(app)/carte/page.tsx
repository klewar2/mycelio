import type { Metadata } from "next";
import { MapCanvas } from "@/components/shell/map-canvas";
import { SafetyBanner } from "@/components/shell/safety-banner";
import { requirePermission } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Carte — Mycélio" };

export default async function CartePage() {
  await requirePermission("map.view");

  return (
    <>
      {/* Plein cadre, sous la navigation flottante. En phase 3, MapLibre remplacera ce fond
          sans que la mise en page ait à bouger. */}
      <MapCanvas />

      <div className="pointer-events-none fixed inset-x-0 top-0 z-40 lg:left-16">
        <div className="pointer-events-auto mx-3 mt-[max(0.75rem,env(safe-area-inset-top))] max-w-2xl">
          <SafetyBanner />
        </div>
      </div>
    </>
  );
}
