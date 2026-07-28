"use client";

import { useEffect, useState } from "react";
import { TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TerrainCore } from "./terrain-core";
import { aspectLabel, topographicPosition } from "@/lib/terrain/advice";

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
  species: {
    slug: string;
    name: string;
    scientific: string;
    notes: string | null;
    confusions: string | null;
    scores: number[];
    confidence: number;
  }[];
  advice: string[];
};

/**
 * Panneau d'inspection — le cœur du produit.
 *
 * Trois blocs : lecture brute du terrain, probabilités, conseils générés. Bottom sheet sur
 * mobile, colonne flottante sur desktop.
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
  const top = ready ? detail.species.slice(0, 3) : [];
  const advice = ready ? detail.advice : [];

  return (
    <aside
      role="dialog"
      aria-label="Analyse du terrain"
      className="surface-float pointer-events-auto absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+13rem)] z-20 max-h-[55dvh] overflow-y-auto p-4 lg:inset-x-auto lg:top-20 lg:right-3 lg:bottom-3 lg:max-h-none lg:w-80"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted-foreground text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
            Analyse du terrain
          </p>
          <p data-numeric className="text-foreground truncate text-xs">
            {h3}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fermer">
          <X className="size-4" />
        </Button>
      </div>

      {!ready ? (
        <p className="text-muted-foreground mt-6 text-sm">Lecture de la maille…</p>
      ) : null}

      {cell ? (
        <>
          {/* ---------- Bloc 1 : lecture brute du terrain ---------- */}
          <section className="mt-4">
            <TerrainCore
              forestShare={cell.forest_share}
              slopePct={cell.slope_pct}
              soilPh={cell.soil_ph}
              soilSoc={cell.soil_soc}
              soilClay={cell.soil_clay_pct}
              tpi={cell.tpi}
            />

            <dl className="mt-3 space-y-2">
              <Row label="Altitude" value={fmt(cell.alt_m, " m")} numeric />
              <Row label="Pente" value={fmt(cell.slope_pct, " %")} numeric />
              <Row label="Exposition" value={aspectLabel(cell.northness, cell.eastness)} />
              <Row label="Position" value={topographicPosition(cell.tpi)} />
              <Row label="Essence dominante" value={cell.essence ?? "non renseignée"} />
              <Row
                label="Couvert forestier"
                value={cell.forest_share == null ? "—" : `${Math.round(cell.forest_share * 100)} %`}
                numeric
              />
              <Row label="pH du sol" value={fmt(cell.soil_ph, "", 1)} numeric />
              <Row label="Distance à la lisière" value={fmt(cell.dist_edge_m, " m")} numeric />
              <Row label="Cours d'eau" value={fmt(cell.dist_stream_m, " m")} numeric />
            </dl>
          </section>

          {/* ---------- Bloc 2 : probabilités ---------- */}
          <section className="border-border mt-5 border-t pt-4">
            <h3 className="text-muted-foreground text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
              Probabilités
            </h3>

            {top.length === 0 ? (
              <p className="text-muted-foreground mt-2 text-xs">
                Aucun score sur cette maille. Le scoring quotidien n&apos;a peut-être pas encore
                tourné.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {top.map((sp) => (
                  <li key={sp.slug}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-foreground truncate text-sm">{sp.name}</span>
                      <span data-numeric className="text-foreground text-sm font-medium">
                        {Math.round((sp.scores[day] ?? 0) * 100)} %
                      </span>
                    </div>
                    <Trend scores={sp.scores} />
                    <p className="text-muted-foreground mt-1 text-[0.6875rem]">
                      Confiance {Math.round(sp.confidence * 100)} %
                      {sp.confidence < 0.6 ? " — donnée incomplète" : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ---------- Bloc 3 : conseils de terrain ---------- */}
          {advice.length > 0 ? (
            <section className="border-border mt-5 border-t pt-4">
              <h3 className="text-muted-foreground text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
                Sur le terrain
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

          {/* Confusions dangereuses de l'espèce la mieux notée. */}
          {top[0]?.confusions ? (
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
                    Confusions dangereuses — {top[0].name}
                  </p>
                  <p className="text-foreground mt-1 text-[0.6875rem] leading-relaxed">
                    {top[0].confusions}
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

/** Tendance sur l'horizon : une micro-courbe, sans axes ni légende. */
function Trend({ scores }: { scores: number[] }) {
  const max = Math.max(...scores, 0.001);
  return (
    <div className="mt-1.5 flex h-6 items-end gap-0.5" aria-hidden>
      {scores.map((value, i) => (
        <div
          key={i}
          className="bg-primary flex-1 rounded-[1px]"
          style={{ height: `${Math.max(6, (value / max) * 100)}%`, opacity: 0.35 + (value / max) * 0.65 }}
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

function fmt(value: number | null, suffix = "", digits = 0) {
  if (value == null) return "—";
  return `${value.toFixed(digits)}${suffix}`;
}
