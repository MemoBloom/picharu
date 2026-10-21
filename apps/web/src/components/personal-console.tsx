'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { z } from 'zod';
import type { PersonalSummary, PersonalLedgerPage, PersonalWorksPage, LedgerKind } from '@picjp/contracts';
import { api } from '../lib/api';
import { findHistoricalToolContent as findToolContent } from '../lib/tool-content';
import { ErrorNotice, Loading, Notice } from './ui';
import styles from './personal-console.module.css';

type Summary = z.infer<typeof PersonalSummary>;
type Ledger = z.infer<typeof PersonalLedgerPage>;
type Works = z.infer<typeof PersonalWorksPage>;
const formatDate = (value: string) => new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }).format(new Date(value));
const statuses: Record<string, string> = { queued: '順番待ち', processing: '編集中', completed: '完了', failed: '編集できませんでした', cancelled: 'キャンセル済み' };
const kinds: Record<z.infer<typeof LedgerKind>, string> = { reserve: '編集の予約', release: '予約の返還', consume: '編集に利用', purchase: '購入', revoke: '返金等による取消', adjustment: '残高の調整' };
const amount = (value: number) => `${value > 0 ? '+' : ''}${value.toLocaleString('ja-JP')}`;

/** Mounted under an owner-keyed AccountContent. No cross-user shared cache. */
export function PersonalOverview() {
  const [data, setData] = useState<Summary | null>(null), [error, setError] = useState<unknown>(null), [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError(null);
    api<Summary>('/api/dashboard', { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setData(value); }).catch(value => { if (!controller.signal.aborted) setError(value); });
    return () => controller.abort();
  }, [refresh]);
  return <div className="stack">
    <div className="section-row"><h2>ご利用の状況</h2><button type="button" className="text-button" onClick={() => setRefresh(v => v + 1)}>更新</button></div>
    {!!error && <ErrorNotice error={error} onRetry={() => setRefresh(v => v + 1)} />}
    {!data && !error && <Loading label="ご利用の状況を読み込んでいます" />}
    {data && <>
      {data.credits.status === 'restricted' && <Notice tone="error">現在、新しい編集の利用が制限されています。購入履歴とヘルプをご確認ください。</Notice>}
      <dl className={styles.metrics}>
        <div><dt>利用可能なクレジット</dt><dd>{data.credits.available.toLocaleString('ja-JP')}</dd></div>
        <div><dt>処理中の予約分</dt><dd>{data.credits.reserved.toLocaleString('ja-JP')}</dd></div>
        <div><dt>進行中の編集</dt><dd>{data.ongoing_jobs.toLocaleString('ja-JP')}<small> 件</small></dd></div>
        <div><dt>お支払い確認中</dt><dd>{data.pending_orders.toLocaleString('ja-JP')}<small> 件</small></dd></div>
      </dl>
      <div className="button-row"><Link className="button" href="/ja/edit">写真を編集する</Link><Link className="button button-secondary" href="/ja/account?tab=credits">クレジットを確認</Link><Link className="text-link" href="/ja/account?tab=orders">購入履歴</Link></div>
      <div className={styles.period}><h3>最近30日間の編集</h3><p className="fine-print">{formatDate(data.window.start)}〜{formatDate(data.window.end)}（日本時間）</p>
        <dl className={styles.statuses}>{Object.entries(data.jobs).filter(([key]) => key !== 'total').map(([key, value]) => <div key={key}><dt>{statuses[key]}</dt><dd>{value.toLocaleString('ja-JP')} 件</dd></div>)}</dl>
        <p>利用したクレジット：<strong>{data.consumed_credits.toLocaleString('ja-JP')}</strong><span className="fine-print">（予約・返還は含みません）</span></p>
      </div>
      <section className="stack"><div className="section-row"><h3>最近の編集</h3><Link className="text-link" href="/ja/history">すべて見る</Link></div>
        {data.recent_jobs.length ? <ul className={styles.rows}>{data.recent_jobs.map(job => <li key={job.job_id}><Link href={`/ja/jobs/${job.job_id}`}><span>{findToolContent(job.tool_id)?.name_ja ?? job.tool_id}<small>{formatDate(job.created_at)}</small></span><span>{statuses[job.status]}</span></Link></li>)}</ul> : <p className="muted">まだ編集履歴はありません。最初の一枚を編集してみませんか。</p>}
      </section>
      <section className="stack"><h3>保存期間内の最近の作品</h3>{data.recent_works.length ? <ul className={styles.rows}>{data.recent_works.map(job => <li key={job.job_id}><Link href={`/ja/jobs/${job.job_id}`}>{findToolContent(job.tool_id)?.name_ja ?? job.tool_id}<span>結果を見る</span></Link></li>)}</ul> : <p className="muted">現在表示できる作品はありません。</p>}</section>
      <p className="fine-print">確認日時：{formatDate(data.as_of)}（日本時間）。写真は保存期間を過ぎると表示・ダウンロードできません。</p>
    </>}
  </div>;
}

