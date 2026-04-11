#!/usr/bin/env bun
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { isKnownNonArticleUrl } from '../lib/article-url-filters';
import { runWithConcurrency } from '../lib/concurrency';
import { fetchWithRetry } from '../lib/fetch-utils';
import { normalizeReadableArticleTitle } from '../lib/html-entities';
import { parseRssOrAtomWithStats, parseSitemapWithStats, type ParsedFeedBatch, type ParsedFeedItem } from '../lib/parsers';
import { normalizeLinkForId } from '../lib/pipeline';

type AtlasFeed = {
  name: string;
  url?: string | null;
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
  name?: string;
  rss?: string;
  url?: string;
  sitemapUrl?: string;
  sitemap?: string;
  group?: string;
  network?: string;
};

type FeedInput = {
  country: string;
  source: string;
  url: string;
  kind: 'current' | 'candidate';
  method: 'rss' | 'sitemap';
  group?: string;
  network?: string;
  fromFile?: string;
};

type RecentItem = {
  title: string;
  titleKey: string;
  linkId: string;
  publishedAt: string;
};

type FeedInspection = FeedInput & {
  ok: boolean;
  statusCode?: number;
  contentType?: string;
  error?: string;
  totalParsed: number;
  recent24h: number;
  newestItemAt?: string;
  sampleTitles: string[];
  recentItems: RecentItem[];
};

type CandidateAggregateInternal = {
  source: string;
  group: string;
  network: string;
  methods: Set<'rss' | 'sitemap'>;
  fromFiles: Set<string>;
  titleSet: Set<string>;
  linkSet: Set<string>;
  sampleTitles: string[];
  newestItemAt?: string;
  raw24h: number;
  totalParsed: number;
  currentTitleOverlap24h: number;
  currentLinkOverlap24h: number;
  newTitleSet: Set<string>;
  estimatedLift24h: number;
  duplicatePenalty24h: number;
  recommendedOrder?: number;
};

type CandidatePriority = {
  rank: number;
  source: string;
  group: string;
  network: string;
  methods: ('rss' | 'sitemap')[];
  recent24hRaw: number;
  uniqueTitles24h: number;
  currentTitleOverlap24h: number;
  currentLinkOverlap24h: number;
  newTitlesVsCurrent24h: number;
  estimatedLift24h: number;
  duplicatePenalty24h: number;
  recommendedOrder?: number;
  recommendation: 'add_now' | 'add_with_title_dedupe' | 'monitor';
  newestItemAt?: string;
  sampleTitles: string[];
};

type NetworkSummary = {
  network: string;
  sources: number;
  raw24h: number;
  uniqueTitles24h: number;
  newTitlesVsCurrent24h: number;
  estimatedLift24h: number;
  duplicatePenalty24h: number;
  sourceOrder: string[];
};

type PriorityReport = {
  generatedAt: string;
  current: {
    feedCount: number;
    okFeedCount: number;
    uniqueLinks24h: number;
    uniqueTitles24h: number;
  };
  candidates: CandidatePriority[];
  networks: NetworkSummary[];
  endpoints: Array<Omit<FeedInspection, 'recentItems'>>;
};

const DEFAULT_ATLAS_PATH = resolve(process.cwd(), 'data/rss-atlas.json');
const DEFAULT_TIER1_PATH = resolve(process.cwd(), 'data/canada-tier1-candidates-20260410.json');
const DEFAULT_NETWORK_PATH = resolve(process.cwd(), 'data/canada-network-candidates-20260410.json');
const DEFAULT_JSON_OUTPUT_PATH = resolve(process.cwd(), 'audits/canada-candidate-priority-latest.json');
const DEFAULT_MD_OUTPUT_PATH = resolve(process.cwd(), 'audits/canada-candidate-priority-latest.md');
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_ATTEMPTS = 2;
const DEFAULT_CONCURRENCY = 8;
const DEFAULT_ITEM_LIMIT = 800;
const SITEMAP_INDEX_CHILDREN_LIMIT = 8;
const SITEMAP_INDEX_MAX_DEPTH = 2;

const FEED_FETCH_HEADERS = {
  'User-Agent':
    process.env.INGEST_USER_AGENT ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  Accept: 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*',
  'Accept-Language': process.env.INGEST_ACCEPT_LANGUAGE || 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
};

