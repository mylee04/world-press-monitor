# New Zealand Source Expansion - 2026-04-12

## Baseline

- Fresh baseline before New Zealand expansion work:
  - `audits/new-zealand-current-coverage-20260412.json`
  - `1189 unique / 24h`

## Batch 1

- Candidate file:
  - `data/new-zealand-volume-batch1-candidates-20260412.json`
- Clean isolated coverage:
  - `audits/new-zealand-volume-batch1-clean-coverage-20260412.json`
- Net-new:
  - `+140 unique / 24h`

Top contributors:

- `Otago Daily Times`: `+55`
- `Local Matters`: `+50`
- `Waatea News`: `+31`
- `Chris Lynch Media`: `+3`
- `ChannelLife NZ`: `+1`

Notes:

- `BusinessDesk` legacy `sitemap.xml` was dirty and inflated volume with non-article URLs.
- `Local Matters` and `Chris Lynch Media` needed URL filters for category/tag/landing paths.

## Batch 2

- Candidate file:
  - `data/new-zealand-volume-batch2-candidates-20260412.json`
- Coverage:
  - `audits/new-zealand-volume-batch2-coverage-20260412.json`
- Net-new:
  - `+22 unique / 24h`

Accepted:

- `Farmers Weekly` via `https://www.farmersweekly.co.nz/sitemap.xml`

Rejected or kept on hold:

- `SecurityBrief NZ`: no recent article gain from sitemap
- `IT Brief NZ`: no recent article gain from sitemap
- `Hospitality Business`: stale sitemap / no recent article gain

Notes:

- `Farmers Weekly` required sitemap index CDATA handling in both coverage and ingest paths.
- `Farmers Weekly` also needed URL filters for `tag`, `author`, and section landing pages.

## BusinessDesk Comparison

- Comparison candidate file:
  - `data/new-zealand-businessdesk-comparison-candidates-20260412.json`
- Comparison audit:
  - `audits/new-zealand-businessdesk-comparison-20260412.json`

Results on the same RSS-only baseline:

- `BusinessDesk - Dirty Sitemap`: `447 / 24h`
- `BusinessDesk - Clean News Sitemap`: `15 / 24h`

Interpretation:

- The dirty sitemap is not usable as a news-quality source.
- Sample URLs from the dirty endpoint are landing pages, topic hubs, company profiles, and utility pages.
- The clean `news-sitemap.xml` is the correct production endpoint.

## Current State After Changes

- Current full New Zealand coverage:
  - `audits/new-zealand-current-coverage-20260412.json`
  - `876 unique / 24h`
- Current full New Zealand coverage with volume-first BusinessDesk:
  - `audits/new-zealand-current-volume-first-coverage-20260412.json`
  - `1323 unique / 24h`

Atlas updates:

- `BusinessDesk` now points to clean `news-sitemap.xml`
- Added sitemap coverage for:
  - `Waatea News`
  - `Otago Daily Times`
  - `Local Matters`
  - `Chris Lynch Media`
  - `ChannelLife NZ`
  - `Farmers Weekly`
