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
-- nettoyage, sans quoi la garde du dernier administrateur l'empêcherait. Le rollback final
-- annule l'ensemble.
set local session_replication_role = replica;
delete from public.profiles;
delete from auth.users;
set local session_replication_role = origin;
select plan(12);

select tests.create_user('admin@mycelio.test',    'Adrien')  as ad \gset
select tests.create_user('ecriture@mycelio.test', 'Estelle') as ed \gset
select tests.create_user('lecture@mycelio.test',  'Lucie')   as lc \gset
select tests.set_role(:'ed'::uuid, 'ecriture');

-- Slug préfixé : les espèces réelles sont désormais seedées par migration, et réutiliser
-- l'un de leurs identifiants ferait échouer la contrainte d'unicité.
insert into public.species (slug, scientific_name, common_name_fr)
values ('test-espece', 'Boletus fictus', 'Espèce de test');

-- --------------------------------------------------------------------------
-- Un compte en lecture ne voit que lui-même.
-- --------------------------------------------------------------------------

select tests.authenticate_as(:'lc'::uuid);

select is(
  (select count(*)::int from public.profiles),
  1,
  'Un compte en lecture ne voit que son propre profil'
);

select lives_ok(
  'update public.profiles set display_name = ''Lucie R.'' where id = (select auth.uid())',
  'Un compte en lecture peut modifier son propre nom affiché'
);

select is(
  (select display_name from public.profiles where id = (select auth.uid())),
  'Lucie R.',
  'La modification de son propre nom a bien pris effet'
);

-- Aucune erreur ici : la politique ne fait simplement correspondre aucune ligne.
update public.profiles set display_name = 'Piraté' where id = :'ad'::uuid;

reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;

select is(
  (select display_name from public.profiles where id = :'ad'::uuid),
  'Adrien',
  'Un compte en lecture ne peut pas modifier le profil d''un autre'
);

-- --------------------------------------------------------------------------
-- Un compte en lecture n'écrit nulle part ailleurs.
-- --------------------------------------------------------------------------

select tests.authenticate_as(:'lc'::uuid);

select throws_ok(
  'insert into public.role_permissions (role, permission) values (''lecture'', ''admin.users.manage'')',
  '42501', null,
  'Un compte en lecture ne peut pas s''accorder une permission'
);

select throws_ok(
  'insert into public.species (slug, scientific_name, common_name_fr)
   values (''test-espece-2'', ''Cantharellus fictus'', ''Autre espèce de test'')',
  '42501', null,
  'Un compte en lecture ne peut pas créer une espèce'
);

update public.app_settings set value = '99'::jsonb where key = 'map.default_zoom';

reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;

select is(
  (select value from public.app_settings where key = 'map.default_zoom'),
  '9'::jsonb,
  'Un compte en lecture ne peut pas modifier un paramètre applicatif'
);

-- --------------------------------------------------------------------------
-- Un administrateur voit tout le monde.
-- --------------------------------------------------------------------------

select tests.authenticate_as(:'ad'::uuid);

select is(
  (select count(*)::int from public.profiles),
  3,
  'Un administrateur voit tous les profils'
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

select throws_ok(
  'delete from public.role_permissions
   where role = ''admin'' and permission = ''admin.roles.manage''',
  'MYC_PERMISSION_LOCKED: admin.roles.manage est indispensable à l''administrateur et ne peut pas lui être retirée',
  'L''administrateur ne peut pas se retirer le droit d''éditer la matrice'
);

select lives_ok(
  'delete from public.role_permissions
   where role = ''ecriture'' and permission = ''finds.export''',
  'L''administrateur peut retirer une permission ordinaire'
);

select * from finish();
rollback;
