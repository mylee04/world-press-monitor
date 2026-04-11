import type {
  MapCountryMetricsResponse,
  MapCountrySourcesResponse,
  MapMetricWindow,
  MapSourceDetailResponse,
} from '@/lib/map-types';

type PublicCountryWindowMetrics = Omit<MapCountryMetricsResponse['totals']['windows'][MapMetricWindow], 'endpointBreakdown'>;
type PublicSourceRow = Omit<MapCountrySourcesResponse['sources'][number], 'endpointProfile' | 'sitemapKind'>;

function sanitizeCountryWindows(
  windows: MapCountryMetricsResponse['totals']['windows']
): Record<MapMetricWindow, PublicCountryWindowMetrics> {
  return Object.fromEntries(
    Object.entries(windows).map(([windowKey, metrics]) => {
      const { endpointBreakdown, ...publicMetrics } = metrics;
      void endpointBreakdown;
      return [windowKey, publicMetrics];
    }),
  ) as Record<MapMetricWindow, PublicCountryWindowMetrics>;
}

export function sanitizeMapCountryMetricsForPublic(
  payload: MapCountryMetricsResponse
): Record<string, unknown> {
  const { configuredEndpointBreakdown, ...publicTotals } = payload.totals;
  void configuredEndpointBreakdown;

  return {
    ...payload,
    totals: {
      ...publicTotals,
      windows: sanitizeCountryWindows(payload.totals.windows),
    },
    countries: payload.countries.map((country) => {
      const { configuredEndpointBreakdown: omittedConfigured, endpointBreakdown24h, ...publicCountry } = country;
      void omittedConfigured;
      void endpointBreakdown24h;
      return {
        ...publicCountry,
        windows: sanitizeCountryWindows(country.windows),
      };
    }),
  };
}

export function sanitizeMapCountrySourcesForPublic(
  payload: MapCountrySourcesResponse
): Record<string, unknown> {
  const { configuredEndpointBreakdown, endpointBreakdown24h, ...publicSummary } = payload.summary;
  void configuredEndpointBreakdown;
  void endpointBreakdown24h;

  return {
    ...payload,
    summary: publicSummary,
    sources: payload.sources.map((source): PublicSourceRow => {
      const { endpointProfile, sitemapKind, ...publicSource } = source;
      void endpointProfile;
      void sitemapKind;
      return publicSource;
    }),
  };
}

export function sanitizeMapSourceDetailForPublic(
  payload: MapSourceDetailResponse
): Record<string, unknown> {
  const { endpointProfile, sitemapKind, ...publicPayload } = payload;
  void endpointProfile;
  void sitemapKind;
  return publicPayload;
}
