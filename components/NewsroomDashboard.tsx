'use client';

import { useEffect, useMemo, useState } from 'react';
import { GeoMap } from '@/components/GeoMap';
import { OUTLET_FEEDS, SOURCE_PRESETS } from '@/data/outlets';
import type { Beat, NewsItem, SourcePreset } from '@/lib/types';

const REFRESH_OPTIONS = [15, 60, 300];
const TIME_WINDOWS_HOURS = [1, 6, 24];
const BEATS: Beat[] = ['general', 'politics', 'business', 'tech', 'security', 'climate', 'world'];
const MONITOR_STORAGE_KEY = 'presslab.savedMonitors.v1';
const PANEL_STORAGE_KEY = 'presslab.panelVisibility.v2';

type PanelKey = 'controls' | 'map' | 'liveWall' | 'feed' | 'countryBrief' | 'speedBoard' | 'beatMix' | 'spikeAlerts' | 'opsBoard';

type PanelVisibility = Record<PanelKey, boolean>;

interface SavedMonitor {
  id: string;
  name: string;
  outletIds: string[];
  beat: Beat;
  refreshSec: number;
  timeWindowHours: number;
  scopeRegion?: ScopeRegion;
  scopeCountry?: ScopeCountry;
  panelVisibility: PanelVisibility;
}

type ScopeRegion = 'all' | 'us' | 'latam';
type ScopeCountry = 'all' | 'United States' | 'Chile' | 'Argentina' | 'Uruguay';
type WorldScope = 'latam_related' | 'all_world';
type Locale = 'en' | 'es';
type MapViewMode = 'map' | 'bubble_country' | 'bubble_outlet';

interface IngestionDiagnostic {
  outletId: string;
  source: string;
  method: 'rss' | 'sitemap';
  attempted: boolean;
  circuitOpen: boolean;
  ok: boolean;
  statusCode: number | null;
  parsedCount: number;
  parsedLimit?: number;
  sampleCapped?: boolean;
  recent24h: number;
  url?: string;
  error?: string;
}

interface IngestionSummary {
  totalOutlets: number;
  totalEndpoints: number;
  okEndpoints: number;
  failedEndpoints: number;
  circuitOpenEndpoints: number;
  sampleCappedEndpoints?: number;
  diagnostics: IngestionDiagnostic[];
}

interface IngestionOpsSourceRow {
  source: string;
  uniqueItems24h: number;
  seenTotal24h: number;
  duplicateCandidates24h: number;
  endpointRuns24h: number;
  failedRuns24h: number;
  failureRate24h: number;
}

interface IngestionOpsSummary {
  storage: 'postgres' | 'disabled';
  generatedAt: string;
  totals: {
    uniqueItems24h: number;
    sourceCount24h: number;
    seenTotal24h: number;
    duplicateCandidates24h: number;
    duplicateRate24h: number;
    endpointRuns24h: number;
    failedRuns24h: number;
    failureRate24h: number;
  };
  topSources24h: IngestionOpsSourceRow[];
}

const DEFAULT_PANELS: PanelVisibility = {
  controls: true,
  map: true,
  liveWall: true,
  feed: true,
  countryBrief: true,
  speedBoard: false,
  beatMix: false,
  spikeAlerts: false,
  opsBoard: true
};

const PANEL_META: Array<{ key: PanelKey; label: string }> = [
  { key: 'controls', label: 'Control Rail' },
  { key: 'map', label: 'Global Map' },
  { key: 'liveWall', label: 'Live TV Wall' },
  { key: 'feed', label: 'Live Feed' },
  { key: 'countryBrief', label: 'Country Daily Brief' },
  { key: 'speedBoard', label: 'Speed Board' },
  { key: 'beatMix', label: 'Beat Mix' },
  { key: 'spikeAlerts', label: 'Spike Alerts' },
  { key: 'opsBoard', label: 'Ingestion Ops' }
];

const PANEL_LABELS: Record<Locale, Record<PanelKey, string>> = {
  en: {
    controls: 'Control Rail',
    map: 'Global Map',
    liveWall: 'Live TV Wall',
    feed: 'Live Feed',
    countryBrief: 'Country Daily Brief',
    speedBoard: 'Speed Board',
    beatMix: 'Beat Mix',
    spikeAlerts: 'Spike Alerts',
    opsBoard: 'Ingestion Ops'
  },
  es: {
    controls: 'Controles',
    map: 'Mapa global',
    liveWall: 'Muro TV',
    feed: 'Feed en vivo',
    countryBrief: 'Resumen por país',
    speedBoard: 'Panel de velocidad',
    beatMix: 'Mix de secciones',
    spikeAlerts: 'Alertas de picos',
    opsBoard: 'Operación de ingesta'
  }
};

interface LiveChannel {
  id: string;
  name: string;
  handle: string;
  fallbackVideoId?: string;
}

interface LiveTileState {
  slot: number;
  channelId: string;
  videoId: string;
  isLive: boolean;
}

type LiveLookupResult = {
  videoId: string | null;
  isLive: boolean;
  checkedAt: string;
};

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    const text = await res.text();
    if (!text || !text.trim()) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

const LIVE_CHANNELS: LiveChannel[] = [
  { id: 'bloomberg', name: 'Bloomberg', handle: '@Bloomberg', fallbackVideoId: 'iEpJwprxDdk' },
  { id: 'sky', name: 'Sky News', handle: '@SkyNews', fallbackVideoId: 'YDvsBbKfLPA' },
  { id: 'bbc', name: 'BBC News', handle: '@BBCNews' },
  { id: 'cnn', name: 'CNN', handle: '@CNN' },
  { id: 'ap', name: 'AP News', handle: '@AssociatedPress' },
  { id: 'cnbc', name: 'CNBC', handle: '@CNBC', fallbackVideoId: '9NyxcX3rhQs' },
  { id: 'fox', name: 'LiveNOW from FOX', handle: '@LiveNOWFOX' },
  { id: 'msnow', name: 'MS NOW', handle: '@MSNBC' },
  { id: 'abc', name: 'ABC News', handle: '@ABCNews' },
  { id: 'cbs', name: 'CBS News', handle: '@CBSNews' },
  { id: 'nbc', name: 'NBC News', handle: '@NBCNews' },
  { id: 'euronews', name: 'Euronews', handle: '@euronews', fallbackVideoId: 'pykpO5kQJ98' },
  { id: 'tn', name: 'TN (Argentina)', handle: '@todonoticias' },
  { id: 'c5n', name: 'C5N (Argentina)', handle: '@C5N' },
  { id: 'lanacionplus', name: 'La Nacion+ (Argentina)', handle: '@LANACION' },
  { id: 'a24', name: 'A24 (Argentina)', handle: '@A24com' }
];

const FIXED_MAJOR_CHANNELS = ['nbc', 'fox', 'cbs', 'tn', 'c5n', 'lanacionplus'];
const LIVE_LAYOUT_STORAGE_KEY = 'presslab.livewall.custom.v1';
const LIVE_CACHE_TTL_MS = 5 * 60 * 1000;
const liveCache = new Map<string, { videoId: string | null; isLive: boolean; timestamp: number }>();
const COUNTRY_MIN_WINDOW_HOURS = 24;
const COUNTRY_PRIMARY_LANGUAGE: Record<string, string> = {
  'United States': 'en',
  Chile: 'es',
  Argentina: 'es',
  Uruguay: 'es'
};

