/**
 * Emplacement de la carte, plein cadre.
 *
 * La carte EST l'application : elle occupe tout le viewport, en position fixe, et tout le reste
 * flotte au-dessus. Rien ne la rogne — ni en-tête, ni barre latérale.
 *
 * En phase 1 elle n'affiche aucune donnée géographique : il n'y a pas encore de table `cells`.
 * Ce fond de courbes de niveau tient la place et fixe la mise en page, pour que la phase 3
 * n'ait qu'à y brancher MapLibre.
 */
export function MapCanvas() {
  return (
    <div
      aria-hidden
      className="bg-background fixed inset-0 -z-10 overflow-hidden lg:left-16"
      style={{
        backgroundImage: [
          "repeating-radial-gradient(ellipse 38% 26% at 22% 30%, transparent 0 26px, var(--contour) 26px 27px)",
          "repeating-radial-gradient(ellipse 30% 44% at 78% 62%, transparent 0 30px, var(--contour) 30px 31px)",
          "repeating-radial-gradient(ellipse 52% 30% at 48% 88%, transparent 0 34px, var(--contour) 34px 35px)",
        ].join(","),
        opacity: 0.14,
      }}
    />
  );
}
