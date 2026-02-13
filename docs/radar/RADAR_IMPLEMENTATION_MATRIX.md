# Radar Implementation Matrix (PressLab Backend)

## Scope
This matrix tracks the gap between requested Radar backend capabilities and actual implementation in `presslab`.

## Status Table
| Item | Status | Implementation |
|---|---|---|
| API key auth for Radar service | Done | `lib/radar-service-auth.ts` |
| API key scopes (`read:*`, `write:*`) | Done | `lib/radar-service-auth.ts` |
| Per-key RPM rate limiting | Done | `lib/radar-service-auth.ts` (`RADAR_SERVICE_RATE_LIMIT_RPM`) |
| `GET /api/radar/v1/articles` | Done | `app/api/radar/v1/articles/route.ts` |
| Keyset cursor pagination (`nextCursor`) | Done | `lib/radar-service-store.ts`, `app/api/radar/v1/articles/route.ts` |
| `GET /api/radar/v1/live-feed` | Done | `app/api/radar/v1/live-feed/route.ts` |
| `GET /api/radar/v1/country-counts` | Done | `app/api/radar/v1/country-counts/route.ts` |
| `GET /api/radar/v1/sources` | Done | `app/api/radar/v1/sources/route.ts` |
| `GET /api/radar/v1/ops/summary` | Done | `app/api/radar/v1/ops/summary/route.ts` |
| `GET /api/radar/v1/ops/domain-metrics` | Done | `app/api/radar/v1/ops/domain-metrics/route.ts` |
| `GET/POST /api/radar/v1/fetch` | Done | `app/api/radar/v1/fetch/route.ts` |
| `GET /api/radar/v1/fetch/ping` | Done | `app/api/radar/v1/fetch/ping/route.ts` |
| Legacy compatibility `GET /api/radar/articles` | Done | `app/api/radar/articles/route.ts` |
| Legacy compatibility `GET /api/radar/sources` | Done | `app/api/radar/sources/route.ts` |
| Legacy compatibility `GET /api/radar/ops/summary` | Done | `app/api/radar/ops/summary/route.ts` |
| Legacy compatibility `GET /api/radar/ops/domain-metrics` | Done | `app/api/radar/ops/domain-metrics/route.ts` |
| Legacy compatibility `GET/POST /api/radar/fetch` | Done | `app/api/radar/fetch/route.ts` |
| Cron endpoint `GET/POST /api/cron/radar` | Done | `app/api/cron/radar/route.ts` |
| Cron endpoint `GET/POST /api/cron/radar-summaries` | Done | `app/api/cron/radar-summaries/route.ts` |
| Cron endpoint `GET/POST /api/cron/radar-hourly-discord` | Done | `app/api/cron/radar-hourly-discord/route.ts` |
| Hourly Discord schedule at `55 * * * *` | Done | `vercel.json` |
| Summary queue table | Done | `db/schema.sql`, `lib/ingestion-store.ts`, `lib/radar-summary-worker.ts` |
| Daily provider usage table | Done | `db/schema.sql`, `lib/radar-summary-worker.ts` |
| Summary fetch logs table | Done | `db/schema.sql`, `lib/radar-summary-worker.ts` |
| Queue seeding during ingest | Done | `lib/ingestion-store.ts` (`persistExternalNewsArticles`) |
| Summary processing with GLM + cooldown | Done | `lib/radar-summary-worker.ts` |
| GLM response envelope parsing hardening | Done | `lib/radar-summary-worker.ts` |
| Cursor pagination count fix | Done | `lib/radar-service-store.ts` |
| v1 cache headers on read endpoints | Done | `app/api/radar/v1/*` |
| DB operations guide (detailed) | Done | [RADAR_DB_OPERATIONS.md](./RADAR_DB_OPERATIONS.md) |
| Summary pipeline PRD | Done | [RADAR_SUMMARY_PIPELINE_PRD.md](./RADAR_SUMMARY_PIPELINE_PRD.md) |

## Notes
- Current Radar SoT in this repository is `external_news_articles` (+ `ingested_articles` as operational index), not `rss_articles`.
- The compatibility layer is implemented so listening dashboard migration can proceed without blocking on internal table naming differences.
