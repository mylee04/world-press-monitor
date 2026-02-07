import { Pool } from 'pg';
import type { NewsItem } from '@/lib/types';
import { normalizeLinkForId } from '@/lib/pipeline';

let pool: Pool | null = null;
let poolFailed = false;
let schemaReady = false;

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
    create table if not exists ingested_articles (
      id bigserial primary key,
      link text not null,
      link_norm text not null,
      link_hash text not null unique,
      title text not null,
      source text not null,
      published_at timestamptz not null,
      country text null,
      language text null,
      source_type text null,
      tier smallint null,
      beat text null,
      classification_source text null,
      confidence real null,
      world_latam boolean not null default false,
      tags jsonb not null default '[]'::jsonb,
      first_seen_at timestamptz not null default now(),
      last_seen_at timestamptz not null default now(),
      seen_count integer not null default 1
    );
    create index if not exists idx_ingested_articles_last_seen_at on ingested_articles(last_seen_at desc);
    create index if not exists idx_ingested_articles_published_at on ingested_articles(published_at desc);
    create index if not exists idx_ingested_articles_source on ingested_articles(source);
    create index if not exists idx_ingested_articles_country on ingested_articles(country);
    create index if not exists idx_ingested_articles_beat on ingested_articles(beat);
    create table if not exists ingestion_endpoint_runs (
      id bigserial primary key,
      ran_at timestamptz not null default now(),
      outlet_id text not null,
      source text not null,
      method text not null,
      attempted boolean not null default false,
      circuit_open boolean not null default false,
      ok boolean not null default false,
      status_code integer null,
      parsed_count integer not null default 0,
      parsed_limit integer null,
      sample_capped boolean not null default false,
      recent24h integer not null default 0,
      error text null
    );
    create index if not exists idx_ingestion_endpoint_runs_ran_at on ingestion_endpoint_runs(ran_at desc);
    create index if not exists idx_ingestion_endpoint_runs_source on ingestion_endpoint_runs(source);
    create index if not exists idx_ingestion_endpoint_runs_outlet_id on ingestion_endpoint_runs(outlet_id);
  `);
  schemaReady = true;
}

async function sha256Hex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

type Persistable = {
  link: string;
  linkNorm: string;
  linkHash: string;
  title: string;
  source: string;
  publishedAt: string;
  country: string | null;
  language: string | null;
  sourceType: string | null;
  tier: number | null;
  beat: string | null;
  classificationSource: string | null;
  confidence: number | null;
  worldLatam: boolean;
  tags: string[];
};

async function toPersistable(item: NewsItem): Promise<Persistable | null> {
  const linkNorm = normalizeLinkForId(item.link);
  if (!linkNorm) return null;
  const publishedAtTs = new Date(item.publishedAt).getTime();
  if (!Number.isFinite(publishedAtTs)) return null;
  return {
    link: item.link,
    linkNorm,
    linkHash: await sha256Hex(linkNorm),
    title: item.title,
    source: item.source,
    publishedAt: new Date(publishedAtTs).toISOString(),
    country: item.country || null,
    language: item.language || null,
    sourceType: item.sourceType || null,
    tier: typeof item.tier === 'number' ? item.tier : null,
    beat: item.beat || null,
    classificationSource: item.classificationSource || null,
    confidence: typeof item.confidence === 'number' ? item.confidence : null,
    worldLatam: Boolean(item.worldLatam),
    tags: Array.isArray(item.tags) ? item.tags : []
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function buildInsertSql(rows: Persistable[]): { sql: string; values: unknown[] } {
  const values: unknown[] = [];
  const parts: string[] = [];
  rows.forEach((row, i) => {
    const base = i * 16;
    parts.push(
      `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13},$${base + 14},$${base + 15}::jsonb,now(),now(),1)`
    );
    values.push(
      row.link,
      row.linkNorm,
      row.linkHash,
      row.title,
      row.source,
      row.publishedAt,
      row.country,
      row.language,
      row.sourceType,
      row.tier,
      row.beat,
      row.classificationSource,
      row.confidence,
      row.worldLatam,
      JSON.stringify(row.tags)
    );
  });

  const sql = `
    insert into ingested_articles (
      link, link_norm, link_hash, title, source, published_at, country, language, source_type, tier,
      beat, classification_source, confidence, world_latam, tags, first_seen_at, last_seen_at, seen_count
    ) values
    ${parts.join(',')}
    on conflict (link_hash) do update set
      link = excluded.link,
      title = excluded.title,
      source = excluded.source,
      published_at = excluded.published_at,
      country = excluded.country,
      language = excluded.language,
      source_type = excluded.source_type,
      tier = excluded.tier,
      beat = excluded.beat,
      classification_source = excluded.classification_source,
      confidence = excluded.confidence,
      world_latam = excluded.world_latam,
      tags = excluded.tags,
      last_seen_at = now(),
      seen_count = ingested_articles.seen_count + 1
  `;

  return { sql, values };
}

export async function persistIngestedArticles(items: NewsItem[]): Promise<{ persisted: number; storage: 'postgres' | 'disabled' }> {
  const db = getPool();
  if (!db) return { persisted: 0, storage: 'disabled' };
  if (!items.length) return { persisted: 0, storage: 'postgres' };

  await ensureSchema();
  const prepared = (await Promise.all(items.map(toPersistable))).filter((row): row is Persistable => Boolean(row));
  if (!prepared.length) return { persisted: 0, storage: 'postgres' };

  const groups = chunk(prepared, 300);
  for (const rows of groups) {
    const { sql, values } = buildInsertSql(rows);
    await db.query(sql, values);
  }
  return { persisted: prepared.length, storage: 'postgres' };
}

export interface IngestionOpsSourceRow {
  source: string;
  uniqueItems24h: number;
  seenTotal24h: number;
  duplicateCandidates24h: number;
  endpointRuns24h: number;
  failedRuns24h: number;
  failureRate24h: number;
}

export interface IngestionOpsSummary {
  storage: 'postgres' | 'disabled';
  generatedAt: string;
  totals: {
    uniqueItems24h: number;
    sourceCount24h: number;
    seenTotal24h: number;
    duplicateCandidates24h: number;
    duplicateRate24h: number;
    endpointRuns24h: number;
    failedRuns24h: number;
    failureRate24h: number;
  };
  topSources24h: IngestionOpsSourceRow[];
}

export interface IngestionEndpointRun {
  outletId: string;
  source: string;
  method: 'rss' | 'sitemap';
  attempted: boolean;
  circuitOpen: boolean;
  ok: boolean;
  statusCode: number | null;
  parsedCount: number;
  parsedLimit?: number;
  sampleCapped?: boolean;
  recent24h: number;
  error?: string;
}

export async function persistIngestionDiagnostics(runs: IngestionEndpointRun[]): Promise<{ persisted: number; storage: 'postgres' | 'disabled' }> {
  const db = getPool();
  if (!db) return { persisted: 0, storage: 'disabled' };
  if (!runs.length) return { persisted: 0, storage: 'postgres' };

  await ensureSchema();
  const groups = chunk(runs, 300);
  for (const rows of groups) {
    const values: unknown[] = [];
    const parts: string[] = [];
    rows.forEach((row, i) => {
      const base = i * 12;
      parts.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12})`);
      values.push(
        row.outletId,
        row.source,
        row.method,
        Boolean(row.attempted),
        Boolean(row.circuitOpen),
        Boolean(row.ok),
        row.statusCode ?? null,
        row.parsedCount ?? 0,
        row.parsedLimit ?? null,
        Boolean(row.sampleCapped),
        row.recent24h ?? 0,
        row.error ?? null
      );
    });
    await db.query(
      `
      insert into ingestion_endpoint_runs (
        outlet_id, source, method, attempted, circuit_open, ok, status_code, parsed_count,
        parsed_limit, sample_capped, recent24h, error
      ) values ${parts.join(',')}
      `,
      values
    );
  }

  return { persisted: runs.length, storage: 'postgres' };
}

