# Needs-Review Resolution (2026-02-05)

- Total reviewed: 27
- Input subset: entries marked `needs_review` in `source_reliability_audit_2026-02-05.csv`

## Bucket Counts
- wire_domain_scoped_query: 5
- official_via_google_query: 6
- broad_topic_query_feed: 9
- reputable_domain_scoped_query: 5
- unknown_domain_scoped_query: 2

## Action Counts
- keep_primary_or_replace_with_direct: 5
- keep_secondary: 11
- exploratory_off_by_default: 9
- manual_review: 2

## Recommended Operating Policy
- `keep_primary_or_replace_with_direct`: wire domain-scoped queries(Reuters/AP)
- `keep_secondary`: official/reputable site-scoped Google query feeds
- `exploratory_off_by_default`: broad topic query feeds (regional/theme bundles)
- `manual_review`: unknown or ambiguous domain scopes
