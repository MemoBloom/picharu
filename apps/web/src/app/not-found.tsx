import Link from 'next/link';
export default function NotFound(){return <section className="container empty-state"><h1>ページが見つかりません。</h1><p>アドレスが変わったか、公開されていないページです。</p><Link className="button" href="/ja/">ホームに戻る</Link></section>;}
