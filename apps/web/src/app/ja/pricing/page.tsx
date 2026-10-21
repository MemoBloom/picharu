import { PricingPage } from '../../../components/account-pages';
import { pageMetadata } from '../../../lib/seo';
export const metadata=pageMetadata('/ja/pricing','料金とクレジット','現在公開されているクレジットプランと料金を確認できます。プランが未公開の間は購入できません。',false);
export default function Page() { return <PricingPage />; }
