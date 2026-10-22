import Link from 'next/link';
import { allPublishedContent } from '../../../server/seo/content';
import { pageMetadata } from '../../../lib/seo';
export const metadata=pageMetadata('/ja/guides','写真編集の準備ガイド','写真の選び方、編集したい内容の伝え方、仕上がり確認についてのガイドです。実際の機能の公開状況は各機能で確認してください。',false);
export const revalidate=300;
export default async function Page(){const guides=(await allPublishedContent()).filter(row=>row.content.kind==='guide').map(row=>row.content);return <article className="container page-stack"><h1>写真編集の準備ガイド</h1><p>編集を始める前に、写真の選び方や希望の伝え方を確認しましょう。</p>{guides.map(guide=><section key={guide.path}><h2><Link href={guide.path}>{guide.h1}</Link></h2><p>{guide.description}</p></section>)}<Link href="/ja/tools">機能一覧を確認する</Link></article>;}
