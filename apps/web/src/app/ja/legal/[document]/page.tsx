import { notFound } from 'next/navigation';
import { LegalPage } from '../../../../components/public-pages';

const legalTitles = { terms: '利用規約', privacy: 'プライバシーについて', 'commercial-disclosure': '事業者情報・返金について' };
type DocumentKey = keyof typeof legalTitles;
function isDocument(value: string): value is DocumentKey { return Object.prototype.hasOwnProperty.call(legalTitles, value); }
export const dynamicParams = false;
export function generateStaticParams() { return Object.keys(legalTitles).map((document) => ({ document })); }
export async function generateMetadata({ params }: { params: Promise<{ document: string }> }) {
  const { document } = await params;
  return { title: isDocument(document) ? legalTitles[document] : 'ページが見つかりません', robots: { index: false, follow: true } };
}
export default async function Page({ params }: { params: Promise<{ document: string }> }) {
  const { document } = await params;
  if (!isDocument(document)) notFound();
  return <LegalPage document={document} />;
}
