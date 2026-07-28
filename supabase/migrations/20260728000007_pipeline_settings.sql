-- Emprise géographique du pipeline.
--
-- Le cahier des charges est explicite : l'emprise ne doit pas être codée en dur, mais elle ne
-- doit pas non plus être dimensionnée pour la France entière. Elle vit donc ici, comme un
-- paramètre applicatif ordinaire — éditable depuis /admin/parametres, et lu par le pipeline
-- Python au moment de construire la grille.

insert into public.app_settings (key, value, label, description, value_type, category) values
  ('pipeline.departments', '["31","81","11"]'::jsonb, 'Départements couverts',
   'Codes INSEE des départements pour lesquels la grille et les scores sont calculés. Ajouter un département impose de rejouer le pipeline complet.',
   'json', 'pipeline'),

  ('pipeline.min_forest_share', '0.2'::jsonb, 'Part boisée minimale',
   'Une maille dont le recouvrement forestier est inférieur à ce seuil est écartée de la grille : sans hôte mycorhizien, elle n''a aucun pouvoir prédictif.',
   'number', 'pipeline');

update public.app_settings
  set min_value = 0, max_value = 1
  where key = 'pipeline.min_forest_share';
