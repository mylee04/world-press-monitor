import 'server-only';

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { resolveDatabaseUrl } from '@/lib/database-url';
import { inferGeoFromTitle } from '@/lib/geo';
import { readNewsArticlesForApi } from '@/lib/ingestion-store';
import { resolvePublisherName } from '@/lib/publisher-groups';
import { resolveSourceHeadquarters } from '@/lib/source-headquarters';
import { buildDisplaySourceName } from '@/lib/source-display';
import type {
  MapCountryMetricsResponse,
  MapCountryMetricRow,
  MapCountrySourcesResponse,
  MapSourceDetailResponse,
  MapSourceMetricRow,
} from '@/lib/map-types';

type AtlasFeed = {
  name?: string;
  url?: string | null;
  sitemapUrl?: string | null;
};

type AtlasCountry = {
  name?: string;
  code?: string | null;
  feeds?: AtlasFeed[];
};

type AtlasFile = {
  countries?: AtlasCountry[];
};

type PublicSourceRecord = {
  source: string;
  country: string;
  countryCode: string | null;
  rssUrl: string | null;
  sitemapUrl: string | null;
  latestHealth?: {
    ranAt?: string | null;
    method?: 'rss' | 'sitemap';
    ok?: boolean;
    healthClassification?: string | null;
    error?: string | null;
  } | null;
};

type PublicSourcesFile = {
  generatedAt?: string;
  sources?: PublicSourceRecord[];
};

type PublicNewsArticle = {
  id: string;
  source: string;
  country: string;
  countryCode: string | null;
  title: string;
  url: string;
  publicationDatetime: string;
  createdAt: string;
  primarySection: string | null;
};

type PublicCountryFeedFile = {
  generatedAt: string;
  countryCode: string;
  country: string;
  articleCount: number;
  articles: PublicNewsArticle[];
};

type SourceMethodMeta = {
  country: string;
  countryCode: string | null;
  source: string;
  displaySource: string;
  rssUrl: string | null;
  sitemapUrl: string | null;
  hasRss: boolean;
  hasSitemap: boolean;
};

type SourceMetricSqlRow = {
  country: string | null;
  source: string;
  pub24h: string;
  pub1h: string;
  fresh24h: string;
  late24h: string;
  first_seen_24h: string;
};

type HealthSqlRow = {
  source: string;
  method: string;
  ok: boolean;
  health_classification: string | null;
  ran_at: string | null;
  error: string | null;
  failures_24h: string;
  attempts_24h: string;
};

type HourlySqlRow = {
  hour_bucket: string;
  count: string;
};

let pool: Pool | null = null;
let atlasSourceMetaCache: Map<string, SourceMethodMeta> | null = null;
let atlasCountryCodeCache: Map<string, string | null> | null = null;
let publicSourcesCache: Map<string, PublicSourceRecord> | null = null;
let publicCountryFeedCache: Map<string, PublicCountryFeedFile> | null = null;
const MAP_COUNTRY_METRICS_CACHE_MS = 60_000;
const MAP_COUNTRY_SOURCES_CACHE_MS = 60_000;
const MAP_SOURCE_DETAIL_CACHE_MS = 60_000;

type TimedCacheEntry<T> = {
  value: T;
  expiresAt: number;
};

let mapCountryMetricsCache: TimedCacheEntry<MapCountryMetricsResponse> | null = null;
const mapCountrySourcesCache = new Map<string, TimedCacheEntry<MapCountrySourcesResponse>>();
const mapSourceDetailCache = new Map<string, TimedCacheEntry<MapSourceDetailResponse | null>>();

function readTimedCache<T>(entry: TimedCacheEntry<T> | null | undefined): T | null {
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) return null;
  return entry.value;
}

function writeTimedCache<T>(value: T, ttlMs: number): TimedCacheEntry<T> {
  return {
    value,
    expiresAt: Date.now() + ttlMs,
  };
}

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: resolveDatabaseUrl(),
    });
  }
  return pool;
}

function normalizeSourceKey(value: string): string {
  return buildDisplaySourceName(value || '').trim().toLowerCase();
}

function buildMapSourceId(country: string, source: string): string {
  return `${country}::${buildDisplaySourceName(source)}`;
}

function parseMapSourceId(value: string): { countryHint: string | null; source: string } {
  const decoded = decodeURIComponent(value || '');
  const separatorIndex = decoded.indexOf('::');
  if (separatorIndex === -1) {
    return {
      countryHint: null,
      source: buildDisplaySourceName(decoded),
    };
  }

  return {
    countryHint: decoded.slice(0, separatorIndex).trim() || null,
    source: buildDisplaySourceName(decoded.slice(separatorIndex + 2)),
  };
}

function matchesDisplaySource(rawSource: string, displaySource: string): boolean {
  return normalizeSourceKey(rawSource) === normalizeSourceKey(displaySource);
}

function getAtlasPath(): string {
  return path.join(process.cwd(), 'data', 'rss-atlas.json');
}

function getExportsPath(...segments: string[]): string {
  return path.join(process.cwd(), 'exports', 'public-data', ...segments);
}

