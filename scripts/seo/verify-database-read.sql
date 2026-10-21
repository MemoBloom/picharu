-- Run after inspect-schema.sql reports SEO_STRUCTURE_PRESENT.
-- Session-local service_role, read-only transaction, metadata checks and two read RPCs only.
-- No user records, report rows, tokens or private page copy are returned.
begin read only;
set local role service_role;
with seo_tables as materialized (
 select c.oid,c.relname,c.relrowsecurity from pg_catalog.pg_class c
 join pg_catalog.pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and left(c.relname,4)='seo_' and c.relkind in('r','p')
), seo_functions as materialized (
 select p.oid,p.oid::regprocedure::text signature from pg_catalog.pg_proc p
 join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and left(p.proname,4)='seo_'
), browser_roles(role_name) as (values ('anon'),('authenticated')),
table_exposure as materialized (
 select t.relname,r.role_name from seo_tables t cross join browser_roles r
 where has_table_privilege(r.role_name,t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or has_any_column_privilege(r.role_name,t.oid,'SELECT,INSERT,UPDATE,REFERENCES')
), function_exposure as materialized (
 select f.signature,r.role_name from seo_functions f cross join browser_roles r
 where has_function_privilege(r.role_name,f.oid,'EXECUTE')
), published as materialized (select public.seo_get_published(null) payload),
health as materialized (
 select public.seo_ingestion_health(false,'sc-domain:picmoko.com','559730643',
  (now() at time zone 'America/Los_Angeles')::date-3,(now() at time zone 'America/Los_Angeles')::date-3,
  (now() at time zone 'Asia/Tokyo')::date-3,(now() at time zone 'Asia/Tokyo')::date-3) payload
)
select jsonb_build_object(
 'execution_role',current_user,
 'transaction_read_only',current_setting('transaction_read_only')='on',
 'tables_checked',(select count(*) from seo_tables),
 'functions_checked',(select count(*) from seo_functions),
 'all_rls_enabled',(select coalesce(bool_and(relrowsecurity),false) from seo_tables),
 'browser_table_grants_absent',not exists(select 1 from table_exposure),
 'browser_function_grants_absent',not exists(select 1 from function_exposure),
 'service_role_table_reads',(select coalesce(bool_and(has_table_privilege('service_role',oid,'SELECT')),false) from seo_tables),
 'service_role_function_execute',(select coalesce(bool_and(has_function_privilege('service_role',oid,'EXECUTE')),false) from seo_functions),
 'published_page_count',(select jsonb_array_length(payload) from published),
 'health_window_entries',(select jsonb_array_length(payload) from health),
 'successful_import_windows',(select count(*) from health,jsonb_array_elements(health.payload) entry where entry->>'status' in('complete','empty')),
 'rls_disabled_tables',(select coalesce(jsonb_agg(relname order by relname),'[]') from seo_tables where not relrowsecurity),
 'browser_table_exposure',(select coalesce(jsonb_agg(jsonb_build_object('table',relname,'role',role_name) order by relname,role_name),'[]') from table_exposure),
 'browser_function_exposure',(select coalesce(jsonb_agg(jsonb_build_object('function',signature,'role',role_name) order by signature,role_name),'[]') from function_exposure),
 'scope','database_role_metadata_and_read_rpc_only_not_http_ingestion_or_deployment'
) as seo_db_readiness;
rollback;
