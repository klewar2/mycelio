-- Toutes les tables de public sont sous RLS.
--
-- C'est le seul test de ce dossier qui protège les phases suivantes : quand cells, forecast,
-- outings et finds arriveront, une table livrée sans RLS fera échouer la CI au lieu de fuiter
-- en silence. Il est écrit par introspection, donc il n'a pas à être tenu à jour.

begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select is_empty(
  $$ select tablename from pg_tables
     where schemaname = 'public' and rowsecurity = false $$,
  'Toutes les tables de public ont la RLS activée'
);

-- Une table sous RLS mais sans aucune politique refuse tout : c'est parfois voulu, jamais par
-- accident. On vérifie donc que chaque table porte au moins une politique de lecture.
select is_empty(
  $$ select t.tablename from pg_tables t
     where t.schemaname = 'public'
       and not exists (
         select 1 from pg_policies p
         where p.schemaname = 'public' and p.tablename = t.tablename
           and p.cmd in ('SELECT', 'ALL')
       ) $$,
  'Chaque table de public porte au moins une politique de lecture'
);

select * from finish();
rollback;
