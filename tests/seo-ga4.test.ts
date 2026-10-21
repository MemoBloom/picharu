import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { deliverBusinessEvents } from '../scripts/seo/delivery';
import { sanitizedGoogleContext, sendGoogleEvent, stopGoogleMeasurement } from '../apps/web/src/lib/seo-ga4';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('GA4 manual transport and business-fact outbox', () => {
  it('overrides locations and referring URLs with public bounded values', () => {
    expect(sanitizedGoogleContext('/ja/tools/remove_person', 'https://www.google.co.jp/search?q=private&token=secret')).toEqual({ page_location: 'https://picmoko.com/ja/tools/remove_person', page_title: 'picmoko', page_referrer: 'https://www.google.co.jp/' });
    expect(sanitizedGoogleContext('/auth/callback?token=private', '')).toBeNull();
    expect(sanitizedGoogleContext('/ja', 'https://name:secret@host.example/private')).toMatchObject({ page_referrer: '' });
  });
  it('loads no external tag without the separate activation flag', async () => {
    vi.stubGlobal('window', {}); const append = vi.fn(); vi.stubGlobal('document', { referrer: '', head: { appendChild: append } });
    vi.stubEnv('NEXT_PUBLIC_GA4_ENABLED', 'false'); await sendGoogleEvent('page_view', '/ja'); expect(append).not.toHaveBeenCalled();
  });
  it('uses manual pageviews, binds real tag IDs, and disables measurement on revoke', async () => {
    vi.stubEnv('NEXT_PUBLIC_GA4_ENABLED', 'true'); vi.stubEnv('NEXT_PUBLIC_GA4_MEASUREMENT_ID', 'G-RGY24MR7LP');
    const gtag = vi.fn((...args: any[]) => { if (args[0] === 'get') args[3](args[2] === 'client_id' ? '1234567890.1234567890' : 1792500000); });
    const doc = { cookie: '', referrer: 'https://google.com/?q=private', createElement: () => ({ onload: undefined as (() => void) | undefined }), head: { appendChild: (script: any) => { script.onload(); } } };
    vi.stubGlobal('window', { gtag, setTimeout, clearTimeout }); vi.stubGlobal('document', doc);
    const transport = vi.fn(async (_url: unknown, _init?:RequestInit) => Response.json({ received: true })); vi.stubGlobal('fetch', transport);
    await sendGoogleEvent('page_view', '/ja');
    expect(gtag.mock.calls.find(c => c[0] === 'config')?.[2]).toMatchObject({ send_page_view: false, allow_google_signals: false, page_location: 'https://picmoko.com/ja' });
    expect(transport).toHaveBeenCalledTimes(1); expect(JSON.parse(String(transport.mock.calls[0][1]!.body))).toEqual({ client_id: '1234567890.1234567890', session_id: 1792500000 });
    expect(JSON.stringify(gtag.mock.calls)).not.toContain('q=private'); stopGoogleMeasurement(); expect((window as any)['ga-disable-G-RGY24MR7LP']).toBe(true);
  });
  it('sends server facts once and treats HTTP receipt separately from GA4 processing', async () => {
    const id = randomUUID(), raw = { id, name: 'purchase_paid', path: '/ja', tool_id: null, created_at: new Date().toISOString(), ga_client_id: '123.456', ga_session_id: 1792500000 };
    const rpc = vi.fn(async (name: string) => name === 'seo_claim_delivery' ? [raw] : true) as any;
    const transport = vi.fn(async (_url: any, init: any) => { expect(JSON.parse(init.body).events[0].name).toBe('purchase_paid'); expect(init.body).not.toContain('owner_id'); return new Response(null, { status: 204 }); }) as any;
    expect(await deliverBusinessEvents(rpc, 'G-RGY24MR7LP', 'fixture-server-only-secret', transport)).toEqual({ sent: 1, unknown: 0, skipped: 0 });
    expect(transport).toHaveBeenCalledTimes(1); expect(JSON.stringify(rpc.mock.calls)).not.toContain('fixture-server-only-secret');
    const timeout = vi.fn(async () => { throw new Error('sensitive upstream URL'); }) as any;
    expect(await deliverBusinessEvents(rpc, 'G-RGY24MR7LP', 'fixture-secret', timeout)).toEqual({ sent: 0, unknown: 1, skipped: 0 }); expect(timeout).toHaveBeenCalledTimes(1);
  });
  it('skips revoked consent and stale events without making paid or Google requests', async () => {
    const raw = { id: randomUUID(), name: 'job_create', path: '/ja', tool_id: 'remove_person', created_at: new Date(Date.now() - 80 * 3600000).toISOString(), ga_client_id: '123.456', ga_session_id: 1792500000 };
    const rpc = vi.fn(async (name: string) => name === 'seo_claim_delivery' ? [raw] : false) as any, transport = vi.fn() as any;
    expect(await deliverBusinessEvents(rpc, 'G-RGY24MR7LP', 'fixture-secret', transport)).toEqual({ sent: 0, unknown: 0, skipped: 1 }); expect(transport).not.toHaveBeenCalled();
    rpc.mockClear(); await expect(deliverBusinessEvents(rpc, 'bad-id', '', transport)).rejects.toThrow('GA4_DELIVERY_NOT_CONFIGURED'); expect(rpc).not.toHaveBeenCalled();
  });
});
