import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeMapMetricWindow } from '@/lib/map-store-windows';
import type {
  MapCountryMetricsResponse,
  MapCountrySourcesResponse,
  MapMetricWindow,
  MapPublishersResponse,
} from '@/lib/map-types';

type MapCountrySourcesSnapshotFile = Record<string, MapCountrySourcesResponse>;

function getMapCountryMetricsSnapshotPath(window: MapMetricWindow): string {
  return path.join(process.cwd(), 'data', `map-country-metrics.snapshot.${normalizeMapMetricWindow(window)}.json`);
}

function getMapPublishersSnapshotPath(window: MapMetricWindow): string {
  return path.join(process.cwd(), 'data', `map-publishers.snapshot.${normalizeMapMetricWindow(window)}.json`);
}

function getMapCountrySourcesSnapshotPath(window: MapMetricWindow): string {
  return path.join(process.cwd(), 'data', `map-country-sources.snapshot.${normalizeMapMetricWindow(window)}.json`);
}

async function readJsonSnapshot<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as T | null;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export async function readMapCountryMetricsFileSnapshot(
  window: MapMetricWindow
): Promise<MapCountryMetricsResponse | null> {
  return readJsonSnapshot<MapCountryMetricsResponse>(getMapCountryMetricsSnapshotPath(window));
}

export async function readMapPublishersFileSnapshot(
  window: MapMetricWindow
): Promise<MapPublishersResponse | null> {
  return readJsonSnapshot<MapPublishersResponse>(getMapPublishersSnapshotPath(window));
}

export async function readMapCountrySourcesFileSnapshot(
  country: string,
  window: MapMetricWindow
): Promise<MapCountrySourcesResponse | null> {
  const snapshot = await readJsonSnapshot<MapCountrySourcesSnapshotFile>(getMapCountrySourcesSnapshotPath(window));
  if (!snapshot) return null;
  return snapshot[country.trim()] || null;
}
