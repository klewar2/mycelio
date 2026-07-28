-- Scores de poussée, par maille, espèce et jour.
--
-- Volumétrie : environ 13 000 mailles × 8 espèces × 8 jours ≈ 830 000 lignes. Le cron
-- TRONQUE puis recharge à chaque exécution — aucun historique n'est conservé. Ce n'est pas une
-- négligence : garder l'historique ferait grossir la base sans limite, et le palier gratuit
-- Supabase plafonne à 500 Mo.
--
-- L'historique utile, ce sont les sorties du carnet (phase 6), pas les prévisions passées.

create table public.forecast (
  h3_index   text not null references public.cells(h3_index) on delete cascade,
  species_id int  not null references public.species(id) on delete cascade,
  -- 0 = aujourd'hui, jusqu'à l'horizon défini par scoring.forecast_horizon_days
  day_offset smallint not null,
  score      real not null check (score between 0 and 1),
  -- Confiance : basse quand une donnée manque (sol absent) ou quand la maille est loin de
  -- l'optimum connu de l'espèce. Affichée honnêtement plutôt que masquée.
  confidence real not null check (confidence between 0 and 1),
  run_id     uuid not null,
  primary key (h3_index, species_id, day_offset)
);

-- La carte interroge toujours « une espèce, un jour » : c'est cet index qui porte la requête.
create index forecast_species_day_idx on public.forecast (species_id, day_offset);

create table public.forecast_runs (
  id          uuid primary key default gen_random_uuid(),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null check (status in ('running', 'success', 'failed')),
  cells_count int,
  error       text
);

alter table public.forecast enable row level security;
alter table public.forecast_runs enable row level security;

create policy forecast_select on public.forecast
  for select to authenticated
  using (public.is_active_user());

create policy forecast_runs_select on public.forecast_runs
  for select to authenticated
  using (public.can('admin.pipeline.run'));

grant select on public.forecast to authenticated;
grant select on public.forecast_runs to authenticated;
revoke all on public.forecast from anon;
revoke all on public.forecast_runs from anon;
