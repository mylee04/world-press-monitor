#!/usr/bin/env bun

import { Client } from 'pg';
import { normalizeSourceCategories } from '@/lib/article-taxonomy';
import { resolveDatabaseUrl } from '@/lib/database-url';
import {
  backfillNewsArticleFeedCategories,
  type NewsArticleFeedCategoryBackfill,
} from '@/lib/ingestion-store';

type CliArgs = {
  apply: boolean;
  days: number;
  sources: string[];
};

type EmptyRow = {
  external_id: string;
  source: string;
};

const DEFAULT_DAYS = 3650;
const DEFAULT_SOURCE_LIMIT = 2000;
const GENERIC_SEGMENT_PATTERNS = [
  /\bnews sitemap\b/i,
  /\bgoogle news sitemap\b/i,
  /\bsitemap index\b/i,
  /\bsitemap\b/i,
  /\blatest sitemap\b/i,
  /\bdaily sitemap\b/i,
  /\bbreaking news\b/i,
  /\btop stories\b/i,
  /\blatest articles?\b/i,
  /\blive sitemap\b/i,
  /\bnews latest\b/i,
  /\bnews\b/i,
  /\bpodcast xml\b/i,
  /\bfull sitemap\b/i,
  /\ball news\b/i,
  /\blatest\b/i,
  /\btoday\b/i,
  /\bhome\b/i,
  /\bgeneral\b/i,
];
const MONTH_PATTERN =
  /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/i;

function parseArgs(argv: string[]): CliArgs {
  return {
    apply: argv.includes('--apply'),
    days: parseNumberArg(argv, '--days=', DEFAULT_DAYS, 1, 3650),
    sources: parseListArg(argv, '--sources='),
  };
}

function parseNumberArg(argv: string[], prefix: string, fallback: number, min: number, max: number): number {
  const raw = argv.find((item) => item.startsWith(prefix));
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw.slice(prefix.length), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseListArg(argv: string[], prefix: string): string[] {
  const raw = argv.find((item) => item.startsWith(prefix));
  if (!raw) return [];
  return [...new Set(raw.slice(prefix.length).split(',').map((item) => item.trim()).filter(Boolean))];
}

async function fetchCandidateSources(client: Client, days: number, requestedSources: string[]): Promise<string[]> {
  if (requestedSources.length) return requestedSources;
  const result = await client.query<{ source: string }>(
    `
    select source
    from news_articles
    where coalesce(cardinality(feed_categories), 0) = 0
      and (
        publication_datetime >= now() - ($1::int * interval '1 day')
        or created_at >= now() - ($1::int * interval '1 day')
      )
    group by source
    order by count(*) desc, source asc
    limit $2
    `,
    [days, DEFAULT_SOURCE_LIMIT]
  );
  return result.rows.map((row) => row.source.trim()).filter(Boolean);
}

async function fetchEmptyRows(client: Client, days: number, sources: string[]): Promise<EmptyRow[]> {
  if (!sources.length) return [];
  const result = await client.query<EmptyRow>(
    `
    select external_id, source
    from news_articles
    where source = any($2::text[])
      and coalesce(cardinality(feed_categories), 0) = 0
      and (
        publication_datetime >= now() - ($1::int * interval '1 day')
        or created_at >= now() - ($1::int * interval '1 day')
      )
    `,
    [days, sources]
  );
  return result.rows;
}

function deriveSourceCategoriesFromSourceLabel(source: string): string[] {
  const raw = (source || '').trim();
  if (!raw) return [];

  const candidates: string[] = [];
  for (const match of raw.matchAll(/[([（]([^()（）]+)[)）]/g)) {
    candidates.push(match[1] || '');
  }

  const hyphenParts = raw.split(/\s+-\s+/).slice(1);
  candidates.push(...hyphenParts);

  return normalizeSourceCategories(
    candidates
      .flatMap((candidate) => explodeLabelCandidate(candidate))
      .map((candidate) => candidate.trim())
      .filter((candidate) => isMeaningfulLabelCandidate(candidate))
  );
}

function explodeLabelCandidate(value: string): string[] {
  return (value || '')
    .split(/\s*(?:\/|,|;|&|\||·|\+)\s*/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isMeaningfulLabelCandidate(value: string): boolean {
  const normalized = value
    .replace(/[()（）]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return false;
  if (normalized.length < 2) return false;
  if (/^\d+(?:[-/]\d+)*$/.test(normalized)) return false;
  if (MONTH_PATTERN.test(normalized) && /\b20\d{2}\b/.test(normalized)) return false;
  if (/\b20\d{2}\b/.test(normalized) && /\bsitemap\b/i.test(normalized)) return false;

  return !GENERIC_SEGMENT_PATTERNS.some((pattern) => pattern.test(normalized));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const client = new Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();

  try {
    const sources = await fetchCandidateSources(client, args.days, args.sources);
    const categoriesBySource = new Map<string, string[]>();
    for (const source of sources) {
      const categories = deriveSourceCategoriesFromSourceLabel(source);
      if (categories.length) {
        categoriesBySource.set(source, categories);
      }
    }

    const rows = await fetchEmptyRows(client, args.days, [...categoriesBySource.keys()]);
    const updates: NewsArticleFeedCategoryBackfill[] = rows
      .map((row) => ({
        externalId: row.external_id,
        sourceCategories: categoriesBySource.get(row.source) || [],
      }))
      .filter((item) => item.sourceCategories.length > 0);

    console.log(
      `[backfill-source-categories-from-source-label] sources=${categoriesBySource.size} candidates=${rows.length} matched=${updates.length}`
    );

    if (!args.apply) {
      console.log('[backfill-source-categories-from-source-label] dry-run complete; re-run with --apply to persist');
      return;
    }

    const result = await backfillNewsArticleFeedCategories(updates);
    console.log(`[backfill-source-categories-from-source-label] updated=${result.updated} storage=${result.storage}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[backfill-source-categories-from-source-label] failed');
  console.error(error);
  process.exit(1);
});
