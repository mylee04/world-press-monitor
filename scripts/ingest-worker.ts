import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRssOrAtomWithStats, parseSitemapWithStats } from '../lib/parsers';
import { runWithConcurrency } from '../lib/concurrency';
import { fetchWithRetry } from '../lib/fetch-utils';
import { classifySection } from '../lib/keyword-classifier';
import { inferGeoFromTitle } from '../lib/geo';
import {
  readFailingEndpointBackoff,
  readIngestionFeedWatermarks,
  persistExternalNewsArticles,
  persistIngestionDiagnostics,
  upsertIngestionFeedWatermarks,
  type IngestionEndpointRun,
} from '../lib/ingestion-store';
import type { NewsItem, OutletFeed, OutletTier } from '../lib/types';

const FETCH_TIMEOUT_MS = Math.max(
  3000,
  Math.min(30000, Number.parseInt(process.env.INGEST_FETCH_TIMEOUT_MS || '12000', 10) || 12000)
);
const RSS_ITEM_LIMIT = Math.max(10, Math.min(300, Number.parseInt(process.env.INGEST_RSS_LIMIT || '120', 10) || 120));
const SITEMAP_ITEM_LIMIT = Math.max(
  10,
  Math.min(300, Number.parseInt(process.env.INGEST_SITEMAP_LIMIT || '80', 10) || 80)
);
const SITEMAP_INDEX_CHILDREN_LIMIT = Math.max(
  1,
  Math.min(10, Number.parseInt(process.env.INGEST_SITEMAP_INDEX_CHILDREN || '3', 10) || 3)
);
const FETCH_CONCURRENCY = Math.max(
  4,
  Math.min(120, Number.parseInt(process.env.INGEST_FETCH_CONCURRENCY || '24', 10) || 24)
);
const LOOP_INTERVAL_SEC = Math.max(
  60,
  Math.min(3600, Number.parseInt(process.env.INGEST_LOOP_INTERVAL_SEC || '300', 10) || 300)
);
const OUTLET_CHUNK_SIZE = Math.max(
  1,
  Number.parseInt(process.env.INGEST_OUTLET_CHUNK_SIZE || String(Number.MAX_SAFE_INTEGER), 10) || Number.MAX_SAFE_INTEGER
);
const ATLAS_PATH = process.env.ATLAS_PATH || resolve(process.cwd(), 'data/rss-atlas.json');
const STATE_FILE = resolve(process.cwd(), 'audits/ingest-worker-state.json');
const SUMMARY_FILE = resolve(process.cwd(), 'audits/ingest-worker-last.json');
const FAIL_BACKOFF_ENABLED = (process.env.INGEST_FAIL_BACKOFF_ENABLED || 'true').toLowerCase() !== 'false';
const FAIL_BACKOFF_WINDOW_MINUTES = Math.max(
  10,
  Math.min(24 * 60, Number.parseInt(process.env.INGEST_FAIL_BACKOFF_WINDOW_MINUTES || '60', 10) || 60)
);
const FAIL_BACKOFF_MIN_ATTEMPTS = Math.max(
  2,
  Math.min(100, Number.parseInt(process.env.INGEST_FAIL_BACKOFF_MIN_ATTEMPTS || '4', 10) || 4)
);
const FAIL_BACKOFF_MIN_FAIL_PCT = Math.max(
  50,
  Math.min(100, Number.parseInt(process.env.INGEST_FAIL_BACKOFF_MIN_FAIL_PCT || '90', 10) || 90)
);
const SITEMAP_DISABLE_ENABLED = parseBoolEnv(process.env.INGEST_DISABLE_SITEMAP_ON_FAILURE, true);
const SITEMAP_DISABLE_MIN_ATTEMPTS = Math.max(
  2,
  Math.min(100, Number.parseInt(process.env.INGEST_DISABLE_SITEMAP_MIN_ATTEMPTS || '4', 10) || 4)
);
const SITEMAP_DISABLE_MIN_FAIL_PCT = Math.max(
  50,
  Math.min(100, Number.parseInt(process.env.INGEST_DISABLE_SITEMAP_MIN_FAIL_PCT || '80', 10) || 80)
);
const SITEMAP_DISABLE_WINDOW_MINUTES = Math.max(
  10,
  Math.min(24 * 60, Number.parseInt(process.env.INGEST_DISABLE_SITEMAP_WINDOW_MINUTES || '120', 10) || 120)
);
const LATAM_COUNTRIES = new Set(['latam', 'argentina', 'chile', 'uruguay']);
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
  'southern cone',
  'latam',
  'latin america',
  'latinoamerica',
  'america latina',
];
const BREAKING_TERMS = ['breaking', 'urgent', 'developing', 'just in', 'ultima hora', 'última hora', 'urgente', 'en vivo', 'flash'];

type AtlasFeed = {
  name: string;
  url: string | null;
  sitemapUrl?: string;
  // status/check fields are present in atlas but not required for ingestion.
};

type AtlasCountry = {
  name: string;
  code: string;
  feeds: AtlasFeed[];
};

type AtlasCatalog = {
  countries: AtlasCountry[];
};

type WorkerState = {
  offset: number;
  updatedAt: string;
};

type EndpointRun = {
  outlet: OutletFeed;
  method: 'rss' | 'sitemap';
  url: string;
};

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isLatamCountry(country?: string): boolean {
  return LATAM_COUNTRIES.has(normalizeText(country || ''));
}

function detectLatamFromTitle(title: string, locationName?: string): boolean {
  const normalized = normalizeText(`${title} ${locationName || ''}`);
  return LATAM_ENTITY_TERMS.some((term) => normalized.includes(term));
}

