import { describe, expect, it, vi } from 'vitest';
import { collectGscDay, collectGa4Day } from '../scripts/seo/google';
import { collectRank } from '../scripts/seo/ranking';
import { backfill, daysBetween } from '../scripts/seo/backfill';
import { matureWindow } from '../scripts/seo/schedule';
import { importWindow } from '../scripts/seo/import';

describe('source adapters and recoverable daily imports', () => {
  it('uses separate PT and Japanese day boundaries for mature daily backfill',()=>{
    const now=Date.parse('2026-10-20T17:00:00Z');
    expect(matureWindow('America/Los_Angeles',now).to).toBe('2026-10-17');
    expect(matureWindow('Asia/Tokyo',now).to).toBe('2026-10-18');
    expect(matureWindow('Asia/Tokyo',now).days).toHaveLength(7);
  });
  it('keeps GSC grains separate and computes weighted sanitized page variants', async () => {
    const post = vi.fn(async (_url: string, body: any) => {
      expect(body.dataState).toBe('final'); expect(body.type).toBe('web');
      if (!body.dimensions.length) return { rows: [{ clicks: 4, impressions: 100, position: 8 }] };
      const query = body.dimensions.includes('query');
      return { rows: [
        { keys: ['https://picmoko.com/ja/tools/remove_person?utm_source=x', ...(query ? ['写真 人 消す'] : []), 'jpn', 'MOBILE'], clicks: 1, impressions: 25, position: 4 },
        { keys: ['https://picmoko.com/ja/tools/remove_person', ...(query ? ['写真 人 消す'] : []), 'jpn', 'MOBILE'], clicks: 3, impressions: 75, position: 12 },
        { keys: ['https://picmoko.com/ja/edit?token=private', ...(query ? ['private@example.invalid'] : []), 'jpn', 'MOBILE'], clicks: 1, impressions: 2, position: 1 },
      ] };
    });
    const windows = await collectGscDay({ post }, 'sc-domain:picmoko.com', '2026-10-17');
    expect(windows.map(w => w.grain)).toEqual(['property', 'page', 'query_page']);
    expect(windows[1].rows).toHaveLength(1); expect(windows[1].rows[0].measures).toEqual({ clicks: 4, impressions: 100, position: 10 });
    expect(windows[1].quality.source_timezone).toBe('America/Los_Angeles'); expect(windows[1].quality.dropped_rows).toBe(1);
    expect(JSON.stringify(windows)).not.toContain('token=');
  });
  it('detects repeated pagination instead of silently duplicating GSC rows', async () => {
    const post = vi.fn(async (_url: string, body: any) => body.dimensions.length ? { rows: [{ keys: body.dimensions.map((d: string) => ({ page: 'https://picmoko.com/ja', query: '写真', country: 'jpn', device: 'MOBILE' })[d as 'page']), clicks: 1, impressions: 2, position: 4 }] } : {});
    await expect(collectGscDay({ post }, 'sc-domain:picmoko.com', '2026-10-17', 1, 3)).rejects.toThrow('REPEATED_GSC_PAGE');
    await expect(collectGscDay({ post }, 'sc-domain:picmoko.com', '2026-02-30')).rejects.toThrow();
  });
  it('sanitizes GA4 landing URLs and never sums non-additive users', async () => {
    const post = vi.fn(async (_url: string, body: any) => ({
      dimensionHeaders: body.dimensions, metricHeaders: body.metrics, rowCount: 2, metadata: { timeZone: 'Asia/Tokyo', subjectToThresholding: true },
      rows: ['/ja/tools/remove_person?utm_source=x', '/ja/tools/remove_person'].map(value => ({ dimensionValues: ['20261017', value, 'Organic Search', 'mobile', 'JP', 'page_view'].map(value => ({ value })), metricValues: ['2', '1', '1'].map(value => ({ value })) })),
    }));
    const window = await collectGa4Day({ post }, '559730643', '2026-10-17');
    expect(window.rows).toHaveLength(1); expect(window.rows[0].measures).toEqual({ events: 4, users: null, sessions: null });
    expect(window.quality.subject_to_thresholding).toBe(true); expect(window.quality.source_timezone).toBe('Asia/Tokyo');
    await expect(collectGa4Day({ post }, 'picmoko', '2026-10-17')).rejects.toThrow('INVALID_GA4_PROPERTY_ID');
  });
  it('imports bounded batches and marks errors without leaking raw provider failures', async () => {
    const window = { source: 'gsc', property: 'sc-domain:picmoko.com', day: '2026-10-17', grain: 'page', is_fixture: true, quality: {}, rows: [{ dimensions: { page: '/ja' }, measures: { clicks: 1, impressions: 2 } }] };
    const rpc = vi.fn(async (name: string) => { if (name === 'seo_ingest_stage') throw new Error('private upstream token'); return {}; }) as any;
    await expect(importWindow(rpc, window)).rejects.toThrow();
    expect(rpc.mock.calls.at(-1)[0]).toBe('seo_ingest_finish'); expect(JSON.stringify(rpc.mock.calls)).not.toContain('private upstream token');
  });
  it('backfills a bounded range and records failed grains without replacing facts', async () => {
    expect(daysBetween('2026-10-17', '2026-10-19')).toHaveLength(3);
    expect(() => daysBetween('2026-10-19', '2026-10-17')).toThrow(); expect(() => daysBetween('2026-01-01', '2026-03-01')).toThrow();
    const collect = vi.fn(async () => { throw new Error('invalid-token-private'); }), rpc = vi.fn(async () => ({})) as any;
    expect(await backfill(rpc, 'gsc', 'sc-domain:picmoko.com', '2026-10-17', '2026-10-17', collect, async () => {})).toEqual([{ day: '2026-10-17', status: 'failed' }]);
    expect(collect).toHaveBeenCalledTimes(3); expect(rpc.mock.calls.filter((c: any[]) => c[0] === 'seo_ingest_finish')).toHaveLength(3);
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('invalid-token-private');
  });
  it('queries a real ranking API contract with fixed JP/device/depth and nullable missing ranks', async () => {
    const transport = vi.fn(async (input: any) => { const url = new URL(input); expect(url.hostname).toBe('serpapi.com'); expect(url.searchParams.get('gl')).toBe('jp'); expect(url.searchParams.get('device')).toBe('mobile'); return Response.json({ search_metadata: { id: 'fixture-request', status: 'Success' }, organic_results: [{ position: 3, link: 'https://picmoko.com/ja/tools/remove_person?utm=x' }] }); }) as any;
    const target = { query: '写真から人を消す', path: '/ja/tools/remove_person', device: 'mobile', location: 'Tokyo, Japan', depth: 10 } as const;
    expect((await collectRank(target, '2026-10-20', 'fixture-not-a-real-key', transport)).rows[0].measures.rank).toBe(3);
    const missing = await collectRank(target, '2026-10-20', 'fixture-key', async () => Response.json({ search_metadata: { status: 'Success' }, organic_results: [] }));
    expect(missing.rows[0].measures.rank).toBeNull(); expect(JSON.stringify(missing)).not.toContain('fixture-key');
    await expect(collectRank(target, '2026-10-20', 'fixture-key', async () => { throw new Error('secret-url'); })).rejects.toThrow('RANK_SOURCE_UNAVAILABLE');
  });
});
