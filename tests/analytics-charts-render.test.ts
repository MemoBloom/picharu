import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import type {AnalyticsQuery,AnalyticsReport} from '@picjp/contracts';
import {AnalyticsTrendRow} from '@picjp/contracts';
import {LatencyTrend,RateTrend,UsageChart,UsageTrend,VersionTrends} from '../apps/web/src/components/analytics-charts';
beforeAll(()=>vi.stubGlobal('React',React));afterAll(()=>vi.unstubAllGlobals());
const query:AnalyticsQuery={start:'2026-02-01T00:00:00Z',end:'2026-02-04T00:00:00Z',timezone:'UTC',bucket:'day',environment:'test',internal:'exclude',cohort:'all'};
const metric={id:'M07',value:.5,numerator:1,denominator:2,sample_size:2,unit:'ratio',status:'ready',reason:null,coverage_start:null,auxiliary:{}};
function row(bucket:string){return AnalyticsTrendRow.parse({bucket,jobs:2,users:1,new_users:0,completed:1,failed:1,cancelled:0,in_flight:0,credits:3,saved_users:1,saved_jobs:1,save_status:'ready',tools:{photo:2},success:metric,save_rate:{...metric,id:'M12'},latency_p50_ms:1000,latency_p95_ms:2000,currencies:[]});}
function render(component:React.ComponentType<any>,props:Record<string,unknown>){return renderToStaticMarkup(React.createElement(component,props));}
const coloredLines=(html:string)=>html.match(/<line\b[^>]*stroke="(?:#c64731|#35634c)"[^>]*>/g)??[];
describe('real chart markup and sparse version observations',()=>{
 it('does not connect version rate points across a missing global time bucket',()=>{
  const rows=[row('2026-02-01'),row('2026-02-03')];
  expect(coloredLines(render(RateTrend,{rows,timeline:{query,axis:['2026-02-01','2026-02-02','2026-02-03']}}))).toHaveLength(0);
  expect(coloredLines(render(RateTrend,{rows,timeline:{query,axis:['2026-02-01','2026-02-03']}}))).toHaveLength(2);
 });
 it('shows latency in seconds and breaks both P50/P95 lines at sparse dates',()=>{
  const html=render(LatencyTrend,{rows:[row('2026-02-01'),row('2026-02-03')],timeline:{query,axis:['2026-02-01','2026-02-02','2026-02-03']}});
  expect(coloredLines(html)).toHaveLength(0);expect(html).toContain('P50（秒）');expect(html).toContain('P95（秒）');expect(html).toContain('>1</td>');expect(html).toContain('>2</td>');
 });
 it('keeps valid saved observations while marking an unknown period instead of inventing zero',()=>{
  const missing={...row('2026-02-02'),saved_users:null,saved_jobs:null,save_status:'not_collected' as const};
  const html=render(UsageChart,{rows:[row('2026-02-01'),missing],mode:'saved'});
  expect(html).toContain('2026-02-01 保存行为用户：1');expect(html).toContain('未采集 / 覆盖不足');expect(html).not.toContain('2026-02-02 保存行为用户：0');
 });
 it('offers all required real trend metrics through accessible select controls',()=>{
  const html=render(UsageTrend,{rows:[row('2026-02-01')],query});
  expect(html).toContain('aria-label="使用趋势指标"');for(const value of ['status','users','new','saved','credits','latency','rates'])expect(html).toContain(`value="${value}"`);
 });
 it('does not promote first_seen_at into a release marker when no publication fact exists',()=>{
  // Minimal view fixture; the full server DTO is validated in API/engine tests.
  const report={version_trends:[{key:'stable-version',trend:[row('2026-02-01')]}],version_releases:[],versions:[],trend:[row('2026-02-01')],meta:{query}} as unknown as AnalyticsReport;
  const html=render(VersionTrends,{report});expect(html).toContain('未记录正式发布时间');expect(html).toContain('aria-label="选择分析版本"');expect(html).toContain('aria-label="版本趋势指标"');expect(html).not.toContain('stroke-dasharray');
 });
 it('marks only actual in-window release evidence and retains its stated rollout scope',()=>{
  const html=render(UsageChart,{rows:[row('2026-02-01')],timeline:{query,releases:[{released_at:'2026-02-01T12:00:00Z',scope:'limited_rollout'}]}});
  expect(html).toContain('stroke-dasharray="4 3"');expect(html).toContain('2026-02-01T12:00:00Z');expect(html).toContain('limited_rollout');
 });
});