function isLikelyBreakingText(text: string): boolean {
  const normalized = normalizeText(text);
  return BREAKING_TERMS.some((term) => normalized.includes(term));
}

function annotateWorldLatam(item: NewsItem): NewsItem {
  const worldLatam = isLatamCountry(item.country) || detectLatamFromTitle(item.title, item.locationName);
  const breaking = isLikelyBreakingText(`${item.title} ${item.classificationReason || ''}`);
  const tags = [...new Set([...(item.tags || []), ...(worldLatam ? ['world_latam'] : []), ...(breaking ? ['breaking'] : [])])];
  return {
    ...item,
    worldLatam,
    tags,
  };
}

function ensureAuditsDir(): void {
  mkdirSync(resolve(process.cwd(), 'audits'), { recursive: true });
}

function normalizeCountryName(country: string): string {
  const c = (country || '').trim();
  if (c === 'US') return 'United States';
  return c || 'Global';
}

function parsePublishedAtMs(value: string): number | null {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function makeOutletId(countryName: string, sourceName: string, feedUrl: string): string {
  const safe = normalizeText(`${countryName} ${sourceName}`)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 120);
  let hash = 2166136261;
  for (let i = 0; i < feedUrl.length; i += 1) {
    hash ^= feedUrl.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${safe || 'source'}-${(hash >>> 0).toString(36)}`;
}

function loadAtlasOutlets(): OutletFeed[] {
  try {
    const raw = readFileSync(ATLAS_PATH, 'utf8');
    const atlas = JSON.parse(raw) as AtlasCatalog;
    if (!Array.isArray(atlas.countries)) {
      throw new Error('atlas.countries is not an array');
    }
    const outlets = atlas.countries.flatMap((country) => {
      const countryName = country.name || country.code || 'Global';
      return (Array.isArray(country.feeds) ? country.feeds : [])
      .map((feed) => ({
        name: feed.name || 'Unknown source',
        url: typeof feed.url === 'string' ? feed.url.trim() : '',
        explicitSitemapUrl:
          typeof feed.sitemapUrl === 'string' && feed.sitemapUrl.trim().length > 0
            ? feed.sitemapUrl.trim()
            : undefined,
      }))
        .filter((feed): feed is { name: string; url: string; explicitSitemapUrl: string | undefined } =>
          feed.url.length > 0
        )
        .map((feed) => ({
          id: makeOutletId(countryName, feed.name, feed.url),
          name: feed.name,
          tier: 1 as OutletTier,
          section: 'general',
          categories: ['global'],
          language: 'en',
          sourceType: 'global',
          reviewDecision: 'keep_secondary',
          defaultEnabled: true,
          country: countryName,
          rssUrl: feed.url,
          sitemapUrl:
            feed.explicitSitemapUrl ?? buildSitemapFallbackUrls(feed.url)[0],
        }) satisfies OutletFeed);
    });
    outlets.sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name));
    if (outlets.length > 0) {
      return outlets;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[ingest-worker] failed to load atlas (${ATLAS_PATH}): ${message}`);
  }
  return [];
}

function parseSitemapIndex(xml: string): string[] {
  if (!/<sitemapindex[\s>]/i.test(xml)) return [];
  return [...xml.matchAll(/<sitemap>([\s\S]*?)<\/sitemap>/gi)]
    .map((match) => match[1] || '')
    .map((body) => {
      const loc = body.match(/<loc[^>]*>([\s\S]*?)<\/loc>/i)?.[1]?.trim() || '';
      return loc;
    })
    .filter(Boolean)
    .slice(0, SITEMAP_INDEX_CHILDREN_LIMIT);
}

type ParsedSitemapResult = ReturnType<typeof parseSitemapWithStats>;

function parseBoolEnv(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(raw.trim());
}

function dedupeUrls(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    next.push(normalized);
  }
  return next;
}

function buildSitemapFallbackUrls(sourceUrl: string, sitemapUrl?: string): string[] {
  const urls: string[] = [];
  if (sitemapUrl) {
    urls.push(sitemapUrl);
  }
  try {
    const parsed = new URL(sourceUrl);
    const root = `${parsed.protocol}//${parsed.host}`;
    const basePath = parsed.pathname.endsWith('/') ? parsed.pathname : `${parsed.pathname.replace(/\/[^/]*$/, '')}/`;
    urls.push(`${root}${basePath}sitemap_news.xml`);
    urls.push(`${root}${basePath}sitemap-news.xml`);
    urls.push(`${root}${basePath}sitemap.xml`);
    urls.push(`${root}${basePath}sitemap_index.xml`);
    urls.push(`${root}/sitemap_news.xml`);
    urls.push(`${root}/sitemap-news.xml`);
    urls.push(`${root}/sitemap.xml`);
    urls.push(`${root}/sitemap_index.xml`);
  } catch {
    return dedupeUrls(urls);
  }
  return dedupeUrls(urls);
}

