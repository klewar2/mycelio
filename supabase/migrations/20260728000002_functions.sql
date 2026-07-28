-- Mycélio — phase 1 : fonctions d'autorisation et gardes d'invariants.
--
-- Deux règles valent pour tout ce fichier :
--
-- 1. Chaque fonction SECURITY DEFINER épingle `search_path = ''` et qualifie tous ses noms.
--    Sans cela, un schéma temporaire malicieux placé en tête de search_path détourne les appels :
--    c'est le vecteur d'élévation de privilèges classique sur ce type de fonction.
--
-- 2. Les invariants qui portent sur une TRANSITION (comparer l'ancien et le nouvel état) sont des
--    triggers, jamais des politiques RLS : une politique voit soit l'ancienne ligne (USING), soit
--    la nouvelle (WITH CHECK), jamais les deux dans la même expression.


-- ---------------------------------------------------------------------------
-- Autorisation
-- ---------------------------------------------------------------------------

-- Contourne la RLS (propriétaire postgres), et peut donc être appelée DEPUIS une politique sur
-- public.profiles sans provoquer la récursion infinie classique.
create or replace function private.actor_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid()) and is_active;
$$;

revoke all on function private.actor_role() from public, anon, authenticated;

-- LA fonction d'autorisation. Le code applicatif ne teste jamais un rôle en dur : il teste une
-- permission, ici comme en TypeScript, et les deux lisent la même table role_permissions.
-- C'est ce qui donne son sens à la matrice éditable.
create or replace function public.can(perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.role_permissions rp
    where rp.role = private.actor_role()
      and rp.permission = perm
  );
$$;

grant execute on function public.can(text) to authenticated;

-- Les politiques RLS ne peuvent pas appeler private.actor_role() : elles sont évaluées avec les
-- droits de l'appelant, et `authenticated` n'a pas l'EXECUTE sur le schéma private. D'où ce
-- pendant public, qui sert à conditionner les lectures « utilisateur authentifié et actif ».
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = (select auth.uid()) and is_active
  );
$$;

grant execute on function public.is_active_user() to authenticated;


-- ---------------------------------------------------------------------------
-- Invariant : il reste toujours au moins un super_admin actif
--
-- Couvre les trois portes d'un coup — suppression, désactivation, rétrogradation — et n'a
-- délibérément AUCUNE échappatoire : elle s'applique aussi à service_role et aux sessions du
-- tableau de bord Supabase.
--
-- Effet de bord voulu : profiles.id référence auth.users on delete cascade, donc supprimer le
-- dernier super_admin depuis auth.users déclenche la cascade, cette fonction lève, et la
-- suppression de l'utilisateur Auth échoue elle aussi.
-- ---------------------------------------------------------------------------

create or replace function private.guard_last_super_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Sérialise deux rétrogradations concurrentes des deux derniers super_admins, qui verraient
  -- chacune l'autre comme « le super_admin restant » et passeraient toutes les deux.
  perform pg_advisory_xact_lock(hashtext('mycelio.super_admin_guard'));

  if old.role = 'super_admin'
     and old.is_active
     and (tg_op = 'DELETE' or new.role <> 'super_admin' or new.is_active = false)
  then
    if not exists (
      select 1 from public.profiles
      where role = 'super_admin' and is_active and id <> old.id
    ) then
      raise exception 'MYC_LAST_SUPER_ADMIN: il doit rester au moins un super_admin actif';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- Invariants relatifs à l'acteur
-- ---------------------------------------------------------------------------

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

  -- Personne ne modifie son propre rôle, super_admin compris.
  if tg_op = 'UPDATE' and old.id = actor_id and new.role is distinct from old.role then
    raise exception 'MYC_SELF_ROLE_CHANGE: tu ne peux pas modifier ton propre rôle';
  end if;

  -- Personne ne modifie sa propre activation. Sans cette garde, un compte désactivé encore
  -- porteur d'un jeton valide se réactiverait lui-même : la politique RLS de mise à jour de son
  -- propre profil l'y autoriserait, et actor_role() étant nul, aucune permission ne s'y oppose.
  if tg_op = 'UPDATE' and old.id = actor_id and new.is_active is distinct from old.is_active then
    raise exception 'MYC_SELF_ACTIVATION: tu ne peux pas modifier ta propre activation';
  end if;

  -- Seul un super_admin gère un super_admin, ou nomme quelqu'un à ce rôle.
  if actor is distinct from 'super_admin' then
    if tg_op in ('UPDATE', 'DELETE') and old.role = 'super_admin' then
      raise exception 'MYC_SUPER_ADMIN_PROTECTED: seul un super_admin peut gérer un super_admin';
    end if;
    if tg_op in ('INSERT', 'UPDATE') and new.role = 'super_admin' then
      raise exception 'MYC_SUPER_ADMIN_PROTECTED: seul un super_admin peut nommer un super_admin';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- Création de compte
--
-- Il n'existe aucune inscription publique (enable_signup = false dans config.toml) : les comptes
-- sont créés par un administrateur via auth.admin.createUser.
--
-- Or cet appel passe par service_role, qui n'a pas d'auth.uid() : les gardes ci-dessus y sont
-- désarmées. Si le rôle voulu était lu depuis raw_user_meta_data, n'importe quel admin pourrait
-- donc se fabriquer un super_admin.
--
-- D'où la règle absolue appliquée ici : CETTE FONCTION NE LIT JAMAIS LE RÔLE DEPUIS LES
-- MÉTADONNÉES. Elle attribue super_admin au tout premier compte (l'amorçage d'une instance
-- vierge), et viewer à tous les autres. L'élévation est ensuite un UPDATE séparé, effectué avec
-- la session de l'administrateur, qui traverse donc les gardes avec un vrai acteur.
-- ---------------------------------------------------------------------------

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_role public.app_role;
begin
  -- Sérialise deux créations simultanées sur une instance vierge, qui produiraient deux super_admins.
  perform pg_advisory_xact_lock(hashtext('mycelio.first_user'));

  if not exists (select 1 from public.profiles) then
    new_role := 'super_admin';
  else
    new_role := 'viewer';
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


