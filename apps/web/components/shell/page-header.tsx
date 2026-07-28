/**
 * En-tête d'écran de contenu.
 *
 * La « ligne d'édition » en chasse fixe porte de la vraie donnée — un décompte, un horodatage —
 * à la manière de la mention d'édition d'une carte topographique. Elle ne doit jamais servir à
 * afficher du texte décoratif : si on n'a rien de factuel à y mettre, on l'omet.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  edition,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  edition?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="border-border mb-6 border-b pb-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-muted-foreground text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="font-display text-foreground mt-1.5 text-2xl font-semibold tracking-tight sm:text-3xl">
            {title}
          </h1>
          {description ? (
            <p className="text-muted-foreground mt-2 max-w-prose text-sm leading-relaxed">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      {edition ? (
        <p data-numeric className="text-muted-foreground mt-3 text-xs">
          {edition}
        </p>
      ) : null}
    </header>
  );
}

/** Conteneur de page de contenu — lisible sur mobile d'abord, jamais étalé sur grand écran. */
export function PageContainer({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-5xl px-5 py-8 lg:px-8">{children}</div>;
}
