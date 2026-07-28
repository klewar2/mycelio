import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Client `service_role`.
 *
 * ┌───────────────────────────────────────────────────────────────────────────────────────────┐
 * │ RÈGLE DURE : ce client ne sert QU'AUX OPÉRATIONS auth.admin.*.                            │
 * │ Il ne doit JAMAIS écrire dans une table de `public`.                                      │
 * └───────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * `service_role` n'a pas d'auth.uid(). Les gardes qui protègent les rôles — « un admin ne peut
 * pas nommer un super_admin », « personne ne modifie son propre rôle » — sont relatives à
 * l'acteur et se retrouvent donc silencieusement désarmées sur ce chemin.
 *
 * La base applique déjà cette règle : `service_role` n'a aucun privilège DML sur `public`, une
 * tentative d'écriture échouera. Ce commentaire explique pourquoi, pour que personne ne
 * « corrige » ce refus en ajoutant un GRANT.
 */
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
