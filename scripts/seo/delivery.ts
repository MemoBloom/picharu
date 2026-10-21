import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { SeoPath } from '@picjp/contracts';
import type { SeoRpc } from '../../apps/web/src/server/seo/repository';

const Event = z.object({ id: z.string().uuid(), name: z.enum(['job_create', 'generate_success', 'generate_failed', 'purchase_paid']), path: SeoPath, tool_id: z.string().regex(/^[a-z_]+$/).nullable(), created_at: z.string().datetime({ offset: true }), ga_client_id: z.string().regex(/^\d{1,20}\.\d{1,20}$/), ga_session_id: z.number().int().positive() });
/** At-most-one HTTP submission per claimed event. A network timeout is unknown, never blindly retried. */
export async function deliverBusinessEvents(rpc: SeoRpc, measurement: string, secret: string, transport: typeof fetch = fetch, now = Date.now()) {
  if (!/^G-[A-Z0-9]+$/.test(measurement) || !secret) throw new Error('GA4_DELIVERY_NOT_CONFIGURED');
  const token = randomUUID(), rows = await rpc<any[]>('seo_claim_delivery', { p_token: token, p_limit: 25 });
  const counts = { sent: 0, unknown: 0, skipped: 0 };
  for (const raw of rows) {
    let state: keyof typeof counts = 'unknown';
    try {
      const event = Event.parse(raw), timestamp = Date.parse(event.created_at);
      if (now - timestamp > 72 * 3600000 || timestamp > now + 60000 || !await rpc('seo_delivery_allowed', { p_id: event.id, p_token: token })) state = 'skipped';
      else {
        const url = new URL('https://www.google-analytics.com/mp/collect'); url.searchParams.set('measurement_id', measurement); url.searchParams.set('api_secret', secret);
        const response = await transport(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: event.ga_client_id, timestamp_micros: timestamp * 1000, consent: { ad_user_data: 'DENIED', ad_personalization: 'DENIED' }, events: [{ name: event.name, params: { session_id: event.ga_session_id, event_id: event.id, page_location: 'https://picmoko.com' + event.path, page_title: 'picmoko', ...(event.tool_id ? { tool_id: event.tool_id } : {}) } }] }) });
        state = response.ok ? 'sent' : 'unknown';
      }
    } catch { /* Preserve an unknown result without recording credentials, URLs or provider bodies. */ }
    await rpc('seo_finish_delivery', { p_id: raw.id, p_token: token, p_state: state }); counts[state]++;
  }
  return counts;
}
