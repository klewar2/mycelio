/**
 * Lecture complète d'une RPC, quel que soit le plafond de lignes de PostgREST.
 *
 * PostgREST tronque toute réponse à `max_rows` — 1000 par défaut — **sans erreur ni en-tête
 * d'avertissement exploitable**. Un appel qui devait rendre 1594 mailles en rend 1000, la carte
 * s'affiche, et rien ne signale qu'un tiers du territoire a disparu. C'est le pire mode de
 * défaillance possible : une carte incomplète est plus trompeuse qu'une carte absente, parce
 * qu'elle donne à croire qu'il n'y a rien à chercher là où on n'a simplement pas regardé.
 *
 * Le plafond se relève dans les réglages du projet, mais c'est un réglage de tableau de bord,
 * invisible depuis le dépôt, oublié à la première migration vers un nouveau projet — ce qui est
 * précisément arrivé au premier déploiement. On ne veut donc pas en dépendre : on pagine.
 *
 * Le coût est nul dans le cas courant. Tant qu'une page revient incomplète, c'est qu'on a tout
 * lu et l'on s'arrête : une fenêtre de carte ordinaire ne fait qu'un aller-retour.
 */

const PAGE_SIZE = 1000;

// Garde-fou : une fenêtre de carte plausible tient largement dedans, et une boucle infinie sur
// une RPC non déterministe coûterait bien plus cher qu'un résultat tronqué signalé.
const MAX_PAGES = 40;

type RpcCaller = (range: { from: number; to: number }) => PromiseLike<{
  data: unknown[] | null;
  error: { message: string } | null;
}>;

export async function fetchAllRows<T>(
  call: RpcCaller,
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await call({ from, to: from + PAGE_SIZE - 1 });

    if (error) return { rows, error: error.message };

    const batch = (data ?? []) as T[];
    rows.push(...batch);

    // Une page incomplète est la seule preuve fiable d'avoir atteint la fin : PostgREST ne
    // distingue pas « il n'y avait que ça » de « j'ai coupé ici ».
    if (batch.length < PAGE_SIZE) return { rows, error: null };
  }

  return {
    rows,
    error: `Fenêtre trop vaste : plus de ${MAX_PAGES * PAGE_SIZE} mailles.`,
  };
}
