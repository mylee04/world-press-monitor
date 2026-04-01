# Country News Benchmark Plan

## Goal

Build a country-level news publishing benchmark for World Press Radar that answers:

- How many articles are we observing per country over daily, weekly, and monthly windows?
- How much of that observed volume looks trustworthy and timely?
- How concentrated is each country's output in a small number of outlets?
- How complete does our coverage look, given known missing or blocked major publishers?
- How does our observed volume compare to external monitoring systems used only as sanity checks?

The benchmark is not an "official total number of articles published in a country".
It is an observed publishing benchmark with explicit confidence metadata.

## Why This Matters

- There is no universal official statistic for "articles published per country per day".
- Existing global datasets are good for monitoring but weak as a domestic-only benchmark.
- WPR already has the main building blocks:
  - article-level storage in `news_articles`
  - source-country attribution through `source_country`
  - source health observations in `rss_health_status`
  - public export infrastructure in `scripts/export-public-news-data.ts`

If implemented well, this becomes both:

- an internal coverage and operations benchmark
- a public benchmark other people can use, cite, and compare against

## Product Positioning

Use the label `observed publishing benchmark`.

Avoid labels such as:

- official volume
- total national output
- comprehensive national article count

Every published benchmark view should include three layers:

1. `Observed output`
2. `Coverage confidence`
3. `Known blind spots`

## Core Semantics

Benchmark grouping key:

- Primary key: `news_articles.source_country`
- Display code: atlas country code from `data/rss-atlas.json`
- `news_articles.country` is not used as the main benchmark dimension because it behaves like article geo country, not outlet country

Article eligibility:

- Must pass existing article-quality filters already applied by export and reporting paths
- Must not be excluded by `isKnownNonArticleUrl()`
- Must not have a low-signal title

Time semantics:

- `published24h`: `publication_datetime` within last 24 hours
- `inserted24h`: `created_at` within last 24 hours
- `fresh24h`: both `publication_datetime` and `created_at` within last 24 hours
- `late24h`: `created_at` within last 24 hours but `publication_datetime` older than 24 hours
- `firstSeen1h`: `created_at` within last 1 hour

Cadence semantics:

- `daily`: country snapshot for a trailing 24h interpretation and a calendar-day interpretation
- `weekly`: 7-day rolling aggregate plus calendar-week aggregate
- `monthly`: 30-day rolling aggregate plus calendar-month aggregate

Trust semantics:

- A benchmark number is always paired with source-health and coverage context
- A country with high observed volume but poor source health is not "high confidence"

## Non-Goals

- Do not claim exact national article totals
- Do not mix source-country and article-geo-country into the same top-line metric
- Do not block the benchmark on perfect external reference data
- Do not wait for every missing major publisher to be solved before shipping v1

## Existing System References

Current code that should be treated as the starting point:

- `scripts/report-news-by-country-discord.ts`
- `scripts/export-public-news-data.ts`
- `lib/public-data.ts`
- `db/schema.sql`

Relevant tables already available:

- `news_articles`
- `rss_health_status`
- `ingest_ops_hourly`
- `ingest_ops_daily`

Relevant existing columns:

- `news_articles.source_country`
- `news_articles.country`
- `news_articles.publication_datetime`
- `news_articles.created_at`
- `rss_health_status.source`
- `rss_health_status.country`
- `rss_health_status.ok`
- `rss_health_status.health_classification`
- `rss_health_status.attempted`

## Benchmark Metrics

### Country Output Metrics

These are the main public-facing metrics.

- `published24h`
- `inserted24h`
- `fresh24h`
- `late24h`
- `lateShare`
- `firstSeen1h`
- `published7d`
- `published30d`
- `published7dAvg`
- `published30dAvg`
- `published7dMedian`
- `published30dMedian`
- `dayOverDayDelta`
- `weekOverWeekDelta`

### Coverage and Reliability Metrics

These are required to keep the benchmark honest.

- `atlasSourceCount`
- `activeSources24h`
- `attemptedSources24h`
- `okSources24h`
- `failedSources24h`
- `okRate24h`
- `sitemapOnlySourceCount`
- `rssOnlySourceCount`
- `mixedSourceCount`
- `knownMissingMajorCount`
- `blockedMajorCount`

### Concentration Metrics

These tell us whether country volume is broad or overly dependent on a few outlets.

- `top1OutletShare24h`
- `top5OutletShare24h`
- `top10OutletShare24h`
- `articlesPerActiveSource24h`
- `largestOutlet24h`

### External Sanity Metrics

These are comparison indices, not truth.

- `externalObserved24h`
- `externalObserved7d`
- `externalObserved30d`
- `externalRatio24h`
- `externalRatio7d`
- `externalRatio30d`
- `externalDivergenceFlag`

## Confidence Model

Each country gets a confidence label and a numeric score.

