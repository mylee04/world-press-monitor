# PressLab Global Radar (MVP)

Real-time newsroom monitor built from `prd.md`, adapted from key World Monitor patterns:
- RSS proxy with allowlist
- Sitemap fallback ingestion
- Per-source circuit breaker (5-minute cooldown)
- Two-stage section classification (keyword instant + async Groq refinement)
- Outlet tier filtering + section filtering + map view
- Breaking -> Draft -> Distribution workflow (Writing + Distribution tabs)

## Run

```bash
bun install
bun run dev
```

Open `http://localhost:3000`.


### Local PostgreSQL (Docker)

Docker is the easiest way for the whole team to share the same Postgres version.

1. Install Docker Desktop (macOS):

```bash
brew install --cask docker
```

Or download it from:

```text
https://www.docker.com/products/docker-desktop/
```

2. Start Postgres 16:

```bash
docker compose up -d postgres
```

If port `5432` is already in use:

```bash
PRESSLAB_PG_PORT=54321 docker compose up -d postgres
```

3. Set `DATABASE_URL` in `.env.local` (copy from `.env.example`).

Default (if you used port 5432):

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/presslab
```

If you used `PRESSLAB_PG_PORT=54321`:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:54321/presslab
```

4. Schema is applied automatically on first boot. If you need to re-apply it manually:

```bash
docker compose exec -T postgres psql -U postgres -d presslab -f /docker-entrypoint-initdb.d/00_schema.sql
```

Stop the DB:

```bash
docker compose down
```

## Environment Variables

Copy `.env.example` to `.env.local` and set values as needed.

- `GROQ_API_KEY`: enables async LLM section refinement.
- `BEAT_CLASSIFIER_ENABLED`: master switch for AI refinement (`true` by default; set `false` to disable).
- `BEAT_CLASSIFIER_TRIGGER_CONFIDENCE`: threshold above which keyword result is accepted and AI is skipped (default `0.72`).
- `BEAT_CLASSIFIER_MIN_AI_CONFIDENCE`: minimum accepted AI confidence (default `0.58`).
- `BEAT_CLASSIFIER_CACHE_TTL_MS`: LLM result cache TTL in ms (default `21600000`).
- `BEAT_CLASSIFIER_AI_TIMEOUT_MS`: per-call AI timeout in ms (default `3500`).
- `BEAT_CLASSIFIER_AI_CONCURRENCY`: max concurrent AI classify calls (default `8`).
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`: cache LLM classifications.
- `DATABASE_URL`: PostgreSQL connection string for Writing/Distribution draft persistence.
- `INGEST_LOOP_INTERVAL_SEC`: independent ingest loop interval in seconds (default `300`).
- `INGEST_OUTLET_CHUNK_SIZE`: outlets processed per ingest pass (default `360`).
- `INGEST_FETCH_CONCURRENCY`: parallel fetches per ingest pass (default `36`).
- `INGEST_RSS_LIMIT`: per-RSS item cap per pass (default `120`).
- `INGEST_SITEMAP_LIMIT`: per-sitemap item cap per pass (default `80`).
- `GNEWS_API_KEY`: optional GNews overlay feed in `/api/news` (free plan has delayed coverage).
- `GNEWS_BREAKING_ENABLED`: optional toggle (`true` by default; set `false` to disable).
- `ARTICLE_TIME_ENRICH_ENABLED`: optional toggle (`true` by default) to verify `publishedAt` from article meta tags.
- `ARTICLE_TIME_ENRICH_MAX_ITEMS`: max number of top items per request to enrich (default `80`).
- `BUSINESS_RADAR_API_URL` / `BUSINESS_RADAR_API_KEY`: optional backup bulk ingest.
- `DISCORD_WEBHOOK_URL`: Discord webhook for daily ingestion summary notifications.
- `NEWS_CACHE_HEALTH_URL`: cache health endpoint base URL for Discord reporting (`http://localhost:3000` recommended in local).
- `NEWS_WARM_TOKEN`: optional token for `GET /api/news-warm?token=...` protection.
- `NEWS_WARM_CHUNK_SIZE`: optional outlet chunk size for warm jobs (default `120`).
- `NEWS_WARM_INTERVAL_SEC`: loop interval for local warmer script (default `300`).
- `NEWS_WARM_URL`: optional absolute warm endpoint override for `warm:*` scripts.
- `NEWS_WARM_REPORT_URL`: optional warm endpoint override used by Discord report script.
- `NEWS_DB_READ_ENABLED`: DB-first read toggle for `/api/news` (`true` by default; set `false` to force live crawl on every request).
- `NEWS_DB_READ_MODEL`: DB read model for `/api/news` (`external` default, `ingested` optional fallback).
- `NEWS_DB_READ_WINDOW_HOURS`: default DB read window for `/api/news` (default `48`, min `6`, max `168`).
- `NEWS_PROD_READ_ONLY`: when `true` in production, `/api/news` never triggers live crawl fallback (read-only serving).
- `NEWS_LIVE_FALLBACK_ENABLED`: global live fallback toggle (`true` default; set `false` to force DB-only responses).
- `NEWS_WRITE_INGESTED_COMPAT`: compatibility toggle to also write legacy `ingested_articles` (default `false`).
- `APP_BASE_URL`: optional base URL for scripts that call local endpoints; default is `http://localhost:3000`.
- `X_NITTER_BASE_URLS`: optional comma-separated Nitter mirrors for X watch RSS, default `https://nitter.net`.
- `X_RSSHUB_BASE_URLS`: optional comma-separated RSSHub mirrors for fallback (`/twitter/user/:handle`).
- `X_BREAKING_HANDLES`: optional comma-separated X account handles to watch every run.
- default watchlist currently includes 65 major newsroom accounts:
  - 50 US major media accounts
  - 15 Argentina major media accounts
