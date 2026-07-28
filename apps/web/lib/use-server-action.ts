"use client";

import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";

export type ActionResult = { error: string | null; success: string | null };

const EMPTY: ActionResult = { error: null, success: null };

/**
 * Appelle une action serveur et traite son résultat sur place.
 *
 * On évite volontairement le couple `useActionState` + `useEffect` : notifier depuis un effet
 * revient à faire un setState synchrone dans un effet, ce qui déclenche des rendus en cascade
 * (et que la règle react-hooks/set-state-in-effect refuse, à raison). Ici le résultat est traité
 * dans la continuation de l'appel, là où il arrive.
 */
export function useServerAction(
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>,
  options: { onSuccess?: () => void; silent?: boolean } = {},
) {
  const [state, setState] = useState<ActionResult>(EMPTY);
  const [pending, startTransition] = useTransition();
  const { onSuccess, silent } = options;

  const run = useCallback(
    (formData: FormData) => {
      startTransition(async () => {
        const result = await action(EMPTY, formData);
        setState(result);
        if (result.error && !silent) toast.error(result.error);
        if (result.success) {
          if (!silent) toast.success(result.success);
          onSuccess?.();
        }
      });
    },
    [action, onSuccess, silent],
  );

  return { state, pending, run };
}
