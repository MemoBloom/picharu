import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { consentCookie, consentSession, createAnalyticsHandler, linkBusinessResponse } from '../apps/web/src/server/seo/analytics';
import { SeoError } from '../apps/web/src/server/seo/repository';
import { analyticsSource, publicAnalyticsPath } from '../apps/web/src/lib/seo-analytics';

const secret = 'test-only-consent-secret-32-characters';
const now = Date.now(), id = randomUUID();
const cookie = `picmoko_seo=${consentCookie(id, now + 10000, secret)}`;
const rpc = vi.fn(async () => true) as any;
const deps = { rpc, now: () => now, secret: () => secret, enabled: () => true, authenticate: vi.fn(async () => randomUUID()) };
const request = (path: string, body?: unknown, headers: Record<string, string> = {}, method = 'POST') => new Request('https://picmoko.com' + path, { method, headers: { Origin: 'https://picmoko.com', 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
beforeEach(() => vi.clearAllMocks());
describe('consented measurement boundary', () => {
  it('requires an unexpired authenticated cookie, rejects tampering and future cookies', () => {
    expect(consentSession(request('/api/seo/events', {}, { Cookie: cookie }), secret, now)).toBe(id);
    expect(consentSession(request('/api/seo/events', {}, { Cookie: cookie.replace(id, randomUUID()) }), secret, now)).toBeNull();
    expect(consentSession(request('/api/seo/events', {}, { Cookie: cookie }), secret, now + 20000)).toBeNull();
    expect(consentSession(request('/api/seo/events', {}, { Cookie: `picmoko_seo=${consentCookie(id, now + 3600000, secret)}` }), secret, now)).toBeNull();
    expect(consentSession(request('/api/seo/events', {}), secret, now)).toBeNull();
  });
  it('rejects cross-origin and disabled collection before database writes', async () => {
    const handle = createAnalyticsHandler(deps);
    expect((await handle(request('/api/seo/consent', {}, { Origin: 'https://evil.example' }))).status).toBe(403);
    expect((await createAnalyticsHandler({ ...deps, enabled: () => false })(request('/api/seo/consent', {}))).status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('uses the browser Host behind Next without accepting cross-site origins',async()=>{
    const handle=createAnalyticsHandler(deps);
    const r=new Request('http://localhost:3167/api/seo/consent',{method:'POST',headers:{Host:'127.0.0.1:3167',Origin:'http://127.0.0.1:3167','Content-Type':'application/json'},body:JSON.stringify({consent:true,landing_path:'/ja',source:'direct'})});
    expect((await handle(r)).status).toBe(201);
  });
  it('sets a secure HttpOnly consent cookie and persists only bounded metadata', async () => {
    const res = await createAnalyticsHandler(deps)(request('/api/seo/consent', { consent: true, landing_path: '/ja/tools/remove_person', source: 'organic_search' }, { 'X-Forwarded-For': '192.0.2.10' }));
    expect(res.status).toBe(201); expect(res.headers.get('set-cookie')).toContain('HttpOnly; SameSite=Lax'); expect(res.headers.get('set-cookie')).toContain('Secure');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(rpc.mock.calls[0][1].p_rate_key).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('192.0.2.10');
    expect((await res.json()).session_id).toBeUndefined();
  });
  it('rejects photos, arbitrary fields, private paths and forged business event names', async () => {
    const handle = createAnalyticsHandler(deps), base = { event_id: randomUUID(), event: 'page_view', path: '/ja' };
    for (const data of [{ ...base, email: 'sample@example.invalid' }, { ...base, path: '/auth/callback?code=secret' }, { ...base, event: 'purchase_paid' }, { ...base, tool_id: 'unknown_tool' }]) {
      expect((await handle(request('/api/seo/events', data, { Cookie: cookie }))).status).toBe(400);
    }
    expect(rpc).not.toHaveBeenCalled();
    expect((await handle(request('/api/seo/events', base))).status).toBe(401);
    expect((await handle(request('/api/seo/events', base, { Cookie: cookie }))).status).toBe(200);
    expect(rpc.mock.calls.at(-1)[0]).toBe('seo_record_event');
  });
  it('allows revocation even after emergency collection shutdown', async () => {
    const res = await createAnalyticsHandler({ ...deps, enabled: () => false })(request('/api/seo/consent', undefined, { Cookie: cookie }, 'DELETE'));
    expect(res.status).toBe(200); expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(rpc).toHaveBeenCalledWith('seo_revoke_session', { p_id: id });
  });
  it('links only successful authenticated business facts and preserves success on analytics failure', async () => {
    const job = randomUUID(), response = Response.json({ job_id: job }, { status: 202 });
    const req = request('/api/edit', {}, { Cookie: cookie, 'X-Analytics-Consent': 'granted' });
    expect(await linkBusinessResponse(req, response, deps)).toBe(response);
    expect(rpc.mock.calls.at(-1)[1]).toMatchObject({ p_session: id, p_kind: 'job', p_entity: job });
    rpc.mockRejectedValueOnce(new SeoError('SEO_UPSTREAM_UNAVAILABLE'));
    expect(await linkBusinessResponse(req, response, deps)).toBe(response);
    rpc.mockClear(); await linkBusinessResponse(request('/api/edit', {}, { Cookie: cookie }), response, deps);
    await linkBusinessResponse(req, Response.json({ error: {} }, { status: 402 }), deps);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('classifies referring hosts without reading query strings and rejects private public paths', () => {
    expect(analyticsSource('https://www.google.co.jp/search?q=private')).toBe('organic_search');
    expect(analyticsSource('https://google.com.evil.example/?token=private')).toBe('other');
    expect(publicAnalyticsPath('/ja/edit')).toBeNull(); expect(publicAnalyticsPath('/ja?email=private')).toBeNull();
  });
});
