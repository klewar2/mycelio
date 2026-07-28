import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

/**
 * Client porteur de la session de l'utilisateur. C'est celui qu'il faut utiliser pour TOUTE
 * écriture métier : la RLS et les triggers voient alors le vrai acteur, et les gardes
 * d'invariants s'appliquent.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Écriture de cookie depuis un Server Component : le rafraîchissement de session
            // est assuré par proxy.ts, on peut ignorer.
          }
        },
      },
    },
  );
}
