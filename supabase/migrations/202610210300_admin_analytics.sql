-- Server-only, bounded and permission-scoped administrator snapshots.
begin;
create table public.console_refund_settings(id boolean primary key default true check(id),enabled boolean not null default false,coverage_start timestamptz);
insert into public.console_refund_settings default values;
create table public.console_refund_periods(id uuid primary key default gen_random_uuid(),environment text not null check(environment in ('test','live')),started_at timestamptz not null,ended_at timestamptz,check(ended_at is null or ended_at>=started_at));
create unique index console_refund_open_period on public.console_refund_periods((true)) where ended_at is null;
create function public.console_refund_coverage() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare env text;
begin
 if old.enabled is distinct from new.enabled then
  update console_refund_periods set ended_at=clock_timestamp() where ended_at is null;
  if new.enabled then
   select environment into env from console_settings where id;
   if env='unclassified' then raise exception 'INVALID_REQUEST';end if;
   new.coverage_start:=coalesce(old.coverage_start,clock_timestamp());
   insert into console_refund_periods(environment,started_at) values(env,clock_timestamp());
  end if;
 end if;
 return new;
end $$;
create trigger console_refund_coverage before update on public.console_refund_settings for each row execute function public.console_refund_coverage();
create function public.console_refund_environment() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if old.environment is distinct from new.environment then
  update console_refund_settings set enabled=false where id and enabled;
 end if;
 return new;
end $$;
create trigger console_refund_environment after update on public.console_settings for each row execute function public.console_refund_environment();
create table public.console_refunds(
 id text primary key check(length(id) between 1 and 200),order_id uuid not null references public.orders(id),
 occurred_at timestamptz not null check(isfinite(occurred_at)),amount_minor bigint not null check(amount_minor between 1 and 9007199254740991),
 currency text not null check(currency ~ '^[A-Z]{3}$'),status text not null check(status in ('pending','requires_action','succeeded','failed','canceled')),
 event_id text not null check(length(event_id) between 1 and 200),received_at timestamptz not null default clock_timestamp()
);
create function public.console_refund_immutable() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' then raise exception 'APPEND_ONLY';end if;
 if row(new.id,new.order_id,new.occurred_at,new.amount_minor,new.currency,new.received_at) is distinct from row(old.id,old.order_id,old.occurred_at,old.amount_minor,old.currency,old.received_at)
 or (old.status not in ('pending','requires_action') and new.status<>old.status) then raise exception 'IMMUTABLE_REFUND';end if;
 return new;
