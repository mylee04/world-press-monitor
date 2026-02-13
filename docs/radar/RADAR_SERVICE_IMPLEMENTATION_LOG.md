# Radar Service Implementation Log

## 2026-02-12

### Completed
- Added Radar API key auth module:
  - `lib/radar-service-auth.ts`
- Added Radar service store/read layer:
  - `lib/radar-service-store.ts`
  - centralizes article reads, country counts, source rollups, ops summary assembly
- Added v1 authenticated read endpoints:
  - `app/api/radar/v1/articles/route.ts`
  - `app/api/radar/v1/country-counts/route.ts`
  - `app/api/radar/v1/sources/route.ts`
  - `app/api/radar/v1/ops/summary/route.ts`
- Added split architecture PRD:
  - [RADAR_SERVICE_SPLIT_PRD.md](./RADAR_SERVICE_SPLIT_PRD.md)
- Added env documentation:
  - `.env.example` includes Radar service API key placeholders
- Added implementation matrix table:
  - [RADAR_IMPLEMENTATION_MATRIX.md](./RADAR_IMPLEMENTATION_MATRIX.md)
- Added detailed DB operations guide:
  - [RADAR_DB_OPERATIONS.md](./RADAR_DB_OPERATIONS.md)
- Added summary pipeline PRD:
  - [RADAR_SUMMARY_PIPELINE_PRD.md](./RADAR_SUMMARY_PIPELINE_PRD.md)
- Added v1 feed/ops expansions:
  - `GET /api/radar/v1/live-feed`
  - `GET /api/radar/v1/ops/domain-metrics`
  - `GET|POST /api/radar/v1/fetch`
- Added legacy compatibility endpoints:
  - `GET /api/radar/articles`
  - `GET /api/radar/sources`
  - `GET /api/radar/ops/summary`
  - `GET /api/radar/ops/domain-metrics`
  - `GET|POST /api/radar/fetch`
- Added cron endpoints:
  - `GET|POST /api/cron/radar`
  - `GET|POST /api/cron/radar-summaries`
  - `GET|POST /api/cron/radar-hourly-discord`
- Added Vercel cron schedule file:
  - `vercel.json` (`*/10`, `*`, `55 * * * *`)
- Added summary pipeline persistence tables:
  - `radar_summary_queue`
  - `radar_summary_usage_daily`
  - `radar_summary_fetch_logs`
- Added queue seeding on ingest:
  - `lib/ingestion-store.ts` (`persistExternalNewsArticles`)
- Added GLM summary worker with retry/cooldown:
  - `lib/radar-summary-worker.ts`
- Fixed GLM response parsing for OpenAI-compatible response envelopes:
  - `lib/radar-summary-worker.ts`
- Fixed cursor-mode count parameter bug for Radar articles keyset pagination:
  - `lib/radar-service-store.ts`

### In Progress
- Contract alignment between PressLab v1 payloads and listening dashboard current payload expectations.

### Next Tasks
1. Add consumer-side proxy routes in listening dashboard to call these PressLab v1 APIs.
2. Add lightweight API request logging (latency + status + client id).
3. Add contract tests for:
   - country filters
   - pagination behavior
   - country code normalization (AR/CL/UY/DO/US)
4. Cut over listening dashboard Radar read paths and disable local Radar write cron.

### Notes
- Existing unrelated local modifications in `presslab` were intentionally untouched.
- Commits for Radar split should include only Radar service files listed above.
