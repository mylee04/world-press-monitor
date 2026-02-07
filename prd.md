# [PRD] PressLab: US + LATAM Radar (AI-Powered News Monitor)

## 1. Executive Summary

An intelligent dashboard system that monitors US and LATAM news outlets in real time, filters by specific newsroom and beat, and helps journalists instantly track competitor coverage.

## 2. Core Goals

- Real-time ingestion: Index the latest articles every 5–15 minutes, bypassing RSS blocks.
- Precise filtering: Auto-classify by outlet and by beat (politics, tech, business, etc.).
- Low latency: Minimize the time from ingestion to dashboard display.
- No full-text extraction: Operate on links and metadata only to avoid copyright issues and improve speed.
- Geo scope lock (V1): US + LATAM only (`Chile`, `Argentina`, `Uruguay` priority).

## 3. Features and Technical Requirements

### 3.1 Data Ingestion Engine

Adopt the proxy and sitemap strategy from World Monitor.

**Multi-Source Ingestion**
- RSS feeds: Primary ingestion channel.
- Sitemap XML: Parse `sitemap.xml` for outlets where RSS is blocked (better for detecting fresh updates).
- External API: Integrate Business Radar (Netherlands startup) for bulk and backup coverage.

**Anti-Blocking Strategy**
- Edge Functions: Use Vercel/Cloudflare Edge as a request proxy to avoid IP blocks.
- Circuit Breakers: If a site fails, pause for 5 minutes before retrying to avoid overload.

### 3.2 Two-Stage AI Classification Pipeline

Optimize World Monitor's core logic for PressLab beat classification.

**Stage 1: Keyword Classifier (Instant)**
- Use a predefined keyword dictionary (e.g., "Apple" -> Tech, "Election" -> Politics) to show results immediately in the UI.

**Stage 2: LLM Refinement (Async)**
- Use Groq (e.g., Llama 3.1 8B) for background classification.
- Replace the keyword result with the LLM's higher-precision result based on confidence score.

### 3.3 Filtering and Dashboard (V1 Scope)

- Newsroom filtering: Assign tiers by outlet (Tier 1: major, Tier 2: local, etc.).
- Beat/topic tagging: Real-time streams by LLM-extracted tags.
- Geo-coding: Extract locations from headlines and render a map-based interface (MapLibre/Deck.gl).
- Region hard filter: only US and LATAM feeds are enabled in V1.

### 3.4 PressLab UX Modules (Newsroom-First)

The dashboard should prioritize newsroom workflow over generic OSINT complexity.

**Top Command Bar**
- Quick monitor switching (`Saved Monitor` presets).
- Global refresh control (15s / 60s / 300s).
- Command search (`Cmd/Ctrl + K`) for outlets, beats, and commands.
- V1 top-left filtering component:
  - Region: `US`, `LATAM`, `US + LATAM`
  - Country (LATAM): `Chile`, `Argentina`, `Uruguay`
  - Beat: `general`, `politics`, `business`, `tech`, `security`, `climate`, `world`
  - Source policy: `verified_core`, `keep_secondary`, `manual_review`

**Sources Modal**
- Searchable list of all enabled outlets.
- Bulk actions: `Select all` / `Select none`.
- Tier-aware source chips and country metadata.
- Must support fast morning workflow for reporters selecting 3-10 competitor sources.

**Panel Settings Modal**
- Toggle visibility for core panels.
- Persist panel visibility in browser storage.
- Minimum panel set for MVP:
  - Global Map
  - Live TV Wall
  - Live Feed
  - Country Daily Brief
  - Speed Board
  - Beat Mix
  - Spike Alerts

**Saved Monitors**
- Save current outlet + beat + refresh state as a named preset.
- Reapply preset in one click.
- Use browser-local persistence for MVP, with Redis-backed shared presets as post-MVP option.

### 3.7 Live TV Wall Policy (Business Decision Log)

Decision date: February 6, 2026

PressLab adds a 6-slot Live TV wall for passive situational awareness, adapted from the World Monitor implementation pattern.

