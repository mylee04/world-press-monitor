# World Press Radar Map Visualization Spec

Last updated: 2026-03-31
Owner: World Press Radar
Status: Draft

## 1. Purpose

Build a map-first monitoring experience for World Press Radar that shows:

- global news publishing activity by country
- active source coverage by country and company
- source-level publishing activity inside a selected country
- operational health for RSS and sitemap ingestion

The intended product shape is:

1. global 3D overview
2. country drill-down on a flat map
3. source detail drawer
4. publisher footprint mode

This is not a decorative globe. It is an operational and analytical interface for understanding where news is being published, how much is being published, which sources are connected, and which source pipelines are healthy or degraded.

## 2. Product Goals

- Make worldwide publishing activity legible in under 10 seconds.
- Show country-level publishing volume and source coverage together.
- Let users drill into a country and inspect regional or city-level source distribution.
- Let users inspect per-source output over the last 24 hours and last 1 hour.
- Make RSS and sitemap coverage visible as first-class metrics.
- Make source health visible without opening a separate tooling surface.

## 3. Non-Goals

- Real-time article-level point clouds for every story on the globe.
- Perfect city-level geolocation for every article in v1.
- Automatic globe rotation by default.
- Highly cinematic camera motion that makes the map harder to use.
- Public anonymous exposure of internal source-health details unless the route is explicitly authenticated.

## 4. Primary Users

- internal operations team monitoring ingest coverage
- internal product team validating country and publisher expansion
- customer users who need market-level publishing visibility
- analysts checking which publishers and regions are most active

## 5. Product Principles

- Overview first, drill-down second.
- Country aggregates must be understandable without opening a detail panel.
- Source detail should be one click away from the country view.
- 3D should improve comprehension, not just appearance.
- Quality and freshness metrics must be visible alongside volume metrics.

## 6. Core Metrics

All metrics below should be defined once and reused consistently across the UI and API.

- `pub24h`
  - Articles with `publication_datetime` in the last 24 hours.
- `pub1h`
  - Articles with `publication_datetime` in the last 1 hour.
- `fresh24h`
  - Articles both published and first-seen in the last 24 hours.
- `late24h`
  - Articles first-seen in the last 24 hours but published earlier than 24 hours ago.
- `lateShare`
  - `late24h / firstSeen24h`.
- `activeSources24h`
  - Distinct sources that produced at least 1 article in the last 24 hours.
- `rssSources24h`
  - Distinct active sources whose connected method includes RSS.
- `sitemapSources24h`
  - Distinct active sources whose connected method includes sitemap.
- `healthySources24h`
  - Distinct active sources whose most recent health status is healthy or ok.
- `degradedSources24h`
  - Distinct active sources whose latest health is warning, degraded, or failing.

## 7. Data Model Assumptions

Existing project data already provides:

- article rows with `source`, `country`, `publicationDatetime`, `createdAt`
- source-level atlas rows for `rssUrl` and `sitemapUrl`
- source health snapshots
- country and source names
- country centroids and some source or article-level geo hints

V1 should prefer stable aggregates:

- country centroid for global map
- source HQ or representative city for country detail map
- article-level geo only as a later overlay

## 8. Screen Architecture

### 8.1 Global Globe

Purpose:

- show a world overview of publishing activity and source coverage

Visual model:

- dark 3D globe
- country-level bubbles or columns anchored to country centroids
- optional arc or pulse overlays for publisher footprint mode

Primary interactions:

- hover country to see summary metrics
- click country to open country detail map
- search country or publisher
- toggle layers and time windows

Primary metrics shown:

- `pub24h`
- `pub1h`
- `activeSources24h`
- `rssSources24h`
- `sitemapSources24h`
- `lateShare`

Encoding:

- bubble size = `pub24h`
- bubble fill color = `lateShare` or freshness state
- ring or badge = `activeSources24h`
- glow or outline = source health state

Left panel controls:

- metric mode
  - articles
  - sources
  - publishers
  - health
- time range
  - 1h
  - 24h
  - 7d
- layer toggles
  - country volume
  - source count
  - source health
  - publisher footprint
  - article flow
- filters
  - source method
  - section
  - publisher
  - health status

Top bar controls:

- globe or flat toggle
- search
- reset camera
- share state

Tooltip contents:

- country
- `pub24h`
- `pub1h`
- `activeSources24h`
- `rssSources24h`
- `sitemapSources24h`
- `lateShare`
- top 3 publishers

### 8.2 Country Detail Flat Map

Purpose:

