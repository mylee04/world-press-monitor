import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { isKnownNonArticleUrl } from '../lib/article-url-filters';
import { extractArticlePageTitle } from '../lib/article-page-title';
import { buildArticlePageFetchHeaders } from '../lib/article-page-fetch';
import { parseHtmlCollectionWithStats, parseRssOrAtomWithStats, parseSitemapWithStats } from '../lib/parsers';
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
import { getCanadaSyndicationNetworkByUrl, type CanadaSyndicationNetwork } from '../lib/canada-network-groups';
import { makeOutletId } from '../lib/outlet-id';
import { buildFeedStableId, deriveUrlArticleStableId } from '../lib/pipeline';
import { normalizeLooseDateToIso, parseLooseDateMs } from '../lib/date-parsing';
import {
  buildMethodStats,
  ensureWorkerAuditsDir,
  filterItemsForPersistence,
  pickOutletChunk,
  pickStableOutletBucket,
  pickStableOutletBucketChunkNoWrap,
  readNamedOffsetState,
  writeHybridBucketState,
  writeNamedOffsetState,
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
  readNewsArticlesRecentCounts,
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
const LOOP_INTERVAL_SEC = Math.max(
  60,
  Math.min(3600, Number.parseInt(process.env.INGEST_LOOP_INTERVAL_SEC || '300', 10) || 300)
);
const OUTLET_CHUNK_SIZE = Math.max(
  1,
  Number.parseInt(process.env.INGEST_OUTLET_CHUNK_SIZE || String(Number.MAX_SAFE_INTEGER), 10) || Number.MAX_SAFE_INTEGER
);
const HYBRID_OUTLET_SCHEDULING_ENABLED = parseBoolEnv(process.env.INGEST_HYBRID_OUTLET_SCHEDULING, true);
const HYBRID_HEAD_WINDOW_HOURS = Math.max(
  1,
  Math.min(24 * 7, Number.parseInt(process.env.INGEST_HEAD_WINDOW_HOURS || '24', 10) || 24)
);
const HYBRID_HEAD_MIN_ARTICLES = Math.max(
  1,
  Math.min(10000, Number.parseInt(process.env.INGEST_HEAD_MIN_ARTICLES_24H || '50', 10) || 50)
);
const HYBRID_COLD_TAIL_MAX_ARTICLES = Math.max(
  0,
  Math.min(
    HYBRID_HEAD_MIN_ARTICLES - 1,
    Number.parseInt(process.env.INGEST_COLD_TAIL_MAX_ARTICLES_24H || '9', 10) || 9
  )
);
const HYBRID_COLD_TAIL_ROTATION_HOURS = Math.max(
  1,
  Math.min(24, Number.parseInt(process.env.INGEST_COLD_TAIL_ROTATION_HOURS || '12', 10) || 12)
);
const HYBRID_INCLUDE_COLD_TAIL_IN_HOURLY = parseBoolEnv(process.env.INGEST_INCLUDE_COLD_TAIL_IN_HOURLY, true);
const HYBRID_COLD_TAIL_ONLY = parseBoolEnv(process.env.INGEST_ONLY_COLD_TAIL, false);
const INGEST_TIME_ZONE = process.env.INGEST_TZ || 'America/Chicago';
const HYBRID_HEAD_MAX_OUTLETS = Math.max(
  10,
  Math.min(5000, Number.parseInt(process.env.INGEST_HEAD_MAX_OUTLETS || '5000', 10) || 5000)
);
const HYBRID_LONG_TAIL_TARGET_OUTLETS_PER_RUN = Math.max(
  0,
  Math.min(
    2000,
    Number.parseInt(
      process.env.INGEST_HYBRID_TARGET_LONG_TAIL_OUTLETS
      || process.env.INGEST_HYBRID_MIN_LONG_TAIL_OUTLETS
      || '900',
      10
    ) || 900
  )
);
const ATLAS_PATH = process.env.ATLAS_PATH || resolve(process.cwd(), 'data/rss-atlas.json');
const STATE_FILE = resolve(process.cwd(), 'audits/ingest-worker-state.json');
const SUMMARY_FILE = resolve(process.cwd(), 'audits/ingest-worker-last.json');
const COLD_TAIL_BUCKET_STATE_KEY = `coldTailBucketRotation:${HYBRID_COLD_TAIL_ROTATION_HOURS}`;
const BACKFILL_PROGRESS_CHECKPOINT_FILE = process.env.INGEST_BACKFILL_CHECKPOINT_FILE?.trim() || '';
const BACKFILL_PROGRESS_CHUNK_INDEX = Number.isFinite(Number.parseInt(process.env.INGEST_BACKFILL_CHUNK_INDEX || '', 10))
  ? Number.parseInt(process.env.INGEST_BACKFILL_CHUNK_INDEX || '', 10)
  : null;
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
const MAX_FUTURE_PUBLISHED_AT_MS = 24 * 60 * 60 * 1000;
const ZERO_FUTURE_PUBLISHED_AT_HOSTS = [
  'noordhollandsdagblad.nl',
  'haarlemsdagblad.nl',
  'leidschdagblad.nl',
  'ijmuidercourant.nl',
  'gooieneemlander.nl',
];

type BackfillChunkProgressPatch = {
  totalOutlets?: number;
  totalEndpointRuns?: number;
  completedOutlets?: number;
  completedEndpointRuns?: number;
  lastCompletedOutletId?: string | null;
  createdRows?: number;
  updatedRows?: number;
  persistedRows?: number;
  progressPhase?: 'fetching' | 'persisting' | 'completed';
  progressUpdatedAt?: string;
};

function patchBackfillChunkCheckpoint(patch: BackfillChunkProgressPatch): void {
  if (!BACKFILL_PROGRESS_CHECKPOINT_FILE || BACKFILL_PROGRESS_CHUNK_INDEX === null || BACKFILL_PROGRESS_CHUNK_INDEX < 0) {
    return;
  }

  try {
    const raw = readFileSync(BACKFILL_PROGRESS_CHECKPOINT_FILE, 'utf8');
    const json = JSON.parse(raw) as { updatedAt?: string; chunkResults?: Array<Record<string, unknown>> };
    const chunkResults = Array.isArray(json.chunkResults) ? [...json.chunkResults] : [];
    const currentChunk = chunkResults[BACKFILL_PROGRESS_CHUNK_INDEX] || {};
    chunkResults[BACKFILL_PROGRESS_CHUNK_INDEX] = {
      ...currentChunk,
      ...patch,
      progressUpdatedAt: patch.progressUpdatedAt || new Date().toISOString(),
    };
    writeFileSync(
      BACKFILL_PROGRESS_CHECKPOINT_FILE,
      JSON.stringify(
        {
          ...json,
          updatedAt: new Date().toISOString(),
          chunkResults,
        },
        null,
        2
      ),
      'utf8'
    );
  } catch {
    // best-effort progress reporting only
  }
}

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
const BROWSER_SITEMAP_FALLBACK_DOMAINS = new Set(
  (
    process.env.INGEST_BROWSER_SITEMAP_DOMAINS ||
    'www.ouest-france.fr,www.sudouest.fr,www.challenges.fr,www.firstpost.com,firstpost.com,www.dnaindia.com,dnaindia.com,yourstory.com,www.yourstory.com,www.business-standard.com,business-standard.com,www.news18.com,news18.com,www.ndtv.com,ndtv.com,www.orilliamatters.com,orilliamatters.com,www.collingwoodtoday.ca,collingwoodtoday.ca,www.vancouverisawesome.com,vancouverisawesome.com,www.nsnews.com,nsnews.com,www.richmond-news.com,richmond-news.com,www.princegeorgecitizen.com,princegeorgecitizen.com,www.delta-optimist.com,delta-optimist.com,www.moosejawtoday.com,moosejawtoday.com,www.sasktoday.ca,sasktoday.ca,www.bradfordtoday.ca,bradfordtoday.ca,www.elliotlaketoday.com,elliotlaketoday.com,www.midlandtoday.ca,midlandtoday.ca,www.standaard.be,www.nieuwsblad.be,www.gva.be,www.hbvl.be,www.rtl.be,rtl.be,www.blick.ch,blick.ch,www.pna.gov.ph,pna.gov.ph,businessmirror.com.ph,www.malaya.com.ph,malaya.com.ph,manilastandard.net,www.manilastandard.net,news.abs-cbn.com,www.startribune.com,www.miamiherald.com,www.kansascity.com,www.sacbee.com,www.charlotteobserver.com,www.newsobserver.com,www.star-telegram.com,www.fresnobee.com,www.idahostatesman.com,www.kentucky.com,www.thestate.com,www.thenewstribune.com,www.expressnews.com,www.timesunion.com,www.ctinsider.com,www.sfchronicle.com,www.sfgate.com,www.ctpost.com,www.nhregister.com,www.houstonchronicle.com,www.jpnn.com,jabar.jpnn.com,jatim.jpnn.com,www.tribunnews.com,www.jawapos.com,kumparan.com,mediaindonesia.com,www.pikiran-rakyat.com,www.crimeworld.com,crimeworld.com,www.thesun.ie,thesun.ie,www.thesun.co.uk,thesun.co.uk,www.telegraph.co.uk,telegraph.co.uk,www.tvsarawak.my,tvsarawak.my,www.batamnews.co.id,www.sme.sk,spectator.sme.sk,korzar.sme.sk,kosice.korzar.sme.sk,presov.korzar.sme.sk,mytrencin.sme.sk,myorava.sme.sk,mybystrica.sme.sk,nitra.sme.sk,zilina.sme.sk,myzvolen.sme.sk,myliptov.sme.sk,mytopolcany.sme.sk,mynovohrad.sme.sk,myturiec.sme.sk,mynitra.sme.sk,mytrnava.sme.sk,mykysuce.sme.sk,myzilina.sme.sk,www.liepajniekiem.lv,liepajniekiem.lv,guardian.ng,www.guardian.ng,nairametrics.com,www.nairametrics.com,premiumtimesng.com,www.premiumtimesng.com,www.news247.gr,news247.gr,www.sport24.gr,sport24.gr,www.documentonews.gr,documentonews.gr,www.noordhollandsdagblad.nl,noordhollandsdagblad.nl,www.haarlemsdagblad.nl,haarlemsdagblad.nl,www.leidschdagblad.nl,leidschdagblad.nl,www.ijmuidercourant.nl,ijmuidercourant.nl,www.gooieneemlander.nl,gooieneemlander.nl,www.autoweek.nl,autoweek.nl,www.arabianbusiness.com,arabianbusiness.com,24-horas.mx,www.24-horas.mx'
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
const CANADA_NETWORK_TITLE_DEDUPE_WINDOW_MS = 36 * 60 * 60 * 1000;
const CANADA_NETWORK_TITLE_MIN_LENGTH = 32;
const CANADA_NETWORK_TITLE_MIN_TOKENS = 5;

type AtlasFeed = {
  name: string;
  url: string | null;
  sitemapUrl?: string;
  schedulingSource?: string;
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

type OutletSelectionSummary = {
  mode: 'all' | 'chunk' | 'hybrid';
  reason: string;
  dbBacked: boolean;
  pinnedOutlets: number;
  pinnedReason: string | null;
  headOutlets: number;
  longTailOutlets: number;
  longTailSelected: number;
  coldTailOutlets: number;
  coldTailSelected: number;
  headWindowHours: number | null;
  headMinArticles: number | null;
  headMaxOutlets: number | null;
  rotationHours: number | null;
  rotationBucket: number | null;
  coldTailRotationHours: number | null;
  coldTailRotationBucket: number | null;
  longTailBucketOffset: number | null;
  longTailBucketNextOffset: number | null;
  longTailBucketSize: number | null;
  maxOutletsPerRun: number | null;
  reservedLongTailOutlets: number | null;
  budgetCapped: boolean;
};

function buildSourceCountryKey(source: string, country: string): string {
  return `${normalizeText(source)}::${normalizeText(normalizeCountryName(country))}`;
}

function compareOutletByPriority(
  left: { outlet: OutletFeed; articleCount: number },
  right: { outlet: OutletFeed; articleCount: number }
): number {
  if (right.articleCount !== left.articleCount) return right.articleCount - left.articleCount;
  return left.outlet.country.localeCompare(right.outlet.country) || left.outlet.name.localeCompare(right.outlet.name);
}

function getTimeZoneHourBucket(nowMs: number, timeZone: string, bucketCount: number): number {
  if (bucketCount <= 1) return 0;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hour12: false,
  });
  const rawHour = Number.parseInt(formatter.format(new Date(nowMs)), 10);
  const hour = Number.isFinite(rawHour) ? rawHour : new Date(nowMs).getUTCHours();
  return ((hour % bucketCount) + bucketCount) % bucketCount;
}

async function selectOutletsForRun(
  sourceFilteredOutlets: OutletFeed[],
  nowMs: number
): Promise<{
  selected: OutletFeed[];
  nextOffset: number;
  offset: number;
  selectionSummary: OutletSelectionSummary;
}> {
  const defaultSelection = pickOutletChunk(sourceFilteredOutlets, OUTLET_CHUNK_SIZE, STATE_FILE);
  const defaultMode: OutletSelectionSummary['mode'] = OUTLET_CHUNK_SIZE >= sourceFilteredOutlets.length ? 'all' : 'chunk';
  const defaultSummary: OutletSelectionSummary = {
    mode: defaultMode,
    reason: defaultMode === 'all' ? 'full_scan' : 'stateful_chunk',
    dbBacked: false,
    pinnedOutlets: 0,
    pinnedReason: null,
    headOutlets: 0,
    longTailOutlets: sourceFilteredOutlets.length,
    longTailSelected: defaultSelection.selected.length,
    coldTailOutlets: 0,
    coldTailSelected: 0,
    headWindowHours: null,
    headMinArticles: null,
    headMaxOutlets: null,
    rotationHours: null,
    rotationBucket: null,
    coldTailRotationHours: null,
    coldTailRotationBucket: null,
    longTailBucketOffset: null,
    longTailBucketNextOffset: null,
    longTailBucketSize: null,
    maxOutletsPerRun: null,
    reservedLongTailOutlets: null,
    budgetCapped: false,
  };

  const shouldApplyHybrid =
    HYBRID_OUTLET_SCHEDULING_ENABLED
    && !BACKFILL_WINDOW
    && !COUNTRY_FILTER
    && !SOURCE_FILTER
    && !OUTLET_ID_FILTER
    && defaultMode === 'all';
  if (!shouldApplyHybrid) {
    return { ...defaultSelection, selectionSummary: defaultSummary };
  }

  const recentCounts = await readNewsArticlesRecentCounts({
    hours: HYBRID_HEAD_WINDOW_HOURS,
    limit: 100000,
  });
  if (recentCounts.storage !== 'postgres') {
    return {
      ...defaultSelection,
      selectionSummary: {
        ...defaultSummary,
        reason: `hybrid_skipped_${recentCounts.reason || 'storage_unavailable'}`,
      },
    };
  }

  const recentCountByOutlet = new Map<string, number>();
  for (const row of recentCounts.rows) {
    recentCountByOutlet.set(buildSourceCountryKey(row.source, row.country), row.articleCount);
  }

  const rankedOutlets = sourceFilteredOutlets
    .map((outlet) => ({
      outlet,
      articleCount: recentCountByOutlet.get(buildSourceCountryKey(outlet.schedulingSource || outlet.name, outlet.country)) || 0,
    }))
    .sort(compareOutletByPriority);

  const headCandidates = rankedOutlets.filter((entry) => entry.articleCount >= HYBRID_HEAD_MIN_ARTICLES);
  const coldTailEntries = rankedOutlets.filter((entry) => entry.articleCount <= HYBRID_COLD_TAIL_MAX_ARTICLES);
  const warmLongTailEntries = rankedOutlets.filter(
    (entry) => entry.articleCount < HYBRID_HEAD_MIN_ARTICLES && entry.articleCount > HYBRID_COLD_TAIL_MAX_ARTICLES
  );
  const coldTailOutlets = coldTailEntries.map((entry) => entry.outlet);
  const warmLongTailOutlets = warmLongTailEntries.map((entry) => entry.outlet);
  const selectedHeadOutlets = headCandidates
    .slice(0, HYBRID_HEAD_MAX_OUTLETS)
    .map((entry) => entry.outlet);
  const coldTailBucketIndex = HYBRID_COLD_TAIL_ONLY
    ? readNamedOffsetState(STATE_FILE, COLD_TAIL_BUCKET_STATE_KEY, HYBRID_COLD_TAIL_ROTATION_HOURS).offset
    : getTimeZoneHourBucket(nowMs, INGEST_TIME_ZONE, HYBRID_COLD_TAIL_ROTATION_HOURS);
  const rotatedColdTailOutlets = pickStableOutletBucket(
    coldTailOutlets,
    HYBRID_COLD_TAIL_ROTATION_HOURS,
    coldTailBucketIndex
  );
  const warmLongTailBudget = HYBRID_LONG_TAIL_TARGET_OUTLETS_PER_RUN;
  const longTailSelection = pickStableOutletBucketChunkNoWrap(
    warmLongTailOutlets,
    1,
    0,
    warmLongTailBudget,
    STATE_FILE
  );
  const boundedWarmLongTailOutlets = HYBRID_COLD_TAIL_ONLY ? [] : longTailSelection.selected;
  const selectedColdTailOutlets = HYBRID_COLD_TAIL_ONLY
    ? rotatedColdTailOutlets
    : (HYBRID_INCLUDE_COLD_TAIL_IN_HOURLY ? rotatedColdTailOutlets : []);
  const selectedLongTailOutlets = [...boundedWarmLongTailOutlets, ...selectedColdTailOutlets];
  const longTailCycleHours = boundedWarmLongTailOutlets.length > 0
    ? Math.max(1, Math.ceil(warmLongTailOutlets.length / Math.max(1, warmLongTailBudget || 1)))
    : null;
  const longTailCycleStep = boundedWarmLongTailOutlets.length > 0
    ? Math.floor(longTailSelection.offset / Math.max(1, warmLongTailBudget || 1))
    : null;
  const headOutletIds = new Set(selectedHeadOutlets.map((outlet) => outlet.id));
  const selectedOutletIds = new Set([
    ...headOutletIds,
    ...selectedLongTailOutlets.map((outlet) => outlet.id),
  ]);
  const selected = sourceFilteredOutlets.filter((outlet) => selectedOutletIds.has(outlet.id));
  const selectedLongTailNextOffset = longTailSelection.nextOffset;
  const budgetCapped = selectedHeadOutlets.length < headCandidates.length
    || boundedWarmLongTailOutlets.length < longTailSelection.total;

  return {
    selected,
    offset: longTailSelection.offset,
    nextOffset: selectedLongTailNextOffset,
    selectionSummary: {
      mode: 'hybrid',
      reason: HYBRID_COLD_TAIL_ONLY ? '24h_volume_plus_sequential_cold_tail_rotation_only' : '24h_volume_plus_sequential_long_tail',
      dbBacked: true,
      pinnedOutlets: 0,
      pinnedReason: null,
      headOutlets: HYBRID_COLD_TAIL_ONLY ? 0 : selectedHeadOutlets.length,
      longTailOutlets: HYBRID_COLD_TAIL_ONLY ? 0 : warmLongTailOutlets.length,
      longTailSelected: boundedWarmLongTailOutlets.length,
      coldTailOutlets: coldTailOutlets.length,
      coldTailSelected: selectedColdTailOutlets.length,
      headWindowHours: HYBRID_COLD_TAIL_ONLY ? null : HYBRID_HEAD_WINDOW_HOURS,
      headMinArticles: HYBRID_COLD_TAIL_ONLY ? null : HYBRID_HEAD_MIN_ARTICLES,
      headMaxOutlets: HYBRID_COLD_TAIL_ONLY ? null : HYBRID_HEAD_MAX_OUTLETS,
      rotationHours: longTailCycleHours,
      rotationBucket: longTailCycleStep,
      coldTailRotationHours: HYBRID_COLD_TAIL_ROTATION_HOURS,
      coldTailRotationBucket: coldTailBucketIndex,
      longTailBucketOffset: longTailSelection.offset,
      longTailBucketNextOffset: selectedLongTailNextOffset,
      longTailBucketSize: HYBRID_COLD_TAIL_ONLY ? 0 : longTailSelection.total,
      maxOutletsPerRun: selected.length,
      reservedLongTailOutlets: HYBRID_COLD_TAIL_ONLY ? 0 : HYBRID_LONG_TAIL_TARGET_OUTLETS_PER_RUN,
      budgetCapped: HYBRID_COLD_TAIL_ONLY ? false : budgetCapped,
    },
  };
}

function parsePublishedAtMs(value: string): number | null {
  return parseLooseDateMs(value);
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
          schedulingSource:
            typeof feed.schedulingSource === 'string' && feed.schedulingSource.trim().length > 0
              ? feed.schedulingSource.trim()
              : undefined,
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
            schedulingSource: feed.schedulingSource,
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
  const slashPattern = normalized.match(/(20\d{2})\/([1-9]|0[1-9]|1[0-2])(?:\/([1-9]|0[1-9]|[12]\d|3[01]))?(?=(?:\D|$))/);
  if (slashPattern) {
    const year = Number.parseInt(slashPattern[1] || '0', 10);
    const month = Number.parseInt(slashPattern[2] || '0', 10);
    const day = Number.parseInt(slashPattern[3] || '1', 10);
    const ts = Date.UTC(year, month - 1, day);
    return Number.isFinite(ts) ? ts : null;
  }
  const dashPattern = normalized.match(/(20\d{2})-([1-9]|0[1-9]|1[0-2])(?:-([1-9]|0[1-9]|[12]\d|3[01]))?(?=(?:\D|$))/);
  if (dashPattern) {
    const year = Number.parseInt(dashPattern[1] || '0', 10);
    const month = Number.parseInt(dashPattern[2] || '0', 10);
    const day = Number.parseInt(dashPattern[3] || '1', 10);
    const ts = Date.UTC(year, month - 1, day);
    return Number.isFinite(ts) ? ts : null;
  }

  try {
    const parsedUrl = new URL(normalized);
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
  const normalized = decodeXmlEntities(loc);
  try {
    const parsedUrl = new URL(normalized);
    const fromParam = parsedUrl.searchParams.get('from');
    if (fromParam) {
      const parsedFrom = Number.parseInt(fromParam, 10);
      if (Number.isFinite(parsedFrom)) return -parsedFrom;
    }
    const startParam = parsedUrl.searchParams.get('start');
    if (startParam) {
      const parsedStart = Number.parseInt(startParam, 10);
      if (Number.isFinite(parsedStart)) return -parsedStart;
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

function resolveHostSpecificSitemapItemLimit(baseUrl: string | null | undefined, fallbackLimit: number): number {
  if (!baseUrl) return fallbackLimit;

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

function selectSitemapIndexEntries(entries: SitemapIndexEntry[], baseUrl: string | null): SitemapIndexEntry[] {
  if (entries.length === 0) return [];

  let hostname = '';
  if (baseUrl) {
    try {
      hostname = new URL(baseUrl).hostname.toLowerCase();
    } catch {
      hostname = '';
    }
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
    if (latestArticleChildren.length > 0) {
      return latestArticleChildren.slice(0, Math.min(2, SITEMAP_INDEX_CHILDREN_LIMIT));
    }
  }

  const isZarpanews = hostname === 'www.zarpanews.gr' || hostname === 'zarpanews.gr';
  if (isZarpanews) {
    const postEntries = entries.filter((entry) => /\/post-sitemap\d*\.xml(?:\.gz)?$/i.test(entry.loc));
    if (postEntries.length > 0) {
      return postEntries.slice(0, Math.min(2, SITEMAP_INDEX_CHILDREN_LIMIT));
    }
  }

  const isHeute = hostname === 'www.heute.at' || hostname === 'heute.at';
  if (isHeute) {
    const rollingEntries = entries
      .map((entry) => {
        const match = entry.loc.match(/\/sitemap\/sitemap_(\d+)\.xml$/i);
        return {
          entry,
          numericId: match ? Number.parseInt(match[1] || '-1', 10) : Number.NaN,
        };
      })
      .filter((candidate) => Number.isFinite(candidate.numericId))
      .sort((left, right) => right.numericId - left.numericId)
      .map((candidate) => candidate.entry);
    if (rollingEntries.length > 0) {
      return rollingEntries.slice(0, 1);
    }
  }

  const isRollingSportsSitemap = hostname === 'www.laola1.at'
    || hostname === 'laola1.at'
    || hostname === 'www.90minuten.at'
    || hostname === '90minuten.at';
  if (isRollingSportsSitemap) {
    const rollingEntries = entries
      .map((entry) => {
        const match = entry.loc.match(/\/storage\/sitemap\/\d+\/sitemap_(\d+)\.xml(?:\.gz)?$/i);
        return {
          entry,
          numericId: match ? Number.parseInt(match[1] || '-1', 10) : Number.NaN,
        };
      })
      .filter((candidate) => Number.isFinite(candidate.numericId))
      .sort((left, right) => right.numericId - left.numericId)
      .map((candidate) => candidate.entry);
    if (rollingEntries.length > 0) {
      return rollingEntries.slice(0, Math.min(2, SITEMAP_INDEX_CHILDREN_LIMIT));
    }
  }

  const isRussianRegionalPortal = RUSSIAN_REGIONAL_SITEMAP_HOSTS.has(hostname);
  if (isRussianRegionalPortal) {
    const monthlyArticleEntries = entries.filter((entry) => /\/articles_20\d{2}_\d{2}\.xml(?:\.gz)?$/i.test(entry.loc));
    if (monthlyArticleEntries.length > 0) return monthlyArticleEntries.slice(0, 1);
  }

  const isMendozaPost = hostname === 'www.mendozapost.com' || hostname === 'mendozapost.com';
  if (isMendozaPost) {
    const mendozaLimit = Math.min(4, SITEMAP_INDEX_CHILDREN_LIMIT);
    const contentEntries = entries.filter((entry) => /sitemap-content_/i.test(entry.loc));
    const preferredEntries = contentEntries.length > 0
      ? contentEntries
      : entries.filter((entry) => !/sitemap-(?:tag|author|image|images)_/i.test(entry.loc));
    return (preferredEntries.length > 0 ? preferredEntries : entries).slice(0, mendozaLimit);
  }

  const isRegnumNewsIndex = hostname === 'regnum.ru' && baseUrl ? (() => {
    try {
      return new URL(baseUrl).pathname === '/sitemap/news.xml';
    } catch {
      return false;
    }
  })() : false;
  if (isRegnumNewsIndex) {
    const monthlyEntries = entries.filter((entry) => /\/sitemap\/news\/20\d{2}-\d{2}\.xml$/i.test(entry.loc));
    if (monthlyEntries.length > 0) return monthlyEntries.slice(0, 1);
  }

  const isPulzo = hostname === 'www.pulzo.com' || hostname === 'pulzo.com';
  if (isPulzo) {
    const monthlyEntries = entries
      .filter((entry) => /\/sitemap\/sitemap-pt-post-20\d{2}-\d{2}\.xml$/i.test(entry.loc))
      .sort((left, right) => {
        const leftStamp = left.locDateMs ?? Number.NEGATIVE_INFINITY;
        const rightStamp = right.locDateMs ?? Number.NEGATIVE_INFINITY;
        if (rightStamp !== leftStamp) return rightStamp - leftStamp;
        return right.index - left.index;
      });
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

function resolveSitemapIndexOverrides(baseUrl: string | null): string[] {
  if (!baseUrl) return [];

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

function extractSitemapIndexBodies(xml: string): string[] {
  const strictMatches = [...xml.matchAll(/<sitemap>([\s\S]*?)<\/sitemap>/gi)]
    .map((match) => match[1] || '');
  if (strictMatches.length > 0) return strictMatches;
  return [...xml.matchAll(/<sitemap\b[^>]*>([\s\S]*?)(?=<\/sitemap>|<sitemap\b|$)/gi)]
    .map((match) => match[1] || '');
}

function parseSitemapIndex(xml: string, baseUrl: string | null = null): string[] {
  if (!/<sitemapindex[\s>]/i.test(xml)) return [];
  const overrideChildren = resolveSitemapIndexOverrides(baseUrl);
  if (overrideChildren.length > 0) return overrideChildren;
  const entries = extractSitemapIndexBodies(xml)
    .map((body, index) => {
      const loc = resolveSitemapLoc(body.match(/<loc[^>]*>([\s\S]*?)<\/loc>/i)?.[1]?.trim() || '', baseUrl);
      const lastmodRaw = decodeXmlEntities(body.match(/<lastmod[^>]*>([\s\S]*?)<\/lastmod>/i)?.[1]?.trim() || '');
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

  return selectSitemapIndexEntries(entries, baseUrl).map((entry) => entry.loc);
}

type ParsedSitemapResult = ReturnType<typeof parseSitemapWithStats>;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const INGEST_MAX_ARTICLE_AGE_DAYS = Math.max(1, Math.min(3650, Number.parseInt(process.env.INGEST_MAX_ARTICLE_AGE_DAYS || '365', 10) || 365));
const INGEST_MAX_ARTICLE_AGE_MS = INGEST_MAX_ARTICLE_AGE_DAYS * ONE_DAY_MS;
const HEUTE_SITEMAP_MAX_ARTICLE_AGE_MS = 3 * ONE_DAY_MS;
const ROLLING_SPORTS_SITEMAP_MAX_ARTICLE_AGE_MS = 3 * ONE_DAY_MS;
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

function maxArticleAgeMsForOutlet(outlet: OutletFeed, method: 'rss' | 'sitemap'): number {
  const normalizedSource = outlet.name.trim().toLowerCase();
  if (
    (method === 'rss' && normalizedSource === 'publimetro colombia')
    || normalizedSource === 'pulzo - latest monthly sitemap'
    || (method === 'rss' && normalizedSource === 'pulzo - google news')
  ) {
    return ONE_DAY_MS;
  }
  if (method === 'sitemap' && normalizedSource === 'heute - sitemap index') {
    return HEUTE_SITEMAP_MAX_ARTICLE_AGE_MS;
  }
  if (method === 'sitemap' && (
    normalizedSource === 'laola1 - sitemap index'
    || normalizedSource === '90 minuten - sitemap index'
  )) {
    return ROLLING_SPORTS_SITEMAP_MAX_ARTICLE_AGE_MS;
  }
  return INGEST_MAX_ARTICLE_AGE_MS;
}

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

type OutletIdFilter = {
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

function parseOutletIdFilter(argv: string[], envValue: string | undefined): OutletIdFilter | null {
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
  pushCsv(process.env.INGEST_OUTLET_ID);
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--outlet-ids=')) {
      pushCsv(token.slice('--outlet-ids='.length));
      continue;
    }
    if (token === '--outlet-ids') {
      pushCsv(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token.startsWith('--outlet-id=')) {
      pushCsv(token.slice('--outlet-id='.length));
      continue;
    }
    if (token === '--outlet-id') {
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

function outletIdMatchesFilter(outletId: string | undefined, filter: OutletIdFilter | null): boolean {
  if (!filter) return true;
  return filter.normalized.has(normalizeText(outletId || ''));
}

const OUTLET_ID_FILTER = parseOutletIdFilter(process.argv.slice(2), process.env.INGEST_OUTLET_IDS);

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

function parseIsoTimestamp(raw: string | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed.includes('T')) return null;
  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(trimmed)) return null;
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBackfillBoundary(raw: string | undefined): { fromMs: number; toExclusiveMs: number } | null {
  const dateOnly = parseDateOnlyUtc(raw);
  if (dateOnly !== null) {
    return {
      fromMs: dateOnly,
      toExclusiveMs: dateOnly + ONE_DAY_MS,
    };
  }

  const isoTimestamp = parseIsoTimestamp(raw);
  if (isoTimestamp !== null) {
    return {
      fromMs: isoTimestamp,
      toExclusiveMs: isoTimestamp,
    };
  }

  return null;
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
  const fromBoundary = parseBackfillBoundary(from);
  const toBoundary = parseBackfillBoundary(to);
  if (!fromBoundary || !toBoundary || toBoundary.toExclusiveMs < fromBoundary.fromMs) {
    throw new Error(`Invalid backfill window: from=${from || '-'} to=${to || '-'}`);
  }

  return {
    from,
    to,
    fromMs: fromBoundary.fromMs,
    toExclusiveMs: toBoundary.toExclusiveMs,
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
  const currentPublishedAt = parsePublishedAtMs(current.publishedAt) ?? 0;
  const incomingPublishedAt = parsePublishedAtMs(incoming.publishedAt) ?? 0;
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

type CanadaNetworkCluster = {
  network: CanadaSyndicationNetwork;
  titleFingerprint: string;
  item: NewsItem;
  publishedAtMs: number;
  size: number;
};

function buildCanadaNetworkClusterId(network: CanadaSyndicationNetwork, titleFingerprint: string): string {
  const seed = `${network}:${titleFingerprint}`;
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${network}-${(hash >>> 0).toString(36)}`;
}

function buildCanadaNetworkTitleFingerprint(item: NewsItem): {
  network: CanadaSyndicationNetwork;
  titleFingerprint: string;
  publishedAtMs: number;
} | null {
  const network = getCanadaSyndicationNetworkByUrl(item.link || '');
  if (!network) return null;

  const publishedAtMs = parsePublishedAtMs(item.publishedAt);
  if (publishedAtMs === null) return null;

  const titleFingerprint = normalizeDedupeText(item.title || '');
  if (titleFingerprint.length < CANADA_NETWORK_TITLE_MIN_LENGTH) return null;

  const meaningfulTokens = titleFingerprint.split(' ').filter((token) => token.length >= 3);
  if (meaningfulTokens.length < CANADA_NETWORK_TITLE_MIN_TOKENS) return null;

  return {
    network,
    titleFingerprint,
    publishedAtMs,
  };
}

function collapseCanadaNetworkDuplicates(items: NewsItem[]): NewsItem[] {
  const passthrough: NewsItem[] = [];
  const clustersByKey = new Map<string, CanadaNetworkCluster[]>();
  const sorted = [...items].sort((left, right) => {
    const leftMs = parsePublishedAtMs(left.publishedAt) ?? 0;
    const rightMs = parsePublishedAtMs(right.publishedAt) ?? 0;
    return rightMs - leftMs;
  });

  for (const item of sorted) {
    const fingerprint = buildCanadaNetworkTitleFingerprint(item);
    if (!fingerprint) {
      passthrough.push(item);
      continue;
    }

    const clusterKey = `${fingerprint.network}:${fingerprint.titleFingerprint}`;
    const clusters = clustersByKey.get(clusterKey) || [];
    const matchedCluster = clusters.find(
      (cluster) => Math.abs(cluster.publishedAtMs - fingerprint.publishedAtMs) <= CANADA_NETWORK_TITLE_DEDUPE_WINDOW_MS
    );

    if (!matchedCluster) {
      clusters.push({
        network: fingerprint.network,
        titleFingerprint: fingerprint.titleFingerprint,
        item,
        publishedAtMs: fingerprint.publishedAtMs,
        size: 1,
      });
      clustersByKey.set(clusterKey, clusters);
      continue;
    }

    matchedCluster.item = mergeNewsItems(matchedCluster.item, item);
    matchedCluster.publishedAtMs = parsePublishedAtMs(matchedCluster.item.publishedAt) ?? matchedCluster.publishedAtMs;
    matchedCluster.size += 1;
  }

  const clusteredItems = [...clustersByKey.values()].flatMap((clusters) =>
    clusters.map((cluster) =>
      cluster.size > 1
        ? {
            ...cluster.item,
            clusterId: buildCanadaNetworkClusterId(cluster.network, cluster.titleFingerprint),
            clusterSize: cluster.size,
          }
        : cluster.item
    )
  );

  return [...passthrough, ...clusteredItems];
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
  const sitemapItemLimit = resolveHostSpecificSitemapItemLimit(sitemapUrl, SITEMAP_ITEM_LIMIT);
  const sitemap = parseSitemapWithStats(xml, sitemapItemLimit, sitemapUrl);
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
      const childBody = await readResponseBody(childResponse);
      return await parseSitemapXmlRecursively(childUrl, childBody.body, depth + 1, nextSeen);
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
const ARTICLE_TITLE_FETCH_MAX_PER_RUN = Math.max(
  0,
  Math.min(5000, Number.parseInt(process.env.INGEST_ARTICLE_TITLE_MAX_FETCHES || '200', 10) || 200)
);
const ARTICLE_TITLE_FETCH_MAX_PER_SOURCE = Math.max(
  0,
  Math.min(500, Number.parseInt(process.env.INGEST_ARTICLE_TITLE_MAX_FETCHES_PER_SOURCE || '32', 10) || 32)
);
const ARTICLE_META_CATEGORY_FETCH_MAX_PER_RUN = Math.max(
  0,
  Math.min(5000, Number.parseInt(process.env.INGEST_ARTICLE_META_CATEGORY_MAX_FETCHES || '400', 10) || 400)
);
const ARTICLE_META_CATEGORY_FETCH_MAX_PER_SOURCE = Math.max(
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
      'cls',
      'aamulehti',
      'helsingin sanomat',
      'ilta-sanomat',
      'is.fi',
      'fnn',
      'oricon',
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
const ARTICLE_PAGE_FETCH_TIMEOUT_MS = Math.max(
  ARTICLE_META_CATEGORY_FETCH_TIMEOUT_MS,
  ARTICLE_TITLE_FETCH_TIMEOUT_MS,
  ARTICLE_PUBLISHED_AT_FETCH_TIMEOUT_MS
);
const ARTICLE_PAGE_FETCH_TOTAL_BUDGET_MS = Math.max(
  0,
  Math.min(3_600_000, Number.parseInt(process.env.INGEST_ARTICLE_PAGE_TOTAL_BUDGET_MS || '600000', 10) || 600000)
);

type ArticlePageSignalKey = 'title' | 'publishedAt' | 'metaCategory';
type ArticlePageSignals = {
  title: string;
  publishedAt: string;
  categories: string[];
};
type ArticlePageFallbackRequest = {
  title: boolean;
  publishedAt: boolean;
  metaCategory: boolean;
};
type ArticlePageFallbackSignalStats = {
  requested: number;
  triggered: number;
  fulfilled: number;
  budgetSkipped: number;
};
type ArticlePageFallbackStats = {
  pageFetch: {
    fetchesStarted: number;
    cacheHits: number;
    fetchFailures: number;
    totalElapsedMs: number;
    timeBudgetSkipped: number;
  };
  title: ArticlePageFallbackSignalStats;
  publishedAt: ArticlePageFallbackSignalStats;
  metaCategory: ArticlePageFallbackSignalStats;
};

const EMPTY_ARTICLE_PAGE_SIGNALS: ArticlePageSignals = {
  title: '',
  publishedAt: '',
  categories: [],
};

const articlePageSignalsCache = new Map<string, Promise<ArticlePageSignals>>();
const articleTitleFetchCountsBySource = new Map<string, number>();
const articleMetaCategoryFetchCountsBySource = new Map<string, number>();
const articlePublishedAtFetchCountsBySource = new Map<string, number>();
const articlePageFallbackStats: ArticlePageFallbackStats = {
  pageFetch: {
    fetchesStarted: 0,
    cacheHits: 0,
    fetchFailures: 0,
    totalElapsedMs: 0,
    timeBudgetSkipped: 0,
  },
  title: {
    requested: 0,
    triggered: 0,
    fulfilled: 0,
    budgetSkipped: 0,
  },
  publishedAt: {
    requested: 0,
    triggered: 0,
    fulfilled: 0,
    budgetSkipped: 0,
  },
  metaCategory: {
    requested: 0,
    triggered: 0,
    fulfilled: 0,
    budgetSkipped: 0,
  },
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

const FEED_FETCH_HOSTS_WITH_MINIMAL_HEADERS = new Set(['offnews.bg', 'www.offnews.bg']);

function buildFeedFetchHeaders(requestedUrl: string, referrerUrl?: string): Record<string, string> {
  const headers: Record<string, string> = { ...FEED_FETCH_HEADERS };
  try {
    const target = new URL(requestedUrl);
    if (FEED_FETCH_HOSTS_WITH_MINIMAL_HEADERS.has(target.hostname.toLowerCase())) {
      return {
        Accept: FEED_FETCH_HEADERS.Accept,
        'Accept-Language': FEED_FETCH_HEADERS['Accept-Language'],
        'Cache-Control': FEED_FETCH_HEADERS['Cache-Control'],
        Pragma: FEED_FETCH_HEADERS.Pragma,
      };
    }
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

function buildArticlePageCacheKey(source: string, url: string): string {
  return `${normalizeSourceKey(source)}\n${url.trim()}`;
}

function getArticlePageSignalStats(kind: ArticlePageSignalKey): ArticlePageFallbackSignalStats {
  switch (kind) {
    case 'title':
      return articlePageFallbackStats.title;
    case 'publishedAt':
      return articlePageFallbackStats.publishedAt;
    case 'metaCategory':
      return articlePageFallbackStats.metaCategory;
  }
}

function getArticlePageSourceCountMap(kind: ArticlePageSignalKey): Map<string, number> {
  switch (kind) {
    case 'title':
      return articleTitleFetchCountsBySource;
    case 'publishedAt':
      return articlePublishedAtFetchCountsBySource;
    case 'metaCategory':
      return articleMetaCategoryFetchCountsBySource;
  }
}

function getArticlePageFetchMaxPerRun(kind: ArticlePageSignalKey): number {
  switch (kind) {
    case 'title':
      return ARTICLE_TITLE_FETCH_MAX_PER_RUN;
    case 'publishedAt':
      return ARTICLE_PUBLISHED_AT_FETCH_MAX_PER_RUN;
    case 'metaCategory':
      return ARTICLE_META_CATEGORY_FETCH_MAX_PER_RUN;
  }
}

function getArticlePageFetchMaxPerSource(kind: ArticlePageSignalKey): number {
  switch (kind) {
    case 'title':
      return ARTICLE_TITLE_FETCH_MAX_PER_SOURCE;
    case 'publishedAt':
      return ARTICLE_PUBLISHED_AT_FETCH_MAX_PER_SOURCE;
    case 'metaCategory':
      return ARTICLE_META_CATEGORY_FETCH_MAX_PER_SOURCE;
  }
}

function hasArticlePageRequest(request: ArticlePageFallbackRequest): boolean {
  return request.title || request.publishedAt || request.metaCategory;
}

function recordArticlePageFallbackRequested(request: ArticlePageFallbackRequest): void {
  if (request.title) articlePageFallbackStats.title.requested += 1;
  if (request.publishedAt) articlePageFallbackStats.publishedAt.requested += 1;
  if (request.metaCategory) articlePageFallbackStats.metaCategory.requested += 1;
}

function canTriggerArticlePageFallback(kind: ArticlePageSignalKey, normalizedSource: string): boolean {
  const stats = getArticlePageSignalStats(kind);
  if (stats.triggered >= getArticlePageFetchMaxPerRun(kind)) {
    return false;
  }
  const countsBySource = getArticlePageSourceCountMap(kind);
  const sourceCount = countsBySource.get(normalizedSource) || 0;
  if (sourceCount >= getArticlePageFetchMaxPerSource(kind)) {
    return false;
  }
  return true;
}

function hasArticlePageFetchTimeBudgetRemaining(): boolean {
  return articlePageFallbackStats.pageFetch.totalElapsedMs < ARTICLE_PAGE_FETCH_TOTAL_BUDGET_MS;
}

function authorizeArticlePageFetch(
  source: string,
  request: ArticlePageFallbackRequest
): ArticlePageFallbackRequest {
  const normalizedSource = normalizeSourceKey(source);
  const authorized: ArticlePageFallbackRequest = {
    title: false,
    publishedAt: false,
    metaCategory: false,
  };

  if (!hasArticlePageFetchTimeBudgetRemaining()) {
    articlePageFallbackStats.pageFetch.timeBudgetSkipped += 1;
    if (request.title) articlePageFallbackStats.title.budgetSkipped += 1;
    if (request.publishedAt) articlePageFallbackStats.publishedAt.budgetSkipped += 1;
    if (request.metaCategory) articlePageFallbackStats.metaCategory.budgetSkipped += 1;
    return authorized;
  }

  if (request.publishedAt && canTriggerArticlePageFallback('publishedAt', normalizedSource)) {
    authorized.publishedAt = true;
    articlePageFallbackStats.publishedAt.triggered += 1;
    articlePublishedAtFetchCountsBySource.set(
      normalizedSource,
      (articlePublishedAtFetchCountsBySource.get(normalizedSource) || 0) + 1
    );
  }
  if (request.title && canTriggerArticlePageFallback('title', normalizedSource)) {
    authorized.title = true;
    articlePageFallbackStats.title.triggered += 1;
    articleTitleFetchCountsBySource.set(
      normalizedSource,
      (articleTitleFetchCountsBySource.get(normalizedSource) || 0) + 1
    );
  }
  if (request.metaCategory && canTriggerArticlePageFallback('metaCategory', normalizedSource)) {
    authorized.metaCategory = true;
    articlePageFallbackStats.metaCategory.triggered += 1;
    articleMetaCategoryFetchCountsBySource.set(
      normalizedSource,
      (articleMetaCategoryFetchCountsBySource.get(normalizedSource) || 0) + 1
    );
  }

  if (!hasArticlePageRequest(authorized)) {
    if (request.title) articlePageFallbackStats.title.budgetSkipped += 1;
    if (request.publishedAt) articlePageFallbackStats.publishedAt.budgetSkipped += 1;
    if (request.metaCategory) articlePageFallbackStats.metaCategory.budgetSkipped += 1;
  }

  return authorized;
}

function recordArticlePageFallbackFulfilled(
  request: ArticlePageFallbackRequest,
  signals: ArticlePageSignals
): void {
  if (request.title && signals.title) {
    articlePageFallbackStats.title.fulfilled += 1;
  }
  if (request.publishedAt && signals.publishedAt) {
    articlePageFallbackStats.publishedAt.fulfilled += 1;
  }
  if (request.metaCategory && signals.categories.length > 0) {
    articlePageFallbackStats.metaCategory.fulfilled += 1;
  }
}

function snapshotArticlePageFallbackStats() {
  return {
    pageFetch: {
      ...articlePageFallbackStats.pageFetch,
      averageElapsedMs: articlePageFallbackStats.pageFetch.fetchesStarted > 0
        ? Math.round(articlePageFallbackStats.pageFetch.totalElapsedMs / articlePageFallbackStats.pageFetch.fetchesStarted)
        : 0,
    },
    title: { ...articlePageFallbackStats.title },
    publishedAt: { ...articlePageFallbackStats.publishedAt },
    metaCategory: { ...articlePageFallbackStats.metaCategory },
  };
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
    normalizedSource === 'bernama' ||
    normalizedSource.includes('bernama -') ||
    normalizedSource === '9news' ||
    normalizedSource.includes('dk nyt') ||
    normalizedSource.includes('dk social') ||
    normalizedSource.includes('dk teknik og miljø') ||
    normalizedSource.includes('dk sundhed') ||
    normalizedSource.includes('dk indkøb') ||
    normalizedSource.includes('arn news centre') ||
    normalizedSource.includes('el sol de puebla - local html collection') ||
    normalizedSource.includes('el sol de toluca - local html collection') ||
    normalizedSource.includes('el sol de morelia - local html collection') ||
    normalizedSource.includes('el sol de tijuana - local html collection') ||
    normalizedSource.includes('el occidental - local html collection') ||
    normalizedSource.includes('el sudcaliforniano - local html collection') ||
    normalizedSource.includes('el sol de hermosillo - local html collection') ||
    normalizedSource.includes('el sol de leon - local html collection') ||
    normalizedSource.includes('el sol de san luis - local html collection') ||
    normalizedSource.includes('news.com.au national top news') ||
    normalizedSource.includes('news.com.au finance') ||
    normalizedSource.includes('news.com.au world') ||
    normalizedSource.includes('news.com.au technology') ||
    normalizedSource.includes('news.com.au - sport')
  );
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
      || (hostname === 'oem.com.mx' && /^\/(?:elsoldepuebla|elsoldetoluca|elsoldemorelia|elsoldetijuana|eloccidental|elsudcaliforniano|elsoldehermosillo|elsoldeleon|elsoldesanluis)\/local\/?$/.test(pathname))
      || (hostname === 'www.t13.cl' && pathname === '/lo-ultimo')
      || (hostname === 'www.soychile.cl' && (pathname === '/urljson/noticias' || pathname === '/todas'))
      || ((hostname === 'www.w24.at' || hostname === 'w24.at') && pathname === '/news')
      || (hostname === 'www.yicai.com' && pathname.startsWith('/news'))
      || (hostname === 'www.cls.cn' && pathname.startsWith('/telegraph'))
      || (hostname === 'www.guancha.cn' && pathname.startsWith('/economy'))
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
    || normalizedSource.includes('local html collection')
    || normalizedSource.includes('t13 - lo ultimo html collection')
    || normalizedSource.includes('soychile - todas las noticias html collection')
    || normalizedSource.includes('w24 - news html collection')
    || normalizedSource.includes('yicai - news html collection')
    || normalizedSource.includes('cls - telegraph html collection')
    || normalizedSource.includes('guancha - economy html collection')
  );
}

function normalizePublishedAtCandidate(value: string): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';
  return normalizeLooseDateToIso(trimmed);
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

  // Bernama article pages expose local Malaysia time in day-first format.
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
      || normalizePublishedAtCandidate(raw);
    if (normalized) return normalized;
  }

  return '';
}

async function loadArticlePageSignals(
  source: string,
  url: string,
  request: ArticlePageFallbackRequest
): Promise<ArticlePageSignals> {
  if (!hasArticlePageRequest(request) || !url) {
    return EMPTY_ARTICLE_PAGE_SIGNALS;
  }

  recordArticlePageFallbackRequested(request);

  const cacheKey = buildArticlePageCacheKey(source, url);
  const existing = articlePageSignalsCache.get(cacheKey);
  if (existing) {
    articlePageFallbackStats.pageFetch.cacheHits += 1;
    return existing;
  }

  const authorized = authorizeArticlePageFetch(source, request);
  if (!hasArticlePageRequest(authorized)) {
    return EMPTY_ARTICLE_PAGE_SIGNALS;
  }

  articlePageFallbackStats.pageFetch.fetchesStarted += 1;
  const task = (async (): Promise<ArticlePageSignals> => {
    const startedMs = Date.now();
    try {
      const response = await fetchWithRetry(url, {
        timeoutMs: ARTICLE_PAGE_FETCH_TIMEOUT_MS,
        attempts: 2,
        fetchOptions: {
          headers: buildArticlePageFetchHeaders(url),
          redirect: 'follow',
        },
      });
      if (!response.ok) {
        articlePageFallbackStats.pageFetch.fetchFailures += 1;
        return EMPTY_ARTICLE_PAGE_SIGNALS;
      }
      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (contentType && !contentType.includes('html') && !contentType.includes('xml')) {
        articlePageFallbackStats.pageFetch.fetchFailures += 1;
        return EMPTY_ARTICLE_PAGE_SIGNALS;
      }
      const resolvedUrl = response.url || url;
      const html = (await readResponseText(response, resolvedUrl)).text;
      return {
        title: normalizeReadableArticleTitle(extractArticlePageTitle(html), resolvedUrl, source),
        publishedAt: extractArticlePagePublishedAt(source, html),
        categories: normalizeSourceCategories(extractSourceCategoriesFromArticlePage({ source, html })),
      };
    } catch {
      articlePageFallbackStats.pageFetch.fetchFailures += 1;
      return EMPTY_ARTICLE_PAGE_SIGNALS;
    } finally {
      articlePageFallbackStats.pageFetch.totalElapsedMs += Date.now() - startedMs;
    }
  })();

  articlePageSignalsCache.set(cacheKey, task);
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
  if (!body.trim()) return true;
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
    if (isLikelyXmlPayload(body)) return '';
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
  if (isLikelyXmlPayload(body)) return false;
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
    if (shouldAttemptBrowserSitemapFallback(requestedUrl, null, '')) {
      try {
        const browserResponse = await fetchSitemapWithBrowser(requestedUrl);
        const browserBody = await readResponseBody(browserResponse);
        const browserFailure = describeFeedFailure(browserResponse, browserBody.body);
        return {
          requestedUrl,
          finalUrl: browserResponse.url || requestedUrl,
          contentType: normalizeResponseContentType(browserResponse),
          responseMs: Date.now() - startMs,
          sniffedType: inferResponseSniffType(browserResponse, browserBody.body),
          shouldUseSitemapFallback: shouldRetryWithSitemap(browserResponse, browserBody.body),
          response: browserResponse,
          body: browserBody.body,
          bodyLength: browserBody.bodyLength,
          decodeFailed: browserBody.decodeFailed,
          failureReason: browserFailure || undefined,
          statusCode: browserResponse.status,
        };
      } catch {
        // Keep the original network error details if browser loading also fails.
      }
    }
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
    let response: Response;
    try {
      response = await fetchWithRetry(currentUrl, {
        timeoutMs: FETCH_TIMEOUT_MS,
        fetchOptions: {
          headers: buildFeedFetchHeaders(currentUrl, referrerUrl),
          redirect: 'manual'
        },
        attempts: 1,
        backoffMs: (attempt) => 200 + attempt * 300 + Math.floor(Math.random() * 200),
      });
    } catch (error) {
      if (shouldAttemptBrowserSitemapFallback(currentUrl, null, '')) {
        try {
          return await fetchSitemapWithBrowser(currentUrl);
        } catch {
          // Keep the original network error if browser loading also fails.
        }
      }
      throw error;
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        return response;
      }

      const nextUrl = await resolveRedirectUrl(currentUrl, location);
      await validateFeedUrl(nextUrl);
      if (nextUrl === currentUrl && shouldAttemptBrowserSitemapFallback(currentUrl, response, '')) {
        try {
          return await fetchSitemapWithBrowser(currentUrl);
        } catch {
          // Fall through to the existing redirect handling if browser loading fails.
        }
      }
      redirects += 1;
      if (redirects > FEED_MAX_REDIRECTS) {
        if (shouldAttemptBrowserSitemapFallback(currentUrl, response, '')) {
          try {
            return await fetchSitemapWithBrowser(currentUrl);
          } catch {
            // Keep the original redirect loop failure if browser loading also fails.
          }
        }
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
  return collapseCanadaNetworkDuplicates([...byLink.values()]).sort(
    (a, b) => (parsePublishedAtMs(b.publishedAt) ?? 0) - (parsePublishedAtMs(a.publishedAt) ?? 0)
  );
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
  const articlePageRequest: ArticlePageFallbackRequest = {
    title: shouldFetchArticlePageTitle(outlet.name, row.link || '', row.title || title),
    publishedAt: false,
    metaCategory: false,
  };
  let rawPublishedAt = (row.publishedAt || '').trim();
  if (!rawPublishedAt && shouldFetchArticlePublishedAt(outlet.name, row.link || '')) {
    articlePageRequest.publishedAt = true;
  }
  let sourceCategories = normalizeSourceCategories(row.categories || []);
  if (sourceCategories.length === 0) {
    sourceCategories = inferSourceCategoriesFromUrlPath({
      source: outlet.name,
      url: row.link || '',
    });
  }
  if (shouldFetchArticleMetaCategories(outlet.name, row.link || '', sourceCategories)) {
    articlePageRequest.metaCategory = true;
  }

  const articlePageSignals = hasArticlePageRequest(articlePageRequest)
    ? await loadArticlePageSignals(outlet.name, row.link || '', articlePageRequest)
    : EMPTY_ARTICLE_PAGE_SIGNALS;
  recordArticlePageFallbackFulfilled(articlePageRequest, articlePageSignals);

  if (articlePageRequest.title) {
    titleRepairAttempted = true;
    const pageTitle = articlePageSignals.title;
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
  if (!rawPublishedAt && articlePageRequest.publishedAt) {
    rawPublishedAt = articlePageSignals.publishedAt;
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
  if (articlePageRequest.metaCategory) {
    const pageCategories = articlePageSignals.categories;
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
  const publishedAtMs = parsePublishedAtMs(publishedAt);
  if (publishedAtMs === null) {
    return null;
  }
  if (publishedAtMs > Date.now() + maxFuturePublishedAtMsForUrl(row.link || '')) {
    return null;
  }
  const stableId =
    buildFeedStableId(row.stableId || '', row.link || '')
    || deriveUrlArticleStableId(row.link || '')
    || undefined;
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
    const hasUsableXmlPayload = Boolean(feedResult.response && isLikelyXmlPayload(feedResult.body));
    const supportsHtmlCollection =
      Boolean(feedResult.response)
      && isLikelyHtmlResponse(feedResult.response as Response, feedResult.body)
      && shouldAttemptHtmlCollectionFeed(outlet.name, feedResult.finalUrl || outlet.rssUrl);
    if (!feedResult.response || (feedResult.failureReason && !supportsHtmlCollection) || (!feedResult.response.ok && !hasUsableXmlPayload)) {
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
    const parsed = (
      isLikelyHtmlResponse(feedResult.response, xml) &&
      shouldAttemptHtmlCollectionFeed(outlet.name, feedResult.finalUrl || outlet.rssUrl)
    )
      ? parseHtmlCollectionWithStats(xml, RSS_ITEM_LIMIT, feedResult.finalUrl || outlet.rssUrl)
      : parseRssOrAtomWithStats(xml, RSS_ITEM_LIMIT);
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
  const scopedOutlets = sourceFilteredOutlets.filter((outlet) => outletIdMatchesFilter(outlet.id, OUTLET_ID_FILTER));
  const { selected, nextOffset, offset, selectionSummary } = await selectOutletsForRun(scopedOutlets, nowMs);
  const { endpointLookup, dedupedEndpoints, rssEndpoints, allSitemapEndpoints } = buildEndpointRuns(
    selected,
    methodMatchesFilter,
    METHOD_FILTER
  );
  const remainingEndpointsByOutlet = new Map<string, number>();
  for (const endpoint of dedupedEndpoints) {
    remainingEndpointsByOutlet.set(endpoint.outlet.id, (remainingEndpointsByOutlet.get(endpoint.outlet.id) || 0) + 1);
  }
  let completedEndpointRuns = 0;
  let completedOutlets = 0;
  patchBackfillChunkCheckpoint({
    totalOutlets: selected.length,
    totalEndpointRuns: dedupedEndpoints.length,
    completedOutlets: 0,
    completedEndpointRuns: 0,
    progressPhase: 'fetching',
    progressUpdatedAt: new Date().toISOString(),
  });

  const markEndpointCompleted = (outletId: string): void => {
    completedEndpointRuns += 1;
    const currentRemaining = remainingEndpointsByOutlet.get(outletId) || 0;
    const nextRemaining = Math.max(0, currentRemaining - 1);
    if (nextRemaining === 0) {
      remainingEndpointsByOutlet.delete(outletId);
      completedOutlets += 1;
      patchBackfillChunkCheckpoint({
        completedOutlets,
        completedEndpointRuns,
        lastCompletedOutletId: outletId,
        progressPhase: 'fetching',
        progressUpdatedAt: new Date().toISOString(),
      });
      return;
    }
    remainingEndpointsByOutlet.set(outletId, nextRemaining);
    patchBackfillChunkCheckpoint({
      completedOutlets,
      completedEndpointRuns,
      progressPhase: 'fetching',
      progressUpdatedAt: new Date().toISOString(),
    });
  };
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
    try {
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
          maxArticleAgeMs: maxArticleAgeMsForOutlet(endpoint.outlet, 'rss'),
          parsePublishedAtMs,
        }),
      };
    } finally {
      markEndpointCompleted(endpoint.outlet.id);
    }
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
    try {
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
          maxArticleAgeMs: maxArticleAgeMsForOutlet(endpoint.outlet, 'sitemap'),
          parsePublishedAtMs,
        }),
      };
    } finally {
      markEndpointCompleted(endpoint.outlet.id);
    }
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
  patchBackfillChunkCheckpoint({
    completedOutlets: selected.length,
    completedEndpointRuns: dedupedEndpoints.length,
    progressPhase: 'persisting',
    progressUpdatedAt: new Date().toISOString(),
  });
  const persistedNewsArticles = await persistNewsArticles(merged);
  patchBackfillChunkCheckpoint({
    persistedRows: persistedNewsArticles.persisted,
    createdRows: persistedNewsArticles.inserted,
    updatedRows: persistedNewsArticles.updated,
    progressPhase: 'persisting',
    progressUpdatedAt: new Date().toISOString(),
  });
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
  const articlePageFallbackSummary = snapshotArticlePageFallbackStats();
  const summary = buildWorkerSummary({
    started,
    allOutletsCount: allOutlets.length,
    countryFilteredOutletsCount: countryFilteredOutlets.length,
    sourceFilteredOutletsCount: scopedOutlets.length,
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
    articlePageFallbackSummary,
    selectionSummary,
  });

  writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2), 'utf8');
  if (!BACKFILL_WINDOW && selectionSummary.mode === 'chunk') {
    writeWorkerState(STATE_FILE, { offset: nextOffset, updatedAt: summary.generatedAt }, process.cwd());
  }
  if (
    !BACKFILL_WINDOW
    && selectionSummary.mode === 'hybrid'
    && selectionSummary.rotationHours
    && selectionSummary.rotationBucket !== null
  ) {
    const usesSequentialLongTailRotation = selectionSummary.reason === '24h_volume_plus_sequential_long_tail';
    writeHybridBucketState(
      STATE_FILE,
      usesSequentialLongTailRotation ? 1 : selectionSummary.rotationHours,
      usesSequentialLongTailRotation ? 0 : selectionSummary.rotationBucket,
      nextOffset,
      summary.generatedAt,
      process.cwd()
    );
  }
  if (
    !BACKFILL_WINDOW
    && selectionSummary.mode === 'hybrid'
    && HYBRID_COLD_TAIL_ONLY
    && selectionSummary.coldTailOutlets > 0
    && selectionSummary.coldTailRotationHours
    && selectionSummary.coldTailRotationBucket !== null
  ) {
    const nextColdTailRotationBucket =
      (selectionSummary.coldTailRotationBucket + 1) % Math.max(1, selectionSummary.coldTailRotationHours);
    writeNamedOffsetState(
      STATE_FILE,
      COLD_TAIL_BUCKET_STATE_KEY,
      nextColdTailRotationBucket,
      summary.generatedAt,
      process.cwd()
    );
  }
  console.log(formatWorkerSummaryLog({
    selectedCount: selected.length,
    countryFilteredOutletsCount: countryFilteredOutlets.length,
    sourceFilteredOutletsCount: scopedOutlets.length,
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
    articlePageFallbackSummary,
    selectionSummary,
    methodStats,
    mergedCount: merged.length,
    persistedArticles: persistedNewsArticles.persisted,
    elapsedMs: summary.elapsedMs,
    missingPublishedAtPersisted: persistedMissingPublishedAt.persisted,
    mergedItemsBySource: summary.worker.mergedItemsBySource,
  }));
  patchBackfillChunkCheckpoint({
    completedOutlets: selected.length,
    completedEndpointRuns: dedupedEndpoints.length,
    persistedRows: persistedNewsArticles.persisted,
    createdRows: persistedNewsArticles.inserted,
    updatedRows: persistedNewsArticles.updated,
    progressPhase: 'completed',
    progressUpdatedAt: new Date().toISOString(),
  });
}

async function main(): Promise<void> {
  const once = process.argv.includes('--once');
  if (COUNTRY_FILTER) {
    console.log(`[ingest-worker] country filter enabled: ${COUNTRY_FILTER.display.join(', ')}`);
  }
  if (SOURCE_FILTER) {
    console.log(`[ingest-worker] source filter enabled: ${SOURCE_FILTER.display.join(', ')}`);
  }
  if (OUTLET_ID_FILTER) {
    console.log(`[ingest-worker] outlet id filter enabled: ${OUTLET_ID_FILTER.display.length} ids`);
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
