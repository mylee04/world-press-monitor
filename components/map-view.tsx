'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { CSSProperties, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { geoGraticule10, geoMercator, geoOrthographic, geoPath } from 'd3-geo';
import type { CountryBenchmarkResponse } from '@/lib/benchmark-types';
import { BENCHMARK_COLUMN_HELP, HelpTooltipLabel } from '@/components/help-tooltip-label';
import type {
  MapMetricWindow,
  MapCountryMetricsResponse,
  MapCountryMetricRow,
  MapPublishersResponse,
  MapPublisherMetricRow,
  MapCountrySourcesResponse,
  MapSourceDetailResponse,
  MapSourceMetricRow,
} from '@/lib/map-types';

type JsonState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  updatedAt: number | null;
};

type WorldGeoJsonFeature = {
  id?: string | number;
  properties?: {
    name?: string;
  };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
};

type WorldGeoJson = {
  type: 'FeatureCollection';
  features: WorldGeoJsonFeature[];
};

type ProjectedPoint = {
  x: number;
  y: number;
  visible: boolean;
};

type MapLayerState = {
  labels: boolean;
  graticule: boolean;
  land: boolean;
  glow: boolean;
  flows: boolean;
};

type MapMode = 'countries' | 'publishers' | 'health';
type LeftTab = 'overview' | 'display';
type DetailTab = 'metrics' | 'headlines' | 'health';
type MapSearchResult =
  | {
      kind: 'country';
      key: string;
      title: string;
      subtitle: string;
      country: MapCountryMetricRow;
    }
  | {
      kind: 'publisher';
      key: string;
      title: string;
      subtitle: string;
      publisher: MapPublisherMetricRow;
    };

const GLOBE_WIDTH = 1800;
const GLOBE_HEIGHT = 1120;
const GLOBE_CENTER_X = 1008;
const GLOBE_CENTER_Y = 554;
const GLOBE_RADIUS = 422;
const GLOBE_ROTATION_LON = 78;
const GLOBE_ROTATION_LAT = 18;
const MAP_SAFE_LEFT = 338;
const MAP_SAFE_RIGHT = 334;
const MAP_SAFE_TOP = 96;
const MAP_SAFE_BOTTOM = 96;
const COUNTRY_ZOOM_MIN = 1;
const COUNTRY_ZOOM_MAX = 8;
const COUNTRY_ZOOM_STEP = 1.18;

type CountryViewport = {
  scale: number;
  tx: number;
  ty: number;
};

const DEFAULT_COUNTRY_VIEWPORT: CountryViewport = {
  scale: 1,
  tx: 0,
  ty: 0,
};

const COUNTRY_ALIASES: Record<string, string[]> = {
  'United States': ['United States of America', 'USA'],
  'United Kingdom': ['England'],
  'South Korea': ['Korea', 'Republic of Korea'],
  'North Korea': ['Dem. Rep. Korea', 'North Korea'],
  Serbia: ['Republic of Serbia'],
  Russia: ['Russian Federation'],
  'Czech Republic': ['Czechia'],
  Slovakia: ['Slovak Republic'],
  'Ivory Coast': ["Côte d'Ivoire", 'Cote dIvoire'],
  Turkey: ['Türkiye', 'Turkiye'],
  Iran: ['Iran, Islamic Republic of', 'Iran'],
  Syria: ['Syrian Arab Republic'],
  Moldova: ['Republic of Moldova', 'Moldova'],
  Venezuela: ['Venezuela, Bolivarian Republic of', 'Venezuela'],
  Tanzania: ['United Republic of Tanzania', 'Tanzania'],
  Laos: ["Lao People's Democratic Republic", 'Laos'],
  Bolivia: ['Bolivia, Plurinational State of', 'Bolivia'],
  Vietnam: ['Viet Nam', 'Vietnam'],
  Brunei: ['Brunei Darussalam'],
  'Dominican Republic': ['Dominican Rep.', 'Dominican Republic'],
  Bosnia: ['Bosnia and Herz.', 'Bosnia and Herzegovina'],
  Kosovo: ['Kosovo'],
  Palestine: ['Palestine', 'West Bank'],
};

function round(value: number, digits = 2): number {
  const precision = 10 ** digits;
  return Math.round(value * precision) / precision;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeCountryName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const MAP_AUTO_REFRESH_MS = 60 * 60 * 1000;
const MAP_WINDOW_OPTIONS: MapMetricWindow[] = ['1h', '24h', '7d'];
const MAP_LAYER_KEYS = ['labels', 'graticule', 'land', 'glow', 'flows'] as const;
const DEFAULT_MAP_LAYERS: MapLayerState = {
  labels: true,
  graticule: true,
  land: true,
  glow: true,
  flows: true,
};

function isMapMode(value: string | null): value is MapMode {
  return value === 'countries' || value === 'publishers' || value === 'health';
}

function isLeftTab(value: string | null): value is LeftTab {
  return value === 'overview' || value === 'display';
}

function isDetailTab(value: string | null): value is DetailTab {
  return value === 'metrics' || value === 'headlines' || value === 'health';
}

function isMapMetricWindow(value: string | null): value is MapMetricWindow {
  return value === '1h' || value === '24h' || value === '7d';
}

function serializeLayerState(layers: MapLayerState): string | null {
  const enabled = MAP_LAYER_KEYS.filter((key) => layers[key]);
  if (enabled.length === MAP_LAYER_KEYS.length) return null;
  return enabled.join(',');
}

function parseLayerState(raw: string | null): MapLayerState | null {
  if (!raw) return null;
  const enabled = new Set(
    raw
      .split(',')
      .map((value) => value.trim())
      .filter((value): value is (typeof MAP_LAYER_KEYS)[number] => MAP_LAYER_KEYS.includes(value as (typeof MAP_LAYER_KEYS)[number]))
  );
  return {
    labels: enabled.has('labels'),
    graticule: enabled.has('graticule'),
    land: enabled.has('land'),
    glow: enabled.has('glow'),
    flows: enabled.has('flows'),
  };
}

function sameLayerState(a: MapLayerState, b: MapLayerState): boolean {
  return MAP_LAYER_KEYS.every((key) => a[key] === b[key]);
}

function buildMapQueryString(input: {
  mode: MapMode;
  window: MapMetricWindow;
  country: string | null;
  publisher: string | null;
  source: string | null;
  leftTab: LeftTab;
  detailTab: DetailTab;
  benchmarkOpen: boolean;
  layers: MapLayerState;
}): string {
  const params = new URLSearchParams();

  if (input.mode !== 'countries') params.set('mode', input.mode);
  if (input.window !== '24h') params.set('window', input.window);
  if (input.country) params.set('country', input.country);
  if (input.mode === 'publishers' && input.publisher) params.set('publisher', input.publisher);
  if (input.country && input.source) params.set('source', input.source);
  if (input.leftTab !== 'overview') params.set('panel', input.leftTab);
  if (input.detailTab !== 'metrics') params.set('detail', input.detailTab);
  if (!input.benchmarkOpen) params.set('benchmark', 'collapsed');

  const serializedLayers = serializeLayerState(input.layers);
  if (serializedLayers) params.set('layers', serializedLayers);

  return params.toString();
}

function useRemoteJson<T>(url: string | null, refreshMs = MAP_AUTO_REFRESH_MS): JsonState<T> {
  const updatedAtRef = useRef<number | null>(null);
  const [state, setState] = useState<JsonState<T>>({
    data: null,
    loading: Boolean(url),
    error: null,
    updatedAt: null,
  });

  useEffect(() => {
    let cancelled = false;
    if (!url) {
      setState({ data: null, loading: false, error: null, updatedAt: null });
      return () => {
        cancelled = true;
      };
    }

    const load = async (isBackground = false) => {
      if (!cancelled) {
        setState((current) => ({
          data: current.data,
          loading: isBackground ? current.loading : true,
          error: null,
          updatedAt: current.updatedAt,
        }));
      }

      try {
        const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message || `${response.status} ${response.statusText}`);
        }
        const payload = (await response.json()) as T;
        if (!cancelled) {
          updatedAtRef.current = Date.now();
          setState({
            data: payload,
            loading: false,
            error: null,
            updatedAt: updatedAtRef.current,
          });
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setState((current) => ({
            data: current.data,
            loading: false,
            error: error instanceof Error ? error.message : 'Failed to load resource.',
            updatedAt: current.updatedAt,
          }));
        }
      }
    };

    void load();

    const interval = window.setInterval(() => {
      void load(true);
    }, refreshMs);

    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      const staleFor = Date.now() - (updatedAtRef.current || 0);
      if (!updatedAtRef.current || staleFor >= refreshMs) {
        void load(true);
      }
    };
    window.addEventListener('focus', handleVisibility);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', handleVisibility);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [url, refreshMs]);

  return state;
}

function degToRad(value: number): number {
  return (value * Math.PI) / 180;
}

function projectToGlobe(lat: number, lon: number, rotationLon = GLOBE_ROTATION_LON): ProjectedPoint {
  const lambda = degToRad(lon - rotationLon);
  const phi = degToRad(lat);
  const phi0 = degToRad(GLOBE_ROTATION_LAT);
  const cosc = Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * Math.cos(phi) * Math.cos(lambda);
  const visible = cosc > 0;
  const x = GLOBE_RADIUS * Math.cos(phi) * Math.sin(lambda);
  const y = -GLOBE_RADIUS * (Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * Math.cos(phi) * Math.cos(lambda));

  return {
    x: round(GLOBE_CENTER_X + x, 2),
    y: round(GLOBE_CENTER_Y + y, 2),
    visible,
  };
}

function buildFlowPath(start: { x: number; y: number }, end: { x: number; y: number }): string {
  const midpointX = (start.x + end.x) / 2;
  const midpointY = (start.y + end.y) / 2;
  const pullX = midpointX - GLOBE_CENTER_X;
  const pullY = midpointY - GLOBE_CENTER_Y;
  const pullLength = Math.max(1, Math.hypot(pullX, pullY));
  const controlX = round(midpointX + (pullX / pullLength) * 56, 2);
  const controlY = round(midpointY + (pullY / pullLength) * 56, 2);
  return `M${start.x},${start.y} Q${controlX},${controlY} ${end.x},${end.y}`;
}

function useIdleRotation(enabled: boolean): number {
  const [rotation, setRotation] = useState(GLOBE_ROTATION_LON);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let frameId = 0;
    let lastTime = 0;

    const tick = (timestamp: number) => {
      if (!lastTime) {
        lastTime = timestamp;
      }
      const delta = timestamp - lastTime;
      lastTime = timestamp;
      setRotation((current) => {
        const next = current + delta * 0.0048;
        return next >= 360 ? next - 360 : next;
      });
      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [enabled]);

  return rotation;
}

function formatNumber(value: number): string {
  return value.toLocaleString();
}

function formatPercentFromBps(value: number): string {
  return `${(value / 100).toFixed(1)}%`;
}

function formatRelative(value: string | null | undefined): string {
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

function formatLateShare(late: number, inserted: number): string {
  if (inserted <= 0) return '-';
  return `${((late / inserted) * 100).toFixed(1)}%`;
}

function mapWindowLabel(window: MapMetricWindow): string {
  if (window === '1h') return '1H';
  if (window === '7d') return '7D';
  return '24H';
}

function mapWindowDescriptor(window: MapMetricWindow): string {
  if (window === '1h') return '1h';
  if (window === '7d') return '7d';
  return '24h';
}

function getCountryWindowMetrics(row: MapCountryMetricRow, window: MapMetricWindow) {
  return row.windows[window];
}

function getPublisherWindowMetrics(row: MapPublisherMetricRow, window: MapMetricWindow) {
  return row.windows[window];
}

function getPublisherCountryWindowMetrics(row: MapPublisherMetricRow['countries'][number], window: MapMetricWindow) {
  return row.windows[window];
}

function sourceMethodLabel(value: MapSourceMetricRow['method']): string {
  if (value === 'rss+sitemap') return 'RSS + Sitemap';
  if (value === 'sitemap') return 'Sitemap';
  return 'RSS';
}

function sourceLocationKindLabel(
  value: MapSourceMetricRow['locationKind'] | MapSourceDetailResponse['locationKind']
): string {
  if (value === 'headquarters') return 'HQ';
  if (value === 'inferred-city') return 'Inferred city';
  if (value === 'hub') return 'City hub';
  return 'Country fallback';
}

function getHealthColor(status: MapSourceMetricRow['health'] | 'country'): string {
  switch (status) {
    case 'healthy':
      return '#4df5b1';
    case 'warning':
      return '#ffd76b';
    case 'degraded':
      return '#ff9564';
    case 'failing':
      return '#ff5f8b';
    case 'country':
      return '#7fe3ff';
    default:
      return '#76c6ff';
  }
}

function getCountryBubbleColor(row: MapCountryMetricRow, mode: MapMode, window: MapMetricWindow): string {
  const windowMetrics = row.windows[window];
  if (mode === 'health') {
    const degradedShare = windowMetrics.activeSources > 0 ? windowMetrics.degradedSources / windowMetrics.activeSources : 0;
    if (degradedShare >= 0.35) return '#ff5f8b';
    if (degradedShare >= 0.16) return '#ffcf5a';
    return '#4df5b1';
  }
  if (windowMetrics.lateShare >= 0.2) return '#ff5f8b';
  if (windowMetrics.lateShare >= 0.08) return '#ffcf5a';
  return '#62dcff';
}

function buildStarField(): Array<{ x: number; y: number; r: number; opacity: number }> {
  const stars: Array<{ x: number; y: number; r: number; opacity: number }> = [];
  for (let index = 0; index < 180; index += 1) {
    const seed = Math.sin(index * 78.233) * 43758.5453;
    const seed2 = Math.sin(index * 14.77) * 11837.77;
    const x = (seed - Math.floor(seed)) * GLOBE_WIDTH;
    const y = (seed2 - Math.floor(seed2)) * GLOBE_HEIGHT;
    const r = 0.6 + ((index * 17) % 7) * 0.22;
    const opacity = 0.15 + (((index * 29) % 10) / 10) * 0.38;
    stars.push({
      x: round(x, 2),
      y: round(y, 2),
      r: round(r, 2),
      opacity: round(opacity, 2),
    });
  }
  return stars;
}

function findWorldFeature(world: WorldGeoJson | null, country: string): WorldGeoJsonFeature | null {
  if (!world) return null;
  const wanted = new Set([normalizeCountryName(country), ...(COUNTRY_ALIASES[country] || []).map(normalizeCountryName)]);

  for (const feature of world.features) {
    const name = feature.properties?.name;
    if (!name) continue;
    if (wanted.has(normalizeCountryName(name))) {
      return feature;
    }
  }

  return null;
}

function bboxOfPolygon(polygon: number[][][]): { minLon: number; maxLon: number; minLat: number; maxLat: number; area: number } {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const ring of polygon) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }

  return {
    minLon,
    maxLon,
    minLat,
    maxLat,
    area: Math.max(0.0001, (maxLon - minLon) * (maxLat - minLat)),
  };
}

