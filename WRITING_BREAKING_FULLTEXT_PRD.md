# Writing Breaking Full-Text Draft PRD

## 1) Objective
Improve Writing quality for breaking events by letting the system read full article text **only for breaking items**, then generating a Spanish-neutral draft.

Key requirements:
- Full-text is used only to generate derived outputs (draft + summaries).
- Full-text is **not stored** in the database.
- No paywall/bot-protection bypass or evasion logic.
- If full-text fetch is blocked/short/failed, fall back to metadata-only drafting.

## 2) Scope

In scope:
- Breaking-only full-text extraction via Firecrawl.
- GLM-based draft generation.
- Domain whitelist enforcement.
- Strict output formatting and safety rules to reduce verbatim copying.

Out of scope:
- Paywall/Cloudflare bypass tactics.
- Archive/cache bypass.
- Persisting raw HTML/body text.

## 3) Architecture

### Current flow (before)
- Research detects breaking -> UI calls `POST /api/ai/draft` with title/source/link.
- Draft is generated from metadata only.

### New flow (this PRD)
- When breaking draft generation occurs, `/api/ai/draft` optionally:
  1. Uses Firecrawl to extract main content text (in-memory only).
  2. Sends extracted text to GLM to generate `headlineEs` + `bodyEs`.
  3. Returns the draft to the client.
  4. Client persists the draft through `/api/drafts` as before.

No raw article body is persisted server-side.

## 4) Policy Constraints
- Only run full-text mode when:
  - `WRITING_FULLTEXT_ENABLED=true`
  - `WRITING_FULLTEXT_ALLOWED_DOMAINS` contains the article domain
  - `FIRECRAWL_API_KEY` is configured
  - `GLM_API_KEY` is configured
- If blocked/empty/too short: fall back to existing Groq/fallback path.

## 5) Environment Variables

Required for full-text drafting:
- `WRITING_FULLTEXT_ENABLED=true`
- `WRITING_FULLTEXT_ALLOWED_DOMAINS=cnn.com,apnews.com,...`
- `FIRECRAWL_API_KEY=...`
- `GLM_API_KEY=...`

Optional knobs:
- `FIRECRAWL_API_BASE_URL` (default `https://api.firecrawl.dev/v1`)
- `WRITING_FULLTEXT_TIMEOUT_MS` (default `15000`)
- `WRITING_FULLTEXT_MAX_CHARS` (default `12000`)
- `WRITING_GLM_MODEL` (default `glm-4.7-flash`, falls back to `RADAR_GLM_MODEL`)

## 6) Output Contract
`POST /api/ai/draft` returns JSON:
- `headlineEs` (string)
- `bodyEs` (string)
- `source` (one of: `glm_fulltext`, `llm`, `fallback`)

## 7) Success Criteria
- Breaking drafts contain concrete facts (names/places/time) more reliably than metadata-only drafts.
- Median latency stays acceptable for interactive drafting.
- Full-text mode is controllable by env and safe by default.
