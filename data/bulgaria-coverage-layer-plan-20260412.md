# Bulgaria Coverage Layer Plan

Date: 2026-04-12

## Goal

Increase `Bulgaria coverage` volume toward the `3k~4k/day` range without corrupting the meaning of the existing `source_country = Bulgaria` metric.

Current reality:

- `Bulgaria publishers 24h` is currently around the mid-`1.6k/day` range after the latest local-source expansion.
- Publisher-country growth is still available, but the largest remaining upside is blocked by fetch constraints on major domestic publishers.
- Competitor-scale counts in the `3k~4k/day` range are likely mixing:
  - Bulgarian publishers
  - foreign coverage about Bulgaria
  - government, regulator, and parliament releases
  - public notices and institution bulletins

## Metric Split

Do not mix these two meanings into one number:

1. `Bulgaria publishers`
   - publisher / source is based in Bulgaria
2. `Bulgaria coverage`
   - article is about Bulgaria, regardless of publisher country

Recommended model:

- keep `source_country` as the publisher-country metric
- add a separate coverage label such as `coverage_countries = ['Bulgaria']`
- report both numbers separately on dashboards

## Layer Design

### Layer A: Overseas Media Coverage

Use official regional RSS feeds, then apply a Bulgaria relevance filter.

Verified official feeds:

- BBC Europe RSS
  - `https://feeds.bbci.co.uk/news/world/europe/rss.xml`
- The Guardian Europe RSS
  - `https://www.theguardian.com/world/europe-news/rss`
- New York Times Europe RSS
  - `https://rss.nytimes.com/services/xml/rss/nyt/Europe.xml`

Observed runtime status on 2026-04-12:

- BBC Europe: `200`
- Guardian Europe: `200`
- NYT Europe: `200`
- France 24 Europe: currently `403`, so it should stay below the acceptance line for now

Suggested acceptance rule for overseas feeds:

- accept if one of these is true:
  - URL path contains a strong Bulgaria token like `/bulgaria/`
  - feed categories contain `Bulgaria`
  - title or description contains strong Bulgaria tokens
- strong tokens:
  - `Bulgaria`, `Bulgarian`, `Sofia`, `Plovdiv`, `Varna`, `Burgas`, `Stara Zagora`, `Ruse`, `BTA`, `National Assembly`, `Lev`, `Bulgartransgaz`
- reject weak Balkan or Europe references that are not actually about Bulgaria

### Layer B: Bulgarian Institutional Coverage

Use official government or parliament outputs. These are high-signal and should not require a Bulgaria relevance filter.

Verified official feeds or feed pages:

- Ministry of Tourism RSS
  - `https://www.tourism.government.bg/bg/rss.xml`
- National Assembly RSS directory
  - `https://www.parliament.bg/en/rss`
- National Assembly news RSS
  - `https://www.parliament.bg/en/rss/news`
- National Assembly upcoming events RSS
  - `https://www.parliament.bg/en/rss/upcoming-events`
- National Assembly committees sittings RSS
  - `https://www.parliament.bg/en/rss/committees-sittings`
- National Assembly plenary sittings RSS
  - `https://www.parliament.bg/en/rss/plenary-sittings`

Institutional candidate pages that likely need custom extraction or further endpoint mapping:

- Council of Ministers press centre
  - `https://www.government.bg/en/prestsentar`
- Ministry of Energy RSS page
  - `https://www.me.government.bg/en/pages/rss-feed-65.html`
- Ministry of Interior press centre
  - `https://www.mvr.bg/press/en/press-centre`
- National Audit Office RSS page
  - `https://www.bulnao.government.bg/en/rss/`
- Institute of Public Administration feed page
  - `https://www.ipa.government.bg/en/feed`
- Ministry of Health RSS page
  - `https://old.mh.government.bg/bg/rss/`

These are lower-volume than media feeds, but they add structured public-interest coverage that competitors often count.

### Layer C: Inaccessible Large Domestic Publishers

This is still the biggest publisher-country upside, but it requires a fetch-path change rather than just atlas expansion.

Browser-backed findings from 2026-04-12:

- `Trud` exposes official sitemap endpoints in the browser:
  - `https://trud.bg/sitemap.xml`
  - `https://trud.bg/sitemaps/sitemap_latest.xml`
- `bTV Novinite` remains behind a Cloudflare challenge even in the current browser investigation path
- `Offnews` is already usable in the current runtime and should be added directly as publisher-country supply

Important constraint:

- `Trud` currently returns `403` in the Bun runtime fetch path even though the sitemap is visible in the browser.
- That means `Trud` is not a discovery problem anymore; it is a collector capability problem.

## Implementation Rules

### Relevance

For overseas media:

- require a positive Bulgaria signal
- do not ingest the entire Europe feed as Bulgaria coverage

For institutions:

- treat the whole feed as Bulgaria coverage
- optionally tag by source class:
  - `press_release`
  - `parliament_activity`
  - `notice`
  - `speech`
  - `regulator_update`

### Deduplication

- dedupe across Bulgarian publishers, overseas media, and institutions by canonical URL / stable ID
- do not let the same wire story counted through multiple publishers inflate the final number

### Reporting

Add three separate counters:

1. `Bulgaria publishers 24h`
2. `Bulgaria coverage 24h`
3. `Bulgaria institutions 24h`

## Expected Impact

Reasonable expectation if implemented carefully:

- publisher-country only, with currently reachable domestic sources:
  - roughly `1.6k/day` baseline
  - moderate upside from sources like `Offnews`
- overseas coverage layer:
  - low tens to low hundreds per day, depending on the news cycle
- institutional layer:
  - low tens per day, with spikes during politics, regulation, budget, energy, or election periods
- inaccessible domestic large publishers:
  - the main step-change candidate on the publisher-country side, if browser-backed or challenge-tolerant fetching is implemented

Working conclusion:

- clean `3k~4k/day` is unlikely from Bulgarian publishers alone under the current fetch path
- `3k~4k/day` becomes more realistic only if at least one of these happens:
  - `Trud` / `bTV` class sources become ingestable in production
  - a Bulgaria coverage layer is added with overseas and institutional sources
  - broader low-signal PR / notices / duplicate coverage is intentionally accepted

## Recommended Sequence

1. Add runtime-reachable publisher-country sources first
   - `Offnews` is ready now
2. Implement Layer B next
   - parliament and ministry feeds are official and add high-signal public-interest coverage
3. Implement Layer A after that
   - overseas Europe feeds with strict Bulgaria relevance filters
4. Treat Layer C as a collector upgrade
   - `Trud` and `bTV` need browser-backed or challenge-tolerant fetch support, not just atlas edits
