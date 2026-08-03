import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CreateAccountDialog } from "./create-account-dialog";
import { AccountsTable, type AccountRow } from "./accounts-table";

export const metadata: Metadata = { title: "Comptes — Mycélio" };

export default async function ComptesPage() {
  const ctx = await requirePermission("admin.users.manage");

  // Les profils passent par le client utilisateur, donc par la RLS.
  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: true });

  // Les adresses vivent dans auth.users, hors de portée de la RLS. C'est une lecture
  // auth.admin.*, donc conforme à la règle qui encadre le client service_role.
  const admin = createAdminClient();
  const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 200 });
  const emailById = new Map(authUsers?.users.map((u) => [u.id, u.email ?? null]) ?? []);

  const rows: AccountRow[] = (profiles ?? []).map((p) => ({
    ...p,
    email: emailById.get(p.id) ?? null,
  }));

  const activeAdmins = rows.filter((p) => p.role === "admin" && p.is_active).length;

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Comptes"
        description="Il n'y a pas d'inscription : tu crées les comptes ici et transmets les identifiants."
        edition={`${rows.length} compte${rows.length > 1 ? "s" : ""} · ${activeAdmins} admin${activeAdmins > 1 ? "s" : ""} actif${activeAdmins > 1 ? "s" : ""}`}
        action={<CreateAccountDialog />}
      />

      <AccountsTable rows={rows} currentUserId={ctx.userId} />
    </>
  );
}
