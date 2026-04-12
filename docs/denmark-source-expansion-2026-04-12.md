# Denmark Source Expansion 2026-04-12

## Summary

- Added 10 Denmark sitemap sources to the atlas.
- Kept two candidate queues for later rollout:
  - `hard-news`: `/Users/myungeunlee/Desktop/mylee/world-press-monitor/data/denmark-hard-news-candidates-20260412.json`
  - `volume`: `/Users/myungeunlee/Desktop/mylee/world-press-monitor/data/denmark-volume-candidates-20260412.json`
- Added Denmark-specific non-article URL filters for `campo.dk`, `denoffentlige.dk`, `dagens.dk`, and `nyheder24.dk`.
- Updated catalog export so sitemap-only sources are included in CSV/OPML.

## Added To Atlas

Added in `/Users/myungeunlee/Desktop/mylee/world-press-monitor/data/rss-atlas.json`:

1. `Nyheder.dk - News Sitemap`
2. `Dagens - Sitemap Index`
3. `Nyheder24 - Sitemap Index`
4. `DenOffentlige - Sitemap Index`
5. `Bold - News Sitemap`
6. `Tipsbladet - News Sitemap`
7. `Campo - Sitemap Index`
8. `Se og Hør - Sitemap Index`
9. `BILLED-BLADET - Sitemap Index`
10. `InsideBusiness - Sitemap Index`

## Coverage Validation

Artifacts:

- Pre-add comparison: `/Users/myungeunlee/Desktop/mylee/world-press-monitor/audits/denmark-source-expansion-coverage-pre-add-20260412.json`
- Added-10 isolated coverage: `/Users/myungeunlee/Desktop/mylee/world-press-monitor/audits/denmark-added10-coverage-20260412.json`
- Hard-news isolated coverage: `/Users/myungeunlee/Desktop/mylee/world-press-monitor/audits/denmark-hard-news-coverage-20260412.json`
- Volume isolated coverage: `/Users/myungeunlee/Desktop/mylee/world-press-monitor/audits/denmark-volume-coverage-20260412.json`
- Current full Denmark coverage: `/Users/myungeunlee/Desktop/mylee/world-press-monitor/audits/denmark-current-coverage-20260412.json`

Final audit snapshot on 2026-04-12:

- Existing Denmark before adding the 10 sources: `1,076 unique / 24h`
- Current Denmark after adding the 10 sources: `1,327 unique / 24h`
- Net-new from the Denmark candidate queues after filtering: `249 unique / 24h`
- Exact overlap with the existing Denmark set: `0`
- The small gap between `1,076 + 249` and `1,327` is moving-window drift between separate audit runs.

## Hard-News Set

File:

- `/Users/myungeunlee/Desktop/mylee/world-press-monitor/data/denmark-hard-news-candidates-20260412.json`

Weekend sample:

- Total: `33 unique / 24h`
- Active sources:
  - `Nyheder.dk - News Sitemap`: `24`
  - `DenOffentlige - Sitemap Index`: `9`
- Currently low or zero same-day output:
  - `Danwatch`
  - `InsideBusiness`
  - `FinansWatch`
  - `ShippingWatch`
  - `MedWatch`
  - `AgriWatch`
  - `ITWatch`
  - `PolicyWatch`
  - `DinAvis`

Interpretation:

- Good quality expansion set.
- Not sufficient if the goal is to close the gap toward multi-thousand daily Denmark volume.

## Volume Set

File:

- `/Users/myungeunlee/Desktop/mylee/world-press-monitor/data/denmark-volume-candidates-20260412.json`

Final filtered sample:

- Total: `249 unique / 24h`
- Contribution by source:
  - `Bold - News Sitemap`: `74`
  - `Campo - Sitemap Index`: `54`
  - `Tipsbladet - News Sitemap`: `29`
  - `Dagens - Sitemap Index`: `24`
  - `Nyheder.dk - News Sitemap`: `24`
  - `Nyheder24 - Sitemap Index`: `23`
  - `DenOffentlige - Sitemap Index`: `9`
  - `Se og Hør - Sitemap Index`: `8`
  - `BILLED-BLADET - Sitemap Index`: `4`
  - `InsideBusiness - Sitemap Index`: `0`

Interpretation:

- This is the set that actually moves Denmark volume.
- It is not a hard-news-only set.
- Sports (`Bold`, `Campo`, `Tipsbladet`) drive most of the gain.
- `Dagens`, `Nyheder24`, and `Nyheder.dk` add volume but are clearly softer/tabloid.
- `Se og Hør` and `BILLED-BLADET` are mainly entertainment/royal.

