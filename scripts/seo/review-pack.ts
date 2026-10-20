import { readFile,writeFile } from 'node:fs/promises';
import { basename,dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { ToolId } from '@picjp/contracts';
import { baselineContent,type PublishedContent } from '../../apps/web/src/server/seo/content';
import { seoIntents } from '../../apps/web/src/content/seo/intent-map';

const text=z.string().trim().min(1).max(4000);
const Review=z.object({status:z.literal('ai_draft_pending_owner_review'),candidates:z.array(z.object({
 tool_id:ToolId,revision:z.string().regex(/^git-sha256-[a-f0-9]{24}$/),title_zh:text,description_zh:text,h1_zh:text,lead_zh:text,
 sections:z.array(z.object({heading_zh:text,text_zh:text}).strict()),faq:z.array(z.object({question_zh:text,answer_zh:text}).strict()),evaluation_checks_zh:z.array(text).min(1),
}).strict()).min(1)}).strict();
const quote=(value:string)=>'> '+value.replace(/\n/g,'\n> ');
/** Reject stale translations before they can be mistaken for review of a changed page. */
export function renderReviewPacket(input:unknown,lookup:(path:string)=>PublishedContent|null=baselineContent){
 const review=Review.parse(input),expected=seoIntents.filter(r=>r.priority==='P1_candidate').map(r=>r.tool_id).sort(),actual=review.candidates.map(r=>r.tool_id).sort();
 if(JSON.stringify(expected)!==JSON.stringify(actual))throw new Error('SEO_REVIEW_SHORTLIST_MISMATCH');
 const lines=['# S1 首发候选中日对照审校包','','此文件由 `npm run seo:review:export` 从Git候选基线与中文审校稿生成；这里的指纹只对应Git基线，数据库已发布内容需按实际revision另行核对。中文为 AI 起草的对照材料，负责人尚未确认，不代表日语、效果或图片授权已通过。','',`这 ${review.candidates.length} 项来自既有 P1_candidate 意图目录，不是依据已取得的搜索量排名选出。20 工具仍是初期范围；其余页面继续保留当前说明与索引门槛。`,'','## 如何使用','','本对照覆盖内容快照里的标题、摘要、正文和FAQ。页首“查看这个工具的编辑页面”会保留当前工具跳转；它不表示生成已经开放，实际状态和积分仍在编辑页确认。页面模板和运行状态另做浏览器验收。','','先核对每页的内容版本，再逐段审阅功能承诺与中文意思。数据库模式会优先读取已发布版本，部署本分支不会自动覆盖它。若日文正文或证据变化，导出/检查会拒绝旧译稿，需更新对照后重新审阅。截图只能证明界面展示，不能证明模型效果。','','每个候选先准备有公开使用授权的原图和真实编辑结果；保存模型/配置版本、评估日期与记录引用。可优先核对常规与边界场景，按已有评价材料分批推进，由负责人判断是否足以首发；不能推广为所有照片均可用。不得为制作此材料重新发起未授权的收费模型调用。','','负责人需要确认：文案意思是否符合产品定位；画面是否展示真实能力；失败与限制是否说明清楚；样例是否有公开授权；实际公开状态、登录和积分是否与页面一致。请把结论写到 [人工审校记录](S1_OWNER_REVIEW.md)，不要直接改写本生成文件。记录审校人、日期、内容版本及证据位置后，仍须独立审核再决定索引。',''];
 for(const row of review.candidates){
  const snapshot=lookup('/ja/tools/'+row.tool_id);
  if(!snapshot||snapshot.revision!==row.revision)throw new Error('SEO_REVIEW_TRANSLATION_STALE:'+row.tool_id);
  const c=snapshot.content;
  if(c.sections.length!==row.sections.length||c.faq.length!==row.faq.length)throw new Error('SEO_REVIEW_TRANSLATION_SHAPE:'+row.tool_id);
  lines.push(`## ${row.tool_id}`, '',`路径：${c.path}；内容版本：${snapshot.revision}。当前可索引：${c.indexable?'是':'否'}；样例数：${c.examples.length}。`, '', '人工日语审校：待确认。效果评价：未通过本材料确认。图片公开授权：待确认。','');
  for(const [label,jp,zh]of [['页面标题',c.title,row.title_zh],['搜索摘要',c.description,row.description_zh],['主标题',c.h1,row.h1_zh],['首段',c.lead,row.lead_zh]])lines.push(`### ${label}`,'','日文：',quote(jp),'','中文对照：',quote(zh),'');
  c.sections.forEach((s,i)=>lines.push(`### 正文 ${i+1}：${s.heading}`,'',quote(s.text),'',`中文：${row.sections[i].heading_zh}`,quote(row.sections[i].text_zh),''));
  lines.push('### 常见问题','');c.faq.forEach((f,i)=>lines.push(`日文：${f.question}`,quote(f.answer),'',`中文：${row.faq[i].question_zh}`,quote(row.faq[i].answer_zh),''));
  lines.push('### 本页样例核对重点','',...row.evaluation_checks_zh.map(value=>'- [ ] '+value),'','### 人工结论（尚未填写）','','- 审校人/日期：待填写','- 对应内容版本：'+snapshot.revision,'- 原图/结果的授权及证据引用：待填写','- 模型/配置版本与真实效果结论：待填写','- 是否接受当前文案与限制：待判断','- 是否允许进入发布审核：待判断','');
 }
 return lines.join('\n')+'\n';
}
async function main(){
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),target=resolve(root,'docs/seo/S1_REVIEW_PACKET.md');
 const content=renderReviewPacket(JSON.parse(await readFile(resolve(root,'docs/seo/launch-review-zh.json'),'utf8')));
 if(process.argv.includes('--check')){if(await readFile(target,'utf8')!==content)throw new Error('SEO_REVIEW_PACKET_STALE');}
 else await writeFile(target,content);
 console.log(JSON.stringify({review_candidates:seoIntents.filter(row=>row.priority==='P1_candidate').length,status:'ai_draft_pending_owner_review',mode:process.argv.includes('--check')?'check':'export'}));
}
if(process.argv[1]&&basename(process.argv[1])==='review-pack.ts')main().catch(error=>{console.error((error as Error).message);process.exitCode=1;});