type PersonalPage<T> = { as_of: string; snapshot_before: string; items: T[]; next_cursor: string | null };
function usePersonalPage<T>(path: string, filters: string) {
  const [rows, setRows] = useState<T[]>([]), [cursor, setCursor] = useState<string | null>(null), [before, setBefore] = useState<string | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null), [error, setError] = useState<unknown>(null), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false);
  const controller = useRef<AbortController | null>(null), pending = useRef(false);
  async function load(append = false) {
    if (append && pending.current) return;
    controller.current?.abort(); const request = new AbortController(); controller.current = request; pending.current = true; setBusy(true); setError(null);
    const query = new URLSearchParams(filters); query.set('limit', '20');
    if (append && cursor && before) { query.set('cursor', cursor); query.set('before', before); }
    try {
      const result = await api<PersonalPage<T>>(`${path}?${query}`, { signal: request.signal });
      if (!request.signal.aborted) { setRows(previous => append ? [...previous, ...result.items] : result.items); setCursor(result.next_cursor); setBefore(result.snapshot_before); setAsOf(result.as_of); setLoaded(true); }
    } catch (value) { if (!request.signal.aborted) setError(value); }
    finally { if (!request.signal.aborted) { setBusy(false); pending.current = false; } }
  }
  useEffect(() => {
    setRows([]); setCursor(null); setBefore(null); setAsOf(null); setLoaded(false); void load();
    return () => { controller.current?.abort(); pending.current = false; };
  }, [path, filters]);
  return { rows, cursor, asOf, error, busy, loaded, load };
}

export function PersonalLedger() {
  const [kind, setKind] = useState('');
  const page = usePersonalPage<Ledger['items'][number]>('/api/credits/ledger', kind ? new URLSearchParams({ kind }).toString() : '');
  return <section className="stack" aria-labelledby="personal-ledger-title">
    <div className="section-row"><h3 id="personal-ledger-title">クレジットの明細</h3><button className="text-button" type="button" disabled={page.busy} onClick={() => void page.load()}>更新</button></div>
    <label className={styles.filter}>明細の種類<select value={kind} onChange={e => setKind(e.target.value)}><option value="">すべて</option>{Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <p className="fine-print">利用可能分と予約分の増減を別々に表示します。予約の返還は、新しい購入ではありません。</p>
    <p className={`${styles.scrollHint} fine-print`}>明細表を横にスクロールすると、予約分と関連する記録を確認できます。</p>
    {!!page.error && <ErrorNotice error={page.error} onRetry={() => void page.load(!!page.rows.length && !!page.cursor)} />}
    {!!page.rows.length && <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="クレジット明細表（横にスクロールできます）"><table className={styles.table}><thead><tr><th scope="col">日時・内容</th><th scope="col">利用可能分</th><th scope="col">予約分</th><th scope="col">関連記録</th></tr></thead><tbody>{page.rows.map(entry => <tr key={entry.entry_id}><th scope="row">{kinds[entry.kind]}<small>{formatDate(entry.created_at)}</small></th><td>{amount(entry.available_delta)}</td><td>{amount(entry.reserved_delta)}</td><td>{entry.reference_id && entry.reference_type === 'job' ? <Link className="text-link" href={`/ja/jobs/${entry.reference_id}`}>編集を見る</Link> : entry.reference_type === 'order' ? <Link className="text-link" href="/ja/account?tab=orders">購入履歴</Link> : '—'}</td></tr>)}</tbody></table></div>}
    {page.loaded && !page.rows.length && !page.error && <p className="muted">該当する明細はありません。</p>}
    {page.busy && <Loading label="明細を読み込んでいます" />}
    {page.cursor && <button className="button button-secondary" type="button" disabled={page.busy} onClick={() => void page.load(true)}>もっと見る</button>}
    {page.asOf && <p className="fine-print">確認日時：{formatDate(page.asOf)}（日本時間）</p>}
  </section>;
}

export function PersonalWorks() {
  const [availability, setAvailability] = useState('ready');
  const page = usePersonalPage<Works['items'][number]>('/api/account/works', availability ? new URLSearchParams({ availability }).toString() : '');
  const labels: Record<string, string> = { ready: '表示できる作品', expired: '保存期間終了', deleted: '削除済み', missing: '現在表示できません' };
  return <section className="stack">
    <div className="section-row"><h2>私の作品</h2><button className="text-button" type="button" disabled={page.busy} onClick={() => void page.load()}>更新</button></div>
    <label className={styles.filter}>作品の状態<select value={availability} onChange={e => setAvailability(e.target.value)}><option value="">すべての作品記録</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {!!page.error && <ErrorNotice error={page.error} onRetry={() => void page.load(!!page.rows.length && !!page.cursor)} />}
    <ul className={styles.rows}>{page.rows.map(work => <li key={work.job.job_id}><Link href={`/ja/jobs/${work.job.job_id}`}><span>{findToolContent(work.job.tool_id)?.name_ja ?? work.job.tool_id}<small>{formatDate(work.job.created_at)} · {labels[work.availability]}</small>{work.expires_at && work.availability === 'ready' && <small>保存期限：{formatDate(work.expires_at)}</small>}</span><span>{work.availability === 'ready' ? '結果・保存' : '編集記録'}</span></Link></li>)}</ul>
    {page.loaded && !page.rows.length && !page.error && <p className="muted">該当する作品はありません。</p>}
    {page.busy && <Loading label="作品を読み込んでいます" />}
    {page.cursor && <button className="button button-secondary" type="button" disabled={page.busy} onClick={() => void page.load(true)}>もっと見る</button>}
    <p className="fine-print">表示できる作品の詳細から、プレビュー・ダウンロード・続きの編集・削除を行えます。作品一覧に記録が残っていても、写真の保存期間は延長されません。</p>
  </section>;
}
