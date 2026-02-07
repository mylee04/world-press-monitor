# PressLab Global Radar (MVP)

Real-time newsroom monitor built from `prd.md`, adapted from key World Monitor patterns:
- RSS proxy with allowlist
- Sitemap fallback ingestion
- Per-source circuit breaker (5-minute cooldown)
- Two-stage beat classification (keyword instant + async Groq refinement)
- Outlet tier filtering + beat filtering + map view
- Breaking -> Draft -> Distribution workflow (Writing + Distribution tabs)

## Run

```bash
bun install
bun run dev
```

Open `http://localhost:3000`.

## Environment Variables

Copy `.env.example` to `.env.local` and set values as needed.

- `GROQ_API_KEY`: enables async LLM beat refinement.
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`: cache LLM classifications.
- `DATABASE_URL`: PostgreSQL connection string for Writing/Distribution draft persistence.
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
- `APP_BASE_URL`: optional base URL for scripts that call local endpoints; default is `http://localhost:3000`.

## API Endpoints

- `GET /api/news`: aggregate RSS + sitemap + optional GNews breaking + optional Business Radar backup.
- `GET /api/news-cache-health`: cache hit/miss/write counters for `/api/news`.
- `GET /api/news-warm`: warm `/api/news` cache for default-live outlets (24h/6h limits).
- `GET /api/news-warm?mode=status`: return last warm summary without running a new warm cycle.
- `POST /api/ai/draft`: generate Spanish newsroom draft from breaking metadata.
- `POST /api/ai/repurpose`: generate distribution-ready copy (Twitter/Instagram/LinkedIn/TikTok/Newsletter).
- `GET /api/drafts`: list persisted drafts (Postgres; memory fallback if DB is unset).
- `POST /api/drafts`: sync full draft state to persistence.
- `GET /api/ops/ingestion`: 24h ingestion ops summary from PostgreSQL (`ingested_articles` + endpoint run logs).

### Ingestion Metadata Persistence

- `/api/news` now persists deduplicated metadata into PostgreSQL table `ingested_articles`.
- `/api/news` also persists per-endpoint run diagnostics into `ingestion_endpoint_runs` for 24h failure-rate reporting.
- Dedup key: normalized link hash (`link_hash`), with counters:
  - `first_seen_at`
  - `last_seen_at`
  - `seen_count`
- Storage includes: source, title, published time, country/language/sourceType, beat/classification, tags, world_latam flag.
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
- `POST /api/classify-beat`: LLM beat classification with cache fallback.

## Reporting and Alerts

- `bun run report:daily-sources`
  - builds daily US+LATAM CSV/MD report from PostgreSQL (`ingested_articles` + `ingestion_endpoint_runs`)
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
- `bun run warm:once`
  - one-shot warm of `/api/news` cache
- `bun run warm:loop`
  - warm loop every 300s (configurable by `NEWS_WARM_INTERVAL_SEC`)
- `bun run warm:daemon:start`
  - start warm loop in background (PID file: `.warm-daemon.pid`, log: `audits/warm-daemon.log`)
- `bun run warm:daemon:status`
  - check daemon status
- `bun run warm:daemon:logs`
  - tail daemon logs
- `bun run warm:daemon:stop`
  - stop background daemon
- `bun run db:init`
  - apply `db/schema.sql` to your local PostgreSQL (`DATABASE_URL` required)

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
- `publishedAt` is corrected with article meta tags (`article:published_time`, JSON-LD `datePublished`) for top items, then cached.
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
