-- Vue de carte rapide : un seul aller-retour, et plus d'agrégation à la volée.
--
-- Trois défauts se cumulaient sur la vue par défaut — celle qu'on ouvre en premier, dézoomée sur
-- les trois départements. Mesures prises sur la base de production, 86 137 mailles :
--
--   1. `st_intersects(geography, geography)` refaisait un test exact, sur la sphère, pour
--      chacune des 33 000 mailles retenues par l'index. Or 96 % d'entre elles passaient ce
--      test : on payait 340 ms pour écarter 1 248 lignes. Le `&&` seul — l'opérateur que l'index
--      GIST utilise déjà — coûte 27 ms au lieu de 372.
--
--   2. La branche dézoomée agrégeait `forecast` À CHAQUE DÉPLACEMENT : parcours séquentiel des
--      689 096 lignes, jointure, puis regroupement sur le parent en résolution 7. 4,1 s pour la
--      famille « Tous », qui est le réglage par défaut. C'est le poste principal.
--
--   3. La carte appelait deux routes distinctes — mailles puis scores — chacune paginée en deux
--      pages de 1 000 lignes. Quatre requêtes PostgREST, précédées chacune de la pile d'auth.
--
-- D'où, dans l'ordre : le `&&`, deux tables d'agrégats précalculés, et une fonction unique qui
-- rend tout d'un coup en UNE ligne.
--
-- ---------------------------------------------------------------------------------------------
-- Pourquoi `&&` et non `st_intersects`
--
-- `&&` compare les boîtes englobantes géodésiques. Pour un POINT contre une emprise
-- rectangulaire, il rend un SUR-ENSEMBLE du résultat exact : les arcs de grand cercle qui
-- ferment le rectangle bombent vers le pôle, donc sa boîte déborde de quelques centaines de
-- mètres. Mesuré ici : 1 999 mailles au lieu de 1 884.
--
-- Ce sens d'erreur est le seul acceptable. Le mode de défaillance que ce projet redoute est la
-- carte incomplète — celle qui laisse croire qu'il n'y a rien à chercher là où on n'a pas
-- regardé (voir lib/supabase/paginate.ts). Rendre quelques mailles de trop en marge d'un écran
-- que le client entoure déjà de 30 % de marge ne se voit pas ; en rendre trop peu se paierait
-- sur le terrain.
-- ---------------------------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- Agrégats précalculés en résolution 7
--
-- La carte n'affiche le détail qu'au-dessus du zoom 11 : en dessous, une maille de 280 m fait
-- moins d'un pixel et le serveur regroupe sur le parent en résolution 7. Ce regroupement est
-- IDENTIQUE d'un appel à l'autre — il ne dépend que de la grille et des scores du jour, jamais
-- de l'emprise demandée. Le recalculer à chaque déplacement de carte était le vrai gaspillage.
--
-- 3 837 parents pour 86 137 mailles, et 30 696 lignes de scores pour 689 096 : les deux tables
-- tiennent dans le cache de Postgres, là où `forecast` ne tenait pas.
--
-- Des tables et non des vues matérialisées : une vue matérialisée ne supporte pas la RLS, et le
-- test pgTAP 01 vérifie par introspection que toute table de `public` en porte une. On ne veut
-- pas d'une exception à cette règle pour gagner trois lignes de SQL.
-- ---------------------------------------------------------------------------

create table public.cells_r7 (
  h3_r7        text primary key,
  -- Centre du parent, pour le filtre d'emprise. Le décalage avec le vrai centre H3 est de
  -- l'ordre de la centaine de mètres sur une maille de 2 km : sans effet sur un filtre qui
  -- s'applique à un écran entier.
  centroid     extensions.geography(point, 4326) not null,
  forest_share real,
  essence      text,
  alt_m        real,
  n            integer not null
);

create index cells_r7_centroid_idx on public.cells_r7 using gist (centroid);

