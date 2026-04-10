#!/usr/bin/env bun
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { parseSitemapWithStats } from '@/lib/parsers';

type AtlasFeed = {
  name: string;
  url?: string | null;
  sitemapUrl?: string | null;
  row?: number;
};

type AtlasCountry = {
  name: string;
  feeds: AtlasFeed[];
};

type Atlas = {
  countries: AtlasCountry[];
};

type WatchlistInputRow = {
  source: string;
  country: string;
  created24h: number;
  peakPublished1h7d: number;
  rssMinFetched48h: number;
  rssMedianFetched48h: number;
  riskBand: string;
  rationale: string;
};

type CandidateOrigin = 'atlas_sibling' | 'robots' | 'heuristic';
type SitemapRootKind = 'urlset' | 'sitemapindex' | 'other' | 'fetch_failed';
type RecommendedAction =
  | 'PROMOTE_SITEMAP'
  | 'REVIEW_EXISTING_SIBLING_SITEMAP'
  | 'MANUAL_SECTION_FEEDS_OR_FAST_LANE'
  | 'SOURCE_NOT_FOUND';

type CandidateRejectionReason =
  | 'SHALLOW_CANDIDATE'
  | 'IMAGE_SITEMAP'
  | 'STALE_ARCHIVE_SITEMAP'
  | 'AMBIGUOUS_NON_SITEMAP';

type CandidateProbe = {
  candidateUrl: string;
  origin: CandidateOrigin;
  ok: boolean;
  status: number | null;
  reason: string;
  attempts: number;
  finalSitemapUrl: string | null;
  rootKind: SitemapRootKind;
  approxUrlCount: number;
};

type FeedAnalysisResult = {
  source: string;
  country: string;
  currentRssUrl: string | null;
  currentRssHost: string | null;
  created24h: number;
  peakPublished1h7d: number;
  rssMinFetched48h: number;
  rssMedianFetched48h: number;
  riskBand: string;
  siblingSitemapFeeds: string[];
  siblingSitemapUrls: string[];
  candidatesTried: number;
  validCandidateCount: number;
  bestCandidate: CandidateProbe | null;
  recommendedAction: RecommendedAction;
  note: string;
  probes: CandidateProbe[];
};

type CliOptions = {
  atlasPath: string;
  inputCsvPath: string;
  outputJsonPath: string;
  outputCsvPath: string;
  outputMdPath: string;
  concurrency: number;
  timeoutMs: number;
  maxRedirects: number;
  maxCandidatesPerFeed: number;
  limit: number | null;
};

const XML_MARKERS = ['<rss', '<feed', '<urlset', '<sitemapindex', '<?xml'];
const MIN_DEEP_SITEMAP_URLS = 20;
const USER_AGENT =
  process.env.INGEST_USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

function parseArgValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

function clampInt(raw: string | undefined, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(raw || '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseOptions(): CliOptions {
  return {
    atlasPath: process.env.ATLAS_PATH || resolve(process.cwd(), 'data/rss-atlas.json'),
    inputCsvPath: resolve(
      process.cwd(),
      parseArgValue('input-csv') || 'audits/ingest_head_rss_strict_risk_watchlist_latest.csv'
    ),
    outputJsonPath: resolve(
      process.cwd(),
      parseArgValue('output-json') || 'audits/ingest_head_sitemap_candidates_latest.json'
    ),
    outputCsvPath: resolve(
      process.cwd(),
      parseArgValue('output-csv') || 'audits/ingest_head_sitemap_candidates_latest.csv'
    ),
    outputMdPath: resolve(
      process.cwd(),
      parseArgValue('output-md') || 'audits/ingest_head_sitemap_candidates_latest.md'
    ),
    concurrency: clampInt(parseArgValue('concurrency'), 1, 12, 4),
    timeoutMs: clampInt(parseArgValue('timeout-ms'), 2000, 30000, 8000),
    maxRedirects: clampInt(parseArgValue('max-redirects'), 1, 20, 8),
    maxCandidatesPerFeed: clampInt(parseArgValue('max-candidates'), 1, 30, 12),
    limit: parseArgValue('limit') ? clampInt(parseArgValue('limit'), 1, 1000, 20) : null,
  };
}

function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, '');
}

function makeKey(source: string, country: string): string {
  return `${source}|||${country}`;
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(normalized);
  }
  return deduped;
}