Suggested v1 confidence inputs:

- source health success rate
- number of active sources in last 24h
- top outlet concentration
- blocked major count
- known missing major count
- share of sitemap-only mixed sources

Suggested output:

- `confidenceScore`: `0-100`
- `confidenceTier`: `high`, `medium`, `low`
- `confidenceNotes`: short machine-generated reasons

Example logic:

- `high`
  - `okRate24h >= 0.9`
  - at least moderate source breadth
  - no severe concentration problem
  - no large unresolved blocked-major list
- `medium`
  - healthy enough to publish but has visible blind spots
- `low`
  - small source set, high failure rate, or known major gaps

## Trust Layer and Blind Spots

Every country benchmark should support a small structured note set:

- `blockedMajors`
- `knownMissingMajors`
- `mixedSourcesIncluded`
- `sportsHeavySourcesIncluded`
- `portalHeavySourcesIncluded`
- `staleSourceReplacementsRecent`

These should exist in public output in summary form and in internal output in full detail.

## Proposed Storage Model

Add benchmark snapshot tables instead of overloading `news_articles`.

### `country_benchmark_daily`

Purpose:

- Primary daily benchmark record per country

Suggested columns:

- `day_bucket date not null`
- `country text not null`
- `country_code text not null`
- `metric_version text not null`
- `atlas_version text null`
- `published_24h integer not null default 0`
- `inserted_24h integer not null default 0`
- `fresh_24h integer not null default 0`
- `late_24h integer not null default 0`
- `late_share numeric not null default 0`
- `first_seen_1h integer not null default 0`
- `published_7d integer not null default 0`
- `published_30d integer not null default 0`
- `published_7d_avg numeric not null default 0`
- `published_30d_avg numeric not null default 0`
- `published_7d_median numeric not null default 0`
- `published_30d_median numeric not null default 0`
- `atlas_source_count integer not null default 0`
- `active_sources_24h integer not null default 0`
- `attempted_sources_24h integer not null default 0`
- `ok_sources_24h integer not null default 0`
- `failed_sources_24h integer not null default 0`
- `ok_rate_24h numeric not null default 0`
- `top1_outlet_share_24h numeric not null default 0`
- `top5_outlet_share_24h numeric not null default 0`
- `top10_outlet_share_24h numeric not null default 0`
- `confidence_score numeric not null default 0`
- `confidence_tier text not null default 'low'`
- `blocked_major_count integer not null default 0`
- `known_missing_major_count integer not null default 0`
- `generated_at timestamptz not null default now()`
- primary key on `(day_bucket, country_code, metric_version)`

### `country_benchmark_hourly`

Purpose:

- Intraday operations, alerting, and near-real-time monitoring

Suggested columns:

- `hour_bucket timestamptz not null`
- `country text not null`
- `country_code text not null`
- `metric_version text not null`
- `published_24h integer not null default 0`
- `inserted_24h integer not null default 0`
- `fresh_24h integer not null default 0`
- `late_24h integer not null default 0`
- `first_seen_1h integer not null default 0`
- `attempted_sources_24h integer not null default 0`
- `ok_sources_24h integer not null default 0`
- `failed_sources_24h integer not null default 0`
- `generated_at timestamptz not null default now()`
- primary key on `(hour_bucket, country_code, metric_version)`

### `country_benchmark_source_daily`

Purpose:

- Source-level contribution and concentration analysis

Suggested columns:

- `day_bucket date not null`
- `country text not null`
- `country_code text not null`
- `source text not null`
- `outlet_id text null`
- `metric_version text not null`
- `published_24h integer not null default 0`
- `inserted_24h integer not null default 0`
- `fresh_24h integer not null default 0`
- `late_24h integer not null default 0`
- `latest_health_ok boolean null`
- `latest_health_classification text null`
- `generated_at timestamptz not null default now()`
- primary key on `(day_bucket, country_code, source, metric_version)`

### `country_benchmark_external_daily`

Purpose:

- Store external sanity values without mixing them into core numbers

Suggested columns:

- `day_bucket date not null`
- `country text not null`
- `country_code text not null`
- `provider text not null`
- `metric_version text not null`
- `observed_24h integer null`
- `observed_7d integer null`
- `observed_30d integer null`
- `notes text null`
- `generated_at timestamptz not null default now()`
- primary key on `(day_bucket, country_code, provider, metric_version)`

## Aggregation Pipeline

### Phase A: Internal Snapshot Builder

Create a new script:

- `scripts/build-country-benchmark-snapshots.ts`

Responsibilities:

- compute hourly country snapshot
- compute daily country snapshot
- compute source concentration snapshot
- write benchmark tables

Data sources:

- `news_articles`
- `rss_health_status`
- atlas metadata from `data/rss-atlas.json`

### Phase B: Backfill

Create:

- `scripts/backfill-country-benchmark.ts`

