'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PersonalOverview, PersonalLedger, PersonalWorks } from './personal-console';
import consoleStyles from './personal-console.module.css';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { safeNext } from '../lib/navigation';
import type { Credits, Order, CreditPackage, Checkout, Page } from '../lib/types';
import { AuthGate, ErrorNotice, Loading, Notice, PageHeading } from './ui';

type Me = { user_id: string; email: string | null; locale: string };
type CheckoutIntent = { package_id: string; idempotency_key: string; order_id?: string; return_to: string };
const yen = (amount: number) => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(amount);
const date = (value: string) => new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Tokyo' }).format(new Date(value));
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const checkoutKey = (userId: string) => `picjp:checkout:${userId}`;
function readIntent(userId: string): CheckoutIntent | null {
  try { const value = JSON.parse(sessionStorage.getItem(checkoutKey(userId)) ?? 'null'); if (!value || !uuid.test(value.package_id) || typeof value.idempotency_key !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(value.idempotency_key) || (value.order_id && !uuid.test(value.order_id))) return null; return { ...value, return_to: safeNext(value.return_to) }; } catch { return null; }
}
function writeIntent(userId: string, intent: CheckoutIntent) { sessionStorage.setItem(checkoutKey(userId), JSON.stringify(intent)); }
function orderLabel(status: string) { return ({ pending: 'お支払い確認中', paid: 'お支払い済み', partially_refunded: '一部返金済み', refunded: '返金済み', disputed: 'お支払いの確認が必要です' } as Record<string, string>)[status] ?? '状態を確認中'; }

function OrderList({ orders }: { orders: Order[] }) {
  return <div className="order-list">{orders.map(order => <article className="order-row" key={order.order_id}>
    <div><strong>{order.credits.toLocaleString('ja-JP')} クレジット</strong><p className="muted">{date(order.created_at)}</p></div>
    <div className="order-summary"><strong>{yen(order.amount_minor)}</strong><span className={`status-badge ${order.status === 'paid' ? 'status-completed' : ''}`}>{orderLabel(order.status)}</span></div>
    <details className="order-details"><summary>注文の詳細</summary><dl><div><dt>注文番号</dt><dd className="break-anywhere">{order.order_id}</dd></div><div><dt>返金額</dt><dd>{yen(order.refunded_minor)}</dd></div></dl><p className="fine-print">返金後の利用可能なクレジットは、現在の残高をご確認ください。</p></details>
  </article>)}</div>;
}

