'use client';

import { useEffect, useState } from 'react';
import {
  getCountryWindowMetrics,
  getSourceWindowMetrics,
  isSourceWindowActive,
} from '@/lib/map-display';
import type {
  MapCountryMetricRow,
  MapMetricWindow,
  MapSourceMetricRow,
} from '@/lib/map-types';
import type { MapMode } from '@/lib/map-view-state';

export type WorldGeoJsonFeature = {
  id?: string | number;
  properties?: {
    name?: string;
  };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
};

export type WorldGeoJson = {
  type: 'FeatureCollection';
  features: WorldGeoJsonFeature[];
};

type ProjectedPoint = {
  x: number;
  y: number;
  visible: boolean;
};

export type CountrySafeInsets = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type CountryStageSize = {
  width: number;
  height: number;
};

export type CountryViewport = {
  scale: number;
  tx: number;
  ty: number;
};

type CountryPlottedPoint = {
  source: MapSourceMetricRow;
  point: { x: number; y: number };
};

export type CountrySourceCluster = {
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

export type StageLegendItem = {
  dotClassName: string;
  label: string;
  description: string;
};

export const GLOBE_WIDTH = 1800;
export const GLOBE_HEIGHT = 1120;
export const GLOBE_CENTER_X = 1008;
export const GLOBE_CENTER_Y = 554;
export const GLOBE_RADIUS = 422;
export const GLOBE_ROTATION_LON = 78;
export const GLOBE_ROTATION_LAT = 18;

const COUNTRY_PANEL_OFFSET = 18;
const COUNTRY_SIDE_PANEL_WIDTH = 336;
const COUNTRY_DETAIL_PANEL_WIDTH = 320;
const COUNTRY_COMPACT_DETAIL_PANEL_WIDTH = 224;
const COUNTRY_SAFE_EDGE_GAP = 24;

export const DEFAULT_COUNTRY_STAGE_SIZE: CountryStageSize = {
  width: 1252,
  height: 780,
};

export const COUNTRY_SAFE_INSETS_EXPANDED_PX: CountrySafeInsets = {
  left: COUNTRY_PANEL_OFFSET + COUNTRY_SIDE_PANEL_WIDTH + COUNTRY_SAFE_EDGE_GAP,
  right: COUNTRY_PANEL_OFFSET + COUNTRY_DETAIL_PANEL_WIDTH + COUNTRY_SAFE_EDGE_GAP,
  top: 96,
  bottom: 96,
};

export const COUNTRY_SAFE_INSETS_COMPACT_PX: CountrySafeInsets = {
  left: COUNTRY_PANEL_OFFSET + COUNTRY_SIDE_PANEL_WIDTH + COUNTRY_SAFE_EDGE_GAP,
  right: COUNTRY_PANEL_OFFSET + COUNTRY_COMPACT_DETAIL_PANEL_WIDTH + COUNTRY_SAFE_EDGE_GAP,
  top: 96,
  bottom: 96,
};

export const COUNTRY_ZOOM_MIN = 1;
export const COUNTRY_ZOOM_MAX = 8;
export const COUNTRY_ZOOM_STEP = 1.18;

export const DEFAULT_COUNTRY_VIEWPORT: CountryViewport = {
  scale: 1,
  tx: 0,
  ty: 0,
};

export const COUNTRY_ALIASES: Record<string, string[]> = {
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

export function round(value: number, digits = 2): number {
  const precision = 10 ** digits;
  return Math.round(value * precision) / precision;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function scaleCountrySafeInsets(pxInsets: CountrySafeInsets, stageSize: CountryStageSize): CountrySafeInsets {
  const width = stageSize.width > 0 ? stageSize.width : DEFAULT_COUNTRY_STAGE_SIZE.width;
  const height = stageSize.height > 0 ? stageSize.height : DEFAULT_COUNTRY_STAGE_SIZE.height;
  return {
    left: Math.round((pxInsets.left / width) * GLOBE_WIDTH),
    right: Math.round((pxInsets.right / width) * GLOBE_WIDTH),
    top: Math.round((pxInsets.top / height) * GLOBE_HEIGHT),
    bottom: Math.round((pxInsets.bottom / height) * GLOBE_HEIGHT),
  };
}

export function sameCountryViewport(a: CountryViewport, b: CountryViewport): boolean {
  return Math.abs(a.scale - b.scale) < 0.0001 && Math.abs(a.tx - b.tx) < 0.01 && Math.abs(a.ty - b.ty) < 0.01;
}

export function normalizeCountryName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function degToRad(value: number): number {
  return (value * Math.PI) / 180;
}

export function projectToGlobe(lat: number, lon: number, rotationLon = GLOBE_ROTATION_LON): ProjectedPoint {
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

export function buildFlowPath(start: { x: number; y: number }, end: { x: number; y: number }): string {
  const midpointX = (start.x + end.x) / 2;
  const midpointY = (start.y + end.y) / 2;
  const pullX = midpointX - GLOBE_CENTER_X;
  const pullY = midpointY - GLOBE_CENTER_Y;
  const pullLength = Math.max(1, Math.hypot(pullX, pullY));
  const controlX = round(midpointX + (pullX / pullLength) * 56, 2);
  const controlY = round(midpointY + (pullY / pullLength) * 56, 2);
  return `M${start.x},${start.y} Q${controlX},${controlY} ${end.x},${end.y}`;
}

export function useIdleRotation(enabled: boolean): number {
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

export function getClusterWindowPublished(cluster: CountrySourceCluster, window: MapMetricWindow) {
  return cluster.windows[window].published;
}

export function getHealthColor(status: MapSourceMetricRow['health'] | 'country'): string {
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

export function getCountryBubbleColor(row: MapCountryMetricRow, mode: MapMode, window: MapMetricWindow): string {
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

export function getStageLegendItems(mapMode: MapMode): StageLegendItem[] {
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

export function findWorldFeature(world: WorldGeoJson | null, country: string): WorldGeoJsonFeature | null {
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

export function selectDisplayFeature(feature: WorldGeoJsonFeature | null, sources: MapSourceMetricRow[]): WorldGeoJsonFeature | null {
  if (!feature) return null;
  if (feature.geometry.type !== 'MultiPolygon') return feature;

  const polygons = feature.geometry.coordinates as number[][][][];
  if (polygons.length <= 1) return feature;

  const scored = polygons.map((polygon) => ({
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

export function buildSyntheticCountryFeature(sources: MapSourceMetricRow[]): WorldGeoJsonFeature | null {
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

export function projectCountryToPlane(
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

export function buildNonOverlappingLabels<T extends { x: number; y: number }>(
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

export function buildCountrySourceClusters(items: CountryPlottedPoint[], window: MapMetricWindow): CountrySourceCluster[] {
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
      sources: [...entry.sources].sort(
        (a, b) =>
          getSourceWindowMetrics(b, window).published - getSourceWindowMetrics(a, window).published ||
          a.source.localeCompare(b.source)
      ),
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

export function deriveSummaryFromSources(items: MapSourceMetricRow[], window: MapMetricWindow) {
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

export function deriveTopRegionsFromSources(items: MapSourceMetricRow[], country: string, window: MapMetricWindow, limit = 5) {
  const byRegion = new Map<string, { count: number; sources: number; unmapped: boolean }>();
  for (const item of items) {
    if (!isSourceWindowActive(item, window)) continue;
    const unmapped = item.locationKind === 'country-fallback';
    const name = unmapped ? 'Unmapped / National' : item.city || item.region || country;
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

export function deriveTopDegradedRegionsFromSources(
  items: MapSourceMetricRow[],
  country: string,
  window: MapMetricWindow,
  limit = 5
) {
  const byRegion = new Map<string, { degradedSources: number; sources: number; pub24h: number; degradedPub24h: number; unmapped: boolean }>();
  for (const item of items) {
    if (!isSourceWindowActive(item, window)) continue;
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

export function itemDegradedShare(row: MapCountryMetricRow, window: MapMetricWindow) {
  const metrics = row.windows[window];
  return metrics.activeSources > 0 ? metrics.degradedSources / metrics.activeSources : 0;
}

export function deriveTopDegradedCountries(items: MapCountryMetricRow[], window: MapMetricWindow, limit = 6) {
  return [...items]
    .filter((item) => item.windows[window].degradedSources > 0)
    .sort((a, b) => {
      const aShare = itemDegradedShare(a, window);
      const bShare = itemDegradedShare(b, window);
      return bShare - aShare || b.windows[window].degradedSources - a.windows[window].degradedSources || a.country.localeCompare(b.country);
    })
    .slice(0, limit);
}

export function getHealthRank(status: MapSourceMetricRow['health']) {
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

export const STAR_FIELD = buildStarField();
