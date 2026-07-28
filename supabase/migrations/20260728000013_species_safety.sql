-- Sécurité alimentaire : confusions dangereuses, par espèce.
--
-- L'application ne détermine JAMAIS une espèce et n'affirme JAMAIS qu'un champignon est
-- comestible. Ce champ ne sert pas à identifier : il sert à avertir de ce avec quoi l'espèce
-- recherchée se confond, pour que la vérification auprès d'un pharmacien soit faite en sachant
-- quoi regarder.
--
-- La confusion entre un cèpe et une amanite phalloïde tue. Ce texte est affiché en rouge
-- d'avertissement sur chaque fiche, sans possibilité de le masquer.

alter table public.species add column dangerous_confusions text;

update public.species set dangerous_confusions = case slug

  when 'cepe-de-bordeaux' then
    'Bolet de Satan et bolet blafard, qui provoquent de violents troubles digestifs. Au stade jeune, tout champignon à lames peut être une amanite phalloïde : vérifier la présence de tubes et non de lames.'

  when 'tete-de-negre' then
    'Bolet de Satan, qui partage les mêmes chênaies thermophiles. Chair bleuissante et pied rouge doivent faire renoncer.'

  when 'cepe-d-ete' then
    'Bolet blafard et bolet de Satan, plus fréquents en été sur les mêmes stations.'

  when 'girolle' then
    'Fausse girolle et surtout clitocybe de l''olivier, toxique, qui pousse en touffes sur souches et dont les lames sont vraies et serrées. La girolle a des plis, pas des lames.'

  when 'trompette-de-la-mort' then
    'Peu de confusions dangereuses, mais la récolte en sous-bois sombre expose à ramasser d''autres espèces sans les voir. Trier au retour, jamais dans le panier.'

  when 'lactaire-delicieux' then
    'Lactaires à lait blanc âcre, indigestes. Le lait du lactaire délicieux est orange carotte et verdit lentement.'

  when 'pied-de-mouton' then
    'Peu de confusions dangereuses grâce aux aiguillons sous le chapeau, mais ne jamais présumer : un champignon à lames n''est pas un pied-de-mouton.'

  when 'morille' then
    'Gyromitre, mortel, qui pousse à la même saison et dont le chapeau est cérébriforme et non alvéolé. Les morilles ne se consomment JAMAIS crues, ni même insuffisamment cuites.'

  else null end;

-- Avertissements transverses, affichés sur toutes les fiches. Dans app_settings pour rester
-- modifiables sans redéploiement — mais ce sont des textes de sécurité : les alléger demande
-- une bonne raison.
insert into public.app_settings (key, value, label, description, value_type, category) values
  ('safety.poison_centre', '"Centre antipoison de Toulouse — 05 61 77 74 47"'::jsonb,
   'Centre antipoison', 'Affiché sur chaque fiche espèce et en cas d''avertissement.',
   'string', 'securite'),

  ('safety.local_warning', '"Le tricholome équestre — le bidaou — traditionnellement consommé dans le Sud-Ouest, est interdit à la vente depuis 2005 : des cas de rhabdomyolyse, parfois mortels, ont été attribués à sa consommation répétée."'::jsonb,
   'Avertissement local', 'Point sensible en Occitanie, affiché sur l''écran carte.',
   'string', 'securite'),

  ('safety.legal_notice', '"En France, les champignons appartiennent au propriétaire du terrain (article 547 du Code civil), et environ 75 % de la forêt est privée. En forêt domaniale, les quantités tolérées relèvent d''arrêtés préfectoraux variables."'::jsonb,
   'Rappel légal', 'Propriété et quantités tolérées.', 'string', 'securite');
