-- Mycélio — phase 1 : RLS.
--
-- RLS activée sur TOUTES les tables de public, sans exception — un test pgTAP le vérifie par
-- introspection de pg_tables, pour qu'une table ajoutée dans une phase ultérieure sans RLS
-- fasse échouer la CI plutôt que de fuiter en silence.
--
-- Aucune politique ne mentionne un nom de rôle : elles s'expriment toutes en permissions, via
-- public.can(). C'est ce qui rend la matrice réellement paramétrable — la changer en UI change
-- le comportement de la base sans redéploiement.
--
-- Absence de politique = commande refusée. C'est délibéré partout où il n'y a pas de politique
-- INSERT, UPDATE ou DELETE ci-dessous.

alter table public.profiles         enable row level security;
alter table public.permissions      enable row level security;
alter table public.role_permissions enable row level security;
alter table public.app_settings     enable row level security;
alter table public.species          enable row level security;
alter table public.audit_log        enable row level security;


-- ---------------------------------------------------------------------------
-- profiles
--
-- Un admin voit tout le monde, mais l'INSERT n'a volontairement aucune politique : les profils
-- naissent uniquement du trigger de création de compte, qui est SECURITY DEFINER.
-- ---------------------------------------------------------------------------

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.can('admin.users.manage'));

-- Un utilisateur met à jour son propre profil (nom, point de départ) ; le rôle et l'activation
-- lui restent interdits par trigger, une politique ne pouvant pas comparer ancien et nouveau.
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or public.can('admin.users.manage'))
  with check (id = (select auth.uid()) or public.can('admin.users.manage'));

create policy profiles_delete on public.profiles
  for delete to authenticated
  using (public.can('admin.users.manage'));


-- ---------------------------------------------------------------------------
-- permissions — catalogue figé, alimenté par migration uniquement.
-- ---------------------------------------------------------------------------

create policy permissions_select on public.permissions
  for select to authenticated
  using (public.is_active_user());


-- ---------------------------------------------------------------------------
-- role_permissions
--
-- Lisible par tout utilisateur actif : le client en a besoin pour connaître ses propres droits
-- et masquer ce qu'il ne peut pas faire. Il n'y a rien de secret dans une matrice de droits.
-- ---------------------------------------------------------------------------

create policy role_permissions_select on public.role_permissions
  for select to authenticated
  using (public.is_active_user());

create policy role_permissions_insert on public.role_permissions
  for insert to authenticated
  with check (public.can('admin.roles.manage'));

create policy role_permissions_delete on public.role_permissions
  for delete to authenticated
  using (public.can('admin.roles.manage'));


-- ---------------------------------------------------------------------------
-- app_settings — la forme appartient aux migrations, seule la valeur est modifiable.
-- ---------------------------------------------------------------------------

create policy app_settings_select on public.app_settings
  for select to authenticated
  using (public.is_active_user());

create policy app_settings_update on public.app_settings
  for update to authenticated
  using (public.can('admin.settings.manage'))
  with check (public.can('admin.settings.manage'));


-- ---------------------------------------------------------------------------
-- species
-- ---------------------------------------------------------------------------

create policy species_select on public.species
  for select to authenticated
  using (public.is_active_user());

create policy species_insert on public.species
  for insert to authenticated
  with check (public.can('admin.species.manage'));

create policy species_update on public.species
  for update to authenticated
  using (public.can('admin.species.manage'))
  with check (public.can('admin.species.manage'));

create policy species_delete on public.species
  for delete to authenticated
  using (public.can('admin.species.manage'));


-- ---------------------------------------------------------------------------
-- audit_log
--
-- Lecture seule, pour la seule permission d'audit. Pas de politique d'écriture : les insertions
-- passent par private.write_audit(), SECURITY DEFINER, que la RLS n'atteint pas. Le revoke
-- ci-dessous et le trigger t00_block_audit_mutation ferment les deux autres portes, celle des
-- privilèges de table et celle de service_role.
-- ---------------------------------------------------------------------------

create policy audit_log_select on public.audit_log
  for select to authenticated
  using (public.can('admin.audit.view'));

revoke insert, update, delete on public.audit_log from anon, authenticated;
revoke all on sequence public.audit_log_id_seq from anon, authenticated;


-- ---------------------------------------------------------------------------
-- Privilèges de table
--
-- La RLS filtre les lignes, elle n'accorde pas l'accès : sans GRANT, une politique permissive
-- ne sert à rien. On accorde donc à `authenticated` exactement les commandes couvertes par une
-- politique ci-dessus, et rien de plus.
--
-- `service_role` reste volontairement sans aucun droit DML sur public : le cahier des charges
-- veut qu'il ne serve qu'aux opérations auth.admin.*, et l'absence de privilège transforme
-- cette convention d'architecture en fait vérifié par la base. Les phases ultérieures lui
-- ouvriront explicitement les tables que le cron doit écrire (forecast), et elles seules.
-- ---------------------------------------------------------------------------

grant select, update, delete on public.profiles         to authenticated;
grant select                 on public.permissions      to authenticated;
grant select, insert, delete on public.role_permissions to authenticated;
grant select, update         on public.app_settings     to authenticated;
grant select, insert, update, delete on public.species  to authenticated;
grant usage, select          on public.species_id_seq   to authenticated;
grant select                 on public.audit_log        to authenticated;


-- anon n'obtient rien nulle part : il n'existe aucun parcours public dans cette application.
revoke all on public.profiles         from anon;
revoke all on public.permissions      from anon;
revoke all on public.role_permissions from anon;
revoke all on public.app_settings     from anon;
revoke all on public.species          from anon;
revoke all on public.audit_log        from anon;
