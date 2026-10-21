import {describe,it,expect} from 'vitest';
import {toolUsageSeries,toolRankingBars,userRankingBars,releaseBucket,releasePositions,OTHER_TOOL_SERIES} from '../apps/web/src/components/analytics-chart-data';

describe('complete chart display grouping independent of detail pagination',()=>{
 it('keeps all dates and tools, merges beyond Top8, and reconciles every bar and total',()=>{
  const first=Object.fromEntries(Array.from({length:12},(_,i)=>[`future_tool_${i}`,12-i]));
  const second={future_tool_11:20,future_tool_0:2};
  const rows=[{bucket:'2026-02-01',jobs:78,tools:first},{bucket:'2026-02-02',jobs:22,tools:second}];
  const result=toolUsageSeries(rows,new Map([['future_tool_0','现名']]));
  expect(result.series).toHaveLength(9);expect(result.series[0].id).toBe('future_tool_11');
  expect(result.series.find(s=>s.id==='future_tool_0')?.label).toBe('现名');
  expect(result.series.at(-1)).toMatchObject({id:OTHER_TOOL_SERIES,total:14,selectable:false});
  expect(result.buckets.map(b=>b.total)).toEqual([78,22]);
  expect(result.series.reduce((sum,s)=>sum+s.total,0)).toBe(100);
  expect(result.total).toBe(result.source_total);expect(result.inconsistent_buckets).toEqual([]);
 });
 it('uses stable IDs when names are missing or duplicated and keeps deterministic ties',()=>{
  const rows=[{bucket:'one',jobs:3,tools:{new_b:1,new_a:1,new_c:1}}];
  const names=new Map([['new_a','同名'],['new_b','同名']]);
  const data=toolUsageSeries(rows,names,2);
  expect(data.series.map(s=>s.id)).toEqual(['new_a','new_b',OTHER_TOOL_SERIES]);
  expect(data.series.map(s=>s.total)).toEqual([1,1,1]);
  expect(toolUsageSeries(rows).series.map(s=>s.label)).toEqual(['new_a','new_b','new_c']);
 });
 it('computes Top8 from the full trend even when names contain only a later paged tool',()=>{
  const rows=[{bucket:'one',jobs:10,tools:{largest:8,later_page:2}}];
  const all=toolRankingBars(rows,new Map([['largest','最大'],['later_page','后页']]));
  const page=toolRankingBars(rows,new Map([['later_page','后页']]));
  expect(page.map(r=>[r.id,r.value])).toEqual(all.map(r=>[r.id,r.value]));
  expect(page[0]).toMatchObject({id:'largest',label:'largest',value:8});
  expect(page.reduce((sum,r)=>sum+r.value,0)).toBe(10);
 });
 it('marks inconsistent task attribution instead of quietly fabricating remainder facts',()=>{
  const result=toolUsageSeries([{bucket:'bad',jobs:5,tools:{known:3}}]);
  expect(result.inconsistent_buckets).toEqual(['bad']);expect(result.total).toBe(3);expect(result.source_total).toBe(5);
  expect(result.series).not.toContainEqual(expect.objectContaining({id:OTHER_TOOL_SERIES}));
 });
 it('keeps zero usage and no-data distinct from a fake missing tool',()=>{
  expect(toolUsageSeries([])).toMatchObject({series:[],buckets:[],total:0,source_total:0});
  const result=toolUsageSeries([{bucket:'empty',jobs:0,tools:{}}]);
  expect(result.series).toEqual([]);expect(result.buckets[0]).toMatchObject({total:0,source_total:0});
 });
 it('renders the global user Top15 plus every remaining user including zero usage',()=>{
  const top=Array.from({length:15},(_,i)=>({user_id:`user-${i}`,email_masked:i===0?'a***@example.com':null,jobs:20-i}));
  const rows=userRankingBars({top,other_jobs:7,other_users:9});
  expect(rows).toHaveLength(16);expect(rows[0].label).toBe('a***@example.com');
  expect(rows.at(-1)).toMatchObject({value:7,selectable:false,label:'其他（9人）'});
  expect(rows.reduce((sum,r)=>sum+r.value,0)).toBe(top.reduce((sum,r)=>sum+r.jobs,0)+7);
  expect(userRankingBars({top:[],other_jobs:0,other_users:3})).toEqual([{id:'__other_users__',label:'其他（3人）',value:0,detail:'3人 · 0任务',selectable:false}]);
  expect(userRankingBars({top:[],other_jobs:0,other_users:0})).toEqual([]);
 });
});

describe('release marker calendar positions never infer publication from jobs',()=>{
 it('uses the report timezone and Monday-based natural week',()=>{
  expect(releaseBucket('2026-02-01T16:00:00Z','Asia/Tokyo','day')).toBe('2026-02-02');
  expect(releaseBucket('2026-02-01T16:00:00Z','Asia/Tokyo','week')).toBe('2026-02-02');
  expect(releaseBucket('2026-02-01T14:00:00Z','Asia/Tokyo','week')).toBe('2026-01-26');
 });
 it('keeps the two repeated DST hours distinct',()=>{
  expect(releaseBucket('2026-11-01T05:30:00Z','America/New_York','hour')).toBe('2026-11-01T01:00-04:00');
  expect(releaseBucket('2026-11-01T06:30:00Z','America/New_York','hour')).toBe('2026-11-01T01:00-05:00');
 });
 it('only plots a recorded release that belongs to the displayed bucket axis',()=>{
  const releases=[{released_at:'2026-01-01T00:00:00Z',scope:'all_users'},{released_at:'2026-02-02T00:00:00Z',scope:'limited_rollout'}];
  expect(releasePositions(releases,['2026-02-01','2026-02-02'],'UTC','day')).toEqual([{...releases[1],index:1}]);
  expect(releasePositions([],['2026-02-02'],'UTC','day')).toEqual([]);
  expect(releaseBucket('bad-date','UTC','day')).toBeNull();
 });
});
