import { describe, expect, it } from "vitest";
import { snapBounds } from "./hexagons";

/**
 * `snapBounds` porte à elle seule la fluidité du déplacement : tant que la carte reste dans la
 * même case, l'URL ne change pas et le cache du navigateur répond sans réseau. Deux propriétés
 * la rendent utile, et elles se contredisent — d'où ces tests.
 *
 * 1. Elle ne doit RIEN perdre. Une emprise arrondie plus petite que l'écran laisserait des
 *    mailles non chargées en bord de vue, ce qui est le mode de défaillance que ce projet
 *    refuse : une carte incomplète laisse croire qu'il n'y a rien à chercher là où on n'a pas
 *    regardé.
 * 2. Elle doit être STABLE. Si un panoramique de quelques pixels change encore le résultat, on
 *    a ajouté de la complexité sans rien gagner.
 */
describe("snapBounds", () => {
  // Emprise proche de la vue par défaut : trois départements, autour de Toulouse.
  const view = [1.0, 43.0, 2.4, 44.0] as const;

  it("contient toujours l'emprise demandée", () => {
    const [w, s, e, n] = snapBounds(...view);
    expect(w).toBeLessThanOrEqual(view[0]);
    expect(s).toBeLessThanOrEqual(view[1]);
    expect(e).toBeGreaterThanOrEqual(view[2]);
    expect(n).toBeGreaterThanOrEqual(view[3]);
  });

  it("garde une marge hors écran de chaque côté", () => {
    const [w, s, e, n] = snapBounds(...view);
    // La marge sert à ce que le déplacement suivant trouve déjà ses mailles chargées.
    expect(view[0] - w).toBeGreaterThan(0);
    expect(view[1] - s).toBeGreaterThan(0);
    expect(e - view[2]).toBeGreaterThan(0);
    expect(n - view[3]).toBeGreaterThan(0);
  });

  it("rend la même emprise après un petit panoramique", () => {
    // Un glissement de l'ordre de 1 % de la largeur visible : c'est le geste courant, et c'est
    // lui qui provoquait un rechargement complet avant l'arrondi.
    const before = snapBounds(...view);
    const after = snapBounds(view[0] + 0.01, view[1] + 0.01, view[2] + 0.01, view[3] + 0.01);
    expect(after).toEqual(before);
  });

  it("finit par changer d'emprise quand on s'éloigne vraiment", () => {
    // Sans quoi l'arrondi ne serait plus un cache mais un plafond : on regarderait ailleurs et
    // la carte montrerait encore l'ancien secteur.
    const before = snapBounds(...view);
    const after = snapBounds(view[0] + 1, view[1] + 1, view[2] + 1, view[3] + 1);
    expect(after).not.toEqual(before);
  });

  it("ne produit aucune décimale parasite", () => {
    // `Math.floor(x / step) * step` rend 1.2000000000000002 dès que le pas n'est pas
    // représentable en binaire, et cette décimale suffit à créer une URL différente à chaque
    // appel — donc à annuler tout le bénéfice sans que rien ne le signale.
    for (const value of snapBounds(1.234567, 43.234567, 2.345678, 44.345678)) {
      expect(String(value)).not.toMatch(/\d{9,}/);
    }
  });

  it("reste correcte sur une emprise minuscule", () => {
    // Zoom maximal : la largeur visible tombe sous le millième de degré, et le pas avec elle.
    const tiny = [1.4001, 43.6001, 1.4003, 43.6003] as const;
    const [w, s, e, n] = snapBounds(...tiny);
    expect(w).toBeLessThanOrEqual(tiny[0]);
    expect(s).toBeLessThanOrEqual(tiny[1]);
    expect(e).toBeGreaterThanOrEqual(tiny[2]);
    expect(n).toBeGreaterThanOrEqual(tiny[3]);
  });
});
