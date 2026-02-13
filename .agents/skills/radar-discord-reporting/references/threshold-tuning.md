# Threshold Tuning Checklist

## Core threshold inputs

- `OPS_ALERT_MIN_INSERTED_1H`
- `OPS_ALERT_MAX_NO_INGEST_MINUTES`
- `OPS_ALERT_MAX_ENDPOINT_FAILURE_RATE_1H_PCT`
- `OPS_ALERT_MAX_QUEUE_NEW_TOTAL`
- `OPS_ALERT_MAX_WORKER_STALE_MINUTES`

## Tuning method

- Change one threshold at a time.
- Compare with recent `24h` baseline.
- Avoid tuning that hides true incidents.

## Validation

- Run dry-run notifications after each threshold change.
- Verify expected severity transitions (`green/yellow/red`).
