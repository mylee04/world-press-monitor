import { Pool } from 'pg';
import { resolveDatabaseUrl } from '@/lib/database-url';
import { normalizeSourceKey } from '@/lib/map-store-source-meta';
import {
  DEFAULT_MAP_WINDOW,
  normalizeMapMetricWindow,
  type SourceMetricWindowSqlRow,
} from '@/lib/map-store-windows';
import type { MapMetricWindow } from '@/lib/map-types';

export type SourceMetricSqlRow = {
  source_country: string | null;
  article_country: string | null;
  country: string | null;
  source: string;
  pub24h: string;
  pub1h: string;
  fresh24h: string;
  late24h: string;
  first_seen_24h: string;
};

export type HealthSqlRow = {
  source: string;
  method: string;
  ok: boolean;
  health_classification: string | null;
  ran_at: string | null;
  error: string | null;
  failures_24h: string;
  attempts_24h: string;
};

export type HourlySqlRow = {
  hour_bucket: string;
  count: string;
};

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: resolveDatabaseUrl(),
    });
  }
  return pool;
}

export function normalizeHealthStatus(row: HealthSqlRow | undefined): 'healthy' | 'warning' | 'degraded' | 'failing' | 'unknown' {
  if (!row) return 'unknown';
  const normalized = (row.health_classification || '').trim().toLowerCase();
  if (normalized === 'healthy' || normalized === 'warning' || normalized === 'degraded' || normalized === 'failing') {
    return normalized;
  }
  if (row.ok) return 'healthy';
  return 'degraded';
}

export async function readRecentSourceMetrics(whereSql?: string, params: unknown[] = []): Promise<SourceMetricSqlRow[]> {
  const db = getPool();
  const result = await db.query<SourceMetricSqlRow>(
    `
    select
      nullif(trim(e.source_country), '') as source_country,
      nullif(trim(e.country), '') as article_country,
      coalesce(nullif(trim(e.source_country), ''), nullif(trim(e.country), '')) as country,
      e.source,
      count(*) filter (where e.publication_datetime >= now() - interval '24 hours')::text as pub24h,
      count(*) filter (where e.publication_datetime >= now() - interval '1 hour')::text as pub1h,
      count(*) filter (
        where e.publication_datetime >= now() - interval '24 hours'
          and e.created_at >= now() - interval '24 hours'
      )::text as fresh24h,
      count(*) filter (
        where e.created_at >= now() - interval '24 hours'
          and e.publication_datetime < now() - interval '24 hours'
      )::text as late24h,
      count(*) filter (where e.created_at >= now() - interval '24 hours')::text as first_seen_24h
    from news_articles e
    where (
      e.publication_datetime >= now() - interval '24 hours'
      or e.created_at >= now() - interval '24 hours'
    )
      and coalesce(nullif(trim(e.title_quality), ''), 'ok') <> 'suspect'
      ${whereSql ? `and ${whereSql}` : ''}
    group by 1, 2, 3, e.source
    having count(*) filter (where e.publication_datetime >= now() - interval '24 hours') > 0
        or count(*) filter (where e.created_at >= now() - interval '24 hours') > 0
    `,
    params
  );
  return result.rows;
}

