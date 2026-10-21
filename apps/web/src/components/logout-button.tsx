'use client';

import { useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { Icon } from './ui';

export function LogoutButton({ className = 'button button-secondary' }: { className?: string }) {
  const { signOut } = useAuth();
  const pending = useRef(false);
  const [signingOut, setSigningOut] = useState(false);
  const [failed, setFailed] = useState(false);

  async function logout() {
    if (pending.current) return;
    pending.current = true;
    setSigningOut(true);
    setFailed(false);
    try {
      await signOut();
      // A full navigation also discards cached private pages after signing out.
      window.location.replace('/ja/');
    } catch {
      pending.current = false;
      setSigningOut(false);
      setFailed(true);
    }
  }

  return <div className="logout-action">
    <button type="button" className={className} disabled={signingOut} onClick={logout}>
      <Icon name="logout" size={18} />{signingOut ? 'ログアウトしています…' : 'ログアウト'}
    </button>
    {failed && <p className="logout-error" role="alert">ログアウトできませんでした。接続を確認して、もう一度お試しください。</p>}
  </div>;
}
