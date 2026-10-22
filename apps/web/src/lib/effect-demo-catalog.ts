import type { EffectExample } from './effect-examples';

// Synthetic before/after pairs commissioned for local website demonstrations, not production-model evidence.
// Full execution prompts, product evaluation evidence and private photos stay server-side.
type Demo = Pick<EffectExample, 'id' | 'toolId' | 'title' | 'shortName' | 'description' | 'additionalInputs' | 'capabilityNote'> & { asset: string; resultFile?: string };
const demos: Demo[] = [
  { id: 'soft-anime', toolId: 'ai_avatar', asset: 'cafe-woman-v1', title: 'やさしいアニメ', shortName: 'アニメ', description: 'いつもの一枚を、やわらかな手描きのアイコンに。' },
  { id: 'flower-garden', toolId: 'change_background', asset: 'background-person-v1', title: '花のある庭へ', shortName: '花の庭', description: 'いつもの街角から、花に囲まれた景色へ。' },
  { id: 'rose-brown', toolId: 'hair_color', asset: 'hair-color-brown-v1', title: 'ローズブラウン', shortName: '髪色', description: 'やわらかな髪色で、新しい雰囲気を見つける。' },
  { id: 'warm-watercolor', toolId: 'pet_illustration', asset: 'pet-cat-v1', title: 'うちの子を水彩に', shortName: '水彩', description: '大切な表情や模様を、水彩のやさしいタッチに。' },
  { id: 'warm-table-scene', toolId: 'product_background', asset: 'product-mug-v1', title: '暮らしになじむ商品写真', shortName: '商品背景', description: 'お気に入りの品を、ぬくもりのある場面に。' },
  { id: 'warm-japanese-natural', toolId: 'room_redesign', asset: 'room-living-v1', title: 'ぬくもりのある部屋', shortName: 'お部屋', description: '家具や布の雰囲気を変えて、理想の暮らしを想像。' },
  {"id":"warm-film","toolId":"photo_color_grade","asset":"color-grade-cafe-v1","title":"喫茶店のフィルムカラー","shortName":"フィルム","description":"やわらかな色と光で、いつもの一枚を心地よく。"},
  {"id":"autumn-park","toolId":"weather_season","asset":"season-park-v1","title":"秋色の散歩道","shortName":"秋の景色","description":"緑の公園に、秋のやさしい彩りを。"},
  {"id":"harbor-sunset","toolId":"light_time","asset":"time-harbor-v1","title":"夕暮れの港へ","shortName":"夕暮れ","description":"昼の港を、あたたかな夕暮れの表情に。"},
  {"id":"gentle-retouch","toolId":"natural_beauty","asset":"beauty-daylight-v1","title":"その人らしい、自然な肌へ","shortName":"自然な肌","description":"表情や肌の質感を大切に、印象を穏やかに。"},
  {"id":"soft-bob","toolId":"hairstyle","asset":"hair-style-long-v1","title":"すっきり、やわらかボブ","shortName":"ボブ","description":"長さを変えて、新しいシルエットをイメージ。"},
  {"id":"natural-studio","toolId":"professional_headshot","asset":"headshot-casual-v1","title":"自然体のプロフィール写真","shortName":"プロフィール","description":"日常の写真から、落ち着いた仕事用の一枚へ。"},
  {"id":"station-anime","toolId":"anime_photo","asset":"anime-street-v1","title":"写真を、アニメのワンシーンに","shortName":"アニメ風","description":"人物と景色を、一緒に描きなおす楽しさ。"},
  {"id":"botanical-ink","toolId":"illustration_photo","asset":"illustration-flowers-v1","title":"花のある暮らしを、線画に","shortName":"線画","description":"花や器のかたちを、繊細な線と淡い色で。"},
  {"id":"fullbody-chibi","toolId":"chibi_person","asset":"chibi-fullbody-v1","title":"全身まるごと、ちびキャラに","shortName":"ちびキャラ","description":"服や小物の特徴を残して、小さなキャラクターに。"},
  {"id":"shiba-shopkeeper","toolId":"pet_humanization","asset":"pet-dog-v1","title":"うちの子が、小さな店長に","shortName":"ペットの店長","description":"毛色や表情をヒントに、愛らしいキャラクターへ。"},
  {"id":"garden-composite","toolId":"multi_photo_composite","asset":"composite-person-v1","title":"二枚の写真を、一つの場面に","shortName":"二枚を合成","description":"人物の写真と場所の写真から、新しい一枚へ。","additionalInputs":[{"src":"/images/effects/v1/composite-garden-v1/before.webp","label":"背景の写真"}],"capabilityNote":"このデモはimagegenで2枚から作成しました。現在の提供モデルでの複数画像合成は準備中です。"},
  {"id":"coral-blouse","toolId":"clothing_recolor","asset":"clothing-blue-v1","title":"お気に入りの服を、違う色で","shortName":"服の色","description":"かたちはそのままに、やさしいコーラルをイメージ。"},
  {"id":"flat-sticker","toolId":"ai_avatar","asset":"cafe-woman-v1","title":"フラットステッカー","shortName":"フラットステッカー","description":"同じ写真を、異なる素材やタッチで表現したデモ作例です。","resultFile":"flat-sticker.webp"},
  {"id":"soft-3d","toolId":"ai_avatar","asset":"cafe-woman-v1","title":"まるい3Dキャラ","shortName":"まるい3Dキャラ","description":"同じ写真を、異なる素材やタッチで表現したデモ作例です。","resultFile":"soft-3d.webp"},
  {"id":"chibi","toolId":"ai_avatar","asset":"cafe-woman-v1","title":"ちびアイコン","shortName":"ちびアイコン","description":"同じ写真を、異なる素材やタッチで表現したデモ作例です。","resultFile":"chibi.webp"},
  {"id":"clay-felt","toolId":"ai_avatar","asset":"cafe-woman-v1","title":"クレイ・フェルト","shortName":"クレイ・フェルト","description":"同じ写真を、異なる素材やタッチで表現したデモ作例です。","resultFile":"clay-felt.webp"},
  {"id":"paper-cut","toolId":"ai_avatar","asset":"cafe-woman-v1","title":"ペーパークラフト","shortName":"ペーパークラフト","description":"同じ写真を、異なる素材やタッチで表現したデモ作例です。","resultFile":"paper-cut.webp"},
];

export const publishedEffectDemos: EffectExample[] = demos.map(({ asset, resultFile, ...example }) => ({
  ...example,
  before: asset === 'cafe-woman-v1' ? '/images/samples/cafe-woman-v1.webp' : `/images/effects/v1/${asset}/before.webp`,
  after: `/images/effects/v1/${asset}/${resultFile || 'after.webp'}`,
  scope: 'published', provenance: 'imagegen', recipeVersion: 'imagegen-demo-catalog-2026-10-22-v1', experimental: false,
}));
