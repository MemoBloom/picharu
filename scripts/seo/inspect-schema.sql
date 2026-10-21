-- Read-only catalog inventory for the four SEO migrations listed in CLOUD_SETUP.md.
-- Presence is not proof of function bodies, grants, indexes, deployment or successful ingestion.
-- Does not read user records, photos, keys, or migration history contents.
with expected(stage,kind,object_name) as (values
  ('base','table','auth.users'),
  ('base','table','public.profiles'),
  ('base','table','public.credit_accounts'),
  ('base','table','public.edit_jobs'),
  ('base','table','public.orders'),
  ('base','function','public.app_consume_rate_limit(text,integer,integer)'),
  ('core','table','public.seo_members'),
  ('core','table','public.seo_pages'),
  ('core','table','public.seo_revisions'),
  ('core','table','public.seo_changes'),
  ('core','table','public.seo_ingestions'),
  ('core','table','public.seo_ingestion_batches'),
  ('core','table','public.seo_metrics'),
  ('core','table','public.seo_webhook_nonces'),
  ('core','function','public.seo_revision_immutable()'),
  ('core','function','public.seo_require_role(uuid,text[])'),
  ('core','function','public.seo_save_draft(uuid,jsonb,uuid)'),
  ('core','function','public.seo_transition(uuid,uuid,text,uuid,uuid)'),
  ('core','function','public.seo_get_revision(uuid,uuid)'),
  ('core','function','public.seo_get_published(text)'),
  ('core','function','public.seo_ingest_begin(uuid,text,text,date,text,boolean,jsonb)'),
  ('core','function','public.seo_ingest_stage(uuid,integer,jsonb)'),
  ('core','function','public.seo_ingest_finish(uuid,integer,text)'),
  ('core','function','public.seo_consume_nonce(uuid)'),
  ('core','function','public.seo_dashboard(uuid,boolean,text)'),
  ('core','trigger','public.seo_revisions.seo_revision_immutable'),
  ('analytics','table','public.seo_sessions'),
  ('analytics','table','public.seo_events'),
  ('analytics','table','public.seo_business_links'),
  ('analytics','function','public.seo_start_session(uuid,text,text,text)'),
  ('analytics','function','public.seo_revoke_session(uuid)'),
  ('analytics','function','public.seo_record_event(uuid,uuid,text,text,text)'),
  ('analytics','function','public.seo_record_business(text,uuid)'),
  ('analytics','function','public.seo_link_business(uuid,uuid,text,uuid)'),
  ('analytics','function','public.seo_business_trigger()'),
  ('analytics','function','public.seo_set_ga4_session(uuid,text,bigint)'),
  ('analytics','function','public.seo_delivery_allowed(uuid,uuid)'),
  ('analytics','function','public.seo_claim_delivery(uuid,integer)'),
  ('analytics','function','public.seo_finish_delivery(uuid,uuid,text)'),
  ('analytics','function','public.seo_reconcile_business(integer)'),
  ('analytics','function','public.seo_funnel_report(uuid)'),
  ('analytics','trigger','public.edit_jobs.seo_job_fact'),
  ('analytics','trigger','public.orders.seo_order_fact'),
  ('health','function','public.seo_ingestion_health(boolean,text,text,date,date,date,date)'),
  ('observation','table','public.seo_plans'),
  ('observation','table','public.seo_observations'),
  ('observation','function','public.seo_evidence_immutable()'),
  ('observation','function','public.seo_window_snapshot(text,text,date,date,boolean)'),
  ('observation','function','public.seo_save_planned_draft(uuid,jsonb,uuid,jsonb)'),
  ('observation','function','public.seo_capture_observation(uuid,uuid,uuid,uuid,date,text,text)'),
  ('observation','function','public.seo_observation_overview(uuid,boolean)'),
  ('observation','trigger','public.seo_plans.seo_plan_immutable'),
  ('observation','trigger','public.seo_observations.seo_observation_immutable')
), checked as (
 select *,case kind
  when 'table' then exists(select 1 from pg_catalog.pg_class c where c.oid=to_regclass(object_name) and c.relkind in('r','p'))
  when 'function' then to_regprocedure(object_name) is not null
  when 'trigger' then exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=to_regclass(split_part(object_name,'.',1)||'.'||split_part(object_name,'.',2)) and t.tgname=split_part(object_name,'.',3) and not t.tgisinternal and t.tgenabled<>'D')
 end as found from expected
), stages as (
 select stage,count(*) expected,count(*) filter(where found) found,
  coalesce(jsonb_agg(object_name order by object_name) filter(where not found),'[]'::jsonb) missing
 from checked group by stage
)
select jsonb_build_object(
 'schema_state',case
   when exists(select 1 from checked where stage='base' and not found) then 'BASE_DEPENDENCIES_MISSING'
   when not exists(select 1 from checked where stage<>'base' and found) then 'NO_SEO_OBJECTS'
   when exists(select 1 from checked where stage<>'base' and not found) then 'PARTIAL_SEO_STRUCTURE'
   else 'SEO_STRUCTURE_PRESENT' end,
 'stages',(select jsonb_object_agg(stage,jsonb_build_object('expected',expected,'found',found,'missing',missing)) from stages),
 'scope','catalog_presence_only_not_runtime_or_security_acceptance'
) as seo_inventory;
