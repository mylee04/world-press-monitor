import { NextRequest, NextResponse } from 'next/server';
import {
  buildOpsBenchmarkMetricsResponse,
  readOpsBenchmarkMetrics,
} from '@/lib/ops-table-store';
import { OPS_SESSION_COOKIE, isValidOpsSessionToken } from '@/lib/ops-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseInteger(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(OPS_SESSION_COOKIE)?.value;
  if (!isValidOpsSessionToken(token)) {
    return NextResponse.json(
      { message: 'Unauthorized.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const limit = parseInteger(searchParams.get('limit'), 50);
  const offset = parseInteger(searchParams.get('offset'), 0);
  const granularity = searchParams.get('granularity') === 'daily' ? 'daily' : 'hourly';
  const range = parseInteger(searchParams.get('range'), granularity === 'hourly' ? 72 : 30);
  const q = searchParams.get('q')?.trim() || null;
  const sort = searchParams.get('sort')?.trim() || 'bucket';
  const direction = searchParams.get('direction') === 'asc' ? 'asc' : 'desc';

  const result = await readOpsBenchmarkMetrics({
    limit,
    offset,
    granularity,
    range,
    q,
    sort,
    direction,
  });

  return NextResponse.json(
    buildOpsBenchmarkMetricsResponse(result, {
      limit,
      offset,
      granularity,
      range,
      q,
      sort,
      direction,
    }),
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
