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
};

type EmptyRow = {
  external_id: string;
  source: string;
};

const DEFAULT_DAYS = 3650;

const SOURCE_TOKEN_PATTERNS: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /\bauto\b/i, value: 'auto' },
  { pattern: /\bbisnis\b/i, value: 'bisnis' },
  { pattern: /\bbusiness\b/i, value: 'business' },
  { pattern: /\bculture\b/i, value: 'culture' },
  { pattern: /\bdeportes\b/i, value: 'deportes' },
  { pattern: /\beconom(?:y|ia)?\b/i, value: 'economy' },
  { pattern: /\bekonomi\b/i, value: 'ekonomi' },
  { pattern: /\bfinan(?:ce|z)\b/i, value: 'finance' },
  { pattern: /\bhealth\b/i, value: 'health' },
  { pattern: /\binternational\b/i, value: 'international' },
  { pattern: /\bkultur\b/i, value: 'kultur' },
  { pattern: /\blifestyle\b/i, value: 'lifestyle' },
  { pattern: /\bmarket\b/i, value: 'market' },
  { pattern: /\bmundo\b/i, value: 'mundo' },
  { pattern: /\bopinion\b/i, value: 'opinion' },
  { pattern: /\bpolit(?:ics|ica|ique|ik)\b/i, value: 'politics' },
  { pattern: /\bsport(?:s|uri)?\b/i, value: 'sport' },
  { pattern: /\btech\b/i, value: 'tech' },
  { pattern: /\btravel\b/i, value: 'travel' },
  { pattern: /\bworld\b/i, value: 'world' },
  { pattern: /경제/, value: '경제' },
  { pattern: /문화/, value: '문화' },
  { pattern: /생활/, value: '생활' },
  { pattern: /스포츠/, value: '스포츠' },
  { pattern: /테크/, value: '테크' },
];

function parseArgs(argv: string[]): CliArgs {
  return {
    apply: argv.includes('--apply'),
    days: parseNumberArg(argv, '--days=', DEFAULT_DAYS, 1, 3650),
  };
}

function parseNumberArg(argv: string[], prefix: string, fallback: number, min: number, max: number): number {
  const raw = argv.find((item) => item.startsWith(prefix));
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw.slice(prefix.length), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

async function fetchRows(client: Client, days: number): Promise<EmptyRow[]> {
  const result = await client.query<EmptyRow>(
    `
    select external_id, source
    from news_articles
    where coalesce(cardinality(feed_categories), 0) = 0
      and (
        publication_datetime >= now() - ($1::int * interval '1 day')
        or created_at >= now() - ($1::int * interval '1 day')
      )
    `,
    [days]
  );
  return result.rows;
}

function deriveCategoriesFromSourceName(source: string): string[] {
  const matches: string[] = [];
  for (const candidate of SOURCE_TOKEN_PATTERNS) {
    if (candidate.pattern.test(source)) {
      matches.push(candidate.value);
    }
  }
  return normalizeSourceCategories(matches);
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
        sourceCategories: deriveCategoriesFromSourceName(row.source || ''),
      }))
      .filter((item) => item.sourceCategories.length > 0);

    console.log(
      `[backfill-source-categories-by-source-name-lexical] candidates=${rows.length} matched=${updates.length}`
    );

    if (!args.apply) {
      console.log(
        '[backfill-source-categories-by-source-name-lexical] dry-run complete; re-run with --apply to persist'
      );
      return;
    }

    const result = await backfillNewsArticleFeedCategories(updates);
    console.log(`[backfill-source-categories-by-source-name-lexical] updated=${result.updated} storage=${result.storage}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[backfill-source-categories-by-source-name-lexical] failed');
  console.error(error);
  process.exit(1);
});
