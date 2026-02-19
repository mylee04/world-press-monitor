import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OUTLET_FEEDS } from '../data/outlets';
import { parseRssOrAtom, parseSitemap } from '../lib/parsers';
import { runWithConcurrency } from '../lib/concurrency';
import { fetchWithRetry, isSearchAggregatorUrl } from '../lib/fetch-utils';
import { classifySection } from '../lib/keyword-classifier';
import { inferGeoFromTitle } from '../lib/geo';
import {
  readFailingEndpointBackoff,
  persistExternalNewsArticles,
  persistIngestionDiagnostics,
  type IngestionEndpointRun,
} from '../lib/ingestion-store';
import type { NewsItem, OutletFeed } from '../lib/types';

const FETCH_TIMEOUT_MS = Math.max(
  3000,
  Math.min(30000, Number.parseInt(process.env.INGEST_FETCH_TIMEOUT_MS || '12000', 10) || 12000)
);
const RSS_ITEM_LIMIT = Math.max(10, Math.min(300, Number.parseInt(process.env.INGEST_RSS_LIMIT || '120', 10) || 120));
const SITEMAP_ITEM_LIMIT = Math.max(
  10,
  Math.min(300, Number.parseInt(process.env.INGEST_SITEMAP_LIMIT || '80', 10) || 80)
);
const SITEMAP_INDEX_CHILDREN_LIMIT = Math.max(
  1,
  Math.min(10, Number.parseInt(process.env.INGEST_SITEMAP_INDEX_CHILDREN || '3', 10) || 3)
);
const FETCH_CONCURRENCY = Math.max(
  4,
  Math.min(120, Number.parseInt(process.env.INGEST_FETCH_CONCURRENCY || '24', 10) || 24)
);
const LOOP_INTERVAL_SEC = Math.max(
  60,
  Math.min(3600, Number.parseInt(process.env.INGEST_LOOP_INTERVAL_SEC || '300', 10) || 300)
);
const OUTLET_CHUNK_SIZE = Math.max(
  50,
  Math.min(2000, Number.parseInt(process.env.INGEST_OUTLET_CHUNK_SIZE || '360', 10) || 360)
);
const WRITE_INGESTED_COMPAT = process.env.NEWS_WRITE_INGESTED_COMPAT === 'true';
const STATE_FILE = resolve(process.cwd(), 'audits/ingest-worker-state.json');
const SUMMARY_FILE = resolve(process.cwd(), 'audits/ingest-worker-last.json');
const IN_SCOPE_COUNTRIES = new Set(['united states', 'argentina', 'chile', 'uruguay', 'latam']);
const SKIP_GOOGLE_QUERY_MATRIX = process.env.INGEST_SKIP_GOOGLE_QUERY_MATRIX !== 'false';
const SKIP_SEARCH_AGGREGATORS = process.env.INGEST_SKIP_SEARCH_AGGREGATORS !== 'false';
const FAIL_BACKOFF_ENABLED = (process.env.INGEST_FAIL_BACKOFF_ENABLED || 'true').toLowerCase() !== 'false';
const FAIL_BACKOFF_WINDOW_MINUTES = Math.max(
  10,
  Math.min(24 * 60, Number.parseInt(process.env.INGEST_FAIL_BACKOFF_WINDOW_MINUTES || '60', 10) || 60)
);
const FAIL_BACKOFF_MIN_ATTEMPTS = Math.max(
  2,
  Math.min(100, Number.parseInt(process.env.INGEST_FAIL_BACKOFF_MIN_ATTEMPTS || '4', 10) || 4)
);
const FAIL_BACKOFF_MIN_FAIL_PCT = Math.max(
  50,
  Math.min(100, Number.parseInt(process.env.INGEST_FAIL_BACKOFF_MIN_FAIL_PCT || '90', 10) || 90)
);
const LATAM_COUNTRIES = new Set(['latam', 'argentina', 'chile', 'uruguay']);
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
  'southern cone',
  'latam',
  'latin america',
  'latinoamerica',
  'america latina',
];
const BREAKING_TERMS = ['breaking', 'urgent', 'developing', 'just in', 'ultima hora', 'última hora', 'urgente', 'en vivo', 'flash'];

