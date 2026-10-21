-- Console v1. Additive; apply after both Web/Worker migrations.
begin;

create table public.console_settings (
 id boolean primary key default true check(id),
 environment text not null default 'unclassified' check(environment in ('test','live','unclassified')),
 collection_enabled boolean not null default false,
 check(not collection_enabled or environment<>'unclassified')
);
insert into public.console_settings default values;
create table public.console_collection_periods (
 id uuid primary key default gen_random_uuid(), environment text not null check(environment in ('test','live')),
 started_at timestamptz not null, ended_at timestamptz,
 check(ended_at is null or ended_at>=started_at)
);
create unique index console_one_open_period on public.console_collection_periods((true)) where ended_at is null;
create function public.console_collection_change() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if row(old.collection_enabled,old.environment) is distinct from row(new.collection_enabled,new.environment) then
  update console_collection_periods set ended_at=clock_timestamp() where ended_at is null;
  if new.collection_enabled then insert into console_collection_periods(environment,started_at) values(new.environment,clock_timestamp());end if;
 end if;
 return new;
end $$;
create trigger console_collection_change after update on public.console_settings for each row execute function public.console_collection_change();

create table public.console_roles (
 user_id uuid not null references auth.users(id), role text not null check(role in ('analyst','finance','administrator')),
 granted_at timestamptz not null default now(), granted_by uuid references auth.users(id),
 reason text not null check(length(trim(reason)) between 1 and 500), expires_at timestamptz, revoked_at timestamptz,
 primary key(user_id,role)
);
create table public.console_user_tags (
 user_id uuid primary key references auth.users(id), internal_account boolean not null default false,
 updated_at timestamptz not null default now()
);
create table public.console_audit (
 id uuid primary key default gen_random_uuid(), actor_id uuid references auth.users(id),
 actor_source text not null default 'api' check(actor_source in ('api','database')),
 action text not null check(action in ('session','analytics_read','finance_read','export','role_change','collection_change')),
 request_id uuid not null, target_id uuid, filter_summary jsonb not null default '{}',
 created_at timestamptz not null default now(), check(octet_length(filter_summary::text)<=4096)
);
create index console_audit_created on public.console_audit(created_at desc,id desc);
create function public.console_append_only() returns trigger language plpgsql as $$
begin raise exception 'APPEND_ONLY';end $$;
create trigger console_audit_immutable before update or delete on public.console_audit for each row execute function public.console_append_only();
create function public.console_configuration_audit() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_table_name='console_roles' then
  insert into console_audit(actor_id,actor_source,action,request_id,target_id,filter_summary)
  values(null,'database','role_change',gen_random_uuid(),coalesce(new.user_id,old.user_id),
   jsonb_build_object('operation',tg_op,'before',case when tg_op='INSERT' then null else to_jsonb(old) end,'after',case when tg_op='DELETE' then null else to_jsonb(new) end));
 else
  insert into console_audit(actor_id,actor_source,action,request_id,filter_summary)
  values(null,'database','collection_change',gen_random_uuid(),jsonb_build_object('before',to_jsonb(old),'after',to_jsonb(new)));
 end if;
 return null;
end $$;
create trigger console_roles_audit after insert or update or delete on public.console_roles for each row execute function public.console_configuration_audit();
create trigger console_settings_audit after update on public.console_settings for each row execute function public.console_configuration_audit();

-- Existing rows remain explicitly unknown. Only NEW facts capture the configured
-- environment. Tag snapshots prevent subsequent account reclassification rewriting history.
alter table public.profiles add column analytics_environment text not null default 'unclassified'
 check(analytics_environment in ('test','live','unclassified'));
alter table public.edit_jobs add column analytics_environment text not null default 'unclassified'
 check(analytics_environment in ('test','live','unclassified')),
 add column analytics_internal boolean not null default false,
 add column analytics_device text not null default 'unknown' check(analytics_device in ('mobile','tablet','desktop','unknown'));