const UI_TEXT: Record<Locale, Record<string, string>> = {
  en: {
    monitorSetup: 'Monitor Setup',
    region: 'Region',
    country: 'Country',
    beat: 'Beat',
    worldFilter: 'World Filter',
    worldLatam: 'LATAM related',
    worldAll: 'All world',
    refresh: 'Refresh',
    timeWindow: 'Time Window',
    every: 'Every',
    sourcePresets: 'Source Presets',
    apply: 'Apply',
    add: 'Add',
    savedMonitors: 'Saved Monitors',
    save: 'Save',
    delete: 'Delete',
    selectSaved: 'Select saved monitor',
    selectedSources: 'Selected sources',
    sourcePolicy: 'Source policy: exploratory and manual-review feeds are default OFF.',
    lastUpdated: 'Last updated',
    sources: 'Sources',
    panels: 'Panels',
    search: 'Search',
    refreshing: 'Refreshing...',
    liveTvWall: 'Live TV Wall',
    majorJournal: 'Major Journal 6ch',
    custom: 'Custom',
    saveCustomLayout: 'Save Custom Layout',
    lastChecked: 'Last checked',
    checking: 'Checking...',
    liveFeed: 'Live Feed',
    countryMode: 'Country mode',
    countryIntakeFilter: 'Country Intake Filter',
    countryIntel: 'Country Intel',
    coverageHealth: 'Coverage Health',
    stories: 'stories',
    clusters: 'clusters',
    local: 'local',
    portal: 'portal',
    global: 'global',
    dailyCountryBrief: 'Daily Country Brief',
    sourceQualityCountry: 'Source Quality (Country)',
    ingestionOps: 'Ingestion Ops',
    panelSettings: 'Panel Settings',
    newsSources: 'News Sources',
    filterSources: 'Filter sources...',
    commandSearch: 'Command Search',
    searchCommands: 'Search commands, beats, sources...',
    close: 'Close',
    noLive: 'No live stream right now',
    soundOn: 'Sound On',
    muted: 'Muted',
    live: 'LIVE',
    fallback: 'Fallback',
    usLatam: 'US + LATAM',
    all: 'All',
    us: 'US',
    latam: 'LATAM',
    allWorldLower: 'all',
    localOnly: 'local only',
    portalOnly: 'portal only',
    globalOnly: 'global only'
    ,
    inScope: 'in scope',
    morningMacroWatch: 'Morning Macro Watch',
    autoAdded: 'Auto-added',
    noCountryStories: 'No stories for this country in current window.',
    countryStoriesWindow: 'stories in window',
    dedupedClusters: 'deduped clusters',
    noCountrySourceRanking: 'No country-specific source ranking yet.',
    noItemsInCategory: 'No items in this category yet.',
    speedBoard: 'Speed Board',
    beatMix: 'Beat Mix',
    spikeAlerts: 'Spike Alerts',
    noSourceActivity: 'No source activity in this window.',
    noBeatActivity: 'No beat activity yet.',
    noSpikes: 'No spikes detected in current window.',
    endpointFailures: 'Endpoint Failures',
    zeroYieldSources: 'Zero Yield Sources',
    noEndpointFailures: 'No endpoint failures in this refresh cycle.',
    noZeroYield: 'No zero-yield sources in this refresh cycle.',
    noIngestionDiagnostics: 'No ingestion diagnostics yet.',
    selectAll: 'Select all',
    selectNone: 'Select none',
    noCommandMatch: 'No commands match query.',
    unknown: 'unknown',
    unknownError: 'unknown_error',
    agoMins: 'm ago',
    cluster: 'cluster',
    share: 'Share',
    pin: 'Pin',
    directLocalDegraded: 'Direct local RSS is degraded in this window. Showing portal-backed local coverage.',
    noGlobalBucket: 'No global bucket stories in this window. Try `all` or `portal` filter, or widen time window.',
    endpointSummary: 'endpoints',
    failed: 'failed',
    circuit: 'circuit',
    attempted: 'attempted',
    ok: 'ok',
    recent24h: 'recent24h',
    parsed: 'parsed',
    score: 'score',
    medianLag: 'median lag',
    storiesWord: 'stories',
    latest: 'Latest',
    tier: 'Tier',
    worldLatamTag: 'world_latam',
    notAvailable: 'n/a'
    ,
    politics: 'Politics',
    social: 'Social',
    businessLabel: 'Business',
    generalLife: 'General Life',
    countryModePrioritizing: 'Country mode: prioritizing',
    languagePlusSourcesFor: 'language + local/portal sources for',
    autoAddedFor: 'for',
    unknownLatest: 'latest',
    medianLagText: 'median lag',
    recentText: 'recent',
    baselineText: 'baseline'
    ,
    outlet: 'Outlet',
    allOutlets: 'All outlets',
    mapView: 'Map View',
    mapViewMap: 'Map',
    mapViewCountryBubble: 'Bubble by country',
    mapViewOutletBubble: 'Bubble by outlet',
    mapCountQuality: 'Map count quality',
    sampled: 'sampled',
    full: 'full',
    theme: 'Theme',
    published: 'Published',
    noOpsSummary: 'No 24h ops summary yet.',
    opsStorage: 'Storage',
    opsUnique24h: 'Unique 24h',
    opsSources24h: 'Sources 24h',
    opsSeen24h: 'Seen total 24h',
    opsDuplicates24h: 'Duplicates 24h',
    opsDuplicateRate24h: 'Duplicate rate 24h',
    opsEndpointRuns24h: 'Endpoint runs 24h',
    opsFailedRuns24h: 'Failed runs 24h',
    opsFailureRate24h: 'Failure rate 24h',
    opsTopSources24h: 'Top Sources (24h)'
  },
  es: {
    monitorSetup: 'Configuración',
    region: 'Región',
    country: 'País',
    beat: 'Sección',
    worldFilter: 'Filtro mundo',
    worldLatam: 'Solo LATAM',
    worldAll: 'Todo mundo',
    refresh: 'Actualización',
    timeWindow: 'Ventana',
    every: 'Cada',
    sourcePresets: 'Presets de fuentes',
    apply: 'Aplicar',
    add: 'Agregar',
    savedMonitors: 'Monitores guardados',
    save: 'Guardar',
    delete: 'Eliminar',
    selectSaved: 'Seleccionar monitor',
    selectedSources: 'Fuentes seleccionadas',
    sourcePolicy: 'Política: fuentes exploratorias y en revisión quedan desactivadas por defecto.',
    lastUpdated: 'Última actualización',
    sources: 'Fuentes',
    panels: 'Paneles',
    search: 'Buscar',
    refreshing: 'Actualizando...',
    liveTvWall: 'Muro TV en vivo',
    majorJournal: '6 canales principales',
    custom: 'Personalizado',
    saveCustomLayout: 'Guardar layout',
    lastChecked: 'Última revisión',
    checking: 'Revisando...',
    liveFeed: 'Feed en vivo',
    countryMode: 'Modo país',
    countryIntakeFilter: 'Filtro de ingesta',
    countryIntel: 'Inteligencia país',
    coverageHealth: 'Salud de cobertura',
    stories: 'noticias',
    clusters: 'clusters',
    local: 'local',
    portal: 'portal',
    global: 'global',
    dailyCountryBrief: 'Resumen diario por país',
    sourceQualityCountry: 'Calidad de fuentes (país)',
    ingestionOps: 'Operación de ingesta',
    panelSettings: 'Paneles',
    newsSources: 'Fuentes de noticias',
    filterSources: 'Filtrar fuentes...',
    commandSearch: 'Búsqueda de comandos',
    searchCommands: 'Buscar comandos, secciones, fuentes...',
    close: 'Cerrar',
    noLive: 'No hay stream en vivo',
    soundOn: 'Sonido',
    muted: 'Silencio',
    live: 'EN VIVO',
    fallback: 'Alterno',
    usLatam: 'EE.UU. + LATAM',
    all: 'Todos',
    us: 'EE.UU.',
    latam: 'LATAM',
    allWorldLower: 'todos',
    localOnly: 'solo local',
    portalOnly: 'solo portal',
    globalOnly: 'solo global'
    ,
    inScope: 'en alcance',
    morningMacroWatch: 'Monitoreo Matinal Macro',
    autoAdded: 'Agregadas automáticamente',
    noCountryStories: 'No hay noticias para este país en la ventana actual.',
    countryStoriesWindow: 'noticias en ventana',
    dedupedClusters: 'clusters deduplicados',
    noCountrySourceRanking: 'Todavía no hay ranking de fuentes por país.',
    noItemsInCategory: 'Todavía no hay noticias en esta categoría.',
    speedBoard: 'Panel de velocidad',
    beatMix: 'Mix de secciones',
    spikeAlerts: 'Alertas de picos',
    noSourceActivity: 'Sin actividad de fuentes en esta ventana.',
    noBeatActivity: 'Sin actividad por sección aún.',
    noSpikes: 'Sin picos detectados en la ventana actual.',
    endpointFailures: 'Fallos de endpoints',
    zeroYieldSources: 'Fuentes sin resultados',
    noEndpointFailures: 'No hay fallos de endpoints en este ciclo.',
    noZeroYield: 'No hay fuentes en cero en este ciclo.',
    noIngestionDiagnostics: 'Aún no hay diagnósticos de ingesta.',
    selectAll: 'Seleccionar todo',
    selectNone: 'Quitar todo',
    noCommandMatch: 'No hay comandos para esa búsqueda.',
    unknown: 'desconocido',
    unknownError: 'error_desconocido',
    agoMins: 'min',
    cluster: 'cluster',
    share: 'Compartir',
    pin: 'Fijar',
    directLocalDegraded: 'El RSS local directo está degradado en esta ventana. Mostrando cobertura local desde portales.',
    noGlobalBucket: 'No hay noticias del bucket global en esta ventana. Prueba `todos` o `portal`, o amplía la ventana.',
    endpointSummary: 'endpoints',
    failed: 'fallidos',
    circuit: 'circuito',
    attempted: 'intentados',
    ok: 'ok',
    recent24h: '24h recientes',
    parsed: 'parseados',
    score: 'puntaje',
    medianLag: 'latencia mediana',
    storiesWord: 'noticias',
    latest: 'Última',
    tier: 'Nivel',
    worldLatamTag: 'mundo_latam',
    notAvailable: 'n/d'
    ,
    politics: 'Política',
    social: 'Sociedad',
    businessLabel: 'Negocios',
    generalLife: 'Vida general',
    countryModePrioritizing: 'Modo país: priorizando idioma',
    languagePlusSourcesFor: '+ fuentes local/portal para',
    autoAddedFor: 'para',
    unknownLatest: 'última',
    medianLagText: 'latencia mediana',
    recentText: 'reciente',
    baselineText: 'base'
    ,
    outlet: 'Medio',
    allOutlets: 'Todos los medios',
    mapView: 'Vista mapa',
    mapViewMap: 'Mapa',
    mapViewCountryBubble: 'Burbujas por país',
    mapViewOutletBubble: 'Burbujas por medio',
    mapCountQuality: 'Calidad de conteo',
    sampled: 'muestreado',
    full: 'completo',
    theme: 'Tema',
    published: 'Publicado',
    noOpsSummary: 'Aún no hay resumen operativo de 24h.',
    opsStorage: 'Almacenamiento',
    opsUnique24h: 'Únicas 24h',
    opsSources24h: 'Fuentes 24h',
    opsSeen24h: 'Vistas totales 24h',
    opsDuplicates24h: 'Duplicadas 24h',
    opsDuplicateRate24h: 'Tasa duplicados 24h',
    opsEndpointRuns24h: 'Ejecuciones endpoint 24h',
    opsFailedRuns24h: 'Ejecuciones fallidas 24h',
    opsFailureRate24h: 'Tasa fallos 24h',
    opsTopSources24h: 'Fuentes principales (24h)'
  }
};

