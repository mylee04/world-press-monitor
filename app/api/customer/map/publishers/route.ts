import { NextRequest, NextResponse } from 'next/server';
import { readMapPublishersFileSnapshot } from '@/lib/customer-map-snapshot-store';
import { buildPublicSnapshotCacheHeaders, PUBLIC_MAP_RESPONSE_CACHE_CONTROL } from '@/lib/dashboard-cache-control';
import { proxyPortalServerApiRequest, shouldUseLocalFallbackForPortalResponse } from '@/lib/customer-portal';
import { readMapPublishers } from '@/lib/map-store';
import type { MapPublishersResponse, MapDataSource } from '@/lib/map-types';
import { normalizeMapMetricWindow } from '@/lib/map-store-windows';

export const runtime = 'nodejs';
const MAP_PUBLISHERS_UPSTREAM_TIMEOUT_MS = 30_000;

function hasPublisherMetrics(payload: MapPublishersResponse | null | undefined): payload is MapPublishersResponse {
  return Boolean(payload && Array.isArray(payload.publishers) && payload.publishers.length > 0);
}

function withDataSource(payload: MapPublishersResponse, dataSource: MapDataSource): MapPublishersResponse {
  return {
    ...payload,
    dataSource,
  };
}

export async function GET(request: NextRequest) {
  try {
    const window = normalizeMapMetricWindow(request.nextUrl.searchParams.get('window'));
    request.nextUrl.searchParams.set('window', window);

    const fileSnapshot = await readMapPublishersFileSnapshot(window);
    const localPayload = await readMapPublishers(window);
    const upstream = await proxyPortalServerApiRequest(request, '/api/map/publishers', {
      cacheControl: PUBLIC_MAP_RESPONSE_CACHE_CONTROL,
      responseHeaders: buildPublicSnapshotCacheHeaders(),
      timeoutMs: MAP_PUBLISHERS_UPSTREAM_TIMEOUT_MS,
    });

    if (upstream.ok) {
      const payload = (await upstream.clone().json().catch(() => null)) as MapPublishersResponse | null;
      if (hasPublisherMetrics(payload)) {
        return NextResponse.json(withDataSource(payload, 'upstream'), {
          status: 200,
          headers: buildPublicSnapshotCacheHeaders({ 'X-Data-Source': 'upstream' }),
        });
      }

      if (hasPublisherMetrics(fileSnapshot)) {
        return NextResponse.json(withDataSource(fileSnapshot, 'snapshot-file'), {
          status: 200,
          headers: buildPublicSnapshotCacheHeaders({ 'X-Data-Source': 'snapshot-file' }),
        });
      }

      if (hasPublisherMetrics(localPayload)) {
        return NextResponse.json(withDataSource(localPayload, 'local-fallback'), {
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

    if (hasPublisherMetrics(fileSnapshot)) {
      return NextResponse.json(withDataSource(fileSnapshot, 'snapshot-file'), {
        status: 200,
        headers: buildPublicSnapshotCacheHeaders({ 'X-Data-Source': 'snapshot-file' }),
      });
    }

    if (hasPublisherMetrics(localPayload)) {
      return NextResponse.json(withDataSource(localPayload, 'local-fallback'), {
        status: 200,
        headers: buildPublicSnapshotCacheHeaders({ 'X-Data-Source': 'local-fallback' }),
      });
    }

    return upstream;
  } catch (error: unknown) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to load publisher map metrics.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
