'use client';
import { useState,useEffect } from 'react';
import Link from 'next/link';
import { useAuth,getBrowserAuth } from '../lib/auth';
import { SeoContent } from '@picjp/contracts';

const messages:Record<string,string>={SEO_DATABASE_CONTENT_DISABLED:'当前网站仍使用Git内容。请先配置SEO_CONTENT_BACKEND=database并验证数据库读取，再发布。',SEO_FORBIDDEN:'当前账号尚未授予SEO运营权限。请由项目负责人通过数据库授权。',SEO_NOT_CONFIGURED:'SEO数据库尚未配置，请按接入指南配置并执行迁移。',SEO_UNAUTHORIZED:'请先登录管理员账号。',SEO_SELF_REVIEW:'作者不能审核自己的内容，请由另一位审核人操作。',SEO_REVISION_CONFLICT:'线上版本或草稿基线已变化。请载入当前线上内容，比较后另建草稿并重新审核。',SEO_UPSTREAM_UNAVAILABLE:'数据库不可用或SEO迁移未应用，请核对接入状态。'};
export function SeoAdmin(){
 const auth=useAuth();
 const [draftBase,setDraftBase]=useState<string|null>(null),[draftPath,setDraftPath]=useState('');const [data,setData]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[fixture,setFixture]=useState(false),[path,setPath]=useState('/ja/tools/remove_person'),[text,setText]=useState(''),[notice,setNotice]=useState('');
 async function request(route:string,body?:unknown){
  const client=getBrowserAuth();const session=await client?.auth.getSession();const token=session?.data.session?.access_token;const owner=session?.data.session?.user.id;if(!token)throw new Error('SEO_UNAUTHORIZED');
  const res=await fetch('/api/seo/admin/'+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});const payload=await res.json();if((await client?.auth.getSession())?.data.session?.user.id!==owner)throw new Error('SEO_UNAUTHORIZED');if(!res.ok)throw new Error(payload.error?.code||'SEO_UNAVAILABLE');return payload;
 }
 async function load(){setError('');try{setData(await request('overview'+(fixture?'?fixture=true':'')));}catch(e){setData(null);setError(e instanceof Error?e.message:'SEO_UNAVAILABLE');}}
 useEffect(()=>{setData(null);setText('');if(auth.ready&&auth.user)void load();},[auth.ready,auth.user?.id,fixture]);
 async function run(action:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await action();await load();}catch(e){setError(e instanceof Error?e.message:'SEO_UNAVAILABLE');}finally{setBusy(false);}}
 const expected=(p:string)=>data?.pages?.find((page:any)=>page.path===p)?.published_revision??null;
 if(!auth.ready)return <div className="container">正在确认登录状态…</div>;
 if(!auth.user)return <article className="container page-stack seo-admin"><h1>SEO运营</h1><p>此页面仅向授权成员提供数据和内容管理。</p><Link className="button" href="/ja/login?next=%2Fadmin%2Fseo">登录后继续</Link></article>;
 return <article className="container page-stack seo-admin"><h1>SEO运营与内容发布</h1><p>数据采集、内容审核和发布记录。搜索排名与产品效果需要真实数据和人工验收。</p>
  {error&&<p role="alert">{messages[error]||`操作未完成：${error}`}</p>}{notice&&<p role="status">{notice}</p>}
  <button className="button-secondary" onClick={()=>run(async()=>{})} disabled={busy}>刷新状态</button>
  {data&&data.actor_id===auth.user.id&&<>
   <p>权限：{data.role}。<strong>{data.is_fixture?'当前为测试数据，不代表真实流量':'当前为真实数据视图'}</strong></p>
   <label><input type="checkbox" checked={fixture} onChange={e=>setFixture(e.target.checked)}/>查看隔离测试数据</label>
   <section><h2>数据接入状态</h2>{data.ingestions.length===0?<p>尚无采集记录。未验证、未授权和没有搜索流量是不同状态，请先完成GSC/GA4接入。</p>:<ul>{data.ingestions.map((r:any)=><li key={r.id}>{r.source} / {r.day} / {r.grain}：{r.status}{r.error_code?`（${r.error_code}）`:''}</li>)}</ul>}<p>GA4数字Property ID：{data.ga4_property_configured?'已配置；仍需采集身份授权':'尚未配置'}</p></section>
   <section><h2>业务漏斗（已同意采集）</h2><p>仅覆盖同意测量的会话；下载统计为取得下载链接，不代表照片已写入设备。搜索词不与个人或精确收入关联。</p>{data.funnel?<><ul>{data.funnel.consented_sessions.map((r:any)=><li key={r.landing_path+r.source}>{r.landing_path} / {r.source}：同意会话 {r.session_count}</li>)}</ul><ul>{data.funnel.events.map((r:any)=><li key={r.path+r.name}>{r.path} / {r.name}：{r.event_count}</li>)}</ul><ul>{data.funnel.payments.map((r:any)=><li key={r.landing_path}>{r.landing_path}：支付订单{r.paid_orders}，总额¥{r.gross_jpy}，退款¥{r.refunded_jpy}，扣除退款/争议净额¥{r.net_jpy}</li>)}</ul><p>GA4传输队列：{data.funnel.outbox.map((r:any)=>`${r.delivery_state}: ${r.count}`).join('；')||'尚无事件'}。这不等于GA4已入报表。</p></>:<p>测试视图不混入真实业务漏斗。</p>}</section>
   <section><h2>关键词机会</h2><p>页面级、JP、{data.gsc_window?.from} 至 {data.gsc_window?.to}；点击/展示/位置在数据库聚合，不受明细展示上限影响。</p>{data.opportunities.length?<ul>{data.opportunities.map((r:any)=><li key={r.path}>{r.path}：展示{r.impressions}，点击{r.clicks}，CTR{(r.ctr*100).toFixed(1)}%，平均位置{r.position.toFixed(1)}。规则候选，非显著性结论。</li>)}</ul>:<p>尚无达到样本门槛的机会，不表示搜索量为零。</p>}</section>
   <section><h2>查询与排名明细</h2><p>{data.metrics_truncated?'明细已截断为最近5000条；不是完整关键词库。':'当前明细在展示上限内。'}以下仅显示前50条；GSC平均位置与固定条件SERP排名分开呈现。</p><div style={{overflowX:'auto'}}><table><thead><tr><th>来源/日期</th><th>查询/页面</th><th>设备/地区</th><th>指标</th></tr></thead><tbody>{data.metrics.filter((r:any)=>r.grain==='query_page').slice(0,50).map((r:any,i:number)=><tr key={i}><td>{r.source} / {r.day}</td><td>{r.dimensions.query}<br/>{r.dimensions.page}</td><td>{r.dimensions.device} / {r.dimensions.country}</td><td>{r.source==='gsc'?`展示 ${r.measures.impressions}，点击 ${r.measures.clicks}，平均位置 ${r.measures.position??'未知'}`:`观察排名 ${r.measures.rank??'范围内未观察到'}`}</td></tr>)}</tbody></table></div></section>
   <section><h2>创建内容版本</h2><p>先载入当前基线或从下方已有版本复制。编辑完整JSON后保存，提交并由另一位审核人批准。工具页索引需要真实样例证据。</p>
    <label className="field">路径<input value={path} onChange={e=>setPath(e.target.value)} maxLength={180}/></label>
    <button className="button-secondary" disabled={busy} onClick={()=>run(async()=>{const base=expected(path);const value=await request('baseline?path='+encodeURIComponent(path));setDraftBase(base);setDraftPath(value.content.path);setText(JSON.stringify(value.content,null,2));})}>载入 Git 基线（参考）</button>
    <button className="button-secondary" disabled={busy} onClick={()=>run(async()=>{const base=expected(path);const value=base?await request("revision?revision_id="+base):await request("baseline?path="+encodeURIComponent(path));setDraftBase(base);setDraftPath(value.content.path);setText(JSON.stringify(value.content,null,2));})}>载入当前线上内容</button><p>本次编辑基线：{draftBase||"Git基线/新页面"}。刷新报表不会自动变更这份草稿的基线。</p>
    <label className="field">内容JSON<textarea rows={18} value={text} onChange={e=>setText(e.target.value)} style={{width:'100%',fontFamily:'monospace'}}/></label>
    <button className="button" disabled={busy||!text} onClick={()=>run(async()=>{const content=SeoContent.parse(JSON.parse(text));await request('drafts',{content,expected_revision:content.path===draftPath?draftBase:null});setNotice('草稿已保存。请提交审核，发布前不会影响网站。');})}>保存草稿</button>
   </section>
   <section><h2>版本与审核</h2><p>展示最近{data.limits.revisions}个版本。线上指针与草稿分离；发布/回滚使用当前版本校验，避免覆盖他人修改。</p><ul>{data.revisions.map((r:any)=><li key={r.id} style={{marginBottom:24}}><strong>{r.content.title}</strong><p>{r.path} / {r.state} / {r.id} / 草稿基线：{r.base_revision||'Git基线'}{expected(r.path)===r.id?'（当前线上）':''}</p>
    <button className="button-secondary" disabled={busy} onClick={()=>{setPath(r.path);setDraftPath(r.path);setDraftBase(expected(r.path));setText(JSON.stringify(r.content,null,2));setNotice('已载入此版本，保存时将创建新草稿，不会改写旧版本。');}}>复制编辑</button>{(r.state==='draft'?['submit']:r.state==='submitted'?['approve']:r.state==='approved'?['publish']:expected(r.path)!==r.id?['rollback']:[]).map(action=><button key={action} className="button-secondary" disabled={busy||(action==='submit'?r.author_id!==auth.user?.id:action==='approve'?r.author_id===auth.user?.id||data.role==='editor':data.role==='editor'||!data.database_content_enabled)} onClick={()=>run(async()=>{await request('transitions',{revision_id:r.id,action,expected_revision:expected(r.path),operation_id:crypto.randomUUID()});setNotice('操作已记录；发布后请核对实际页面版本。');})}>{{submit:'提交审核',approve:'批准',publish:'发布',rollback:'回滚到此版本'}[action]}</button>)}</li>)}</ul></section>
   <section><h2>发布审计</h2><ul>{data.changes.map((c:any)=><li key={c.operation_id}>{c.created_at} / {c.path} / {c.action} / {c.previous_revision||'Git基线'} → {c.revision_id}</li>)}</ul></section>
  </>}
 </article>;
}
