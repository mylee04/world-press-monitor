# Singapore Coverage Layer Plan

Date: 2026-04-12

## Goal

Increase `Singapore coverage` volume without corrupting the meaning of the existing `source_country = Singapore` metric.

Current reality:

- `Singapore publishers 24h` is roughly in the high hundreds, not tens of thousands.
- Competitor-scale counts likely mix:
  - overseas coverage of Singapore
  - government and regulator releases
  - alerts, circulars, and public notices
  - portal and duplicate wire coverage

## Metric Split

Do not mix these two meanings into one number:

1. `Singapore publishers`
   - publisher / source is based in Singapore
2. `Singapore coverage`
   - article is about Singapore, regardless of publisher country

Recommended model:

- keep `source_country` as the publisher-country metric
- add a separate coverage label such as `coverage_countries = ['Singapore']`
- report both numbers separately on dashboards

## Layer Design

### Layer A: Overseas Media Coverage

Use official regional RSS feeds, then apply a Singapore relevance filter.

Verified official feeds:

- BBC Asia RSS
  - `https://feeds.bbci.co.uk/news/world/asia/rss.xml`
- New York Times Asia Pacific RSS
  - `https://rss.nytimes.com/services/xml/rss/nyt/AsiaPacific.xml`
- The Guardian Asia RSS
  - `https://www.theguardian.com/world/asia/rss`
- France 24 Asia-Pacific RSS
  - `https://www.france24.com/en/asia-pacific/rss`

Observed signal on 2026-04-12:

- NYT Asia Pacific currently contains explicit Singapore-tagged items
- BBC Asia currently contains at least some Singapore mentions
- Guardian Asia is lower-signal at the current snapshot
- France 24 endpoint is live, but body fetch quality should be rechecked in the runtime used for production

Suggested acceptance rule for overseas feeds:

- accept if one of these is true:
  - URL path contains a strong Singapore token like `/singapore/`
  - feed categories contain `Singapore`
  - title or description contains strong Singapore tokens
- strong tokens:
  - `Singapore`, `S'pore`, `Singaporean`, `MAS`, `Temasek`, `GIC`, `Changi`, `HDB`, `ERP`, `PAP`, `WP`, `PM Wong`
- reject if the match is weak or ambiguous and not actually about Singapore

### Layer B: Singapore Institutional Coverage

Use official government or regulator outputs. These are high-signal and should not require a Singapore relevance filter.

Verified official feeds:

- Singapore Food Agency newsroom RSS
  - `https://www.sfa.gov.sg/rss/newsroom`
- Singapore Food Agency food alerts RSS
  - `https://www.sfa.gov.sg/rss/annual-listing-food-alerts`
- Singapore Food Agency circulars RSS
  - `https://www.sfa.gov.sg/rss/annual-listing-circulars`

These are lower-volume than media feeds, but they add important public-interest coverage that competitors often include.

### Layer C: Government Newsroom Aggregation

Best long-term volume source: Singapore Government Press Centre plus ministry newsroom pages.

Primary aggregator candidate:

- SG Press Centre
  - `https://www.sgpc.gov.sg/`

Institutional candidate pages:

- Ministry of Trade and Industry newsroom
  - `https://www.mti.gov.sg/newsroom`
- Ministry of Foreign Affairs newsroom
  - `https://www.mfa.gov.sg/newsroom`
- Ministry of Home Affairs newsroom
  - `https://www.mha.gov.sg/media-room/newsroom`
- Ministry of Finance newsroom
  - `https://www.mof.gov.sg/news-resources/newsroom/`
- Ministry of Digital Development and Information newsroom
  - `https://www.mddi.gov.sg/newsroom`
- Monetary Authority of Singapore media releases
  - `https://www.mas.gov.sg/news/media-releases`

Notes:

- Several ministry newsroom pages returned `403` in the current command-line environment on 2026-04-12.
- That does not make them unusable; it means they likely need browser-backed fetching, SG Press Centre aggregation, or a different fetch profile.
- SG Press Centre is the most promising place to centralize ministry releases if its listing flow can be mapped cleanly.

## Implementation Rules

### Relevance

For overseas media:

- require a positive Singapore signal
- do not ingest the entire Asia feed as Singapore coverage

For institutions:

- treat the whole feed as Singapore coverage
- optionally tag by agency domain and content type:
  - `press_release`
  - `alert`
  - `circular`
  - `speech`
  - `public_notice`

### Deduplication

- dedupe across local publishers, overseas media, and institutions by canonical URL / stable ID
- do not let the same Reuters or AP story counted through multiple publishers inflate the final number

### Reporting

Add three separate counters:

1. `Singapore publishers 24h`
2. `Singapore coverage 24h`
3. `Singapore institutions 24h`

## Expected Impact

Reasonable expectation if implemented carefully:

- Overseas coverage layer:
  - low tens per day on normal days
  - more on major Singapore political, legal, aviation, finance, or regional-security events
- Institutional layer:
  - low tens per day from alerts, circulars, and press releases
- SG Press Centre / ministry aggregation:
  - potentially the highest structured upside on the official side

Important constraint:

- Even with this layer, `30k/day` is still not a realistic target for clean, deduplicated Singapore hard-news coverage.
- Reaching that kind of number usually implies one or more of:
  - heavy PR inclusion
  - market notices and filings
  - broad regional feeds without strict relevance filters
  - duplicate/mirrored coverage

## Recommended Sequence

1. Implement Layer B first
   - SFA RSS feeds are official, low-risk, and easy to add
2. Implement Layer A next
   - add overseas feeds with strict Singapore relevance filters
3. Explore Layer C after that
   - SG Press Centre and ministry newsroom collection likely need a custom collector or browser-backed fetch path
