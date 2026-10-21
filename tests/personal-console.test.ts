import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createRouter } from '../apps/web/src/server/router';
import { ApiError } from '../apps/web/src/server/errors';
import { dbError } from '../apps/web/src/server/supabase';
import { PersonalSummary, PersonalLedgerPage, PersonalJobsPage, PersonalWorksPage } from '@picjp/contracts';
import type { Database, Dependencies, Row } from '../apps/web/src/server/ports';

const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
let pg: PGlite;
let route: ReturnType<typeof createRouter>;
const sql = (text: string, args: unknown[] = []) => pg.query<Row>(text, args);
const db: Database = {
  async authenticate(token) { if (![owner, other].includes(token)) throw new ApiError('UNAUTHORIZED', 401); return { id: token }; },
  async rpc<T>(name: string, args: Row): Promise<T> {
    const entries = Object.entries(args);
    try { return (await sql(`select public.${name}(${entries.map(([k], i) => `${k}=>$${i + 1}`).join(',')}) value`, entries.map(([, v]) => v !== null && typeof v === 'object' ? JSON.stringify(v) : v))).rows[0].value; }
    catch (error) { dbError({ message: (error as Error).message }); throw error; }
  },
  async one() { return null; }, async list() { return []; }, async packages() { return []; }, async findJob() { return null; }, async markCleanup() {},
};
async function call(path: string, user = owner) { return route(new Request(`http://localhost${path}`, { headers: user ? { Authorization: `Bearer ${user}` } : {} })); }
async function ledger(kind: string, available: number, reserved: number, user = owner, reference: string | null = null) {
  const id = randomUUID();
  await sql('insert into credit_ledger(id,owner_id,business_key,kind,available_delta,reserved_delta,reference_id) values($1,$2,$3,$4,$5,$6,$7)', [id, user, randomUUID(), kind, available, reserved, reference]); return id;
}
async function job(status = 'queued', user = owner, tool = 'remove_person', ageDays = 0) {
  const id = randomUUID();
  await sql(`insert into edit_jobs(id,owner_id,tool_id,idempotency_key,request_hash,inputs,snapshot,credits_reserved,created_at)
   values($1,$2,$3,$4,$5,'[]',$6,3,now()-make_interval(days=>$7))`, [id, user, tool, randomUUID(), 'a'.repeat(64), JSON.stringify({ final_prompt: 'never public', model_profile: { model_id: 'private model' } }), ageDays]);
  if (status === 'completed') {
    const image = randomUUID();
    await sql(`insert into images(id,owner_id,source_kind,source_job_id,status,storage_key,preview_key,sha256,mime_type,bytes,width,height,expires_at)
      values($1,$2,'generated',$3,'ready',$4,$5,$6,'image/png',10,2,2,now()+interval '7 days')`, [image, user, id, `result/${image}`, `preview/${image}`, 'a'.repeat(64)]);
    await sql("update edit_jobs set status='completed',completed_at=now(),result_image_id=$2 where id=$1", [id, image]);
    return { id, image };
  }
  if (status !== 'queued') await sql('update edit_jobs set status=$2 where id=$1', [id, status]);
  return { id, image: null };
}
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;
    grant usage on schema public,auth to anon,authenticated,service_role;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
  for (const file of ['202610190001_web_backend.sql', '202610200400_worker.sql', '202610210100_console_foundation.sql', '202610210200_personal_console.sql']) await pg.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
});
afterAll(async () => { await pg.close(); });
beforeEach(async () => {
  await pg.exec('truncate console_audit,console_roles,console_user_tags,console_collection_periods,analytics_events,console_download_actions,profiles,credit_accounts,edit_jobs,images,rate_buckets,auth.users cascade;');
  await sql('insert into auth.users(id) values($1),($2)', [owner, other]);
  route = createRouter({ db, now: () => new Date(), fetch, storage: {} as Dependencies['storage'], payments: {} as Dependencies['payments'] });
});

