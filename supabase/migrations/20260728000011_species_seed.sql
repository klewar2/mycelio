-- Base de connaissance mycologique — les huit espèces retenues pour l'Occitanie.
--
-- Ces valeurs sont le levier de calibration principal du projet : elles sont toutes éditables
-- depuis /admin/especes, et c'est là qu'on ajustera après les premières sorties. Rien ici n'est
-- codé dans le moteur de scoring.
--
-- `host_codes` référence les jetons produits par le pipeline depuis l'essence BD Forêt :
-- chene, chene_vert, hetre, chataignier, sapin, pin, douglas, conifere, feuillu.
-- « feuillu » est l'hôte générique des peuplements que la BD Forêt ne résout pas à l'essence :
-- l'y inclure évite d'exclure à tort, au prix d'une confiance moindre.
--
-- Les fenêtres de saison sont en jour de l'année. Le moteur applique en plus une correction
-- d'altitude d'environ 7 jours par 100 m, qui n'a donc pas à être encodée ici.

insert into public.species (
  slug, scientific_name, common_name_fr, host_codes,
  ph_min, ph_max, alt_min_m, alt_max_m,
  season_start_doy, season_end_doy,
  soil_temp_opt_c, soil_temp_tol_c, rain_lag_days, rain_optimum_mm,
  prefers_calcareous, thermophilic, sort_order, notes_terrain
) values

  ('cepe-de-bordeaux', 'Boletus edulis', 'Cèpe de Bordeaux',
   '{hetre,chene,chataignier,sapin,feuillu}',
   4.5, 6.5, 100, 1600, 244, 334, 13, 5, 16, 45, false, false, 1,
   'Lisières et bords de chemin, dans la mousse, entre 10 et 50 m du bord du peuplement. La poussée suit de 12 à 20 jours un épisode de 30 à 60 mm.'),

  ('tete-de-negre', 'Boletus aereus', 'Tête de nègre',
   '{chene,chene_vert,chataignier,feuillu}',
   5.5, 7.5, 50, 800, 213, 304, 16, 5, 14, 40, false, true, 2,
   'Thermophile : versants sud et sud-ouest, chênaies claires sous 800 m. Plus précoce que le cèpe de Bordeaux.'),

  ('cepe-d-ete', 'Boletus reticulatus', 'Cèpe d''été',
   '{chene,hetre,chataignier,feuillu}',
   4.5, 7.5, 50, 1000, 152, 243, 15, 6, 12, 35, false, true, 3,
   'Chênaies claires, après les premières pluies d''orage. La plus précoce des espèces de cèpe.'),

  ('girolle', 'Cantharellus cibarius', 'Girolle',
   '{chataignier,chene,hetre,conifere,sapin,pin,feuillu}',
   4.0, 5.5, 200, 1700, 152, 304, 14, 6, 12, 40, false, false, 4,
   'Pentes drainées, tapis de mousse, sous fougère ou myrtille. Fidèle au même emplacement d''une année sur l''autre : une girolle trouvée est un point à enregistrer.'),

  ('trompette-de-la-mort', 'Craterellus cornucopioides', 'Trompette de la mort',
   '{hetre,feuillu}',
   6.0, 7.5, 200, 1400, 274, 365, 10, 4, 18, 50, true, false, 5,
   'Fonds de vallon à indice d''humidité élevé, litière profonde de hêtre, versants nord. Tardive.'),

  ('lactaire-delicieux', 'Lactarius deliciosus', 'Lactaire délicieux',
   '{pin}',
   6.5, 8.0, 50, 1600, 244, 365, 11, 5, 14, 40, true, false, 6,
   'Sous pins exclusivement. Jeunes plantations, lisières ensoleillées, talus. Sur sol calcaire.'),

  ('pied-de-mouton', 'Hydnum repandum', 'Pied-de-mouton',
   '{hetre,chene,chataignier,conifere,sapin,pin,feuillu}',
   4.5, 7.5, 100, 1600, 274, 365, 10, 6, 16, 45, false, false, 7,
   'Pousse en lignes ou en ronds. Tardif et résistant au gel léger : souvent le dernier de la saison.'),

  ('morille', 'Morchella esculenta', 'Morille',
   '{feuillu}',
   6.5, 8.0, 50, 900, 60, 151, 10, 3, 10, 30, true, false, 8,
   'Ripisylves, vergers, sols remaniés, brûlis, paillage de copeaux. Démarre quand la température du sol franchit 8 à 12 °C.');
