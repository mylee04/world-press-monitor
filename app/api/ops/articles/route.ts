import { NextRequest, NextResponse } from 'next/server';
import { proxyPortalServerApiRequest } from '@/lib/customer-portal';
import { readNewsArticlesForApi } from '@/lib/news-api-store';
import { OPS_SESSION_COOKIE, isValidOpsSessionToken } from '@/lib/ops-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseListValues(searchParams: URLSearchParams, key: string): string[] {
  return [
    ...new Set(
      searchParams
        .getAll(key)
        .flatMap((value) => value.split(','))
        .map((value) => value.trim())
        .filter(Boolean)
    ),
  ];
}

function parseInteger(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(OPS_SESSION_COOKIE)?.value;
  if (!isValidOpsSessionToken(token)) {
    return NextResponse.json(
      { message: 'Unauthorized.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const limit = Math.max(1, Math.min(200, parseInteger(searchParams.get('limit'), 100)));
  const offset = Math.max(0, parseInteger(searchParams.get('offset'), 0));
  const hours = Math.max(1, Math.min(24 * 30, parseInteger(searchParams.get('hours'), 48)));
  const q = (searchParams.get('q') || '').trim() || null;
  const countries = parseListValues(searchParams, 'countries');
  const sources = parseListValues(searchParams, 'sources');
  const sections = parseListValues(searchParams, 'sections');
  const languages = parseListValues(searchParams, 'languages');
  const publicationFrom = searchParams.get('publicationFrom')?.trim() || null;
  const publicationTo = searchParams.get('publicationTo')?.trim() || null;
  const minCreatedAt = searchParams.get('minCreatedAt')?.trim() || null;
  const maxCreatedAt = searchParams.get('maxCreatedAt')?.trim() || null;
  const minUpdatedAt = searchParams.get('minUpdatedAt')?.trim() || null;
  const maxUpdatedAt = searchParams.get('maxUpdatedAt')?.trim() || null;

  const result = await readNewsArticlesForApi({
    sourceNames: sources,
    countries,
    sections,
    languages,
    q,
    limit,
    offset,
    hours,
    publicationFrom,
    publicationTo,
    minCreatedAt,
    maxCreatedAt,
    minUpdatedAt,
    maxUpdatedAt,
  });

  if (result.storage === 'postgres') {
    return NextResponse.json(
      {
        storage: result.storage,
        generatedAt: result.generatedAt,
        total: result.totalCount,
        params: {
          limit,
          offset,
          hours,
          publicationFrom,
          publicationTo,
          minCreatedAt,
          maxCreatedAt,
          minUpdatedAt,
          maxUpdatedAt,
          q,
          sources,
          countries,
          sections,
          languages,
        },
        items: result.items,
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }

  request.nextUrl.searchParams.delete('sort');
  request.nextUrl.searchParams.delete('direction');
  return proxyPortalServerApiRequest(request, '/api/news', {
    cacheControl: 'no-store',
    timeoutMs: 30_000,
  });
}
