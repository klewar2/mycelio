-- La grille hexagonale et ses attributs de terrain.
--
-- Alimentée exclusivement par le pipeline Python, hors ligne, en connexion Postgres directe.
-- L'application ne fait que lire : aucun géotraitement ne doit apparaître dans apps/web.

create extension if not exists postgis with schema extensions;

create table public.cells (
  h3_index      text primary key,
  dept          char(2) not null,

  -- geography et non geometry : les distances y sont en mètres sur l'ellipsoïde, sans avoir à
  -- choisir une projection au moment de la requête.
  centroid      extensions.geography(point, 4326) not null,

  -- Terrain, dérivé du MNT à 25 m puis moyenné sur l'hexagone.
  alt_m         real,
  slope_pct     real,
  -- L'exposition n'est JAMAIS stockée en degrés : 359° et 1° sont voisins sur le terrain mais
  -- aux antipodes pour un modèle. D'où la décomposition en cosinus et sinus.
  northness     real,
  eastness      real,
  twi           real,
  -- tpi et curvature sont centrés-réduits sur la population des mailles : « +1 » signifie un
  -- écart-type au-dessus des autres, ce qu'attendent les règles de conseil terrain.
  tpi           real,
  curvature     real,
  solar_index   real,

  -- Forêt, depuis la BD Forêt.
  forest_code   text,
  forest_share  real,
  dist_edge_m   real,

  -- Réseaux, depuis la BD TOPO.
  dist_stream_m real,
  -- dist_path_m sert à l'ENTRAÎNEMENT, pour que le modèle y absorbe le biais d'observation
  -- (on trouve des champignons près des chemins surtout parce qu'on n'y va pas autrement).
  -- À l'inférence, elle est fixée à sa médiane pour toutes les mailles : on retire ainsi le
  -- biais au lieu de le propager. Ne pas « corriger » ce comportement.
  dist_path_m   real,

  -- Sol, depuis SoilGrids.
  soil_ph       real,
  soil_clay_pct real,
  soil_soc      real,

  updated_at    timestamptz not null default now()
);

create index cells_centroid_idx on public.cells using gist (centroid);
create index cells_dept_idx on public.cells (dept);
create index cells_forest_code_idx on public.cells (forest_code);

alter table public.cells enable row level security;

-- Lecture pour tout utilisateur actif ; aucune politique d'écriture, le pipeline passant par
-- une connexion propriétaire que la RLS n'atteint pas.
create policy cells_select on public.cells
  for select to authenticated
  using (public.is_active_user());

grant select on public.cells to authenticated;
revoke all on public.cells from anon;