function dedupeCandidates(values: Array<{ url: string; origin: CandidateOrigin }>): Array<{ url: string; origin: CandidateOrigin }> {
  const seen = new Set<string>();
  const deduped: Array<{ url: string; origin: CandidateOrigin }> = [];
  for (const value of values) {
    const normalized = value.url.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push({ url: normalized, origin: value.origin });
  }
  return deduped;
}

function countMatches(value: string, pattern: RegExp): number {
  return [...value.matchAll(pattern)].length;
}

function scoreSitemapCandidate(url: string): number {
  const lower = url.toLowerCase();
  if (!lower.includes('sitemap')) return 0;
  let score = 20;
  if (lower.includes('news')) score += 100;
  if (lower.includes('today')) score += 40;
  if (lower.includes('breaking')) score += 30;
  if (lower.includes('sitemap-news')) score += 60;
  if (lower.includes('sitemap_news')) score += 60;
  if (lower.includes('news-sitemap')) score += 60;
  if (lower.includes('sitemap_index')) score += 20;
  if (lower.includes('sitemapindex')) score += 10;
  if (lower.includes('image') || lower.includes('photo')) score -= 20;
  return score;
}

function prioritizeCandidateList(
  values: Array<{ url: string; origin: CandidateOrigin }>
): Array<{ url: string; origin: CandidateOrigin }> {
  const originWeight = (origin: CandidateOrigin): number => {
    if (origin === 'atlas_sibling') return 1000;
    if (origin === 'robots') return 500;
    return 0;
  };

  return dedupeCandidates(values).sort((a, b) => {
    const byOrigin = originWeight(b.origin) - originWeight(a.origin);
    if (byOrigin !== 0) return byOrigin;
    return scoreSitemapCandidate(b.url) - scoreSitemapCandidate(a.url);
  });
}

function monthsSince(year: number, month: number, now = new Date()): number {
  return (now.getUTCFullYear() - year) * 12 + (now.getUTCMonth() + 1 - month);
}

function classifyCandidateRejection(
  row: WatchlistInputRow,
  probe: CandidateProbe
): CandidateRejectionReason | null {
  if (!probe.ok) return null;

  const finalUrl = (probe.finalSitemapUrl || probe.candidateUrl || '').toLowerCase();
  if (finalUrl.includes('/image') || finalUrl.includes('images/') || finalUrl.includes('photo')) {
    return 'IMAGE_SITEMAP';
  }

  if (finalUrl.includes('archive')) {
    const archiveMatch = finalUrl.match(/\/(20\d{2})\/(0[1-9]|1[0-2])(?:\/|[-_.])/);
    if (archiveMatch) {
      const year = Number.parseInt(archiveMatch[1], 10);
      const month = Number.parseInt(archiveMatch[2], 10);
      if (monthsSince(year, month) > 1) {
        return 'STALE_ARCHIVE_SITEMAP';
      }
    }
  }

  const minimumUsefulDepth = Math.max(MIN_DEEP_SITEMAP_URLS, row.rssMedianFetched48h);
  if (probe.rootKind !== 'urlset' && probe.approxUrlCount < minimumUsefulDepth) {
    return 'AMBIGUOUS_NON_SITEMAP';
  }

  if (probe.approxUrlCount < minimumUsefulDepth) {
    return 'SHALLOW_CANDIDATE';
  }

  return null;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  values.push(current);
  return values;
}

function loadWatchlistRows(path: string, limit: number | null): WatchlistInputRow[] {
  const raw = readFileSync(path, 'utf8').trim();
  const lines = raw ? raw.split(/\r?\n/) : [];
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]);
  const rows: WatchlistInputRow[] = [];

  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(header.map((key, index) => [key, values[index] || ''])) as Record<string, string>;
    rows.push({
      source: row.source,
      country: row.country,
      created24h: Number(row.created24h || 0) || 0,
      peakPublished1h7d: Number(row.peak_published_1h_7d || 0) || 0,
      rssMinFetched48h: Number(row.rss_min_fetched_48h || 0) || 0,
      rssMedianFetched48h: Number(row.rss_median_fetched_48h || 0) || 0,
      riskBand: row.risk_band || '',
      rationale: row.rationale || '',
    });
  }

  return limit ? rows.slice(0, limit) : rows;
}

function loadAtlas(path: string): Atlas {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Atlas;
  if (!Array.isArray(parsed.countries)) {
    throw new Error(`Invalid atlas format in ${path}`);
  }
  return parsed;
}

