import { NextRequest, NextResponse } from 'next/server';
import { requireRadarServiceAuth } from '@/lib/radar-service-auth';
import { getRadarServiceLiveFeed } from '@/lib/radar-service-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toInt(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

export async function GET(req: NextRequest): Promise<Response> {
  const unauthorized = requireRadarServiceAuth(req, 'read:articles');
  if (unauthorized) return unauthorized;

  try {
    const params = req.nextUrl.searchParams;
    const country = params.get('country');
    const hours = toInt(params.get('hours'), 24, 1, 168);
    const limit = toInt(params.get('limit'), 12, 1, 120);
    const cursor = params.get('cursor');

    const feed = await getRadarServiceLiveFeed({
      country,
      hours,
      limit,
      cursor,
    });

    return NextResponse.json(
      {
        ok: true,
        ...feed,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=90',
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

