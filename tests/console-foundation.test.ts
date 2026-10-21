import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createRouter } from '../apps/web/src/server/router';
import { ApiError } from '../apps/web/src/server/errors';
import { dbError } from '../apps/web/src/server/supabase';
import { ConsoleSession, ConsoleEventReceipt, ConsoleDownloadResponse } from '@picjp/contracts';
import type { Database, Dependencies, Row } from '../apps/web/src/server/ports';

const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
let pg: PGlite;
let deps: Dependencies;
let route: ReturnType<typeof createRouter>;
let failSigning = false;
let failRecording = false;
let deleteAfterSigning = false;
let resultImage: string;
const profile = { profile_id: 'fixture', provider: 'fixture', model_id: 'fixture', adapter_version: '1', verified_tool_ids: ['remove_person'], max_images: 1, roles: ['primary'], qualities: ['standard'], aspect_ratios: ['1:1'], credits_standard: 3, credits_high: 5, pricing_version: 'fixture' };
async function sql(query: string, args: unknown[] = []) { return pg.query<Row>(query, args); }
async function rawRpc(name: string, args: Row): Promise<any> {
  const entries = Object.entries(args);
  return (await sql(`select public.${name}(${entries.map(([k], i) => `${k}=>$${i + 1}`).join(',')}) value`, entries.map(([, v]) => v !== null && typeof v === 'object' ? JSON.stringify(v) : v))).rows[0]?.value;
}
const db: Database = {
  async authenticate(token) { if (![owner, other].includes(token)) throw new ApiError('UNAUTHORIZED', 401); return { id: token }; },
  async rpc<T>(name: string, args: Row): Promise<T> {
    if (failRecording && name === 'app_console_finish_download') throw new ApiError('SERVICE_UNAVAILABLE', 503, true);
    try { return await rawRpc(name, args); } catch (error) { dbError({ message: (error as Error).message }); throw error; }
  },
  async one(table, filters) { const entries = Object.entries(filters); return (await sql(`select * from ${table} where ${entries.map(([k], i) => `${k}=$${i + 1}`).join(' and ')}`, entries.map(([, v]) => v))).rows[0] ?? null; },
  async list() { return []; }, async packages() { return []; }, async findJob() { return null; }, async markCleanup() {},
};
async function call(path: string, method = 'GET', body?: unknown, user = owner) {
  return route(new Request(`http://localhost${path}`, { method, headers: {
    ...(user ? { Authorization: `Bearer ${user}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}),
  }, ...(body ? { body: JSON.stringify(body) } : {}) }));
}
async function enable() { await pg.exec("update console_settings set environment='test',collection_enabled=true"); }
async function grant(role = 'analyst', user = owner) { await sql('insert into console_roles(user_id,role,reason) values($1,$2,$3)', [user, role, 'local synthetic verification']); }
function exposed(extra: Row = {}) { return { event_id: randomUUID(), name: 'tool_exposed', page_view_id: randomUUID(), exposure_id: randomUUID(), occurred_at: new Date().toISOString(), device: 'desktop', tool_id: 'remove_person', visible_ms: 1000, visible_ratio: 0.5, ...extra }; }
async function completedJob(user = owner, environment = 'test') {
  await sql('update console_settings set environment=$1', [environment]);
  const jobId = randomUUID(), imageId = randomUUID();
  await sql(`insert into edit_jobs(id,owner_id,tool_id,idempotency_key,request_hash,inputs,snapshot,credits_reserved)
    values($1,$2,'remove_person',$3,$4,'[]',$5,3)`, [jobId, user, randomUUID(), 'a'.repeat(64), JSON.stringify({ model_profile: profile, prompt_id: 'fixture', prompt_version: 1, final_prompt: 'must never reach clients' })]);
  await sql(`insert into images(id,owner_id,status,source_kind,source_job_id,storage_key,preview_key,sha256,mime_type,bytes,width,height,expires_at)
    values($1,$2,'ready','generated',$3,$4,$5,$6,'image/png',10,2,2,now()+interval '7 days')`, [imageId, user, jobId, `results/${imageId}.png`, `results/${imageId}.jpg`, 'a'.repeat(64)]);
  await sql("update edit_jobs set status='completed',result_image_id=$2,completed_at=now()-interval '1 hour' where id=$1", [jobId, imageId]);
  return { jobId, imageId };
}
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;
    grant usage on schema public,auth to anon,authenticated,service_role;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
  for (const file of ['202610190001_web_backend.sql', '202610200400_worker.sql', '202610210100_console_foundation.sql']) await pg.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
});
afterAll(async () => { await pg.close(); });
beforeEach(async () => {
  vi.unstubAllEnvs();
  vi.stubEnv('GENERATION_ENABLED', 'true'); vi.stubEnv('MODEL_PROFILES_JSON', JSON.stringify([profile]));
  await pg.exec('truncate console_audit,console_roles,console_user_tags,console_collection_periods,analytics_events,console_download_actions,profiles,credit_accounts,edit_jobs,images,rate_buckets,auth.users cascade;');
  await pg.exec("update console_settings set collection_enabled=false,environment='unclassified'");
  await sql('insert into auth.users(id) values($1),($2)', [owner, other]);
  failSigning = false; failRecording = false; deleteAfterSigning = false;
  deps = {
    db, now: () => new Date(), fetch,
    storage: { async signPut() { return ''; }, async read() { throw Error('unused'); }, async write() {}, async remove() {},
      async signGet(key) { if (failSigning) throw Error('storage unavailable'); if (deleteAfterSigning) await sql("update images set status='deleted' where id=$1", [resultImage]); return `https://r2.example.invalid/${key}`; },
    },
    payments: { async createCheckout() { throw Error('unused'); }, verifyEvent() { throw Error('unused'); }, async retrieveSession() { throw Error('unused'); }, async retrievePaymentIntent() { throw Error('unused'); }, async retrieveCharge() { throw Error('unused'); } },
  };
  route = createRouter(deps);
});

describe('stage 1: current administrator roles and audit', () => {
  it('rejects anonymous and ordinary users and does not use browser metadata', async () => {
    expect((await call('/api/admin/session', 'GET', undefined, '')).status).toBe(401);
    expect((await call('/api/admin/session')).status).toBe(403);
    expect((await call('/api/admin/session?role=administrator')).status).toBe(403);
  });
  it('audits a bounded session view, grants finance separately and revokes immediately', async () => {
    await grant();
    const res = await call('/api/admin/session');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(ConsoleSession.parse(await res.json())).toMatchObject({ roles: ['analyst'], permissions: ['analytics:read'], collection_enabled: false });
    expect((await sql("select count(*)::int n from console_audit where action='session'")).rows[0].n).toBe(1);
    await expect(rawRpc('app_console_authorize', { p_user_id: owner, p_permission: 'finance:read', p_request_id: randomUUID() })).rejects.toThrow('FORBIDDEN');
    await grant('finance');
    expect(await rawRpc('app_console_authorize', { p_user_id: owner, p_permission: 'finance:read', p_request_id: randomUUID() })).toMatchObject({ permissions: ['analytics:read', 'finance:read'] });
    await sql('update console_roles set revoked_at=now() where user_id=$1', [owner]);
    expect((await call('/api/admin/session')).status).toBe(403);
    expect((await sql("select count(*)::int n from console_audit where action='role_change'")).rows[0].n).toBe(4);
  });
  it('expires roles and denies direct event/table/RPC access to authenticated and anon', async () => {
    await grant(); await pg.exec("update console_roles set expires_at=now()-interval '1 second'");
    expect((await call('/api/admin/session')).status).toBe(403);
    for (const role of ['authenticated', 'anon']) {
      await pg.exec(`set role ${role}`);
      try {
        for (const table of ['console_roles', 'console_audit', 'analytics_events', 'console_download_actions', 'console_settings', 'console_collection_periods', 'console_user_tags']) await expect(sql(`select * from ${table}`)).rejects.toThrow('permission denied');
        await expect(rawRpc('app_console_authorize', { p_user_id: owner, p_permission: 'analytics:read', p_request_id: randomUUID() })).rejects.toThrow('permission denied');
        await expect(sql("insert into console_roles(user_id,role,reason) values($1,'administrator','self grant')", [other])).rejects.toThrow('permission denied');
      } finally { await pg.exec('reset role'); }
    }
    await expect(sql('delete from console_audit')).rejects.toThrow('APPEND_ONLY');
  });
  it('records enable/disable gaps and never reclassifies historical jobs', async () => {
    const historical = await completedJob(owner, 'unclassified');
    await enable();
    expect((await sql('select analytics_environment from edit_jobs where id=$1', [historical.jobId])).rows[0].analytics_environment).toBe('unclassified');
    await pg.exec('update console_settings set collection_enabled=false'); await enable();
    const periods = (await sql('select * from console_collection_periods order by started_at')).rows;
    expect(periods).toHaveLength(2); expect(periods[0].ended_at).not.toBeNull(); expect(periods[1].ended_at).toBeNull();
  });
});

describe('stage 1: trusted download and bounded browser observations', () => {
  it('defaults collection off and blocks spoofed properties, invalid clock and unavailable tools', async () => {
    expect(ConsoleEventReceipt.parse(await (await call('/api/analytics/events', 'POST', exposed())).json()).recording).toBe('disabled');
    await enable();
    for (const patch of [{ owner_id: other }, { final_prompt: 'injected' }, { environment: 'live' }, { occurred_at: new Date(Date.now() + 6 * 60000).toISOString() }, { occurred_at: new Date(Date.now() - 25 * 3600000).toISOString() }, { visible_ms: 999 }]) {
      expect((await call('/api/analytics/events', 'POST', exposed(patch))).status).toBe(400);
    }
    expect((await call('/api/analytics/events', 'POST', exposed({ tool_id: 'not_open' }))).status).toBe(409);
    expect((await sql('select * from analytics_events')).rows).toHaveLength(0);
  });
  it('deduplicates exposure/page/tool and first selection with valid parent exposure', async () => {
    await enable(); const exposure = exposed();
    expect((await (await call('/api/analytics/events', 'POST', exposure)).json()).recording).toBe('recorded');
    expect((await (await call('/api/analytics/events', 'POST', exposure)).json()).recording).toBe('duplicate');
    expect((await (await call('/api/analytics/events', 'POST', { ...exposure, event_id: randomUUID() })).json()).recording).toBe('duplicate');
    const selection = { name: 'tool_selected', event_id: randomUUID(), occurred_at: new Date().toISOString(), device: exposure.device, page_view_id: exposure.page_view_id, exposure_id: exposure.exposure_id, tool_id: exposure.tool_id };
    expect((await call('/api/analytics/events', 'POST', selection, other)).status).toBe(400);
    expect((await (await call('/api/analytics/events', 'POST', selection)).json()).recording).toBe('recorded');
    expect((await (await call('/api/analytics/events', 'POST', { ...selection, event_id: randomUUID() })).json()).recording).toBe('duplicate');
    expect((await sql('select * from analytics_events')).rows).toHaveLength(2);
    expect((await call('/api/analytics/events', 'POST', { ...exposure, device: 'mobile' })).status).toBe(409);
    await expect(sql('update analytics_events set name=name')).rejects.toThrow('APPEND_ONLY');
  });
  it('validates own completed results and resolves frozen job/tool fields server-side', async () => {
    await enable(); const result = await completedJob();
    const view = { event_id: randomUUID(), name: 'result_viewed', occurred_at: new Date().toISOString(), device: 'mobile', page_view_id: randomUUID(), job_id: result.jobId };
    expect((await call('/api/analytics/events', 'POST', view, other)).status).toBe(404);
    expect((await call('/api/analytics/events', 'POST', view)).status).toBe(200);
    expect((await sql('select tool_id,image_id,source from analytics_events')).rows[0]).toEqual({ tool_id: 'remove_person', image_id: result.imageId, source: 'browser_observation' });
    const feedback = { ...view, event_id: randomUUID(), name: 'feedback_submitted', rating: 'positive' };
    expect((await call('/api/analytics/events', 'POST', feedback)).status).toBe(200);
    await sql("update images set expires_at=now()-interval '1 second' where id=$1", [result.imageId]);
    expect((await call('/api/analytics/events', 'POST', { ...view, event_id: randomUUID() })).status).toBe(404);
    // Explicit feedback is independent of whether the private asset still exists.
    expect((await call('/api/analytics/events', 'POST', { ...feedback, event_id: randomUUID(), rating: 'negative' })).status).toBe(200);
  });
  it('excludes GET downloads and deduplicates explicit POST actions after signing', async () => {
    await enable(); const result = await completedJob(); const action = { action_id: randomUUID(), device: 'desktop' };
    expect((await call(`/api/images/${result.imageId}/download`)).status).toBe(200);
    expect((await sql('select * from analytics_events')).rows).toHaveLength(0);
    expect((await call(`/api/images/${result.imageId}/download`, 'POST', action, other)).status).toBe(404);
    const response = await call(`/api/images/${result.imageId}/download`, 'POST', action);
    expect(ConsoleDownloadResponse.parse(await response.json()).recording).toBe('recorded');
    expect((await (await call(`/api/images/${result.imageId}/download`, 'POST', action)).json()).recording).toBe('duplicate');
    const rows = (await sql('select * from analytics_events')).rows; expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'download_url_issued', source: 'server_download', owner_id: owner });
    expect(JSON.stringify(rows)).not.toMatch(/storage_key|final_prompt|https:/);
    const another = await completedJob();
    expect((await call(`/api/images/${another.imageId}/download`, 'POST', action)).status).toBe(409);
  });
  it('never records signing failures and surfaces durable post-sign telemetry gaps', async () => {
    await enable(); const result = await completedJob(); const action = { action_id: randomUUID(), device: 'mobile' };
    failSigning = true; expect((await call(`/api/images/${result.imageId}/download`, 'POST', action)).status).toBe(503);
    expect((await sql('select state from console_download_actions')).rows[0].state).toBe('failed');
    expect((await sql('select * from analytics_events')).rows).toHaveLength(0);
    failSigning = false; failRecording = true;
    expect((await (await call(`/api/images/${result.imageId}/download`, 'POST', { ...action, action_id: randomUUID() })).json()).recording).toBe('unavailable');
    expect((await sql("select count(*)::int n from console_download_actions where state='pending'")).rows[0].n).toBe(1);
    expect((await sql('select status from edit_jobs')).rows[0].status).toBe('completed');
  });
  it('rechecks deletion after signing and refuses result download on upload-only assets', async () => {
    await enable(); const result = await completedJob(); resultImage = result.imageId; deleteAfterSigning = true;
    expect((await call(`/api/images/${result.imageId}/download`, 'POST', { action_id: randomUUID(), device: 'unknown' })).status).toBe(404);
    expect((await sql('select * from analytics_events')).rows).toHaveLength(0);
    deleteAfterSigning = false;
    const upload = randomUUID();
    await rawRpc('app_create_upload', { p_user_id: owner, p_image_id: upload, p_mime_type: 'image/png', p_bytes: 10, p_temp_key: 'staging/fixture', p_expires_at: new Date(Date.now() + 3600000).toISOString() });
    await rawRpc('app_complete_upload', { p_user_id: owner, p_image_id: upload, p_storage_key: 'images/fixture', p_preview_key: 'images/preview', p_sha256: 'a'.repeat(64), p_mime_type: 'image/png', p_bytes: 10, p_width: 2, p_height: 2 });
    expect((await sql('select upload_completed_at from images where id=$1', [upload])).rows[0].upload_completed_at).not.toBeNull();
    expect((await call(`/api/images/${upload}/download`, 'POST', { action_id: randomUUID(), device: 'unknown' })).status).toBe(404);
  });
});
