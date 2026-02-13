import { parseRssOrAtom } from '@/lib/parsers';
import { isCoolingDown, markFailure, markSuccess } from '@/lib/circuit-breaker';
import { countRecent24h, mapParsedOutletItemToNewsItem } from '@/lib/news-items';
import type { NewsItem, OutletFeed } from '@/lib/types';

const RSS_ITEM_LIMIT = 120;
const SITEMAP_ITEM_LIMIT = 80;
const WORLD_PORTAL_RSS_LIMIT = 60;
const WORLD_PORTAL_SITEMAP_LIMIT = 40;

export type FetchMethod = 'rss' | 'sitemap';

export interface FetchDiagnostic {
  outletId: string;
  source: string;
  method: FetchMethod;
  attempted: boolean;
  circuitOpen: boolean;
  ok: boolean;
  statusCode: number | null;
  parsedCount: number;
  parsedLimit: number;
  sampleCapped: boolean;
  recent24h: number;
  url?: string;
  error?: string;
}

export interface OutletFetchResult {
  items: NewsItem[];
  diagnostic: FetchDiagnostic;
}

function rssItemLimitFor(outlet: OutletFeed): number {
  if (
    (outlet.sourceType || 'global') === 'portal'
    && outlet.beat === 'world'
    && /Google State:|Bing State:|Google Metro:|Bing Metro:|Google US World Topic|Google LATAM Regional Topic|Bing LATAM Topic|Bing US World Topic/i.test(outlet.name)
  ) {
    return WORLD_PORTAL_RSS_LIMIT;
  }
  return RSS_ITEM_LIMIT;
}

function sitemapItemLimitFor(outlet: OutletFeed): number {
  if (
    (outlet.sourceType || 'global') === 'portal'
    && outlet.beat === 'world'
    && /Google State:|Bing State:|Google Metro:|Bing Metro:|Google US World Topic|Google LATAM Regional Topic|Bing LATAM Topic|Bing US World Topic/i.test(outlet.name)
  ) {
    return WORLD_PORTAL_SITEMAP_LIMIT;
  }
  return SITEMAP_ITEM_LIMIT;
}

