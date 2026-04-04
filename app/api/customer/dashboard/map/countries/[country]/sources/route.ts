import { NextRequest, NextResponse } from 'next/server';
import { PUBLIC_MAP_RESPONSE_CACHE_CONTROL } from '@/lib/dashboard-cache-control';
import { proxyPortalServerApiRequest } from '@/lib/customer-portal';
import { readMapCountrySources } from '@/lib/map-store';
import { normalizeMapMetricWindow } from '@/lib/map-store-windows';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

    const localPayload = await readMapCountrySources(country, window);
    if (localPayload.sources.length > 0 || localPayload.summary.activeSources24h > 0) {
      return NextResponse.json(localPayload, {
        status: 200,
        headers: { 'Cache-Control': PUBLIC_MAP_RESPONSE_CACHE_CONTROL, 'X-Data-Source': 'local-fallback' },
      });
    }

    const upstream = await proxyPortalServerApiRequest(request, `/api/map/countries/${encodeURIComponent(country)}/sources`, {
      cacheControl: PUBLIC_MAP_RESPONSE_CACHE_CONTROL,
      timeoutMs: 15_000,
    });
    return upstream;
  } catch (error: unknown) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to load country sources.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
