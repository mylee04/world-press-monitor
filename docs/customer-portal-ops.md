# Customer Portal Ops

This portal now assumes customer-only access through API tokens for World Press Radar.

## Required runtime pieces

1. Web app on Vercel
2. `api-news` server with PostgreSQL access
3. Customer read tokens issued through `NEWS_API_TOKEN_POLICIES`

## Current runtime defaults

- API server command: `bash scripts/run-api-news.sh`
- Mac mini launchd job: `com.wpr.api-news`
- API port: `4100`
- Public anonymous access: disabled via `NEWS_API_ALLOW_PUBLIC_READ_ONLY=0`

Runtime naming defaults:

- prefer `WPR_*` env keys in local and hosted runtime config
- prefer `~/srv/world-press-radar/*` for runtime paths
- prefer `com.wpr.*` for launchd jobs
- legacy env aliases exist only to help older local setups migrate cleanly

## Web app env

Set on Vercel for `app.worldpressradar.com`:

- `NEXT_PUBLIC_NEWS_API_BASE_URL=https://api.worldpressradar.com`
- `WPR_INTERNAL_API_BASE_URL=https://portal-api.worldpressradar.com` (optional, server-only upstream path for portal proxy)

Do not point the production web app at a temporary tunnel URL.
If the public API hostname sits behind stricter Cloudflare rules, keep browser-facing traffic on
`api.worldpressradar.com` and let the portal server use `WPR_INTERNAL_API_BASE_URL` instead.

## API env

Set on the API host for `api.worldpressradar.com`:

- `DATABASE_URL`
- `NEWS_API_HOST=0.0.0.0`
- `NEWS_API_PORT=4100`
- `NEWS_API_ALLOW_PUBLIC_READ_ONLY=0`
- `NEWS_API_CORS_ORIGINS=https://app.worldpressradar.com`
- `NEWS_API_TOKEN`
- `NEWS_API_TOKEN_POLICIES`

## Snapshot artifact policy

Customer dashboard snapshot files under `data/` are fallback artifacts, not the primary data source.
Live upstream/Postgres responses should be preferred whenever they are available.

Commit policy:

- do commit snapshot builder and fallback logic changes
- do not commit regenerated snapshot JSON by default
- only commit snapshot JSON when you explicitly need a repo-tracked fallback payload for deploy/bootstrap/recovery
- if the change is only a fresh `generatedAt` or other rolling timestamp update, leave it out of the commit

Operational rule:

- continue generating snapshots at runtime for fallback use
- treat tracked snapshot files as optional recovery artifacts, not required release content

## Token model

- `NEWS_API_TOKEN`: internal admin token for docs/playground and operational checks
- `NEWS_API_TOKEN_POLICIES`: customer read tokens with per-token rate and scope controls

Recommended issuance model:

- one token per customer company at minimum
- one token per end user if you want precise revocation and audit trails

## Smoke test

Anonymous request should fail:

```bash
curl -i https://<stable-api-host>/api/news
```

Customer request should work:

```bash
curl -i \
  -H "Authorization: Bearer <customer-token>" \
  "https://<stable-api-host>/api/dashboard/summary"
```
