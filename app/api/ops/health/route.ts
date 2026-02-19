import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { NextRequest } from 'next/server';
import { evaluateOpsStatus, loadOpsThresholds } from '@/lib/ops-alerts';
import { requireRadarServiceAuth } from '@/lib/radar-service-auth';

export const runtime = 'nodejs';

const WORKER_SUMMARY_PATH = resolve(process.cwd(), 'audits/ingest-worker-last.json');

type WorkerSummary = {
  generatedAt: string;
  elapsedMs: number;
  worker: {
    outletsTotal: number;
    outletsSelected: number;
    endpointFailureRate: number;
    persisted: number;
    externalPersisted: number;
  };
};

function toNum(value: unknown): number {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return (numerator / denominator) * 100;
}

function readWorkerSummary(): WorkerSummary | null {
  if (!existsSync(WORKER_SUMMARY_PATH)) return null;
  try {
    const raw = readFileSync(WORKER_SUMMARY_PATH, 'utf8');
    if (!raw.trim()) return null;
    return JSON.parse(raw) as WorkerSummary;
  } catch {
    return null;
  }
}

function envValue(key: string): string {
  return process.env[key] || '';
}

export async function GET(req: NextRequest): Promise<Response> {
  const unauthorized = requireRadarServiceAuth(req, 'read:ops');
  if (unauthorized) return unauthorized;

  const databaseUrl = process.env.DATABASE_URL
    || (process.env.NODE_ENV !== 'production' ? 'postgresql://localhost:5432/presslab' : '');
  if (!databaseUrl) {
    return Response.json({
      status: 'red',
      generatedAt: new Date().toISOString(),
      error: 'missing_database_url',
      alerts: [
        {
          severity: 'crit',
          code: 'db_missing',
          message: 'DATABASE_URL is not configured',
        },
      ],
    });
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const thresholds = loadOpsThresholds(envValue);
    const worker = readWorkerSummary();

    const ingestResult = await pool.query<{
      inserted_1h: string;
      touched_1h: string;
      touched_24h: string;
      source_active_1h: string;
      source_active_24h: string;
      no_ingest_minutes: string;
    }>(`
      select
        count(*) filter (where created_at > now() - interval '1 hour')::text as inserted_1h,
        count(*) filter (where last_seen_at > now() - interval '1 hour')::text as touched_1h,
        count(*) filter (where last_seen_at > now() - interval '24 hours')::text as touched_24h,
        count(distinct source) filter (where last_seen_at > now() - interval '1 hour')::text as source_active_1h,
        count(distinct source) filter (where last_seen_at > now() - interval '24 hours')::text as source_active_24h,
        coalesce(extract(epoch from (now() - max(last_seen_at))) / 60.0, -1)::text as no_ingest_minutes
      from external_news_articles
    `);

    const endpointResult = await pool.query<{
      runs_1h: string;
      attempted_1h: string;
      failed_1h: string;
      parsed_1h: string;
    }>(`
      select
        count(*) filter (where ran_at > now() - interval '1 hour')::text as runs_1h,
        count(*) filter (where ran_at > now() - interval '1 hour' and attempted)::text as attempted_1h,
        count(*) filter (where ran_at > now() - interval '1 hour' and attempted and not ok)::text as failed_1h,
        coalesce(sum(parsed_count) filter (where ran_at > now() - interval '1 hour'), 0)::text as parsed_1h
      from ingestion_endpoint_runs
      where runner = 'worker'
    `);

    const metadataResult = await pool.query<{
      total_24h: string;
      title_original_ok: string;
      summary_original_ok: string;
      publication_datetime_ok: string;
      section_ok: string;
      country_ok: string;
      source_ok: string;
      url_ok: string;
    }>(`
      select
        count(*)::text as total_24h,
        count(*) filter (where title_original is not null and btrim(title_original) <> '')::text as title_original_ok,
        count(*) filter (where summary_original is not null and btrim(summary_original) <> '')::text as summary_original_ok,
        count(*) filter (where publication_datetime is not null)::text as publication_datetime_ok,
        count(*) filter (where section is not null and btrim(section) <> '')::text as section_ok,
        count(*) filter (where country is not null and btrim(country) <> '')::text as country_ok,
        count(*) filter (where source is not null and btrim(source) <> '')::text as source_ok,
        count(*) filter (where url is not null and btrim(url) <> '')::text as url_ok
      from external_news_articles
      where last_seen_at > now() - interval '24 hours'
    `);

    const breakingResult = await pool.query<{
      breaking_1h: string;
      queue_new_total: string;
    }>(`
      select
        (
          (select count(*) from ingested_articles where last_seen_at > now() - interval '1 hour' and tags ? 'breaking')
          +
          (
            select count(*) from (
              select source_ref as k
              from breaking_queue
              where created_at > now() - interval '1 hour'
              union
              select ('x:' || post_id)::text as k
              from social_breaking_posts
              where created_at > now() - interval '1 hour'
                and is_breaking
            ) t
          )
        )::text as breaking_1h,
        (select count(*) filter (where status = 'new') from breaking_queue)::text as queue_new_total
    `);

    const ingest = ingestResult.rows[0] || {
      inserted_1h: '0',
      touched_1h: '0',
      touched_24h: '0',
      source_active_1h: '0',
      source_active_24h: '0',
      no_ingest_minutes: '-1',
    };
    const endpoint = endpointResult.rows[0] || {
      runs_1h: '0',
      attempted_1h: '0',
      failed_1h: '0',
      parsed_1h: '0',
    };
    const metadata = metadataResult.rows[0] || {
      total_24h: '0',
      title_original_ok: '0',
      summary_original_ok: '0',
      publication_datetime_ok: '0',
      section_ok: '0',
      country_ok: '0',
      source_ok: '0',
      url_ok: '0',
    };
    const breaking = breakingResult.rows[0] || {
      breaking_1h: '0',
      queue_new_total: '0',
    };

    const inserted1h = toNum(ingest.inserted_1h);
    const noIngestMinutesRaw = toNum(ingest.no_ingest_minutes);
    const noIngestMinutes = noIngestMinutesRaw < 0 ? null : noIngestMinutesRaw;
    const attempted1h = toNum(endpoint.attempted_1h);
    const failed1h = toNum(endpoint.failed_1h);
    const endpointFailureRate1hPct = pct(failed1h, Math.max(attempted1h, 1));
    const workerStaleMinutes = worker
      ? Math.max(0, Math.floor((Date.now() - new Date(worker.generatedAt).getTime()) / 60000))
      : null;

    const health = evaluateOpsStatus(
      {
        inserted1h,
        noIngestMinutes,
        endpointFailureRate1hPct,
        queueNewTotal: toNum(breaking.queue_new_total),
        workerStaleMinutes,
      },
      thresholds
    );

    return Response.json({
      status: health.status,
      generatedAt: new Date().toISOString(),
      thresholds,
      alerts: health.alerts,
      metrics: {
        ingest: {
          inserted1h,
          noIngestMinutes,
          touched1h: toNum(ingest.touched_1h),
          touched24h: toNum(ingest.touched_24h),
          sourceActive1h: toNum(ingest.source_active_1h),
          sourceActive24h: toNum(ingest.source_active_24h),
        },
        endpoints: {
          runs1h: toNum(endpoint.runs_1h),
          attempted1h,
          failed1h,
          parsed1h: toNum(endpoint.parsed_1h),
          failureRate1hPct: endpointFailureRate1hPct,
        },
        quality: {
          total24h: toNum(metadata.total_24h),
          metadataCoverage: {
            titleOriginalPct: pct(toNum(metadata.title_original_ok), Math.max(toNum(metadata.total_24h), 1)),
            summaryOriginalPct: pct(toNum(metadata.summary_original_ok), Math.max(toNum(metadata.total_24h), 1)),
            publicationDatetimePct: pct(toNum(metadata.publication_datetime_ok), Math.max(toNum(metadata.total_24h), 1)),
            sectionPct: pct(toNum(metadata.section_ok), Math.max(toNum(metadata.total_24h), 1)),
            countryPct: pct(toNum(metadata.country_ok), Math.max(toNum(metadata.total_24h), 1)),
            sourcePct: pct(toNum(metadata.source_ok), Math.max(toNum(metadata.total_24h), 1)),
            urlPct: pct(toNum(metadata.url_ok), Math.max(toNum(metadata.total_24h), 1)),
          },
          nonEnTotal: 0,
          nonEnTitleCoveragePct: 0,
          nonEnSummaryCoveragePct: 0,
          summarySource: {
            aiArticlePct: 0,
            articleMetaPct: 0,
          },
          avgQuality: 0,
        },
        breaking: {
          breaking1h: toNum(breaking.breaking_1h),
          queueNewTotal: toNum(breaking.queue_new_total),
        },
        worker: {
          lastRunAt: worker?.generatedAt || null,
          staleMinutes: workerStaleMinutes,
          elapsedMs: worker?.elapsedMs ?? null,
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      {
        status: 'red',
        generatedAt: new Date().toISOString(),
        error: message,
        alerts: [
          {
            severity: 'crit',
            code: 'ops_query_failed',
            message,
          },
        ],
      },
      { status: 500 }
    );
  } finally {
    await pool.end().catch(() => undefined);
  }
}
