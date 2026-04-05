# Secondary taxonomy design

## Goal

Preserve multi-label article meaning without breaking dashboard totals.

The system should store richer section/topic candidates for each article, but customer-facing aggregates must continue to count each article exactly once through a single derived primary section and primary topic.

## Core design

Store two layers:

1. Semantic layer
   - Multi-label section/topic candidates with scores and reasons
   - This is the classification truth

2. Reporting layer
   - One `primary_section`
   - One `primary_topic`
   - This is the aggregation truth

That split lets us represent articles like `politics + business + tech` without double-counting them in charts.

## Recommended storage model

Keep existing columns:

- `primary_section text`
- `primary_topic text`
- `topics text[]`

Add:

- `section_candidates jsonb`
- `topic_candidates jsonb`
- `taxonomy_version text`

Optional later:

- `taxonomy_debug jsonb`

## JSON shapes

### `section_candidates`

```json
[
  {
    "label": "politics",
    "score": 0.93,
    "reasons": ["feed:politics", "title:election", "source:path:/politics/"]
  },
  {
    "label": "business",
    "score": 0.58,
    "reasons": ["title:market", "title:company"]
  },
  {
    "label": "tech",
    "score": 0.41,
    "reasons": ["title:ai"]
  }
]
```

### `topic_candidates`

```json
[
  {
    "section": "politics",
    "label": "elections",
    "score": 0.88,
    "reasons": ["title:election", "feed:politics"]
  },
  {
    "section": "business",
    "label": "markets",
    "score": 0.52,
    "reasons": ["title:stocks", "title:market"]
  },
  {
    "section": "tech",
    "label": "ai",
    "score": 0.44,
    "reasons": ["title:ai"]
  }
]
```

## Why this is better than `secondary_sections text[]`

`secondary_sections text[]` is usable but incomplete.

Problems with that simpler model:

- no score
- no reason trace
- no clear derivation path to `primary_section`
- hard to re-interpret after rule changes
- difficult to audit why a label was attached

Advantages of candidate JSON:

- preserves uncertainty
- explains classification decisions
- makes audits and threshold tuning easier
- lets primary be derived rather than manually duplicated
- supports future UI like `also tagged as`

## Derivation rules

### Primary section

Derive `primary_section` from `section_candidates`.

Rules:

1. Ignore candidate labels with score below threshold.
2. Ignore `others` unless nothing else survives.
3. Pick highest-scoring surviving candidate.
4. If there is a tie, prefer:
   - explicit source override
   - feed category match
   - path match
   - title/snippet lexical match
5. If no candidate survives, use `others`.

### Primary topic

Derive `primary_topic` from `topic_candidates`.

Rules:

1. Only consider topics whose section matches the chosen `primary_section`.
2. Pick highest-scoring topic above threshold.
3. If none survives, set `primary_topic = null`.

### Existing `topics[]`

Short term:

- keep `topics[]`
- treat it as a compatibility field
- populate from candidate topics sorted by score

Long term:

- either deprecate it
- or redefine it as the top normalized topic labels only

## Candidate generation

Extend taxonomy generation so it produces weighted candidates instead of only first-match labels.

### Section candidate sources

- feed category mapping
- source override mapping
- URL path mapping
- title/snippet lexical rules
- known source priors

### Topic candidate sources

- section-specific topic regex matches
- feed category hints
- source/path hints
- title/snippet lexical matches

### Score model

Do not start with ML. Start with deterministic weighted scoring.

Example section score weights:

- source override exact path match: `+0.70`
- source override title pattern: `+0.45`
- feed category exact canonical match: `+0.55`
- feed category multilingual alias: `+0.40`
- URL path section match: `+0.35`
- lexical title/snippet match: `+0.20` each
- strong entity/context pattern: `+0.15`

Example topic score weights:

- exact topic regex hit: `+0.60`
- secondary regex hit: `+0.25`
- feed-topic hint: `+0.20`
- source/path topic hint: `+0.20`

Cap scores at `1.00`.

## API implications

Customer dashboard aggregate APIs should continue to use:

- `primary_section`
- `primary_topic`

No customer-facing aggregate should sum `section_candidates` directly.

Possible future API additions:

- `relatedSections` per article/detail drilldown
- `crossSignalSummary` aggregate based on secondary candidates

## UI implications

### Dashboard

Keep current totals based on `primary_section`.

Possible future additions:

- `Also tagged as` in source detail
- `Cross-signals in this category`
- `Top co-signals for politics`, `Top co-signals for tech`

### Benchmark

No change needed.

Benchmark should remain country-comparison oriented and should not use secondary candidate signals unless a dedicated lens is added later.

## Migration plan

### Phase 1

Schema:

- add `section_candidates jsonb`
- add `topic_candidates jsonb`
- add `taxonomy_version text`

Writers:

- update taxonomy builder to emit candidates
- persist primary fields plus candidate JSON

Readers:

- keep dashboard/benchmark/map unchanged
- they continue using `primary_section` and `primary_topic`

Backfill:

- recompute 31-day window first

### Phase 2

Add internal audit/reporting:

- top secondary section co-signals by primary section
- candidate score distribution
- source-level disagreement rates

### Phase 3

Optional UI:

- article detail `also tagged as`
- aggregate cross-signal cards

## File-level impact

Main files likely to change:

- `/Users/myungeunlee/Desktop/mylee/world-press-monitor/lib/article-taxonomy.ts`
- `/Users/myungeunlee/Desktop/mylee/world-press-monitor/lib/news-write-helpers.ts`
- `/Users/myungeunlee/Desktop/mylee/world-press-monitor/lib/ingestion-store-persistence.ts`
- `/Users/myungeunlee/Desktop/mylee/world-press-monitor/lib/ingestion-store.ts`
- `/Users/myungeunlee/Desktop/mylee/world-press-monitor/lib/news-dashboard-store.ts`
- `/Users/myungeunlee/Desktop/mylee/world-press-monitor/scripts/backfill-article-topics.ts`

Possible schema migration target:

- `/Users/myungeunlee/Desktop/mylee/world-press-monitor/scripts/bootstrap-wpr-db.sh`
- migration SQL path if the repo already has a dedicated schema migration location

## Operational guidance

Do not switch the dashboard to candidate-based counting.

The correct rule is:

- storage can be multi-label
- reporting must remain single-count primary-label

That keeps totals stable while still preserving article complexity.

## Recommendation

Implement this in two steps:

1. add candidate storage and writer/backfill support
2. keep all customer aggregates primary-only until candidate quality is proven

This gives richer taxonomy without reintroducing the old additive confusion problem.
