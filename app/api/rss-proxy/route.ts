import { isAllowedUrl } from '@/lib/allowlist';

export const runtime = 'edge';

async function fetchWithTimeout(url: string, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 PressLabRadar/1.0',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      next: { revalidate: 300 }
    });
  } finally {
    clearTimeout(timeout);
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 503 || status === 504;
}

function isSearchAggregatorUrl(url: string): boolean {
  return url.includes('news.google.com/rss/search') || url.includes('www.bing.com/news/search');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, timeoutMs: number): Promise<Response> {
  const attempts = isSearchAggregatorUrl(url) ? 3 : 1;
  let lastResponse: Response | null = null;

  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetchWithTimeout(url, timeoutMs);
      if (!isRetryableStatus(response.status) || i === attempts - 1) {
        return response;
      }
      lastResponse = response;
    } catch (error) {
      if (i === attempts - 1) throw error;
    }
    await sleep(250 + i * 250);
  }

  if (lastResponse) return lastResponse;
  return fetchWithTimeout(url, timeoutMs);
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url).searchParams.get('url');
  if (!url) {
    return Response.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  if (!isAllowedUrl(url)) {
    return Response.json({ error: 'Domain not allowed' }, { status: 403 });
  }

  try {
    const timeout = url.includes('news.google.com') ? 20000 : 12000;
    const response = await fetchWithRetry(url, timeout);
    const text = await response.text();

    return new Response(text, {
      status: response.status,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300'
      }
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    return Response.json(
      { error: isTimeout ? 'Feed timeout' : 'Failed to fetch feed' },
      { status: isTimeout ? 504 : 502 }
    );
  }
}