export async function readWindowedSourceMetrics(
  window: MapMetricWindow = DEFAULT_MAP_WINDOW,
  whereSql?: string,
  params: unknown[] = []
): Promise<SourceMetricWindowSqlRow[]> {
  const selectedWindow = normalizeMapMetricWindow(window);
  const db = getPool();

  if (selectedWindow === '7d') {
    const result = await db.query<SourceMetricWindowSqlRow>(
      `
      select
        nullif(trim(source_country), '') as source_country,
        nullif(trim(country), '') as article_country,
        coalesce(nullif(trim(source_country), ''), nullif(trim(country), '')) as country,
        source,
        count(*) filter (where publication_datetime >= now() - interval '1 hour')::text as pub_1h,
        count(*) filter (where publication_datetime >= now() - interval '24 hours')::text as pub_24h,
        count(*) filter (where publication_datetime >= now() - interval '7 days')::text as pub_7d,
        count(*) filter (
          where publication_datetime >= now() - interval '1 hour'
            and created_at >= now() - interval '1 hour'
        )::text as fresh_1h,
        count(*) filter (
          where publication_datetime >= now() - interval '24 hours'
            and created_at >= now() - interval '24 hours'
        )::text as fresh_24h,
        count(*) filter (
          where publication_datetime >= now() - interval '7 days'
            and created_at >= now() - interval '7 days'
        )::text as fresh_7d,
        count(*) filter (
          where created_at >= now() - interval '1 hour'
            and publication_datetime < now() - interval '1 hour'
        )::text as late_1h,
        count(*) filter (
          where created_at >= now() - interval '24 hours'
            and publication_datetime < now() - interval '24 hours'
        )::text as late_24h,
        count(*) filter (
          where created_at >= now() - interval '7 days'
            and publication_datetime < now() - interval '7 days'
        )::text as late_7d,
        count(*) filter (where created_at >= now() - interval '1 hour')::text as first_seen_1h,
        count(*) filter (where created_at >= now() - interval '24 hours')::text as first_seen_24h,
        count(*) filter (where created_at >= now() - interval '7 days')::text as first_seen_7d
      from news_articles
      where (
        publication_datetime >= now() - interval '7 days'
        or created_at >= now() - interval '7 days'
      )
        and coalesce(nullif(trim(title_quality), ''), 'ok') <> 'suspect'
        ${whereSql ? `and ${whereSql}` : ''}
      group by 1, 2, 3, 4
      `,
      params
    );
    return result.rows;
  }

  if (selectedWindow === '1h') {
    const result = await db.query<SourceMetricWindowSqlRow>(
      `
      select
        nullif(trim(e.source_country), '') as source_country,
        nullif(trim(e.country), '') as article_country,
        coalesce(nullif(trim(e.source_country), ''), nullif(trim(e.country), '')) as country,
        e.source,
        count(*) filter (where e.publication_datetime >= now() - interval '1 hour')::text as pub_1h,
        '0'::text as pub_24h,
        '0'::text as pub_7d,
        count(*) filter (
          where e.publication_datetime >= now() - interval '1 hour'
            and e.created_at >= now() - interval '1 hour'
        )::text as fresh_1h,
        '0'::text as fresh_24h,
        '0'::text as fresh_7d,
        count(*) filter (
          where e.created_at >= now() - interval '1 hour'
            and e.publication_datetime < now() - interval '1 hour'
        )::text as late_1h,
        '0'::text as late_24h,
        '0'::text as late_7d,
        count(*) filter (where e.created_at >= now() - interval '1 hour')::text as first_seen_1h,
        '0'::text as first_seen_24h,
        '0'::text as first_seen_7d
      from news_articles e
      where (
        e.publication_datetime >= now() - interval '1 hour'
        or e.created_at >= now() - interval '1 hour'
      )
        and coalesce(nullif(trim(e.title_quality), ''), 'ok') <> 'suspect'
        ${whereSql ? `and ${whereSql}` : ''}
      group by 1, 2, 3, e.source
      having count(*) filter (where e.publication_datetime >= now() - interval '1 hour') > 0
          or count(*) filter (where e.created_at >= now() - interval '1 hour') > 0
      `,
      params
    );
    return result.rows;
  }

  const result = await db.query<SourceMetricWindowSqlRow>(
    `
    select
      nullif(trim(e.source_country), '') as source_country,
      nullif(trim(e.country), '') as article_country,
      coalesce(nullif(trim(e.source_country), ''), nullif(trim(e.country), '')) as country,
      e.source,
      count(*) filter (where e.publication_datetime >= now() - interval '1 hour')::text as pub_1h,
      count(*) filter (where e.publication_datetime >= now() - interval '24 hours')::text as pub_24h,
      '0'::text as pub_7d,
      count(*) filter (
        where e.publication_datetime >= now() - interval '1 hour'
          and e.created_at >= now() - interval '1 hour'
      )::text as fresh_1h,
      count(*) filter (
        where e.publication_datetime >= now() - interval '24 hours'
          and e.created_at >= now() - interval '24 hours'
      )::text as fresh_24h,
      '0'::text as fresh_7d,
      count(*) filter (
        where e.created_at >= now() - interval '1 hour'
          and e.publication_datetime < now() - interval '1 hour'
      )::text as late_1h,
      count(*) filter (
        where e.created_at >= now() - interval '24 hours'
          and e.publication_datetime < now() - interval '24 hours'
      )::text as late_24h,
      '0'::text as late_7d,
      count(*) filter (where e.created_at >= now() - interval '1 hour')::text as first_seen_1h,
      count(*) filter (where e.created_at >= now() - interval '24 hours')::text as first_seen_24h,
      '0'::text as first_seen_7d
    from news_articles e
    where (
      e.publication_datetime >= now() - interval '24 hours'
      or e.created_at >= now() - interval '24 hours'
    )
      and coalesce(nullif(trim(e.title_quality), ''), 'ok') <> 'suspect'
      ${whereSql ? `and ${whereSql}` : ''}
    group by 1, 2, 3, e.source
    having count(*) filter (where e.publication_datetime >= now() - interval '24 hours') > 0
        or count(*) filter (where e.created_at >= now() - interval '24 hours') > 0
    `,
    params
  );
  return result.rows;
}