function parseArgValue(prefix: string): string[] {
  return process.argv
    .slice(2)
    .filter((token) => token.startsWith(prefix))
    .map((token) => token.slice(prefix.length).trim())
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

function normalizeTitleKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function toIso(value: string): string | null {
  if (!value) return null;
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return null;
  return new Date(ts).toISOString();
}

function loadAtlas(filePath: string): Atlas {
  return JSON.parse(readFileSync(filePath, 'utf8')) as Atlas;
}

function loadCurrentFeeds(atlas: Atlas, countryName: string): FeedInput[] {
  const normalizedCountry = normalizeCountry(countryName);
  const country = atlas.countries.find((entry) => normalizeCountry(entry.name) === normalizedCountry);
  if (!country) return [];

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
}

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function loadCandidateFeeds(countryName: string, filePath: string): FeedInput[] {
  const payload = readJson(filePath) as CandidateRow[];
  const fromFile = basename(filePath);
  return payload.flatMap((row) => {
    const source = (row.source || row.name || 'Unknown source').trim();
    const group = (row.group || 'candidate').trim().toLowerCase();
    const network = (row.network || 'independent').trim().toLowerCase();
    const rssUrl = typeof (row.rss || row.url) === 'string' ? String(row.rss || row.url).trim() : '';
    const sitemapUrl = typeof (row.sitemapUrl || row.sitemap) === 'string' ? String(row.sitemapUrl || row.sitemap).trim() : '';
    const inputs: FeedInput[] = [];
    if (rssUrl) {
      inputs.push({
        country: countryName,
        source,
        url: rssUrl,
        kind: 'candidate',
        method: 'rss',
        group,
        network,
        fromFile,
      });
    }
    if (sitemapUrl) {
      inputs.push({
        country: countryName,
        source,
        url: sitemapUrl,
        kind: 'candidate',
        method: 'sitemap',
        group,
        network,
        fromFile,
      });
    }
    return inputs;
  });
}

function dedupeFeeds(feeds: FeedInput[], currentFeeds: FeedInput[]): FeedInput[] {
  const currentUrlSet = new Set(currentFeeds.map((feed) => `${normalizeCountry(feed.country)}|${normalizeUrl(feed.url)}`));
  const seen = new Set<string>();
  const deduped: FeedInput[] = [];

  for (const feed of feeds) {
    const key = `${normalizeCountry(feed.country)}|${normalizeUrl(feed.url)}|${feed.kind}`;
    if (feed.kind === 'candidate' && currentUrlSet.has(`${normalizeCountry(feed.country)}|${normalizeUrl(feed.url)}`)) {
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
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

function parseSitemapIndexLocDateMs(loc: string): number | null {
  const slashPattern = loc.match(/(20\d{2})\/(0[1-9]|1[0-2])\/([0-2]\d|3[01])/);
  if (slashPattern) {
    const ts = Date.parse(`${slashPattern[1]}-${slashPattern[2]}-${slashPattern[3]}T00:00:00Z`);
    return Number.isFinite(ts) ? ts : null;
  }
  const dashPattern = loc.match(/(20\d{2})-(0[1-9]|1[0-2])-([0-2]\d|3[01])/);
  if (dashPattern) {
    const ts = Date.parse(`${dashPattern[1]}-${dashPattern[2]}-${dashPattern[3]}T00:00:00Z`);
    return Number.isFinite(ts) ? ts : null;
  }
  return null;
}

function parseSitemapIndexLocNumericTail(loc: string): number | null {
  const match = loc.match(/(\d+)(?!.*\d)/);
  if (!match) return null;
  const parsed = Number.parseInt(match[1] || '', 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSitemapIndex(xml: string, baseUrl: string): string[] {
  if (!/<sitemapindex[\s>]/i.test(xml)) return [];
  const entries = [...xml.matchAll(/<sitemap>([\s\S]*?)<\/sitemap>/gi)]
    .map((match, index) => {
      const body = match[1] || '';
      const locRaw = body.match(/<loc[^>]*>([\s\S]*?)<\/loc>/i)?.[1]?.trim() || '';
      let loc = '';
      if (locRaw) {
        try {
          loc = new URL(locRaw, baseUrl).toString();
        } catch {
          loc = locRaw;
        }
      }
      const lastmodRaw = body.match(/<lastmod[^>]*>([\s\S]*?)<\/lastmod>/i)?.[1]?.trim() || '';
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

  return entries.slice(0, SITEMAP_INDEX_CHILDREN_LIMIT).map((entry) => entry.loc);
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
      const key = normalizeLinkForId(item.link) || `${item.title}|${item.publishedAt}`;
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
  const sitemap = parseSitemapWithStats(body, itemLimit, url);
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
      const response = await fetchWithRetry(childUrl, {
        timeoutMs,
        attempts,
        fetchOptions: {
          redirect: 'follow',
          headers: FEED_FETCH_HEADERS,
        },
      });
      if (!response.ok) return null;
      const childBody = await response.text();
      if (isLikelyHtmlResponse(response.headers.get('content-type') || '', childBody)) return null;
      return await parseXmlRecursively(childUrl, childBody, itemLimit, timeoutMs, attempts, depth + 1, nextSeen);
    } catch {
      return null;
    }
  });

  return mergeParsedBatches(childResults.filter((result): result is ParsedFeedBatch => Boolean(result)), itemLimit);
}

async function inspectFeed(feed: FeedInput, itemLimit: number, timeoutMs: number, attempts: number): Promise<FeedInspection> {
  try {
    const response = await fetchWithRetry(feed.url, {
      timeoutMs,
      attempts,
      fetchOptions: {
        redirect: 'follow',
        headers: FEED_FETCH_HEADERS,
      },
    });
    const contentType = response.headers.get('content-type') || '';
    const body = await response.text();

    if (!response.ok) {
      return {
        ...feed,
        ok: false,
        statusCode: response.status,
        contentType,
        error: `HTTP_${response.status}`,
        totalParsed: 0,
        recent24h: 0,
        sampleTitles: [],
        recentItems: [],
      };
    }

    if (isLikelyHtmlResponse(contentType, body)) {
      return {
        ...feed,
        ok: false,
        statusCode: response.status,
        contentType,
        error: 'HTML_RETURNED',
        totalParsed: 0,
        recent24h: 0,
        sampleTitles: [],
        recentItems: [],
      };
    }

    const parsed = (
      feed.method === 'sitemap' || /<sitemapindex[\s>]|<(?:[\w.-]+:)?urlset[\s>]/i.test(body)
    )
      ? await parseXmlRecursively(feed.url, body, itemLimit, timeoutMs, attempts)
      : parseRssOrAtomWithStats(body, itemLimit);
    const nowMs = Date.now();
    const cutoffMs = nowMs - 24 * 60 * 60 * 1000;
    const seenRecentItemKeys = new Set<string>();
    const recentItems = parsed.items
      .map((item) => {
        const readableTitle = normalizeReadableArticleTitle(item.title || '', item.link || '', feed.source) || item.title || '';
        const titleKey = normalizeTitleKey(readableTitle);
        const linkId = normalizeLinkForId(item.link || '');
        const publishedAt = toIso(item.publishedAt || '');
        return {
          title: readableTitle,
          titleKey,
          linkId,
          publishedAt,
          link: item.link || '',
        };
      })
      .filter((item) => {
        if (!item.linkId || !item.titleKey || !item.publishedAt) return false;
        if (isKnownNonArticleUrl(feed.source, item.link)) return false;
        if (new Date(item.publishedAt).getTime() < cutoffMs) return false;
        const dedupeKey = `${item.linkId}|${item.titleKey}`;
        if (seenRecentItemKeys.has(dedupeKey)) return false;
        seenRecentItemKeys.add(dedupeKey);
        return true;
      })
      .map((item) => ({
        ...item,
        publishedAt: item.publishedAt as string,
      }))
      .map(({ link, ...item }) => item);

    const newestItemAt = parsed.items
      .map((item) => toIso(item.publishedAt || ''))
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => right.localeCompare(left))[0];

    return {
      ...feed,
      ok: parsed.items.length > 0,
      statusCode: response.status,
      contentType,
      error: parsed.items.length > 0 ? undefined : 'PARSE_EMPTY',
      totalParsed: parsed.items.length,
      recent24h: recentItems.length,
      newestItemAt,
      sampleTitles: recentItems.slice(0, 3).map((item) => item.title),
      recentItems,
    };
  } catch (error) {
    return {
      ...feed,
      ok: false,
      error: error instanceof Error ? error.message : 'FETCH_ERROR',
      totalParsed: 0,
      recent24h: 0,
      sampleTitles: [],
      recentItems: [],
    };
  }
}

function countSetOverlap(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const value of left) {
    if (right.has(value)) count += 1;
  }
  return count;
}

function differenceSet(left: Set<string>, right: Set<string>): Set<string> {
  const result = new Set<string>();
  for (const value of left) {
    if (!right.has(value)) result.add(value);
  }
  return result;
}

function aggregateCandidateResults(
  results: FeedInspection[],
  currentTitleSet: Set<string>,
  currentLinkSet: Set<string>
): CandidateAggregateInternal[] {
  const aggregates = new Map<string, CandidateAggregateInternal>();

  for (const result of results.filter((entry) => entry.kind === 'candidate')) {
    const key = result.source;
    const aggregate = aggregates.get(key) || {
      source: result.source,
      group: result.group || 'candidate',
      network: result.network || 'independent',
      methods: new Set<'rss' | 'sitemap'>(),
      fromFiles: new Set<string>(),
      titleSet: new Set<string>(),
      linkSet: new Set<string>(),
      sampleTitles: [],
      newestItemAt: result.newestItemAt,
      raw24h: 0,
      totalParsed: 0,
      currentTitleOverlap24h: 0,
      currentLinkOverlap24h: 0,
      newTitleSet: new Set<string>(),
      estimatedLift24h: 0,
      duplicatePenalty24h: 0,
    };

    aggregate.methods.add(result.method);
    if (result.fromFile) aggregate.fromFiles.add(result.fromFile);
    aggregate.totalParsed += result.totalParsed;
    aggregate.raw24h += result.recentItems.length;
    if (!aggregate.newestItemAt || (result.newestItemAt && result.newestItemAt > aggregate.newestItemAt)) {
      aggregate.newestItemAt = result.newestItemAt;
    }

    for (const item of result.recentItems) {
      aggregate.titleSet.add(item.titleKey);
      aggregate.linkSet.add(item.linkId);
      if (aggregate.sampleTitles.length < 5 && !aggregate.sampleTitles.includes(item.title)) {
        aggregate.sampleTitles.push(item.title);
      }
    }

    aggregates.set(key, aggregate);
  }

  const rows = [...aggregates.values()];
  for (const row of rows) {
    row.currentTitleOverlap24h = countSetOverlap(row.titleSet, currentTitleSet);
    row.currentLinkOverlap24h = countSetOverlap(row.linkSet, currentLinkSet);
    row.newTitleSet = differenceSet(row.titleSet, currentTitleSet);
    row.estimatedLift24h = row.newTitleSet.size;
  }
  return rows;
}

function applyNetworkGreedyLift(rows: CandidateAggregateInternal[]): NetworkSummary[] {
  const networkGroups = new Map<string, CandidateAggregateInternal[]>();
  const summaries: NetworkSummary[] = [];

  for (const row of rows) {
    if (!row.network || row.network === 'independent') continue;
    const bucket = networkGroups.get(row.network) || [];
    bucket.push(row);
    networkGroups.set(row.network, bucket);
  }

  for (const [network, groupRows] of networkGroups.entries()) {
    if (groupRows.length < 2) continue;

    const remaining = [...groupRows];
    const seenTitles = new Set<string>();
    const sourceOrder: string[] = [];
    let order = 1;

    while (remaining.length > 0) {
      remaining.sort((left, right) => {
        const leftMarginal = differenceSet(left.newTitleSet, seenTitles).size;
        const rightMarginal = differenceSet(right.newTitleSet, seenTitles).size;
        return (
          rightMarginal - leftMarginal ||
          right.newTitleSet.size - left.newTitleSet.size ||
          right.raw24h - left.raw24h ||
          left.source.localeCompare(right.source)
        );
      });

      const selected = remaining.shift();
      if (!selected) break;
      const marginalLift = differenceSet(selected.newTitleSet, seenTitles).size;
      selected.estimatedLift24h = marginalLift;
      selected.duplicatePenalty24h = selected.newTitleSet.size - marginalLift;
      selected.recommendedOrder = order;
      order += 1;
      sourceOrder.push(selected.source);
      for (const title of selected.newTitleSet) {
        seenTitles.add(title);
      }
    }

    const unionTitles = new Set<string>();
    const unionNewTitles = new Set<string>();
    let raw24h = 0;
    for (const row of groupRows) {
      raw24h += row.raw24h;
      for (const title of row.titleSet) unionTitles.add(title);
      for (const title of row.newTitleSet) unionNewTitles.add(title);
    }

    summaries.push({
      network,
      sources: groupRows.length,
      raw24h,
      uniqueTitles24h: unionTitles.size,
      newTitlesVsCurrent24h: unionNewTitles.size,
      estimatedLift24h: [...groupRows].reduce((sum, row) => sum + row.estimatedLift24h, 0),
      duplicatePenalty24h: [...groupRows].reduce((sum, row) => sum + row.duplicatePenalty24h, 0),
      sourceOrder,
    });
  }

  return summaries.sort((left, right) => right.estimatedLift24h - left.estimatedLift24h || left.network.localeCompare(right.network));
}

function toCandidatePriorityRows(rows: CandidateAggregateInternal[]): CandidatePriority[] {
  const ranked = rows
    .map((row) => {
      const recommendation: CandidatePriority['recommendation'] =
        row.group === 'tier1'
          ? 'add_now'
          : row.network === 'village-media' || row.network === 'black-press'
            ? 'add_with_title_dedupe'
            : row.estimatedLift24h >= 3
              ? 'add_now'
              : 'monitor';

      return {
        rank: 0,
        source: row.source,
        group: row.group,
        network: row.network,
        methods: [...row.methods].sort(),
        recent24hRaw: row.raw24h,
        uniqueTitles24h: row.titleSet.size,
        currentTitleOverlap24h: row.currentTitleOverlap24h,
        currentLinkOverlap24h: row.currentLinkOverlap24h,
        newTitlesVsCurrent24h: row.newTitleSet.size,
        estimatedLift24h: row.estimatedLift24h,
        duplicatePenalty24h: row.duplicatePenalty24h,
        recommendedOrder: row.recommendedOrder,
        recommendation,
        newestItemAt: row.newestItemAt,
        sampleTitles: row.sampleTitles.slice(0, 3),
      } satisfies CandidatePriority;
    })
    .sort((left, right) => {
      return (
        right.estimatedLift24h - left.estimatedLift24h ||
        right.newTitlesVsCurrent24h - left.newTitlesVsCurrent24h ||
        right.recent24hRaw - left.recent24hRaw ||
        left.source.localeCompare(right.source)
      );
    });

  return ranked.map((row, index) => ({
    ...row,
    rank: index + 1,
  }));
}

function buildMarkdown(report: PriorityReport): string {
  const lines: string[] = [];
  lines.push('# Canada candidate priority');
  lines.push('');
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push('');
  lines.push(`Current Canada baseline: ${report.current.uniqueTitles24h.toLocaleString()} unique 24h titles across ${report.current.okFeedCount}/${report.current.feedCount} live endpoints.`);
  lines.push('');
  lines.push('## Priority table');
  lines.push('');
  lines.push('| Rank | Source | Group | Network | Raw 24h | New vs current | Est. lift | Dup. penalty | Recommendation |');
  lines.push('| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |');
  for (const row of report.candidates) {
    lines.push(
      `| ${row.rank} | ${row.source} | ${row.group} | ${row.network} | ${row.recent24hRaw} | ${row.newTitlesVsCurrent24h} | ${row.estimatedLift24h} | ${row.duplicatePenalty24h} | ${row.recommendation} |`
    );
  }
  lines.push('');

  if (report.networks.length > 0) {
    lines.push('## Network overlap');
    lines.push('');
    lines.push('| Network | Sources | Raw 24h | Unique titles | New vs current | Est. lift | Dup. penalty | Recommended order |');
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
    for (const network of report.networks) {
      lines.push(
        `| ${network.network} | ${network.sources} | ${network.raw24h} | ${network.uniqueTitles24h} | ${network.newTitlesVsCurrent24h} | ${network.estimatedLift24h} | ${network.duplicatePenalty24h} | ${network.sourceOrder.join(' -> ')} |`
      );
    }
    lines.push('');
  }

  lines.push('## Top samples');
  lines.push('');
  for (const row of report.candidates.slice(0, 10)) {
    lines.push(`### ${row.rank}. ${row.source}`);
    lines.push('');
    lines.push(`- Raw 24h: ${row.recent24hRaw}`);
    lines.push(`- New vs current: ${row.newTitlesVsCurrent24h}`);
    lines.push(`- Estimated lift: ${row.estimatedLift24h}`);
    lines.push(`- Recommendation: ${row.recommendation}`);
    for (const sample of row.sampleTitles) {
      lines.push(`- ${sample}`);
    }
    lines.push('');
  }

  return `${lines.join('\n').trim()}\n`;
}

async function main(): Promise<void> {
  const atlasPath = parseStringArg('--atlas=', DEFAULT_ATLAS_PATH);
  const tier1Path = parseStringArg('--tier1=', DEFAULT_TIER1_PATH);
  const networkPath = parseStringArg('--network=', DEFAULT_NETWORK_PATH);
  const jsonOutputPath = parseStringArg('--write-json=', DEFAULT_JSON_OUTPUT_PATH);
  const mdOutputPath = parseStringArg('--write-md=', DEFAULT_MD_OUTPUT_PATH);
  const countryName = parseStringArg('--country=', 'Canada');
  const itemLimit = parseIntArg('--item-limit=', DEFAULT_ITEM_LIMIT);
  const timeoutMs = parseIntArg('--timeout-ms=', DEFAULT_TIMEOUT_MS);
  const attempts = parseIntArg('--attempts=', DEFAULT_ATTEMPTS);
  const concurrency = parseIntArg('--concurrency=', DEFAULT_CONCURRENCY);

  const atlas = loadAtlas(atlasPath);
  const currentFeeds = loadCurrentFeeds(atlas, countryName);
  const candidateFeeds = dedupeFeeds(
    [...loadCandidateFeeds(countryName, tier1Path), ...loadCandidateFeeds(countryName, networkPath)],
    currentFeeds
  );
  const allFeeds = [...currentFeeds, ...candidateFeeds];
  const results = await runWithConcurrency(allFeeds, concurrency, (feed) => inspectFeed(feed, itemLimit, timeoutMs, attempts));
  results.sort((left, right) => {
    return (
      left.kind.localeCompare(right.kind) ||
      right.recent24h - left.recent24h ||
      left.source.localeCompare(right.source)
    );
  });

  const currentResults = results.filter((row) => row.kind === 'current');
  const currentTitleSet = new Set<string>();
  const currentLinkSet = new Set<string>();
  for (const row of currentResults) {
    for (const item of row.recentItems) {
      currentTitleSet.add(item.titleKey);
      currentLinkSet.add(item.linkId);
    }
  }

  const candidateAggregates = aggregateCandidateResults(results, currentTitleSet, currentLinkSet);
  const networkSummaries = applyNetworkGreedyLift(candidateAggregates);
  const candidates = toCandidatePriorityRows(candidateAggregates);
  const report: PriorityReport = {
    generatedAt: new Date().toISOString(),
    current: {
      feedCount: currentFeeds.length,
      okFeedCount: currentResults.filter((row) => row.ok).length,
      uniqueLinks24h: currentLinkSet.size,
      uniqueTitles24h: currentTitleSet.size,
    },
    candidates,
    networks: networkSummaries,
    endpoints: results.map(({ recentItems, ...row }) => row),
  };

  writeFileSync(jsonOutputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(mdOutputPath, buildMarkdown(report), 'utf8');

  console.log(`[canada-candidate-priority] wrote ${jsonOutputPath}`);
  console.log(`[canada-candidate-priority] wrote ${mdOutputPath}`);
}

main().catch((error) => {
  console.error(`[canada-candidate-priority] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