function loadAtlasSourceMeta(): {
  sourceMeta: Map<string, SourceMethodMeta>;
  countryCodes: Map<string, string | null>;
} {
  if (atlasSourceMetaCache && atlasCountryCodeCache) {
    return {
      sourceMeta: atlasSourceMetaCache,
      countryCodes: atlasCountryCodeCache,
    };
  }

  const raw = readFileSync(getAtlasPath(), 'utf8');
  const parsed = JSON.parse(raw) as AtlasFile;
  const sourceMeta = new Map<string, SourceMethodMeta>();
  const countryCodes = new Map<string, string | null>();

  for (const country of parsed.countries || []) {
    const countryName = (country.name || '').trim();
    const countryCode = (country.code || '').trim() || null;
    if (!countryName) continue;
    countryCodes.set(countryName, countryCode);

    for (const feed of country.feeds || []) {
      const rawName = (feed.name || '').trim();
      if (!rawName) continue;
      const displaySource = buildDisplaySourceName(rawName);
      const key = normalizeSourceKey(displaySource);
      const current = sourceMeta.get(key);
      const next: SourceMethodMeta = {
        country: current?.country || countryName,
        countryCode: current?.countryCode || countryCode,
        source: current?.source || rawName,
        displaySource,
        rssUrl: current?.rssUrl || feed.url || null,
        sitemapUrl: current?.sitemapUrl || feed.sitemapUrl || null,
        hasRss: Boolean((current?.rssUrl || feed.url || null)),
        hasSitemap: Boolean((current?.sitemapUrl || feed.sitemapUrl || null)),
      };
      sourceMeta.set(key, next);
      sourceMeta.set(normalizeSourceKey(rawName), next);
    }
  }

  atlasSourceMetaCache = sourceMeta;
  atlasCountryCodeCache = countryCodes;
  return { sourceMeta, countryCodes };
}

function getCountryCode(country: string): string | null {
  const { countryCodes } = loadAtlasSourceMeta();
  return countryCodes.get(country) || null;
}

function getSourceMeta(source: string): SourceMethodMeta | null {
  const { sourceMeta } = loadAtlasSourceMeta();
  return sourceMeta.get(normalizeSourceKey(source)) || null;
}

function classifySourceMethod(meta: SourceMethodMeta | null): 'rss' | 'sitemap' | 'rss+sitemap' {
  if (meta?.hasRss && meta?.hasSitemap) return 'rss+sitemap';
  if (meta?.hasSitemap) return 'sitemap';
  return 'rss';
}

function normalizeHealthStatus(row: HealthSqlRow | undefined): 'healthy' | 'warning' | 'degraded' | 'failing' | 'unknown' {
  if (!row) return 'unknown';
  const normalized = (row.health_classification || '').trim().toLowerCase();
  if (normalized === 'healthy' || normalized === 'warning' || normalized === 'degraded' || normalized === 'failing') {
    return normalized;
  }
  if (row.ok) return 'healthy';
  return 'degraded';
}

function hashNumber(value: string): number {
  const hex = createHash('md5').update(value).digest('hex').slice(0, 8);
  return Number.parseInt(hex, 16);
}

type JitterProfile = {
  minRadius: number;
  maxRadius: number;
};

const COUNTRY_JITTER: JitterProfile = {
  minRadius: 0.2,
  maxRadius: 1.05,
};

const CITY_JITTER: JitterProfile = {
  minRadius: 0.01,
  maxRadius: 0.075,
};

const HEADQUARTERS_JITTER: JitterProfile = {
  minRadius: 0.0015,
  maxRadius: 0.012,
};

const PRIMARY_MEDIA_HUBS = new Map<string, { name: string; lat: number; lon: number }>([
  ['South Korea', { name: 'Seoul', lat: 37.5665, lon: 126.978 }],
  ['Japan', { name: 'Tokyo', lat: 35.6762, lon: 139.6503 }],
  ['Taiwan', { name: 'Taipei', lat: 25.033, lon: 121.5654 }],
  ['Singapore', { name: 'Singapore', lat: 1.3521, lon: 103.8198 }],
  ['United Kingdom', { name: 'London', lat: 51.5072, lon: -0.1276 }],
  ['France', { name: 'Paris', lat: 48.8566, lon: 2.3522 }],
  ['Belgium', { name: 'Brussels', lat: 50.8503, lon: 4.3517 }],
  ['Ireland', { name: 'Dublin', lat: 53.3498, lon: -6.2603 }],
  ['Norway', { name: 'Oslo', lat: 59.9139, lon: 10.7522 }],
  ['Denmark', { name: 'Copenhagen', lat: 55.6761, lon: 12.5683 }],
  ['Finland', { name: 'Helsinki', lat: 60.1699, lon: 24.9384 }],
  ['Estonia', { name: 'Tallinn', lat: 59.437, lon: 24.7536 }],
  ['Latvia', { name: 'Riga', lat: 56.9496, lon: 24.1052 }],
  ['Lithuania', { name: 'Vilnius', lat: 54.6872, lon: 25.2797 }],
  ['Czech Republic', { name: 'Prague', lat: 50.0755, lon: 14.4378 }],
  ['Slovakia', { name: 'Bratislava', lat: 48.1486, lon: 17.1077 }],
  ['Croatia', { name: 'Zagreb', lat: 45.815, lon: 15.9819 }],
]);

function withStableJitter(
  lat: number,
  lon: number,
  seed: string,
  profile: JitterProfile = COUNTRY_JITTER
): { lat: number; lon: number } {
  const hash = hashNumber(seed);
  const angle = (hash % 360) * (Math.PI / 180);
  const radius = profile.minRadius + (((hash >> 8) % 100) / 100) * (profile.maxRadius - profile.minRadius);
  const latOffset = Math.sin(angle) * radius;
  const lonOffset = Math.cos(angle) * radius * Math.max(0.35, Math.cos((lat * Math.PI) / 180));
  return {
    lat: Number((lat + latOffset).toFixed(4)),
    lon: Number((lon + lonOffset).toFixed(4)),
  };
}