export async function readLatestHealthBySource(): Promise<Map<string, HealthSqlRow>> {
  const db = getPool();
  const result = await db.query<HealthSqlRow>(
    `
    with latest as (
      select distinct on (source, method)
        source,
        method,
        ok,
        health_classification,
        ran_at,
        error
      from rss_health_status
      order by source, method, ran_at desc
    ),
    fail_window as (
      select
        source,
        method,
        count(*) filter (where attempted) as attempts_24h,
        count(*) filter (where attempted and not ok) as failures_24h
      from rss_health_status
      where ran_at >= now() - interval '24 hours'
      group by source, method
    )
    select
      latest.source,
      latest.method,
      latest.ok,
      latest.health_classification,
      latest.ran_at,
      latest.error,
      coalesce(fail_window.failures_24h, 0)::text as failures_24h,
      coalesce(fail_window.attempts_24h, 0)::text as attempts_24h
    from latest
    left join fail_window
      on fail_window.source = latest.source
     and fail_window.method = latest.method
    `
  );

  const bySource = new Map<string, HealthSqlRow>();
  for (const row of result.rows) {
    const key = normalizeSourceKey(row.source);
    const current = bySource.get(key);
    if (!current) {
      bySource.set(key, row);
      continue;
    }
    const currentRank = healthRank(normalizeHealthStatus(current));
    const nextRank = healthRank(normalizeHealthStatus(row));
    if (nextRank < currentRank) {
      bySource.set(key, row);
    }
  }
  return bySource;
}

function healthRank(status: 'healthy' | 'warning' | 'degraded' | 'failing' | 'unknown'): number {
  switch (status) {
    case 'healthy':
      return 0;
    case 'warning':
      return 1;
    case 'degraded':
      return 2;
    case 'failing':
      return 3;
    default:
      return 4;
  }
}

export async function readHourlyCountsForCountry(country: string): Promise<HourlySqlRow[]> {
  const db = getPool();
  const result = await db.query<HourlySqlRow>(
    `
    select
      to_char(date_trunc('hour', publication_datetime), 'YYYY-MM-DD"T"HH24:00:00"Z"') as hour_bucket,
      count(*)::text as count
    from news_articles
    where country = $1
      and publication_datetime >= now() - interval '24 hours'
      and coalesce(nullif(trim(title_quality), ''), 'ok') <> 'suspect'
    group by 1
    order by 1 asc
    `,
    [country]
  );
  return result.rows;
}

export async function readHourlyCountsForSource(sourceNames: string[], countryHint?: string | null): Promise<HourlySqlRow[]> {
  const db = getPool();
  const result = await db.query<HourlySqlRow>(
    `
    select
      to_char(date_trunc('hour', publication_datetime), 'YYYY-MM-DD"T"HH24:00:00"Z"') as hour_bucket,
      count(*)::text as count
    from news_articles
    where source = any($1::text[])
      and publication_datetime >= now() - interval '24 hours'
      and coalesce(nullif(trim(title_quality), ''), 'ok') <> 'suspect'
      ${countryHint ? `and coalesce(nullif(trim(source_country), ''), nullif(trim(country), '')) = $2` : ''}
    group by 1
    order by 1 asc
    `,
    countryHint ? [sourceNames, countryHint] : [sourceNames]
  );
  return result.rows;
}

export async function readDailyBenchmarkCountsForSource(
  sourceNames: string[],
  countryHint?: string | null
): Promise<Array<{ day_bucket: string; published_count: string }>> {
  if (sourceNames.length === 0) return [];
  const db = getPool();
  const result = await db.query<{ day_bucket: string; published_count: string }>(
    `
    select
      day_bucket::text,
      sum(published_count)::text as published_count
    from country_benchmark_source_daily
    where source = any($1::text[])
      and metric_version = 'v1'
      ${countryHint ? `and country = $2` : ''}
    group by day_bucket
    order by day_bucket desc
    limit 7
    `,
    countryHint ? [sourceNames, countryHint] : [sourceNames]
  );
  return result.rows;
}

export async function readDailyBenchmarkCountsForCountry(country: string): Promise<Array<{ day_bucket: string; published_count: string }>> {
  const db = getPool();
  const result = await db.query<{ day_bucket: string; published_count: string }>(
    `
    select
      day_bucket::text,
      published_count::text
    from country_benchmark_daily
    where country = $1
      and metric_version = 'v1'
    order by day_bucket desc
    limit 7
    `,
    [country]
  );
  return result.rows;
}
