export interface NewsApiItem {
  id: string;
  source: string;
  title: string;
  snippet: string | null;
  url: string;
  country: string | null;
  language: string | null;
  section: string | null;
  publicationDatetime: string;
  createdAt: string;
  updatedAt: string;
}

export interface NewsApiResponse {
  storage: 'postgres' | 'disabled';
  generatedAt: string | null;
  total: number;
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

export interface NewsApiDashboardSummaryResponse {
  storage: 'postgres' | 'disabled';
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
  preview: {
    articleCount: number;
    topCountries: NewsApiCountryCount[];
    headlines: NewsApiDashboardItem[];
  };
  reason?: string;
}

const newsApiBaseUrl = (process.env.NEXT_PUBLIC_NEWS_API_BASE_URL || '').trim().replace(/\/+$/, '');

export function hasNewsApiBaseUrl(): boolean {
  return newsApiBaseUrl.length > 0;
}

export function buildNewsApiUrl(path: string): string | null {
  if (!newsApiBaseUrl) return null;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${newsApiBaseUrl}${normalizedPath}`;
}
