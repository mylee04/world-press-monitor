# Map Portal Refactor Plan

Last updated: 2026-04-02
Source branches: `codex/map-public-web`, `stash@{0}`
Status: Draft working plan

## Goal

Salvage the real map refactor work from the old stash and branch state without reviving the legacy public data and static export surfaces.

This plan keeps:

- portal-first map reads
- snapshot-backed map aggregates
- customer-token portal boundaries

This plan does not restore:

- public downloads surface
- explorer/source-health public pages
- static export pipeline
- generated local artifacts

## Why This Refactor Still Makes Sense

The current product and ops docs already point in this direction:

- `docs/worldpressradar-domain-setup.md` says the browser talks to the portal first and the authenticated API is a separate service.
- `docs/customer-portal-ops.md` assumes token-gated portal reads through the API host.
- `README.md` says the product moved away from shipping large public export payloads.

The stash and branch work are therefore aligned with the current architecture, but they were never cleaned up into a focused merge.

## What To Keep

These files belong to the real refactor and should be reintroduced in a clean branch.

### 1. Portal-first map API flow

- `lib/customer-portal.ts`
- `lib/dashboard-cache-control.ts`
- `app/api/customer/map/countries/route.ts`
- `app/api/customer/map/countries/[country]/sources/route.ts`
- `app/api/customer/map/publishers/route.ts`
- `app/api/customer/map/sources/[sourceId]/route.ts`
- `scripts/api-news.ts`

Intent:

- portal routes proxy map reads through the portal server
- the portal can use an internal server token
- map API caching becomes explicit and separate from private dashboard caching

### 2. Snapshot-backed map reads

- `lib/map-country-metrics-builder.ts`
- `lib/map-publishers-builder.ts`
- `lib/map-snapshot-store.ts`
- `lib/map-country-metrics-reader.ts`
- `lib/map-publishers-reader.ts`
- `lib/map-store.ts`
- `scripts/build-map-snapshots.ts`
- `package.json`
- `scripts/run-ingest-hourly.sh`
- `scripts/run-ingest-hourly-local.sh`

Intent:

- compute country and publisher map payloads once per ingest cycle
- store them in dedicated snapshot tables
- serve snapshot payloads first, with builder fallback only when needed

### 3. Support changes that likely belong with the refactor

These are adjacent to the refactor but should be reviewed as a second pass rather than blindly cherry-picked.

- `app/api/customer/benchmark/route.ts`
- `components/benchmark-view.tsx`
- `components/news-api-hooks.ts`
- `lib/benchmark-store.ts`
- `components/customer-access-panel.tsx`

Intent:

- remove local preview bypasses
- make benchmark reads match token-gated portal behavior
- apply explicit cache policy and client-side session caching

## What To Defer

These are real code changes, but they are not required for the first extraction of the map refactor.

- `lib/ingestion-store-feed-watermarks.ts`
- `lib/ingestion-store-persistence.ts`
- `lib/ingestion-store.ts`
- `scripts/backfill-mothership-publication-datetime.ts`
- `lib/geo.ts`
- `lib/map-store-db.ts`
- `lib/map-store-source-meta.ts`
- `lib/map-country-sources-reader.ts`
- `lib/map-store-locations.ts`
- `scripts/load-local-env.sh`
- `scripts/report-news-by-country-discord.ts`

Why defer:

- some of these are supporting infrastructure
- some are mixed with unrelated ingestion refactors
- some need a separate review to confirm they are still correct against current `develop`

## What To Discard

These should not come back as part of this refactor.

### 1. Legacy public data and static export surface

- `app/downloads/page.tsx`
- `app/explorer/page.tsx`
- `app/source-health/page.tsx`
- `components/downloads-view.tsx`
- `components/explorer-view.tsx`
- `components/public-data-hooks.ts`
- `components/source-health-view.tsx`
- `lib/public-data.ts`
- `scripts/export-public-news-data.ts`
- `scripts/run-static-deploy-local.sh`
- `scripts/run-static-export-local.sh`
- `docs/macmini-static-ops.md`
- `ops/launchd/com.wpm.export-deploy.plist`
- `ops/launchd/com.wpr.export-deploy.plist`

Reason:

- `4cb18ca` already removed the legacy static export pipeline
- `d94599f` already removed the legacy explorer surface
- restoring these would reverse current product direction

### 2. Generated and local-only artifacts

- `.next 2/**`
- `output/playwright/**`
- `output/publisher-headquarters-*.json`
- local runtime snapshots or cache files from stash-only untracked content

Reason:

- these are not source-of-truth code
- they should never be merged from stash recovery

## What Not To Cherry-pick Wholesale

Do not cherry-pick `4bd0f41 feat(map): publish public map portal flow` as-is.

Why:

- it mixes valid map refactor code with unrelated files
- it overlaps with map UI work that is already on `develop`
- it also sits next to old public/static history and support-file churn

Instead, extract the refactor by file group.

## Recommended Merge Order

### Phase 1. Add refactor scaffolding

- `lib/dashboard-cache-control.ts`
- `lib/map-country-metrics-builder.ts`
- `lib/map-publishers-builder.ts`
- `lib/map-snapshot-store.ts`
- `scripts/build-map-snapshots.ts`
- `package.json`

Success criteria:

- typecheck passes
- no behavior change yet on portal routes

### Phase 2. Switch map reads to snapshot-aware services

- `lib/map-country-metrics-reader.ts`
- `lib/map-publishers-reader.ts`
- `lib/map-store.ts`

Success criteria:

- existing `/map` still loads
- snapshot fallback behavior is explicit

### Phase 3. Move portal map routes to proxy-first behavior

- `lib/customer-portal.ts`
- `app/api/customer/map/countries/route.ts`
- `app/api/customer/map/countries/[country]/sources/route.ts`
- `app/api/customer/map/publishers/route.ts`
- `app/api/customer/map/sources/[sourceId]/route.ts`
- `scripts/api-news.ts`

Success criteria:

- portal can read map data through `/api/map/*`
- local dev still works when portal proxy config is absent
- production path is portal-first

### Phase 4. Wire snapshot builds into ingest

- `scripts/run-ingest-hourly.sh`
- `scripts/run-ingest-hourly-local.sh`

Success criteria:

- ingest completes
- snapshot build runs after ingest
- failures warn without silently breaking the ingest loop

### Phase 5. Optional portal hardening follow-up

- `app/api/customer/benchmark/route.ts`
- `components/benchmark-view.tsx`
- `components/news-api-hooks.ts`
- `lib/benchmark-store.ts`
- `components/customer-access-panel.tsx`

Success criteria:

- benchmark auth rules match map auth rules
- local preview bypasses are intentionally removed, not accidentally changed

## Review Checklist Before Merging

- confirm no legacy public/static files are reintroduced
- confirm no generated artifacts are staged
- confirm current map UI files are not overwritten by older branch versions
- verify `npm run typecheck`
- verify `/map/` loads on local dev
- verify `localhost` route behavior with and without portal proxy env
- verify snapshot build script can run without breaking ingest

## Working Rule

Treat this as a selective extraction, not a stash restore.

If a file is not clearly part of:

- portal-first map reads
- snapshot-backed map aggregation
- token-gated portal behavior

it should stay out of the first merge.
