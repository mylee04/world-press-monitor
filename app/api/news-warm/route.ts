import { OUTLET_FEEDS } from '@/data/outlets';
import { Redis } from '@upstash/redis';

export const runtime = 'edge';
const LAST_WARM_REDIS_KEY = 'presslab:news_warm_last';

type WarmResult = {
  ok: boolean;
  generatedAt: string;
  elapsedMs: number;
  warm: {
    outlets: number;
    chunkSize: number;
    chunks: number;
    requests: number;
    success: number;
    failed: number;
    totalItems: number;
  };
  results: Array<{ limit: number; chunk: number; ok: boolean; status: number; ms: number; count: number }>;
};

let redisClient: Redis | null = null;
let redisFailed = false;
let lastWarmInMemory: WarmResult | null = null;

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

async function readLastWarm(): Promise<WarmResult | null> {
  if (lastWarmInMemory) return lastWarmInMemory;
  const redis = getRedis();
  if (!redis) return null;
  try {
    const cached = await redis.get<WarmResult>(LAST_WARM_REDIS_KEY);
    if (!cached) return null;
    lastWarmInMemory = cached;
    return cached;
  } catch {
    return null;
  }
}

async function writeLastWarm(payload: WarmResult): Promise<void> {
  lastWarmInMemory = payload;
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(LAST_WARM_REDIS_KEY, payload, { ex: 60 * 60 * 24 });
  } catch {
    // ignore
  }
}

function getWarmOutletIds(): string[] {
  return OUTLET_FEEDS
    .filter((outlet) => outlet.defaultEnabled)
    .map((outlet) => outlet.id);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function warmOne(origin: string, outletIds: string[], limit: number): Promise<{ ok: boolean; status: number; ms: number; count: number }> {
  const started = Date.now();
  const query = new URLSearchParams();
  query.set('outlets', outletIds.join(','));
  query.set('limit', String(limit));
  query.set('mode', 'readonly');
  query.set('runner', 'warm');
  const url = `${origin}/api/news?${query.toString()}`;

  try {
    const response = await fetch(url, { next: { revalidate: 0 } });
    const ms = Date.now() - started;
    if (!response.ok) {
      return { ok: false, status: response.status, ms, count: 0 };
    }
    const json = await response.json() as { count?: number };
    return { ok: true, status: response.status, ms, count: Number(json.count || 0) };
  } catch {
    return { ok: false, status: 0, ms: Date.now() - started, count: 0 };
  }
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const mode = url.searchParams.get('mode') || '';
  if (mode === 'status') {
    const last = await readLastWarm();
    return Response.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      lastWarm: last
    });
  }

  const token = url.searchParams.get('token') || '';
  const expected = process.env.NEWS_WARM_TOKEN || '';

  if (expected && token !== expected) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const origin = `${url.protocol}//${url.host}`;
  const allOutletIds = getWarmOutletIds();
  const chunkSize = Math.max(50, Math.min(150, Number.parseInt(process.env.NEWS_WARM_CHUNK_SIZE || '120', 10) || 120));
  const outletChunks = chunk(allOutletIds, chunkSize);
  const limits = [15000, 6000];
  const results: Array<{ limit: number; chunk: number; ok: boolean; status: number; ms: number; count: number }> = [];
  const started = Date.now();

  for (const limit of limits) {
    for (let i = 0; i < outletChunks.length; i += 1) {
      const warmed = await warmOne(origin, outletChunks[i], limit);
      results.push({
        limit,
        chunk: i + 1,
        ...warmed
      });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.length - okCount;
  const totalItems = results.reduce((acc, row) => acc + row.count, 0);

  const payload: WarmResult = {
    ok: failCount === 0,
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    warm: {
      outlets: allOutletIds.length,
      chunkSize,
      chunks: outletChunks.length,
      requests: results.length,
      success: okCount,
      failed: failCount,
      totalItems
    },
    results
  };

  await writeLastWarm(payload);
  return Response.json(payload);
}
