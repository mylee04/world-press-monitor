#!/usr/bin/env bun
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { isKnownNonArticleUrl } from '@/lib/article-url-filters';
import { fetchWithRetry, readResponseText } from '@/lib/fetch-utils';
import { normalizeReadableArticleTitle } from '@/lib/html-entities';
import { parseHtmlCollectionWithStats, parseRssOrAtomWithStats, parseSitemapWithStats, type ParsedFeedBatch, type ParsedFeedItem } from '@/lib/parsers';
import { runWithConcurrency } from '@/lib/concurrency';
import { deriveUrlArticleStableId, normalizeLinkForId } from '@/lib/pipeline';
import { normalizeLooseDateToIso } from '@/lib/date-parsing';

type AtlasFeed = {
  row?: number;
  name: string;
  url: string | null;
  sitemapUrl?: string | null;
  enabled?: boolean;
};

type AtlasCountry = {
  name: string;
  code: string;
  feeds: AtlasFeed[];
};

type Atlas = {
  countries: AtlasCountry[];
};

type CandidateRow = {
  source?: string;
  rss?: string;
  name?: string;
  url?: string;
  sitemapUrl?: string;
  sitemap?: string;
};

type CandidateSpec = {
  country: string;
  filePath: string;
};

type FeedInput = {
  country: string;
  source: string;
  url: string;
  kind: 'current' | 'candidate';
  method: 'rss' | 'sitemap';
  fromFile?: string;
};

type FeedResult = {
  country: string;
  source: string;
  url: string;
  kind: 'current' | 'candidate';
  fromFile?: string;
  ok: boolean;
  statusCode?: number;
  contentType?: string;
  error?: string;
  totalParsed: number;
  recent24h: number;
  newestItemAt?: string;
  sampleTitles: string[];
};

type FeedInspection = FeedResult & {
  recentLinkIds: string[];
};

type CountrySummary = {
  country: string;
  currentFeeds: number;
  candidateFeeds: number;
  currentOk: number;
  candidateOk: number;
  currentRecent24h: number;
  currentUnique24h: number;
  candidateRecent24h: number;
  candidateUnique24h: number;
  candidateNewRecent24h: number;
  topCandidates: FeedResult[];
};

type CoverageReport = {
  generatedAt: string;
  countries: CountrySummary[];
  results: FeedResult[];
};

const DEFAULT_ATLAS_PATH = resolve(process.cwd(), 'data/rss-atlas.json');
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_ATTEMPTS = 2;
const DEFAULT_CONCURRENCY = 8;
const DEFAULT_ITEM_LIMIT = 1000;
const DEFAULT_OUTPUT_PATH = resolve(process.cwd(), 'audits/rss-country-coverage-latest.json');
const SITEMAP_INDEX_CHILDREN_LIMIT = 8;
const SITEMAP_INDEX_MAX_DEPTH = 2;
const MAX_FUTURE_PUBLISHED_AT_MS = 24 * 60 * 60 * 1000;
const ZERO_FUTURE_PUBLISHED_AT_HOSTS = [
  'noordhollandsdagblad.nl',
  'haarlemsdagblad.nl',
  'leidschdagblad.nl',
  'ijmuidercourant.nl',
  'gooieneemlander.nl',
];

function maxFuturePublishedAtMsForUrl(url: string | undefined): number {
  if (!url) return MAX_FUTURE_PUBLISHED_AT_MS;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (ZERO_FUTURE_PUBLISHED_AT_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
      return 0;
    }
  } catch {
    return MAX_FUTURE_PUBLISHED_AT_MS;
  }
  return MAX_FUTURE_PUBLISHED_AT_MS;
}
const RUSSIAN_REGIONAL_SITEMAP_HOSTS = new Set([
  'ngs.ru',
  'www.ngs.ru',
  '74.ru',
  'www.74.ru',
  '72.ru',
  'www.72.ru',
  '93.ru',
  'www.93.ru',
  '116.ru',
  'www.116.ru',
  '59.ru',
  'www.59.ru',
  '161.ru',
  'www.161.ru',
  '29.ru',
  'www.29.ru',
  '76.ru',
  'www.76.ru',
  'nn.ru',
  'www.nn.ru',
]);
const RUSSIAN_REGIONAL_SITEMAP_URL_LIMIT = 120;
const REGNUM_SITEMAP_URL_LIMIT = 64;
const ARTICLE_PUBLISHED_AT_FETCH_LIMIT = 60;
const ARTICLE_PUBLISHED_AT_FALLBACK_SOURCES = [
  'bernama',
  'dk nyt',
  'dk social',
  'dk teknik og miljø',
  'dk sundhed',
  'dk indkøb',
  'arn news centre',
];

const FEED_FETCH_HEADERS = {
  'User-Agent':
    process.env.INGEST_USER_AGENT ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  Accept: 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*',
  'Accept-Language': process.env.INGEST_ACCEPT_LANGUAGE || 'en-US,en;q=0.9,es;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
};
const ENABLE_BROWSER_SITEMAP_FALLBACK =
  process.env.INGEST_BROWSER_SITEMAP_FALLBACK === undefined ||
  /^(1|true|yes|on)$/i.test(process.env.INGEST_BROWSER_SITEMAP_FALLBACK);
