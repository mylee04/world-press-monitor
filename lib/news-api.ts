export type DashboardDataSource =
  | 'upstream'
  | 'snapshot-fallback'
  | 'disabled-fallback'
  | 'disabled-snapshot-fallback';

export interface NewsApiItem {
  id: string;
  source: string;
  sourceDisplay: string;
  title: string;
  snippet: string | null;
  url: string;
  country: string | null;
  language: string | null;
  primarySection: string | null;
  sections: string[];
  primaryTopic: string | null;
  topics: string[];
  sourceCategories: string[];
  publicationDatetime: string;
  createdAt: string;
  updatedAt: string;
}

export interface NewsApiResponse {
  storage: 'postgres' | 'disabled';
  generatedAt: string | null;
  total: number;
  totalIsEstimate?: boolean;
  hasMore?: boolean;
  params: {
    limit: number;
    offset: number;
    hours?: number;
    from?: string | null;
    to?: string | null;
    publicationFrom?: string | null;
    publicationTo?: string | null;
    minCreatedAt?: string | null;
    maxCreatedAt?: string | null;
    minUpdatedAt?: string | null;
    maxUpdatedAt?: string | null;
    q?: string | null;
    sources: string[];
    countries: string[];
    sections: string[];
    languages: string[];
  };
  items: NewsApiItem[];
  reason?: string;
}

export interface NewsApiFiltersResponse {
  storage: 'postgres' | 'disabled';
  reason?: string;
  filters: {
    countries: string[];
    languages: string[];
    sources: string[];
    sections: string[];
  };
}

export interface NewsApiCountryCount {
  country: string;
  countryCode: string | null;
  count: number;
}

export interface NewsApiDashboardItem extends NewsApiItem {
  countryCode: string | null;
}

export interface NewsApiDashboardTopicGroup {
  section: string;
  articleCount: number;
  unassignedCount: number;
  topics: Array<{
    topic: string;
    count: number;
  }>;
}

export interface NewsApiDashboardSourceCategoryCount {
  category: string;
  count: number;
}

export interface NewsApiDashboardSummaryResponse {
  storage: 'postgres' | 'disabled';
  dataSource?: DashboardDataSource;
  generatedAt: string | null;
  windowDays: number;
  latestHours: number;
  latestDate: string | null;
  previewDate: string | null;
  totals: {
    rowsWindow: number;
    inserted24h: number;
    published24h: number;
    checkedSources24h: number;
  };
  sectionTotals: Record<string, number>;
  recentDates: Array<{
    date: string;
    count: number;
  }>;
  topicSampleSize: number;
  topicGroups: NewsApiDashboardTopicGroup[];
  sourceCategoryCoverage: {
    categorizedArticles: number;
    uncategorizedArticles: number;
    distinctCategories: number;
    topCategories: NewsApiDashboardSourceCategoryCount[];
  };
  preview: {
    articleCount: number;
    topCountries: NewsApiCountryCount[];
    headlines: NewsApiDashboardItem[];
  };
  reason?: string;
}

const CUSTOMER_PROXY_BASE = '/api/customer';

export function buildNewsApiUrl(path: string): string | null {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (normalizedPath === '/api/news') return `${CUSTOMER_PROXY_BASE}/news`;
  if (normalizedPath === '/api/filters') return `${CUSTOMER_PROXY_BASE}/filters`;
  if (normalizedPath === '/api/dashboard/summary') return `${CUSTOMER_PROXY_BASE}/dashboard/summary`;
  return `${CUSTOMER_PROXY_BASE}${normalizedPath}`;
}
