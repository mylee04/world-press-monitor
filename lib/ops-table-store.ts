import { Pool } from 'pg';
import { resolveDatabaseUrl } from '@/lib/database-url';
import type {
  OpsBenchmarkGranularity,
  OpsBenchmarkMetricRow,
  OpsBenchmarkMetricsResponse,
  OpsFeedStatusResponse,
  OpsFeedStatusRow,
  OpsIngestRunRow,
  OpsIngestRunsResponse,
  OpsMapMetricKind,
  OpsMapMetricRow,
  OpsMapMetricsResponse,
  OpsSortDirection,
  OpsStorage,
} from '@/lib/ops-types';

type OpsTableQueryResult<T> = {
  storage: OpsStorage;
  generatedAt: string | null;
  total: number;
  items: T[];
  reason?: string;
};

type IngestRunDbRow = {
  total_count: string | null;
  generated_at: string | null;
  hour_bucket: string;
  runner: 'worker' | 'api_news' | 'warm';
  outlet_id: string;
  source: string;
  country: string;
  method: 'rss' | 'sitemap';
  attempted_runs: string | number;
  successful_runs: string | number;
  failed_runs: string | number;
  fetched_count: string | number;
  valid_count: string | number;
  missing_title_count: string | number;
  missing_summary_count: string | number;
  missing_published_at_count: string | number;
  missing_link_count: string | number;
  updated_at: string | null;
};

type FeedStatusDbRow = {
  total_count: string | null;
  generated_at: string | null;
  outlet_id: string;
  source: string;
  country: string;
  method: 'rss' | 'sitemap';
  last_publication_at: string | null;
  last_fetched_at: string | null;
  updated_at: string | null;
  lag_hours: string | number | null;
};

type BenchmarkMetricDbRow = {
  total_count: string | null;
  generated_at: string | null;
  bucket: string;
  country: string;
  metric_version: string;
  atlas_version: string | null;
  window_start: string;
  window_end: string;
  published_count: string | number;
  fresh_count: string | number;
  late_count: string | number;
  inserted_count: string | number;
  inserted_window_count: string | number | null;
  active_sources_count: string | number;
  active_sources_window_count: string | number | null;
  top_source_share_bps: string | number;
  top_5_source_share_bps: string | number;
  top_10_source_share_bps: string | number;
  updated_at: string | null;
};

type MapMetricDbRow = {
  total_count: string | null;
  generated_at: string | null;
  metric_window: string;
  metric_version: string;
  snapshot_generated_at: string;
  created_at: string | null;
  updated_at: string | null;
  row_count: string | number;
  countries_count: string | number | null;
  published_24h: string | number | null;
  active_sources_24h: string | number | null;
  late_share_24h: string | number | null;
};

let pool: Pool | null = null;
let poolFailed = false;
let poolDisabledReason = 'not_initialized';

function getPool(): Pool | null {
  if (pool) return pool;
  if (poolFailed) return null;
  try {
    pool = new Pool({ connectionString: resolveDatabaseUrl() });
    poolDisabledReason = 'ok';
    return pool;
  } catch {
    poolFailed = true;
    poolDisabledReason = 'missing_database_url';
    return null;
  }
}

