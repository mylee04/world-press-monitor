import type {
  MapMetricWindow,
  MapCountryMetricRow,
  MapPublisherConfidence,
  MapPublisherMetricRow,
  MapSourceDetailResponse,
  MapSourceMetricRow,
} from '@/lib/map-types';

export function formatNumber(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0';
  return value.toLocaleString();
}

export function formatPercentFromBps(value: number): string {
  return `${(value / 100).toFixed(1)}%`;
}

export function formatRelative(value: string | null | undefined): string {
  if (!value) return 'time unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'time unavailable';
  const diffMinutes = Math.round((Date.now() - date.getTime()) / (60 * 1000));
  if (Math.abs(diffMinutes) < 1) return 'just now';
  if (Math.abs(diffMinutes) < 60) return `${Math.abs(diffMinutes)} min ${diffMinutes >= 0 ? 'ago' : 'ahead'}`;
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return `${Math.abs(diffHours)} hr ${diffHours >= 0 ? 'ago' : 'ahead'}`;
  const diffDays = Math.round(diffHours / 24);
  return `${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'} ${diffDays >= 0 ? 'ago' : 'ahead'}`;
}

export function formatLateShare(late: number, inserted: number): string {
  if (inserted <= 0) return '-';
  return `${((late / inserted) * 100).toFixed(1)}%`;
}

export function mapWindowLabel(window: MapMetricWindow): string {
  if (window === '1h') return '1H';
  if (window === '7d') return '7D';
  return '24H';
}

export function mapWindowDescriptor(window: MapMetricWindow): string {
  if (window === '1h') return '1h';
  if (window === '7d') return '7d';
  return '24h';
}

export function getCountryWindowMetrics(row: MapCountryMetricRow, window: MapMetricWindow) {
  return row.windows[window];
}

export function getPublisherWindowMetrics(row: MapPublisherMetricRow, window: MapMetricWindow) {
  return row.windows[window];
}

export function getPublisherCountryWindowMetrics(row: MapPublisherMetricRow['countries'][number], window: MapMetricWindow) {
  return row.windows[window];
}

export function getSourceWindowMetrics(row: MapSourceMetricRow, window: MapMetricWindow) {
  return row.windows[window];
}

export function isSourceWindowActive(row: MapSourceMetricRow, window: MapMetricWindow) {
  const metrics = getSourceWindowMetrics(row, window);
  return metrics.published > 0 || metrics.firstSeen > 0;
}

export function publisherConfidenceLabel(confidence: MapPublisherConfidence): string {
  if (confidence === 'high') return 'High confidence';
  if (confidence === 'medium') return 'Medium confidence';
  return 'Low confidence';
}

export function sourceMethodLabel(value: MapSourceMetricRow['method']): string {
  if (value === 'rss+sitemap') return 'RSS + Sitemap';
  if (value === 'sitemap') return 'Sitemap';
  return 'RSS';
}

export function sourceLocationKindLabel(
  value: MapSourceMetricRow['locationKind'] | MapSourceDetailResponse['locationKind']
): string {
  if (value === 'headquarters') return 'In-country HQ';
  if (value === 'inferred-city') return 'Inferred city';
  if (value === 'hub') return 'City hub';
  if (value === 'foreign-operated') return 'Foreign-operated';
  return 'National fallback';
}
