'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CountryPlaneSvg } from '@/components/map-country-plane-svg';
import { MapDetailDrawer } from '@/components/map-detail-drawer';
import { MapFloatingToolbar } from '@/components/map-floating-toolbar';
import { HelpTooltipLabel } from '@/components/help-tooltip-label';
import { MapSidePanel } from '@/components/map-side-panel';
import {
  clamp,
  COUNTRY_ALIASES,
  COUNTRY_SAFE_INSETS_COMPACT_PX,
  COUNTRY_SAFE_INSETS_EXPANDED_PX,
  COUNTRY_ZOOM_MAX,
  COUNTRY_ZOOM_MIN,
  COUNTRY_ZOOM_STEP,
  DEFAULT_COUNTRY_STAGE_SIZE,
  DEFAULT_COUNTRY_VIEWPORT,
  deriveSummaryFromSources,
  deriveTopDegradedCountries,
  deriveTopDegradedRegionsFromSources,
  deriveTopRegionsFromSources,
  getHealthRank,
  getStageLegendItems,
  GLOBE_HEIGHT,
  GLOBE_WIDTH,
  normalizeCountryName,
  projectToGlobe,
  round,
  scaleCountrySafeInsets,
  type CountrySourceCluster,
  type CountryStageSize,
  type CountryViewport,
  type WorldGeoJson,
  useIdleRotation,
} from '@/components/map-stage-utils';
import { WorldGlobeSvg } from '@/components/map-world-globe-svg';
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
  parseLayerState,
  sameLayerState,
  type DetailTab,
  type LeftTab,
  type MapLayerState,
  type MapMode,
  type MapSearchResult,
} from '@/lib/map-view-state';
import type {
  MapCountryMetricRow,
  MapCountryMetricsResponse,
  MapCountrySourcesResponse,
  MapMetricWindow,
  MapPublisherMetricRow,
  MapPublishersResponse,
  MapSourceDetailResponse,
  MapSourceMetricRow,
} from '@/lib/map-types';

