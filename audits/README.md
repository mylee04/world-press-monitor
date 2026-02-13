# Audits

This folder stores generated operational reports.

- `source_daily_counts_YYYY-MM-DD.md`: daily source volume summary snapshots (date-stamped raw files)
- `us_latam_source_health_YYYY-MM-DD.md/.csv`: US+LATAM health audit snapshots
- `expansion_promotion_YYYY-MM-DD.md`: promotion decision snapshots
- `latest.md`: consolidated and tracked report snapshot for PR review

For cleaner git history, only `latest.md` is tracked by default. Date-stamped MD inputs are intentionally not tracked and can be regenerated locally when needed.

## Kept files
- `latest.md` (single tracked source of truth for audit reports)
- `source_daily_counts_YYYY-MM-DD.csv`
- `us_latam_source_health_YYYY-MM-DD.csv`

Generation:
- `bun run report:daily-sources`
- `bun run audit:daily-sources`
