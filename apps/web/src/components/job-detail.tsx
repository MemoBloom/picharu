'use client';

import Link from 'next/link';
import {useAuth} from '../lib/auth';
import {coarseDevice} from '../lib/device';
import {useResultObservation,ResultFeedback} from './analytics-provider';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, errorMessage, api } from '../lib/api';
import { findHistoricalToolContent as findToolContent } from '../lib/tool-content';
import { JobProgress, type PollingState } from './job-progress';
import { PhotoPreview } from './photo-preview';
import type { ImageAsset, Job } from '../lib/types';
import { ImageViewer } from './image-viewer';
import { AuthGate, ErrorNotice, Loading, Notice, PageHeading } from './ui';

const terminal = new Set(['completed', 'failed', 'cancelled']);
const statusText: Record<string, string> = { queued: '順番を待っています', processing: '写真を編集しています', completed: '仕上がりを確認しましょう', failed: '編集を完了できませんでした', cancelled: '編集をキャンセルしました' };

export function JobDetail({ jobId }: { jobId: string }) {
  const { user } = useAuth();
  return <AuthGate><JobContent key={`${user?.id || 'signed-out'}:${jobId}`} jobId={jobId} /></AuthGate>;
}

function JobContent({ jobId }: { jobId: string }) {
  const {user}=useAuth();
  const downloadAction=useRef<string|null>(null);
  const [loadedSrc,setLoadedSrc]=useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [original, setOriginal] = useState<ImageAsset | null>(null);
  const [result, setResult] = useState<ImageAsset | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [originalError, setOriginalError] = useState<unknown>(null);
  const [resultError, setResultError] = useState<unknown>(null);
  const [originalLoading, setOriginalLoading] = useState(true);
  const [resultLoading, setResultLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(0);
  const [polling, setPolling] = useState<PollingState>('live');
  const [actionError, setActionError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [pollVersion, setPollVersion] = useState(0);
  const [assetsVersion, setAssetsVersion] = useState(0);
  const [confirm, setConfirm] = useState<'cancel' | 'delete' | null>(null);
  const [retryNotBefore, setRetryNotBefore] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const latestStatus = useRef<string | undefined>(undefined);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  useEffect(() => {
    if (!retryNotBefore) return;
    const timer = setTimeout(() => setRetryNotBefore(0), Math.max(0, retryNotBefore - Date.now()));
    return () => clearTimeout(timer);
  }, [retryNotBefore]);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const started = Date.now();
    let failures = 0;
    let stopped = false;
    let inFlight = false;
    function schedule(delay: number) { if (!disposed) timer = setTimeout(() => { timer = undefined; void refresh(); }, delay); }
    async function refresh() {
      if (disposed || stopped || inFlight || (latestStatus.current && terminal.has(latestStatus.current))) return;
      if (document.visibilityState === 'hidden') { setPolling('paused'); schedule(1000); return; }
      inFlight = true;
      try {
        const updated = await api<Job>(`/api/jobs/${encodeURIComponent(jobId)}`, { signal: controller.signal });
        if (disposed) return;
        setJob(updated);
        setLastUpdated(Date.now());
        setPolling('live');
        latestStatus.current = updated.status;
        setError(null);
        setRetryNotBefore(0);
        failures = 0;
        const elapsed = Date.now() - started;
        if (!terminal.has(updated.status)) schedule(elapsed > 120000 ? 15000 : elapsed > 60000 ? 8000 : 4000);
      } catch (cause) {
        if (disposed || controller.signal.aborted) return;
        setError(cause);
        failures += 1;
        if (cause instanceof ApiError && cause.status !== 429 && !cause.retryable) { stopped = true; setPolling('stopped'); return; }
        const retryAfter = cause instanceof ApiError && cause.retryAfter ? cause.retryAfter * 1000 : Math.min(4000 * 2 ** Math.min(failures, 4), 60000);
        if (cause instanceof ApiError && cause.status === 429) setRetryNotBefore(Date.now() + retryAfter);
        if (failures >= 5) { stopped = true; setPolling('stopped'); return; }
        setPolling('retrying');
        schedule(retryAfter);
      } finally { inFlight = false; }
    }
    latestStatus.current = undefined;
    void refresh();
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !stopped && !(latestStatus.current && terminal.has(latestStatus.current))) {
        // Keep an existing backoff timer, including a server supplied Retry-After.
        if (!timer) void refresh();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { disposed = true; clearTimeout(timer); controller.abort(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [jobId, pollVersion]);

  useEffect(() => {
    if (!job) return;
    let disposed = false;
    const controller = new AbortController();
    const originalId = job.inputs[0]?.image_id;
    const resultId = job.status === 'completed' && !deleted ? job.result_image_id : null;
    setOriginalError(null); setResultError(null);
    setOriginalLoading(!!originalId); setResultLoading(!!resultId);
    if (!originalId) setOriginal(null);
    if (!resultId) setResult(null);
    const readAsset = async (id: string, resultAsset: boolean) => {
      try {
        const asset = await api<ImageAsset>(`/api/images/${encodeURIComponent(id)}`, { signal: controller.signal });
        if (!disposed) (resultAsset ? setResult : setOriginal)(asset);
      } catch (cause) { if (!disposed) (resultAsset ? setResultError : setOriginalError)(cause); }
      finally { if (!disposed) (resultAsset ? setResultLoading : setOriginalLoading)(false); }
    };
    if (originalId) void readAsset(originalId, false);
    if (resultId) void readAsset(resultId, true);
    return () => { disposed = true; controller.abort(); };
  }, [job?.inputs[0]?.image_id, job?.result_image_id, job?.status, deleted, assetsVersion]);

  useEffect(() => {
    const element = dialog.current;
    if (confirm && element && !element.open) element.showModal();
    if (!confirm && element?.open) element.close();
  }, [confirm]);

  const refreshAssets = useCallback(() => { setAssetsVersion((value) => value + 1); }, []);

  async function cancel() {
    setBusy(true);
    setActionError(null);
    try {
      const updated = await api<Job>(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
      if (!active.current) return;
      setJob(updated);
      setLastUpdated(Date.now());
      latestStatus.current = updated.status;
      setConfirm(null);
      window.dispatchEvent(new Event('picjp:credits-changed'));
    } catch (cause) { if (active.current) { setActionError(cause); setConfirm(null); setPollVersion((value) => value + 1); } }
    finally { if (active.current) setBusy(false); }
  }

  async function download() {
    if (!job?.result_image_id) return;
    setBusy(true);
    setActionError(null);
    try {
      downloadAction.current??=crypto.randomUUID();
      const response = await api<{ download_url: string }>(`/api/images/${encodeURIComponent(job.result_image_id)}/download`,{method:'POST',body:{action_id:downloadAction.current,device:coarseDevice()},expectedOwnerId:user?.id});
      downloadAction.current=null;
      if (!active.current) return;
      // Signed URLs are read fresh for every download and never saved in a draft.
      const anchor = document.createElement('a');
      anchor.href = response.download_url;
      anchor.rel = 'noopener noreferrer';
      anchor.target = '_blank';
      anchor.click();
    } catch (cause) { if (active.current) setActionError(cause); }
    finally { if (active.current) setBusy(false); }
  }

  async function deleteResult() {
    if (!job?.result_image_id) return;
    setDeleting(true);
    setActionError(null);
    try {
      await api(`/api/images/${encodeURIComponent(job.result_image_id)}`, { method: 'DELETE' });
      if (!active.current) return;
      setResult(null);
      setDeleted(true);
      setConfirm(null);
    } catch (cause) { if (active.current) { setActionError(cause); setConfirm(null); } }
    finally { if (active.current) setDeleting(false); }
  }

  useEffect(() => {
    if (job && terminal.has(job.status)) window.dispatchEvent(new Event('picjp:credits-changed'));
  }, [job?.status]);

  const content = job ? findToolContent(job.tool_id) : null;
  const image = showOriginal ? original : result;
  const resultRef=useResultObservation(jobId,!showOriginal&&!!result?.preview_url&&loadedSrc===result.preview_url&&!deleted);
  return <div className="container section">
    <PageHeading title="編集の状況" description={content?.name_ja} backHref="/ja/history" backLabel="編集履歴へ" />
    {!job && !error && <Loading label="編集の状況を確認しています…" />}
    {!!error && <ErrorNotice error={error} onRetry={retryNotBefore > Date.now() ? undefined : () => setPollVersion((value) => value + 1)} />}
    {job && <JobProgress job={job} lastUpdated={lastUpdated} polling={polling} retryAt={retryNotBefore} onRefresh={() => setPollVersion(value => value + 1)} />}
    {job && <div className="editor-grid job-grid">
      <section className="editor-canvas stack" aria-label="写真のプレビュー">
        {job.status === 'completed' ? <>
          {!deleted&&<ResultFeedback job={jobId} completedAt={job.completed_at}/>}
          <div className="segmented" role="group" aria-label="写真を比較"><button className={!showOriginal ? 'active' : ''} aria-pressed={!showOriginal} onClick={() => setShowOriginal(false)}>仕上がり</button><button className={showOriginal ? 'active' : ''} aria-pressed={showOriginal} onClick={() => setShowOriginal(true)}>元の写真</button></div>
          <PhotoPreview src={image?.preview_url} alt={showOriginal ? '編集に使用した元の写真' : '編集した仕上がりのプレビュー'} caption={showOriginal ? '元の写真' : '仕上がりのプレビュー'} loading={showOriginal ? originalLoading : resultLoading} error={showOriginal ? (originalError ? errorMessage(originalError) : null) : (resultError ? errorMessage(resultError) : null)} emptyLabel={deleted && !showOriginal ? '仕上がりの画像は削除されました。' : 'この画像は削除済み、または保存期限を過ぎています。'} imageRef={resultRef} onLoad={() => setLoadedSrc(image?.preview_url ?? '')} onRetry={deleted && !showOriginal ? undefined : refreshAssets} />
          {image?.preview_url && <ImageViewer src={image.preview_url} alt={showOriginal ? '元の写真' : '仕上がり'} />}<p className="small muted">プレビューは確認用の縮小画像です。保存するときは「画像を保存」を選んでください。</p>
        </> : <PhotoPreview src={original?.preview_url} alt="編集に使用した写真" caption="編集に使用した元の写真" loading={originalLoading} error={originalError ? errorMessage(originalError) : null} onRetry={refreshAssets} />}
      </section>
      <aside className="editor-inspector surface stack">
        <div><p className="status-label">編集の詳細</p><h2>{content?.name_ja || '写真の編集'}</h2></div>
        <dl className="detail-list"><div><dt>状態</dt><dd>{statusText[job.status]}</dd></div><div><dt>受付日時</dt><dd>{new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tokyo' }).format(new Date(job.created_at))}</dd></div><div><dt>この依頼の予約クレジット</dt><dd>{job.credits_reserved}クレジット</dd></div></dl>
        <p className="small muted">予約数はこの編集の受付時の記録です。現在の利用可能残高は<Link href="/ja/account?tab=credits">アカウント</Link>で確認できます。</p>
        {(job.status === 'queued' || job.status === 'processing') && <Notice>この画面を閉じても依頼は取り消されません。仕上がりはこのページか編集履歴で確認できます。</Notice>}
        {job.status === 'queued' && <button className="button button-secondary" disabled={busy} onClick={() => setConfirm('cancel')}>この編集をキャンセル</button>}
        {job.status === 'processing' && <p className="small muted">処理が始まった編集はキャンセルできません。</p>}
        {job.status === 'completed' && !deleted && <><button className="button" disabled={busy || !result} onClick={() => void download()}>{busy ? '保存を準備中…' : '画像を保存'}</button>{result ? <Link className="button button-secondary" href={`/ja/edit?parent_job_id=${job.job_id}`}>この仕上がりを続けて編集</Link> : <button className="button button-secondary" disabled>この仕上がりを続けて編集</button>}<p className="small muted">続けて編集する場合は、新しい内容と料金を確認します。</p></>}
        {terminal.has(job.status) && <Link className="button button-secondary" href={`/ja/edit?retry_job_id=${job.job_id}`}>元の入力から編集し直す</Link>}
        {job.status === 'failed' && <Notice tone="error">編集を完了できませんでした。<Link href="/ja/help">ヘルプ</Link>をご確認ください。{job.error_code && <span className="small error-reference">確認用コード：{job.error_code}</span>}</Notice>}
        {job.parent_job_id && <Link className="text-link" href={`/ja/jobs/${job.parent_job_id}`}>前の編集を見る</Link>}
        {!!actionError && <ErrorNotice error={actionError} />}
        {job.status === 'completed' && !deleted && <button className="text-button danger" disabled={busy || deleting} onClick={() => setConfirm('delete')}>仕上がりの画像を削除</button>}
        <p className="small muted break-word">依頼番号：{job.job_id}</p>
      </aside>
    </div>}
    <dialog ref={dialog} className="confirm-dialog" aria-labelledby="job-confirm-title" onCancel={(event) => { if (busy || deleting) event.preventDefault(); else setConfirm(null); }} onClose={() => setConfirm(null)}><div className="stack"><h2 id="job-confirm-title">{confirm === 'delete' ? '仕上がりの画像を削除しますか？' : 'この編集をキャンセルしますか？'}</h2><p>{confirm === 'delete' ? '削除した画像は、ダウンロードや続きの編集に使えなくなります。編集の履歴は残ります。元の入力写真は削除されません。' : 'まだ処理が始まっていない場合にキャンセルできます。処理が始まった場合は、最新の状態をお知らせします。'}</p><div className="button-row"><button className="button button-secondary" disabled={busy || deleting} onClick={() => setConfirm(null)}>戻る</button><button className="button" disabled={busy || deleting} onClick={() => void (confirm === 'delete' ? deleteResult() : cancel())}>{busy || deleting ? '処理中…' : confirm === 'delete' ? '画像を削除する' : 'キャンセルする'}</button></div></div></dialog>
  </div>;
}
