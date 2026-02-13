import { Pool } from 'pg';
import { createHash } from 'node:crypto';
import type { NewsItem } from '@/lib/types';
import { normalizeLinkForId } from '@/lib/pipeline';

let pool: Pool | null = null;
let poolFailed = false;
let schemaReady = false;
let poolDisabledReason = 'not_initialized';

function getPool(): Pool | null {
  if (pool) return pool;
  if (poolFailed) {
    poolDisabledReason = 'pool_failed';
    return null;
  }
  const url = process.env.DATABASE_URL || (process.env.NODE_ENV !== 'production' ? 'postgresql://localhost:5432/presslab' : '');
  if (!url) {
    poolDisabledReason = 'missing_database_url';
    return null;
  }
  try {
    pool = new Pool({ connectionString: url });
    poolDisabledReason = 'ok';
    return pool;
  } catch {
    poolFailed = true;
    poolDisabledReason = 'pool_constructor_error';
    return null;
  }
}

function buildOutletSourceFilterSql(params: unknown[], options: {
  outletIds: string[];
  sourceNames: string[];
  outletColumn: string;
  sourceColumn: string;
}): string {
  if (options.outletIds.length > 0) {
    params.push(options.outletIds);
    return ` and ${options.outletColumn} = any($${params.length}::text[])`;
  }
  if (options.sourceNames.length > 0) {
    params.push(options.sourceNames);
    return ` and ${options.sourceColumn} = any($${params.length}::text[])`;
  }
  return '';
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
      outlet_id text null,
      title text not null,
      source text not null,
      published_at timestamptz not null,
      country text null,
      language text null,
      source_type text null,
      tier smallint null,
      beat text null,
      classification_source text null,
      classification_reason text null,
      confidence real null,
      world_latam boolean not null default false,
      tags jsonb not null default '[]'::jsonb,
      first_seen_at timestamptz not null default now(),
      last_seen_at timestamptz not null default now(),
      seen_count integer not null default 1
    );
    alter table ingested_articles add column if not exists outlet_id text null;
    alter table ingested_articles add column if not exists classification_reason text null;
    create index if not exists idx_ingested_articles_last_seen_at on ingested_articles(last_seen_at desc);
    create index if not exists idx_ingested_articles_published_at on ingested_articles(published_at desc);
    create index if not exists idx_ingested_articles_source on ingested_articles(source);
    create index if not exists idx_ingested_articles_outlet_id on ingested_articles(outlet_id);
    create index if not exists idx_ingested_articles_country on ingested_articles(country);
    create index if not exists idx_ingested_articles_beat on ingested_articles(beat);
    create table if not exists ingestion_endpoint_runs (
      id bigserial primary key,
      ran_at timestamptz not null default now(),
      runner text not null default 'api_news',
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
    alter table ingestion_endpoint_runs add column if not exists runner text not null default 'api_news';
    create index if not exists idx_ingestion_endpoint_runs_ran_at on ingestion_endpoint_runs(ran_at desc);
    create index if not exists idx_ingestion_endpoint_runs_source on ingestion_endpoint_runs(source);
    create index if not exists idx_ingestion_endpoint_runs_outlet_id on ingestion_endpoint_runs(outlet_id);
    create index if not exists idx_ingestion_endpoint_runs_runner_ran_at on ingestion_endpoint_runs(runner, ran_at desc);
    create table if not exists external_news_articles (
      external_id text primary key,
      publication_datetime timestamptz not null,
      publication_source text not null default 'feed',
      publication_verified boolean not null default false,
      category text not null,
      title_en text null,
      title_original text not null,
      summary_en text null,
      summary_original text null,
      summary_source text not null default 'feed',
      summary_verified boolean not null default false,
      author_name text null,
      author_email text null,
      author_source text not null default 'feed',
      author_verified boolean not null default false,
      quality_score integer not null default 0,
      country text null,
      created_at timestamptz not null default now(),
      last_seen_at timestamptz not null default now(),
      url text not null,
      source text not null,
      is_paywalled boolean not null default false,
      language text null,
      seen_count integer not null default 1
    );
    create index if not exists idx_external_news_articles_publication_datetime on external_news_articles(publication_datetime desc);
    create index if not exists idx_external_news_articles_last_seen_at on external_news_articles(last_seen_at desc);
    create index if not exists idx_external_news_articles_source on external_news_articles(source);
    create index if not exists idx_external_news_articles_url on external_news_articles(url);
    create index if not exists idx_external_news_articles_category on external_news_articles(category);
    create index if not exists idx_external_news_articles_country on external_news_articles(country);
    alter table external_news_articles add column if not exists publication_source text not null default 'feed';
    alter table external_news_articles add column if not exists publication_verified boolean not null default false;
    alter table external_news_articles add column if not exists summary_source text not null default 'feed';
    alter table external_news_articles add column if not exists summary_verified boolean not null default false;
    alter table external_news_articles add column if not exists author_name text null;
    alter table external_news_articles add column if not exists author_email text null;
    alter table external_news_articles add column if not exists author_source text not null default 'feed';
    alter table external_news_articles add column if not exists author_verified boolean not null default false;
    alter table external_news_articles add column if not exists quality_score integer not null default 0;

    create table if not exists radar_summary_queue (
      id bigserial primary key,
      article_external_id text not null unique references external_news_articles(external_id) on delete cascade,
      status text not null default 'pending',
      attempt_count integer not null default 0,
      next_retry_at timestamptz not null default now(),
      last_error text null,
      provider text null,
      model text null,
      started_at timestamptz null,
      completed_at timestamptz null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index if not exists idx_radar_summary_queue_status_retry on radar_summary_queue(status, next_retry_at, id);
    create index if not exists idx_radar_summary_queue_updated on radar_summary_queue(updated_at desc);

    create table if not exists radar_summary_usage_daily (
      usage_date date not null,
      provider text not null,
      request_count integer not null default 0,
      updated_at timestamptz not null default now(),
      primary key (usage_date, provider)
    );

    create table if not exists radar_summary_fetch_logs (
      id bigserial primary key,
      queue_id bigint null references radar_summary_queue(id) on delete set null,
      article_external_id text null,
      domain text not null default 'unknown',
      attempt_count integer not null default 1,
      outcome text not null,
      failure_code text null,
      http_status integer null,
      used_fallback boolean not null default false,
      context_source text null,
      latency_ms integer null,
      created_at timestamptz not null default now()
    );
    create index if not exists idx_radar_summary_fetch_logs_created on radar_summary_fetch_logs(created_at desc);
    create index if not exists idx_radar_summary_fetch_logs_domain_created on radar_summary_fetch_logs(domain, created_at desc);
  `);
  schemaReady = true;
}

async function sha256Hex(value: string): Promise<string> {
  return createHash('sha256').update(value).digest('hex');
}

type Persistable = {
  link: string;
  linkNorm: string;
  linkHash: string;
  outletId: string | null;
  title: string;
  source: string;
  publishedAt: string;
  country: string | null;
  language: string | null;
  sourceType: string | null;
  tier: number | null;
  beat: string | null;
  classificationSource: string | null;
  classificationReason: string | null;
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
    outletId: item.outletId || null,
    title: item.title,
    source: item.source,
    publishedAt: new Date(publishedAtTs).toISOString(),
    country: item.country || null,
    language: item.language || null,
    sourceType: item.sourceType || null,
    tier: typeof item.tier === 'number' ? item.tier : null,
    beat: item.beat || null,
    classificationSource: item.classificationSource || null,
    classificationReason: item.classificationReason || null,
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
    const base = i * 17;
    parts.push(
      `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13},$${base + 14},$${base + 15},$${base + 16},$${base + 17}::jsonb,now(),now(),1)`
    );
    values.push(
      row.link,
      row.linkNorm,
      row.linkHash,
      row.outletId,
      row.title,
      row.source,
      row.publishedAt,
      row.country,
      row.language,
      row.sourceType,
      row.tier,
      row.beat,
      row.classificationSource,
      row.classificationReason,
      row.confidence,
      row.worldLatam,
      JSON.stringify(row.tags)
    );
  });

  const sql = `
    insert into ingested_articles (
      link, link_norm, link_hash, outlet_id, title, source, published_at, country, language, source_type, tier,
      beat, classification_source, classification_reason, confidence, world_latam, tags, first_seen_at, last_seen_at, seen_count
    ) values
    ${parts.join(',')}
    on conflict (link_hash) do update set
      link = excluded.link,
      outlet_id = excluded.outlet_id,
      title = excluded.title,
      source = excluded.source,
      published_at = excluded.published_at,
      country = excluded.country,
      language = excluded.language,
      source_type = excluded.source_type,
      tier = excluded.tier,
      beat = excluded.beat,
      classification_source = excluded.classification_source,
      classification_reason = excluded.classification_reason,
      confidence = excluded.confidence,
      world_latam = excluded.world_latam,
      tags = excluded.tags,
      last_seen_at = now(),
      seen_count = ingested_articles.seen_count + 1
  `;

  return { sql, values };
}

export async function persistIngestedArticles(items: NewsItem[]): Promise<{ persisted: number; storage: 'postgres' | 'disabled'; reason?: string }> {
  const db = getPool();
  if (!db) return { persisted: 0, storage: 'disabled', reason: poolDisabledReason };
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

type StoredNewsRow = {
  link: string;
  outlet_id: string | null;
  title: string;
  description: string | null;
  source: string;
  published_at: string;
  country: string | null;
  language: string | null;
  source_type: string | null;
  tier: number | null;
  beat: string | null;
  classification_source: string | null;
  classification_reason: string | null;
  confidence: number | null;
  world_latam: boolean;
  tags: unknown;
  generated_at: string | null;
};

export async function readIngestedArticles(options: {
  outletIds?: string[];
  sourceNames?: string[];
  limit?: number;
  hours?: number;
}): Promise<{
  storage: 'postgres' | 'disabled';
  reason?: string;
  generatedAt: string | null;
  items: NewsItem[];
}> {
  const db = getPool();
  if (!db) {
    return { storage: 'disabled', reason: poolDisabledReason, generatedAt: null, items: [] };
  }
  await ensureSchema();

  const limit = Math.max(1, Math.min(20000, Math.floor(options.limit || 1000)));
  const hours = Math.max(1, Math.min(168, Math.floor(options.hours || 48)));
  const outletIds = (options.outletIds || []).filter(Boolean);
  const sourceNames = (options.sourceNames || []).filter(Boolean);

  const params: unknown[] = [String(hours), limit];
  const filterSql = buildOutletSourceFilterSql(params, {
    outletIds,
    sourceNames,
    outletColumn: 'i.outlet_id',
    sourceColumn: 'i.source'
  });

  const result = await db.query<StoredNewsRow>(
    `
    select
      i.link,
      i.outlet_id,
      i.title,
      coalesce(e.summary_original, null) as description,
      i.source,
      i.published_at,
      i.country,
      coalesce(e.language, i.language) as language,
      i.source_type,
      i.tier,
      i.beat,
      i.classification_source,
      i.classification_reason,
      i.confidence,
      i.world_latam,
      i.tags,
      max(i.last_seen_at) over() as generated_at
    from ingested_articles i
    left join external_news_articles e on e.url = i.link
    where i.last_seen_at > now() - ($1::text || ' hours')::interval
      ${filterSql}
    order by i.published_at desc
    limit $2
    `,
    params
  );

  const items = result.rows.map((row) => {
    const tierCandidate = Number(row.tier);
    const tier = tierCandidate === 1 || tierCandidate === 2 || tierCandidate === 3 ? tierCandidate : 2;
    const beatCandidate = (row.beat || 'general').toLowerCase();
    const beat: NewsItem['beat'] =
      beatCandidate === 'politics'
      || beatCandidate === 'business'
      || beatCandidate === 'tech'
      || beatCandidate === 'security'
      || beatCandidate === 'climate'
      || beatCandidate === 'world'
      ? (beatCandidate as NewsItem['beat'])
      : 'general';
  const sourceTypeCandidate = (row.source_type || 'global').toLowerCase();
  const sourceType: NewsItem['sourceType'] =
    sourceTypeCandidate === 'local' || sourceTypeCandidate === 'portal'
      ? (sourceTypeCandidate as NewsItem['sourceType'])
      : 'global';
  const section = beat;
  const classificationSource: NewsItem['classificationSource'] = row.classification_source === 'llm' ? 'llm' : 'keyword';
  const tags = Array.isArray(row.tags) ? (row.tags.filter((value) => typeof value === 'string') as string[]) : [];

  return {
      id: row.link,
      outletId: row.outlet_id || undefined,
      title: row.title,
      description: row.description || '',
      link: row.link,
      source: row.source,
      language: row.language || undefined,
      sourceType,
      tier,
      publishedAt: new Date(row.published_at).toISOString(),
      section,
      beat,
      confidence: typeof row.confidence === 'number' ? row.confidence : 0.5,
      classificationSource,
      classificationReason: row.classification_reason || undefined,
      country: row.country || undefined,
      worldLatam: Boolean(row.world_latam),
      tags
    } satisfies NewsItem;
  });

  return {
    storage: 'postgres',
    generatedAt: result.rows[0]?.generated_at ? new Date(result.rows[0].generated_at).toISOString() : null,
    items
  };
}

type ExternalNewsReadRow = {
  link: string;
  outlet_id: string | null;
  title: string;
  description: string | null;
  source: string;
  published_at: string;
  country: string | null;
  language: string | null;
  source_type: string | null;
  tier: number | null;
  beat: string | null;
  classification_source: string | null;
  classification_reason: string | null;
  confidence: number | null;
  world_latam: boolean | null;
  tags: unknown;
  publication_source: string | null;
  summary_source: string | null;
  generated_at: string | null;
};

function mapRowToNewsItem(row: {
  link: string;
  outlet_id: string | null;
  title: string;
  description: string | null;
  source: string;
  published_at: string;
  country: string | null;
  language: string | null;
  source_type: string | null;
  tier: number | null;
  beat: string | null;
  classification_source: string | null;
  classification_reason: string | null;
  confidence: number | null;
  world_latam: boolean | null;
  tags: unknown;
  publication_source?: string | null;
  summary_source?: string | null;
}): NewsItem {
  const tierCandidate = Number(row.tier);
  const tier = tierCandidate === 1 || tierCandidate === 2 || tierCandidate === 3 ? tierCandidate : 2;
  const beatCandidate = (row.beat || 'general').toLowerCase();
  const beat: NewsItem['beat'] =
    beatCandidate === 'politics'
    || beatCandidate === 'business'
    || beatCandidate === 'tech'
    || beatCandidate === 'security'
    || beatCandidate === 'climate'
    || beatCandidate === 'world'
    ? (beatCandidate as NewsItem['beat'])
    : 'general';
  const sourceTypeCandidate = (row.source_type || 'global').toLowerCase();
  const sourceType: NewsItem['sourceType'] =
    sourceTypeCandidate === 'local' || sourceTypeCandidate === 'portal'
      ? (sourceTypeCandidate as NewsItem['sourceType'])
      : 'global';
  const section = beat;
  const classificationSource: NewsItem['classificationSource'] = row.classification_source === 'llm' ? 'llm' : 'keyword';
  const tags = Array.isArray(row.tags) ? (row.tags.filter((value) => typeof value === 'string') as string[]) : [];
  const publicationSource: NewsItem['publicationSource'] =
    row.publication_source === 'article_meta' ? 'article_meta' : 'feed';
  const summarySource: NewsItem['summarySource'] =
    row.summary_source === 'article_meta' ? 'article_meta' : 'feed';

  return {
    id: row.link,
    outletId: row.outlet_id || undefined,
    title: row.title,
    description: row.description || '',
    link: row.link,
    source: row.source,
    language: row.language || undefined,
      sourceType,
      tier,
      publishedAt: new Date(row.published_at).toISOString(),
      section,
      beat,
    confidence: typeof row.confidence === 'number' ? row.confidence : 0.5,
    classificationSource,
    classificationReason: row.classification_reason || undefined,
    country: row.country || undefined,
    worldLatam: Boolean(row.world_latam),
    tags,
    publicationSource,
    summarySource
  } satisfies NewsItem;
}

export async function readExternalNewsArticles(options: {
  outletIds?: string[];
  sourceNames?: string[];
  limit?: number;
  hours?: number;
}): Promise<{
  storage: 'postgres' | 'disabled';
  reason?: string;
  generatedAt: string | null;
  items: NewsItem[];
}> {
  const db = getPool();
  if (!db) {
    return { storage: 'disabled', reason: poolDisabledReason, generatedAt: null, items: [] };
  }
  await ensureSchema();

  const limit = Math.max(1, Math.min(20000, Math.floor(options.limit || 1000)));
  const hours = Math.max(1, Math.min(168, Math.floor(options.hours || 48)));
  const outletIds = (options.outletIds || []).filter(Boolean);
  const sourceNames = (options.sourceNames || []).filter(Boolean);

  const params: unknown[] = [String(hours), limit];
  const filterSql = buildOutletSourceFilterSql(params, {
    outletIds,
    sourceNames,
    outletColumn: 'i.outlet_id',
    sourceColumn: 'e.source'
  });

  const result = await db.query<ExternalNewsReadRow>(
    `
    select
      e.url as link,
      i.outlet_id,
      e.title_original as title,
      e.summary_original as description,
      e.source,
      e.publication_datetime as published_at,
      e.country,
      e.language,
      i.source_type,
      i.tier,
      coalesce(i.beat, e.category, 'general') as beat,
      i.classification_source,
      i.classification_reason,
      i.confidence,
      i.world_latam,
      i.tags,
      e.publication_source,
      e.summary_source,
      max(e.last_seen_at) over() as generated_at
    from external_news_articles e
    left join ingested_articles i on i.link = e.url
    where e.last_seen_at > now() - ($1::text || ' hours')::interval
      ${filterSql}
    order by e.publication_datetime desc
    limit $2
    `,
    params
  );

  const items = result.rows.map((row) => mapRowToNewsItem(row));
  return {
    storage: 'postgres',
    generatedAt: result.rows[0]?.generated_at ? new Date(result.rows[0].generated_at).toISOString() : null,
    items
  };
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
    externalArticles24h: number;
    translatedTitleCoverage24h: number;
    translatedSummaryCoverage24h: number;
  };
  topSources24h: IngestionOpsSourceRow[];
}

export interface IngestionEndpointRun {
  outletId: string;
  source: string;
  method: 'rss' | 'sitemap';
  runner?: 'worker' | 'api_news' | 'warm';
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

export interface EndpointBackoffRow {
  outletId: string;
  source: string;
  method: 'rss' | 'sitemap';
  attempted: number;
  failed: number;
  failPct: number;
}

export async function readFailingEndpointBackoff(options: {
  runner?: 'worker' | 'api_news' | 'warm';
  windowMinutes?: number;
  minAttempts?: number;
  minFailPct?: number;
  limit?: number;
} = {}): Promise<{
  storage: 'postgres' | 'disabled';
  reason?: string;
  rows: EndpointBackoffRow[];
}> {
  const db = getPool();
  if (!db) return { storage: 'disabled', reason: poolDisabledReason, rows: [] };
  await ensureSchema();

  const runner = options.runner || 'worker';
  const windowMinutes = Math.max(5, Math.min(24 * 60, Math.floor(options.windowMinutes || 60)));
  const minAttempts = Math.max(1, Math.min(500, Math.floor(options.minAttempts || 4)));
  const minFailPct = Math.max(1, Math.min(100, Number(options.minFailPct || 90)));
  const limit = Math.max(1, Math.min(10000, Math.floor(options.limit || 5000)));

  const result = await db.query<{
    outlet_id: string;
    source: string;
    method: string;
    attempted: string;
    failed: string;
    fail_pct: string;
  }>(
    `
    with x as (
      select
        outlet_id,
        source,
        method,
        count(*) filter (where attempted)::int as attempted,
        count(*) filter (where attempted and not ok)::int as failed
      from ingestion_endpoint_runs
      where ran_at > now() - ($1::text || ' minutes')::interval
        and runner = $2
      group by outlet_id, source, method
    )
    select
      outlet_id,
      source,
      method,
      attempted::text,
      failed::text,
      round(100.0 * failed / greatest(attempted, 1), 1)::text as fail_pct
    from x
    where attempted >= $3
      and (100.0 * failed / greatest(attempted, 1)) >= $4
    order by failed desc, attempted desc
    limit $5
    `,
    [String(windowMinutes), runner, minAttempts, minFailPct, limit]
  );

  return {
    storage: 'postgres',
    rows: result.rows.map((row) => ({
      outletId: row.outlet_id,
      source: row.source,
      method: row.method === 'sitemap' ? 'sitemap' : 'rss',
      attempted: Number(row.attempted) || 0,
      failed: Number(row.failed) || 0,
      failPct: Number(row.fail_pct) || 0
    }))
  };
}

export async function readLatestIngestionDiagnostics(options: {
  outletIds?: string[];
  sourceNames?: string[];
  runner?: 'worker' | 'api_news' | 'warm';
  minutes?: number;
  limit?: number;
} = {}): Promise<{
  storage: 'postgres' | 'disabled';
  reason?: string;
  runs: IngestionEndpointRun[];
}> {
  const db = getPool();
  if (!db) return { storage: 'disabled', reason: poolDisabledReason, runs: [] };
  await ensureSchema();

  const minutes = Math.max(5, Math.min(24 * 60, Math.floor(options.minutes || 90)));
  const limit = Math.max(1, Math.min(5000, Math.floor(options.limit || 2000)));
  const outletIds = (options.outletIds || []).filter(Boolean);
  const sourceNames = (options.sourceNames || []).filter(Boolean);
  const runner = options.runner;
  const params: unknown[] = [String(minutes)];
  let filterSql = buildOutletSourceFilterSql(params, {
    outletIds,
    sourceNames,
    outletColumn: 'outlet_id',
    sourceColumn: 'source'
  });
  if (runner) {
    params.push(runner);
    filterSql += ` and runner = $${params.length}`;
  }
  params.push(limit);

  const result = await db.query<{
    outlet_id: string;
    source: string;
    method: string;
    attempted: boolean;
    circuit_open: boolean;
    ok: boolean;
    status_code: number | null;
    parsed_count: number;
    parsed_limit: number | null;
    sample_capped: boolean;
    recent24h: number;
    error: string | null;
  }>(
    `
    select distinct on (outlet_id, method)
      outlet_id,
      source,
      method,
      attempted,
      circuit_open,
      ok,
      status_code,
      parsed_count,
      parsed_limit,
      sample_capped,
      recent24h,
      error
    from ingestion_endpoint_runs
    where ran_at > now() - ($1::text || ' minutes')::interval
      ${filterSql}
    order by outlet_id, method, ran_at desc
    limit $${params.length}
    `,
    params
  );

  return {
    storage: 'postgres',
    runs: result.rows.map((row) => ({
      outletId: row.outlet_id,
      source: row.source,
      method: row.method === 'sitemap' ? 'sitemap' : 'rss',
      attempted: Boolean(row.attempted),
      circuitOpen: Boolean(row.circuit_open),
      ok: Boolean(row.ok),
      statusCode: row.status_code,
      parsedCount: row.parsed_count || 0,
      parsedLimit: row.parsed_limit || undefined,
      sampleCapped: Boolean(row.sample_capped),
      recent24h: row.recent24h || 0,
      error: row.error || undefined
    }))
  };
}

export async function persistIngestionDiagnostics(
  runs: IngestionEndpointRun[],
  options: { runner?: 'worker' | 'api_news' | 'warm' } = {}
): Promise<{ persisted: number; storage: 'postgres' | 'disabled'; reason?: string }> {
  const db = getPool();
  if (!db) return { persisted: 0, storage: 'disabled', reason: poolDisabledReason };
  if (!runs.length) return { persisted: 0, storage: 'postgres' };

  await ensureSchema();
  const defaultRunner = options.runner || 'api_news';
  const groups = chunk(runs, 300);
  for (const rows of groups) {
    const values: unknown[] = [];
    const parts: string[] = [];
    rows.forEach((row, i) => {
      const base = i * 13;
      parts.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13})`);
      values.push(
        row.runner || defaultRunner,
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
        runner, outlet_id, source, method, attempted, circuit_open, ok, status_code, parsed_count,
        parsed_limit, sample_capped, recent24h, error
      ) values ${parts.join(',')}
      `,
      values
    );
  }

  return { persisted: runs.length, storage: 'postgres' };
}

type ExternalArticlePersistable = {
  externalId: string;
  publicationDatetime: string;
  publicationSource: 'feed' | 'article_meta';
  publicationVerified: boolean;
  category: string;
  titleEn: string | null;
  titleOriginal: string;
  summaryEn: string | null;
  summaryOriginal: string | null;
  summarySource: 'feed' | 'article_meta';
  summaryVerified: boolean;
  qualityScore: number;
  country: string | null;
  url: string;
  urlNorm: string;
  urlHash: string;
  source: string;
  isPaywalled: boolean;
  language: string | null;
};

const PAYWALL_DOMAIN_HINTS = [
  'nytimes.com',
  'wsj.com',
  'ft.com',
  'theathletic.com',
  'barrons.com',
  'economist.com',
  'washingtonpost.com',
  'bloomberg.com'
];

function isLikelyPaywalled(link: string, source: string): boolean {
  const hay = `${(link || '').toLowerCase()} ${(source || '').toLowerCase()}`;
  return PAYWALL_DOMAIN_HINTS.some((needle) => hay.includes(needle));
}

async function toExternalArticle(item: NewsItem): Promise<ExternalArticlePersistable | null> {
  const linkNorm = normalizeLinkForId(item.link);
  if (!linkNorm) return null;
  const publicationTs = new Date(item.publishedAt).getTime();
  if (!Number.isFinite(publicationTs)) return null;

  const language = item.language || null;
  const titleOriginal = item.title || '';
  if (!titleOriginal) return null;
  const summaryOriginal = (item.description || '').trim() || null;

  const titleEn = language === 'en' ? titleOriginal : null;
  const summaryEn = language === 'en' ? summaryOriginal : null;
  const publicationSource = item.publicationSource || 'feed';
  const summarySource = item.summarySource || 'feed';
  const publicationVerified = publicationSource === 'article_meta';
  const summaryVerified = summarySource === 'article_meta';
  const qualityScore = (publicationVerified ? 60 : 25) + (summaryVerified ? 40 : 15);

  return {
    externalId: await sha256Hex(linkNorm),
    publicationDatetime: new Date(publicationTs).toISOString(),
    publicationSource,
    publicationVerified,
    category: item.beat,
    titleEn,
    titleOriginal,
    summaryEn,
    summaryOriginal,
    summarySource,
    summaryVerified,
    qualityScore,
    country: item.country || null,
    url: item.link,
    urlNorm: linkNorm,
    urlHash: createHash('md5').update(linkNorm.toLowerCase()).digest('hex'),
    source: item.source,
    isPaywalled: isLikelyPaywalled(item.link, item.source),
    language
  };
}

export async function persistExternalNewsArticles(items: NewsItem[]): Promise<{ persisted: number; storage: 'postgres' | 'disabled'; reason?: string; queuedSummaries?: number }> {
  const db = getPool();
  if (!db) return { persisted: 0, storage: 'disabled', reason: poolDisabledReason };
  if (!items.length) return { persisted: 0, storage: 'postgres' };

  await ensureSchema();
  const rows = (await Promise.all(items.map(toExternalArticle))).filter((row): row is ExternalArticlePersistable => Boolean(row));
  if (!rows.length) return { persisted: 0, storage: 'postgres' };

  const groups = chunk(rows, 250);
  let queuedSummaries = 0;
  for (const group of groups) {
    const values: unknown[] = [];
    const parts: string[] = [];
    group.forEach((row, i) => {
      const base = i * 19;
      parts.push(
        `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13},now(),$${base + 14},$${base + 15},$${base + 16},$${base + 17},$${base + 18},$${base + 19},1)`
      );
      values.push(
        row.externalId,
        row.publicationDatetime,
        row.publicationSource,
        row.publicationVerified,
        row.category,
        row.titleEn,
        row.titleOriginal,
        row.summaryEn,
        row.summaryOriginal,
        row.summarySource,
        row.summaryVerified,
        row.qualityScore,
        row.country,
        row.url,
        row.urlNorm,
        row.urlHash,
        row.source,
        row.isPaywalled,
        row.language
      );
    });

    await db.query(
      `
      insert into external_news_articles (
        external_id, publication_datetime, publication_source, publication_verified, category,
        title_en, title_original, summary_en, summary_original, summary_source, summary_verified, quality_score,
        country, created_at, url, url_norm, url_hash, source, is_paywalled, language, seen_count
      ) values ${parts.join(',')}
      on conflict (external_id) do update set
        publication_datetime = excluded.publication_datetime,
        publication_source = case
          when excluded.publication_verified then excluded.publication_source
          else external_news_articles.publication_source
        end,
        publication_verified = external_news_articles.publication_verified or excluded.publication_verified,
        category = excluded.category,
        title_en = coalesce(nullif(excluded.title_en, ''), external_news_articles.title_en),
        title_original = excluded.title_original,
        summary_en = coalesce(nullif(excluded.summary_en, ''), external_news_articles.summary_en),
        summary_original = coalesce(nullif(excluded.summary_original, ''), external_news_articles.summary_original),
        summary_source = case
          when excluded.summary_verified then excluded.summary_source
          else external_news_articles.summary_source
        end,
        summary_verified = external_news_articles.summary_verified or excluded.summary_verified,
        quality_score = greatest(external_news_articles.quality_score, excluded.quality_score),
        country = excluded.country,
        url = excluded.url,
        url_norm = excluded.url_norm,
        url_hash = excluded.url_hash,
        source = excluded.source,
        is_paywalled = excluded.is_paywalled,
        language = excluded.language,
        last_seen_at = now(),
        seen_count = external_news_articles.seen_count + 1
      `,
      values
    );

    const externalIds = group.map((row) => row.externalId);
    if (externalIds.length > 0) {
      const enqueue = await db.query(
        `
          insert into radar_summary_queue (article_external_id, status, next_retry_at, created_at, updated_at)
          select e.external_id, 'pending', now(), now(), now()
          from external_news_articles e
          where e.external_id = any($1::text[])
            and (
              coalesce(btrim(e.summary_original), '') = ''
              or (
                e.language is not null
                and lower(e.language) not like 'en%'
                and coalesce(btrim(e.summary_en), '') = ''
              )
            )
          on conflict (article_external_id) do update
          set
            status = case
              when radar_summary_queue.status = 'done' then radar_summary_queue.status
              else 'pending'
            end,
            updated_at = now()
        `,
        [externalIds]
      );
      queuedSummaries += enqueue.rowCount || 0;
    }
  }

  return { persisted: rows.length, storage: 'postgres', queuedSummaries };
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
        failureRate24h: 0,
        externalArticles24h: 0,
        translatedTitleCoverage24h: 0,
        translatedSummaryCoverage24h: 0
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
    from external_news_articles
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
      and runner = 'worker'
  `);

  const translationTotals = await db.query<{
    external_articles_24h: string;
    translated_title_count_24h: string;
    translated_summary_count_24h: string;
  }>(`
    select
      count(*)::text as external_articles_24h,
      count(*) filter (
        where language is not null
          and btrim(language) <> ''
          and lower(language) not like 'en%'
          and title_en is not null
          and btrim(title_en) <> ''
      )::text as translated_title_count_24h,
      count(*) filter (
        where language is not null
          and btrim(language) <> ''
          and lower(language) not like 'en%'
          and summary_en is not null
          and btrim(summary_en) <> ''
      )::text as translated_summary_count_24h
    from external_news_articles
    where last_seen_at > now() - interval '24 hours'
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
      from external_news_articles
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
        and runner = 'worker'
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
  const tr = translationTotals.rows[0] || {
    external_articles_24h: '0',
    translated_title_count_24h: '0',
    translated_summary_count_24h: '0'
  };
  const externalArticles24h = Number(tr.external_articles_24h || 0);
  const translatedTitleCount24h = Number(tr.translated_title_count_24h || 0);
  const translatedSummaryCount24h = Number(tr.translated_summary_count_24h || 0);

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
      failureRate24h: endpointRuns24h > 0 ? (failedRuns24h / endpointRuns24h) * 100 : 0,
      externalArticles24h,
      translatedTitleCoverage24h: externalArticles24h > 0 ? (translatedTitleCount24h / externalArticles24h) * 100 : 0,
      translatedSummaryCoverage24h: externalArticles24h > 0 ? (translatedSummaryCount24h / externalArticles24h) * 100 : 0
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
