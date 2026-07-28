# pipeline

Pipeline géospatial Python — **phase 2 et suivantes**. Rien ici n'est déployé avec l'application web.

Le cahier des charges impose qu'aucun calcul géospatial ne se fasse au runtime : tout est précalculé
ici, hors ligne, puis chargé dans Supabase. Si un `import rasterio` ou `import shapely` apparaît un
jour dans `apps/web`, c'est une erreur d'architecture.

Contenu prévu :

- `ingest/` — BD Forêt, RGE ALTI, SoilGrids, GBIF
- `features/` — construction de la table `cells` (H3 résolution 8)
- `train/` — LightGBM, validation en blocs spatiaux
- `score/` — inférence quotidienne
- `models/` — modèles versionnés (< 10 Mo)
