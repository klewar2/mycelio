import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Journal — Mycélio" };

export default async function JournalPage() {
  await requireSession();

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Carnet de sorties"
        title="Journal"
        description="Tes sorties, tes trouvailles — et surtout tes sorties bredouilles."
      />

      <div className="surface-float p-5">
        <p className="text-muted-foreground text-sm leading-relaxed">
          Le carnet arrive en phase 6. Il enregistrera aussi vite une sortie vide qu&apos;une
          trouvaille, et ce n&apos;est pas un détail d&apos;ergonomie : les bases publiques ne
          contiennent que des présences. Une sortie bredouille est une vraie absence, la donnée
          que personne d&apos;autre n&apos;a, et celle qui rendra le modèle meilleur que
          n&apos;importe quelle application publique.
        </p>
      </div>
    </PageContainer>
  );
}
