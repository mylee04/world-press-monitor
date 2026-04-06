import { NextRequest, NextResponse } from 'next/server';
import { buildPublicSnapshotCacheHeaders, PUBLIC_MAP_RESPONSE_CACHE_CONTROL } from '@/lib/dashboard-cache-control';
import { proxyPortalServerApiRequest } from '@/lib/customer-portal';
import { readMapSourceDetail } from '@/lib/map-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    if (localPayload) {
      return NextResponse.json(localPayload, {
        status: 200,
        headers: buildPublicSnapshotCacheHeaders({ 'X-Data-Source': 'local-fallback' }),
      });
    }

    const upstream = await proxyPortalServerApiRequest(request, `/api/map/sources/${encodeURIComponent(sourceId)}`, {
      cacheControl: PUBLIC_MAP_RESPONSE_CACHE_CONTROL,
      responseHeaders: buildPublicSnapshotCacheHeaders(),
      timeoutMs: 15_000,
    });
    if (upstream.ok) {
      return upstream;
    }
    return upstream;
  } catch (error: unknown) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to load source detail.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
