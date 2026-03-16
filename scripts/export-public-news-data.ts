#!/usr/bin/env bun
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Pool } from 'pg';
import {
  PUBLIC_DATA_SCHEMA_VERSION,
  PUBLIC_DATA_SECTIONS,
  type PublicCountryFeedFile,
  type PublicCountryMonthShard,
  type PublicDataManifest,
  type PublicDateShard,
  type PublicIntegrationManifest,
  type PublicNewsArticle,
  type PublicSourceHealth,
  type PublicSourceRecord,
  type PublicSourcesFile,
} from '@/lib/public-data';
import { resolveDatabaseUrl } from '@/lib/database-url';
import { classifySectionByKeyword } from '@/lib/keyword-classifier';
import type { NewsSection } from '@/lib/types';

type AtlasFeed = {
  name: string;
  url: string | null;
  sitemapUrl?: string | null;
};

type AtlasCountry = {
  name: string;
  code: string;
  feeds: AtlasFeed[];
};

type Atlas = {
  countries: AtlasCountry[];
};

type ArticleRow = {
  id: string;
  source: string;
  country: string | null;
  language: string | null;
  section: string | null;
  title: string;
  snippet: string | null;
  url: string;
  publication_datetime: string;
  created_at: string;
};

type HealthRow = {
  source: string;
  country: string | null;
  ran_at: string;
  method: string;
  attempted: boolean;
  ok: boolean;
  status_code: number | null;
  health_classification: string | null;
  error: string | null;
  requested_url: string | null;
  final_url: string | null;
};

type CountryDirectory = {
  countryCodeByName: Map<string, string>;
  countryNameByCode: Map<string, string>;
};

const DATABASE_URL = resolveDatabaseUrl();
const ATLAS_PATH = process.env.ATLAS_PATH || resolve(process.cwd(), 'data/rss-atlas.json');
const OUTPUT_DIR = resolve(process.cwd(), process.env.PUBLIC_EXPORT_DIR || 'exports/public-data');
const EXPORT_DAYS = clampInt(process.env.PUBLIC_EXPORT_DAYS, 1, 90, 14);
const LATEST_HOURS = clampInt(process.env.PUBLIC_EXPORT_LATEST_HOURS, 1, 72, 24);
const MAX_ROWS = clampInt(process.env.PUBLIC_EXPORT_MAX_ROWS, 100, 250000, 50000);
const PUBLIC_EXPORT_TIMEZONE = (process.env.PUBLIC_EXPORT_TIMEZONE || process.env.INGEST_TZ || 'America/Chicago').trim();
const PUBLIC_EXPORT_SCHEDULE_MINUTE = clampInt(process.env.PUBLIC_EXPORT_SCHEDULE_MINUTE, 0, 59, 40);
const WRITE_LATEST_24H_CSV = parseBool(process.env.PUBLIC_EXPORT_WRITE_LATEST_24H_CSV, true);
const WRITE_BY_DATE_CSV = parseBool(process.env.PUBLIC_EXPORT_WRITE_BY_DATE_CSV, false);
const WRITE_BY_COUNTRY_MONTH_CSV = parseBool(process.env.PUBLIC_EXPORT_WRITE_BY_COUNTRY_MONTH_CSV, false);
const FALLBACK_COUNTRY_CODE = 'GLOBAL';
const MAX_FUTURE_PUBLICATION_HOURS = clampInt(process.env.PUBLIC_EXPORT_MAX_FUTURE_HOURS, 1, 168, 6);

async function main(): Promise<void> {
  const atlas = loadAtlas();
  const countryDirectory = buildCountryDirectory(atlas);
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    const articles = await readArticles(pool, countryDirectory);
    const health = await readLatestHealth(pool);
    const sources = buildSourcesFile(atlas, health, countryDirectory);

    resetOutputDir(OUTPUT_DIR);
    writeDataFiles(articles, sources, countryDirectory);

    console.log(
      `[export-public-news-data] exported ${articles.length} articles, ${sources.sources.length} sources to ${OUTPUT_DIR}`
    );
  } finally {
    await pool.end();
  }
}