- show regional source distribution inside one selected country

Visual model:

- flat map focused on the selected country
- clustered source markers by city or region
- optional regional heat overlay if enough source coordinates exist

Primary interactions:

- hover source cluster for summary
- click marker or cluster to inspect sources
- click source to open source drawer
- filter by source type, publisher, and health

Primary metrics shown:

- country total `pub24h`
- country total `pub1h`
- country total `activeSources24h`
- source-level `pub24h`
- source-level `pub1h`
- source method
- latest health state

Encoding:

- marker size = source `pub24h`
- marker fill color = source method or health
- marker stroke = publisher grouping or source status

Side panel contents:

- country summary
- active publishers
- active sources
- top source categories
- hourly sparkline for country volume
- top regions or cities by source output

### 8.3 Source Detail Drawer

Purpose:

- inspect one source in an operational and editorial context

Contents:

- source name
- publisher name
- country
- city or region
- source method
- source health
- `pub24h`
- `pub1h`
- `fresh24h`
- `late24h`
- failure rate
- last successful check time
- RSS URL
- sitemap URL
- last 24h hourly chart
- latest article list

Actions:

- open in explorer
- open source URL
- filter to publisher
- filter to country

### 8.4 Publisher Footprint Mode

Purpose:

- inspect a multi-country company or brand network

Visual model:

- globe or flat map with only that publisher’s country and source footprint emphasized
- country bubbles represent that publisher’s output, not total country output

Metrics:

- publisher `pub24h`
- countries active
- sources active
- RSS share
- sitemap share
- degraded source count

Use cases:

- News Corp Australia network
- Mediahuis network
- Yahoo footprint
- CNA and related Singapore footprint

## 9. Technical Architecture

### 9.1 Rendering Strategy

Recommended map stack:

- global 3D view: `deck.gl`
- country drill-down flat map: `maplibre-gl`
- optional combined usage when overlays must share camera state

Reasoning:

- `deck.gl` is better for high-density animated layers and globe rendering
- `maplibre-gl` is better for conventional country and regional map interaction
- the project already includes `maplibre-gl`

### 9.2 Suggested Layer Types

Global view:

- `ScatterplotLayer` for country bubbles
- `ColumnLayer` or extruded circles for country volume pillars
- `ArcLayer` for publisher footprint or network flows
- `GeoJsonLayer` for country polygons and hover states

Country view:

- `ScatterplotLayer` for source markers
- `TextLayer` for selected labels only
- `GeoJsonLayer` for country and region boundaries
- map clustering if source density is high

Optional future layers:

- H3 aggregation for article density
- article-level pulse points
- section-specific coloring

## 10. API Contracts

These routes should be authenticated unless the team explicitly decides to expose public summaries.

### 10.1 `GET /api/customer/dashboard/map/countries`

Purpose:

- return one row per country for the selected time window

Response shape:

```ts
type CountryMapRow = {
  country: string;
  countryCode: string | null;
  lat: number;
  lon: number;
  pub24h: number;
  pub1h: number;
  fresh24h: number;
  late24h: number;
  lateShare: number;
  activeSources24h: number;
  rssSources24h: number;
  sitemapSources24h: number;
  healthySources24h: number;
  degradedSources24h: number;
  topPublishers: Array<{ name: string; count: number }>;
};
```

### 10.2 `GET /api/customer/dashboard/map/countries/:country/sources`

Purpose:

- return source-level points for a selected country

Response shape:

```ts
type CountrySourceMapRow = {
  sourceId: string;
  source: string;
  publisher: string | null;
  country: string;
  region: string | null;
  city: string | null;
  lat: number;
  lon: number;
  pub24h: number;
  pub1h: number;
  fresh24h: number;
  late24h: number;
  method: 'rss' | 'sitemap' | 'rss+sitemap';
  health: 'healthy' | 'warning' | 'degraded' | 'failing' | 'unknown';
  rssUrl: string | null;
  sitemapUrl: string | null;
};
```

### 10.3 `GET /api/customer/dashboard/map/sources/:sourceId`

Purpose:

- return details for one source drawer

Response shape:

```ts
type SourceDetailResponse = {
  sourceId: string;
  source: string;
  publisher: string | null;
  country: string;
  region: string | null;
  city: string | null;
  method: 'rss' | 'sitemap' | 'rss+sitemap';
  rssUrl: string | null;
  sitemapUrl: string | null;
  health: {
    status: 'healthy' | 'warning' | 'degraded' | 'failing' | 'unknown';
    lastCheckedAt: string | null;
    failRate24h: number | null;
    lastError: string | null;
  };
  metrics: {
    pub24h: number;
    pub1h: number;
    fresh24h: number;
    late24h: number;
  };
  hourly24h: Array<{ hour: string; count: number }>;
  latestArticles: Array<{
    id: string;
    title: string;
    url: string;
    publicationDatetime: string;
    primarySection: string | null;
  }>;
};
```