**Playback and Safety Rules**
- 6 simultaneous YouTube embeds in a 3+3 side wall.
- Default all tiles to muted playback.
- Only one tile may be unmuted at a time (single-audio policy).
- If a tile is unmuted and another tile is unmuted, previous tile is forced back to mute.

**Channel Set Rules**
- `Major Journal 6ch` mode:
  - fixed to curated US + LATAM channels.
- `Custom` mode:
  - user can choose channels per slot.
  - layout persists in browser local storage.
  - slot changes auto-save in custom mode.

**Current Default 6ch (Implementation Snapshot)**
- Left: `NBC News`, `LiveNOW from FOX`, `CBS News`
- Right: `TN (Argentina)`, `C5N (Argentina)`, `La Nacion+ (Argentina)`
- Dropdown remains enabled per tile so users can switch to other available channels.

**Live Resolution / Fallback Rules**
- Per channel, system checks `/@handle/live` and extracts active `videoId`.
- If no live stream is detected or request fails, fallback video ID is used.
- Live resolution is cached for 5 minutes to reduce request load.

### 3.8 Map Clock + Country Daily Brief

Decision date: February 6, 2026

To support newsroom workflows across desks/timezones, map UI and country summary behavior are standardized:

**Map Time Display**
- Map panel shows continuously updating clock in `UTC` as the system-of-record.
- Map panel also shows major regional clocks for newsroom context (e.g., New York, London, Dubai, Seoul).

**Country Click Behavior**
- Clicking a map marker sets active country context.
- Dashboard renders `Daily Country Brief` for the selected country.
- At low zoom, map shows country-level aggregate bubbles (count-first view).
- At high zoom, map switches to article-level markers (story-first view).
- Brief groups daily stories into:
  - Politics
  - Social
  - Business
  - General Life
- Each group shows count + top headline set (metadata only, no full text extraction).

### 3.11 Regional Focus Strategy (Business Decision Log)

Decision date: February 6, 2026

PressLab V1 is newsroom-first and region-focused. Coverage prioritizes US and LATAM sources, with Chile/Argentina/Uruguay as LATAM priority markets.

**Volume Baseline (Business Assumption)**
- US outlet universe: ~6,000
- LATAM outlet universe: ~1,000
- Implication: US requires tiered aggregation strategy; LATAM Southern Cone can run direct-priority source strategy.

**Guiding Principle**
- Breadth is secondary.
- Coverage depth and speed for US + LATAM desks is mandatory.

**Source Tiers for V1 Coverage**
- `Tier A (US Core)`: US major national outlets and wire services.
- `Tier B (LATAM Core)`: LATAM local-language publishers with editorial reliability.
- `Tier C (Portal/Hub)`: Google News site-scoped adapters for LATAM resilience.

**US Strategy ("Ocean")**
- Tier 1 (direct): national US leaders and wire feeds.
- Tier 2 (bucketed): state/local desks via scoped aggregators to reduce endpoint overhead.
- Tier 3 (long tail): optional API/aggregator backfill (post-MVP).

**LATAM Strategy ("Sniper")**
- Direct-priority for top publishers in:
  - Chile
  - Argentina
  - Uruguay
- Country-local publishers are balanced by editorial diversity and update frequency.

**LATAM Seed Outlets (V1 initial)**
- Argentina: Clarín, La Nación, Infobae, Perfil, Página/12
- Chile: El Mercurio, La Tercera, BioBioChile, Emol
- Uruguay: El País, El Observador, Montevideo Portal

**V1 Target Regions / Countries**
- United States (`en`)
- LATAM:
  - Chile (`es`)
  - Argentina (`es`)
  - Uruguay (`es`)

**V1 Portal Examples**
- Google News site-scoped RSS for target LATAM publishers.
- Additional portal adapters only where legal/technical constraints permit.

**Language Layer (V1)**
- English (`en`) and Spanish (`es`) only.
- Add Spanish beat-keyword support for stage-1 classification:
  - politics: `política`, `gobierno`, `elecciones`
  - business: `economía`, `finanzas`, `mercado`, `negocios`
  - tech: `tecnología`, `software`, `ia`, `ciberseguridad`

**Ingestion & Compliance Rules**
- Prefer official APIs/RSS/sitemaps first.
- Use portal/search adapters only where terms and robots policies permit.
- No full article body storage by default; keep metadata + canonical link.

