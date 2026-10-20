import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { createRouter } from '../apps/web/src/server/router';
import { SupabaseDatabase } from '../apps/web/src/server/supabase';
import { createLoginCompletion, parseLoginCallback, startEmailLogin, startGoogleLogin } from '../apps/web/src/lib/auth-flow';
import { CreditView } from '@picjp/contracts';
import type { Dependencies, Row } from '../apps/web/src/server/ports';

const origin = 'https://picharu.vercel.app';
const endpoint = 'https://fixture.supabase.co';
const owner = '00000000-0000-4000-8000-000000000001';
const second = '00000000-0000-4000-8000-000000000002';
let pg: PGlite;
let browser: SupabaseClient;
let route: ReturnType<typeof createRouter>;
const tokens = new Map<string, Row>();
const codes = new Map<string, { uid: string; challenge?: string }>();
const hashes = new Map<string, string>();
let otp: Row;
let exchanges: number;
let verifyCalls: number;
function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
function authUser(uid: string) { return { id: uid, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-10-20T00:00:00Z' }; }
function session(uid: string) {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const encode = (data: unknown) => Buffer.from(JSON.stringify(data)).toString('base64url');
  const access_token = `${encode({ alg: 'HS256' })}.${encode({ sub: uid, exp: expires, role: 'authenticated', iss: endpoint + '/auth/v1', aud: 'authenticated', jti: randomUUID() })}.offline-signature`;
  const user = authUser(uid); tokens.set(access_token, user);
  return { access_token, refresh_token: randomUUID(), expires_in: 3600, expires_at: expires, token_type: 'bearer', user };
}
async function createAuthUser(uid = owner) {
  await pg.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3) on conflict(id) do nothing', [uid, 'fixture@example.invalid', JSON.stringify({ credits: 999999, role: 'admin' })]);
}
// Replace only external Auth/PostgREST transports. Both browser and server use
// actual Supabase SDKs; the API runs the real router and real SQL migrations.
async function transport(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(String(input)); expect(url.origin).toBe(endpoint);
  const headers = new Headers(init?.headers);
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  if (url.pathname === '/auth/v1/otp') {
    expect(headers.get('apikey')).toBe('sb_publishable_fixture');
    otp = body; await createAuthUser();
    codes.set('email-code', { uid: owner, challenge: body.code_challenge }); hashes.set('email-hash', owner);
    return Response.json({});
  }
  if (url.pathname === '/auth/v1/token') {
    exchanges++; expect(url.searchParams.get('grant_type')).toBe('pkce');
    const record = codes.get(body.auth_code); codes.delete(body.auth_code);
    if (!record || (record.challenge && createHash('sha256').update(body.code_verifier).digest('base64url') !== record.challenge))
      return Response.json({ code: 'bad_code_verifier', msg: 'expired or mismatched fixture code' }, { status: 400 });
    return Response.json(session(record.uid));
  }
  if (url.pathname === '/auth/v1/verify') {
    verifyCalls++; expect(body.type).toBe('email');
    const uid = hashes.get(body.token_hash); hashes.delete(body.token_hash);
    if (!uid) return Response.json({ code: 'otp_expired', msg: 'fixture expired' }, { status: 403 });
    return Response.json(session(uid));
  }
  if (url.pathname === '/auth/v1/user') {
    // The server must validate the user's token, not treat the service key as a user.
    expect(headers.get('apikey')).toBe('sb_secret_offline_fixture');
    const user = tokens.get(headers.get('authorization')?.slice(7) ?? '');
    return user ? Response.json(user) : Response.json({ message: 'Invalid JWT' }, { status: 401 });
  }
  expect(headers.get('apikey')).toBe('sb_secret_offline_fixture');
  expect(headers.get('authorization')).toBeNull();
  if (url.pathname === '/rest/v1/rpc/app_consume_rate_limit') {
    const result = await pg.query<{ value: boolean }>('select app_consume_rate_limit($1,$2,$3) as value', [body.p_key, body.p_limit, body.p_window_seconds]);
    return Response.json(result.rows[0].value);
  }
  const table = url.pathname.slice('/rest/v1/'.length);
  expect(['profiles', 'credit_accounts']).toContain(table);
  const column = table === 'profiles' ? 'id' : 'owner_id';
  const filter = url.searchParams.get(column); expect(filter).toMatch(/^eq\./);
  const rows = (await pg.query(`select * from ${table} where ${column}=$1`, [filter!.slice(3)])).rows;
  return Response.json(headers.get('accept')?.includes('vnd.pgrst.object') ? rows[0] ?? null : rows);
}
async function call(path: string, token?: string) {
  const current = token ?? (await browser.auth.getSession()).data.session?.access_token;
  return route(new Request('https://picharu.vercel.app' + path, { headers: current ? { Authorization: 'Bearer ' + current } : {} }));
}
async function account() {
  const response = await call('/api/me');
  if (!response.ok) throw { status: response.status };
  return response.json();
}
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec("create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public,auth to anon,authenticated,service_role;create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;");
  await pg.exec(await readFile('supabase/migrations/202610190001_web_backend.sql', 'utf8'));
});
beforeEach(async () => {
  await pg.exec('truncate auth.users cascade; truncate rate_buckets;');
  tokens.clear(); codes.clear(); hashes.clear(); otp = {}; exchanges = 0; verifyCalls = 0;
  vi.stubEnv('SUPABASE_URL', endpoint); vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_offline_fixture'); vi.stubEnv('GENERATION_ENABLED', 'false');
  vi.stubGlobal('fetch', vi.fn(transport));
  browser = createClient(endpoint, 'sb_publishable_fixture', { auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: false, storage: memoryStorage() }, global: { fetch: transport } });
  const forbidden = new Proxy({}, { get() { throw new Error('Storage, payments and model calls are forbidden in Auth tests'); } });
  route = createRouter({ db: new SupabaseDatabase(), storage: forbidden as Dependencies['storage'], payments: forbidden as Dependencies['payments'], fetch: async () => { throw new Error('No model calls'); }, now: () => new Date() });
});
afterEach(async () => { await browser.auth.stopAutoRefresh(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
afterAll(async () => { await pg.close(); });
describe('Supabase login SDK → verified API → SQL account initialization, offline transports', () => {
  it('creates a zero-credit account with Google PKCE, ignoring editable provider metadata', async () => {
    const started = await startGoogleLogin(browser, origin, '/ja/account', memoryStorage());
    expect(started.error).toBeNull();
    const authorize = new URL(started.data.url!);
    expect(authorize.searchParams.get('provider')).toBe('google');
    expect(authorize.searchParams.get('redirect_to')).toBe(origin + '/auth/callback');
    expect(authorize.searchParams.get('code_challenge_method')).toBe('s256');
    await createAuthUser(); codes.set('google-code', { uid: owner, challenge: authorize.searchParams.get('code_challenge')! });
    await expect(createLoginCompletion(browser, parseLoginCallback(origin + '/auth/callback?code=google-code'), account)()).resolves.toBe(owner);
    expect(await (await call('/api/me')).json()).toMatchObject({ user_id: owner, email: 'fixture@example.invalid', locale: 'ja' });
    expect(CreditView.parse(await (await call('/api/credits')).json())).toEqual({ available: 0, reserved: 0, status: 'active' });
    expect((await pg.query('select * from profiles')).rows).toHaveLength(1);
    expect((await pg.query('select * from credit_ledger')).rows).toHaveLength(0);
    expect(exchanges).toBe(1);
  });
  it.each(['code', 'token_hash'])('completes email auto-signup through %s with the real browser SDK', async kind => {
    await startEmailLogin(browser, origin, ' fixture@example.invalid ', '/ja/history', memoryStorage());
    expect(otp).toMatchObject({ email: 'fixture@example.invalid', create_user: true });
    expect(typeof otp.code_challenge).toBe('string');
    const suffix = kind === 'code' ? '?code=email-code' : '?token_hash=email-hash&type=email';
    await expect(createLoginCompletion(browser, parseLoginCallback(origin + '/auth/callback' + suffix), account)()).resolves.toBe(owner);
    expect(await (await call('/api/credits')).json()).toEqual({ available: 0, reserved: 0, status: 'active' });
    expect(kind === 'code' ? exchanges : verifyCalls).toBe(1);
  });
  it('preserves existing balances and restricted state on subsequent sign-in', async () => {
    await createAuthUser(); await pg.query("update credit_accounts set available=7,status='restricted' where owner_id=$1", [owner]);
    await startEmailLogin(browser, origin, 'fixture@example.invalid', '/ja/account', memoryStorage());
    await createLoginCompletion(browser, { kind: 'email', tokenHash: 'email-hash' }, account)();
    expect(await (await call('/api/credits')).json()).toEqual({ available: 7, reserved: 0, status: 'restricted' });
    expect((await pg.query('select * from credit_accounts')).rows).toHaveLength(1);
  });
  it('fails closed on missing business records and retries readiness without reusing a spent code', async () => {
    await startEmailLogin(browser, origin, 'fixture@example.invalid', '/ja/account', memoryStorage());
    await pg.query('delete from profiles where id=$1', [owner]);
    const finish = createLoginCompletion(browser, { kind: 'code', code: 'email-code' }, account);
    await expect(finish()).rejects.toMatchObject({ code: 'ACCOUNT_UNAVAILABLE', retryable: true });
    expect((await call('/api/me')).status).toBe(503);
    await pg.query('insert into profiles(id) values($1)', [owner]);
    await expect(finish()).resolves.toBe(owner); expect(exchanges).toBe(1);
    await pg.query('delete from credit_accounts where owner_id=$1', [owner]);
    expect((await call('/api/credits')).status).toBe(503); expect((await call('/api/me')).status).toBe(503);
  });
  it('rejects expired/replayed email tokens and forged API identities', async () => {
    await startEmailLogin(browser, origin, 'fixture@example.invalid', '/ja/account', memoryStorage());
    await createLoginCompletion(browser, { kind: 'email', tokenHash: 'email-hash' }, account)();
    await expect(createLoginCompletion(browser, { kind: 'email', tokenHash: 'email-hash' }, account)()).rejects.toMatchObject({ code: 'SESSION_UNAVAILABLE' });
    expect((await call('/api/me', 'forged-user-jwt')).status).toBe(401);
    expect((await call('/api/me?user_id=' + second)).status).toBe(200);
    expect((await (await call('/api/me?user_id=' + second)).json()).user_id).toBe(owner);
  });
  it('rolls back the Auth row and profile when account initialization fails', async () => {
    await pg.exec("create function public.offline_init_failure() returns trigger language plpgsql as $$ begin raise exception 'OFFLINE_INIT_FAILURE';end $$;create trigger offline_init_failure before insert on credit_accounts for each row execute function public.offline_init_failure();");
    try {
      await expect(createAuthUser()).rejects.toThrow('OFFLINE_INIT_FAILURE');
      expect((await pg.query('select * from auth.users')).rows).toHaveLength(0);
      expect((await pg.query('select * from profiles')).rows).toHaveLength(0);
    } finally { await pg.exec('drop trigger offline_init_failure on credit_accounts;drop function public.offline_init_failure();'); }
  });
  it('inspects initialization/RLS without exposing identity data', async () => {
    await createAuthUser();
    const result = (await pg.query<Row>(await readFile('scripts/inspect-auth.sql', 'utf8'))).rows[0];
    expect(result).toMatchObject({ initialization_trigger_ready: true, profiles_rls: true, credit_accounts_rls: true });
    expect(Number(result.users_missing_profile)).toBe(0); expect(Number(result.users_missing_credit_account)).toBe(0);
    expect(JSON.stringify(result)).not.toContain('fixture@example.invalid');
  });
});
