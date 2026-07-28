import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { RoleMatrix, type MatrixPermission } from "./role-matrix";

export const metadata: Metadata = { title: "Droits — Mycélio" };

export default async function DroitsPage() {
  await requirePermission("admin.roles.manage");

  const supabase = await createClient();
  const [{ data: permissions }, { data: grants }] = await Promise.all([
    supabase.from("permissions").select("*").order("category").order("key"),
    supabase.from("role_permissions").select("*"),
  ]);

  const granted = new Set((grants ?? []).map((g) => `${g.role}:${g.permission}`));

  const rows: MatrixPermission[] = (permissions ?? []).map((p) => ({
    key: p.key,
    label: p.label,
    category: p.category,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Droits"
        description="Le code ne teste jamais un rôle, seulement une permission. Modifier cette matrice change immédiatement ce que chacun peut faire, jusque dans la base."
        edition={`${rows.length} permissions · ${granted.size} attributions`}
      />

      <RoleMatrix permissions={rows} granted={[...granted]} />
    </>
  );
}