**Data Model Requirements**
- Each ingested item must include:
  - `country`
  - `language`
  - `sourceType` (`global` | `local` | `portal`)
- Deduplication must run cross-language for same-event clustering.
- Metadata persistence (V1.1):
  - persist deduplicated feed items in `ingested_articles`
  - dedupe key: normalized canonical link hash
  - maintain `first_seen_at`, `last_seen_at`, `seen_count` for ingestion replay/audit
  - retain metadata only (no full article body).

**Ranking Policy in Country View**
- For US: prioritize US core sources.
- For LATAM: prioritize Spanish local sources first; wire/global secondary.

### 3.11.1 Adapter Verification Gate (Execution Rule)

Decision date: February 6, 2026

Before enabling any country-local source by default, PressLab must run an HTTP verification check and assign one of:
- `ok_xml`: reachable and parseable RSS/Sitemap XML.
- `blocked`: reachable but blocked by anti-bot/rate-limit/auth.
- `not_found`: endpoint removed or invalid.
- `network_error`: infra/network lookup failure during probe environment.
- `unexpected_content`: reachable but not valid feed/sitemap payload.

**Implementation (Current Scope: US + LATAM)**
- LATAM verification script: `scripts/verify-latam-sources.ts`
- US/LATAM health script (24h volume + failure): `scripts/report-us-latam-health.ts`
- Expansion promotion script:
  - dry-run: `scripts/promote-expansion-sources.ts`
  - apply: `scripts/promote-expansion-sources.ts --apply`

**Runbook Commands**
- `bun run verify:latam-sources`
- `bun run report:us-latam-health`
- `bun run promote:expansion` (dry-run decision report)
- `bun run promote:expansion:apply` (updates promoted expansion set in `data/outlets.ts`)

**KR Legacy Note**
- KR-specific scripts/audits are archived under `archive/kr/` and are not part of V1 operations.

**Auto-disable Rule**
- If a source is marked `deprecate_candidate` **2 runs in a row**, automation adds it to `DEPRECATED_OUTLETS`.
- `DEPRECATED_OUTLETS` are excluded from source list and presets by default.
- State is tracked in policy history audit artifacts.

### 3.11.2 Source Scale Expansion (US100 + LATAM50)

Decision date: February 6, 2026

V1 source universe is expanded to support newsroom-level breadth while preserving operational safety.

**Current Scale**
- Total configured sources: `150`
- US: `100`
- LATAM (AR/CL/UY): `50`

**Operational Safety Model**
- Expansion candidates are tagged `exploratory_off_by_default` and excluded from `Default Live`.
- Promotion to operational set is rule-based using health report metrics:
  - `recent_24h >= 5`
  - `failure_rate <= 0.2`
- Promotions are persisted in `PROMOTED_EXPANSION` in `data/outlets.ts`.

**Commands**
- `bun run report:us-latam-health`
- `bun run promote:expansion`
- `bun run promote:expansion:apply`

### 3.12 World LATAM Filter + Beat Balance

Decision date: February 6, 2026

To align with newsroom usage (US desks still covering LATAM), `world` handling is split into two layers:

- `world_latam` detection:
  - Source-country signal: `LATAM`, `Argentina`, `Chile`, `Uruguay`.
  - Headline entity signal: LATAM terms such as `Argentina`, `Chile`, `Uruguay`, `Santiago`, `Buenos Aires`, `Montevideo`, `Mercosur`, `Latin America`.
- Hybrid rule:
  - A story is `world_latam` if **country is LATAM** OR **headline entity matches LATAM**.
- UI behavior:
  - Beat `world` supports `LATAM related` (default) and `All world`.
  - `world_latam` chip is shown in the feed for matching stories.

### 3.13 Volume Target and Mix Governance

Decision date: February 6, 2026

PressLab daily operating target is:

- `15,000` metadata items / 24h (raw).

To avoid `world` overconcentration while scaling:

- Re-tag a portion of portal state/metro sources into `business`, `politics`, and `tech`.
- Apply lower per-source caps only to broad `world` portal sources (state/metro/world-broad buckets).
- Keep non-world beats less constrained to preserve category diversity.

