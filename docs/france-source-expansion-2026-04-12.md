# France Source Expansion - 2026-04-12

## Baseline

- Pre-add baseline using the pre-change atlas:
  - `audits/france-current-pre-add-20260412.json`
  - `2880 unique / 24h`
  - `3230 raw / 24h`

## Batch 1

- Candidate file:
  - `data/france-volume-batch1-candidates-20260412.json`
- Raw isolated coverage before France-specific cleanup:
  - `audits/france-volume-batch1-coverage-20260412.json`
  - `+735 unique / 24h`
- Clean isolated coverage after URL filtering:
  - `audits/france-volume-batch1-clean-coverage-20260412.json`
  - `+724 unique / 24h`

Top contributors:

- `La Dépêche`: `+256`
- `France Bleu`: `+126`
- `Midi Libre`: `+114`
- `La Croix`: `+72`
- `Nice-Matin`: `+61`
- `Clubic`: `+24`
- `Les Numériques`: `+19`
- `Capital`: `+14`
- `Journal du Geek`: `+10`
- `Numerama`: `+9`
- `01Net`: `+8`
- `Presse Citron`: `+7`
- `Sciences et Avenir`: `+4`

## Quality Notes

- `01Net` news sitemap mixed evergreen VPN and utility paths with real articles.
  - Added filtering so only `/actualites/` article URLs are accepted.
- `Journal du Geek` news sitemap mixed dossiers, hosting guides, and VPN landing pages with real dated posts.
  - Added filtering so only dated article paths are accepted.
- `Clubic`, `Les Numériques`, and `Capital` still contribute article URLs, but they are softer and more commerce-heavy than the regional news sources above.

## Atlas Updates

Added sitemap coverage to existing France sources in `data/rss-atlas.json`:

- `La Croix`
- `La Dépêche`
- `Midi Libre`
- `Nice-Matin`
- `Numerama`
- `Clubic`
- `01Net`
- `Presse Citron`
- `Journal du Geek`
- `Capital`
- `France Bleu`
- `Sciences et Avenir`
- `Les Numériques`

## Current State After Changes

- Current full France coverage after batch 1:
  - `audits/france-current-coverage-20260412.json`
  - `3305 unique / 24h`
  - `3957 raw / 24h`

Interpretation:

- Full current moved from `2880 -> 3305 unique / 24h`, a net change of `+425 unique / 24h`.
- The larger clean isolated gain (`+724`) reflects true candidate headroom against the pre-add atlas.
- The gap between isolated gain and full-current delta is expected because the 24-hour window moved between runs.

## Ingest Smoke

- France sitemap-only smoke run on the 13 added endpoints:
  - `endpoints=13`
  - `ok=13`
  - `failed=0`
  - `newsArticles=1767`

## Supporting Code Changes

- URL filters:
  - `lib/article-url-filters.ts`
- Publisher mappings:
  - `lib/publisher-groups.ts`
- Candidate list:
  - `data/france-volume-batch1-candidates-20260412.json`

## Batch 2

- Candidate file:
  - `data/france-volume-batch2-candidates-20260412.json`
- Isolated coverage:
  - `audits/france-volume-batch2-coverage-20260412.json`
  - `+774 unique / 24h`

Accepted batch 2 additions:

- `Ouest-France (Regional News/Society)`
- `Sud Ouest`
- `Lyon Capitale`

Hold / rejected after investigation:

- `Challenges.fr (Business)`
  - Official sitemap index exists and is worth investigating.
  - Current root/index path still lands in `PARSE_EMPTY` in the worker path, so it was not added to atlas yet.
- `Le Progrès`, `L'Est Républicain`, `DNA`
  - Request sitemaps were found, but sampled output was archive-heavy and too dirty to add directly.
- `Marsactu`, `Rue89 Strasbourg`, `Maddyness`
  - Sampled sitemap content skewed stale or archival in the tested children.

Top batch 2 contributors:

- `Ouest-France (Regional News/Society)`: `+454`
- `Sud Ouest`: `+308`
- `Lyon Capitale`: `+12`

## Sitemap Index Investigation

Yes, sitemap-index discovery is the right approach for France.

- `Ouest-France` only became high-yield once `googlenews.xml` and its child sitemaps were followed.
- `Challenges` also exposed useful monthly sitemap children through its sitemap index.
- In practice, France has several publishers where plain RSS undercounts badly and sitemap index is the only path to materially more volume.

## Batch 2 Quality Notes

- `Ouest-France` mixed a large amount of `/meteo/` URLs with articles.
  - Added filtering to drop `/meteo/`.
- `Sud Ouest` mixed weather and ephemeris paths with articles.
  - Added filtering to drop `/meteo/` and `/redaction/ephemeride/`.
- `Sud Ouest` also returned a same-URL `302` redirect loop in the worker path.
  - Added a browser-fallback escape hatch for self-redirect and redirect-limit failures on allowlisted sitemap hosts.
- `Challenges` mixed real business articles with `/partenaires/` sponsored paths.
  - Added filtering for `/partenaires/`, but parsing is still not production-safe.

## Current State After Batch 2

- Latest full France coverage after batch 2:
  - `audits/france-current-coverage-20260412.json`
  - `4417 unique / 24h`
  - `5115 raw / 24h`

Interpretation:

- Batch 1 baseline inside the batch 2 run was `3604 unique / 24h`.
- Full current later moved to `4417 unique / 24h`.
- The safer batch 2 contribution remains the isolated `+774 unique / 24h`, because the 24-hour window continued moving during validation.

## Batch 2 Ingest Smoke

- France sitemap-only smoke run on:
  - `Sud Ouest`
  - `Ouest-France (Regional News/Society)`
  - `Lyon Capitale`
- Validation run with backoff temporarily disabled after fixing the `Sud Ouest` redirect-loop path:
  - `endpoints=3`
  - `ok=3`
  - `failed=0`

Note:

- Persisted article counts in the final smoke run were low because prior runs had already advanced the watermarks.

## Additional Supporting Code Changes

- Browser sitemap fallback allowlist updates:
  - `scripts/rss-country-coverage.ts`
  - `scripts/ingest-worker.ts`
- Worker redirect-loop fallback fix:
  - `scripts/ingest-worker.ts`
- Candidate list:
  - `data/france-volume-batch2-candidates-20260412.json`
