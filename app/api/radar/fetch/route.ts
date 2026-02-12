import { NextRequest, NextResponse } from 'next/server';
import { requireRadarServiceAuth } from '@/lib/radar-service-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toInt(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function runIngest(origin: string, params: URLSearchParams): Promise<any> {
  const url = `${origin}/api/news?${params.toString()}`;
  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`news_ingest_http_${response.status}: ${JSON.stringify(payload).slice(0, 300)}`);
  }
  return payload;
}

async function handleFetch(req: NextRequest, requireAuth = true): Promise<Response> {
  if (requireAuth) {
    const unauthorized = requireRadarServiceAuth(req, 'write:ingest');
    if (unauthorized) return unauthorized;
  }

  try {
    const startedAt = Date.now();
    const search = req.nextUrl.searchParams;
    const limit = toInt(search.get('limit'), 12000, 100, 20000);
    const dbHours = toInt(search.get('dbHours'), 24, 6, 168);
    const mode = (search.get('mode') || 'ingest').toLowerCase();
    const outlets = search.get('outlets');

    const ingestParams = new URLSearchParams();
    ingestParams.set('mode', mode === 'db' || mode === 'readonly' ? mode : 'ingest');
    ingestParams.set('runner', 'worker');
    ingestParams.set('limit', String(limit));
    ingestParams.set('dbHours', String(dbHours));
    if (outlets) ingestParams.set('outlets', outlets);

    const payload = await runIngest(req.nextUrl.origin, ingestParams);
    const durationMs = Date.now() - startedAt;

    const ingestion = payload?.ingestion || {};
    const persistence = payload?.persistence || {};
    const summary = {
      sourcesTotal: toNumber(ingestion.totalOutlets),
      sourcesSuccess: toNumber(ingestion.okEndpoints),
      sourcesFailed: toNumber(ingestion.failedEndpoints),
      newArticles: toNumber(persistence.externalPersisted ?? persistence.persisted),
      missingPubDate: 0,
      suspiciousPubDate: 0,
      derivedPubDate: 0,
      linkChecksQueued: 0,
      summariesQueued: 0,
      durationMs,
    };

    return NextResponse.json({
      ok: true,
      summary,
      persistence,
      generatedAt: payload?.generatedAt || new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const requireAuth = process.env.RADAR_SERVICE_REQUIRE_AUTH !== 'false';
  return handleFetch(req, requireAuth);
}

export async function GET(req: NextRequest): Promise<Response> {
  const requireAuth = process.env.RADAR_SERVICE_REQUIRE_AUTH !== 'false';
  return handleFetch(req, requireAuth);
}

