'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { exampleDetailHref, exampleEditorHref, presentationOf, type EffectExample } from '../lib/effect-examples';
import { Icon } from './ui';
import { ToolAvailability } from './tool-availability';

export function EffectComparison({ example, priority = false, initialMode = 'after' }: { example: EffectExample; priority?: boolean; initialMode?: 'compare' | 'after' }) {
  const [mode, setMode] = useState<'compare' | 'before' | 'after'>(initialMode);
  const id = useId();
  const style = presentationOf(example);
  return <div className="effect-comparison">
    <div className={`effect-compare-media mode-${mode}`} id={id}>
      {mode !== 'after' && <figure>{example.additionalInputs?.length ? <div className="effect-input-grid">{[{ src: example.before, label: '人物の写真' }, ...example.additionalInputs].map(input => <div key={input.src}><img src={input.src} width={880} height={880} alt={input.label} loading={priority ? 'eager' : 'lazy'} /><span>{input.label}</span></div>)}</div> : <img src={example.before} width={880} height={880} alt="編集前の同じ写真" loading={priority ? 'eager' : 'lazy'} />}<figcaption>{example.additionalInputs?.length ? '入力写真 · 2枚' : '元の写真'}</figcaption></figure>}
      {mode !== 'before' && <figure><img src={example.after} width={880} height={880} alt={`${style.name}の${example.provenance === 'imagegen' ? 'imagegenデモ作例' : '仕上がり例'}`} loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : 'auto'} /><figcaption>{example.provenance === 'imagegen' ? 'デモ作例' : '仕上がり例'} · {style.shortName}</figcaption></figure>}
    </div>
    <div className="effect-compare-controls" role="group" aria-label="写真の表示を切り替える">
      {([['before', '元の写真'], ['after', '仕上がり'], ['compare', '並べて比較']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={mode === value} aria-controls={id} onClick={() => setMode(value)}>{label}</button>)}
    </div>
  </div>;
}

export function ExampleNote({ examples }: { examples: EffectExample[] }) {
  if (!examples.length) return null;
  if (examples.some(example => example.provenance === 'imagegen')) return <p className="example-note">imagegenで作成したデモ作例です。実際の生成機能での仕上がりは確認中です。</p>;
  return <p className="example-note">{examples.some(example => example.scope === 'local-preview') && 'ローカル確認用 · '}実際の生成テストによる試作例です。写真によって仕上がりは異なります。</p>;
}

export function EffectCardComparison({ example }: { example: EffectExample }) {
  const inputs = [{ src: example.before, label: example.additionalInputs?.length ? '人物の写真' : '元の写真' }, ...(example.additionalInputs || [])];
  return <span className={`effect-card-comparison${inputs.length > 1 ? ' has-multiple-inputs' : ''}`} role="group" aria-label="元の写真と仕上がりを比較">
    {inputs.map(input => <span className="effect-card-panel" key={input.src}>
      <img src={input.src} alt={input.label} width={440} height={440} loading="lazy" />
      <span>{input.label}</span>
    </span>)}
    <span className="effect-card-panel effect-card-result">
      <img src={example.after} alt={`${presentationOf(example).name}の${example.provenance === 'imagegen' ? 'imagegenデモ作例' : '仕上がり例'}`} width={440} height={440} loading="lazy" />
      <span>仕上がり</span>
    </span>
  </span>;
}

export function EffectCards({ examples }: { examples: EffectExample[] }) {
  return <div className="effect-style-cards">{examples.map(example => {
    const style = presentationOf(example);
    return <Link key={`${example.toolId}:${example.id}`} className="effect-style-card" href={exampleDetailHref(example)}>
      <span className="effect-style-image"><EffectCardComparison example={example} /></span>
      {example.provenance === 'imagegen' && <span className="effect-demo-label">デモ作例</span>}
      <span className="effect-style-title">{style.name}<Icon name="arrow-right" size={18} /></span>
      <span className="effect-style-description">{style.description}</span>
    </Link>;
  })}</div>;
}

export function AvatarShowcase({ examples }: { examples: EffectExample[] }) {
  const [selected, setSelected] = useState(examples[0]?.id);
  const headingId = useId();
  useEffect(() => {
    const candidate = new URLSearchParams(window.location.search).get('example');
    const match = examples.find(example => example.id === candidate);
    if (match) setSelected(match.id);
  }, [examples]);
  const example = examples.find(item => item.id === selected) || examples[0];
  if (!example) return <section className="effect-no-examples"><Icon name="person" size={40} /><h2>好きな雰囲気から、アイコンづくり。</h2><p>アニメやちびキャラなど、スタイルを選んで編集の設定を確認できます。</p><p className="example-note">公開用の仕上がり例を準備しています。</p><Link className="button button-secondary" href="/ja/edit?tool=ai_avatar">編集画面を確認する<Icon name="arrow-right" size={18} /></Link></section>;
  const style = presentationOf(example);
  const parameter = style.parameter;
  function selectExample(item: EffectExample) {
    setSelected(item.id);
    const url = new URL(window.location.href);
    url.searchParams.set('example', item.id);
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }
  return <section className="avatar-showcase" aria-labelledby={headingId}>
    <div className="avatar-gallery">
      <EffectComparison example={example} priority />
      <div className="selected-style-copy" aria-live="polite"><h2 id={headingId}>{style.name}</h2><p>{style.description}</p></div>
      {examples.length > 1 && <div className="avatar-style-options" role="group" aria-label="仕上がりのスタイルを選ぶ">{examples.map(item => <button type="button" key={item.id} aria-pressed={selected === item.id} onClick={() => selectExample(item)}><img src={item.after} width={180} height={180} loading="lazy" alt="" /><span>{presentationOf(item).shortName}</span></button>)}</div>}
      <ExampleNote examples={examples} />
      {example.experimental && <p className="example-note">この例は実験時に返された複数画像のうちの一枚です。生成機能としての公開は準備中です。</p>}
    </div>
    <div className="avatar-edit-entry">
      <ToolAvailability toolId="ai_avatar" editorHref={exampleEditorHref(example.id)} selectionLabel={parameter ? style.name : undefined} />
      {!parameter && <p className="example-note">{style.name}は参考例です。このスタイルの設定は準備中のため、編集画面には引き継がれません。</p>}
      {parameter && <p className="example-note">選択したスタイルを編集画面に引き継ぎます。試作例と同じ仕上がりを保証するものではありません。</p>}
    </div>
  </section>;
}

export function ToolEffectShowcase({ example }: { example: EffectExample }) {
  const titleId = useId();
  const presentation = presentationOf(example);
  return <section className="avatar-showcase tool-effect-showcase" aria-labelledby={titleId}>
    <div className="avatar-gallery">
      <EffectComparison example={example} priority initialMode="compare" />
      <div className="selected-style-copy"><h2 id={titleId}>{presentation.name}</h2><p>{presentation.description}</p></div>
      <ExampleNote examples={[example]} />
      {example.capabilityNote && <p className="example-note">{example.capabilityNote}</p>}
    </div>
    <div className="avatar-edit-entry"><ToolAvailability toolId={example.toolId} /><p className="example-note">編集画面で、お好みの色や背景などの設定をご確認ください。</p></div>
  </section>;
}
