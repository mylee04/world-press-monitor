import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NewsItem, OutletFeed } from '../lib/types';

export type WorkerState = {
  offset: number;
  updatedAt: string;
};

export type BackfillWindow = {
  from: string;
  to: string;
  fromMs: number;
  toExclusiveMs: number;
};

export type MethodStats = Record<'rss' | 'sitemap', { attempted: number; ok: number; fail: number }>;

export function ensureWorkerAuditsDir(cwd: string): void {
  mkdirSync(resolve(cwd, 'audits'), { recursive: true });
}

export function readWorkerState(stateFile: string, totalOutlets: number): WorkerState {
  try {
    const raw = readFileSync(stateFile, 'utf8');
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

export function writeWorkerState(stateFile: string, state: WorkerState, cwd: string): void {
  ensureWorkerAuditsDir(cwd);
  writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
}

export function pickOutletChunk(
  all: OutletFeed[],
  chunkSize: number,
  stateFile: string
): { selected: OutletFeed[]; nextOffset: number; offset: number } {
  if (all.length === 0) return { selected: [], nextOffset: 0, offset: 0 };
  const state = readWorkerState(stateFile, all.length);
  if (chunkSize >= all.length) {
    return { selected: all, nextOffset: 0, offset: 0 };
  }
  const offset = state.offset;
  const selected = Array.from({ length: chunkSize }, (_, i) => all[(offset + i) % all.length]);
  const nextOffset = (offset + selected.length) % all.length;
  return { selected, nextOffset, offset };
}

function stableBucketForValue(value: string, bucketCount: number): number {
  if (bucketCount <= 1) return 0;
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % bucketCount;
}

export function pickStableOutletBucket(
  all: OutletFeed[],
  bucketCount: number,
  bucketIndex: number
): OutletFeed[] {
  if (bucketCount <= 1) return all;
  const normalizedBucketCount = Math.max(1, Math.floor(bucketCount));
  const normalizedBucketIndex = ((Math.floor(bucketIndex) % normalizedBucketCount) + normalizedBucketCount) % normalizedBucketCount;
  return all.filter((outlet) => stableBucketForValue(outlet.id, normalizedBucketCount) === normalizedBucketIndex);
}

export function filterItemsForPersistence(params: {
  items: NewsItem[];
  lastPublicationAt: string | null;
  nowMs: number;
  backfillWindow: BackfillWindow | null;
  ignoreWatermark: boolean;
  maxArticleAgeMs: number;
  parsePublishedAtMs: (value: string) => number | null;
}): NewsItem[] {
  const parsedLastPublicationAt = params.parsePublishedAtMs(params.lastPublicationAt || '');
  const watermarkCutoff = parsedLastPublicationAt == null ? null : parsedLastPublicationAt;
  const ageCutoff = params.nowMs - params.maxArticleAgeMs;
  const finalCutoff = watermarkCutoff === null ? ageCutoff : Math.max(watermarkCutoff, ageCutoff);
  const watermarkFiltered = params.ignoreWatermark
    ? params.items
    : params.items.filter((item) => {
        const publishedAt = params.parsePublishedAtMs(item.publishedAt);
        if (publishedAt === null) return true;
        return publishedAt > finalCutoff;
      });
  if (!params.backfillWindow) return watermarkFiltered;
  return watermarkFiltered.filter((item) => {
    const publishedAt = params.parsePublishedAtMs(item.publishedAt);
    if (publishedAt === null) return false;
    return publishedAt >= params.backfillWindow!.fromMs && publishedAt < params.backfillWindow!.toExclusiveMs;
  });
}

export function buildMethodStats(
  diagnostics: Array<{ attempted: boolean; ok: boolean; method: 'rss' | 'sitemap' }>
): MethodStats {
  return diagnostics.reduce(
    (acc, diagnostic) => {
      if (!diagnostic.attempted) return acc;
      const bucket = acc[diagnostic.method];
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
    }
  );
}

export function formatPercent(numerator: number, denominator: number): string {
  return denominator === 0 ? '0.00' : ((numerator / denominator) * 100).toFixed(2);
}