### 3.14 Reporting KPIs (US + LATAM)

Decision date: February 6, 2026

Daily reports must include:

- Raw volume and target attainment (`raw vs 15000`).
- Unique by source and unique cross-source.
- Dedupe rates:
  - within-source
  - cross-source
- Distinct domains and active newsrooms.
- World LATAM coverage:
  - `world_latam / world_total` (% of world)
  - split by US sources vs LATAM sources.
- `bun run promote:expansion:apply`

### 3.15 Realtime Ops and Cache Warming (Execution Decision Log)

Decision date: February 7, 2026

To stabilize latency and reduce repeated full fetches across 2k+ sources, V1 uses a warm-cache operating model.

**Warm Strategy**
- Add warm endpoint: `GET /api/news-warm`
- Warm cadence: every `300s` (5 minutes)
- Warm scopes:
  - `limit=15000` (24h view)
  - `limit=6000` (shorter windows)
- Warm target: `defaultEnabled` outlet set, chunked execution for reliability.

**Warm Status**
- Add status mode: `GET /api/news-warm?mode=status`
- Status returns latest successful warm summary (`elapsedMs`, requests, success/failure, total items).
- Discord report reads status first; if no prior status exists, report flow may trigger one warm run.

**Cache Architecture**
- `/api/news` cache layers:
  - memory cache (short TTL)
  - Redis cache (Upstash, cross-process)
- Cache diagnostics:
  - endpoint: `GET /api/news-cache-health`
  - counters: requests, memory/redis hits, misses, writes, skip/fail reasons.
- Metrics persistence:
  - keep counters in Redis to avoid per-process reset effects.

**Published Time Quality Controls**
- Feed parsing must not trust channel-level timestamps (`lastBuildDate` removed from primary date extraction).
- For top N feed items, fetch article page metadata and prefer:
  - `article:published_time`
  - `og:published_time`
  - JSON-LD `datePublished`
- Apply guardrails to reject implausible timestamp jumps.

**GNews Usage Policy**
- GNews is supplementary in V1, not the primary real-time source path.
- Primary path remains RSS + Sitemap + Google/Bing RSS.
- Rationale: free-tier API delays and strict request caps make it unsuitable as sole breaking source.

**Operational Commands**
- `bun run warm:once`
- `bun run warm:loop`
- `bun run warm:daemon:start`
- `bun run warm:daemon:status`
- `bun run warm:daemon:logs`
- `bun run warm:daemon:stop`
- `bun run report:daily-sources`
- `bun run notify:discord-daily:dry`

### 3.16 Query Matrix Default Policy (US)

Decision date: February 7, 2026

- `US Query Matrix` (state/metro x category keyword seeds) is default ON in V1.
- Query matrix sources are no longer treated as `exploratory_off_by_default`.
- Purpose:
  - increase recall for beat-specific competitor monitoring
  - support daily target throughput with category-aware state/metro capture.

### 3.17 Breaking -> Draft -> Distribution Pipeline (Core Workflow)

Decision date: February 7, 2026

PressLab V1 now treats this as a primary newsroom flow:

1. Detect breaking candidates from live ingestion.
2. Auto-generate Spanish draft in Writing.
3. Human edit + approval.
4. Generate platform-specific distribution copy.

**Writing Tab (Implemented)**
- Breaking discovery action fetches recent feed and selects candidates by:
  - `breaking` tag or breaking keyword signal
  - freshness window (recent hours)
- For each candidate, system calls `POST /api/ai/draft` and stores:
  - Spanish headline
  - Spanish body draft
  - source metadata and status
- Editor can:
  - regenerate draft
  - edit headline/body
  - approve and send to Distribution

**Distribution Tab (Implemented)**
- Takes approved drafts and calls `POST /api/ai/repurpose`.
- Generates channel-specific content:
  - Tweet Generator
  - Instagram post
  - LinkedIn post
  - TikTok caption
  - Newsletter format
- Editor can:
  - edit each channel copy
  - copy content
  - mark as published

**State Model (V1)**
- Local PostgreSQL-first persistence for draft/distribution records.
- Browser local storage remains as offline fallback when DB is unavailable.
- Draft states:
  - `draft`
  - `approved`
  - `published`
