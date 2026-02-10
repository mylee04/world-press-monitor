import { NextRequest } from 'next/server';
import { Redis } from '@upstash/redis';
import { OUTLET_BY_ID, OUTLET_FEEDS } from '@/data/outlets';
import { classifyBeatByKeyword } from '@/lib/keyword-classifier';
import { inferGeoFromTitle } from '@/lib/geo';
import { parseRssOrAtom } from '@/lib/parsers';
import { isCoolingDown, markFailure, markSuccess } from '@/lib/circuit-breaker';
import {
  persistExternalNewsArticles,
  persistIngestionDiagnostics,
  readExternalNewsArticles,
  readIngestedArticles,
  readLatestIngestionDiagnostics,
  type IngestionEndpointRun
} from '@/lib/ingestion-store';
import {
  newsCacheMetricHitMemory,
  newsCacheMetricHitRedis,
  newsCacheMetricMissMemory,
  newsCacheMetricMissNoRedis,
  newsCacheMetricMissRedis,
  newsCacheMetricRequest,
  newsCacheMetricSkipRedisNoRedis,
  newsCacheMetricSkipRedisPayloadTooLarge,
  newsCacheMetricWriteMemory,
  newsCacheMetricWriteRedis,
  newsCacheMetricWriteRedisFailed,
} from '@/lib/news-cache-metrics';
import type { NewsItem, OutletFeed } from '@/lib/types';

export const runtime = 'nodejs';

const COUNTRY_CODE_TO_NAME: Record<string, string> = {
  US: 'United States',
  UK: 'United Kingdom',
  QA: 'Qatar',
  SA: 'Saudi Arabia',
  UA: 'Ukraine',
  RU: 'Russia',
  ZA: 'South Africa',
  HK: 'China',
  SG: 'Singapore',
  IN: 'India',
  FR: 'France',
  ES: 'Spain',
  IT: 'Italy',
  JP: 'Japan',
  KR: 'South Korea'
};

type FetchMethod = 'rss' | 'sitemap';

interface FetchDiagnostic {
  outletId: string;
  source: string;
  method: FetchMethod;
  attempted: boolean;
  circuitOpen: boolean;
  ok: boolean;
  statusCode: number | null;
  parsedCount: number;
  parsedLimit: number;
  sampleCapped: boolean;
  recent24h: number;
  url?: string;
  error?: string;
}

interface OutletFetchResult {
  items: NewsItem[];
  diagnostic: FetchDiagnostic;
}

interface NewsResponsePayload {
  generatedAt: string;
  count: number;
  items: NewsItem[];
  ingestion: {
    totalOutlets: number;
    totalEndpoints: number;
    okEndpoints: number;
    failedEndpoints: number;
    circuitOpenEndpoints: number;
    sampleCappedEndpoints: number;
    diagnostics: FetchDiagnostic[];
  };
  persistence?: {
    storage: 'postgres' | 'disabled';
    persisted: number;
    error?: string;
    reason?: string;
    externalPersisted?: number;
  };
}

interface MemoryCacheEntry {
  expiresAt: number;
  payload: NewsResponsePayload;
}

interface ArticleTimeCacheEntry {
  expiresAt: number;
  publishedAt: string | null;
  summary: string | null;
}

let redisClient: Redis | null = null;
let redisFailed = false;
const memoryNewsCache = new Map<string, MemoryCacheEntry>();
const memoryArticleTimeCache = new Map<string, ArticleTimeCacheEntry>();

const DAY_MS = 24 * 60 * 60 * 1000;
const RSS_ITEM_LIMIT = 120;
const SITEMAP_ITEM_LIMIT = 80;
const WORLD_PORTAL_RSS_LIMIT = 60;
const WORLD_PORTAL_SITEMAP_LIMIT = 40;
const DEFAULT_RESPONSE_ITEM_LIMIT = 15000;
const MAX_RESPONSE_ITEM_LIMIT = 20000;
const NEWS_CACHE_TTL_SECONDS = 120;
const MEMORY_CACHE_MAX_ENTRIES = 24;
const REDIS_CACHE_MAX_PAYLOAD_BYTES = 1_500_000;
const GNEWS_API_URL = 'https://gnews.io/api/v4/search';
const GNEWS_ITEM_LIMIT = 10;
const ARTICLE_TIME_CACHE_TTL_SECONDS = 60 * 60 * 24;
const ARTICLE_TIME_FETCH_TIMEOUT_MS = 3500;
const ARTICLE_TIME_MAX_ITEMS = 80;
const ARTICLE_TIME_MAX_DIFF_MS = 7 * DAY_MS;
const ENDPOINT_FETCH_CONCURRENCY = Math.max(
  4,
  Math.min(120, Number.parseInt(process.env.NEWS_FETCH_CONCURRENCY || '40', 10) || 40)
);
const DB_READ_ENABLED_BY_DEFAULT = process.env.NEWS_DB_READ_ENABLED !== 'false';
const DB_READ_MODEL = (process.env.NEWS_DB_READ_MODEL || 'external').toLowerCase();
const PROD_READ_ONLY = process.env.NEWS_PROD_READ_ONLY === 'true';
const LIVE_FALLBACK_ENABLED = process.env.NEWS_LIVE_FALLBACK_ENABLED !== 'false';
const WRITE_INGESTED_COMPAT = process.env.NEWS_WRITE_INGESTED_COMPAT === 'true';
const DB_READ_WINDOW_HOURS = Math.max(
  6,
  Math.min(168, Number.parseInt(process.env.NEWS_DB_READ_WINDOW_HOURS || '48', 10) || 48)
);
const LATAM_COUNTRIES = new Set(['LATAM', 'Argentina', 'Chile', 'Uruguay']);
const LATAM_ENTITY_TERMS = [
  'argentina',
  'argentine',
  'buenos aires',
  'chile',
  'chilean',
  'santiago',
  'uruguay',
  'uruguayan',
  'montevideo',
  'mercosur',
  'patagonia',
  'rio de la plata',
  'southern cone',
  'latam',
  'latin america',
  'latinoamerica',
  'america latina',
];
const BREAKING_TERMS = [
  'breaking',
  'urgent',
  'developing',
  'just in',
  'ultima hora',
  'última hora',
  'urgente',
  'en vivo',
  'ahora',
  'flash'
];