const BROWSER_SITEMAP_FALLBACK_DOMAINS = new Set(
  (
    process.env.INGEST_BROWSER_SITEMAP_DOMAINS ||
    'www.ouest-france.fr,www.sudouest.fr,www.challenges.fr,www.firstpost.com,firstpost.com,www.dnaindia.com,dnaindia.com,yourstory.com,www.yourstory.com,www.business-standard.com,business-standard.com,www.news18.com,news18.com,www.ndtv.com,ndtv.com,www.orilliamatters.com,orilliamatters.com,www.collingwoodtoday.ca,collingwoodtoday.ca,www.vancouverisawesome.com,vancouverisawesome.com,www.nsnews.com,nsnews.com,www.richmond-news.com,richmond-news.com,www.princegeorgecitizen.com,princegeorgecitizen.com,www.delta-optimist.com,delta-optimist.com,www.moosejawtoday.com,moosejawtoday.com,www.sasktoday.ca,sasktoday.ca,www.bradfordtoday.ca,bradfordtoday.ca,www.elliotlaketoday.com,elliotlaketoday.com,www.midlandtoday.ca,midlandtoday.ca,www.standaard.be,www.nieuwsblad.be,www.gva.be,www.hbvl.be,www.rtl.be,rtl.be,www.blick.ch,blick.ch,www.pna.gov.ph,pna.gov.ph,businessmirror.com.ph,www.malaya.com.ph,malaya.com.ph,manilastandard.net,www.manilastandard.net,news.abs-cbn.com,www.startribune.com,www.miamiherald.com,www.kansascity.com,www.sacbee.com,www.charlotteobserver.com,www.newsobserver.com,www.star-telegram.com,www.fresnobee.com,www.idahostatesman.com,www.kentucky.com,www.thestate.com,www.thenewstribune.com,www.expressnews.com,www.timesunion.com,www.ctinsider.com,www.sfchronicle.com,www.sfgate.com,www.ctpost.com,www.nhregister.com,www.houstonchronicle.com,www.jpnn.com,jabar.jpnn.com,jatim.jpnn.com,www.tribunnews.com,www.jawapos.com,kumparan.com,mediaindonesia.com,www.pikiran-rakyat.com,www.crimeworld.com,crimeworld.com,www.thesun.ie,thesun.ie,www.thesun.co.uk,thesun.co.uk,www.telegraph.co.uk,telegraph.co.uk,www.tvsarawak.my,tvsarawak.my,www.liepajniekiem.lv,liepajniekiem.lv,guardian.ng,www.guardian.ng,nairametrics.com,www.nairametrics.com,premiumtimesng.com,www.premiumtimesng.com,www.news247.gr,news247.gr,www.sport24.gr,sport24.gr,www.documentonews.gr,documentonews.gr,www.noordhollandsdagblad.nl,noordhollandsdagblad.nl,www.haarlemsdagblad.nl,haarlemsdagblad.nl,www.leidschdagblad.nl,leidschdagblad.nl,www.ijmuidercourant.nl,ijmuidercourant.nl,www.gooieneemlander.nl,gooieneemlander.nl,www.autoweek.nl,autoweek.nl,www.arabianbusiness.com,arabianbusiness.com'
  )
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);
const BROWSER_SITEMAP_HELPER = resolve(process.cwd(), 'scripts/fetch-sitemap-browser.mjs');
const articlePublishedAtCache = new Map<string, Promise<string>>();

function parseArgValue(prefix: string): string[] {
  return process.argv
    .slice(2)
    .filter((token) => token.startsWith(prefix))
    .map((token) => token.slice(prefix.length).trim())
    .filter(Boolean);
}

