import { Pool } from 'pg';
import { createHash } from 'node:crypto';
import type {
  NewsItem,
  NewsSection,
  NewsTitleQuality,
  NewsTitleRepairStatus,
} from '@/lib/types';
import {
  decodeHtmlEntities,
  looksLikeLowSignalArticleTitle,
  normalizeArticleTitle,
  normalizeHtmlText,
  normalizeReadableArticleTitle,
} from '@/lib/html-entities';
import {
  assessNewsTitle,
  newsTitleQualityRank,
  normalizeNewsTitleQuality,
  normalizeNewsTitleRepairStatus,
} from '@/lib/title-quality';
import {
  preferPersistedArticleRow,
  sanitizeTextForDatabase,
  truncatePersistedText,
  type NewsArticlePersistable,
  type MissingPublishedAtPersistable,
  toMissingPublishedAtPersistable,
  toNewsArticlePersistable,
} from '@/lib/news-write-helpers';
import { normalizeLinkForId } from '@/lib/pipeline';
import {
  buildArticleTaxonomy,
  NEWS_SECTION_ORDER,
  normalizeSourceCategories,
} from '@/lib/article-taxonomy';

let pool: Pool | null = null;
let poolFailed = false;
let schemaReady = false;
let poolDisabledReason = 'not_initialized';

const INGEST_FEED_WATERMARKS_TABLE = 'ingest_feed_watermarks_v2';
const INGEST_SITEMAP_POLICY_TABLE = 'ingest_sitemap_policy_v2';

const publicationMaxAgeDays = (() => {
  const rawValue = process.env.NEWS_PUBLICATION_MAX_AGE_DAYS;
  if (!rawValue) return 7;
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 7;
  return parsed;
})();
const publicationMaxAgeMs = publicationMaxAgeDays === 0 ? 0 : publicationMaxAgeDays * 24 * 60 * 60 * 1000;
const storedTitleMaxChars = (() => {
  const rawValue = process.env.NEWS_TITLE_MAX_CHARS;
  if (!rawValue) return 300;
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 60 || parsed > 2000) return 300;
  return parsed;
})();
const storedSnippetMaxChars = (() => {
  const rawValue = process.env.NEWS_SNIPPET_MAX_CHARS;
  if (!rawValue) return 600;
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 100 || parsed > 8000) return 600;
  return parsed;
})();
const apiSnippetMaxChars = (() => {
  const rawValue = process.env.NEWS_API_SNIPPET_MAX_CHARS;
  if (!rawValue) return 400;
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 80 || parsed > 8000) return 400;
  return parsed;
})();
const newsApiMaxFutureMinutes = (() => {
  const rawValue = process.env.NEWS_API_MAX_FUTURE_MINUTES;
  if (!rawValue) return 30;
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 24 * 60) return 30;
  return parsed;
})();
const dashboardTopicDisplayLimit = (() => {
  const rawValue = process.env.NEWS_API_DASHBOARD_TOPIC_DISPLAY_LIMIT;
  if (!rawValue) return 10;
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 3 || parsed > 30) return 10;
  return parsed;
})();
const dashboardSourceCategoryDisplayLimit = (() => {
  const rawValue = process.env.NEWS_API_DASHBOARD_SOURCE_CATEGORY_DISPLAY_LIMIT;
  if (!rawValue) return 24;
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 6 || parsed > 50) return 24;
  return parsed;
})();
const dashboardSummaryCacheMs = (() => {
  const rawValue = process.env.NEWS_API_DASHBOARD_SUMMARY_CACHE_MS;
  if (!rawValue) return 60_000;
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 15 * 60_000) return 60_000;
  return parsed;
})();
const VALID_NEWS_SECTION_LIST: readonly NewsSection[] = [
  'world',
  'politics',
  'conflicts',
  'business',
  'tech',
  'sports',
  'health',
  'entertainment',
  'lifestyle',
  'arts',
  'science',
  'climate',
  'others',
];
const VALID_NEWS_SECTIONS: ReadonlySet<NewsSection> = new Set<NewsSection>(VALID_NEWS_SECTION_LIST);
const CUSTOMER_VISIBLE_TITLE_QUALITY_SQL = `coalesce(nullif(trim(title_quality), ''), 'ok') <> 'suspect'`;

type DashboardSummaryCacheEntry = {
  expiresAt: number;
  value: NewsApiDashboardSummaryResult;
};

let dashboardSummaryCache = new Map<string, DashboardSummaryCacheEntry>();

function buildCustomerVisibleTitleQualitySql(columnExpression: string): string {
  return `coalesce(nullif(trim(${columnExpression}), ''), 'ok') <> 'suspect'`;
}

function truncateText(value: string, maxChars: number): string {
  return truncatePersistedText(value, maxChars);
}

type NewsDbHealthResult = {
  ok: boolean;
  reason?: string;
  latencyMs: number;
};

const DEFAULT_NEWS_DB_HEALTH_TIMEOUT_MS = 2000;

function getPool(): Pool | null {
  if (pool) return pool;
  if (poolFailed) {
    poolDisabledReason = 'pool_failed';
    return null;
  }
  const url = process.env.DATABASE_URL?.trim();
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

export async function checkNewsDatabaseHealth(timeoutMs: number = DEFAULT_NEWS_DB_HEALTH_TIMEOUT_MS): Promise<NewsDbHealthResult> {
  const db = getPool();
  if (!db) {
    return {
      ok: false,
      reason: poolDisabledReason,
      latencyMs: 0
    };
  }

  const parsedTimeoutMs = Number(timeoutMs);
  const normalizedTimeoutMs = Math.max(
    200,
    Math.min(
      15_000,
      Number.isFinite(parsedTimeoutMs) && parsedTimeoutMs > 0 ? Math.floor(parsedTimeoutMs) : DEFAULT_NEWS_DB_HEALTH_TIMEOUT_MS
    )
  );
  const startedAt = Date.now();
  let timeoutHandle: ReturnType<typeof setTimeout>;

  const timeoutResult = new Promise<NewsDbHealthResult>((resolve) => {
    timeoutHandle = setTimeout(() => {
      resolve({
        ok: false,
        reason: 'timeout',
        latencyMs: Math.max(1, Date.now() - startedAt)
      });
    }, normalizedTimeoutMs);
  });

  const dbProbeResult = db
    .query('select 1')
    .then(() => ({
      ok: true,
      reason: undefined,
      latencyMs: 0
    }))
    .catch((error: unknown) => ({
      ok: false,
      reason: error instanceof Error ? error.message : 'query_failed',
      latencyMs: 0
    }));

  const result = await Promise.race([dbProbeResult, timeoutResult]);
  clearTimeout(timeoutHandle!);

  return {
    ok: result.ok,
    reason: result.ok ? undefined : result.reason,
    latencyMs: Date.now() - startedAt
  };
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

function normalizeStoredSectionValue(value: string | null | undefined): NewsSection {
  const normalized = (value || '').trim().toLowerCase();
  if (VALID_NEWS_SECTIONS.has(normalized as NewsSection)) {
    return normalized as NewsSection;
  }
  return 'others';
}

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  const db = getPool();
  if (!db) return;
  await db.query(`
    do $$
    begin
      if exists (
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and table_name = 'external_news_articles'
          and not exists (
            select 1
            from information_schema.tables
            where table_schema = 'public'
              and table_name = 'news_articles'
          )
      ) then
        alter table external_news_articles rename to news_articles;
      end if;

      if exists (
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and table_name = 'ingestion_endpoint_runs'
          and not exists (
            select 1
            from information_schema.tables
            where table_schema = 'public'
              and table_name = 'rss_health_status'
          )
      ) then
        alter table ingestion_endpoint_runs rename to rss_health_status;
      end if;
    end;
    $$;

    create table if not exists rss_health_status (
      id bigserial primary key,
      ran_at timestamptz not null default now(),
      runner text not null default 'api_news',
      outlet_id text not null,
      source text not null,
      method text not null,
      country text not null default 'Global',
      attempted boolean not null default false,
      circuit_open boolean not null default false,
      ok boolean not null default false,
      status_code integer null,
      parsed_count integer not null default 0,
      fetched_count integer not null default 0,
      parsed_limit integer null,
      sample_capped boolean not null default false,
      recent24h integer not null default 0,
      missing_title_count integer not null default 0,
      missing_summary_count integer not null default 0,
      missing_published_at_count integer not null default 0,
      missing_link_count integer not null default 0,
      requested_url text,
      final_url text,
      content_type text,
      response_ms integer,
      sniffed_type text,
      parsed_ok boolean,
      failure_stage text,
      health_classification text,
      newest_item_published_at timestamptz,
      error text null
    );
    alter table rss_health_status add column if not exists runner text not null default 'api_news';
    alter table rss_health_status add column if not exists country text not null default 'Global';
    alter table rss_health_status add column if not exists fetched_count integer not null default 0;
    alter table rss_health_status add column if not exists missing_title_count integer not null default 0;
    alter table rss_health_status add column if not exists missing_summary_count integer not null default 0;
    alter table rss_health_status add column if not exists missing_published_at_count integer not null default 0;
    alter table rss_health_status add column if not exists missing_link_count integer not null default 0;
    alter table rss_health_status add column if not exists requested_url text;
    alter table rss_health_status add column if not exists final_url text;
    alter table rss_health_status add column if not exists content_type text;
    alter table rss_health_status add column if not exists response_ms integer;
    alter table rss_health_status add column if not exists sniffed_type text;
    alter table rss_health_status add column if not exists parsed_ok boolean;
    alter table rss_health_status add column if not exists failure_stage text;
    alter table rss_health_status add column if not exists health_classification text;
    alter table rss_health_status add column if not exists newest_item_published_at timestamptz;
    create index if not exists idx_rss_health_status_ran_at on rss_health_status(ran_at desc);
    create index if not exists idx_rss_health_status_country on rss_health_status(country);
    create index if not exists idx_rss_health_status_source on rss_health_status(source);
    create index if not exists idx_rss_health_status_outlet_id on rss_health_status(outlet_id);
    create index if not exists idx_rss_health_status_runner_ran_at on rss_health_status(runner, ran_at desc);
    drop index if exists idx_ingestion_endpoint_runs_ran_at;
    drop index if exists idx_ingestion_endpoint_runs_source;
    drop index if exists idx_ingestion_endpoint_runs_outlet_id;
    drop index if exists idx_ingestion_endpoint_runs_runner_ran_at;
create table if not exists news_articles (
      external_id text primary key,
      stable_id text null,
      publication_datetime timestamptz not null,
      title_original text not null,
      title_quality text not null default 'ok',
      title_quality_reason text null,
      title_quality_checked_at timestamptz null,
      title_repair_status text not null default 'not_needed',
      title_repair_source text null,
      title_repair_attempted_at timestamptz null,
      title_repaired_at timestamptz null,
      snippet_original text null,
      country text null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      url text not null,
      source text not null,
      language text null,
      section text null,
      primary_section text null,
      sections_normalized text[] not null default '{}',
      feed_categories text[] not null default '{}',
      primary_topic text null,
      topics text[] not null default '{}',
      topics_derived_at timestamptz null,
      taxonomy_derived_at timestamptz null
    );
    alter table news_articles add column if not exists updated_at timestamptz not null default now();
    alter table news_articles add column if not exists feed_categories text[] not null default '{}';
    alter table news_articles add column if not exists stable_id text null;
    alter table news_articles add column if not exists title_quality text not null default 'ok';
    alter table news_articles add column if not exists title_quality_reason text null;
    alter table news_articles add column if not exists title_quality_checked_at timestamptz null;
    alter table news_articles add column if not exists title_repair_status text not null default 'not_needed';
    alter table news_articles add column if not exists title_repair_source text null;
    alter table news_articles add column if not exists title_repair_attempted_at timestamptz null;
    alter table news_articles add column if not exists title_repaired_at timestamptz null;
    alter table news_articles add column if not exists primary_section text null;
    alter table news_articles add column if not exists sections_normalized text[] not null default '{}';
    alter table news_articles add column if not exists primary_topic text null;
    alter table news_articles add column if not exists topics text[] not null default '{}';
    alter table news_articles add column if not exists topics_derived_at timestamptz null;
    alter table news_articles add column if not exists taxonomy_derived_at timestamptz null;
    create index if not exists idx_news_articles_created_at on news_articles(created_at desc);
    create index if not exists idx_news_articles_updated_at on news_articles(updated_at desc);
    create index if not exists idx_news_articles_publication_datetime on news_articles(publication_datetime desc);
    create index if not exists idx_news_articles_publication_created_at on news_articles(publication_datetime desc, created_at desc);
    create index if not exists idx_news_articles_source on news_articles(source);
    create index if not exists idx_news_articles_url on news_articles(url);
    create index if not exists idx_news_articles_stable_id on news_articles(stable_id);
    create index if not exists idx_news_articles_section on news_articles(section);
    create index if not exists idx_news_articles_primary_section on news_articles(primary_section);
    create index if not exists idx_news_articles_country on news_articles(country);
    create index if not exists idx_news_articles_title_quality on news_articles(title_quality);
    create index if not exists idx_news_articles_title_repair_status on news_articles(title_repair_status);
    create index if not exists idx_news_articles_primary_topic on news_articles(primary_topic);
    create index if not exists idx_news_articles_topics on news_articles using gin(topics);
    create index if not exists idx_news_articles_sections_normalized on news_articles using gin(sections_normalized);
    create table if not exists ingest_missing_published_at (
      candidate_id text primary key,
      outlet_id text not null,
      source text not null,
      country text not null default 'Global',
      method text not null,
      url text not null,
      title_original text not null,
      snippet_original text,
      language text,
      section text,
      feed_categories text[] not null default '{}',
      first_seen_at timestamptz not null default now(),
      last_seen_at timestamptz not null default now(),
      seen_count integer not null default 1,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index if not exists idx_ingest_missing_published_at_last_seen on ingest_missing_published_at(last_seen_at desc);
    create index if not exists idx_ingest_missing_published_at_source on ingest_missing_published_at(source);
    create index if not exists idx_ingest_missing_published_at_country on ingest_missing_published_at(country);
    create index if not exists idx_ingest_missing_published_at_method on ingest_missing_published_at(method);
    create table if not exists ingest_feed_watermarks_v2 (
      outlet_id text not null,
      source text not null,
      country text not null default 'Global',
      method text not null,
      last_publication_at timestamptz,
      last_fetched_at timestamptz not null default now(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (outlet_id, method)
    );
    create index if not exists idx_ingest_feed_watermarks_v2_source on ingest_feed_watermarks_v2(source);
    create index if not exists idx_ingest_feed_watermarks_v2_country on ingest_feed_watermarks_v2(country);

    create table if not exists ingest_sitemap_policy_v2 (
      outlet_id text primary key,
      source text not null,
      country text not null default 'Global',
      status text not null default 'active',
      reason text,
      last_failure_reason text,
      consecutive_failures integer not null default 0,
      disabled_until timestamptz,
      last_attempted_at timestamptz,
      disabled_since timestamptz,
      last_success_at timestamptz,
      last_checked_at timestamptz not null default now(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index if not exists idx_ingest_sitemap_policy_v2_status on ingest_sitemap_policy_v2(status);
    create index if not exists idx_ingest_sitemap_policy_v2_country on ingest_sitemap_policy_v2(country);
    create index if not exists idx_ingest_sitemap_policy_v2_disabled_until on ingest_sitemap_policy_v2(disabled_until);
    create table if not exists ingest_ops_hourly (
      hour_bucket timestamptz not null,
      runner text not null default 'worker',
      outlet_id text not null,
      source text not null,
      country text not null default 'Global',
      method text not null,
      attempted_runs integer not null default 0,
      successful_runs integer not null default 0,
      failed_runs integer not null default 0,
      fetched_count integer not null default 0,
      valid_count integer not null default 0,
      missing_title_count integer not null default 0,
      missing_summary_count integer not null default 0,
      missing_published_at_count integer not null default 0,
      missing_link_count integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (hour_bucket, runner, outlet_id, method)
    );
    create index if not exists idx_ingest_ops_hourly_source on ingest_ops_hourly(source);
    create index if not exists idx_ingest_ops_hourly_country on ingest_ops_hourly(country);
    create index if not exists idx_ingest_ops_hourly_hour on ingest_ops_hourly(hour_bucket desc);
    create table if not exists ingest_ops_daily (
      day_bucket date not null,
      runner text not null default 'worker',
      outlet_id text not null,
      source text not null,
      country text not null default 'Global',
      method text not null,
      attempted_runs integer not null default 0,
      successful_runs integer not null default 0,
      failed_runs integer not null default 0,
      fetched_count integer not null default 0,
      valid_count integer not null default 0,
      missing_title_count integer not null default 0,
      missing_summary_count integer not null default 0,
      missing_published_at_count integer not null default 0,
      missing_link_count integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (day_bucket, runner, outlet_id, method)
    );
    create index if not exists idx_ingest_ops_daily_source on ingest_ops_daily(source);
    create index if not exists idx_ingest_ops_daily_country on ingest_ops_daily(country);
    create index if not exists idx_ingest_ops_daily_day on ingest_ops_daily(day_bucket desc);
    drop index if exists idx_external_news_articles_last_seen_at;
    drop index if exists idx_external_news_articles_publication_datetime;
    drop index if exists idx_external_news_articles_source;
    drop index if exists idx_external_news_articles_url;
    drop index if exists idx_external_news_articles_section;
    drop index if exists idx_external_news_articles_country;
    alter table news_articles drop column if exists seen_count;
    alter table news_articles drop column if exists last_seen_at;
    drop index if exists idx_news_articles_last_seen_at;

    drop index if exists idx_news_articles_category;
    do $$
    begin
      if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'news_articles'
          and column_name = 'category'
      ) then
        update news_articles
          set section = coalesce(section, category)
          where section is null and category is not null;
      end if;
    end;
    $$;
    do $$
    begin
      if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'news_articles'
          and column_name = 'summary_original'
      ) then
        if exists (
          select 1
          from information_schema.columns
            where table_schema = 'public'
              and table_name = 'news_articles'
              and column_name = 'snippet_original'
        ) then
          update news_articles
            set snippet_original = coalesce(snippet_original, summary_original)
            where snippet_original is null;
          alter table news_articles drop column summary_original;
        else
          alter table news_articles rename column summary_original to snippet_original;
        end if;
      end if;
    end;
    $$;
    alter table news_articles drop column if exists category;
    alter table news_articles drop column if exists url_norm;
    alter table news_articles drop column if exists url_hash;
    alter table news_articles drop column if exists title_en;
    alter table news_articles drop column if exists summary_en;
    alter table news_articles drop column if exists publication_source;
    alter table news_articles drop column if exists publication_verified;
    alter table news_articles drop column if exists summary_source;
    alter table news_articles drop column if exists summary_verified;
    alter table news_articles drop column if exists author_name;
    alter table news_articles drop column if exists author_email;
    alter table news_articles drop column if exists author_source;
    alter table news_articles drop column if exists author_verified;
    alter table news_articles drop column if exists quality_score;
    alter table news_articles drop column if exists is_paywalled;
    alter table news_articles drop column if exists seen_count;
    drop table if exists radar_summary_fetch_logs;
    drop table if exists radar_summary_usage_daily;
    drop table if exists radar_summary_queue;
    drop table if exists ingested_articles;

    `);
  schemaReady = true;
}

async function executeIngestionQuery(db: Pool, queryText: string, values: unknown[], label: string): Promise<void> {
  try {
    await db.query(queryText, values);
  } catch (error) {
    const code = typeof (error as { code?: unknown })?.code === 'string' ? String((error as { code: string }).code) : '';
    const isInvalidUtf8 = code === '22021' || (error instanceof Error && error.message.includes('invalid byte sequence for encoding'));
    if (isInvalidUtf8) {
      const sanitizedValues = values.map((value) => {
        if (typeof value === 'string') return sanitizeTextForDatabase(value);
        if (Array.isArray(value)) {
          return value.map((entry) => (typeof entry === 'string' ? sanitizeTextForDatabase(entry) : entry));
        }
        if (value instanceof Uint8Array) {
          return sanitizeTextForDatabase(new TextDecoder('utf-8').decode(value));
        }
        return value;
      });
      if (process.env.INGEST_SQL_DEBUG === '1') {
        console.error(`[ingest-store] ${label} retrying with sanitized UTF-8 values`);
      }
      await db.query(queryText, sanitizedValues);
      return;
    }
    if (process.env.INGEST_SQL_DEBUG === '1') {
      console.error(`[ingest-store] ${label} failed`);
      console.error(queryText);
      console.error(`param_count=${values.length}`);
      console.error(values.slice(0, 30));
    }
    throw error;
  }
}

async function sha256Hex(value: string): Promise<string> {
  return createHash('sha256').update(value).digest('hex');
}

type FeedWatermark = {
  outletId: string;
  source: string;
  country: string;
  method: 'rss' | 'sitemap';
  lastPublicationAt: string | null;
};

type FeedWatermarkDbRow = {
  outlet_id: string;
  source: string;
  country: string;
  method: string;
  last_publication_at: string | null;
};

function getFeedWatermarkKey(outletId: string, method: 'rss' | 'sitemap'): string {
  return `${outletId}:${method}`;
}

function isRecoverableIngestionStateError(error: unknown, relationNames: string[]): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('pg_toast_2619')
    || message.includes('pg_statistic')
    || message.includes('missing chunk number')
    || relationNames.some((name) => message.includes(name))
  );
}

