import { buildMapCountryMetricsPayload } from '@/lib/map-country-metrics-builder';
import { readMapCountryMetricsSnapshot } from '@/lib/map-snapshot-store';
import type { MapCountryMetricsResponse, MapMetricWindow } from '@/lib/map-types';

export { buildMapCountryMetricsPayload } from '@/lib/map-country-metrics-builder';

export async function loadMapCountryMetrics(selectedWindow: MapMetricWindow): Promise<MapCountryMetricsResponse> {
  const snapshot = await readMapCountryMetricsSnapshot(selectedWindow);
  if (snapshot) return snapshot;
  return buildMapCountryMetricsPayload(selectedWindow);
}
