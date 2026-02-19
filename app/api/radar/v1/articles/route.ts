import { NextRequest, NextResponse } from 'next/server';
import { getRadarServiceArticles } from '@/lib/radar-service-store';
import { executeRadarGetRoute } from '@/lib/radar-route-executor';
import { toInt } from '@/lib/query-params';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ArticleQuery = {
  country: string | null;
  source: string | null;
  outletId: string | null;
  hours: number;
  limit: number;
  offset: number;
  cursor: string | null;
};

export async function GET(req: NextRequest): Promise<Response> {
  return executeRadarGetRoute<ArticleQuery, Awaited<ReturnType<typeof getRadarServiceArticles>>>({
    req,
    scope: 'read:articles',
    parseParams: (searchParams) => ({
      country: searchParams.get('country'),
      source: searchParams.get('source'),
      outletId: searchParams.get('outletId'),
      hours: toInt(searchParams.get('hours'), 24, 1, 168),
      limit: toInt(searchParams.get('limit'), 100, 1, 1000),
      offset: toInt(searchParams.get('offset'), 0, 0, 100000),
      cursor: searchParams.get('cursor'),
    }),
    runQuery: (query) => getRadarServiceArticles({
      country: query.country,
      source: query.source,
      outletId: query.outletId,
      hours: query.hours,
      limit: query.limit,
      offset: query.offset,
      cursor: query.cursor,
    }),
    toResponse: (result, query) => NextResponse.json(
      {
        ok: true,
        generatedAt: result.generatedAt,
        articles: result.articles,
        pagination: {
          total: result.total,
          limit: query.limit,
          offset: query.offset,
          nextCursor: result.nextCursor,
          hasMore: query.offset + result.articles.length < result.total,
        },
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=120',
        },
      }
    ),
    getErrorMessage: (error) => error instanceof Error ? error.message : String(error),
  });
}
