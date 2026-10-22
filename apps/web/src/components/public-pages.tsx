'use client';

import Link from 'next/link';
import { useToolObservation } from './analytics-provider';
import Image from 'next/image';
import { useEffect, useId, useMemo, useState } from 'react';
import { api, errorMessage } from '../lib/api';
import type { Tool } from '../lib/types';
import { findPublicToolContent, publicToolContent, toolCategories, type PublicToolContent } from '../lib/tool-content';
import { Icon, Loading, Notice, PageHeading } from './ui';
import { EffectComparison, ExampleNote, EffectCards, EffectCardComparison } from './effect-showcase';
import type { EffectExample } from '../lib/effect-examples';

function useToolCatalog() {
  const [tools, setTools] = useState<Tool[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    api<{ tools: Tool[] }>('/api/tools', { authenticated: false, signal: controller.signal })
      .then((response) => setTools(response.tools))
      .catch((cause) => { if (!controller.signal.aborted) setError(errorMessage(cause)); });
    return () => controller.abort();
  }, [attempt]);
  return { tools, error, retry: () => setAttempt((value) => value + 1) };
}

const generalFaq = [
  { question: '無料で使えますか？', answer: 'ツールの説明はログインせずにご覧いただけます。生成にはログインと必要なクレジットが必要です。料金は公開中のプランと編集画面で確認できます。準備中のツールは、購入しても利用できません。' },
  { question: 'どのような写真に対応していますか？', answer: 'JPEG・PNG・WebPに対応しています。1枚20MBまで、最大2,400万画素です。HEICやアニメーション画像は現在対応していません。ご自身が利用する権利のある写真を選んでください。' },
  { question: '写真はどこから編集できますか？', answer: '「写真を編集する」からログインして、写真を選んでください。ツールの説明から、使いたい効果を選んで始めることもできます。生成できるツールは編集画面で確認できます。' },
  { question: '仕上がりは元の写真と同じ特徴を保てますか？', answer: 'AIによる編集では、人物の顔、文字、模様などが変わる場合があります。生成後は元画像と見比べて、用途に合っているかを確認してください。現在のツールは仕上がりの評価を進めている段階です。' },
];

function FaqList({ items }: { items: { question: string; answer: string }[] }) {
  return <div className="faq-list">{items.map((item) => <details key={item.question}>
    <summary>{item.question}<Icon name="chevron-down" size={18} /></summary>
    <p>{item.answer}</p>
  </details>)}</div>;
}

function ToolRow({ tool, live, checked, examples = [] }: { tool: PublicToolContent; live?: Tool; checked: boolean; examples?: EffectExample[] }) {
  const observed = useToolObservation(tool.tool_id, checked && live?.available === true);
  const example = examples.find(item => item.toolId === tool.tool_id);
  return <Link ref={observed.ref} onClick={observed.onSelect} className="tool-card visual-tool-card" href={`/ja/tools/${tool.tool_id}`}>
    <span className={`visual-tool-cover${example ? '' : ' awaiting-example'}`}>
      {example ? <EffectCardComparison example={example} /> : <><Icon name={tool.icon} size={40} /><span>仕上がり例は準備中</span></>}
    </span>
    <span className="tool-card-content">{example && <span className="effect-demo-label">{example.provenance === 'imagegen' ? 'デモ作例' : '試作例'}</span>}<span className="tool-card-title">{tool.name_ja}<Icon name="arrow-right" size={18} /></span><span className="tool-card-description">{tool.description}</span>
      {checked && <span className={`availability ${live?.available ? 'available' : ''}`}>{live?.available ? '利用できます' : '生成は準備中'}</span>}
    </span>
  </Link>;
}

function CategoryTabs({ selected, onChange, includeAll = false }: { selected: string; onChange: (value: string) => void; includeAll?: boolean }) {
  const categories = includeAll ? ['すべて', ...toolCategories] : [...toolCategories];
  return <div className="category-tabs" role="group" aria-label="ツールのカテゴリー">{categories.map((category) => <button
    type="button" key={category} aria-pressed={selected === category} className={selected === category ? 'selected' : ''} onClick={() => onChange(category)}>{category}</button>)}</div>;
}

