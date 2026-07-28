-- Mycélio — utilitaires de test.
--
-- Ces fonctions servent aux tests pgTAP (supabase/tests/), qui doivent pouvoir créer des comptes
-- et endosser leur identité pour vérifier que la RLS et les gardes résistent réellement.
--
-- Elles vivent dans un schéma `tests` que PostgREST n'expose pas, et l'EXECUTE est retiré à anon
-- comme à authenticated : seul un accès direct à la base en superutilisateur peut les appeler.
-- Un tel acteur pourrait de toute façon écrire dans auth.users directement, donc elles
-- n'ajoutent aucune surface d'attaque.

create schema if not exists tests;
revoke all on schema tests from anon, authenticated;


-- Crée un compte Auth. Le trigger on_auth_user_created crée le profil correspondant : le tout
-- premier compte devient super_admin, tous les suivants viewer.
create or replace function tests.create_user(p_email text, p_display_name text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin
  ) values (
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
    p_email, '$2a$10$notarealhashusedonlyintests00000000000000000000000000',
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', coalesce(p_display_name, split_part(p_email, '@', 1))),
    false
  );
  return uid;
end;
$$;


-- Endosse l'identité d'un utilisateur : c'est ce qui permet de vérifier qu'une commande ÉCHOUE
-- réellement pour lui, et pas seulement que le chemin applicatif l'en empêche.
--
-- Volontairement SECURITY INVOKER : Postgres interdit de changer le paramètre `role` depuis une
-- fonction SECURITY DEFINER. Les tests s'exécutant en postgres, l'appelant a de toute façon le
-- droit d'endosser n'importe quel rôle.
create or replace function tests.authenticate_as(p_user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );
end;
$$;


-- Pour redevenir « personne », les tests utilisent directement :
--
--   reset role;
--   do $$ begin perform set_config('request.jwt.claims', '', true); end $$;
--
-- Les deux sont nécessaires : `reset role` seul laisse les claims en place, donc auth.uid()
-- continuerait de résoudre et les chemins « sans acteur » ne seraient jamais testés.


-- Attribue un rôle en contournant les gardes relatives à l'acteur, pour préparer un décor de
-- test. Légitime ici précisément parce que ces gardes ne s'appliquent qu'en présence d'un
-- auth.uid() : c'est le même chemin que les migrations.
create or replace function tests.set_role(p_user_id uuid, p_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set role = p_role where id = p_user_id;
end;
$$;


revoke all on all functions in schema tests from anon, authenticated;
