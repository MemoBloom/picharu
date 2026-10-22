import { HomePage } from '../../components/public-pages';
import { canonicalUrl, jsonLd, pageMetadata } from '../../lib/seo';
import { getEffectExamples } from '../../server/effect-examples';

export const metadata = pageMetadata('/ja','AIで写真を編集・アレンジ','写真の背景、色味、人物やペットの表現を。picmokoで機能の説明と注意点を確認し、写真の新しい表情を探せます。');
export default async function Page() { return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd({'@context':'https://schema.org','@type':'WebSite',name:'picmoko',url:canonicalUrl('/ja'),inLanguage:'ja'})}}/><HomePage examples={await getEffectExamples()} /></>; }
