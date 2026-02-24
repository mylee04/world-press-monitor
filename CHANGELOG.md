# Changelog

기록 규칙:
- 커밋마다 `CHANGELOG.md` 맨 위에 최신 항목이 쌓입니다.
- 새 항목은 실행할 때마다 자동으로 현재 커밋 정보를 기반으로 추가됩니다.

## Unreleased

### [9c275af] chore: add changelog tracking scaffolding and auto-append helper
- Commit: 9c275af5bdf15bba69f1119d6138fae2a4665ecb
- Date: 2026-02-23 22:09:58 -0600
- Author: Kevinlee49
  - Changed files:
    - A	.githooks/post-commit
    - A	CHANGELOG.md
    - M	package.json
    - A	scripts/changelog-append.ts
    - A	scripts/setup-changelog-hook.sh
  - Git stat:
  - .githooks/post-commit           | 13 ++++++
  -  CHANGELOG.md                    | 52 ++++++++++++++++++++++
  -  package.json                    |  1 +
  -  scripts/changelog-append.ts     | 99 +++++++++++++++++++++++++++++++++++++++++
  -  scripts/setup-changelog-hook.sh |  7 +++
  -  5 files changed, 172 insertions(+)

### [13a8972] feat: add RSS health telemetry, stability scoring, and retention controls for ingest reliability
- Commit: 13a8972523a9c97af47bd40d44b6e737fd812237
- Date: 2026-02-23 22:01:00 -0600
- Author: Kevinlee49
  - Changed files:
    - M	.github/workflows/rss-health-daily.yml
    - M	README.md
    - M	audits/readme_network_precheck_latest.json
    - M	audits/readme_rss_health_latest.json
    - M	data/rss-atlas.json
    - M	data/rss-catalog.csv
    - M	data/rss-catalog.opml
    - M	db/schema.sql
    - M	lib/ingestion-store.ts
    - M	package.json
    - M	scripts/export-rss-catalog.ts
    - A	scripts/ingest-retention.ts
    - M	scripts/ingest-worker.ts
    - A	scripts/rss-feed-stability-daily.ts
    - A	scripts/run-ingestion-retention.sh
    - A	scripts/run-rss-feed-stability-daily.sh
    - M	scripts/verify-readme-rss.ts
  - Git stat:
  - .github/workflows/rss-health-daily.yml     |   16 +
  -  README.md                                  | 2338 +++++++++---------
  -  audits/readme_network_precheck_latest.json |   14 +-
  -  audits/readme_rss_health_latest.json       | 3574 ++++++++++++++++++----------
  -  data/rss-atlas.json                        |  772 +++++-
  -  data/rss-catalog.csv                       | 2088 ++++++++--------
  -  data/rss-catalog.opml                      |  118 +-
  -  db/schema.sql                              |   18 +
  -  lib/ingestion-store.ts                     |  214 +-
  -  package.json                               |    3 +
  -  scripts/export-rss-catalog.ts              |    2 +
  -  scripts/ingest-retention.ts                |   98 +
  -  scripts/ingest-worker.ts                   |  243 +-
  -  scripts/rss-feed-stability-daily.ts        |  462 ++++
  -  scripts/run-ingestion-retention.sh         |   31 +
  -  scripts/run-rss-feed-stability-daily.sh    |   30 +
  -  scripts/verify-readme-rss.ts               |  163 +-
  -  17 files changed, 6750 insertions(+), 3434 deletions(-)

- Changelog tracking initialized.