alter table public.orders add column analytics_environment text not null default 'unclassified'
 check(analytics_environment in ('test','live','unclassified')),
 add column analytics_internal boolean not null default false;
alter table public.images add column upload_completed_at timestamptz;
create function public.console_capture_context() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid;
begin
 select environment into new.analytics_environment from console_settings where id;
 if tg_table_name<>'profiles' then
  u:=new.owner_id;
  new.analytics_internal:=coalesce((select internal_account from console_user_tags where user_id=u),false);
 end if;
 return new;
end $$;
create trigger console_profile_context before insert on public.profiles for each row execute function public.console_capture_context();
create trigger console_job_context before insert on public.edit_jobs for each row execute function public.console_capture_context();
create trigger console_order_context before insert on public.orders for each row execute function public.console_capture_context();
create function public.console_context_immutable() returns trigger language plpgsql as $$
begin
 if new.analytics_environment is distinct from old.analytics_environment then raise exception 'IMMUTABLE_ANALYTICS_CONTEXT';end if;
 if tg_table_name<>'profiles' then
  if new.analytics_internal is distinct from old.analytics_internal then raise exception 'IMMUTABLE_ANALYTICS_CONTEXT';end if;
 end if;
 return new;
end $$;
create trigger console_profile_immutable before update on public.profiles for each row execute function public.console_context_immutable();
create trigger console_job_immutable before update on public.edit_jobs for each row execute function public.console_context_immutable();
create trigger console_order_immutable before update on public.orders for each row execute function public.console_context_immutable();
create function public.console_upload_time() returns trigger language plpgsql as $$
begin
 if old.status='uploading' and new.status='ready' and new.source_kind='upload' then new.upload_completed_at:=clock_timestamp();
 else new.upload_completed_at:=old.upload_completed_at;end if;
 return new;
end $$;
create trigger console_upload_time before update on public.images for each row execute function public.console_upload_time();
create index console_jobs_analytics on public.edit_jobs(analytics_environment,created_at,owner_id);
create index console_orders_paid on public.orders(analytics_environment,paid_at) where paid_at is not null;

create table public.analytics_events (
 event_id uuid primary key, schema_version integer not null default 1 check(schema_version=1),
 name text not null check(name in ('tool_exposed','tool_selected','result_viewed','feedback_submitted','download_url_issued')),
 owner_id uuid not null references auth.users(id), environment text not null check(environment in ('test','live')),
 internal_account boolean not null, source text not null check(source in ('browser_observation','server_download')),
 business_key text not null check(length(business_key) between 1 and 256),
 job_id uuid references public.edit_jobs(id), image_id uuid references public.images(id),
 tool_id text not null check(tool_id ~ '^[a-z][a-z0-9_]{0,99}$'),
 page_view_id uuid, exposure_id uuid, action_id uuid,
 device text not null check(device in ('mobile','tablet','desktop','unknown')),
 rating text check(rating in ('positive','negative')), occurred_at timestamptz not null, received_at timestamptz not null default clock_timestamp(),
 unique(owner_id,name,business_key),
 check((name='download_url_issued')=(source='server_download')),
 check(case name
  when 'download_url_issued' then action_id is not null and job_id is not null and image_id is not null and page_view_id is null and exposure_id is null and rating is null
  when 'tool_exposed' then page_view_id is not null and action_id is null and exposure_id is not null and job_id is null and image_id is null and rating is null
  when 'tool_selected' then page_view_id is not null and action_id is null and exposure_id is not null and job_id is null and image_id is null and rating is null
  when 'result_viewed' then page_view_id is not null and action_id is null and job_id is not null and image_id is not null and exposure_id is null and rating is null
  when 'feedback_submitted' then page_view_id is not null and action_id is null and job_id is not null and image_id is not null and exposure_id is null and rating is not null
 end)
);
create index analytics_window on public.analytics_events(environment,name,occurred_at,owner_id);
create index analytics_job on public.analytics_events(job_id,name,occurred_at) where job_id is not null;
create trigger analytics_events_immutable before update or delete on public.analytics_events for each row execute function public.console_append_only();

