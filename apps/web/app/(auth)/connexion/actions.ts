"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: string | null };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const suite = String(formData.get("suite") ?? "/carte");

  if (!email || !password) {
    return { error: "Renseigne ton adresse et ton mot de passe." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // On ne distingue pas « compte inconnu » de « mot de passe faux » : cela révélerait quels
    // e-mails ont un compte.
    return { error: "Adresse ou mot de passe incorrect." };
  }

  revalidatePath("/", "layout");
  redirect(suite.startsWith("/") ? suite : "/carte");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/connexion");
}
