"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Tables } from "@/types/database";
import { deleteSpecies, saveSpecies, type ActionState } from "./actions";

type Species = Tables<"species">;

const EMPTY: ActionState = { error: null, success: null };

function Field({
  name,
  label,
  hint,
  defaultValue,
  type = "text",
  ...rest
}: {
  name: string;
  label: string;
  hint?: string;
  // Les colonnes numériques de `species` sont nullables : on accepte null ici plutôt que de
  // forcer chaque appel à convertir.
  defaultValue?: string | number | null;
  type?: string;
} & Omit<React.ComponentProps<typeof Input>, "defaultValue" | "name" | "type">) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        data-numeric={type === "number" ? "" : undefined}
        {...rest}
      />
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Enregistrement…" : "Enregistrer"}
    </Button>
  );
}

function SpeciesDialog({
  species,
  open,
  onOpenChange,
}: {
  species: Species | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [state, dispatch] = useActionState<ActionState, FormData>(saveSpecies, EMPTY);

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      onOpenChange(false);
    }
  }, [state.success, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <form action={dispatch}>
          {species ? <input type="hidden" name="id" value={species.id} /> : null}

          <DialogHeader>
            <DialogTitle>{species ? species.common_name_fr : "Nouvelle espèce"}</DialogTitle>
            <DialogDescription>
              Ces valeurs alimenteront le moteur de scoring et le panneau d&apos;inspection. Ce
              sont elles qu&apos;on ajustera après les premières sorties.
            </DialogDescription>
          </DialogHeader>

          <div className="my-5 grid gap-4 sm:grid-cols-2">
            <Field
              name="common_name_fr"
              label="Nom français"
              defaultValue={species?.common_name_fr}
              required
            />
            <Field
              name="scientific_name"
              label="Nom latin"
              defaultValue={species?.scientific_name}
              required
            />
            <Field
              name="slug"
              label="Identifiant"
              hint="En minuscules, sans accent — sert d'URL."
              defaultValue={species?.slug}
              required
            />
            <Field
              name="host_codes"
              label="Essences hôtes"
              hint="Codes BD Forêt séparés par des virgules."
              defaultValue={species?.host_codes?.join(", ")}
            />

            <Field name="ph_min" label="pH minimum" type="number" step="0.1" defaultValue={species?.ph_min} />
            <Field name="ph_max" label="pH maximum" type="number" step="0.1" defaultValue={species?.ph_max} />
            <Field name="alt_min_m" label="Altitude min. (m)" type="number" defaultValue={species?.alt_min_m} />
            <Field name="alt_max_m" label="Altitude max. (m)" type="number" defaultValue={species?.alt_max_m} />

            <Field
              name="season_start_doy"
              label="Début de saison"
              hint="Jour de l'année, de 1 à 366."
              type="number"
              min={1}
              max={366}
              defaultValue={species?.season_start_doy}
            />
            <Field
              name="season_end_doy"
              label="Fin de saison"
              hint="Jour de l'année, de 1 à 366."
              type="number"
              min={1}
              max={366}
              defaultValue={species?.season_end_doy}
            />

            <Field
              name="rain_lag_days"
              label="Délai après pluie (jours)"
              hint="Entre l'épisode pluvieux et la fructification."
              type="number"
              defaultValue={species?.rain_lag_days}
            />
            <Field
              name="rain_optimum_mm"
              label="Pluie optimale (mm)"
              type="number"
              step="0.1"
              defaultValue={species?.rain_optimum_mm}
            />

            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="notes_terrain">Notes de terrain</Label>
              <textarea
                id="notes_terrain"
                name="notes_terrain"
                rows={3}
                defaultValue={species?.notes_terrain ?? ""}
                className="border-input focus-visible:ring-ring w-full rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
              />
              <p className="text-muted-foreground text-xs">
                Où chercher concrètement. Alimentera le panneau d&apos;inspection.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="prefers_calcareous"
                name="prefers_calcareous"
                defaultChecked={species?.prefers_calcareous ?? false}
              />
              <Label htmlFor="prefers_calcareous">Préfère le calcaire</Label>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="thermophilic"
                name="thermophilic"
                defaultChecked={species?.thermophilic ?? false}
              />
              <Label htmlFor="thermophilic">Thermophile</Label>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="is_enabled"
                name="is_enabled"
                defaultChecked={species?.is_enabled ?? true}
              />
              <Label htmlFor="is_enabled">Active sur la carte</Label>
            </div>
          </div>

          {state.error ? (
            <p role="alert" className="text-destructive mb-4 text-sm">
              {state.error}
            </p>
          ) : null}

          <DialogFooter>
            <Submit />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SpeciesEditor({ species }: { species: Species[] }) {
  const [editing, setEditing] = useState<Species | null>(null);
  const [open, setOpen] = useState(false);
  const [delState, delDispatch] = useActionState<ActionState, FormData>(deleteSpecies, EMPTY);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (delState.success) toast.success(delState.success);
    if (delState.error) toast.error(delState.error);
  }, [delState]);

  return (
    <>
      <div className="mb-5">
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="size-4" />
          Ajouter une espèce
        </Button>
      </div>

      {species.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Aucune espèce pour l&apos;instant. Commence par le cèpe de Bordeaux.
        </p>
      ) : (
        <ul className="space-y-2">
          {species.map((s) => (
            <li
              key={s.id}
              className="surface-float flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-foreground font-medium">{s.common_name_fr}</p>
                  {!s.is_enabled ? <Badge variant="outline">masquée</Badge> : null}
                </div>
                <p className="text-muted-foreground text-xs italic">{s.scientific_name}</p>
                <p data-numeric className="text-muted-foreground mt-1 text-[0.6875rem]">
                  {s.host_codes.length > 0 ? s.host_codes.join(", ") : "aucun hôte"}
                  {s.ph_min != null && s.ph_max != null ? ` · pH ${s.ph_min}–${s.ph_max}` : ""}
                  {s.alt_min_m != null && s.alt_max_m != null
                    ? ` · ${s.alt_min_m}–${s.alt_max_m} m`
                    : ""}
                </p>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Modifier ${s.common_name_fr}`}
                  onClick={() => {
                    setEditing(s);
                    setOpen(true);
                  }}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Supprimer ${s.common_name_fr}`}
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("id", String(s.id));
                    startTransition(() => delDispatch(fd));
                  }}
                >
                  <Trash2 className="size-4" style={{ color: "var(--warn-solid)" }} />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <SpeciesDialog
        key={editing?.id ?? "new"}
        species={editing}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