export function HomePage({ examples = [] }: { examples?: EffectExample[] }) {
  const [category, setCategory] = useState<string>('人物・プロフィール');
  const { tools, error } = useToolCatalog();
  const featured = examples.find(example => example.toolId === 'ai_avatar') || examples[0];
  return <>
    <section className="hero container effect-home-hero">
      <div className="hero-copy"><h1>いつもの写真に、<br />新しいわたしらしさ。</h1><p><span className="hero-copy-phrase">仕上がりを見比べて、</span><span className="hero-copy-phrase">好きなスタイルを見つけよう。</span></p>
        <div className="hero-actions"><Link className="button" href={examples.length ? '#style-inspiration' : '/ja/tools/ai_avatar'}>スタイルを見てみる<Icon name="arrow-right" size={18} /></Link><Link className="text-link" href="/ja/tools">すべてのツール<Icon name="arrow-right" size={18} /></Link></div>
        <p className="hero-footnote">説明や作例は、ログインせずにご覧いただけます。</p>
      </div>
      <div className="hero-effect-preview">{featured ? <><EffectComparison example={featured} priority initialMode="compare" /><ExampleNote examples={[featured]} /></> : <figure className="hero-figure hero-source-figure"><Image src="/images/samples/cafe-woman-v1.webp" alt="カフェで頬に手を添える女性のサンプル原画像" width={1000} height={1000} preload sizes="(max-width: 700px) calc(100vw - 40px), 480px" /><figcaption><strong>サンプル原画像</strong><span>AIで作成した写真です。編集後の作例ではありません。</span></figcaption></figure>}</div>
    </section>
    {examples.length > 0 && <section className="container style-inspiration" id="style-inspiration"><div className="section-heading"><div><h2>写真から、広がる楽しみ。</h2><p>人物も、うちの子も、暮らしの一枚も。元の写真と仕上がりを、並べて見比べよう。</p></div><Link className="text-link" href="/ja/tools">ツールを見てみる<Icon name="arrow-right" size={18} /></Link></div><EffectCards examples={examples.slice(0, 6)} /><ExampleNote examples={examples} /></section>}
    <section className="container home-tools" aria-labelledby="tools-heading"><div className="section-heading"><div><h2 id="tools-heading">写真で、こんなことも。</h2><p>元の写真と仕上がりを、並べて比較。</p></div><Link className="text-link" href="/ja/tools">すべてのツール<Icon name="arrow-right" size={18} /></Link></div>
      <CategoryTabs selected={category} onChange={setCategory} />
      <div className="tool-grid visual-tool-grid">{publicToolContent.filter(tool => tool.category_ja === category).map(tool => <ToolRow key={tool.tool_id} tool={tool} live={tools?.find(item => item.tool_id === tool.tool_id)} checked={tools !== null} examples={examples} />)}</div>
      <p className="section-note">{error ? '利用状況を確認できませんでした。説明と作例は引き続きご覧いただけます。' : tools && !tools.some(tool => tool.available) ? '現在、生成機能は準備中です。説明と作例、編集画面をご覧いただけます。' : '利用できる効果とクレジット数は、編集画面でご確認ください。'}</p>
    </section>
    <section className="steps-band" aria-label="編集の流れ"><ol className="container steps-list">
      <li><span className="step-number">01</span><Icon name="wand" size={30} /><div><h3>仕上がりを選ぶ</h3><p>好きなスタイルや編集方法を見つけます。</p></div></li>
      <li><span className="step-number">02</span><Icon name="upload" size={30} /><div><h3>写真をアップロード</h3><p>ログインして、写真と生成前の費用を確認。</p></div></li>
      <li><span className="step-number">03</span><Icon name="download" size={30} /><div><h3>見比べて保存</h3><p>元の写真と仕上がりを確認して保存。</p></div></li>
    </ol></section>
    <section className="container home-faq"><h2>よくある質問</h2><FaqList items={generalFaq} /></section>
  </>;
}

export function ToolDirectory({ examples = [] }: { examples?: EffectExample[] }) {
  const [category, setCategory] = useState('すべて');
  const [query, setQuery] = useState('');
  const searchId = useId();
  const { tools, error, retry } = useToolCatalog();
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('category');
    if (value && toolCategories.some((category) => category === value)) setCategory(value);
  }, []);
  const filtered = useMemo(() => publicToolContent.filter((tool) => (category === 'すべて' || tool.category_ja === category) && [tool.name_ja, tool.name_zh, tool.description, tool.tool_id, tool.category_ja].join(' ').toLowerCase().includes(query.trim().toLowerCase())), [category, query]);
  return <div className="container page-stack"><PageHeading title="写真から、できること。" description="日常のひと工夫から、新しい表現まで。使ってみたいツールを見つけてください。" />
    <div className="directory-search"><label htmlFor={searchId}>ツールを探す</label><div className="search-field"><Icon name="search" size={20} /><input id={searchId} className="field" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="背景、髪色、イラスト…" autoComplete="off" /></div></div>
    <CategoryTabs selected={category} onChange={setCategory} includeAll />
    {error && <Notice>利用状況を確認できませんでした。説明は引き続きご覧いただけます。 <button type="button" className="text-button" onClick={retry}>再読み込み</button></Notice>}
    {tools && !tools.some((tool) => tool.available) && <Notice>生成機能は現在準備中です。ツールの説明はご覧いただけます。利用できる効果は、準備が整い次第この一覧に表示されます。</Notice>}
    <p className="muted" aria-live="polite">{filtered.length}件のツール</p>
    <div className="tool-grid visual-tool-grid">{filtered.map((tool) => <ToolRow key={tool.tool_id} tool={tool} live={tools?.find((item) => item.tool_id === tool.tool_id)} checked={tools !== null} examples={examples} />)}</div>
    {filtered.length === 0 && <div className="empty-state"><Icon name="search" size={32} /><h2>ツールが見つかりませんでした</h2><p>別の言葉で検索するか、カテゴリーを変更してみてください。</p><button type="button" className="button-secondary" onClick={() => { setQuery(''); setCategory('すべて'); }}>すべて表示する</button></div>}
    <p className="section-note">仕上がりは写真や選択した効果によって異なります。各ツールの説明と注意点を確認してからご利用ください。</p>
  </div>;
}

