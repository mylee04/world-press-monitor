#!/usr/bin/env bun
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { parseRssOrAtomWithStats } from '@/lib/parsers';

type AtlasFeed = {
  name: string;
  url?: string | null;
  sitemapUrl?: string | null;
  enabled?: boolean;
};

type AtlasCountry = {
  name: string;
  feeds: AtlasFeed[];
};

type Atlas = {
  countries: AtlasCountry[];
};

type SitemapAuditRow = {
  source: string;
  country: string;
  currentRssUrl: string | null;
  created24h: number;
  peakPublished1h7d: number;
  rssMedianFetched48h: number;
  recommendedAction: string;
  note: string;
};

type ExistingSiblingFeed = {
  name: string;
  url: string;
};

type ValidatedFeedCandidate = {
  url: string;
  origin: 'atlas_sibling' | 'html_discovery';
  itemCount: number;
  title: string | null;
  discoveryPage: string | null;
};

type FeedCandidateProbe = {
  url: string;
  discoveryPage: string | null;
  ok: boolean;
  status: number | null;
  reason: string;
  itemCount: number;
  title: string | null;
};

type SectionFeedResult = {
  source: string;
  country: string;
  currentRssUrl: string | null;
  created24h: number;
  peakPublished1h7d: number;
  rssMedianFetched48h: number;
  existingAtlasSiblingFeeds: ExistingSiblingFeed[];
  discoveryPagesTried: string[];
  htmlCandidateCount: number;
  validatedNewCandidates: ValidatedFeedCandidate[];
  probes: FeedCandidateProbe[];
  note: string;
};

type CliOptions = {
  atlasPath: string;
  inputJsonPath: string;
  outputJsonPath: string;
  outputCsvPath: string;
  outputMdPath: string;
  timeoutMs: number;
  limit: number;
  concurrency: number;
  maxCandidatesPerSource: number;
};

const XML_MARKERS = ['<rss', '<feed', '<?xml'];
const GENERIC_FEED_HOSTS = new Set([
  'feedburner.com',
  'feeds.feedburner.com',
]);
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
    inputJsonPath: resolve(
      process.cwd(),
      parseArgValue('input-json') || 'audits/ingest_head_sitemap_candidates_latest.json'
    ),
    outputJsonPath: resolve(
      process.cwd(),
      parseArgValue('output-json') || 'audits/ingest_head_section_feed_candidates_latest.json'
    ),
    outputCsvPath: resolve(
      process.cwd(),
      parseArgValue('output-csv') || 'audits/ingest_head_section_feed_candidates_latest.csv'
    ),
    outputMdPath: resolve(
      process.cwd(),
      parseArgValue('output-md') || 'audits/ingest_head_section_feed_candidates_latest.md'
    ),
    timeoutMs: clampInt(parseArgValue('timeout-ms'), 2000, 30000, 5000),
    limit: clampInt(parseArgValue('limit'), 1, 100, 10),
    concurrency: clampInt(parseArgValue('concurrency'), 1, 12, 3),
    maxCandidatesPerSource: clampInt(parseArgValue('max-candidates'), 1, 50, 24),
  };
}

function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, '').replace(/^rss\./, '').replace(/^feed\./, '');
}

function isGenericFeedHost(host: string): boolean {
  return GENERIC_FEED_HOSTS.has(host);
}

function normalizeComparableUrl(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.hash = '';
    if ((parsed.protocol === 'https:' && parsed.port === '443') || (parsed.protocol === 'http:' && parsed.port === '80')) {
      parsed.port = '';
    }
    return parsed.toString().replace(/\/+$/, '').toLowerCase();
  } catch {
    return value.trim().replace(/\/+$/, '').toLowerCase();
  }
}

function loadAtlas(filePath: string): Atlas {
  return JSON.parse(readFileSync(filePath, 'utf8')) as Atlas;
}

function loadRows(filePath: string, limit: number): SitemapAuditRow[] {
  const payload = JSON.parse(readFileSync(filePath, 'utf8')) as { rows?: SitemapAuditRow[] };
  const rows = (payload.rows || [])
    .filter((row) => row.recommendedAction === 'MANUAL_SECTION_FEEDS_OR_FAST_LANE')
    .sort((a, b) => b.created24h - a.created24h || b.peakPublished1h7d - a.peakPublished1h7d)
    .slice(0, limit);
  return rows;
}

function findAtlasFeed(atlas: Atlas, source: string, country: string): { feed: AtlasFeed; atlasCountry: AtlasCountry } | null {
  for (const atlasCountry of atlas.countries) {
    if (atlasCountry.name !== country) continue;
    for (const feed of atlasCountry.feeds || []) {
      if (feed.name === source) return { feed, atlasCountry };
    }
  }
  return null;
}

