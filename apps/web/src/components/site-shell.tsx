'use client';
import Link from 'next/link';
import { usePathname,useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { Icon } from './ui';
import { Brand } from './brand';
import { loginHref } from '../lib/navigation';
const items=[{href:'/ja/tools',label:'ツール',icon:'tools'},{href:'/ja/edit',label:'写真を編集',mobile:'編集',icon:'edit'},{href:'/ja/history',label:'履歴',icon:'clock'},{href:'/ja/pricing',label:'料金',icon:'image'}];
export function SiteShell({children}:{children:ReactNode}){
 const pathname=usePathname();const query=useSearchParams();const {user}=useAuth();
 const editing=pathname==='/ja/edit';
 const accountHref=user?'/ja/account':loginHref(pathname==='/ja/login'?query.get('next')??'/ja/edit':pathname+(query.size?`?${query}`:''));
 const accountCurrent=user?pathname==='/ja/account':pathname==='/ja/login';
 return <><a href="#main" className="skip-link">本文へ移動</a><header className={`site-header${editing?' editing-header':''}`}><div className="header-inner"><Link href="/ja/" className="home-link" aria-current={pathname==='/ja'?'page':undefined} aria-label="picmoko ホーム"><Brand/></Link><nav className="desktop-nav" aria-label="メインナビゲーション">{items.map(item=><Link key={item.href} href={item.href} aria-current={pathname.startsWith(item.href)?'page':undefined}>{item.label}</Link>)}</nav>{editing&&<Link className="header-context-link" href="/ja/history">履歴</Link>}<Link className={`header-account${user?'':' header-login'}`} href={accountHref} aria-label={user?'マイページ':'ログイン・新規登録'} aria-current={accountCurrent?'page':undefined}><Icon name="person" size={18}/><span>{user?'マイページ':<>ログイン<span className="header-signup">・新規登録</span></>}</span></Link></div></header><main id="main" className="site-main" tabIndex={-1}>{children}</main><footer className="site-footer"><div className="footer-inner"><Link href="/ja/" aria-label="picmoko ホーム"><Brand compact/></Link><nav aria-label="フッターナビゲーション"><Link href="/ja/help">ヘルプ</Link><Link href="/ja/legal/terms">利用規約</Link><Link href="/ja/legal/privacy">プライバシー</Link><Link href="/ja/legal/commercial-disclosure">事業者情報</Link></nav></div></footer>{!editing&&<nav className="mobile-nav" aria-label="モバイルナビゲーション">{items.slice(0,3).map(item=><Link key={item.href} href={item.href} aria-current={pathname.startsWith(item.href)?'page':undefined}><Icon name={item.icon} size={22}/><span>{item.mobile??item.label}</span></Link>)}<Link className="mobile-account" href={accountHref} aria-current={accountCurrent?'page':undefined} aria-label={user?'マイページ':'ログイン・新規登録'}><Icon name="person" size={22}/><span>{user?'マイページ':'ログイン'}</span></Link></nav>}</>;
}
