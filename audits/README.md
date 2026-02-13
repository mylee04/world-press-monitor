# Audits

This folder stores generated operational reports.

- `source_daily_counts_YYYY-MM-DD.md`: daily source volume summary (DB-backed)
- `source_daily_counts_YYYY-MM-DD.csv`: raw per-source daily table (committed for traceability)
- `us_latam_source_health_YYYY-MM-DD.md/.csv`: US+LATAM health audit outputs
- `expansion_promotion_YYYY-MM-DD.md`: promotion decision evidence snapshot (ad hoc)

For cleaner git history, only the most recent snapshots are tracked. Older files are intentionally pruned and can be regenerated on demand.

## Kept files
- Keep latest source count report for trend comparison.
- Keep latest US/LATAM health report.
- Keep the latest promotion decision snapshot when it exists.

Generation:
- `bun run report:daily-sources`
- `bun run audit:daily-sources`
