# Source Reliability Audit (2026-02-05)

## Scope
- Evaluated all 100 configured sources in `data/outlets.ts`.
- Output file: `audits/source_reliability_audit_2026-02-05.csv`.

## Method
1. Source-type classification
- `newsroom_direct_rss`
- `official_institution`
- `aggregated_query_feed` (Google News query RSS)
- `community_aggregator`
- `research_preprint_feed`
- `specialized_or_analysis`

2. Reliability tiering
- `high`: established newsroom RSS with explicit editorial process.
- `medium`: specialized analysis/trade/industry sources.
- `official_primary`: official institutions (authoritative for official statements only).
- `mixed`: community/user-submitted sources.
- `contextual`: preprint/research feeds (signal source; not equivalent to peer-reviewed reporting).
- `needs_review`: aggregated query feeds; underlying article reliability varies by returned source.

## Results
- Total: 100
- High: 30
- Medium: 35
- Official primary: 5
- Mixed: 1
- Contextual: 2
- Needs review: 27

## Key Risk Finding
- 27/100 are `news.google.com` query feeds.
- These are useful for coverage breadth but cannot be assigned a single newsroom-level trust rating.
- Recommendation: keep query feeds as optional or secondary, and prioritize direct newsroom RSS for core monitoring.

## Evidence References Used for Calibration
- Reuters Trust Principles: https://reutersagency.com/about/our-trust-principles/
- Reuters Journalistic Standards: https://reutersagency.com/about/standards-values/
- AP News Values & Principles: https://www.ap.org/about/news-values-and-principles/
- AP Principles PDF (corrections, standards): https://www.ap.org/wp-content/uploads/2024/02/ap-news-values-and-principles-1.pdf
- BBC Impartiality guideline (section 4): https://downloads.bbc.co.uk/guidelines/editorialguidelines/pdfs/bbc-editorial-guidelines-section-4-impartiality.pdf
- UN specialized agencies (WHO/IAEA context): https://www.un.org/en/about-us/specialized-agencies
- SEC official site: https://www.sec.gov/
- White House official directory listing (USAGov): https://www.usa.gov/federal-agencies/white-house
- Hacker News guidelines (user-submitted context): https://news.ycombinator.com/newsguidelines.html
- Al Jazeera network ownership/funding context: https://en.wikipedia.org/wiki/Al_Jazeera_Media_Network

## Notes
- This pass is a structured reliability screen, not a legal/forensic verification of each individual article.
- For newsroom ops, use `high` + `official_primary` as default-on, keep `needs_review` as opt-in.
