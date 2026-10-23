// Explicit cross-repository offline suite. Worker is built independently and loaded
// only by this test runner, never by Next.js or a deployment dependency.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fork } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import sharp from 'sharp';
import { WorkerSnapshot, JobView, ImageView, CreditView, DownloadResponse } from '@picjp/contracts';
import { createRouter } from '../apps/web/src/server/router';
import { ApiError } from '../apps/web/src/server/errors';
import { dbError } from '../apps/web/src/server/supabase';
import { jobStageMessage } from '../apps/web/src/lib/job-state';
import type { Database, Storage, Payments, Row } from '../apps/web/src/server/ports';

async function main() {
const workerRoot = process.env.PICJP_WORKER_TEST_ROOT;
if (!workerRoot) throw new Error('Run the workspace scripts/test-full-flow.sh with both repositories installed');
// Every external port is supplied below. Any accidental default fetch is a test failure.
globalThis.fetch = async () => { throw new Error('NETWORK_FORBIDDEN_IN_OFFLINE_SUITE'); };
const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const profile = {
  profile_id: 'offline-yomi-sync-v1', provider: 'yomi', model_id: 'gpt-image-2.5', adapter_version: 'yomi-sync-v1',
  verified_tool_ids: ['illustration_photo'], max_images: 1, roles: ['primary'], qualities: ['standard'],
  aspect_ratios: ['1:1'], credits_standard: 3, credits_high: 5, pricing_version: 'offline-fixture-only',
};
process.env.GENERATION_TEST_USER_ID = owner;
process.env.GENERATION_ENABLED = 'true';
process.env.MODEL_PROFILES_JSON = JSON.stringify([profile]);
const pg = new PGlite();
const objects = new Map<string, { bytes: Buffer; mime: string }>();
let posts = 0;
let providerMode: 'ok' | 'timeout' | 'invalid' = 'ok';
let fault: 'none' | 'cache-ack' | 'result-ack' | 'preview-put' | 'complete-before' | 'complete-ack' = 'none';
let signed = 0;
const observedStages = new Set<string>();
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const resultBytes = await sharp({ create: { width: 96, height: 96, channels: 3, background: '#22aa66' } }).png().toBuffer();
async function sqlRpc(name: string, args: Row) {
  assert.match(name, /^(app|worker)_[a-z_]+$/);
  if (name === 'worker_complete_job' && fault === 'complete-before') {
    fault = 'none'; throw new Error('offline DB unavailable before settlement');
  }
  const entries = Object.entries(args);
  entries.forEach(([key]) => assert.match(key, /^p_[a-z0-9_]+$/));
  const value = (await pg.query<{ value: any }>(
    `select public.${name}(${entries.map(([key], i) => `${key}=>$${i + 1}`).join(',')}) as value`,
    entries.map(([, v]) => v !== null && typeof v === 'object' ? JSON.stringify(v) : v),
  )).rows[0].value;
  if (name === 'worker_complete_job' && fault === 'complete-ack') {
    fault = 'none'; throw new Error('offline lost DB acknowledgement after commit');
  }
  return value;
}
const db: Database = {
  async authenticate(token) { if (!['owner', 'other'].includes(token)) throw new ApiError('UNAUTHORIZED', 401); return { id: token === 'owner' ? owner : other }; },
  async rpc<T>(name: string, args: Row): Promise<T> { try { return await sqlRpc(name, args); } catch (error) { dbError({ message: (error as Error).message }); throw error; } },
  async one(table, filters) {
    assert.match(table, /^[a-z_]+$/);
    const entries = Object.entries(filters); entries.forEach(([k]) => assert.match(k, /^[a-z_]+$/));
    return (await pg.query<Row>(`select * from ${table} where ${entries.map(([k], i) => `${k}=$${i + 1}`).join(' and ')}`, entries.map(([, v]) => v))).rows[0] ?? null;
  },
  async findJob(user, key) { return this.one('edit_jobs', { owner_id: user, idempotency_key: key }); },
  async list(table, user, limit) { assert.match(table, /^(edit_jobs|orders)$/); return (await pg.query<Row>(`select * from ${table} where owner_id=$1 order by created_at desc,id desc limit $2`, [user, limit])).rows; },
  async packages() { return []; },
  async markCleanup(id, pending) { await pg.query('update images set cleanup_pending=$2 where id=$1', [id, pending]); },
};
const storage: Storage = {
  async signPut(key) { return `https://offline-r2.invalid/${key}?put=1`; },
  async read(key, max) { const v = objects.get(key); if (!v) throw new ApiError('IMAGE_NOT_READY', 409); assert.ok(v.bytes.length <= max); return v; },
  async write(key, bytes, mime) { objects.set(key, { bytes, mime }); },
  async remove(keys) { keys.forEach(key => objects.delete(key)); },
  async signGet(key, attachment = false) { return `https://offline-r2.invalid/${key}?attachment=${attachment}&nonce=${++signed}`; },
};
// Exercise the real Worker's S3 command generation and write/read hash verification.
const s3 = {
  async send(command: { input: Row; constructor: { name: string } }, options: { abortSignal: AbortSignal }) {
    options.abortSignal.throwIfAborted();
    const { Key: key, Bucket: bucket, Body: bytes, ContentType: mime } = command.input;
    assert.equal(bucket, 'offline-bucket');
    if (command.constructor.name === 'PutObjectCommand') {
      if (fault === 'preview-put' && mime === 'image/jpeg') { fault = 'none'; throw new Error('offline preview unavailable'); }
      assert.equal(command.input.Metadata.sha256, hash(bytes));
      objects.set(key, { bytes, mime });
      if ((fault === 'cache-ack' && key.startsWith('_worker-provider-cache/')) || (fault === 'result-ack' && key.startsWith('results/'))) {
        fault = 'none'; throw new Error('offline lost S3 acknowledgement after write');
      }
      return {};
    }
    if (command.constructor.name === 'GetObjectCommand') {
      const value = objects.get(key); if (!value) throw new Error('NoSuchKey');
      return { Body: (async function* () { yield value.bytes; })() };
    }
    assert.equal(command.constructor.name, 'DeleteObjectCommand'); objects.delete(key); return {};
  },
};
const transport = {
  async fetch(url: string, init: RequestInit) {
    posts++;
    assert.equal(url, 'https://api.yomiapi.com/v1/images/edits');
    assert.equal(init.method, 'POST'); assert.equal(init.redirect, 'error');
    assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer offline-fixture-key');
    const form = init.body as FormData;
    assert.equal(form.get('model'), 'gpt-image-2.5'); assert.equal(form.get('size'), '1024x1024');
    const input = Buffer.from(await (form.get('image') as Blob).arrayBuffer());
    assert.equal((await sharp(input).metadata()).format, 'png');
    assert.ok(String(form.get('prompt')).length > 30);
    if (providerMode === 'timeout') throw new Error('offline provider response lost');
    return Response.json({ data: [{ b64_json: (providerMode === 'invalid' ? Buffer.from('bad image') : resultBytes).toString('base64') }] });
  },
  async download() { throw new Error('OFFLINE_DOWNLOAD_FORBIDDEN'); },
};
let stopWorker: (() => void) | undefined;
function newWorker() {
  stopWorker?.();
  const child = fork(resolve(workerRoot!, 'dist/tests/full-flow-driver.js'), [], {
    cwd: workerRoot, execArgv: ['--import', pathToFileURL(resolve(workerRoot!, 'node_modules/tsx/dist/loader.mjs')).href], stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    env: { PATH: process.env.PATH, NODE_ENV: 'test', PICJP_OFFLINE_INTEGRATION: '1' },
  });
  let sequence = 0;
  const pending = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  child.on('message', async (message: any) => {
    if (!message.op) {
      const request = pending.get(message.id); if (!request) return; pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error)); else request.resolve(message.result);
      return;
    }
    try {
      let result;
      if (message.op === 'rpc') result = await sqlRpc(message.name, message.args);
      else if (message.op === 's3') {
        const input = { ...message.input, ...(message.input.Body ? { Body: Buffer.from(message.input.Body, 'base64') } : {}) };
        const value = await s3.send({ input, constructor: { name: message.command } }, { abortSignal: new AbortController().signal });
        if (value.Body) {
          const chunks: Buffer[] = []; for await (const chunk of value.Body) chunks.push(chunk);
          result = { body: Buffer.concat(chunks).toString('base64') };
        } else result = {};
      } else {
        assert.equal(message.op, 'provider');
        const form = new FormData(); for (const [key, value] of Object.entries(message.fields)) form.set(key, String(value));
        form.set('image', new Blob([Buffer.from(message.input, 'base64')], { type: 'image/png' }), 'input.png');
        const response = await transport.fetch(message.url, { method: message.method, redirect: message.redirect, headers: message.headers, body: form });
        result = { body: await response.text(), status: response.status };
      }
      child.send({ id: message.id, result });
    } catch (error) { if (child.connected) child.send({ id: message.id, error: (error as Error).message }); }
  });
  function rejectPending(error: Error) { for (const request of pending.values()) request.reject(error); pending.clear(); }
  child.on('error', rejectPending);
  child.on('exit', () => rejectPending(new Error('Offline Worker exited')));
  stopWorker = () => { child.kill(); };
  return { drain(limit: number, jobId: string) {
    return new Promise<any>((resolve, reject) => {
      const id = `drain-${++sequence}`;
      const timeout = setTimeout(() => { pending.delete(id); child.kill(); reject(new Error('Offline drain exceeded 15 seconds')); }, 15000);
      pending.set(id, {
        resolve: value => { clearTimeout(timeout); resolve(value); },
        reject: error => { clearTimeout(timeout); reject(error); },
      });
      child.send({ id, op: 'drain', limit, jobId });
    });
  } };
}
let worker = newWorker();
const payments = new Proxy({}, { get() { throw new Error('Payments must not be used by this suite'); } }) as Payments;
const route = createRouter({ db, storage, payments, fetch: globalThis.fetch, now: () => new Date() });
async function request(path: string, method = 'GET', body?: unknown, token = 'owner') {
  return route(new Request(`http://localhost${path}`, { method, headers: {
    Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
  }, body: body === undefined ? undefined : JSON.stringify(body) }));
}
async function json(path: string, method = 'GET', body?: unknown, status = 200, token = 'owner') {
  const r = await request(path, method, body, token); assert.equal(r.status, status, `${method} ${path}: ${await r.clone().text()}`); return r.json();
}
async function reset() {
  await pg.exec('truncate auth.users cascade; truncate provider_budgets cascade; truncate object_cleanup_tasks; truncate rate_buckets;');
  await pg.query('insert into auth.users(id) values($1),($2)', [owner, other]);
  await pg.query('update credit_accounts set available=20 where owner_id=$1', [owner]);
  await pg.exec("insert into provider_budgets(provider,model_id,adapter_version,currency,limit_minor,estimate_minor,max_inflight,enabled) values('yomi','gpt-image-2.5','yomi-sync-v1','USD',100,10,1,true)");
  objects.clear(); posts = 0; fault = 'none'; providerMode = 'ok'; worker = newWorker(); observedStages.clear();
  process.env.GENERATION_ENABLED = 'true';
}
async function upload() {
  const bytes = await sharp({ create: { width: 48, height: 48, channels: 3, background: '#dd4433' } }).jpeg().toBuffer();
  const signed = await json('/api/images/upload-url', 'POST', { mime_type: 'image/jpeg', bytes: bytes.length }, 201);
  await storage.write(new URL(signed.upload_url).pathname.slice(1), bytes, 'image/jpeg');
  return ImageView.parse(await json('/api/images/complete', 'POST', { image_id: signed.image_id }));
}
function edit(imageId: string) { return { tool_id: 'illustration_photo', inputs: [{ image_id: imageId, role: 'primary' }], output: { quality: 'standard', aspect_ratio: '1:1' }, idempotency_key: randomUUID() }; }
async function create() {
  const image = await upload(); const body = edit(image.image_id);
  return { image, body, accepted: await json('/api/edit', 'POST', body, 202) };
}
async function credits(available: number, reserved: number) {
  const c = CreditView.parse(await json('/api/credits')); assert.equal(c.available, available); assert.equal(c.reserved, reserved);
}
async function view(id: string) {
  const job = JobView.parse(await json(`/api/jobs/${id}`)); observedStages.add(job.stage);
  assert.ok(!/final_prompt|provider_request|storage_key|result_ref/.test(JSON.stringify(job)));
  return job;
}
async function stage(id: string) { await worker.drain(1, id); return view(id); }
async function due(id: string) {
  await pg.query("update edit_jobs set next_attempt_at=now()-interval '1 second',lease_expires_at=null where id=$1 and status in ('queued','processing')", [id]);
}
async function finish(id: string) {
  for (let i = 0; i < 6; i++) {
    const job = await stage(id); if (job.status === 'completed' || job.status === 'failed') return job;
    await due(id); worker = newWorker(); // Prove every stage can resume in a fresh process instance.
  }
  throw new Error('Job did not terminate within bounded offline stages');
}
async function count(table: string, where: string) { return Number((await pg.query<{ n: number }>(`select count(*) as n from ${table} where ${where}`)).rows[0].n); }
const cases: Array<[string, () => Promise<void>]> = [
  ['upload → frozen prompt → sync Worker → R2 → atomic credits → preview/download/continuation', async () => {
    const { accepted, body } = await create(); const id = accepted.job_id;
    assert.equal((await view(id)).status, 'queued'); await credits(17, 3);
    WorkerSnapshot.parse((await db.one('edit_jobs', { id }))!.snapshot);
    assert.equal((await json('/api/edit', 'POST', body, 202)).job_id, id);
    assert.equal((await stage(id)).stage, 'storing'); await credits(17, 3);
    assert.equal((await stage(id)).stage, 'settling'); await credits(17, 3);
    const completed = await stage(id); assert.equal(completed.status, 'completed'); await credits(17, 0);
    assert.ok(completed.result_image_id); assert.equal(posts, 1);
    const image = ImageView.parse(await json(`/api/images/${completed.result_image_id}`));
    assert.equal(image.width, 96); assert.equal(image.height, 96);
    const preview = objects.get(new URL(image.preview_url!).pathname.slice(1))!;
    assert.equal((await sharp(preview.bytes).metadata()).format, 'jpeg');
    const link = DownloadResponse.parse(await json(`/api/images/${image.image_id}/download`));
    const downloaded = objects.get(new URL(link.download_url).pathname.slice(1))!;
    assert.equal((await sharp(downloaded.bytes).metadata()).format, 'png');
    assert.ok(new URL(link.download_url).searchParams.get('attachment') === 'true');
    assert.notEqual((await json(`/api/images/${image.image_id}/download`)).download_url, link.download_url);
    assert.equal((await request(`/api/images/${image.image_id}`, 'GET', undefined, 'other')).status, 404);
    assert.equal((await request(`/api/images/${image.image_id}/download`, 'GET', undefined, 'other')).status, 404);
    assert.equal((await request(`/api/jobs/${id}`, 'GET', undefined, 'other')).status, 404);
    const replay = await json('/api/edit', 'POST', body, 202); assert.equal(replay.status, 'completed');
    await worker.drain(5, id); assert.equal(posts, 1);
    assert.equal(await count('credit_ledger', "kind='consume'"), 1);
    assert.equal(await count('images', "source_kind='generated'"), 1);
    assert.equal((await json('/api/jobs')).items[0].result_image_id, image.image_id);
    const budget = (await pg.query<Row>('select * from provider_budgets')).rows[0];
    assert.equal(budget.active_count, 0); assert.equal(budget.reserved_minor, 10); assert.equal(budget.committed_minor, 0);
    // No provider cost is fabricated from a successful image response.
    const continuation = await json('/api/edit', 'POST', { ...edit(image.image_id), parent_job_id: id }, 202);
    await credits(14, 3);
    await json(`/api/jobs/${continuation.job_id}/cancel`, 'POST'); await credits(17, 0);
    await json(`/api/images/${image.image_id}`, 'DELETE');
    assert.equal((await request(`/api/images/${image.image_id}/download`)).status, 404);
    await json('/api/edit', 'POST', body, 202); await worker.drain(5, id);
    assert.equal(await count('images', "source_kind='generated'"), 1); assert.equal(posts, 1); await credits(17, 0);
  }],
  ...(['cache-ack', 'result-ack', 'preview-put', 'complete-before', 'complete-ack'] as const).map(failure => [
    `${failure}: restart recovers without another provider POST or credit consumption`, async () => {
      const { accepted } = await create(); const id = accepted.job_id; fault = failure;
      if (failure === 'cache-ack') {
        assert.equal((await stage(id)).stage, 'needs_reconciliation'); await credits(17, 3);
        assert.ok(jobStageMessage((await view(id)).stage).includes('新しく依頼し直さず'));
      } else {
        await stage(id); // Cached provider result is committed, still no credit consumption.
        if (failure === 'complete-ack' || failure === 'complete-before') {
          await stage(id); await assert.rejects(() => worker.drain(1, id));
          if (failure === 'complete-before') {
            await credits(17, 3); assert.equal((await view(id)).result_image_id, null);
            assert.equal(await count('credit_ledger', "kind='consume'"), 0);
          }
        }
        else { assert.equal((await stage(id)).stage, 'storing'); await credits(17, 3); }
      }
      await due(id); worker = newWorker();
      assert.equal((await finish(id)).status, 'completed'); await credits(17, 0);
      assert.equal(posts, 1); assert.equal(await count('credit_ledger', "kind='consume'"), 1);
      assert.equal(await count('images', "source_kind='generated'"), 1);
    },
  ] as [string, () => Promise<void>]),
  ['stored result corruption prevents settlement until verified bytes are restored', async () => {
    const { accepted } = await create(); const id = accepted.job_id;
    await stage(id); await stage(id);
    const manifest = (await db.one('edit_jobs', { id }))!.checkpoint.artifacts;
    const key = manifest.find((a: Row) => a.kind === 'result').storage_key;
    const original = objects.get(key)!; objects.set(key, { ...original, bytes: Buffer.from('corrupt') });
    assert.equal((await stage(id)).stage, 'settling'); await credits(17, 3);
    assert.equal((await view(id)).result_image_id, null);
    objects.set(key, original); await due(id); worker = newWorker();
    assert.equal((await finish(id)).status, 'completed'); await credits(17, 0); assert.equal(posts, 1);
  }],
  ['lost provider response: only cache lookup, then deadline releases user credits once', async () => {
    const { accepted } = await create(); const id = accepted.job_id; providerMode = 'timeout';
    assert.equal((await stage(id)).stage, 'needs_reconciliation'); await credits(17, 3);
    await due(id); worker = newWorker(); await stage(id); assert.equal(posts, 1);
    await pg.query("update edit_jobs set recovery_deadline_at=now()-interval '1 second',next_attempt_at=now() where id=$1", [id]);
    assert.equal((await stage(id)).status, 'failed'); await credits(20, 0);
    await worker.drain(5, id); assert.equal(posts, 1);
    assert.equal(await count('credit_ledger', "kind='release'"), 1);
    assert.equal(await count('credit_ledger', "kind='consume'"), 0);
    assert.equal((await pg.query<Row>('select * from provider_budgets')).rows[0].reserved_minor, 10);
  }],
  ['bad generated media never becomes visible or consumes credits', async () => {
    const { accepted } = await create(); const id = accepted.job_id; providerMode = 'invalid';
    await stage(id); assert.equal((await stage(id)).stage, 'storing'); await credits(17, 3);
    assert.equal((await view(id)).result_image_id, null);
    await pg.query("update edit_jobs set recovery_deadline_at=now()-interval '1 second' where id=$1", [id]);
    assert.equal((await stage(id)).status, 'failed'); await credits(20, 0); assert.equal(posts, 1);
    assert.equal(await count('images', "source_kind='generated'"), 0);
  }],
  ['queue cancellation, generation gate and supplier budget prevent any submission', async () => {
    const { accepted, image } = await create();
    await json(`/api/jobs/${accepted.job_id}/cancel`, 'POST');
    await json(`/api/jobs/${accepted.job_id}/cancel`, 'POST'); await worker.drain(5, accepted.job_id); await credits(20, 0);
    process.env.GENERATION_ENABLED = 'false'; assert.equal((await request('/api/edit', 'POST', edit(image.image_id))).status, 503);
    process.env.GENERATION_ENABLED = 'true'; const waiting = await json('/api/edit', 'POST', edit(image.image_id), 202);
    await pg.exec('update provider_budgets set enabled=false');
    assert.equal((await stage(waiting.job_id)).status, 'queued'); assert.equal(posts, 0); await credits(17, 3);
    await json(`/api/jobs/${waiting.job_id}/cancel`, 'POST'); await credits(20, 0);
  }],
  ['mutated input is rejected before model submission and releases the reservation', async () => {
    const { accepted, image } = await create();
    const input = await db.one('images', { id: image.image_id });
    objects.set(input!.storage_key, { bytes: Buffer.from('changed after upload'), mime: 'image/png' });
    assert.equal((await stage(accepted.job_id)).status, 'failed'); await credits(20, 0); assert.equal(posts, 0);
    assert.equal(await count('credit_ledger', "kind='release'"), 1);
  }],
  ['unsupported output and insufficient balance are rejected before queueing', async () => {
    const image = await upload();
    assert.equal((await request('/api/edit', 'POST', { ...edit(image.image_id), output: { quality: 'high', aspect_ratio: '1:1' } })).status, 409);
    await credits(20, 0);
    await pg.query('update credit_accounts set available=0 where owner_id=$1', [owner]);
    assert.equal((await request('/api/edit', 'POST', edit(image.image_id))).status, 402);
    assert.equal(await count('edit_jobs', 'true'), 0); assert.equal(posts, 0);
  }],
];
try {
  await pg.exec("create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public,auth to anon,authenticated,service_role;create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;");
  await pg.exec(await readFile('supabase/migrations/202610190001_web_backend.sql', 'utf8'));
  await pg.exec(await readFile('supabase/migrations/202610200400_worker.sql', 'utf8'));
  for (const [name, run] of cases) { await reset(); await run(); console.log(`PASS ${name}`); }
  console.log(`Offline full flow: ${cases.length} scenarios passed; real network calls: 0; paid model calls: 0.`);
} finally { stopWorker?.(); await pg.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
