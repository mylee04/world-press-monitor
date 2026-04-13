# Canada Source Expansion - 2026-04-13

## Baseline

- Pre-add baseline:
  - `audits/canada-current-pre-add-20260413.json`
  - `3959 unique / 24h`
  - `8355 raw / 24h`

## Batch 1

- Candidate file:
  - `data/canada-volume-batch1-candidates-20260413.json`
- Raw isolated coverage:
  - `audits/canada-volume-batch1-coverage-20260413.json`
  - `+354 unique / 24h`
- Clean isolated coverage:
  - `audits/canada-volume-batch1-summary-20260413.json`
  - `+350 unique / 24h`

Accepted sources:

- `Winnipeg Free Press` + sitemap index
- `MidlandToday` + news sitemap
- `ElliotLakeToday` + news sitemap
- `BradfordToday` + news sitemap
- `Montreal Gazette` endpoint fix from `sitemap-news.xml` to `news-sitemap.xml`

Top clean contributors:

- `Winnipeg Free Press`: `+239`
- `MidlandToday`: `+40`
- `ElliotLakeToday`: `+32`
- `BradfordToday`: `+30`
- `Montreal Gazette`: `+9`

## Quality Notes

- `Montreal Gazette` was already configured, but the sitemap endpoint was wrong.
  - Old: `https://montrealgazette.com/sitemap-news.xml`
  - Fixed: `https://montrealgazette.com/news-sitemap.xml`
- `BradfordToday`, `ElliotLakeToday`, and `MidlandToday` expose official sitemap URLs in `robots.txt`, but direct HTTP fetches hit Cloudflare.
  - Added those domains to the browser sitemap fallback allowlist.
- `Village Media` local sites mix `good-morning` and `letters-to-the-editor` paths.
  - Filtered `/good-morning/` and `/letters-to-the-editor/`

## Atlas Updates

Updated existing Canada feeds:

- `Montreal Gazette`
- `Winnipeg Free Press`
- `BradfordToday`
- `ElliotLakeToday`
- `MidlandToday`

## Current State After Batch 1

- Current full Canada coverage:
  - `audits/canada-current-coverage-20260413.json`
  - `4255 unique / 24h`
  - `8772 raw / 24h`

Interpretation:

- Full current moved from `3959 -> 4255 unique / 24h`, a net gain of `+296 unique / 24h`.
- Clean isolated gain (`+350`) is the better measure of candidate headroom.
- The gap between isolated and full-current is expected because the 24-hour window moved while the validation ran.

## Supporting Files

- URL filters:
  - `lib/article-url-filters.ts`
- Publisher mappings:
  - `lib/publisher-groups.ts`
- Candidate list:
  - `data/canada-volume-batch1-candidates-20260413.json`
- Summary:
  - `audits/canada-volume-batch1-summary-20260413.json`

## Batch 2

- Candidate file:
  - `data/canada-volume-batch2-candidates-20260413.json`
- Clean isolated coverage:
  - `audits/canada-volume-batch2-clean-coverage-20260413.json`
  - `+248 unique / 24h`
- Summary:
  - `audits/canada-volume-batch2-summary-20260413.json`

Accepted sources:

- `OrilliaMatters` + news sitemap
- `CollingwoodToday` + news sitemap
- `Vancouver Is Awesome` + news sitemap
- `North Shore News` + news sitemap
- `Richmond News` + news sitemap
- `Prince George Citizen` + news sitemap

Retained but not added:

- `Delta Optimist`
  - browser sitemap fetch remained too slow to use reliably

Top contributors:

- `Vancouver Is Awesome`: `+90`
- `North Shore News`: `+52`
- `OrilliaMatters`: `+44`
- `Prince George Citizen`: `+37`
- `CollingwoodToday`: `+31`
- `Richmond News`: `+30`

Batch-2 quality notes:

- `OrilliaMatters` and `CollingwoodToday` reuse the same Village Media pattern as the first batch.
- `Vancouver Is Awesome`, `North Shore News`, `Richmond News`, and `Prince George Citizen` expose `sitemaps/news-sitemap.xml`, but direct HTTP fetches hit Cloudflare.
  - Added those domains to the browser sitemap fallback allowlist.
- `North Shore News` and `Richmond News` mixed `/sponsored/` pages.
  - Filtered `/sponsored/`

Atlas updates in batch 2:

