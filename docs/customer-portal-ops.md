# Customer Portal Ops

This portal now assumes customer-only access through API tokens.

## Required runtime pieces

1. Web app on Vercel
2. `api-news` server with PostgreSQL access
3. Customer read tokens issued through `NEWS_API_TOKEN_POLICIES`

## Current runtime defaults

- API server command: `bash scripts/run-api-news.sh`
- Mac mini launchd job: `com.wpm.api-news`
- API port: `4100`
- Public anonymous access: disabled via `NEWS_API_ALLOW_PUBLIC_READ_ONLY=0`

## Web app env

Set on Vercel:

- `NEXT_PUBLIC_NEWS_API_BASE_URL=https://<stable-api-host>`

Do not point the production web app at a temporary tunnel URL.

## API env

Set on the API host:

- `DATABASE_URL`
- `NEWS_API_HOST=0.0.0.0`
- `NEWS_API_PORT=4100`
- `NEWS_API_ALLOW_PUBLIC_READ_ONLY=0`
- `NEWS_API_CORS_ORIGINS=https://world-press-monitor.vercel.app`
- `NEWS_API_TOKEN`
- `NEWS_API_TOKEN_POLICIES`

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
