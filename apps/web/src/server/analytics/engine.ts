import {createHash} from 'node:crypto';
import {ApiError} from '../errors';
import type {
  AnalyticsDataset, AnalyticsEvent, AnalyticsJob, AnalyticsMetric, AnalyticsQuery,
  AnalyticsUser, MetricStatus,
} from './types';

// This module consumes the bounded, service-role-only snapshot. Its output contains
// no object keys, signed URLs, prompts, email addresses, or provider payloads.
const DAY = 86_400_000;
const VERSION = '1.0.0';
type Window = {start: number; end: number};
type Drill = {user_id?: string; tool_id?: string};
import type {AnalyticsReport, Money, UsageRow, ToolRow, VersionRow, TrendRow, FunnelStep} from './report-types';
export type {AnalyticsReport} from './report-types';

const ms = (value: string | null | undefined) => value ? Date.parse(value) : NaN;
const iso = (value: number) => new Date(value).toISOString();
const within = (value: string | null | undefined, w: Window) => ms(value) >= w.start && ms(value) < w.end;
const unique = <T>(rows: T[], key: (row: T) => string) => [...new Map(rows.map(row => [key(row), row])).values()];
const ids = <T>(rows: T[], key: (row: T) => string) => new Set(rows.map(key));
const group = <T>(rows:T[],key:(row:T)=>string) => {const result=new Map<string,T[]>();for(const row of rows){const k=key(row),items=result.get(k)||[];items.push(row);result.set(k,items);}return result;};
const sum = <T>(rows: T[], value: (row: T) => number) => rows.reduce((n, row) => n + value(row), 0);
const quantile = (values: number[], p: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a,b) => a-b), index = (sorted.length-1)*p;
  const low = Math.floor(index), high = Math.ceil(index);
  return sorted[low] + (sorted[high]-sorted[low])*(index-low);
};
const metric = (id: string, value: number | null, unit: AnalyticsMetric['unit'] = 'count',
  opts: Partial<Omit<AnalyticsMetric,'id'|'value'|'unit'>> = {}): AnalyticsMetric => ({
    id, value, unit, numerator: null, denominator: null, sample_size: value === null ? 0 : value,
    status: 'ready', reason: null, coverage_start: null, auxiliary: {}, ...opts,
  });
const ratio = (id: string, n: number, d: number, opts: Partial<AnalyticsMetric> = {}) =>
  metric(id, d ? n/d : null, 'ratio', {numerator:n,denominator:d,sample_size:d,
    status:d ? 'ready' : 'no_sample',reason:d ? null : '分母为零，无可比较样本。',...opts});
const unavailable = (id: string, status: MetricStatus, reason: string, unit: AnalyticsMetric['unit']='ratio') =>
  metric(id,null,unit,{status,reason});

// Calendar arithmetic is performed in the requested IANA zone. Adding 24 hours
// to a local midnight would be wrong on daylight-saving transition days.
const formatters = new Map<string, Intl.DateTimeFormat>();
function localParts(time: number, zone: string) {
  let f = formatters.get(zone);
  if (!f) { f = new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}); formatters.set(zone,f); }
  return Object.fromEntries(f.formatToParts(new Date(time)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
}
function dateKey(time: number, zone: string) { const p=localParts(time,zone);return `${p.year}-${p.month}-${p.day}`; }
function addDays(day: string, count: number) { return new Date(Date.parse(`${day}T00:00:00Z`)+count*DAY).toISOString().slice(0,10); }
function localMidnight(day: string, zone: string) {
  const wall=Date.parse(`${day}T00:00:00Z`); let guess=wall;
  for(let i=0;i<5;i++) {const p=localParts(guess,zone);const represented=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);const next=guess+wall-represented;if(next===guess)break;guess=next;}
  return guess;
}
function bucketKey(time: number, q: AnalyticsQuery) {
  const p=localParts(time,q.timezone), day=`${p.year}-${p.month}-${p.day}`;
  if(q.bucket==='day') return day;
  if(q.bucket==='week') {const weekday=new Date(`${day}T00:00:00Z`).getUTCDay();return addDays(day,-((weekday+6)%7));}
  const represented=Date.parse(`${day}T${p.hour}:${p.minute}:${p.second}Z`);
  const offset=Math.round((represented-Math.floor(time/1000)*1000)/60_000);
  const sign=offset<0?'-':'+';const a=Math.abs(offset);
  return `${day}T${p.hour}:00${sign}${String(Math.floor(a/60)).padStart(2,'0')}:${String(a%60).padStart(2,'0')}`;
}

