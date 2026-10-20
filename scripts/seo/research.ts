import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { SeoPath } from '@picjp/contracts';
import { MetricWindow, type MetricRow } from '../../apps/web/src/server/seo/metrics';

const DateLabel = MetricWindow.shape.day;
const Column = z.string().min(1).max(160);
const TermType = z.enum(['query', 'topic']);
const TopicId = z.string().regex(/^\/m\/[a-zA-Z0-9_]+$/);
const Series = z.object({ query: z.string().min(1).max(500), value_column: Column, term_type: TermType, topic_id: TopicId.optional(), page: SeoPath.optional() }).strict();
export const ResearchConfig = z.object({
  source: z.enum(['keyword_planner', 'trends']),
  export_id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  exported_at: z.string().datetime({ offset: true }), as_of: DateLabel,
  period_start: DateLabel, period_end: DateLabel,
  country: z.string().regex(/^[A-Z]{2}$/), locale: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
  search_type: z.enum(['web', 'image', 'news', 'shopping', 'youtube']),
  delimiter: z.enum(['comma', 'tab', 'semicolon']),
  keyword_column: Column.optional(), value_column: Column.optional(), page_column: Column.optional(),
  term_type: TermType.optional(), topic_id: TopicId.optional(), series: z.array(Series).min(1).max(5).optional(),
  date_column: Column.optional(), interval: z.enum(['day', 'week', 'month']).optional(),
  skip_rows: z.number().int().min(0).max(20).default(0),
  is_fixture: z.boolean(),
}).strict().superRefine((c, ctx) => {
  if (c.period_start > c.period_end || c.period_end > c.as_of) ctx.addIssue({ code: 'custom', message: 'Invalid export period' });
  if (c.source === 'trends' && (!c.date_column || !c.interval)) ctx.addIssue({ code: 'custom', message: 'Trends needs an explicit date column and interval' });
  if (c.source === 'keyword_planner' && (c.search_type !== 'web' || c.date_column || c.interval || c.series || c.term_type || c.topic_id)) ctx.addIssue({ code: 'custom', message: 'Planner records monthly search estimates, not a Trends timeline' });
  if (c.series ? c.keyword_column || c.value_column || c.page_column || c.term_type || c.topic_id : !c.keyword_column || !c.value_column) ctx.addIssue({ code: 'custom', message: 'Choose either mapped rows or explicit Trends series' });
  if (c.source === 'trends' && !c.series && (!c.term_type || (c.term_type === 'topic') !== !!c.topic_id)) ctx.addIssue({ code: 'custom', message: 'Declare query versus topic and topic ID' });
  for (const s of c.series || []) if ((s.term_type === 'topic') !== !!s.topic_id) ctx.addIssue({ code: 'custom', message: 'Topic series need a topic ID' });
  const columns = [c.keyword_column, c.value_column, c.page_column, c.date_column, ...(c.series || []).map(s => s.value_column)].filter(Boolean);
  if (new Set(columns).size !== columns.length) ctx.addIssue({ code: 'custom', message: 'Column mappings must be distinct' });
});
export type ResearchConfig = z.infer<typeof ResearchConfig>;

export function decodeResearchCsv(bytes: Buffer) {
  if (bytes.length > 5 * 1024 * 1024) throw new Error('SEO_RESEARCH_FILE_TOO_LARGE');
  try {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le', { fatal: true }).decode(bytes);
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be', { fatal: true }).decode(bytes);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch { throw new Error('SEO_RESEARCH_INVALID_ENCODING'); }
}
function numeric(raw: string) {
  const text = raw.trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?[kKmM]?$/.test(text)) return null;
  const suffix = text.match(/[kKmM]$/)?.[0]?.toLowerCase();
  const value = Number(text.replace(/,/g, '').replace(/[kKmM]$/, '')) * (suffix === 'k' ? 1000 : suffix === 'm' ? 1000000 : 1);
  return Number.isSafeInteger(value) ? value : null;
}
function plannerValue(raw: string): MetricRow['measures'] {
  const text = raw.trim();
  if (['', '-', '—', '--', 'N/A', 'NA', '不明', 'データなし'].includes(text)) return { volume: null };
  const exact = numeric(text); if (exact !== null) return { volume: exact };
  const range = /^(.+?)\s*[-–—~〜～]\s*(.+)$/.exec(text);
  const lower = range ? numeric(range[1]) : null, upper = range ? numeric(range[2]) : null;
  if (lower === null || upper === null || lower > upper) throw new Error('SEO_RESEARCH_INVALID_VALUE');
  return { volume: null, volume_lower: lower, volume_upper: upper };
}
function trendsValue(raw: string): MetricRow['measures'] {
  const text = raw.trim();
  if (['', '-', '—', 'N/A', 'データなし'].includes(text)) return { trend: null };
  if (text === '<1' || text === '< 1') return { trend: null, trend_upper_bound: 1 };
  if (!/^\d+(?:\.\d+)?$/.test(text) || Number(text) > 100) throw new Error('SEO_RESEARCH_INVALID_VALUE');
  return { trend: Number(text) };
}

