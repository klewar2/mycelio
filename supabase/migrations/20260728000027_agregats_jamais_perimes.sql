-- Les agrégats de carte ne peuvent pas se retrouver en retard sur `forecast`.
--
-- La migration 0025 a introduit `forecast_r7`, que la vue dézoomée — donc la vue par défaut —
-- lit à la place de `forecast`. Elle a du même coup créé une possibilité neuve : que les deux
-- divergent. Le cron écrit `forecast` chaque nuit à 5 h UTC ; s'il oublie de reconstruire
-- l'agrégat, la carte sert les scores de la veille SANS QUE RIEN NE LE SIGNALE.
--
-- C'est précisément le mode de défaillance qui vient de coûter cinq semaines à ce projet : une
-- carte qui s'affiche normalement et ment. Une carte en panne se voit ; une carte périmée, non.
--
-- Le rattrapage ne peut donc pas être un appel à ajouter dans `score.py`. Un appel s'oublie —
-- en rejouant le pipeline à la main, en écrivant un script d'appoint, ou simplement parce que
-- le cron tourne le code de la branche `main` et non celui du poste de travail, ce qui est
-- exactement la situation le jour où cette migration est écrite. L'invariant descend donc en
-- base, comme les gardes de rôles (MYC_LAST_ADMIN) : la seule place où rien ne le contourne.
--
-- Effet de bord voulu : le pipeline n'a plus besoin d'être au courant. Toute version de
-- `mycelio.score`, ancienne ou nouvelle, produit des agrégats à jour.

-- ---------------------------------------------------------------------------
-- La reconstruction se scinde en deux : la grille change tous les six mois, les scores toutes
-- les nuits. Les lier obligerait à recalculer 3 837 centroïdes pour un changement de météo.
-- ---------------------------------------------------------------------------

create or replace function public.refresh_forecast_r7()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.forecast_r7;

  insert into public.forecast_r7 (h3_r7, species_id, scores, confidence)
  select c.h3_r7,
         f.species_id,
         array_remove(array[
           max(f.scores[1]), max(f.scores[2]), max(f.scores[3]), max(f.scores[4]),
           max(f.scores[5]), max(f.scores[6]), max(f.scores[7]), max(f.scores[8])
         ], null),
         max(f.confidence)
  from public.cells c
  join public.forecast f on f.h3_index = c.h3_index
  where not c.restricted and c.h3_r7 is not null
  group by c.h3_r7, f.species_id;

  analyze public.forecast_r7;
end;
$$;

revoke all on function public.refresh_forecast_r7() from public;


create or replace function public.refresh_map_aggregates()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.forecast_r7;
  delete from public.cells_r7;

  insert into public.cells_r7 (h3_r7, centroid, forest_share, essence, alt_m, n)
  select c.h3_r7,
         extensions.st_setsrid(extensions.st_makepoint(
           avg(extensions.st_x(c.centroid::extensions.geometry)),
           avg(extensions.st_y(c.centroid::extensions.geometry))
         ), 4326)::extensions.geography,
         avg(c.forest_share)::real,
         mode() within group (order by c.essence),
         avg(c.alt_m)::real,
         count(*)::integer
  from public.cells c
  where not c.restricted and c.h3_r7 is not null
  group by c.h3_r7;

  analyze public.cells_r7;

  perform public.refresh_forecast_r7();
end;
$$;

revoke all on function public.refresh_map_aggregates() from public;


-- ---------------------------------------------------------------------------
-- Le déclencheur.
--
-- Au niveau de l'INSTRUCTION et non de la ligne : le pipeline charge 689 096 lignes par COPY,
-- un déclencheur par ligne reconstruirait l'agrégat autant de fois. Ici il s'exécute une fois,
-- à la fin, dans la même transaction — donc les deux tables basculent ensemble ou pas du tout.
--
-- TRUNCATE en est volontairement absent. `score.py` fait `truncate` puis `copy` : couvrir le
-- truncate ne ferait que vider l'agrégat pour le reconstruire deux secondes plus tard. Ce qui
-- compte est l'état à la fin de la transaction, et c'est le COPY qui le fixe.
-- ---------------------------------------------------------------------------

create function public.forecast_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refresh_forecast_r7();
  return null;
end;
$$;

create trigger forecast_refresh_r7
  after insert or update or delete on public.forecast
  for each statement
  execute function public.forecast_changed();


-- Le pipeline appelait déjà `refresh_map_aggregates()` explicitement dans la version en cours
-- d'écriture ; le déclencheur rend cet appel superflu pour `forecast`. Il reste utile après une
-- reconstruction de la grille, que rien d'autre ne couvre.
comment on function public.refresh_map_aggregates() is
  'Reconstruit cells_r7 et forecast_r7. À appeler après une reconstruction de la grille ; pour les scores seuls, le déclencheur forecast_refresh_r7 s''en charge.';

-- Remise à niveau immédiate, au cas où l'agrégat serait déjà en retard au moment où cette
-- migration passe.
select public.refresh_forecast_r7();
