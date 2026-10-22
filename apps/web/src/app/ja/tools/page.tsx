import { ToolDirectory } from '../../../components/public-pages';
import { pageMetadata } from '../../../lib/seo';
import { getEffectExamples } from '../../../server/effect-examples';

export const metadata = pageMetadata('/ja/tools','AI写真編集機能一覧','背景変更、髪色、イラスト、ペットなど、写真を編集する機能を探せます。説明と注意点を確認し、希望する編集を選んでください。');
export default async function Page() { return <ToolDirectory examples={await getEffectExamples()} />; }
