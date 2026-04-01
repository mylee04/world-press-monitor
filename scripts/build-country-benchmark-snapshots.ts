#!/usr/bin/env bun

import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool, type PoolClient } from 'pg';
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

type CountryAggregate = {
  country: string;
  published: number;
  fresh: number;
  late: number;
  inserted: number;
  inserted1h: number;
};

type CountryBenchmarkHourlyRow = {
  hourBucket: string;
  country: string;
  windowStart: string;
  windowEnd: string;
  metricVersion: string;
  atlasVersion: string | null;
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

type CountryBenchmarkDailyRow = {
  dayBucket: string;
  country: string;
  windowStart: string;
  windowEnd: string;
  metricVersion: string;
  atlasVersion: string | null;
  publishedCount: number;
  freshCount: number;
  lateCount: number;
  insertedCount: number;
  activeSourcesCount: number;
  topSourceShareBps: number;
  top5SourceShareBps: number;
  top10SourceShareBps: number;
};

type CountryBenchmarkSourceDailyRow = {
  dayBucket: string;
  country: string;
  source: string;
  windowStart: string;
  windowEnd: string;
  metricVersion: string;
  atlasVersion: string | null;
  publishedCount: number;
  freshCount: number;
  lateCount: number;
  insertedCount: number;
};

type CountryBenchmarkHourlyAggregateRow = {
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

type CountryBenchmarkDailyAggregateRow = {
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

type CountryBenchmarkSourceDailyAggregateRow = {
  country: string;
  source: string;
  publishedCount: number;
  freshCount: number;
  lateCount: number;
  insertedCount: number;
};

const DEFAULT_ATLAS_PATH = resolve(process.cwd(), 'data/rss-atlas.json');
const DEFAULT_LOG_PREFIX = '[country-benchmark]';
const DEFAULT_METRIC_VERSION = 'v1';
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

function parseMetricVersion(): string {
  return (parseArgValue('--metric-version') || DEFAULT_METRIC_VERSION).trim() || DEFAULT_METRIC_VERSION;
}

function normalizeCountryValue(value: string | undefined): string {
  if (!value) return '';
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseMetricCount(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function loadAtlasMetadata(filePath: string): AtlasMetadata {
  try {
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
  } catch (error) {
    throw new Error(
      `failed to read atlas metadata from ${filePath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function resolveAtlasVersion(atlasPath: string): string {
  const explicit = parseArgValue('--atlas-version');
  if (explicit && explicit.trim()) return explicit.trim();
  const stats = statSync(atlasPath);
  return `mtime:${stats.mtime.toISOString()}`;
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

function parseSnapshotAt(): Date {
  const raw = parseArgValue('--at');
  if (!raw) return new Date();
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`invalid --at value: ${raw}`);
  }
  return parsed;
}

function toUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDayBucket(snapshotAt: Date): string {
  const raw = parseArgValue('--day');
  if (raw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      throw new Error(`invalid --day value: ${raw}`);
    }
    return raw;
  }

  const priorDay = new Date(Date.UTC(
    snapshotAt.getUTCFullYear(),
    snapshotAt.getUTCMonth(),
    snapshotAt.getUTCDate() - 1,
    0,
    0,
    0,
    0,
  ));
  return toUtcDateKey(priorDay);
}

function startOfUtcDay(dayBucket: string): Date {
  return new Date(`${dayBucket}T00:00:00.000Z`);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function subtractHours(date: Date, hours: number): Date {
  return new Date(date.getTime() - hours * 60 * 60 * 1000);
}

function truncateToHour(date: Date): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    0,
    0,
    0,
  ));
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

async function readHourlySourceRows(pool: Pool, windowStart: Date, windowEnd: Date): Promise<HourlySourceRow[]> {
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
      and (
        (created_at >= $1::timestamptz and created_at < $2::timestamptz)
        or
        (publication_datetime >= $1::timestamptz and publication_datetime < $2::timestamptz)
      )
    group by source_country, source
    order by source_country asc nulls last, source asc
    `,
    [windowStart.toISOString(), windowEnd.toISOString()],
  );
  return result.rows;
}

async function readDailySourceRows(pool: Pool, windowStart: Date, windowEnd: Date): Promise<DailySourceRow[]> {
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
      and (
        (created_at >= $1::timestamptz and created_at < $2::timestamptz)
        or
        (publication_datetime >= $1::timestamptz and publication_datetime < $2::timestamptz)
      )
    group by source_country, source
    order by source_country asc nulls last, source asc
    `,
    [windowStart.toISOString(), windowEnd.toISOString()],
  );
  return result.rows;
}

function aggregateHourlyRows(rows: HourlySourceRow[], atlas: AtlasMetadata): CountryBenchmarkHourlyAggregateRow[] {
  const perCountrySource = new Map<string, Map<string, CountryAggregate>>();

  for (const row of rows) {
    const country = resolveBenchmarkCountry(row.source_country, row.source, atlas);
    const bySource = perCountrySource.get(country) || new Map<string, CountryAggregate>();
    perCountrySource.set(country, bySource);
    const current = bySource.get(row.source) || {
      country,
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

  return [...perCountrySource.entries()]
    .map(([country, sources]) => {
      const perSource = [...sources.values()];
      const publishedCounts = perSource.map((row) => row.published).filter((value) => value > 0);
      const publishedTotal = perSource.reduce((sum, row) => sum + row.published, 0);
      const freshTotal = perSource.reduce((sum, row) => sum + row.fresh, 0);
      const lateTotal = perSource.reduce((sum, row) => sum + row.late, 0);
      const insertedTotal = perSource.reduce((sum, row) => sum + row.inserted, 0);
      const inserted1hTotal = perSource.reduce((sum, row) => sum + row.inserted1h, 0);
      const activeSources24h = perSource.filter((row) => row.published > 0 || row.inserted > 0).length;
      const activeSources1h = perSource.filter((row) => row.inserted1h > 0).length;

      return {
        country,
        publishedLast24h: publishedTotal,
        freshLast24h: freshTotal,
        lateLast24h: lateTotal,
        insertedLast24h: insertedTotal,
        insertedLast1h: inserted1hTotal,
        activeSourcesLast24h: activeSources24h,
        activeSourcesLast1h: activeSources1h,
        topSourceShareBps: topShareBasisPoints(publishedCounts, 1, publishedTotal),
        top5SourceShareBps: topShareBasisPoints(publishedCounts, 5, publishedTotal),
        top10SourceShareBps: topShareBasisPoints(publishedCounts, 10, publishedTotal),
      };
    })
    .sort((left, right) => right.publishedLast24h - left.publishedLast24h || left.country.localeCompare(right.country));
}

function aggregateDailyRows(rows: DailySourceRow[], atlas: AtlasMetadata): {
  countryRows: CountryBenchmarkDailyAggregateRow[];
  sourceRows: CountryBenchmarkSourceDailyAggregateRow[];
} {
  const perCountrySource = new Map<string, Map<string, CountryBenchmarkSourceDailyRow>>();

  for (const row of rows) {
    const country = resolveBenchmarkCountry(row.source_country, row.source, atlas);
    const bySource = perCountrySource.get(country) || new Map<string, CountryBenchmarkSourceDailyRow>();
    perCountrySource.set(country, bySource);
    const current = bySource.get(row.source) || {
      dayBucket: '',
      country,
      source: row.source,
      windowStart: '',
      windowEnd: '',
      metricVersion: '',
      atlasVersion: null,
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

  const sourceRows: CountryBenchmarkSourceDailyAggregateRow[] = [];
  const countryRows: CountryBenchmarkDailyAggregateRow[] = [];

  for (const [country, sources] of perCountrySource.entries()) {
    const perSource = [...sources.values()];
    const publishedCounts = perSource.map((row) => row.publishedCount).filter((value) => value > 0);
    const publishedTotal = perSource.reduce((sum, row) => sum + row.publishedCount, 0);
    const freshTotal = perSource.reduce((sum, row) => sum + row.freshCount, 0);
    const lateTotal = perSource.reduce((sum, row) => sum + row.lateCount, 0);
    const insertedTotal = perSource.reduce((sum, row) => sum + row.insertedCount, 0);
    const activeSources = perSource.filter((row) => row.publishedCount > 0 || row.insertedCount > 0).length;

    countryRows.push({
      country,
      publishedCount: publishedTotal,
      freshCount: freshTotal,
      lateCount: lateTotal,
      insertedCount: insertedTotal,
      activeSourcesCount: activeSources,
      topSourceShareBps: topShareBasisPoints(publishedCounts, 1, publishedTotal),
      top5SourceShareBps: topShareBasisPoints(publishedCounts, 5, publishedTotal),
      top10SourceShareBps: topShareBasisPoints(publishedCounts, 10, publishedTotal),
    });
    sourceRows.push(...perSource.map((row) => ({
      country: row.country,
      source: row.source,
      publishedCount: row.publishedCount,
      freshCount: row.freshCount,
      lateCount: row.lateCount,
      insertedCount: row.insertedCount,
    })));
  }

  countryRows.sort((left, right) => right.publishedCount - left.publishedCount || left.country.localeCompare(right.country));
  sourceRows.sort((left, right) => left.country.localeCompare(right.country) || right.publishedCount - left.publishedCount || left.source.localeCompare(right.source));

  return { countryRows, sourceRows };
}

function chunkRows<T>(rows: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

async function insertRows(
  client: PoolClient,
  tableName: string,
  columns: string[],
  rows: Array<Record<string, unknown>>,
  chunkSize = 250,
): Promise<void> {
  if (!rows.length) return;
  const keys = columns;
  for (const chunk of chunkRows(rows, chunkSize)) {
    const values: unknown[] = [];
    const tuples = chunk.map((row, rowIndex) => {
      const placeholders = keys.map((key, keyIndex) => {
        values.push(row[key]);
        return `$${rowIndex * keys.length + keyIndex + 1}`;
      });
      return `(${placeholders.join(', ')})`;
    });
    await client.query(
      `insert into ${tableName} (${keys.join(', ')}) values ${tuples.join(', ')}`,
      values,
    );
  }
}

async function replaceHourlySnapshot(
  client: PoolClient,
  rows: CountryBenchmarkHourlyRow[],
  hourBucket: string,
  metricVersion: string,
): Promise<void> {
  await client.query(
    `delete from country_benchmark_hourly where hour_bucket = $1::timestamptz and metric_version = $2`,
    [hourBucket, metricVersion],
  );
  await insertRows(
    client,
    'country_benchmark_hourly',
    [
      'hourBucket',
      'country',
      'windowStart',
      'windowEnd',
      'metricVersion',
      'atlasVersion',
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
    ].map((key) => {
      const map: Record<string, string> = {
        hourBucket: 'hour_bucket',
        country: 'country',
        windowStart: 'window_start',
        windowEnd: 'window_end',
        metricVersion: 'metric_version',
        atlasVersion: 'atlas_version',
        publishedLast24h: 'published_last_24h',
        freshLast24h: 'fresh_last_24h',
        lateLast24h: 'late_last_24h',
        insertedLast24h: 'inserted_last_24h',
        insertedLast1h: 'inserted_last_1h',
        activeSourcesLast24h: 'active_sources_last_24h',
        activeSourcesLast1h: 'active_sources_last_1h',
        topSourceShareBps: 'top_source_share_bps',
        top5SourceShareBps: 'top_5_source_share_bps',
        top10SourceShareBps: 'top_10_source_share_bps',
      };
      return map[key];
    }),
    rows.map((row) => ({
      hour_bucket: row.hourBucket,
      country: row.country,
      window_start: row.windowStart,
      window_end: row.windowEnd,
      metric_version: row.metricVersion,
      atlas_version: row.atlasVersion,
      published_last_24h: row.publishedLast24h,
      fresh_last_24h: row.freshLast24h,
      late_last_24h: row.lateLast24h,
      inserted_last_24h: row.insertedLast24h,
      inserted_last_1h: row.insertedLast1h,
      active_sources_last_24h: row.activeSourcesLast24h,
      active_sources_last_1h: row.activeSourcesLast1h,
      top_source_share_bps: row.topSourceShareBps,
      top_5_source_share_bps: row.top5SourceShareBps,
      top_10_source_share_bps: row.top10SourceShareBps,
    })),
  );
}

async function replaceDailySnapshots(
  client: PoolClient,
  dayBucket: string,
  metricVersion: string,
  countryRows: CountryBenchmarkDailyRow[],
  sourceRows: CountryBenchmarkSourceDailyRow[],
): Promise<void> {
  await client.query(
    `delete from country_benchmark_daily where day_bucket = $1::date and metric_version = $2`,
    [dayBucket, metricVersion],
  );
  await client.query(
    `delete from country_benchmark_source_daily where day_bucket = $1::date and metric_version = $2`,
    [dayBucket, metricVersion],
  );

  await insertRows(
    client,
    'country_benchmark_daily',
    [
      'day_bucket',
      'country',
      'window_start',
      'window_end',
      'metric_version',
      'atlas_version',
      'published_count',
      'fresh_count',
      'late_count',
      'inserted_count',
      'active_sources_count',
      'top_source_share_bps',
      'top_5_source_share_bps',
      'top_10_source_share_bps',
    ],
    countryRows.map((row) => ({
      day_bucket: row.dayBucket,
      country: row.country,
      window_start: row.windowStart,
      window_end: row.windowEnd,
      metric_version: row.metricVersion,
      atlas_version: row.atlasVersion,
      published_count: row.publishedCount,
      fresh_count: row.freshCount,
      late_count: row.lateCount,
      inserted_count: row.insertedCount,
      active_sources_count: row.activeSourcesCount,
      top_source_share_bps: row.topSourceShareBps,
      top_5_source_share_bps: row.top5SourceShareBps,
      top_10_source_share_bps: row.top10SourceShareBps,
    })),
  );

  await insertRows(
    client,
    'country_benchmark_source_daily',
    [
      'day_bucket',
      'country',
      'source',
      'window_start',
      'window_end',
      'metric_version',
      'atlas_version',
      'published_count',
      'fresh_count',
      'late_count',
      'inserted_count',
    ],
    sourceRows.map((row) => ({
      day_bucket: row.dayBucket,
      country: row.country,
      source: row.source,
      window_start: row.windowStart,
      window_end: row.windowEnd,
      metric_version: row.metricVersion,
      atlas_version: row.atlasVersion,
      published_count: row.publishedCount,
      fresh_count: row.freshCount,
      late_count: row.lateCount,
      inserted_count: row.insertedCount,
    })),
  );
}

async function buildHourlySnapshot(
  pool: Pool,
  atlas: AtlasMetadata,
  metricVersion: string,
  atlasVersion: string,
  snapshotAt: Date,
): Promise<{
  bucket: string;
  windowStart: string;
  windowEnd: string;
  rows: CountryBenchmarkHourlyRow[];
  sourceRowsRead: number;
}> {
  const windowEnd = snapshotAt;
  const windowStart = subtractHours(windowEnd, 24);
  const hourBucket = truncateToHour(windowEnd).toISOString();
  const sourceRows = await readHourlySourceRows(pool, windowStart, windowEnd);
  const rows = aggregateHourlyRows(sourceRows, atlas).map((row) => ({
    hourBucket,
    country: row.country,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    metricVersion,
    atlasVersion,
    publishedLast24h: row.publishedLast24h,
    freshLast24h: row.freshLast24h,
    lateLast24h: row.lateLast24h,
    insertedLast24h: row.insertedLast24h,
    insertedLast1h: row.insertedLast1h,
    activeSourcesLast24h: row.activeSourcesLast24h,
    activeSourcesLast1h: row.activeSourcesLast1h,
    topSourceShareBps: row.topSourceShareBps,
    top5SourceShareBps: row.top5SourceShareBps,
    top10SourceShareBps: row.top10SourceShareBps,
  }));

  return {
    bucket: hourBucket,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    rows,
    sourceRowsRead: sourceRows.length,
  };
}

async function buildDailySnapshot(
  pool: Pool,
  atlas: AtlasMetadata,
  metricVersion: string,
  atlasVersion: string,
  snapshotAt: Date,
): Promise<{
  dayBucket: string;
  windowStart: string;
  windowEnd: string;
  countryRows: CountryBenchmarkDailyRow[];
  sourceRows: CountryBenchmarkSourceDailyRow[];
  sourceRowsRead: number;
}> {
  const dayBucket = parseDayBucket(snapshotAt);
  const windowStart = startOfUtcDay(dayBucket);
  const windowEnd = addDays(windowStart, 1);
  const sourceRows = await readDailySourceRows(pool, windowStart, windowEnd);
  const aggregated = aggregateDailyRows(sourceRows, atlas);

  return {
    dayBucket,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    countryRows: aggregated.countryRows.map((row) => ({
      dayBucket,
      country: row.country,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      metricVersion,
      atlasVersion,
      publishedCount: row.publishedCount,
      freshCount: row.freshCount,
      lateCount: row.lateCount,
      insertedCount: row.insertedCount,
      activeSourcesCount: row.activeSourcesCount,
      topSourceShareBps: row.topSourceShareBps,
      top5SourceShareBps: row.top5SourceShareBps,
      top10SourceShareBps: row.top10SourceShareBps,
    })),
    sourceRows: aggregated.sourceRows.map((row) => ({
      dayBucket,
      country: row.country,
      source: row.source,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      metricVersion,
      atlasVersion,
      publishedCount: row.publishedCount,
      freshCount: row.freshCount,
      lateCount: row.lateCount,
      insertedCount: row.insertedCount,
    })),
    sourceRowsRead: sourceRows.length,
  };
}

async function main(): Promise<void> {
  const mode = parseMode();
  const metricVersion = parseMetricVersion();
  const dryRun = hasFlag('--dry-run');
  const snapshotAt = parseSnapshotAt();
  const atlasPath = process.env.ATLAS_PATH || DEFAULT_ATLAS_PATH;
  const atlas = loadAtlasMetadata(atlasPath);
  const atlasVersion = resolveAtlasVersion(atlasPath);
  const pool = new Pool({ connectionString: resolveDatabaseUrl() });

  try {
    const summary: Record<string, unknown> = {
      mode,
      dryRun,
      metricVersion,
      atlasVersion,
    };

    const hourlySnapshot = mode === 'daily' ? null : await buildHourlySnapshot(pool, atlas, metricVersion, atlasVersion, snapshotAt);
    const dailySnapshot = mode === 'hourly' ? null : await buildDailySnapshot(pool, atlas, metricVersion, atlasVersion, snapshotAt);

    if (!dryRun) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        if (hourlySnapshot) {
          await replaceHourlySnapshot(client, hourlySnapshot.rows, hourlySnapshot.bucket, metricVersion);
        }
        if (dailySnapshot) {
          await replaceDailySnapshots(client, dailySnapshot.dayBucket, metricVersion, dailySnapshot.countryRows, dailySnapshot.sourceRows);
        }
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    }

    if (hourlySnapshot) {
      summary.hourly = {
        bucket: hourlySnapshot.bucket,
        windowStart: hourlySnapshot.windowStart,
        windowEnd: hourlySnapshot.windowEnd,
        countryRowsWritten: hourlySnapshot.rows.length,
        sourceRowsRead: hourlySnapshot.sourceRowsRead,
        topCountries: hourlySnapshot.rows.slice(0, 5).map((row) => ({
          country: row.country,
          publishedLast24h: row.publishedLast24h,
          activeSourcesLast24h: row.activeSourcesLast24h,
        })),
      };
    }

    if (dailySnapshot) {
      summary.daily = {
        dayBucket: dailySnapshot.dayBucket,
        windowStart: dailySnapshot.windowStart,
        windowEnd: dailySnapshot.windowEnd,
        countryRowsWritten: dailySnapshot.countryRows.length,
        sourceRowsWritten: dailySnapshot.sourceRows.length,
        sourceRowsRead: dailySnapshot.sourceRowsRead,
        topCountries: dailySnapshot.countryRows.slice(0, 5).map((row) => ({
          country: row.country,
          publishedCount: row.publishedCount,
          activeSourcesCount: row.activeSourcesCount,
        })),
      };
    }

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`${DEFAULT_LOG_PREFIX} failed:`, error instanceof Error ? error.message : String(error));
  process.exit(1);
});