create table public.forecast_r7 (
  h3_r7      text not null references public.cells_r7 (h3_r7) on delete cascade,
  species_id integer not null references public.species (id) on delete cascade,
  -- Maximum par jour sur les mailles filles, jamais la moyenne : la question posée à cette
  -- échelle est « y a-t-il quelque chose à trouver dans ce secteur », pas « quelle est la
  -- moyenne du secteur ». Une moyenne noierait une bonne maille au milieu de vingt médiocres.
  scores     real[] not null,
  confidence real not null,
  primary key (h3_r7, species_id)
);

alter table public.cells_r7 enable row level security;
alter table public.forecast_r7 enable row level security;

-- Mêmes conditions de lecture que les tables sources : ce ne sont que des vues d'elles.
create policy cells_r7_select on public.cells_r7
  for select to authenticated using ((select public.is_active_user()));

create policy forecast_r7_select on public.forecast_r7
  for select to authenticated using ((select public.is_active_user()));

grant select on public.cells_r7, public.forecast_r7 to authenticated;
revoke all on public.cells_r7, public.forecast_r7 from anon;


-- ---------------------------------------------------------------------------
-- Reconstruction des agrégats.
--
-- Appelée par le pipeline : par `mycelio.upload` quand la grille change, et par `mycelio.score`
-- à chaque exécution quotidienne, juste après le COPY dans `forecast`. Les deux tables sont
-- entièrement reconstruites — 3 837 et 30 696 lignes, c'est l'affaire d'une seconde, et un
-- rafraîchissement incrémental introduirait une classe de bugs pour rien.
--
-- `security definer` : le pipeline se connecte en propriétaire, mais cette fonction doit rester
-- appelable même si un jour on la déclenche autrement. Elle ne lit aucun paramètre et n'écrit
-- que dans ces deux tables.
-- ---------------------------------------------------------------------------

create function public.refresh_map_aggregates()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- `delete` et non `truncate` : `truncate` prend un verrou exclusif qui ferait échouer toute
  -- lecture de carte concurrente, et le cron tourne à 5 h UTC — tôt, mais pas désert.
  delete from public.forecast_r7;
  delete from public.cells_r7;

  insert into public.cells_r7 (h3_r7, centroid, forest_share, essence, alt_m, n)
  select c.h3_r7,
         extensions.st_setsrid(extensions.st_makepoint(
           avg(extensions.st_x(c.centroid::extensions.geometry)),
           avg(extensions.st_y(c.centroid::extensions.geometry))
         ), 4326)::extensions.geography,
         avg(c.forest_share)::real,
         mode() within group (order by c.essence),
         avg(c.alt_m)::real,
         count(*)::integer
  from public.cells c
  where not c.restricted and c.h3_r7 is not null
  group by c.h3_r7;

  insert into public.forecast_r7 (h3_r7, species_id, scores, confidence)
  select c.h3_r7,
         f.species_id,
         -- Maximum par indice, sur huit expressions explicites, et non en dépliant les tableaux
         -- avec `unnest ... with ordinality` : la forme dépliée matérialise 5,5 millions de
         -- lignes là où celle-ci en agrège 689 000 (voir la migration 0023).
         array_remove(array[
           max(f.scores[1]), max(f.scores[2]), max(f.scores[3]), max(f.scores[4]),
           max(f.scores[5]), max(f.scores[6]), max(f.scores[7]), max(f.scores[8])
         ], null),
         max(f.confidence)
  from public.cells c
  join public.forecast f on f.h3_index = c.h3_index
  where not c.restricted and c.h3_r7 is not null
  group by c.h3_r7, f.species_id;

  analyze public.cells_r7;
  analyze public.forecast_r7;
end;
$$;

revoke all on function public.refresh_map_aggregates() from public;


