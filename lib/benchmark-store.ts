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

type AggregateDailyCountrySqlRow = {
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

function parseUtcDayBucket(value: string): Date {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`invalid day bucket: ${value}`);
  }
  return parsed;
}

function toUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

function endOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

function getMonthWeekNumber(date: Date): number {
  return Math.floor((date.getUTCDate() - 1) / 7) + 1;
}

function formatMonthlyLabel(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(date);
}

function formatWeeklyLabel(date: Date): string {
  return `${formatMonthlyLabel(date)} Week ${getMonthWeekNumber(date)}`;
}

function getWeeklyRange(date: Date): { start: Date; end: Date; bucket: string; label: string } {
  const weekNumber = getMonthWeekNumber(date);
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), ((weekNumber - 1) * 7) + 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), (weekNumber * 7) + 1, 0, 0, 0, 0));
  const cappedEnd = end > endOfUtcMonth(date) ? endOfUtcMonth(date) : end;
  return {
    start,
    end: cappedEnd,
    bucket: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-w${weekNumber}`,
    label: formatWeeklyLabel(date),
  };
}

function getMonthlyRange(date: Date): { start: Date; end: Date; bucket: string; label: string } {
  const start = startOfUtcMonth(date);
  const end = endOfUtcMonth(date);
  return {
    start,
    end,
    bucket: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
    label: formatMonthlyLabel(date),
  };
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

async function readAggregateDailyWindow(
  pool: Pool,
  metricVersion: string,
  rangeStart: string,
  rangeEnd: string,
  bucket: string,
  label: string,
): Promise<{
  window: CountryBenchmarkWindow;
  publishedCount: number;
  freshCount: number;
  insertedCount: number;
} | null> {
  const result = await pool.query<AggregateDailyWindowSqlRow>(
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

async function readAggregateDailyCountryRows(
  pool: Pool,
  metricVersion: string,
  rangeStart: string,
  rangeEnd: string,
): Promise<AggregateDailyCountrySqlRow[]> {
  const result = await pool.query<AggregateDailyCountrySqlRow>(
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

export async function readCountryBenchmark(): Promise<CountryBenchmarkResponse> {
  const cached = readTimedCache(benchmarkCache);
  if (cached) return cached;

  const database = getPool();
  const metricVersion = DEFAULT_METRIC_VERSION;
  const [hourlyWindow, dailyWindow] = await Promise.all([
    readLatestHourlyWindow(database, metricVersion),
    readLatestDailyWindow(database, metricVersion),
  ]);
  const latestDailyDate = dailyWindow ? parseUtcDayBucket(dailyWindow.bucket) : null;
  const weeklyRange = latestDailyDate ? getWeeklyRange(latestDailyDate) : null;
  const monthlyRange = latestDailyDate ? getMonthlyRange(latestDailyDate) : null;

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
        weeklyPublishedCount: 0,
        weeklyFreshCount: 0,
        weeklyInsertedCount: 0,
        monthlyPublishedCount: 0,
        monthlyFreshCount: 0,
        monthlyInsertedCount: 0,
      },
      hourly: null,
      daily: null,
      weekly: null,
      monthly: null,
      countries: [],
      reason: 'No country benchmark snapshots found.',
    };
  }

  const weeklyCountryRowsPromise = weeklyRange
    ? readAggregateDailyCountryRows(
        database,
        metricVersion,
        toUtcDateKey(weeklyRange.start),
        toUtcDateKey(weeklyRange.end),
      )
    : Promise.resolve([]);
  const monthlyCountryRowsPromise = monthlyRange
    ? readAggregateDailyCountryRows(
        database,
        metricVersion,
        toUtcDateKey(monthlyRange.start),
        toUtcDateKey(monthlyRange.end),
      )
    : Promise.resolve([]);

  const [hourlyRows, dailyRows, weeklyAggregate, monthlyAggregate, weeklyCountryRows, monthlyCountryRows] = await Promise.all([
    hourlyWindow ? readHourlyRows(database, hourlyWindow) : Promise.resolve([]),
    dailyWindow ? readDailyRows(database, dailyWindow) : Promise.resolve([]),
    weeklyRange
      ? readAggregateDailyWindow(
          database,
          metricVersion,
          toUtcDateKey(weeklyRange.start),
          toUtcDateKey(weeklyRange.end),
          weeklyRange.bucket,
          weeklyRange.label,
        )
      : Promise.resolve(null),
    monthlyRange
      ? readAggregateDailyWindow(
          database,
          metricVersion,
          toUtcDateKey(monthlyRange.start),
          toUtcDateKey(monthlyRange.end),
          monthlyRange.bucket,
          monthlyRange.label,
        )
      : Promise.resolve(null),
    weeklyCountryRowsPromise,
    monthlyCountryRowsPromise,
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
      weeklyPublishedCount: 0,
      weeklyFreshCount: 0,
      weeklyLateCount: 0,
      weeklyInsertedCount: 0,
      weeklyAverageActiveSourcesCount: 0,
      weeklyTopSourceShareBps: 0,
      weeklyTop5SourceShareBps: 0,
      weeklyTop10SourceShareBps: 0,
      monthlyPublishedCount: 0,
      monthlyFreshCount: 0,
      monthlyLateCount: 0,
      monthlyInsertedCount: 0,
      monthlyAverageActiveSourcesCount: 0,
      monthlyTopSourceShareBps: 0,
      monthlyTop5SourceShareBps: 0,
      monthlyTop10SourceShareBps: 0,
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
      weeklyPublishedCount: 0,
      weeklyFreshCount: 0,
      weeklyLateCount: 0,
      weeklyInsertedCount: 0,
      weeklyAverageActiveSourcesCount: 0,
      weeklyTopSourceShareBps: 0,
      weeklyTop5SourceShareBps: 0,
      weeklyTop10SourceShareBps: 0,
      monthlyPublishedCount: 0,
      monthlyFreshCount: 0,
      monthlyLateCount: 0,
      monthlyInsertedCount: 0,
      monthlyAverageActiveSourcesCount: 0,
      monthlyTopSourceShareBps: 0,
      monthlyTop5SourceShareBps: 0,
      monthlyTop10SourceShareBps: 0,
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

  for (const row of weeklyCountryRows) {
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
      weeklyPublishedCount: 0,
      weeklyFreshCount: 0,
      weeklyLateCount: 0,
      weeklyInsertedCount: 0,
      weeklyAverageActiveSourcesCount: 0,
      weeklyTopSourceShareBps: 0,
      weeklyTop5SourceShareBps: 0,
      weeklyTop10SourceShareBps: 0,
      monthlyPublishedCount: 0,
      monthlyFreshCount: 0,
      monthlyLateCount: 0,
      monthlyInsertedCount: 0,
      monthlyAverageActiveSourcesCount: 0,
      monthlyTopSourceShareBps: 0,
      monthlyTop5SourceShareBps: 0,
      monthlyTop10SourceShareBps: 0,
    };

    current.weeklyPublishedCount = parseMetricCount(row.published_count);
    current.weeklyFreshCount = parseMetricCount(row.fresh_count);
    current.weeklyLateCount = parseMetricCount(row.late_count);
    current.weeklyInsertedCount = parseMetricCount(row.inserted_count);
    current.weeklyAverageActiveSourcesCount = parseMetricCount(row.average_active_sources_count);
    current.weeklyTopSourceShareBps = parseMetricCount(row.top_source_share_bps);
    current.weeklyTop5SourceShareBps = parseMetricCount(row.top_5_source_share_bps);
    current.weeklyTop10SourceShareBps = parseMetricCount(row.top_10_source_share_bps);
    byCountry.set(row.country, current);
  }

  for (const row of monthlyCountryRows) {
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
      weeklyPublishedCount: 0,
      weeklyFreshCount: 0,
      weeklyLateCount: 0,
      weeklyInsertedCount: 0,
      weeklyAverageActiveSourcesCount: 0,
      weeklyTopSourceShareBps: 0,
      weeklyTop5SourceShareBps: 0,
      weeklyTop10SourceShareBps: 0,
      monthlyPublishedCount: 0,
      monthlyFreshCount: 0,
      monthlyLateCount: 0,
      monthlyInsertedCount: 0,
      monthlyAverageActiveSourcesCount: 0,
      monthlyTopSourceShareBps: 0,
      monthlyTop5SourceShareBps: 0,
      monthlyTop10SourceShareBps: 0,
    };

    current.monthlyPublishedCount = parseMetricCount(row.published_count);
    current.monthlyFreshCount = parseMetricCount(row.fresh_count);
    current.monthlyLateCount = parseMetricCount(row.late_count);
    current.monthlyInsertedCount = parseMetricCount(row.inserted_count);
    current.monthlyAverageActiveSourcesCount = parseMetricCount(row.average_active_sources_count);
    current.monthlyTopSourceShareBps = parseMetricCount(row.top_source_share_bps);
    current.monthlyTop5SourceShareBps = parseMetricCount(row.top_5_source_share_bps);
    current.monthlyTop10SourceShareBps = parseMetricCount(row.top_10_source_share_bps);
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
      weeklyPublishedCount: weeklyAggregate?.publishedCount || 0,
      weeklyFreshCount: weeklyAggregate?.freshCount || 0,
      weeklyInsertedCount: weeklyAggregate?.insertedCount || 0,
      monthlyPublishedCount: monthlyAggregate?.publishedCount || 0,
      monthlyFreshCount: monthlyAggregate?.freshCount || 0,
      monthlyInsertedCount: monthlyAggregate?.insertedCount || 0,
    },
    hourly: hourlyWindow,
    daily: dailyWindow,
    weekly: weeklyAggregate?.window || null,
    monthly: monthlyAggregate?.window || null,
    countries,
  };

  benchmarkCache = writeTimedCache(response, BENCHMARK_CACHE_MS);
  return response;
}
