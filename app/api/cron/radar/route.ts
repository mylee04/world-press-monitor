import { NextRequest, NextResponse } from 'next/server';
import { pickRadarTokenForScope } from '@/lib/radar-scope-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function getCronSecret(): string {
  return process.env.CRON_SECRET || process.env.RADAR_CRON_TOKEN || process.env.LISTENING_CRON_SECRET || '';
}

function isAuthorized(req: NextRequest): boolean {
  const secret = getCronSecret();
  if (!secret) return false;
  const auth = req.headers.get('authorization') || '';
  return auth === `Bearer ${secret}`;
}

function toInt(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

async function postDiscord(content: string): Promise<void> {
  const webhook = process.env.RADAR_OPS_DISCORD_WEBHOOK || process.env.RADAR_HOURLY_DISCORD_WEBHOOK;
  if (!webhook) return;
  await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  }).catch(() => undefined);
}

async function runIngest(req: NextRequest): Promise<Response> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const startedAt = Date.now();
    const limit = toInt(req.nextUrl.searchParams.get('limit'), 12000, 100, 20000);
    const dbHours = toInt(req.nextUrl.searchParams.get('dbHours'), 24, 6, 168);
    const outlets = req.nextUrl.searchParams.get('outlets');

    const url = new URL('/api/news', req.nextUrl.origin);
    url.searchParams.set('mode', 'ingest');
    url.searchParams.set('runner', 'worker');
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('dbHours', String(dbHours));
    if (outlets) url.searchParams.set('outlets', outlets);

    const fetchResponse = await fetch(url.toString(), {
      method: 'GET',
      cache: 'no-store',
    });
    const payload = await fetchResponse.json().catch(() => ({}));
    if (!fetchResponse.ok) {
      throw new Error(`news_ingest_http_${fetchResponse.status}: ${JSON.stringify(payload).slice(0, 400)}`);
    }

    const healthUrl = new URL('/api/ops/health', req.nextUrl.origin);
    const opsToken = pickRadarTokenForScope(process.env.RADAR_SERVICE_API_KEYS || '', 'read:ops');
    const healthResponse = await fetch(healthUrl.toString(), {
      cache: 'no-store',
      headers: opsToken ? { Authorization: `Bearer ${opsToken}` } : undefined,
    }).catch(() => null);
    const health = healthResponse ? await healthResponse.json().catch(() => null) : null;

    const healthStatus = String(health?.status || '').toLowerCase();
    if (health && healthStatus && healthStatus !== 'green') {
      const alertText = Array.isArray(health.alerts)
        ? health.alerts.map((a: any) => `[${String(a.severity || '').toUpperCase()}] ${a.message}`).join(' | ')
        : 'unknown_alerts';
      await postDiscord(
        `PressLab Radar Cron Alert — ${new Date().toISOString()}\nStatus: ${health.status}\nAlerts: ${alertText}`
      );
    }

    return NextResponse.json({
      ok: true,
      summary: {
        sourcesTotal: Number(payload?.ingestion?.totalOutlets || 0),
        sourcesSuccess: Number(payload?.ingestion?.okEndpoints || 0),
        sourcesFailed: Number(payload?.ingestion?.failedEndpoints || 0),
        newArticles: Number(payload?.persistence?.externalPersisted || payload?.persistence?.persisted || 0),
        linkChecksQueued: 0,
        summariesQueued: Number(payload?.persistence?.queuedSummaries || 0),
      },
      health: health || null,
      durationMs: Date.now() - startedAt,
      generatedAt: new Date().toISOString(),
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

export async function GET(req: NextRequest): Promise<Response> {
  return runIngest(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return runIngest(req);
}
