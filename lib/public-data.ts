import type { NewsSection } from '@/lib/types';

export const PUBLIC_DATA_SCHEMA_VERSION = 4;
export const PUBLIC_DATA_SECTIONS: NewsSection[] = [
  'world',
  'politics',
  'conflicts',
  'business',
  'tech',
  'sports',
  'health',
  'entertainment',
  'lifestyle',
  'arts',
  'science',
  'climate',
  'others',
];

export interface PublicNewsArticle {
  id: string;
  source: string;
  country: string;
  countryCode: string;
  language: string;
  section: NewsSection;
  title: string;
  snippet: string;
  url: string;
  publicationDatetime: string;
  createdAt: string;
}

export interface PublicSourceHealth {
  ranAt: string;
  method: 'rss' | 'sitemap';
  attempted: boolean;
  ok: boolean;
  statusCode: number | null;
  healthClassification: string | null;
  error: string | null;
  requestedUrl: string | null;
  finalUrl: string | null;
}

export interface PublicSourceRecord {
  source: string;
  country: string;
  countryCode: string;
  rssUrl: string | null;
  sitemapUrl: string | null;
  latestHealth: PublicSourceHealth | null;
}

export interface PublicDataManifest {
  generatedAt: string;
  schemaVersion: number;
  cadence?: {
    frequency: 'hourly';
    scheduledMinute: number;
    timezone: string;
  };
  latestDate: string | null;
  countries: string[];
  countryNames: Record<string, string>;
  countryMonths: Record<string, string[]>;
  sections: NewsSection[];
  availableDates: string[];
  downloads: {
    latest24h: string;
    byDate: string[];
    byCountryMonth: string[];
  };
  shards: {
    byDate: string | null;
    byCountryMonth: string | null;
  };
  totals: {
    articles: number;
    latest24h: number;
    sources: number;
  };
  sectionTotals: Record<NewsSection, number>;
}

export interface PublicCountryFeedFile {
  generatedAt: string;
  schemaVersion: number;
  windowHours: number;
  windowType: 'publicationDatetime' | 'createdAt';
  countryCode: string;
  country: string;
  articleCount: number;
  articles: PublicNewsArticle[];
}

export interface PublicIntegrationManifest {
  generatedAt: string;
  schemaVersion: number;
  cadence?: {
    frequency: 'hourly';
    scheduledMinute: number;
    timezone: string;
  };
  windowHours: number;
  semantics: {
    published24h: string;
    inserted24h: string;
  };
  countries: string[];
  countryNames: Record<string, string>;
  feeds: Record<
    string,
    {
      published24h: string;
      inserted24h: string;
    }
  >;
}

export interface PublicSourcesFile {
  generatedAt: string;
  sources: PublicSourceRecord[];
}

export interface PublicDateShard {
  generatedAt: string;
  date: string;
  articles: PublicNewsArticle[];
}

export interface PublicCountryMonthShard {
  generatedAt: string;
  countryCode: string;
  country: string;
  month: string;
  articles: PublicNewsArticle[];
}
