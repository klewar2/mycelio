-- public.can() — l'unique point d'autorisation.
--
-- L'avant-dernier test de ce fichier est le plus important du dépôt sur ce sujet : il vérifie
-- qu'un droit change de valeur quand on modifie la matrice, sans redéploiement ni migration.
-- C'est la preuve qu'aucun rôle n'est codé en dur, ni ici ni dans les politiques qui appellent
-- can() — et c'est ce qui a permis de passer de quatre rôles à trois sans réécrire une seule
-- politique RLS.

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
select plan(10);

select tests.create_user('admin@mycelio.test',    'Adrien')  as ad \gset
select tests.create_user('ecriture@mycelio.test', 'Estelle') as ed \gset
select tests.create_user('lecture@mycelio.test',  'Lucie')   as lc \gset
select tests.set_role(:'ed'::uuid, 'ecriture');

-- --------------------------------------------------------------------------
-- Chaque rôle a exactement les droits que la matrice lui donne.
-- --------------------------------------------------------------------------

select tests.authenticate_as(:'lc'::uuid);

select ok(public.can('map.view'),            'Un compte en lecture consulte la carte');
select ok(not public.can('finds.create'),    'Un compte en lecture n''enregistre pas de trouvaille');
select ok(not public.can('admin.access'),    'Un compte en lecture n''accède pas à l''administration');
select ok(not public.can('clé.inexistante'), 'Une clé inconnue ne donne aucun droit');

reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;
select tests.authenticate_as(:'ed'::uuid);

select ok(public.can('finds.create'),     'Un compte en écriture enregistre ses trouvailles');
select ok(not public.can('admin.access'), 'Un compte en écriture n''accède pas à l''administration');

reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;
select tests.authenticate_as(:'ad'::uuid);

select ok(public.can('admin.users.manage'), 'Un administrateur gère les comptes');
select ok(public.can('admin.audit.view'),   'Un administrateur consulte le journal d''audit');

-- --------------------------------------------------------------------------
-- La matrice est réellement paramétrable.
-- --------------------------------------------------------------------------

insert into public.role_permissions (role, permission) values ('lecture', 'finds.create');

reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;
select tests.authenticate_as(:'lc'::uuid);

select ok(
  public.can('finds.create'),
  'Le compte en lecture obtient finds.create dès que l''administrateur le lui accorde'
);

-- Et un compte désactivé perd tout, quel que soit son rôle.
reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;
update public.profiles set is_active = false where id = :'ed'::uuid;
select tests.authenticate_as(:'ed'::uuid);

select ok(
  not public.can('finds.create'),
  'Un compte désactivé perd immédiatement ses droits'
);

select * from finish();
rollback;