function findAtlasFeed(atlas: Atlas, source: string, country: string): { feed: AtlasFeed; country: AtlasCountry } | null {
  for (const atlasCountry of atlas.countries) {
    if (atlasCountry.name !== country) continue;
    for (const feed of atlasCountry.feeds || []) {
      if (feed.name === source) {
        return { feed, country: atlasCountry };
      }
    }
  }
  return null;
}

function findSiblingSitemaps(
  atlasCountry: AtlasCountry,
  currentSource: string,
  currentRssHost: string | null
): Array<{ source: string; sitemapUrl: string }> {
  if (!currentRssHost) return [];
  const matches: Array<{ source: string; sitemapUrl: string }> = [];
  for (const feed of atlasCountry.feeds || []) {
    if (feed.name === currentSource) continue;
    const sitemapUrl = (feed.sitemapUrl || '').trim();
    if (!sitemapUrl) continue;
    try {
      const sitemapHost = normalizeHost(new URL(sitemapUrl).hostname);
      if (sitemapHost === currentRssHost) {
        matches.push({ source: feed.name, sitemapUrl });
      }
    } catch {
      continue;
    }
  }
  return matches;
}

function buildHeuristicSitemapUrls(sourceUrl: string): string[] {
  const urls: string[] = [];
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
    return dedupeStrings(urls);
  }
  return dedupeStrings(urls);
}

function normalizeSitemapXmlText(xmlText: string): string {
  return xmlText
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<\!DOCTYPE[\s\S]*?>/i, '')
    .trim();
}

function extractSitemapLocs(xmlText: string, baseUrl?: string): string[] {
  const urls: string[] = [];
  const normalized = normalizeSitemapXmlText(xmlText);
  if (!normalized) return urls;

  for (const match of normalized.matchAll(/<loc>(.*?)<\/loc>/gi)) {
    const raw = match?.[1]?.trim();
    if (!raw) continue;
    urls.push(raw);
  }

  if (!baseUrl) return urls;
  try {
    const base = new URL(baseUrl);
    return urls.flatMap((raw) => {
      try {
        return [new URL(raw, base).toString()];
      } catch {
        return [];
      }
    });
  } catch {
    return urls;
  }
}

function classifySitemapRoot(xmlText: string): SitemapRootKind {
  const lower = xmlText.toLowerCase();
  if (lower.includes('<sitemapindex')) return 'sitemapindex';
  if (lower.includes('<urlset')) return 'urlset';
  return 'other';
}

function classifyFetchError(error: unknown): string {
  const message = String(error).toLowerCase();
  if (message.includes('redirect') && message.includes('loop')) return 'HTTP_REDIRECT_LOOP';
  if (message.includes('too many redirects')) return 'HTTP_REDIRECT_LOOP';
  if (message.includes('dns') || message.includes('could not resolve host') || message.includes('getaddrinfo')) return 'DNS';
  if (message.includes('abort') || message.includes('timeout')) return 'TIMEOUT';
  if (message.includes('certificate') || message.includes('ssl') || message.includes('tls')) return 'TLS';
  if (message.includes('connection refused')) return 'CONNECTION_REFUSED';
  if (message.includes('econnreset') || message.includes('socket hang up')) return 'CONNECTION_RESET';
  return 'NETWORK';
}

function classifyHttpBodyFailure(bodyStart: string, contentType: string): string {
  if (contentType.includes('json')) return 'INVALID_JSON';
  if (XML_MARKERS.some((marker) => bodyStart.includes(marker))) return 'INVALID_FEED_FORMAT';
  if (contentType.includes('text/html')) return 'HTML_RETURNED';
  if (bodyStart.startsWith('<!doctype html')) return 'HTML_RETURNED';
  return 'INVALID_FEED_FORMAT';
}

function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*',
      'Accept-Language': process.env.INGEST_ACCEPT_LANGUAGE || 'en-US,en;q=0.9,es;q=0.8',
      Connection: 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    },
    redirect: 'manual',
    signal: controller.signal,
  }).finally(() => {
    clearTimeout(timeout);
  });
}

