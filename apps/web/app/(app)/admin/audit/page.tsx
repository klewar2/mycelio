import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Audit — Mycélio" };

export default async function AuditPage() {
  await requirePermission("admin.audit.view");

  const supabase = await createClient();
  const [{ data: entries }, { data: profiles }] = await Promise.all([
    supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(200),
    supabase.from("profiles").select("id, display_name"),
  ]);

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
  const rows = entries ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Audit"
        description="Écrit par trigger, jamais par l'application. Ni modifiable, ni supprimable — pas même par le cron."
        edition={`${rows.length} entrées les plus récentes`}
      />

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Aucune entrée pour l&apos;instant. Le journal se remplira dès la première modification
          de compte, de droit ou de paramètre.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((entry) => (
            <li key={entry.id} className="surface-float p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p data-numeric className="text-foreground text-sm font-medium">
                  {entry.action}
                </p>
                <p data-numeric className="text-muted-foreground text-xs">
                  {new Date(entry.created_at).toLocaleString("fr-FR")}
                </p>
              </div>

              <p className="text-muted-foreground mt-1 text-xs">
                {entry.actor_id
                  ? (nameById.get(entry.actor_id) ?? "compte supprimé")
                  : "système (migration ou cron)"}
                {entry.target ? (
                  <>
                    {" · cible "}
                    <span data-numeric>{entry.target}</span>
                  </>
                ) : null}
              </p>

              {entry.payload ? (
                <details className="mt-2">
                  <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs">
                    Détail
                  </summary>
                  <pre
                    data-numeric
                    className="bg-muted mt-2 max-h-64 overflow-auto rounded-md p-3 text-[0.6875rem] leading-relaxed"
                  >
                    {JSON.stringify(entry.payload, null, 2)}
                  </pre>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
