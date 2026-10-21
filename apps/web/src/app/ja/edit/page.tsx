export const metadata = { robots: { index: false, follow: false } };
import { EditorWorkspace } from '../../../components/editor-workspace';

export default async function EditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  return <EditorWorkspace initialTool={first(query.tool)} initialStyle={first(query.style)} parentJobId={first(query.parent_job_id)} retryJobId={first(query.retry_job_id)} />;
}