function findExistingSiblingFeeds(atlasCountry: AtlasCountry, currentFeed: AtlasFeed): ExistingSiblingFeed[] {
  const currentUrl = (currentFeed.url || '').trim();
  if (!currentUrl) return [];
  let currentHost = '';
  try {
    currentHost = normalizeHost(new URL(currentUrl).hostname);
  } catch {
    return [];
  }
  if (isGenericFeedHost(currentHost)) return [];

  const siblings: ExistingSiblingFeed[] = [];
  for (const feed of atlasCountry.feeds || []) {
    if (feed.enabled === false || feed.name === currentFeed.name) continue;
    const candidateUrl = (feed.url || '').trim();
    if (!candidateUrl) continue;
    try {
      const host = normalizeHost(new URL(candidateUrl).hostname);
      if (isGenericFeedHost(host)) continue;
      if (host === currentHost) {
        siblings.push({ name: feed.name, url: candidateUrl });
      }
    } catch {
      continue;
    }
  }

  return siblings;
}

function buildDiscoveryPages(sourceUrl: string): string[] {
  try {
    const parsed = new URL(sourceUrl);
    const pages = new Set<string>();
    const host = parsed.hostname;
    if (isGenericFeedHost(normalizeHost(host))) return [];
    const origin = `${parsed.protocol}//${host}`;
    pages.add(`${origin}/`);
    if (!host.startsWith('www.') && !host.startsWith('rss.') && !host.startsWith('feed.')) {
      pages.add(`${parsed.protocol}//www.${host}/`);
    }
    if (host.startsWith('rss.') || host.startsWith('feed.')) {
      const baseHost = host.replace(/^(rss|feed)\./, '');
      pages.add(`${parsed.protocol}//${baseHost}/`);
      pages.add(`${parsed.protocol}//www.${baseHost}/`);
    }
    const path = parsed.pathname;
    const dirPath = path.endsWith('/') ? path : path.replace(/\/[^/]*$/, '/');
    if (dirPath && dirPath !== '/') {
      pages.add(`${origin}${dirPath}`);
      const rssDir = dirPath.match(/^(.*\/(?:rss|feed)\/)/i)?.[1];
      if (rssDir) pages.add(`${origin}${rssDir}`);
      const rssStem = path.match(/^(.*\/(?:rss|feed))(?:\/[^/]+)?$/i)?.[1];
      if (rssStem) pages.add(`${origin}${rssStem}`);
    }
    return [...pages];
  } catch {
    return [];
  }
}

function isLikelyFeedUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (lower.includes('sitemap')) return false;
  if (lower.includes('comments/feed')) return false;
  if (lower.includes('tag/') && lower.endsWith('/feed/')) return false;
  return lower.includes('/rss') || lower.includes('/feed') || lower.includes('atom') || lower.endsWith('.xml') || lower.endsWith('.rss');
}

