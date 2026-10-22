// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AvatarShowcase, EffectComparison, EffectCards, ToolEffectShowcase } from '../apps/web/src/components/effect-showcase';
import { avatarStyles, avatarParameter, exampleEditorHref, type EffectExample } from '../apps/web/src/lib/effect-examples';
import { publishedEffectDemos } from '../apps/web/src/lib/effect-demo-catalog';

vi.mock('next/link', () => ({ default: ({ children, ...props }: React.PropsWithChildren<{ href: string }>) => React.createElement('a', props, children) }));
vi.mock('../apps/web/src/components/tool-availability', () => ({ ToolAvailability: ({ editorHref, toolId }: { editorHref?: string; toolId: string }) => React.createElement('a', { href: editorHref || `/ja/edit?tool=${toolId}`, 'data-editor-entry': true }, '編集画面へ') }));
const examples: EffectExample[] = avatarStyles.map(style => ({ id: style.id, toolId: 'ai_avatar', before: '/before.webp', after: `/${style.id}.webp`, scope: 'local-preview', recipeVersion: 'test-v1', experimental: style.id === 'clay-felt' }));
let root: Root | undefined;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; document.body.innerHTML = ''; window.history.replaceState({}, '', '/'); });
async function render(element: React.ReactNode) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(element)); return host;
}
describe('Visual effect discovery interactions', () => {
  it('can compare the same original and result using buttons, without dragging or hover', async () => {
    const host = await render(React.createElement(EffectComparison, { example: examples[0] }));
    expect(host.querySelectorAll('figure')).toHaveLength(1);
    const compare = [...host.querySelectorAll('button')].find(button => button.textContent === '並べて比較')!;
    await act(async () => compare.click());
    expect(compare.getAttribute('aria-pressed')).toBe('true');
    expect([...host.querySelectorAll('figure img')].map(img => img.getAttribute('src'))).toEqual(['/before.webp', '/soft-anime.webp']);
    await act(async () => host.querySelector('button')!.click());
    expect(host.querySelector('figure img')?.getAttribute('src')).toBe('/before.webp');
  });
  it('opens a linked style and carries only supported parameters into editing', async () => {
    window.history.replaceState({}, '', '/ja/tools/ai_avatar?example=chibi');
    const host = await render(React.createElement(AvatarShowcase, { examples }));
    expect(host.querySelector('button[aria-pressed=true] img')?.getAttribute('src')).toBe('/chibi.webp');
    expect(host.querySelector('[data-editor-entry]')?.getAttribute('href')).toBe('/ja/edit?tool=ai_avatar&style=chibi');
    const felt = [...host.querySelectorAll<HTMLButtonElement>('.avatar-style-options button')].find(button => button.textContent === 'フェルト')!;
    await act(async () => felt.click());
    expect(window.location.search).toBe('?example=clay-felt');
    expect(host.querySelector('[data-editor-entry]')?.getAttribute('href')).toBe('/ja/edit?tool=ai_avatar');
    expect(host.textContent).toContain('編集画面には引き継がれません');
    expect(host.textContent).toContain('複数画像のうちの一枚');
  });
  it('handles missing and invalid samples without a broken image or a false generated result', async () => {
    window.history.replaceState({}, '', '/ja/tools/ai_avatar?example=unknown');
    const host = await render(React.createElement(AvatarShowcase, { examples: [] }));
    expect(host.querySelector('img')).toBeNull();
    expect(host.textContent).toContain('公開用の仕上がり例を準備');
  });
  it('rejects unsupported style inputs instead of inventing new contract enum values', () => {
    expect(avatarParameter('anime')).toBe('anime');
    expect(avatarParameter('chibi')).toBe('chibi');
    expect(avatarParameter('felt')).toBeUndefined();
    expect(exampleEditorHref('unknown')).toBe('/ja/edit?tool=ai_avatar');
    expect(exampleEditorHref('flat-sticker')).not.toContain('&style=');
  });
  it('links each approved demonstration to its own tool and actual original', async () => {
    const host = await render(React.createElement(EffectCards, { examples: publishedEffectDemos }));
    expect(host.querySelectorAll('a')).toHaveLength(23);
    for (const [index, example] of publishedEffectDemos.entries()) {
      const card = host.querySelectorAll('a')[index];
      expect(card.getAttribute('href')).toBe(`/ja/tools/${example.toolId}?example=${example.id}`);
      expect(card.querySelector('.effect-original-inset')?.getAttribute('src')).toBe(example.before);
      expect(card.textContent).toContain('デモ作例');
    }
  });
  it('compares a non-avatar demo without inventing an avatar style or hiding its source', async () => {
    const demo = publishedEffectDemos.find(example => example.toolId === 'hair_color')!;
    const host = await render(React.createElement(ToolEffectShowcase, { example: demo }));
    expect([...host.querySelectorAll('figure img')].map(image => image.getAttribute('src'))).toEqual([demo.before, demo.after]);
    expect(host.textContent).toContain('ローズブラウン');
    expect(host.textContent).toContain('imagegen');
    expect(host.querySelector('[data-editor-entry]')?.getAttribute('href')).toBe('/ja/edit?tool=hair_color');
    const before = [...host.querySelectorAll('button')].find(button => button.textContent === '元の写真')!;
    await act(async () => before.click());
    expect(host.querySelectorAll('figure')).toHaveLength(1);
    expect(host.querySelector('figure img')?.getAttribute('src')).toBe(demo.before);
  });
  it('shows both real inputs for a composite and does not imply production multi-image support', async () => {
    const demo = publishedEffectDemos.find(example => example.toolId === 'multi_photo_composite')!;
    const host = await render(React.createElement(ToolEffectShowcase, { example: demo }));
    expect([...host.querySelectorAll('figure img')].map(image => image.getAttribute('src'))).toEqual([demo.before, demo.additionalInputs![0].src, demo.after]);
    expect(host.textContent).toContain('入力写真 · 2枚');
    expect(host.textContent).toContain('複数画像合成は準備中');
    const before = [...host.querySelectorAll('button')].find(button => button.textContent === '元の写真')!;
    await act(async () => before.click());
    expect(host.querySelectorAll('figure img')).toHaveLength(2);
  });
});
