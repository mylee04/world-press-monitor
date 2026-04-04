import type { CountryBenchmarkResponse } from '@/lib/benchmark-types';
import {
  readAggregateDailyCountryRows,
  readAggregateDailyWindow,
  readDailyRows,
  readHourlyRows,
  readLatestDailyWindow,
  readLatestHourlyWindow,
} from '@/lib/benchmark-store-queries';
import {
  buildCountryBenchmarkResponse,
  buildDisabledCountryBenchmarkResponse,
  getMonthlyRange,
  getWeeklyRange,
  parseUtcDayBucket,
  toUtcDateKey,
} from '@/lib/benchmark-store-shaping';

type TimedCacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const DEFAULT_METRIC_VERSION = 'v1';
const BENCHMARK_CACHE_MS = 5 * 60_000;

let benchmarkCache: TimedCacheEntry<CountryBenchmarkResponse> | null = null;

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

export async function readCountryBenchmark(): Promise<CountryBenchmarkResponse> {
  const cached = readTimedCache(benchmarkCache);
  if (cached) return cached;

  const metricVersion = DEFAULT_METRIC_VERSION;
  const [hourlyWindow, dailyWindow] = await Promise.all([
    readLatestHourlyWindow(metricVersion),
    readLatestDailyWindow(metricVersion),
  ]);
  const latestDailyDate = dailyWindow ? parseUtcDayBucket(dailyWindow.bucket) : null;
  const weeklyRange = latestDailyDate ? getWeeklyRange(latestDailyDate) : null;
  const monthlyRange = latestDailyDate ? getMonthlyRange(latestDailyDate) : null;

  if (!hourlyWindow && !dailyWindow) {
    return buildDisabledCountryBenchmarkResponse();
  }

  const weeklyCountryRowsPromise = weeklyRange
    ? readAggregateDailyCountryRows(
        metricVersion,
        toUtcDateKey(weeklyRange.start),
        toUtcDateKey(weeklyRange.end),
      )
    : Promise.resolve([]);
  const monthlyCountryRowsPromise = monthlyRange
    ? readAggregateDailyCountryRows(
        metricVersion,
        toUtcDateKey(monthlyRange.start),
        toUtcDateKey(monthlyRange.end),
      )
    : Promise.resolve([]);

  const [hourlyRows, dailyRows, weeklyAggregate, monthlyAggregate, weeklyCountryRows, monthlyCountryRows] = await Promise.all([
    hourlyWindow ? readHourlyRows(hourlyWindow) : Promise.resolve([]),
    dailyWindow ? readDailyRows(dailyWindow) : Promise.resolve([]),
    weeklyRange
      ? readAggregateDailyWindow(
          metricVersion,
          toUtcDateKey(weeklyRange.start),
          toUtcDateKey(weeklyRange.end),
          weeklyRange.bucket,
          weeklyRange.label,
        )
      : Promise.resolve(null),
    monthlyRange
      ? readAggregateDailyWindow(
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

  const response = buildCountryBenchmarkResponse({
    hourlyWindow,
    dailyWindow,
    weeklyAggregate,
    monthlyAggregate,
    hourlyRows,
    dailyRows,
    weeklyCountryRows,
    monthlyCountryRows,
  });

  benchmarkCache = writeTimedCache(response, BENCHMARK_CACHE_MS);
  return response;
}
