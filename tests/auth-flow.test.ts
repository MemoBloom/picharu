import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { browserLoginStorage, consumeLoginTarget, createLoginCompletion, loginCallbackUrl, parseLoginCallback, rememberLoginTarget, startEmailLogin, startGoogleLogin } from '../apps/web/src/lib/auth-flow';
import { publicAuthConfig } from '../apps/web/src/lib/auth-config';

const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
function storage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
function client() {
  const session = { user: { id: owner } };
  const auth = {
    exchangeCodeForSession: vi.fn(async () => ({ data: { session }, error: null })),
    verifyOtp: vi.fn(async () => ({ data: { session }, error: null })),
    getSession: vi.fn(async () => ({ data: { session }, error: null })),
    signInWithOAuth: vi.fn(async () => ({ data: { url: 'https://fixture.supabase.co/auth/v1/authorize' }, error: null })),
    signInWithOtp: vi.fn(async () => ({ data: {}, error: null })),
  };
  return { client: { auth } as unknown as SupabaseClient, auth };
}
afterEach(() => vi.unstubAllGlobals());
describe('login navigation and public configuration', () => {
  it('uses an exact callback and stores only a safe, bounded return intent', async () => {
    const c = client(); const s = storage(); const origin = 'https://picharu.vercel.app';
    await startGoogleLogin(c.client, origin, '/ja/account?tab=credits', s);
    expect(c.auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: origin + '/auth/callback' } });
    expect(consumeLoginTarget(s)).toBe('/ja/account?tab=credits'); expect(consumeLoginTarget(s)).toBe('/ja/edit');
    await startEmailLogin(c.client, origin, ' fixture@example.invalid ', '//evil.invalid', s);
    expect(c.auth.signInWithOtp).toHaveBeenCalledWith({ email: 'fixture@example.invalid', options: { emailRedirectTo: origin + '/auth/callback', shouldCreateUser: true } });
    expect(consumeLoginTarget(s)).toBe('/ja/edit');
    expect(loginCallbackUrl('http://localhost:3110')).toBe('http://localhost:3110/auth/callback');
    expect(() => loginCallbackUrl('http://example.invalid')).toThrow();
    expect(() => loginCallbackUrl('https://key@example.invalid')).toThrow();
  });
  it('expires return intent and tolerates unavailable browser storage', () => {
    const s = storage(); rememberLoginTarget(s, '/ja/history', 100);
    expect(consumeLoginTarget(s, 3600101)).toBe('/ja/edit');
    rememberLoginTarget(s, '/ja/history', 100); expect(consumeLoginTarget(s, 50)).toBe('/ja/edit');
    vi.stubGlobal('window', { get sessionStorage() { throw new Error('blocked'); } });
    expect(() => rememberLoginTarget(browserLoginStorage(), '/ja/history')).not.toThrow();
    expect(consumeLoginTarget(browserLoginStorage())).toBe('/ja/edit');
  });
  it('accepts publishable or legacy anon keys and rejects server credentials', () => {
    const jwt = (role: string) => `e30.${btoa(JSON.stringify({ role }))}.fixture`;
    expect(publicAuthConfig('https://fixture.supabase.co', 'sb_publishable_fixture')).toMatchObject({ url: 'https://fixture.supabase.co' });
    expect(publicAuthConfig('https://fixture.supabase.co', jwt('anon'))).not.toBeNull();
    for (const key of ['sb_secret_fixture', jwt('service_role'), 'bad-key', 'sb_publishable_bad\nkey']) expect(publicAuthConfig('https://fixture.supabase.co', key)).toBeNull();
    for (const url of ['https://user@fixture.supabase.co', 'https://fixture.supabase.co/path', 'https://fixture.supabase.co?key=bad', 'http://localhost:54321']) expect(publicAuthConfig(url, 'sb_publishable_fixture')).toBeNull();
    expect(publicAuthConfig('http://localhost:54321', 'sb_publishable_fixture', true)).not.toBeNull();
  });
});
describe('one-time login completion and account readiness', () => {
  it('handles Google/PKCE code and email token hash without echoing provider errors', async () => {
    const c = client(); const verify = vi.fn(async () => ({ user_id: owner }));
    expect(parseLoginCallback('https://site.invalid/auth/callback?code=fixture-code')).toEqual({ kind: 'code', code: 'fixture-code' });
    const callback = parseLoginCallback('https://site.invalid/auth/callback?token_hash=fixture-hash&type=email');
    await expect(createLoginCompletion(c.client, callback, verify)()).resolves.toBe(owner);
    expect(c.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'fixture-hash', type: 'email' });
    expect(c.auth.exchangeCodeForSession).not.toHaveBeenCalled(); expect(verify).toHaveBeenCalledOnce();
  });
  it.each([
    '', '?code=', '?token_hash=hash&type=recovery', '?code=x&token_hash=y&type=email',
    '?code=x&code=y', '?token_hash=x&type=email&type=recovery', '?error=access_denied&error_description=SECRET',
    '#access_token=SECRET', '?code=x#error=access_denied', '?code=x&type=recovery',
  ])('rejects invalid/ambiguous return %s before making Auth calls', suffix => {
    expect(() => parseLoginCallback('https://site.invalid/auth/callback' + suffix)).toThrow();
  });
  it('exchanges once across overlapping effects and account-readiness retries', async () => {
    const c = client(); const verify = vi.fn(async () => ({ user_id: owner }));
    const complete = createLoginCompletion(c.client, { kind: 'code', code: 'once' }, verify);
    const cancelled = new AbortController(); cancelled.abort();
    await Promise.all([expect(complete(cancelled.signal)).rejects.toThrow(), expect(complete()).resolves.toBe(owner)]);
    expect(c.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1); expect(verify).toHaveBeenCalledTimes(1);
    verify.mockRejectedValueOnce({ status: 503 });
    await expect(complete()).rejects.toMatchObject({ code: 'ACCOUNT_UNAVAILABLE', retryable: true });
    await expect(complete()).resolves.toBe(owner);
    expect(c.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
  });
  it('does not complete a failed/expired exchange or an invalid backend session', async () => {
    const c = client(); const verify = vi.fn(async () => ({ user_id: owner }));
    c.auth.exchangeCodeForSession.mockResolvedValueOnce({ data: { session: null }, error: { message: 'provider details must stay private' } } as any);
    const complete = createLoginCompletion(c.client, { kind: 'code', code: 'expired' }, verify);
    await expect(complete()).rejects.toMatchObject({ code: 'SESSION_UNAVAILABLE' });
    await expect(complete()).rejects.toMatchObject({ code: 'SESSION_UNAVAILABLE' });
    expect(verify).not.toHaveBeenCalled(); expect(c.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    const fresh = client(); verify.mockRejectedValueOnce({ status: 401 });
    await expect(createLoginCompletion(fresh.client, { kind: 'code', code: 'code' }, verify)()).rejects.toMatchObject({ code: 'SESSION_UNAVAILABLE', retryable: false });
  });
  it('rejects account substitution and a session switched during initialization', async () => {
    const c = client();
    await expect(createLoginCompletion(c.client, { kind: 'code', code: 'code' }, async () => ({ user_id: other }))()).rejects.toMatchObject({ code: 'SESSION_UNAVAILABLE' });
    const fresh = client();
    const verify = async () => { fresh.auth.getSession.mockResolvedValue({ data: { session: { user: { id: other } } }, error: null }); return { user_id: owner }; };
    await expect(createLoginCompletion(fresh.client, { kind: 'code', code: 'code' }, verify)()).rejects.toMatchObject({ code: 'SESSION_UNAVAILABLE' });
  });
});
