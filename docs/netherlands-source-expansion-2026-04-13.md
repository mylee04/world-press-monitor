# Netherlands Source Expansion - 2026-04-13

## Baseline

- Pre-add baseline:
  - `audits/netherlands-current-pre-add-20260413.json`
  - `2064 unique / 24h`
  - `2648 raw / 24h`

## Batch 1

- Candidate files:
  - `data/netherlands-volume-batch1-candidates-20260413.json`
  - `data/netherlands-volume-batch1-direct-candidates-20260413.json`
  - `data/netherlands-volume-batch1-mediahuis-candidates-20260413.json`
- Direct candidate audit:
  - `audits/netherlands-volume-batch1-direct-coverage-20260413.json`
  - `+238 unique / 24h`
- Probe files:
  - `audits/netherlands-volume-batch1-direct-probe-20260413.json`
  - `audits/netherlands-volume-batch1-mediahuis-probe-20260413.json`
- Summary:
  - `audits/netherlands-volume-batch1-summary-20260413.json`

Accepted sources:

- `VoetbalPrimeur` + Google News sitemap
- `VI` + Google News sitemap
- `Autoblog` + Google News sitemap
- `FCUpdate` + Google News sitemap

Retained but not added:

- `LC - News Sitemap`
  - official news sitemap worked, but candidate audit showed `0 / 24h`
- `DVHN - News Sitemap`
  - official news sitemap worked, but candidate audit showed `0 / 24h`
- `Noordhollands Dagblad`
- `Haarlems Dagblad`
- `Leidsch Dagblad`
- `IJmuider Courant`
- `Gooi en Eemlander`
  - official Mediahuis news sitemap endpoints were found through `robots.txt`
  - browser-fetched child sitemaps still showed empty `loc`, invalid dates, and repeated future-dated timestamps
  - the same sample titles repeated across multiple regional brands, so this volume was withheld as not production-safe

Top accepted contributors:

- `VoetbalPrimeur`: `+123`
- `VI`: `+56`
- `Autoblog`: `+31`
- `FCUpdate`: `+28`

## Quality Notes

- Added future-date guards in [rss-country-coverage.ts](/Users/myungeunlee/Desktop/mylee/world-press-monitor/scripts/rss-country-coverage.ts) and [ingest-worker.ts](/Users/myungeunlee/Desktop/mylee/world-press-monitor/scripts/ingest-worker.ts) so clearly broken sitemap timestamps do not count as recent articles.
- Added Netherlands URL filters in [article-url-filters.ts](/Users/myungeunlee/Desktop/mylee/world-press-monitor/lib/article-url-filters.ts):
  - `vi.nl/video/`
  - `autoblog.nl/video/`
- Added browser sitemap fallback allowlisting for:
  - `noordhollandsdagblad.nl`
  - `haarlemsdagblad.nl`
  - `leidschdagblad.nl`
  - `ijmuidercourant.nl`
  - `gooieneemlander.nl`
  - `autoweek.nl`

Additional investigation that stayed out of production:

- `AutoWeek`
  - root sitemap could be fetched only through the browser helper
  - the usable news child endpoint was not stable enough for atlas rollout
- `ND`
  - direct and browser fetches still returned anti-bot HTML
- `EW Magazine`
  - direct and browser fetches still returned human-verification HTML

## Atlas Updates

Updated existing Netherlands feeds with sitemap coverage:

- `VI`
- `VoetbalPrimeur`
- `FCUpdate`
- `Autoblog`

## Current State After Batch 1

- Current full Netherlands coverage:
  - `audits/netherlands-current-coverage-20260413.json`
  - `2312 unique / 24h`
  - `2980 raw / 24h`

Interpretation:

- Full current moved from `2064 -> 2312 unique / 24h`, a net gain of `+248 unique / 24h`.
- The direct isolated gain was `+238 unique / 24h`.
- The small gap between isolated and full-current is normal 24-hour window drift.

Batch-1 source output:

- `VoetbalPrimeur`: sitemap `123 / 24h`, rss `24 / 24h`
- `VI`: sitemap `56 / 24h`, rss `20 / 24h`
- `Autoblog`: sitemap `31 / 24h`, rss `22 / 24h`
- `FCUpdate`: sitemap `28 / 24h`, rss `20 / 24h`
- `LC`: sitemap `0 / 24h`, rss `25 / 24h`
- `DVHN`: sitemap `0 / 24h`, rss `25 / 24h`

Operational note:

- `VoetbalPrimeur` Google News XML contained one absurd far-future timestamp.
- The future-date guard kept it out of the effective 24-hour counts, which is why the probe and isolated gain numbers remain usable.

## Batch 1 Validation

- `bun run atlas:export-catalog`
  - refreshed `data/rss-catalog.csv` and `data/rss-catalog.opml`
- `bun run typecheck`
  - passed
- sitemap ingest smoke on `VI`, `VoetbalPrimeur`, `FCUpdate`, `Autoblog`
  - `endpoints=4`
  - `ok=4`
  - `failed=0`
  - `newsArticles=497`

## Batch 2

- Candidate file:
  - `data/netherlands-volume-batch2-candidates-20260413.json`
- Candidate audit:
  - `audits/netherlands-volume-batch2-preadd-coverage-20260413.json`
  - `+553 unique / 24h`
- Summary:
  - `audits/netherlands-volume-batch2-summary-20260413.json`

Batch-2 accepted sources:

- `Noordhollands Dagblad`
- `Haarlems Dagblad`
- `Leidsch Dagblad`
- `IJmuider Courant`
- `Gooi en Eemlander`

Batch-2 accepted contributors:

- `Noordhollands Dagblad`: `+163`
- `Haarlems Dagblad`: `+104`
- `IJmuider Courant`: `+104`
- `Leidsch Dagblad`: `+95`
- `Gooi en Eemlander`: `+87`

Why batch 2 became usable:

- Mediahuis root `sitemap-news.xml` files were valid official endpoints.
- The child `.xml.gz` files still mixed:
  - empty `loc`
  - `Invalid Date`
  - future-dated rows
- Instead of throwing the entire cluster away, host-specific zero-future guards were added for:
  - `noordhollandsdagblad.nl`
  - `haarlemsdagblad.nl`
  - `leidschdagblad.nl`
  - `ijmuidercourant.nl`
  - `gooieneemlander.nl`
- With that guard in place, the effective `0h` usable set still produced `553 / 24h`.

Batch-2 retained but not added:

- `AutoWeek`
  - browser helper could fetch `sitemap/category/news/`
  - but the child sitemap was dominated by brand/model hub URLs
  - usable `24h` article output was only `1`
- `ND`
  - direct and browser fetches of `sitemap.xml`, `sitemap_index.xml`, and `sitemap-news.xml` all resolved to paywall HTML, not XML
- `EW Magazine`
  - direct and browser fetches of `sitemap.xml`, `sitemap_index.xml`, and `sitemap-news.xml` all resolved to AWS WAF captcha HTML

Batch-2 current state:

- full current:
  - `audits/netherlands-current-coverage-20260413.json`
  - `2872 unique / 24h`
  - `3534 raw / 24h`

Interpretation:

- Batch 2 moved full current from `2312 -> 2872 unique / 24h`, a net gain of `+560 unique / 24h`.
- The isolated batch-2 gain was `+553 unique / 24h`.
- The tiny difference is normal 24-hour window drift.

Paired pre-add audit note:

- the batch-2 pre-add/current paired audit measured `2317 -> 2872 unique / 24h`, a net gain of `+555`
- this is the cleaner apples-to-apples comparison for the exact batch-2 run
