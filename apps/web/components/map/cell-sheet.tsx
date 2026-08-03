"use client";

import { useEffect, useState } from "react";
import { TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TerrainCore } from "./terrain-core";
import { aspectLabel, topographicPosition } from "@/lib/terrain/advice";
import { LEVELS, dayLabel, levelIndex, levelOf } from "@/lib/scoring/levels";

type FamilyDetail = {
  label: string;
  scores: number[];
  confidence: number;
  leader: {
    name: string;
    scientific: string;
    notes: string | null;
    confusions: string | null;
  };
  members: string[];
};

type CellDetail = {
  cell: {
    h3_index: string;
    alt_m: number | null;
    slope_pct: number | null;
    northness: number | null;
    eastness: number | null;
    tpi: number | null;
    twi: number | null;
    essence: string | null;
    hosts: string[] | null;
    forest_share: number | null;
    dist_edge_m: number | null;
    dist_stream_m: number | null;
    soil_ph: number | null;
    soil_clay_pct: number | null;
    soil_soc: number | null;
  };
  families: FamilyDetail[];
  advice: string[];
};

/**
 * Panneau d'inspection — le cœur du produit.
 *
 * L'ordre des blocs est l'ordre des questions : ça vaut le coup ? quoi ? où chercher ? à quoi
 * ressemble l'endroit ? La lecture du terrain, qui ouvrait le panneau, est passée en dernier —
 * non parce qu'elle vaudrait moins, mais parce qu'elle répond à une question qu'on ne se pose
 * qu'après avoir décidé d'y aller.
 *
 * Aucun pourcentage n'y figure. « 14 % » ne se compare à rien pour qui n'a pas écrit le modèle,
 * et se lit spontanément comme « une chance sur sept », ce qui est faux : le score est un indice
 * de faveur, pas une probabilité calibrée.
 *
 * Bottom sheet sur mobile, colonne flottante sur desktop.
 */
