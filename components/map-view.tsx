'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { CSSProperties, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { geoGraticule10, geoMercator, geoOrthographic, geoPath } from 'd3-geo';
import { useCustomerAccess } from '@/components/customer-access-provider';
import { MapDetailDrawer } from '@/components/map-detail-drawer';
import { MapFloatingToolbar } from '@/components/map-floating-toolbar';
import { HelpTooltipLabel } from '@/components/help-tooltip-label';
import { MapSidePanel } from '@/components/map-side-panel';
import { useRemoteJson } from '@/lib/use-remote-json';
import {
  formatNumber,
  getCountryWindowMetrics,
  getPublisherWindowMetrics,
  getSourceWindowMetrics,
  isSourceWindowActive,
  mapWindowDescriptor,
  publisherConfidenceLabel,
} from '@/lib/map-display';
import {
  buildMapQueryString,
  DEFAULT_MAP_LAYERS,
  isDetailTab,
  isLeftTab,
  isMapMetricWindow,
  isMapMode,
  type MapSearchResult,
  parseLayerState,
  sameLayerState,
  type DetailTab,
  type LeftTab,
  type MapLayerState,
  type MapMode,
} from '@/lib/map-view-state';
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

const GLOBE_WIDTH = 1800;
const GLOBE_HEIGHT = 1120;
const GLOBE_CENTER_X = 1008;
const GLOBE_CENTER_Y = 554;
const GLOBE_RADIUS = 422;
const GLOBE_ROTATION_LON = 78;
const GLOBE_ROTATION_LAT = 18;
type CountrySafeInsets = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

const COUNTRY_SAFE_INSETS_EXPANDED: CountrySafeInsets = {
  left: 396,
  right: 366,
  top: 96,
  bottom: 96,
};

const COUNTRY_SAFE_INSETS_COMPACT: CountrySafeInsets = {
  left: 396,
  right: 278,
  top: 96,
  bottom: 96,
};
const COUNTRY_ZOOM_MIN = 0.85;
const COUNTRY_ZOOM_MAX = 8;
const COUNTRY_ZOOM_STEP = 1.18;
const COUNTRY_SOURCES_CACHE_STALE_MS = 15 * 60 * 1000;
const COUNTRY_SOURCES_REFRESH_MS = 30 * 60 * 1000;
const SOURCE_DETAIL_CACHE_STALE_MS = 10 * 60 * 1000;
const SOURCE_DETAIL_REFRESH_MS = 15 * 60 * 1000;

function mapUserFacingError(error: string): string {
  const normalized = error.trim();
  const normalizedKey = normalized.toLowerCase();
  if (
    normalizedKey === 'customer api base url is not configured on the portal server.' ||
    normalizedKey === 'internal api token is not configured on the portal server.'
  ) {
    return 'Map metrics data is currently unavailable. Please try again later.';
  }
  return normalized;
}

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

