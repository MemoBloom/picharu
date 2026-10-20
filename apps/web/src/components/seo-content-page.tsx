import Link from 'next/link';
import { canonicalUrl, jsonLd } from '../lib/seo';
import { publicToolContent } from '../lib/tool-content';
import type { PublishedContent } from '../server/seo/content';
import { ToolAvailability } from './tool-availability';

export function SeoContentPage({ snapshot }: { snapshot: PublishedContent }) {
  const { content, revision } = snapshot;
  const tool = publicToolContent.find(item => content.path === `/ja/tools/${item.tool_id}`);
  const breadcrumbs = { '@context':'https://schema.org', '@type':'BreadcrumbList', itemListElement:[{ '@type':'ListItem',position:1,name:'picmoko',item:canonicalUrl('/ja') },{ '@type':'ListItem',position:2,name:content.kind==='guide'?'写真編集ガイド':'写真編集ツール',item:canonicalUrl(content.kind==='guide'?'/ja/guides':'/ja/tools') },{ '@type':'ListItem',position:3,name:content.h1,item:canonicalUrl(content.path) }] };
  return <article className="container page-stack seo-content" data-seo-revision={revision}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html:jsonLd(breadcrumbs) }} />
    <nav className="breadcrumb" aria-label="パンくずリスト"><Link href="/ja">ホーム</Link><span aria-hidden="true"> / </span><Link href={content.kind==='guide'?'/ja/guides':'/ja/tools'}>{content.kind==='guide'?'ガイド':'ツール一覧'}</Link></nav>
    <header className="page-heading"><h1>{content.h1}</h1><p>{content.lead}</p></header>
    <div className="tool-detail-layout"><div className="tool-detail-main">{content.sections.map(section=><section key={section.heading}><h2>{section.heading}</h2><p>{section.text}</p></section>)}
      {content.examples.map(example=><figure key={example.after}><div className="seo-example-pair"><div><p>編集前</p><img src={example.before} alt="編集前の評価用写真" width={600} height={600} loading="lazy"/></div><div><p>編集後</p><img src={example.after} alt="編集後の評価用写真" width={600} height={600} loading="lazy"/></div></div><figcaption>評価例：{example.model_profile_version}。仕上がりは写真により異なります。</figcaption></figure>)}
      <section><h2>よくある質問</h2>{content.faq.map(faq=><details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}</section>
    </div>{tool&&<ToolAvailability toolId={tool.tool_id}/>}</div>
    <section><h2>関連するツール</h2><ul>{content.related_tools.map(id=>{const related=publicToolContent.find(t=>t.tool_id===id);return related?<li key={id}><Link href={`/ja/tools/${id}`}>{related.name_ja}</Link></li>:null;})}</ul></section>
    <Link className="text-link" href="/ja/guides">写真編集の準備ガイドを見る</Link>
  </article>;
}
