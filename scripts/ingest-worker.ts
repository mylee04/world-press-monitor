import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { isKnownNonArticleUrl } from '../lib/article-url-filters';
import { extractArticlePageTitle } from '../lib/article-page-title';
import { buildArticlePageFetchHeaders } from '../lib/article-page-fetch';
import { parseRssOrAtomWithStats, parseSitemapWithStats } from '../lib/parsers';
import { inferSourceCategoriesFromUrlPath } from '../lib/source-category-path-segments';
import {
  looksLikeLowSignalArticleTitle,
  normalizeArticleTitle,
  normalizeHtmlText,
  normalizeReadableArticleTitle,
} from '../lib/html-entities';
import { assessNewsTitle, newsTitleQualityRank } from '../lib/title-quality';
import { runWithConcurrency } from '../lib/concurrency';
import { fetchWithRetry, readResponseText } from '../lib/fetch-utils';
import { deriveSectionFromContext, mapFeedCategoryToSection } from '../lib/article-section-context';
import { extractSourceCategoriesFromArticlePage } from '../lib/article-page-section';
import { normalizeSourceCategories } from '../lib/article-taxonomy';
import { classifySection, classifySectionByKeyword } from '../lib/keyword-classifier';
import { inferGeoFromArticleSignals } from '../lib/geo';
import { buildFeedStableId } from '../lib/pipeline';
import {
  buildMethodStats,
  ensureWorkerAuditsDir,
  filterItemsForPersistence,
  pickOutletChunk,
  writeWorkerState,
  type BackfillWindow,
} from './ingest-worker-support';
import {
  buildDisabledSitemapOutletIds,
  buildEndpointRuns,
  buildFailingEndpointSet,
  buildSitemapExecutionPlan,
  type EndpointRun,
} from './ingest-worker-selection';
import { buildWorkerSummary, formatWorkerSummaryLog, summarizeEndpointResults } from './ingest-worker-summary';
import {
  readFailingEndpointBackoff,
  readIngestionFeedWatermarks,
  readSitemapPolicyStates,
  persistNewsArticles,
  persistMissingPublishedAtCandidates,
  persistIngestionDiagnostics,
  upsertSitemapPolicyStates,
  upsertIngestionFeedWatermarks,
  type IngestionEndpointRun,
  type MissingPublishedAtCandidate,
} from '../lib/ingestion-store';
import type { EndpointBackoffRow, SitemapPolicyState } from '../lib/news-ops-store';
import type { NewsItem, OutletFeed, OutletTier } from '../lib/types';

const FETCH_TIMEOUT_MS = Math.max(
  3000,
  Math.min(30000, Number.parseInt(process.env.INGEST_FETCH_TIMEOUT_MS || '12000', 10) || 12000)
);
const RSS_ITEM_LIMIT = Math.max(10, Math.min(5000, Number.parseInt(process.env.INGEST_RSS_LIMIT || '2000', 10) || 2000));
const SITEMAP_ITEM_LIMIT = Math.max(
  10,
  Math.min(5000, Number.parseInt(process.env.INGEST_SITEMAP_LIMIT || '2000', 10) || 2000)
);
const ITEM_MAP_CONCURRENCY = Math.max(
  4,
  Math.min(64, Number.parseInt(process.env.INGEST_ITEM_MAP_CONCURRENCY || '24', 10) || 24)
);
const SITEMAP_INDEX_CHILDREN_LIMIT = Math.max(
  1,
  Math.min(96, Number.parseInt(process.env.INGEST_SITEMAP_INDEX_CHILDREN || '48', 10) || 48)
);
const SITEMAP_INDEX_MAX_DEPTH = Math.max(
  1,
  Math.min(5, Number.parseInt(process.env.INGEST_SITEMAP_INDEX_MAX_DEPTH || '4', 10) || 4)
);
const SITEMAP_CANDIDATE_LIMIT = Math.max(
  4,
  Math.min(24, Number.parseInt(process.env.INGEST_SITEMAP_CANDIDATE_LIMIT || '12', 10) || 12)
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
const SITEMAP_TEMP_DISABLE_DAYS = Math.max(
  1,
  Number.parseInt(process.env.INGEST_SITEMAP_TEMP_DISABLE_DAYS || '7', 10) || 7
);
const SITEMAP_PERMANENT_RECHECK_DAYS = Math.max(
  7,
  Number.parseInt(process.env.INGEST_SITEMAP_PERMANENT_RECHECK_DAYS || '30', 10) || 30
);
const FEED_HOST_ALLOWLIST = process.env.INGEST_FEED_HOST_ALLOWLIST || '';
const FEED_MAX_REDIRECTS = Math.max(0, Math.min(20, Number.parseInt(process.env.INGEST_FEED_MAX_REDIRECTS || '8', 10) || 8));
const ENABLE_BROWSER_SITEMAP_FALLBACK = parseBoolEnv(process.env.INGEST_BROWSER_SITEMAP_FALLBACK, true);
const BROWSER_SITEMAP_FALLBACK_DOMAINS = new Set(
  (
    process.env.INGEST_BROWSER_SITEMAP_DOMAINS ||
    'www.ouest-france.fr,www.standaard.be,www.nieuwsblad.be,www.gva.be,www.hbvl.be,www.rtl.be,rtl.be,www.blick.ch,blick.ch,www.pna.gov.ph,pna.gov.ph,businessmirror.com.ph,www.malaya.com.ph,malaya.com.ph,manilastandard.net,www.manilastandard.net,news.abs-cbn.com'
  )
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);
const BROWSER_SITEMAP_HELPER = resolve(process.cwd(), 'scripts/fetch-sitemap-browser.mjs');
const SITEMAP_TEMPORARY_DISABLE_THRESHOLD = Math.max(
  1,
  Number.parseInt(process.env.INGEST_SITEMAP_TEMP_DISABLE_FAILS || '2', 10) || 2
);
const SITEMAP_PERMANENT_404_THRESHOLD = Math.max(
  2,
  Number.parseInt(process.env.INGEST_SITEMAP_404_PERMANENT_THRESHOLD || '3', 10) || 3
);
const DROP_ITEMS_WITHOUT_PUBLISHED_AT = parseBoolEnv(process.env.INGEST_DROP_ITEMS_WITHOUT_PUBLISHED_AT, true);
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
  category?: string | null;
  tier?: number | null;
  language?: string | null;
  sourceType?: string | null;
  enabled?: boolean;
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
  ensureWorkerAuditsDir(process.cwd());
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

function coerceOutletTier(value: number | null | undefined): OutletTier {
  return value === 1 || value === 2 || value === 3 ? value : 1;
}

function deriveOutletSection(name: string, url: string, category?: string | null): NewsItem['section'] {
  const mappedCategorySection = mapFeedCategoryToSection(category);
  if (mappedCategorySection) return mappedCategorySection;

  const hintSection = classifySectionByKeyword(`${name} ${url}`, 'others').section;
  if (hintSection !== 'others') return hintSection;

  const contextSection = deriveSectionFromContext({ source: name, url, title: name });
  if (contextSection !== 'others') return contextSection;

  return 'others';
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
      .filter((feed): feed is AtlasFeed => {
        if (feed.enabled === false) return false;
        const hasRssUrl = feed.url !== null && typeof feed.url === 'string' && feed.url.trim().length > 0;
        const hasExplicitSitemapUrl = typeof feed.sitemapUrl === 'string' && feed.sitemapUrl.trim().length > 0;
        return hasRssUrl || hasExplicitSitemapUrl;
      })
        .map((feed) => ({
          name: feed.name || 'Unknown source',
          category: typeof feed.category === 'string' ? feed.category.trim() : undefined,
          tier: feed.tier,
          language: typeof feed.language === 'string' ? feed.language.trim() : undefined,
          sourceType: typeof feed.sourceType === 'string' ? feed.sourceType.trim().toLowerCase() : undefined,
          rssUrl:
            typeof feed.url === 'string' && feed.url.trim().length > 0
              ? feed.url.trim()
              : undefined,
          explicitSitemapUrl:
            typeof feed.sitemapUrl === 'string' && feed.sitemapUrl.trim().length > 0
              ? feed.sitemapUrl.trim()
              : undefined,
        }))
        .map((feed) => {
          const outletUrl = feed.rssUrl || feed.explicitSitemapUrl || '';
          const section = deriveOutletSection(feed.name, outletUrl, feed.category);
          return {
            id: makeOutletId(countryName, feed.name, feed.rssUrl || feed.explicitSitemapUrl || feed.name),
            name: feed.name,
            tier: coerceOutletTier(feed.tier),
            section,
            categories: ['global'],
            language: feed.language || undefined,
            sourceType: feed.sourceType === 'local' || feed.sourceType === 'portal' ? feed.sourceType : 'global',
            reviewDecision: 'keep_secondary',
            defaultEnabled: true,
            country: countryName,
            rssUrl: feed.rssUrl,
            sitemapUrl:
              feed.explicitSitemapUrl ?? (feed.rssUrl ? buildSitemapFallbackUrls(feed.rssUrl)[0] : undefined),
            hasExplicitSitemapUrl: Boolean(feed.explicitSitemapUrl),
          } satisfies OutletFeed;
        });
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

type SitemapIndexEntry = {
  loc: string;
  lastmodMs: number | null;
  locDateMs: number | null;
  locNumericTail: number | null;
  index: number;
};

function decodeXmlEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const codePoint = Number.parseInt(hex, 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _;
    })
    .replace(/&#([0-9]+);/g, (_, dec: string) => {
      const codePoint = Number.parseInt(dec, 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _;
    })
    .replace(/&amp;/gi, '&')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim();
}

function parseSitemapIndexLocDateMs(loc: string): number | null {
  const normalized = decodeXmlEntities(loc);
  const slashPattern = normalized.match(/(20\d{2})\/(0[1-9]|1[0-2])\/([0-2]\d|3[01])/);
  if (slashPattern) {
    const ts = Date.parse(`${slashPattern[1]}-${slashPattern[2]}-${slashPattern[3]}T00:00:00Z`);
    return Number.isFinite(ts) ? ts : null;
  }
  const dashPattern = normalized.match(/(20\d{2})-(0[1-9]|1[0-2])-([0-2]\d|3[01])/);
  if (dashPattern) {
    const ts = Date.parse(`${dashPattern[1]}-${dashPattern[2]}-${dashPattern[3]}T00:00:00Z`);
    return Number.isFinite(ts) ? ts : null;
  }

  try {
    const parsedUrl = new URL(normalized);
    const year = parsedUrl.searchParams.get('yyyy') || parsedUrl.searchParams.get('year');
    const month = parsedUrl.searchParams.get('mm') || parsedUrl.searchParams.get('month');
    const day = parsedUrl.searchParams.get('dd') || parsedUrl.searchParams.get('day');
    if (year && month && day) {
      const ts = Date.parse(`${year}-${month}-${day}T00:00:00Z`);
      return Number.isFinite(ts) ? ts : null;
    }
  } catch {
    // Ignore malformed URLs and fall through.
  }

  return null;
}