async function fetchWithRedirects(initialUrl: string, timeoutMs: number, maxRedirects: number): Promise<Response> {
  let currentUrl = initialUrl;
  let redirectCount = 0;
  const visited = new Set<string>();
  const startedAt = Date.now();

  while (true) {
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(500, timeoutMs - elapsed);
    const response = await fetchWithTimeout(currentUrl, remaining);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location) {
        await response.arrayBuffer().catch(() => {});
        const nextUrl = new URL(location, currentUrl).toString();
        redirectCount += 1;
        if (redirectCount > maxRedirects) {
          throw new Error(`Too many redirects: ${maxRedirects}`);
        }
        if (visited.has(nextUrl)) {
          throw new Error(`Redirect loop detected: ${nextUrl}`);
        }
        visited.add(currentUrl);
        currentUrl = nextUrl;
        continue;
      }
    }
    return response;
  }
}

async function readBody(url: string, response: Response): Promise<{ bodyText: string; bodyStart: string }> {
  const contentType = response.headers.get('content-type') || '';
  const contentEncoding = response.headers.get('content-encoding') || '';
  const bytes = new Uint8Array(await response.arrayBuffer());
  const isGzip =
    url.toLowerCase().endsWith('.gz')
    || contentType.includes('gzip')
    || contentEncoding.includes('gzip')
    || (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b);

  let bodyText = '';
  try {
    bodyText = isGzip
      ? new TextDecoder().decode(gunzipSync(Buffer.from(bytes)))
      : new TextDecoder().decode(bytes);
  } catch {
    bodyText = new TextDecoder().decode(bytes);
  }

  return {
    bodyText,
    bodyStart: bodyText.slice(0, 4000).toLowerCase(),
  };
}

async function extractSitemapUrlsFromRobots(sourceUrl: string, options: CliOptions): Promise<string[]> {
  try {
    const parsed = new URL(sourceUrl);
    const robotsUrl = `${parsed.origin}/robots.txt`;
    const response = await fetchWithRedirects(robotsUrl, options.timeoutMs, options.maxRedirects);
    if (!response.ok) return [];
    const robotsText = await response.text();
    const urls: string[] = [];
    for (const line of robotsText.split(/\r?\n/)) {
      const match = /^sitemap:\s*(.+)$/i.exec(line.trim());
      if (!match) continue;
      try {
        urls.push(new URL(match[1].trim(), parsed.origin).toString());
      } catch {
        continue;
      }
    }
    return urls;
  } catch {
    return [];
  }
}

async function checkSitemapCandidate(
  url: string,
  options: CliOptions,
  depth = 0
): Promise<{ ok: boolean; status: number | null; reason: string; attempts: number; finalSitemapUrl: string | null; rootKind: SitemapRootKind; approxUrlCount: number }> {
  try {
    if (depth > 2) {
      return { ok: false, status: null, reason: 'SITEMAP_DEPTH_LIMIT', attempts: 0, finalSitemapUrl: null, rootKind: 'other', approxUrlCount: 0 };
    }

    const response = await fetchWithRedirects(url, options.timeoutMs, options.maxRedirects);
    const { bodyStart, bodyText } = await readBody(url, response);
    const contentType = response.headers.get('content-type') || '';
    const xmlDetected = XML_MARKERS.some((marker) => bodyStart.includes(marker));
    const rootKind = classifySitemapRoot(bodyStart);

    if (rootKind === 'sitemapindex' && depth < 2) {
      const childCandidates = dedupeStrings(extractSitemapLocs(bodyText, url)).slice(0, options.maxCandidatesPerFeed);
      if (childCandidates.length === 0) {
        return {
          ok: false,
          status: response.status,
          reason: 'SITEMAPINDEX_NO_CHILD_URLS',
          attempts: 1,
          finalSitemapUrl: null,
          rootKind,
          approxUrlCount: 0,
        };
      }
      let attempts = 1;
      for (const childUrl of childCandidates) {
        const child = await checkSitemapCandidate(childUrl, options, depth + 1);
        attempts += child.attempts;
        if (child.ok) {
          return {
            ok: true,
            status: child.status,
            reason: child.reason,
            attempts,
            finalSitemapUrl: child.finalSitemapUrl || childUrl,
            rootKind: child.rootKind,
            approxUrlCount: child.approxUrlCount,
          };
        }
      }
      return {
        ok: false,
        status: response.status,
        reason: 'SITEMAPINDEX_NO_VALID_URLSET',
        attempts,
        finalSitemapUrl: null,
        rootKind,
        approxUrlCount: childCandidates.length,
      };
    }

    const looksLikeXml = contentType.includes('xml') || contentType.includes('rss') || contentType.includes('atom');
    const parsed = parseSitemapWithStats(bodyText, 2500, url);
    const approxUrlCount = countMatches(bodyText, /<(?:[\w.-]+:)?url\b/gi);
    const looksLikeUrlset = rootKind === 'urlset' || approxUrlCount > 0;
    if (response.ok && xmlDetected && looksLikeXml && looksLikeUrlset && parsed.stats.totalCandidates > 0) {
      return {
        ok: true,
        status: response.status,
        reason: 'OK',
        attempts: 1,
        finalSitemapUrl: url,
        rootKind: rootKind === 'urlset' ? 'urlset' : 'other',
        approxUrlCount: Math.max(approxUrlCount, parsed.stats.totalCandidates),
      };
    }
    if (response.ok) {
      return {
        ok: false,
        status: response.status,
        reason: classifyHttpBodyFailure(bodyStart, contentType),
        attempts: 1,
        finalSitemapUrl: null,
        rootKind,
        approxUrlCount,
      };
    }
    return {
      ok: false,
      status: response.status,
      reason: `HTTP_${response.status}`,
      attempts: 1,
      finalSitemapUrl: null,
      rootKind,
      approxUrlCount,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      reason: classifyFetchError(error),
      attempts: 0,
      finalSitemapUrl: null,
      rootKind: 'fetch_failed',
      approxUrlCount: 0,
    };
  }
}

