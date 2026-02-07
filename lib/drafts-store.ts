import { Pool } from 'pg';
import type { DraftRecord, DistributionPayload } from '@/lib/pipeline';

type DistributionPlatform = keyof DistributionPayload;

let pool: Pool | null = null;
let poolFailed = false;
let schemaReady = false;
const memoryDrafts = new Map<string, DraftRecord>();

function getPool(): Pool | null {
  if (pool) return pool;
  if (poolFailed) return null;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  try {
    pool = new Pool({ connectionString: url });
    return pool;
  } catch {
    poolFailed = true;
    return null;
  }
}

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  const db = getPool();
  if (!db) return;
  await db.query(`
    create table if not exists drafts (
      id text primary key,
      source_article_id text not null,
      source text not null,
      source_link text not null,
      source_title text not null,
      source_published_at timestamptz not null,
      status text not null default 'draft',
      headline_es text not null,
      body_es text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      approved_at timestamptz null,
      published_at timestamptz null
    );
    create table if not exists distribution_content (
      id bigserial primary key,
      draft_id text not null references drafts(id) on delete cascade,
      platform text not null,
      content text not null,
      is_published boolean not null default false,
      updated_at timestamptz not null default now(),
      unique(draft_id, platform)
    );
  `);
  schemaReady = true;
}

function normalizeDistribution(value: DraftRecord['distribution']): DistributionPayload | undefined {
  if (!value) return undefined;
  if (!value.twitter || !value.instagram || !value.linkedin || !value.tiktok || !value.newsletter) return undefined;
  return value;
}

function normalizeDraft(record: DraftRecord): DraftRecord {
  return {
    ...record,
    status: record.status || 'draft',
    distribution: normalizeDistribution(record.distribution)
  };
}

function sortDrafts(records: DraftRecord[]): DraftRecord[] {
  return [...records].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function fallbackList(): DraftRecord[] {
  return sortDrafts([...memoryDrafts.values()]);
}

export async function listDrafts(): Promise<{ drafts: DraftRecord[]; storage: 'postgres' | 'memory' }> {
  const db = getPool();
  if (!db) {
    return { drafts: fallbackList(), storage: 'memory' };
  }

  await ensureSchema();
  const draftsRes = await db.query<{
    id: string;
    source_article_id: string;
    source: string;
    source_link: string;
    source_title: string;
    source_published_at: string;
    status: DraftRecord['status'];
    headline_es: string;
    body_es: string;
    created_at: string;
    updated_at: string;
    approved_at: string | null;
    published_at: string | null;
  }>('select * from drafts order by updated_at desc limit 500');

  const ids = draftsRes.rows.map((row) => row.id);
  const distRes = ids.length
    ? await db.query<{ draft_id: string; platform: string; content: string }>(
      'select draft_id, platform, content from distribution_content where draft_id = any($1::text[])',
      [ids]
    )
    : { rows: [] as Array<{ draft_id: string; platform: string; content: string }> };

  const distMap = new Map<string, Partial<DistributionPayload>>();
  for (const row of distRes.rows) {
    const prev = distMap.get(row.draft_id) || {};
    if (['twitter', 'instagram', 'linkedin', 'tiktok', 'newsletter'].includes(row.platform)) {
      (prev as Record<string, string>)[row.platform] = row.content;
    }
    distMap.set(row.draft_id, prev);
  }

  const drafts = draftsRes.rows.map((row) => {
    const distribution = normalizeDistribution(distMap.get(row.id) as DistributionPayload | undefined);
    return {
      id: row.id,
      sourceArticleId: row.source_article_id,
      source: row.source,
      sourceLink: row.source_link,
      sourceTitle: row.source_title,
      sourcePublishedAt: row.source_published_at,
      status: row.status,
      headlineEs: row.headline_es,
      bodyEs: row.body_es,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      approvedAt: row.approved_at || undefined,
      publishedAt: row.published_at || undefined,
      distribution
    } satisfies DraftRecord;
  });
  return { drafts, storage: 'postgres' };
}

export async function syncDrafts(records: DraftRecord[]): Promise<{ drafts: DraftRecord[]; storage: 'postgres' | 'memory' }> {
  const normalized = sortDrafts(records.map(normalizeDraft));
  const db = getPool();
  if (!db) {
    memoryDrafts.clear();
    for (const draft of normalized) {
      memoryDrafts.set(draft.id, draft);
    }
    return { drafts: fallbackList(), storage: 'memory' };
  }

  await ensureSchema();
  const client = await db.connect();
  try {
    await client.query('begin');

    const incomingIds = normalized.map((draft) => draft.id);
    if (incomingIds.length > 0) {
      await client.query('delete from drafts where id <> all($1::text[])', [incomingIds]);
    } else {
      await client.query('delete from distribution_content');
      await client.query('delete from drafts');
    }

    for (const draft of normalized) {
      await client.query(
        `insert into drafts (
          id, source_article_id, source, source_link, source_title, source_published_at,
          status, headline_es, body_es, created_at, updated_at, approved_at, published_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        on conflict (id) do update set
          source_article_id = excluded.source_article_id,
          source = excluded.source,
          source_link = excluded.source_link,
          source_title = excluded.source_title,
          source_published_at = excluded.source_published_at,
          status = excluded.status,
          headline_es = excluded.headline_es,
          body_es = excluded.body_es,
          updated_at = excluded.updated_at,
          approved_at = excluded.approved_at,
          published_at = excluded.published_at`,
        [
          draft.id,
          draft.sourceArticleId,
          draft.source,
          draft.sourceLink,
          draft.sourceTitle,
          draft.sourcePublishedAt,
          draft.status,
          draft.headlineEs,
          draft.bodyEs,
          draft.createdAt,
          draft.updatedAt,
          draft.approvedAt || null,
          draft.publishedAt || null
        ]
      );

      await client.query('delete from distribution_content where draft_id = $1', [draft.id]);
      const distribution = normalizeDistribution(draft.distribution);
      if (distribution) {
        const entries = Object.entries(distribution) as Array<[DistributionPlatform, string]>;
        for (const [platform, content] of entries) {
          await client.query(
            `insert into distribution_content (draft_id, platform, content, is_published, updated_at)
             values ($1,$2,$3,$4,$5)
             on conflict (draft_id, platform) do update set
               content = excluded.content,
               is_published = excluded.is_published,
               updated_at = excluded.updated_at`,
            [draft.id, platform, content, draft.status === 'published', draft.updatedAt]
          );
        }
      }
    }

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  return listDrafts();
}