const accountTabs = [['overview', 'ご利用状況'], ['works', '私の作品'], ['credits', 'クレジット'], ['orders', '購入履歴'], ['profile', 'プロフィール']] as const;
type AccountTab = typeof accountTabs[number][0];
export function AccountPage() { const { user } = useAuth(); return <AuthGate><AccountContent key={user?.id ?? 'anonymous'} /></AuthGate>; }
function AccountContent() {
  const { user, signOut } = useAuth();
  const query = useSearchParams();
  const requestedTab = query.get('tab');
  const [tab, setTab] = useState<AccountTab>(() => accountTabs.some(([value]) => value === requestedTab) ? requestedTab as AccountTab : 'overview');
  const [me, setMe] = useState<Me | null>(null); const [credits, setCredits] = useState<Credits | null>(null);
  const [orders, setOrders] = useState<Order[]>([]); const [cursor, setCursor] = useState<string | null>(null);
  const [loadedOrders, setLoadedOrders] = useState(false); const [loadingOrders, setLoadingOrders] = useState(false);
  const [error, setError] = useState<unknown>(null); const [orderError, setOrderError] = useState<unknown>(null);
  const [refresh, setRefresh] = useState(0); const [signingOut, setSigningOut] = useState(false);
  const orderController = useRef<AbortController | null>(null);
  useEffect(() => { setTab(accountTabs.some(([value]) => value === requestedTab) ? requestedTab as AccountTab : 'overview'); }, [requestedTab]);
  useEffect(() => {
    if (!user) return; const controller = new AbortController(); setError(null); setMe(null); setCredits(null);
    Promise.all([api<Me>('/api/me', { signal: controller.signal }), api<Credits>('/api/credits', { signal: controller.signal })]).then(([profile, balance]) => { setMe(profile); setCredits(balance); }).catch(value => { if (!controller.signal.aborted) setError(value); });
    return () => controller.abort();
  }, [user?.id, refresh]);
  useEffect(() => { setOrders([]); setCursor(null); setLoadedOrders(false); return () => orderController.current?.abort(); }, [user?.id]);
  async function loadOrders(append = false) {
    if (!user || loadingOrders) return; orderController.current?.abort(); const controller = new AbortController(); orderController.current = controller; setLoadingOrders(true); setOrderError(null);
    const query = new URLSearchParams({ limit: '20' }); if (append && cursor) query.set('cursor', cursor);
    try { const result = await api<Page<Order>>(`/api/orders?${query}`, { signal: controller.signal }); if (!controller.signal.aborted) { setOrders(previous => append ? [...previous, ...result.items.filter(item => !previous.some(old => old.order_id === item.order_id))] : result.items); setCursor(result.next_cursor); setLoadedOrders(true); } }
    catch (value) { if (!controller.signal.aborted) setOrderError(value); } finally { if (!controller.signal.aborted) setLoadingOrders(false); }
  }
  useEffect(() => { if (tab === 'orders' && !loadedOrders && !loadingOrders) void loadOrders(); }, [tab, user?.id]);
  function chooseTab(value: typeof tab) { setTab(value); window.history.replaceState(null, '', `/ja/account?tab=${value}`); }
  async function logout() { setSigningOut(true); setError(null); try { await signOut(); window.location.assign('/ja/'); } catch (value) { setError(value); setSigningOut(false); } }
  return <div className={`container page-stack stack account-page ${consoleStyles.accountShell}`}><PageHeading title="マイアカウント" description="クレジットとお支払いの状況を確認できます。" />
    <div className={`tabs ${consoleStyles.tabs}`} role="tablist" aria-label="アカウントメニュー">{accountTabs.map(([value, label]) => <button key={value} id={`tab-${value}`} className={tab === value ? 'tab active' : 'tab'} type="button" role="tab" tabIndex={tab === value ? 0 : -1} aria-selected={tab === value} aria-controls={`panel-${value}`} onClick={() => chooseTab(value)} onKeyDown={event => { const values = accountTabs.map(([value]) => value); const current = values.indexOf(tab); const index = event.key === 'ArrowRight' ? (current + 1) % values.length : event.key === 'ArrowLeft' ? (current + values.length - 1) % values.length : event.key === 'Home' ? 0 : event.key === 'End' ? values.length - 1 : -1; if (index >= 0) { event.preventDefault(); chooseTab(values[index]); const button = document.getElementById(`tab-${values[index]}`); button?.focus(); button?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } }}>{label}</button>)}</div>
    {!!error && <ErrorNotice error={error} onRetry={() => setRefresh(value => value + 1)} />}
    <section className="surface stack" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
      {tab === 'overview' && <PersonalOverview />}
      {tab === 'works' && <PersonalWorks />}
      {tab === 'profile' && <><h2>ログイン情報</h2>{me ? <dl className="profile-details"><div><dt>メールアドレス</dt><dd className="break-anywhere">{me.email ?? 'メールアドレスの登録なし'}</dd></div><div><dt>表示言語</dt><dd>日本語</dd></div></dl> : !error && <Loading />}<p className="muted">メールアドレスの変更・アカウント削除については、ヘルプをご確認ください。</p><div className="button-row"><button type="button" className="button button-secondary" disabled={signingOut} onClick={logout}>{signingOut ? 'ログアウトしています…' : 'ログアウト'}</button><Link href="/ja/help" className="text-link">ヘルプを見る</Link></div></>}
      {tab === 'credits' && <><h2>現在のクレジット</h2>{credits ? <><div className="credit-grid"><div><span className="muted">利用可能</span><strong className="credit-number">{credits.available.toLocaleString('ja-JP')}</strong></div><div><span className="muted">処理中の予約分</span><strong className="credit-number">{credits.reserved.toLocaleString('ja-JP')}</strong></div></div>{credits.status === 'restricted' && <Notice tone="error">現在、このアカウントでは新しい編集を開始できません。購入履歴をご確認のうえ、ヘルプをご覧ください。</Notice>}<p className="muted">処理中の予約分は、新しい編集に利用できません。表示は直近に確認した残高です。</p><div className="button-row"><Link href="/ja/pricing?return_to=%2Fja%2Faccount%3Ftab%3Dcredits" className="button">クレジットを追加する</Link><button type="button" className="button button-secondary" onClick={() => setRefresh(value => value + 1)}>残高を更新</button></div></> : !error && <Loading />}</>}
      {tab === 'credits' && <PersonalLedger />}
      {tab === 'orders' && <><div className="section-row"><h2>購入履歴</h2><button type="button" className="text-button" onClick={() => void loadOrders()} disabled={loadingOrders}>更新</button></div>{!!orderError && <ErrorNotice error={orderError} onRetry={() => void loadOrders(orders.length > 0)} />}{orders.length ? <OrderList orders={orders} /> : loadedOrders ? <div className="empty-state"><h3>購入履歴はまだありません</h3><p>購入したクレジットとお支払いの状況がここに表示されます。</p><Link href="/ja/pricing" className="button button-secondary">料金を見る</Link></div> : null}{loadingOrders && <Loading label="購入履歴を読み込んでいます" />}{cursor && !loadingOrders && <button className="button button-secondary" type="button" onClick={() => void loadOrders(true)}>もっと見る</button>}</>}
    </section>
  </div>;
}