function polygonSourceScore(polygon: number[][][], sources: MapSourceMetricRow[]): number {
  const bbox = bboxOfPolygon(polygon);
  const padLon = Math.max(0.6, (bbox.maxLon - bbox.minLon) * 0.08);
  const padLat = Math.max(0.6, (bbox.maxLat - bbox.minLat) * 0.08);
  let matched = 0;

  for (const source of sources) {
    if (
      source.lon >= bbox.minLon - padLon &&
      source.lon <= bbox.maxLon + padLon &&
      source.lat >= bbox.minLat - padLat &&
      source.lat <= bbox.maxLat + padLat
    ) {
      matched += 1;
    }
  }

  return matched;
}

function selectDisplayFeature(feature: WorldGeoJsonFeature | null, sources: MapSourceMetricRow[]): WorldGeoJsonFeature | null {
  if (!feature) return null;
  if (feature.geometry.type !== 'MultiPolygon') return feature;

  const polygons = feature.geometry.coordinates as number[][][][];
  if (polygons.length <= 1) return feature;

  const scored = polygons.map((polygon, index) => ({
    index,
    polygon,
    bbox: bboxOfPolygon(polygon),
    matchedSources: polygonSourceScore(polygon, sources),
  }));

  const bestScore = Math.max(...scored.map((entry) => entry.matchedSources));
  const selected = scored
    .filter((entry) => entry.matchedSources === bestScore)
    .sort((a, b) => b.bbox.area - a.bbox.area)
    .slice(0, 1)
    .map((entry) => entry.polygon);

  return {
    ...feature,
    geometry: {
      type: 'MultiPolygon',
      coordinates: selected,
    },
  };
}

function buildSyntheticCountryFeature(sources: MapSourceMetricRow[]): WorldGeoJsonFeature | null {
  if (sources.length === 0) return null;

  const lats = sources.map((source) => source.lat);
  const lons = sources.map((source) => source.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const padLat = Math.max(0.18, (maxLat - minLat) * 0.35 || 0.18);
  const padLon = Math.max(0.18, (maxLon - minLon) * 0.35 || 0.18);

  return {
    properties: { name: 'Synthetic country frame' },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [minLon - padLon, minLat - padLat],
        [maxLon + padLon, minLat - padLat],
        [maxLon + padLon, maxLat + padLat],
        [minLon - padLon, maxLat + padLat],
        [minLon - padLon, minLat - padLat],
      ]],
    },
  };
}

function projectCountryToPlane(
  row: MapSourceMetricRow,
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number },
  width = 1800,
  height = 1120
): { x: number; y: number } {
  const padX = 180;
  const padY = 130;
  const plotWidth = width - padX * 2;
  const plotHeight = height - padY * 2;
  const lonSpan = Math.max(0.5, bounds.maxLon - bounds.minLon);
  const latSpan = Math.max(0.5, bounds.maxLat - bounds.minLat);
  const x = padX + ((row.lon - bounds.minLon) / lonSpan) * plotWidth;
  const y = height - padY - ((row.lat - bounds.minLat) / latSpan) * plotHeight;
  return { x: round(x, 2), y: round(y, 2) };
}

type CountryPlottedPoint = {
  source: MapSourceMetricRow;
  point: { x: number; y: number };
};

type CountrySourceCluster = {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
  point: { x: number; y: number };
  pub24h: number;
  pub1h: number;
  sourceCount: number;
  headquartersCount: number;
  health: MapSourceMetricRow['health'];
  sources: MapSourceMetricRow[];
};

function spreadCountryPoints(
  items: CountryPlottedPoint[],
  threshold = 20
): CountryPlottedPoint[] {
  if (items.length <= 1) return items;

  const nodes = items.map((item) => ({
    source: item.source,
    x: item.point.x,
    y: item.point.y,
    baseX: item.point.x,
    baseY: item.point.y,
    radius: Math.max(10, Math.min(24, 8 + Math.sqrt(item.source.pub24h) / 2.2)),
  }));

  for (let step = 0; step < 28; step += 1) {
    for (let index = 0; index < nodes.length; index += 1) {
      const current = nodes[index];
      for (let inner = index + 1; inner < nodes.length; inner += 1) {
        const neighbor = nodes[inner];
        const dx = neighbor.x - current.x;
        const dy = neighbor.y - current.y;
        const distance = Math.max(0.001, Math.hypot(dx, dy));
        const minDistance = Math.max(threshold, (current.radius + neighbor.radius) * 0.54);
        if (distance >= minDistance) continue;

        const overlap = (minDistance - distance) / 2;
        const pushX = (dx / distance) * overlap;
        const pushY = (dy / distance) * overlap;

        current.x -= pushX;
        current.y -= pushY;
        neighbor.x += pushX;
        neighbor.y += pushY;
      }

      current.x += (current.baseX - current.x) * 0.08;
      current.y += (current.baseY - current.y) * 0.08;
    }
  }

  return nodes.map((node) => ({
    source: node.source,
    point: {
      x: round(node.x, 2),
      y: round(node.y, 2),
    },
  }));
}

function buildNonOverlappingLabels<T extends { x: number; y: number }>(
  items: T[],
  distance = 56
): T[] {
  const placed: Array<{ x: number; y: number }> = [];
  const accepted: T[] = [];

  for (const item of items) {
    const blocked = placed.some((point) => Math.hypot(point.x - item.x, point.y - item.y) < distance);
    if (!blocked) {
      placed.push({ x: item.x, y: item.y });
      accepted.push(item);
    }
  }

  return accepted;
}

function mergeHealthStatus(values: MapSourceMetricRow['health'][]): MapSourceMetricRow['health'] {
  if (values.includes('failing')) return 'failing';
  if (values.includes('degraded')) return 'degraded';
  if (values.includes('warning')) return 'warning';
  if (values.includes('healthy')) return 'healthy';
  return 'unknown';
}

function buildCountrySourceClusters(items: CountryPlottedPoint[]): CountrySourceCluster[] {
  const byKey = new Map<string, {
    id: string;
    name: string;
    city: string | null;
    region: string | null;
    sumX: number;
    sumY: number;
    pub24h: number;
    pub1h: number;
    headquartersCount: number;
    health: MapSourceMetricRow['health'][];
    sources: MapSourceMetricRow[];
  }>();

  for (const item of items) {
    const clusterName = item.source.city || item.source.region || item.source.source;
    const key = item.source.city
      ? `${item.source.country}:city:${item.source.city}`
      : item.source.region
        ? `${item.source.country}:region:${item.source.region}`
        : `source:${item.source.sourceId}`;
    const current = byKey.get(key);
    if (current) {
      current.sumX += item.point.x;
      current.sumY += item.point.y;
      current.pub24h += item.source.pub24h;
      current.pub1h += item.source.pub1h;
      current.sources.push(item.source);
      current.health.push(item.source.health);
      if (item.source.locationKind === 'headquarters') current.headquartersCount += 1;
      continue;
    }

    byKey.set(key, {
      id: key,
      name: clusterName,
      city: item.source.city,
      region: item.source.city ? null : item.source.region,
      sumX: item.point.x,
      sumY: item.point.y,
      pub24h: item.source.pub24h,
      pub1h: item.source.pub1h,
      headquartersCount: item.source.locationKind === 'headquarters' ? 1 : 0,
      health: [item.source.health],
      sources: [item.source],
    });
  }

  return [...byKey.values()]
    .map((entry) => ({
      id: entry.id,
      name: entry.sources.length === 1 ? entry.sources[0].source : entry.name,
      city: entry.city,
      region: entry.region,
      point: {
        x: round(entry.sumX / entry.sources.length, 2),
        y: round(entry.sumY / entry.sources.length, 2),
      },
      pub24h: entry.pub24h,
      pub1h: entry.pub1h,
      sourceCount: entry.sources.length,
      headquartersCount: entry.headquartersCount,
      health: mergeHealthStatus(entry.health),
      sources: [...entry.sources].sort((a, b) => b.pub24h - a.pub24h || a.source.localeCompare(b.source)),
    }))
    .sort((a, b) => b.pub24h - a.pub24h || a.name.localeCompare(b.name));
}

function rankCounts(items: Array<{ name: string; count: number }>, limit = 8): Array<{ name: string; count: number }> {
  const byName = new Map<string, number>();
  for (const item of items) {
    byName.set(item.name, (byName.get(item.name) || 0) + item.count);
  }
  return [...byName.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function deriveSummaryFromSources(items: MapSourceMetricRow[]) {
  return {
    pub24h: items.reduce((sum, item) => sum + item.pub24h, 0),
    pub1h: items.reduce((sum, item) => sum + item.pub1h, 0),
    activeSources24h: items.length,
    rssSources24h: items.filter((item) => item.method === 'rss' || item.method === 'rss+sitemap').length,
    sitemapSources24h: items.filter((item) => item.method === 'sitemap' || item.method === 'rss+sitemap').length,
    healthySources24h: items.filter((item) => item.health === 'healthy' || item.health === 'warning').length,
    degradedSources24h: items.filter((item) => item.health === 'degraded' || item.health === 'failing').length,
  };
}

function deriveTopRegionsFromSources(items: MapSourceMetricRow[], country: string, limit = 5) {
  const byRegion = new Map<string, { count: number; sources: number; unmapped: boolean }>();
  for (const item of items) {
    const unmapped = item.locationKind === 'country-fallback';
    const name = unmapped ? 'Unmapped / National' : item.city || item.region || country;
    const current = byRegion.get(name) || { count: 0, sources: 0, unmapped: false };
    current.count += item.pub24h;
    current.sources += 1;
    current.unmapped = current.unmapped || unmapped;
    byRegion.set(name, current);
  }

  return [...byRegion.entries()]
    .map(([name, value]) => ({ name, count: value.count, sources: value.sources, unmapped: value.unmapped }))
    .sort((a, b) => Number(a.unmapped) - Number(b.unmapped) || b.count - a.count || b.sources - a.sources || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ name, count, sources }) => ({ name, count, sources }));
}

function deriveTopDegradedRegionsFromSources(items: MapSourceMetricRow[], country: string, limit = 5) {
  const byRegion = new Map<string, { degradedSources: number; sources: number; pub24h: number; degradedPub24h: number; unmapped: boolean }>();
  for (const item of items) {
    const unmapped = item.locationKind === 'country-fallback';
    const name = unmapped ? 'Unmapped / National' : item.city || item.region || country;
    const current = byRegion.get(name) || {
      degradedSources: 0,
      sources: 0,
      pub24h: 0,
      degradedPub24h: 0,
      unmapped: false,
    };
    current.sources += 1;
    current.pub24h += item.pub24h;
    current.unmapped = current.unmapped || unmapped;
    if (item.health === 'degraded' || item.health === 'failing') {
      current.degradedSources += 1;
      current.degradedPub24h += item.pub24h;
    }
    byRegion.set(name, current);
  }

  return [...byRegion.entries()]
    .filter(([, value]) => value.degradedSources > 0)
    .map(([name, value]) => ({
      name,
      degradedSources: value.degradedSources,
      sources: value.sources,
      degradedShare: value.sources > 0 ? value.degradedSources / value.sources : 0,
      degradedPub24h: value.degradedPub24h,
      unmapped: value.unmapped,
    }))
    .sort((a, b) =>
      Number(a.unmapped) - Number(b.unmapped) ||
      b.degradedShare - a.degradedShare ||
      b.degradedSources - a.degradedSources ||
      b.degradedPub24h - a.degradedPub24h ||
      a.name.localeCompare(b.name)
    )
    .slice(0, limit);
}

function deriveTopDegradedCountries(items: MapCountryMetricRow[], window: MapMetricWindow, limit = 6) {
  return [...items]
    .filter((item) => item.windows[window].degradedSources > 0)
    .sort((a, b) => {
      const aShare = itemDegradedShare(a, window);
      const bShare = itemDegradedShare(b, window);
      return bShare - aShare || b.windows[window].degradedSources - a.windows[window].degradedSources || a.country.localeCompare(b.country);
    })
    .slice(0, limit);
}

function itemDegradedShare(row: MapCountryMetricRow, window: MapMetricWindow) {
  const metrics = row.windows[window];
  return metrics.activeSources > 0 ? metrics.degradedSources / metrics.activeSources : 0;
}

function getHealthRank(status: MapSourceMetricRow['health']) {
  switch (status) {
    case 'failing':
      return 3;
    case 'degraded':
      return 2;
    case 'warning':
      return 1;
    default:
      return 0;
  }
}

const STAR_FIELD = buildStarField();

