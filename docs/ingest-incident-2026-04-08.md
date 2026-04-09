# Ingest Incident Memo — 2026-04-08

## Summary

This incident produced two different failure modes in sequence:

1. an hourly ingest run started on `2026-04-08 09:25:26 PM CDT` and later timed out at `2026-04-08 11:15:27 PM CDT`
2. the next scheduled retry started on `2026-04-08 11:25:05 PM CDT` and failed immediately because PostgreSQL could not allocate more shared memory

The combined effect was:

- no fresh hourly Discord country/ops report after the last successful post at `2026-04-08 08:51 PM CDT`
- ingest lag for recent hours, which showed up as weaker recent counts for countries such as South Korea

## Symptoms

- Discord became silent after the last good hourly country/ops report at `2026-04-08 08:51 PM CDT`
- hourly ingest timed out after `6600s` runtime plus `60s` grace
- the next retry failed with PostgreSQL error `No space left on device`
- many old `ingest-worker.ts` processes were still running outside the active hourly run

## Root Causes

### 1. Long-running ingest worker

The hourly ingest run that began at `2026-04-08 09:25:26 PM CDT` did not finish before the runtime budget expired.

Observed consequence:

- no post-ingest hooks ran
- no fresh hourly Discord country/ops report was published from that run

### 2. PostgreSQL shared memory exhaustion

The live Postgres container `repo-postgres-1` had `/dev/shm` at the default small size during the failure window.

Observed consequence:

- the next scheduled retry failed immediately with:

```txt
could not resize shared memory segment "...": No space left on device
```

## What We Checked

- `ingest-hourly-local.log` for exact start, timeout, and retry timestamps
- active `ingest-worker.ts` process inventory
- live runtime repo config under `~/srv/world-press-radar/repo`
- live Postgres container name and `/dev/shm` usage
- current ingest worker CPU usage to distinguish a truly stuck process from an actively progressing one
- token config separately from ingest config, to avoid mixing auth failures with ingest failures

## Fixes Applied

### Runtime config

Added lower ingest budgets in the live runtime env:

- `INGEST_FETCH_CONCURRENCY=12`
- `INGEST_ITEM_MAP_CONCURRENCY=8`
- `INGEST_RSS_LIMIT=1000`
- `INGEST_SITEMAP_LIMIT=750`
- `INGEST_SITEMAP_INDEX_CHILDREN=24`

### PostgreSQL container

Raised container shared memory size:

- `postgres.shm_size: 512mb`

After recreation, `/dev/shm` showed healthy headroom again.

### Process cleanup

Killed old non-hourly `ingest-worker.ts` processes so only the active hourly `--once` run remained.

## Important Lessons

### 1. Silence in Discord does not always mean the reporter is broken

If hourly country/ops Discord stops, check whether ingest finished successfully first.
If ingest never reaches post-ingest hooks, Discord silence is only a downstream symptom.

### 2. Separate long-run ingest failures from DB allocation failures

Two different issues can happen back-to-back:

- one run times out because the worker takes too long
- the next run fails immediately because DB shared memory is exhausted

Treat them as separate failure modes even if they appear in the same hour.

### 3. Check the live runtime repo, not only the workspace

The live launchd jobs run from `~/srv/world-press-radar/repo`.
Local workspace files can be correct while the live runtime repo is still behind.

### 4. Stale workers matter

Long-lived orphaned `ingest-worker.ts` processes increase memory pressure and make diagnosis noisier.
When debugging ingest, inspect and clean old workers before trusting resource symptoms.

### 5. Old logs can mislead

`launchd-ingest-hourly.log` contained an older shell parse error, but the current runtime script passed `bash -n`.
Always compare log timestamps with the current script modification time before assuming the log reflects the active code.

## Runbook For Next Time

1. Check `ingest-hourly-local.log` for exact start and failure timestamps.
2. Check whether the current hourly worker is still running and whether it is consuming CPU.
3. Check for old `ingest-worker.ts` processes and clean them up if they are unrelated to the active hourly run.
4. Check Postgres `/dev/shm` in the live container.
5. Compare workspace config and live runtime repo config.
6. Only after ingest is healthy, judge downstream country counts or Discord silence.

## Current Follow-up Rule

If the current reduced-budget ingest still runs too long, lower the budgets again in `ingest-worker.ts`-driven runtime config rather than assuming the same exact fix is enough.
