# Map Snapshots Bottleneck Memo — 2026-04-09

## Summary

`map:snapshots:build` became slow because the snapshot build path was re-running the same full-window metrics queries for each country instead of loading shared metrics once per window and reusing them.

At roughly 72 countries, the pre-fix structure caused repeated full-window reads for every snapshot phase:

- before: `readWindowedSourceMetrics()` about 74 times per window, `readLatestHealthBySource()` about 74 times per window
- after: `readWindowedSourceMetrics()` 2 times per window, `readLatestHealthBySource()` 1 time per window

## Bottleneck

The expensive repeated work came from three places:

1. `scripts/build-map-snapshots.ts` looped per country and called the country-source builder for each country.
2. `lib/map-country-sources-reader.ts` loaded shared metrics and source health again inside each country build.
3. `lib/map-country-metrics-builder.ts` and `lib/map-publishers-builder.ts` also loaded the same shared window-level data independently.

That meant one snapshot window was repeatedly scanning the same underlying metrics instead of treating them as shared inputs.

## Why It Surfaced Now

The inefficiency was already present, but this run happened right after the Postgres container had been recreated and after the shared-memory incident was fixed.

Inference from logs and timing:

- the database cache started cold
- `/dev/shm` had just been corrected and Postgres had only recently come back
- repeated full-window reads that were previously masked by warm cache became visible as minutes-long work

This explanation is an inference from the timing and runtime state. The duplicated query pattern itself is directly confirmed in code.

## Evidence

Recent normal runs showed `map:snapshots:build` finishing in seconds to tens of seconds.

The problem run showed much larger window timings in `ingest-hourly-local.log`:

- `1h elapsedMs=371364`
- `24h elapsedMs=417747`

The main repeated-query path before the fix was:

- `scripts/build-map-snapshots.ts`
- `lib/map-country-sources-reader.ts`
- `lib/map-country-metrics-builder.ts`
- `lib/map-publishers-builder.ts`

## Fix Applied

The build now preloads shared metrics and source-health data once per window, then passes that data into downstream builders.

Changes:

- `scripts/build-map-snapshots.ts`: preload shared metrics and health once per window, then add phase timing logs
- `lib/map-country-metrics-builder.ts`: accept preloaded shared inputs
- `lib/map-country-sources-reader.ts`: accept preloaded shared inputs
- `lib/map-publishers-builder.ts`: accept preloaded shared inputs

Additional runtime action:

- the same code was copied into the live runtime repo so the next scheduled hourly run uses the optimized path

## Validation

- `npm run typecheck` passed after the refactor
- new phase timing logs were added so the next run can be compared directly without extra instrumentation

## Important Note

The hourly run that was already executing when this fix was written started with the old code path, so that run was not expected to speed up.

The improvement should appear starting with the next hourly run after the runtime repo update.

## What To Check Next

On the next hourly run, compare the new phase-level timings in `ingest-hourly-local.log`:

- `source metrics loaded`
- `countries written`
- `country sources snapshot written`
- `publishers written`

If those phases still remain unexpectedly slow, the next step is to inspect the remaining large queries directly and capture `EXPLAIN ANALYZE` for the slowest phase.
