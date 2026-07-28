import { redirect } from "next/navigation";
import { can } from "@/lib/auth/can";
import { requirePermission } from "@/lib/auth/session";

export default async function AdminIndex() {
  const ctx = await requirePermission("admin.access");
  // On envoie vers la première section réellement accessible, plutôt que d'afficher un écran
  // d'accueil vide ou une section interdite.
  if (can(ctx, "admin.users.manage")) redirect("/admin/comptes");
  if (can(ctx, "admin.settings.manage")) redirect("/admin/parametres");
  redirect("/carte");
}
