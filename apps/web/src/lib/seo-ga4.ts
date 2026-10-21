'use client';
import { SeoPath } from '@picjp/contracts';

type GoogleWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: any[]) => void };
let loading: Promise<boolean> | undefined;
let bound = false;
const measurement = () => process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID || '';
export function sanitizedGoogleContext(path: string, referrer: string) {
  if (!SeoPath.safeParse(path).success) return null;
  let source = '';
  try { const url = new URL(referrer); if (url.protocol === 'https:' && !url.username && !url.password && /(^|\.)(google\.(com|co\.jp)|bing\.com|search\.yahoo\.co\.jp|tiktok\.com|x\.com|twitter\.com|t\.co)$/.test(url.hostname)) source = url.origin + '/'; } catch {}
  return { page_location: 'https://picmoko.com' + path, page_title: 'picmoko', page_referrer: source };
}
export function stopGoogleMeasurement() {
  if (typeof window === 'undefined') return;
  const w = window as GoogleWindow;
  (w as any)['ga-disable-' + measurement()] = true;
  w.gtag?.('consent', 'update', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  bound = false;
  for (const part of document.cookie.split(';')) {
    const name = part.trim().split('=')[0]; if (!/^picmoko_ga(?:_|$)/.test(name)) continue;
    document.cookie = `${name}=; Path=/; Max-Age=0`;
    document.cookie = `${name}=; Path=/; Domain=.picmoko.com; Max-Age=0; Secure`;
  }
}
async function load(path: string) {
  const id = measurement(), context = sanitizedGoogleContext(path, document.referrer);
  if (process.env.NEXT_PUBLIC_GA4_ENABLED !== 'true' || !/^G-[A-Z0-9]+$/.test(id) || !context) return false;
  const w = window as GoogleWindow;
  (w as any)['ga-disable-' + id] = false;
  if (!loading) {
    w.dataLayer = w.dataLayer || [];
    w.gtag = w.gtag || function () { w.dataLayer!.push(arguments); };
    w.gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    w.gtag('js', new Date());
    w.gtag('config', id, { ...context, send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, cookie_prefix: 'picmoko', cookie_expires: 30 * 86400, cookie_update: false });
    const script = document.createElement('script'); script.async = true; script.referrerPolicy = 'no-referrer'; script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    loading = new Promise(resolve => { const timer = window.setTimeout(() => resolve(false), 5000); script.onload = () => { clearTimeout(timer); resolve(true); }; script.onerror = () => { clearTimeout(timer); resolve(false); }; });
    document.head.appendChild(script);
  }
  // Explicit context overrides every browser URL, including Auth callbacks and signed links.
  w.gtag?.('set', context);
  w.gtag?.('consent', 'update', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  return loading;
}
export async function sendGoogleEvent(event: string, path: string, tool?: string, allowed: () => boolean = () => true) {
  if (!allowed() || !await load(path) || !allowed()) return;
  const w = window as GoogleWindow, context = sanitizedGoogleContext(path, document.referrer);
  if (!context) return;
  w.gtag?.('event', event, { ...context, ...(tool ? { tool_id: tool } : {}), send_to: measurement() });
  if (!bound) {
    const get = (field: string) => new Promise<unknown>(resolve => { const timer = window.setTimeout(() => resolve(null), 1500); w.gtag?.('get', measurement(), field, (value: unknown) => { clearTimeout(timer); resolve(value); }); });
    const [client, session] = await Promise.all([get('client_id'), get('session_id')]);
    if (!allowed() || typeof client !== 'string' || !/^\d{1,20}\.\d{1,20}$/.test(client) || !/^\d+$/.test(String(session))) return;
    try { const res = await fetch('/api/seo/ga4-session', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: client, session_id: Number(session) }), signal: AbortSignal.timeout(5000) }); bound = res.ok; } catch {}
  }
}
