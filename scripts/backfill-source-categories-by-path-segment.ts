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
  limit: number | null;
  minSegmentSupport: number;
  maxDepth: number;
  sources: string[];
};

type EmptyRow = {
  external_id: string;
  source: string;
  url: string;
};

const DEFAULT_DAYS = 3650;
const DEFAULT_MIN_SEGMENT_SUPPORT = 20;
const DEFAULT_MAX_DEPTH = 3;
const DEFAULT_SOURCE_LIMIT = 50;

const GLOBAL_STOP_SEGMENTS = new Set([
  '',
  'news',
  'article',
  'artikel',
  'articles',
  'story',
  'stories',
  'latest',
  'breakingnews',
  'video',
  'videos',
  'multimedia',
  'amp',
  'amphtml',
  'view',
  'index',
  'sitemap',
  'rss',
  'content',
  'tag',
  'tags',
  'topic',
  'topics',
  'author',
  'authors',
  'podcast',
  'podcasts',
  'p',
  'id',
]);

const SOURCE_STOP_SEGMENTS = new Map<string, Set<string>>([
  ['24Horas - Sitemap 202603', new Set(['programas'])],
  ['Blic', new Set(['vesti'])],
  ['L\'Avenir - News Sitemap', new Set(['regions'])],
  ['SE.pl - News Sitemap', new Set(['wiadomosci'])],
  ['The Standard - News Sitemap', new Set(['article'])],
]);

function parseArgs(argv: string[]): CliArgs {
  return {
    apply: argv.includes('--apply'),
    days: parseNumberArg(argv, '--days=', DEFAULT_DAYS, 1, 3650),
    limit: parseOptionalNumberArg(argv, '--limit=', 1),
    minSegmentSupport: parseNumberArg(argv, '--min-segment-support=', DEFAULT_MIN_SEGMENT_SUPPORT, 1, 10_000),
    maxDepth: parseNumberArg(argv, '--max-depth=', DEFAULT_MAX_DEPTH, 1, 6),
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

function parseListArg(argv: string[], prefix: string): string[] {
  const raw = argv.find((item) => item.startsWith(prefix));
  if (!raw) return [];
  return [...new Set(raw.slice(prefix.length).split(',').map((item) => item.trim()).filter(Boolean))];
}

function normalizeSource(value: string): string {
  return (value || '').trim();
}

function normalizeSegment(value: string): string {
  return decodeURIComponent(value || '')
    .trim()
    .toLowerCase()
    .replace(/^[-_]+|[-_]+$/g, '')
    .replace(/[-_]+/g, ' ');
}

function isMeaningfulSegment(source: string, segment: string): boolean {
  if (!segment) return false;
  if (GLOBAL_STOP_SEGMENTS.has(segment)) return false;
  if (/^\d+$/.test(segment)) return false;
  if (/^\d{4,}$/.test(segment)) return false;
  if (/^\d{1,2}\s+\d{1,2}$/.test(segment)) return false;
  if (/^\d{4}(?:\s+\d{1,2}){1,2}$/.test(segment)) return false;
  if (segment.length < 2) return false;
  if (/^(?=.*[a-z])(?=.*\d)[a-z0-9]{5,}$/i.test(segment)) return false;
  if (/^[a-f0-9]{12,}$/i.test(segment)) return false;
  const sourceStops = SOURCE_STOP_SEGMENTS.get(source);
  if (sourceStops?.has(segment)) return false;
  return true;
}

function extractPathSegments(url: string, maxDepth: number): string[] {
  try {
    const parsed = new URL(url);
    return parsed.pathname
      .split('/')
      .map(normalizeSegment)
      .map((segment) => segment.replace(/^\d+\s+/g, ''))
      .filter(Boolean)
      .slice(0, maxDepth);
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

function buildAllowedSegments(rows: EmptyRow[], args: CliArgs): Map<string, Set<string>> {
  const counts = new Map<string, Map<string, number>>();

  for (const row of rows) {
    const source = normalizeSource(row.source);
    if (!source) continue;
    const sourceCounts = counts.get(source) || new Map<string, number>();
    for (const segment of extractPathSegments(row.url || '', args.maxDepth)) {
      if (!isMeaningfulSegment(source, segment)) continue;
      sourceCounts.set(segment, (sourceCounts.get(segment) || 0) + 1);
    }
    counts.set(source, sourceCounts);
  }

  const allowed = new Map<string, Set<string>>();
  for (const [source, sourceCounts] of counts.entries()) {
    const chosen = new Set<string>();
    for (const [segment, count] of sourceCounts.entries()) {
      if (count >= args.minSegmentSupport) {
        chosen.add(segment);
      }
    }
    if (chosen.size) {
      allowed.set(source, chosen);
    }
  }

  return allowed;
}

function predictRowCategories(row: EmptyRow, allowedSegments: Map<string, Set<string>>, args: CliArgs): string[] {
  const source = normalizeSource(row.source);
  if (!source) return [];
  const allowed = allowedSegments.get(source);
  if (!allowed?.size) return [];

  const picked: string[] = [];
  for (const segment of extractPathSegments(row.url || '', args.maxDepth)) {
    if (!allowed.has(segment)) continue;
    picked.push(segment);
  }

  return normalizeSourceCategories(picked);
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
      console.log('[backfill-source-categories-by-path-segment] no sources selected');
      return;
    }

    const emptyRows = await fetchEmptyRows(client, args, sources);
    const allowedSegments = buildAllowedSegments(emptyRows, args);
    const sourceMatched = new Map<string, number>();
    const updates: NewsArticleFeedCategoryBackfill[] = [];

    for (const row of emptyRows) {
      const categories = predictRowCategories(row, allowedSegments, args);
      if (!categories.length) continue;
      updates.push({
        externalId: row.external_id,
        sourceCategories: categories,
      });
      sourceMatched.set(row.source, (sourceMatched.get(row.source) || 0) + 1);
    }

    console.log(
      `[backfill-source-categories-by-path-segment] sources=${sources.length} empty=${emptyRows.length} matched=${updates.length}`
    );
    for (const [source, count] of [...sourceMatched.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 15)) {
      const segments = [...(allowedSegments.get(source) || [])].slice(0, 8).join(', ');
      console.log(`- ${source}: matched ${count}${segments ? ` [${segments}]` : ''}`);
    }

    if (!args.apply) {
      console.log('[backfill-source-categories-by-path-segment] dry-run complete; re-run with --apply to persist');
      return;
    }

    const persisted = await backfillNewsArticleFeedCategories(updates);
    console.log(
      `[backfill-source-categories-by-path-segment] updated=${persisted.updated} storage=${persisted.storage}${persisted.reason ? ` reason=${persisted.reason}` : ''}`
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

void main().catch((error) => {
  console.error(
    '[backfill-source-categories-by-path-segment] failed:',
    error instanceof Error ? error.message : String(error)
  );
  process.exit(1);
});
