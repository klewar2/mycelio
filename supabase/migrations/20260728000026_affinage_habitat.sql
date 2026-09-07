-- Affinage du facteur habitat : la carte désignait 30 % du territoire comme « très bon coin ».
--
-- Constat sur la production, famille « Cèpes », meilleur score de la semaine du 7 septembre :
--
--   Très faibles      1 704   2,0 %
--   Faibles           8 764  10,2 %
--   Moyennes         21 462  24,9 %
--   Bonnes           28 764  33,4 %
--   TRÈS BONNES      25 443  29,5 %      ← 2 000 km² de « très bon coin »
--
-- Le README pose pourtant la règle : « un très bon coin doit rester rare, sans quoi le mot ne
-- veut plus rien dire ». Une carte qui répond « très bonnes chances » à trois mailles sur dix
-- ne dit rien de plus qu'une carte vide — elle renvoie la décision à celui qui la lit, ce qui
-- est exactement ce que l'application est censée lui épargner.
--
-- Trois causes, toutes du même ordre : le moteur n'utilisait presque rien de ce que le pipeline
-- calcule.
--
--   1. L'HÔTE GÉNÉRIQUE COMPTAIT COMME UN HÔTE. La BD Forêt classe 34 951 mailles en
--      « Feuillus » sans résoudre l'essence, et `forest.py` leur donne le jeton `feuillu` — que
--      les trois cèpes, la girolle, la trompette et la morille acceptent tous. Résultat :
--      74 102 mailles sur 86 137, soit 86 %, étaient « compatibles cèpes ». Le README annonce
--      que ce facteur « élimine 60 à 70 % de la carte » ; il en éliminait 14 %.
--
--   2. LA PART BOISÉE N'ENTRAIT PAS DANS LE SCORE, seulement dans la confiance. Une maille
--      boisée à 24 % — donc trois quarts de champ — obtenait le même score qu'une chênaie
--      pleine : 28,7 % de « très bonnes » chez les premières contre 28,6 % chez les secondes.
--      Mesuré, pas supposé.
--
--   3. QUATRE VARIABLES ÉTAIENT DÉCORATIVES. `species.thermophilic` et
--      `species.prefers_calcareous` s'éditent depuis /admin/especes et ne sont lues nulle part.
--      `cells.dist_edge_m` alimente les conseils de terrain mais pas le score, alors que la
--      fiche du cèpe de Bordeaux dit elle-même « entre 10 et 50 m du bord du peuplement ». Et
--      l'exposition — `northness`, `eastness` — ne sert qu'à l'affichage.
--
-- Cette migration ne change aucun calcul : elle donne au moteur les paramètres qui lui
-- manquaient. Les formes de courbes restent dans `pipeline/mycelio/scoring.py`, les valeurs
-- ici, éditables depuis /admin/especes et /admin/scoring. Aucune constante mycologique n'entre
-- dans le code — c'est la règle du projet, et c'est elle qui a été enfreinte par le
-- `slug == 'trompette-de-la-mort'` que la colonne `twi_optimum` vient remplacer.


-- ---------------------------------------------------------------------------
-- Deux préférences de terrain, par espèce.
-- ---------------------------------------------------------------------------

alter table public.species
  -- −1 : fuit les lisières et cherche le couvert profond. +1 : les recherche. 0 : indifférente.
  add column edge_affinity real not null default 0
    check (edge_affinity >= -1 and edge_affinity <= 1),
  -- Indice d'humidité topographique recherché. Null = indifférente, ce qui est le cas courant.
  add column twi_optimum real
    check (twi_optimum is null or (twi_optimum >= 0 and twi_optimum <= 25));

comment on column public.species.edge_affinity is
  'Attirance pour les lisières, de -1 (couvert profond) à +1 (bord de peuplement).';
comment on column public.species.twi_optimum is
  'Indice d''humidité topographique optimal. Null = l''espèce y est indifférente.';

