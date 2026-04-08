export type OpsStorage = 'postgres' | 'disabled';
export type OpsSortDirection = 'asc' | 'desc';

export interface OpsIngestRunRow {
  bucket: string;
  runner: 'worker' | 'api_news' | 'warm';
  outletId: string;
  source: string;
  country: string;
  method: 'rss' | 'sitemap';
  attemptedRuns: number;
  successfulRuns: number;
  failedRuns: number;
  fetchedCount: number;
  validCount: number;
  missingTitleCount: number;
  missingSummaryCount: number;
  missingPublishedAtCount: number;
  missingLinkCount: number;
  updatedAt: string | null;
}

export interface OpsIngestRunsResponse {
  storage: OpsStorage;
  generatedAt: string | null;
  total: number;
  params: {
    limit: number;
    offset: number;
    hours: number;
    q: string | null;
    runner: string | null;
    method: string | null;
    sort: string;
    direction: OpsSortDirection;
  };
  items: OpsIngestRunRow[];
  reason?: string;
}

export interface OpsFeedStatusRow {
  outletId: string;
  source: string;
  country: string;
  method: 'rss' | 'sitemap';
  lastPublicationAt: string | null;
  lastFetchedAt: string | null;
  updatedAt: string | null;
  lagHours: number | null;
}

export interface OpsFeedStatusResponse {
  storage: OpsStorage;
  generatedAt: string | null;
  total: number;
  params: {
    limit: number;
    offset: number;
    q: string | null;
    method: string | null;
    sort: string;
    direction: OpsSortDirection;
  };
  items: OpsFeedStatusRow[];
  reason?: string;
}

export type OpsBenchmarkGranularity = 'hourly' | 'daily';

export interface OpsBenchmarkMetricRow {
  granularity: OpsBenchmarkGranularity;
  bucket: string;
  country: string;
  metricVersion: string;
  atlasVersion: string | null;
  windowStart: string;
  windowEnd: string;
  publishedCount: number;
  freshCount: number;
  lateCount: number;
  insertedCount: number;
  insertedWindowCount: number | null;
  activeSourcesCount: number;
  activeSourcesWindowCount: number | null;
  topSourceShareBps: number;
  top5SourceShareBps: number;
  top10SourceShareBps: number;
  updatedAt: string | null;
}

export interface OpsBenchmarkMetricsResponse {
  storage: OpsStorage;
  generatedAt: string | null;
  total: number;
  params: {
    limit: number;
    offset: number;
    granularity: OpsBenchmarkGranularity;
    range: number;
    q: string | null;
    sort: string;
    direction: OpsSortDirection;
  };
  items: OpsBenchmarkMetricRow[];
  reason?: string;
}

export type OpsMapMetricKind = 'countries' | 'publishers';

export interface OpsMapMetricRow {
  kind: OpsMapMetricKind;
  metricWindow: string;
  metricVersion: string;
  generatedAt: string;
  createdAt: string | null;
  updatedAt: string | null;
  rowCount: number;
  countriesCount: number | null;
  published24h: number | null;
  activeSources24h: number | null;
  lateShare24h: number | null;
}

export interface OpsMapMetricsResponse {
  storage: OpsStorage;
  generatedAt: string | null;
  total: number;
  params: {
    limit: number;
    offset: number;
    kind: OpsMapMetricKind;
    metricWindow: string | null;
    sort: string;
    direction: OpsSortDirection;
  };
  items: OpsMapMetricRow[];
  reason?: string;
}
