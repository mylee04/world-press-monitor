# World Press Radar

World Press Radar is a private news-intelligence service for browsing global coverage through a map and dashboard experience.

It ingests RSS and sitemap feeds, normalizes articles into PostgreSQL, and serves a token-gated customer portal for exploring what publishers are covering by country, source, and topic.

## What The Service Shows

- `Dashboard`
  - summary counts and recent publishing activity
- `Map`
  - country and publisher footprints with geographic drill-down
- `Benchmark`
  - country-level publishing comparisons

The product is meant to feel like a live coverage monitor, not a raw feed dump.

## How It Works

1. RSS and sitemap endpoints are checked and ingested on a schedule.
2. Articles are normalized into PostgreSQL.
3. The customer web app reads from the authenticated `api-news` service.
4. Customers unlock access with issued tokens.

## Core Stack

- Next.js web app
- PostgreSQL storage
- Bun-based ingest and health tooling
- Token-gated API access for customer reads

## Local Runtime Notes

Repo scripts read `.env.local` or `.env.macmini.local` when present.

If multiple Postgres instances run on the same machine, pin the repo DB explicitly instead of relying on `127.0.0.1:5432`.

Example local override:

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:1304/wpr
WPR_PG_PORT=1304
WPM_PG_PORT=1304
WPR_DATABASE_NAME=wpr
WPM_DATABASE_NAME=wpr
```

## Useful Commands

```bash
bun run web:dev
bun run api:news:serve
bun run ingest:once
bun run verify:readme-rss
bun run rss:failure:watchlist
```

## Docs

- customer access: `docs/customer-api-access.md`
- operator notes: `docs/customer-portal-ops.md`
- domain setup: `docs/worldpressradar-domain-setup.md`

## Health Artifacts

RSS verification and watchlist outputs live in:

- `audits/readme_network_precheck_latest.json`
- `audits/readme_rss_health_latest.json`
- `audits/rss_failure_watchlist_latest.json`
- `audits/rss_failure_watchlist_latest.md`