function WorldGlobeSvg({
  countries,
  world,
  layers,
  mapMode,
  window,
  rotationLon,
  selectedCountry,
  onSelectCountry,
}: {
  countries: MapCountryMetricRow[];
  world: WorldGeoJson | null;
  layers: MapLayerState;
  mapMode: MapMode;
  window: MapMetricWindow;
  rotationLon: number;
  selectedCountry: string | null;
  onSelectCountry: (country: MapCountryMetricRow) => void;
}) {
  const projection = useMemo(
    () =>
      geoOrthographic()
        .translate([GLOBE_CENTER_X, GLOBE_CENTER_Y])
        .scale(GLOBE_RADIUS)
        .rotate([-rotationLon, -GLOBE_ROTATION_LAT])
        .clipAngle(90)
        .precision(0.4),
    [rotationLon]
  );

  const pathFactory = useMemo(() => geoPath(projection), [projection]);
  const globeSpherePath = useMemo(() => pathFactory({ type: 'Sphere' } as never) || '', [pathFactory]);
  const globeGraticulePath = useMemo(() => pathFactory(geoGraticule10() as never) || '', [pathFactory]);

  const landPaths = useMemo(
    () =>
      (world?.features || [])
        .map((feature, index) => ({
          id: String(feature.id || feature.properties?.name || index),
          name: feature.properties?.name || 'Unknown',
          d: pathFactory(feature as never) || '',
        }))
        .filter((feature) => feature.d),
    [world, pathFactory]
  );

  const visibleCountries = useMemo(
    () =>
      countries
        .map((row) => ({ row, point: projectToGlobe(row.lat, row.lon, rotationLon) }))
        .filter((item) => item.point.visible)
        .sort((a, b) => getCountryWindowMetrics(a.row, window).published - getCountryWindowMetrics(b.row, window).published),
    [countries, rotationLon, window]
  );

  const flowPaths = useMemo(() => {
    const candidates = [...visibleCountries]
      .sort((a, b) => getCountryWindowMetrics(b.row, window).published - getCountryWindowMetrics(a.row, window).published)
      .slice(0, 10);
    const pairs = new Map<string, { d: string; width: number; opacity: number }>();

    for (let index = 0; index < candidates.length; index += 1) {
      const current = candidates[index];
      const neighbors = candidates
        .filter((_, neighborIndex) => neighborIndex !== index)
        .map((neighbor) => ({
          neighbor,
          distance: Math.hypot(current.point.x - neighbor.point.x, current.point.y - neighbor.point.y),
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 2);

      for (const { neighbor, distance } of neighbors) {
        const key = [current.row.country, neighbor.row.country].sort().join('::');
        if (!pairs.has(key)) {
          const weight = Math.min(
            getCountryWindowMetrics(current.row, window).published,
            getCountryWindowMetrics(neighbor.row, window).published
          );
          pairs.set(key, {
            d: buildFlowPath(current.point, neighbor.point),
            width: round(Math.max(1.1, Math.min(2.8, Math.sqrt(weight) / 24)), 2),
            opacity: round(Math.max(0.16, 0.34 - distance / 1600), 2),
          });
        }
      }
    }

    return [...pairs.values()];
  }, [visibleCountries]);

  const labelCandidates = useMemo(() => {
    return buildNonOverlappingLabels(
      [...visibleCountries]
        .sort((a, b) => getCountryWindowMetrics(b.row, window).published - getCountryWindowMetrics(a.row, window).published)
        .slice(0, 14)
        .map(({ row, point }) => ({
          row,
          point,
          x: round(point.x + (point.x >= GLOBE_CENTER_X ? 16 : -16), 2),
          y: round(point.y - 12, 2),
          anchor: (point.x >= GLOBE_CENTER_X ? 'start' : 'end') as 'start' | 'end',
        })),
      68
    );
  }, [visibleCountries, window]);

  return (
    <svg viewBox={`0 0 ${GLOBE_WIDTH} ${GLOBE_HEIGHT}`} className="map-svg-stage" role="img" aria-label="Global publishing globe">
      <defs>
        <radialGradient id="globe-ocean-fill" cx="34%" cy="28%" r="76%">
          <stop offset="0%" stopColor="#173e73" />
          <stop offset="48%" stopColor="#0a1d39" />
          <stop offset="100%" stopColor="#050913" />
        </radialGradient>
        <linearGradient id="land-fill" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#16324d" />
          <stop offset="60%" stopColor="#0b1d31" />
          <stop offset="100%" stopColor="#08121d" />
        </linearGradient>
        <radialGradient id="globe-aura-fill" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(108,229,255,0.16)" />
          <stop offset="65%" stopColor="rgba(108,229,255,0.06)" />
          <stop offset="100%" stopColor="rgba(108,229,255,0)" />
        </radialGradient>
        <filter id="bubble-glow" x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="9" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect x="0" y="0" width={GLOBE_WIDTH} height={GLOBE_HEIGHT} fill="#040812" />

      {STAR_FIELD.map((star, index) => (
        <circle key={index} cx={star.x} cy={star.y} r={star.r} fill={`rgba(188,236,255,${star.opacity})`} />
      ))}

      <ellipse
        cx={GLOBE_CENTER_X}
        cy={GLOBE_CENTER_Y + GLOBE_RADIUS + 76}
        rx={GLOBE_RADIUS * 0.84}
        ry={70}
        fill="rgba(4, 10, 24, 0.82)"
      />

      {layers.glow ? (
        <path
          d={globeSpherePath}
          fill="url(#globe-aura-fill)"
          transform="scale(1.08)"
          style={{ transformOrigin: `${GLOBE_CENTER_X}px ${GLOBE_CENTER_Y}px` }}
        />
      ) : null}
      <path d={globeSpherePath} fill="url(#globe-ocean-fill)" />

      {layers.glow ? (
        <ellipse
          cx={GLOBE_CENTER_X - 160}
          cy={GLOBE_CENTER_Y - 148}
          rx={GLOBE_RADIUS * 0.56}
          ry={140}
          fill="rgba(156, 224, 255, 0.08)"
          transform={`rotate(-18 ${GLOBE_CENTER_X - 160} ${GLOBE_CENTER_Y - 148})`}
        />
      ) : null}

      {layers.graticule ? <path d={globeGraticulePath} fill="none" stroke="rgba(112, 201, 255, 0.11)" strokeWidth="1.1" /> : null}

      {layers.land ? (
        <>
          {layers.glow
            ? landPaths.map((feature) => (
                <path key={`${feature.id}-glow`} d={feature.d} fill="none" stroke="rgba(88, 204, 255, 0.12)" strokeWidth="3.6" />
              ))
            : null}
          {landPaths.map((feature) => (
            <path key={feature.id} d={feature.d} fill="url(#land-fill)" stroke="rgba(135, 228, 255, 0.12)" strokeWidth="0.9">
              <title>{feature.name}</title>
            </path>
          ))}
        </>
      ) : null}

      <path d={globeSpherePath} fill="none" stroke="rgba(146, 232, 255, 0.16)" strokeWidth="1.4" />
      {layers.glow ? (
        <path
          d={globeSpherePath}
          fill="none"
          stroke="rgba(47, 159, 255, 0.12)"
          strokeWidth="12"
          strokeLinecap="round"
          opacity="0.26"
        />
      ) : null}

      {layers.flows
        ? flowPaths.map((flow, index) => (
            <path
              key={`flow-${index}`}
              d={flow.d}
              fill="none"
              stroke="rgba(99, 220, 255, 0.18)"
              strokeWidth={flow.width}
              opacity={flow.opacity}
              strokeLinecap="round"
            />
          ))
        : null}

      {visibleCountries.map(({ row, point }) => {
        const windowMetrics = getCountryWindowMetrics(row, window);
        const radius = Math.max(4, Math.min(18, Math.sqrt(windowMetrics.published) / 3.8));
        const hitRadius = Math.max(18, radius * 2.4);
        const color = getCountryBubbleColor(row, mapMode, window);
        const active = selectedCountry === row.country;
        return (
          <g key={row.country}>
            <circle
              cx={point.x}
              cy={point.y}
              r={hitRadius}
              fill="transparent"
              className="map-hit-dot"
              onClick={() => onSelectCountry(row)}
            />
            {layers.glow ? <circle cx={point.x} cy={point.y} r={radius * 2.6} fill={color} opacity={0.05} filter="url(#bubble-glow)" /> : null}
            <circle cx={point.x} cy={point.y} r={radius * 1.42} fill={color} opacity={layers.glow ? 0.14 : 0.08} />
            <circle
              cx={point.x}
              cy={point.y}
              r={radius}
              fill={color}
              stroke={active ? '#ffffff' : 'rgba(236,248,255,0.86)'}
              strokeWidth={active ? 2.2 : 1}
              className="map-hit-dot"
              onClick={() => onSelectCountry(row)}
            >
              <title>{`${row.country}\n${formatNumber(windowMetrics.published)} / ${mapWindowDescriptor(window)}\n${formatNumber(windowMetrics.activeSources)} active sources`}</title>
            </circle>
            <circle cx={point.x} cy={point.y} r={Math.max(1.4, radius * 0.28)} fill="#ffffff" opacity={0.72} />
          </g>
        );
      })}

      {layers.labels
        ? labelCandidates.map(({ row, point, x, y, anchor }) => (
            <g key={`${row.country}-label`} className="map-hit-dot" onClick={() => onSelectCountry(row)}>
              <line
                x1={point.x}
                y1={point.y}
                x2={anchor === 'start' ? x - 6 : x + 6}
                y2={y - 5}
                stroke="rgba(170, 232, 255, 0.3)"
                strokeWidth="1"
              />
              <text x={x} y={y} textAnchor={anchor} className="map-country-label">
                {row.country}
              </text>
            </g>
          ))
        : null}
    </svg>
  );
}

function CountryPlaneSvg({
  country,
  world,
  sources,
  layers,
  viewport,
  onViewportChange,
  selectedClusterId,
  selectedSourceId,
  onSelectCluster,
}: {
  country: MapCountryMetricRow;
  world: WorldGeoJson | null;
  sources: MapSourceMetricRow[];
  layers: MapLayerState;
  viewport: CountryViewport;
  onViewportChange: (viewport: CountryViewport) => void;
  selectedClusterId: string | null;
  selectedSourceId: string | null;
  onSelectCluster: (cluster: CountrySourceCluster) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    startTx: number;
    startTy: number;
    moved: boolean;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    startTx: 0,
    startTy: 0,
    moved: false,
  });
  const suppressClickUntilRef = useRef(0);
  const countryFeature = useMemo(() => findWorldFeature(world, country.country), [world, country.country]);
  const displayCountryFeature = useMemo(() => {
    const selected = selectDisplayFeature(countryFeature, sources);
    if (selected) return selected;
    return buildSyntheticCountryFeature(sources);
  }, [countryFeature, sources]);

  const projection = useMemo(() => {
    if (!displayCountryFeature) return null;
    return geoMercator().fitExtent(
      [
        [MAP_SAFE_LEFT + 36, MAP_SAFE_TOP + 42],
        [GLOBE_WIDTH - MAP_SAFE_RIGHT - 44, GLOBE_HEIGHT - MAP_SAFE_BOTTOM - 52],
      ],
      displayCountryFeature as never
    );
  }, [displayCountryFeature]);

  const pathFactory = useMemo(() => (projection ? geoPath(projection) : null), [projection]);
  const countryPath = useMemo(
    () => (pathFactory && displayCountryFeature ? pathFactory(displayCountryFeature as never) || '' : ''),
    [pathFactory, displayCountryFeature]
  );
  const projectedCountryBounds = useMemo(() => {
    if (!pathFactory || !displayCountryFeature) return null;
    return pathFactory.bounds(displayCountryFeature as never);
  }, [pathFactory, displayCountryFeature]);

  const bounds = useMemo(() => {
    const lats = sources.map((source) => source.lat);
    const lons = sources.map((source) => source.lon);
    return {
      minLat: Math.min(...lats, 0) - 0.6,
      maxLat: Math.max(...lats, 0) + 0.6,
      minLon: Math.min(...lons, 0) - 0.8,
      maxLon: Math.max(...lons, 0) + 0.8,
    };
  }, [sources]);

  const projected = useMemo(
    () =>
      sources
        .map((source) => {
          if (projection) {
            const point = projection([source.lon, source.lat]);
            if (!point) return null;
            return {
              source,
              point: {
                x: round(point[0], 2),
                y: round(point[1], 2),
              },
            };
          }
          return {
            source,
            point: projectCountryToPlane(source, bounds),
          };
        })
        .filter((item): item is { source: MapSourceMetricRow; point: { x: number; y: number } } => Boolean(item)),
    [sources, projection, bounds]
  );

  const plotted = useMemo(() => spreadCountryPoints(projected), [projected]);

  const clusters = useMemo(() => buildCountrySourceClusters(plotted), [plotted]);

  const clusterLabels = useMemo(() => {
    return buildNonOverlappingLabels(
      [...clusters]
        .sort((a, b) => b.pub24h - a.pub24h)
        .slice(0, 14)
        .map((cluster) => ({
          cluster,
          point: cluster.point,
          x: round(cluster.point.x + 12, 2),
          y: round(cluster.point.y - 10, 2),
        })),
      56
    );
  }, [clusters]);

  const contentBounds = useMemo(() => {
    const fallback = {
      minX: MAP_SAFE_LEFT + 36,
      maxX: GLOBE_WIDTH - MAP_SAFE_RIGHT - 36,
      minY: MAP_SAFE_TOP + 36,
      maxY: GLOBE_HEIGHT - MAP_SAFE_BOTTOM - 36,
    };

    const xs = clusters.map((cluster) => cluster.point.x);
    const ys = clusters.map((cluster) => cluster.point.y);

    if (projectedCountryBounds) {
      xs.push(projectedCountryBounds[0][0], projectedCountryBounds[1][0]);
      ys.push(projectedCountryBounds[0][1], projectedCountryBounds[1][1]);
    }

    if (xs.length === 0 || ys.length === 0) {
      return fallback;
    }

    return {
      minX: Math.min(...xs) - 56,
      maxX: Math.max(...xs) + 56,
      minY: Math.min(...ys) - 56,
      maxY: Math.max(...ys) + 56,
    };
  }, [clusters, projectedCountryBounds]);

  function clampViewport(next: CountryViewport): CountryViewport {
    const frameLeft = MAP_SAFE_LEFT;
    const frameTop = MAP_SAFE_TOP;
    const frameWidth = GLOBE_WIDTH - MAP_SAFE_LEFT - MAP_SAFE_RIGHT;
    const frameHeight = GLOBE_HEIGHT - MAP_SAFE_TOP - MAP_SAFE_BOTTOM;
    const contentWidth = contentBounds.maxX - contentBounds.minX;
    const contentHeight = contentBounds.maxY - contentBounds.minY;
    const scale = clamp(next.scale, COUNTRY_ZOOM_MIN, COUNTRY_ZOOM_MAX);

    let tx = next.tx;
    let ty = next.ty;

    if (contentWidth * scale <= frameWidth) {
      tx = frameLeft + (frameWidth - contentWidth * scale) / 2 - contentBounds.minX * scale;
    } else {
      const minTx = frameLeft + frameWidth - contentBounds.maxX * scale;
      const maxTx = frameLeft - contentBounds.minX * scale;
      tx = clamp(tx, minTx, maxTx);
    }

    if (contentHeight * scale <= frameHeight) {
      ty = frameTop + (frameHeight - contentHeight * scale) / 2 - contentBounds.minY * scale;
    } else {
      const minTy = frameTop + frameHeight - contentBounds.maxY * scale;
      const maxTy = frameTop - contentBounds.minY * scale;
      ty = clamp(ty, minTy, maxTy);
    }

    return {
      scale: round(scale, 4),
      tx: round(tx, 2),
      ty: round(ty, 2),
    };
  }

  function applyViewport(next: CountryViewport) {
    onViewportChange(clampViewport(next));
  }

  function handleWheel(event: ReactWheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * GLOBE_WIDTH;
    const py = ((event.clientY - rect.top) / rect.height) * GLOBE_HEIGHT;
    const factor = event.deltaY < 0 ? COUNTRY_ZOOM_STEP : 1 / COUNTRY_ZOOM_STEP;
    const nextScale = clamp(viewport.scale * factor, COUNTRY_ZOOM_MIN, COUNTRY_ZOOM_MAX);
    if (Math.abs(nextScale - viewport.scale) < 0.0001) return;

    const worldX = (px - viewport.tx) / viewport.scale;
    const worldY = (py - viewport.ty) / viewport.scale;
    applyViewport({
      scale: nextScale,
      tx: px - worldX * nextScale,
      ty: py - worldY * nextScale,
    });
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (viewport.scale <= 1.001 || event.button !== 0) return;
    dragStateRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      startTx: viewport.tx,
      startTy: viewport.ty,
      moved: false,
    };
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragStateRef.current;
    if (!drag.active) return;
    const svg = svgRef.current;
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const dx = ((event.clientX - drag.startX) / rect.width) * GLOBE_WIDTH;
    const dy = ((event.clientY - drag.startY) / rect.height) * GLOBE_HEIGHT;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      drag.moved = true;
      suppressClickUntilRef.current = Date.now() + 180;
    }
    applyViewport({
      scale: viewport.scale,
      tx: drag.startTx + dx,
      ty: drag.startTy + dy,
    });
  }

  function endPointerInteraction(event: ReactPointerEvent<SVGSVGElement>) {
    if (dragStateRef.current.active) {
      dragStateRef.current.active = false;
      setIsDragging(false);
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleSelectCluster(cluster: CountrySourceCluster) {
    if (Date.now() < suppressClickUntilRef.current) return;
    onSelectCluster(cluster);
  }

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 1800 1120"
      className={`map-svg-stage map-svg-stage--country ${viewport.scale > 1.001 ? 'is-zoomed' : ''} ${isDragging ? 'is-dragging' : ''}`}
      role="img"
      aria-label={`${country.country} source map`}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPointerInteraction}
      onPointerCancel={endPointerInteraction}
      style={{ touchAction: 'none' }}
    >
      <defs>
        <linearGradient id="plane-fill" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#071120" />
          <stop offset="55%" stopColor="#08101b" />
          <stop offset="100%" stopColor="#050913" />
        </linearGradient>
        <linearGradient id="country-fill" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgba(21, 58, 90, 0.92)" />
          <stop offset="100%" stopColor="rgba(8, 22, 36, 0.9)" />
        </linearGradient>
        <clipPath id="country-map-clip">
          <rect
            x={MAP_SAFE_LEFT}
            y={MAP_SAFE_TOP}
            width={GLOBE_WIDTH - MAP_SAFE_LEFT - MAP_SAFE_RIGHT}
            height={GLOBE_HEIGHT - MAP_SAFE_TOP - MAP_SAFE_BOTTOM}
            rx="28"
          />
        </clipPath>
      </defs>

      <rect x="0" y="0" width="1800" height="1120" fill="url(#plane-fill)" />

      {layers.graticule ? (
        <g opacity="0.38">
          {Array.from({ length: 9 }).map((_, index) => {
            const span = GLOBE_WIDTH - MAP_SAFE_LEFT - MAP_SAFE_RIGHT;
            const x = MAP_SAFE_LEFT + (index * span) / 8;
            return <line key={`vx-${index}`} x1={x} y1={MAP_SAFE_TOP} x2={x} y2={GLOBE_HEIGHT - MAP_SAFE_BOTTOM} stroke="rgba(102, 196, 255, 0.07)" strokeWidth="1" />;
          })}
          {Array.from({ length: 6 }).map((_, index) => {
            const span = GLOBE_HEIGHT - MAP_SAFE_TOP - MAP_SAFE_BOTTOM;
            const y = MAP_SAFE_TOP + (index * span) / 5;
            return <line key={`hy-${index}`} x1={MAP_SAFE_LEFT} y1={y} x2={GLOBE_WIDTH - MAP_SAFE_RIGHT} y2={y} stroke="rgba(102, 196, 255, 0.07)" strokeWidth="1" />;
          })}
        </g>
      ) : null}

      <rect
        x={MAP_SAFE_LEFT}
        y={MAP_SAFE_TOP}
        width={GLOBE_WIDTH - MAP_SAFE_LEFT - MAP_SAFE_RIGHT}
        height={GLOBE_HEIGHT - MAP_SAFE_TOP - MAP_SAFE_BOTTOM}
        rx="28"
        fill="none"
        stroke="rgba(126, 226, 255, 0.12)"
        strokeWidth="1.1"
      />

      <g
        clipPath="url(#country-map-clip)"
        transform={`translate(${viewport.tx} ${viewport.ty}) scale(${viewport.scale})`}
      >
      {layers.land && countryPath ? (
        <>
          {layers.glow ? <path d={countryPath} fill="none" stroke="rgba(88, 204, 255, 0.14)" strokeWidth={6 / viewport.scale} /> : null}
          <path d={countryPath} fill="url(#country-fill)" stroke="rgba(150, 232, 255, 0.22)" strokeWidth={1.3 / viewport.scale} />
        </>
      ) : null}

      {clusters.map((cluster) => {
        const point = cluster.point;
        const radius = Math.max(6, Math.min(22, Math.sqrt(cluster.pub24h) / 2.8 + cluster.sourceCount * 0.8));
        const hitRadius = Math.max(14, radius * 2.1);
        const active = selectedClusterId === cluster.id || cluster.sources.some((source) => source.sourceId === selectedSourceId);
        return (
          <g key={cluster.id}>
            <circle
              cx={point.x}
              cy={point.y}
              r={hitRadius}
              fill="transparent"
              className="map-hit-dot"
              onClick={() => handleSelectCluster(cluster)}
            />
            {layers.glow ? <circle cx={point.x} cy={point.y} r={radius * 2.6} fill={getHealthColor(cluster.health)} opacity={0.05} filter="url(#bubble-glow)" /> : null}
            <circle cx={point.x} cy={point.y} r={radius * 1.44} fill={getHealthColor(cluster.health)} opacity={layers.glow ? 0.14 : 0.08} />
            <circle
              cx={point.x}
              cy={point.y}
              r={radius}
              fill={getHealthColor(cluster.health)}
              stroke={active ? '#ffffff' : 'rgba(239,248,255,0.86)'}
              strokeWidth={active ? 2 / viewport.scale : 0.9 / viewport.scale}
              className="map-hit-dot"
              onClick={() => handleSelectCluster(cluster)}
            >
              <title>{`${cluster.name}\n${formatNumber(cluster.pub24h)} / 24h\n${formatNumber(cluster.pub1h)} / 1h\n${cluster.sourceCount} sources`}</title>
            </circle>
            <circle cx={point.x} cy={point.y} r={Math.max(1.1, radius * 0.24)} fill="#ffffff" opacity={0.72} />
            {cluster.sourceCount > 1 ? (
              <text x={point.x} y={point.y + 4} textAnchor="middle" className="map-cluster-count">
                {cluster.sourceCount}
              </text>
            ) : null}
          </g>
        );
      })}

      {layers.labels
        ? clusterLabels.map(({ cluster, point, x, y }) => (
            <g key={`${cluster.id}-label`} style={{ pointerEvents: 'none' }}>
              <line x1={point.x} y1={point.y} x2={x - 6} y2={y - 4} stroke="rgba(170, 232, 255, 0.24)" strokeWidth={1 / viewport.scale} />
              <text x={x} y={y} className="map-source-label">
                {cluster.sourceCount > 1 ? `${cluster.name} (${cluster.sourceCount})` : cluster.name}
              </text>
            </g>
          ))
        : null}
      </g>
    </svg>
  );
}