export function ToolDetail({ toolId }: { toolId: string }) {
  const content = findPublicToolContent(toolId)!;
  const { tools, error, retry } = useToolCatalog();
  const live = tools?.find((tool) => tool.tool_id === toolId);
  const related = publicToolContent.filter((tool) => tool.category_ja === content.category_ja && tool.tool_id !== toolId).slice(0, 4);
  return <div className="container page-stack"><PageHeading backHref="/ja/tools" backLabel="ツール一覧に戻る" title={content.name_ja} description={content.description} />
    <div className="tool-detail-layout"><div className="tool-detail-main"><div className="large-tool-icon"><Icon name={content.icon} size={48} /></div><h2>こんなふうに伝えてみる</h2><blockquote className="request-example">「{content.request_example}」</blockquote><p>{content.input_tip}</p><h2>使う前に知っておきたいこと</h2><p>{content.limitation}</p><p className="muted">AIの編集によって、指定していない細部も変わることがあります。元の写真を残し、仕上がりを確認してください。</p></div>
      <aside className="panel tool-detail-aside"><h2>このツールで編集</h2><p>{content.category_ja}</p>{!tools && !error && <Loading />}
        {error && <><Notice>{error}</Notice><button className="button-secondary" type="button" onClick={retry}>利用状況を再確認</button></>}
        {live?.available ? <><dl className="detail-facts"><div><dt>写真</dt><dd>{live.minimum_input_count === live.maximum_input_count ? `${live.minimum_input_count}枚` : `${live.minimum_input_count}〜${live.maximum_input_count}枚`}</dd></div>{live.output_options.qualities.map((quality) => <div key={quality}><dt>{quality === 'high' ? '高画質' : '標準画質'}</dt><dd>{live.credit_cost[quality] == null ? '未設定' : `${live.credit_cost[quality]}クレジット`}</dd></div>)}</dl><Link className="button" href={`/ja/edit?tool=${toolId}`}>写真を選んで始める<Icon name="arrow-right" size={18} /></Link><p className="section-note">ログインが必要です。生成前に費用を確認できます。</p></> : <><button className="button" type="button" disabled>{error ? '利用状況を確認できません' : !tools ? '利用状況を確認中' : '生成は準備中です'}</button><Link className="text-link" href={`/ja/edit?tool=${toolId}`}>編集画面を確認する<Icon name="arrow-right" size={18} /></Link></>}
        <p className="section-note">現在、仕上がりの評価を進めています。掲載の説明は効果の保証ではありません。</p>
      </aside>
    </div>
    <section><h2>よくある質問</h2><FaqList items={[content.faq, { question: 'クレジットはいつ使われますか？', answer: '生成を確定すると、必要なクレジットがいったん確保されます。料金や利用状況は編集画面で確認してください。' }]} /></section>
    <section><div className="section-heading"><h2>ほかの表現も見てみる</h2><Link className="text-link" href="/ja/tools">すべて見る<Icon name="arrow-right" size={18} /></Link></div><div className="tool-grid">{related.map((tool) => <ToolRow key={tool.tool_id} tool={tool} live={tools?.find((item) => item.tool_id === tool.tool_id)} checked={tools !== null} />)}</div></section>
  </div>;
}

