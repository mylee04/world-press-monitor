'use client';

import { useEffect, useMemo, useState } from 'react';
import { GeoMap } from '@/components/GeoMap';
import { OUTLET_FEEDS, SOURCE_PRESETS } from '@/data/outlets';
import type { Beat, NewsItem, SourcePreset } from '@/lib/types';

const REFRESH_OPTIONS = [15, 60, 300];
const TIME_WINDOWS_HOURS = [1, 6, 24];
const BEATS: Beat[] = ['general', 'politics', 'business', 'tech', 'security', 'climate', 'world'];
const MONITOR_STORAGE_KEY = 'presslab.savedMonitors.v1';
const PANEL_STORAGE_KEY = 'presslab.panelVisibility.v1';

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

interface IngestionDiagnostic {
  outletId: string;
  source: string;
  method: 'rss' | 'sitemap';
  attempted: boolean;
  circuitOpen: boolean;
  ok: boolean;
  statusCode: number | null;
  parsedCount: number;
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
  diagnostics: IngestionDiagnostic[];
}

const DEFAULT_PANELS: PanelVisibility = {
  controls: true,
  map: true,
  liveWall: true,
  feed: true,
  countryBrief: true,
  speedBoard: true,
  beatMix: true,
  spikeAlerts: true
  ,
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
    const data = (await res.json()) as LiveLookupResult;
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

function parseDateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return date.toLocaleString();
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

export function NewsroomDashboard() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [scopeRegion, setScopeRegion] = useState<ScopeRegion>('all');
  const [scopeCountry, setScopeCountry] = useState<ScopeCountry>('all');
  const [selectedOutlets, setSelectedOutlets] = useState<string[]>(
    OUTLET_FEEDS
      .filter((outlet) => outlet.defaultEnabled && (isUsOutlet(outlet.country) || isLatamOutlet(outlet.country)))
      .map((outlet) => outlet.id)
  );
  const [selectedBeat, setSelectedBeat] = useState<Beat>('general');
  const [refreshSec, setRefreshSec] = useState<number>(60);
  const [timeWindowHours, setTimeWindowHours] = useState<number>(6);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [ingestionSummary, setIngestionSummary] = useState<IngestionSummary | null>(null);
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
      const outletParam = effectiveSelectedOutlets.join(',');
      const res = await fetch(`/api/news?outlets=${outletParam}`);
      const json = await res.json() as { items: NewsItem[]; generatedAt: string; ingestion?: IngestionSummary };
      const cleaned = (json.items || []).map((item) => ({
        ...item,
        title: decodeEntities(item.title)
      }));
      setItems(cleaned);
      setIngestionSummary(json.ingestion || null);
      setLastUpdated(json.generatedAt || new Date().toISOString());
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
      return Number.isFinite(published) && published >= cutoff;
    });
  }, [items, timeWindowHours]);

  const filteredItems = useMemo(() => {
    if (selectedBeat === 'general') return filteredByTime;
    return filteredByTime.filter((item) => item.beat === selectedBeat);
  }, [filteredByTime, selectedBeat]);

  const countryScopedItems = useMemo(() => {
    if (selectedCountry === 'Global') return filteredByTime;
    const cutoff = Date.now() - Math.max(timeWindowHours, COUNTRY_MIN_WINDOW_HOURS) * 60 * 60 * 1000;
    return items.filter((item) => {
      if (item.country !== selectedCountry) return false;
      const published = new Date(item.publishedAt).getTime();
      return Number.isFinite(published) && published >= cutoff;
    });
  }, [filteredByTime, items, selectedCountry, timeWindowHours]);
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
      { key: 'politics', label: 'Politics', beats: ['politics'] },
      { key: 'social', label: 'Social', beats: ['world', 'security'] },
      { key: 'business', label: 'Business', beats: ['business'] },
      { key: 'lifestyle', label: 'General Life', beats: ['tech', 'climate', 'general'] }
    ];

    return groups.map((group) => {
      const matched = countryScopedItems.filter((item) => group.beats.includes(item.beat));
      return {
        ...group,
        count: matched.length,
        headlines: matched.slice(0, 3)
      };
    });
  }, [countryScopedItems]);
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
      { id: 'cmd-refresh', label: 'Refresh now', run: () => void refresh() },
      { id: 'cmd-open-sources', label: 'Open sources modal', run: () => setSourcesOpen(true) },
      { id: 'cmd-open-panels', label: 'Open panel settings', run: () => setPanelsOpen(true) },
      { id: 'cmd-beat-general', label: 'Set beat: general', run: () => setSelectedBeat('general') },
      { id: 'cmd-beat-business', label: 'Set beat: business', run: () => setSelectedBeat('business') },
      { id: 'cmd-beat-politics', label: 'Set beat: politics', run: () => setSelectedBeat('politics') },
      { id: 'cmd-beat-tech', label: 'Set beat: tech', run: () => setSelectedBeat('tech') }
    ];
    const presetCommands = SOURCE_PRESETS.map((preset) => ({
      id: `preset-${preset.key}`,
      label: `Apply preset: ${preset.label}`,
      run: () => applyPreset(preset, 'replace')
    }));

    const outletCommands = OUTLET_FEEDS.map((outlet) => ({
      id: `outlet-${outlet.id}`,
      label: selectedOutlets.includes(outlet.id) ? `Disable source: ${outlet.name}` : `Enable source: ${outlet.name}`,
      run: () => toggleOutlet(outlet.id)
    }));

    const all = [...commands, ...presetCommands, ...outletCommands];
    if (!q) return all.slice(0, 16);
    return all.filter((item) => item.label.toLowerCase().includes(q)).slice(0, 16);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commandQuery, selectedOutlets.join(',')]);

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
            {tile.isLive ? 'LIVE' : 'Fallback'}
          </span>
          <button type="button" onClick={() => setUnmutedSlot((current) => (current === tile.slot ? null : tile.slot))}>
            {isUnmuted ? 'Sound On' : 'Muted'}
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
            <div className="live-unavailable">No live stream right now</div>
          )}
        </div>
      </article>
    );
  };

  return (
    <main className="layout-newsroom">
      {panelVisibility.controls ? (
        <section className="panel controls left-setup">
          <h2>Monitor Setup</h2>

          <div className="control-grid">
            <label>
              Region
              <select value={scopeRegion} onChange={(event) => setScopeRegion(event.target.value as ScopeRegion)}>
                <option value="all">US + LATAM</option>
                <option value="us">US</option>
                <option value="latam">LATAM</option>
              </select>
            </label>

            <label>
              Country
              <select value={scopeCountry} onChange={(event) => setScopeCountry(event.target.value as ScopeCountry)}>
                <option value="all">All</option>
                {(scopeRegion === 'all' || scopeRegion === 'us') ? <option value="United States">US</option> : null}
                {(scopeRegion === 'all' || scopeRegion === 'latam') ? <option value="Chile">Chile</option> : null}
                {(scopeRegion === 'all' || scopeRegion === 'latam') ? <option value="Argentina">Argentina</option> : null}
                {(scopeRegion === 'all' || scopeRegion === 'latam') ? <option value="Uruguay">Uruguay</option> : null}
              </select>
            </label>

            <label>
              Beat
              <select value={selectedBeat} onChange={(event) => setSelectedBeat(event.target.value as Beat)}>
                {BEATS.map((beat) => (
                  <option key={beat} value={beat}>{beat}</option>
                ))}
              </select>
            </label>

            <label>
              Refresh
              <select value={refreshSec} onChange={(event) => setRefreshSec(Number(event.target.value))}>
                {REFRESH_OPTIONS.map((sec) => (
                  <option key={sec} value={sec}>Every {sec}s</option>
                ))}
              </select>
            </label>

            <label>
              Time Window
              <select value={timeWindowHours} onChange={(event) => setTimeWindowHours(Number(event.target.value))}>
                {TIME_WINDOWS_HOURS.map((hours) => (
                  <option key={hours} value={hours}>{hours}h</option>
                ))}
              </select>
            </label>
          </div>

          <h3>Source Presets</h3>
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
              Apply
            </button>
            <button
              type="button"
              onClick={() => {
                const preset = SOURCE_PRESETS.find((item) => item.key === selectedPresetKey);
                if (preset) applyPreset(preset, 'add');
              }}
            >
              Add
            </button>
          </div>
          <p className="meta">
            {SOURCE_PRESETS.find((preset) => preset.key === selectedPresetKey)?.description || 'Preset description'}
          </p>

          <h3>Saved Monitors</h3>
          <div className="monitor-actions">
            <input
              value={monitorName}
              onChange={(event) => setMonitorName(event.target.value)}
              placeholder="Morning Macro Watch"
            />
            <button type="button" onClick={saveMonitor}>Save</button>
          </div>

          <div className="monitor-actions">
            <select value={selectedMonitorId} onChange={(event) => applyMonitor(event.target.value)}>
              <option value="">Select saved monitor</option>
              {savedMonitors.map((monitor) => (
                <option key={monitor.id} value={monitor.id}>{monitor.name}</option>
              ))}
            </select>
            <button type="button" onClick={deleteMonitor} disabled={!selectedMonitorId}>Delete</button>
          </div>

          <p className="meta">Selected sources: {effectiveSelectedOutlets.length} / {scopedOutletIds.length} in scope</p>
          <p className="meta">
            Source policy: exploratory and manual-review feeds are default OFF.
          </p>
          <p className="meta">Last updated: {parseDateLabel(lastUpdated)}</p>
          <div className="topbar-controls inline-controls">
            <button type="button" onClick={() => setSourcesOpen(true)}>Sources</button>
            <button type="button" onClick={() => setPanelsOpen(true)}>Panels</button>
            <button type="button" onClick={() => setCommandOpen(true)}>Search (⌘K)</button>
            <button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</button>
          </div>

          <h3>Live TV Wall</h3>
          <div className="livewall-actions">
            <button type="button" className={liveMode === 'major' ? 'active' : ''} onClick={() => setLiveMode('major')}>Major Journal 6ch</button>
            <button type="button" className={liveMode === 'custom' ? 'active' : ''} onClick={() => setLiveMode('custom')}>Custom</button>
            <button type="button" onClick={saveLiveCustomLayout}>Save Custom Layout</button>
          </div>
          <p className="meta">Last checked: {liveUpdatedAt ? parseDateLabel(liveUpdatedAt) : 'Checking...'}</p>
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
          <h2>Live Feed</h2>
          {selectedCountry !== 'Global' ? (
            <>
              <p className="meta">
                Country mode: prioritizing {COUNTRY_PRIMARY_LANGUAGE[selectedCountry] || 'local'} language + local/portal sources for {selectedCountry}.
              </p>
              {countryAutoAdded > 0 ? (
                <p className="meta">Auto-added {countryAutoAdded} local/portal sources for {selectedCountry}.</p>
              ) : null}
              <div className="country-filter-row">
                <label>
                  Country Intake Filter
                  <select
                    value={countrySourceFilter}
                    onChange={(event) => setCountrySourceFilter(event.target.value as 'all' | 'local' | 'portal' | 'global')}
                  >
                    <option value="all">all</option>
                    <option value="local">local only</option>
                    <option value="portal">portal only</option>
                    <option value="global">global only</option>
                  </select>
                </label>
              </div>
            </>
          ) : null}
          <ul className="feed-list">
            {rankedCountryItems.map((item) => (
              <li key={item.id} className="feed-item">
                <a href={item.link} target="_blank" rel="noreferrer">{item.title}</a>
                <div className="chips">
                  <code className="chip chip-source">{item.source}</code>
                  <code className="chip chip-beat">{item.beat}</code>
                  <code className="chip chip-tier">Tier {item.tier}</code>
                  <code className="chip chip-lang">{item.language || 'en'}</code>
                  <code className="chip chip-source-type">{item.sourceType || 'global'}</code>
                  <code className="chip chip-classify">{item.classificationSource}</code>
                  <code className="chip chip-review">{outletByName.get(item.source)?.reviewDecision || 'unknown'}</code>
                  <code className="chip chip-cluster">cluster {item.clusterSize || 1}</code>
                  <code className="chip chip-lag">{minutesSince(item.publishedAt)}m ago</code>
                  <span>{parseDateLabel(item.publishedAt)}</span>
                </div>
                {item.classificationReason ? (
                  <div className="reason-line">{item.classificationReason}</div>
                ) : null}
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
                <span className="country-intel-badge">Country Intel</span>
              </div>
              <div className="country-intel-actions">
                <button type="button" title="Share" onClick={() => void shareCountryCard()}>↗</button>
                <button type="button" title="Pin" onClick={() => setCountryCardPinned((prev) => !prev)}>{countryCardPinned ? '📌' : '📍'}</button>
                <button type="button" title="Close" onClick={() => setCountryCardOpen(false)}>×</button>
              </div>
            </div>
            <div className="country-intel-score">
              <div className="country-intel-score-label">
                <span>Coverage Health</span>
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
              <p><strong>{countryCardMetrics.total}</strong> stories</p>
              <p><strong>{dedupedCountryItems.length}</strong> clusters</p>
              <p><strong>{countryCardMetrics.localCount}</strong> local</p>
              <p><strong>{countryCardMetrics.portalCount}</strong> portal</p>
              <p><strong>{countryCardMetrics.globalCount}</strong> global</p>
              <p><strong>{countryCardMetrics.localLanguageCount}</strong> in {countryCardMetrics.preferredLanguage}</p>
              <p>Latest: {countryCardMetrics.latest ? parseDateLabel(countryCardMetrics.latest) : 'n/a'}</p>
            </div>
            <div className="country-intel-mini-chips">
              <code className="chip chip-lang">{countryCardMetrics.preferredLanguage}</code>
              <code className="chip chip-source-type">local {countryCardMetrics.localCount}</code>
              <code className="chip chip-source-type">portal {countryCardMetrics.portalCount}</code>
              <code className="chip chip-source">global {countryCardMetrics.globalCount}</code>
            </div>
            {countryCardMetrics.localCount === 0 && countryCardMetrics.portalCount > 0 ? (
              <p className="meta">Direct local RSS is degraded in this window. Showing portal-backed local coverage.</p>
            ) : null}
            {countryCardMetrics.globalCount === 0 ? (
              <p className="meta">No global bucket stories in this window. Try `all` or `portal` filter, or widen time window.</p>
            ) : null}
            <ul className="simple-list">
              {rankedCountryItems.slice(0, 4).map((item) => (
                <li key={item.id}>
                  <strong>{item.title}</strong>
                  <span>{item.source} · {item.language || 'en'} · {item.sourceType || 'global'}</span>
                </li>
              ))}
              {rankedCountryItems.length === 0 ? <li>No stories for this country in current window.</li> : null}
            </ul>
          </section>
        </section>
      ) : null}

      {panelVisibility.countryBrief ? (
        <section className="panel analytics-panel">
          <h3>Daily Country Brief</h3>
          <p className="meta">{selectedCountry} · {countryScopedItems.length} stories in window · {dedupedCountryItems.length} deduped clusters</p>
          <ul className="simple-list">
            {countryBriefRows.map((row) => (
              <li key={row.key}>
                <strong>{row.label}</strong>
                <span>{row.count} stories</span>
                <span>
                  {row.headlines.length > 0
                    ? row.headlines.map((item) => item.title).join(' • ')
                    : 'No items in this category yet.'}
                </span>
              </li>
            ))}
          </ul>
          {selectedCountry !== 'Global' ? (
            <>
              <h3 style={{ marginTop: '10px' }}>Source Quality (Country)</h3>
              <ul className="simple-list">
                {countrySourceRanking.map((row) => (
                  <li key={row.source}>
                    <strong>{row.source}</strong>
                    <span>score {row.score}</span>
                    <span>{row.count} stories · median lag {row.medianLag}m</span>
                    <span>{row.sourceType} · {row.review}</span>
                  </li>
                ))}
                {countrySourceRanking.length === 0 ? <li>No country-specific source ranking yet.</li> : null}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}

      <section className="insight-grid">
        {panelVisibility.speedBoard ? (
          <section className="panel analytics-panel">
            <h3>Speed Board</h3>
            <ul className="simple-list">
              {sourceStats.slice(0, 12).map((row) => (
                <li key={row.source}>
                  <strong>{row.source}</strong>
                  <span>{row.count} stories</span>
                  <span>median lag {Math.round(row.medianLagMins)}m</span>
                  <span>latest {parseDateLabel(new Date(row.latest).toISOString())}</span>
                </li>
              ))}
              {sourceStats.length === 0 ? <li>No source activity in this window.</li> : null}
            </ul>
          </section>
        ) : null}

        {panelVisibility.beatMix ? (
          <section className="panel analytics-panel">
            <h3>Beat Mix</h3>
            <ul className="simple-list">
              {beatMix.map((row) => (
                <li key={row.beat}>
                  <strong>{row.beat}</strong>
                  <span>{row.count} stories</span>
                  <span>{row.ratio.toFixed(1)}%</span>
                </li>
              ))}
              {beatMix.length === 0 ? <li>No beat activity yet.</li> : null}
            </ul>
          </section>
        ) : null}

        {panelVisibility.spikeAlerts ? (
          <section className="panel analytics-panel">
            <h3>Spike Alerts</h3>
            <ul className="simple-list">
              {spikeAlerts.map((alert) => (
                <li key={alert.beat}>
                  <strong>{alert.beat}</strong>
                  <span>recent {alert.recentCount}</span>
                  <span>baseline {alert.baselineCount}</span>
                  <span>{alert.ratio.toFixed(2)}x</span>
                </li>
              ))}
              {spikeAlerts.length === 0 ? <li>No spikes detected in current window.</li> : null}
            </ul>
          </section>
        ) : null}

        {panelVisibility.opsBoard ? (
          <section className="panel analytics-panel">
            <h3>Ingestion Ops</h3>
            {ingestionSummary ? (
              <>
                <p className="meta">
                  endpoints {ingestionSummary.okEndpoints}/{ingestionSummary.totalEndpoints} ok · failed {ingestionSummary.failedEndpoints} · circuit {ingestionSummary.circuitOpenEndpoints}
                </p>
                <h3 style={{ marginTop: '10px' }}>Endpoint Failures</h3>
                <ul className="simple-list">
                  {ingestionFailures.map((row) => (
                    <li key={`fail-${row.outletId}`}>
                      <strong>{row.source}</strong>
                      <span>failed {row.failed}/{row.attempted}</span>
                      <span>recent24h {row.recent24h} · parsed {row.parsedCount}</span>
                      <span>{row.errors || 'unknown_error'}</span>
                    </li>
                  ))}
                  {ingestionFailures.length === 0 ? <li>No endpoint failures in this refresh cycle.</li> : null}
                </ul>
                <h3 style={{ marginTop: '10px' }}>Zero Yield Sources</h3>
                <ul className="simple-list">
                  {ingestionZeroYield.map((row) => (
                    <li key={`zero-${row.outletId}`}>
                      <strong>{row.source}</strong>
                      <span>attempted {row.attempted} · ok {row.ok}</span>
                      <span>recent24h {row.recent24h} · parsed {row.parsedCount}</span>
                    </li>
                  ))}
                  {ingestionZeroYield.length === 0 ? <li>No zero-yield sources in this refresh cycle.</li> : null}
                </ul>
              </>
            ) : (
              <p className="meta">No ingestion diagnostics yet.</p>
            )}
          </section>
        ) : null}
      </section>

      {sourcesOpen ? (
        <section className="overlay" role="dialog" aria-modal="true">
          <div className="modal wide-modal">
            <div className="modal-header">
              <h3>News Sources</h3>
              <button type="button" onClick={() => setSourcesOpen(false)}>Close</button>
            </div>

            <input
              placeholder="Filter sources..."
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
              <button type="button" onClick={selectAllOutlets}>Select all</button>
              <button type="button" onClick={selectNoneOutlets}>Select none</button>
            </div>
          </div>
        </section>
      ) : null}

      {panelsOpen ? (
        <section className="overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <h3>Panel Settings</h3>
              <button type="button" onClick={() => setPanelsOpen(false)}>Close</button>
            </div>

            <div className="modal-grid">
              {PANEL_META.map((panel) => (
                <label key={panel.key} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={panelVisibility[panel.key]}
                    onChange={() => togglePanel(panel.key)}
                  />
                  <span>{panel.label}</span>
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
              <h3>Command Search</h3>
              <button type="button" onClick={() => setCommandOpen(false)}>ESC</button>
            </div>

            <input
              autoFocus
              placeholder="Search commands, beats, sources..."
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
              {commandItems.length === 0 ? <li>No commands match query.</li> : null}
            </ul>
          </div>
        </section>
      ) : null}
    </main>
  );
}