## Quality And Dedup Notes

- Exact dedup risk against the existing Denmark atlas is low in the sampled 24h window:
  - `candidateUnique24h == candidateNewRecent24h == 249`
- `Campo` initially surfaced non-article URLs such as club, player, tag, type, league, and tournament pages.
  - Filter added.
- `DenOffentlige` initially surfaced top-level section pages.
  - Filter added.
- `Dagens` and `Nyheder24` initially surfaced section landing pages and `/skribent/*` author pages.
  - Filter added.
- `Nyheder.dk` titles contain inline HTML markup in the sitemap payload, but the article URLs themselves are usable.

## Ingest Test

Ran Denmark-only ingest against the 10 added sources using `scripts/ingest-worker.ts --once` with explicit source filters.

Observed results:

- First run:
  - `endpoints=10`
  - `ok=10`
  - `failed=0`
  - `newsArticles=1069`
- Second run after final URL-filter cleanup:
  - `endpoints=10`
  - `ok=10`
  - `failed=0`
  - `newsArticles=0`

Interpretation:

- Endpoint connectivity and ingestion path are working for all 10 sources.
- The second run returned `0` because the first run had already advanced the watermarks for those sources; this is expected for an immediate rerun.

## Supporting Code Changes

- URL filters:
  - `/Users/myungeunlee/Desktop/mylee/world-press-monitor/lib/article-url-filters.ts`
- Sitemap-aware catalog export:
  - `/Users/myungeunlee/Desktop/mylee/world-press-monitor/scripts/export-rss-catalog.ts`
- Denmark publisher mappings:
  - `/Users/myungeunlee/Desktop/mylee/world-press-monitor/lib/publisher-groups.ts`
- Regenerated catalog outputs:
  - `/Users/myungeunlee/Desktop/mylee/world-press-monitor/data/rss-catalog.csv`
  - `/Users/myungeunlee/Desktop/mylee/world-press-monitor/data/rss-catalog.opml`

## Batch 2

Second-wave candidate file:

- `/Users/myungeunlee/Desktop/mylee/world-press-monitor/data/denmark-volume-batch2-candidates-20260412.json`

Batch-2 audit artifacts:

- `/Users/myungeunlee/Desktop/mylee/world-press-monitor/audits/denmark-volume-batch2-coverage-20260412.json`
- `/Users/myungeunlee/Desktop/mylee/world-press-monitor/audits/denmark-volume-batch2-vs-current-20260412.json`

Added in batch 2:

1. `Alt om Kendte - News Sitemap`
2. `ALT.dk - Sitemap`
3. `Folkebladet Lemvig - Sitemap`
4. `Nordschleswiger - Sitemap`

Batch-2 isolated volume:

- Total: `17 unique / 24h`
- `Alt om Kendte - News Sitemap`: `6`
- `ALT.dk - Sitemap`: `5`
- `Folkebladet Lemvig - Sitemap`: `3`
- `Nordschleswiger - Sitemap`: `3`

Batch-2 not added:

- `Dagbladet Ringkøbing-Skjern - Sitemap`
  - fetch aborted during audit
- `DK Nyt`, `DK Social`, `DK Teknik og Miljø`, `DK Sundhed`, `DK Indkøb`
  - sitemap indexes resolve, but current audit did not surface usable recent dated articles
- `GAFFA`
  - sitemap is archive-heavy and not current-news oriented

Batch-2 ingest test:

- `endpoints=4`
- `ok=4`
- `failed=0`
- `newsArticles=241`

Current Denmark full-audit after batch 2:

- `1,356 unique / 24h`

## Batch 3

Third-wave candidate file:

- `/Users/myungeunlee/Desktop/mylee/world-press-monitor/data/denmark-volume-batch3-candidates-20260412.json`

Batch-3 audit artifact:

- `/Users/myungeunlee/Desktop/mylee/world-press-monitor/audits/denmark-volume-batch3-coverage-20260412.json`

Batch-3 code changes:

- Removed sitemap `<priority>` fallback from `/Users/myungeunlee/Desktop/mylee/world-press-monitor/lib/parsers.ts`
- Added HTML collection parsing for `nyheder.tv2.dk` in `/Users/myungeunlee/Desktop/mylee/world-press-monitor/lib/parsers.ts`
- Enabled article-page `publishedAt` backfill for the DK Medier family in:
  - `/Users/myungeunlee/Desktop/mylee/world-press-monitor/scripts/rss-country-coverage.ts`
  - `/Users/myungeunlee/Desktop/mylee/world-press-monitor/scripts/ingest-worker.ts`
