import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  webpack: (config) => {
    config.resolve.alias['react-router-dom'] = path.resolve(
      __dirname,
      'src/lib/router-compat.tsx'
    );
    return config;
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: process.env.VITE_API_URL
          ? `${process.env.VITE_API_URL}/api/:path*`
          : 'http://127.0.0.1:3000/api/:path*',
      },
    ];
  },
};

export default nextConfig;
