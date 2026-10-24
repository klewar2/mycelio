-- Les trouvailles du cercle : savoir que « ça sort », sans livrer ses coins.
--
-- La carte dit où les conditions sont réunies, jamais si des champignons sont sortis. Personne
-- ne le sait mieux que ceux qui en reviennent — et les bases publiques ne le savent pas : sur
-- iNaturalist, aucun cèpe de Bordeaux en Haute-Garonne, Tarn et Aude depuis le 1er septembre
-- 2026, et huit sur toute la saison 2025. La seule source locale et fraîche, c'est le carnet.
--
-- Le carnet savait déjà partager, mais en tout ou rien : une sortie « partagée » montre au
-- cercle sa maille de 280 m et ses notes — « sous les fougères, versant nord ». Personne ne
-- livre un coin à cèpes comme ça, et une fonctionnalité que personne n'alimente n'existe pas.
--
-- D'où un niveau intermédiaire, `signal` : le cercle apprend la date, l'espèce, trouvé ou
-- bredouille, et un SECTEUR — l'hexagone H3 de résolution 6 par défaut, 36 km², sept
-- kilomètres d'un bord à l'autre. Assez pour dire « ça sort par là-bas cette semaine », pas
-- assez pour retrouver l'endroit.
--
--   private   rien ne sort du compte
--   signal    le cercle voit un secteur, une date, une espèce — jamais la maille ni les notes
--   shared    le cercle voit la sortie entière dans son journal, comme avant
--
-- La garantie tient en base et non dans l'interface. Les politiques RLS de `outings` et de
-- `finds` ne changent PAS : elles n'ouvrent aux autres que `shared`. Une sortie `signal` reste
-- donc illisible par PostgREST, même en la demandant à la main ; seule `circle_signals()` en
-- extrait quelque chose, et elle ne rend jamais rien de plus fin que le secteur. Un champ ajouté
-- un jour à la vue du journal ne peut pas la faire fuiter.
--
-- Les bredouilles comptent autant que les trouvailles : « trois sorties vides dans ce secteur
-- cette semaine » est exactement ce que la carte ne sait pas dire.


alter table public.outings drop constraint outings_visibility_check;
alter table public.outings add constraint outings_visibility_check
  check (visibility in ('private', 'signal', 'shared'));

comment on column public.outings.visibility is
  'private : à soi seul. signal : le cercle voit un secteur flouté, une date, une espèce (via circle_signals). shared : le cercle voit la sortie entière.';


-- ---------------------------------------------------------------------------
-- Le parent H3, sans extension.
--
-- Supabase ne fournit pas l'extension h3, et le pipeline précalcule `cells.h3_r7` pour cette
-- raison. Le secteur flouté a besoin d'une résolution réglable, donc d'un vrai calcul de
-- parent — qui n'est que de l'arithmétique sur 64 bits : la résolution vit dans les bits 52 à
-- 55, et chaque niveau plus fin occupe trois bits, mis à 7 quand il est inutilisé.
--
-- Vérifié contre `cellToParent` de h3-js aux résolutions 4 à 7, et contre `cells.h3_r7` sur les
-- 5 439 mailles de la base locale : identique partout. Le test 10 en garde des valeurs.
-- ---------------------------------------------------------------------------

create or replace function public.h3_parent(cell text, res int)
returns text
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  idx bigint := ('x' || lpad(cell, 16, '0'))::bit(64)::bigint;
  own int := ((idx >> 52) & 15)::int;
  r int;
begin
  if res < 0 then
    raise exception 'MYC_H3_RES: résolution négative (%)', res;
  end if;
  if res >= own then
    return cell;
  end if;
  idx := (idx & ~(15::bigint << 52)) | (res::bigint << 52);
  for r in res + 1 .. own loop
    idx := idx | (7::bigint << ((15 - r) * 3));
  end loop;
  return to_hex(idx);
end;
$$;

grant execute on function public.h3_parent(text, int) to authenticated;


-- ---------------------------------------------------------------------------
-- Les signaux.
--
-- Une ligne par sortie, et pas un agrégat : le client groupe par secteur et par famille, ce qui
-- garde la correspondance espèce → famille dans `species.family`, sa seule source.
--
-- `mine` sert à l'interface — « toi » plutôt que « quelqu'un du cercle » —, jamais à identifier
-- l'auteur d'une autre sortie : aucun nom ne sort d'ici.
--
-- Une sortie sans maille, mais avec une position, est rattachée à la maille la plus proche à
-- moins de 1,5 km : c'est le cas d'une sortie notée à la géolocalisation, sans hexagone
-- sélectionné. Au-delà, elle n'est dans aucun secteur connu et ne produit pas de signal.
--
-- Les mailles masquées — réserves intégrales, cœurs de parc — ne produisent pas de signal non
-- plus : un secteur de 36 km² n'y désigne pas un coin, mais une application qui relaierait
-- « ça sort » depuis une réserve y enverrait quand même du monde.
-- ---------------------------------------------------------------------------

create or replace function public.circle_signals()
returns table (zone text, occurred_on date, found boolean, species_ids int[], mine boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with settings as (
    select
      coalesce(
        (select (value #>> '{}')::numeric from public.app_settings where key = 'map.circle_days'),
        14
      )::int as days,
      least(greatest(round(coalesce(
        (select (value #>> '{}')::numeric from public.app_settings where key = 'map.circle_resolution'),
        6
      )), 5), 7)::int as res
  )
  select
    public.h3_parent(c.h3_index, s.res) as zone,
    o.occurred_on,
    not o.found_nothing as found,
    coalesce(
      array(
        select distinct f.species_id from public.finds f
        where f.outing_id = o.id and f.species_id is not null
        order by 1
      ),
      '{}'
    ) as species_ids,
    o.user_id = (select auth.uid()) as mine
  from public.outings o
  cross join settings s
  join public.profiles p on p.id = o.user_id and p.is_active
  left join lateral (
    select near.h3_index
    from public.cells near
    where o.h3_index is null
      and o.location is not null
      and extensions.st_dwithin(near.centroid, o.location, 1500)
    order by near.centroid operator(extensions.<->) o.location
    limit 1
  ) located on true
  join public.cells c on c.h3_index = coalesce(o.h3_index, located.h3_index)
  where (select public.is_active_user())
    and (select public.can('map.view'))
    and o.visibility in ('signal', 'shared')
    and o.occurred_on between current_date - s.days and current_date
    and not c.restricted
  order by o.occurred_on desc;
$$;

revoke all on function public.circle_signals() from public, anon;
grant execute on function public.circle_signals() to authenticated;


insert into public.app_settings
  (key, value, label, description, value_type, min_value, max_value, category)
values
  ('map.circle_days', '14'::jsonb,
   'Trouvailles du cercle : fraîcheur (jours)',
   'Au-delà, une sortie signalée disparaît de la carte. Une poussée dure une à deux semaines : un signal plus vieux parle d''une autre poussée.',
   'number', 3, 60, 'map'),

  ('map.circle_resolution', '6'::jsonb,
   'Trouvailles du cercle : finesse du secteur (résolution H3)',
   '6 : secteurs de 36 km², 7 km de large. 5 : 250 km². 7 : 5 km², 2,5 km de large — un massif se reconnaît. Plus fin trahirait les coins de ceux qui signalent.',
   'number', 5, 7, 'map');
