// Public presentation metadata, never execution prompts or private image bytes.
export const avatarStyles = [
  { id: 'soft-anime', name: 'やさしいアニメ', shortName: 'アニメ', description: 'やわらかな線と色で、親しみやすい表情に。', parameter: 'anime' },
  { id: 'flat-sticker', name: 'ステッカー', shortName: 'ステッカー', description: 'くっきりした輪郭で、小さくても印象的に。' },
  { id: 'soft-3d', name: 'やわらか3D', shortName: '3D', description: '立体感のある、やわらかな表情。' },
  { id: 'chibi', name: 'ちびキャラ', shortName: 'ちびキャラ', description: '表情をぎゅっと、小さなキャラクターに。', parameter: 'chibi' },
  { id: 'clay-felt', name: 'フェルト', shortName: 'フェルト', description: 'ふんわりとした、手づくりのような質感。' },
  { id: 'paper-cut', name: '切り絵', shortName: '切り絵', description: '紙を重ねたような、奥行きのある表現。' },
] as const;

export type AvatarStyle = typeof avatarStyles[number];
export type EffectExample = {
  id: AvatarStyle['id'];
  toolId: 'ai_avatar';
  before: string;
  after: string;
  scope: 'local-preview' | 'published';
  recipeVersion: string;
  experimental: boolean;
};

export function avatarParameter(value?: string) {
  return value === 'anime' || value === 'chibi' ? value : undefined;
}

export function exampleEditorHref(id: string) {
  const style = avatarStyles.find(item => item.id === id);
  const parameter = style && 'parameter' in style ? style.parameter : undefined;
  return `/ja/edit?tool=ai_avatar${parameter ? `&style=${parameter}` : ''}`;
}

export function styleOf(example: EffectExample) {
  return avatarStyles.find(style => style.id === example.id)!;
}
