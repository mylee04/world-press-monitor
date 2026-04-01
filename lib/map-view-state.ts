import type { MapCountryMetricRow, MapMetricWindow, MapPublisherMetricRow } from '@/lib/map-types';

export type MapLayerState = {
  labels: boolean;
  graticule: boolean;
  land: boolean;
  glow: boolean;
  flows: boolean;
};

export type MapMode = 'countries' | 'publishers' | 'health';
export type LeftTab = 'overview' | 'display';
export type DetailTab = 'metrics' | 'headlines' | 'health';
export type MapSearchResult =
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

export const MAP_WINDOW_OPTIONS: MapMetricWindow[] = ['1h', '24h', '7d'];
export const MAP_LAYER_KEYS = ['labels', 'graticule', 'land', 'glow', 'flows'] as const;
export const DEFAULT_MAP_LAYERS: MapLayerState = {
  labels: true,
  graticule: true,
  land: true,
  glow: true,
  flows: true,
};

export function isMapMode(value: string | null): value is MapMode {
  return value === 'countries' || value === 'publishers' || value === 'health';
}

export function isLeftTab(value: string | null): value is LeftTab {
  return value === 'overview' || value === 'display';
}

export function isDetailTab(value: string | null): value is DetailTab {
  return value === 'metrics' || value === 'headlines' || value === 'health';
}

export function isMapMetricWindow(value: string | null): value is MapMetricWindow {
  return value === '1h' || value === '24h' || value === '7d';
}

export function serializeLayerState(layers: MapLayerState): string | null {
  const enabled = MAP_LAYER_KEYS.filter((key) => layers[key]);
  if (enabled.length === MAP_LAYER_KEYS.length) return null;
  return enabled.join(',');
}

export function parseLayerState(raw: string | null): MapLayerState | null {
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

export function sameLayerState(a: MapLayerState, b: MapLayerState): boolean {
  return MAP_LAYER_KEYS.every((key) => a[key] === b[key]);
}

export function buildMapQueryString(input: {
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
