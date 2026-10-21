import { MetricWindow } from '../../apps/web/src/server/seo/metrics';
import type { SeoRpc } from '../../apps/web/src/server/seo/repository';
import { importWindow } from './import';

export function daysBetween(from: string, to: string) {
  MetricWindow.shape.day.parse(from); MetricWindow.shape.day.parse(to);
  const count = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  if (count < 1 || count > 31) throw new Error('BACKFILL_LIMIT_31_DAYS');
  return Array.from({ length: count }, (_, i) => new Date(Date.parse(from) + i * 86400000).toISOString().slice(0, 10));
}
/** Retry collection only. Import commits are idempotent per day/grain and never append duplicate facts. */
export async function backfill(rpc: SeoRpc, source: 'gsc' | 'ga4', property: string, from: string, to: string, collect: (day: string) => Promise<MetricWindow[]>, wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  const results: { day: string; status: string }[] = [];
  for (const day of daysBetween(from, to)) {
    let windows: MetricWindow[] | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { windows = await collect(day); break; } catch { if (attempt < 2) await wait(500 * 2 ** attempt); }
    }
    if (!windows) {
      // Preserve yesterday's facts and make upstream failure visible, without storing raw provider errors.
      const grains = source === 'gsc' ? ['property', 'page', 'query_page'] : ['landing_event'];
      for (const grain of grains) {
        const id = crypto.randomUUID();
        await rpc('seo_ingest_begin', { p_id: id, p_source: source, p_property: property, p_day: day, p_grain: grain, p_fixture: false, p_quality: { collection_failed: true } });
        await rpc('seo_ingest_finish', { p_id: id, p_batches: 0, p_error: 'UPSTREAM_COLLECTION_FAILED' });
      }
      results.push({ day, status: 'failed' }); continue;
    }
    for (const window of windows) await importWindow(rpc, window);
    results.push({ day, status: 'complete' });
  }
  return results;
}
