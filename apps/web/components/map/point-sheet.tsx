"use client";

import { useCallback, useState } from "react";
import { Copy, Crosshair, MapPin, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteSpot, saveSpot } from "@/app/(app)/carte/actions";
import { formatCoords, parseCoords, type Coords } from "@/lib/map/coordinates";
import { MOBILE_NAV_CLEARANCE, POINT_SHEET_HEIGHTS } from "@/lib/map/sheet";
import type { Spot } from "@/lib/map/spots";
import { useServerAction } from "@/lib/use-server-action";

/**
 * Relevé d'un point, et fiche d'un spot enregistré — la même feuille.
 *
 * Les deux montrent d'abord la même chose : un couple de coordonnées et de quoi le copier. Les
 * séparer en deux composants dupliquerait cette ligne, qui est le cœur du besoin — sortir une
 * position de l'application pour la coller dans un GPS.
 *
 * Le champ de coordonnées est À LA FOIS l'affichage et la saisie. C'est délibéré : la même
 * ligne sert à lire ce qu'on vient de toucher sur la carte, à le sélectionner à la main si la
 * copie automatique échoue, et à coller ce qu'un ami vient d'envoyer. Un libellé en lecture
 * seule doublé d'un champ de saisie dirait deux fois la même chose et laisserait le doute sur
 * lequel des deux fait foi.
 *
 * La saisie n'est validée qu'à la sortie du champ ou sur Entrée, jamais à la frappe : analyser
 * en continu déplacerait la carte sous le doigt à chaque caractère, et « 43.4 » est un point
 * parfaitement valide à mi-chemin de « 43.45123 ».
 */
export function PointSheet({
  point,
  spot,
  canManage,
  onPointChange,
  onClose,
}: {
  /** Le point relevé, ou null tant que rien n'a été touché ni collé. */
  point: Coords | null;
  /** Non nul quand la feuille montre un spot enregistré plutôt qu'un relevé libre. */
  spot: Spot | null;
  /** L'utilisateur a-t-il le droit d'enregistrer des spots ? La lecture seule n'en a pas. */
  canManage: boolean;
  onPointChange: (coords: Coords) => void;
  onClose: () => void;
}) {
  const coords = spot ? { lat: spot.lat, lng: spot.lng } : point;
  const height = spot
    ? POINT_SHEET_HEIGHTS.spot
    : point
      ? POINT_SHEET_HEIGHTS.releve
      : POINT_SHEET_HEIGHTS.attente;

  return (
    <aside
      role="dialog"
      aria-label={spot ? "Mon spot" : "Relevé d'un point"}
      className="surface-float pointer-events-auto absolute inset-x-3 z-20 overflow-y-auto transition-[height] duration-300 ease-out lg:inset-x-auto lg:top-20 lg:right-3 lg:w-88"
      style={{ height, bottom: MOBILE_NAV_CLEARANCE }}
    >
      <div className="bg-card/95 sticky top-0 z-10 flex items-center gap-2 px-4 pt-4 pb-2 backdrop-blur-xl lg:bg-transparent lg:backdrop-blur-none">
        {spot ? (
          <MapPin className="text-primary size-4 shrink-0" aria-hidden />
        ) : (
          <Crosshair className="text-primary size-4 shrink-0" aria-hidden />
        )}
        <p className="text-muted-foreground flex-1 truncate text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
          {spot ? "Mon spot" : "Relevé du point"}
        </p>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fermer">
          <X className="size-4" />
        </Button>
      </div>

      <div className="space-y-4 px-4 pb-4">
        {spot ? (
          <div>
            <p className="font-display text-foreground text-lg leading-tight font-semibold">
              {spot.label}
            </p>
            {spot.notes ? (
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">{spot.notes}</p>
            ) : null}
          </div>
        ) : null}

        <CoordsField
          coords={coords}
          editable={!spot}
          onPointChange={onPointChange}
        />

        {spot ? (
          <DeleteSpot spot={spot} onDeleted={onClose} />
        ) : point && canManage ? (
          <SaveSpot point={point} onSaved={onClose} />
        ) : null}
      </div>
    </aside>
  );
}

