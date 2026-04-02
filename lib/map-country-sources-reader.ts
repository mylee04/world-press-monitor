import { inferGeoFromCountry } from '@/lib/geo';
import {
  readDailyBenchmarkCountsForCountry,
  readHourlyCountsForCountry,
  readLatestHealthBySource,
  readWindowedSourceMetrics,
  normalizeHealthStatus,
} from '@/lib/map-store-db';
import {
  buildAreaLabel,
  inferSourceCoordinate,
  rankTopCounts,
  rankTopRegions,
} from '@/lib/map-store-locations';
import {
  buildMapSourceId,
  classifySourceMethod,
  getCountryCode,
  getSourceMeta,
  normalizeSourceKey,
  resolveSourceCountry,
} from '@/lib/map-store-source-meta';
import { MAP_WINDOWS, normalizeMapMetricWindow } from '@/lib/map-store-windows';
import { resolvePublisherInfo } from '@/lib/publisher-groups';
import { buildDisplaySourceName } from '@/lib/source-display';
import type {
  MapMetricWindow,
  MapCountrySourcesResponse,
  MapSourceMetricRow,
} from '@/lib/map-types';

export async function loadMapCountrySources(
  country: string,
  window: MapMetricWindow
): Promise<MapCountrySourcesResponse> {
  const selectedWindow = normalizeMapMetricWindow(window);
  const rows = await readWindowedSourceMetrics(selectedWindow, `coalesce(nullif(trim(e.source), ''), '') <> ''`);
  const healthBySource = await readLatestHealthBySource();
  const bySource = new Map<string, MapSourceMetricRow>();

  for (const row of rows) {
    const sourceCountry = resolveSourceCountry(row.source, row.country);
    if (sourceCountry !== country) continue;

    const displaySource = buildDisplaySourceName(row.source);
    const sourceKey = normalizeSourceKey(displaySource);
    const meta = getSourceMeta(row.source);
    const method = classifySourceMethod(meta);
    const health = normalizeHealthStatus(healthBySource.get(normalizeSourceKey(row.source)));
    const windows = {
      '1h': {
        published: Number(row.pub_1h || 0),
        fresh: Number(row.fresh_1h || 0),
        late: Number(row.late_1h || 0),
        firstSeen: Number(row.first_seen_1h || 0),
      },
      '24h': {
        published: Number(row.pub_24h || 0),
        fresh: Number(row.fresh_24h || 0),
        late: Number(row.late_24h || 0),
        firstSeen: Number(row.first_seen_24h || 0),
      },
      '7d': {
        published: Number(row.pub_7d || 0),
        fresh: Number(row.fresh_7d || 0),
        late: Number(row.late_7d || 0),
        firstSeen: Number(row.first_seen_7d || 0),
      },
    } satisfies MapSourceMetricRow['windows'];
    const current = bySource.get(sourceKey);

    if (current) {
      current.pub24h += windows['24h'].published;
      current.pub1h += windows['1h'].published;
      current.fresh24h += windows['24h'].fresh;
      current.late24h += windows['24h'].late;
      current.firstSeen24h += windows['24h'].firstSeen;
      for (const metricWindow of MAP_WINDOWS) {
        current.windows[metricWindow].published += windows[metricWindow].published;
        current.windows[metricWindow].fresh += windows[metricWindow].fresh;
        current.windows[metricWindow].late += windows[metricWindow].late;
        current.windows[metricWindow].firstSeen += windows[metricWindow].firstSeen;
      }
      continue;
    }

    const publisherInfo = resolvePublisherInfo(displaySource, country);
    const coord = inferSourceCoordinate(displaySource, country, {
      publisher: publisherInfo.publisher,
    });
    bySource.set(sourceKey, {
      sourceId: buildMapSourceId(country, displaySource),
      source: displaySource,
      publisher: publisherInfo.publisher,
      publisherConfidence: publisherInfo.confidence,
      country,
      region: coord.region,
      city: coord.city,
      locationKind: coord.locationKind,
      lat: coord.lat,
      lon: coord.lon,
      pub24h: windows['24h'].published,
      pub1h: windows['1h'].published,
      fresh24h: windows['24h'].fresh,
      late24h: windows['24h'].late,
      firstSeen24h: windows['24h'].firstSeen,
      windows,
      method,
      health,
      rssUrl: meta?.rssUrl || null,
      sitemapUrl: meta?.sitemapUrl || null,
    });
  }

  const sourceRows: MapSourceMetricRow[] = [...bySource.values()]
    .sort((a, b) => b.windows[selectedWindow].published - a.windows[selectedWindow].published || a.source.localeCompare(b.source));

  const center = inferGeoFromCountry(country);
  const hourlyRows = await readHourlyCountsForCountry(country);
  const dailyRows = await readDailyBenchmarkCountsForCountry(country);

  return {
    generatedAt: new Date().toISOString(),
    country,
    countryCode: getCountryCode(country),
    window: selectedWindow,
    center: {
      lat: center.lat || 0,
      lon: center.lon || 0,
    },
    summary: {
      pub24h: sourceRows.reduce((sum, row) => sum + row.pub24h, 0),
      pub1h: sourceRows.reduce((sum, row) => sum + row.pub1h, 0),
      activeSources24h: sourceRows.length,
      rssSources24h: sourceRows.filter((row) => row.method === 'rss' || row.method === 'rss+sitemap').length,
      sitemapSources24h: sourceRows.filter((row) => row.method === 'sitemap' || row.method === 'rss+sitemap').length,
    },
    topSources: sourceRows.slice(0, 8).map((row) => ({ name: row.source, count: row.windows[selectedWindow].published })),
    topPublishers: rankTopCounts(
      sourceRows.map((row) => ({ name: row.publisher || row.source, count: row.windows[selectedWindow].published })),
      8
    ),
    topRegions: rankTopRegions(
      sourceRows.map((row) => ({
        name: row.locationKind === 'country-fallback' ? 'Unmapped / National' : buildAreaLabel(row),
        count: row.windows[selectedWindow].published,
        sources: 1,
        unmapped: row.locationKind === 'country-fallback',
      })),
      8
    ),
    hourly24h: hourlyRows.map((hour) => ({
      hour: hour.hour_bucket,
      count: Number(hour.count || 0),
    })),
    daily7d: [...dailyRows]
      .reverse()
      .map((day) => ({
        day: day.day_bucket,
        count: Number(day.published_count || 0),
      })),
    sources: sourceRows,
  };
}
