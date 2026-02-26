# Changelog

기록 규칙:
- 커밋마다 `CHANGELOG.md` 맨 위에 최신 항목이 쌓입니다.
- 새 항목은 실행할 때마다 자동으로 현재 커밋 정보를 기반으로 추가됩니다.

## Unreleased

### [868e4e3] feat: add sustained RSS failure watchlist and auto-disable workflow
- Commit: 868e4e32c272ad69f16e29cfafe8c655afdd64fb
- Date: 2026-02-26 10:10:26 +0300
- Author: Myungeun Lee
  - Changed files:
    - M	.github/workflows/rss-health-daily.yml
    - M	.github/workflows/wpm-hourly-report.yml
    - M	README.md
    - M	package.json
    - A	scripts/rss-failure-watchlist.ts
  - Git stat:
  - .github/workflows/rss-health-daily.yml  |  12 +
  -  .github/workflows/wpm-hourly-report.yml |  34 ++-
  -  README.md                               |  14 +-
  -  package.json                            |   6 +
  -  scripts/rss-failure-watchlist.ts        | 429 ++++++++++++++++++++++++++++++++
  -  5 files changed, 490 insertions(+), 5 deletions(-)

### [f68a61b] changelog: add missed entries for healthz/lockfile fixes
- Commit: f68a61b4a0061a7c9a51308e7842cc1aeaae4829
- Date: 2026-02-24 09:22:23 -0600
- Author: Kevinlee49
  - Changed files:
    - M	CHANGELOG.md
  - Git stat:
  - CHANGELOG.md | 10 ++++++++++
  -  1 file changed, 10 insertions(+)

### [9008c48] changelog: record latest lockfile and /healthz fixes
- Commit: 9008c482703ba970aebc1fcf80eea9fbb9f6f41a
- Date: 2026-02-24 09:22:08 -0600
- Author: Kevinlee49
  - Changed files:
    - M	CHANGELOG.md
  - Git stat:
  - CHANGELOG.md | 23 ++++++++++++++++++++++-
  -  1 file changed, 22 insertions(+), 1 deletion(-)

### [14eed07] fix: unblock /healthz for render checks and refresh bun lockfile
- Commit: 14eed0709915fb985266d0d1f1624b3cede13807
- Date: 2026-02-24 09:17:21 -0600
- Author: Kevinlee49
  - Changed files:
    - M	bun.lock
    - M	scripts/api-news.ts
  - Git stat:
  - bun.lock            | 48 +-----------------------------------------------
  - scripts/api-news.ts | 20 ++++++++++----------
  - 2 files changed, 11 insertions(+), 57 deletions(-)

### [59c796d] ci: relax security audit install lockfile mode
- Commit: 59c796d9f510138092a584202c43d28314cbe5a2
- Date: 2026-02-24 08:33:29 -0600
- Author: Kevinlee49
  - Changed files:
    - M	.github/workflows/security-audit.yml
  - Git stat:
  - .github/workflows/security-audit.yml | 2 +-
  -  1 file changed, 1 insertion(+), 1 deletion(-)

### [37901c1] fix: bump next and pin esbuild override for security audit
- Commit: 37901c1124794ae8c7d46771b6e564e28eced1c4
- Date: 2026-02-24 08:21:15 -0600
- Author: Kevinlee49
  - Changed files:
    - M	bun.lock
    - M	package.json
  - Git stat:
  - bun.lock     | 95 +++++++++++++++++++++++++++++-------------------------------
  -  package.json |  5 +++-
  -  2 files changed, 50 insertions(+), 50 deletions(-)

### [55702c4] Fix health check type union issue
- Commit: 55702c47edec47391fe0d9ebea5842e99136bb1f
- Date: 2026-02-24 08:13:30 -0600
- Author: Kevinlee49
  - Changed files:
    - M	lib/ingestion-store.ts
  - Git stat:
  - lib/ingestion-store.ts | 1 +
  -  1 file changed, 1 insertion(+)

### [8770584] Add lightweight health probe and bounded DB health check
- Commit: 877058404c79700a0f2bca6bff6fc5dde3cfaa02
- Date: 2026-02-24 08:13:07 -0600
- Author: Kevinlee49
  - Changed files:
    - M	lib/ingestion-store.ts
    - M	scripts/api-news.ts
  - Git stat:
  - lib/ingestion-store.ts | 61 ++++++++++++++++++++++++++++++++++++++++++++++++++
  -  scripts/api-news.ts    | 52 +++++++++++++++++++++++++++++++++++++-----
  -  2 files changed, 107 insertions(+), 6 deletions(-)