end $$;
create trigger console_refund_immutable before update or delete on public.console_refunds for each row execute function public.console_refund_immutable();
alter table public.console_audit drop constraint console_audit_action_check;
alter table public.console_audit add constraint console_audit_action_check check(action in ('session','analytics_read','finance_read','export','role_change','collection_change','refund_fact','refund_gap'));
create index console_refunds_window on public.console_refunds(occurred_at,order_id);
create table public.console_refund_gaps(
 order_id uuid not null references public.orders(id),event_id text not null check(length(event_id) between 1 and 200),
 reason text not null check(reason in ('collection_failed','incomplete_list','invalid_payload','retrieval_failed','list_failed','persistence_failed','incomplete_page')),
 first_seen_at timestamptz not null default clock_timestamp(),last_seen_at timestamptz not null default clock_timestamp(),resolved_at timestamptz,
 primary key(order_id,event_id)
);
create function public.app_console_note_refund_gap(p_order_id uuid,p_event_id text,p_reason text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_order_id is null or p_event_id is null or length(p_event_id) not between 1 and 200 or p_reason is null or p_reason not in ('collection_failed','incomplete_list','invalid_payload','retrieval_failed','list_failed','persistence_failed','incomplete_page') then raise exception 'INVALID_REQUEST';end if;
 insert into console_refund_gaps(order_id,event_id,reason) values(p_order_id,p_event_id,p_reason)
 on conflict(order_id,event_id) do update set reason=excluded.reason,last_seen_at=clock_timestamp(),resolved_at=null;
 insert into console_audit(actor_source,action,request_id,target_id,filter_summary) values('database','refund_gap',gen_random_uuid(),p_order_id,jsonb_build_object('reason',p_reason,'state','open'));
end $$;
create function public.app_console_resolve_refund_gap(p_order_id uuid,p_event_id text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_order_id is null or p_event_id is null or length(p_event_id) not between 1 and 200 then raise exception 'INVALID_REQUEST';end if;
 update console_refund_gaps set resolved_at=coalesce(resolved_at,clock_timestamp()) where order_id=p_order_id and event_id=p_event_id;
 if found then insert into console_audit(actor_source,action,request_id,target_id,filter_summary) values('database','refund_gap',gen_random_uuid(),p_order_id,jsonb_build_object('state','resolved'));end if;
end $$;
create function public.app_console_record_refunds(p_order_id uuid,p_refunds jsonb,p_event_id text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o orders;r jsonb;old console_refunds;rid text;ts timestamptz;amount bigint;curr text;st text;n integer:=0;
begin
 if p_order_id is null or p_event_id is null or length(p_event_id) not between 1 and 200 or jsonb_typeof(p_refunds) is distinct from 'array' or jsonb_array_length(p_refunds)>100 then raise exception 'INVALID_REQUEST';end if;
 select * into o from orders where id=p_order_id for update;if not found then raise exception 'NOT_FOUND';end if;
 for r in select value from jsonb_array_elements(p_refunds) loop
  if not worker_json_keys(r,array['id','occurred_at','amount_minor','currency','status']) then raise exception 'INVALID_REQUEST';end if;
  begin rid:=r->>'id';ts:=(r->>'occurred_at')::timestamptz;amount:=(r->>'amount_minor')::bigint;exception when others then raise exception 'INVALID_REQUEST';end;
  curr:=r->>'currency';st:=r->>'status';
  if rid is null or length(rid) not between 1 and 200 or ts is null or not isfinite(ts) or ts>clock_timestamp()+interval '5 minutes' or amount is null or amount<=0
   or jsonb_typeof(r->'amount_minor') is distinct from 'number' or (r->>'amount_minor') !~ '^[0-9]+$'
   or curr is distinct from o.currency or st is null or st not in ('pending','requires_action','succeeded','failed','canceled') then raise exception 'INVALID_REQUEST';end if;
  perform pg_advisory_xact_lock(hashtextextended(rid,83));
  select * into old from console_refunds where id=rid;
  if found then
   if row(old.order_id,old.occurred_at,old.amount_minor,old.currency) is distinct from row(p_order_id,ts,amount,curr) then raise exception 'IDEMPOTENCY_CONFLICT';end if;
   if old.status<>st and old.status not in ('pending','requires_action') then raise exception 'IDEMPOTENCY_CONFLICT';end if;
   update console_refunds set status=st,event_id=p_event_id where id=rid;
  else insert into console_refunds(id,order_id,occurred_at,amount_minor,currency,status,event_id) values(rid,p_order_id,ts,amount,curr,st,p_event_id);n:=n+1;end if;
 end loop;
 if (select coalesce(sum(amount_minor),0) from console_refunds where order_id=p_order_id and status='succeeded')>o.amount_minor then raise exception 'INVALID_REQUEST';end if;
 perform app_console_resolve_refund_gap(p_order_id,p_event_id);
 insert into console_audit(actor_source,action,request_id,target_id,filter_summary) values('database','refund_fact',gen_random_uuid(),p_order_id,jsonb_build_object('records',jsonb_array_length(p_refunds),'inserted',n));
 return jsonb_build_object('recorded',n);
end $$;

create table public.console_analytics_reports(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),
 created_at timestamptz not null default statement_timestamp(),expires_at timestamptz not null default(statement_timestamp()+interval '15 minutes'),
 dataset jsonb not null check(jsonb_typeof(dataset)='object')
);
create index console_analytics_profiles on public.profiles(analytics_environment,created_at,id);
create index console_analytics_ledger_window on public.credit_ledger(created_at,owner_id);
create index console_analytics_orders_created on public.orders(analytics_environment,created_at);
create index console_analytics_reports_expiry on public.console_analytics_reports(expires_at);
create function public.console_validate_analytics_query(q jsonb) returns void language plpgsql stable set search_path=public,pg_temp as $$
declare s timestamptz;e timestamptz;tz text;k text;
begin
 if jsonb_typeof(q) is distinct from 'object' or octet_length(q::text)>4096 or exists(select 1 from jsonb_object_keys(q) keys(key) where keys.key<>all(array['start','end','timezone','bucket','environment','internal','tool_id','category','model_id','adapter_version','prompt_id','prompt_version','tool_version','device','cohort'])) then raise exception 'INVALID_REQUEST';end if;
 begin s:=(q->>'start')::timestamptz;e:=(q->>'end')::timestamptz;exception when others then raise exception 'INVALID_REQUEST';end;
 tz:=q->>'timezone';
 if s is null or e is null or not isfinite(s) or not isfinite(e) or s>=e or e-s>interval '366 days' or s>statement_timestamp()
 or tz is null or not exists(select 1 from pg_timezone_names where name=tz)
 or coalesce(q->>'bucket','') not in ('hour','day','week') or coalesce(q->>'environment','') not in ('test','live','unclassified')
 or coalesce(q->>'internal','') not in ('exclude','include','only') or coalesce(q->>'cohort','') not in ('all','new','returning','paid','unpaid','light','heavy') then raise exception 'INVALID_REQUEST';end if;
 foreach k in array array['tool_id','category','model_id','adapter_version','prompt_id'] loop
  if q ? k and (jsonb_typeof(q->k) is distinct from 'string' or length(q->>k) not between 1 and 200) then raise exception 'INVALID_REQUEST';end if;
 end loop;
 foreach k in array array['prompt_version','tool_version'] loop
  if q ? k and (jsonb_typeof(q->k) is distinct from 'number' or (q->>k) !~ '^[1-9][0-9]{0,8}$') then raise exception 'INVALID_REQUEST';end if;
 end loop;
 if q ? 'device' and coalesce(q->>'device','') not in ('mobile','tablet','desktop','unknown') then raise exception 'INVALID_REQUEST';end if;
end $$;

-- STABLE causes every subquery to use ONE MVCC snapshot, even inside volatile
-- create RPC. Only environment/account provenance is prefiltered here; dimensions
-- and cohort arithmetic are performed once by the versioned server engine.
create function public.console_analytics_dataset(q jsonb) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
with b as(select statement_timestamp() as_of,(q->>'start')::timestamptz-((q->>'end')::timestamptz-(q->>'start')::timestamptz) lo,
 least(statement_timestamp(),(q->>'end')::timestamptz+interval '30 days') hi,q->>'environment' env,q->>'internal' internal),
jbase as materialized(select j.* from edit_jobs j,b where j.analytics_environment=b.env
 and (b.internal='include' or j.analytics_internal=(b.internal='only')) and j.created_at<b.hi
 and (j.created_at>=b.lo or j.completed_at>=b.lo or j.status in('queued','processing')) limit 20001),
lbase as materialized(select l.*,coalesce(j.analytics_environment,o.analytics_environment,p.analytics_environment) env,
 coalesce(j.analytics_internal,o.analytics_internal,t.internal_account,false) internal from credit_ledger l cross join b
 left join edit_jobs j on j.id=l.reference_id and j.owner_id=l.owner_id left join orders o on o.id=l.reference_id and o.owner_id=l.owner_id
 join profiles p on p.id=l.owner_id left join console_user_tags t on t.user_id=l.owner_id
 where l.created_at>=b.lo and l.created_at<b.hi),
ls as materialized(select l.* from lbase l,b where l.env=b.env and (b.internal='include' or l.internal=(b.internal='only')) limit 20001),
os as materialized(select o.* from orders o,b where o.analytics_environment=b.env and (b.internal='include' or o.analytics_internal=(b.internal='only'))
 and (o.status='pending' or (o.created_at>=b.lo and o.created_at<b.hi) or(o.paid_at>=b.lo and o.paid_at<b.hi)
 or exists(select 1 from console_refunds r where r.order_id=o.id and r.occurred_at>=b.lo and r.occurred_at<b.hi)) limit 20001),
es as materialized(select e.* from analytics_events e,b where e.environment=b.env and (b.internal='include' or e.internal_account=(b.internal='only')) and ((e.occurred_at>=b.lo and e.occurred_at<b.hi) or(e.received_at>=b.lo and e.received_at<b.hi)) and e.received_at<=b.as_of limit 20001),
js as materialized(select j.* from edit_jobs j,b where j.analytics_environment=b.env and (b.internal='include' or j.analytics_internal=(b.internal='only')) and
 (j.id in(select id from jbase) or j.id in(select reference_id from ls) or j.id in(select job_id from es) or j.parent_job_id in(select id from jbase) or j.id in(select parent_job_id from jbase)) limit 20001),
us as materialized(select p.*,coalesce(t.internal_account,false) internal,to_jsonb(a)->>'email' email,c.status account_status,c.available,c.reserved
 from profiles p join auth.users a on a.id=p.id join credit_accounts c on c.owner_id=p.id left join console_user_tags t on t.user_id=p.id,b
 where p.created_at<b.hi and ((p.analytics_environment=b.env and (b.internal='include' or coalesce(t.internal_account,false)=(b.internal='only')))
 or p.id in(select owner_id from js) or p.id in(select owner_id from os) or p.id in(select owner_id from ls) or p.id in(select owner_id from es)) limit 20001),
ims as materialized(select im.* from images im,b where im.owner_id in(select id from us) and
 (im.source_job_id in(select id from js) or im.id in(select result_image_id from js) or (im.source_kind='upload' and im.created_at>=b.lo and im.created_at<b.hi)) limit 20001),
ats as materialized(select a.* from job_attempts a where a.job_id in(select id from js) limit 20001),
rs as materialized(select r.*,o.owner_id,o.analytics_environment,o.analytics_internal from console_refunds r join orders o on o.id=r.order_id,b
 where o.analytics_environment=b.env and (b.internal='include' or o.analytics_internal=(b.internal='only')) and r.occurred_at>=b.lo and r.occurred_at<b.hi limit 20001),
acts as materialized(select a.* from console_download_actions a,b where a.environment=b.env and (b.internal='include' or a.internal_account=(b.internal='only')) and a.created_at>=b.lo and a.created_at<b.hi limit 20001),
rperiods as materialized(select p.* from console_refund_periods p,b where p.environment=b.env and p.started_at<=b.hi and(p.ended_at is null or p.ended_at>b.lo) limit 20001),
periods as materialized(select p.* from console_collection_periods p,b where p.environment=b.env and p.started_at<=b.hi and(p.ended_at is null or p.ended_at>b.lo) limit 20001),
history as materialized(select u.id,count(j.id) lifetime_jobs,max(j.created_at) last_generated_at,count(j.id) filter(where j.created_at>=b.as_of-interval '30 days') last_30d_jobs,min(j.completed_at) filter(where j.status='completed') first_completed_at
 from us u cross join b left join edit_jobs j on j.owner_id=u.id and j.analytics_environment=b.env and (b.internal='include' or j.analytics_internal=(b.internal='only')) and j.created_at<b.as_of group by u.id,b.as_of),
firstpay as materialized(select u.id,min(o.paid_at) first_paid_at from us u cross join b left join orders o on o.owner_id=u.id and o.analytics_environment=b.env and(o.analytics_internal=(b.internal='only') or b.internal='include') and o.paid_at<b.as_of group by u.id)
select jsonb_build_object('as_of',b.as_of,'query',q,'permissions','[]'::jsonb,'catalog','[]'::jsonb,
 'users',(select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'created_at',u.created_at,'environment',u.analytics_environment,'internal',u.internal,
 'email_masked',case when u.email like '%@%' then left(split_part(u.email,'@',1),1)||'***@'||split_part(u.email,'@',2) else null end,
 'account_status',u.account_status,'available',u.available,'reserved',u.reserved,'first_completed_at',h.first_completed_at,'first_paid_at',f.first_paid_at,'lifetime_jobs',h.lifetime_jobs,'last_generated_at',h.last_generated_at,'last_30d_jobs',h.last_30d_jobs,'history_complete',not exists(select 1 from edit_jobs unknown where unknown.owner_id=u.id and unknown.analytics_environment='unclassified' and b.env<>'unclassified')) order by u.id),'[]') from us u join history h on h.id=u.id join firstpay f on f.id=u.id),
 'jobs',(select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'owner_id',j.owner_id,'tool_id',j.tool_id,'status',j.status,'stage',j.stage,'created_at',j.created_at,'completed_at',j.completed_at,'parent_job_id',j.parent_job_id,'result_image_id',j.result_image_id,'error_code',j.error_code,'credits_reserved',j.credits_reserved,'environment',j.analytics_environment,'internal',j.analytics_internal,'device',j.analytics_device,
 'provider',j.snapshot->'model_profile'->>'provider','model_id',j.snapshot->'model_profile'->>'model_id','adapter_version',j.snapshot->'model_profile'->>'adapter_version','prompt_id',j.snapshot->>'prompt_id','prompt_version',case when j.snapshot->>'prompt_version' ~ '^[1-9][0-9]{0,8}$' then (j.snapshot->>'prompt_version')::integer else null end,'tool_version',case when j.snapshot->>'tool_version' ~ '^[1-9][0-9]{0,8}$' then(j.snapshot->>'tool_version')::integer else null end) order by j.id),'[]') from js j),
 'images',(select coalesce(jsonb_agg(jsonb_build_object('id',im.id,'owner_id',im.owner_id,'source_job_id',im.source_job_id,'source_kind',im.source_kind,'status',im.status,'created_at',im.created_at,'upload_completed_at',im.upload_completed_at,'expires_at',im.expires_at,'deleted_at',im.deleted_at) order by im.id),'[]') from ims im),
 'ledger',(select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'owner_id',l.owner_id,'kind',l.kind,'available_delta',l.available_delta,'reserved_delta',l.reserved_delta,'reference_id',l.reference_id,'created_at',l.created_at,'environment',l.env,'internal',l.internal) order by l.id),'[]') from ls l),
 'orders',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'owner_id',o.owner_id,'created_at',o.created_at,'paid_at',o.paid_at,'amount_minor',o.amount_minor,'currency',o.currency,'refunded_minor',o.refunded_minor,'status',o.status,'reversal_shortfall',o.reversal_shortfall,'environment',o.analytics_environment,'internal',o.analytics_internal) order by o.id),'[]') from os o),
 'refunds',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'order_id',r.order_id,'owner_id',r.owner_id,'occurred_at',r.occurred_at,'amount_minor',r.amount_minor,'currency',r.currency,'status',r.status,'environment',r.analytics_environment,'internal',r.analytics_internal) order by r.id),'[]') from rs r),
 'attempts',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'job_id',a.job_id,'created_at',a.created_at,'submitted_at',a.submitted_at,'state',a.state,'provider',a.provider,'model_id',a.model_id,'adapter_version',a.adapter_version,'actual_cost',case when a.actual_cost is null then null else jsonb_build_object('amount_minor',a.actual_cost->'amount_minor','currency',a.actual_cost->'currency','evidence',a.actual_cost->'evidence') end,'estimated_cost',jsonb_build_object('amount_minor',a.estimated_cost->'amount_minor','currency',a.estimated_cost->'currency')) order by a.id),'[]') from ats a),
 'events',(select coalesce(jsonb_agg(jsonb_build_object('event_id',e.event_id,'name',e.name,'owner_id',e.owner_id,'job_id',e.job_id,'image_id',e.image_id,'tool_id',e.tool_id,'page_view_id',e.page_view_id,'exposure_id',e.exposure_id,'action_id',e.action_id,'source',e.source,'device',e.device,'rating',e.rating,'occurred_at',e.occurred_at,'received_at',e.received_at,'environment',e.environment,'internal',e.internal_account) order by e.event_id),'[]') from es e),
 'refund_periods',(select coalesce(jsonb_agg(jsonb_build_object('environment',p.environment,'started_at',p.started_at,'ended_at',p.ended_at) order by p.started_at),'[]') from rperiods p),
 'periods',(select coalesce(jsonb_agg(jsonb_build_object('environment',p.environment,'started_at',p.started_at,'ended_at',p.ended_at) order by p.started_at),'[]') from periods p),
 'actions',(select coalesce(jsonb_agg(jsonb_build_object('owner_id',a.owner_id,'action_id',a.action_id,'image_id',a.image_id,'job_id',a.job_id,'created_at',a.created_at,'issued_at',a.issued_at,'state',a.state,'environment',a.environment) order by a.action_id),'[]') from acts a),
 'budgets',(select coalesce(jsonb_agg(jsonb_build_object('provider',provider,'model_id',model_id,'adapter_version',adapter_version,'currency',currency,'reserved_minor',reserved_minor,'committed_minor',committed_minor,'limit_minor',limit_minor,'enabled',enabled)),'[]') from(select * from provider_budgets limit 20001) budgets),
 'quality',jsonb_build_object('history_complete',not exists(select 1 from edit_jobs unknown where unknown.owner_id in(select id from us) and unknown.analytics_environment='unclassified' and b.env<>'unclassified'),'refund_coverage_start',(select coverage_start from console_refund_settings where id),
 'finance_gaps',(select count(*) from(select g.order_id from console_refund_gaps g join orders o on o.id=g.order_id where g.resolved_at is null and o.id in(select id from os) union select o.id from os o where o.refunded_minor<>(select coalesce(sum(r.amount_minor),0) from console_refunds r where r.order_id=o.id and r.status='succeeded')) gaps),
 'cleanup_pending',(select count(*) from ims where cleanup_pending),'cleanup_retrying',(select count(*) from object_cleanup_tasks t where t.state='pending' and t.attempt_count>0 and t.image_id in(select id from ims)),
 'collection_enabled',(select collection_enabled from console_settings where id),'unresolved_downloads',(select count(*) from acts where state='pending'),'source_limit',20000)) from b
