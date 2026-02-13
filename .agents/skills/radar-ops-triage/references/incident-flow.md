# Radar Incident Flow

1. Validate incident reality.
- Confirm alert window and metric source.
- Check if issue is global or country/source specific.

2. Classify primary failure.
- `ingestion_endpoint_runs` failure spike: source/network lane issue.
- `radar_summary_queue` pending growth: summary worker/provider lane issue.
- stale `external_news_articles.last_seen_at`: ingest scheduler/worker lane issue.

3. Contain first.
- Pause risky config changes.
- Re-run minimal worker path once and re-measure.

4. Recover.
- Apply one change at a time.
- Re-check metrics after each change.

5. Close.
- Confirm recovery in `1h` and `24h` windows.
- Record root cause, fix, and prevention action.
