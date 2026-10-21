-- Personal console v1. Requires console_foundation; owner is supplied only by verified BFF.
begin;
create function public.console_public_job(j public.edit_jobs) returns jsonb language sql immutable set search_path=public,pg_temp as $$
 select jsonb_build_object('job_id',j.id,'tool_id',j.tool_id,'status',j.status,'stage',j.stage,'inputs',j.inputs,
 'parent_job_id',j.parent_job_id,'result_image_id',j.result_image_id,'credits_reserved',j.credits_reserved,
 'error_code',j.error_code,'created_at',j.created_at,'completed_at',j.completed_at)
$$;
-- STABLE SQL function: all subqueries use the caller statement snapshot.
create function public.app_personal_summary(p_user_id uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 with bounds as (select statement_timestamp() as_of,((statement_timestamp() at time zone 'Asia/Tokyo')::date-29)::timestamp at time zone 'Asia/Tokyo' start_at),
 j as (select * from edit_jobs,bounds where owner_id=p_user_id and created_at>=start_at and created_at<as_of),
 recent as (select e.* from edit_jobs e where owner_id=p_user_id order by created_at desc,id desc limit 5),
 works as (select e.* from edit_jobs e join images im on im.id=e.result_image_id,bounds
  where e.owner_id=p_user_id and e.status='completed' and im.owner_id=p_user_id and im.status='ready' and im.expires_at>as_of
  order by e.created_at desc,e.id desc limit 5)
 select jsonb_build_object('as_of',b.as_of,'window',jsonb_build_object('start',b.start_at,'end',b.as_of,'timezone','Asia/Tokyo'),
 'credits',jsonb_build_object('available',c.available,'reserved',c.reserved,'status',c.status),
 'ongoing_jobs',(select count(*) from edit_jobs where owner_id=p_user_id and status in ('queued','processing')),
 'pending_orders',(select count(*) from orders where owner_id=p_user_id and status='pending'),
 'consumed_credits',(select coalesce(sum(-reserved_delta),0) from credit_ledger where owner_id=p_user_id and kind='consume' and created_at>=b.start_at and created_at<b.as_of),
 'jobs',(select jsonb_build_object('total',count(*),'queued',count(*) filter(where status='queued'),'processing',count(*) filter(where status='processing'),
 'completed',count(*) filter(where status='completed'),'failed',count(*) filter(where status='failed'),'cancelled',count(*) filter(where status='cancelled')) from j),
 'recent_jobs',(select coalesce(jsonb_agg(console_public_job(recent) order by created_at desc,id desc),'[]') from recent),
 'recent_works',(select coalesce(jsonb_agg(console_public_job(works) order by created_at desc,id desc),'[]') from works))
 from credit_accounts c,bounds b where c.owner_id=p_user_id
$$;

-- Validate again inside the service-only RPC. All dynamic filters are bound
-- values; cursor format has already been checked by the executable contract.
create function public.console_validate_personal_query(p_query jsonb,p_kind text) returns void language plpgsql set search_path=public,pg_temp as $$
declare n integer;s timestamptz;e timestamptz;a timestamptz;
begin
 if p_query is null or jsonb_typeof(p_query)<>'object' or octet_length(p_query::text)>2048 then raise exception 'INVALID_REQUEST';end if;
 if exists(select 1 from jsonb_object_keys(p_query) k where k<>all(case p_kind when 'ledger' then array['limit','cursor','kind','start','end','before'] when 'works' then array['limit','cursor','tool_id','start','end','before','availability'] else array['limit','cursor','tool_id','start','end','before','status'] end)) then raise exception 'INVALID_REQUEST';end if;
 begin
  n:=(p_query->>'limit')::integer;s:=(p_query->>'start')::timestamptz;e:=(p_query->>'end')::timestamptz;a:=(p_query->>'before')::timestamptz;
  if p_query ? 'cursor' then
   if array_length(string_to_array(p_query->>'cursor','|'),1)<>2 or p_query->>'cursor' is null then raise exception 'INVALID_REQUEST';end if;
   perform split_part(p_query->>'cursor','|',1)::timestamptz;perform split_part(p_query->>'cursor','|',2)::uuid;
  end if;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then raise exception 'INVALID_REQUEST';end;
 if n is null or n not between 1 and 50 or (s is not null and not isfinite(s)) or (e is not null and not isfinite(e))
 or (s is not null and e is not null and s>=e) or (a is not null and (not isfinite(a) or a>statement_timestamp())) then raise exception 'INVALID_REQUEST';end if;
 if p_kind='ledger' and p_query ? 'kind' and coalesce(p_query->>'kind','') not in ('reserve','release','consume','purchase','revoke','adjustment') then raise exception 'INVALID_REQUEST';end if;
 if p_kind='jobs' and p_query ? 'status' and coalesce(p_query->>'status','') not in ('queued','processing','completed','failed','cancelled') then raise exception 'INVALID_REQUEST';end if;
 if p_kind='works' and p_query ? 'availability' and coalesce(p_query->>'availability','') not in ('ready','expired','deleted','missing') then raise exception 'INVALID_REQUEST';end if;
end $$;

create function public.app_personal_ledger(p_user_id uuid,p_query jsonb) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 perform console_validate_personal_query(p_query,'ledger');
 with bounds as (select statement_timestamp() as_of,coalesce((p_query->>'before')::timestamptz,statement_timestamp()) snapshot_before,(p_query->>'limit')::integer lim),
 candidates as (select l.* from credit_ledger l,bounds b where owner_id=p_user_id and created_at<b.snapshot_before
  and (not p_query ? 'kind' or kind=p_query->>'kind')
  and (not p_query ? 'start' or created_at>=(p_query->>'start')::timestamptz)
  and (not p_query ? 'end' or created_at<(p_query->>'end')::timestamptz)
  and (not p_query ? 'cursor' or (created_at,id)<(split_part(p_query->>'cursor','|',1)::timestamptz,split_part(p_query->>'cursor','|',2)::uuid))
  order by created_at desc,id desc limit (select lim+1 from bounds)),
 selected as (select * from candidates order by created_at desc,id desc limit (select lim from bounds))
 select jsonb_build_object('as_of',b.as_of,'snapshot_before',b.snapshot_before,'items',(select coalesce(jsonb_agg(jsonb_build_object(
  'entry_id',s.id,'kind',s.kind,'available_delta',s.available_delta,'reserved_delta',s.reserved_delta,'reference_id',s.reference_id,
  'reference_type',case when exists(select 1 from edit_jobs where id=s.reference_id and owner_id=p_user_id) then 'job' when exists(select 1 from orders where id=s.reference_id and owner_id=p_user_id) then 'order' else 'other' end,
  'created_at',s.created_at) order by s.created_at desc,s.id desc),'[]') from selected s),
 'next_cursor',case when (select count(*) from candidates)>b.lim then (select to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')||'|'||id from selected order by created_at,id limit 1) else null end) into result from bounds b;
 return result;
end $$;

create function public.app_personal_jobs(p_user_id uuid,p_query jsonb,p_works boolean default false) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_works is null then raise exception 'INVALID_REQUEST';end if;
 perform console_validate_personal_query(p_query,case when p_works then 'works' else 'jobs' end);
 with bounds as (select statement_timestamp() as_of,coalesce((p_query->>'before')::timestamptz,statement_timestamp()) snapshot_before,(p_query->>'limit')::integer lim),
 matching as (select j.*,case when im.id is null then 'missing' when im.status='deleted' then 'deleted' when im.expires_at<=b.as_of then 'expired' when im.status='ready' then 'ready' else 'missing' end availability,im.expires_at
  from edit_jobs j cross join bounds b left join images im on im.id=j.result_image_id and im.owner_id=p_user_id
  where j.owner_id=p_user_id and j.created_at<b.snapshot_before and (not p_works or j.status='completed')
  and (not p_query ? 'status' or j.status=p_query->>'status') and (not p_query ? 'tool_id' or j.tool_id=p_query->>'tool_id')
  and (not p_query ? 'start' or j.created_at>=(p_query->>'start')::timestamptz)
  and (not p_query ? 'end' or j.created_at<(p_query->>'end')::timestamptz)
  and (not p_query ? 'cursor' or (j.created_at,j.id)<(split_part(p_query->>'cursor','|',1)::timestamptz,split_part(p_query->>'cursor','|',2)::uuid))),
 candidates as (select * from matching where not p_query ? 'availability' or availability=p_query->>'availability'
  order by created_at desc,id desc limit (select lim+1 from bounds)),
 selected as (select * from candidates order by created_at desc,id desc limit (select lim from bounds))
 select jsonb_build_object('as_of',b.as_of,'snapshot_before',b.snapshot_before,'items',(select coalesce(jsonb_agg(case when p_works then jsonb_build_object(
  'job',console_public_job(jsonb_populate_record(null::edit_jobs,to_jsonb(s))),'availability',s.availability,'expires_at',s.expires_at)
  else console_public_job(jsonb_populate_record(null::edit_jobs,to_jsonb(s))) end order by s.created_at desc,s.id desc),'[]') from selected s),
 'next_cursor',case when (select count(*) from candidates)>b.lim then (select to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')||'|'||id from selected order by created_at,id limit 1) else null end) into result from bounds b;
 return result;
end $$;

do $$ declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and (p.proname like 'app_personal_%' or p.proname in ('console_public_job','console_validate_personal_query')) loop
  execute 'revoke all on function '||f.signature||' from public,anon,authenticated';
  execute 'grant execute on function '||f.signature||' to service_role';
 end loop;
end $$;
commit;
