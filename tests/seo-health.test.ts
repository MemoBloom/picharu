import { describe,it,expect,vi } from 'vitest';
import { pipelineHealth,readPipelineHealth,type HealthDay } from '../apps/web/src/server/seo/health';
import { matureWindow } from '../apps/web/src/server/seo/calendar';
const now=Date.parse('2026-10-20T17:00:00Z');
const options={now,fixture:false,gscProperty:'sc-domain:picmoko.com',ga4Property:'559730643',ga4Timezone:'Asia/Tokyo'};
function healthy():HealthDay[]{return (['property','page','query_page','landing_event'] as const).flatMap(grain=>{const source=grain==='landing_event'?'ga4':'gsc';return matureWindow(source==='gsc'?'America/Los_Angeles':'Asia/Tokyo',now).days.map(day=>({source,property:source==='gsc'?options.gscProperty:options.ga4Property,grain,day,status:'complete',created_at:new Date(now-1000).toISOString(),completed_at:new Date(now).toISOString(),quality:{},successful_status:'complete',successful_at:new Date(now).toISOString(),successful_quality:{}}));});}
describe('mature-window ingestion health',()=>{
 it('reports complete source-specific calendars without joining PT and Japan days',()=>{
  const h=pipelineHealth(healthy(),options);expect(h.healthy).toBe(true);expect(h.can_suggest_search_changes).toBe(true);
  expect(h.sources[0]).toMatchObject({to:'2026-10-17',expected_days:7,successful_days:7,status:'ready'});
  expect(h.sources[3]).toMatchObject({to:'2026-10-18',timezone:'Asia/Tokyo'});
 });
 it('distinguishes empty success from absent, unconfigured and partial coverage',()=>{
  const empty=healthy().map(r=>({...r,status:'empty' as const,successful_status:'empty' as const}));
  expect(pipelineHealth(empty,options).sources.every(s=>s.status==='empty')).toBe(true);
  const missing=pipelineHealth([],options);expect(missing.healthy).toBe(false);expect(missing.can_suggest_search_changes).toBe(false);expect(missing.sources[0].missing_days).toHaveLength(7);
  expect(pipelineHealth(healthy().slice(1),options).sources[0]).toMatchObject({status:'missing',successful_days:6});
  expect(pipelineHealth([], {...options,ga4Property:null}).sources[3].status).toBe('not_configured');
 });
 it('keeps prior success visible while surfacing failed and stalled retries',()=>{
  const rows=healthy();rows[0].status='failed';rows[0].quality={raw_provider_error:'not exposed'};
  let h=pipelineHealth(rows,options);expect(h.sources[0]).toMatchObject({status:'failed',successful_days:7});expect(h.can_suggest_search_changes).toBe(false);expect(JSON.stringify(h)).not.toContain('not exposed');
  rows[0].status='pending';h=pipelineHealth(rows,options);expect(h.sources[0].status).toBe('waiting');expect(h.healthy).toBe(false);
  rows[0].created_at=new Date(now-31*60000).toISOString();expect(pipelineHealth(rows,options).sources[0].status).toBe('stalled');
 });
 it('rejects stale or limited facts as decision-ready and flags duplicate coverage',()=>{
  for(const quality of [{limited:true},{subject_to_thresholding:true},{data_loss_from_other_row:true}]){
   const rows=healthy();rows[7].successful_quality=quality;expect(pipelineHealth(rows,options).sources[1].status).toBe('limited');expect(pipelineHealth(rows,options).can_suggest_search_changes).toBe(false);
  }
  const stale=healthy();stale[0].successful_at=new Date(now-49*3600000).toISOString();expect(pipelineHealth(stale,options).sources[0].status).toBe('stale');
  const rows=healthy();expect(pipelineHealth([...rows,rows[0]],options).healthy).toBe(false);
 });
 it('calls only the service RPC with explicit fixture separation and validated property configuration',async()=>{
  vi.stubEnv('SEO_GA4_PROPERTY_ID','559730643');vi.stubEnv('SEO_GSC_PROPERTY','sc-domain:picmoko.com');vi.stubEnv('SEO_GA4_TIME_ZONE','Asia/Tokyo');
  try{const rpc=vi.fn(async()=>healthy()) as any;expect((await readPipelineHealth(rpc,true,now)).is_fixture).toBe(true);
   expect(rpc).toHaveBeenCalledWith('seo_ingestion_health',expect.objectContaining({p_fixture:true,p_gsc_property:'sc-domain:picmoko.com',p_ga4_property:'559730643',p_gsc_to:'2026-10-17',p_ga4_to:'2026-10-18'}));
  }finally{vi.unstubAllEnvs();}
 });
});
