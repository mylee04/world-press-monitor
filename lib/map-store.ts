import 'server-only';

import { loadMapCountryMetrics } from '@/lib/map-country-metrics-reader';
import { loadMapCountrySources } from '@/lib/map-country-sources-reader';
import { loadMapPublishers } from '@/lib/map-publishers-reader';
import { loadMapSourceDetail } from '@/lib/map-source-detail-reader';
import {
  DEFAULT_MAP_WINDOW,
  normalizeMapMetricWindow,
  readTimedCache,
  type TimedCacheEntry,
  writeTimedCache,
} from '@/lib/map-store-windows';
import type {
  MapMetricWindow,
  MapCountryMetricsResponse,
  MapPublishersResponse,
  MapCountrySourcesResponse,
  MapSourceDetailResponse,
} from '@/lib/map-types';

export { normalizeMapMetricWindow } from '@/lib/map-store-windows';
const MAP_COUNTRY_METRICS_CACHE_MS = 60_000;
const MAP_COUNTRY_SOURCES_CACHE_MS = 60_000;
const MAP_SOURCE_DETAIL_CACHE_MS = 60_000;
const MAP_PUBLISHERS_CACHE_MS = 60_000;

let mapCountryMetricsCache = new Map<MapMetricWindow, TimedCacheEntry<MapCountryMetricsResponse>>();
let mapPublishersCache = new Map<MapMetricWindow, TimedCacheEntry<MapPublishersResponse>>();
const mapCountrySourcesCache = new Map<string, TimedCacheEntry<MapCountrySourcesResponse>>();
const mapSourceDetailCache = new Map<string, TimedCacheEntry<MapSourceDetailResponse | null>>();

export async function readMapCountryMetrics(window: MapMetricWindow = DEFAULT_MAP_WINDOW): Promise<MapCountryMetricsResponse> {
  const selectedWindow = normalizeMapMetricWindow(window);
  const cached = readTimedCache(mapCountryMetricsCache.get(selectedWindow));
  if (cached) return cached;
  const payload = await loadMapCountryMetrics(selectedWindow);
  mapCountryMetricsCache.set(selectedWindow, writeTimedCache(payload, MAP_COUNTRY_METRICS_CACHE_MS));
  return payload;
}

export async function readMapPublishers(window: MapMetricWindow = DEFAULT_MAP_WINDOW): Promise<MapPublishersResponse> {
  const selectedWindow = normalizeMapMetricWindow(window);
  const cached = readTimedCache(mapPublishersCache.get(selectedWindow));
  if (cached) return cached;
  const payload = await loadMapPublishers(selectedWindow);
  mapPublishersCache.set(selectedWindow, writeTimedCache(payload, MAP_PUBLISHERS_CACHE_MS));
  return payload;
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