- Post-MVP migration path:
  - move draft/distribution state to shared DB (Supabase/Postgres)
  - add role-based approval and real publish connectors.

### 3.11.3 Daily Ops Reporting and Discord Delivery

Decision date: February 6, 2026

Daily ingestion reporting is standardized for developer operations and team visibility.

**Report Scope**
- US + LATAM only
- 24h totals, region split, error-source counts, top sources
- Artifacts:
  - `audits/source_daily_counts_YYYY-MM-DD.csv`
  - `audits/source_daily_counts_YYYY-MM-DD.md`

**Discord Delivery**
- Bilingual summary (`EN` + `ES`) via webhook.
- Scripts:
  - `bun run report:daily-sources` (generate report only)
  - `bun run report:daily-sources:notify` (generate + send Discord)
  - `bun run notify:discord-daily:dry` (preview payload without sending)

### 3.12 Country Intelligence Layer (Business Decision Log)

Decision date: February 6, 2026

To make regional monitoring operational for newsroom users, PressLab adds three country-intelligence controls on top of US + LATAM ingestion.

**A. Country Intake Filter**
- Country feed supports intake filter:
  - `all`
  - `local only`
  - `portal only`
- Filter is applied after country selection and before article ranking.

**B. Cross-Language Duplicate Clustering**
- Items are clustered into same-event groups using newsroom-safe heuristics:
  - same country
  - same beat
  - close publish window
  - title similarity and/or shared location signal
- Feed displays cluster metadata (`cluster size`) and can prioritize latest representative items.

**C. Country Source Quality Ranking**
- Country panel computes per-source quality score using:
  - reliability policy tag (`verified_core`, `keep_secondary`, etc.)
  - source type (`local`, `portal`, `global`)
  - freshness (median lag)
  - local-language ratio in selected country window
- Ranking is shown as a top source list for editorial triage.

### 3.9 Competitive Intelligence Analytics

**Speed Board**
- For each source, show article count and freshness in selected time window.
- Calculate `median lag` and `latest publish time`.
- Purpose: identify who is fastest for selected beat/topic.

**Beat Mix**
- Show distribution of selected beat labels in current result set.
- Helps reporters verify whether selected sources are over-indexed to a beat.

**Spike Alerts**
- Compare current beat volume against short baseline windows.
- Trigger alert when beat count exceeds configurable threshold (MVP: simple ratio-based threshold).

**Coverage Gap (Post-MVP)**
- Flag stories appearing in competitor set but missing in newsroom's watched set.
- Requires newsroom source group configuration.

### 3.10 Classification Transparency

- Every article must display:
  - `classification_source` (`keyword` or `llm`)
  - `classification_reason` (matched keyword or fallback reason)
- If keyword fallback is used, UI should explicitly show fallback status.
- If LLM overrides keyword, preserve a short reason from model response.

## 4. System Architecture (Proposed Tech Stack)

| Category | Stack | Notes |
| --- | --- | --- |
| Frontend | React / Next.js / Tailwind CSS | Fast dashboard build |
| Edge API | Vercel Edge Functions | High-performance proxy and API layer |
| Database/Cache | Redis (Upstash) | Real-time news data and AI result caching |
| AI Inference | Groq (Llama 3.1) | Ultra-fast async classification |
| Deployment | Vercel | Minimal infra management |

## 5. Roadmap

**Phase 1: MVP**
- Lock scope to US + LATAM only.
- Build RSS/Sitemap/Portal ingestion for US major outlets + LATAM (`Chile`, `Argentina`, `Uruguay`) priority outlets.
- Expand source universe to US100 + LATAM50 with staged promotion workflow.
- Implement top-left filtering (Region / Country / Beat / Source Policy).
- Implement source-health ops panel for developers.
- Set up proxy server using Vercel Edge.

**Phase 2: AI Expansion**
- Integrate Groq API for automated beat classification.
- Expand LATAM outlet pool and improve Spanish-language classification quality.
- Add deduplication logic and command search actions.

