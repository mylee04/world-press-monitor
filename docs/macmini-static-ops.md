# WPM Mac mini local ops + static web delivery

This repo now treats the Mac mini as the ingest, storage, export, build, and deploy node.

Operating rules:

- Keep the source database local to the Mac mini.
- Do not expose Postgres or a live read API publicly.
- Publish a static web app plus static JSON/CSV artifacts only.
- Use OneDrive for backup or archive workflows, not app hosting.

## Recommended directory layout

```text
/Users/<user>/srv/world-press-monitor/
  repo/
  postgres/
  exports/
  web-dist/
  logs/
  backups/
```

Repo-side additions:

```text
repo/
  app/
  public/data/
  scripts/
    load-local-env.sh
    setup-launchd-local.sh
    run-ingest-hourly-local.sh
    run-rss-health-daily-local.sh
    run-static-export-local.sh
    run-static-deploy-local.sh
    export-public-news-data.ts
  ops/launchd/
    com.wpm.ingest-hourly.plist
    com.wpm.health-daily.plist
    com.wpm.export-deploy.plist
```

## What changed in code

- `docker-compose.yml` uses a bind mount for Postgres data through `WPM_PGDATA_DIR`.
- `.env.macmini.local` is the primary local-ops env file.
- Local runner scripts no longer auto-load `.env.local`, so stale remote `DATABASE_URL` values cannot win by accident.
- `next.config.ts` now exports a static site.
- `scripts/export-public-news-data.ts` generates:
  - `manifest.json`
  - `sources.json`
  - `by-date/YYYY-MM-DD.json`
  - `by-country/<CODE>/YYYY-MM.json`
  - prebuilt CSV downloads
- `app/` provides `Dashboard`, `Explorer`, `Downloads`, and `Source Health`.

## Launchd schedule

- `com.wpm.ingest-hourly`: minute `25` each hour
- `run-ingest-hourly-local.sh` chains `run-news-country-discord-report.sh` and `run-ingest-ops-hourly.sh` after a successful ingest
- `com.wpm.health-daily`: `00:30 America/Chicago`
- `com.wpm.export-deploy`: minute `40` each hour

Install the launchd jobs from a non-protected runtime path:

```bash
bash scripts/setup-launchd-local.sh install
```

Defaults:

- runtime root: `~/srv/world-press-monitor`
- runtime repo: `~/srv/world-press-monitor/repo`
- launchd target: `~/Library/LaunchAgents`

Do not point launchd at worktrees under `Desktop`, `Documents`, or `Downloads`; macOS background execution can block those paths with `Operation not permitted`.

## Vercel deploy setup

Recommended once per Mac mini:

1. `vercel login`
2. `vercel link --project world-press-monitor`
3. Keep `.vercel/project.json` on that machine
4. Optionally set `VERCEL_TOKEN` in `.env.macmini.local` for headless launchd runs

`scripts/run-static-deploy-local.sh` now behaves like this:

- export public JSON/CSV into `public/data`
- run `next build` with `output: 'export'`
- sync `out/` into `web-dist/`
- run `vercel build --prod` and `vercel deploy --prebuilt --prod` against the linked root project when Vercel CLI and `.vercel/project.json` are present
- use `STATIC_DEPLOY_COMMAND` only when you want to override the default deploy behavior

## Runtime flow

1. `docker compose up -d postgres`
2. `bash scripts/bootstrap-wpm-db.sh`
3. `bash scripts/setup-launchd-local.sh install`
4. `bash scripts/run-rss-health-daily-local.sh`
5. `bash scripts/run-static-export-local.sh`
6. `bash scripts/run-static-deploy-local.sh`

## Public data contract

The static app expects:

- `public/data/manifest.json`
- `public/data/sources.json`
- date shards under `public/data/by-date/`
- country-month shards under `public/data/by-country/`
- CSV files under `public/data/downloads/`

The browser filters locally and can generate ad-hoc CSV from the active result set without querying Postgres.