function sameCountryViewport(a: CountryViewport, b: CountryViewport): boolean {
  return Math.abs(a.scale - b.scale) < 0.0001 && Math.abs(a.tx - b.tx) < 0.01 && Math.abs(a.ty - b.ty) < 0.01;
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

function getClusterWindowPublished(cluster: CountrySourceCluster, window: MapMetricWindow) {
  return cluster.windows[window].published;
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

type StageLegendItem = {
  dotClassName: string;
  label: string;
  description: string;
};

function getStageLegendItems(mapMode: MapMode): StageLegendItem[] {
  return mapMode === 'health'
    ? [
      {
        dotClassName: 'late-low',
        label: 'Healthy',
        description: 'Lower degraded-source share across the country or source base in the current window.',
      },
      {
        dotClassName: 'late-mid',
        label: 'Watch',
        description: 'Moderate degraded-source share. Some feeds or sitemaps are unstable and worth checking.',
      },
      {
        dotClassName: 'late-high',
        label: 'Degraded',
        description: 'High degraded-source share. This usually points to source-level delivery problems.',
      },
    ]
    : [
      {
        dotClassName: 'late-low',
        label: 'Fresh',
        description: 'Lower late share for the current window. Output is arriving relatively on time.',
      },
      {
        dotClassName: 'late-mid',
        label: 'Watch',
        description: 'Moderate late share. The market is active, but a noticeable part of the flow is delayed.',
      },
      {
        dotClassName: 'late-high',
        label: 'Late',
        description: 'High late share or degraded behavior in the current window. Inspect lagging or unstable sources.',
      },
    ];
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
  pub7d: number;
  pub24h: number;
  pub1h: number;
  windows: Record<MapMetricWindow, { published: number }>;
  sourceCount: number;
  headquartersCount: number;
  health: MapSourceMetricRow['health'];
  sources: MapSourceMetricRow[];
};

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

type PlacedClusterLabel = {
  cluster: CountrySourceCluster;
  point: { x: number; y: number };
  x: number;
  y: number;
  anchor: 'start' | 'end';
  width: number;
};

const COUNTRY_LABEL_MIN_WIDTH = 58;
const COUNTRY_LABEL_MAX_WIDTH = 220;
const COUNTRY_LABEL_LINE_HEIGHT = 20;
const COUNTRY_LABEL_TEXT_OFFSET = 12;
const COUNTRY_LABEL_COLLISION_PAD = 10;

function estimateCountryLabelWidth(text: string): number {
  return Math.min(COUNTRY_LABEL_MAX_WIDTH, Math.max(COUNTRY_LABEL_MIN_WIDTH, Math.round(text.length * 7.4 + 18)));
}

function rectsOverlap(
  a: { left: number; right: number; top: number; bottom: number },
  b: { left: number; right: number; top: number; bottom: number },
  padding = 0
): boolean {
  return !(
    a.right + padding <= b.left ||
    a.left - padding >= b.right ||
    a.bottom + padding <= b.top ||
    a.top - padding >= b.bottom
  );
}

function buildCountryPlaneLabels(
  clusters: CountrySourceCluster[],
  window: MapMetricWindow,
  safeInsets: CountrySafeInsets
): PlacedClusterLabel[] {
  const frame = {
    minX: safeInsets.left + 12,
    maxX: GLOBE_WIDTH - safeInsets.right - 12,
    minY: safeInsets.top + 12,
    maxY: GLOBE_HEIGHT - safeInsets.bottom - 12,
  };
  const centerX = (frame.minX + frame.maxX) / 2;
  const centerY = (frame.minY + frame.maxY) / 2;
  const occupied: Array<{ left: number; right: number; top: number; bottom: number }> = [];
  const placed: PlacedClusterLabel[] = [];

  const candidates = [...clusters]
    .sort((a, b) => getClusterWindowPublished(b, window) - getClusterWindowPublished(a, window))
    .slice(0, 8)
    .map((cluster) => {
      const text = cluster.sourceCount > 1 ? `${cluster.name} (${cluster.sourceCount})` : cluster.name;
      return {
        cluster,
        point: cluster.point,
        text,
        width: estimateCountryLabelWidth(text),
      };
    });

  for (const item of candidates) {
    const preferRight = item.point.x < centerX;
    const preferBelow = item.point.y < centerY;
    const verticalOffsets = preferBelow ? [12, 24, -10, -22] : [-10, -22, 12, 24];
    const horizontalSides = preferRight ? ['right', 'left'] : ['left', 'right'];
    let chosen: PlacedClusterLabel | null = null;

    for (const side of horizontalSides) {
      for (const dy of verticalOffsets) {
        const anchor = side === 'right' ? 'start' : 'end';
        const x = round(item.point.x + (side === 'right' ? COUNTRY_LABEL_TEXT_OFFSET : -COUNTRY_LABEL_TEXT_OFFSET), 2);
        const y = round(item.point.y + dy, 2);
        const left = anchor === 'start' ? x : x - item.width;
        const right = anchor === 'start' ? x + item.width : x;
        const top = y - COUNTRY_LABEL_LINE_HEIGHT + 4;
        const bottom = y + 4;

        if (left < frame.minX || right > frame.maxX || top < frame.minY || bottom > frame.maxY) {
          continue;
        }

        const collides = occupied.some((rect) => rectsOverlap(rect, { left, right, top, bottom }, COUNTRY_LABEL_COLLISION_PAD));
        if (collides) {
          continue;
        }

        chosen = {
          cluster: item.cluster,
          point: item.point,
          x,
          y,
          anchor,
          width: item.width,
        };
        occupied.push({ left, right, top, bottom });
        break;
      }
      if (chosen) break;
    }

    if (chosen) {
      placed.push(chosen);
    }
  }

  return placed;
}

function mergeHealthStatus(values: MapSourceMetricRow['health'][]): MapSourceMetricRow['health'] {
  if (values.includes('failing')) return 'failing';
  if (values.includes('degraded')) return 'degraded';
  if (values.includes('warning')) return 'warning';
  if (values.includes('healthy')) return 'healthy';
  return 'unknown';
}

function buildCountrySourceClusters(items: CountryPlottedPoint[], window: MapMetricWindow): CountrySourceCluster[] {
  const byKey = new Map<string, {
    id: string;
    name: string;
    city: string | null;
    region: string | null;
    sumX: number;
    sumY: number;
    pub7d: number;
    pub24h: number;
    pub1h: number;
    windows: Record<MapMetricWindow, { published: number }>;
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
      current.pub7d += item.source.windows['7d'].published;
      current.pub24h += item.source.pub24h;
      current.pub1h += item.source.pub1h;
      for (const metricWindow of ['1h', '24h', '7d'] as const) {
        current.windows[metricWindow].published += item.source.windows[metricWindow].published;
      }
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
      pub7d: item.source.windows['7d'].published,
      pub24h: item.source.pub24h,
      pub1h: item.source.pub1h,
      windows: {
        '1h': { published: item.source.windows['1h'].published },
        '24h': { published: item.source.windows['24h'].published },
        '7d': { published: item.source.windows['7d'].published },
      },
      headquartersCount: item.source.locationKind === 'headquarters' ? 1 : 0,
      health: [item.source.health],
      sources: [item.source],
    });
  }

  const semanticClusters = [...byKey.values()]
    .map((entry) => ({
      id: entry.id,
      name: entry.sources.length === 1 ? entry.sources[0].source : entry.name,
      city: entry.city,
      region: entry.region,
      point: {
        x: round(entry.sumX / entry.sources.length, 2),
        y: round(entry.sumY / entry.sources.length, 2),
      },
      pub7d: entry.pub7d,
      pub24h: entry.pub24h,
      pub1h: entry.pub1h,
      windows: entry.windows,
      sourceCount: entry.sources.length,
      headquartersCount: entry.headquartersCount,
      health: mergeHealthStatus(entry.health),
      sources: [...entry.sources].sort((a, b) => getSourceWindowMetrics(b, window).published - getSourceWindowMetrics(a, window).published || a.source.localeCompare(b.source)),
    }));

  const mergeDistance =
    semanticClusters.length >= 28
      ? 64
      : semanticClusters.length >= 16
        ? 54
        : 46;
  const sorted = [...semanticClusters].sort(
    (a, b) =>
      getClusterWindowPublished(b, window) - getClusterWindowPublished(a, window) ||
      b.sourceCount - a.sourceCount ||
      a.name.localeCompare(b.name)
  );
  const consumed = new Set<string>();
  const merged: CountrySourceCluster[] = [];

  for (const seed of sorted) {
    if (consumed.has(seed.id)) continue;

    const group = [seed];
    consumed.add(seed.id);
    let expanded = true;

    while (expanded) {
      expanded = false;
      for (const candidate of sorted) {
        if (consumed.has(candidate.id)) continue;
        const closeToGroup = group.some(
          (current) => Math.hypot(current.point.x - candidate.point.x, current.point.y - candidate.point.y) <= mergeDistance
        );
        if (!closeToGroup) continue;
        group.push(candidate);
        consumed.add(candidate.id);
        expanded = true;
      }
    }

    if (group.length === 1) {
      merged.push(seed);
      continue;
    }

    const primary = [...group].sort(
      (a, b) =>
        getClusterWindowPublished(b, window) - getClusterWindowPublished(a, window) ||
        b.sourceCount - a.sourceCount ||
        a.name.localeCompare(b.name)
    )[0];
    const cities = [...new Set(group.map((item) => item.city).filter((value): value is string => Boolean(value)))];
    const regions = [...new Set(group.map((item) => item.region).filter((value): value is string => Boolean(value)))];
    const weightTotal = group.reduce((sum, item) => sum + Math.max(1, getClusterWindowPublished(item, window)), 0);
    const sources = group
      .flatMap((item) => item.sources)
      .sort(
        (a, b) =>
          getSourceWindowMetrics(b, window).published - getSourceWindowMetrics(a, window).published ||
          a.source.localeCompare(b.source)
      );

    merged.push({
      id: `merged:${group.map((item) => item.id).sort().join('|')}`,
      name: cities.length === 1 ? cities[0] : regions.length === 1 ? regions[0] : primary.name,
      city: cities.length === 1 ? cities[0] : null,
      region: cities.length === 1 ? null : regions.length === 1 ? regions[0] : null,
      point: {
        x: round(
          group.reduce((sum, item) => sum + item.point.x * Math.max(1, getClusterWindowPublished(item, window)), 0) / weightTotal,
          2
        ),
        y: round(
          group.reduce((sum, item) => sum + item.point.y * Math.max(1, getClusterWindowPublished(item, window)), 0) / weightTotal,
          2
        ),
      },
      pub7d: group.reduce((sum, item) => sum + item.pub7d, 0),
      pub24h: group.reduce((sum, item) => sum + item.pub24h, 0),
      pub1h: group.reduce((sum, item) => sum + item.pub1h, 0),
      windows: {
        '1h': { published: group.reduce((sum, item) => sum + item.windows['1h'].published, 0) },
        '24h': { published: group.reduce((sum, item) => sum + item.windows['24h'].published, 0) },
        '7d': { published: group.reduce((sum, item) => sum + item.windows['7d'].published, 0) },
      },
      sourceCount: group.reduce((sum, item) => sum + item.sourceCount, 0),
      headquartersCount: group.reduce((sum, item) => sum + item.headquartersCount, 0),
      health: mergeHealthStatus(group.map((item) => item.health)),
      sources,
    });
  }

  return merged.sort(
    (a, b) => getClusterWindowPublished(b, window) - getClusterWindowPublished(a, window) || a.name.localeCompare(b.name)
  );
}

