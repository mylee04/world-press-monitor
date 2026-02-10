# [PRD] PressLab Global Radar - Breaking-First Research Platform

## 1. Executive Summary

PressLab Global Radar is a breaking-news-first monitoring and drafting platform.
The first objective is to continuously monitor top-tier US/global sources, ingest high-quality article metadata with low latency, and generate journalist-ready Spanish drafts for LATAM publishing workflows.

This PRD is scoped for research and product validation.

## 2. Product Goals

1. Catch high-impact breaking signals from top journalistic sources as early as possible.
2. Keep ingestion quality high (freshness, source reliability, dedup quality, timestamp quality).
3. Reduce time-to-draft so journalists can approve and publish quickly.
4. Preserve editorial control: no automatic final publication without journalist confirmation.

## 3. Non-Goals

1. Fully autonomous publishing without human approval.
2. Full-article unauthorized replication pipelines.
3. Bot-evasion or protection-circumvention architecture.

## 4. Core User Workflow

1. Monitor detects breaking candidate from major sources.
2. System clusters related updates and ranks urgency/confidence.
3. AI generates Spanish draft (headline + body + source citations).
4. Journalist edits/approves in Writing workspace.
5. Approved draft is sent to Distribution workspace and published to selected channels.

## 5. Data Ingestion Strategy

### 5.1 Two Lanes

1. Breaking Lane (speed-first)
- Top 10 major sources (high signal, high trust).
- Fast polling window for latest updates.
- Tight ranking for breaking candidates.

2. Coverage Lane (completeness-first)
- Broader RSS/Sitemap/API source coverage.
- Larger window ingestion for context and backfill.
- Quality controls: dedup, source scoring, endpoint health.

### 5.2 Source Policy

1. Tier 1: Major trusted outlets and wires.
2. Tier 2: Secondary or regional expansion.
3. Tier 3: Exploratory sources (off by default until verified).

## 6. Ingestion Quality Requirements

1. Freshness
- Minimize lag from source publication to platform visibility.
- Track lag percentiles and stale-source alerts.

2. Reliability
- Endpoint success-rate monitoring by source and method.
- Circuit-breaker behavior on repeated endpoint failures.

3. Timestamp Accuracy
- Prefer source publication timestamps.
- Apply metadata enrichment where feed timestamps are weak.

4. Deduplication
- URL normalization + link hash clustering.
- Cross-source duplicate detection for same event.

## 7. Breaking Detection

### 7.1 Signals

1. Major-source recency spikes.
2. Breaking term patterns in headline/metadata.
3. Multi-source convergence in short windows.
4. Optional social signal (supplementary, not single point of truth).

### 7.2 Prioritization

1. Source confidence.
2. Event recency.
3. Cross-source confirmation count.
4. Topic criticality (politics, macro economy, security, disaster, etc.).

## 8. AI Workflow

### 8.1 Classification

1. Stage 1: instant keyword-based beat assignment.
2. Stage 2: async LLM refinement with confidence scoring.

### 8.2 Draft Generation

1. Auto-generate Spanish draft from structured metadata.
2. Include source links and publication context.
3. Keep model output editable and auditable in UI.

## 9. Journalist Experience

1. Live Feed showing latest RSS/Sitemap-ingested items.
2. Major Watch panel for Top 10 breaking overview.
3. Breaking Queue for queued candidates.
4. Writing workspace for review/edit/approval.
5. Distribution workspace for channel-specific copy and publishing.

## 10. KPIs

1. Ingestion latency (p50/p90).
2. Time-to-draft from first signal.
3. Journalist approval time.
4. Endpoint failure rate.
5. Duplicate rate.
6. Share of breaking candidates confirmed by journalists.

## 11. Architecture (Current Direction)

1. Frontend: Next.js + React.
2. Ingestion API: Next API routes with RSS/Sitemap proxy paths.
3. Storage: PostgreSQL with `external_news_articles` as canonical SoT (+ endpoint runs, optional legacy `ingested_articles` compatibility writes).
4. Serving model: DB-first read (`external_news_articles` first), optional live crawl fallback when DB is empty/stale.
5. Cache: optional Redis + in-memory response cache.
6. AI: LLM classification/draft generation services.
7. Ops: scheduled independent ingest worker + monitor/enrich/report scripts (always-on ingestion posture even when web app is down).
8. Health model: `/api/ops/health` exposes machine-readable `green/yellow/red` with threshold-based WARN/CRIT alerts.
9. Ops alerting includes ingest-gap detection (`OPS_ALERT_MAX_NO_INGEST_MINUTES`, default 10m) to catch stalled pipelines quickly.

## 12. Roadmap

### Phase 1 - Top10 Breaking Foundation

1. Top 10 major-source monitoring loop.
2. RSS/Sitemap live stream surfaced in dashboard.
3. Breaking queue -> writing draft flow.

### Phase 2 - Quality Hardening

1. Timestamp enrichment and dedup hardening.
2. Endpoint health analytics and alerting.
3. Source-policy automation (promote/demote by quality).
4. DB-first read SLOs (p95 response + DB freshness guardrails).
5. Hourly ops digest to Discord (ingest volume, source coverage, column-level quality, breaking ratio).

### Phase 3 - Publishing Acceleration

1. Faster drafting templates by beat.
2. Distribution automation per channel.
3. Editorial analytics for speed and hit-rate.

## 13. Example Scenario

A macroeconomy reporter monitors Top 10 sources.
When a US macro breaking story appears, PressLab detects it, creates a Spanish draft, and sends it to Writing.
After journalist confirmation, the story is distributed to LATAM publishing channels with minimal delay.
