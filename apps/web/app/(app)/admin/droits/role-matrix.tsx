"use client";

import { useActionState, useEffect, useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLES_ASCENDING, ROLE_LABELS } from "@/lib/auth/permissions";
import { togglePermission, type ActionState } from "./actions";

export type MatrixPermission = { key: string; label: string; category: string };

/**
 * Retirer l'une de ces permissions au super_admin condamnerait l'administration des droits :
 * un trigger le refuse en base, on le rend visible ici plutôt que de laisser cliquer dans le
 * vide.
 */
const LOCKED = new Set([
  "admin.access",
  "admin.roles.manage",
  "admin.users.manage",
  "admin.audit.view",
]);

const CATEGORY_LABELS: Record<string, string> = {
  carte: "Carte",
  relevés: "Relevés",
  admin: "Administration",
};

/**
 * La matrice des droits, lue comme une coupe topographique.
 *
 * Les rôles sont strictement emboîtés — viewer ⊂ member ⊂ admin ⊂ super_admin — et c'est
 * exactement ce qu'encode une courbe de niveau : un emboîtement. Chaque colonne est donc une
 * bande d'altitude, dont la teinte monte avec le privilège, et le passage refusé → accordé est
 * souligné d'une ligne de niveau. En parcourant la colonne de ces lignes du regard, on lit le
 * relief des droits.
 */
export function RoleMatrix({
  permissions,
  granted,
}: {
  permissions: MatrixPermission[];
  granted: string[];
}) {
  const [state, dispatch] = useActionState<ActionState, FormData>(togglePermission, {
    error: null,
    success: null,
  });
  const [, startTransition] = useTransition();

  const [optimistic, applyOptimistic] = useOptimistic(
    new Set(granted),
    (current, { cell, grant }: { cell: string; grant: boolean }) => {
      const next = new Set(current);
      if (grant) next.add(cell);
      else next.delete(cell);
      return next;
    },
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  const categories = [...new Set(permissions.map((p) => p.category))];

  function toggle(role: string, permission: string, grant: boolean) {
    const fd = new FormData();
    fd.set("role", role);
    fd.set("permission", permission);
    fd.set("grant", String(grant));
    startTransition(() => {
      applyOptimistic({ cell: `${role}:${permission}`, grant });
      dispatch(fd);
    });
  }

  return (
    <div className="space-y-8">
      {/* En-tête des bandes. Sur mobile il reste visible : sans lui, les quatre colonnes ne
          voudraient rien dire. */}
      <div className="grid grid-cols-4 gap-1 sm:grid-cols-[minmax(0,1fr)_repeat(4,5rem)]">
        <div className="hidden sm:block" />
        {ROLES_ASCENDING.map((role, i) => (
          <div key={role} className="px-1 text-center">
            <p className="text-foreground text-[0.6875rem] font-semibold sm:text-xs">
              {ROLE_LABELS[role]}
            </p>
            <p data-numeric className="text-muted-foreground text-[0.625rem]">
              n{i + 1}
            </p>
          </div>
        ))}
      </div>

      {categories.map((category) => (
        <section key={category}>
          <h2 className="text-muted-foreground mb-3 text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
            {CATEGORY_LABELS[category] ?? category}
          </h2>

          <ul className="space-y-2">
            {permissions
              .filter((p) => p.category === category)
              .map((permission) => {
                const states = ROLES_ASCENDING.map((role) =>
                  optimistic.has(`${role}:${permission.key}`),
                );
                // Position de la ligne de niveau : première bande accordée.
                const contourAt = states.indexOf(true);

                return (
                  <li
                    key={permission.key}
                    className="border-border grid grid-cols-4 items-center gap-1 border-b pb-2 sm:grid-cols-[minmax(0,1fr)_repeat(4,5rem)] sm:border-0 sm:pb-0"
                  >
                    <div className="col-span-4 min-w-0 sm:col-span-1">
                      <p className="text-foreground truncate text-sm">{permission.label}</p>
                      <p
                        data-numeric
                        className="text-muted-foreground truncate text-[0.6875rem]"
                      >
                        {permission.key}
                      </p>
                    </div>

                    {ROLES_ASCENDING.map((role, i) => {
                      const isGranted = states[i];
                      const isLocked = role === "super_admin" && LOCKED.has(permission.key);
                      const isContour = i === contourAt;

                      return (
                        <button
                          key={role}
                          type="button"
                          role="switch"
                          aria-checked={isGranted}
                          aria-label={`${permission.label} — ${ROLE_LABELS[role]}`}
                          disabled={isLocked}
                          onClick={() => toggle(role, permission.key, !isGranted)}
                          className={cn(
                            "relative flex h-11 items-center justify-center rounded-sm border transition-colors",
                            isGranted
                              ? "border-transparent"
                              : "border-border/60 hover:bg-accent/40",
                            isLocked && "cursor-not-allowed",
                          )}
                          style={
                            isGranted
                              ? {
                                  // La teinte monte avec l'altitude de la bande.
                                  backgroundColor: `color-mix(in oklab, var(--primary) ${18 + i * 16}%, transparent)`,
                                }
                              : undefined
                          }
                        >
                          {/* La ligne de niveau : frontière entre le refusé et l'accordé. */}
                          {isContour ? (
                            <span
                              aria-hidden
                              className="bg-primary absolute inset-y-0 left-0 w-[2px]"
                            />
                          ) : null}
                          {isLocked ? (
                            <Lock className="text-primary size-3.5" aria-hidden />
                          ) : null}
                        </button>
                      );
                    })}
                  </li>
                );
              })}
          </ul>
        </section>
      ))}

      <p className="text-muted-foreground text-xs leading-relaxed">
        <Lock className="mr-1 inline size-3" aria-hidden />
        Ces permissions ne peuvent pas être retirées au super-admin : les lui enlever
        condamnerait définitivement l&apos;administration des droits.
      </p>
    </div>
  );
}
