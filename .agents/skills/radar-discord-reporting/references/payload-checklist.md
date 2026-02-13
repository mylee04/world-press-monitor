# Discord Payload Checklist

## Build and preview

- `bun run notify:discord-daily:dry`
- `bun run notify:discord-hourly:ops:dry`

## Validate content

- Include ingest volume windows (`1h`, `24h`) where available.
- Include source coverage and failure-rate context.
- Include queue/worker status when relevant.
- Keep message concise and actionable.

## Send

- `bun run notify:discord-daily`
- `bun run notify:discord-hourly:ops`

## Post-send check

- Confirm webhook success and channel visibility.
- Confirm alert severity aligns with current thresholds.
