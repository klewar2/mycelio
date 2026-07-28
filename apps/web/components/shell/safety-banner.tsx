import { TriangleAlert } from "lucide-react";

/**
 * Bandeau de sécurité alimentaire, permanent et non refermable.
 *
 * Exigence non négociable du cahier des charges : l'application indique des zones favorables,
 * jamais l'identité ni la comestibilité d'un champignon. La confusion entre un cèpe et une
 * amanite phalloïde tue.
 *
 * Ne pas ajouter de bouton de fermeture, ni de logique de « déjà vu ».
 */
export function SafetyBanner() {
  return (
    <aside
      role="note"
      className="surface-float flex items-start gap-3 px-4 py-3"
      style={{ borderColor: "var(--warn-solid)" }}
    >
      <TriangleAlert
        className="mt-0.5 size-4 shrink-0"
        style={{ color: "var(--warn-solid)" }}
        aria-hidden
      />
      <p className="text-foreground text-xs leading-relaxed">
        Mycélio indique des zones favorables, <strong className="font-semibold">jamais</strong>{" "}
        l&apos;identité ni la comestibilité d&apos;un champignon. Fais valider toute récolte par un
        pharmacien ou une société mycologique.
      </p>
    </aside>
  );
}
