'use client';
import {findHistoricalToolContent} from '../lib/tool-content';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api, UserFacingError } from '../lib/api';
import { personalDateRange } from '../lib/personal-filters';
import styles from './personal-console.module.css';
import { useAuth } from '../lib/auth';
import type { ImageAsset, Job, Page, Tool } from '../lib/types';
import { AuthGate, ErrorNotice, Loading, PageHeading } from './ui';

const stateNames: Record<string, string> = { queued: '順番待ち', processing: '編集中', completed: '完了', failed: '編集できませんでした', cancelled: 'キャンセル済み' };
const date = (value: string) => new Intl.DateTimeFormat('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }).format(new Date(value));

function HistoryCard({ job, name }: { job: Job; name: string }) {
  const element = useRef<HTMLElement>(null); const [visible, setVisible] = useState(false); const [image, setImage] = useState<ImageAsset | null>(null);
  const [broken, setBroken] = useState(false);
  const imageId = job.result_image_id ?? job.inputs[0]?.image_id;
  useEffect(() => { const node = element.current; if (!node) return; if (!('IntersectionObserver' in window)) { setVisible(true); return; } const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: '120px' }); observer.observe(node); return () => observer.disconnect(); }, []);
  useEffect(() => { if (!visible || !imageId) return; const controller = new AbortController(); setImage(null); setBroken(false); api<ImageAsset>(`/api/images/${imageId}`, { signal: controller.signal }).then(setImage).catch(() => { /* Deleted or expired assets leave the task readable. */ }); return () => controller.abort(); }, [imageId, visible]);
  return <article className="history-card" ref={element}>
    <Link href={`/ja/jobs/${job.job_id}`} className="history-image" aria-label={`${name}の${stateNames[job.status] ?? '詳細'}を見る`}>
      {image?.preview_url && !broken ? <img src={image.preview_url} alt={`${name}の${job.result_image_id ? '編集結果' : '入力写真'}`} loading="lazy" onError={() => setBroken(true)} /> : <span className="history-placeholder">{job.status === 'completed' ? '編集の記録' : '写真の編集'}</span>}
      <span className={`status-badge status-${job.status}`}>{stateNames[job.status] ?? '状態を確認中'}</span>
    </Link>
    <div className="history-card-body"><h2><Link href={`/ja/jobs/${job.job_id}`}>{name}</Link></h2><p className="muted">{date(job.created_at)}</p><p className="fine-print">{job.status === 'queued' || job.status === 'processing' ? `${job.credits_reserved} クレジットを予約中` : `予約時 ${job.credits_reserved} クレジット`}</p><Link className="text-link" href={`/ja/jobs/${job.job_id}`}>{job.status === 'completed' ? '結果を見る' : '詳細を見る'} →</Link></div>
  </article>;
}

