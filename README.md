# Mycélio

Aide privée à la cueillette de champignons sur la **Haute-Garonne, le Tarn et l'Aude**. Croise
des données ouvertes géographiques et météo pour produire une carte de probabilité de poussée
par maille hexagonale, et une lecture du terrain au point pointé.

> Mycélio indique des zones favorables, **jamais** l'identité ni la comestibilité d'un
> champignon. Aucune fonctionnalité d'identification n'existe, et il n'en existera pas.

Usage strictement non commercial et privé.

## État : phase 1

Le socle est en place — authentification, RBAC paramétrable, écrans d'administration, coquille
d'application. La carte, le pipeline géospatial et le moteur de scoring viennent ensuite.

| Phase | Contenu | État |
|---|---|:-:|
| 1 | Next.js + Supabase, auth, RBAC, écrans admin | ✅ |
| 2 | Pipeline Python, table `cells` | ✅ 31, 81, 11 |
| 3 | Carte MapLibre, fonds IGN, hexagones | ✅ |
| 4 | Scoring par règles, cron quotidien | à faire |
| 5 | Panneau d'inspection, conseils terrain | à faire |
| 6 | Carnet de sorties, export GPX | à faire |
| 7 | LightGBM, validation spatiale | à faire |

## Démarrer

Prérequis : Node 24, pnpm, et **Docker en marche** — le CLI Supabase lance toute la stack
(Postgres, Auth, PostgREST, Studio) dans des conteneurs.

```bash
pnpm install
pnpm db:start          # affiche les URL et les clés locales
cp apps/web/.env.example apps/web/.env.local   # puis y coller les clés affichées
pnpm db:reset          # migrations + seed
pnpm dev               # http://localhost:3000
```

### Créer le premier compte

Il n'y a **aucune inscription** : `enable_signup = false`, et il n'existe pas de page
d'inscription. Les comptes sont créés par un administrateur depuis `/admin/comptes`.

Le tout premier compte se crée donc hors application, depuis Supabase Studio
(<http://127.0.0.1:54323>, section Authentication) ou en ligne de commande. Un trigger en fait
automatiquement le `super_admin` — mais uniquement parce que la table des profils est vide.

## Commandes

| Commande | Effet |
|---|---|
| `pnpm db:start` / `db:stop` | démarre ou arrête la stack Supabase locale |
| `pnpm db:reset` | rejoue toutes les migrations depuis zéro |
| `pnpm db:test` | tests pgTAP (invariants de rôles, RLS, audit) |
| `pnpm db:types` | régénère `apps/web/types/database.ts` |
| `pnpm dev` / `build` | application web |
| `pnpm typecheck` / `lint` / `test` | qualité |

Après toute migration touchant au schéma, relancer `pnpm db:types` : la CI compare le fichier
généré à celui du dépôt et échoue s'ils divergent.

## Pipeline géospatial

Hors ligne, jamais déployé. Il construit la table `cells` que l'application se contente de lire.

```bash
cd pipeline
uv sync
uv run python -m mycelio        # tous les départements de app_settings
uv run python -m mycelio 31     # un seul
```

Compter une dizaine de minutes au premier passage (36 Mo de MNT, 196 000 chemins récupérés en
WFS), une minute ensuite : tout est mis en cache dans `pipeline/data/`, hors du dépôt.

État actuel : **13 092 mailles** sur les trois départements (31 : 3 177, 81 : 4 256,
11 : 5 659). Les mailles sous 20 % de couvert boisé sont écartées : sans hôte mycorhizien, leur
score est structurellement nul. Étendre l'emprise demande d'ajouter les millésimes IGN du
département dans `VINTAGES` (`pipeline/mycelio/__main__.py`).

### Un écart au cahier des charges, assumé

**BD ALTI 25 m au lieu du RGE ALTI 5 m.** Sur des mailles de 740 m, le 5 m est du détail qu'on
moyenne de toute façon, et il produit des dérivées nettement plus bruitées : pente et courbure
amplifient le bruit du MNT. Le 25 m donne un terrain mieux tenu pour un centième du volume.

## Ce qu'il faut savoir avant de toucher au code

Quatre règles portent l'essentiel de la sécurité du projet. Les enfreindre ne casse aucun test
de compilation, mais ouvre des trous réels.

**1. Le code ne teste jamais un rôle, seulement une permission.** Il existe une seule fonction
`can()`, en SQL comme en TypeScript, et les deux lisent la même table `role_permissions`.
Écrire `if (role === 'admin')` viderait de son sens la matrice éditable de `/admin/droits`.

**2. Le client `service_role` ne sert qu'aux opérations `auth.admin.*`.** Il n'a pas
d'`auth.uid()`, donc les gardes qui protègent les rôles y sont désarmées. La base applique
elle-même cette règle : `service_role` n'a aucun privilège d'écriture sur `public`. Si une
écriture échoue de ce côté, la réponse n'est pas d'ajouter un `GRANT`.

**3. Le rôle d'un compte n'est jamais lu depuis ses métadonnées.** Tout compte naît `viewer`
(sauf le premier). Le rôle est ensuite posé par une mise à jour distincte, avec la session de
l'administrateur, qui traverse donc les gardes sous une vraie identité.

**4. `proxy.ts` n'est pas une frontière de sécurité.** Il rafraîchit la session et refoule les
visiteurs anonymes, rien de plus. L'autorisation réelle vit dans `requirePermission()` et, en
dernier ressort, dans la RLS.

Le reste des pièges est documenté à l'endroit du code concerné.

## Architecture

```
apps/web/          Next.js 16, App Router, Tailwind v4, shadcn/ui
  lib/auth/        can(), session, gardes de route
  lib/supabase/    clients navigateur, serveur, admin
supabase/
  migrations/      schéma, fonctions, triggers, RLS, seed
  tests/           pgTAP
pipeline/          Python, phase 2 — jamais déployé
```

Aucun calcul géospatial ne doit apparaître dans `apps/web` : tout est précalculé hors ligne par
le pipeline. Un `import` de `rasterio` ou de `shapely` côté web serait une erreur
d'architecture.

## Données

Toutes les sources sont ouvertes, avec licence vérifiée : IGN BD Forêt, RGE ALTI et BD TOPO
(Etalab 2.0), SoilGrids et Open-Meteo (CC-BY 4.0), GBIF, OpenStreetMap (ODbL). Leur attribution
est une obligation de licence : elle sera affichée dès que la carte affichera leurs données.