### [0dc35e7] chore: tighten retention policy, security hardening, and workflow cleanup
- Commit: 0dc35e7299e36708023641c7b006aa9f7368cdb7
- Date: 2026-02-24 00:16:43 -0600
- Author: Kevinlee49
  - Changed files:
    - M	.github/workflows/ingest-weekly-gh.yml
    - M	.github/workflows/rss-health-daily.yml
    - M	.github/workflows/security-audit.yml
    - M	.github/workflows/wpm-hourly-ingest.yml
    - M	.github/workflows/wpm-hourly-report.yml
    - M	CHANGELOG.md
    - M	README.md
    - M	audits/readme_network_precheck_latest.json
    - M	audits/readme_rss_health_latest.json
    - A	data/new-rss-atlas-only-added.json
    - A	data/new-rss-atlas-second-wave-only.json
    - M	data/rss-catalog.csv
    - M	data/rss-catalog.opml
    - M	lib/ingestion-store.ts
    - M	scripts/api-news.ts
    - M	scripts/fetch-news-api.sh
    - M	scripts/ingest-retention.ts
    - M	scripts/ingest-worker.ts
    - M	scripts/rss-health-daily.ts
    - M	scripts/run-ingest-hourly.sh
  - Git stat:
  - .github/workflows/ingest-weekly-gh.yml     |     3 +
  -  .github/workflows/rss-health-daily.yml     |     8 +-
  -  .github/workflows/security-audit.yml       |     2 +-
  -  .github/workflows/wpm-hourly-ingest.yml    |     3 +
  -  .github/workflows/wpm-hourly-report.yml    |     3 +
  -  CHANGELOG.md                               |    14 +
  -  README.md                                  |  1394 +--
  -  audits/readme_network_precheck_latest.json |    40 +-
  -  audits/readme_rss_health_latest.json       | 13668 +--------------------------
  -  data/new-rss-atlas-only-added.json         |   221 +
  -  data/new-rss-atlas-second-wave-only.json   |   253 +
  -  data/rss-catalog.csv                       |  2174 ++---
  -  data/rss-catalog.opml                      |  2176 ++---
  -  lib/ingestion-store.ts                     |    32 +-
  -  scripts/api-news.ts                        |   637 +-
  -  scripts/fetch-news-api.sh                  |    71 +-
  -  scripts/ingest-retention.ts                |    18 +-
  -  scripts/ingest-worker.ts                   |     4 +-
  -  scripts/rss-health-daily.ts                |     5 +-
  -  scripts/run-ingest-hourly.sh               |    16 +-
  -  20 files changed, 3844 insertions(+), 16898 deletions(-)

### [bf15a17] chore(security): add dependency audit pipeline with secure lockfile fallback
- Commit: bf15a1786d14093b513120ab6d9e0b63e5eac423
- Date: 2026-02-23 23:38:10 -0600
- Author: Kevinlee49
  - Changed files:
    - A	.github/workflows/security-audit.yml
    - M	package.json
    - A	scripts/security-audit.ts
  - Git stat:
  - .github/workflows/security-audit.yml |  37 ++++++++
  -  package.json                         |   2 +
  -  scripts/security-audit.ts            | 167 +++++++++++++++++++++++++++++++++++
  -  3 files changed, 206 insertions(+)

### [49456d6] security: harden diagnostics output and shell input handling
- Commit: 49456d6b79f636acf0a503f23ccdcda9fc0893dc
- Date: 2026-02-23 23:14:59 -0600
- Author: Kevinlee49
  - Changed files:
    - M	CHANGELOG.md
    - M	lib/ingestion-store.ts
    - M	scripts/api-news.ts
    - M	scripts/bootstrap-wpm-db.sh
    - M	scripts/changelog-append.ts
    - M	scripts/fetch-news-api.sh
    - M	scripts/ingest-worker.ts
    - M	scripts/rss-health-daily.ts
    - M	scripts/verify-readme-rss.ts

  - Message:
  - - add DB URL redaction in bootstrap logs
  - 
  - - enforce safe BASE_URL validation and URL-encode query params in fetch-news-api helper
  - 
  - - sanitize command output and truncate audit/report logs to reduce secret leakage
  - 
  - - write audit JSON artifacts with strict 0600 permissions
  - 
  - - apply redaction to RSS health pipeline error outputs
  - 
  - - commit includes security-focused hardening for items 6 and 7 in the recent review

  - Git stat:
  - CHANGELOG.md                 |  38 ++++++
  -  lib/ingestion-store.ts       |  32 ++++-
  -  scripts/api-news.ts          | 302 +++++++++++++++++++++++++++++--------------
  -  scripts/bootstrap-wpm-db.sh  |  23 +++-
  -  scripts/changelog-append.ts  |  27 ++--
  -  scripts/fetch-news-api.sh    |  62 ++++++---
  -  scripts/ingest-worker.ts     | 166 ++++++++++++++++++++++--
  -  scripts/rss-health-daily.ts  |  27 +++-
  -  scripts/verify-readme-rss.ts |  47 +++++--
  -  9 files changed, 573 insertions(+), 151 deletions(-)

### [ecaaf08] security: harden diagnostics output and shell input handling
- Commit: ecaaf085e9d62a59fc9479dd551f473757af2de1
- Date: 2026-02-23 23:14:59 -0600
- Author: Kevinlee49
  - Changed files:
    - M	lib/ingestion-store.ts
    - M	scripts/api-news.ts
    - M	scripts/bootstrap-wpm-db.sh
    - M	scripts/changelog-append.ts
    - M	scripts/fetch-news-api.sh
    - M	scripts/ingest-worker.ts
    - M	scripts/rss-health-daily.ts
    - M	scripts/verify-readme-rss.ts

  - Message:
  - - add DB URL redaction in bootstrap logs
  - 
  - - enforce safe BASE_URL validation and URL-encode query params in fetch-news-api helper
  - 
  - - sanitize command output and truncate audit/report logs to reduce secret leakage
  - 
  - - write audit JSON artifacts with strict 0600 permissions
  - 
  - - apply redaction to RSS health pipeline error outputs
  - 
  - - commit includes security-focused hardening for items 6 and 7 in the recent review

  - Git stat:
  - lib/ingestion-store.ts       |  32 ++++-
  -  scripts/api-news.ts          | 302 +++++++++++++++++++++++++++++--------------
  -  scripts/bootstrap-wpm-db.sh  |  23 +++-
  -  scripts/changelog-append.ts  |  27 ++--
  -  scripts/fetch-news-api.sh    |  62 ++++++---
  -  scripts/ingest-worker.ts     | 166 ++++++++++++++++++++++--
  -  scripts/rss-health-daily.ts  |  27 +++-
  -  scripts/verify-readme-rss.ts |  47 +++++--
  -  8 files changed, 535 insertions(+), 151 deletions(-)

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