function resolveSourceCountry(source: string, fallbackCountry?: string | null): string | null {
  const meta = getSourceMeta(source);
  return meta?.country || (fallbackCountry || '').trim() || null;
}

function inferSourceCoordinate(source: string, country: string): {
  lat: number;
  lon: number;
  city: string | null;
  region: string | null;
  locationKind: 'headquarters' | 'inferred-city' | 'hub' | 'country-fallback';
} {
  const headquarters = resolveSourceHeadquarters(source, country);
  if (headquarters) {
    const jittered = withStableJitter(headquarters.lat, headquarters.lon, `hq:${country}:${source}`, HEADQUARTERS_JITTER);
    return {
      lat: jittered.lat,
      lon: jittered.lon,
      city: headquarters.city,
      region: headquarters.region,
      locationKind: 'headquarters',
    };
  }

  const inferred = inferGeoFromTitle(source, country);
  if (typeof inferred.lat === 'number' && typeof inferred.lon === 'number') {
    const usedCountryFallback = !inferred.locationName || inferred.locationName === country;
    if (usedCountryFallback) {
      const hub = PRIMARY_MEDIA_HUBS.get(country);
      if (hub) {
        const jittered = withStableJitter(hub.lat, hub.lon, `${country}:${source}`, CITY_JITTER);
        return { ...jittered, city: hub.name, region: hub.name, locationKind: 'hub' };
      }
      const jittered = withStableJitter(inferred.lat, inferred.lon, `${country}:${source}`, COUNTRY_JITTER);
      return { ...jittered, city: null, region: null, locationKind: 'country-fallback' };
    }
    const jittered = withStableJitter(inferred.lat, inferred.lon, `${country}:${source}`, CITY_JITTER);
    return {
      lat: jittered.lat,
      lon: jittered.lon,
      city: inferred.locationName || null,
      region: inferred.locationName || null,
      locationKind: 'inferred-city',
    };
  }

  const fallback = inferGeoFromTitle(country, country);
  const hub = PRIMARY_MEDIA_HUBS.get(country);
  if (hub) {
    const jittered = withStableJitter(hub.lat, hub.lon, `${country}:${source}`, CITY_JITTER);
    return { ...jittered, city: hub.name, region: hub.name, locationKind: 'hub' };
  }
  const jittered = withStableJitter(fallback.lat || 0, fallback.lon || 0, `${country}:${source}`, COUNTRY_JITTER);
  return { ...jittered, city: null, region: null, locationKind: 'country-fallback' };
}

async function readRecentSourceMetrics(whereSql?: string, params: unknown[] = []): Promise<SourceMetricSqlRow[]> {
  const db = getPool();
  const result = await db.query<SourceMetricSqlRow>(
    `
    select
      e.country,
      e.source,
      count(*) filter (where e.publication_datetime >= now() - interval '24 hours')::text as pub24h,
      count(*) filter (where e.publication_datetime >= now() - interval '1 hour')::text as pub1h,
      count(*) filter (
        where e.publication_datetime >= now() - interval '24 hours'
          and e.created_at >= now() - interval '24 hours'
      )::text as fresh24h,
      count(*) filter (
        where e.created_at >= now() - interval '24 hours'
          and e.publication_datetime < now() - interval '24 hours'
      )::text as late24h,
      count(*) filter (where e.created_at >= now() - interval '24 hours')::text as first_seen_24h
    from news_articles e
    where (
      e.publication_datetime >= now() - interval '24 hours'
      or e.created_at >= now() - interval '24 hours'
    )
      and coalesce(nullif(trim(e.title_quality), ''), 'ok') <> 'suspect'
      ${whereSql ? `and ${whereSql}` : ''}
    group by e.country, e.source
    having count(*) filter (where e.publication_datetime >= now() - interval '24 hours') > 0
        or count(*) filter (where e.created_at >= now() - interval '24 hours') > 0
    `,
    params
  );
  return result.rows;
}

async function readLatestHealthBySource(): Promise<Map<string, HealthSqlRow>> {
  const db = getPool();
  const result = await db.query<HealthSqlRow>(
    `
    with latest as (
      select distinct on (source, method)
        source,
        method,
        ok,
        health_classification,
        ran_at,
        error
      from rss_health_status
      order by source, method, ran_at desc
    ),
    fail_window as (
      select
        source,
        method,
        count(*) filter (where attempted) as attempts_24h,
        count(*) filter (where attempted and not ok) as failures_24h
      from rss_health_status
      where ran_at >= now() - interval '24 hours'
      group by source, method
    )
    select
      latest.source,
      latest.method,
      latest.ok,
      latest.health_classification,
      latest.ran_at,
      latest.error,
      coalesce(fail_window.failures_24h, 0)::text as failures_24h,
      coalesce(fail_window.attempts_24h, 0)::text as attempts_24h
    from latest
    left join fail_window
      on fail_window.source = latest.source
     and fail_window.method = latest.method
    `
  );

  const bySource = new Map<string, HealthSqlRow>();
  for (const row of result.rows) {
    const key = normalizeSourceKey(row.source);
    const current = bySource.get(key);
    if (!current) {
      bySource.set(key, row);
      continue;
    }
    const currentRank = healthRank(normalizeHealthStatus(current));
    const nextRank = healthRank(normalizeHealthStatus(row));
    if (nextRank < currentRank) {
      bySource.set(key, row);
    }
  }
  return bySource;
}

