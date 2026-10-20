import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { createHmac, randomUUID } from 'node:crypto';
import { createSeoHandler } from '../apps/web/src/server/seo/http';
import { baselineContent } from '../apps/web/src/server/seo/content';
import { SeoError, type SeoRpc } from '../apps/web/src/server/seo/repository';

let db: PGlite;
const author = randomUUID(), reviewer = randomUUID(), outsider = randomUUID(), secret = 'offline-fixture-signing-secret-long-enough';
const invalidate = vi.fn(async () => {});
const rpc: SeoRpc = async <T>(name: string, args: Record<string, unknown>) => {
  const entries = Object.entries(args);
  try { return (await db.query<{ v: T }>(`select ${name}(${entries.map(([key], i) => `${key}=>$${i + 1}`).join(',')}) v`, entries.map(([key, value]) => key==='p_roles' ? '{'+(value as string[]).join(',')+'}' : value && typeof value === 'object' ? JSON.stringify(value) : value))).rows[0].v; }
  catch (error) { const code = String((error as Error).message).match(/SEO_[A-Z_]+/)?.[0] || 'SEO_UNAVAILABLE'; throw new SeoError(code, ['SEO_FORBIDDEN', 'SEO_SELF_REVIEW'].includes(code) ? 403 : code === 'SEO_NOT_FOUND' ? 404 : 409); }
};
const deps = { rpc, invalidate, now: () => Date.now(), secret: () => secret, databaseContentEnabled: () => true, authenticate: async (r: Request) => { const actor = r.headers.get('authorization')?.slice(7); if (!actor || !([author, reviewer, outsider] as string[]).includes(actor)) throw new SeoError('SEO_UNAUTHORIZED', 401); return actor; } };
const request = (route: string, body?: unknown, actor: string = author) => new Request('https://picmoko.com/api/seo/' + route, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + actor, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
beforeAll(async () => {
  db = new PGlite(); await db.exec('create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;');
  await db.exec(await readFile('supabase/migrations/20261020153000_seo.sql', 'utf8'));
  await db.query('insert into auth.users values($1),($2),($3)', [author, reviewer, outsider]);
  await db.query("insert into seo_members values($1,'editor'),($2,'reviewer')", [author, reviewer]);
});
afterAll(() => db.close());
beforeEach(async () => { invalidate.mockClear(); await db.exec('truncate seo_changes,seo_revisions,seo_pages,seo_webhook_nonces cascade'); });
describe('SEO HTTP integrates the real migration, authorization and publish boundaries', () => {
  it('rejects unverified and non-member callers, invalid input and unexpected routes', async () => {
    const handle = createSeoHandler(deps);
    expect((await handle(request('admin/baseline?path=/ja/tools/remove_person', undefined, 'invalid'))).status).toBe(401);
    expect((await handle(request('admin/baseline?path=/ja/tools/remove_person', undefined, outsider))).status).toBe(403);
    expect((await handle(request('admin/drafts', { content: { path: '/ja/edit' }, expected_revision: null }))).status).toBe(400);
    expect((await handle(request('admin/missing'))).status).toBe(404);
    const wrongType = new Request('https://picmoko.com/api/seo/admin/drafts', { method: 'POST', headers: { Authorization: 'Bearer ' + author, 'Content-Type': 'text/plain' }, body: '{}' });
    expect((await handle(wrongType)).status).toBe(415);
  });
  it('requires independent approval, publishes a single revision and replays the same operation safely', async () => {
    const handle = createSeoHandler(deps), content = baselineContent('/ja/tools/remove_person')!.content;
    const saved = await handle(request('admin/drafts', { content, expected_revision: null })); expect(saved.status).toBe(201); const revision = (await saved.json()).id;
    const read=await handle(request('admin/revision?revision_id='+revision));expect(read.status).toBe(200);expect((await read.json()).base_revision).toBeNull();
    const action = (name: string, actor: string, expected: string | null = null, op = randomUUID()) => handle(request('admin/transitions', { revision_id: revision, action: name, expected_revision: expected, operation_id: op }, actor));
    expect((await action('publish', reviewer)).status).toBe(409);
    expect((await action('submit', author)).status).toBe(200); expect((await action('approve', author)).status).toBe(403);
    expect((await action('approve', reviewer)).status).toBe(200);
    expect((await createSeoHandler({ ...deps, databaseContentEnabled: () => false })(request('admin/transitions', { revision_id: revision, action: 'publish', expected_revision: null, operation_id: randomUUID() }, reviewer))).status).toBe(409);
    const op = randomUUID(); expect((await action('publish', reviewer, null, op)).status).toBe(200); expect((await action('publish', reviewer, null, op)).status).toBe(200);
    expect(invalidate).toHaveBeenCalledTimes(2); expect((await rpc<any[]>('seo_get_published', { p_path: content.path }))[0].revision).toBe(revision);
  });
  it('validates exact signed bytes, current revision, timestamp and single-use nonce', async () => {
    const content = baselineContent('/ja/tools/remove_person')!.content;
    const revision = (await rpc<any>('seo_save_draft', { p_actor: author, p_content: content, p_expected_revision: null })).id;
    for (const [action, actor] of [['submit', author], ['approve', reviewer], ['publish', reviewer]]) await rpc('seo_transition', { p_actor: actor, p_revision: revision, p_action: action, p_expected_revision: null, p_operation: randomUUID() });
    const handle = createSeoHandler(deps);
    const signed = (changes = {}, bad = false) => { const body = JSON.stringify({ path: content.path, revision_id: revision, nonce: randomUUID(), timestamp: Math.floor(Date.now() / 1000), ...changes }); return new Request('https://picmoko.com/api/seo/revalidate', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Seo-Signature': bad ? '0'.repeat(64) : createHmac('sha256', secret).update(body).digest('hex') }, body }); };
    expect((await handle(signed({}, true))).status).toBe(401); expect((await handle(signed({ timestamp: 1 }))).status).toBe(401);
    expect((await handle(signed({ revision_id: randomUUID() }))).status).toBe(409);
    const req = signed(), clone = req.clone(); expect((await handle(req)).status).toBe(200); expect((await handle(clone)).status).toBe(409);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });
});
