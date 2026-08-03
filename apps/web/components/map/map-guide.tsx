"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LEVELS } from "@/lib/scoring/levels";

/**
 * Mode d'emploi de la carte, en quatre paragraphes.
 *
 * Il existe parce qu'une carte de probabilité n'est pas un objet évident : sans explication, un
 * dégradé d'ocre se lit comme une carte de relief, un secteur pâle passe pour une zone sans
 * données, et le classement relatif des couleurs — pourtant le choix le plus important de tout
 * le rendu — reste invisible.
 *
 * Volontairement accessible en permanence, et non affiché une seule fois au premier lancement :
 * une explication qu'on ne peut plus rouvrir n'est pas une explication.
 */
export function MapGuide({ trigger }: { trigger: React.ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Comment lire la carte</DialogTitle>
          <DialogDescription>
            Mycélio indique où et quand les conditions sont favorables. Il ne reconnaît aucun
            champignon.
          </DialogDescription>
        </DialogHeader>

        <div className="my-4 space-y-5 text-sm leading-relaxed">
          <section>
            <h3 className="text-foreground font-medium">Les couleurs</h3>
            <ul className="mt-2 space-y-1.5">
              {LEVELS.map((level) => (
                <li key={level.short} className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className="border-border size-4 shrink-0 rounded border"
                    style={{ background: level.color }}
                  />
                  <span className="text-muted-foreground text-xs">{level.label}</span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground mt-2.5 text-xs">
              Chaque hexagone couvre environ 280 m de large. Les teintes comparent les hexagones
              <strong className="text-foreground font-medium"> actuellement à l&apos;écran</strong> :
              en déplaçant la carte, elles se recalculent sur le nouveau secteur.
            </p>
          </section>

          <section>
            <h3 className="text-foreground font-medium">La semaine, et le verdict</h3>
            <p className="text-muted-foreground mt-1.5 text-xs">
              Chaque barre est un jour, du plus proche au plus lointain, et sa hauteur donne les
              chances du <strong className="text-foreground font-medium">meilleur coin</strong> de
              la zone affichée ce jour-là. La phrase au-dessus dit la même chose en toutes lettres,
              pour le jour choisi. Une barre qui monte, c&apos;est une poussée qui arrive : il vaut
              souvent mieux attendre deux jours que partir tout de suite.
            </p>
          </section>

          <section>
            <h3 className="text-foreground font-medium">Un coin en particulier</h3>
            <p className="text-muted-foreground mt-1.5 text-xs">
              Toucher un hexagone ouvre sa fiche : ce qu&apos;on peut y espérer, où chercher sur
              place, et la description du terrain — essence des arbres, pente, humidité, sol.
            </p>
          </section>

          <section>
            <h3 className="text-foreground font-medium">Ce que la carte ne fait pas</h3>
            <p className="text-muted-foreground mt-1.5 text-xs">
              Elle ne reconnaît aucun champignon et ne dit jamais si l&apos;un est comestible. Une
              récolte se fait valider par un pharmacien ou une société mycologique, toujours.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
