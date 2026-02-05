# [PRD] PressLab: Global Radar (AI-Powered News Monitor)

## 1. Executive Summary

An intelligent dashboard system that monitors hundreds of global news outlets in real time, filters by specific newsroom and beat, and helps journalists instantly track competitor coverage.

## 2. Core Goals

- Real-time ingestion: Index the latest articles every 5–15 minutes, bypassing RSS blocks.
- Precise filtering: Auto-classify by outlet and by beat (politics, tech, business, etc.).
- Low latency: Minimize the time from ingestion to dashboard display.
- No full-text extraction: Operate on links and metadata only to avoid copyright issues and improve speed.

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

### 3.3 Filtering and Dashboard

- Newsroom filtering: Assign tiers by outlet (Tier 1: major, Tier 2: local, etc.).
- Beat/topic tagging: Real-time streams by LLM-extracted tags.
- Geo-coding: Extract locations from headlines and render a map-based interface (MapLibre/Deck.gl).

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
- Build RSS/Sitemap ingestion for 10 major outlets.
- Implement a simple keyword-based filtering dashboard.
- Set up a proxy server using Vercel Edge.

**Phase 2: AI Expansion**
- Integrate Groq API for automated beat classification.
- Expand coverage via Business Radar API.
- Add deduplication logic.

**Phase 3: Analytics**
- Trend spike alerts (anomaly detection).
- Comparative speed analysis by outlet.

## User Scenario

"Erika, a business reporter, refreshes five competitor business sections every morning. Now she selects 'Economist + Bloomberg + WSJ' in PressLab Global Radar and applies the 'Macro Economy' beat filter. Her dashboard shows only the newly published economic articles from those three outlets in real time."
