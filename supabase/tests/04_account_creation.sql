-- Création de compte.
--
-- Il n'y a plus d'inscription : les comptes sont créés par un administrateur via
-- auth.admin.createUser, donc à travers service_role, qui n'a pas d'auth.uid(). Les gardes
-- relatives à l'acteur y sont désarmées.
--
-- Ce fichier vérifie la fermeture de ce trou : le trigger de création ne lit JAMAIS le rôle
-- depuis les métadonnées. Sans cela, n'importe quel admin se fabriquerait un super_admin en
-- glissant `role` dans les métadonnées de l'utilisateur qu'il crée.

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
select plan(6);

select tests.create_user('super@mycelio.test', 'Sylvie') as sa \gset

select is(
  (select role::text from public.profiles where id = :'sa'::uuid),
  'super_admin',
  'Sur une base vierge, le premier compte devient super_admin'
);

select is(
  (select display_name from public.profiles where id = :'sa'::uuid),
  'Sylvie',
  'Le nom affiché est repris des métadonnées'
);

-- --------------------------------------------------------------------------
-- Le test qui ferme le trou de sécurité.
-- --------------------------------------------------------------------------

select gen_random_uuid() as pirate \gset

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin
) values (
  '00000000-0000-0000-0000-000000000000', :'pirate'::uuid, 'authenticated', 'authenticated',
  'pirate@mycelio.test', 'x', now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"Pirate","role":"super_admin"}'::jsonb,
  false
);

select is(
  (select role::text from public.profiles where id = :'pirate'::uuid),
  'viewer',
  'Un rôle réclamé dans les métadonnées est ignoré : tout compte suivant naît viewer'
);

select is(
  (select count(*)::int from public.profiles where role = 'super_admin'),
  1,
  'Aucun second super_admin n''a pu être fabriqué par les métadonnées'
);

-- --------------------------------------------------------------------------
-- L'élévation passe par un UPDATE séparé, sous une vraie identité, et y est donc gardée.
-- --------------------------------------------------------------------------

select tests.create_user('admin@mycelio.test', 'Adrien') as ad \gset
select tests.set_role(:'ad'::uuid, 'admin');

select tests.authenticate_as(:'ad'::uuid);

select throws_ok(
  format('update public.profiles set role = ''super_admin'' where id = %L', :'pirate'::uuid),
  'MYC_SUPER_ADMIN_PROTECTED: seul un super_admin peut nommer un super_admin',
  'Un admin qui crée un compte ne peut pas ensuite l''élever en super_admin'
);

-- Ce qu'il peut faire, en revanche : attribuer un rôle ordinaire. C'est exactement le parcours
-- de l'écran /admin/users, qui crée le compte puis lui donne son rôle.
select lives_ok(
  format('update public.profiles set role = ''member'' where id = %L', :'pirate'::uuid),
  'Un admin peut attribuer un rôle ordinaire au compte qu''il vient de créer'
);

select * from finish();
rollback;
