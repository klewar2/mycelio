-- Les fonctions de fenêtre excluent les mailles protégées.
--
-- Le filtre est posé ICI, dans la source de données, et non dans le composant de carte : c'est
-- le seul endroit qui garantit qu'aucun chemin d'accès ne les expose. Une exclusion faite côté
-- client serait contournable en appelant l'API directement, et oubliée à la première nouvelle
-- vue qu'on écrirait.

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
        and extensions.st_intersects(c.centroid, box);
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
      where not cl.restricted
        and extensions.st_intersects(cl.centroid, box);
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
      group by grouped.h3_r7;
  end if;
end;
$$;

grant execute on function public.forecast_in_view(
  text, double precision, double precision, double precision, double precision, boolean
) to authenticated;
