-- Worker v1. Additive migration; requires 202610190001_web_backend.sql.
begin;
alter table public.images alter column declared_mime drop not null, alter column declared_bytes drop not null, alter column temp_key drop not null;
alter table public.images add column source_kind text not null default 'upload' check(source_kind in ('upload','generated')),
 add column source_job_id uuid references public.edit_jobs(id);
alter table public.images add constraint image_source check(
 (source_kind='upload' and declared_mime is not null and declared_bytes is not null and temp_key is not null and source_job_id is null)
 or (source_kind='generated' and source_job_id is not null and temp_key is null and declared_mime is null and declared_bytes is null));
alter table public.edit_jobs add column lease_version bigint not null default 0,
 add column lease_owner text, add column next_attempt_at timestamptz not null default now(),
 add column recovery_deadline_at timestamptz not null default (now()+interval '30 minutes'),
 add column current_attempt_id uuid, add column internal_error_code text;
create index worker_due on public.edit_jobs(next_attempt_at,created_at,id) where status in ('queued','processing');
create table public.provider_budgets (
 provider text not null, model_id text not null, adapter_version text not null,
 currency text not null check(currency ~ '^[A-Z]{3}$'), limit_minor bigint not null check(limit_minor>=0),
 estimate_minor bigint not null check(estimate_minor>0), reserved_minor bigint not null default 0 check(reserved_minor>=0),
 committed_minor bigint not null default 0 check(committed_minor>=0), active_count integer not null default 0 check(active_count>=0),
 max_inflight integer not null check(max_inflight>0), enabled boolean not null default false, cooldown_until timestamptz,
 primary key(provider,model_id,adapter_version)
); -- Cumulative spend cap, never resets automatically. Unknown costs retain reservations.
create table public.job_attempts (
 id uuid primary key default gen_random_uuid(),job_id uuid not null unique references public.edit_jobs(id),
 attempt_no integer not null default 1, provider text not null,model_id text not null,adapter_version text not null,
 provider_request_key text not null unique,provider_job_id text,state text not null default 'prepared' check(state in ('prepared','accepted','succeeded','failed','uncertain')),
 submitted_at timestamptz,result_ref jsonb,result_expires_at timestamptz,
 poll_count integer not null default 0,transport_retry_count integer not null default 0,
 estimated_cost jsonb not null,actual_cost jsonb,evidence jsonb,finalized boolean not null default false,
 created_at timestamptz not null default now()
);
alter table public.edit_jobs add constraint current_attempt_fk foreign key(current_attempt_id) references public.job_attempts(id);
create table public.job_artifacts (
 job_id uuid not null references public.edit_jobs(id),attempt_id uuid not null references public.job_attempts(id),
 kind text not null check(kind in ('provider_output','result','preview')),manifest jsonb not null,
 state text not null check(state in ('candidate','committed','tombstoned')),primary key(job_id,kind)
);
create table public.object_cleanup_tasks (
 id uuid primary key default gen_random_uuid(),storage_key text not null unique,reason text not null,image_id uuid references public.images(id),
 state text not null default 'pending' check(state in ('pending','done')),next_attempt_at timestamptz not null default now(),
 attempt_count integer not null default 0,lease_token uuid,lease_expires_at timestamptz,last_error text
);

create function public.worker_image_immutable() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.owner_id is distinct from old.owner_id or new.source_kind is distinct from old.source_kind or new.source_job_id is distinct from old.source_job_id then raise exception 'IMMUTABLE_IMAGE';end if;
 if old.status in ('ready','deleted') and row(new.storage_key,new.preview_key,new.sha256,new.mime_type,new.bytes,new.width,new.height) is distinct from row(old.storage_key,old.preview_key,old.sha256,old.mime_type,old.bytes,old.width,old.height) then raise exception 'IMMUTABLE_IMAGE';end if;
 if old.status='deleted' and new.status<>'deleted' then raise exception 'IMMUTABLE_IMAGE';end if;
 return new;
end $$;
create trigger worker_image_immutable before update on public.images for each row execute function public.worker_image_immutable();

-- Helpers are also revoked below. All public mutations take owner advisory BEFORE job row.
create function public.worker_lock_job(p_job_id uuid) returns public.edit_jobs language plpgsql security definer set search_path=public,pg_temp as $$
declare j edit_jobs; u uuid;
begin
 select owner_id into u from edit_jobs where id=p_job_id;
 if u is null then raise exception 'NOT_FOUND'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select * into j from edit_jobs where id=p_job_id for update;
 return j;
