'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { GeoMap } from '@/components/GeoMap';
import { OUTLET_FEEDS, SOURCE_PRESETS } from '@/data/outlets';
import type { NewsSection, NewsItem, SourcePreset } from '@/lib/types';
import { draftIdFromLink, isLikelyBreakingTitle, normalizeLinkForId, nowIso, type DraftRecord } from '@/lib/pipeline';

const REFRESH_OPTIONS = [15, 60, 300];
const TIME_WINDOWS_HOURS = [1, 6, 24];
const SECTIONS: NewsSection[] = ['general', 'politics', 'business', 'tech', 'security', 'climate', 'world'];
const MONITOR_STORAGE_KEY = 'presslab.savedMonitors.v1';
const PANEL_STORAGE_KEY = 'presslab.panelVisibility.v2';
const BREAKING_AUTO_DRAFT_DELAY_MS = 90_000;
const BREAKING_DRAFT_MAX_SOURCES = 4;

type PanelKey = 'controls' | 'map' | 'liveWall' | 'feed' | 'speedBoard' | 'beatMix' | 'spikeAlerts';

type PanelVisibility = Record<PanelKey, boolean>;

interface SavedMonitor {
  id: string;
  name: string;
  outletIds: string[];
  section: NewsSection;
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
type NewsroomDashboardProps = {
  locale?: Locale;
  onQueueDraft?: (draft: DraftRecord) => void;
  existingDraftLinks?: string[];
  onBreakingQueued?: () => void;
};

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

interface BreakingQueueItem {
  id: number;
  source_kind: string;
  source_ref: string;
  title: string;
  link: string;
  summary: string | null;
  language: string | null;
  country: string | null;
  status: string;
  priority: number;
  created_at: string;
  updated_at: string;
}

type RelatedDraftSource = {
  title: string;
  source: string;
  link: string;
  publishedAt: string;
};

const DEFAULT_PANELS: PanelVisibility = {
  controls: true,
  map: true,
  liveWall: true,
  feed: true,
  speedBoard: false,
  beatMix: false,
  spikeAlerts: false
};

const PANEL_META: Array<{ key: PanelKey; label: string }> = [
  { key: 'controls', label: 'Control Rail' },
  { key: 'map', label: 'Global Map' },
  { key: 'liveWall', label: 'Live TV Wall' },
  { key: 'feed', label: 'Live Feed' },
  { key: 'speedBoard', label: 'Speed Board' },
  { key: 'beatMix', label: 'Section Mix' },
  { key: 'spikeAlerts', label: 'Spike Alerts' }
];

const PANEL_LABELS: Record<Locale, Record<PanelKey, string>> = {
  en: {
    controls: 'Control Rail',
    map: 'Global Map',
    liveWall: 'Live TV Wall',
    feed: 'Live Feed',
    speedBoard: 'Speed Board',
    beatMix: 'Section Mix',
    spikeAlerts: 'Spike Alerts'
  },
  es: {
    controls: 'Controles',
    map: 'Mapa global',
    liveWall: 'Muro TV',
    feed: 'Feed en vivo',
    speedBoard: 'Panel de velocidad',
    beatMix: 'Mix de secciones',
    spikeAlerts: 'Alertas de picos'
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
const MAJOR_WATCH_OUTLETS = [
  'ap-news',
  'reuters',
  'cnn',
  'fox-news',
  'nbc-news',
  'cbs-news',
  'bloomberg',
  'the-new-york-times',
  'washington-post',
  'wall-street-journal'
] as const;
const MAJOR_WATCH_SEEN_KEY = 'presslab.major-watch.seen.v1';
const COUNTRY_MIN_WINDOW_HOURS = 24;
const NEWS_FETCH_CHUNK_SIZE = 120;
const STREAM_PAGE_SIZE = 5;
const COUNTRY_CARD_PAGE_SIZE = 5;
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
    majorWatch: 'Major 10 Watch',
    majorWatchSub: 'Realtime stream from AP/Reuters/CNN and major US desks',
    rssSitemapLive: 'RSS/Sitemap Live Stream',
    rssSitemapLiveSub: 'Newest ingested items from RSS and sitemap sources in current scope',
    rssSitemapEmpty: 'No recent RSS/Sitemap items in current scope.',
    watchNew: 'new',
    markSeen: 'Mark Seen',
    watchChecked: 'Last checked',
    watchEmpty: 'No recent articles from major watch sources.',
    autoQueued: 'Auto-queued to Writing',
    breakingQueue: 'Breaking Queue',
    breakingQueueSub: 'X + system breaking candidates',
    queueEmpty: 'No breaking items in queue.',
    dismiss: 'Dismiss',
    queueToWriting: 'Queue to Writing',
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
    searchCommands: 'Search commands, sections, sources...',
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
    beatMix: 'Section Mix',
    spikeAlerts: 'Spike Alerts',
    noSourceActivity: 'No source activity in this window.',
    noBeatActivity: 'No section activity yet.',
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
    section: 'Section',
    timePublished: 'Time',
    locality: 'Locality',
    published: 'Published',
    prevPage: 'Prev',
    nextPage: 'Next',
    page: 'Page',
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
    majorWatch: 'Monitor Major 10',
    majorWatchSub: 'Flujo en tiempo real desde AP/Reuters/CNN y fuentes principales de EE.UU.',
    rssSitemapLive: 'Flujo en vivo RSS/Sitemap',
    rssSitemapLiveSub: 'Items mas recientes ingeridos desde fuentes RSS y sitemap en el alcance actual',
    rssSitemapEmpty: 'No hay items recientes de RSS/Sitemap en el alcance actual.',
    watchNew: 'nuevas',
    markSeen: 'Marcar vistas',
    watchChecked: 'Última revisión',
    watchEmpty: 'Sin artículos recientes en fuentes Major 10.',
    autoQueued: 'En cola automática a Redacción',
    breakingQueue: 'Cola Breaking',
    breakingQueueSub: 'Candidatos breaking de X + sistema',
    queueEmpty: 'No hay elementos breaking en cola.',
    dismiss: 'Descartar',
    queueToWriting: 'Enviar a Redacción',
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
    section: 'Sección',
    timePublished: 'Tiempo',
    locality: 'Cobertura',
    published: 'Publicado',
    prevPage: 'Anterior',
    nextPage: 'Siguiente',
    page: 'Página',
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

const SECTION_LABELS: Record<Locale, Record<NewsSection, string>> = {
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

function parseDateLabel(value: string, locale: Locale = 'en', withTimeZone = false): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return locale === 'es' ? 'Hora desconocida' : 'Unknown time';
  const localeTag = locale === 'es' ? 'es-ES' : 'en-US';
  if (withTimeZone) {
    return date.toLocaleString(localeTag, { timeZoneName: 'short' });
  }
  return date.toLocaleString(localeTag);
}

const BREAKING_EVENT_STOPWORDS = new Set([
  'breaking', 'live', 'update', 'updates', 'latest',
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'from', 'as', 'at', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'this', 'that', 'these', 'those', 'say', 'says', 'said',
  'el', 'la', 'los', 'las', 'un', 'una', 'y', 'o', 'de', 'del', 'en', 'por', 'con', 'para', 'que', 'se', 'al', 'como', 'segun', 'según', 'hoy', 'ayer'
]);

function extractDomainForDraft(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function breakingEventKeyFromTitle(title: string): string {
  const cleaned = (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  const tokens = cleaned
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !BREAKING_EVENT_STOPWORDS.has(t));
  const uniq: string[] = [];
  for (const token of tokens) {
    if (uniq.includes(token)) continue;
    uniq.push(token);
    if (uniq.length >= 10) break;
  }
  const top = uniq.slice(0, 8).sort();
  return top.join('|');
}

function minutesSince(value: string): number {
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return 0;
  return Math.max(0, Math.round((Date.now() - ts) / 60000));
}

function relativeAgeLabel(value: string, locale: Locale = 'en'): string {
  const minutes = minutesSince(value);
  if (minutes < 60) return locale === 'es' ? `${minutes} min` : `${minutes} m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return locale === 'es' ? `${hours} h` : `${hours} h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return locale === 'es' ? `${days} d` : `${days} d ago`;

  const weeks = Math.floor(days / 7);
  return locale === 'es' ? `${weeks} sem` : `${weeks} w ago`;
}

function deriveSectionFromText(text: string): NewsSection {
  const value = text.toLowerCase();
  if (/(election|congress|senate|policy|government|president|minister|vote|parliament)/.test(value)) return 'politics';
  if (/(market|inflation|economy|gdp|jobs|earnings|business|stocks|trade|finance|bank)/.test(value)) return 'business';
  if (/(ai|chip|cyber|software|cloud|startup|tech|device|apple|google|microsoft)/.test(value)) return 'tech';
  if (/(war|defense|military|attack|missile|threat|terror|security|intelligence)/.test(value)) return 'security';
  if (/(climate|weather|hurricane|wildfire|flood|earthquake|storm|environment)/.test(value)) return 'climate';
  if (/(world|international|global|foreign|diplomatic)/.test(value)) return 'world';
  return 'general';
}

function localityFromSourceType(sourceType?: string): 'local' | 'global' {
  if ((sourceType || '').toLowerCase() === 'global') return 'global';
  return 'local';
}

function localityFromCountry(country?: string | null): 'local' | 'global' {
  if (!country) return 'global';
  return isUsOutlet(country) || isLatamOutlet(country) ? 'local' : 'global';
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

function chunkArray<T>(values: T[], size: number): T[][] {
  if (values.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

function dedupeAndSortNewsItems(rows: NewsItem[], limit: number): NewsItem[] {
  const byKey = new Map<string, NewsItem>();
  for (const row of rows) {
    const key = row.id || row.link;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }
    const existingTs = new Date(existing.publishedAt).getTime();
    const rowTs = new Date(row.publishedAt).getTime();
    if (rowTs > existingTs) {
      byKey.set(key, row);
    }
  }
  return [...byKey.values()]
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, limit);
}

export function NewsroomDashboard({
  locale = 'en',
  onQueueDraft,
  existingDraftLinks = [],
  onBreakingQueued
}: NewsroomDashboardProps) {
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
  const [selectedSection, setSelectedSection] = useState<NewsSection>('general');
  const [worldScope, setWorldScope] = useState<WorldScope>('latam_related');
  const [refreshSec, setRefreshSec] = useState<number>(60);
  const [timeWindowHours, setTimeWindowHours] = useState<number>(24);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [ingestionSummary, setIngestionSummary] = useState<IngestionSummary | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string>('Global');
  const [majorWatchRows, setMajorWatchRows] = useState<NewsItem[]>([]);
  const [majorWatchPage, setMajorWatchPage] = useState<number>(1);
  const [majorWatchCheckedAt, setMajorWatchCheckedAt] = useState<string>('');
  const [majorWatchNewCount, setMajorWatchNewCount] = useState<number>(0);
  const [majorWatchReady, setMajorWatchReady] = useState<boolean>(false);
  const [breakingQueueRows, setBreakingQueueRows] = useState<BreakingQueueItem[]>([]);
  const [breakingQueuePage, setBreakingQueuePage] = useState<number>(1);
  const [rssSitemapPage, setRssSitemapPage] = useState<number>(1);
  const [countryAutoAdded, setCountryAutoAdded] = useState<number>(0);
  const [countryCardOpen, setCountryCardOpen] = useState<boolean>(false);
  const [countryCardPinned, setCountryCardPinned] = useState<boolean>(false);
  const [countryCardPage, setCountryCardPage] = useState<number>(1);
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
  const normalizedSelectedCountry = useMemo(
    () => (selectedCountry === 'Global' ? 'Global' : normalizeOutletCountry(selectedCountry)),
    [selectedCountry]
  );
  const knownDraftLinkSet = useMemo(
    () => new Set(existingDraftLinks.map((link) => normalizeLinkForId(link))),
    [existingDraftLinks]
  );
  const knownDraftLinkSetRef = useRef<Set<string>>(knownDraftLinkSet);
  useEffect(() => {
    knownDraftLinkSetRef.current = knownDraftLinkSet;
  }, [knownDraftLinkSet]);

  const majorWatchRowsRef = useRef<NewsItem[]>([]);
  useEffect(() => {
    majorWatchRowsRef.current = majorWatchRows;
  }, [majorWatchRows]);

  const breakingQueueRowsRef = useRef<BreakingQueueItem[]>([]);
  useEffect(() => {
    breakingQueueRowsRef.current = breakingQueueRows;
  }, [breakingQueueRows]);

  const pendingBreakingDraftsRef = useRef<Map<string, number>>(new Map());
  const pendingMajorDraftsRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    return () => {
      for (const timer of pendingBreakingDraftsRef.current.values()) {
        window.clearTimeout(timer);
      }
      pendingBreakingDraftsRef.current.clear();

      for (const timer of pendingMajorDraftsRef.current.values()) {
        window.clearTimeout(timer);
      }
      pendingMajorDraftsRef.current.clear();
    };
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
        setLastUpdated(new Date().toISOString());
        return;
      }
      const limit = timeWindowHours >= 24 ? 15000 : 6000;
      const chunks = chunkArray(effectiveSelectedOutlets, NEWS_FETCH_CHUNK_SIZE);
      const chunkLimit = chunks.length > 1
        ? Math.max(500, Math.min(limit, Math.ceil((limit * 1.35) / chunks.length)))
        : limit;

      const mergedRows: NewsItem[] = [];
      const mergedIngestion: IngestionSummary = {
        totalOutlets: 0,
        totalEndpoints: 0,
        okEndpoints: 0,
        failedEndpoints: 0,
        circuitOpenEndpoints: 0,
        sampleCappedEndpoints: 0,
        diagnostics: []
      };
      let mergedGeneratedAt = '';
      let successCount = 0;

      for (const chunkIds of chunks) {
        const params = new URLSearchParams();
        params.set('outlets', chunkIds.join(','));
        params.set('limit', String(chunkLimit));
        const res = await fetch(`/api/news?${params.toString()}`);
        if (!res.ok) {
          console.warn('[news] refresh chunk failed status', res.status);
          continue;
        }
        const json = await safeJson<{ items: NewsItem[]; generatedAt: string; ingestion?: IngestionSummary }>(res);
        if (!json) {
          console.warn('[news] refresh chunk failed: invalid or empty JSON');
          continue;
        }
        successCount += 1;
        mergedRows.push(...((json.items || []).map((item) => ({
          ...item,
          title: decodeEntities(item.title)
        }))));
        const generatedTs = new Date(json.generatedAt || '').getTime();
        const mergedTs = new Date(mergedGeneratedAt || '').getTime();
        if (!Number.isFinite(mergedTs) || (Number.isFinite(generatedTs) && generatedTs > mergedTs)) {
          mergedGeneratedAt = json.generatedAt;
        }
        if (json.ingestion) {
          mergedIngestion.totalOutlets += json.ingestion.totalOutlets || 0;
          mergedIngestion.totalEndpoints += json.ingestion.totalEndpoints || 0;
          mergedIngestion.okEndpoints += json.ingestion.okEndpoints || 0;
          mergedIngestion.failedEndpoints += json.ingestion.failedEndpoints || 0;
          mergedIngestion.circuitOpenEndpoints += json.ingestion.circuitOpenEndpoints || 0;
          mergedIngestion.sampleCappedEndpoints = (mergedIngestion.sampleCappedEndpoints || 0) + (json.ingestion.sampleCappedEndpoints || 0);
          mergedIngestion.diagnostics.push(...(json.ingestion.diagnostics || []));
        }
      }

      if (successCount === 0) {
        console.warn('[news] refresh failed: no successful chunks');
        return;
      }

      const cleaned = dedupeAndSortNewsItems(mergedRows, limit);
      setItems(cleaned);
      setIngestionSummary(mergedIngestion.totalEndpoints > 0 ? mergedIngestion : null);
      setLastUpdated(mergedGeneratedAt || new Date().toISOString());
    } finally {
      setLoading(false);
    }
  };

  const markMajorSeen = (rows: NewsItem[] = majorWatchRows): void => {
    const nextSeen = new Set<string>();
    try {
      const raw = localStorage.getItem(MAJOR_WATCH_SEEN_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        for (const value of parsed) nextSeen.add(value);
      }
    } catch {
      // no-op
    }
    for (const row of rows) {
      const key = normalizeLinkForId(row.link);
      if (key) nextSeen.add(key);
    }
    localStorage.setItem(MAJOR_WATCH_SEEN_KEY, JSON.stringify([...nextSeen].slice(-3000)));
    setMajorWatchNewCount(0);
  };

  const queueDraftFromBreakingInput = async (
    payload: {
      title: string;
      source: string;
      link: string;
      publishedAt: string;
      queuedFrom?: DraftRecord['autoQueuedFrom'];
      related?: RelatedDraftSource[];
    },
    force = false
  ): Promise<boolean> => {
    if (!onQueueDraft) return false;
    const normalized = normalizeLinkForId(payload.link);
    if (!normalized || knownDraftLinkSet.has(normalized)) return false;
    if (!force && !isLikelyBreakingTitle(payload.title)) return false;

    let headlineEs = payload.title;
    let bodyEs = `${payload.source} reportó: ${payload.title}\n\nFuente: ${payload.link}`;
    try {
      const res = await fetch('/api/ai/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: payload.title,
          source: payload.source,
          link: payload.link,
          publishedAt: payload.publishedAt,
          related: payload.related || []
        })
      });
      const json = await safeJson<{ headlineEs?: string; bodyEs?: string }>(res);
      if (res.ok && json?.headlineEs && json?.bodyEs) {
        headlineEs = json.headlineEs;
        bodyEs = json.bodyEs;
      }
    } catch {
      // no-op fallback
    }

