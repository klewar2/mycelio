"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Cell, Forecast } from "@/lib/map/hexagons";

/**
 * Panneau d'inspection de la maille pointée.
 *
 * Bottom sheet sur mobile, colonne flottante à droite sur desktop. La lecture du terrain et la
 * probabilité y figurent ; les conseils de terrain générés viendront avec la phase 5.
 */
export function CellSheet({
  cell,
  forecast,
  day,
  speciesName,
  essences,
  onClose,
}: {
  cell: Cell | null;
  forecast: Forecast | null;
  day: number;
  speciesName: string | null;
  essences: string[];
  onClose: () => void;
}) {
  if (!cell) return null;

  const score = forecast?.s?.[day] ?? null;
  const confidence = forecast?.c ?? null;

  return (
    <aside
      role="dialog"
      aria-label="Détail de la maille"
      className="surface-float pointer-events-auto absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+13rem)] z-20 p-4 lg:inset-x-auto lg:top-20 lg:right-3 lg:bottom-auto lg:w-80"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted-foreground text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
            Maille
          </p>
          <p data-numeric className="text-foreground truncate text-sm">
            {cell.h}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fermer">
          <X className="size-4" />
        </Button>
      </div>

      {speciesName ? (
        <div className="border-border mt-4 border-t pt-4">
          <p className="text-muted-foreground text-xs">{speciesName}</p>
          <p
            data-numeric
            className="font-display text-foreground mt-0.5 text-3xl font-semibold"
          >
            {score == null ? "—" : `${Math.round(score * 100)} %`}
          </p>
          {confidence != null ? (
            <p className="text-muted-foreground mt-1 text-xs">
              {/* Affichée telle quelle : un score élevé mal étayé et un score élevé solide ne se
                  valent pas sur le terrain. */}
              Confiance {Math.round(confidence * 100)} %
              {confidence < 0.6 ? " — donnée de sol ou d'hôte incomplète" : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      <dl className="border-border mt-4 space-y-2.5 border-t pt-4">
        <Row
          label="Essence dominante"
          value={cell.e == null ? "non renseignée" : (essences[cell.e] ?? "non renseignée")}
        />
        <Row
          label="Couvert forestier"
          value={cell.f == null ? "—" : `${Math.round(cell.f * 100)} %`}
          numeric
        />
        <Row label="Altitude" value={cell.a == null ? "—" : `${cell.a} m`} numeric />
      </dl>

      <p className="text-muted-foreground mt-4 text-xs leading-relaxed">
        Les conseils de terrain — versant, position topographique, distance à la lisière —
        arrivent en phase 5.
      </p>
    </aside>
  );
}

function Row({ label, value, numeric }: { label: string; value: string; numeric?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd data-numeric={numeric ? "" : undefined} className="text-foreground text-right text-sm">
        {value}
      </dd>
    </div>
  );
}
