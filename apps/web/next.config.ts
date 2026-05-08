import type { NextConfig } from 'next';

const API_PROXY_TARGET =
  process.env.LUMEN_API_PROXY_TARGET ?? 'http://localhost:8000';

const nextConfig: NextConfig = {
  turbopack: {
    root: import.meta.dirname,
  },
  // Per ADR-0002 D7 + plan T13: proxy /api/* to the FastAPI backend so
  // EventSource (which can't set custom headers and is same-origin
  // bound) reaches the SSE stream without a browser-side preflight.
  // GET /api/research/{id}/stream streams as text/event-stream; the
  // rewrite is path-preserving 1:1.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_PROXY_TARGET}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
