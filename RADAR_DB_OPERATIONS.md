# Radar DB Operations and Schema Guide

## 1) Purpose
This document is the operational guide for the Radar backend in `presslab`.

It explains:
- data ownership (single source of truth),
- ingestion and summary pipelines,
- read API behavior,
- index strategy,
- validation SQL,
- incident checks.

## 2) Operating Principles
- Article SoT: `external_news_articles`.
- Operational index: `ingested_articles` (joins/tags/beat compatibility).
- Summary state and observability:
  - `radar_summary_queue`
  - `radar_summary_usage_daily`
  - `radar_summary_fetch_logs`
- Request-time crawling is avoided for UI reads.
- Cron + worker paths write data; UI/API paths read preprocessed DB data.

## 3) Architecture Flow
1. Background ingest runs (`/api/news?mode=ingest`, worker, cron).
2. Ingest persists normalized rows to `external_news_articles`.
3. Newly persisted rows are enqueued to `radar_summary_queue`.
4. Summary worker claims queue rows, generates summaries from feed-provided text (no article-page fetching), updates article rows.
5. Radar APIs (`/api/radar/v1/*`) serve DB-backed results with auth + cache headers.
6. Hourly cron posts ops summary to Discord (`/api/cron/radar-hourly-discord` at minute 55).

## 4) Table Design

### 4.1 `external_news_articles` (SoT)
Role:
- canonical article storage for Radar reads and quality metrics.

Radar-relevant columns:
- identity/link: `external_id`, `url`, `url_norm`, `url_hash`
- content: `title_original`, `summary_original`, `summary_en`
- source dimensions: `source`, `country`, `language`, `category`
- timing: `publication_datetime`, `last_seen_at`, `created_at`, `updated_at`
- quality: `publication_source`, `publication_verified`, `summary_source`, `summary_verified`, `quality_score`

### 4.2 `ingested_articles` (operational join/index)
Role:
- compatibility layer for outlet-level metadata (`outlet_id`, `beat`, `tags`).

### 4.3 `radar_summary_queue` (async summary queue)
Role:
- queue state machine for summary processing.

Core columns:
- `article_external_id` (FK to `external_news_articles.external_id`)
- `status` (`pending`, `processing`, `done`, `error`, `skipped`)
- `attempt_count`, `next_retry_at`, `last_error`
- `provider`, `model`, `started_at`, `completed_at`, `updated_at`

### 4.4 `radar_summary_usage_daily` (provider quota tracking)
Role:
- per-day per-provider usage counters (currently GLM).

Core columns:
- `usage_date`, `provider`, `request_count`, `updated_at`

### 4.5 `radar_summary_fetch_logs` (fetch diagnostics)
Role:
- attempt-level diagnostics for context extraction.

Core columns:
- `queue_id`, `article_external_id`, `domain`
- `outcome`, `failure_code`, `http_status`, `used_fallback`, `context_source`
- `attempt_count`, `latency_ms`, `created_at`

## 5) Index Strategy
- `external_news_articles(url_hash)`:
  - fast dedupe/lookup for normalized URL identity.
- `external_news_articles(source, last_seen_at desc)`:
  - source-scoped recent activity queries.
- `external_news_articles(language, last_seen_at desc)`:
  - language coverage/translation metrics.
- partial non-EN index on `last_seen_at`:
  - fast translation coverage calculations.
- `radar_summary_queue(status, next_retry_at, id)`:
  - efficient queue claiming and retries.
- `radar_summary_fetch_logs(domain, created_at desc)`:
  - domain-level failure analysis.
- `ingestion_endpoint_runs` helper indexes:
  - recent endpoint health and failure rate rollups.

## 6) Publication Datetime and Summary Quality
- Publication datetime capture lives in SoT fields:
  - `publication_datetime`
  - `publication_source`
  - `publication_verified`
- Summary quality fields:
  - `summary_original`, `summary_en`
  - `summary_source` (`ai_article`, `article_meta`, etc.)
  - `summary_verified`
- Worker fallback policy:
  - if GLM unavailable/quota-exhausted/rate-limited, queue state moves with retry/backoff.
  - no paywall/auth bypass paths are used.

## 7) Radar API and Cron Surface

Read APIs:
- `GET /api/radar/v1/articles`
- `GET /api/radar/v1/live-feed`
- `GET /api/radar/v1/country-counts`
- `GET /api/radar/v1/sources`
- `GET /api/radar/v1/ops/summary`
- `GET /api/radar/v1/ops/domain-metrics`

