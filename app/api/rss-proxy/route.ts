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
    const response = await fetchWithTimeout(url, timeout);
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