### 10.4 `GET /api/customer/dashboard/map/publishers`

Purpose:

- power publisher footprint mode

Response shape:

```ts
type PublisherMapResponse = {
  publishers: Array<{
    publisher: string;
    pub24h: number;
    activeCountries24h: number;
    activeSources24h: number;
    healthySources24h: number;
    degradedSources24h: number;
    countries: Array<{
      country: string;
      countryCode: string | null;
      lat: number;
      lon: number;
      pub24h: number;
      activeSources24h: number;
    }>;
  }>;
};
```

## 11. State and URL Model

The map should be deep-linkable.

Suggested query params:

- `view=globe|flat`
- `country=Australia`
- `publisher=News%20Corp`
- `metric=pub24h`
- `window=1h|24h|7d`
- `layer=articles|sources|health|publishers|flows`
- `source=source-id`

Examples:

- `/map?view=globe&metric=pub24h&window=24h`
- `/map?view=flat&country=Australia&layer=sources`
- `/map?view=globe&publisher=Mediahuis&layer=publishers`

## 12. Performance Targets

- first map paint in under 3 seconds on a warm connection
- pan and zoom should stay responsive at 60fps on common laptop hardware
- country hover interaction under 100ms
- source drawer open under 300ms after click

Performance guardrails:

- aggregate server-side
- do not send raw article rows to the globe view
- cluster source markers on country maps
- load country detail data on demand
- limit labels to selected or hovered states

## 13. Accessibility and UX Constraints

- no mandatory auto-rotation
- keyboard reachable controls
- strong contrast for dark theme
- screen-reader readable side-panel data
- reduced motion mode should disable continuous animation
- hover information must also be accessible on click

## 14. Attribution and Data Notes

- If OpenStreetMap-based tiles or data are used, attribution must remain visible.
- Internal health data should not leak publicly unless explicitly intended.
- Source coordinates should be marked as representative when exact HQ data is not available.

## 15. Delivery Plan

### Phase 1: Foundation

Goal:

- ship a credible map MVP with country aggregates and drill-down

Includes:

- authenticated map page
- country aggregate API
- country source API
- global globe
- country flat map
- source drawer basics

### Phase 2: Publisher Mode

Goal:

- show company or network footprint

Includes:

- publisher aggregate API
- publisher filter
- publisher country highlights
- publisher metrics panel

### Phase 3: Advanced Ops

Goal:

- make the map a true operations surface

Includes:

- source health overlays
- failure heat or status indicators
- flow arcs
- compare mode
- saved views or shareable links

## 16. Implementation Backlog

### Epic A: Product and Data Modeling

#### A1. Finalize metric definitions

- define canonical formulas for `pub24h`, `pub1h`, `fresh24h`, `late24h`, `lateShare`
- confirm whether `activeSources24h` requires at least 1 clean article
- define how `rss+sitemap` is represented
- document health-state derivation

Acceptance criteria:

- one shared metric spec exists
- frontend and backend use the same names

#### A2. Define publisher mapping strategy

- decide where publisher names come from
- determine fallback when only `source` is available
- decide whether `sourceCategories` can stand in for publisher groupings in v1

Acceptance criteria:

- every source shown on the map resolves to either a publisher name or `unknown`

#### A3. Define source coordinate strategy

- choose source HQ coordinate source
- decide fallback order
  - exact source coordinate
  - city centroid
  - region centroid
  - country centroid
- define confidence level for coordinates

Acceptance criteria:

- country detail map can render all active sources without null coordinate failures

### Epic B: Backend APIs

#### B1. Build country aggregate route

- create `/api/customer/dashboard/map/countries`
- aggregate last 1h, 24h, 7d metrics
- join country centroids
- include source counts and health counts

Acceptance criteria:

- returns one row per active country
- supports metric window filters

#### B2. Build country source route

- create `/api/customer/dashboard/map/countries/:country/sources`
- aggregate source-level metrics
- include method and health
- return representative coordinates

Acceptance criteria:

- country map can render clustered source points

#### B3. Build source detail route

- create `/api/customer/dashboard/map/sources/:sourceId`
- return source metadata
- return hourly series
- return latest article preview

