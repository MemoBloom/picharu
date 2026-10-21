'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { EditRequest } from '@picjp/contracts';
import { ApiError, UserFacingError, api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { clearDraft, loadDraft, saveDraft } from '../lib/drafts';
import { EditorField } from './editor-fields';
import { ToolChooser } from './tool-chooser';
import { ImageViewer } from './image-viewer';
import { partitionFields,missingRequiredFields,fieldLabel } from '../lib/editor-ui';
import { findToolContent } from '../lib/tool-content';
import type { Credits, ImageAsset, Job, Tool } from '../lib/types';
import { ErrorNotice, Loading, Notice, Icon } from './ui';

type Role = EditRequest['inputs'][number]['role'];
type Photo = { key: string; imageId?: string; asset?: ImageAsset; role: Role; preview?: string; file?: File; ticket?: { upload_url: string; expires_at: string; required_headers: { 'Content-Type': string } }; putDone?: boolean; state: 'uploading' | 'ready' | 'error'; error?: string };
type Recommendations = { source: 'model' | 'fallback'; recommendations: { tool_id: string; prompt_id: string; name_ja: string; reason_code: string }[] };
const roles: Record<Role, string> = { primary: '編集する主画像', subject_reference: '被写体の参考', background_reference: '背景の参考', style_reference: '雰囲気の参考', identity_reference: '人物の参考' };
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
  const replacement = useRef<string | null>(null);
  const [dragging,setDragging] = useState(false);
  const [keyboardOpen,setKeyboardOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const localUrls = useRef(new Set<string>());
  const cooldown = useRef(0);
  const owner = useRef(user?.id);
  const draftOwner = useRef<string | undefined>(undefined);
  const tool = tools.find((item) => item.tool_id === toolId);
  const content = findToolContent(toolId);
  const cost = tool?.credit_cost[quality] ?? null;
  const grouped = tool ? partitionFields(tool) : {primary:[],advanced:[]};
  const missingFields = tool ? missingRequiredFields(tool,parameters) : [];
  const uploading = photos.some((photo) => photo.state === 'uploading');
  const locked = busy || restoring || uploading || cooldownUntil > Date.now();
  const intentQuery = new URLSearchParams({ tool: toolId, ...(parentJobId ? { parent_job_id: parentJobId } : {}), ...(retryJobId ? { retry_job_id: retryJobId } : {}) });
  const loginNext = `/ja/login?next=${encodeURIComponent(`/ja/edit${intentQuery.size ? `?${intentQuery}` : ''}`)}`;

  useEffect(()=>{
    const viewport=window.visualViewport;
    const update=()=>{const focused=document.activeElement;const typing=focused instanceof HTMLInputElement||focused instanceof HTMLTextAreaElement;setKeyboardOpen(Boolean(typing&&viewport&&viewport.height<window.innerHeight*.75));};
    viewport?.addEventListener('resize',update);document.addEventListener('focusin',update);document.addEventListener('focusout',update);
    return()=>{viewport?.removeEventListener('resize',update);document.removeEventListener('focusin',update);document.removeEventListener('focusout',update);};
  },[]);
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
    draftOwner.current = undefined;
    setHydrated(false);
    photosRef.current = [];
    setPhotos([]);
    setPending(undefined);
    setCredits(null);
    setParameters({});
    setInstruction('');
    setParent(undefined);
    setRecommendation(null);
    setRestorationNote('');
    setError(null);
    setBusy(false);
    setRecommending(false);
    setConfirming(false);
    localUrls.current.forEach((url) => URL.revokeObjectURL(url));
    localUrls.current.clear();
    if (!user) { setRestoring(false); setHydrated(true); return; }
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
          if (cancelled || owner.current !== userId) return;
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
        if (cancelled || owner.current !== userId) return;
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
      finally { if (!cancelled && owner.current === userId) { draftOwner.current = userId; setRestoring(false); setHydrated(true); } }
    }
    void restore();
    void api<Credits>('/api/credits').then((data) => { if (!cancelled) setCredits(data); }).catch((cause) => { if (!cancelled) setError(cause); });
    return () => { cancelled = true; };
  }, [ready, user?.id, initialTool, parentJobId, retryJobId]);

  useEffect(() => {
    if (!user || !hydrated || draftOwner.current !== user.id) return;
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
    const requestOwner = owner.current;
    setError(null);
    await fetchTools();
    if (requestOwner && owner.current === requestOwner) {
      try { const data = await api<Credits>('/api/credits'); if (owner.current === requestOwner) setCredits(data); }
      catch (cause) { if (owner.current === requestOwner) { observeLimit(cause); setError(cause); } }
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

  async function addFiles(files: FileList | File[],replaceKey: string | null = null) {
    if (!user || locked) return;
    const batchOwner = user.id;
    const maximum = Math.min(tool?.maximum_input_count || 4, 4);
    const list = Array.from(files);
    if (replaceKey && (list.length !== 1 || !photosRef.current.some(p=>p.key===replaceKey))) { setError(new UserFacingError('変更する写真を1枚選んでください。')); return; }
    if (photosRef.current.length + list.length - (replaceKey ? 1 : 0) > maximum) { setError(new UserFacingError(`この編集では写真を${maximum}枚まで選べます。`)); return; }
    const invalid = list.find((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size <= 0 || file.size > 20 * 1024 * 1024);
    if (invalid) { setError(new UserFacingError('JPEG・PNG・WebPの写真を選んでください。1枚20MBまで対応しています。HEICや動画は利用できません。')); return; }
    change();
    const oldLength = photosRef.current.length;
    const replaced = photosRef.current.find(p=>p.key===replaceKey);
    const next: Photo[] = list.map((file, index) => {
      const preview = URL.createObjectURL(file);
      localUrls.current.add(preview);
      return { key: crypto.randomUUID(), file, preview, state: 'uploading', role: replaced ? replaced.role : oldLength + index === 0 ? 'primary' : ((tool?.allowed_roles.find((role) => role !== 'primary') || 'subject_reference') as Role) };
    });
    photosRef.current = replaceKey ? photosRef.current.map(p=>p.key===replaceKey?next[0]:p) : [...photosRef.current, ...next];
    if (replaced?.role==='primary') setParent(undefined);
    if (replaced?.preview && localUrls.current.has(replaced.preview)) { URL.revokeObjectURL(replaced.preview); localUrls.current.delete(replaced.preview); }
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
    finally { if (owner.current === requestOwner) setRecommending(false); }
  }

  const incompatible = Boolean(tool && (photos.length > tool.maximum_input_count || photos.some((photo) => !tool.allowed_roles.includes(photo.role))));
  const needsTarget = (toolId === 'remove_person' || toolId === 'remove_object') && !parameters.target?.trim() && !instruction.trim();
  const enoughCredits = credits !== null && cost !== null && credits.available >= cost && credits.status === 'active';
  const canSubmit = Boolean(user && hydrated && tool?.available && !locked && photos.length >= tool.minimum_input_count && photos.every((photo) => photo.state === 'ready') && !incompatible && !needsTarget && !missingFields.length && enoughCredits);

  async function submit() {
    if (!tool || busy || !user) return;
    if (!pending && !canSubmit) { setConfirming(false); return; }
    const requestOwner = user.id;
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
      if (owner.current !== requestOwner) return;
      clearDraft(requestOwner);
      setConfirming(false);
      window.dispatchEvent(new Event('picjp:credits-changed'));
      router.push(`/ja/jobs/${accepted.job_id}`);
    } catch (cause) {
      if (owner.current !== requestOwner) return;
      observeLimit(cause);
      setError(cause);
      setConfirming(false);
      void api<Credits>('/api/credits').then((data) => { if (owner.current === requestOwner) setCredits(data); }).catch(() => {});
    } finally { if (owner.current === requestOwner) setBusy(false); }
  }

  function selectFiles(key: string | null = null) {
    replacement.current=key;
    if(picker.current){picker.current.multiple=key===null;picker.current.click();}
  }
  function updateParameter(name:string,value:string){change();setParameters(current=>({...current,[name]:value}));}
  const hint = !ready ? 'ログイン状態を確認しています。' : toolsLoading ? '編集方法を確認しています。' : !tool ? '編集方法を読み込めませんでした。再読み込みしてください。' : !tool.available ? '編集機能は現在準備中です。' : !user ? '写真を選ぶにはログインしてください。' : restoring ? '前の編集内容を確認しています。' : uploading ? '写真のアップロードが終わるまでお待ちください。' : cooldownUntil>Date.now() ? '少し時間をおいてから、もう一度お試しください。' : pending ? '前回と同じ依頼を確認します。' : photos.length<tool.minimum_input_count ? `写真を${tool.minimum_input_count}枚以上選んでください。` : photos.some(photo=>photo.state==='error') ? 'アップロードできなかった写真を再試行してください。' : incompatible ? '写真の枚数や役割を確認してください。' : needsTarget ? '消したい対象を入力してください。' : missingFields.length ? `${fieldLabel(toolId,missingFields[0].name)}を入力してください。` : credits?.status==='restricted' ? 'このアカウントは現在利用が制限されています。' : cost===null ? '料金を確認できませんでした。再読み込みしてください。' : !credits ? 'クレジットの残高を確認しています。' : credits.available<cost ? 'クレジットが足りません。残高をご確認ください。' : '編集内容と料金を確認して進みます。';
  const submitLabel = busy ? '送信中…' : pending ? '同じ依頼を確認・再試行' : !tool?.available ? '編集機能を準備中' : 'AIで写真を編集';
  const fieldsFor=(fields:Tool['parameter_fields'])=>fields.map(field=><EditorField key={`${toolId}_${field.name}`} field={field} toolId={toolId} value={parameters[field.name]||''} disabled={locked} onChange={value=>updateParameter(field.name,value)}/>);
  return <div className={`container section workspace-page picmoko-workspace${keyboardOpen?' keyboard-open':''}`}>
    <nav className="breadcrumb" aria-label="パンくず"><Link href="/ja/tools">ツール一覧</Link><span aria-hidden="true">/</span><span>写真を編集</span></nav>
    <header className="workspace-heading"><h1>写真を、もっと自由に。</h1><p>写真を選んで、好きな仕上がりへ。</p></header>
    <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={event=>{if(event.target.files)void addFiles(event.target.files,replacement.current);event.target.value='';replacement.current=null;}}/>
    <div className="editor-grid">
      <section className="editor-canvas stack" aria-label="写真のアップロードとプレビュー">
        {restorationNote&&<Notice>{restorationNote}</Notice>}{restoring&&<Loading label="編集内容を読み込んでいます…"/>}
        {!photos.length ? <>
          <div className={`upload-drop${dragging?' dragging':''}`} onDragEnter={event=>{event.preventDefault();setDragging(true);}} onDragOver={event=>event.preventDefault()} onDragLeave={event=>{if(!(event.relatedTarget instanceof Node)||!event.currentTarget.contains(event.relatedTarget))setDragging(false);}} onDrop={event=>{event.preventDefault();setDragging(false);if(user)void addFiles(event.dataTransfer.files);else setError(new UserFacingError('ログインしてから写真を選んでください。'));}}>
            {user ? <button type="button" className="upload-surface" disabled={locked} onClick={()=>selectFiles()}><Icon name="upload" size={48}/><span className="upload-title">写真をアップロード</span><span className="upload-description">ドラッグ＆ドロップ、または写真を選択</span><span className="button">写真を選ぶ</span><span className="upload-format">JPEG・PNG・WebP / 1枚20MBまで</span></button> : <Link className="upload-surface" href={loginNext}><Icon name="upload" size={48}/><span className="upload-title">写真をアップロード</span><span className="upload-description">ログインして、お気に入りの一枚から。</span><span className="button">ログインして写真を選ぶ</span><span className="upload-format">JPEG・PNG・WebP / 1枚20MBまで</span></Link>}
          </div>
          <aside className="editing-tip"><img src="/images/editorial-cat.png" alt="窓辺の猫のイメージ写真"/><div><h2>編集のヒント</h2><p>{content?.input_tip||'編集したい写真を選んでください。'}</p><span>イメージ写真 · 編集結果ではありません</span></div></aside>
        </> : <>
          <figure className="editor-photo real-photo">{photos[0].preview?<img src={photos[0].preview} alt="編集する主画像のプレビュー"/>:<div className="empty-state"><p>写真を表示できません。再試行するか、新しい写真を選んでください。</p></div>}<figcaption className="photo-caption">{photos[0].state==='ready'?'編集する写真':photos[0].state==='uploading'?'アップロード中…':'アップロードを確認してください'}</figcaption></figure>
          <div className="photo-actions"><button type="button" className="button button-secondary" disabled={locked} onClick={()=>selectFiles(photos[0].key)}>写真を変更</button>{photos[0].preview&&<ImageViewer src={photos[0].preview} alt="編集する写真"/>}<button type="button" className="text-button" disabled={locked} onClick={()=>removePhoto(photos[0].key)}>この編集から外す</button></div>
          <div className="reference-list" aria-label="選んだ写真">{photos.map((photo,index)=><article className="reference-item" key={photo.key}><div className="reference-thumb">{photo.preview&&<img src={photo.preview} alt={`写真${index+1}`}/>}</div><div className="reference-info"><strong>{index===0?'主画像':`参考画像 ${index}`}</strong>{index>0&&<label className="field"><span className="sr-only">参考画像 {index} の役割</span><select value={photo.role} disabled={locked} onChange={event=>{change();updatePhoto(photo.key,{role:event.target.value as Role});}}>{(tool?.allowed_roles||Object.keys(roles) as Role[]).filter(role=>role!=='primary').map(role=><option key={role} value={role}>{roles[role]}</option>)}</select></label>}<span className="small" role="status">{photo.state==='ready'?'アップロード済み':photo.state==='uploading'?'アップロード中…':photo.error}</span><div className="button-row">{photo.state==='error'&&photo.file&&<button type="button" className="text-button" disabled={locked} onClick={()=>void upload(photo)}>再試行</button>}{index>0&&<><button type="button" className="text-button" disabled={locked} onClick={()=>selectFiles(photo.key)}>写真を変更</button>{!parent&&<button type="button" className="text-button" disabled={locked} onClick={()=>promotePhoto(photo.key)}>主画像にする</button>}<button type="button" className="text-button" disabled={locked} onClick={()=>removePhoto(photo.key)}>外す</button></>}</div></div></article>)}</div>
          {photos.length<Math.min(tool?.maximum_input_count||4,4)&&<button type="button" className="button button-secondary reference-add" disabled={locked} onClick={()=>selectFiles()}><Icon name="image" size={18}/>参考の写真を追加</button>}
          <p className="small muted">外した写真は、この編集の対象から外れます。保存済み画像の削除ではありません。<Link className="text-link" href="/ja/legal/privacy">写真の取り扱い</Link></p>
          {photos[0]?.state==='ready'&&<section className="recommendation-section"><div className="section-heading"><h2>ほかの表現も探す</h2><button type="button" className="text-button" disabled={recommending||locked} onClick={()=>void recommend()}>{recommending?'確認中…':'編集候補を見る'}</button></div>{recommendation?<><p className="small muted">{recommendation.source==='fallback'?'おすすめ解析は利用できないため、利用可能な編集方法を表示します。':'写真に合いそうな編集候補です。仕上がりを保証するものではありません。'}</p>{recommendation.recommendations.length?<div className="button-row">{recommendation.recommendations.map(item=><button type="button" className="button button-secondary" key={item.prompt_id} disabled={locked} onClick={()=>chooseTool(item.tool_id)}>{item.name_ja}</button>)}</div>:<p>現在表示できる候補がありません。編集方法の一覧をご覧ください。</p>}</>:<p className="small muted">写真から、利用できる編集候補を確認できます。</p>}</section>}
        </>}
      </section>
      <aside className="editor-inspector" aria-labelledby="settings-title">
        <h2 id="settings-title">仕上がりを選ぶ</h2>
        {toolsLoading?<Loading label="編集方法を読み込んでいます…"/>:<div className="current-tool"><Icon name={content?.icon} size={28}/><strong>{content?.name_ja||tool?.name_ja||'編集方法を選択'}</strong><ToolChooser tools={tools} selected={toolId} disabled={locked} onSelect={chooseTool}/></div>}
        {tool&&<><p className="task-tip">{content?.description||content?.input_tip}</p>{fieldsFor(grouped.primary)}
          <details className="advanced-settings" key={toolId}><summary><Icon name="chevron-down" size={18}/>詳細設定</summary><div className="advanced-content">{fieldsFor(grouped.advanced)}<label className="field"><span>追加のリクエスト<span className="field-optional">（任意）</span></span><textarea rows={3} maxLength={1000} disabled={locked} value={instruction} placeholder={content?.request_example||'残したい特徴や、ご希望があれば入力してください。'} onChange={event=>{change();setInstruction(event.target.value);}}/><span className="small muted character-count">{instruction.length}/1000</span></label><div className="field-grid"><label className="field"><span>画質</span><select disabled={locked||!tool.available} value={quality} onChange={event=>{change();setQuality(event.target.value as 'standard'|'high');}}>{tool.output_options.qualities.length?tool.output_options.qualities.map(value=><option key={value} value={value}>{qualities[value]}</option>):<option value="standard">公開後に選択できます</option>}</select></label><label className="field"><span>画像の比率</span><select disabled={locked||!tool.available} value={aspectRatio} onChange={event=>{change();setAspectRatio(event.target.value);}}>{tool.output_options.aspect_ratios.length?tool.output_options.aspect_ratios.map(value=><option key={value} value={value}>{value==='preserve'?'元の比率':value}</option>):<option value="preserve">元の比率</option>}</select></label></div></div></details>
          {incompatible&&<Notice tone="error">選んだ編集方法では、この枚数や参考画像の役割を使えません。画像を外すか、役割を選び直してください。</Notice>}
          {credits?.status==='restricted'&&<Notice tone="error">このアカウントでは現在、新しい編集を開始できません。<Link href="/ja/help">ヘルプを見る</Link></Notice>}
          {tool.available&&credits&&cost!==null&&credits.available<cost&&<Notice>クレジットが不足しています。編集内容を保存してから<Link className="text-link" href="/ja/pricing">クレジットを購入</Link>できます。</Notice>}
        </>}
        {!!error&&<ErrorNotice error={error} onRetry={cooldownUntil>Date.now()||locked?undefined:()=>void refreshContext()}/>}
        {draftWarning&&<Notice>このブラウザーでは一時保存ができません。通信エラー後はこのページを閉じず、同じ内容で再試行してください。</Notice>}
        {!user&&ready&&!configured&&<p className="task-tip">ログイン機能は現在準備中です。編集方法と設定をご覧いただけます。</p>}
        {pending&&<Notice>前回の送信結果をまだ確認できていません。同じ内容で再試行すると、同じ依頼として確認します。<Link className="text-link" href="/ja/history">履歴を見る</Link></Notice>}
        <div className="workspace-actionbar"><div className="action-status"><p id="editor-submission-help" role="status">{hint}</p>{tool?.available&&cost!==null&&<p className="action-cost"><strong>{cost}クレジット</strong>{credits&&<span>利用可能 {credits.available}</span>}</p>}</div><button type="button" className="button editor-submit" aria-describedby="editor-submission-help" disabled={(!pending&&!canSubmit)||busy||(locked&&!busy)} onClick={()=>setConfirming(true)}>{submitLabel}</button></div>
        <p className="workspace-fine-print">仕上がりは写真によって異なります。料金は依頼を確定する前に確認できます。</p>
      </aside>
    </div>
    <ol className="steps"><li><span>1</span><div><strong>写真を選ぶ</strong><p>編集したい写真をアップロード。</p></div></li><li><span>2</span><div><strong>効果を選ぶ</strong><p>編集方法やスタイルを選びます。</p></div></li><li><span>3</span><div><strong>確認して保存</strong><p>仕上がりを確認してダウンロード。</p></div></li></ol>
    <dialog ref={dialog} className="confirm-dialog" aria-labelledby="editor-confirm-title" onCancel={event=>{if(busy)event.preventDefault();else setConfirming(false);}} onClose={()=>setConfirming(false)}><div className="stack"><h2 id="editor-confirm-title">{pending?'同じ編集依頼を確認します':'この内容で編集しますか？'}</h2><p>{content?.name_ja||tool?.name_ja} · 写真{pending?.inputs.length||photos.length}枚</p><p>{pending?'前回の依頼を、そのまま再送します。追加の依頼は作りません。':`${cost}クレジットを予約します。受付後は履歴で状況を確認できます。`}</p>{pending&&<p className="small muted">元の依頼が受け付け済みの場合、設定や料金はその依頼のものが適用されます。</p>}<div className="button-row"><button type="button" className="button button-secondary" disabled={busy} onClick={()=>setConfirming(false)}>戻る</button><button type="button" className="button" disabled={busy||(!pending&&!canSubmit)} onClick={()=>void submit()}>{busy?'送信中…':pending?'同じ依頼を確認する':'この内容で依頼する'}</button></div></div></dialog>
  </div>;
}