/** Pure statistical calculation; authorization and the hard row bound precede this call. */
export function buildAnalyticsReport(input: AnalyticsDataset, drill: Drill = {}): AnalyticsReport {
  const data: AnalyticsDataset = {...input,
    users:unique(input.users,u=>u.id),jobs:unique(input.jobs,j=>j.id),images:unique(input.images,i=>i.id),
    ledger:unique(input.ledger,l=>l.id),orders:unique(input.orders,o=>o.id),refunds:unique(input.refunds,r=>r.id),
    attempts:unique(input.attempts,a=>a.id),events:unique(input.events,e=>e.event_id),
    actions:unique(input.actions,a=>`${a.owner_id}:${a.action_id}`),catalog:unique(input.catalog,t=>t.tool_id)};
  const q=data.query, asOf=ms(data.as_of), window={start:ms(q.start),end:ms(q.end)};
  if(!Number.isFinite(asOf)||!Number.isFinite(window.start)||!Number.isFinite(window.end)||window.start>=window.end) throw new Error('INVALID_ANALYTICS_WINDOW');
  // Invalid zones fail closed rather than silently producing UTC cohorts.
  dateKey(asOf,q.timezone);
  const previous={start:window.start-(window.end-window.start),end:window.start};
  const env = <T extends {environment: string;internal?:boolean}>(row:T) => row.environment===q.environment &&
    (q.internal==='include'||(q.internal==='only'?row.internal===true:row.internal!==true));
  const factOwners=new Set([...data.jobs.filter(env).map(j=>j.owner_id),...data.orders.filter(env).map(o=>o.owner_id),...data.ledger.filter(env).map(l=>l.owner_id)]);
  const users=data.users.filter(u=>(env(u)||factOwners.has(u.id))&&(!drill.user_id||u.id===drill.user_id));
  const userMap=new Map(users.map(u=>[u.id,u]));
  const allJobs=data.jobs.filter(j=>env(j)&&userMap.has(j.owner_id)&&ms(j.created_at)<=asOf);
  const jobMap=new Map(allJobs.map(j=>[j.id,j]));
  const allJobsByOwner=group(allJobs,j=>j.owner_id);
  const ordersByOwner=group(data.orders.filter(env),o=>o.owner_id);
  const refundsByOwner=group(data.refunds.filter(env),r=>r.owner_id);
  const attemptsByOwner=group(data.attempts.filter(a=>jobMap.has(a.job_id)),a=>jobMap.get(a.job_id)!.owner_id);
  const categories=new Map(data.catalog.map(t=>[t.tool_id,t.category]));
  const dimension = (j:AnalyticsJob) => (!q.tool_id||j.tool_id===q.tool_id)&&(!drill.tool_id||j.tool_id===drill.tool_id)&&
    (!q.category||categories.get(j.tool_id)===q.category)&&(!q.model_id||j.model_id===q.model_id)&&
    (!q.adapter_version||j.adapter_version===q.adapter_version)&&(!q.prompt_id||j.prompt_id===q.prompt_id)&&
    (q.prompt_version===undefined||j.prompt_version===q.prompt_version)&&(q.tool_version===undefined||j.tool_version===q.tool_version)&&(!q.device||j.device===q.device);
  const downstream=!!(q.tool_id||drill.tool_id||q.category||q.model_id||q.adapter_version||q.prompt_id||q.prompt_version!==undefined||q.tool_version!==undefined||q.device);
  const exposureUnsupported=!!(q.model_id||q.adapter_version||q.prompt_id||q.prompt_version!==undefined||q.tool_version!==undefined);
  const financeAllowed=data.permissions.includes('finance:read');
  const paymentHistoryKnown=(user:AnalyticsUser)=>user.payment_history_complete===true;
  const paymentHistoryComplete=data.quality.payment_history_complete===true;
  const knownPaid=(user:AnalyticsUser)=>!!user.first_paid_at&&ms(user.first_paid_at)<=asOf;
  const coverage = data.periods.filter(p=>p.environment===q.environment).map(p=>({start:ms(p.started_at),end:p.ended_at?Math.min(ms(p.ended_at),asOf):asOf})).sort((a,b)=>a.start-b.start);
  const coverageStart=coverage.length?iso(coverage[0].start):null;
  const refundPeriods=(data.refund_periods??(data.quality.refund_coverage_start?[{environment:q.environment,started_at:data.quality.refund_coverage_start,ended_at:null}]:[])).filter(p=>p.environment===q.environment).map(p=>({start:ms(p.started_at),end:p.ended_at?Math.min(ms(p.ended_at),asOf):asOf})).sort((a,b)=>a.start-b.start);
  function refundCovered(w:Window){let cursor=w.start;for(const p of refundPeriods){if(p.end<=cursor)continue;if(p.start>cursor)return false;cursor=Math.max(cursor,p.end);if(cursor>=Math.min(w.end,asOf))return true;}return false;}
  function refundStatus(w:Window):'ready'|'not_collected'|'incomplete'{return !refundPeriods.length?'not_collected':refundCovered(w)&&!data.quality.finance_gaps?'ready':'incomplete';}
  function covered(start:number,end:number) { let cursor=start;for(const p of coverage) {if(p.end<=cursor)continue;if(p.start>cursor)return false;cursor=Math.max(cursor,p.end);if(cursor>=end)return true;}return false; }
  const coverageStatus = (start:number,end:number):MetricStatus => !coverage.length?'not_collected':covered(start,end)?'ready':'incomplete';
  const selectedEvents=data.events.filter(e=>env(e)&&userMap.has(e.owner_id)&&ms(e.received_at)<=asOf);
  const clientEvents=selectedEvents.filter(e=>e.source!=='server_download');
  const eventsByJob=new Map<string,AnalyticsEvent[]>();for(const event of selectedEvents)if(event.job_id){const rows=eventsByJob.get(event.job_id)||[];rows.push(event);eventsByJob.set(event.job_id,rows);}
  const childrenByParent=new Map<string,AnalyticsJob[]>();for(const child of allJobs)if(child.parent_job_id){const rows=childrenByParent.get(child.parent_job_id)||[];rows.push(child);childrenByParent.set(child.parent_job_id,rows);}
  const imagesByJob=new Map<string,AnalyticsDataset['images']>();for(const image of data.images)if(image.source_job_id){const rows=imagesByJob.get(image.source_job_id)||[];rows.push(image);imagesByJob.set(image.source_job_id,rows);}
  const imageMap=new Map(data.images.map(image=>[image.id,image]));
  const uploadsByOwner=group(data.images.filter(image=>image.source_kind==='upload'),image=>image.owner_id);
  const actionsByJob=new Map<string,AnalyticsDataset['actions']>();for(const action of data.actions){const rows=actionsByJob.get(action.job_id)||[];rows.push(action);actionsByJob.set(action.job_id,rows);}
  const issuedCache=new Map<string,number[]>();
  // received_at is the server clock. occurred_at remains an observation; its
  // difference from receipt is exposed rather than treated as trusted ordering.
  const eventTime=(e:AnalyticsEvent)=>e.source==='server_download'?ms(e.occurred_at):ms(e.received_at);
  const linkedEvents = (job:AnalyticsJob,name:string) => (eventsByJob.get(job.id)||[]).filter(e=>e.owner_id===job.owner_id&&e.name===name);
  const issuedFor = (job:AnalyticsJob) => {
    if(issuedCache.has(job.id))return issuedCache.get(job.id)!;
    const times=linkedEvents(job,'download_url_issued').filter(e=>e.source==='server_download'&&e.action_id).map(e=>eventTime(e));
    for(const a of actionsByJob.get(job.id)||[]) if(a.environment===q.environment&&a.job_id===job.id&&a.owner_id===job.owner_id&&a.state==='issued'&&a.issued_at&&ms(a.issued_at)<=asOf) times.push(ms(a.issued_at));
    const result=[...new Set(times)].sort((a,b)=>a-b);issuedCache.set(job.id,result);return result;
  };
  function scope(w:Window) {
    const base=allJobs.filter(j=>within(j.created_at,w)); const counts=new Map<string,number>();for(const j of base)counts.set(j.owner_id,(counts.get(j.owner_id)||0)+1);
    const cohort=(u:AnalyticsUser) => {
      switch(q.cohort) {
        case 'new':return within(u.created_at,w);
        case 'returning':return ms(u.created_at)<w.start;
        case 'paid':return knownPaid(u);
        case 'unpaid':return paymentHistoryKnown(u)&&!knownPaid(u);
        case 'light':return (counts.get(u.id)||0)>=1&&(counts.get(u.id)||0)<=5;
        case 'heavy':return (counts.get(u.id)||0)>=6;
        default:return true;
      }
    };
    const eligible=users.filter(u=>ms(u.created_at)<Math.min(w.end,asOf)&&cohort(u));
    const ownerSet=new Set(eligible.map(u=>u.id));
    const dimensionJobs=allJobs.filter(j=>ownerSet.has(j.owner_id)&&dimension(j));
    const paymentUnknown=users.filter(u=>ms(u.created_at)<Math.min(w.end,asOf)&&!knownPaid(u)&&!paymentHistoryKnown(u)).length;
    return {eligible,ownerSet,jobs:dimensionJobs.filter(j=>within(j.created_at,w)),all:dimensionJobs,paymentUnknown};
  }
  type Scope=ReturnType<typeof scope>;
  function rateForJobs(jobs:AnalyticsJob[],w:Window,owners:Set<string>,id:'M11'|'M12'|'M13'|'M18'|'M24'):AnalyticsMetric {
    const duration=id==='M24'?7*DAY:DAY;
    const completed=jobs.filter(j=>j.status==='completed'&&within(j.completed_at,w));
    const mature=completed.filter(j=>ms(j.completed_at)+duration<=asOf);
    const immature=completed.length-mature.length;
    const covering=mature.filter(j=>covered(ms(j.completed_at),ms(j.completed_at)+duration));
    const missing=mature.length-covering.length;
    let viewed=0,saved=0,ordered=0,continued=0,rated=0,positive=0,uncertain=0,assetLoss=0,pending=0,pendingOrdered=0;
    for(const j of mature) {
      const start=ms(j.completed_at),end=start+duration;
      const views=linkedEvents(j,'result_viewed').filter(e=>eventTime(e)>=start&&eventTime(e)<end).sort((a,b)=>eventTime(a)-eventTime(b));
      const saves=issuedFor(j).filter(t=>t>=start&&t<start+DAY);
      if(views.length)viewed++;if(saves.length)saved++;
      if(views.length&&saves.some(t=>t>=eventTime(views[0])))ordered++;
      if(views.some(e=>Math.abs(ms(e.occurred_at)-ms(e.received_at))>1000))uncertain++;
      if((childrenByParent.get(j.id)||[]).some(child=>owners.has(child.owner_id)&&child.owner_id===j.owner_id&&child.parent_job_id===j.id&&ms(child.created_at)>=start&&ms(child.created_at)<start+DAY))continued++;
      const feedback=linkedEvents(j,'feedback_submitted').filter(e=>e.rating&&eventTime(e)>=start&&eventTime(e)<end).sort((a,b)=>eventTime(a)-eventTime(b)||a.event_id.localeCompare(b.event_id));
      if(feedback.length) {rated++;if(feedback.at(-1)!.rating==='positive')positive++;}
      const assets=[...(imagesByJob.get(j.id)||[])];if(j.result_image_id&&imageMap.has(j.result_image_id)&&!assets.some(i=>i.id===j.result_image_id))assets.push(imageMap.get(j.result_image_id)!);
      if(assets.length&&assets.every(i=>ms(i.expires_at)<start+DAY||(i.deleted_at&&ms(i.deleted_at)<start+DAY)))assetLoss++;
      const unconfirmed=(actionsByJob.get(j.id)||[]).filter(a=>a.environment===q.environment&&a.owner_id===j.owner_id&&a.job_id===j.id&&a.state==='pending'&&ms(a.created_at)>=start&&ms(a.created_at)<start+DAY);
      if(!saves.length&&unconfirmed.length)pending++;
      if(views.length&&!saves.some(t=>t>=eventTime(views[0]))&&unconfirmed.some(a=>ms(a.created_at)>=eventTime(views[0])))pendingOrdered++;
    }
    let result = id==='M11'?ratio(id,viewed,mature.length):id==='M12'?ratio(id,saved,mature.length):id==='M13'?ratio(id,ordered,viewed):id==='M18'?ratio(id,continued,mature.length):ratio(id,positive,rated);
    result={...result,coverage_start:coverageStart,auxiliary:{mature_jobs:mature.length,immature_jobs:immature,coverage_missing_jobs:missing,viewed_jobs:viewed,saved_jobs:saved,uncertain_order_jobs:uncertain,asset_loss_jobs:assetLoss,pending_download_jobs:pending,pending_order_jobs:pendingOrdered,rated_jobs:rated,positive_jobs:positive,...(mature.length?{feedback_coverage:rated/mature.length}:{})}};
    if(id==='M18') return !mature.length&&immature?{...result,status:'immature',reason:'成功任务观察窗口尚未成熟。'}:result;
    if(!coverage.length)return {...result,value:null,status:'not_collected',reason:'此环境尚无行为采集覆盖，历史缺失不能作为零行为。'};
    if(!mature.length&&immature)return {...result,status:'immature',reason:'成功任务观察窗口尚未成熟。'};
    if(missing||(id==='M12'&&(pending||assetLoss))||(id==='M13'&&(uncertain||pendingOrdered)))return {...result,value:null,status:'incomplete',reason:missing?'部分任务的完整观察窗未被采集覆盖。':pending||pendingOrdered?'存在签发结果未确认的下载动作。':assetLoss?'部分结果在24小时观察窗结束前删除或到期。':'客户端时钟与接收顺序存在不确定性，不能确认全部先查看后下载。'};
    return result;
  }
  function latency(jobs:AnalyticsJob[]) { const times=jobs.filter(j=>j.status==='completed'&&j.completed_at&&ms(j.completed_at)>=ms(j.created_at)).map(j=>ms(j.completed_at)-ms(j.created_at));return {p50:quantile(times,.5),p95:quantile(times,.95),n:times.length}; }
  function consumption(w:Window,s:Scope) {return data.ledger.filter(l=>env(l)&&s.ownerSet.has(l.owner_id)&&l.kind==='consume'&&within(l.created_at,w)&&(!downstream||!!l.reference_id&&!!jobMap.get(l.reference_id)&&dimension(jobMap.get(l.reference_id)!)));}
  function money(w:Window,s:Scope,jobSet?:Set<string>) {
    const amounts=new Map<string,Money>();const currency=(code:string)=>{if(!amounts.has(code))amounts.set(code,{currency:code,paid_minor:0,refunded_minor:0,net_minor:0,refund_status:'ready',provider_report_minor:0,invoice_minor:0,known_cost_minor:0,estimated_minor:0,estimated_pending_minor:0});return amounts.get(code)!;};
    if(!financeAllowed)return [];
    const oneOwner=s.ownerSet.size===1?[...s.ownerSet][0]:null,orders=oneOwner?ordersByOwner.get(oneOwner)||[]:data.orders,refunds=oneOwner?refundsByOwner.get(oneOwner)||[]:data.refunds,attempts=oneOwner?attemptsByOwner.get(oneOwner)||[]:data.attempts;
    if(!downstream&&!jobSet) {
      for(const o of orders)if(env(o)&&s.ownerSet.has(o.owner_id)&&within(o.paid_at,w)&&o.currency&&o.amount_minor!==null)currency(o.currency).paid_minor+=o.amount_minor;
      for(const r of refunds)if(env(r)&&s.ownerSet.has(r.owner_id)&&r.status==='succeeded'&&within(r.occurred_at,w))currency(r.currency).refunded_minor!+=r.amount_minor;
    }
    for(const a of attempts) {
      const j=jobMap.get(a.job_id);if(!j||!s.ownerSet.has(j.owner_id)||!dimension(j)||!within(a.created_at,w)||(jobSet&&!jobSet.has(j.id)))continue;
      const cost=a.actual_cost;
      if(cost&&(cost.evidence==='provider_report'||cost.evidence==='invoice')) { const c=currency(cost.currency);c.known_cost_minor+=cost.amount_minor;c[cost.evidence==='invoice'?'invoice_minor':'provider_report_minor']+=cost.amount_minor; }
      else {const estimate=cost||a.estimated_cost;if(estimate){const c=currency(estimate.currency);c.estimated_minor+=estimate.amount_minor;if(!['failed','completed','settled','cancelled'].includes(a.state))c.estimated_pending_minor+=estimate.amount_minor;}}
    }
    return [...amounts.values()].map(c=>{const status=refundStatus(w),known=status==='ready';return {...c,refunded_minor:known?c.refunded_minor:null,net_minor:known?c.paid_minor-c.refunded_minor!:null,refund_status:status};}).sort((a,b)=>a.currency.localeCompare(b.currency));
  }
  function retentionCohort(s:Scope,w:Window) {
    const scopedByOwner=group(s.all,j=>j.owner_id);
    const cohort=s.eligible.filter(u=>within(u.first_completed_at,w));
    return downstream?cohort.filter(u=>(scopedByOwner.get(u.id)||[]).some(j=>j.owner_id===u.id&&j.status==='completed'&&ms(j.completed_at)===ms(u.first_completed_at))):cohort;
  }
  function retentionMetric(s:Scope,w:Window,days:1|7|'w1',id:string) {
    const scopedByOwner=group(s.all,j=>j.owner_id),selected=retentionCohort(s,w);
    let mature=0,retained=0,immature=0,unknown=0;
    for(const u of selected) {
      if(!u.history_complete||!data.quality.history_complete){unknown++;continue;}
      const d=dateKey(ms(u.first_completed_at),q.timezone),start=localMidnight(addDays(d,days==='w1'?7:days),q.timezone),end=localMidnight(addDays(d,days==='w1'?14:days+1),q.timezone);
      if(end>asOf){immature++;continue;}mature++;
      if((scopedByOwner.get(u.id)||[]).some(j=>j.owner_id===u.id&&ms(j.created_at)>=start&&ms(j.created_at)<end))retained++;
    }
    let r=ratio(id,retained,mature,{auxiliary:{immature_users:immature,history_unknown_users:unknown,cohort_users:selected.length}});
    if(unknown)r={...r,value:null,status:'incomplete',reason:'首次成功历史存在左截断，不能把最早可见任务当作首次成功。'};
    else if(!mature&&immature)r={...r,status:'immature',reason:'对应自然日/周留存观察窗尚未结束。'};
    return r;
  }
  function periodMetrics(w:Window,s:Scope):AnalyticsMetric[] {
    const js=s.jobs,active=ids(js,j=>j.owner_id),n=js.length,completed=js.filter(j=>j.status==='completed').length,failed=js.filter(j=>j.status==='failed').length;
    const counts=[...active].map(id=>js.filter(j=>j.owner_id===id).length), credits=consumption(w,s);
    const lat=latency(js),saveEvents=selectedEvents.filter(e=>e.name==='download_url_issued'&&e.source==='server_download'&&!!e.action_id&&within(e.occurred_at,w)&&s.ownerSet.has(e.owner_id)&&!!e.job_id&&!!jobMap.get(e.job_id)&&jobMap.get(e.job_id)!.status==='completed'&&jobMap.get(e.job_id)!.owner_id===e.owner_id&&ms(e.occurred_at)>=ms(jobMap.get(e.job_id)!.completed_at)&&dimension(jobMap.get(e.job_id)!));
    const actionSavers=data.actions.filter(a=>a.environment===q.environment&&a.state==='issued'&&within(a.issued_at,w)&&s.ownerSet.has(a.owner_id)&&!!jobMap.get(a.job_id)&&jobMap.get(a.job_id)!.status==='completed'&&jobMap.get(a.job_id)!.owner_id===a.owner_id&&ms(a.issued_at)>=ms(jobMap.get(a.job_id)!.completed_at)&&dimension(jobMap.get(a.job_id)!));
    const payerSet=ids(data.orders.filter(o=>env(o)&&s.ownerSet.has(o.owner_id)&&within(o.paid_at,w)),o=>o.owner_id);
    const result:AnalyticsMetric[]=[
      downstream?unavailable('M01','unsupported_filters','注册事实没有工具、模型或设备归因。','count'):metric('M01',s.eligible.filter(u=>within(u.created_at,w)).length),
      metric('M02',active.size),metric('M03',n),metric('M04',active.size?n/active.size:null,'per_user',{numerator:n,denominator:active.size,sample_size:active.size,status:active.size?'ready':'no_sample',auxiliary:counts.length?{p50:quantile(counts,.5)!,p90:quantile(counts,.9)!}:{}}),
      unavailable('M05','by_dimension','逐用户用量见用户明细。','count'),
      metric('M06',sum(credits,l=>-l.reserved_delta),'credits',{sample_size:credits.length}),
      ratio('M07',completed,completed+failed,{auxiliary:{queued:js.filter(j=>j.status==='queued').length,processing:js.filter(j=>j.status==='processing').length,cancelled:js.filter(j=>j.status==='cancelled').length}}),
      unavailable('M08','by_dimension','逐特效任务占比见特效明细。'),unavailable('M09','by_dimension','逐特效去重用户覆盖见特效明细。'),
    ];
    if(exposureUnsupported) result.push(unavailable('M10','unsupported_filters','曝光事实没有冻结模型或版本，无法将其归因到该筛选。'));
    else {
      const exposures=unique(selectedEvents.filter(e=>e.name==='tool_exposed'&&within(e.received_at,w)&&s.ownerSet.has(e.owner_id)&&(!q.tool_id||e.tool_id===q.tool_id)&&(!drill.tool_id||e.tool_id===drill.tool_id)&&(!q.category||categories.get(e.tool_id)===q.category)&&(!q.device||e.device===q.device)),e=>`${e.owner_id}:${e.page_view_id}:${e.tool_id}`);
      const clicks=exposures.filter(e=>selectedEvents.some(c=>c.name==='tool_selected'&&c.owner_id===e.owner_id&&c.page_view_id===e.page_view_id&&c.tool_id===e.tool_id&&c.exposure_id===e.exposure_id&&eventTime(c)>=eventTime(e)&&eventTime(c)<Math.min(w.end,asOf)));
      const status=coverageStatus(w.start,Math.min(w.end,asOf));result.push(ratio('M10',clicks.length,exposures.length,{coverage_start:coverageStart,...(status==='ready'?{}:{value:null,status,reason:'曝光期间采集覆盖不足。'})}));
    }
    for(const id of ['M11','M12','M13'] as const)result.push(rateForJobs(s.all,w,s.ownerSet,id));
    const savedUsers=new Set([...saveEvents.map(e=>e.owner_id),...actionSavers.map(a=>a.owner_id)]);
    const m14=metric('M14',savedUsers.size,'count',{coverage_start:coverageStart,auxiliary:{natural_weeks:new Set([...saveEvents.map(e=>bucketKey(eventTime(e),{...q,bucket:'week'})),...actionSavers.map(a=>bucketKey(ms(a.issued_at),{...q,bucket:'week'}))]).size}});
    const pendingActions=data.actions.filter(a=>a.environment===q.environment&&a.state==='pending'&&within(a.created_at,w)&&s.ownerSet.has(a.owner_id)&&!savedUsers.has(a.owner_id)&&!!jobMap.get(a.job_id)&&dimension(jobMap.get(a.job_id)!));const savedCoverage=coverageStatus(w.start,Math.min(w.end,asOf));result.push(savedCoverage==='ready'&&!pendingActions.length?m14:{...m14,value:null,status:pendingActions.length?'incomplete':savedCoverage,reason:pendingActions.length?'期间存在签发结果未确认的显式下载动作。':'所选动作时间区间采集不完整，不能把缺失历史当作零。',auxiliary:{...m14.auxiliary,observed_users:savedUsers.size,pending_actions:pendingActions.length}});
    if(downstream)result.push(unavailable('M15','unsupported_filters','注册队列没有可靠的下游维度归因。'));
    else {
      const newbies=s.eligible.filter(u=>within(u.created_at,w)),mature=newbies.filter(u=>ms(u.created_at)+DAY<=asOf),known=mature.filter(u=>u.history_complete&&data.quality.history_complete),activated=known.filter(u=>u.first_completed_at&&ms(u.first_completed_at)>=ms(u.created_at)&&ms(u.first_completed_at)<ms(u.created_at)+DAY);
      let r=ratio('M15',activated.length,mature.length,{auxiliary:{immature_users:newbies.length-mature.length,history_unknown_users:mature.length-known.length}});
      if(known.length!==mature.length)r={...r,value:null,status:'incomplete',reason:'首次成功历史不完整。'};else if(!mature.length&&newbies.length)r={...r,status:'immature',reason:'注册后24小时尚未结束。'};result.push(r);
    }
    const d1=retentionMetric(s,w,1,'M16'),d7=retentionMetric(s,w,7,'M16');result.push({...d7,auxiliary:{...d7.auxiliary,d1_numerator:d1.numerator||0,d1_denominator:d1.denominator||0,d1_ready:d1.status==='ready'?1:0,...(d1.value!==null?{d1_value:d1.value}:{})}});
    result.push(retentionMetric(s,w,'w1','M17'),rateForJobs(s.all,w,s.ownerSet,'M18'),metric('M19',lat.p50,'milliseconds',{sample_size:lat.n,status:lat.n?'ready':'no_sample',auxiliary:lat.p95!==null?{p95:lat.p95}:{}}),ratio('M20',[...active].filter(u=>payerSet.has(u)).length,active.size));
    const currencies=money(w,s),moneyState:MetricStatus=!financeAllowed?'forbidden':downstream?'unsupported_filters':refundStatus(w)==='ready'?'by_dimension':'incomplete';
    result.push(unavailable('M21',moneyState,moneyState==='forbidden'?'需要财务读取权限。':moneyState==='unsupported_filters'?'付款/退款没有工具、模型或设备归因。':moneyState==='incomplete'?'付款事实仍可用；退款采集覆盖或入账事实存在缺口，净额不可确认为完整。':'按币种查看付款与退款，禁止跨币种相加。','minor'));
    if(!financeAllowed)result.push(unavailable('M22','forbidden','需要财务读取权限。'));
    else if(downstream)result.push(unavailable('M22','unsupported_filters','首次付款队列没有下游维度归因。'));
    else {
      const first=s.eligible.filter(u=>within(u.first_paid_at,w)),mature=first.filter(u=>ms(u.first_paid_at)+30*DAY<=asOf),unknown=mature.filter(u=>!paymentHistoryKnown(u));
      const repeat=mature.filter(u=>ids(data.orders.filter(o=>env(o)&&o.owner_id===u.id&&o.paid_at&&ms(o.paid_at)>=ms(u.first_paid_at)&&ms(o.paid_at)<ms(u.first_paid_at)+30*DAY),o=>o.id).size>=2);
      let r=ratio('M22',repeat.length,mature.length,{auxiliary:{immature_users:first.length-mature.length,history_unknown_users:unknown.length}});if(unknown.length||!paymentHistoryComplete)r={...r,value:null,status:'incomplete',reason:'首付与复购订单历史存在未知环境付款，无法确认完整首付队列。'};else if(!mature.length&&first.length)r={...r,status:'immature',reason:'首付后30天观察窗尚未结束。'};result.push(r);
    }
    const attempts=data.attempts.filter(a=>{const j=jobMap.get(a.job_id);return !!j&&s.ownerSet.has(j.owner_id)&&dimension(j)&&within(a.created_at,w);});
    result.push(!financeAllowed?unavailable('M23','forbidden','需要财务读取权限。','minor'):metric('M23',null,'minor',{status:'by_dimension',reason:'实际费用按币种和证据分别展示，未知费用不归零。',sample_size:attempts.length,auxiliary:{known_attempts:attempts.filter(a=>a.actual_cost&&a.actual_cost.evidence!=='estimate').length,unknown_attempts:attempts.filter(a=>!a.actual_cost||a.actual_cost.evidence==='estimate').length,currencies:currencies.length}}));
    result.push(rateForJobs(s.all,w,s.ownerSet,'M24'));
    if((q.cohort==='paid'||q.cohort==='unpaid')&&s.paymentUnknown)return result.map(m=>m.status==='ready'||m.status==='no_sample'?{...m,value:null,status:'incomplete' as const,reason:'部分用户付款历史未知，付费分群仅覆盖可以确认的成员。',auxiliary:{...m.auxiliary,unknown_payment_users:s.paymentUnknown,...(m.value!==null?{observed_value:m.value}:{})}}:m);
    return result;
  }

  const current=scope(window),metrics=periodMetrics(window,current),previousMetrics=periodMetrics(previous,scope(previous));
  const filteredJobs=current.jobs,active=ids(filteredJobs,j=>j.owner_id),consumed=consumption(window,current);
  const currentCurrencies=money(window,current);
  const currentByOwner=group(current.all,j=>j.owner_id),periodByOwner=group(filteredJobs,j=>j.owner_id),consumedByOwner=group(consumed,l=>l.owner_id),clientByOwner=group(clientEvents.filter(e=>within(e.received_at,window)),e=>e.owner_id);
  const userRows:UsageRow[]=current.eligible.map(u=>{
    const own=periodByOwner.get(u.id)||[],all=currentByOwner.get(u.id)||[],owners=new Set([u.id]);
    const dates=all.map(j=>j.created_at).sort();const productDates=(clientByOwner.get(u.id)||[]).map(e=>e.received_at).sort();
    const save=rateForJobs(all,window,owners,'M12');
    return {user_id:u.id,email_masked:u.email_masked,created_at:u.created_at,account_status:u.account_status,available:u.available,reserved:u.reserved,jobs:own.length,completed:own.filter(j=>j.status==='completed').length,failed:own.filter(j=>j.status==='failed').length,cancelled:own.filter(j=>j.status==='cancelled').length,in_flight:own.filter(j=>j.status==='queued'||j.status==='processing').length,tools:ids(own,j=>j.tool_id).size,credits:sum(consumedByOwner.get(u.id)||[],l=>-l.reserved_delta),saved_jobs:save.status==='ready'?save.auxiliary.saved_jobs:null,save_rate:save,lifetime_jobs:u.history_complete?u.lifetime_jobs:null,last_30d_jobs:u.last_30d_jobs??null,history_complete:u.history_complete,last_generated_at:u.last_generated_at??dates.at(-1)??null,last_product_event_at:productDates.at(-1)||null,currencies:money(window,{...current,eligible:[u],ownerSet:owners})};
  }).sort((a,b)=>b.jobs-a.jobs||a.user_id.localeCompare(b.user_id));
  const user_usage_ranking={top:userRows.slice(0,15).map(u=>({user_id:u.user_id,email_masked:u.email_masked,jobs:u.jobs})),other_jobs:sum(userRows.slice(15),u=>u.jobs),other_users:Math.max(0,userRows.length-15)};
  const toolIds=new Set([...data.catalog.filter(t=>(!q.tool_id||t.tool_id===q.tool_id)&&(!drill.tool_id||t.tool_id===drill.tool_id)&&(!q.category||t.category===q.category)).map(t=>t.tool_id),...filteredJobs.map(j=>j.tool_id)]);
  const tools:ToolRow[]=[...toolIds].map(id=>{
    const own=filteredJobs.filter(j=>j.tool_id===id),all=current.all.filter(j=>j.tool_id===id),tool=data.catalog.find(t=>t.tool_id===id),lat=latency(own);
    return {tool_id:id,name:tool?.name||id,category:tool?.category||'unknown',available:tool?.available??false,jobs:own.length,users:ids(own,j=>j.owner_id).size,task_share:ratio('M08',own.length,filteredJobs.length),user_reach:ratio('M09',ids(own,j=>j.owner_id).size,active.size),success:ratio('M07',own.filter(j=>j.status==='completed').length,own.filter(j=>j.status==='completed'||j.status==='failed').length),save_rate:rateForJobs(all,window,current.ownerSet,'M12'),view_rate:rateForJobs(all,window,current.ownerSet,'M11'),feedback:rateForJobs(all,window,current.ownerSet,'M24'),continued_edit:rateForJobs(all,window,current.ownerSet,'M18'),credits:sum(consumed.filter(l=>l.reference_id&&jobMap.get(l.reference_id)?.tool_id===id),l=>-l.reserved_delta),latency_p50_ms:lat.p50,latency_p95_ms:lat.p95};
  }).sort((a,b)=>b.jobs-a.jobs||a.tool_id.localeCompare(b.tool_id));
  const versionKey=(j:AnalyticsJob)=>JSON.stringify([j.tool_id,j.model_id,j.adapter_version,j.prompt_id,j.prompt_version,j.tool_version]);
  const consumedJobIds=new Set(consumed.flatMap(entry=>entry.reference_id?[entry.reference_id]:[]));
  const versionGroups=new Map<string,AnalyticsJob[]>();for(const j of current.all){const key=versionKey(j);const rows=versionGroups.get(key)||[];rows.push(j);versionGroups.set(key,rows);}
  const versions:VersionRow[]=[...versionGroups].filter(([,all])=>all.some(j=>within(j.created_at,window)||within(j.completed_at,window)||consumedJobIds.has(j.id))).map(([key,all])=>{
    const own=all.filter(j=>within(j.created_at,window)),j=all[0],lat=latency(own),dates=all.map(j=>j.created_at).sort();return {key,tool_id:j.tool_id,model_id:j.model_id,adapter_version:j.adapter_version,prompt_id:j.prompt_id,prompt_version:j.prompt_version,tool_version:j.tool_version,first_seen_at:dates[0],last_seen_at:dates.at(-1)!,jobs:own.length,users:ids(own,j=>j.owner_id).size,success:ratio('M07',own.filter(j=>j.status==='completed').length,own.filter(j=>j.status==='completed'||j.status==='failed').length),save_rate:rateForJobs(all,window,current.ownerSet,'M12'),feedback:rateForJobs(all,window,current.ownerSet,'M24'),latency_p50_ms:lat.p50,latency_p95_ms:lat.p95};
  }).sort((a,b)=>b.jobs-a.jobs||a.key.localeCompare(b.key));
  const buckets=new Map<string,Window>();
  for(let time=window.start;time<Math.min(window.end,asOf);){const key=bucketKey(time,q),parts=localParts(time,q.timezone);const start=q.bucket==='hour'?time-Number(parts.minute)*60_000-Number(parts.second)*1000-(time%1000):localMidnight(key,q.timezone),end=q.bucket==='hour'?start+3_600_000:localMidnight(addDays(key,q.bucket==='week'?7:1),q.timezone);if(end<=time)throw new Error('INVALID_ANALYTICS_BUCKET');buckets.set(key,{start:Math.max(start,window.start),end:Math.min(end,window.end)});time=end;}
  const trend:TrendRow[]=[...buckets].map(([bucket,w])=>{
    const js=filteredJobs.filter(j=>within(j.created_at,w)),lat=latency(js),toolCounts:Record<string,number>={};for(const j of js)toolCounts[j.tool_id]=(toolCounts[j.tool_id]||0)+1;
    const saving=current.all.filter(j=>j.status==='completed'&&issuedFor(j).some(t=>t>=w.start&&t<w.end));const saveState=coverageStatus(w.start,Math.min(w.end,asOf));const savingOwners=ids(saving,j=>j.owner_id);const pending=data.actions.some(a=>a.environment===q.environment&&a.state==='pending'&&current.ownerSet.has(a.owner_id)&&!savingOwners.has(a.owner_id)&&within(a.created_at,w)&&!!jobMap.get(a.job_id)&&dimension(jobMap.get(a.job_id)!));const save_status:MetricStatus=pending?'incomplete':saveState;
    return {bucket,jobs:js.length,users:ids(js,j=>j.owner_id).size,new_users:downstream?null:current.eligible.filter(u=>within(u.created_at,w)).length,completed:js.filter(j=>j.status==='completed').length,failed:js.filter(j=>j.status==='failed').length,cancelled:js.filter(j=>j.status==='cancelled').length,in_flight:js.filter(j=>j.status==='queued'||j.status==='processing').length,credits:sum(consumed.filter(l=>within(l.created_at,w)),l=>-l.reserved_delta),saved_users:save_status==='ready'?ids(saving,j=>j.owner_id).size:null,saved_jobs:save_status==='ready'?saving.length:null,save_status,tools:toolCounts,success:ratio('M07',js.filter(j=>j.status==='completed').length,js.filter(j=>j.status==='completed'||j.status==='failed').length),save_rate:rateForJobs(current.all,w,current.ownerSet,'M12'),latency_p50_ms:lat.p50,latency_p95_ms:lat.p95,currencies:money(w,current)};
  });
  // Full version groups precede API table pagination. Sparse activity buckets
  // keep complexity tied to real facts, not versions × every calendar bucket.
  // Fail explicitly before producing an oversized, plausibly truncated report.
  let versionPoints=0;
  const version_trends=versions.map(version=>{
    const all=versionGroups.get(version.key)!,jobIds=ids(all,j=>j.id),activeBuckets=new Set<string>();
    const versionCredits=consumed.filter(l=>l.reference_id&&jobIds.has(l.reference_id));
    for(const credit of versionCredits)if(within(credit.created_at,window))activeBuckets.add(bucketKey(ms(credit.created_at),q));
    for(const j of all){
      if(within(j.created_at,window))activeBuckets.add(bucketKey(ms(j.created_at),q));
      if(j.completed_at&&within(j.completed_at,window))activeBuckets.add(bucketKey(ms(j.completed_at),q));
      for(const saved of issuedFor(j))if(saved>=window.start&&saved<window.end)activeBuckets.add(bucketKey(saved,q));
      for(const action of actionsByJob.get(j.id)||[])if(action.owner_id===j.owner_id&&action.environment===q.environment&&within(action.created_at,window))activeBuckets.add(bucketKey(ms(action.created_at),q));
    }
    const entries=[...buckets].filter(([bucket])=>activeBuckets.has(bucket));versionPoints+=entries.length;
    if(versionPoints>2000)throw new ApiError('QUERY_TOO_LARGE');
    return {key:version.key,trend:entries.map(([bucket,w]):TrendRow=>{
      const js=all.filter(j=>within(j.created_at,w)),lat=latency(js),saving=all.filter(j=>j.status==='completed'&&issuedFor(j).some(t=>t>=w.start&&t<w.end)),savedOwners=ids(saving,j=>j.owner_id);
      const pending=all.some(j=>(actionsByJob.get(j.id)||[]).some(a=>a.environment===q.environment&&a.owner_id===j.owner_id&&a.state==='pending'&&within(a.created_at,w)&&!savedOwners.has(j.owner_id)));
      const save_status:MetricStatus=pending?'incomplete':coverageStatus(w.start,Math.min(w.end,asOf));
      return {bucket,jobs:js.length,users:ids(js,j=>j.owner_id).size,new_users:null,completed:js.filter(j=>j.status==='completed').length,failed:js.filter(j=>j.status==='failed').length,cancelled:js.filter(j=>j.status==='cancelled').length,in_flight:js.filter(j=>j.status==='queued'||j.status==='processing').length,credits:sum(versionCredits.filter(l=>within(l.created_at,w)),l=>-l.reserved_delta),saved_users:save_status==='ready'?savedOwners.size:null,saved_jobs:save_status==='ready'?saving.length:null,save_status,tools:js.length?{[version.tool_id]:js.length}:{},success:ratio('M07',js.filter(j=>j.status==='completed').length,js.filter(j=>j.status==='completed'||j.status==='failed').length),save_rate:rateForJobs(all,w,current.ownerSet,'M12'),latency_p50_ms:lat.p50,latency_p95_ms:lat.p95,currencies:[]};
    })};
  });
  const selectedVersionKeys=new Set(versions.map(v=>v.key));
  const version_releases=unique((data.version_releases||[]).filter(release=>selectedVersionKeys.has(release.key)&&(q.internal!=='exclude'||release.scope!=='internal_only')&&Number.isFinite(ms(release.released_at))&&ms(release.released_at)<=asOf&&['all_users','limited_rollout','internal_only'].includes(release.scope)),release=>`${release.key}:${release.released_at}:${release.scope}`).sort((a,b)=>ms(a.released_at)-ms(b.released_at)||a.key.localeCompare(b.key));
  const heatmap:{user_id:string;date:string;jobs:number}[]=[];
  for(const row of userRows.slice(0,20)){const counts=new Map<string,number>();for(const j of filteredJobs.filter(j=>j.owner_id===row.user_id)){const day=dateKey(ms(j.created_at),q.timezone);counts.set(day,(counts.get(day)||0)+1);}for(const [date,jobs]of counts)heatmap.push({user_id:row.user_id,date,jobs});}
  const distribution=[{bucket:'0',min:0,max:0},{bucket:'1',min:1,max:1},{bucket:'2–5',min:2,max:5},{bucket:'6–20',min:6,max:20},{bucket:'21+',min:21,max:Infinity}].map(b=>({bucket:b.bucket,users:userRows.filter(u=>u.jobs>=b.min&&u.jobs<=b.max).length}));
  const retentionDays=[...new Set(current.eligible.filter(u=>within(u.first_completed_at,window)).map(u=>dateKey(ms(u.first_completed_at),q.timezone)))].sort();
  const retention=retentionDays.map(cohort=>{const w={start:Math.max(window.start,localMidnight(cohort,q.timezone)),end:Math.min(window.end,localMidnight(addDays(cohort,1),q.timezone))};const eligible=retentionCohort(current,w);return {cohort,users:eligible.length,d1:retentionMetric({...current,eligible},w,1,'M16'),d7:retentionMetric({...current,eligible},w,7,'M16'),w1:retentionMetric({...current,eligible},w,'w1','M17')};});
  const funnel=buildFunnel();
  function buildFunnel():AnalyticsReport['funnel'] {
    const fresh=current.eligible.filter(u=>within(u.created_at,window)&&ms(u.created_at)+DAY<=asOf);
    const names=['registered','uploaded','generated','completed','viewed','download_requested','saved'];const stages=names.map(key=>({key,users:0 as number|null,status:'ready' as MetricStatus,reason:null as string|null,numerator:0 as number|null,denominator:0 as number|null,conversion:null as number|null}));
    let missingCoverage=0,uncertain=0,pendingUserSaves=0;const unknownUploadStages=new Set<number>();
    if(downstream){for(const st of stages){st.users=null;st.numerator=null;st.denominator=null;st.status='unsupported_filters';st.reason='注册激活漏斗没有下游维度归因。';}}
    else for(const u of fresh){
      const start=ms(u.created_at),end=start+DAY;stages[0].users!++;
      if(!covered(start,end))missingCoverage++;
      const candidates=(uploadsByOwner.get(u.id)||[]).filter(image=>within(image.upload_completed_at,{start,end})||(!image.upload_completed_at&&image.status!=='uploading'&&within(image.created_at,{start,end})));
      const matches=(image:AnalyticsDataset['images'][number])=>image.environment===q.environment&&(q.internal==='include'||typeof image.internal==='boolean'&&image.internal===(q.internal==='only'));
      const upload=candidates.filter(image=>matches(image)&&image.upload_completed_at).sort((a,b)=>ms(a.upload_completed_at)-ms(b.upload_completed_at))[0];
      const unknownUpload=candidates.some(image=>{
        const unknownEnvironment=image.environment===undefined||image.environment==='unclassified'&&q.environment!=='unclassified';
        if(!unknownEnvironment&&image.environment!==q.environment)return false;
        if(!unknownEnvironment&&q.internal!=='include'&&typeof image.internal==='boolean'&&image.internal!==(q.internal==='only'))return false;
        return unknownEnvironment||q.internal!=='include'&&image.internal===undefined||!image.upload_completed_at;
      });
      const uncertainUploadFrom=(index:number)=>{if(unknownUpload)for(let step=index;step<stages.length;step++)unknownUploadStages.add(step);};
      if(!upload){uncertainUploadFrom(1);continue;}stages[1].users!++;
      const jobs=(allJobsByOwner.get(u.id)||[]).filter(j=>j.owner_id===u.id&&ms(j.created_at)>=ms(upload.upload_completed_at)&&ms(j.created_at)<end).sort((a,b)=>ms(a.created_at)-ms(b.created_at));if(!jobs.length){uncertainUploadFrom(2);continue;}stages[2].users!++;
      const completed=jobs.filter(j=>j.status==='completed'&&ms(j.completed_at)>=ms(j.created_at)&&ms(j.completed_at)<end).sort((a,b)=>ms(a.completed_at)-ms(b.completed_at));if(!completed.length){uncertainUploadFrom(3);continue;}stages[3].users!++;
      const viewed=completed.flatMap(j=>linkedEvents(j,'result_viewed').filter(e=>eventTime(e)>=ms(j.completed_at)&&eventTime(e)<end).map(e=>({j,e}))).sort((a,b)=>eventTime(a.e)-eventTime(b.e));if(!viewed.length){uncertainUploadFrom(4);continue;}stages[4].users!++;
      if(viewed.some(v=>Math.abs(ms(v.e.occurred_at)-ms(v.e.received_at))>1000))uncertain++;
      const requested=viewed.filter(v=>(actionsByJob.get(v.j.id)||[]).some(a=>a.owner_id===u.id&&a.environment===q.environment&&ms(a.created_at)>=eventTime(v.e)&&ms(a.created_at)<end)||issuedFor(v.j).some(t=>t>=eventTime(v.e)&&t<end));if(requested.length)stages[5].users!++;else uncertainUploadFrom(5);
      const saved=requested.some(v=>issuedFor(v.j).some(t=>t>=eventTime(v.e)&&t<end));if(saved)stages[6].users!++;else uncertainUploadFrom(6);
      if(!saved&&requested.some(v=>(actionsByJob.get(v.j.id)||[]).some(a=>a.environment===q.environment&&a.owner_id===u.id&&a.state==='pending'&&ms(a.created_at)>=eventTime(v.e)&&ms(a.created_at)<end)))pendingUserSaves++;
    }
    for(let i=0;i<stages.length;i++){const st=stages[i];if(st.status==='unsupported_filters')continue;st.numerator=st.users;st.denominator=i?stages[i-1].users:fresh.length;st.conversion=st.denominator?st.users!/st.denominator:null;if(!fresh.length)st.status=current.eligible.some(u=>within(u.created_at,window))?'immature':'no_sample';if(i>=1&&missingCoverage){st.status=coverage.length?'incomplete':'not_collected';st.reason='注册后24小时的行为采集覆盖不足。';st.conversion=null;}if(unknownUploadStages.has(i)){st.status='incomplete';st.reason='注册观察窗内存在环境、账户分类或完成时间未知的上传，不能将其判为确定未上传。';st.conversion=null;}if(i>=5&&uncertain){st.status='incomplete';st.reason='先查看后保存的客户端顺序存在不确定样本。';st.conversion=null;}if(i===6&&pendingUserSaves){st.status='incomplete';st.reason='存在签发结果未确认的显式下载动作。';st.conversion=null;}}
    const successful=current.all.filter(j=>j.status==='completed'&&within(j.completed_at,window)&&ms(j.completed_at)+DAY<=asOf),viewed=successful.filter(j=>linkedEvents(j,'result_viewed').some(e=>eventTime(e)>=ms(j.completed_at)&&eventTime(e)<ms(j.completed_at)+DAY));
    const requested=viewed.filter(j=>linkedEvents(j,'result_viewed').some(e=>eventTime(e)>=ms(j.completed_at)&&eventTime(e)<ms(j.completed_at)+DAY&&((actionsByJob.get(j.id)||[]).some(a=>a.owner_id===j.owner_id&&a.environment===q.environment&&ms(a.created_at)>=eventTime(e)&&ms(a.created_at)<ms(j.completed_at)+DAY)||issuedFor(j).some(t=>t>=eventTime(e)&&t<ms(j.completed_at)+DAY))));
    const saved=requested.filter(j=>linkedEvents(j,'result_viewed').some(e=>eventTime(e)>=ms(j.completed_at)&&eventTime(e)<ms(j.completed_at)+DAY&&issuedFor(j).some(t=>t>=eventTime(e)&&t<ms(j.completed_at)+DAY)));
    const saveStatus=rateForJobs(current.all,window,current.ownerSet,'M13'),viewStatus=rateForJobs(current.all,window,current.ownerSet,'M11');
    const jobSteps:FunnelStep[]=[{key:'completed',users:successful.length},{key:'viewed',users:viewed.length},{key:'download_requested',users:requested.length},{key:'saved',users:saved.length}].map((s,i,array):FunnelStep=>{const state=i===3?saveStatus:i?viewStatus:null;const status=state?.status??(successful.length?'ready':viewStatus.status==='immature'?'immature':'no_sample');return {key:s.key,users:s.users,status,reason:state?.reason??(status==='immature'?'成功完成队列的24小时观察窗口尚未成熟。':null),numerator:s.users,denominator:i?array[i-1].users:successful.length,conversion:status==='ready'&&(i?array[i-1].users:successful.length)?s.users/(i?array[i-1].users:successful.length):null};});
    return {user_steps:stages,job_steps:jobSteps};
  }
  const statusCounts:Record<string,number>={queued:0,processing:0,completed:0,failed:0,cancelled:0},errors=new Map<string,number>();for(const j of filteredJobs){statusCounts[j.status]++;if(j.error_code)errors.set(j.error_code,(errors.get(j.error_code)||0)+1);}
  const backlogOwners=new Set(users.filter(u=>ms(u.created_at)<=asOf&&(q.cohort==='all'||q.cohort==='paid'&&knownPaid(u)||q.cohort==='unpaid'&&paymentHistoryKnown(u)&&!knownPaid(u)||!['all','paid','unpaid'].includes(q.cohort)&&current.ownerSet.has(u.id))).map(u=>u.id));
  const backlogJobs=allJobs.filter(j=>backlogOwners.has(j.owner_id)&&dimension(j));
  const currentQueued=backlogJobs.filter(j=>j.status==='queued'),currentProcessing=backlogJobs.filter(j=>j.status==='processing');
  const delays=clientEvents.filter(e=>within(e.received_at,window)).map(e=>Math.max(0,ms(e.received_at)-ms(e.occurred_at))),uncertainEvents=clientEvents.filter(e=>within(e.received_at,window)&&Math.abs(ms(e.received_at)-ms(e.occurred_at))>1000).length;
  const attempts=data.attempts.filter(a=>{const j=jobMap.get(a.job_id);return j&&current.ownerSet.has(j.owner_id)&&dimension(j)&&within(a.created_at,window);});
  const unknownCost=attempts.filter(a=>!a.actual_cost||a.actual_cost.evidence==='estimate').length;
  const issues:AnalyticsReport['operations']['issues']=[];
  if(currentQueued.length)issues.push({code:'CURRENT_QUEUED',severity:'info',count:currentQueued.length,message:'截至as_of符合当前维度与人群的排队任务，包含创建窗口之前的积压；任务状态柱状图仍只统计T内创建任务。'});
  if(currentProcessing.length)issues.push({code:'CURRENT_PROCESSING',severity:'info',count:currentProcessing.length,message:'截至as_of符合当前维度与人群的执行中任务，包含创建窗口之外的积压。'});
  if(!coverage.length)issues.push({code:'NOT_COLLECTED',severity:'warning',count:1,message:'此环境没有行为采集区间，历史行为不能回填零。'});
  else if(!covered(window.start,Math.min(window.end,asOf)))issues.push({code:'COVERAGE_GAP',severity:'warning',count:1,message:'所选期间存在采集缺口。'});
  if(data.quality.unresolved_downloads)issues.push({code:'DOWNLOAD_UNRESOLVED',severity:'warning',count:data.quality.unresolved_downloads,message:'下载签发结果未确认，保存行为统计可能不完整。'});
  if(uncertainEvents)issues.push({code:'CLIENT_TIME_UNCERTAIN',severity:'info',count:uncertainEvents,message:'浏览器事件按服务端接收时间归期，客户端顺序仅作观察。'});
  const paymentHistoryMissing=users.filter(u=>!paymentHistoryKnown(u)).length;
  if(!paymentHistoryComplete||paymentHistoryMissing)issues.push({code:'PAYMENT_HISTORY_INCOMPLETE',severity:'warning',count:paymentHistoryMissing||1,message:'存在环境未知的历史付款；不能据最早可见订单确认首付，未知成员也不归为确定未付费。'});
  if(!data.quality.history_complete)issues.push({code:'HISTORY_INCOMPLETE',severity:'warning',count:1,message:'任务历史不完整，首次成功、激活及生成留存受到左截断影响。'});
  const versionMissing=filteredJobs.filter(j=>j.model_id===null||j.adapter_version===null||j.prompt_id===null||j.prompt_version===null||j.tool_version===null).length;
  if(versionMissing)issues.push({code:'VERSION_COVERAGE_MISSING',severity:'warning',count:versionMissing,message:'部分任务缺少冻结模型、Prompt或工具版本，保持未知，不以当前版本补写历史。'});
  if(data.quality.cleanup_retrying)issues.push({code:'CLEANUP_RETRYING',severity:'warning',count:data.quality.cleanup_retrying,message:'对象清理存在重试任务。'});
  if(data.quality.finance_gaps&&financeAllowed)issues.push({code:'FINANCE_GAP',severity:'critical',count:data.quality.finance_gaps,message:'存在需要人工核查的入账或退款事实缺口；系统不会自动调账。'});
  if(unknownCost&&financeAllowed)issues.push({code:'UNKNOWN_COST',severity:'warning',count:unknownCost,message:'供应商费用尚未获得实际证据，估算不能当作零成本。'});
  const basePeriodCounts=new Map<string,number>();for(const j of allJobs)if(within(j.created_at,window))basePeriodCounts.set(j.owner_id,(basePeriodCounts.get(j.owner_id)||0)+1);
  const segment=(key:string,predicate:(user:AnalyticsUser)=>boolean)=>{const jobs=filteredJobs.filter(j=>{const owner=userMap.get(j.owner_id);return !!owner&&predicate(owner);});return {key,users:ids(jobs,j=>j.owner_id).size,jobs:jobs.length};};
  const segments=[segment('new',u=>within(u.created_at,window)),segment('returning',u=>ms(u.created_at)<window.start),segment('paid',u=>!!u.first_paid_at&&ms(u.first_paid_at)<=asOf),segment('unpaid',u=>paymentHistoryKnown(u)&&!knownPaid(u)),segment('payment_unknown',u=>!paymentHistoryKnown(u)&&!knownPaid(u)),segment('light',u=>(basePeriodCounts.get(u.id)||0)>=1&&(basePeriodCounts.get(u.id)||0)<=5),segment('heavy',u=>(basePeriodCounts.get(u.id)||0)>=6),{key:'zero',users:userRows.filter(u=>u.jobs===0).length,jobs:0}];
  const warnings=['任务状态与错误分布按所选创建窗口T统计；当前积压与最老排队时长按as_of注册人口及相同维度统计；新老/轻重人群仍采用T定义，已付费/未付费采用as_of已确认事实。','保存行为表示显式下载链接签发，不能证明文件写入相册或磁盘。','版本对比是观察性比较，不能由前后变化推断因果或统计显著。','版本趋势保留各版本实际活动bucket，空缺日期不冒充采集完整；最多2000个版本趋势点，超出需缩小时间或维度。版本趋势不提供注册及财务归因，发布时间只使用显式发布事实。','浏览器事件采用服务端接收时间，迟到或跨边界事件的实际发生时间可能不同。'];
  if(paymentHistoryMissing||!paymentHistoryComplete)warnings.push('历史付款存在未知环境事实，首付cohort不可确认；付费分群只列可确认成员，未知用户不默认为未付费。');
  if(downstream)warnings.push('注册与付款金额没有下游维度归因；相关指标标为不支持筛选。');
  if(refundStatus(window)!=='ready')warnings.push('退款发生事实采集覆盖晚于所选开始时间，退款金额仅代表可观测部分。');
  if(userRows.length>20)warnings.push('使用热力图仅显示期间用量最多的20名用户；其余用户可在用户表分页及个人钻取查看。');
  if(!financeAllowed)warnings.push('当前角色没有财务读取权限。');
  return {meta:{metric_version:VERSION,as_of:data.as_of,query:q,previous_window:{start:iso(previous.start),end:iso(previous.end)},coverage_start:coverageStart,warnings,cohort_definitions:{new:'注册时间位于所选期间',returning:'注册时间早于所选期间',paid:'as_of前有当前环境已确认付款事实；不据此宣称完整首付时间',unpaid:'付款历史完整，且as_of前没有当前环境实际付款事实',payment_unknown:'存在历史未知环境付款，不能确认属于已付费或未付费人群',light:'所选期间在所有工具共创建1–5个任务',heavy:'所选期间在所有工具共创建至少6个任务',zero:'所选结束前注册且符合筛选的用户，期间未创建任务'}},metrics,previous_metrics:previousMetrics,users:userRows,user_usage_ranking,tools,versions,trend,version_trends,version_releases,heatmap,distribution,retention,funnel,
    segments,
    finance:{status:financeAllowed?(downstream?'unsupported_filters':'ready'):'forbidden',currencies:currentCurrencies,unknown_cost_attempts:financeAllowed?unknownCost:0,estimated_cost_attempts:financeAllowed?attempts.filter(a=>a.actual_cost?.evidence==='estimate'||(!a.actual_cost&&a.estimated_cost)).length:0,budgets:financeAllowed?(data.budgets||[]).map(b=>({...b,scope:'global_current' as const})):[],costs:financeAllowed?attempts.map(a=>({attempt_id:a.id,job_id:a.job_id,user_id:jobMap.get(a.job_id)!.owner_id,provider:a.provider,model_id:a.model_id,adapter_version:a.adapter_version,created_at:a.created_at,state:a.state,currency:a.actual_cost?.currency??null,amount_minor:a.actual_cost?.amount_minor??null,evidence:a.actual_cost?.evidence??null,estimated_currency:a.estimated_cost?.currency??null,estimated_amount_minor:a.estimated_cost?.amount_minor??null})):[],refunds:financeAllowed&&!downstream?data.refunds.filter(r=>env(r)&&current.ownerSet.has(r.owner_id)&&within(r.occurred_at,window)).map(r=>({id:'refund_'+createHash('sha256').update(r.id).digest('hex').slice(0,24),order_id:r.order_id,user_id:r.owner_id,occurred_at:r.occurred_at,amount_minor:r.amount_minor,currency:r.currency,status:r.status})):[],orders:financeAllowed&&!downstream?data.orders.filter(o=>env(o)&&current.ownerSet.has(o.owner_id)&&(within(o.created_at,window)||within(o.paid_at,window))).map(o=>({id:o.id,user_id:o.owner_id,created_at:o.created_at,paid_at:o.paid_at,status:o.status,currency:o.currency,amount_minor:o.amount_minor})):[],ledger:financeAllowed?data.ledger.filter(l=>env(l)&&current.ownerSet.has(l.owner_id)&&within(l.created_at,window)&&(!downstream||!!l.reference_id&&!!jobMap.get(l.reference_id)&&dimension(jobMap.get(l.reference_id)!))).map(l=>({id:l.id,user_id:l.owner_id,kind:l.kind,available_delta:l.available_delta,reserved_delta:l.reserved_delta,created_at:l.created_at,job_id:l.reference_id})):[]},
    operations:{status_counts:statusCounts,error_counts:[...errors].map(([code,jobs])=>({code,jobs})).sort((a,b)=>b.jobs-a.jobs),oldest_queued_ms:currentQueued.length?Math.max(...currentQueued.map(j=>asOf-ms(j.created_at))):null,event_delay_p95_ms:quantile(delays,.95),uncertain_client_events:uncertainEvents,cleanup_pending:data.quality.cleanup_pending,cleanup_retrying:data.quality.cleanup_retrying,unresolved_downloads:data.quality.unresolved_downloads,finance_gaps:financeAllowed?data.quality.finance_gaps:0,issues},
    jobs:filteredJobs.map(j=>({id:j.id,user_id:j.owner_id,tool_id:j.tool_id,status:j.status,stage:j.stage,created_at:j.created_at,completed_at:j.completed_at,error_code:j.error_code,model_id:j.model_id,adapter_version:j.adapter_version,prompt_id:j.prompt_id,prompt_version:j.prompt_version,tool_version:j.tool_version}))};
}