function healthRank(status: 'healthy' | 'warning' | 'degraded' | 'failing' | 'unknown'): number {
  switch (status) {
    case 'healthy':
      return 0;
    case 'warning':
      return 1;
    case 'degraded':
      return 2;
    case 'failing':
      return 3;
    default:
      return 4;
  }
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function loadPublicSources(): Map<string, PublicSourceRecord> {
  if (publicSourcesCache) return publicSourcesCache;
  const parsed = readJsonFile<PublicSourcesFile>(getExportsPath('sources.json'));
  const mapped = new Map<string, PublicSourceRecord>();
  for (const source of parsed.sources || []) {
    mapped.set(normalizeSourceKey(source.source), source);
  }
  publicSourcesCache = mapped;
  return mapped;
}

function loadPublicCountryFeeds(): Map<string, PublicCountryFeedFile> {
  if (publicCountryFeedCache) return publicCountryFeedCache;
  const dir = getExportsPath();
  const cache = new Map<string, PublicCountryFeedFile>();
  const manifest = readJsonFile<{ countries?: string[] }>(getExportsPath('manifest.json'));
  for (const countryCode of manifest.countries || []) {
    const filePath = getExportsPath(`country-published-24h-${countryCode}.json`);
    try {
      const file = readJsonFile<PublicCountryFeedFile>(filePath);
      cache.set(countryCode, file);
    } catch {
      continue;
    }
  }
  publicCountryFeedCache = cache;
  return cache;
}

function classifyPublicHealth(source: PublicSourceRecord | undefined): 'healthy' | 'warning' | 'degraded' | 'failing' | 'unknown' {
  if (!source?.latestHealth) return 'unknown';
  const normalized = (source.latestHealth.healthClassification || '').trim().toLowerCase();
  if (normalized === 'healthy' || normalized === 'warning' || normalized === 'degraded' || normalized === 'failing') {
    return normalized;
  }
  if (normalized === 'success' || source.latestHealth.ok) return 'healthy';
  return 'degraded';
}

function rankTopCounts(items: Array<{ name: string; count: number }>, limit = 8): Array<{ name: string; count: number }> {
  const byName = new Map<string, number>();
  for (const item of items) {
    byName.set(item.name, (byName.get(item.name) || 0) + item.count);
  }

  return [...byName.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function rankTopRegions(
  items: Array<{ name: string; count: number; sources?: number; unmapped?: boolean }>,
  limit = 8
): Array<{ name: string; count: number; sources: number }> {
  const byName = new Map<string, { count: number; sources: number; unmapped: boolean }>();
  for (const item of items) {
    const current = byName.get(item.name) || { count: 0, sources: 0, unmapped: false };
    current.count += item.count;
    current.sources += item.sources || 0;
    current.unmapped = current.unmapped || Boolean(item.unmapped);
    byName.set(item.name, current);
  }

  return [...byName.entries()]
    .map(([name, value]) => ({ name, count: value.count, sources: value.sources, unmapped: value.unmapped }))
    .sort((a, b) => Number(a.unmapped) - Number(b.unmapped) || b.count - a.count || b.sources - a.sources || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ name, count, sources }) => ({ name, count, sources }));
}

function buildAreaLabel(value: { city: string | null; region: string | null; country: string }): string {
  return value.city || value.region || value.country;
}

function toPublicMethod(source: PublicSourceRecord | undefined): 'rss' | 'sitemap' | 'rss+sitemap' {
  if (source?.rssUrl && source?.sitemapUrl) return 'rss+sitemap';
  if (source?.sitemapUrl) return 'sitemap';
  return 'rss';
}

function deriveReferenceNow(value: string, articles: PublicNewsArticle[]): number {
  const generatedAtMs = Date.parse(value || '');
  if (Number.isFinite(generatedAtMs)) return generatedAtMs;
  const latestArticleMs = Math.max(0, ...articles.map((article) => Date.parse(article.publicationDatetime || '') || 0));
  return latestArticleMs || Date.now();
}

function buildCountryMetricsFromPublicData(): MapCountryMetricsResponse {
  const publicSources = loadPublicSources();
  const publicCountryFeeds = loadPublicCountryFeeds();
  const byCountrySource = new Map<string, {
    country: string;
    sourceKey: string;
    pub24h: number;
    pub1h: number;
    fresh24h: number;
    late24h: number;
    firstSeen24h: number;
  }>();

  for (const file of publicCountryFeeds.values()) {
    const referenceNow = deriveReferenceNow(file.generatedAt, file.articles || []);
    const cutoff24h = referenceNow - 24 * 60 * 60 * 1000;
    const cutoff1h = referenceNow - 60 * 60 * 1000;

    for (const article of file.articles || []) {
      const sourceCountry = resolveSourceCountry(article.source, file.country);
      if (!sourceCountry) continue;
      const sourceKey = normalizeSourceKey(article.source);
      const compoundKey = `${sourceCountry}::${sourceKey}`;
      const publicationMs = Date.parse(article.publicationDatetime || '');
      const createdMs = Date.parse(article.createdAt || '');
      const current = byCountrySource.get(compoundKey) || {
        country: sourceCountry,
        sourceKey,
        pub24h: 0,
        pub1h: 0,
        fresh24h: 0,
        late24h: 0,
        firstSeen24h: 0,
      };
      if (publicationMs >= cutoff24h) current.pub24h += 1;
      if (publicationMs >= cutoff1h) current.pub1h += 1;
      if (createdMs >= cutoff24h) current.firstSeen24h += 1;
      if (publicationMs >= cutoff24h && createdMs >= cutoff24h) current.fresh24h += 1;
      if (createdMs >= cutoff24h && publicationMs < cutoff24h) current.late24h += 1;
      byCountrySource.set(compoundKey, current);
    }
  }

  const byCountry = new Map<string, MapCountryMetricRow>();

  for (const value of byCountrySource.values()) {
    const geo = inferGeoFromTitle(value.country, value.country);
    const source = publicSources.get(value.sourceKey);
    const health = classifyPublicHealth(source);
    const row = byCountry.get(value.country) || {
      country: value.country,
      countryCode: getCountryCode(value.country),
      lat: geo.lat || 0,
      lon: geo.lon || 0,
      pub24h: 0,
      pub1h: 0,
      fresh24h: 0,
      late24h: 0,
      firstSeen24h: 0,
      lateShare: 0,
      activeSources24h: 0,
      rssSources24h: 0,
      sitemapSources24h: 0,
      healthySources24h: 0,
      degradedSources24h: 0,
      topSources: [],
      topPublishers: [],
    };

    row.pub24h += value.pub24h;
    row.pub1h += value.pub1h;
    row.fresh24h += value.fresh24h;
    row.late24h += value.late24h;
    row.firstSeen24h += value.firstSeen24h;
    row.activeSources24h += 1;
    if (source?.rssUrl) row.rssSources24h += 1;
    if (source?.sitemapUrl) row.sitemapSources24h += 1;
    if (health === 'healthy' || health === 'warning') row.healthySources24h += 1;
    if (health === 'degraded' || health === 'failing') row.degradedSources24h += 1;
    row.topSources.push({
      name: source?.source || value.sourceKey,
      count: value.pub24h,
    });
    row.topPublishers.push({
      name: resolvePublisherName(source?.source || value.sourceKey, value.country),
      count: value.pub24h,
    });
    byCountry.set(value.country, row);
  }

  const rows: MapCountryMetricRow[] = [...byCountry.values()].map((row) => ({
    ...row,
      lateShare: row.firstSeen24h > 0 ? row.late24h / row.firstSeen24h : 0,
      topSources: rankTopCounts(row.topSources, 3),
      topPublishers: rankTopCounts(row.topPublishers, 3),
    }));

  rows.sort((a, b) => b.pub24h - a.pub24h || a.country.localeCompare(b.country));
  return {
    generatedAt: new Date().toISOString(),
    totals: {
      countries: rows.length,
      pub24h: rows.reduce((sum, row) => sum + row.pub24h, 0),
      pub1h: rows.reduce((sum, row) => sum + row.pub1h, 0),
      activeSources24h: rows.reduce((sum, row) => sum + row.activeSources24h, 0),
    },
    countries: rows,
  };
}

function buildCountrySourcesFromPublicData(country: string): MapCountrySourcesResponse {
  const publicSources = loadPublicSources();
  const publicCountryFeeds = loadPublicCountryFeeds();
  const files = [...publicCountryFeeds.values()];
  if (files.length === 0) {
    const fallback = inferGeoFromTitle(country, country);
    return {
      generatedAt: new Date().toISOString(),
      country,
      countryCode: getCountryCode(country),
      center: { lat: fallback.lat || 0, lon: fallback.lon || 0 },
      summary: { pub24h: 0, pub1h: 0, activeSources24h: 0, rssSources24h: 0, sitemapSources24h: 0 },
      topSources: [],
      topPublishers: [],
      topRegions: [],
      hourly24h: [],
      sources: [],
    };
  }

  const bySource = new Map<string, {
    source: string;
    pub24h: number;
    pub1h: number;
    fresh24h: number;
    late24h: number;
    firstSeen24h: number;
  }>();
  const hourly24h = new Map<string, number>();
  const seenHourlyArticleIds = new Set<string>();

  for (const file of files) {
    const referenceNow = deriveReferenceNow(file.generatedAt, file.articles || []);
    const cutoff24h = referenceNow - 24 * 60 * 60 * 1000;
    const cutoff1h = referenceNow - 60 * 60 * 1000;

    for (const article of file.articles || []) {
      const sourceCountry = resolveSourceCountry(article.source, file.country);
      if (sourceCountry !== country) continue;
      const key = normalizeSourceKey(article.source);
      const publicationMs = Date.parse(article.publicationDatetime || '');
      const createdMs = Date.parse(article.createdAt || '');
      const current = bySource.get(key) || {
        source: article.source,
        pub24h: 0,
        pub1h: 0,
        fresh24h: 0,
        late24h: 0,
        firstSeen24h: 0,
      };
      if (publicationMs >= cutoff24h) current.pub24h += 1;
      if (publicationMs >= cutoff1h) current.pub1h += 1;
      if (createdMs >= cutoff24h) current.firstSeen24h += 1;
      if (publicationMs >= cutoff24h && createdMs >= cutoff24h) current.fresh24h += 1;
      if (createdMs >= cutoff24h && publicationMs < cutoff24h) current.late24h += 1;
      if (publicationMs >= cutoff24h && !seenHourlyArticleIds.has(article.id)) {
        const hour = new Date(publicationMs);
        hour.setUTCMinutes(0, 0, 0);
        const hourKey = hour.toISOString();
        hourly24h.set(hourKey, (hourly24h.get(hourKey) || 0) + 1);
        seenHourlyArticleIds.add(article.id);
      }
      bySource.set(key, current);
    }
  }

  const rows: MapSourceMetricRow[] = [...bySource.entries()].map(([key, entry]) => {
    const sourceRecord = publicSources.get(key);
    const coord = inferSourceCoordinate(buildDisplaySourceName(entry.source), country);
    return {
      sourceId: buildMapSourceId(country, entry.source),
      source: buildDisplaySourceName(entry.source),
      publisher: resolvePublisherName(buildDisplaySourceName(entry.source), country),
      country,
      region: coord.region,
      city: coord.city,
      locationKind: coord.locationKind,
      lat: coord.lat,
      lon: coord.lon,
      pub24h: entry.pub24h,
      pub1h: entry.pub1h,
      fresh24h: entry.fresh24h,
      late24h: entry.late24h,
      firstSeen24h: entry.firstSeen24h,
      method: toPublicMethod(sourceRecord),
      health: classifyPublicHealth(sourceRecord),
      rssUrl: sourceRecord?.rssUrl || null,
      sitemapUrl: sourceRecord?.sitemapUrl || null,
    };
  }).sort((a, b) => b.pub24h - a.pub24h || a.source.localeCompare(b.source));

  const center = inferGeoFromTitle(country, country);
  return {
    generatedAt: new Date().toISOString(),
    country,
    countryCode: getCountryCode(country),
    center: {
      lat: center.lat || 0,
      lon: center.lon || 0,
    },
    summary: {
      pub24h: rows.reduce((sum, row) => sum + row.pub24h, 0),
      pub1h: rows.reduce((sum, row) => sum + row.pub1h, 0),
      activeSources24h: rows.length,
      rssSources24h: rows.filter((row) => row.method === 'rss' || row.method === 'rss+sitemap').length,
      sitemapSources24h: rows.filter((row) => row.method === 'sitemap' || row.method === 'rss+sitemap').length,
    },
    topSources: rows.slice(0, 8).map((row) => ({ name: row.source, count: row.pub24h })),
    topPublishers: rankTopCounts(
      rows.map((row) => ({ name: row.publisher || row.source, count: row.pub24h })),
      8
    ),
    topRegions: rankTopRegions(
      rows.map((row) => ({
        name: row.locationKind === 'country-fallback' ? 'Unmapped / National' : buildAreaLabel(row),
        count: row.pub24h,
        sources: 1,
        unmapped: row.locationKind === 'country-fallback',
      })),
      8
    ),
    hourly24h: [...hourly24h.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([hour, count]) => ({ hour, count })),
    sources: rows,
  };
}

function buildSourceDetailFromPublicData(sourceName: string): MapSourceDetailResponse | null {
  const { countryHint, source: normalizedSource } = parseMapSourceId(sourceName);
  const publicSources = loadPublicSources();
  const publicCountryFeeds = loadPublicCountryFeeds();
  const sourceRecord = publicSources.get(normalizeSourceKey(normalizedSource));
  let matchedCountry: string | null = null;
  let matchedGeneratedAt = new Date().toISOString();
  const articles: PublicNewsArticle[] = [];

  for (const feed of publicCountryFeeds.values()) {
    const sourceCountry = resolveSourceCountry(normalizedSource, feed.country);
    if (!sourceCountry) continue;
    if (countryHint && sourceCountry !== countryHint) continue;
    for (const article of feed.articles || []) {
      if (!matchesDisplaySource(article.source, normalizedSource)) continue;
      if (!matchedCountry) matchedCountry = sourceCountry;
      if (sourceCountry !== matchedCountry) continue;
      matchedGeneratedAt = feed.generatedAt || matchedGeneratedAt;
      articles.push(article);
    }
  }

  if (articles.length === 0) return null;

  const referenceNow = deriveReferenceNow(matchedGeneratedAt, articles);
  const cutoff24h = referenceNow - 24 * 60 * 60 * 1000;
  const cutoff1h = referenceNow - 60 * 60 * 1000;
  const country = matchedCountry || 'Unknown';
  const coord = inferSourceCoordinate(normalizedSource, country);
  const hourly = new Map<string, number>();
  let pub24h = 0;
  let pub1h = 0;
  let fresh24h = 0;
  let late24h = 0;
  let firstSeen24h = 0;

  for (const article of articles) {
    const publicationMs = Date.parse(article.publicationDatetime || '');
    const createdMs = Date.parse(article.createdAt || '');
    if (publicationMs >= cutoff24h) pub24h += 1;
    if (publicationMs >= cutoff1h) pub1h += 1;
    if (createdMs >= cutoff24h) firstSeen24h += 1;
    if (publicationMs >= cutoff24h && createdMs >= cutoff24h) fresh24h += 1;
    if (createdMs >= cutoff24h && publicationMs < cutoff24h) late24h += 1;
    if (publicationMs >= cutoff24h) {
      const hour = new Date(publicationMs);
      hour.setUTCMinutes(0, 0, 0);
      const key = hour.toISOString();
      hourly.set(key, (hourly.get(key) || 0) + 1);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    sourceId: buildMapSourceId(country, normalizedSource),
    source: normalizedSource,
    publisher: resolvePublisherName(normalizedSource, country),
    country,
    region: coord.region,
    city: coord.city,
    locationKind: coord.locationKind,
    lat: coord.lat,
    lon: coord.lon,
    method: toPublicMethod(sourceRecord),
    rssUrl: sourceRecord?.rssUrl || null,
    sitemapUrl: sourceRecord?.sitemapUrl || null,
    health: {
      status: classifyPublicHealth(sourceRecord),
      lastCheckedAt: sourceRecord?.latestHealth?.ranAt || null,
      failRate24h: null,
      lastError: sourceRecord?.latestHealth?.error || null,
    },
    metrics: {
      pub24h,
      pub1h,
      fresh24h,
      late24h,
      firstSeen24h,
    },
    hourly24h: [...hourly.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([hour, count]) => ({ hour, count })),
    latestArticles: articles
      .sort((a, b) => Date.parse(b.publicationDatetime || '') - Date.parse(a.publicationDatetime || ''))
      .slice(0, 12)
      .map((article) => ({
        id: article.id,
        title: article.title,
        url: article.url,
        publicationDatetime: article.publicationDatetime,
        primarySection: article.primarySection,
      })),
  };
}

export async function readMapCountryMetrics(): Promise<MapCountryMetricsResponse> {
  const cached = readTimedCache(mapCountryMetricsCache);
  if (cached) return cached;

  try {
    const metricRows = await readRecentSourceMetrics(`coalesce(nullif(trim(e.country), ''), '') <> ''`);
    const healthBySource = await readLatestHealthBySource();
    const byCountrySource = new Map<string, {
      country: string;
      source: string;
      pub24h: number;
      pub1h: number;
      fresh24h: number;
      late24h: number;
      firstSeen24h: number;
      hasRss: boolean;
      hasSitemap: boolean;
      health: 'healthy' | 'warning' | 'degraded' | 'failing' | 'unknown';
    }>();

    for (const row of metricRows) {
      const country = resolveSourceCountry(row.source, row.country);
      if (!country) continue;
      const displaySource = buildDisplaySourceName(row.source);
      const sourceKey = `${country}::${normalizeSourceKey(displaySource)}`;
      const meta = getSourceMeta(row.source);
      const health = normalizeHealthStatus(healthBySource.get(normalizeSourceKey(row.source)));
      const current = byCountrySource.get(sourceKey) || {
        country,
        source: displaySource,
        pub24h: 0,
        pub1h: 0,
        fresh24h: 0,
        late24h: 0,
        firstSeen24h: 0,
        hasRss: Boolean(meta?.hasRss),
        hasSitemap: Boolean(meta?.hasSitemap),
        health,
      };

      current.pub24h += Number(row.pub24h || 0);
      current.pub1h += Number(row.pub1h || 0);
      current.fresh24h += Number(row.fresh24h || 0);
      current.late24h += Number(row.late24h || 0);
      current.firstSeen24h += Number(row.first_seen_24h || 0);
      current.hasRss = current.hasRss || Boolean(meta?.hasRss);
      current.hasSitemap = current.hasSitemap || Boolean(meta?.hasSitemap);
      if (health !== 'unknown') current.health = health;

      byCountrySource.set(sourceKey, current);
    }

    const countries = new Map<string, MapCountryMetricRow>();

    for (const row of byCountrySource.values()) {
      const country = row.country;
      const sourcePub24h = row.pub24h;
      const sourcePub1h = row.pub1h;
      const sourceFresh24h = row.fresh24h;
      const sourceLate24h = row.late24h;
      const sourceFirstSeen24h = row.firstSeen24h;
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
        lateShare: 0,
        activeSources24h: 0,
        rssSources24h: 0,
        sitemapSources24h: 0,
        healthySources24h: 0,
        degradedSources24h: 0,
        topSources: [],
        topPublishers: [],
      };

      current.pub24h += sourcePub24h;
      current.pub1h += sourcePub1h;
      current.fresh24h += sourceFresh24h;
      current.late24h += sourceLate24h;
      current.firstSeen24h += sourceFirstSeen24h;
      current.activeSources24h += 1;
      if (row.hasRss) current.rssSources24h += 1;
      if (row.hasSitemap) current.sitemapSources24h += 1;
      if (row.health === 'healthy' || row.health === 'warning') {
        current.healthySources24h += 1;
      } else if (row.health !== 'unknown') {
        current.degradedSources24h += 1;
      }
      current.topSources.push({
        name: row.source,
        count: sourcePub24h,
      });
      current.topPublishers.push({
        name: resolvePublisherName(row.source, country),
        count: sourcePub24h,
      });

      countries.set(country, current);
    }

    const rows = [...countries.values()]
      .map((row) => ({
        ...row,
        lateShare: row.firstSeen24h > 0 ? row.late24h / row.firstSeen24h : 0,
        topSources: rankTopCounts(row.topSources, 3),
        topPublishers: rankTopCounts(row.topPublishers, 3),
      }))
      .sort((a, b) => b.pub24h - a.pub24h || a.country.localeCompare(b.country));

    const payload = {
      generatedAt: new Date().toISOString(),
      totals: {
        countries: rows.length,
        pub24h: rows.reduce((sum, row) => sum + row.pub24h, 0),
        pub1h: rows.reduce((sum, row) => sum + row.pub1h, 0),
        activeSources24h: rows.reduce((sum, row) => sum + row.activeSources24h, 0),
      },
      countries: rows,
    };
    mapCountryMetricsCache = writeTimedCache(payload, MAP_COUNTRY_METRICS_CACHE_MS);
    return payload;
  } catch {
    const fallback = buildCountryMetricsFromPublicData();
    mapCountryMetricsCache = writeTimedCache(fallback, 15_000);
    return fallback;
  }
}

export async function readMapCountrySources(country: string): Promise<MapCountrySourcesResponse> {
  const countryKey = country.trim();
  const cached = readTimedCache(mapCountrySourcesCache.get(countryKey));
  if (cached) return cached;

  try {
    const rows = await readRecentSourceMetrics(`coalesce(nullif(trim(e.source), ''), '') <> ''`);
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
      const current = bySource.get(sourceKey);

      if (current) {
        current.pub24h += Number(row.pub24h || 0);
        current.pub1h += Number(row.pub1h || 0);
        current.fresh24h += Number(row.fresh24h || 0);
        current.late24h += Number(row.late24h || 0);
        current.firstSeen24h += Number(row.first_seen_24h || 0);
        continue;
      }

      const coord = inferSourceCoordinate(displaySource, country);
      bySource.set(sourceKey, {
        sourceId: buildMapSourceId(country, displaySource),
        source: displaySource,
        publisher: resolvePublisherName(displaySource, country),
        country,
        region: coord.region,
        city: coord.city,
        locationKind: coord.locationKind,
        lat: coord.lat,
        lon: coord.lon,
        pub24h: Number(row.pub24h || 0),
        pub1h: Number(row.pub1h || 0),
        fresh24h: Number(row.fresh24h || 0),
        late24h: Number(row.late24h || 0),
        firstSeen24h: Number(row.first_seen_24h || 0),
        method,
        health,
        rssUrl: meta?.rssUrl || null,
        sitemapUrl: meta?.sitemapUrl || null,
      });
    }

    const sourceRows: MapSourceMetricRow[] = [...bySource.values()]
      .sort((a, b) => b.pub24h - a.pub24h || a.source.localeCompare(b.source));

    const center = inferGeoFromTitle(country, country);
    const db = getPool();
    const hourlyResult = await db.query<HourlySqlRow>(
      `
      select
        to_char(date_trunc('hour', publication_datetime), 'YYYY-MM-DD\"T\"HH24:00:00\"Z\"') as hour_bucket,
        count(*)::text as count
      from news_articles
      where country = $1
        and publication_datetime >= now() - interval '24 hours'
        and coalesce(nullif(trim(title_quality), ''), 'ok') <> 'suspect'
      group by 1
      order by 1 asc
      `,
      [country]
    );
    const payload = {
      generatedAt: new Date().toISOString(),
      country,
      countryCode: getCountryCode(country),
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
      topSources: sourceRows.slice(0, 8).map((row) => ({ name: row.source, count: row.pub24h })),
      topPublishers: rankTopCounts(
        sourceRows.map((row) => ({ name: row.publisher || row.source, count: row.pub24h })),
        8
      ),
      topRegions: rankTopRegions(
        sourceRows.map((row) => ({
          name: row.locationKind === 'country-fallback' ? 'Unmapped / National' : buildAreaLabel(row),
          count: row.pub24h,
          sources: 1,
          unmapped: row.locationKind === 'country-fallback',
        })),
        8
      ),
      hourly24h: hourlyResult.rows.map((hour) => ({
        hour: hour.hour_bucket,
        count: Number(hour.count || 0),
      })),
      sources: sourceRows,
    };
    mapCountrySourcesCache.set(countryKey, writeTimedCache(payload, MAP_COUNTRY_SOURCES_CACHE_MS));
    return payload;
  } catch {
    const fallback = buildCountrySourcesFromPublicData(country);
    mapCountrySourcesCache.set(countryKey, writeTimedCache(fallback, 15_000));
    return fallback;
  }
}