function toInt(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toFloat(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDirection(value: string | null | undefined, fallback: OpsSortDirection = 'desc'): OpsSortDirection {
  return value === 'asc' ? 'asc' : value === 'desc' ? 'desc' : fallback;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function parseLimit(value: number | null | undefined, fallback = 50): number {
  const parsed = Number.isFinite(value) ? Number(value) : fallback;
  return Math.max(1, Math.min(200, Math.floor(parsed)));
}

function parseOffset(value: number | null | undefined): number {
  const parsed = Number.isFinite(value) ? Number(value) : 0;
  return Math.max(0, Math.floor(parsed));
}

function buildOpsDisabledResult<T>(items: T[] = []): OpsTableQueryResult<T> {
  return {
    storage: 'disabled',
    generatedAt: null,
    total: 0,
    items,
    reason: poolDisabledReason,
  };
}

export async function readOpsIngestRuns(options: {
  limit?: number;
  offset?: number;
  hours?: number;
  q?: string | null;
  runner?: string | null;
  method?: string | null;
  sort?: string | null;
  direction?: OpsSortDirection;
}): Promise<OpsTableQueryResult<OpsIngestRunRow>> {
  const db = getPool();
  if (!db) return buildOpsDisabledResult();

  const limit = parseLimit(options.limit, 50);
  const offset = parseOffset(options.offset);
  const hours = Math.max(1, Math.min(24 * 30, Math.floor(options.hours || 24)));
  const q = (options.q || '').trim();
  const params: unknown[] = [hours];
  const where: string[] = [`hour_bucket > now() - ($1::int * interval '1 hour')`];

  if (options.runner) {
    params.push(options.runner);
    where.push(`runner = $${params.length}`);
  }
  if (options.method) {
    params.push(options.method);
    where.push(`method = $${params.length}`);
  }
  if (q) {
    params.push(`%${escapeLike(q)}%`);
    where.push(`(source ilike $${params.length} escape '\\' or outlet_id ilike $${params.length} escape '\\' or country ilike $${params.length} escape '\\')`);
  }

  const sortColumn = {
    bucket: 'hour_bucket',
    fetchedCount: 'fetched_count',
    validCount: 'valid_count',
    failedRuns: 'failed_runs',
    attemptedRuns: 'attempted_runs',
    source: 'source',
    country: 'country',
  }[options.sort || 'bucket'] || 'hour_bucket';
  const direction = normalizeDirection(options.direction, sortColumn === 'source' || sortColumn === 'country' ? 'asc' : 'desc');

  params.push(limit, offset);
  const result = await db.query<IngestRunDbRow>(
    `
    select
      count(*) over()::text as total_count,
      max(updated_at) over()::text as generated_at,
      hour_bucket::text,
      runner,
      outlet_id,
      source,
      country,
      method,
      attempted_runs,
      successful_runs,
      failed_runs,
      fetched_count,
      valid_count,
      missing_title_count,
      missing_summary_count,
      missing_published_at_count,
      missing_link_count,
      updated_at::text
    from ingest_ops_hourly
    where ${where.join('\n      and ')}
    order by ${sortColumn} ${direction}, hour_bucket desc, source asc, outlet_id asc
    limit $${params.length - 1}
    offset $${params.length}
    `,
    params,
  );

  return {
    storage: 'postgres',
    generatedAt: result.rows[0]?.generated_at || null,
    total: toInt(result.rows[0]?.total_count),
    items: result.rows.map((row) => ({
      bucket: row.hour_bucket,
      runner: row.runner,
      outletId: row.outlet_id,
      source: row.source,
      country: row.country,
      method: row.method,
      attemptedRuns: toInt(row.attempted_runs),
      successfulRuns: toInt(row.successful_runs),
      failedRuns: toInt(row.failed_runs),
      fetchedCount: toInt(row.fetched_count),
      validCount: toInt(row.valid_count),
      missingTitleCount: toInt(row.missing_title_count),
      missingSummaryCount: toInt(row.missing_summary_count),
      missingPublishedAtCount: toInt(row.missing_published_at_count),
      missingLinkCount: toInt(row.missing_link_count),
      updatedAt: row.updated_at,
    })),
  };
}

export async function readOpsFeedStatus(options: {
  limit?: number;
  offset?: number;
  q?: string | null;
  method?: string | null;
  sort?: string | null;
  direction?: OpsSortDirection;
}): Promise<OpsTableQueryResult<OpsFeedStatusRow>> {
  const db = getPool();
  if (!db) return buildOpsDisabledResult();

  const limit = parseLimit(options.limit, 50);
  const offset = parseOffset(options.offset);
  const q = (options.q || '').trim();
  const params: unknown[] = [];
  const where: string[] = ['1=1'];

  if (options.method) {
    params.push(options.method);
    where.push(`method = $${params.length}`);
  }
  if (q) {
    params.push(`%${escapeLike(q)}%`);
    where.push(`(source ilike $${params.length} escape '\\' or outlet_id ilike $${params.length} escape '\\' or country ilike $${params.length} escape '\\')`);
  }

  const sortColumn = {
    lagHours: 'lag_hours',
    lastPublicationAt: 'last_publication_at',
    lastFetchedAt: 'last_fetched_at',
    source: 'source',
    country: 'country',
  }[options.sort || 'lagHours'] || 'lag_hours';
  const direction = normalizeDirection(options.direction, sortColumn === 'source' || sortColumn === 'country' ? 'asc' : 'desc');

  params.push(limit, offset);
  const result = await db.query<FeedStatusDbRow>(
    `
    select
      count(*) over()::text as total_count,
      max(updated_at) over()::text as generated_at,
      outlet_id,
      source,
      country,
      method,
      last_publication_at::text,
      last_fetched_at::text,
      updated_at::text,
      extract(epoch from (now() - coalesce(last_publication_at, last_fetched_at))) / 3600.0 as lag_hours
    from ingest_feed_watermarks_v2
    where ${where.join('\n      and ')}
    order by ${sortColumn} ${direction} nulls last, source asc, outlet_id asc
    limit $${params.length - 1}
    offset $${params.length}
    `,
    params,
  );

  return {
    storage: 'postgres',
    generatedAt: result.rows[0]?.generated_at || null,
    total: toInt(result.rows[0]?.total_count),
    items: result.rows.map((row) => ({
      outletId: row.outlet_id,
      source: row.source,
      country: row.country,
      method: row.method,
      lastPublicationAt: row.last_publication_at,
      lastFetchedAt: row.last_fetched_at,
      updatedAt: row.updated_at,
      lagHours: toFloat(row.lag_hours),
    })),
  };
}

export async function readOpsBenchmarkMetrics(options: {
  limit?: number;
  offset?: number;
  granularity?: OpsBenchmarkGranularity;
  range?: number;
  q?: string | null;
  sort?: string | null;
  direction?: OpsSortDirection;
}): Promise<OpsTableQueryResult<OpsBenchmarkMetricRow>> {
  const db = getPool();
  if (!db) return buildOpsDisabledResult();

  const limit = parseLimit(options.limit, 50);
  const offset = parseOffset(options.offset);
  const granularity = options.granularity === 'daily' ? 'daily' : 'hourly';
  const range = Math.max(1, Math.min(granularity === 'hourly' ? 24 * 14 : 180, Math.floor(options.range || (granularity === 'hourly' ? 72 : 30))));
  const q = (options.q || '').trim();
  const params: unknown[] = [range];
  const where: string[] =
    granularity === 'hourly'
      ? [`hour_bucket > now() - ($1::int * interval '1 hour')`]
      : [`day_bucket > (now() - ($1::int * interval '1 day'))::date`];

  if (q) {
    params.push(`%${escapeLike(q)}%`);
    where.push(`country ilike $${params.length} escape '\\'`);
  }

  const sortColumn = {
    bucket: 'bucket',
    country: 'country',
    published: 'published_count',
    inserted: 'inserted_count',
    late: 'late_count',
    activeSources: 'active_sources_count',
  }[options.sort || 'bucket'] || 'bucket';
  const direction = normalizeDirection(options.direction, sortColumn === 'country' ? 'asc' : 'desc');

  params.push(limit, offset);
  const result = await db.query<BenchmarkMetricDbRow>(
    granularity === 'hourly'
      ? `
        select
          count(*) over()::text as total_count,
          max(updated_at) over()::text as generated_at,
          hour_bucket::text as bucket,
          country,
          metric_version,
          atlas_version,
          window_start::text,
          window_end::text,
          published_last_24h as published_count,
          fresh_last_24h as fresh_count,
          late_last_24h as late_count,
          inserted_last_24h as inserted_count,
          inserted_last_1h as inserted_window_count,
          active_sources_last_24h as active_sources_count,
          active_sources_last_1h as active_sources_window_count,
          top_source_share_bps,
          top_5_source_share_bps,
          top_10_source_share_bps,
          updated_at::text
        from country_benchmark_hourly
        where ${where.join('\n          and ')}
        order by ${sortColumn} ${direction} nulls last, bucket desc, country asc
        limit $${params.length - 1}
        offset $${params.length}
      `
      : `
        select
          count(*) over()::text as total_count,
          max(updated_at) over()::text as generated_at,
          day_bucket::text as bucket,
          country,
          metric_version,
          atlas_version,
          window_start::text,
          window_end::text,
          published_count,
          fresh_count,
          late_count,
          inserted_count,
          null::int as inserted_window_count,
          active_sources_count,
          null::int as active_sources_window_count,
          top_source_share_bps,
          top_5_source_share_bps,
          top_10_source_share_bps,
          updated_at::text
        from country_benchmark_daily
        where ${where.join('\n          and ')}
        order by ${sortColumn} ${direction} nulls last, bucket desc, country asc
        limit $${params.length - 1}
        offset $${params.length}
      `,
    params,
  );

  return {
    storage: 'postgres',
    generatedAt: result.rows[0]?.generated_at || null,
    total: toInt(result.rows[0]?.total_count),
    items: result.rows.map((row) => ({
      granularity,
      bucket: row.bucket,
      country: row.country,
      metricVersion: row.metric_version,
      atlasVersion: row.atlas_version,
      windowStart: row.window_start,
      windowEnd: row.window_end,
      publishedCount: toInt(row.published_count),
      freshCount: toInt(row.fresh_count),
      lateCount: toInt(row.late_count),
      insertedCount: toInt(row.inserted_count),
      insertedWindowCount: row.inserted_window_count == null ? null : toInt(row.inserted_window_count),
      activeSourcesCount: toInt(row.active_sources_count),
      activeSourcesWindowCount: row.active_sources_window_count == null ? null : toInt(row.active_sources_window_count),
      topSourceShareBps: toInt(row.top_source_share_bps),
      top5SourceShareBps: toInt(row.top_5_source_share_bps),
      top10SourceShareBps: toInt(row.top_10_source_share_bps),
      updatedAt: row.updated_at,
    })),
  };
}

export async function readOpsMapMetrics(options: {
  limit?: number;
  offset?: number;
  kind?: OpsMapMetricKind;
  metricWindow?: string | null;
  sort?: string | null;
  direction?: OpsSortDirection;
}): Promise<OpsTableQueryResult<OpsMapMetricRow>> {
  const db = getPool();
  if (!db) return buildOpsDisabledResult();

  const limit = parseLimit(options.limit, 50);
  const offset = parseOffset(options.offset);
  const kind = options.kind === 'publishers' ? 'publishers' : 'countries';
  const table = kind === 'publishers' ? 'map_publishers_snapshots' : 'map_country_metrics_snapshots';
  const rowKey = kind === 'publishers' ? 'publishers' : 'countries';
  const params: unknown[] = [];
  const where: string[] = ['1=1'];

  if (options.metricWindow) {
    params.push(options.metricWindow);
    where.push(`metric_window = $${params.length}`);
  }

  const sortColumn = {
    generatedAt: 'snapshot_generated_at',
    metricWindow: 'metric_window',
    rowCount: 'row_count',
    published24h: 'published_24h',
    activeSources24h: 'active_sources_24h',
  }[options.sort || 'generatedAt'] || 'snapshot_generated_at';
  const direction = normalizeDirection(options.direction, sortColumn === 'metric_window' ? 'asc' : 'desc');

  params.push(limit, offset);
  const result = await db.query<MapMetricDbRow>(
    `
    select
      count(*) over()::text as total_count,
      max(updated_at) over()::text as generated_at,
      metric_window,
      metric_version,
      generated_at::text as snapshot_generated_at,
      created_at::text,
      updated_at::text,
      case
        when jsonb_typeof(payload -> '${rowKey}') = 'array' then jsonb_array_length(payload -> '${rowKey}')
        else 0
      end::text as row_count,
      case
        when jsonb_typeof(payload -> 'totals') = 'object' then (payload -> 'totals' ->> 'countries')::int
        else null
      end::text as countries_count,
      case
        when jsonb_typeof(payload -> 'totals') = 'object' then (payload -> 'totals' ->> 'pub24h')::int
        else null
      end::text as published_24h,
      case
        when jsonb_typeof(payload -> 'totals') = 'object' then (payload -> 'totals' ->> 'activeSources24h')::int
        else null
      end::text as active_sources_24h,
      case
        when jsonb_typeof(payload -> 'totals' -> 'windows' -> '24h') = 'object' then (payload -> 'totals' -> 'windows' -> '24h' ->> 'lateShare')::numeric
        else null
      end::text as late_share_24h
    from ${table}
    where ${where.join('\n      and ')}
    order by ${sortColumn} ${direction} nulls last, snapshot_generated_at desc
    limit $${params.length - 1}
    offset $${params.length}
    `,
    params,
  );

  return {
    storage: 'postgres',
    generatedAt: result.rows[0]?.generated_at || null,
    total: toInt(result.rows[0]?.total_count),
    items: result.rows.map((row) => ({
      kind,
      metricWindow: row.metric_window,
      metricVersion: row.metric_version,
      generatedAt: row.snapshot_generated_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      rowCount: toInt(row.row_count),
      countriesCount: row.countries_count == null ? null : toInt(row.countries_count),
      published24h: row.published_24h == null ? null : toInt(row.published_24h),
      activeSources24h: row.active_sources_24h == null ? null : toInt(row.active_sources_24h),
      lateShare24h: toFloat(row.late_share_24h),
    })),
  };
}

export function buildOpsIngestRunsResponse(
  result: OpsTableQueryResult<OpsIngestRunRow>,
  params: OpsIngestRunsResponse['params'],
): OpsIngestRunsResponse {
  return { ...result, params };
}

export function buildOpsFeedStatusResponse(
  result: OpsTableQueryResult<OpsFeedStatusRow>,
  params: OpsFeedStatusResponse['params'],
): OpsFeedStatusResponse {
  return { ...result, params };
}

export function buildOpsBenchmarkMetricsResponse(
  result: OpsTableQueryResult<OpsBenchmarkMetricRow>,
  params: OpsBenchmarkMetricsResponse['params'],
): OpsBenchmarkMetricsResponse {
  return { ...result, params };
}

export function buildOpsMapMetricsResponse(
  result: OpsTableQueryResult<OpsMapMetricRow>,
  params: OpsMapMetricsResponse['params'],
): OpsMapMetricsResponse {
  return { ...result, params };
}