function clampInt(raw: string | undefined, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(raw || '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function loadAtlas(): Atlas {
  const raw = readFileSync(ATLAS_PATH, 'utf8');
  const atlas = JSON.parse(raw) as Atlas;
  if (!Array.isArray(atlas.countries)) {
    throw new Error(`Invalid atlas format in ${ATLAS_PATH}`);
  }
  return atlas;
}

function buildCountryDirectory(atlas: Atlas): CountryDirectory {
  const countryCodeByName = new Map<string, string>();
  const countryNameByCode = new Map<string, string>();

  for (const country of atlas.countries) {
    if (!country.name || !country.code) continue;
    countryCodeByName.set(country.name.trim(), country.code.trim().toUpperCase());
    countryNameByCode.set(country.code.trim().toUpperCase(), country.name.trim());
  }

  countryCodeByName.set('Global', FALLBACK_COUNTRY_CODE);
  countryNameByCode.set(FALLBACK_COUNTRY_CODE, 'Global');

  return { countryCodeByName, countryNameByCode };
}

async function readArticles(pool: Pool, directory: CountryDirectory): Promise<PublicNewsArticle[]> {
  const result = await pool.query<ArticleRow>(
    `
    select
      external_id as id,
      source,
      country,
      language,
      section,
      title_original as title,
      snippet_original as snippet,
      url,
      publication_datetime,
      created_at
    from news_articles
    where publication_datetime >= now() - ($1::int * interval '1 day')
    order by publication_datetime desc, created_at desc
    limit $2
    `,
    [EXPORT_DAYS, MAX_ROWS]
  );

  return result.rows.map((row) => {
    const countryName = normalizeCountryName(row.country);
    const countryCode = directory.countryCodeByName.get(countryName) || FALLBACK_COUNTRY_CODE;
    const publicationDatetime = normalizePublicationDatetime(row.publication_datetime, row.created_at);
    const storedSection = normalizeSection(row.section);
    const section = classifySectionByKeyword(`${row.title} ${row.snippet || ''}`, storedSection).section;
    return {
      id: row.id,
      source: row.source,
      country: countryName,
      countryCode,
      language: (row.language || '').trim() || 'und',
      section,
      title: row.title,
      snippet: row.snippet || '',
      url: row.url,
      publicationDatetime,
      createdAt: new Date(row.created_at).toISOString(),
    } satisfies PublicNewsArticle;
  });
}

async function readLatestHealth(pool: Pool): Promise<Map<string, PublicSourceHealth>> {
  const result = await pool.query<HealthRow>(
    `
    select distinct on (coalesce(country, 'Global'), source)
      source,
      country,
      ran_at,
      method,
      attempted,
      ok,
      status_code,
      health_classification,
      error,
      requested_url,
      final_url
    from rss_health_status
    where ran_at >= now() - interval '30 days'
    order by coalesce(country, 'Global'), source, ran_at desc
    `
  );

  const map = new Map<string, PublicSourceHealth>();
  for (const row of result.rows) {
    const key = makeSourceKey(normalizeCountryName(row.country), row.source);
    map.set(key, {
      ranAt: new Date(row.ran_at).toISOString(),
      method: row.method === 'sitemap' ? 'sitemap' : 'rss',
      attempted: Boolean(row.attempted),
      ok: Boolean(row.ok),
      statusCode: row.status_code,
      healthClassification: row.health_classification,
      error: row.error,
      requestedUrl: row.requested_url,
      finalUrl: row.final_url,
    });
  }
  return map;
}

function buildSourcesFile(
  atlas: Atlas,
  latestHealth: Map<string, PublicSourceHealth>,
  directory: CountryDirectory
): PublicSourcesFile {
  const generatedAt = new Date().toISOString();
  const deduped = new Map<string, PublicSourceRecord>();

  for (const country of atlas.countries) {
    const countryCode = country.code.trim().toUpperCase();
    const countryName = country.name.trim();
    directory.countryNameByCode.set(countryCode, countryName);
    for (const feed of country.feeds || []) {
      if (!feed?.name) continue;
      const key = `${countryCode}|${feed.name.trim()}`;
      if (deduped.has(key)) continue;
      deduped.set(key, {
        source: feed.name.trim(),
        country: countryName,
        countryCode,
        rssUrl: typeof feed.url === 'string' && feed.url.trim().length > 0 ? feed.url.trim() : null,
        sitemapUrl:
          typeof feed.sitemapUrl === 'string' && feed.sitemapUrl.trim().length > 0 ? feed.sitemapUrl.trim() : null,
        latestHealth: latestHealth.get(makeSourceKey(countryName, feed.name.trim())) || null,
      });
    }
  }

  return {
    generatedAt,
    sources: [...deduped.values()].sort(
      (a, b) => a.country.localeCompare(b.country) || a.source.localeCompare(b.source)
    ),
  };
}

function resetOutputDir(path: string): void {
  rmSync(path, { recursive: true, force: true });
  mkdirSync(path, { recursive: true });
}

function writeDataFiles(
  articles: PublicNewsArticle[],
  sources: PublicSourcesFile,
  directory: CountryDirectory
): void {
  const generatedAt = new Date().toISOString();
  const availableDates = getAvailableDates(articles);
  const latestDate = availableDates[0] || null;
  const latest24hInsertedArticles = filterLatestCreatedHours(articles, LATEST_HOURS);
  const latest24hPublishedArticles = filterLatestPublicationHours(articles, LATEST_HOURS);
  const sectionTotals = countSections(articles);
  const byDatePaths: string[] = [];
  const byCountryMonthPaths: string[] = [];

  const byDate = groupBy(articles, (article) => article.publicationDatetime.slice(0, 10));
  for (const [date, dateArticles] of [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0]))) {
    const shard: PublicDateShard = {
      generatedAt,
      date,
      articles: dateArticles,
    };
    const outputPath = resolve(OUTPUT_DIR, 'by-date', `${date}.json`);
    writeJson(outputPath, shard);
    byDatePaths.push(`/data/by-date/${date}.json`);
    if (WRITE_BY_DATE_CSV) {
      writeCsv(
        resolve(OUTPUT_DIR, 'downloads', 'by-date', `${date}.csv`),
        dateArticles
      );
    }
  }

  const byCountryMonth = groupBy(articles, (article) => `${article.countryCode}|${article.publicationDatetime.slice(0, 7)}`);
  const countryMonths: Record<string, string[]> = {};
  for (const [key, countryMonthArticles] of [...byCountryMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]))) {
    const [countryCode, month] = key.split('|');
    countryMonths[countryCode] = [...new Set([...(countryMonths[countryCode] || []), month])].sort((a, b) => b.localeCompare(a));
    const shard: PublicCountryMonthShard = {
      generatedAt,
      countryCode,
      country: directory.countryNameByCode.get(countryCode) || countryMonthArticles[0]?.country || 'Global',
      month,
      articles: countryMonthArticles,
    };
    const outputPath = resolve(OUTPUT_DIR, 'by-country', countryCode, `${month}.json`);
    writeJson(outputPath, shard);
    byCountryMonthPaths.push(`/data/by-country/${countryCode}/${month}.json`);
    if (WRITE_BY_COUNTRY_MONTH_CSV) {
      writeCsv(
        resolve(OUTPUT_DIR, 'downloads', 'by-country', countryCode, `${month}.csv`),
        countryMonthArticles
      );
    }
  }

  if (WRITE_LATEST_24H_CSV) {
    writeCsv(resolve(OUTPUT_DIR, 'downloads', 'latest-24h.csv'), latest24hInsertedArticles);
  }
  writeJson(resolve(OUTPUT_DIR, 'sources.json'), sources);

  const countryCodes = [...new Set([
    ...articles.map((article) => article.countryCode),
    ...sources.sources.map((source) => source.countryCode),
  ])].sort((a, b) => a.localeCompare(b));
  const countryNames = Object.fromEntries(
    countryCodes.map((code) => [code, directory.countryNameByCode.get(code) || code])
  );
  const integrationFeeds = writeIntegrationFeeds(
    countryCodes,
    countryNames,
    latest24hPublishedArticles,
    latest24hInsertedArticles,
    generatedAt
  );

  const manifest: PublicDataManifest = {
    generatedAt,
    schemaVersion: PUBLIC_DATA_SCHEMA_VERSION,
    cadence: {
      frequency: 'hourly',
      scheduledMinute: PUBLIC_EXPORT_SCHEDULE_MINUTE,
      timezone: PUBLIC_EXPORT_TIMEZONE,
    },
    latestDate,
    countries: countryCodes,
    countryNames,
    countryMonths,
    sections: PUBLIC_DATA_SECTIONS,
    availableDates,
    downloads: {
      latest24h: WRITE_LATEST_24H_CSV ? '/data/downloads/latest-24h.csv' : '',
      byDate: WRITE_BY_DATE_CSV
        ? byDatePaths.map((path) => path.replace('/by-date/', '/downloads/by-date/').replace('.json', '.csv'))
        : [],
      byCountryMonth: WRITE_BY_COUNTRY_MONTH_CSV
        ? byCountryMonthPaths.map((path) =>
            path.replace('/by-country/', '/downloads/by-country/').replace('.json', '.csv')
          )
        : [],
    },
    shards: {
      byDate: latestDate ? `/data/by-date/${latestDate}.json` : null,
      byCountryMonth: byCountryMonthPaths[0] || null,
    },
    totals: {
      articles: articles.length,
      latest24h: latest24hInsertedArticles.length,
      sources: sources.sources.length,
    },
    sectionTotals,
  };

  writeJson(resolve(OUTPUT_DIR, 'manifest.json'), manifest);
  writeJson(resolve(OUTPUT_DIR, 'integration-manifest.json'), {
    generatedAt,
    schemaVersion: PUBLIC_DATA_SCHEMA_VERSION,
    cadence: manifest.cadence,
    windowHours: LATEST_HOURS,
    semantics: {
      published24h: 'publicationDatetime within the last 24 hours',
      inserted24h: 'createdAt within the last 24 hours',
    },
    countries: countryCodes,
    countryNames,
    feeds: integrationFeeds,
  } satisfies PublicIntegrationManifest);
}