type WorkerState = {
  offset: number;
  updatedAt: string;
};

type EndpointRun = {
  outlet: OutletFeed;
  method: 'rss' | 'sitemap';
  url: string;
};

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isLatamCountry(country?: string): boolean {
  return LATAM_COUNTRIES.has(normalizeText(country || ''));
}

function detectLatamFromTitle(title: string, locationName?: string): boolean {
  const normalized = normalizeText(`${title} ${locationName || ''}`);
  return LATAM_ENTITY_TERMS.some((term) => normalized.includes(term));
}

function isLikelyBreakingText(text: string): boolean {
  const normalized = normalizeText(text);
  return BREAKING_TERMS.some((term) => normalized.includes(term));
}

function annotateWorldLatam(item: NewsItem): NewsItem {
  const worldLatam = isLatamCountry(item.country) || detectLatamFromTitle(item.title, item.locationName);
  const breaking = isLikelyBreakingText(`${item.title} ${item.classificationReason || ''}`);
  const tags = [...new Set([...(item.tags || []), ...(worldLatam ? ['world_latam'] : []), ...(breaking ? ['breaking'] : [])])];
  return {
    ...item,
    worldLatam,
    tags,
  };
}

function ensureAuditsDir(): void {
  mkdirSync(resolve(process.cwd(), 'audits'), { recursive: true });
}

function normalizeCountryName(country: string): string {
  const c = (country || '').trim();
  if (c === 'US') return 'United States';
  return c || 'Global';
}

function inScopeOutlet(outlet: OutletFeed): boolean {
  if (!outlet.defaultEnabled) return false;
  if (SKIP_GOOGLE_QUERY_MATRIX && /^G (State|Metro) /i.test(outlet.name)) return false;
  if (
    SKIP_SEARCH_AGGREGATORS
    && (
      isSearchAggregatorUrl(outlet.rssUrl || '')
      || isSearchAggregatorUrl(outlet.sitemapUrl || '')
    )
  ) return false;
  const country = normalizeText(normalizeCountryName(outlet.country));
  return IN_SCOPE_COUNTRIES.has(country);
}

function parseSitemapIndex(xml: string): string[] {
  if (!/<sitemapindex[\s>]/i.test(xml)) return [];
  return [...xml.matchAll(/<sitemap>([\s\S]*?)<\/sitemap>/gi)]
    .map((match) => match[1] || '')
    .map((body) => {
      const loc = body.match(/<loc[^>]*>([\s\S]*?)<\/loc>/i)?.[1]?.trim() || '';
      return loc;
    })
    .filter(Boolean)
    .slice(0, SITEMAP_INDEX_CHILDREN_LIMIT);
}

const FEED_FETCH_HEADERS = {
  'User-Agent': 'PressLabIngestWorker/1.0 (+https://presslab.local)',
  Accept: 'application/xml, text/xml, application/rss+xml, application/atom+xml, */*',
};

async function fetchWithRetryFeed(url: string): Promise<Response> {
  return fetchWithRetry(url, {
    timeoutMs: FETCH_TIMEOUT_MS,
    fetchOptions: {
      headers: FEED_FETCH_HEADERS
    },
    attempts: isSearchAggregatorUrl(url) ? 3 : 1,
    backoffMs: (attempt) => 200 + attempt * 300 + Math.floor(Math.random() * 200),
  });
}

