import type { Metadata,Viewport } from 'next';
import { AuthProvider } from '../lib/auth';
import { SiteShell } from '../components/site-shell';
import { AnalyticsProvider } from '../components/analytics-provider';
import { indexingEnabled, seoOrigin } from '../lib/seo';
import './fonts.css';
import './globals.css';
import './picmoko.css';
import './typography.css';
export const metadata:Metadata={metadataBase:new URL(seoOrigin()),robots:{index:indexingEnabled(),follow:true},title:{default:'picmoko | AIで写真を、もっと自由に。',template:'%s | picmoko'},description:'写真を選んで、好きな仕上がりへ。日常の写真からポートレート、イラストまで。'};
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#ffffff'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ja" data-scroll-behavior="smooth"><body><AuthProvider><AnalyticsProvider><SiteShell>{children}</SiteShell></AnalyticsProvider></AuthProvider></body></html>;}
