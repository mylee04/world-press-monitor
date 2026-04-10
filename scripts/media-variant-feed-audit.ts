#!/usr/bin/env bun
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { parseRssOrAtomWithStats, parseSitemapWithStats } from '@/lib/parsers';

type AtlasFeed = {
  name?: string;
  url?: string | null;
  sitemapUrl?: string | null;
  enabled?: boolean;
};

type AtlasCountry = {
  name?: string;
  feeds?: AtlasFeed[];
};

type Atlas = {
  countries?: AtlasCountry[];
};

type FeedMethod = 'rss' | 'sitemap';
type LinkKind = 'article' | 'photo' | 'video' | 'other';
type Recommendation =
  | 'KEEP_ARTICLE_VARIANT'
  | 'HOLD_GALLERY_VARIANT'
  | 'DROP_DUPLICATE_VARIANT'
  | 'REVIEW_MIXED_VARIANT'
  | 'FETCH_FAILED';

type MediaVariantCandidate = {
  country: string;
  source: string;
  method: FeedMethod;
  url: string;
  enabled: boolean;
};

type CandidateAnalysis = {
  country: string;
  source: string;
  method: FeedMethod;
  url: string;
  enabled: boolean;
  siblingStandardCount: number;
  siblingStandardSources: string[];
  fetchedCount: number;
  uniqueBeyondStandard: number;
  uniqueArticleCount: number;
  uniquePhotoCount: number;
  uniqueVideoCount: number;
  uniqueOtherCount: number;
  dominantKind: LinkKind;
  recommendation: Recommendation;
  note: string;
  sampleUnique: string[];
};

type CliOptions = {
  atlasPath: string;
  outputJsonPath: string;
  outputCsvPath: string;
  outputMdPath: string;
  timeoutMs: number;
  concurrency: number;
};

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
    outputJsonPath: resolve(
      process.cwd(),
      parseArgValue('output-json') || 'audits/media_variant_feed_audit_latest.json'
    ),
    outputCsvPath: resolve(
      process.cwd(),
      parseArgValue('output-csv') || 'audits/media_variant_feed_audit_latest.csv'
    ),
    outputMdPath: resolve(
      process.cwd(),
      parseArgValue('output-md') || 'audits/media_variant_feed_audit_latest.md'
    ),
    timeoutMs: clampInt(parseArgValue('timeout-ms'), 2000, 30000, 6000),
    concurrency: clampInt(parseArgValue('concurrency'), 1, 12, 4),
  };
}

function loadAtlas(path: string): Atlas {
  return JSON.parse(readFileSync(path, 'utf8')) as Atlas;
}

function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, '').replace(/^rss\./, '').replace(/^feed\./, '');
}

function hasMediaVariantToken(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    /(^|[^a-z])(photo|photos|foto|fotos|video|videos|videogallery|photogallery|videoarticle)([^a-z]|$)/.test(lower)
    || /[?&]type=.*\b(video|gallery)\b/.test(lower)
    || /\/(?:video|videos|foto|fotos|photos|photogallery|videogallery)(?:\/|$)/.test(lower)
  );
}

function buildCandidates(atlas: Atlas): MediaVariantCandidate[] {
  const candidates: MediaVariantCandidate[] = [];
  for (const country of atlas.countries || []) {
    const countryName = (country.name || '').trim();
    if (!countryName) continue;
    for (const feed of country.feeds || []) {
      const source = (feed.name || '').trim();
      const rssUrl = (feed.url || '').trim();
      const sitemapUrl = (feed.sitemapUrl || '').trim();
      if (rssUrl && hasMediaVariantToken(`${source} ${rssUrl}`)) {
        candidates.push({
          country: countryName,
          source,
          method: 'rss',
          url: rssUrl,
          enabled: feed.enabled !== false,
        });
      }
      if (sitemapUrl && hasMediaVariantToken(`${source} ${sitemapUrl}`)) {
        candidates.push({
          country: countryName,
          source,
          method: 'sitemap',
          url: sitemapUrl,
          enabled: feed.enabled !== false,
        });
      }
    }
  }
  return candidates;
}

