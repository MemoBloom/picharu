-- Additive coarse-device capture. Existing app_create_job remains unchanged.
begin;
create or replace function public.console_capture_context() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid;device text;
begin
 select environment into new.analytics_environment from console_settings where id;
 if tg_table_name<>'profiles' then
  u:=new.owner_id;
  new.analytics_internal:=coalesce((select internal_account from console_user_tags where user_id=u),false);
 end if;
 if tg_table_name='edit_jobs' then
  device:=current_setting('picjp.analytics_device',true);
  new.analytics_device:=case when device in('mobile','tablet','desktop','unknown') then device else 'unknown' end;
 end if;
 return new;
end $$;
create function public.app_console_create_job(
 p_user_id uuid,p_idempotency_key text,p_request_hash text,p_inputs jsonb,p_snapshot jsonb,p_reserved_credits integer,
 p_parent_job_id uuid default null,p_device text default 'unknown'
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare previous_device text;result jsonb;
begin
 previous_device:=current_setting('picjp.analytics_device',true);
 if p_device is null or p_device not in('mobile','tablet','desktop','unknown') then raise exception 'INVALID_REQUEST';end if;
 perform set_config('picjp.analytics_device',p_device,true);
 -- The original RPC owns all validation, locking, idempotency and reservations.
 -- Only INSERT triggers consume device context; replay never rewrites old facts.
 result:=app_create_job(p_user_id,p_idempotency_key,p_request_hash,p_inputs,p_snapshot,p_reserved_credits,p_parent_job_id);
 perform set_config('picjp.analytics_device',coalesce(previous_device,''),true);
 return result;
exception when others then
 perform set_config('picjp.analytics_device',coalesce(previous_device,''),true);
 raise;
end $$;
revoke all on function public.console_capture_context() from public,anon,authenticated;
grant execute on function public.console_capture_context() to service_role;
revoke all on function public.app_console_create_job(uuid,text,text,jsonb,jsonb,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.app_console_create_job(uuid,text,text,jsonb,jsonb,integer,uuid,text) to service_role;
commit;