- `X_BREAKING_PRIORITY_HANDLES`: optional comma-separated priority handles for scoring boost.
- `X_BREAKING_PER_HANDLE_LIMIT`: optional per-handle RSS item limit (default `12`).
- `X_BREAKING_SCORE_THRESHOLD`: optional breaking threshold (default `55`).
- `X_PLAYWRIGHT_ENABLED`: optional browser fallback toggle when RSS returns zero (default `true`).
- `X_PLAYWRIGHT_MAX_ACCOUNTS`: max accounts per run for browser fallback (default `10`).
- `X_PLAYWRIGHT_TIMEOUT_MS`: page timeout for browser fallback (default `18000`).
- `X_PLAYWRIGHT_HEADLESS`: browser headless mode for fallback (default `true`).
- `X_PLAYWRIGHT_PRIORITY_ONLY`: only fallback for priority handles (default `true`).
- `OPS_ALERT_MIN_INSERTED_1H`: minimum required new ingested rows in 1h before CRIT (default `100`).
- `OPS_ALERT_MAX_NO_INGEST_MINUTES`: max allowed ingest gap (minutes since last seen external article) before WARN (default `10`).
- `OPS_ALERT_MAX_ENDPOINT_FAILURE_RATE_1H_PCT`: max endpoint failure % in 1h before WARN (default `15`).
- `OPS_ALERT_MAX_QUEUE_NEW_TOTAL`: max allowed breaking queue backlog before WARN (default `500`).
- `OPS_ALERT_MIN_NON_EN_TITLE_COVERAGE_PCT`: minimum non-EN `title_en` coverage before WARN (default `70`).
- `OPS_ALERT_MIN_NON_EN_SUMMARY_COVERAGE_PCT`: minimum non-EN `summary_en` coverage before WARN (default `20`).
- `OPS_ALERT_MAX_WORKER_STALE_MINUTES`: max ingest worker heartbeat age before WARN (default `25`).
- `DISCORD_OPS_ALERT_MENTION`: optional mention prefix for non-green hourly ops alerts (example: `@here`).

## API Endpoints

