'use client';

import { useEffect, useState } from 'react';
import { formatElapsed, jobElapsedSeconds, jobStageMessage, jobStep, jobSteps, type ProgressJob } from '../lib/job-state';
import { Icon } from './ui';
import styles from './job-progress.module.css';

export type PollingState = 'live' | 'retrying' | 'paused' | 'stopped';
const titles: Record<string, string> = { queued: '受付が完了しました', processing: '写真を編集中です', completed: '編集が完了しました', failed: '編集を完了できませんでした', cancelled: '編集をキャンセルしました' };
const shortSteps = ['受付・待機', 'AI編集', '保存', '完了'];
export function JobProgress({ job, lastUpdated, polling, retryAt = 0, onRefresh }: { job: ProgressJob; lastUpdated: number; polling: PollingState; retryAt?: number; onRefresh: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const active = job.status === 'queued' || job.status === 'processing';
  useEffect(() => {
    if (!active) return;
    const update = () => { if (document.visibilityState !== 'hidden') setNow(Date.now()); };
    update(); const timer = setInterval(update, 1000);
    document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, [active, job.created_at]);
  const seconds = jobElapsedSeconds(job, now, lastUpdated);
  const step = jobStep(job);
  const reconciling = active && job.stage === 'needs_reconciliation';
  const title = reconciling ? '依頼の状況を確認しています' : titles[job.status] ?? '編集の状況を確認しています';
  const description = active ? (job.status === 'queued' ? jobStageMessage('queued') : jobStageMessage(job.stage)) : job.status === 'completed' ? '仕上がりと元の写真を見比べて、保存できます。' : job.status === 'cancelled' ? 'この依頼の処理をキャンセルしました。' : '編集内容とクレジットの状況をご確認ください。';
  return <section className={styles.progress} aria-label="編集の進み具合">
    <div className={styles.heading}>
      <div className={styles.status} role="status" aria-live="polite"><h2>{active && <span className={styles.activity} data-stopped={polling === 'stopped'} aria-hidden="true"/>}{title}</h2><p>{description}</p></div>
      <p className={styles.elapsed} aria-live="off"><span>{active ? '経過時間' : '受付からの経過時間'}</span><time dateTime={`PT${seconds}S`}>{formatElapsed(seconds)}</time></p>
    </div>
    {step !== null && <ol className={styles.steps} aria-label="編集のステップ">{jobSteps.map((label, index) => <li key={label} data-state={index < step || job.status === 'completed' ? 'done' : index === step ? 'current' : 'waiting'} aria-current={active && index === step ? 'step' : undefined}><span className={styles.marker} aria-hidden="true">{index < step || job.status === 'completed' ? <Icon name="check" size={16}/> : index + 1}</span><span className={styles.full}>{label}</span><span className={styles.short}>{shortSteps[index]}</span><span className="sr-only">{index < step || job.status === 'completed' ? '：完了' : index === step ? '：進行中' : '：待機中'}</span></li>)}</ol>}
    {active && <div className={styles.update}><p role="status" aria-live="polite">{polling === 'stopped' ? '自動更新が止まっています。最新の状態を確認してください。' : polling === 'retrying' ? '接続を再確認しています。同じ依頼を送り直さずお待ちください。' : polling === 'paused' ? 'この画面の状態更新を一時停止しています。画面に戻ると再開します。' : '状態は自動で更新されます。画面を閉じても、マイページの編集履歴から確認できます。'}</p><div className={styles.updateAction}><small>最終確認 {new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Tokyo' }).format(lastUpdated)}</small><button type="button" className="text-button" disabled={retryAt > now} onClick={onRefresh}>状態を更新</button></div></div>}
    {active && seconds >= 60 && <p className={styles.waiting}>処理に時間がかかっています。同じ依頼を新しく送信せず、このページで状況をご確認ください。</p>}
  </section>;
}
