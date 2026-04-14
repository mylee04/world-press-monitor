# Mexico Source Expansion - 2026-04-14

## Baseline

- Pre-add baseline:
  - `audits/mexico-current-pre-add-20260414.json`
  - `4353 raw / 2871 unique / 24h`

## Official Endpoints Rechecked

- `El Financiero`
  - robots advertises:
    - `https://www.elfinanciero.com.mx/arc/outboundfeeds/sitemap-index/?outputType=xml`
    - `https://www.elfinanciero.com.mx/arc/outboundfeeds/google-news-feed/?outputType=xml`
  - the sitemap index is valid, but it substantially overlaps with the already-configured Google News feed
- `Diario de Yucatán`
  - robots advertises:
    - `https://www.yucatan.com.mx/sitemap.xml`
    - `https://www.yucatan.com.mx/news-sitemap.xml`
  - the news sitemap is valid and recent
- `Vanguardia`
  - robots advertises:
    - `https://vanguardia.com.mx/sitemap.xml`
    - `https://vanguardia.com.mx/sitemapforgoogle.xml`
    - `https://vanguardia.com.mx/megasitemap.xml`
  - `sitemapforgoogle.xml` is the usable current-news endpoint
- `El Informador`
  - robots advertises:
    - `https://www.informador.mx/sitemaps/index.xml`
    - `https://www.informador.mx/sitemaps/googlenews.xml`
    - `https://www.informador.mx/sitemaps/news-daily.xml`
  - `googlenews.xml` and `news-daily.xml` are both valid, but they overlap heavily
- `24 Horas`
  - robots advertises `https://24-horas.mx/sitemap_index.xml`
  - direct fetch is Cloudflare-gated
  - browser helper can recover the sitemap index, but the production path was too slow and child selection was unstable for this batch

## Batch 1 Candidates

- Candidate file:
  - `data/mexico-volume-batch1-candidates-20260414.json`
- Clean isolated coverage:
  - `audits/mexico-volume-batch1-clean-coverage-20260414.json`
  - `+490 unique / 24h`

Accepted candidate output:

- `Informador - Google News Sitemap`: `195 / 24h`
- `Vanguardia MX - Google News Sitemap`: `174 / 24h`
- `Diario de Yucatan - News Sitemap`: `121 / 24h`

Rejected after recheck:

- `El Financiero`
  - sitemap `75 / 24h`
  - existing Google News feed was already producing the same recent set, so the sitemap was redundant for volume expansion
- `24 Horas`
  - official sitemap index exists
  - browser recovery worked in isolation
  - production-safe coverage run was still too slow, so it was deferred

## Quality Notes

- Added Mexico URL filters in `lib/article-url-filters.ts`:
  - `elfinanciero.com.mx`
    - `/cartones/`
    - `/mundo-empresa/`
    - `/opinion/`
  - `yucatan.com.mx`
    - `/juegos/`
  - `vanguardia.com.mx`
    - `/opinion/`
- `Informador`
  - `news-daily.xml` overlaps `googlenews.xml` almost completely
  - `googlenews.xml` was kept as the cleaner single endpoint

## Atlas Updates

Updated existing Mexico feeds with sitemap coverage:

- `Diario de Yucatan`
- `Vanguardia MX`

New Mexico source added:

- `Informador - Google News Sitemap`

## Current State After Batch 1

- Current full Mexico coverage:
  - `audits/mexico-current-coverage-20260414.json`
  - `4680 raw / 3262 unique / 24h`

Interpretation:

- Against the original pre-add baseline, Mexico moved from `2871 -> 3262 unique / 24h`
  - net gain: `+391 unique / 24h`
- Using the paired pre-add atlas run from the same validation cycle:
  - `2813 -> 3262 unique / 24h`
  - net gain: `+449 unique / 24h`
- The isolated candidate gain is larger (`+490`) because:
  - the 24-hour window moved during validation
  - some sitemap URLs overlap existing RSS coverage

Source-level context:

- `Informador`
  - new source
  - sitemap `195 / 24h`
- `Vanguardia MX`
  - sitemap `174 / 24h`
  - rss `66 / 24h`
- `Diario de Yucatan`
  - sitemap `121 / 24h`
  - rss `8 / 24h`

## Validation

- `bun run atlas:export-catalog`
  - refreshed `data/rss-catalog.csv` and `data/rss-catalog.opml`
- `bun run typecheck`
  - passed
- `bun run ingest:once -- --country='Mexico' --sources='Informador - Google News Sitemap,Vanguardia MX,Diario de Yucatan'`
  - `endpoints=5`
  - `ok=5`
  - `failed=0`
  - `newsArticles=0`

Operational note:

