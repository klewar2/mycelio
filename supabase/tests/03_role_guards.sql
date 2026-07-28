-- Les gardes relatives à l'acteur.
--
-- Tout le décor comporte DEUX super_admins actifs : sans cela, la garde du dernier super_admin
-- lèverait la première et masquerait ce qu'on cherche à vérifier ici.

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
select plan(10);

select tests.create_user('super@mycelio.test',  'Sylvie') as sa  \gset
select tests.create_user('super2@mycelio.test', 'Serge')  as sa2 \gset
select tests.create_user('admin@mycelio.test',  'Adrien') as ad  \gset
select tests.create_user('member@mycelio.test', 'Manon')  as me  \gset

select tests.set_role(:'sa2'::uuid, 'super_admin');
select tests.set_role(:'ad'::uuid,  'admin');
select tests.set_role(:'me'::uuid,  'member');

-- --------------------------------------------------------------------------
-- Un admin ne touche pas à un super_admin, et n'en fabrique pas.
-- --------------------------------------------------------------------------

select tests.authenticate_as(:'ad'::uuid);

select throws_ok(
  format('update public.profiles set display_name = ''Piraté'' where id = %L', :'sa'::uuid),
  'MYC_SUPER_ADMIN_PROTECTED: seul un super_admin peut gérer un super_admin',
  'Un admin ne peut pas modifier un super_admin'
);

select throws_ok(
  format('delete from public.profiles where id = %L', :'sa'::uuid),
  'MYC_SUPER_ADMIN_PROTECTED: seul un super_admin peut gérer un super_admin',
  'Un admin ne peut pas supprimer un super_admin'
);

-- Le cas qui compte vraiment : l'admin ne doit pas pouvoir se fabriquer un complice.
select throws_ok(
  format('update public.profiles set role = ''super_admin'' where id = %L', :'me'::uuid),
  'MYC_SUPER_ADMIN_PROTECTED: seul un super_admin peut nommer un super_admin',
  'Un admin ne peut promouvoir personne au rang de super_admin'
);

-- En revanche il gère bien les rôles inférieurs : la garde est ciblée, pas assommante.
select lives_ok(
  format('update public.profiles set role = ''viewer'' where id = %L', :'me'::uuid),
  'Un admin peut rétrograder un member en viewer'
);

-- --------------------------------------------------------------------------
-- Personne ne se sert soi-même.
-- --------------------------------------------------------------------------

select throws_ok(
  format('update public.profiles set role = ''super_admin'' where id = %L', :'ad'::uuid),
  'MYC_SELF_ROLE_CHANGE: tu ne peux pas modifier ton propre rôle',
  'Un admin ne peut pas modifier son propre rôle'
);

select throws_ok(
  format('update public.profiles set is_active = false where id = %L', :'ad'::uuid),
  'MYC_SELF_ACTIVATION: tu ne peux pas modifier ta propre activation',
  'Un admin ne peut pas modifier sa propre activation'
);

reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;

-- La garde vaut aussi pour le sommet de la hiérarchie : un super_admin ne se rétrograde pas
-- lui-même. Ici la garde du dernier super_admin ne s'applique pas, il y en a deux.
select tests.authenticate_as(:'sa'::uuid);

select throws_ok(
  format('update public.profiles set role = ''admin'' where id = %L', :'sa'::uuid),
  'MYC_SELF_ROLE_CHANGE: tu ne peux pas modifier ton propre rôle',
  'Un super_admin ne peut pas modifier son propre rôle'
);

-- --------------------------------------------------------------------------
-- Ce qu'un super_admin peut, lui, faire.
-- --------------------------------------------------------------------------

select lives_ok(
  format('update public.profiles set role = ''admin'' where id = %L', :'me'::uuid),
  'Un super_admin peut promouvoir un viewer en admin'
);

select lives_ok(
  format('update public.profiles set role = ''super_admin'' where id = %L', :'me'::uuid),
  'Un super_admin peut nommer un autre super_admin'
);

select lives_ok(
  format('update public.profiles set role = ''member'' where id = %L', :'sa2'::uuid),
  'Un super_admin peut rétrograder un autre super_admin'
);

select * from finish();
rollback;
