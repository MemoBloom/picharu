-- Read-only deployment inventory. No auth rows, secrets, photos or balances.
-- Safe before installation: absent tables/functions are reported, never created.
with expected_tables(name) as(values
 ('console_settings'),('console_collection_periods'),('console_roles'),('console_user_tags'),
 ('console_audit'),('analytics_events'),('console_download_actions'),
 ('console_refund_settings'),('console_refund_periods'),('console_refunds'),
 ('console_refund_gaps'),('console_version_releases'),('console_analytics_reports')
), expected_functions(signature) as(values
 ('app_console_authorize(uuid,text,uuid,text,uuid,jsonb)'),
 ('app_console_record_event(uuid,jsonb)'),('app_console_begin_download(uuid,uuid,uuid,text)'),
 ('app_console_finish_download(uuid,uuid,boolean)'),('app_console_note_refund_gap(uuid,text,text)'),
 ('app_console_resolve_refund_gap(uuid,text)'),('app_console_record_refunds(uuid,jsonb,text)'),
 ('app_console_create_report(uuid,jsonb,uuid,jsonb)'),('app_console_read_report(uuid,uuid,uuid,text)'),
 ('app_console_resolve_user(uuid,jsonb,uuid)'),('app_console_create_job(uuid,text,text,jsonb,jsonb,integer,uuid,text)'),
 ('app_personal_summary(uuid)'),('app_personal_ledger(uuid,jsonb)'),('app_personal_jobs(uuid,jsonb,boolean)')
), tables as(
 select e.name,c.oid,c.relrowsecurity from expected_tables e
 left join pg_class c on c.oid=to_regclass('public.'||e.name)
), funcs as(
 select e.signature,to_regprocedure('public.'||e.signature) oid from expected_functions e
), exposed as(
 select 'table:'||t.name object,r.rolname from tables t cross join pg_roles r
 where t.oid is not null and r.rolname in('anon','authenticated') and
 (has_table_privilege(r.oid,t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or
 exists(select 1 from pg_attribute a where a.attrelid=t.oid and a.attnum>0 and not a.attisdropped
 and has_column_privilege(r.oid,t.oid,a.attnum,'SELECT,INSERT,UPDATE,REFERENCES')))
 union all
 select 'function:'||p.oid::regprocedure::text,r.rolname from pg_proc p
 join pg_namespace n on n.oid=p.pronamespace cross join pg_roles r
 where n.nspname='public' and(p.proname like 'console\_%' escape '\' or p.proname like 'app\_console\_%' escape '\' or p.proname like 'app\_personal\_%' escape '\')
 and r.rolname in('anon','authenticated') and has_function_privilege(r.oid,p.oid,'EXECUTE')
), failures as(
 select 'missing_table:'||name issue from tables where oid is null
 union all select 'rls_disabled:'||name from tables where oid is not null and not relrowsecurity
 union all select 'missing_function:'||signature from funcs where oid is null
 union all select 'service_role_cannot_execute:'||signature from funcs f where oid is not null
 and not has_function_privilege('service_role',oid,'EXECUTE')
 union all select 'browser_permission:'||rolname||':'||object from exposed
)
select jsonb_build_object(
 'state',case when not exists(select 1 from failures) then 'EXPECTED_STRUCTURE_PRESENT' else 'INCOMPLETE_OR_UNSAFE' end,
 'base_present',to_regclass('public.edit_jobs') is not null,
 'worker_present',to_regprocedure('public.worker_json_keys(jsonb,text[])') is not null,
 'tables_expected',(select count(*) from tables),'tables_found',(select count(*) from tables where oid is not null),
 'functions_expected',(select count(*) from funcs),'functions_found',(select count(*) from funcs where oid is not null),
 'issues',coalesce((select jsonb_agg(issue order by issue) from failures),'[]'::jsonb),
 'scope','structure and effective grants only; not function-body equivalence, deployment or runtime acceptance'
) as console_inventory;
