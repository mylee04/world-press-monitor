# RSS and Sitemap Quality Playbook

Last updated: 2026-04-01
Owner: World Press Radar
Status: Active working rules

## Purpose

This document exists to prevent the same quality mistakes from repeating when we expand `data/rss-atlas.json`.

The goal is not to maximize raw article count at any cost.
The goal is to keep country benchmarks and map views fair, readable, and hard-news-heavy.

This playbook should be used whenever we:

- add a new RSS feed
- add a new sitemap
- decide whether to keep a portal surface
- decide whether to disable a source
- add new URL filters in `lib/article-url-filters.ts`

## Core Rule

`More volume` is not automatically `better coverage`.

Reject or trim a source when it causes one of these problems:

- portal inflation
- section skew
- same-site duplicate surfaces
- low-signal titles
- image/photo/article duplicate URLs
- non-article pages inside sitemaps

## Decision Order

Always use this order.

1. Confirm the endpoint is official.
2. Check recent 24h volume.
3. Check sample titles.
4. Check URL path distribution.
5. Check whether the source overlaps with another endpoint from the same brand.
6. Decide one of:
   - keep as-is
   - keep but filter paths
   - keep sitemap only
   - keep RSS only
   - disable entirely

## What Counts as a Problem

### 1. Portal Inflation

A source is inflating the country when it is mainly a portal surface, aggregator surface, or syndicated layer rather than a direct newsroom surface.

Typical symptoms:

- one brand suddenly contributes a very large share of a country's total
- sample titles are mostly global wire or syndicated content
- several paginated portal sitemaps dominate the top sources list

Preferred action:

- disable the portal surface entirely
- or keep only the narrowest official surface if quality is clearly acceptable

### 2. Section Skew

A source is skewing the country when it is mostly:

- sports
- celebrity/showbiz
- lifestyle
- astrology
- autos
- gossip
- viral/community content

Preferred action:

- if the entire source is sports/soft: disable it
- if the brand has strong general-news value but soft subsections are mixed in: filter the paths

### 3. Same-Site Duplicate Surfaces

A source is duplicating the country when the same brand is counted through:

- RSS plus sitemap for the same broad feed
- latest sitemap plus full sitemap that largely overlap
- an English feed plus the same English sitemap
- category pages plus all-news page for the same article URLs

Preferred action:

- keep the cleaner source
- usually prefer sitemap over broad RSS when sitemap titles and URLs are better
- disable the redundant surface

### 4. Broken Title Quality

A source is low-quality when titles arrive as:

- `Full`
- article IDs
- slug fragments
- code-like strings

Preferred action:

- if repair is unrealistic or the source is still low-signal after repair, disable it

### 5. Photo / Image / Mirror URL Dupes

A sitemap is low-quality when it emits multiple URLs for the same story:

- `/photo/`
- `/gazo/`
- `/images/`
- article and gallery variants

Preferred action:

- filter those path patterns
- if the site still remains too noisy, disable the source

## Rules of Thumb

### Prefer sitemap over RSS when:

- RSS is broad and sitemap is already attached to the same source
- sitemap has cleaner article URLs
- sitemap avoids homepage or section-page noise
- sitemap gives stronger recency coverage

### Prefer RSS over sitemap when:

- sitemap is stale or mostly archive pages
- sitemap is blocked but RSS is live
- sitemap titles are broken while RSS titles are clean

### Disable instead of filtering when:

- the source is almost entirely sports/entertainment/soft
- title quality is fundamentally broken
- the source exists mainly as a portal shell
- duplication is structural, not path-specific

## Country Casebook

Use these as precedents.

### Taiwan

Problem:

- `Yahoo Taiwan - News Sitemap p0/p1/p2` dominated the country benchmark
- portal surfaces produced a large share of country output

Action:

- disabled `Yahoo Taiwan - News Sitemap p0/p1/p2`
- filtered `TVBS` soft sections

Reason:

- country benchmark was being driven by portal pagination rather than direct newsroom output

### United States

Problem:

- `Sports Illustrated` sat unusually high in the country top list

Action:

- disabled `Sports Illustrated`
- added `Reuters - News Sitemap Index`
- added `NewsNation`

Reason:

- this was not a lack-of-feeds problem alone; a sports vertical was overrepresented relative to broad general news

### United Kingdom

Problem:

- `Daily Mail`, `Mirror`, `Express` mixed large soft/tabloid sections into country totals

