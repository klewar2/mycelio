/**
 * Traduit les exceptions levées par les gardes Postgres en messages lisibles.
 *
 * Ces gardes sont la vraie frontière de sécurité : le formulaire ne fait que refléter ce que la
 * base a refusé. Un message doit donc dire ce qui s'est passé ET quoi faire ensuite.
 */
const MESSAGES: Record<string, string> = {
  MYC_LAST_ADMIN:
    "Il doit rester au moins un administrateur actif. Nomme d'abord quelqu'un d'autre.",
  MYC_ADMIN_PROTECTED: "Seul un administrateur peut gérer un autre administrateur.",
  MYC_SELF_ROLE_CHANGE:
    "Tu ne peux pas modifier ton propre rôle. Demande à un autre administrateur.",
  MYC_SELF_ACTIVATION: "Tu ne peux pas modifier ta propre activation.",
  MYC_PERMISSION_LOCKED:
    "Cette permission est indispensable à l'administrateur : la retirer condamnerait l'administration des droits.",
  MYC_AUDIT_IMMUTABLE: "Le journal d'audit ne peut être ni modifié ni supprimé.",
  MYC_SETTING_RANGE: "La valeur est hors des bornes autorisées pour ce paramètre.",
  MYC_SETTING_TYPE: "La valeur n'est pas du type attendu pour ce paramètre.",
  MYC_SETTING_ENUM: "Cette valeur ne fait pas partie des choix autorisés.",
  MYC_SETTING_SHAPE_LOCKED: "Seule la valeur d'un paramètre est modifiable.",
};

export function humanizeDbError(message: string | undefined | null): string {
  if (!message) return "L'opération a échoué.";

  for (const [code, text] of Object.entries(MESSAGES)) {
    if (message.includes(code)) return text;
  }

  // Une politique RLS qui refuse une insertion. L'utilisateur n'a pas le droit, point.
  if (message.includes("row-level security") || message.includes("permission denied")) {
    return "Tu n'as pas le droit d'effectuer cette action.";
  }

  return message;
}
