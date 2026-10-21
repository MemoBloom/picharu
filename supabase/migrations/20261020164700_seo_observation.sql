begin;
-- Plans and reports are private, append-only evidence, separate from public page copy.
create table public.seo_plans(
 revision_id uuid primary key references public.seo_revisions(id),
 plan jsonb not null,baseline_snapshot jsonb not null,created_at timestamptz not null default now()
);
create table public.seo_observations(
 id uuid primary key,revision_id uuid not null references public.seo_plans(revision_id),
 publish_operation_id uuid not null references public.seo_changes(operation_id),actor_id uuid not null references auth.users(id),
 fingerprint text not null,report jsonb not null,created_at timestamptz not null default now()
);
create function public.seo_evidence_immutable() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'SEO_IMMUTABLE_EVIDENCE';end $$;
create trigger seo_plan_immutable before update or delete on public.seo_plans for each row execute function public.seo_evidence_immutable();
create trigger seo_observation_immutable before update or delete on public.seo_observations for each row execute function public.seo_evidence_immutable();

-- Read retained ingestion batches, not replaceable current metric rows. Empty success is a known zero; missing is unknown.
create function public.seo_window_snapshot(p_path text,p_property text,p_from date,p_to date,p_fixture boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_path is null or p_property is null or p_fixture is null or p_from is null or p_to is null or p_to-p_from not between 0 and 55 then raise exception 'SEO_INVALID_REQUEST';end if;
 with expected as(select d::date as observed_day from generate_series(p_from,p_to,interval '1 day') d),
 daily as(select e.observed_day,s.id run_id,s.status successful_status,l.status latest_status,
  coalesce(s.quality->>'limited','false')='true' or coalesce(s.quality->>'subject_to_thresholding','false')='true' or coalesce(s.quality->>'data_loss_from_other_row','false')='true' as limited,
  case when s.id is null or coalesce(a.invalid_metrics,false) then null else coalesce(a.clicks,0) end clicks,
  case when s.id is null or coalesce(a.invalid_metrics,false) then null else coalesce(a.impressions,0) end impressions,a.weighted,coalesce(a.unknown_position,false) unknown_position,coalesce(a.invalid_metrics,false) invalid_metrics
 from expected e
 left join lateral(select i.* from seo_ingestions i where i.source='gsc' and i.property=p_property and i.grain='page' and i.day=e.observed_day and i.is_fixture=p_fixture order by i.created_at desc,i.id desc limit 1) l on true
 left join lateral(select i.* from seo_ingestions i where i.source='gsc' and i.property=p_property and i.grain='page' and i.day=e.observed_day and i.is_fixture=p_fixture and i.status in('complete','empty') order by i.created_at desc,i.id desc limit 1) s on true
 left join lateral(select sum((r->'measures'->>'clicks')::numeric) clicks,sum((r->'measures'->>'impressions')::numeric) impressions,
  sum((r->'measures'->>'position')::numeric*(r->'measures'->>'impressions')::numeric) weighted,
  bool_or(coalesce((r->'measures'->>'impressions')::numeric,0)>0 and r->'measures'->>'position' is null) unknown_position,
  bool_or(r->'measures'->>'clicks' is null or r->'measures'->>'impressions' is null) invalid_metrics
  from seo_ingestion_batches b cross join lateral jsonb_array_elements(b.rows) r where b.run_id=s.id and r->'dimensions'->>'page'=p_path and r->'dimensions'->>'country'='JP') a on true
 )
 select jsonb_build_object('from',p_from,'to',p_to,'timezone','America/Los_Angeles','source','gsc','property',p_property,'grain','page','page',p_path,'country','JP','is_fixture',p_fixture,
 'expected_days',count(*),'successful_days',count(run_id),'ready',bool_and(run_id is not null and latest_status in('complete','empty') and not limited and not invalid_metrics),
 'missing_days',coalesce(jsonb_agg(observed_day order by observed_day) filter(where run_id is null),'[]'),
 'day_states',jsonb_agg(jsonb_build_object('day',observed_day,'run_id',run_id,'status',latest_status,'successful_status',successful_status,'limited',limited,'invalid_metrics',invalid_metrics) order by observed_day),
 'totals',jsonb_build_object('clicks',sum(clicks),'impressions',sum(impressions),'ctr',sum(clicks)/nullif(sum(impressions),0),'position',case when bool_or(unknown_position) then null else sum(weighted)/nullif(sum(impressions),0) end)) into result from daily;
 return result;
end $$;

create function public.seo_save_planned_draft(p_actor uuid,p_content jsonb,p_expected_revision uuid,p_plan jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare saved jsonb;baseline jsonb;from_day date;to_day date;days integer;
begin
 perform seo_require_role(p_actor,array['editor','reviewer','admin']);
 if jsonb_typeof(p_plan) is distinct from 'object' or not(p_plan ?& array['hypothesis','change_summary','target_queries','risk_notes','rollback_conditions','source_property','baseline_from','baseline_to','observation_days','minimum_impressions','is_fixture']) then raise exception 'SEO_INVALID_REQUEST';end if;
 from_day:=(p_plan->>'baseline_from')::date;to_day:=(p_plan->>'baseline_to')::date;days:=(p_plan->>'observation_days')::integer;
 if (days between 14 and 56 and to_day-from_day+1=days and to_day<=(now() at time zone 'America/Los_Angeles')::date-3 and (p_plan->>'minimum_impressions')::integer between 300 and 1000000 and jsonb_typeof(p_plan->'is_fixture')='boolean' and jsonb_typeof(p_plan->'source_property')='string' and length(p_plan->>'source_property') between 1 and 500 and jsonb_typeof(p_plan->'observation_days')='number' and jsonb_typeof(p_plan->'minimum_impressions')='number' and jsonb_typeof(p_plan->'target_queries')='array') is not true then raise exception 'SEO_INVALID_REQUEST';end if;
 if jsonb_array_length(p_plan->'target_queries') not between 1 and 10 or exists(select 1 from jsonb_array_elements(p_plan->'target_queries') q where jsonb_typeof(q)<>'string' or length(q#>>'{}') not between 1 and 100 or (q#>>'{}')~*'@|https?://|token') then raise exception 'SEO_INVALID_REQUEST';end if;
 if exists(select 1 from unnest(array['hypothesis','change_summary','risk_notes','rollback_conditions']) k where jsonb_typeof(p_plan->k)<>'string' or length(trim(p_plan->>k)) not between 10 and 1000) then raise exception 'SEO_INVALID_REQUEST';end if;
 if (p_plan->>'is_fixture')::boolean and (p_content->>'indexable')::boolean then raise exception 'SEO_INVALID_REQUEST';end if;
 baseline:=seo_window_snapshot(p_content->>'path',p_plan->>'source_property',from_day,to_day,(p_plan->>'is_fixture')::boolean);
 saved:=seo_save_draft(p_actor,p_content,p_expected_revision);
 insert into seo_plans(revision_id,plan,baseline_snapshot) values((saved->>'id')::uuid,p_plan,baseline);
 return saved;
end $$;

create function public.seo_capture_observation(p_actor uuid,p_revision uuid,p_publish_operation uuid,p_id uuid,p_to date,p_decision text,p_notes text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p seo_plans;anchor seo_changes;existing seo_observations;fp text;after_snapshot jsonb;v_from date;v_end date;v_ready boolean;interrupted boolean;v_report jsonb;result jsonb;v_path text;minimum integer;
begin
 perform seo_require_role(p_actor,array['editor','reviewer','admin']);
 if p_decision='keep' then perform seo_require_role(p_actor,array['reviewer','admin']);end if;
 if p_id is null or p_to is null or p_decision is null or p_decision not in('keep','extend','rollback','insufficient') or p_notes is null or length(trim(p_notes)) not between 10 and 2000 then raise exception 'SEO_INVALID_REQUEST';end if;
 fp:=md5(jsonb_build_array(p_actor,p_revision,p_publish_operation,p_to,p_decision,p_notes)::text);
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into existing from seo_observations where id=p_id;
 if found then if existing.fingerprint<>fp then raise exception 'SEO_IDEMPOTENCY_CONFLICT';end if;return to_jsonb(existing)-'fingerprint';end if;
 select * into p from seo_plans where revision_id=p_revision;if not found then raise exception 'SEO_PLAN_REQUIRED';end if;
 select * into anchor from seo_changes where operation_id=p_publish_operation and revision_id=p_revision and action='publish';if not found then raise exception 'SEO_NOT_FOUND';end if;
 perform 1 from seo_pages where path=anchor.path for share;
 v_path:=anchor.path;v_from:=(anchor.created_at at time zone 'America/Los_Angeles')::date+1;v_end:=v_from+(p.plan->>'observation_days')::integer-1;
 if p_to<v_from or p_to>v_end or p_to>(now() at time zone 'America/Los_Angeles')::date-3 or (p.plan->>'baseline_to')::date>=v_from then raise exception 'SEO_INVALID_OBSERVATION_WINDOW';end if;
 after_snapshot:=seo_window_snapshot(v_path,p.plan->>'source_property',v_from,p_to,(p.plan->>'is_fixture')::boolean);
 -- Any later publish/rollback in the observation period contaminates this comparison, even if it restores the same revision.
 select exists(select 1 from seo_changes c where c.path=v_path and c.action in('publish','rollback') and c.operation_id<>anchor.operation_id and c.created_at>=anchor.created_at and c.created_at<((p_to+1)::timestamp at time zone 'America/Los_Angeles')) into interrupted;
 minimum:=(p.plan->>'minimum_impressions')::integer;
 v_ready:=p_to=v_end and (p.baseline_snapshot->>'ready')::boolean and (after_snapshot->>'ready')::boolean and not interrupted and coalesce((p.baseline_snapshot->'totals'->>'impressions')::numeric,0)>=minimum and coalesce((after_snapshot->'totals'->>'impressions')::numeric,0)>=minimum;
 if p_decision='keep' and not v_ready then raise exception 'SEO_OBSERVATION_NOT_READY';end if;
 v_report:=jsonb_build_object('plan',p.plan,'before',p.baseline_snapshot,'after',after_snapshot,'published_at',anchor.created_at,'observation_due',v_end,'comparison_ready',v_ready,'intervening_publish',interrupted,'decision',p_decision,'notes',p_notes,
 'delta',case when v_ready then jsonb_build_object('clicks',(after_snapshot->'totals'->>'clicks')::numeric-(p.baseline_snapshot->'totals'->>'clicks')::numeric,'impressions',(after_snapshot->'totals'->>'impressions')::numeric-(p.baseline_snapshot->'totals'->>'impressions')::numeric,'ctr_points',((after_snapshot->'totals'->>'ctr')::numeric-(p.baseline_snapshot->'totals'->>'ctr')::numeric)*100) else null end,
 'limitations',jsonb_build_array('observational_not_causal','google_recrawl_delay','seasonality_and_serp_changes','page_metrics_not_query_revenue'));
 insert into seo_observations(id,revision_id,publish_operation_id,actor_id,fingerprint,report) values(p_id,p_revision,p_publish_operation,p_actor,fp,v_report) returning to_jsonb(seo_observations)-'fingerprint' into result;
 return result;
end $$;

create function public.seo_observation_overview(p_actor uuid,p_fixture boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform seo_require_role(p_actor,array['editor','reviewer','admin']);
 return jsonb_build_object('plans',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from(select * from seo_plans where (plan->>'is_fixture')::boolean=p_fixture order by created_at desc limit 100) p),
 'observations',(select coalesce(jsonb_agg(to_jsonb(o)-'fingerprint'),'[]') from(select o.* from seo_observations o join seo_plans p using(revision_id) where (p.plan->>'is_fixture')::boolean=p_fixture order by o.created_at desc limit 100) o));
end $$;

alter table public.seo_plans enable row level security;
alter table public.seo_observations enable row level security;
revoke all on public.seo_plans,public.seo_observations from public,anon,authenticated;
grant select,insert on public.seo_plans,public.seo_observations to service_role;
do $$declare f regprocedure;begin
 for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in('seo_evidence_immutable','seo_window_snapshot','seo_save_planned_draft','seo_capture_observation','seo_observation_overview') loop
  execute format('revoke all on function %s from public,anon,authenticated',f);execute format('grant execute on function %s to service_role',f);
 end loop;
end $$;
commit;
