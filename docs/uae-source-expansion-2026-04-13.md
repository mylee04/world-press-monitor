# United Arab Emirates Source Expansion - 2026-04-13

## Baseline

- Pre-add baseline:
  - `audits/uae-current-pre-add-20260413.json`
  - `966 unique / 24h`
  - `1192 raw / 24h`

## Official Endpoints Rechecked

- `The National`
  - robots advertises both direct news sitemap and news sitemap index
  - kept the existing direct news sitemap because the index produced the same 24h volume
- `Arabian Business`
  - robots advertises `sitemap_index.xml`
  - Cloudflare-gated in direct fetches, but recoverable with the browser sitemap helper
- `WAM`
  - robots advertises per-language `news.xml` and `articles/current.xml`
  - accepted the English news sitemap
- `Sharjah24`
  - robots advertises `sitemap.xml` and `NewsSitemap.xml`
  - accepted the direct news sitemap

## Batch 1 Candidates

- Candidate file:
  - `data/uae-volume-batch1-candidates-20260413.json`
- Raw isolated coverage:
  - `audits/uae-volume-batch1-coverage-20260413.json`
  - `285 unique / 24h`
- Clean isolated coverage:
  - `audits/uae-volume-batch1-clean-coverage-20260413.json`
  - `260 unique / 24h`

Candidate output:

- `Sharjah24 - News Sitemap`: `90 / 24h`
- `WAM English - News Sitemap`: `63 / 24h`
- `Arabian Business`: `54 / 24h` after filtering
- `The National - News Sitemap Index`: `53 / 24h`

Interpretation:

- `WAM` and `Sharjah24` are the real new-volume additions.
- `Arabian Business` sitemap improves redundancy and sitemap coverage, but after filtering it settles at the same `54 / 24h` the RSS feed was already producing.
- `The National` news sitemap index matched the existing direct news sitemap and was not adopted.

## Quality Notes

- `Arabian Business` sitemap index mixed section and live landing URLs with article URLs.
- Added filters for:
  - `/abnews`
  - section landing pages under `/business`, `/finance`, `/real-estate`, `/t-magazine`, `/world`
  - `/live-*`
- Without those filters, the candidate probe inflated `Arabian Business` from `54 -> 79 / 24h`.
- `Sharjah24` is bilingual and the sitemap mixes `/ar/` and `/en/` article URLs.
  - This is acceptable for country coverage expansion, but it means URL volume grows faster than story-level uniqueness.

## Atlas Updates

- Updated:
  - `Arabian Business` with `sitemapUrl=https://www.arabianbusiness.com/sitemap_index.xml`
- Added:
  - `WAM English - News Sitemap`
  - `Sharjah24 - News Sitemap`

## Current State After Batch 1

- Current full UAE coverage:
  - `audits/uae-current-coverage-20260413.json`
  - `1175 unique / 24h`
  - `1457 raw / 24h`

Interpretation:

- Full current moved from `966 -> 1175 unique / 24h`, a net gain of `+209 unique / 24h`.
- The clean isolated candidate set reported `260 unique / 24h`, but only `WAM` and `Sharjah24` represent real new sources.
- The gap between isolated and full current is expected because:
  - the 24-hour window moved during validation
  - `Arabian Business` sitemap mostly overlapped with the feed once section/live URLs were filtered
  - `The National` index duplicated the already-configured sitemap coverage

## Validation

- `bun run atlas:export-catalog`
  - refreshed `data/rss-catalog.csv` and `data/rss-catalog.opml`
- `bun run typecheck`
  - passed
- `bun run ingest:once -- --country='United Arab Emirates' --sources='WAM English - News Sitemap,Sharjah24 - News Sitemap,Arabian Business'`
  - `endpoints=3`
  - `ok=3`
  - `failed=0`
  - `newsArticles=945`

## Deferred

- `Gulf Business`
  - official site is Cloudflare-gated
  - browser helper was still not producing a stable sitemap fetch during this batch
- `Gulf Today`
  - robots did not advertise a sitemap endpoint
  - direct `sitemap.xml` / `news-sitemap.xml` probes returned HTML rather than XML
  - this was later recovered in batch 2 via HTML collection parsing

## Batch 2: HTML Collection Recovery

- Candidate file:
  - `data/uae-volume-batch2-candidates-20260413.json`
- Paired pre-add candidate coverage:
  - `audits/uae-volume-batch2-preadd-coverage-20260413.json`
  - `+38 raw / unique / 24h`
- Summary:
  - `audits/uae-volume-batch2-summary-20260413.json`

Accepted candidates:

- `Gulf Today - HTML Collection`: `26 / 24h`
- `ARN News Centre - HTML Collection`: `12 / 24h`

Interpretation:

- `Gulf Today` had no usable advertised sitemap, but the `/news` page is a stable dated article collection.
- `ARN News Centre` advertised a sitemap, but it only exposed stale static URLs.
  - the homepage HTML collection was the usable source
  - `publishedAt` is recovered from article pages via `datePublished`

## Batch 2 Atlas Updates

- Added:
  - `Gulf Today - HTML Collection`
  - `ARN News Centre - HTML Collection`

## Current State After Batch 2

- Current full UAE coverage:
  - `audits/uae-current-coverage-20260413.json`
  - `1123 unique / 24h`
  - `1404 raw / 24h`

Interpretation:

- paired against the same-window pre-add atlas run, UAE moved from `1086 -> 1123 unique / 24h`
- that is `+37 unique / 24h` in current full coverage
- isolated batch 2 candidate gain is `+38 unique / 24h`
- the 1-article gap is normal moving-window drift

## Batch 2 Validation

- `bun run ingest:once -- --country='United Arab Emirates' --sources='Gulf Today - HTML Collection,ARN News Centre - HTML Collection'`
  - `endpoints=2`
  - `ok=2`
  - `failed=0`
  - `newsArticles=47`

## Batch 2 Deferred

- `Gulf Business`
  - `robots.txt`, feed, `wp-json`, `post-sitemap.xml`, and `news-sitemap.xml` probes still returned Cloudflare challenge or non-XML responses
  - no production-safe sitemap or HTML collection endpoint was recovered in this pass