function parseSitemapIndexLocNumericTail(loc: string): number | null {
  const normalized = decodeXmlEntities(loc);
  try {
    const parsedUrl = new URL(normalized);
    const fromParam = parsedUrl.searchParams.get('from');
    if (fromParam) {
      const parsedFrom = Number.parseInt(fromParam, 10);
      if (Number.isFinite(parsedFrom)) return -parsedFrom;
    }
  } catch {
    // Ignore malformed URLs and fall through.
  }
  const match = normalized.match(/(\d+)(?!.*\d)/);
  if (!match) return null;
  const parsed = Number.parseInt(match[1] || '', 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveSitemapLoc(loc: string, baseUrl: string | null): string {
  const normalized = decodeXmlEntities(loc);
  if (!normalized || !baseUrl) return normalized;
  try {
    return new URL(normalized, baseUrl).toString();
  } catch {
    return normalized;
  }
}

function parseSitemapIndex(xml: string, baseUrl: string | null = null): string[] {
  if (!/<sitemapindex[\s>]/i.test(xml)) return [];
  const entries = [...xml.matchAll(/<sitemap>([\s\S]*?)<\/sitemap>/gi)]
    .map((match, index) => {
      const body = match[1] || '';
      const loc = resolveSitemapLoc(body.match(/<loc[^>]*>([\s\S]*?)<\/loc>/i)?.[1]?.trim() || '', baseUrl);
      const lastmodRaw = body.match(/<lastmod[^>]*>([\s\S]*?)<\/lastmod>/i)?.[1]?.trim() || '';
      const lastmodMs = lastmodRaw ? Date.parse(lastmodRaw) : NaN;
      return {
        loc,
        lastmodMs: Number.isFinite(lastmodMs) ? lastmodMs : null,
        locDateMs: parseSitemapIndexLocDateMs(loc),
        locNumericTail: parseSitemapIndexLocNumericTail(loc),
        index,
      } satisfies SitemapIndexEntry;
    })
    .filter((entry) => Boolean(entry.loc));

  entries.sort((left, right) => {
    const leftLastmod = left.lastmodMs ?? Number.NEGATIVE_INFINITY;
    const rightLastmod = right.lastmodMs ?? Number.NEGATIVE_INFINITY;
    if (rightLastmod !== leftLastmod) return rightLastmod - leftLastmod;

    const leftLocDate = left.locDateMs ?? Number.NEGATIVE_INFINITY;
    const rightLocDate = right.locDateMs ?? Number.NEGATIVE_INFINITY;
    if (rightLocDate !== leftLocDate) return rightLocDate - leftLocDate;

    const leftLocNumericTail = left.locNumericTail ?? Number.NEGATIVE_INFINITY;
    const rightLocNumericTail = right.locNumericTail ?? Number.NEGATIVE_INFINITY;
    if (rightLocNumericTail !== leftLocNumericTail) return rightLocNumericTail - leftLocNumericTail;

    return right.index - left.index;
  });

  return entries
    .slice(0, SITEMAP_INDEX_CHILDREN_LIMIT)
    .map((entry) => entry.loc);
}

function normalizeHtmlListingPublishedAt(value: string): string | undefined {
  const isoCandidate = value.trim();
  if (/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(isoCandidate)) {
    const normalized = new Date(isoCandidate);
    if (!Number.isNaN(normalized.getTime())) {
      return normalized.toISOString();
    }
  }
  const match = value.match(/(20\d{2})[.\-/](\d{2})[.\-/](\d{2})/);
  if (!match) return undefined;
  const [, year, month, day] = match;
  return `${year}-${month}-${day}T12:00:00.000Z`;
}

function normalizeBloombergTvPublishedAt(value: string): string | undefined {
  const match = value.trim().match(/^(20\d{2}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/);
  if (!match) return normalizeHtmlListingPublishedAt(value);
  return `${match[1]}T${match[2]}+08:00`;
}

function parseUbLifeHomepageRows(pageUrl: string, html: string): Array<{
  title: string;
  description?: string;
  link: string;
  publishedAt?: string;
}> {
  const rows: Array<{ title: string; description?: string; link: string; publishedAt?: string }> = [];
  const seen = new Set<string>();
  const pattern = /<a[^>]+href="(\/p\/[^"]+)"[\s\S]{0,2500}?<h2[^>]*>([\s\S]{10,240}?)<\/h2>[\s\S]{0,1200}?(?:<p[^>]*>([\s\S]{0,400}?)<\/p>[\s\S]{0,800}?)?<time[^>]*>(20\d{2}[.\-/]\d{2}[.\-/]\d{2})<\/time>/gi;
  for (const match of html.matchAll(pattern)) {
    const rawLink = match[1] || '';
    const title = normalizeHtmlText(match[2] || '');
    const description = normalizeHtmlText(match[3] || '');
    const publishedAt = normalizeHtmlListingPublishedAt(match[4] || '');
    if (!rawLink || !title || !publishedAt) continue;
    const link = new URL(rawLink, pageUrl).toString();
    if (seen.has(link)) continue;
    seen.add(link);
    rows.push({ title, description: description || undefined, link, publishedAt });
    if (rows.length >= SITEMAP_ITEM_LIMIT) break;
  }
  return rows;
}

function parseHtmlListingRows(pageUrl: string, html: string): Array<{
  title: string;
  description?: string;
  link: string;
  publishedAt?: string;
}> {
  try {
    const host = new URL(pageUrl).hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'ub.life') {
      return parseUbLifeHomepageRows(pageUrl, html);
    }
  } catch {
    return [];
  }
  return [];
}

async function fetchGogoHomepageRows(pageUrl: string, html: string): Promise<Array<{
  title: string;
  description?: string;
  link: string;
  publishedAt?: string;
}>> {
  const rows: Array<{ title: string; description?: string; link: string; publishedAt?: string }> = [];
  const seen = new Set<string>();
  const articlePaths = Array.from(new Set(Array.from(html.matchAll(/href="(\/r\/[^"]+)"/gi)).map((match) => match[1] || '')))
    .filter(Boolean)
    .slice(0, 12);
  for (const rawPath of articlePaths) {
    try {
      const link = new URL(rawPath, pageUrl).toString();
      if (seen.has(link)) continue;
      const response = await fetchWithRetryFeed(link);
      if (!response.ok) continue;
      const responseBody = await readResponseBody(response);
      const articleHtml = responseBody.body;
      const titleMatch = articleHtml.match(/<title>([\s\S]{5,260}?)<\/title>/i);
      const publishedAtMatch = articleHtml.match(/(20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+Z0-9:-]*)/);
      const title = normalizeHtmlText(titleMatch?.[1] || '');
      const publishedAt = normalizeHtmlListingPublishedAt(publishedAtMatch?.[1] || '');
      if (!title || !publishedAt) continue;
      seen.add(link);
      rows.push({ title, link, publishedAt });
      if (rows.length >= 10) break;
    } catch {
      continue;
    }
  }
  return rows;
}

async function fetchBloombergTvMongoliaRows(pageUrl: string): Promise<Array<{
  title: string;
  description?: string;
  link: string;
  publishedAt?: string;
}>> {
  const rows: Array<{ title: string; description?: string; link: string; publishedAt?: string }> = [];
  const seen = new Set<string>();
  const endpoints = [
    '/api/public/news/topfeatured',
    '/api/public/news/featured',
    '/api/public/news/leftlatestnews',
    '/api/public/news/leftFeaturedNews',
    '/api/public/news/bodyMiddleNews'
  ];
  for (const endpoint of endpoints) {
    try {
      const url = new URL(endpoint, pageUrl).toString();
      const response = await fetchWithRetryFeed(url);
      if (!response.ok) continue;
      const responseBody = await readResponseBody(response);
      const payload = JSON.parse(responseBody.body);
      const items = endpoint.endsWith('/bodyMiddleNews')
        ? (Array.isArray(payload)
          ? payload.flatMap((entry) => Array.isArray(entry?.news) ? entry.news : [])
          : [])
        : (Array.isArray(payload) ? payload : []);
      for (const item of items) {
        const slug = typeof item?.slug === 'string' ? item.slug.trim() : '';
        const title = normalizeHtmlText(typeof item?.title === 'string' ? item.title : '');
        const description = normalizeHtmlText(typeof item?.description === 'string' ? item.description : '');
        const publishedAt = normalizeBloombergTvPublishedAt(typeof item?.createdAt === 'string' ? item.createdAt : '');
        if (!slug || !title || !publishedAt) continue;
        const link = new URL(`/news/${slug}`, pageUrl).toString();
        if (seen.has(link)) continue;
        seen.add(link);
        rows.push({ title, description: description || undefined, link, publishedAt });
        if (rows.length >= SITEMAP_ITEM_LIMIT) {
          return rows;
        }
      }
    } catch {
      continue;
    }
  }
  return rows;
}

type ParsedSitemapResult = ReturnType<typeof parseSitemapWithStats>;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const INGEST_MAX_ARTICLE_AGE_DAYS = Math.max(1, Math.min(3650, Number.parseInt(process.env.INGEST_MAX_ARTICLE_AGE_DAYS || '365', 10) || 365));
const INGEST_MAX_ARTICLE_AGE_MS = INGEST_MAX_ARTICLE_AGE_DAYS * ONE_DAY_MS;
const MAX_CONSECUTIVE_DEFAULT = 0;

type EndpointRunPolicyState = {
  outletId: string;
  source: string;
  country: string;
  status: SitemapPolicyState['status'];
  reason: string | null;
  lastFailureReason: string | null;
  consecutiveFailures: number;
  disabledUntil: string | null;
  lastAttemptedAt: string | null;
  disabledSince: string | null;
  lastSuccessAt: string | null;
  lastCheckedAt: string | null;
};

type SitemapPolicyFailure = {
  policyKind: 'permanent' | 'temporary';
  reason: string;
};

type SitemapPolicyUpdateInput = {
  endpoint: EndpointResult;
  baseState: SitemapPolicyState;
  nowMs: number;
  nowIso: string;
  sourceKey: string;
  sourceAliveKeys: Set<string>;
  sourceCounts: Map<string, number>;
};

function normalizeFailureText(value: string | undefined): string {
  return (value || '').toLowerCase().trim();
}

function isSitemapPolicyBlocked(state: SitemapPolicyState | undefined, nowMs: number): boolean {
  if (!state || state.status === 'active') return false;
  if (!state.disabledUntil) return false;
  const disabledUntil = Date.parse(state.disabledUntil);
  return Number.isFinite(disabledUntil) && disabledUntil > nowMs;
}

function buildSitemapSourceKey(source: string, country: string): string {
  return `${source}::${normalizeCountryName(country)}`;
}

function buildPolicyDateIso(baseMs: number, addDays: number): string {
  return new Date(baseMs + Math.max(0, addDays) * ONE_DAY_MS).toISOString();
}

function classifySitemapFailureForPolicy(run: IngestionEndpointRun): SitemapPolicyFailure | null {
  if (run.method !== 'sitemap' || !run.attempted || run.ok) return null;
  const status = run.statusCode;
  const error = normalizeFailureText(run.error);

  if (status === 410) return { policyKind: 'permanent', reason: 'http_410' };
  if (status === 301 || status === 308 || error.includes('permanent_moved') || error.includes('moved permanently')) {
    return { policyKind: 'permanent', reason: 'permanent_moved' };
  }

  if (status === 404 || error === 'http_404') {
    return { policyKind: 'temporary', reason: 'http_404' };
  }

  if (status === 403 || status === 500 || status === 502 || status === 503 || status === 504) {
    return { policyKind: 'temporary', reason: `http_${status}` };
  }

  if (error.includes('timeout') || error.includes('timed out')) {
    return { policyKind: 'temporary', reason: 'timeout' };
  }

  if (error.includes('network_error') || error.includes('operation was aborted') || error.includes('aborted') || error.includes('abort')) {
    return { policyKind: 'temporary', reason: 'network_error' };
  }

  return null;
}

function buildSitemapPolicyStateFromRun(input: SitemapPolicyUpdateInput): EndpointRunPolicyState {
  const { endpoint, baseState, nowMs, nowIso, sourceKey, sourceAliveKeys, sourceCounts } = input;
  const run = endpoint.run;
  const sourceCount = sourceCounts.get(sourceKey) || 0;
  const currentFailures = Number.isFinite(baseState.consecutiveFailures) ? baseState.consecutiveFailures : MAX_CONSECUTIVE_DEFAULT;

  if (!run.attempted) {
    return {
      outletId: run.outletId,
      source: run.source,
      country: run.country,
      status: baseState.status,
      reason: baseState.status === 'active' ? null : baseState.reason,
      lastFailureReason: baseState.lastFailureReason,
      consecutiveFailures: currentFailures,
      disabledUntil: baseState.disabledUntil,
      lastAttemptedAt: baseState.lastAttemptedAt,
      disabledSince: baseState.disabledSince,
      lastSuccessAt: baseState.lastSuccessAt,
      lastCheckedAt: nowIso,
    };
  }

  if (run.ok) {
    return {
      outletId: run.outletId,
      source: run.source,
      country: run.country,
      status: 'active',
      reason: null,
      lastFailureReason: null,
      consecutiveFailures: 0,
      disabledUntil: null,
      lastAttemptedAt: nowIso,
      disabledSince: null,
      lastSuccessAt: nowIso,
      lastCheckedAt: nowIso,
    };
  }

  const nextConsecutiveFailures = currentFailures + 1;
  const failure = classifySitemapFailureForPolicy(run);
  const lastFailureReason = failure ? failure.reason : normalizeFailureText(run.error) || 'unknown_failure';
  const isHttp404 = failure?.reason === 'http_404';
  const hasDuplicateAliveSource = sourceCount > 1 && sourceAliveKeys.has(sourceKey);

  let status = baseState.status;
  let reason = baseState.reason;
  let disabledUntil = baseState.disabledUntil;
  let disabledSince = baseState.disabledSince;

  if (failure) {
    if (failure.policyKind === 'permanent' || (isHttp404 && (hasDuplicateAliveSource || nextConsecutiveFailures >= SITEMAP_PERMANENT_404_THRESHOLD))) {
      status = 'disabled_permanent';
      reason = failure.reason;
      disabledSince = baseState.disabledSince || nowIso;
      disabledUntil = buildPolicyDateIso(nowMs, SITEMAP_PERMANENT_RECHECK_DAYS);
    } else if (failure.policyKind === 'temporary') {
      if (nextConsecutiveFailures >= SITEMAP_TEMPORARY_DISABLE_THRESHOLD) {
        status = 'disabled_temporary';
        reason = failure.reason;
        disabledSince = baseState.disabledSince || nowIso;
        disabledUntil = buildPolicyDateIso(nowMs, SITEMAP_TEMP_DISABLE_DAYS);
      } else {
        status = baseState.status;
        reason = baseState.status === 'active' ? null : baseState.reason;
      }
    }
  } else if (baseState.status !== 'active') {
    status = baseState.status;
    reason = baseState.reason;
    const baseDisabledUntil = baseState.disabledUntil ? Date.parse(baseState.disabledUntil) : Number.NaN;
    const needsCooldownRefresh = !baseState.disabledUntil || !Number.isFinite(baseDisabledUntil) || baseDisabledUntil <= nowMs;
    if (needsCooldownRefresh) {
      disabledSince = baseState.disabledSince || nowIso;
      disabledUntil = buildPolicyDateIso(nowMs, baseState.status === 'disabled_temporary' ? SITEMAP_TEMP_DISABLE_DAYS : SITEMAP_PERMANENT_RECHECK_DAYS);
    }
  }

  if (!failure && status === 'active') {
    reason = null;
  }

  return {
    outletId: run.outletId,
    source: run.source,
    country: run.country,
    status,
    reason,
    lastFailureReason,
    consecutiveFailures: nextConsecutiveFailures,
    disabledUntil,
    lastAttemptedAt: nowIso,
    disabledSince,
    lastSuccessAt: baseState.lastSuccessAt,
    lastCheckedAt: nowIso,
  };
}

function parseBoolEnv(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(raw.trim());
}

type CountryFilter = {
  display: string[];
  normalized: Set<string>;
};

type EndpointMethod = 'rss' | 'sitemap';

type SourceFilter = {
  display: string[];
  normalized: Set<string>;
};

type MethodFilter = {
  display: EndpointMethod[];
  allowed: Set<EndpointMethod>;
};

function parseCountryFilter(argv: string[], envValue: string | undefined): CountryFilter | null {
  const values: string[] = [];

  const pushCsv = (raw: string | undefined): void => {
    if (!raw) return;
    raw
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .forEach((part) => values.push(part));
  };

  pushCsv(envValue);
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--countries=')) {
      pushCsv(token.slice('--countries='.length));
      continue;
    }
    if (token === '--countries') {
      pushCsv(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token.startsWith('--country=')) {
      pushCsv(token.slice('--country='.length));
      continue;
    }
    if (token === '--country') {
      pushCsv(argv[i + 1]);
      i += 1;
      continue;
    }
  }

  if (values.length === 0) return null;
  const dedupedDisplay = [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
  if (dedupedDisplay.length === 0) return null;
  return {
    display: dedupedDisplay,
    normalized: new Set(dedupedDisplay.map((value) => normalizeText(value))),
  };
}

function countryMatchesFilter(country: string | undefined, filter: CountryFilter | null): boolean {
  if (!filter) return true;
  const normalizedCountry = normalizeText(normalizeCountryName(country || ''));
  return filter.normalized.has(normalizedCountry);
}

const COUNTRY_FILTER = parseCountryFilter(process.argv.slice(2), process.env.INGEST_COUNTRIES);

function parseSourceFilter(argv: string[], envValue: string | undefined): SourceFilter | null {
  const values: string[] = [];

  const pushCsv = (raw: string | undefined): void => {
    if (!raw) return;
    raw
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .forEach((part) => values.push(part));
  };

  pushCsv(envValue);
  pushCsv(process.env.INGEST_SOURCE);
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--sources=')) {
      pushCsv(token.slice('--sources='.length));
      continue;
    }
    if (token === '--sources') {
      pushCsv(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token.startsWith('--source=')) {
      pushCsv(token.slice('--source='.length));
      continue;
    }
    if (token === '--source') {
      pushCsv(argv[i + 1]);
      i += 1;
      continue;
    }
  }

  if (values.length === 0) return null;
  const dedupedDisplay = [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
  if (dedupedDisplay.length === 0) return null;
  return {
    display: dedupedDisplay,
    normalized: new Set(dedupedDisplay.map((value) => normalizeText(value))),
  };
}

function sourceMatchesFilter(source: string | undefined, filter: SourceFilter | null): boolean {
  if (!filter) return true;
  return filter.normalized.has(normalizeText(source || ''));
}

const SOURCE_FILTER = parseSourceFilter(process.argv.slice(2), process.env.INGEST_SOURCES);

function parseMethodFilter(argv: string[], envValue: string | undefined): MethodFilter | null {
  const values: string[] = [];

  const pushCsv = (raw: string | undefined): void => {
    if (!raw) return;
    raw
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter((part) => part.length > 0)
      .forEach((part) => values.push(part));
  };

  pushCsv(envValue);
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--methods=')) {
      pushCsv(token.slice('--methods='.length));
      continue;
    }
    if (token === '--methods') {
      pushCsv(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token.startsWith('--method=')) {
      pushCsv(token.slice('--method='.length));
      continue;
    }
    if (token === '--method') {
      pushCsv(argv[i + 1]);
      i += 1;
      continue;
    }
  }

  const normalized = [...new Set(values)].filter((value): value is EndpointMethod => value === 'rss' || value === 'sitemap');
  if (normalized.length === 0) return null;
  return {
    display: normalized,
    allowed: new Set(normalized),
  };
}

