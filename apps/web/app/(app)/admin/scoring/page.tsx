import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { SettingsForm } from "@/components/admin/settings-form";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Scoring — Mycélio" };

/**
 * Les paramètres de scoring SONT des app_settings : cet écran n'est que le rendu générique
 * filtré sur leur catégorie. Écrire un second formulaire à la main aurait dupliqué la logique
 * pour rien.
 */
export default async function ScoringPage() {
  await requirePermission("admin.settings.manage");

  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("*")
    .eq("category", "scoring")
    .order("key");

  const settings = data ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Scoring"
        description="Les poids et seuils du moteur de probabilité. C'est le levier de calibration principal après les premières sorties sur le terrain."
        edition={`${settings.length} paramètres`}
      />

      <SettingsForm settings={settings} />

      <div className="surface-float mt-6 p-4">
        <p className="text-muted-foreground text-xs leading-relaxed">
          Le recalcul se déclenchera depuis ici en phase 4, quand le cron et la table des
          cellules existeront. Ces valeurs sont déjà enregistrées et versionnées.
        </p>
      </div>
    </>
  );
}
