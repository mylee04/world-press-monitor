import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readNewsArticlesRecentCounts } from '../lib/ingestion-store';
import { makeOutletId } from '../lib/outlet-id';
import type { OutletFeed, OutletTier, NewsSection, SourceCategory } from '../lib/types';
import { pickStableOutletBucket } from './ingest-worker-support';

type AtlasCatalog = {
  countries?: AtlasCountry[];
};

type AtlasCountry = {
  name?: string;
  code?: string;
  feeds?: AtlasFeed[];
};

type AtlasFeed = {
  enabled?: boolean;
  name?: string;
  schedulingSource?: string;
  url?: string | null;
  sitemapUrl?: string | null;
  tier?: OutletTier | null;
  category?: string | null;
  language?: string | null;
  sourceType?: 'global' | 'local' | 'portal' | null;
};

type ColdTailChunkResult = {
  index: number;
  outletCount: number;
  outletIds: string[];
  startedAt: string;
  completedAt?: string;
  failedAt?: string;
  exitCode?: number;
};

type ColdTailActiveBucket = {
  bucketIndex: number;
  bucketCount: number;
  totalOutlets: number;
  totalChunks: number;
  nextChunkIndex: number;
  orderedOutletIds: string[];
  startedAt: string;
  updatedAt: string;
  chunkResults: ColdTailChunkResult[];
};

type ColdTailCheckpoint = {
  version: 1;
  updatedAt: string;
  chunkSize: number;
  bucketCount: number;
  nextBucketIndex: number;
  activeBucket: ColdTailActiveBucket | null;
  lastCompletedBucketIndex?: number;
  lastCompletedBucketCompletedAt?: string;
};

const PROJECT_ROOT = process.cwd();
const STATE_DIR = process.env.WPR_STATE_DIR || process.env.WPM_STATE_DIR || resolve(PROJECT_ROOT, '.wpr-state');
const STATE_FILE = resolve(STATE_DIR, 'ingest-cold-tail-state.json');
const LAST_SUCCESS_COMPLETED_FILE = resolve(STATE_DIR, 'ingest-cold-tail-last-success-completed-at-utc');
const LAST_SUCCESS_BUCKET_FILE = resolve(STATE_DIR, 'ingest-cold-tail-last-success-bucket-index');
const ATLAS_PATH = process.env.ATLAS_PATH || resolve(PROJECT_ROOT, 'data/rss-atlas.json');
const HEAD_MIN_ARTICLES = Math.max(1, Number.parseInt(process.env.INGEST_HEAD_MIN_ARTICLES_24H || '75', 10) || 75);
const COLD_MAX_ARTICLES = Math.max(
  0,
  Math.min(HEAD_MIN_ARTICLES - 1, Number.parseInt(process.env.INGEST_COLD_TAIL_MAX_ARTICLES_24H || '9', 10) || 9)
);
const COLD_BUCKET_COUNT = Math.max(
  1,
  Math.min(24, Number.parseInt(process.env.INGEST_COLD_TAIL_ROTATION_HOURS || '12', 10) || 12)
);
const COLD_CHUNK_SIZE = Math.max(
  10,
  Math.min(100, Number.parseInt(process.env.INGEST_COLD_TAIL_CHUNK_SIZE || '40', 10) || 40)
);

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function normalizeCountryName(country: string): string {
  const trimmed = (country || '').trim();
  if (trimmed === 'US') return 'United States';
  return trimmed || 'Global';
}

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

function defaultSection(): NewsSection {
  return 'others';
}

function defaultCategories(): SourceCategory[] {
  return [];
}

function loadAtlasOutlets(): OutletFeed[] {
  const raw = readFileSync(ATLAS_PATH, 'utf8');
  const atlas = JSON.parse(raw) as AtlasCatalog;
  return (Array.isArray(atlas.countries) ? atlas.countries : []).flatMap((country) => {
    const countryName = country.name || country.code || 'Global';
    return (Array.isArray(country.feeds) ? country.feeds : [])
      .filter((feed): feed is AtlasFeed => {
        if (feed.enabled === false) return false;
        const hasRssUrl = typeof feed.url === 'string' && feed.url.trim().length > 0;
        const hasSitemapUrl = typeof feed.sitemapUrl === 'string' && feed.sitemapUrl.trim().length > 0;
        return hasRssUrl || hasSitemapUrl;
      })
      .map((feed) => {
        const name = (feed.name || 'Unknown source').trim() || 'Unknown source';
        const identity =
          (typeof feed.url === 'string' && feed.url.trim().length > 0
            ? feed.url.trim()
            : (typeof feed.sitemapUrl === 'string' && feed.sitemapUrl.trim().length > 0 ? feed.sitemapUrl.trim() : name));
        return {
          id: makeOutletId(countryName, name, identity),
          name,
          schedulingSource: (feed.schedulingSource || '').trim() || undefined,
          tier: feed.tier === 2 || feed.tier === 3 ? feed.tier : 1,
          section: defaultSection(),
          categories: defaultCategories(),
          language: feed.language || undefined,
          sourceType: feed.sourceType || undefined,
          country: countryName,
          rssUrl: typeof feed.url === 'string' && feed.url.trim().length > 0 ? feed.url.trim() : undefined,
          sitemapUrl: typeof feed.sitemapUrl === 'string' && feed.sitemapUrl.trim().length > 0 ? feed.sitemapUrl.trim() : undefined,
          hasExplicitSitemapUrl: typeof feed.sitemapUrl === 'string' && feed.sitemapUrl.trim().length > 0,
        } satisfies OutletFeed;
      });
  });
}

