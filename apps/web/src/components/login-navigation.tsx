'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '../lib/auth';
import { loginHref } from '../lib/navigation';
export function LoginNavigation() {
  const path = usePathname(); const query = useSearchParams(); const { user } = useAuth();
  const target = path === '/ja/login' ? query.get('next') || '/ja/edit' : path + (query.size ? `?${query}` : '');
  return <Link className="header-account" href={user ? '/ja/account' : loginHref(target)}>{user ? 'マイページ' : 'ログイン・新規登録'}</Link>;
}
