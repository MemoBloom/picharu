begin;
create table public.seo_sessions (
 id uuid primary key, landing_path text not null check(landing_path ~ '^/ja(/tools(/[a-z_]+)?|/guides(/[a-z0-9-]+)?|/help)?$'),
 source text not null check(source in ('organic_search','paid_search','x','tiktok','creator_referral','direct','other')),
 created_at timestamptz not null default now(), expires_at timestamptz not null, revoked_at timestamptz, ga_client_id text, ga_session_id bigint, event_count integer not null default 0
);
create table public.seo_events (
 id uuid primary key, session_id uuid not null references seo_sessions(id),
 name text not null check(name in ('page_view','tool_view','editor_open','upload_start','login_start','login_complete','result_download','job_create','generate_success','generate_failed','purchase_paid')),
 path text not null, tool_id text, entity_kind text, entity_id uuid,
 created_at timestamptz not null default now(),
 delivery_state text not null default 'pending' check(delivery_state in ('pending','claimed','sent','unknown','skipped')),
 delivery_token uuid, unique(name,entity_kind,entity_id)
);
create table public.seo_business_links (
 kind text not null check(kind in ('job','order')), entity_id uuid not null, session_id uuid not null references seo_sessions(id),
 created_at timestamptz not null default now(), primary key(kind,entity_id)
);
create index seo_events_pending on public.seo_events(created_at) where delivery_state='pending';
create index seo_events_path_date on public.seo_events(path,created_at);
create index seo_business_session on public.seo_business_links(session_id);