- Added local-portal URL filters for `dbrs.dk` and `kobenhavnliv.dk` in:
  - `/Users/myungeunlee/Desktop/mylee/world-press-monitor/lib/article-url-filters.ts`

Added in batch 3:

1. `TV2 Nyheder - HTML Collection`
2. `Dagbladet Ringkobing-Skjern - Sitemap`
3. `KobenhavnLIV - Sitemap`

Batch-3 isolated volume:

- Total: `27 unique / 24h`
- `Dagbladet Ringkobing-Skjern - Sitemap`: `11`
- `KobenhavnLIV - Sitemap`: `10`
- `TV2 Nyheder - HTML Collection`: `6`

Batch-3 candidate findings that were not added:

- `DK Nyt - Sitemap Index`
  - date parsing now resolves correctly
  - newest sampled article: `2026-04-10T09:57:00.000Z`
  - current audit contribution: `0 / 24h`
- `DK Social - Sitemap Index`
  - date parsing now resolves correctly
  - newest sampled article: `2026-04-10T09:57:00.000Z`
  - current audit contribution: `0 / 24h`
- `DK Teknik og Miljø - Sitemap Index`
  - date parsing now resolves correctly
  - newest sampled article: `2026-04-11T09:37:00.000Z`
  - current audit contribution: `0 / 24h`
- `DK Sundhed - Sitemap Index`
  - date parsing now resolves correctly
  - newest sampled article: `2026-04-11T16:45:00.000Z`
  - current audit contribution: `0 / 24h`
- `DK Indkøb - Sitemap Index`
  - date parsing now resolves correctly
  - newest sampled article: `2026-04-10T08:45:00.000Z`
  - current audit contribution: `0 / 24h`
- `Danwatch` and `Watch Medier` verticals
  - sitemaps resolve, but this audit window did not add measurable `24h` volume

Batch-3 ingest tests:

- First run exposed the `TV2` HTML-collection path issue while confirming the two local sitemaps ingest:
  - `endpoints=4`
  - `ok=2`
  - `failed=2`
  - `newsArticles=383`
- After the worker-side HTML gate fix for `TV2`, reran the same 3-source batch:
  - `endpoints=3`
  - `ok=3`
  - `failed=0`
  - `newsArticles=24`

Interpretation:

- `Dagbladet Ringkobing-Skjern` and `KobenhavnLIV` already advanced their watermarks on the first run.
- The second run mainly validated that `TV2 Nyheder - HTML Collection` now ingests cleanly.

Current Denmark full-audit after batch 3:

- `/Users/myungeunlee/Desktop/mylee/world-press-monitor/audits/denmark-current-coverage-20260412.json`
- `1,422 unique / 24h`

## Batch 4

Fourth-wave candidate file:

- `/Users/myungeunlee/Desktop/mylee/world-press-monitor/data/denmark-volume-batch4-candidates-20260412.json`

Batch-4 audit artifact:

- `/Users/myungeunlee/Desktop/mylee/world-press-monitor/audits/denmark-volume-batch4-coverage-20260412.json`

Batch-4 code changes:

- Added stable article-id dedupe for `ligeher.nu` URLs in:
  - `/Users/myungeunlee/Desktop/mylee/world-press-monitor/lib/pipeline.ts`
  - `/Users/myungeunlee/Desktop/mylee/world-press-monitor/scripts/rss-country-coverage.ts`
  - `/Users/myungeunlee/Desktop/mylee/world-press-monitor/scripts/ingest-worker.ts`
- Fixed sitemap-index child ordering for month-only paths such as `/2026/4.xml` in:
  - `/Users/myungeunlee/Desktop/mylee/world-press-monitor/scripts/rss-country-coverage.ts`
  - `/Users/myungeunlee/Desktop/mylee/world-press-monitor/scripts/ingest-worker.ts`
  - `/Users/myungeunlee/Desktop/mylee/world-press-monitor/scripts/canada-candidate-priority.ts`

Added in batch 4:

1. `LigeHer - Sitemap Index`
2. `AmagerLIV - Sitemap`
3. `FrederiksbergLIV - Sitemap`
4. `EsbjergLiv - News Sitemap`

Batch-4 isolated volume:

- Total: `46 unique / 24h`
- `LigeHer - Sitemap Index`: `29`
- `AmagerLIV - Sitemap`: `7`
- `FrederiksbergLIV - Sitemap`: `6`
- `EsbjergLiv - News Sitemap`: `4`

Batch-4 candidate findings that were not added:

