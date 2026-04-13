import { NextRequest, NextResponse } from 'next/server';
import { buildPublicSnapshotCacheHeaders, PUBLIC_MAP_RESPONSE_CACHE_CONTROL } from '@/lib/dashboard-cache-control';
import { proxyPortalServerApiRequest, shouldUseLocalFallbackForPortalResponse } from '@/lib/customer-portal';
import { sanitizeMapSourceDetailForPublic } from '@/lib/map-public-payload';
import { readMapSourceDetail } from '@/lib/map-store';
import type { MapSourceDetailResponse, MapDataSource } from '@/lib/map-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAP_SOURCE_DETAIL_UPSTREAM_TIMEOUT_MS = 30_000;

function withDataSource(payload: MapSourceDetailResponse, dataSource: MapDataSource): MapSourceDetailResponse {
  return {
    ...payload,
    dataSource,
  };
}

export async function GET(request: NextRequest, context: { params: Promise<{ sourceId: string }> }) {
  try {
    const params = await context.params;
    const sourceId = decodeURIComponent(params.sourceId || '').trim();
    if (!sourceId) {
      return NextResponse.json(
        { message: 'Source id is required.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const localPayload = await readMapSourceDetail(sourceId);
    const upstream = await proxyPortalServerApiRequest(request, `/api/map/sources/${encodeURIComponent(sourceId)}`, {
      cacheControl: PUBLIC_MAP_RESPONSE_CACHE_CONTROL,
      responseHeaders: buildPublicSnapshotCacheHeaders(),
      timeoutMs: MAP_SOURCE_DETAIL_UPSTREAM_TIMEOUT_MS,
    });
    if (upstream.ok) {
      const payload = (await upstream.clone().json().catch(() => null)) as MapSourceDetailResponse | null;
      if (payload) {
        return NextResponse.json(sanitizeMapSourceDetailForPublic(withDataSource(payload, 'upstream')), {
          status: 200,
          headers: buildPublicSnapshotCacheHeaders({ 'X-Data-Source': 'upstream' }),
        });
      }
      return upstream;
    }

    const shouldUseSnapshotFallback = await shouldUseLocalFallbackForPortalResponse(upstream);
    if (!shouldUseSnapshotFallback) {
      return upstream;
    }

    if (localPayload) {
      return NextResponse.json(sanitizeMapSourceDetailForPublic(withDataSource(localPayload, 'local-fallback')), {
        status: 200,
        headers: buildPublicSnapshotCacheHeaders({ 'X-Data-Source': 'local-fallback' }),
      });
    }

    return upstream;
  } catch (error: unknown) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to load source detail.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
