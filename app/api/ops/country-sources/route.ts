import { NextRequest, NextResponse } from 'next/server';
import { isValidOpsSessionToken, OPS_SESSION_COOKIE } from '@/lib/ops-auth';
import { readMapCountrySources } from '@/lib/map-store';
import { normalizeMapMetricWindow } from '@/lib/map-store-windows';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = request.cookies.get(OPS_SESSION_COOKIE)?.value;
  if (!isValidOpsSessionToken(token)) {
    return NextResponse.json(
      { message: 'Unauthorized.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const country = request.nextUrl.searchParams.get('country')?.trim() || '';
  const window = normalizeMapMetricWindow(request.nextUrl.searchParams.get('window'));
  if (!country) {
    return NextResponse.json(
      { message: 'Country is required.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const payload = await readMapCountrySources(country, window);
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to load country sources.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
