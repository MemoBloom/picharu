import { notFound } from 'next/navigation';
import { ToolDetail } from '../../../../components/public-pages';
import { findPublicToolContent, publicToolContent } from '../../../../lib/tool-content';

export const dynamicParams = false;
export function generateStaticParams() { return publicToolContent.map((tool) => ({ toolId: tool.tool_id })); }
export async function generateMetadata({ params }: { params: Promise<{ toolId: string }> }) {
  const tool = findPublicToolContent((await params).toolId);
  if (!tool) notFound();
  return { title: tool.name_ja, description: tool.description };
}
export default async function Page({ params }: { params: Promise<{ toolId: string }> }) {
  const { toolId } = await params;
  if (!findPublicToolContent(toolId)) notFound();
  return <ToolDetail toolId={toolId} />;
}
