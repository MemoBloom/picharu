import {describe,it,expect} from 'vitest';
import {buildAnalyticsReport} from '../apps/web/src/server/analytics/engine';
import type {AnalyticsDataset,AnalyticsEvent,AnalyticsJob,AnalyticsUser} from '../apps/web/src/server/analytics/types';

const at=(date:string)=>`${date}T00:00:00.000Z`;
function user(id:string,patch:Partial<AnalyticsUser>={}):AnalyticsUser{return {id,created_at:at('2026-01-01'),environment:'test',internal:false,email_masked:`${id[0]}***@example.com`,account_status:'active',available:30,reserved:0,first_completed_at:null,first_paid_at:null,lifetime_jobs:0,history_complete:true,payment_history_complete:true,...patch};}
function job(id:string,owner_id:string,patch:Partial<AnalyticsJob>={}):AnalyticsJob{return {id,owner_id,tool_id:'clean',status:'completed',stage:'completed',created_at:'2026-01-01T11:00:00.000Z',completed_at:'2026-01-01T12:00:00.000Z',parent_job_id:null,result_image_id:`image-${id}`,error_code:null,credits_reserved:3,environment:'test',internal:false,device:'desktop',provider:'provider',model_id:'model-1',adapter_version:'adapter-v1',prompt_id:'clean-v1',prompt_version:1,tool_version:1,...patch};}
function event(id:string,name:string,patch:Partial<AnalyticsEvent>={}):AnalyticsEvent{return {event_id:id,name,owner_id:'u1',job_id:'j1',image_id:null,tool_id:'clean',page_view_id:'page-1',exposure_id:null,action_id:null,source:'browser',device:'desktop',rating:null,occurred_at:'2026-01-01T12:10:00.000Z',received_at:'2026-01-01T12:10:00.000Z',environment:'test',internal:false,...patch};}
function fixture():AnalyticsDataset{
  const j1=job('j1','u1'),j2=job('j2','u1',{tool_id:'style',prompt_id:'style-v2',prompt_version:2}),j3=job('j3','u2',{status:'failed',stage:'failed',completed_at:null,error_code:'PROVIDER_ERROR'}),j4=job('j4','u2',{status:'queued',stage:'queued',completed_at:null}),j5=job('j5','u2',{tool_id:'style',status:'cancelled',stage:'cancelled',completed_at:null});
  return {as_of:'2026-02-15T00:00:00.000Z',query:{start:at('2026-01-01'),end:at('2026-01-02'),timezone:'UTC',bucket:'day',environment:'test',internal:'exclude',cohort:'all'},permissions:['analytics:read','finance:read'],
    users:[user('u1',{first_completed_at:j1.completed_at,first_paid_at:'2026-01-01T15:00:00.000Z',lifetime_jobs:4}),user('u2',{created_at:at('2025-12-01'),first_completed_at:at('2025-12-05'),lifetime_jobs:3}),user('u3')],
    jobs:[j1,j2,j3,j4,j5,job('follow1','u1',{created_at:'2026-01-02T10:00:00.000Z',completed_at:'2026-01-02T11:00:00.000Z',parent_job_id:'j1'}),job('follow7','u1',{created_at:'2026-01-08T10:00:00.000Z',completed_at:'2026-01-08T11:00:00.000Z'})],
    images:[{id:'upload1',owner_id:'u1',source_job_id:null,source_kind:'upload',environment:'test',internal:false,status:'ready',created_at:'2026-01-01T09:00:00.000Z',upload_completed_at:'2026-01-01T10:00:00.000Z',expires_at:at('2026-01-09'),deleted_at:null},...[j1,j2].map(j=>({id:j.result_image_id!,owner_id:j.owner_id,source_job_id:j.id,source_kind:'generated',status:'ready',created_at:j.completed_at!,upload_completed_at:null,expires_at:at('2026-01-09'),deleted_at:null}))],
    ledger:[{id:'c1',owner_id:'u1',kind:'consume',available_delta:0,reserved_delta:-3,reference_id:'j1',created_at:'2026-01-01T12:00:00.000Z',environment:'test',internal:false},{id:'c2',owner_id:'u1',kind:'consume',available_delta:0,reserved_delta:-2,reference_id:'j2',created_at:'2026-01-01T12:00:00.000Z',environment:'test',internal:false},{id:'r1',owner_id:'u1',kind:'reserve',available_delta:-3,reserved_delta:3,reference_id:'j1',created_at:'2026-01-01T11:00:00.000Z',environment:'test',internal:false}],
    orders:[{id:'o1',owner_id:'u1',created_at:'2026-01-01T14:00:00.000Z',paid_at:'2026-01-01T15:00:00.000Z',amount_minor:500,currency:'JPY',refunded_minor:500,status:'refunded',reversal_shortfall:0,environment:'test',internal:false},{id:'o2',owner_id:'u1',created_at:at('2026-01-20'),paid_at:at('2026-01-20'),amount_minor:500,currency:'JPY',refunded_minor:0,status:'paid',reversal_shortfall:0,environment:'test',internal:false}],
    refunds:[{id:'refund1',order_id:'o1',owner_id:'u1',occurred_at:at('2026-02-01'),amount_minor:500,currency:'JPY',status:'succeeded',environment:'test',internal:false}],
    attempts:[{id:'a1',job_id:'j1',created_at:j1.created_at,submitted_at:j1.created_at,state:'completed',provider:'provider',model_id:'model-1',adapter_version:'adapter-v1',actual_cost:{amount_minor:100,currency:'JPY',evidence:'provider_report'},estimated_cost:null},{id:'a2',job_id:'j2',created_at:j2.created_at,submitted_at:j2.created_at,state:'completed',provider:'provider',model_id:'model-1',adapter_version:'adapter-v1',actual_cost:{amount_minor:200,currency:'HKD',evidence:'invoice'},estimated_cost:null},{id:'a3',job_id:'j3',created_at:j3.created_at,submitted_at:j3.created_at,state:'unknown',provider:'provider',model_id:'model-1',adapter_version:'adapter-v1',actual_cost:null,estimated_cost:{amount_minor:50,currency:'JPY'}},{id:'a4',job_id:'j4',created_at:j4.created_at,submitted_at:j4.created_at,state:'submitted',provider:'provider',model_id:'model-1',adapter_version:'adapter-v1',actual_cost:{amount_minor:25,currency:'JPY',evidence:'estimate'},estimated_cost:null}],
    events:[event('ex1','tool_exposed',{job_id:null,page_view_id:'page1',exposure_id:'exposure1',occurred_at:'2026-01-01T10:00:00.000Z',received_at:'2026-01-01T10:00:00.000Z'}),event('ex2','tool_exposed',{job_id:null,page_view_id:'page1',exposure_id:'exposure2',tool_id:'style',occurred_at:'2026-01-01T10:00:00.000Z',received_at:'2026-01-01T10:00:00.000Z'}),event('select1','tool_selected',{job_id:null,page_view_id:'page1',exposure_id:'exposure1',occurred_at:'2026-01-01T10:01:00.000Z',received_at:'2026-01-01T10:01:00.000Z'}),event('view1','result_viewed'),event('save1','download_url_issued',{source:'server_download',page_view_id:null,image_id:'image-j1',action_id:'download1',occurred_at:'2026-01-01T12:20:00.000Z',received_at:'2026-01-01T12:20:00.000Z'}),event('feedback1','feedback_submitted',{rating:'negative',occurred_at:'2026-01-01T12:30:00.000Z',received_at:'2026-01-01T12:30:00.000Z'}),event('feedback2','feedback_submitted',{rating:'positive',occurred_at:'2026-01-02T12:30:00.000Z',received_at:'2026-01-02T12:30:00.000Z'})],
    periods:[{environment:'test',started_at:at('2025-12-01'),ended_at:null}],actions:[],catalog:[{tool_id:'clean',name:'Clean',category:'photo',available:true},{tool_id:'style',name:'Style',category:'creative',available:true},{tool_id:'future_tool',name:'Future',category:'creative',available:false}],quality:{history_complete:true,payment_history_complete:true,refund_coverage_start:at('2025-12-01'),finance_gaps:0,cleanup_pending:0,cleanup_retrying:0,collection_enabled:true,unresolved_downloads:0,source_limit:20000}};
}
const m=(r:ReturnType<typeof buildAnalyticsReport>,id:string)=>r.metrics.find(v=>v.id===id)!;

