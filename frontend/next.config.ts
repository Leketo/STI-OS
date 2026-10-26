import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    const backend = process.env.STI_API_ORIGIN;
    if (!backend) return [];
    const origin = new URL(backend);
    if (origin.hostname !== '127.0.0.1' || origin.protocol !== 'http:') {
      throw new Error('STI_API_ORIGIN must point to the local backend listener');
    }
    return [
      { source: '/api/auth/:path*', destination: `${origin.origin}/api/auth/:path*` },
      { source: '/api/accounts', destination: `${origin.origin}/api/accounts` },
      { source: '/api/clients', destination: `${origin.origin}/api/clients` },
      { source: '/api/projects/:path*', destination: `${origin.origin}/api/projects/:path*` },
      { source: '/api/projects', destination: `${origin.origin}/api/projects` },
    ];
  },
};

export default nextConfig;
