import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

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

function toNum(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getPool(): Pool {
  const url = process.env.DATABASE_URL || '';
  if (!url) throw new Error('DATABASE_URL is not configured');
  return new Pool({ connectionString: url });
}

async function postDiscord(content: string): Promise<void> {
  const webhook = process.env.RADAR_HOURLY_DISCORD_WEBHOOK || process.env.RADAR_OPS_DISCORD_WEBHOOK;
  if (!webhook) return;
  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`discord_webhook_http_${response.status}: ${body.slice(0, 200)}`);
  }
}

async function handle(req: NextRequest): Promise<Response> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const pool = getPool();
  try {
    const [ingest] = (await pool.query<{
      inserted_1h: string;
      touched_1h: string;
      source_active_1h: string;
      total_24h: string;
    }>(`
      select
        count(*) filter (where created_at > now() - interval '1 hour')::text as inserted_1h,
        count(*) filter (where last_seen_at > now() - interval '1 hour')::text as touched_1h,
        count(distinct source) filter (where last_seen_at > now() - interval '1 hour')::text as source_active_1h,
        count(*) filter (where last_seen_at > now() - interval '24 hours')::text as total_24h
      from external_news_articles
    `)).rows;

    const [queue] = (await pool.query<{
      pending: string;
      processing: string;
      error: string;
      done_1h: string;
    }>(`
      select
        count(*) filter (where status = 'pending')::text as pending,
        count(*) filter (where status = 'processing')::text as processing,
        count(*) filter (where status = 'error')::text as error,
        count(*) filter (where status = 'done' and completed_at > now() - interval '1 hour')::text as done_1h
      from radar_summary_queue
    `).catch(() => ({ rows: [{ pending: '0', processing: '0', error: '0', done_1h: '0' }] as any }))).rows;

    const [fetch] = (await pool.query<{
      attempts: string;
      success_total: string;
      blocked: string;
      rate_limited: string;
      timeout: string;
      network: string;
    }>(`
      select
        count(*)::text as attempts,
        count(*) filter (where outcome in ('success', 'fallbackSuccess'))::text as success_total,
        count(*) filter (where failure_code in ('blocked','paywall'))::text as blocked,
        count(*) filter (where failure_code = 'rateLimited')::text as rate_limited,
        count(*) filter (where failure_code = 'timeout')::text as timeout,
        count(*) filter (where failure_code = 'network')::text as network
      from radar_summary_fetch_logs
      where created_at > now() - interval '1 hour'
    `).catch(() => ({ rows: [{ attempts: '0', success_total: '0', blocked: '0', rate_limited: '0', timeout: '0', network: '0' }] as any }))).rows;

    const attempts = toNum(fetch?.attempts);
    const successTotal = toNum(fetch?.success_total);
    const successPct = attempts > 0 ? (successTotal / attempts) * 100 : 0;
    const message = [
      `PressLab Radar Hourly Summary — ${new Date().toISOString()}`,
      `Ingest 1h: new=${toNum(ingest?.inserted_1h)} touched=${toNum(ingest?.touched_1h)} activeSources=${toNum(ingest?.source_active_1h)} total24h=${toNum(ingest?.total_24h)}`,
      `Summaries 1h: attempts=${attempts}, success=${successPct.toFixed(1)}% (${successTotal}), blocked=${toNum(fetch?.blocked)}, 429=${toNum(fetch?.rate_limited)}, timeout=${toNum(fetch?.timeout)}, network=${toNum(fetch?.network)}`,
      `Queue: pending=${toNum(queue?.pending)}, processing=${toNum(queue?.processing)}, error=${toNum(queue?.error)}, done1h=${toNum(queue?.done_1h)}`,
    ].join('\n');

    await postDiscord(message);
    return NextResponse.json({
      ok: true,
      posted: true,
      generatedAt: new Date().toISOString(),
      summary: {
        attempts1h: attempts,
        successPct1h: successPct,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  } finally {
    await pool.end().catch(() => undefined);
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}