function readCheckpoint(): ColdTailCheckpoint | null {
  if (!existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as ColdTailCheckpoint;
  } catch {
    return null;
  }
}

function writeCheckpoint(checkpoint: ColdTailCheckpoint): void {
  mkdirSync(STATE_DIR, { recursive: true });
  checkpoint.updatedAt = nowIso();
  writeFileSync(STATE_FILE, JSON.stringify(checkpoint, null, 2), 'utf8');
}

function createDefaultCheckpoint(): ColdTailCheckpoint {
  return {
    version: 1,
    updatedAt: nowIso(),
    chunkSize: COLD_CHUNK_SIZE,
    bucketCount: COLD_BUCKET_COUNT,
    nextBucketIndex: 0,
    activeBucket: null,
  };
}

async function loadRankedColdOutlets(): Promise<OutletFeed[]> {
  const allOutlets = loadAtlasOutlets();
  const recentCounts = await readNewsArticlesRecentCounts({
    hours: 24,
    limit: 100000,
  });
  if (recentCounts.storage !== 'postgres') {
    throw new Error(`cold-tail outlet selection unavailable: ${recentCounts.reason || 'storage_unavailable'}`);
  }

  const recentCountByOutlet = new Map<string, number>();
  for (const row of recentCounts.rows) {
    recentCountByOutlet.set(buildSourceCountryKey(row.source, row.country), row.articleCount);
  }

  return allOutlets
    .map((outlet) => ({
      outlet,
      articleCount: recentCountByOutlet.get(buildSourceCountryKey(outlet.schedulingSource || outlet.name, outlet.country)) || 0,
    }))
    .filter((entry) => entry.articleCount <= COLD_MAX_ARTICLES)
    .sort(compareOutletByPriority)
    .map((entry) => entry.outlet);
}

function buildActiveBucket(bucketIndex: number, coldOutlets: OutletFeed[]): ColdTailActiveBucket {
  const bucketedOutlets = pickStableOutletBucket(coldOutlets, COLD_BUCKET_COUNT, bucketIndex)
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id));
  const orderedOutletIds = bucketedOutlets.map((outlet) => outlet.id);
  return {
    bucketIndex,
    bucketCount: COLD_BUCKET_COUNT,
    totalOutlets: orderedOutletIds.length,
    totalChunks: Math.ceil(orderedOutletIds.length / COLD_CHUNK_SIZE),
    nextChunkIndex: 0,
    orderedOutletIds,
    startedAt: nowIso(),
    updatedAt: nowIso(),
    chunkResults: [],
  };
}

function currentChunkOutletIds(activeBucket: ColdTailActiveBucket): string[] {
  const start = activeBucket.nextChunkIndex * COLD_CHUNK_SIZE;
  return activeBucket.orderedOutletIds.slice(start, start + COLD_CHUNK_SIZE);
}

function runColdTailChunk(outletIds: string[]): number {
  const result = spawnSync(
    'bun',
    ['scripts/ingest-worker.ts', '--once', `--outlet-ids=${outletIds.join(',')}`],
    {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        INGEST_INCLUDE_COLD_TAIL_IN_HOURLY: '0',
        INGEST_ARTICLE_TITLE_FALLBACK: '0',
        INGEST_ARTICLE_META_CATEGORY_FALLBACK: '0',
      },
    }
  );
  if (typeof result.status === 'number') return result.status;
  return result.signal ? 1 : 0;
}