- Added sitemap coverage to existing:
  - `OrilliaMatters`
  - `CollingwoodToday`
  - `Vancouver Is Awesome`
  - `North Shore News`
  - `Richmond News`
  - `Prince George Citizen`

## Current State After Batch 2

- Current full Canada coverage:
  - `audits/canada-current-coverage-20260413.json`
  - `4482 unique / 24h`
  - `9184 raw / 24h`

Interpretation:

- Full current moved from `4255 -> 4482 unique / 24h`, a net gain of `+227 unique / 24h`.
- Combined full current moved from `3959 -> 4482 unique / 24h`, a net gain of `+523 unique / 24h`.
- Batch 2 clean isolated gain was `+248 unique / 24h`.

Batch-2 current source output:

- `Vancouver Is Awesome`: `91 / 24h`
- `North Shore News`: `53 / 24h`
- `OrilliaMatters`: `44 / 24h`
- `Prince George Citizen`: `37 / 24h`
- `CollingwoodToday`: `31 / 24h`
- `Richmond News`: `30 / 24h`

## Batch 2 Validation

- `bun run atlas:export-catalog`
  - refreshed `data/rss-catalog.csv` and `data/rss-catalog.opml`
- `bun run typecheck`
  - passed
- sitemap ingest smoke on `OrilliaMatters`, `CollingwoodToday`, `Vancouver Is Awesome`, `North Shore News`, `Richmond News`, `Prince George Citizen`
  - `endpoints=6`
  - `ok=6`
  - `failed=0`
  - `newsArticles=285`

## Batch 3

- Candidate file:
  - `data/canada-volume-batch3-candidates-20260413.json`
- Raw isolated coverage:
  - `audits/canada-volume-batch3-coverage-20260413.json`
  - `+232 unique / 24h`
- Summary:
  - `audits/canada-volume-batch3-summary-20260413.json`
  - source-level net new floor: `+162 / 24h`

Accepted sources:

- `Delta Optimist` + news sitemap
- `Moose Jaw Today` + news sitemap
- `SaskToday.ca` + news sitemap

Top contributors:

- `Delta Optimist`: sitemap `95 / 24h`, pre-add RSS `20 / 24h`, source-level net new `+75`
- `SaskToday.ca`: sitemap `86 / 24h`, pre-add RSS `20 / 24h`, source-level net new `+66`
- `Moose Jaw Today`: sitemap `41 / 24h`, pre-add RSS `20 / 24h`, source-level net new `+21`

Batch-3 quality notes:

- All three domains are Cloudflare-gated and required browser sitemap fallback allowlisting.
- `Delta Optimist` mixed `/opinion/` pages in the sitemap stream.
  - Filtered `/opinion/`
- `Moose Jaw Today` mixed `/obituaries/`.
  - Filtered `/obituaries/`
- A post-add candidate rerun returned `candidate=0` because the three promoted sources were already part of the live atlas.
  - For batch 3, the stable increment metric is pre-add RSS floor versus current sitemap output for the promoted sources.

Atlas updates in batch 3:

- Added sitemap coverage to existing:
  - `Delta Optimist`
  - `Moose Jaw Today`
  - `SaskToday.ca`

## Current State After Batch 3

- Current full Canada coverage:
  - `audits/canada-current-coverage-20260413.json`
  - `4685 unique / 24h`
  - `9533 raw / 24h`

Interpretation:

- Full current moved from `4482 -> 4685 unique / 24h`, a net gain of `+203 unique / 24h`.
- Combined full current moved from `3959 -> 4685 unique / 24h`, a net gain of `+726 unique / 24h`.
- Batch 3 raw isolated coverage was `+232 unique / 24h`.
- Batch 3 source-level net new floor was `+162 / 24h`.

Batch-3 current source output:

- `Delta Optimist`: sitemap `95 / 24h`, rss `20 / 24h`
- `SaskToday.ca`: sitemap `86 / 24h`, rss `20 / 24h`
- `Moose Jaw Today`: sitemap `41 / 24h`, rss `19 / 24h`

## Batch 3 Validation

- `bun run atlas:export-catalog`
  - refreshed `data/rss-catalog.csv` and `data/rss-catalog.opml`
- `bun run typecheck`
  - passed
- sitemap ingest smoke on `Delta Optimist`, `Moose Jaw Today`, `SaskToday.ca`
  - `endpoints=3`
  - `ok=3`
  - `failed=0`
  - `newsArticles=212`
