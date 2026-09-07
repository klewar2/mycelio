import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Rafraîchit le cookie de session et refoule les visiteurs sans session. Il ne fait que ça.
 *
 * CE N'EST PAS UNE FRONTIÈRE DE SÉCURITÉ. La documentation de Next le dit explicitement, et la
 * CVE-2025-29927 l'a rappelé au monde entier : un proxy peut être contourné. L'autorisation
 * réelle vit dans les pages et les actions serveur (requirePermission) et, en dernier ressort,
 * dans la RLS — qui, elle, ne se contourne pas.
 *
 * En Next 16, `middleware.ts` s'appelle `proxy.ts`. Le comportement est inchangé.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = pathname === "/connexion" || pathname.startsWith("/auth");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    url.searchParams.set("suite", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/connexion") {
    const url = request.nextUrl.clone();
    url.pathname = "/carte";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

/**
 * `api` est exclu, et c'est un gain de performance, pas un relâchement.
 *
 * Le proxy ne sait faire qu'une chose pour une route d'API : appeler `auth.getUser()` puis
 * renvoyer un 307 vers /connexion, ce dont aucun `fetch()` ne saurait quoi faire. Les routes
 * appellent toutes `requirePermission()`, qui refait exactement le même contrôle — donc on
 * payait un aller-retour complet vers le serveur Auth pour rien, avant chaque appel de carte.
 *
 * Rien n'est perdu côté sécurité : le proxy n'a jamais été la frontière (voir plus haut), et
 * `auth.getUser()` appelé dans la route rafraîchit le jeton aussi bien qu'ici — un Route Handler
 * a le droit d'écrire des cookies, contrairement à un Server Component.
 */
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
