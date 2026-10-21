const allowed=/^\/ja(?:\/?|\/(?:edit|history|account|pricing|help)|\/tools(?:\/[a-z_]+)?|\/jobs\/[0-9a-f-]{36}|\/billing\/success|\/legal\/(?:terms|privacy|commercial-disclosure))$/;
export function safeNext(value:string|null|undefined,fallback='/ja/edit'):string{
 if(!value||!value.startsWith('/')||value.startsWith('//')||/[\\\u0000-\u0020]/.test(value))return fallback;
 try{const url=new URL(value,'https://navigation.invalid');if(url.origin!=='https://navigation.invalid'||!(allowed.test(url.pathname)||url.pathname==='/admin/seo'||/^\/ja\/guides(?:\/[a-z0-9-]+)?$/.test(url.pathname)||/^\/admin(?:\/(?:users|tools|funnel|retention|versions|finance|data-quality))?\/?$/.test(url.pathname)))return fallback;return url.pathname+url.search;}catch{return fallback;}
}
export function loginHref(next:string){return `/ja/login?next=${encodeURIComponent(safeNext(next))}`;}
