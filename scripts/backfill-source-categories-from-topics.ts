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
};

type Row = {
  external_id: string;
  primary_topic: string | null;
  topics: string[] | null;
};

function parseArgs(argv: string[]): CliArgs {
  return {
    apply: argv.includes('--apply'),
  };
}

async function fetchRows(client: Client): Promise<Row[]> {
  const result = await client.query<Row>(
    `
    select external_id, primary_topic, topics
    from news_articles
    where coalesce(cardinality(feed_categories), 0) = 0
      and (
        coalesce(cardinality(topics), 0) > 0
        or (primary_topic is not null and btrim(primary_topic) <> '')
      )
    `
  );
  return result.rows;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const client = new Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();

  try {
    const rows = await fetchRows(client);
    const updates: NewsArticleFeedCategoryBackfill[] = rows
      .map((row) => ({
        externalId: row.external_id,
        sourceCategories: normalizeSourceCategories([...(row.topics || []), row.primary_topic || '']),
      }))
      .filter((item) => item.sourceCategories.length > 0);

    console.log(`[backfill-source-categories-from-topics] candidates=${rows.length} matched=${updates.length}`);

    if (!args.apply) {
      console.log('[backfill-source-categories-from-topics] dry-run complete; re-run with --apply to persist');
      return;
    }

    const result = await backfillNewsArticleFeedCategories(updates);
    console.log(`[backfill-source-categories-from-topics] updated=${result.updated} storage=${result.storage}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[backfill-source-categories-from-topics] failed');
  console.error(error);
  process.exit(1);
});