Acceptance criteria:

- source drawer can render without additional fetches

#### B4. Build publisher footprint route

- create `/api/customer/dashboard/map/publishers`
- aggregate country and source counts by publisher
- support filtering by country, method, health

Acceptance criteria:

- publisher mode can render one selected network

### Epic C: Frontend Map Shell

#### C1. Create map page route

- add `app/map/page.tsx`
- gate with existing customer access pattern
- provide loading and error states

Acceptance criteria:

- authenticated users can open the map page

#### C2. Create shared map shell layout

- left control panel
- top toolbar
- right detail drawer
- lower mini-map or locator

Acceptance criteria:

- layout works on desktop
- controls do not overlap critical map content

#### C3. Add URL state sync

- persist selected view, country, publisher, layer, and metric in query params
- restore the same state on reload

Acceptance criteria:

- copied URL restores current map state

### Epic D: Global Globe

#### D1. Implement globe scene

- create a globe camera and world basemap
- add country polygons
- add country bubble layer

Acceptance criteria:

- globe renders smoothly
- country bubbles scale by selected metric

#### D2. Implement country hover and click

- tooltip on hover
- click opens country detail
- selected country stays highlighted

Acceptance criteria:

- country drill-down is reachable from the globe

#### D3. Implement global layer toggles

- article volume
- source counts
- source health
- publisher footprint

Acceptance criteria:

- toggles visibly change the globe layers

### Epic E: Country Drill-Down

#### E1. Implement flat country map

- switch from globe to flat map
- fit bounds to the selected country
- show region boundaries if available

Acceptance criteria:

- country map opens quickly after country click

#### E2. Implement source marker layer

- source markers sized by `pub24h`
- color by method or health
- cluster markers when zoomed out

Acceptance criteria:

- dense countries remain readable

#### E3. Implement country summary panel

- country totals
- top publishers
- top source categories
- hourly sparkline

Acceptance criteria:

- country map shows more than just points

### Epic F: Source Detail

#### F1. Implement source drawer

- open on marker click
- show metrics and metadata
- show RSS and sitemap URLs

Acceptance criteria:

- drawer can inspect one source end to end

#### F2. Add latest article preview

- fetch latest 5 to 20 articles
- show publication times and sections

Acceptance criteria:

- source drawer connects output metrics to real article samples

#### F3. Add source hourly chart

- 24-hour hourly bar or line chart

Acceptance criteria:

- recent activity spikes are visible

### Epic G: Publisher Mode

#### G1. Implement publisher selection

- search publisher
- apply publisher filter across views

Acceptance criteria:

- selecting a publisher changes map state and panels

#### G2. Render publisher country footprint

- show publisher-specific country bubbles
- show active countries and source counts

Acceptance criteria:

- footprint clearly differs from total global view

#### G3. Add publisher summary panel

- `pub24h`
- active countries
- active sources
- health distribution

Acceptance criteria:

- publisher mode supports comparison and monitoring

### Epic H: Operations and Quality

#### H1. Add health overlay

- source health colors
- country-level degraded counts

Acceptance criteria:

- unhealthy source clusters are visually obvious

#### H2. Add reduced motion mode

- disable continuous pulse and camera motion

Acceptance criteria:

- reduced motion users can use the map comfortably

#### H3. Add attribution and legal footer

- show map attribution persistently

Acceptance criteria:

- attribution remains visible and compliant

#### H4. Add performance guardrails

- lazy load heavy layers
- fetch detail data on demand
- memoize expensive transforms

Acceptance criteria:

- country switching remains fast

## 17. Task Sequencing

Recommended implementation order:

1. `A1-A3`
2. `B1-B3`
3. `C1-C3`
4. `D1-D3`
5. `E1-E3`
6. `F1-F3`
7. `G1-G3`
8. `H1-H4`

## 17.1 Current Status Snapshot (2026-03-31)

Current implementation already covers:

- authenticated `/map` route
- global globe with country bubbles
- country click into flat map drill-down
- source and cluster detail drawer
- live DB-backed country metrics
- source HQ registry and country geometry fallback handling
- country zoom and pan interaction

Current known gaps:

- publisher is still often equal to source label instead of network/company grouping
- country summary lacks `top publishers`, `top regions`, and `country hourly trend`
- dense metro countries still need stronger `city -> source list` drill-down polish
- URL state is not yet deep-linkable
- health overlay exists conceptually but is not yet a first-class visual mode
- geometry overrides are still heuristic for some multipolygon countries

