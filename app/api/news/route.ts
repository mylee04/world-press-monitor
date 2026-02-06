import { NextRequest } from 'next/server';
import { OUTLET_BY_ID, OUTLET_FEEDS } from '@/data/outlets';
import { classifyBeatByKeyword } from '@/lib/keyword-classifier';
import { inferGeoFromTitle } from '@/lib/geo';
import { parseRssOrAtom } from '@/lib/parsers';
import { isCoolingDown, markFailure, markSuccess } from '@/lib/circuit-breaker';
import type { NewsItem, OutletFeed } from '@/lib/types';

export const runtime = 'edge';

const COUNTRY_CODE_TO_NAME: Record<string, string> = {
  US: 'United States',
  UK: 'United Kingdom',
  QA: 'Qatar',
  SA: 'Saudi Arabia',
  UA: 'Ukraine',
  RU: 'Russia',
  ZA: 'South Africa',
  HK: 'China',
  SG: 'Singapore',
  IN: 'India',
  FR: 'France',
  ES: 'Spain',
  IT: 'Italy',
  JP: 'Japan',
  KR: 'South Korea'
};

type FetchMethod = 'rss' | 'sitemap';

interface FetchDiagnostic {
  outletId: string;
  source: string;
  method: FetchMethod;
  attempted: boolean;
  circuitOpen: boolean;
  ok: boolean;
  statusCode: number | null;
  parsedCount: number;
  recent24h: number;
  url?: string;
  error?: string;
}

interface OutletFetchResult {
  items: NewsItem[];
  diagnostic: FetchDiagnostic;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const RSS_ITEM_LIMIT = 15;
const SITEMAP_ITEM_LIMIT = 10;
const WORLD_PORTAL_RSS_LIMIT = 8;
const WORLD_PORTAL_SITEMAP_LIMIT = 6;
const LATAM_COUNTRIES = new Set(['LATAM', 'Argentina', 'Chile', 'Uruguay']);
const LATAM_ENTITY_TERMS = [
  'argentina',
  'argentine',
  'buenos aires',
  'chile',
  'chilean',
  'santiago',
  'uruguay',
  'uruguayan',
  'montevideo',
  'mercosur',
  'patagonia',
  'rio de la plata',
  'southern cone',
  'latam',
  'latin america',
  'latinoamerica',
  'america latina',
];

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function detectLatamFromTitle(title: string, locationName?: string): boolean {
  const normalized = normalizeText(`${title} ${locationName || ''}`);
  return LATAM_ENTITY_TERMS.some((term) => normalized.includes(term));
}

function isLatamCountry(country?: string): boolean {
  if (!country) return false;
  return LATAM_COUNTRIES.has(country);
}

function annotateWorldLatam(item: NewsItem): NewsItem {
  const latamByCountry = isLatamCountry(item.country);
  const latamByEntity = detectLatamFromTitle(item.title, item.locationName);
  const worldLatam = latamByCountry || latamByEntity;
  return {
    ...item,
    worldLatam,
    tags: worldLatam ? [...new Set([...(item.tags || []), 'world_latam'])] : (item.tags || [])
  };
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

function countRecent24h(items: Array<{ publishedAt: string }>): number {
  const cutoff = Date.now() - DAY_MS;
  return items.filter((item) => {
    const ts = new Date(item.publishedAt).getTime();
    return Number.isFinite(ts) && ts >= cutoff;
  }).length;
}

function normalizeCountryName(country: string): string {
  return COUNTRY_CODE_TO_NAME[country] || country;
}

async function getBusinessRadarFallback(): Promise<NewsItem[]> {
  const apiUrl = process.env.BUSINESS_RADAR_API_URL;
  const apiKey = process.env.BUSINESS_RADAR_API_KEY;
  if (!apiUrl || !apiKey) return [];

  try {
    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      next: { revalidate: 300 }
    });

    if (!response.ok) return [];
    const data = await response.json() as { articles?: Array<{ title: string; url: string; source?: string; publishedAt?: string; beat?: string }> };
    return (data.articles || []).slice(0, 30).map((article) => {
      const keyword = classifyBeatByKeyword(article.title, 'business');
      const geo = inferGeoFromTitle(article.title);
      const newsItem = {
        id: article.url,
        title: article.title,
        link: article.url,
        source: article.source || 'Business Radar',
        language: 'en',
        sourceType: 'global',
        tier: 2,
        publishedAt: article.publishedAt || new Date().toISOString(),
        beat: keyword.beat,
        confidence: keyword.confidence,
        classificationSource: keyword.source,
        classificationReason: keyword.reason,
        ...geo
      } satisfies NewsItem;
      return annotateWorldLatam(newsItem);
    });
  } catch {
    return [];
  }
}

async function fetchOutletRss(origin: string, outlet: OutletFeed): Promise<OutletFetchResult> {
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
        recent24h: 0,
        url: outlet.rssUrl,
        error: 'circuit_open'
      }
    };
  }

  try {
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
          recent24h: 0,
          url: outlet.rssUrl,
          error: `http_${response.status}`
        }
      };
    }

    const xml = await response.text();
    const parsed = parseRssOrAtom(xml, rssItemLimitFor(outlet));
    const items = parsed.map((item) => {
      const classification = classifyBeatByKeyword(item.title, outlet.beat);
      const normalizedCountry = normalizeCountryName(outlet.country);
      const geo = inferGeoFromTitle(item.title, normalizedCountry);
      const newsItem = {
        id: item.link,
        title: item.title,
        link: item.link,
        source: outlet.name,
        language: outlet.language || 'en',
        sourceType: outlet.sourceType || 'global',
        tier: outlet.tier,
        publishedAt: item.publishedAt,
        beat: classification.beat,
        confidence: classification.confidence,
        classificationSource: classification.source,
        classificationReason: classification.reason,
        ...geo
      } satisfies NewsItem;
      return annotateWorldLatam(newsItem);
    });

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
        recent24h: 0,
        url: outlet.rssUrl,
        error: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

