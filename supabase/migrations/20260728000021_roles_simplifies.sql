-- Mycélio — simplification des rôles : quatre deviennent trois.
--
--   viewer      → lecture    consulter la carte
--   member      → ecriture   + carnet de sorties, export GPX
--   admin    ┐
--   super_admin┘ → admin     + comptes, droits, paramètres, espèces, journal
--
-- La distinction admin / super_admin n'avait de sens que dans une équipe où l'on délègue
-- l'administration courante sans céder le contrôle des droits. Ici il n'y a qu'un
-- administrateur : elle ne protégeait de personne et se payait d'un écran de plus à comprendre.
--
-- Ce qui NE change pas : la matrice `role_permissions` reste la seule source de vérité, et le
-- code continue de tester une permission, jamais un rôle. Seul le nombre de colonnes diminue.
--
-- Postgres ne sait pas retirer une valeur d'une énumération, et la fusion admin + super_admin
-- en produirait de toute façon des doublons dans role_permissions. On remplace donc le type,
-- ce qui impose de démonter puis remonter tout ce qui en dépend : index partiels, fonctions
-- typées, gardes.


-- ---------------------------------------------------------------------------
-- 1. Fusion des droits, avant la conversion du type
--
-- L'admin unique hérite de l'UNION des deux anciens rôles, jamais de l'intersection : la
-- fusion ne doit retirer aucun pouvoir à celui qui les avait tous.
-- ---------------------------------------------------------------------------

-- Les triggers de garde et d'audit sont écrits pour des mutations métier. Ici on convertit un
-- schéma : les laisser tourner ferait lever la garde du dernier super_admin au milieu de la
-- migration, et noierait le journal d'audit sous une ligne par profil et par permission.
alter table public.profiles disable trigger user;
alter table public.role_permissions disable trigger user;

insert into public.role_permissions (role, permission)
select 'admin', rp.permission
from public.role_permissions rp
where rp.role = 'super_admin'
on conflict (role, permission) do nothing;

delete from public.role_permissions where role = 'super_admin';


-- ---------------------------------------------------------------------------
-- 2. Remplacement du type énuméré
-- ---------------------------------------------------------------------------

-- Le prédicat de cet index nomme une valeur de l'ancienne énumération : il bloque la conversion.
drop index public.profiles_active_super_admin_idx;

-- Ces deux fonctions sont typées par l'énumération et empêcheraient de la supprimer. On ne peut
-- pas les remplacer par `create or replace` : leur signature change de type sous-jacent.
drop function private.actor_role();
drop function tests.set_role(uuid, public.app_role);

alter type public.app_role rename to app_role_v1;
create type public.app_role as enum ('lecture', 'ecriture', 'admin');

alter table public.profiles alter column role drop default;

alter table public.profiles
  alter column role type public.app_role
  using (
    case role::text
      when 'viewer' then 'lecture'
      when 'member' then 'ecriture'
      else 'admin'          -- admin et super_admin fusionnent
    end
  )::public.app_role;

alter table public.profiles alter column role set default 'lecture';

alter table public.role_permissions
  alter column role type public.app_role
  using (
    case role::text
      when 'viewer' then 'lecture'
      when 'member' then 'ecriture'
      else 'admin'
    end
  )::public.app_role;

drop type public.app_role_v1;

-- La garde du dernier admin compte les admins actifs à chaque mutation de profil.
create index profiles_active_admin_idx
  on public.profiles (role)
  where role = 'admin' and is_active;


-- ---------------------------------------------------------------------------
-- 3. Fonctions typées, reconstruites à l'identique
-- ---------------------------------------------------------------------------

create function private.actor_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid()) and is_active;
$$;

revoke all on function private.actor_role() from public, anon, authenticated;

