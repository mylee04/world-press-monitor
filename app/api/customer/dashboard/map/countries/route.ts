import { NextRequest, NextResponse } from 'next/server';
import { readMapCountryMetricsFileSnapshot } from '@/lib/customer-map-snapshot-store';
import { PUBLIC_MAP_RESPONSE_CACHE_CONTROL } from '@/lib/dashboard-cache-control';
import { proxyPortalServerApiRequest } from '@/lib/customer-portal';
import { readMapCountryMetrics } from '@/lib/map-store';
import { normalizeMapMetricWindow } from '@/lib/map-store-windows';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const window = normalizeMapMetricWindow(request.nextUrl.searchParams.get('window'));
    request.nextUrl.searchParams.set('window', window);

    const fileSnapshot = await readMapCountryMetricsFileSnapshot(window);
    if (fileSnapshot && fileSnapshot.countries.length > 0) {
      return NextResponse.json(fileSnapshot, {
        status: 200,
        headers: { 'Cache-Control': PUBLIC_MAP_RESPONSE_CACHE_CONTROL, 'X-Data-Source': 'snapshot-file' },
      });
    }

    const localPayload = await readMapCountryMetrics(window);
    const hasLocalSnapshotData = localPayload.storage === 'snapshot' && localPayload.countries.length > 0;
    const hasPostgresData = localPayload.storage !== 'snapshot';

    if (hasPostgresData || hasLocalSnapshotData) {
      return NextResponse.json(localPayload, {
        status: 200,
        headers: { 'Cache-Control': PUBLIC_MAP_RESPONSE_CACHE_CONTROL, 'X-Data-Source': 'local-fallback' },
      });
    }

    const upstream = await proxyPortalServerApiRequest(request, '/api/map/countries', {
      cacheControl: PUBLIC_MAP_RESPONSE_CACHE_CONTROL,
      timeoutMs: 15_000,
    });
    return upstream;
  } catch (error: unknown) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to load map country metrics.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