Action:

- kept the sources
- filtered soft sections in `lib/article-url-filters.ts`

Examples of filtered sections:

- showbiz
- celebrity
- lifestyle
- tv
- 3am
- travel
- finance where it behaves like soft content

Reason:

- the brands still have real hard-news value, so full disablement would be too aggressive

### Japan

Problem:

- `Sponichi` was sports-heavy and emitted duplicate article forms
- `Abema Times` was dominated by entertainment/anime/photo and multi-language duplicates
- `Oricon` title quality was effectively broken
- `Yomiuri Latest` duplicated `Yomiuri - Full Sitemap`

Action:

- disabled `Sponichi - Recent Sitemap`
- disabled `Abema Times - Latest Sitemap`
- disabled `Oricon - News Sitemap`
- disabled `Yomiuri Latest`

Reason:

- these were not small path issues; they were structural quality issues

### Argentina

Problem:

- sports and soft sections were overrepresented

Action:

- disabled `Olé`
- disabled `TyC Sports`
- disabled `MDZ Online - Deportes`
- disabled `C5N` soft sections such as `RatingCero`, `Deportes`, `Autos`, `Astrología`, `Lifestyle`
- disabled `Ámbito - Deportes`
- disabled `Ámbito - Autos`
- disabled `Página/12 - Deportes`

Reason:

- country benchmark should reflect general publishing activity, not sports/soft vertical strength

### South Korea

Problem:

- remaining issue was mostly same-brand duplicate surfaces, not soft-category distortion

Action:

- removed redundant broad RSS when sitemap already covered the same surface
- disabled duplicate sitemap surfaces such as `Yonhap Korea - News Sitemap 6`
- converted some all-site mixed sources to sitemap-only

Reason:

- Korean benchmark was mostly healthy already; the task was fairness through deduplication, not aggressive pruning

### Singapore

Problem:

- low-signal residuals from feature, city-guide, lifestyle, or forum-like content

Action:

- filtered `Zaobao` cityreading pages
- filtered `ThinkChina` feature/cartoon/video series paths
- filtered `HardwareZone` entertainment/audio/home/cars/events pages

Reason:

- the market is concentrated; quality cleanup matters more than raw-count inflation

## Review Checklist for a New Source

Before adding a new source, check all of these.

- Official endpoint confirmed from site/robots/sitemap/RSS
- Recent 24h article count is non-trivial or strategically valuable
- Sample titles look like real article titles
- Sample URLs are article pages, not section pages
- No obvious `photo`, `gallery`, `video`, `gazo`, `amp`, `tag`, or `author` noise
- No obvious same-brand overlap with an already enabled source
- No obvious soft-only section problem
- If it is a portal or aggregator, local-news share is high enough to justify inclusion

## Review Checklist for an Existing Country

When a country's total looks suspiciously high or low, run this audit.

1. List top sources by last 24h volume.
2. Measure top-1 and top-3 share.
3. Pull sample titles and URLs for the top suspicious sources.
4. Decide whether the issue is:
   - portal inflation
   - sports/soft skew
   - duplicate surfaces
   - title quality failure
5. Fix using:
   - atlas `enabled: false`
   - source `url: null` to keep sitemap only
   - `lib/article-url-filters.ts`
6. Regenerate:
   - `data/rss-catalog.csv`
   - `data/rss-catalog.opml`
7. Re-run:
   - `bun scripts/rss-country-coverage.ts --country='...'`
   - `npm run typecheck`

## Default Biases

When uncertain, bias toward these decisions.

- prefer fewer cleaner sources over more inflated sources
- prefer direct newsroom surfaces over portal layers
- prefer general-news surfaces over sports/celebrity-only surfaces
- prefer disabling a broken source over keeping a misleading one
- prefer explicit path filters over vague assumptions

## Files to Update When Fixing Quality

- `data/rss-atlas.json`
- `lib/article-url-filters.ts`
- `data/rss-catalog.csv`
- `data/rss-catalog.opml`

Optional verification output:

- `audits/rss-country-coverage-latest.json`

## Why This Matters for the Product

These decisions affect:

- country benchmark fairness
- map country rankings
- publisher comparisons
- source health and coverage interpretation

If the atlas is not disciplined, the product looks more complete than it really is.
If the atlas is disciplined, lower numbers are acceptable because they are more honest.
