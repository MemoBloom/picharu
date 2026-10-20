'use client';
export default function ErrorPage({reset}:{error:Error&{digest?:string};reset:()=>void}){return <section className="container empty-state"><h1>ページを表示できませんでした。</h1><p>時間をおいて、もう一度お試しください。</p><button className="button" onClick={reset}>再読み込み</button></section>;}
