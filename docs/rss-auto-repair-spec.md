# RSS Auto-Repair Spec

## Goal

Reduce avoidable RSS ingest loss without turning the atlas into an unsafe self-modifying system.

This auto-repair layer is intentionally conservative:

- Automatically apply only high-confidence canonical URL swaps.
- Automatically promote failed RSS endpoints to healthy official sitemap endpoints when the source match is exact.
- Automatically slow down repeated soft-403 RSS retries.
- Keep hard 403 / WAF / source-structure problems in a separate manual backlog.

## Problem classes

### 1. Canonical drift

The atlas URL is no longer the publisher's working canonical feed URL, but the same source has a recently successful official alternative.

Examples:

- `www` vs non-`www`
- trailing slash differences
- official query variants such as `?format=rss` or `?outputType=xml`
- official alternate host variants such as vendor feed hosts
- failed RSS replaced by a healthy official sitemap for the same source

### 2. Soft 403

The endpoint returns `403` intermittently or due to aggressive retry cadence, but a later retry or a browser-assisted fetch can still succeed.

Examples:

- CDN throttling
- soft bot score challenges
- sitemap endpoints that work in a browser helper but not in plain fetch

### 3. Hard 403 / WAF block

The endpoint is consistently blocked even with browser-assisted access.

Examples:

- Akamai/WAF challenge pages
- permanent anti-bot blocking
- origin-level deny rules

### 4. Structural source drift

The source still has public feeds, but the atlas points at the wrong section, the wrong host, or a dead path family.

This is not safe to auto-apply unless the replacement is strongly validated.

## Policy

### What is safe to auto-apply

A candidate may be auto-applied only if all of the following are true:

1. The current atlas URL exactly matches the latest failed URL for the same `country + source`.
2. The same `country + source` has a different recently successful official URL.
3. The successful URL returns `200`.
4. The successful URL returns RSS/Atom/XML content.
5. The candidate change is one of the approved safe classes:
   - `www` normalization
   - trailing slash normalization
   - same-host canonical query upgrade such as `format=rss` or `outputType=xml`
   - explicit source-level allowlisted host swap
   - `RSS -> sitemap` promotion for the exact same `country + source`
6. The successful URL has positive fetched item count.

### What must not auto-apply

- Hard `403` WAF cases
- Swaps that change source meaning or section scope without explicit allowlisting
- URL changes with no recent successful health signal
- Candidates that only succeed as HTML or empty payloads

## Runtime behavior

### Automatic branch

The safe branch does this:

1. Read latest RSS health status.
2. Detect candidate failed/success URL pairs for the same `country + source`.
3. Filter to atlas rows whose current URL still equals the failed URL.
4. Classify the swap.
5. Auto-apply only safe candidates.
6. If the safe class is `RSS -> sitemap` promotion:
   - clear `url`
   - set `sitemapUrl` to the healthy endpoint
   - keep the source name unchanged
7. Write audit artifacts.

Outputs:

- JSON report of candidates
- Markdown summary
- Updated atlas only when `--apply` is passed

### Manual branch

The manual branch does this:

1. Collect latest `403` failures.
2. Separate:
   - soft/cooldown candidates
   - browser-fallback candidates
   - hard 403/WAF cases
   - canonical swap candidates
3. Emit backlog artifacts for human review.

Outputs:

- JSON backlog
- Markdown backlog

## Operational flow

### Recommended recurring order

1. Run health checks.
2. Run safe canonical swap candidate report.
3. Auto-apply only safe candidates.
4. Run hard-403/manual backlog report.
5. Review remaining blockers by country and source family.

## Recommended thresholds

### Safe canonical swap

- Health lookback: `7` days
- Success fetched count: `> 0`
- Latest atlas URL must still equal the failed endpoint
- `RSS -> sitemap` promotion is allowed only when the source name matches exactly and the sitemap success is recent

### Soft 403 cooldown

- Applies to RSS endpoints
- Default: `2` recent `http_403` failures within `240` minutes
- Cooldown should reduce retry frequency, not permanently disable the source

### Hard 403 manual backlog

Treat as manual backlog when:

- Browser helper also fails, or
- Latest health still fails with `http_403`, and
- No safe canonical success alternative exists

## Decision boundaries

### Auto

- `www` / non-`www`
- trailing slash cleanup
- same-host official query upgrade
- explicit source allowlist host swap
- `RSS -> official sitemap` promotion for the same source

### Semi-auto

- Browser sitemap fallback host allowlist expansion
- Source-level canonical host family changes after fetch validation

### Manual

- Akamai / WAF blocked publishers
- ambiguous section swaps
- publishers whose official public feed strategy changed materially

## Expected impact

This design should help the pipeline in three ways:

1. Recover low-risk canonical drift automatically.
2. Recover dead RSS endpoints by moving exact-source traffic to healthy sitemaps.
3. Stop wasting ingest time on repeated soft-403 retries.
4. Keep hard blockers visible without letting them poison the atlas.

It is intentionally not a full autonomous repair system.

The atlas is treated as a high-value ingestion control plane, so automatic mutation stays narrow and explainable.
