import { HelpPage } from '../../../components/public-pages';
import { pageMetadata } from '../../../lib/seo';

export const metadata = pageMetadata('/ja/help','ヘルプとよくある質問','写真のアップロード、編集、クレジット、保存に関するよくある質問。利用できる機能や公開準備中の内容をご確認ください。');
export default function Page() { return <HelpPage />; }
