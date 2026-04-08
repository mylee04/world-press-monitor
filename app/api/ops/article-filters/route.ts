import { NextRequest, NextResponse } from 'next/server';
import { proxyPortalServerApiRequest } from '@/lib/customer-portal';
import { readNewsApiFilters } from '@/lib/news-api-store';
import { OPS_SESSION_COOKIE, isValidOpsSessionToken } from '@/lib/ops-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = request.cookies.get(OPS_SESSION_COOKIE)?.value;
  if (!isValidOpsSessionToken(token)) {
    return NextResponse.json(
      { message: 'Unauthorized.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const filters = await readNewsApiFilters();
  if (filters.storage === 'postgres') {
    return NextResponse.json(filters, {
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  return proxyPortalServerApiRequest(request, '/api/filters', {
    cacheControl: 'no-store',
    timeoutMs: 30_000,
  });
}
