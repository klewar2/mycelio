import { AdminTabs, type AdminTab } from "@/components/admin/admin-tabs";
import { PageContainer } from "@/components/shell/page-header";
import { can } from "@/lib/auth/can";
import { requirePermission } from "@/lib/auth/session";

/**
 * Le layout garde l'accès général à l'administration, mais CHAQUE page porte en plus sa propre
 * exigence : en App Router, les pages se rendent indépendamment lors des navigations douces, un
 * contrôle posé uniquement ici ne les couvrirait pas.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePermission("admin.access");

  const tabs: AdminTab[] = [
    { href: "/admin/comptes", label: "Comptes", show: can(ctx, "admin.users.manage") },
    { href: "/admin/droits", label: "Droits", show: can(ctx, "admin.roles.manage") },
    { href: "/admin/parametres", label: "Paramètres", show: can(ctx, "admin.settings.manage") },
    { href: "/admin/scoring", label: "Scoring", show: can(ctx, "admin.settings.manage") },
    { href: "/admin/especes", label: "Espèces", show: can(ctx, "admin.species.manage") },
    { href: "/admin/donnees", label: "Données", show: can(ctx, "admin.datasets.manage") },
    { href: "/admin/audit", label: "Audit", show: can(ctx, "admin.audit.view") },
  ].filter((t) => t.show);

  return (
    <PageContainer>
      <AdminTabs tabs={tabs} />
      {children}
    </PageContainer>
  );
}
