import type { Metadata } from "next";
import { Download } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/auth/can";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { OutingList } from "./outing-list";

export const metadata: Metadata = { title: "Journal — Mycélio" };

export default async function JournalPage() {
  const ctx = await requireSession();

  const supabase = await createClient();
  // La RLS fait déjà le tri : on voit ses propres sorties et celles partagées par le cercle.
  const { data } = await supabase
    .from("outings")
    // Sur une seule ligne : Supabase infère le type des colonnes depuis le littéral de
    // sélection, et une concaténation lui fait perdre ce typage.
    .select("id, user_id, occurred_on, h3_index, found_nothing, notes, visibility, duration_min, finds(id, species_id, quantity_g, maturity)")
    .order("occurred_on", { ascending: false })
    .limit(200);

  const outings = data ?? [];
  const mine = outings.filter((o) => o.user_id === ctx.userId);
  const empty = mine.filter((o) => o.found_nothing).length;

  const { data: species } = await supabase
    .from("species")
    .select("id, common_name_fr")
    .eq("is_enabled", true);
  const speciesById = new Map((species ?? []).map((s) => [s.id, s.common_name_fr]));

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Carnet de sorties"
        title="Journal"
        description="Tes sorties et celles que le cercle a partagées. Une sortie bredouille compte autant qu'une trouvaille."
        edition={
          mine.length > 0
            ? `${mine.length} sortie${mine.length > 1 ? "s" : ""} · ${empty} bredouille${empty > 1 ? "s" : ""}`
            : undefined
        }
        action={
          can(ctx, "finds.export") && mine.length > 0 ? (
            <Button asChild variant="outline">
              <a href="/api/outings/gpx" download>
                <Download className="size-4" />
                Export GPX
              </a>
            </Button>
          ) : null
        }
      />

      {outings.length === 0 ? (
        <div className="surface-float p-5">
          <p className="text-foreground text-sm leading-relaxed">
            Aucune sortie enregistrée. Le bouton{" "}
            <span className="text-primary font-medium">+</span> de la carte en enregistre une en
            deux gestes.
          </p>
          <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
            Note aussi les sorties bredouilles. Les bases publiques ne contiennent que des
            présences : personne n&apos;enregistre l&apos;endroit où il n&apos;a rien trouvé. Ce
            sont ces absences qui rendront le modèle meilleur que n&apos;importe quelle
            application publique.
          </p>
        </div>
      ) : (
        <OutingList
          outings={outings}
          currentUserId={ctx.userId}
          speciesById={Object.fromEntries(speciesById)}
        />
      )}
    </PageContainer>
  );
}
