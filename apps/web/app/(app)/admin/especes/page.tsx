import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { SpeciesEditor } from "./species-editor";

export const metadata: Metadata = { title: "Espèces — Mycélio" };

export default async function EspecesPage() {
  await requirePermission("admin.species.manage");

  const supabase = await createClient();
  const { data } = await supabase
    .from("species")
    .select("*")
    .order("sort_order")
    .order("common_name_fr");

  const species = data ?? [];
  const enabled = species.filter((s) => s.is_enabled).length;

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Espèces"
        description="La base de connaissance mycologique. C'est le contenu qui différencie l'application — et le levier de calibration principal après les premières sorties."
        edition={`${species.length} espèces · ${enabled} active${enabled > 1 ? "s" : ""}`}
      />

      <SpeciesEditor species={species} />
    </>
  );
}