- `GET /api/news`: DB-first read (default from `external_news_articles`) with optional fallback to live RSS/Sitemap crawl + persist.
- `GET /api/news?mode=fresh`: force live RSS/Sitemap crawl and persistence, bypass DB-read path.
- `GET /api/news?mode=ingest`: force live crawl + persistence with compact response (used by warm/cron).
- `GET /api/news-cache-health`: cache hit/miss/write counters for `/api/news`.
- `GET /api/news-warm`: warm ingestion for default-live outlets by calling `/api/news?mode=ingest` in chunks.
- `GET /api/news-warm?mode=status`: return last warm summary without running a new warm cycle.
- `POST /api/ai/draft`: generate Spanish newsroom draft from breaking metadata.
- `POST /api/ai/repurpose`: generate distribution-ready copy (Twitter/Instagram/LinkedIn/TikTok/Newsletter).
- `GET /api/drafts`: list persisted drafts (Postgres; memory fallback if DB is unset).
- `POST /api/drafts`: sync full draft state to persistence.
- `GET /api/ops/ingestion`: 24h ingestion ops summary from PostgreSQL (`external_news_articles` + endpoint run logs). Requires Radar auth scope `read:ops`.
- `GET /api/ops/health`: machine-readable health status (`green/yellow/red`) with thresholds, alerts, and 1h/24h ops metrics. Requires Radar auth scope `read:ops`.

### Ingestion Metadata Persistence

- `/api/news` persists canonical article metadata into PostgreSQL table `external_news_articles`.
- optional compatibility mode can also write `ingested_articles` (`NEWS_WRITE_INGESTED_COMPAT=true`).
- `/api/news` also persists per-endpoint run diagnostics into `ingestion_endpoint_runs` for 24h failure-rate reporting.
- normalized article record fields:
  - `external_id` (normalized URL hash)
  - `publication_datetime`
  - `section`
  - `title_en`, `title_original`
  - `summary_en`, `summary_original` (feed description best-effort)
  - `country`, `url`, `source`, `is_paywalled`, `language`
  - `created_at`, `last_seen_at`, `seen_count`
- Dedup key: normalized link hash (`link_hash`), with counters:
  - `first_seen_at`
  - `last_seen_at`
  - `seen_count`
- Storage includes: source, title, published time, country/language/sourceType, section classification, tags, world_latam flag.
- Default serving mode is now DB-first:
  - read from `external_news_articles` (enriched record) for low-latency UI loads
  - optional compatibility read mode: `NEWS_DB_READ_MODEL=ingested`
  - fallback to live crawl when DB is empty/outdated/unavailable
  - persist again after fallback crawl
- Ops aggregation includes:
  - unique items 24h
  - duplicate candidates/rate 24h
  - endpoint runs/failure rate 24h
  - top sources by 24h volume
- Apply schema:
  - `bun run db:init`
  - or `psql -d presslab -f db/schema.sql`
- `GET /api/rss-proxy?url=...`: edge proxy with domain allowlist.
- `GET /api/sitemap?url=...`: edge sitemap fetch/parser.
- `POST /api/classify-beat`: section classification with cache fallback.

## Reporting and Alerts

- `bun run report:daily-sources`
  - builds daily US+LATAM CSV/MD report from PostgreSQL (`external_news_articles` + `ingestion_endpoint_runs`)
  - posts summary to Discord automatically (if `DISCORD_WEBHOOK_URL` is set)
  - includes cache health and warm summary
- `bun run audit:daily-sources`
  - full network verification mode (RSS + sitemap probing per source)
  - slower (minutes) but useful for endpoint-level audits and feed health investigations
- `bun run report:us-latam-health`
  - builds health/failure and KPI report
- `bun run notify:discord-daily:dry`
  - preview Discord payload without sending
- `bun run notify:discord-daily`
  - send latest report summary to Discord
- `bun run notify:discord-hourly:ops:dry`
  - preview hourly ops payload without sending
- `bun run notify:discord-hourly:ops`
  - send hourly DB-backed ops summary to Discord:
    - 1h/24h ingest volume
    - configured vs active source coverage
    - per-column quality coverage
    - breaking counts + ratio
    - ingest worker last-run status
- `bun run warm:once`
  - one-shot warm of `/api/news` cache
- `bun run warm:loop`
  - warm loop every 300s (configurable by `NEWS_WARM_INTERVAL_SEC`)
