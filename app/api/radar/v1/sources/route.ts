import { NextRequest, NextResponse } from 'next/server';
import { getRadarServiceSources } from '@/lib/radar-service-store';
import { executeRadarGetRoute } from '@/lib/radar-route-executor';
import { toInt } from '@/lib/query-params';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SourcesQuery = {
  hours: number;
  limit: number;
};

export async function GET(req: NextRequest): Promise<Response> {
  return executeRadarGetRoute<SourcesQuery, Awaited<ReturnType<typeof getRadarServiceSources>>>({
    req,
    scope: 'read:sources',
    parseParams: (searchParams) => ({
      hours: toInt(searchParams.get('hours'), 24, 1, 168),
      limit: toInt(searchParams.get('limit'), 200, 1, 1000),
    }),
    runQuery: (query) => getRadarServiceSources({
      hours: query.hours,
      limit: query.limit,
    }),
    toResponse: (sources, query) => NextResponse.json(
      {
        ok: true,
        generatedAt: new Date().toISOString(),
        windowHours: query.hours,
        sources,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=180',
        },
      }
    ),
    getErrorMessage: (error) => error instanceof Error ? error.message : String(error),
  });
}
