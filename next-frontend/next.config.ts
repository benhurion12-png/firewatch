import type { NextConfig } from 'next';
const origin=process.env.INTERNAL_API_URL || 'http://127.0.0.1:8002';
const config:NextConfig={
  output:'standalone',
  turbopack:{root:process.cwd()},
  async rewrites(){return [
    {source:'/api/:path*',destination:origin+'/api/:path*'},
    {source:'/realtime',destination:origin+'/realtime'},
  ];},
};
export default config;
