import { inferGeoFromTitle } from '@/lib/geo';
import {
  readLatestHealthBySource,
  readWindowedSourceMetrics,
  readCheckedSourcesByCountry,
  normalizeHealthStatus,
  type HealthSqlRow,
} from '@/lib/map-store-db';
import { rankTopCounts } from '@/lib/map-store-locations';
import {
  getCountryCode,
  getConfiguredDirectSourceCountByCountry,
  getSourceMeta,
  isDirectPublisherSource,
  normalizeSourceKey,
  resolvePublisherCountryForSource,
} from '@/lib/map-store-source-meta';
import {
  buildCountryWindowRecord,
  buildCountryWindowsFromSqlRow,
  emptyCountryWindowAccumulator,
  isCountryWindowActive,
  MAP_WINDOWS,
  type SourceMetricWindowSqlRow,
  type CountryWindowAccumulator,
} from '@/lib/map-store-windows';
import { resolvePublisherName } from '@/lib/publisher-groups';
import { buildDisplaySourceName } from '@/lib/source-display';
import type {
  MapMetricWindow,
  MapCountryMetricsResponse,
  MapCountryMetricRow,
} from '@/lib/map-types';

type MapCountryMetricsBuildOptions = {
  metricRows?: SourceMetricWindowSqlRow[];
  healthBySource?: Map<string, HealthSqlRow>;
  checkedRows?: Array<{ country: string | null; source: string }>;
};

