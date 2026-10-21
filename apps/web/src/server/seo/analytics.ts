import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { SeoConsentRequest, SeoEventRequest, SeoGa4SessionRequest, SeoPath, ToolId } from '@picjp/contracts';
import { boundedBytes } from '../errors';
import { SeoError, type SeoRpc } from './repository';

const cookieName = 'picmoko_seo';
type Dependencies = { rpc: SeoRpc; now: () => number; secret: () => string | undefined; enabled: () => boolean };
function key(secret?: string) { if (!secret || secret.length < 32) throw new SeoError('SEO_NOT_CONFIGURED'); return secret; }
export function consentCookie(id: string, expires: number, secret?: string) {
  const value = `${id}.${expires}`;
  return `${value}.${createHmac('sha256', key(secret)).update(value).digest('hex')}`;
}
export function consentSession(request: Request, secret: string | undefined, now = Date.now()): string | null {
  const value = request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  if (!value) return null;
  const [id, expiry, signature, ...extra] = value.split('.');
  if (extra.length || !z.string().uuid().safeParse(id).success || !/^\d{13}$/.test(expiry || '') || !/^[a-f0-9]{64}$/.test(signature || '')) return null;
  if (Number(expiry) <= now || Number(expiry) > now + 1800001) return null;
  const expected = consentCookie(id, Number(expiry), secret).split('.')[2];
  return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex')) ? id : null;
}
function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const url = new URL(request.url);
  // Next's internal request URL may use localhost while Host retains the actual browser host.
  const host = request.headers.get('host') || url.host;
  const scheme = request.headers.get('x-forwarded-proto')?.split(',')[0].trim() || url.protocol.slice(0, -1);
  if (!/^[a-z0-9.:[\]-]+$/i.test(host) || !['http','https'].includes(scheme) || !origin || origin !== `${scheme}://${host}` || request.headers.get('sec-fetch-site') === 'cross-site') throw new SeoError('SEO_FORBIDDEN', 403);
}
async function json(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new SeoError('SEO_INVALID_CONTENT_TYPE', 415);
  return JSON.parse((await boundedBytes(request, 4096)).toString());
}
export function createAnalyticsHandler(deps: Dependencies) {
  return async (request: Request) => {
    const headers = new Headers({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Content-Type': 'application/json' });
    const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
    try {
      sameOrigin(request);
      const path = new URL(request.url).pathname;
      const session = consentSession(request, deps.secret(), deps.now());
      const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
      // Revocation remains available when collection has been switched off.
      if (path === '/api/seo/consent' && request.method === 'DELETE') {
        if (session) await deps.rpc('seo_revoke_session', { p_id: session });
        headers.set('Set-Cookie', `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
        return response({ revoked: true });
      }
      if (!deps.enabled()) throw new SeoError('SEO_ANALYTICS_DISABLED', 503);
      if (path === '/api/seo/consent' && request.method === 'POST') {
        const data = SeoConsentRequest.parse(await json(request));
        if (session) return response({ consent: true, expires_in: 1800 });
        const id = randomUUID();
        // Trusted edge IP is hashed; raw addresses are neither persisted nor returned.
        const address = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
        const rate = createHmac('sha256', key(deps.secret())).update(address).digest('hex');
        await deps.rpc('seo_start_session', { p_id: id, p_path: data.landing_path, p_source: data.source, p_rate_key: rate });
        headers.set('Set-Cookie', `${cookieName}=${consentCookie(id, deps.now() + 1800000, deps.secret())}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1800${secure}`);
        return response({ consent: true, expires_in: 1800 }, 201);
      }
      if (!session) throw new SeoError('SEO_CONSENT_REQUIRED', 401);
      if (path === '/api/seo/ga4-session' && request.method === 'POST') {
        const data = SeoGa4SessionRequest.parse(await json(request));
        await deps.rpc('seo_set_ga4_session', { p_session: session, p_client: data.client_id, p_ga_session: data.session_id });
        return response({ received: true });
      }
      if (path === '/api/seo/events' && request.method === 'POST') {
        const data = SeoEventRequest.parse(await json(request));
        if (data.tool_id && !ToolId.safeParse(data.tool_id).success) throw new SeoError('SEO_INVALID_REQUEST', 400);
        const inserted = await deps.rpc('seo_record_event', { p_session: session, p_id: data.event_id, p_name: data.event, p_path: data.path, p_tool: data.tool_id ?? null });
        return response({ received: true, inserted });
      }
      throw new SeoError('SEO_NOT_FOUND', 404);
    } catch (error) {
      if (error instanceof SeoError) return response({ error: { code: error.code } }, error.status);
      if (error instanceof z.ZodError || error instanceof SyntaxError) return response({ error: { code: 'SEO_INVALID_REQUEST' } }, 400);
      if (error instanceof Error && 'status' in error && typeof error.status === 'number' && error.status >= 400 && error.status < 500) return response({ error: { code: 'SEO_INVALID_REQUEST' } }, error.status);
      return response({ error: { code: 'SEO_UNAVAILABLE' } }, 503);
    }
  };
}

/** A failed analytics write must not turn a successful paid operation into an error. */
export async function linkBusinessResponse(request: Request, response: Response, deps: Dependencies & { authenticate: (r: Request) => Promise<string> }) {
  const path = new URL(request.url).pathname;
  if (request.headers.get('x-analytics-consent') !== 'granted' || request.method !== 'POST' || !response.ok || !deps.enabled() || !['/api/edit', '/api/checkout'].includes(path)) return response;
  try {
    const session = consentSession(request, deps.secret(), deps.now());
    if (!session) return response;
    const result = await response.clone().json();
    const entity = path === '/api/edit' ? result.job_id : result.order_id;
    if (!z.string().uuid().safeParse(entity).success) return response;
    const owner = await deps.authenticate(request);
    await deps.rpc('seo_link_business', { p_session: session, p_owner: owner, p_kind: path === '/api/edit' ? 'job' : 'order', p_entity: entity });
  } catch { /* Core job/payment truth and response remain authoritative. */ }
  return response;
}

export function safeAnalyticsPath(path: unknown) { const parsed = SeoPath.safeParse(path); return parsed.success ? parsed.data : null; }
