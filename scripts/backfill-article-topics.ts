import { Client } from 'pg';
import { buildArticleTaxonomy } from '@/lib/article-taxonomy';
import { resolveDatabaseUrl } from '@/lib/database-url';
import { decodeHtmlEntities, normalizeReadableArticleTitle } from '@/lib/html-entities';

type CliArgs = {
  apply: boolean;
  days: number;
  batchSize: number;
  limit: number | null;
  force: boolean;
};

type CandidateKeyRow = {
  external_id: string;
  created_at: string;
};

type CandidateDetailRow = {
  external_id: string;
  source: string;
  title_original: string;
  snippet_original: string | null;
  url: string;
  section: string | null;
  feed_categories: string[] | null;
};

type TopicUpdateRow = {
  externalId: string;
  primarySection: string;
  sectionsNormalized: string[];
  primaryTopic: string | null;
  topics: string[];
};

const DEFAULT_DAYS = 31;
const DEFAULT_BATCH_SIZE = 2000;
const UPDATE_CHUNK_SIZE = 500;

function parseArgs(argv: string[]): CliArgs {
  return {
    apply: argv.includes('--apply'),
    days: parseNumberArg(argv, '--days=', DEFAULT_DAYS, 1, 3650),
    batchSize: parseNumberArg(argv, '--batch=', DEFAULT_BATCH_SIZE, 50, 10_000),
    limit: parseOptionalNumberArg(argv, '--limit=', 1),
    force: argv.includes('--force'),
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

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function isEncodingError(error: unknown): boolean {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code || '') : '';
  const message = error instanceof Error ? error.message : String(error || '');
  return code === '22021' || message.includes('invalid byte sequence for encoding');
}

async function fetchCandidateKeys(
  client: Client,
  days: number,
  batchSize: number,
  cursorCreatedAt: string | null,
  cursorExternalId: string | null,
  force: boolean
): Promise<CandidateKeyRow[]> {
  return (await client.query<CandidateKeyRow>(
    `
    select external_id, created_at::text
    from news_articles
    where publication_datetime >= now() - ($1::int * interval '1 day')
      and (
        $4::boolean
        or taxonomy_derived_at is null
        or primary_section is null
        or coalesce(cardinality(sections_normalized), 0) = 0
      )
      and (
        $2::timestamptz is null
        or (created_at, external_id) < ($2::timestamptz, $3::text)
      )
    order by created_at desc, external_id desc
    limit $5
    `,
    [days, cursorCreatedAt, cursorExternalId, force, batchSize]
  )).rows;
}

async function fetchCandidateDetailsByIds(client: Client, ids: string[]): Promise<CandidateDetailRow[]> {
  if (!ids.length) return [];
  try {
    const result = await client.query<CandidateDetailRow>(
      `
      select external_id, source, title_original, snippet_original, url, section, feed_categories
      from news_articles
      where external_id = any($1::text[])
      `,
      [ids]
    );
    return result.rows;
  } catch (error: unknown) {
    if (!isEncodingError(error)) throw error;
    if (ids.length === 1) {
      console.warn(`[backfill-article-topics] skipping row with unreadable encoding: ${ids[0]}`);
      await client.query(
        `
        update news_articles
        set primary_section = coalesce(primary_section, 'others'),
            sections_normalized = case
              when coalesce(cardinality(sections_normalized), 0) > 0 then sections_normalized
              else array['others']::text[]
            end,
            primary_topic = null,
            topics = '{}'::text[],
            topics_derived_at = now(),
            taxonomy_derived_at = now(),
            updated_at = now()
        where external_id = $1
        `,
        [ids[0]]
      );
      return [];
    }
    const midpoint = Math.floor(ids.length / 2);
    const [left, right] = await Promise.all([
      fetchCandidateDetailsByIds(client, ids.slice(0, midpoint)),
      fetchCandidateDetailsByIds(client, ids.slice(midpoint)),
    ]);
    return [...left, ...right];
  }
}

function classifyTopicRow(row: CandidateDetailRow): TopicUpdateRow {
  const url = decodeHtmlEntities(row.url || '');
  const title = normalizeReadableArticleTitle(row.title_original || '', url, row.source || '');
  const taxonomy = buildArticleTaxonomy({
    storedSection: row.section,
    sourceCategories: row.feed_categories || [],
    source: row.source || '',
    url,
    title,
    snippet: row.snippet_original,
  });
  return {
    externalId: row.external_id,
    primarySection: taxonomy.primarySection,
    sectionsNormalized: taxonomy.sections,
    primaryTopic: taxonomy.primaryTopic,
    topics: taxonomy.topics,
  };
}

async function applyTopicUpdates(client: Client, rows: TopicUpdateRow[]): Promise<number> {
  if (!rows.length) return 0;
  let updated = 0;
  for (const group of chunk(rows, UPDATE_CHUNK_SIZE)) {
    const values: unknown[] = [];
    const parts: string[] = [];
    group.forEach((row, index) => {
      const base = index * 5;
      parts.push(`($${base + 1}::text, $${base + 2}::text, $${base + 3}::text[], $${base + 4}::text, $${base + 5}::text[])`);
      values.push(row.externalId, row.primarySection, row.sectionsNormalized, row.primaryTopic, row.topics);
    });
    const result = await client.query(
      `
      with incoming as (
        select *
        from (values ${parts.join(',')}) as t(external_id, primary_section, sections_normalized, primary_topic, topics)
      )
      update news_articles as n
      set primary_section = incoming.primary_section,
          sections_normalized = coalesce(incoming.sections_normalized, array['others']::text[]),
          primary_topic = incoming.primary_topic,
          topics = coalesce(incoming.topics, '{}'::text[]),
          topics_derived_at = now(),
          taxonomy_derived_at = now(),
          updated_at = now()
      from incoming
      where n.external_id = incoming.external_id
      `,
      values
    );
    updated += result.rowCount || 0;
  }
  return updated;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = resolveDatabaseUrl();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not configured');
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query(`
    alter table news_articles add column if not exists primary_section text null;
    alter table news_articles add column if not exists sections_normalized text[] not null default '{}';
    alter table news_articles add column if not exists primary_topic text null;
    alter table news_articles add column if not exists topics text[] not null default '{}';
    alter table news_articles add column if not exists topics_derived_at timestamptz null;
    alter table news_articles add column if not exists taxonomy_derived_at timestamptz null;
    create index if not exists idx_news_articles_primary_section on news_articles(primary_section);
    create index if not exists idx_news_articles_sections_normalized on news_articles using gin(sections_normalized);
    create index if not exists idx_news_articles_primary_topic on news_articles(primary_topic);
    create index if not exists idx_news_articles_topics on news_articles using gin(topics);
  `);

  let cursorCreatedAt: string | null = null;
  let cursorExternalId: string | null = null;
  let scanned = 0;
  let updated = 0;

  try {
    while (args.limit == null || scanned < args.limit) {
      const remaining = args.limit == null ? args.batchSize : Math.max(0, Math.min(args.batchSize, args.limit - scanned));
      if (remaining <= 0) break;

      const keys = await fetchCandidateKeys(client, args.days, remaining, cursorCreatedAt, cursorExternalId, args.force);
      if (!keys.length) break;

      scanned += keys.length;
      const details = await fetchCandidateDetailsByIds(client, keys.map((row) => row.external_id));
      const decisions = details.map(classifyTopicRow);

      if (args.apply) {
        updated += await applyTopicUpdates(client, decisions);
      } else {
        updated += decisions.length;
      }

      const last = keys[keys.length - 1];
      cursorCreatedAt = last.created_at;
      cursorExternalId = last.external_id;

      console.log(
        `[backfill-article-topics] scanned=${scanned} detail_rows=${details.length} classified=${decisions.length} updated=${updated}`
      );
    }
  } finally {
    await client.end();
  }

  console.log(
    `[backfill-article-topics] done apply=${args.apply} days=${args.days} scanned=${scanned} updated=${updated}`
  );
}

main().catch((error) => {
  console.error('[backfill-article-topics] failed', error);
  process.exitCode = 1;
});
