import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OUTLET_FEEDS } from '../data/outlets';
import { parseRssOrAtom, parseSitemap } from '../lib/parsers';
import { dedupeItems, extractDomain } from '../lib/dedupe';
import { isLatamCountry, isLatamEntityTitle } from '../lib/latam-world';

type Row = {
  outletId: string;
  source: string;
  tier: number;
  country: string;
  sourceType: string;
  reviewDecision: string;
  rssUrl?: string;
  sitemapUrl?: string;
  rssParsed: number;
  sitemapParsed: number;
  rss24h: number;
  sitemap24h: number;
  total24h: number;
  rssUnique24h: number;
  sitemapUnique24h: number;
  unique24h: number;
  dedupeRate: number;
  recentItems24h: { title: string; link: string; publishedAt: string }[];
  errors: string[];
};

const HOURS = 24;
const TARGET_24H = 15000;
const CUTOFF_MS = Date.now() - HOURS * 60 * 60 * 1000;
const RSS_LIMIT = 250;
const SITEMAP_LIMIT = 250;
const TIMEOUT_MS = 18000;
const CONCURRENCY = 8;
const UA = 'Mozilla/5.0 (compatible; PressLabDailyMetrics/1.0; +https://presslab.local)';
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
const DIRECT_RETRIES = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function envValue(key: string): string {
  return process.env[key] || '';
}

function buildProxyUrl(target: string): string | null {
  const base = envValue('APP_BASE_URL') || 'http://localhost:3000';
  if (!base) return null;
  return `${base.replace(/\/$/, '')}/api/rss-proxy?url=${encodeURIComponent(target)}`;
}

function shouldTryProxy(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === 'news.google.com' || u.hostname === 'www.bing.com';
  } catch {
    return false;
  }
}

