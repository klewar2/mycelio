-- Journal d'audit : alimenté par trigger, lisible par la seule permission d'audit, immuable.
--
-- L'immuabilité repose sur trois verrous complémentaires, et il en faut bien trois : l'absence
-- de politique arrête `authenticated` au niveau RLS, le revoke l'arrête au niveau des
-- privilèges de table, et le trigger arrête service_role, qui contourne les deux.

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
select plan(8);

select tests.create_user('admin@mycelio.test',    'Adrien')  as ad \gset
select tests.create_user('ecriture@mycelio.test', 'Estelle') as ed \gset
select tests.set_role(:'ed'::uuid, 'ecriture');

-- --------------------------------------------------------------------------
-- Le trigger écrit, et écrit juste.
-- --------------------------------------------------------------------------

select tests.authenticate_as(:'ad'::uuid);
update public.profiles set role = 'lecture' where id = :'ed'::uuid;

select is(
  (select count(*)::int from public.audit_log
   where action = 'profiles.update' and target = :'ed'
     and actor_id = :'ad'::uuid),
  1,
  'Un changement de rôle est journalisé avec le bon acteur et la bonne cible'
);

-- tests.set_role a déjà produit une entrée pour ce profil : on vise la plus récente.
select is(
  (select payload -> 'old' ->> 'role' from public.audit_log
   where action = 'profiles.update' and target = :'ed' order by id desc limit 1),
  'ecriture',
  'La charge utile conserve l''état antérieur'
);

select is(
  (select payload -> 'new' ->> 'role' from public.audit_log
   where action = 'profiles.update' and target = :'ed' order by id desc limit 1),
  'lecture',
  'La charge utile conserve le nouvel état'
);

-- --------------------------------------------------------------------------
-- Lecture : la permission d'audit, et elle seule.
-- --------------------------------------------------------------------------

reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;
select tests.authenticate_as(:'ed'::uuid);

select is(
  (select count(*)::int from public.audit_log),
  0,
  'Un compte sans la permission d''audit ne lit pas le journal'
);

-- --------------------------------------------------------------------------
-- Immuabilité, verrou par verrou.
-- --------------------------------------------------------------------------

select throws_ok(
  'insert into public.audit_log (action, target) values (''faux.evenement'', ''x'')',
  '42501', null,
  'Un utilisateur authentifié ne peut pas écrire dans le journal'
);

reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;
select tests.authenticate_as(:'ad'::uuid);

select cmp_ok(
  (select count(*)::int from public.audit_log), '>', 0,
  'Un administrateur lit le journal d''audit'
);

reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;

-- Sans acteur — le chemin de service_role, qui contourne la RLS et les privilèges de table.
-- Seul le trigger l'arrête.
select throws_ok(
  'update public.audit_log set action = ''réécrit''',
  'MYC_AUDIT_IMMUTABLE: le journal d''audit ne peut être ni modifié ni supprimé',
  'Même sans acteur, le journal ne peut pas être réécrit'
);

select throws_ok(
  'delete from public.audit_log',
  'MYC_AUDIT_IMMUTABLE: le journal d''audit ne peut être ni modifié ni supprimé',
  'Même sans acteur, le journal ne peut pas être purgé'
);

select * from finish();
rollback;
