import { notFound } from 'next/navigation';
import { SeoContentPage } from '../../../../components/seo-content-page';
import { pageMetadata } from '../../../../lib/seo';
import { publicToolContent, findPublicToolContent } from '../../../../lib/tool-content';
import { getPublishedContent } from '../../../../server/seo/content';

export const revalidate = 300;
export const dynamicParams = false;
export function generateStaticParams() { return publicToolContent.map((tool) => ({ toolId: tool.tool_id })); }
export async function generateMetadata({ params }: { params: Promise<{ toolId: string }> }) {
  const {toolId}=await params;
  if(!findPublicToolContent(toolId))notFound();
  const snapshot = await getPublishedContent(`/ja/tools/${toolId}`);
  if (!snapshot) notFound();
  return { ...pageMetadata(snapshot.content.path, snapshot.content.title, snapshot.content.description, snapshot.content.indexable), other: { 'seo-revision': snapshot.revision } };
}
export default async function Page({ params }: { params: Promise<{ toolId: string }> }) {
  const {toolId}=await params;
  if(!findPublicToolContent(toolId))notFound();
  const snapshot = await getPublishedContent(`/ja/tools/${toolId}`);
  if (!snapshot) notFound();
  return <SeoContentPage snapshot={snapshot} />;
}
