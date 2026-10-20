'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { EditRequest } from '@picjp/contracts';
import { ApiError, UserFacingError, api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { clearDraft, loadDraft, saveDraft } from '../lib/drafts';
import { findToolContent } from '../lib/tool-content';
import type { Credits, ImageAsset, Job, Tool } from '../lib/types';
import { ErrorNotice, Loading, Notice } from './ui';

type Role = EditRequest['inputs'][number]['role'];
type Photo = { key: string; imageId?: string; asset?: ImageAsset; role: Role; preview?: string; file?: File; ticket?: { upload_url: string; expires_at: string; required_headers: { 'Content-Type': string } }; putDone?: boolean; state: 'uploading' | 'ready' | 'error'; error?: string };
type Recommendations = { source: 'model' | 'fallback'; recommendations: { tool_id: string; prompt_id: string; name_ja: string; reason_code: string }[] };
const roles: Record<Role, string> = { primary: '編集する主画像', subject_reference: '被写体の参考', background_reference: '背景の参考', style_reference: '雰囲気の参考', identity_reference: '人物の参考' };
const fields: Record<string, string> = { target: '変更する対象', background: '希望する背景', strength: '変化の強さ', style: 'スタイル', weather: '天気', season: '季節', time: '時間帯', composition: '構図・組み合わせ方', color: '希望する色', hairstyle: '希望する髪型', outfit: '希望する服装', mode: '表現の方法', preserve: '残したいもの' };
const values: Record<string, string> = { subtle: '控えめ', balanced: 'バランス', strong: 'はっきり', natural: '自然', anime: 'アニメ', watercolor: '水彩', line_art: '線画', chibi: 'ちびキャラ', studio: 'スタジオ', cinematic: '映画風', sunny: '晴れ', rain: '雨', snow: '雪', cloudy: 'くもり', spring: '春', summer: '夏', autumn: '秋', winter: '冬', morning: '朝', day: '昼', sunset: '夕暮れ', night: '夜', costume: '動物の姿に服を着せる', human_character: '人のキャラクターにする' };
const qualities = { standard: '標準', high: '高品質' };

export function EditorWorkspace({ initialTool, parentJobId, retryJobId }: { initialTool?: string; parentJobId?: string; retryJobId?: string }) {
  const router = useRouter();
  const { user, ready, configured } = useAuth();
  const [tools, setTools] = useState<Tool[]>([]);
  const [toolId, setToolId] = useState(initialTool || 'illustration_photo');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const photosRef = useRef<Photo[]>([]);
  const [parameters, setParameters] = useState<Record<string, string>>({});
  const [instruction, setInstruction] = useState('');
  const [quality, setQuality] = useState<'standard' | 'high'>('standard');
  const [aspectRatio, setAspectRatio] = useState('preserve');
  const [parent, setParent] = useState<string | undefined>(undefined);
  const [credits, setCredits] = useState<Credits | null>(null);
  const [pending, setPending] = useState<EditRequest | undefined>();
  const [recommendation, setRecommendation] = useState<Recommendations | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [toolsLoading, setToolsLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recommending, setRecommending] = useState(false);
  const [draftWarning, setDraftWarning] = useState(false);
  const [restorationNote, setRestorationNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const picker = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const localUrls = useRef(new Set<string>());
  const cooldown = useRef(0);
  const owner = useRef(user?.id);
  const tool = tools.find((item) => item.tool_id === toolId);
  const content = findToolContent(toolId);
  const cost = tool?.credit_cost[quality] ?? null;
  const uploading = photos.some((photo) => photo.state === 'uploading');
  const locked = busy || restoring || uploading || cooldownUntil > Date.now();
  const intentQuery = new URLSearchParams({ tool: toolId, ...(parentJobId ? { parent_job_id: parentJobId } : {}), ...(retryJobId ? { retry_job_id: retryJobId } : {}) });
  const loginNext = `/ja/login?next=${encodeURIComponent(`/ja/edit${intentQuery.size ? `?${intentQuery}` : ''}`)}`;

  owner.current = user?.id;
  useEffect(() => { photosRef.current = photos; }, [photos]);
  useEffect(() => () => { localUrls.current.forEach((url) => URL.revokeObjectURL(url)); }, []);
  useEffect(() => {
    if (!cooldownUntil) return;
    const timer = setTimeout(() => setCooldownUntil(0), Math.max(0, cooldownUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [cooldownUntil]);
  function observeLimit(cause: unknown) {
    if (cause instanceof ApiError && cause.status === 429) { cooldown.current = Date.now() + (cause.retryAfter || 60) * 1000; setCooldownUntil(cooldown.current); }
  }

  async function fetchTools() {
    setToolsLoading(true);
    try {
      const data = await api<{ tools: Tool[] }>('/api/tools', { authenticated: false });
      setTools(data.tools);
      if (initialTool && !data.tools.some((item) => item.tool_id === initialTool)) { setToolId('illustration_photo'); setError(new UserFacingError('指定された編集方法が見つかりません。別の方法を選んでください。')); }
    } catch (cause) { setError(cause); }
    finally { setToolsLoading(false); }
  }
  useEffect(() => { void fetchTools(); }, []); // Public catalogue is fetched independently from authentication.

  useEffect(() => {
    let cancelled = false;
    if (!ready) return;
    setHydrated(false);
    setPhotos([]);
    setPending(undefined);
    setCredits(null);
    if (!user) { setHydrated(true); return; }
    const userId = user.id;
    setRestoring(true);
    const draft = loadDraft(userId);
    async function restore() {
      try {
        let inputs = draft?.inputs || [];
        let selectedTool = initialTool || draft?.toolId || 'illustration_photo';
        let selectedParent = draft?.parentJobId;
        const hasRouteIntent = Boolean(parentJobId || retryJobId);
        if (hasRouteIntent) {
          const job = await api<Job>(`/api/jobs/${encodeURIComponent(parentJobId || retryJobId!)}`);
          if (parentJobId) {
            if (job.status !== 'completed' || !job.result_image_id) throw new UserFacingError('この編集の仕上がりはまだ利用できません。履歴から状態を確認してください。');
            inputs = [{ image_id: job.result_image_id, role: 'primary' }];
            selectedParent = job.job_id;
          } else {
            inputs = job.inputs;
            selectedParent = job.parent_job_id || undefined;
          }
          selectedTool = initialTool || job.tool_id;
          if (!cancelled) setRestorationNote(parentJobId ? '前の仕上がりを主画像にしました。新しい編集内容と料金を確認してください。' : '前回の画像と編集方法を読み込みました。設定と料金をもう一度確認してください。');
        }
        const restored = await Promise.all(inputs.map(async (input) => {
          try {
            const asset = await api<ImageAsset>(`/api/images/${encodeURIComponent(input.image_id)}`);
            if (asset.status !== 'ready') throw new UserFacingError('画像のアップロードが完了していません。');
            return { key: input.image_id, imageId: input.image_id, asset, role: input.role, preview: asset.preview_url || undefined, state: 'ready' as const };
          } catch (cause) {
            return { key: input.image_id, imageId: input.image_id, role: input.role, state: 'error' as const, error: errorMessage(cause) };
          }
        }));
        if (cancelled) return;
        setPhotos(restored);
        setToolId(selectedTool);
        setParent(selectedParent);
        const keepSettings = Boolean(draft && !hasRouteIntent && (!initialTool || initialTool === draft.toolId));
        setParameters(keepSettings ? draft!.parameters : {});
        setInstruction(keepSettings ? draft!.instruction : '');
        setQuality(keepSettings ? draft!.quality : 'standard');
        setAspectRatio(keepSettings ? draft!.aspectRatio : 'preserve');
        setPending(keepSettings ? draft!.pendingRequest : undefined);
      } catch (cause) { if (!cancelled) setError(cause); }
      finally { if (!cancelled) { setRestoring(false); setHydrated(true); } }
    }
    void restore();
    void api<Credits>('/api/credits').then((data) => { if (!cancelled) setCredits(data); }).catch((cause) => { if (!cancelled) setError(cause); });
    return () => { cancelled = true; };
  }, [ready, user?.id, initialTool, parentJobId, retryJobId]);

  useEffect(() => {
    if (!user || !hydrated) return;
    const saved = saveDraft(user.id, { toolId, inputs: photos.filter((photo) => photo.state === 'ready' && photo.imageId).map((photo) => ({ image_id: photo.imageId!, role: photo.role })), parameters, instruction, quality, aspectRatio, parentJobId: parent, pendingRequest: pending });
    if (saved === false) setDraftWarning(true);
  }, [user?.id, hydrated, toolId, photos, parameters, instruction, quality, aspectRatio, parent, pending]);

  useEffect(() => {
    if (!tool || pending) return;
    if (tool.output_options.qualities.length && !tool.output_options.qualities.includes(quality)) setQuality(tool.output_options.qualities[0]);
    if (tool.output_options.aspect_ratios.length && !tool.output_options.aspect_ratios.includes(aspectRatio)) setAspectRatio(tool.output_options.aspect_ratios[0]);
  }, [tool, quality, aspectRatio, pending]);

  useEffect(() => {
    const element = dialog.current;
    if (confirming && element && !element.open) element.showModal();
    if (!confirming && element?.open) element.close();
  }, [confirming]);

  function change() { setPending(undefined); setError(null); }
  function chooseTool(nextId: string) { change(); setToolId(nextId); setParameters({}); }
  function updatePhoto(key: string, update: Partial<Photo>) { setPhotos((current) => current.map((photo) => photo.key === key ? { ...photo, ...update } : photo)); }
  async function refreshContext() {
    setError(null);
    await fetchTools();
    if (user) {
      try { setCredits(await api<Credits>('/api/credits')); }
      catch (cause) { observeLimit(cause); setError(cause); }
    }
  }

  async function upload(photo: Photo) {
    if (!photo.file) return;
    const uploadOwner = owner.current;
    if (!uploadOwner) return;
    updatePhoto(photo.key, { state: 'uploading', error: undefined });
    let ticket = photo.ticket;
    let imageId = photo.imageId;
    let putDone = photo.putDone;
    try {
      if (!putDone && (!ticket || new Date(ticket.expires_at).getTime() <= Date.now())) {
        const signed = await api<{ image_id: string; upload_url: string; expires_at: string; required_headers: { 'Content-Type': string } }>('/api/images/upload-url', { method: 'POST', body: { mime_type: photo.file.type, bytes: photo.file.size } });
        if (owner.current !== uploadOwner) return;
        ticket = signed;
        imageId = signed.image_id;
        updatePhoto(photo.key, { ticket, imageId });
      }
      if (!putDone) {
        const result = await fetch(ticket!.upload_url, { method: 'PUT', headers: { 'Content-Type': ticket!.required_headers['Content-Type'] }, body: photo.file, signal: AbortSignal.timeout(180000) });
        if (owner.current !== uploadOwner) return;
        if (!result.ok) throw new UserFacingError('写真を送信できませんでした。接続を確認して、もう一度お試しください。');
        putDone = true;
        updatePhoto(photo.key, { putDone: true });
      }
      const asset = await api<ImageAsset>('/api/images/complete', { method: 'POST', body: { image_id: imageId } });
      if (owner.current !== uploadOwner) return;
      updatePhoto(photo.key, { asset, imageId: asset.image_id, state: 'ready', error: undefined });
    } catch (cause) { if (owner.current === uploadOwner) { observeLimit(cause); updatePhoto(photo.key, { state: 'error', error: errorMessage(cause), ticket, imageId, putDone }); } }
  }

  async function addFiles(files: FileList | File[]) {
    if (!user || locked) return;
    const batchOwner = user.id;
    change();
    const maximum = Math.min(tool?.maximum_input_count || 4, 4);
    const list = Array.from(files);
    if (photosRef.current.length + list.length > maximum) { setError(new UserFacingError(`この編集では写真を${maximum}枚まで選べます。`)); return; }
    const invalid = list.find((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size <= 0 || file.size > 20 * 1024 * 1024);
    if (invalid) { setError(new UserFacingError('JPEG・PNG・WebPの写真を選んでください。1枚20MBまで対応しています。HEICや動画は利用できません。')); return; }
    const oldLength = photosRef.current.length;
    const next: Photo[] = list.map((file, index) => {
      const preview = URL.createObjectURL(file);
      localUrls.current.add(preview);
      return { key: crypto.randomUUID(), file, preview, state: 'uploading', role: oldLength + index === 0 ? 'primary' : ((tool?.allowed_roles.find((role) => role !== 'primary') || 'subject_reference') as Role) };
    });
    photosRef.current = [...photosRef.current, ...next];
    setPhotos(photosRef.current);
    setRecommendation(null);
    for (const photo of next) {
      if (owner.current !== batchOwner) break;
      if (cooldown.current > Date.now()) { updatePhoto(photo.key, { state: 'error', error: '少し時間をおいてから、アップロードを再試行してください。' }); continue; }
      await upload(photo);
    }
  }

  function removePhoto(key: string) {
    change();
    const index = photos.findIndex((photo) => photo.key === key);
    const next = photos.filter((photo) => photo.key !== key);
    if (index === 0) { if (next[0]) next[0] = { ...next[0], role: 'primary' }; setParent(undefined); setRecommendation(null); }
    photosRef.current = next;
    setPhotos(next);
  }

  function promotePhoto(key: string) {
    if (parent) return;
    change();
    setPhotos((current) => {
      const chosen = current.find((photo) => photo.key === key)!;
      return [{ ...chosen, role: 'primary' }, ...current.filter((photo) => photo.key !== key).map((photo) => ({ ...photo, role: photo.role === 'primary' ? 'subject_reference' as const : photo.role }))];
    });
    setRecommendation(null);
  }

  async function recommend() {
    if (!photos[0]?.imageId || photos[0].state !== 'ready') return;
    const imageId = photos[0].imageId;
    const requestOwner = owner.current;
    setRecommending(true);
    setError(null);
    try {
      const data = await api<Recommendations>('/api/recommend', { method: 'POST', body: { image_id: imageId, top_k: 5 } });
      if (owner.current === requestOwner && photosRef.current[0]?.imageId === imageId) setRecommendation(data);
    }
    catch (cause) { if (owner.current === requestOwner) { observeLimit(cause); setError(cause); } }
    finally { setRecommending(false); }
  }

  const incompatible = Boolean(tool && (photos.length > tool.maximum_input_count || photos.some((photo) => !tool.allowed_roles.includes(photo.role))));
  const needsTarget = (toolId === 'remove_person' || toolId === 'remove_object') && !parameters.target?.trim() && !instruction.trim();
  const enoughCredits = credits !== null && cost !== null && credits.available >= cost && credits.status === 'active';
  const canSubmit = Boolean(user && hydrated && tool?.available && !locked && photos.length >= tool.minimum_input_count && photos.every((photo) => photo.state === 'ready') && !incompatible && !needsTarget && enoughCredits);

  async function submit() {
    if (!tool || busy || !user) return;
    setBusy(true);
    setError(null);
    const request = pending || {
      tool_id: tool.tool_id,
      inputs: photos.map((photo) => ({ image_id: photo.imageId!, role: photo.role })),
      prompt_id: tool.prompt_id,
      parameters: Object.fromEntries(Object.entries(parameters).map(([key, value]) => [key, value.trim()]).filter(([, value]) => value.length > 0)),
      user_instruction: instruction,
      output: { quality, aspect_ratio: aspectRatio as EditRequest['output']['aspect_ratio'] },
      ...(parent ? { parent_job_id: parent } : {}),
      idempotency_key: `edit_${crypto.randomUUID()}`,
    } satisfies EditRequest;
    setPending(request);
    const stored = saveDraft(user.id, { toolId, inputs: request.inputs, parameters, instruction, quality, aspectRatio, parentJobId: parent, pendingRequest: request });
    if (stored === false) setDraftWarning(true);
    try {
      const accepted = await api<{ job_id: string }>('/api/edit', { method: 'POST', body: request });
      clearDraft(user.id);
      setConfirming(false);
      window.dispatchEvent(new Event('picjp:credits-changed'));
      router.push(`/ja/jobs/${accepted.job_id}`);
    } catch (cause) {
      observeLimit(cause);
      setError(cause);
      setConfirming(false);
      void api<Credits>('/api/credits').then(setCredits).catch(() => {});
    } finally { setBusy(false); }
  }

  return <div className="container section workspace-page">
    <nav className="breadcrumb" aria-label="パンくず"><Link href="/ja/">ホーム</Link><span aria-hidden="true">/</span><span>写真を編集</span></nav>
    <div className="editor-grid">
      <section className="editor-canvas" aria-labelledby="editor-title">
        <div className="stack"><h1 id="editor-title">写真に、ちょうどいい変化を。</h1><p className="muted">好きな写真を、かんたんな設定でさまざまな表現に。日常の一枚を、もっと特別にしてみませんか。</p></div>
        {restorationNote && <Notice>{restorationNote}</Notice>}
        {restoring && <Loading label="編集内容を読み込んでいます…" />}
        <figure className="editor-photo">
          <img src={photos[0]?.preview || '/images/editorial-cat.png'} alt={photos[0]?.preview ? '編集する主画像のプレビュー' : '窓辺に座る猫のイメージ写真'} onLoad={(event) => { event.currentTarget.style.visibility = 'visible'; }} onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }} />
          <figcaption className="photo-caption">{photos.length ? photos[0].state === 'ready' ? '編集する写真' : photos[0].state === 'uploading' ? 'アップロード中…' : 'アップロードを確認してください' : 'イメージ写真 · 編集にはご自身の写真を選択'}</figcaption>
        </figure>
        <div className="upload-zone" onDragOver={(event) => { event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); if (user) void addFiles(event.dataTransfer.files); }}>
          <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(event) => { if (event.target.files) void addFiles(event.target.files); event.target.value = ''; }} />
          {user ? <button className="button button-secondary" disabled={locked || photos.length >= Math.min(tool?.maximum_input_count || 4, 4)} onClick={() => picker.current?.click()}><span aria-hidden="true">＋</span> {photos.length ? '参考の写真を追加' : '写真を選ぶ'}</button> : <Link className="button button-secondary" href={loginNext}>ログインして写真を選ぶ</Link>}
          <p className="small muted">JPEG・PNG・WebP / 1枚20MBまで</p>
          <p className="small muted">写真はこのブラウザーから選んでアップロードします。</p>
        </div>
        {photos.length > 0 && <div className="reference-list" aria-label="選んだ写真">{photos.map((photo, index) => <article className="reference-item" key={photo.key}>
          <div className="reference-thumb">{photo.preview && <img src={photo.preview} alt={`写真${index + 1}`} />}</div>
          <div className="stack"><strong>{index === 0 ? '主画像' : `参考画像 ${index}`}</strong>
            {index > 0 && <label className="field"><span className="sr-only">参考画像 {index} の役割</span><select value={photo.role} disabled={locked} onChange={(event) => { change(); updatePhoto(photo.key, { role: event.target.value as Role }); }}>{(tool?.allowed_roles || Object.keys(roles) as Role[]).filter((role) => role !== 'primary').map((role) => <option value={role} key={role}>{roles[role]}</option>)}</select></label>}
            <span className="small" role="status">{photo.state === 'ready' ? 'アップロード済み' : photo.state === 'uploading' ? 'アップロード中…' : photo.error}</span>
            <div className="button-row">{photo.state === 'error' && photo.file && <button className="text-button" disabled={locked} onClick={() => void upload(photo)}>再試行</button>}{index > 0 && !parent && <button className="text-button" disabled={locked} onClick={() => promotePhoto(photo.key)}>主画像にする</button>}<button className="text-button" disabled={locked} onClick={() => removePhoto(photo.key)}>この編集から外す</button></div>
          </div>
        </article>)}</div>}
        {photos.length > 0 && <p className="small muted">外した写真は、この編集の対象から外れます。保存済み画像の削除ではありません。<Link href="/ja/legal/privacy">写真の取り扱い</Link></p>}
        {photos[0]?.state === 'ready' && <section className="panel stack"><div className="section-heading"><h2>ほかの表現も探す</h2><button className="text-button" disabled={recommending || locked} onClick={() => void recommend()}>{recommending ? '確認中…' : '編集候補を見る'}</button></div>
          {!recommendation && <p className="small muted">アップロードした写真から、利用できる編集候補を確認できます。</p>}
          {recommendation && <><p className="small muted">{recommendation.source === 'fallback' ? 'おすすめ解析は利用できないため、利用可能な編集方法を表示します。' : '写真に合いそうな編集候補です。仕上がりを保証するものではありません。'}</p>{recommendation.recommendations.length ? <div className="button-row">{recommendation.recommendations.map((item) => <button className="button button-secondary" key={item.prompt_id} disabled={locked} onClick={() => chooseTool(item.tool_id)}>{item.name_ja}</button>)}</div> : <p>現在表示できる候補がありません。右側の一覧から編集方法をご覧ください。</p>}</>}
        </section>}
      </section>

      <aside className="editor-inspector surface stack" aria-labelledby="settings-title">
        <div><h2 id="settings-title">どんな写真にしますか？</h2><p className="small muted">写真に合わせて、好きな編集方法やスタイルを選んでください。</p></div>
        {toolsLoading ? <Loading label="編集方法を読み込んでいます…" /> : <label className="field"><span>編集する内容</span><select className="tool-select" value={toolId} disabled={locked} onChange={(event) => chooseTool(event.target.value)}>{tools.map((item) => <option key={item.tool_id} value={item.tool_id}>{item.name_ja}{!item.available ? '（準備中）' : ''}</option>)}</select></label>}
        {tool && <><p className="small muted">{content?.input_tip || `${tool.minimum_input_count}〜${tool.maximum_input_count}枚の写真を選んでください。`}</p>
          {tool.parameter_fields.map((field) => <label className="field" key={`${tool.tool_id}_${field.name}`}><span>{fields[field.name] || field.name}<span className="muted">{field.required ? '（必須）' : '（任意）'}</span></span>{field.type === 'enum' ? <select value={parameters[field.name] || ''} disabled={locked} onChange={(event) => { change(); setParameters((current) => ({ ...current, [field.name]: event.target.value })); }}><option value="">指定しない</option>{field.values?.map((value) => <option value={value} key={value}>{values[value] || value}</option>)}</select> : <input value={parameters[field.name] || ''} maxLength={500} disabled={locked} placeholder={field.name === 'target' ? '例：右奥に写っている赤い服の人' : undefined} onChange={(event) => { change(); setParameters((current) => ({ ...current, [field.name]: event.target.value })); }} />}</label>)}
          <label className="field"><span>追加のリクエスト<span className="muted">（任意）</span></span><textarea rows={4} maxLength={1000} disabled={locked} value={instruction} placeholder={content?.request_example || '残したい特徴や、ご希望があれば入力してください。'} onChange={(event) => { change(); setInstruction(event.target.value); }} /><span className="small muted character-count">{instruction.length}/1000</span></label>
          <div className="field-grid"><label className="field"><span>画質</span><select disabled={locked || !tool.available} value={quality} onChange={(event) => { change(); setQuality(event.target.value as 'standard' | 'high'); }}>{tool.output_options.qualities.length ? tool.output_options.qualities.map((value) => <option value={value} key={value}>{qualities[value]}</option>) : <option value="standard">公開後に選択できます</option>}</select></label><label className="field"><span>画像の比率</span><select disabled={locked || !tool.available} value={aspectRatio} onChange={(event) => { change(); setAspectRatio(event.target.value); }}>{tool.output_options.aspect_ratios.length ? tool.output_options.aspect_ratios.map((value) => <option value={value} key={value}>{value === 'preserve' ? '元の比率' : value}</option>) : <option value="preserve">元の比率</option>}</select></label></div>
          {incompatible && <Notice tone="error">選んだ編集方法では、この枚数や参考画像の役割を使えません。画像を外すか、役割を選び直してください。</Notice>}
          {needsTarget && photos.length > 0 && <Notice>消したい対象の位置や特徴を、対象欄またはリクエスト欄に入力してください。</Notice>}
          {!tool.available && <Notice>ただいま準備中です。写真の編集は公開後にご利用いただけます。</Notice>}
          {tool.available && <div className="credit-summary"><span>この編集に必要なクレジット</span><strong>{cost === null ? '未設定' : `${cost}クレジット`}</strong>{user && <span className="small muted">利用可能：{credits ? `${credits.available}クレジット` : '確認中'}</span>}</div>}
          {credits?.status === 'restricted' && <Notice tone="error">このアカウントでは現在、新しい編集を開始できません。<Link href="/ja/help">ヘルプを見る</Link></Notice>}
          {tool.available && credits && cost !== null && credits.available < cost && <Notice>クレジットが不足しています。編集内容を保存してから<Link href="/ja/pricing">クレジットを購入</Link>できます。</Notice>}
          {tool.minimum_input_count > photos.length && <p className="small muted">この編集には、最低{tool.minimum_input_count}枚の写真が必要です。</p>}
        </>}
        {!!error && <ErrorNotice error={error} onRetry={cooldownUntil > Date.now() || locked ? undefined : () => void refreshContext()} />}
        {cooldownUntil > Date.now() && <Notice>操作が続いているため、少しお待ちください。再試行できるようになるとボタンが有効になります。</Notice>}
        {draftWarning && <Notice>このブラウザーでは一時保存ができません。通信エラー後はこのページを閉じず、同じ内容で再試行してください。</Notice>}
        {!user && ready && <p className="small muted">写真をアップロードするにはログインしてください。{!configured && 'ログイン機能は現在準備中です。編集方法と設定をご覧いただけます。'}</p>}
        {pending && <Notice>前回の送信結果をまだ確認できていません。同じ内容で再試行すると、同じ依頼として確認します。設定を変える前に<Link href="/ja/history">履歴</Link>もご確認ください。</Notice>}
        <button className="button editor-submit" disabled={!pending && !canSubmit || busy || locked && !busy} onClick={() => setConfirming(true)}>{busy ? '送信しています…' : pending ? '同じ依頼を確認・再試行' : !tool?.available ? '編集機能を準備中' : '確認して編集する'}</button>
        <p className="small muted">仕上がりは写真によって異なります。現在、各編集方法の品質を評価しています。</p>
      </aside>
    </div>
    <ol className="steps"><li><span>1</span><div><strong>写真を選ぶ</strong><p>編集したい写真をアップロード。</p></div></li><li><span>2</span><div><strong>効果を選ぶ</strong><p>編集方法やスタイルを選びます。</p></div></li><li><span>3</span><div><strong>編集して保存</strong><p>仕上がりを確認してダウンロード。</p></div></li></ol>
    <dialog ref={dialog} className="confirm-dialog" onCancel={() => { if (!busy) setConfirming(false); }} onClose={() => setConfirming(false)}><div className="stack"><h2>{pending ? '同じ編集依頼を確認します' : 'この内容で編集しますか？'}</h2><p>{tool?.name_ja} · 写真{pending?.inputs.length || photos.length}枚</p><p>{pending ? `${quality === 'high' ? '高品質' : '標準'}設定の前回の依頼を、そのまま再送します。追加の依頼は作りません。` : `${cost}クレジットを予約します。受付後は履歴で状況を確認できます。`}</p>{pending && <p className="small muted">元の依頼が受け付け済みの場合、設定や料金はその依頼のものが適用されます。</p>}<div className="button-row"><button className="button button-secondary" disabled={busy} onClick={() => setConfirming(false)}>戻る</button><button className="button" disabled={busy} onClick={() => void submit()}>{busy ? '送信中…' : pending ? '同じ依頼を確認する' : 'この内容で依頼する'}</button></div></div></dialog>
  </div>;
}