async function fetchSitemapFallbackFromUrl(sitemapUrl: string): Promise<ParsedSitemapResult | null> {
  const response = await fetchWithRetryFeed(sitemapUrl);
  if (!response.ok) return null;
  const xml = await response.text();

  let parsed = parseSitemapWithStats(xml, SITEMAP_ITEM_LIMIT);
  if (parsed.items.length === 0) {
    const children = parseSitemapIndex(xml);
    if (children.length > 0) {
      const childResults = await Promise.all(
        children.map(async (childUrl) => {
          try {
            const childResponse = await fetchWithRetryFeed(childUrl);
            if (!childResponse.ok) return null;
            const childXml = await childResponse.text();
            return parseSitemapWithStats(childXml, Math.max(8, Math.floor(SITEMAP_ITEM_LIMIT / children.length)));
          } catch {
            return null;
          }
        }),
      );
      const allChildParsed = childResults.filter(
        (entry): entry is ParsedSitemapResult => Boolean(entry)
      );
      if (allChildParsed.length > 0) {
        const childStats = allChildParsed.reduce(
          (acc, batch) => {
            acc.totalCandidates += batch.stats.totalCandidates;
            acc.validCount += batch.stats.validCount;
            acc.missingTitleCount += batch.stats.missingTitleCount;
            acc.missingSummaryCount += batch.stats.missingSummaryCount;
            acc.missingPublishedAtCount += batch.stats.missingPublishedAtCount;
            acc.missingLinkCount += batch.stats.missingLinkCount;
            return acc;
          },
          {
            totalCandidates: 0,
            validCount: 0,
            missingTitleCount: 0,
            missingSummaryCount: 0,
            missingPublishedAtCount: 0,
            missingLinkCount: 0,
          },
        );
        parsed = {
          items: allChildParsed.flatMap((batch) => batch.items).slice(0, SITEMAP_ITEM_LIMIT),
          stats: childStats,
        };
      }
    }
  }

  return parsed.items.length > 0 ? parsed : null;
}

async function trySitemapFallback(outlet: OutletFeed): Promise<ParsedSitemapResult | null> {
  const candidates = buildSitemapFallbackUrls(outlet.rssUrl || '', outlet.sitemapUrl);
  for (const candidate of candidates) {
    try {
      const parsed = await fetchSitemapFallbackFromUrl(candidate);
      if (parsed) {
        console.log(
          `[ingest-worker] using rss sitemap fallback: ${normalizeCountryName(outlet.country)} ${outlet.name} -> ${candidate}`
        );
        return parsed;
      }
    } catch {
      // continue to next candidate
    }
  }
  return null;
}

const ENABLE_RSS_TO_SITEMAP_FALLBACK = parseBoolEnv(process.env.INGEST_RSS_SITEMAP_FALLBACK, true);

const FEED_FETCH_HEADERS = {
  'User-Agent':
    process.env.INGEST_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  Accept: 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*',
  'Accept-Language': process.env.INGEST_ACCEPT_LANGUAGE || 'en-US,en;q=0.9,es;q=0.8,ja;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  Connection: 'keep-alive',
  'Upgrade-Insecure-Requests': '1'
};

function normalizeResponseContentType(response: Response): string {
  return (response.headers.get('content-type') || '').toLowerCase();
}

type ReadResponseBodyResult = {
  body: string;
  bodyLength: number;
  decodeFailed: boolean;
};

async function readResponseBody(response: Response): Promise<ReadResponseBodyResult> {
  const buffer = await response.arrayBuffer();
  const bodyLength = buffer.byteLength;
  try {
    const body = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return { body, bodyLength, decodeFailed: false };
  } catch {
    return {
      body: new TextDecoder('utf-8').decode(buffer),
      bodyLength,
      decodeFailed: true,
    };
  }
}

function isLikelyHtmlResponse(response: Response, body: string): boolean {
  const contentType = normalizeResponseContentType(response);
  if (contentType.includes('text/html') || contentType.includes('application/xhtml+xml')) return true;
  return /<html[\s>]/i.test(body) || /<head[\s>]/i.test(body) || /<!doctype html/i.test(body);
}

function isLikelyXmlPayload(body: string): boolean {
  const sample = body.slice(0, 4000).toLowerCase();
  return (
    sample.includes('<rss') ||
    sample.includes('<feed') ||
    sample.includes('<urlset') ||
    sample.includes('<sitemapindex') ||
    sample.includes('<url>')
  );
}

function isFallbackRetryStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 404 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function describeFeedFailure(response: Response, body: string): string {
  if (!response.ok) {
    return `http_${response.status}`;
  }
  if (isLikelyHtmlResponse(response, body)) {
    return 'html_returned';
  }
  return '';
}

function shouldRetryWithSitemap(response: Response, body: string): boolean {
  if (!response.ok) return isFallbackRetryStatus(response.status);
  return isLikelyHtmlResponse(response, body);
}

function classifyParsedFeedFailure(params: {
  response: Response;
  body: string;
  bodyLength: number;
  decodeFailed: boolean;
  totalCandidates: number;
  validCount: number;
}): string {
  if (params.decodeFailed) return 'decode_failed';
  if (params.bodyLength === 0 || !params.body.trim()) return 'empty_body_200';
  if (isLikelyHtmlResponse(params.response, params.body)) return 'html_returned';
  if (params.totalCandidates === 0) return isLikelyXmlPayload(params.body) ? 'xml_parse_failed' : 'no_items';
  if (params.validCount === 0) return 'no_items';
  return 'xml_parse_failed';
}

type FeedFetchResult = {
  requestedUrl: string;
  finalUrl: string;
  shouldUseSitemapFallback: boolean;
  response: Response | null;
  body: string;
  bodyLength: number;
  decodeFailed: boolean;
  failureReason?: string;
  statusCode: number | null;
};

type FallbackKind = 'none' | 'sitemap';

type EndpointResult = {
  items: NewsItem[];
  run: IngestionEndpointRun;
  fallbackUsed: FallbackKind;
};

function getFallbackKind(feedResult: FeedFetchResult): FallbackKind {
  return feedResult.shouldUseSitemapFallback ? 'sitemap' : 'none';
}

