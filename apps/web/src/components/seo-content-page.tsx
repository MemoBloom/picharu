import Link from 'next/link';
import { canonicalUrl, jsonLd } from '../lib/seo';
import { publicToolContent } from '../lib/tool-content';
import { allPublishedContent,type PublishedContent } from '../server/seo/content';
import { relatedGuideLinks } from '../lib/seo-content-links';
import { ToolAvailability } from './tool-availability';
import { evidenceAsset } from '../server/seo/evidence';
import { AvatarShowcase, ToolEffectShowcase } from './effect-showcase';
import { getEffectExamples } from '../server/effect-examples';

export async function SeoContentPage({ snapshot }: { snapshot: PublishedContent }) {
  const { content, revision } = snapshot;
  const tool = publicToolContent.find(item => content.path === `/ja/tools/${item.tool_id}`);
  const examples = tool ? (await getEffectExamples()).filter(example => example.toolId === tool.tool_id) : [];
  const relatedGuides=tool?relatedGuideLinks(tool.tool_id,(await allPublishedContent()).map(row=>row.content)):[];
  const breadcrumbs = { '@context':'https://schema.org', '@type':'BreadcrumbList', itemListElement:[{ '@type':'ListItem',position:1,name:'picmoko',item:canonicalUrl('/ja') },{ '@type':'ListItem',position:2,name:content.kind==='guide'?'写真編集ガイド':'写真編集ツール',item:canonicalUrl(content.kind==='guide'?'/ja/guides':'/ja/tools') },{ '@type':'ListItem',position:3,name:content.h1,item:canonicalUrl(content.path) }] };
  return <article className={`container page-stack seo-content${tool?.tool_id==='ai_avatar'||examples.length?' avatar-detail-page':''}`} data-seo-revision={revision}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html:jsonLd(breadcrumbs) }} />
    <nav className="breadcrumb" aria-label="パンくずリスト"><Link href="/ja">ホーム</Link><span aria-hidden="true"> / </span><Link href={content.kind==='guide'?'/ja/guides':'/ja/tools'}>{content.kind==='guide'?'ガイド':'ツール一覧'}</Link></nav>
    <header className="page-heading"><h1>{content.h1}</h1><p>{content.lead}</p>{tool&&tool.tool_id!=='ai_avatar'&&!examples.length&&<Link className="button-secondary" style={{marginTop:16}} href={`/ja/edit?tool=${tool.tool_id}`}>このツールの編集画面を見る</Link>}</header>
    {tool?.tool_id==='ai_avatar'&&<><AvatarShowcase examples={examples}/><section className="avatar-how-it-works"><h2>アイコンづくりの流れ</h2><ol><li><span>01</span><h3>スタイルを選ぶ</h3><p>好みの雰囲気を選んで、編集画面へ。</p></li><li><span>02</span><h3>写真をアップロード</h3><p>ログイン後、写真と設定・費用を確認。</p></li><li><span>03</span><h3>仕上がりを確認</h3><p>生成後に元の写真と見比べて保存。</p></li></ol></section></>}
    {tool&&tool.tool_id!=='ai_avatar'&&examples[0]&&<ToolEffectShowcase example={examples[0]}/>}
    <div className="tool-detail-layout"><div className="tool-detail-main">{content.sections.map(section=><section key={section.heading}><h2>{section.heading}</h2><p>{section.text}</p></section>)}
      {content.examples.map(example=>{const before=evidenceAsset(example.before),after=evidenceAsset(example.after);return <figure key={`${example.before}:${example.after}:${example.model_profile_version}`}><div className="seo-example-pair"><div><p>編集前</p><img src={example.before} alt="編集前の評価用写真" width={before.width} height={before.height} loading="lazy"/></div><div><p>編集後</p><img src={example.after} alt="編集後の評価用写真" width={after.width} height={after.height} loading="lazy"/></div></div><figcaption>評価例：{example.model_profile_version}。仕上がりは写真により異なります。</figcaption></figure>;})}
      <section><h2>よくある質問</h2>{content.faq.map(faq=><details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}</section>
    </div>{tool&&tool.tool_id!=='ai_avatar'&&!examples.length&&<ToolAvailability toolId={tool.tool_id}/>}</div>
    <section><h2>関連するツール</h2><ul>{content.related_tools.map(id=>{const related=publicToolContent.find(t=>t.tool_id===id);return related?<li key={id}><Link href={`/ja/tools/${id}`}>{related.name_ja}</Link></li>:null;})}</ul></section>
    {relatedGuides.length>0&&<section><h2>編集の準備ガイド</h2><ul>{relatedGuides.map(guide=><li key={guide.path}><Link href={guide.path}>{guide.title}</Link></li>)}</ul></section>}
    <Link className="text-link" href="/ja/guides">写真編集の準備ガイドを見る</Link>
  </article>;
}
