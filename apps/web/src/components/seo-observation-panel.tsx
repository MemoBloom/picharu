'use client';
import { useRef,useState } from 'react';
import type { z } from 'zod';
import type { SeoObservationRequest } from '@picjp/contracts';
type Request=z.infer<typeof SeoObservationRequest>;
export function SeoObservationPanel({data,busy,onCapture}:{data:any;busy:boolean;onCapture:(body:Request)=>Promise<void>}){
 const [operation,setOperation]=useState(''),[to,setTo]=useState(''),[decision,setDecision]=useState<Request['decision']>('insufficient'),[notes,setNotes]=useState('');
 const pending=useRef<{key:string;id:string}|null>(null);
 const plans=data.plans||[],observations=data.observations||[];
 const changes=(data.changes||[]).filter((c:any)=>c.action==='publish'&&plans.some((p:any)=>p.revision_id===c.revision_id));
 const selected=changes.find((c:any)=>c.operation_id===operation);
 async function capture(){
  if(!selected)return;
  const fields={revision_id:selected.revision_id,publish_operation_id:selected.operation_id,observation_to:to,decision,notes};
  const key=JSON.stringify(fields);if(pending.current?.key!==key)pending.current={key,id:crypto.randomUUID()};
  await onCapture({...fields,operation_id:pending.current!.id});
 }
 return <section className="seo-observation"><h2>内容变更观察与复盘</h2><p>计划随草稿固定保存。发布后的第一个 PT 日历日开始观察；窗口成熟、数据完整且曝光足够时，才允许记录“保留改动”。前后变化是观察结果，不能证明因果关系。</p>
  {plans.length===0?<p>当前视图尚无带观察计划的内容版本。可在创建草稿时附上计划。</p>:<ul>{plans.map((p:any)=><li key={p.revision_id}><strong>{p.plan.hypothesis}</strong><p>版本 {p.revision_id}；基线 {p.plan.baseline_from} 至 {p.plan.baseline_to}；观察 {p.plan.observation_days} 天。基线：{p.baseline_snapshot.ready?'数据完整':'待补数据'}。</p><details><summary>查看计划与基线证据</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(p,null,2)}</pre></details></li>)}</ul>}
  <div className="page-stack">
   <label className="field">发布记录<select aria-label="发布记录" value={operation} onChange={e=>setOperation(e.target.value)}><option value="">选择带计划的发布记录</option>{changes.map((c:any)=><option key={c.operation_id} value={c.operation_id}>{c.path} / {c.created_at} / {c.revision_id.slice(0,8)}</option>)}</select></label>
   <label className="field">观察截止日期（PT）<input type="date" value={to} onChange={e=>setTo(e.target.value)} max={data.health?.sources?.find((s:any)=>s.source==='gsc')?.to}/></label>
   <label className="field">复盘判断<select aria-label="复盘判断" value={decision} onChange={e=>setDecision(e.target.value as Request['decision'])}><option value="insufficient">数据不足</option><option value="extend">继续观察</option><option value="keep">保留改动</option><option value="rollback">建议回滚</option></select></label>
   <label className="field">判断依据<textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} minLength={10} maxLength={2000}/></label>
   <button className="button-secondary" disabled={busy||!selected||!to||notes.trim().length<10} onClick={capture}>保存复盘快照</button>
  </div><p>“建议回滚”保存理由；实际回滚仍在版本列表由审核人执行。同一份表单重复提交复用操作编号。</p>
  {observations.length===0?<p>尚无复盘记录。</p>:<ul>{observations.map((o:any)=><li key={o.id}><strong>{{keep:'保留改动',extend:'继续观察',rollback:'建议回滚',insufficient:'数据不足'}[o.report.decision as Request['decision']]}</strong> / {o.created_at}<p>{o.report.notes}</p><p>对照状态：{o.report.comparison_ready?'窗口与样本门槛已满足；仍非因果结论':'尚不具备完整对照条件'}；期间其他发布：{o.report.intervening_publish?'有':'无'}。</p><p>基线展示：{o.report.before.totals.impressions??'未知'}；观察展示：{o.report.after.totals.impressions??'未知'}。CTR变化：{o.report.delta?o.report.delta.ctr_points.toFixed(2)+' 个百分点':'暂不比较'}。</p><details><summary>查看不可变复盘证据</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(o.report,null,2)}</pre></details></li>)}</ul>}
 </section>;
}
const statuses:Record<string,string>={ready:'可用',empty:'成功采集、无数据',not_configured:'尚未配置',missing:'缺少日期',failed:'最新导入失败',stalled:'导入超时',waiting:'正在导入',stale:'数据过旧',limited:'数据受限'};
const alerts:Record<string,string>={CONFIGURATION_REQUIRED:'需要配置资源',NO_SUCCESSFUL_IMPORT:'尚无成功导入',MISSING_DAYS:'缺少成熟日期',LATEST_IMPORT_FAILED:'最近导入失败',IMPORT_STALLED:'导入等待过久',IMPORT_PENDING:'导入尚未结束',STALE_IMPORT:'需要重新采集',PARTIAL_RESULTS:'结果不完整',THRESHOLDED:'存在隐私阈值限制',OTHER_ROW_LOSS:'存在其他行损失'};
export function SeoHealthPanel({health}:{health:any}){
 if(!health)return null;
 return <section><h2>数据管线健康</h2><p role="status">{health.healthy?'近期成熟窗口可用':'数据尚不完整，请先处理以下接入或采集问题。'}{health.is_fixture?' 当前为隔离测试数据。':''}</p><ul>{health.sources.map((s:any)=><li key={s.source+s.grain}><strong>{s.source} / {s.grain}：{statuses[s.status]||s.status}</strong><p>{s.from} 至 {s.to}（{s.timezone}），成功 {s.successful_days}/{s.expected_days} 天。</p>{s.alerts.length>0&&<p>{s.alerts.map((a:any)=>alerts[a.code]||a.code).join('；')}</p>}{s.missing_days.length>0&&<details><summary>查看缺失日期</summary><p>{s.missing_days.join('、')}</p></details>}</li>)}</ul></section>;
}
