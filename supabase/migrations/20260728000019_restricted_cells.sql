-- Masquage réglementaire des mailles protégées.
--
-- Exigence du cahier des charges : « Les hexagones intersectant une réserve biologique intégrale
-- ou un cœur de parc national doivent être masqués sur la carte, pas simplement signalés. »
--
-- Masqués, donc : les fonctions de fenêtre les excluent, la carte ne les rend pas, et on ne peut
-- pas les inspecter. Un simple bandeau d'avertissement ne suffirait pas — l'application
-- désignerait quand même un endroit où la cueillette est interdite.
--
-- La cellule reste en base : c'est le seul moyen de savoir, au rejeu suivant, qu'elle avait été
-- écartée et pourquoi. Elle est simplement invisible côté application.

alter table public.cells
  add column restricted boolean not null default false,
  -- Le nom de l'espace protégé, conservé pour pouvoir vérifier une exclusion sans relancer le
  -- pipeline — et pour répondre à « pourquoi ce coin n'apparaît pas ».
  add column restriction text;

create index cells_restricted_idx on public.cells (restricted) where restricted;

-- Catégories masquées, paramétrables.
--
-- Par défaut, exactement les deux que nomme le cahier des charges. La cueillette est aussi
-- interdite dans la plupart des réserves naturelles nationales, mais la réglementation y varie
-- d'une réserve à l'autre : ajouter « Réserve naturelle nationale » à cette liste est une
-- décision à prendre en connaissance de cause, pas un défaut à imposer.
--
-- Les valeurs correspondent au champ `nature_detaillee` de BDTOPO_V3:parc_ou_reserve.
insert into public.app_settings (key, value, label, description, value_type, category) values
  ('pipeline.restricted_categories',
   '["Réserve biologique intégrale","Cœur de parc national"]'::jsonb,
   'Espaces où la cueillette est masquée',
   'Catégories BD TOPO dont les mailles sont retirées de la carte. Modifier cette liste impose de rejouer le pipeline.',
   'json', 'pipeline');