export async function readMapSourceDetail(sourceName: string): Promise<MapSourceDetailResponse | null> {
  const sourceCacheKey = decodeURIComponent(sourceName).trim().toLowerCase();
  const cached = readTimedCache(mapSourceDetailCache.get(sourceCacheKey));
  if (cached !== null) return cached;

  try {
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
    const articles = await readNewsArticlesForApi({
      sourceNames: rawSourceNames,
      countries: countryHint ? [countryHint] : undefined,
      hours: 48,
      limit: 12,
    });
    const db = getPool();
    const hourlyResult = await db.query<HourlySqlRow>(
      `
      select
        to_char(date_trunc('hour', publication_datetime), 'YYYY-MM-DD\"T\"HH24:00:00\"Z\"') as hour_bucket,
        count(*)::text as count
      from news_articles
      where source = any($1::text[])
        and publication_datetime >= now() - interval '24 hours'
        and coalesce(nullif(trim(title_quality), ''), 'ok') <> 'suspect'
        ${countryHint ? `and country = $2` : ''}
      group by 1
      order by 1 asc
      `,
      countryHint ? [rawSourceNames, countryHint] : [rawSourceNames]
    );

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

    const payload = {
      generatedAt: new Date().toISOString(),
      sourceId: buildMapSourceId(country, normalizedSource),
      source: normalizedSource,
      publisher: resolvePublisherName(normalizedSource, country),
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
      hourly24h: hourlyResult.rows.map((hour) => ({
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
    mapSourceDetailCache.set(sourceCacheKey, writeTimedCache(payload, MAP_SOURCE_DETAIL_CACHE_MS));
    return payload;
  } catch {
    const fallback = buildSourceDetailFromPublicData(sourceName);
    mapSourceDetailCache.set(sourceCacheKey, writeTimedCache(fallback, 15_000));
    return fallback;
  }
}
