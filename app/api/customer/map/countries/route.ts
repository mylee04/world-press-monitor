import { NextRequest, NextResponse } from 'next/server';
import { readMapCountryMetricsFileSnapshot } from '@/lib/customer-map-snapshot-store';
import { buildPublicSnapshotCacheHeaders, PUBLIC_MAP_RESPONSE_CACHE_CONTROL } from '@/lib/dashboard-cache-control';
import { proxyPortalServerApiRequest, shouldUseLocalFallbackForPortalResponse } from '@/lib/customer-portal';
import { readMapCountryMetrics } from '@/lib/map-store';
import type { MapCountryMetricsResponse } from '@/lib/map-types';
import { normalizeMapMetricWindow } from '@/lib/map-store-windows';

export const runtime = 'nodejs';
const MAP_COUNTRIES_UPSTREAM_TIMEOUT_MS = 30_000;

function hasCountryMetrics(payload: MapCountryMetricsResponse | null | undefined): payload is MapCountryMetricsResponse {
  return Boolean(payload && Array.isArray(payload.countries) && payload.countries.length > 0);
}

export async function GET(request: NextRequest) {
  try {
    const window = normalizeMapMetricWindow(request.nextUrl.searchParams.get('window'));
    request.nextUrl.searchParams.set('window', window);

    const fileSnapshot = await readMapCountryMetricsFileSnapshot(window);
    const localPayload = await readMapCountryMetrics(window);
    const upstream = await proxyPortalServerApiRequest(request, '/api/map/countries', {
      cacheControl: PUBLIC_MAP_RESPONSE_CACHE_CONTROL,
      responseHeaders: buildPublicSnapshotCacheHeaders(),
      timeoutMs: MAP_COUNTRIES_UPSTREAM_TIMEOUT_MS,
    });

    if (upstream.ok) {
      const payload = (await upstream.clone().json().catch(() => null)) as MapCountryMetricsResponse | null;
      if (hasCountryMetrics(payload)) {
        return NextResponse.json(payload, {
          status: 200,
          headers: buildPublicSnapshotCacheHeaders({ 'X-Data-Source': 'upstream' }),
        });
      }

      if (hasCountryMetrics(fileSnapshot)) {
        return NextResponse.json(fileSnapshot, {
          status: 200,
          headers: buildPublicSnapshotCacheHeaders({ 'X-Data-Source': 'snapshot-file' }),
        });
      }

      if (hasCountryMetrics(localPayload)) {
        return NextResponse.json(localPayload, {
          status: 200,
          headers: buildPublicSnapshotCacheHeaders({ 'X-Data-Source': 'local-fallback' }),
        });
      }

      return upstream;
    }

    const shouldUseSnapshotFallback = await shouldUseLocalFallbackForPortalResponse(upstream);
    if (!shouldUseSnapshotFallback) {
      return upstream;
    }

    if (hasCountryMetrics(fileSnapshot)) {
      return NextResponse.json(fileSnapshot, {
        status: 200,
        headers: buildPublicSnapshotCacheHeaders({ 'X-Data-Source': 'snapshot-file' }),
      });
    }

    if (hasCountryMetrics(localPayload)) {
      return NextResponse.json(localPayload, {
        status: 200,
        headers: buildPublicSnapshotCacheHeaders({ 'X-Data-Source': 'local-fallback' }),
      });
    }

    return upstream;
  } catch (error: unknown) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to load map country metrics.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
