-- L'invariant central : il reste toujours au moins un administrateur actif.
--
-- Le cahier des charges en fait le critère de validation de la phase 1 — il l'écrivait
-- « un admin ne peut pas supprimer le dernier super_admin », avant que les quatre rôles ne
-- soient réduits à trois. La fusion admin + super_admin n'a rien retiré à l'exigence : elle a
-- seulement changé le nom du rôle qu'on ne peut pas faire disparaître.
--
-- On vérifie les trois portes — suppression, rétrogradation, désactivation — et surtout
-- qu'aucun acteur ne passe, y compris celui qui n'a pas d'identité (migrations, service_role),
-- pour qui les autres gardes sont désarmées.
--
-- Le trigger t10 passant avant t20, c'est bien MYC_LAST_ADMIN qui est levé ici, et non les
-- gardes de non-modification de soi : la garde la plus forte s'exprime en premier. La garde
-- « seul un administrateur gère un administrateur » est éprouvée dans 03, avec deux
-- administrateurs, pour qu'elle ne soit pas masquée par celle-ci.

begin;
create extension if not exists pgtap with schema extensions;

-- Repart d'une base sans compte : ces tests décrivent des invariants, pas l'état courant de
-- l'instance de développement. session_replication_role neutralise les triggers le temps du
-- nettoyage, sans quoi la garde du dernier administrateur l'empêcherait. Le rollback final
-- annule l'ensemble.
set local session_replication_role = replica;
delete from public.profiles;
delete from auth.users;
set local session_replication_role = origin;
select plan(9);

select tests.create_user('admin@mycelio.test',    'Adrien') as ad \gset
select tests.create_user('ecriture@mycelio.test', 'Estelle') as ed \gset
select tests.set_role(:'ed'::uuid, 'ecriture');

select is(
  (select role::text from public.profiles where id = :'ad'::uuid),
  'admin',
  'Le premier compte créé est administrateur'
);

-- --------------------------------------------------------------------------
-- Le critère de validation du cahier des charges.
--
-- L'administrateur est ici le seul en poste : c'est donc lui-même qu'il ne peut ni supprimer,
-- ni rétrograder, ni désactiver. Personne d'autre n'a `admin.users.manage`, et un compte qui
-- ne l'a pas est arrêté bien avant, par la RLS.
-- --------------------------------------------------------------------------

select tests.authenticate_as(:'ad'::uuid);

select throws_ok(
  format('delete from public.profiles where id = %L', :'ad'::uuid),
  'MYC_LAST_ADMIN: il doit rester au moins un administrateur actif',
  'Le dernier administrateur ne peut pas être supprimé'
);

select throws_ok(
  format('update public.profiles set role = ''ecriture'' where id = %L', :'ad'::uuid),
  'MYC_LAST_ADMIN: il doit rester au moins un administrateur actif',
  'Le dernier administrateur ne peut pas être rétrogradé'
);

select throws_ok(
  format('update public.profiles set is_active = false where id = %L', :'ad'::uuid),
  'MYC_LAST_ADMIN: il doit rester au moins un administrateur actif',
  'Le dernier administrateur ne peut pas être désactivé'
);

reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;

-- --------------------------------------------------------------------------
-- Sans acteur : le chemin des migrations et de service_role. Les gardes relatives à l'acteur
-- y sont désarmées, celle-ci non — c'est tout l'intérêt de la distinguer.
-- --------------------------------------------------------------------------

select throws_ok(
  format('delete from public.profiles where id = %L', :'ad'::uuid),
  'MYC_LAST_ADMIN: il doit rester au moins un administrateur actif',
  'Même sans acteur, le dernier administrateur ne peut pas être supprimé'
);

select throws_ok(
  format('update public.profiles set is_active = false where id = %L', :'ad'::uuid),
  'MYC_LAST_ADMIN: il doit rester au moins un administrateur actif',
  'Même sans acteur, le dernier administrateur ne peut pas être désactivé'
);

-- Supprimer le compte Auth déclenche la cascade sur profiles, donc la même garde. L'invariant
-- tient même en contournant complètement l'application.
select throws_ok(
  format('delete from auth.users where id = %L', :'ad'::uuid),
  'MYC_LAST_ADMIN: il doit rester au moins un administrateur actif',
  'Supprimer l''utilisateur Auth du dernier administrateur échoue aussi, par cascade'
);

-- --------------------------------------------------------------------------
-- Contre-épreuve. Sans elle, les tests ci-dessus passeraient tout aussi bien si la garde
-- refusait absolument tout — ce qui serait un bug, pas une protection.
-- --------------------------------------------------------------------------

select tests.create_user('admin2@mycelio.test', 'Amélie') as ad2 \gset
select tests.set_role(:'ad2'::uuid, 'admin');

select tests.authenticate_as(:'ad2'::uuid);

select lives_ok(
  format('update public.profiles set role = ''ecriture'' where id = %L', :'ad'::uuid),
  'Avec deux administrateurs actifs, en rétrograder un réussit'
);

select is(
  (select count(*)::int from public.profiles where role = 'admin' and is_active),
  1,
  'Il reste exactement un administrateur actif après la rétrogradation'
);

select * from finish();
rollback;
