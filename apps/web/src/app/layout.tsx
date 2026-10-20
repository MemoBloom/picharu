import type { Metadata,Viewport } from 'next';
import { AuthProvider } from '../lib/auth';
import { SiteShell } from '../components/site-shell';
import { indexingEnabled, seoOrigin } from '../lib/seo';
import './globals.css';
export const metadata:Metadata={metadataBase:new URL(seoOrigin()),title:{default:'picmoko | AIで写真を、もっと自由に。',template:'%s | picmoko'},description:'写真を選んで、好きな仕上がりへ。日常の写真からポートレート、イラストまで。',robots:{index:indexingEnabled(),follow:true}};
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#ffffff'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ja"><body><AuthProvider><SiteShell>{children}</SiteShell></AuthProvider></body></html>;}
