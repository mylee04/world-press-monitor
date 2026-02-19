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
    requireAuth: process.env.RADAR_SERVICE_REQUIRE_AUTH !== 'false',
    parseParams: (searchParams) => ({
      hours: toInt(searchParams.get('hours'), 24, 1, 168),
      limit: toInt(searchParams.get('limit'), 500, 1, 1000),
    }),
    runQuery: (query) => getRadarServiceSources({
      hours: query.hours,
      limit: query.limit,
    }),
    toResponse: (sources) => NextResponse.json({
      sources,
      seeded: false,
      inserted: 0,
    }),
    getErrorMessage: (error) => error instanceof Error ? error.message : 'Failed to fetch RSS sources',
  });
}
