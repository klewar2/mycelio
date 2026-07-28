"use client";

import { cn } from "@/lib/utils";

export type Species = {
  id: number;
  slug: string;
  common_name_fr: string;
  scientific_name: string;
  notes_terrain: string | null;
};

/**
 * Sélecteur d'espèce et curseur de jour.
 *
 * Les huit jours sont déjà chargés : glisser le curseur ne déclenche aucun appel réseau, ce qui
 * permet de balayer la semaine d'un geste pour voir où et quand la poussée se déplace.
 */
export function SpeciesPicker({
  species,
  selected,
  onSelect,
  day,
  onDayChange,
}: {
  species: Species[];
  selected: string | null;
  onSelect: (slug: string) => void;
  day: number;
  onDayChange: (day: number) => void;
}) {
  const dayLabel = (offset: number) => {
    if (offset === 0) return "aujourd'hui";
    if (offset === 1) return "demain";
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 lg:right-72 lg:left-0">
      <div className="pointer-events-auto mx-3 mb-[calc(env(safe-area-inset-bottom)+5.5rem)] flex flex-col gap-2 lg:mb-9 lg:ml-3">
        {/* Chips horizontales : sur mobile elles défilent, sans jamais faire déborder la page. */}
        <div className="-mx-3 overflow-x-auto px-3 lg:mx-0 lg:px-0">
          <div className="flex min-w-max gap-1.5">
            {species.map((item) => (
              <button
                key={item.slug}
                type="button"
                onClick={() => onSelect(item.slug)}
                aria-pressed={selected === item.slug}
                title={item.scientific_name}
                className={cn(
                  "surface-float h-9 shrink-0 rounded-lg px-3 text-xs font-medium whitespace-nowrap transition-colors",
                  selected === item.slug
                    ? "bg-primary text-primary-foreground border-transparent"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.common_name_fr}
              </button>
            ))}
          </div>
        </div>

        <div className="surface-float px-4 py-3">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <label htmlFor="jour" className="text-muted-foreground text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
              Jour
            </label>
            <span data-numeric className="text-foreground text-xs">
              {dayLabel(day)}
            </span>
          </div>
          <input
            id="jour"
            type="range"
            min={0}
            max={7}
            step={1}
            value={day}
            onChange={(e) => onDayChange(Number(e.target.value))}
            className="accent-primary h-9 w-full cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}
