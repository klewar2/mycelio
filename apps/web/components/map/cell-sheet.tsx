"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Cell } from "@/lib/map/hexagons";

/**
 * Panneau d'inspection de la maille pointée.
 *
 * Bottom sheet sur mobile, colonne flottante à droite sur desktop. En phase 3 il n'affiche que
 * la lecture brute du terrain : les probabilités et les conseils viendront avec le scoring
 * (phase 4) et les règles de terrain (phase 5).
 */
export function CellSheet({
  cell,
  essences,
  onClose,
}: {
  cell: Cell | null;
  essences: string[];
  onClose: () => void;
}) {
  if (!cell) return null;

  return (
    <aside
      role="dialog"
      aria-label="Détail de la maille"
      className="surface-float pointer-events-auto absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-20 p-4 lg:inset-x-auto lg:top-20 lg:right-3 lg:bottom-auto lg:w-80"
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

      <dl className="mt-4 space-y-2.5">
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
        Les probabilités par espèce et les conseils de terrain arrivent avec le moteur de
        scoring.
      </p>
    </aside>
  );
}

function Row({
  label,
  value,
  numeric,
}: {
  label: string;
  value: string;
  numeric?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd
        data-numeric={numeric ? "" : undefined}
        className="text-foreground text-right text-sm"
      >
        {value}
      </dd>
    </div>
  );
}
