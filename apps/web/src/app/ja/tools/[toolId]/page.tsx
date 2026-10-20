import { notFound } from 'next/navigation';
import { ToolDetail } from '../../../../components/public-pages';
import { findToolContent, publicToolContent } from '../../../../lib/tool-content';

export function generateStaticParams() { return publicToolContent.map((tool) => ({ toolId: tool.tool_id })); }
export async function generateMetadata({ params }: { params: Promise<{ toolId: string }> }) {
  const tool = findToolContent((await params).toolId);
  return tool ? { title: tool.name_ja, description: tool.description } : { title: 'ツールが見つかりません' };
}
export default async function Page({ params }: { params: Promise<{ toolId: string }> }) {
  const { toolId } = await params;
  if (!findToolContent(toolId)) notFound();
  return <ToolDetail toolId={toolId} />;
}
