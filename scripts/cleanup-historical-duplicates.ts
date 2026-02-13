import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';

type CliOptions = {
  apply: boolean;
  examples: boolean;
  exampleLimit: number;
};

type TableCount = {
  table_name: string;
  count: string;
};

type DuplicateSourceCount = {
  source: string;
  rows: string;
};

type DuplicateSummary = {
  groups: number;
  removable: number;
  totalRows: number;
};

const DB_READY_RETRIES = 12;
const DB_READY_WAIT_MS = 2000;

const TABLES = [
  'breaking_queue',
  'distribution_content',
  'drafts',
  'external_news_articles',
  'ingested_articles',
  'ingestion_endpoint_runs',
  'radar_summary_fetch_logs',
  'radar_summary_queue',
  'radar_summary_usage_daily',
  'social_breaking_posts'
];

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  let apply = false;
  let examples = false;
  let exampleLimit = 20;

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--apply') apply = true;
    if (args[i] === '--examples') examples = true;
    if (args[i] === '--help' || args[i] === '-h') {
      console.log(`Usage: bun scripts/cleanup-historical-duplicates.ts [--apply] [--examples] [--limit N]`);
      console.log('  --apply   Apply deletions (default is dry-run)');
      console.log('  --examples Print duplicate candidates (up to --limit rows per table)');
      console.log('  --limit N Number of example rows (default: 20)');
      process.exit(0);
    }
    if (args[i] === '--limit') {
      const next = Number.parseInt(args[i + 1], 10);
      if (Number.isFinite(next) && next > 0) {
        exampleLimit = next;
        i += 1;
      } else {
        throw new Error('Invalid value for --limit.');
      }
    }
  }

  return { apply, examples, exampleLimit };
}

function getDatabaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL || '';
  if (fromEnv) return fromEnv;

  const envLocal = resolve(process.cwd(), '.env.local');
  if (!existsSync(envLocal)) {
    throw new Error('Missing DATABASE_URL. Set DATABASE_URL env var or .env.local.');
  }

  const raw = readFileSync(envLocal, 'utf8');
  const line = raw.split('\n').find((row) => row.trim().startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL not found in .env.local.');

  return line
    .slice(line.indexOf('=') + 1)
    .trim()
    .replace(/^['"]|['"]$/g, '');
}

function maskDbUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.host;
    const path = parsed.pathname || '/';
    const auth = parsed.username ? `${parsed.username}:***@` : '';
    return `${parsed.protocol}//${auth}${host}${path}`;
  } catch {
    return '(invalid DATABASE_URL)';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForDatabase(pool: Pool): Promise<void> {
  for (let attempt = 1; attempt <= DB_READY_RETRIES; attempt += 1) {
    try {
      const client = await pool.connect();
      try {
        await client.query('SELECT 1');
      } finally {
        client.release();
      }
      if (attempt > 1) {
        console.log(`Connected to Postgres on attempt ${attempt}/${DB_READY_RETRIES}.`);
      }
      return;
    } catch (error) {
      if (attempt === DB_READY_RETRIES) {
        throw error;
      }
      console.log(
        `[db] Postgres not available yet (attempt ${attempt}/${DB_READY_RETRIES}). Retrying in ${DB_READY_WAIT_MS / 1000}s...`
      );
      await sleep(DB_READY_WAIT_MS);
    }
  }
}

function normalizeTableCounts(rows: TableCount[]): Map<string, number> {
  return new Map(rows.map((r) => [r.table_name, Number(r.count)]));
}

async function getCounts(pool: Pool): Promise<Map<string, number>> {
  const unionSql = TABLES.map((name) => `SELECT '${name}' AS table_name, count(*)::bigint AS count FROM ${name}`).join(' UNION ALL ');
  const { rows } = await pool.query<TableCount>(unionSql);
  return normalizeTableCounts(rows);
}

function printCounts(title: string, counts: Map<string, number>): void {
  console.log(`\n${title}`);
  for (const table of TABLES) {
    console.log(`- ${table}: ${counts.get(table) ?? 0}`);
  }
}

const EXTERNAL_DUP_SQL = `
WITH normalized AS (
  SELECT
    external_id,
    source,
    publication_datetime,
    publication_verified,
    summary_verified,
    title_original,
    summary_original,
    summary_en,
    lower(trim(source)) AS source_norm,
    floor(extract(epoch from publication_datetime) / 60)::bigint AS bucket,
    coalesce(
      NULLIF(
        trim(
          regexp_replace(
            regexp_replace(
              regexp_replace(lower(title_original), 'https?:\\S+', ' ', 'g'),
              '[^[:alnum:] ]',
              ' ',
              'g'
            ),
            '\\s+',
            ' ',
            'g'
          )
        ),
        ''
      ),
      ''
    ) AS title_norm,
    coalesce(
      NULLIF(
        trim(
          regexp_replace(
            regexp_replace(
              regexp_replace(lower(coalesce(summary_original, summary_en, '')), 'https?:\\S+', ' ', 'g'),
              '[^[:alnum:] ]',
              ' ',
              'g'
            ),
            '\\s+',
            ' ',
            'g'
          )
        ),
        ''
      ),
      ''
    ) AS summary_norm,
    lower(trim(url_norm)) AS url_norm
  FROM external_news_articles
), ranked AS (
  SELECT
    external_id,
    source,
    publication_datetime,
    publication_verified,
    summary_verified,
    title_original,
    summary_original,
    summary_en,
    source_norm,
    title_norm,
    summary_norm,
    url_norm,
    bucket,
    CASE
      WHEN title_norm <> '' THEN md5('story|' || source_norm || '|' || bucket::text || '|' || title_norm || '|' || summary_norm)
      ELSE md5('url|' || source_norm || '|' || url_norm)
    END AS dedupe_sig,
    row_number() OVER (
      PARTITION BY (CASE
        WHEN title_norm <> '' THEN md5('story|' || source_norm || '|' || bucket::text || '|' || title_norm || '|' || summary_norm)
        ELSE md5('url|' || source_norm || '|' || url_norm)
      END)
      ORDER BY
        publication_verified DESC,
        summary_verified DESC,
        coalesce(length(coalesce(summary_original, summary_en, '')), 0) DESC,
        publication_datetime DESC,
        coalesce(length(title_original), 0) DESC,
        external_id ASC
    ) AS rn
  FROM normalized
)
`;

const INGESTED_DUP_SQL = `
WITH normalized AS (
  SELECT
    id,
    source,
    title,
    link_norm,
    published_at,
    last_seen_at,
    seen_count,
    lower(trim(source)) AS source_norm,
    floor(extract(epoch from published_at) / 60)::bigint AS bucket,
    coalesce(
      NULLIF(
        trim(
          regexp_replace(
            regexp_replace(
              regexp_replace(lower(title), 'https?:\\S+', ' ', 'g'),
              '[^[:alnum:] ]',
              ' ',
              'g'
            ),
            '\\s+',
            ' ',
            'g'
          )
        ),
        ''
      ),
      ''
    ) AS title_norm,
    lower(trim(link_norm)) AS link_norm_norm
  FROM ingested_articles
), ranked AS (
  SELECT
    id,
    source,
    title,
    published_at,
    last_seen_at,
    seen_count,
    CASE
      WHEN title_norm <> '' THEN md5('story|' || source_norm || '|' || bucket::text || '|' || title_norm)
      ELSE md5('url|' || source_norm || '|' || link_norm_norm)
    END AS dedupe_sig,
    row_number() OVER (
      PARTITION BY (CASE
        WHEN title_norm <> '' THEN md5('story|' || source_norm || '|' || bucket::text || '|' || title_norm)
        ELSE md5('url|' || source_norm || '|' || link_norm_norm)
      END)
      ORDER BY last_seen_at DESC, seen_count DESC, id DESC
    ) AS rn
  FROM normalized
)
`;

async function countExternalDuplicates(pool: Pool): Promise<{ summary: DuplicateSummary; bySource: DuplicateSourceCount[] }> {
  const summarySql = `${EXTERNAL_DUP_SQL}
    SELECT
      COALESCE((
        SELECT count(*)
        FROM (
          SELECT dedupe_sig
          FROM ranked
          GROUP BY dedupe_sig
          HAVING count(*) > 1
        ) x
      ), 0) AS groups,
      COALESCE((
        SELECT sum(cnt - 1)
        FROM (
          SELECT count(*) AS cnt
          FROM ranked
          GROUP BY dedupe_sig
          HAVING count(*) > 1
        ) y
      ), 0) AS removable,
      (SELECT count(*) FROM ranked) AS totalrows;`;
  const sourceSql = `${EXTERNAL_DUP_SQL}
    SELECT source, count(*)::bigint AS rows
    FROM ranked
    WHERE rn > 1
    GROUP BY source
    ORDER BY count(*) DESC, source
    LIMIT 20;`;

  const [summaryRows, sourceRows] = await Promise.all([
    pool.query(summarySql),
    pool.query<DuplicateSourceCount>(sourceSql)
  ]);

  const s = summaryRows.rows[0] as { groups: string; removable: string; totalrows: string };
  return {
    summary: {
      groups: Number(s?.groups || 0),
      removable: Number(s?.removable || 0),
      totalRows: Number(s?.totalrows || 0)
    },
    bySource: sourceRows.rows
  };
}

async function countIngestedDuplicates(pool: Pool): Promise<{ summary: DuplicateSummary; bySource: DuplicateSourceCount[] }> {
  const summarySql = `${INGESTED_DUP_SQL}
    SELECT
      COALESCE((
        SELECT count(*)
        FROM (
          SELECT dedupe_sig
          FROM ranked
          GROUP BY dedupe_sig
          HAVING count(*) > 1
        ) x
      ), 0) AS groups,
      COALESCE((
        SELECT sum(cnt - 1)
        FROM (
          SELECT count(*) AS cnt
          FROM ranked
          GROUP BY dedupe_sig
          HAVING count(*) > 1
        ) y
      ), 0) AS removable,
      (SELECT count(*) FROM ranked) AS totalrows;`;
  const sourceSql = `${INGESTED_DUP_SQL}
    SELECT source, count(*)::bigint AS rows
    FROM ranked
    WHERE rn > 1
    GROUP BY source
    ORDER BY count(*) DESC, source
    LIMIT 20;`;

  const [summaryRows, sourceRows] = await Promise.all([
    pool.query(summarySql),
    pool.query<DuplicateSourceCount>(sourceSql)
  ]);

  const s = summaryRows.rows[0] as { groups: string; removable: string; totalrows: string };
  return {
    summary: {
      groups: Number(s?.groups || 0),
      removable: Number(s?.removable || 0),
      totalRows: Number(s?.totalrows || 0)
    },
    bySource: sourceRows.rows
  };
}

function printSourceBreakdown(label: string, rows: DuplicateSourceCount[]): void {
  if (!rows.length) {
    console.log(`${label}: no duplicate sources`);
    return;
  }
  console.log(label);
  for (const row of rows) {
    console.log(`- ${row.source}: ${row.rows}`);
  }
}

async function removeExternalDuplicates(pool: Pool): Promise<number> {
  const deleteSql = `${EXTERNAL_DUP_SQL}
    DELETE FROM external_news_articles e
    USING ranked r
    WHERE e.external_id = r.external_id
      AND r.rn > 1
    RETURNING e.external_id;`;

  const result = await pool.query<{ external_id: string }>(deleteSql);
  return result.rowCount || 0;
}

async function removeIngestedDuplicates(pool: Pool): Promise<number> {
  const deleteSql = `${INGESTED_DUP_SQL}
    DELETE FROM ingested_articles i
    USING ranked r
    WHERE i.id = r.id
      AND r.rn > 1
    RETURNING i.id;`;

  const result = await pool.query<{ id: string }>(deleteSql);
  return result.rowCount || 0;
}

async function printExamples(pool: Pool, table: 'external_news_articles' | 'ingested_articles', limit: number): Promise<void> {
  if (table === 'external_news_articles') {
    const sql = `${EXTERNAL_DUP_SQL}
      SELECT source, publication_datetime, external_id, title_original, summary_original
      FROM ranked
      WHERE rn > 1
      ORDER BY source, publication_datetime DESC, external_id
      LIMIT ${limit};`;
    const { rows } = await pool.query<{ source: string; publication_datetime: string; external_id: string; title_original: string; summary_original: string }>(sql);
    if (!rows.length) {
      console.log('No external duplicate examples after filtering.');
      return;
    }
    console.log(`\nExample removable rows from ${table} (up to ${limit}):`);
    for (const row of rows) {
      const title = (row.title_original || '').replace(/\s+/g, ' ').slice(0, 90);
      const summary = (row.summary_original || '').replace(/\s+/g, ' ').slice(0, 120);
      console.log(`- ${row.external_id} | ${row.source} | ${row.publication_datetime} | ${title} | ${summary}`);
    }
    return;
  }

  const sql = `${INGESTED_DUP_SQL}
    SELECT source, published_at, id, title
    FROM ranked
    WHERE rn > 1
    ORDER BY source, published_at DESC, id
    LIMIT ${limit};`;
  const { rows } = await pool.query<{ source: string; published_at: string; id: number; title: string }>(sql);
  if (!rows.length) {
    console.log('No ingested duplicate examples after filtering.');
    return;
  }
  console.log(`\nExample removable rows from ${table} (up to ${limit}):`);
  for (const row of rows) {
    const title = (row.title || '').replace(/\s+/g, ' ').slice(0, 110);
    console.log(`- ${row.id} | ${row.source} | ${row.published_at} | ${title}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  const dbUrl = getDatabaseUrl();
  console.log(`[db] Connecting to ${maskDbUrl(dbUrl)} ...`);
  const pool = new Pool({ connectionString: dbUrl });

  try {
    await waitForDatabase(pool);
    const beforeCounts = await getCounts(pool);
    printCounts('Counts before:', beforeCounts);

    const external = await countExternalDuplicates(pool);
    const ingested = await countIngestedDuplicates(pool);

    console.log(`\nDuplicate groups (external_news_articles): ${external.summary.groups}`);
    console.log(`Duplicate rows removable (external_news_articles): ${external.summary.removable}`);
    printSourceBreakdown('Top duplicate sources (external_news_articles):', external.bySource);

    console.log(`\nDuplicate groups (ingested_articles): ${ingested.summary.groups}`);
    console.log(`Duplicate rows removable (ingested_articles): ${ingested.summary.removable}`);
    printSourceBreakdown('Top duplicate sources (ingested_articles):', ingested.bySource);

    if (args.examples) {
      await printExamples(pool, 'external_news_articles', args.exampleLimit);
      await printExamples(pool, 'ingested_articles', args.exampleLimit);
    }

    if (!args.apply) {
      console.log('\nDry-run complete. Use --apply to delete duplicates.');
      return;
    }

    const [extDeleted, ingDeleted] = await Promise.all([
      removeExternalDuplicates(pool),
      removeIngestedDuplicates(pool)
    ]);

    console.log(`\nApplied: removed ${extDeleted} from external_news_articles.`);
    console.log(`Applied: removed ${ingDeleted} from ingested_articles.`);

    const afterCounts = await getCounts(pool);
    printCounts('Counts after:', afterCounts);

    console.log('\nDelta:');
    for (const table of TABLES) {
      const before = beforeCounts.get(table) ?? 0;
      const after = afterCounts.get(table) ?? 0;
      const delta = after - before;
      const sign = delta > 0 ? '+' : '';
      if (delta !== 0) {
        console.log(`- ${table}: ${sign}${delta}`);
      }
    }
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error('Duplicate cleanup failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
