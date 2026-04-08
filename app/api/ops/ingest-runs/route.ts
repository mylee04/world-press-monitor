import { NextRequest, NextResponse } from 'next/server';
import {
  buildOpsIngestRunsResponse,
  readOpsIngestRuns,
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
  const hours = parseInteger(searchParams.get('hours'), 24);
  const q = searchParams.get('q')?.trim() || null;
  const runner = searchParams.get('runner')?.trim() || null;
  const method = searchParams.get('method')?.trim() || null;
  const sort = searchParams.get('sort')?.trim() || 'bucket';
  const direction = searchParams.get('direction') === 'asc' ? 'asc' : 'desc';

  const result = await readOpsIngestRuns({
    limit,
    offset,
    hours,
    q,
    runner,
    method,
    sort,
    direction,
  });

  return NextResponse.json(
    buildOpsIngestRunsResponse(result, {
      limit,
      offset,
      hours,
      q,
      runner,
      method,
      sort,
      direction,
    }),
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