function deriveSummaryFromSources(items: MapSourceMetricRow[], window: MapMetricWindow) {
  const activeItems = items.filter((item) => isSourceWindowActive(item, window));
  return {
    published: activeItems.reduce((sum, item) => sum + getSourceWindowMetrics(item, window).published, 0),
    fresh: activeItems.reduce((sum, item) => sum + getSourceWindowMetrics(item, window).fresh, 0),
    late: activeItems.reduce((sum, item) => sum + getSourceWindowMetrics(item, window).late, 0),
    firstSeen: activeItems.reduce((sum, item) => sum + getSourceWindowMetrics(item, window).firstSeen, 0),
    activeSources: activeItems.length,
    rssSources: activeItems.filter((item) => item.method === 'rss' || item.method === 'rss+sitemap').length,
    sitemapSources: activeItems.filter((item) => item.method === 'sitemap' || item.method === 'rss+sitemap').length,
    healthySources: activeItems.filter((item) => item.health === 'healthy' || item.health === 'warning').length,
    degradedSources: activeItems.filter((item) => item.health === 'degraded' || item.health === 'failing').length,
  };
}

function deriveTopRegionsFromSources(items: MapSourceMetricRow[], country: string, window: MapMetricWindow, limit = 5) {
  const byRegion = new Map<string, { count: number; sources: number; unmapped: boolean }>();
  for (const item of items) {
    if (!isSourceWindowActive(item, window)) continue;
    const unmapped = item.locationKind === 'country-fallback' || item.locationKind === 'foreign-operated';
    const name = item.locationKind === 'foreign-operated' ? 'Foreign-operated' : unmapped ? 'Unmapped / National' : item.city || item.region || country;
    const current = byRegion.get(name) || { count: 0, sources: 0, unmapped: false };
    current.count += getSourceWindowMetrics(item, window).published;
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

function deriveTopDegradedRegionsFromSources(items: MapSourceMetricRow[], country: string, window: MapMetricWindow, limit = 5) {
  const byRegion = new Map<string, { degradedSources: number; sources: number; pub24h: number; degradedPub24h: number; unmapped: boolean }>();
  for (const item of items) {
    if (!isSourceWindowActive(item, window)) continue;
    const unmapped = item.locationKind === 'country-fallback' || item.locationKind === 'foreign-operated';
    const name = item.locationKind === 'foreign-operated' ? 'Foreign-operated' : unmapped ? 'Unmapped / National' : item.city || item.region || country;
    const current = byRegion.get(name) || {
      degradedSources: 0,
      sources: 0,
      pub24h: 0,
      degradedPub24h: 0,
      unmapped: false,
    };
    current.sources += 1;
    current.pub24h += getSourceWindowMetrics(item, window).published;
    current.unmapped = current.unmapped || unmapped;
    if (item.health === 'degraded' || item.health === 'failing') {
      current.degradedSources += 1;
      current.degradedPub24h += getSourceWindowMetrics(item, window).published;
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
  window,
  layers,
  viewport,
  safeInsets,
  onViewportChange,
  selectedClusterId,
  selectedSourceId,
  onSelectCluster,
}: {
  country: MapCountryMetricRow;
  world: WorldGeoJson | null;
  sources: MapSourceMetricRow[];
  window: MapMetricWindow;
  layers: MapLayerState;
  viewport: CountryViewport;
  safeInsets: CountrySafeInsets;
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
        [safeInsets.left + 36, safeInsets.top + 42],
        [GLOBE_WIDTH - safeInsets.right - 44, GLOBE_HEIGHT - safeInsets.bottom - 52],
      ],
      displayCountryFeature as never
    );
  }, [displayCountryFeature, safeInsets]);

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

  const clusters = useMemo(() => buildCountrySourceClusters(projected, window), [projected, window]);

  const clusterLabels = useMemo(() => {
    return buildCountryPlaneLabels(clusters, window, safeInsets);
  }, [clusters, safeInsets, window]);

  const contentBounds = useMemo(() => {
    const fallback = {
      minX: safeInsets.left + 36,
      maxX: GLOBE_WIDTH - safeInsets.right - 36,
      minY: safeInsets.top + 36,
      maxY: GLOBE_HEIGHT - safeInsets.bottom - 36,
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
  }, [clusters, projectedCountryBounds, safeInsets]);

  function clampViewport(next: CountryViewport): CountryViewport {
    const frameLeft = safeInsets.left;
    const frameTop = safeInsets.top;
    const frameWidth = GLOBE_WIDTH - safeInsets.left - safeInsets.right;
    const frameHeight = GLOBE_HEIGHT - safeInsets.top - safeInsets.bottom;
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

  useEffect(() => {
    const clamped = clampViewport(viewport);
    if (sameCountryViewport(clamped, viewport)) return;
    onViewportChange(clamped);
  }, [viewport, safeInsets, contentBounds, onViewportChange]);

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
            x={safeInsets.left}
            y={safeInsets.top}
            width={GLOBE_WIDTH - safeInsets.left - safeInsets.right}
            height={GLOBE_HEIGHT - safeInsets.top - safeInsets.bottom}
            rx="28"
          />
        </clipPath>
      </defs>

      <rect x="0" y="0" width="1800" height="1120" fill="url(#plane-fill)" />

      {layers.graticule ? (
        <g opacity="0.38">
          {Array.from({ length: 9 }).map((_, index) => {
            const span = GLOBE_WIDTH - safeInsets.left - safeInsets.right;
            const x = safeInsets.left + (index * span) / 8;
            return <line key={`vx-${index}`} x1={x} y1={safeInsets.top} x2={x} y2={GLOBE_HEIGHT - safeInsets.bottom} stroke="rgba(102, 196, 255, 0.07)" strokeWidth="1" />;
          })}
          {Array.from({ length: 6 }).map((_, index) => {
            const span = GLOBE_HEIGHT - safeInsets.top - safeInsets.bottom;
            const y = safeInsets.top + (index * span) / 5;
            return <line key={`hy-${index}`} x1={safeInsets.left} y1={y} x2={GLOBE_WIDTH - safeInsets.right} y2={y} stroke="rgba(102, 196, 255, 0.07)" strokeWidth="1" />;
          })}
        </g>
      ) : null}

      <rect
        x={safeInsets.left}
        y={safeInsets.top}
        width={GLOBE_WIDTH - safeInsets.left - safeInsets.right}
        height={GLOBE_HEIGHT - safeInsets.top - safeInsets.bottom}
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
        const radius = Math.max(6, Math.min(22, Math.sqrt(getClusterWindowPublished(cluster, window)) / 2.8 + cluster.sourceCount * 0.8));
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
              <title>{`${cluster.name}\n${formatNumber(getClusterWindowPublished(cluster, window))} / ${mapWindowDescriptor(window)}\n${formatNumber(cluster.pub24h)} / 24h\n${cluster.sourceCount} sources`}</title>
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
        ? clusterLabels.map(({ cluster, point, x, y, anchor }) => (
            <g key={`${cluster.id}-label`} style={{ pointerEvents: 'none' }}>
              <line
                x1={point.x}
                y1={point.y}
                x2={anchor === 'start' ? x - 6 : x + 6}
                y2={y - 4}
                stroke="rgba(170, 232, 255, 0.24)"
                strokeWidth={1 / viewport.scale}
              />
              <text x={x} y={y} textAnchor={anchor} className="map-source-label">
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
  const { hasToken, isReady } = useCustomerAccess();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [mapMode, setMapMode] = useState<MapMode>('countries');
  const [mapWindow, setMapWindow] = useState<MapMetricWindow>('24h');
  const [leftTab, setLeftTab] = useState<LeftTab>('overview');
  const [detailTab, setDetailTab] = useState<DetailTab>('metrics');
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
  const clearCountrySelectionRef = useRef(false);
  const localPreviewEnabled = process.env.NODE_ENV !== 'production';
  const detailAccessEnabled = localPreviewEnabled || (isReady && hasToken);
  const detailAccessLocked = !localPreviewEnabled && isReady && !hasToken;
  const countriesState = useRemoteJson<MapCountryMetricsResponse>(
    `/api/customer/map/countries?window=${mapWindow}`,
    undefined,
    { cacheMode: 'session' }
  );
  const publishersState = useRemoteJson<MapPublishersResponse>(
    `/api/customer/map/publishers?window=${mapWindow}`,
    undefined,
    { cacheMode: 'session' }
  );
  const worldState = useRemoteJson<WorldGeoJson>('/world.geojson', undefined, {
    cacheMode: 'session',
    staleMs: 24 * 60 * 60 * 1000,
  });
  const countryName = selectedCountry?.country || null;
  const sourcesState = useRemoteJson<MapCountrySourcesResponse>(
    detailAccessEnabled && countryName
      ? `/api/customer/map/countries/${encodeURIComponent(countryName)}/sources?window=${mapWindow}`
      : null,
    COUNTRY_SOURCES_REFRESH_MS,
    {
      cacheMode: 'session',
      staleMs: COUNTRY_SOURCES_CACHE_STALE_MS,
      requestCache: 'force-cache',
    }
  );
  const sourceDetailState = useRemoteJson<MapSourceDetailResponse>(
    detailAccessEnabled && selectedSource?.sourceId
      ? `/api/customer/map/sources/${encodeURIComponent(selectedSource.sourceId)}`
      : null,
    SOURCE_DETAIL_REFRESH_MS,
    {
      cacheMode: 'session',
      staleMs: SOURCE_DETAIL_CACHE_STALE_MS,
      requestCache: 'force-cache',
    }
  );

  const totals = countriesState.data?.totals || null;
  const topCountries = countriesState.data?.countries.slice(0, 8) || [];
  const topPublishers = publishersState.data?.publishers.slice(0, 8) || [];
  const selectedCountryTopPublishers =
    (selectedCountry ? sourcesState.data?.topPublishers || selectedCountry.topPublishers || [] : []);
  const selectedCountryTopRegions = selectedCountry ? sourcesState.data?.topRegions || [] : [];
  const selectedCountryHourly = selectedCountry ? sourcesState.data?.hourly24h || [] : [];
  const selectedCountryDaily = selectedCountry ? sourcesState.data?.daily7d || [] : [];
  const sourceDetailFallback = useMemo<MapSourceDetailResponse | null>(() => {
    if (!detailAccessEnabled || !selectedSource) return null;
    if (!selectedSource) return null;
    return {
      generatedAt:
        sourcesState.data?.generatedAt ||
        countriesState.data?.generatedAt ||
        publishersState.data?.generatedAt ||
        new Date().toISOString(),
      sourceId: selectedSource.sourceId,
      source: selectedSource.source,
      publisher: selectedSource.publisher,
      publisherConfidence: selectedSource.publisherConfidence,
      corporateCountry: null,
      corporateRegion: null,
      corporateCity: null,
      country: selectedSource.country,
      region: selectedSource.region,
      city: selectedSource.city,
      locationKind: selectedSource.locationKind,
      lat: selectedSource.lat,
      lon: selectedSource.lon,
      method: selectedSource.method,
      rssUrl: selectedSource.rssUrl,
      sitemapUrl: selectedSource.sitemapUrl,
      health: {
        status: selectedSource.health,
        lastCheckedAt: null,
        failRate24h: null,
        lastError: null,
      },
      metrics: {
        pub24h: selectedSource.pub24h,
        pub1h: selectedSource.pub1h,
        fresh24h: selectedSource.fresh24h,
        late24h: selectedSource.late24h,
        firstSeen24h: selectedSource.firstSeen24h,
      },
      hourly24h: [],
    };
  }, [selectedSource, sourcesState.data?.generatedAt, countriesState.data?.generatedAt, publishersState.data?.generatedAt]);
  const sourceDetail = sourceDetailState.data || sourceDetailFallback;
  const isCountryTransition = Boolean(selectedCountry && !sourcesState.data);
  const sceneMode = selectedCountry ? 'country' : 'globe';
  const globeRotationLon = useIdleRotation(motionEnabled && !selectedCountry && !interactionPaused);
  const healthCountries = countriesState.data?.countries || [];
  const latestMapUpdatedAt = Math.max(
    countriesState.data?.generatedAt ? Date.parse(countriesState.data.generatedAt) : 0,
    publishersState.data?.generatedAt ? Date.parse(publishersState.data.generatedAt) : 0,
    sourcesState.data?.generatedAt ? Date.parse(sourcesState.data.generatedAt) : 0,
    sourceDetailState.data?.generatedAt ? Date.parse(sourceDetailState.data.generatedAt) : 0
  ) || null;
  const latestMapUpdatedLabel = latestMapUpdatedAt
    ? `${new Date(latestMapUpdatedAt).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      })} (local time)`
    : null;
  const activeWindowDescriptor = mapWindowDescriptor(mapWindow);
  const totalWindowMetrics = totals?.windows[mapWindow] || null;
  const mapStorageMode = selectedCountry
    ? 'postgres'
    : (countriesState.data?.storage === 'snapshot' || publishersState.data?.storage === 'snapshot')
      ? 'snapshot'
      : 'postgres';
  const mapProvenanceLabel = mapStorageMode === 'snapshot' ? 'Hourly snapshot' : 'Live DB';
  const mapProvenanceNote = mapStorageMode === 'snapshot' ? 'precomputed after ingest' : 'auto refresh every 1h';
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
  const urlLayers = parseLayerState(searchParams.get('layers'));

  const healthTotals = useMemo(() => ({
    healthySources24h: healthCountries.reduce((sum, item) => sum + item.windows[mapWindow].healthySources, 0),
    degradedSources24h: healthCountries.reduce((sum, item) => sum + item.windows[mapWindow].degradedSources, 0),
    countriesWithIssues: healthCountries.filter((item) => item.windows[mapWindow].degradedSources > 0).length,
  }), [healthCountries, mapWindow]);
  const mapPanelLoading = selectedCountry
    ? sourcesState.loading || worldState.loading
    : mapMode === 'publishers'
      ? publishersState.loading || worldState.loading
      : countriesState.loading || worldState.loading;
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
      clearCountrySelectionRef.current = false;
      return;
    }

    if (clearCountrySelectionRef.current) {
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
  }, [urlCountry, countriesState.data, desiredCountryMatch, selectedCountry, globeRotationLon]);

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
  const mappedCountrySources = useMemo(
    () => displayedCountrySources.filter((item) => item.locationKind !== 'country-fallback' && item.locationKind !== 'foreign-operated'),
    [displayedCountrySources]
  );
  const selectedCountryFallbackSummary = useMemo(() => {
    const activeSources = displayedCountrySources.filter((item) => isSourceWindowActive(item, mapWindow));
    const fallbackSources = activeSources.filter((item) => item.locationKind === 'country-fallback');
    const foreignOperatedSources = activeSources.filter((item) => item.locationKind === 'foreign-operated');
    if (fallbackSources.length === 0 && foreignOperatedSources.length === 0) return null;
    return {
      fallback:
        fallbackSources.length > 0
          ? {
              sourceCount: fallbackSources.length,
              published: fallbackSources.reduce((sum, item) => sum + getSourceWindowMetrics(item, mapWindow).published, 0),
            }
          : null,
      foreignOperated:
        foreignOperatedSources.length > 0
          ? {
              sourceCount: foreignOperatedSources.length,
              published: foreignOperatedSources.reduce((sum, item) => sum + getSourceWindowMetrics(item, mapWindow).published, 0),
            }
          : null,
    };
  }, [displayedCountrySources, mapWindow]);

  const derivedCountrySummary = useMemo(() => deriveSummaryFromSources(displayedCountrySources, mapWindow), [displayedCountrySources, mapWindow]);
  const derivedTopSourceRows = useMemo(
    () =>
      [...displayedCountrySources]
        .filter((item) => isSourceWindowActive(item, mapWindow))
        .sort(
          (a, b) =>
            getSourceWindowMetrics(b, mapWindow).published - getSourceWindowMetrics(a, mapWindow).published ||
            a.source.localeCompare(b.source)
        )
        .slice(0, 10),
    [displayedCountrySources, mapWindow]
  );
  const derivedTopRegions = useMemo(
    () => selectedCountry ? deriveTopRegionsFromSources(displayedCountrySources, selectedCountry.country, mapWindow, 8) : [],
    [displayedCountrySources, selectedCountry, mapWindow]
  );
  const derivedTopDegradedRegions = useMemo(
    () => selectedCountry ? deriveTopDegradedRegionsFromSources(displayedCountrySources, selectedCountry.country, mapWindow, 8) : [],
    [displayedCountrySources, selectedCountry, mapWindow]
  );
  const derivedTopDegradedSources = useMemo(
    () =>
      [...displayedCountrySources]
        .filter((item) => item.health === 'degraded' || item.health === 'failing')
        .sort((a, b) => getHealthRank(b.health) - getHealthRank(a.health) || getSourceWindowMetrics(b, mapWindow).published - getSourceWindowMetrics(a, mapWindow).published || a.source.localeCompare(b.source))
        .slice(0, 8),
    [displayedCountrySources, mapWindow]
  );
  const selectedCountryTopRegionsDisplay = mapMode === 'health'
    ? []
    : mapMode === 'publishers'
      ? derivedTopRegions
      : selectedCountryTopRegions;
  const selectedCountryTopSourceRows = mapMode === 'health'
    ? derivedTopDegradedSources
    : derivedTopSourceRows;
  const selectedCountrySummaryDisplay = derivedCountrySummary;
  const selectedCountryTrendBars = mapWindow === '7d'
    ? selectedCountryDaily.map((item) => ({ bucket: item.day, count: item.count }))
    : selectedCountryHourly.map((item) => ({ bucket: item.hour, count: item.count }));
  const selectedCountryTrendTitle = mapWindow === '7d' ? 'Country Daily Trend' : 'Country Hourly Trend';
  const selectedCountryTrendWindowLabel = mapWindow === '7d'
    ? 'Last 7 days'
    : mapWindow === '1h'
      ? 'Last 24h context'
      : 'Last 24h';
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
        subtitle: `${formatNumber(getPublisherWindowMetrics(item, mapWindow).published)} published · ${formatNumber(getPublisherWindowMetrics(item, mapWindow).activeCountries)} countries · ${publisherConfidenceLabel(item.publisherConfidence)}`,
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
    if (detailAccessEnabled) return;
    if (selectedCluster) {
      setSelectedCluster(null);
    }
    if (selectedSource) {
      setSelectedSource(null);
    }
    if (detailTab !== 'metrics') {
      setDetailTab('metrics');
    }
  }, [detailAccessEnabled, selectedCluster, selectedSource, detailTab]);

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
    clearCountrySelectionRef.current = true;
    setSceneOrigin({ x: 50, y: 52 });
    setSelectedCountry(null);
    setSelectedCluster(null);
    setSelectedSource(null);
    setCountryViewport(DEFAULT_COUNTRY_VIEWPORT);
    setLeftTab('overview');
    const targetQuery = buildMapQueryString({
      mode: mapMode,
      window: mapWindow,
      country: null,
      publisher: mapMode === 'publishers' ? selectedPublisher?.publisher || null : null,
      source: null,
      leftTab: 'overview',
      detailTab,
      benchmarkOpen: false,
      layers,
    });
    const targetUrl = targetQuery ? `${pathname}?${targetQuery}` : pathname;
    window.history.replaceState(window.history.state, '', targetUrl);
    router.replace(targetUrl, { scroll: false });
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

  function zoomCountry(direction: 1 | -1) {
    if (!selectedCountry) return;
    const targetScale = clamp(
      countryViewport.scale * (direction > 0 ? COUNTRY_ZOOM_STEP : 1 / COUNTRY_ZOOM_STEP),
      COUNTRY_ZOOM_MIN,
      COUNTRY_ZOOM_MAX
    );
    if (Math.abs(targetScale - countryViewport.scale) < 0.0001) return;

    const frameWidth = GLOBE_WIDTH - countrySafeInsets.left - countrySafeInsets.right;
    const frameHeight = GLOBE_HEIGHT - countrySafeInsets.top - countrySafeInsets.bottom;
    const centerX = countrySafeInsets.left + frameWidth / 2;
    const centerY = countrySafeInsets.top + frameHeight / 2;
    const worldX = (centerX - countryViewport.tx) / countryViewport.scale;
    const worldY = (centerY - countryViewport.ty) / countryViewport.scale;

    setCountryViewport({
      scale: targetScale,
      tx: round(centerX - worldX * targetScale, 2),
      ty: round(centerY - worldY * targetScale, 2),
    });
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
    benchmarkOpen: false,
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
    benchmarkOpen: false,
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

  const panelErrors = Array.from(
    new Set(
      [
        countriesState.error,
        publishersState.error,
        sourcesState.error,
        worldState.error,
      ]
        .map((error) => (error ? mapUserFacingError(error) : ''))
        .filter((value): value is string => Boolean(value))
    )
  );
  const sourceDetailError = sourceDetailState.error ? mapUserFacingError(sourceDetailState.error) : null;

  const countryZoomLabel = `${countryViewport.scale.toFixed(1)}x Zoom`;
  const stageLegendItems = !selectedCountry ? getStageLegendItems(mapMode) : [];
  const compactDetailHint = !selectedCountry && !selectedSource && !selectedCluster && mapMode === 'countries';
  const countrySafeInsets =
    selectedCountry && mapMode === 'countries' && !selectedSource && !selectedCluster
      ? COUNTRY_SAFE_INSETS_COMPACT
      : COUNTRY_SAFE_INSETS_EXPANDED;

  return (
    <div className="page-stack map-page-stack map-page-root">
      <section className={`map-workbench ${compactDetailHint ? 'is-compact-detail-hint' : ''}`}>
        <div className="map-stage-shell">
          <div
            className="map-stage"
            onPointerEnter={() => {
              if (!selectedCountry) setInteractionPaused(true);
            }}
            onPointerLeave={() => {
              if (!selectedCountry) setInteractionPaused(false);
            }}
          >
            <MapFloatingToolbar
              selectedCountry={selectedCountry}
              mapMode={mapMode}
              motionEnabled={motionEnabled}
              searchOpen={searchOpen}
              searchQuery={searchQuery}
              searchMode={searchMode}
              searchResults={searchResults}
              countryZoomLabel={countryZoomLabel}
              countriesLoading={countriesState.loading}
              publishersLoading={publishersState.loading}
              searchInputRef={searchInputRef}
              onResetToGlobe={resetToGlobe}
              onZoomOut={() => zoomCountry(-1)}
              onZoomIn={() => zoomCountry(1)}
              onResetZoom={() => setCountryViewport(DEFAULT_COUNTRY_VIEWPORT)}
              onToggleMotion={() => setMotionEnabled((current) => !current)}
              onSearchOpen={() => setSearchOpen(true)}
              onSearchClose={() => setSearchOpen(false)}
              onSearchChange={(value) => {
                setSearchQuery(value);
                setSearchOpen(true);
              }}
              onCommitSearchResult={commitSearchResult}
            />

            {!selectedCountry ? (
              <div className="map-stage-legend" aria-label="Bubble color meaning">
                {stageLegendItems.map((item) => (
                  <div key={item.label} className="map-stage-legend-item">
                    <span className={`legend-dot ${item.dotClassName}`} />
                    <HelpTooltipLabel label={item.label} description={item.description} />
                  </div>
                ))}
              </div>
            ) : null}

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
              {selectedCountry ? (
                sourcesState.data ? (
                  <CountryPlaneSvg
                    country={selectedCountry}
                    world={worldState.data}
                    sources={mappedCountrySources}
                    window={mapWindow}
                    layers={layers}
                    viewport={countryViewport}
                    safeInsets={countrySafeInsets}
                    onViewportChange={setCountryViewport}
                    selectedClusterId={selectedCluster?.id || null}
                    selectedSourceId={selectedSource?.sourceId || null}
                    onSelectCluster={focusCluster}
                  />
                ) : (
                  <div className="map-country-transition">
                    <div className="map-country-transition-card">
                      <div className="eyebrow">Camera Shift</div>
                      <strong>
                        {sourcesState.loading
                          ? `Loading ${selectedCountry.country} regional map`
                          : sourcesState.error
                            ? `${selectedCountry.country} regional map unavailable`
                            : `Preparing ${selectedCountry.country} regional map`}
                      </strong>
                      <span>
                        {sourcesState.loading
                          ? 'Switching from the globe to a focused flat country view.'
                          : sourcesState.error
                            ? 'Country-level source clusters could not be loaded for this selection.'
                            : 'Building the flat map scene and source clusters.'}
                      </span>
                    </div>
                  </div>
                )
              ) : (
                <WorldGlobeSvg
                  countries={globeCountries}
                  world={worldState.data}
                  layers={layers}
                  mapMode={mapMode}
                  window={mapWindow}
                  rotationLon={globeRotationLon}
                  selectedCountry={null}
                  onSelectCountry={focusCountry}
                />
              )}
            </div>
          </div>

          <MapSidePanel
            mapMode={mapMode}
            mapWindow={mapWindow}
            leftTab={leftTab}
            selectedCountry={selectedCountry}
            countryDataReady={Boolean(selectedCountry && sourcesState.data)}
            detailSelectionActive={Boolean(selectedCluster || selectedSource)}
            detailAccessLocked={detailAccessLocked}
            selectedPublisher={selectedPublisher}
            selectedPublisherWindowMetrics={selectedPublisherWindowMetrics}
            totals={totals}
            totalWindowMetrics={totalWindowMetrics}
            topCountries={topCountries}
            topPublishers={topPublishers}
            topDegradedCountries={topDegradedCountries}
            selectedCountrySummaryDisplay={selectedCountrySummaryDisplay}
            selectedCountryTrendTitle={selectedCountryTrendTitle}
            selectedCountryTrendWindowLabel={selectedCountryTrendWindowLabel}
            selectedCountryTrendBars={selectedCountryTrendBars}
            selectedCountryTopRegionsDisplay={selectedCountryTopRegionsDisplay}
            selectedCountryTopPublishers={selectedCountryTopPublishers}
            selectedCountryTopSourceRows={selectedCountryTopSourceRows}
            selectedCountryFallbackSummary={selectedCountryFallbackSummary}
            derivedTopDegradedRegions={derivedTopDegradedRegions}
            derivedTopDegradedSources={derivedTopDegradedSources}
            activeWindowDescriptor={activeWindowDescriptor}
            latestMapUpdatedLabel={latestMapUpdatedLabel}
            mapProvenanceLabel={mapProvenanceLabel}
            mapProvenanceNote={mapProvenanceNote}
            motionEnabled={motionEnabled}
            layers={layers}
            healthTotals={healthTotals}
            loading={mapPanelLoading}
            errors={panelErrors}
            onMapModeChange={setMapMode}
            onMapWindowChange={setMapWindow}
            onLeftTabChange={setLeftTab}
            onToggleLayer={toggleLayer}
            onToggleMotion={() => setMotionEnabled((current) => !current)}
            onFocusCountryName={(countryName) => {
              const match = countriesState.data?.countries.find((countryRow) => countryRow.country === countryName);
              if (match) focusCountry(match);
            }}
            onSelectPublisher={setSelectedPublisher}
            onSelectSource={(item) => {
              if ('sourceId' in item) {
                setSelectedCluster(null);
                setSelectedSource(item);
                return;
              }
              const match = sourcesState.data?.sources.find((source) => source.source === item.name);
              if (match) {
                setSelectedCluster(null);
                setSelectedSource(match);
              }
            }}
          />

          <MapDetailDrawer
            mapMode={mapMode}
            mapWindow={mapWindow}
            activeWindowDescriptor={activeWindowDescriptor}
            selectedCountry={selectedCountry}
            selectedCluster={selectedCluster}
            selectedSource={selectedSource}
            selectedPublisher={selectedPublisher}
            selectedPublisherWindowMetrics={selectedPublisherWindowMetrics}
            selectedPublisherReliability={selectedPublisherReliability}
            detailAccessLocked={detailAccessLocked}
            sourceDetail={sourceDetail}
            sourceDetailLoading={sourceDetailState.loading}
            sourceDetailError={sourceDetailError}
            selectedClusterSourcesDisplay={selectedClusterSourcesDisplay}
            topDegradedCountries={topDegradedCountries}
            healthTotals={healthTotals}
            detailTab={detailTab}
            onDetailTabChange={setDetailTab}
            onFocusCountry={(countryName) => {
              const match = countriesState.data?.countries.find((countryRow) => countryRow.country === countryName);
              if (match) focusCountry(match);
            }}
            onSelectSource={setSelectedSource}
            onClearSelectedSource={() => setSelectedSource(null)}
          />
        </div>

      </section>
    </div>
  );
}