function parseCsvArg(prefix: string): string[] {
  return parseArgValue(prefix)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseIntArg(prefix: string, fallback: number): number {
  const raw = parseArgValue(prefix).at(-1);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseStringArg(prefix: string, fallback: string): string {
  return parseArgValue(prefix).at(-1) || fallback;
}

function normalizeCountry(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function parseCandidateSpecs(): CandidateSpec[] {
  return parseArgValue('--candidate-file=')
    .map((value) => {
      const splitIndex = value.indexOf(':');
      if (splitIndex <= 0 || splitIndex === value.length - 1) {
        throw new Error(`Invalid --candidate-file format: ${value}. Use Country:/absolute/or/relative/path.json`);
      }
      return {
        country: value.slice(0, splitIndex).trim(),
        filePath: resolve(process.cwd(), value.slice(splitIndex + 1).trim()),
      } satisfies CandidateSpec;
    });
}

function loadAtlas(filePath: string): Atlas {
  const raw = readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as Atlas;
}

function loadCurrentFeeds(atlas: Atlas, countries: string[]): FeedInput[] {
  const targetSet = new Set(countries.map(normalizeCountry));
  return atlas.countries.flatMap((country) => {
    if (!targetSet.has(normalizeCountry(country.name))) return [];
    return (country.feeds || []).flatMap((feed) => {
      if (feed.enabled === false) return [];
      const inputs: FeedInput[] = [];
      if (typeof feed.url === 'string' && feed.url.trim().length > 0) {
        inputs.push({
          country: country.name,
          source: feed.name,
          url: feed.url.trim(),
          kind: 'current',
          method: 'rss',
        });
      }
      if (typeof feed.sitemapUrl === 'string' && feed.sitemapUrl.trim().length > 0) {
        inputs.push({
          country: country.name,
          source: feed.name,
          url: feed.sitemapUrl.trim(),
          kind: 'current',
          method: 'sitemap',
        });
      }
      return inputs;
    });
  });
}

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function normalizeCandidateRows(country: string, filePath: string, payload: unknown): FeedInput[] {
  if (Array.isArray(payload)) {
    return payload
      .map((row) => row as CandidateRow)
      .flatMap((row) => {
        const source = (row.source || row.name || 'Unknown source').trim();
        const fromFile = basename(filePath);
        const inputs: FeedInput[] = [];
        const rssUrl = typeof (row.rss || row.url) === 'string' ? String(row.rss || row.url).trim() : '';
        const sitemapUrl = typeof (row.sitemapUrl || row.sitemap) === 'string' ? String(row.sitemapUrl || row.sitemap).trim() : '';
        if (rssUrl) {
          inputs.push({ country, source, url: rssUrl, kind: 'candidate', method: 'rss', fromFile });
        }
        if (sitemapUrl) {
          inputs.push({ country, source, url: sitemapUrl, kind: 'candidate', method: 'sitemap', fromFile });
        }
        return inputs;
      });
  }

  const atlasLike = payload as Atlas | undefined;
  const matchedCountry = atlasLike?.countries?.find((entry) => normalizeCountry(entry.name) === normalizeCountry(country));
  if (!matchedCountry) return [];

  return (matchedCountry.feeds || []).flatMap((feed) => {
    const fromFile = basename(filePath);
    const inputs: FeedInput[] = [];
    if (typeof feed.url === 'string' && feed.url.trim().length > 0) {
      inputs.push({
        country: matchedCountry.name,
        source: feed.name.trim(),
        url: feed.url.trim(),
        kind: 'candidate',
        method: 'rss',
        fromFile,
      });
    }
    if (typeof feed.sitemapUrl === 'string' && feed.sitemapUrl.trim().length > 0) {
      inputs.push({
        country: matchedCountry.name,
        source: feed.name.trim(),
        url: feed.sitemapUrl.trim(),
        kind: 'candidate',
        method: 'sitemap',
        fromFile,
      });
    }
    return inputs;
  });
}

function loadCandidateFeeds(specs: CandidateSpec[]): FeedInput[] {
  return specs.flatMap((spec) => normalizeCandidateRows(spec.country, spec.filePath, readJson(spec.filePath)));
}

function dedupeFeeds(feeds: FeedInput[], currentFeeds: FeedInput[]): FeedInput[] {
  const currentUrlSet = new Set(currentFeeds.map((feed) => `${normalizeCountry(feed.country)}|${normalizeUrl(feed.url)}`));
  const seen = new Set<string>();
  const deduped: FeedInput[] = [];

  for (const feed of feeds) {
    const normalizedCountry = normalizeCountry(feed.country);
    const normalizedUrl = normalizeUrl(feed.url);
    const key = `${normalizedCountry}|${normalizedUrl}`;
    if (feed.kind === 'candidate' && currentUrlSet.has(key)) continue;
    if (seen.has(`${key}|${feed.kind}`)) continue;
    seen.add(`${key}|${feed.kind}`);
    deduped.push(feed);
  }

  return deduped;
}

function isLikelyHtmlResponse(contentType: string, body: string): boolean {
  if (isLikelyXmlPayload(body)) return false;
  const loweredType = contentType.toLowerCase();
  if (loweredType.includes('text/html') || loweredType.includes('application/xhtml+xml')) return true;
  const sample = body.slice(0, 4000).toLowerCase();
  return sample.includes('<html') || sample.includes('<!doctype html') || sample.includes('<head');
}

function isLikelyXmlPayload(body: string): boolean {
  const sample = body.slice(0, 4000).toLowerCase();
  return (
    sample.includes('<rss') ||
    sample.includes('<feed') ||
    sample.includes('<urlset') ||
    sample.includes('<sitemapindex') ||
    sample.includes('<?xml')
  );
}

function normalizeSourceKey(value: string): string {
  return (value || '').trim().toLowerCase();
}

function shouldAttemptHtmlCollectionFeed(source: string, url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    if (
      hostname === 'nyheder.tv2.dk'
      || hostname === 'www.altinget.dk'
      || hostname === 'herningfolkeblad.dk'
      || hostname === 'midtjyllandsavis.dk'
      || hostname === 'skivefolkeblad.dk'
      || hostname === 'www.abounderrattelser.fi'
      || hostname === 'abounderrattelser.fi'
      || ((hostname === 'www.gulftoday.ae' || hostname === 'gulftoday.ae') && (pathname === '/news' || pathname === '/news/'))
      || hostname === 'www.arnnewscentre.ae'
      || hostname === 'arnnewscentre.ae'
    ) return true;
  } catch {
    // Ignore malformed URLs and fall through to source-name matching.
  }
  const normalizedSource = normalizeSourceKey(source);
  return (
    normalizedSource.includes('tv2 nyheder - html collection')
    || normalizedSource.includes('altinget christiansborg - html collection')
    || normalizedSource.includes('altinget eu - html collection')
    || normalizedSource.includes('altinget kommunal - html collection')
    || normalizedSource.includes('altinget sundhed - html collection')
    || normalizedSource.includes('altinget klima - html collection')
    || normalizedSource.includes('herning folkeblad - html collection')
    || normalizedSource.includes('midtjyllands avis - html collection')
    || normalizedSource.includes('skive folkeblad - html collection')
    || normalizedSource.includes('abo underrattelser - html collection')
    || normalizedSource.includes('gulf today - html collection')
    || normalizedSource.includes('arn news centre - html collection')
  );
}

function shouldFetchArticlePublishedAt(source: string, url: string): boolean {
  if (!url || isKnownNonArticleUrl(source, url)) return false;
  const normalizedSource = normalizeSourceKey(source);
  return ARTICLE_PUBLISHED_AT_FALLBACK_SOURCES.some((candidate) => normalizedSource.includes(candidate));
}

function normalizeBernamaPublishedAtCandidate(value: string): string {
  const trimmed = (value || '').trim();
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM))?$/i);
  if (!match) return '';

  const day = Number.parseInt(match[1] || '0', 10);
  const month = Number.parseInt(match[2] || '0', 10);
  const year = Number.parseInt(match[3] || '0', 10);
  let hour = Number.parseInt(match[4] || '0', 10);
  const minute = Number.parseInt(match[5] || '0', 10);
  const second = Number.parseInt(match[6] || '0', 10);
  const meridiem = (match[7] || '').toUpperCase();

  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return '';
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || !Number.isFinite(second)) return '';
  if (day < 1 || day > 31 || month < 1 || month > 12) return '';

  if (meridiem === 'AM') {
    hour = hour === 12 ? 0 : hour;
  } else if (meridiem === 'PM') {
    hour = hour === 12 ? 12 : hour + 12;
  }

  const utcMs = Date.UTC(year, month - 1, day, hour - 8, minute, second);
  return Number.isFinite(utcMs) ? new Date(utcMs).toISOString() : '';
}