- `DinAvis - Sitemap Index`
  - sitemap index resolves cleanly
  - still dominated by `/arkiv/*`
  - current audit contribution: `0 / 24h`
  - newest sampled article: `2026-02-20T11:49:53.000Z`
- `AarhusLiv - Sitemap Index`
  - resolves cleanly
  - appears event/lifestyle oriented rather than current local news
  - current audit contribution: `0 / 24h`
  - newest sampled article: `2026-04-08T12:27:45.000Z`

Local-portal research notes:

- `Dit*` portals such as `ditvejle.dk`, `ditkolding.dk`, and `ditodense.dk`
  - rejected
  - WordPress sitemaps expose broken `lastmod` values like `-0001-11-30...`
  - sample URLs look evergreen/SEO lifestyle content rather than current news
- `RoskildeLIV`, `HerningLIV`, `SilkeborgLIV`, and similar `*liv` WordPress sites
  - rejected
  - same broken-date pattern as `Dit*`
  - content sample looks synthetic/lifestyle-heavy
- `EsbjergLiv`
  - kept because it exposes a working `news-sitemap.xml` with recent article timestamps and local-news titles

Batch-4 ingest test:

- `endpoints=4`
- `ok=4`
- `failed=0`
- `newsArticles=561`

Current Denmark full-audit after batch 4:

- `/Users/myungeunlee/Desktop/mylee/world-press-monitor/audits/denmark-current-coverage-20260412.json`
- `1,661 unique / 24h`

## Sitemap Cleanup And Large-News Verification

Filtered sitemap-index candidates:

- `/Users/myungeunlee/Desktop/mylee/world-press-monitor/data/denmark-sitemap-index-clean-candidates-20260412.json`
- `/Users/myungeunlee/Desktop/mylee/world-press-monitor/audits/denmark-sitemap-index-clean-coverage-20260412.json`

Applied URL filters:

- `journalisten.dk`
  - exclude `/jobannoncer/*`
- `meremobil.dk`
  - exclude `/tag/*`
  - exclude `/annonce`
  - exclude `/nyheder`
  - exclude `/seneste-nyheder`
- `mobilsiden.dk`
  - exclude root homepage `/`

Atlas additions from that cleanup:

1. `Mobilsiden` now also includes `https://mobilsiden.dk/sitemap_index.xml`
2. `Meremobil` now also includes `https://meremobil.dk/sitemap_index.xml`

Filtered sitemap-index audit result against RSS-only baseline:

- Total: `3 unique / 24h`
- `Meremobil`: `2`
- `Mobilsiden`: `1`
- `Journalisten`: `0`

Notes:

- `Journalisten` looked promising before filtering, but the recent 24-hour window was entirely `/jobannoncer/*`, so it contributes `0` after cleanup.
- Because of that `0 / 24h` result, `Journalisten` was audited but not kept as a sitemap-backed atlas source.
- `Meremobil` retains two clean article URLs after removing tag, ad, and section sitemap noise.
- `Mobilsiden` retains one clean article URL, and the homepage entry is explicitly filtered to avoid false freshness later.

Large clean news-sitemaps verified:

- `/Users/myungeunlee/Desktop/mylee/world-press-monitor/data/denmark-berlingske-bt-news-sitemap-candidates-20260412.json`
- `/Users/myungeunlee/Desktop/mylee/world-press-monitor/audits/denmark-berlingske-bt-news-sitemap-coverage-20260412.json`

Verification method:

- built a temporary Denmark baseline with `Berlingske` and `BT` removed
- re-ran coverage with just their official `news-sitemap.xml` endpoints as candidates

Result:

- Combined: `295 unique / 24h`
- `BT`: `177`
- `Berlingske`: `118`

Operational note:

- `Berlingske` and `BT` were already present in the atlas as sitemap-backed Denmark sources.
- This run did not add new atlas rows for them; it confirmed their actual incremental value versus the rest of the Denmark set.

Current Denmark full-audit after sitemap cleanup:

- `/Users/myungeunlee/Desktop/mylee/world-press-monitor/audits/denmark-current-coverage-20260412.json`
- `1,634 unique / 24h`

## Dirty Sitemap Salvage

Candidate file:

- `/Users/myungeunlee/Desktop/mylee/world-press-monitor/data/denmark-dirty-sitemap-salvage-candidates-20260412.json`

Coverage result:

- `/Users/myungeunlee/Desktop/mylee/world-press-monitor/audits/denmark-dirty-sitemap-salvage-coverage-20260412.json`

Applied stronger filtering:

