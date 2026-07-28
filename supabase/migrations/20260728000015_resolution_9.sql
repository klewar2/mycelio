-- Passage en résolution H3 9 : mailles de ~280 m au lieu de ~740 m.
--
-- Deux conséquences imposent des changements de schéma, pas seulement un paramètre.
--
-- 1. VOLUMÉTRIE. Une ligne par (maille, espèce, jour) donnait 838 000 lignes pour 110 Mo en
--    résolution 8. En résolution 9, avec sept fois plus de mailles, cela ferait 5,9 millions de
--    lignes et environ 770 Mo — au-delà des 500 Mo du palier gratuit Supabase. On stocke donc
--    les huit jours dans un tableau, une ligne par (maille, espèce) : 733 000 lignes.
--
--    C'est aussi la forme que consomme l'application, qui charge toujours l'horizon complet
--    pour que le curseur de jour n'appelle jamais le réseau.
--
-- 2. AFFICHAGE À PETITE ÉCHELLE. À l'échelle d'un département, 92 000 hexagones de 280 m sont
--    sous-pixel et écraseraient le navigateur. On précalcule donc le parent en résolution 7,
--    sur lequel l'API agrège quand la carte est dézoomée.

alter table public.cells add column h3_r7 text;
create index cells_r7_idx on public.cells (h3_r7);

-- L'ancienne table est reconstruite plutôt que migrée : le pipeline la remplit intégralement à
-- chaque exécution, il n'y a rien à préserver.
drop table public.forecast;

create table public.forecast (
  h3_index   text not null references public.cells(h3_index) on delete cascade,
  species_id int  not null references public.species(id) on delete cascade,
  -- Un score par jour, de J à J+7. La longueur suit scoring.forecast_horizon_days.
  scores     real[] not null,
  confidence real not null check (confidence between 0 and 1),
  run_id     uuid not null,
  primary key (h3_index, species_id)
);

create index forecast_species_idx on public.forecast (species_id);

alter table public.forecast enable row level security;

create policy forecast_select on public.forecast
  for select to authenticated
  using (public.is_active_user());

grant select on public.forecast to authenticated;
revoke all on public.forecast from anon;

update public.app_settings set value = '9'::jsonb where key = 'map.h3_resolution';
