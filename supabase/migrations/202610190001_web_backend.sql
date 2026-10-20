-- Apply to a real Supabase project. auth schema and roles are supplied by Supabase.
begin;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  locale text not null default 'ja', created_at timestamptz not null default now()
);
create table public.images (
  id uuid primary key, owner_id uuid not null references auth.users(id),
  status text not null default 'uploading' check(status in ('uploading','ready','deleted')),
  declared_mime text not null check(declared_mime in ('image/jpeg','image/png','image/webp')),
  declared_bytes bigint not null check(declared_bytes between 1 and 20971520),
  temp_key text not null unique, storage_key text unique, preview_key text unique,
  sha256 text, mime_type text, bytes bigint, width integer, height integer,
  expires_at timestamptz not null, deleted_at timestamptz, cleanup_pending boolean not null default false,
  created_at timestamptz not null default now(),
  check(status <> 'ready' or (storage_key is not null and preview_key is not null and sha256 is not null and bytes is not null and width is not null and height is not null and sha256 ~ '^[a-f0-9]{64}$' and mime_type is not null and bytes between 1 and 33554432 and width > 0 and height > 0 and width::bigint*height <= 24000000))
);
create index images_owner_created on public.images(owner_id,created_at desc,id desc);
create index images_expiry on public.images(expires_at) where status <> 'deleted';
create table public.credit_accounts (
  owner_id uuid primary key references auth.users(id), available bigint not null default 0 check(available >= 0),
  reserved bigint not null default 0 check(reserved >= 0), status text not null default 'active' check(status in ('active','restricted')),
  updated_at timestamptz not null default now()
);
create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
  business_key text not null unique, kind text not null check(kind in ('reserve','release','consume','purchase','revoke','adjustment')),
  available_delta bigint not null, reserved_delta bigint not null, reference_id uuid,
  created_at timestamptz not null default now()
);
create index credit_ledger_owner on public.credit_ledger(owner_id,created_at desc,id desc);
create table public.edit_jobs (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
  tool_id text not null, idempotency_key text not null check(length(idempotency_key) between 16 and 128), request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
  inputs jsonb not null check(jsonb_typeof(inputs)='array'), snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
  status text not null default 'queued' check(status in ('queued','processing','completed','failed','cancelled')),
  stage text not null default 'queued', credits_reserved integer not null check(credits_reserved > 0),
  parent_job_id uuid references public.edit_jobs(id), result_image_id uuid references public.images(id), error_code text,
  lease_token uuid, lease_expires_at timestamptz, attempt_count integer not null default 0,
  provider_request_id text, provider_job_id text, checkpoint jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz,
  unique(owner_id,idempotency_key), check(status <> 'completed' or result_image_id is not null)
);
create index jobs_owner_created on public.edit_jobs(owner_id,created_at desc,id desc);
create index jobs_pending on public.edit_jobs(status,lease_expires_at,created_at) where status in ('queued','processing');
create table public.job_inputs (
  job_id uuid not null references public.edit_jobs(id), image_id uuid not null references public.images(id),
  position smallint not null check(position between 0 and 3),
  role text not null check(role in ('primary','subject_reference','background_reference','style_reference','identity_reference')),
  primary key(job_id,position), unique(job_id,image_id)
);
create index job_inputs_image on public.job_inputs(image_id,job_id);
create table public.credit_packages (
  id uuid primary key default gen_random_uuid(), package_id text unique,
  credits integer not null check(credits > 0), amount_minor bigint not null check(amount_minor > 0),
  currency text not null default 'JPY' check(currency='JPY'), active boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.orders (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id), package_id uuid not null references public.credit_packages(id),
  idempotency_key text not null check(length(idempotency_key) between 16 and 128), credits integer not null check(credits > 0), amount_minor bigint not null check(amount_minor > 0), currency text not null check(currency='JPY'),
  stripe_session_id text unique, payment_intent_id text unique, checkout_url text, metadata jsonb not null default '{}',
  status text not null default 'pending' check(status in ('pending','paid','partially_refunded','refunded','disputed')),
  refunded_minor bigint not null default 0 check(refunded_minor >= 0), revoked_credits integer not null default 0 check(revoked_credits >= 0),
  reversal_shortfall integer not null default 0 check(reversal_shortfall >= 0), disputed boolean not null default false,
  paid_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(owner_id,idempotency_key), check(refunded_minor <= amount_minor), check(revoked_credits <= credits)
);
create index orders_owner_created on public.orders(owner_id,created_at desc,id desc);
create table public.stripe_events (
  event_id text primary key, kind text not null, order_id uuid not null references public.orders(id), payload jsonb not null,
  created_at timestamptz not null default now()
);
create table public.rate_buckets (key text primary key, window_start timestamptz not null, count integer not null check(count > 0));

