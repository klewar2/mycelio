-- Requêtes par fenêtre, deuxième version.
--
-- La première utilisait un UNION ALL entre la branche détaillée et la branche agrégée, avec un
-- `where detailed` / `where not detailed` pour n'en garder qu'une. Postgres évaluait quand même
-- la CTE partagée pour les deux, doublant le coût : 625 ms là où la requête seule en prend 296.
--
-- En plpgsql, IF/ELSE ne construit qu'un seul plan et n'exécute que la branche utile.

create or replace function public.cells_in_view(
  west double precision,
  south double precision,
  east double precision,
  north double precision,
  detailed boolean default true
)
returns table (h text, f real, e text, a real, n integer)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  box extensions.geography := extensions.st_makeenvelope(west, south, east, north, 4326)::extensions.geography;
begin
  if detailed then
    return query
      select c.h3_index, c.forest_share, c.essence, c.alt_m, 1
      from public.cells c
      where extensions.st_intersects(c.centroid, box);
  else
    -- L'essence retenue est la plus fréquente du groupe : à cette échelle, c'est elle qui décrit
    -- le secteur, une moyenne n'aurait aucun sens sur une variable qualitative.
    return query
      select c.h3_r7,
             avg(c.forest_share)::real,
             mode() within group (order by c.essence),
             avg(c.alt_m)::real,
             count(*)::integer
      from public.cells c
      where extensions.st_intersects(c.centroid, box)
      group by c.h3_r7;
  end if;
end;
$$;

grant execute on function public.cells_in_view(
  double precision, double precision, double precision, double precision, boolean
) to authenticated;


create or replace function public.forecast_in_view(
  species_slug text,
  west double precision,
  south double precision,
  east double precision,
  north double precision,
  detailed boolean default true
)
returns table (h text, s real[], c real)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  box extensions.geography := extensions.st_makeenvelope(west, south, east, north, 4326)::extensions.geography;
  target int;
begin
  select id into target from public.species where slug = species_slug and is_enabled;
  if target is null then
    return;
  end if;

  if detailed then
    return query
      select cl.h3_index, f.scores, f.confidence
      from public.cells cl
      join public.forecast f on f.h3_index = cl.h3_index and f.species_id = target
      where extensions.st_intersects(cl.centroid, box);
  else
    -- Agrégation par le MAXIMUM et non la moyenne : à petite échelle, la question utile est
    -- « y a-t-il quelque chose de bon dans ce secteur », pas « quelle est sa moyenne ». Une
    -- moyenne noierait une bonne maille au milieu de vingt médiocres.
    return query
      select grouped.h3_r7,
             array_agg(grouped.best order by grouped.day)::real[],
             max(grouped.conf)::real
      from (
        select cl.h3_r7, u.day, max(u.value)::real as best, max(f.confidence) as conf
        from public.cells cl
        join public.forecast f on f.h3_index = cl.h3_index and f.species_id = target
        cross join lateral unnest(f.scores) with ordinality as u(value, day)
        where extensions.st_intersects(cl.centroid, box)
        group by cl.h3_r7, u.day
      ) grouped
      group by grouped.h3_r7;
  end if;
end;
$$;

grant execute on function public.forecast_in_view(
  text, double precision, double precision, double precision, double precision, boolean
) to authenticated;
