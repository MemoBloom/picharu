import type { EffectExample } from './effect-examples';

// Approved synthetic before/after pairs. These demonstrate imagegen, not the production model.
// Full execution prompts, product evaluation evidence and private photos stay server-side.
const demos = [
  { id: 'soft-anime', toolId: 'ai_avatar', asset: 'cafe-woman-v1', title: 'やさしいアニメ', shortName: 'アニメ', description: 'いつもの一枚を、やわらかな手描きのアイコンに。' },
  { id: 'flower-garden', toolId: 'change_background', asset: 'background-person-v1', title: '花のある庭へ', shortName: '花の庭', description: 'いつもの街角から、花に囲まれた景色へ。' },
  { id: 'rose-brown', toolId: 'hair_color', asset: 'hair-color-brown-v1', title: 'ローズブラウン', shortName: '髪色', description: 'やわらかな髪色で、新しい雰囲気を見つける。' },
  { id: 'warm-watercolor', toolId: 'pet_illustration', asset: 'pet-cat-v1', title: 'うちの子を水彩に', shortName: '水彩', description: '大切な表情や模様を、水彩のやさしいタッチに。' },
  { id: 'warm-table-scene', toolId: 'product_background', asset: 'product-mug-v1', title: '暮らしになじむ商品写真', shortName: '商品背景', description: 'お気に入りの品を、ぬくもりのある場面に。' },
  { id: 'warm-japanese-natural', toolId: 'room_redesign', asset: 'room-living-v1', title: 'ぬくもりのある部屋', shortName: 'お部屋', description: '家具や布の雰囲気を変えて、理想の暮らしを想像。' },
] satisfies (Pick<EffectExample, 'id' | 'toolId' | 'title' | 'shortName' | 'description'> & { asset: string })[];

export const publishedEffectDemos: EffectExample[] = demos.map(({ asset, ...example }) => ({
  ...example,
  before: asset === 'cafe-woman-v1' ? '/images/samples/cafe-woman-v1.webp' : `/images/effects/v1/${asset}/before.webp`,
  after: `/images/effects/v1/${asset}/after.webp`,
  scope: 'published', provenance: 'imagegen', recipeVersion: 'imagegen-demo-six-2026-10-21-v1', experimental: false,
}));
