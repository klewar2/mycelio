-- Création de compte.
--
-- Il n'y a plus d'inscription : les comptes sont créés par un administrateur via
-- auth.admin.createUser, donc à travers service_role, qui n'a pas d'auth.uid(). Les gardes
-- relatives à l'acteur y sont désarmées.
--
-- Ce fichier vérifie la fermeture de ce trou : le trigger de création ne lit JAMAIS le rôle
-- depuis les métadonnées. Sans cela, quiconque atteint service_role se fabriquerait un
-- administrateur en glissant `role` dans les métadonnées de l'utilisateur qu'il crée.

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
select plan(6);

select tests.create_user('admin@mycelio.test', 'Adrien') as ad \gset

select is(
  (select role::text from public.profiles where id = :'ad'::uuid),
  'admin',
  'Sur une base vierge, le premier compte devient administrateur'
);

select is(
  (select display_name from public.profiles where id = :'ad'::uuid),
  'Adrien',
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
  '{"display_name":"Pirate","role":"admin"}'::jsonb,
  false
);

select is(
  (select role::text from public.profiles where id = :'pirate'::uuid),
  'lecture',
  'Un rôle réclamé dans les métadonnées est ignoré : tout compte suivant naît en lecture'
);

select is(
  (select count(*)::int from public.profiles where role = 'admin'),
  1,
  'Aucun second administrateur n''a pu être fabriqué par les métadonnées'
);

-- --------------------------------------------------------------------------
-- L'élévation passe par un UPDATE séparé, sous une vraie identité, et y est donc gardée.
--
-- L'acteur est ici un compte en écriture à qui la matrice a été ouverte — le scénario détaillé
-- en 03. C'est le seul acteur qui puisse atteindre ce chemin sans être déjà administrateur, et
-- donc le seul contre lequel la garde ait encore quelque chose à prouver.
-- --------------------------------------------------------------------------

select tests.create_user('ecriture@mycelio.test', 'Estelle') as ed \gset
select tests.set_role(:'ed'::uuid, 'ecriture');
insert into public.role_permissions (role, permission) values ('ecriture', 'admin.users.manage');

select tests.authenticate_as(:'ed'::uuid);

select throws_ok(
  format('update public.profiles set role = ''admin'' where id = %L', :'pirate'::uuid),
  'MYC_ADMIN_PROTECTED: seul un administrateur peut nommer un administrateur',
  'Créer un compte ne permet pas de l''élever ensuite au rang d''administrateur'
);

-- Ce qu'il peut faire, en revanche : attribuer un rôle ordinaire. C'est exactement le parcours
-- de l'écran /admin/comptes, qui crée le compte puis lui donne son rôle.
select lives_ok(
  format('update public.profiles set role = ''ecriture'' where id = %L', :'pirate'::uuid),
  'Un rôle ordinaire peut être attribué au compte qui vient d''être créé'
);

select * from finish();
rollback;
