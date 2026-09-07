"use client";

import { useRef } from "react";
import { Cloud, CloudRain, HelpCircle, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { ALL_FAMILIES, type Family } from "@/lib/map/families";
import { LEVELS, RAMP, dayLabel, dayShort, levelIndex, levelOf, levelPosition } from "@/lib/scoring/levels";
import { MOBILE_NAV_CLEARANCE, READING_SHEET_HEIGHTS, clampSnap } from "@/lib/map/sheet";
import { skyOf, skyWord, soilOf, type WeatherSeries } from "@/lib/map/weather";
import { MapGuide } from "./map-guide";

const SKY_ICONS = { sun: Sun, cloud: Cloud, rain: CloudRain };

/**
 * Le panneau de lecture — ce qui répond à « est-ce que ça pousse en ce moment ? ».
 *
 * Une feuille à trois crans, plutôt qu'un bloc à hauteur fixe : repliée, elle ne montre que le
 * verdict — l'essentiel tient dans le pouce sans masquer la carte. Par défaut, elle ajoute les
 * familles et la semaine, l'état d'origine du panneau. Dépliée en grand, elle détaille chaque
 * jour — température, pluie, sol — ce qu'aucune barre de 38 px de haut ne peut porter.
 *
 * La poignée se glisse d'un cran par un tir vertical, ou se tape pour boucler sur les trois —
 * les deux gestes coexistent sans se gêner : un tap ne bouge pas assez pour franchir le seuil de
 * glissement.
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
  weather,
  hidden,
  snap,
  onSnapChange,
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
  /** Série météo de la fenêtre visible, ou `null` tant qu'elle n'a pas encore chargé. */
  weather: WeatherSeries | null;
  /** Masqué le temps qu'une fiche « Ce coin » occupe le bas de l'écran, sur mobile. */
  hidden?: boolean;
  /** Cran courant (0 replié, 1 par défaut, 2 déplié) — possédé par le parent, qui en tire
      aussi la position du bouton flottant. */
  snap: number;
  onSnapChange: (snap: number) => void;
}) {
  const dragStartY = useRef(0);
  const dragged = useRef(false);

  const onHandlePointerDown = (event: React.PointerEvent) => {
    dragStartY.current = event.clientY;
    dragged.current = false;
    const onMove = (moveEvent: PointerEvent) => {
      const delta = dragStartY.current - moveEvent.clientY;
      if (!dragged.current && Math.abs(delta) > 36) {
        dragged.current = true;
        onSnapChange(clampSnap(snap + (delta > 0 ? 1 : -1), 2));
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const cycleSnap = () => {
    if (dragged.current) return; // le tap qui clôt un glissement ne doit pas boucler en plus
    onSnapChange((snap + 1) % 3);
  };

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

  const todayWeather = weather
    ? { tmin: weather.tminC[day], tmax: weather.tmaxC[day], code: weather.weatherCode[day] }
    : null;
  const todaySky = todayWeather?.code != null ? skyOf(todayWeather.code) : null;
  const todaySoil = weather?.soilMoisture[day] != null ? soilOf(weather.soilMoisture[day]!) : null;

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-3 z-10 transition-opacity lg:inset-x-0 lg:right-96 lg:left-0 lg:!bottom-0",
        hidden ? "opacity-0 lg:opacity-100" : "opacity-100",
      )}
      style={{ bottom: MOBILE_NAV_CLEARANCE }}
    >
      {/* ---------- Mobile : feuille à trois crans ---------- */}
      <div
        className={cn(
          "surface-float pointer-events-auto overflow-hidden transition-[height] duration-300 ease-out lg:hidden",
          hidden && "pointer-events-none",
          snap === 2 ? "overflow-y-auto" : "overflow-hidden",
        )}
        style={{ height: READING_SHEET_HEIGHTS[snap] }}
      >
        <div
          className="flex touch-none justify-center pt-2 pb-0.5"
          onPointerDown={onHandlePointerDown}
          onClick={cycleSnap}
          role="button"
          tabIndex={0}
          aria-label="Déplier ou replier le panneau"
        >
          <span className="bg-border h-1 w-11 rounded-full" />
        </div>

        <div className="px-4 pb-3">
          <Verdict
            level={level}
            hasData={hasData}
            loading={loading}
            label={label}
            day={day}
            worthMentioning={worthMentioning}
            bestDay={bestDay}
            tempRange={todayWeather ? `${todayWeather.tmin}–${todayWeather.tmax}°` : null}
            sky={todaySky}
            soil={todaySoil}
            showGuideTrigger={false}
          />

          <div className="-mx-4 mt-2.5 overflow-x-auto px-4">
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

          <WeekBar
            weekBest={weekBest}
            day={day}
            onDayChange={onDayChange}
            hasData={hasData}
            weather={weather}
          />

          {snap === 2 ? <WeekDetail weekBest={weekBest} day={day} onDayChange={onDayChange} weather={weather} /> : null}
        </div>
      </div>

      {/* ---------- Desktop : panneau flottant, sans crans ---------- */}
      <div className="surface-float pointer-events-auto mx-3 mb-6 hidden max-w-xl p-3 lg:ml-3 lg:block">
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

        <div className="mt-3">
          <Verdict
            level={level}
            hasData={hasData}
            loading={loading}
            label={label}
            day={day}
            worthMentioning={worthMentioning}
            bestDay={bestDay}
            tempRange={todayWeather ? `${todayWeather.tmin}–${todayWeather.tmax}°` : null}
            sky={todaySky}
            soil={todaySoil}
            showGuideTrigger
          />
        </div>

        <WeekBar
          weekBest={weekBest}
          day={day}
          onDayChange={onDayChange}
          hasData={hasData}
          weather={weather}
        />
      </div>
    </div>
  );
}

