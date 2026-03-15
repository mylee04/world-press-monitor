import type { NextConfig } from 'next';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() || undefined;

const nextConfig: NextConfig = {
  basePath,
  output: 'export',
  trailingSlash: true,
  typedRoutes: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
