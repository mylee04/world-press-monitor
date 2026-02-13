# Audits

This folder stores generated operational reports.

- `source_daily_counts_YYYY-MM-DD.md`: daily source volume summary (DB-backed)
- `source_daily_counts_YYYY-MM-DD.csv`: raw per-source daily table (committed for traceability)
- `us_latam_source_health_YYYY-MM-DD.md/.csv`: US+LATAM health audit outputs

For cleaner git history, only recent generated summaries are tracked.

## Kept files
- Keep latest source count reports for trend comparison.
- Keep latest US/LATAM health report.

Generation:
- `bun run report:daily-sources`
- `bun run audit:daily-sources`
