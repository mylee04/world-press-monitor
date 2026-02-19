# [PRD] World Press Monitor Core API (Metadata-First)

## 1. Product Definition

World Press Monitor is a backend-first monitoring API.
It ingests RSS/sitemap signals, stores structured metadata, and serves API consumers (dashboards, automations, alerts) without requiring a coupled frontend in this repository.

Core content model is metadata-first:
- headline (`title_original`, optional `title_en`)
- feed description (`summary_original`, optional `summary_en`)
- publication timestamp and section
- country/source metadata
- canonical source URL (link-out)

## 2. Goals

1. Keep global ingest running continuously with clear source health visibility.
2. Serve fast DB-first API responses for article and ops consumers.
3. Preserve legal-safe distribution model: link-out to origin, no full article-body redistribution.
4. Provide transparent per-country source inventory and endpoint status reporting.

## 3. Non-Goals

1. Frontend UI ownership in this repo.
2. Automatic publication to end-user channels.
3. Full-text scraping/republishing pipelines.
4. Circumvention-oriented anti-bot systems.

## 4. Backend Scope

1. Ingestion: RSS + sitemap fetch with endpoint run logs.
2. Storage: PostgreSQL canonical table `external_news_articles`.
3. Serving: API routes under `/api/*` with DB-first reads.
4. Operations: hourly/daily scripts and Discord reporting.
5. Health: machine-readable ops status (`green/yellow/red`) via `/api/ops/health`.

## 5. Source Inventory (Current)

### 5.1 Configured Countries

| Country | Outlets (All) | Outlets (Default Live) | RSS Endpoints (Default Live) | Sitemap Endpoints (Default Live) |
| --- | ---: | ---: | ---: | ---: |
| US | 2342 | 130 | 130 | 4 |
| Argentina | 31 | 31 | 31 | 1 |
| Chile | 27 | 27 | 27 | 1 |
| Uruguay | 22 | 22 | 22 | 0 |
| Dominican Republic | 22 | 22 | 22 | 10 |
| **Total** | **2444** | **232** | **232** | **16** |

Source of truth: `data/outlets.ts` (`OUTLET_FEEDS` + `default_live` preset).

### 5.2 Reporting Requirement

Hourly ops output must always include all configured countries with:
1. `created_1h` and active-source counts.
2. `By Country -> Section -> Source (created_1h)` top line per country.

## 6. Endpoint Health Transparency

Endpoint checks and reports expose operational status categories:

1. `200`: endpoint responded and parsed.
2. `blocked`: endpoint reachable but blocked/forbidden/paywalled/anti-bot limited.
3. `failure`: timeout, transport error, invalid feed/sitemap payload, or parser failure.

Primary commands:
- `bun run audit:daily-sources` (network audit: endpoint-level status)
- `bun run report:daily-sources` (DB-backed volume/quality report)
- `bun run notify:discord-hourly:ops` (global hourly summary)

## 7. API Contract (Core)

1. `GET /api/news`
   - DB-first read from `external_news_articles`.
   - optional live fallback depending on runtime flags.
2. `GET /api/ops/health`
   - status, alerts, ingest/endpoints/breaking/worker metrics.
   - quality object focuses on metadata coverage, not translation quality gating.
3. Radar read endpoints under `/api/radar/v1/*`
   - authenticated external consumption for article/sources/ops views.

## 8. Ops Alerts and Thresholds

Threshold-based alerts prioritize ingest reliability:

1. minimum inserted volume in 1h.
2. max ingest heartbeat gap.
3. max endpoint failure rate in 1h.
4. max breaking queue backlog.
5. max worker stale minutes.

Translation-specific coverage is not used as an alert gate in this mode.

## 9. Deployment Model

1. API serving: Vercel (or equivalent) for request/response endpoints.
2. Worker execution: scheduler-friendly runtime (GitHub Actions, Cloud Run, Railway, VM cron).
3. Fallback for blocked feeds: legal relay/proxy pattern with strict domain allowlist (Railway is acceptable as fallback host).
4. Data policy: metadata + source URL storage, link-out to original publication.

## 10. Success Metrics

1. stable hourly ingest volume and low ingest gaps.
2. low endpoint failure rate by source.
3. complete by-country hourly visibility for all configured countries.
4. high metadata completeness (`title_original`, `summary_original`, `url`, `source`, `publication_datetime`).
5. predictable API latency from DB-first serving.
