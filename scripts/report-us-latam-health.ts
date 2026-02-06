import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OUTLET_FEEDS } from '../data/outlets';
import { parseRssOrAtom, parseSitemap } from '../lib/parsers';
import { dedupeItems } from '../lib/dedupe';

type Region = 'US' | 'LATAM';

type Row = {
  region: Region;
  outletId: string;
  source: string;
  country: string;
  sourceType: string;
  reviewDecision: string;
  attemptedEndpoints: number;
  failedEndpoints: number;
  failureRate: number;
  parsedCount: number;
  recent24h: number;
  unique24h: number;
  dedupeRate: number;
  recentItems24h: { title: string; link: string; publishedAt: string }[];
  errors: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const RSS_LIMIT = 250;
const SITEMAP_LIMIT = 250;
const TIMEOUT_MS = 18000;
const CONCURRENCY = 8;
const UA = 'Mozilla/5.0 (compatible; PressLabUSLATAMHealth/1.0; +https://presslab.local)';

function normalizeCountry(country: string): string {
  const c = country.trim().toLowerCase();
  if (c === 'us') return 'United States';
  if (c === 'latam') return 'LATAM';
  return country;
}

function regionOf(country: string): Region | null {
  const normalized = normalizeCountry(country).toLowerCase();
  if (normalized === 'united states') return 'US';
  if (normalized === 'latam' || normalized === 'chile' || normalized === 'argentina' || normalized === 'uruguay') return 'LATAM';
  return null;
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

function in24h(publishedAt: string): boolean {
  const ts = new Date(publishedAt).getTime();
  return Number.isFinite(ts) && ts >= Date.now() - DAY_MS;
}

async function measure(outlet: typeof OUTLET_FEEDS[number], region: Region): Promise<Row> {
  let attemptedEndpoints = 0;
  let failedEndpoints = 0;
  let parsedCount = 0;
  let recent24h = 0;
  const recentItems: { title: string; link: string; publishedAt: string }[] = [];
  const errors: string[] = [];

  if (outlet.rssUrl) {
    attemptedEndpoints += 1;
    try {
      const res = await fetchWithTimeout(outlet.rssUrl);
      if (!res.ok) {
        failedEndpoints += 1;
        errors.push(`rss:http_${res.status}`);
      } else {
        const xml = await res.text();
        const parsed = parseRssOrAtom(xml, RSS_LIMIT);
        parsedCount += parsed.length;
        const recent = parsed.filter((item) => in24h(item.publishedAt));
        recent24h += recent.length;
        recentItems.push(...recent);
      }
    } catch (error) {
      failedEndpoints += 1;
      errors.push(`rss:err:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (outlet.sitemapUrl) {
    attemptedEndpoints += 1;
    try {
      const res = await fetchWithTimeout(outlet.sitemapUrl);
      if (!res.ok) {
        failedEndpoints += 1;
        errors.push(`sitemap:http_${res.status}`);
      } else {
        const xml = await res.text();
        const parsed = parseSitemap(xml, SITEMAP_LIMIT);
        parsedCount += parsed.length;
        const recent = parsed.filter((item) => in24h(item.publishedAt));
        recent24h += recent.length;
        recentItems.push(...recent);
      }
    } catch (error) {
      failedEndpoints += 1;
      errors.push(`sitemap:err:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const failureRate = attemptedEndpoints > 0 ? failedEndpoints / attemptedEndpoints : 0;
  const unique24h = dedupeItems(recentItems).length;
  const dedupeRate = recent24h > 0 ? 1 - unique24h / recent24h : 0;

  return {
    region,
    outletId: outlet.id,
    source: outlet.name,
    country: normalizeCountry(outlet.country),
    sourceType: outlet.sourceType || 'global',
    reviewDecision: outlet.reviewDecision || 'unknown',
    attemptedEndpoints,
    failedEndpoints,
    failureRate,
    parsedCount,
    recent24h,
    unique24h,
    dedupeRate,
    recentItems24h: recentItems,
    errors: errors.join(' | ')
  };
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
    'region', 'outlet_id', 'source', 'country', 'source_type', 'review_decision',
    'attempted_endpoints', 'failed_endpoints', 'failure_rate', 'parsed_count',
    'recent_24h_raw', 'recent_24h_unique', 'dedupe_rate', 'errors'
  ];
  const lines = [header.join(',')];

  for (const row of rows) {
    lines.push([
      row.region,
      row.outletId,
      row.source,
      row.country,
      row.sourceType,
      row.reviewDecision,
      row.attemptedEndpoints,
      row.failedEndpoints,
      row.failureRate.toFixed(4),
      row.parsedCount,
      row.recent24h,
      row.unique24h,
      row.dedupeRate.toFixed(4),
      row.errors
    ].map(csvEscape).join(','));
  }

  return `${lines.join('\n')}\n`;
}

function crossSourceUnique(rows: Row[], region: Region): number {
  const merged = rows
    .filter((r) => r.region === region)
    .flatMap((r) => r.recentItems24h);
  return dedupeItems(merged).length;
}

function summarize(rows: Row[], region: Region): { total24hRaw: number; total24hUniqueBySource: number; total24hUniqueCrossSource: number; avgFailure: number; avgDedupe: number; outlets: number } {
  const subset = rows.filter((r) => r.region === region);
  const total24hRaw = subset.reduce((acc, r) => acc + r.recent24h, 0);
  const total24hUniqueBySource = subset.reduce((acc, r) => acc + r.unique24h, 0);
  const total24hUniqueCrossSource = crossSourceUnique(rows, region);
  const avgFailure = subset.length > 0
    ? subset.reduce((acc, r) => acc + r.failureRate, 0) / subset.length
    : 0;
  const avgDedupe = subset.length > 0
    ? subset.reduce((acc, r) => acc + r.dedupeRate, 0) / subset.length
    : 0;
  return { total24hRaw, total24hUniqueBySource, total24hUniqueCrossSource, avgFailure, avgDedupe, outlets: subset.length };
}

function topBy24h(rows: Row[], region: Region, n = 15): Row[] {
  return rows
    .filter((r) => r.region === region)
    .sort((a, b) => b.recent24h - a.recent24h)
    .slice(0, n);
}

function topByFailure(rows: Row[], region: Region, n = 15): Row[] {
  return rows
    .filter((r) => r.region === region && r.attemptedEndpoints > 0)
    .sort((a, b) => b.failureRate - a.failureRate)
    .slice(0, n);
}

function toMarkdown(rows: Row[]): string {
  const us = summarize(rows, 'US');
  const latam = summarize(rows, 'LATAM');

  const lines: string[] = [];
  lines.push('# US + LATAM Source Health Report');
  lines.push('');
  lines.push(`- Generated at: ${new Date().toISOString()}`);
  lines.push(`- Window: last 24 hours`);
  lines.push('');

  lines.push('## Region Summary');
  lines.push('');
  lines.push('| Region | Outlets | 24h raw | 24h unique (by source) | 24h unique (cross-source) | Avg dedupe | Avg failure rate |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  lines.push(`| US | ${us.outlets} | ${us.total24hRaw} | ${us.total24hUniqueBySource} | ${us.total24hUniqueCrossSource} | ${(us.avgDedupe * 100).toFixed(1)}% | ${(us.avgFailure * 100).toFixed(1)}% |`);
  lines.push(`| LATAM | ${latam.outlets} | ${latam.total24hRaw} | ${latam.total24hUniqueBySource} | ${latam.total24hUniqueCrossSource} | ${(latam.avgDedupe * 100).toFixed(1)}% | ${(latam.avgFailure * 100).toFixed(1)}% |`);

  lines.push('');
  lines.push('## US Top Sources by 24h');
  lines.push('');
  lines.push('| Source | 24h raw | 24h unique | Dedupe | Failure rate | Errors |');
  lines.push('| --- | ---: | ---: | ---: | ---: | --- |');
  for (const row of topBy24h(rows, 'US')) {
    lines.push(`| ${row.source} | ${row.recent24h} | ${row.unique24h} | ${(row.dedupeRate * 100).toFixed(1)}% | ${(row.failureRate * 100).toFixed(0)}% | ${row.errors || '-'} |`);
  }

  lines.push('');
  lines.push('## LATAM Top Sources by 24h');
  lines.push('');
  lines.push('| Source | Country | 24h raw | 24h unique | Dedupe | Failure rate | Errors |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | --- |');
  for (const row of topBy24h(rows, 'LATAM')) {
    lines.push(`| ${row.source} | ${row.country} | ${row.recent24h} | ${row.unique24h} | ${(row.dedupeRate * 100).toFixed(1)}% | ${(row.failureRate * 100).toFixed(0)}% | ${row.errors || '-'} |`);
  }

  lines.push('');
  lines.push('## US Highest Failure Rate');
  lines.push('');
  lines.push('| Source | Failure rate | Endpoints failed/attempted | Errors |');
  lines.push('| --- | ---: | --- | --- |');
  for (const row of topByFailure(rows, 'US')) {
    lines.push(`| ${row.source} | ${(row.failureRate * 100).toFixed(0)}% | ${row.failedEndpoints}/${row.attemptedEndpoints} | ${row.errors || '-'} |`);
  }

  lines.push('');
  lines.push('## LATAM Highest Failure Rate');
  lines.push('');
  lines.push('| Source | Country | Failure rate | Endpoints failed/attempted | Errors |');
  lines.push('| --- | --- | ---: | --- | --- |');
  for (const row of topByFailure(rows, 'LATAM')) {
    lines.push(`| ${row.source} | ${row.country} | ${(row.failureRate * 100).toFixed(0)}% | ${row.failedEndpoints}/${row.attemptedEndpoints} | ${row.errors || '-'} |`);
  }

  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const targets = OUTLET_FEEDS
    .map((outlet) => ({ outlet, region: regionOf(outlet.country) }))
    .filter((x): x is { outlet: typeof OUTLET_FEEDS[number]; region: Region } => Boolean(x.region));

  const rows = await runWithConcurrency(targets, CONCURRENCY, async ({ outlet, region }) => measure(outlet, region));
  rows.sort((a, b) => b.recent24h - a.recent24h || a.source.localeCompare(b.source));

  const stamp = new Date().toISOString().slice(0, 10);
  const csvPath = resolve(process.cwd(), `audits/us_latam_source_health_${stamp}.csv`);
  const mdPath = resolve(process.cwd(), `audits/us_latam_source_health_${stamp}.md`);

  writeFileSync(csvPath, toCsv(rows), 'utf8');
  writeFileSync(mdPath, toMarkdown(rows), 'utf8');

  console.log(`Wrote ${csvPath}`);
  console.log(`Wrote ${mdPath}`);
}

void main();
