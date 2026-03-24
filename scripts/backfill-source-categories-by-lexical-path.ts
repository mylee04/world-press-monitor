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
  maxDepth: number;
};

type EmptyRow = {
  external_id: string;
  url: string;
};

const DEFAULT_DAYS = 3650;
const DEFAULT_MAX_DEPTH = 4;

const LEXICAL_CATEGORY_SEGMENTS = new Set([
  'actualidad',
  'actualites',
  'arts',
  'atualidade',
  'ausland',
  'belgium',
  'berita',
  'bisnis',
  'biznes',
  'buitenland',
  'bulgaria',
  'business',
  'california',
  'chronik',
  'chroniques',
  'cronaca',
  'cultura',
  'culture',
  'deportes',
  'diethni',
  'economia',
  'economy',
  'economie',
  'ekonomi',
  'ekonomika',
  'empresas',
  'entretenimiento',
  'entertainment',
  'espana',
  'estero',
  'esteri',
  'eveniment',
  'espectaculos',
  'finanzen',
  'finanse',
  'football',
  'fotbal',
  'france',
  'frettir',
  'gospodarka',
  'hot',
  'international',
  'internacional',
  'internationalt',
  'internasional',
  'kotimaa',
  'kultur',
  'kultura',
  'lifestyle',
  'local',
  'magazin',
  'market',
  'monden',
  'monde',
  'mundo',
  'nacional',
  'nacionales',
  'nacion',
  'nasional',
  'national',
  'nachrichten',
  'notizie',
  'nouvelles',
  'noje',
  'opinion',
  'opinions',
  'opiniao',
  'pais',
  'panorama',
  'play',
  'poland',
  'politica',
  'politics',
  'politiek',
  'politique',
  'politik',
  'polityka',
  'polska',
  'raksts',
  'regiony',
  'sociedad',
  'sociedade',
  'sport',
  'sporturi',
  'sports',
  'spravy',
  'schweiz',
  'sverige',
  'svet',
  'sviat',
  'svijet',
  'swiat',
  'stiri',
  'tech',
  'tv',
  'undertagelser',
  'unternehmen',
  'urheilu',
  'ulkomaat',
  'varlden',
  'verslas',
  'vijesti',
  'vesti',
  'wiadomosci',
  'wirtschaft',
  'world',
  'wydarzenia',
  'zpravy domov',
  'zpravodajstvi',
]);

const STOP_SEGMENTS = new Set([
  '',
  'a',
  'article',
  'articles',
  'artikel',
  'artikkel',
  'artikkeli',
  'clanek',
  'clanok',
  'content',
  'news',
  'nieuws',
  'noticias',
  'nouvelles',
  'read',
  'sites',
  'story',
  'stories',
  'view',
  'video',
  'videos',
  'wideo program',
  '2026',
]);

function parseArgs(argv: string[]): CliArgs {
  return {
    apply: argv.includes('--apply'),
    days: parseNumberArg(argv, '--days=', DEFAULT_DAYS, 1, 3650),
    maxDepth: parseNumberArg(argv, '--max-depth=', DEFAULT_MAX_DEPTH, 1, 8),
  };
}

function parseNumberArg(argv: string[], prefix: string, fallback: number, min: number, max: number): number {
  const raw = argv.find((item) => item.startsWith(prefix));
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw.slice(prefix.length), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeSegment(value: string): string {
  return decodeURIComponent(value || '')
    .trim()
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,8}$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLexicalCategories(url: string, maxDepth: number): string[] {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname
      .split('/')
      .map(normalizeSegment)
      .filter(Boolean)
      .slice(0, maxDepth);

    const matches: string[] = [];
    for (const segment of segments) {
      if (!segment || STOP_SEGMENTS.has(segment)) continue;
      if (/^\d+$/.test(segment)) continue;
      if (/^\d{4}(?:\s+\d{1,2}){0,2}$/.test(segment)) continue;
      if (LEXICAL_CATEGORY_SEGMENTS.has(segment)) {
        matches.push(segment);
      }
    }

    return normalizeSourceCategories(matches);
  } catch {
    return [];
  }
}

async function fetchRows(client: Client, days: number): Promise<EmptyRow[]> {
  const result = await client.query<EmptyRow>(
    `
    select external_id, url
    from news_articles
    where coalesce(cardinality(feed_categories), 0) = 0
      and (
        publication_datetime >= now() - ($1::int * interval '1 day')
        or created_at >= now() - ($1::int * interval '1 day')
      )
      and url ~ '^https?://'
    `,
    [days]
  );
  return result.rows;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const client = new Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();

  try {
    const rows = await fetchRows(client, args.days);
    const updates: NewsArticleFeedCategoryBackfill[] = rows
      .map((row) => ({
        externalId: row.external_id,
        sourceCategories: extractLexicalCategories(row.url, args.maxDepth),
      }))
      .filter((row) => row.sourceCategories.length > 0);

    console.log(
      `[backfill-source-categories-by-lexical-path] candidates=${rows.length} matched=${updates.length}`
    );

    if (!args.apply) {
      console.log('[backfill-source-categories-by-lexical-path] dry-run complete; re-run with --apply to persist');
      return;
    }

    const result = await backfillNewsArticleFeedCategories(updates);
    console.log(`[backfill-source-categories-by-lexical-path] updated=${result.updated} storage=${result.storage}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[backfill-source-categories-by-lexical-path] failed');
  console.error(error);
  process.exit(1);
});
