import type { Metadata,Viewport } from 'next';
import { Suspense } from 'react';
import { AuthProvider } from '../lib/auth';
import { SiteShell } from '../components/site-shell';
import { AnalyticsProvider } from '../components/analytics-provider';
import './globals.css';
export const metadata:Metadata={title:{default:'写真を、もっと自分らしく。',template:'%s | 写真編集'},description:'写真を選んで、好きな仕上がりへ。日常の写真からポートレート、イラストまで。'};
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#ffffff'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ja"><body><AuthProvider><Suspense fallback={<div className="container loading">読み込み中です…</div>}><AnalyticsProvider><SiteShell>{children}</SiteShell></AnalyticsProvider></Suspense></AuthProvider></body></html>;}