-- A durable intent before signing exposes an unconfirmed analytics write even
-- when the post-sign RPC fails. It is NOT counted as a successful save event.
create table public.console_download_actions (
 owner_id uuid not null references auth.users(id), action_id uuid not null, image_id uuid not null references public.images(id),
 job_id uuid not null references public.edit_jobs(id), environment text not null check(environment in ('test','live')),
 internal_account boolean not null, device text not null check(device in ('mobile','tablet','desktop','unknown')),
 state text not null default 'pending' check(state in ('pending','issued','failed','disabled')),
 created_at timestamptz not null default clock_timestamp(), issued_at timestamptz,
 primary key(owner_id,action_id)
);
create index console_download_unconfirmed on public.console_download_actions(created_at) where state='pending';

create function public.app_console_authorize(p_user_id uuid,p_permission text,p_request_id uuid,p_action text default 'analytics_read',p_target_id uuid default null,p_filter jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare rs jsonb; permissions jsonb;
begin
 if p_user_id is null or p_request_id is null or p_permission not in ('analytics:read','finance:read') or p_permission is null
 or p_action is null or p_action not in ('session','analytics_read','finance_read','export')
 or jsonb_typeof(p_filter) is distinct from 'object' or octet_length(p_filter::text)>4096 then raise exception 'INVALID_REQUEST';end if;
 select coalesce(jsonb_agg(role order by role),'[]') into rs from console_roles
 where user_id=p_user_id and revoked_at is null and (expires_at is null or expires_at>clock_timestamp());
 if rs='[]' or (p_permission='finance:read' and not (rs ?| array['finance','administrator'])) then raise exception 'FORBIDDEN';end if;
 permissions:=case when rs ?| array['finance','administrator'] then '["analytics:read","finance:read"]'::jsonb else '["analytics:read"]'::jsonb end;
 insert into console_audit(actor_id,action,request_id,target_id,filter_summary) values(p_user_id,p_action,p_request_id,p_target_id,p_filter);
 return jsonb_build_object('user_id',p_user_id,'roles',rs,'permissions',permissions,
  'environment',(select environment from console_settings where id),'collection_enabled',(select collection_enabled from console_settings where id));
end $$;

-- Browser values cannot set owner, trust, environment, model version or money.
-- Received time controls ordering; occurred time is an explicitly lower-trust observation.
create function public.app_console_record_event(p_user_id uuid,p_event jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare cfg console_settings;e analytics_events;j edit_jobs;prior analytics_events;n text;k text;ts timestamptz;eid uuid;pid uuid;xid uuid;jid uuid;tid text;r text;dev text;internal boolean;inserted integer;
begin
 if p_user_id is null or jsonb_typeof(p_event) is distinct from 'object' or octet_length(p_event::text)>2048 then raise exception 'INVALID_REQUEST';end if;
 n:=p_event->>'name';
 if n is null or n not in ('tool_exposed','tool_selected','result_viewed','feedback_submitted') then raise exception 'INVALID_REQUEST';end if;
 if not worker_json_keys(p_event,case n
  when 'tool_exposed' then array['name','event_id','occurred_at','device','page_view_id','tool_id','exposure_id','visible_ms','visible_ratio']
  when 'tool_selected' then array['name','event_id','occurred_at','device','page_view_id','tool_id','exposure_id']
  when 'result_viewed' then array['name','event_id','occurred_at','device','page_view_id','job_id']
  else array['name','event_id','occurred_at','device','page_view_id','job_id','rating'] end) then raise exception 'INVALID_REQUEST';end if;
 begin
  eid:=(p_event->>'event_id')::uuid;pid:=(p_event->>'page_view_id')::uuid;ts:=(p_event->>'occurred_at')::timestamptz;
  xid:=(p_event->>'exposure_id')::uuid;jid:=(p_event->>'job_id')::uuid;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then raise exception 'INVALID_REQUEST';end;
 dev:=p_event->>'device';tid:=p_event->>'tool_id';r:=p_event->>'rating';
 if eid is null or pid is null or ts is null or not isfinite(ts) or ts>clock_timestamp()+interval '5 minutes'
 or ts<clock_timestamp()-interval '24 hours' or dev is null or dev not in ('mobile','tablet','desktop','unknown') then raise exception 'INVALID_REQUEST';end if;
 select * into cfg from console_settings where id for share;
 if not cfg.collection_enabled then return jsonb_build_object('event_id',eid,'recording','disabled');end if;
 internal:=coalesce((select internal_account from console_user_tags where user_id=p_user_id),false);
 if n in ('tool_exposed','tool_selected') then
  if tid is null or tid !~ '^[a-z][a-z0-9_]{0,99}$' or xid is null then raise exception 'INVALID_REQUEST';end if;
  if n='tool_exposed' then
   if jsonb_typeof(p_event->'visible_ms') is distinct from 'number' or jsonb_typeof(p_event->'visible_ratio') is distinct from 'number'
    or p_event->>'visible_ms' !~ '^[0-9]+$' or (p_event->>'visible_ms')::numeric not between 1000 and 600000
    or (p_event->>'visible_ratio')::numeric not between 0.5 and 1 then raise exception 'INVALID_REQUEST';end if;
  else
   select * into prior from analytics_events where owner_id=p_user_id and name='tool_exposed' and exposure_id=xid and page_view_id=pid and tool_id=tid and environment=cfg.environment;
   if not found or ts<prior.occurred_at then raise exception 'INVALID_REQUEST';end if;
  end if;
  -- A page/tool pair has one visible exposure and first selection.
  k:=pid||':'||tid;
 else
  select * into j from edit_jobs where id=jid and owner_id=p_user_id and status='completed';
  if not found then raise exception 'NOT_FOUND';end if;
  if j.completed_at is null or ts<j.completed_at or j.analytics_environment<>cfg.environment then raise exception 'INVALID_REQUEST';end if;
  if n='result_viewed' and not exists(select 1 from images where id=j.result_image_id and owner_id=p_user_id and status='ready' and expires_at>clock_timestamp()) then raise exception 'NOT_FOUND';end if;
  if n='feedback_submitted' and (r is null or r not in ('positive','negative') or ts>j.completed_at+interval '7 days') then raise exception 'INVALID_REQUEST';end if;
  tid:=j.tool_id;internal:=j.analytics_internal;
  k:=case when n='result_viewed' then pid||':'||jid else eid::text end;
 end if;
 -- Serialize the two uniqueness keys without taking job/account locks. No
 -- collision can turn someone else's event into a successful replay.
 perform pg_advisory_xact_lock(hashtextextended(eid::text,37));
 select * into e from analytics_events where event_id=eid;
 if found then
  if row(e.owner_id,e.name,e.business_key,e.tool_id,e.page_view_id,e.exposure_id,e.job_id,e.rating,e.device,e.occurred_at)
   is distinct from row(p_user_id,n,k,tid,pid,xid,jid,r,dev,ts) then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return jsonb_build_object('event_id',eid,'recording','duplicate');
 end if;
 insert into analytics_events(event_id,name,owner_id,environment,internal_account,source,business_key,job_id,image_id,tool_id,page_view_id,exposure_id,device,rating,occurred_at)
 values(eid,n,p_user_id,cfg.environment,internal,'browser_observation',k,jid,j.result_image_id,tid,pid,xid,dev,r,ts)
 on conflict(owner_id,name,business_key) do nothing;
 get diagnostics inserted=row_count;
 return jsonb_build_object('event_id',eid,'recording',case when inserted=1 then 'recorded' else 'duplicate' end);
end $$;

create function public.app_console_begin_download(p_user_id uuid,p_image_id uuid,p_action_id uuid,p_device text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare im images;j edit_jobs;a console_download_actions;cfg console_settings;
begin
 if p_user_id is null or p_image_id is null or p_action_id is null or p_device is null or p_device not in ('mobile','tablet','desktop','unknown') then raise exception 'INVALID_REQUEST';end if;
 select * into im from images where id=p_image_id and owner_id=p_user_id and source_kind='generated' and status='ready' and expires_at>clock_timestamp();
 if not found then raise exception 'NOT_FOUND';end if;
 select * into j from edit_jobs where id=im.source_job_id and owner_id=p_user_id and status='completed' and result_image_id=im.id;
 if not found then raise exception 'NOT_FOUND';end if;
 select * into cfg from console_settings where id for share;
 select * into a from console_download_actions where owner_id=p_user_id and action_id=p_action_id;
 if found and row(a.image_id,a.device) is distinct from row(p_image_id,p_device) then raise exception 'IDEMPOTENCY_CONFLICT';end if;
 if not cfg.collection_enabled or j.analytics_environment<>cfg.environment then
  return jsonb_build_object('storage_key',im.storage_key,'capture',false);
 end if;
 insert into console_download_actions(owner_id,action_id,image_id,job_id,environment,internal_account,device)
 values(p_user_id,p_action_id,im.id,j.id,cfg.environment,j.analytics_internal,p_device) on conflict do nothing;
 -- Check AFTER a concurrent insert has resolved too.
 select * into a from console_download_actions where owner_id=p_user_id and action_id=p_action_id for update;
 if row(a.image_id,a.device) is distinct from row(p_image_id,p_device) then raise exception 'IDEMPOTENCY_CONFLICT';end if;
 return jsonb_build_object('storage_key',im.storage_key,'capture',true);
end $$;

create function public.app_console_finish_download(p_user_id uuid,p_action_id uuid,p_signed boolean) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare a console_download_actions;cfg console_settings;j edit_jobs;inserted integer;
begin
 if p_signed is null then raise exception 'INVALID_REQUEST';end if;
 select * into cfg from console_settings where id for share;
 select * into a from console_download_actions where owner_id=p_user_id and action_id=p_action_id for update;
 if not found then raise exception 'NOT_FOUND';end if;
 if not p_signed then
  update console_download_actions set state='failed' where owner_id=p_user_id and action_id=p_action_id and state<>'issued';
  return jsonb_build_object('recording','unavailable');
 end if;
 if not exists(select 1 from images where id=a.image_id and owner_id=p_user_id and status='ready' and expires_at>clock_timestamp()) then raise exception 'NOT_FOUND';end if;
 if not cfg.collection_enabled or cfg.environment<>a.environment then
  update console_download_actions set state='disabled' where owner_id=p_user_id and action_id=p_action_id and state<>'issued';
  return jsonb_build_object('recording','disabled');
 end if;
 select * into j from edit_jobs where id=a.job_id;
 insert into analytics_events(event_id,name,owner_id,environment,internal_account,source,business_key,job_id,image_id,tool_id,action_id,device,occurred_at)
 values(gen_random_uuid(),'download_url_issued',p_user_id,a.environment,a.internal_account,'server_download',p_action_id::text,a.job_id,a.image_id,j.tool_id,p_action_id,a.device,clock_timestamp())
 on conflict(owner_id,name,business_key) do nothing;
 get diagnostics inserted=row_count;
 update console_download_actions set state='issued',issued_at=coalesce(issued_at,clock_timestamp()) where owner_id=p_user_id and action_id=p_action_id;
 return jsonb_build_object('recording',case when inserted=1 then 'recorded' else 'duplicate' end);
end $$;

-- Neither ordinary users nor anonymous clients can query/alter operational
-- metadata. Every callable function below is service-only; JWT ownership is
-- verified in the API before passing its user id.
do $$ declare t text; f record;begin
 foreach t in array array['console_settings','console_collection_periods','console_roles','console_user_tags','console_audit','analytics_events','console_download_actions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and (p.proname like 'app_console_%' or p.proname like 'console_%') loop
  execute 'revoke all on function '||f.signature||' from public,anon,authenticated';
  execute 'grant execute on function '||f.signature||' to service_role';
 end loop;
end $$;
commit;