- `ing.dk`
  - exclude `/emne/*`
  - exclude single-segment landings unless the URL starts with `/artikel/`
  - exclude opinion, notes, podcast, feeds, and other section landings
- `version2.dk`
  - exclude `/emne/*`
  - exclude single-segment landings unless the URL starts with `/artikel/`
  - exclude focus, blogs, debates, newsletters, feeds, and other section landings
- `altinget.dk`
  - keep only `/artikel/*`

Result after cleanup:

- `Altinget - Sitemap Index`: `1,000 unique / 24h`
- `Ingenioren - Sitemap Index`: `0`
- `Version2 - Sitemap Index`: `0`

Conclusion:

- `Ingenioren` and `Version2` were not hiding usable volume. Their apparent freshness came from taxonomy-style sitemap noise, especially `/emne/*`.
- `Altinget` still shows `1,000 / 24h` even after forcing `/artikel/*` only, which means the problem is not URL cleanliness but freshness integrity in the sitemap itself.
- Because of that false-freshness behavior, `Altinget` sitemap should still not be added to the atlas as a volume source.

## Local And Regional Batch 5

Candidate file:

- `/Users/myungeunlee/Desktop/mylee/world-press-monitor/data/denmark-local-regional-batch5-candidates-20260412.json`

Net-new baseline audit:

- `/Users/myungeunlee/Desktop/mylee/world-press-monitor/audits/denmark-local-regional-batch5-netnew-20260412.json`

Net-new result:

- `70 recent / 24h`
- `63 unique / 24h`

Added atlas sources:

1. `DinAvis - Seneste`
2. `DinAvis - Topnyheder`
3. `Herning Folkeblad - HTML Collection`
4. `Midtjyllands Avis - HTML Collection`
5. `Skive Folkeblad - HTML Collection`

Per-source contribution:

- `Midtjyllands Avis - HTML Collection`: `21`
- `Herning Folkeblad - HTML Collection`: `16`
- `Skive Folkeblad - HTML Collection`: `13`
- `DinAvis - Seneste`: `10`
- `DinAvis - Topnyheder`: `10`

Notes:

- `DinAvis - Sitemap Index` remained `0 / 24h`, so only the RSS feeds were kept.
- `Herning Folkeblad`, `Midtjyllands Avis`, and `Skive Folkeblad` were added through homepage HTML collection parsing rather than sitemap ingestion because their current article payloads are embedded directly in page HTML.

Batch-5 ingest smoke:

- `endpoints=5`
- `ok=5`
- `failed=0`
- `newsArticles=151`

Current Denmark full-audit after batch 5:

- `/Users/myungeunlee/Desktop/mylee/world-press-monitor/audits/denmark-current-coverage-20260412.json`
- `1,677 unique / 24h`

## Altinget And JFM Batch 6

Candidate file:

- `/Users/myungeunlee/Desktop/mylee/world-press-monitor/data/denmark-altinget-jfm-batch6-candidates-20260412.json`

Coverage result:

- `/Users/myungeunlee/Desktop/mylee/world-press-monitor/audits/denmark-altinget-jfm-batch6-coverage-20260412.json`

What was checked:

- `Altinget` section HTML candidates:
  - `Christiansborg`
  - `EU`
  - `Kommunal`
  - `Sundhed`
  - `Klima`
- `JFM` sitemap candidate:
  - `Fredericia Dagblad`

Parser result:

- `Altinget` does not expose usable official section RSS paths like `/rss/christiansborg` or `/rss/eu`; those returned `404`.
- To salvage section coverage, a dedicated HTML parser was added for `altinget.dk` section pages.
- The parser reads Nuxt payload data, matches visible `/artikel/*` links to serialized article records, and resolves `publishingDate` from the page payload rather than from dirty sitemap metadata.

Batch-6 result:

- Total: `10 unique / 24h`
- `Fredericia Dagblad - Sitemap`: `9`
- `Altinget Christiansborg - HTML Collection`: `1`
- `Altinget EU - HTML Collection`: `0`
- `Altinget Kommunal - HTML Collection`: `0`
- `Altinget Sundhed - HTML Collection`: `0`
- `Altinget Klima - HTML Collection`: `0`

Operational decision:

- `Fredericia Dagblad - Sitemap` was added to the atlas.
- `Altinget` section parser support was kept in code, but the section sources were not added to the atlas yet because the current 24-hour window only produced `+1` net-new article from `Christiansborg`.
- `MHM` side candidates like `ikastavis.dk` and `sallingavis.dk` currently redirect back into previously rejected `Dit*` style portals or e-paper flows, so they were not promoted.
