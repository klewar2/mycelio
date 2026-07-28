-- Opacité des mailles : plafond abaissé.
--
-- Le cahier des charges prescrivait 0,35 à 0,85 en insistant sur « jamais 1, le relief et les
-- chemins doivent rester lisibles dessous ». À l'usage, 0,85 est déjà trop : sur les mailles les
-- mieux notées, le fond IGN disparaît — or c'est précisément là qu'on a besoin de lire les
-- chemins d'accès et le relief pour préparer une sortie.
--
-- 0,15 à 0,50 conserve un contraste net entre mailles tout en laissant le fond lisible partout.
-- Le plancher plus bas aide aussi : les mailles médiocres s'effacent, et l'œil va aux bonnes.
--
-- Valeur ajustable dans /admin/parametres sans redéploiement.

update public.app_settings
set value = '[0.15, 0.50]'::jsonb
where key = 'map.opacity_range';
