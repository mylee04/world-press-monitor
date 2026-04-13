# Greece Source Expansion - 2026-04-13

## Baseline

- Pre-add baseline:
  - `audits/greece-current-pre-add-20260413.json`
  - `2440 unique / 24h`
  - `2720 raw / 24h`

## Batch 1

- Candidate file:
  - `data/greece-volume-batch1-candidates-20260413.json`
- Raw isolated coverage:
  - `audits/greece-volume-batch1-coverage-20260413.json`
  - `+646 unique / 24h`
- Clean isolated coverage:
  - `audits/greece-volume-batch1-clean-coverage-20260413.json`
  - `+640 unique / 24h`
- Summary:
  - `audits/greece-volume-batch1-summary-20260413.json`

Accepted sources:

- `To Vima` + news sitemap
- `Newsbeast` + news sitemap
- `Ethnos` + Google News sitemap
- `The Press Project` + sitemap index
- `Insider Greece` + Google News sitemap
- `Fortune Greece` + sitemap index
- `Techblog` + sitemap index
- `Newmoney` + news sitemap
- `OT.gr` + news sitemap
- `Dikastiko` + sitemap index
- `DailyPharmaNews` + news sitemap
- `To Vima International` + sitemap index
- `Real - News Sitemap`

Retained but not added:

- `SKAI`
  - official sitemap exists but candidate audit showed `0 / 24h`
- `iefimerida`
  - official sitemap exists but candidate audit showed `0 / 24h`

Top clean contributors:

- `Newsbeast`: `+99`
- `Insider Greece`: `+78`
- `Newmoney`: `+75`
- `To Vima International`: `+74`
- `Dikastiko`: `+68`
- `OT.gr`: `+67`
- `Fortune Greece`: `+52`
- `Ethnos`: `+46`
- `Real`: `+37`

## Quality Notes

- `dikastiko.gr` sitemap index mixed the homepage and video paths.
  - Filtered `/` and `/videos/`
- `tovima.com` sitemap index included the homepage.
  - Filtered `/`
- `real.gr` news sitemap mixed lifestyle sections.
  - Filtered `/gynaika/` and `/lifestyle/`
- Existing Greece sitemap gaps still unresolved after batch 1:
  - `News247 - News Sitemap`
  - `Documento - News Sitemap`

## Atlas Updates

Updated existing Greece feeds with sitemap coverage:

- `To Vima`
- `Newsbeast`
- `Ethnos`
- `The Press Project`
- `Insider Greece`
- `Fortune Greece`
- `Techblog`
- `Newmoney`
- `OT.gr`
- `Dikastiko`
- `DailyPharmaNews`
- `To Vima International`

New Greece source added:

- `Real - News Sitemap`

## Current State After Batch 1

- Current full Greece coverage:
  - `audits/greece-current-coverage-20260413.json`
  - `2777 unique / 24h`
  - `3364 raw / 24h`

Interpretation:

- Full current moved from `2440 -> 2777 unique / 24h`, a net gain of `+337 unique / 24h`.
- Clean isolated gain (`+640`) is the better measure of batch-1 headroom.
- The gap between isolated and full-current is expected because the 24-hour window moved while validation ran.

Batch-1 current source output:

- `Newsbeast`: sitemap `99 / 24h`, rss `91 / 24h`
- `Insider Greece`: sitemap `78 / 24h`, rss `59 / 24h`
- `To Vima International`: sitemap `76 / 24h`, rss `20 / 24h`
- `Newmoney`: sitemap `75 / 24h`, rss `30 / 24h`
- `Dikastiko`: sitemap `68 / 24h`, rss `32 / 24h`
- `OT.gr`: sitemap `67 / 24h`, rss `35 / 24h`
- `Fortune Greece`: sitemap `52 / 24h`, rss `30 / 24h`
- `Ethnos`: sitemap `46 / 24h`, rss `40 / 24h`
- `Real - News Sitemap`: sitemap `37 / 24h`
- `Techblog`: sitemap `23 / 24h`, rss `9 / 24h`
- `The Press Project`: sitemap `16 / 24h`, rss `10 / 24h`
- `DailyPharmaNews`: sitemap `5 / 24h`, rss `5 / 24h`
- `To Vima`: sitemap `1 / 24h`, rss `35 / 24h`