function finalizeCompletedBucket(checkpoint: ColdTailCheckpoint, activeBucket: ColdTailActiveBucket): void {
  const completedAt = nowIso();
  checkpoint.lastCompletedBucketIndex = activeBucket.bucketIndex;
  checkpoint.lastCompletedBucketCompletedAt = completedAt;
  checkpoint.nextBucketIndex = (activeBucket.bucketIndex + 1) % Math.max(1, checkpoint.bucketCount);
  checkpoint.activeBucket = null;
  writeFileSync(LAST_SUCCESS_COMPLETED_FILE, `${completedAt}\n`, 'utf8');
  writeFileSync(LAST_SUCCESS_BUCKET_FILE, `${activeBucket.bucketIndex}\n`, 'utf8');
}

async function main(): Promise<void> {
  const checkpoint = readCheckpoint() || createDefaultCheckpoint();
  const chunkSizeChanged = checkpoint.chunkSize !== COLD_CHUNK_SIZE;
  checkpoint.chunkSize = COLD_CHUNK_SIZE;
  checkpoint.bucketCount = COLD_BUCKET_COUNT;

  if (
    checkpoint.activeBucket
    && (checkpoint.activeBucket.bucketCount !== COLD_BUCKET_COUNT || chunkSizeChanged)
  ) {
    checkpoint.activeBucket = null;
  }

  if (!checkpoint.activeBucket) {
    const coldOutlets = await loadRankedColdOutlets();
    const activeBucket = buildActiveBucket(checkpoint.nextBucketIndex, coldOutlets);
    checkpoint.activeBucket = activeBucket;
    writeCheckpoint(checkpoint);
    console.log(
      `[cold-tail] bucket=${activeBucket.bucketIndex + 1}/${COLD_BUCKET_COUNT} total_outlets=${activeBucket.totalOutlets} total_chunks=${activeBucket.totalChunks}`
    );
  }

  if (!checkpoint.activeBucket) {
    return;
  }

  const activeBucket = checkpoint.activeBucket;
  if (activeBucket.nextChunkIndex > 0) {
    console.log(
      `[cold-tail] resuming bucket=${activeBucket.bucketIndex + 1}/${COLD_BUCKET_COUNT} next_chunk=${activeBucket.nextChunkIndex + 1}/${activeBucket.totalChunks}`
    );
  }
  if (activeBucket.totalOutlets === 0 || activeBucket.totalChunks === 0) {
    console.log(`[cold-tail] bucket=${activeBucket.bucketIndex + 1}/${COLD_BUCKET_COUNT} has no outlets; advancing.`);
    finalizeCompletedBucket(checkpoint, activeBucket);
    writeCheckpoint(checkpoint);
    return;
  }

  const outletIds = currentChunkOutletIds(activeBucket);
  if (outletIds.length === 0) {
    console.log(`[cold-tail] bucket=${activeBucket.bucketIndex + 1}/${COLD_BUCKET_COUNT} already exhausted; advancing.`);
    finalizeCompletedBucket(checkpoint, activeBucket);
    writeCheckpoint(checkpoint);
    return;
  }

  const chunkIndex = activeBucket.nextChunkIndex;
  const chunkStartedAt = nowIso();
  const chunkResult: ColdTailChunkResult = {
    index: chunkIndex,
    outletCount: outletIds.length,
    outletIds,
    startedAt: chunkStartedAt,
  };
  activeBucket.chunkResults[chunkIndex] = chunkResult;
  activeBucket.updatedAt = chunkStartedAt;
  writeCheckpoint(checkpoint);

  console.log(
    `[cold-tail] running bucket=${activeBucket.bucketIndex + 1}/${COLD_BUCKET_COUNT} chunk=${chunkIndex + 1}/${activeBucket.totalChunks} outlets=${outletIds.length}`
  );

  const exitCode = runColdTailChunk(outletIds);
  if (exitCode !== 0) {
    chunkResult.failedAt = nowIso();
    chunkResult.exitCode = exitCode;
    activeBucket.updatedAt = chunkResult.failedAt;
    writeCheckpoint(checkpoint);
    throw new Error(`cold-tail chunk failed: bucket=${activeBucket.bucketIndex} chunk=${chunkIndex} exitCode=${exitCode}`);
  }

  chunkResult.completedAt = nowIso();
  chunkResult.exitCode = 0;
  activeBucket.nextChunkIndex += 1;
  activeBucket.updatedAt = chunkResult.completedAt;

  if (activeBucket.nextChunkIndex >= activeBucket.totalChunks) {
    console.log(`[cold-tail] completed bucket=${activeBucket.bucketIndex + 1}/${COLD_BUCKET_COUNT}`);
    finalizeCompletedBucket(checkpoint, activeBucket);
  }

  writeCheckpoint(checkpoint);
}

await main();