Write/trigger APIs:
- `GET|POST /api/radar/v1/fetch`

Cron APIs:
- `GET|POST /api/cron/radar` (every 10m)
- `GET|POST /api/cron/radar-summaries` (every 1m)
- `GET|POST /api/cron/radar-hourly-discord` (hourly at `55 * * * *`)

## 8) Authentication
- Radar service auth:
  - `RADAR_SERVICE_API_KEY`
  - `RADAR_SERVICE_API_KEYS` (`token:scope1|scope2`)
  - scope enforcement in `lib/radar-service-auth.ts`.
- Rate limit:
  - `RADAR_SERVICE_RATE_LIMIT_RPM`.
- Cron auth:
  - bearer token matches `CRON_SECRET` or `RADAR_CRON_TOKEN`.

## 9) Environment Variables
Core:
- `DATABASE_URL`
- `RADAR_SERVICE_API_KEY` or `RADAR_SERVICE_API_KEYS`
- `CRON_SECRET` (or `RADAR_CRON_TOKEN`)

Summary worker:
- `GLM_API_KEY`
- `RADAR_GLM_MODEL`
- `RADAR_GLM_API_BASE_URL`
- `RADAR_SUMMARY_BATCH_SIZE`
- `RADAR_SUMMARY_MAX_ATTEMPTS`
- `RADAR_SUMMARY_TIMEOUT_MS`
- `RADAR_SUMMARY_MAX_CONTEXT_CHARS`
- `RADAR_SUMMARY_MAX_SUMMARY_CHARS`
- `RADAR_SUMMARY_DAILY_GLM_LIMIT`
- `RADAR_SUMMARY_RATE_LIMIT_COOLDOWN_MINUTES`

Ops notifications:
- `RADAR_HOURLY_DISCORD_WEBHOOK` or `RADAR_OPS_DISCORD_WEBHOOK`

## 10) Validation SQL

### 10.1 Volume by country (24h)
```sql
select
  coalesce(country, 'UNKNOWN') as country,
  count(*) as articles_24h
from external_news_articles
where last_seen_at > now() - interval '24 hours'
group by 1
order by articles_24h desc;
```

### 10.2 Inflow windows
```sql
select
  count(*) filter (where created_at > now() - interval '1 hour') as inserted_1h,
  count(*) filter (where created_at > now() - interval '6 hours') as inserted_6h,
  count(*) filter (where created_at > now() - interval '24 hours') as inserted_24h
from external_news_articles;
```

### 10.3 Summary coverage
```sql
select
  count(*) filter (where last_seen_at > now() - interval '24 hours') as total_24h,
  count(*) filter (where last_seen_at > now() - interval '24 hours' and coalesce(btrim(summary_original), '') <> '') as summary_original_24h,
  count(*) filter (
    where last_seen_at > now() - interval '24 hours'
      and language is not null
      and lower(language) not like 'en%'
      and coalesce(btrim(summary_en), '') <> ''
  ) as summary_en_non_en_24h
from external_news_articles;
```

### 10.4 Queue backlog
```sql
select status, count(*) as rows
from radar_summary_queue
group by status
order by status;
```

### 10.5 Fetch outcome diagnostics (1h)
```sql
select
  failure_code,
  count(*) as attempts
from radar_summary_fetch_logs
where created_at > now() - interval '1 hour'
group by failure_code
order by attempts desc nulls last;
```

## 11) Incident Runbook
- Symptom: summaries stay 0%
  - check `radar_summary_queue` runnable rows and `GLM_API_KEY`.
  - inspect `radar_summary_fetch_logs` and provider 429/timeout errors.
- Symptom: API latency spikes
  - check DB health and country/domain query limits.
  - verify clients use `limit` and `hours` bounds.
- Symptom: country volume drops
  - check ingest endpoint failures and source health in `/api/news` ingest summary.
- Symptom: frequent RED alerts
  - inspect `ingestion_endpoint_runs` failure ratio and summary queue backlog.

## 12) Retention Policy
- Current default: no hard-delete retention in Radar cron route.
- Data accumulates unless explicit cleanup/archive jobs are introduced.

## 13) References
- `RADAR_IMPLEMENTATION_MATRIX.md`
- `RADAR_SERVICE_SPLIT_PRD.md`
- `RADAR_SUMMARY_PIPELINE_PRD.md`
- `RADAR_SERVICE_IMPLEMENTATION_LOG.md`
