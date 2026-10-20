import type { SupabaseClient } from '@supabase/supabase-js';
import { safeNext } from './navigation';

const INTENT_KEY = 'picjp:auth-return';
const INTENT_TTL = 60 * 60 * 1000;
type IntentStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export function browserLoginStorage(): IntentStorage {
  try { return window.sessionStorage; }
  catch { return { getItem: () => null, setItem() {}, removeItem() {} }; }
}
export class LoginFlowError extends Error {
  constructor(public code: 'INVALID_CALLBACK' | 'SESSION_UNAVAILABLE' | 'ACCOUNT_UNAVAILABLE', public retryable = false) { super(code); }
}
export function loginTarget(value?: string | null) { return safeNext(value); }
export function loginCallbackUrl(origin: string) {
  const url = new URL(origin);
  if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))))
    throw new LoginFlowError('INVALID_CALLBACK');
  return `${url.origin}/auth/callback`;
}
// Store navigation intent only. The redirect allowlist can use an exact path,
// without query wildcards or session/credential data in this storage record.
export function rememberLoginTarget(storage: IntentStorage, target: string, now = Date.now()) {
  try { storage.setItem(INTENT_KEY, JSON.stringify({ target: loginTarget(target), at: now })); } catch { /* Safe default if storage is unavailable. */ }
}
export function consumeLoginTarget(storage: IntentStorage, now = Date.now()) {
  try {
    const raw = storage.getItem(INTENT_KEY); storage.removeItem(INTENT_KEY);
    const value = JSON.parse(raw ?? 'null');
    if (!value || typeof value.at !== 'number' || value.at > now || now - value.at > INTENT_TTL) return '/ja/edit';
    return loginTarget(value.target);
  } catch { return '/ja/edit'; }
}
export type LoginCallback = { kind: 'code'; code: string } | { kind: 'email'; tokenHash: string };
export function parseLoginCallback(href: string): LoginCallback {
  const url = new URL(href);
  const q = url.searchParams;
  if (q.has('error') || q.has('error_code') || q.has('error_description') || url.hash || (q.has('type') && q.get('type') !== 'email')) throw new LoginFlowError('INVALID_CALLBACK');
  const code = q.get('code'); const hash = q.get('token_hash');
  const valid = (value: string | null): value is string => !!value && value.length <= 2048 && !/\s/.test(value);
  if (q.getAll('code').length > 1 || q.getAll('token_hash').length > 1 || q.getAll('type').length > 1 || (code && hash)) throw new LoginFlowError('INVALID_CALLBACK');
  if (valid(code) && !q.has('token_hash')) return { kind: 'code', code };
  if (valid(hash) && q.get('type') === 'email' && !q.has('code')) return { kind: 'email', tokenHash: hash };
  throw new LoginFlowError('INVALID_CALLBACK');
}
type AuthClient = Pick<SupabaseClient, 'auth'>;
export function startGoogleLogin(client: AuthClient, origin: string, next: string, storage: IntentStorage) {
  const redirectTo = loginCallbackUrl(origin);
  rememberLoginTarget(storage, next);
  return client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
}
export function startEmailLogin(client: AuthClient, origin: string, email: string, next: string, storage: IntentStorage) {
  const emailRedirectTo = loginCallbackUrl(origin);
  rememberLoginTarget(storage, next);
  return client.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo, shouldCreateUser: true } });
}
export function createLoginCompletion(client: AuthClient, callback: LoginCallback,
  verifyAccount: (signal?: AbortSignal) => Promise<{ user_id: string }>) {
  // Cache only the one-time credential exchange, not the account readiness check.
  // StrictMode, remount effects and retry after a 503 must not reuse a spent code.
  let exchange: Promise<string> | undefined;
  async function establishSession() {
    const result = callback.kind === 'code'
      ? await client.auth.exchangeCodeForSession(callback.code)
      : await client.auth.verifyOtp({ token_hash: callback.tokenHash, type: 'email' });
    if (result.error || !result.data.session?.user.id) throw new LoginFlowError('SESSION_UNAVAILABLE');
    return result.data.session.user.id;
  }
  return async (signal?: AbortSignal) => {
    exchange ??= establishSession();
    const ownerId = await exchange;
    signal?.throwIfAborted();
    const session = await client.auth.getSession();
    if (session.error || session.data.session?.user.id !== ownerId) throw new LoginFlowError('SESSION_UNAVAILABLE');
    let account;
    try { account = await verifyAccount(signal); }
    catch (error) {
      signal?.throwIfAborted();
      if (typeof error === 'object' && error && 'status' in error && error.status === 401) throw new LoginFlowError('SESSION_UNAVAILABLE');
      throw new LoginFlowError('ACCOUNT_UNAVAILABLE', true);
    }
    signal?.throwIfAborted();
    const latest = await client.auth.getSession();
    if (account.user_id !== ownerId || latest.error || latest.data.session?.user.id !== ownerId) throw new LoginFlowError('SESSION_UNAVAILABLE');
    return ownerId;
  };
}
