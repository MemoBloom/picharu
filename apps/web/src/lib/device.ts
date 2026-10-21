/** Coarse viewport observation, never a device fingerprint. */
export function coarseDevice(): 'mobile'|'tablet'|'desktop'|'unknown'{
 if(typeof window==='undefined')return 'unknown';
 const width=window.innerWidth;if(!Number.isFinite(width)||width<=0)return 'unknown';
 return width<640?'mobile':width<1024?'tablet':'desktop';
}
