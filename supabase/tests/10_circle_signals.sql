-- Trouvailles du cercle : le cercle apprend qu'« il y en a par là », jamais où.
--
-- Une sortie `signal` doit rester illisible par la table, pour tout autre compte, et ne
-- transparaître qu'au travers de `circle_signals()`, au secteur près. C'est la promesse faite à
-- celui qui coche « Prévenir le cercle » : si elle cède, il a livré son coin en croyant
-- seulement dire que ça sort.
--
-- Les mailles du décor sont à Paris, hors de toute emprise réelle : le test tourne aussi bien
-- sur une base vide (CI) que sur une base locale chargée, sans collision d'index.

begin;
create extension if not exists pgtap with schema extensions;

set local session_replication_role = replica;
delete from public.profiles;
delete from auth.users;
set local session_replication_role = origin;
select plan(16);

-- --------------------------------------------------------------------------
-- Le parent H3, calculé en SQL, doit rendre exactement ce que rend h3-js.
-- --------------------------------------------------------------------------

select is(public.h3_parent('893960056a3ffff', 7), '873960056ffffff', 'h3_parent : résolution 7, comme h3-js');
select is(public.h3_parent('893960056a3ffff', 6), '863960057ffffff', 'h3_parent : résolution 6, comme h3-js');
select is(public.h3_parent('8939602b5a7ffff', 5), '8539602bfffffff', 'h3_parent : résolution 5, comme h3-js');
select is(public.h3_parent('891fb46624bffff', 4), '841fb47ffffffff', 'h3_parent : résolution 4, comme h3-js');
select is(public.h3_parent('861fb4667ffffff', 9), '861fb4667ffffff', 'h3_parent : une résolution plus fine rend la maille telle quelle');

-- --------------------------------------------------------------------------
-- Décor : deux mailles, dont une masquée, et trois comptes.
-- --------------------------------------------------------------------------

insert into public.cells (h3_index, dept, centroid, restricted) values
  ('891fb46624bffff', '75', 'SRID=4326;POINT(2.3496697 48.8516019)', false),
  ('891fb460313ffff', '92', 'SRID=4326;POINT(2.2004860 48.8000062)', true);

select tests.create_user('admin@mycelio.test',    'Adrien') as ad \gset
select tests.create_user('ecriture@mycelio.test', 'Manon')  as me \gset
select tests.create_user('autre@mycelio.test',    'Marc')   as au \gset
select tests.set_role(:'me'::uuid, 'ecriture');
select tests.set_role(:'au'::uuid, 'ecriture');

insert into public.outings (id, user_id, occurred_on, h3_index, location, found_nothing, visibility, notes)
values
  -- Privée : n'existe pour personne d'autre, pas même en signal.
  ('a0000000-0000-0000-0000-000000000001', :'me'::uuid, current_date,      '891fb46624bffff', null, false, 'private', 'mon coin secret'),
  -- Signalée, avec une trouvaille : le cas nominal.
  ('a0000000-0000-0000-0000-000000000002', :'me'::uuid, current_date - 2,  '891fb46624bffff', null, false, 'signal',  'sous les fougères'),
  -- Partagée et bredouille : partager entièrement vaut aussi signal.
  ('a0000000-0000-0000-0000-000000000003', :'me'::uuid, current_date - 1,  '891fb46624bffff', null, true,  'shared',  'rien'),
  -- Signalée, mais d'une autre poussée : hors fenêtre.
  ('a0000000-0000-0000-0000-000000000004', :'me'::uuid, current_date - 40, '891fb46624bffff', null, false, 'signal',  'vieux'),
  -- Signalée à la géolocalisation, sans maille : rattachée à la plus proche.
  ('a0000000-0000-0000-0000-000000000005', :'me'::uuid, current_date,      null, 'SRID=4326;POINT(2.3505 48.8520)', true, 'signal', null),
  -- Signalée dans une maille masquée : aucun signal.
  ('a0000000-0000-0000-0000-000000000006', :'me'::uuid, current_date,      '891fb460313ffff', null, false, 'signal',  'réserve');

insert into public.finds (outing_id, species_id, quantity_g)
values ('a0000000-0000-0000-0000-000000000002',
        (select id from public.species where slug = 'cepe-de-bordeaux'), 600);

-- --------------------------------------------------------------------------
-- Un autre compte : rien par la table, le secteur par la fonction.
-- --------------------------------------------------------------------------

select tests.authenticate_as(:'au'::uuid);

select is(
  (select count(*)::int from public.outings where visibility = 'signal'),
  0,
  'Une sortie signalée est illisible par la table pour un autre compte'
);

select is(
  (select count(*)::int from public.finds),
  0,
  'La trouvaille d''une sortie signalée reste illisible par la table'
);

select is(
  (select count(*)::int from public.circle_signals()),
  3,
  'Trois signaux : signalée, partagée et géolocalisée — ni la privée, ni la périmée, ni la masquée'
);

select is(
  (select array_agg(distinct zone) from public.circle_signals()),
  array['861fb4667ffffff'],
  'Tous les signaux sortent au secteur de résolution 6, jamais à la maille'
);

select is(
  (select species_ids from public.circle_signals() where found),
  array[(select id from public.species where slug = 'cepe-de-bordeaux')],
  'L''espèce trouvée accompagne le signal'
);

select is(
  (select count(*)::int from public.circle_signals() where found = false),
  2,
  'Les bredouilles signalées comptent comme des signaux'
);

select ok(
  not exists (select 1 from public.circle_signals() where mine),
  'Rien ne désigne l''auteur : pour un autre compte, aucun signal n''est « le sien »'
);

-- --------------------------------------------------------------------------
-- L'auteur, lui, reconnaît les siens.
-- --------------------------------------------------------------------------

reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;
select tests.authenticate_as(:'me'::uuid);

select is(
  (select count(*)::int from public.circle_signals() where mine),
  3,
  'L''auteur voit ses propres signaux marqués comme siens'
);

-- --------------------------------------------------------------------------
-- La finesse du secteur se règle dans app_settings.
-- --------------------------------------------------------------------------

reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;
set local session_replication_role = replica;
update public.app_settings set value = '5'::jsonb where key = 'map.circle_resolution';
set local session_replication_role = origin;
select tests.authenticate_as(:'au'::uuid);

select is(
  (select array_agg(distinct zone) from public.circle_signals()),
  array['851fb467fffffff'],
  'À la résolution 5, le secteur s''élargit'
);

-- --------------------------------------------------------------------------
-- Un compte désactivé, ou anonyme, ne reçoit rien.
-- --------------------------------------------------------------------------

reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;
set local session_replication_role = replica;
update public.profiles set is_active = false where id = :'au'::uuid;
set local session_replication_role = origin;
select tests.authenticate_as(:'au'::uuid);

select is(
  (select count(*)::int from public.circle_signals()),
  0,
  'Un compte désactivé ne reçoit aucun signal'
);

reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;
set local role anon;

select throws_ok(
  'select * from public.circle_signals()',
  '42501',
  null,
  'Un visiteur anonyme ne peut pas appeler circle_signals()'
);

select * from finish();
rollback;
