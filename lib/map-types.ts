export type MapMetricWindow = '1h' | '24h' | '7d';
export type MapStorageMode = 'postgres' | 'snapshot';
export type MapPublisherConfidence = 'high' | 'medium' | 'low';

export type MapCountryWindowMetrics = {
  published: number;
  fresh: number;
  late: number;
  firstSeen: number;
  lateShare: number;
  activeSources: number;
  rssSources: number;
  sitemapSources: number;
  healthySources: number;
  degradedSources: number;
};

export type MapCountryMetricRow = {
  country: string;
  countryCode: string | null;
  lat: number;
  lon: number;
  pub24h: number;
  pub1h: number;
  fresh24h: number;
  late24h: number;
  firstSeen24h: number;
  lateShare: number;
  activeSources24h: number;
  rssSources24h: number;
  sitemapSources24h: number;
  healthySources24h: number;
  degradedSources24h: number;
  windows: Record<MapMetricWindow, MapCountryWindowMetrics>;
  topSources: Array<{ name: string; count: number }>;
  topPublishers: Array<{ name: string; count: number }>;
};

export type MapCountryMetricsResponse = {
  generatedAt: string;
  storage: MapStorageMode;
  window: MapMetricWindow;
  totals: {
    countries: number;
    pub24h: number;
    pub1h: number;
    activeSources24h: number;
    windows: Record<MapMetricWindow, MapCountryWindowMetrics>;
  };
  countries: MapCountryMetricRow[];
};

export type MapPublisherCountryWindowMetrics = {
  published: number;
  activeSources: number;
  healthySources: number;
  degradedSources: number;
};

export type MapPublisherCountryRow = {
  country: string;
  countryCode: string | null;
  lat: number;
  lon: number;
  publisherConfidence: MapPublisherConfidence;
  pub24h: number;
  activeSources24h: number;
  healthySources24h: number;
  degradedSources24h: number;
  windows: Record<MapMetricWindow, MapPublisherCountryWindowMetrics>;
};

export type MapPublisherWindowMetrics = {
  published: number;
  activeCountries: number;
  activeSources: number;
  healthySources: number;
  degradedSources: number;
};

export type MapPublisherMetricRow = {
  publisher: string;
  publisherConfidence: MapPublisherConfidence;
  pub24h: number;
  activeCountries24h: number;
  activeSources24h: number;
  healthySources24h: number;
  degradedSources24h: number;
  windows: Record<MapMetricWindow, MapPublisherWindowMetrics>;
  countries: MapPublisherCountryRow[];
};

export type MapPublishersResponse = {
  generatedAt: string;
  storage: MapStorageMode;
  window: MapMetricWindow;
  publishers: MapPublisherMetricRow[];
};

export type MapSourceWindowMetrics = {
  published: number;
  fresh: number;
  late: number;
  firstSeen: number;
};

export type MapSourceMetricRow = {
  sourceId: string;
  source: string;
  publisher: string | null;
  publisherConfidence: MapPublisherConfidence;
  country: string;
  region: string | null;
  city: string | null;
  locationKind: 'headquarters' | 'inferred-city' | 'hub' | 'country-fallback';
  lat: number;
  lon: number;
  pub24h: number;
  pub1h: number;
  fresh24h: number;
  late24h: number;
  firstSeen24h: number;
  windows: Record<MapMetricWindow, MapSourceWindowMetrics>;
  method: 'rss' | 'sitemap' | 'rss+sitemap';
  health: 'healthy' | 'warning' | 'degraded' | 'failing' | 'unknown';
  rssUrl: string | null;
  sitemapUrl: string | null;
};

export type MapCountrySourcesResponse = {
  generatedAt: string;
  country: string;
  countryCode: string | null;
  window: MapMetricWindow;
  center: {
    lat: number;
    lon: number;
  };
  summary: {
    pub24h: number;
    pub1h: number;
    activeSources24h: number;
    rssSources24h: number;
    sitemapSources24h: number;
  };
  topSources: Array<{ name: string; count: number }>;
  topPublishers: Array<{ name: string; count: number }>;
  topRegions: Array<{ name: string; count: number; sources: number }>;
  hourly24h: Array<{ hour: string; count: number }>;
  daily7d: Array<{ day: string; count: number }>;
  sources: MapSourceMetricRow[];
};

export type MapSourceDetailResponse = {
  generatedAt: string;
  sourceId: string;
  source: string;
  publisher: string | null;
  publisherConfidence: MapPublisherConfidence;
  country: string;
  region: string | null;
  city: string | null;
  locationKind: 'headquarters' | 'inferred-city' | 'hub' | 'country-fallback';
  lat: number;
  lon: number;
  method: 'rss' | 'sitemap' | 'rss+sitemap';
  rssUrl: string | null;
  sitemapUrl: string | null;
  health: {
    status: 'healthy' | 'warning' | 'degraded' | 'failing' | 'unknown';
    lastCheckedAt: string | null;
    failRate24h: number | null;
    lastError: string | null;
  };
  metrics: {
    pub24h: number;
    pub1h: number;
    fresh24h: number;
    late24h: number;
    firstSeen24h: number;
  };
  hourly24h: Array<{ hour: string; count: number }>;
};