export function MapView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
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
  const [countryStageSize, setCountryStageSize] = useState<CountryStageSize>(DEFAULT_COUNTRY_STAGE_SIZE);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [sceneOrigin, setSceneOrigin] = useState<{ x: number; y: number }>({ x: 56, y: 52 });
  const [layers, setLayers] = useState<MapLayerState>(DEFAULT_MAP_LAYERS);
  const countriesState = useRemoteJson<MapCountryMetricsResponse>(
    `/api/customer/dashboard/map/countries?window=${mapWindow}`,
    undefined,
    { cacheMode: 'session' }
  );
  const publishersState = useRemoteJson<MapPublishersResponse>(
    `/api/customer/dashboard/map/publishers?window=${mapWindow}`,
    undefined,
    { cacheMode: 'session' }
  );
  const worldState = useRemoteJson<WorldGeoJson>('/world.geojson', undefined, {
    cacheMode: 'session',
    staleMs: 24 * 60 * 60 * 1000,
  });
  const countryName = selectedCountry?.country || null;
  const sourcesState = useRemoteJson<MapCountrySourcesResponse>(
    countryName ? `/api/customer/dashboard/map/countries/${encodeURIComponent(countryName)}/sources?window=${mapWindow}` : null,
    undefined,
    { cacheMode: 'session' }
  );
  const sourceDetailState = useRemoteJson<MapSourceDetailResponse>(
    selectedSource?.sourceId ? `/api/customer/dashboard/map/sources/${encodeURIComponent(selectedSource.sourceId)}` : null,
    undefined,
    { cacheMode: 'session' }
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
    ? new Date(latestMapUpdatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
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
  }, [urlMode, mapMode, urlWindow, mapWindow, urlLeftTab, leftTab, urlDetailTab, detailTab, urlLayers, layers]);

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
  }, [urlCountry, countriesState.data, desiredCountryMatch, selectedCountry, globeRotationLon]);

  useEffect(() => {
    if (mapMode !== 'publishers' || !publishersState.data || !urlPublisher) return;
    const match = publishersState.data.publishers.find((item) => item.publisher === urlPublisher);
    if (match && selectedPublisher?.publisher !== match.publisher) {
      setSelectedPublisher(match);
    }
  }, [mapMode, publishersState.data, urlPublisher, selectedPublisher]);

  useEffect(() => {
    if (mapMode !== 'publishers' || !publishersState.data || !selectedPublisher?.publisher) return;
    const refreshed = publishersState.data.publishers.find((item) => item.publisher === selectedPublisher.publisher);
    if (refreshed && refreshed !== selectedPublisher) {
      setSelectedPublisher(refreshed);
    }
  }, [mapMode, publishersState.data, selectedPublisher]);

  useEffect(() => {
    if (mapMode !== 'publishers' || !publishersState.data || urlPublisher || selectedPublisher) return;
    if (publishersState.data.publishers.length > 0) {
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
  }, [urlCountry, urlSource, sourcesState.data, selectedSource]);

  useEffect(() => {
    if (!urlSource && selectedSource) {
      setSelectedSource(null);
    }
  }, [urlSource, selectedSource]);

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
    () => displayedCountrySources.filter((item) => item.locationKind !== 'country-fallback'),
    [displayedCountrySources]
  );
  const selectedCountryFallbackSummary = useMemo(() => {
    const fallbackSources = displayedCountrySources.filter(
      (item) => item.locationKind === 'country-fallback' && isSourceWindowActive(item, mapWindow)
    );
    if (fallbackSources.length === 0) return null;
    return {
      sourceCount: fallbackSources.length,
      published: fallbackSources.reduce((sum, item) => sum + getSourceWindowMetrics(item, mapWindow).published, 0),
    };
  }, [displayedCountrySources, mapWindow]);

  const derivedCountrySummary = useMemo(
    () => deriveSummaryFromSources(displayedCountrySources, mapWindow),
    [displayedCountrySources, mapWindow]
  );
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
        .sort(
          (a, b) =>
            getHealthRank(b.health) - getHealthRank(a.health) ||
            getSourceWindowMetrics(b, mapWindow).published - getSourceWindowMetrics(a, mapWindow).published ||
            a.source.localeCompare(b.source)
        )
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
    if (!selectedCluster) return;
    if (displayedCountrySources.some((item) => selectedCluster.sources.some((source) => source.sourceId === item.sourceId))) return;
    setSelectedCluster(null);
  }, [displayedCountrySources, selectedCluster]);

  useEffect(() => {
    const stageNode = stageRef.current;
    if (!stageNode) return;
    const stageElement: HTMLDivElement = stageNode;

    function updateStageSize() {
      const rect = stageElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setCountryStageSize((current) => (
        Math.abs(current.width - rect.width) < 1 && Math.abs(current.height - rect.height) < 1
          ? current
          : { width: rect.width, height: rect.height }
      ));
    }

    updateStageSize();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => updateStageSize());
    observer.observe(stageElement);
    return () => observer.disconnect();
  }, []);

  const compactDetailHint = !selectedCountry && !selectedSource && !selectedCluster && mapMode === 'countries';
  const countrySafeInsets = useMemo(
    () =>
      scaleCountrySafeInsets(
        selectedCountry && mapMode === 'countries' && !selectedSource && !selectedCluster
          ? COUNTRY_SAFE_INSETS_COMPACT_PX
          : COUNTRY_SAFE_INSETS_EXPANDED_PX,
        countryStageSize
      ),
    [selectedCountry, mapMode, selectedSource, selectedCluster, countryStageSize]
  );

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

  function zoomCountry(direction: 1 | -1) {
    if (!selectedCountry) return;
    const nextScale = clamp(
      countryViewport.scale * (direction > 0 ? COUNTRY_ZOOM_STEP : 1 / COUNTRY_ZOOM_STEP),
      COUNTRY_ZOOM_MIN,
      COUNTRY_ZOOM_MAX
    );
    if (Math.abs(nextScale - countryViewport.scale) < 0.0001) return;

    const frameWidth = GLOBE_WIDTH - countrySafeInsets.left - countrySafeInsets.right;
    const frameHeight = GLOBE_HEIGHT - countrySafeInsets.top - countrySafeInsets.bottom;
    const centerX = countrySafeInsets.left + frameWidth / 2;
    const centerY = countrySafeInsets.top + frameHeight / 2;
    const worldX = (centerX - countryViewport.tx) / countryViewport.scale;
    const worldY = (centerY - countryViewport.ty) / countryViewport.scale;

    setCountryViewport({
      scale: nextScale,
      tx: round(centerX - worldX * nextScale, 2),
      ty: round(centerY - worldY * nextScale, 2),
    });
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
    const targetQuery = buildMapQueryString({
      mode: 'publishers',
      window: mapWindow,
      country: null,
      publisher: publisher.publisher,
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

  const panelErrors = [...new Set([
    countriesState.error,
    publishersState.error,
    sourcesState.error,
    worldState.error,
  ].filter((value): value is string => Boolean(value)))];
  const countryZoomLabel = `${countryViewport.scale.toFixed(1)}x Zoom`;
  const stageLegendItems = !selectedCountry ? getStageLegendItems(mapMode) : [];
  const publisherFocusActive = !selectedCountry && mapMode === 'publishers' && Boolean(selectedPublisher);

  return (
    <div className="page-stack map-page-stack map-page-root">
      <section className={`map-workbench ${compactDetailHint ? 'is-compact-detail-hint' : ''} ${publisherFocusActive ? 'has-publisher-focus' : ''}`}>
        <div className="map-stage-shell">
          <div
            ref={stageRef}
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
                  publisherFocused={publisherFocusActive}
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
            onSelectPublisher={resetToPublisherGlobe}
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
            sourceDetail={sourceDetail}
            sourceDetailLoading={sourceDetailState.loading}
            sourceDetailError={sourceDetailState.error}
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
