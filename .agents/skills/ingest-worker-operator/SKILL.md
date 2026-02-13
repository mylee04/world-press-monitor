---
name: ingest-worker-operator
description: Operate PressLab ingestion and warming workers safely and continuously. Use when tasks involve running ingest loops, warm loops, cron scheduling, worker health checks, throughput tuning, stuck-loop recovery, or validating one-shot ingestion and cache warm jobs.
---

# Ingest Worker Operator

Use this skill for always-on ingestion operations and worker control decisions.

## Workflow

1. Identify active runtime mode.
- One-shot or loop.
- Manual shell, daemon, or cron-managed.

2. Check current health.
- Verify process status and recent logs.
- Verify DB ingest freshness and endpoint failures.
- Verify warm/cache path status if relevant.

3. Execute target operation.
- Run `ingest:once` for quick verification.
- Run `ingest:loop` for continuous ingest.
- Run warm loop or daemon operations when cache behavior is relevant.

4. Tune safely.
- Change one knob at a time (`INGEST_*`, warm interval/chunk).
- Re-measure throughput, failure rate, and freshness after each change.

5. Report.
- `Findings`
- `Actions`
- `Validation`
- `Rollback`

## References

- Runtime runbook: `references/runbook.md`
- Failure patterns: `references/failure-patterns.md`
