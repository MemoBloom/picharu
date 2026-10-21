// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../apps/web/src/lib/auth';

const sdk = vi.hoisted(() => ({ signOut: vi.fn(), notify: null as null | ((event: string, session: unknown) => void) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: {
  getSession: async () => ({ data: { session: { user: { id: 'owner-a' } } }, error: null }),
  onAuthStateChange: (notify: typeof sdk.notify) => { sdk.notify = notify; return { data: { subscription: { unsubscribe() {} } } }; },
  signOut: sdk.signOut,
} }) }));
let root: Root, host: HTMLDivElement, auth: ReturnType<typeof useAuth>;
function Probe() { auth = useAuth(); return React.createElement('output', null, auth.user?.id ?? 'signed-out'); }
async function flush(fn: () => void | Promise<void>) { await act(fn); }
beforeEach(async () => {
  vi.clearAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fixture.supabase.co'); vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_fixture');
  sessionStorage.clear(); sessionStorage.setItem('picjp:draft:owner-a', 'private-a'); sessionStorage.setItem('picjp:checkout:owner-a', 'checkout-a'); sessionStorage.setItem('picjp:draft:owner-b', 'private-b');
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await flush(() => root.render(React.createElement(AuthProvider, null, React.createElement(Probe))));
});
afterEach(async () => { await flush(() => root.unmount()); host.remove(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('clears only the signed-out owner after SDK success, including a synchronous SIGNED_OUT event', async () => {
  expect(host.textContent).toBe('owner-a');
  sdk.signOut.mockImplementationOnce(async () => { sdk.notify?.('SIGNED_OUT', null); return { error: null }; });
  await flush(() => auth.signOut());
  expect(host.textContent).toBe('signed-out');
  expect(sessionStorage.getItem('picjp:draft:owner-a')).toBeNull();
  expect(sessionStorage.getItem('picjp:checkout:owner-a')).toBeNull();
  expect(sessionStorage.getItem('picjp:draft:owner-b')).toBe('private-b');
});
it.each(['error', 'throw'])('keeps the session and local work available after a %s failure, then supports retry', async kind => {
  if (kind === 'error') sdk.signOut.mockResolvedValueOnce({ error: new Error('Offline') });
  else sdk.signOut.mockRejectedValueOnce(new Error('Offline'));
  await flush(async () => { await expect(auth.signOut()).rejects.toThrow(); });
  expect(host.textContent).toBe('owner-a');
  expect(sessionStorage.getItem('picjp:draft:owner-a')).toBe('private-a');
  sdk.signOut.mockResolvedValueOnce({ error: null }); await flush(() => auth.signOut());
  expect(host.textContent).toBe('signed-out'); expect(sessionStorage.getItem('picjp:draft:owner-a')).toBeNull();
});
it('shares the pending SDK request between different logout entry points', async () => {
  let resolve!: (value: { error: null }) => void;
  sdk.signOut.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const first = auth.signOut(), second = auth.signOut();
  expect(first).toBe(second); expect(sdk.signOut).toHaveBeenCalledTimes(1);
  await flush(async () => { resolve({ error: null }); await Promise.all([first, second]); });
  expect(host.textContent).toBe('signed-out');
});
it('does not erase a new account adopted before the previous logout promise completes', async () => {
  let resolve!: (value: { error: null }) => void;
  sdk.signOut.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const pending = auth.signOut();
  await flush(() => { sdk.notify?.('SIGNED_OUT', null); sdk.notify?.('SIGNED_IN', { user: { id: 'owner-b' } }); });
  await flush(async () => { resolve({ error: null }); await pending; });
  expect(host.textContent).toBe('owner-b'); expect(sessionStorage.getItem('picjp:draft:owner-b')).toBe('private-b');
});
