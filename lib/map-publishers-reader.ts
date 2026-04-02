import 'server-only';

import { buildMapPublishersPayload } from '@/lib/map-publishers-builder';
import { readMapPublishersSnapshot } from '@/lib/map-snapshot-store';
import type { MapMetricWindow, MapPublishersResponse } from '@/lib/map-types';

export { buildMapPublishersPayload } from '@/lib/map-publishers-builder';

export async function loadMapPublishers(selectedWindow: MapMetricWindow): Promise<MapPublishersResponse> {
  const snapshot = await readMapPublishersSnapshot(selectedWindow);
  if (snapshot) return snapshot;
  return buildMapPublishersPayload(selectedWindow);
}
