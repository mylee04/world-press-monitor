import 'server-only';

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { resolveDatabaseUrl } from '@/lib/database-url';
import { inferGeoFromTitle } from '@/lib/geo';
import { readNewsArticlesForApi } from '@/lib/ingestion-store';
import { resolvePublisherInfo, resolvePublisherName } from '@/lib/publisher-groups';
import { resolveSourceHeadquarters } from '@/lib/source-headquarters';
import { buildDisplaySourceName } from '@/lib/source-display';
import type {
  MapMetricWindow,
  MapCountryMetricsResponse,
  MapCountryMetricRow,
  MapPublisherConfidence,
  MapPublishersResponse,
  MapPublisherCountryRow,
  MapPublisherMetricRow,
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
const MAP_COUNTRY_METRICS_CACHE_MS = 60_000;
const MAP_COUNTRY_SOURCES_CACHE_MS = 60_000;
const MAP_SOURCE_DETAIL_CACHE_MS = 60_000;
const MAP_PUBLISHERS_CACHE_MS = 60_000;
const MAP_WINDOWS: MapMetricWindow[] = ['1h', '24h', '7d'];
const DEFAULT_MAP_WINDOW: MapMetricWindow = '24h';

type TimedCacheEntry<T> = {
  value: T;
  expiresAt: number;
};

let mapCountryMetricsCache = new Map<MapMetricWindow, TimedCacheEntry<MapCountryMetricsResponse>>();
let mapPublishersCache = new Map<MapMetricWindow, TimedCacheEntry<MapPublishersResponse>>();
const mapCountrySourcesCache = new Map<string, TimedCacheEntry<MapCountrySourcesResponse>>();
const mapSourceDetailCache = new Map<string, TimedCacheEntry<MapSourceDetailResponse | null>>();

type SourceMetricWindowSqlRow = {
  country: string | null;
  source: string;
  pub_1h: string;
  pub_24h: string;
  pub_7d: string;
  fresh_1h: string;
  fresh_24h: string;
  fresh_7d: string;
  late_1h: string;
  late_24h: string;
  late_7d: string;
  first_seen_1h: string;
  first_seen_24h: string;
  first_seen_7d: string;
};

type CountryWindowAccumulator = {
  published: number;
  fresh: number;
  late: number;
  firstSeen: number;
  activeSources: number;
  rssSources: number;
  sitemapSources: number;
  healthySources: number;
  degradedSources: number;
};

type PublisherWindowAccumulator = {
  published: number;
  activeCountries: number;
  activeSources: number;
  healthySources: number;
  degradedSources: number;
};

type PublisherConfidenceVotes = Record<MapPublisherConfidence, number>;

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

export function normalizeMapMetricWindow(value: string | null | undefined): MapMetricWindow {
  return value === '1h' || value === '7d' ? value : DEFAULT_MAP_WINDOW;
}

function emptyCountryWindowAccumulator(): CountryWindowAccumulator {
  return {
    published: 0,
    fresh: 0,
    late: 0,
    firstSeen: 0,
    activeSources: 0,
    rssSources: 0,
    sitemapSources: 0,
    healthySources: 0,
    degradedSources: 0,
  };
}

function emptyPublisherWindowAccumulator(): PublisherWindowAccumulator {
  return {
    published: 0,
    activeCountries: 0,
    activeSources: 0,
    healthySources: 0,
    degradedSources: 0,
  };
}

function emptyPublisherConfidenceVotes(): PublisherConfidenceVotes {
  return {
    high: 0,
    medium: 0,
    low: 0,
  };
}

function addPublisherConfidenceVote(votes: PublisherConfidenceVotes, confidence: MapPublisherConfidence): void {
  votes[confidence] += 1;
}

function mergePublisherConfidenceVotes(target: PublisherConfidenceVotes, source: PublisherConfidenceVotes): void {
  target.high += source.high;
  target.medium += source.medium;
  target.low += source.low;
}

function resolvePublisherConfidence(votes: PublisherConfidenceVotes): MapPublisherConfidence {
  const total = votes.high + votes.medium + votes.low;
  if (total <= 0) return 'low';
  const weightedScore = (votes.high * 3 + votes.medium * 2 + votes.low) / total;
  if (weightedScore >= 2.6) return 'high';
  if (weightedScore >= 1.6) return 'medium';
  return 'low';
}

function buildCountryWindowRecord(
  values: Partial<Record<MapMetricWindow, CountryWindowAccumulator>>
): Record<MapMetricWindow, MapCountryMetricRow['windows'][MapMetricWindow]> {
  return {
    '1h': toCountryWindowMetrics(values['1h']),
    '24h': toCountryWindowMetrics(values['24h']),
    '7d': toCountryWindowMetrics(values['7d']),
  };
}

function toCountryWindowMetrics(value?: CountryWindowAccumulator): MapCountryMetricRow['windows'][MapMetricWindow] {
  const current = value || emptyCountryWindowAccumulator();
  return {
    published: current.published,
    fresh: current.fresh,
    late: current.late,
    firstSeen: current.firstSeen,
    lateShare: current.firstSeen > 0 ? current.late / current.firstSeen : 0,
    activeSources: current.activeSources,
    rssSources: current.rssSources,
    sitemapSources: current.sitemapSources,
    healthySources: current.healthySources,
    degradedSources: current.degradedSources,
  };
}

function buildPublisherWindowRecord(
  values: Partial<Record<MapMetricWindow, PublisherWindowAccumulator>>
): Record<MapMetricWindow, MapPublisherMetricRow['windows'][MapMetricWindow]> {
  return {
    '1h': toPublisherWindowMetrics(values['1h']),
    '24h': toPublisherWindowMetrics(values['24h']),
    '7d': toPublisherWindowMetrics(values['7d']),
  };
}

function toPublisherWindowMetrics(value?: PublisherWindowAccumulator): MapPublisherMetricRow['windows'][MapMetricWindow] {
  const current = value || emptyPublisherWindowAccumulator();
  return {
    published: current.published,
    activeCountries: current.activeCountries,
    activeSources: current.activeSources,
    healthySources: current.healthySources,
    degradedSources: current.degradedSources,
  };
}

function buildPublisherCountryWindowRecord(
  values: Partial<Record<MapMetricWindow, PublisherWindowAccumulator>>
): Record<MapMetricWindow, MapPublisherCountryRow['windows'][MapMetricWindow]> {
  return {
    '1h': toPublisherCountryWindowMetrics(values['1h']),
    '24h': toPublisherCountryWindowMetrics(values['24h']),
    '7d': toPublisherCountryWindowMetrics(values['7d']),
  };
}

function toPublisherCountryWindowMetrics(value?: PublisherWindowAccumulator): MapPublisherCountryRow['windows'][MapMetricWindow] {
  const current = value || emptyPublisherWindowAccumulator();
  return {
    published: current.published,
    activeSources: current.activeSources,
    healthySources: current.healthySources,
    degradedSources: current.degradedSources,
  };
}

function buildCountryWindowsFromSqlRow(row: SourceMetricWindowSqlRow): Record<MapMetricWindow, CountryWindowAccumulator> {
  return {
    '1h': {
      published: Number(row.pub_1h || 0),
      fresh: Number(row.fresh_1h || 0),
      late: Number(row.late_1h || 0),
      firstSeen: Number(row.first_seen_1h || 0),
      activeSources: 0,
      rssSources: 0,
      sitemapSources: 0,
      healthySources: 0,
      degradedSources: 0,
    },
    '24h': {
      published: Number(row.pub_24h || 0),
      fresh: Number(row.fresh_24h || 0),
      late: Number(row.late_24h || 0),
      firstSeen: Number(row.first_seen_24h || 0),
      activeSources: 0,
      rssSources: 0,
      sitemapSources: 0,
      healthySources: 0,
      degradedSources: 0,
    },
    '7d': {
      published: Number(row.pub_7d || 0),
      fresh: Number(row.fresh_7d || 0),
      late: Number(row.late_7d || 0),
      firstSeen: Number(row.first_seen_7d || 0),
      activeSources: 0,
      rssSources: 0,
      sitemapSources: 0,
      healthySources: 0,
      degradedSources: 0,
    },
  };
}

function isCountryWindowActive(metrics: CountryWindowAccumulator): boolean {
  return metrics.published > 0 || metrics.firstSeen > 0;
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
  ['Vietnam', { name: 'Hanoi', lat: 21.0278, lon: 105.8342 }],
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
  ['Serbia', { name: 'Belgrade', lat: 44.7866, lon: 20.4489 }],
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

async function readWindowedSourceMetrics(
  window: MapMetricWindow = DEFAULT_MAP_WINDOW,
  whereSql?: string,
  params: unknown[] = []
): Promise<SourceMetricWindowSqlRow[]> {
  const db = getPool();
  const selectedWindow = normalizeMapMetricWindow(window);

  if (selectedWindow === '7d') {
    const result = await db.query<SourceMetricWindowSqlRow>(
      `
      with latest_days as (
        select distinct day_bucket
        from country_benchmark_source_daily
        where metric_version = 'v1'
        order by day_bucket desc
        limit 7
      )
      select
        s.country,
        s.source,
        '0'::text as pub_1h,
        '0'::text as pub_24h,
        coalesce(sum(s.published_count), 0)::text as pub_7d,
        '0'::text as fresh_1h,
        '0'::text as fresh_24h,
        coalesce(sum(s.fresh_count), 0)::text as fresh_7d,
        '0'::text as late_1h,
        '0'::text as late_24h,
        coalesce(sum(s.late_count), 0)::text as late_7d,
        '0'::text as first_seen_1h,
        '0'::text as first_seen_24h,
        coalesce(sum(s.inserted_count), 0)::text as first_seen_7d
      from country_benchmark_source_daily s
      where s.metric_version = 'v1'
        and s.day_bucket in (select day_bucket from latest_days)
        ${whereSql ? `and ${whereSql}` : ''}
      group by s.country, s.source
      having coalesce(sum(s.published_count), 0) > 0
          or coalesce(sum(s.inserted_count), 0) > 0
      `,
      params
    );
    if (result.rows.length > 0) return result.rows;
  }

  if (selectedWindow === '1h') {
    const result = await db.query<SourceMetricWindowSqlRow>(
      `
      select
        e.country,
        e.source,
        count(*) filter (where e.publication_datetime >= now() - interval '1 hour')::text as pub_1h,
        '0'::text as pub_24h,
        '0'::text as pub_7d,
        count(*) filter (
          where e.publication_datetime >= now() - interval '1 hour'
            and e.created_at >= now() - interval '1 hour'
        )::text as fresh_1h,
        '0'::text as fresh_24h,
        '0'::text as fresh_7d,
        count(*) filter (
          where e.created_at >= now() - interval '1 hour'
            and e.publication_datetime < now() - interval '1 hour'
        )::text as late_1h,
        '0'::text as late_24h,
        '0'::text as late_7d,
        count(*) filter (where e.created_at >= now() - interval '1 hour')::text as first_seen_1h,
        '0'::text as first_seen_24h,
        '0'::text as first_seen_7d
      from news_articles e
      where (
        e.publication_datetime >= now() - interval '1 hour'
        or e.created_at >= now() - interval '1 hour'
      )
        and coalesce(nullif(trim(e.title_quality), ''), 'ok') <> 'suspect'
        ${whereSql ? `and ${whereSql}` : ''}
      group by e.country, e.source
      having count(*) filter (where e.publication_datetime >= now() - interval '1 hour') > 0
          or count(*) filter (where e.created_at >= now() - interval '1 hour') > 0
      `,
      params
    );
    return result.rows;
  }

  const result = await db.query<SourceMetricWindowSqlRow>(
    `
    select
      e.country,
      e.source,
      count(*) filter (where e.publication_datetime >= now() - interval '1 hour')::text as pub_1h,
      count(*) filter (where e.publication_datetime >= now() - interval '24 hours')::text as pub_24h,
      '0'::text as pub_7d,
      count(*) filter (
        where e.publication_datetime >= now() - interval '1 hour'
          and e.created_at >= now() - interval '1 hour'
      )::text as fresh_1h,
      count(*) filter (
        where e.publication_datetime >= now() - interval '24 hours'
          and e.created_at >= now() - interval '24 hours'
      )::text as fresh_24h,
      '0'::text as fresh_7d,
      count(*) filter (
        where e.created_at >= now() - interval '1 hour'
          and e.publication_datetime < now() - interval '1 hour'
      )::text as late_1h,
      count(*) filter (
        where e.created_at >= now() - interval '24 hours'
          and e.publication_datetime < now() - interval '24 hours'
      )::text as late_24h,
      '0'::text as late_7d,
      count(*) filter (where e.created_at >= now() - interval '1 hour')::text as first_seen_1h,
      count(*) filter (where e.created_at >= now() - interval '24 hours')::text as first_seen_24h,
      '0'::text as first_seen_7d
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

export async function readMapCountryMetrics(window: MapMetricWindow = DEFAULT_MAP_WINDOW): Promise<MapCountryMetricsResponse> {
  const selectedWindow = normalizeMapMetricWindow(window);
  const cached = readTimedCache(mapCountryMetricsCache.get(selectedWindow));
  if (cached) return cached;

  try {
    const metricRows = await readWindowedSourceMetrics(selectedWindow, `coalesce(nullif(trim(country), ''), '') <> ''`);
    const healthBySource = await readLatestHealthBySource();
    const byCountrySource = new Map<string, {
      country: string;
      source: string;
      windows: Record<MapMetricWindow, CountryWindowAccumulator>;
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

    const payload = {
      generatedAt: new Date().toISOString(),
      storage: 'postgres' as const,
      window: selectedWindow,
      totals: {
        countries: rows.length,
        pub24h: rows.reduce((sum, row) => sum + row.pub24h, 0),
        pub1h: rows.reduce((sum, row) => sum + row.pub1h, 0),
        activeSources24h: rows.reduce((sum, row) => sum + row.activeSources24h, 0),
        windows: buildCountryWindowRecord(totalWindowsAcc),
      },
      countries: rows,
    };
    mapCountryMetricsCache.set(selectedWindow, writeTimedCache(payload, MAP_COUNTRY_METRICS_CACHE_MS));
    return payload;
  } catch (error: unknown) {
    throw error;
  }
}

export async function readMapPublishers(window: MapMetricWindow = DEFAULT_MAP_WINDOW): Promise<MapPublishersResponse> {
  const selectedWindow = normalizeMapMetricWindow(window);
  const cached = readTimedCache(mapPublishersCache.get(selectedWindow));
  if (cached) return cached;

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

  const payload = {
    generatedAt: new Date().toISOString(),
    storage: 'postgres' as const,
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
  mapPublishersCache.set(selectedWindow, writeTimedCache(payload, MAP_PUBLISHERS_CACHE_MS));
  return payload;
}

export async function readMapCountrySources(
  country: string,
  window: MapMetricWindow = DEFAULT_MAP_WINDOW
): Promise<MapCountrySourcesResponse> {
  const selectedWindow = normalizeMapMetricWindow(window);
  const countryKey = `${country.trim()}::${selectedWindow}`;
  const cached = readTimedCache(mapCountrySourcesCache.get(countryKey));
  if (cached) return cached;

  try {
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

      const coord = inferSourceCoordinate(displaySource, country);
      const publisherInfo = resolvePublisherInfo(displaySource, country);
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
    const dailyResult = await db.query<{ day_bucket: string; published_count: string }>(
      `
      select
        day_bucket::text,
        published_count::text
      from country_benchmark_daily
      where country = $1
        and metric_version = 'v1'
      order by day_bucket desc
      limit 7
      `,
      [country]
    );
    const payload = {
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
      hourly24h: hourlyResult.rows.map((hour) => ({
        hour: hour.hour_bucket,
        count: Number(hour.count || 0),
      })),
      daily7d: [...dailyResult.rows]
        .reverse()
        .map((day) => ({
          day: day.day_bucket,
          count: Number(day.published_count || 0),
        })),
      sources: sourceRows,
    };
    mapCountrySourcesCache.set(countryKey, writeTimedCache(payload, MAP_COUNTRY_SOURCES_CACHE_MS));
    return payload;
  } catch (error: unknown) {
    throw error;
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
    const publisherInfo = resolvePublisherInfo(normalizedSource, country);
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
  } catch (error: unknown) {
    throw error;
  }
}
