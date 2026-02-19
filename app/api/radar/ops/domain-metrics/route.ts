import { NextRequest, NextResponse } from 'next/server';
import { getRadarServiceDomainMetrics } from '@/lib/radar-service-store';
import { executeRadarGetRoute } from '@/lib/radar-route-executor';
import { toInt } from '@/lib/query-params';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DomainMetricsQuery = {
  hours: number;
  limit: number;
  country: string | null;
};

export async function GET(req: NextRequest): Promise<Response> {
  return executeRadarGetRoute<DomainMetricsQuery, Awaited<ReturnType<typeof getRadarServiceDomainMetrics>>>({
    req,
    scope: 'read:ops',
    parseParams: (searchParams) => ({
      hours: toInt(searchParams.get('windowHours') || searchParams.get('hours'), 24, 1, 24 * 14),
      limit: toInt(searchParams.get('limit'), 20, 1, 100),
      country: searchParams.get('country'),
    }),
    runQuery: (query) => getRadarServiceDomainMetrics({
      hours: query.hours,
      limit: query.limit,
      country: query.country,
    }),
    toResponse: (result) => NextResponse.json(result),
    getErrorMessage: (error) => error instanceof Error ? error.message : 'Unknown error',
  });
}
