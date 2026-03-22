# Contributing

Thanks for helping improve World Press Radar.

## Quick start

1. Fork the repository and create a feature branch.
2. Install dependencies:

```bash
bun install
```

3. Set local environment variables in `.env.macmini.local` (`DATABASE_URL`, `WPR_PG_PORT`, etc.). If you need a different env file, set `WPR_ENV_FILE` explicitly.
4. Boot the database:

```bash
bun run db:bootstrap-wpr
```

5. Run health validation:

```bash
bun run rss:health:once
```

6. Update sources and run validation if you changed `data/rss-atlas.json`.

## Adding / fixing RSS sources

- Add or update feeds in `data/rss-atlas.json`.
- Run `bun run rss:health:once` and verify the failure table.
- Export and commit updated catalog files:
  - `bun run atlas:export`
  - `bun run atlas:export-catalog`
- Keep PRs focused and include a short summary of what changed.

## Coding standards

- Keep scripts and core data model changes small and reviewable.
- Prefer deterministic commands and script outputs.
- Keep temporary logs and local run artifacts out of commits.

## Before commit / PR

- Required checks before commit / PR:
  - Local check: `bun run typecheck`
  - Before commit / push: run the same command again
- There is no separate `lint` script yet, so `bun run typecheck` is the CI gate.
