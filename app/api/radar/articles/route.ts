import { NextRequest, NextResponse } from 'next/server';
import { getRadarServiceArticles } from '@/lib/radar-service-store';
import { toInt } from '@/lib/query-params';
import { executeRadarGetRoute } from '@/lib/radar-route-executor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ArticleQuery = {
  country: string | null;
  source: string | null;
  keyword: string;
  limit: number;
  offset: number;
  hours: number;
  cursor: string | null;
};

export async function GET(req: NextRequest): Promise<Response> {
  return executeRadarGetRoute<ArticleQuery, Awaited<ReturnType<typeof getRadarServiceArticles>>>({
    req,
    scope: 'read:articles',
    requireAuth: process.env.RADAR_SERVICE_REQUIRE_AUTH !== 'false',
    parseParams: (params) => {
      const keyword = (params.get('keyword') || '').trim().toLowerCase();
      return {
        country: params.get('country'),
        source: params.get('source') || params.get('sourceId'),
        keyword,
        limit: toInt(params.get('limit'), 50, 1, 1000),
        offset: toInt(params.get('offset'), 0, 0, 100000),
        hours: toInt(params.get('timeWindowHours') || params.get('hours'), 24, 1, 168),
        cursor: params.get('cursor'),
      };
    },
    runQuery: (query) => getRadarServiceArticles({
      country: query.country,
      source: query.source,
      hours: query.hours,
      limit: query.limit,
      offset: query.offset,
      cursor: query.cursor,
    }),
    toResponse: (result, query) => {
      const filtered = query.keyword
        ? result.articles.filter((item) => {
            const hay = `${item.title} ${item.description}`.toLowerCase();
            return hay.includes(query.keyword);
          })
        : result.articles;

      return NextResponse.json(
        {
          articles: filtered,
          pagination: {
            total: query.keyword ? filtered.length : result.total,
            limit: query.limit,
            offset: query.offset,
            nextCursor: result.nextCursor,
            hasMore: query.keyword ? filtered.length === query.limit : query.offset + filtered.length < result.total,
          },
        },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=90',
          },
        }
      );
    },
    getErrorMessage: (error) => error instanceof Error ? error.message : 'Failed to fetch articles',
  });
}
