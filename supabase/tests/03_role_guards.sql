-- Les gardes relatives à l'acteur.
--
-- Tout le décor comporte DEUX administrateurs actifs : sans cela, la garde du dernier
-- administrateur lèverait la première et masquerait ce qu'on cherche à vérifier ici.
--
-- Ce fichier raconte les deux couches, dans l'ordre où elles se présentent à un attaquant :
-- la RLS refuse d'abord silencieusement, et si jamais la matrice venait à s'ouvrir, le trigger
-- reste seul debout. C'est précisément ce second cas qui justifie de garder MYC_ADMIN_PROTECTED
-- maintenant que `admin.users.manage` n'est accordée qu'à l'administrateur : la matrice est
-- éditable, donc cette exclusivité n'est pas un acquis.

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

select tests.create_user('admin@mycelio.test',    'Adrien')  as ad  \gset
select tests.create_user('admin2@mycelio.test',   'Amélie')  as ad2 \gset
select tests.create_user('ecriture@mycelio.test', 'Estelle') as ed  \gset
select tests.create_user('lecture@mycelio.test',  'Lucie')   as lc  \gset

select tests.set_role(:'ad2'::uuid, 'admin');
select tests.set_role(:'ed'::uuid,  'ecriture');

-- --------------------------------------------------------------------------
-- Première couche : la RLS. Un compte sans `admin.users.manage` ne voit aucune ligne à
-- modifier — la commande n'échoue pas, elle ne porte sur rien.
-- --------------------------------------------------------------------------

select tests.authenticate_as(:'ed'::uuid);

update public.profiles set display_name = 'Piraté' where id = :'ad'::uuid;

reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;

select is(
  (select display_name from public.profiles where id = :'ad'::uuid),
  'Adrien',
  'Sans droit sur les comptes, la RLS suffit à protéger le profil d''un administrateur'
);

-- --------------------------------------------------------------------------
-- Seconde couche : la matrice s'ouvre, le trigger tient.
--
-- On accorde délibérément `admin.users.manage` au rôle `ecriture`. C'est une erreur de
-- configuration plausible, et à partir de cet instant la RLS ne s'oppose plus à rien : la
-- garde en trigger est le dernier rempart.
-- --------------------------------------------------------------------------

insert into public.role_permissions (role, permission) values ('ecriture', 'admin.users.manage');

select tests.authenticate_as(:'ed'::uuid);

select throws_ok(
  format('update public.profiles set display_name = ''Piraté'' where id = %L', :'ad'::uuid),
  'MYC_ADMIN_PROTECTED: seul un administrateur peut gérer un administrateur',
  'Un compte non administrateur ne peut pas modifier un administrateur'
);

select throws_ok(
  format('delete from public.profiles where id = %L', :'ad'::uuid),
  'MYC_ADMIN_PROTECTED: seul un administrateur peut gérer un administrateur',
  'Un compte non administrateur ne peut pas supprimer un administrateur'
);

-- Le cas qui compte vraiment : ne pas pouvoir se fabriquer un complice.
select throws_ok(
  format('update public.profiles set role = ''admin'' where id = %L', :'lc'::uuid),
  'MYC_ADMIN_PROTECTED: seul un administrateur peut nommer un administrateur',
  'Un compte non administrateur ne peut promouvoir personne administrateur'
);

-- En revanche il gère bien les rôles ordinaires : la garde est ciblée, pas assommante.
select lives_ok(
  format('update public.profiles set role = ''ecriture'' where id = %L', :'lc'::uuid),
  'Un compte doté du droit sur les comptes peut attribuer un rôle ordinaire'
);

-- --------------------------------------------------------------------------
-- Personne ne se sert soi-même.
-- --------------------------------------------------------------------------

reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;
select tests.authenticate_as(:'ad'::uuid);

select throws_ok(
  format('update public.profiles set role = ''ecriture'' where id = %L', :'ad'::uuid),
  'MYC_SELF_ROLE_CHANGE: tu ne peux pas modifier ton propre rôle',
  'Un administrateur ne peut pas modifier son propre rôle'
);

select throws_ok(
  format('update public.profiles set is_active = false where id = %L', :'ad'::uuid),
  'MYC_SELF_ACTIVATION: tu ne peux pas modifier ta propre activation',
  'Un administrateur ne peut pas modifier sa propre activation'
);

-- --------------------------------------------------------------------------
-- Ce qu'un administrateur peut, lui, faire.
-- --------------------------------------------------------------------------

select lives_ok(
  format('update public.profiles set role = ''admin'' where id = %L', :'lc'::uuid),
  'Un administrateur peut nommer un autre administrateur'
);

select lives_ok(
  format('update public.profiles set role = ''ecriture'' where id = %L', :'ad2'::uuid),
  'Un administrateur peut rétrograder un autre administrateur'
);

select * from finish();
rollback;
