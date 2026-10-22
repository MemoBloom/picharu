import { ToolDirectory } from '../../../components/public-pages';
import { pageMetadata } from '../../../lib/seo';
import { getEffectExamples } from '../../../server/effect-examples';

export const metadata = pageMetadata('/ja/tools','AI写真編集ツール一覧','背景変更、髪色、イラスト、ペットなど、写真を編集するツールを探せます。説明と注意点を確認し、希望する編集を選んでください。');
export default async function Page() { return <ToolDirectory examples={await getEffectExamples()} />; }
