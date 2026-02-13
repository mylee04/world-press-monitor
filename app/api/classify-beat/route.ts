import { Redis } from '@upstash/redis';
import { classifyBeat } from '@/lib/keyword-classifier';
import type { NewsSection } from '@/lib/types';

export const runtime = 'edge';

const CACHE_TTL_SECONDS = 60 * 60 * 24;

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

async function sha256(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null) as {
    title?: string;
    summary?: string;
    fallbackSection?: NewsSection;
    fallbackBeat?: NewsSection;
  } | null;
  const title = body?.title?.trim();
  const fallbackSection = body?.fallbackSection || body?.fallbackBeat || 'general';
  const summary = body?.summary?.trim();
  const cacheSeed = `${title || ''}|${fallbackSection}|${summary || ''}`;

  if (!title) {
    return Response.json({ error: 'title is required' }, { status: 400 });
  }

  const cacheKey = `presslab:section:${await sha256(cacheSeed.toLowerCase())}`;

  const redis = getRedis();
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return Response.json({ ...cached, cached: true });
      }
    } catch {
      // Ignore cache read failure
    }
  }

  try {
    const finalResult = await classifyBeat({ title, summary, fallbackSection });
    if (redis) {
      try {
        await redis.set(cacheKey, finalResult, { ex: CACHE_TTL_SECONDS });
      } catch {
        // Ignore cache write failure
      }
    }
    return Response.json(finalResult);
  } catch {
    const fallbackResult = await classifyBeat({ title, fallbackSection });
    return Response.json(fallbackResult);
  }
}