export async function getIngestionOpsSummary24h(): Promise<IngestionOpsSummary> {
  const db = getPool();
  if (!db) {
    return {
      storage: 'disabled',
      generatedAt: new Date().toISOString(),
      totals: {
        uniqueItems24h: 0,
        sourceCount24h: 0,
        seenTotal24h: 0,
        duplicateCandidates24h: 0,
        duplicateRate24h: 0,
        endpointRuns24h: 0,
        failedRuns24h: 0,
        failureRate24h: 0
      },
      topSources24h: []
    };
  }

  await ensureSchema();
  const totals = await db.query<{
    unique_items_24h: string;
    source_count_24h: string;
    seen_total_24h: string;
    duplicate_candidates_24h: string;
  }>(`
    select
      count(*)::text as unique_items_24h,
      count(distinct source)::text as source_count_24h,
      coalesce(sum(seen_count), 0)::text as seen_total_24h,
      count(*) filter (where seen_count > 1)::text as duplicate_candidates_24h
    from ingested_articles
    where last_seen_at > now() - interval '24 hours'
  `);

  const runTotals = await db.query<{
    endpoint_runs_24h: string;
    failed_runs_24h: string;
  }>(`
    select
      count(*)::text as endpoint_runs_24h,
      count(*) filter (where attempted and not ok)::text as failed_runs_24h
    from ingestion_endpoint_runs
    where ran_at > now() - interval '24 hours'
  `);

  const top = await db.query<{
    source: string;
    unique_items_24h: string;
    seen_total_24h: string;
    duplicate_candidates_24h: string;
    endpoint_runs_24h: string;
    failed_runs_24h: string;
  }>(`
    with article_rollup as (
      select
        source,
        count(*)::int as unique_items_24h,
        coalesce(sum(seen_count), 0)::int as seen_total_24h,
        count(*) filter (where seen_count > 1)::int as duplicate_candidates_24h
      from ingested_articles
      where last_seen_at > now() - interval '24 hours'
      group by source
    ),
    run_rollup as (
      select
        source,
        count(*)::int as endpoint_runs_24h,
        count(*) filter (where attempted and not ok)::int as failed_runs_24h
      from ingestion_endpoint_runs
      where ran_at > now() - interval '24 hours'
      group by source
    )
    select
      coalesce(a.source, r.source) as source,
      coalesce(a.unique_items_24h, 0)::text as unique_items_24h,
      coalesce(a.seen_total_24h, 0)::text as seen_total_24h,
      coalesce(a.duplicate_candidates_24h, 0)::text as duplicate_candidates_24h,
      coalesce(r.endpoint_runs_24h, 0)::text as endpoint_runs_24h,
      coalesce(r.failed_runs_24h, 0)::text as failed_runs_24h
    from article_rollup a
    full outer join run_rollup r on r.source = a.source
    order by coalesce(a.unique_items_24h, 0) desc, coalesce(r.failed_runs_24h, 0) desc, coalesce(a.source, r.source) asc
    limit 25
  `);

  const t = totals.rows[0] || {
    unique_items_24h: '0',
    source_count_24h: '0',
    seen_total_24h: '0',
    duplicate_candidates_24h: '0'
  };
  const r = runTotals.rows[0] || {
    endpoint_runs_24h: '0',
    failed_runs_24h: '0'
  };
  const uniqueItems24h = Number(t.unique_items_24h || 0);
  const duplicateCandidates24h = Number(t.duplicate_candidates_24h || 0);
  const endpointRuns24h = Number(r.endpoint_runs_24h || 0);
  const failedRuns24h = Number(r.failed_runs_24h || 0);

  return {
    storage: 'postgres',
    generatedAt: new Date().toISOString(),
    totals: {
      uniqueItems24h,
      sourceCount24h: Number(t.source_count_24h || 0),
      seenTotal24h: Number(t.seen_total_24h || 0),
      duplicateCandidates24h,
      duplicateRate24h: uniqueItems24h > 0 ? (duplicateCandidates24h / uniqueItems24h) * 100 : 0,
      endpointRuns24h,
      failedRuns24h,
      failureRate24h: endpointRuns24h > 0 ? (failedRuns24h / endpointRuns24h) * 100 : 0
    },
    topSources24h: top.rows.map((row) => ({
      source: row.source,
      uniqueItems24h: Number(row.unique_items_24h || 0),
      seenTotal24h: Number(row.seen_total_24h || 0),
      duplicateCandidates24h: Number(row.duplicate_candidates_24h || 0),
      endpointRuns24h: Number(row.endpoint_runs_24h || 0),
      failedRuns24h: Number(row.failed_runs_24h || 0),
      failureRate24h: Number(row.endpoint_runs_24h || 0) > 0
        ? (Number(row.failed_runs_24h || 0) / Number(row.endpoint_runs_24h || 0)) * 100
        : 0
    }))
  };
}