function extractArticlePagePublishedAt(source: string, html: string): string {
  const patterns = [
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']pubdate["'][^>]+content=["']([^"']+)["']/i,
    /"datePublished"\s*:\s*"([^"]+)"/i,
    /"publishedDate"\s*:\s*"([^"]+)"/i,
    /"publishedAt"\s*:\s*"([^"]+)"/i,
    /<time[^>]+datetime=["']([^"']+)["']/i,
  ];

  for (const pattern of patterns) {
    const raw = html.match(pattern)?.[1] || '';
    const normalized =
      (normalizeSourceKey(source).includes('bernama') ? normalizeBernamaPublishedAtCandidate(raw) : '')
      || normalizeLooseDateToIso(raw);
    if (normalized) return normalized;
  }

  return '';
}

async function fetchArticlePublishedAt(source: string, url: string, timeoutMs: number): Promise<string> {
  const cacheKey = `${normalizeSourceKey(source)}\n${url.trim()}`;
  const existing = articlePublishedAtCache.get(cacheKey);
  if (existing) return existing;

  const task = (async () => {
    try {
      const response = await fetchWithRetry(url, {
        timeoutMs: Math.min(timeoutMs, 8000),
        attempts: 2,
        fetchOptions: {
          redirect: 'follow',
          headers: FEED_FETCH_HEADERS,
        }
      });
      if (!response.ok) return '';
      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (contentType && !contentType.includes('html') && !contentType.includes('xml')) return '';
      return extractArticlePagePublishedAt(source, (await readResponseText(response, url)).text);
    } catch {
      return '';
    }
  })();

  articlePublishedAtCache.set(cacheKey, task);
  return task;
}

async function enrichItemsWithPublishedAt(
  feed: FeedInput,
  items: ParsedFeedItem[],
  timeoutMs: number
): Promise<ParsedFeedItem[]> {
  const missing = items
    .filter((item) => !toIso(item.publishedAt) && shouldFetchArticlePublishedAt(feed.source, item.link || ''))
    .slice(0, ARTICLE_PUBLISHED_AT_FETCH_LIMIT);
  if (missing.length === 0) return items;

  const fetched = await runWithConcurrency(missing, Math.min(8, missing.length), async (item) => ({
    link: item.link,
    publishedAt: await fetchArticlePublishedAt(feed.source, item.link || '', timeoutMs),
  }));
  const publishedAtByLink = new Map(
    fetched
      .filter((row) => row.publishedAt)
      .map((row) => [row.link, row.publishedAt] as const)
  );

  return items.map((item) => {
    if (toIso(item.publishedAt) || !item.link) return item;
    const publishedAt = publishedAtByLink.get(item.link);
    return publishedAt ? { ...item, publishedAt } : item;
  });
}

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
    if (!isSitemapLike && !isFeedLike) return false;
  } catch {
    return false;
  }

  if (!response) return true;
  if (response.status === 403 || response.status === 503) return true;
  if (!body.trim()) return true;
  return isLikelyHtmlResponse(response.headers.get('content-type') || '', body);
}

function normalizeBrowserXmlPayload(payload: string): string {
  const trimmed = payload.trim();
  const xmlStart = trimmed.search(/<(?:\?xml|rss|feed|urlset|sitemapindex)\b/i);
  return xmlStart >= 0 ? trimmed.slice(xmlStart) : trimmed;
}

function fetchXmlWithBrowser(url: string): Response {
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

function parseSitemapIndexLocDateMs(loc: string): number | null {
  const slashPattern = loc.match(/(20\d{2})\/([1-9]|0[1-9]|1[0-2])(?:\/([1-9]|0[1-9]|[12]\d|3[01]))?(?=(?:\D|$))/);
  if (slashPattern) {
    const year = Number.parseInt(slashPattern[1] || '0', 10);
    const month = Number.parseInt(slashPattern[2] || '0', 10);
    const day = Number.parseInt(slashPattern[3] || '1', 10);
    const ts = Date.UTC(year, month - 1, day);
    return Number.isFinite(ts) ? ts : null;
  }
  const dashPattern = loc.match(/(20\d{2})-([1-9]|0[1-9]|1[0-2])(?:-([1-9]|0[1-9]|[12]\d|3[01]))?(?=(?:\D|$))/);
  if (dashPattern) {
    const year = Number.parseInt(dashPattern[1] || '0', 10);
    const month = Number.parseInt(dashPattern[2] || '0', 10);
    const day = Number.parseInt(dashPattern[3] || '1', 10);
    const ts = Date.UTC(year, month - 1, day);
    return Number.isFinite(ts) ? ts : null;
  }

  try {
    const parsedUrl = new URL(loc);
    const year = parsedUrl.searchParams.get('yyyy') || parsedUrl.searchParams.get('year');
    const month = parsedUrl.searchParams.get('mm') || parsedUrl.searchParams.get('month');
    const day = parsedUrl.searchParams.get('dd') || parsedUrl.searchParams.get('day');
    if (year && month) {
      const yearNumber = Number.parseInt(year, 10);
      const monthNumber = Number.parseInt(month, 10);
      const dayNumber = Number.parseInt(day || '1', 10);
      const ts = Date.UTC(yearNumber, monthNumber - 1, dayNumber);
      return Number.isFinite(ts) ? ts : null;
    }
  } catch {
    // Ignore malformed URLs and fall through.
  }

  return null;
}

function parseSitemapIndexLocNumericTail(loc: string): number | null {
  try {
    const parsedUrl = new URL(loc);
    const fromParam = parsedUrl.searchParams.get('from');
    if (fromParam) {
      const parsedFrom = Number.parseInt(fromParam, 10);
      if (Number.isFinite(parsedFrom)) return -parsedFrom;
    }
  } catch {
    // Ignore malformed URLs and fall through.
  }

  const match = loc.match(/(\d+)(?!.*\d)/);
  if (!match) return null;
  const parsed = Number.parseInt(match[1] || '', 10);
  return Number.isFinite(parsed) ? parsed : null;
}

type SitemapIndexEntry = {
  loc: string;
  lastmodMs: number | null;
  locDateMs: number | null;
  locNumericTail: number | null;
  index: number;
};

function cleanSitemapIndexValue(value: string): string {
  return value
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/gi, '&')
    .trim();
}

