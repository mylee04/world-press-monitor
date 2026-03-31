#!/usr/bin/env bun
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fetchWithRetry } from '@/lib/fetch-utils';
import { normalizeReadableArticleTitle } from '@/lib/html-entities';
import { parseRssOrAtomWithStats } from '@/lib/parsers';
import { runWithConcurrency } from '@/lib/concurrency';
import { normalizeLinkForId } from '@/lib/pipeline';

type AtlasFeed = {
  row?: number;
  name: string;
  url: string | null;
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

const FEED_FETCH_HEADERS = {
  'User-Agent':
    process.env.INGEST_USER_AGENT ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  Accept: 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*',
  'Accept-Language': process.env.INGEST_ACCEPT_LANGUAGE || 'en-US,en;q=0.9,es;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
};

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
    return (country.feeds || [])
      .filter((feed) => feed.enabled !== false && typeof feed.url === 'string' && feed.url.trim().length > 0)
      .map((feed) => ({
        country: country.name,
        source: feed.name,
        url: feed.url!.trim(),
        kind: 'current' as const,
      }));
  });
}

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function normalizeCandidateRows(country: string, filePath: string, payload: unknown): FeedInput[] {
  if (Array.isArray(payload)) {
    return payload
      .map((row) => row as CandidateRow)
      .filter((row) => typeof (row.rss || row.url) === 'string')
      .map((row) => ({
        country,
        source: (row.source || row.name || 'Unknown source').trim(),
        url: String(row.rss || row.url).trim(),
        kind: 'candidate' as const,
        fromFile: basename(filePath),
      }));
  }

  const atlasLike = payload as Atlas | undefined;
  const matchedCountry = atlasLike?.countries?.find((entry) => normalizeCountry(entry.name) === normalizeCountry(country));
  if (!matchedCountry) return [];

  return (matchedCountry.feeds || [])
    .filter((feed) => typeof feed.url === 'string' && feed.url.trim().length > 0)
    .map((feed) => ({
      country: matchedCountry.name,
      source: feed.name.trim(),
      url: feed.url!.trim(),
      kind: 'candidate' as const,
      fromFile: basename(filePath),
    }));
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

function toIso(value: string): string | null {
  if (!value) return null;
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return null;
  return new Date(ts).toISOString();
}

async function inspectFeed(feed: FeedInput, itemLimit: number, timeoutMs: number, attempts: number): Promise<FeedInspection> {
  try {
    const response = await fetchWithRetry(feed.url, {
      timeoutMs,
      attempts,
      fetchOptions: {
        redirect: 'follow',
        headers: FEED_FETCH_HEADERS,
      }
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
        recentLinkIds: [],
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
        recentLinkIds: [],
      };
    }

    const parsed = parseRssOrAtomWithStats(body, itemLimit);
    const nowMs = Date.now();
    const cutoffMs = nowMs - 24 * 60 * 60 * 1000;
    const recentItems = parsed.items
      .map((item) => ({
        ...item,
        readableTitle: normalizeReadableArticleTitle(item.title || '', item.link || '', feed.source),
      }))
      .filter((item) => {
        const iso = toIso(item.publishedAt);
        if (!iso) return false;
        if (new Date(iso).getTime() < cutoffMs) return false;
        return Boolean(item.readableTitle);
      });
    const recentLinkIds = recentItems
      .map((item) => normalizeLinkForId(item.link))
      .filter(Boolean);
    const newestItemAt = parsed.items
      .map((item) => toIso(item.publishedAt))
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => b.localeCompare(a))[0];

    return {
      ...feed,
      ok: parsed.items.length > 0,
      statusCode: response.status,
      contentType,
      error: parsed.items.length > 0 ? undefined : 'PARSE_EMPTY',
      totalParsed: parsed.items.length,
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