-- Every initial account has zero credits. No production price/package is seeded.
create function public.app_initialize_user() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into profiles(id) values(new.id) on conflict do nothing;
 insert into credit_accounts(owner_id) values(new.id) on conflict do nothing;
 return new;
end $$;
create trigger app_user_created after insert on auth.users for each row execute function public.app_initialize_user();
insert into public.profiles(id) select id from auth.users on conflict do nothing;
insert into public.credit_accounts(owner_id) select id from auth.users on conflict do nothing;

create function public.app_job_immutable() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if row(new.owner_id,new.tool_id,new.inputs,new.snapshot,new.request_hash,new.idempotency_key,new.credits_reserved,new.parent_job_id)
 is distinct from row(old.owner_id,old.tool_id,old.inputs,old.snapshot,old.request_hash,old.idempotency_key,old.credits_reserved,old.parent_job_id) then raise exception 'IMMUTABLE_JOB'; end if;
 if old.status in ('completed','failed','cancelled') and new is distinct from old then raise exception 'TERMINAL_JOB'; end if;
 return new;
end $$;
create trigger app_job_immutable before update on public.edit_jobs for each row execute function public.app_job_immutable();

create function public.app_consume_rate_limit(p_key text,p_limit integer,p_window_seconds integer) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_count integer;
begin
 if p_key is null or length(p_key) not between 1 and 512 or p_limit is null or p_limit<1 or p_window_seconds is null or p_window_seconds<1 then raise exception 'INVALID_REQUEST'; end if;
 insert into rate_buckets as rb(key,window_start,count) values(p_key,clock_timestamp(),1)
 on conflict(key) do update set count=case when rb.window_start + make_interval(secs=>p_window_seconds)<=clock_timestamp() then 1 else rb.count+1 end,
 window_start=case when rb.window_start + make_interval(secs=>p_window_seconds)<=clock_timestamp() then clock_timestamp() else rb.window_start end returning count into v_count;
 return v_count<=p_limit;
end $$;

create function public.app_create_upload(p_user_id uuid,p_image_id uuid,p_mime_type text,p_bytes bigint,p_temp_key text,p_expires_at timestamptz) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v images;
begin
 if p_user_id is null or p_image_id is null or p_expires_at is null or p_expires_at<=now() or p_mime_type is null or p_mime_type not in ('image/jpeg','image/png','image/webp') or p_bytes is null or p_bytes not between 1 and 20971520 or coalesce(p_temp_key,'')='' then raise exception 'INVALID_REQUEST'; end if;
 insert into images(id,owner_id,declared_mime,declared_bytes,temp_key,expires_at) values(p_image_id,p_user_id,p_mime_type,p_bytes,p_temp_key,p_expires_at) returning * into v;
 return to_jsonb(v);
end $$;

create function public.app_complete_upload(p_user_id uuid,p_image_id uuid,p_storage_key text,p_preview_key text,p_sha256 text,p_mime_type text,p_bytes bigint,p_width integer,p_height integer) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v images;
begin
 select * into v from images where id=p_image_id and owner_id=p_user_id for update;
 if not found or v.status='deleted' or v.expires_at<=now() then raise exception 'NOT_FOUND'; end if;
 if v.status='ready' then return to_jsonb(v); end if;
 if coalesce(p_storage_key,'')='' or coalesce(p_preview_key,'')='' or p_storage_key=v.temp_key or p_preview_key=v.temp_key or p_storage_key=p_preview_key or p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' or p_mime_type is distinct from 'image/png' or p_bytes is null or p_bytes not between 1 and 33554432 or p_width is null or p_height is null or p_width<=0 or p_height<=0 or p_width::bigint*p_height>24000000 then raise exception 'INVALID_REQUEST'; end if;
 update images set status='ready',storage_key=p_storage_key,preview_key=p_preview_key,sha256=p_sha256,mime_type=p_mime_type,bytes=p_bytes,width=p_width,height=p_height where id=p_image_id returning * into v;
 return to_jsonb(v);
end $$;

