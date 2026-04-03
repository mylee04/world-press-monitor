import { NextRequest, NextResponse } from 'next/server';
import { PUBLIC_MAP_RESPONSE_CACHE_CONTROL } from '@/lib/dashboard-cache-control';
import { hasPortalServerApiProxyConfig, proxyPortalServerApiRequest } from '@/lib/customer-portal';
import { normalizeMapMetricWindow, readMapPublishers } from '@/lib/map-store';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const window = normalizeMapMetricWindow(request.nextUrl.searchParams.get('window'));
    if (process.env.NODE_ENV !== 'production' && !hasPortalServerApiProxyConfig()) {
      const payload = await readMapPublishers(window);
      return NextResponse.json(payload, { headers: { 'Cache-Control': PUBLIC_MAP_RESPONSE_CACHE_CONTROL } });
    }
    request.nextUrl.searchParams.set('window', window);
    return proxyPortalServerApiRequest(request, '/api/map/publishers', {
      cacheControl: PUBLIC_MAP_RESPONSE_CACHE_CONTROL,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to load publisher map metrics.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
