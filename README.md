# Mycélio

Aide privée à la cueillette de champignons sur la **Haute-Garonne (31), le Tarn (81) et l'Aude
(11)**. Croise des données ouvertes géographiques et météo pour produire une carte de probabilité
de poussée par maille hexagonale, et une lecture du terrain au point pointé.

> Mycélio indique des zones favorables, **jamais** l'identité ni la comestibilité d'un
> champignon. Aucune fonctionnalité d'identification n'existe, et il n'en existera pas. Voir
> [Sécurité alimentaire](#sécurité-alimentaire).

Usage strictement non commercial et privé. C'est ce qui rend licites le palier Vercel Hobby et
le filtrage GBIF en CC-BY-NC.

---

## État

| Phase | Contenu | État |
|---|---|:-:|
| 1 | Next.js + Supabase, auth, RBAC, écrans admin | ✅ |
| 2 | Pipeline Python, table `cells` | ✅ 31, 81, 11 |
| 3 | Carte MapLibre, fonds IGN, hexagones | ✅ |
| 4 | Scoring par règles, cron quotidien | ✅ |
| 5 | Panneau d'inspection, conseils terrain | ✅ |
| 6 | Carnet de sorties, export GPX | ✅ |
| 6 bis | Lecture grand public : familles, échelle en toutes lettres, barre de semaine | ✅ |
| 7 | LightGBM, validation spatiale | après une saison de terrain |

**Chiffres actuels** — 86 137 mailles H3 en résolution 9 (~280 m de largeur), 8 espèces
regroupées en 6 familles, 689 096 scores sur 8 jours, base à 172 Mo. La vue dézoomée ne lit pas
ces 689 096 lignes : elle lit `forecast_r7`, leur agrégat par parent en résolution 7, soit
30 688 lignes reconstruites à chaque écriture de `forecast` par un déclencheur.

---

## Démarrer

Prérequis : Node 24, pnpm, `uv`, et **Docker en marche** — le CLI Supabase lance toute la stack
(Postgres 17 + PostGIS, Auth, PostgREST, Studio) dans des conteneurs.

La version exacte est fixée dans `.node-version` — c'est aussi ce que lit la CI. Avec `fnm` (ou
`nvm`, `asdf`, `volta`), `fnm use` à la racine du dépôt suffit ; `fnm env --use-on-cd` le fait
automatiquement à chaque `cd`.

```bash
fnm use                                         # ou: fnm install (si la version manque)
pnpm install
pnpm db:start                                   # affiche les URL et clés locales
cp apps/web/.env.example apps/web/.env.local    # y coller les clés affichées
pnpm db:reset                                   # migrations + seed
pnpm dev                                        # http://localhost:3000
```

Puis le pipeline, qui remplit la carte :

```bash
cd pipeline
uv sync
uv run python -m mycelio          # les trois départements
uv run python -m mycelio.score    # les scores de poussée
```

Compter une quinzaine de minutes au premier passage, quelques minutes ensuite — tout est mis en
cache dans `pipeline/data/`, hors du dépôt.

### Créer le premier compte

Il n'y a **aucune inscription** : `enable_signup = false`, et il n'existe pas de page
d'inscription. Les comptes sont créés depuis `/admin/comptes`.

