'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { finishReauthentication, getBrowserAuth, useAuth } from '../lib/auth';
import { safeNext } from '../lib/navigation';
import { Loading, Notice, PageHeading } from './ui';

function authError(code?: string) {
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return 'しばらく時間をおいてから、もう一度お試しください。';
  if (code === 'email_address_invalid' || code === 'validation_failed') return 'メールアドレスをご確認ください。';
  return 'ログインを開始できませんでした。時間をおいて、もう一度お試しください。';
}
function loginTarget(value: string | null) { const target = safeNext(value); return target.split('?')[0] === '/ja/login' ? '/ja/edit' : target; }

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
  useEffect(() => { setNext(loginTarget(new URLSearchParams(window.location.search).get('next'))); }, []);
  useEffect(() => { if (auth.ready && auth.user) router.replace(loginTarget(new URLSearchParams(window.location.search).get('next'))); }, [auth.ready, auth.user, router]);
  useEffect(() => { if (!resendAt) return; setNow(Date.now()); const timer = window.setInterval(() => { const time = Date.now(); setNow(time); if (time >= resendAt) window.clearInterval(timer); }, 1000); return () => window.clearInterval(timer); }, [resendAt]);
  const waiting = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const callback = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  async function google() {
    const client = getBrowserAuth(); if (!client || busy) return;
    setBusy('google'); setError('');
    try { const result = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callback() } }); if (result.error || !result.data.url) { setError(authError(result.error?.code)); setBusy(null); } }
    catch { setError(authError()); setBusy(null); }
  }
  async function sendEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const client = getBrowserAuth(); if (!client || busy || waiting) return;
    setBusy('email'); setError('');
    try {
      const result = await client.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: callback(), shouldCreateUser: true } });
      if (result.error) { setSent(false); setError(authError(result.error.code)); }
      else { setSent(true); setResendAt(Date.now() + 60000); setNow(Date.now()); }
    } catch { setError(authError()); } finally { setBusy(null); }
  }
  return <div className="container page-stack auth-panel surface stack">
    <PageHeading title="写真の続きを、ここから。" description="ログインすると、写真の編集や履歴の確認ができます。初めての方も同じ方法で始められます。" />
    {!auth.ready ? <Loading label="ログイン状態を確認しています" /> : !auth.configured ? <Notice>ログイン機能はただいま準備中です。ツールの紹介はログインせずにご覧いただけます。</Notice> : auth.user ? <Loading label="元のページに戻っています" /> : <>
      <button type="button" className="button button-secondary" disabled={!!busy} onClick={google}>{busy === 'google' ? 'Google に接続しています…' : 'Google で続ける'}</button>
      <div className="auth-divider"><span>またはメールアドレスで</span></div>
      <form className="stack" onSubmit={sendEmail}>
        <label className="field">メールアドレス<input type="email" name="email" required maxLength={254} value={email} onChange={event => { setEmail(event.target.value); setSent(false); }} autoComplete="email" inputMode="email" placeholder="you@example.com" disabled={!!busy} /></label>
        <button className="button" type="submit" disabled={!!busy || waiting > 0}>{busy === 'email' ? '送信しています…' : waiting > 0 ? `${waiting} 秒後に再送できます` : sent ? 'ログインリンクを再送する' : 'ログインリンクを送る'}</button>
      </form>
      {sent && <Notice tone="success">メールを送信しました。このブラウザーでメール内のリンクを開いてください。届かない場合は迷惑メールフォルダーもご確認ください。</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <p className="fine-print">ご利用前に<Link href="/ja/legal/terms">利用規約</Link>と<Link href="/ja/legal/privacy">プライバシーポリシー</Link>をご確認ください。正式な内容は公開準備中です。</p>
    </>}
    <Link href="/ja/tools" className="text-link">まずはツールを見てみる →</Link>
  </div>;
}

export function AuthCallbackPage() {
  const router = useRouter();
  const started = useRef<Promise<{ error: { message: string } | null }> | null>(null);
  const [error, setError] = useState('');
  const [next, setNext] = useState('/ja/edit');
  useEffect(() => {
    let alive = true;
    const query = new URLSearchParams(window.location.search); const target = loginTarget(query.get('next')); setNext(target);
    const client = getBrowserAuth(); const code = query.get('code');
    if (!client || !code || query.has('error')) { setError('ログインリンクを確認できませんでした。もう一度ログインをお試しください。'); return; }
    started.current ??= client.auth.exchangeCodeForSession(code);
    started.current.then(async result => { if (!alive) return; if (result.error) setError('リンクの有効期限が切れているか、別のブラウザーで開かれています。ログイン画面からやり直してください。'); else { await finishReauthentication(); if (alive) router.replace(target); } }).catch(() => { if (alive) setError('接続を確認できませんでした。ログイン画面からもう一度お試しください。'); });
    return () => { alive = false; };
  }, [router]);
  return <div className="container page-stack auth-panel surface stack"><PageHeading title={error ? 'ログインを確認できませんでした' : 'ログインを確認しています'} />{error ? <><Notice tone="error">{error}</Notice><Link className="button" href={`/ja/login?next=${encodeURIComponent(next)}`}>ログイン画面に戻る</Link></> : <Loading label="このままお待ちください" />}</div>;
}
