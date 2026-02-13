# Source Audit Checklist

## Commands

- `bun run report:daily-sources`
- `bun run audit:daily-sources`
- `bun run report:us-latam-health`

## What to inspect

- Per-source volume in `24h`.
- Endpoint failure ratio by source/method.
- Country coverage gaps.
- Duplicate-heavy sources and stale sources.

## Decision gates

- Promote only if stability and signal quality are both acceptable.
- Avoid same-day promote and wide rollout without validation.
