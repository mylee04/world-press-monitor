import 'server-only';

import { buildMapCountryMetricsPayload } from '@/lib/map-country-metrics-builder';
import { loadMapCountrySources } from '@/lib/map-country-sources-reader';
import { buildMapPublishersPayload } from '@/lib/map-publishers-builder';
import {
  readMapCountryMetricsSnapshot,
  readMapPublishersSnapshot,
} from '@/lib/map-snapshot-store';
import { loadMapSourceDetail } from '@/lib/map-source-detail-reader';
import {
  buildCountryWindowRecord,
  DEFAULT_MAP_WINDOW,
  normalizeMapMetricWindow,
  readTimedCache,
  type TimedCacheEntry,
  writeTimedCache,
} from '@/lib/map-store-windows';
import { emptySourceEndpointBreakdown } from '@/lib/source-endpoint-classification';
import type {
  MapMetricWindow,
  MapCountryMetricsResponse,
  MapPublishersResponse,
  MapCountrySourcesResponse,
  MapSourceDetailResponse,
} from '@/lib/map-types';

export { normalizeMapMetricWindow } from '@/lib/map-store-windows';
const MAP_COUNTRY_METRICS_CACHE_MS = 5 * 60_000;
const MAP_COUNTRY_SOURCES_CACHE_MS = 5 * 60_000;
const MAP_SOURCE_DETAIL_CACHE_MS = 5 * 60_000;
const MAP_PUBLISHERS_CACHE_MS = 5 * 60_000;

let mapCountryMetricsCache = new Map<MapMetricWindow, TimedCacheEntry<MapCountryMetricsResponse>>();
let mapPublishersCache = new Map<MapMetricWindow, TimedCacheEntry<MapPublishersResponse>>();
const mapCountrySourcesCache = new Map<string, TimedCacheEntry<MapCountrySourcesResponse>>();
const mapSourceDetailCache = new Map<string, TimedCacheEntry<MapSourceDetailResponse | null>>();

async function readSnapshotBackedMapPayload<T extends { storage: 'postgres' | 'snapshot'; generatedAt: string }>(params: {
  window: MapMetricWindow;
  cache: Map<MapMetricWindow, TimedCacheEntry<T>>;
  ttlMs: number;
  readSnapshot: (window: MapMetricWindow) => Promise<T | null>;
  buildPayload: (window: MapMetricWindow) => Promise<T>;
}): Promise<T> {
  const selectedWindow = normalizeMapMetricWindow(params.window);
  const latestSnapshot = await params.readSnapshot(selectedWindow);
  const cached = readTimedCache(params.cache.get(selectedWindow));

  if (latestSnapshot) {
    if (cached && cached.storage === 'snapshot' && cached.generatedAt === latestSnapshot.generatedAt) {
      return cached;
    }
    params.cache.set(selectedWindow, writeTimedCache(latestSnapshot, params.ttlMs));
    return latestSnapshot;
  }

  if (cached && cached.storage !== 'snapshot') return cached;

  const payload = await params.buildPayload(selectedWindow);
  params.cache.set(selectedWindow, writeTimedCache(payload, params.ttlMs));
  return payload;
}

function buildEmptyMapCountryWindows() {
  return buildCountryWindowRecord({});
}

function buildEmptyMapCountryMetricsPayload(window: MapMetricWindow): MapCountryMetricsResponse {
  return {
    generatedAt: new Date().toISOString(),
    storage: 'snapshot',
    window,
    totals: {
      countries: 0,
      pub24h: 0,
      pub1h: 0,
      configuredSources24h: 0,
      checkedSources24h: 0,
      activeSources24h: 0,
      configuredEndpointBreakdown: emptySourceEndpointBreakdown(),
      windows: buildEmptyMapCountryWindows(),
    },
    countries: [],
  };
}

function buildEmptyMapPublishersPayload(window: MapMetricWindow): MapPublishersResponse {
  return {
    generatedAt: new Date().toISOString(),
    storage: 'snapshot',
    window,
    publishers: [],
  };
}

export async function readMapCountryMetrics(window: MapMetricWindow = DEFAULT_MAP_WINDOW): Promise<MapCountryMetricsResponse> {
  try {
    return await readSnapshotBackedMapPayload({
      window,
      cache: mapCountryMetricsCache,
      ttlMs: MAP_COUNTRY_METRICS_CACHE_MS,
      readSnapshot: readMapCountryMetricsSnapshot,
      buildPayload: buildMapCountryMetricsPayload,
    });
  } catch {
    return buildEmptyMapCountryMetricsPayload(normalizeMapMetricWindow(window));
  }
}

export async function readMapPublishers(window: MapMetricWindow = DEFAULT_MAP_WINDOW): Promise<MapPublishersResponse> {
  try {
    return await readSnapshotBackedMapPayload({
      window,
      cache: mapPublishersCache,
      ttlMs: MAP_PUBLISHERS_CACHE_MS,
      readSnapshot: readMapPublishersSnapshot,
      buildPayload: buildMapPublishersPayload,
    });
  } catch {
    return buildEmptyMapPublishersPayload(normalizeMapMetricWindow(window));
  }
}

export async function readMapCountrySources(
  country: string,
  window: MapMetricWindow = DEFAULT_MAP_WINDOW
): Promise<MapCountrySourcesResponse> {
  const selectedWindow = normalizeMapMetricWindow(window);
  const countryKey = `${country.trim()}::${selectedWindow}`;
  const cached = readTimedCache(mapCountrySourcesCache.get(countryKey));
  if (cached) return cached;
  const payload = await loadMapCountrySources(country, selectedWindow);
  mapCountrySourcesCache.set(countryKey, writeTimedCache(payload, MAP_COUNTRY_SOURCES_CACHE_MS));
  return payload;
}

export async function readMapSourceDetail(sourceName: string): Promise<MapSourceDetailResponse | null> {
  const sourceCacheKey = decodeURIComponent(sourceName).trim().toLowerCase();
  const cached = readTimedCache(mapSourceDetailCache.get(sourceCacheKey));
  if (cached !== null) return cached;
  const payload = await loadMapSourceDetail(sourceName);
  mapSourceDetailCache.set(sourceCacheKey, writeTimedCache(payload, MAP_SOURCE_DETAIL_CACHE_MS));
  return payload;
}
