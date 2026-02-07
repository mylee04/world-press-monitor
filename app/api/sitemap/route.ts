import { isAllowedUrl } from '@/lib/allowlist';
import { parseSitemap } from '@/lib/parsers';

export const runtime = 'edge';

async function fetchWithTimeout(url: string, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 PressLabRadar/1.0',
        Accept: 'application/xml, text/xml, */*'
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
    const response = await fetchWithTimeout(url, 12000);
    if (!response.ok) {
      return Response.json({ error: `Sitemap fetch failed: ${response.status}` }, { status: 502 });
    }

    const xml = await response.text();
    const items = parseSitemap(xml, 300);
    return Response.json({ items, count: items.length });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    return Response.json(
      { error: isTimeout ? 'Sitemap timeout' : 'Failed to fetch sitemap' },
      { status: isTimeout ? 504 : 502 }
    );
  }
}
