import { TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

/**
 * Bandeau de sécurité alimentaire, permanent et non refermable.
 *
 * Exigence non négociable du cahier des charges : l'application indique des zones favorables,
 * jamais l'identité ni la comestibilité d'un champignon. La confusion entre un cèpe et une
 * amanite phalloïde tue.
 *
 * Ne pas ajouter de bouton de fermeture, ni de logique de « déjà vu ». Le repli n'expose que
 * les compléments — le message principal reste visible en permanence.
 */
export async function SafetyBanner() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .eq("category", "securite");

  const get = (key: string) =>
    (data?.find((r) => r.key === key)?.value as string | undefined) ?? null;

  const poison = get("safety.poison_centre");
  const local = get("safety.local_warning");
  const legal = get("safety.legal_notice");

  return (
    <aside
      role="note"
      className="surface-float px-4 py-3"
      style={{ borderColor: "var(--warn-solid)" }}
    >
      <div className="flex items-start gap-3">
        <TriangleAlert
          className="mt-0.5 size-4 shrink-0"
          style={{ color: "var(--warn-solid)" }}
          aria-hidden
        />
        <p className="text-foreground text-xs leading-relaxed">
          Mycélio indique des zones favorables, <strong className="font-semibold">jamais</strong>{" "}
          l&apos;identité ni la comestibilité d&apos;un champignon. Fais valider toute récolte par
          un pharmacien ou une société mycologique.
        </p>
      </div>

      <details className="mt-2">
        <summary className="text-muted-foreground hover:text-foreground ml-7 cursor-pointer text-[0.6875rem]">
          Précautions et rappels
        </summary>
        <div className="text-muted-foreground mt-2 ml-7 space-y-2 text-[0.6875rem] leading-relaxed">
          {local ? <p style={{ color: "var(--destructive)" }}>{local}</p> : null}
          <p>
            Les morilles et les bolets ne se consomment <strong>jamais crus</strong>, ni même
            insuffisamment cuits.
          </p>
          {legal ? <p>{legal}</p> : null}
          {poison ? (
            <p data-numeric className="text-foreground">
              {poison}
            </p>
          ) : null}
        </div>
      </details>
    </aside>
  );
}
