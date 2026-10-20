import type { NextConfig } from 'next';
const config:NextConfig={transpilePackages:['@picjp/contracts','@picjp/tool-config','@picjp/prompts'],poweredByHeader:false,
 headers:async()=>[{source:'/email-assets/v1/:asset*',headers:[
  {key:'Access-Control-Allow-Origin',value:'*'},
  {key:'Cache-Control',value:'public, max-age=31536000, immutable'},
  {key:'X-Content-Type-Options',value:'nosniff'},
 ]}],
};
export default config;
