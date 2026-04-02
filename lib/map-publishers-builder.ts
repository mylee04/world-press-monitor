import { inferGeoFromTitle } from '@/lib/geo';
import {
  readLatestHealthBySource,
  readWindowedSourceMetrics,
  normalizeHealthStatus,
} from '@/lib/map-store-db';
import {
  getCountryCode,
  normalizeSourceKey,
  resolveSourceCountry,
} from '@/lib/map-store-source-meta';
import {
  addPublisherConfidenceVote,
  buildCountryWindowsFromSqlRow,
  buildPublisherCountryWindowRecord,
  buildPublisherWindowRecord,
  emptyPublisherConfidenceVotes,
  emptyPublisherWindowAccumulator,
  isCountryWindowActive,
  MAP_WINDOWS,
  mergePublisherConfidenceVotes,
  resolvePublisherConfidence,
  type PublisherConfidenceVotes,
  type PublisherWindowAccumulator,
} from '@/lib/map-store-windows';
import { resolvePublisherInfo } from '@/lib/publisher-groups';
import { buildDisplaySourceName } from '@/lib/source-display';
import type {
  MapMetricWindow,
  MapPublishersResponse,
} from '@/lib/map-types';

export async function buildMapPublishersPayload(selectedWindow: MapMetricWindow): Promise<MapPublishersResponse> {
  const metricRows = await readWindowedSourceMetrics(selectedWindow, `coalesce(nullif(trim(country), ''), '') <> ''`);
  const healthBySource = await readLatestHealthBySource();
  const byPublisherCountry = new Map<string, {
    publisher: string;
    country: string;
    countryCode: string | null;
    lat: number;
    lon: number;
    publisherConfidenceVotes: PublisherConfidenceVotes;
    pub24h: number;
    activeSources24h: number;
    healthySources24h: number;
    degradedSources24h: number;
    windowsAcc: Record<MapMetricWindow, PublisherWindowAccumulator>;
  }>();

  for (const row of metricRows) {
    const country = resolveSourceCountry(row.source, row.country);
    if (!country) continue;
    const source = buildDisplaySourceName(row.source);
    const publisherInfo = resolvePublisherInfo(source, country);
    const publisher = publisherInfo.publisher;
    const geo = inferGeoFromTitle(country, country);
    const health = normalizeHealthStatus(healthBySource.get(normalizeSourceKey(row.source)));
    const sourceWindows = buildCountryWindowsFromSqlRow(row);
    const key = `${publisher}::${country}`;
    const current = byPublisherCountry.get(key) || {
      publisher,
      country,
      countryCode: getCountryCode(country),
      lat: geo.lat || 0,
      lon: geo.lon || 0,
      publisherConfidenceVotes: emptyPublisherConfidenceVotes(),
      pub24h: 0,
      activeSources24h: 0,
      healthySources24h: 0,
      degradedSources24h: 0,
      windowsAcc: {
        '1h': emptyPublisherWindowAccumulator(),
        '24h': emptyPublisherWindowAccumulator(),
        '7d': emptyPublisherWindowAccumulator(),
      },
    };

    current.pub24h += sourceWindows['24h'].published;
    addPublisherConfidenceVote(current.publisherConfidenceVotes, publisherInfo.confidence);
    if (isCountryWindowActive(sourceWindows['24h'])) current.activeSources24h += 1;
    if (isCountryWindowActive(sourceWindows['24h']) && (health === 'healthy' || health === 'warning')) current.healthySources24h += 1;
    if (isCountryWindowActive(sourceWindows['24h']) && (health === 'degraded' || health === 'failing')) current.degradedSources24h += 1;
    for (const metricWindow of MAP_WINDOWS) {
      if (!isCountryWindowActive(sourceWindows[metricWindow])) continue;
      current.windowsAcc[metricWindow].published += sourceWindows[metricWindow].published;
      current.windowsAcc[metricWindow].activeSources += 1;
      if (health === 'healthy' || health === 'warning') current.windowsAcc[metricWindow].healthySources += 1;
      if (health === 'degraded' || health === 'failing') current.windowsAcc[metricWindow].degradedSources += 1;
    }
    byPublisherCountry.set(key, current);
  }

  const byPublisher = new Map<string, MapPublishersResponse['publishers'][number] & { publisherConfidenceVotes: PublisherConfidenceVotes }>();
  for (const row of byPublisherCountry.values()) {
    const current = byPublisher.get(row.publisher) || {
      publisher: row.publisher,
      publisherConfidence: 'low' as const,
      publisherConfidenceVotes: emptyPublisherConfidenceVotes(),
      pub24h: 0,
      activeCountries24h: 0,
      activeSources24h: 0,
      healthySources24h: 0,
      degradedSources24h: 0,
      windows: buildPublisherWindowRecord({}),
      countries: [],
    };

    current.pub24h += row.pub24h;
    current.activeCountries24h += 1;
    current.activeSources24h += row.activeSources24h;
    current.healthySources24h += row.healthySources24h;
    current.degradedSources24h += row.degradedSources24h;
    mergePublisherConfidenceVotes(current.publisherConfidenceVotes, row.publisherConfidenceVotes);
    current.publisherConfidence = resolvePublisherConfidence(current.publisherConfidenceVotes);
    for (const metricWindow of MAP_WINDOWS) {
      const countryWindow = row.windowsAcc[metricWindow];
      if (countryWindow.published > 0 || countryWindow.activeSources > 0) {
        current.windows[metricWindow].published += countryWindow.published;
        current.windows[metricWindow].activeCountries += 1;
        current.windows[metricWindow].activeSources += countryWindow.activeSources;
        current.windows[metricWindow].healthySources += countryWindow.healthySources;
        current.windows[metricWindow].degradedSources += countryWindow.degradedSources;
      }
    }
    current.countries.push({
      country: row.country,
      countryCode: row.countryCode,
      lat: row.lat,
      lon: row.lon,
      publisherConfidence: resolvePublisherConfidence(row.publisherConfidenceVotes),
      pub24h: row.pub24h,
      activeSources24h: row.activeSources24h,
      healthySources24h: row.healthySources24h,
      degradedSources24h: row.degradedSources24h,
      windows: buildPublisherCountryWindowRecord({
        '1h': row.windowsAcc['1h'],
        '24h': row.windowsAcc['24h'],
        '7d': row.windowsAcc['7d'],
      }),
    });

    byPublisher.set(row.publisher, current);
  }

  return {
    generatedAt: new Date().toISOString(),
    storage: 'postgres',
    window: selectedWindow,
    publishers: [...byPublisher.values()]
      .map(({ publisherConfidenceVotes: _publisherConfidenceVotes, ...publisher }) => ({
        ...publisher,
        countries: [...publisher.countries].sort(
          (a, b) => b.windows[selectedWindow].published - a.windows[selectedWindow].published || a.country.localeCompare(b.country)
        ),
      }))
      .sort((a, b) => b.windows[selectedWindow].published - a.windows[selectedWindow].published || a.publisher.localeCompare(b.publisher)),
  };
}
