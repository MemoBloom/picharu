'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { analyticsChoice, revokeAnalytics, saveAnalyticsChoice, setAnalyticsPublicPath, trackSeoEvent, syncAnalyticsChoice } from '../lib/seo-analytics';

export function AnalyticsConsent() {
  const path = usePathname();
  const [open, setOpen] = useState(false), [error, setError] = useState('');
  const previous = useRef('');
  const enabled = process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === 'true';
  useEffect(()=>{
    if(!enabled)return;
    const sync=()=>{syncAnalyticsChoice();if(analyticsChoice()==='deny')setOpen(false);};
    window.addEventListener('storage',sync);document.addEventListener('visibilitychange',sync);
    return()=>{window.removeEventListener('storage',sync);document.removeEventListener('visibilitychange',sync);};
  },[enabled]);
  useEffect(() => {
    if (!enabled) return;
    const clean = setAnalyticsPublicPath(path);
    setOpen(analyticsChoice() === null && !!clean);
    if (clean && analyticsChoice() === 'allow' && previous.current !== clean) {
      previous.current = clean; void trackSeoEvent('page_view');
      if (clean.startsWith('/ja/tools/')) void trackSeoEvent('tool_view', clean.split('/').at(-1));
    }
    if (path === '/ja/edit' && previous.current !== path) { previous.current = path; void trackSeoEvent('editor_open'); }
  }, [enabled, path]);
  if (!enabled) return null;
  async function choose(allow: boolean) {
    setError(''); saveAnalyticsChoice(allow ? 'allow' : 'deny');
    if (!allow && !await revokeAnalytics()) { setError('設定を保存しました。通信の回復後にもう一度「許可しない」を押すと、サーバー側の停止も確認できます。'); return; }
    setOpen(false);
    if (allow) { previous.current = ''; setAnalyticsPublicPath(path); await trackSeoEvent('page_view'); if (path.startsWith('/ja/tools/')) void trackSeoEvent('tool_view', path.split('/').at(-1)); }
  }
  return <aside className="container analytics-consent" aria-label="アクセス解析の設定" style={{ paddingBlock: 12 }}>
    {open ? <div className="surface stack" style={{ padding: 16 }}><p><strong>サービス改善へのご協力</strong></p><p>許可すると、{process.env.NEXT_PUBLIC_GA4_ENABLED==='true'?'Google Analyticsを含むアクセス解析で、':''}閲覧したツールと編集・購入の利用状況を測定します。写真、メールアドレス、編集内容は解析に送りません。いつでも変更できます。</p><div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}><button className="button" onClick={() => void choose(true)}>許可する</button><button className="button-secondary" onClick={() => void choose(false)}>許可しない</button><button className="text-link" onClick={() => setOpen(false)}>あとで決める</button></div>{error && <p role="status">{error}</p>}</div> : <button className="text-link" onClick={() => { setOpen(true); setError(''); }}>アクセス解析の設定</button>}
  </aside>;
}