describe('admin analytics engine: product facts and the complete metric dictionary',()=>{
  it('calculates all 24 metrics, true grouped M05/M08/M09, zero users and uncoupled time axes',()=>{
    const report=buildAnalyticsReport(fixture());
    expect(report.metrics.map(x=>x.id)).toEqual(Array.from({length:24},(_,i)=>`M${String(i+1).padStart(2,'0')}`));
    expect(m(report,'M01').value).toBe(2);expect(m(report,'M02').value).toBe(2);expect(m(report,'M03').value).toBe(5);
    expect(m(report,'M04').value).toBe(2.5);expect(m(report,'M04').auxiliary.p50).toBe(2.5);
    expect(m(report,'M06').value).toBe(5);expect(m(report,'M07').value).toBeCloseTo(2/3);
    expect(m(report,'M10').value).toBe(.5);expect(m(report,'M11').value).toBe(.5);expect(m(report,'M12').value).toBe(.5);
    expect(m(report,'M13').value).toBe(1);expect(m(report,'M14').value).toBe(1);expect(m(report,'M15').value).toBe(.5);
    expect(m(report,'M16').value).toBe(1);expect(m(report,'M16').auxiliary.d1_value).toBe(1);expect(m(report,'M17').value).toBe(1);
    expect(m(report,'M18').value).toBe(.5);expect(m(report,'M19').value).toBe(3600000);expect(m(report,'M20').value).toBe(.5);expect(m(report,'M22').value).toBe(1);expect(m(report,'M24').value).toBe(1);
    const u1=report.users.find(u=>u.user_id==='u1')!,u3=report.users.find(u=>u.user_id==='u3')!;
    expect(u1).toMatchObject({jobs:2,completed:2,failed:0,tools:2,credits:5,saved_jobs:1,lifetime_jobs:4});
    expect(u3.jobs).toBe(0);expect(report.distribution).toContainEqual({bucket:'0',users:1});
    const clean=report.tools.find(t=>t.tool_id==='clean')!,style=report.tools.find(t=>t.tool_id==='style')!;
    expect(clean.task_share.value).toBe(.6);expect(style.task_share.value).toBe(.4);expect(clean.user_reach.value).toBe(1);expect(style.user_reach.value).toBe(1);
    expect(report.tools.find(t=>t.tool_id==='future_tool')).toMatchObject({jobs:0,available:false});
    expect(report.versions).toHaveLength(3);expect(report.trend[0].jobs).toBe(5);expect(report.heatmap.reduce((n,r)=>n+r.jobs,0)).toBe(5);
    expect(report.operations.status_counts).toEqual({queued:1,processing:0,completed:2,failed:1,cancelled:1});
    expect(report.retention[0]).toMatchObject({cohort:'2026-01-01',users:1});
    expect(report.funnel.user_steps.map(s=>s.users)).toEqual([2,1,1,1,1,1,1]);
    expect(report.funnel.job_steps.map(s=>s.users)).toEqual([2,1,1,1]);
  });
  it('deduplicates replayed jobs, events, actions, orders, attempts, ledger and exposures',()=>{
    const data=fixture(),original=buildAnalyticsReport(data);
    data.jobs.push(...data.jobs);data.events.push(...data.events,event('ex1-replayed','tool_exposed',{job_id:null,page_view_id:'page1',exposure_id:'exposure1',occurred_at:'2026-01-01T10:00:00.000Z',received_at:'2026-01-01T10:00:00.000Z'}));
    data.orders.push(...data.orders);data.ledger.push(...data.ledger);data.attempts.push(...data.attempts);
    data.actions.push({owner_id:'u1',action_id:'download1',image_id:'image-j1',job_id:'j1',created_at:'2026-01-01T12:19:00.000Z',issued_at:'2026-01-01T12:20:00.000Z',state:'issued',environment:'test'});
    data.actions.push({...data.actions[0]});
    expect(buildAnalyticsReport(data).metrics).toEqual(original.metrics);
  });
  it('returns ratios with numerators and denominators and no-sample instead of 0%',()=>{
    const data=fixture();data.jobs=[];data.events=[];data.ledger=[];data.attempts=[];
    const r=buildAnalyticsReport(data);
    for(const id of ['M04','M07','M11','M12','M13','M18','M19','M20','M24'])expect(m(r,id)).toMatchObject({value:null,status:'no_sample'});
    expect(r.distribution).toContainEqual({bucket:'0',users:3});
  });
  it('compares the previous equal-duration period using its own cohort and time facts',()=>{
    const data=fixture();data.jobs.push(job('previous','u2',{created_at:'2025-12-31T12:00:00.000Z',completed_at:'2025-12-31T13:00:00.000Z'}));
    const r=buildAnalyticsReport(data);expect(r.meta.previous_window).toEqual({start:at('2025-12-31'),end:at('2026-01-01')});
    expect(r.previous_metrics.find(x=>x.id==='M03')!.value).toBe(1);expect(m(r,'M03').value).toBe(5);
  });
  it('keeps creation usage and completion save cohorts on their distinct axes',()=>{
    const data=fixture();data.jobs[0].created_at='2025-12-31T23:00:00.000Z';
    const r=buildAnalyticsReport(data);expect(m(r,'M03').value).toBe(4);expect(m(r,'M12')).toMatchObject({numerator:1,denominator:2,value:.5});
  });
  it('calculates each version trend from complete version groups rather than a paginated jobs table',()=>{
    const data=fixture(),r=buildAnalyticsReport(data),clean=r.versions.find(v=>v.tool_id==='clean')!;
    expect(r.version_trends).toHaveLength(r.versions.length);
    const trend=r.version_trends.find(v=>v.key===clean.key)!.trend;
    expect(trend[0]).toMatchObject({bucket:'2026-01-01',jobs:3,users:2,completed:1,failed:1,in_flight:1,latency_p50_ms:3600000});
    expect(trend[0].success).toMatchObject({value:.5,numerator:1,denominator:2});expect(trend[0].save_rate).toMatchObject({value:1,numerator:1,denominator:1});
    for(const version of r.versions)expect(r.version_trends.find(t=>t.key===version.key)!.trend.reduce((total,t)=>total+t.jobs,0)).toBe(version.jobs);
    r.versions.splice(0,2);r.jobs.splice(0,4);expect(r.version_trends).toHaveLength(3);expect(trend[0].jobs).toBe(3);
  });
  it('preserves shared hour/timezone buckets and distinct creation/completion axes in sparse version trends',()=>{
    const data=fixture();data.query.bucket='hour';const r=buildAnalyticsReport(data),key=r.versions.find(v=>v.tool_id==='clean')!.key,trend=r.version_trends.find(v=>v.key===key)!.trend;
    expect(trend.map(t=>t.bucket)).toEqual(['2026-01-01T11:00+00:00','2026-01-01T12:00+00:00']);
    expect(trend[0].jobs).toBe(3);expect(trend[1]).toMatchObject({jobs:0,saved_jobs:1});expect(trend[1].save_rate.value).toBe(1);
    expect(trend.every(t=>r.trend.some(global=>global.bucket===t.bucket))).toBe(true);
  });
  it('keeps delayed consumption in its own version bucket even when that version has no job creation or completion in T',()=>{
    const data=fixture();data.query.bucket='hour';data.jobs.push(job('historical-version','u2',{created_at:'2025-12-15T10:00:00.000Z',completed_at:'2025-12-15T11:00:00.000Z',model_id:'historical-model',prompt_version:7}));
    data.ledger.push({id:'delayed-consume',owner_id:'u2',kind:'consume',available_delta:0,reserved_delta:-4,reference_id:'historical-version',created_at:'2026-01-01T20:30:00.000Z',environment:'test',internal:false});
    const r=buildAnalyticsReport(data),version=r.versions.find(v=>v.model_id==='historical-model')!;
    expect(version).toMatchObject({jobs:0,users:0});
    const points=r.version_trends.find(v=>v.key===version.key)!.trend;expect(points).toHaveLength(1);expect(points[0]).toMatchObject({bucket:'2026-01-01T20:00+00:00',credits:4,jobs:0,completed:0});
    expect(r.trend.find(t=>t.bucket===points[0].bucket)!.credits).toBe(4);
    expect(r.version_trends.flatMap(v=>v.trend).reduce((total,t)=>total+t.credits,0)).toBe(m(r,'M06').value);
  });
  it('uses only actual matching release facts before as_of, including explicit pre-window baselines',()=>{
    const data=fixture(),key=JSON.stringify(['clean','model-1','adapter-v1','clean-v1',1,1]);
    expect(buildAnalyticsReport(data).version_releases).toEqual([]);
    data.version_releases=[{key,released_at:'2025-12-31T00:00:00.000Z',scope:'all_users'},{key,released_at:'2026-01-01T01:00:00.000Z',scope:'limited_rollout'},{key,released_at:'2026-03-01T00:00:00.000Z',scope:'all_users'},{key:'not-a-selected-version',released_at:at('2026-01-01'),scope:'all_users'},{key,released_at:'2026-01-01T02:00:00.000Z',scope:'internal_only'}];
    const r=buildAnalyticsReport(data);expect(r.version_releases).toEqual(data.version_releases.slice(0,2));expect(r.version_releases.every(release=>release.released_at!==r.versions.find(v=>v.key===key)!.first_seen_at)).toBe(true);
    data.query.internal='include';expect(buildAnalyticsReport(data).version_releases.some(v=>v.scope==='internal_only')).toBe(true);
  });
  it('keeps financial attribution out of version trends and explicitly rejects an oversized projection',()=>{
    const data=fixture();data.permissions=['analytics:read'];const r=buildAnalyticsReport(data);expect(r.version_trends.every(v=>v.trend.every(t=>t.new_users===null&&t.currencies.length===0))).toBe(true);
    data.jobs=Array.from({length:2001},(_,i)=>job(`version-${i}`,'u1',{model_id:`model-${i}`,status:'queued',completed_at:null}));data.images=[];data.events=[];data.actions=[];data.attempts=[];data.ledger=[];
    expect(()=>buildAnalyticsReport(data)).toThrowError(expect.objectContaining({code:'QUERY_TOO_LARGE',status:400}));
  });
});

