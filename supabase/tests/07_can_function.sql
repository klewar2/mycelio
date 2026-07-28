-- public.can() — l'unique point d'autorisation.
--
-- Le dernier test de ce fichier est le plus important du dépôt sur ce sujet : il vérifie qu'un
-- droit change de valeur quand on modifie la matrice, sans redéploiement ni migration. C'est la
-- preuve qu'aucun rôle n'est codé en dur, ni ici ni dans les politiques qui appellent can().

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

select tests.create_user('super@mycelio.test',  'Sylvie') as sa \gset
select tests.create_user('admin@mycelio.test',  'Adrien') as ad \gset
select tests.create_user('viewer@mycelio.test', 'Valérie') as vw \gset
select tests.set_role(:'ad'::uuid, 'admin');

-- --------------------------------------------------------------------------
-- Chaque rôle a exactement les droits que la matrice lui donne.
-- --------------------------------------------------------------------------

select tests.authenticate_as(:'vw'::uuid);

select ok(public.can('map.view'),            'Un viewer consulte la carte');
select ok(not public.can('finds.create'),    'Un viewer n''enregistre pas de trouvaille');
select ok(not public.can('admin.access'),    'Un viewer n''accède pas à l''administration');
select ok(not public.can('clé.inexistante'), 'Une clé inconnue ne donne aucun droit');

reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;
select tests.authenticate_as(:'ad'::uuid);

select ok(public.can('admin.users.manage'),      'Un admin gère les comptes');
select ok(not public.can('admin.roles.manage'),  'Un admin n''édite pas la matrice des droits');
select ok(not public.can('admin.audit.view'),    'Un admin ne consulte pas le journal d''audit');

-- --------------------------------------------------------------------------
-- La matrice est réellement paramétrable.
-- --------------------------------------------------------------------------

reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;
select tests.authenticate_as(:'sa'::uuid);

insert into public.role_permissions (role, permission) values ('viewer', 'finds.create');

reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;
select tests.authenticate_as(:'vw'::uuid);

select ok(
  public.can('finds.create'),
  'Le viewer obtient finds.create dès que le super_admin le lui accorde'
);

-- Et un compte désactivé perd tout, quel que soit son rôle.
reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;
update public.profiles set is_active = false where id = :'ad'::uuid;
select tests.authenticate_as(:'ad'::uuid);

select ok(
  not public.can('admin.users.manage'),
  'Un compte désactivé perd immédiatement ses droits'
);

select * from finish();
rollback;
