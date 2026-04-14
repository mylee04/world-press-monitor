import { readCheckedSourcesByCountry } from '@/lib/map-store-db';
import {
  getConfiguredDirectSourceCountByCountry,
  getSourceMeta,
  isDirectPublisherSource,
  normalizeSourceKey,
  resolvePublisherCountryForSource,
} from '@/lib/map-store-source-meta';
import type { MapCountryMetricRow, MapCountryMetricsResponse } from '@/lib/map-types';

type CountryCoverageMetrics = {
  configuredSources24h: number;
  checkedSources24h: number | null;
};

type CachedCountryCoverage = {
  expiresAt: number;
  byCountry: Map<string, CountryCoverageMetrics>;
};

const COUNTRY_COVERAGE_CACHE_TTL_MS = 5 * 60_000;

let cachedCountryCoverage: CachedCountryCoverage | null = null;

function hasNumericValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function getConfiguredCoverageCount(
  country: string,
  coverage: CountryCoverageMetrics | undefined
): number {
  return coverage?.configuredSources24h ?? getConfiguredDirectSourceCountByCountry(country);
}

function getNormalizedCheckedCoverageCount(
  country: string,
  row: MapCountryMetricRow,
  coverage: CountryCoverageMetrics | undefined
): number | null {
  const configuredSources24h = getConfiguredCoverageCount(country, coverage);
  const checkedSources24h = hasNumericValue(coverage?.checkedSources24h)
    ? coverage.checkedSources24h
    : hasNumericValue(row.checkedSources24h)
      ? row.checkedSources24h
      : null;
  if (!hasNumericValue(checkedSources24h)) return null;
  return Math.min(checkedSources24h, configuredSources24h);
}

async function readCountryCoverageMetrics(): Promise<Map<string, CountryCoverageMetrics>> {
  if (cachedCountryCoverage && cachedCountryCoverage.expiresAt > Date.now()) {
    return cachedCountryCoverage.byCountry;
  }

  const checkedByCountry = new Map<string, Set<string>>();
  try {
    const checkedRows = await readCheckedSourcesByCountry(24);
    for (const row of checkedRows) {
      const meta = getSourceMeta(row.source);
      if (!isDirectPublisherSource(meta)) continue;
      const country = resolvePublisherCountryForSource(row.country, row.source);
      if (!country) continue;
      const sourceKey = normalizeSourceKey(row.source);
      if (!sourceKey) continue;
      const current = checkedByCountry.get(country) ?? new Set<string>();
      current.add(sourceKey);
      checkedByCountry.set(country, current);
    }
  } catch (error) {
    console.warn('[map-country-metrics-normalizer] checked coverage unavailable', error);
  }

  const byCountry = new Map<string, CountryCoverageMetrics>();
  for (const [country, checkedSources] of checkedByCountry.entries()) {
    byCountry.set(country, {
      configuredSources24h: getConfiguredDirectSourceCountByCountry(country),
      checkedSources24h: checkedSources.size,
    });
  }

  cachedCountryCoverage = {
    expiresAt: Date.now() + COUNTRY_COVERAGE_CACHE_TTL_MS,
    byCountry,
  };

  return byCountry;
}

function normalizeCountryRow(
  row: MapCountryMetricRow,
  coverageByCountry: Map<string, CountryCoverageMetrics>
): MapCountryMetricRow {
  const coverage = coverageByCountry.get(row.country);
  const configuredSources24h = getConfiguredCoverageCount(row.country, coverage);
  const checkedSources24h = getNormalizedCheckedCoverageCount(row.country, row, coverage);
  return {
    ...row,
    configuredSources24h,
    checkedSources24h,
    topSources: Array.isArray(row.topSources) ? row.topSources : [],
    topPublishers: Array.isArray(row.topPublishers) ? row.topPublishers : [],
  };
}

export function mapCountryMetricsNeedsNormalization(payload: MapCountryMetricsResponse | null | undefined): boolean {
  if (!payload || !Array.isArray(payload.countries)) return false;
  const expectedConfiguredTotal = payload.countries.reduce(
    (sum, row) => sum + getConfiguredDirectSourceCountByCountry(row.country),
    0
  );
  const expectedCheckedTotal = payload.countries.reduce((sum, row) => {
    if (!hasNumericValue(row.checkedSources24h)) return sum;
    const configuredSources24h = hasNumericValue(row.configuredSources24h)
      ? row.configuredSources24h
      : getConfiguredDirectSourceCountByCountry(row.country);
    return sum + Math.min(row.checkedSources24h, configuredSources24h);
  }, 0);
  if (!hasNumericValue(payload.totals?.configuredSources24h) || !hasNumericValue(payload.totals?.checkedSources24h)) {
    return true;
  }
  if (payload.totals.configuredSources24h !== expectedConfiguredTotal) {
    return true;
  }
  if (
    hasNumericValue(payload.totals.checkedSources24h) &&
    (payload.totals.checkedSources24h > payload.totals.configuredSources24h ||
      payload.totals.checkedSources24h !== expectedCheckedTotal)
  ) {
    return true;
  }
  return payload.countries.some((row) => {
    if (!hasNumericValue(row.configuredSources24h) || !hasNumericValue(row.checkedSources24h)) {
      return true;
    }
    const expectedConfiguredSources24h = getConfiguredDirectSourceCountByCountry(row.country);
    return (
      row.configuredSources24h !== expectedConfiguredSources24h ||
      row.checkedSources24h > row.configuredSources24h
    );
  });
}

export async function normalizeMapCountryMetricsPayload(
  payload: MapCountryMetricsResponse
): Promise<MapCountryMetricsResponse> {
  const coverageByCountry = await readCountryCoverageMetrics();
  const countries = payload.countries.map((row) => normalizeCountryRow(row, coverageByCountry));
  const configuredSources24h = countries.reduce((sum, row) => sum + (row.configuredSources24h ?? 0), 0);
  const checkedSources24h = countries.every((row) => hasNumericValue(row.checkedSources24h))
    ? countries.reduce((sum, row) => sum + (row.checkedSources24h ?? 0), 0)
    : null;

  return {
    ...payload,
    totals: {
      ...payload.totals,
      configuredSources24h,
      checkedSources24h,
    },
    countries,
  };
}