describe('stage 2: personal console real SQL reads', () => {
  it('shows an empty account honestly and distinguishes missing account from zero', async () => {
    const empty = await call('/api/dashboard');
    expect(empty.status).toBe(200); expect(empty.headers.get('cache-control')).toBe('no-store');
    const data = PersonalSummary.parse(await empty.json());
    expect(data).toMatchObject({ credits: { available: 0, reserved: 0, status: 'active' }, ongoing_jobs: 0, pending_orders: 0, consumed_credits: 0, jobs: { total: 0 }, recent_jobs: [], recent_works: [] });
    expect(new Date(data.window.start).getUTCHours()).toBe(15);
    await sql('delete from credit_accounts where owner_id=$1', [owner]);
    expect((await call('/api/dashboard')).status).toBe(503);
  });
  it('uses owner-bound task counts and actual consume ledger, preserving old ongoing work', async () => {
    await job('completed'); await job('failed'); await job('cancelled'); await job('processing'); await job('queued', owner, 'remove_person', 40);
    await job('completed', other); await job('completed', owner, 'remove_person', 31);
    await ledger('reserve', -30, 30); await ledger('release', 30, -30); await ledger('consume', 0, -3); await ledger('consume', 0, -99, other);
    await sql('update credit_accounts set available=40,reserved=3,status=$2 where owner_id=$1', [owner, 'restricted']);
    const data = PersonalSummary.parse(await (await call('/api/dashboard')).json());
    expect(data.jobs).toEqual({ total: 4, queued: 0, processing: 1, completed: 1, failed: 1, cancelled: 1 });
    expect(data.ongoing_jobs).toBe(2); expect(data.consumed_credits).toBe(3); expect(data.credits).toEqual({ available: 40, reserved: 3, status: 'restricted' });
    expect(JSON.stringify(data)).not.toMatch(/final_prompt|model_profile|private model/);
  });
  it('does not accept arbitrary owner, ambiguous parameters, invalid windows or future pagination cutoffs', async () => {
    for (const path of ['/api/dashboard?user_id=' + other, '/api/credits/ledger?owner_id=' + other, '/api/account/jobs?limit=0', '/api/account/jobs?limit=1&limit=2', '/api/credits/ledger?kind=arbitrary', '/api/account/works?status=queued', '/api/account/jobs?start=2026-02-02T00:00:00Z&end=2026-02-01T00:00:00Z', '/api/account/jobs?before=2099-01-01T00:00:00Z', '/api/credits/ledger?cursor=injected.or.owner_id.eq.other']) {
      expect((await call(path)).status, path).toBe(400);
    }
    expect((await call('/api/dashboard', '')).status).toBe(401);
  });
  it('filters ledger kind/interval and resolves references without exposing business keys', async () => {
    const task = await job(); const taskEntry = await ledger('reserve', -3, 3, owner, task.id);
    await ledger('purchase', 100, 0); await ledger('consume', 0, -3); await ledger('consume', 0, -50, other);
    const data = PersonalLedgerPage.parse(await (await call('/api/credits/ledger?kind=reserve')).json());
    expect(data.items).toHaveLength(1); expect(data.items[0]).toMatchObject({ entry_id: taskEntry, kind: 'reserve', reference_id: task.id, reference_type: 'job', available_delta: -3, reserved_delta: 3 });
    expect(JSON.stringify(data)).not.toContain('business_key');
    const none = await (await call('/api/credits/ledger?end=2000-01-01T00:00:00Z')).json(); expect(none.items).toEqual([]);
  });
  it('preserves microsecond keyset boundaries and excludes newer ledger entries between pages', async () => {
    const ids = await Promise.all(Array.from({ length: 5 }, () => ledger('consume', 0, -1)));
    await sql("update credit_ledger set created_at=date_trunc('second',now())-interval '3 seconds'+interval '0.123456 seconds'");
    const first = PersonalLedgerPage.parse(await (await call('/api/credits/ledger?limit=2')).json());
    expect(first.next_cursor).toMatch(/123456Z\|/);
    await ledger('purchase', 100, 0);
    const selected = first.items.map(v => v.entry_id); let cursor = first.next_cursor;
    while (cursor) {
      const query = new URLSearchParams({ limit: '2', cursor, before: first.snapshot_before });
      const next = PersonalLedgerPage.parse(await (await call(`/api/credits/ledger?${query}`)).json());
      selected.push(...next.items.map(v => v.entry_id)); cursor = next.next_cursor;
    }
    expect(selected).toHaveLength(5); expect(new Set(selected)).toEqual(new Set(ids));
  });
  it('filters tasks with stable IDs and keeps private model/prompt/error details server-side', async () => {
    const done = await job('completed'); await job('failed'); await job('completed', owner, 'hair_color'); await job('completed', other);
    const data = PersonalJobsPage.parse(await (await call('/api/account/jobs?status=completed&tool_id=remove_person')).json());
    expect(data.items.map(v => v.job_id)).toEqual([done.id]);
    expect(JSON.stringify(data.items)).not.toMatch(/"snapshot":|final_prompt|storage_key|model_profile/);
  });
  it('shows current ready/expired/deleted works without extending retention through an older cutoff', async () => {
    const ready = await job('completed'), expired = await job('completed'), deleted = await job('completed'); await job('failed'); await job('completed', other);
    await sql("update images set expires_at=now()-interval '1 second' where id=$1", [expired.image]);
    await sql("update images set status='deleted' where id=$1", [deleted.image]);
    const data = PersonalWorksPage.parse(await (await call('/api/account/works')).json());
    expect(data.items).toHaveLength(3);
    expect(new Map(data.items.map(v => [v.job.job_id, v.availability]))).toEqual(new Map([[ready.id, 'ready'], [expired.id, 'expired'], [deleted.id, 'deleted']]));
    const valid = PersonalWorksPage.parse(await (await call('/api/account/works?availability=ready')).json()); expect(valid.items.map(v => v.job.job_id)).toEqual([ready.id]);
    const summary = PersonalSummary.parse(await (await call('/api/dashboard')).json()); expect(summary.recent_works.map(v => v.job_id)).toEqual([ready.id]);
    await sql("update images set expires_at=now()-interval '1 second' where id=$1", [ready.image]);
    const later = PersonalWorksPage.parse(await (await call('/api/account/works?' + new URLSearchParams({ before: data.snapshot_before, availability: 'ready' }))).json()); expect(later.items).toEqual([]);
  });
  it('denies direct personal RPC access to ordinary browsers', async () => {
    await pg.exec('set role authenticated');
    try { await expect(db.rpc('app_personal_summary', { p_user_id: other })).rejects.toThrow(); }
    finally { await pg.exec('reset role'); }
  });
});
