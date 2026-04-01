import 'server-only';

import { readNewsArticlesForApi } from '@/lib/ingestion-store';
import {
  readHourlyCountsForSource,
  readLatestHealthBySource,
  readRecentSourceMetrics,
  normalizeHealthStatus,
} from '@/lib/map-store-db';
import { inferSourceCoordinate } from '@/lib/map-store-locations';
import {
  buildMapSourceId,
  classifySourceMethod,
  getSourceMeta,
  matchesDisplaySource,
  normalizeSourceKey,
  parseMapSourceId,
  resolveSourceCountry,
} from '@/lib/map-store-source-meta';
import { resolvePublisherInfo } from '@/lib/publisher-groups';
import type { MapSourceDetailResponse } from '@/lib/map-types';

export async function loadMapSourceDetail(sourceName: string): Promise<MapSourceDetailResponse | null> {
  const { countryHint, source: normalizedSource } = parseMapSourceId(sourceName);
  const rows = await readRecentSourceMetrics(`coalesce(nullif(trim(e.source), ''), '') <> ''`);
  const matchingRows = rows.filter((row) => {
    if (!matchesDisplaySource(row.source, normalizedSource)) return false;
    if (!countryHint) return true;
    return resolveSourceCountry(row.source, row.country) === countryHint;
  });
  if (matchingRows.length === 0) return null;

  const country = countryHint || resolveSourceCountry(matchingRows[0].source, matchingRows[0].country) || 'Unknown';
  const rawSourceNames = [...new Set(matchingRows.map((row) => row.source))];
  const meta = getSourceMeta(normalizedSource);
  const method = classifySourceMethod(meta);
  const healthBySource = await readLatestHealthBySource();
  const healthRow = healthBySource.get(normalizeSourceKey(normalizedSource));
  const coord = inferSourceCoordinate(normalizedSource, country);
  const publisherInfo = resolvePublisherInfo(normalizedSource, country);
  const articles = await readNewsArticlesForApi({
    sourceNames: rawSourceNames,
    countries: countryHint ? [countryHint] : undefined,
    hours: 48,
    limit: 12,
  });
  const hourlyRows = await readHourlyCountsForSource(rawSourceNames, countryHint);

  const metrics = matchingRows.reduce(
    (acc, row) => {
      acc.pub24h += Number(row.pub24h || 0);
      acc.pub1h += Number(row.pub1h || 0);
      acc.fresh24h += Number(row.fresh24h || 0);
      acc.late24h += Number(row.late24h || 0);
      acc.firstSeen24h += Number(row.first_seen_24h || 0);
      return acc;
    },
    { pub24h: 0, pub1h: 0, fresh24h: 0, late24h: 0, firstSeen24h: 0 }
  );

  return {
    generatedAt: new Date().toISOString(),
    sourceId: buildMapSourceId(country, normalizedSource),
    source: normalizedSource,
    publisher: publisherInfo.publisher,
    publisherConfidence: publisherInfo.confidence,
    country,
    region: coord.region,
    city: coord.city,
    locationKind: coord.locationKind,
    lat: coord.lat,
    lon: coord.lon,
    method,
    rssUrl: meta?.rssUrl || null,
    sitemapUrl: meta?.sitemapUrl || null,
    health: {
      status: normalizeHealthStatus(healthRow),
      lastCheckedAt: healthRow?.ran_at || null,
      failRate24h: healthRow && Number(healthRow.attempts_24h || 0) > 0
        ? Number(healthRow.failures_24h || 0) / Number(healthRow.attempts_24h || 0)
        : null,
      lastError: healthRow?.error || null,
    },
    metrics: {
      pub24h: metrics.pub24h,
      pub1h: metrics.pub1h,
      fresh24h: metrics.fresh24h,
      late24h: metrics.late24h,
      firstSeen24h: metrics.firstSeen24h,
    },
    hourly24h: hourlyRows.map((hour) => ({
      hour: hour.hour_bucket,
      count: Number(hour.count || 0),
    })),
    latestArticles: (articles.items || []).slice(0, 12).map((item) => ({
      id: item.id,
      title: item.title,
      url: item.url,
      publicationDatetime: item.publicationDatetime,
      primarySection: item.primarySection,
    })),
  };
}