export function MapView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [mapMode, setMapMode] = useState<MapMode>('countries');
  const [mapWindow, setMapWindow] = useState<MapMetricWindow>('24h');
  const [leftTab, setLeftTab] = useState<LeftTab>('overview');
  const [detailTab, setDetailTab] = useState<DetailTab>('metrics');
  const [benchmarkOpen, setBenchmarkOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<MapCountryMetricRow | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<CountrySourceCluster | null>(null);
  const [selectedSource, setSelectedSource] = useState<MapSourceMetricRow | null>(null);
  const [selectedPublisher, setSelectedPublisher] = useState<MapPublisherMetricRow | null>(null);
  const [countryViewport, setCountryViewport] = useState<CountryViewport>(DEFAULT_COUNTRY_VIEWPORT);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [sceneOrigin, setSceneOrigin] = useState<{ x: number; y: number }>({ x: 56, y: 52 });
  const [layers, setLayers] = useState<MapLayerState>(DEFAULT_MAP_LAYERS);
  const countriesState = useRemoteJson<MapCountryMetricsResponse>(`/api/customer/dashboard/map/countries?window=${mapWindow}`);
  const publishersState = useRemoteJson<MapPublishersResponse>(`/api/customer/dashboard/map/publishers?window=${mapWindow}`);
  const benchmarkState = useRemoteJson<CountryBenchmarkResponse>('/api/customer/dashboard/benchmark');
  const worldState = useRemoteJson<WorldGeoJson>('/world.geojson');
  const countryName = selectedCountry?.country || null;
  const sourcesState = useRemoteJson<MapCountrySourcesResponse>(
    countryName ? `/api/customer/dashboard/map/countries/${encodeURIComponent(countryName)}/sources` : null
  );
  const sourceDetailState = useRemoteJson<MapSourceDetailResponse>(
    selectedSource?.sourceId ? `/api/customer/dashboard/map/sources/${encodeURIComponent(selectedSource.sourceId)}` : null
  );

  const totals = countriesState.data?.totals || null;
  const topCountries = countriesState.data?.countries.slice(0, 8) || [];
  const topPublishers = publishersState.data?.publishers.slice(0, 8) || [];
  const selectedCountryTopPublishers =
    (selectedCountry ? sourcesState.data?.topPublishers || selectedCountry.topPublishers || [] : []);
  const selectedCountryTopRegions = selectedCountry ? sourcesState.data?.topRegions || [] : [];
  const selectedCountryHourly = selectedCountry ? sourcesState.data?.hourly24h || [] : [];
  const sourceDetail = sourceDetailState.data;
  const sceneMode = selectedCountry && sourcesState.data ? 'country' : 'globe';
  const globeRotationLon = useIdleRotation(motionEnabled && !selectedCountry && !interactionPaused);
  const healthCountries = countriesState.data?.countries || [];
  const benchmark = benchmarkState.data?.storage === 'postgres' ? benchmarkState.data : null;
  const benchmarkRows = benchmark?.countries.slice(0, 14) || [];
  const latestMapUpdatedAt = Math.max(
    countriesState.updatedAt || 0,
    publishersState.updatedAt || 0,
    sourcesState.updatedAt || 0,
    sourceDetailState.updatedAt || 0
  ) || null;
  const latestMapUpdatedLabel = latestMapUpdatedAt
    ? new Date(latestMapUpdatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;
  const benchmarkGeneratedLabel = benchmark?.generatedAt
    ? formatRelative(benchmark.generatedAt)
    : null;
  const activeWindowLabel = mapWindowLabel(mapWindow);
  const activeWindowDescriptor = mapWindowDescriptor(mapWindow);
  const totalWindowMetrics = totals?.windows[mapWindow] || null;
  const searchMode = !selectedCountry && mapMode === 'publishers' ? 'publishers' : 'countries';
  const normalizedSearchQuery = normalizeCountryName(searchQuery);
  const rawUrlMode = searchParams.get('mode');
  const rawUrlWindow = searchParams.get('window');
  const rawUrlPanel = searchParams.get('panel');
  const rawUrlDetail = searchParams.get('detail');
  const urlMode: MapMode = isMapMode(rawUrlMode) ? rawUrlMode : 'countries';
  const urlWindow: MapMetricWindow = isMapMetricWindow(rawUrlWindow) ? rawUrlWindow : '24h';
  const urlCountry = searchParams.get('country')?.trim() || null;
  const urlPublisher = searchParams.get('publisher')?.trim() || null;
  const urlSource = searchParams.get('source')?.trim() || null;
  const urlLeftTab: LeftTab = isLeftTab(rawUrlPanel) ? rawUrlPanel : 'overview';
  const urlDetailTab: DetailTab = isDetailTab(rawUrlDetail) ? rawUrlDetail : 'metrics';
  const urlBenchmarkOpen = searchParams.get('benchmark') !== 'collapsed';
  const urlLayers = parseLayerState(searchParams.get('layers'));

  const healthTotals = useMemo(() => ({
    healthySources24h: healthCountries.reduce((sum, item) => sum + item.windows[mapWindow].healthySources, 0),
    degradedSources24h: healthCountries.reduce((sum, item) => sum + item.windows[mapWindow].degradedSources, 0),
    countriesWithIssues: healthCountries.filter((item) => item.windows[mapWindow].degradedSources > 0).length,
  }), [healthCountries, mapWindow]);
  const selectedPublisherWindowMetrics = selectedPublisher ? getPublisherWindowMetrics(selectedPublisher, mapWindow) : null;
  const countryLookup = useMemo(() => {
    const lookup = new Map<string, MapCountryMetricRow>();
    for (const item of countriesState.data?.countries || []) {
      lookup.set(normalizeCountryName(item.country), item);
      for (const alias of COUNTRY_ALIASES[item.country] || []) {
        lookup.set(normalizeCountryName(alias), item);
      }
    }
    return lookup;
  }, [countriesState.data]);
  const normalizedUrlCountry = urlCountry ? normalizeCountryName(urlCountry) : null;
  const desiredCountryMatch = normalizedUrlCountry
    ? countryLookup.get(normalizedUrlCountry) || null
    : null;
  const desiredCountryResolved = !urlCountry
    || (selectedCountry ? normalizeCountryName(selectedCountry.country) === normalizedUrlCountry : false)
    || (countriesState.data !== null && !desiredCountryMatch);
  const desiredPublisherResolved = urlMode !== 'publishers'
    || !urlPublisher
    || selectedPublisher?.publisher === urlPublisher
    || (publishersState.data !== null && !publishersState.data.publishers.some((item) => item.publisher === urlPublisher));
  const desiredSourceResolved = !urlSource
    || !urlCountry
    || selectedSource?.sourceId === urlSource
    || (desiredCountryResolved && !selectedCountry)
    || (sourcesState.data !== null && !sourcesState.data.sources.some((item) => item.sourceId === urlSource));
  const urlSyncReady = Boolean(
    countriesState.data
    && publishersState.data
    && desiredCountryResolved
    && desiredPublisherResolved
    && desiredSourceResolved
  );

  useEffect(() => {
    if (urlMode !== mapMode) {
      setMapMode(urlMode);
    }
    if (urlWindow !== mapWindow) {
      setMapWindow(urlWindow);
    }
    if (urlLeftTab !== leftTab) {
      setLeftTab(urlLeftTab);
    }
    if (urlDetailTab !== detailTab) {
      setDetailTab(urlDetailTab);
    }
    if (urlBenchmarkOpen !== benchmarkOpen) {
      setBenchmarkOpen(urlBenchmarkOpen);
    }
    if (urlLayers && !sameLayerState(urlLayers, layers)) {
      setLayers(urlLayers);
    }
    if (!urlLayers && !sameLayerState(DEFAULT_MAP_LAYERS, layers)) {
      setLayers(DEFAULT_MAP_LAYERS);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!countriesState.data) return;

    if (!urlCountry) {
      if (selectedCountry) {
        setSceneOrigin({ x: 50, y: 52 });
        setSelectedCountry(null);
        setSelectedCluster(null);
        setSelectedSource(null);
        setCountryViewport(DEFAULT_COUNTRY_VIEWPORT);
      }
      return;
    }

    if (!desiredCountryMatch) return;
    if (selectedCountry?.country === desiredCountryMatch.country) return;

    const point = projectToGlobe(desiredCountryMatch.lat, desiredCountryMatch.lon, globeRotationLon);
    setSceneOrigin({
      x: round((point.x / GLOBE_WIDTH) * 100, 2),
      y: round((point.y / GLOBE_HEIGHT) * 100, 2),
    });
    setSelectedCountry(desiredCountryMatch);
    setSelectedCluster(null);
    setSelectedSource(null);
    setCountryViewport(DEFAULT_COUNTRY_VIEWPORT);
  }, [searchParams, countriesState.data, countryLookup, globeRotationLon]);

  useEffect(() => {
    if (mapMode !== 'publishers' || !publishersState.data) return;
    if (urlPublisher) {
      const match = publishersState.data.publishers.find((item) => item.publisher === urlPublisher);
      if (match && selectedPublisher?.publisher !== match.publisher) {
        setSelectedPublisher(match);
      }
      return;
    }

    if (selectedPublisher?.publisher) {
      const refreshed = publishersState.data.publishers.find((item) => item.publisher === selectedPublisher.publisher);
      if (refreshed && refreshed !== selectedPublisher) {
        setSelectedPublisher(refreshed);
        return;
      }
    }

    if (!selectedPublisher && publishersState.data.publishers.length > 0) {
      setSelectedPublisher(publishersState.data.publishers[0]);
    }
  }, [mapMode, publishersState.data, selectedPublisher, urlPublisher]);

  useEffect(() => {
    if (!urlCountry || !urlSource || !sourcesState.data) return;
    if (selectedSource?.sourceId === urlSource) return;
    const match = sourcesState.data.sources.find((item) => item.sourceId === urlSource);
    if (match) {
      setSelectedCluster(null);
      setSelectedSource(match);
    }
  }, [searchParams, sourcesState.data]);

  useEffect(() => {
    if (!urlSource && selectedSource) {
      setSelectedSource(null);
    }
  }, [searchParams]);

  const globeCountries = useMemo<MapCountryMetricRow[]>(() => {
    if (mapMode !== 'publishers' || !selectedPublisher) {
      return countriesState.data?.countries || [];
    }

    return selectedPublisher.countries.map((countryRow) => ({
      country: countryRow.country,
      countryCode: countryRow.countryCode,
      lat: countryRow.lat,
      lon: countryRow.lon,
      pub24h: countryRow.pub24h,
      pub1h: 0,
      fresh24h: 0,
      late24h: 0,
      firstSeen24h: 0,
      lateShare: 0,
      activeSources24h: countryRow.activeSources24h,
      rssSources24h: 0,
      sitemapSources24h: 0,
      healthySources24h: countryRow.healthySources24h,
      degradedSources24h: countryRow.degradedSources24h,
      windows: {
        '1h': {
          published: countryRow.windows['1h'].published,
          fresh: 0,
          late: 0,
          firstSeen: 0,
          lateShare: 0,
          activeSources: countryRow.windows['1h'].activeSources,
          rssSources: 0,
          sitemapSources: 0,
          healthySources: countryRow.windows['1h'].healthySources,
          degradedSources: countryRow.windows['1h'].degradedSources,
        },
        '24h': {
          published: countryRow.windows['24h'].published,
          fresh: 0,
          late: 0,
          firstSeen: 0,
          lateShare: 0,
          activeSources: countryRow.windows['24h'].activeSources,
          rssSources: 0,
          sitemapSources: 0,
          healthySources: countryRow.windows['24h'].healthySources,
          degradedSources: countryRow.windows['24h'].degradedSources,
        },
        '7d': {
          published: countryRow.windows['7d'].published,
          fresh: 0,
          late: 0,
          firstSeen: 0,
          lateShare: 0,
          activeSources: countryRow.windows['7d'].activeSources,
          rssSources: 0,
          sitemapSources: 0,
          healthySources: countryRow.windows['7d'].healthySources,
          degradedSources: countryRow.windows['7d'].degradedSources,
        },
      },
      topSources: [],
      topPublishers: [{ name: selectedPublisher.publisher, count: countryRow.pub24h }],
    }));
  }, [mapMode, selectedPublisher, countriesState.data]);

  const displayedCountrySources = useMemo(() => {
    const items = sourcesState.data?.sources || [];
    if (mapMode !== 'publishers' || !selectedPublisher) return items;
    return items.filter((item) => (item.publisher || item.source) === selectedPublisher.publisher);
  }, [mapMode, selectedPublisher, sourcesState.data]);

  const derivedCountrySummary = useMemo(() => deriveSummaryFromSources(displayedCountrySources), [displayedCountrySources]);
  const derivedTopSources = useMemo(
    () => rankCounts(displayedCountrySources.map((item) => ({ name: item.source, count: item.pub24h })), 8),
    [displayedCountrySources]
  );
  const derivedTopRegions = useMemo(
    () => selectedCountry ? deriveTopRegionsFromSources(displayedCountrySources, selectedCountry.country, 8) : [],
    [displayedCountrySources, selectedCountry]
  );
  const derivedTopDegradedRegions = useMemo(
    () => selectedCountry ? deriveTopDegradedRegionsFromSources(displayedCountrySources, selectedCountry.country, 8) : [],
    [displayedCountrySources, selectedCountry]
  );
  const derivedTopDegradedSources = useMemo(
    () =>
      [...displayedCountrySources]
        .filter((item) => item.health === 'degraded' || item.health === 'failing')
        .sort((a, b) => getHealthRank(b.health) - getHealthRank(a.health) || b.pub24h - a.pub24h || a.source.localeCompare(b.source))
        .slice(0, 8),
    [displayedCountrySources]
  );
  const selectedCountryTopRegionsDisplay = mapMode === 'health'
    ? []
    : mapMode === 'publishers'
      ? derivedTopRegions
      : selectedCountryTopRegions;
  const selectedCountryTopSourcesDisplay = mapMode === 'health'
    ? []
    : mapMode === 'publishers'
      ? derivedTopSources
      : (sourcesState.data?.topSources || []);
  const selectedCountrySummaryDisplay = derivedCountrySummary;
  const topDegradedCountries = useMemo(() => deriveTopDegradedCountries(healthCountries, mapWindow, 6), [healthCountries, mapWindow]);
  const selectedPublisherReliability = selectedPublisherWindowMetrics
    ? selectedPublisherWindowMetrics.activeSources > 0
      ? selectedPublisherWindowMetrics.healthySources / selectedPublisherWindowMetrics.activeSources
      : 0
    : 0;
  const searchResults = useMemo<MapSearchResult[]>(() => {
    if (searchMode === 'publishers') {
      const items = publishersState.data?.publishers || [];
      const filtered = normalizedSearchQuery
        ? items.filter((item) => normalizeCountryName(item.publisher).includes(normalizedSearchQuery))
        : items;
      return filtered.slice(0, 8).map((item) => ({
        kind: 'publisher',
        key: `publisher:${item.publisher}`,
        title: item.publisher,
        subtitle: `${formatNumber(getPublisherWindowMetrics(item, mapWindow).published)} published · ${formatNumber(getPublisherWindowMetrics(item, mapWindow).activeCountries)} countries`,
        publisher: item,
      }));
    }

    const items = countriesState.data?.countries || [];
    const filtered = normalizedSearchQuery
      ? items.filter((item) => {
          const normalizedCountry = normalizeCountryName(item.country);
          if (normalizedCountry.includes(normalizedSearchQuery)) return true;
          return (COUNTRY_ALIASES[item.country] || []).some((alias) => normalizeCountryName(alias).includes(normalizedSearchQuery));
        })
      : items;
    return filtered.slice(0, 8).map((item) => ({
      kind: 'country',
      key: `country:${item.country}`,
      title: item.country,
      subtitle: `${formatNumber(getCountryWindowMetrics(item, mapWindow).published)} published · ${formatNumber(getCountryWindowMetrics(item, mapWindow).activeSources)} active sources`,
      country: item,
    }));
  }, [searchMode, publishersState.data, countriesState.data, normalizedSearchQuery, mapWindow]);
  const selectedClusterSourcesDisplay = useMemo(() => {
    if (!selectedCluster) return [];
    const items = [...selectedCluster.sources];
    if (mapMode === 'health') {
      return items.sort(
        (a, b) => getHealthRank(b.health) - getHealthRank(a.health) || b.pub24h - a.pub24h || a.source.localeCompare(b.source)
      );
    }
    return items.sort((a, b) => b.pub24h - a.pub24h || a.source.localeCompare(b.source));
  }, [mapMode, selectedCluster]);

  useEffect(() => {
    setDetailTab('metrics');
  }, [selectedSource?.sourceId]);

  useEffect(() => {
    if (!selectedSource) return;
    if (displayedCountrySources.some((item) => item.sourceId === selectedSource.sourceId)) return;
    setSelectedSource(null);
  }, [displayedCountrySources, selectedSource]);

  useEffect(() => {
    if (!selectedCluster) return;
    if (displayedCountrySources.some((item) => selectedCluster.sources.some((source) => source.sourceId === item.sourceId))) return;
    setSelectedCluster(null);
  }, [displayedCountrySources, selectedCluster]);

  function toggleLayer(key: keyof MapLayerState) {
    setLayers((current) => ({ ...current, [key]: !current[key] }));
  }

  function focusCountry(country: MapCountryMetricRow) {
    const point = projectToGlobe(country.lat, country.lon, globeRotationLon);
    setSceneOrigin({
      x: round((point.x / GLOBE_WIDTH) * 100, 2),
      y: round((point.y / GLOBE_HEIGHT) * 100, 2),
    });
    setSelectedCountry(country);
    setSelectedCluster(null);
    setSelectedSource(null);
    setCountryViewport(DEFAULT_COUNTRY_VIEWPORT);
    setLeftTab('overview');
  }

  function resetToGlobe() {
    setSceneOrigin({ x: 50, y: 52 });
    setSelectedCountry(null);
    setSelectedCluster(null);
    setSelectedSource(null);
    setCountryViewport(DEFAULT_COUNTRY_VIEWPORT);
    setLeftTab('overview');
  }

  function focusCluster(cluster: CountrySourceCluster) {
    setSelectedCluster(cluster);
    if (cluster.sources.length === 1) {
      setSelectedSource(cluster.sources[0]);
    } else {
      setSelectedSource(null);
    }
    setDetailTab('metrics');
  }

  function focusBenchmarkCountry(country: string) {
    const match = countryLookup.get(normalizeCountryName(country));
    if (!match) return;
    focusCountry(match);
  }

  function resetToPublisherGlobe(publisher: MapPublisherMetricRow) {
    setMapMode('publishers');
    setSceneOrigin({ x: 50, y: 52 });
    setSelectedPublisher(publisher);
    setSelectedCountry(null);
    setSelectedCluster(null);
    setSelectedSource(null);
    setCountryViewport(DEFAULT_COUNTRY_VIEWPORT);
    setLeftTab('overview');
  }

  function commitSearchResult(result: MapSearchResult) {
    if (result.kind === 'country') {
      focusCountry(result.country);
    } else {
      resetToPublisherGlobe(result.publisher);
    }
    setSearchQuery('');
    setSearchOpen(false);
    searchInputRef.current?.blur();
  }

  const currentUrlQuery = buildMapQueryString({
    mode: urlMode,
    window: urlWindow,
    country: urlCountry,
    publisher: urlPublisher,
    source: urlSource,
    leftTab: urlLeftTab,
    detailTab: urlDetailTab,
    benchmarkOpen: urlBenchmarkOpen,
    layers: urlLayers || DEFAULT_MAP_LAYERS,
  });

  const desiredUrlQuery = buildMapQueryString({
    mode: mapMode,
    window: mapWindow,
    country: selectedCountry?.country || null,
    publisher: mapMode === 'publishers' ? selectedPublisher?.publisher || null : null,
    source: selectedCountry ? selectedSource?.sourceId || null : null,
    leftTab,
    detailTab,
    benchmarkOpen,
    layers,
  });

  useEffect(() => {
    if (!urlSyncReady) return;
    if (desiredUrlQuery === currentUrlQuery) return;
    const targetUrl = desiredUrlQuery ? `${pathname}?${desiredUrlQuery}` : pathname;
    router.replace(targetUrl, { scroll: false });
  }, [router, pathname, urlSyncReady, desiredUrlQuery, currentUrlQuery]);

  useEffect(() => {
    setSearchQuery('');
    setSearchOpen(false);
  }, [mapMode, selectedCountry?.country]);

  return (
    <div className="page-stack map-page-stack map-page-root">
      <section className="map-workbench">
        <div
          className="map-stage"
          onPointerEnter={() => {
            if (!selectedCountry) setInteractionPaused(true);
          }}
          onPointerLeave={() => {
            if (!selectedCountry) setInteractionPaused(false);
          }}
        >
          <div className="map-floating-toolbar">
            {selectedCountry ? (
              <>
                <button
                  type="button"
                  className="button"
                  onClick={resetToGlobe}
                >
                  Back To Globe
                </button>
                <div className="map-toolbar-chip">{countryViewport.scale.toFixed(1)}x Zoom</div>
                <button
                  type="button"
                  className="map-toolbar-chip map-toolbar-button"
                  onClick={() => setCountryViewport(DEFAULT_COUNTRY_VIEWPORT)}
                >
                  Reset Zoom
                </button>
                <div className={`map-search-shell ${searchOpen ? 'is-open' : ''}`}>
                  <input
                    ref={searchInputRef}
                    type="search"
                    value={searchQuery}
                    className="map-search-input"
                    placeholder="Jump to country"
                    aria-label="Search country"
                    onFocus={() => setSearchOpen(true)}
                    onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)}
                    onChange={(event) => {
                      setSearchQuery(event.target.value);
                      setSearchOpen(true);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        setSearchOpen(false);
                        searchInputRef.current?.blur();
                      }
                      if (event.key === 'Enter' && searchResults[0]) {
                        event.preventDefault();
                        commitSearchResult(searchResults[0]);
                      }
                    }}
                  />
                  {searchOpen ? (
                    <div className="map-search-dropdown">
                      <div className="map-search-heading">Country search</div>
                      <div className="map-search-results">
                        {searchResults.length > 0 ? (
                          searchResults.map((result) => (
                            <button
                              key={result.key}
                              type="button"
                              className="map-search-option"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => commitSearchResult(result)}
                            >
                              <strong>{result.title}</strong>
                              <span>{result.subtitle}</span>
                            </button>
                          ))
                        ) : (
                          <div className="map-search-empty">
                            {countriesState.loading ? 'Loading countries…' : 'No matching countries.'}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <div className="map-toolbar-chip">
                  {mapMode === 'publishers' ? 'Publisher Globe' : mapMode === 'health' ? 'Health Globe' : '3D Globe View'}
                </div>
                <div className={`map-search-shell ${searchOpen ? 'is-open' : ''}`}>
                  <input
                    ref={searchInputRef}
                    type="search"
                    value={searchQuery}
                    className="map-search-input"
                    placeholder={searchMode === 'publishers' ? 'Search publisher' : 'Search country'}
                    aria-label={searchMode === 'publishers' ? 'Search publisher' : 'Search country'}
                    onFocus={() => setSearchOpen(true)}
                    onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)}
                    onChange={(event) => {
                      setSearchQuery(event.target.value);
                      setSearchOpen(true);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        setSearchOpen(false);
                        searchInputRef.current?.blur();
                      }
                      if (event.key === 'Enter' && searchResults[0]) {
                        event.preventDefault();
                        commitSearchResult(searchResults[0]);
                      }
                    }}
                  />
                  {searchOpen ? (
                    <div className="map-search-dropdown">
                      <div className="map-search-heading">{searchMode === 'publishers' ? 'Publisher search' : 'Country search'}</div>
                      <div className="map-search-results">
                        {searchResults.length > 0 ? (
                          searchResults.map((result) => (
                            <button
                              key={result.key}
                              type="button"
                              className="map-search-option"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => commitSearchResult(result)}
                            >
                              <strong>{result.title}</strong>
                              <span>{result.subtitle}</span>
                            </button>
                          ))
                        ) : (
                          <div className="map-search-empty">
                            {searchMode === 'publishers'
                              ? (publishersState.loading ? 'Loading publishers…' : 'No matching publishers.')
                              : (countriesState.loading ? 'Loading countries…' : 'No matching countries.')}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
                <button type="button" className="map-toolbar-chip map-toolbar-button" onClick={() => setMotionEnabled((current) => !current)}>
                  {motionEnabled ? 'Pause Motion' : 'Resume Motion'}
                </button>
              </>
            )}
          </div>

          <div
            key={sceneMode === 'country' ? `country-${selectedCountry?.country}` : 'globe'}
            className={`map-scene-frame ${sceneMode === 'country' ? 'is-country' : 'is-globe'}`}
            style={
              {
                ['--map-origin-x' as string]: `${sceneOrigin.x}%`,
                ['--map-origin-y' as string]: `${sceneOrigin.y}%`,
              } as CSSProperties
            }
          >
            {selectedCountry && sourcesState.data ? (
              <CountryPlaneSvg
                country={selectedCountry}
                world={worldState.data}
                sources={displayedCountrySources}
                layers={layers}
                viewport={countryViewport}
                onViewportChange={setCountryViewport}
                selectedClusterId={selectedCluster?.id || null}
                selectedSourceId={selectedSource?.sourceId || null}
                onSelectCluster={focusCluster}
              />
            ) : (
              <WorldGlobeSvg
                countries={globeCountries}
                world={worldState.data}
                layers={layers}
                mapMode={mapMode}
                window={mapWindow}
                rotationLon={globeRotationLon}
                selectedCountry={selectedCountry?.country || null}
                onSelectCountry={focusCountry}
              />
            )}
          </div>

          {selectedCountry && !sourcesState.data && sourcesState.loading ? (
            <div className="map-stage-loading">
              <div className="eyebrow">Camera Shift</div>
              <strong>Loading {selectedCountry.country} regional map</strong>
            </div>
          ) : null}

        </div>

        <aside className={`map-side-panel ${selectedCountry ? 'is-country-view' : ''}`}>
          <div className="map-panel-head">
            <div>
              <div className="eyebrow">{selectedCountry ? 'Country Detail' : 'Global Overview'}</div>
              <h2>
                {selectedCountry
                  ? selectedCountry.country
                  : mapMode === 'publishers' && selectedPublisher
                    ? selectedPublisher.publisher
                    : mapMode === 'health'
                      ? 'Source Health Overlay'
                      : 'World Publishing Pulse'}
              </h2>
            </div>
            <div className={`map-status-pill ${selectedCountry ? 'flat' : 'globe'}`}>
              {selectedCountry ? 'Flat Map' : '3D Globe'}
            </div>
          </div>

          {!selectedCountry ? (
            <div className="map-mode-row" role="tablist" aria-label="Map metric mode">
              <button
                type="button"
                className={`map-mode-chip ${mapMode === 'countries' ? 'active' : ''}`}
                onClick={() => setMapMode('countries')}
              >
                Countries
              </button>
              <button
                type="button"
                className={`map-mode-chip ${mapMode === 'publishers' ? 'active' : ''}`}
                onClick={() => setMapMode('publishers')}
              >
                Publishers
              </button>
              <button
                type="button"
                className={`map-mode-chip ${mapMode === 'health' ? 'active' : ''}`}
                onClick={() => setMapMode('health')}
              >
                Health
              </button>
            </div>
          ) : null}

          {!selectedCountry ? (
            <div className="map-mode-row" role="tablist" aria-label="Map time window">
              {MAP_WINDOW_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`map-mode-chip ${mapWindow === option ? 'active' : ''}`}
                  onClick={() => setMapWindow(option)}
                >
                  {mapWindowLabel(option)}
                </button>
              ))}
            </div>
          ) : null}

          <div className="map-tab-row" role="tablist" aria-label="Map side panel sections">
            <button
              type="button"
              role="tab"
              aria-selected={leftTab === 'overview'}
              className={`map-tab-chip ${leftTab === 'overview' ? 'active' : ''}`}
              onClick={() => setLeftTab('overview')}
            >
              Overview
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={leftTab === 'display'}
              className={`map-tab-chip ${leftTab === 'display' ? 'active' : ''}`}
              onClick={() => setLeftTab('display')}
            >
              Display
            </button>
          </div>

          <div className="map-tab-panel">
            {leftTab === 'overview' ? (
              <>
                {!selectedCountry && mapMode === 'countries' && totals ? (
                  <div className="map-stat-grid">
                    <article className="map-stat-card">
                      <span>Published {activeWindowDescriptor}</span>
                      <strong>{formatNumber(totalWindowMetrics?.published || 0)}</strong>
                    </article>
                    <article className="map-stat-card">
                      <span>{mapWindow === '1h' ? 'Fresh 1h' : `Fresh ${activeWindowDescriptor}`}</span>
                      <strong>{formatNumber(totalWindowMetrics?.fresh || 0)}</strong>
                    </article>
                    <article className="map-stat-card">
                      <span>Countries</span>
                      <strong>{formatNumber(totals.countries)}</strong>
                    </article>
                    <article className="map-stat-card">
                      <span>Active Sources</span>
                      <strong>{formatNumber(totalWindowMetrics?.activeSources || 0)}</strong>
                    </article>
                  </div>
                ) : null}

                {!selectedCountry && mapMode === 'publishers' && selectedPublisher && selectedPublisherWindowMetrics ? (
                  <div className="map-stat-grid">
                    <article className="map-stat-card">
                      <span>Publisher {activeWindowDescriptor}</span>
                      <strong>{formatNumber(selectedPublisherWindowMetrics.published)}</strong>
                    </article>
                    <article className="map-stat-card">
                      <span>Countries</span>
                      <strong>{formatNumber(selectedPublisherWindowMetrics.activeCountries)}</strong>
                    </article>
                    <article className="map-stat-card">
                      <span>Active Sources</span>
                      <strong>{formatNumber(selectedPublisherWindowMetrics.activeSources)}</strong>
                    </article>
                    <article className="map-stat-card">
                      <span>Degraded Sources</span>
                      <strong>{formatNumber(selectedPublisherWindowMetrics.degradedSources)}</strong>
                    </article>
                  </div>
                ) : null}

                {!selectedCountry && mapMode === 'health' ? (
                  <div className="map-stat-grid">
                    <article className="map-stat-card">
                      <span>Healthy Sources</span>
                      <strong>{formatNumber(healthTotals.healthySources24h)}</strong>
                    </article>
                    <article className="map-stat-card">
                      <span>Degraded Sources</span>
                      <strong>{formatNumber(healthTotals.degradedSources24h)}</strong>
                    </article>
                    <article className="map-stat-card">
                      <span>Countries With Issues</span>
                      <strong>{formatNumber(healthTotals.countriesWithIssues)}</strong>
                    </article>
                    <article className="map-stat-card">
                      <span>Countries</span>
                      <strong>{formatNumber(totals?.countries || 0)}</strong>
                    </article>
                  </div>
                ) : null}

                {selectedCountry && sourcesState.data ? (
                  <div className="map-stat-grid">
                    <article className="map-stat-card">
                      <span>Published 24h</span>
                      <strong>{formatNumber(selectedCountrySummaryDisplay.pub24h)}</strong>
                    </article>
                    <article className="map-stat-card">
                      <span>Published 1h</span>
                      <strong>{formatNumber(selectedCountrySummaryDisplay.pub1h)}</strong>
                    </article>
                    <article className="map-stat-card">
                      <span>{mapMode === 'health' ? 'Healthy Sources' : 'RSS Sources'}</span>
                      <strong>
                        {formatNumber(
                          mapMode === 'health'
                            ? selectedCountrySummaryDisplay.healthySources24h
                            : selectedCountrySummaryDisplay.rssSources24h
                        )}
                      </strong>
                    </article>
                    <article className="map-stat-card">
                      <span>{mapMode === 'health' ? 'Degraded Sources' : 'Sitemap Sources'}</span>
                      <strong>
                        {formatNumber(
                          mapMode === 'health'
                            ? selectedCountrySummaryDisplay.degradedSources24h
                            : selectedCountrySummaryDisplay.sitemapSources24h
                        )}
                      </strong>
                    </article>
                  </div>
                ) : null}

                {selectedCountry && sourcesState.data ? (
                  <div className="map-panel-block compact">
                    <div className="section-head sub">
                      <h3>Country Hourly Trend</h3>
                      <span>24h</span>
                    </div>
                    <div className="mini-bars">
                      {selectedCountryHourly.length > 0 ? selectedCountryHourly.map((item) => {
                        const max = Math.max(...selectedCountryHourly.map((hour) => hour.count), 1);
                        const height = Math.max(8, Math.round((item.count / max) * 84));
                        return (
                          <div key={item.hour} className="mini-bar-col" title={`${item.hour}: ${item.count}`}>
                            <div className="mini-bar" style={{ height }} />
                          </div>
                        );
                      }) : <span className="muted">No hourly country data yet.</span>}
                    </div>
                  </div>
                ) : null}

                {selectedCountry && sourcesState.data ? (
                  <div className="map-panel-block compact">
                    <div className="section-head sub">
                      <h3>Top Regions</h3>
                      <span>24h output</span>
                    </div>
                    <div className="map-list">
                      {selectedCountryTopRegions.slice(0, 5).map((item) => (
                        <div key={item.name} className="map-list-row static">
                          <div className="map-list-copy">
                            <strong>{item.name}</strong>
                            <span>{formatNumber(item.sources)} sources</span>
                          </div>
                          <span>{formatNumber(item.count)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {!selectedCountry ? (
                  <div className="map-story-card">
                    <div className="eyebrow">
                      {mapMode === 'publishers'
                        ? 'Publisher Footprint'
                        : mapMode === 'health'
                          ? 'Health Overlay'
                          : 'World Publishing Pulse'}
                    </div>
                    <strong>
                      {mapMode === 'publishers'
                        ? `${selectedPublisher?.publisher || 'Publisher'} country footprint`
                        : mapMode === 'health'
                          ? 'Country health globe'
                          : 'Country publishing globe'}
                    </strong>
                    <span>
                      {mapMode === 'publishers'
                        ? `Country bubbles show where the selected publisher is active across borders and how much output each market generated in the last ${activeWindowDescriptor}.`
                        : mapMode === 'health'
                          ? `Country bubbles are colored by degraded-source share and sized by active source count in the last ${activeWindowDescriptor}.`
                          : `Country bubbles are sized by ${activeWindowDescriptor} publishing volume and color-shift on freshness and late share.`}
                    </span>
                    <span>
                      {latestMapUpdatedLabel
                        ? `Live DB · auto refresh every 1h · last updated ${latestMapUpdatedLabel}`
                        : 'Live DB · auto refresh every 1h'}
                    </span>
                  </div>
                ) : null}

                <div className="map-panel-block">
                  <div className="section-head">
                    <h3>
                      {selectedCountry
                        ? 'Rankings'
                        : mapMode === 'publishers'
                          ? 'Top Publishers'
                          : mapMode === 'health'
                            ? 'Most Degraded'
                            : 'Top Countries'}
                    </h3>
                    <span>
                      {selectedCountry
                        ? 'publishers · regions · sources'
                        : mapMode === 'publishers'
                          ? `${activeWindowDescriptor} network output`
                          : mapMode === 'health'
                            ? 'degraded share and count'
                            : `${activeWindowDescriptor} country output`}
                    </span>
                  </div>

                  {!selectedCountry && mapMode === 'countries' ? (
                    <div className="map-list">
                      {topCountries.map((item) => (
                        <button
                          key={item.country}
                          type="button"
                          className="map-list-row"
                          onClick={() => {
                            const match = countriesState.data?.countries.find((countryRow) => countryRow.country === item.country);
                          if (match) focusCountry(match);
                        }}
                      >
                        <strong>{item.country}</strong>
                        <span>{formatNumber(getCountryWindowMetrics(item, mapWindow).published)}</span>
                      </button>
                    ))}
                  </div>
                  ) : null}

                  {!selectedCountry && mapMode === 'publishers' ? (
                    <>
                      <div className="map-list">
                        {topPublishers.map((item) => (
                          <button
                            key={item.publisher}
                            type="button"
                            className={`map-list-row ${selectedPublisher?.publisher === item.publisher ? 'selected' : ''}`}
                            onClick={() => setSelectedPublisher(item)}
                          >
                            <div className="map-list-copy">
                              <strong>{item.publisher}</strong>
                              <span>{formatNumber(getPublisherWindowMetrics(item, mapWindow).activeCountries)} countries</span>
                            </div>
                            <span>{formatNumber(getPublisherWindowMetrics(item, mapWindow).published)}</span>
                          </button>
                        ))}
                      </div>
                      {selectedPublisher ? (
                        <>
                          <div className="section-head sub">
                            <h3>Publisher Countries</h3>
                            <span>{activeWindowDescriptor} footprint</span>
                          </div>
                          <div className="map-list">
                            {selectedPublisher.countries.slice(0, 10).map((item) => (
                              <button
                                key={item.country}
                                type="button"
                                className="map-list-row"
                                onClick={() => {
                                  const match = countriesState.data?.countries.find((countryRow) => countryRow.country === item.country);
                                  if (match) focusCountry(match);
                                }}
                              >
                                <div className="map-list-copy">
                                  <strong>{item.country}</strong>
                                  <span>{formatNumber(getPublisherCountryWindowMetrics(item, mapWindow).activeSources)} sources</span>
                                </div>
                                <span>{formatNumber(getPublisherCountryWindowMetrics(item, mapWindow).published)}</span>
                              </button>
                            ))}
                          </div>
                        </>
                      ) : null}
                    </>
                  ) : null}

                  {!selectedCountry && mapMode === 'health' ? (
                    <div className="map-list">
                      {topDegradedCountries.map((item) => (
                        <button
                          key={item.country}
                          type="button"
                          className="map-list-row"
                          onClick={() => {
                            const match = countriesState.data?.countries.find((countryRow) => countryRow.country === item.country);
                            if (match) focusCountry(match);
                          }}
                        >
                          <div className="map-list-copy">
                            <strong>{item.country}</strong>
                            <span>{formatNumber(item.windows[mapWindow].degradedSources)} degraded</span>
                          </div>
                          <span>{round(itemDegradedShare(item, mapWindow) * 100, 1)}%</span>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {selectedCountry && sourcesState.data ? (
                    <>
                      <div className="section-head sub">
                        <h3>Top Publishers</h3>
                        <span>24h output</span>
                      </div>
                      <div className="map-list">
                        {(mapMode === 'publishers'
                          ? [{ name: selectedPublisher?.publisher || 'Selected Publisher', count: selectedCountrySummaryDisplay?.pub24h || 0 }]
                          : selectedCountryTopPublishers
                        ).slice(0, 8).map((item) => (
                          <div key={item.name} className="map-list-row static">
                            <strong>{item.name}</strong>
                            <span>{formatNumber(item.count)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="section-head sub">
                        <h3>{mapMode === 'health' ? 'Top Degraded Regions' : 'Top Regions'}</h3>
                        <span>{mapMode === 'health' ? 'degraded' : '24h output'}</span>
                      </div>
                      <div className="map-list">
                        {mapMode === 'health'
                          ? derivedTopDegradedRegions.slice(0, 8).map((item) => (
                              <div key={item.name} className="map-list-row static">
                                <div className="map-list-copy">
                                  <strong>{item.name}</strong>
                                  <span>{formatNumber(item.degradedSources)} degraded · {formatNumber(item.sources)} total</span>
                                </div>
                                <span>{round(item.degradedShare * 100, 1)}%</span>
                              </div>
                            ))
                          : selectedCountryTopRegionsDisplay.slice(0, 8).map((item) => (
                              <div key={item.name} className="map-list-row static">
                                <div className="map-list-copy">
                                  <strong>{item.name}</strong>
                                  <span>{formatNumber(item.sources)} sources</span>
                                </div>
                                <span>{formatNumber(item.count)}</span>
                              </div>
                            ))}
                      </div>
                      <div className="section-head sub">
                        <h3>{mapMode === 'health' ? 'Top Degraded Sources' : 'Top Sources'}</h3>
                        <span>{mapMode === 'health' ? 'degraded' : '24h output'}</span>
                      </div>
                      <div className="map-list">
                        {mapMode === 'health'
                          ? derivedTopDegradedSources.slice(0, 10).map((item) => (
                              <button
                                key={item.sourceId}
                                type="button"
                                className="map-list-row"
                                onClick={() => {
                                  setSelectedCluster(null);
                                  setSelectedSource(item);
                                }}
                              >
                                <div className="map-list-copy">
                                  <strong>{item.source}</strong>
                                  <span>{item.health} · {item.region || item.city || item.country}</span>
                                </div>
                                <span>{formatNumber(item.pub24h)}</span>
                              </button>
                            ))
                          : selectedCountryTopSourcesDisplay.slice(0, 10).map((item) => (
                              <button
                                key={item.name}
                                type="button"
                                className="map-list-row"
                                onClick={() => {
                                  const match = sourcesState.data?.sources.find((source) => source.source === item.name);
                                  if (match) {
                                    setSelectedCluster(null);
                                    setSelectedSource(match);
                                  }
                                }}
                              >
                                <strong>{item.name}</strong>
                                <span>{formatNumber(item.count)}</span>
                              </button>
                            ))}
                      </div>
                    </>
                  ) : null}
                </div>
              </>
            ) : null}
            {leftTab === 'display' ? (
              <div className="map-panel-block compact">
                <div className="section-head">
                  <h3>Layer Controls</h3>
                  <span>Show or mute map detail</span>
                </div>
                <div className="map-layer-list">
                  <button type="button" className="map-layer-row" onClick={() => toggleLayer('labels')}>
                    <div>
                      <strong>Labels</strong>
                      <span>Country and source callouts</span>
                    </div>
                    <span className={`map-switch ${layers.labels ? 'on' : ''}`} />
                  </button>
                  <button type="button" className="map-layer-row" onClick={() => toggleLayer('graticule')}>
                    <div>
                      <strong>Grid</strong>
                      <span>Latitude, longitude, and regional guides</span>
                    </div>
                    <span className={`map-switch ${layers.graticule ? 'on' : ''}`} />
                  </button>
                  <button type="button" className="map-layer-row" onClick={() => toggleLayer('land')}>
                    <div>
                      <strong>Landmass</strong>
                      <span>Country shapes and coastline definition</span>
                    </div>
                    <span className={`map-switch ${layers.land ? 'on' : ''}`} />
                  </button>
                  <button type="button" className="map-layer-row" onClick={() => toggleLayer('glow')}>
                    <div>
                      <strong>Atmosphere</strong>
                      <span>Halo, pulse, and glow depth</span>
                    </div>
                    <span className={`map-switch ${layers.glow ? 'on' : ''}`} />
                  </button>
                  <button type="button" className="map-layer-row" onClick={() => toggleLayer('flows')}>
                    <div>
                      <strong>Flows</strong>
                      <span>Publishing network arcs between major countries</span>
                    </div>
                    <span className={`map-switch ${layers.flows ? 'on' : ''}`} />
                  </button>
                  <button type="button" className="map-layer-row" onClick={() => setMotionEnabled((current) => !current)}>
                    <div>
                      <strong>Motion</strong>
                      <span>Idle globe rotation while in global view</span>
                    </div>
                    <span className={`map-switch ${motionEnabled ? 'on' : ''}`} />
                  </button>
                </div>
                <div className="map-legend compact">
                  <div><span className="legend-dot late-low" /> {mapMode === 'health' ? 'Healthy source base' : 'Healthy / fresh'}</div>
                  <div><span className="legend-dot late-mid" /> {mapMode === 'health' ? 'Moderate degraded share' : 'Moderate late share'}</div>
                  <div><span className="legend-dot late-high" /> {mapMode === 'health' ? 'High degraded share' : 'High late share / degraded'}</div>
                </div>
              </div>
            ) : null}
          </div>

          {(countriesState.loading || publishersState.loading || sourcesState.loading || worldState.loading) ? <div className="panel muted">Loading map metrics...</div> : null}
          {countriesState.error ? <div className="panel danger">{countriesState.error}</div> : null}
          {publishersState.error ? <div className="panel danger">{publishersState.error}</div> : null}
          {sourcesState.error ? <div className="panel danger">{sourcesState.error}</div> : null}
          {worldState.error ? <div className="panel danger">{worldState.error}</div> : null}
        </aside>

        <aside className="map-detail-drawer">
          <div className="map-panel-head">
            <div>
              <div className="eyebrow">
                {selectedSource
                  ? 'Source Detail'
                  : selectedCluster
                    ? 'Cluster Detail'
                    : !selectedCountry && mapMode === 'publishers'
                      ? 'Publisher Detail'
                      : !selectedCountry && mapMode === 'health'
                        ? 'Health Detail'
                        : 'Source Detail'}
              </div>
              <h2>
                {sourceDetail?.source ||
                  selectedCluster?.name ||
                  (!selectedCountry && mapMode === 'publishers' ? selectedPublisher?.publisher || 'Select a publisher' : null) ||
                  (!selectedCountry && mapMode === 'health' ? 'Source Health' : null) ||
                  'Select a source'}
              </h2>
            </div>
            {sourceDetail ? <div className={`map-status-pill ${sourceDetail.health.status === 'healthy' ? 'globe' : 'flat'}`}>{sourceDetail.health.status}</div> : null}
            {!sourceDetail && selectedCluster ? <div className="map-status-pill globe">{selectedCluster.sourceCount} sources</div> : null}
            {!selectedCountry && mapMode === 'publishers' && selectedPublisher && selectedPublisherWindowMetrics ? <div className="map-status-pill globe">{selectedPublisherWindowMetrics.activeCountries} countries</div> : null}
            {!selectedCountry && mapMode === 'health' ? <div className="map-status-pill flat">{healthTotals.degradedSources24h} degraded</div> : null}
          </div>

          {!selectedCountry && !selectedSource && mapMode === 'publishers' && selectedPublisher && selectedPublisherWindowMetrics ? (
            <div className="map-source-detail">
              <div className="map-detail-meta">
                <div><span>Publisher</span><strong>{selectedPublisher.publisher}</strong></div>
                <div><span>{activeWindowDescriptor} Output</span><strong>{formatNumber(selectedPublisherWindowMetrics.published)}</strong></div>
                <div><span>Countries</span><strong>{formatNumber(selectedPublisherWindowMetrics.activeCountries)}</strong></div>
                <div><span>Active Sources</span><strong>{formatNumber(selectedPublisherWindowMetrics.activeSources)}</strong></div>
                <div><span>Reliability</span><strong>{round(selectedPublisherReliability * 100, 1)}%</strong></div>
              </div>

              <div className="map-stat-grid compact">
                <article className="map-stat-card">
                  <span>Healthy Sources</span>
                  <strong>{formatNumber(selectedPublisherWindowMetrics.healthySources)}</strong>
                </article>
                <article className="map-stat-card">
                  <span>Degraded Sources</span>
                  <strong>{formatNumber(selectedPublisherWindowMetrics.degradedSources)}</strong>
                </article>
                <article className="map-stat-card">
                  <span>Top Market</span>
                  <strong>{selectedPublisher.countries[0]?.country || 'n/a'}</strong>
                </article>
                <article className="map-stat-card">
                  <span>Top Market {activeWindowDescriptor}</span>
                  <strong>{formatNumber(selectedPublisher.countries[0] ? getPublisherCountryWindowMetrics(selectedPublisher.countries[0], mapWindow).published : 0)}</strong>
                </article>
              </div>

              <div className="map-panel-block compact">
                <div className="section-head">
                  <h3>Country Footprint</h3>
                  <span>click a market to drill down</span>
                </div>
                <div className="map-list">
                  {selectedPublisher.countries.slice(0, 10).map((item) => (
                    <button
                      key={item.country}
                      type="button"
                      className="map-list-row"
                      onClick={() => {
                        const match = countriesState.data?.countries.find((countryRow) => countryRow.country === item.country);
                        if (match) focusCountry(match);
                      }}
                    >
                      <div className="map-list-copy">
                        <strong>{item.country}</strong>
                        <span>{formatNumber(getPublisherCountryWindowMetrics(item, mapWindow).activeSources)} sources · {formatNumber(getPublisherCountryWindowMetrics(item, mapWindow).degradedSources)} degraded</span>
                      </div>
                      <span>{formatNumber(getPublisherCountryWindowMetrics(item, mapWindow).published)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : !selectedCountry && !selectedSource && mapMode === 'health' ? (
            <div className="map-source-detail">
              <div className="map-detail-meta">
                <div><span>Healthy Sources</span><strong>{formatNumber(healthTotals.healthySources24h)}</strong></div>
                <div><span>Degraded Sources</span><strong>{formatNumber(healthTotals.degradedSources24h)}</strong></div>
                <div><span>Countries With Issues</span><strong>{formatNumber(healthTotals.countriesWithIssues)}</strong></div>
                <div><span>Mode</span><strong>Global health</strong></div>
              </div>

              <div className="map-panel-block compact">
                <div className="section-head">
                  <h3>Most Degraded Countries</h3>
                  <span>sorted by degraded share</span>
                </div>
                <div className="map-list">
                  {topDegradedCountries.slice(0, 8).map((item) => (
                    <button
                      key={item.country}
                      type="button"
                      className="map-list-row"
                      onClick={() => {
                        const match = countriesState.data?.countries.find((countryRow) => countryRow.country === item.country);
                        if (match) focusCountry(match);
                      }}
                    >
                      <div className="map-list-copy">
                        <strong>{item.country}</strong>
                        <span>{formatNumber(item.windows[mapWindow].degradedSources)} degraded · {formatNumber(item.windows[mapWindow].activeSources)} active</span>
                      </div>
                      <span>{round(itemDegradedShare(item, mapWindow) * 100, 1)}%</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : !selectedSource && !selectedCluster ? (
            <div className="panel muted">
              {mapMode === 'health'
                ? 'Choose a country, then click a city or region bubble. The drawer will prioritize degraded sources and show source-level health detail.'
                : mapMode === 'publishers'
                  ? 'Choose a country from the selected publisher footprint, then click a city or region bubble to inspect sources from that network.'
                  : 'Choose a country, then click a city or region bubble. The drawer will list sources in that area, and from there you can open full source detail.'}
            </div>
          ) : !selectedSource && selectedCluster ? (
            <div className="map-source-detail">
              <div className="map-detail-meta">
                <div><span>Area</span><strong>{selectedCluster.city || selectedCluster.region || selectedCountry?.country || 'National'}</strong></div>
                <div><span>Sources</span><strong>{formatNumber(selectedCluster.sourceCount)}</strong></div>
                <div><span>Pub 24h</span><strong>{formatNumber(selectedCluster.pub24h)}</strong></div>
                <div><span>Pub 1h</span><strong>{formatNumber(selectedCluster.pub1h)}</strong></div>
                <div><span>HQ Sources</span><strong>{formatNumber(selectedCluster.headquartersCount)}</strong></div>
              </div>

              <div className="map-panel-block compact">
                <div className="section-head">
                  <h3>Sources In Cluster</h3>
                  <span>{mapMode === 'health' ? 'Degraded sources appear first' : 'Choose a source for detail'}</span>
                </div>
                <div className="map-list">
                  {selectedClusterSourcesDisplay.slice(0, 16).map((source) => (
                    <button
                      key={source.sourceId}
                      type="button"
                      className="map-list-row"
                      onClick={() => setSelectedSource(source)}
                    >
                      <div className="map-list-copy">
                        <strong>{source.source}</strong>
                        <span>
                          {source.region || source.city || source.country}
                          {mapMode === 'health'
                            ? ` · ${source.health}`
                            : source.publisher && source.publisher !== source.source
                              ? ` · ${source.publisher}`
                              : ''}
                        </span>
                      </div>
                      <span>{formatNumber(source.pub24h)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : sourceDetailState.loading && !sourceDetail ? (
            <div className="panel muted">Loading source detail...</div>
          ) : sourceDetail ? (
            <div className="map-source-detail">
              {selectedCluster ? (
                <div className="map-panel-block compact">
                  <div className="section-head">
                    <h3>{selectedCluster.region || selectedCluster.city || 'Selected Region'}</h3>
                    <button
                      type="button"
                      className="map-inline-action"
                      onClick={() => setSelectedSource(null)}
                    >
                      Back To Region
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="map-detail-meta">
                <div><span>Publisher</span><strong>{sourceDetail.publisher || sourceDetail.source}</strong></div>
                <div><span>Country</span><strong>{sourceDetail.country}</strong></div>
                <div><span>Method</span><strong>{sourceMethodLabel(sourceDetail.method)}</strong></div>
                <div><span>Location</span><strong>{sourceDetail.region || sourceDetail.city || 'National'}</strong></div>
                <div><span>Coordinate</span><strong>{sourceLocationKindLabel(sourceDetail.locationKind)}</strong></div>
              </div>

              <div className="map-detail-tab-row" role="tablist" aria-label="Source detail sections">
                <button
                  type="button"
                  role="tab"
                  aria-selected={detailTab === 'metrics'}
                  className={`map-detail-tab ${detailTab === 'metrics' ? 'active' : ''}`}
                  onClick={() => setDetailTab('metrics')}
                >
                  Metrics
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={detailTab === 'headlines'}
                  className={`map-detail-tab ${detailTab === 'headlines' ? 'active' : ''}`}
                  onClick={() => setDetailTab('headlines')}
                >
                  Headlines
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={detailTab === 'health'}
                  className={`map-detail-tab ${detailTab === 'health' ? 'active' : ''}`}
                  onClick={() => setDetailTab('health')}
                >
                  Health
                </button>
              </div>

              <div className="map-detail-tab-panel">
                {detailTab === 'metrics' ? (
                  <>
                    <div className="map-stat-grid compact">
                      <article className="map-stat-card">
                        <span>Pub 24h</span>
                        <strong>{formatNumber(sourceDetail.metrics.pub24h)}</strong>
                      </article>
                      <article className="map-stat-card">
                        <span>Pub 1h</span>
                        <strong>{formatNumber(sourceDetail.metrics.pub1h)}</strong>
                      </article>
                      <article className="map-stat-card">
                        <span>Fresh 24h</span>
                        <strong>{formatNumber(sourceDetail.metrics.fresh24h)}</strong>
                      </article>
                      <article className="map-stat-card">
                        <span>Late 24h</span>
                        <strong>{formatNumber(sourceDetail.metrics.late24h)}</strong>
                      </article>
                    </div>

                    <div className="map-panel-block">
                      <div className="section-head">
                        <h3>Hourly Output</h3>
                        <span>Last 24 hours</span>
                      </div>
                      <div className="mini-bars">
                        {sourceDetail.hourly24h.length > 0 ? sourceDetail.hourly24h.map((item) => {
                          const max = Math.max(...sourceDetail.hourly24h.map((hour) => hour.count), 1);
                          const height = Math.max(8, Math.round((item.count / max) * 84));
                          return (
                            <div key={item.hour} className="mini-bar-col" title={`${item.hour}: ${item.count}`}>
                              <div className="mini-bar" style={{ height }} />
                            </div>
                          );
                        }) : <span className="muted">No hourly data yet.</span>}
                      </div>
                    </div>
                  </>
                ) : null}

                {detailTab === 'headlines' ? (
                  <div className="map-panel-block compact">
                    <div className="section-head">
                      <h3>Latest Headlines</h3>
                      <span>Recent source output</span>
                    </div>
                    <div className="map-headline-list">
                      {sourceDetail.latestArticles.slice(0, 5).map((article) => (
                        <a key={article.id} href={article.url} target="_blank" rel="noreferrer" className="map-headline-row">
                          <strong>{article.title}</strong>
                          <span>{new Date(article.publicationDatetime).toLocaleString()}</span>
                          {article.primarySection ? <span>{article.primarySection}</span> : null}
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}

                {detailTab === 'health' ? (
                  <div className="map-panel-block compact">
                    <div className="map-health-grid">
                      <div>
                        <span>Fail Rate 24h</span>
                        <strong>{sourceDetail.health.failRate24h === null ? 'n/a' : `${round(sourceDetail.health.failRate24h * 100, 1)}%`}</strong>
                      </div>
                      <div>
                        <span>Last Checked</span>
                        <strong>{sourceDetail.health.lastCheckedAt ? new Date(sourceDetail.health.lastCheckedAt).toLocaleString() : 'Unavailable'}</strong>
                      </div>
                    </div>

                    <div className="map-endpoint-list">
                      {sourceDetail.rssUrl ? (
                        <a href={sourceDetail.rssUrl} target="_blank" rel="noreferrer" className="map-endpoint-card">
                          <span>RSS Endpoint</span>
                          <strong>{sourceDetail.rssUrl}</strong>
                        </a>
                      ) : null}
                      {sourceDetail.sitemapUrl ? (
                        <a href={sourceDetail.sitemapUrl} target="_blank" rel="noreferrer" className="map-endpoint-card">
                          <span>Sitemap Endpoint</span>
                          <strong>{sourceDetail.sitemapUrl}</strong>
                        </a>
                      ) : null}
                    </div>

                    <div className="map-panel-block">
                      <div className="section-head">
                        <h3>Last Error</h3>
                        <span>Most recent health signal</span>
                      </div>
                      <div className="panel">
                        {sourceDetail.health.lastError || 'No recent ingest error recorded.'}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : sourceDetailState.error ? (
            <div className="panel danger">{sourceDetailState.error}</div>
          ) : (
            <div className="panel muted">Source detail is unavailable.</div>
          )}
        </aside>

        <section className={`map-benchmark-sheet ${benchmarkOpen ? 'is-open' : 'is-collapsed'}`}>
          <div className="map-benchmark-head">
            <div>
              <div className="eyebrow">Observed Benchmark</div>
              <h3>Country publishing table</h3>
            </div>
            <div className="map-benchmark-actions">
              <span className="map-benchmark-meta">
                {benchmarkGeneratedLabel
                  ? `Snapshot ${benchmarkGeneratedLabel}`
                  : benchmarkState.loading
                    ? 'Loading snapshot'
                    : 'Snapshot unavailable'}
              </span>
              <Link href="/benchmark/" className="map-inline-action map-benchmark-link">
                Open Full Table
              </Link>
              <button
                type="button"
                className="map-inline-action"
                onClick={() => setBenchmarkOpen((current) => !current)}
              >
                {benchmarkOpen ? 'Collapse' : 'Expand'}
              </button>
            </div>
          </div>

          {benchmarkOpen ? (
            benchmark ? (
              <>
                <div className="map-benchmark-summary">
                  <article className="map-benchmark-stat">
                    <span>Published 24h</span>
                    <strong>{formatNumber(benchmark.totals.hourlyPublished24h)}</strong>
                  </article>
                  <article className="map-benchmark-stat">
                    <span>Fresh 24h</span>
                    <strong>{formatNumber(benchmark.totals.hourlyFresh24h)}</strong>
                  </article>
                  <article className="map-benchmark-stat">
                    <span>Countries</span>
                    <strong>{formatNumber(benchmark.totals.countries)}</strong>
                  </article>
                  <article className="map-benchmark-stat">
                    <span>Prev Day</span>
                    <strong>{formatNumber(benchmark.totals.dailyPublishedCount)}</strong>
                  </article>
                </div>

                <div className="map-benchmark-table-wrap">
                  <table className="map-benchmark-table">
                    <thead>
                      <tr>
                        <th>Country</th>
                        <th><HelpTooltipLabel label="24h" description={BENCHMARK_COLUMN_HELP.published24h} /></th>
                        <th><HelpTooltipLabel label="Late" description="Main line is late share, subline is the raw 24h late count." /></th>
                        <th><HelpTooltipLabel label="Active" description={BENCHMARK_COLUMN_HELP.activeSources} /></th>
                        <th><HelpTooltipLabel label="Top 5" description={BENCHMARK_COLUMN_HELP.top5Share} /></th>
                        <th><HelpTooltipLabel label="Prev Day" description={BENCHMARK_COLUMN_HELP.prevDayPublished} /></th>
                      </tr>
                    </thead>
                    <tbody>
                      {benchmarkRows.map((row) => {
                        const linkedCountry = countryLookup.get(normalizeCountryName(row.country)) || null;
                        const isSelected = Boolean(linkedCountry && selectedCountry?.country === linkedCountry.country);
                        return (
                          <tr key={row.country} className={isSelected ? 'is-selected' : ''}>
                            <td>
                              <button
                                type="button"
                                className="map-benchmark-country"
                                onClick={() => focusBenchmarkCountry(row.country)}
                                disabled={!linkedCountry}
                              >
                                <strong>{row.country}</strong>
                                <span>{row.countryCode || 'n/a'}</span>
                              </button>
                            </td>
                            <td>
                              <strong>{formatNumber(row.hourlyPublished24h)}</strong>
                              <span>fresh {formatNumber(row.hourlyFresh24h)}</span>
                            </td>
                            <td>
                              <strong>{formatLateShare(row.hourlyLate24h, row.hourlyInserted24h)}</strong>
                              <span>{formatNumber(row.hourlyLate24h)} late</span>
                            </td>
                            <td>
                              <strong>{formatNumber(row.hourlyActiveSources24h)}</strong>
                              <span>1h {formatNumber(row.hourlyActiveSources1h)}</span>
                            </td>
                            <td>
                              <strong>{formatPercentFromBps(row.hourlyTop5SourceShareBps)}</strong>
                              <span>top 1 {formatPercentFromBps(row.hourlyTopSourceShareBps)}</span>
                            </td>
                            <td>
                              <strong>{formatNumber(row.dailyPublishedCount)}</strong>
                              <span>{formatNumber(row.dailyActiveSourcesCount)} active</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : benchmarkState.error ? (
              <div className="panel danger map-benchmark-empty">{benchmarkState.error}</div>
            ) : benchmarkState.loading ? (
              <div className="panel muted map-benchmark-empty">Loading benchmark snapshot...</div>
            ) : (
              <div className="panel muted map-benchmark-empty">No benchmark snapshot is available yet.</div>
            )
          ) : null}
        </section>
      </section>
    </div>
  );
}