$$;

-- Redaction is also applied when reading an older snapshot after role removal.
create function public.console_redact_analytics(d jsonb,perms jsonb) returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
begin
 d:=jsonb_set(d,'{permissions}',perms);
 if not(perms ? 'finance:read') then
  d:=jsonb_set(d,'{orders}',(select coalesce(jsonb_agg(x||jsonb_build_object('amount_minor',null,'currency',null,'refunded_minor',null,'reversal_shortfall',null)),'[]') from jsonb_array_elements(d->'orders') x));
  d:=jsonb_set(d,'{attempts}',(select coalesce(jsonb_agg(x||jsonb_build_object('actual_cost',null,'estimated_cost',null)),'[]') from jsonb_array_elements(d->'attempts') x));
  d:=jsonb_set(d,'{refunds}','[]');d:=jsonb_set(d,'{budgets}','[]');
 end if;
 return d;
end $$;
create function public.app_console_create_report(p_user_id uuid,p_query jsonb,p_request_id uuid,p_catalog jsonb default '[]') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare authz jsonb;d jsonb;r console_analytics_reports;k text;tool jsonb;
begin
 perform console_validate_analytics_query(p_query);
 if jsonb_typeof(p_catalog) is distinct from 'array' or jsonb_array_length(p_catalog)>500 or octet_length(p_catalog::text)>262144 then raise exception 'INVALID_REQUEST';end if;
 for tool in select value from jsonb_array_elements(p_catalog) loop
  if not worker_json_keys(tool,array['tool_id','name','category','available'])
  or jsonb_typeof(tool->'tool_id') is distinct from 'string' or tool->>'tool_id' !~ '^[a-z][a-z0-9_]{0,99}$'
  or jsonb_typeof(tool->'name') is distinct from 'string' or length(trim(tool->>'name')) not between 1 and 200
  or jsonb_typeof(tool->'category') is distinct from 'string' or length(trim(tool->>'category')) not between 1 and 100
  or jsonb_typeof(tool->'available') is distinct from 'boolean' then raise exception 'INVALID_REQUEST';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_catalog) x group by x->>'tool_id' having count(*)>1) then raise exception 'INVALID_REQUEST';end if;
 authz:=app_console_authorize(p_user_id,'analytics:read',p_request_id,'analytics_read',null,p_query);
 d:=jsonb_set(console_analytics_dataset(p_query),'{catalog}',p_catalog);
 foreach k in array array['users','jobs','images','ledger','orders','refunds','attempts','events','periods','refund_periods','actions','budgets'] loop
  if jsonb_array_length(d->k)>20000 then raise exception 'QUERY_TOO_LARGE';end if;
 end loop;
 -- Bounded ephemeral retention. A report never prolongs image retention.
 delete from console_analytics_reports where expires_at<=statement_timestamp();
 insert into console_analytics_reports(owner_id,dataset) values(p_user_id,d) returning * into r;
 return jsonb_build_object('report_id',r.id,'expires_at',r.expires_at,'dataset',console_redact_analytics(r.dataset,authz->'permissions'));
end $$;
create function public.app_console_read_report(p_user_id uuid,p_report_id uuid,p_request_id uuid,p_action text default 'analytics_read') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare authz jsonb;r console_analytics_reports;
begin
 if p_report_id is null or p_action is null or p_action not in('analytics_read','finance_read','export') then raise exception 'INVALID_REQUEST';end if;
 authz:=app_console_authorize(p_user_id,case when p_action='finance_read' then 'finance:read' else 'analytics:read' end,p_request_id,p_action,p_report_id);
 select * into r from console_analytics_reports where id=p_report_id and owner_id=p_user_id and expires_at>clock_timestamp();
 if not found then raise exception 'NOT_FOUND';end if;
 return jsonb_build_object('report_id',r.id,'expires_at',r.expires_at,'dataset',console_redact_analytics(r.dataset,authz->'permissions'));
end $$;
do $$declare t text;f record;begin
 foreach t in array array['console_refund_settings','console_refund_periods','console_refunds','console_refund_gaps','console_analytics_reports'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and(p.proname like 'app_console_%' or p.proname like 'console_%') loop
  execute 'revoke all on function '||f.signature||' from public,anon,authenticated';execute 'grant execute on function '||f.signature||' to service_role';
 end loop;
end $$;
commit;
