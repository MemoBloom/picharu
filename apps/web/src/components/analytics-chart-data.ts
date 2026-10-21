// Pure display grouping. Source totals remain the report's business facts.
type ToolTrend = {bucket:string;jobs:number;tools:Record<string,number>};
export type RankedBar={id:string;label:string;value:number;detail?:string;selectable?:boolean};
export const OTHER_TOOL_SERIES='__other_tools__';
export function toolUsageSeries(rows:ToolTrend[],names:ReadonlyMap<string,string>=new Map(),topN=8){
 const totals=new Map<string,number>();
 for(const row of rows)for(const [id,count] of Object.entries(row.tools))totals.set(id,(totals.get(id)??0)+count);
 const ranked=[...totals].sort(([a,av],[b,bv])=>bv-av||(a<b?-1:a>b?1:0));
 const limit=Math.max(1,Math.min(100,Math.floor(topN)||1));
 const top=ranked.slice(0,limit),remaining=ranked.slice(limit),topIds=new Set(top.map(([id])=>id));
 const series=top.map(([id,total])=>({id,label:names.get(id)??id,total,selectable:true}));
 if(remaining.length)series.push({id:OTHER_TOOL_SERIES,label:`其他（${remaining.length}个特效）`,total:remaining.reduce((sum,[,n])=>sum+n,0),selectable:false});
 const buckets=rows.map(row=>{const values=Object.fromEntries(top.map(([id])=>[id,row.tools[id]??0]));if(remaining.length)values[OTHER_TOOL_SERIES]=Object.entries(row.tools).reduce((sum,[id,count])=>sum+(topIds.has(id)?0:count),0);return {bucket:row.bucket,values,total:Object.values(values).reduce((sum,count)=>sum+count,0),source_total:row.jobs};});
 return {series,buckets,total:ranked.reduce((sum,[,count])=>sum+count,0),source_total:rows.reduce((sum,row)=>sum+row.jobs,0),inconsistent_buckets:buckets.filter(row=>row.total!==row.source_total).map(row=>row.bucket)};
}
export function toolRankingBars(rows:ToolTrend[],names:ReadonlyMap<string,string>=new Map(),topN=8):RankedBar[]{
 const data=toolUsageSeries(rows,names,topN);
 return data.series.map(row=>({id:row.id,label:row.label,value:row.total,selectable:row.selectable,detail:`${row.total}任务 · ${data.source_total?new Intl.NumberFormat('zh-CN',{maximumFractionDigits:1}).format(row.total/data.source_total*100)+'%':'无样本'}`}));
}
type UserRanking={top:{user_id:string;email_masked:string|null;jobs:number}[];other_jobs:number;other_users:number};
export function userRankingBars(ranking:UserRanking):RankedBar[]{
 const rows:RankedBar[]=ranking.top.map(user=>({id:user.user_id,label:user.email_masked??user.user_id.slice(0,8),value:user.jobs,detail:`${user.jobs}任务`}));
 if(ranking.other_users>0)rows.push({id:'__other_users__',label:`其他（${ranking.other_users}人）`,value:ranking.other_jobs,detail:`${ranking.other_users}人 · ${ranking.other_jobs}任务`,selectable:false});
 return rows;
}

export function releaseBucket(releasedAt:string,timezone:string,bucket:'hour'|'day'|'week'){
 const timestamp=Date.parse(releasedAt);if(!Number.isFinite(timestamp))return null;
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(timestamp));
 const get=(key:string)=>parts.find(part=>part.type===key)?.value??'';
 const day=`${get('year')}-${get('month')}-${get('day')}`;
 if(bucket==='day')return day;
 if(bucket==='week'){const monday=new Date(`${day}T00:00:00Z`);monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7));return monday.toISOString().slice(0,10);}
 const represented=Date.parse(`${day}T${get('hour')}:${get('minute')}:${get('second')}Z`),offset=Math.round((represented-Math.floor(timestamp/1000)*1000)/60000),absolute=Math.abs(offset);
 return `${day}T${get('hour')}:00${offset<0?'-':'+'}${String(Math.floor(absolute/60)).padStart(2,'0')}:${String(absolute%60).padStart(2,'0')}`;
}
type Release={released_at:string;scope:string};
export function releasePositions(releases:Release[],axis:string[],timezone:string,bucket:'hour'|'day'|'week'){
 return releases.map(release=>({...release,index:axis.indexOf(releaseBucket(release.released_at,timezone,bucket)??'')})).filter(release=>release.index>=0);
}