end $$;
create function public.worker_check_lease(j public.edit_jobs,t uuid,v bigint) returns void language plpgsql set search_path=public,pg_temp as $$
begin
 if t is null or v is null or j.status<>'processing' or j.lease_token is distinct from t or j.lease_version is distinct from v or j.lease_expires_at<=clock_timestamp() or j.lease_expires_at is null then raise exception 'STALE_LEASE'; end if;
end $$;
create function public.worker_json_keys(j jsonb,ks text[]) returns boolean language sql immutable set search_path=public,pg_temp as $$
 select coalesce(jsonb_typeof(j)='object' and (select array_agg(k order by k) from jsonb_object_keys(j) k)=(select array_agg(k order by k) from unnest(ks) k),false)
$$;
create function public.worker_cost_valid(c jsonb) returns boolean language plpgsql immutable set search_path=public,pg_temp as $$
begin
 return coalesce(c is null or c='null'::jsonb or (jsonb_typeof(c->'currency')='string' and jsonb_typeof(c->'amount_minor')='number' and jsonb_typeof(c->'evidence')='string' and (c->'provider_reference'='null'::jsonb or jsonb_typeof(c->'provider_reference')='string') and worker_json_keys(c,array['currency','amount_minor','evidence','provider_reference']) and c->>'currency' ~ '^[A-Z]{3}$' and c->>'amount_minor' ~ '^[0-9]+$' and (c->>'amount_minor')::numeric<=9007199254740991 and c->>'evidence' in ('provider_report','invoice','estimate') and (c->'provider_reference'='null'::jsonb or length(c->>'provider_reference')<=128)),false);
end $$;
create function public.worker_ref_valid(r jsonb) returns boolean language sql immutable set search_path=public,pg_temp as $$
 select coalesce(r is null or r='null'::jsonb or (worker_json_keys(r,array['kind','locator','provider']) and jsonb_typeof(r->'kind')='string' and jsonb_typeof(r->'locator')='string' and jsonb_typeof(r->'provider')='string' and r->>'kind' in ('url','provider_asset') and length(r->>'locator') between 1 and 4096 and length(r->>'provider') between 1 and 128),false)
$$;
create function public.worker_checkpoint_empty() returns jsonb language sql immutable as $$
 select '{"provider_state":null,"result_ref":null,"result_expires_at":null,"artifacts":[],"poll_count":0,"transport_retry_count":0,"error_class":null}'::jsonb
$$;
create function public.worker_manifest_valid(m jsonb,owner uuid,job uuid,attempt uuid,complete boolean) returns boolean language plpgsql immutable set search_path=public,pg_temp as $$
declare a jsonb; prefix text:='results/'||owner||'/'||job||'/'||attempt||'/'; k text; seen text[]:=array[]::text[];
begin
 if jsonb_typeof(m) is distinct from 'array' or octet_length(m::text)>65536 or jsonb_array_length(m)>3 then return false; end if;
 for a in select value from jsonb_array_elements(m) loop
  if not worker_json_keys(a,array['kind','storage_key','sha256','mime_type','bytes','width','height']) then return false; end if;
  if exists(select 1 from jsonb_each(a) x where x.value='null'::jsonb or (x.key in ('bytes','width','height') and jsonb_typeof(x.value)<>'number') or (x.key not in ('bytes','width','height') and jsonb_typeof(x.value)<>'string')) then return false;end if;
  k:=a->>'kind';
  if k not in ('provider_output','result','preview') or k=any(seen) or a->>'sha256' !~ '^[a-f0-9]{64}$' or a->>'bytes' !~ '^[1-9][0-9]*$' or a->>'width' !~ '^[1-9][0-9]*$' or a->>'height' !~ '^[1-9][0-9]*$' then return false; end if;
  if (a->>'bytes')::numeric>33554432 or (a->>'width')::numeric*(a->>'height')::numeric>24000000 or a->>'mime_type' not in ('image/png','image/jpeg','image/webp') then return false; end if;
  if a->>'storage_key' is distinct from (prefix||(a->>'sha256')||case when k='preview' then '.jpg' else '.png' end) then return false; end if;
  if k='result' and a->>'mime_type'<>'image/png' then return false; end if;
  if k='preview' and (a->>'mime_type'<>'image/jpeg' or (a->>'bytes')::numeric>1048576 or greatest((a->>'width')::numeric,(a->>'height')::numeric)>768) then return false; end if;
  seen:=array_append(seen,k);
 end loop;
 return not complete or (array['result','preview']<@seen);
exception when others then return false;
end $$;
create function public.worker_attempt_json(a public.job_attempts) returns jsonb language sql stable as $$
 select jsonb_build_object('attempt_id',a.id,'attempt_no',a.attempt_no,'provider',a.provider,'model_id',a.model_id,'adapter_version',a.adapter_version,'provider_request_key',a.provider_request_key,'provider_job_id',a.provider_job_id,'state',a.state,'submitted_at',a.submitted_at,'result_ref',a.result_ref,'result_expires_at',a.result_expires_at,'poll_count',a.poll_count,'transport_retry_count',a.transport_retry_count,'estimated_cost',a.estimated_cost,'actual_cost',a.actual_cost)