-- ---------------------------------------------------------------------------
-- Contexte de session en un appel.
--
-- `getSessionContext()` enchaînait trois allers-retours : `auth.getUser()`, puis la ligne de
-- `profiles`, puis les permissions du rôle. Les deux derniers sont une jointure, pas deux
-- requêtes — et depuis que les fonctions Vercel tournent en Europe c'est encore 3 ms chacun,
-- mais c'étaient 85 ms chacun tant qu'elles tournaient à Washington.
--
-- `security invoker` : la RLS de `profiles` s'applique, donc cette fonction ne rend jamais que
-- le profil de l'appelant. Elle n'est pas un contournement, seulement un regroupement.
-- ---------------------------------------------------------------------------

create function public.me()
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  select json_build_object(
    'profile', to_json(p),
    'permissions', coalesce(
      (select json_agg(rp.permission)
       from public.role_permissions rp
       where rp.role = p.role),
      '[]'::json
    )
  )
  from public.profiles p
  where p.id = (select auth.uid());
$$;

grant execute on function public.me() to authenticated;


-- ---------------------------------------------------------------------------
-- La fenêtre de carte, mailles et scores ensemble, en UNE ligne.
--
-- Une seule ligne, et non un jeu de lignes, pour une raison précise : PostgREST tronque toute
-- réponse à `max_rows` SANS erreur ni en-tête exploitable. Le dépôt s'en protégeait en paginant
-- (lib/supabase/paginate.ts), au prix d'un aller-retour supplémentaire dès 1 000 mailles — ce
-- qui est le cas de la vue par défaut. En rendant un scalaire `json`, le plafond ne s'applique
-- plus du tout : il n'y a qu'une ligne à tronquer. La classe de bug disparaît au lieu d'être
-- contournée, et la pagination avec elle.
--
-- Mailles et scores sont rendus ensemble parce que la carte les demandait systématiquement tous
-- les deux, pour la même emprise, à la même seconde. Les séparer doublait la pile d'auth.
-- ---------------------------------------------------------------------------

create function public.map_in_view(
  species_slugs text[],
  west double precision,
  south double precision,
  east double precision,
  north double precision,
  detailed boolean default true
)
returns json
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  box extensions.geography := extensions.st_makeenvelope(west, south, east, north, 4326)::extensions.geography;
  targets int[];
  payload json;
begin
  select array_agg(id) into targets
  from public.species
  where slug = any(species_slugs) and is_enabled;

  if targets is null then
    return json_build_object('detailed', detailed, 'cells', '[]'::json);
  end if;

  if detailed then
    -- Au-dessus du zoom 11 : la maille de 280 m, telle quelle. C'est ce qui tient à l'écran,
    -- donc quelques centaines à quelques milliers de lignes — mesuré à 38 ms.
    select coalesce(json_agg(row), '[]'::json) into payload
    from (
      select json_build_object(
               'h', c.h3_index,
               'f', round(c.forest_share::numeric, 2)::float8,
               'e', c.essence,
               'a', round(c.alt_m::numeric)::int,
               -- `::float8` après l'arrondi : `numeric` sérialise « 0.00 », `float8 » sérialise
               -- « 0 ». Sur 2 000 mailles × 8 jours, c'est 80 Ko de zéros décoratifs en moins.
               's', (select json_agg(round(v::numeric, 2)::float8)
                     from unnest(agg.scores) v),
               'c', round(agg.confidence::numeric, 2)::float8
             ) as row
      from public.cells c
      join lateral (
        select array_remove(array[
                 max(f.scores[1]), max(f.scores[2]), max(f.scores[3]), max(f.scores[4]),
                 max(f.scores[5]), max(f.scores[6]), max(f.scores[7]), max(f.scores[8])
               ], null) as scores,
               max(f.confidence) as confidence
        from public.forecast f
        where f.h3_index = c.h3_index and f.species_id = any(targets)
      ) agg on true
      where not c.restricted
        and c.centroid operator(extensions.&&) box
      order by c.h3_index
    ) t;
  else
    -- En dessous du zoom 11 : les agrégats précalculés. Plus aucune jointure sur `forecast`.
    select coalesce(json_agg(row), '[]'::json) into payload
    from (
      select json_build_object(
               'h', c.h3_r7,
               'f', round(c.forest_share::numeric, 2)::float8,
               'e', c.essence,
               'a', round(c.alt_m::numeric)::int,
               -- `::float8` après l'arrondi : `numeric` sérialise « 0.00 », `float8 » sérialise
               -- « 0 ». Sur 2 000 mailles × 8 jours, c'est 80 Ko de zéros décoratifs en moins.
               's', (select json_agg(round(v::numeric, 2)::float8)
                     from unnest(agg.scores) v),
               'c', round(agg.confidence::numeric, 2)::float8
             ) as row
      from public.cells_r7 c
      join lateral (
        select array_remove(array[
                 max(f.scores[1]), max(f.scores[2]), max(f.scores[3]), max(f.scores[4]),
                 max(f.scores[5]), max(f.scores[6]), max(f.scores[7]), max(f.scores[8])
               ], null) as scores,
               max(f.confidence) as confidence
        from public.forecast_r7 f
        where f.h3_r7 = c.h3_r7 and f.species_id = any(targets)
      ) agg on true
      where c.centroid operator(extensions.&&) box
      order by c.h3_r7
    ) t;
  end if;

  return json_build_object('detailed', detailed, 'cells', payload);
