#!/usr/bin/env bun

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { resolveDatabaseUrl } from '@/lib/database-url';

type Mode = 'hourly' | 'daily' | 'all';

type AtlasCatalog = {
  countries?: Array<{
    name?: string;
    code?: string;
    feeds?: Array<{
      name?: string;
    }>;
  }>;
};

type AtlasMetadata = {
  canonicalCountryByValue: Map<string, string>;
  sourceCountryByName: Map<string, string>;
  sourceCountryByNormalizedName: Map<string, string>;
};

type HourlySourceRow = {
  source_country: string | null;
  source: string;
  inserted_last_1h: string;
  inserted_last_24h: string;
  published_last_24h: string;
  fresh_last_24h: string;
  late_last_24h: string;
};

type DailySourceRow = {
  source_country: string | null;
  source: string;
  inserted_count: string;
  published_count: string;
  fresh_count: string;
  late_count: string;
};

type BenchmarkHourlyRow = {
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

type BenchmarkDailyRow = {
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

type BenchmarkSourceDailyRow = {
  country: string;
  source: string;
  published_count: string;
  fresh_count: string;
  late_count: string;
  inserted_count: string;
};

type SnapshotWindow = {
  bucket: string;
  windowStart: string;
  windowEnd: string;
  generatedAt: string;
  rowCount: number;
};

type CountryHourlyAggregate = {
  country: string;
  publishedLast24h: number;
  freshLast24h: number;
  lateLast24h: number;
  insertedLast24h: number;
  insertedLast1h: number;
  activeSourcesLast24h: number;
  activeSourcesLast1h: number;
  topSourceShareBps: number;
  top5SourceShareBps: number;
  top10SourceShareBps: number;
};

type CountryDailyAggregate = {
  country: string;
  publishedCount: number;
  freshCount: number;
  lateCount: number;
  insertedCount: number;
  activeSourcesCount: number;
  topSourceShareBps: number;
  top5SourceShareBps: number;
  top10SourceShareBps: number;
};

type SourceDailyAggregate = {
  country: string;
  source: string;
  publishedCount: number;
  freshCount: number;
  lateCount: number;
  insertedCount: number;
};

type ComparisonMismatch = {
  key: string;
  field: string;
  expected: number;
  actual: number;
};

const DEFAULT_ATLAS_PATH = resolve(process.cwd(), 'data/rss-atlas.json');
const DEFAULT_METRIC_VERSION = 'v1';
const DEFAULT_LOG_PREFIX = '[country-benchmark-parity]';
const LOW_SIGNAL_TITLE_SQL = `
  (
    coalesce(nullif(trim(title_quality), ''), 'ok') = 'suspect'
    or
    coalesce(nullif(trim(title_original), ''), '') = coalesce(url, '')
    or coalesce(nullif(trim(title_original), ''), '') ilike 'http%'
    or coalesce(nullif(trim(title_original), ''), '') ~* '^(c[0-9]+\\s+[0-9]+(?:\\.html)?|art[- ]?[0-9]+(?:\\.html)?|story[0-9]{8}(?:[-_ ]?[0-9]+)?(?:\\.html)?|[0-9]{6,}|news|latest|domestic|international|photo|video)$'
    or coalesce(nullif(trim(title_original), ''), '') ~* '^[[:xdigit:]]{32}$'
    or coalesce(nullif(trim(title_original), ''), '') ~* '^Cision[[:alnum:]]+$'
    or coalesce(nullif(trim(title_original), ''), '') ~* '^Catalog(?:\\.aspx)?(?:\\?.+)?$'
    or (source ~* 'oricon' and coalesce(nullif(trim(title_original), ''), '') ~* '^(full|news|anime|comic|voiceactor)$')
    or (source ~* 'abema times' and coalesce(nullif(trim(title_original), ''), '') ~* '^(full|news|anime)$')
    or (source ~* 'parapolitika' and coalesce(nullif(trim(title_original), ''), '') ~* '^[a-z0-9_-]{4,180}$')
  )
`;

function parseArgValue(flag: string): string | null {
  const inline = process.argv.find((token) => token.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1).trim() || null;
  const index = process.argv.indexOf(flag);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1].trim() || null;
  return null;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function parseMode(): Mode {
  const raw = (parseArgValue('--mode') || 'all').trim().toLowerCase();
  if (raw === 'hourly' || raw === 'daily' || raw === 'all') return raw;
  throw new Error(`invalid --mode value: ${raw}`);
}

function normalizeCountryValue(value: string | undefined): string {
  if (!value) return '';
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseMetricCount(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function loadAtlasMetadata(filePath: string): AtlasMetadata {
  const raw = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as AtlasCatalog;
  const canonicalCountryByValue = new Map<string, string>();
  const sourceCountryByName = new Map<string, string>();
  const sourceCountryByNormalizedName = new Map<string, string>();

  for (const country of parsed.countries || []) {
    const countryName = typeof country?.name === 'string' ? country.name.trim() : '';
    const countryCode = typeof country?.code === 'string' ? country.code.trim() : '';
    if (countryName) {
      canonicalCountryByValue.set(normalizeCountryValue(countryName), countryName);
    }
    if (countryCode && countryName) {
      canonicalCountryByValue.set(normalizeCountryValue(countryCode), countryName);
    }
    if (!countryName || !Array.isArray(country.feeds)) continue;
    for (const feed of country.feeds) {
      if (typeof feed?.name !== 'string' || feed.name.trim().length === 0) continue;
      const sourceName = feed.name.trim();
      sourceCountryByName.set(sourceName, countryName);
      sourceCountryByNormalizedName.set(normalizeCountryValue(sourceName), countryName);
    }
  }

  return {
    canonicalCountryByValue,
    sourceCountryByName,
    sourceCountryByNormalizedName,
  };
}

function canonicalizeCountry(value: string, atlas: AtlasMetadata): string {
  const trimmed = value.trim();
  if (!trimmed) return '(unknown)';
  return atlas.canonicalCountryByValue.get(normalizeCountryValue(trimmed)) || trimmed;
}

function resolveBenchmarkCountry(sourceCountry: string | null, source: string, atlas: AtlasMetadata): string {
  const fromRow = typeof sourceCountry === 'string' ? sourceCountry.trim() : '';
  if (fromRow) return canonicalizeCountry(fromRow, atlas);
  const sourceName = source.trim();
  const fromAtlas =
    atlas.sourceCountryByName.get(sourceName)
    || atlas.sourceCountryByNormalizedName.get(normalizeCountryValue(sourceName));
  if (fromAtlas) return canonicalizeCountry(fromAtlas, atlas);
  return '(unknown)';
}

function toBasisPoints(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0 || numerator <= 0) return 0;
  return Math.round((numerator * 10_000) / denominator);
}

function topShareBasisPoints(values: number[], limit: number, denominator: number): number {
  if (denominator <= 0 || values.length === 0 || limit <= 0) return 0;
  const topSum = values
    .slice()
    .sort((left, right) => right - left)
    .slice(0, limit)
    .reduce((sum, value) => sum + value, 0);
  return toBasisPoints(topSum, denominator);
}

async function loadLatestHourlyWindow(pool: Pool, metricVersion: string): Promise<SnapshotWindow> {
  const explicitBucket = parseArgValue('--hour');
  const result = await pool.query<{
    bucket: string;
    window_start: string;
    window_end: string;
    generated_at: string;
    row_count: string;
  }>(
    `
    select
      hour_bucket::text as bucket,
      min(window_start)::text as window_start,
      max(window_end)::text as window_end,
      max(updated_at)::text as generated_at,
      count(*)::bigint::text as row_count
    from country_benchmark_hourly
    where metric_version = $1
      and ($2::timestamptz is null or hour_bucket = $2::timestamptz)
    group by hour_bucket
    order by hour_bucket desc
    limit 1
    `,
    [metricVersion, explicitBucket || null],
  );
  const row = result.rows[0];
  if (!row) throw new Error(`no hourly benchmark rows found for metric_version=${metricVersion}`);
  return {
    bucket: row.bucket,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    generatedAt: row.generated_at,
    rowCount: parseMetricCount(row.row_count),
  };
}

async function loadLatestDailyWindow(pool: Pool, metricVersion: string): Promise<SnapshotWindow> {
  const explicitDay = parseArgValue('--day');
  const result = await pool.query<{
    bucket: string;
    window_start: string;
    window_end: string;
    generated_at: string;
    row_count: string;
  }>(
    `
    select
      day_bucket::text as bucket,
      min(window_start)::text as window_start,
      max(window_end)::text as window_end,
      max(updated_at)::text as generated_at,
      count(*)::bigint::text as row_count
    from country_benchmark_daily
    where metric_version = $1
      and ($2::date is null or day_bucket = $2::date)
    group by day_bucket
    order by day_bucket desc
    limit 1
    `,
    [metricVersion, explicitDay || null],
  );
  const row = result.rows[0];
  if (!row) throw new Error(`no daily benchmark rows found for metric_version=${metricVersion}`);
  return {
    bucket: row.bucket,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    generatedAt: row.generated_at,
    rowCount: parseMetricCount(row.row_count),
  };
}

async function readHourlyBenchmarkRows(pool: Pool, metricVersion: string, bucket: string): Promise<BenchmarkHourlyRow[]> {
  const result = await pool.query<BenchmarkHourlyRow>(
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
    where metric_version = $1
      and hour_bucket = $2::timestamptz
    order by country asc
    `,
    [metricVersion, bucket],
  );
  return result.rows;
}

async function readDailyBenchmarkRows(pool: Pool, metricVersion: string, bucket: string): Promise<BenchmarkDailyRow[]> {
  const result = await pool.query<BenchmarkDailyRow>(
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
    where metric_version = $1
      and day_bucket = $2::date
    order by country asc
    `,
    [metricVersion, bucket],
  );
  return result.rows;
}

async function readSourceDailyBenchmarkRows(pool: Pool, metricVersion: string, bucket: string): Promise<BenchmarkSourceDailyRow[]> {
  const result = await pool.query<BenchmarkSourceDailyRow>(
    `
    select
      country,
      source,
      published_count::text,
      fresh_count::text,
      late_count::text,
      inserted_count::text
    from country_benchmark_source_daily
    where metric_version = $1
      and day_bucket = $2::date
    order by country asc, source asc
    `,
    [metricVersion, bucket],
  );
  return result.rows;
}

async function readHourlySourceRows(pool: Pool, windowStart: string, windowEnd: string): Promise<HourlySourceRow[]> {
  const result = await pool.query<HourlySourceRow>(
    `
    select
      source_country,
      source,
      count(*) filter (
        where created_at >= $2::timestamptz - interval '1 hour'
          and created_at < $2::timestamptz
      )::bigint::text as inserted_last_1h,
      count(*) filter (
        where created_at >= $1::timestamptz
          and created_at < $2::timestamptz
      )::bigint::text as inserted_last_24h,
      count(*) filter (
        where least(publication_datetime, created_at) >= $1::timestamptz
          and least(publication_datetime, created_at) < $2::timestamptz
      )::bigint::text as published_last_24h,
      count(*) filter (
        where created_at >= $1::timestamptz
          and created_at < $2::timestamptz
          and least(publication_datetime, created_at) >= $1::timestamptz
          and least(publication_datetime, created_at) < $2::timestamptz
      )::bigint::text as fresh_last_24h,
      count(*) filter (
        where created_at >= $1::timestamptz
          and created_at < $2::timestamptz
          and least(publication_datetime, created_at) < $1::timestamptz
      )::bigint::text as late_last_24h
    from news_articles
    where not ${LOW_SIGNAL_TITLE_SQL}
      and created_at < $2::timestamptz
      and (
        (created_at >= $1::timestamptz and created_at < $2::timestamptz)
        or
        (publication_datetime >= $1::timestamptz and publication_datetime < $2::timestamptz)
      )
    group by source_country, source
    order by source_country asc nulls last, source asc
    `,
    [windowStart, windowEnd],
  );
  return result.rows;
}

async function readDailySourceRows(pool: Pool, windowStart: string, windowEnd: string, generatedAt: string): Promise<DailySourceRow[]> {
  const result = await pool.query<DailySourceRow>(
    `
    select
      source_country,
      source,
      count(*) filter (
        where created_at >= $1::timestamptz
          and created_at < $2::timestamptz
      )::bigint::text as inserted_count,
      count(*) filter (
        where least(publication_datetime, created_at) >= $1::timestamptz
          and least(publication_datetime, created_at) < $2::timestamptz
      )::bigint::text as published_count,
      count(*) filter (
        where created_at >= $1::timestamptz
          and created_at < $2::timestamptz
          and least(publication_datetime, created_at) >= $1::timestamptz
          and least(publication_datetime, created_at) < $2::timestamptz
      )::bigint::text as fresh_count,
      count(*) filter (
        where created_at >= $1::timestamptz
          and created_at < $2::timestamptz
          and least(publication_datetime, created_at) < $1::timestamptz
      )::bigint::text as late_count
    from news_articles
    where not ${LOW_SIGNAL_TITLE_SQL}
      and created_at <= $3::timestamptz
      and (
        (created_at >= $1::timestamptz and created_at < $2::timestamptz)
        or
        (publication_datetime >= $1::timestamptz and publication_datetime < $2::timestamptz)
      )
    group by source_country, source
    order by source_country asc nulls last, source asc
    `,
    [windowStart, windowEnd, generatedAt],
  );
  return result.rows;
}

function aggregateHourlyRows(rows: HourlySourceRow[], atlas: AtlasMetadata): CountryHourlyAggregate[] {
  const perCountry = new Map<string, Map<string, {
    published: number;
    fresh: number;
    late: number;
    inserted: number;
    inserted1h: number;
  }>>();

  for (const row of rows) {
    const country = resolveBenchmarkCountry(row.source_country, row.source, atlas);
    const bySource = perCountry.get(country) || new Map();
    perCountry.set(country, bySource);
    const current = bySource.get(row.source) || {
      published: 0,
      fresh: 0,
      late: 0,
      inserted: 0,
      inserted1h: 0,
    };
    current.inserted1h += parseMetricCount(row.inserted_last_1h);
    current.inserted += parseMetricCount(row.inserted_last_24h);
    current.published += parseMetricCount(row.published_last_24h);
    current.fresh += parseMetricCount(row.fresh_last_24h);
    current.late += parseMetricCount(row.late_last_24h);
    bySource.set(row.source, current);
  }

  return [...perCountry.entries()].map(([country, bySource]) => {
    const perSource = [...bySource.values()];
    const publishedCounts = perSource.map((row) => row.published).filter((value) => value > 0);
    const publishedTotal = perSource.reduce((sum, row) => sum + row.published, 0);
    return {
      country,
      publishedLast24h: publishedTotal,
      freshLast24h: perSource.reduce((sum, row) => sum + row.fresh, 0),
      lateLast24h: perSource.reduce((sum, row) => sum + row.late, 0),
      insertedLast24h: perSource.reduce((sum, row) => sum + row.inserted, 0),
      insertedLast1h: perSource.reduce((sum, row) => sum + row.inserted1h, 0),
      activeSourcesLast24h: perSource.filter((row) => row.published > 0 || row.inserted > 0).length,
      activeSourcesLast1h: perSource.filter((row) => row.inserted1h > 0).length,
      topSourceShareBps: topShareBasisPoints(publishedCounts, 1, publishedTotal),
      top5SourceShareBps: topShareBasisPoints(publishedCounts, 5, publishedTotal),
      top10SourceShareBps: topShareBasisPoints(publishedCounts, 10, publishedTotal),
    };
  }).sort((left, right) => left.country.localeCompare(right.country));
}

function aggregateDailyRows(rows: DailySourceRow[], atlas: AtlasMetadata): {
  countries: CountryDailyAggregate[];
  sources: SourceDailyAggregate[];
} {
  const perCountry = new Map<string, Map<string, SourceDailyAggregate>>();

  for (const row of rows) {
    const country = resolveBenchmarkCountry(row.source_country, row.source, atlas);
    const bySource = perCountry.get(country) || new Map<string, SourceDailyAggregate>();
    perCountry.set(country, bySource);
    const current = bySource.get(row.source) || {
      country,
      source: row.source,
      publishedCount: 0,
      freshCount: 0,
      lateCount: 0,
      insertedCount: 0,
    };
    current.insertedCount += parseMetricCount(row.inserted_count);
    current.publishedCount += parseMetricCount(row.published_count);
    current.freshCount += parseMetricCount(row.fresh_count);
    current.lateCount += parseMetricCount(row.late_count);
    bySource.set(row.source, current);
  }

  const countries: CountryDailyAggregate[] = [];
  const sources: SourceDailyAggregate[] = [];

  for (const [country, bySource] of perCountry.entries()) {
    const perSource = [...bySource.values()];
    const publishedCounts = perSource.map((row) => row.publishedCount).filter((value) => value > 0);
    const publishedTotal = perSource.reduce((sum, row) => sum + row.publishedCount, 0);
    countries.push({
      country,
      publishedCount: publishedTotal,
      freshCount: perSource.reduce((sum, row) => sum + row.freshCount, 0),
      lateCount: perSource.reduce((sum, row) => sum + row.lateCount, 0),
      insertedCount: perSource.reduce((sum, row) => sum + row.insertedCount, 0),
      activeSourcesCount: perSource.filter((row) => row.publishedCount > 0 || row.insertedCount > 0).length,
      topSourceShareBps: topShareBasisPoints(publishedCounts, 1, publishedTotal),
      top5SourceShareBps: topShareBasisPoints(publishedCounts, 5, publishedTotal),
      top10SourceShareBps: topShareBasisPoints(publishedCounts, 10, publishedTotal),
    });
    sources.push(...perSource);
  }

  countries.sort((left, right) => left.country.localeCompare(right.country));
  sources.sort((left, right) => left.country.localeCompare(right.country) || left.source.localeCompare(right.source));
  return { countries, sources };
}

function compareNumericMaps<T extends { [key: string]: number | string }>(
  expectedRows: T[],
  actualRows: T[],
  keyBuilder: (row: T) => string,
  fields: string[],
): {
  exact: boolean;
  missingInExpected: string[];
  missingInActual: string[];
  mismatches: ComparisonMismatch[];
} {
  const expected = new Map(expectedRows.map((row) => [keyBuilder(row), row]));
  const actual = new Map(actualRows.map((row) => [keyBuilder(row), row]));
  const keys = new Set([...expected.keys(), ...actual.keys()]);
  const missingInExpected: string[] = [];
  const missingInActual: string[] = [];
  const mismatches: ComparisonMismatch[] = [];

  for (const key of [...keys].sort()) {
    const expectedRow = expected.get(key);
    const actualRow = actual.get(key);
    if (!expectedRow) {
      missingInExpected.push(key);
      continue;
    }
    if (!actualRow) {
      missingInActual.push(key);
      continue;
    }
    for (const field of fields) {
      const expectedValue = parseMetricCount(expectedRow[field]);
      const actualValue = parseMetricCount(actualRow[field]);
      if (expectedValue !== actualValue) {
        mismatches.push({
          key,
          field,
          expected: expectedValue,
          actual: actualValue,
        });
      }
    }
  }

  return {
    exact: missingInExpected.length === 0 && missingInActual.length === 0 && mismatches.length === 0,
    missingInExpected,
    missingInActual,
    mismatches,
  };
}

async function validateHourly(pool: Pool, atlas: AtlasMetadata, metricVersion: string): Promise<Record<string, unknown>> {
  const window = await loadLatestHourlyWindow(pool, metricVersion);
  const benchmarkRows = await readHourlyBenchmarkRows(pool, metricVersion, window.bucket);
  const sourceRows = await readHourlySourceRows(pool, window.windowStart, window.windowEnd);
  const liveRows = aggregateHourlyRows(sourceRows, atlas);

  const benchmarkNormalized = benchmarkRows.map((row) => ({
    country: row.country,
    publishedLast24h: parseMetricCount(row.published_last_24h),
    freshLast24h: parseMetricCount(row.fresh_last_24h),
    lateLast24h: parseMetricCount(row.late_last_24h),
    insertedLast24h: parseMetricCount(row.inserted_last_24h),
    insertedLast1h: parseMetricCount(row.inserted_last_1h),
    activeSourcesLast24h: parseMetricCount(row.active_sources_last_24h),
    activeSourcesLast1h: parseMetricCount(row.active_sources_last_1h),
    topSourceShareBps: parseMetricCount(row.top_source_share_bps),
    top5SourceShareBps: parseMetricCount(row.top_5_source_share_bps),
    top10SourceShareBps: parseMetricCount(row.top_10_source_share_bps),
  }));

  const comparison = compareNumericMaps(
    benchmarkNormalized,
    liveRows,
    (row) => String(row.country),
    [
      'publishedLast24h',
      'freshLast24h',
      'lateLast24h',
      'insertedLast24h',
      'insertedLast1h',
      'activeSourcesLast24h',
      'activeSourcesLast1h',
      'topSourceShareBps',
      'top5SourceShareBps',
      'top10SourceShareBps',
    ],
  );

  return {
    mode: 'hourly',
    window,
    benchmarkRows: benchmarkRows.length,
    liveCountryRows: liveRows.length,
    liveSourceRows: sourceRows.length,
    exact: comparison.exact,
    missingInBenchmark: comparison.missingInExpected.slice(0, 20),
    missingInLive: comparison.missingInActual.slice(0, 20),
    mismatchCount: comparison.mismatches.length,
    mismatchSample: comparison.mismatches.slice(0, 20),
  };
}

async function validateDaily(pool: Pool, atlas: AtlasMetadata, metricVersion: string): Promise<Record<string, unknown>> {
  const window = await loadLatestDailyWindow(pool, metricVersion);
  const benchmarkRows = await readDailyBenchmarkRows(pool, metricVersion, window.bucket);
  const benchmarkSourceRows = await readSourceDailyBenchmarkRows(pool, metricVersion, window.bucket);
  const sourceRows = await readDailySourceRows(pool, window.windowStart, window.windowEnd, window.generatedAt);
  const live = aggregateDailyRows(sourceRows, atlas);

  const benchmarkNormalized = benchmarkRows.map((row) => ({
    country: row.country,
    publishedCount: parseMetricCount(row.published_count),
    freshCount: parseMetricCount(row.fresh_count),
    lateCount: parseMetricCount(row.late_count),
    insertedCount: parseMetricCount(row.inserted_count),
    activeSourcesCount: parseMetricCount(row.active_sources_count),
    topSourceShareBps: parseMetricCount(row.top_source_share_bps),
    top5SourceShareBps: parseMetricCount(row.top_5_source_share_bps),
    top10SourceShareBps: parseMetricCount(row.top_10_source_share_bps),
  }));

  const benchmarkSourceNormalized = benchmarkSourceRows.map((row) => ({
    country: row.country,
    source: row.source,
    publishedCount: parseMetricCount(row.published_count),
    freshCount: parseMetricCount(row.fresh_count),
    lateCount: parseMetricCount(row.late_count),
    insertedCount: parseMetricCount(row.inserted_count),
  }));

  const countryComparison = compareNumericMaps(
    benchmarkNormalized,
    live.countries,
    (row) => String(row.country),
    [
      'publishedCount',
      'freshCount',
      'lateCount',
      'insertedCount',
      'activeSourcesCount',
      'topSourceShareBps',
      'top5SourceShareBps',
      'top10SourceShareBps',
    ],
  );

  const sourceComparison = compareNumericMaps(
    benchmarkSourceNormalized,
    live.sources,
    (row) => `${String(row.country)}|||${String(row.source)}`,
    [
      'publishedCount',
      'freshCount',
      'lateCount',
      'insertedCount',
    ],
  );

  return {
    mode: 'daily',
    window,
    benchmarkRows: benchmarkRows.length,
    benchmarkSourceRows: benchmarkSourceRows.length,
    liveCountryRows: live.countries.length,
    liveSourceRows: live.sources.length,
    exact: countryComparison.exact && sourceComparison.exact,
    countryComparison: {
      exact: countryComparison.exact,
      missingInBenchmark: countryComparison.missingInExpected.slice(0, 20),
      missingInLive: countryComparison.missingInActual.slice(0, 20),
      mismatchCount: countryComparison.mismatches.length,
      mismatchSample: countryComparison.mismatches.slice(0, 20),
    },
    sourceComparison: {
      exact: sourceComparison.exact,
      missingInBenchmark: sourceComparison.missingInExpected.slice(0, 20),
      missingInLive: sourceComparison.missingInActual.slice(0, 20),
      mismatchCount: sourceComparison.mismatches.length,
      mismatchSample: sourceComparison.mismatches.slice(0, 20),
    },
  };
}

async function main(): Promise<void> {
  const mode = parseMode();
  const metricVersion = (parseArgValue('--metric-version') || DEFAULT_METRIC_VERSION).trim() || DEFAULT_METRIC_VERSION;
  const soft = hasFlag('--soft');
  const atlasPath = process.env.ATLAS_PATH || DEFAULT_ATLAS_PATH;
  const atlas = loadAtlasMetadata(atlasPath);
  const pool = new Pool({ connectionString: resolveDatabaseUrl() });

  try {
    const results: Record<string, unknown> = {
      metricVersion,
      mode,
    };

    let exact = true;

    if (mode === 'hourly' || mode === 'all') {
      const hourly = await validateHourly(pool, atlas, metricVersion);
      results.hourly = hourly;
      exact = exact && Boolean(hourly.exact);
    }

    if (mode === 'daily' || mode === 'all') {
      const daily = await validateDaily(pool, atlas, metricVersion);
      results.daily = daily;
      exact = exact && Boolean(daily.exact);
    }

    console.log(JSON.stringify(results, null, 2));
    if (!exact && !soft) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`${DEFAULT_LOG_PREFIX} failed:`, error instanceof Error ? error.message : String(error));
  process.exit(1);
});
