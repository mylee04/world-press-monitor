import { Redis } from '@upstash/redis';
import { classifyBeatByKeyword } from '@/lib/keyword-classifier';
import type { Beat } from '@/lib/types';

export const runtime = 'edge';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
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

function parseBeat(value: string): Beat {
  if (['politics', 'business', 'tech', 'security', 'climate', 'world', 'general'].includes(value)) {
    return value as Beat;
  }
  return 'general';
}

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null) as { title?: string; fallbackBeat?: Beat } | null;
  const title = body?.title?.trim();
  const fallbackBeat = body?.fallbackBeat ?? 'general';

  if (!title) {
    return Response.json({ error: 'title is required' }, { status: 400 });
  }

  const keywordResult = classifyBeatByKeyword(title, fallbackBeat);
  const cacheKey = `presslab:beat:${await sha256(title.toLowerCase())}`;

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

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    return Response.json(keywordResult);
  }

  const prompt = `You classify newsroom headlines into one beat.
Return strict JSON only.
Allowed beats: politics, business, tech, security, climate, world, general.
JSON schema: {"beat":"...","confidence":0.0,"reason":"..."}`;

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        temperature: 0,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: `Headline: ${title}` }
        ],
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      return Response.json(keywordResult);
    }

    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content;
    const parsed = JSON.parse(raw || '{}') as { beat?: string; confidence?: number; reason?: string };

    const llmResult = {
      beat: parseBeat((parsed.beat || '').toLowerCase()),
      confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.6,
      source: 'llm' as const,
      reason: parsed.reason || 'LLM classified headline beat'
    };

    const finalResult = llmResult.confidence > keywordResult.confidence ? llmResult : keywordResult;

    if (redis) {
      try {
        await redis.set(cacheKey, finalResult, { ex: CACHE_TTL_SECONDS });
      } catch {
        // Ignore cache write failure
      }
    }

    return Response.json(finalResult);
  } catch {
    return Response.json(keywordResult);
  }
}
