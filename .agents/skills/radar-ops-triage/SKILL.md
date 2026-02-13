---
name: radar-ops-triage
description: Triage and recover PressLab Radar ingestion and summary pipeline incidents. Use when tasks involve low ingest volume, stale pipelines, endpoint failures, summary queue backlogs, API latency spikes, or health alert investigation using Radar ops metrics and PostgreSQL checks.
---

# Radar Ops Triage

Use this skill to diagnose and recover Radar operational incidents quickly with DB-backed evidence.

## Workflow

1. Confirm incident scope.
- Identify symptom: ingest drop, queue backlog, failure-rate spike, stale data, or red health.
- Confirm affected window (`1h`, `6h`, `24h`).

2. Run fast checks in order.
- Check ingest freshness and volume.
- Check `ingestion_endpoint_runs` failure ratio.
- Check `radar_summary_queue` status mix.
- Check recent fetch/summary errors.

3. Isolate failure domain.
- Source endpoint problem.
- Worker/cron scheduling problem.
- Database pressure/locking problem.
- External provider quota or timeout problem.

4. Apply smallest safe recovery.
- Restart or re-run specific worker path.
- Reduce batch size or parallelism when under pressure.
- Retry failed subsets instead of full replay.
- Avoid destructive data operations unless explicitly requested.

5. Report with explicit sections.
- `Findings`
- `Actions`
- `Validation`
- `Rollback`

## References

- SQL checks: `references/sql-checks.md`
- Incident decision flow: `references/incident-flow.md`
