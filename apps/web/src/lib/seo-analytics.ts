'use client';
import { SeoPath, ToolId, type SeoEventRequest } from '@picjp/contracts';
import { sendGoogleEvent, stopGoogleMeasurement } from './seo-ga4';

type EventName = (typeof SeoEventRequest)['_type']['event'];
const choiceKey = 'picmoko:analytics-choice';
let ready: Promise<boolean> | undefined;
let lastPath: string | null = null;
export function syncAnalyticsChoice() { if(analyticsChoice()!=='allow'){ready=undefined;stopGoogleMeasurement();} }
export function analyticsChoice(): 'allow' | 'deny' | null {
  if(typeof window==='undefined')return null;
  try { const value = JSON.parse(localStorage.getItem(choiceKey) || 'null'); return value?.expires > Date.now() && ['allow', 'deny'].includes(value.choice) ? value.choice : null; } catch { return null; }
}
export function saveAnalyticsChoice(choice: 'allow' | 'deny') {
  try { localStorage.setItem(choiceKey, JSON.stringify({ choice, expires: Date.now() + 30 * 86400000 })); } catch { /* Storage-disabled browsers can still decline. */ }
  ready = undefined;
  if(choice==='deny')stopGoogleMeasurement();
}
export function publicAnalyticsPath(path: string) {
  const value = path.replace(/\/$/, '') || '/ja';
  return SeoPath.safeParse(value).success ? value : null;
}
export function analyticsSource(referrer: string): 'organic_search' | 'x' | 'tiktok' | 'direct' | 'other' {
  if (!referrer) return 'direct';
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    if (/(^|\.)(google\.(com|co\.jp)|bing\.com|search\.yahoo\.co\.jp)$/.test(host)) return 'organic_search';
    if (['t.co', 'x.com', 'twitter.com'].includes(host)) return 'x';
    if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok';
    return 'other';
  } catch { return 'other'; }
}
export function setAnalyticsPublicPath(path: string) {
  const clean = publicAnalyticsPath(path);
  if (clean) { lastPath = clean; try { sessionStorage.setItem('picmoko:analytics-landing', JSON.stringify({ path: clean, expires: Date.now() + 1800000 })); } catch {} }
  return clean;
}
function restoreLanding() {
  if (lastPath) return;
  try { const value = JSON.parse(sessionStorage.getItem('picmoko:analytics-landing') || 'null'); if (value?.expires > Date.now() && typeof value.path === 'string') lastPath = publicAnalyticsPath(value.path); } catch {}
}
async function ensureSession() {
  restoreLanding();
  if (process.env.NEXT_PUBLIC_ANALYTICS_ENABLED !== 'true' || analyticsChoice() !== 'allow' || !lastPath) return false;
  if (!ready) ready = fetch('/api/seo/consent', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consent: true, landing_path: lastPath, source: analyticsSource(document.referrer) }), signal: AbortSignal.timeout(5000) }).then(r => r.ok).catch(() => false).then(ok => { if (!ok) ready = undefined; return ok; });
  return ready;
}
export async function trackSeoEvent(event: EventName, tool?: string) {
  try {
    if (!await ensureSession() || !lastPath) return;
    const toolId = tool && ToolId.safeParse(tool).success ? tool : undefined;
    const res = await fetch('/api/seo/events', { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: crypto.randomUUID(), event, path: lastPath, ...(toolId ? { tool_id: toolId } : {}) }), signal: AbortSignal.timeout(5000) });
    if (res.status === 401) ready = undefined;
    if(res.ok)void sendGoogleEvent(event,lastPath,toolId,()=>analyticsChoice()==='allow');
  } catch { /* Optional measurement never interrupts login, uploading or download. */ }
}
export async function revokeAnalytics() {
  ready = undefined;
  try { const res = await fetch('/api/seo/consent', { method: 'DELETE', credentials: 'same-origin', signal: AbortSignal.timeout(5000) }); return res.ok; } catch { return false; }
}
