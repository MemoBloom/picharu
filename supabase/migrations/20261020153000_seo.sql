begin;

create table public.seo_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check(role in ('editor','reviewer','admin'))
);
create table public.seo_pages (
 path text primary key check(path ~ '^/ja(/tools(/[a-z_]+)?|/guides(/[a-z0-9-]+)?|/help)?$'),
 published_revision uuid,
 updated_at timestamptz not null default now()
);
create table public.seo_revisions (
 id uuid primary key default gen_random_uuid(), path text not null references public.seo_pages(path), base_revision uuid,
 content jsonb not null check((jsonb_typeof(content)='object' and content ?& array['path','kind','title','description','h1','lead','sections','faq','keywords','related_tools','indexable','examples','updated_at'] and jsonb_typeof(content->'indexable')='boolean' and length(content->>'title') between 3 and 100 and length(content->>'description') between 20 and 240 and length(content->>'h1')>=3 and jsonb_typeof(content->'sections')='array' and jsonb_array_length(content->'sections')>=1 and content->>'path'=path) is true),
 state text not null default 'draft' check(state in ('draft','submitted','approved','published')),
 author_id uuid not null references auth.users(id), reviewer_id uuid references auth.users(id),
 created_at timestamptz not null default now(), check(reviewer_id is null or reviewer_id<>author_id)
);
alter table public.seo_pages add constraint seo_published_revision_fk foreign key(published_revision) references public.seo_revisions(id);
create table public.seo_changes (
 operation_id uuid primary key, actor_id uuid not null references auth.users(id),
 action text not null, path text not null, previous_revision uuid, revision_id uuid not null,
 request_fingerprint text not null, result jsonb not null, created_at timestamptz not null default now()
);
create table public.seo_ingestions (
 id uuid primary key, source text not null check(source in ('gsc','ga4','serp','keyword_planner','trends')),
 property text not null, day date not null, grain text not null,
 is_fixture boolean not null default false, status text not null default 'pending' check(status in ('pending','complete','empty','failed')),
 quality jsonb not null default '{}', error_code text, expected_batches integer,
 created_at timestamptz not null default now(), completed_at timestamptz
);
create table public.seo_ingestion_batches (
 run_id uuid not null references public.seo_ingestions(id) on delete cascade, batch integer not null check(batch>=0),
 rows jsonb not null check(jsonb_typeof(rows)='array' and jsonb_array_length(rows)<=1000), fingerprint text not null,
 primary key(run_id,batch)
);
create table public.seo_metrics (
 source text not null, property text not null, day date not null, grain text not null, is_fixture boolean not null,
 dimensions jsonb not null check(jsonb_typeof(dimensions)='object'),
 measures jsonb not null check(jsonb_typeof(measures)='object'), run_id uuid not null references public.seo_ingestions(id),
 primary key(source,property,day,grain,is_fixture,dimensions)
);
create index seo_metrics_page_idx on public.seo_metrics ((dimensions->>'page'),day);
create index seo_ingestions_date_idx on public.seo_ingestions(created_at desc);
create table public.seo_webhook_nonces (nonce uuid primary key, used_at timestamptz not null default now());

create function public.seo_revision_immutable() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.id<>old.id or new.path<>old.path or new.content<>old.content or new.author_id<>old.author_id or new.created_at<>old.created_at or new.base_revision is distinct from old.base_revision then
  raise exception 'SEO_IMMUTABLE_REVISION';
 end if;
 return new;
end $$;
create trigger seo_revision_immutable before update on public.seo_revisions for each row execute function public.seo_revision_immutable();

create function public.seo_require_role(p_actor uuid,p_roles text[]) returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare found text;
begin
 select role into found from seo_members where user_id=p_actor;
 if found is null or not found=any(p_roles) then raise exception 'SEO_FORBIDDEN'; end if;
 return found;
end $$;