function resolveHostSpecificSitemapItemLimit(baseUrl: string, fallbackLimit: number): number {
  try {
    const parsed = new URL(baseUrl);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    if (RUSSIAN_REGIONAL_SITEMAP_HOSTS.has(hostname) && /\/articles_20\d{2}_\d{2}\.xml(?:\.gz)?$/.test(pathname)) {
      return Math.min(fallbackLimit, RUSSIAN_REGIONAL_SITEMAP_URL_LIMIT);
    }

    if ((hostname === 'regnum.ru' || hostname === 'www.regnum.ru') && /\/sitemap\/news\/20\d{2}-\d{2}\.xml$/.test(pathname)) {
      return Math.min(fallbackLimit, REGNUM_SITEMAP_URL_LIMIT);
    }
  } catch {
    return fallbackLimit;
  }

  return fallbackLimit;
}

function selectSitemapIndexEntries(entries: SitemapIndexEntry[], baseUrl: string): SitemapIndexEntry[] {
  if (entries.length === 0) return [];

  let hostname = '';
  try {
    hostname = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    hostname = '';
  }

  const isKwongWah = hostname === 'www.kwongwah.com.my' || hostname === 'kwongwah.com.my';
  if (isKwongWah) {
    const kwongWahLimit = Math.min(4, SITEMAP_INDEX_CHILDREN_LIMIT);
    const withLastmod = entries.filter((entry) => entry.lastmodMs !== null);
    return (withLastmod.length > 0 ? withLastmod : entries).slice(0, kwongWahLimit);
  }

  const isFontanka = hostname === 'www.fontanka.ru' || hostname === 'fontanka.ru';
  if (isFontanka) {
    const fontankaLimit = Math.min(2, SITEMAP_INDEX_CHILDREN_LIMIT);
    const monthlyEntries = entries
      .filter((entry) => /\/articles_(20\d{2})_(0[1-9]|1[0-2])\.xml(?:\.gz)?$/i.test(entry.loc))
      .sort((left, right) => {
        const leftMatch = left.loc.match(/\/articles_(20\d{2})_(0[1-9]|1[0-2])\.xml(?:\.gz)?$/i);
        const rightMatch = right.loc.match(/\/articles_(20\d{2})_(0[1-9]|1[0-2])\.xml(?:\.gz)?$/i);
        const leftStamp = leftMatch ? Date.UTC(Number.parseInt(leftMatch[1] || '0', 10), Number.parseInt(leftMatch[2] || '1', 10) - 1, 1) : Number.NEGATIVE_INFINITY;
        const rightStamp = rightMatch ? Date.UTC(Number.parseInt(rightMatch[1] || '0', 10), Number.parseInt(rightMatch[2] || '1', 10) - 1, 1) : Number.NEGATIVE_INFINITY;
        return rightStamp - leftStamp;
      });
    if (monthlyEntries.length > 0) return monthlyEntries.slice(0, fontankaLimit);
  }

  const is47News = hostname === '47news.ru' || hostname === 'www.47news.ru';
  if (is47News) {
    const latestArticleChildren = entries.filter((entry) => /\/articles-\d+\.xml(?:\.gz)?$/i.test(entry.loc));
    if (latestArticleChildren.length > 0) return latestArticleChildren.slice(0, Math.min(2, SITEMAP_INDEX_CHILDREN_LIMIT));
  }

  const isZarpanews = hostname === 'www.zarpanews.gr' || hostname === 'zarpanews.gr';
  if (isZarpanews) {
    const postEntries = entries.filter((entry) => /\/post-sitemap\d*\.xml(?:\.gz)?$/i.test(entry.loc));
    if (postEntries.length > 0) return postEntries.slice(0, Math.min(2, SITEMAP_INDEX_CHILDREN_LIMIT));
  }

  const isRussianRegionalPortal = RUSSIAN_REGIONAL_SITEMAP_HOSTS.has(hostname);
  if (isRussianRegionalPortal) {
    const monthlyArticleEntries = entries.filter((entry) => /\/articles_20\d{2}_\d{2}\.xml(?:\.gz)?$/i.test(entry.loc));
    if (monthlyArticleEntries.length > 0) return monthlyArticleEntries.slice(0, 1);
  }

  const isRegnumNewsIndex = hostname === 'regnum.ru' && (() => {
    try {
      return new URL(baseUrl).pathname === '/sitemap/news.xml';
    } catch {
      return false;
    }
  })();
  if (isRegnumNewsIndex) {
    const monthlyEntries = entries.filter((entry) => /\/sitemap\/news\/20\d{2}-\d{2}\.xml$/i.test(entry.loc));
    if (monthlyEntries.length > 0) return monthlyEntries.slice(0, 1);
  }

  const isMtvUutiset = hostname === 'www.mtvuutiset.fi' || hostname === 'mtvuutiset.fi';
  if (isMtvUutiset) {
    const preferredEntries = entries.filter((entry) => /(?:^|\/)(?:newssitemap|videositemap)(?:\.xml(?:\.gz)?)?$/i.test(entry.loc));
    if (preferredEntries.length > 0) {
      return preferredEntries.slice(0, Math.min(2, SITEMAP_INDEX_CHILDREN_LIMIT));
    }
  }

  const nowMs = Date.now();
  const scoredEntries = entries
    .map((entry) => ({ entry, score: scoreSitemapIndexEntry(entry, nowMs) }))
    .filter((row) => row.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const leftLastmod = left.entry.lastmodMs ?? Number.NEGATIVE_INFINITY;
      const rightLastmod = right.entry.lastmodMs ?? Number.NEGATIVE_INFINITY;
      if (rightLastmod !== leftLastmod) return rightLastmod - leftLastmod;
      const leftLocDate = left.entry.locDateMs ?? Number.NEGATIVE_INFINITY;
      const rightLocDate = right.entry.locDateMs ?? Number.NEGATIVE_INFINITY;
      if (rightLocDate !== leftLocDate) return rightLocDate - leftLocDate;
      return right.entry.index - left.entry.index;
    })
    .map((row) => row.entry);
  if (scoredEntries.length > 0) {
    return scoredEntries.slice(0, SITEMAP_INDEX_CHILDREN_LIMIT);
  }

  return entries.slice(0, SITEMAP_INDEX_CHILDREN_LIMIT);
}