async function analyzeFeed(row: WatchlistInputRow, atlas: Atlas, options: CliOptions): Promise<FeedAnalysisResult> {
  const atlasMatch = findAtlasFeed(atlas, row.source, row.country);
  if (!atlasMatch) {
    return {
      source: row.source,
      country: row.country,
      currentRssUrl: null,
      currentRssHost: null,
      created24h: row.created24h,
      peakPublished1h7d: row.peakPublished1h7d,
      rssMinFetched48h: row.rssMinFetched48h,
      rssMedianFetched48h: row.rssMedianFetched48h,
      riskBand: row.riskBand,
      siblingSitemapFeeds: [],
      siblingSitemapUrls: [],
      candidatesTried: 0,
      validCandidateCount: 0,
      bestCandidate: null,
      recommendedAction: 'SOURCE_NOT_FOUND',
      note: 'source_not_found_in_atlas',
      probes: [],
    };
  }

  const currentRssUrl = (atlasMatch.feed.url || '').trim() || null;
  const currentRssHost = currentRssUrl ? normalizeHost(new URL(currentRssUrl).hostname) : null;
  const siblingSitemaps = findSiblingSitemaps(atlasMatch.country, row.source, currentRssHost);

  const candidateSeeds: Array<{ url: string; origin: CandidateOrigin }> = [];
  for (const sibling of siblingSitemaps) {
    candidateSeeds.push({ url: sibling.sitemapUrl, origin: 'atlas_sibling' });
  }
  if (currentRssUrl) {
    for (const url of buildHeuristicSitemapUrls(currentRssUrl)) {
      candidateSeeds.push({ url, origin: 'heuristic' });
    }
    for (const url of await extractSitemapUrlsFromRobots(currentRssUrl, options)) {
      candidateSeeds.push({ url, origin: 'robots' });
    }
  }

  const prioritized = prioritizeCandidateList(candidateSeeds).slice(0, options.maxCandidatesPerFeed);
  const probes: CandidateProbe[] = [];
  let bestCandidate: CandidateProbe | null = null;
  let validCandidateCount = 0;
  let successfulProbeCount = 0;
  const rejectionReasons = new Set<CandidateRejectionReason>();

  for (const candidate of prioritized) {
    const result = await checkSitemapCandidate(candidate.url, options);
    const probe: CandidateProbe = {
      candidateUrl: candidate.url,
      origin: candidate.origin,
      ok: result.ok,
      status: result.status,
      reason: result.reason,
      attempts: result.attempts,
      finalSitemapUrl: result.finalSitemapUrl,
      rootKind: result.rootKind,
      approxUrlCount: result.approxUrlCount,
    };
    probes.push(probe);

    if (probe.ok) {
      successfulProbeCount += 1;
      const rejection = classifyCandidateRejection(row, probe);
      if (!rejection) {
        validCandidateCount += 1;
        if (!bestCandidate) {
          bestCandidate = probe;
        }
      } else {
        rejectionReasons.add(rejection);
      }
    }
  }

  let recommendedAction: RecommendedAction;
  let note: string;
  if (bestCandidate && siblingSitemaps.length > 0) {
    recommendedAction = 'REVIEW_EXISTING_SIBLING_SITEMAP';
    note = `validated_sitemap_found_with_${siblingSitemaps.length}_same_host_sitemap_siblings`;
  } else if (bestCandidate) {
    recommendedAction = 'PROMOTE_SITEMAP';
    note = 'validated_sitemap_candidate_found';
  } else {
    recommendedAction = 'MANUAL_SECTION_FEEDS_OR_FAST_LANE';
    if (successfulProbeCount > 0) {
      note = `sitemap_found_but_rejected_${Array.from(rejectionReasons).sort().join('_').toLowerCase()}`;
    } else {
      note = prioritized.length > 0 ? 'no_valid_sitemap_candidate' : 'no_candidate_urls_generated';
    }
  }

  return {
    source: row.source,
    country: row.country,
    currentRssUrl,
    currentRssHost,
    created24h: row.created24h,
    peakPublished1h7d: row.peakPublished1h7d,
    rssMinFetched48h: row.rssMinFetched48h,
    rssMedianFetched48h: row.rssMedianFetched48h,
    riskBand: row.riskBand,
    siblingSitemapFeeds: siblingSitemaps.map((item) => item.source),
    siblingSitemapUrls: siblingSitemaps.map((item) => item.sitemapUrl),
    candidatesTried: prioritized.length,
    validCandidateCount,
    bestCandidate,
    recommendedAction,
    note,
    probes,
  };
}

