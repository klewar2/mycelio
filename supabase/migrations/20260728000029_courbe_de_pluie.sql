-- Le modèle ne savait pas dire QUAND les cèpes sortent.
--
-- Constat de terrain, octobre 2026 : trois sorties sur des mailles en « très bonnes chances »,
-- rien. L'automne venait pourtant de suivre six semaines sans pluie — 37 mm du 10 septembre au
-- 24 octobre en forêt de Bouconne, un sol à 0,16 m³/m³ —, et la carte y annonçait le maximum.
--
-- Mesure : `mycelio.backtest` rejoue la partie temporelle du score (phénologie × météo) sur
-- 462 observations datées du Sud-Ouest, 2022-2025 — trois cèpes et la girolle —, et compare
-- chaque jour de trouvaille aux autres jours de la saison au même endroit. AUC 0,58 ; 0,54
-- pour le cèpe d'été, soit une pièce jetée en l'air. Trois causes, par ordre de poids :
--
--   1. LA PLUIE SUIVAIT UNE CLOCHE centrée sur 45 mm. Elle éteignait les grosses pluies, qui
--      sont justement celles qui précèdent les poussées (113 mm au neuvième décile des jours de
--      trouvaille, noté 0,04), et laissait 0,25 à une fenêtre sans une goutte : des « bonnes
--      chances » en pleine sécheresse. La forme est corrigée dans `scoring.py` ; c'est ici le
--      sens du paramètre qui change, d'« optimum » à « suffisant ».
--
--   2. LA SAISON DU CÈPE D'ÉTÉ S'ARRÊTAIT FIN AOÛT, quand les deux tiers de ses observations
--      dans le Sud-Ouest tombent en septembre et octobre.
--
--   3. LE CÈPE DE BORDEAUX ÉTAIT RÉGLÉ SUR UN SOL TROP FROID ET TROP LARGE — 13 ± 5 °C. Choisi
--      sur trois saisons et jugé sur la quatrième, 15 ± 3 °C fait mieux les quatre fois. Même
--      exercice pour la tête de nègre : 17 ± 3 °C, gain plus modeste mais constant. Le cèpe
--      d'été, lui, préférait un optimum de 11 °C, que rien en mycologie ne soutient : on ne
--      l'a pas retenu.
--
-- Ensemble : 0,58 → 0,68 (cèpe de Bordeaux 0,62 → 0,72, tête de nègre 0,63 → 0,74, cèpe d'été
-- 0,54 → 0,69, girolle 0,55 → 0,58). C'est mieux, ce n'est pas une certitude, et l'interface
-- ne doit pas le présenter comme telle.
--
-- Chaque mise à jour ne touche que la valeur d'origine du seed : une fiche déjà retouchée depuis
-- /admin/especes est une décision de l'administrateur, et une migration n'a pas à l'écraser.


update public.app_settings
set label = 'Pluie suffisante (mm)',
    description = 'Cumul sur la fenêtre à partir duquel la pluie cesse d''être le facteur limitant. Il vaut 0,86, son double 0,98, une fenêtre sèche zéro. Sert quand une espèce n''a pas le sien.'
where key = 'scoring.rain_optimum_mm';

comment on column public.species.rain_optimum_mm is
  'Cumul de pluie sur la fenêtre à partir duquel la pluie cesse d''être limitante (courbe saturante, plus de cloche).';


update public.species set season_end_doy = 273
where slug = 'cepe-d-ete' and season_end_doy = 243;

update public.species set soil_temp_opt_c = 15, soil_temp_tol_c = 3
where slug = 'cepe-de-bordeaux' and soil_temp_opt_c = 13 and soil_temp_tol_c = 5;

update public.species set soil_temp_opt_c = 17, soil_temp_tol_c = 3
where slug = 'tete-de-negre' and soil_temp_opt_c = 16 and soil_temp_tol_c = 5;
