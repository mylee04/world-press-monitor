import type { NextConfig } from 'next';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() || undefined;

const nextConfig: NextConfig = {
  basePath,
  trailingSlash: true,
  typedRoutes: true,
  images: {
    unoptimized: true,
  },
  outputFileTracingIncludes: {
    '/*': [
      './output/football-world-cup-journalist/latest.json',
      './data/football-world-cup-human-interest-pilot.canonical.json',
    ],
  },
};

export default nextConfig;
