import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion — Mycélio" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ suite?: string }>;
}) {
  const { suite } = await searchParams;

  return (
    <main className="topo-texture flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <p className="text-muted-foreground text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
            Haute-Garonne · Tarn · Aude
          </p>
          <h1 className="font-display text-foreground mt-2 text-4xl font-semibold tracking-tight">
            Mycélio
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Lecture du terrain et probabilité de poussée.
          </p>
        </div>

        <LoginForm suite={suite ?? "/carte"} />

        <p className="text-muted-foreground mt-8 text-xs leading-relaxed">
          L&apos;accès se fait sur compte créé par un administrateur. Il n&apos;y a pas
          d&apos;inscription.
        </p>
      </div>
    </main>
  );
}