async function fetchOutletSitemap(origin: string, outlet: OutletFeed): Promise<OutletFetchResult> {
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
        recent24h: 0,
        url: outlet.sitemapUrl,
        error: 'circuit_open'
      }
    };
  }

  try {
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
          recent24h: 0,
          url: outlet.sitemapUrl,
          error: `http_${response.status}`
        }
      };
    }

    const json = await response.json() as { items?: Array<{ title: string; link: string; publishedAt: string }> };
    const parsed = (json.items || []).slice(0, sitemapItemLimitFor(outlet));
    const items = parsed.map((item) => {
      const classification = classifyBeatByKeyword(item.title, outlet.beat);
      const normalizedCountry = normalizeCountryName(outlet.country);
      const geo = inferGeoFromTitle(item.title, normalizedCountry);
      const newsItem = {
        id: item.link,
        title: item.title,
        link: item.link,
        source: `${outlet.name} Sitemap`,
        language: outlet.language || 'en',
        sourceType: outlet.sourceType || 'global',
        tier: outlet.tier,
        publishedAt: item.publishedAt,
        beat: classification.beat,
        confidence: classification.confidence,
        classificationSource: classification.source,
        classificationReason: classification.reason,
        ...geo
      } satisfies NewsItem;
      return annotateWorldLatam(newsItem);
    });

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
        recent24h: 0,
        url: outlet.sitemapUrl,
        error: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

function dedupeAndSort(items: NewsItem[]): NewsItem[] {
  const map = new Map<string, NewsItem>();
  for (const item of items) {
    const existing = map.get(item.link);
    if (!existing || new Date(item.publishedAt).getTime() > new Date(existing.publishedAt).getTime()) {
      map.set(item.link, item);
    }
  }

  return [...map.values()].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(value: string): Set<string> {
  const tokens = normalizeTitle(value).split(' ').filter((token) => token.length >= 3);
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  if (union === 0) return 0;
  return intersection / union;
}

function minutesBetween(a: string, b: string): number {
  const aMs = new Date(a).getTime();
  const bMs = new Date(b).getTime();
  if (!Number.isFinite(aMs) || !Number.isFinite(bMs)) return Number.MAX_SAFE_INTEGER;
  return Math.abs(aMs - bMs) / 60000;
}

function buildStoryClusters(items: NewsItem[]): NewsItem[] {
  const sorted = [...items].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const clusterRep: Array<{ id: string; item: NewsItem; tokens: Set<string> }> = [];
  let clusterSeq = 1;

  const withClusters = sorted.map((item) => {
    const tokens = tokenSet(item.title);
    const matched = clusterRep.find((rep) => {
      const sameCountry = (item.country || 'Unknown') === (rep.item.country || 'Unknown');
      if (!sameCountry) return false;
      if (item.beat !== rep.item.beat) return false;

      const mins = minutesBetween(item.publishedAt, rep.item.publishedAt);
      if (mins > 360) return false;

      const similarity = jaccard(tokens, rep.tokens);
      if (similarity >= 0.58) return true;

      const differentLanguage = (item.language || 'en') !== (rep.item.language || 'en');
      const sameLocation = Boolean(item.locationName) && item.locationName === rep.item.locationName;
      if (differentLanguage && sameLocation && mins <= 120) return true;

      return false;
    });

    if (matched) {
      return { ...item, clusterId: matched.id };
    }

    const clusterId = `cluster-${clusterSeq++}`;
    clusterRep.push({ id: clusterId, item, tokens });
    return { ...item, clusterId };
  });

  const clusterCounts = new Map<string, number>();
  for (const item of withClusters) {
    if (!item.clusterId) continue;
    clusterCounts.set(item.clusterId, (clusterCounts.get(item.clusterId) ?? 0) + 1);
  }

  return withClusters.map((item) => ({
    ...item,
    clusterSize: item.clusterId ? clusterCounts.get(item.clusterId) ?? 1 : 1
  }));
}

export async function GET(req: NextRequest): Promise<Response> {
  const origin = req.nextUrl.origin;
  const outletIds = (req.nextUrl.searchParams.get('outlets') || '').split(',').filter(Boolean);

  const selectedOutlets = outletIds.length
    ? outletIds.map((id) => OUTLET_BY_ID.get(id)).filter((outlet): outlet is OutletFeed => Boolean(outlet))
    : OUTLET_FEEDS;

  const tasks = selectedOutlets.flatMap((outlet) => [
    fetchOutletRss(origin, outlet),
    fetchOutletSitemap(origin, outlet)
  ]);

  const results = await Promise.all(tasks);
  const diagnostics = results.map((result) => result.diagnostic);
  let items = buildStoryClusters(dedupeAndSort(results.flatMap((result) => result.items)));

  if (items.length < 20) {
    const fallback = await getBusinessRadarFallback();
    items = buildStoryClusters(dedupeAndSort([...items, ...fallback]));
  }

  return Response.json({
    generatedAt: new Date().toISOString(),
    count: items.length,
    items: items.slice(0, 200),
    ingestion: {
      totalOutlets: selectedOutlets.length,
      totalEndpoints: diagnostics.filter((diag) => diag.attempted).length,
      okEndpoints: diagnostics.filter((diag) => diag.attempted && diag.ok).length,
      failedEndpoints: diagnostics.filter((diag) => diag.attempted && !diag.ok).length,
      circuitOpenEndpoints: diagnostics.filter((diag) => diag.circuitOpen).length,
      diagnostics
    }
  });
}
