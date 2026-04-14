import { formatNumber } from '@/lib/map-display';
import type { MapCountryMetricRow, MapMetricWindow } from '@/lib/map-types';

export function round(value: number, digits = 1): number {
  const precision = 10 ** digits;
  return Math.round(value * precision) / precision;
}

export function hasCoverageValue(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function formatCoverageValue(value: number | null | undefined): string {
  return hasCoverageValue(value) ? formatNumber(value) : '-';
}

export function formatPercent(value: number): string {
  return `${round(value * 100, 1)}%`;
}

export function getSourceCoverageDisplay(
  configured: number | null | undefined,
  checked: number | null | undefined,
  warningThreshold = 0.2
): {
  percent: string;
  stats: string;
  isLowCoverage: boolean;
  isStale: boolean;
} {
  if (!hasCoverageValue(configured) || configured <= 0) {
    return {
      percent: '-',
      stats: 'Configured unavailable',
      isLowCoverage: false,
      isStale: false,
    };
  }

  if (!hasCoverageValue(checked)) {
    return {
      percent: '-',
      stats: `${formatNumber(configured)} configured · checked unavailable`,
      isLowCoverage: false,
      isStale: false,
    };
  }

  const isStale = checked > configured;
  const effectiveChecked = Math.min(checked, configured);
  const ratio = configured > 0 ? effectiveChecked / configured : 0;

  return {
    percent: `${round(ratio * 100, 1)}%`,
    stats: isStale
      ? `${formatNumber(checked)} checked · configured snapshot stale`
      : `${formatNumber(checked)} of ${formatNumber(configured)} checked`,
    isLowCoverage: ratio <= warningThreshold,
    isStale,
  };
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
