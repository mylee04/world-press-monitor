import { buildMapPublishersPayload } from '@/lib/map-publishers-builder';
import { readMapPublishersSnapshot } from '@/lib/map-snapshot-store';
import type { MapMetricWindow, MapPublishersResponse } from '@/lib/map-types';

export { buildMapPublishersPayload } from '@/lib/map-publishers-builder';

function buildEmptyMapPublishersPayload(window: MapMetricWindow): MapPublishersResponse {
  return {
    generatedAt: new Date().toISOString(),
    storage: 'snapshot',
    window,
    publishers: [],
  };
}

export async function loadMapPublishers(selectedWindow: MapMetricWindow): Promise<MapPublishersResponse> {
  try {
    const snapshot = await readMapPublishersSnapshot(selectedWindow);
    if (snapshot) return snapshot;
    return buildMapPublishersPayload(selectedWindow);
  } catch {
    return buildEmptyMapPublishersPayload(selectedWindow);
  }
}