export function PricingPage() {
  const { user, ready, configured } = useAuth();
  const [packages, setPackages] = useState<CreditPackage[] | null>(null); const [error, setError] = useState<unknown>(null); const [errorOrigin, setErrorOrigin] = useState<'packages' | 'checkout'>('packages');
  const [intent, setIntent] = useState<CheckoutIntent | null>(null); const [returnTo, setReturnTo] = useState('/ja/edit');
  const [busy, setBusy] = useState<string | null>(null); const [refresh, setRefresh] = useState(0);
  const purchasing = useRef(false);
  useEffect(() => { const controller = new AbortController(); setError(null); api<{ packages: CreditPackage[] }>('/api/credit-packages', { authenticated: false, signal: controller.signal }).then(result => setPackages(result.packages)).catch(value => { if (!controller.signal.aborted) { setErrorOrigin('packages'); setError(value); } }); return () => controller.abort(); }, [refresh]);
  useEffect(() => { const saved = user ? readIntent(user.id) : null; setIntent(saved); const raw = new URLSearchParams(window.location.search).get('return_to'); setReturnTo(raw ? safeNext(raw) : saved?.return_to ?? '/ja/edit'); }, [user?.id]);
  async function purchase(packageId: string) {
    if (!user || purchasing.current) return; if (intent && intent.package_id !== packageId) return;
    purchasing.current = true; setBusy(packageId); setError(null);
    try {
      const current = intent ?? { package_id: packageId, idempotency_key: `checkout_${crypto.randomUUID()}`, return_to: returnTo };
      // Persist before POST: a lost response must be retried with the same intent.
      writeIntent(user.id, current); setIntent(current);
      const checkout = await api<Checkout>('/api/checkout', { method: 'POST', body: { package_id: current.package_id, idempotency_key: current.idempotency_key } });
      const target = new URL(checkout.checkout_url); if (target.protocol !== 'https:') throw new Error('Checkout URL is not secure');
      const saved = { ...current, order_id: checkout.order_id }; writeIntent(user.id, saved); setIntent(saved); window.location.assign(target.href);
    } catch (value) { setErrorOrigin('checkout'); setError(value); } finally { purchasing.current = false; setBusy(null); }
  }
  function startNewPurchase() { if (!user || busy) return; if (!window.confirm('別の購入手続きを始めます。前の注文は自動では取り消されません。二重のお支払いがないか購入履歴をご確認ください。')) return; try { sessionStorage.removeItem(checkoutKey(user.id)); setIntent(null); } catch { setError(new Error('Session storage is unavailable')); } }
  return <div className="container page-stack stack pricing-page"><PageHeading title="必要な分だけ、クレジットを。" description="編集ごとの利用クレジットは、生成する前に確認できます。" />
    <Notice>クレジットは生成を開始すると予約されます。購入後は編集画面に戻り、内容を確認してから生成してください。</Notice>
    {intent && <Notice>前回の購入手続きが保存されています。同じプランから手続きを再開できます。{intent.order_id && <> <Link className="text-link" href="/ja/billing/success">お支払い状況を確認</Link></>} <button className="text-button" type="button" disabled={!!busy} onClick={startNewPurchase}>別の購入を始める</button></Notice>}
    {!!error && <ErrorNotice error={error} onRetry={() => { if (errorOrigin === 'checkout' && intent) void purchase(intent.package_id); else setRefresh(value => value + 1); }} />}
    {!packages && !error && <Loading label="プランを読み込んでいます" />}
    {packages?.length === 0 && <div className="surface empty-state"><h2>購入プランはただいま準備中です</h2><p>プランの公開まで、ツールの紹介をご覧ください。</p><Link className="button button-secondary" href="/ja/tools">ツールを見る</Link></div>}
    {!!packages?.length && <div className="pricing-grid">{packages.map(plan => <section className="surface stack pricing-card" key={plan.package_id}><h2>{plan.credits.toLocaleString('ja-JP')} <span className="muted">クレジット</span></h2><p className="price-number">{yen(plan.amount_minor)}</p><p className="fine-print">お支払い金額（日本円）</p>{user ? <button type="button" className="button" disabled={!!busy || !!intent && intent.package_id !== plan.package_id} onClick={() => void purchase(plan.package_id)}>{busy === plan.package_id ? 'お支払いページを準備中…' : intent?.package_id === plan.package_id ? '購入手続きを再開' : 'このプランを購入する'}</button> : ready && configured ? <Link href={`/ja/login?next=${encodeURIComponent(`/ja/pricing?return_to=${encodeURIComponent(returnTo)}`)}`} className="button">ログインして購入する</Link> : <button className="button" type="button" disabled>{ready ? 'ログイン機能は準備中です' : '確認しています…'}</button>}</section>)}</div>}
    <section className="surface stack"><h2>購入の前に</h2><p>利用するクレジットはツールと出力設定によって異なります。編集の確認画面に表示される内容をご確認ください。</p><p>お支払い後、クレジットの反映に時間がかかる場合があります。反映待ちの間に、同じ購入を繰り返さないでください。</p><Link className="text-link" href="/ja/legal/commercial-disclosure">販売条件・返金について →</Link></section>
    <Link className="text-link" href={returnTo}>← 元の画面に戻る</Link>
  </div>;
}