create function tests.set_role(p_user_id uuid, p_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set role = p_role where id = p_user_id;
end;
$$;

revoke all on function tests.set_role(uuid, public.app_role) from anon, authenticated;


-- ---------------------------------------------------------------------------
-- 4. Gardes : mêmes invariants, sur le rôle `admin`
-- ---------------------------------------------------------------------------

-- Il reste toujours au moins un admin actif. Couvre les trois portes d'un coup — suppression,
-- désactivation, rétrogradation — et n'a délibérément AUCUNE échappatoire : elle s'applique
-- aussi à service_role et aux sessions du tableau de bord Supabase.
--
-- Effet de bord voulu : profiles.id référence auth.users on delete cascade, donc supprimer le
-- dernier admin depuis auth.users déclenche la cascade, cette fonction lève, et la suppression
-- de l'utilisateur Auth échoue elle aussi.
create or replace function private.guard_last_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Sérialise deux rétrogradations concurrentes des deux derniers admins, qui verraient chacune
  -- l'autre comme « l'admin restant » et passeraient toutes les deux.
  perform pg_advisory_xact_lock(hashtext('mycelio.admin_guard'));

  if old.role = 'admin'
     and old.is_active
     and (tg_op = 'DELETE' or new.role <> 'admin' or new.is_active = false)
  then
    if not exists (
      select 1 from public.profiles
      where role = 'admin' and is_active and id <> old.id
    ) then
      raise exception 'MYC_LAST_ADMIN: il doit rester au moins un administrateur actif';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger t10_guard_last_super_admin on public.profiles;
drop function private.guard_last_super_admin();

create trigger t10_guard_last_admin
  before update or delete on public.profiles
  for each row execute function private.guard_last_admin();


-- Gardes relatives à l'acteur.
--
-- « Seul un admin gère un admin » peut sembler redondant maintenant que `admin.users.manage`
-- n'est accordée qu'à l'admin. Elle ne l'est pas : la matrice est éditable, et le jour où
-- `admin.users.manage` est accordée à `ecriture`, cette garde reste seule à empêcher un compte
-- en écriture de nommer un complice administrateur.
create or replace function private.guard_profile_mutations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor    public.app_role;
begin
  -- Migrations, seed et trigger de création de compte s'exécutent sans acteur : ces gardes,
  -- qui sont relatives à l'acteur, n'ont alors rien à comparer.
  --
  -- CONTREPARTIE IMPÉRATIVE CÔTÉ APPLICATION : le client service_role ne sert QU'aux opérations
  -- auth.admin.*, jamais à écrire dans public.*. Toute écriture métier passe par le client
  -- porteur de la session utilisateur, sans quoi ces gardes sont silencieusement désarmées.
  if actor_id is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  actor := private.actor_role();

  -- Personne ne modifie son propre rôle, administrateur compris.
  if tg_op = 'UPDATE' and old.id = actor_id and new.role is distinct from old.role then
    raise exception 'MYC_SELF_ROLE_CHANGE: tu ne peux pas modifier ton propre rôle';
  end if;

  -- Personne ne modifie sa propre activation. Sans cette garde, un compte désactivé encore
  -- porteur d'un jeton valide se réactiverait lui-même : la politique RLS de mise à jour de son
  -- propre profil l'y autoriserait, et actor_role() étant nul, aucune permission ne s'y oppose.
  if tg_op = 'UPDATE' and old.id = actor_id and new.is_active is distinct from old.is_active then
    raise exception 'MYC_SELF_ACTIVATION: tu ne peux pas modifier ta propre activation';
  end if;

  -- Seul un administrateur gère un administrateur, ou nomme quelqu'un à ce rôle.
  if actor is distinct from 'admin' then
    if tg_op in ('UPDATE', 'DELETE') and old.role = 'admin' then
      raise exception 'MYC_ADMIN_PROTECTED: seul un administrateur peut gérer un administrateur';
    end if;
    if tg_op in ('INSERT', 'UPDATE') and new.role = 'admin' then
      raise exception 'MYC_ADMIN_PROTECTED: seul un administrateur peut nommer un administrateur';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;


-- Création de compte : le premier compte d'une instance vierge devient administrateur, tous les
-- autres sont créés en lecture.
--
-- LA RÈGLE NE CHANGE PAS : cette fonction ne lit JAMAIS le rôle depuis raw_user_meta_data.
-- auth.admin.createUser passe par service_role, qui n'a pas d'auth.uid() : les gardes relatives
-- à l'acteur y sont désarmées, donc un rôle lu depuis les métadonnées permettrait à n'importe
-- quel appelant de se fabriquer un administrateur. L'élévation est un UPDATE séparé, effectué
-- avec la session de l'administrateur, qui traverse les gardes sous une vraie identité.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_role public.app_role;
begin
  -- Sérialise deux créations simultanées sur une instance vierge, qui produiraient deux admins.
  perform pg_advisory_xact_lock(hashtext('mycelio.first_user'));

  if not exists (select 1 from public.profiles) then
    new_role := 'admin';
  else
    new_role := 'lecture';
  end if;

  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      split_part(new.email, '@', 1)
    ),
    new_role
  );

  return new;
end;
$$;


-- Anti-auto-verrouillage de la matrice : l'administrateur ne peut pas se retirer les clés qui
-- lui permettent d'administrer, faute de quoi l'application deviendrait définitivement
-- inadministrable sans accès SQL direct.
create or replace function private.guard_permission_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'admin'
     and old.permission in ('admin.access', 'admin.roles.manage', 'admin.users.manage', 'admin.audit.view')
  then
    raise exception 'MYC_PERMISSION_LOCKED: % est indispensable à l''administrateur et ne peut pas lui être retirée',
      old.permission;
  end if;
  return old;
end;
$$;


alter table public.profiles enable trigger user;
alter table public.role_permissions enable trigger user;
