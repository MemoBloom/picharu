'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {Suspense,type ReactNode} from 'react';
import { Icon } from './ui';
import { Brand } from './brand';
import { LoginNavigation, LoginNavigationFallback } from './login-navigation';
import { AnalyticsConsent } from './analytics-consent';
const items=[{href:'/ja/tools',label:'機能',icon:'tools'},{href:'/ja/edit',label:'写真を編集',mobile:'編集',icon:'edit'},{href:'/ja/pricing',label:'料金プラン',icon:'image'},{href:'/ja/help',label:'サポート',icon:'help'}];
export function SiteShell({children}:{children:ReactNode}){
 const pathname=usePathname();
 if(pathname==='/admin'||pathname.startsWith('/admin/'))return <>{children}</>;
 const editing=pathname==='/ja/edit';
 return <><a href="#main" className="skip-link">本文へ移動</a><header className={`site-header${editing?' editing-header':''}`}><div className="header-inner"><Link href="/ja/" className="home-link" aria-current={pathname==='/ja'?'page':undefined} aria-label="picmoko ホーム"><Brand/></Link><nav className="desktop-nav" aria-label="メインナビゲーション">{items.map(item=><Link key={item.href} href={item.href} aria-current={pathname.startsWith(item.href)?'page':undefined}>{item.label}</Link>)}</nav>{editing&&<Link className="header-context-link" href="/ja/help" aria-label="サポート" title="サポート"><Icon name="help" size={22}/></Link>}<Suspense fallback={<LoginNavigationFallback/>}><LoginNavigation/></Suspense></div></header><AnalyticsConsent/><main id="main" className="site-main" tabIndex={-1}>{children}</main><footer className="site-footer"><div className="footer-inner"><Link href="/ja/" aria-label="picmoko ホーム"><Brand compact/></Link><nav aria-label="フッターナビゲーション"><Link href="/ja/guides">写真編集ガイド</Link><Link href="/ja/help">サポート</Link><Link href="/ja/legal/terms">利用規約</Link><Link href="/ja/legal/privacy">プライバシー</Link><Link href="/ja/legal/commercial-disclosure">事業者情報</Link></nav></div></footer>{!editing&&<nav className="mobile-nav" aria-label="モバイルナビゲーション">{items.filter(item=>item.href!=='/ja/pricing').map(item=><Link key={item.href} href={item.href} aria-current={pathname.startsWith(item.href)?'page':undefined}><Icon name={item.icon} size={22}/><span>{item.mobile??item.label}</span></Link>)}<Suspense fallback={<LoginNavigationFallback mobile/>}><LoginNavigation mobile/></Suspense></nav>}</>;
}
