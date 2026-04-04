import { Pool } from 'pg';
import { resolveDatabaseUrl } from '@/lib/database-url';
import type { CountryBenchmarkWindow } from '@/lib/benchmark-types';

type HourlyWindowSqlRow = {
  bucket: string;
  window_start: string;
  window_end: string;
  generated_at: string;
  metric_version: string;
  atlas_version: string | null;
};

type DailyWindowSqlRow = {
  bucket: string;
  window_start: string;
  window_end: string;
  generated_at: string;
  metric_version: string;
  atlas_version: string | null;
};

export type HourlyRowSql = {
  country: string;
  published_last_24h: string;
  fresh_last_24h: string;
  late_last_24h: string;
  inserted_last_24h: string;
  inserted_last_1h: string;
  active_sources_last_24h: string;
  active_sources_last_1h: string;
  top_source_share_bps: string;
  top_5_source_share_bps: string;
  top_10_source_share_bps: string;
};

export type DailyRowSql = {
  country: string;
  published_count: string;
  fresh_count: string;
  late_count: string;
  inserted_count: string;
  active_sources_count: string;
  top_source_share_bps: string;
  top_5_source_share_bps: string;
  top_10_source_share_bps: string;
};

export type AggregateDailyCountrySqlRow = {
  country: string;
  published_count: string;
  fresh_count: string;
  late_count: string;
  inserted_count: string;
  average_active_sources_count: string;
  top_source_share_bps: string;
  top_5_source_share_bps: string;
  top_10_source_share_bps: string;
};

type AggregateDailyWindowSqlRow = {
  window_start: string;
  window_end: string;
  generated_at: string;
  metric_version: string;
  atlas_version: string | null;
  published_count: string;
  fresh_count: string;
  inserted_count: string;
};

export type AggregateDailyWindowResult = {
  window: CountryBenchmarkWindow;
  publishedCount: number;
  freshCount: number;
  insertedCount: number;
};

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: resolveDatabaseUrl() });
  }
  return pool;
}

function parseMetricCount(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function readLatestHourlyWindow(metricVersion: string): Promise<CountryBenchmarkWindow | null> {
  const result = await getPool().query<HourlyWindowSqlRow>(
    `
    select
      hour_bucket::text as bucket,
      min(window_start)::text as window_start,
      max(window_end)::text as window_end,
      max(updated_at)::text as generated_at,
      metric_version,
      max(atlas_version)::text as atlas_version
    from country_benchmark_hourly
    where metric_version = $1
    group by hour_bucket, metric_version
    order by hour_bucket desc
    limit 1
    `,
    [metricVersion],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    bucket: row.bucket,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    generatedAt: row.generated_at,
    metricVersion: row.metric_version,
    atlasVersion: row.atlas_version,
  };
}

export async function readLatestDailyWindow(metricVersion: string): Promise<CountryBenchmarkWindow | null> {
  const result = await getPool().query<DailyWindowSqlRow>(
    `
    select
      day_bucket::text as bucket,
      min(window_start)::text as window_start,
      max(window_end)::text as window_end,
      max(updated_at)::text as generated_at,
      metric_version,
      max(atlas_version)::text as atlas_version
    from country_benchmark_daily
    where metric_version = $1
    group by day_bucket, metric_version
    order by day_bucket desc
    limit 1
    `,
    [metricVersion],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    bucket: row.bucket,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    generatedAt: row.generated_at,
    metricVersion: row.metric_version,
    atlasVersion: row.atlas_version,
  };
}

export async function readHourlyRows(window: CountryBenchmarkWindow): Promise<HourlyRowSql[]> {
  const result = await getPool().query<HourlyRowSql>(
    `
    select
      country,
      published_last_24h::text,
      fresh_last_24h::text,
      late_last_24h::text,
      inserted_last_24h::text,
      inserted_last_1h::text,
      active_sources_last_24h::text,
      active_sources_last_1h::text,
      top_source_share_bps::text,
      top_5_source_share_bps::text,
      top_10_source_share_bps::text
    from country_benchmark_hourly
    where hour_bucket = $1::timestamptz
      and metric_version = $2
    order by published_last_24h desc, country asc
    `,
    [window.bucket, window.metricVersion],
  );
  return result.rows;
}

export async function readDailyRows(window: CountryBenchmarkWindow): Promise<DailyRowSql[]> {
  const result = await getPool().query<DailyRowSql>(
    `
    select
      country,
      published_count::text,
      fresh_count::text,
      late_count::text,
      inserted_count::text,
      active_sources_count::text,
      top_source_share_bps::text,
      top_5_source_share_bps::text,
      top_10_source_share_bps::text
    from country_benchmark_daily
    where day_bucket = $1::date
      and metric_version = $2
    order by published_count desc, country asc
    `,
    [window.bucket, window.metricVersion],
  );
  return result.rows;
}

export async function readAggregateDailyWindow(
  metricVersion: string,
  rangeStart: string,
  rangeEnd: string,
  bucket: string,
  label: string,
): Promise<AggregateDailyWindowResult | null> {
  const result = await getPool().query<AggregateDailyWindowSqlRow>(
    `
    select
      min(window_start)::text as window_start,
      max(window_end)::text as window_end,
      max(updated_at)::text as generated_at,
      metric_version,
      max(atlas_version)::text as atlas_version,
      coalesce(sum(published_count), 0)::text as published_count,
      coalesce(sum(fresh_count), 0)::text as fresh_count,
      coalesce(sum(inserted_count), 0)::text as inserted_count
    from country_benchmark_daily
    where day_bucket >= $1::date
      and day_bucket < $2::date
      and metric_version = $3
    group by metric_version
    limit 1
    `,
    [rangeStart, rangeEnd, metricVersion],
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    window: {
      bucket,
      label,
      windowStart: row.window_start,
      windowEnd: row.window_end,
      generatedAt: row.generated_at,
      metricVersion: row.metric_version,
      atlasVersion: row.atlas_version,
    },
    publishedCount: parseMetricCount(row.published_count),
    freshCount: parseMetricCount(row.fresh_count),
    insertedCount: parseMetricCount(row.inserted_count),
  };
}

export async function readAggregateDailyCountryRows(
  metricVersion: string,
  rangeStart: string,
  rangeEnd: string,
): Promise<AggregateDailyCountrySqlRow[]> {
  const result = await getPool().query<AggregateDailyCountrySqlRow>(
    `
    select
      country,
      coalesce(sum(published_count), 0)::text as published_count,
      coalesce(sum(fresh_count), 0)::text as fresh_count,
      coalesce(sum(late_count), 0)::text as late_count,
      coalesce(sum(inserted_count), 0)::text as inserted_count,
      coalesce(round(avg(active_sources_count)), 0)::text as average_active_sources_count,
      coalesce(
        round(sum((top_source_share_bps::numeric) * published_count) / nullif(sum(published_count), 0)),
        0
      )::text as top_source_share_bps,
      coalesce(
        round(sum((top_5_source_share_bps::numeric) * published_count) / nullif(sum(published_count), 0)),
        0
      )::text as top_5_source_share_bps,
      coalesce(
        round(sum((top_10_source_share_bps::numeric) * published_count) / nullif(sum(published_count), 0)),
        0
      )::text as top_10_source_share_bps
    from country_benchmark_daily
    where day_bucket >= $1::date
      and day_bucket < $2::date
      and metric_version = $3
    group by country
    order by sum(published_count) desc, country asc
    `,
    [rangeStart, rangeEnd, metricVersion],
  );
  return result.rows;
}
