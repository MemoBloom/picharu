'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, UserFacingError, api } from '../lib/api';
import { findToolContent } from '../lib/tool-content';
import type { ImageAsset, Job } from '../lib/types';
import { AuthGate, ErrorNotice, Loading, Notice, PageHeading } from './ui';

const terminal = new Set(['completed', 'failed', 'cancelled']);
const statusText: Record<string, string> = { queued: '順番を待っています', processing: '写真を編集しています', completed: '仕上がりを確認しましょう', failed: '編集を完了できませんでした', cancelled: '編集をキャンセルしました' };
const stageText: Record<string, string> = { queued: '受付が完了しました。処理が始まるまでお待ちください。', validating: '写真と編集内容を確認しています。', submitting: '編集を依頼しています。', polling: '仕上がりを待っています。', generating: '仕上がりを待っています。', persisting: '仕上がりを保存しています。', settling: '編集の完了を確認しています。' };

export function JobDetail({ jobId }: { jobId: string }) {
  return <AuthGate><JobContent jobId={jobId} /></AuthGate>;
}

function JobContent({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [original, setOriginal] = useState<ImageAsset | null>(null);
  const [result, setResult] = useState<ImageAsset | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [imageError, setImageError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [pollVersion, setPollVersion] = useState(0);
  const [assetsVersion, setAssetsVersion] = useState(0);
  const [confirm, setConfirm] = useState<'cancel' | 'delete' | null>(null);
  const [slow, setSlow] = useState(false);
  const [retryNotBefore, setRetryNotBefore] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const latestStatus = useRef<string | undefined>(undefined);

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
    function schedule(delay: number) { if (!disposed) timer = setTimeout(() => void refresh(), delay); }
    async function refresh() {
      if (disposed || (latestStatus.current && terminal.has(latestStatus.current))) return;
      if (document.visibilityState === 'hidden') { schedule(1000); return; }
      try {
        const updated = await api<Job>(`/api/jobs/${encodeURIComponent(jobId)}`, { signal: controller.signal });
        if (disposed) return;
        setJob(updated);
        latestStatus.current = updated.status;
        setError(null);
        setRetryNotBefore(0);
        failures = 0;
        const elapsed = Date.now() - started;
        setSlow(elapsed > 60000);
        if (!terminal.has(updated.status)) schedule(elapsed > 120000 ? 15000 : elapsed > 60000 ? 8000 : 4000);
      } catch (cause) {
        if (disposed || controller.signal.aborted) return;
        setError(cause);
        failures += 1;
        if (cause instanceof ApiError && cause.status !== 429 && !cause.retryable) return;
        const retryAfter = cause instanceof ApiError && cause.retryAfter ? cause.retryAfter * 1000 : Math.min(4000 * 2 ** Math.min(failures, 4), 60000);
        if (cause instanceof ApiError && cause.status === 429) setRetryNotBefore(Date.now() + retryAfter);
        if (failures >= 5) return;
        schedule(retryAfter);
      }
    }
    latestStatus.current = undefined;
    void refresh();
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !(latestStatus.current && terminal.has(latestStatus.current))) {
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
    async function readAssets() {
      setImageError(null);
      const requests = [job!.inputs[0]?.image_id, job!.status === 'completed' && !deleted ? job!.result_image_id : null];
      const responses = await Promise.allSettled(requests.map((id) => id ? api<ImageAsset>(`/api/images/${encodeURIComponent(id)}`, { signal: controller.signal }) : Promise.resolve(null)));
      if (disposed) return;
      const [before, after] = responses;
      if (before.status === 'fulfilled') setOriginal(before.value);
      if (after.status === 'fulfilled') setResult(after.value);
      if (before.status === 'rejected') setImageError(before.reason);
      if (after.status === 'rejected') setImageError(after.reason);
    }
    void readAssets();
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
      setJob(updated);
      latestStatus.current = updated.status;
      setConfirm(null);
      window.dispatchEvent(new Event('picjp:credits-changed'));
    } catch (cause) { setActionError(cause); setConfirm(null); setPollVersion((value) => value + 1); }
    finally { setBusy(false); }
  }

  async function download() {
    if (!job?.result_image_id) return;
    setBusy(true);
    setActionError(null);
    try {
      const response = await api<{ download_url: string }>(`/api/images/${encodeURIComponent(job.result_image_id)}/download`);
      // Signed URLs are read fresh for every download and never saved in a draft.
      const anchor = document.createElement('a');
      anchor.href = response.download_url;
      anchor.rel = 'noopener noreferrer';
      anchor.target = '_blank';
      anchor.click();
    } catch (cause) { setActionError(cause); }
    finally { setBusy(false); }
  }

  async function deleteResult() {
    if (!job?.result_image_id) return;
    setDeleting(true);
    setActionError(null);
    try {
      await api(`/api/images/${encodeURIComponent(job.result_image_id)}`, { method: 'DELETE' });
      setResult(null);
      setDeleted(true);
      setConfirm(null);
    } catch (cause) { setActionError(cause); setConfirm(null); }
    finally { setDeleting(false); }
  }

  useEffect(() => {
    if (job && terminal.has(job.status)) window.dispatchEvent(new Event('picjp:credits-changed'));
  }, [job?.status]);

  const content = job ? findToolContent(job.tool_id) : null;
  const image = showOriginal ? original : result;
  return <div className="container section">
    <PageHeading title={job ? statusText[job.status] || '編集の状況' : '編集の状況'} description={content?.name_ja} backHref="/ja/history" backLabel="編集履歴へ" />
    {!job && !error && <Loading label="編集の状況を確認しています…" />}
    {!!error && <ErrorNotice error={error} onRetry={retryNotBefore > Date.now() ? undefined : () => setPollVersion((value) => value + 1)} />}
    {job && <div className="editor-grid job-grid">
      <section className="editor-canvas stack" aria-label="写真のプレビュー">
        {job.status === 'completed' ? <>
          <div className="segmented" role="group" aria-label="写真を比較"><button className={!showOriginal ? 'active' : ''} aria-pressed={!showOriginal} onClick={() => setShowOriginal(false)}>仕上がり</button><button className={showOriginal ? 'active' : ''} aria-pressed={showOriginal} onClick={() => setShowOriginal(true)}>元の写真</button></div>
          {image?.preview_url ? <figure className="editor-photo"><img src={image.preview_url} alt={showOriginal ? '編集に使用した元の写真' : '編集した仕上がりのプレビュー'} onError={() => setImageError(new UserFacingError('プレビューの有効期限が切れた可能性があります。画像を再読み込みしてください。'))} /><figcaption className="photo-caption">{showOriginal ? '元の写真' : '仕上がりのプレビュー'}</figcaption></figure> : <div className="empty-state panel"><h2>{deleted && !showOriginal ? '仕上がりの画像は削除されました' : 'プレビューを表示できません'}</h2><p>画像が期限切れ、削除済み、または読み込み中の可能性があります。編集履歴は残ります。</p>{!deleted && <button className="button button-secondary" onClick={refreshAssets}>画像を再読み込み</button>}</div>}
          <p className="small muted">プレビューは確認用の縮小画像です。保存するときは「ダウンロード」を選んでください。</p>
        </> : <div className="job-preview panel stack">
          {original?.preview_url && <img src={original.preview_url} alt="編集に使用した写真" className="job-original-preview" />}
          <div role="status" aria-live="polite"><h2>{statusText[job.status]}</h2><p>{job.status === 'queued' || job.status === 'processing' ? stageText[job.stage] || '編集の状況を確認しています。画面を閉じても、履歴から再び確認できます。' : job.status === 'cancelled' ? 'この依頼の処理をキャンセルしました。クレジットの残高はアカウントで確認できます。' : '残高と編集内容を確認してから、もう一度お試しください。'}</p></div>
          {(job.status === 'queued' || job.status === 'processing') && <div className="indeterminate" aria-hidden="true" />}
        </div>}
        {!!imageError && <ErrorNotice error={imageError} onRetry={refreshAssets} />}
      </section>
      <aside className="editor-inspector surface stack">
        <div><p className="status-label">編集の詳細</p><h2>{content?.name_ja || '写真の編集'}</h2></div>
        <dl className="detail-list"><div><dt>状態</dt><dd>{statusText[job.status]}</dd></div><div><dt>受付日時</dt><dd>{new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tokyo' }).format(new Date(job.created_at))}</dd></div><div><dt>この依頼の予約クレジット</dt><dd>{job.credits_reserved}クレジット</dd></div></dl>
        <p className="small muted">予約数はこの編集の受付時の記録です。現在の利用可能残高は<Link href="/ja/account?tab=credits">アカウント</Link>で確認できます。</p>
        {slow && !terminal.has(job.status) && <Notice>通常より時間がかかっています。新しく依頼し直さず、履歴からこの編集の状況をご確認ください。</Notice>}
        {(job.status === 'queued' || job.status === 'processing') && <Notice>この画面を閉じても依頼は取り消されません。仕上がりはこのページか編集履歴で確認できます。</Notice>}
        {job.status === 'queued' && <button className="button button-secondary" disabled={busy} onClick={() => setConfirm('cancel')}>この編集をキャンセル</button>}
        {job.status === 'processing' && <p className="small muted">処理が始まった編集はキャンセルできません。</p>}
        {job.status === 'completed' && !deleted && <><button className="button" disabled={busy || !result} onClick={() => void download()}>{busy ? 'ダウンロードを準備中…' : 'ダウンロード'}</button><Link className={`button button-secondary${!result ? ' disabled' : ''}`} aria-disabled={!result} href={result ? `/ja/edit?parent_job_id=${job.job_id}` : '#'} onClick={(event) => { if (!result) event.preventDefault(); }}>この仕上がりを続けて編集</Link><p className="small muted">続けて編集する場合は、新しい内容と料金を確認します。</p></>}
        {terminal.has(job.status) && <Link className="button button-secondary" href={`/ja/edit?retry_job_id=${job.job_id}`}>元の入力から編集し直す</Link>}
        {job.status === 'failed' && <Notice tone="error">編集を完了できませんでした。<Link href="/ja/help">ヘルプ</Link>をご確認ください。{job.error_code && <span className="small error-reference">確認用コード：{job.error_code}</span>}</Notice>}
        {job.parent_job_id && <Link className="text-link" href={`/ja/jobs/${job.parent_job_id}`}>前の編集を見る</Link>}
        {!!actionError && <ErrorNotice error={actionError} />}
        {job.status === 'completed' && !deleted && <button className="text-button danger" disabled={busy || deleting} onClick={() => setConfirm('delete')}>仕上がりの画像を削除</button>}
        <p className="small muted break-word">依頼番号：{job.job_id}</p>
      </aside>
    </div>}
    <dialog ref={dialog} className="confirm-dialog" onCancel={(event) => { if (busy || deleting) event.preventDefault(); else setConfirm(null); }} onClose={() => setConfirm(null)}><div className="stack"><h2>{confirm === 'delete' ? '仕上がりの画像を削除しますか？' : 'この編集をキャンセルしますか？'}</h2><p>{confirm === 'delete' ? '削除した画像は、ダウンロードや続きの編集に使えなくなります。編集の履歴は残ります。元の入力写真は削除されません。' : 'まだ処理が始まっていない場合にキャンセルできます。処理が始まった場合は、最新の状態をお知らせします。'}</p><div className="button-row"><button className="button button-secondary" disabled={busy || deleting} onClick={() => setConfirm(null)}>戻る</button><button className="button" disabled={busy || deleting} onClick={() => void (confirm === 'delete' ? deleteResult() : cancel())}>{busy || deleting ? '処理中…' : confirm === 'delete' ? '画像を削除する' : 'キャンセルする'}</button></div></div></dialog>
  </div>;
}
