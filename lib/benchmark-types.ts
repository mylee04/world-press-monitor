export type CountryBenchmarkWindow = {
  bucket: string;
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
};

export type CountryBenchmarkResponse = {
  storage: 'postgres' | 'disabled';
  generatedAt: string | null;
  totals: {
    countries: number;
    hourlyPublished24h: number;
    hourlyFresh24h: number;
    hourlyInserted24h: number;
    dailyPublishedCount: number;
    dailyFreshCount: number;
    dailyInsertedCount: number;
  };
  hourly: CountryBenchmarkWindow | null;
  daily: CountryBenchmarkWindow | null;
  countries: CountryBenchmarkCountryRow[];
  reason?: string;
};