async function runWithConcurrency<T, U>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<U>
): Promise<U[]> {
  const results: U[] = new Array(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()));
  return results;
}

function formatCsvValue(value: string | number): string {
  const normalized = String(value ?? '');
  if (!/[",\n\r]/.test(normalized)) return normalized;
  return `"${normalized.replaceAll('"', '""')}"`;
}

function buildCsv(rows: FeedAnalysisResult[]): string {
  const header = [
    'source',
    'country',
    'risk_band',
    'created24h',
    'peak_published_1h_7d',
    'rss_min_fetched_48h',
    'rss_median_fetched_48h',
    'current_rss_url',
    'current_rss_host',
    'sibling_sitemap_feeds',
    'candidates_tried',
    'valid_candidate_count',
    'best_candidate_url',
    'best_candidate_origin',
    'best_candidate_root_kind',
    'best_candidate_approx_url_count',
    'best_candidate_reason',
    'recommended_action',
    'note',
  ];

  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push([
      formatCsvValue(row.source),
      formatCsvValue(row.country),
      formatCsvValue(row.riskBand),
      formatCsvValue(row.created24h),
      formatCsvValue(row.peakPublished1h7d),
      formatCsvValue(row.rssMinFetched48h),
      formatCsvValue(row.rssMedianFetched48h),
      formatCsvValue(row.currentRssUrl || ''),
      formatCsvValue(row.currentRssHost || ''),
      formatCsvValue(row.siblingSitemapFeeds.join(' | ')),
      formatCsvValue(row.candidatesTried),
      formatCsvValue(row.validCandidateCount),
      formatCsvValue(row.bestCandidate?.finalSitemapUrl || row.bestCandidate?.candidateUrl || ''),
      formatCsvValue(row.bestCandidate?.origin || ''),
      formatCsvValue(row.bestCandidate?.rootKind || ''),
      formatCsvValue(row.bestCandidate?.approxUrlCount || 0),
      formatCsvValue(row.bestCandidate?.reason || ''),
      formatCsvValue(row.recommendedAction),
      formatCsvValue(row.note),
    ].join(','));
  }
  return `${lines.join('\n')}\n`;
}

function buildMarkdown(rows: FeedAnalysisResult[], options: CliOptions): string {
  const promoted = rows.filter((row) => row.recommendedAction === 'PROMOTE_SITEMAP');
  const siblingReview = rows.filter((row) => row.recommendedAction === 'REVIEW_EXISTING_SIBLING_SITEMAP');
  const unresolved = rows.filter((row) => row.recommendedAction === 'MANUAL_SECTION_FEEDS_OR_FAST_LANE');
  const missing = rows.filter((row) => row.recommendedAction === 'SOURCE_NOT_FOUND');

  const lines: string[] = [
    '# Ingest Head Sitemap Candidate Audit',
    '',
    `- Generated: ${new Date().toISOString()}`,
    `- Input watchlist: \`${options.inputCsvPath}\``,
    `- Rows analyzed: ${rows.length}`,
    `- Promote sitemap: ${promoted.length}`,
    `- Review existing sibling sitemap: ${siblingReview.length}`,
    `- Manual section feeds / fast-lane: ${unresolved.length}`,
    `- Source missing in atlas: ${missing.length}`,
    '',
    '## Promote Sitemap',
    '',
    '| Country | Source | RSS URL | Candidate Sitemap | Origin | Approx URL Count | Note |',
    '|---|---|---|---|---|---:|---|',
    ...promoted.map((row) => `| ${row.country} | ${row.source} | <${row.currentRssUrl || ''}> | <${row.bestCandidate?.finalSitemapUrl || row.bestCandidate?.candidateUrl || ''}> | ${row.bestCandidate?.origin || '-'} | ${row.bestCandidate?.approxUrlCount || 0} | ${row.note} |`),
    '',
    '## Review Existing Sibling Sitemap',
    '',
    '| Country | Source | RSS URL | Candidate Sitemap | Sibling Feeds | Note |',
    '|---|---|---|---|---|---|',
    ...siblingReview.map((row) => `| ${row.country} | ${row.source} | <${row.currentRssUrl || ''}> | <${row.bestCandidate?.finalSitemapUrl || row.bestCandidate?.candidateUrl || ''}> | ${row.siblingSitemapFeeds.join(', ')} | ${row.note} |`),
    '',
    '## Manual Section Feeds Or Fast-Lane',
    '',
    '| Country | Source | RSS URL | Candidates Tried | Note |',
    '|---|---|---|---:|---|',
    ...unresolved.map((row) => `| ${row.country} | ${row.source} | <${row.currentRssUrl || ''}> | ${row.candidatesTried} | ${row.note} |`),
  ];

  if (missing.length > 0) {
    lines.push('', '## Missing In Atlas', '', '| Country | Source | Note |', '|---|---|---|');
    lines.push(...missing.map((row) => `| ${row.country} | ${row.source} | ${row.note} |`));
  }

  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const options = parseOptions();
  const atlas = loadAtlas(options.atlasPath);
  const watchlistRows = loadWatchlistRows(options.inputCsvPath, options.limit);
  const results = await runWithConcurrency(
    watchlistRows,
    options.concurrency,
    async (row) => analyzeFeed(row, atlas, options)
  );

  const payload = {
    generatedAt: new Date().toISOString(),
    options,
    summary: {
      rows: results.length,
      promoteSitemap: results.filter((row) => row.recommendedAction === 'PROMOTE_SITEMAP').length,
      reviewExistingSiblingSitemap: results.filter((row) => row.recommendedAction === 'REVIEW_EXISTING_SIBLING_SITEMAP').length,
      manualSectionFeedsOrFastLane: results.filter((row) => row.recommendedAction === 'MANUAL_SECTION_FEEDS_OR_FAST_LANE').length,
      sourceNotFound: results.filter((row) => row.recommendedAction === 'SOURCE_NOT_FOUND').length,
    },
    rows: results,
  };

  mkdirSync(dirname(options.outputJsonPath), { recursive: true });
  mkdirSync(dirname(options.outputCsvPath), { recursive: true });
  mkdirSync(dirname(options.outputMdPath), { recursive: true });
  writeFileSync(options.outputJsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  writeFileSync(options.outputCsvPath, buildCsv(results), 'utf8');
  writeFileSync(options.outputMdPath, buildMarkdown(results, options), 'utf8');

  console.log(`[ingest-head-sitemap-candidates] rows=${results.length}`);
  console.log(`[ingest-head-sitemap-candidates] promote=${payload.summary.promoteSitemap}`);
  console.log(`[ingest-head-sitemap-candidates] sibling_review=${payload.summary.reviewExistingSiblingSitemap}`);
  console.log(`[ingest-head-sitemap-candidates] unresolved=${payload.summary.manualSectionFeedsOrFastLane}`);
  console.log(`[ingest-head-sitemap-candidates] missing=${payload.summary.sourceNotFound}`);
  console.log(`[ingest-head-sitemap-candidates] wrote_json=${options.outputJsonPath}`);
  console.log(`[ingest-head-sitemap-candidates] wrote_csv=${options.outputCsvPath}`);
  console.log(`[ingest-head-sitemap-candidates] wrote_md=${options.outputMdPath}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[ingest-head-sitemap-candidates] ${message}`);
  process.exitCode = 1;
});