function buildStandardSiblingMap(atlas: Atlas): Map<string, Array<{ source: string; method: FeedMethod; url: string }>> {
  const map = new Map<string, Array<{ source: string; method: FeedMethod; url: string }>>();
  for (const country of atlas.countries || []) {
    const countryName = (country.name || '').trim();
    if (!countryName) continue;
    for (const feed of country.feeds || []) {
      if (feed.enabled === false) continue;
      const source = (feed.name || '').trim();
      const entries: Array<{ method: FeedMethod; url: string }> = [];
      if ((feed.url || '').trim()) entries.push({ method: 'rss', url: feed.url!.trim() });
      if ((feed.sitemapUrl || '').trim()) entries.push({ method: 'sitemap', url: feed.sitemapUrl!.trim() });
      for (const entry of entries) {
        try {
          const host = normalizeHost(new URL(entry.url).hostname);
          const key = `${countryName}|||${host}`;
          const current = map.get(key) || [];
          if (!hasMediaVariantToken(`${source} ${entry.url}`)) {
            current.push({ source, method: entry.method, url: entry.url });
          }
          map.set(key, current);
        } catch {
          continue;
        }
      }
    }
  }
  return map;
}

function classifyLinkKind(link: string): LinkKind {
  try {
    const pathname = new URL(link).pathname.toLowerCase();
    if (pathname.startsWith('/berita/')) return 'article';
    if (/^\/(?:foto|photos?|photogallery)\//.test(pathname)) return 'photo';
    if (/^\/(?:video|videos|videogallery)\//.test(pathname)) return 'video';
    return 'other';
  } catch {
    return 'other';
  }
}

function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*',
      'Accept-Language': process.env.INGEST_ACCEPT_LANGUAGE || 'en-US,en;q=0.9',
    },
    redirect: 'follow',
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
}

async function readBody(response: Response): Promise<string> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  const encoding = response.headers.get('content-encoding') || '';
  const gzip =
    encoding.includes('gzip')
    || (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b);
  try {
    return gzip
      ? new TextDecoder().decode(gunzipSync(Buffer.from(bytes)))
      : new TextDecoder().decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

async function fetchLinks(method: FeedMethod, url: string, timeoutMs: number): Promise<string[]> {
  const response = await fetchWithTimeout(url, timeoutMs);
  if (!response.ok) {
    throw new Error(`HTTP_${response.status}`);
  }
  const body = await readBody(response);
  if (method === 'rss') {
    return parseRssOrAtomWithStats(body, 150).items.map((item) => item.link).filter(Boolean);
  }
  return parseSitemapWithStats(body, 200, url).items.map((item) => item.link).filter(Boolean);
}

function recommendFromCounts(params: {
  uniqueBeyondStandard: number;
  uniqueArticleCount: number;
  uniquePhotoCount: number;
  uniqueVideoCount: number;
  uniqueOtherCount: number;
}): { recommendation: Recommendation; dominantKind: LinkKind; note: string } {
  const counts: Record<LinkKind, number> = {
    article: params.uniqueArticleCount,
    photo: params.uniquePhotoCount,
    video: params.uniqueVideoCount,
    other: params.uniqueOtherCount,
  };
  const dominantKind = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'other') as LinkKind;
  if (params.uniqueBeyondStandard === 0) {
    return { recommendation: 'DROP_DUPLICATE_VARIANT', dominantKind, note: 'no_unique_links_beyond_standard_siblings' };
  }
  if (params.uniqueArticleCount >= Math.max(10, params.uniqueBeyondStandard * 0.6)) {
    return { recommendation: 'KEEP_ARTICLE_VARIANT', dominantKind, note: 'adds_unique_article_links_beyond_standard_siblings' };
  }
  if (params.uniquePhotoCount + params.uniqueVideoCount >= Math.max(5, params.uniqueBeyondStandard * 0.6)) {
    return { recommendation: 'HOLD_GALLERY_VARIANT', dominantKind, note: 'mostly_media_gallery_or_media_page_links' };
  }
  return { recommendation: 'REVIEW_MIXED_VARIANT', dominantKind, note: 'mixed_link_shape_requires_manual_review' };
}