**Phase 3: Analytics**
- Trend spike alerts (anomaly detection).
- Comparative speed analysis by outlet.
- Coverage gap detection between competitor and internal watchlists.
- Warm daemon productionization:
  - switch `NEWS_WARM_URL` from localhost to deployment URL
  - replace local daemon dependency with platform scheduler/cron for `/api/news-warm`
  - keep `mode=status` report integration for Discord ops.
- Reporting performance optimization:
  - `report:daily-sources`: fast DB-backed operational report (from `ingested_articles` + `ingestion_endpoint_runs`)
  - `audit:daily-sources`: network-heavy verification report for audit accuracy

## 6. MVP Acceptance Criteria

- Reporter can select sources from searchable modal in under 10 seconds.
- Reporter can save and reload at least 5 monitor presets locally.
- Feed cards show beat + tier + classification source + classification reason.
- Speed Board updates with each refresh cycle and reflects selected filters.
- Spike Alerts display at least one alert when beat volume crosses threshold.
- V1 only displays sources from US + LATAM scope.
- LATAM filter supports Chile/Argentina/Uruguay selection.
- Dev ops panel shows per-source ingestion failures and zero-yield sources in real time.
- Dev ops panel exposes 24h ingestion KPIs from PostgreSQL:
  - unique items
  - duplicate candidates/rate
  - endpoint runs/failure rate
  - top sources by 24h volume

## 8. V1 Execution Plan (US + LATAM)

1. Scope Lock (Day 1)
- Disable Europe/Asia/non-target source presets by default.
- Introduce region/country gating at source-selection level.

2. Source Set Rebuild + Expansion (Day 1-2)
- Core operational set: US + LATAM direct/prioritized outlets.
- Expansion set: US Top100 + LATAM Top50 candidate pool.
- Keep expansion candidates default OFF until health-based promotion.
- Tag each source with reliability policy and default state.

3. Filter UX (Day 2)
- Add top-left region/country filter controls.
- Ensure feed/map/speed board read from same filtered dataset.

4. Ingestion Reliability (Day 2-3)
- Run verification and auto-policy scripts daily.
- Apply 2-strike deprecation automation for failing sources.

5. V1 Readout (Day 3)
- Publish daily source-volume report (US/LATAM only, per-source counts, region split, top sources).
- Optional Discord bilingual (`EN`/`ES`) daily summary.
- Share ops panel screenshots and acceptance checklist with team.

## 7. Source Reliability Governance (Business Decision Log)

Decision date: February 5, 2026

PressLab will not treat all configured feeds as equally trusted. Source operations will follow a reliability policy with explicit default states.

### 7.1 Audit Scope and Outputs

- Audited all configured 100 feeds.
- Audit artifacts:
  - `audits/source_reliability_audit_2026-02-05.csv`
  - `audits/source_reliability_audit_2026-02-05.md`
  - `audits/source_needs_review_resolution_2026-02-05.csv`
  - `audits/source_needs_review_resolution_2026-02-05.md`

### 7.2 Audit Outcome (Current)

- High: 30
- Medium: 35
- Official primary: 5
- Mixed/contextual: 3
- Needs review: 27 (Google News query feeds)

### 7.3 Operating Policy

- `verified_core`: default ON, used for primary newsroom monitoring.
- `keep_secondary`: default ON, used as secondary corroboration feeds.
- `exploratory_off_by_default`: default OFF, optional opt-in exploration feeds.
- `manual_review`: default OFF until explicit editorial approval.

### 7.4 Implemented Product Defaults

- Introduced `Default Live` preset:
  - excludes `exploratory_off_by_default` and `manual_review`.
- Introduced `Verified Core` preset:
  - highest-confidence operational set.
- UI displays each source policy tag in source selection modal.

### 7.5 Change Management Rule

- Any source addition/removal or policy-tag change must:
  - update `data/outlets.ts`,
  - update audit files under `audits/`,
  - include a short decision note in this PRD section.

## User Scenario

"Erika, a business reporter, refreshes five competitor business sections every morning. Now she selects 'Economist + Bloomberg + WSJ' in PressLab Global Radar and applies the 'Macro Economy' beat filter. Her dashboard shows only the newly published economic articles from those three outlets in real time."
