import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const owner = '00000000-0000-4000-8000-000000000001';
let pg: PGlite;
let image: string;
async function sql(query: string, args: unknown[] = []) { return pg.query<any>(query, args); }
async function rpc(name: string, args: Record<string, unknown>) {
 const entries = Object.entries(args);
 return (await sql(`select ${name}(${entries.map(([key], i) => `${key}=>$${i + 1}`).join(',')}) value`,
  entries.map(([, value]) => value !== null && typeof value === 'object' ? JSON.stringify(value) : value))).rows[0]?.value;
}
function request(extra: Record<string, unknown> = {}) {
 const inputs = [{ image_id: image, role: 'primary' }];
 return {
  p_user_id: owner, p_idempotency_key: randomUUID(), p_request_hash: 'a'.repeat(64),
  p_inputs: inputs, p_snapshot: { contract_version: '1.0.0', execution_type: 'commercial_edit', execution_version: '1',
   inputs, tool_id: 'remove_person', final_prompt: 'private synthetic prompt', prompt_id: 'fixture', pricing_version: 'fixture', model_profile: {} },
  p_reserved_credits: 3, p_parent_job_id: null, ...extra,
 };
}
beforeAll(async () => {
 pg = new PGlite();
 await pg.exec(`create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;
  grant usage on schema public,auth to anon,authenticated,service_role;create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;`);
 for (const file of ['202610190001_web_backend.sql','202610200400_worker.sql','202610210100_console_foundation.sql','202610210200_personal_console.sql','202610210300_admin_analytics.sql','202610210400_console_telemetry.sql']) {
  await pg.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
 }
});
afterAll(async () => { await pg.close(); });
beforeEach(async () => {
 await pg.exec('truncate auth.users cascade');
 await pg.exec("update console_settings set collection_enabled=false,environment='test'");
 await sql('insert into auth.users(id) values($1)', [owner]);
 await sql('update credit_accounts set available=100 where owner_id=$1', [owner]);
 image = randomUUID();
 await sql(`insert into images(id,owner_id,status,declared_mime,declared_bytes,temp_key,storage_key,preview_key,sha256,mime_type,bytes,width,height,expires_at)
  values($1,$2,'ready','image/png',10,$3,$4,$5,$6,'image/png',10,2,2,now()+interval '7 days')`,
  [image,owner,`temp/${image}`,`image/${image}`,`preview/${image}`,'a'.repeat(64)]);
});

describe('stage 3 transactional coarse device capture', () => {
 it('captures mobile/tablet/desktop/unknown and preserves original credit reservations', async () => {
  for (const device of ['mobile','tablet','desktop','unknown']) {
   const result = await rpc('app_console_create_job', request({ p_device: device }));
   expect(result).toMatchObject({ status: 'queued', credits_reserved: 3, replayed: false });
   expect((await sql('select analytics_device,analytics_environment from edit_jobs where id=$1', [result.job_id])).rows[0]).toEqual({ analytics_device: device, analytics_environment: 'test' });
  }
  expect((await sql('select available,reserved from credit_accounts where owner_id=$1', [owner])).rows[0]).toEqual({ available: 88, reserved: 12 });
  expect((await sql('select count(*)::int n from credit_ledger')).rows[0].n).toBe(4);
 });
 it('defaults both new and old signatures to unknown and does not leak device to a subsequent old call in the same transaction', async () => {
  const fresh = await rpc('app_console_create_job', request());
  const old = await rpc('app_create_job', request());
  for (const id of [fresh.job_id, old.job_id]) expect((await sql('select analytics_device from edit_jobs where id=$1', [id])).rows[0].analytics_device).toBe('unknown');
  await pg.exec('begin');
  try {
   const mobile = await rpc('app_console_create_job', request({ p_device: 'mobile' }));
   const oldAfter = await rpc('app_create_job', request());
   expect((await sql('select analytics_device from edit_jobs where id=$1', [mobile.job_id])).rows[0].analytics_device).toBe('mobile');
   expect((await sql('select analytics_device from edit_jobs where id=$1', [oldAfter.job_id])).rows[0].analytics_device).toBe('unknown');
  } finally { await pg.exec('rollback'); }
 });
 it('rejects invalid devices without jobs or reserved credits', async () => {
  for (const device of [null,'','MOBILE','phone','desktop; injected']) {
   await expect(rpc('app_console_create_job', request({ p_device: device }))).rejects.toThrow('INVALID_REQUEST');
  }
  expect((await sql('select count(*)::int n from edit_jobs')).rows[0].n).toBe(0);
  expect((await sql('select available,reserved from credit_accounts where owner_id=$1', [owner])).rows[0]).toEqual({ available: 100, reserved: 0 });
 });
 it('keeps first device/environment/internal provenance and reserves once on replay', async () => {
  const args = request({ p_device: 'mobile' });
  const first = await rpc('app_console_create_job', args);
  await pg.exec("update console_settings set environment='live'");
  await sql('insert into console_user_tags(user_id,internal_account) values($1,true)', [owner]);
  const replay = await rpc('app_console_create_job', { ...args, p_device: 'desktop' });
  expect(replay).toEqual({ ...first, replayed: true });
  expect((await sql('select analytics_device,analytics_environment,analytics_internal from edit_jobs where id=$1', [first.job_id])).rows[0]).toEqual({ analytics_device: 'mobile', analytics_environment: 'test', analytics_internal: false });
  expect((await sql('select available,reserved from credit_accounts where owner_id=$1', [owner])).rows[0]).toEqual({ available: 97, reserved: 3 });
  expect((await sql('select count(*)::int n from credit_ledger')).rows[0].n).toBe(1);
 });
 it('preserves original failures and transaction-local cleanup', async () => {
  await expect(rpc('app_console_create_job', request({ p_device: 'mobile', p_request_hash: 'invalid' }))).rejects.toThrow('INVALID_REQUEST');
  const result = await rpc('app_create_job', request());
  expect((await sql('select analytics_device from edit_jobs where id=$1', [result.job_id])).rows[0].analytics_device).toBe('unknown');
  expect((await sql('select count(*)::int n from credit_ledger')).rows[0].n).toBe(1);
 });
 it('is service-role-only and does not authorize self-captured browser metadata', async () => {
  for (const role of ['anon','authenticated']) {
   await pg.exec(`set role ${role}`);
   try { await expect(rpc('app_console_create_job', request({ p_device: 'mobile' }))).rejects.toThrow('permission denied'); }
   finally { await pg.exec('reset role'); }
  }
  await pg.exec('set role service_role');
  try { expect(await rpc('app_console_create_job', request({ p_device: 'tablet' }))).toMatchObject({ replayed: false }); }
  finally { await pg.exec('reset role'); }
 });
});
