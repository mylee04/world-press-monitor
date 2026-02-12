import { NextRequest, NextResponse } from 'next/server';
import { requireRadarServiceAuth } from '@/lib/radar-service-auth';
import { getRadarServiceArticles } from '@/lib/radar-service-store';

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
    const { searchParams } = new URL(req.url);
    const country = searchParams.get('country');
    const source = searchParams.get('source');
    const outletId = searchParams.get('outletId');
    const hours = toInt(searchParams.get('hours'), 24, 1, 168);
    const limit = toInt(searchParams.get('limit'), 100, 1, 1000);
    const offset = toInt(searchParams.get('offset'), 0, 0, 100000);
    const cursor = searchParams.get('cursor');

    const result = await getRadarServiceArticles({
      country,
      source,
      outletId,
      hours,
      limit,
      offset,
      cursor,
    });

    return NextResponse.json(
      {
      ok: true,
      generatedAt: result.generatedAt,
      articles: result.articles,
      pagination: {
        total: result.total,
        limit,
        offset,
        nextCursor: result.nextCursor,
        hasMore: offset + result.articles.length < result.total,
      },
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=120',
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
