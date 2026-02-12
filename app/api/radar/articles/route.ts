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
  if (process.env.RADAR_SERVICE_REQUIRE_AUTH !== 'false') {
    const unauthorized = requireRadarServiceAuth(req, 'read:articles');
    if (unauthorized) return unauthorized;
  }

  try {
    const params = req.nextUrl.searchParams;
    const country = params.get('country');
    const source = params.get('source') || params.get('sourceId');
    const keyword = (params.get('keyword') || '').trim().toLowerCase();
    const limit = toInt(params.get('limit'), 50, 1, 1000);
    const offset = toInt(params.get('offset'), 0, 0, 100000);
    const hours = toInt(params.get('timeWindowHours') || params.get('hours'), 24, 1, 168);
    const cursor = params.get('cursor');

    const result = await getRadarServiceArticles({
      country,
      source,
      hours,
      limit,
      offset,
      cursor,
    });

    const filtered = keyword
      ? result.articles.filter((item) => {
          const hay = `${item.title} ${item.description}`.toLowerCase();
          return hay.includes(keyword);
        })
      : result.articles;

    return NextResponse.json(
      {
        articles: filtered,
        pagination: {
          total: keyword ? filtered.length : result.total,
          limit,
          offset,
          nextCursor: result.nextCursor,
          hasMore: keyword ? filtered.length === limit : offset + filtered.length < result.total,
        },
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=90',
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch articles' },
      { status: 500 }
    );
  }
}