create function public.seo_start_session(p_id uuid,p_path text,p_source text,p_rate_key text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_rate_key is null or p_rate_key !~ '^[a-f0-9]{64}$' or not app_consume_rate_limit('seo-consent:'||p_rate_key,100,60) then raise exception 'SEO_RATE_LIMITED'; end if;
 insert into seo_sessions(id,landing_path,source,expires_at) values(p_id,p_path,p_source,now()+interval '30 minutes');
end $$;
create function public.seo_revoke_session(p_id uuid) returns void language sql security definer set search_path=public,pg_temp as $$
 update seo_sessions set revoked_at=coalesce(revoked_at,now()) where id=p_id;
 update seo_events set delivery_state='skipped' where session_id=p_id and delivery_state='pending';
$$;
create function public.seo_record_event(p_session uuid,p_id uuid,p_name text,p_path text,p_tool text default null) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare s seo_sessions; n integer;
begin
 if p_name is null or p_name not in ('page_view','tool_view','editor_open','upload_start','login_start','login_complete','result_download') then raise exception 'SEO_INVALID_EVENT'; end if;
 if p_path is null or p_path !~ '^/ja(/tools(/[a-z_]+)?|/guides(/[a-z0-9-]+)?|/help)?$' then raise exception 'SEO_INVALID_EVENT'; end if;
 select * into s from seo_sessions where id=p_session for update;
 if not found or s.revoked_at is not null or s.expires_at<=now() then raise exception 'SEO_CONSENT_REQUIRED'; end if;
 if s.event_count>=500 then raise exception 'SEO_RATE_LIMITED'; end if;
 if exists(select 1 from seo_events where id=p_id and (session_id<>p_session or name<>p_name or path<>p_path or tool_id is distinct from p_tool)) then raise exception 'SEO_IDEMPOTENCY_CONFLICT'; end if;
 insert into seo_events(id,session_id,name,path,tool_id,delivery_state) values(p_id,p_session,p_name,p_path,p_tool,'skipped') on conflict do nothing;
 get diagnostics n=row_count;update seo_sessions set event_count=event_count+n where id=s.id;return n=1;
end $$;
create function public.seo_record_business(p_kind text,p_entity uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare link seo_business_links; s seo_sessions; job edit_jobs; payment orders;
begin
 select * into link from seo_business_links where kind=p_kind and entity_id=p_entity;if not found then return;end if;
 select * into s from seo_sessions where id=link.session_id for update;if s.revoked_at is not null then return;end if;
 if p_kind='job' then
  select * into job from edit_jobs where id=p_entity;
  insert into seo_events(id,session_id,name,path,tool_id,entity_kind,entity_id,created_at) values(gen_random_uuid(),s.id,'job_create',s.landing_path,job.tool_id,'job',job.id,job.created_at) on conflict do nothing;
  if job.status='completed' then
   insert into seo_events(id,session_id,name,path,tool_id,entity_kind,entity_id,created_at) values(gen_random_uuid(),s.id,'generate_success',s.landing_path,job.tool_id,'job',job.id,coalesce(job.completed_at,job.updated_at)) on conflict do nothing;
  end if;
  if job.status='failed' then
   insert into seo_events(id,session_id,name,path,tool_id,entity_kind,entity_id,created_at) values(gen_random_uuid(),s.id,'generate_failed',s.landing_path,job.tool_id,'job',job.id,job.updated_at) on conflict do nothing;
  end if;
 elsif p_kind='order' then
  select * into payment from orders where id=p_entity;
  if payment.paid_at is not null and payment.status in ('paid','partially_refunded','refunded','disputed') then
   insert into seo_events(id,session_id,name,path,entity_kind,entity_id,created_at) values(gen_random_uuid(),s.id,'purchase_paid',s.landing_path,'order',payment.id,payment.paid_at) on conflict do nothing;
  end if;
 end if;
end $$;
create function public.seo_link_business(p_session uuid,p_owner uuid,p_kind text,p_entity uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from seo_sessions where id=p_session and revoked_at is null and expires_at>now()) then raise exception 'SEO_CONSENT_REQUIRED'; end if;
 if p_kind='job' then
  if not exists(select 1 from edit_jobs where id=p_entity and owner_id=p_owner) then raise exception 'SEO_FORBIDDEN'; end if;
 elsif p_kind='order' then
  if not exists(select 1 from orders where id=p_entity and owner_id=p_owner) then raise exception 'SEO_FORBIDDEN'; end if;
 else raise exception 'SEO_INVALID_EVENT'; end if;
 insert into seo_business_links(kind,entity_id,session_id) values(p_kind,p_entity,p_session) on conflict do nothing;
 perform seo_record_business(p_kind,p_entity);
end $$;
create function public.seo_business_trigger() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform seo_record_business(case when tg_table_name='edit_jobs' then 'job' else 'order' end,new.id);return new;
exception when others then
 -- Analytics must never roll back a generation settlement or payment transaction.
 raise log 'seo_business_analytics_failed';return new;
end $$;
create trigger seo_job_fact after update of status on public.edit_jobs for each row execute function public.seo_business_trigger();
create trigger seo_order_fact after update of status,paid_at,refunded_minor on public.orders for each row execute function public.seo_business_trigger();

create function public.seo_set_ga4_session(p_session uuid,p_client text,p_ga_session bigint) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_client is null or p_client !~ '^[0-9]{1,20}\.[0-9]{1,20}$' or p_ga_session is null or p_ga_session<1 or p_ga_session>extract(epoch from now())+60 then raise exception 'SEO_INVALID_EVENT';end if;
 perform 1 from seo_sessions where id=p_session and revoked_at is null and expires_at>now() for update;
 if not found then raise exception 'SEO_CONSENT_REQUIRED';end if;
 update seo_sessions set ga_client_id=p_client,ga_session_id=p_ga_session where id=p_session and ga_client_id is null;
end $$;
create function public.seo_delivery_allowed(p_id uuid,p_token uuid) returns boolean language sql security definer set search_path=public,pg_temp as $$
 select exists(select 1 from seo_events e join seo_sessions s on s.id=e.session_id where e.id=p_id and e.delivery_token=p_token and e.delivery_state='claimed' and s.revoked_at is null);
$$;

create function public.seo_claim_delivery(p_token uuid,p_limit integer default 25) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_limit is null or p_limit<1 or p_limit>100 then raise exception 'SEO_INVALID_REQUEST'; end if;
 with candidates as(select e.id from seo_events e join seo_sessions s on s.id=e.session_id where e.delivery_state='pending' and s.revoked_at is null and s.ga_client_id is not null and s.ga_session_id is not null order by e.created_at limit p_limit for update of e skip locked),
 claimed as(update seo_events e set delivery_state='claimed',delivery_token=p_token from candidates c where c.id=e.id returning e.*)
 select coalesce(jsonb_agg(to_jsonb(claimed)||jsonb_build_object('ga_client_id',s.ga_client_id,'ga_session_id',s.ga_session_id)),'[]') into result from claimed join seo_sessions s on s.id=claimed.session_id;
 return result;
end $$;
create function public.seo_finish_delivery(p_id uuid,p_token uuid,p_state text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_state is null or p_state not in ('sent','unknown','skipped') then raise exception 'SEO_INVALID_REQUEST';end if;
 update seo_events set delivery_state=p_state where id=p_id and delivery_token=p_token and delivery_state='claimed';
end $$;

-- Rebuild missing facts after a transient analytics failure without re-running any job or payment.
create function public.seo_reconcile_business(p_limit integer default 100) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare link seo_business_links; n integer:=0;
begin
 if p_limit is null or p_limit<1 or p_limit>500 then raise exception 'SEO_INVALID_REQUEST';end if;
 for link in
  select b.* from seo_business_links b join seo_sessions s on s.id=b.session_id where s.revoked_at is null and (
   (b.kind='job' and exists(select 1 from edit_jobs j where j.id=b.entity_id and (not exists(select 1 from seo_events e where e.entity_kind='job' and e.entity_id=j.id and e.name='job_create') or j.status='completed' and not exists(select 1 from seo_events e where e.entity_kind='job' and e.entity_id=j.id and e.name='generate_success') or j.status='failed' and not exists(select 1 from seo_events e where e.entity_kind='job' and e.entity_id=j.id and e.name='generate_failed')))) or
   (b.kind='order' and exists(select 1 from orders o where o.id=b.entity_id and o.paid_at is not null and not exists(select 1 from seo_events e where e.entity_kind='order' and e.entity_id=o.id and e.name='purchase_paid')))
  ) order by b.created_at,b.entity_id limit p_limit for update of b skip locked
 loop perform seo_record_business(link.kind,link.entity_id);n:=n+1;end loop;
 return jsonb_build_object('processed',n,'may_have_more',n=p_limit);
end $$;

create function public.seo_funnel_report(p_actor uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform seo_require_role(p_actor,array['editor','reviewer','admin']);
 return jsonb_build_object(
  'consented_sessions',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from(select landing_path,source,count(*) session_count from seo_sessions where created_at>=now()-interval '28 days' group by landing_path,source) r),
  'events',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from(select path,name,count(*) event_count from seo_events where created_at>=now()-interval '28 days' group by path,name) r),
  'payments',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from(select s.landing_path, count(*) paid_orders,sum(o.amount_minor) gross_jpy,sum(o.refunded_minor) refunded_jpy,sum(case when o.disputed then 0 else o.amount_minor-o.refunded_minor end) net_jpy from seo_business_links b join seo_sessions s on s.id=b.session_id join orders o on o.id=b.entity_id and b.kind='order' where o.paid_at is not null and o.paid_at>=now()-interval '28 days' group by s.landing_path) r),
  'outbox',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from(select delivery_state,count(*) count from seo_events group by delivery_state) r)
 );
end $$;

do $$ declare t text;f record;begin
 foreach t in array array['seo_sessions','seo_events','seo_business_links'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant all on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'seo_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
