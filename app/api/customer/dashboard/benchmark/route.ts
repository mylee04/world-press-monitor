import { NextRequest, NextResponse } from 'next/server';
import { readCountryBenchmark } from '@/lib/benchmark-store';
import { buildDisabledCountryBenchmarkResponse } from '@/lib/benchmark-store-shaping';
import { PUBLIC_MAP_RESPONSE_CACHE_CONTROL } from '@/lib/dashboard-cache-control';
import { proxyPortalServerApiRequest } from '@/lib/customer-portal';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const upstream = await proxyPortalServerApiRequest(request, '/api/dashboard/benchmark', {
    cacheControl: PUBLIC_MAP_RESPONSE_CACHE_CONTROL,
  });
  if (upstream.ok) {
    return upstream;
  }

  try {
    const payload = await readCountryBenchmark();
    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': PUBLIC_MAP_RESPONSE_CACHE_CONTROL,
        'X-Data-Source': 'local-fallback',
      },
    });
  } catch (error: unknown) {
    const payload = buildDisabledCountryBenchmarkResponse();
    return NextResponse.json(
      {
        ...payload,
        reason: error instanceof Error ? error.message : 'Benchmark backend is unavailable.',
      },
      {
        headers: {
          'Cache-Control': PUBLIC_MAP_RESPONSE_CACHE_CONTROL,
          'X-Data-Source': 'disabled-fallback',
        },
      },
    );
  }
}