function isRecoverableFeedWatermarkError(error: unknown): boolean {
  return isRecoverableIngestionStateError(error, ['ingest_feed_watermarks', INGEST_FEED_WATERMARKS_TABLE]);
}

function isRecoverableSitemapPolicyError(error: unknown): boolean {
  return isRecoverableIngestionStateError(error, ['ingest_sitemap_policy', INGEST_SITEMAP_POLICY_TABLE]);
}

export async function readIngestionFeedWatermarks(rows: Array<{ outletId: string; method: 'rss' | 'sitemap' }>): Promise<Map<string, string | null>> {
  const db = getPool();
  if (!db) return new Map();
  if (!rows.length) return new Map();
  await ensureSchema();

  const unique = new Map<string, { outletId: string; method: 'rss' | 'sitemap' }>();
  for (const row of rows) {
    if (!row.outletId) continue;
    unique.set(getFeedWatermarkKey(row.outletId, row.method), row);
  }
  const requests = [...unique.values()];
  if (!requests.length) return new Map();

  const values: string[] = [];
  const placeholders = requests
    .map((request, index) => {
      const base = index * 2;
      values.push(request.outletId);
      values.push(request.method);
      return `($${base + 1}, $${base + 2})`;
    })
    .join(', ');
  const map = new Map<string, string | null>();
  for (const request of requests) {
    map.set(getFeedWatermarkKey(request.outletId, request.method), null);
  }

  try {
    const result = await db.query<FeedWatermarkDbRow>(
      `
      with requested(outlet_id, method) as (
        values ${placeholders}
      )
      select
        r.outlet_id,
        r.method,
        w.source,
        w.country,
        w.last_publication_at
      from requested r
      left join ingest_feed_watermarks_v2 w
        on w.outlet_id = r.outlet_id
        and w.method = r.method
      `,
      values
    );

    for (const row of result.rows) {
      map.set(getFeedWatermarkKey(row.outlet_id, row.method as 'rss' | 'sitemap'), row.last_publication_at || null);
    }
  } catch (error) {
    if (!isRecoverableFeedWatermarkError(error)) throw error;
    console.warn('[ingestion-store] skipping feed watermark reads due to recoverable catalog error:', error instanceof Error ? error.message : String(error));
  }
  return map;
}