function dedupeAndSort(items: NewsItem[]): NewsItem[] {
  const byLink = new Map<string, NewsItem>();
  for (const item of items) {
    const prev = byLink.get(item.link);
    if (!prev || new Date(item.publishedAt).getTime() > new Date(prev.publishedAt).getTime()) {
      byLink.set(item.link, item);
    }
  }
  return [...byLink.values()].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

async function toNewsItem(
  outlet: OutletFeed,
  row: { title: string; description?: string; link: string; publishedAt: string }
): Promise<NewsItem> {
  const normalizedCountry = normalizeCountryName(outlet.country);
  const geo = inferGeoFromTitle(row.title, normalizedCountry);
  const fallbackSection = outlet.section || 'general';
  const classification = await classifySection({ title: row.title, summary: row.description, fallbackSection });
  const section = classification.section;
  return annotateWorldLatam({
    id: row.link,
    outletId: outlet.id,
    title: row.title,
    description: row.description || '',
    link: row.link,
    source: outlet.name,
    language: outlet.language || 'en',
    sourceType: outlet.sourceType || 'global',
    tier: outlet.tier,
    publishedAt: row.publishedAt,
    section,
    confidence: classification.confidence,
    classificationSource: classification.source,
    classificationReason: classification.reason,
    publicationSource: 'feed',
    summarySource: row.description ? 'feed' : undefined,
    ...geo,
  });
}

async function fetchRss(outlet: OutletFeed): Promise<{ items: NewsItem[]; run: IngestionEndpointRun }> {
  if (!outlet.rssUrl) {
    return {
      items: [],
      run: {
        outletId: outlet.id,
        source: outlet.name,
        method: 'rss',
        attempted: false,
        circuitOpen: false,
        ok: false,
        statusCode: null,
        parsedCount: 0,
        parsedLimit: RSS_ITEM_LIMIT,
        sampleCapped: false,
        recent24h: 0,
      },
    };
  }

  try {
    const response = await fetchWithRetryFeed(outlet.rssUrl);
    if (!response.ok) {
      return {
        items: [],
        run: {
          outletId: outlet.id,
          source: outlet.name,
          method: 'rss',
          attempted: true,
          circuitOpen: false,
          ok: false,
          statusCode: response.status,
          parsedCount: 0,
          parsedLimit: RSS_ITEM_LIMIT,
          sampleCapped: false,
          recent24h: 0,
          error: `http_${response.status}`,
        },
      };
    }
    const xml = await response.text();
    const parsed = parseRssOrAtom(xml, RSS_ITEM_LIMIT);
    const items = await Promise.all(parsed.map((row) => toNewsItem(outlet, row)));
    return {
      items,
      run: {
        outletId: outlet.id,
        source: outlet.name,
        method: 'rss',
        attempted: true,
        circuitOpen: false,
        ok: true,
        statusCode: 200,
        parsedCount: parsed.length,
        parsedLimit: RSS_ITEM_LIMIT,
        sampleCapped: parsed.length >= RSS_ITEM_LIMIT,
        recent24h: parsed.length,
      },
    };
  } catch (error) {
    return {
      items: [],
      run: {
        outletId: outlet.id,
        source: outlet.name,
        method: 'rss',
        attempted: true,
        circuitOpen: false,
        ok: false,
        statusCode: null,
        parsedCount: 0,
        parsedLimit: RSS_ITEM_LIMIT,
        sampleCapped: false,
        recent24h: 0,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function fetchSitemap(outlet: OutletFeed): Promise<{ items: NewsItem[]; run: IngestionEndpointRun }> {
  if (!outlet.sitemapUrl) {
    return {
      items: [],
      run: {
        outletId: outlet.id,
        source: outlet.name,
        method: 'sitemap',
        attempted: false,
        circuitOpen: false,
        ok: false,
        statusCode: null,
        parsedCount: 0,
        parsedLimit: SITEMAP_ITEM_LIMIT,
        sampleCapped: false,
        recent24h: 0,
      },
    };
  }

  try {
    const response = await fetchWithRetryFeed(outlet.sitemapUrl);
    if (!response.ok) {
      return {
        items: [],
        run: {
          outletId: outlet.id,
          source: outlet.name,
          method: 'sitemap',
          attempted: true,
          circuitOpen: false,
          ok: false,
          statusCode: response.status,
          parsedCount: 0,
          parsedLimit: SITEMAP_ITEM_LIMIT,
          sampleCapped: false,
          recent24h: 0,
          error: `http_${response.status}`,
        },
      };
    }

    const xml = await response.text();
    let parsed = parseSitemap(xml, SITEMAP_ITEM_LIMIT);
    if (parsed.length === 0) {
      const children = parseSitemapIndex(xml);
      if (children.length > 0) {
        const childResults = await Promise.all(
          children.map(async (childUrl) => {
            try {
              const childResponse = await fetchWithRetryFeed(childUrl);
              if (!childResponse.ok) return [];
              const childXml = await childResponse.text();
              return parseSitemap(childXml, Math.max(8, Math.floor(SITEMAP_ITEM_LIMIT / children.length)));
            } catch {
              return [];
            }
          })
        );
        parsed = childResults.flat().slice(0, SITEMAP_ITEM_LIMIT);
      }
    }

    const items = await Promise.all(parsed.map((row) => toNewsItem(outlet, row)));
    return {
      items,
      run: {
        outletId: outlet.id,
        source: outlet.name,
        method: 'sitemap',
        attempted: true,
        circuitOpen: false,
        ok: true,
        statusCode: 200,
        parsedCount: parsed.length,
        parsedLimit: SITEMAP_ITEM_LIMIT,
        sampleCapped: parsed.length >= SITEMAP_ITEM_LIMIT,
        recent24h: parsed.length,
      },
    };
  } catch (error) {
    return {
      items: [],
      run: {
        outletId: outlet.id,
        source: outlet.name,
        method: 'sitemap',
        attempted: true,
        circuitOpen: false,
        ok: false,
        statusCode: null,
        parsedCount: 0,
        parsedLimit: SITEMAP_ITEM_LIMIT,
        sampleCapped: false,
        recent24h: 0,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function readState(totalOutlets: number): WorkerState {
  try {
    const raw = readFileSync(STATE_FILE, 'utf8');
    const json = JSON.parse(raw) as WorkerState;
    const offset = Number.isFinite(json.offset) ? Math.max(0, Math.floor(json.offset)) : 0;
    return {
      offset: totalOutlets > 0 ? offset % totalOutlets : 0,
      updatedAt: json.updatedAt || new Date(0).toISOString(),
    };
  } catch {
    return { offset: 0, updatedAt: new Date(0).toISOString() };
  }
}

function writeState(state: WorkerState): void {
  ensureAuditsDir();
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function pickOutletChunk(all: OutletFeed[], chunkSize: number): { selected: OutletFeed[]; nextOffset: number; offset: number } {
  if (all.length === 0) return { selected: [], nextOffset: 0, offset: 0 };
  const state = readState(all.length);
  if (chunkSize >= all.length) {
    return { selected: all, nextOffset: 0, offset: 0 };
  }
  const offset = state.offset;
  const selected = Array.from({ length: chunkSize }, (_, i) => all[(offset + i) % all.length]);
  const nextOffset = (offset + selected.length) % all.length;
  return { selected, nextOffset, offset };
}

async function runOnce(): Promise<void> {
  const started = Date.now();
  ensureAuditsDir();

  const allOutlets = OUTLET_FEEDS.filter(inScopeOutlet);
  const { selected, nextOffset, offset } = pickOutletChunk(allOutlets, OUTLET_CHUNK_SIZE);
  const endpoints: EndpointRun[] = selected.flatMap((outlet) => {
    const runs: EndpointRun[] = [];
    if (outlet.rssUrl) runs.push({ outlet, method: 'rss', url: outlet.rssUrl });
    if (outlet.sitemapUrl) runs.push({ outlet, method: 'sitemap', url: outlet.sitemapUrl });
    return runs;
  });

  const failingBackoff = FAIL_BACKOFF_ENABLED
    ? await readFailingEndpointBackoff({
      runner: 'worker',
      windowMinutes: FAIL_BACKOFF_WINDOW_MINUTES,
      minAttempts: FAIL_BACKOFF_MIN_ATTEMPTS,
      minFailPct: FAIL_BACKOFF_MIN_FAIL_PCT,
      limit: 5000
    })
    : { rows: [] as Array<{ outletId: string; method: 'rss' | 'sitemap' }> };
  const failingKeys = new Set(failingBackoff.rows.map((row) => `${row.outletId}:${row.method}`));

  const results = await runWithConcurrency(endpoints, FETCH_CONCURRENCY, async (endpoint) => {
    const endpointKey = `${endpoint.outlet.id}:${endpoint.method}`;
    if (failingKeys.has(endpointKey)) {
      return {
        items: [],
        run: {
          outletId: endpoint.outlet.id,
          source: endpoint.outlet.name,
          method: endpoint.method,
          attempted: false,
          circuitOpen: true,
          ok: false,
          statusCode: null,
          parsedCount: 0,
          parsedLimit: endpoint.method === 'rss' ? RSS_ITEM_LIMIT : SITEMAP_ITEM_LIMIT,
          sampleCapped: false,
          recent24h: 0,
          error: 'cooldown_high_fail'
        } satisfies IngestionEndpointRun
      };
    }
    if (endpoint.method === 'rss') return fetchRss(endpoint.outlet);
    return fetchSitemap(endpoint.outlet);
  });

  const diagnostics = results.map((r) => r.run);
  const merged = dedupeAndSort(results.flatMap((r) => r.items));
  const persistedExternal = await persistExternalNewsArticles(merged);
  if (WRITE_INGESTED_COMPAT) {
    const { persistIngestedArticles } = await import('../lib/ingestion-store');
    await persistIngestedArticles(merged).catch(() => ({ persisted: 0 }));
  }
  const persistedDiag = await persistIngestionDiagnostics(diagnostics, { runner: 'worker' });

  const okEndpoints = diagnostics.filter((d) => d.attempted && d.ok).length;
  const failedEndpoints = diagnostics.filter((d) => d.attempted && !d.ok).length;
  const attempted = diagnostics.filter((d) => d.attempted).length;
  const summary = {
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    worker: {
      outletsTotal: allOutlets.length,
      outletsSelected: selected.length,
      outletOffset: offset,
      nextOutletOffset: nextOffset,
      endpointsAttempted: attempted,
      endpointsOk: okEndpoints,
      endpointsFailed: failedEndpoints,
      endpointFailureRate: attempted > 0 ? failedEndpoints / attempted : 0,
      uniqueItems: merged.length,
      persisted: persistedExternal.persisted,
      externalPersisted: persistedExternal.persisted,
      diagnosticsPersisted: persistedDiag.persisted,
    },
  };

  writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2), 'utf8');
  writeState({ offset: nextOffset, updatedAt: summary.generatedAt });
  console.log(
    `[ingest-worker] outlets=${selected.length}/${allOutlets.length} endpoints=${attempted} ok=${okEndpoints} failed=${failedEndpoints} backoff=${failingKeys.size} unique=${merged.length} persisted=${persistedExternal.persisted} external=${persistedExternal.persisted} elapsedMs=${summary.elapsedMs}`
  );
}

async function main(): Promise<void> {
  const once = process.argv.includes('--once');
  if (once) {
    await runOnce();
    return;
  }

  console.log(`[ingest-worker] loop start interval=${LOOP_INTERVAL_SEC}s`);
  for (;;) {
    try {
      await runOnce();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[ingest-worker] run failed: ${message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, LOOP_INTERVAL_SEC * 1000));
  }
}

void main();