const BEAT_LABELS: Record<Locale, Record<Beat, string>> = {
  en: {
    general: 'general',
    politics: 'politics',
    business: 'business',
    tech: 'tech',
    security: 'security',
    climate: 'climate',
    world: 'world'
  },
  es: {
    general: 'general',
    politics: 'política',
    business: 'negocios',
    tech: 'tecnología',
    security: 'seguridad',
    climate: 'clima',
    world: 'mundo'
  }
};

function normalizeOutletCountry(country: string): string {
  const c = country.trim().toLowerCase();
  if (c === 'us' || c === 'united states') return 'United States';
  if (c === 'cl' || c === 'chile') return 'Chile';
  if (c === 'ar' || c === 'argentina') return 'Argentina';
  if (c === 'uy' || c === 'uruguay') return 'Uruguay';
  if (c === 'latam' || c === 'latin america') return 'LATAM';
  return country;
}

function isUsOutlet(country: string): boolean {
  return normalizeOutletCountry(country) === 'United States';
}

function isLatamOutlet(country: string): boolean {
  const normalized = normalizeOutletCountry(country);
  return normalized === 'LATAM'
    || normalized === 'Chile'
    || normalized === 'Argentina'
    || normalized === 'Uruguay';
}

function buildLiveTiles(channelIds: string[]): LiveTileState[] {
  return channelIds.map((channelId, slot) => ({
    slot,
    channelId,
    videoId: LIVE_CHANNELS.find((channel) => channel.id === channelId)?.fallbackVideoId || '',
    isLive: false
  }));
}

async function resolveLiveVideo(channel: LiveChannel): Promise<LiveLookupResult> {
  const cached = liveCache.get(channel.handle);
  if (cached && Date.now() - cached.timestamp < LIVE_CACHE_TTL_MS) {
    return {
      videoId: cached.videoId ?? channel.fallbackVideoId ?? null,
      isLive: cached.isLive,
      checkedAt: new Date(cached.timestamp).toISOString()
    };
  }

  try {
    const res = await fetch(`/api/youtube/live?channel=${encodeURIComponent(channel.handle)}`);
    if (!res.ok) throw new Error('Failed to resolve live stream');
    const data = await safeJson<LiveLookupResult>(res);
    if (!data) throw new Error('Invalid live stream payload');
    liveCache.set(channel.handle, {
      videoId: data.videoId,
      isLive: Boolean(data.videoId && data.isLive),
      timestamp: Date.now()
    });
    return {
      videoId: data.videoId ?? channel.fallbackVideoId ?? null,
      isLive: Boolean(data.videoId && data.isLive),
      checkedAt: data.checkedAt || new Date().toISOString()
    };
  } catch {
    return {
      videoId: channel.fallbackVideoId ?? null,
      isLive: false,
      checkedAt: new Date().toISOString()
    };
  }
}

function parseDateLabel(value: string, locale: Locale = 'en'): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return locale === 'es' ? 'Hora desconocida' : 'Unknown time';
  return date.toLocaleString(locale === 'es' ? 'es-ES' : 'en-US');
}

