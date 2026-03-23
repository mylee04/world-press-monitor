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
  trainingDays: number;
  limit: number | null;
  minSupport: number;
  minTagShare: number;
  minScore: number;
  sources: string[];
};

type EmptyRow = {
  external_id: string;
  source: string;
  url: string;
};

type FilledRow = {
  source: string;
  url: string;
  feed_categories: string[] | null;
};

type TokenStats = {
  samples: number;
  tagCounts: Map<string, number>;
};

const DEFAULT_DAYS = 3650;
const DEFAULT_TRAINING_DAYS = 3650;
const DEFAULT_MIN_SUPPORT = 5;
const DEFAULT_MIN_TAG_SHARE = 0.5;
const DEFAULT_MIN_SCORE = 2;
const DEFAULT_SOURCE_LIMIT = 50;
const TOKEN_RE = /[\p{L}\p{N}]{2,}/gu;
const STOP_TOKENS = new Set([
  'www',
  'com',
  'html',
  'amp',
  'news',
  'article',
  'articles',
  'story',
  'stories',
  'video',
  'latest',
  'index',
  'sitemap',
  'google',
  'newsxml',
]);

function parseArgs(argv: string[]): CliArgs {
  return {
    apply: argv.includes('--apply'),
    days: parseNumberArg(argv, '--days=', DEFAULT_DAYS, 1, 3650),
    trainingDays: parseNumberArg(argv, '--training-days=', DEFAULT_TRAINING_DAYS, 1, 3650),
    limit: parseOptionalNumberArg(argv, '--limit=', 1),
    minSupport: parseNumberArg(argv, '--min-support=', DEFAULT_MIN_SUPPORT, 1, 10_000),
    minTagShare: parseRatioArg(argv, '--min-tag-share=', DEFAULT_MIN_TAG_SHARE),
    minScore: parseNumberArg(argv, '--min-score=', DEFAULT_MIN_SCORE, 1, 20),
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

function parseOptionalNumberArg(argv: string[], prefix: string, min: number): number | null {
  const raw = argv.find((item) => item.startsWith(prefix));
  if (!raw) return null;
  const parsed = Number.parseInt(raw.slice(prefix.length), 10);
  if (!Number.isFinite(parsed) || parsed < min) return null;
  return parsed;
}

function parseRatioArg(argv: string[], prefix: string, fallback: number): number {
  const raw = argv.find((item) => item.startsWith(prefix));
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw.slice(prefix.length));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0.1, Math.min(1, parsed));
}

function parseListArg(argv: string[], prefix: string): string[] {
  const raw = argv.find((item) => item.startsWith(prefix));
  if (!raw) return [];
  return [...new Set(raw.slice(prefix.length).split(',').map((item) => item.trim()).filter(Boolean))];
}

function normalizeSource(value: string): string {
  return (value || '').trim();
}

function extractTokens(url: string): string[] {
  try {
    const parsed = new URL(url);
    const raw = `${parsed.hostname} ${decodeURIComponent(parsed.pathname)}`.toLowerCase();
    const tokens = raw.match(TOKEN_RE) || [];
    return [...new Set(tokens.filter((token) => {
      if (!token || STOP_TOKENS.has(token)) return false;
      if (/^\d+$/.test(token)) return false;
      if (/^\d{4,}$/.test(token)) return false;
      return true;
    }))];
  } catch {
    return [];
  }
}

async function fetchTopEmptySources(client: Client, days: number, limit: number): Promise<string[]> {
  const result = await client.query<{ source: string }>(
    `
    select source
    from news_articles
    where (
      publication_datetime >= now() - ($1::int * interval '1 day')
      or created_at >= now() - ($1::int * interval '1 day')
    )
      and coalesce(cardinality(feed_categories), 0) = 0
    group by source
    order by count(*) desc, source asc
    limit $2
    `,
    [days, limit]
  );
  return result.rows.map((row) => normalizeSource(row.source)).filter(Boolean);
}

async function fetchEmptyRows(client: Client, args: CliArgs, sources: string[]): Promise<EmptyRow[]> {
  if (!sources.length) return [];
  const params: unknown[] = [args.days, sources];
  let limitSql = '';
  if (args.limit) {
    params.push(args.limit);
    limitSql = `limit $${params.length}`;
  }
  const result = await client.query<EmptyRow>(
    `
    select external_id, source, url
    from news_articles
    where source = any($2::text[])
      and coalesce(cardinality(feed_categories), 0) = 0
      and (
        publication_datetime >= now() - ($1::int * interval '1 day')
        or created_at >= now() - ($1::int * interval '1 day')
      )
    order by publication_datetime desc, created_at desc
    ${limitSql}
    `,
    params
  );
  return result.rows;
}