This means the next implementation wave should focus on:

1. publisher grouping model
2. country mode operational summary upgrades
3. publisher mode foundation
4. health overlay and URL state

## 17.2 Next Delivery Wave

### Wave A: Publisher Grouping Foundation

Goal:

- ensure every map source resolves to a meaningful publisher/network label before publisher mode UI lands

Implementation tasks:

- create `lib/publisher-groups.ts`
- define exact, prefix, contains, and country-scoped publisher rules
- support fallback order:
  - exact source match
  - prefix match
  - contains match
  - normalized source label
- return both:
  - `publisher`
  - `publisherConfidence`
- wire publisher resolution into:
  - country aggregate route
  - country source route
  - source detail route

Acceptance criteria:

- major networks no longer appear as dozens of unrelated sources when a single publisher view is more correct
- source drawer shows a real publisher label for major brands
- publisher grouping logic can be extended without touching map UI code

### Wave B: Country Mode Completion

Goal:

- make country view useful for monitoring, not just visual browsing

Implementation tasks:

- add `topPublishers` to country aggregate payload
- add `topRegions` / `topCities` to country source payload
- add country-level hourly trend to drawer or left panel
- show method mix:
  - rss count
  - sitemap count
  - rss+sitemap overlap
- show health mix:
  - healthy
  - warning
  - degraded
  - failing
- refine dense metro interaction:
  - city-first cluster naming
  - stable sorting inside drawer
  - area subtitle for each source row
- add country geometry override table for high-risk multipolygon states
  - United States
  - Japan
  - France
  - Canada
  - Indonesia
  - Norway
  - Denmark
  - Australia

Acceptance criteria:

- country view answers:
  - which publishers dominate this country
  - which cities/regions are most active
  - whether this country is mostly RSS or sitemap
  - whether source health is degrading
- dense countries like Japan and South Korea remain readable without pixel hunting

### Wave C: Publisher Mode v1

Goal:

- let users inspect one publisher/company across countries and sources

Implementation tasks:

- build `GET /api/customer/dashboard/map/publishers`
- aggregate by publisher:
  - `pub24h`
  - `pub1h`
  - `activeCountries`
  - `activeSources`
  - `rssSources`
  - `sitemapSources`
  - `healthySources`
  - `degradedSources`
- add publisher search / selection in UI
- add publisher footprint globe state
- add publisher summary panel
- allow switching between:
  - total world view
  - one publisher footprint

Acceptance criteria:

- selecting a publisher clearly changes the map from country-total mode to publisher-network mode
- users can see cross-country footprint and reliability for a single media network

### Wave D: Operational Polish

Goal:

- make the map reliable and shareable as an internal operations surface

Implementation tasks:

- add URL state sync for:
  - country
  - publisher
  - layer
  - metric
  - zoom
- add explicit `live` vs `fallback` badge for data source provenance
- add reduced motion mode
- add persistent attribution footer
- add perf guardrails:
  - memoized geometry selection
  - short-lived route cache
  - demand-loaded detail fetches

Acceptance criteria:

- copied map URL restores current state
- users can tell whether they are looking at live DB data
- interaction remains responsive after country switches

## 18. Suggested Initial File Structure

```txt
app/map/page.tsx
app/api/customer/dashboard/map/countries/route.ts
app/api/customer/dashboard/map/publishers/route.ts
app/api/customer/dashboard/map/countries/[country]/sources/route.ts
app/api/customer/dashboard/map/sources/[sourceId]/route.ts
components/map/world-press-map-page.tsx
components/map/world-globe-view.tsx
components/map/country-map-view.tsx
components/map/map-control-panel.tsx
components/map/map-top-toolbar.tsx
components/map/source-detail-drawer.tsx
components/map/publisher-footprint-panel.tsx
components/map/map-legend.tsx
lib/map-metrics.ts
lib/map-queries.ts
lib/source-geo.ts
lib/publisher-groups.ts
```

## 19. MVP Cut Line

If scope must be reduced, MVP should still include:

- authenticated map page
- global country bubbles
- click into one country
- source markers on a flat map
- source drawer with `24h` and `1h`

Items that can wait:

- publisher footprint mode
- arc flows
- mini-map
- advanced animation
- article-level geo overlay

## 20. Open Questions

- What is the canonical source for publisher grouping?
- Do we already store reliable source coordinates, or do we need a new lookup table?
- Which source-health dimensions should be exposed to customers vs internal users?
- Should country view default to source method colors or health colors?
- Should publisher mode be part of v1 or land in v2?