function scoreSitemapIndexEntry(entry: SitemapIndexEntry, nowMs: number): number {
  const loc = entry.loc.toLowerCase();
  let score = 0;

  if (/(?:^|\/)(?:newssitemap|news-sitemap|gnews_sitemap|gnews|google-news|google_news|sitemap_latest|latest)(?:\.xml(?:\.gz)?)?$/i.test(loc)) {
    score += 600;
  }
  if (/(?:^|\/)(?:videositemap|video-sitemap)(?:\.xml(?:\.gz)?)?$/i.test(loc)) {
    score += 520;
  }
  if (/sitemap(?:[_-](?:main|content|post|posts))|\/sitemap\/news\b|\/post-sitemap|\/posts?\b|\/articles?\b/i.test(loc)) {
    score += 180;
  }
  if (/(?:author|tag|toptag|top-tags|top_tags|weather|horoskop|horoscope|navigation|teemasivut|minisite|maintopics|main-topics|legacy-taxonomies|\/site\/sitemap)/i.test(loc)) {
    score -= 420;
  }

  if (entry.lastmodMs !== null) {
    if (entry.lastmodMs >= nowMs - 2 * 24 * 60 * 60 * 1000) score += 220;
    else if (entry.lastmodMs < nowMs - 60 * 24 * 60 * 60 * 1000) score -= 120;
  }

  if (entry.locDateMs !== null) {
    if (entry.locDateMs >= nowMs - 35 * 24 * 60 * 60 * 1000) score += 80;
    else if (entry.locDateMs < nowMs - 45 * 24 * 60 * 60 * 1000) score -= 220;
  }

  return score;
}

function resolveSitemapIndexOverrides(baseUrl: string): string[] {
  try {
    const parsed = new URL(baseUrl);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    if ((hostname === 'www.ts.fi' || hostname === 'ts.fi') && pathname === '/content/app/staticsitemaps/sitemapindex_recent.xml') {
      return ['https://www.ts.fi/sitemap_latest.xml', 'https://www.ts.fi/gnews_sitemap.xml'];
    }
  } catch {
    return [];
  }

  return [];
}

