import { it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

async function fixture() {
  const db=new PGlite();
  await db.exec('create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public,auth to anon,authenticated,service_role;create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;');
  for(const file of ['202610190001_web_backend.sql','20261020153000_seo.sql','20261020160000_seo_analytics.sql','20261020163245_seo_health.sql','20261020164700_seo_observation.sql'])await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  return db;
}
async function inspect(db:PGlite) {
  try {
    const results=await db.exec(await readFile('scripts/seo/verify-database-read.sql','utf8'));
    return results.flatMap(r=>r.rows as {seo_db_readiness?:any}[]).find(row=>row.seo_db_readiness)?.seo_db_readiness;
  } finally { await db.exec('rollback'); }
}
it('verifies real service-role read functions without leaking private rows or persisting a session role',async()=>{
  const db=await fixture();
  try {
    expect(await inspect(db)).toMatchObject({execution_role:'service_role',transaction_read_only:true,tables_checked:13,functions_checked:29,all_rls_enabled:true,browser_table_grants_absent:true,browser_function_grants_absent:true,service_role_table_reads:true,service_role_function_execute:true,published_page_count:0,health_window_entries:4,successful_import_windows:0,rls_disabled_tables:[],browser_table_exposure:[],browser_function_exposure:[]});
    expect((await db.query<{role:string}>('select current_user as role')).rows[0].role).not.toBe('service_role');
    await db.exec("create or replace function public.seo_get_published(p_path text default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ begin delete from seo_pages;return '[]'::jsonb;end $$;");
    await expect(inspect(db)).rejects.toThrow('read-only transaction');
    expect((await db.query<{n:number}>('select count(*)::int n from seo_pages')).rows[0].n).toBe(0);
  } finally {await db.close();}
},30000);
it('flags PUBLIC table grants, individual column grants, executable private RPCs and disabled RLS',async()=>{
  const db=await fixture();
  try {
    await db.exec('grant select on public.seo_pages to public;grant update(content) on public.seo_revisions to authenticated;grant execute on function public.seo_ingest_begin(uuid,text,text,date,text,boolean,jsonb) to anon;alter table public.seo_revisions disable row level security;');
    const result=await inspect(db);
    expect(result).toMatchObject({all_rls_enabled:false,browser_table_grants_absent:false,browser_function_grants_absent:false,rls_disabled_tables:['seo_revisions']});
    expect(result.browser_table_exposure).toContainEqual({table:'seo_pages',role:'anon'});
    expect(result.browser_table_exposure).toContainEqual({table:'seo_pages',role:'authenticated'});
    expect(result.browser_table_exposure).toContainEqual({table:'seo_revisions',role:'authenticated'});
    expect(result.browser_function_exposure).toContainEqual({function:'seo_ingest_begin(uuid,text,text,date,text,boolean,jsonb)',role:'anon'});
  } finally {await db.close();}
},30000);
