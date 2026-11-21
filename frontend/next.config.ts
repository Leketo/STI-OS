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
      { source: '/api/accounts/:path*', destination: `${origin.origin}/api/accounts/:path*` },
      { source: '/api/accounts', destination: `${origin.origin}/api/accounts` },
      // DEV-10 (corte 3B): renaming a client and its counts live under /api/clients/{id}.
      { source: '/api/clients/:path*', destination: `${origin.origin}/api/clients/:path*` },
      { source: '/api/clients', destination: `${origin.origin}/api/clients` },
      { source: '/api/projects/:path*', destination: `${origin.origin}/api/projects/:path*` },
      { source: '/api/projects', destination: `${origin.origin}/api/projects` },
      { source: '/api/operators', destination: `${origin.origin}/api/operators` },
      { source: '/api/tasks/:path*', destination: `${origin.origin}/api/tasks/:path*` },
      { source: '/api/tasks', destination: `${origin.origin}/api/tasks` },
    ];
  },
  // Rule 4: the page that receives the recovery link sends no referrer and is never kept. The link's token is
  // after the # and never reaches a server, and this keeps it from leaving the page in any other way.
  async headers() {
    return [
      {
        source: '/nueva-contrasena',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ];
  },
};

export default nextConfig;