describe('mature observation, coverage, events and explicit save behavior',()=>{
  it.each([{environment:'live' as const,internal:false},{environment:'test' as const,internal:true}])('does not cross confirmed upload environment/internal provenance into the registration funnel',patch=>{
    const data=fixture();Object.assign(data.images[0],patch);const r=buildAnalyticsReport(data);
    expect(r.funnel.user_steps.find(s=>s.key==='uploaded')).toMatchObject({status:'ready',users:0,conversion:0});
    expect(m(r,'M03').value).toBe(5);expect(m(r,'M15').value).toBe(.5);
  });
  it('marks unclassified upload provenance as incomplete instead of manufacturing no-upload behavior',()=>{
    const data=fixture();data.images[0].environment='unclassified';const r=buildAnalyticsReport(data);
    expect(r.funnel.user_steps[0]).toMatchObject({status:'ready',users:2});
    for(const step of r.funnel.user_steps.slice(1))expect(step).toMatchObject({status:'incomplete',conversion:null});
    expect(r.funnel.user_steps[1].users).toBe(0);expect(m(r,'M03')).toMatchObject({status:'ready',value:5});expect(m(r,'M15')).toMatchObject({status:'ready',value:.5});
  });
  it('does not guess a historical ready upload completion timestamp or missing legacy provenance',()=>{
    const data=fixture();data.images[0].environment='unclassified';data.images[0].upload_completed_at=null;
    expect(buildAnalyticsReport(data).funnel.user_steps[1]).toMatchObject({status:'incomplete',users:0,conversion:null});
    delete data.images[0].environment;delete data.images[0].internal;
    expect(buildAnalyticsReport(data).funnel.user_steps[1]).toMatchObject({status:'incomplete',users:0,conversion:null});
  });
  it('does not erase a confirmed registration chain because of an additional unknown upload',()=>{
    const data=fixture();data.images.push({...data.images[0],id:'legacy-extra',environment:'unclassified',upload_completed_at:null});
    const r=buildAnalyticsReport(data);expect(r.funnel.user_steps.map(s=>s.users)).toEqual([2,1,1,1,1,1,1]);expect(r.funnel.user_steps.every(s=>s.status==='ready')).toBe(true);
  });
  it('does not replace the successful cohort denominator with viewed or saved users',()=>{
    const data=fixture();data.events=data.events.filter(e=>e.name!=='result_viewed');
    const r=buildAnalyticsReport(data);expect(m(r,'M12')).toMatchObject({value:.5,numerator:1,denominator:2});expect(m(r,'M13')).toMatchObject({value:null,denominator:0,status:'no_sample'});
  });
  it('does not count clicks, preview URLs, invalid owner or unsuccessful jobs as saves',()=>{
    const data=fixture();data.events=data.events.filter(e=>e.name!=='download_url_issued');
    data.events.push(event('click','download_clicked'),event('wrong-owner','download_url_issued',{owner_id:'u2',source:'server_download',action_id:'invalid'}),event('failed','download_url_issued',{job_id:'j3',owner_id:'u2',source:'server_download',action_id:'failed'}));
    const r=buildAnalyticsReport(data);expect(m(r,'M12').value).toBe(0);expect(m(r,'M14').value).toBe(0);
  });
  it('reports no collection and a gap inside a window instead of historic zero',()=>{
    const data=fixture();data.periods=[];expect(m(buildAnalyticsReport(data),'M12')).toMatchObject({value:null,status:'not_collected'});
    data.periods=[{environment:'test',started_at:at('2025-12-01'),ended_at:'2026-01-01T14:00:00.000Z'},{environment:'test',started_at:'2026-01-01T15:00:00.000Z',ended_at:null}];
    const r=buildAnalyticsReport(data);expect(m(r,'M12')).toMatchObject({value:null,status:'incomplete',denominator:2});expect(r.operations.issues.some(x=>x.code==='COVERAGE_GAP')).toBe(true);
  });
  it('distinguishes immature 24h, D7, W1, 7d feedback and 30d repurchase',()=>{
    const data=fixture();data.as_of='2026-01-01T18:00:00.000Z';let r=buildAnalyticsReport(data);
    for(const id of ['M11','M12','M13','M15','M16','M17','M18','M22','M24'])expect(m(r,id).status).toBe('immature');
    expect(r.funnel.job_steps.find(s=>s.key==='completed')).toMatchObject({status:'immature',conversion:null});
    data.as_of=at('2026-01-09');r=buildAnalyticsReport(data);expect(m(r,'M16').status).toBe('ready');expect(m(r,'M17').status).toBe('immature');expect(m(r,'M24').status).toBe('ready');expect(m(r,'M22').status).toBe('immature');
    data.as_of=at('2026-01-15');expect(m(buildAnalyticsReport(data),'M17').status).toBe('ready');
  });
  it('retains early-expired assets and pending-signature gaps in the denominator',()=>{
    const data=fixture();data.images.find(i=>i.id==='image-j2')!.expires_at='2026-01-01T13:00:00.000Z';
    let r=buildAnalyticsReport(data);expect(m(r,'M12')).toMatchObject({value:null,status:'incomplete',denominator:2});expect(m(r,'M12').auxiliary.asset_loss_jobs).toBe(1);
    data.images.find(i=>i.id==='image-j2')!.expires_at=at('2026-01-09');
    data.actions.push({owner_id:'u1',action_id:'pending',image_id:'image-j2',job_id:'j2',created_at:'2026-01-01T13:00:00.000Z',issued_at:null,state:'pending',environment:'test'});
    r=buildAnalyticsReport(data);expect(m(r,'M12')).toMatchObject({value:null,status:'incomplete',denominator:2});
    data.actions[0].state='failed';expect(m(buildAnalyticsReport(data),'M12').status).toBe('ready');
  });
  it('uses server receipt clocks for browser events and exposes uncertain funnel ordering',()=>{
    const data=fixture();const view=data.events.find(e=>e.name==='result_viewed')!;view.occurred_at='2025-12-31T00:00:00.000Z';
    const r=buildAnalyticsReport(data);expect(m(r,'M11').value).toBe(.5);expect(m(r,'M13')).toMatchObject({value:null,status:'incomplete'});expect(r.operations.uncertain_client_events).toBe(1);
    view.received_at='2026-01-03T00:00:00.000Z';expect(m(buildAnalyticsReport(data),'M11').value).toBe(0);
  });
  it('uses last explicit rating within seven days and reports rating coverage',()=>{
    const data=fixture();data.events.push(event('late-feedback','feedback_submitted',{rating:'negative',occurred_at:at('2026-01-10'),received_at:at('2026-01-10')}));
    const r=buildAnalyticsReport(data);expect(m(r,'M24')).toMatchObject({value:1,numerator:1,denominator:1});expect(m(r,'M24').auxiliary.feedback_coverage).toBe(.5);
  });
  it('does not infer historic first success or repeat purchases with truncated history',()=>{
    const data=fixture();data.users[0].history_complete=false;data.users[0].payment_history_complete=false;
    const r=buildAnalyticsReport(data);for(const id of ['M15','M16','M17','M22'])expect(m(r,id)).toMatchObject({value:null,status:'incomplete'});
    expect(r.users.find(u=>u.user_id==='u1')!.lifetime_jobs).toBeNull();
  });
  it('propagates an unconfirmed signing outcome into M13 and saved funnel stages, but not the known request',()=>{
    const data=fixture();data.events=data.events.filter(e=>e.name!=='download_url_issued');
    data.actions.push({owner_id:'u1',action_id:'uncertain',image_id:'image-j1',job_id:'j1',created_at:'2026-01-01T13:00:00.000Z',issued_at:null,state:'pending',environment:'test'});
    const r=buildAnalyticsReport(data);expect(m(r,'M13')).toMatchObject({status:'incomplete',value:null,numerator:0,denominator:1});
    expect(r.funnel.job_steps.find(s=>s.key==='download_requested')).toMatchObject({status:'ready',users:1,conversion:1});
    expect(r.funnel.job_steps.find(s=>s.key==='saved')).toMatchObject({status:'incomplete',conversion:null});
    expect(r.funnel.user_steps.find(s=>s.key==='download_requested')).toMatchObject({status:'ready',users:1});
    expect(r.funnel.user_steps.find(s=>s.key==='saved')).toMatchObject({status:'incomplete',conversion:null});
  });
  it('preserves a confirmed saved task and user despite unrelated repeated pending actions',()=>{
    const data=fixture();data.actions.push({owner_id:'u1',action_id:'pending-repeat',image_id:'image-j1',job_id:'j1',created_at:'2026-01-01T13:00:00.000Z',issued_at:null,state:'pending',environment:'test'});
    const r=buildAnalyticsReport(data);expect(m(r,'M12')).toMatchObject({status:'ready',value:.5});expect(m(r,'M13')).toMatchObject({status:'ready',value:1});expect(m(r,'M14')).toMatchObject({status:'ready',value:1});
    expect(r.funnel.job_steps.find(s=>s.key==='saved')).toMatchObject({status:'ready',users:1});expect(r.funnel.user_steps.find(s=>s.key==='saved')).toMatchObject({status:'ready',users:1});
  });
});