create function public.seo_save_draft(p_actor uuid,p_content jsonb,p_expected_revision uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_path text; v_current uuid; v_id uuid;
begin
 perform seo_require_role(p_actor,array['editor','reviewer','admin']);
 v_path:=p_content->>'path';
 if v_path is null or jsonb_typeof(p_content->'sections')<>'array' or jsonb_array_length(p_content->'sections')<1 then raise exception 'SEO_INVALID_CONTENT'; end if;
 if (p_content->>'indexable')::boolean and p_content->>'kind'='tool' and coalesce(jsonb_array_length(p_content->'examples'),0)=0 then raise exception 'SEO_EVIDENCE_REQUIRED'; end if;
 insert into seo_pages(path) values(v_path) on conflict do nothing;
 select published_revision into v_current from seo_pages where path=v_path for update;
 if v_current is distinct from p_expected_revision then raise exception 'SEO_REVISION_CONFLICT'; end if;
 insert into seo_revisions(path,content,author_id,base_revision) values(v_path,p_content,p_actor,p_expected_revision) returning id into v_id;
 return jsonb_build_object('id',v_id,'state','draft','path',v_path);
end $$;

create function public.seo_transition(p_actor uuid,p_revision uuid,p_action text,p_expected_revision uuid,p_operation uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r seo_revisions; p seo_pages; existing seo_changes; fingerprint text; result jsonb;
begin
 fingerprint:=md5(jsonb_build_array(p_actor,p_revision,p_action,p_expected_revision)::text);
 perform pg_advisory_xact_lock(hashtextextended(p_operation::text,0));
 select * into existing from seo_changes where operation_id=p_operation;
 if found then
  if existing.request_fingerprint<>fingerprint then raise exception 'SEO_IDEMPOTENCY_CONFLICT'; end if;
  return existing.result;
 end if;
 select * into r from seo_revisions where id=p_revision;
 if not found then raise exception 'SEO_NOT_FOUND'; end if;
 select * into p from seo_pages where path=r.path for update;
 select * into r from seo_revisions where id=p_revision for update;
 if p_action='submit' then
  perform seo_require_role(p_actor,array['editor','reviewer','admin']);
  if r.author_id<>p_actor or r.state<>'draft' then raise exception 'SEO_INVALID_TRANSITION'; end if;
  update seo_revisions set state='submitted' where id=r.id;
 elsif p_action='approve' then
  perform seo_require_role(p_actor,array['reviewer','admin']);
  if r.author_id=p_actor then raise exception 'SEO_SELF_REVIEW'; end if;
  if r.state<>'submitted' then raise exception 'SEO_INVALID_TRANSITION'; end if;
  update seo_revisions set state='approved',reviewer_id=p_actor where id=r.id;
 elsif p_action in ('publish','rollback') then
  perform seo_require_role(p_actor,array['reviewer','admin']);
  if p.published_revision is distinct from p_expected_revision or (p_action='publish' and r.base_revision is distinct from p_expected_revision) then raise exception 'SEO_REVISION_CONFLICT'; end if;
  if r.reviewer_id is null or (p_action='publish' and r.state<>'approved') or (p_action='rollback' and r.state<>'published') then raise exception 'SEO_UNAPPROVED_CONTENT'; end if;
  if (r.content->>'indexable')::boolean and r.content->>'kind'='tool' and coalesce(jsonb_array_length(r.content->'examples'),0)=0 then raise exception 'SEO_EVIDENCE_REQUIRED'; end if;
  update seo_revisions set state='published' where id=r.id;
  update seo_pages set published_revision=r.id,updated_at=now() where path=r.path;
 else raise exception 'SEO_INVALID_TRANSITION';
 end if;
 result:=jsonb_build_object('revision_id',r.id,'path',r.path,'action',p_action,'previous_revision',p.published_revision);
 insert into seo_changes(operation_id,actor_id,action,path,previous_revision,revision_id,request_fingerprint,result) values(p_operation,p_actor,p_action,r.path,p.published_revision,r.id,fingerprint,result);
 return result;
end $$;

create function public.seo_get_revision(p_actor uuid,p_revision uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r seo_revisions;
begin
 perform seo_require_role(p_actor,array['editor','reviewer','admin']);
 select * into r from seo_revisions where id=p_revision;if not found then raise exception 'SEO_NOT_FOUND';end if;
 return to_jsonb(r);
end $$;

create function public.seo_get_published(p_path text default null) returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('revision',r.id,'content',r.content,'source','database') order by p.path),'[]'::jsonb)
 from seo_pages p join seo_revisions r on r.id=p.published_revision and r.path=p.path
 where p_path is null or p.path=p_path;
$$;

create function public.seo_ingest_begin(p_id uuid,p_source text,p_property text,p_day date,p_grain text,p_fixture boolean,p_quality jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r seo_ingestions;
begin
 if p_property is null or length(p_property) not between 1 and 500 or p_grain is null or length(p_grain) not between 1 and 100 then raise exception 'SEO_INVALID_DATA'; end if;
 insert into seo_ingestions(id,source,property,day,grain,is_fixture,quality) values(p_id,p_source,p_property,p_day,p_grain,p_fixture,p_quality) on conflict do nothing;
 select * into r from seo_ingestions where id=p_id;
 if r.source<>p_source or r.property<>p_property or r.day<>p_day or r.grain<>p_grain or r.is_fixture<>p_fixture or r.quality<>p_quality then raise exception 'SEO_IDEMPOTENCY_CONFLICT'; end if;
end $$;
create function public.seo_ingest_stage(p_id uuid,p_batch integer,p_rows jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r seo_ingestions; previous text; fingerprint text;
begin
 select * into r from seo_ingestions where id=p_id for update;
 if not found or r.status<>'pending' then raise exception 'SEO_INVALID_TRANSITION'; end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>1000 or p_batch is null or p_batch<0 then raise exception 'SEO_INVALID_DATA'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) x where jsonb_typeof(x->'dimensions') is distinct from 'object' or jsonb_typeof(x->'measures') is distinct from 'object' or length((x->'dimensions')::text)>2000) then raise exception 'SEO_INVALID_DATA'; end if;
 fingerprint:=md5(p_rows::text);
 select b.fingerprint into previous from seo_ingestion_batches b where run_id=p_id and batch=p_batch;
 if found and previous<>fingerprint then raise exception 'SEO_IDEMPOTENCY_CONFLICT'; end if;
 insert into seo_ingestion_batches(run_id,batch,rows,fingerprint) values(p_id,p_batch,p_rows,fingerprint) on conflict do nothing;
end $$;
create function public.seo_ingest_finish(p_id uuid,p_batches integer,p_error text default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r seo_ingestions; count_batches integer; max_batch integer; n integer;
begin
 select * into r from seo_ingestions where id=p_id for update;
 if not found then raise exception 'SEO_NOT_FOUND'; end if;
 if r.status<>'pending' then return jsonb_build_object('status',r.status); end if;
 if p_error is not null then
  update seo_ingestions set status='failed',error_code=left(p_error,100),completed_at=now() where id=p_id;
  return jsonb_build_object('status','failed');
 end if;
 select count(*),max(batch) into count_batches,max_batch from seo_ingestion_batches where run_id=p_id;
 if p_batches is null or p_batches<0 or count_batches<>p_batches or (p_batches>0 and max_batch<>p_batches-1) then raise exception 'SEO_INCOMPLETE_IMPORT'; end if;
 perform pg_advisory_xact_lock(hashtextextended(jsonb_build_array(r.source,r.property,r.day,r.grain,r.is_fixture)::text,0));
 if exists(select 1 from seo_ingestions newer where newer.id<>r.id and newer.source=r.source and newer.property=r.property and newer.day=r.day and newer.grain=r.grain and newer.is_fixture=r.is_fixture and newer.status in ('complete','empty') and (newer.created_at,newer.id)>(r.created_at,r.id)) then
  update seo_ingestions set status='failed',error_code='STALE_IMPORT',completed_at=now() where id=p_id;
  return jsonb_build_object('status','failed','error_code','STALE_IMPORT');
 end if;
 delete from seo_metrics where source=r.source and property=r.property and day=r.day and grain=r.grain and is_fixture=r.is_fixture;
 insert into seo_metrics(source,property,day,grain,is_fixture,dimensions,measures,run_id)
 select r.source,r.property,r.day,r.grain,r.is_fixture,item->'dimensions',item->'measures',r.id
 from seo_ingestion_batches b cross join lateral jsonb_array_elements(b.rows) item where b.run_id=p_id;
 get diagnostics n=row_count;
 update seo_ingestions set status=case when n=0 then 'empty' else 'complete' end,expected_batches=p_batches,completed_at=now() where id=p_id;
 return jsonb_build_object('status',case when n=0 then 'empty' else 'complete' end,'rows',n);
end $$;

create function public.seo_consume_nonce(p_nonce uuid) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
 delete from seo_webhook_nonces where used_at<now()-interval '1 day';
 insert into seo_webhook_nonces(nonce) values(p_nonce) on conflict do nothing;
 get diagnostics n=row_count;return n=1;
end $$;

create function public.seo_dashboard(p_actor uuid,p_fixture boolean default false,p_gsc_property text default 'sc-domain:picmoko.com') returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
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
   sum((measures->>'position')::numeric*(measures->>'impressions')::numeric)/nullif(sum((measures->>'impressions')::numeric),0) position,count(distinct day) observed_days
   from seo_metrics where is_fixture=p_fixture and source='gsc' and property=p_gsc_property and grain='page' and dimensions->>'country'='JP' and day between current_date-27 and current_date group by dimensions->>'page'
  ) r),
  'is_fixture',p_fixture
 );
end $$;

do $$ declare t text; f record; begin
 foreach t in array array['seo_members','seo_pages','seo_revisions','seo_changes','seo_ingestions','seo_ingestion_batches','seo_metrics','seo_webhook_nonces'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'seo_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