export function HelpPage() {
  const sections = [
    { title: '写真のアップロード', items: [generalFaq[1], { question: '写真がアップロードできません。', answer: 'ファイル形式と容量を確認してください。HEICはJPEGやPNGに書き出してから選び直してください。アップロード後の確認に失敗した場合は、通信環境を確認して再試行してください。' }, { question: '写真は公開されますか？', answer: '現在、ほかの利用者に公開する機能はありません。処理には外部の保存・生成サービスが使われます。正式なプライバシー情報は公開準備中のため、機密情報を含む写真の利用はお控えください。' }] },
    { title: '編集と仕上がり', items: [generalFaq[3], { question: '生成は準備中と表示されます。', answer: 'そのツールは現在利用できません。ツールの説明や編集画面をご覧いただけますが、準備中の生成を購入で有効にすることはできません。' }, { question: '待機中の編集はキャンセルできますか？', answer: 'タスク画面で待機中のものはキャンセルできます。すでに処理が始まっている場合はキャンセルできません。画面を閉じるだけではキャンセルされません。' }] },
    { title: 'クレジットとお支払い', items: [generalFaq[0], { question: '支払ったのにクレジットが表示されません。', answer: '反映の確認に時間がかかる場合があります。支払い確認画面で状況を更新するか、アカウントの注文履歴を確認してください。確認中のまま同じ購入を繰り返さないでください。' }, { question: '返金の条件はどこで確認できますか？', answer: '返金に関する正式な条件は、事業者情報・返金についてのページで公示する予定です。現在は公開準備中です。' }] },
    { title: '保存・履歴', items: [{ question: 'ダウンロードのリンクが開けません。', answer: 'ダウンロードリンクには有効期限があります。タスク画面を開き直して、もう一度ダウンロードしてください。画像自体の保存期限が過ぎている場合は利用できません。' }, { question: '完成した写真を続けて編集できますか？', answer: '完成したタスクの「続けて編集」から、結果画像を新しい入力として使えます。新しい編集としてクレジットが必要です。画像が削除済み、または保存期限を過ぎていると続けられません。' }, { question: '写真を削除できません。', answer: '待機中・処理中のタスクで使われている写真は削除できません。待機中ならタスクをキャンセルし、処理中なら終了を待ってから削除してください。' }] },
  ];
  return <div className="container page-stack help-page"><PageHeading title="お手伝いできること" description="写真の準備から保存まで。気になることを、ここで確認できます。" /><nav className="help-topics" aria-label="ヘルプの項目">{sections.map((section, index) => <a className="button-secondary" href={`#help-${index}`} key={section.title}>{section.title}<Icon name="arrow-down" size={16} /></a>)}</nav>{sections.map((section, index) => <section className="help-section" id={`help-${index}`} key={section.title}><h2>{section.title}</h2><FaqList items={section.items} /></section>)}<section className="panel"><h2>解決しないときは</h2><p>正式な問い合わせ窓口は公開準備中です。エラーが表示された場合は、画面にあるリクエストIDを控えてください。パスワードや写真のダウンロードリンクを第三者に送らないでください。</p><Link className="text-link" href="/ja/account">アカウントを確認する<Icon name="arrow-right" size={18} /></Link></section></div>;
}

export const legalDocuments = {
  terms: { title: '利用規約', description: 'サービスのご利用条件について', topics: ['利用資格とアカウント', '写真の利用権限と禁止事項', 'AI生成物の取り扱い', 'サービスの提供条件と責任の範囲'] },
  privacy: { title: 'プライバシーについて', description: '写真と個人情報の取り扱いについて', topics: ['収集する情報と利用目的', '画像処理・保存を行う外部サービス', '画像の保存期間と削除', '国外での情報処理と問い合わせ窓口'] },
  'commercial-disclosure': { title: '事業者情報・返金について', description: '特定商取引法に基づく表記とお支払いについて', topics: ['販売事業者・責任者・所在地・連絡先', '料金と支払い方法・支払い時期', '提供時期と動作環境', 'キャンセル・返金の条件'] },
} as const;

export function LegalPage({ document }: { document: keyof typeof legalDocuments }) {
  const content = legalDocuments[document];
  return <div className="container page-stack legal-page"><PageHeading backHref="/ja/" backLabel="ホームに戻る" title={content.title} description={content.description} /><Notice>正式な内容は公開準備中です。このページは公開前の案内であり、正式な利用規約・プライバシーポリシー・事業者情報の公示ではありません。</Notice><section><h2>公開時にご案内する内容</h2><p>運営情報と実際のサービス条件の確認が完了した後、以下の内容を掲載します。</p><ul className="content-list">{content.topics.map((topic) => <li key={topic}>{topic}</li>)}</ul></section><p>運営主体、問い合わせ窓口、お支払いと返金の条件は現在未公示です。公開前に取引や情報の取り扱いに関する約束として、この案内を利用しないでください。</p><div className="action-row"><Link className="button-secondary" href="/ja/help">ヘルプを見る</Link><Link className="text-link" href="/ja/">ホームに戻る<Icon name="arrow-right" size={18} /></Link></div></div>;
}
