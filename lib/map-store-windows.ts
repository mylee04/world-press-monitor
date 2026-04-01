import type {
  MapMetricWindow,
  MapCountryMetricRow,
  MapPublisherConfidence,
  MapPublisherCountryRow,
  MapPublisherMetricRow,
} from '@/lib/map-types';

export const MAP_WINDOWS: MapMetricWindow[] = ['1h', '24h', '7d'];
export const DEFAULT_MAP_WINDOW: MapMetricWindow = '24h';

export type TimedCacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export type SourceMetricWindowSqlRow = {
  country: string | null;
  source: string;
  pub_1h: string;
  pub_24h: string;
  pub_7d: string;
  fresh_1h: string;
  fresh_24h: string;
  fresh_7d: string;
  late_1h: string;
  late_24h: string;
  late_7d: string;
  first_seen_1h: string;
  first_seen_24h: string;
  first_seen_7d: string;
};

export type CountryWindowAccumulator = {
  published: number;
  fresh: number;
  late: number;
  firstSeen: number;
  activeSources: number;
  rssSources: number;
  sitemapSources: number;
  healthySources: number;
  degradedSources: number;
};

export type PublisherWindowAccumulator = {
  published: number;
  activeCountries: number;
  activeSources: number;
  healthySources: number;
  degradedSources: number;
};

export type PublisherConfidenceVotes = Record<MapPublisherConfidence, number>;

export function readTimedCache<T>(entry: TimedCacheEntry<T> | null | undefined): T | null {
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) return null;
  return entry.value;
}

export function writeTimedCache<T>(value: T, ttlMs: number): TimedCacheEntry<T> {
  return {
    value,
    expiresAt: Date.now() + ttlMs,
  };
}

export function normalizeMapMetricWindow(value: string | null | undefined): MapMetricWindow {
  return value === '1h' || value === '7d' ? value : DEFAULT_MAP_WINDOW;
}

export function emptyCountryWindowAccumulator(): CountryWindowAccumulator {
  return {
    published: 0,
    fresh: 0,
    late: 0,
    firstSeen: 0,
    activeSources: 0,
    rssSources: 0,
    sitemapSources: 0,
    healthySources: 0,
    degradedSources: 0,
  };
}

export function emptyPublisherWindowAccumulator(): PublisherWindowAccumulator {
  return {
    published: 0,
    activeCountries: 0,
    activeSources: 0,
    healthySources: 0,
    degradedSources: 0,
  };
}

export function emptyPublisherConfidenceVotes(): PublisherConfidenceVotes {
  return {
    high: 0,
    medium: 0,
    low: 0,
  };
}

export function addPublisherConfidenceVote(votes: PublisherConfidenceVotes, confidence: MapPublisherConfidence): void {
  votes[confidence] += 1;
}

export function mergePublisherConfidenceVotes(target: PublisherConfidenceVotes, source: PublisherConfidenceVotes): void {
  target.high += source.high;
  target.medium += source.medium;
  target.low += source.low;
}

export function resolvePublisherConfidence(votes: PublisherConfidenceVotes): MapPublisherConfidence {
  const total = votes.high + votes.medium + votes.low;
  if (total <= 0) return 'low';
  const weightedScore = (votes.high * 3 + votes.medium * 2 + votes.low) / total;
  if (weightedScore >= 2.6) return 'high';
  if (weightedScore >= 1.6) return 'medium';
  return 'low';
}

export function buildCountryWindowRecord(
  values: Partial<Record<MapMetricWindow, CountryWindowAccumulator>>
): Record<MapMetricWindow, MapCountryMetricRow['windows'][MapMetricWindow]> {
  return {
    '1h': toCountryWindowMetrics(values['1h']),
    '24h': toCountryWindowMetrics(values['24h']),
    '7d': toCountryWindowMetrics(values['7d']),
  };
}

export function toCountryWindowMetrics(value?: CountryWindowAccumulator): MapCountryMetricRow['windows'][MapMetricWindow] {
  const current = value || emptyCountryWindowAccumulator();
  return {
    published: current.published,
    fresh: current.fresh,
    late: current.late,
    firstSeen: current.firstSeen,
    lateShare: current.firstSeen > 0 ? current.late / current.firstSeen : 0,
    activeSources: current.activeSources,
    rssSources: current.rssSources,
    sitemapSources: current.sitemapSources,
    healthySources: current.healthySources,
    degradedSources: current.degradedSources,
  };
}

export function buildPublisherWindowRecord(
  values: Partial<Record<MapMetricWindow, PublisherWindowAccumulator>>
): Record<MapMetricWindow, MapPublisherMetricRow['windows'][MapMetricWindow]> {
  return {
    '1h': toPublisherWindowMetrics(values['1h']),
    '24h': toPublisherWindowMetrics(values['24h']),
    '7d': toPublisherWindowMetrics(values['7d']),
  };
}

export function toPublisherWindowMetrics(value?: PublisherWindowAccumulator): MapPublisherMetricRow['windows'][MapMetricWindow] {
  const current = value || emptyPublisherWindowAccumulator();
  return {
    published: current.published,
    activeCountries: current.activeCountries,
    activeSources: current.activeSources,
    healthySources: current.healthySources,
    degradedSources: current.degradedSources,
  };
}

export function buildPublisherCountryWindowRecord(
  values: Partial<Record<MapMetricWindow, PublisherWindowAccumulator>>
): Record<MapMetricWindow, MapPublisherCountryRow['windows'][MapMetricWindow]> {
  return {
    '1h': toPublisherCountryWindowMetrics(values['1h']),
    '24h': toPublisherCountryWindowMetrics(values['24h']),
    '7d': toPublisherCountryWindowMetrics(values['7d']),
  };
}

export function toPublisherCountryWindowMetrics(value?: PublisherWindowAccumulator): MapPublisherCountryRow['windows'][MapMetricWindow] {
  const current = value || emptyPublisherWindowAccumulator();
  return {
    published: current.published,
    activeSources: current.activeSources,
    healthySources: current.healthySources,
    degradedSources: current.degradedSources,
  };
}

export function buildCountryWindowsFromSqlRow(row: SourceMetricWindowSqlRow): Record<MapMetricWindow, CountryWindowAccumulator> {
  return {
    '1h': {
      published: Number(row.pub_1h || 0),
      fresh: Number(row.fresh_1h || 0),
      late: Number(row.late_1h || 0),
      firstSeen: Number(row.first_seen_1h || 0),
      activeSources: 0,
      rssSources: 0,
      sitemapSources: 0,
      healthySources: 0,
      degradedSources: 0,
    },
    '24h': {
      published: Number(row.pub_24h || 0),
      fresh: Number(row.fresh_24h || 0),
      late: Number(row.late_24h || 0),
      firstSeen: Number(row.first_seen_24h || 0),
      activeSources: 0,
      rssSources: 0,
      sitemapSources: 0,
      healthySources: 0,
      degradedSources: 0,
    },
    '7d': {
      published: Number(row.pub_7d || 0),
      fresh: Number(row.fresh_7d || 0),
      late: Number(row.late_7d || 0),
      firstSeen: Number(row.first_seen_7d || 0),
      activeSources: 0,
      rssSources: 0,
      sitemapSources: 0,
      healthySources: 0,
      degradedSources: 0,
    },
  };
}

export function isCountryWindowActive(metrics: CountryWindowAccumulator): boolean {
  return metrics.published > 0 || metrics.firstSeen > 0;
}
