# PressLab Data Dictionary

Last updated: 2026-02-13
Source of truth: `db/schema.sql`

## Scope
This document defines table/column meanings, defaults, and allowed values.
If this document conflicts with code, follow `db/schema.sql`.

## Value Policy
- `Allowed values (enforced)`: constrained by DB `CHECK`/`UNIQUE`/type or relational constraints.
- `Allowed values (convention)`: currently `text` columns without strict enum constraints. Application logic may still expect specific values.

## Tables

### `external_news_articles`
Canonical article metadata store.

| Column | Type | Nullable | Default | Allowed values | Notes |
|---|---|---|---|---|---|
| `external_id` | `text` | No | - | Enforced: primary key | Normalized article identity |
| `publication_datetime` | `timestamptz` | No | - | Any timestamp | Publication time |
| `publication_source` | `text` | No | `'feed'` | Convention: `feed`, `article_meta`, `ai_article` (or other app-defined values) | Source of publication time |
| `publication_verified` | `boolean` | No | `false` | `true`/`false` | Whether publication time is verified |
| `category` | `text` | No | - | Any text | Beat/category |
| `title_en` | `text` | Yes | `NULL` | Any text | English title |
| `title_original` | `text` | No | - | Any text | Original language title |
| `summary_en` | `text` | Yes | `NULL` | Any text | English summary |
| `summary_original` | `text` | Yes | `NULL` | Any text | Original summary |
| `summary_source` | `text` | No | `'feed'` | Convention: `feed`, `article_meta`, `ai_article` (or other app-defined values) | Summary provenance |
| `summary_verified` | `boolean` | No | `false` | `true`/`false` | Summary QA flag |
| `author_name` | `text` | Yes | `NULL` | Any text | Author name |
| `author_email` | `text` | Yes | `NULL` | Any text | Author email |
| `author_source` | `text` | No | `'feed'` | Convention: `feed`, `article_meta`, `ai_article` (or other app-defined values) | Author provenance |
| `author_verified` | `boolean` | No | `false` | `true`/`false` | Author QA flag |
| `quality_score` | `integer` | No | `0` | Enforced: `0..100` | Quality score |
| `country` | `text` | Yes | `NULL` | Any text | Country tag |
| `created_at` | `timestamptz` | No | `now()` | Any timestamp | Insert time |
| `last_seen_at` | `timestamptz` | No | `now()` | Any timestamp | Last seen in ingestion |
| `url` | `text` | No | - | Any text | Original URL |
| `source` | `text` | No | - | Any text | Publisher/source label |
| `is_paywalled` | `boolean` | No | `false` | `true`/`false` | Paywall flag |
| `language` | `text` | Yes | `NULL` | Any text | Language code/label |
| `seen_count` | `integer` | No | `1` | Enforced: `>= 1` | Observed duplicate counter |
| `url_norm` | `text` | Yes | `NULL` | Any text | Normalized URL |
| `url_hash` | `text` | Yes | `NULL` | Any text | Hash of normalized URL |

### `social_breaking_posts`
Social-provider breaking candidates.

| Column | Type | Nullable | Default | Allowed values | Notes |
|---|---|---|---|---|---|
| `id` | `bigserial` | No | auto | Enforced: primary key | Row ID |
| `provider` | `text` | No | `'x'` | Convention: `x` (current), extensible | Social platform |
| `account_handle` | `text` | No | - | Any text | Account identifier |
| `post_id` | `text` | No | - | Enforced with `provider`: unique pair | Provider-native post ID |
| `post_url` | `text` | No | - | Any text | Canonical post URL |
| `author_name` | `text` | Yes | `NULL` | Any text | Display author |
| `published_at` | `timestamptz` | No | - | Any timestamp | Provider publish time |
| `title` | `text` | No | - | Any text | Extracted headline/text |
| `content` | `text` | Yes | `NULL` | Any text | Optional full content |
| `language` | `text` | Yes | `NULL` | Any text | Language |
| `country` | `text` | Yes | `NULL` | Any text | Country |
| `tags` | `jsonb` | No | `'[]'::jsonb` | Valid JSON array/object | Classification tags |
| `breaking_score` | `integer` | No | `0` | Any integer | Heuristic score |
| `is_breaking` | `boolean` | No | `false` | `true`/`false` | Breaking decision |
| `created_at` | `timestamptz` | No | `now()` | Any timestamp | Inserted time |

### `breaking_queue`
Publishing queue for breaking items.

