-- Ordre déterministe sur les fonctions de fenêtre, pour que la pagination soit correcte.
--
-- L'application lit ces RPC par pages de 1000 lignes (voir apps/web/lib/supabase/paginate.ts),
-- parce que PostgREST tronque toute réponse à `max_rows` sans le signaler.
--
-- Or `LIMIT ... OFFSET` sans `ORDER BY` ne garantit RIEN : Postgres est libre de rendre les
-- lignes dans un ordre différent d'une exécution à l'autre. Deux pages successives peuvent alors
-- se recouvrir et omettre des mailles — silencieusement, encore une fois. Le risque n'est pas
-- théorique ici : le cron réécrit `forecast` chaque nuit à 5 h UTC, et une requête qui enjambe
-- cette réécriture verrait deux instantanés différents.
--
-- L'index H3 est unique par ligne dans les deux branches : il suffit à lever toute ambiguïté.
-- Le coût est négligeable — la branche détaillée n'est servie qu'au-dessus du zoom 11, donc sur
-- ce qui tient à l'écran, et la branche agrégée trie déjà pour son GROUP BY.

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
      where not c.restricted
        and extensions.st_intersects(c.centroid, box)
      order by c.h3_index;
  else
    return query
      select c.h3_r7,
             avg(c.forest_share)::real,
             mode() within group (order by c.essence),
             avg(c.alt_m)::real,
             count(*)::integer
      from public.cells c
      where not c.restricted
        and extensions.st_intersects(c.centroid, box)
      group by c.h3_r7
      order by c.h3_r7;
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
      where not cl.restricted
        and extensions.st_intersects(cl.centroid, box)
      order by cl.h3_index;
  else
    return query
      select grouped.h3_r7,
             array_agg(grouped.best order by grouped.day)::real[],
             max(grouped.conf)::real
      from (
        select cl.h3_r7, u.day, max(u.value)::real as best, max(f.confidence) as conf
        from public.cells cl
        join public.forecast f on f.h3_index = cl.h3_index and f.species_id = target
        cross join lateral unnest(f.scores) with ordinality as u(value, day)
        where not cl.restricted
          and extensions.st_intersects(cl.centroid, box)
        group by cl.h3_r7, u.day
      ) grouped
      group by grouped.h3_r7
      order by grouped.h3_r7;
  end if;
end;
$$;

grant execute on function public.forecast_in_view(
  text, double precision, double precision, double precision, double precision, boolean
) to authenticated;
