import type { Pool } from 'pg';

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

export interface EndpointBackoffRow {
  outletId: string;
  source: string;
  method: 'rss' | 'sitemap';
  attempted: number;
  failed: number;
  failPct: number;
}

export interface NewsArticlesRecentCountRow {
  source: string;
  country: string;
  articleCount: number;
}

type ReadSitemapPolicyInput = {
  outletId: string;
  source: string;
  country: string;
};

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

type NewsOpsStoreDeps = {
  getPool: () => Pool | null;
  ensureSchema: () => Promise<void>;
  poolDisabledReason: string;
  executeIngestionQuery: (db: Pool, queryText: string, params: unknown[], label: string) => Promise<unknown>;
  buildOutletSourceFilterSql: (
    params: unknown[],
    options: { outletIds: string[]; sourceNames: string[]; outletColumn: string; sourceColumn: string }
  ) => string;
  chunk: <T>(items: T[], size: number) => T[][];
  isRecoverableSitemapPolicyError: (error: unknown) => boolean;
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

export async function readSitemapPolicyStatesWithDeps(
  deps: NewsOpsStoreDeps,
  rows: ReadSitemapPolicyInput[]
): Promise<Map<string, SitemapPolicyState>> {
  const db = deps.getPool();
  if (!db) return new Map();
  if (!rows.length) return new Map();
  await deps.ensureSchema();

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
    if (!deps.isRecoverableSitemapPolicyError(error)) throw error;
    console.warn('[ingestion-store] skipping sitemap policy reads due to recoverable catalog error:', error instanceof Error ? error.message : String(error));
  }
  return stateByOutlet;
}

export async function upsertSitemapPolicyStatesWithDeps(
  deps: NewsOpsStoreDeps,
  rows: SitemapPolicyUpsertRow[]
): Promise<void> {
  const db = deps.getPool();
  if (!db || !rows.length) return;
  await deps.ensureSchema();

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

  const groups = deps.chunk(dedupedRows, 250);
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
      await deps.executeIngestionQuery(
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
      if (!deps.isRecoverableSitemapPolicyError(error)) throw error;
      console.warn('[ingestion-store] skipping sitemap policy writes due to recoverable catalog error:', error instanceof Error ? error.message : String(error));
    }
  }
}

export async function readFailingEndpointBackoffWithDeps(
  deps: NewsOpsStoreDeps,
  options: {
    runner?: 'worker' | 'api_news' | 'warm';
    windowMinutes?: number;
    minAttempts?: number;
    minFailPct?: number;
    limit?: number;
  } = {}
): Promise<{ storage: 'postgres' | 'disabled'; reason?: string; rows: EndpointBackoffRow[] }> {
  const db = deps.getPool();
  if (!db) return { storage: 'disabled', reason: deps.poolDisabledReason, rows: [] };
  await deps.ensureSchema();

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

export async function readNewsArticlesEarliestCreatedAtWithDeps(
  deps: NewsOpsStoreDeps
): Promise<{ storage: 'postgres' | 'disabled'; reason?: string; earliestCreatedAt: string | null }> {
  const db = deps.getPool();
  if (!db) return { storage: 'disabled', reason: deps.poolDisabledReason, earliestCreatedAt: null };
  await deps.ensureSchema();

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

export async function readNewsArticlesRecentCountsWithDeps(
  deps: NewsOpsStoreDeps,
  options: { hours?: number; countries?: string[]; limit?: number } = {}
): Promise<{ storage: 'postgres' | 'disabled'; reason?: string; rows: NewsArticlesRecentCountRow[] }> {
  const db = deps.getPool();
  if (!db) return { storage: 'disabled', reason: deps.poolDisabledReason, rows: [] };
  await deps.ensureSchema();

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

  const result = await db.query<{ source: string; country: string | null; article_count: string }>(
    `
    select source, country, count(*)::text as article_count
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
