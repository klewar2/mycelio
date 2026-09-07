-- Confidentialité des spots.
--
-- Même exigence qu'au carnet de sorties, et un cran plus stricte : un spot n'a pas de mode
-- « partagé ». Il n'est destiné à personne d'autre qu'à celui qui l'a posé, et c'est la donnée
-- la plus sensible que l'application stocke — un coin à cèpes se garde, y compris de
-- l'administrateur.
--
-- L'acteur du test détient TOUTES les permissions de la matrice, `spots.manage` comprise. C'est
-- ce qui rend le test probant : il vérifie que la permission d'écrire ses propres spots n'a
-- jamais ouvert la lecture de ceux des autres.

begin;
create extension if not exists pgtap with schema extensions;

set local session_replication_role = replica;
delete from public.profiles;
delete from auth.users;
set local session_replication_role = origin;
select plan(8);

select tests.create_user('admin@mycelio.test',    'Adrien') as ad \gset
select tests.create_user('ecriture@mycelio.test', 'Manon')  as me \gset
select tests.create_user('autre@mycelio.test',    'Marc')   as au \gset
select tests.create_user('lecture@mycelio.test',  'Lise')   as le \gset
select tests.set_role(:'me'::uuid, 'ecriture');
select tests.set_role(:'au'::uuid, 'ecriture');
-- Lise reste en `lecture` : c'est le rôle par défaut de tout compte créé après le premier.

insert into public.spots (id, user_id, label, notes, lat, lng)
values ('33333333-3333-3333-3333-333333333333', :'me'::uuid,
        'Les chênes du Cammazes', 'Sous les grands chênes', 43.45123, 1.89345);


-- ---------------------------------------------------------------------------
-- Le propriétaire voit le sien.
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'me'::uuid);
select is((select count(*)::int from public.spots), 1, 'Manon voit son spot');


-- ---------------------------------------------------------------------------
-- Le cœur du test : l'administration ne donne aucun accès aux spots.
-- ---------------------------------------------------------------------------

reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;
select tests.authenticate_as(:'ad'::uuid);

-- Contrôle du décor : sans lui, l'assertion suivante passerait aussi bien si l'administrateur
-- avait perdu ses droits pour une raison quelconque.
select ok(
  public.can('admin.users.manage') and public.can('spots.manage'),
  'L''administrateur détient bien les permissions les plus fortes, spots.manage comprise'
);

select is(
  (select count(*)::int from public.spots),
  0,
  'L''administrateur ne voit aucun spot d''un autre compte'
);


-- ---------------------------------------------------------------------------
-- Un autre compte en écriture ne voit rien et ne supprime rien.
-- ---------------------------------------------------------------------------

reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;
select tests.authenticate_as(:'au'::uuid);

select is((select count(*)::int from public.spots), 0, 'Un autre compte ne voit pas le spot');

-- Aucune erreur : la politique ne fait simplement correspondre aucune ligne.
delete from public.spots where id = '33333333-3333-3333-3333-333333333333';

reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;

select is(
  (select count(*)::int from public.spots),
  1,
  'Le spot survit à une tentative de suppression par un autre compte'
);


-- ---------------------------------------------------------------------------
-- La permission garde l'écriture, jamais la lecture des autres.
-- ---------------------------------------------------------------------------

select tests.authenticate_as(:'le'::uuid);

select throws_ok(
  $$ insert into public.spots (user_id, label, lat, lng)
     values (auth.uid(), 'Volé', 43.4, 1.8) $$,
  '42501',
  null,
  'Un compte en lecture seule ne peut pas enregistrer de spot'
);


-- ---------------------------------------------------------------------------
-- Les bornes sont en base, pas seulement dans le formulaire : les coordonnées arrivent d'un
-- collage, donc d'un texte analysé.
-- ---------------------------------------------------------------------------

reset role;
do $$ begin perform set_config('request.jwt.claims', '', true); end $$;
select tests.authenticate_as(:'me'::uuid);

select throws_ok(
  $$ insert into public.spots (user_id, label, lat, lng)
     values (auth.uid(), 'Hors du monde', 431.45, 1.89) $$,
  '23514',
  null,
  'Une latitude hors bornes est refusée par la base'
);

select throws_ok(
  $$ insert into public.spots (user_id, label, lat, lng)
     values (auth.uid(), '   ', 43.45, 1.89) $$,
  '23514',
  null,
  'Un spot sans nom est refusé : il serait introuvable dans sa propre liste'
);

select * from finish();
rollback;
