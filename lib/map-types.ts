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
  topSources: Array<{ name: string; count: number }>;
  topPublishers: Array<{ name: string; count: number }>;
};

export type MapCountryMetricsResponse = {
  generatedAt: string;
  totals: {
    countries: number;
    pub24h: number;
    pub1h: number;
    activeSources24h: number;
  };
  countries: MapCountryMetricRow[];
};

export type MapPublisherCountryRow = {
  country: string;
  countryCode: string | null;
  lat: number;
  lon: number;
  pub24h: number;
  activeSources24h: number;
  healthySources24h: number;
  degradedSources24h: number;
};

export type MapPublisherMetricRow = {
  publisher: string;
  pub24h: number;
  activeCountries24h: number;
  activeSources24h: number;
  healthySources24h: number;
  degradedSources24h: number;
  countries: MapPublisherCountryRow[];
};

export type MapPublishersResponse = {
  generatedAt: string;
  publishers: MapPublisherMetricRow[];
};

export type MapSourceMetricRow = {
  sourceId: string;
  source: string;
  publisher: string | null;
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
  method: 'rss' | 'sitemap' | 'rss+sitemap';
  health: 'healthy' | 'warning' | 'degraded' | 'failing' | 'unknown';
  rssUrl: string | null;
  sitemapUrl: string | null;
};

export type MapCountrySourcesResponse = {
  generatedAt: string;
  country: string;
  countryCode: string | null;
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
  sources: MapSourceMetricRow[];
};

export type MapSourceDetailResponse = {
  generatedAt: string;
  sourceId: string;
  source: string;
  publisher: string | null;
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
  latestArticles: Array<{
    id: string;
    title: string;
    url: string;
    publicationDatetime: string;
    primarySection: string | null;
  }>;
};
