"use client";

import { Layers, Loader2 } from "lucide-react";
import { BASEMAPS, type BasemapId } from "@/lib/map/basemaps";
import { cn } from "@/lib/utils";

/**
 * Commandes flottantes — le fond de carte, et rien d'autre.
 *
 * Le compteur de mailles visibles a disparu d'ici : « 4 312 mailles visibles » est une mesure du
 * moteur, pas une information de terrain. Personne ne décide rien avec. Ce qui reste utile
 * pendant un chargement, c'est de savoir qu'il se passe quelque chose — un témoin suffit.
 */
export function MapControls({
  basemap,
  onBasemapChange,
  loading,
}: {
  basemap: BasemapId;
  onBasemapChange: (id: BasemapId) => void;
  loading: boolean;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 lg:inset-x-auto lg:left-0">
      {/* Sous le bandeau de sécurité, et non en bas : le bas est occupé par le panneau de
          lecture et la barre d'onglets.

          La marge haute dégage le bandeau de sécurité replié, plus haut sur mobile parce que
          le texte y tient sur trois lignes. Déplier « Précautions » le recouvre
          temporairement, ce qui est acceptable : on lit alors l'avertissement, on ne change
          pas de fond de carte. */}
      <div className="pointer-events-auto mx-3 mt-[calc(max(0.75rem,env(safe-area-inset-top))+7rem)] flex items-center gap-2 lg:mt-32 lg:ml-3">
        <div className="surface-float flex items-center gap-1 p-1">
          <Layers className="text-muted-foreground mx-1.5 size-4" aria-hidden />
          {(Object.keys(BASEMAPS) as BasemapId[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onBasemapChange(id)}
              aria-pressed={basemap === id}
              className={cn(
                "h-8 rounded-md px-2.5 text-xs font-medium transition-colors",
                basemap === id
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {BASEMAPS[id].label}
            </button>
          ))}
        </div>

        {loading ? (
          <span className="surface-float text-muted-foreground flex size-9 items-center justify-center">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            <span className="sr-only">Chargement des mailles</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