function methodMatchesFilter(method: EndpointMethod, filter: MethodFilter | null): boolean {
  if (!filter) return true;
  return filter.allowed.has(method);
}

const METHOD_FILTER = parseMethodFilter(process.argv.slice(2), process.env.INGEST_METHODS);

function parseDateOnlyUtc(raw: string | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const parsed = new Date(`${trimmed}T00:00:00.000Z`).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBackfillWindow(argv: string[], envFrom: string | undefined, envTo: string | undefined): BackfillWindow | null {
  let from = envFrom?.trim() || '';
  let to = envTo?.trim() || '';

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--backfill-from=')) {
      from = token.slice('--backfill-from='.length).trim();
      continue;
    }
    if (token === '--backfill-from') {
      from = (argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (token.startsWith('--backfill-to=')) {
      to = token.slice('--backfill-to='.length).trim();
      continue;
    }
    if (token === '--backfill-to') {
      to = (argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
  }

  if (!from || !to) return null;
  const fromMs = parseDateOnlyUtc(from);
  const toMs = parseDateOnlyUtc(to);
  if (fromMs === null || toMs === null || toMs < fromMs) {
    throw new Error(`Invalid backfill window: from=${from || '-'} to=${to || '-'}`);
  }

  return {
    from,
    to,
    fromMs,
    toExclusiveMs: toMs + ONE_DAY_MS,
  };
}

const BACKFILL_WINDOW = parseBackfillWindow(
  process.argv.slice(2),
  process.env.INGEST_BACKFILL_FROM,
  process.env.INGEST_BACKFILL_TO
);
const BACKFILL_IGNORE_WATERMARK = BACKFILL_WINDOW
  ? parseBoolEnv(process.env.INGEST_BACKFILL_IGNORE_WATERMARK, true)
  : false;
const BACKFILL_IGNORE_BACKOFF = BACKFILL_WINDOW
  ? parseBoolEnv(process.env.INGEST_BACKFILL_IGNORE_BACKOFF, true)
  : false;

function normalizeDedupeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function scoreItemUrlAgainstTitle(item: NewsItem): number {
  const normalizedTitle = normalizeDedupeText(item.title || '');
  if (!normalizedTitle) return 0;
  const titleTokens = new Set(normalizedTitle.split(' ').filter((token) => token.length >= 4));
  if (!titleTokens.size) return 0;

  let pathname = '';
  try {
    pathname = new URL(item.link).pathname;
  } catch {
    pathname = item.link || '';
  }
  const urlTokens = new Set(normalizeDedupeText(pathname).split(' ').filter((token) => token.length >= 4));
  if (!urlTokens.size) return 0;

  let overlap = 0;
  for (const token of titleTokens) {
    if (urlTokens.has(token)) overlap += 1;
  }
  return overlap / titleTokens.size + Math.min(pathname.split('/').filter(Boolean).length, 6) * 0.01;
}

function mergeNewsItems(current: NewsItem, incoming: NewsItem): NewsItem {
  const currentPublishedAt = new Date(current.publishedAt).getTime();
  const incomingPublishedAt = new Date(incoming.publishedAt).getTime();
  const currentScore =
    scoreItemUrlAgainstTitle(current)
    + (current.description ? Math.min(current.description.length, 400) / 10000 : 0)
    + (current.publishedAtIsFallback ? 0 : 0.02)
    + newsTitleQualityRank(current.titleQuality) * 0.05;
  const incomingScore =
    scoreItemUrlAgainstTitle(incoming)
    + (incoming.description ? Math.min(incoming.description.length, 400) / 10000 : 0)
    + (incoming.publishedAtIsFallback ? 0 : 0.02)
    + newsTitleQualityRank(incoming.titleQuality) * 0.05;

  const preferred =
    incomingPublishedAt > currentPublishedAt
      ? incoming
      : incomingPublishedAt < currentPublishedAt
        ? current
        : incomingScore > currentScore
          ? incoming
          : current;
  const secondary = preferred === incoming ? current : incoming;

  return {
    ...secondary,
    ...preferred,
    stableId: preferred.stableId || secondary.stableId,
    sourceCategories: [...new Set([...(secondary.sourceCategories || []), ...(preferred.sourceCategories || [])])],
    description: preferred.description || secondary.description,
    classificationReason: preferred.classificationReason || secondary.classificationReason,
    titleQuality: preferred.titleQuality || secondary.titleQuality,
    titleQualityReason: preferred.titleQualityReason || secondary.titleQualityReason,
    titleQualityCheckedAt: preferred.titleQualityCheckedAt || secondary.titleQualityCheckedAt,
    titleRepairStatus: preferred.titleRepairStatus || secondary.titleRepairStatus,
    titleRepairSource: preferred.titleRepairSource || secondary.titleRepairSource,
    titleRepairAttemptedAt: preferred.titleRepairAttemptedAt || secondary.titleRepairAttemptedAt,
    titleRepairedAt: preferred.titleRepairedAt || secondary.titleRepairedAt,
  };
}

function normalizeFeedHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.+$/, '');
}

const feedHostAllowlist = (() => {
  const normalized = FEED_HOST_ALLOWLIST.split(',')
    .map((entry) => normalizeFeedHost(entry))
    .filter((entry) => entry.length > 0);
  return new Set(normalized);
})();

function isIpPrivateOrLoopback(hostname: string): boolean {
  if (!hostname) {
    return true;
  }
  const ipVersion = isIP(hostname);
  if (ipVersion === 0) return false;
  if (ipVersion === 4) {
    const octets = hostname.split('.').map((value) => Number.parseInt(value, 10));
    if (octets.some((value) => Number.isNaN(value))) return true;
    if (hostname.startsWith('127.')) return true;
    if (hostname.startsWith('10.')) return true;
    if (hostname.startsWith('172.') && Number.isInteger(octets[1]) && octets[1] >= 16 && octets[1] <= 31) return true;
    if (hostname.startsWith('192.168.')) return true;
    if (hostname.startsWith('169.254.')) return true;
    return false;
  }

  const normalized = hostname.toLowerCase();
  return normalized.startsWith('fe80') || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized === '::1' || normalized === '::';
}

function isDisallowedHostname(hostname: string): boolean {
  const normalized = normalizeFeedHost(hostname);
  if (!normalized) return true;
  if (normalized === 'localhost' || normalized.endsWith('.local') || normalized === '.internal') return true;
  if (normalized.endsWith('.localhost') || normalized === 'ip6-localhost') return true;
  if (normalized.includes('://')) return true;
  if (normalized.startsWith('[') && normalized.endsWith(']')) return true;
  if (/^localhost\./.test(normalized)) return true;
  return false;
}

const dnsIpValidationCache = new Map<string, { disallowed: boolean; checkedAt: number }>();
const DNS_IP_CACHE_TTL_MS = 5 * 60 * 1000;
const robotsSitemapCache = new Map<string, string[]>();

async function isHostResolvedToDisallowedIp(hostname: string): Promise<boolean> {
  const cached = dnsIpValidationCache.get(hostname);
  if (cached && Date.now() - cached.checkedAt < DNS_IP_CACHE_TTL_MS) {
    return cached.disallowed;
  }

  try {
    const entries = await lookup(hostname, { all: true });
    const disallowed = entries.some((entry) => isIpPrivateOrLoopback(entry.address));
    dnsIpValidationCache.set(hostname, { disallowed, checkedAt: Date.now() });
    return disallowed;
  } catch {
    return false;
  }
}

function isAllowlistedHost(hostname: string): boolean {
  if (feedHostAllowlist.size === 0) return true;
  const normalized = normalizeFeedHost(hostname);
  if (feedHostAllowlist.has(normalized)) return true;
  for (const allowed of feedHostAllowlist) {
    if (allowed.startsWith('*.') && normalized.endsWith(allowed.slice(2))) return true;
    if (normalized.endsWith(`.${allowed}`)) return true;
  }
  return false;
}

function assertFeedUrlBlockedError(url: string, reason: string): never {
  throw new Error(`blocked_feed_url:${reason}:${url}`);
}

async function validateFeedUrl(inputUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(inputUrl);
  } catch {
    throw new Error(`blocked_feed_url:invalid_url:${inputUrl}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`blocked_feed_url:invalid_protocol:${parsed.protocol}`);
  }

  const host = normalizeFeedHost(parsed.hostname);
  if (!host) {
    throw new Error(`blocked_feed_url:no_host:${inputUrl}`);
  }

  if (isDisallowedHostname(host)) {
    throw new Error(`blocked_feed_url:disallowed_hostname:${host}`);
  }
  if (!isAllowlistedHost(host)) {
    throw new Error(`blocked_feed_url:host_not_allowlisted:${host}`);
  }
  if (isIpPrivateOrLoopback(host)) {
    throw new Error(`blocked_feed_url:private_or_loopback_host:${host}`);
  }
  const hasPrivateDns = await isHostResolvedToDisallowedIp(host);
  if (hasPrivateDns) {
    throw new Error(`blocked_feed_url:dns_private_ip:${host}`);
  }
}

async function resolveRedirectUrl(baseUrl: string, location: string | null): Promise<string> {
  if (!location) {
    throw new Error('blocked_feed_url:empty_redirect_location');
  }
  try {
    return new URL(location, baseUrl).toString();
  } catch {
    throw new Error(`blocked_feed_url:invalid_redirect:${location}`);
  }
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
    urls.push(`${root}${basePath}news-sitemap.xml`);
    urls.push(`${root}${basePath}news-sitemap-index.xml`);
    urls.push(`${root}${basePath}sitemap_news_index.xml`);
    urls.push(`${root}${basePath}sitemap.xml`);
    urls.push(`${root}${basePath}sitemaps.xml`);
    urls.push(`${root}${basePath}sitemap_index.xml`);
    urls.push(`${root}${basePath}google-news-sitemap.xml`);
    urls.push(`${root}${basePath}sitemaps/googlenews`);
    urls.push(`${root}${basePath}googlenews.xml`);
    urls.push(`${root}${basePath}sitemap_google_news.xml`);
    urls.push(`${root}${basePath}news.xml`);
    urls.push(`${root}${basePath}map_news.xml`);
    urls.push(`${root}/sitemap_news.xml`);
    urls.push(`${root}/sitemap-news.xml`);
    urls.push(`${root}/news-sitemap.xml`);
    urls.push(`${root}/news-sitemap-index.xml`);
    urls.push(`${root}/sitemap_news_index.xml`);
    urls.push(`${root}/sitemap.xml`);
    urls.push(`${root}/sitemaps.xml`);
    urls.push(`${root}/sitemap_index.xml`);
    urls.push(`${root}/sitemaps/news.xml`);
    urls.push(`${root}/sitemaps/googlenews`);
    urls.push(`${root}/sitemaps/index.xml`);
    urls.push(`${root}/google-news-sitemap.xml`);
    urls.push(`${root}/googlenews.xml`);
    urls.push(`${root}/sitemap_google_news.xml`);
    urls.push(`${root}/news.xml`);
    urls.push(`${root}/map_news.xml`);
    urls.push(`${root}/sitemaps/files/articles-48hrs.xml`);
  } catch {
    return dedupeUrls(urls);
  }
  return dedupeUrls(urls);
}

async function extractSitemapUrlsFromRobots(sourceUrl: string): Promise<string[]> {
  try {
    const parsed = new URL(sourceUrl);
    const cached = robotsSitemapCache.get(parsed.origin);
    if (cached) {
      return cached;
    }
    const response = await fetchWithRetryFeed(`${parsed.origin}/robots.txt`);
    if (!response.ok) {
      robotsSitemapCache.set(parsed.origin, []);
      return [];
    }
    const body = await readResponseBody(response);
    const urls = body.body
      .split(/\r?\n/)
      .map((line) => /^sitemap:\s*(.+)$/i.exec(line.trim())?.[1]?.trim() || '')
      .filter(Boolean)
      .flatMap((raw) => {
        try {
          return [new URL(raw, parsed.origin).toString()];
        } catch {
          return [];
        }
      });
    const deduped = dedupeUrls(urls);
    robotsSitemapCache.set(parsed.origin, deduped);
    return deduped;
  } catch {
    return [];
  }
}

function scoreSitemapCandidate(url: string): number {
  const lower = url.toLowerCase();
  const looksLikeNewsXml =
    lower.includes('googlenews') ||
    lower.includes('map_news') ||
    /(?:^|[/?._-])news\.xml(?:$|[?#])/.test(lower);
  if (!lower.includes('sitemap') && !looksLikeNewsXml) return 0;
  let score = lower.includes('sitemap') ? 20 : 15;
  if (lower.includes('news')) score += 100;
  if (lower.includes('google-news')) score += 80;
  if (lower.includes('google_news')) score += 80;
  if (lower.includes('googlenews')) score += 80;
  if (lower.includes('sitemap-news')) score += 60;
  if (lower.includes('sitemap_news')) score += 60;
  if (lower.includes('news-sitemap')) score += 60;
  if (lower.includes('map_news')) score += 80;
  if (/(?:^|[/?._-])news\.xml(?:$|[?#])/.test(lower)) score += 70;
  if (lower.includes('48hrs')) score += 70;
  if (lower.includes('48-hours')) score += 70;
  if (lower.includes('article')) score += 20;
  if (lower.includes('today')) score += 40;
  if (lower.includes('breaking')) score += 30;
  if (lower.includes('daily-news')) score += 40;
  if (lower.includes('sitemap_index')) score += 20;
  if (lower.includes('sitemapindex')) score += 10;
  if (lower.includes('/sitemaps/')) score += 10;
  if (lower.includes('tag') || lower.includes('author') || lower.includes('topic') || lower.includes('section')) score -= 15;
  if (lower.includes('image') || lower.includes('photo') || lower.includes('video')) score -= 20;
  return score;
}

function prioritizeSitemapCandidateUrls(urls: string[]): string[] {
  return dedupeUrls(urls).sort((a, b) => scoreSitemapCandidate(b) - scoreSitemapCandidate(a));
}

async function buildSitemapCandidateUrls(outlet: OutletFeed): Promise<string[]> {
  if (!outlet.rssUrl && !outlet.sitemapUrl) {
    return [];
  }
  const candidates = buildSitemapFallbackUrls(
    outlet.rssUrl || '',
    outlet.hasExplicitSitemapUrl ? outlet.sitemapUrl : undefined
  );
  const robotsSourceUrl = outlet.rssUrl || outlet.sitemapUrl;
  if (robotsSourceUrl) {
    candidates.push(...await extractSitemapUrlsFromRobots(robotsSourceUrl));
  }
  const prioritized = prioritizeSitemapCandidateUrls(candidates).slice(0, SITEMAP_CANDIDATE_LIMIT);
  if (outlet.hasExplicitSitemapUrl && outlet.sitemapUrl) {
    return [outlet.sitemapUrl, ...prioritized.filter((candidate) => candidate !== outlet.sitemapUrl)];
  }
  return prioritized;
}

function mergeParsedSitemapResults(results: ParsedSitemapResult[]): ParsedSitemapResult | null {
  const validResults = results.filter((result) => result.items.length > 0 || result.stats.totalCandidates > 0);
  if (validResults.length === 0) return null;
  return {
    items: validResults.flatMap((result) => result.items).slice(0, SITEMAP_ITEM_LIMIT),
    stats: validResults.reduce(
      (acc, result) => {
        acc.totalCandidates += result.stats.totalCandidates;
        acc.validCount += result.stats.validCount;
        acc.missingTitleCount += result.stats.missingTitleCount;
        acc.missingSummaryCount += result.stats.missingSummaryCount;
        acc.missingPublishedAtCount += result.stats.missingPublishedAtCount;
        acc.missingLinkCount += result.stats.missingLinkCount;
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
    ),
  };
}

function parseSitemapOrFeedXml(xml: string): ParsedSitemapResult {
  const sitemap = parseSitemapWithStats(xml, SITEMAP_ITEM_LIMIT);
  if (sitemap.items.length > 0 || sitemap.stats.totalCandidates > 0) {
    return sitemap;
  }
  return parseRssOrAtomWithStats(xml, RSS_ITEM_LIMIT);
}

async function parseSitemapXmlRecursively(
  sitemapUrl: string,
  xml: string,
  depth = 0,
  seen = new Set<string>()
): Promise<ParsedSitemapResult | null> {
  const sitemap = parseSitemapWithStats(xml, SITEMAP_ITEM_LIMIT, sitemapUrl);
  const parsed = sitemap.items.length > 0 || sitemap.stats.totalCandidates > 0
    ? sitemap
    : parseRssOrAtomWithStats(xml, RSS_ITEM_LIMIT);
  if (parsed.items.length > 0) {
    return parsed;
  }
  if (depth >= SITEMAP_INDEX_MAX_DEPTH) {
    return parsed.stats.totalCandidates > 0 ? parsed : null;
  }

  const children = parseSitemapIndex(xml, sitemapUrl).filter((childUrl) => !seen.has(childUrl));
  if (children.length === 0) {
    return parsed.stats.totalCandidates > 0 ? parsed : null;
  }

  const nextSeen = new Set(seen);
  nextSeen.add(sitemapUrl);
  const childResults = await runWithConcurrency(children, Math.min(4, children.length), async (childUrl) => {
    if (nextSeen.has(childUrl)) return null;
    try {
      nextSeen.add(childUrl);
      const childResponse = await fetchWithRetryFeed(childUrl, sitemapUrl);
      if (!childResponse.ok) return null;
      const childXml = await childResponse.text();
      return await parseSitemapXmlRecursively(childUrl, childXml, depth + 1, nextSeen);
    } catch {
      return null;
    }
  });

  return mergeParsedSitemapResults(childResults.filter((result): result is ParsedSitemapResult => Boolean(result)));
}

async function fetchSitemapFallbackFromUrl(sitemapUrl: string): Promise<ParsedSitemapResult | null> {
  const response = await fetchWithRetryFeed(sitemapUrl);
  if (!response.ok) return null;
  const xml = await response.text();
  return await parseSitemapXmlRecursively(sitemapUrl, xml);
}

async function trySitemapFallback(outlet: OutletFeed): Promise<ParsedSitemapResult | null> {
  const candidates = await buildSitemapCandidateUrls(outlet);
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
const ENABLE_EXPLICIT_SITEMAP_PARALLEL = parseBoolEnv(process.env.INGEST_EXPLICIT_SITEMAP_PARALLEL, true);
const ENABLE_ARTICLE_META_CATEGORY_FALLBACK = parseBoolEnv(process.env.INGEST_ARTICLE_META_CATEGORY_FALLBACK, true);
const ENABLE_ARTICLE_TITLE_FALLBACK = parseBoolEnv(process.env.INGEST_ARTICLE_TITLE_FALLBACK, true);
const ARTICLE_META_CATEGORY_FETCH_MAX_PER_RUN = BACKFILL_WINDOW
  ? Number.MAX_SAFE_INTEGER
  : Math.max(0, Math.min(5000, Number.parseInt(process.env.INGEST_ARTICLE_META_CATEGORY_MAX_FETCHES || '400', 10) || 400));
const ARTICLE_META_CATEGORY_FETCH_MAX_PER_SOURCE = BACKFILL_WINDOW
  ? Number.MAX_SAFE_INTEGER
  : Math.max(
      0,
      Math.min(500, Number.parseInt(process.env.INGEST_ARTICLE_META_CATEGORY_MAX_FETCHES_PER_SOURCE || '40', 10) || 40)
    );
const ARTICLE_META_CATEGORY_FALLBACK_SOURCES = new Set(
  (
    process.env.INGEST_ARTICLE_META_CATEGORY_SOURCES
    || [
      'people.cn',
      'kbs news',
      'yahoo taiwan',
      'newsis',
      'infobae',
      '조선닷컴',
      'times of india',
      'jiji press',
      'ria novosti',
      'daily mail',
      'welt',
      'augsburger allgemeine',
      'liberty times',
      'mirror media',
      'ntv',
      'ansa',
      'sponichi',
      'the independent',
      'the hindu',
      'clarín',
      'clarin',
      'le télégramme',
      'sabah',
      'milenio',
      'setn',
      'swissinfo es',
      'sports illustrated',
      'bbc news',
      'el watan - news sitemap',
      'khaberni - latest sitemap',
      'vietnamnet - news sitemap',
    ].join(',')
  )
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);
const ARTICLE_TITLE_FALLBACK_SOURCES = new Set(
  (
    process.env.INGEST_ARTICLE_TITLE_SOURCES
    || [
      'ajel',
      'aap',
      'abc news',
      'setn',
      'parapolitika',
      'news.com.au',
      'the australian',
      'daily telegraph',
      'courier mail',
      'herald sun',
      'adelaidenow',
      'nt news',
      'townsville bulletin',
      'the mercury',
      'the chronicle',
      'gold coast bulletin',
      'geelong advertiser',
      'weekly times',
      'people.cn',
      'sponichi',
      'abema times',
      'ukrainska pravda',
      'european pravda',
      'eurointegration',
      'vol.at',
      'independent.ie',
      'aamulehti',
      'helsingin sanomat',
      'ilta-sanomat',
      'is.fi',
      'fnn',
      'puls 24',
      'ekstra bladet',
    ].join(',')
  )
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);
const ARTICLE_META_CATEGORY_FETCH_TIMEOUT_MS = Math.max(
  3000,
  Math.min(20000, Number.parseInt(process.env.INGEST_ARTICLE_META_CATEGORY_TIMEOUT_MS || '12000', 10) || 12000)
);
const ARTICLE_TITLE_FETCH_TIMEOUT_MS = Math.max(
  3000,
  Math.min(20000, Number.parseInt(process.env.INGEST_ARTICLE_TITLE_TIMEOUT_MS || '12000', 10) || 12000)
);
const ARTICLE_PUBLISHED_AT_FETCH_TIMEOUT_MS = Math.max(
  3000,
  Math.min(20000, Number.parseInt(process.env.INGEST_ARTICLE_PUBLISHED_AT_TIMEOUT_MS || '12000', 10) || 12000)
);
const ARTICLE_PUBLISHED_AT_FETCH_MAX_PER_RUN = Math.max(
  1,
  Math.min(1000, Number.parseInt(process.env.INGEST_ARTICLE_PUBLISHED_AT_FETCH_MAX_PER_RUN || '240', 10) || 240)
);
const ARTICLE_PUBLISHED_AT_FETCH_MAX_PER_SOURCE = Math.max(
  1,
  Math.min(500, Number.parseInt(process.env.INGEST_ARTICLE_PUBLISHED_AT_FETCH_MAX_PER_SOURCE || '180', 10) || 180)
);

const articleMetaCategoryCache = new Map<string, Promise<string[]>>();
const articleTitleCache = new Map<string, Promise<string>>();
const articlePublishedAtCache = new Map<string, Promise<string>>();
const articleMetaCategoryFetchCountsBySource = new Map<string, number>();
const articlePublishedAtFetchCountsBySource = new Map<string, number>();
const articleMetaCategoryStats = {
  fetchesStarted: 0,
  cacheHits: 0,
  budgetSkipped: 0,
};
const articlePublishedAtStats = {
  fetchesStarted: 0,
  cacheHits: 0,
  budgetSkipped: 0,
};

const FEED_FETCH_HEADERS = {
  'User-Agent':
    process.env.INGEST_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  Accept: 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*',
  'Accept-Language': process.env.INGEST_ACCEPT_LANGUAGE || 'en-US,en;q=0.9,es;q=0.8,ja;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  Connection: 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache'
};

function buildFeedFetchHeaders(requestedUrl: string, referrerUrl?: string): Record<string, string> {
  const headers: Record<string, string> = { ...FEED_FETCH_HEADERS };
  try {
    const target = new URL(requestedUrl);
    headers.Origin = target.origin;
    headers.Referer = referrerUrl || `${target.origin}/`;
  } catch {
    if (referrerUrl) headers.Referer = referrerUrl;
  }
  return headers;
}

function normalizeSourceKey(value: string): string {
  return (value || '').trim().toLowerCase();
}

function shouldFetchArticleMetaCategories(source: string, url: string, existingCategories: readonly string[]): boolean {
  if (!ENABLE_ARTICLE_META_CATEGORY_FALLBACK) return false;
  if (existingCategories.length > 0) return false;
  if (!url || isKnownNonArticleUrl(source, url)) return false;

  const normalizedSource = normalizeSourceKey(source);
  for (const candidate of ARTICLE_META_CATEGORY_FALLBACK_SOURCES) {
    if (candidate && normalizedSource.includes(candidate)) {
      return true;
    }
  }

  return false;
}

function shouldFetchArticlePageTitle(source: string, url: string, title: string): boolean {
  if (!ENABLE_ARTICLE_TITLE_FALLBACK) return false;
  if (!url || isKnownNonArticleUrl(source, url)) return false;
  if (!looksLikeLowSignalArticleTitle(title, source, url)) return false;

  const normalizedSource = normalizeSourceKey(source);
  for (const candidate of ARTICLE_TITLE_FALLBACK_SOURCES) {
    if (candidate && normalizedSource.includes(candidate)) {
      return true;
    }
  }

  return false;
}

function shouldFetchArticlePublishedAt(source: string, url: string): boolean {
  if (!url || isKnownNonArticleUrl(source, url)) return false;
  const normalizedSource = normalizeSourceKey(source);
  return (
    normalizedSource === '9news' ||
    normalizedSource.includes('news.com.au national top news') ||
    normalizedSource.includes('news.com.au finance') ||
    normalizedSource.includes('news.com.au world') ||
    normalizedSource.includes('news.com.au technology') ||
    normalizedSource.includes('news.com.au - sport')
  );
}

function normalizePublishedAtCandidate(value: string): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';
  const ts = new Date(trimmed).getTime();
  if (!Number.isFinite(ts)) return '';
  return new Date(ts).toISOString();
}

function extractArticlePagePublishedAt(html: string): string {
  const patterns = [
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']pubdate["'][^>]+content=["']([^"']+)["']/i,
    /"datePublished"\s*:\s*"([^"]+)"/i,
    /"publishedDate"\s*:\s*"([^"]+)"/i,
    /"publishedAt"\s*:\s*"([^"]+)"/i,
    /<time[^>]+datetime=["']([^"']+)["']/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    const normalized = normalizePublishedAtCandidate(match?.[1] || '');
    if (normalized) return normalized;
  }

  return '';
}

async function fetchArticleMetaCategories(source: string, url: string): Promise<string[]> {
  const normalizedSource = normalizeSourceKey(source);
  const cacheKey = `${normalizedSource}\n${url.trim()}`;
  const existing = articleMetaCategoryCache.get(cacheKey);
  if (existing) {
    articleMetaCategoryStats.cacheHits += 1;
    return existing;
  }

  if (articleMetaCategoryStats.fetchesStarted >= ARTICLE_META_CATEGORY_FETCH_MAX_PER_RUN) {
    articleMetaCategoryStats.budgetSkipped += 1;
    return [];
  }

  const sourceCount = articleMetaCategoryFetchCountsBySource.get(normalizedSource) || 0;
  if (sourceCount >= ARTICLE_META_CATEGORY_FETCH_MAX_PER_SOURCE) {
    articleMetaCategoryStats.budgetSkipped += 1;
    return [];
  }

  articleMetaCategoryStats.fetchesStarted += 1;
  articleMetaCategoryFetchCountsBySource.set(normalizedSource, sourceCount + 1);

  const task = (async () => {
    try {
      const response = await fetchWithRetry(url, {
        timeoutMs: ARTICLE_META_CATEGORY_FETCH_TIMEOUT_MS,
        attempts: 2,
        fetchOptions: {
          headers: buildArticlePageFetchHeaders(url),
          redirect: 'follow',
        },
      });
      if (!response.ok) return [];
      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (contentType && !contentType.includes('html') && !contentType.includes('xml')) return [];
      const html = (await readResponseText(response, response.url || url)).text;
      return normalizeSourceCategories(extractSourceCategoriesFromArticlePage({ source, html }));
    } catch {
      return [];
    }
  })();

  articleMetaCategoryCache.set(cacheKey, task);
  return task;
}

async function fetchArticlePageTitle(source: string, url: string): Promise<string> {
  const cacheKey = `${normalizeSourceKey(source)}\n${url.trim()}`;
  const existing = articleTitleCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const task = (async () => {
    try {
      const response = await fetchWithRetry(url, {
        timeoutMs: ARTICLE_TITLE_FETCH_TIMEOUT_MS,
        attempts: 2,
        fetchOptions: {
          headers: buildArticlePageFetchHeaders(url),
          redirect: 'follow',
        },
      });
      if (!response.ok) return '';
      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (contentType && !contentType.includes('html') && !contentType.includes('xml')) return '';
      const html = (await readResponseText(response, response.url || url)).text;
      return normalizeReadableArticleTitle(extractArticlePageTitle(html), response.url || url, source);
    } catch {
      return '';
    }
  })();

  articleTitleCache.set(cacheKey, task);
  return task;
}

async function fetchArticlePagePublishedAt(source: string, url: string): Promise<string> {
  const normalizedSource = normalizeSourceKey(source);
  const cacheKey = `${normalizedSource}\n${url.trim()}`;
  const existing = articlePublishedAtCache.get(cacheKey);
  if (existing) {
    articlePublishedAtStats.cacheHits += 1;
    return existing;
  }

  if (articlePublishedAtStats.fetchesStarted >= ARTICLE_PUBLISHED_AT_FETCH_MAX_PER_RUN) {
    articlePublishedAtStats.budgetSkipped += 1;
    return '';
  }

  const sourceCount = articlePublishedAtFetchCountsBySource.get(normalizedSource) || 0;
  if (sourceCount >= ARTICLE_PUBLISHED_AT_FETCH_MAX_PER_SOURCE) {
    articlePublishedAtStats.budgetSkipped += 1;
    return '';
  }

  articlePublishedAtStats.fetchesStarted += 1;
  articlePublishedAtFetchCountsBySource.set(normalizedSource, sourceCount + 1);

  const task = (async () => {
    try {
      const response = await fetchWithRetry(url, {
        timeoutMs: ARTICLE_PUBLISHED_AT_FETCH_TIMEOUT_MS,
        attempts: 2,
        fetchOptions: {
          headers: buildArticlePageFetchHeaders(url),
          redirect: 'follow',
        },
      });
      if (!response.ok) return '';
      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (contentType && !contentType.includes('html') && !contentType.includes('xml')) return '';
      const html = (await readResponseText(response, response.url || url)).text;
      return extractArticlePagePublishedAt(html);
    } catch {
      return '';
    }
  })();

  articlePublishedAtCache.set(cacheKey, task);
  return task;
}

function normalizeResponseContentType(response: Response): string {
  return (response.headers.get('content-type') || '').toLowerCase();
}

type ReadResponseBodyResult = {
  body: string;
  bodyLength: number;
  decodeFailed: boolean;
};

function shouldAttemptBrowserSitemapFallback(url: string, response: Response | null, body: string): boolean {
  if (!ENABLE_BROWSER_SITEMAP_FALLBACK) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!BROWSER_SITEMAP_FALLBACK_DOMAINS.has(host)) return false;
    const path = `${parsed.pathname}${parsed.search}`.toLowerCase();
    const isSitemapLike =
      path.includes('sitemap') || path.endsWith('.xml') || path.endsWith('.xml.gz') || path.includes('googlenews');
    const isFeedLike =
      path === '/feed' ||
      path === '/feed/' ||
      path.endsWith('/feed') ||
      path.endsWith('/feed/') ||
      path.includes('/rss') ||
      path.endsWith('.rss');
    if (!isSitemapLike && !isFeedLike) {
      return false;
    }
  } catch {
    return false;
  }

  if (!response) return true;
  if (response.status === 403 || response.status === 503) return true;
  return isLikelyHtmlResponse(response, body);
}

function normalizeBrowserXmlPayload(payload: string): string {
  const trimmed = payload.trim();
  const xmlStart = trimmed.search(/<(?:\?xml|rss|feed|urlset|sitemapindex)\b/i);
  return xmlStart >= 0 ? trimmed.slice(xmlStart) : trimmed;
}

async function fetchSitemapWithBrowser(url: string): Promise<Response> {
  const result = spawnSync('node', [BROWSER_SITEMAP_HELPER, url], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    throw new Error(stderr || stdout || `browser_sitemap_helper_failed:${result.status ?? 'unknown'}`);
  }

  const xml = normalizeBrowserXmlPayload(result.stdout || '');
  return new Response(xml, {
    status: 200,
    headers: { 'content-type': 'application/xml; charset=utf-8', 'x-browser-sitemap-fallback': '1' },
  });
}

async function readResponseBody(response: Response): Promise<ReadResponseBodyResult> {
  const decoded = await readResponseText(response);
  return {
    body: decoded.text,
    bodyLength: decoded.byteLength,
    decodeFailed: decoded.decodeFailed,
  };
}

function isLikelyHtmlResponse(response: Response, body: string): boolean {
  if (isLikelyXmlPayload(body)) return false;
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

function inferResponseSniffType(response: Response | null, body: string): string {
  if (!response) return 'fetch_failed';
  const contentType = normalizeResponseContentType(response);
  if (isLikelyXmlPayload(body)) {
    return 'xml';
  }
  if (contentType.includes('text/html') || contentType.includes('application/xhtml+xml')) {
    return 'html';
  }
  if (contentType.includes('application/json')) {
    return 'json';
  }
  if (
    contentType.includes('application/rss+xml') ||
    contentType.includes('application/atom+xml') ||
    contentType.includes('application/xml') ||
    contentType.includes('text/xml')
  ) {
    return isLikelyXmlPayload(body) ? 'xml' : 'xml_like_non_payload';
  }
  if (!body.trim()) return 'empty';
  if (isLikelyHtmlResponse(response, body)) return 'html';
  if (isLikelyXmlPayload(body)) return 'xml_like';
  return 'text';
}

function inferFailureStage(failureReason: string | undefined): string | undefined {
  if (!failureReason) return undefined;
  const reason = failureReason.toLowerCase();
  if (reason.includes('network_error') || reason.includes('timeout') || reason.includes('aborted') || reason.includes('operation was aborted')) {
    return 'fetch';
  }
  if (reason.startsWith('http_')) {
    return 'http';
  }
  if (reason === 'decode_failed' || reason === 'xml_parse_failed' || reason === 'no_items' || reason === 'empty_body_200' || reason === 'html_returned') {
    return 'parse';
  }
  if (reason === 'sitemap_fallback_disabled' || reason === 'sitemap_disabled_by_policy') {
    return 'sitemap_policy';
  }
  return 'parse';
}

function latestItemPublishedAt(items: NewsItem[]): string | null {
  return items.length > 0 ? items[0].publishedAt : null;
}

function feedResultRunMeta(feedResult: FeedFetchResult) {
  return {
    requestedUrl: feedResult.requestedUrl,
    finalUrl: feedResult.finalUrl,
    contentType: feedResult.contentType,
    responseMs: feedResult.responseMs,
    sniffedType: feedResult.sniffedType,
  };
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
  contentType: string;
  responseMs: number;
  sniffedType: string;
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

type MissingPublishedAtCollector = (candidate: MissingPublishedAtCandidate) => void;

function getFallbackKind(feedResult: FeedFetchResult): FallbackKind {
  return feedResult.shouldUseSitemapFallback ? 'sitemap' : 'none';
}

async function fetchFeedWithFallback(url: string): Promise<FeedFetchResult> {
  const requestedUrl = url;
  const startMs = Date.now();

  try {
    let primary = await fetchWithRetryFeed(requestedUrl);
    let primaryBody = await readResponseBody(primary);

    if (shouldAttemptBrowserSitemapFallback(requestedUrl, primary, primaryBody.body)) {
      try {
        primary = await fetchSitemapWithBrowser(requestedUrl);
        primaryBody = await readResponseBody(primary);
      } catch {
        // Keep the original response if the browser fallback fails.
      }
    }

    const primaryFailure = describeFeedFailure(primary, primaryBody.body);
    const shouldUseSitemapFallback = shouldRetryWithSitemap(primary, primaryBody.body);
    const responseMs = Date.now() - startMs;

    return {
      requestedUrl,
      finalUrl: primary.url || requestedUrl,
      contentType: normalizeResponseContentType(primary),
      responseMs,
      sniffedType: inferResponseSniffType(primary, primaryBody.body),
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
      contentType: 'fetch_error',
      responseMs: Date.now() - startMs,
      sniffedType: 'fetch_failed',
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

async function fetchWithRetryFeed(url: string, referrerUrl?: string): Promise<Response> {
  await validateFeedUrl(url);

  let currentUrl = url;
  let redirects = 0;

  while (true) {
    const response = await fetchWithRetry(currentUrl, {
      timeoutMs: FETCH_TIMEOUT_MS,
      fetchOptions: {
        headers: buildFeedFetchHeaders(currentUrl, referrerUrl),
        redirect: 'manual'
      },
      attempts: 1,
      backoffMs: (attempt) => 200 + attempt * 300 + Math.floor(Math.random() * 200),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        return response;
      }

      const nextUrl = await resolveRedirectUrl(currentUrl, location);
      await validateFeedUrl(nextUrl);
      redirects += 1;
      if (redirects > FEED_MAX_REDIRECTS) {
        throw new Error(`blocked_feed_url:too_many_redirects:${redirects}`);
      }
      currentUrl = nextUrl;
      continue;
    }

    if (shouldAttemptBrowserSitemapFallback(currentUrl, response, '')) {
      try {
        return await fetchSitemapWithBrowser(currentUrl);
      } catch {
        // Fall back to the original response if browser loading fails.
      }
    }

    return response;
  }
}

function dedupeAndSort(items: NewsItem[]): NewsItem[] {
  const byLink = new Map<string, NewsItem>();
  for (const item of items) {
    const key = item.stableId || item.link;
    const prev = byLink.get(key);
    byLink.set(key, prev ? mergeNewsItems(prev, item) : item);
  }
  return [...byLink.values()].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

async function toNewsItem(
  outlet: OutletFeed,
  row: { title: string; description?: string; link: string; publishedAt?: string; categories?: string[]; stableId?: string },
  fallbackPublishedAt: string,
  method: 'rss' | 'sitemap',
  onMissingPublishedAtCandidate?: MissingPublishedAtCollector
): Promise<NewsItem | null> {
  if (isKnownNonArticleUrl(outlet.name, row.link || '')) {
    return null;
  }
  const titleCheckedAt = new Date().toISOString();
  let title = normalizeArticleTitle(row.title || '', row.link || '');
  const readableFallbackTitle = normalizeReadableArticleTitle(row.title || '', row.link || '', outlet.name);
  if (looksLikeLowSignalArticleTitle(title, outlet.name, row.link || '') && readableFallbackTitle) {
    title = readableFallbackTitle;
  }
  let titleRepairAttempted = false;
  let titleRepairSource: 'article_page' | null = null;
  if (shouldFetchArticlePageTitle(outlet.name, row.link || '', row.title || title)) {
    titleRepairAttempted = true;
    const pageTitle = await fetchArticlePageTitle(outlet.name, row.link || '');
    if (pageTitle) {
      title = pageTitle;
      titleRepairSource = 'article_page';
    }
  }
  const titleAssessment = assessNewsTitle({
    title,
    source: outlet.name,
    url: row.link || '',
    repairAttempted: titleRepairAttempted,
    repairSource: titleRepairSource,
  });
  if (!titleAssessment.normalizedTitle) {
    return null;
  }
  title = titleAssessment.normalizedTitle;
  const description = normalizeHtmlText(row.description || '');
  let rawPublishedAt = (row.publishedAt || '').trim();
  if (!rawPublishedAt && shouldFetchArticlePublishedAt(outlet.name, row.link || '')) {
    rawPublishedAt = await fetchArticlePagePublishedAt(outlet.name, row.link || '');
  }
  if (!rawPublishedAt && DROP_ITEMS_WITHOUT_PUBLISHED_AT) {
    onMissingPublishedAtCandidate?.({
      outletId: outlet.id,
      source: outlet.name,
      country: normalizeCountryName(outlet.country),
      method,
      link: row.link,
      title,
      description: description || null,
      language: outlet.language || null,
      section: outlet.section || 'others',
      categories: row.categories || [],
    });
    return null;
  }
  const normalizedCountry = normalizeCountryName(outlet.country);
  const geo = inferGeoFromArticleSignals({
    title,
    source: outlet.name,
    url: row.link || '',
    fallbackCountry: normalizedCountry,
  });
  const fallbackSection = outlet.section || 'others';
  let sourceCategories = normalizeSourceCategories(row.categories || []);
  if (sourceCategories.length === 0) {
    sourceCategories = inferSourceCategoriesFromUrlPath({
      source: outlet.name,
      url: row.link || '',
    });
  }
  if (shouldFetchArticleMetaCategories(outlet.name, row.link || '', sourceCategories)) {
    const pageCategories = await fetchArticleMetaCategories(outlet.name, row.link || '');
    if (pageCategories.length > 0) {
      sourceCategories = normalizeSourceCategories([...sourceCategories, ...pageCategories]);
    }
  }
  const classification = await classifySection({
    title,
    summary: description,
    fallbackSection,
    feedCategories: sourceCategories,
    source: outlet.name,
    url: row.link || ''
  });
  const section = classification.section;
  const isFallbackPublishedAt = !rawPublishedAt;
  const publishedAt = rawPublishedAt || fallbackPublishedAt;
  if (parsePublishedAtMs(publishedAt) === null) {
    return null;
  }
  const stableId = buildFeedStableId(row.stableId || '', row.link || '') || undefined;
  return annotateWorldLatam({
    id: row.link,
    outletId: outlet.id,
    title,
    description,
    link: row.link,
    stableId,
    source: outlet.name,
    language: outlet.language || undefined,
    sourceType: outlet.sourceType || 'global',
    tier: outlet.tier,
    sourceCountry: normalizedCountry,
    publishedAt,
    publishedAtIsFallback: isFallbackPublishedAt,
    section,
    confidence: classification.confidence,
    classificationSource: classification.source,
    classificationReason: classification.reason,
    sourceCategories,
    publicationSource: 'feed',
    summarySource: description ? 'feed' : undefined,
    titleQuality: titleAssessment.quality,
    titleQualityReason: titleAssessment.qualityReason,
    titleQualityCheckedAt: titleCheckedAt,
    titleRepairStatus: titleAssessment.repairStatus,
    titleRepairSource: titleAssessment.repairSource || undefined,
    titleRepairAttemptedAt: titleRepairAttempted ? titleCheckedAt : undefined,
    titleRepairedAt: titleAssessment.quality === 'recovered' ? titleCheckedAt : undefined,
    ...geo,
  });
}

async function mapParsedItems(
  outlet: OutletFeed,
  rows: Array<Parameters<typeof toNewsItem>[1]>,
  fallbackPublishedAt: string,
  publicationSource: 'rss' | 'sitemap',
  onMissingPublishedAtCandidate?: MissingPublishedAtCollector
): Promise<NewsItem[]> {
  if (rows.length === 0) {
    return [];
  }

  const mappedItems = await runWithConcurrency(
    rows,
    Math.min(ITEM_MAP_CONCURRENCY, rows.length),
    (row) => toNewsItem(outlet, row, fallbackPublishedAt, publicationSource, onMissingPublishedAtCandidate)
  );
  return mappedItems.filter((item): item is NewsItem => item !== null);
}

function buildMissingPublishedAtFallback(startedMs: number): string {
  const startedIso = new Date(startedMs).toISOString();
  return `${startedIso.slice(0, 11)}11:11:11.000Z`;
}

async function fetchRss(
  outlet: OutletFeed,
  options: {
    allowSitemapFallback: boolean;
    fallbackPublishedAt: string;
    onMissingPublishedAtCandidate?: MissingPublishedAtCollector;
  }
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
    const feedDiagnosticRunFields = feedResultRunMeta(feedResult);
    if (!feedResult.response || feedResult.failureReason || !feedResult.response.ok) {
      const fallbackUsed: FallbackKind = getFallbackKind(feedResult);
      const useSitemapFallback = options.allowSitemapFallback && ENABLE_RSS_TO_SITEMAP_FALLBACK && feedResult.shouldUseSitemapFallback;
      if (useSitemapFallback) {
        const sitemapParsed = await trySitemapFallback(outlet);
        if (sitemapParsed) {
          const items = await mapParsedItems(
            outlet,
            sitemapParsed.items,
            options.fallbackPublishedAt,
            'sitemap',
            options.onMissingPublishedAtCandidate
          );
          const newestItem = latestItemPublishedAt(items);
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
              parsedCount: items.length,
              fetchedCount: sitemapParsed.stats.totalCandidates,
              parsedLimit: SITEMAP_ITEM_LIMIT,
              sampleCapped: items.length >= SITEMAP_ITEM_LIMIT,
              recent24h: items.length,
              missingTitleCount: sitemapParsed.stats.missingTitleCount,
              missingSummaryCount: sitemapParsed.stats.missingSummaryCount,
              missingPublishedAtCount: sitemapParsed.stats.missingPublishedAtCount,
              missingLinkCount: sitemapParsed.stats.missingLinkCount,
              ...feedDiagnosticRunFields,
              parsedOk: true,
              failureStage: undefined,
              healthClassification: 'sitemap_fallback_success',
              newestItemPublishedAt: newestItem,
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
            ...feedDiagnosticRunFields,
            parsedOk: false,
            failureStage: inferFailureStage(normalizedFailure),
            healthClassification: normalizedFailure,
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
          ...feedDiagnosticRunFields,
          parsedOk: false,
          failureStage: inferFailureStage(normalizedFailure),
          healthClassification: normalizedFailure,
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
          ...feedDiagnosticRunFields,
          parsedOk: false,
          failureStage: inferFailureStage(parsedFailure),
          healthClassification: parsedFailure,
          error: parsedFailure,
        },
        fallbackUsed: 'none',
      };
    }

    const items = await mapParsedItems(
      outlet,
      parsed.items,
      options.fallbackPublishedAt,
      'rss',
      options.onMissingPublishedAtCandidate
    );
    const rssFallbackUsed: FallbackKind = getFallbackKind(feedResult);
    const newestItem = latestItemPublishedAt(items);
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
        parsedCount: items.length,
        fetchedCount: parsed.stats.totalCandidates,
        parsedLimit: RSS_ITEM_LIMIT,
        sampleCapped: items.length >= RSS_ITEM_LIMIT,
        recent24h: items.length,
        missingTitleCount: parsed.stats.missingTitleCount,
        missingSummaryCount: parsed.stats.missingSummaryCount,
        missingPublishedAtCount: parsed.stats.missingPublishedAtCount,
        missingLinkCount: parsed.stats.missingLinkCount,
        ...feedDiagnosticRunFields,
        parsedOk: true,
        failureStage: undefined,
        healthClassification: 'success',
        newestItemPublishedAt: newestItem,
      },
      fallbackUsed: rssFallbackUsed,
    };
  } catch (error) {
      const normalizedFailure = error instanceof Error ? error.message : String(error);
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
        parsedOk: false,
        failureStage: inferFailureStage(normalizedFailure),
        healthClassification: normalizedFailure,
        error: normalizedFailure,
      },
      fallbackUsed: 'none',
    };
  }
}

async function fetchSitemap(
  outlet: OutletFeed,
  fallbackPublishedAt: string,
  onMissingPublishedAtCandidate?: MissingPublishedAtCollector
): Promise<EndpointResult> {
  const country = normalizeCountryName(outlet.country);
  const candidates = await buildSitemapCandidateUrls(outlet);
  if (candidates.length === 0) {
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

  let lastFailure: EndpointResult | null = null;
  for (const candidate of candidates) {
    const attempt = await fetchSitemapCandidate(outlet, candidate, fallbackPublishedAt, onMissingPublishedAtCandidate);
    if (attempt.run.ok) {
      return attempt;
    }
    lastFailure = attempt;
  }

  return (
    lastFailure || {
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
        error: 'no_sitemap_candidates',
      },
      fallbackUsed: 'none',
    }
  );
}

async function fetchSitemapCandidate(
  outlet: OutletFeed,
  sitemapUrl: string,
  fallbackPublishedAt: string,
  onMissingPublishedAtCandidate?: MissingPublishedAtCollector
): Promise<EndpointResult> {
  const country = normalizeCountryName(outlet.country);
  try {
    const responseStartMs = Date.now();
    const response = await fetchWithRetryFeed(sitemapUrl);
    const responseMs = Date.now() - responseStartMs;
    const responseBody = await readResponseBody(response);
    const responseContentType = normalizeResponseContentType(response);
    const sniffedType = inferResponseSniffType(response, responseBody.body);
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
          requestedUrl: sitemapUrl,
          finalUrl: response.url || sitemapUrl,
          contentType: responseContentType,
          responseMs,
          sniffedType,
          parsedOk: false,
          failureStage: inferFailureStage(`http_${response.status}`),
          healthClassification: `http_${response.status}`,
          error: `http_${response.status}`,
        },
        fallbackUsed: 'none',
      };
    }

    const xml = responseBody.body;
    let htmlRows: Array<{
      title: string;
      description?: string;
      link: string;
      publishedAt?: string;
    }> = [];
    if (responseContentType.includes('html') || sniffedType === 'html') {
      htmlRows = parseHtmlListingRows(sitemapUrl, xml);
      if (htmlRows.length === 0) {
        try {
          const host = new URL(sitemapUrl).hostname.replace(/^www\./, '').toLowerCase();
          if (host === 'gogo.mn') {
            htmlRows = await fetchGogoHomepageRows(sitemapUrl, xml);
          } else if (host === 'bloombergtv.mn') {
            htmlRows = await fetchBloombergTvMongoliaRows(sitemapUrl);
          }
        } catch {
          htmlRows = htmlRows;
        }
      }
    }
    if (htmlRows.length > 0) {
      const items = await mapParsedItems(
        outlet,
        htmlRows,
        fallbackPublishedAt,
        'sitemap',
        onMissingPublishedAtCandidate
      );
      const newestItem = latestItemPublishedAt(items);
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
          parsedCount: items.length,
          fetchedCount: htmlRows.length,
          parsedLimit: SITEMAP_ITEM_LIMIT,
          sampleCapped: items.length >= SITEMAP_ITEM_LIMIT,
          recent24h: items.length,
          missingTitleCount: 0,
          missingSummaryCount: 0,
          missingPublishedAtCount: 0,
          missingLinkCount: 0,
          requestedUrl: sitemapUrl,
          finalUrl: response.url || sitemapUrl,
          contentType: responseContentType,
          responseMs,
          sniffedType,
          parsedOk: true,
          failureStage: undefined,
          healthClassification: 'success',
          newestItemPublishedAt: newestItem,
        },
        fallbackUsed: 'none',
      };
    }
    const parsed = await parseSitemapXmlRecursively(sitemapUrl, xml);

    if (!parsed || parsed.stats.validCount === 0) {
      const parsedFailure = classifyParsedFeedFailure({
        response,
        body: xml,
        bodyLength: responseBody.bodyLength,
        decodeFailed: responseBody.decodeFailed,
        totalCandidates: parsed?.stats.totalCandidates || 0,
        validCount: parsed?.stats.validCount || 0,
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
          fetchedCount: parsed?.stats.totalCandidates || 0,
          parsedLimit: SITEMAP_ITEM_LIMIT,
          sampleCapped: false,
          recent24h: 0,
          missingTitleCount: parsed?.stats.missingTitleCount || 0,
          missingSummaryCount: parsed?.stats.missingSummaryCount || 0,
          missingPublishedAtCount: parsed?.stats.missingPublishedAtCount || 0,
          missingLinkCount: parsed?.stats.missingLinkCount || 0,
          requestedUrl: sitemapUrl,
          finalUrl: response.url || sitemapUrl,
          contentType: responseContentType,
          responseMs,
          sniffedType,
          parsedOk: false,
          failureStage: inferFailureStage(parsedFailure),
          healthClassification: parsedFailure,
          error: parsedFailure,
        },
        fallbackUsed: 'none',
      };
    }

    const items = await mapParsedItems(
      outlet,
      parsed.items,
      fallbackPublishedAt,
      'sitemap',
      onMissingPublishedAtCandidate
    );
    const newestItem = latestItemPublishedAt(items);
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
        parsedCount: items.length,
        fetchedCount: parsed.stats.totalCandidates,
        parsedLimit: SITEMAP_ITEM_LIMIT,
        sampleCapped: items.length >= SITEMAP_ITEM_LIMIT,
        recent24h: items.length,
        missingTitleCount: parsed.stats.missingTitleCount,
        missingSummaryCount: parsed.stats.missingSummaryCount,
        missingPublishedAtCount: parsed.stats.missingPublishedAtCount,
        missingLinkCount: parsed.stats.missingLinkCount,
        requestedUrl: sitemapUrl,
        finalUrl: response.url || sitemapUrl,
        contentType: responseContentType,
        responseMs,
        sniffedType,
        parsedOk: true,
        failureStage: undefined,
        healthClassification: 'success',
        newestItemPublishedAt: newestItem,
      },
      fallbackUsed: 'none',
    };
  } catch (error) {
    const normalizedFailure = error instanceof Error ? error.message : String(error);
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
        requestedUrl: sitemapUrl,
        finalUrl: sitemapUrl,
        contentType: 'fetch_error',
        responseMs: null,
        sniffedType: 'fetch_failed',
        parsedOk: false,
        failureStage: inferFailureStage(normalizedFailure),
        healthClassification: normalizedFailure,
        error: normalizedFailure,
      },
      fallbackUsed: 'none',
    };
  }
}
async function runOnce(): Promise<void> {
  const started = Date.now();
  ensureAuditsDir();
  const fallbackPublishedAt = buildMissingPublishedAtFallback(started);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const allOutlets = loadAtlasOutlets();
  const countryFilteredOutlets = allOutlets.filter((outlet) => countryMatchesFilter(outlet.country, COUNTRY_FILTER));
  const sourceFilteredOutlets = countryFilteredOutlets.filter((outlet) => sourceMatchesFilter(outlet.name, SOURCE_FILTER));
  const { selected, nextOffset, offset } = pickOutletChunk(sourceFilteredOutlets, OUTLET_CHUNK_SIZE, STATE_FILE);
  const { endpointLookup, dedupedEndpoints, rssEndpoints, allSitemapEndpoints } = buildEndpointRuns(
    selected,
    methodMatchesFilter,
    METHOD_FILTER
  );
  const watermarks = await readIngestionFeedWatermarks(
    dedupedEndpoints.map((endpoint) => ({
      outletId: endpoint.outlet.id,
      method: endpoint.method
    }))
  );

  const sitemapPolicyStatesByOutlet = await readSitemapPolicyStates(
    allSitemapEndpoints
      .map((endpoint) => ({
        outletId: endpoint.outlet.id,
        source: endpoint.outlet.name,
        country: normalizeCountryName(endpoint.outlet.country)
      }))
  );

  const sitemapSourceCounts = new Map<string, number>();
  for (const endpoint of dedupedEndpoints) {
    if (endpoint.method !== 'sitemap') continue;
    const sourceKey = buildSitemapSourceKey(endpoint.outlet.name, normalizeCountryName(endpoint.outlet.country));
    sitemapSourceCounts.set(sourceKey, (sitemapSourceCounts.get(sourceKey) || 0) + 1);
  }

  const failingBackoff = FAIL_BACKOFF_ENABLED
    ? await readFailingEndpointBackoff({
        runner: 'worker',
        windowMinutes: FAIL_BACKOFF_WINDOW_MINUTES,
        minAttempts: FAIL_BACKOFF_MIN_ATTEMPTS,
        minFailPct: FAIL_BACKOFF_MIN_FAIL_PCT,
        limit: 5000,
      })
    : { rows: [] as EndpointBackoffRow[] };
  const failingKeys = buildFailingEndpointSet(failingBackoff.rows, BACKFILL_IGNORE_BACKOFF);
  const disableSitemapBackoff = SITEMAP_DISABLE_ENABLED
    ? await readFailingEndpointBackoff({
        runner: 'worker',
        windowMinutes: SITEMAP_DISABLE_WINDOW_MINUTES,
        minAttempts: SITEMAP_DISABLE_MIN_ATTEMPTS,
        minFailPct: SITEMAP_DISABLE_MIN_FAIL_PCT,
        limit: 5000,
      })
    : { rows: [] as EndpointBackoffRow[] };
  const disabledSitemapOutletIds = buildDisabledSitemapOutletIds({
    rows: disableSitemapBackoff.rows,
    sitemapDisableEnabled: SITEMAP_DISABLE_ENABLED,
    ignoreBackoff: BACKFILL_IGNORE_BACKOFF,
    minAttempts: SITEMAP_DISABLE_MIN_ATTEMPTS,
    minFailPct: SITEMAP_DISABLE_MIN_FAIL_PCT,
  });

  const fallbackSummary = {
    rssSitemapFallbackAttempts: 0,
    rssSitemapFallbackSuccess: 0,
    rssSitemapFallbackSkipped: 0,
    rssBackoffSkipped: 0,
    sitemapBackoffSkipped: 0,
    sitemapPolicyDisabled: 0
  };
  const missingPublishedAtCandidates: MissingPublishedAtCandidate[] = [];

  const rssResults = await runWithConcurrency<EndpointRun, EndpointResult>(rssEndpoints, FETCH_CONCURRENCY, async (endpoint) => {
    const endpointKey = `${endpoint.outlet.id}:${endpoint.method}`;
    if (failingKeys.has(endpointKey)) {
      fallbackSummary.rssBackoffSkipped += 1;
      return {
        items: [],
        run: {
          outletId: endpoint.outlet.id,
          source: endpoint.outlet.name,
          country: normalizeCountryName(endpoint.outlet.country),
          method: 'rss',
          attempted: false,
          circuitOpen: true,
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
          error: 'cooldown_high_fail',
        },
        fallbackUsed: 'none',
      };
    }
    const result = await fetchRss(endpoint.outlet, {
      allowSitemapFallback: false,
      fallbackPublishedAt,
      onMissingPublishedAtCandidate: (candidate) => {
        missingPublishedAtCandidates.push(candidate);
      },
    });
    const lastPublicationAt = watermarks.get(endpointKey) || null;
    return {
      ...result,
      items: filterItemsForPersistence({
        items: result.items,
        lastPublicationAt,
        nowMs,
        backfillWindow: BACKFILL_WINDOW,
        ignoreWatermark: BACKFILL_IGNORE_WATERMARK,
        maxArticleAgeMs: INGEST_MAX_ARTICLE_AGE_MS,
        parsePublishedAtMs,
      }),
    };
  });

  const failedRssResultByOutlet = new Map<string, EndpointResult>();
  for (const result of rssResults) {
    if (result.run.method !== 'rss' || !result.run.attempted || result.run.ok) continue;
    failedRssResultByOutlet.set(result.run.outletId, result);
  }

  const { sitemapEndpoints } = buildSitemapExecutionPlan({
    allSitemapEndpoints,
    failedRssOutletIds: new Set(failedRssResultByOutlet.keys()),
    enableExplicitSitemapParallel: ENABLE_EXPLICIT_SITEMAP_PARALLEL,
  });

  const sitemapResults = await runWithConcurrency<EndpointRun, EndpointResult>(sitemapEndpoints, FETCH_CONCURRENCY, async (endpoint) => {
    const endpointKey = `${endpoint.outlet.id}:${endpoint.method}`;
    if (failingKeys.has(endpointKey)) {
      fallbackSummary.sitemapBackoffSkipped += 1;
      return {
        items: [],
        run: {
          method: 'sitemap',
          outletId: endpoint.outlet.id,
          source: endpoint.outlet.name,
          country: normalizeCountryName(endpoint.outlet.country),
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
          error: 'cooldown_high_fail',
        },
        fallbackUsed: 'none',
      };
    }
    const policyState = sitemapPolicyStatesByOutlet.get(endpoint.outlet.id);
    const disableSitemapFallbackForOutlet = disabledSitemapOutletIds.has(endpoint.outlet.id);
    if (!BACKFILL_IGNORE_BACKOFF && isSitemapPolicyBlocked(policyState, nowMs)) {
      fallbackSummary.sitemapPolicyDisabled += 1;
      const reason = policyState?.reason || policyState?.status || 'disabled';
      return {
        items: [],
        run: {
          method: 'sitemap',
          outletId: endpoint.outlet.id,
          source: endpoint.outlet.name,
          country: normalizeCountryName(endpoint.outlet.country),
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
          error: `sitemap_policy_disabled:${reason}`,
        },
        fallbackUsed: 'none',
      };
    }
    if (disableSitemapFallbackForOutlet) {
      return {
        items: [],
        run: {
          method: 'sitemap',
          outletId: endpoint.outlet.id,
          source: endpoint.outlet.name,
          country: normalizeCountryName(endpoint.outlet.country),
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
    const result = await fetchSitemap(endpoint.outlet, fallbackPublishedAt, (candidate) => {
      missingPublishedAtCandidates.push(candidate);
    });
    const lastPublicationAt = watermarks.get(endpointKey) || null;
    if (!result.run.attempted) {
      return { ...result, items: [] };
    }
    return {
      ...result,
      items: filterItemsForPersistence({
        items: result.items,
        lastPublicationAt,
        nowMs,
        backfillWindow: BACKFILL_WINDOW,
        ignoreWatermark: BACKFILL_IGNORE_WATERMARK,
        maxArticleAgeMs: INGEST_MAX_ARTICLE_AGE_MS,
        parsePublishedAtMs,
      }),
    };
  });

  const results = [...rssResults, ...sitemapResults];

  for (const result of sitemapResults) {
    const rssFailed = failedRssResultByOutlet.get(result.run.outletId);
    if (!rssFailed?.run.attempted || rssFailed.run.ok) continue;
    fallbackSummary.rssSitemapFallbackAttempts += 1;
    if (result.run.ok) {
      fallbackSummary.rssSitemapFallbackSuccess += 1;
    }
    if (result.run.error === 'sitemap_fallback_disabled' || result.run.error === 'sitemap_disabled_by_policy') {
      fallbackSummary.rssSitemapFallbackSkipped += 1;
    }
  }

  const diagnostics = results.map((r) => r.run);

  const methodStats = buildMethodStats(diagnostics);
  const sitemapResultByOutlet = new Map<string, EndpointResult>();
  for (const result of results) {
    if (result.run.method === 'sitemap') {
      sitemapResultByOutlet.set(result.run.outletId, result);
    }
  }

  const sitemapAliveSourceKeys = new Set<string>();
  for (const result of sitemapResultByOutlet.values()) {
    if (result.run.attempted && result.run.ok) {
      sitemapAliveSourceKeys.add(buildSitemapSourceKey(result.run.source, result.run.country));
    }
  }
  const defaultSitemapPolicyState: SitemapPolicyState = {
    outletId: '',
    source: '',
    country: 'Global',
    status: 'active',
    reason: null,
    lastFailureReason: null,
    consecutiveFailures: 0,
    disabledUntil: null,
    lastAttemptedAt: null,
    disabledSince: null,
    lastSuccessAt: null,
    lastCheckedAt: null
  };
  const sitemapPolicyRows: EndpointRunPolicyState[] = [];
  for (const endpoint of dedupedEndpoints) {
    if (endpoint.method !== 'sitemap') continue;
    const result = sitemapResultByOutlet.get(endpoint.outlet.id);
    if (!result) continue;
    const state = sitemapPolicyStatesByOutlet.get(endpoint.outlet.id) || {
      ...defaultSitemapPolicyState,
      outletId: endpoint.outlet.id,
      source: endpoint.outlet.name,
      country: normalizeCountryName(endpoint.outlet.country),
    };
    const sourceKey = buildSitemapSourceKey(endpoint.outlet.name, normalizeCountryName(endpoint.outlet.country));
    sitemapPolicyRows.push(
      buildSitemapPolicyStateFromRun({
        endpoint: result,
        baseState: state,
        nowMs,
        nowIso,
        sourceKey,
        sourceAliveKeys: sitemapAliveSourceKeys,
        sourceCounts: sitemapSourceCounts
      }),
    );
  }
  if (sitemapPolicyRows.length > 0) {
    await upsertSitemapPolicyStates(sitemapPolicyRows);
  }

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
  const persistedNewsArticles = await persistNewsArticles(merged);
  const persistedMissingPublishedAt = await persistMissingPublishedAtCandidates(missingPublishedAtCandidates);
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

  const counts = summarizeEndpointResults(diagnostics);
  const summary = buildWorkerSummary({
    started,
    allOutletsCount: allOutlets.length,
    countryFilteredOutletsCount: countryFilteredOutlets.length,
    sourceFilteredOutletsCount: sourceFilteredOutlets.length,
    selectedCount: selected.length,
    offset,
    nextOffset,
    countryFilter: COUNTRY_FILTER?.display || null,
    sourceFilter: SOURCE_FILTER?.display || null,
    methodFilter: METHOD_FILTER?.display || null,
    diagnostics,
    mergedItems: merged,
    persistedArticles: persistedNewsArticles.persisted,
    persistedMissingPublishedAt: persistedMissingPublishedAt.persisted,
    persistedDiagnostics: persistedDiag.persisted,
    fallbackSummary,
    articleMetaCategorySummary: { ...articleMetaCategoryStats },
  });

  writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2), 'utf8');
  if (!BACKFILL_WINDOW) {
    writeWorkerState(STATE_FILE, { offset: nextOffset, updatedAt: summary.generatedAt }, process.cwd());
  }
  console.log(formatWorkerSummaryLog({
    selectedCount: selected.length,
    countryFilteredOutletsCount: countryFilteredOutlets.length,
    sourceFilteredOutletsCount: sourceFilteredOutlets.length,
    allOutletsCount: allOutlets.length,
    attempted: counts.attempted,
    ok: counts.ok,
    failed: counts.failed,
    countryFilter: COUNTRY_FILTER?.display || null,
    sourceFilter: SOURCE_FILTER?.display || null,
    backfillLabel: BACKFILL_WINDOW ? `${BACKFILL_WINDOW.from}..${BACKFILL_WINDOW.to}` : 'off',
    explicitSitemapParallel: ENABLE_EXPLICIT_SITEMAP_PARALLEL,
    failingKeysSize: failingKeys.size,
    fallbackSummary,
    articleMetaCategorySummary: articleMetaCategoryStats,
    methodStats,
    mergedCount: merged.length,
    persistedArticles: persistedNewsArticles.persisted,
    elapsedMs: summary.elapsedMs,
    missingPublishedAtPersisted: persistedMissingPublishedAt.persisted,
    mergedItemsBySource: summary.worker.mergedItemsBySource,
  }));
}

async function main(): Promise<void> {
  const once = process.argv.includes('--once');
  if (COUNTRY_FILTER) {
    console.log(`[ingest-worker] country filter enabled: ${COUNTRY_FILTER.display.join(', ')}`);
  }
  if (SOURCE_FILTER) {
    console.log(`[ingest-worker] source filter enabled: ${SOURCE_FILTER.display.join(', ')}`);
  }
  if (METHOD_FILTER) {
    console.log(`[ingest-worker] method filter enabled: ${METHOD_FILTER.display.join(', ')}`);
  }
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