- the ingest smoke ran after the candidate coverage pass, so zero newly persisted articles is consistent with warmed watermarks
- the important signal is that all selected endpoints returned `ok`

## Deferred

- `24 Horas`
  - official sitemap exists
  - browser helper recovery works, but the live production path is still too slow
- `El Sol de México` / OEM regional sites
  - `robots.txt` advertises `sitemap/update.xml`
  - direct endpoint currently returns HTML app shell instead of XML
- `Debate`
  - sitemap endpoints returned `403` blocked responses
- `La Silla Rota`
  - common sitemap paths returned `404`
- `El Economista`
  - robots did not advertise sitemap endpoints
  - common sitemap paths returned `404`

## Batch 2 Candidates

- Candidate file:
  - `data/mexico-volume-batch2-candidates-20260414.json`
- OEM-only isolated coverage:
  - `audits/mexico-volume-batch2-oem-coverage-20260414.json`
  - `+121 unique / 24h`

Accepted candidate output:

- `El Occidental - Local HTML Collection`: `15 / 24h`
- `El Sol de Puebla - Local HTML Collection`: `14 / 24h`
- `El Sol de Toluca - Local HTML Collection`: `14 / 24h`
- `El Sol de Morelia - Local HTML Collection`: `14 / 24h`
- `El Sol de Tijuana - Local HTML Collection`: `14 / 24h`
- `El Sudcaliforniano - Local HTML Collection`: `14 / 24h`
- `El Sol de Hermosillo - Local HTML Collection`: `14 / 24h`
- `El Sol de San Luis - Local HTML Collection`: `14 / 24h`
- `El Sol de Leon - Local HTML Collection`: `8 / 24h`

Interpretation:

- the OEM regional `local/` pages are usable even though `robots.txt` points at `sitemap/update.xml`
- the `update.xml` endpoints currently return HTML app shell, not XML
- the HTML collection path is therefore the production-safe recovery path for this batch
- isolated batch 2 gain is `+121 unique / 24h`

Atlas updates:

- added nine new OEM local HTML collection sources alongside the existing OEM RSS feeds:
  - `El Sol de Puebla - Local HTML Collection`
  - `El Sol de Toluca - Local HTML Collection`
  - `El Sol de Morelia - Local HTML Collection`
  - `El Sol de Tijuana - Local HTML Collection`
  - `El Occidental - Local HTML Collection`
  - `El Sudcaliforniano - Local HTML Collection`
  - `El Sol de Hermosillo - Local HTML Collection`
  - `El Sol de Leon - Local HTML Collection`
  - `El Sol de San Luis - Local HTML Collection`

Operational notes:

- the OEM HTML collection parser is restricted to `oem.com.mx/<publication>/local/`
- article timestamps come from article-page `datePublished` fallback because the section pages do not expose stable per-card timestamps
- this keeps the batch focused on local hard-news and avoids the broken OEM sitemap path entirely

Still deferred after batch 2:

- `24 Horas`
  - `sitemap_index.xml` is recoverable only through the browser helper
  - direct child `post-sitemap.xml` is valid, but the production path is still too unstable to promote this cycle
  - existing RSS feed remains in atlas
- `Debate`
  - sitemap paths still return `403`
  - browser helper did not recover a production-safe XML or feed path

## Current State After Batch 2

- Current full Mexico coverage:
  - `audits/mexico-current-coverage-20260414.json`
  - `4799 raw / 3286 unique / 24h`
- Batch 2 summary:
  - `audits/mexico-volume-batch2-summary-20260414.json`

Interpretation:

- against the post-batch-1 full current snapshot:
  - `3262 -> 3286 unique / 24h`
  - net gain: `+24 unique / 24h`
  - `4680 -> 4799 raw / 24h`
  - net gain: `+119 raw / 24h`
- the isolated OEM batch gain remains larger:
  - `+121 unique / 24h`
- the gap between isolated and full-current unique gain comes from:
  - the moving 24-hour window
  - OEM regional outlets frequently republishing the same national or state-level story on different local fronts

## Validation After Batch 2

- `bun run atlas:export-catalog`
  - refreshed `data/rss-catalog.csv` and `data/rss-catalog.opml`
- `bun run typecheck`
  - passed
- `bun run ingest:once -- --country='Mexico' --sources='El Sol de Puebla - Local HTML Collection,...,El Sol de San Luis - Local HTML Collection'`
  - `endpoints=9`
  - `ok=9`
  - `failed=0`
  - `newsArticles=141`
  - `published_at_fallback fulfilled=143`

Operational note:

- the OEM local HTML sources depend on article-page timestamp fallback by design
- in the smoke run that fallback fulfilled `143/143` requests, so the production path is stable enough for atlas use
