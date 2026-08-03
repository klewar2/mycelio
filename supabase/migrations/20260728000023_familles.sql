-- Familles grand public, et lecture de la carte par famille.
--
-- Un cueilleur débutant ne distingue pas un cèpe d'été d'un cèpe de Bordeaux — et il n'a pas à
-- le faire pour décider où aller ce week-end. Ces trois espèces occupent d'ailleurs des
-- créneaux saisonniers qui se relaient : afficher « Cèpes » et prendre le meilleur des trois
-- répond exactement à la question posée, sans rien perdre.
--
-- Le regroupement vit en base, pas dans le front : les espèces sont déjà éditables depuis
-- /admin/especes, et une famille n'est qu'un libellé de plus. Coder la correspondance en
-- TypeScript aurait figé une constante mycologique dans le code, ce que le projet s'interdit.
--
-- La colonne porte directement le LIBELLÉ affiché, pas un identifiant technique : c'est un
-- regroupement de présentation, il n'est lu par aucun calcul.

alter table public.species add column family text;

comment on column public.species.family is
  'Libellé grand public regroupant plusieurs espèces sur la carte. Null = espèce affichée seule.';

update public.species set family = case slug
  when 'cepe-de-bordeaux'     then 'Cèpes'
  when 'tete-de-negre'        then 'Cèpes'
  when 'cepe-d-ete'           then 'Cèpes'
  when 'girolle'              then 'Girolles'
  when 'trompette-de-la-mort' then 'Trompettes'
  when 'lactaire-delicieux'   then 'Lactaires'
  when 'pied-de-mouton'       then 'Pieds-de-mouton'
  when 'morille'              then 'Morilles'
  else common_name_fr
end;

create index species_family_idx on public.species (family, sort_order);


-- ---------------------------------------------------------------------------
-- Scores par famille : le maximum des espèces qui la composent.
--
-- Le maximum, et non la moyenne, pour la même raison que l'agrégation sur le parent en
-- résolution 7 : la question est « y a-t-il quelque chose à trouver ici », pas « quelle est la
-- moyenne du genre ». Une moyenne sur les trois cèpes noierait le cèpe d'été, seul en poussée
-- fin juillet, sous deux espèces à zéro — et la carte serait uniformément vide en plein pic.
--
-- La fonction remplace la version à espèce unique : un tableau d'un seul élément couvre le cas
-- particulier, et deux fonctions à maintenir en parallèle auraient divergé.
-- ---------------------------------------------------------------------------

drop function if exists public.forecast_in_view(
  text, double precision, double precision, double precision, double precision, boolean
);

create function public.forecast_in_view(
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

  -- Les deux branches ne diffèrent que par la clé de regroupement — maille fine ou parent en
  -- résolution 7 — et par le fait que la seconde agrège en plus les mailles entre elles.
  --
  -- Le maximum se prend PAR INDICE, sur huit expressions explicites, et non en dépliant les
  -- tableaux avec `unnest ... with ordinality`. La forme dépliée est plus élégante et coûte
  -- deux fois plus cher : à l'échelle des trois départements, elle matérialise 5,5 millions de
  -- lignes (86 000 mailles × 8 espèces × 8 jours) là où celle-ci en agrège 689 000. Mesuré à
  -- 578 ms contre 267 ms sur la vue par défaut, qui est justement celle qu'on ouvre en premier.
  --
  -- Le 8 est le même horizon que celui déjà codé côté client (HORIZON, dans lib/map/hexagons.ts) :
  -- les deux doivent bouger ensemble si `scoring.forecast_horizon_days` change. `array_remove`
  -- reprend les indices vides pour un horizon plus court — les scores ne sont jamais nuls à
  -- l'intérieur de l'horizon.
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
      where not cl.restricted
        and extensions.st_intersects(cl.centroid, box)
      group by cl.h3_index
      -- Ordre déterministe : la pagination de PostgREST en dépend (voir la migration 0022).
      order by cl.h3_index;
  else
    return query
      select cl.h3_r7,
             array_remove(array[
               max(f.scores[1]), max(f.scores[2]), max(f.scores[3]), max(f.scores[4]),
               max(f.scores[5]), max(f.scores[6]), max(f.scores[7]), max(f.scores[8])
             ], null),
             max(f.confidence)
      from public.cells cl
      join public.forecast f
        on f.h3_index = cl.h3_index and f.species_id = any(targets)
      where not cl.restricted
        and extensions.st_intersects(cl.centroid, box)
      group by cl.h3_r7
      order by cl.h3_r7;
  end if;
end;
$$;

grant execute on function public.forecast_in_view(
  text[], double precision, double precision, double precision, double precision, boolean
) to authenticated;
