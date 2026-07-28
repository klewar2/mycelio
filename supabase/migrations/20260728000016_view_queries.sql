-- Requêtes par fenêtre de carte.
--
-- En résolution 9 on dépasse 90 000 mailles : les envoyer toutes ferait plusieurs mégaoctets et
-- n'aurait aucun sens, la plupart étant hors écran ou sous-pixel. Ces fonctions ne renvoient que
-- ce qui est visible, et agrègent sur le parent en résolution 7 quand la carte est dézoomée.
--
-- SECURITY INVOKER, et non DEFINER : la RLS de `cells` et de `forecast` doit continuer de
-- s'appliquer. Une fonction DEFINER contournerait le filtre « utilisateur actif » et ouvrirait
-- la grille à un compte désactivé.

create or replace function public.cells_in_view(
  west double precision,
  south double precision,
  east double precision,
  north double precision,
  detailed boolean default true
)
returns table (h text, f real, e text, a real, n integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with visible as (
    select c.*
    from public.cells c
    where extensions.st_intersects(
      c.centroid,
      extensions.st_makeenvelope(west, south, east, north, 4326)::extensions.geography
    )
  )
  select h3_index, forest_share, essence, alt_m, 1
  from visible
  where detailed

  union all

  -- Agrégation sur le parent : la part boisée moyenne, et l'essence la plus fréquente du
  -- groupe, qui reste l'information utile à cette échelle.
  select h3_r7,
         avg(forest_share)::real,
         mode() within group (order by essence),
         avg(alt_m)::real,
         count(*)::integer
  from visible
  where not detailed
  group by h3_r7;
$$;

grant execute on function public.cells_in_view(
  double precision, double precision, double precision, double precision, boolean
) to authenticated;


-- Le paramètre ne peut pas s'appeler `species` : il masquerait la table du même nom, et
-- `slug = species` comparerait alors du texte à une ligne entière.
create or replace function public.forecast_in_view(
  species_slug text,
  west double precision,
  south double precision,
  east double precision,
  north double precision,
  detailed boolean default true
)
returns table (h text, s real[], c real)
language sql
stable
security invoker
set search_path = ''
as $$
  with target as (
    select id from public.species where slug = species_slug and is_enabled
  ),
  visible as (
    select c.h3_index, c.h3_r7, f.scores, f.confidence
    from public.cells c
    join public.forecast f on f.h3_index = c.h3_index
    join target t on t.id = f.species_id
    where extensions.st_intersects(
      c.centroid,
      extensions.st_makeenvelope(west, south, east, north, 4326)::extensions.geography
    )
  )
  select h3_index, scores, confidence
  from visible
  where detailed

  union all

  -- Agrégation par le MAXIMUM et non la moyenne : à petite échelle la question utile est
  -- « y a-t-il quelque chose de bon dans ce secteur », pas « quelle est la moyenne du secteur ».
  -- Une moyenne noierait une bonne maille au milieu de vingt médiocres.
  select h3_r7,
         array_agg(best order by day)::real[],
         max(confidence)::real
  from (
    select v.h3_r7, day, max(value)::real as best, max(v.confidence) as confidence
    from visible v,
         lateral unnest(v.scores) with ordinality as u(value, day)
    where not detailed
    group by v.h3_r7, day
  ) grouped
  group by h3_r7;
$$;

grant execute on function public.forecast_in_view(
  text, double precision, double precision, double precision, double precision, boolean
) to authenticated;