const ARTICLE_TIME_META_REGEXES = [
  /<meta[^>]+(?:property|name)=["']article:published_time["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  /<meta[^>]+(?:property|name)=["']og:published_time["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  /<meta[^>]+(?:property|name)=["']parsely-pub-date["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  /<meta[^>]+(?:property|name)=["']pubdate["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  /<meta[^>]+(?:property|name)=["']date["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  /<meta[^>]+(?:property|name)=["']dc.date["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  /<time[^>]+datetime=["']([^"']+)["'][^>]*>/i,
  /"datePublished"\s*:\s*"([^"]+)"/i,
  /"dateCreated"\s*:\s*"([^"]+)"/i
];
const ARTICLE_SUMMARY_META_REGEXES = [
  /<meta[^>]+(?:property|name)=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  /<meta[^>]+(?:property|name)=["']twitter:description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  /<meta[^>]+(?:property|name)=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i
];

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isLikelyBreakingText(text: string): boolean {
  const normalized = normalizeText(text);
  return BREAKING_TERMS.some((term) => normalized.includes(term));
}

function detectLatamFromTitle(title: string, locationName?: string): boolean {
  const normalized = normalizeText(`${title} ${locationName || ''}`);
  return LATAM_ENTITY_TERMS.some((term) => normalized.includes(term));
}

function isLatamCountry(country?: string): boolean {
  if (!country) return false;
  return LATAM_COUNTRIES.has(country);
}

function annotateWorldLatam(item: NewsItem): NewsItem {
  const latamByCountry = isLatamCountry(item.country);
  const latamByEntity = detectLatamFromTitle(item.title, item.locationName);
  const worldLatam = latamByCountry || latamByEntity;
  const breaking = isLikelyBreakingText(`${item.title} ${item.classificationReason || ''}`);
  const tags = [...new Set([...(item.tags || []), ...(worldLatam ? ['world_latam'] : []), ...(breaking ? ['breaking'] : [])])];
  return {
    ...item,
    worldLatam,
    tags
  };
}

function rssItemLimitFor(outlet: OutletFeed): number {
  if (
    (outlet.sourceType || 'global') === 'portal'
    && outlet.beat === 'world'
    && /Google State:|Bing State:|Google Metro:|Bing Metro:|Google US World Topic|Google LATAM Regional Topic|Bing LATAM Topic|Bing US World Topic/i.test(outlet.name)
  ) {
    return WORLD_PORTAL_RSS_LIMIT;
  }
  return RSS_ITEM_LIMIT;
}

function sitemapItemLimitFor(outlet: OutletFeed): number {
  if (
    (outlet.sourceType || 'global') === 'portal'
    && outlet.beat === 'world'
    && /Google State:|Bing State:|Google Metro:|Bing Metro:|Google US World Topic|Google LATAM Regional Topic|Bing LATAM Topic|Bing US World Topic/i.test(outlet.name)
  ) {
    return WORLD_PORTAL_SITEMAP_LIMIT;
  }
  return SITEMAP_ITEM_LIMIT;
}

function countRecent24h(items: Array<{ publishedAt: string }>): number {
  const cutoff = Date.now() - DAY_MS;
  return items.filter((item) => {
    const ts = new Date(item.publishedAt).getTime();
    return Number.isFinite(ts) && ts >= cutoff;
  }).length;
}

function normalizeCountryName(country: string): string {
  return COUNTRY_CODE_TO_NAME[country] || country;
}

function getRedis(): Redis | null {
  if (redisClient) return redisClient;
  if (redisFailed) return null;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    redisClient = new Redis({ url, token });
    return redisClient;
  } catch {
    redisFailed = true;
    return null;
  }
}

async function sha256(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function pruneMemoryNewsCache(now: number): void {
  for (const [key, entry] of memoryNewsCache.entries()) {
    if (entry.expiresAt <= now) memoryNewsCache.delete(key);
  }
  while (memoryNewsCache.size > MEMORY_CACHE_MAX_ENTRIES) {
    const oldest = memoryNewsCache.keys().next().value as string | undefined;
    if (!oldest) break;
    memoryNewsCache.delete(oldest);
  }
}

async function buildNewsCacheKey(
  outletIds: string[],
  responseLimit: number,
  variant: 'full' | 'db'
): Promise<string> {
  const normalizedOutlets = [...new Set(outletIds)].sort().join(',');
  const signature = await sha256(`v3|${variant}|${responseLimit}|${normalizedOutlets}`);
  return `presslab:news:${signature}`;
}

async function getCachedNewsPayload(cacheKey: string): Promise<NewsResponsePayload | null> {
  const now = Date.now();
  const memoryEntry = memoryNewsCache.get(cacheKey);
  if (memoryEntry && memoryEntry.expiresAt > now) {
    newsCacheMetricHitMemory();
    console.log(`[cache] news hit memory key=${cacheKey}`);
    return memoryEntry.payload;
  }
  newsCacheMetricMissMemory();
  if (memoryEntry) {
    memoryNewsCache.delete(cacheKey);
  }

  const redis = getRedis();
  if (!redis) {
    newsCacheMetricMissNoRedis();
    console.log(`[cache] news miss key=${cacheKey} (no redis configured)`);
    return null;
  }
  try {
    const cached = await redis.get<NewsResponsePayload>(cacheKey);
    if (!cached) {
      newsCacheMetricMissRedis();
      console.log(`[cache] news miss key=${cacheKey} (redis miss)`);
      return null;
    }
    newsCacheMetricHitRedis();
    console.log(`[cache] news hit redis key=${cacheKey}`);
    memoryNewsCache.set(cacheKey, {
      expiresAt: now + NEWS_CACHE_TTL_SECONDS * 1000,
      payload: cached
    });
    pruneMemoryNewsCache(now);
    return cached;
  } catch {
    return null;
  }
}

async function setCachedNewsPayload(cacheKey: string, payload: NewsResponsePayload): Promise<void> {
  const now = Date.now();
  memoryNewsCache.set(cacheKey, {
    expiresAt: now + NEWS_CACHE_TTL_SECONDS * 1000,
    payload
  });
  newsCacheMetricWriteMemory();
  console.log(`[cache] news write memory key=${cacheKey}`);
  pruneMemoryNewsCache(now);

  const serialized = JSON.stringify(payload);
  if (serialized.length > REDIS_CACHE_MAX_PAYLOAD_BYTES) {
    newsCacheMetricSkipRedisPayloadTooLarge();
    console.log(`[cache] news skip redis key=${cacheKey} reason=payload_too_large bytes=${serialized.length}`);
    return;
  }

  const redis = getRedis();
  if (!redis) {
    newsCacheMetricSkipRedisNoRedis();
    console.log(`[cache] news skip redis key=${cacheKey} reason=no_redis`);
    return;
  }
  try {
    await redis.set(cacheKey, payload, { ex: NEWS_CACHE_TTL_SECONDS });
    newsCacheMetricWriteRedis();
    console.log(`[cache] news write redis key=${cacheKey}`);
  } catch {
    newsCacheMetricWriteRedisFailed();
    console.log(`[cache] news write redis failed key=${cacheKey}`);
  }
}

function normalizeMetaPublishedAt(value: string): string | null {
  const raw = (value || '').trim();
  if (!raw) return null;
  const ts = new Date(raw).getTime();
  if (!Number.isFinite(ts)) return null;
  return new Date(ts).toISOString();
}

function extractPublishedAtFromHtml(html: string): string | null {
  for (const regex of ARTICLE_TIME_META_REGEXES) {
    const match = html.match(regex);
    if (!match || !match[1]) continue;
    const normalized = normalizeMetaPublishedAt(match[1]);
    if (normalized) return normalized;
  }
  return null;
}

function extractSummaryFromHtml(html: string): string | null {
  for (const regex of ARTICLE_SUMMARY_META_REGEXES) {
    const match = html.match(regex);
    if (!match || !match[1]) continue;
    const text = match[1]
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();
    if (text) return text.slice(0, 1600);
  }
  return null;
}

function pruneMemoryArticleTimeCache(now: number): void {
  for (const [key, entry] of memoryArticleTimeCache.entries()) {
    if (entry.expiresAt <= now) memoryArticleTimeCache.delete(key);
  }
  while (memoryArticleTimeCache.size > 1024) {
    const oldest = memoryArticleTimeCache.keys().next().value as string | undefined;
    if (!oldest) break;
    memoryArticleTimeCache.delete(oldest);
  }
}

async function getCachedArticleMetadata(cacheKey: string): Promise<{ publishedAt: string | null; summary: string | null } | undefined> {
  const now = Date.now();
  const memoryEntry = memoryArticleTimeCache.get(cacheKey);
  if (memoryEntry && memoryEntry.expiresAt > now) {
    return {
      publishedAt: memoryEntry.publishedAt,
      summary: memoryEntry.summary
    };
  }
  if (memoryEntry) {
    memoryArticleTimeCache.delete(cacheKey);
  }

  const redis = getRedis();
  if (!redis) return undefined;
  try {
    const cached = await redis.get<{ publishedAt: string | null; summary: string | null }>(cacheKey);
    if (cached === null) return undefined;
    memoryArticleTimeCache.set(cacheKey, {
      expiresAt: now + ARTICLE_TIME_CACHE_TTL_SECONDS * 1000,
      publishedAt: cached.publishedAt || null,
      summary: cached.summary || null
    });
    pruneMemoryArticleTimeCache(now);
    return {
      publishedAt: cached.publishedAt || null,
      summary: cached.summary || null
    };
  } catch {
    return undefined;
  }
}

async function setCachedArticleMetadata(cacheKey: string, metadata: { publishedAt: string | null; summary: string | null }): Promise<void> {
  const now = Date.now();
  memoryArticleTimeCache.set(cacheKey, {
    expiresAt: now + ARTICLE_TIME_CACHE_TTL_SECONDS * 1000,
    publishedAt: metadata.publishedAt,
    summary: metadata.summary
  });
  pruneMemoryArticleTimeCache(now);

  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(cacheKey, metadata, { ex: ARTICLE_TIME_CACHE_TTL_SECONDS });
  } catch {
    // Ignore cache write failure
  }
}

async function fetchArticleMetadata(link: string): Promise<{ publishedAt: string | null; summary: string | null }> {
  const cacheKey = `presslab:article-time:${await sha256(link)}`;
  const cached = await getCachedArticleMetadata(cacheKey);
  if (cached !== undefined) return cached;

  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), ARTICLE_TIME_FETCH_TIMEOUT_MS);
    const response = await fetch(link, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'PressLabBot/1.0 (+https://presslab.local)'
      },
      next: { revalidate: 600 }
    });
    clearTimeout(timeout);
    timeout = null;
    if (!response.ok) {
      const value = { publishedAt: null, summary: null };
      await setCachedArticleMetadata(cacheKey, value);
      return value;
    }
    const html = await response.text();
    const parsed = {
      publishedAt: extractPublishedAtFromHtml(html),
      summary: extractSummaryFromHtml(html)
    };
    await setCachedArticleMetadata(cacheKey, parsed);
    return parsed;
  } catch {
    const value = { publishedAt: null, summary: null };
    await setCachedArticleMetadata(cacheKey, value);
    return value;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function enrichPublishedAtFromArticleMeta(items: NewsItem[]): Promise<NewsItem[]> {
  const enabled = process.env.ARTICLE_TIME_ENRICH_ENABLED !== 'false';
  if (!enabled) return items;

  const maxItems = Math.max(
    0,
    Math.min(
      ARTICLE_TIME_MAX_ITEMS,
      Number.parseInt(process.env.ARTICLE_TIME_ENRICH_MAX_ITEMS || `${ARTICLE_TIME_MAX_ITEMS}`, 10) || ARTICLE_TIME_MAX_ITEMS
    )
  );
  if (maxItems === 0 || items.length === 0) return items;

  const targets = items.slice(0, maxItems);
  const enriched = await Promise.all(
    targets.map(async (item) => {
      const articleMeta = await fetchArticleMetadata(item.link);
      if (!articleMeta.publishedAt && !articleMeta.summary) return item;

      let next = { ...item };
      if (articleMeta.summary) {
        next = {
          ...next,
          description: articleMeta.summary,
          summarySource: 'article_meta' as const
        };
      }
      if (!articleMeta.publishedAt) return next;

      const sourceTs = new Date(item.publishedAt).getTime();
      const metaTs = new Date(articleMeta.publishedAt).getTime();
      if (!Number.isFinite(sourceTs) || !Number.isFinite(metaTs)) return next;

      // Guard against accidental wrong extraction (e.g. stale template times).
      if (Math.abs(metaTs - sourceTs) > ARTICLE_TIME_MAX_DIFF_MS) return next;

      return {
        ...next,
        publishedAt: articleMeta.publishedAt,
        publicationSource: 'article_meta' as const
      };
    })
  );

  if (items.length <= maxItems) return enriched;
  return [...enriched, ...items.slice(maxItems)];
}

async function getBusinessRadarFallback(): Promise<NewsItem[]> {
  const apiUrl = process.env.BUSINESS_RADAR_API_URL;
  const apiKey = process.env.BUSINESS_RADAR_API_KEY;
  if (!apiUrl || !apiKey) return [];

  try {
    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      next: { revalidate: 300 }
    });

    if (!response.ok) return [];
    const data = await response.json() as { articles?: Array<{ title: string; url: string; source?: string; publishedAt?: string; beat?: string }> };
    return (data.articles || []).slice(0, 30).map((article) => {
      const keyword = classifyBeatByKeyword(article.title, 'business');
      const geo = inferGeoFromTitle(article.title);
      const newsItem = {
        id: article.url,
        title: article.title,
        link: article.url,
        source: article.source || 'Business Radar',
        language: 'en',
        sourceType: 'global',
        tier: 2,
        publishedAt: article.publishedAt || new Date().toISOString(),
        beat: keyword.beat,
        confidence: keyword.confidence,
        classificationSource: keyword.source,
        classificationReason: keyword.reason,
        ...geo
      } satisfies NewsItem;
      return annotateWorldLatam(newsItem);
    });
  } catch {
    return [];
  }
}

