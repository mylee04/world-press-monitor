import { NextRequest, NextResponse } from 'next/server';
import { isValidOpsSessionToken, OPS_SESSION_COOKIE } from '@/lib/ops-auth';

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
  const window = request.nextUrl.searchParams.get('window')?.trim() || '24h';
  if (!country) {
    return NextResponse.json(
      { message: 'Country is required.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const origin = request.nextUrl.origin;
    const upstreamUrl = new URL(`/api/customer/map/countries/${encodeURIComponent(country)}/sources/`, origin);
    upstreamUrl.searchParams.set('window', window);

    const response = await fetch(upstreamUrl.toString(), {
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });

    const payload = await response.text();
    return new NextResponse(payload, {
      status: response.status,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': response.headers.get('Content-Type') || 'application/json; charset=utf-8',
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to load country sources.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
