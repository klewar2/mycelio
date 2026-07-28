-- L'invariant central de la phase 1 : il reste toujours au moins un super_admin actif.
--
-- Le cahier des charges en fait le critère de validation, et exige qu'il tienne en base et pas
-- seulement dans l'application. On vérifie donc les trois portes — suppression, rétrogradation,
-- désactivation — et surtout qu'aucun acteur ne passe, y compris celui qui n'a pas d'identité
-- (migrations, service_role), pour qui les autres gardes sont désarmées.
--
-- Le trigger t10 passant avant t20, c'est bien MYC_LAST_SUPER_ADMIN qui est levé ici : la garde
-- la plus forte s'exprime en premier, quel que soit celui qui tente l'opération. La garde
-- « seul un super_admin gère un super_admin » est éprouvée dans 03, avec deux super_admins,
-- pour qu'elle ne soit pas masquée par celle-ci.

begin;
create extension if not exists pgtap with schema extensions;

-- Repart d'une base sans compte : ces tests décrivent des invariants, pas l'état courant de
-- l'instance de développement. session_replication_role neutralise les triggers le temps du
-- nettoyage, sans quoi la garde du dernier super_admin l'empêcherait. Le rollback final annule
-- l'ensemble.
set local session_replication_role = replica;
delete from public.profiles;
delete from auth.users;
set local session_replication_role = origin;
select plan(9);

select tests.create_user('super@mycelio.test', 'Sylvie') as sa \gset
select tests.create_user('admin@mycelio.test', 'Adrien') as ad \gset
select tests.set_role(:'ad'::uuid, 'admin');

select is(
  (select role::text from public.profiles where id = :'sa'::uuid),
  'super_admin',
  'Le premier compte créé est super_admin'
);

-- --------------------------------------------------------------------------
-- Le critère de validation du cahier des charges.
-- --------------------------------------------------------------------------

select tests.authenticate_as(:'ad'::uuid);

select throws_ok(
  format('delete from public.profiles where id = %L', :'sa'::uuid),
  'MYC_LAST_SUPER_ADMIN: il doit rester au moins un super_admin actif',
  'Un admin ne peut pas supprimer le dernier super_admin'
);

select throws_ok(
  format('update public.profiles set role = ''member'' where id = %L', :'sa'::uuid),
  'MYC_LAST_SUPER_ADMIN: il doit rester au moins un super_admin actif',
  'Un admin ne peut pas rétrograder le dernier super_admin'
);

select throws_ok(
  format('update public.profiles set is_active = false where id = %L', :'sa'::uuid),
  'MYC_LAST_SUPER_ADMIN: il doit rester au moins un super_admin actif',
  'Un admin ne peut pas désactiver le dernier super_admin'
);

reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;

-- --------------------------------------------------------------------------
-- Sans acteur : le chemin des migrations et de service_role. Les gardes relatives à l'acteur
-- y sont désarmées, celle-ci non — c'est tout l'intérêt de la distinguer.
-- --------------------------------------------------------------------------

select throws_ok(
  format('delete from public.profiles where id = %L', :'sa'::uuid),
  'MYC_LAST_SUPER_ADMIN: il doit rester au moins un super_admin actif',
  'Même sans acteur, le dernier super_admin ne peut pas être supprimé'
);

select throws_ok(
  format('update public.profiles set is_active = false where id = %L', :'sa'::uuid),
  'MYC_LAST_SUPER_ADMIN: il doit rester au moins un super_admin actif',
  'Même sans acteur, le dernier super_admin ne peut pas être désactivé'
);

-- Supprimer le compte Auth déclenche la cascade sur profiles, donc la même garde. L'invariant
-- tient même en contournant complètement l'application.
select throws_ok(
  format('delete from auth.users where id = %L', :'sa'::uuid),
  'MYC_LAST_SUPER_ADMIN: il doit rester au moins un super_admin actif',
  'Supprimer l''utilisateur Auth du dernier super_admin échoue aussi, par cascade'
);

-- --------------------------------------------------------------------------
-- Contre-épreuve. Sans elle, les tests ci-dessus passeraient tout aussi bien si la garde
-- refusait absolument tout — ce qui serait un bug, pas une protection.
-- --------------------------------------------------------------------------

select tests.create_user('super2@mycelio.test', 'Serge') as sa2 \gset
select tests.set_role(:'sa2'::uuid, 'super_admin');

select lives_ok(
  format('update public.profiles set role = ''admin'' where id = %L', :'sa'::uuid),
  'Avec deux super_admins actifs, en rétrograder un réussit'
);

select is(
  (select count(*)::int from public.profiles where role = 'super_admin' and is_active),
  1,
  'Il reste exactement un super_admin actif après la rétrogradation'
);

select * from finish();
rollback;