function extractCandidateUrls(html: string, baseUrl: string, currentUrl: string): string[] {
  const urls: string[] = [];
  const currentComparable = normalizeComparableUrl(currentUrl);
  const hrefRegex = /href=["']([^"'#]+)["']/gi;
  const linkAltRegex = /<link[^>]+type=["'](?:application\/rss\+xml|application\/atom\+xml|text\/xml|application\/xml)["'][^>]+href=["']([^"']+)["'][^>]*>/gi;

  const pushCandidate = (raw: string) => {
    try {
      const absolute = new URL(raw, baseUrl).toString();
      const currentHost = normalizeHost(new URL(currentUrl).hostname);
      const candidateHost = normalizeHost(new URL(absolute).hostname);
      if (candidateHost !== currentHost) return;
      if (normalizeComparableUrl(absolute) === currentComparable) return;
      if (!isLikelyFeedUrl(absolute)) return;
      urls.push(absolute);
    } catch {
      return;
    }
  };

  for (const match of html.matchAll(hrefRegex)) {
    pushCandidate(match[1]);
  }
  for (const match of html.matchAll(linkAltRegex)) {
    pushCandidate(match[1]);
  }

  return [...new Set(urls)];
}

function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/rss+xml, application/xml, text/xml, application/atom+xml, */*',
      'Accept-Language': process.env.INGEST_ACCEPT_LANGUAGE || 'en-US,en;q=0.9',
    },
    redirect: 'follow',
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
}

async function readResponseText(response: Response): Promise<string> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentEncoding = response.headers.get('content-encoding') || '';
  const isGzip =
    contentEncoding.includes('gzip')
    || (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b);
  try {
    return isGzip
      ? new TextDecoder().decode(gunzipSync(Buffer.from(bytes)))
      : new TextDecoder().decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

async function fetchDiscoveryPage(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const response = await fetchWithTimeout(url, timeoutMs);
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('xml') || contentType.includes('rss') || contentType.includes('atom')) return null;
    const body = await readResponseText(response);
    return body.slice(0, 300_000);
  } catch {
    return null;
  }
}

async function validateFeedCandidate(url: string, timeoutMs: number): Promise<{ ok: boolean; status: number | null; reason: string; itemCount: number; title: string | null }> {
  try {
    const response = await fetchWithTimeout(url, timeoutMs);
    const status = response.status;
    if (!response.ok) {
      return { ok: false, status, reason: `HTTP_${status}`, itemCount: 0, title: null };
    }
    const body = await readResponseText(response);
    const lower = body.slice(0, 4000).toLowerCase();
    if (!XML_MARKERS.some((marker) => lower.includes(marker))) {
      return { ok: false, status, reason: 'HTML_RETURNED', itemCount: 0, title: null };
    }
    const parsed = parseRssOrAtomWithStats(body, 120);
    if (parsed.stats.validCount === 0) {
      return { ok: false, status, reason: 'NO_ITEMS', itemCount: 0, title: null };
    }
    return {
      ok: true,
      status,
      reason: 'OK',
      itemCount: parsed.stats.validCount,
      title: parsed.items[0]?.title || null,
    };
  } catch (error) {
    const message = String(error).toLowerCase();
    const reason = message.includes('abort') || message.includes('timeout') ? 'TIMEOUT' : 'NETWORK';
    return { ok: false, status: null, reason, itemCount: 0, title: null };
  }
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

async function analyzeSource(row: SitemapAuditRow, atlas: Atlas, options: CliOptions): Promise<SectionFeedResult> {
  const match = findAtlasFeed(atlas, row.source, row.country);
  if (!match) {
    return {
      source: row.source,
      country: row.country,
      currentRssUrl: row.currentRssUrl,
      created24h: row.created24h,
      peakPublished1h7d: row.peakPublished1h7d,
      rssMedianFetched48h: row.rssMedianFetched48h,
      existingAtlasSiblingFeeds: [],
      discoveryPagesTried: [],
      htmlCandidateCount: 0,
      validatedNewCandidates: [],
      probes: [],
      note: 'source_not_found_in_atlas',
    };
  }

  const currentRssUrl = (match.feed.url || '').trim() || row.currentRssUrl;
  const existingAtlasSiblingFeeds = findExistingSiblingFeeds(match.atlasCountry, match.feed);
  const discoveryPages = currentRssUrl ? buildDiscoveryPages(currentRssUrl) : [];
  const htmlCandidateUrls = new Set<string>();

  for (const page of discoveryPages) {
    const html = await fetchDiscoveryPage(page, options.timeoutMs);
    if (!html || !currentRssUrl) continue;
    for (const candidate of extractCandidateUrls(html, page, currentRssUrl)) {
      htmlCandidateUrls.add(candidate);
    }
  }

  const existingUrls = new Set(existingAtlasSiblingFeeds.map((item) => item.url));
  const candidateUrls = [...htmlCandidateUrls]
    .filter((url) => !existingUrls.has(url))
    .filter((url) => normalizeComparableUrl(url) !== normalizeComparableUrl(currentRssUrl || ''))
    .slice(0, options.maxCandidatesPerSource);

  const validatedNewCandidates: ValidatedFeedCandidate[] = [];
  const probes: FeedCandidateProbe[] = [];
  for (const candidateUrl of candidateUrls) {
    const result = await validateFeedCandidate(candidateUrl, options.timeoutMs);
    probes.push({
      url: candidateUrl,
      discoveryPage: discoveryPages.find((page) => page && candidateUrl.startsWith(new URL(page).origin)) || null,
      ok: result.ok,
      status: result.status,
      reason: result.reason,
      itemCount: result.itemCount,
      title: result.title,
    });
    if (result.ok) {
      validatedNewCandidates.push({
        url: candidateUrl,
        origin: 'html_discovery',
        itemCount: result.itemCount,
        title: result.title,
        discoveryPage: discoveryPages.find((page) => page && candidateUrl.startsWith(new URL(page).origin)) || null,
      });
    }
  }

  let note = 'no_section_feed_candidates_found';
  if (existingAtlasSiblingFeeds.length > 0 && validatedNewCandidates.length > 0) {
    note = 'existing_atlas_sections_plus_new_candidates';
  } else if (existingAtlasSiblingFeeds.length > 0) {
    note = 'existing_atlas_section_feeds_present';
  } else if (validatedNewCandidates.length > 0) {
    note = 'validated_new_section_feed_candidates_found';
  }

  return {
    source: row.source,
    country: row.country,
    currentRssUrl,
    created24h: row.created24h,
    peakPublished1h7d: row.peakPublished1h7d,
    rssMedianFetched48h: row.rssMedianFetched48h,
    existingAtlasSiblingFeeds,
    discoveryPagesTried: discoveryPages,
    htmlCandidateCount: candidateUrls.length,
    validatedNewCandidates,
    probes,
    note,
  };
}

function formatCsvValue(value: string | number): string {
  const normalized = String(value ?? '');
  if (!/[",\n\r]/.test(normalized)) return normalized;
  return `"${normalized.replaceAll('"', '""')}"`;
}

function buildCsv(results: SectionFeedResult[]): string {
  const header = [
    'country',
    'source',
    'created24h',
    'peak_published_1h_7d',
    'rss_median_fetched_48h',
    'current_rss_url',
    'existing_atlas_section_count',
    'existing_atlas_sections',
    'validated_new_candidate_count',
    'validated_new_candidates',
    'note',
  ];
  const lines = [header.join(',')];
  for (const row of results) {
    lines.push([
      formatCsvValue(row.country),
      formatCsvValue(row.source),
      formatCsvValue(row.created24h),
      formatCsvValue(row.peakPublished1h7d),
      formatCsvValue(row.rssMedianFetched48h),
      formatCsvValue(row.currentRssUrl || ''),
      formatCsvValue(row.existingAtlasSiblingFeeds.length),
      formatCsvValue(row.existingAtlasSiblingFeeds.map((item) => `${item.name} <${item.url}>`).join(' | ')),
      formatCsvValue(row.validatedNewCandidates.length),
      formatCsvValue(row.validatedNewCandidates.map((item) => `<${item.url}> (${item.itemCount})`).join(' | ')),
      formatCsvValue(row.note),
    ].join(','));
  }
  return `${lines.join('\n')}\n`;
}

function buildMarkdown(results: SectionFeedResult[], options: CliOptions): string {
  const lines: string[] = [
    '# Ingest Head Section Feed Candidate Audit',
    '',
    `- Generated: ${new Date().toISOString()}`,
    `- Input sitemap audit: \`${options.inputJsonPath}\``,
    `- Rows analyzed: ${results.length}`,
    `- With existing atlas section feeds: ${results.filter((row) => row.existingAtlasSiblingFeeds.length > 0).length}`,
    `- With validated new section feed candidates: ${results.filter((row) => row.validatedNewCandidates.length > 0).length}`,
    '',
    '| Country | Source | Current RSS | Existing Atlas Section Feeds | New Validated Candidates | Note |',
    '|---|---|---|---|---|---|',
    ...results.map((row) => `| ${row.country} | ${row.source} | <${row.currentRssUrl || ''}> | ${row.existingAtlasSiblingFeeds.map((item) => `${item.name} <${item.url}>`).join('<br>') || '-'} | ${row.validatedNewCandidates.map((item) => `<${item.url}> (${item.itemCount})`).join('<br>') || '-'} | ${row.note} |`),
  ];
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const options = parseOptions();
  const atlas = loadAtlas(options.atlasPath);
  const rows = loadRows(options.inputJsonPath, options.limit);
  const results = await runWithConcurrency(rows, options.concurrency, (row) => analyzeSource(row, atlas, options));

  const payload = {
    generatedAt: new Date().toISOString(),
    options,
    summary: {
      rows: results.length,
      withExistingAtlasSectionFeeds: results.filter((row) => row.existingAtlasSiblingFeeds.length > 0).length,
      withValidatedNewSectionFeedCandidates: results.filter((row) => row.validatedNewCandidates.length > 0).length,
    },
    rows: results,
  };

  mkdirSync(dirname(options.outputJsonPath), { recursive: true });
  mkdirSync(dirname(options.outputCsvPath), { recursive: true });
  mkdirSync(dirname(options.outputMdPath), { recursive: true });
  writeFileSync(options.outputJsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  writeFileSync(options.outputCsvPath, buildCsv(results), 'utf8');
  writeFileSync(options.outputMdPath, buildMarkdown(results, options), 'utf8');

  console.log(`[ingest-head-section-feed-candidates] rows=${results.length}`);
  console.log(
    `[ingest-head-section-feed-candidates] existing_atlas_sections=${payload.summary.withExistingAtlasSectionFeeds}`
  );
  console.log(
    `[ingest-head-section-feed-candidates] validated_new_candidates=${payload.summary.withValidatedNewSectionFeedCandidates}`
  );
  console.log(`[ingest-head-section-feed-candidates] wrote_json=${options.outputJsonPath}`);
  console.log(`[ingest-head-section-feed-candidates] wrote_csv=${options.outputCsvPath}`);
  console.log(`[ingest-head-section-feed-candidates] wrote_md=${options.outputMdPath}`);
}

await main();
