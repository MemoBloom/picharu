import Image from 'next/image';
export function Brand({compact=false}:{compact?:boolean}){
 return <span className={`picmoko-brand${compact?' picmoko-brand-small':''}`}><Image src="/brand/picmoko-mascot.webp" alt="" width={48} height={48} unoptimized/><Image className="picmoko-wordmark" src="/brand/picmoko-wordmark-a.webp" alt="picmoko" width={600} height={129} unoptimized/></span>;
}
