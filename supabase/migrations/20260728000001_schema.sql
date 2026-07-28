-- Mycélio — phase 1 : schéma d'identité, de droits et de paramétrage.
--
-- Toutes les tables vivent dans `public` et seront placées sous RLS en 20260728000004_rls.sql.
-- Le schéma `private` héberge les fonctions d'autorisation : PostgREST ne l'expose pas, ce qui
-- évite de publier `actor_role()` comme une RPC appelable par n'importe quel client.

create schema if not exists private;
revoke all on schema private from anon, authenticated;

create type public.app_role as enum ('super_admin', 'admin', 'member', 'viewer');


-- ---------------------------------------------------------------------------
-- Identité
-- ---------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text not null,
  role         public.app_role not null default 'viewer',
  is_active    boolean not null default true,
  home_lat     double precision,
  home_lng     double precision,
  created_at   timestamptz not null default now()
);

-- La garde du dernier super_admin compte les super_admins actifs à chaque mutation de profil.
create index profiles_active_super_admin_idx
  on public.profiles (role)
  where role = 'super_admin' and is_active;


-- ---------------------------------------------------------------------------
-- Droits
--
-- Le code applicatif ne teste jamais un rôle : il teste une permission, via public.can().
-- La matrice ci-dessous est la seule source de vérité, et elle est éditable en UI.
-- ---------------------------------------------------------------------------

create table public.permissions (
  key      text primary key,
  label    text not null,
  category text not null
);

create table public.role_permissions (
  role       public.app_role not null,
  permission text not null references public.permissions(key) on delete cascade,
  primary key (role, permission)
);


-- ---------------------------------------------------------------------------
-- Journal d'audit
--
-- Alimenté exclusivement par trigger. Aucune politique UPDATE/DELETE ne sera créée, et un
-- trigger interdit en plus les modifications à `service_role`, qui contourne la RLS.
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id         bigserial primary key,
  actor_id   uuid references public.profiles(id) on delete set null,
  action     text not null,
  target     text,
  payload    jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_created_at_idx on public.audit_log (created_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id);


-- ---------------------------------------------------------------------------
-- Paramétrage applicatif
--
-- L'écran /admin/settings génère son formulaire DEPUIS cette table : ajouter un paramètre ne
-- doit demander aucune ligne de code front. D'où `value_type`, les bornes, et `options`.
--
-- `options` est un écart assumé au schéma du cahier des charges : sans lui, une clé énumérée
-- (comme un mode d'affichage) obligerait à coder ses valeurs en dur dans le front, ce qui
-- ruinerait justement le caractère générique du formulaire.
-- ---------------------------------------------------------------------------

create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  label       text not null,
  description text,
  value_type  text not null check (value_type in ('number', 'boolean', 'string', 'json', 'range', 'enum')),
  options     jsonb,
  min_value   numeric,
  max_value   numeric,
  category    text not null,
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- Domaine mycologique
--
-- Aucun couplage avec le pipeline géospatial : ni PostGIS, ni H3, ni `cells`. La table est
-- donc livrable dès la phase 1, avec les colonnes exactes du cahier des charges pour éviter
-- une migration de forme en phase 5.
-- ---------------------------------------------------------------------------

create table public.species (
  id                 serial primary key,
  slug               text unique not null,
  scientific_name    text not null,
  common_name_fr     text not null,
  gbif_taxon_key     bigint,
  host_codes         text[] not null default '{}',
  ph_min             numeric,
  ph_max             numeric,
  alt_min_m          int,
  alt_max_m          int,
  season_start_doy   int check (season_start_doy between 1 and 366),
  season_end_doy     int check (season_end_doy between 1 and 366),
  soil_temp_opt_c    numeric,
  soil_temp_tol_c    numeric,
  rain_lag_days      int,
  rain_optimum_mm    numeric,
  prefers_calcareous boolean not null default false,
  thermophilic       boolean not null default false,
  is_enabled         boolean not null default true,
  notes_terrain      text,
  sort_order         int not null default 0
);

create index species_sort_idx on public.species (sort_order, common_name_fr);
