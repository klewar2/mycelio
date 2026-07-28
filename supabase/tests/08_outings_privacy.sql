-- Confidentialité du carnet de sorties.
--
-- Le cahier des charges nomme ce test : « Les admins et super_admins ne voient pas les relevés
-- privés des autres. Écrire un test qui vérifie explicitement ce point. »
--
-- La raison est simple : un super-pouvoir sur les comptes n'est pas un super-pouvoir sur les
-- spots. Un coin à cèpes se garde, y compris de l'administrateur de l'application.

begin;
create extension if not exists pgtap with schema extensions;

set local session_replication_role = replica;
delete from public.profiles;
delete from auth.users;
set local session_replication_role = origin;
select plan(9);

select tests.create_user('super@mycelio.test',  'Sylvie') as sa \gset
select tests.create_user('admin@mycelio.test',  'Adrien') as ad \gset
select tests.create_user('member@mycelio.test', 'Manon')  as me \gset
select tests.create_user('autre@mycelio.test',  'Marc')   as au \gset
select tests.set_role(:'ad'::uuid, 'admin');
select tests.set_role(:'me'::uuid, 'member');
select tests.set_role(:'au'::uuid, 'member');

-- Manon enregistre deux sorties : une privée, une partagée.
insert into public.outings (id, user_id, occurred_on, found_nothing, visibility, notes)
values
  ('11111111-1111-1111-1111-111111111111', :'me'::uuid, current_date, true,  'private', 'mon coin'),
  ('22222222-2222-2222-2222-222222222222', :'me'::uuid, current_date, false, 'shared',  'partagée');

insert into public.finds (outing_id, quantity_g)
values ('11111111-1111-1111-1111-111111111111', 800);

-- --------------------------------------------------------------------------
-- Le propriétaire voit tout ce qui est à lui.
-- --------------------------------------------------------------------------

select tests.authenticate_as(:'me'::uuid);

select is((select count(*)::int from public.outings), 2, 'Manon voit ses deux sorties');
select is((select count(*)::int from public.finds), 1, 'Manon voit sa trouvaille');

-- --------------------------------------------------------------------------
-- Le cœur du test : l'administration ne donne aucun accès aux spots.
-- --------------------------------------------------------------------------

reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;
select tests.authenticate_as(:'ad'::uuid);

select is(
  (select count(*)::int from public.outings),
  1,
  'Un admin ne voit que la sortie partagée, jamais la sortie privée'
);

select is(
  (select count(*)::int from public.outings where visibility = 'private'),
  0,
  'Aucune sortie privée n''est visible par un admin'
);

select is(
  (select count(*)::int from public.finds),
  0,
  'Un admin ne voit pas la trouvaille rattachée à une sortie privée'
);

reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;
select tests.authenticate_as(:'sa'::uuid);

select is(
  (select count(*)::int from public.outings where visibility = 'private'),
  0,
  'Le super_admin non plus ne voit pas les sorties privées des autres'
);

-- --------------------------------------------------------------------------
-- Un autre membre voit le partagé, et rien de plus.
-- --------------------------------------------------------------------------

reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;
select tests.authenticate_as(:'au'::uuid);

select is((select count(*)::int from public.outings), 1, 'Un autre membre voit la sortie partagée');

-- Aucune erreur : la politique ne fait simplement correspondre aucune ligne.
update public.outings set notes = 'piraté'
where id = '22222222-2222-2222-2222-222222222222';

reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;

select is(
  (select notes from public.outings where id = '22222222-2222-2222-2222-222222222222'),
  'partagée',
  'Une sortie partagée reste en lecture seule pour les autres'
);

-- --------------------------------------------------------------------------
-- La sortie bredouille est une donnée de plein droit, pas un cas dégradé.
-- --------------------------------------------------------------------------

select is(
  (select found_nothing from public.outings
   where id = '11111111-1111-1111-1111-111111111111'),
  true,
  'Une sortie sans trouvaille est enregistrée comme telle'
);

select * from finish();
rollback;
