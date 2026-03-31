'use client';

import type { CSSProperties, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { geoGraticule10, geoMercator, geoOrthographic, geoPath } from 'd3-geo';
import type {
  MapCountryMetricsResponse,
  MapCountryMetricRow,
  MapCountrySourcesResponse,
  MapSourceDetailResponse,
  MapSourceMetricRow,
} from '@/lib/map-types';

type JsonState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
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

function useRemoteJson<T>(url: string | null): JsonState<T> {
  const [state, setState] = useState<JsonState<T>>({
    data: null,
    loading: Boolean(url),
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    if (!url) {
      setState({ data: null, loading: false, error: null });
      return () => {
        cancelled = true;
      };
    }

    setState((current) => ({ data: current.data, loading: true, error: null }));

    fetch(url, { cache: 'no-store', credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message || `${response.status} ${response.statusText}`);
        }
        return (await response.json()) as T;
      })
      .then((payload) => {
        if (!cancelled) {
          setState({ data: payload, loading: false, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            data: null,
            loading: false,
            error: error instanceof Error ? error.message : 'Failed to load resource.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

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

function getCountryBubbleColor(row: MapCountryMetricRow): string {
  if (row.lateShare >= 0.2) return '#ff5f8b';
  if (row.lateShare >= 0.08) return '#ffcf5a';
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

const STAR_FIELD = buildStarField();

function WorldGlobeSvg({
  countries,
  world,
  layers,
  rotationLon,
  selectedCountry,
  onSelectCountry,
}: {
  countries: MapCountryMetricRow[];
  world: WorldGeoJson | null;
  layers: MapLayerState;
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
        .sort((a, b) => a.row.pub24h - b.row.pub24h),
    [countries, rotationLon]
  );

  const flowPaths = useMemo(() => {
    const candidates = [...visibleCountries].sort((a, b) => b.row.pub24h - a.row.pub24h).slice(0, 10);
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
          const weight = Math.min(current.row.pub24h, neighbor.row.pub24h);
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
        .sort((a, b) => b.row.pub24h - a.row.pub24h)
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
  }, [visibleCountries]);

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
        const radius = Math.max(4, Math.min(18, Math.sqrt(row.pub24h) / 3.8));
        const hitRadius = Math.max(18, radius * 2.4);
        const color = getCountryBubbleColor(row);
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
              <title>{`${row.country}\n${formatNumber(row.pub24h)} / 24h\n${formatNumber(row.activeSources24h)} active sources`}</title>
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
  const [leftTab, setLeftTab] = useState<'overview' | 'layers' | 'leaders'>('overview');
  const [detailTab, setDetailTab] = useState<'metrics' | 'headlines' | 'health'>('metrics');
  const [selectedCountry, setSelectedCountry] = useState<MapCountryMetricRow | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<CountrySourceCluster | null>(null);
  const [selectedSource, setSelectedSource] = useState<MapSourceMetricRow | null>(null);
  const [countryViewport, setCountryViewport] = useState<CountryViewport>(DEFAULT_COUNTRY_VIEWPORT);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [sceneOrigin, setSceneOrigin] = useState<{ x: number; y: number }>({ x: 56, y: 52 });
  const [layers, setLayers] = useState<MapLayerState>({
    labels: true,
    graticule: true,
    land: true,
    glow: true,
    flows: true,
  });
  const countriesState = useRemoteJson<MapCountryMetricsResponse>('/api/customer/dashboard/map/countries');
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
  const selectedCountrySummary = sourcesState.data?.summary || null;
  const selectedCountryTopPublishers =
    (selectedCountry ? sourcesState.data?.topPublishers || selectedCountry.topPublishers || [] : []);
  const selectedCountryTopRegions = selectedCountry ? sourcesState.data?.topRegions || [] : [];
  const selectedCountryHourly = selectedCountry ? sourcesState.data?.hourly24h || [] : [];
  const sourceDetail = sourceDetailState.data;
  const sceneMode = selectedCountry && sourcesState.data ? 'country' : 'globe';
  const globeRotationLon = useIdleRotation(motionEnabled && !selectedCountry && !interactionPaused);

  useEffect(() => {
    setDetailTab('metrics');
  }, [selectedSource?.sourceId]);

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
              </>
            ) : (
              <>
                <div className="map-toolbar-chip">3D Globe View</div>
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
                sources={sourcesState.data.sources}
                layers={layers}
                viewport={countryViewport}
                onViewportChange={setCountryViewport}
                selectedClusterId={selectedCluster?.id || null}
                selectedSourceId={selectedSource?.sourceId || null}
                onSelectCluster={focusCluster}
              />
            ) : (
              <WorldGlobeSvg
                countries={countriesState.data?.countries || []}
                world={worldState.data}
                layers={layers}
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

        <aside className="map-side-panel">
          <div className="map-panel-head">
            <div>
              <div className="eyebrow">{selectedCountry ? 'Country Detail' : 'Global Overview'}</div>
              <h2>{selectedCountry ? selectedCountry.country : 'World Publishing Pulse'}</h2>
            </div>
            <div className={`map-status-pill ${selectedCountry ? 'flat' : 'globe'}`}>
              {selectedCountry ? 'Flat Map' : '3D Globe'}
            </div>
          </div>

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
              aria-selected={leftTab === 'leaders'}
              className={`map-tab-chip ${leftTab === 'leaders' ? 'active' : ''}`}
              onClick={() => setLeftTab('leaders')}
            >
              Leaders
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={leftTab === 'layers'}
              className={`map-tab-chip ${leftTab === 'layers' ? 'active' : ''}`}
              onClick={() => setLeftTab('layers')}
            >
              Layers
            </button>
          </div>

          <div className="map-tab-panel">
            {leftTab === 'overview' ? (
              <>
                {!selectedCountry && totals ? (
                  <div className="map-stat-grid">
                    <article className="map-stat-card">
                      <span>Published 24h</span>
                      <strong>{formatNumber(totals.pub24h)}</strong>
                    </article>
                    <article className="map-stat-card">
                      <span>Published 1h</span>
                      <strong>{formatNumber(totals.pub1h)}</strong>
                    </article>
                    <article className="map-stat-card">
                      <span>Countries</span>
                      <strong>{formatNumber(totals.countries)}</strong>
                    </article>
                    <article className="map-stat-card">
                      <span>Active Sources</span>
                      <strong>{formatNumber(totals.activeSources24h)}</strong>
                    </article>
                  </div>
                ) : null}

                {selectedCountry && selectedCountrySummary ? (
                  <div className="map-stat-grid">
                    <article className="map-stat-card">
                      <span>Published 24h</span>
                      <strong>{formatNumber(selectedCountrySummary.pub24h)}</strong>
                    </article>
                    <article className="map-stat-card">
                      <span>Published 1h</span>
                      <strong>{formatNumber(selectedCountrySummary.pub1h)}</strong>
                    </article>
                    <article className="map-stat-card">
                      <span>RSS Sources</span>
                      <strong>{formatNumber(selectedCountrySummary.rssSources24h)}</strong>
                    </article>
                    <article className="map-stat-card">
                      <span>Sitemap Sources</span>
                      <strong>{formatNumber(selectedCountrySummary.sitemapSources24h)}</strong>
                    </article>
                  </div>
                ) : null}

                {selectedCountry ? (
                  <div className="map-panel-block compact">
                    <div className="section-head sub">
                      <h3>Country Hourly Trend</h3>
                      <span>Last 24 hours</span>
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

                {selectedCountry ? (
                  <div className="map-panel-block compact">
                    <div className="section-head sub">
                      <h3>Top Regions</h3>
                      <span>24h clustered output</span>
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

                <div className="map-story-card">
                  <div className="eyebrow">{selectedCountry ? 'Country Drilldown' : 'World Publishing Pulse'}</div>
                  <strong>{selectedCountry ? `${selectedCountry.country} cluster map` : 'Country publishing globe'}</strong>
                  <span>
                    {selectedCountry
                      ? 'Country detail shows city or regional bubbles first. Scroll to zoom, drag to pan, then click a bubble and choose a source from the drawer list.'
                      : 'Country bubbles are sized by 24h publishing volume and color-shift on freshness and late share.'}
                  </span>
                </div>
              </>
            ) : null}

            {leftTab === 'leaders' ? (
              <div className="map-panel-block compact">
                <div className="section-head">
                  <h3>{selectedCountry ? 'Leaders' : 'Top Countries'}</h3>
                  <span>{selectedCountry ? '24h publishers and sources' : '24h country output'}</span>
                </div>
                {!selectedCountry ? (
                  <div className="map-list">
                    {topCountries.slice(0, 6).map((item) => (
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
                        <span>{formatNumber(item.pub24h)}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="section-head sub">
                      <h3>Top Publishers</h3>
                      <span>24h network output</span>
                    </div>
                    <div className="map-list">
                      {selectedCountryTopPublishers.slice(0, 5).map((item) => (
                        <div key={item.name} className="map-list-row static">
                          <strong>{item.name}</strong>
                          <span>{formatNumber(item.count)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="section-head sub">
                      <h3>Top Sources</h3>
                      <span>24h source output</span>
                    </div>
                    <div className="map-list">
                      {(sourcesState.data?.topSources || []).slice(0, 6).map((item) => (
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
                )}
              </div>
            ) : null}

            {leftTab === 'layers' ? (
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
                  <div><span className="legend-dot late-low" /> Healthy / fresh</div>
                  <div><span className="legend-dot late-mid" /> Moderate late share</div>
                  <div><span className="legend-dot late-high" /> High late share / degraded</div>
                </div>
              </div>
            ) : null}
          </div>

          {(countriesState.loading || sourcesState.loading || worldState.loading) ? <div className="panel muted">Loading map metrics...</div> : null}
          {countriesState.error ? <div className="panel danger">{countriesState.error}</div> : null}
          {sourcesState.error ? <div className="panel danger">{sourcesState.error}</div> : null}
          {worldState.error ? <div className="panel danger">{worldState.error}</div> : null}
        </aside>

        <aside className="map-detail-drawer">
          <div className="map-panel-head">
            <div>
              <div className="eyebrow">{selectedSource ? 'Source Detail' : selectedCluster ? 'Cluster Detail' : 'Source Detail'}</div>
              <h2>{sourceDetail?.source || selectedCluster?.name || 'Select a source'}</h2>
            </div>
            {sourceDetail ? <div className={`map-status-pill ${sourceDetail.health.status === 'healthy' ? 'globe' : 'flat'}`}>{sourceDetail.health.status}</div> : null}
            {!sourceDetail && selectedCluster ? <div className="map-status-pill globe">{selectedCluster.sourceCount} sources</div> : null}
          </div>

          {!selectedSource && !selectedCluster ? (
            <div className="panel muted">
              Choose a country, then click a city or region bubble. The drawer will list sources in that area, and from there you can open full source detail.
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
                  <span>Choose a source for detail</span>
                </div>
                <div className="map-list">
                  {selectedCluster.sources.slice(0, 16).map((source) => (
                    <button
                      key={source.sourceId}
                      type="button"
                      className="map-list-row"
                      onClick={() => setSelectedSource(source)}
                    >
                      <div className="map-list-copy">
                        <strong>{source.source}</strong>
                        <span>{source.region || source.city || source.country}</span>
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
      </section>
    </div>
  );
}
