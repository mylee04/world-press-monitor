#!/usr/bin/env bun

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { isKnownNonArticleUrl } from '@/lib/article-url-filters';
import { extractSourceCategoriesFromArticlePage } from '@/lib/article-page-section';
import { normalizeSourceCategories } from '@/lib/article-taxonomy';
import { runWithConcurrency } from '@/lib/concurrency';
import { resolveDatabaseUrl } from '@/lib/database-url';
import { fetchWithRetry, readResponseText } from '@/lib/fetch-utils';
import {
  backfillNewsArticleFeedCategories,
  type NewsArticleFeedCategoryBackfill,
} from '@/lib/ingestion-store';
import { parseRssOrAtomWithStats } from '@/lib/parsers';
import { buildFeedStableId, normalizeLinkForId } from '@/lib/pipeline';

type CliArgs = {
  apply: boolean;
  days: number;
  limit: number | null;
  concurrency: number;
  pageMeta: boolean;
  pageConcurrency: number;
  pageLimitPerSource: number | null;
  pageTopSources: number | null;
  pageTimeoutMs: number;
  pageAttempts: number;
  sources: string[];
  countries: string[];
};

type AtlasFeed = {
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

type AtlasRssOutlet = {
  source: string;
  rssUrl: string;
  country: string;
};

type CandidateRow = {
  external_id: string;
  stable_id: string | null;
  source: string;
  url: string;
  title_original: string | null;
};

type SourceCandidateState = {
  byLink: Map<string, string[]>;
  byStableId: Map<string, string[]>;
  candidateCount: number;
};

type SourceScanResult = {
  source: string;
  feedsTried: number;
  parsedItems: number;
  categorizedItems: number;
  matchedArticles: number;
  updates: NewsArticleFeedCategoryBackfill[];
};

type PageScanResult = {
  source: string;
  candidates: number;
  fetchedPages: number;
  categorizedPages: number;
  matchedArticles: number;
  updates: NewsArticleFeedCategoryBackfill[];
};

const ATLAS_PATH = process.env.ATLAS_PATH || resolve(process.cwd(), 'data/rss-atlas.json');
const DEFAULT_DAYS = 7;
const DEFAULT_CONCURRENCY = 8;
const DEFAULT_PAGE_CONCURRENCY = 6;
const DEFAULT_PAGE_TIMEOUT_MS = 12_000;
const DEFAULT_PAGE_ATTEMPTS = 2;
const FEED_ITEM_LIMIT = 2500;
const FETCH_TIMEOUT_MS = 15_000;
const FEED_FETCH_HEADERS = {
  'User-Agent':
    process.env.INGEST_USER_AGENT
    || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  Accept: 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*',
  'Accept-Language': process.env.INGEST_ACCEPT_LANGUAGE || 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

function parseArgs(argv: string[]): CliArgs {
  return {
    apply: argv.includes('--apply'),
    days: parseNumberArg(argv, '--days=', DEFAULT_DAYS, 1, 30),
    limit: parseOptionalNumberArg(argv, '--limit=', 1),
    concurrency: parseNumberArg(argv, '--concurrency=', DEFAULT_CONCURRENCY, 1, 48),
    pageMeta: argv.includes('--page-meta'),
    pageConcurrency: parseNumberArg(argv, '--page-concurrency=', DEFAULT_PAGE_CONCURRENCY, 1, 24),
    pageLimitPerSource: parseOptionalNumberArg(argv, '--page-limit-per-source=', 1),
    pageTopSources: parseOptionalNumberArg(argv, '--page-top-sources=', 1),
    pageTimeoutMs: parseNumberArg(argv, '--page-timeout-ms=', DEFAULT_PAGE_TIMEOUT_MS, 1000, 60000),
    pageAttempts: parseNumberArg(argv, '--page-attempts=', DEFAULT_PAGE_ATTEMPTS, 1, 5),
    sources: parseListArg(argv, '--sources='),
    countries: parseListArg(argv, '--countries=').map(normalizeKey),
  };
}

function parseNumberArg(argv: string[], prefix: string, fallback: number, min: number, max: number): number {
  const raw = argv.find((item) => item.startsWith(prefix));
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw.slice(prefix.length), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseOptionalNumberArg(argv: string[], prefix: string, min: number): number | null {
  const raw = argv.find((item) => item.startsWith(prefix));
  if (!raw) return null;
  const parsed = Number.parseInt(raw.slice(prefix.length), 10);
  if (!Number.isFinite(parsed) || parsed < min) return null;
  return parsed;
}

function parseListArg(argv: string[], prefix: string): string[] {
  const raw = argv.find((item) => item.startsWith(prefix));
  if (!raw) return [];
  return [...new Set(raw.slice(prefix.length).split(',').map((item) => item.trim()).filter(Boolean))];
}

function normalizeKey(value: string): string {
  return (value || '').trim().toLowerCase();
}

function loadAtlasRssOutlets(args: CliArgs): AtlasRssOutlet[] {
  const raw = readFileSync(ATLAS_PATH, 'utf8');
  const atlas = JSON.parse(raw) as Atlas;
  if (!Array.isArray(atlas.countries)) {
    throw new Error(`Invalid atlas format in ${ATLAS_PATH}`);
  }

  const requestedSources = new Set(args.sources.map(normalizeKey));
  const requestedCountries = new Set(args.countries.map(normalizeKey));
  const deduped = new Map<string, AtlasRssOutlet>();

  for (const country of atlas.countries) {
    const countryName = (country.name || country.code || 'Global').trim() || 'Global';
    const countryKeys = new Set([normalizeKey(countryName), normalizeKey(country.code || '')].filter(Boolean));
    if (requestedCountries.size > 0 && ![...countryKeys].some((key) => requestedCountries.has(key))) {
      continue;
    }

    for (const feed of Array.isArray(country.feeds) ? country.feeds : []) {
      if (feed.enabled === false) continue;
      const source = (feed.name || '').trim();
      const rssUrl =
        (typeof feed.url === 'string' ? feed.url.trim() : '')
        || (typeof feed.sitemapUrl === 'string' ? feed.sitemapUrl.trim() : '');
      if (!source || !rssUrl) continue;
      if (requestedSources.size > 0 && !requestedSources.has(normalizeKey(source))) continue;
      const key = `${source}\n${rssUrl}`;
      deduped.set(key, { source, rssUrl, country: countryName });
    }
  }

  return [...deduped.values()].sort((a, b) => a.source.localeCompare(b.source) || a.rssUrl.localeCompare(b.rssUrl));
}

async function loadCandidates(client: Client, args: CliArgs, sourceNames: string[]): Promise<CandidateRow[]> {
  if (!sourceNames.length) return [];

  const params: unknown[] = [args.days, sourceNames];
  let limitSql = '';
  if (args.limit) {
    params.push(args.limit);
    limitSql = `limit $${params.length}`;
  }

  const result = await client.query<CandidateRow>(
    `
    select
      external_id,
      stable_id,
      source,
      url,
      title_original
    from news_articles
    where source = any($2::text[])
      and coalesce(cardinality(feed_categories), 0) = 0
      and (
        publication_datetime >= now() - ($1::int * interval '1 day')
        or created_at >= now() - ($1::int * interval '1 day')
      )
    order by publication_datetime desc, created_at desc
    ${limitSql}
    `,
    params
  );

  return result.rows;
}

function buildCandidateState(rows: CandidateRow[]): SourceCandidateState {
  const byLink = new Map<string, string[]>();
  const byStableId = new Map<string, string[]>();

  for (const row of rows) {
    const linkKey = normalizeLinkForId(row.url || '');
    if (linkKey) pushMapValue(byLink, linkKey, row.external_id);

    const stableKey = (row.stable_id || '').trim();
    if (stableKey) pushMapValue(byStableId, stableKey, row.external_id);
  }

  return {
    byLink,
    byStableId,
    candidateCount: rows.length,
  };
}

function pushMapValue(target: Map<string, string[]>, key: string, value: string): void {
  const current = target.get(key) || [];
  if (!current.includes(value)) {
    current.push(value);
    target.set(key, current);
  }
}

async function fetchFeedItems(url: string) {
  const response = await fetchWithRetry(url, {
    timeoutMs: FETCH_TIMEOUT_MS,
    attempts: 2,
    fetchOptions: {
      headers: FEED_FETCH_HEADERS,
      redirect: 'follow',
    },
  });
  if (!response.ok) return null;
  const decoded = await readResponseText(response, url);
  return parseRssOrAtomWithStats(decoded.text, FEED_ITEM_LIMIT);
}

async function fetchArticleHtml(url: string, args: Pick<CliArgs, 'pageTimeoutMs' | 'pageAttempts'>): Promise<string | null> {
  try {
    const response = await fetchWithRetry(url, {
      timeoutMs: args.pageTimeoutMs,
      attempts: args.pageAttempts,
      fetchOptions: {
        headers: {
          'User-Agent': FEED_FETCH_HEADERS['User-Agent'],
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': FEED_FETCH_HEADERS['Accept-Language'],
          'Accept-Encoding': FEED_FETCH_HEADERS['Accept-Encoding'],
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
        redirect: 'follow',
      },
    });
    if (!response.ok) return null;
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType && !contentType.includes('html') && !contentType.includes('xml')) return null;
    return (await readResponseText(response, response.url || url)).text;
  } catch {
    return null;
  }
}

async function scanSourceFeeds(source: string, outlets: AtlasRssOutlet[], state: SourceCandidateState): Promise<SourceScanResult> {
  const updatesByExternalId = new Map<string, string[]>();
  let parsedItems = 0;
  let categorizedItems = 0;

  for (const outlet of outlets) {
    let parsed;
    try {
      parsed = await fetchFeedItems(outlet.rssUrl);
    } catch {
      continue;
    }
    if (!parsed) continue;
    parsedItems += parsed.items.length;

    for (const item of parsed.items) {
      const sourceCategories = normalizeSourceCategories(item.categories);
      if (!sourceCategories.length) continue;
      categorizedItems += 1;

      const linkKey = normalizeLinkForId(item.link || '');
      const stableKey = buildFeedStableId(item.stableId || '', item.link || '');
      const matchingExternalIds = new Set<string>([
        ...(linkKey ? state.byLink.get(linkKey) || [] : []),
        ...(stableKey ? state.byStableId.get(stableKey) || [] : []),
      ]);
      if (!matchingExternalIds.size) continue;

      for (const externalId of matchingExternalIds) {
        const current = updatesByExternalId.get(externalId) || [];
        updatesByExternalId.set(externalId, normalizeSourceCategories([...current, ...sourceCategories]));
      }
    }
  }

  return {
    source,
    feedsTried: outlets.length,
    parsedItems,
    categorizedItems,
    matchedArticles: updatesByExternalId.size,
    updates: [...updatesByExternalId.entries()].map(([externalId, sourceCategories]) => ({
      externalId,
      sourceCategories,
    })),
  };
}

function formatTopSources(results: SourceScanResult[]): string[] {
  return results
    .filter((result) => result.matchedArticles > 0)
    .sort((a, b) => b.matchedArticles - a.matchedArticles || a.source.localeCompare(b.source))
    .slice(0, 10)
    .map((result) => `- ${result.source}: matched ${result.matchedArticles}, categorized feed items ${result.categorizedItems}`);
}

function formatTopPageSources(results: PageScanResult[]): string[] {
  return results
    .filter((result) => result.matchedArticles > 0)
    .sort((a, b) => b.matchedArticles - a.matchedArticles || a.source.localeCompare(b.source))
    .slice(0, 12)
    .map(
      (result) =>
        `- ${result.source}: matched ${result.matchedArticles}, categorized pages ${result.categorizedPages}/${result.fetchedPages}`
    );
}

async function scanSourcePages(
  source: string,
  rows: CandidateRow[],
  args: Pick<CliArgs, 'pageTimeoutMs' | 'pageAttempts'>
): Promise<PageScanResult> {
  const fetchableRows = rows.filter((row) => {
    const url = (row.url || '').trim();
    return Boolean(url) && !isKnownNonArticleUrl(source, url);
  });

  const pageScans = await runWithConcurrency(fetchableRows, Math.min(8, fetchableRows.length || 1), async (row) => {
    const url = (row.url || '').trim();
    const html = await fetchArticleHtml(url, args);
    if (!html) {
      return {
        externalId: row.external_id,
        fetched: false,
        sourceCategories: [] as string[],
      };
    }
    const sourceCategories = extractSourceCategoriesFromArticlePage({ source, html });
    return {
      externalId: row.external_id,
      fetched: true,
      sourceCategories,
    };
  });

  const updatesByExternalId = new Map<string, string[]>();
  let fetchedPages = 0;
  let categorizedPages = 0;

  for (const scan of pageScans) {
    if (!scan.fetched) continue;
    fetchedPages += 1;
    if (!scan.sourceCategories.length) continue;
    categorizedPages += 1;
    const current = updatesByExternalId.get(scan.externalId) || [];
    updatesByExternalId.set(scan.externalId, normalizeSourceCategories([...current, ...scan.sourceCategories]));
  }

  return {
    source,
    candidates: rows.length,
    fetchedPages,
    categorizedPages,
    matchedArticles: updatesByExternalId.size,
    updates: [...updatesByExternalId.entries()].map(([externalId, sourceCategories]) => ({
      externalId,
      sourceCategories,
    })),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const atlasOutlets = loadAtlasRssOutlets(args);
  const sourceNames = args.sources.length
    ? [...new Set(args.sources)]
    : [...new Set(atlasOutlets.map((outlet) => outlet.source))];
  if (!sourceNames.length) {
    console.log('[backfill-source-categories] no sources matched the requested filters');
    return;
  }

  const client = new Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();

  try {
    const candidates = await loadCandidates(client, args, sourceNames);
    if (!candidates.length) {
      console.log('[backfill-source-categories] no candidate rows with empty feed_categories');
      return;
    }

    const candidatesBySource = candidates.reduce((acc, row) => {
      const current = acc.get(row.source) || [];
      current.push(row);
      acc.set(row.source, current);
      return acc;
    }, new Map<string, CandidateRow[]>());
    const outletsBySource = atlasOutlets.reduce((acc, outlet) => {
      const current = acc.get(outlet.source) || [];
      current.push(outlet);
      acc.set(outlet.source, current);
      return acc;
    }, new Map<string, AtlasRssOutlet[]>());
    const sourcesToScan = [...candidatesBySource.keys()].filter((source) => (outletsBySource.get(source) || []).length > 0);

    const results = await runWithConcurrency(sourcesToScan, args.concurrency, async (source) => {
      return scanSourceFeeds(source, outletsBySource.get(source) || [], buildCandidateState(candidatesBySource.get(source) || []));
    });

    const feedUpdates = [...results.flatMap((result) => result.updates).reduce((acc, item) => {
      const current = acc.get(item.externalId) || [];
      acc.set(item.externalId, normalizeSourceCategories([...current, ...item.sourceCategories]));
      return acc;
    }, new Map<string, string[]>()).entries()].map(([externalId, sourceCategories]) => ({
      externalId,
      sourceCategories,
    }));

    let pageResults: PageScanResult[] = [];
    let pageUpdates: NewsArticleFeedCategoryBackfill[] = [];

    if (args.pageMeta) {
      const feedUpdatedIds = new Set(feedUpdates.map((item) => item.externalId));
      const unresolvedBySource = [...candidatesBySource.entries()]
        .map(([source, rows]) => {
          const unresolved = rows.filter((row) => !feedUpdatedIds.has(row.external_id));
          const limited = args.pageLimitPerSource ? unresolved.slice(0, args.pageLimitPerSource) : unresolved;
          return [source, limited] as const;
        })
        .filter(([, rows]) => rows.length > 0)
        .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

      const pageSources = (args.pageTopSources ? unresolvedBySource.slice(0, args.pageTopSources) : unresolvedBySource)
        .map(([source, rows]) => ({ source, rows }));

      pageResults = await runWithConcurrency(pageSources, args.pageConcurrency, async (item) =>
        scanSourcePages(item.source, item.rows, args)
      );

      pageUpdates = [...pageResults.flatMap((result) => result.updates).reduce((acc, item) => {
        const current = acc.get(item.externalId) || [];
        acc.set(item.externalId, normalizeSourceCategories([...current, ...item.sourceCategories]));
        return acc;
      }, new Map<string, string[]>()).entries()].map(([externalId, sourceCategories]) => ({
        externalId,
        sourceCategories,
      }));
    }

    const updates = [...[...feedUpdates, ...pageUpdates].reduce((acc, item) => {
      const current = acc.get(item.externalId) || [];
      acc.set(item.externalId, normalizeSourceCategories([...current, ...item.sourceCategories]));
      return acc;
    }, new Map<string, string[]>()).entries()].map(([externalId, sourceCategories]) => ({
      externalId,
      sourceCategories,
    }));

    console.log(
      `[backfill-source-categories] candidates=${candidates.length} sources=${sourcesToScan.length} matched=${updates.length} feedMatched=${feedUpdates.length}${args.pageMeta ? ` pageMatched=${pageUpdates.length}` : ''}`
    );
    for (const line of formatTopSources(results)) {
      console.log(line);
    }
    if (args.pageMeta) {
      for (const line of formatTopPageSources(pageResults)) {
        console.log(line);
      }
    }

    if (!args.apply) {
      console.log('[backfill-source-categories] dry-run complete; re-run with --apply to persist');
      return;
    }

    const persisted = await backfillNewsArticleFeedCategories(updates);
    console.log(
      `[backfill-source-categories] updated=${persisted.updated} storage=${persisted.storage}${persisted.reason ? ` reason=${persisted.reason}` : ''}`
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

void main().catch((error) => {
  console.error('[backfill-source-categories] failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
