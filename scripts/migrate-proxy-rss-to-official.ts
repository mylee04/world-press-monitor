#!/usr/bin/env bun
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type AtlasFeed = {
  name: string;
  url: string | null;
  status: string | null;
  checkedDate: string | null;
  valid: string | null;
  row: number;
};

type AtlasCountry = {
  name: string;
  code: string;
  feeds: AtlasFeed[];
};

type Atlas = {
  version: number;
  generatedAt: string;
  lastChecked: string;
  countries: AtlasCountry[];
};

const ATLAS_PATH = process.env.ATLAS_PATH || resolve(process.cwd(), 'data/rss-atlas.json');
const TIMEOUT_MS = clampInt(process.env.RSS_MIGRATE_TIMEOUT_MS, 1500, 10000, 3500);
const MAX_ATTEMPTS = clampInt(process.env.RSS_MIGRATE_MAX_ATTEMPTS, 1, 20, 6);
const OFFLINE_MODE = process.env.RSS_MIGRATE_OFFLINE_MODE === '1';

const XML_MARKERS = ['<rss', '<feed', '<urlset', '<sitemapindex', '<?xml'];
const BING_PATTERNS = ['microsoft.com', 'bing.com'];

const CANDIDATE_PATHS = [
  '/feed',
  '/feed/',
  '/feeds',
  '/feeds/',
  '/feeds/default',
  '/rss',
  '/rss/',
  '/rss.xml',
  '/feed.xml',
  '/atom.xml',
  '/index.xml',
  '/?feed=rss',
  '/?output=rss',
  '/?format=rss',
  '/?output=rss2',
  '/?q=rss',
];

async function main(): Promise<void> {
  const raw = readFileSync(ATLAS_PATH, 'utf8');
  const atlas = JSON.parse(raw) as Atlas;

  if (!Array.isArray(atlas.countries)) {
    throw new Error(`Invalid atlas format: countries is missing at ${ATLAS_PATH}`);
  }

  let replaced = 0;
  let unresolved = 0;
  const updatedCountries: AtlasCountry[] = [];

  for (const country of atlas.countries) {
    const nextFeeds: AtlasFeed[] = [];

    for (const feed of country.feeds) {
      if (!feed.url || !isProxyFeed(feed.url)) {
        nextFeeds.push(feed);
        continue;
      }

      const domain = extractSiteDomain(feed.url);
      if (!domain) {
        unresolved += 1;
        nextFeeds.push({
          ...feed,
          status: '❌ NO_SITE_QUERY',
          valid: 'needs verification',
          url: null,
        });
        continue;
      }

      const candidates = makeCandidateUrls(domain);
      const winner = await findFirstWorkingRss(candidates);
      if (!winner) {
        unresolved += 1;
        nextFeeds.push({
          ...feed,
          status: '❌ REQUIRES_MANUAL',
          valid: 'needs verification',
          url: null,
        });
        continue;
      }

      replaced += 1;
      nextFeeds.push({
        ...feed,
        url: winner,
        status: '⏩ OFFICIAL',
        valid: 'needs verification',
      });
    }

    updatedCountries.push({
      ...country,
      feeds: nextFeeds,
    });
  }

  const output = {
    ...atlas,
    generatedAt: new Date().toISOString(),
    countries: updatedCountries,
  };

  writeFileSync(ATLAS_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`migrated: ${replaced}`);
  console.log(`unresolved/proxied-without-domain: ${unresolved}`);
}

function isProxyFeed(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return host.includes('news.google.com') || BING_PATTERNS.some((piece) => host.includes(piece));
  } catch {
    return false;
  }
}

function extractSiteDomain(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();

    if (host.includes('news.google.com')) {
      const q = parsed.searchParams.get('q') || '';
      const match = q.match(/site:([a-z0-9.-]+)/i);
      if (!match) {
        return null;
      }
      return match[1].toLowerCase();
    }

    if (host.includes('bing.com')) {
      const q = parsed.searchParams.get('q') || '';
      const match = q.match(/site:([a-z0-9.-]+)/i);
      if (match) {
        return match[1].toLowerCase();
      }
      return null;
    }

    return null;
  } catch {
    return null;
  }
}

function makeCandidateUrls(domain: string): string[] {
  const urls = new Set<string>();
  const trimmedDomain = domain.replace(/\/+$/, '');
  const hostVariants = new Set<string>([
    trimmedDomain,
    trimmedDomain.startsWith('www.') ? trimmedDomain.slice(4) : `www.${trimmedDomain}`,
  ]);

  for (const variant of hostVariants) {
    const normalized = variant.replace(/^www\./i, '');
    const withWww = `www.${normalized}`;

    for (const prefix of [normalized, withWww]) {
      const base = `https://${prefix}`;
      for (const path of CANDIDATE_PATHS) {
        urls.add(resolveCandidate(base, path));
      }
    }
  }

  // Keep deterministic and narrow for domains that advertise XML index endpoints.
  urls.add(`https://${trimmedDomain}/feed/`);
  urls.add(`https://${trimmedDomain}/rss`);

  return Array.from(urls);
}

function resolveCandidate(base: string, path: string): string {
  if (!path) {
    return base;
  }
  if (path.startsWith('?')) {
    return `${base}/${path}`;
  }
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return `${base}${path}`;
}

async function findFirstWorkingRss(candidates: string[]): Promise<string | null> {
  const trimmed = candidates.slice(0, MAX_ATTEMPTS);

  if (OFFLINE_MODE) {
    return trimmed[0] ?? null;
  }

  for (const candidate of trimmed) {
    if (isLikelyRss(candidate) && (await isGoodFeedUrl(candidate))) {
      return candidate;
    }
  }

  return null;
}

function isLikelyRss(url: string): boolean {
  if (url.endsWith('.xml') || url.includes('/feed') || url.includes('/rss') || url.includes('/atom')) {
    return true;
  }
  return false;
}

async function isGoodFeedUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'PressLab-RSSAtlasMigrator/1.0',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) return false;

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const body = (await response.text()).slice(0, 2000).toLowerCase();
    const xmlDetected = XML_MARKERS.some((marker) => body.includes(marker));

    if (!xmlDetected && !contentType.includes('xml') && !contentType.includes('rss')) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function clampInt(value: string | undefined, min: number, max: number, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < min || parsed > max) {
    return fallback;
  }
  return parsed;
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