Le tout premier se crée donc hors application, depuis Supabase Studio
(<http://127.0.0.1:54323>, section Authentication). Un trigger en fait automatiquement un
`admin` — mais uniquement parce que la table des profils est vide.

> `pnpm db:reset` efface tous les comptes. Il faut recréer le premier après chaque reset.

### Commandes

| Commande | Effet |
|---|---|
| `pnpm db:start` / `db:stop` | démarre ou arrête la stack Supabase locale |
| `pnpm db:reset` | rejoue toutes les migrations depuis zéro |
| `pnpm db:test` | tests pgTAP (rôles, RLS, audit, confidentialité) |
| `pnpm db:types` | régénère `apps/web/types/database.ts` |
| `pnpm dev` / `build` | application web |
| `pnpm typecheck` / `lint` / `test` | qualité |
| `uv run python -m mycelio [dept…]` | construit la grille et ses attributs |
| `uv run python -m mycelio.score` | recalcule les scores |

Après toute migration touchant au schéma, relancer `pnpm db:types` : la CI compare le fichier
généré à celui du dépôt et échoue s'ils divergent.

---

## Architecture

```
mycelio/
├── apps/web/                    Next.js 16, App Router, React 19
│   ├── app/
│   │   ├── (auth)/connexion     e-mail + mot de passe, pas d'inscription
│   │   ├── (app)/carte          carte plein cadre — l'écran principal
│   │   ├── (app)/journal        carnet de sorties
│   │   ├── (app)/reglages       profil, mot de passe
│   │   ├── (app)/admin/         comptes, droits, paramètres, espèces, audit
│   │   └── api/                 map, cell/[h3], weather, outings/gpx
│   ├── components/
│   │   ├── map/                 MapLibre, panneau de lecture, inspection, carotte de terrain
│   │   ├── admin/               matrice de droits, formulaire générique
│   │   └── shell/               navigation, thème, bandeau de sécurité
│   ├── lib/
│   │   ├── auth/                can(), session, gardes de route
│   │   ├── map/                 fonds IGN, hexagones, familles d'espèces
│   │   ├── scoring/             paliers nommés — la seule échelle vue par l'utilisateur
│   │   ├── supabase/            clients navigateur, serveur, admin
│   │   └── terrain/             règles de conseil de terrain
│   ├── proxy.ts                 rafraîchissement de session (ex-middleware)
│   └── vercel.json              région des fonctions — cdg1, comme la base
├── pipeline/                    Python 3.12, hors ligne, jamais déployé
│   └── mycelio/
│       ├── grid.py              maillage H3
│       ├── forest.py            BD Forêt → essence, part boisée, lisière
│       ├── terrain.py           MNT → pente, exposition, TPI, TWI, courbure
│       ├── soil.py              SoilGrids → pH, argile, carbone
│       ├── hydro.py             BD TOPO → distances eau et chemins
│       ├── protected.py         espaces protégés → masquage réglementaire
│       ├── weather.py           Open-Meteo → pluie, sol, amplitude
│       ├── scoring.py           moteur de règles expertes
│       └── upload.py            chargement par COPY
├── supabase/
│   ├── migrations/              schéma, fonctions, triggers, RLS, seeds
│   └── tests/                   pgTAP
└── .github/workflows/           CI, scoring quotidien, migrations en production
```

Aucun calcul géospatial ne doit apparaître dans `apps/web` : tout est précalculé hors ligne. Un
`import` de `rasterio` ou de `shapely` côté web serait une erreur d'architecture.

### Rôles et droits

Trois rôles, et un seul écran pour les composer.

| Rôle | Ce qu'il fait |
|---|---|
| `lecture` | consulte la carte |
| `ecriture` | + tient son carnet de sorties, exporte ses traces GPX |
| `admin` | + comptes, droits, paramètres, espèces, journal d'audit |

Ce tableau n'est qu'un **défaut** : la répartition réelle vit dans la table `role_permissions`,
éditable depuis `/admin/droits`, et c'est elle que lisent `public.can()` en SQL et `can()` en
TypeScript. Le code ne connaît pas ces trois noms — il ne connaît que des clés de permission.
C'est ce qui a permis de passer de quatre rôles à trois sans réécrire une seule politique RLS.

Deux invariants sont tenus par des triggers, pas par l'application :

- **Il reste toujours au moins un administrateur actif** (`MYC_LAST_ADMIN`). La garde couvre la
  suppression, la rétrogradation et la désactivation, et n'a aucune échappatoire : elle
  s'applique aussi à `service_role` et au tableau de bord Supabase. Supprimer le compte Auth
  échoue également, par cascade.
- **Quatre permissions ne peuvent pas être retirées à l'administrateur** (`MYC_PERMISSION_LOCKED`)
  — sans quoi la matrice permettrait de condamner définitivement l'administration des droits.

### Pile technique

| Couche | Choix | Pourquoi |
|---|---|---|
| Framework | Next.js 16, React 19, TypeScript strict | Server Components pour l'admin, route handlers pour l'API |
| UI | Tailwind v4 (CSS-first, pas de `tailwind.config.js`), shadcn/ui | thème piloté par variables CSS |
| Carte | MapLibre GL **5.24** + react-map-gl 8 | licence BSD, aucun jeton, aucun quota |
| Hexagones | h3-js côté client | on transporte des index, le navigateur reconstruit les polygones |
| Base | Supabase — Postgres 17, PostGIS, Auth, RLS | palier gratuit : 500 Mo, 50 000 MAU |
| Pipeline | Python 3.12 + uv | geopandas, rasterio, pysheds, h3, psycopg |
| Cron | GitHub Actions, 5 h UTC | son écriture quotidienne empêche la mise en veille de Supabase |
| Migrations | GitHub Actions, après la CI | le schéma suit le code sans geste manuel — voir le point 13 |

> **Les fonctions Vercel doivent tourner à Paris.** Elles tournaient à `iad1` (Washington) alors
> que Supabase est à `eu-west-3` (Paris) : chaque appel de carte traversait l'Atlantique six fois
> — proxy, `getUser`, profil, permissions, puis deux pages de PostgREST. `apps/web/vercel.json`
> fixe `cdg1`. Le réglage se vérifie aussi dans le tableau de bord, Settings → Functions.

> **MapLibre reste bloqué en 5.x.** `@vis.gl/react-maplibre` 8.1.1 lit `map.transform`, propriété
> supprimée en MapLibre 6, mais déclare un pair permissif `>=4.0.0` : pnpm installe la 6 sans
> avertissement, et la carte s'affiche puis refuse tout déplacement. À vérifier avant toute mise
> à jour.

---

## Modèles et sources de données

### Sources géographiques et météo

Toutes ouvertes, licences vérifiées. L'attribution est une obligation de licence, pas une
décoration : elle est affichée sur la carte et listée dans `/admin/donnees`.

| Source | Usage | Accès | Licence |
|---|---|---|---|
| **IGN BD Forêt V2** | essence dominante, part boisée, lisières | téléchargement départemental `.7z` | Etalab 2.0 |
| **IGN BD ALTI V2 25 m** | altitude, pente, exposition, TWI, TPI, courbure | téléchargement départemental `.7z` | Etalab 2.0 |
| **IGN BD TOPO V3** | cours d'eau, chemins, espaces protégés | WFS `data.geopf.fr`, paginé | Etalab 2.0 |
| **Fonds IGN WMTS** | Plan IGN v2, photo aérienne | `data.geopf.fr/wmts`, sans clé depuis 2021 | Etalab 2.0 |
| **SoilGrids (ISRIC)** | pH, argile, carbone organique, horizon 5–15 cm | WCS, projection Homolosine | CC-BY 4.0 |
| **Open-Meteo** | pluie, humidité du sol 7–28 cm, amplitude thermique | API sans clé | CC-BY 4.0 |
| **geo.api.gouv.fr** | contours communaux, fusionnés en départements | API | Etalab 2.0 |

Points d'attention accumulés sur ces sources, tous documentés dans le code concerné :

- La **BD Forêt V2** n'apparaît qu'au-delà de la huitième page du flux de téléchargement IGN. La
  recherche initiale n'avait trouvé que la V1 — inventaire de 1996, sans châtaignier.
- Les shapefiles **V1 sont en Latin-1, les V2 en UTF-8**. Se tromper ne lève aucune erreur : on
  obtient des essences mal décodées qui ne correspondent plus à rien, donc des mailles sans hôte.
- La clé de cache des jeux IGN porte **version et millésime**, sinon un changement de version
  ressert silencieusement l'ancien fichier.
- **SoilGrids** code l'absence de sol par `0` autant que par des valeurs négatives. Ne filtrer
  que le négatif laisse passer des sols « à pH 0 ».
- **PostgREST plafonne** ses réponses ; le dépassement tronque sans erreur (`max_rows` relevé à
  6 000 dans `config.toml`).

### Modèle de scoring

Phase A du cahier des charges — **règles expertes, aucun apprentissage automatique pour
l'instant**. La phase 7 (LightGBM) attend une première saison de sorties enregistrées ; sans
absences réelles, un modèle appris n'apprendrait que où les gens se promènent.

```
score = habitat × phénologie × météo
```

Les trois facteurs sont dans [0, 1] et se multiplient : chacun peut annuler le score à lui seul.
Sans hôte mycorhizien compatible, il n'y a pas de cèpe, quelle que soit la météo.

- **habitat** — appariement hôte à trois niveaux, part boisée, cloche sur le pH, plateau
  d'altitude, indice d'humidité topographique, effet de lisière, exposition
- **phénologie** — fenêtre saisonnière circulaire, correction d'altitude (~7 jours par 100 m),
  cloche sur la température du sol
- **météo** — cloche sur la pluie cumulée décalée du délai propre à l'espèce, humidité de
  l'horizon 7–28 cm, amplitude thermique nocturne

**L'appariement d'hôte se fait à trois niveaux, pas deux.** La BD Forêt classe 34 951 mailles
en « Feuillus » sans résoudre l'essence, et ce jeton générique figure dans la liste d'hôtes des
trois cèpes, de la girolle, de la trompette et de la morille. Le compter comme un vrai chêne
rendait 86 % du territoire « compatible cèpes », et la carte annonçait « très bonnes chances »
sur 29,5 % des mailles — 2 000 km². Un hôte générique vaut donc `scoring.host_generic_weight`,
entre l'appariement plein et l'absence : c'est ce qu'on sait, ni plus ni moins. Avec la part
boisée, la lisière et l'exposition remises dans le calcul, les « très bonnes chances » sont
retombées à 3,4 %.

`pipeline/mycelio/scoring.py` ne contient **que des formes de courbes** : aucune constante
mycologique n'y est écrite. Le `slug == 'trompette-de-la-mort'` qui y traînait — la seule
entorse — est devenu la colonne `species.twi_optimum`, éditable comme le reste. Les huit espèces, leurs hôtes, pH, altitudes, fenêtres et délais
vivent dans la table `species`, éditable depuis `/admin/especes`. Les poids sont dans
`/admin/scoring`. C'est le levier de calibration après les premières sorties.

Contrôle de plausibilité, fin juillet : le cèpe d'été domine, la tête de nègre suit — c'est elle
qui démarre en août — et toutes les espèces d'automne sont à zéro.

### Du score à une phrase

Le score est un indice de faveur dans [0, 1], pas une probabilité calibrée. Affiché tel quel —
« 14 % » —, il ne se compare à rien pour qui n'a pas écrit le modèle, et se lit spontanément
comme « une chance sur sept », ce qui est faux. Toute l'interface passe donc par cinq paliers
nommés, définis une seule fois dans `apps/web/lib/scoring/levels.ts` :

| Score | Palier |
|---|---|
| < 0,02 | Très faibles chances |
| < 0,08 | Faibles chances |
| < 0,20 | Chances moyennes |
| < 0,40 | Bonnes chances |
| ≥ 0,40 | Très bonnes chances |

Les seuils viennent de la distribution réellement observée : médiane vers 0,03, centile 99 vers
0,23, maximum saisonnier vers 0,45 sur une espèce en pic. Ils se resserrent volontairement vers
le haut — un « très bon coin » doit rester rare, sans quoi le mot ne veut plus rien dire. C'est
le premier réglage à revoir après une saison, avec les poids de `/admin/scoring`.

Formulation en **chances** et non en probabilité : c'est vrai, et c'est ce que l'on dit à l'oral.

### Familles

Un débutant ne distingue pas un cèpe d'été d'un cèpe de Bordeaux, et n'a pas à le faire pour
décider où aller ce week-end. La carte se pilote donc par famille — six pour huit espèces, plus
une entrée « Tous » — et le score d'une famille est le **maximum** de ses espèces, jamais leur
moyenne : les trois cèpes se relaient dans la saison, et une moyenne noierait celui qui est en
pic sous deux qui sont à zéro.

Le regroupement vit dans `species.family`, éditable depuis `/admin/especes` : aucune
correspondance espèce → famille n'est écrite dans le code. Une espèce sans famille s'affiche
seule, sous son propre nom.

### Aucune API de modèle de langage

Le projet n'appelle **aucun LLM**, ni en production ni au build. Les conseils de terrain sont
produits par des règles déterministes en TypeScript (`lib/terrain/advice.ts`) : gratuit,
instantané, reproductible et débuggable — et surtout incapable d'inventer une affirmation sur la
comestibilité.

---

## Sécurité alimentaire

Règle absolue : **l'application ne détermine jamais une espèce et n'affirme jamais qu'un
champignon est comestible.** Aucune identification par photo, aucun classifieur d'image, même
« à titre indicatif ». La confusion entre un cèpe et une amanite phalloïde tue.

Ce qui est en place :

- **Bandeau permanent et non refermable** sur la carte, rendu côté serveur pour ne dépendre ni
  de MapLibre ni de JavaScript. Volontairement **court** — deux phrases, dont la seule qui
  appelle une action : faire valider la récolte. Quatre lignes permanentes en tête de carte
  deviennent du mobilier qu'on ne lit plus, et mangeaient un tiers de l'écran d'un téléphone.
  Le reste — « zones favorables, jamais l'identité », l'absence définitive d'identification par
  photo — est d'un cran en dessous, dans « Précautions et rappels ».
- **Confusions dangereuses par espèce**, affichées en rouge dans le panneau d'inspection.
- **Tricholome équestre** (bidaou) : interdit à la vente depuis 2005, point sensible localement.
- Rappel que **morilles et bolets ne se consomment jamais crus**, et numéro du centre antipoison
  régional.
- **Rappel légal** : les champignons appartiennent au propriétaire du terrain (art. 547 du Code
  civil), et ~75 % de la forêt française est privée.

### Masquage réglementaire

Les mailles intersectant une **réserve biologique intégrale** ou un **cœur de parc national**
sont **retirées**, pas signalées : elles n'apparaissent pas sur la carte et l'API refuse de les
inspecter, même en devinant leur index. Une application qui désigne un bon coin dans une réserve
reste une application qui envoie enfreindre la réglementation, bandeau ou pas.

Le filtre est posé dans les fonctions de requête en base, pas dans le composant de carte : c'est
le seul endroit qui garantit qu'aucun chemin d'accès ne les expose.

La liste des catégories masquées est dans `app_settings.pipeline.restricted_categories`. Elle
contient par défaut les deux que nomme le cahier des charges. La cueillette est aussi interdite
dans la plupart des **réserves naturelles nationales**, mais la réglementation y varie d'une
réserve à l'autre : les ajouter est une décision à prendre en connaissance de cause. Modifier
cette liste impose de rejouer le pipeline.

---

## Ce qu'il faut savoir avant de toucher au code

Ces règles portent l'essentiel de la sécurité et de la performance du projet. Les enfreindre ne
casse aucun test de compilation, mais ouvre des trous réels.

**1. Le code ne teste jamais un rôle, seulement une permission.** Une seule fonction `can()`, en
SQL comme en TypeScript, et les deux lisent la même table `role_permissions`. Écrire
`if (role === 'admin')` viderait de son sens la matrice éditable de `/admin/droits`.

**2. Toute fonction appelée dans une politique RLS s'enveloppe dans un sous-select.**
`(select public.can('x'))`, jamais `public.can('x')`. Même déclarée `STABLE`, Postgres la
réévalue à chaque ligne dans une politique : sur 86 000 mailles, une requête de 22 ms en prenait
près de 1 000.

**3. Le client `service_role` ne sert qu'aux opérations `auth.admin.*`.** Il n'a pas
d'`auth.uid()`, donc les gardes qui protègent les rôles y sont désarmées. La base applique
elle-même la règle : `service_role` n'a aucun privilège d'écriture sur `public`. Si une écriture
échoue de ce côté, la réponse n'est pas d'ajouter un `GRANT`.

**4. Le rôle d'un compte n'est jamais lu depuis ses métadonnées.** Tout compte naît en `lecture`
(sauf le premier). Le rôle est posé par une mise à jour distincte, sous la session de
l'administrateur, qui traverse donc les gardes avec une vraie identité.

**5. `proxy.ts` n'est pas une frontière de sécurité.** Il rafraîchit la session et refoule les
visiteurs anonymes, rien de plus. L'autorisation vit dans `requirePermission()` et, en dernier
ressort, dans la RLS. En App Router, un contrôle posé sur le seul `layout.tsx` ne couvre pas les
pages, qui se rendent indépendamment lors des navigations douces.

**6. Les administrateurs ne voient pas les relevés privés des autres.** Aucune politique de
`outings` ou `finds` n'appelle `can()`. Un super-pouvoir sur les comptes n'est pas un
super-pouvoir sur les spots — le test pgTAP 08 le vérifie explicitement, sur un acteur qui
détient pourtant *toutes* les permissions de la matrice.

**7. L'exposition n'est jamais stockée en degrés.** 359° et 1° sont voisins sur le terrain mais
aux antipodes pour un modèle : on stocke `northness` et `eastness`, et la recomposition n'a lieu
qu'à l'affichage.

**8. La COULEUR d'une maille est un percentile de la fenêtre visible ; le TEXTE est absolu.**
Les deux échelles cohabitent, et c'est délibéré. En août sec, toutes les valeurs s'effondrent :
une couleur absolue rendrait la carte uniformément pâle, donc inutilisable pour choisir entre
deux coins. Mais une couleur relative, seule, laisse croire à une bonne journée dès que la carte
est contrastée. Le panneau de lecture dit donc la valeur absolue en toutes lettres — « faibles
chances » — pendant que la carte continue de classer. Retirer l'un des deux ramène le défaut de
l'autre.

**9. `dist_path_m` sert à l'entraînement, pas à l'inférence.** Le modèle y absorbera le biais
d'observation — on trouve des champignons près des chemins surtout parce qu'on n'y va pas
autrement. À l'inférence, la variable sera fixée à sa médiane, ce qui retire le biais au lieu de
le propager.

**10. Une sortie bredouille est une donnée, pas un échec.** C'est la seule source d'absences
réelles du projet, et la phase 7 en dépend. L'interface doit la rendre aussi rapide à noter
qu'une trouvaille.

**11. L'horizon de 8 jours est écrit à quatre endroits, qui doivent bouger ensemble.**
`scoring.forecast_horizon_days` en base, `HORIZON` dans `lib/map/hexagons.ts`, et les huit
indices explicites de `map_in_view` et de `refresh_forecast_r7`. Ces fonctions prennent le
maximum par indice plutôt que de déplier les tableaux : à l'échelle des trois départements, la
forme dépliée matérialise 5,5 millions de lignes contre 689 000.

**12. Aucun écran ne montre un score brut à l'utilisateur.** Ni pourcentage, ni valeur de
confiance chiffrée : uniquement des paliers nommés (`lib/scoring/levels.ts`). Un nombre entre 0
et 1 qui n'est pas une probabilité mais qu'on affiche en pourcentage est une affirmation fausse,
pas une donnée brute. Les administrateurs, eux, gardent les nombres dans `/admin`.

**13. Une migration ne s'applique JAMAIS à la main.** Le workflow `migrate.yml` la pousse après
chaque CI verte, et c'est la seule voie. Le 3 août, le commit « familles » est parti sur Vercel
avec son code et sans son schéma : `species.family` n'existait pas en production, `/api/species`
renvoyait 500, la carte ne demandait plus aucun score. Elle est restée **muette cinq semaines**
— affichée normalement, hexagones gris, verdict vide — pendant que les données, elles, étaient
justes. Personne ne l'a vu parce qu'une carte en panne se voit et qu'une carte silencieuse, non.
Le déploiement de la base était le dernier maillon manuel de la chaîne ; il ne l'est plus.

**14. Ce qui lit `forecast` doit lire `forecast_r7` quand la carte est dézoomée.** Et
réciproquement : l'agrégat ne doit jamais retarder sur la table source. Le rattrapage est un
déclencheur d'instruction en base (`forecast_refresh_r7`), pas un appel dans `score.py` — parce
que le cron exécute le code de `main` et non celui du poste de travail, et qu'un appel écrit
dans le pipeline ne protège que celui qui l'a écrit. Même raison que le point 13, même classe de
panne : silencieuse.

**15. Le filtre d'emprise utilise `&&`, jamais `st_intersects`.** L'opérateur seul compare les
boîtes englobantes — ce que fait déjà l'index GIST — et rend un sur-ensemble de quelques
centaines de mètres, sur un écran que le client entoure déjà de 15 % de marge. Le test exact de
`st_intersects` coûtait 372 ms contre 27 pour écarter 4 % de lignes. Le sens de l'erreur est le
bon : rendre une maille de trop ne se voit pas, en oublier une se paierait sur le terrain.

Le reste des pièges est documenté à l'endroit du code concerné.

---

## Tests et CI

- **Tests pgTAP** (`pnpm db:test`) : invariants de rôles, RLS de toutes les tables, immuabilité
  du journal d'audit, confidentialité du carnet. Le fichier `01_rls_enabled.sql` vérifie par
  introspection que **toute** table de `public` est sous RLS — une table ajoutée sans politique
  fait échouer la CI.
- **Tests unitaires Vitest** sur `can()`, la seule logique d'autorisation pure.
- **CI GitHub Actions** : migrations, pgTAP, dérive des types générés, `tsc`, `eslint`,
  `vitest`, `next build`.
- **Scoring quotidien** à 5 h UTC (`daily-score.yml`), actif dès que le dépôt est sur GitHub avec
  un `DATABASE_URL` en secret.

---

## Direction artistique

Ancrage : la carte topographique IGN et le relevé forestier, lus à travers une interface
contemporaine. **La carte est l'application** — elle occupe tout le viewport et tout le reste
flotte au-dessus, dans des surfaces translucides. Mobile first, mode sombre par défaut (l'app se
consulte à 6 h du matin dans une voiture), mode clair de plein droit.

Palette : `#12140F` fond, `#1E2118` surfaces, `#2A3324` bordures, `#9FB08A` texte secondaire,
`#E8E6DD` texte principal, `#C89B3C` accent unique, `#B23A3A` avertissements **uniquement**.
Typographie : Bricolage Grotesque en display, Public Sans en texte, IBM Plex Mono pour **toute
donnée chiffrée**. Les trois viennent de `next/font/google`, qui les auto-héberge : aucune
requête externe.

Deux pièges de contraste, corrigés dans `globals.css` : `#B23A3A` ne donne que 3,2:1 sur le fond
sombre (d'où une variante éclaircie pour le texte), et l'ocre tombe à 2:1 sur fond clair (d'où un
ocre assombri en mode clair).

**Le mobilier de la carte tient en deux surfaces.** En haut, le bandeau de sécurité et le choix
du fond. En bas, dans le pouce, un seul *panneau de lecture* : les familles, le verdict en
toutes lettres, et la semaine en huit barres. Ces barres remplacent l'ancien curseur de jour —
même donnée, les huit jours étant déjà chargés, mais un curseur ne montrait rien : glisser de
J+3 à J+4 changeait des couleurs sans dire si c'était mieux. Un « ? » y ouvre le mode d'emploi
de la carte, accessible en permanence et non affiché une seule fois au premier lancement : une
explication qu'on ne peut plus rouvrir n'est pas une explication.

**Icône** : la même maille hexagonale, avec un champignon dedans — les deux seules choses que
l'application manipule. Silhouette pleine et non un trait : à 16 px, un contour d'un pixel et
demi disparaît dans l'antialiasing des onglets.

**Élément signature** : la *carotte de terrain* du panneau d'inspection — une bande stratifiée où
la densité des houppiers suit la part boisée, la surface s'incline selon la pente, l'épaisseur de
l'humus suit le carbone organique, la teinte de l'horizon va du brun acide au gris calcaire selon
le pH, et son grain suit le taux d'argile. Chaque trait encode une donnée réelle.

---

## Écarts assumés au cahier des charges

| Prévu | Retenu | Raison |
|---|---|---|
| Next.js 15, Tailwind v3 | Next 16, Tailwind v4 | versions courantes ; config CSS-first, plus de `tailwind.config.js` |
| `@supabase/auth-helpers` | `@supabase/ssr` | le premier est déprécié |
| RGE ALTI 5 m | BD ALTI 25 m | sur des mailles de 280 m, le 5 m est du détail moyenné et plus bruité |
| Table `invitations` | création directe des comptes | pas de service d'e-mail, et un cercle de quelques personnes |
| `access.registration_mode` | `enable_signup = false` | il n'y a plus d'inscription du tout |
| 4 rôles (`viewer` → `super_admin`) | 3 rôles (`lecture`, `ecriture`, `admin`) | la délégation partielle de l'administration ne protégeait de personne sur un cercle de quelques amis |
| `forecast` : une ligne par jour | tableau de 8 scores | 770 Mo projetés contre 500 autorisés ; 121 Mo au final |
| `app_settings` sans `options` | colonne `options` ajoutée | sans elle, une clé énumérée obligerait à coder ses valeurs dans le front |
| Opacité 0,35–0,85 | 0,15–0,50 | à 0,85 le fond IGN disparaît là où il faut lire les chemins d'accès |
| Sélecteur d'espèce | sélecteur de **famille**, « Tous » par défaut | on cherche des cèpes, pas du *Boletus reticulatus* |
| Curseur de jour J → J+7 | barre de semaine en huit barres | un curseur ne montre pas où est le bon jour |
| Score en pourcentage | cinq paliers nommés | le score n'est pas une probabilité : l'afficher en % est faux |
| Compteur de mailles visibles | supprimé | mesure du moteur, personne ne décide rien avec |
