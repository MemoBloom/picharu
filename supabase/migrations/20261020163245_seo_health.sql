begin;
-- Aggregate-only service RPC; no queries, identities, photos or event payloads are returned.
create function public.seo_ingestion_health(p_fixture boolean,p_gsc_property text,p_ga4_property text,p_gsc_from date,p_gsc_to date,p_ga4_from date,p_ga4_to date)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_fixture is null or p_gsc_from is null or p_gsc_to is null or p_ga4_from is null or p_ga4_to is null or p_gsc_to-p_gsc_from not between 0 and 30 or p_ga4_to-p_ga4_from not between 0 and 30 then raise exception 'SEO_INVALID_REQUEST';end if;
 with scopes(source,property,grain,from_day,to_day) as(values
  ('gsc',p_gsc_property,'property',p_gsc_from,p_gsc_to),('gsc',p_gsc_property,'page',p_gsc_from,p_gsc_to),('gsc',p_gsc_property,'query_page',p_gsc_from,p_gsc_to),('ga4',p_ga4_property,'landing_event',p_ga4_from,p_ga4_to)
 ), expected as(select s.*,d::date as observed_day from scopes s cross join lateral generate_series(s.from_day,s.to_day,interval '1 day') d)
 select coalesce(jsonb_agg(jsonb_build_object('source',e.source,'property',e.property,'grain',e.grain,'day',e.observed_day,
  'status',latest.status,'created_at',latest.created_at,'completed_at',latest.completed_at,'quality',latest.quality,
  'successful_status',success.status,'successful_at',success.completed_at,'successful_quality',success.quality) order by e.source,e.grain,e.observed_day),'[]') into result
 from expected e
 left join lateral(select i.* from seo_ingestions i where i.is_fixture=p_fixture and i.source=e.source and i.property=e.property and i.grain=e.grain and i.day=e.observed_day order by i.created_at desc,i.id desc limit 1) latest on true
 left join lateral(select i.* from seo_ingestions i where i.is_fixture=p_fixture and i.source=e.source and i.property=e.property and i.grain=e.grain and i.day=e.observed_day and i.status in ('complete','empty') order by i.created_at desc,i.id desc limit 1) success on true;
 return result;
end $$;
revoke all on function public.seo_ingestion_health(boolean,text,text,date,date,date,date) from public,anon,authenticated;
grant execute on function public.seo_ingestion_health(boolean,text,text,date,date,date,date) to service_role;
create index seo_ingestions_health_idx on public.seo_ingestions(source,property,grain,day,is_fixture,created_at desc);
create or replace function public.seo_dashboard(p_actor uuid,p_fixture boolean default false,p_gsc_property text default 'sc-domain:picmoko.com') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform seo_require_role(p_actor,array['editor','reviewer','admin']);
 return jsonb_build_object(
  'role',(select role from seo_members where user_id=p_actor),
  'pages',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from seo_pages p),
  'revisions',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from (select * from seo_revisions order by created_at desc limit 100) r),
  'changes',(select coalesce(jsonb_agg(to_jsonb(c)),'[]') from (select * from seo_changes order by created_at desc limit 100) c),
  'ingestions',(select coalesce(jsonb_agg(to_jsonb(i)),'[]') from (select * from seo_ingestions where is_fixture=p_fixture order by created_at desc limit 100) i),
  'metrics',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from (select * from seo_metrics where is_fixture=p_fixture order by day desc limit 5000) m),
  'metrics_truncated',(select count(*)>5000 from seo_metrics where is_fixture=p_fixture),
  'gsc_window',jsonb_build_object('from',(current_date-27)::text,'to',current_date::text,'country','JP','property',p_gsc_property,'grain','page'),
  'gsc_page_summary',(select coalesce(jsonb_agg(jsonb_build_object('dimensions',jsonb_build_object('page',r.page),'measures',jsonb_build_object('clicks',r.clicks,'impressions',r.impressions,'position',r.position),'observed_days',r.observed_days)),'[]') from(
   select dimensions->>'page' page,sum((measures->>'clicks')::numeric) clicks,sum((measures->>'impressions')::numeric) impressions,
   case when count(*) filter(where coalesce((measures->>'impressions')::numeric,0)>0 and measures->>'position' is null)>0 then null else sum((measures->>'position')::numeric*(measures->>'impressions')::numeric)/nullif(sum((measures->>'impressions')::numeric),0) end position,count(distinct day) observed_days
   from seo_metrics where is_fixture=p_fixture and source='gsc' and property=p_gsc_property and grain='page' and dimensions->>'country'='JP' and day between current_date-27 and current_date group by dimensions->>'page'
  ) r),
  'is_fixture',p_fixture
 );
end $$;
commit;