/** Explicit column mappings support regional exports without guessing that Ads competition is SEO difficulty. */
export function researchWindows(bytes: Buffer, input: unknown): MetricWindow[] {
  const config = ResearchConfig.parse(input), text = decodeResearchCsv(bytes);
  let records: Record<string, string>[];
  try {
    records = parse(text, {
      delimiter: { comma: ',', tab: '\t', semicolon: ';' }[config.delimiter],
      bom: true, skip_empty_lines: true, from_line: config.skip_rows + 1, max_record_size: 65536,
      columns: (headers: string[]) => {
        if (headers.length > 100 || headers.some(h => !h || h.length > 160 || ['__proto__', 'prototype', 'constructor'].includes(h)) || new Set(headers).size !== headers.length) throw new Error();
        for (const column of [config.keyword_column, config.value_column, config.page_column, config.date_column, ...(config.series || []).map(s => s.value_column)].filter(Boolean)) if (!headers.includes(column!)) throw new Error();
        return headers;
      },
    });
  } catch { throw new Error('SEO_RESEARCH_INVALID_CSV'); }
  // A header-only research export must not clear a previously imported dataset.
  if (!records.length || records.length * (config.series?.length || 1) > 100000) throw new Error('SEO_RESEARCH_INVALID_ROW_COUNT');
  const points = records.flatMap(record => config.series
    ? config.series.map(series => ({ query: series.query, value: record[series.value_column], day: record[config.date_column!], page: series.page, term_type: series.term_type, topic_id: series.topic_id }))
    : [{ query: record[config.keyword_column!], value: record[config.value_column!], day: config.date_column ? record[config.date_column] : undefined, page: config.page_column ? record[config.page_column] : undefined, term_type: config.term_type, topic_id: config.topic_id }]);
  const byDay = new Map<string, MetricRow[]>(), seen = new Set<string>(), queries = new Set<string>();
  for (const point of points) {
    const query = point.query.trim().normalize('NFC');
    if (!query || query.length > 500 || /[\x00-\x1f]/.test(query)) throw new Error('SEO_RESEARCH_INVALID_QUERY');
    const rawDay = point.day === undefined ? config.as_of : point.day.trim();
    const day = DateLabel.parse(config.interval === 'month' && /^\d{4}-\d{2}$/.test(rawDay) ? rawDay + '-01' : rawDay);
    if (config.source === 'trends' && (day < config.period_start || day > config.period_end)) throw new Error('SEO_RESEARCH_POINT_OUTSIDE_PERIOD');
    const rawPage = point.page?.trim() || '';
    const page = rawPage ? SeoPath.parse(rawPage) : undefined;
    const term = { query, ...(point.term_type ? { term_type: point.term_type } : {}), ...(point.topic_id ? { topic_id: point.topic_id } : {}) };
    const row = { dimensions: { ...term, country: config.country, locale: config.locale, provider: config.source === 'trends' ? 'google_trends_csv' : 'google_ads_csv', ...(page ? { page } : {}) }, measures: config.source === 'trends' ? trendsValue(point.value) : plannerValue(point.value) };
    const parsed = MetricWindow.shape.rows.element.parse(row), key = JSON.stringify([day, parsed.dimensions]);
    if (seen.has(key)) throw new Error('SEO_RESEARCH_DUPLICATE_ROW');
    seen.add(key); queries.add(JSON.stringify(term)); const bucket = byDay.get(day) || []; bucket.push(parsed); byDay.set(day, bucket);
  }
  const scope = { country: config.country, locale: config.locale, search_type: config.search_type, from: config.period_start, to: config.period_end, ...(config.source === 'trends' ? { interval: config.interval, compared_queries: [...queries].sort().map(q => JSON.parse(q)) } : {}) };
  const scopeHash = createHash('sha256').update(JSON.stringify(scope)).digest('hex').slice(0, 24);
  return [...byDay].sort(([a], [b]) => a.localeCompare(b)).map(([day, rows]) => MetricWindow.parse({
    source: config.source, property: `csv:${config.export_id}:${scopeHash}`, day,
    grain: config.source === 'trends' ? `trend_${config.interval}` : 'keyword_estimate', is_fixture: config.is_fixture,
    quality: { producer: 'explicit_csv_mapping_v1', export_id: config.export_id, exported_at: config.exported_at, source_file_sha256: createHash('sha256').update(bytes).digest('hex'), scope, source_timezone: 'export_date_labels',
      volume_is_estimate: config.source === 'keyword_planner', ads_competition_is_not_seo_difficulty: true, trend_is_relative_not_volume: config.source === 'trends', trend_upper_bound_is_exclusive: true, missing_values_are_unknown: true,
      comparison: 'Only compare matching export, scope, normalization set and source. Do not sum estimated volumes or relative Trends scores.' }, rows,
  }));
}
