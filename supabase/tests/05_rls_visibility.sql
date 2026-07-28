-- Visibilité et écriture sous RLS.
--
-- Nuance importante pour la lecture de ce fichier : une politique refuse une SUPPRESSION ou une
-- MISE À JOUR en ne laissant simplement aucune ligne correspondre — sans lever d'erreur. On
-- vérifie donc l'absence d'effet, pas la présence d'une exception. Une INSERTION, elle, viole
-- bien le WITH CHECK et lève.

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
select plan(12);

select tests.create_user('super@mycelio.test',  'Sylvie') as sa \gset
select tests.create_user('admin@mycelio.test',  'Adrien') as ad \gset
select tests.create_user('viewer@mycelio.test', 'Valérie') as vw \gset
select tests.set_role(:'ad'::uuid, 'admin');

insert into public.species (slug, scientific_name, common_name_fr)
values ('cepe-de-bordeaux', 'Boletus edulis', 'Cèpe de Bordeaux');

-- --------------------------------------------------------------------------
-- Un viewer ne voit que lui-même.
-- --------------------------------------------------------------------------

select tests.authenticate_as(:'vw'::uuid);

select is(
  (select count(*)::int from public.profiles),
  1,
  'Un viewer ne voit que son propre profil'
);

select lives_ok(
  'update public.profiles set display_name = ''Valérie R.'' where id = (select auth.uid())',
  'Un viewer peut modifier son propre nom affiché'
);

select is(
  (select display_name from public.profiles where id = (select auth.uid())),
  'Valérie R.',
  'La modification de son propre nom a bien pris effet'
);

-- Aucune erreur ici : la politique ne fait simplement correspondre aucune ligne.
update public.profiles set display_name = 'Piraté' where id = :'sa'::uuid;

reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;

select is(
  (select display_name from public.profiles where id = :'sa'::uuid),
  'Sylvie',
  'Un viewer ne peut pas modifier le profil d''un autre'
);

-- --------------------------------------------------------------------------
-- Un viewer n'écrit nulle part ailleurs.
-- --------------------------------------------------------------------------

select tests.authenticate_as(:'vw'::uuid);

select throws_ok(
  'insert into public.role_permissions (role, permission) values (''viewer'', ''admin.users.manage'')',
  '42501', null,
  'Un viewer ne peut pas s''accorder une permission'
);

select throws_ok(
  'insert into public.species (slug, scientific_name, common_name_fr)
   values (''girolle'', ''Cantharellus cibarius'', ''Girolle'')',
  '42501', null,
  'Un viewer ne peut pas créer une espèce'
);

update public.app_settings set value = '99'::jsonb where key = 'map.default_zoom';

reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;

select is(
  (select value from public.app_settings where key = 'map.default_zoom'),
  '9'::jsonb,
  'Un viewer ne peut pas modifier un paramètre applicatif'
);

-- --------------------------------------------------------------------------
-- Un admin voit tout le monde.
-- --------------------------------------------------------------------------

select tests.authenticate_as(:'ad'::uuid);

select is(
  (select count(*)::int from public.profiles),
  3,
  'Un admin voit tous les profils'
);

-- --------------------------------------------------------------------------
-- Validation des paramètres : la vérité est en base, pas dans le formulaire.
-- --------------------------------------------------------------------------

select throws_ok(
  'update public.app_settings set value = ''99''::jsonb where key = ''map.default_zoom''',
  'MYC_SETTING_RANGE: map.default_zoom doit être au plus 16',
  'Une valeur hors bornes est refusée'
);

select throws_ok(
  'update public.app_settings set value = ''"beaucoup"''::jsonb where key = ''map.default_zoom''',
  'MYC_SETTING_TYPE: map.default_zoom attend un nombre',
  'Une valeur du mauvais type est refusée'
);

-- --------------------------------------------------------------------------
-- Anti-auto-verrouillage de la matrice.
-- --------------------------------------------------------------------------

reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;
select tests.authenticate_as(:'sa'::uuid);

select throws_ok(
  'delete from public.role_permissions
   where role = ''super_admin'' and permission = ''admin.roles.manage''',
  'MYC_PERMISSION_LOCKED: admin.roles.manage est indispensable au super_admin et ne peut pas lui être retirée',
  'Le super_admin ne peut pas se retirer le droit d''éditer la matrice'
);

select lives_ok(
  'delete from public.role_permissions
   where role = ''member'' and permission = ''finds.export''',
  'Le super_admin peut retirer une permission ordinaire'
);

select * from finish();
rollback;
