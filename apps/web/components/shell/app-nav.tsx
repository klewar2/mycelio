"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Map, NotebookPen, Settings2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";

const ICONS = { map: Map, journal: NotebookPen, reglages: Settings2, admin: ShieldCheck };

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS };

/**
 * Barre d'onglets basse sur mobile, rail vertical sur desktop.
 *
 * Dans les deux cas elle FLOTTE au-dessus de la carte, qui n'est jamais rognée : c'est le parti
 * pris de mise en page de toute l'application.
 */
export function AppNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  const isCurrent = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {/* Mobile — dans le pouce, jamais en haut. La marge basse tient compte de la barre
          d'accueil iOS, sans quoi les onglets passent dessous. */}
      <nav
        aria-label="Navigation principale"
        className="surface-float fixed inset-x-3 bottom-0 z-50 mb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center justify-around p-1.5 lg:hidden"
      >
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const current = isCurrent(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={current ? "page" : undefined}
              className={cn(
                "flex min-h-11 min-w-16 flex-col items-center justify-center gap-1 rounded-md px-3 py-1.5 text-[0.6875rem] font-medium transition-colors",
                current
                  ? "text-primary bg-accent"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-5" />
              {item.label}
            </Link>
          );
        })}
        <ThemeToggle className="size-11" />
      </nav>

      {/* Desktop — rail fin, la carte commence juste après. */}
      <nav
        aria-label="Navigation principale"
        className="bg-card border-border fixed inset-y-0 left-0 z-50 hidden w-16 flex-col items-center gap-1 border-r py-4 lg:flex"
      >
        <Link
          href="/carte"
          className="font-display text-primary mb-4 text-xl font-semibold"
          aria-label="Mycélio, accueil"
        >
          M
        </Link>

        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const current = isCurrent(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-current={current ? "page" : undefined}
              className={cn(
                "flex size-11 items-center justify-center rounded-md transition-colors",
                current
                  ? "text-primary bg-accent"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
              )}
            >
              <Icon className="size-5" />
              <span className="sr-only">{item.label}</span>
            </Link>
          );
        })}

        <ThemeToggle className="mt-auto size-11" />
      </nav>
    </>
  );
}