async function fetchFeedWithFallback(url: string): Promise<FeedFetchResult> {
  const requestedUrl = url;

  try {
      const primary = await fetchWithRetryFeed(requestedUrl);
      const primaryBody = await readResponseBody(primary);
      const primaryFailure = describeFeedFailure(primary, primaryBody.body);
      const shouldUseSitemapFallback = shouldRetryWithSitemap(primary, primaryBody.body);

      return {
        requestedUrl,
        finalUrl: requestedUrl,
        shouldUseSitemapFallback,
        response: primary,
        body: primaryBody.body,
        bodyLength: primaryBody.bodyLength,
        decodeFailed: primaryBody.decodeFailed,
        failureReason: primaryFailure || undefined,
        statusCode: primary.status
      };
    } catch (error) {
      const primaryMessage = error instanceof Error ? error.message : String(error);
      return {
        requestedUrl,
        finalUrl: requestedUrl,
        shouldUseSitemapFallback: true,
        response: null,
        body: '',
        bodyLength: 0,
        decodeFailed: false,
        failureReason: `network_error:${primaryMessage}`,
        statusCode: null
      };
    }
}

async function fetchWithRetryFeed(url: string): Promise<Response> {
  return fetchWithRetry(url, {
    timeoutMs: FETCH_TIMEOUT_MS,
    fetchOptions: {
      headers: FEED_FETCH_HEADERS
    },
    attempts: 1,
    backoffMs: (attempt) => 200 + attempt * 300 + Math.floor(Math.random() * 200),
  });
}

