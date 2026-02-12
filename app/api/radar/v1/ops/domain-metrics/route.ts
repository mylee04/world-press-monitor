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
  const unauthorized = requireRadarServiceAuth(req, 'read:ops');
  if (unauthorized) return unauthorized;

  try {
    const params = req.nextUrl.searchParams;
    const hours = toInt(params.get('windowHours') || params.get('hours'), 24, 1, 24 * 14);
    const limit = toInt(params.get('limit'), 20, 1, 100);
    const country = params.get('country');

    const metrics = await getRadarServiceDomainMetrics({
      hours,
      limit,
      country,
    });

    return NextResponse.json(
      {
        ok: true,
        ...metrics,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=120',
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