async function fetchFilledRows(client: Client, args: CliArgs, sources: string[]): Promise<FilledRow[]> {
  if (!sources.length) return [];
  const result = await client.query<FilledRow>(
    `
    select source, url, feed_categories
    from news_articles
    where source = any($2::text[])
      and cardinality(feed_categories) > 0
      and (
        publication_datetime >= now() - ($1::int * interval '1 day')
        or created_at >= now() - ($1::int * interval '1 day')
      )
    `,
    [args.trainingDays, sources]
  );
  return result.rows;
}

function buildTokenPredictions(rows: FilledRow[], args: CliArgs): Map<string, TokenStats> {
  const predictions = new Map<string, TokenStats>();
  for (const row of rows) {
    const source = normalizeSource(row.source);
    const categories = normalizeSourceCategories(row.feed_categories || []);
    if (!source || !categories.length) continue;
    const tokens = extractTokens(row.url || '');
    for (const token of tokens) {
      const key = `${source}\n${token}`;
      const current = predictions.get(key) || { samples: 0, tagCounts: new Map<string, number>() };
      current.samples += 1;
      for (const category of categories) {
        current.tagCounts.set(category, (current.tagCounts.get(category) || 0) + 1);
      }
      predictions.set(key, current);
    }
  }

  for (const [key, value] of [...predictions.entries()]) {
    if (value.samples < args.minSupport) {
      predictions.delete(key);
    }
  }

  return predictions;
}

function predictRowCategories(row: EmptyRow, tokenStats: Map<string, TokenStats>, args: CliArgs): string[] {
  const source = normalizeSource(row.source);
  if (!source) return [];
  const tokens = extractTokens(row.url || '');
  if (!tokens.length) return [];

  const scoreByCategory = new Map<string, number>();
  for (const token of tokens) {
    const stats = tokenStats.get(`${source}\n${token}`);
    if (!stats || stats.samples < args.minSupport) continue;
    for (const [category, count] of stats.tagCounts.entries()) {
      const share = count / stats.samples;
      if (share < args.minTagShare) continue;
      scoreByCategory.set(category, (scoreByCategory.get(category) || 0) + 1);
    }
  }

  return normalizeSourceCategories(
    [...scoreByCategory.entries()]
      .filter(([, score]) => score >= args.minScore)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([category]) => category)
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = resolveDatabaseUrl();
  if (!databaseUrl) throw new Error('DATABASE_URL is not configured');

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const sources = args.sources.length
      ? args.sources.map(normalizeSource).filter(Boolean)
      : await fetchTopEmptySources(client, args.days, DEFAULT_SOURCE_LIMIT);
    if (!sources.length) {
      console.log('[backfill-source-categories-by-url-token] no sources selected');
      return;
    }

    const [emptyRows, filledRows] = await Promise.all([
      fetchEmptyRows(client, args, sources),
      fetchFilledRows(client, args, sources),
    ]);

    const tokenStats = buildTokenPredictions(filledRows, args);
    const sourceMatched = new Map<string, number>();
    const updates: NewsArticleFeedCategoryBackfill[] = [];

    for (const row of emptyRows) {
      const categories = predictRowCategories(row, tokenStats, args);
      if (!categories.length) continue;
      updates.push({
        externalId: row.external_id,
        sourceCategories: categories,
      });
      sourceMatched.set(row.source, (sourceMatched.get(row.source) || 0) + 1);
    }

    console.log(
      `[backfill-source-categories-by-url-token] sources=${sources.length} empty=${emptyRows.length} training=${filledRows.length} matched=${updates.length}`
    );
    for (const [source, count] of [...sourceMatched.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 15)) {
      console.log(`- ${source}: matched ${count}`);
    }

    if (!args.apply) {
      console.log('[backfill-source-categories-by-url-token] dry-run complete; re-run with --apply to persist');
      return;
    }

    const persisted = await backfillNewsArticleFeedCategories(updates);
    console.log(
      `[backfill-source-categories-by-url-token] updated=${persisted.updated} storage=${persisted.storage}${persisted.reason ? ` reason=${persisted.reason}` : ''}`
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

void main().catch((error) => {
  console.error(
    '[backfill-source-categories-by-url-token] failed:',
    error instanceof Error ? error.message : String(error)
  );
  process.exit(1);
});
