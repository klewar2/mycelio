"use client";

import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ALL_FAMILIES, type Family } from "@/lib/map/families";
import { LEVELS, dayLabel, dayShort, levelIndex, levelOf, levelPosition } from "@/lib/scoring/levels";
import { MapGuide } from "./map-guide";

/**
 * Le panneau de lecture — ce qui répond à « est-ce que ça pousse en ce moment ? ».
 *
 * Trois anciennes commandes ont fondu ici : le sélecteur d'espèce, le curseur de jour et le
 * compteur de mailles. Elles s'empilaient au bas de l'écran sans jamais se répondre, et aucune
 * ne disait ce qui intéresse un débutant. Le curseur, surtout, ne montrait rien : glisser de
 * J+3 à J+4 changeait des couleurs sans dire si c'était mieux.
 *
 * La barre de semaine remplace le curseur. C'est la même donnée — les huit jours sont déjà
 * chargés — mais elle est enfin visible : on voit la poussée monter, culminer, retomber, et on
 * choisit son jour d'un coup d'œil au lieu de balayer à l'aveugle.
 */
export function ReadingPanel({
  families,
  selected,
  onSelect,
  day,
  onDayChange,
  weekBest,
  hasData,
  loading,
}: {
  families: Family[];
  selected: string;
  onSelect: (key: string) => void;
  day: number;
  onDayChange: (day: number) => void;
  /** Meilleur score de la fenêtre visible, un par jour de l'horizon. */
  weekBest: number[];
  hasData: boolean;
  loading: boolean;
}) {
  const label =
    selected === ALL_FAMILIES
      ? "Tous les champignons"
      : (families.find((f) => f.key === selected)?.label ?? "");

  const today = weekBest[day] ?? 0;
  const level = levelOf(today);

  // Le meilleur jour de l'horizon, signalé seulement s'il n'est pas celui qu'on regarde : sinon
  // la phrase répète ce que la barre montre déjà.
  const bestDay = weekBest.reduce(
    (best, value, index) => (value > (weekBest[best] ?? 0) ? index : best),
    0,
  );
  const worthMentioning =
    bestDay !== day && levelIndex(weekBest[bestDay] ?? 0) > levelIndex(today);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 lg:right-96 lg:left-0">
      <div className="surface-float pointer-events-auto mx-3 mb-[calc(env(safe-area-inset-bottom)+5.5rem)] p-3 lg:mb-6 lg:ml-3 lg:max-w-xl">
        {/* ---------- Familles ---------- */}
        {/* Les marges négatives laissent les chips filer sous le bord du panneau quand elles
            défilent, plutôt que de s'arrêter net sur une bordure. */}
        <div className="-mx-3 overflow-x-auto px-3">
          <div className="flex min-w-max gap-1.5">
            <Chip
              label="Tous"
              active={selected === ALL_FAMILIES}
              onClick={() => onSelect(ALL_FAMILIES)}
            />
            {families.map((family) => (
              <Chip
                key={family.key}
                label={family.label}
                title={family.species.map((s) => s.common_name_fr).join(", ")}
                active={selected === family.key}
                onClick={() => onSelect(family.key)}
              />
            ))}
          </div>
        </div>

        {/* ---------- Verdict ---------- */}
        {/* Le niveau seul sur sa ligne, en toutes lettres : c'est la réponse, et rien ne doit
            la tronquer. Le contexte — quelle famille, quel jour — passe en dessous, où il peut
            s'abréger sans qu'on perde l'essentiel. */}
        <div className="mt-3 flex items-start gap-2">
          <span
            aria-hidden
            className="mt-1.5 size-2.5 shrink-0 rounded-full"
            style={{ background: hasData ? level.color : "var(--muted-foreground)" }}
          />
          <div className="min-w-0 flex-1">
            {loading && !hasData ? (
              <p className="text-muted-foreground text-sm">Lecture du secteur…</p>
            ) : !hasData ? (
              <p className="text-muted-foreground text-sm">Aucune donnée sur cette zone</p>
            ) : (
              <>
                <p className="text-foreground text-sm font-medium">{level.label}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {label.toLowerCase()} · {dayLabel(day)}
                </p>
                {/* Sur sa propre ligne, et seulement quand il y a mieux ailleurs dans la
                    semaine : c'est le conseil le plus utile de l'écran — attendre deux jours
                    plutôt que partir pour rien — et il ne doit jamais être tronqué. */}
                {worthMentioning ? (
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    Meilleur jour : <span className="text-foreground">{dayLabel(bestDay)}</span>
                  </p>
                ) : null}
              </>
            )}
          </div>
          <MapGuide
            trigger={
              <button
                type="button"
                aria-label="Comment lire la carte"
                className="text-muted-foreground hover:text-foreground -mt-1.5 -mr-1 flex size-9 shrink-0 items-center justify-center rounded-md transition-colors"
              >
                <HelpCircle className="size-4" />
              </button>
            }
          />
        </div>

        {/* ---------- Barre de semaine ---------- */}
        <div
          role="group"
          aria-label="Jour affiché"
          className="mt-2.5 grid grid-cols-8 gap-1"
        >
          {weekBest.map((score, offset) => {
            const index = levelIndex(score);
            const current = offset === day;
            return (
              <button
                key={offset}
                type="button"
                onClick={() => onDayChange(offset)}
                aria-pressed={current}
                aria-label={`${dayLabel(offset)} — ${LEVELS[index]!.short}`}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-md py-1 transition-colors",
                  current ? "bg-accent" : "hover:bg-accent/50",
                )}
              >
                {/* Une barre plutôt qu'une pastille : la hauteur donne la tendance de la
                    semaine d'un seul regard, ce qu'une couleur seule ne fait pas — et elle
                    reste lisible pour un œil qui distingue mal les ocres entre eux.

                    Le plancher de 15 % garde une barre visible même à zéro : sans lui, un jour
                    sans poussée se lit comme un jour sans donnée. */}
                <span className="bg-border flex h-7 w-full items-end overflow-hidden rounded-[3px]">
                  <span
                    aria-hidden
                    className="w-full rounded-[3px] transition-all"
                    style={{
                      height: `${Math.max(15, levelPosition(score) * 100)}%`,
                      background: hasData ? LEVELS[index]!.color : "transparent",
                    }}
                  />
                </span>
                <span
                  className={cn(
                    "text-[0.625rem] leading-none",
                    current ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {dayShort(offset)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Chip({
  label,
  title,
  active,
  onClick,
}: {
  label: string;
  title?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        "h-9 shrink-0 rounded-lg border px-3 text-xs font-medium whitespace-nowrap transition-colors",
        active
          ? "bg-primary text-primary-foreground border-transparent"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
