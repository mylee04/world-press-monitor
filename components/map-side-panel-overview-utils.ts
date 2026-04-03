import type { MapCountryMetricRow, MapMetricWindow } from '@/lib/map-types';

export function round(value: number, digits = 1): number {
  const precision = 10 ** digits;
  return Math.round(value * precision) / precision;
}

export function formatPercent(value: number): string {
  return `${round(value * 100, 1)}%`;
}

export function itemDegradedShare(row: MapCountryMetricRow, window: MapMetricWindow): number {
  const metrics = row.windows[window];
  return metrics.activeSources > 0 ? metrics.degradedSources / metrics.activeSources : 0;
}

function parseTrendBucket(bucket: string): Date | null {
  const parsed = new Date(bucket);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const utcParsed = new Date(`${bucket}Z`);
  return Number.isNaN(utcParsed.getTime()) ? null : utcParsed;
}

export function formatTrendBucket(bucket: string, window: MapMetricWindow, timeZone: string | null): string {
  const parsed = parseTrendBucket(bucket);
  if (!parsed) return bucket;

  if (window === '7d') {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      timeZone: timeZone || 'UTC',
    }).format(parsed);
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timeZone || 'UTC',
    timeZoneName: 'short',
  }).format(parsed);
}
