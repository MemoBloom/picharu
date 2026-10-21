import { z } from 'zod';
import { SeoPath } from '@picjp/contracts';
import { MetricWindow } from '../../apps/web/src/server/seo/metrics';
import { normalizePublicPath } from '../../apps/web/src/lib/seo';

export const RankTarget = z.object({ query: z.string().trim().min(2).max(100).refine(s => !/@|token|https?:\/\//i.test(s)), path: SeoPath, device: z.enum(['mobile', 'desktop']), location: z.literal('Tokyo, Japan'), depth: z.union([z.literal(10), z.literal(20), z.literal(30)]) }).strict();
/** Fixed JP/ja location and bounded depth; provider credentials never enter reports or error messages. */
export async function collectRank(target: z.infer<typeof RankTarget>, day: string, apiKey: string, transport: typeof fetch = fetch) {
  const input = RankTarget.parse(target);
  MetricWindow.shape.day.parse(day);
  if (!apiKey) throw new Error('RANK_API_KEY_REQUIRED');
  let rank: number | null = null;
  const requestIds: string[] = [];
  for (let start = 0; start < input.depth; start += 10) {
    const url = new URL('https://serpapi.com/search.json');
    for (const [key, value] of Object.entries({ api_key: apiKey, engine: 'google', q: input.query, google_domain: 'google.co.jp', gl: 'jp', hl: 'ja', location: input.location, device: input.device, start: String(start), num: '10', output: 'json' })) url.searchParams.set(key, value);
    let response: Response;
    try { response = await transport(url, { signal: AbortSignal.timeout(30000), redirect: 'error' }); } catch { throw new Error('RANK_SOURCE_UNAVAILABLE'); }
    if (!response.ok) throw new Error('RANK_SOURCE_UNAVAILABLE');
    const bytes = await response.arrayBuffer(); if (bytes.byteLength > 2097152) throw new Error('RANK_RESPONSE_TOO_LARGE');
    const result = JSON.parse(Buffer.from(bytes).toString());
    if (result.error || result.search_metadata?.status !== 'Success' || !Array.isArray(result.organic_results)) throw new Error('INVALID_RANK_RESPONSE');
    if (typeof result.search_metadata.id === 'string') requestIds.push(result.search_metadata.id.slice(0, 100));
    for (const row of result.organic_results) {
      if (!Number.isInteger(row.position) || row.position < 1 || row.position > 10 || typeof row.link !== 'string') throw new Error('INVALID_RANK_RESPONSE');
      let link: URL; try { link = new URL(row.link); } catch { throw new Error('INVALID_RANK_RESPONSE'); }
      if (link.protocol === 'https:' && ['picmoko.com', 'www.picmoko.com'].includes(link.hostname) && normalizePublicPath(link.pathname) === input.path) rank = Math.min(rank ?? Infinity, start + row.position);
    }
    if (rank !== null) break;
  }
  return MetricWindow.parse({ source: 'serp', property: `google.co.jp|JP|ja|Tokyo|${input.device}|depth${input.depth}`, day, grain: 'query_page', is_fixture: false, quality: { provider: 'serpapi', locale: 'ja-JP', country: 'JP', location: input.location, device: input.device, requested_depth: input.depth, request_count: requestIds.length, provider_request_ids: requestIds, unranked_meaning: 'not_observed_within_requested_depth', observed_at: new Date().toISOString(), comparison: 'Only compare matching engine/location/device/depth; not GSC average position.' }, rows: [{ dimensions: { page: input.path, query: input.query, country: 'JP', locale: 'ja-JP', location: input.location, device: input.device, provider: 'serpapi' }, measures: { rank } }] });
}
