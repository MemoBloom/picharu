'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../lib/api';
import type { Tool } from '../lib/types';
export function ToolAvailability({ toolId }: { toolId: string }) {
  const [tool,setTool] = useState<Tool | null>(null); const [checked,setChecked] = useState(false); const [error,setError] = useState(false);
  useEffect(() => { const c = new AbortController(); setTool(null);setChecked(false);setError(false); api<{tools:Tool[]}>('/api/tools',{authenticated:false,signal:c.signal}).then(r=>{if(c.signal.aborted)return;setTool(r.tools.find(t=>t.tool_id===toolId)??null);setChecked(true);}).catch(()=>{if(!c.signal.aborted)setError(true);}); return ()=>c.abort(); },[toolId]);
  const current=tool?.tool_id===toolId?tool:null;
  return <aside className="panel tool-detail-aside"><h2>このツールで編集</h2><p>{error?'利用状況を確認できません。':!checked?'公開状況を確認しています。':current?.available?'利用できます。':'生成機能は準備中です。'}</p>
    <p>生成前にログイン、公開状況、必要なクレジットをご確認ください。</p>
    <Link className="button" href={`/ja/edit?tool=${toolId}`}>{current?.available?'写真を選んで始める':'編集画面を確認する'}</Link>
    {current?.available && <p>標準画質：{current.credit_cost.standard??'未設定'}クレジット</p>}
  </aside>;
}
