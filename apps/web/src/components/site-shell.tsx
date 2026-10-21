'use client';
import Link from 'next/link';
import { usePathname,useSearchParams } from 'next/navigation';
import {useEffect,useState,type ReactNode} from 'react';
import { useAuth } from '../lib/auth';
import { Icon } from './ui';
import { loginHref } from '../lib/navigation';
const items=[{href:'/ja/tools',label:'ツール',icon:'tools'},{href:'/ja/edit',label:'写真を編集',mobile:'編集',icon:'edit'},{href:'/ja/history',label:'履歴',icon:'clock'},{href:'/ja/pricing',label:'料金',icon:'image'}];
export function SiteShell({children}:{children:ReactNode}){
 const pathname=usePathname();const query=useSearchParams();const {user}=useAuth();
 const [hydrated,setHydrated]=useState(false);useEffect(()=>setHydrated(true),[]);const signedIn=hydrated&&!!user;
 if(pathname==='/admin'||pathname.startsWith('/admin/'))return <>{children}</>;
 return <><a href="#main" className="skip-link">本文へ移動</a><header className="site-header"><div className="header-inner"><Link href="/ja/" className="home-link" aria-current={pathname==='/ja'?'page':undefined}>ホーム</Link><nav className="desktop-nav" aria-label="メインナビゲーション">{items.map(item=><Link key={item.href} href={item.href} aria-current={pathname.startsWith(item.href)?'page':undefined}>{item.label}</Link>)}</nav><Link className="header-account" href={signedIn?'/ja/account':loginHref(pathname+(query.size?`?${query}`:''))}>{signedIn?'マイページ':'ログイン'}</Link></div></header><main id="main" className="site-main" tabIndex={-1}>{children}</main><footer className="site-footer"><div className="footer-inner"><p>写真を、もっと自分らしく。</p><nav aria-label="フッターナビゲーション"><Link href="/ja/help">ヘルプ</Link><Link href="/ja/legal/terms">利用規約</Link><Link href="/ja/legal/privacy">プライバシー</Link><Link href="/ja/legal/commercial-disclosure">事業者情報</Link></nav></div></footer><nav className="mobile-nav" aria-label="モバイルナビゲーション">{items.slice(0,3).map(item=><Link key={item.href} href={item.href} aria-current={pathname.startsWith(item.href)?'page':undefined}><Icon name={item.icon} size={22}/><span>{item.mobile??item.label}</span></Link>)}</nav></>;
}
