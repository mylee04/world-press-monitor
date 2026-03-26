const DEFAULT_ARTICLE_PAGE_USER_AGENT =
  process.env.INGEST_USER_AGENT
  || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

const DEFAULT_ARTICLE_PAGE_ACCEPT_LANGUAGE =
  process.env.INGEST_ACCEPT_LANGUAGE || 'en-US,en;q=0.9,es;q=0.8,ja;q=0.7';

function hostnameForUrl(url: string): string {
  try {
    return new URL(url).hostname.trim().toLowerCase();
  } catch {
    return '';
  }
}

export function buildArticlePageFetchHeaders(url: string): Record<string, string> {
  const hostname = hostnameForUrl(url);
  if (hostname === 'dailynews.co.th' || hostname === 'www.dailynews.co.th') {
    return {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': process.env.INGEST_ACCEPT_LANGUAGE || 'en-US,en;q=0.9,th;q=0.8',
    };
  }

  return {
    'User-Agent': DEFAULT_ARTICLE_PAGE_USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': DEFAULT_ARTICLE_PAGE_ACCEPT_LANGUAGE,
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  };
}
