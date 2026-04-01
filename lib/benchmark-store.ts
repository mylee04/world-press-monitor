import 'server-only';

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { resolveDatabaseUrl } from '@/lib/database-url';
import type {
  CountryBenchmarkCountryRow,
  CountryBenchmarkResponse,
  CountryBenchmarkWindow,
} from '@/lib/benchmark-types';

type AtlasCatalog = {
  countries?: Array<{
    name?: string;
    code?: string | null;
  }>;
};

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

type HourlyRowSql = {
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

type DailyRowSql = {
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

type TimedCacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const DEFAULT_METRIC_VERSION = 'v1';
const BENCHMARK_CACHE_MS = 60_000;

let pool: Pool | null = null;
let benchmarkCache: TimedCacheEntry<CountryBenchmarkResponse> | null = null;
let countryCodeCache: Map<string, string | null> | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: resolveDatabaseUrl() });
  }
  return pool;
}

function readTimedCache<T>(entry: TimedCacheEntry<T> | null | undefined): T | null {
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) return null;
  return entry.value;
}

function writeTimedCache<T>(value: T, ttlMs: number): TimedCacheEntry<T> {
  return {
    value,
    expiresAt: Date.now() + ttlMs,
  };
}

function parseMetricCount(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getAtlasPath(): string {
  return path.join(process.cwd(), 'data', 'rss-atlas.json');
}

function loadCountryCodes(): Map<string, string | null> {
  if (countryCodeCache) return countryCodeCache;
  const raw = readFileSync(getAtlasPath(), 'utf8');
  const parsed = JSON.parse(raw) as AtlasCatalog;
  const codes = new Map<string, string | null>();
  for (const country of parsed.countries || []) {
    const name = (country.name || '').trim();
    if (!name) continue;
    codes.set(name, (country.code || '').trim() || null);
  }
  countryCodeCache = codes;
  return codes;
}

async function readLatestHourlyWindow(pool: Pool, metricVersion: string): Promise<CountryBenchmarkWindow | null> {
  const result = await pool.query<HourlyWindowSqlRow>(
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

async function readLatestDailyWindow(pool: Pool, metricVersion: string): Promise<CountryBenchmarkWindow | null> {
  const result = await pool.query<DailyWindowSqlRow>(
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

async function readHourlyRows(pool: Pool, window: CountryBenchmarkWindow): Promise<HourlyRowSql[]> {
  const result = await pool.query<HourlyRowSql>(
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

async function readDailyRows(pool: Pool, window: CountryBenchmarkWindow): Promise<DailyRowSql[]> {
  const result = await pool.query<DailyRowSql>(
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

export async function readCountryBenchmark(): Promise<CountryBenchmarkResponse> {
  const cached = readTimedCache(benchmarkCache);
  if (cached) return cached;

  const database = getPool();
  const metricVersion = DEFAULT_METRIC_VERSION;
  const [hourlyWindow, dailyWindow] = await Promise.all([
    readLatestHourlyWindow(database, metricVersion),
    readLatestDailyWindow(database, metricVersion),
  ]);

  if (!hourlyWindow && !dailyWindow) {
    return {
      storage: 'disabled',
      generatedAt: null,
      totals: {
        countries: 0,
        hourlyPublished24h: 0,
        hourlyFresh24h: 0,
        hourlyInserted24h: 0,
        dailyPublishedCount: 0,
        dailyFreshCount: 0,
        dailyInsertedCount: 0,
      },
      hourly: null,
      daily: null,
      countries: [],
      reason: 'No country benchmark snapshots found.',
    };
  }

  const [hourlyRows, dailyRows] = await Promise.all([
    hourlyWindow ? readHourlyRows(database, hourlyWindow) : Promise.resolve([]),
    dailyWindow ? readDailyRows(database, dailyWindow) : Promise.resolve([]),
  ]);

  const byCountry = new Map<string, CountryBenchmarkCountryRow>();
  const countryCodes = loadCountryCodes();

  for (const row of hourlyRows) {
    byCountry.set(row.country, {
      country: row.country,
      countryCode: countryCodes.get(row.country) || null,
      hourlyPublished24h: parseMetricCount(row.published_last_24h),
      hourlyFresh24h: parseMetricCount(row.fresh_last_24h),
      hourlyLate24h: parseMetricCount(row.late_last_24h),
      hourlyInserted24h: parseMetricCount(row.inserted_last_24h),
      hourlyInserted1h: parseMetricCount(row.inserted_last_1h),
      hourlyActiveSources24h: parseMetricCount(row.active_sources_last_24h),
      hourlyActiveSources1h: parseMetricCount(row.active_sources_last_1h),
      hourlyTopSourceShareBps: parseMetricCount(row.top_source_share_bps),
      hourlyTop5SourceShareBps: parseMetricCount(row.top_5_source_share_bps),
      hourlyTop10SourceShareBps: parseMetricCount(row.top_10_source_share_bps),
      dailyPublishedCount: 0,
      dailyFreshCount: 0,
      dailyLateCount: 0,
      dailyInsertedCount: 0,
      dailyActiveSourcesCount: 0,
      dailyTopSourceShareBps: 0,
      dailyTop5SourceShareBps: 0,
      dailyTop10SourceShareBps: 0,
    });
  }

  for (const row of dailyRows) {
    const current = byCountry.get(row.country) || {
      country: row.country,
      countryCode: countryCodes.get(row.country) || null,
      hourlyPublished24h: 0,
      hourlyFresh24h: 0,
      hourlyLate24h: 0,
      hourlyInserted24h: 0,
      hourlyInserted1h: 0,
      hourlyActiveSources24h: 0,
      hourlyActiveSources1h: 0,
      hourlyTopSourceShareBps: 0,
      hourlyTop5SourceShareBps: 0,
      hourlyTop10SourceShareBps: 0,
      dailyPublishedCount: 0,
      dailyFreshCount: 0,
      dailyLateCount: 0,
      dailyInsertedCount: 0,
      dailyActiveSourcesCount: 0,
      dailyTopSourceShareBps: 0,
      dailyTop5SourceShareBps: 0,
      dailyTop10SourceShareBps: 0,
    };

    current.dailyPublishedCount = parseMetricCount(row.published_count);
    current.dailyFreshCount = parseMetricCount(row.fresh_count);
    current.dailyLateCount = parseMetricCount(row.late_count);
    current.dailyInsertedCount = parseMetricCount(row.inserted_count);
    current.dailyActiveSourcesCount = parseMetricCount(row.active_sources_count);
    current.dailyTopSourceShareBps = parseMetricCount(row.top_source_share_bps);
    current.dailyTop5SourceShareBps = parseMetricCount(row.top_5_source_share_bps);
    current.dailyTop10SourceShareBps = parseMetricCount(row.top_10_source_share_bps);
    byCountry.set(row.country, current);
  }

  const countries = [...byCountry.values()].sort(
    (left, right) =>
      right.hourlyPublished24h - left.hourlyPublished24h ||
      right.dailyPublishedCount - left.dailyPublishedCount ||
      left.country.localeCompare(right.country),
  );

  const response: CountryBenchmarkResponse = {
    storage: 'postgres',
    generatedAt: new Date().toISOString(),
    totals: {
      countries: countries.length,
      hourlyPublished24h: countries.reduce((sum, row) => sum + row.hourlyPublished24h, 0),
      hourlyFresh24h: countries.reduce((sum, row) => sum + row.hourlyFresh24h, 0),
      hourlyInserted24h: countries.reduce((sum, row) => sum + row.hourlyInserted24h, 0),
      dailyPublishedCount: countries.reduce((sum, row) => sum + row.dailyPublishedCount, 0),
      dailyFreshCount: countries.reduce((sum, row) => sum + row.dailyFreshCount, 0),
      dailyInsertedCount: countries.reduce((sum, row) => sum + row.dailyInsertedCount, 0),
    },
    hourly: hourlyWindow,
    daily: dailyWindow,
    countries,
  };

  benchmarkCache = writeTimedCache(response, BENCHMARK_CACHE_MS);
  return response;
}
