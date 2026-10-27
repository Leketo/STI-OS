import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Nothing gains from announcing the framework to every visitor.
  poweredByHeader: false,
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
      { source: '/api/operators', destination: `${origin.origin}/api/operators` },
      { source: '/api/tasks/:path*', destination: `${origin.origin}/api/tasks/:path*` },
      { source: '/api/tasks', destination: `${origin.origin}/api/tasks` },
    ];
  },
};

export default nextConfig;