export async function buildMapCountryMetricsPayload(
  selectedWindow: MapMetricWindow,
  options: MapCountryMetricsBuildOptions = {}
): Promise<MapCountryMetricsResponse> {
  const metricRows = options.metricRows ?? await readWindowedSourceMetrics(
    selectedWindow,
    `coalesce(nullif(trim(source), ''), '') <> ''`
  );
  const healthBySource = options.healthBySource ?? await readLatestHealthBySource();
  const checkedRows = options.checkedRows
    ?? await readCheckedSourcesByCountry(24);
  const checkedSourcesByCountry = new Map<string, Set<string>>();
  for (const row of checkedRows) {
    const meta = getSourceMeta(row.source);
    if (!isDirectPublisherSource(meta)) continue;
    const country = resolvePublisherCountryForSource(row.country, row.source);
    if (!country) continue;
    const current = checkedSourcesByCountry.get(country) ?? new Set<string>();
    const normalizedSource = normalizeSourceKey(row.source);
    if (normalizedSource) {
      current.add(normalizedSource);
      checkedSourcesByCountry.set(country, current);
    }
  }
  const byCountrySource = new Map<string, {
    country: string;
    source: string;
    windows: Record<MapMetricWindow, CountryWindowAccumulator>;
    hasRss: boolean;
    hasSitemap: boolean;
    health: 'healthy' | 'warning' | 'degraded' | 'failing' | 'unknown';
  }>();

  for (const row of metricRows) {
    const meta = getSourceMeta(row.source);
    if (!isDirectPublisherSource(meta)) continue;
    const country = resolvePublisherCountryForSource(row.source_country, row.source, row.article_country);
    if (!country) continue;
    const displaySource = buildDisplaySourceName(row.source);
    const sourceKey = `${country}::${normalizeSourceKey(displaySource)}`;
    const health = normalizeHealthStatus(healthBySource.get(normalizeSourceKey(row.source)));
    const current = byCountrySource.get(sourceKey) || {
      country,
      source: displaySource,
      windows: buildCountryWindowsFromSqlRow(row),
      hasRss: Boolean(meta?.hasRss),
      hasSitemap: Boolean(meta?.hasSitemap),
      health,
    };

    if (byCountrySource.has(sourceKey)) {
      const nextWindows = buildCountryWindowsFromSqlRow(row);
      for (const metricWindow of MAP_WINDOWS) {
        current.windows[metricWindow].published += nextWindows[metricWindow].published;
        current.windows[metricWindow].fresh += nextWindows[metricWindow].fresh;
        current.windows[metricWindow].late += nextWindows[metricWindow].late;
        current.windows[metricWindow].firstSeen += nextWindows[metricWindow].firstSeen;
      }
    }
    current.hasRss = current.hasRss || Boolean(meta?.hasRss);
    current.hasSitemap = current.hasSitemap || Boolean(meta?.hasSitemap);
    if (health !== 'unknown') current.health = health;

    byCountrySource.set(sourceKey, current);
  }

  const countries = new Map<string, Omit<MapCountryMetricRow, 'windows' | 'topSources' | 'topPublishers' | 'lateShare'> & {
    windowsAcc: Record<MapMetricWindow, CountryWindowAccumulator>;
    topSources: Array<{ name: string; count: number }>;
    topPublishers: Array<{ name: string; count: number }>;
  }>();

  for (const row of byCountrySource.values()) {
    const country = row.country;
    const geo = inferGeoFromTitle(country, country);

    const current = countries.get(country) || {
      country,
      countryCode: getCountryCode(country),
      lat: geo.lat || 0,
      lon: geo.lon || 0,
      pub24h: 0,
      pub1h: 0,
      fresh24h: 0,
      late24h: 0,
      firstSeen24h: 0,
      activeSources24h: 0,
      configuredSources24h: getConfiguredDirectSourceCountByCountry(country),
      checkedSources24h: checkedSourcesByCountry.get(country)?.size || 0,
      rssSources24h: 0,
      sitemapSources24h: 0,
      healthySources24h: 0,
      degradedSources24h: 0,
      windowsAcc: {
        '1h': emptyCountryWindowAccumulator(),
        '24h': emptyCountryWindowAccumulator(),
        '7d': emptyCountryWindowAccumulator(),
      },
      topSources: [],
      topPublishers: [],
    };

    current.pub24h += row.windows['24h'].published;
    current.pub1h += row.windows['1h'].published;
    current.fresh24h += row.windows['24h'].fresh;
    current.late24h += row.windows['24h'].late;
    current.firstSeen24h += row.windows['24h'].firstSeen;
    current.topSources.push({
      name: row.source,
      count: row.windows[selectedWindow].published,
    });
    current.topPublishers.push({
      name: resolvePublisherName(row.source, country),
      count: row.windows[selectedWindow].published,
    });

    for (const metricWindow of MAP_WINDOWS) {
      const windowMetrics = row.windows[metricWindow];
      const target = current.windowsAcc[metricWindow];
      target.published += windowMetrics.published;
      target.fresh += windowMetrics.fresh;
      target.late += windowMetrics.late;
      target.firstSeen += windowMetrics.firstSeen;
      if (isCountryWindowActive(windowMetrics)) {
        target.activeSources += 1;
        if (row.hasRss) target.rssSources += 1;
        if (row.hasSitemap) target.sitemapSources += 1;
        if (row.health === 'healthy' || row.health === 'warning') {
          target.healthySources += 1;
        } else if (row.health !== 'unknown') {
          target.degradedSources += 1;
        }
      }
    }

    current.activeSources24h = current.windowsAcc['24h'].activeSources;
    current.rssSources24h = current.windowsAcc['24h'].rssSources;
    current.sitemapSources24h = current.windowsAcc['24h'].sitemapSources;
    current.healthySources24h = current.windowsAcc['24h'].healthySources;
    current.degradedSources24h = current.windowsAcc['24h'].degradedSources;

    countries.set(country, current);
  }

  const rows = [...countries.values()]
    .map((row) => {
      const windows = buildCountryWindowRecord(row.windowsAcc);
      return {
        country: row.country,
        countryCode: row.countryCode,
        lat: row.lat,
        lon: row.lon,
        pub24h: row.pub24h,
        pub1h: row.pub1h,
        fresh24h: row.fresh24h,
        late24h: row.late24h,
        firstSeen24h: row.firstSeen24h,
        lateShare: row.firstSeen24h > 0 ? row.late24h / row.firstSeen24h : 0,
        activeSources24h: row.activeSources24h,
        configuredSources24h: row.configuredSources24h,
        checkedSources24h: row.checkedSources24h,
        rssSources24h: row.rssSources24h,
        sitemapSources24h: row.sitemapSources24h,
        healthySources24h: row.healthySources24h,
        degradedSources24h: row.degradedSources24h,
        windows,
        topSources: rankTopCounts(row.topSources, 3),
        topPublishers: rankTopCounts(row.topPublishers, 3),
      };
    })
    .sort((a, b) => b.windows[selectedWindow].published - a.windows[selectedWindow].published || a.country.localeCompare(b.country));

  const totalWindowsAcc: Record<MapMetricWindow, CountryWindowAccumulator> = {
    '1h': emptyCountryWindowAccumulator(),
    '24h': emptyCountryWindowAccumulator(),
    '7d': emptyCountryWindowAccumulator(),
  };

  for (const row of rows) {
    for (const metricWindow of MAP_WINDOWS) {
      const source = row.windows[metricWindow];
      const target = totalWindowsAcc[metricWindow];
      target.published += source.published;
      target.fresh += source.fresh;
      target.late += source.late;
      target.firstSeen += source.firstSeen;
      target.activeSources += source.activeSources;
      target.rssSources += source.rssSources;
      target.sitemapSources += source.sitemapSources;
      target.healthySources += source.healthySources;
      target.degradedSources += source.degradedSources;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    storage: 'postgres' as const,
    window: selectedWindow,
    totals: {
      countries: rows.length,
      pub24h: rows.reduce((sum, row) => sum + row.pub24h, 0),
      pub1h: rows.reduce((sum, row) => sum + row.pub1h, 0),
      configuredSources24h: rows.reduce((sum, row) => sum + (row.configuredSources24h ?? 0), 0),
      checkedSources24h: rows.reduce((sum, row) => sum + (row.checkedSources24h ?? 0), 0),
      activeSources24h: rows.reduce((sum, row) => sum + row.activeSources24h, 0),
      windows: buildCountryWindowRecord(totalWindowsAcc),
    },
    countries: rows,
  };
}