-- Les valeurs sortent des `notes_terrain` déjà saisies pour chaque espèce — elles ne font que
-- rendre calculable ce qui n'était jusqu'ici qu'une phrase affichée dans le panneau.
update public.species set edge_affinity = case slug
  -- « Lisières et bords de chemin, entre 10 et 50 m du bord du peuplement. »
  when 'cepe-de-bordeaux'     then 0.7
  -- « Versants sud et sud-ouest, chênaies claires. »
  when 'tete-de-negre'        then 0.7
  -- « Chênaies claires, après les premières pluies d'orage. »
  when 'cepe-d-ete'           then 0.6
  -- « Jeunes plantations, lisières ensoleillées, talus. »
  when 'lactaire-delicieux'   then 0.6
  -- « Ripisylves, vergers, sols remaniés, brûlis. » — milieux de bordure par nature.
  when 'morille'              then 0.4
  -- « Fonds de vallon, litière profonde de hêtre, versants nord. » — l'inverse d'une lisière.
  when 'trompette-de-la-mort' then -0.6
  else 0
end;

update public.species set twi_optimum = case slug
  -- Fonds de vallon à indice d'humidité élevé : c'était la seule espèce que le code traitait à
  -- part, par un test sur son slug.
  when 'trompette-de-la-mort' then 9.5
  -- Ripisylves et sols frais.
  when 'morille'              then 10.0
  -- « Pentes drainées, tapis de mousse » : la girolle veut l'inverse d'un fond humide.
  when 'girolle'              then 7.0
  else null
end;


-- ---------------------------------------------------------------------------
-- Les poids correspondants, dans app_settings — donc dans /admin/scoring.
-- ---------------------------------------------------------------------------

insert into public.app_settings
  (key, value, label, description, value_type, min_value, max_value, category)
values
  ('scoring.host_generic_weight', '0.55'::jsonb,
   'Valeur d''un hôte générique',
   'Score conservé quand la BD Forêt ne donne qu''un hôte générique — « Feuillus » ou « Conifères » — sans résoudre l''essence. Ni un vrai hôte ni une absence : le peuplement PEUT être compatible, on ne le sait pas.',
   'number', 0, 1, 'scoring'),

  ('scoring.forest_share_weight', '0.5'::jsonb,
   'Poids de la part boisée',
   'Importance du taux de couvert forestier. À 0, une maille boisée à 20 % vaut une forêt pleine — ce qui était le comportement jusqu''ici.',
   'number', 0, 1, 'scoring'),

  ('scoring.edge_weight', '0.4'::jsonb,
   'Poids de la lisière',
   'Amplitude de l''effet de bordure, appliqué selon `species.edge_affinity`. Joue dans les deux sens : il pénalise le plein couvert pour un cèpe, et la lisière pour une trompette.',
   'number', 0, 1, 'scoring'),

  ('scoring.aspect_weight', '0.35'::jsonb,
   'Poids de l''exposition',
   'Amplitude de l''avantage des versants sud pour les espèces marquées thermophiles. Pondéré par la pente : sur un terrain plat, l''exposition ne veut rien dire.',
   'number', 0, 1, 'scoring'),

  ('scoring.generic_host_codes', '["feuillu","conifere"]'::jsonb,
   'Jetons d''hôte génériques',
   'Jetons produits par le pipeline quand l''essence n''est pas résolue. Ils valent `scoring.host_generic_weight` au lieu d''un appariement plein. À tenir à jour avec la table HOSTS de pipeline/mycelio/forest.py.',
   'json', null, null, 'scoring');


-- L'absence d'hôte ne coûtait que la moitié du score.
--
-- Le seul commentaire de ce paramètre disait pourtant « Élevé par nature : sans hôte
-- compatible, pas de fructification » — et il valait 0,5, c'est-à-dire qu'une maille sans aucun
-- hôte compatible gardait la moitié de son score. Maintenant que l'hôte générique a sa propre
-- valeur, celle-ci peut redevenir ce qu'elle prétendait être : un facteur presque éliminatoire.
update public.app_settings
set value = '0.85'::jsonb,
    description = 'Importance de la compatibilité mycorhizienne. Une maille sans aucun hôte compatible conserve (1 − ce poids) de son score. Éliminatoire par nature : sans hôte, pas de fructification.'
where key = 'scoring.host_match_weight';
