-- Optimisation des politiques RLS : envelopper les appels de fonction dans un sous-select.
--
-- `public.is_active_user()` et `public.can()` sont déclarées STABLE, mais dans une politique RLS
-- Postgres les réévalue pour CHAQUE ligne au lieu d'une fois par requête. Sur la table `cells`,
-- passée à 86 000 lignes en résolution 9, cela transformait une requête de 22 ms en près d'une
-- seconde.
--
-- La parade est connue et tient en une paire de parenthèses : `(select public.can('x'))` force
-- Postgres à évaluer l'expression en InitPlan, une seule fois pour toute la requête. On avait
-- déjà appliqué ce traitement à `auth.uid()` ; il manquait sur les fonctions d'autorisation.

drop policy if exists cells_select on public.cells;
create policy cells_select on public.cells
  for select to authenticated
  using ((select public.is_active_user()));

drop policy if exists forecast_select on public.forecast;
create policy forecast_select on public.forecast
  for select to authenticated
  using ((select public.is_active_user()));

drop policy if exists species_select on public.species;
create policy species_select on public.species
  for select to authenticated
  using ((select public.is_active_user()));

drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings
  for select to authenticated
  using ((select public.is_active_user()));

drop policy if exists permissions_select on public.permissions;
create policy permissions_select on public.permissions
  for select to authenticated
  using ((select public.is_active_user()));

drop policy if exists role_permissions_select on public.role_permissions;
create policy role_permissions_select on public.role_permissions
  for select to authenticated
  using ((select public.is_active_user()));

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.can('admin.users.manage')));

drop policy if exists outings_select on public.outings;
create policy outings_select on public.outings
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (visibility = 'shared' and (select public.is_active_user()))
  );
