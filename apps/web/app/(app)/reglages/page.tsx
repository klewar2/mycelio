import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS, type AppRole } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/auth/session";
import { logout } from "@/app/(auth)/connexion/actions";
import { ProfileForm, PasswordForm } from "./forms";

export const metadata: Metadata = { title: "Réglages — Mycélio" };

export default async function ReglagesPage() {
  const ctx = await requireSession();

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Compte"
        title="Réglages"
        edition={`${ctx.email ?? "—"} · ${ROLE_LABELS[ctx.profile.role as AppRole]} · ${ctx.permissions.size} permissions`}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <ProfileForm displayName={ctx.profile.display_name} />
        <PasswordForm />
      </div>

      <form action={logout} className="mt-6">
        <Button type="submit" variant="outline">
          Se déconnecter
        </Button>
      </form>
    </PageContainer>
  );
}