function inferCountryFromText(text: string): string {
  const normalized = normalizeText(text);
  if (normalized.includes('argentina') || normalized.includes('buenos aires')) return 'Argentina';
  if (normalized.includes('chile') || normalized.includes('santiago')) return 'Chile';
  if (normalized.includes('uruguay') || normalized.includes('montevideo')) return 'Uruguay';
  if (normalized.includes('mexico')) return 'Mexico';
  if (normalized.includes('united states') || normalized.includes(' usa ') || normalized.includes(' us ')) return 'United States';
  if (normalized.includes('latam') || normalized.includes('latin america') || normalized.includes('latinoamerica')) return 'LATAM';
  return 'Global';
}

function inferCountryFromLink(link: string): string | null {
  const host = (() => {
    try {
      return new URL(link).hostname.toLowerCase();
    } catch {
      return '';
    }
  })();
  if (!host) return null;
  if (host.endsWith('.ar')) return 'Argentina';
  if (host.endsWith('.cl')) return 'Chile';
  if (host.endsWith('.uy')) return 'Uruguay';
  if (host.endsWith('.mx')) return 'Mexico';
  if (host.endsWith('.us')) return 'United States';
  return null;
}

function normalizeLanguageCode(value?: string): string | undefined {
  const v = (value || '').trim().toLowerCase();
  if (!v) return undefined;
  if (v === 'es' || v.startsWith('es-')) return 'es';
  if (v === 'en' || v.startsWith('en-')) return 'en';
  if (v === 'pt' || v.startsWith('pt-')) return 'pt';
  if (v === 'fr' || v.startsWith('fr-')) return 'fr';
  return v.slice(0, 2);
}

