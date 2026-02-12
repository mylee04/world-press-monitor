# Radar Service Split PRD (PressLab as Backend)

## Goal
- Move Radar data ownership to `presslab` only.
- Expose Radar data through authenticated APIs.
- Let consumer apps (e.g. listening dashboard) read from PressLab API instead of direct DB access.

## Why This Split
- Clear ownership: ingestion/quality logic remains your asset in PressLab.
- Better operations: one DB writer path, one schema authority, one monitoring path.
- Faster UI: consumer app reads already-processed rows only.

## Scope
- Included:
  - PressLab Radar read APIs (`/api/radar/v1/*`)
  - API key authentication
  - Documentation for migration steps + implementation log
- Excluded (next phases):
  - Consumer-side proxy replacement in listening dashboard
  - Full contract compatibility layer for every legacy endpoint
  - Write-path deprecation in listening dashboard

## API Surface (Phase 1)
- `GET /api/radar/v1/articles`
  - Query: `country`, `source`, `outletId`, `hours`, `limit`, `offset`
- `GET /api/radar/v1/country-counts`
  - Query: `hours`
- `GET /api/radar/v1/sources`
  - Query: `hours`, `limit`
- `GET /api/radar/v1/ops/summary`
  - Returns ingestion and country coverage summary

## Auth
- Header:
  - `Authorization: Bearer <RADAR_SERVICE_API_KEY>`
  - or `x-api-key: <RADAR_SERVICE_API_KEY>`
- Env:
  - `RADAR_SERVICE_API_KEY` (single key)
  - `RADAR_SERVICE_API_KEYS` (comma-separated rotation keys)

## Data SoT
- Base table: `external_news_articles`
- Auxiliary join table: `ingested_articles`
- Existing ops/quality tables remain in PressLab DB.

## Migration Plan
1. Phase 1 (this commit range):
   - Add backend APIs in PressLab with API key auth.
2. Phase 2:
   - In listening dashboard, replace local `/api/radar/*` DB reads with proxy calls to PressLab APIs.
3. Phase 3:
   - Disable Radar writer jobs in listening dashboard.
4. Phase 4:
   - Add contract tests + latency SLO alerts.

## Operational Notes
- Keep production fallback crawling off in consumer apps.
- Serve from DB/cache only.
- Continue hourly ops alerts from PressLab side.

## Progress Snapshot
- 2026-02-12:
  - Phase 1 implemented.
  - Added v1 APIs (articles/live-feed/country-counts/sources/ops summary/domain metrics/fetch).
  - Added legacy-compatible Radar endpoints.
  - Added cron endpoints and schedules in `vercel.json`.
  - Added summary queue + usage + fetch logs schema and GLM summary worker.
