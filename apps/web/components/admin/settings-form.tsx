"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { updateSetting, type ActionState } from "@/app/(app)/admin/parametres/actions";
import type { Tables } from "@/types/database";

export type Setting = Tables<"app_settings">;

const EMPTY: ActionState = { error: null, success: null };

/**
 * Rendu générique d'un paramètre, piloté par `value_type`.
 *
 * C'est l'exigence du cahier des charges : ajouter une clé dans `app_settings` doit suffire à
 * la voir apparaître ici, sans toucher au front. Rien dans ce fichier ne connaît le nom d'un
 * paramètre en particulier — si tu es tenté d'écrire `if (key === '…')`, c'est qu'il manque un
 * `value_type` ou une colonne, pas un cas particulier.
 */
function SettingControl({
  setting,
  value,
  onChange,
}: {
  setting: Setting;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const min = setting.min_value ?? undefined;
  const max = setting.max_value ?? undefined;

  switch (setting.value_type) {
    case "boolean":
      return (
        <Switch
          checked={Boolean(value)}
          onCheckedChange={onChange}
          aria-label={setting.label}
        />
      );

    case "number": {
      const num = typeof value === "number" ? value : 0;
      return (
        <Input
          type="number"
          value={num}
          min={min}
          max={max}
          step="any"
          data-numeric
          className="w-32"
          aria-label={setting.label}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        />
      );
    }

    case "enum": {
      const options = Array.isArray(setting.options) ? (setting.options as string[]) : [];
      return (
        <Select value={String(value ?? "")} onValueChange={onChange}>
          <SelectTrigger className="w-48" aria-label={setting.label}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    case "range": {
      const pair = Array.isArray(value) ? (value as number[]) : [0, 1];
      return (
        <div className="w-56 space-y-2">
          <Slider
            value={pair}
            min={min ?? 0}
            max={max ?? 1}
            step={((max ?? 1) - (min ?? 0)) / 100}
            onValueChange={onChange}
            aria-label={setting.label}
          />
          <p data-numeric className="text-muted-foreground text-xs">
            {pair[0]?.toFixed(2)} — {pair[1]?.toFixed(2)}
          </p>
        </div>
      );
    }

    case "json":
      return (
        <textarea
          value={JSON.stringify(value)}
          rows={2}
          data-numeric
          aria-label={setting.label}
          className="border-input bg-transparent focus-visible:ring-ring w-56 rounded-md border px-3 py-2 text-xs focus-visible:ring-2 focus-visible:outline-none"
          onChange={(e) => {
            try {
              onChange(JSON.parse(e.target.value));
            } catch {
              // Saisie intermédiaire invalide : on laisse taper, la base tranchera.
            }
          }}
        />
      );

    default:
      return (
        <Input
          value={String(value ?? "")}
          className="w-56"
          aria-label={setting.label}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

function SettingRow({ setting }: { setting: Setting }) {
  const [value, setValue] = useState<unknown>(setting.value);
  const [state, dispatch] = useActionState<ActionState, FormData>(updateSetting, EMPTY);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (state.success) toast.success(state.success);
    if (state.error) toast.error(state.error);
  }, [state]);

  const dirty = JSON.stringify(value) !== JSON.stringify(setting.value);

  function save() {
    const fd = new FormData();
    fd.set("key", setting.key);
    fd.set("value", JSON.stringify(value));
    startTransition(() => dispatch(fd));
  }

  return (
    <li className="surface-float flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 sm:max-w-md">
        <Label className="text-foreground text-sm font-medium">{setting.label}</Label>
        <p data-numeric className="text-muted-foreground mt-0.5 text-[0.6875rem]">
          {setting.key}
        </p>
        {setting.description ? (
          <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
            {setting.description}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <SettingControl setting={setting} value={value} onChange={setValue} />
        <Button size="sm" onClick={save} disabled={!dirty || pending}>
          {pending ? "…" : "Enregistrer"}
        </Button>
      </div>
    </li>
  );
}

export function SettingsForm({ settings }: { settings: Setting[] }) {
  if (settings.length === 0) {
    return <p className="text-muted-foreground text-sm">Aucun paramètre dans cette catégorie.</p>;
  }

  const categories = [...new Set(settings.map((s) => s.category))];

  return (
    <div className="space-y-8">
      {categories.map((category) => (
        <section key={category}>
          <h2 className="text-muted-foreground mb-3 text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
            {category}
          </h2>
          <ul className="space-y-3">
            {settings
              .filter((s) => s.category === category)
              .map((setting) => (
                <SettingRow key={setting.key} setting={setting} />
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