function inferLanguageFromText(text: string, country?: string): string {
  const normalized = normalizeText(text);
  const hasSpanishHints = /[áéíóúñü¿¡]/i.test(text)
    || normalized.includes(' el ')
    || normalized.includes(' la ')
    || normalized.includes(' de ')
    || normalized.includes(' en vivo')
    || normalized.includes('ultima hora')
    || normalized.includes('última hora');
  if (hasSpanishHints) return 'es';
  const c = (country || '').toLowerCase();
  if (c === 'argentina' || c === 'chile' || c === 'uruguay' || c === 'mexico' || c === 'latam') return 'es';
  if (c === 'united states') return 'en';
  return 'en';
}

function applyLocaleDetection(item: NewsItem): NewsItem {
  const countryFromLink = inferCountryFromLink(item.link);
  const countryFromText = inferCountryFromText(`${item.title} ${item.description || ''} ${item.link}`);
  const country =
    item.country && item.country !== 'Global'
      ? item.country
      : countryFromLink || (countryFromText !== 'Global' ? countryFromText : item.country || 'Global');

  const language = normalizeLanguageCode(item.language)
    || inferLanguageFromText(`${item.title} ${item.description || ''}`, country);

  return {
    ...item,
    country,
    language
  };
}

async function getGnewsBreakingOverlay(): Promise<NewsItem[]> {
  const apiKey = process.env.GNEWS_API_KEY;
  const enabled = process.env.GNEWS_BREAKING_ENABLED !== 'false';
  if (!apiKey || !enabled) return [];

  const since = new Date(Date.now() - DAY_MS).toISOString();
  const queries = [
    {
      lang: 'en',
      q: '(breaking OR urgent OR developing OR "just in") AND (US OR "United States" OR Argentina OR Chile OR Uruguay OR Mexico OR LATAM OR "Latin America")'
    },
    {
      lang: 'es',
      q: '("ultima hora" OR "última hora" OR urgente OR "en vivo") AND (Argentina OR Chile OR Uruguay OR Mexico OR Latinoamerica OR LATAM)'
    }
  ];

  const batches = await Promise.all(
    queries.map(async ({ lang, q }) => {
      const url = new URL(GNEWS_API_URL);
      url.searchParams.set('apikey', apiKey);
      url.searchParams.set('q', q);
      url.searchParams.set('lang', lang);
      url.searchParams.set('max', String(GNEWS_ITEM_LIMIT));
      url.searchParams.set('sortby', 'publishedAt');
      url.searchParams.set('from', since);

      const response = await fetch(url.toString(), { next: { revalidate: 120 } });
      if (!response.ok) return [];

      const payload = await response.json() as {
        articles?: Array<{
          title?: string;
          description?: string;
          url?: string;
          publishedAt?: string;
          source?: { name?: string };
        }>;
      };
      return payload.articles || [];
    })
  ).catch(() => []);

  const merged = batches.flat();
  return merged
    .map((article) => {
      const title = (article.title || '').trim();
      const link = (article.url || '').trim();
      const publishedAt = article.publishedAt ? new Date(article.publishedAt).toISOString() : '';
      if (!title || !link || !publishedAt) return null;

      const fallbackCountry = inferCountryFromText(`${title} ${article.description || ''} ${link}`);
      const geo = inferGeoFromTitle(title, fallbackCountry);
      const classification = classifyBeatByKeyword(title, 'world');
      const item = {
        id: link,
        title,
        description: article.description || '',
        link,
        source: `GNews • ${article.source?.name || 'Breaking Desk'}`,
        language: /[áéíóúñ]/i.test(`${title} ${article.description || ''}`) ? 'es' : 'en',
        sourceType: 'portal' as const,
        tier: 2 as const,
        publishedAt,
        beat: classification.beat,
        confidence: classification.confidence,
        classificationSource: classification.source,
        classificationReason: classification.reason,
        publicationSource: 'feed' as const,
        summarySource: article.description ? 'feed' as const : undefined,
        ...geo
      } satisfies NewsItem;
      return annotateWorldLatam(item);
    })
    .filter((item): item is NewsItem => Boolean(item));
}

