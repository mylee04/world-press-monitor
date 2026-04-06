export const PRIVATE_DASHBOARD_RESPONSE_CACHE_CONTROL = 'private, max-age=60, stale-while-revalidate=300';
export const PUBLIC_MAP_RESPONSE_CACHE_CONTROL = 'public, max-age=30, stale-while-revalidate=60';
export const PUBLIC_MAP_CDN_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=900';
export const PUBLIC_MAP_VERCEL_CDN_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=900';

export function buildPublicSnapshotCacheHeaders(headers: Record<string, string> = {}): Record<string, string> {
  return {
    'Cache-Control': PUBLIC_MAP_RESPONSE_CACHE_CONTROL,
    'CDN-Cache-Control': PUBLIC_MAP_CDN_CACHE_CONTROL,
    'Vercel-CDN-Cache-Control': PUBLIC_MAP_VERCEL_CDN_CACHE_CONTROL,
    ...headers,
  };
}
