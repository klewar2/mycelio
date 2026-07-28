-- Carnet de sorties.
--
-- `found_nothing` est le champ le plus précieux de tout le schéma. GBIF et les bases publiques
-- ne contiennent que des PRÉSENCES : personne n'enregistre l'endroit où il n'a rien trouvé. Or
-- un modèle entraîné sur des présences seules apprend surtout où les gens se promènent. Les
-- sorties bredouilles sont de vraies absences, la donnée que personne d'autre n'a, et c'est
-- elle qui rendra la phase 7 possible.
--
-- D'où une contrainte d'interface qui découle du schéma : enregistrer une sortie vide doit être
-- aussi rapide qu'enregistrer une trouvaille. Un bouton, pas un formulaire.

create table public.outings (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  occurred_on      date not null default current_date,
  h3_index         text references public.cells(h3_index) on delete set null,
  location         extensions.geography(point, 4326),
  duration_min     int check (duration_min is null or duration_min > 0),
  found_nothing    boolean not null default false,
  -- Météo au moment de la sortie, figée : elle sert à recaler le modèle a posteriori, et les
  -- archives Open-Meteo pourraient être révisées.
  weather_snapshot jsonb,
  notes            text,
  visibility       text not null default 'private' check (visibility in ('private', 'shared')),
  created_at       timestamptz not null default now()
);

create index outings_user_idx on public.outings (user_id, occurred_on desc);
create index outings_cell_idx on public.outings (h3_index);

create table public.finds (
  id         uuid primary key default gen_random_uuid(),
  outing_id  uuid not null references public.outings(id) on delete cascade,
  species_id int references public.species(id) on delete set null,
  quantity_g int check (quantity_g is null or quantity_g >= 0),
  maturity   text check (maturity is null or maturity in ('jeune', 'optimal', 'passé')),
  photo_path text,
  location   extensions.geography(point, 4326),
  created_at timestamptz not null default now()
);

create index finds_outing_idx on public.finds (outing_id);

alter table public.outings enable row level security;
alter table public.finds   enable row level security;


-- ---------------------------------------------------------------------------
-- RLS
--
-- POINT ESSENTIEL : les admins et les super_admins ne voient PAS les relevés privés des
-- autres. Un super-pouvoir sur les comptes n'est pas un super-pouvoir sur les spots. Aucune
-- politique ci-dessous n'appelle can() — c'est délibéré, et un test pgTAP le vérifie
-- explicitement.
-- ---------------------------------------------------------------------------

create policy outings_select on public.outings
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (visibility = 'shared' and public.is_active_user())
  );

create policy outings_insert on public.outings
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can('finds.create'));

create policy outings_update on public.outings
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy outings_delete on public.outings
  for delete to authenticated
  using (user_id = (select auth.uid()));


-- Une trouvaille suit la visibilité de sa sortie : c'est la sortie qui porte la décision de
-- partage, pas chaque ligne.
create policy finds_select on public.finds
  for select to authenticated
  using (
    exists (
      select 1 from public.outings o
      where o.id = finds.outing_id
        and (o.user_id = (select auth.uid())
             or (o.visibility = 'shared' and public.is_active_user()))
    )
  );

create policy finds_write on public.finds
  for all to authenticated
  using (
    exists (select 1 from public.outings o
            where o.id = finds.outing_id and o.user_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.outings o
            where o.id = finds.outing_id and o.user_id = (select auth.uid()))
  );

grant select, insert, update, delete on public.outings to authenticated;
grant select, insert, update, delete on public.finds   to authenticated;
revoke all on public.outings from anon;
revoke all on public.finds   from anon;