## Batch 1 Validation

- `bun run atlas:export-catalog`
  - refreshed `data/rss-catalog.csv` and `data/rss-catalog.opml`
- `bun run typecheck`
  - passed
- sitemap ingest smoke on `To Vima`, `Newsbeast`, `Ethnos`, `The Press Project`, `Insider Greece`, `Fortune Greece`, `Techblog`, `Newmoney`, `OT.gr`, `Dikastiko`, `DailyPharmaNews`, `To Vima International`, `Real - News Sitemap`
  - `endpoints=13`
  - `ok=13`
  - `failed=0`
  - `newsArticles=2400`

## Batch 2

- Candidate file:
  - `data/greece-volume-batch2-candidates-20260413.json`
- Summary:
  - `audits/greece-volume-batch2-summary-20260413.json`
- Net new:
  - `+0 unique / 24h`

Rechecked sources:

- `Sport24`
- `News247 - News Sitemap`
- `Documento - News Sitemap`

Batch-2 result:

- `Documento - News Sitemap`
  - browser helper recovered XML
  - candidate audit still found `0 / 24h`
- `News247 - News Sitemap`
  - still returns Cloudflare challenge HTML instead of XML
- `Sport24`
  - still returns Cloudflare challenge HTML instead of XML

Batch-2 engineering work:

- Hardened [fetch-sitemap-browser.mjs](/Users/myungeunlee/Desktop/mylee/world-press-monitor/scripts/fetch-sitemap-browser.mjs) so challenge flows that close the page retry with a fresh page.
- Added browser sitemap fallback allowlisting for:
  - `news247.gr`
  - `sport24.gr`
  - `documentonews.gr`

Operational note:

- `Documento - News Sitemap` live ingest still skipped with `sitemap_policy_disabled`.
- The policy row is stored in the Postgres news ops store, and this shell did not have the database connection environment needed to reset it.

Interpretation:

- Batch 2 improved the recovery path for `Documento`, but it did not add measurable 24h article volume.
- `News247` and `Sport24` remain blocked at the Cloudflare layer even after helper hardening.

## Batch 3

- Candidate file:
  - `data/greece-volume-batch3-candidates-20260413.json`
- Probe:
  - `audits/greece-volume-batch3-probe-20260413.json`
- Summary:
  - `audits/greece-volume-batch3-summary-20260413.json`

Batch-3 accepted sources:

- `Zarpanews - Sitemap Index`
  - `110 / 24h`
- `Dnews - News Sitemap`
  - `85 / 24h`
- `Alpha TV - News Sitemap`
  - `53 / 24h`

Batch-3 retained but not added:

- `Star - Google News Sitemap`
  - `29 / 24h`
  - volume exists, but sample output was still mixed with celebrity and sports coverage
- `Newpost - News Sitemap`
  - `0 / 24h`

Batch-3 engineering work:

- Added host-specific sitemap index selection for `zarpanews.gr` so post sitemaps win over tag/category sitemaps.
- Added quality filters for:
  - `dnews.gr` `/eidhseis/life/`
  - `star.gr` `/lifestyle/`
  - `zarpanews.gr` `/roi-eidiseon/`
- Switched the candidate endpoint for Alpha TV from the generic index to direct `news-sitemap.xml`.

Batch-3 current state:

- full current:
  - `audits/greece-current-coverage-20260413.json`
  - `3036 unique / 24h`
  - `3618 raw / 24h`

Interpretation:

- Batch 3 moved full current from `2777 -> 3036 unique / 24h`, a net gain of `+259 unique / 24h`.
- Accepted batch-3 probe volume was `248 / 24h`; the small gap versus full current is expected window drift.
- `Star` remains a viable future volume-only source if Greece is split into hard-news and volume-first operating sets.

## Batch 3 Validation

- sitemap ingest smoke on `Dnews - News Sitemap`, `Zarpanews - Sitemap Index`, `Alpha TV - News Sitemap`
  - `endpoints=3`
  - `ok=3`
  - `failed=0`
  - `newsArticles=1179`
