# Category Taxonomy Improvement Plan

## Goal

Reduce the share of articles that end up in `others` or the top-level `general_other` bucket without creating broad overclassification regressions.

This plan is intentionally staged.
The current bottleneck is not only weak classification logic.
It is also missing input signal, especially on sitemap-heavy sources.

## Current Baseline

Measured from `news_articles` over the trailing 24 hours on 2026-04-01:

- Total articles: `204,895`
- Empty `feed_categories`: `150,944` (`73.7%`)
- `primary_section='others'`: `60,534` (`29.5%`)
- Empty `feed_categories` and `others`: `48,944` (`23.9%`)
- `feed_categories` present but still `others`: `11,590 / 53,951` (`21.5%`)

Implication:

- The biggest bucket is missing signal.
- The second bucket is deterministic mapping / heuristic miss.
- AI should not be the first move.

## Guiding Principles

1. Fix the largest recoverable bucket first.
2. Prefer deterministic rules before probabilistic inference.
3. Expand article-page fetching only for sources with clear upside.
4. Measure every change against the same 24h baseline.
5. Optimize for explainability and low regression risk before optimization for recall.

## Non-Goals

- Do not turn on AI classification globally as the first fix.
- Do not tune long-tail countries before the highest-volume offenders.
- Do not add many source-specific rules without a measurable impact case.
- Do not treat `world` as a default dumping ground for unknown categories.

## Where The Current Logic Lives

- `lib/article-taxonomy.ts`
- `lib/keyword-classifier.ts`
- `lib/article-section-context.ts`
- `lib/article-page-section.ts`
- `scripts/ingest-worker.ts`
- `scripts/backfill-source-categories.ts`
- `scripts/backfill-article-sections.ts`
- `scripts/backfill-article-topics.ts`

## Rollout Plan

### Phase 1: Baseline And Ranking

Build a repeatable report that answers:

- Which countries create the most `others` volume?
- Which sources create the most `others` volume?
- Which sources are mostly failing because `feed_categories` is empty?
- Which sources already have `feed_categories` but still land in `others`?
- Which category strings appear most often in `others` rows?

Deliverables:

- `scripts/category-taxonomy-audit.ts`
- `audits/category_taxonomy_audit_latest.json`
- `audits/category_taxonomy_audit_latest.md`

Success criteria:

- The report can be rerun on demand.
- The output clearly separates:
  - missing-signal problems
  - mapping problems

### Phase 2: Deterministic Mapping Expansion

Use the audit output to patch the highest-volume unmapped category strings first.

Expected work:

- Expand `mapFeedCategoryToSection()`
- Expand locale keyword dictionaries under `lib/classifier/locales/`
- Add narrow source-aware mappings only when the category strings are stable

Example candidate strings already observed:

- `Pháp luật`
- `Події`
- `За кордоном`
- `Економіка`
- `От страната и света`
- `كتاب عمون`

Success criteria:

- `feed_categories present but still others` drops materially from `21.5%`
- No obvious surge of false positives into `world`, `politics`, or `business`

### Phase 3: Input Signal Recovery For Sitemap-Heavy Sources

Broaden article-page category extraction only for the highest-yield sources.

Start with cheaper signal recovery before network fetch expansion:

- infer reusable categories from stable path segments on sitemap-heavy sources
- backfill those categories on recent rows
- only fetch article pages for sources where URL structure is not enough

Target shape:

- Add source allowlist entries where page metadata is known to expose usable categories
- Keep fetch budgets bounded
- Prioritize sources that currently combine:
  - high volume
  - empty `feed_categories`
  - high `others` share

Observed candidate groups:

- Denmark sitemap cluster
- Jordan sitemap cluster
- Vietnam sitemap cluster
- Egypt sitemap cluster

Success criteria:

- `feed_categories empty` drops materially from `73.7%`
- `empty feed_categories + others` drops from `23.9%`

### Phase 4: Residual AI Evaluation

Only after deterministic rules and signal extraction are improved:

- isolate the remaining low-confidence cases
- run AI on a bounded sample
- compare cost vs incremental recall

Rules:

- no global enable by default
- no AI on rows that are missing obvious section signals
- use it only for residual ambiguity, not as a replacement for extraction

Success criteria:

- measurable improvement on the remaining residue
- acceptable latency and cost
- no hidden classification drift

## Operational Metrics

Track these after every phase:

- `primary_section='others'` rate
- `feed_categories empty` rate
- `feed_categories present but others` rate
- top 20 sources by `others_count`
- top 20 sources by `empty feed_categories + others`
- top unmapped category strings by article volume

## Proposed Working Order

1. Generate baseline and ranking artifacts.
2. Patch top deterministic category mappings.
3. Recompute `primary_section` and `topics` on affected rows.
4. Re-run the audit.
5. Expand article-page category fallback for top sitemap-heavy offenders.
6. Re-run the audit.
7. Decide whether residual AI fallback is still worth it.

## Current Execution Status

Completed:

- Phase 1 baseline and ranking audit
- first deterministic mapping wave from high-volume unmapped category strings

In progress:

- Phase 3 input-signal recovery for sitemap-heavy sources via path-segment inference

Next:

- apply path-segment recovery to the Denmark sitemap cluster
- re-run taxonomy backfill and audit
- then decide whether the remaining Egypt/Jordan/Vietnam buckets need article-page fetch expansion or locale keyword work