end;
$$;

grant execute on function public.map_in_view(
  text[], double precision, double precision, double precision, double precision, boolean
) to authenticated;


-- ---------------------------------------------------------------------------
-- Les deux anciennes fonctions restent, allégées du test exact.
--
-- Elles ne servent plus la carte, mais rien n'oblige à les casser : elles restent le chemin
-- d'accès simple pour un script d'administration ou une vérification à la main. Le `&&` les
-- rend au passage cinq fois plus rapides.
-- ---------------------------------------------------------------------------

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
      where not c.restricted and c.centroid operator(extensions.&&) box
      order by c.h3_index;
  else
    return query
      select c.h3_r7, c.forest_share, c.essence, c.alt_m, c.n
      from public.cells_r7 c
      where c.centroid operator(extensions.&&) box
      order by c.h3_r7;
  end if;
end;
$$;

create or replace function public.forecast_in_view(
  species_slugs text[],
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
  targets int[];
begin
  select array_agg(id) into targets
  from public.species
  where slug = any(species_slugs) and is_enabled;

  if targets is null then
    return;
  end if;

  if detailed then
    return query
      select cl.h3_index,
             array_remove(array[
               max(f.scores[1]), max(f.scores[2]), max(f.scores[3]), max(f.scores[4]),
               max(f.scores[5]), max(f.scores[6]), max(f.scores[7]), max(f.scores[8])
             ], null),
             max(f.confidence)
      from public.cells cl
      join public.forecast f
        on f.h3_index = cl.h3_index and f.species_id = any(targets)
      where not cl.restricted and cl.centroid operator(extensions.&&) box
      group by cl.h3_index
      order by cl.h3_index;
  else
    return query
      select cl.h3_r7,
             array_remove(array[
               max(f.scores[1]), max(f.scores[2]), max(f.scores[3]), max(f.scores[4]),
               max(f.scores[5]), max(f.scores[6]), max(f.scores[7]), max(f.scores[8])
             ], null),
             max(f.confidence)
      from public.cells_r7 cl
      join public.forecast_r7 f
        on f.h3_r7 = cl.h3_r7 and f.species_id = any(targets)
      where cl.centroid operator(extensions.&&) box
      group by cl.h3_r7
      order by cl.h3_r7;
  end if;
end;
$$;


-- Première construction, pour que la base soit utilisable dès la fin de la migration et non
-- seulement après le prochain passage du cron.
select public.refresh_map_aggregates();
