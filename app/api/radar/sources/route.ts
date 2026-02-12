import { NextRequest, NextResponse } from 'next/server';
import { requireRadarServiceAuth } from '@/lib/radar-service-auth';
import { getRadarServiceSources } from '@/lib/radar-service-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toInt(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

export async function GET(req: NextRequest): Promise<Response> {
  if (process.env.RADAR_SERVICE_REQUIRE_AUTH !== 'false') {
    const unauthorized = requireRadarServiceAuth(req, 'read:sources');
    if (unauthorized) return unauthorized;
  }

  try {
    const params = req.nextUrl.searchParams;
    const hours = toInt(params.get('hours'), 24, 1, 168);
    const limit = toInt(params.get('limit'), 500, 1, 1000);
    const sources = await getRadarServiceSources({ hours, limit });
    return NextResponse.json({
      sources,
      seeded: false,
      inserted: 0,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch RSS sources' },
      { status: 500 }
    );
  }
}

