import { NextRequest, NextResponse } from 'next/server';
import { requireRadarServiceAuth } from '@/lib/radar-service-auth';
import { getRadarServiceDomainMetrics } from '@/lib/radar-service-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toInt(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

export async function GET(req: NextRequest): Promise<Response> {
  if (process.env.RADAR_SERVICE_REQUIRE_AUTH !== 'false') {
    const unauthorized = requireRadarServiceAuth(req, 'read:ops');
    if (unauthorized) return unauthorized;
  }

  try {
    const params = req.nextUrl.searchParams;
    const windowHours = toInt(params.get('windowHours') || params.get('hours'), 24, 1, 24 * 14);
    const limit = toInt(params.get('limit'), 20, 1, 100);
    const country = params.get('country');
    const result = await getRadarServiceDomainMetrics({
      hours: windowHours,
      limit,
      country,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