function minutesSince(value: string): number {
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return 0;
  return Math.max(0, Math.round((Date.now() - ts) / 60000));
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#8216;|&#x2018;/gi, "'")
    .replace(/&#8217;|&#x2019;/gi, "'")
    .replace(/&#8220;|&#x201c;/gi, '"')
    .replace(/&#8221;|&#x201d;/gi, '"')
    .replace(/&#8211;|&#x2013;/gi, '-')
    .replace(/&#8212;|&#x2014;/gi, '-')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"');
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function NewsroomDashboard({ locale = 'en' }: { locale?: Locale }) {
  const t = UI_TEXT[locale];
  const [items, setItems] = useState<NewsItem[]>([]);
  const [selectedOutletFilter, setSelectedOutletFilter] = useState<string>('all');
  const [mapViewMode, setMapViewMode] = useState<MapViewMode>('map');
  const [scopeRegion, setScopeRegion] = useState<ScopeRegion>('all');
  const [scopeCountry, setScopeCountry] = useState<ScopeCountry>('all');
  const [selectedOutlets, setSelectedOutlets] = useState<string[]>(
    OUTLET_FEEDS
      .filter((outlet) => outlet.defaultEnabled && (isUsOutlet(outlet.country) || isLatamOutlet(outlet.country)))
      .map((outlet) => outlet.id)
  );
  const [selectedBeat, setSelectedBeat] = useState<Beat>('general');
  const [worldScope, setWorldScope] = useState<WorldScope>('latam_related');
  const [refreshSec, setRefreshSec] = useState<number>(60);
  const [timeWindowHours, setTimeWindowHours] = useState<number>(24);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [ingestionSummary, setIngestionSummary] = useState<IngestionSummary | null>(null);
  const [ingestionOps, setIngestionOps] = useState<IngestionOpsSummary | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string>('Global');
  const [countryAutoAdded, setCountryAutoAdded] = useState<number>(0);
  const [countryCardOpen, setCountryCardOpen] = useState<boolean>(false);
  const [countryCardPinned, setCountryCardPinned] = useState<boolean>(false);
  const [countrySourceFilter, setCountrySourceFilter] = useState<'all' | 'local' | 'portal' | 'global'>('all');
  const [liveMode, setLiveMode] = useState<'major' | 'custom'>('major');
  const [liveTiles, setLiveTiles] = useState<LiveTileState[]>(buildLiveTiles(FIXED_MAJOR_CHANNELS));
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<string>('');
  const [unmutedSlot, setUnmutedSlot] = useState<number | null>(null);

  const [sourcesOpen, setSourcesOpen] = useState<boolean>(false);
  const [panelsOpen, setPanelsOpen] = useState<boolean>(false);
  const [commandOpen, setCommandOpen] = useState<boolean>(false);

  const [sourceQuery, setSourceQuery] = useState<string>('');
  const [commandQuery, setCommandQuery] = useState<string>('');
  const [selectedPresetKey, setSelectedPresetKey] = useState<string>('default_live');

  const [panelVisibility, setPanelVisibility] = useState<PanelVisibility>(DEFAULT_PANELS);
  const [savedMonitors, setSavedMonitors] = useState<SavedMonitor[]>([]);
  const [monitorName, setMonitorName] = useState<string>('');
  const [selectedMonitorId, setSelectedMonitorId] = useState<string>('');
  const outletByName = useMemo(
    () => new Map(OUTLET_FEEDS.map((outlet) => [outlet.name, outlet])),
    []
  );
  const countryCoverageOutlets = useMemo(() => {
    const byCountry = new Map<string, string[]>();
    for (const outlet of OUTLET_FEEDS) {
      if (outlet.sourceType !== 'local' && outlet.sourceType !== 'portal') continue;
      const key = outlet.country;
      const list = byCountry.get(key) ?? [];
      list.push(outlet.id);
      byCountry.set(key, list);
    }
    return byCountry;
  }, []);
  const scopedOutletIds = useMemo(() => {
    return OUTLET_FEEDS
      .filter((outlet) => {
        const normalized = normalizeOutletCountry(outlet.country);
        const regionPass = scopeRegion === 'all'
          ? (isUsOutlet(outlet.country) || isLatamOutlet(outlet.country))
          : scopeRegion === 'us'
            ? isUsOutlet(outlet.country)
            : isLatamOutlet(outlet.country);

        if (!regionPass) return false;
        if (scopeCountry === 'all') return true;
        if (scopeCountry === 'United States') return normalized === 'United States';
        if (scopeCountry === 'Chile') return normalized === 'Chile';
        if (scopeCountry === 'Argentina') return normalized === 'Argentina';
        if (scopeCountry === 'Uruguay') return normalized === 'Uruguay';
        return true;
      })
      .map((outlet) => outlet.id);
  }, [scopeCountry, scopeRegion]);

  const effectiveSelectedOutlets = useMemo(() => {
    const scopedSet = new Set(scopedOutletIds);
    return selectedOutlets.filter((id) => scopedSet.has(id));
  }, [scopedOutletIds, selectedOutlets]);
  const effectiveOutletOptions = useMemo(() => {
    const byId = new Map(OUTLET_FEEDS.map((outlet) => [outlet.id, outlet]));
    return effectiveSelectedOutlets
      .map((id) => byId.get(id))
      .filter((outlet): outlet is NonNullable<typeof outlet> => Boolean(outlet))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [effectiveSelectedOutlets]);
  const channelById = useMemo(() => new Map(LIVE_CHANNELS.map((channel) => [channel.id, channel])), []);

  const refreshLiveTiles = async (currentTiles: LiveTileState[]) => {
    const resolved = await Promise.all(
      currentTiles.map(async (tile) => {
        const channel = channelById.get(tile.channelId);
        if (!channel) return tile;
        const live = await resolveLiveVideo(channel);
        return {
          ...tile,
          videoId: live.videoId || channel.fallbackVideoId || '',
          isLive: live.isLive
        };
      })
    );
    setLiveTiles(resolved);
    setLiveUpdatedAt(new Date().toISOString());
  };

  const refresh = async (): Promise<void> => {
    setLoading(true);
    try {
      if (effectiveSelectedOutlets.length === 0) {
        setItems([]);
        setIngestionSummary(null);
        setIngestionOps(null);
        setLastUpdated(new Date().toISOString());
        return;
      }
      const outletParam = effectiveSelectedOutlets.join(',');
      const limit = timeWindowHours >= 24 ? 15000 : 6000;
      const [res, opsRes] = await Promise.all([
        fetch(`/api/news?outlets=${outletParam}&limit=${limit}`),
        fetch('/api/ops/ingestion')
      ]);
      if (!res.ok) {
        console.warn('[news] refresh failed status', res.status);
        return;
      }
      const json = await safeJson<{ items: NewsItem[]; generatedAt: string; ingestion?: IngestionSummary }>(res);
      if (!json) {
        console.warn('[news] refresh failed: invalid or empty JSON');
        return;
      }
      const cleaned = (json.items || []).map((item) => ({
        ...item,
        title: decodeEntities(item.title)
      }));
      setItems(cleaned);
      setIngestionSummary(json.ingestion || null);
      setLastUpdated(json.generatedAt || new Date().toISOString());

      if (opsRes.ok) {
        const ops = await safeJson<IngestionOpsSummary>(opsRes);
        if (ops) setIngestionOps(ops);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    try {
      const rawPanels = localStorage.getItem(PANEL_STORAGE_KEY);
      if (rawPanels) {
        const parsed = JSON.parse(rawPanels) as PanelVisibility;
        setPanelVisibility({ ...DEFAULT_PANELS, ...parsed });
      }
    } catch {
      // no-op
    }

    try {
      const rawMonitors = localStorage.getItem(MONITOR_STORAGE_KEY);
      if (rawMonitors) {
        const parsed = JSON.parse(rawMonitors) as SavedMonitor[];
        setSavedMonitors(parsed);
      }
    } catch {
      // no-op
    }

    try {
      const rawPinned = localStorage.getItem('presslab.countryCardPinned.v1');
      if (rawPinned === 'true') setCountryCardPinned(true);
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(panelVisibility));
  }, [panelVisibility]);

  useEffect(() => {
    localStorage.setItem(MONITOR_STORAGE_KEY, JSON.stringify(savedMonitors));
  }, [savedMonitors]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSelectedOutlets.join(',')]);

  useEffect(() => {
    const interval = setInterval(() => void refresh(), refreshSec * 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSec, effectiveSelectedOutlets.join(',')]);

  useEffect(() => {
    if (selectedCountry === 'Global') {
      setCountryCardOpen(false);
      setCountryAutoAdded(0);
      return;
    }
    setCountryCardOpen(true);
  }, [selectedCountry]);

  useEffect(() => {
    if (scopeRegion === 'us' && scopeCountry !== 'all' && scopeCountry !== 'United States') {
      setScopeCountry('all');
      return;
    }
    if (scopeRegion === 'latam' && scopeCountry === 'United States') {
      setScopeCountry('all');
    }
  }, [scopeCountry, scopeRegion]);

  useEffect(() => {
    if (selectedOutletFilter === 'all') return;
    const byId = new Set(effectiveSelectedOutlets);
    if (!byId.has(selectedOutletFilter)) setSelectedOutletFilter('all');
  }, [effectiveSelectedOutlets, selectedOutletFilter]);

  useEffect(() => {
    localStorage.setItem('presslab.countryCardPinned.v1', String(countryCardPinned));
  }, [countryCardPinned]);

  useEffect(() => {
    if (selectedCountry === 'Global') return;
    const countryOutlets = countryCoverageOutlets.get(selectedCountry) || [];
    if (countryOutlets.length === 0) {
      setCountryAutoAdded(0);
      return;
    }

    setSelectedOutlets((current) => {
      const missing = countryOutlets.filter((id) => !current.includes(id));
      setCountryAutoAdded(missing.length);
      if (missing.length === 0) return current;
      return [...current, ...missing];
    });
  }, [countryCoverageOutlets, selectedCountry]);

  useEffect(() => {
    const pending = items.filter((item) => item.classificationSource === 'keyword').slice(0, 25);
    pending.forEach((item) => {
      void fetch('/api/classify-beat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: item.title, fallbackBeat: item.beat })
      })
        .then((response) => response.json() as Promise<{ beat: Beat; confidence: number; source: 'keyword' | 'llm'; reason?: string }>)
        .then((result) => {
          if (result.source !== 'llm') return;
          setItems((prev) => prev.map((prevItem) => (
            prevItem.id === item.id && result.confidence > prevItem.confidence
              ? {
                  ...prevItem,
                  beat: result.beat,
                  confidence: result.confidence,
                  classificationSource: result.source,
                  classificationReason: result.reason
                }
              : prevItem
          )));
        })
        .catch(() => undefined);
    });
  }, [items]);

  useEffect(() => {
    if (liveMode === 'major') {
      const next = buildLiveTiles(FIXED_MAJOR_CHANNELS);
      setLiveTiles(next);
      void refreshLiveTiles(next);
      return;
    }

    try {
      const raw = localStorage.getItem(LIVE_LAYOUT_STORAGE_KEY);
      if (!raw) {
        const fallback = buildLiveTiles(FIXED_MAJOR_CHANNELS);
        setLiveTiles(fallback);
        void refreshLiveTiles(fallback);
        return;
      }
      const parsed = JSON.parse(raw) as { channelIds?: string[] };
      const ids = parsed.channelIds || [];
      if (ids.length !== 6 || !ids.every((id) => channelById.has(id))) {
        const fallback = buildLiveTiles(FIXED_MAJOR_CHANNELS);
        setLiveTiles(fallback);
        void refreshLiveTiles(fallback);
        return;
      }
      const next = buildLiveTiles(ids);
      setLiveTiles(next);
      void refreshLiveTiles(next);
    } catch {
      const fallback = buildLiveTiles(FIXED_MAJOR_CHANNELS);
      setLiveTiles(fallback);
      void refreshLiveTiles(fallback);
    }
  }, [channelById, liveMode]);

  useEffect(() => {
    const interval = setInterval(() => {
      setLiveTiles((current) => {
        void refreshLiveTiles(current);
        return current;
      });
    }, LIVE_CACHE_TTL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (liveMode !== 'custom') return;
    if (liveTiles.length !== 6) return;
    const payload = { channelIds: liveTiles.map((tile) => tile.channelId) };
    localStorage.setItem(LIVE_LAYOUT_STORAGE_KEY, JSON.stringify(payload));
  }, [liveMode, liveTiles]);

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
      if (event.key === 'Escape') {
        setCommandOpen(false);
        setPanelsOpen(false);
        setSourcesOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const filteredByTime = useMemo(() => {
    const cutoff = Date.now() - timeWindowHours * 60 * 60 * 1000;
    return items.filter((item) => {
      const published = new Date(item.publishedAt).getTime();
      if (!Number.isFinite(published) || published < cutoff) return false;
      if (selectedOutletFilter !== 'all' && item.source !== selectedOutletFilter) return false;
      return true;
    });
  }, [items, selectedOutletFilter, timeWindowHours]);

  const filteredItems = useMemo(() => {
    if (selectedBeat === 'general') return filteredByTime;
    if (selectedBeat === 'world') {
      if (worldScope === 'all_world') {
        return filteredByTime.filter((item) => item.beat === 'world');
      }
      return filteredByTime.filter((item) => item.beat === 'world' && (item.worldLatam || isLatamOutlet(item.country || '')));
    }
    return filteredByTime.filter((item) => item.beat === selectedBeat);
  }, [filteredByTime, selectedBeat, worldScope]);

  const countryScopedItems = useMemo(() => {
    if (selectedCountry === 'Global') return filteredByTime;
    const cutoff = Date.now() - Math.max(timeWindowHours, COUNTRY_MIN_WINDOW_HOURS) * 60 * 60 * 1000;
    return items.filter((item) => {
      if (item.country !== selectedCountry) return false;
      const published = new Date(item.publishedAt).getTime();
      if (!Number.isFinite(published) || published < cutoff) return false;
      if (selectedOutletFilter !== 'all' && item.source !== selectedOutletFilter) return false;
      return true;
    });
  }, [filteredByTime, items, selectedCountry, selectedOutletFilter, timeWindowHours]);
  const dedupedCountryItems = useMemo(() => {
    const byCluster = new Map<string, NewsItem>();
    for (const item of countryScopedItems) {
      const key = item.clusterId || item.id;
      const existing = byCluster.get(key);
      if (!existing) {
        byCluster.set(key, item);
        continue;
      }
      const existingTs = new Date(existing.publishedAt).getTime();
      const itemTs = new Date(item.publishedAt).getTime();
      if (itemTs > existingTs) byCluster.set(key, item);
    }
    return [...byCluster.values()];
  }, [countryScopedItems]);
  const rankedCountryItems = useMemo(() => {
    if (selectedCountry === 'Global') return filteredItems;
    const preferredLanguage = COUNTRY_PRIMARY_LANGUAGE[selectedCountry];
    const sourceFiltered = dedupedCountryItems.filter((item) => {
      if (countrySourceFilter === 'all') return true;
      return (item.sourceType || 'global') === countrySourceFilter;
    });
    const byPriority = [...sourceFiltered].sort((a, b) => {
      const aCountry = a.country === selectedCountry ? 1 : 0;
      const bCountry = b.country === selectedCountry ? 1 : 0;
      if (aCountry !== bCountry) return bCountry - aCountry;

      const sourceWeight = (item: NewsItem) => {
        if (item.sourceType === 'local') return 3;
        if (item.sourceType === 'portal') return 2;
        return 1;
      };
      const aSource = sourceWeight(a);
      const bSource = sourceWeight(b);
      if (aSource !== bSource) return bSource - aSource;

      if (preferredLanguage) {
        const aLang = a.language === preferredLanguage ? 1 : 0;
        const bLang = b.language === preferredLanguage ? 1 : 0;
        if (aLang !== bLang) return bLang - aLang;
      }

      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });
    return byPriority;
  }, [countrySourceFilter, dedupedCountryItems, filteredItems, selectedCountry]);

  const countryBriefRows = useMemo(() => {
    const groups: Array<{ key: string; label: string; beats: Beat[] }> = [
      { key: 'politics', label: t.politics, beats: ['politics'] },
      { key: 'social', label: t.social, beats: ['world', 'security'] },
      { key: 'business', label: t.businessLabel, beats: ['business'] },
      { key: 'lifestyle', label: t.generalLife, beats: ['tech', 'climate', 'general'] }
    ];

    return groups.map((group) => {
      const matched = countryScopedItems.filter((item) => group.beats.includes(item.beat));
      return {
        ...group,
        count: matched.length,
        headlines: matched.slice(0, 3)
      };
    });
  }, [countryScopedItems, t.businessLabel, t.generalLife, t.politics, t.social]);
  const countrySourceRanking = useMemo(() => {
    if (selectedCountry === 'Global') return [];
    const preferredLanguage = COUNTRY_PRIMARY_LANGUAGE[selectedCountry];
    const sourceMap = new Map<string, { count: number; lags: number[]; localLangCount: number; sourceType: string; review: string }>();
    for (const item of countryScopedItems) {
      const lag = minutesSince(item.publishedAt);
      const source = item.source;
      const row = sourceMap.get(source) ?? {
        count: 0,
        lags: [],
        localLangCount: 0,
        sourceType: item.sourceType || 'global',
        review: outletByName.get(source)?.reviewDecision || 'unknown'
      };
      row.count += 1;
      row.lags.push(lag);
      if (preferredLanguage && item.language === preferredLanguage) row.localLangCount += 1;
      sourceMap.set(source, row);
    }

    const reviewScore = (review: string): number => {
      if (review === 'verified_core') return 1;
      if (review === 'keep_secondary') return 0.8;
      if (review === 'exploratory_off_by_default') return 0.55;
      if (review === 'manual_review') return 0.4;
      return 0.65;
    };

    const sourceTypeScore = (type: string): number => {
      if (type === 'local') return 1;
      if (type === 'portal') return 0.85;
      return 0.7;
    };

    return [...sourceMap.entries()]
      .map(([source, row]) => {
        const medLag = median(row.lags);
        const freshness = Math.max(0, 1 - Math.min(medLag, 240) / 240);
        const localRatio = row.count > 0 ? row.localLangCount / row.count : 0;
        const score =
          reviewScore(row.review) * 0.45 +
          sourceTypeScore(row.sourceType) * 0.2 +
          freshness * 0.2 +
          localRatio * 0.15;
        return {
          source,
          score: Math.round(score * 100),
          count: row.count,
          medianLag: Math.round(medLag),
          sourceType: row.sourceType,
          review: row.review
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }, [countryScopedItems, outletByName, selectedCountry]);
  const countryCardMetrics = useMemo(() => {
    if (selectedCountry === 'Global') return null;
    const total = countryScopedItems.length;
    const localCount = countryScopedItems.filter((item) => item.sourceType === 'local').length;
    const portalCount = countryScopedItems.filter((item) => item.sourceType === 'portal').length;
    const globalCount = countryScopedItems.filter((item) => (item.sourceType || 'global') === 'global').length;
    const preferredLanguage = COUNTRY_PRIMARY_LANGUAGE[selectedCountry];
    const localLanguageCount = preferredLanguage
      ? countryScopedItems.filter((item) => item.language === preferredLanguage).length
      : 0;
    const latest = countryScopedItems
      .map((item) => new Date(item.publishedAt).getTime())
      .filter((ts) => Number.isFinite(ts))
      .sort((a, b) => b - a)[0];
    return {
      total,
      localCount,
      portalCount,
      globalCount,
      localLanguageCount,
      preferredLanguage: preferredLanguage || 'n/a',
      latest: latest ? new Date(latest).toISOString() : ''
    };
  }, [countryScopedItems, selectedCountry]);

  const sourceStats = useMemo(() => {
    const now = Date.now();
    const bySource = new Map<string, { count: number; latest: number; lags: number[] }>();

    for (const item of filteredItems) {
      const publishedMs = new Date(item.publishedAt).getTime();
      const lagMins = Math.max(0, (now - publishedMs) / 60000);
      const existing = bySource.get(item.source) ?? { count: 0, latest: 0, lags: [] };
      existing.count += 1;
      existing.latest = Math.max(existing.latest, publishedMs);
      existing.lags.push(lagMins);
      bySource.set(item.source, existing);
    }

    return [...bySource.entries()]
      .map(([source, value]) => ({
        source,
        count: value.count,
        medianLagMins: median(value.lags),
        latest: value.latest
      }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.medianLagMins - b.medianLagMins;
      });
  }, [filteredItems]);

  const ingestionBySource = useMemo(() => {
    if (!ingestionSummary) return [];
    const bySource = new Map<string, {
      source: string;
      outletId: string;
      attempted: number;
      ok: number;
      failed: number;
      circuitOpen: number;
      parsedCount: number;
      recent24h: number;
      errors: Set<string>;
    }>();

    for (const diag of ingestionSummary.diagnostics) {
      if (!diag.attempted) continue;
      const row = bySource.get(diag.source) ?? {
        source: diag.source,
        outletId: diag.outletId,
        attempted: 0,
        ok: 0,
        failed: 0,
        circuitOpen: 0,
        parsedCount: 0,
        recent24h: 0,
        errors: new Set<string>()
      };
      row.attempted += 1;
      if (diag.ok) row.ok += 1;
      if (!diag.ok) row.failed += 1;
      if (diag.circuitOpen) row.circuitOpen += 1;
      row.parsedCount += diag.parsedCount;
      row.recent24h += diag.recent24h;
      if (diag.error) row.errors.add(diag.error);
      bySource.set(diag.source, row);
    }

    return [...bySource.values()]
      .map((row) => ({ ...row, errors: [...row.errors].join('; ') }))
      .sort((a, b) => {
        if (b.failed !== a.failed) return b.failed - a.failed;
        return b.recent24h - a.recent24h;
      });
  }, [ingestionSummary]);

  const ingestionFailures = useMemo(
    () => ingestionBySource.filter((row) => row.failed > 0).slice(0, 12),
    [ingestionBySource]
  );
  const ingestionZeroYield = useMemo(
    () => ingestionBySource.filter((row) => row.recent24h === 0).slice(0, 12),
    [ingestionBySource]
  );

  const beatMix = useMemo(() => {
    const counts = new Map<Beat, number>();
    for (const beat of BEATS) counts.set(beat, 0);
    for (const item of filteredByTime) {
      counts.set(item.beat, (counts.get(item.beat) ?? 0) + 1);
    }
    const total = filteredByTime.length || 1;
    return [...counts.entries()]
      .filter(([, count]) => count > 0)
      .map(([beat, count]) => ({ beat, count, ratio: (count / total) * 100 }))
      .sort((a, b) => b.count - a.count);
  }, [filteredByTime]);

  const spikeAlerts = useMemo(() => {
    const now = Date.now();
    const recentStart = now - 60 * 60 * 1000;
    const baseStart = now - 4 * 60 * 60 * 1000;
    const baseEnd = recentStart;

    return BEATS
      .filter((beat) => beat !== 'general')
      .map((beat) => {
        const recentCount = filteredByTime.filter((item) => item.beat === beat && new Date(item.publishedAt).getTime() >= recentStart).length;
        const baselineCount = filteredByTime.filter((item) => {
          const ts = new Date(item.publishedAt).getTime();
          return item.beat === beat && ts >= baseStart && ts < baseEnd;
        }).length;
        const ratio = (recentCount + 1) / (baselineCount + 1);
        return { beat, recentCount, baselineCount, ratio };
      })
      .filter((row) => row.recentCount >= 2 && row.ratio >= 1.8)
      .sort((a, b) => b.ratio - a.ratio);
  }, [filteredByTime]);

  const sourcesForModal = useMemo(() => {
    const q = sourceQuery.trim().toLowerCase();
    const preset = SOURCE_PRESETS.find((item) => item.key === selectedPresetKey);

    const byPreset = preset
      ? OUTLET_FEEDS.filter((outlet) => preset.outletIds.includes(outlet.id))
      : OUTLET_FEEDS;
    const scopedSet = new Set(scopedOutletIds);
    const byScope = byPreset.filter((outlet) => scopedSet.has(outlet.id));

    if (!q) return byScope;

    return byScope.filter((outlet) => {
      return (
        outlet.name.toLowerCase().includes(q)
        || outlet.id.toLowerCase().includes(q)
        || outlet.country.toLowerCase().includes(q)
        || outlet.categories.some((category) => category.includes(q))
      );
    });
  }, [scopedOutletIds, sourceQuery, selectedPresetKey]);

  const toggleOutlet = (outletId: string): void => {
    setSelectedOutlets((current) => {
      if (current.includes(outletId)) {
        return current.filter((id) => id !== outletId);
      }
      return [...current, outletId];
    });
  };

  const selectAllOutlets = (): void => setSelectedOutlets([...scopedOutletIds]);
  const selectNoneOutlets = (): void => setSelectedOutlets([]);

  const applyPreset = (preset: SourcePreset, mode: 'replace' | 'add' = 'replace'): void => {
    setSelectedPresetKey(preset.key);
    setSelectedOutlets((current) => {
      if (mode === 'add') {
        return [...new Set([...current, ...preset.outletIds])];
      }
      return [...preset.outletIds];
    });
  };

  const togglePanel = (panel: PanelKey): void => {
    setPanelVisibility((prev) => ({ ...prev, [panel]: !prev[panel] }));
  };

  const saveMonitor = (): void => {
    const name = monitorName.trim();
    if (!name) return;

    const monitor: SavedMonitor = {
      id: `${Date.now()}`,
      name,
      outletIds: selectedOutlets,
      beat: selectedBeat,
      refreshSec,
      timeWindowHours,
      scopeRegion,
      scopeCountry,
      panelVisibility
    };

    setSavedMonitors((prev) => {
      const withoutSameName = prev.filter((item) => item.name.toLowerCase() !== name.toLowerCase());
      return [monitor, ...withoutSameName].slice(0, 20);
    });

    setSelectedMonitorId(monitor.id);
    setMonitorName('');
  };

  const applyMonitor = (monitorId: string): void => {
    const monitor = savedMonitors.find((item) => item.id === monitorId);
    if (!monitor) return;
    setSelectedMonitorId(monitor.id);
    setSelectedOutlets(monitor.outletIds);
    setSelectedBeat(monitor.beat);
    setRefreshSec(monitor.refreshSec);
    setTimeWindowHours(monitor.timeWindowHours);
    setScopeRegion(monitor.scopeRegion || 'all');
    setScopeCountry(monitor.scopeCountry || 'all');
    setPanelVisibility(monitor.panelVisibility);
  };

  const deleteMonitor = (): void => {
    if (!selectedMonitorId) return;
    setSavedMonitors((prev) => prev.filter((item) => item.id !== selectedMonitorId));
    setSelectedMonitorId('');
  };

  const saveLiveCustomLayout = (): void => {
    const payload = { channelIds: liveTiles.map((tile) => tile.channelId) };
    localStorage.setItem(LIVE_LAYOUT_STORAGE_KEY, JSON.stringify(payload));
    setLiveMode('custom');
  };

  const setLiveTileChannel = (slot: number, nextChannelId: string): void => {
    if (liveMode === 'major') {
      setLiveMode('custom');
    }
    setLiveTiles((current) => {
      const next = current.map((tile) => (
        tile.slot === slot ? { ...tile, channelId: nextChannelId } : tile
      ));
      void refreshLiveTiles(next);
      return next;
    });
  };

  const shareCountryCard = async (): Promise<void> => {
    if (selectedCountry === 'Global') return;
    const url = new URL(window.location.href);
    url.searchParams.set('country', selectedCountry);
    url.searchParams.set('countryFilter', countrySourceFilter);
    try {
      await navigator.clipboard.writeText(url.toString());
    } catch {
      // no-op
    }
  };

  const commandItems = useMemo(() => {
    const q = commandQuery.trim().toLowerCase();
    const commands = [
      { id: 'cmd-refresh', label: locale === 'es' ? 'Actualizar ahora' : 'Refresh now', run: () => void refresh() },
      { id: 'cmd-open-sources', label: locale === 'es' ? 'Abrir modal de fuentes' : 'Open sources modal', run: () => setSourcesOpen(true) },
      { id: 'cmd-open-panels', label: locale === 'es' ? 'Abrir paneles' : 'Open panel settings', run: () => setPanelsOpen(true) },
      { id: 'cmd-beat-general', label: locale === 'es' ? 'Sección: general' : 'Set beat: general', run: () => setSelectedBeat('general') },
      { id: 'cmd-beat-business', label: locale === 'es' ? 'Sección: negocios' : 'Set beat: business', run: () => setSelectedBeat('business') },
      { id: 'cmd-beat-politics', label: locale === 'es' ? 'Sección: política' : 'Set beat: politics', run: () => setSelectedBeat('politics') },
      { id: 'cmd-beat-tech', label: locale === 'es' ? 'Sección: tecnología' : 'Set beat: tech', run: () => setSelectedBeat('tech') }
    ];
    const presetCommands = SOURCE_PRESETS.map((preset) => ({
      id: `preset-${preset.key}`,
      label: locale === 'es' ? `Aplicar preset: ${preset.label}` : `Apply preset: ${preset.label}`,
      run: () => applyPreset(preset, 'replace')
    }));

    const outletCommands = OUTLET_FEEDS.map((outlet) => ({
      id: `outlet-${outlet.id}`,
      label: selectedOutlets.includes(outlet.id)
        ? (locale === 'es' ? `Desactivar fuente: ${outlet.name}` : `Disable source: ${outlet.name}`)
        : (locale === 'es' ? `Activar fuente: ${outlet.name}` : `Enable source: ${outlet.name}`),
      run: () => toggleOutlet(outlet.id)
    }));

    const all = [...commands, ...presetCommands, ...outletCommands];
    if (!q) return all.slice(0, 16);
    return all.filter((item) => item.label.toLowerCase().includes(q)).slice(0, 16);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commandQuery, locale, selectedOutlets.join(',')]);

  const renderLiveTile = (tile: LiveTileState) => {
    const channel = channelById.get(tile.channelId);
    if (!channel) return null;
    const isUnmuted = unmutedSlot === tile.slot;
    const src = tile.videoId
      ? `https://www.youtube.com/embed/${tile.videoId}?autoplay=1&mute=${isUnmuted ? 0 : 1}&playsinline=1&controls=1&rel=0`
      : '';

    return (
      <article key={`${tile.slot}-${tile.videoId}-${isUnmuted ? 'a1' : 'a0'}`} className="live-tile">
        <div className="live-tile-top">
          <select
            value={tile.channelId}
            onChange={(event) => setLiveTileChannel(tile.slot, event.target.value)}
          >
            {LIVE_CHANNELS.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
          <span className={tile.isLive ? 'live-pill active' : 'live-pill fallback'}>
            {tile.isLive ? t.live : t.fallback}
          </span>
          <button type="button" onClick={() => setUnmutedSlot((current) => (current === tile.slot ? null : tile.slot))}>
            {isUnmuted ? t.soundOn : t.muted}
          </button>
        </div>

        <div className="live-frame-wrap">
          {src ? (
            <iframe
              title={`live-${tile.slot}-${channel.name}`}
              src={src}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              loading="lazy"
            />
          ) : (
            <div className="live-unavailable">{t.noLive}</div>
          )}
        </div>
      </article>
    );
  };

  return (
    <main className="layout-newsroom">
      {panelVisibility.controls ? (
        <section className="panel controls left-setup">
          <h2>{t.monitorSetup}</h2>

          <div className="control-grid">
            <label>
              {t.region}
              <select value={scopeRegion} onChange={(event) => setScopeRegion(event.target.value as ScopeRegion)}>
                <option value="all">{t.usLatam}</option>
                <option value="us">{t.us}</option>
                <option value="latam">{t.latam}</option>
              </select>
            </label>

            <label>
              {t.country}
              <select value={scopeCountry} onChange={(event) => setScopeCountry(event.target.value as ScopeCountry)}>
                <option value="all">{t.all}</option>
                {(scopeRegion === 'all' || scopeRegion === 'us') ? <option value="United States">{t.us}</option> : null}
                {(scopeRegion === 'all' || scopeRegion === 'latam') ? <option value="Chile">Chile</option> : null}
                {(scopeRegion === 'all' || scopeRegion === 'latam') ? <option value="Argentina">Argentina</option> : null}
                {(scopeRegion === 'all' || scopeRegion === 'latam') ? <option value="Uruguay">Uruguay</option> : null}
              </select>
            </label>

            <label>
              {t.outlet}
              <select value={selectedOutletFilter} onChange={(event) => setSelectedOutletFilter(event.target.value)}>
                <option value="all">{t.allOutlets}</option>
                {effectiveOutletOptions.map((outlet) => (
                  <option key={outlet.id} value={outlet.name}>{outlet.name}</option>
                ))}
              </select>
            </label>

            <label>
              {t.beat}
              <select value={selectedBeat} onChange={(event) => setSelectedBeat(event.target.value as Beat)}>
                {BEATS.map((beat) => (
                  <option key={beat} value={beat}>{BEAT_LABELS[locale][beat]}</option>
                ))}
              </select>
            </label>

            {selectedBeat === 'world' ? (
              <label>
                {t.worldFilter}
                <select value={worldScope} onChange={(event) => setWorldScope(event.target.value as WorldScope)}>
                  <option value="latam_related">{t.worldLatam}</option>
                  <option value="all_world">{t.worldAll}</option>
                </select>
              </label>
            ) : null}

            <label>
              {t.refresh}
              <select value={refreshSec} onChange={(event) => setRefreshSec(Number(event.target.value))}>
                {REFRESH_OPTIONS.map((sec) => (
                  <option key={sec} value={sec}>{t.every} {sec}s</option>
                ))}
              </select>
            </label>

            <label>
              {t.timeWindow}
              <select value={timeWindowHours} onChange={(event) => setTimeWindowHours(Number(event.target.value))}>
                {TIME_WINDOWS_HOURS.map((hours) => (
                  <option key={hours} value={hours}>{hours}h</option>
                ))}
              </select>
            </label>
          </div>

          <h3>{t.sourcePresets}</h3>
          <div className="preset-actions">
            <select value={selectedPresetKey} onChange={(event) => setSelectedPresetKey(event.target.value)}>
              {SOURCE_PRESETS.map((preset) => (
                <option key={preset.key} value={preset.key}>{preset.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                const preset = SOURCE_PRESETS.find((item) => item.key === selectedPresetKey);
                if (preset) applyPreset(preset, 'replace');
              }}
            >
              {t.apply}
            </button>
            <button
              type="button"
              onClick={() => {
                const preset = SOURCE_PRESETS.find((item) => item.key === selectedPresetKey);
                if (preset) applyPreset(preset, 'add');
              }}
            >
              {t.add}
            </button>
          </div>
          <p className="meta">
            {SOURCE_PRESETS.find((preset) => preset.key === selectedPresetKey)?.description || 'Preset description'}
          </p>

          <h3>{t.savedMonitors}</h3>
          <div className="monitor-actions">
            <input
              value={monitorName}
              onChange={(event) => setMonitorName(event.target.value)}
              placeholder={t.morningMacroWatch}
            />
            <button type="button" onClick={saveMonitor}>{t.save}</button>
          </div>

          <div className="monitor-actions">
            <select value={selectedMonitorId} onChange={(event) => applyMonitor(event.target.value)}>
              <option value="">{t.selectSaved}</option>
              {savedMonitors.map((monitor) => (
                <option key={monitor.id} value={monitor.id}>{monitor.name}</option>
              ))}
            </select>
            <button type="button" onClick={deleteMonitor} disabled={!selectedMonitorId}>{t.delete}</button>
          </div>

          <p className="meta">{t.selectedSources}: {effectiveSelectedOutlets.length} / {scopedOutletIds.length} {t.inScope}</p>
          <p className="meta">{t.sourcePolicy}</p>
          <p className="meta">{t.lastUpdated}: {parseDateLabel(lastUpdated, locale)}</p>
          <div className="topbar-controls inline-controls">
            <button type="button" onClick={() => setSourcesOpen(true)}>{t.sources}</button>
            <button type="button" onClick={() => setPanelsOpen(true)}>{t.panels}</button>
            <button type="button" onClick={() => setCommandOpen(true)}>{t.search} (⌘K)</button>
            <button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? t.refreshing : t.refresh}</button>
          </div>

          <h3>{t.liveTvWall}</h3>
          <div className="livewall-actions">
            <button type="button" className={liveMode === 'major' ? 'active' : ''} onClick={() => setLiveMode('major')}>{t.majorJournal}</button>
            <button type="button" className={liveMode === 'custom' ? 'active' : ''} onClick={() => setLiveMode('custom')}>{t.custom}</button>
            <button type="button" onClick={saveLiveCustomLayout}>{t.saveCustomLayout}</button>
          </div>
          <p className="meta">{t.lastChecked}: {liveUpdatedAt ? parseDateLabel(liveUpdatedAt, locale) : t.checking}</p>
        </section>
      ) : null}

      {panelVisibility.liveWall ? (
        <section className="panel live-stack left-live-stack">
          {liveTiles.filter((tile) => tile.slot < 3).map((tile) => renderLiveTile(tile))}
        </section>
      ) : null}

      {panelVisibility.map ? (
        <section className="panel map-panel">
          <GeoMap
            items={filteredItems}
            selectedCountry={selectedCountry}
            onCountrySelect={setSelectedCountry}
            selectedOutletFilter={selectedOutletFilter}
            onOutletSelect={setSelectedOutletFilter}
            mapViewMode={mapViewMode}
            onMapViewModeChange={setMapViewMode}
            samplingLabel={ingestionSummary
              ? `${t.mapCountQuality}: ${(ingestionSummary.sampleCappedEndpoints || 0) > 0 ? t.sampled : t.full}`
              : `${t.mapCountQuality}: ${t.full}`}
            locale={locale}
          />
        </section>
      ) : null}

      {panelVisibility.liveWall ? (
        <section className="panel live-stack right-live-stack">
          {liveTiles.filter((tile) => tile.slot >= 3).map((tile) => renderLiveTile(tile))}
        </section>
      ) : null}

      {panelVisibility.feed ? (
        <section className="panel feed-panel center-feed">
          <h2>{t.liveFeed}</h2>
          {selectedCountry !== 'Global' ? (
            <>
              <p className="meta">
                {t.countryModePrioritizing} {COUNTRY_PRIMARY_LANGUAGE[selectedCountry] || t.local} {t.languagePlusSourcesFor} {selectedCountry}.
              </p>
              {countryAutoAdded > 0 ? (
                <p className="meta">{t.autoAdded} {countryAutoAdded} {t.local}/{t.portal} {t.autoAddedFor} {selectedCountry}.</p>
              ) : null}
              <div className="country-filter-row">
                <label>
                {t.countryIntakeFilter}
                  <select
                    value={countrySourceFilter}
                    onChange={(event) => setCountrySourceFilter(event.target.value as 'all' | 'local' | 'portal' | 'global')}
                  >
                    <option value="all">{t.allWorldLower}</option>
                    <option value="local">{t.localOnly}</option>
                    <option value="portal">{t.portalOnly}</option>
                    <option value="global">{t.globalOnly}</option>
                  </select>
                </label>
              </div>
            </>
          ) : null}
          <ul className="feed-list">
            {rankedCountryItems.map((item) => (
              <li key={item.id} className="feed-item">
                <a href={item.link} target="_blank" rel="noreferrer">{item.title}</a>
                <div className="source-line">{item.source}</div>
                <div className="chips">
                  <code className="chip chip-beat">{t.theme}: {BEAT_LABELS[locale][item.beat]}</code>
                  <code className="chip chip-source-type">{item.sourceType || t.global}</code>
                  <code className="chip chip-lag">{minutesSince(item.publishedAt)} {t.agoMins}</code>
                  <code className="chip">{t.published}: {parseDateLabel(item.publishedAt, locale)}</code>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {countryCardOpen && selectedCountry !== 'Global' && countryCardMetrics ? (
        <section
          className="country-overlay"
          role="dialog"
          aria-modal="true"
          onClick={(event) => {
            if (event.target === event.currentTarget && !countryCardPinned) setCountryCardOpen(false);
          }}
        >
          <section className={countryCardPinned ? 'country-intel-card country-intel-floating pinned' : 'country-intel-card country-intel-floating'}>
            <div className="country-intel-header">
              <div className="country-intel-title">
                <h3>{selectedCountry}</h3>
                <span className="country-intel-badge">{t.countryIntel}</span>
              </div>
              <div className="country-intel-actions">
                <button type="button" title={t.share} onClick={() => void shareCountryCard()}>↗</button>
                <button type="button" title={t.pin} onClick={() => setCountryCardPinned((prev) => !prev)}>{countryCardPinned ? '📌' : '📍'}</button>
                <button type="button" title={t.close} onClick={() => setCountryCardOpen(false)}>×</button>
              </div>
            </div>
            <div className="country-intel-score">
              <div className="country-intel-score-label">
                <span>{t.coverageHealth}</span>
                <strong>{Math.min(100, Math.round((countryCardMetrics.localCount * 2 + countryCardMetrics.portalCount * 1.2 + countryCardMetrics.globalCount * 0.8) * 2))}/100</strong>
              </div>
              <div className="country-intel-score-bar">
                <div
                  className="country-intel-score-fill"
                  style={{ width: `${Math.min(100, Math.round((countryCardMetrics.localCount * 2 + countryCardMetrics.portalCount * 1.2 + countryCardMetrics.globalCount * 0.8) * 2))}%` }}
                />
              </div>
            </div>
            <div className="country-intel-grid">
              <p><strong>{countryCardMetrics.total}</strong> {t.stories}</p>
              <p><strong>{dedupedCountryItems.length}</strong> {t.clusters}</p>
              <p><strong>{countryCardMetrics.localCount}</strong> {t.local}</p>
              <p><strong>{countryCardMetrics.portalCount}</strong> {t.portal}</p>
              <p><strong>{countryCardMetrics.globalCount}</strong> {t.global}</p>
              <p><strong>{countryCardMetrics.localLanguageCount}</strong> in {countryCardMetrics.preferredLanguage}</p>
              <p>{t.latest}: {countryCardMetrics.latest ? parseDateLabel(countryCardMetrics.latest, locale) : t.notAvailable}</p>
            </div>
            <div className="country-intel-mini-chips">
              <code className="chip chip-lang">{countryCardMetrics.preferredLanguage}</code>
              <code className="chip chip-source-type">{t.local} {countryCardMetrics.localCount}</code>
              <code className="chip chip-source-type">{t.portal} {countryCardMetrics.portalCount}</code>
              <code className="chip chip-source">{t.global} {countryCardMetrics.globalCount}</code>
            </div>
            {countryCardMetrics.localCount === 0 && countryCardMetrics.portalCount > 0 ? (
              <p className="meta">{t.directLocalDegraded}</p>
            ) : null}
            {countryCardMetrics.globalCount === 0 ? (
              <p className="meta">{t.noGlobalBucket}</p>
            ) : null}
            <ul className="simple-list">
              {rankedCountryItems.slice(0, 4).map((item) => (
                <li key={item.id}>
                  <strong>{item.title}</strong>
                  <span>{item.source} · {item.language || 'en'} · {item.sourceType || 'global'}</span>
                </li>
              ))}
              {rankedCountryItems.length === 0 ? <li>{t.noCountryStories}</li> : null}
            </ul>
          </section>
        </section>
      ) : null}

      {panelVisibility.countryBrief ? (
        <section className="panel analytics-panel">
          <h3>{t.dailyCountryBrief}</h3>
          <p className="meta">{selectedCountry} · {countryScopedItems.length} {t.countryStoriesWindow} · {dedupedCountryItems.length} {t.dedupedClusters}</p>
          <ul className="simple-list">
            {countryBriefRows.map((row) => (
              <li key={row.key}>
                <strong>{row.label}</strong>
                <span>{row.count} stories</span>
                <span>
                  {row.headlines.length > 0
                    ? row.headlines.map((item) => item.title).join(' • ')
                    : t.noItemsInCategory}
                </span>
              </li>
            ))}
          </ul>
          {selectedCountry !== 'Global' ? (
            <>
              <h3 style={{ marginTop: '10px' }}>{t.sourceQualityCountry}</h3>
              <ul className="simple-list">
                {countrySourceRanking.map((row) => (
                  <li key={row.source}>
                    <strong>{row.source}</strong>
                    <span>{t.score} {row.score}</span>
                    <span>{row.count} {t.storiesWord} · {t.medianLag} {row.medianLag}m</span>
                    <span>{row.sourceType} · {row.review}</span>
                  </li>
                ))}
                {countrySourceRanking.length === 0 ? <li>{t.noCountrySourceRanking}</li> : null}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}

      <section className="insight-grid">
        {panelVisibility.speedBoard ? (
          <section className="panel analytics-panel">
            <h3>{t.speedBoard}</h3>
            <ul className="simple-list">
              {sourceStats.slice(0, 12).map((row) => (
                <li key={row.source}>
                  <strong>{row.source}</strong>
                  <span>{row.count} {t.storiesWord}</span>
                  <span>{t.medianLagText} {Math.round(row.medianLagMins)}m</span>
                  <span>{t.unknownLatest} {parseDateLabel(new Date(row.latest).toISOString(), locale)}</span>
                </li>
              ))}
              {sourceStats.length === 0 ? <li>{t.noSourceActivity}</li> : null}
            </ul>
          </section>
        ) : null}

        {panelVisibility.beatMix ? (
          <section className="panel analytics-panel">
            <h3>{t.beatMix}</h3>
            <ul className="simple-list">
              {beatMix.map((row) => (
                <li key={row.beat}>
                  <strong>{BEAT_LABELS[locale][row.beat]}</strong>
                  <span>{row.count} {t.storiesWord}</span>
                  <span>{row.ratio.toFixed(1)}%</span>
                </li>
              ))}
              {beatMix.length === 0 ? <li>{t.noBeatActivity}</li> : null}
            </ul>
          </section>
        ) : null}

        {panelVisibility.spikeAlerts ? (
          <section className="panel analytics-panel">
            <h3>{t.spikeAlerts}</h3>
            <ul className="simple-list">
              {spikeAlerts.map((alert) => (
                <li key={alert.beat}>
                  <strong>{BEAT_LABELS[locale][alert.beat]}</strong>
                  <span>{t.recentText} {alert.recentCount}</span>
                  <span>{t.baselineText} {alert.baselineCount}</span>
                  <span>{alert.ratio.toFixed(2)}x</span>
                </li>
              ))}
              {spikeAlerts.length === 0 ? <li>{t.noSpikes}</li> : null}
            </ul>
          </section>
        ) : null}

        {panelVisibility.opsBoard ? (
          <section className="panel analytics-panel">
            <h3>{t.ingestionOps}</h3>
            {ingestionOps ? (
              <>
                <p className="meta">
                  {t.opsStorage}: {ingestionOps.storage} · {parseDateLabel(ingestionOps.generatedAt, locale)}
                </p>
                <ul className="simple-list">
                  <li><strong>{t.opsUnique24h}</strong><span>{ingestionOps.totals.uniqueItems24h}</span></li>
                  <li><strong>{t.opsSources24h}</strong><span>{ingestionOps.totals.sourceCount24h}</span></li>
                  <li><strong>{t.opsSeen24h}</strong><span>{ingestionOps.totals.seenTotal24h}</span></li>
                  <li><strong>{t.opsDuplicates24h}</strong><span>{ingestionOps.totals.duplicateCandidates24h}</span></li>
                  <li><strong>{t.opsDuplicateRate24h}</strong><span>{ingestionOps.totals.duplicateRate24h.toFixed(1)}%</span></li>
                  <li><strong>{t.opsEndpointRuns24h}</strong><span>{ingestionOps.totals.endpointRuns24h}</span></li>
                  <li><strong>{t.opsFailedRuns24h}</strong><span>{ingestionOps.totals.failedRuns24h}</span></li>
                  <li><strong>{t.opsFailureRate24h}</strong><span>{ingestionOps.totals.failureRate24h.toFixed(1)}%</span></li>
                </ul>
                <h3 style={{ marginTop: '10px' }}>{t.opsTopSources24h}</h3>
                <ul className="simple-list">
                  {ingestionOps.topSources24h.slice(0, 12).map((row) => (
                    <li key={`ops-${row.source}`}>
                      <strong>{row.source}</strong>
                      <span>{row.uniqueItems24h} {t.storiesWord}</span>
                      <span>{t.opsDuplicates24h} {row.duplicateCandidates24h}</span>
                      <span>{t.opsFailureRate24h} {row.failureRate24h.toFixed(1)}%</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="meta">{t.noOpsSummary}</p>
            )}
            {ingestionSummary ? (
              <>
                <p className="meta">
                  {t.endpointSummary} {ingestionSummary.okEndpoints}/{ingestionSummary.totalEndpoints} {t.ok} · {t.failed} {ingestionSummary.failedEndpoints} · {t.circuit} {ingestionSummary.circuitOpenEndpoints}
                </p>
                <h3 style={{ marginTop: '10px' }}>{t.endpointFailures}</h3>
                <ul className="simple-list">
                  {ingestionFailures.map((row) => (
                    <li key={`fail-${row.outletId}`}>
                      <strong>{row.source}</strong>
                      <span>{t.failed} {row.failed}/{row.attempted}</span>
                      <span>{t.recent24h} {row.recent24h} · {t.parsed} {row.parsedCount}</span>
                      <span>{row.errors || t.unknownError}</span>
                    </li>
                  ))}
                  {ingestionFailures.length === 0 ? <li>{t.noEndpointFailures}</li> : null}
                </ul>
                <h3 style={{ marginTop: '10px' }}>{t.zeroYieldSources}</h3>
                <ul className="simple-list">
                  {ingestionZeroYield.map((row) => (
                    <li key={`zero-${row.outletId}`}>
                      <strong>{row.source}</strong>
                      <span>{t.attempted} {row.attempted} · {t.ok} {row.ok}</span>
                      <span>{t.recent24h} {row.recent24h} · {t.parsed} {row.parsedCount}</span>
                    </li>
                  ))}
                  {ingestionZeroYield.length === 0 ? <li>{t.noZeroYield}</li> : null}
                </ul>
              </>
            ) : (
              <p className="meta">{t.noIngestionDiagnostics}</p>
            )}
          </section>
        ) : null}
      </section>

      {sourcesOpen ? (
        <section className="overlay" role="dialog" aria-modal="true">
          <div className="modal wide-modal">
            <div className="modal-header">
              <h3>{t.newsSources}</h3>
              <button type="button" onClick={() => setSourcesOpen(false)}>{t.close}</button>
            </div>

            <input
              placeholder={t.filterSources}
              value={sourceQuery}
              onChange={(event) => setSourceQuery(event.target.value)}
            />

            <div className="preset-chip-row">
              {SOURCE_PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.key}
                  className={selectedPresetKey === preset.key ? 'preset-chip active' : 'preset-chip'}
                  onClick={() => setSelectedPresetKey(preset.key)}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="modal-grid">
              {sourcesForModal.map((outlet) => (
                <label key={outlet.id} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={selectedOutlets.includes(outlet.id)}
                    onChange={() => toggleOutlet(outlet.id)}
                  />
                  <span>{outlet.name}</span>
                  <code>{outlet.language || 'en'}</code>
                  <code>{outlet.sourceType || 'global'}</code>
                  {outlet.reviewDecision ? <code>{outlet.reviewDecision}</code> : null}
                  <code>Tier {outlet.tier}</code>
                </label>
              ))}
            </div>

            <div className="modal-footer">
              <button type="button" onClick={selectAllOutlets}>{t.selectAll}</button>
              <button type="button" onClick={selectNoneOutlets}>{t.selectNone}</button>
            </div>
          </div>
        </section>
      ) : null}

      {panelsOpen ? (
        <section className="overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <h3>{t.panelSettings}</h3>
              <button type="button" onClick={() => setPanelsOpen(false)}>{t.close}</button>
            </div>

            <div className="modal-grid">
              {PANEL_META.map((panel) => (
                <label key={panel.key} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={panelVisibility[panel.key]}
                    onChange={() => togglePanel(panel.key)}
                  />
                  <span>{PANEL_LABELS[locale][panel.key]}</span>
                </label>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {commandOpen ? (
        <section className="overlay" role="dialog" aria-modal="true">
          <div className="modal command-modal">
            <div className="modal-header">
              <h3>{t.commandSearch}</h3>
              <button type="button" onClick={() => setCommandOpen(false)}>ESC</button>
            </div>

            <input
              autoFocus
              placeholder={t.searchCommands}
              value={commandQuery}
              onChange={(event) => setCommandQuery(event.target.value)}
            />

            <ul className="command-list">
              {commandItems.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      item.run();
                      setCommandOpen(false);
                      setCommandQuery('');
                    }}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
              {commandItems.length === 0 ? <li>{t.noCommandMatch}</li> : null}
            </ul>
          </div>
        </section>
      ) : null}
    </main>
  );
}