-- ---------------------------------------------------------------------------
-- Journal d'audit
-- ---------------------------------------------------------------------------

create or replace function private.write_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_new jsonb := to_jsonb(new);
  row_old jsonb := to_jsonb(old);
  ref     text;
begin
  ref := coalesce(
    row_new ->> 'id', row_old ->> 'id',
    row_new ->> 'key', row_old ->> 'key',
    row_new ->> 'slug', row_old ->> 'slug',
    concat_ws('.', coalesce(row_new ->> 'role', row_old ->> 'role'),
                   coalesce(row_new ->> 'permission', row_old ->> 'permission'))
  );

  insert into public.audit_log (actor_id, action, target, payload)
  values (
    (select auth.uid()),
    tg_table_name || '.' || lower(tg_op),
    ref,
    jsonb_build_object('old', row_old, 'new', row_new)
  );

  return coalesce(new, old);
end;
$$;

-- L'absence de politique RLS suffit à bloquer `authenticated`, mais pas `service_role`, qui
-- contourne la RLS entièrement. Ce trigger rend le journal immuable pour tout le monde.
create or replace function private.block_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'MYC_AUDIT_IMMUTABLE: le journal d''audit ne peut être ni modifié ni supprimé';
end;
$$;


-- ---------------------------------------------------------------------------
-- Anti-auto-verrouillage de la matrice de droits
--
-- Le cahier des charges veut la matrice « éditable » par le super_admin. Prise au pied de la
-- lettre, cette liberté lui permet de retirer à son propre rôle la permission d'éditer la
-- matrice — et de condamner définitivement l'administration des droits, sans recours par l'UI.
-- On restreint donc « éditable » sur ces quelques clés, et l'UI les rend verrouillées.
-- ---------------------------------------------------------------------------

create or replace function private.guard_permission_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'super_admin'
     and old.permission in ('admin.access', 'admin.roles.manage', 'admin.users.manage', 'admin.audit.view')
  then
    raise exception 'MYC_PERMISSION_LOCKED: % est indispensable au super_admin et ne peut pas lui être retirée',
      old.permission;
  end if;
  return old;
end;
$$;


-- ---------------------------------------------------------------------------
-- Validation des paramètres applicatifs
--
-- Le formulaire d'administration étant généré depuis la table, c'est ici — et non côté front —
-- que se trouve la vérité sur ce qu'est une valeur acceptable.
-- ---------------------------------------------------------------------------

create or replace function private.validate_setting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  elem jsonb;
begin
  -- La forme d'un paramètre appartient aux migrations, pas à l'API.
  if new.key is distinct from old.key
     or new.value_type is distinct from old.value_type
     or new.category is distinct from old.category then
    raise exception 'MYC_SETTING_SHAPE_LOCKED: seule la valeur d''un paramètre est modifiable';
  end if;

  case new.value_type
    when 'number' then
      if jsonb_typeof(new.value) <> 'number' then
        raise exception 'MYC_SETTING_TYPE: % attend un nombre', new.key;
      end if;
      if new.min_value is not null and (new.value)::numeric < new.min_value then
        raise exception 'MYC_SETTING_RANGE: % doit être au moins %', new.key, new.min_value;
      end if;
      if new.max_value is not null and (new.value)::numeric > new.max_value then
        raise exception 'MYC_SETTING_RANGE: % doit être au plus %', new.key, new.max_value;
      end if;

    when 'boolean' then
      if jsonb_typeof(new.value) <> 'boolean' then
        raise exception 'MYC_SETTING_TYPE: % attend un booléen', new.key;
      end if;

    when 'string' then
      if jsonb_typeof(new.value) <> 'string' then
        raise exception 'MYC_SETTING_TYPE: % attend une chaîne', new.key;
      end if;

    when 'enum' then
      if new.options is null or not (new.options ? (new.value #>> '{}')) then
        raise exception 'MYC_SETTING_ENUM: % n''est pas une valeur admise pour %',
          new.value #>> '{}', new.key;
      end if;

    when 'range' then
      if jsonb_typeof(new.value) <> 'array' or jsonb_array_length(new.value) <> 2 then
        raise exception 'MYC_SETTING_TYPE: % attend un intervalle [min, max]', new.key;
      end if;
      for elem in select * from jsonb_array_elements(new.value) loop
        if jsonb_typeof(elem) <> 'number' then
          raise exception 'MYC_SETTING_TYPE: les bornes de % doivent être des nombres', new.key;
        end if;
      end loop;
      if (new.value -> 0)::numeric > (new.value -> 1)::numeric then
        raise exception 'MYC_SETTING_RANGE: les bornes de % sont inversées', new.key;
      end if;
      if new.min_value is not null and (new.value -> 0)::numeric < new.min_value then
        raise exception 'MYC_SETTING_RANGE: % descend sous %', new.key, new.min_value;
      end if;
      if new.max_value is not null and (new.value -> 1)::numeric > new.max_value then
        raise exception 'MYC_SETTING_RANGE: % dépasse %', new.key, new.max_value;
      end if;

    when 'json' then
      null;  -- toute valeur jsonb convient par définition
  end case;

  new.updated_by := (select auth.uid());
  new.updated_at := now();
  return new;
end;
$$;
