# Radar Summary Pipeline PRD

## 1) Objective
Implement a production-safe summary pipeline for Radar articles with:
- `original_context` extraction (public content only),
- `summary_original`,
- `summary_en`,
- queueing, retries, quotas, diagnostics, and cron automation.

## 2) Scope

In scope:
- Summary queue storage and lifecycle.
- GLM-based summarization.
- Daily provider usage limits.
- Retry/backoff and cooldown for rate limits.
- Fetch diagnostics and domain-level ops visibility.

Out of scope:
- paywall/auth bypass or evasion paths,
- archive mirror bypass paths,
- full HTML/body archival of copyrighted pages.

## 3) Data Model

Tables:
- `radar_summary_queue`
- `radar_summary_usage_daily`
- `radar_summary_fetch_logs`

Article fields updated in `external_news_articles`:
- `summary_original`
- `summary_en`
- `summary_source`
- `summary_verified`
- `quality_score` (minimum uplift after successful summary)

## 4) Processing Flow
1. Ingest writes article rows.
2. Ingest enqueues summary candidates to `radar_summary_queue`.
3. Cron calls `/api/cron/radar-summaries`.
4. Worker claims runnable jobs (`pending|error`, `next_retry_at <= now()`).
5. Worker builds context without fetching article pages:
   - uses feed-provided text already stored in DB (RSS/Atom description)
   - does not request the article URL
6. Worker requests GLM summary.
7. Worker writes summaries back to article SoT and updates queue status.
8. Worker writes fetch diagnostics per attempt.

## 5) Provider Strategy
- Provider: GLM only.
- Key: `GLM_API_KEY`.
- Model: `RADAR_GLM_MODEL` (default `glm-4.7-flash`).
- Base URL: `RADAR_GLM_API_BASE_URL`.
- Daily quota: `RADAR_SUMMARY_DAILY_GLM_LIMIT` (default `15000`).

Behavior:
- Quota exhausted: defer queue row (`pending`, retry +60m).
- Provider 429: activate cooldown and defer queue rows.
- Provider timeout/5xx: retry with backoff until max attempts.

## 6) Retry Policy
- Queue states: `pending`, `processing`, `done`, `error`, `skipped`.
- Attempt ceiling: `RADAR_SUMMARY_MAX_ATTEMPTS`.
- Context failures:
  - when feed text is missing/too short, the job is retried/backed off up to max attempts
  - terminal: empty context after retries
- Backoff: exponential minutes capped for stability.
- Cooldown: `RADAR_SUMMARY_RATE_LIMIT_COOLDOWN_MINUTES` (default `1`).

## 7) Cron Schedule
- `GET|POST /api/cron/radar-summaries`: every minute.
- `GET|POST /api/cron/radar-hourly-discord`: minute 55 every hour.

Configured in `vercel.json`.

## 8) Ops Visibility

Outputs:
- `/api/cron/radar-summaries` response includes:
  - claimed/processed/completed/skipped/failed
  - retry/cooldown/quota deferrals
  - fetch outcomes
  - provider usage/errors
  - error samples
- `/api/cron/radar-hourly-discord` posts:
  - ingest 1h summary
  - summary fetch success rate
  - queue backlog
  - major failure categories

## 9) Environment Variables
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
- `CRON_SECRET` or `RADAR_CRON_TOKEN`
- `RADAR_HOURLY_DISCORD_WEBHOOK` or `RADAR_OPS_DISCORD_WEBHOOK`

## 10) Status Table
| Workstream | Status | Code Path |
|---|---|---|
| Queue tables and indexes | Done | `db/schema.sql`, `lib/ingestion-store.ts` |
| Ingest queue seeding | Done | `lib/ingestion-store.ts` |
| GLM summary worker | Done | `lib/radar-summary-worker.ts` |
| Retry/backoff/cooldown | Done | `lib/radar-summary-worker.ts` |
| Summary cron endpoint | Done | `app/api/cron/radar-summaries/route.ts` |
| Hourly Discord summary | Done | `app/api/cron/radar-hourly-discord/route.ts` |
| Domain-level fetch diagnostics | Done | `radar_summary_fetch_logs`, `app/api/radar/v1/ops/domain-metrics/route.ts` |

## 11) Progress Log
- 2026-02-12: queue schema + usage/fetch-log tables added.
- 2026-02-12: ingest path updated to enqueue summary candidates.
- 2026-02-12: GLM summary worker shipped with public-context extraction.
- 2026-02-12: provider error classification, cooldown, and diagnostics added.
- 2026-02-12: cron endpoints + schedule + hourly Discord summary completed.