export async function fetchOutletRss(origin: string, outlet: OutletFeed): Promise<OutletFetchResult> {
  if (!outlet.rssUrl) {
    return {
      items: [],
      diagnostic: {
        outletId: outlet.id,
        source: outlet.name,
        method: 'rss',
        attempted: false,
        circuitOpen: false,
        ok: false,
        statusCode: null,
        parsedCount: 0,
        parsedLimit: 0,
        sampleCapped: false,
        recent24h: 0
      }
    };
  }
  if (isCoolingDown(outlet.id)) {
    return {
      items: [],
      diagnostic: {
        outletId: outlet.id,
        source: outlet.name,
        method: 'rss',
        attempted: true,
        circuitOpen: true,
        ok: false,
        statusCode: null,
        parsedCount: 0,
        parsedLimit: 0,
        sampleCapped: false,
        recent24h: 0,
        url: outlet.rssUrl,
        error: 'circuit_open'
      }
    };
  }

  try {
    const parseLimit = rssItemLimitFor(outlet);
    const proxyUrl = `${origin}/api/rss-proxy?url=${encodeURIComponent(outlet.rssUrl)}`;
    const response = await fetch(proxyUrl, { next: { revalidate: 300 } });
    if (!response.ok) {
      markFailure(outlet.id);
      return {
        items: [],
        diagnostic: {
          outletId: outlet.id,
          source: outlet.name,
          method: 'rss',
          attempted: true,
          circuitOpen: false,
          ok: false,
          statusCode: response.status,
          parsedCount: 0,
          parsedLimit: parseLimit,
          sampleCapped: false,
          recent24h: 0,
          url: outlet.rssUrl,
          error: `http_${response.status}`
        }
      };
    }

    const xml = await response.text();
    const parsed = parseRssOrAtom(xml, parseLimit);
    const items = parsed.map((item) => mapParsedOutletItemToNewsItem(outlet, item));

    markSuccess(outlet.id);
    return {
      items,
      diagnostic: {
        outletId: outlet.id,
        source: outlet.name,
        method: 'rss',
        attempted: true,
        circuitOpen: false,
        ok: true,
        statusCode: 200,
        parsedCount: parsed.length,
        parsedLimit: parseLimit,
        sampleCapped: parsed.length >= parseLimit,
        recent24h: countRecent24h(parsed),
        url: outlet.rssUrl
      }
    };
  } catch (error) {
    markFailure(outlet.id);
    return {
      items: [],
      diagnostic: {
        outletId: outlet.id,
        source: outlet.name,
        method: 'rss',
        attempted: true,
        circuitOpen: false,
        ok: false,
        statusCode: null,
        parsedCount: 0,
        parsedLimit: 0,
        sampleCapped: false,
        recent24h: 0,
        url: outlet.rssUrl,
        error: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

export async function fetchOutletSitemap(origin: string, outlet: OutletFeed): Promise<OutletFetchResult> {
  if (!outlet.sitemapUrl) {
    return {
      items: [],
      diagnostic: {
        outletId: outlet.id,
        source: outlet.name,
        method: 'sitemap',
        attempted: false,
        circuitOpen: false,
        ok: false,
        statusCode: null,
        parsedCount: 0,
        parsedLimit: 0,
        sampleCapped: false,
        recent24h: 0
      }
    };
  }
  const key = `${outlet.id}:sitemap`;
  if (isCoolingDown(key)) {
    return {
      items: [],
      diagnostic: {
        outletId: outlet.id,
        source: outlet.name,
        method: 'sitemap',
        attempted: true,
        circuitOpen: true,
        ok: false,
        statusCode: null,
        parsedCount: 0,
        parsedLimit: 0,
        sampleCapped: false,
        recent24h: 0,
        url: outlet.sitemapUrl,
        error: 'circuit_open'
      }
    };
  }

  try {
    const parseLimit = sitemapItemLimitFor(outlet);
    const response = await fetch(`${origin}/api/sitemap?url=${encodeURIComponent(outlet.sitemapUrl)}`, { next: { revalidate: 300 } });
    if (!response.ok) {
      markFailure(key);
      return {
        items: [],
        diagnostic: {
          outletId: outlet.id,
          source: outlet.name,
          method: 'sitemap',
          attempted: true,
          circuitOpen: false,
          ok: false,
          statusCode: response.status,
          parsedCount: 0,
          parsedLimit: parseLimit,
          sampleCapped: false,
          recent24h: 0,
          url: outlet.sitemapUrl,
          error: `http_${response.status}`
        }
      };
    }

    const json = await response.json() as { items?: Array<{ title: string; description?: string; link: string; publishedAt: string }> };
    const parsed = (json.items || []).slice(0, parseLimit);
    const items = parsed.map((item) => mapParsedOutletItemToNewsItem(outlet, item));

    markSuccess(key);
    return {
      items,
      diagnostic: {
        outletId: outlet.id,
        source: outlet.name,
        method: 'sitemap',
        attempted: true,
        circuitOpen: false,
        ok: true,
        statusCode: 200,
        parsedCount: parsed.length,
        parsedLimit: parseLimit,
        sampleCapped: parsed.length >= parseLimit,
        recent24h: countRecent24h(parsed),
        url: outlet.sitemapUrl
      }
    };
  } catch (error) {
    markFailure(key);
    return {
      items: [],
      diagnostic: {
        outletId: outlet.id,
        source: outlet.name,
        method: 'sitemap',
        attempted: true,
        circuitOpen: false,
        ok: false,
        statusCode: null,
        parsedCount: 0,
        parsedLimit: 0,
        sampleCapped: false,
        recent24h: 0,
        url: outlet.sitemapUrl,
        error: error instanceof Error ? error.message : String(error)
      }
    };
  }
}
