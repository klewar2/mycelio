"use client";

import { useCallback, useMemo, useState } from "react";
import { CircleSlash, Plus, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useServerAction } from "@/lib/use-server-action";
import { saveOuting } from "@/app/(app)/journal/actions";
import { groupByFamily, type Species } from "@/lib/map/families";

/**
 * Enregistrement rapide d'une sortie depuis la carte.
 *
 * Deux clics pour une sortie bredouille : le bouton, puis « Rien trouvé ». C'est le critère de
 * validation de la phase, et il n'est pas cosmétique — si noter une sortie vide demandait un
 * formulaire, personne ne le ferait, et c'est justement cette donnée qui manque à tout le monde
 * pour entraîner un modèle honnête.
 *
 * La trouvaille, elle, mérite un formulaire : espèce, quantité, maturité.
 */
export function QuickOuting({
  species,
  h3,
  position,
}: {
  species: Species[];
  h3: string | null;
  position: { lat: number; lng: number } | null;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"choix" | "trouvaille">("choix");

  // Groupé par famille, comme la carte : on cherche d'abord « cèpes », et l'espèce précise
  // n'apparaît qu'en dessous. C'est le seul endroit de l'application où elle est demandée, et
  // c'est justifié — le carnet est la matière de la phase 7, qui, elle, distingue les espèces.
  const families = useMemo(() => groupByFamily(species), [species]);

  const close = useCallback(() => {
    setOpen(false);
    setMode("choix");
  }, []);

  const { run, pending } = useServerAction(saveOuting, { onSuccess: close });

  // Date locale, et non UTC : une sortie notée en rentrant le soir serait datée de la veille,
  // le serveur et Postgres tournant en UTC. Le format sv-SE donne directement AAAA-MM-JJ.
  const today = new Date().toLocaleDateString("sv-SE");

  const context = (
    <>
      <input type="hidden" name="occurred_on" value={today} />
      <input type="hidden" name="h3_index" value={h3 ?? ""} />
      <input type="hidden" name="lat" value={position?.lat ?? ""} />
      <input type="hidden" name="lng" value={position?.lng ?? ""} />
    </>
  );

  function recordEmpty() {
    const fd = new FormData();
    fd.set("found_nothing", "true");
    fd.set("occurred_on", today);
    if (h3) fd.set("h3_index", h3);
    if (position) {
      fd.set("lat", String(position.lat));
      fd.set("lng", String(position.lng));
    }
    run(fd);
  }

  return (
    <>
      <Button
        size="icon"
        onClick={() => setOpen(true)}
        aria-label="Enregistrer une sortie"
        className="pointer-events-auto size-12 rounded-full shadow-lg"
      >
        <Plus className="size-5" />
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setMode("choix");
        }}
      >
        <DialogContent className="sm:max-w-sm">
          {mode === "choix" ? (
            <>
              <DialogHeader>
                <DialogTitle>Enregistrer une sortie</DialogTitle>
                <DialogDescription>
                  {h3
                    ? "Sur la maille sélectionnée."
                    : position
                      ? "À ta position actuelle."
                      : "Sans localisation — sélectionne une maille pour la situer."}
                </DialogDescription>
              </DialogHeader>

              <div className="my-5 grid gap-3">
                {/* Volontairement au même rang visuel que la trouvaille, et non relégué en
                    second : une sortie vide est une donnée, pas un échec. */}
                <Button
                  variant="outline"
                  onClick={recordEmpty}
                  disabled={pending}
                  className="h-16 justify-start gap-3 text-left"
                >
                  <CircleSlash className="size-5 shrink-0" aria-hidden />
                  <span>
                    <span className="block font-medium">Rien trouvé</span>
                    <span className="text-muted-foreground block text-xs">
                      Enregistré immédiatement
                    </span>
                  </span>
                </Button>

                <Button
                  variant="outline"
                  onClick={() => setMode("trouvaille")}
                  className="h-16 justify-start gap-3 text-left"
                >
                  <Sprout className="size-5 shrink-0" aria-hidden />
                  <span>
                    <span className="block font-medium">Trouvaille</span>
                    <span className="text-muted-foreground block text-xs">
                      Espèce, quantité, maturité
                    </span>
                  </span>
                </Button>
              </div>
            </>
          ) : (
            <form action={run}>
              {context}
              <input type="hidden" name="found_nothing" value="false" />

              <DialogHeader>
                <DialogTitle>Trouvaille</DialogTitle>
                <DialogDescription>
                  Une espèce trouvée est un point à réenregistrer chaque année : les
                  mycorhiziens reviennent au même endroit.
                </DialogDescription>
              </DialogHeader>

              <div className="my-5 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="species_id">Espèce</Label>
                  <Select name="species_id" required>
                    <SelectTrigger id="species_id" className="w-full">
                      <SelectValue placeholder="Choisir" />
                    </SelectTrigger>
                    <SelectContent>
                      {families.map((family) => (
                        <SelectGroup key={family.key}>
                          {/* Une famille d'une seule espèce n'a pas besoin d'un intertitre qui
                              répète le nom juste en dessous. */}
                          {family.species.length > 1 ? (
                            <SelectLabel>{family.label}</SelectLabel>
                          ) : null}
                          {family.species.map((s) => (
                            <SelectItem key={s.slug} value={String(s.id)}>
                              {s.common_name_fr}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="quantity_g">Quantité (g)</Label>
                    <Input id="quantity_g" name="quantity_g" type="number" min={0} data-numeric />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maturity">Maturité</Label>
                    <Select name="maturity">
                      <SelectTrigger id="maturity" className="w-full">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="jeune">Jeune</SelectItem>
                        <SelectItem value="optimal">Optimal</SelectItem>
                        <SelectItem value="passé">Passé</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Input id="notes" name="notes" placeholder="Sous les fougères, versant nord" />
                </div>
              </div>

              <Button type="submit" disabled={pending} className="w-full">
                {pending ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