- `bun run ingest:once`
  - one-shot independent ingestion worker (RSS/Sitemap fetch + DB persist, no web server required)
- `bun run ingest:loop`
  - independent ingestion loop every `INGEST_LOOP_INTERVAL_SEC` (default `300`)
- `bun run top10:once`
  - one-shot collection run for `Top 10 Major` preset (major outlets only)
- `bun run top10:loop`
  - continuous collection loop for `Top 10 Major` preset (default every 120s)
  - config:
    - `TOP10_MONITOR_INTERVAL_SEC` (min 60)
    - `TOP10_MONITOR_LIMIT` (default 3000)
- `bun run warm:daemon:start`
  - start warm loop in background (PID file: `.warm-daemon.pid`, log: `audits/warm-daemon.log`)
- `bun run warm:daemon:status`
  - check daemon status
- `bun run warm:daemon:logs`
  - tail daemon logs
- `bun run warm:daemon:stop`
  - stop background daemon
- `bun run x:breaking:once`
  - collect X watchlist posts (via Nitter RSS), score breaking candidates, persist into:
    - `social_breaking_posts`
    - `breaking_queue` (`status='new'` for Writing workflow intake)
  - posts new breaking detections to Discord when `DISCORD_WEBHOOK_URL` is set
  - when RSS sources fail, tries optional Playwright fallback for priority handles
- `bun run enrich:external:once`
  - verify/enrich `external_news_articles`:
    - rules-first: article HTML meta (`publication_datetime`, `summary`)
    - selective AI: Gemini only for priority categories (default `politics,business,tech,security,climate,world`)
    - skips low-priority categories (for example sports) unless explicitly configured
- `bun run cron:install`
  - install local cron jobs:
    - every 5 minutes: independent ingest worker (`ingest:once`)
    - every 5 minutes: X breaking watch once
    - every 10 minutes: external article enrichment pass
    - every hour: hourly ops summary to Discord (`notify:discord-hourly:ops`)
    - every day: daily report + Discord summary
- `bun run cron:status`
  - show installed PressLab cron jobs
- `bun run cron:remove`
  - remove PressLab cron jobs
- `bun run db:init`
  - apply `db/schema.sql` to your local PostgreSQL (`DATABASE_URL` required)
- `bun run report:summary-window --hours 24 --all`
  - report AI summary ratio + source-level added article counts for a time window (`1..168h`)
- `bun run auth:check:radar`
  - run end-to-end auth checks for Radar tokens.
  - token load priority:
    - `.env.local` `RADAR_SERVICE_API_KEYS` (scoped)
    - explicit env vars (`OPS_TOKEN`, `DASH_TOKEN`, `INGEST_TOKEN`)

- `bun run git:check-env-staged`
  - safety guard: fails if `.env`, `.env.local`, `env.local` are staged for commit.

Before pushing, run:

```bash
git add -A
bun run git:check-env-staged
git commit -m "...your message..."
git push
```

Enable local hook automation:

```bash
bun run git:setup-hooks
```

This enables:
- `pre-commit` hook: blocks commit when `.env`, `.env.local`, or `env.local` are staged.
- `pre-push` hook: blocks push when the same files are staged.

Key KPIs include:
- raw volume vs `15,000/24h` target
- unique by source / unique cross-source
- dedupe rates (within-source, cross-source)
- active newsrooms / distinct domains
- world LATAM coverage ratio

## Reporting Performance Note

- `report:daily-sources` is the fast operational report (DB-backed, usually seconds).
- `audit:daily-sources` is the slow audit report (network-backed, usually minutes).

## Notes

- `GNews` is supplementary only in V1. Primary real-time path remains RSS/Sitemap/Google/Bing RSS.
- Radar core ingest is feed/sitemap-first, but optional enrichment paths can fetch article pages for metadata/summary improvements.
  - examples: `ARTICLE_TIME_ENRICH_ENABLED`, `enrich:external:once`
