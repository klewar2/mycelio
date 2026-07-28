"use client";

import { CircleSlash, Share2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useServerAction } from "@/lib/use-server-action";
import { deleteOuting, toggleVisibility } from "./actions";

type Outing = {
  id: string;
  user_id: string;
  occurred_on: string;
  h3_index: string | null;
  found_nothing: boolean;
  notes: string | null;
  visibility: string;
  duration_min: number | null;
  finds: { id: string; species_id: number | null; quantity_g: number | null; maturity: string | null }[];
};

export function OutingList({
  outings,
  currentUserId,
  speciesById,
}: {
  outings: Outing[];
  currentUserId: string;
  speciesById: Record<number, string>;
}) {
  const { run: remove } = useServerAction(deleteOuting);
  const { run: share } = useServerAction(toggleVisibility);

  return (
    <ul className="space-y-3">
      {outings.map((outing) => {
        const mine = outing.user_id === currentUserId;
        const date = new Date(outing.occurred_on).toLocaleDateString("fr-FR", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        });

        return (
          <li key={outing.id} className="surface-float p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-foreground text-sm font-medium">{date}</p>
                  {outing.found_nothing ? (
                    <Badge variant="outline" className="gap-1">
                      <CircleSlash className="size-3" aria-hidden />
                      bredouille
                    </Badge>
                  ) : null}
                  {outing.visibility === "shared" ? (
                    <Badge variant="outline" className="gap-1">
                      <Share2 className="size-3" aria-hidden />
                      partagée
                    </Badge>
                  ) : null}
                  {!mine ? <Badge variant="outline">du cercle</Badge> : null}
                </div>

                {outing.finds.length > 0 ? (
                  <ul className="mt-2 space-y-0.5">
                    {outing.finds.map((find) => (
                      <li key={find.id} className="text-muted-foreground text-xs">
                        {find.species_id ? (speciesById[find.species_id] ?? "espèce inconnue") : "espèce non précisée"}
                        {find.quantity_g ? (
                          <span data-numeric> · {find.quantity_g} g</span>
                        ) : null}
                        {find.maturity ? ` · ${find.maturity}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {outing.notes ? (
                  <p className="text-muted-foreground mt-2 text-xs italic">{outing.notes}</p>
                ) : null}

                {outing.h3_index ? (
                  <p data-numeric className="text-muted-foreground mt-2 text-[0.6875rem]">
                    {outing.h3_index}
                  </p>
                ) : null}
              </div>

              {mine ? (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={
                      outing.visibility === "shared"
                        ? "Rendre cette sortie privée"
                        : "Partager cette sortie avec le cercle"
                    }
                    onClick={() => {
                      const fd = new FormData();
                      fd.set("id", outing.id);
                      fd.set("shared", String(outing.visibility !== "shared"));
                      share(fd);
                    }}
                  >
                    <Share2
                      className="size-4"
                      style={
                        outing.visibility === "shared" ? { color: "var(--primary)" } : undefined
                      }
                    />
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Supprimer cette sortie">
                        <Trash2 className="size-4" style={{ color: "var(--warn-solid)" }} />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer cette sortie ?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Les trouvailles associées sont supprimées avec elle. Une sortie
                          bredouille est une donnée : la garder aide le modèle.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            const fd = new FormData();
                            fd.set("id", outing.id);
                            remove(fd);
                          }}
                        >
                          Supprimer
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
