# Contributing

Thanks for helping improve World Press Monitor.

## Quick start

1. Fork the repository and create a feature branch.
2. Install dependencies:

```bash
bun install
```

3. Set local environment variables in `.env.local` (`DATABASE_URL`, `WPM_PG_PORT`, etc.).
4. Boot the database (main DB is `wpm`):

```bash
bun run db:bootstrap-wpm
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