export async function upsertIngestionFeedWatermarks(rows: FeedWatermark[]): Promise<void> {
  const db = getPool();
  if (!db || !rows.length) return;
  await ensureSchema();

  const deduped = new Map<string, FeedWatermark>();
  for (const row of rows) {
    if (!row.outletId || !row.method) continue;
    const key = getFeedWatermarkKey(row.outletId, row.method);
    const current = deduped.get(key);
    if (!current || (row.lastPublicationAt && (!current.lastPublicationAt || row.lastPublicationAt > current.lastPublicationAt))) {
      deduped.set(key, row);
    }
  }

  const values: unknown[] = [];
  const parts: string[] = [];
  [...deduped.values()].forEach((row, index) => {
    const base = index * 5;
    parts.push(
      `($${base + 1}::text,$${base + 2}::text,$${base + 3}::text,$${base + 4}::text,$${base + 5}::timestamptz,now(),now())`
    );
    values.push(
      row.outletId,
      row.source,
      row.country,
      row.method,
      row.lastPublicationAt
    );
  });

  if (!parts.length) return;

  try {
    await executeIngestionQuery(
      db,
      `
      insert into ingest_feed_watermarks_v2 (
        outlet_id, source, country, method, last_publication_at, last_fetched_at, updated_at
      ) values ${parts.join(',')}
      on conflict (outlet_id, method) do update set
        source = excluded.source,
        country = excluded.country,
        last_publication_at = case
          when ingest_feed_watermarks_v2.last_publication_at is null then excluded.last_publication_at
          when excluded.last_publication_at is null then ingest_feed_watermarks_v2.last_publication_at
          when excluded.last_publication_at > ingest_feed_watermarks_v2.last_publication_at then excluded.last_publication_at
          else ingest_feed_watermarks_v2.last_publication_at
        end,
        last_fetched_at = excluded.last_fetched_at,
        updated_at = now()
      `,
      values,
      'upsertIngestionFeedWatermarks'
    );
  } catch (error) {
    if (!isRecoverableFeedWatermarkError(error)) throw error;
    console.warn('[ingestion-store] skipping feed watermark writes due to recoverable catalog error:', error instanceof Error ? error.message : String(error));
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function parseNewsSection(value: string | null | undefined): NewsItem['section'] {
  const candidate = (value || 'others').toLowerCase();
  if (candidate === 'security') return 'tech';
  if (candidate === 'general') return 'others';
  return candidate === 'politics'
    || candidate === 'conflicts'
    || candidate === 'business'
    || candidate === 'tech'
    || candidate === 'sports'
    || candidate === 'health'
    || candidate === 'entertainment'
    || candidate === 'lifestyle'
    || candidate === 'arts'
    || candidate === 'science'
    || candidate === 'climate'
    || candidate === 'world'
    || candidate === 'others'
    ? (candidate as NewsItem['section'])
    : 'others';
}

type NewsArticleReadRow = {
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
  section: string | null;
  classification_source: string | null;
  classification_reason: string | null;
  confidence: number | null;
  world_latam: boolean | null;
  tags: unknown;
  feed_categories: string[] | null;
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
  section: string | null;
  classification_source: string | null;
  classification_reason: string | null;
  confidence: number | null;
  world_latam: boolean | null;
  tags: unknown;
  feed_categories: string[] | null;
}): NewsItem {
  const link = decodeHtmlEntities(row.link || '');
  const tierCandidate = Number(row.tier);
  const tier = tierCandidate === 1 || tierCandidate === 2 || tierCandidate === 3 ? tierCandidate : 2;
  const section = parseNewsSection(row.section);
  const sourceTypeCandidate = (row.source_type || 'global').toLowerCase();
  const sourceType: NewsItem['sourceType'] =
    sourceTypeCandidate === 'local' || sourceTypeCandidate === 'portal'
      ? (sourceTypeCandidate as NewsItem['sourceType'])
      : 'global';
  const classificationSource: NewsItem['classificationSource'] = row.classification_source === 'llm' ? 'llm' : 'keyword';
  const tags = Array.isArray(row.tags) ? (row.tags.filter((value) => typeof value === 'string') as string[]) : [];
  const sourceCategories = normalizeSourceCategories(row.feed_categories);
  const title = normalizeArticleTitle(row.title || '', link);
  const normalizedDescription = normalizeHtmlText(row.description || '');
  const description = normalizedDescription ? truncateText(normalizedDescription, apiSnippetMaxChars) : '';
  return {
    id: link,
    outletId: row.outlet_id || undefined,
    title,
    description,
    link,
    source: row.source,
    language: row.language || undefined,
    sourceType,
    tier,
    publishedAt: new Date(row.published_at).toISOString(),
    section,
    confidence: typeof row.confidence === 'number' ? row.confidence : 0.5,
    classificationSource,
    classificationReason: row.classification_reason || undefined,
    country: row.country || undefined,
    worldLatam: Boolean(row.world_latam),
    tags,
    sourceCategories,
    publicationSource: 'feed',
    summarySource: row.description ? 'feed' : undefined
  } satisfies NewsItem;
}

export interface NewsApiItem {
  id: string;
  source: string;
  title: string;
  snippet: string | null;
  url: string;
  country: string | null;
  language: string | null;
  primarySection: string | null;
  sections: string[];
  primaryTopic: string | null;
  topics: string[];
  sourceCategories: string[];
  publicationDatetime: string;
  createdAt: string;
  updatedAt: string;
}

export interface NewsApiReadResult {
  storage: 'postgres' | 'disabled';
  reason?: string;
  generatedAt: string | null;
  totalCount: number;
  items: NewsApiItem[];
}

export interface NewsApiFiltersResult {
  storage: 'postgres' | 'disabled';
  reason?: string;
  filters: {
    countries: string[];
    languages: string[];
    sources: string[];
    sections: string[];
  };
}

export interface NewsApiDashboardHeadline {
  id: string;
  source: string;
  title: string;
  snippet: string | null;
  url: string;
  country: string | null;
  language: string | null;
  primarySection: string | null;
  sections: string[];
  primaryTopic: string | null;
  topics: string[];
  sourceCategories: string[];
  publicationDatetime: string;
  createdAt: string;
  updatedAt: string;
}

export interface NewsApiDashboardTopicGroup {
  section: string;
  articleCount: number;
  topics: Array<{
    topic: string;
    count: number;
  }>;
}

export interface NewsApiDashboardSourceCategoryCount {
  category: string;
  count: number;
}

export interface NewsApiDashboardSummaryResult {
  storage: 'postgres' | 'disabled';
  reason?: string;
  generatedAt: string | null;
  windowDays: number;
  latestHours: number;
  latestDate: string | null;
  previewDate: string | null;
  totals: {
    rowsWindow: number;
    inserted24h: number;
    published24h: number;
    checkedSources24h: number;
  };
  sectionTotals: Record<string, number>;
  recentDates: Array<{ date: string; count: number }>;
  topicSampleSize: number;
  topicGroups: NewsApiDashboardTopicGroup[];
  sourceCategoryCoverage: {
    categorizedArticles: number;
    uncategorizedArticles: number;
    distinctCategories: number;
    topCategories: NewsApiDashboardSourceCategoryCount[];
  };
  preview: {
    articleCount: number;
    topCountries: Array<{ country: string | null; count: number }>;
    headlines: NewsApiDashboardHeadline[];
  };
}

type NewsApiFilterRow = {
  value: string;
};

type NewsApiReadRow = {
  id: string;
  source: string;
  title: string;
  snippet_original: string | null;
  url: string;
  country: string | null;
  language: string | null;
  section: string | null;
  primary_section: string | null;
  sections_normalized: string[] | null;
  feed_categories: string[] | null;
  primary_topic: string | null;
  topics: string[] | null;
  publication_datetime: string;
  created_at: string;
  updated_at: string;
  generated_at: string | null;
  total_count?: string | null;
};

type NewsApiSummaryTotalsRow = {
  rows_window: string;
  inserted_24h: string;
  published_24h: string;
  generated_at: string | null;
};

type NewsApiCheckedSourcesRow = {
  checked_sources_24h: string;
};

type NewsApiSectionTotalRow = {
  section: string | null;
  count: string;
};

type NewsApiDateRow = {
  preview_date: string | null;
  latest_date: string | null;
};

type NewsApiDateCountRow = {
  date: string;
  count: string;
};

type NewsApiCountryCountRow = {
  country: string | null;
  count: string;
};

type NewsApiDashboardTopicCountRow = {
  section: string;
  article_count: string;
  topic: string;
  count: string;
};

type NewsApiDashboardSourceCategoryCoverageRow = {
  categorized_articles: string;
  uncategorized_articles: string;
  distinct_categories: string;
};

type NewsApiDashboardSourceCategoryCountRow = {
  category: string;
  count: string;
};

function parseNewsApiFilterList(values: string[] | undefined): string[] {
  return [
    ...new Set(
      (values || [])
        .flatMap((value) => value.split(','))
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ];
}

export async function readNewsArticlesForApi(options: {
  sourceNames?: string[];
  countries?: string[];
  sections?: string[];
  languages?: string[];
  q?: string | null;
  limit?: number;
  offset?: number;
  hours?: number;
  from?: string | null;
  to?: string | null;
  publicationFrom?: string | null;
  publicationTo?: string | null;
  minCreatedAt?: string | null;
  maxCreatedAt?: string | null;
  minUpdatedAt?: string | null;
  maxUpdatedAt?: string | null;
}): Promise<NewsApiReadResult> {
  const db = getPool();
  if (!db) {
    return { storage: 'disabled', reason: poolDisabledReason, generatedAt: null, totalCount: 0, items: [] };
  }
  await ensureSchema();

  const limit = Math.max(1, Math.min(200, Math.floor(options.limit || 100)));
  const offset = Math.max(0, Math.floor(options.offset || 0));
  const sourceNames = parseNewsApiFilterList(options.sourceNames);
  const countries = parseNewsApiFilterList(options.countries);
  const sections = parseNewsApiFilterList(options.sections);
  const languages = parseNewsApiFilterList(options.languages);
  const query = (options.q || '').trim().slice(0, 120);
  const params: unknown[] = [];
  const whereClauses: string[] = [];
  const normalizedSections = [...new Set(sections.map((section) => normalizeStoredSectionValue(section)))];

  params.push(newsApiMaxFutureMinutes);
  whereClauses.push(`and e.publication_datetime <= now() + ($${params.length}::int * interval '1 minute')`);
  whereClauses.push(`and ${buildCustomerVisibleTitleQualitySql('e.title_quality')}`);

  if (sourceNames.length > 0) {
    params.push(sourceNames);
    whereClauses.push(`and e.source = any($${params.length}::text[])`);
  }

  if (countries.length > 0) {
    params.push(countries);
    whereClauses.push(`and e.country = any($${params.length}::text[])`);
  }

  if (languages.length > 0) {
    params.push(languages);
    whereClauses.push(`and e.language = any($${params.length}::text[])`);
  }

  if (normalizedSections.length > 0) {
    params.push(normalizedSections);
    whereClauses.push(`
      and (
        coalesce(e.sections_normalized, '{}'::text[]) && $${params.length}::text[]
        or (
          coalesce(cardinality(e.sections_normalized), 0) = 0
          and coalesce(nullif(trim(e.section), ''), 'others') = any($${params.length}::text[])
        )
      )
    `);
  }

  if (query) {
    params.push(`%${query}%`);
    whereClauses.push(
      `and (
        e.title_original ilike $${params.length}
        or e.source ilike $${params.length}
        or coalesce(e.country, '') ilike $${params.length}
        or coalesce(array_to_string(e.feed_categories, ' '), '') ilike $${params.length}
      )`
    );
  }

  const publicationFrom = options.publicationFrom || options.from || null;
  const publicationTo = options.publicationTo || options.to || null;
  const minCreatedAt = options.minCreatedAt || null;
  const maxCreatedAt = options.maxCreatedAt || null;
  const minUpdatedAt = options.minUpdatedAt || null;
  const maxUpdatedAt = options.maxUpdatedAt || null;

  if (publicationFrom) {
    params.push(publicationFrom);
    whereClauses.push(`and e.publication_datetime >= $${params.length}`);
  }

  if (publicationTo) {
    params.push(publicationTo);
    whereClauses.push(`and e.publication_datetime <= $${params.length}`);
  }

  if (minCreatedAt) {
    params.push(minCreatedAt);
    whereClauses.push(`and e.created_at >= $${params.length}`);
  }

  if (maxCreatedAt) {
    params.push(maxCreatedAt);
    whereClauses.push(`and e.created_at <= $${params.length}`);
  }

  if (minUpdatedAt) {
    params.push(minUpdatedAt);
    whereClauses.push(`and e.updated_at >= $${params.length}`);
  }

  if (maxUpdatedAt) {
    params.push(maxUpdatedAt);
    whereClauses.push(`and e.updated_at <= $${params.length}`);
  }

  if (!publicationFrom && !publicationTo && !minCreatedAt && !maxCreatedAt && !minUpdatedAt && !maxUpdatedAt) {
    const hours = Math.max(1, Math.min(720, Math.floor(options.hours || 48)));
    params.push(hours);
    whereClauses.push(`and e.publication_datetime > now() - ($${params.length}::int * interval '1 hour')`);
  }

  const whereSql = `
    where 1 = 1
    ${whereClauses.join('\n    ')}`;

  params.push(limit);
  const limitIndex = params.length;
  params.push(offset);
  const offsetIndex = params.length;

  const result = await db.query<NewsApiReadRow>(
    `
    with filtered as (
      select
        e.external_id as id,
        e.source,
        e.title_original as title,
        e.snippet_original,
        e.url,
        e.country,
        e.language,
        e.section,
        e.primary_section,
        e.sections_normalized,
        e.feed_categories,
        e.primary_topic,
        e.topics,
        e.publication_datetime,
        e.created_at,
        e.updated_at
      from news_articles e
      ${whereSql}
    )
    select
      filtered.*,
      max(filtered.created_at) over() as generated_at,
      count(*) over()::text as total_count
    from filtered
    order by filtered.publication_datetime desc, filtered.created_at desc
    limit $${limitIndex} offset $${offsetIndex}
    `,
    params
  );

  const items = result.rows.map((row) => mapRowToNewsApiItem(row));
  const totalCount = result.rows[0]?.total_count ? Number(result.rows[0].total_count) : 0;

  return {
    storage: 'postgres',
    totalCount,
    generatedAt: result.rows[0]?.generated_at ? new Date(result.rows[0].generated_at).toISOString() : null,
    items
  };
}

function mapRowToNewsApiItem(row: NewsApiReadRow): NewsApiItem {
  const url = decodeHtmlEntities(row.url);
  const title = normalizeArticleTitle(row.title || '', url);
  const snippetText = row.snippet_original ? normalizeHtmlText(row.snippet_original) : '';
  const snippet = snippetText ? truncateText(snippetText, apiSnippetMaxChars) : null;
  const taxonomy = buildArticleTaxonomy({
    storedSection: row.section,
    sourceCategories: row.feed_categories,
    source: row.source,
    url,
    title,
    snippet,
  });
  const storedTopics = normalizeSourceCategories(row.topics);
  const storedSections = normalizeSourceCategories(row.sections_normalized) as NewsSection[];
  const resolvedPrimarySection = normalizeStoredSectionValue(row.primary_section) !== 'others'
    ? normalizeStoredSectionValue(row.primary_section)
    : taxonomy.primarySection;
  const resolvedSections = storedSections.length > 0
    ? storedSections.map((section) => normalizeStoredSectionValue(section))
    : taxonomy.sections;
  const resolvedTopics = storedTopics.length > 0 ? storedTopics : taxonomy.topics;
  const storedPrimaryTopic = (row.primary_topic || '').trim() || null;

  return {
    id: row.id,
    source: row.source,
    title,
    snippet,
    url,
    country: row.country,
    language: row.language,
    primarySection: resolvedPrimarySection,
    sections: resolvedSections,
    primaryTopic: storedPrimaryTopic || resolvedTopics[0] || taxonomy.primaryTopic,
    topics: resolvedTopics,
    sourceCategories: taxonomy.sourceCategories,
    publicationDatetime: row.publication_datetime,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapRowToDisplayNewsApiItem(row: NewsApiReadRow): NewsApiItem | null {
  const title = normalizeReadableArticleTitle(row.title || '', row.url, row.source || '');
  if (!title || looksLikeLowSignalArticleTitle(title, row.source || '', row.url || '')) {
    return null;
  }

  return {
    ...mapRowToNewsApiItem(row),
    title,
  };
}

async function readDashboardTopicGroupsForWindow(
  db: Pool,
  windowDays: number,
  maxFutureMinutes: number,
  displayLimit: number
): Promise<NewsApiDashboardTopicGroup[]> {
  const minTopicCount = 10;
  const result = await db.query<NewsApiDashboardTopicCountRow>(
    `
    with windowed as (
      select
        coalesce(nullif(trim(primary_section), ''), nullif(trim(section), ''), 'others') as section,
        coalesce(topics, '{}'::text[]) as topics
      from news_articles
      where publication_datetime >= now() - ($1::int * interval '1 day')
        and publication_datetime <= now() + ($2::int * interval '1 minute')
        and ${CUSTOMER_VISIBLE_TITLE_QUALITY_SQL}
    ),
    section_counts as (
      select
        section,
        count(*)::text as article_count
      from windowed
      where section <> 'others'
      group by 1
    ),
    expanded_topics as (
      select
        section,
        unnest(topics) as topic
      from windowed
      where section <> 'others'
        and cardinality(topics) > 0
    ),
    topic_counts as (
      select
        section,
        topic,
        count(*)::text as count
      from expanded_topics
      group by 1, 2
      having count(*) >= $4
    ),
    ranked as (
      select
        topic_counts.section,
        section_counts.article_count,
        topic_counts.topic,
        topic_counts.count,
        row_number() over (
          partition by topic_counts.section
          order by topic_counts.count::bigint desc, topic_counts.topic asc
        ) as rn
      from topic_counts
      join section_counts using (section)
    )
    select
      section,
      article_count,
      topic,
      count
    from ranked
    where rn <= $3
    `,
    [windowDays, maxFutureMinutes, displayLimit, minTopicCount]
  );

  const groupsBySection = new Map<string, NewsApiDashboardTopicGroup>();
  for (const row of result.rows) {
    const section = normalizeStoredSectionValue(row.section);
    if (section === 'others') continue;
    const current = groupsBySection.get(section) || {
      section,
      articleCount: Number(row.article_count) || 0,
      topics: [],
    };
    current.topics.push({
      topic: row.topic,
      count: Number(row.count) || 0,
    });
    groupsBySection.set(section, current);
  }

  return NEWS_SECTION_ORDER
    .filter((section) => section !== 'others')
    .map((section) => groupsBySection.get(section))
    .filter((group): group is NewsApiDashboardTopicGroup => Boolean(group));
}

async function readDashboardSourceCategoryCoverageForWindow(
  db: Pool,
  windowDays: number,
  maxFutureMinutes: number,
  displayLimit: number
): Promise<NewsApiDashboardSummaryResult['sourceCategoryCoverage']> {
  const [coverageResult, topCategoriesResult] = await Promise.all([
    db.query<NewsApiDashboardSourceCategoryCoverageRow>(
      `
      with windowed as (
        select coalesce(feed_categories, '{}'::text[]) as feed_categories
        from news_articles
        where publication_datetime >= now() - ($1::int * interval '1 day')
          and publication_datetime <= now() + ($2::int * interval '1 minute')
          and ${CUSTOMER_VISIBLE_TITLE_QUALITY_SQL}
      ),
      expanded as (
        select unnest(feed_categories) as category
        from windowed
        where cardinality(feed_categories) > 0
      )
      select
        (select count(*)::text from windowed where cardinality(feed_categories) > 0) as categorized_articles,
        (select count(*)::text from windowed where cardinality(feed_categories) = 0) as uncategorized_articles,
        (select count(distinct category)::text from expanded) as distinct_categories
      `,
      [windowDays, maxFutureMinutes]
    ),
    db.query<NewsApiDashboardSourceCategoryCountRow>(
      `
      with windowed as (
        select unnest(feed_categories) as category
        from news_articles
        where publication_datetime >= now() - ($1::int * interval '1 day')
          and publication_datetime <= now() + ($2::int * interval '1 minute')
          and cardinality(feed_categories) > 0
          and ${CUSTOMER_VISIBLE_TITLE_QUALITY_SQL}
      )
      select
        category,
        count(*)::text as count
      from windowed
      group by 1
      order by count(*) desc, category asc
      limit $3
      `,
      [windowDays, maxFutureMinutes, displayLimit]
    ),
  ]);

  return {
    categorizedArticles: Number(coverageResult.rows[0]?.categorized_articles || 0),
    uncategorizedArticles: Number(coverageResult.rows[0]?.uncategorized_articles || 0),
    distinctCategories: Number(coverageResult.rows[0]?.distinct_categories || 0),
    topCategories: topCategoriesResult.rows.map((row) => ({
      category: row.category,
      count: Number(row.count) || 0,
    })),
  };
}

function buildDashboardSummaryCacheKey(options?: {
  windowDays?: number;
  latestHours?: number;
  previewLimit?: number;
  topCountriesLimit?: number;
  maxFutureHours?: number;
}): string {
  return JSON.stringify({
    windowDays: options?.windowDays || 31,
    latestHours: options?.latestHours || 24,
    previewLimit: options?.previewLimit || 8,
    topCountriesLimit: options?.topCountriesLimit || 6,
    maxFutureHours: options?.maxFutureHours ?? null,
  });
}

export async function readNewsDashboardSummary(options?: {
  windowDays?: number;
  latestHours?: number;
  previewLimit?: number;
  topCountriesLimit?: number;
  maxFutureHours?: number;
}): Promise<NewsApiDashboardSummaryResult> {
  const cacheKey = buildDashboardSummaryCacheKey(options);
  const cached = dashboardSummaryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const db = getPool();
  if (!db) {
    return {
      storage: 'disabled',
      reason: poolDisabledReason,
      generatedAt: null,
      windowDays: options?.windowDays || 31,
      latestHours: options?.latestHours || 24,
      latestDate: null,
      previewDate: null,
      totals: {
        rowsWindow: 0,
        inserted24h: 0,
        published24h: 0,
        checkedSources24h: 0,
      },
      sectionTotals: {},
      recentDates: [],
      topicSampleSize: 0,
      topicGroups: [],
      sourceCategoryCoverage: {
        categorizedArticles: 0,
        uncategorizedArticles: 0,
        distinctCategories: 0,
        topCategories: [],
      },
      preview: {
        articleCount: 0,
        topCountries: [],
        headlines: [],
      },
    };
  }

  await ensureSchema();

  const windowDays = Math.max(1, Math.min(90, Math.floor(options?.windowDays || 31)));
  const latestHours = Math.max(1, Math.min(720, Math.floor(options?.latestHours || 24)));
  const previewLimit = Math.max(1, Math.min(20, Math.floor(options?.previewLimit || 8)));
  const topCountriesLimit = Math.max(1, Math.min(20, Math.floor(options?.topCountriesLimit || 6)));
  const maxFutureMinutes = options?.maxFutureHours == null
    ? newsApiMaxFutureMinutes
    : Math.max(0, Math.min(168 * 60, Math.floor(options.maxFutureHours * 60)));

  const [totalsResult, checkedSourcesResult, sectionTotalsResult, dateResult, recentDatesResult, topicGroupRows, sourceCategoryCoverage] = await Promise.all([
    db.query<NewsApiSummaryTotalsRow>(
      `
      select
        count(*)::text as rows_window,
        count(*) filter (where created_at >= now() - ($2::int * interval '1 hour'))::text as inserted_24h,
        count(*) filter (where publication_datetime >= now() - ($2::int * interval '1 hour'))::text as published_24h,
        max(created_at)::text as generated_at
      from news_articles
      where publication_datetime >= now() - ($1::int * interval '1 day')
        and publication_datetime <= now() + ($3::int * interval '1 minute')
        and ${CUSTOMER_VISIBLE_TITLE_QUALITY_SQL}
      `,
      [windowDays, latestHours, maxFutureMinutes]
    ),
    db.query<NewsApiCheckedSourcesRow>(
      `
      select
        count(distinct coalesce(country, 'Global') || '|' || source)::text as checked_sources_24h
      from rss_health_status
      where ran_at >= now() - ($1::int * interval '1 hour')
        and runner = 'worker'
        and attempted
      `,
      [latestHours]
    ),
    db.query<NewsApiSectionTotalRow>(
      `
      select
        coalesce(nullif(trim(primary_section), ''), nullif(trim(section), ''), 'others') as section,
        count(*)::text as count
      from news_articles
      where publication_datetime >= now() - ($1::int * interval '1 day')
        and publication_datetime <= now() + ($2::int * interval '1 minute')
        and ${CUSTOMER_VISIBLE_TITLE_QUALITY_SQL}
      group by 1
      `,
      [windowDays, maxFutureMinutes]
    ),
    db.query<NewsApiDateRow>(
      `
      with windowed as (
        select
          case
            when publication_datetime > now() + ($2::int * interval '1 minute') then created_at
            else publication_datetime
          end as normalized_publication_datetime
        from news_articles
        where publication_datetime >= now() - ($1::int * interval '1 day')
          and publication_datetime <= now() + ($2::int * interval '1 minute')
          and ${CUSTOMER_VISIBLE_TITLE_QUALITY_SQL}
      ),
      dates as (
        select distinct (normalized_publication_datetime at time zone 'UTC')::date as date
        from windowed
      )
      select
        max(date)::text as latest_date,
        coalesce(
          max(date) filter (where date <= (now() at time zone 'UTC')::date),
          max(date)
        )::text as preview_date
      from dates
      `,
      [windowDays, maxFutureMinutes]
    ),
    db.query<NewsApiDateCountRow>(
      `
      with windowed as (
        select
          case
            when publication_datetime > now() + ($2::int * interval '1 minute') then created_at
            else publication_datetime
          end as normalized_publication_datetime
        from news_articles
        where publication_datetime >= now() - ($1::int * interval '1 day')
          and publication_datetime <= now() + ($2::int * interval '1 minute')
          and ${CUSTOMER_VISIBLE_TITLE_QUALITY_SQL}
      )
      select
        (normalized_publication_datetime at time zone 'UTC')::date::text as date,
        count(*)::text as count
      from windowed
      group by 1
      order by 1 desc
      limit 7
      `,
      [windowDays, maxFutureMinutes]
    ),
    readDashboardTopicGroupsForWindow(db, windowDays, maxFutureMinutes, dashboardTopicDisplayLimit),
    readDashboardSourceCategoryCoverageForWindow(
      db,
      windowDays,
      maxFutureMinutes,
      dashboardSourceCategoryDisplayLimit
    ),
  ]);

  const dateRow = dateResult.rows[0];
  const previewDate = dateRow?.preview_date || null;
  const latestDate = dateRow?.latest_date || null;

  let previewArticleCount = 0;
  let previewTopCountries: Array<{ country: string | null; count: number }> = [];
  let previewHeadlines: NewsApiDashboardHeadline[] = [];
  const topicSampleSize = Number(totalsResult.rows[0]?.rows_window || 0);
  const topicGroups = topicGroupRows;

  if (previewDate) {
    const [countryCountsResult, headlinesResult] = await Promise.all([
      db.query<NewsApiCountryCountRow>(
        `
        with windowed as (
          select
            coalesce(country, 'Global') as country,
            case
              when publication_datetime > now() + ($2::int * interval '1 minute') then created_at
              else publication_datetime
            end as normalized_publication_datetime
          from news_articles
          where publication_datetime >= now() - ($1::int * interval '1 day')
            and publication_datetime <= now() + ($2::int * interval '1 minute')
            and ${CUSTOMER_VISIBLE_TITLE_QUALITY_SQL}
        )
        select
          country,
          count(*)::text as count
        from windowed
        where (normalized_publication_datetime at time zone 'UTC')::date = $3::date
        group by 1
        order by count(*) desc, country asc
        limit $4
        `,
        [windowDays, maxFutureMinutes, previewDate, topCountriesLimit]
      ),
      db.query<NewsApiReadRow>(
        `
        with windowed as (
          select
            external_id as id,
            source,
            title_original as title,
            null::text as snippet_original,
            url,
            country,
            language,
            coalesce(section, 'others') as section,
            primary_section,
            sections_normalized,
            feed_categories,
            primary_topic,
            topics,
            publication_datetime,
            created_at,
            updated_at,
            max(created_at) over() as generated_at,
            case
              when publication_datetime > now() + ($2::int * interval '1 minute') then created_at
              else publication_datetime
            end as normalized_publication_datetime
          from news_articles
          where publication_datetime >= now() - ($1::int * interval '1 day')
            and publication_datetime <= now() + ($2::int * interval '1 minute')
            and ${CUSTOMER_VISIBLE_TITLE_QUALITY_SQL}
        )
        select
          id,
          source,
          title,
          snippet_original,
          url,
          country,
          language,
          section,
          primary_section,
          sections_normalized,
          feed_categories,
          primary_topic,
          topics,
          publication_datetime,
          created_at,
          updated_at,
          generated_at
        from windowed
        where (normalized_publication_datetime at time zone 'UTC')::date = $3::date
        order by normalized_publication_datetime desc, created_at desc
        limit $4
        `,
        [windowDays, maxFutureMinutes, previewDate, previewLimit]
      ),
    ]);

    previewTopCountries = countryCountsResult.rows.map((row) => ({
      country: row.country,
      count: Number(row.count) || 0,
    }));

    const countResult = await db.query<{ count: string }>(
      `
      with windowed as (
        select
          case
            when publication_datetime > now() + ($2::int * interval '1 minute') then created_at
            else publication_datetime
          end as normalized_publication_datetime
          from news_articles
          where publication_datetime >= now() - ($1::int * interval '1 day')
            and publication_datetime <= now() + ($2::int * interval '1 minute')
            and ${CUSTOMER_VISIBLE_TITLE_QUALITY_SQL}
        )
      select count(*)::text as count
      from windowed
      where (normalized_publication_datetime at time zone 'UTC')::date = $3::date
      `,
      [windowDays, maxFutureMinutes, previewDate]
    );
    previewArticleCount = Number(countResult.rows[0]?.count || 0);

    previewHeadlines = headlinesResult.rows
      .map((row) => mapRowToDisplayNewsApiItem(row))
      .filter((row): row is NewsApiDashboardHeadline => row !== null);
  }

  const summary: NewsApiDashboardSummaryResult = {
    storage: 'postgres',
    generatedAt: totalsResult.rows[0]?.generated_at ? new Date(totalsResult.rows[0].generated_at).toISOString() : null,
    windowDays,
    latestHours,
    latestDate,
    previewDate,
    totals: {
      rowsWindow: Number(totalsResult.rows[0]?.rows_window || 0),
      inserted24h: Number(totalsResult.rows[0]?.inserted_24h || 0),
      published24h: Number(totalsResult.rows[0]?.published_24h || 0),
      checkedSources24h: Number(checkedSourcesResult.rows[0]?.checked_sources_24h || 0),
    },
    sectionTotals: Object.fromEntries(
      sectionTotalsResult.rows.reduce<Array<[NewsSection, number]>>((acc, row) => {
        const section = normalizeStoredSectionValue(row.section);
        const count = Number(row.count) || 0;
        const existing = acc.find(([key]) => key === section);
        if (existing) {
          existing[1] += count;
        } else {
          acc.push([section, count]);
        }
        return acc;
      }, [])
    ),
    recentDates: recentDatesResult.rows.map((row) => ({
      date: row.date,
      count: Number(row.count) || 0,
    })),
    topicSampleSize,
    topicGroups,
    sourceCategoryCoverage,
    preview: {
      articleCount: previewArticleCount,
      topCountries: previewTopCountries,
      headlines: previewHeadlines,
    },
  };

  if (dashboardSummaryCacheMs > 0) {
    dashboardSummaryCache.set(cacheKey, {
      expiresAt: Date.now() + dashboardSummaryCacheMs,
      value: summary,
    });
  }

  return summary;
}

export async function readNewsApiFilters(): Promise<NewsApiFiltersResult> {
  const db = getPool();
  if (!db) {
    return {
      storage: 'disabled',
      reason: poolDisabledReason,
      filters: {
        countries: [],
        languages: [],
        sources: [],
        sections: []
      }
    };
  }

  await ensureSchema();

  const [countriesResult, languagesResult, sourcesResult, sectionsResult] = await Promise.all([
    db.query<NewsApiFilterRow>(
      `select value
       from (
         select distinct trim(country) as value, lower(trim(country)) as sort_key
         from news_articles
         where country is not null and trim(country) <> ''
           and ${CUSTOMER_VISIBLE_TITLE_QUALITY_SQL}
       ) t
       order by t.sort_key`
    ),
    db.query<NewsApiFilterRow>(
      `select value
       from (
         select distinct trim(language) as value, lower(trim(language)) as sort_key
         from news_articles
         where language is not null and trim(language) <> ''
           and ${CUSTOMER_VISIBLE_TITLE_QUALITY_SQL}
       ) t
       order by t.sort_key`
    ),
    db.query<NewsApiFilterRow>(
      `select value
       from (
         select distinct trim(source) as value, lower(trim(source)) as sort_key
         from news_articles
         where source is not null and trim(source) <> ''
           and ${CUSTOMER_VISIBLE_TITLE_QUALITY_SQL}
       ) t
       order by t.sort_key`
    ),
    db.query<NewsApiFilterRow>(
      `select value
       from (
         select distinct trim(section) as value, lower(trim(section)) as sort_key
         from news_articles
         where section is not null and trim(section) <> ''
           and ${CUSTOMER_VISIBLE_TITLE_QUALITY_SQL}
       ) t
       order by t.sort_key`
    )
  ]);

  return {
    storage: 'postgres',
    filters: {
      countries: countriesResult.rows.map((row) => row.value),
      languages: languagesResult.rows.map((row) => row.value),
      sources: sourcesResult.rows.map((row) => row.value),
      sections: [...VALID_NEWS_SECTION_LIST]
    }
  };
}

export async function readNewsArticles(options: {
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
    outletColumn: 'e.source',
    sourceColumn: 'e.source'
  });

  const result = await db.query<NewsArticleReadRow>(
    `
    select
      e.url as link,
      null::text as outlet_id,
      e.title_original as title,
      e.snippet_original as description,
      e.source,
      e.publication_datetime as published_at,
      e.country,
      e.language,
      null::text as source_type,
      null::int as tier,
      coalesce(e.section, 'others') as section,
      null::text as classification_source,
      null::text as classification_reason,
      null::real as confidence,
      false::boolean as world_latam,
      '[]'::jsonb as tags,
      e.feed_categories,
      max(e.created_at) over() as generated_at
    from news_articles e
    where e.created_at > now() - ($1::text || ' hours')::interval
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
    newsArticles24h: number;
  };
  topSources24h: IngestionOpsSourceRow[];
}

export interface IngestionEndpointRun {
  outletId: string;
  source: string;
  country: string;
  method: 'rss' | 'sitemap';
  runner?: 'worker' | 'api_news' | 'warm';
  attempted: boolean;
  circuitOpen: boolean;
  ok: boolean;
  statusCode: number | null;
  parsedCount: number;
  fetchedCount: number;
  parsedLimit?: number;
  sampleCapped?: boolean;
  recent24h: number;
  missingTitleCount: number;
  missingSummaryCount: number;
  missingPublishedAtCount: number;
  missingLinkCount: number;
  requestedUrl?: string | null;
  finalUrl?: string | null;
  contentType?: string | null;
  responseMs?: number | null;
  sniffedType?: string | null;
  parsedOk?: boolean | null;
  failureStage?: string | null;
  healthClassification?: string | null;
  newestItemPublishedAt?: string | null;
  error?: string;
}

export type SitemapPolicyStatus = 'active' | 'disabled_temporary' | 'disabled_permanent';

export interface SitemapPolicyState {
  outletId: string;
  source: string;
  country: string;
  status: SitemapPolicyStatus;
  reason: string | null;
  lastFailureReason: string | null;
  consecutiveFailures: number;
  disabledUntil: string | null;
  lastAttemptedAt: string | null;
  disabledSince: string | null;
  lastSuccessAt: string | null;
  lastCheckedAt: string | null;
}

type ReadSitemapPolicyInput = {
  outletId: string;
  source: string;
  country: string;
};

function normalizeSitemapPolicyCountry(country: string): string {
  return (country || 'Global').trim() || 'Global';
}

function normalizeSitemapPolicyStatus(value: string): SitemapPolicyStatus {
  if (value === 'disabled_temporary' || value === 'disabled_permanent' || value === 'active') {
    return value;
  }
  return 'active';
}

function mapSitemapPolicyRow(row: SitemapPolicyDbRow): SitemapPolicyState {
  return {
    outletId: row.outlet_id,
    source: row.source || 'unknown_source',
    country: normalizeSitemapPolicyCountry(row.country),
    status: normalizeSitemapPolicyStatus(row.status),
    reason: row.reason,
    lastFailureReason: row.last_failure_reason,
    consecutiveFailures: Number.isFinite(row.consecutive_failures) ? row.consecutive_failures : 0,
    disabledUntil: row.disabled_until,
    lastAttemptedAt: row.last_attempted_at,
    disabledSince: row.disabled_since,
    lastSuccessAt: row.last_success_at,
    lastCheckedAt: row.last_checked_at
  };
}

export async function readSitemapPolicyStates(rows: ReadSitemapPolicyInput[]): Promise<Map<string, SitemapPolicyState>> {
  const db = getPool();
  if (!db) return new Map();
  if (!rows.length) return new Map();
  await ensureSchema();

  const deduped = new Map<string, ReadSitemapPolicyInput>();
  for (const row of rows) {
    if (!row.outletId) continue;
    deduped.set(row.outletId, {
      outletId: row.outletId,
      source: row.source,
      country: normalizeSitemapPolicyCountry(row.country)
    });
  }

  const requested = [...deduped.values()];
  if (!requested.length) return new Map();

  const stateByOutlet = new Map<string, SitemapPolicyState>();
  for (const request of requested) {
    stateByOutlet.set(request.outletId, {
      outletId: request.outletId,
      source: request.source,
      country: request.country,
      status: 'active',
      reason: null,
      lastFailureReason: null,
      consecutiveFailures: 0,
      disabledUntil: null,
      lastAttemptedAt: null,
      disabledSince: null,
      lastSuccessAt: null,
      lastCheckedAt: null
    });
  }

  const values: string[] = [];
  const placeholders = requested
    .map((request, index) => {
      const base = index * 3;
      values.push(request.outletId, request.source, normalizeSitemapPolicyCountry(request.country));
      return `($${base + 1}, $${base + 2}, $${base + 3})`;
    })
    .join(', ');

  try {
    const result = await db.query<SitemapPolicyDbRow>(
      `
      with requested(outlet_id, source, country) as (
        values ${placeholders}
      )
      select
        requested.outlet_id,
        coalesce(p.source, requested.source) as source,
        coalesce(p.country, requested.country) as country,
        coalesce(p.status, 'active') as status,
        p.reason,
        p.last_failure_reason,
        coalesce(p.consecutive_failures, 0) as consecutive_failures,
        p.disabled_until,
        p.last_attempted_at,
        p.disabled_since,
        p.last_success_at,
        p.last_checked_at
      from requested
      left join ingest_sitemap_policy_v2 p on p.outlet_id = requested.outlet_id
      `,
      values
    );

    for (const row of result.rows) {
      stateByOutlet.set(row.outlet_id, mapSitemapPolicyRow(row));
    }
  } catch (error) {
    if (!isRecoverableSitemapPolicyError(error)) throw error;
    console.warn('[ingestion-store] skipping sitemap policy reads due to recoverable catalog error:', error instanceof Error ? error.message : String(error));
  }
  return stateByOutlet;
}

export async function upsertSitemapPolicyStates(rows: SitemapPolicyUpsertRow[]): Promise<void> {
  const db = getPool();
  if (!db || !rows.length) return;
  await ensureSchema();

  const deduped = new Map<string, SitemapPolicyUpsertRow>();
  for (const row of rows) {
    if (!row.outletId) continue;
    deduped.set(row.outletId, {
      ...row,
      country: normalizeSitemapPolicyCountry(row.country),
      source: row.source,
    });
  }
  const dedupedRows = [...deduped.values()];
  if (!dedupedRows.length) return;

  const groups = chunk(dedupedRows, 250);
  for (const group of groups) {
    const values: unknown[] = [];
    const parts: string[] = [];
    group.forEach((row, index) => {
      const base = index * 11;
      parts.push(`
        ($${base + 1}::text, $${base + 2}::text, $${base + 3}::text, $${base + 4}::text, $${base + 5}::text, $${base + 6}::int,
         $${base + 7}::timestamptz, $${base + 8}::timestamptz, $${base + 9}::timestamptz, $${base + 10}::timestamptz, $${base + 11}::text, now())
      `);
      values.push(
        row.outletId,
        row.source,
        row.country,
        row.status,
        row.reason,
        row.consecutiveFailures,
        row.lastAttemptedAt,
        row.disabledUntil,
        row.disabledSince,
        row.lastSuccessAt
      );
      values.push(row.lastFailureReason);
    });

    try {
      await executeIngestionQuery(
        db,
        `
        insert into ingest_sitemap_policy_v2 (
          outlet_id, source, country, status, reason, consecutive_failures,
          last_attempted_at, disabled_until, disabled_since, last_success_at, last_failure_reason, last_checked_at
        ) values ${parts.join(',')}
        on conflict (outlet_id) do update set
          source = excluded.source,
          country = excluded.country,
          status = excluded.status,
          reason = excluded.reason,
          last_failure_reason = excluded.last_failure_reason,
          consecutive_failures = excluded.consecutive_failures,
          disabled_until = excluded.disabled_until,
          last_attempted_at = excluded.last_attempted_at,
          disabled_since = excluded.disabled_since,
          last_success_at = excluded.last_success_at,
          last_checked_at = now(),
          updated_at = now()
        `,
        values,
        'upsertSitemapPolicyStates'
      );
    } catch (error) {
      if (!isRecoverableSitemapPolicyError(error)) throw error;
      console.warn('[ingestion-store] skipping sitemap policy writes due to recoverable catalog error:', error instanceof Error ? error.message : String(error));
    }
  }
}

type SitemapPolicyDbRow = {
  outlet_id: string;
  source: string;
  country: string;
  status: SitemapPolicyStatus;
  reason: string | null;
  last_failure_reason: string | null;
  consecutive_failures: number;
  disabled_until: string | null;
  last_attempted_at: string | null;
  disabled_since: string | null;
  last_success_at: string | null;
  last_checked_at: string | null;
};

type SitemapPolicyUpsertRow = {
  outletId: string;
  source: string;
  country: string;
  status: SitemapPolicyStatus;
  reason: string | null;
  lastFailureReason: string | null;
  consecutiveFailures: number;
  disabledUntil: string | null;
  lastAttemptedAt: string | null;
  disabledSince: string | null;
  lastSuccessAt: string | null;
};

type IngestOpsReadBaseOptions = {
  runner?: 'worker' | 'api_news' | 'warm';
  outletIds?: string[];
  sourceNames?: string[];
  countries?: string[];
  method?: 'rss' | 'sitemap';
  limit?: number;
};

type IngestionDataRetentionOptions = {
  newsArticlesRetentionDays?: number;
  dryRun?: boolean;
};

export type IngestionDataRetentionResult = {
  storage: 'postgres' | 'disabled';
  reason?: string;
  dryRun: boolean;
  deleted: {
    newsArticles: number;
  };
};

function parseRetentionDays(value: number | undefined, envKey: string, fallback: number): number {
  const parsed = value ?? Number.parseInt(process.env[envKey] || '', 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed < 0 ? 0 : parsed;
}

const retentionTargetMap = {
  news_articles: 'created_at'
} as const satisfies Record<string, string>;

type RetentionTable = keyof typeof retentionTargetMap;

function ensureValidRetentionTarget(
  table: string,
  dateColumn: string
): { table: RetentionTable; dateColumn: (typeof retentionTargetMap)[RetentionTable] } {
  if (!(table in retentionTargetMap)) {
    throw new Error(`Unsupported retention table: ${table}`);
  }

  const typedTable = table as RetentionTable;
  const expectedDateColumn = retentionTargetMap[typedTable];
  if (expectedDateColumn !== dateColumn) {
    throw new Error(`Unexpected retention date column for table ${table}: ${dateColumn}`);
  }

  return { table: typedTable, dateColumn: expectedDateColumn };
}

async function countRowsForRetention(db: Pool, table: string, dateColumn: string, retentionDays: number): Promise<number> {
  if (retentionDays <= 0) return 0;
  const target = ensureValidRetentionTarget(table, dateColumn);
  const result = await db.query<{ count: string }>(
    `select count(*)::text as count from ${target.table} where ${target.dateColumn} < now() - ($1::text || ' days')::interval`,
    [String(retentionDays)]
  );
  return Number(result.rows[0]?.count || 0);
}

async function pruneRowsForRetention(db: Pool, table: string, dateColumn: string, retentionDays: number): Promise<number> {
  if (retentionDays <= 0) return 0;
  const target = ensureValidRetentionTarget(table, dateColumn);
  const result = await db.query(
    `delete from ${target.table} where ${target.dateColumn} < now() - ($1::text || ' days')::interval`,
    [String(retentionDays)]
  );
  return result.rowCount || 0;
}

export interface IngestOpsHourlyRow {
  bucket: string;
  runner: 'worker' | 'api_news' | 'warm';
  outletId: string;
  source: string;
  country: string;
  method: 'rss' | 'sitemap';
  attemptedRuns: number;
  successfulRuns: number;
  failedRuns: number;
  fetchedCount: number;
  validCount: number;
  missingTitleCount: number;
  missingSummaryCount: number;
  missingPublishedAtCount: number;
  missingLinkCount: number;
}

export interface IngestOpsDailyRow {
  bucket: string;
  runner: 'worker' | 'api_news' | 'warm';
  outletId: string;
  source: string;
  country: string;
  method: 'rss' | 'sitemap';
  attemptedRuns: number;
  successfulRuns: number;
  failedRuns: number;
  fetchedCount: number;
  validCount: number;
  missingTitleCount: number;
  missingSummaryCount: number;
  missingPublishedAtCount: number;
  missingLinkCount: number;
}

export interface IngestFailureReasonRow {
  reason: string;
  count: number;
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
      from rss_health_status
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

export async function readIngestOpsHourly(options: IngestOpsReadBaseOptions & {
  hours?: number;
  from?: string | Date;
  to?: string | Date;
} = {}): Promise<{ storage: 'postgres' | 'disabled'; reason?: string; rows: IngestOpsHourlyRow[] }> {
  const db = getPool();
  if (!db) return { storage: 'disabled', reason: poolDisabledReason, rows: [] };
  await ensureSchema();

  const hours = Math.max(1, Math.min(24 * 30, Math.floor(options.hours || 24)));
  const runner = options.runner;
  const method = options.method;
  const outletIds = (options.outletIds || []).filter(Boolean);
  const sourceNames = (options.sourceNames || []).filter(Boolean);
  const countries = (options.countries || []).filter(Boolean);
  const from = options.from ? new Date(options.from) : null;
  const to = options.to ? new Date(options.to) : null;
  const limit = Math.max(1, Math.min(1000000, Math.floor(options.limit || 1000)));

  const params: unknown[] = [];
  const whereParts: string[] = [];

  if (runner) {
    params.push(runner);
    whereParts.push(`and runner = $${params.length}`);
  }
  if (method) {
    params.push(method);
    whereParts.push(`and method = $${params.length}`);
  }
  if (from && Number.isFinite(from.getTime())) {
    params.push(from.toISOString());
    whereParts.push(`and hour_bucket >= $${params.length}::timestamptz`);
  } else {
    params.push(String(hours));
    whereParts.push(`and hour_bucket > now() - ($${params.length}::text || ' hours')::interval`);
  }
  if (to && Number.isFinite(to.getTime())) {
    params.push(to.toISOString());
    whereParts.push(`and hour_bucket <= $${params.length}::timestamptz`);
  }
  if (countries.length > 0) {
    params.push(countries);
    whereParts.push(`and country = any($${params.length}::text[])`);
  }

  const filterSql = buildOutletSourceFilterSql(params, {
    outletIds,
    sourceNames,
    outletColumn: 'outlet_id',
    sourceColumn: 'source'
  });

  const result = await db.query<{
    hour_bucket: string;
    runner: 'worker' | 'api_news' | 'warm';
    outlet_id: string;
    source: string;
    country: string;
    method: 'rss' | 'sitemap';
    attempted_runs: number;
    successful_runs: number;
    failed_runs: number;
    fetched_count: number;
    valid_count: number;
    missing_title_count: number;
    missing_summary_count: number;
    missing_published_at_count: number;
    missing_link_count: number;
  }>(
    `
    select
      hour_bucket,
      runner,
      outlet_id,
      source,
      country,
      method,
      attempted_runs,
      successful_runs,
      failed_runs,
      fetched_count,
      valid_count,
      missing_title_count,
      missing_summary_count,
      missing_published_at_count,
      missing_link_count
    from ingest_ops_hourly
    where 1=1
      ${whereParts.join('\n      ')}
      ${filterSql}
    order by hour_bucket desc
    limit $${params.length + 1}
    `,
    [...params, limit]
  );

  return {
    storage: 'postgres',
    rows: result.rows.map((row) => ({
      bucket: new Date(row.hour_bucket).toISOString(),
      runner: row.runner,
      outletId: row.outlet_id,
      source: row.source,
      country: row.country,
      method: row.method,
      attemptedRuns: Number(row.attempted_runs) || 0,
      successfulRuns: Number(row.successful_runs) || 0,
      failedRuns: Number(row.failed_runs) || 0,
      fetchedCount: Number(row.fetched_count) || 0,
      validCount: Number(row.valid_count) || 0,
      missingTitleCount: Number(row.missing_title_count) || 0,
      missingSummaryCount: Number(row.missing_summary_count) || 0,
      missingPublishedAtCount: Number(row.missing_published_at_count) || 0,
      missingLinkCount: Number(row.missing_link_count) || 0
    }))
  };
}

export async function readIngestOpsDaily(options: IngestOpsReadBaseOptions & {
  days?: number;
  from?: string | Date;
  to?: string | Date;
} = {}): Promise<{ storage: 'postgres' | 'disabled'; reason?: string; rows: IngestOpsDailyRow[] }> {
  const db = getPool();
  if (!db) return { storage: 'disabled', reason: poolDisabledReason, rows: [] };
  await ensureSchema();

  const days = Math.max(1, Math.min(365, Math.floor(options.days || 30)));
  const runner = options.runner;
  const method = options.method;
  const outletIds = (options.outletIds || []).filter(Boolean);
  const sourceNames = (options.sourceNames || []).filter(Boolean);
  const countries = (options.countries || []).filter(Boolean);
  const from = options.from ? new Date(options.from) : null;
  const to = options.to ? new Date(options.to) : null;
  const limit = Math.max(1, Math.min(1000000, Math.floor(options.limit || 1000)));

  const params: unknown[] = [];
  const whereParts: string[] = [];

  if (runner) {
    params.push(runner);
    whereParts.push(`and runner = $${params.length}`);
  }
  if (method) {
    params.push(method);
    whereParts.push(`and method = $${params.length}`);
  }
  if (from && Number.isFinite(from.getTime())) {
    params.push(from.toISOString().slice(0, 10));
    whereParts.push(`and day_bucket >= $${params.length}::date`);
  } else {
    params.push(String(days));
    whereParts.push(`and day_bucket > (now() - ($${params.length}::text || ' days')::interval)::date`);
  }
  if (to && Number.isFinite(to.getTime())) {
    params.push(to.toISOString().slice(0, 10));
    whereParts.push(`and day_bucket <= $${params.length}::date`);
  }
  if (countries.length > 0) {
    params.push(countries);
    whereParts.push(`and country = any($${params.length}::text[])`);
  }

  const filterSql = buildOutletSourceFilterSql(params, {
    outletIds,
    sourceNames,
    outletColumn: 'outlet_id',
    sourceColumn: 'source'
  });

  const result = await db.query<{
    day_bucket: string;
    runner: 'worker' | 'api_news' | 'warm';
    outlet_id: string;
    source: string;
    country: string;
    method: 'rss' | 'sitemap';
    attempted_runs: number;
    successful_runs: number;
    failed_runs: number;
    fetched_count: number;
    valid_count: number;
    missing_title_count: number;
    missing_summary_count: number;
    missing_published_at_count: number;
    missing_link_count: number;
  }>(
    `
    select
      day_bucket,
      runner,
      outlet_id,
      source,
      country,
      method,
      attempted_runs,
      successful_runs,
      failed_runs,
      fetched_count,
      valid_count,
      missing_title_count,
      missing_summary_count,
      missing_published_at_count,
      missing_link_count
    from ingest_ops_daily
    where 1=1
      ${whereParts.join('\n      ')}
      ${filterSql}
    order by day_bucket desc
    limit $${params.length + 1}
    `,
    [...params, limit]
  );

  return {
    storage: 'postgres',
    rows: result.rows.map((row) => ({
      bucket: row.day_bucket,
      runner: row.runner,
      outletId: row.outlet_id,
      source: row.source,
      country: row.country,
      method: row.method,
      attemptedRuns: Number(row.attempted_runs) || 0,
      successfulRuns: Number(row.successful_runs) || 0,
      failedRuns: Number(row.failed_runs) || 0,
      fetchedCount: Number(row.fetched_count) || 0,
      validCount: Number(row.valid_count) || 0,
      missingTitleCount: Number(row.missing_title_count) || 0,
      missingSummaryCount: Number(row.missing_summary_count) || 0,
      missingPublishedAtCount: Number(row.missing_published_at_count) || 0,
      missingLinkCount: Number(row.missing_link_count) || 0
    }))
  };
}

export async function readNewsArticlesEarliestCreatedAt(): Promise<{
  storage: 'postgres' | 'disabled';
  reason?: string;
  earliestCreatedAt: string | null;
}> {
  const db = getPool();
  if (!db) return { storage: 'disabled', reason: poolDisabledReason, earliestCreatedAt: null };
  await ensureSchema();

  const result = await db.query<{ earliest_created_at: string | null }>(`
    select min(created_at)::timestamptz as earliest_created_at
    from news_articles
  `);

  const raw = result.rows[0]?.earliest_created_at;
  if (!raw) return { storage: 'postgres', earliestCreatedAt: null };

  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return { storage: 'postgres', earliestCreatedAt: null };

  return {
    storage: 'postgres',
    earliestCreatedAt: parsed.toISOString().slice(0, 10)
  };
}

export interface NewsArticlesRecentCountRow {
  source: string;
  country: string;
  articleCount: number;
}

export async function readNewsArticlesRecentCounts(options: {
  hours?: number;
  countries?: string[];
  limit?: number;
} = {}): Promise<{
  storage: 'postgres' | 'disabled';
  reason?: string;
  rows: NewsArticlesRecentCountRow[];
}> {
  const db = getPool();
  if (!db) return { storage: 'disabled', reason: poolDisabledReason, rows: [] };
  await ensureSchema();

  const hours = Math.max(1, Math.min(24 * 30, Math.floor(options.hours || 24)));
  const countries = (options.countries || []).filter(Boolean);
  const limit = Math.max(1, Math.min(1000000, Math.floor(options.limit || 100000)));

  const params: unknown[] = [hours];
  const whereParts = [`created_at > now() - ($1::int * interval '1 hour')`];

  if (countries.length > 0) {
    params.push(countries);
    whereParts.push(`country = any($${params.length}::text[])`);
  }

  params.push(limit);

  const result = await db.query<{
    source: string;
    country: string | null;
    article_count: string;
  }>(
    `
    select
      source,
      country,
      count(*)::text as article_count
    from news_articles
    where ${whereParts.join('\n      and ')}
    group by source, country
    order by count(*) desc, source asc
    limit $${params.length}
    `,
    params
  );

  return {
    storage: 'postgres',
    rows: result.rows.map((row) => ({
      source: row.source,
      country: row.country || 'Global',
      articleCount: Number(row.article_count) || 0
    }))
  };
}

export async function pruneExpiredIngestionData(
  options: IngestionDataRetentionOptions = {}
): Promise<IngestionDataRetentionResult> {
  const db = getPool();
  if (!db) {
    return {
      storage: 'disabled',
      reason: poolDisabledReason,
      dryRun: options.dryRun || false,
      deleted: {
        newsArticles: 0
      }
    };
  }

  await ensureSchema();
  const dryRun = options.dryRun || false;
  const retentionConfig = {
    newsArticles: parseRetentionDays(options.newsArticlesRetentionDays, 'NEWS_ARTICLES_RETENTION_DAYS', 3)
  };

  const result: IngestionDataRetentionResult = {
    storage: 'postgres',
    dryRun,
    deleted: {
      newsArticles: 0
    }
  };

  if (dryRun) {
    result.deleted.newsArticles = await countRowsForRetention(db, 'news_articles', 'created_at', retentionConfig.newsArticles);
    return result;
  }

  result.deleted.newsArticles = await pruneRowsForRetention(db, 'news_articles', 'created_at', retentionConfig.newsArticles);

  return result;
}

export async function readIngestFailureReasons(options: IngestOpsReadBaseOptions & {
  hours?: number;
  days?: number;
  from?: string | Date;
  to?: string | Date;
  limit?: number;
} = {}): Promise<{ storage: 'postgres' | 'disabled'; reason?: string; rows: IngestFailureReasonRow[]; totalFailures: number }> {
  const db = getPool();
  if (!db) return { storage: 'disabled', reason: poolDisabledReason, rows: [], totalFailures: 0 };
  await ensureSchema();

  const runner = options.runner;
  const method = options.method;
  const outletIds = (options.outletIds || []).filter(Boolean);
  const sourceNames = (options.sourceNames || []).filter(Boolean);
  const countries = (options.countries || []).filter(Boolean);
  const from = options.from ? new Date(options.from) : null;
  const to = options.to ? new Date(options.to) : null;
  const limit = Math.max(1, Math.min(10000, Math.floor(options.limit || 200)));
  const hours = Math.max(1, Math.min(24 * 30, Math.floor(options.hours || 24)));
  const days = Math.max(1, Math.min(365, Math.floor(options.days || 1)));

  const params: unknown[] = [];
  const whereParts: string[] = [];

  if (runner) {
    params.push(runner);
    whereParts.push(`and runner = $${params.length}`);
  }
  if (method) {
    params.push(method);
    whereParts.push(`and method = $${params.length}`);
  }
  if (from && Number.isFinite(from.getTime())) {
    params.push(from.toISOString());
    whereParts.push(`and ran_at >= $${params.length}::timestamptz`);
  } else if (options.days) {
    params.push(String(days));
    whereParts.push(`and ran_at > now() - ($${params.length}::text || ' days')::interval`);
  } else {
    params.push(String(hours));
    whereParts.push(`and ran_at > now() - ($${params.length}::text || ' hours')::interval`);
  }
  if (to && Number.isFinite(to.getTime())) {
    params.push(to.toISOString());
    whereParts.push(`and ran_at <= $${params.length}::timestamptz`);
  }
  if (countries.length > 0) {
    params.push(countries);
    whereParts.push(`and country = any($${params.length}::text[])`);
  }

  const filterSql = buildOutletSourceFilterSql(params, {
    outletIds,
    sourceNames,
    outletColumn: 'outlet_id',
    sourceColumn: 'source'
  });

  const result = await db.query<{
    reason_key: string;
    reason: string;
    count: string;
  }>(
    `
    select
      coalesce(method, 'unknown') || ':' || coalesce(nullif(trim(error), ''), 'unknown_failure') as reason_key,
      count(*)::text as count
    from rss_health_status
    where 1=1
      and attempted
      and not ok
      ${whereParts.join('\n      ')}
      ${filterSql}
    group by reason_key
    order by count desc, reason_key asc
    limit $${params.length + 1}
    `,
    [...params, limit]
  );

  const rows = result.rows.map((row) => ({
    reason: row.reason_key || 'unknown_failure',
    count: Number(row.count) || 0
  }));

  return {
    storage: 'postgres',
    rows,
    totalFailures: rows.reduce((acc, row) => acc + row.count, 0)
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
    country: string;
    attempted: boolean;
    circuit_open: boolean;
    ok: boolean;
    status_code: number | null;
    parsed_count: number;
    fetched_count: number;
    parsed_limit: number | null;
    sample_capped: boolean;
    recent24h: number;
    missing_title_count: number;
    missing_summary_count: number;
    missing_published_at_count: number;
    missing_link_count: number;
    requested_url: string | null;
    final_url: string | null;
    content_type: string | null;
    response_ms: number | null;
    sniffed_type: string | null;
    parsed_ok: boolean | null;
    failure_stage: string | null;
    health_classification: string | null;
    newest_item_published_at: string | null;
    error: string | null;
  }>(
    `
    select distinct on (outlet_id, method)
      outlet_id,
      source,
      country,
      method,
      attempted,
      circuit_open,
      ok,
      status_code,
      parsed_count,
      fetched_count,
      parsed_limit,
      sample_capped,
      recent24h,
      missing_title_count,
      missing_summary_count,
      missing_published_at_count,
      missing_link_count,
      requested_url,
      final_url,
      content_type,
      response_ms,
      sniffed_type,
      parsed_ok,
      failure_stage,
      health_classification,
      newest_item_published_at,
      error
    from rss_health_status
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
      country: row.country,
      attempted: Boolean(row.attempted),
      circuitOpen: Boolean(row.circuit_open),
      ok: Boolean(row.ok),
      statusCode: row.status_code,
      parsedCount: row.parsed_count || 0,
      fetchedCount: row.fetched_count || 0,
      parsedLimit: row.parsed_limit || undefined,
      sampleCapped: Boolean(row.sample_capped),
      recent24h: row.recent24h || 0,
      missingTitleCount: row.missing_title_count || 0,
      missingSummaryCount: row.missing_summary_count || 0,
      missingPublishedAtCount: row.missing_published_at_count || 0,
      missingLinkCount: row.missing_link_count || 0,
      requestedUrl: row.requested_url,
      finalUrl: row.final_url,
      contentType: row.content_type,
      responseMs: row.response_ms,
      sniffedType: row.sniffed_type,
      parsedOk: row.parsed_ok,
      failureStage: row.failure_stage,
      healthClassification: row.health_classification,
      newestItemPublishedAt: row.newest_item_published_at,
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
      const base = i * 28;
      const normalizedResponseMs =
        typeof row.responseMs === 'number' && Number.isFinite(row.responseMs)
          ? Math.max(0, Math.round(row.responseMs))
          : null;
      parts.push(
        `($${base + 1}::text,$${base + 2}::text,$${base + 3}::text,$${base + 4}::text,$${base + 5}::text,$${base + 6}::boolean,$${base + 7}::boolean,$${base + 8}::boolean,$${base + 9}::int,$${base + 10}::int,$${base + 11}::int,$${base + 12}::int,$${base + 13}::boolean,$${base + 14}::int,$${base + 15}::int,$${base + 16}::int,$${base + 17}::int,$${base + 18}::int,$${base + 19}::text,$${base + 20}::text,$${base + 21}::text,$${base + 22}::int,$${base + 23}::text,$${base + 24}::boolean,$${base + 25}::text,$${base + 26}::text,$${base + 27}::timestamptz,$${base + 28}::text)`
      );
      values.push(
        row.runner || defaultRunner,
        row.outletId,
        row.source,
        row.country,
        row.method,
        Boolean(row.attempted),
        Boolean(row.circuitOpen),
        Boolean(row.ok),
        row.statusCode ?? null,
        row.parsedCount ?? 0,
        row.fetchedCount ?? 0,
        row.parsedLimit ?? null,
        Boolean(row.sampleCapped),
        row.recent24h ?? 0,
        row.missingTitleCount ?? 0,
        row.missingSummaryCount ?? 0,
        row.missingPublishedAtCount ?? 0,
        row.missingLinkCount ?? 0,
        row.requestedUrl ?? null,
        row.finalUrl ?? null,
        row.contentType ?? null,
        normalizedResponseMs,
        row.sniffedType ?? null,
        row.parsedOk ?? null,
        row.failureStage ?? null,
        row.healthClassification ?? null,
        row.newestItemPublishedAt ?? null,
        row.error ?? null
      );
    });
    await executeIngestionQuery(
      db,
      `
      insert into rss_health_status (
        runner, outlet_id, source, country, method, attempted, circuit_open, ok, status_code, parsed_count,
        fetched_count, parsed_limit, sample_capped, recent24h,
        missing_title_count, missing_summary_count, missing_published_at_count, missing_link_count,
        requested_url, final_url, content_type, response_ms, sniffed_type, parsed_ok, failure_stage, health_classification, newest_item_published_at, error
      ) values ${parts.join(',')}
      `,
      values,
      'persistIngestionDiagnostics.rss_health_status'
    );
    await upsertIngestOpsRollups(db, rows, defaultRunner);
  }

  return { persisted: runs.length, storage: 'postgres' };
}

type IngestionOpsRollupRow = {
  country: string;
  outletId: string;
  source: string;
  method: 'rss' | 'sitemap';
  runner: 'worker' | 'api_news' | 'warm';
  attemptedRuns: number;
  successfulRuns: number;
  failedRuns: number;
  fetchedCount: number;
  validCount: number;
  missingTitleCount: number;
  missingSummaryCount: number;
  missingPublishedAtCount: number;
  missingLinkCount: number;
};

function normalizeIngestCountry(country: string | undefined): string {
  const value = (country || '').trim();
  return value || 'Global';
}

function coerceInt(value: number | null | undefined): number {
  const normalized = Math.floor(Number(value ?? 0));
  return normalized > 0 ? normalized : 0;
}

async function upsertIngestOpsRollups(db: Pool, runs: IngestionEndpointRun[], defaultRunner: 'worker' | 'api_news' | 'warm'): Promise<void> {
  const rows: IngestionOpsRollupRow[] = runs.map((row) => ({
    country: normalizeIngestCountry(row.country),
    outletId: row.outletId,
    source: row.source,
    method: row.method,
    runner: row.runner || defaultRunner,
    attemptedRuns: row.attempted ? 1 : 0,
    successfulRuns: row.attempted && row.ok ? 1 : 0,
    failedRuns: row.attempted && !row.ok ? 1 : 0,
    fetchedCount: coerceInt(row.fetchedCount),
    validCount: coerceInt(row.parsedCount),
    missingTitleCount: coerceInt(row.missingTitleCount),
    missingSummaryCount: coerceInt(row.missingSummaryCount),
    missingPublishedAtCount: coerceInt(row.missingPublishedAtCount),
    missingLinkCount: coerceInt(row.missingLinkCount),
  }));
  if (!rows.length) return;

  const dedupedRows = [...rows.reduce((acc, row) => {
    const key = `${row.runner}|${row.outletId}|${row.method}`;
    const existing = acc.get(key);
    if (!existing) {
      acc.set(key, { ...row });
      return acc;
    }
    existing.attemptedRuns += row.attemptedRuns;
    existing.successfulRuns += row.successfulRuns;
    existing.failedRuns += row.failedRuns;
    existing.fetchedCount += row.fetchedCount;
    existing.validCount += row.validCount;
    existing.missingTitleCount += row.missingTitleCount;
    existing.missingSummaryCount += row.missingSummaryCount;
    existing.missingPublishedAtCount += row.missingPublishedAtCount;
    existing.missingLinkCount += row.missingLinkCount;
    if (row.country && (!existing.country || row.country !== 'Global')) {
      existing.country = row.country;
    }
    if (row.source) {
      existing.source = row.source;
    }
    return acc;
  }, new Map<string, IngestionOpsRollupRow>()).values()];

  const bucketGroups = chunk(dedupedRows, 200);
  for (const groupedRows of bucketGroups) {
    const values: unknown[] = [];
    const parts: string[] = [];
      groupedRows.forEach((row, index) => {
      const base = index * 14;
      parts.push(`
        (date_trunc('hour', now()),
         $${base + 1}::text, $${base + 2}::text, $${base + 3}::text, $${base + 4}::text, $${base + 5}::text,
         $${base + 6}::int, $${base + 7}::int, $${base + 8}::int, $${base + 9}::int, $${base + 10}::int,
         $${base + 11}::int, $${base + 12}::int, $${base + 13}::int, $${base + 14}::int)`
      );
      values.push(
        row.runner,
        row.outletId,
        row.source,
        row.country,
        row.method,
        row.attemptedRuns,
        row.successfulRuns,
        row.failedRuns,
        row.fetchedCount,
        row.validCount,
        row.missingTitleCount,
        row.missingSummaryCount,
        row.missingPublishedAtCount,
        row.missingLinkCount
      );
    });

    await executeIngestionQuery(
      db,
      `
      insert into ingest_ops_hourly (
        hour_bucket, runner, outlet_id, source, country, method,
        attempted_runs, successful_runs, failed_runs,
        fetched_count, valid_count,
        missing_title_count, missing_summary_count, missing_published_at_count, missing_link_count
      ) values ${parts.join(',')}
      on conflict (hour_bucket, runner, outlet_id, method) do update set
        attempted_runs = ingest_ops_hourly.attempted_runs + excluded.attempted_runs,
        successful_runs = ingest_ops_hourly.successful_runs + excluded.successful_runs,
        failed_runs = ingest_ops_hourly.failed_runs + excluded.failed_runs,
        fetched_count = ingest_ops_hourly.fetched_count + excluded.fetched_count,
        valid_count = ingest_ops_hourly.valid_count + excluded.valid_count,
        missing_title_count = ingest_ops_hourly.missing_title_count + excluded.missing_title_count,
        missing_summary_count = ingest_ops_hourly.missing_summary_count + excluded.missing_summary_count,
        missing_published_at_count = ingest_ops_hourly.missing_published_at_count + excluded.missing_published_at_count,
        missing_link_count = ingest_ops_hourly.missing_link_count + excluded.missing_link_count,
        country = excluded.country,
        source = excluded.source,
        updated_at = now()
      `,
      values,
      'upsertIngestOpsRollups.hourly'
    );

    const dailyValues: unknown[] = [];
    const dailyParts: string[] = [];
    groupedRows.forEach((row, index) => {
      const base = index * 14;
      dailyParts.push(`
        (date_trunc('day', now())::date,
         $${base + 1}::text, $${base + 2}::text, $${base + 3}::text, $${base + 4}::text, $${base + 5}::text,
         $${base + 6}::int, $${base + 7}::int, $${base + 8}::int, $${base + 9}::int, $${base + 10}::int,
         $${base + 11}::int, $${base + 12}::int, $${base + 13}::int, $${base + 14}::int)`
      );
      dailyValues.push(
        row.runner,
        row.outletId,
        row.source,
        row.country,
        row.method,
        row.attemptedRuns,
        row.successfulRuns,
        row.failedRuns,
        row.fetchedCount,
        row.validCount,
        row.missingTitleCount,
        row.missingSummaryCount,
        row.missingPublishedAtCount,
        row.missingLinkCount
      );
    });

    await executeIngestionQuery(
      db,
      `
      insert into ingest_ops_daily (
        day_bucket, runner, outlet_id, source, country, method,
        attempted_runs, successful_runs, failed_runs,
        fetched_count, valid_count,
        missing_title_count, missing_summary_count, missing_published_at_count, missing_link_count
      ) values ${dailyParts.join(',')}
      on conflict (day_bucket, runner, outlet_id, method) do update set
        attempted_runs = ingest_ops_daily.attempted_runs + excluded.attempted_runs,
        successful_runs = ingest_ops_daily.successful_runs + excluded.successful_runs,
        failed_runs = ingest_ops_daily.failed_runs + excluded.failed_runs,
        fetched_count = ingest_ops_daily.fetched_count + excluded.fetched_count,
        valid_count = ingest_ops_daily.valid_count + excluded.valid_count,
        missing_title_count = ingest_ops_daily.missing_title_count + excluded.missing_title_count,
        missing_summary_count = ingest_ops_daily.missing_summary_count + excluded.missing_summary_count,
        missing_published_at_count = ingest_ops_daily.missing_published_at_count + excluded.missing_published_at_count,
        missing_link_count = ingest_ops_daily.missing_link_count + excluded.missing_link_count,
        country = excluded.country,
        source = excluded.source,
        updated_at = now()
      `,
      dailyValues,
      'upsertIngestOpsRollups.daily'
    );
  }
}

export type MissingPublishedAtCandidate = {
  outletId: string;
  source: string;
  country: string;
  method: 'rss' | 'sitemap';
  link: string;
  title: string;
  description: string | null;
  language: string | null;
  section: string;
  categories: string[];
};

type ExistingArticleIdentityRow = {
  external_id: string;
  stable_id: string | null;
};

export type NewsArticleFeedCategoryBackfill = {
  externalId: string;
  sourceCategories: string[];
};

async function resolveExistingArticleExternalIds(
  db: Pool,
  rows: NewsArticlePersistable[]
): Promise<Map<string, string>> {
  const stableIds = [...new Set(rows.map((row) => row.stableId).filter((value): value is string => Boolean(value)))];
  const externalIds = [...new Set(rows.map((row) => row.externalId).filter(Boolean))];
  if (!stableIds.length && !externalIds.length) return new Map();

  const result = await db.query<ExistingArticleIdentityRow>(
    `
    select external_id, stable_id
    from news_articles
    where (
      cardinality($1::text[]) > 0
      and external_id = any($1::text[])
    ) or (
      cardinality($2::text[]) > 0
      and stable_id = any($2::text[])
    )
    `,
    [externalIds, stableIds]
  );

  const stableIdToExternalId = new Map<string, string>();
  const externalIdSet = new Set<string>();
  for (const row of result.rows) {
    if (row.stable_id) {
      stableIdToExternalId.set(row.stable_id, row.external_id);
    }
    externalIdSet.add(row.external_id);
  }

  const resolved = new Map<string, string>();
  for (const row of rows) {
    const key = `${row.externalId}|${row.stableId || ''}`;
    if (row.stableId && stableIdToExternalId.has(row.stableId)) {
      resolved.set(key, stableIdToExternalId.get(row.stableId)!);
      continue;
    }
    if (externalIdSet.has(row.externalId)) {
      resolved.set(key, row.externalId);
    }
  }

  return resolved;
}

export async function persistNewsArticles(items: NewsItem[]): Promise<{ persisted: number; storage: 'postgres' | 'disabled'; reason?: string }> {
  const db = getPool();
  if (!db) return { persisted: 0, storage: 'disabled', reason: poolDisabledReason };
  if (!items.length) return { persisted: 0, storage: 'postgres' };

  await ensureSchema();
  const rows = (
    await Promise.all(
      items.map((item) =>
        toNewsArticlePersistable(item, {
          publicationMaxAgeMs,
          storedTitleMaxChars,
          storedSnippetMaxChars,
          sha256Hex,
        })
      )
    )
  ).filter((row): row is NewsArticlePersistable => Boolean(row));
  if (!rows.length) return { persisted: 0, storage: 'postgres' };
  const resolvedExisting = await resolveExistingArticleExternalIds(db, rows);
  const resolvedRows = rows.map((row) => ({
    ...row,
    externalId: resolvedExisting.get(`${row.externalId}|${row.stableId || ''}`) || row.externalId,
  }));
  const dedupedRows = [...resolvedRows.reduce((acc, row) => {
    const dedupeKey = row.stableId || row.externalId;
    const current = acc.get(dedupeKey);
    if (!current) {
      acc.set(dedupeKey, row);
      return acc;
    }
    acc.set(dedupeKey, preferPersistedArticleRow(current, row));
    return acc;
  }, new Map<string, NewsArticlePersistable>()).values()];
  const insertRows = [...dedupedRows.reduce((acc, row) => {
    const current = acc.get(row.externalId);
    if (!current) {
      acc.set(row.externalId, row);
      return acc;
    }
    acc.set(row.externalId, preferPersistedArticleRow(current, row));
    return acc;
  }, new Map<string, NewsArticlePersistable>()).values()];

  const groups = chunk(insertRows, 250);
  for (const group of groups) {
    const values: unknown[] = [];
    const parts: string[] = [];
    group.forEach((row, i) => {
      const base = i * 24;
      parts.push(
        `($${base + 1}::text,$${base + 2}::text,$${base + 3}::timestamptz,$${base + 4}::text,$${base + 5}::text,$${base + 6}::text[],$${base + 7}::text[],$${base + 8}::text,$${base + 9}::text[],$${base + 10}::timestamptz,$${base + 11}::timestamptz,$${base + 12}::text,$${base + 13}::text,$${base + 14}::timestamptz,$${base + 15}::text,$${base + 16}::text,$${base + 17}::timestamptz,$${base + 18}::timestamptz,$${base + 19}::text,$${base + 20}::text,$${base + 21}::text,$${base + 22}::text,$${base + 23}::text,$${base + 24}::text,now(),now())`
      );
      values.push(
        row.externalId,
        row.stableId,
        row.publicationDatetime,
        row.section,
        row.primarySection,
        row.sectionsNormalized,
        row.feedCategories,
        row.primaryTopic,
        row.topics,
        new Date().toISOString(),
        new Date().toISOString(),
        row.titleOriginal,
        row.titleQuality,
        row.titleQualityReason,
        row.titleQualityCheckedAt,
        row.titleRepairStatus,
        row.titleRepairSource,
        row.titleRepairAttemptedAt,
        row.titleRepairedAt,
        row.snippetOriginal,
        row.country,
        row.url,
        row.source,
        row.language
      );
    });

    await executeIngestionQuery(
      db,
      `
      insert into news_articles (
        external_id, stable_id, publication_datetime, section, primary_section, sections_normalized, feed_categories, primary_topic, topics, topics_derived_at, taxonomy_derived_at, title_original, title_quality, title_quality_reason, title_quality_checked_at, title_repair_status, title_repair_source, title_repair_attempted_at, title_repaired_at, snippet_original,
        country, url, source, language, created_at, updated_at
      ) values ${parts.join(',')}
      on conflict (external_id) do update set
        stable_id = coalesce(excluded.stable_id, news_articles.stable_id),
        publication_datetime = excluded.publication_datetime,
        section = excluded.section,
        primary_section = coalesce(excluded.primary_section, news_articles.primary_section),
        sections_normalized = (
          select array(
            select distinct section_value
            from unnest(
              coalesce(news_articles.sections_normalized, '{}'::text[]) ||
              coalesce(excluded.sections_normalized, '{}'::text[])
            ) as section_value
            where section_value is not null and btrim(section_value) <> ''
          )
        ),
        feed_categories = (
          select array(
            select distinct unnest(
              coalesce(news_articles.feed_categories, '{}'::text[]) ||
              coalesce(excluded.feed_categories, '{}'::text[])
            )
          )
        ),
        primary_topic = coalesce(excluded.primary_topic, news_articles.primary_topic),
        topics = (
          select array(
            select distinct topic
            from unnest(
              coalesce(news_articles.topics, '{}'::text[]) ||
              coalesce(excluded.topics, '{}'::text[])
            ) as topic
            where topic is not null and btrim(topic) <> ''
          )
        ),
        topics_derived_at = now(),
        taxonomy_derived_at = now(),
        title_original = case
          when coalesce(nullif(trim(news_articles.title_quality), ''), 'ok') in ('ok', 'recovered')
            and coalesce(nullif(trim(excluded.title_quality), ''), 'ok') = 'suspect'
          then news_articles.title_original
          when (excluded.title_original = excluded.url or excluded.title_original like 'http%')
            and news_articles.title_original is not null
            and news_articles.title_original <> ''
            and news_articles.title_original <> news_articles.url
            and news_articles.title_original not like 'http%'
          then news_articles.title_original
          else excluded.title_original
        end,
        title_quality = case
          when coalesce(nullif(trim(news_articles.title_quality), ''), 'ok') in ('ok', 'recovered')
            and coalesce(nullif(trim(excluded.title_quality), ''), 'ok') = 'suspect'
          then news_articles.title_quality
          else excluded.title_quality
        end,
        title_quality_reason = case
          when coalesce(nullif(trim(news_articles.title_quality), ''), 'ok') in ('ok', 'recovered')
            and coalesce(nullif(trim(excluded.title_quality), ''), 'ok') = 'suspect'
          then news_articles.title_quality_reason
          else excluded.title_quality_reason
        end,
        title_quality_checked_at = case
          when coalesce(nullif(trim(news_articles.title_quality), ''), 'ok') in ('ok', 'recovered')
            and coalesce(nullif(trim(excluded.title_quality), ''), 'ok') = 'suspect'
          then coalesce(news_articles.title_quality_checked_at, excluded.title_quality_checked_at)
          else excluded.title_quality_checked_at
        end,
        title_repair_status = case
          when coalesce(nullif(trim(news_articles.title_quality), ''), 'ok') in ('ok', 'recovered')
            and coalesce(nullif(trim(excluded.title_quality), ''), 'ok') = 'suspect'
          then news_articles.title_repair_status
          else excluded.title_repair_status
        end,
        title_repair_source = case
          when coalesce(nullif(trim(news_articles.title_quality), ''), 'ok') in ('ok', 'recovered')
            and coalesce(nullif(trim(excluded.title_quality), ''), 'ok') = 'suspect'
          then news_articles.title_repair_source
          else excluded.title_repair_source
        end,
        title_repair_attempted_at = case
          when coalesce(nullif(trim(news_articles.title_quality), ''), 'ok') in ('ok', 'recovered')
            and coalesce(nullif(trim(excluded.title_quality), ''), 'ok') = 'suspect'
          then news_articles.title_repair_attempted_at
          else excluded.title_repair_attempted_at
        end,
        title_repaired_at = case
          when coalesce(nullif(trim(news_articles.title_quality), ''), 'ok') in ('ok', 'recovered')
            and coalesce(nullif(trim(excluded.title_quality), ''), 'ok') = 'suspect'
          then news_articles.title_repaired_at
          else excluded.title_repaired_at
        end,
        snippet_original = coalesce(nullif(excluded.snippet_original, ''), news_articles.snippet_original),
        country = excluded.country,
        url = excluded.url,
        source = excluded.source,
        language = excluded.language,
        updated_at = now()
      `,
      values,
      'persistNewsArticles.insert'
    );
  }

  return { persisted: insertRows.length, storage: 'postgres' };
}

export async function backfillNewsArticleFeedCategories(
  items: NewsArticleFeedCategoryBackfill[]
): Promise<{ updated: number; storage: 'postgres' | 'disabled'; reason?: string }> {
  const db = getPool();
  if (!db) return { updated: 0, storage: 'disabled', reason: poolDisabledReason };
  if (!items.length) return { updated: 0, storage: 'postgres' };

  await ensureSchema();
  const deduped = [...items.reduce((acc, item) => {
    const externalId = (item.externalId || '').trim();
    if (!externalId) return acc;
    const current = acc.get(externalId) || [];
    acc.set(externalId, normalizeSourceCategories([...current, ...(item.sourceCategories || [])]));
    return acc;
  }, new Map<string, string[]>()).entries()]
    .map(([externalId, sourceCategories]) => ({ externalId, sourceCategories }))
    .filter((item) => item.sourceCategories.length > 0);

  if (!deduped.length) return { updated: 0, storage: 'postgres' };

  let updated = 0;
  const groups = chunk(deduped, 250);
  for (const group of groups) {
    const values: unknown[] = [];
    const parts: string[] = [];
    group.forEach((item, index) => {
      const base = index * 2;
      parts.push(`($${base + 1}::text, $${base + 2}::text[])`);
      values.push(item.externalId, item.sourceCategories);
    });
    const result = await db.query(
      `
      with incoming as (
        select *
        from (values ${parts.join(',')}) as t(external_id, feed_categories)
      )
      update news_articles as n
      set feed_categories = (
            select array(
              select distinct category
              from unnest(
                coalesce(n.feed_categories, '{}'::text[]) ||
                coalesce(incoming.feed_categories, '{}'::text[])
              ) as category
              where category is not null and btrim(category) <> ''
            )
          ),
          updated_at = now()
      from incoming
      where n.external_id = incoming.external_id
        and cardinality(coalesce(incoming.feed_categories, '{}'::text[])) > 0
      `,
      values
    );
    updated += result.rowCount || 0;
  }

  return { updated, storage: 'postgres' };
}

export async function persistMissingPublishedAtCandidates(
  items: MissingPublishedAtCandidate[]
): Promise<{ persisted: number; storage: 'postgres' | 'disabled'; reason?: string }> {
  const db = getPool();
  if (!db) return { persisted: 0, storage: 'disabled', reason: poolDisabledReason };
  if (!items.length) return { persisted: 0, storage: 'postgres' };

  await ensureSchema();
  const rows = (
    await Promise.all(
      items.map((item) =>
        toMissingPublishedAtPersistable(item, {
          storedTitleMaxChars,
          storedSnippetMaxChars,
          sha256Hex,
        })
      )
    )
  ).filter(
    (row): row is MissingPublishedAtPersistable => Boolean(row)
  );
  if (!rows.length) return { persisted: 0, storage: 'postgres' };

  const dedupedRows = [...rows.reduce((acc, row) => {
    const current = acc.get(row.candidateId);
    if (!current) {
      acc.set(row.candidateId, row);
      return acc;
    }
    if ((row.snippetOriginal || '').length > (current.snippetOriginal || '').length) {
      acc.set(row.candidateId, row);
      return acc;
    }
    acc.set(row.candidateId, {
      ...current,
      feedCategories: [...new Set([...current.feedCategories, ...row.feedCategories])],
    });
    return acc;
  }, new Map<string, MissingPublishedAtPersistable>()).values()];

  const groups = chunk(dedupedRows, 250);
  for (const group of groups) {
    const values: unknown[] = [];
    const parts: string[] = [];
    group.forEach((row, i) => {
      const base = i * 11;
      parts.push(
        `($${base + 1}::text,$${base + 2}::text,$${base + 3}::text,$${base + 4}::text,$${base + 5}::text,$${base + 6}::text,$${base + 7}::text,$${base + 8}::text,$${base + 9}::text,$${base + 10}::text,$${base + 11}::text[],now(),now(),now(),now())`
      );
      values.push(
        row.candidateId,
        row.outletId,
        row.source,
        row.country,
        row.method,
        row.url,
        row.titleOriginal,
        row.snippetOriginal,
        row.language,
        row.section,
        row.feedCategories
      );
    });

    await executeIngestionQuery(
      db,
      `
      insert into ingest_missing_published_at (
        candidate_id, outlet_id, source, country, method, url, title_original, snippet_original,
        language, section, feed_categories, first_seen_at, last_seen_at, created_at, updated_at
      ) values ${parts.join(',')}
      on conflict (candidate_id) do update set
        outlet_id = excluded.outlet_id,
        source = excluded.source,
        country = excluded.country,
        method = excluded.method,
        url = excluded.url,
        title_original = case
          when (excluded.title_original = excluded.url or excluded.title_original like 'http%')
            and ingest_missing_published_at.title_original is not null
            and ingest_missing_published_at.title_original <> ''
            and ingest_missing_published_at.title_original <> ingest_missing_published_at.url
            and ingest_missing_published_at.title_original not like 'http%'
          then ingest_missing_published_at.title_original
          else excluded.title_original
        end,
        snippet_original = coalesce(nullif(excluded.snippet_original, ''), ingest_missing_published_at.snippet_original),
        language = excluded.language,
        section = excluded.section,
        feed_categories = (
          select array(
            select distinct unnest(
              coalesce(ingest_missing_published_at.feed_categories, '{}'::text[]) ||
              coalesce(excluded.feed_categories, '{}'::text[])
            )
          )
        ),
        last_seen_at = now(),
        seen_count = ingest_missing_published_at.seen_count + 1,
        updated_at = now()
      `,
      values,
      'persistMissingPublishedAtCandidates.insert'
    );
  }

  return { persisted: dedupedRows.length, storage: 'postgres' };
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
        newsArticles24h: 0
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
      '0'::text as seen_total_24h,
      '0'::text as duplicate_candidates_24h
    from news_articles
    where created_at > now() - interval '24 hours'
  `);

  const runTotals = await db.query<{
    endpoint_runs_24h: string;
    failed_runs_24h: string;
  }>(`
    select
      count(*)::text as endpoint_runs_24h,
      count(*) filter (where attempted and not ok)::text as failed_runs_24h
    from rss_health_status
    where ran_at > now() - interval '24 hours'
      and runner = 'worker'
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
        0::int as seen_total_24h,
        0::int as duplicate_candidates_24h
      from news_articles
      where created_at > now() - interval '24 hours'
      group by source
    ),
    run_rollup as (
      select
        source,
        count(*)::int as endpoint_runs_24h,
        count(*) filter (where attempted and not ok)::int as failed_runs_24h
      from rss_health_status
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
      newsArticles24h: Number(t.unique_items_24h || 0)
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