| Column | Type | Nullable | Default | Allowed values | Notes |
|---|---|---|---|---|---|
| `id` | `bigserial` | No | auto | Enforced: primary key | Row ID |
| `source_kind` | `text` | No | `'social_x'` | Convention: `social_x` and future values | Queue source type |
| `source_ref` | `text` | No | - | Enforced: unique | External reference key |
| `title` | `text` | No | - | Any text | Candidate title |
| `link` | `text` | No | - | Any text | Candidate link |
| `summary` | `text` | Yes | `NULL` | Any text | Optional summary |
| `language` | `text` | Yes | `NULL` | Any text | Language |
| `country` | `text` | Yes | `NULL` | Any text | Country |
| `status` | `text` | No | `'new'` | Enforced: `new`, `queued`, `dismissed`, `processing`, `published` | Queue state |
| `priority` | `integer` | No | `0` | Any integer | Priority |
| `created_at` | `timestamptz` | No | `now()` | Any timestamp | Created time |
| `updated_at` | `timestamptz` | No | `now()` | Any timestamp | Updated time |

### `radar_summary_queue`
Async queue for article summarization.

| Column | Type | Nullable | Default | Allowed values | Notes |
|---|---|---|---|---|---|
| `id` | `bigserial` | No | auto | Enforced: primary key | Row ID |
| `article_external_id` | `text` | No | - | Enforced: unique + FK -> `external_news_articles.external_id` | One queue row per article |
| `status` | `text` | No | `'pending'` | Convention: `pending`, `processing`, `done`, `error`, `skipped` | Not DB-enforced enum currently |
| `attempt_count` | `integer` | No | `0` | Any integer | Retry counter |
| `next_retry_at` | `timestamptz` | No | `now()` | Any timestamp | Backoff scheduling |
| `last_error` | `text` | Yes | `NULL` | Any text | Last failure reason |
| `provider` | `text` | Yes | `NULL` | Convention: model provider name | LLM provider |
| `model` | `text` | Yes | `NULL` | Any text | Model identifier |
| `started_at` | `timestamptz` | Yes | `NULL` | Any timestamp | Processing start |
| `completed_at` | `timestamptz` | Yes | `NULL` | Any timestamp | Processing end |
| `created_at` | `timestamptz` | No | `now()` | Any timestamp | Created time |
| `updated_at` | `timestamptz` | No | `now()` | Any timestamp | Updated time |

### `radar_summary_usage_daily`
Daily provider usage accounting.

| Column | Type | Nullable | Default | Allowed values | Notes |
|---|---|---|---|---|---|
| `usage_date` | `date` | No | - | Valid date | Usage day |
| `provider` | `text` | No | - | Any text | Provider name |
| `request_count` | `integer` | No | `0` | Any integer | Request counter |
| `updated_at` | `timestamptz` | No | `now()` | Any timestamp | Updated time |

Primary key: (`usage_date`, `provider`)

### `radar_summary_fetch_logs`
Per-attempt diagnostics for context extraction.

| Column | Type | Nullable | Default | Allowed values | Notes |
|---|---|---|---|---|---|
| `id` | `bigserial` | No | auto | Enforced: primary key | Row ID |
| `queue_id` | `bigint` | Yes | `NULL` | FK -> `radar_summary_queue.id` | Nullable for retained diagnostics |
| `article_external_id` | `text` | Yes | `NULL` | Any text | Article reference |
| `domain` | `text` | No | `'unknown'` | Any text | Extracted domain |
| `attempt_count` | `integer` | No | `1` | Any integer | Attempt number |
| `latency_ms` | `integer` | No | - | Any integer | Fetch latency |
| `outcome` | `text` | No | - | Convention: app-defined outcome labels | Fetch result class |
| `failure_code` | `text` | Yes | `NULL` | Convention: app-defined codes | Failure taxonomy |
| `http_status` | `integer` | Yes | `NULL` | HTTP status integer | Optional status |
| `used_fallback` | `boolean` | No | `false` | `true`/`false` | Fallback path used |
| `context_source` | `text` | No | - | Convention: app-defined source labels | Context generation source |
| `created_at` | `timestamptz` | No | `now()` | Any timestamp | Created time |

### `drafts`
Draft articles for editorial workflow.

| Column | Type | Nullable | Default | Allowed values | Notes |
|---|---|---|---|---|---|
| `id` | `text` | No | - | Enforced: primary key | Draft ID |
| `source_article_id` | `text` | No | - | Any text | Upstream article reference |
| `source` | `text` | No | - | Any text | Source label |
| `source_link` | `text` | No | - | Any text | Original URL |
| `source_title` | `text` | No | - | Any text | Original title |
| `source_published_at` | `timestamptz` | No | - | Any timestamp | Publication time |
| `status` | `text` | No | `'draft'` | Enforced: `draft`, `approved`, `published` | Editorial state |
| `headline_es` | `text` | No | - | Any text | Spanish headline |
| `body_es` | `text` | No | - | Any text | Spanish body |
| `created_at` | `timestamptz` | No | `now()` | Any timestamp | Created time |
| `updated_at` | `timestamptz` | No | `now()` | Any timestamp | Updated time |
| `approved_at` | `timestamptz` | Yes | `NULL` | Any timestamp | Approval time |
| `published_at` | `timestamptz` | Yes | `NULL` | Any timestamp | Publish time |
| `auto_queued_from` | `text` | Yes | `NULL` | Any text | Queue origin metadata |