export function CellSheet({
  h3,
  day,
  onClose,
}: {
  h3: string | null;
  day: number;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<CellDetail | null>(null);

  useEffect(() => {
    // Pas de remise à zéro ici : effacer l'état depuis un effet est un setState synchrone, qui
    // déclenche un rendu en cascade. Le contrôle `ready` suffit à ignorer un détail périmé.
    if (!h3) return;
    let cancelled = false;
    fetch(`/api/cell/${h3}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && !data.error) setDetail(data);
      });
    return () => {
      cancelled = true;
    };
  }, [h3]);

  if (!h3) return null;

  // L'état de chargement se déduit : le détail affiché correspond-il à la maille demandée ?
  const ready = detail?.cell.h3_index === h3;
  const cell = ready ? detail.cell : undefined;
  const advice = ready ? detail.advice : [];

  // Classées sur le jour affiché, et non sur aujourd'hui : c'est le jour que l'utilisateur
  // regarde qui décide de ce qui remonte en tête.
  const families = ready
    ? [...detail.families].sort((a, b) => (b.scores[day] ?? 0) - (a.scores[day] ?? 0))
    : [];
  const leading = families[0];
  const leadingScore = leading?.scores[day] ?? 0;

  const bestDay = leading
    ? leading.scores.reduce(
        (best, value, index) => (value > (leading.scores[best] ?? 0) ? index : best),
        0,
      )
    : 0;

  return (
    <aside
      role="dialog"
      aria-label="Ce coin"
      className="surface-float pointer-events-auto absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+15.5rem)] z-20 max-h-[50dvh] overflow-y-auto p-4 lg:inset-x-auto lg:top-20 lg:right-3 lg:bottom-3 lg:max-h-none lg:w-88"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-muted-foreground text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
          Ce coin · {dayLabel(day)}
        </p>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Fermer"
          className="-mt-2 -mr-2"
        >
          <X className="size-4" />
        </Button>
      </div>

      {!ready ? <p className="text-muted-foreground mt-6 text-sm">Lecture du coin…</p> : null}

      {cell ? (
        <>
          {/* ---------- Bloc 1 : le verdict ---------- */}
          <section className="mt-2">
            {leading ? (
              <>
                <p className="font-display text-foreground text-xl leading-tight font-semibold">
                  {levelOf(leadingScore).label}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {leadingScore > 0
                    ? `pour les ${leading.label.toLowerCase()}, la meilleure famille ici`
                    : "aucune famille en poussée sur ce coin ce jour-là"}
                </p>
                <LevelBar score={leadingScore} className="mt-2.5" />
                {bestDay !== day && (leading.scores[bestDay] ?? 0) > leadingScore ? (
                  <p className="text-muted-foreground mt-2 text-xs">
                    Ça s&apos;améliore : <span className="text-foreground">{dayLabel(bestDay)}</span>{" "}
                    est le meilleur jour ici.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                Aucun score sur ce coin. Le calcul quotidien n&apos;a peut-être pas encore tourné.
              </p>
            )}
          </section>

          {/* ---------- Bloc 2 : ce qu'on peut espérer ---------- */}
          {families.length > 0 ? (
            <section className="border-border mt-5 border-t pt-4">
              <h3 className="text-muted-foreground text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
                Ce qu&apos;on peut espérer
              </h3>
              <ul className="mt-3 space-y-3">
                {families.slice(0, 4).map((family) => {
                  const score = family.scores[day] ?? 0;
                  return (
                    <li key={family.label}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span
                          className="text-foreground truncate text-sm"
                          title={family.members.join(", ")}
                        >
                          {family.label}
                        </span>
                        <span className="text-muted-foreground shrink-0 text-xs">
                          {levelOf(score).short}
                        </span>
                      </div>
                      <LevelBar score={score} className="mt-1.5" />
                    </li>
                  );
                })}
              </ul>

              {/* Une seule fois, en bas du bloc, et non sous chaque famille : les confiances se
                  ressemblent d'une espèce à l'autre sur une même maille — c'est la donnée de
                  terrain qui manque, pas l'espèce qui est mal connue. Répétée quatre fois, la
                  mention devenait du bruit qu'on cesse de lire. */}
              {families.slice(0, 4).some((f) => f.confidence < 0.6) ? (
                <p className="text-muted-foreground mt-3 text-[0.6875rem] leading-relaxed">
                  Estimations moins sûres sur ce coin : il y manque une donnée de terrain, le plus
                  souvent la nature du sol.
                </p>
              ) : null}
            </section>
          ) : null}

          {/* ---------- Bloc 3 : où chercher, sur place ---------- */}
          {advice.length > 0 ? (
            <section className="border-border mt-5 border-t pt-4">
              <h3 className="text-muted-foreground text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
                Où chercher sur place
              </h3>
              <ul className="mt-3 space-y-2.5">
                {advice.map((text) => (
                  <li
                    key={text}
                    className="border-primary/40 text-foreground border-l-2 pl-3 text-xs leading-relaxed"
                  >
                    {text}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* ---------- Bloc 4 : lecture brute du terrain ---------- */}
          <section className="border-border mt-5 border-t pt-4">
            <h3 className="text-muted-foreground text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
              Le terrain
            </h3>

            <div className="mt-3">
              <TerrainCore
                forestShare={cell.forest_share}
                slopePct={cell.slope_pct}
                soilPh={cell.soil_ph}
                soilSoc={cell.soil_soc}
                soilClay={cell.soil_clay_pct}
                tpi={cell.tpi}
              />
            </div>

            <dl className="mt-3 space-y-2">
              <Row label="Arbres dominants" value={cell.essence ?? "non renseignés"} />
              <Row
                label="Densité du bois"
                value={cell.forest_share == null ? "—" : `${Math.round(cell.forest_share * 100)} %`}
                numeric
              />
              <Row label="Altitude" value={fmt(cell.alt_m, " m")} numeric />
              <Row label="Pente" value={fmt(cell.slope_pct, " %")} numeric />
              <Row label="Exposition" value={aspectLabel(cell.northness, cell.eastness)} />
              <Row label="Position" value={topographicPosition(cell.tpi)} />
              <Row label="Bord du bois" value={fmt(cell.dist_edge_m, " m")} numeric />
              <Row label="Ruisseau le plus proche" value={fmt(cell.dist_stream_m, " m")} numeric />
              <Row label="Acidité du sol" value={phLabel(cell.soil_ph)} />
            </dl>
          </section>

          {/* Confusions dangereuses de l'espèce qui porte le score de la famille de tête. */}
          {leading?.leader.confusions ? (
            <section className="mt-5">
              <div
                className="flex items-start gap-2 rounded-md border p-3"
                style={{ borderColor: "var(--warn-solid)" }}
              >
                <TriangleAlert
                  className="mt-0.5 size-3.5 shrink-0"
                  style={{ color: "var(--warn-solid)" }}
                  aria-hidden
                />
                <div>
                  <p
                    className="text-[0.6875rem] font-semibold"
                    style={{ color: "var(--destructive)" }}
                  >
                    Confusions dangereuses — {leading.leader.name}
                  </p>
                  <p className="text-foreground mt-1 text-[0.6875rem] leading-relaxed">
                    {leading.leader.confusions}
                  </p>
                </div>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </aside>
  );
}

/**
 * Jauge à cinq crans — la même échelle que la carte, la légende et la barre de semaine.
 *
 * Cinq segments plutôt qu'une barre continue : le lecteur voit qu'il existe cinq niveaux, donc
 * où se situe celui-ci, ce qu'une barre remplie à 40 % ne dit pas.
 */
function LevelBar({ score, className }: { score: number; className?: string }) {
  const index = levelIndex(score);
  return (
    <div className={`flex gap-1 ${className ?? ""}`} aria-hidden>
      {LEVELS.map((level, i) => (
        <span
          key={level.short}
          className="bg-border h-1.5 flex-1 rounded-full"
          style={i <= index ? { background: level.color } : undefined}
        />
      ))}
    </div>
  );
}

function Row({ label, value, numeric }: { label: string; value: string; numeric?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd data-numeric={numeric ? "" : undefined} className="text-foreground text-right text-xs">
        {value}
      </dd>
    </div>
  );
}

/**
 * Le pH en mots.
 *
 * « pH 5,4 » n'aide personne à décider ; « plutôt acide » se relie directement aux conseils du
 * bloc précédent, qui parlent de sols acides et de sols calcaires. La valeur reste entre
 * parenthèses pour qui sait la lire.
 */
function phLabel(ph: number | null): string {
  if (ph == null) return "—";
  const word = ph < 5.5 ? "acide" : ph < 6.5 ? "plutôt acide" : ph < 7.2 ? "neutre" : "calcaire";
  return `${word} (pH ${ph.toFixed(1)})`;
}

function fmt(value: number | null, suffix = "", digits = 0) {
  if (value == null) return "—";
  return `${value.toFixed(digits)}${suffix}`;
}