describe('money, dimensions, permissions and calendar boundaries',()=>{
  it('keeps period task statuses separate from currently queued tasks created outside the window',()=>{
    const data=fixture();data.jobs.push(job('old-queued','u2',{created_at:'2025-12-15T00:00:00.000Z',status:'queued',stage:'queued',completed_at:null}),job('recent-queued','u2',{created_at:'2026-02-10T00:00:00.000Z',status:'queued',stage:'queued',completed_at:null}));
    const r=buildAnalyticsReport(data);expect(m(r,'M03').value).toBe(5);expect(r.operations.status_counts.queued).toBe(1);
    expect(r.operations.oldest_queued_ms).toBe(Date.parse(data.as_of)-Date.parse('2025-12-15T00:00:00.000Z'));expect(r.operations.issues.find(i=>i.code==='CURRENT_QUEUED')?.count).toBe(3);
    data.query.tool_id='style';expect(buildAnalyticsReport(data).operations.oldest_queued_ms).toBeNull();
    data.query.tool_id=undefined;data.query.cohort='new';expect(buildAnalyticsReport(data).operations.oldest_queued_ms).toBeNull();
  });
  it('includes current queued owners who registered after a historical period without altering period users',()=>{
    const data=fixture();data.users.push(user('new-current',{created_at:'2026-02-01T00:00:00.000Z'}));data.jobs=data.jobs.filter(j=>j.status!=='queued');data.jobs.push(job('new-queued','new-current',{created_at:'2026-02-10T00:00:00.000Z',status:'queued',stage:'queued',completed_at:null}));
    let r=buildAnalyticsReport(data);expect(r.operations.status_counts.queued).toBe(0);expect(r.operations.oldest_queued_ms).toBe(Date.parse(data.as_of)-Date.parse('2026-02-10T00:00:00.000Z'));expect(r.users.some(u=>u.user_id==='new-current')).toBe(false);
    data.query.cohort='returning';r=buildAnalyticsReport(data);expect(r.operations.oldest_queued_ms).toBeNull();
  });
  it('uses independent refund coverage intervals including disable/re-enable gaps and finance gaps',()=>{
    const data=fixture();data.refund_periods=[{environment:'test',started_at:at('2025-12-01'),ended_at:'2026-01-01T10:00:00.000Z'},{environment:'test',started_at:'2026-01-01T11:00:00.000Z',ended_at:null}];
    let r=buildAnalyticsReport(data);expect(m(r,'M21').status).toBe('incomplete');expect(r.finance.currencies.find(c=>c.currency==='JPY')!.refunded_minor).toBeNull();
    data.refund_periods=[{environment:'test',started_at:at('2025-12-01'),ended_at:null}];data.quality.finance_gaps=1;
    r=buildAnalyticsReport(data);expect(m(r,'M21').status).toBe('incomplete');expect(r.finance.currencies.find(c=>c.currency==='JPY')!.net_minor).toBeNull();
    expect(r.operations.issues.some(i=>i.code==='FINANCE_GAP'&&i.severity==='critical')).toBe(true);
  });
  it('separates real global budget reservations from the selected-window unknown cost estimates',()=>{
    const data=fixture();data.budgets=[{provider:'provider',model_id:'model-1',adapter_version:'adapter-v1',currency:'JPY',reserved_minor:800,committed_minor:1200,limit_minor:5000,enabled:true}];
    let r=buildAnalyticsReport(data);expect(r.finance.budgets[0]).toMatchObject({reserved_minor:800,committed_minor:1200,scope:'global_current'});expect(r.finance.currencies.find(c=>c.currency==='JPY')!.estimated_pending_minor).toBe(75);
    data.permissions=['analytics:read'];r=buildAnalyticsReport(data);expect(r.finance.budgets).toEqual([]);expect(r.finance.costs).toEqual([]);
  });
  it('uses attempt creation time for costs and returns sanitized detail facts and all ledger kinds',()=>{
    const data=fixture();data.attempts[0].submitted_at=at('2026-01-02');
    const r=buildAnalyticsReport(data);expect(r.finance.costs).toHaveLength(4);expect(r.finance.costs[0]).toMatchObject({attempt_id:'a1',job_id:'j1',user_id:'u1',amount_minor:100,evidence:'provider_report'});
    expect(r.finance.currencies.find(c=>c.currency==='JPY')!.known_cost_minor).toBe(100);expect(r.finance.ledger.map(l=>l.kind)).toContain('reserve');
    expect(JSON.stringify(r)).not.toContain('provider_request_key');
  });
  it('does not drop frozen old facts when an account is subsequently retagged',()=>{
    const data=fixture();data.users[0].environment='live';data.users[0].internal=true;
    const r=buildAnalyticsReport(data);expect(m(r,'M03').value).toBe(5);expect(r.users.find(u=>u.user_id==='u1')!.jobs).toBe(2);
  });
  it('uses authoritative all-history last generation and rolling 30-day counts',()=>{
    const data=fixture();data.users[0].last_generated_at='2026-02-14T10:00:00.000Z';data.users[0].last_30d_jobs=8;
    expect(buildAnalyticsReport(data).users.find(u=>u.user_id==='u1')).toMatchObject({last_generated_at:'2026-02-14T10:00:00.000Z',last_30d_jobs:8,lifetime_jobs:4,jobs:2});
  });
  it('does not turn unknown collection or pending download facts into zero-height save bars',()=>{
    const data=fixture();data.periods=[];let r=buildAnalyticsReport(data);expect(r.trend[0]).toMatchObject({saved_users:null,saved_jobs:null,save_status:'not_collected'});
    data.periods=[{environment:'test',started_at:at('2025-12-01'),ended_at:null}];data.events=data.events.filter(e=>e.name!=='download_url_issued');data.actions.push({owner_id:'u1',action_id:'pending',image_id:'image-j2',job_id:'j2',created_at:'2026-01-01T13:00:00.000Z',issued_at:null,state:'pending',environment:'test'});
    r=buildAnalyticsReport(data);expect(m(r,'M14')).toMatchObject({value:null,status:'incomplete'});expect(r.trend[0].save_status).toBe('incomplete');expect(r.trend[0].saved_users).toBeNull();
  });
  it('counts one saved job across multiple output assets and preserves a full-window usable result',()=>{
    const data=fixture();data.images.push({...data.images[1],id:'another-output',expires_at:'2026-01-01T13:00:00.000Z'});
    data.events.push(event('save-other-output','download_url_issued',{source:'server_download',page_view_id:null,image_id:'another-output',action_id:'download2',occurred_at:'2026-01-01T12:21:00.000Z',received_at:'2026-01-01T12:21:00.000Z'}));
    const r=buildAnalyticsReport(data);expect(m(r,'M12')).toMatchObject({value:.5,numerator:1,denominator:2});expect(m(r,'M14').value).toBe(1);
  });
  it('limits the heatmap to 20 leading users while retaining all user rows and sparse data',()=>{
    const data=fixture();for(let i=0;i<30;i++){data.users.push(user(`extra-${i}`));data.jobs.push(job(`extra-job-${i}`,`extra-${i}`));}
    const r=buildAnalyticsReport(data);expect(r.users).toHaveLength(33);expect(new Set(r.heatmap.map(x=>x.user_id)).size).toBe(20);expect(r.meta.warnings.some(w=>w.includes('20名'))).toBe(true);
  });
  it('computes global Top15 and the other bucket from all users, including zero-use accounts',()=>{
    const data=fixture();for(let i=0;i<30;i++){data.users.push(user(`rank-${String(i).padStart(2,'0')}`));data.jobs.push(job(`rank-job-${i}`,`rank-${String(i).padStart(2,'0')}`));}
    const r=buildAnalyticsReport(data),ranking=r.user_usage_ranking;
    expect(ranking.top).toHaveLength(15);expect(ranking.top[0]).toMatchObject({user_id:'u2',jobs:3});expect(ranking.top[1]).toMatchObject({user_id:'u1',jobs:2});
    expect(ranking.top.slice(2).map(u=>u.user_id)).toEqual(Array.from({length:13},(_,i)=>`rank-${String(i).padStart(2,'0')}`));
    expect(ranking.other_users).toBe(18);expect(ranking.other_jobs).toBe(17);
    expect(ranking.top.reduce((total,u)=>total+u.jobs,ranking.other_jobs)).toBe(m(r,'M03').value);
    expect(ranking.top.length+ranking.other_users).toBe(r.users.length);
    r.users.splice(0,25);expect(ranking.other_users).toBe(18);expect(ranking.top).toHaveLength(15);
  });
  it('handles a 10,000-fact snapshot without expanding per-user/per-day zero cells',()=>{
    const data=fixture();data.users=Array.from({length:5000},(_,i)=>user(`bulk-${i}`,{first_completed_at:null}));data.jobs=data.users.map((u,i)=>job(`bulk-job-${i}`,u.id,{status:'queued',completed_at:null}));
    data.images=[];data.events=[];data.orders=[];data.refunds=[];data.ledger=[];data.attempts=[];data.actions=[];
    data.query.end=at('2026-02-01');const r=buildAnalyticsReport(data);
    expect(m(r,'M03').value).toBe(5000);expect(r.users).toHaveLength(5000);expect(r.heatmap).toHaveLength(20);expect(r.trend).toHaveLength(31);
  });
  it('keeps paid facts after refund and groups known costs by currency and evidence',()=>{
    const r=buildAnalyticsReport(fixture()),yen=r.finance.currencies.find(c=>c.currency==='JPY')!,hkd=r.finance.currencies.find(c=>c.currency==='HKD')!;
    expect(yen).toMatchObject({paid_minor:500,refunded_minor:0,net_minor:500,provider_report_minor:100,invoice_minor:0,known_cost_minor:100,estimated_minor:75,estimated_pending_minor:75});
    expect(hkd).toMatchObject({known_cost_minor:200,invoice_minor:200,provider_report_minor:0});
    expect(r.finance.unknown_cost_attempts).toBe(2);expect(m(r,'M23').auxiliary.known_attempts).toBe(2);
    expect(m(r,'M20').value).toBe(.5);
    const data=fixture();data.query.start=at('2026-02-01');data.query.end=at('2026-02-02');
    expect(buildAnalyticsReport(data).finance.currencies.find(c=>c.currency==='JPY')).toMatchObject({paid_minor:0,refunded_minor:500,net_minor:-500});
  });
  it('makes incomplete refund coverage explicit without showing a fake net zero',()=>{
    const data=fixture();data.quality.refund_coverage_start=null;
    const yen=buildAnalyticsReport(data).finance.currencies.find(c=>c.currency==='JPY')!;
    expect(yen).toMatchObject({paid_minor:500,refunded_minor:null,net_minor:null,refund_status:'not_collected'});
  });
  it('never leaks currency amounts or order records without finance permission',()=>{
    const data=fixture();data.permissions=['analytics:read'];const r=buildAnalyticsReport(data);
    expect(r.finance).toMatchObject({status:'forbidden',currencies:[],orders:[],ledger:[]});
    expect(r.users.every(u=>u.currencies.length===0)).toBe(true);expect(r.trend.every(t=>t.currencies.length===0)).toBe(true);
    for(const id of ['M21','M22','M23'])expect(m(r,id).status).toBe('forbidden');
    expect(m(r,'M20').value).toBe(.5);
  });
  it('enforces environment/internal isolation even when synthetic sources contain mixed rows',()=>{
    const data=fixture();data.users.push(user('internal',{internal:true}),user('live',{environment:'live'}));data.jobs.push(job('internal-job','internal',{internal:true}),job('live-job','live',{environment:'live'}));
    const r=buildAnalyticsReport(data);expect(m(r,'M03').value).toBe(5);expect(r.users).toHaveLength(3);
    data.query.internal='only';expect(m(buildAnalyticsReport(data),'M03').value).toBe(1);
    data.query.internal='include';expect(m(buildAnalyticsReport(data),'M03').value).toBe(6);
  });
  it('applies job dimensions and explicitly refuses unsupported registration/financial filters',()=>{
    const data=fixture();data.query.tool_id='style';const r=buildAnalyticsReport(data);
    expect(m(r,'M03').value).toBe(2);expect(m(r,'M06').value).toBe(2);expect(r.jobs.every(j=>j.tool_id==='style')).toBe(true);
    for(const id of ['M01','M15','M21','M22'])expect(m(r,id).status).toBe('unsupported_filters');
    expect(r.trend[0].new_users).toBeNull();expect(r.finance.orders).toEqual([]);
    data.query.tool_id=undefined;data.query.prompt_version=2;
    expect(m(buildAnalyticsReport(data),'M10').status).toBe('unsupported_filters');
  });
  it('drills a user/tool with the same definitions and uses period-wide light/heavy cohorts',()=>{
    const data=fixture();let r=buildAnalyticsReport(data,{user_id:'u1',tool_id:'clean'});expect(m(r,'M03').value).toBe(1);expect(r.users).toHaveLength(1);expect(r.tools.map(t=>t.tool_id)).toEqual(['clean']);
    data.query.cohort='light';data.query.tool_id='style';r=buildAnalyticsReport(data);expect(r.users.map(u=>u.user_id).sort()).toEqual(['u1','u2']);expect(m(r,'M03').value).toBe(2);
    data.query.cohort='heavy';expect(m(buildAnalyticsReport(data),'M03').value).toBe(0);
  });
  it('groups UTC instants into requested Japanese calendar days and natural Mondays',()=>{
    const data=fixture();data.query.timezone='Asia/Tokyo';data.query.start='2025-12-31T15:00:00.000Z';data.query.end='2026-01-01T15:00:00.000Z';
    data.jobs[0].created_at='2025-12-31T16:00:00.000Z';const r=buildAnalyticsReport(data);expect(r.trend.map(t=>t.bucket)).toEqual(['2026-01-01']);expect(r.heatmap.every(x=>x.date==='2026-01-01')).toBe(true);
    data.query.bucket='week';expect(buildAnalyticsReport(data).trend.map(t=>t.bucket)).toEqual(['2025-12-29']);
  });
  it('uses local hour boundaries in half-hour zones and includes short trailing partial days',()=>{
    const data=fixture();data.query.timezone='Asia/Kathmandu';data.query.bucket='hour';data.query.start='2025-12-31T18:15:00.000Z';data.query.end='2025-12-31T20:15:00.000Z';
    data.jobs=[job('nepal1','u2',{created_at:'2025-12-31T19:05:00.000Z',completed_at:'2025-12-31T19:10:00.000Z'}),job('nepal2','u2',{created_at:'2025-12-31T19:20:00.000Z',completed_at:'2025-12-31T19:30:00.000Z'})];
    let r=buildAnalyticsReport(data);expect(r.trend.map(t=>[t.bucket,t.jobs])).toEqual([['2026-01-01T00:00+05:45',1],['2026-01-01T01:00+05:45',1]]);
    data.query.timezone='UTC';data.query.bucket='day';data.query.start='2026-01-01T23:30:00.000Z';data.query.end='2026-01-02T01:00:00.000Z';r=buildAnalyticsReport(data);expect(r.trend.map(t=>t.bucket)).toEqual(['2026-01-01','2026-01-02']);
  });
  it('waits for calendar-day retention maturity across daylight saving transitions',()=>{
    const data=fixture();data.query.timezone='America/New_York';data.query.start='2026-03-07T05:00:00.000Z';data.query.end='2026-03-08T05:00:00.000Z';data.as_of='2026-03-09T03:59:59.000Z';
    data.users=[user('u1',{created_at:at('2026-01-01'),first_completed_at:'2026-03-07T18:00:00.000Z'})];data.jobs=[job('first','u1',{created_at:'2026-03-07T17:00:00.000Z',completed_at:'2026-03-07T18:00:00.000Z'}),job('next','u1',{created_at:'2026-03-08T16:00:00.000Z',completed_at:'2026-03-08T17:00:00.000Z'})];
    let r=buildAnalyticsReport(data);expect(r.retention[0].d1.status).toBe('immature');
    data.as_of='2026-03-09T04:00:00.000Z';r=buildAnalyticsReport(data);expect(r.retention[0].d1).toMatchObject({status:'ready',value:1});
  });
  it('uses the same filtered first-success cohort for retention headcount and every retention metric',()=>{
    const data=fixture();data.users[1].first_completed_at='2026-01-01T12:00:00.000Z';data.jobs[2]=job('j3','u2',{tool_id:'style'});data.query.tool_id='clean';
    const r=buildAnalyticsReport(data);expect(r.retention).toHaveLength(1);expect(r.retention[0].users).toBe(1);
    for(const metric of [r.retention[0].d1,r.retention[0].d7,r.retention[0].w1]){expect(metric.auxiliary.cohort_users).toBe(r.retention[0].users);expect(metric.denominator).toBe(1);}
    expect(m(r,'M16').denominator).toBe(r.retention[0].d7.denominator);
  });
  it('does not add same-day first successes outside a custom partial-day retention window',()=>{
    const data=fixture();data.query.start='2026-01-01T10:00:00.000Z';data.query.end='2026-01-01T14:00:00.000Z';data.users[1].first_completed_at='2026-01-01T01:00:00.000Z';
    const r=buildAnalyticsReport(data);expect(r.retention[0].users).toBe(1);expect(r.retention[0].d7.auxiliary.cohort_users).toBe(1);expect(m(r,'M16').denominator).toBe(r.retention[0].d7.denominator);
  });
  it('compares first-success instants rather than timestamp string spelling under a tool filter',()=>{
    const data=fixture();data.query.tool_id='clean';data.users[0].first_completed_at='2026-01-01T12:00:00+00:00';
    const r=buildAnalyticsReport(data);expect(r.retention[0].users).toBe(1);expect(r.retention[0].d1).toMatchObject({value:1,denominator:1});
  });
});
