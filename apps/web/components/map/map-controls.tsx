"use client";

import { HelpCircle, LocateFixed, Layers, Loader2 } from "lucide-react";
import { BASEMAPS, type BasemapId } from "@/lib/map/basemaps";
import { cn } from "@/lib/utils";
import { MapGuide } from "./map-guide";

/**
 * Commandes flottantes du haut d'écran.
 *
 * À gauche, le repère de l'application et le fond de carte — les deux seuls réglages qui
 * méritent d'être toujours visibles. À droite, sur mobile seulement, se localiser et l'aide : le
 * contrôle natif de MapLibre (GeolocateControl) reste actif en arrière-plan pour le calcul, mais
 * son bouton par défaut ne suit pas notre habillage — on le masque sous `lg` et on déclenche la
 * localisation depuis ce bouton-ci à la place. Le zoom et la géolocalisation natifs restent
 * visibles sur desktop, où l'écran est assez grand pour les deux jeux de commandes.
 *
 * Le compteur de mailles visibles a disparu d'ici : « 4 312 mailles visibles » est une mesure du
 * moteur, pas une information de terrain. Personne ne décide rien avec. Ce qui reste utile
 * pendant un chargement, c'est de savoir qu'il se passe quelque chose — un témoin suffit.
 */
export function MapControls({
  basemap,
  onBasemapChange,
  loading,
  onLocate,
}: {
  basemap: BasemapId;
  onBasemapChange: (id: BasemapId) => void;
  loading: boolean;
  onLocate: () => void;
}) {
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 lg:inset-x-auto lg:left-0">
        <div className="pointer-events-auto mx-3 mt-[max(0.75rem,env(safe-area-inset-top))] flex items-center gap-2 lg:mt-32 lg:ml-3">
          <div
            aria-hidden
            className="surface-float font-display text-primary flex size-10 shrink-0 items-center justify-center text-lg font-semibold"
          >
            M
          </div>

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

      {/* Localisation et aide : seulement sur mobile, où MapLibre ne pose pas déjà ses propres
          commandes dans notre style (voir NavigationControl/GeolocateControl dans mycelio-map,
          masqués sous `lg` par la même règle CSS). */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 lg:hidden">
        <div className="pointer-events-auto mr-3 ml-auto mt-[max(0.75rem,env(safe-area-inset-top))] flex w-fit flex-col gap-2">
          <button
            type="button"
            onClick={onLocate}
            aria-label="Me localiser"
            className="surface-float flex size-11 items-center justify-center"
          >
            <LocateFixed className="size-5" aria-hidden />
          </button>
          <MapGuide
            trigger={
              <button
                type="button"
                aria-label="Comment lire la carte"
                className="surface-float text-muted-foreground flex size-11 items-center justify-center"
              >
                <HelpCircle className="size-5" aria-hidden />
              </button>
            }
          />
        </div>
      </div>
    </>
  );
}
