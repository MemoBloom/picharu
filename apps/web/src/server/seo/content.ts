import { createHash } from 'node:crypto';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { SeoContent } from '@picjp/contracts';
import { publicToolContent } from '../../lib/tool-content';
import { isRetiredSeoPath } from '../../lib/seo';
import { guides } from '../../content/seo/guides';
import { launchCandidates } from '../../content/seo/launch-candidates';
import { seoIntents } from '../../content/seo/intent-map';
import { seoRpc } from './repository';

function contentRevision(content:SeoContent){return 'git-sha256-'+createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0,24);}
export type PublishedContent = { revision: string; content: SeoContent; source: 'git' | 'database' };
export function baselineContent(path: string): PublishedContent | null {
  const guide = guides.find(item => item.path === path);
  if (guide) {const content=SeoContent.parse(guide);return {revision:contentRevision(content),content,source:'git'};}
  const tool = publicToolContent.find(item => `/ja/tools/${item.tool_id}` === path);
  if (!tool) return null;
  const editorial=launchCandidates[tool.tool_id];
  const content = SeoContent.parse({
    path, kind: 'tool', title: `${tool.name_ja}AI｜写真編集ツール`, description: `${tool.description} 写真の選び方、指定方法、注意点をご案内します。生成機能の公開状況はページ内でご確認ください。`,
    h1: tool.name_ja, lead: tool.description,
    sections: [{ heading: '写真と希望を準備する', text: tool.input_tip }, { heading: 'こんなふうに伝えてみる', text: `「${tool.request_example}」` }, { heading: '仕上がりの確認と制限', text: tool.limitation }, { heading: '使い方と料金の確認', text: 'ログイン後に写真と仕上がりを選び、公開状況と必要なクレジットを確認してください。準備中の機能は生成できません。AIの編集では指定していない細部も変わるため、元の写真を残して比較してください。' }],
    faq: [tool.faq], keywords: [seoIntents.find(intent=>intent.tool_id===tool.tool_id)?.primary_keyword_ja||tool.name_ja], related_tools: publicToolContent.filter(other => other.category_ja === tool.category_ja && other.tool_id !== tool.tool_id).slice(0, 4).map(other => other.tool_id),
    ...editorial, indexable: false, examples: [], updated_at: editorial?'2026-10-21T00:00:00Z':'2026-10-20T00:00:00Z',
  });
  return { revision: contentRevision(content), content, source: 'git' };
}
const databaseContent=unstable_cache(async()=>{
 const rows=await seoRpc<PublishedContent[]>('seo_get_published',{p_path:null});
 return rows.map(row=>({revision:row.revision,content:SeoContent.parse(row.content),source:'database' as const}));
},['seo-published-content-v1'],{tags:['seo:content'],revalidate:300});
export const getPublishedContent = cache(async (path: string): Promise<PublishedContent | null> => {
 if(isRetiredSeoPath(path))return null;
 if(process.env.SEO_CONTENT_BACKEND==='database'){
  const published=(await databaseContent()).find(row=>row.content.path===path);
  if(published)return published;
 }
 return baselineContent(path);
});
export function contentPaths() { return [...publicToolContent.map(tool => `/ja/tools/${tool.tool_id}`), ...guides.map(guide => guide.path)]; }
export async function allPublishedContent(){
 const database=process.env.SEO_CONTENT_BACKEND==='database'?await databaseContent():[];
 const merged=new Map(contentPaths().map(path=>[path,baselineContent(path)!]));
 for(const snapshot of database)if(!isRetiredSeoPath(snapshot.content.path))merged.set(snapshot.content.path,snapshot);
 return [...merged.values()];
}
