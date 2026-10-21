import { notFound } from 'next/navigation';
import { SeoContentPage } from '../../../../components/seo-content-page';
import { guides } from '../../../../content/seo/guides';
import { pageMetadata } from '../../../../lib/seo';
import { getPublishedContent } from '../../../../server/seo/content';
export const revalidate=300;
export function generateStaticParams(){return guides.map(guide=>({slug:guide.path.split('/').at(-1)!}));}
export async function generateMetadata({params}:{params:Promise<{slug:string}>}){
 const snapshot=await getPublishedContent(`/ja/guides/${(await params).slug}`);if(!snapshot)notFound();
 return {...pageMetadata(snapshot.content.path,snapshot.content.title,snapshot.content.description,snapshot.content.indexable),other:{'seo-revision':snapshot.revision}};
}
export default async function Page({params}:{params:Promise<{slug:string}>}){
 const snapshot=await getPublishedContent(`/ja/guides/${(await params).slug}`);if(!snapshot)notFound();
 return <SeoContentPage snapshot={snapshot}/>;
}
