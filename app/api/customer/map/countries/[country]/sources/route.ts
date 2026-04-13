import { NextRequest, NextResponse } from 'next/server';
import { readMapCountrySourcesFileSnapshot } from '@/lib/customer-map-snapshot-store';
import { buildPublicSnapshotCacheHeaders, PUBLIC_MAP_RESPONSE_CACHE_CONTROL } from '@/lib/dashboard-cache-control';
import { proxyPortalServerApiRequest, shouldUseLocalFallbackForPortalResponse } from '@/lib/customer-portal';
import { sanitizeMapCountrySourcesForPublic } from '@/lib/map-public-payload';
import { readMapCountrySources } from '@/lib/map-store';
import type { MapCountrySourcesResponse, MapDataSource } from '@/lib/map-types';
import { normalizeMapMetricWindow } from '@/lib/map-store-windows';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const COUNTRY_SOURCES_UPSTREAM_TIMEOUT_MS = 30_000;

function hasCountrySourceData(payload: MapCountrySourcesResponse | null | undefined): payload is MapCountrySourcesResponse {
  return Boolean(
    payload &&
    (((payload.summary?.activeSources24h || 0) > 0) || (Array.isArray(payload.sources) && payload.sources.length > 0))
  );
}

function withDataSource(payload: MapCountrySourcesResponse, dataSource: MapDataSource): MapCountrySourcesResponse {
  return {
    ...payload,
    dataSource,
  };
}

export async function GET(request: NextRequest, context: { params: Promise<{ country: string }> }) {
  try {
    const params = await context.params;
    const country = decodeURIComponent(params.country || '').trim();
    if (!country) {
      return NextResponse.json(
        { message: 'Country is required.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const window = normalizeMapMetricWindow(request.nextUrl.searchParams.get('window'));
    request.nextUrl.searchParams.set('window', window);

    const fileSnapshot = await readMapCountrySourcesFileSnapshot(country, window);
    const localPayload = await readMapCountrySources(country, window);
    const upstream = await proxyPortalServerApiRequest(request, `/api/map/countries/${encodeURIComponent(country)}/sources`, {
      cacheControl: PUBLIC_MAP_RESPONSE_CACHE_CONTROL,
      responseHeaders: buildPublicSnapshotCacheHeaders(),
      timeoutMs: COUNTRY_SOURCES_UPSTREAM_TIMEOUT_MS,
    });

    if (upstream.ok) {
      const payload = (await upstream.clone().json().catch(() => null)) as MapCountrySourcesResponse | null;
      if (hasCountrySourceData(payload)) {
        return NextResponse.json(sanitizeMapCountrySourcesForPublic(withDataSource(payload, 'upstream')), {
          status: 200,
          headers: buildPublicSnapshotCacheHeaders({ 'X-Data-Source': 'upstream' }),
        });
      }

      if (hasCountrySourceData(fileSnapshot)) {
        return NextResponse.json(sanitizeMapCountrySourcesForPublic(withDataSource(fileSnapshot, 'snapshot-file')), {
          status: 200,
          headers: buildPublicSnapshotCacheHeaders({ 'X-Data-Source': 'snapshot-file' }),
        });
      }

      if (hasCountrySourceData(localPayload)) {
        return NextResponse.json(sanitizeMapCountrySourcesForPublic(withDataSource(localPayload, 'local-fallback')), {
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

    if (hasCountrySourceData(fileSnapshot)) {
      return NextResponse.json(sanitizeMapCountrySourcesForPublic(withDataSource(fileSnapshot, 'snapshot-file')), {
        status: 200,
        headers: buildPublicSnapshotCacheHeaders({ 'X-Data-Source': 'snapshot-file' }),
      });
    }

    if (hasCountrySourceData(localPayload)) {
      return NextResponse.json(sanitizeMapCountrySourcesForPublic(withDataSource(localPayload, 'local-fallback')), {
        status: 200,
        headers: buildPublicSnapshotCacheHeaders({ 'X-Data-Source': 'local-fallback' }),
      });
    }

    return upstream;
  } catch (error: unknown) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to load country sources.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
