# PressLab Global Radar (MVP)

Real-time newsroom monitor built from `prd.md`, adapted from key World Monitor patterns:
- RSS proxy with allowlist
- Sitemap fallback ingestion
- Per-source circuit breaker (5-minute cooldown)
- Two-stage beat classification (keyword instant + async Groq refinement)
- Outlet tier filtering + beat filtering + map view

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
- `BUSINESS_RADAR_API_URL` / `BUSINESS_RADAR_API_KEY`: optional backup bulk ingest.
- `DISCORD_WEBHOOK_URL`: Discord webhook for daily ingestion summary notifications.

## API Endpoints

- `GET /api/news`: aggregate RSS + sitemap + optional Business Radar backup.
- `GET /api/rss-proxy?url=...`: edge proxy with domain allowlist.
- `GET /api/sitemap?url=...`: edge sitemap fetch/parser.
- `POST /api/classify-beat`: LLM beat classification with cache fallback.

## Reporting and Alerts

- `bun run report:daily-sources`
  - builds daily US+LATAM CSV/MD report
  - posts summary to Discord automatically (if `DISCORD_WEBHOOK_URL` is set)
- `bun run report:us-latam-health`
  - builds health/failure and KPI report
- `bun run notify:discord-daily:dry`
  - preview Discord payload without sending
- `bun run notify:discord-daily`
  - send latest report summary to Discord

Key KPIs include:
- raw volume vs `15,000/24h` target
- unique by source / unique cross-source
- dedupe rates (within-source, cross-source)
- active newsrooms / distinct domains
- world LATAM coverage ratio
