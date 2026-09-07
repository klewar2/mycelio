-- Mycélio — spots personnels : les coins qu'on repère et qu'on garde.
--
-- Un spot n'est PAS une sortie, et les confondre coûterait la valeur des deux. La sortie
-- raconte le passé — j'y étais tel jour, j'ai trouvé ou non — et c'est ce qui en fait la
-- matière de la phase 7. Le spot vise l'avenir : un endroit qu'on veut aller voir, sans date,
-- sans observation, sans rien à valider. Enregistrer un spot dans `outings` fabriquerait des
-- sorties qui n'ont jamais eu lieu, donc du bruit dans la seule table d'absences réelles du
-- projet.
--
-- Latitude et longitude en `double precision`, et non en `geography` comme partout ailleurs.
-- Ce que l'utilisateur possède ici est un couple de nombres qu'il a tapé, collé, ou relevé
-- d'un doigt sur la carte, et qu'il veut recopier tel quel dans un GPS : c'est la donnée, pas
-- une projection de la donnée. Aucune requête de cette fonctionnalité n'est spatiale — on lit
-- ses quelques dizaines de spots d'un seul coup, sans emprise ni index GIST. Le jour où « mes
-- spots à moins de 2 km » aura un sens, une colonne générée les rendra en une expression ; la
-- poser aujourd'hui serait une machinerie PostGIS au service de rien.


-- ---------------------------------------------------------------------------
-- Permission
--
-- Distincte de `finds.create`, et non repliée dessus : tenir un carnet de sorties et garder
-- une liste de coins sont deux gestes différents, et la matrice de /admin/droits doit pouvoir
-- les séparer. Le rôle `lecture` — « consulte la carte, sans rien enregistrer » — ne l'a donc
-- pas, exactement comme il n'a pas `finds.create`.
-- ---------------------------------------------------------------------------

insert into public.permissions (key, label, category)
values ('spots.manage', 'Repérer et gérer ses spots', 'relevés');

insert into public.role_permissions (role, permission)
select r, 'spots.manage'
from unnest(array['ecriture', 'admin']::public.app_role[]) as r;


-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.spots (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  label      text not null,
  notes      text,
  lat        double precision not null,
  lng        double precision not null,
  created_at timestamptz not null default now(),

  -- Bornes en base et pas seulement dans le formulaire : les coordonnées arrivent d'un
  -- collage, donc d'un texte analysé, et une analyse rendant 431.45 doit être arrêtée ici.
  constraint spots_lat_range  check (lat between -90 and 90),
  constraint spots_lng_range  check (lng between -180 and 180),
  constraint spots_label_len  check (char_length(btrim(label)) between 1 and 80),
  constraint spots_notes_len  check (notes is null or char_length(notes) <= 500)
);

create index spots_user_idx on public.spots (user_id, created_at desc);

alter table public.spots enable row level security;


-- ---------------------------------------------------------------------------
-- RLS
--
-- Aucune politique n'appelle can() en lecture, et c'est la même règle qu'au carnet de sorties
-- (point 6 du README) : un super-pouvoir sur les comptes n'est pas un super-pouvoir sur les
-- coins. Un spot est même plus sensible qu'une sortie — il n'a pas de mode « partagé », il
-- n'est destiné à personne d'autre qu'à celui qui l'a posé. Le test pgTAP 09 le vérifie sur un
-- administrateur qui détient pourtant toutes les permissions de la matrice.
--
-- La permission ne garde que l'écriture : elle décide qui peut tenir des spots, jamais qui
-- peut voir ceux d'un autre. Le jour où `spots.manage` serait accordée à tout le monde, la
-- clause `user_id = auth.uid()` resterait seule à séparer les carnets, et elle suffit.
-- ---------------------------------------------------------------------------

create policy spots_select on public.spots
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy spots_insert on public.spots
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.can('spots.manage')));

create policy spots_update on public.spots
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy spots_delete on public.spots
  for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.spots to authenticated;
revoke all on public.spots from anon;
