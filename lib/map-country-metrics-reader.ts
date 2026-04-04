import { buildMapCountryMetricsPayload } from '@/lib/map-country-metrics-builder';
import { readMapCountryMetricsSnapshot } from '@/lib/map-snapshot-store';
import { buildCountryWindowRecord } from '@/lib/map-store-windows';
import type { MapCountryMetricsResponse, MapMetricWindow } from '@/lib/map-types';

export { buildMapCountryMetricsPayload } from '@/lib/map-country-metrics-builder';

function buildEmptyMapCountryMetricsPayload(window: MapMetricWindow): MapCountryMetricsResponse {
  return {
    generatedAt: new Date().toISOString(),
    storage: 'snapshot',
    window,
    totals: {
      countries: 0,
      pub24h: 0,
      pub1h: 0,
      activeSources24h: 0,
      windows: buildCountryWindowRecord({}),
    },
    countries: [],
  };
}

export async function loadMapCountryMetrics(selectedWindow: MapMetricWindow): Promise<MapCountryMetricsResponse> {
  try {
    const snapshot = await readMapCountryMetricsSnapshot(selectedWindow);
    if (snapshot) return snapshot;
    return buildMapCountryMetricsPayload(selectedWindow);
  } catch {
    return buildEmptyMapCountryMetricsPayload(selectedWindow);
  }
}