- External enrichment knobs:
  - `EXTERNAL_ENRICH_AI_ENABLED=true|false`
  - `EXTERNAL_ENRICH_AI_MAX_ITEMS=120`
  - `EXTERNAL_ENRICH_AI_CATEGORIES=politics,business,tech,security,climate,world`
  - `EXTERNAL_ENRICH_TRANSLATE_ENABLED=true|false`
  - `EXTERNAL_ENRICH_TRANSLATE_LANGS=es`
  - `EXTERNAL_ENRICH_TRANSLATE_MAX_ITEMS=500`
  - `GEMINI_API_KEY=...`
  - `GEMINI_MODEL=gemini-2.0-flash-lite`
- Translation cache behavior:
  - translation is attempted only when `title_en` or `summary_en` is missing, so already translated rows are skipped.
- Writing tab detects breaking candidates and creates editable Spanish drafts.
- Approving a draft sends it to Distribution with generated platform variants.
- Draft state persistence:
  - preferred: PostgreSQL via `DATABASE_URL`
  - fallback: in-memory + browser local storage when DB is unavailable.
- If Discord shows `Warm run: unavailable`, ensure local app is running and script can reach:
  - `${NEWS_WARM_REPORT_URL}` or
  - `${NEWS_CACHE_HEALTH_URL}`/api/news-warm or
  - `${APP_BASE_URL}`/api/news-warm.

## Deployment Guidance

- For local/dev use, `warm:daemon:*` is the simplest option.
- For production, use platform-native schedulers:
  - Vercel cron, GitHub Actions schedule, Cloud Run job, or system cron.
- Full data stack tools (Docker + Postgres + dbt + Airflow) are useful for ETL/warehouse workloads,
  but are usually overkill for this V1 cache-warm use case.

## Radar Service API (v1)

- PressLab now exposes authenticated Radar read endpoints for external consumers.
- Auth:
  - `Authorization: Bearer <TOKEN>`
  - or `x-api-key: <TOKEN>`
- Env:
  - `RADAR_SERVICE_API_KEYS` (required; comma-separated scoped keys, format `token:scope1|scope2`)
  - `RADAR_SERVICE_RATE_LIMIT_RPM` (default `240`)
- Scope examples:
  - `read:articles`, `read:sources`, `read:ops`, `write:ingest`, `write:summaries`, `read:all`, `*`
- Ops endpoints (`/api/ops/*`, `/api/radar/v1/ops/*`) require `read:ops`.
- Endpoints:
  - `GET /api/radar/v1/articles?country=AR&hours=24&limit=100&offset=0`
  - `GET /api/radar/v1/live-feed?country=AR&hours=24&limit=12`
  - `GET /api/radar/v1/country-counts?hours=24`
  - `GET /api/radar/v1/sources?hours=24&limit=200`
  - `GET /api/radar/v1/ops/summary`
  - `GET /api/radar/v1/ops/domain-metrics?windowHours=24&limit=20`
  - `GET|POST /api/radar/v1/fetch`
  - `GET|POST /api/radar/v1/fetch/ping` (auth-only fast liveness/auth check)

These are intended for UI apps to consume preprocessed DB data without running ingest logic in the request path.

Operational docs:
- `docs/radar/` (Radar architecture, PRDs, and operations references)
  - `docs/radar/RADAR_SERVICE_SPLIT_PRD.md`
  - `docs/radar/RADAR_IMPLEMENTATION_MATRIX.md`
  - `docs/radar/RADAR_DB_OPERATIONS.md`
  - `docs/radar/RADAR_SUMMARY_PIPELINE_PRD.md`
  - `docs/radar/RADAR_SERVICE_IMPLEMENTATION_LOG.md`
- `docs/writing/WRITING_BREAKING_FULLTEXT_PRD.md` (writing full-text draft policy)
- `docs/data-dictionary.md` (column definitions, defaults, and allowed values)

### Radar Cron Endpoints

- `GET|POST /api/cron/radar` (every 10m)
- `GET|POST /api/cron/radar-summaries` (every 1m)
- `GET|POST /api/cron/radar-hourly-discord` (hourly at minute 55)

Cron auth uses:
- `CRON_SECRET` or `RADAR_CRON_TOKEN` (bearer token header).
