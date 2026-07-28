"use client";

import { Layers, Loader2 } from "lucide-react";
import { BASEMAPS, type BasemapId } from "@/lib/map/basemaps";
import { cn } from "@/lib/utils";

/**
 * Commandes flottantes.
 *
 * Sur mobile elles sont en bas, dans le pouce, juste au-dessus de la barre d'onglets — jamais
 * en haut, où on ne les atteint pas d'une main.
 */
export function MapControls({
  basemap,
  onBasemapChange,
  loading,
  count,
}: {
  basemap: BasemapId;
  onBasemapChange: (id: BasemapId) => void;
  loading: boolean;
  count: number;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 lg:inset-x-auto lg:right-0 lg:bottom-0">
      <div className="pointer-events-auto mx-3 mb-[calc(env(safe-area-inset-bottom)+5.5rem)] flex flex-col gap-2 lg:mr-3 lg:mb-3 lg:items-end">
        <div className="surface-float flex items-center gap-1 self-start p-1 lg:self-end">
          <Layers className="text-muted-foreground mx-2 size-4" aria-hidden />
          {(Object.keys(BASEMAPS) as BasemapId[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onBasemapChange(id)}
              aria-pressed={basemap === id}
              className={cn(
                "h-9 rounded-md px-3 text-xs font-medium transition-colors",
                basemap === id
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {BASEMAPS[id].label}
            </button>
          ))}
        </div>

        <div className="surface-float self-start px-3 py-2 lg:self-end">
          <p data-numeric className="text-muted-foreground text-xs">
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="size-3 animate-spin" aria-hidden />
                chargement…
              </span>
            ) : (
              `${count.toLocaleString("fr-FR")} mailles visibles`
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