async function fetchOutletRss(origin: string, outlet: OutletFeed): Promise<OutletFetchResult> {
  if (!outlet.rssUrl) {
    return {
      items: [],
      diagnostic: {
        outletId: outlet.id,
        source: outlet.name,
        method: 'rss',
        attempted: false,
        circuitOpen: false,
        ok: false,
        statusCode: null,
        parsedCount: 0,
        parsedLimit: 0,
        sampleCapped: false,
        recent24h: 0
      }
    };
  }
  if (isCoolingDown(outlet.id)) {
    return {
      items: [],
      diagnostic: {
        outletId: outlet.id,
        source: outlet.name,
        method: 'rss',
        attempted: true,
        circuitOpen: true,
        ok: false,
        statusCode: null,
        parsedCount: 0,
        parsedLimit: 0,
        sampleCapped: false,
        recent24h: 0,
        url: outlet.rssUrl,
        error: 'circuit_open'
      }
    };
  }

  try {
    const parseLimit = rssItemLimitFor(outlet);
    const proxyUrl = `${origin}/api/rss-proxy?url=${encodeURIComponent(outlet.rssUrl)}`;
    const response = await fetch(proxyUrl, { next: { revalidate: 300 } });
    if (!response.ok) {
      markFailure(outlet.id);
      return {
        items: [],
        diagnostic: {
          outletId: outlet.id,
          source: outlet.name,
          method: 'rss',
          attempted: true,
          circuitOpen: false,
          ok: false,
          statusCode: response.status,
          parsedCount: 0,
          parsedLimit: parseLimit,
          sampleCapped: false,
          recent24h: 0,
          url: outlet.rssUrl,
          error: `http_${response.status}`
        }
      };
    }

    const xml = await response.text();
    const parsed = parseRssOrAtom(xml, parseLimit);
    const items = parsed.map((item) => {
      const classification = classifyBeatByKeyword(item.title, outlet.beat);
      const normalizedCountry = normalizeCountryName(outlet.country);
      const geo = inferGeoFromTitle(item.title, normalizedCountry);
      const newsItem = {
        id: item.link,
        outletId: outlet.id,
        title: item.title,
        description: item.description || '',
        link: item.link,
        source: outlet.name,
        language: outlet.language || 'en',
        sourceType: outlet.sourceType || 'global',
        tier: outlet.tier,
        publishedAt: item.publishedAt,
        beat: classification.beat,
        confidence: classification.confidence,
        classificationSource: classification.source,
        classificationReason: classification.reason,
        publicationSource: 'feed' as const,
        summarySource: item.description ? 'feed' as const : undefined,
        ...geo
      } satisfies NewsItem;
      return annotateWorldLatam(newsItem);
    });

    markSuccess(outlet.id);
    return {
      items,
      diagnostic: {
        outletId: outlet.id,
        source: outlet.name,
        method: 'rss',
        attempted: true,
        circuitOpen: false,
        ok: true,
        statusCode: 200,
        parsedCount: parsed.length,
        parsedLimit: parseLimit,
        sampleCapped: parsed.length >= parseLimit,
        recent24h: countRecent24h(parsed),
        url: outlet.rssUrl
      }
    };
  } catch (error) {
    markFailure(outlet.id);
    return {
      items: [],
      diagnostic: {
        outletId: outlet.id,
        source: outlet.name,
        method: 'rss',
        attempted: true,
        circuitOpen: false,
        ok: false,
        statusCode: null,
        parsedCount: 0,
        parsedLimit: 0,
        sampleCapped: false,
        recent24h: 0,
        url: outlet.rssUrl,
        error: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

async function fetchOutletSitemap(origin: string, outlet: OutletFeed): Promise<OutletFetchResult> {
  if (!outlet.sitemapUrl) {
    return {
      items: [],
      diagnostic: {
        outletId: outlet.id,
        source: outlet.name,
        method: 'sitemap',
        attempted: false,
        circuitOpen: false,
        ok: false,
        statusCode: null,
        parsedCount: 0,
        parsedLimit: 0,
        sampleCapped: false,
        recent24h: 0
      }
    };
  }
  const key = `${outlet.id}:sitemap`;
  if (isCoolingDown(key)) {
    return {
      items: [],
      diagnostic: {
        outletId: outlet.id,
        source: outlet.name,
        method: 'sitemap',
        attempted: true,
        circuitOpen: true,
        ok: false,
        statusCode: null,
        parsedCount: 0,
        parsedLimit: 0,
        sampleCapped: false,
        recent24h: 0,
        url: outlet.sitemapUrl,
        error: 'circuit_open'
      }
    };
  }

  try {
    const parseLimit = sitemapItemLimitFor(outlet);
    const response = await fetch(`${origin}/api/sitemap?url=${encodeURIComponent(outlet.sitemapUrl)}`, { next: { revalidate: 300 } });
    if (!response.ok) {
      markFailure(key);
      return {
        items: [],
        diagnostic: {
          outletId: outlet.id,
          source: outlet.name,
          method: 'sitemap',
          attempted: true,
          circuitOpen: false,
          ok: false,
          statusCode: response.status,
          parsedCount: 0,
          parsedLimit: parseLimit,
          sampleCapped: false,
          recent24h: 0,
          url: outlet.sitemapUrl,
          error: `http_${response.status}`
        }
      };
    }

    const json = await response.json() as { items?: Array<{ title: string; description?: string; link: string; publishedAt: string }> };
    const parsed = (json.items || []).slice(0, parseLimit);
    const items = parsed.map((item) => {
      const classification = classifyBeatByKeyword(item.title, outlet.beat);
      const normalizedCountry = normalizeCountryName(outlet.country);
      const geo = inferGeoFromTitle(item.title, normalizedCountry);
      const newsItem = {
        id: item.link,
        outletId: outlet.id,
        title: item.title,
        description: item.description || '',
        link: item.link,
        source: outlet.name,
        language: outlet.language || 'en',
        sourceType: outlet.sourceType || 'global',
        tier: outlet.tier,
        publishedAt: item.publishedAt,
        beat: classification.beat,
        confidence: classification.confidence,
        classificationSource: classification.source,
        classificationReason: classification.reason,
        publicationSource: 'feed' as const,
        summarySource: item.description ? 'feed' as const : undefined,
        ...geo
      } satisfies NewsItem;
      return annotateWorldLatam(newsItem);
    });

    markSuccess(key);
    return {
      items,
      diagnostic: {
        outletId: outlet.id,
        source: outlet.name,
        method: 'sitemap',
        attempted: true,
        circuitOpen: false,
        ok: true,
        statusCode: 200,
        parsedCount: parsed.length,
        parsedLimit: parseLimit,
        sampleCapped: parsed.length >= parseLimit,
        recent24h: countRecent24h(parsed),
        url: outlet.sitemapUrl
      }
    };
  } catch (error) {
    markFailure(key);
    return {
      items: [],
      diagnostic: {
        outletId: outlet.id,
        source: outlet.name,
        method: 'sitemap',
        attempted: true,
        circuitOpen: false,
        ok: false,
        statusCode: null,
        parsedCount: 0,
        parsedLimit: 0,
        sampleCapped: false,
        recent24h: 0,
        url: outlet.sitemapUrl,
        error: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

function dedupeAndSort(items: NewsItem[]): NewsItem[] {
  const map = new Map<string, NewsItem>();
  for (const item of items) {
    const existing = map.get(item.link);
    if (!existing || new Date(item.publishedAt).getTime() > new Date(existing.publishedAt).getTime()) {
      map.set(item.link, item);
    }
  }

  return [...map.values()].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(value: string): Set<string> {
  const tokens = normalizeTitle(value).split(' ').filter((token) => token.length >= 3);
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  if (union === 0) return 0;
  return intersection / union;
}

function minutesBetween(a: string, b: string): number {
  const aMs = new Date(a).getTime();
  const bMs = new Date(b).getTime();
  if (!Number.isFinite(aMs) || !Number.isFinite(bMs)) return Number.MAX_SAFE_INTEGER;
  return Math.abs(aMs - bMs) / 60000;
}

function buildStoryClusters(items: NewsItem[]): NewsItem[] {
  const sorted = [...items].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const clusterRep: Array<{ id: string; item: NewsItem; tokens: Set<string> }> = [];
  let clusterSeq = 1;

  const withClusters = sorted.map((item) => {
    const tokens = tokenSet(item.title);
    const matched = clusterRep.find((rep) => {
      const sameCountry = (item.country || 'Unknown') === (rep.item.country || 'Unknown');
      if (!sameCountry) return false;
      if (item.beat !== rep.item.beat) return false;

      const mins = minutesBetween(item.publishedAt, rep.item.publishedAt);
      if (mins > 360) return false;

      const similarity = jaccard(tokens, rep.tokens);
      if (similarity >= 0.58) return true;

      const differentLanguage = (item.language || 'en') !== (rep.item.language || 'en');
      const sameLocation = Boolean(item.locationName) && item.locationName === rep.item.locationName;
      if (differentLanguage && sameLocation && mins <= 120) return true;

      return false;
    });

    if (matched) {
      return { ...item, clusterId: matched.id };
    }

    const clusterId = `cluster-${clusterSeq++}`;
    clusterRep.push({ id: clusterId, item, tokens });
    return { ...item, clusterId };
  });

  const clusterCounts = new Map<string, number>();
  for (const item of withClusters) {
    if (!item.clusterId) continue;
    clusterCounts.set(item.clusterId, (clusterCounts.get(item.clusterId) ?? 0) + 1);
  }

  return withClusters.map((item) => ({
    ...item,
    clusterSize: item.clusterId ? clusterCounts.get(item.clusterId) ?? 1 : 1
  }));
}

function filterReasonablePublishedAt(items: NewsItem[]): NewsItem[] {
  const now = Date.now();
  const maxFutureSkewMs = 2 * 60 * 60 * 1000;
  const maxAgeMs = 90 * DAY_MS;
  return items.filter((item) => {
    const ts = new Date(item.publishedAt).getTime();
    if (!Number.isFinite(ts)) return false;
    if (ts > now + maxFutureSkewMs) return false;
    if (ts < now - maxAgeMs) return false;
    return true;
  });
}

async function runWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;

  async function worker(): Promise<void> {
    while (idx < items.length) {
      const current = idx;
      idx += 1;
      results[current] = await fn(items[current]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function diagnosticsFromRuns(runs: IngestionEndpointRun[]): FetchDiagnostic[] {
  return runs.map((run) => ({
    outletId: run.outletId,
    source: run.source,
    method: run.method,
    attempted: Boolean(run.attempted),
    circuitOpen: Boolean(run.circuitOpen),
    ok: Boolean(run.ok),
    statusCode: run.statusCode ?? null,
    parsedCount: run.parsedCount || 0,
    parsedLimit: run.parsedLimit || 0,
    sampleCapped: Boolean(run.sampleCapped),
    recent24h: run.recent24h || 0,
    error: run.error
  }));
}

function buildIngestionSummary(totalOutlets: number, diagnostics: FetchDiagnostic[]): NewsResponsePayload['ingestion'] {
  const attempted = diagnostics.filter((diag) => diag.attempted);
  return {
    totalOutlets,
    totalEndpoints: attempted.length,
    okEndpoints: attempted.filter((diag) => diag.ok).length,
    failedEndpoints: attempted.filter((diag) => !diag.ok).length,
    circuitOpenEndpoints: diagnostics.filter((diag) => diag.circuitOpen).length,
    sampleCappedEndpoints: attempted.filter((diag) => diag.sampleCapped).length,
    diagnostics
  };
}

export async function GET(req: NextRequest): Promise<Response> {
  newsCacheMetricRequest();
  const origin = req.nextUrl.origin;
  const mode = (req.nextUrl.searchParams.get('mode') || '').toLowerCase();
  const runnerParam = (req.nextUrl.searchParams.get('runner') || '').toLowerCase();
  const runner: 'worker' | 'api_news' | 'warm' =
    runnerParam === 'worker' || runnerParam === 'warm' ? runnerParam : 'api_news';
  const readOnlyMode = mode === 'readonly' || mode === 'db';
  const forceIngest = mode === 'ingest';
  const forceFresh = forceIngest || mode === 'fresh';
  const compactResponse = forceIngest;
  const dbReadEnabled = DB_READ_ENABLED_BY_DEFAULT && !forceFresh;
  const liveFallbackAllowed = LIVE_FALLBACK_ENABLED && !readOnlyMode && !(process.env.NODE_ENV === 'production' && PROD_READ_ONLY);
  const outletIds = (req.nextUrl.searchParams.get('outlets') || '').split(',').filter(Boolean);
  const requestedLimit = Number(req.nextUrl.searchParams.get('limit') || DEFAULT_RESPONSE_ITEM_LIMIT);
  const responseLimit = Number.isFinite(requestedLimit)
    ? Math.max(100, Math.min(MAX_RESPONSE_ITEM_LIMIT, Math.round(requestedLimit)))
    : DEFAULT_RESPONSE_ITEM_LIMIT;
  const requestedDbWindowHours = Number(req.nextUrl.searchParams.get('dbHours') || DB_READ_WINDOW_HOURS);
  const dbWindowHours = Number.isFinite(requestedDbWindowHours)
    ? Math.max(6, Math.min(168, Math.round(requestedDbWindowHours)))
    : DB_READ_WINDOW_HOURS;

  const selectedOutlets = outletIds.length
    ? outletIds.map((id) => OUTLET_BY_ID.get(id)).filter((outlet): outlet is OutletFeed => Boolean(outlet))
    : OUTLET_FEEDS;
  const hasExplicitOutletFilter = outletIds.length > 0;
  const selectedOutletIds = selectedOutlets.map((outlet) => outlet.id);

  if (!forceFresh) {
    const cacheVariant: 'full' | 'db' = dbReadEnabled ? 'db' : 'full';
    const cacheKey = await buildNewsCacheKey(selectedOutletIds, responseLimit, cacheVariant);
    const cachedPayload = await getCachedNewsPayload(cacheKey);
    if (cachedPayload) {
      return Response.json(cachedPayload);
    }
  }

  if (dbReadEnabled) {
    const dbReadLimit = Math.min(MAX_RESPONSE_ITEM_LIMIT, Math.max(responseLimit * 2, 1000));
    const dbReadFn = DB_READ_MODEL === 'ingested' ? readIngestedArticles : readExternalNewsArticles;
    const dbRead = await dbReadFn({
      outletIds: hasExplicitOutletFilter ? selectedOutletIds : undefined,
      limit: dbReadLimit,
      hours: dbWindowHours
    });

    if (dbRead.storage === 'postgres' && dbRead.items.length > 0) {
      const diagnosticsRead = await readLatestIngestionDiagnostics({
        outletIds: hasExplicitOutletFilter ? selectedOutletIds : undefined,
        runner: 'worker',
        minutes: Math.min(24 * 60, Math.max(90, dbWindowHours * 60)),
        limit: Math.min(5000, Math.max(200, selectedOutlets.length * 2))
      });
      const diagnostics = diagnosticsFromRuns(diagnosticsRead.runs);
      const dbItems = buildStoryClusters(
        dedupeAndSort(
          filterReasonablePublishedAt(
            dbRead.items.map((item) => annotateWorldLatam(applyLocaleDetection(item)))
          )
        )
      );
      const payload: NewsResponsePayload = {
        generatedAt: dbRead.generatedAt || new Date().toISOString(),
        count: dbItems.length,
        items: dbItems.slice(0, responseLimit),
        ingestion: buildIngestionSummary(selectedOutlets.length, diagnostics),
        persistence: {
          storage: 'postgres',
          persisted: 0,
          externalPersisted: 0,
          reason: DB_READ_MODEL === 'ingested' ? 'db_read_ingested' : 'db_read_external'
        }
      };

      const cacheKey = await buildNewsCacheKey(selectedOutletIds, responseLimit, 'db');
      await setCachedNewsPayload(cacheKey, payload);
      return Response.json(payload);
    }

    if (!liveFallbackAllowed) {
      const diagnosticsRead = await readLatestIngestionDiagnostics({
        outletIds: hasExplicitOutletFilter ? selectedOutletIds : undefined,
        runner: 'worker',
        minutes: Math.min(24 * 60, Math.max(90, dbWindowHours * 60)),
        limit: Math.min(5000, Math.max(200, selectedOutlets.length * 2))
      });
      const diagnostics = diagnosticsFromRuns(diagnosticsRead.runs);
      const payload: NewsResponsePayload = {
        generatedAt: new Date().toISOString(),
        count: 0,
        items: [],
        ingestion: buildIngestionSummary(selectedOutlets.length, diagnostics),
        persistence: {
          storage: dbRead.storage,
          persisted: 0,
          externalPersisted: 0,
          reason: dbRead.storage === 'postgres'
            ? 'db_empty_read_only'
            : 'db_unavailable_read_only',
          ...(dbRead.reason ? { error: dbRead.reason } : {})
        }
      };
      const cacheKey = await buildNewsCacheKey(selectedOutletIds, responseLimit, 'db');
      await setCachedNewsPayload(cacheKey, payload);
      return Response.json(payload);
    }
  }

  if (!liveFallbackAllowed) {
    const payload: NewsResponsePayload = {
      generatedAt: new Date().toISOString(),
      count: 0,
      items: [],
      ingestion: buildIngestionSummary(selectedOutlets.length, []),
      persistence: {
        storage: 'disabled',
        persisted: 0,
        externalPersisted: 0,
        reason: 'live_fallback_disabled'
      }
    };
    return Response.json(payload);
  }

  const tasks = selectedOutlets.flatMap((outlet) => ([
    () => fetchOutletRss(origin, outlet),
    () => fetchOutletSitemap(origin, outlet)
  ]));
  const results = await runWithConcurrency(tasks, ENDPOINT_FETCH_CONCURRENCY, (task) => task());
  const diagnostics = results.map((result) => result.diagnostic);
  await persistIngestionDiagnostics(diagnostics, { runner }).catch(() => ({ persisted: 0, storage: 'disabled' as const }));
  const gnewsItems = await getGnewsBreakingOverlay();
  const mergedItems = dedupeAndSort([
    ...results.flatMap((result) => result.items),
    ...gnewsItems
  ]);
  const enrichedItems = await enrichPublishedAtFromArticleMeta(mergedItems);
  let items = buildStoryClusters(
    dedupeAndSort(
      filterReasonablePublishedAt([
        ...enrichedItems
      ])
    )
  );

  if (items.length < 20) {
    const fallback = await getBusinessRadarFallback();
    items = buildStoryClusters(dedupeAndSort([...items, ...fallback]));
  }

  items = items.map((item) => annotateWorldLatam(applyLocaleDetection(item)));

  let persistence: { persisted: number; storage: 'postgres' | 'disabled'; error?: string; reason?: string; externalPersisted?: number };
  try {
    const external = await persistExternalNewsArticles(items);
    if (WRITE_INGESTED_COMPAT) {
      const { persistIngestedArticles } = await import('@/lib/ingestion-store');
      await persistIngestedArticles(items).catch(() => ({ persisted: 0 }));
    }
    persistence = { ...external, externalPersisted: external.persisted || 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[news] persistExternalNewsArticles failed:', message);
    persistence = {
      persisted: 0,
      storage: 'disabled',
      error: message
    };
  }

  const ingestion = buildIngestionSummary(selectedOutlets.length, diagnostics);
  const responseIngestion = compactResponse ? {
    ...ingestion,
    diagnostics: []
  } : ingestion;

  const payload: NewsResponsePayload = {
    generatedAt: new Date().toISOString(),
    count: items.length,
    items: compactResponse ? [] : items.slice(0, responseLimit),
    ingestion: responseIngestion,
    persistence: {
      storage: persistence.storage,
      persisted: persistence.persisted,
      externalPersisted: persistence.externalPersisted || 0,
      ...(persistence.reason ? { reason: persistence.reason } : {}),
      ...(persistence.error ? { error: persistence.error } : {})
    }
  };

  if (!forceFresh) {
    const cacheVariant: 'full' | 'db' = dbReadEnabled ? 'db' : 'full';
    const cacheKey = await buildNewsCacheKey(selectedOutletIds, responseLimit, cacheVariant);
    await setCachedNewsPayload(cacheKey, payload);
  }
  return Response.json(payload);
}
