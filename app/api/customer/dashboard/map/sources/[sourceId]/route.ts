import { NextRequest, NextResponse } from 'next/server';
import { PUBLIC_MAP_RESPONSE_CACHE_CONTROL } from '@/lib/dashboard-cache-control';
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

    const payload = await readMapSourceDetail(sourceId);
    if (!payload) {
      return NextResponse.json(
        { message: 'Source not found.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    return NextResponse.json(payload, {
      status: 200,
      headers: { 'Cache-Control': PUBLIC_MAP_RESPONSE_CACHE_CONTROL, 'X-Data-Source': 'local-fallback' },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to load source detail.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
