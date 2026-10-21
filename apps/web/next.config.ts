import type { NextConfig } from 'next';
const config:NextConfig={transpilePackages:['@picjp/contracts','@picjp/tool-config','@picjp/prompts'],poweredByHeader:false,devIndicators:false,headers:async()=>[{source:'/fonts/picmoko/:fontFile(.*).woff2',headers:[{key:'Cache-Control',value:'public, max-age=31536000, immutable'}]}],redirects:async()=>[{source:"/",destination:"/ja",permanent:false}]};
export default config;