export function HistoryPage() { const { user } = useAuth(); return <AuthGate><HistoryContent key={user?.id ?? 'anonymous'} /></AuthGate>; }
function HistoryContent() {
  const { user } = useAuth();
  const [status, setStatus] = useState(''), [toolId, setToolId] = useState(''), [startDay, setStartDay] = useState(''), [endDay, setEndDay] = useState('');
  const [filters, setFilters] = useState(''), [before, setBefore] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]); const [tools, setTools] = useState<Tool[]>([]);
  const [cursor, setCursor] = useState<string | null>(null); const [loaded, setLoaded] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null);
  const controller = useRef<AbortController | null>(null); const running = useRef(false); const lastUser = useRef<string | null>(null);
  async function load(append = false) {
    if (!user || running.current) return; running.current = true; controller.current?.abort(); const request = new AbortController(); controller.current = request; setBusy(true); setError(null);
    const query = new URLSearchParams(filters); query.set('limit', '20'); if (append && cursor && before) { query.set('cursor', cursor); query.set('before', before); }
    try { const result = await api<Page<Job> & { snapshot_before: string }>(`/api/account/jobs?${query}`, { signal: request.signal }); if (!request.signal.aborted) { setJobs(previous => append ? [...previous, ...result.items.filter(item => !previous.some(old => old.job_id === item.job_id))] : result.items); setCursor(result.next_cursor); setBefore(result.snapshot_before); setLoaded(true); } }
    catch (value) { if (!request.signal.aborted) setError(value); } finally { if (!request.signal.aborted) { setBusy(false); running.current = false; } }
  }
  useEffect(() => {
    if (!user) return;
    if (lastUser.current !== user.id) { lastUser.current = user.id; setJobs([]); setCursor(null); setLoaded(false); }
    setJobs([]); setCursor(null); setBefore(null); setLoaded(false); running.current = false; void load();
    const toolsController = new AbortController(); api<{ tools: Tool[] }>('/api/tools', { authenticated: false, signal: toolsController.signal }).then(result => setTools(result.tools)).catch(() => {});
    return () => { controller.current?.abort(); toolsController.abort(); running.current = false; };
  }, [user?.id, filters]);
  return <div className="container page-stack stack history-page"><PageHeading title="編集履歴" description="これまでの写真と、編集中の写真を確認できます。" backHref="/ja/account" backLabel="マイページ" /><div className="section-row"><p className="muted">{loaded ? `${jobs.length} 件の編集を表示` : 'あなたの写真の編集記録'}</p><div className="button-row"><button type="button" className="button button-secondary" disabled={busy} onClick={() => void load()}>更新</button><Link href="/ja/edit" className="button">新しく編集する</Link></div></div>
    <form className={styles.filters} onSubmit={event => { event.preventDefault(); try { const query = new URLSearchParams(personalDateRange(startDay, endDay)); if (status) query.set('status', status); if (toolId) query.set('tool_id', toolId); const next = query.toString(); if (next === filters) void load(); else setFilters(next); } catch { setError(new UserFacingError('日本時間の日付を確認してください。終了日は開始日以降を選んでください。')); } }}>
      <label>編集の状態<select aria-label="編集の状態" value={status} onChange={event => setStatus(event.target.value)}><option value="">すべて</option>{Object.entries(stateNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>機能<select aria-label="機能" value={toolId} onChange={event => setToolId(event.target.value)}><option value="">すべての機能</option>{tools.map(tool => <option key={tool.tool_id} value={tool.tool_id}>{tool.name_ja}</option>)}</select></label>
      <label>開始日（日本時間）<input type="date" value={startDay} onChange={event => setStartDay(event.target.value)} /></label>
      <label>終了日（日本時間）<input type="date" value={endDay} onChange={event => setEndDay(event.target.value)} /></label>
      <button className="button button-secondary" type="submit" disabled={busy}>絞り込む</button>
      <button className="text-button" type="button" disabled={busy} onClick={() => { setStatus(''); setToolId(''); setStartDay(''); setEndDay(''); if (!filters) void load(); else setFilters(''); }}>条件をリセット</button>
    </form>
    {!!error && <ErrorNotice error={error} onRetry={() => void load(jobs.length > 0 && !!cursor)} />}
    {loaded && !jobs.length && <section className="surface empty-state"><span className="empty-symbol" aria-hidden="true">＋</span><h2>{filters ? '該当する編集はありません' : '最初の一枚を、編集してみませんか。'}</h2><p>{filters ? '条件を変更して、もう一度ご確認ください。' : '編集した写真や、処理中の写真がここに並びます。'}</p><Link className="button" href="/ja/edit">写真を編集する</Link></section>}
    {!!jobs.length && <div className="history-grid">{jobs.map(job => <HistoryCard key={job.job_id} job={job} name={tools.find(tool => tool.tool_id === job.tool_id)?.name_ja ?? findHistoricalToolContent(job.tool_id)?.name_ja ?? '写真の編集'} />)}</div>}
    {busy && <Loading label="編集履歴を読み込んでいます" />}{cursor && !busy && <div className="center-actions"><button type="button" className="button button-secondary" onClick={() => void load(true)}>もっと見る</button></div>}
    <p className="fine-print">保存期間を過ぎた写真や削除済みの写真は、プレビューを表示できない場合があります。処理状況は各編集の詳細で確認できます。</p>
  </div>;
}
