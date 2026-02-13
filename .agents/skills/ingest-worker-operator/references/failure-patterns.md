# Ingest Failure Patterns

## Pattern: no new rows

- Check worker process alive.
- Check DB connectivity and credentials.
- Check source endpoint failures in recent runs.

## Pattern: high failure ratio

- Confirm network/proxy health.
- Reduce fetch concurrency temporarily.
- Retry targeted sources, not full global replay.

## Pattern: stale summary coverage

- Check summary queue backlog and provider errors.
- Reduce summary batch size and retry window if needed.

## Pattern: warm path healthy but ingest stale

- Treat as ingest-lane issue.
- Prioritize worker recovery over cache tuning.
