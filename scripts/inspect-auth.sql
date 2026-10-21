-- Read-only. Run after the existing base migration in Supabase SQL Editor.
-- Outputs structure/counts only: no email, metadata, token, key, or balance values.
select
 exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
   join pg_proc f on f.oid=t.tgfoid join pg_namespace fn on fn.oid=f.pronamespace
   where n.nspname='auth' and c.relname='users' and t.tgname='app_user_created'
    and t.tgenabled in ('O','A') and not t.tgisinternal and fn.nspname='public' and f.proname='app_initialize_user'
    and f.prosecdef) as initialization_trigger_ready,
 (select relrowsecurity from pg_class where oid='public.profiles'::regclass) as profiles_rls,
 (select relrowsecurity from pg_class where oid='public.credit_accounts'::regclass) as credit_accounts_rls,
 (select count(*) from auth.users u where not exists(select 1 from public.profiles p where p.id=u.id)) as users_missing_profile,
 (select count(*) from auth.users u where not exists(select 1 from public.credit_accounts a where a.owner_id=u.id)) as users_missing_credit_account;