$$;

create function public.worker_claim_jobs(p_worker_id text,p_limit integer,p_supported_versions jsonb,p_lease_seconds integer default 270,p_job_id uuid default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c record;j edit_jobs;a job_attempts;b provider_budgets;assets jsonb;claims jsonb:='[]';e text;fresh boolean;supported boolean;sv jsonb;sk jsonb:='{"not_due":0,"leased":0,"terminal":0,"unsupported":0,"backpressure":0}';
begin
 if p_worker_id is null or length(p_worker_id) not between 1 and 128 or p_limit is null or p_limit not between 1 and 20 or p_lease_seconds is null or p_lease_seconds not between 30 and 900 or jsonb_typeof(p_supported_versions) is distinct from 'array' or jsonb_array_length(p_supported_versions)>50 then raise exception 'INVALID_REQUEST'; end if;
 for sv in select value from jsonb_array_elements(p_supported_versions) loop
  if not worker_json_keys(sv,array['contract_version','execution_type','execution_version','provider','adapter_version']) then raise exception 'INVALID_REQUEST'; end if;
 end loop;
 for c in select id,owner_id from edit_jobs where status in ('queued','processing') and (p_job_id is null or id=p_job_id)
  order by case when status='processing' then 0 else 1 end,next_attempt_at,created_at,id limit 100 loop
  exit when jsonb_array_length(claims)>=p_limit;
  if not pg_try_advisory_xact_lock(hashtextextended(c.owner_id::text,0)) then continue; end if;
  select * into j from edit_jobs where id=c.id and status in ('queued','processing') for update skip locked;
  if not found then continue; end if;
  if j.lease_expires_at>clock_timestamp() then sk:=jsonb_set(sk,'{leased}',to_jsonb((sk->>'leased')::int+1));continue;end if;
  if j.next_attempt_at>clock_timestamp() and j.recovery_deadline_at>clock_timestamp() then sk:=jsonb_set(sk,'{not_due}',to_jsonb((sk->>'not_due')::int+1));continue;end if;
  supported:=exists(select 1 from jsonb_array_elements(p_supported_versions) v where v->>'contract_version'=j.snapshot->>'contract_version' and v->>'execution_type'=j.snapshot->>'execution_type' and v->>'execution_version'=j.snapshot->>'execution_version' and v->>'provider'=j.snapshot->'model_profile'->>'provider' and v->>'adapter_version'=j.snapshot->'model_profile'->>'adapter_version');
  e:=null;fresh:=false;a:=null;assets:='[]';
  if j.recovery_deadline_at<=clock_timestamp() then e:=case when supported then 'JOB_EXPIRED' else 'UNSUPPORTED_SNAPSHOT' end;
  elsif not supported then sk:=jsonb_set(sk,'{unsupported}',to_jsonb((sk->>'unsupported')::int+1));continue;end if;
  if j.current_attempt_id is not null then select * into a from job_attempts where id=j.current_attempt_id; end if;
  if j.status='queued' and e is null then
   -- Same deterministic image row ordering as Web creation; protects expiry/deletion.
   perform 1 from images where id in (select image_id from job_inputs where job_id=j.id) order by id for update;
   select coalesce(jsonb_agg(jsonb_build_object('image_id',im.id,'role',i.role,'position',i.position,'storage_key',im.storage_key,'sha256',im.sha256,'mime_type',im.mime_type,'bytes',im.bytes,'width',im.width,'height',im.height) order by i.position),'[]') into assets from job_inputs i join images im on im.id=i.image_id where i.job_id=j.id and im.owner_id=j.owner_id and im.status='ready' and im.expires_at>clock_timestamp();
   if jsonb_array_length(assets)<>jsonb_array_length(j.inputs) or assets='[]' then e:='ASSET_UNAVAILABLE'; end if;
   if not exists(select 1 from credit_accounts where owner_id=j.owner_id and status='active') then e:='ACCOUNT_RESTRICTED';end if;
   if e is null then
    select * into b from provider_budgets where provider=j.snapshot->'model_profile'->>'provider' and model_id=j.snapshot->'model_profile'->>'model_id' and adapter_version=j.snapshot->'model_profile'->>'adapter_version' for update;
    if not found or not b.enabled or b.cooldown_until>clock_timestamp() or b.active_count>=b.max_inflight or b.reserved_minor+b.committed_minor+b.estimate_minor>b.limit_minor then sk:=jsonb_set(sk,'{backpressure}',to_jsonb((sk->>'backpressure')::int+1));continue;end if;
    insert into job_attempts(job_id,provider,model_id,adapter_version,provider_request_key,estimated_cost) values(j.id,b.provider,b.model_id,b.adapter_version,gen_random_uuid()::text,jsonb_build_object('currency',b.currency,'amount_minor',b.estimate_minor,'evidence','estimate','provider_reference',null)) returning * into a;
    update provider_budgets set reserved_minor=reserved_minor+b.estimate_minor,active_count=active_count+1 where provider=b.provider and model_id=b.model_id and adapter_version=b.adapter_version;
    fresh:=true;
   end if;
  elsif e is null then
   select coalesce(jsonb_agg(jsonb_build_object('image_id',im.id,'role',i.role,'position',i.position,'storage_key',im.storage_key,'sha256',im.sha256,'mime_type',im.mime_type,'bytes',im.bytes,'width',im.width,'height',im.height) order by i.position),'[]') into assets from job_inputs i join images im on im.id=i.image_id where i.job_id=j.id and im.owner_id=j.owner_id and im.status='ready';
  end if;
  update edit_jobs set status='processing',stage=case when status='queued' then 'submitting' else stage end,current_attempt_id=a.id,attempt_count=case when fresh then 1 else attempt_count end,provider_request_id=a.provider_request_key,
   lease_token=gen_random_uuid(),lease_version=lease_version+1,lease_owner=p_worker_id,lease_expires_at=clock_timestamp()+make_interval(secs=>p_lease_seconds),checkpoint=case when checkpoint='{}' then worker_checkpoint_empty() else checkpoint end,updated_at=now() where id=j.id returning * into j;
  claims:=claims||jsonb_build_array(jsonb_build_object('job_id',j.id,'owner_id',j.owner_id,'status',j.status,'stage',j.stage,'lease_token',j.lease_token,'lease_version',j.lease_version,'lease_expires_at',j.lease_expires_at,'recovery_deadline_at',j.recovery_deadline_at,'snapshot',j.snapshot,'input_assets',assets,'attempt',case when a.id is null then null else worker_attempt_json(a) end,'artifact_manifest',j.checkpoint->'artifacts','preflight_error',e,'fresh_submission',fresh,'checkpoint',j.checkpoint));
 end loop;
 return jsonb_build_object('claims',claims,'skipped',sk);
end $$;

create function public.worker_record_submission(p_job_id uuid,p_lease_token uuid,p_lease_version bigint,p_attempt_id uuid,p_provider_state text,p_provider_job_id text default null,p_result_ref jsonb default null,p_result_expires_at timestamptz default null,p_next_attempt_at timestamptz default null,p_provider_usage jsonb default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare j edit_jobs;a job_attempts;st text;cp jsonb;
begin
 j:=worker_lock_job(p_job_id);perform worker_check_lease(j,p_lease_token,p_lease_version);
 if j.current_attempt_id is distinct from p_attempt_id or j.stage not in ('submitting','waiting_provider','needs_reconciliation') or p_provider_state is null or p_provider_state not in ('accepted','succeeded') or not worker_ref_valid(p_result_ref) or octet_length(coalesce(p_result_ref::text,''))>65536 then raise exception 'INVALID_TRANSITION';end if;
 select * into a from job_attempts where id=p_attempt_id;
 if p_provider_job_id is not null and length(p_provider_job_id) not between 1 and 512 or a.provider_job_id is not null and a.provider_job_id is distinct from p_provider_job_id or p_result_ref is not null and p_result_ref->>'provider' is distinct from a.provider then raise exception 'INVALID_CHECKPOINT';end if;
 if p_provider_state='accepted' and (p_provider_job_id is null or p_next_attempt_at is null) or p_provider_state='succeeded' and (p_result_ref is null or p_result_ref='null'::jsonb) then raise exception 'INVALID_CHECKPOINT';end if;
 if p_provider_usage is not null and (not worker_json_keys(p_provider_usage,array['cost','output_count']) or not worker_cost_valid(p_provider_usage->'cost') or not (p_provider_usage->'output_count'='null'::jsonb or p_provider_usage->>'output_count' ~ '^[0-9]+$')) then raise exception 'INVALID_CHECKPOINT';end if;
 if nullif(p_provider_usage->'cost','null'::jsonb) is not null and p_provider_usage->'cost'->>'currency' is distinct from a.estimated_cost->>'currency' then raise exception 'INVALID_COST';end if;
 st:=case when p_provider_state='accepted' then 'waiting_provider' else 'storing' end;
 cp:=j.checkpoint||jsonb_build_object('provider_state',case when p_provider_state='accepted' then 'pending' else 'succeeded' end,'result_ref',p_result_ref,'result_expires_at',p_result_expires_at);
 update job_attempts set state=p_provider_state,provider_job_id=coalesce(provider_job_id,p_provider_job_id),submitted_at=coalesce(submitted_at,now()),result_ref=p_result_ref,result_expires_at=p_result_expires_at,actual_cost=coalesce(nullif(p_provider_usage->'cost','null'::jsonb),actual_cost) where id=p_attempt_id;
 update edit_jobs set stage=st,checkpoint=cp,provider_job_id=p_provider_job_id,next_attempt_at=case when st='storing' then now() else p_next_attempt_at end,lease_expires_at=null,lease_token=null,updated_at=now() where id=j.id returning * into j;
 return jsonb_build_object('applied',true,'status',j.status,'stage',j.stage,'next_attempt_at',j.next_attempt_at);
end $$;

create function public.worker_defer_job(p_job_id uuid,p_lease_token uuid,p_lease_version bigint,p_attempt_id uuid,p_stage text,p_next_attempt_at timestamptz,p_checkpoint jsonb,p_reason text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare j edit_jobs;a jsonb;ar job_artifacts;
begin
 j:=worker_lock_job(p_job_id);perform worker_check_lease(j,p_lease_token,p_lease_version);
 if j.current_attempt_id is distinct from p_attempt_id or p_attempt_id is null or p_next_attempt_at is null or length(p_reason) not between 1 and 128 or p_reason is null or p_stage is null then raise exception 'INVALID_TRANSITION';end if;
 if not ((j.stage='waiting_provider' and p_stage='waiting_provider') or (j.stage='storing' and p_stage in ('storing','settling')) or (j.stage='settling' and p_stage='settling') or (j.stage='needs_reconciliation' and p_stage='needs_reconciliation')) then raise exception 'INVALID_TRANSITION';end if;
 if (p_checkpoint->'provider_state'<>'null'::jsonb and jsonb_typeof(p_checkpoint->'provider_state') is distinct from 'string') or (p_checkpoint->'error_class'<>'null'::jsonb and jsonb_typeof(p_checkpoint->'error_class') is distinct from 'string') or not worker_json_keys(p_checkpoint,array['provider_state','result_ref','result_expires_at','artifacts','poll_count','transport_retry_count','error_class']) or octet_length(p_checkpoint::text)>65536 or not worker_ref_valid(p_checkpoint->'result_ref') or (p_checkpoint->'result_ref') is distinct from (j.checkpoint->'result_ref') or p_checkpoint->'result_expires_at' is distinct from j.checkpoint->'result_expires_at' or not worker_manifest_valid(p_checkpoint->'artifacts',j.owner_id,j.id,p_attempt_id,p_stage='settling') or coalesce(p_checkpoint->>'provider_state','null') not in ('null','pending','succeeded','failed','unknown') or jsonb_typeof(p_checkpoint->'poll_count') is distinct from 'number' or jsonb_typeof(p_checkpoint->'transport_retry_count') is distinct from 'number' or p_checkpoint->>'poll_count' !~ '^[0-9]+$' or p_checkpoint->>'transport_retry_count' !~ '^[0-9]+$' or (p_checkpoint->>'poll_count')::numeric<(j.checkpoint->>'poll_count')::numeric or (p_checkpoint->>'transport_retry_count')::numeric<(j.checkpoint->>'transport_retry_count')::numeric or (p_checkpoint->'error_class'<>'null'::jsonb and length(p_checkpoint->>'error_class') not between 1 and 128) then raise exception 'INVALID_CHECKPOINT';end if;
 for a in select value from jsonb_array_elements(p_checkpoint->'artifacts') loop
  select * into ar from job_artifacts where job_id=j.id and kind=a->>'kind';
  if found and ar.manifest is distinct from a then raise exception 'INVALID_CHECKPOINT';end if;
  insert into job_artifacts(job_id,attempt_id,kind,manifest,state) values(j.id,p_attempt_id,a->>'kind',a,'candidate') on conflict do nothing;
 end loop;
 update job_attempts set poll_count=(p_checkpoint->>'poll_count')::int,transport_retry_count=(p_checkpoint->>'transport_retry_count')::int where id=p_attempt_id;
 update edit_jobs set checkpoint=p_checkpoint,stage=p_stage,next_attempt_at=p_next_attempt_at,lease_token=null,lease_expires_at=null,updated_at=now() where id=j.id;
 return jsonb_build_object('applied',true,'status','processing','stage',p_stage,'next_attempt_at',p_next_attempt_at);
end $$;

create function public.worker_mark_uncertain(p_job_id uuid,p_lease_token uuid,p_lease_version bigint,p_attempt_id uuid,p_reason text,p_next_attempt_at timestamptz,p_evidence jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare j edit_jobs;a job_attempts;
begin
 j:=worker_lock_job(p_job_id);perform worker_check_lease(j,p_lease_token,p_lease_version);
 if j.current_attempt_id is distinct from p_attempt_id or j.stage not in ('submitting','needs_reconciliation') or p_attempt_id is null or p_next_attempt_at is null or p_reason is null or length(p_reason) not between 1 and 128 then raise exception 'INVALID_TRANSITION';end if;
 select * into a from job_attempts where id=p_attempt_id;
 if not worker_json_keys(p_evidence,array['provider_request_key','operation','started_at','observed_at','transport_phase','http_status','reason_code']) or p_evidence->>'provider_request_key' is distinct from a.provider_request_key or jsonb_typeof(p_evidence->'operation') is distinct from 'string' or jsonb_typeof(p_evidence->'transport_phase') is distinct from 'string' or p_evidence->>'operation' not in ('submit','lookup','fetch') or p_evidence->>'transport_phase' not in ('before_send','body_sent_or_unknown','response_received') or jsonb_typeof(p_evidence->'reason_code') is distinct from 'string' or jsonb_typeof(p_evidence->'started_at') is distinct from 'string' or jsonb_typeof(p_evidence->'observed_at') is distinct from 'string' or not (p_evidence->'http_status'='null'::jsonb or (jsonb_typeof(p_evidence->'http_status')='number' and p_evidence->>'http_status' ~ '^[1-5][0-9]{2}$')) or length(p_evidence->>'reason_code') not between 1 and 128 or octet_length(p_evidence::text)>65536 then raise exception 'INVALID_CHECKPOINT';end if;
 perform (p_evidence->>'started_at')::timestamptz,(p_evidence->>'observed_at')::timestamptz;
 update job_attempts set state='uncertain',evidence=p_evidence where id=p_attempt_id;
 update edit_jobs set stage='needs_reconciliation',checkpoint=checkpoint||jsonb_build_object('provider_state','unknown','error_class',p_reason),next_attempt_at=p_next_attempt_at,lease_token=null,lease_expires_at=null,updated_at=now() where id=j.id;
 return jsonb_build_object('applied',true,'status','processing','stage','needs_reconciliation','recovery_deadline_at',j.recovery_deadline_at);
end $$;

create function public.worker_finalize_budget(p_attempt_id uuid,p_cost jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare a job_attempts;c jsonb;
begin
 if p_attempt_id is null then return;end if;
 select * into a from job_attempts where id=p_attempt_id for update;
 if a.finalized then return;end if;
 c:=coalesce(nullif(p_cost,'null'::jsonb),a.actual_cost);
 if not worker_cost_valid(c) or c is not null and c->>'currency' is distinct from a.estimated_cost->>'currency' then raise exception 'INVALID_COST';end if;
 -- Estimates/unknown do not erase liability. Known cost may exceed cap and blocks new submissions.
 update provider_budgets set active_count=active_count-1,
 reserved_minor=reserved_minor-case when c is not null and c->>'evidence'<>'estimate' then (a.estimated_cost->>'amount_minor')::bigint else 0 end,
 committed_minor=committed_minor+case when c is not null and c->>'evidence'<>'estimate' then (c->>'amount_minor')::bigint else 0 end
 where provider=a.provider and model_id=a.model_id and adapter_version=a.adapter_version;
 update job_attempts set finalized=true,actual_cost=c where id=a.id;
end $$;
create function public.worker_complete_job(p_job_id uuid,p_lease_token uuid,p_lease_version bigint,p_attempt_id uuid,p_artifacts jsonb,p_cost jsonb default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare j edit_jobs;r jsonb;p jsonb;image_id uuid;
begin
 j:=worker_lock_job(p_job_id);
 if j.status='completed' and j.current_attempt_id=p_attempt_id and j.checkpoint->'artifacts'=p_artifacts then return jsonb_build_object('applied',false,'status','completed','result_image_id',j.result_image_id,'credits_consumed',j.credits_reserved);end if;
 perform worker_check_lease(j,p_lease_token,p_lease_version);
 if j.stage<>'settling' or p_attempt_id is null or j.current_attempt_id is distinct from p_attempt_id or p_artifacts is distinct from j.checkpoint->'artifacts' or not worker_manifest_valid(p_artifacts,j.owner_id,j.id,p_attempt_id,true) then raise exception 'INVALID_CHECKPOINT';end if;
 select value into r from jsonb_array_elements(p_artifacts) where value->>'kind'='result';
 select value into p from jsonb_array_elements(p_artifacts) where value->>'kind'='preview';
 image_id:=gen_random_uuid();
 insert into images(id,owner_id,status,source_kind,source_job_id,storage_key,preview_key,sha256,mime_type,bytes,width,height,expires_at) values(image_id,j.owner_id,'ready','generated',j.id,r->>'storage_key',p->>'storage_key',r->>'sha256',r->>'mime_type',(r->>'bytes')::bigint,(r->>'width')::int,(r->>'height')::int,now()+interval '7 days');
 update credit_accounts set reserved=reserved-j.credits_reserved,updated_at=now() where owner_id=j.owner_id;
 insert into credit_ledger(owner_id,business_key,kind,available_delta,reserved_delta,reference_id) values(j.owner_id,'job:'||j.id||':consume','consume',0,-j.credits_reserved,j.id);
 perform worker_finalize_budget(p_attempt_id,p_cost);
 update job_artifacts set state='committed' where job_id=j.id;
 update edit_jobs set status='completed',stage='done',result_image_id=image_id,completed_at=now(),updated_at=now(),lease_token=null,lease_expires_at=null where id=j.id;
 return jsonb_build_object('applied',true,'status','completed','result_image_id',image_id,'credits_consumed',j.credits_reserved);
end $$;
create function public.worker_fail_job(p_job_id uuid,p_lease_token uuid,p_lease_version bigint,p_error_code text,p_reason_class text,p_attempt_id uuid default null,p_cost jsonb default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare j edit_jobs;
begin
 j:=worker_lock_job(p_job_id);
 if j.status='failed' and j.current_attempt_id is not distinct from p_attempt_id and j.error_code=p_error_code and j.internal_error_code=p_reason_class then return jsonb_build_object('applied',false,'status','failed','credits_released',j.credits_reserved);end if;
 perform worker_check_lease(j,p_lease_token,p_lease_version);
 if p_error_code is null or p_error_code not in ('NOT_FOUND','UNSUPPORTED_CAPABILITY','ACCOUNT_RESTRICTED','SERVICE_UNAVAILABLE','INTERNAL_ERROR') or p_reason_class is null or length(p_reason_class) not between 1 and 128 or j.current_attempt_id is distinct from p_attempt_id then raise exception 'INVALID_REQUEST';end if;
 if j.stage in ('submitting','needs_reconciliation','waiting_provider') and p_attempt_id is not null and j.recovery_deadline_at>clock_timestamp() and p_reason_class not in ('PROVIDER_REJECTED','INVALID_INPUT') then raise exception 'INVALID_TRANSITION';end if;
 update credit_accounts set available=available+j.credits_reserved,reserved=reserved-j.credits_reserved,updated_at=now() where owner_id=j.owner_id;
 insert into credit_ledger(owner_id,business_key,kind,available_delta,reserved_delta,reference_id) values(j.owner_id,'job:'||j.id||':release','release',j.credits_reserved,-j.credits_reserved,j.id);
 perform worker_finalize_budget(p_attempt_id,p_cost);
 insert into object_cleanup_tasks(storage_key,reason) select manifest->>'storage_key','failed_artifact' from job_artifacts where job_id=j.id on conflict do nothing;
 update job_artifacts set state='tombstoned' where job_id=j.id;
 update job_attempts set state='failed' where id=p_attempt_id;
 update edit_jobs set status='failed',stage='done',error_code=p_error_code,internal_error_code=p_reason_class,completed_at=now(),updated_at=now(),lease_token=null,lease_expires_at=null where id=j.id;
 return jsonb_build_object('applied',true,'status','failed','credits_released',j.credits_reserved);
end $$;

create function public.worker_enqueue_expired_assets(p_limit integer) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare im images;k text;n integer:=0;e integer:=0;d integer:=0;inserted integer:=0;
begin
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'INVALID_REQUEST';end if;
 for im in select * from images where (status<>'deleted' and expires_at<=clock_timestamp()) or cleanup_pending order by expires_at,id limit p_limit for update skip locked loop
  if exists(select 1 from job_inputs i join edit_jobs j on j.id=i.job_id where i.image_id=im.id and j.status in ('queued','processing')) then d:=d+1;continue;end if;
  if im.status='deleted' and not exists(select 1 from unnest(array[im.temp_key,im.storage_key,im.preview_key]) as keys(storage_key) where keys.storage_key is not null and not exists(select 1 from object_cleanup_tasks t where t.storage_key=keys.storage_key and t.state='done')) then update images set cleanup_pending=false where id=im.id;continue;end if;
  if im.status<>'deleted' then update images set status='deleted',deleted_at=now(),cleanup_pending=true where id=im.id;n:=n+1;end if;
  foreach k in array array[im.temp_key,im.storage_key,im.preview_key] loop
   if k is not null then insert into object_cleanup_tasks(storage_key,reason,image_id) values(k,'asset_expired_or_deleted',im.id) on conflict do nothing;get diagnostics inserted=row_count;e:=e+inserted;end if;
  end loop;
 end loop;
 return jsonb_build_object('tombstoned',n,'enqueued',e,'deferred_active',d);
end $$;
create function public.worker_claim_cleanup(p_worker_id text,p_limit integer,p_lease_seconds integer) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare ts jsonb;
begin
 if p_limit is null or p_limit not between 1 and 100 or p_lease_seconds is null or p_lease_seconds not between 30 and 900 or p_worker_id is null or length(p_worker_id) not between 1 and 128 then raise exception 'INVALID_REQUEST';end if;
 with candidates as (select id from object_cleanup_tasks where state='pending' and next_attempt_at<=clock_timestamp() and (lease_expires_at is null or lease_expires_at<=clock_timestamp()) order by next_attempt_at,id limit p_limit for update skip locked),claimed as (
 update object_cleanup_tasks set lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+make_interval(secs=>p_lease_seconds),attempt_count=attempt_count+1 where id in (select id from candidates) returning *)
 select coalesce(jsonb_agg(jsonb_build_object('task_id',id,'storage_key',storage_key,'reason',reason,'lease_token',lease_token,'lease_expires_at',lease_expires_at,'attempt_count',attempt_count)),'[]') into ts from claimed;
 return jsonb_build_object('tasks',ts);
end $$;
create function public.worker_finish_cleanup(p_task_id uuid,p_lease_token uuid,p_outcome text,p_next_attempt_at timestamptz default null,p_error_class text default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t object_cleanup_tasks;st text;
begin
 select * into t from object_cleanup_tasks where id=p_task_id for update;
 if not found then raise exception 'NOT_FOUND';end if;
 if t.state='done' and t.lease_token=p_lease_token then return jsonb_build_object('applied',false,'state','done','next_attempt_at',null);end if;
 if p_lease_token is null or t.lease_token is distinct from p_lease_token or t.lease_expires_at<=clock_timestamp() then raise exception 'STALE_LEASE';end if;
 if p_outcome is null or p_outcome not in ('deleted','not_found','retry') or p_outcome='retry' and p_next_attempt_at is null or length(p_error_class)>128 then raise exception 'INVALID_REQUEST';end if;
 st:=case when p_outcome='retry' then 'pending' else 'done' end;
 update object_cleanup_tasks set state=st,next_attempt_at=coalesce(p_next_attempt_at,next_attempt_at),lease_expires_at=null,last_error=p_error_class where id=t.id;
 -- Completion is reconciled on the next enqueue pass; no image locks after task locks.
 return jsonb_build_object('applied',true,'state',st,'next_attempt_at',case when st='pending' then p_next_attempt_at else null end);
end $$;

create function public.worker_has_due(p_supported_versions jsonb,p_job_id uuid default null) returns boolean language sql security definer set search_path=public,pg_temp as $$
 select exists(select 1 from edit_jobs j where j.status in ('queued','processing') and (p_job_id is null or j.id=p_job_id) and (j.next_attempt_at<=clock_timestamp() or j.recovery_deadline_at<=clock_timestamp()) and (j.lease_expires_at is null or j.lease_expires_at<=clock_timestamp()) and (j.recovery_deadline_at<=clock_timestamp() or exists(select 1 from jsonb_array_elements(p_supported_versions) v where v->>'contract_version'=j.snapshot->>'contract_version' and v->>'execution_type'=j.snapshot->>'execution_type' and v->>'execution_version'=j.snapshot->>'execution_version' and v->>'provider'=j.snapshot->'model_profile'->>'provider' and v->>'adapter_version'=j.snapshot->'model_profile'->>'adapter_version')))
$$;

alter table public.job_attempts enable row level security;
alter table public.job_artifacts enable row level security;
alter table public.provider_budgets enable row level security;
alter table public.object_cleanup_tasks enable row level security;
revoke all on public.job_attempts,public.job_artifacts,public.provider_budgets,public.object_cleanup_tasks from public,anon,authenticated;
grant all on public.job_attempts,public.job_artifacts,public.provider_budgets,public.object_cleanup_tasks to service_role;
do $$ declare f record;begin
 for f in select p.oid::regprocedure sig,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'worker\_%' escape '\' loop
 execute format('revoke all on function %s from public,anon,authenticated',f.sig);
 if f.proname in ('worker_has_due','worker_claim_jobs','worker_record_submission','worker_defer_job','worker_mark_uncertain','worker_complete_job','worker_fail_job','worker_enqueue_expired_assets','worker_claim_cleanup','worker_finish_cleanup') then execute format('grant execute on function %s to service_role',f.sig);end if;
 end loop;
end $$;
commit;
