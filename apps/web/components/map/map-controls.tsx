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
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 lg:inset-x-auto lg:left-0">
      {/* Sous le bandeau de sécurité, et non en bas : le bas est occupé par le sélecteur
          d'espèce, le curseur de jour et la barre d'onglets. Les empiler les rendait
          illisibles sur mobile.

          La marge haute dégage le bandeau de sécurité replié, plus haut sur mobile parce que
          le texte y tient sur quatre lignes. Déplier « Précautions » le recouvre
          temporairement, ce qui est acceptable : on lit alors l'avertissement, on ne change
          pas de fond de carte. */}
      <div className="pointer-events-auto mx-3 mt-[calc(max(0.75rem,env(safe-area-inset-top))+10.5rem)] flex flex-col gap-2 lg:mt-24 lg:ml-3 lg:items-start">
        <div className="surface-float flex items-center gap-1 self-start p-1 lg:self-start">
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

        <div className="surface-float self-start px-3 py-2 lg:self-start">
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