    const createdAt = nowIso();
    onQueueDraft({
      id: draftIdFromLink(payload.link),
      sourceArticleId: draftIdFromLink(payload.link),
      source: payload.source,
      sourceLink: payload.link,
      sourceTitle: payload.title,
      sourcePublishedAt: payload.publishedAt,
      status: 'draft',
      headlineEs,
      bodyEs,
      createdAt,
      updatedAt: createdAt,
      autoQueuedFrom: payload.queuedFrom
    });
    onBreakingQueued?.();
    return true;
  };

  const queueDraftFromBreaking = async (item: NewsItem): Promise<void> => {
    await queueDraftFromBreakingInput({
      title: item.title,
      source: item.source,
      link: item.link,
      publishedAt: item.publishedAt,
      queuedFrom: 'major_watch'
    });
  };

  const pickRelatedBreakingSources = (primary: BreakingQueueItem, rows: BreakingQueueItem[]): { related: RelatedDraftSource[]; ids: number[] } => {
    const key = breakingEventKeyFromTitle(primary.title);
    if (!key) return { related: [], ids: [primary.id] };

    const candidates = rows
      .filter((row) => row.status === 'new' && breakingEventKeyFromTitle(row.title) === key)
      .sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

    const picked: BreakingQueueItem[] = [];
    const seenDomains = new Set<string>();
    const seenLinks = new Set<string>();

    picked.push(primary);
    seenDomains.add(extractDomainForDraft(primary.link));
    seenLinks.add(normalizeLinkForId(primary.link));

    for (const row of candidates) {
      if (row.id === primary.id) continue;
      const norm = normalizeLinkForId(row.link);
      if (!norm || seenLinks.has(norm)) continue;
      const domain = extractDomainForDraft(row.link);
      if (domain && seenDomains.has(domain)) continue;
      picked.push(row);
      if (domain) seenDomains.add(domain);
      seenLinks.add(norm);
      if (picked.length >= BREAKING_DRAFT_MAX_SOURCES) break;
    }

    const related: RelatedDraftSource[] = picked
      .slice(1)
      .map((row) => ({
        title: row.title,
        source: extractDomainForDraft(row.link) || (row.source_kind === 'social_x' ? 'X Breaking' : row.source_kind),
        link: row.link,
        publishedAt: row.created_at,
      }));
    const ids = picked.map((row) => row.id);
    return { related, ids };
  };

  const flushScheduledBreakingDraft = async (key: string): Promise<void> => {
    const timer = pendingBreakingDraftsRef.current.get(key);
    if (timer) pendingBreakingDraftsRef.current.delete(key);

    const rows = breakingQueueRowsRef.current || [];
    const candidates = rows.filter((row) => row.status === 'new' && breakingEventKeyFromTitle(row.title) === key);
    if (candidates.length === 0) return;

    const primary = [...candidates].sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })[0];
    if (!primary) return;

    const known = knownDraftLinkSetRef.current;
    const hasExistingDraft = candidates.some((row) => {
      const norm = normalizeLinkForId(row.link);
      return norm && known.has(norm);
    });
    if (hasExistingDraft) {
      await markQueueStatus(candidates.map((row) => row.id), 'queued');
      await refreshBreakingQueue();
      return;
    }

    const { related, ids } = pickRelatedBreakingSources(primary, candidates);
    const queued = await queueDraftFromBreakingInput(
      {
        title: primary.title,
        source: extractDomainForDraft(primary.link) || (primary.source_kind === 'social_x' ? 'X Breaking' : primary.source_kind),
        link: primary.link,
        publishedAt: primary.created_at,
        queuedFrom: 'social_x',
        related,
      },
      true
    );
    if (queued) {
      await markQueueStatus(ids, 'queued');
      await refreshBreakingQueue();
    }
  };

  const scheduleBreakingDraft = (row: BreakingQueueItem): void => {
    if (row.status !== 'new') return;
    const key = breakingEventKeyFromTitle(row.title);
    if (!key) return;
    if (pendingBreakingDraftsRef.current.has(key)) return;
    const timer = window.setTimeout(() => {
      void flushScheduledBreakingDraft(key);
    }, BREAKING_AUTO_DRAFT_DELAY_MS);
    pendingBreakingDraftsRef.current.set(key, timer);
  };

  const pickRelatedMajorSources = (primary: NewsItem, rows: NewsItem[]): RelatedDraftSource[] => {
    const key = breakingEventKeyFromTitle(primary.title);
    if (!key) return [];

    const candidates = rows
      .filter((item) => isLikelyBreakingTitle(item.title) && breakingEventKeyFromTitle(item.title) === key)
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    const picked: NewsItem[] = [];
    const seenDomains = new Set<string>();
    const seenLinks = new Set<string>();

    picked.push(primary);
    seenDomains.add(extractDomainForDraft(primary.link));
    seenLinks.add(normalizeLinkForId(primary.link));

    for (const item of candidates) {
      if (item.id === primary.id) continue;
      const norm = normalizeLinkForId(item.link);
      if (!norm || seenLinks.has(norm)) continue;
      const domain = extractDomainForDraft(item.link);
      if (domain && seenDomains.has(domain)) continue;
      picked.push(item);
      if (domain) seenDomains.add(domain);
      seenLinks.add(norm);
      if (picked.length >= BREAKING_DRAFT_MAX_SOURCES) break;
    }

    return picked.slice(1).map((item) => ({
      title: item.title,
      source: item.source || extractDomainForDraft(item.link) || 'Unknown',
      link: item.link,
      publishedAt: item.publishedAt,
    }));
  };

  const flushScheduledMajorWatchDraft = async (key: string): Promise<void> => {
    const timer = pendingMajorDraftsRef.current.get(key);
    if (timer) pendingMajorDraftsRef.current.delete(key);

    const rows = majorWatchRowsRef.current || [];
    const candidates = rows
      .filter((item) => isLikelyBreakingTitle(item.title) && breakingEventKeyFromTitle(item.title) === key)
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    const primary = candidates[0];
    if (!primary) return;

    const known = knownDraftLinkSetRef.current;
    const hasExistingDraft = candidates.some((item) => {
      const norm = normalizeLinkForId(item.link);
      return norm && known.has(norm);
    });
    if (hasExistingDraft) return;

    const related = pickRelatedMajorSources(primary, candidates);
    await queueDraftFromBreakingInput({
      title: primary.title,
      source: primary.source,
      link: primary.link,
      publishedAt: primary.publishedAt,
      queuedFrom: 'major_watch',
      related,
    });
  };

  const scheduleMajorWatchDraft = (item: NewsItem): void => {
    if (!isLikelyBreakingTitle(item.title)) return;
    const key = breakingEventKeyFromTitle(item.title);
    if (!key) return;
    if (pendingMajorDraftsRef.current.has(key)) return;
    const timer = window.setTimeout(() => {
      void flushScheduledMajorWatchDraft(key);
    }, BREAKING_AUTO_DRAFT_DELAY_MS);
    pendingMajorDraftsRef.current.set(key, timer);
  };

  const markQueueStatus = async (ids: number[], status: string): Promise<void> => {
    if (!ids.length) return;
    try {
      await fetch('/api/breaking-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, status })
      });
    } catch {
      // no-op
    }
  };

  const refreshBreakingQueue = async (): Promise<void> => {
    try {
      const res = await fetch('/api/breaking-queue?status=all&limit=200');
      if (!res.ok) return;
      const json = await safeJson<{ items?: BreakingQueueItem[] }>(res);
      const rows = json?.items || [];
      setBreakingQueueRows(rows);

      const newRows = rows.filter((row) => row.status === 'new').slice(0, 20);
      if (!newRows.length) return;

      // Auto-queue is delayed to allow multiple outlets to publish the same breaking event.
      newRows.forEach((row) => scheduleBreakingDraft(row));
    } catch {
      // no-op
    }
  };

  const refreshMajorWatch = async (): Promise<void> => {
    try {
      const res = await fetch(`/api/news?outlets=${MAJOR_WATCH_OUTLETS.join(',')}&limit=1200`);
      if (!res.ok) return;
      const json = await safeJson<{ items: NewsItem[] }>(res);
      const rows = (json?.items || [])
        .filter((item) => {
          const ts = new Date(item.publishedAt).getTime();
          return Number.isFinite(ts) && ts >= Date.now() - timeWindowHours * 60 * 60 * 1000;
        })
        .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
      const latest = dedupeAndSortNewsItems(rows, 80);
      setMajorWatchRows(latest);
      setMajorWatchCheckedAt(new Date().toISOString());

      const seen = new Set<string>();
      try {
        const raw = localStorage.getItem(MAJOR_WATCH_SEEN_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as string[];
          for (const value of parsed) seen.add(value);
        }
      } catch {
        // no-op
      }
      const unseen = latest.filter((row) => !seen.has(normalizeLinkForId(row.link)));

      if (!majorWatchReady) {
        markMajorSeen(latest);
        setMajorWatchReady(true);
        return;
      }

      setMajorWatchNewCount(unseen.length);
      if (unseen.length > 0) {
        // Delay breaking draft creation so multiple outlets have time to publish.
        const breakingUnseen = unseen.filter((row) => isLikelyBreakingTitle(row.title));
        breakingUnseen.forEach((row) => scheduleMajorWatchDraft(row));
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          void new Notification(`PressLab: ${unseen.length} ${t.watchNew}`, {
            body: unseen[0]?.title || 'New article detected'
          });
        }
      }
    } catch {
      // no-op
    }
  };

  const requestNotifications = () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'default') {
      void Notification.requestPermission();
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
    void refreshMajorWatch();
    void refreshBreakingQueue();
    const interval = setInterval(() => void refreshMajorWatch(), 60_000);
    const queueInterval = setInterval(() => void refreshBreakingQueue(), 60_000);
    return () => {
      clearInterval(interval);
      clearInterval(queueInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingDraftLinks.join(','), majorWatchReady, onQueueDraft, timeWindowHours]);

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
    const countryOutlets = countryCoverageOutlets.get(normalizedSelectedCountry) || [];
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
  }, [countryCoverageOutlets, normalizedSelectedCountry, selectedCountry]);

  useEffect(() => {
    const pending = items.filter((item) => item.classificationSource === 'keyword').slice(0, 25);
    pending.forEach((item) => {
      void fetch('/api/classify-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: item.title, fallbackSection: item.section })
      })
        .then((response) => response.json() as Promise<{ section: NewsSection; confidence: number; source: 'keyword' | 'llm'; reason?: string }>)
        .then((result) => {
          if (result.source !== 'llm') return;
          setItems((prev) => prev.map((prevItem) => (
            prevItem.id === item.id && result.confidence > prevItem.confidence
              ? {
                  ...prevItem,
                  section: result.section,
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
    if (selectedSection === 'general') return filteredByTime;
    if (selectedSection === 'world') {
      if (worldScope === 'all_world') {
        return filteredByTime.filter((item) => item.section === 'world');
      }
      return filteredByTime.filter((item) => item.section === 'world' && (item.worldLatam || isLatamOutlet(item.country || '')));
    }
    return filteredByTime.filter((item) => item.section === selectedSection);
  }, [filteredByTime, selectedSection, worldScope]);

  const countryScopedItems = useMemo(() => {
    if (selectedCountry === 'Global') return filteredByTime;
    const cutoff = Date.now() - Math.max(timeWindowHours, COUNTRY_MIN_WINDOW_HOURS) * 60 * 60 * 1000;
    return items.filter((item) => {
      const fallbackCountry = outletByName.get(item.source)?.country || '';
      if (normalizedSelectedCountry === 'LATAM') {
        if (!isLatamOutlet(item.country || fallbackCountry)) return false;
      } else {
        const itemCountry = normalizeOutletCountry(item.country || fallbackCountry || item.locationName || '');
        if (itemCountry !== normalizedSelectedCountry) return false;
      }
      const published = new Date(item.publishedAt).getTime();
      if (!Number.isFinite(published) || published < cutoff) return false;
      if (selectedOutletFilter !== 'all' && item.source !== selectedOutletFilter) return false;
      return true;
    });
  }, [filteredByTime, items, normalizedSelectedCountry, outletByName, selectedCountry, selectedOutletFilter, timeWindowHours]);
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
    const preferredLanguage = COUNTRY_PRIMARY_LANGUAGE[normalizedSelectedCountry];
    const sourceFiltered = dedupedCountryItems.filter((item) => {
      if (countrySourceFilter === 'all') return true;
      return (item.sourceType || 'global') === countrySourceFilter;
    });
    const byPriority = [...sourceFiltered].sort((a, b) => {
      const aFallback = outletByName.get(a.source)?.country || '';
      const bFallback = outletByName.get(b.source)?.country || '';
      const aCountry = normalizeOutletCountry(a.country || aFallback || '') === normalizedSelectedCountry ? 1 : 0;
      const bCountry = normalizeOutletCountry(b.country || bFallback || '') === normalizedSelectedCountry ? 1 : 0;
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
  }, [countrySourceFilter, dedupedCountryItems, filteredItems, normalizedSelectedCountry, outletByName, selectedCountry]);
  const feedItems = useMemo(() => {
    if (selectedCountry === 'Global') {
      if (filteredItems.length > 0) return filteredItems;
    } else if (rankedCountryItems.length > 0) {
      return rankedCountryItems;
    }
    if (filteredItems.length > 0) return filteredItems;
    if (filteredByTime.length > 0) return filteredByTime;
    return [...items]
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, 300);
  }, [filteredByTime, filteredItems, items, rankedCountryItems, selectedCountry]);

  const rssSitemapOutletsInScope = useMemo(() => {
    const selectedSet = new Set(effectiveSelectedOutlets);
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const outlet of OUTLET_FEEDS) {
      if (!selectedSet.has(outlet.id)) continue;
      if (!outlet.rssUrl && !outlet.sitemapUrl) continue;
      ids.add(outlet.id);
      names.add(outlet.name);
    }
    return { ids, names };
  }, [effectiveSelectedOutlets]);

  const rssSitemapLiveRows = useMemo(() => {
    if (rssSitemapOutletsInScope.ids.size === 0) return [];
    const cutoff = Date.now() - timeWindowHours * 60 * 60 * 1000;
    return items
      .filter((item) => {
        const inScope = item.outletId
          ? rssSitemapOutletsInScope.ids.has(item.outletId)
          : rssSitemapOutletsInScope.names.has(item.source);
        if (!inScope) return false;
        const ts = new Date(item.publishedAt).getTime();
        return Number.isFinite(ts) && ts >= cutoff;
      })
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, 20);
  }, [items, rssSitemapOutletsInScope, timeWindowHours]);

  const majorWatchTotalPages = Math.max(1, Math.ceil(majorWatchRows.length / STREAM_PAGE_SIZE));
  const breakingQueueTotalPages = Math.max(1, Math.ceil(breakingQueueRows.length / STREAM_PAGE_SIZE));
  const rssSitemapTotalPages = Math.max(1, Math.ceil(rssSitemapLiveRows.length / STREAM_PAGE_SIZE));

  const majorWatchPageRows = useMemo(() => {
    const safePage = Math.min(majorWatchPage, majorWatchTotalPages);
    const start = (safePage - 1) * STREAM_PAGE_SIZE;
    return majorWatchRows.slice(start, start + STREAM_PAGE_SIZE);
  }, [majorWatchPage, majorWatchRows, majorWatchTotalPages]);

  const breakingQueuePageRows = useMemo(() => {
    const safePage = Math.min(breakingQueuePage, breakingQueueTotalPages);
    const start = (safePage - 1) * STREAM_PAGE_SIZE;
    return breakingQueueRows.slice(start, start + STREAM_PAGE_SIZE);
  }, [breakingQueuePage, breakingQueueRows, breakingQueueTotalPages]);

  const rssSitemapPageRows = useMemo(() => {
    const safePage = Math.min(rssSitemapPage, rssSitemapTotalPages);
    const start = (safePage - 1) * STREAM_PAGE_SIZE;
    return rssSitemapLiveRows.slice(start, start + STREAM_PAGE_SIZE);
  }, [rssSitemapLiveRows, rssSitemapPage, rssSitemapTotalPages]);

  const countryCardItemsSorted = useMemo(() => {
    if (selectedCountry === 'Global') return [];
    return [...rankedCountryItems].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  }, [rankedCountryItems, selectedCountry]);

  const countryCardTotalPages = Math.max(1, Math.ceil(countryCardItemsSorted.length / COUNTRY_CARD_PAGE_SIZE));
  const countryCardPageRows = useMemo(() => {
    const safePage = Math.min(countryCardPage, countryCardTotalPages);
    const start = (safePage - 1) * COUNTRY_CARD_PAGE_SIZE;
    return countryCardItemsSorted.slice(start, start + COUNTRY_CARD_PAGE_SIZE);
  }, [countryCardItemsSorted, countryCardPage, countryCardTotalPages]);

  useEffect(() => {
    setMajorWatchPage((current) => Math.min(current, majorWatchTotalPages));
  }, [majorWatchTotalPages]);

  useEffect(() => {
    setBreakingQueuePage((current) => Math.min(current, breakingQueueTotalPages));
  }, [breakingQueueTotalPages]);

  useEffect(() => {
    setRssSitemapPage((current) => Math.min(current, rssSitemapTotalPages));
  }, [rssSitemapTotalPages]);

  useEffect(() => {
    setCountryCardPage((current) => Math.min(current, countryCardTotalPages));
  }, [countryCardTotalPages]);

  useEffect(() => {
    setCountryCardPage(1);
  }, [selectedCountry, countrySourceFilter]);

  const countryCardMetrics = useMemo(() => {
    if (selectedCountry === 'Global') return null;
    const total = countryScopedItems.length;
    const localCount = countryScopedItems.filter((item) => item.sourceType === 'local').length;
    const portalCount = countryScopedItems.filter((item) => item.sourceType === 'portal').length;
    const globalCount = countryScopedItems.filter((item) => (item.sourceType || 'global') === 'global').length;
    const preferredLanguage = COUNTRY_PRIMARY_LANGUAGE[normalizedSelectedCountry];
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
  }, [countryScopedItems, normalizedSelectedCountry, selectedCountry]);

  const handleCountrySelect = (country: string): void => {
    if (!country || country === 'Global') {
      setSelectedCountry('Global');
      return;
    }
    setSelectedCountry(normalizeOutletCountry(country));
  };

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

  const sectionMix = useMemo(() => {
    const counts = new Map<NewsSection, number>();
    for (const section of SECTIONS) counts.set(section, 0);
    for (const item of filteredByTime) {
      counts.set(item.section, (counts.get(item.section) ?? 0) + 1);
    }
    const total = filteredByTime.length || 1;
    return [...counts.entries()]
      .filter(([, count]) => count > 0)
      .map(([section, count]) => ({ section, count, ratio: (count / total) * 100 }))
      .sort((a, b) => b.count - a.count);
  }, [filteredByTime]);

  const spikeAlerts = useMemo(() => {
    const now = Date.now();
    const recentStart = now - 60 * 60 * 1000;
    const baseStart = now - 4 * 60 * 60 * 1000;
    const baseEnd = recentStart;

    return SECTIONS
      .filter((section) => section !== 'general')
      .map((section) => {
        const recentCount = filteredByTime.filter((item) => item.section === section && new Date(item.publishedAt).getTime() >= recentStart).length;
        const baselineCount = filteredByTime.filter((item) => {
          const ts = new Date(item.publishedAt).getTime();
          return item.section === section && ts >= baseStart && ts < baseEnd;
        }).length;
        const ratio = (recentCount + 1) / (baselineCount + 1);
        return { section, recentCount, baselineCount, ratio };
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
      section: selectedSection,
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
    setSelectedSection(monitor.section);
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
      { id: 'cmd-section-general', label: locale === 'es' ? 'Sección: general' : 'Set section: general', run: () => setSelectedSection('general') },
      { id: 'cmd-section-business', label: locale === 'es' ? 'Sección: negocios' : 'Set section: business', run: () => setSelectedSection('business') },
      { id: 'cmd-section-politics', label: locale === 'es' ? 'Sección: política' : 'Set section: politics', run: () => setSelectedSection('politics') },
      { id: 'cmd-section-tech', label: locale === 'es' ? 'Sección: tecnología' : 'Set section: tech', run: () => setSelectedSection('tech') }
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

  const renderPager = (page: number, totalPages: number, onChange: (page: number) => void) => (
    <div className="list-pagination">
      <button type="button" onClick={() => onChange(Math.max(1, page - 1))} disabled={page <= 1}>
        {t.prevPage}
      </button>
      <code>{t.page} {page}/{totalPages}</code>
      <button type="button" onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>
        {t.nextPage}
      </button>
    </div>
  );

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
              {t.section}
                <select value={selectedSection} onChange={(event) => setSelectedSection(event.target.value as NewsSection)}>
                {SECTIONS.map((section) => (
                  <option key={section} value={section}>{SECTION_LABELS[locale][section]}</option>
                ))}
              </select>
            </label>

            {selectedSection === 'world' ? (
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
          <section className="major-watch-box live-side-box">
            <div className="major-watch-head">
              <div>
                <strong>{t.majorWatch}</strong>
                <p className="meta">{t.majorWatchSub}</p>
              </div>
              <div className="major-watch-actions">
                {majorWatchNewCount > 0 ? <code className="chip chip-lag">{majorWatchNewCount} {t.watchNew}</code> : null}
                <button type="button" onClick={requestNotifications}>🔔</button>
                <button type="button" onClick={() => markMajorSeen()}>{t.markSeen}</button>
              </div>
            </div>
            <p className="meta">{t.watchChecked}: {majorWatchCheckedAt ? parseDateLabel(majorWatchCheckedAt, locale) : t.notAvailable}</p>
            {majorWatchRows.length > 0 ? renderPager(majorWatchPage, majorWatchTotalPages, setMajorWatchPage) : null}
            <ul className="simple-list stream-list">
              {majorWatchPageRows.map((item) => (
                <li key={`major-${item.id}`}>
                  <strong><a href={item.link} target="_blank" rel="noreferrer">{item.source}: {item.title}</a></strong>
                  <div className="chips stream-chips">
                    <code className="chip chip-section">{t.section}: {SECTION_LABELS[locale][item.section]}</code>
                    <code className="chip chip-lag">{t.timePublished}: {relativeAgeLabel(item.publishedAt, locale)}</code>
                    <code className="chip chip-source-type">{t.locality}: {localityFromSourceType(item.sourceType) === 'local' ? t.local : t.global}</code>
                    <code className="chip">{t.published}: {parseDateLabel(item.publishedAt, locale, true)}</code>
                  </div>
                  {isLikelyBreakingTitle(item.title) ? <span className="reason-line">BREAKING · {t.autoQueued}</span> : null}
                </li>
              ))}
              {majorWatchRows.length === 0 ? <li>{t.watchEmpty}</li> : null}
            </ul>
          </section>
        </section>
      ) : null}

      {panelVisibility.map ? (
        <section className="panel map-panel">
          <GeoMap
            items={filteredItems}
            selectedCountry={selectedCountry}
            onCountrySelect={handleCountrySelect}
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
          <section className="major-watch-box live-side-box">
            <div className="major-watch-head">
              <div>
                <strong>{t.breakingQueue}</strong>
                <p className="meta">{t.breakingQueueSub}</p>
              </div>
            </div>
            {breakingQueueRows.length > 0 ? renderPager(breakingQueuePage, breakingQueueTotalPages, setBreakingQueuePage) : null}
            <ul className="simple-list stream-list">
              {breakingQueuePageRows.map((row) => (
                <li key={`bq-${row.id}`}>
                  <strong><a href={row.link} target="_blank" rel="noreferrer">{row.title}</a></strong>
                  <div className="source-line">{row.source_kind} · p{row.priority} · {row.status}</div>
                  <div className="chips stream-chips">
                    <code className="chip chip-section">{t.section}: {SECTION_LABELS[locale][deriveSectionFromText(`${row.title} ${row.summary || ''}`)]}</code>
                    <code className="chip chip-lag">{t.timePublished}: {relativeAgeLabel(row.created_at, locale)}</code>
                    <code className="chip chip-source-type">{t.locality}: {localityFromCountry(row.country) === 'local' ? t.local : t.global}</code>
                    <code className="chip">{t.published}: {parseDateLabel(row.created_at, locale, true)}</code>
                  </div>
                  <div className="major-watch-actions">
                    {row.status === 'new' ? (
                      <button
                        type="button"
                        onClick={async () => {
                          const key = breakingEventKeyFromTitle(row.title);
                          const timer = key ? pendingBreakingDraftsRef.current.get(key) : undefined;
                          if (timer) {
                            window.clearTimeout(timer);
                            pendingBreakingDraftsRef.current.delete(key);
                          }

                          const group = pickRelatedBreakingSources(row, breakingQueueRowsRef.current || []);
                          const queued = await queueDraftFromBreakingInput({
                            title: row.title,
                            source: extractDomainForDraft(row.link) || (row.source_kind === 'social_x' ? 'X Breaking' : row.source_kind),
                            link: row.link,
                            publishedAt: row.created_at,
                            queuedFrom: 'social_x',
                            related: group.related
                          }, true);
                          if (queued) {
                            await markQueueStatus(group.ids, 'queued');
                            await refreshBreakingQueue();
                          }
                        }}
                      >
                        {t.queueToWriting}
                      </button>
                    ) : null}
                    {row.status !== 'dismissed' ? (
                      <button
                        type="button"
                        onClick={async () => {
                          await markQueueStatus([row.id], 'dismissed');
                          await refreshBreakingQueue();
                        }}
                      >
                        {t.dismiss}
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
              {breakingQueueRows.length === 0 ? <li>{t.queueEmpty}</li> : null}
            </ul>
          </section>
        </section>
      ) : null}

      {panelVisibility.feed ? (
        <section className="panel feed-panel center-feed">
          <h2>{t.liveFeed}</h2>
          <section className="major-watch-box">
            <div className="major-watch-head">
              <div>
                <strong>{t.rssSitemapLive}</strong>
                <p className="meta">{t.rssSitemapLiveSub}</p>
              </div>
            </div>
            {rssSitemapLiveRows.length > 0 ? renderPager(rssSitemapPage, rssSitemapTotalPages, setRssSitemapPage) : null}
            <ul className="simple-list stream-list">
              {rssSitemapPageRows.map((item) => (
                <li key={`ingest-${item.id}`}>
                  <strong><a href={item.link} target="_blank" rel="noreferrer">{item.source}: {item.title}</a></strong>
                  <div className="chips stream-chips">
                    <code className="chip chip-section">{t.section}: {SECTION_LABELS[locale][item.section]}</code>
                    <code className="chip chip-lag">{t.timePublished}: {relativeAgeLabel(item.publishedAt, locale)}</code>
                    <code className="chip chip-source-type">{t.locality}: {localityFromSourceType(item.sourceType) === 'local' ? t.local : t.global}</code>
                    <code className="chip">{t.published}: {parseDateLabel(item.publishedAt, locale, true)}</code>
                  </div>
                </li>
              ))}
              {rssSitemapLiveRows.length === 0 ? <li>{t.rssSitemapEmpty}</li> : null}
            </ul>
          </section>
          {selectedCountry !== 'Global' ? (
            <>
              <p className="meta">
                {t.countryModePrioritizing} {COUNTRY_PRIMARY_LANGUAGE[normalizedSelectedCountry] || t.local} {t.languagePlusSourcesFor} {normalizedSelectedCountry}.
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
            {feedItems.map((item) => (
              <li key={item.id} className="feed-item">
                <a href={item.link} target="_blank" rel="noreferrer">{item.title}</a>
                <div className="source-line">{item.source}</div>
                <div className="chips">
                  <code className="chip chip-section">{t.section}: {SECTION_LABELS[locale][item.section]}</code>
                  <code className="chip chip-lag">{t.timePublished}: {relativeAgeLabel(item.publishedAt, locale)}</code>
                  <code className="chip chip-source-type">{t.locality}: {localityFromSourceType(item.sourceType) === 'local' ? t.local : t.global}</code>
                  <code className="chip">{t.published}: {parseDateLabel(item.publishedAt, locale, true)}</code>
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
                <h3>{normalizedSelectedCountry}</h3>
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
            {countryCardItemsSorted.length > 0 ? renderPager(countryCardPage, countryCardTotalPages, setCountryCardPage) : null}
            <ul className="simple-list">
              {countryCardPageRows.map((item) => (
                <li key={item.id}>
                  <strong>{item.title}</strong>
                  <span>{item.source} · {item.language || 'en'} · {item.sourceType || 'global'}</span>
                </li>
              ))}
              {countryCardItemsSorted.length === 0 ? <li>{t.noCountryStories}</li> : null}
            </ul>
          </section>
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
              {sectionMix.map((row) => (
                <li key={row.section}>
                  <strong>{SECTION_LABELS[locale][row.section]}</strong>
                  <span>{row.count} {t.storiesWord}</span>
                  <span>{row.ratio.toFixed(1)}%</span>
                </li>
              ))}
              {sectionMix.length === 0 ? <li>{t.noBeatActivity}</li> : null}
            </ul>
          </section>
        ) : null}

        {panelVisibility.spikeAlerts ? (
          <section className="panel analytics-panel">
            <h3>{t.spikeAlerts}</h3>
            <ul className="simple-list">
              {spikeAlerts.map((alert) => (
                <li key={alert.section}>
                  <strong>{SECTION_LABELS[locale][alert.section]}</strong>
                  <span>{t.recentText} {alert.recentCount}</span>
                  <span>{t.baselineText} {alert.baselineCount}</span>
                  <span>{alert.ratio.toFixed(2)}x</span>
                </li>
              ))}
              {spikeAlerts.length === 0 ? <li>{t.noSpikes}</li> : null}
            </ul>
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