async function fetchWithTimeout(url: string, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        Accept: 'application/rss+xml, application/xml, text/xml, */*'
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithRetryAndProxy(url: string): Promise<Response> {
  let lastResponse: Response | null = null;
  let lastError: unknown = null;

  for (let i = 0; i <= DIRECT_RETRIES; i += 1) {
    try {
      const res = await fetchWithTimeout(url);
      lastResponse = res;
      if (!RETRY_STATUS.has(res.status) || i === DIRECT_RETRIES) break;
      await sleep(250 * (i + 1));
    } catch (error) {
      lastError = error;
      if (i === DIRECT_RETRIES) break;
      await sleep(250 * (i + 1));
    }
  }

  if (lastResponse && lastResponse.ok) return lastResponse;
  if (lastResponse && !shouldTryProxy(url)) return lastResponse;
  if (!shouldTryProxy(url)) {
    if (lastResponse) return lastResponse;
    throw (lastError instanceof Error ? lastError : new Error('fetch_failed'));
  }

  const proxyUrl = buildProxyUrl(url);
  if (!proxyUrl) {
    if (lastResponse) return lastResponse;
    throw (lastError instanceof Error ? lastError : new Error('fetch_failed_no_proxy'));
  }
  try {
    return await fetchWithTimeout(proxyUrl);
  } catch (error) {
    if (lastResponse) return lastResponse;
    throw error;
  }
}

function in24h(publishedAt: string): boolean {
  const ts = new Date(publishedAt).getTime();
  return Number.isFinite(ts) && ts >= CUTOFF_MS;
}

function rssLimitFor(outlet: typeof OUTLET_FEEDS[number]): number {
  if (
    (outlet.sourceType || 'global') === 'portal'
    && (outlet.section || outlet.beat) === 'world'
    && /Google State:|Bing State:|Google Metro:|Bing Metro:|Google US World Topic|Google LATAM Regional Topic|Bing LATAM Topic|Bing US World Topic/i.test(outlet.name)
  ) {
    return 60;
  }
  return RSS_LIMIT;
}

function sitemapLimitFor(outlet: typeof OUTLET_FEEDS[number]): number {
  if (
    (outlet.sourceType || 'global') === 'portal'
    && (outlet.section || outlet.beat) === 'world'
    && /Google State:|Bing State:|Google Metro:|Bing Metro:|Google US World Topic|Google LATAM Regional Topic|Bing LATAM Topic|Bing US World Topic/i.test(outlet.name)
  ) {
    return 60;
  }
  return SITEMAP_LIMIT;
}

async function countOutlet(outlet: typeof OUTLET_FEEDS[number]): Promise<Row> {
  const row: Row = {
    outletId: outlet.id,
    source: outlet.name,
    tier: outlet.tier,
    country: outlet.country,
    sourceType: outlet.sourceType || 'global',
    reviewDecision: outlet.reviewDecision || 'unknown',
    rssUrl: outlet.rssUrl,
    sitemapUrl: outlet.sitemapUrl,
    rssParsed: 0,
    sitemapParsed: 0,
    rss24h: 0,
    sitemap24h: 0,
    total24h: 0,
    rssUnique24h: 0,
    sitemapUnique24h: 0,
    unique24h: 0,
    dedupeRate: 0,
    recentItems24h: [],
    errors: []
  };

  if (outlet.rssUrl) {
    try {
      const res = await fetchWithRetryAndProxy(outlet.rssUrl);
      if (!res.ok) {
        row.errors.push(`rss:${res.status}`);
      } else {
        const xml = await res.text();
        const parsed = parseRssOrAtom(xml, rssLimitFor(outlet));
        row.rssParsed = parsed.length;
        const recent = parsed.filter((item) => in24h(item.publishedAt));
        row.rss24h = recent.length;
        row.rssUnique24h = dedupeItems(recent).length;
        row.recentItems24h.push(...recent);
      }
    } catch (error) {
      row.errors.push(`rss:err:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (outlet.sitemapUrl) {
    try {
      const res = await fetchWithRetryAndProxy(outlet.sitemapUrl);
      if (!res.ok) {
        row.errors.push(`sitemap:${res.status}`);
      } else {
        const xml = await res.text();
        const parsed = parseSitemap(xml, sitemapLimitFor(outlet));
        row.sitemapParsed = parsed.length;
        const recent = parsed.filter((item) => in24h(item.publishedAt));
        row.sitemap24h = recent.length;
        row.sitemapUnique24h = dedupeItems(recent).length;
        row.recentItems24h.push(...recent);
      }
    } catch (error) {
      row.errors.push(`sitemap:err:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  row.total24h = row.rss24h + row.sitemap24h;
  row.unique24h = dedupeItems(row.recentItems24h).length;
  row.dedupeRate = row.total24h > 0 ? 1 - row.unique24h / row.total24h : 0;
  return row;
}

async function runWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;

  async function worker(): Promise<void> {
    while (idx < items.length) {
      const current = idx;
      idx += 1;
      results[current] = await fn(items[current]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function csvEscape(value: string | number): string {
  const raw = String(value ?? '');
  if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
    return `"${raw.replaceAll('"', '""')}"`;
  }
  return raw;
}

function toCsv(rows: Row[]): string {
  const header = [
    'outlet_id', 'source', 'tier', 'country', 'source_type', 'review_decision',
    'rss_parsed', 'sitemap_parsed', 'rss_24h', 'sitemap_24h', 'total_24h',
    'rss_unique_24h', 'sitemap_unique_24h', 'unique_24h', 'dedupe_rate',
    'rss_url', 'sitemap_url', 'errors'
  ];

  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      r.outletId,
      r.source,
      r.tier,
      r.country,
      r.sourceType,
      r.reviewDecision,
      r.rssParsed,
      r.sitemapParsed,
      r.rss24h,
      r.sitemap24h,
      r.total24h,
      r.rssUnique24h,
      r.sitemapUnique24h,
      r.unique24h,
      r.dedupeRate.toFixed(4),
      r.rssUrl || '',
      r.sitemapUrl || '',
      r.errors.join(' | ')
    ].map(csvEscape).join(','));
  }

  return `${lines.join('\n')}\n`;
}

function top(rows: Row[], n = 20): Row[] {
  return [...rows].sort((a, b) => b.total24h - a.total24h).slice(0, n);
}

function sum(rows: Row[]): number {
  return rows.reduce((acc, row) => acc + row.total24h, 0);
}

function sumUnique(rows: Row[]): number {
  return rows.reduce((acc, row) => acc + row.unique24h, 0);
}

function crossSourceUnique(rows: Row[]): number {
  const merged = rows.flatMap((row) => row.recentItems24h);
  return dedupeItems(merged).length;
}

function worldLatamShare(rows: Row[]): { worldTotal: number; worldLatam: number; ratio: number } {
  const sectionBySource = new Map(OUTLET_FEEDS.map((outlet) => [outlet.name, outlet.section || outlet.beat || 'general']));
  let worldTotal = 0;
  let worldLatam = 0;

  for (const row of rows) {
    const section = sectionBySource.get(row.source);
    if (section !== 'world') continue;
    for (const item of row.recentItems24h) {
      worldTotal += 1;
      if (isLatamCountry(row.country) || isLatamEntityTitle(item.title)) {
        worldLatam += 1;
      }
    }
  }

  return {
    worldTotal,
    worldLatam,
    ratio: worldTotal > 0 ? worldLatam / worldTotal : 0
  };
}

function distinctDomains(rows: Row[]): number {
  const domains = new Set<string>();
  for (const row of rows) {
    for (const item of row.recentItems24h) {
      const domain = extractDomain(item.link);
      if (domain) domains.add(domain);
    }
  }
  return domains.size;
}

function activeNewsrooms(rows: Row[]): number {
  return rows.filter((row) => row.total24h > 0).length;
}

function previousDayNewSourceRatio(stamp: string, currentRows: Row[]): string {
  try {
    const files = readdirSync(resolve(process.cwd(), 'audits'))
      .filter((name) => /^source_daily_counts_\d{4}-\d{2}-\d{2}\.csv$/.test(name) && !name.includes(stamp))
      .sort();
    const previous = files[files.length - 1];
    if (!previous) return 'n/a';
    const raw = readFileSync(resolve(process.cwd(), 'audits', previous), 'utf8').trim();
    if (!raw) return 'n/a';
    const lines = raw.split('\n');
    if (lines.length < 2) return 'n/a';
    const header = lines[0].split(',');
    const sourceIdx = header.indexOf('source');
    const totalIdx = header.indexOf('total_24h');
    if (sourceIdx < 0 || totalIdx < 0) return 'n/a';
    const previousActive = new Set<string>();
    for (let i = 1; i < lines.length; i += 1) {
      const cols = lines[i].split(',');
      if (!cols[sourceIdx]) continue;
      const total = Number(cols[totalIdx] || 0);
      if (Number.isFinite(total) && total > 0) previousActive.add(cols[sourceIdx]);
    }
    const currentActive = currentRows.filter((row) => row.total24h > 0).map((row) => row.source);
    if (currentActive.length === 0) return 'n/a';
    const newCount = currentActive.filter((source) => !previousActive.has(source)).length;
    return `${((newCount / currentActive.length) * 100).toFixed(1)}% (${newCount}/${currentActive.length})`;
  } catch {
    return 'n/a';
  }
}

function normalizeCountry(country: string): string {
  const c = country.trim().toLowerCase();
  if (c === 'us') return 'United States';
  if (c === 'latam' || c === 'latin america') return 'LATAM';
  return country;
}

function regionOf(country: string): 'US' | 'LATAM' | null {
  const normalized = normalizeCountry(country).toLowerCase();
  if (normalized === 'united states') return 'US';
  if (normalized === 'latam' || normalized === 'chile' || normalized === 'argentina' || normalized === 'uruguay') return 'LATAM';
  return null;
}

function inUsLatamScope(row: Row): boolean {
  return regionOf(row.country) !== null;
}

function byMatcher(rows: Row[], matchers: RegExp[]): Row[] {
  return rows.filter((row) => matchers.some((m) => m.test(row.source)));
}

function toMarkdown(rows: Row[]): string {
  const scoped = rows.filter(inUsLatamScope);
  const stamp = new Date().toISOString().slice(0, 10);
  const total24h = sum(scoped);
  const totalUnique24h = sumUnique(scoped);
  const totalCrossSourceUnique24h = crossSourceUnique(scoped);
  const overallDedupeRate = total24h > 0 ? 1 - totalUnique24h / total24h : 0;
  const overallCrossSourceDedupeRate = total24h > 0 ? 1 - totalCrossSourceUnique24h / total24h : 0;
  const attainment = TARGET_24H > 0 ? (total24h / TARGET_24H) * 100 : 0;
  const totalDomains = distinctDomains(scoped);
  const totalNewsrooms = activeNewsrooms(scoped);
  const newSourceRatio = previousDayNewSourceRatio(stamp, scoped);
  const worldLatam = worldLatamShare(scoped);
  const activeCount = scoped.length;
  const withErrors = scoped.filter((r) => r.errors.length > 0).length;
  const usRows = scoped.filter((r) => regionOf(r.country) === 'US');
  const latamRows = scoped.filter((r) => regionOf(r.country) === 'LATAM');
  const usCrossUnique = crossSourceUnique(usRows);
  const latamCrossUnique = crossSourceUnique(latamRows);

  const reutersRows = byMatcher(scoped, [/Reuters/i]);
  const apRows = byMatcher(scoped, [/^AP\b/i, /AP News/i]);

  const lines: string[] = [];
  lines.push('# Daily Source Metadata Volume (US + LATAM)');
  lines.push('');
  lines.push(`- Generated at: ${new Date().toISOString()}`);
  lines.push(`- Window: last ${HOURS} hours`);
  lines.push(`- Sources measured (active, US+LATAM): ${activeCount}`);
  lines.push(`- Total metadata items observed (24h, raw): ${total24h}`);
  lines.push(`- Target attainment (raw vs ${TARGET_24H}/24h): ${attainment.toFixed(1)}%`);
  lines.push(`- Total metadata items observed (24h, unique by source): ${totalUnique24h}`);
  lines.push(`- Total metadata items observed (24h, unique cross-source): ${totalCrossSourceUnique24h}`);
  lines.push(`- Dedupe rate (within source): ${(overallDedupeRate * 100).toFixed(1)}%`);
  lines.push(`- Dedupe rate (cross-source): ${(overallCrossSourceDedupeRate * 100).toFixed(1)}%`);
  lines.push(`- Distinct domains (24h): ${totalDomains}`);
  lines.push(`- Active newsrooms (24h): ${totalNewsrooms}`);
  lines.push(`- World LATAM coverage: ${worldLatam.worldLatam}/${worldLatam.worldTotal} (${(worldLatam.ratio * 100).toFixed(1)}% of world)`);
  lines.push(`- New-source ratio vs previous report: ${newSourceRatio}`);
  lines.push(`- Sources with fetch/parse errors: ${withErrors}`);
  lines.push('');

  lines.push('## Region Summary');
  lines.push('');
  lines.push(`- US: raw ${sum(usRows)} / unique by source ${sumUnique(usRows)} / unique cross-source ${usCrossUnique} across ${usRows.length} sources`);
  lines.push(`- LATAM: raw ${sum(latamRows)} / unique by source ${sumUnique(latamRows)} / unique cross-source ${latamCrossUnique} across ${latamRows.length} sources`);
  lines.push('');

  lines.push('## Reuters / AP');
  lines.push('');
  lines.push(`- Reuters (all configured Reuters sources): ${sum(reutersRows)}`);
  lines.push(`- AP (all configured AP sources): ${sum(apRows)}`);
  lines.push('');

  lines.push('| Source | 24h raw | 24h unique | Dedupe | RSS parsed | Sitemap parsed | Errors |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const r of [...reutersRows, ...apRows]) {
    lines.push(`| ${r.source} | ${r.total24h} | ${r.unique24h} | ${(r.dedupeRate * 100).toFixed(1)}% | ${r.rssParsed} | ${r.sitemapParsed} | ${r.errors.join('; ') || '-'} |`);
  }
  lines.push('');

  lines.push('## Top 25 Sources (US + LATAM, 24h items)');
  lines.push('');
  lines.push('| Source | 24h raw | 24h unique | Dedupe | Country | Type | Policy | Errors |');
  lines.push('| --- | ---: | ---: | ---: | --- | --- | --- | --- |');
  for (const r of top(scoped, 25)) {
    lines.push(`| ${r.source} | ${r.total24h} | ${r.unique24h} | ${(r.dedupeRate * 100).toFixed(1)}% | ${r.country} | ${r.sourceType} | ${r.reviewDecision} | ${r.errors.join('; ') || '-'} |`);
  }

  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- Counts are based on feed metadata timestamps (`publishedAt` / `lastmod`) seen at collection time.');
  lines.push('- If an item has missing/invalid date in feed metadata, exact 24h assignment can be less precise.');

  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const rows = await runWithConcurrency(OUTLET_FEEDS, CONCURRENCY, countOutlet);
  const scopedRows = rows.filter(inUsLatamScope);
  scopedRows.sort((a, b) => b.total24h - a.total24h || a.source.localeCompare(b.source));

  const stamp = new Date().toISOString().slice(0, 10);
  const csvPath = resolve(process.cwd(), `audits/source_daily_counts_${stamp}.csv`);
  const mdPath = resolve(process.cwd(), `audits/source_daily_counts_${stamp}.md`);

  writeFileSync(csvPath, toCsv(scopedRows), 'utf8');
  writeFileSync(mdPath, toMarkdown(scopedRows), 'utf8');

  console.log(`Wrote ${csvPath}`);
  console.log(`Wrote ${mdPath}`);
}

void main();
