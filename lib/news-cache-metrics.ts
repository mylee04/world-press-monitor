import { Redis } from '@upstash/redis';

export interface NewsCacheMetrics {
  startedAt: string;
  updatedAt: string;
  requests: number;
  hits: {
    memory: number;
    redis: number;
  };
  misses: {
    memoryExpiredOrMissing: number;
    redisMissing: number;
    noRedisConfigured: number;
  };
  writes: {
    memory: number;
    redis: number;
    redisSkippedPayloadTooLarge: number;
    redisSkippedNoRedis: number;
    redisFailed: number;
  };
}

const nowIso = (): string => new Date().toISOString();
const REDIS_KEY = 'presslab:news_cache_metrics';

const metrics: NewsCacheMetrics = {
  startedAt: nowIso(),
  updatedAt: nowIso(),
  requests: 0,
  hits: {
    memory: 0,
    redis: 0,
  },
  misses: {
    memoryExpiredOrMissing: 0,
    redisMissing: 0,
    noRedisConfigured: 0,
  },
  writes: {
    memory: 0,
    redis: 0,
    redisSkippedPayloadTooLarge: 0,
    redisSkippedNoRedis: 0,
    redisFailed: 0,
  }
};

function touch(): void {
  metrics.updatedAt = nowIso();
}

let redisClient: Redis | null = null;
let redisFailed = false;

function getRedis(): Redis | null {
  if (redisClient) return redisClient;
  if (redisFailed) return null;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    redisClient = new Redis({ url, token });
    return redisClient;
  } catch {
    redisFailed = true;
    return null;
  }
}

function trackRedisIncrement(field: string): void {
  const redis = getRedis();
  if (!redis) return;
  void (async () => {
    try {
      await redis.hincrby(REDIS_KEY, field, 1);
      await redis.hsetnx(REDIS_KEY, 'startedAt', metrics.startedAt);
      await redis.hset(REDIS_KEY, { updatedAt: nowIso() });
    } catch {
      // Ignore metrics redis failures
    }
  })();
}

export function newsCacheMetricRequest(): void {
  metrics.requests += 1;
  touch();
  trackRedisIncrement('requests');
}

export function newsCacheMetricHitMemory(): void {
  metrics.hits.memory += 1;
  touch();
  trackRedisIncrement('hits.memory');
}

export function newsCacheMetricHitRedis(): void {
  metrics.hits.redis += 1;
  touch();
  trackRedisIncrement('hits.redis');
}

export function newsCacheMetricMissMemory(): void {
  metrics.misses.memoryExpiredOrMissing += 1;
  touch();
  trackRedisIncrement('misses.memoryExpiredOrMissing');
}

export function newsCacheMetricMissRedis(): void {
  metrics.misses.redisMissing += 1;
  touch();
  trackRedisIncrement('misses.redisMissing');
}

export function newsCacheMetricMissNoRedis(): void {
  metrics.misses.noRedisConfigured += 1;
  touch();
  trackRedisIncrement('misses.noRedisConfigured');
}

export function newsCacheMetricWriteMemory(): void {
  metrics.writes.memory += 1;
  touch();
  trackRedisIncrement('writes.memory');
}

export function newsCacheMetricWriteRedis(): void {
  metrics.writes.redis += 1;
  touch();
  trackRedisIncrement('writes.redis');
}

export function newsCacheMetricSkipRedisPayloadTooLarge(): void {
  metrics.writes.redisSkippedPayloadTooLarge += 1;
  touch();
  trackRedisIncrement('writes.redisSkippedPayloadTooLarge');
}

export function newsCacheMetricSkipRedisNoRedis(): void {
  metrics.writes.redisSkippedNoRedis += 1;
  touch();
  trackRedisIncrement('writes.redisSkippedNoRedis');
}

export function newsCacheMetricWriteRedisFailed(): void {
  metrics.writes.redisFailed += 1;
  touch();
  trackRedisIncrement('writes.redisFailed');
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export async function getNewsCacheMetrics(): Promise<NewsCacheMetrics> {
  const redis = getRedis();
  if (!redis) return metrics;
  try {
    const h = await redis.hgetall<Record<string, string | number>>(REDIS_KEY);
    if (!h || Object.keys(h).length === 0) return metrics;
    return {
      startedAt: typeof h.startedAt === 'string' ? h.startedAt : metrics.startedAt,
      updatedAt: typeof h.updatedAt === 'string' ? h.updatedAt : metrics.updatedAt,
      requests: toNumber(h.requests),
      hits: {
        memory: toNumber(h['hits.memory']),
        redis: toNumber(h['hits.redis']),
      },
      misses: {
        memoryExpiredOrMissing: toNumber(h['misses.memoryExpiredOrMissing']),
        redisMissing: toNumber(h['misses.redisMissing']),
        noRedisConfigured: toNumber(h['misses.noRedisConfigured']),
      },
      writes: {
        memory: toNumber(h['writes.memory']),
        redis: toNumber(h['writes.redis']),
        redisSkippedPayloadTooLarge: toNumber(h['writes.redisSkippedPayloadTooLarge']),
        redisSkippedNoRedis: toNumber(h['writes.redisSkippedNoRedis']),
        redisFailed: toNumber(h['writes.redisFailed']),
      }
    };
  } catch {
    return metrics;
  }
}

export function getNewsCacheMetricsSync(): NewsCacheMetrics {
  return metrics;
}
