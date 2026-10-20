'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { finishReauthentication, getBrowserAuth, useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { trackSeoEvent } from '../lib/seo-analytics';
import { browserLoginStorage, consumeLoginTarget, createLoginCompletion, LoginFlowError, loginTarget, parseLoginCallback, startEmailLogin, startGoogleLogin } from '../lib/auth-flow';
import { Loading, Notice, PageHeading } from './ui';

function authError(code?: string) {
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return 'しばらく時間をおいてから、もう一度お試しください。';
  if (code === 'email_address_invalid' || code === 'validation_failed') return 'メールアドレスをご確認ください。';
  if (code === 'email_address_not_authorized') return 'このメールアドレスにはまだログインメールを送れません。別のログイン方法をお試しください。';
  return 'ログインを開始できませんでした。時間をおいて、もう一度お試しください。';
}

export function LoginPage() {
  const auth = useAuth();
  const router = useRouter();
  const [next, setNext] = useState('/ja/edit');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<'google' | 'email' | null>(null);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(0);
  const [verification, setVerification] = useState(0);
  useEffect(() => { setNext(loginTarget(new URLSearchParams(window.location.search).get('next'))); }, []);
  useEffect(() => {
    if (!auth.ready || !auth.user) return;
    const controller = new AbortController(); const ownerId = auth.user.id; setError('');
    api<{ user_id: string }>('/api/me', { signal: controller.signal }).then(account => {
      if (controller.signal.aborted) return;
      if (account.user_id !== ownerId) throw new LoginFlowError('SESSION_UNAVAILABLE');
      router.replace(loginTarget(new URLSearchParams(window.location.search).get('next')));
    }).catch(() => { if (!controller.signal.aborted) setError('アカウントの準備を確認できませんでした。時間をおいて、もう一度確認してください。'); });
    return () => controller.abort();
  }, [auth.ready, auth.user?.id, router, verification]);
  useEffect(() => { if (!resendAt) return; setNow(Date.now()); const timer = window.setInterval(() => { const time = Date.now(); setNow(time); if (time >= resendAt) window.clearInterval(timer); }, 1000); return () => window.clearInterval(timer); }, [resendAt]);
  const waiting = Math.max(0, Math.ceil((resendAt - now) / 1000));
  async function google() {
    const client = getBrowserAuth(); if (!client || busy) return;
    setBusy('google'); setError(''); void trackSeoEvent('login_start');
    try { const result = await startGoogleLogin(client, window.location.origin, next, browserLoginStorage()); if (result.error || !result.data.url) { setError(authError(result.error?.code)); setBusy(null); } }
    catch { setError(authError()); setBusy(null); }
  }
  async function sendEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const client = getBrowserAuth(); if (!client || busy || waiting) return;
    setBusy('email'); setError(''); void trackSeoEvent('login_start');
    try {
      const result = await startEmailLogin(client, window.location.origin, email, next, browserLoginStorage());
      if (result.error) { setSent(false); setError(authError(result.error.code)); }
      else { setSent(true); setResendAt(Date.now() + 60000); setNow(Date.now()); }
    } catch { setError(authError()); } finally { setBusy(null); }
  }
  return <div className="container page-stack auth-panel surface stack">
    <PageHeading title="ログイン・新規登録" description="写真の続きを、ここから。初めての方は、同じ手順でアカウントを作成できます。" />
    {!auth.ready ? <Loading label="ログイン状態を確認しています" /> : !auth.configured ? <Notice>ログイン機能はただいま準備中です。ツールの紹介はログインせずにご覧いただけます。</Notice> : auth.user ? error ? <><Notice tone="error">{error}</Notice><button className="button" onClick={() => setVerification(value => value + 1)}>アカウントをもう一度確認</button></> : <Loading label="アカウントを確認しています" /> : <>
      <button type="button" className="button button-secondary" disabled={!!busy} onClick={google}>{busy === 'google' ? 'Google に接続しています…' : 'Google で続ける'}</button>
      <div className="auth-divider"><span>またはメールアドレスで</span></div>
      <form className="stack" onSubmit={sendEmail}>
        <label className="field">メールアドレス<input type="email" name="email" required maxLength={254} value={email} onChange={event => { setEmail(event.target.value); setSent(false); }} autoComplete="email" inputMode="email" placeholder="you@example.com" disabled={!!busy} /></label>
        <button className="button" type="submit" disabled={!!busy || waiting > 0}>{busy === 'email' ? '送信しています…' : waiting > 0 ? `${waiting} 秒後に再送できます` : sent ? 'ログインリンクを再送する' : 'ログインリンクを送る'}</button>
      </form>
      {sent && <Notice tone="success">ログインリンクを送信しました。メール内のリンクを開いてください。届かない場合は迷惑メールフォルダーもご確認ください。</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <p className="fine-print">ご利用前に<Link href="/ja/legal/terms">利用規約</Link>と<Link href="/ja/legal/privacy">プライバシーポリシー</Link>をご確認ください。正式な内容は公開準備中です。</p>
    </>}
    <Link href="/ja/tools" className="text-link">まずはツールを見てみる →</Link>
  </div>;
}

export function AuthCallbackPage() {
  const router = useRouter();
  const completion = useRef<ReturnType<typeof createLoginCompletion> | null>(null);
  const callbackTarget = useRef('/ja/edit');
  const [error, setError] = useState('');
  const [retryable, setRetryable] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [next, setNext] = useState('/ja/edit');
  useEffect(() => {
    let alive = true; const controller = new AbortController(); setError(''); setRetryable(false);
    try {
      if (!completion.current) {
        const href = window.location.href; const query = new URL(href).searchParams;
        const storedTarget = consumeLoginTarget(browserLoginStorage());
        callbackTarget.current = loginTarget(query.get('next') ?? storedTarget); setNext(callbackTarget.current);
        // Remove one-time credentials before rendering errors or navigating elsewhere.
        window.history.replaceState(null, '', '/auth/callback');
        const client = getBrowserAuth(); if (!client) throw new LoginFlowError('INVALID_CALLBACK');
        completion.current = createLoginCompletion(client, parseLoginCallback(href), signal => api<{ user_id: string }>('/api/me', { signal }));
      }
      completion.current(controller.signal).then(async ownerId => {
        if (!alive) return;
        await finishReauthentication(ownerId);
        void trackSeoEvent('login_complete');
        if (alive) router.replace(callbackTarget.current);
      }).catch(cause => {
        if (!alive) return;
        const retry = cause instanceof LoginFlowError && cause.retryable; setRetryable(retry);
        setError(retry ? 'ログインは確認できましたが、アカウントの準備を確認できませんでした。もう一度確認してください。' : 'リンクの有効期限が切れているか、ログインを確認できませんでした。ログイン画面からやり直してください。');
      });
    } catch { setError('ログインリンクを確認できませんでした。もう一度ログインをお試しください。'); }
    return () => { alive = false; controller.abort(); };
  }, [router, attempt]);
  return <div className="container page-stack auth-panel surface stack"><PageHeading title={error ? 'ログインを確認できませんでした' : 'ログインを確認しています'} />{error ? <><Notice tone="error">{error}</Notice>{retryable && <button className="button" onClick={() => setAttempt(value => value + 1)}>アカウントをもう一度確認</button>}<Link className="button button-secondary" href={`/ja/login?next=${encodeURIComponent(next)}`}>ログイン画面に戻る</Link></> : <Loading label="アカウントの準備を確認しています" />}</div>;
}