function dedupeAndSort(items: NewsItem[]): NewsItem[] {
  const byLink = new Map<string, NewsItem>();
  for (const item of items) {
    const prev = byLink.get(item.link);
    if (!prev || new Date(item.publishedAt).getTime() > new Date(prev.publishedAt).getTime()) {
      byLink.set(item.link, item);
    }
  }
  return [...byLink.values()].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

async function toNewsItem(
  outlet: OutletFeed,
  row: { title: string; description?: string; link: string; publishedAt: string }
): Promise<NewsItem> {
  const normalizedCountry = normalizeCountryName(outlet.country);
  const geo = inferGeoFromTitle(row.title, normalizedCountry);
  const fallbackSection = outlet.section || 'general';
  const classification = await classifySection({ title: row.title, summary: row.description, fallbackSection });
  const section = classification.section;
  return annotateWorldLatam({
    id: row.link,
    outletId: outlet.id,
    title: row.title,
    description: row.description || '',
    link: row.link,
    source: outlet.name,
    language: outlet.language || 'en',
    sourceType: outlet.sourceType || 'global',
    tier: outlet.tier,
    publishedAt: row.publishedAt,
    section,
    confidence: classification.confidence,
    classificationSource: classification.source,
    classificationReason: classification.reason,
    publicationSource: 'feed',
    summarySource: row.description ? 'feed' : undefined,
    ...geo,
  });
}

async function fetchRss(
  outlet: OutletFeed,
  options: {
    allowSitemapFallback: boolean;
  } = { allowSitemapFallback: true }
): Promise<EndpointResult> {
  const country = normalizeCountryName(outlet.country);
  if (!outlet.rssUrl) {
    return {
      items: [],
      run: {
        outletId: outlet.id,
        source: outlet.name,
        country,
        method: 'rss',
        attempted: false,
        circuitOpen: false,
        ok: false,
        statusCode: null,
        parsedCount: 0,
        fetchedCount: 0,
        parsedLimit: RSS_ITEM_LIMIT,
        sampleCapped: false,
        recent24h: 0,
        missingTitleCount: 0,
        missingSummaryCount: 0,
        missingPublishedAtCount: 0,
        missingLinkCount: 0,
      },
      fallbackUsed: 'none',
    };
  }

  try {
    const feedResult = await fetchFeedWithFallback(outlet.rssUrl);
    if (!feedResult.response || feedResult.failureReason || !feedResult.response.ok) {
      const fallbackUsed: FallbackKind = getFallbackKind(feedResult);
      const useSitemapFallback = options.allowSitemapFallback && ENABLE_RSS_TO_SITEMAP_FALLBACK && feedResult.shouldUseSitemapFallback;
      if (useSitemapFallback) {
        const sitemapParsed = await trySitemapFallback(outlet);
        if (sitemapParsed) {
          const items = await Promise.all(sitemapParsed.items.map((row) => toNewsItem(outlet, row)));
          return {
            items,
            run: {
              outletId: outlet.id,
              source: outlet.name,
              country,
              method: 'rss',
              attempted: true,
              circuitOpen: false,
              ok: true,
              statusCode: 200,
              parsedCount: sitemapParsed.stats.validCount,
              fetchedCount: sitemapParsed.stats.totalCandidates,
              parsedLimit: SITEMAP_ITEM_LIMIT,
              sampleCapped: sitemapParsed.stats.validCount >= SITEMAP_ITEM_LIMIT,
              recent24h: sitemapParsed.stats.validCount,
              missingTitleCount: sitemapParsed.stats.missingTitleCount,
              missingSummaryCount: sitemapParsed.stats.missingSummaryCount,
              missingPublishedAtCount: sitemapParsed.stats.missingPublishedAtCount,
              missingLinkCount: sitemapParsed.stats.missingLinkCount,
            },
          fallbackUsed: 'sitemap',
          };
        }
      } else if (fallbackUsed === 'sitemap') {
        const normalizedFailure = 'sitemap_fallback_disabled';
        return {
          items: [],
          run: {
            outletId: outlet.id,
            source: outlet.name,
            country,
            method: 'rss',
            attempted: true,
            circuitOpen: false,
            ok: false,
            statusCode: feedResult.statusCode,
            parsedCount: 0,
            fetchedCount: feedResult.bodyLength,
            parsedLimit: RSS_ITEM_LIMIT,
            sampleCapped: false,
            recent24h: 0,
            missingTitleCount: 0,
            missingSummaryCount: 0,
            missingPublishedAtCount: 0,
            missingLinkCount: 0,
            error: normalizedFailure,
          },
          fallbackUsed: 'none',
        };
      }

      const normalizedFailure =
        feedResult.failureReason ??
        (feedResult.response ? describeFeedFailure(feedResult.response, feedResult.body) : 'network_error')
        ?? 'unknown_failure';
      return {
        items: [],
        run: {
          outletId: outlet.id,
          source: outlet.name,
          country,
          method: 'rss',
          attempted: true,
          circuitOpen: false,
          ok: false,
          statusCode: feedResult.statusCode,
          parsedCount: 0,
          fetchedCount: 0,
          parsedLimit: RSS_ITEM_LIMIT,
        sampleCapped: false,
        recent24h: 0,
        missingTitleCount: 0,
        missingSummaryCount: 0,
        missingPublishedAtCount: 0,
        missingLinkCount: 0,
        error: normalizedFailure,
        },
        fallbackUsed,
      };
    }
    const xml = feedResult.body;
    const parsed = parseRssOrAtomWithStats(xml, RSS_ITEM_LIMIT);
    if (parsed.stats.validCount === 0) {
      const parsedFailure = classifyParsedFeedFailure({
        response: feedResult.response,
        body: xml,
        bodyLength: feedResult.bodyLength,
        decodeFailed: feedResult.decodeFailed,
        totalCandidates: parsed.stats.totalCandidates,
        validCount: parsed.stats.validCount,
      });
      return {
        items: [],
        run: {
          outletId: outlet.id,
          source: outlet.name,
          country,
          method: 'rss',
          attempted: true,
          circuitOpen: false,
          ok: false,
          statusCode: feedResult.statusCode,
          parsedCount: 0,
          fetchedCount: parsed.stats.totalCandidates,
          parsedLimit: RSS_ITEM_LIMIT,
          sampleCapped: false,
          recent24h: 0,
          missingTitleCount: parsed.stats.missingTitleCount,
          missingSummaryCount: parsed.stats.missingSummaryCount,
          missingPublishedAtCount: parsed.stats.missingPublishedAtCount,
          missingLinkCount: parsed.stats.missingLinkCount,
          error: parsedFailure,
        },
        fallbackUsed: 'none',
      };
    }

    const items = await Promise.all(parsed.items.map((row) => toNewsItem(outlet, row)));
    const rssFallbackUsed: FallbackKind = getFallbackKind(feedResult);
    return {
      items,
      run: {
        outletId: outlet.id,
        source: outlet.name,
        country,
        method: 'rss',
        attempted: true,
        circuitOpen: false,
        ok: true,
        statusCode: feedResult.statusCode ?? 200,
        parsedCount: parsed.stats.validCount,
        fetchedCount: parsed.stats.totalCandidates,
        parsedLimit: RSS_ITEM_LIMIT,
        sampleCapped: parsed.stats.validCount >= RSS_ITEM_LIMIT,
        recent24h: parsed.stats.validCount,
        missingTitleCount: parsed.stats.missingTitleCount,
        missingSummaryCount: parsed.stats.missingSummaryCount,
        missingPublishedAtCount: parsed.stats.missingPublishedAtCount,
        missingLinkCount: parsed.stats.missingLinkCount,
      },
      fallbackUsed: rssFallbackUsed,
    };
  } catch (error) {
    return {
      items: [],
      run: {
        outletId: outlet.id,
        source: outlet.name,
        country,
        method: 'rss',
        attempted: true,
        circuitOpen: false,
        ok: false,
        statusCode: null,
        parsedCount: 0,
        fetchedCount: 0,
        parsedLimit: RSS_ITEM_LIMIT,
        sampleCapped: false,
        recent24h: 0,
        missingTitleCount: 0,
        missingSummaryCount: 0,
        missingPublishedAtCount: 0,
        missingLinkCount: 0,
        error: error instanceof Error ? error.message : String(error),
      },
      fallbackUsed: 'none',
    };
  }
}

async function fetchSitemap(outlet: OutletFeed): Promise<EndpointResult> {
  const country = normalizeCountryName(outlet.country);
  if (!outlet.sitemapUrl) {
    return {
      items: [],
      run: {
        outletId: outlet.id,
        source: outlet.name,
        country,
        method: 'sitemap',
        attempted: false,
        circuitOpen: false,
        ok: false,
        statusCode: null,
        parsedCount: 0,
        fetchedCount: 0,
        parsedLimit: SITEMAP_ITEM_LIMIT,
        sampleCapped: false,
        recent24h: 0,
        missingTitleCount: 0,
        missingSummaryCount: 0,
        missingPublishedAtCount: 0,
        missingLinkCount: 0,
      },
      fallbackUsed: 'none',
    };
  }

  try {
    const response = await fetchWithRetryFeed(outlet.sitemapUrl);
    if (!response.ok) {
      return {
        items: [],
        run: {
          outletId: outlet.id,
          source: outlet.name,
          country,
          method: 'sitemap',
          attempted: true,
          circuitOpen: false,
          ok: false,
          statusCode: response.status,
          parsedCount: 0,
          fetchedCount: 0,
          parsedLimit: SITEMAP_ITEM_LIMIT,
          sampleCapped: false,
          recent24h: 0,
          missingTitleCount: 0,
          missingSummaryCount: 0,
          missingPublishedAtCount: 0,
          missingLinkCount: 0,
          error: `http_${response.status}`,
        },
        fallbackUsed: 'none',
      };
    }

    const bodyResult = await readResponseBody(response);
    const xml = bodyResult.body;
    let parsed = parseSitemapWithStats(xml, SITEMAP_ITEM_LIMIT);

    if (parsed.items.length === 0) {
      const children = parseSitemapIndex(xml);
      if (children.length > 0) {
        const childResults = await Promise.all(
          children.map(async (childUrl) => {
            try {
              const childResponse = await fetchWithRetryFeed(childUrl);
              if (!childResponse.ok) return null;
              const childBody = await readResponseBody(childResponse);
              const childXml = childBody.body;
              return parseSitemapWithStats(
                childXml,
                Math.max(8, Math.floor(SITEMAP_ITEM_LIMIT / children.length))
              );
            } catch {
              return null;
            }
          })
        );
        const allChildParsed = childResults.filter(
          (entry): entry is ReturnType<typeof parseSitemapWithStats> => Boolean(entry)
        );
        if (allChildParsed.length > 0) {
          const childStats = allChildParsed.reduce(
            (acc, batch) => {
              acc.totalCandidates += batch.stats.totalCandidates;
              acc.validCount += batch.stats.validCount;
              acc.missingTitleCount += batch.stats.missingTitleCount;
              acc.missingSummaryCount += batch.stats.missingSummaryCount;
              acc.missingPublishedAtCount += batch.stats.missingPublishedAtCount;
              acc.missingLinkCount += batch.stats.missingLinkCount;
              return acc;
            },
            {
              totalCandidates: 0,
              validCount: 0,
              missingTitleCount: 0,
              missingSummaryCount: 0,
              missingPublishedAtCount: 0,
              missingLinkCount: 0,
            }
          );
          parsed = {
            items: allChildParsed.flatMap((batch) => batch.items).slice(0, SITEMAP_ITEM_LIMIT),
            stats: childStats
          };
        }
      }
    }

    if (parsed.stats.validCount === 0) {
      const parsedFailure = classifyParsedFeedFailure({
        response,
        body: xml,
        bodyLength: bodyResult.bodyLength,
        decodeFailed: bodyResult.decodeFailed,
        totalCandidates: parsed.stats.totalCandidates,
        validCount: parsed.stats.validCount,
      });
      return {
        items: [],
        run: {
          outletId: outlet.id,
          source: outlet.name,
          country,
          method: 'sitemap',
          attempted: true,
          circuitOpen: false,
          ok: false,
          statusCode: response.status,
          parsedCount: 0,
          fetchedCount: parsed.stats.totalCandidates,
          parsedLimit: SITEMAP_ITEM_LIMIT,
          sampleCapped: false,
          recent24h: 0,
          missingTitleCount: parsed.stats.missingTitleCount,
          missingSummaryCount: parsed.stats.missingSummaryCount,
          missingPublishedAtCount: parsed.stats.missingPublishedAtCount,
          missingLinkCount: parsed.stats.missingLinkCount,
          error: parsedFailure,
        },
        fallbackUsed: 'none',
      };
    }

    const items = await Promise.all(parsed.items.map((row) => toNewsItem(outlet, row)));
    return {
      items,
      run: {
        outletId: outlet.id,
        source: outlet.name,
        country,
        method: 'sitemap',
        attempted: true,
        circuitOpen: false,
        ok: true,
        statusCode: 200,
      parsedCount: parsed.stats.validCount,
      fetchedCount: parsed.stats.totalCandidates,
      parsedLimit: SITEMAP_ITEM_LIMIT,
      sampleCapped: parsed.stats.validCount >= SITEMAP_ITEM_LIMIT,
      recent24h: parsed.stats.validCount,
      missingTitleCount: parsed.stats.missingTitleCount,
      missingSummaryCount: parsed.stats.missingSummaryCount,
      missingPublishedAtCount: parsed.stats.missingPublishedAtCount,
      missingLinkCount: parsed.stats.missingLinkCount,
      },
      fallbackUsed: 'none',
    };
  } catch (error) {
    return {
      items: [],
      run: {
        outletId: outlet.id,
        source: outlet.name,
        country,
        method: 'sitemap',
        attempted: true,
        circuitOpen: false,
        ok: false,
        statusCode: null,
        parsedCount: 0,
        fetchedCount: 0,
      parsedLimit: SITEMAP_ITEM_LIMIT,
      sampleCapped: false,
      recent24h: 0,
      missingTitleCount: 0,
      missingSummaryCount: 0,
      missingPublishedAtCount: 0,
      missingLinkCount: 0,
      error: error instanceof Error ? error.message : String(error),
      },
      fallbackUsed: 'none',
    };
  }
}

function readState(totalOutlets: number): WorkerState {
  try {
    const raw = readFileSync(STATE_FILE, 'utf8');
    const json = JSON.parse(raw) as WorkerState;
    const offset = Number.isFinite(json.offset) ? Math.max(0, Math.floor(json.offset)) : 0;
    return {
      offset: totalOutlets > 0 ? offset % totalOutlets : 0,
      updatedAt: json.updatedAt || new Date(0).toISOString(),
    };
  } catch {
    return { offset: 0, updatedAt: new Date(0).toISOString() };
  }
}

function writeState(state: WorkerState): void {
  ensureAuditsDir();
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function pickOutletChunk(all: OutletFeed[], chunkSize: number): { selected: OutletFeed[]; nextOffset: number; offset: number } {
  if (all.length === 0) return { selected: [], nextOffset: 0, offset: 0 };
  const state = readState(all.length);
  if (chunkSize >= all.length) {
    return { selected: all, nextOffset: 0, offset: 0 };
  }
  const offset = state.offset;
  const selected = Array.from({ length: chunkSize }, (_, i) => all[(offset + i) % all.length]);
  const nextOffset = (offset + selected.length) % all.length;
  return { selected, nextOffset, offset };
}

function filterItemsByWatermark(items: NewsItem[], lastPublicationAt: string | null): NewsItem[] {
  if (!lastPublicationAt) return items;
  const cutoff = parsePublishedAtMs(lastPublicationAt);
  if (!cutoff) return items;
  return items.filter((item) => {
    const publishedAt = parsePublishedAtMs(item.publishedAt);
    return publishedAt === null || publishedAt > cutoff;
  });
}

async function runOnce(): Promise<void> {
  const started = Date.now();
  ensureAuditsDir();

  const allOutlets = loadAtlasOutlets();
  const { selected, nextOffset, offset } = pickOutletChunk(allOutlets, OUTLET_CHUNK_SIZE);
  const endpointLookup = new Map<string, EndpointRun>();
  const endpoints: EndpointRun[] = selected.flatMap((outlet) => {
    const runs: EndpointRun[] = [];
    if (outlet.rssUrl) runs.push({ outlet, method: 'rss', url: outlet.rssUrl });
    if (outlet.sitemapUrl) runs.push({ outlet, method: 'sitemap', url: outlet.sitemapUrl });
    return runs;
  });
  for (const endpoint of endpoints) {
    const endpointKey = `${endpoint.outlet.id}:${endpoint.method}`;
    endpointLookup.set(endpointKey, endpoint);
  }
  const dedupedEndpoints = [...endpointLookup.values()];
  const watermarks = await readIngestionFeedWatermarks(
    dedupedEndpoints.map((endpoint) => ({
      outletId: endpoint.outlet.id,
      method: endpoint.method
    }))
  );

  const failingBackoff = FAIL_BACKOFF_ENABLED
    ? await readFailingEndpointBackoff({
        runner: 'worker',
        windowMinutes: FAIL_BACKOFF_WINDOW_MINUTES,
        minAttempts: FAIL_BACKOFF_MIN_ATTEMPTS,
        minFailPct: FAIL_BACKOFF_MIN_FAIL_PCT,
        limit: 5000,
      })
    : { rows: [] as Array<{ outletId: string; method: 'rss' | 'sitemap' }> };
  const failingKeys = new Set(failingBackoff.rows.map((row) => `${row.outletId}:${row.method}`));
  const disabledSitemapOutletIds = SITEMAP_DISABLE_ENABLED
    ? new Set(
        failingBackoff.rows
          .filter((row) => row.method === 'rss')
          .filter((row) => row.attempted >= SITEMAP_DISABLE_MIN_ATTEMPTS && row.failed * 100 >= row.attempted * SITEMAP_DISABLE_MIN_FAIL_PCT)
          .map((row) => row.outletId),
      )
    : new Set<string>();

  const fallbackSummary = {
    rssSitemapFallbackAttempts: 0,
    rssSitemapFallbackSuccess: 0,
    rssSitemapFallbackSkipped: 0,
    sitemapEndpointSkipped: 0
  };

  const results = await runWithConcurrency(dedupedEndpoints, FETCH_CONCURRENCY, async (endpoint) => {
    const endpointKey = `${endpoint.outlet.id}:${endpoint.method}`;
    const sitemapDisabledForOutlet = disabledSitemapOutletIds.has(endpoint.outlet.id);
    if (failingKeys.has(endpointKey)) {
      if (endpoint.method === 'sitemap') {
        fallbackSummary.sitemapEndpointSkipped += 1;
      }
      return {
        items: [],
        run: {
          outletId: endpoint.outlet.id,
          source: endpoint.outlet.name,
          country: normalizeCountryName(endpoint.outlet.country),
          method: endpoint.method,
          attempted: false,
          circuitOpen: true,
          ok: false,
          statusCode: null,
          parsedCount: 0,
          fetchedCount: 0,
          parsedLimit: endpoint.method === 'rss' ? RSS_ITEM_LIMIT : SITEMAP_ITEM_LIMIT,
          sampleCapped: false,
          recent24h: 0,
          missingTitleCount: 0,
          missingSummaryCount: 0,
          missingPublishedAtCount: 0,
          missingLinkCount: 0,
          error: 'cooldown_high_fail',
        },
        fallbackUsed: 'none',
      };
    }
    if (endpoint.method === 'rss') {
      const result = await fetchRss(endpoint.outlet, { allowSitemapFallback: !sitemapDisabledForOutlet });
      const lastPublicationAt = watermarks.get(endpointKey) || null;
      return { ...result, items: filterItemsByWatermark(result.items, lastPublicationAt) };
    }
    if (endpoint.method === 'sitemap' && sitemapDisabledForOutlet) {
      return {
        items: [],
        run: {
          outletId: endpoint.outlet.id,
          source: endpoint.outlet.name,
          country: normalizeCountryName(endpoint.outlet.country),
          method: 'sitemap',
          attempted: false,
          circuitOpen: true,
          ok: false,
          statusCode: null,
          parsedCount: 0,
          fetchedCount: 0,
          parsedLimit: SITEMAP_ITEM_LIMIT,
          sampleCapped: false,
          recent24h: 0,
          missingTitleCount: 0,
          missingSummaryCount: 0,
          missingPublishedAtCount: 0,
          missingLinkCount: 0,
          error: 'sitemap_disabled_by_policy',
        },
        fallbackUsed: 'none',
      };
    }
    const result = await fetchSitemap(endpoint.outlet);
    const lastPublicationAt = watermarks.get(endpointKey) || null;
    return { ...result, items: filterItemsByWatermark(result.items, lastPublicationAt) };
  });

  const diagnostics = results.map((r) => r.run);
  for (const result of results) {
    if (result.run.method === 'rss') {
      if (result.fallbackUsed === 'sitemap') {
        fallbackSummary.rssSitemapFallbackAttempts += 1;
        if (result.run.ok) {
          fallbackSummary.rssSitemapFallbackSuccess += 1;
        }
      } else if (result.run.error === 'sitemap_fallback_disabled') {
        fallbackSummary.rssSitemapFallbackSkipped += 1;
      }
    }
  }

  const methodStats = diagnostics.reduce(
    (acc, diagnostic) => {
      if (!diagnostic.attempted) return acc;
      const bucket = acc[diagnostic.method];
      bucket.attempted += 1;
      if (diagnostic.ok) {
        bucket.ok += 1;
      } else {
        bucket.fail += 1;
      }
      return acc;
    },
    {
      rss: { attempted: 0, ok: 0, fail: 0 },
      sitemap: { attempted: 0, ok: 0, fail: 0 },
    } as Record<'rss' | 'sitemap', { attempted: number; ok: number; fail: number }>,
  );
  const percent = (n: number, d: number): string => (d === 0 ? '0.00' : ((n / d) * 100).toFixed(2));

  const endpointMaxPublicationAtMs = new Map<string, number>();
  for (const { run, items } of results) {
    const key = `${run.outletId}:${run.method}`;
    for (const item of items) {
      const publishedAtMs = parsePublishedAtMs(item.publishedAt);
      if (publishedAtMs === null) continue;
      const current = endpointMaxPublicationAtMs.get(key);
      if (current === undefined || publishedAtMs > current) {
        endpointMaxPublicationAtMs.set(key, publishedAtMs);
      }
    }
  }

  const merged = dedupeAndSort(results.flatMap((r) => r.items));
  const persistedExternal = await persistExternalNewsArticles(merged);
  const persistedDiag = await persistIngestionDiagnostics(diagnostics, { runner: 'worker' });
  const watermarkRows = [...endpointMaxPublicationAtMs.entries()]
    .map(([endpointKey, publicationAtMs]) => {
      const endpoint = endpointLookup.get(endpointKey);
      if (!endpoint) return null;
      return {
        outletId: endpoint.outlet.id,
        source: endpoint.outlet.name,
        country: normalizeCountryName(endpoint.outlet.country),
        method: endpoint.method,
        lastPublicationAt: new Date(publicationAtMs).toISOString()
      };
    })
    .filter((row): row is { outletId: string; source: string; country: string; method: 'rss' | 'sitemap'; lastPublicationAt: string } => Boolean(row));
  if (watermarkRows.length > 0) {
    await upsertIngestionFeedWatermarks(watermarkRows);
  }

  const okEndpoints = diagnostics.filter((d) => d.attempted && d.ok).length;
  const failedEndpoints = diagnostics.filter((d) => d.attempted && !d.ok).length;
  const attempted = diagnostics.filter((d) => d.attempted).length;
  const summary = {
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    worker: {
      outletsTotal: allOutlets.length,
      outletsSelected: selected.length,
      outletOffset: offset,
      nextOutletOffset: nextOffset,
      endpointsAttempted: attempted,
      endpointsOk: okEndpoints,
      endpointsFailed: failedEndpoints,
      endpointFailureRate: attempted > 0 ? failedEndpoints / attempted : 0,
      uniqueItems: merged.length,
      persisted: persistedExternal.persisted,
      externalPersisted: persistedExternal.persisted,
      diagnosticsPersisted: persistedDiag.persisted,
      fallback: fallbackSummary,
    },
  };

  writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2), 'utf8');
  writeState({ offset: nextOffset, updatedAt: summary.generatedAt });
  console.log(
    `[ingest-worker] outlets=${selected.length}/${allOutlets.length} endpoints=${attempted} ok=${okEndpoints} failed=${failedEndpoints} backoff=${failingKeys.size}(sitemapDisabled=${fallbackSummary.sitemapEndpointSkipped}) ` +
    `method_stats= [rss attempted=${methodStats.rss.attempted}, ok=${methodStats.rss.ok}, fail=${methodStats.rss.fail}(${percent(methodStats.rss.fail, methodStats.rss.attempted)}%); ` +
    `[sitemap attempted=${methodStats.sitemap.attempted}, ok=${methodStats.sitemap.ok}, fail=${methodStats.sitemap.fail}(${percent(methodStats.sitemap.fail, methodStats.sitemap.attempted)}%)] ` +
    `sitemapFallback=${fallbackSummary.rssSitemapFallbackSuccess}/${fallbackSummary.rssSitemapFallbackAttempts} skipped=${fallbackSummary.rssSitemapFallbackSkipped} unique=${merged.length} persisted=${persistedExternal.persisted} external=${persistedExternal.persisted} elapsedMs=${summary.elapsedMs}`
  );
}

async function main(): Promise<void> {
  const once = process.argv.includes('--once');
  if (once) {
    await runOnce();
    return;
  }

  console.log(`[ingest-worker] loop start interval=${LOOP_INTERVAL_SEC}s`);
  for (;;) {
    try {
      await runOnce();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[ingest-worker] run failed: ${message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, LOOP_INTERVAL_SEC * 1000));
  }
}

void main();
