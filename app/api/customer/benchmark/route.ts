import { NextRequest, NextResponse } from 'next/server';
import { buildDisabledCountryBenchmarkResponse } from '@/lib/benchmark-store-shaping';
import { readCountryBenchmarkSnapshot } from '@/lib/customer-dashboard-snapshot-store';
import { buildPublicSnapshotCacheHeaders, PUBLIC_MAP_RESPONSE_CACHE_CONTROL } from '@/lib/dashboard-cache-control';
import { proxyPortalServerApiRequest } from '@/lib/customer-portal';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const snapshot = await readCountryBenchmarkSnapshot();
  if (snapshot) {
    return NextResponse.json(snapshot, {
      headers: buildPublicSnapshotCacheHeaders({
        'X-Data-Source': 'snapshot-fallback',
      }),
    });
  }

  const upstream = await proxyPortalServerApiRequest(request, '/api/dashboard/benchmark', {
    cacheControl: PUBLIC_MAP_RESPONSE_CACHE_CONTROL,
    responseHeaders: buildPublicSnapshotCacheHeaders(),
  });
  if (upstream.ok) {
    return upstream;
  }

  return NextResponse.json(buildDisabledCountryBenchmarkResponse(), {
    headers: buildPublicSnapshotCacheHeaders({
      'X-Data-Source': 'disabled-fallback',
    }),
  });
}
