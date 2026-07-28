-- Mycélio — phase 1 : catalogue des permissions, matrice par défaut, paramètres applicatifs.
--
-- Ce sont des données de production, pas des données de confort : elles vivent donc dans une
-- migration et non dans supabase/seed.sql, qui n'est joué qu'en développement.

insert into public.permissions (key, label, category) values
  ('map.view',                'Consulter la carte',                    'carte'),
  ('finds.create',            'Enregistrer des sorties et trouvailles', 'relevés'),
  ('finds.export',            'Exporter des traces GPX',               'relevés'),
  ('admin.access',            'Accéder à l''administration',           'admin'),
  ('admin.users.manage',      'Gérer les comptes',                     'admin'),
  ('admin.roles.manage',      'Éditer la matrice des droits',          'admin'),
  ('admin.settings.manage',   'Éditer les paramètres',                 'admin'),
  ('admin.species.manage',    'Gérer les espèces',                     'admin'),
  ('admin.datasets.manage',   'Gérer les jeux de données',             'admin'),
  ('admin.pipeline.run',      'Déclencher un recalcul',                'admin'),
  ('admin.audit.view',        'Consulter le journal d''audit',         'admin');


-- Matrice par défaut. L'emboîtement viewer ⊂ member ⊂ admin ⊂ super_admin n'est pas contraint
-- en base : le super_admin peut composer ce qu'il veut. C'est simplement le point de départ.
insert into public.role_permissions (role, permission)
select 'viewer', key from public.permissions where key in ('map.view');

insert into public.role_permissions (role, permission)
select 'member', key from public.permissions
where key in ('map.view', 'finds.create', 'finds.export');

insert into public.role_permissions (role, permission)
select 'admin', key from public.permissions
where key in ('map.view', 'finds.create', 'finds.export',
              'admin.access', 'admin.users.manage', 'admin.settings.manage',
              'admin.species.manage', 'admin.datasets.manage', 'admin.pipeline.run');

insert into public.role_permissions (role, permission)
select 'super_admin', key from public.permissions;


-- ---------------------------------------------------------------------------
-- Paramètres applicatifs
--
-- L'écran /admin/settings génère son formulaire depuis cette table : ajouter une clé ici doit
-- suffire à la voir apparaître dans l'interface, sans toucher au front.
--
-- La clé access.registration_mode du cahier des charges n'existe pas : il n'y a plus
-- d'inscription du tout, publique ou sur invitation. Les comptes sont créés par un
-- administrateur, et enable_signup = false ferme le parcours GoTrue.
-- ---------------------------------------------------------------------------

insert into public.app_settings (key, value, label, description, value_type, options, min_value, max_value, category) values
  ('map.default_center', '[43.45, 1.35]'::jsonb, 'Centre par défaut',
   'Latitude et longitude au chargement de la carte.', 'json', null, null, null, 'map'),

  ('map.default_zoom', '9'::jsonb, 'Zoom par défaut',
   'Niveau de zoom au chargement.', 'number', null, 5, 16, 'map'),

  ('map.h3_resolution', '8'::jsonb, 'Résolution H3',
   'Finesse de la maille hexagonale. 8 ≈ 0,74 km², la limite du pouvoir prédictif du modèle.',
   'number', null, 6, 9, 'map'),

  ('map.opacity_range', '[0.35, 0.85]'::jsonb, 'Plage d''opacité',
   'Opacité des hexagones du score le plus bas au plus haut. Jamais 1 : le relief et les chemins doivent rester lisibles dessous.',
   'range', null, 0, 1, 'map'),

  ('scoring.rain_window_days', '14'::jsonb, 'Fenêtre de pluie (jours)',
   'Nombre de jours de cumul de précipitations pris en compte.', 'number', null, 3, 30, 'scoring'),

  ('scoring.rain_optimum_mm', '45'::jsonb, 'Pluie optimale (mm)',
   'Cumul de précipitations le plus favorable sur la fenêtre.', 'number', null, 10, 150, 'scoring'),

  ('scoring.soil_moisture_weight', '0.3'::jsonb, 'Poids de l''humidité du sol',
   'Importance de l''humidité de l''horizon 7–28 cm dans le score météo.', 'number', null, 0, 1, 'scoring'),

  ('scoring.temp_shock_weight', '0.2'::jsonb, 'Poids du choc thermique',
   'Importance de la chute d''amplitude thermique nocturne, qui déclenche la fructification.',
   'number', null, 0, 1, 'scoring'),

  ('scoring.host_match_weight', '0.5'::jsonb, 'Poids de l''essence hôte',
   'Importance de la compatibilité mycorhizienne. Élevé par nature : sans hôte compatible, pas de fructification.',
   'number', null, 0, 1, 'scoring'),

  ('scoring.forecast_horizon_days', '7'::jsonb, 'Horizon de prévision (jours)',
   'Nombre de jours projetés au-delà d''aujourd''hui.', 'number', null, 1, 14, 'scoring'),

  ('display.dark_mode_default', 'true'::jsonb, 'Mode sombre par défaut',
   'L''application se consulte à 6 h du matin dans une voiture. Le mode clair reste disponible.',
   'boolean', null, null, null, 'display'),

  ('display.show_confidence', 'true'::jsonb, 'Afficher l''indice de confiance',
   'Affiche honnêtement la fiabilité du score, y compris quand elle est basse.',
   'boolean', null, null, null, 'display');