async function analyzeCandidate(
  candidate: MediaVariantCandidate,
  siblingMap: Map<string, Array<{ source: string; method: FeedMethod; url: string }>>,
  options: CliOptions
): Promise<CandidateAnalysis> {
  let host = '';
  try {
    host = normalizeHost(new URL(candidate.url).hostname);
  } catch {
    return {
      country: candidate.country,
      source: candidate.source,
      method: candidate.method,
      url: candidate.url,
      enabled: candidate.enabled,
      siblingStandardCount: 0,
      siblingStandardSources: [],
      fetchedCount: 0,
      uniqueBeyondStandard: 0,
      uniqueArticleCount: 0,
      uniquePhotoCount: 0,
      uniqueVideoCount: 0,
      uniqueOtherCount: 0,
      dominantKind: 'other',
      recommendation: 'FETCH_FAILED',
      note: 'invalid_candidate_url',
      sampleUnique: [],
    };
  }

  const siblingKey = `${candidate.country}|||${host}`;
  const siblings = (siblingMap.get(siblingKey) || []).filter((entry) => entry.url !== candidate.url);
  const siblingSources = [...new Set(siblings.map((entry) => `${entry.source} [${entry.method}]`))];

  try {
    const [candidateLinks, ...siblingLinkLists] = await Promise.all([
      fetchLinks(candidate.method, candidate.url, options.timeoutMs),
      ...siblings.map((entry) => fetchLinks(entry.method, entry.url, options.timeoutMs).catch(() => [])),
    ]);
    const siblingUnion = new Set<string>();
    for (const links of siblingLinkLists) {
      for (const link of links) siblingUnion.add(link);
    }

    const uniqueLinks = [...new Set(candidateLinks)].filter((link) => !siblingUnion.has(link));
    let uniqueArticleCount = 0;
    let uniquePhotoCount = 0;
    let uniqueVideoCount = 0;
    let uniqueOtherCount = 0;
    for (const link of uniqueLinks) {
      const kind = classifyLinkKind(link);
      if (kind === 'article') uniqueArticleCount += 1;
      else if (kind === 'photo') uniquePhotoCount += 1;
      else if (kind === 'video') uniqueVideoCount += 1;
      else uniqueOtherCount += 1;
    }

    const recommendation = recommendFromCounts({
      uniqueBeyondStandard: uniqueLinks.length,
      uniqueArticleCount,
      uniquePhotoCount,
      uniqueVideoCount,
      uniqueOtherCount,
    });

    return {
      country: candidate.country,
      source: candidate.source,
      method: candidate.method,
      url: candidate.url,
      enabled: candidate.enabled,
      siblingStandardCount: siblingSources.length,
      siblingStandardSources: siblingSources,
      fetchedCount: candidateLinks.length,
      uniqueBeyondStandard: uniqueLinks.length,
      uniqueArticleCount,
      uniquePhotoCount,
      uniqueVideoCount,
      uniqueOtherCount,
      dominantKind: recommendation.dominantKind,
      recommendation: recommendation.recommendation,
      note: recommendation.note,
      sampleUnique: uniqueLinks.slice(0, 5),
    };
  } catch (error) {
    return {
      country: candidate.country,
      source: candidate.source,
      method: candidate.method,
      url: candidate.url,
      enabled: candidate.enabled,
      siblingStandardCount: siblingSources.length,
      siblingStandardSources: siblingSources,
      fetchedCount: 0,
      uniqueBeyondStandard: 0,
      uniqueArticleCount: 0,
      uniquePhotoCount: 0,
      uniqueVideoCount: 0,
      uniqueOtherCount: 0,
      dominantKind: 'other',
      recommendation: 'FETCH_FAILED',
      note: String(error),
      sampleUnique: [],
    };
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

function formatCsvValue(value: string | number | boolean): string {
  const normalized = String(value ?? '');
  if (!/[",\n\r]/.test(normalized)) return normalized;
  return `"${normalized.replaceAll('"', '""')}"`;
}

function buildCsv(results: CandidateAnalysis[]): string {
  const header = [
    'country',
    'source',
    'method',
    'enabled',
    'url',
    'sibling_standard_count',
    'fetched_count',
    'unique_beyond_standard',
    'unique_article_count',
    'unique_photo_count',
    'unique_video_count',
    'unique_other_count',
    'dominant_kind',
    'recommendation',
    'note',
  ];
  const lines = [header.join(',')];
  for (const row of results) {
    lines.push([
      formatCsvValue(row.country),
      formatCsvValue(row.source),
      formatCsvValue(row.method),
      formatCsvValue(row.enabled),
      formatCsvValue(row.url),
      formatCsvValue(row.siblingStandardCount),
      formatCsvValue(row.fetchedCount),
      formatCsvValue(row.uniqueBeyondStandard),
      formatCsvValue(row.uniqueArticleCount),
      formatCsvValue(row.uniquePhotoCount),
      formatCsvValue(row.uniqueVideoCount),
      formatCsvValue(row.uniqueOtherCount),
      formatCsvValue(row.dominantKind),
      formatCsvValue(row.recommendation),
      formatCsvValue(row.note),
    ].join(','));
  }
  return `${lines.join('\n')}\n`;
}

function buildMarkdown(results: CandidateAnalysis[], options: CliOptions): string {
  const counts = results.reduce<Record<string, number>>((acc, row) => {
    acc[row.recommendation] = (acc[row.recommendation] || 0) + 1;
    return acc;
  }, {});
  const lines: string[] = [
    '# Media Variant Feed Audit',
    '',
    `- Generated: ${new Date().toISOString()}`,
    `- Atlas: \`${options.atlasPath}\``,
    `- Rows analyzed: ${results.length}`,
    ...Object.entries(counts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, value]) => `- ${key}: ${value}`),
    '',
    '| Country | Source | Method | Enabled | Unique Beyond Standard | Kind Mix | Recommendation | Note |',
    '|---|---|---|---:|---:|---|---|---|',
    ...results.map((row) => `| ${row.country} | ${row.source} | ${row.method} | ${row.enabled ? 'yes' : 'no'} | ${row.uniqueBeyondStandard} | article=${row.uniqueArticleCount}, photo=${row.uniquePhotoCount}, video=${row.uniqueVideoCount}, other=${row.uniqueOtherCount} | ${row.recommendation} | ${row.note} |`),
  ];
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const options = parseOptions();
  const atlas = loadAtlas(options.atlasPath);
  const candidates = buildCandidates(atlas);
  const siblingMap = buildStandardSiblingMap(atlas);
  const results = await runWithConcurrency(
    candidates,
    options.concurrency,
    (candidate) => analyzeCandidate(candidate, siblingMap, options)
  );

  const payload = {
    generatedAt: new Date().toISOString(),
    options,
    summary: {
      rows: results.length,
      keepArticleVariant: results.filter((row) => row.recommendation === 'KEEP_ARTICLE_VARIANT').length,
      holdGalleryVariant: results.filter((row) => row.recommendation === 'HOLD_GALLERY_VARIANT').length,
      dropDuplicateVariant: results.filter((row) => row.recommendation === 'DROP_DUPLICATE_VARIANT').length,
      reviewMixedVariant: results.filter((row) => row.recommendation === 'REVIEW_MIXED_VARIANT').length,
      fetchFailed: results.filter((row) => row.recommendation === 'FETCH_FAILED').length,
    },
    rows: results,
  };

  mkdirSync(dirname(options.outputJsonPath), { recursive: true });
  mkdirSync(dirname(options.outputCsvPath), { recursive: true });
  mkdirSync(dirname(options.outputMdPath), { recursive: true });
  writeFileSync(options.outputJsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  writeFileSync(options.outputCsvPath, buildCsv(results), 'utf8');
  writeFileSync(options.outputMdPath, buildMarkdown(results, options), 'utf8');

  console.log(`[media-variant-feed-audit] rows=${results.length}`);
  console.log(`[media-variant-feed-audit] keep_article=${payload.summary.keepArticleVariant}`);
  console.log(`[media-variant-feed-audit] hold_gallery=${payload.summary.holdGalleryVariant}`);
  console.log(`[media-variant-feed-audit] drop_duplicate=${payload.summary.dropDuplicateVariant}`);
  console.log(`[media-variant-feed-audit] review_mixed=${payload.summary.reviewMixedVariant}`);
  console.log(`[media-variant-feed-audit] fetch_failed=${payload.summary.fetchFailed}`);
  console.log(`[media-variant-feed-audit] wrote_json=${options.outputJsonPath}`);
  console.log(`[media-variant-feed-audit] wrote_csv=${options.outputCsvPath}`);
  console.log(`[media-variant-feed-audit] wrote_md=${options.outputMdPath}`);
}

await main();
