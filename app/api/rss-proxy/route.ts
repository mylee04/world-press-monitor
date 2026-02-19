import { isAllowedUrl } from '@/lib/allowlist';
import { fetchWithRetry, isSearchAggregatorUrl } from '@/lib/fetch-utils';

export const runtime = 'edge';

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
    const response = await fetchWithRetry(url, {
      timeoutMs: timeout,
      attempts: isSearchAggregatorUrl(url) ? 3 : 1,
      fetchOptions: {
        headers: {
          'User-Agent': 'Mozilla/5.0 PressLabRadar/1.0',
          Accept: 'application/rss+xml, application/xml, text/xml, */*',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        next: { revalidate: 300 }
      },
      backoffMs: (attempt) => 250 + attempt * 250,
    });
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
