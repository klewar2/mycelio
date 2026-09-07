-- Météo par point de grille, pour la barre de semaine du panneau de lecture.
--
-- Le pipeline interroge Open-Meteo sur une grille de 0,1° (voir pipeline/mycelio/weather.py) :
-- la météo n'a aucune structure plus fine que quelques kilomètres, et prétendre le contraire en
-- stockant une valeur par maille de 280 m serait malhonnête, en plus de multiplier les lignes
-- par plusieurs milliers pour rien. On stocke donc UN point de grille par ligne, et c'est la
-- fenêtre de carte qui prend le plus proche.
--
-- TRONQUÉ et rechargé à chaque exécution du pipeline, comme `forecast` : aucun historique météo
-- n'est conservé ici, seule la prévision courante compte.

create table public.weather_grid (
  id             bigint generated always as identity primary key,
  point          extensions.geography(point, 4326) not null,
  -- Un jour par case, de J à J+horizon — même convention que forecast.scores.
  rain_mm        real[] not null,
  tmin_c         real[] not null,
  tmax_c         real[] not null,
  soil_moisture  real[] not null,
  -- Code WMO du temps sensible (0 = ciel clair, 1-3 = nuageux, 51+ = précipitations…).
  weather_code   smallint[] not null,
  run_id         uuid not null
);

create index weather_grid_point_idx on public.weather_grid using gist (point);

alter table public.weather_grid enable row level security;

create policy weather_grid_select on public.weather_grid
  for select to authenticated
  using (public.is_active_user());

grant select on public.weather_grid to authenticated;
revoke all on public.weather_grid from anon;

-- La météo est quasi uniforme sur l'emprise d'une fenêtre de carte (voir le docstring de
-- weather.py) : contrairement à cells_in_view et forecast_in_view, une seule ligne suffit,
-- prise au point de grille le plus proche du centre de la fenêtre. Pas de branche « détaillée »
-- ni d'agrégation par parent ici, la donnée n'ayant pas cette résolution pour commencer.
create or replace function public.weather_in_view(
  west double precision,
  south double precision,
  east double precision,
  north double precision
)
returns table (
  rain_mm real[],
  tmin_c real[],
  tmax_c real[],
  soil_moisture real[],
  weather_code smallint[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  -- `search_path = ''` empêche la résolution normale de l'opérateur <-> : il faut le qualifier
  -- explicitement par OPERATOR(), ce qu'aucune fonction de fenêtre existante n'avait encore eu
  -- à faire — cells_in_view et forecast_in_view n'appellent que des fonctions, jamais un
  -- opérateur de distance.
  select w.rain_mm, w.tmin_c, w.tmax_c, w.soil_moisture, w.weather_code
  from public.weather_grid w
  order by w.point OPERATOR(extensions.<->) extensions.st_centroid(
    extensions.st_makeenvelope(west, south, east, north, 4326)
  )::extensions.geography
  limit 1;
$$;

grant execute on function public.weather_in_view(
  double precision, double precision, double precision, double precision
) to authenticated;
