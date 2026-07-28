-- Essence dominante et jetons d'hôte mycorhizien.
--
-- Ajoutés après coup : la première version du pipeline s'appuyait sur la BD Forêt V1, qui ne
-- porte pas d'essence normalisée. La V2 est en réalité diffusée par la Géoplateforme — le flux
-- de téléchargement en compte autant d'entrées que de V1, mais elles n'apparaissent qu'au-delà
-- de la huitième page, ce qui les avait fait manquer.
--
-- Le gain n'est pas cosmétique : la V2 distingue le châtaignier, hôte majeur du cèpe et de la
-- girolle en Occitanie, et ses millésimes sont récents (2019 sur la Haute-Garonne) là où la V1
-- reposait sur l'inventaire de 1996.

alter table public.cells
  add column essence text,
  -- Jetons d'hôte dérivés de l'essence : 'chene', 'hetre', 'chataignier', 'sapin', 'pin'…
  -- C'est ce que species.host_codes référencera, et ce sur quoi le facteur f_hote du scoring
  -- s'appuiera — un tableau, parce qu'un peuplement mixte porte plusieurs hôtes.
  add column hosts text[] not null default '{}';

-- Le facteur hôte élimine à lui seul 60 à 70 % de la carte : il sera le filtre le plus
-- sollicité du moteur de scoring.
create index cells_hosts_idx on public.cells using gin (hosts);