function countSections(articles: PublicNewsArticle[]): Record<NewsSection, number> {
  const totals = Object.fromEntries(PUBLIC_DATA_SECTIONS.map((section) => [section, 0])) as Record<NewsSection, number>;
  for (const article of articles) {
    totals[article.section] += 1;
  }
  return totals;
}

function getAvailableDates(articles: PublicNewsArticle[]): string[] {
  return [...new Set(articles.map((article) => article.publicationDatetime.slice(0, 10)))].sort((a, b) => b.localeCompare(a));
}

function filterLatestCreatedHours(articles: PublicNewsArticle[], hours: number): PublicNewsArticle[] {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return articles.filter((article) => new Date(article.createdAt).getTime() >= cutoff);
}

function filterLatestPublicationHours(articles: PublicNewsArticle[], hours: number): PublicNewsArticle[] {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return articles.filter((article) => new Date(article.publicationDatetime).getTime() >= cutoff);
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const current = grouped.get(key);
    if (current) {
      current.push(item);
      continue;
    }
    grouped.set(key, [item]);
  }
  return grouped;
}

function normalizeSection(value: string | null): NewsSection {
  const candidate = (value || 'others').trim().toLowerCase();
  return PUBLIC_DATA_SECTIONS.includes(candidate as NewsSection) ? (candidate as NewsSection) : 'others';
}