function Verdict({
  level,
  hasData,
  loading,
  label,
  day,
  worthMentioning,
  bestDay,
  tempRange,
  sky,
  soil,
  showGuideTrigger,
}: {
  level: ReturnType<typeof levelOf>;
  hasData: boolean;
  loading: boolean;
  label: string;
  day: number;
  worthMentioning: boolean;
  bestDay: number;
  tempRange: string | null;
  sky: "sun" | "cloud" | "rain" | null;
  soil: string | null;
  /** L'aide a son propre bouton dans la barre du haut sur mobile ; seul le desktop la répète ici. */
  showGuideTrigger: boolean;
}) {
  const SkyIcon = sky ? SKY_ICONS[sky] : null;

  return (
    <div className="flex items-start gap-2">
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
            {worthMentioning ? (
              <p className="text-muted-foreground mt-0.5 text-xs">
                Meilleur jour : <span className="text-foreground">{dayLabel(bestDay)}</span>
              </p>
            ) : null}
          </>
        )}
      </div>
      {tempRange ? (
        <div className="flex-none text-right">
          <p data-numeric className="text-foreground text-sm font-medium">
            {tempRange}
          </p>
          <p className="text-muted-foreground mt-0.5 flex items-center justify-end gap-1 text-xs">
            {SkyIcon ? <SkyIcon className="size-3" aria-hidden /> : null}
            {sky ? skyWord(sky) : null}
            {sky && soil ? " · " : null}
            {soil}
          </p>
        </div>
      ) : null}
      {showGuideTrigger ? (
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
      ) : null}
    </div>
  );
}

function WeekBar({
  weekBest,
  day,
  onDayChange,
  hasData,
  weather,
}: {
  weekBest: number[];
  day: number;
  onDayChange: (day: number) => void;
  hasData: boolean;
  weather: WeatherSeries | null;
}) {
  return (
    <div role="group" aria-label="Jour affiché" className="mt-2.5 grid grid-cols-8 gap-1">
      {weekBest.map((score, offset) => {
        const index = levelIndex(score);
        const current = offset === day;
        const rain = weather?.rainMm[offset];
        const code = weather?.weatherCode[offset];
        const Icon = code != null ? SKY_ICONS[skyOf(code)] : null;
        return (
          <button
            key={offset}
            type="button"
            onClick={() => onDayChange(offset)}
            aria-pressed={current}
            aria-label={`${dayLabel(offset)} — ${LEVELS[index]!.short}`}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-md py-1 transition-colors",
              current ? "bg-accent" : "hover:bg-accent/50",
            )}
          >
            {Icon ? (
              <Icon
                className={cn(
                  "size-3",
                  rain != null && rain >= 3 ? "text-[#8fa8c4]" : "text-muted-foreground",
                )}
                aria-hidden
              />
            ) : null}
            <span data-numeric className="text-muted-foreground text-[0.5625rem] leading-none">
              {rain != null && rain >= 0.5 ? `${rain}mm` : "—"}
            </span>
            {/* Une barre plutôt qu'une pastille : la hauteur donne la tendance de la semaine
                d'un seul regard. Le plancher de 15 % garde une barre visible même à zéro. */}
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
  );
}

/** Visible seulement au cran déplié : le détail que la barre, trop étroite, ne peut pas porter. */
function WeekDetail({
  weekBest,
  day,
  onDayChange,
  weather,
}: {
  weekBest: number[];
  day: number;
  onDayChange: (day: number) => void;
  weather: WeatherSeries | null;
}) {
  return (
    <div className="mt-3.5">
      <div className="border-border border-t" />
      <h3 className="text-muted-foreground mt-3 text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
        La semaine, jour par jour
      </h3>
      <div className="mt-2.5 flex flex-col gap-px">
        {weekBest.map((score, offset) => {
          const index = levelIndex(score);
          const current = offset === day;
          const tmin = weather?.tminC[offset];
          const tmax = weather?.tmaxC[offset];
          const rain = weather?.rainMm[offset];
          const soil = weather?.soilMoisture[offset] != null ? soilOf(weather.soilMoisture[offset]!) : null;
          return (
            <button
              key={offset}
              type="button"
              onClick={() => onDayChange(offset)}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-2 transition-colors",
                current ? "bg-accent" : "hover:bg-accent/50",
              )}
            >
              <span className="text-foreground w-14 flex-none text-left text-xs">
                {offset === 0 ? "auj." : dayShort(offset)}
              </span>
              <span data-numeric className="text-muted-foreground w-14 flex-none text-right text-xs">
                {tmin != null && tmax != null ? `${tmin}–${tmax}°` : "—"}
              </span>
              <span data-numeric className="text-muted-foreground w-12 flex-none text-right text-xs">
                {rain != null ? `${rain} mm` : "—"}
              </span>
              <span className="text-muted-foreground flex-1 truncate text-right text-xs">
                {soil ?? "—"}
              </span>
              <span
                className="w-16 flex-none text-right text-xs font-medium"
                style={{ color: LEVELS[index]!.color }}
              >
                {LEVELS[index]!.short}
              </span>
            </button>
          );
        })}
      </div>

      <div className="border-border mt-3.5 border-t" />
      <div className="mt-3 flex items-center gap-2 pb-1">
        <div className="flex gap-0.5">
          {RAMP.map((color) => (
            <span key={color} className="h-1.5 w-5 rounded-sm" style={{ background: color }} />
          ))}
        </div>
        <span className="text-muted-foreground text-[0.6875rem]">
          de très faibles à très bonnes chances
        </span>
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
