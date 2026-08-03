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
 *
 * En revanche il a été RACCOURCI, et c'est un gain de sécurité, pas une concession : quatre
 * lignes permanentes en tête de carte deviennent du mobilier qu'on ne lit plus, et elles
 * mangeaient un tiers de l'écran d'un téléphone. Deux phrases directes, dont la seule qui
 * appelle une action — faire valider la récolte —, ont plus de chances d'être lues. La nuance
 * « zones favorables, jamais l'identité » descend d'un cran, dans les précautions.
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
          Mycélio ne dit <strong className="font-semibold">jamais</strong> si un champignon se
          mange. Fais valider toute récolte par un pharmacien ou une société mycologique.
        </p>
      </div>

      <details className="mt-2">
        <summary className="text-muted-foreground hover:text-foreground ml-7 cursor-pointer text-[0.6875rem]">
          Précautions et rappels
        </summary>
        <div className="text-muted-foreground mt-2 ml-7 space-y-2 text-[0.6875rem] leading-relaxed">
          <p>
            L&apos;application indique des zones favorables, jamais l&apos;identité d&apos;un
            champignon. Aucune reconnaissance par photo n&apos;existe ici, et il n&apos;en
            existera pas : la confusion entre un cèpe et une amanite phalloïde tue.
          </p>
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