function normalizeCountryName(value: string | null): string {
  const normalized = (value || '').trim();
  return normalized || 'Global';
}

function normalizePublicationDatetime(publicationDatetimeRaw: string, createdAtRaw: string): string {
  const publicationDatetime = new Date(publicationDatetimeRaw);
  const createdAt = new Date(createdAtRaw);
  if (!Number.isFinite(publicationDatetime.getTime())) {
    return createdAt.toISOString();
  }
  const futureCutoff = Date.now() + MAX_FUTURE_PUBLICATION_HOURS * 60 * 60 * 1000;
  if (publicationDatetime.getTime() > futureCutoff) {
    return createdAt.toISOString();
  }
  return publicationDatetime.toISOString();
}

function makeSourceKey(country: string, source: string): string {
  return `${country.trim()}|${source.trim()}`;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeIntegrationFeeds(
  countryCodes: string[],
  countryNames: Record<string, string>,
  latest24hPublishedArticles: PublicNewsArticle[],
  latest24hInsertedArticles: PublicNewsArticle[],
  generatedAt: string
): Record<string, { published24h: string; inserted24h: string }> {
  const publishedByCountry = groupBy(latest24hPublishedArticles, (article) => article.countryCode);
  const insertedByCountry = groupBy(latest24hInsertedArticles, (article) => article.countryCode);
  const feeds: Record<string, { published24h: string; inserted24h: string }> = {};

  for (const countryCode of countryCodes) {
    const country = countryNames[countryCode] || countryCode;
    const publishedPath = `/data/country-published-24h-${countryCode}.json`;
    const insertedPath = `/data/country-inserted-24h-${countryCode}.json`;
    feeds[countryCode] = {
      published24h: publishedPath,
      inserted24h: insertedPath,
    };

    writeJson(resolve(OUTPUT_DIR, `country-published-24h-${countryCode}.json`), {
      generatedAt,
      schemaVersion: PUBLIC_DATA_SCHEMA_VERSION,
      windowHours: LATEST_HOURS,
      windowType: 'publicationDatetime',
      countryCode,
      country,
      articleCount: (publishedByCountry.get(countryCode) || []).length,
      articles: publishedByCountry.get(countryCode) || [],
    } satisfies PublicCountryFeedFile);

    writeJson(resolve(OUTPUT_DIR, `country-inserted-24h-${countryCode}.json`), {
      generatedAt,
      schemaVersion: PUBLIC_DATA_SCHEMA_VERSION,
      windowHours: LATEST_HOURS,
      windowType: 'createdAt',
      countryCode,
      country,
      articleCount: (insertedByCountry.get(countryCode) || []).length,
      articles: insertedByCountry.get(countryCode) || [],
    } satisfies PublicCountryFeedFile);
  }

  return feeds;
}

function writeCsv(path: string, articles: PublicNewsArticle[]): void {
  mkdirSync(dirname(path), { recursive: true });
  const header = [
    'id',
    'source',
    'country',
    'countryCode',
    'language',
    'section',
    'title',
    'snippet',
    'url',
    'publicationDatetime',
    'createdAt',
  ];
  const rows = articles.map((article) =>
    [
      article.id,
      article.source,
      article.country,
      article.countryCode,
      article.language,
      article.section,
      article.title,
      article.snippet,
      article.url,
      article.publicationDatetime,
      article.createdAt,
    ]
      .map(escapeCsvCell)
      .join(',')
  );
  writeFileSync(path, `${header.join(',')}\n${rows.join('\n')}${rows.length ? '\n' : ''}`, 'utf8');
}

function escapeCsvCell(value: string | number | null): string {
  const text = `${value ?? ''}`;
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

main().catch((error) => {
  console.error(
    `[export-public-news-data] ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