create function public.app_delete_image(p_user_id uuid,p_image_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v images;
begin
 -- Shared asset row locks serialize deletion with task input validation/insertion.
 select * into v from images where id=p_image_id and owner_id=p_user_id for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if v.status='deleted' then return to_jsonb(v); end if;
 if exists(select 1 from job_inputs i join edit_jobs j on j.id=i.job_id where i.image_id=p_image_id and j.status in ('queued','processing')) then raise exception 'IMAGE_IN_USE'; end if;
 update images set status='deleted',deleted_at=now(),cleanup_pending=true where id=p_image_id returning * into v;
 return to_jsonb(v);
end $$;

create function public.app_create_job(p_user_id uuid,p_idempotency_key text,p_request_hash text,p_inputs jsonb,p_snapshot jsonb,p_reserved_credits integer,p_parent_job_id uuid default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v edit_jobs; v_image images; v_input jsonb; v_index integer:=0; v_parent edit_jobs; v_account credit_accounts;
begin
 -- Serialize this user's reservations/idempotency; image rows are locked in UUID order below.
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 select * into v from edit_jobs where owner_id=p_user_id and idempotency_key=p_idempotency_key;
 if found then
  if v.request_hash is distinct from p_request_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return jsonb_build_object('job_id',v.id,'status',v.status,'credits_reserved',v.credits_reserved,'replayed',true);
 end if;
 if p_user_id is null or p_idempotency_key is null or p_idempotency_key !~ '^[a-zA-Z0-9_-]{16,128}$' or p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$' or p_reserved_credits is null or p_reserved_credits not between 1 and 10000 or jsonb_typeof(p_inputs) is distinct from 'array' or jsonb_typeof(p_snapshot) is distinct from 'object' then raise exception 'INVALID_REQUEST'; end if;
 if jsonb_array_length(p_inputs) not between 1 and 4 then raise exception 'INVALID_REQUEST'; end if;
 if p_snapshot->>'contract_version' is distinct from '1.0.0' or p_snapshot->>'execution_type' is distinct from 'commercial_edit' or p_snapshot->>'execution_version' is distinct from '1' or p_snapshot->'inputs' is distinct from p_inputs or coalesce(p_snapshot->>'tool_id','')='' or coalesce(p_snapshot->>'final_prompt','')='' or coalesce(p_snapshot->>'prompt_id','')='' or coalesce(p_snapshot->>'pricing_version','')='' or jsonb_typeof(p_snapshot->'model_profile') is distinct from 'object' then raise exception 'INVALID_REQUEST'; end if;
 if p_inputs->0->>'role' is distinct from 'primary' or (select count(*) from jsonb_array_elements(p_inputs) a where a->>'role'='primary')<>1 or (select count(distinct a->>'image_id') from jsonb_array_elements(p_inputs) a)<>jsonb_array_length(p_inputs) then raise exception 'INVALID_REQUEST'; end if;
 for v_input in select value from jsonb_array_elements(p_inputs) loop
  if jsonb_typeof(v_input) is distinct from 'object' or coalesce(v_input->>'image_id','') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or coalesce(v_input->>'role','') not in ('primary','subject_reference','background_reference','style_reference','identity_reference') then raise exception 'INVALID_REQUEST'; end if;
 end loop;
 -- Deterministic locks avoid deadlocks across requests sharing images in a different order.
 perform 1 from images where id in (select (a->>'image_id')::uuid from jsonb_array_elements(p_inputs) a) order by id for update;
 for v_input in select value from jsonb_array_elements(p_inputs) loop
  if coalesce(v_input->>'role','') not in ('primary','subject_reference','background_reference','style_reference','identity_reference') then raise exception 'INVALID_REQUEST'; end if;
  select * into v_image from images where id=(v_input->>'image_id')::uuid and owner_id=p_user_id;
  if not found or v_image.status='deleted' or v_image.expires_at<=now() then raise exception 'NOT_FOUND'; end if;
  if v_image.status<>'ready' then raise exception 'IMAGE_NOT_READY'; end if;
 end loop;
 if p_parent_job_id is not null then
  select * into v_parent from edit_jobs where id=p_parent_job_id and owner_id=p_user_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_parent.status<>'completed' or v_parent.result_image_id is distinct from (p_inputs->0->>'image_id')::uuid then raise exception 'INVALID_REQUEST'; end if;
 end if;
 insert into credit_accounts(owner_id) values(p_user_id) on conflict do nothing;
 select * into v_account from credit_accounts where owner_id=p_user_id for update;
 if v_account.status<>'active' then raise exception 'ACCOUNT_RESTRICTED'; end if;
 if v_account.available<p_reserved_credits then raise exception 'INSUFFICIENT_CREDITS'; end if;
 insert into edit_jobs(owner_id,tool_id,idempotency_key,request_hash,inputs,snapshot,credits_reserved,parent_job_id) values(p_user_id,p_snapshot->>'tool_id',p_idempotency_key,p_request_hash,p_inputs,p_snapshot,p_reserved_credits,p_parent_job_id) returning * into v;
 for v_input in select value from jsonb_array_elements(p_inputs) loop
  insert into job_inputs(job_id,image_id,position,role) values(v.id,(v_input->>'image_id')::uuid,v_index,v_input->>'role'); v_index:=v_index+1;
 end loop;
 update credit_accounts set available=available-p_reserved_credits,reserved=reserved+p_reserved_credits,updated_at=now() where owner_id=p_user_id;
 insert into credit_ledger(owner_id,business_key,kind,available_delta,reserved_delta,reference_id) values(p_user_id,'job:'||v.id||':reserve','reserve',-p_reserved_credits,p_reserved_credits,v.id);
 return jsonb_build_object('job_id',v.id,'status',v.status,'credits_reserved',v.credits_reserved,'replayed',false);
end $$;

create function public.app_cancel_job(p_user_id uuid,p_job_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v edit_jobs;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 select * into v from edit_jobs where id=p_job_id and owner_id=p_user_id for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if v.status='cancelled' then return to_jsonb(v); end if;
 if v.status<>'queued' then raise exception 'JOB_NOT_CANCELLABLE'; end if;
 update credit_accounts set available=available+v.credits_reserved,reserved=reserved-v.credits_reserved,updated_at=now() where owner_id=p_user_id;
 insert into credit_ledger(owner_id,business_key,kind,available_delta,reserved_delta,reference_id) values(p_user_id,'job:'||v.id||':release','release',v.credits_reserved,-v.credits_reserved,v.id);
 update edit_jobs set status='cancelled',stage='done',completed_at=now(),updated_at=now() where id=p_job_id returning * into v;
 return to_jsonb(v);
end $$;

create function public.app_create_order(p_user_id uuid,p_package_id uuid,p_idempotency_key text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v orders; v_package credit_packages;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 select * into v from orders where owner_id=p_user_id and idempotency_key=p_idempotency_key;
 if found then
  if v.package_id is distinct from p_package_id then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return to_jsonb(v);
 end if;
 if p_user_id is null or p_package_id is null or p_idempotency_key is null or p_idempotency_key !~ '^[a-zA-Z0-9_-]{16,128}$' then raise exception 'INVALID_REQUEST'; end if;
 if exists(select 1 from credit_accounts where owner_id=p_user_id and status='restricted') then raise exception 'ACCOUNT_RESTRICTED'; end if;
 select * into v_package from credit_packages where id=p_package_id and active for share;
 if not found then raise exception 'NOT_FOUND'; end if;
 insert into orders(owner_id,package_id,idempotency_key,credits,amount_minor,currency) values(p_user_id,p_package_id,p_idempotency_key,v_package.credits,v_package.amount_minor,v_package.currency) returning * into v;
 update orders set metadata=jsonb_build_object('order_id',v.id::text,'user_id',p_user_id::text) where id=v.id returning * into v;
 return to_jsonb(v);
end $$;

create function public.app_attach_checkout(p_order_id uuid,p_session_id text,p_checkout_url text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v orders;
begin
 select * into v from orders where id=p_order_id for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if coalesce(p_session_id,'')='' or coalesce(p_checkout_url,'')='' then raise exception 'INVALID_REQUEST'; end if;
 if v.stripe_session_id is not null and v.stripe_session_id<>p_session_id then raise exception 'PAYMENT_MISMATCH'; end if;
 if v.stripe_session_id is null then update orders set stripe_session_id=p_session_id,checkout_url=p_checkout_url,updated_at=now() where id=p_order_id returning * into v; end if;
 return to_jsonb(v);
end $$;

create function public.app_apply_paid_checkout(p_event_id text,p_order_id uuid,p_session_id text,p_payment_intent_id text,p_amount_minor bigint,p_currency text,p_amount_refunded bigint default 0,p_disputed boolean default false) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v orders; v_inserted integer; v_payload jsonb; v_account credit_accounts;
 v_first boolean; v_grant integer; v_refund bigint; v_disputed boolean; v_target integer; v_delta integer; v_taken integer;
begin
 select * into v from orders where id=p_order_id for update;
 if not found then raise exception 'PAYMENT_MISMATCH'; end if;
 v_payload:=jsonb_build_object('session_id',p_session_id,'payment_intent_id',p_payment_intent_id,'amount_minor',p_amount_minor,'currency',upper(p_currency),'amount_refunded',p_amount_refunded,'disputed',p_disputed);
 if coalesce(p_event_id,'')='' or coalesce(p_session_id,'')='' or coalesce(p_payment_intent_id,'')='' or v.amount_minor is distinct from p_amount_minor or v.currency is distinct from upper(p_currency) or v.stripe_session_id is distinct from p_session_id or (v.payment_intent_id is not null and v.payment_intent_id<>p_payment_intent_id) or p_amount_refunded is null or p_amount_refunded<0 or p_amount_refunded>v.amount_minor or p_disputed is null then raise exception 'PAYMENT_MISMATCH'; end if;
 insert into stripe_events(event_id,kind,order_id,payload) values(p_event_id,'paid',p_order_id,v_payload) on conflict do nothing;
 get diagnostics v_inserted = row_count;
 if v_inserted=0 then
  -- A newly retrieved Charge may have advanced since the first delivery. Identity must match;
  -- a processed event never reapplies either credits or its older/newer derived Charge facts.
  if not exists(select 1 from stripe_events where event_id=p_event_id and kind='paid' and order_id=p_order_id and (payload-'amount_refunded'-'disputed')=(v_payload-'amount_refunded'-'disputed')) then raise exception 'PAYMENT_MISMATCH'; end if;
  return jsonb_build_object('applied',false);
 end if;
 v_first:=v.paid_at is null;
 v_grant:=case when v_first then v.credits else 0 end;
 v_refund:=greatest(v.refunded_minor,p_amount_refunded);
 v_disputed:=v.disputed or p_disputed;
 v_target:=greatest(v.revoked_credits,case when v_disputed then v.credits else ceil(v.credits::numeric*v_refund/v.amount_minor)::integer end);
 v_delta:=v_target-v.revoked_credits;
 insert into credit_accounts(owner_id) values(v.owner_id) on conflict do nothing;
 select * into v_account from credit_accounts where owner_id=v.owner_id for update;
 v_taken:=least(v_delta,v_account.available+v_grant)::integer;
 -- One balance mutation is the net of purchase and already-known reversal facts.
 -- No transaction boundary exposes gross purchased credits before a full refund/dispute.
 update credit_accounts set available=available+v_grant-v_taken,
  status=case when v_disputed or v_taken<v_delta then 'restricted' else status end,updated_at=now() where owner_id=v.owner_id;
 if v_first then
  insert into credit_ledger(owner_id,business_key,kind,available_delta,reserved_delta,reference_id) values(v.owner_id,'order:'||v.id||':purchase','purchase',v.credits,0,v.id);
 end if;
 if v_delta>0 then
  insert into credit_ledger(owner_id,business_key,kind,available_delta,reserved_delta,reference_id) values(v.owner_id,'order:'||v.id||':revoke:'||v_target,'revoke',-v_taken,0,v.id);
 end if;
 update orders set status=case when v_disputed then 'disputed' when v_refund=amount_minor then 'refunded' when v_refund>0 then 'partially_refunded' else 'paid' end,
  paid_at=coalesce(paid_at,now()),payment_intent_id=p_payment_intent_id,refunded_minor=v_refund,revoked_credits=v_target,
  reversal_shortfall=reversal_shortfall+(v_delta-v_taken),disputed=v_disputed,updated_at=now() where id=v.id;
 return jsonb_build_object('applied',v_first);
end $$;

create function public.app_apply_payment_reversal(p_event_id text,p_payment_intent_id text,p_refunded_minor bigint,p_dispute boolean) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v orders; v_account credit_accounts; v_target integer; v_delta integer; v_taken integer; v_inserted integer; v_refund bigint; v_payload jsonb;
begin
 select * into v from orders where payment_intent_id=p_payment_intent_id for update;
 if not found or v.paid_at is null then raise exception 'PAYMENT_MISMATCH'; end if;
 if coalesce(p_event_id,'')='' or p_refunded_minor is null or p_refunded_minor<0 or p_refunded_minor>v.amount_minor or p_dispute is null then raise exception 'PAYMENT_MISMATCH'; end if;
 v_payload:=jsonb_build_object('payment_intent_id',p_payment_intent_id,'refunded_minor',p_refunded_minor,'dispute',p_dispute);
 insert into stripe_events(event_id,kind,order_id,payload) values(p_event_id,'reversal',v.id,v_payload) on conflict do nothing;
 get diagnostics v_inserted = row_count;
 if v_inserted=0 then
  if not exists(select 1 from stripe_events where event_id=p_event_id and kind='reversal' and order_id=v.id and payload=v_payload) then raise exception 'PAYMENT_MISMATCH'; end if;
  return jsonb_build_object('applied',false,'revoked_credits',v.revoked_credits,'shortfall',v.reversal_shortfall,'restricted',v.disputed or v.reversal_shortfall>0);
 end if;
 v_refund:=greatest(v.refunded_minor,p_refunded_minor);
 v_target:=greatest(v.revoked_credits,case when v.disputed or p_dispute then v.credits else ceil(v.credits::numeric*v_refund/v.amount_minor)::integer end);
 v_delta:=greatest(0,v_target-v.revoked_credits);
 select * into v_account from credit_accounts where owner_id=v.owner_id for update;
 v_taken:=least(v_delta,v_account.available)::integer;
 update credit_accounts set available=available-v_taken,status=case when p_dispute or v_taken<v_delta then 'restricted' else status end,updated_at=now() where owner_id=v.owner_id;
 if v_delta>0 then insert into credit_ledger(owner_id,business_key,kind,available_delta,reserved_delta,reference_id) values(v.owner_id,'order:'||v.id||':revoke:'||v_target,'revoke',-v_taken,0,v.id); end if;
 update orders set refunded_minor=v_refund,revoked_credits=v_target,reversal_shortfall=reversal_shortfall+(v_delta-v_taken),disputed=disputed or p_dispute,
 status=case when disputed or p_dispute then 'disputed' when v_refund=amount_minor then 'refunded' when v_refund>0 then 'partially_refunded' else status end,updated_at=now() where id=v.id returning * into v;
 return jsonb_build_object('applied',true,'revoked_credits',v.revoked_credits,'shortfall',v.reversal_shortfall,'restricted',v.disputed or v.reversal_shortfall>0);
end $$;

-- Clients may only read their own permitted public-schema rows. Server mutations use service role.
alter table public.profiles enable row level security;
alter table public.images enable row level security;
alter table public.credit_accounts enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.edit_jobs enable row level security;
alter table public.job_inputs enable row level security;
alter table public.credit_packages enable row level security;
alter table public.orders enable row level security;
alter table public.stripe_events enable row level security;
alter table public.rate_buckets enable row level security;
create policy own_profile on public.profiles for select to authenticated using(id=(select auth.uid()));
create policy own_images on public.images for select to authenticated using(owner_id=(select auth.uid()));
create policy own_credits on public.credit_accounts for select to authenticated using(owner_id=(select auth.uid()));
create policy own_ledger on public.credit_ledger for select to authenticated using(owner_id=(select auth.uid()));
-- Snapshots/keys are intentionally not available to browser database clients.
create policy own_job_inputs on public.job_inputs for select to authenticated using(exists(select 1 from public.edit_jobs j where j.id=job_id and j.owner_id=(select auth.uid())));
create policy active_packages on public.credit_packages for select to anon,authenticated using(active);
create policy own_orders on public.orders for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.profiles,public.images,public.credit_accounts,public.credit_ledger,public.edit_jobs,public.job_inputs,public.credit_packages,public.orders,public.stripe_events,public.rate_buckets from anon,authenticated;
grant select on public.profiles,public.credit_accounts,public.credit_ledger,public.orders to authenticated;
grant select(id,owner_id,status,declared_mime,declared_bytes,mime_type,bytes,width,height,expires_at,deleted_at,created_at) on public.images to authenticated;
grant select on public.credit_packages to anon,authenticated;
grant all on public.profiles,public.images,public.credit_accounts,public.credit_ledger,public.edit_jobs,public.job_inputs,public.credit_packages,public.orders,public.stripe_events,public.rate_buckets to service_role;
-- No direct edit_jobs SELECT grant because it contains the full generation snapshot. BFF serves JobView.
do $$ declare v record; begin
 for v in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('app_initialize_user','app_job_immutable','app_consume_rate_limit','app_create_upload','app_complete_upload','app_delete_image','app_create_job','app_cancel_job','app_create_order','app_attach_checkout','app_apply_paid_checkout','app_apply_payment_reversal') loop
 execute format('revoke all on function %s from public, anon, authenticated',v.sig);
 if v.sig::text not like '%app_initialize_user%' and v.sig::text not like '%app_job_immutable%' then execute format('grant execute on function %s to service_role',v.sig); end if;
 end loop;
end $$;
commit;
