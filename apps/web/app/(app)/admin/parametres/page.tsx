import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { SettingsForm } from "@/components/admin/settings-form";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Paramètres — Mycélio" };

export default async function ParametresPage() {
  await requirePermission("admin.settings.manage");

  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("*")
    .neq("category", "scoring")
    .order("category")
    .order("key");

  const settings = data ?? [];
  const lastUpdate = settings.reduce<string | null>(
    (acc, s) => (acc && acc > s.updated_at ? acc : s.updated_at),
    null,
  );

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Paramètres"
        description="Ce formulaire est généré depuis la table app_settings. Ajouter une clé en SQL suffit à la voir apparaître ici."
        edition={
          lastUpdate
            ? `${settings.length} paramètres · dernière modification le ${new Date(lastUpdate).toLocaleDateString("fr-FR")}`
            : `${settings.length} paramètres`
        }
      />

      <SettingsForm settings={settings} />
    </>
  );
}