function parseSitemapIndex(xml: string, baseUrl: string): string[] {
  if (!/<sitemapindex[\s>]/i.test(xml)) return [];
  const overrideChildren = resolveSitemapIndexOverrides(baseUrl);
  if (overrideChildren.length > 0) return overrideChildren;
  const strictMatches = [...xml.matchAll(/<sitemap>([\s\S]*?)<\/sitemap>/gi)]
    .map((match) => match[1] || '');
  const entries = (strictMatches.length > 0
    ? strictMatches
    : [...xml.matchAll(/<sitemap\b[^>]*>([\s\S]*?)(?=<\/sitemap>|<sitemap\b|$)/gi)].map((match) => match[1] || '')
  )
    .map((body, index) => {
      const locRaw = cleanSitemapIndexValue(body.match(/<loc[^>]*>([\s\S]*?)<\/loc>/i)?.[1] || '');
      let loc = '';
      if (locRaw) {
        try {
          loc = new URL(locRaw, baseUrl).toString();
        } catch {
          loc = locRaw;
        }
      }
      const lastmodRaw = cleanSitemapIndexValue(body.match(/<lastmod[^>]*>([\s\S]*?)<\/lastmod>/i)?.[1] || '');
      const lastmodMs = lastmodRaw ? Date.parse(lastmodRaw) : NaN;
      return {
        loc,
        lastmodMs: Number.isFinite(lastmodMs) ? lastmodMs : null,
        locDateMs: parseSitemapIndexLocDateMs(loc),
        locNumericTail: parseSitemapIndexLocNumericTail(loc),
        index,
      };
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

  return selectSitemapIndexEntries(entries, baseUrl).map((entry) => entry.loc);
}

function mergeParsedBatches(batches: ParsedFeedBatch[], itemLimit: number): ParsedFeedBatch {
  const seen = new Set<string>();
  const items: ParsedFeedItem[] = [];
  const stats = {
    totalCandidates: 0,
    validCount: 0,
    missingTitleCount: 0,
    missingSummaryCount: 0,
    missingPublishedAtCount: 0,
    missingLinkCount: 0,
  };

  for (const batch of batches) {
    stats.totalCandidates += batch.stats.totalCandidates;
    stats.validCount += batch.stats.validCount;
    stats.missingTitleCount += batch.stats.missingTitleCount;
    stats.missingSummaryCount += batch.stats.missingSummaryCount;
    stats.missingPublishedAtCount += batch.stats.missingPublishedAtCount;
    stats.missingLinkCount += batch.stats.missingLinkCount;

    for (const item of batch.items) {
      const key = deriveUrlArticleStableId(item.link) || normalizeLinkForId(item.link) || `${item.title}|${item.publishedAt}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
  }

  items.sort((left, right) => {
    const leftTs = Date.parse(left.publishedAt || '');
    const rightTs = Date.parse(right.publishedAt || '');
    if (Number.isFinite(leftTs) && Number.isFinite(rightTs) && rightTs !== leftTs) {
      return rightTs - leftTs;
    }
    return (right.link || '').localeCompare(left.link || '');
  });

  return {
    items: items.slice(0, itemLimit),
    stats,
  };
}

async function parseXmlRecursively(
  url: string,
  body: string,
  itemLimit: number,
  timeoutMs: number,
  attempts: number,
  depth = 0,
  seen = new Set<string>()
): Promise<ParsedFeedBatch> {
  const sitemap = parseSitemapWithStats(body, resolveHostSpecificSitemapItemLimit(url, itemLimit), url);
  if (sitemap.items.length > 0 || sitemap.stats.totalCandidates > 0) {
    return sitemap;
  }

  const feed = parseRssOrAtomWithStats(body, itemLimit);
  if (feed.items.length > 0) {
    return feed;
  }

  if (depth >= SITEMAP_INDEX_MAX_DEPTH) {
    return feed;
  }

  const childUrls = parseSitemapIndex(body, url).filter((childUrl) => !seen.has(childUrl));
  if (childUrls.length === 0) {
    return feed;
  }

  const nextSeen = new Set(seen);
  nextSeen.add(url);
  const childResults = await runWithConcurrency(childUrls, Math.min(4, childUrls.length), async (childUrl) => {
    if (nextSeen.has(childUrl)) return null;
    nextSeen.add(childUrl);
    try {
      let response: Response | null = null;
      let childBody = '';
      try {
        response = await fetchWithRetry(childUrl, {
          timeoutMs,
          attempts,
          fetchOptions: {
            redirect: 'follow',
            headers: FEED_FETCH_HEADERS,
          }
        });
        childBody = (await readResponseText(response, childUrl)).text;
      } catch {
        response = null;
      }

      if (!response || ((!response.ok || isLikelyHtmlResponse(response.headers.get('content-type') || '', childBody)) && !isLikelyXmlPayload(childBody))) {
        if (!shouldAttemptBrowserSitemapFallback(childUrl, response, childBody)) return null;
        response = fetchXmlWithBrowser(childUrl);
        childBody = (await readResponseText(response, childUrl)).text;
      }

      if (!response.ok && !isLikelyXmlPayload(childBody)) return null;
      if (isLikelyHtmlResponse(response.headers.get('content-type') || '', childBody)) return null;
      return await parseXmlRecursively(childUrl, childBody, itemLimit, timeoutMs, attempts, depth + 1, nextSeen);
    } catch {
      return null;
    }
  });

  return mergeParsedBatches(childResults.filter((result): result is ParsedFeedBatch => Boolean(result)), itemLimit);
}

function toIso(value: string): string | null {
  const normalized = normalizeLooseDateToIso(value);
  return normalized || null;
}

async function inspectFeed(feed: FeedInput, itemLimit: number, timeoutMs: number, attempts: number): Promise<FeedInspection> {
  try {
    let response: Response | null = null;
    let contentType = '';
    let body = '';
    try {
      response = await fetchWithRetry(feed.url, {
        timeoutMs,
        attempts,
        fetchOptions: {
          redirect: 'follow',
          headers: FEED_FETCH_HEADERS,
        }
      });
      contentType = response.headers.get('content-type') || '';
      body = (await readResponseText(response, feed.url)).text;
    } catch (error) {
      if (!shouldAttemptBrowserSitemapFallback(feed.url, null, '')) {
        throw error;
      }
      response = fetchXmlWithBrowser(feed.url);
      contentType = response.headers.get('content-type') || '';
      body = (await readResponseText(response, feed.url)).text;
    }

    if (((!response.ok || isLikelyHtmlResponse(contentType, body)) && !isLikelyXmlPayload(body)) && shouldAttemptBrowserSitemapFallback(feed.url, response, body)) {
      response = fetchXmlWithBrowser(feed.url);
      contentType = response.headers.get('content-type') || '';
      body = (await readResponseText(response, feed.url)).text;
    }

    if (!response) {
      throw new Error('FETCH_ERROR');
    }

    if (!response.ok && !isLikelyXmlPayload(body)) {
      return {
        ...feed,
        ok: false,
        statusCode: response.status,
        contentType,
        error: `HTTP_${response.status}`,
        totalParsed: 0,
        recent24h: 0,
        sampleTitles: [],
        recentLinkIds: [],
      };
    }

    let parsed: ParsedFeedBatch;
    if (isLikelyHtmlResponse(contentType, body)) {
      if (!shouldAttemptHtmlCollectionFeed(feed.source, response.url || feed.url)) {
        return {
          ...feed,
          ok: false,
          statusCode: response.status,
          contentType,
          error: 'HTML_RETURNED',
          totalParsed: 0,
          recent24h: 0,
          sampleTitles: [],
          recentLinkIds: [],
        };
      }
      parsed = parseHtmlCollectionWithStats(body, itemLimit, response.url || feed.url);
    } else {
      parsed = (
        feed.method === 'sitemap' || /<sitemapindex[\s>]|<(?:[\w.-]+:)?urlset[\s>]/i.test(body)
      )
        ? await parseXmlRecursively(feed.url, body, itemLimit, timeoutMs, attempts)
        : parseRssOrAtomWithStats(body, itemLimit);
    }
    const parsedItems = await enrichItemsWithPublishedAt(feed, parsed.items, timeoutMs);
    const nowMs = Date.now();
    const cutoffMs = nowMs - 24 * 60 * 60 * 1000;
    const recentItems = parsedItems
      .map((item) => ({
        ...item,
        readableTitle: normalizeReadableArticleTitle(item.title || '', item.link || '', feed.source),
      }))
      .filter((item) => {
        if (!item.link || isKnownNonArticleUrl(feed.source, item.link || '')) return false;
        const iso = toIso(item.publishedAt);
        if (!iso) return false;
        const publishedAtMs = new Date(iso).getTime();
        const maxFuturePublishedAtMs = maxFuturePublishedAtMsForUrl(item.link || feed.url);
        if (publishedAtMs < cutoffMs) return false;
        if (publishedAtMs > nowMs + maxFuturePublishedAtMs) return false;
        return Boolean(item.readableTitle);
      });
    const recentLinkIds = recentItems
      .map((item) => deriveUrlArticleStableId(item.link) || normalizeLinkForId(item.link))
      .filter(Boolean);
    const newestItemAt = recentItems
      .map((item) => toIso(item.publishedAt))
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => b.localeCompare(a))[0];

    return {
      ...feed,
      ok: parsedItems.length > 0,
      statusCode: response.status,
      contentType,
      error: parsedItems.length > 0 ? undefined : 'PARSE_EMPTY',
      totalParsed: parsedItems.length,
      recent24h: recentItems.length,
      newestItemAt,
      sampleTitles: recentItems.slice(0, 3).map((item) => item.readableTitle || item.title),
      recentLinkIds,
    };
  } catch (error) {
    return {
      ...feed,
      ok: false,
      error: error instanceof Error ? error.message : 'FETCH_ERROR',
      totalParsed: 0,
      recent24h: 0,
      sampleTitles: [],
      recentLinkIds: [],
    };
  }
}

function summarizeByCountry(countries: string[], results: FeedInspection[], currentFeeds: FeedInput[], candidateFeeds: FeedInput[]): CountrySummary[] {
  return countries.map((country) => {
    const countryResults = results.filter((result) => normalizeCountry(result.country) === normalizeCountry(country));
    const currentResults = countryResults.filter((result) => result.kind === 'current');
    const candidateResults = countryResults.filter((result) => result.kind === 'candidate');
    const currentUnique24h = new Set(currentResults.flatMap((row) => row.recentLinkIds)).size;
    const candidateUnique24h = new Set(candidateResults.flatMap((row) => row.recentLinkIds)).size;

    return {
      country,
      currentFeeds: currentFeeds.filter((feed) => normalizeCountry(feed.country) === normalizeCountry(country)).length,
      candidateFeeds: candidateFeeds.filter((feed) => normalizeCountry(feed.country) === normalizeCountry(country)).length,
      currentOk: currentResults.filter((row) => row.ok).length,
      candidateOk: candidateResults.filter((row) => row.ok).length,
      currentRecent24h: currentResults.reduce((sum, row) => sum + row.recent24h, 0),
      currentUnique24h,
      candidateRecent24h: candidateResults.reduce((sum, row) => sum + row.recent24h, 0),
      candidateUnique24h,
      candidateNewRecent24h: candidateResults.filter((row) => row.recent24h > 0).reduce((sum, row) => sum + row.recent24h, 0),
      topCandidates: candidateResults
        .filter((row) => row.ok && row.recent24h > 0)
        .sort((a, b) => b.recent24h - a.recent24h || a.source.localeCompare(b.source))
        .slice(0, 10),
    };
  });
}

async function main(): Promise<void> {
  const atlasPath = parseStringArg('--atlas=', DEFAULT_ATLAS_PATH);
  const outputPath = parseStringArg('--write-json=', DEFAULT_OUTPUT_PATH);
  const countries = parseCsvArg('--country=');
  if (countries.length === 0) {
    throw new Error('At least one --country=Country Name argument is required');
  }

  const itemLimit = parseIntArg('--item-limit=', DEFAULT_ITEM_LIMIT);
  const timeoutMs = parseIntArg('--timeout-ms=', DEFAULT_TIMEOUT_MS);
  const attempts = parseIntArg('--attempts=', DEFAULT_ATTEMPTS);
  const concurrency = parseIntArg('--concurrency=', DEFAULT_CONCURRENCY);

  const atlas = loadAtlas(atlasPath);
  const currentFeeds = loadCurrentFeeds(atlas, countries);
  const candidateFeeds = loadCandidateFeeds(parseCandidateSpecs());
  const feeds = dedupeFeeds([...currentFeeds, ...candidateFeeds], currentFeeds);

  const results = await runWithConcurrency(feeds, concurrency, (feed) => inspectFeed(feed, itemLimit, timeoutMs, attempts));
  results.sort((a, b) => a.country.localeCompare(b.country) || a.kind.localeCompare(b.kind) || b.recent24h - a.recent24h || a.source.localeCompare(b.source));

  const report: CoverageReport = {
    generatedAt: new Date().toISOString(),
    countries: summarizeByCountry(countries, results, currentFeeds, candidateFeeds),
    results: results.map(({ recentLinkIds: _recentLinkIds, ...row }) => row),
  };

  writeFileSync(outputPath, JSON.stringify(report, null, 2));

  for (const summary of report.countries) {
    console.log(
      `${summary.country}: current=${summary.currentRecent24h} raw / ${summary.currentUnique24h} unique ` +
      `(${summary.currentOk}/${summary.currentFeeds} ok) candidate=${summary.candidateRecent24h} raw / ` +
      `${summary.candidateUnique24h} unique (${summary.candidateOk}/${summary.candidateFeeds} ok)`
    );
    for (const row of summary.topCandidates.slice(0, 5)) {
      console.log(`  + ${row.source}: ${row.recent24h} in 24h (${row.url})`);
    }
  }

  console.log(`wrote ${outputPath}`);
}

await main();
