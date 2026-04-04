import { NextRequest, NextResponse } from 'next/server';
import { buildDisabledCountryBenchmarkResponse } from '@/lib/benchmark-store-shaping';
import { readCountryBenchmarkSnapshot } from '@/lib/customer-dashboard-snapshot-store';
import { PUBLIC_MAP_RESPONSE_CACHE_CONTROL } from '@/lib/dashboard-cache-control';
import { proxyPortalServerApiRequest } from '@/lib/customer-portal';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const snapshot = await readCountryBenchmarkSnapshot();
  if (snapshot) {
    return NextResponse.json(snapshot, {
      headers: {
        'Cache-Control': PUBLIC_MAP_RESPONSE_CACHE_CONTROL,
        'X-Data-Source': 'snapshot-fallback',
      },
    });
  }

  const upstream = await proxyPortalServerApiRequest(request, '/api/dashboard/benchmark', {
    cacheControl: PUBLIC_MAP_RESPONSE_CACHE_CONTROL,
  });
  if (upstream.ok) {
    return upstream;
  }

  return NextResponse.json(buildDisabledCountryBenchmarkResponse(), {
    headers: {
      'Cache-Control': PUBLIC_MAP_RESPONSE_CACHE_CONTROL,
      'X-Data-Source': 'disabled-fallback',
    },
  });
}
