import { NextRequest, NextResponse } from 'next/server';
import { readMapCountrySourcesFileSnapshot } from '@/lib/customer-map-snapshot-store';
import { buildPublicSnapshotCacheHeaders, PUBLIC_MAP_RESPONSE_CACHE_CONTROL } from '@/lib/dashboard-cache-control';
import { proxyPortalServerApiRequest } from '@/lib/customer-portal';
import { readMapCountrySources } from '@/lib/map-store';
import { normalizeMapMetricWindow } from '@/lib/map-store-windows';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const COUNTRY_SOURCES_UPSTREAM_TIMEOUT_MS = 15_000;

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
    const hasFileSnapshotData =
      (fileSnapshot?.summary.activeSources24h || 0) > 0 ||
      (fileSnapshot?.sources.length || 0) > 0;
    if (fileSnapshot && hasFileSnapshotData) {
      return NextResponse.json(fileSnapshot, {
        status: 200,
        headers: buildPublicSnapshotCacheHeaders({ 'X-Data-Source': 'snapshot-file' }),
      });
    }

    const localPayload = await readMapCountrySources(country, window);
    const hasSourceData =
      localPayload.summary.activeSources24h > 0 ||
      localPayload.sources.length > 0;

    if (hasSourceData) {
      return NextResponse.json(localPayload, {
        status: 200,
        headers: buildPublicSnapshotCacheHeaders({ 'X-Data-Source': 'local-fallback' }),
      });
    }

    const upstream = await proxyPortalServerApiRequest(request, `/api/map/countries/${encodeURIComponent(country)}/sources`, {
      cacheControl: PUBLIC_MAP_RESPONSE_CACHE_CONTROL,
      responseHeaders: buildPublicSnapshotCacheHeaders(),
      timeoutMs: COUNTRY_SOURCES_UPSTREAM_TIMEOUT_MS,
    });

    if (upstream.ok) {
      return upstream;
    }

    return NextResponse.json(localPayload, {
      status: 200,
      headers: buildPublicSnapshotCacheHeaders({ 'X-Data-Source': 'local-fallback' }),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to load country sources.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
