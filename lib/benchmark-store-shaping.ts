import 'server-only';

import { readFileSync } from 'node:fs';
import path from 'node:path';
import type {
  CountryBenchmarkCountryRow,
  CountryBenchmarkResponse,
  CountryBenchmarkWindow,
} from '@/lib/benchmark-types';
import type {
  AggregateDailyCountrySqlRow,
  AggregateDailyWindowResult,
  DailyRowSql,
  HourlyRowSql,
} from '@/lib/benchmark-store-queries';

type AtlasCatalog = {
  countries?: Array<{
    name?: string;
    code?: string | null;
  }>;
};

type BenchmarkRange = {
  start: Date;
  end: Date;
  bucket: string;
  label: string;
};

let countryCodeCache: Map<string, string | null> | null = null;

function parseMetricCount(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseUtcDayBucket(value: string): Date {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`invalid day bucket: ${value}`);
  }
  return parsed;
}

export function toUtcDateKey(date: Date): string {
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

export function getWeeklyRange(date: Date): BenchmarkRange {
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

export function getMonthlyRange(date: Date): BenchmarkRange {
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

function createEmptyCountryRow(country: string, countryCode: string | null): CountryBenchmarkCountryRow {
  return {
    country,
    countryCode,
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
}

function getOrCreateCountryRow(
  rows: Map<string, CountryBenchmarkCountryRow>,
  countryCodes: Map<string, string | null>,
  country: string,
): CountryBenchmarkCountryRow {
  const current = rows.get(country);
  if (current) return current;

  const next = createEmptyCountryRow(country, countryCodes.get(country) || null);
  rows.set(country, next);
  return next;
}

function applyHourlyRow(row: CountryBenchmarkCountryRow, hourly: HourlyRowSql) {
  row.hourlyPublished24h = parseMetricCount(hourly.published_last_24h);
  row.hourlyFresh24h = parseMetricCount(hourly.fresh_last_24h);
  row.hourlyLate24h = parseMetricCount(hourly.late_last_24h);
  row.hourlyInserted24h = parseMetricCount(hourly.inserted_last_24h);
  row.hourlyInserted1h = parseMetricCount(hourly.inserted_last_1h);
  row.hourlyActiveSources24h = parseMetricCount(hourly.active_sources_last_24h);
  row.hourlyActiveSources1h = parseMetricCount(hourly.active_sources_last_1h);
  row.hourlyTopSourceShareBps = parseMetricCount(hourly.top_source_share_bps);
  row.hourlyTop5SourceShareBps = parseMetricCount(hourly.top_5_source_share_bps);
  row.hourlyTop10SourceShareBps = parseMetricCount(hourly.top_10_source_share_bps);
}

function applyDailyRow(row: CountryBenchmarkCountryRow, daily: DailyRowSql) {
  row.dailyPublishedCount = parseMetricCount(daily.published_count);
  row.dailyFreshCount = parseMetricCount(daily.fresh_count);
  row.dailyLateCount = parseMetricCount(daily.late_count);
  row.dailyInsertedCount = parseMetricCount(daily.inserted_count);
  row.dailyActiveSourcesCount = parseMetricCount(daily.active_sources_count);
  row.dailyTopSourceShareBps = parseMetricCount(daily.top_source_share_bps);
  row.dailyTop5SourceShareBps = parseMetricCount(daily.top_5_source_share_bps);
  row.dailyTop10SourceShareBps = parseMetricCount(daily.top_10_source_share_bps);
}

function applyWeeklyRow(row: CountryBenchmarkCountryRow, weekly: AggregateDailyCountrySqlRow) {
  row.weeklyPublishedCount = parseMetricCount(weekly.published_count);
  row.weeklyFreshCount = parseMetricCount(weekly.fresh_count);
  row.weeklyLateCount = parseMetricCount(weekly.late_count);
  row.weeklyInsertedCount = parseMetricCount(weekly.inserted_count);
  row.weeklyAverageActiveSourcesCount = parseMetricCount(weekly.average_active_sources_count);
  row.weeklyTopSourceShareBps = parseMetricCount(weekly.top_source_share_bps);
  row.weeklyTop5SourceShareBps = parseMetricCount(weekly.top_5_source_share_bps);
  row.weeklyTop10SourceShareBps = parseMetricCount(weekly.top_10_source_share_bps);
}

function applyMonthlyRow(row: CountryBenchmarkCountryRow, monthly: AggregateDailyCountrySqlRow) {
  row.monthlyPublishedCount = parseMetricCount(monthly.published_count);
  row.monthlyFreshCount = parseMetricCount(monthly.fresh_count);
  row.monthlyLateCount = parseMetricCount(monthly.late_count);
  row.monthlyInsertedCount = parseMetricCount(monthly.inserted_count);
  row.monthlyAverageActiveSourcesCount = parseMetricCount(monthly.average_active_sources_count);
  row.monthlyTopSourceShareBps = parseMetricCount(monthly.top_source_share_bps);
  row.monthlyTop5SourceShareBps = parseMetricCount(monthly.top_5_source_share_bps);
  row.monthlyTop10SourceShareBps = parseMetricCount(monthly.top_10_source_share_bps);
}

export function buildDisabledCountryBenchmarkResponse(): CountryBenchmarkResponse {
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

type BuildCountryBenchmarkResponseArgs = {
  hourlyWindow: CountryBenchmarkWindow | null;
  dailyWindow: CountryBenchmarkWindow | null;
  weeklyAggregate: AggregateDailyWindowResult | null;
  monthlyAggregate: AggregateDailyWindowResult | null;
  hourlyRows: HourlyRowSql[];
  dailyRows: DailyRowSql[];
  weeklyCountryRows: AggregateDailyCountrySqlRow[];
  monthlyCountryRows: AggregateDailyCountrySqlRow[];
};

export function buildCountryBenchmarkResponse({
  hourlyWindow,
  dailyWindow,
  weeklyAggregate,
  monthlyAggregate,
  hourlyRows,
  dailyRows,
  weeklyCountryRows,
  monthlyCountryRows,
}: BuildCountryBenchmarkResponseArgs): CountryBenchmarkResponse {
  const byCountry = new Map<string, CountryBenchmarkCountryRow>();
  const countryCodes = loadCountryCodes();

  for (const row of hourlyRows) {
    applyHourlyRow(getOrCreateCountryRow(byCountry, countryCodes, row.country), row);
  }

  for (const row of dailyRows) {
    applyDailyRow(getOrCreateCountryRow(byCountry, countryCodes, row.country), row);
  }

  for (const row of weeklyCountryRows) {
    applyWeeklyRow(getOrCreateCountryRow(byCountry, countryCodes, row.country), row);
  }

  for (const row of monthlyCountryRows) {
    applyMonthlyRow(getOrCreateCountryRow(byCountry, countryCodes, row.country), row);
  }

  const countries = [...byCountry.values()].sort(
    (left, right) =>
      right.hourlyPublished24h - left.hourlyPublished24h ||
      right.dailyPublishedCount - left.dailyPublishedCount ||
      left.country.localeCompare(right.country),
  );

  return {
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
}