export function BillingSuccessPage() { return <AuthGate><BillingContent /></AuthGate>; }
function BillingContent() {
  const { user } = useAuth();
  const [intent, setIntent] = useState<CheckoutIntent | null>(null); const [initialized, setInitialized] = useState(false);
  const [order, setOrder] = useState<Order | null>(null); const [credits, setCredits] = useState<Credits | null>(null);
  const [error, setError] = useState<unknown>(null); const [waiting, setWaiting] = useState(false); const [refresh, setRefresh] = useState(0);
  useEffect(() => { if (!user) return; setIntent(readIntent(user.id)); setInitialized(true); }, [user?.id]);
  useEffect(() => {
    if (!intent?.order_id || !user) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined; let cursor: string | null = null; const deadline = Date.now() + 120000;
    setWaiting(true); setError(null); setOrder(null); setCredits(null);
    async function check() {
      if (controller.signal.aborted) return;
      if (Date.now() >= deadline) { setWaiting(false); return; }
      if (document.hidden) { timer = setTimeout(check, 10000); return; }
      try {
        let found: Order | undefined;
        for (let page = 0; page < 3; page++) {
          const query = new URLSearchParams({ limit: '50' }); if (cursor) query.set('cursor', cursor);
          const result: Page<Order> = await api<Page<Order>>(`/api/orders?${query}`, { signal: controller.signal });
          found = result.items.find(item => item.order_id === intent!.order_id); cursor = result.next_cursor;
          if (found || !cursor) break;
        }
        if (found) {
          setOrder(found);
          if (found.status !== 'pending') { const balance = await api<Credits>('/api/credits', { signal: controller.signal }); setCredits(balance); setWaiting(false); return; }
          // The exact pending order is known; next time refresh the first page.
          cursor = null;
        }
        setError(null); timer = setTimeout(check, 10000);
      } catch (value) { if (!controller.signal.aborted) { setError(value); setWaiting(false); } }
    }
    void check(); return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [intent?.order_id, user?.id, refresh]);
  const paid = order?.status === 'paid' && !!credits;
  return <div className="container page-stack stack billing-page"><PageHeading title={paid ? 'クレジットが反映されました' : 'お支払い状況を確認'} description={paid ? '編集画面に戻って、続きをお楽しみください。' : 'お支払いの結果は、注文とクレジットの残高を照合して確認します。'} />
    <section className="surface stack">{!initialized ? <Loading /> : !intent?.order_id ? <><Notice>このブラウザーに今回の注文情報が見つかりませんでした。購入履歴から注文をご確認ください。</Notice><Link className="button" href="/ja/account?tab=orders">購入履歴を確認する</Link></> : <>
      {!!error && <ErrorNotice error={error} onRetry={() => setRefresh(value => value + 1)} />}
      {waiting && <Loading label="お支払いの反映を確認しています" />}
      {paid && <><Notice tone="success">注文のお支払いが確認できました。</Notice><div className="credit-grid"><div><span className="muted">今回の購入</span><strong className="credit-number">{order.credits.toLocaleString('ja-JP')}</strong></div><div><span className="muted">現在利用可能</span><strong className="credit-number">{credits.available.toLocaleString('ja-JP')}</strong></div></div>{credits.status === 'restricted' && <Notice tone="error">現在、新しい編集の利用が制限されています。購入履歴とヘルプをご確認ください。</Notice>}</>}
      {!paid && !waiting && !error && <Notice>{order && order.status !== 'pending' ? `現在の注文状態：${orderLabel(order.status)}。詳細は購入履歴をご確認ください。` : '確認に時間がかかっています。お支払いが失敗したという意味ではありません。少し時間をおいてから、もう一度確認してください。'}</Notice>}
      {!paid && <p className="muted">この画面では新しい購入や生成を行いません。反映待ちの間に、同じ購入を繰り返さないでください。</p>}
      <div className="button-row">{paid && <Link className="button" href={safeNext(intent.return_to)}>元の画面に戻る</Link>}<Link href="/ja/account?tab=orders" className="button button-secondary">購入履歴を見る</Link>{!waiting && !paid && <button className="button button-secondary" type="button" onClick={() => setRefresh(value => value + 1)}>もう一度確認</button>}</div>
    </>}</section>
    <Link className="text-link" href="/ja/help#help-2">お支払いについてのヘルプ →</Link>
  </div>;
}