### `distribution_content`
Per-platform distribution payloads.

| Column | Type | Nullable | Default | Allowed values | Notes |
|---|---|---|---|---|---|
| `id` | `bigserial` | No | auto | Enforced: primary key | Row ID |
| `draft_id` | `text` | No | - | Enforced: FK -> `drafts.id` | Parent draft |
| `platform` | `text` | No | - | Enforced: `twitter`, `instagram`, `linkedin`, `tiktok`, `newsletter` | Target platform |
| `content` | `text` | No | - | Any text | Final content |
| `is_published` | `boolean` | No | `false` | `true`/`false` | Publication flag |
| `updated_at` | `timestamptz` | No | `now()` | Any timestamp | Updated time |

Unique key: (`draft_id`, `platform`)

### `ingested_articles`
Legacy/compatibility operational index.

| Column | Type | Nullable | Default | Allowed values | Notes |
|---|---|---|---|---|---|
| `id` | `bigserial` | No | auto | Enforced: primary key | Row ID |
| `link` | `text` | No | - | Any text | Original URL |
| `link_norm` | `text` | No | - | Any text | Normalized URL |
| `link_hash` | `text` | No | - | Enforced: unique | Dedup identity |
| `outlet_id` | `text` | Yes | `NULL` | Any text | Outlet key |
| `title` | `text` | No | - | Any text | Title |
| `source` | `text` | No | - | Any text | Publisher |
| `published_at` | `timestamptz` | No | - | Any timestamp | Published time |
| `country` | `text` | Yes | `NULL` | Any text | Country |
| `language` | `text` | Yes | `NULL` | Any text | Language |
| `source_type` | `text` | Yes | `NULL` | Any text | Source type |
| `tier` | `smallint` | Yes | `NULL` | Any smallint | Tier |
| `beat` | `text` | Yes | `NULL` | Any text | Beat |
| `classification_source` | `text` | Yes | `NULL` | Any text | Classification provenance |
| `classification_reason` | `text` | Yes | `NULL` | Any text | Classification reason |
| `confidence` | `real` | Yes | `NULL` | Any float | Confidence score |
| `world_latam` | `boolean` | No | `false` | `true`/`false` | World-LATAM classifier |
| `tags` | `jsonb` | No | `'[]'::jsonb` | Valid JSON array/object | Tags |
| `first_seen_at` | `timestamptz` | No | `now()` | Any timestamp | First seen |
| `last_seen_at` | `timestamptz` | No | `now()` | Any timestamp | Last seen |
| `seen_count` | `integer` | No | `1` | Enforced: `>= 1` | Duplicate count |

### `ingestion_endpoint_runs`
Ingestion endpoint execution diagnostics.

| Column | Type | Nullable | Default | Allowed values | Notes |
|---|---|---|---|---|---|
| `id` | `bigserial` | No | auto | Enforced: primary key | Row ID |
| `ran_at` | `timestamptz` | No | `now()` | Any timestamp | Run timestamp |
| `runner` | `text` | No | `'api_news'` | Convention: `api_news` and worker labels | Caller/executor |
| `outlet_id` | `text` | No | - | Any text | Outlet key |
| `source` | `text` | No | - | Any text | Source label |
| `method` | `text` | No | - | Convention: ingestion method labels | Fetch method |
| `attempted` | `boolean` | No | `false` | `true`/`false` | Attempt flag |
| `circuit_open` | `boolean` | No | `false` | `true`/`false` | Circuit breaker state |
| `ok` | `boolean` | No | `false` | `true`/`false` | Success flag |
| `status_code` | `integer` | Yes | `NULL` | Integer | HTTP-like status |
| `parsed_count` | `integer` | No | `0` | Any integer | Parsed item count |
| `parsed_limit` | `integer` | Yes | `NULL` | Any integer | Applied cap |
| `sample_capped` | `boolean` | No | `false` | `true`/`false` | Sampling cap used |
| `recent24h` | `integer` | No | `0` | Any integer | Recent 24h count |
| `error` | `text` | Yes | `NULL` | Any text | Error detail |

## Notes for `publication_source` and similar fields
These are currently modeled as `text` with defaults, not strict enums.
Recommended operational values (convention):
- `feed`: directly from RSS/Atom or upstream feed metadata
- `article_meta`: extracted from parsed article metadata
- `ai_article`: inferred/derived via AI processing

If strict governance is required, add DB `CHECK` constraints and update this file.
