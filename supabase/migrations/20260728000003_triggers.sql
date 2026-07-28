-- Mycélio — phase 1 : attachement des triggers.
--
-- Les noms sont préfixés d'un numéro parce que Postgres déclenche les triggers d'un même
-- événement dans l'ordre alphabétique. La garde du dernier super_admin doit passer avant les
-- gardes relatives à l'acteur : c'est l'invariant le plus fort, il doit lever en premier quel
-- que soit celui qui tente l'opération.

create trigger t10_guard_last_super_admin
  before update or delete on public.profiles
  for each row execute function private.guard_last_super_admin();

create trigger t20_guard_profile_mutations
  before insert or update or delete on public.profiles
  for each row execute function private.guard_profile_mutations();

create trigger t90_audit_profiles
  after insert or update or delete on public.profiles
  for each row execute function private.write_audit();


-- Création de compte : alimente public.profiles depuis auth.users.
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();


-- Matrice de droits
create trigger t10_guard_permission_lock
  before delete on public.role_permissions
  for each row execute function private.guard_permission_lock();

create trigger t90_audit_role_permissions
  after insert or delete on public.role_permissions
  for each row execute function private.write_audit();


-- Paramétrage applicatif
create trigger t10_validate_setting
  before update on public.app_settings
  for each row execute function private.validate_setting();

create trigger t90_audit_app_settings
  after update on public.app_settings
  for each row execute function private.write_audit();


-- Domaine mycologique
create trigger t90_audit_species
  after insert or update or delete on public.species
  for each row execute function private.write_audit();


-- Journal d'audit : immuable, y compris pour service_role qui contourne la RLS.
create trigger t00_block_audit_mutation
  before update or delete on public.audit_log
  for each row execute function private.block_audit_mutation();
