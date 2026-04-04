import { NextRequest, NextResponse } from 'next/server';
import { PUBLIC_MAP_RESPONSE_CACHE_CONTROL } from '@/lib/dashboard-cache-control';
import { proxyPortalServerApiRequest } from '@/lib/customer-portal';
import { readMapPublishers } from '@/lib/map-store';
import { normalizeMapMetricWindow } from '@/lib/map-store-windows';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const window = normalizeMapMetricWindow(request.nextUrl.searchParams.get('window'));
    request.nextUrl.searchParams.set('window', window);

    const localPayload = await readMapPublishers(window);
    if (localPayload.storage === 'snapshot' || localPayload.publishers.length > 0) {
      return NextResponse.json(localPayload, {
        status: 200,
        headers: { 'Cache-Control': PUBLIC_MAP_RESPONSE_CACHE_CONTROL, 'X-Data-Source': 'local-fallback' },
      });
    }

    const upstream = await proxyPortalServerApiRequest(request, '/api/map/publishers', {
      cacheControl: PUBLIC_MAP_RESPONSE_CACHE_CONTROL,
    });
    return upstream;
  } catch (error: unknown) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to load publisher map metrics.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
