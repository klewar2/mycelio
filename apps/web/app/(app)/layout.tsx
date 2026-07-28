import { AppNav, type NavItem } from "@/components/shell/app-nav";
import { can } from "@/lib/auth/can";
import { requireSession } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireSession();

  // La navigation se compose depuis les permissions, jamais depuis le rôle : retirer
  // `admin.access` à un rôle dans la matrice fait disparaître l'onglet, sans redéploiement.
  const items: NavItem[] = [
    { href: "/carte", label: "Carte", icon: "map" },
    { href: "/journal", label: "Journal", icon: "journal" },
    { href: "/reglages", label: "Réglages", icon: "reglages" },
  ];
  if (can(ctx, "admin.access")) {
    items.push({ href: "/admin", label: "Admin", icon: "admin" });
  }

  return (
    <div className="min-h-dvh">
      <AppNav items={items} />
      {/* La marge basse dégage la barre d'onglets ; sur desktop c'est le rail qu'on dégage.
          La carte, elle, est en position fixe et passe volontairement dessous. */}
      <main className="min-h-dvh pb-[calc(env(safe-area-inset-bottom)+5.5rem)] lg:pb-0 lg:pl-16">
        {children}
      </main>
    </div>
  );
}
