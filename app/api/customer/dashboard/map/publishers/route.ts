import { NextRequest, NextResponse } from 'next/server';
import { PUBLIC_MAP_RESPONSE_CACHE_CONTROL } from '@/lib/dashboard-cache-control';
import { readMapPublishers } from '@/lib/map-store';
import { normalizeMapMetricWindow } from '@/lib/map-store-windows';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const window = normalizeMapMetricWindow(request.nextUrl.searchParams.get('window'));
    request.nextUrl.searchParams.set('window', window);

    const payload = await readMapPublishers(window);
    return NextResponse.json(payload, {
      status: 200,
      headers: { 'Cache-Control': PUBLIC_MAP_RESPONSE_CACHE_CONTROL, 'X-Data-Source': 'local-fallback' },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to load publisher map metrics.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