/**
 * La ligne de coordonnées : lecture, copie, et saisie quand le point n'est pas encore figé.
 */
function CoordsField({
  coords,
  editable,
  onPointChange,
}: {
  coords: Coords | null;
  editable: boolean;
  onPointChange: (coords: Coords) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const text = coords ? formatCoords(coords.lat, coords.lng) : "";

  const copy = useCallback(async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Coordonnées copiées.");
    } catch {
      // Contexte non sécurisé, permission refusée, navigateur ancien : le champ reste
      // sélectionnable, ce qui est précisément pourquoi c'en est un.
      toast.error("Copie impossible. Sélectionne les coordonnées pour les copier à la main.");
    }
  }, [text]);

  const commit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || trimmed === text) {
        setError(null);
        return;
      }
      const parsed = parseCoords(trimmed);
      if (!parsed) {
        setError("Coordonnées illisibles. Par exemple : 43.45123, 1.89345");
        return;
      }
      setError(null);
      onPointChange(parsed);
    },
    [text, onPointChange],
  );

  return (
    <div>
      <div className="flex items-center gap-2">
        <Input
          // Remonté par la clé et non par un effet : quand la carte pose un nouveau point, le
          // champ doit repartir de sa valeur, et un setState dans un effet déclencherait un
          // rendu en cascade que ce projet évite partout ailleurs.
          key={text || "vide"}
          defaultValue={text}
          readOnly={!editable}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          aria-label="Coordonnées"
          aria-invalid={error ? true : undefined}
          placeholder="43.45123, 1.89345"
          data-numeric
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            commit(event.currentTarget.value);
          }}
          onBlur={(event) => commit(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={copy}
          disabled={!text}
          aria-label="Copier les coordonnées"
          title="Copier les coordonnées"
        >
          <Copy className="size-4" />
        </Button>
      </div>

      <p className="text-muted-foreground mt-1.5 text-[0.6875rem] leading-relaxed">
        {error ? (
          <span style={{ color: "var(--destructive)" }}>{error}</span>
        ) : editable ? (
          coords ? (
            "À coller dans un GPS. Touche la carte pour relever un autre point."
          ) : (
            "Touche la carte, ou colle ici des coordonnées reçues."
          )
        ) : (
          "À coller dans un GPS."
        )}
      </p>
    </div>
  );
}

function SaveSpot({ point, onSaved }: { point: Coords; onSaved: () => void }) {
  const { run, pending } = useServerAction(saveSpot, { onSuccess: onSaved });

  return (
    <form action={run} className="border-border space-y-3 border-t pt-4">
      <input type="hidden" name="lat" value={point.lat} />
      <input type="hidden" name="lng" value={point.lng} />

      <div className="space-y-2">
        <Label htmlFor="spot-label">Garder ce coin</Label>
        <Input
          id="spot-label"
          name="label"
          required
          maxLength={80}
          placeholder="Les chênes du Cammazes"
        />
      </div>

      <Input name="notes" maxLength={500} placeholder="Sous les grands chênes, versant nord" />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Enregistrement…" : "Enregistrer ce spot"}
      </Button>
    </form>
  );
}

function DeleteSpot({ spot, onDeleted }: { spot: Spot; onDeleted: () => void }) {
  const { run, pending } = useServerAction(deleteSpot, { onSuccess: onDeleted });

  return (
    <form
      action={run}
      className="border-border border-t pt-3"
      // Pas de confirmation : un spot se repose en trois gestes, et une boîte de dialogue de
      // plus sur une carte qu'on consulte d'une main en forêt coûterait plus qu'elle ne
      // protège. Les gardes de ce projet sont là où une erreur est irréparable.
    >
      <input type="hidden" name="id" value={spot.id} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pending}
        className="text-muted-foreground hover:text-foreground gap-2"
      >
        <Trash2 className="size-3.5" aria-hidden />
        {pending ? "Suppression…" : "Supprimer ce spot"}
      </Button>
    </form>
  );
}
