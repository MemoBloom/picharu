import { it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

it('inspects real migration stages read-only and distinguishes partial structures and wrong signatures', async () => {
  const db = new PGlite();
  const inventory = await readFile('scripts/seo/inspect-schema.sql', 'utf8');
  async function inspect() {
    await db.exec('begin read only');
    try { return (await db.query<{seo_inventory:any}>(inventory)).rows[0].seo_inventory; }
    finally { await db.exec('rollback'); }
  }
  try {
    expect((await inspect()).schema_state).toBe('BASE_DEPENDENCIES_MISSING');
    await db.exec('create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public,auth to anon,authenticated,service_role;create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;');
    await db.exec(await readFile('supabase/migrations/202610190001_web_backend.sql', 'utf8'));
    expect((await inspect()).schema_state).toBe('NO_SEO_OBJECTS');
    for (const file of ['20261020153000_seo.sql','20261020160000_seo_analytics.sql','20261020163245_seo_health.sql','20261020164700_seo_observation.sql']) {
      await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
      expect((await inspect()).schema_state).toBe(file.includes('observation')?'SEO_STRUCTURE_PRESENT':'PARTIAL_SEO_STRUCTURE');
    }
    const complete = await inspect();
    for (const stage of Object.values(complete.stages) as any[]) expect(stage).toMatchObject({found:stage.expected,missing:[]});
    // Inventory must not silently omit a new table/function/trigger in the migration chain.
    const actual = (await db.query<{n:number}>(`select (
      (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','p') and c.relname like 'seo\\_%' escape '\\') +
      (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'seo\\_%' escape '\\') +
      (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal and t.tgname like 'seo\\_%' escape '\\')
    )::int n`)).rows[0].n;
    expect(Object.entries(complete.stages).filter(([key])=>key!=='base').reduce((sum,[,stage]:any)=>sum+stage.expected,0)).toBe(actual);
    await db.exec('drop function public.seo_get_published(text);create function public.seo_get_published(integer) returns jsonb language sql as $$ select null::jsonb $$;');
    expect((await inspect()).stages.core.missing).toContain('public.seo_get_published(text)');
    await db.exec('alter table public.orders disable trigger seo_order_fact');
    expect((await inspect()).stages.analytics.missing).toContain('public.orders.seo_order_fact');
    expect((await inspect()).schema_state).toBe('PARTIAL_SEO_STRUCTURE');
  } finally { await db.close(); }
}, 30000);
