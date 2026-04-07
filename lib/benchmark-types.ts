import type { DashboardDataSource } from '@/lib/news-api';

export type CountryBenchmarkWindow = {
  bucket: string;
  label?: string | null;
  windowStart: string;
  windowEnd: string;
  generatedAt: string;
  metricVersion: string;
  atlasVersion: string | null;
};

export type CountryBenchmarkCountryRow = {
  country: string;
  countryCode: string | null;
  hourlyPublished24h: number;
  hourlyFresh24h: number;
  hourlyLate24h: number;
  hourlyInserted24h: number;
  hourlyInserted1h: number;
  hourlyActiveSources24h: number;
  hourlyActiveSources1h: number;
  hourlyTopSourceShareBps: number;
  hourlyTop5SourceShareBps: number;
  hourlyTop10SourceShareBps: number;
  dailyPublishedCount: number;
  dailyFreshCount: number;
  dailyLateCount: number;
  dailyInsertedCount: number;
  dailyActiveSourcesCount: number;
  dailyTopSourceShareBps: number;
  dailyTop5SourceShareBps: number;
  dailyTop10SourceShareBps: number;
  weeklyPublishedCount: number;
  weeklyFreshCount: number;
  weeklyLateCount: number;
  weeklyInsertedCount: number;
  weeklyAverageActiveSourcesCount: number;
  weeklyTopSourceShareBps: number;
  weeklyTop5SourceShareBps: number;
  weeklyTop10SourceShareBps: number;
  monthlyPublishedCount: number;
  monthlyFreshCount: number;
  monthlyLateCount: number;
  monthlyInsertedCount: number;
  monthlyAverageActiveSourcesCount: number;
  monthlyTopSourceShareBps: number;
  monthlyTop5SourceShareBps: number;
  monthlyTop10SourceShareBps: number;
};

export type CountryBenchmarkResponse = {
  storage: 'postgres' | 'disabled';
  dataSource?: DashboardDataSource;
  generatedAt: string | null;
  totals: {
    countries: number;
    hourlyPublished24h: number;
    hourlyFresh24h: number;
    hourlyInserted24h: number;
    dailyPublishedCount: number;
    dailyFreshCount: number;
    dailyInsertedCount: number;
    weeklyPublishedCount: number;
    weeklyFreshCount: number;
    weeklyInsertedCount: number;
    monthlyPublishedCount: number;
    monthlyFreshCount: number;
    monthlyInsertedCount: number;
  };
  hourly: CountryBenchmarkWindow | null;
  daily: CountryBenchmarkWindow | null;
  weekly: CountryBenchmarkWindow | null;
  monthly: CountryBenchmarkWindow | null;
  countries: CountryBenchmarkCountryRow[];
  reason?: string;
};
