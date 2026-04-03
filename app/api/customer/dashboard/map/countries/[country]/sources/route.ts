import { NextRequest, NextResponse } from 'next/server';
import { PUBLIC_MAP_RESPONSE_CACHE_CONTROL } from '@/lib/dashboard-cache-control';
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

    const payload = await readMapCountrySources(country, window);
    return NextResponse.json(payload, {
      status: 200,
      headers: { 'Cache-Control': PUBLIC_MAP_RESPONSE_CACHE_CONTROL, 'X-Data-Source': 'local-fallback' },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to load country sources.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
