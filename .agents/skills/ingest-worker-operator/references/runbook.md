# Ingest/Warm Runbook

## One-shot verification

- `bun run ingest:once`
- `bun run warm:once`

## Continuous loops

- `bun run ingest:loop`
- `bun run warm:loop`

## Daemon control

- `bun run warm:daemon:start`
- `bun run warm:daemon:status`
- `bun run warm:daemon:logs`
- `bun run warm:daemon:stop`

## Cron control

- `bun run cron:status`
- `bun run cron:install`
- `bun run cron:remove`

## Validation targets

- Fresh rows in `external_news_articles`.
- No sustained spike in endpoint failures.
- Acceptable queue growth and recovery.
