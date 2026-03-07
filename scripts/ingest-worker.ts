import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { parseRssOrAtomWithStats, parseSitemapWithStats } from '../lib/parsers';
import { runWithConcurrency } from '../lib/concurrency';
import { fetchWithRetry } from '../lib/fetch-utils';
import { classifySection } from '../lib/keyword-classifier';
import { inferGeoFromTitle } from '../lib/geo';
import {
  readFailingEndpointBackoff,
  readIngestionFeedWatermarks,
  readSitemapPolicyStates,
  persistNewsArticles,
  persistMissingPublishedAtCandidates,
  persistIngestionDiagnostics,
  upsertSitemapPolicyStates,
  upsertIngestionFeedWatermarks,
  type EndpointBackoffRow,
  type IngestionEndpointRun,
  type MissingPublishedAtCandidate,
  type SitemapPolicyState,
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
      .filter((feed): feed is AtlasFeed => feed.url !== null && typeof feed.url === 'string' && feed.url.trim().length > 0 && feed.enabled !== false)
      .map((feed) => ({
        name: feed.name || 'Unknown source',
        url: typeof feed.url === 'string' ? feed.url.trim() : '',
        explicitSitemapUrl:
          typeof feed.sitemapUrl === 'string' && feed.sitemapUrl.trim().length > 0
            ? feed.sitemapUrl.trim()
            : undefined,
      }))
        .map((feed) => ({
          id: makeOutletId(countryName, feed.name, feed.url),
          name: feed.name,
          tier: 1 as OutletTier,
          section: 'others',
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

function inferResponseSniffType(response: Response | null, body: string): string {
  if (!response) return 'fetch_failed';
  const contentType = normalizeResponseContentType(response);
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
    const primary = await fetchWithRetryFeed(requestedUrl);
    const primaryBody = await readResponseBody(primary);
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

async function fetchWithRetryFeed(url: string): Promise<Response> {
  await validateFeedUrl(url);

  let currentUrl = url;
  let redirects = 0;

  while (true) {
    const response = await fetchWithRetry(currentUrl, {
      timeoutMs: FETCH_TIMEOUT_MS,
      fetchOptions: {
        headers: FEED_FETCH_HEADERS,
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

    return response;
  }
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
  row: { title: string; description?: string; link: string; publishedAt?: string; categories?: string[] },
  fallbackPublishedAt: string,
  method: 'rss' | 'sitemap',
  onMissingPublishedAtCandidate?: MissingPublishedAtCollector
): Promise<NewsItem | null> {
  const rawPublishedAt = (row.publishedAt || '').trim();
  if (!rawPublishedAt && DROP_ITEMS_WITHOUT_PUBLISHED_AT) {
    onMissingPublishedAtCandidate?.({
      outletId: outlet.id,
      source: outlet.name,
      country: normalizeCountryName(outlet.country),
      method,
      link: row.link,
      title: row.title,
      description: row.description || null,
      language: outlet.language || 'en',
      section: outlet.section || 'others',
      categories: row.categories || [],
    });
    return null;
  }
  const normalizedCountry = normalizeCountryName(outlet.country);
  const geo = inferGeoFromTitle(row.title, normalizedCountry);
  const fallbackSection = outlet.section || 'others';
  const classification = await classifySection({
    title: row.title,
    summary: row.description,
    fallbackSection,
    feedCategories: row.categories || []
  });
  const section = classification.section;
  const isFallbackPublishedAt = !rawPublishedAt;
  const publishedAt = rawPublishedAt || fallbackPublishedAt;
  if (parsePublishedAtMs(publishedAt) === null) {
    return null;
  }
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
    publishedAt,
    publishedAtIsFallback: isFallbackPublishedAt,
    section,
    confidence: classification.confidence,
    classificationSource: classification.source,
    classificationReason: classification.reason,
    publicationSource: 'feed',
    summarySource: row.description ? 'feed' : undefined,
    ...geo,
  });
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
          const mappedItems = await Promise.all(
            sitemapParsed.items.map((row) =>
              toNewsItem(outlet, row, options.fallbackPublishedAt, 'sitemap', options.onMissingPublishedAtCandidate)
            )
          );
          const items = mappedItems.filter((item): item is NewsItem => item !== null);
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

    const mappedItems = await Promise.all(
      parsed.items.map((row) => toNewsItem(outlet, row, options.fallbackPublishedAt, 'rss', options.onMissingPublishedAtCandidate))
    );
    const items = mappedItems.filter((item): item is NewsItem => item !== null);
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
    const responseStartMs = Date.now();
    const response = await fetchWithRetryFeed(outlet.sitemapUrl);
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
          requestedUrl: outlet.sitemapUrl,
          finalUrl: response.url || outlet.sitemapUrl,
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
            stats: childStats,
          };
        }
      }
    }

    if (parsed.stats.validCount === 0) {
      const parsedFailure = classifyParsedFeedFailure({
        response,
        body: xml,
        bodyLength: responseBody.bodyLength,
        decodeFailed: responseBody.decodeFailed,
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
          requestedUrl: outlet.sitemapUrl,
          finalUrl: response.url || outlet.sitemapUrl,
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

    const mappedItems = await Promise.all(
      parsed.items.map((row) => toNewsItem(outlet, row, fallbackPublishedAt, 'sitemap', onMissingPublishedAtCandidate))
    );
    const items = mappedItems.filter((item): item is NewsItem => item !== null);
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
        requestedUrl: outlet.sitemapUrl,
        finalUrl: response.url || outlet.sitemapUrl,
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
          requestedUrl: outlet.sitemapUrl,
          finalUrl: outlet.sitemapUrl,
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

function filterItemsByWatermark(
  items: NewsItem[],
  lastPublicationAt: string | null,
  nowMs: number
): NewsItem[] {
  const parsedLastPublicationAt = parsePublishedAtMs(lastPublicationAt || '');
  const watermarkCutoff = parsedLastPublicationAt == null ? null : parsedLastPublicationAt;
  const ageCutoff = nowMs - INGEST_MAX_ARTICLE_AGE_MS;
  const finalCutoff = watermarkCutoff === null ? ageCutoff : Math.max(watermarkCutoff, ageCutoff);
  return items.filter((item) => {
    const publishedAt = parsePublishedAtMs(item.publishedAt);
    if (publishedAt === null) return true;
    return publishedAt > finalCutoff;
  });
}

async function runOnce(): Promise<void> {
  const started = Date.now();
  ensureAuditsDir();
  const fallbackPublishedAt = buildMissingPublishedAtFallback(started);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const allOutlets = loadAtlasOutlets();
  const countryFilteredOutlets = allOutlets.filter((outlet) => countryMatchesFilter(outlet.country, COUNTRY_FILTER));
  const { selected, nextOffset, offset } = pickOutletChunk(countryFilteredOutlets, OUTLET_CHUNK_SIZE);
  const endpointLookup = new Map<string, EndpointRun>();
  const allEndpoints: EndpointRun[] = selected.flatMap((outlet) => {
    const runs: EndpointRun[] = [];
    if (outlet.rssUrl) runs.push({ outlet, method: 'rss', url: outlet.rssUrl });
    if (outlet.sitemapUrl) runs.push({ outlet, method: 'sitemap', url: outlet.sitemapUrl });
    return runs;
  });
  for (const endpoint of allEndpoints) {
    const endpointKey = `${endpoint.outlet.id}:${endpoint.method}`;
    endpointLookup.set(endpointKey, endpoint);
  }
  const dedupedEndpoints = [...endpointLookup.values()];
  const rssEndpoints = dedupedEndpoints.filter((endpoint) => endpoint.method === 'rss');
  const allSitemapEndpoints = dedupedEndpoints.filter((endpoint) => endpoint.method === 'sitemap');
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
  const failingKeys = new Set(failingBackoff.rows.map((row) => `${row.outletId}:${row.method}`));
  const disableSitemapBackoff = SITEMAP_DISABLE_ENABLED
    ? await readFailingEndpointBackoff({
        runner: 'worker',
        windowMinutes: SITEMAP_DISABLE_WINDOW_MINUTES,
        minAttempts: SITEMAP_DISABLE_MIN_ATTEMPTS,
        minFailPct: SITEMAP_DISABLE_MIN_FAIL_PCT,
        limit: 5000,
      })
    : { rows: [] as EndpointBackoffRow[] };
  const disabledSitemapOutletIds = SITEMAP_DISABLE_ENABLED
    ? new Set(
        disableSitemapBackoff.rows
          .filter((row) => row.method === 'rss')
          .filter((row) => row.attempted >= SITEMAP_DISABLE_MIN_ATTEMPTS && row.failPct >= SITEMAP_DISABLE_MIN_FAIL_PCT)
          .map((row) => row.outletId),
      )
    : new Set<string>();

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
    return { ...result, items: filterItemsByWatermark(result.items, lastPublicationAt, nowMs) };
  });

  const failedRssResultByOutlet = new Map<string, EndpointResult>();
  for (const result of rssResults) {
    if (result.run.method !== 'rss' || !result.run.attempted || result.run.ok) continue;
    failedRssResultByOutlet.set(result.run.outletId, result);
  }

  const sitemapEndpoints = allSitemapEndpoints.filter((endpoint) => failedRssResultByOutlet.has(endpoint.outlet.id));

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
    if (isSitemapPolicyBlocked(policyState, nowMs)) {
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
    return { ...result, items: filterItemsByWatermark(result.items, lastPublicationAt, nowMs) };
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

  const methodStats = diagnostics.reduce(
    (acc, diagnostic) => {
      if (!diagnostic.attempted) return acc;
      const method = diagnostic.method as 'rss' | 'sitemap';
      const bucket = acc[method];
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

  const okEndpoints = diagnostics.filter((d) => d.attempted && d.ok).length;
  const failedEndpoints = diagnostics.filter((d) => d.attempted && !d.ok).length;
  const attempted = diagnostics.filter((d) => d.attempted).length;
  const summary = {
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    worker: {
      outletsTotal: allOutlets.length,
      outletsAfterCountryFilter: countryFilteredOutlets.length,
      outletsSelected: selected.length,
      outletOffset: offset,
      nextOutletOffset: nextOffset,
      countryFilter: COUNTRY_FILTER?.display || null,
      endpointsAttempted: attempted,
      endpointsOk: okEndpoints,
      endpointsFailed: failedEndpoints,
      endpointFailureRate: attempted > 0 ? failedEndpoints / attempted : 0,
      uniqueItems: merged.length,
      persisted: persistedNewsArticles.persisted,
      newsArticlesPersisted: persistedNewsArticles.persisted,
      missingPublishedAtPersisted: persistedMissingPublishedAt.persisted,
      diagnosticsPersisted: persistedDiag.persisted,
      fallback: fallbackSummary,
    },
  };

  writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2), 'utf8');
  writeState({ offset: nextOffset, updatedAt: summary.generatedAt });
  console.log(
    `[ingest-worker] outlets=${selected.length}/${countryFilteredOutlets.length}/${allOutlets.length} endpoints=${attempted} ok=${okEndpoints} failed=${failedEndpoints} ` +
    `country_filter=${COUNTRY_FILTER ? COUNTRY_FILTER.display.join('|') : 'ALL'} ` +
    `backoff_skipped_total=${failingKeys.size} backoff_skipped=[rss=${fallbackSummary.rssBackoffSkipped}, sitemap=${fallbackSummary.sitemapBackoffSkipped}] ` +
    `sitemap_policy_disabled=${fallbackSummary.sitemapPolicyDisabled} ` +
    `method_stats= [rss attempted=${methodStats.rss.attempted}, ok=${methodStats.rss.ok}, fail=${methodStats.rss.fail}(${percent(methodStats.rss.fail, methodStats.rss.attempted)}%); ` +
    `[sitemap attempted=${methodStats.sitemap.attempted}, ok=${methodStats.sitemap.ok}, fail=${methodStats.sitemap.fail}(${percent(methodStats.sitemap.fail, methodStats.sitemap.attempted)}%)] ` +
    `sitemapFallback=${fallbackSummary.rssSitemapFallbackSuccess}/${fallbackSummary.rssSitemapFallbackAttempts} skipped=${fallbackSummary.rssSitemapFallbackSkipped} unique=${merged.length} persisted=${persistedNewsArticles.persisted} newsArticles=${persistedNewsArticles.persisted} elapsedMs=${summary.elapsedMs}`
    + ` missingPublishedAtPersisted=${persistedMissingPublishedAt.persisted}`
  );
}

async function main(): Promise<void> {
  const once = process.argv.includes('--once');
  if (COUNTRY_FILTER) {
    console.log(`[ingest-worker] country filter enabled: ${COUNTRY_FILTER.display.join(', ')}`);
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