Responsibilities:

- backfill daily rows for at least 90 days
- rebuild source concentration history
- optionally rebuild hourly rows for a short recent window

Recommended initial backfill:

- daily: 90 days
- hourly: 14 days

### Phase C: Public Export

Extend:

- `scripts/export-public-news-data.ts`
- `lib/public-data.ts`

New outputs:

- `benchmark-manifest.json`
- `country-benchmarks-latest.json`
- `country-benchmarks-30d.json`
- `country-benchmark-<CC>.json`
- `benchmark-sources-<CC>-latest.json`
- `external-sanity-<CC>.json`

### Phase D: Internal UI

Prefer internal validation first.

Suggested first view:

- top-line country benchmark table
- confidence tier
- top outlet concentration
- source health rollup
- known blind spots
- 7d and 30d trend charts

## External Sanity Check Design

### Goal

Use an external system to detect suspicious divergence, not to define truth.

### Candidate Providers

- GDELT `sourcecountry` based monitoring
- Google News country sample counts or outlet-sample counts

### Rules

- Store external counts separately
- Compare only after smoothing
- Show divergence ratio and direction
- Never override core WPR values with external values

Suggested flags:

- `normal`
- `low_vs_external`
- `high_vs_external`
- `external_unavailable`

Suggested thresholds:

- warning when 7d ratio moves outside a configured band
- critical when ratio stays outside the band for multiple days

## Public Data Contract

Add benchmark-specific public types in `lib/public-data.ts`.

Suggested new interfaces:

- `PublicCountryBenchmark`
- `PublicCountryBenchmarkLatest`
- `PublicCountryBenchmarkSeriesPoint`
- `PublicCountryBenchmarkSourceShare`
- `PublicCountryBenchmarkExternalReference`

Suggested public fields:

- country
- countryCode
- published24h
- fresh24h
- inserted24h
- late24h
- lateShare
- published7dAvg
- published30dAvg
- activeSources24h
- okRate24h
- top5OutletShare24h
- confidenceTier
- confidenceScore
- blockedMajorCount
- knownMissingMajorCount
- externalRatio7d
- notes

## Validation Plan

### Parity Checks

New benchmark snapshots must match current reporting logic for core metrics.

Validate against:

- `scripts/report-news-by-country-discord.ts`

Required parity:

- `published24h`
- `fresh24h`
- `late24h`
- top-country ordering

### Dataset Checks

- all configured countries emit benchmark rows
- no countries disappear unexpectedly
- benchmark output remains stable when no atlas change occurred
- metric version and atlas version are always populated

### Manual Review

Review at least:

- a high-volume country
- a medium-volume country
- a low-volume country
- a country with known blocked majors
- a country with many sitemap-only sources

## Rollout Order

### Milestone 1: Spec and Schema

Deliverables:

- this plan document
- benchmark semantics document if split later
- DB migration for benchmark tables

Exit criteria:

- schema accepted
- metric names fixed
- confidence model agreed

### Milestone 2: Internal Snapshot Builder

Deliverables:

- hourly and daily benchmark builder
- source daily contribution builder
- parity check script

Exit criteria:

- benchmark matches current Discord report for core metrics
- no unexplained discrepancies

### Milestone 3: Backfill

Deliverables:

- 90-day daily benchmark history
- recent hourly history

Exit criteria:

- trend series populated
- no missing-country gaps in normal periods

### Milestone 4: Public Export

Deliverables:

- benchmark JSON outputs
- benchmark manifest extensions

Exit criteria:

- static export contains benchmark artifacts
- artifacts are consumable without database access

### Milestone 5: Internal Dashboard

Deliverables:

- internal benchmark view
- drilldown by country
- source concentration and health view

Exit criteria:

- operators can understand low-volume countries without opening SQL

### Milestone 6: External Sanity Layer

Deliverables:

- external reference ingestion
- divergence calculation
- external comparison UI or export

Exit criteria:

- divergence alerts are interpretable
- external data is clearly labeled as reference-only

## Versioning Rules

Every benchmark snapshot should include:

- `metric_version`
- `atlas_version`
- `generated_at`

Reason:

- atlas growth changes the benchmark structurally
- metric logic may change later
- historical comparisons must stay explainable

## Open Questions

- How should `atlas_version` be derived in practice: commit SHA, atlas file hash, or both?
- Should public benchmark export include full source-level breakdown or only top-N sources?
- Should weekly and monthly values be rolling-window only, calendar-window only, or both?
- Should confidence notes be fully machine-generated, manually curated, or hybrid?
- Which external provider should ship first for sanity checks?

## Recommended Immediate Next Step

Do not start UI work first.

Start with:

1. benchmark DB migration
2. internal snapshot builder
3. parity validation against the current country Discord report

That path gives the fastest proof that the benchmark is numerically trustworthy before we expose it publicly.
