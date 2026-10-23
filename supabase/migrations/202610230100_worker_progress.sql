-- Read-only progress for bounded Cloud Tasks delivery and phase timing.
begin;
create function public.worker_job_progress(p_job_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object(
   'status',j.status,'stage',j.stage,'created_at',j.created_at,
   'attempt_created_at',a.created_at,'completed_at',j.completed_at,
   'next_attempt_at',j.next_attempt_at,'recovery_deadline_at',j.recovery_deadline_at
 ) from edit_jobs j left join job_attempts a on a.id=j.current_attempt_id
 where j.id=p_job_id;
$$;
revoke all on function public.worker_job_progress(uuid) from public,anon,authenticated;
grant execute on function public.worker_job_progress(uuid) to service_role;
commit;
