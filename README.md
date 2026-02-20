# World Press Monitor RSS Atlas

![TypeScript](https://img.shields.io/badge/TypeScript-5.7.3-3178c6?logo=typescript&logoColor=white)
![Bun](https://img.shields.io/badge/Bun-1.2-000000?logo=bun)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Ready-336791?logo=postgresql&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-blue)

Maintenance-focused project for RSS source cataloging, feed validation, and periodic collection checks.

Open-source project goals:

- Maintain a clean global RSS source catalog with a clear signal of healthy vs broken feeds.
- Enable reproducible daily/cron verification and catalog exports.
- Keep PRs simple: add source URLs, run validation, and commit only source changes.

Suggested GitHub tags: `rss`, `news`, `feed`, `typescript`, `postgresql`, `docker`, `bun`, `monitoring`

### Open-source metadata

Use `scripts/setup-github-metadata.sh` to set repository description and topics once:

```bash
bash scripts/setup-github-metadata.sh mylee04/world-press-monitor
```

You can also set them in GitHub settings manually.

## Country-level RSS Atlas

This list covers the currently configured countries and their RSS outlets.

- Covered countries:
🇺🇸 United States, 🇨🇳 China, 🇯🇵 Japan, 🇩🇪 Germany, 🇮🇳 India, 🇬🇧 United Kingdom, 🇫🇷 France, 🇮🇹 Italy, 🇨🇦 Canada, 🇷🇺 Russia, 🇰🇷 South Korea, 🇧🇷 Brazil, 🇦🇺 Australia, 🇪🇸 Spain, 🇲🇽 Mexico, 🇮🇩 Indonesia, 🇳🇱 Netherlands, 🇨🇭 Switzerland, 🇹🇷 Turkey, 🇸🇦 Saudi Arabia, 🇹🇼 Taiwan, 🇵🇱 Poland, 🇸🇪 Sweden, 🇧🇪 Belgium, 🇹🇭 Thailand, 🇮🇷 Iran, 🇦🇷 Argentina, 🇦🇹 Austria, 🇳🇴 Norway, 🇦🇪 United Arab Emirates

- Last checked: 02/19/2026
- `❌ NO_SOURCE` means no RSS source is configured for this country yet.
- `❌ 000` means not verified in the current environment yet.

## Health Check Workflow

- Source-of-truth config: `data/rss-atlas.json`
- Run one-time verification/update: `bun run verify:readme-rss`
- Run precheck only (DNS + sample HTTP) before full verification: `bun run verify:readme-rss --precheck` (or `bun run verify:readme-rss:precheck`)
  - If precheck fails (DNS/BASIC egress), command exits with `NO_NETWORK/DNS_BROKEN` and skips full verification.
- Run one-time verification + catalog export (with network precheck): `bun run rss:health:once`
- Run daily verify+prune+export in one step: `bun run rss:health:daily`
- Send Discord webhook on each run (optional): set `RSS_HEALTH_DISCORD_WEBHOOK_URL` (or `DISCORD_WEBHOOK_URL`) first
  - Optional: `RSS_HEALTH_DISCORD_MENTION`, `RSS_HEALTH_DISCORD_USERNAME`, `RSS_HEALTH_DISCORD_TIMEOUT_MS`
  - Disable for a run: `bun run rss:health:daily -- --no-discord`
  - `cron setup` also reads `./.env.local` automatically and embeds those values into the job.
- Set cron once for automatic daily run at 01:00 AM CST: `bun run rss:health:cron:setup`
- Remove cron: `bun run rss:health:cron:remove`
- Run only the scheduled daily task command once (for quick test): `bun run rss:health:cron:run`
- Ingest ops metrics
  - `bun run ingest:ops:hourly` (read last 1h from `ingest_ops_hourly`, write JSON)
  - `bun run ingest:ops:daily` (read last 1d from `ingest_ops_daily`, write JSON)
  - `bun run ingest:ops:cron:setup` installs two cron jobs:
    - hourly at minute 0 every hour
    - daily at 02:00 America/Chicago
  - optional envs:
    - `INGEST_OPS_RUNNER` (`worker|api_news|warm`, default `worker`)
    - `INGEST_OPS_METHOD` (`rss|sitemap`, optional)
  - remove cron: `bun run ingest:ops:cron:remove`
  - print cron entries: `bun run ingest:ops:cron:print`
  - quick run-hourly: `bun run ingest:ops:cron:run:hourly`
  - quick run-daily: `bun run ingest:ops:cron:run:daily`
- Ingest feed to database
  - `bun run ingest:once` (fetch+persist current batch immediately, default all enabled RSS/Sitemap feeds)
  - `bun run ingest:cron:setup` installs hourly ingestion at `:00` (default `America/Chicago`)
  - `bun run ingest:cron:remove`
  - `bun run ingest:cron:print`
  - optional env: `INGEST_TZ` (default `America/Chicago`), `INGEST_OUTLET_CHUNK_SIZE` (default all when unset in cron run)
 - News API (from persisted `news_articles`)
  - `bun run api:news:serve`
  - Endpoints:
    - `GET /health`
    - `GET /api/news?source=...&country=...&section=...&from=...&to=...&hours=...&limit=...&offset=...`
  - Required for startup:
    - `NEWS_API_TOKEN`
  - Optional env:
    - `NEWS_API_PORT` (default `4100`)
    - `NEWS_API_HOST` (default `0.0.0.0`)
    - `NEWS_API_CORS_ORIGINS` (comma-separated allowlist; empty => `*`)
  - incremental pull example (createdAt 기준):
    - `bun run api:news:incremental` (stores cursor in `.wpm-news-api-cursor.json`)
    - env vars:
      - `NEWS_API_BASE_URL` (default `http://127.0.0.1:4100`)
      - `NEWS_API_COUNTRY_FILTER` (comma-separated)
      - `NEWS_API_SOURCE_FILTER` (comma-separated)
      - `NEWS_API_SECTION_FILTER` (comma-separated)
      - `NEWS_API_OUTPUT_MODE` (`json|ndjson|summary`)
      - `NEWS_API_OVERLAP_SECONDS` (default `120`, overlap 윈도우 중복 완화)
      - `NEWS_API_CURSOR_FILE` (default `.wpm-news-api-cursor.json`)
  - one-shot curl example (createdAt 범위 지정):
    - `curl "http://127.0.0.1:4100/api/news?from=2026-02-19T00:00:00.000Z&to=2026-02-19T01:00:00.000Z&country=US&source=CBS%20News&limit=200"`
- News 집계
  - `bun run stats:news:by-country`
    - 출력을 기준으로 `articles_last_1h`, `articles_last_24h` 를 국가별로 확인 가능
- Generate editable backlog CSV for failures: `bun run rss:health:backlog`
- Optional focus only: `bun run rss:health:backlog -- --reasons=HTTP_404,HTML_RETURNED --limit=100`
- Export `data/rss-atlas.json` from the current README: `bun run atlas:export`
- Export CSV + OPML subscription catalogs from current atlas: `bun run atlas:export-catalog`
- Generated health reports are written to:
  - `audits/readme_rss_health_latest.json`
  - `audits/readme_rss_health_YYYY-MM-DD.json`
  - `audits/readme_network_precheck_latest.json` (when `--precheck` runs)
- Verify DB schema sync between `db/schema.sql` and `lib/ingestion-store.ts` startup DDL: `bun run db:check-schema-sync`
- Recreate/restart Postgres data for the main `wpm` DB (with optional presslab migration and schema sync): `bun run db:bootstrap-wpm`  
  - Use `bun run db:bootstrap-wpm -- --fresh` to drop and recreate the postgres volume
- Remove legacy tables from current DB (safe hints, dry-run by default): `bun run db:cleanup-legacy-tables`
  - Apply removals: `bun run db:cleanup-legacy-tables:apply`
  - Include all non-schema tables in cleanup (except migration metadata): `bun run db:cleanup-legacy-tables:all`
  - Apply broad cleanup: `bun run db:cleanup-legacy-tables:apply:all`
- `getent` + `nsswitch` checks are Linux-specific; on macOS they are intentionally marked `SKIP`.
- HTTP Status column now carries quick failure clues:
  - `ERR (DNS)`: domain lookup/host resolution failed
  - `ERR (TIMEOUT)`: request timed out
  - `ERR (TLS)`: certificate or TLS issue
  - `ERR (NETWORK)`: generic network failure
- Optional tuning envs:
  - `RSS_BATCH_SIZE` (default 30)
  - `RSS_BATCH_DELAY_MS` (default 500)
  - `RSS_REQUEST_TIMEOUT_MS` (default 15000)
  - `RSS_REQUEST_JITTER_MS` (default 150)
- Ingest ops cron tuning:
  - `INGEST_OPS_TZ` (default `America/Chicago`)
- Migrate search-aggregated sources (Google/Bing style URLs) to candidate official RSS URLs:
  - `RSS_MIGRATE_OFFLINE_MODE=1 bun run rss:migrate-official`
- Regenerate README from atlas after manual migration: `bun run atlas:export`
 











## Latest RSS verification snapshot

- Checked endpoints: `509`
- Valid: `509`
- Invalid: `0`
- No-source rows: `0`
- Snapshot date: `02/19/2026`
- Source artifact: `audits/readme_rss_health_latest.json`

### Failure reasons
|Reason|Count|
|---|---:|

### Invalid feeds by reason

### No-source rows
- none
### United States (US)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|The New York Times|<https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml>|200|02/19/2026|valid|
3|Wall Street Journal|<https://feeds.a.dj.com/rss/RSSWorldNews.xml>|200|02/19/2026|valid|
5|LA Times|<https://www.latimes.com/local/rss2.0.xml>|200|02/19/2026|valid|
6|CNN|<http://rss.cnn.com/rss/cnn_topstories.rss>|200|02/19/2026|valid|
7|Fox News|<http://moxie.foxnews.com/google-publisher/latest.xml>|200|02/19/2026|valid|
8|NBC News|<http://feeds.nbcnews.com/nbcnews/public/news>|200|02/19/2026|valid|
9|CBS News|<https://www.cbsnews.com/latest/rss/main>|200|02/19/2026|valid|
10|ABC News|<https://abcnews.go.com/abcnews/topstories>|200|02/19/2026|valid|
11|NPR|<https://feeds.npr.org/1001/rss.xml>|200|02/19/2026|valid|
14|HuffPost|<https://www.huffpost.com/section/front-page/feed>|200|02/19/2026|valid|
15|BuzzFeed News|<https://www.buzzfeednews.com/news.xml>|200|02/19/2026|valid|
17|Vox|<https://www.vox.com/rss/index.xml>|200|02/19/2026|valid|
19|CNBC|<https://www.cnbc.com/id/100003114/device/rss/rss.html>|200|02/19/2026|valid|
20|Financial Times|<https://www.ft.com/?format=rss>|200|02/19/2026|valid|
21|Forbes|<https://www.forbes.com/most-popular/feed/>|200|02/19/2026|valid|
22|Fortune|<https://fortune.com/feed>|200|02/19/2026|valid|
23|Business Insider|<https://www.businessinsider.com/rss>|200|02/19/2026|valid|
24|MarketWatch|<http://feeds.marketwatch.com/marketwatch/topstories/>|200|02/19/2026|valid|
27|Fast Company|<https://www.fastcompany.com/rss>|200|02/19/2026|valid|
28|TechCrunch|<https://techcrunch.com/feed/>|200|02/19/2026|valid|
29|The Verge|<https://www.theverge.com/rss/index.xml>|200|02/19/2026|valid|
30|Wired|<https://www.wired.com/feed/rss>|200|02/19/2026|valid|
31|Ars Technica|<http://feeds.arstechnica.com/arstechnica/index>|200|02/19/2026|valid|
32|Engadget|<https://www.engadget.com/rss.xml>|200|02/19/2026|valid|
33|VentureBeat|<https://venturebeat.com/feed/>|200|02/19/2026|valid|
34|Mashable|<https://mashable.com/feed>|200|02/19/2026|valid|
35|Gizmodo|<https://gizmodo.com/rss>|200|02/19/2026|valid|
36|CNET|<https://www.cnet.com/rss/news/>|200|02/19/2026|valid|
37|ZDNet|<https://www.zdnet.com/news/rss.xml>|200|02/19/2026|valid|
39|The Hill|<https://thehill.com/feed>|200|02/19/2026|valid|
40|Axios|<https://api.axios.com/feed/>|200|02/19/2026|valid|
41|Breitbart|<http://feeds.feedburner.com/breitbart>|200|02/19/2026|valid|
42|National Review|<https://www.nationalreview.com/feed/>|200|02/19/2026|valid|
43|Slate|<https://slate.com/feeds/all.rss>|200|02/19/2026|valid|
44|The New Yorker|<https://www.newyorker.com/feed/everything>|200|02/19/2026|valid|
45|The Atlantic|<https://www.theatlantic.com/feed/all/>|200|02/19/2026|valid|
60|Boston Globe|<https://www.bostonglobe.com/arc/outboundfeeds/rss?outputType=xml>|200|02/19/2026|valid|
64|New York Post|<https://nypost.com/feed>|200|02/19/2026|valid|
65|Chicago Tribune|<https://chicagotribune.com/feed>|200|02/19/2026|valid|
74|Seattle Times|<https://seattletimes.com/feed>|200|02/19/2026|valid|
75|Denver Post|<https://denverpost.com/feed>|200|02/19/2026|valid|
76|San Jose Mercury News|<https://mercurynews.com/feed>|200|02/19/2026|valid|
77|Las Vegas Review-Journal|<https://reviewjournal.com/feed>|200|02/19/2026|valid|
78|San Diego Union-Tribune|<https://sandiegouniontribune.com/feed>|200|02/19/2026|valid|
79|Honolulu Star-Advertiser|<https://staradvertiser.com/feed>|200|02/19/2026|valid|
80|Variety|<https://variety.com/feed>|200|02/19/2026|valid|
81|The Hollywood Reporter|<https://hollywoodreporter.com/feed>|200|02/19/2026|valid|
82|Deadline|<https://deadline.com/feed>|200|02/19/2026|valid|
83|Rolling Stone|<https://rollingstone.com/feed>|200|02/19/2026|valid|
84|Billboard|<https://billboard.com/feed>|200|02/19/2026|valid|
86|Vanity Fair|<http://feeds.feedburner.com/vfdotcomrss>|200|02/19/2026|valid|
87|Esquire|<https://www.esquire.com/rss/entertainment.xml>|200|02/19/2026|valid|
88|GQ|<https://www.gq.com/feed/rss>|200|02/19/2026|valid|
94|Space.com|<https://www.space.com/feeds/all>|200|02/19/2026|valid|
95|ESPN|<https://www.espn.com/espn/rss/news>|200|02/19/2026|valid|
96|Sports Illustrated|<https://si.com/feed>|200|02/19/2026|valid|
101|Mother Jones|<https://motherjones.com/feed>|200|02/19/2026|valid|
102|ProPublica|<https://propublica.org/feed>|200|02/19/2026|valid|
103|Reason|<https://reason.com/feed>|200|02/19/2026|valid|
104|Jacobin|<https://jacobin.com/feed>|200|02/19/2026|valid|
105|Quartz|<https://qz.com/feed>|200|02/19/2026|valid|
106|The Intercept|<https://theintercept.com/feed>|200|02/19/2026|valid|
109|Newsweek|<https://www.newsweek.com/rss>|200|02/19/2026|valid|
110|Time|<https://time.com/feed>|200|02/19/2026|valid|
111|PBS NewsHour|<https://www.pbs.org/newshour/feeds/rss/headlines>|200|02/19/2026|valid|

### China (CN)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
4|China Daily|<http://www.chinadaily.com.cn/rss/world_rss.xml>|200|02/19/2026|valid|
9|TechNode|<https://technode.com/feed>|200|02/19/2026|valid|
10|South China Morning Post|<https://www.scmp.com/rss/91/feed>|200|02/19/2026|valid|
11|Initium|<https://theinitium.com/feed>|200|02/19/2026|valid|
13|Liberty Times|<https://news.ltn.com.tw/rss/all.xml>|200|02/19/2026|valid|
23|People China|<https://people.com.cn/rss/politics.xml>|200|02/19/2026|valid|
24|South China Morning Post (Business)|<https://www.scmp.com/rss/91/feed>|200|02/19/2026|valid|
27|China Daily English|<https://www.chinadaily.com.cn/rss/world_rss.xml>|200|02/19/2026|valid|

### Japan (JP)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|NHK World (EN)|<https://www3.nhk.or.jp/rss/news/cat0.xml>|200|02/19/2026|valid|
2|Mainichi (Biz)|<https://mainichi.jp/rss/etc/english_latest.rss>|200|02/19/2026|valid|
3|Asahi Shimbun|<https://www.asahi.com/rss/asahi/newsheadlines.rdf>|200|02/19/2026|valid|
4|The Japan Times|<https://www.japantimes.co.jp/feed/>|200|02/19/2026|valid|
14|Automotive Ten-Navi|<https://automotive.ten-navi.com/rss/>|200|02/19/2026|valid|
15|The Bridge|<https://thebridge.jp/feed/>|200|02/19/2026|valid|
20|Nippon|<https://www.nippon.com/en/feed/>|200|02/19/2026|valid|
25|Mainichi Sports|<https://mainichi.jp/rss/etc/english_latest.rss>|200|02/19/2026|valid|
30|Mainichi World|<https://mainichi.jp/rss/etc/english_latest.rss>|200|02/19/2026|valid|

### Germany (DE)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|Handelsblatt - Top|<https://www.handelsblatt.com/contentexport/feed/top-themen>|200|02/19/2026|valid|
2|Handelsblatt - Finance|<https://www.handelsblatt.com/contentexport/feed/finanzen>|200|02/19/2026|valid|
3|Tagesschau|<https://www.tagesschau.de/xml/rss2>|200|02/19/2026|valid|
4|Der Spiegel|<https://www.spiegel.de/schlagzeilen/tops/index.rss>|200|02/19/2026|valid|
5|FAZ|<https://www.faz.net/rss/aktuell/>|200|02/19/2026|valid|
6|Die Zeit|<https://newsfeed.zeit.de/index>|200|02/19/2026|valid|
7|Manager Magazin|<https://www.manager-magazin.de/unternehmen/index.rss>|200|02/19/2026|valid|
8|WirtschaftsWoche|<https://www.wiwo.de/contentexport/feed/rss/schlagzeilen>|200|02/19/2026|valid|
9|Deutsche Welle (EN)|<https://rss.dw.com/xml/rss-en-all>|200|02/19/2026|valid|
10|Heise Online|<https://www.heise.de/rss/heise-atom.xml>|200|02/19/2026|valid|
12|Der Spiegel|<https://www.spiegel.de/schlagzeilen/index.rss>|200|02/19/2026|valid|
14|Die Welt|<https://www.welt.de/feeds/topnews.rss>|200|02/19/2026|valid|
16|Focus|<https://www.focus.de/rss/>|200|02/19/2026|valid|
17|Handelsblatt Economy|<https://www.handelsblatt.com/contentexport/feed/finanzen/>|200|02/19/2026|valid|
18|Frankfurter Allgemeine|<https://www.faz.net/rss/aktuell/wirtschaft/>|200|02/19/2026|valid|
20|Tagesspiegel|<https://www.tagesspiegel.de/contentexport/feed/>|200|02/19/2026|valid|
24|Handelsblatt World|<https://www.handelsblatt.com/contentexport/feed/wirtschaft>|200|02/19/2026|valid|
25|Zeit Welt|<https://newsfeed.zeit.de/wirtschaft/index>|200|02/19/2026|valid|
28|Financial Times Germany|<https://www.ft.com/rss/home>|200|02/19/2026|valid|

### India (IN)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|The Times of India (Top Stories)|<https://timesofindia.indiatimes.com/rssfeedstopstories.cms>|200|02/19/2026|valid|
2|NDTV (Latest)|<https://feeds.feedburner.com/NDTV-LatestNews>|200|02/19/2026|valid|
3|India Today (India)|<https://www.indiatoday.in/rss/1206578>|200|02/19/2026|valid|
4|The Indian Express|<https://indianexpress.com/feed>|200|02/19/2026|valid|
5|The Hindu (National)|<https://www.thehindu.com/news/national/?service=rss>|200|02/19/2026|valid|
6|Firstpost|<https://www.firstpost.com/commonfeeds/v1/mfp/rss/web-stories.xml>|200|02/19/2026|valid|
8|DNA India (India)|<https://www.dnaindia.com/feeds/india.xml>|200|02/19/2026|valid|
9|Storify News|<https://www.storifynews.com/feed>|200|02/19/2026|valid|
10|Amar Ujala (Breaking)|<https://www.amarujala.com/rss/breaking-news.xml>|200|02/19/2026|valid|
11|Odishabarta|<https://odishabarta.com/feed>|200|02/19/2026|valid|
12|The Times of Bengal|<https://thetimesofbengal.com/feed>|200|02/19/2026|valid|
13|Scroll.in|<https://feeds.feedburner.com/ScrollinArticles.rss>|200|02/19/2026|valid|
14|Northlines|<https://thenorthlines.com/feed>|200|02/19/2026|valid|
15|Chandigarh Metro|<https://chandigarhmetro.com/feed>|200|02/19/2026|valid|
16|Chandigarh City News|<https://feeds.feedburner.com/ChandigarhCityNews>|200|02/19/2026|valid|
17|The Quint|<https://prod-qt-images.s3.amazonaws.com/production/thequint/feed.xml>|200|02/19/2026|valid|
18|Telangana Today|<https://telanganatoday.com/feed>|200|02/19/2026|valid|
19|Daily Excelsior|<https://www.dailyexcelsior.com/feed>|200|02/19/2026|valid|
20|News Today (TN)|<https://newstodaynet.com/feed>|200|02/19/2026|valid|
21|IndiaVision|<https://www.indiavision.com/feed>|200|02/19/2026|valid|
22|OpIndia|<https://www.opindia.com/feed>|200|02/19/2026|valid|
23|OrissaPOST|<https://www.orissapost.com/feed>|200|02/19/2026|valid|
24|India's News.Net|<https://feeds.indiasnews.net/rss/701ee96610c884a6>|200|02/19/2026|valid|
25|TechGenYZ|<https://techgenyz.com/feed>|200|02/19/2026|valid|
27|WYM News (Blogspot)|<https://latestnewsupdate4you.blogspot.com/feeds/posts/default>|200|02/19/2026|valid|
28|Star of Mysore|<https://starofmysore.com/feed>|200|02/19/2026|valid|
29|ABP News|<https://news.abplive.com/home/feed>|200|02/19/2026|valid|
30|The India Bizz|<https://theindiabizz.com/feed>|200|02/19/2026|valid|

### United Kingdom (GB)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|Financial Times - World|<https://www.ft.com/rss/world>|200|02/19/2026|valid|
2|Financial Times - Energy|<https://www.ft.com/rss/companies/energy>|200|02/19/2026|valid|
3|BBC News - Business|<https://feeds.bbci.co.uk/news/business/rss.xml>|200|02/19/2026|valid|
4|BBC News - World|<https://feeds.bbci.co.uk/news/world/rss.xml>|200|02/19/2026|valid|
5|The Guardian - World|<https://www.theguardian.com/world/rss>|200|02/19/2026|valid|
6|The Guardian - Business|<https://www.theguardian.com/business/rss>|200|02/19/2026|valid|
7|Sky News - World|<https://feeds.skynews.com/feeds/rss/world.xml>|200|02/19/2026|valid|
8|Sky News - Business|<https://feeds.skynews.com/feeds/rss/business.xml>|200|02/19/2026|valid|
9|Telegraph - Business|<https://www.telegraph.co.uk/business/rss.xml>|200|02/19/2026|valid|
10|City A.M. (London Finance)|<https://www.cityam.com/feed/>|200|02/19/2026|valid|
13|The Independent|<https://www.independent.co.uk/rss>|200|02/19/2026|valid|
14|Financial Times UK|<https://www.ft.com/?format=rss>|200|02/19/2026|valid|
17|The Telegraph UK|<https://www.telegraph.co.uk/rss.xml>|200|02/19/2026|valid|
19|Daily Mail|<https://www.dailymail.co.uk/home/index.rss>|200|02/19/2026|valid|
21|Metro UK|<https://metro.co.uk/feed/>|200|02/19/2026|valid|
22|The Sun|<https://www.thesun.co.uk/feed/>|200|02/19/2026|valid|
23|The Guardian UK|<https://www.theguardian.com/uk/rss>|200|02/19/2026|valid|
24|Sky News|<https://feeds.skynews.com/feeds/rss/uk.xml>|200|02/19/2026|valid|
25|Financial Times|<https://www.ft.com/rss/home>|200|02/19/2026|valid|
27|iNews|<https://inews.co.uk/rss>|200|02/19/2026|valid|
28|BBC Culture|<https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml>|200|02/19/2026|valid|
29|The Evening Standard|<https://www.standard.co.uk/rss>|200|02/19/2026|valid|

### France (FR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|France 24|<https://www.france24.com/en/rss>|200|02/19/2026|valid|
2|The Local (France)|<https://feeds.thelocal.com/rss/fr>|200|02/19/2026|valid|
3|RFI (France)|<https://www.rfi.fr/en/france/rss>|200|02/19/2026|valid|
4|RFI (All / EN)|<https://www.rfi.fr/en/rss>|200|02/19/2026|valid|
5|Mediapart|<https://www.mediapart.fr/articles/feed>|200|02/19/2026|valid|
6|Le Monde diplomatique|<https://mondediplo.com/backend>|200|02/19/2026|valid|
8|Sud Ouest|<https://www.sudouest.fr/essentiel/rss.xml>|200|02/19/2026|valid|
9|L'Est Républicain|<https://www.estrepublicain.fr/rss>|200|02/19/2026|valid|
10|France Soir|<https://www.francesoir.fr/rss.xml>|200|02/19/2026|valid|
11|Dernières Nouvelles d'Alsace (DNA)|<https://www.dna.fr/rss>|200|02/19/2026|valid|
12|La Croix|<https://www.la-croix.com/feeds/rss/site.xml>|200|02/19/2026|valid|
14|La Dépêche|<https://www.ladepeche.fr/rss.xml>|200|02/19/2026|valid|
15|20 Minutes|<https://www.20minutes.fr/feeds/rss-une.xml>|200|02/19/2026|valid|
17|Yahoo Actualités|<https://fr.news.yahoo.com/rss>|200|02/19/2026|valid|
18|InfoMigrants (EN)|<https://www.infomigrants.net/en/rss/all.xml>|200|02/19/2026|valid|
19|France Today|<https://www.francetoday.com/feed>|200|02/19/2026|valid|
20|FrenchDailyNews|<https://frenchdailynews.com/feed>|200|02/19/2026|valid|
21|Le Monde (EN – Main)|<https://www.lemonde.fr/en/rss/une.xml>|200|02/19/2026|valid|
22|Le Monde (EN – International)|<https://www.lemonde.fr/en/international/rss_full.xml>|200|02/19/2026|valid|
23|Le Monde (EN – Editorials)|<https://www.lemonde.fr/en/editorials/rss_full.xml>|200|02/19/2026|valid|
24|Le Monde (EN – Europe)|<https://www.lemonde.fr/en/europe/rss_full.xml>|200|02/19/2026|valid|
25|Le Monde (EN – United States)|<https://www.lemonde.fr/en/united-states/rss_full.xml>|200|02/19/2026|valid|
26|Le Monde (EN – Economy)|<https://www.lemonde.fr/en/economy/rss_full.xml>|200|02/19/2026|valid|
27|Le Monde (EN – Culture)|<https://www.lemonde.fr/en/culture/rss_full.xml>|200|02/19/2026|valid|
28|Le Monde (EN – Sports)|<https://www.lemonde.fr/en/sports/rss_full.xml>|200|02/19/2026|valid|
29|Le Monde (EN – Environment)|<https://www.lemonde.fr/en/environment/rss_full.xml>|200|02/19/2026|valid|
30|Le Monde (EN – Science)|<https://www.lemonde.fr/en/science/rss_full.xml>|200|02/19/2026|valid|

### Italy (IT)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|ANSA (Main)|<https://www.ansa.it/sito/ansait_rss.xml>|200|02/19/2026|valid|
2|ANSA (Top News)|<https://www.ansa.it/sito/notizie/topnews/topnews_rss.xml>|200|02/19/2026|valid|
3|ANSA (Cronaca)|<https://www.ansa.it/sito/notizie/cronaca/cronaca_rss.xml>|200|02/19/2026|valid|
4|ANSA (Politica)|<https://www.ansa.it/sito/notizie/politica/politica_rss.xml>|200|02/19/2026|valid|
5|ANSA (Mondo)|<https://www.ansa.it/sito/notizie/mondo/mondo_rss.xml>|200|02/19/2026|valid|
6|ANSA (Economia)|<https://www.ansa.it/sito/notizie/economia/economia_rss.xml>|200|02/19/2026|valid|
7|ANSA (Calcio)|<https://www.ansa.it/sito/notizie/sport/calcio/calcio_rss.xml>|200|02/19/2026|valid|
8|ANSA (Sport)|<https://www.ansa.it/sito/notizie/sport/sport_rss.xml>|200|02/19/2026|valid|
9|ANSA (Cinema)|<https://www.ansa.it/sito/notizie/cultura/cinema/cinema_rss.xml>|200|02/19/2026|valid|
10|ANSA (Cultura e Tendenze)|<https://www.ansa.it/sito/notizie/cultura/cultura_rss.xml>|200|02/19/2026|valid|
11|ANSA (Foto)|<https://www.ansa.it/sito/photogallery/foto_rss.xml>|200|02/19/2026|valid|
12|ANSA (Video)|<https://www.ansa.it/sito/videogallery/video_rss.xml>|200|02/19/2026|valid|
13|Corriere della Sera (Homepage)|<https://www.corriere.it/rss/homepage.xml>|200|02/19/2026|valid|
14|Corriere della Sera (Ultimora)|<https://www.corriere.it/rss/ultimora.xml>|200|02/19/2026|valid|
15|Corriere della Sera (feed-hp Homepage)|<https://www.corriere.it/feed-hp/homepage.xml>|200|02/19/2026|valid|
16|la Repubblica|<https://www.repubblica.it/rss/homepage/rss2.0.xml>|200|02/19/2026|valid|
17|La Stampa|<https://www.lastampa.it/rss/copertina.xml>|200|02/19/2026|valid|
18|Il Sole 24 Ore (Italia)|<https://www.ilsole24ore.com/rss/italia.xml>|200|02/19/2026|valid|
19|Il Fatto Quotidiano|<https://www.ilfattoquotidiano.it/feed/>|200|02/19/2026|valid|
20|La Gazzetta dello Sport|<https://www.gazzetta.it/rss/home.xml>|200|02/19/2026|valid|
21|IL Tempo|<https://www.iltempo.it/rss.xml>|200|02/19/2026|valid|
22|Libero Quotidiano|<https://www.liberoquotidiano.it/rss.xml>|200|02/19/2026|valid|
23|MilanoToday|<https://www.milanotoday.it/rss>|200|02/19/2026|valid|
24|The Florentine|<https://www.theflorentine.net/feed>|200|02/19/2026|valid|
25|Wanted in Rome|<https://www.wantedinrome.com/news?format=rss>|200|02/19/2026|valid|
26|Florence Daily News|<https://florencedailynews.com/feed>|200|02/19/2026|valid|
27|Alto Adige (Cronaca)|<https://www.altoadige.it/feed-rss/cronaca-1.169>|200|02/19/2026|valid|
28|Italia a Tavola|<https://rss.italiaatavola.net/feed.xml>|200|02/19/2026|valid|
29|la Città di Salerno|<https://www.lacittadisalerno.it/feed>|200|02/19/2026|valid|
30|Notizie Geopolitiche|<https://www.notiziegeopolitiche.net/feed>|200|02/19/2026|valid|

### Canada (CA)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|Global News|<https://globalnews.ca/feed>|200|02/19/2026|valid|
2|rabble.ca|<https://rabble.ca/feed>|200|02/19/2026|valid|
3|National Post|<https://nationalpost.com/feed>|200|02/19/2026|valid|
4|Toronto Sun|<https://torontosun.com/feed>|200|02/19/2026|valid|
5|Financial Post|<https://feeds.feedburner.com/FP_TopStories>|200|02/19/2026|valid|
6|CityNews Toronto|<https://toronto.citynews.ca/feed>|200|02/19/2026|valid|
7|Calgary Herald|<https://calgaryherald.com/feed>|200|02/19/2026|valid|
8|Edmonton Journal|<https://edmontonjournal.com/feed>|200|02/19/2026|valid|
9|Windsor Star|<https://windsorstar.com/feed>|200|02/19/2026|valid|
10|The Province|<https://theprovince.com/feed>|200|02/19/2026|valid|
11|Calgary Sun|<https://calgarysun.com/feed>|200|02/19/2026|valid|
12|Ottawa Sun|<https://ottawasun.com/feed>|200|02/19/2026|valid|
13|The Tyee|<https://thetyee.ca/rss2.xml>|200|02/19/2026|valid|
14|The StarPhoenix|<https://thestarphoenix.com/feed>|200|02/19/2026|valid|
15|Edmonton Sun|<https://edmontonsun.com/feed>|200|02/19/2026|valid|
16|Canada.com|<https://o.canada.com/feed>|200|02/19/2026|valid|
18|Business In Vancouver (BIV)|<https://biv.com/rss>|200|02/19/2026|valid|
19|Regina Leader Post|<https://leaderpost.com/feed>|200|02/19/2026|valid|
20|Owen Sound Sun Times|<https://owensoundsuntimes.com/feed>|200|02/19/2026|valid|
22|Stratford Beacon Herald|<https://stratfordbeaconherald.com/feed>|200|02/19/2026|valid|
23|The Georgia Straight|<https://straight.com/content/rss>|200|02/19/2026|valid|
24|Grande Prairie Daily Herald Tribune|<https://dailyheraldtribune.com/feed>|200|02/19/2026|valid|
25|YGK News (Kingston)|<https://ygknews.ca/feed>|200|02/19/2026|valid|
26|Prince Albert Daily Herald|<https://paherald.sk.ca/feed>|200|02/19/2026|valid|
27|Sunny South News|<https://sunnysouthnews.com/feed>|200|02/19/2026|valid|
28|The Afro News|<https://theafronews.com/feed>|200|02/19/2026|valid|

### Russia (RU)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
3|RT|<https://rt.com/feed>|200|02/19/2026|valid|
10|The Bell|<https://thebell.io/feed>|200|02/19/2026|valid|
14|Interfax|<https://www.interfax.ru/rss.asp>|200|02/19/2026|valid|
15|RT Economy|<https://www.rt.com/rss/business>|200|02/19/2026|valid|
16|The Bell|<https://thebell.io/feed/>|200|02/19/2026|valid|
18|Lenta|<https://lenta.ru/rss/news>|200|02/19/2026|valid|
23|TASS Finance|<https://tass.com/rss/v2.xml>|200|02/19/2026|valid|
25|RT News|<https://www.rt.com/rss/>|200|02/19/2026|valid|

### South Korea (KR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|Yonhap (EN)|<https://en.yna.co.kr/RSS/news.xml>|200|02/19/2026|valid|
2|Donga Ilbo|<https://rss.donga.com/total.xml>|200|02/19/2026|valid|
3|Seoul Newspaper|<https://www.seoul.co.kr/xml/rss/rss_top.xml>|200|02/19/2026|valid|
4|Newsis|<https://www.newsis.com/RSS/sokbo.xml>|200|02/19/2026|valid|
5|Aju News|<https://rss.ajunews.com/sokbo.xml>|200|02/19/2026|valid|
6|KED Global (Korea Economic Daily)|<https://www.kedglobal.com/newsRss>|200|02/19/2026|valid|
7|Daily NK (EN)|<https://www.dailynk.com/english/feed>|200|02/19/2026|valid|
8|Korea Times (RSS directory)|<https://feed.koreatimes.co.kr/k/allnews.xml>|200|02/19/2026|valid|
9|Korea Herald (RSS directory)|<https://www.koreaherald.com/rss/newsAll>|200|02/19/2026|valid|
10|Korea Herald (NewsAll)|<https://www.koreaherald.com/rss/newsAll>|200|02/19/2026|valid|
11|KBS World Radio (RSS directory)|<http://world.kbs.co.kr/rss/rss_news.htm?lang=e>|200|02/19/2026|valid|

### Brazil (BR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|G1 (Globo - Economy)|<https://g1.globo.com/rss/g1/economia/>|200|02/19/2026|valid|
2|G1 (Globo - Tech)|<https://g1.globo.com/rss/g1/tecnologia/>|200|02/19/2026|valid|
3|Folha de S.Paulo - Top|<https://feeds.folha.uol.com.br/emcimadahora/rss091.xml>|200|02/19/2026|valid|
4|Folha de S.Paulo - Market|<https://feeds.folha.uol.com.br/mercado/rss091.xml>|200|02/19/2026|valid|
6|Correio Braziliense|<https://www.correiobraziliense.com.br/rss/noticia/economia/rss.xml>|200|02/19/2026|valid|
7|InfoMoney|<https://www.infomoney.com.br/feed/>|200|02/19/2026|valid|
8|Canaltech|<https://canaltech.com.br/rss/>|200|02/19/2026|valid|
9|Forbes Brazil|<https://forbes.com.br/feed/>|200|02/19/2026|valid|
13|Brasil de Fato|<https://www.brasildefato.com.br/rss>|200|02/19/2026|valid|
14|Estado de Minas|<https://www.em.com.br/feed/>|200|02/19/2026|valid|
17|Veja|<https://veja.abril.com.br/feed/>|200|02/19/2026|valid|
26|Canal Tech Brasil|<https://canaltech.com.br/rss/>|200|02/19/2026|valid|

### Australia (AU)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|ABC News - Business|<https://www.abc.net.au/news/feed/51892/rss.xml>|200|02/19/2026|valid|
2|ABC News - World|<https://www.abc.net.au/news/feed/104217382/rss.xml>|200|02/19/2026|valid|
3|ABC News - Top Stories|<https://www.abc.net.au/news/feed/10719986/rss.xml>|200|02/19/2026|valid|
4|Sydney Morning Herald - Business|<https://www.smh.com.au/rss/business.xml>|200|02/19/2026|valid|
5|The Age - Business|<https://www.theage.com.au/rss/business.xml>|200|02/19/2026|valid|
7|The Australian - Business|<https://www.theaustralian.com.au/business/rss>|200|02/19/2026|valid|
8|The Guardian Australia|<https://www.theguardian.com/au/rss>|200|02/19/2026|valid|
9|ABC News (Top)|<https://www.abc.net.au/news/feed/1106/rss.xml>|200|02/19/2026|valid|
11|Australian Broadcasting Corporation - World|<https://www.abc.net.au/news/feed/51892/rss.xml?edition=world>|200|02/19/2026|valid|
12|The Guardian Australia|<https://www.theguardian.com/australia-news/rss>|200|02/19/2026|valid|
15|SBS World News|<https://www.sbs.com.au/news/topic/latest/feed>|200|02/19/2026|valid|
16|SBS News (Breaking)|<https://www.sbs.com.au/news/feed>|200|02/19/2026|valid|
17|9News|<https://www.9news.com.au/rss>|200|02/19/2026|valid|
18|Sydney Morning Herald|<https://www.smh.com.au/rss/feed.xml>|200|02/19/2026|valid|
19|The Age|<https://www.theage.com.au/rss/feed.xml>|200|02/19/2026|valid|
21|Canberra Times|<https://www.canberratimes.com.au/rss.xml>|200|02/19/2026|valid|
27|PerthNow|<https://www.perthnow.com.au/news/feed>|200|02/19/2026|valid|
29|The Australian|<https://www.theaustralian.com.au/business/markets/rss>|200|02/19/2026|valid|
31|7news|<https://7news.com.au/feed>|200|02/19/2026|valid|

### Spain (ES)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|Expansión (Financial)|<https://e00-expansion.uecdn.es/rss/empresas.xml>|200|02/19/2026|valid|
2|Cinco Días (Economy)|<https://cincodias.elpais.com/arc/outboundfeeds/rss/?outputType=xml>|200|02/19/2026|valid|
3|El País - Economy|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/economia/portada>|200|02/19/2026|valid|
4|El Mundo - Economy|<https://e00-elmundo.uecdn.es/elmundo/rss/economia.xml>|200|02/19/2026|valid|
7|El Confidencial|<https://rss.elconfidencial.com/espana/>|200|02/19/2026|valid|
11|El Periodico|<https://www.elperiodico.com/es/rss/rss_portada.xml>|200|02/19/2026|valid|
12|20 Minutos|<https://www.20minutos.es/rss/>|200|02/19/2026|valid|
14|El Diario|<https://www.eldiario.es/rss/>|200|02/19/2026|valid|
16|eldiario|<https://www.eldiario.es/rss/>|200|02/19/2026|valid|
19|Marca|<https://www.marca.com/rss/>|200|02/19/2026|valid|
25|El Pais|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada>|200|02/19/2026|valid|

### Mexico (MX)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
4|Milenio|<https://www.milenio.com/rss>|200|02/19/2026|valid|
6|Proceso (Investigative)|<https://www.proceso.com.mx/rss/feed.html>|200|02/19/2026|valid|
8|Expansion (Biz)|<https://expansion.mx/rss>|200|02/19/2026|valid|
17|Contralínea|<https://www.contralinea.com.mx/feed>|200|02/19/2026|valid|
18|El Financiero|<https://www.elfinanciero.com.mx/rss/mundo>|200|02/19/2026|valid|
23|Proceso World|<https://www.proceso.com.mx/rss/feed.html?output=xml>|200|02/19/2026|valid|
30|El Financiero|<https://www.elfinanciero.com.mx/rss>|200|02/19/2026|valid|

### Indonesia (ID)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
9|Republika|<https://www.republika.co.id/rss>|200|02/19/2026|valid|
14|Sindo News|<https://www.sindonews.com/rss/home/>|200|02/19/2026|valid|
15|Kapanlagi|<https://www.kapanlagi.com/feed/>|200|02/19/2026|valid|
18|Antara TV|<https://www.antaranews.com/rss/terkini>|200|02/19/2026|valid|
21|Sindonews|<https://www.sindonews.com/rss/>|200|02/19/2026|valid|
24|Republika|<https://www.republika.co.id/rss/terkini>|200|02/19/2026|valid|

### Netherlands (NL)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|NOS|<https://feeds.nos.nl/nosnieuwsalgemeen>|200|02/19/2026|valid|
2|NRC|<https://www.nrc.nl/rss>|200|02/19/2026|valid|
3|AD|<https://www.ad.nl/rss.xml>|200|02/19/2026|valid|
4|Nu|<https://www.nu.nl/rss/algemeen>|200|02/19/2026|valid|
12|NPO Radio 1|<https://www.npo3fm.nl/rss/>|200|02/19/2026|valid|
14|NOS Tech|<https://feeds.nos.nl/nosnieuwstech>|200|02/19/2026|valid|
23|NRC|<https://www.nrc.nl/nieuws/rss/>|200|02/19/2026|valid|
25|Nieuwsuur|<https://feeds.nos.nl/nieuwsuuralgemeen>|200|02/19/2026|valid|
27|RTL|<https://www.rtlnieuws.nl/nieuws/rss.xml>|200|02/19/2026|valid|
30|NRC|<https://www.nrc.nl/rss/>|200|02/19/2026|valid|

### Switzerland (CH)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
10|Le Temps Economy|<https://www.letemps.ch/economie.rss>|200|02/19/2026|valid|
20|NZZ|<https://www.nzz.ch/reisen.rss>|200|02/19/2026|valid|
28|NDR|<https://www.ndr.ch/rss/>|200|02/19/2026|valid|

### Turkey (TR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
2|Hürriyet|<https://www.hurriyet.com.tr/rss/anasayfa>|200|02/19/2026|valid|
5|Sabah|<https://www.sabah.com.tr/rss/sondakika.xml>|200|02/19/2026|valid|
9|Haberturk|<https://www.haberturk.com/rss>|200|02/19/2026|valid|
11|Cumhuriyet|<https://www.cumhuriyet.com.tr/Rss/>|200|02/19/2026|valid|
14|Aksam|<https://www.aksam.com.tr/rss>|200|02/19/2026|valid|
19|Takvim|<https://www.takvim.com.tr/rss/feed>|200|02/19/2026|valid|
26|Cumhuriyet|<https://www.cumhuriyet.com.tr/RSS>|200|02/19/2026|valid|
27|HuffPost Turkey|<https://www.hurriyetdailynews.com/rss>|200|02/19/2026|valid|
30|Haber Turk|<https://www.haberturk.com/rss/>|200|02/19/2026|valid|

### Saudi Arabia (SA)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
18|Okaz|<https://www.okaz.com.sa/rss/news>|200|02/19/2026|valid|
21|Al Jazirah|<https://www.aljazeera.net/rss>|200|02/19/2026|valid|

### Taiwan (TW)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
4|Liberty Times - Business|<https://news.ltn.com.tw/rss/business.xml>|200|02/19/2026|valid|
5|TechNews Taiwan|<https://technews.tw/feed/>|200|02/19/2026|valid|
6|CNA (Central News Agency)|<https://feeds.feedburner.com/cnaFirstNews>|200|02/19/2026|valid|
14|Formosa Reporter|<https://www.formosapost.com/feed/>|200|02/19/2026|valid|

### Poland (PL)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
2|Onet|<https://wiadomosci.onet.pl/rss>|200|02/19/2026|valid|
3|TVN24|<https://tvn24.pl/tvnmeteo.xml>|200|02/19/2026|valid|
12|Fakt|<https://www.fakt.pl/rss/>|200|02/19/2026|valid|
22|Wprost|<https://www.wprost.pl/rss/>|200|02/19/2026|valid|

### Sweden (SE)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
2|Dagens Nyheter|<https://www.dn.se/nyheter/rss/>|200|02/19/2026|valid|
7|Dagens Industri|<https://www.di.se/rss/>|200|02/19/2026|valid|
8|SVT Nyheter|<https://www.svt.se/nyheter/rss.xml>|200|02/19/2026|valid|
9|Göteborgs-Posten|<https://www.gp.se/rss>|200|02/19/2026|valid|
17|Sveriges Television|<https://www.svt.se/nyheter/ekonomi/rss.xml>|200|02/19/2026|valid|
24|Svt|<https://www.svt.se/nyheter/rss.xml?sectionId=2>|200|02/19/2026|valid|
25|Dagens Nyheter Sport|<https://www.dn.se/sport/rss>|200|02/19/2026|valid|
27|Dagens Nyheter Business|<https://www.dn.se/ekonomi/rss>|200|02/19/2026|valid|
28|Norran|<https://www.norran.se/rss>|200|02/19/2026|valid|

### Belgium (BE)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
2|De Morgen|<https://www.demorgen.be/rss.xml>|200|02/19/2026|valid|
4|La Libre|<https://www.lalibre.be/arc/outboundfeeds/rss/section/belgique/?outputType=xml>|200|02/19/2026|valid|
6|Knack|<https://www.knack.be/feed/>|200|02/19/2026|valid|
7|VRT News|<https://www.vrt.be/vrtnws/nl.rss.articles.xml>|200|02/19/2026|valid|
11|La Dernière Heure|<https://www.dhnet.be/rss.xml>|200|02/19/2026|valid|
12|Le Vif|<https://www.levif.be/feed/>|200|02/19/2026|valid|
13|RTBF|<https://rss.rtbf.be/article/rss/highlight_rtbf_info.xml?source=internal>|200|02/19/2026|valid|
16|Het Nieuwsblad|<https://www.nieuwsblad.be/rss/>|200|02/19/2026|valid|
19|La Libre Belgique|<https://www.lalibre.be/rss/>|200|02/19/2026|valid|
27|La Libre|<https://www.lalibre.be/rss>|200|02/19/2026|valid|

### Thailand (TH)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
11|The Thaiger|<https://thethaiger.com/feed>|200|02/19/2026|valid|
12|Khaosod English|<https://www.khaosodenglish.com/rss>|200|02/19/2026|valid|
13|Matichon|<https://www.matichon.co.th/rss>|200|02/19/2026|valid|
18|Prachachat|<https://prachachat.net/feed/>|200|02/19/2026|valid|
25|Daily News|<https://www.dailynews.co.th/rss>|200|02/19/2026|valid|

### Iran (IR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
2|IRNA|<https://www.irna.ir/rss>|200|02/19/2026|valid|
3|Mehr News|<https://www.mehrnews.com/rss>|200|02/19/2026|valid|
8|ILNA|<https://www.ilna.news/rss>|200|02/19/2026|valid|
9|Khabar Online|<https://www.khabaronline.ir/rss>|200|02/19/2026|valid|
10|Iran International|<https://www.iranintl.com/feed>|200|02/19/2026|valid|
15|ILNA|<https://www.ilna.ir/rss>|200|02/19/2026|valid|
25|Tejarat News|<https://www.tejaratnews.com/rss>|200|02/19/2026|valid|

### Argentina (AR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|Ámbito - Portada|<https://www.ambito.com/rss/pages/home.xml>|200|02/19/2026|valid|
2|Ámbito - Últimas noticias|<https://www.ambito.com/rss/pages/ultimas-noticias.xml>|200|02/19/2026|valid|
3|Ámbito - Economía|<https://www.ambito.com/rss/pages/economia.xml>|200|02/19/2026|valid|
4|Ámbito - Finanzas|<https://www.ambito.com/rss/pages/finanzas.xml>|200|02/19/2026|valid|
5|Ámbito - Negocios|<https://www.ambito.com/rss/pages/negocios.xml>|200|02/19/2026|valid|
6|Ámbito - Política|<https://www.ambito.com/rss/pages/politica.xml>|200|02/19/2026|valid|
7|Ámbito - Nacional|<https://www.ambito.com/rss/pages/nacional.xml>|200|02/19/2026|valid|
8|Ámbito - Mundo|<https://www.ambito.com/rss/pages/mundo.xml>|200|02/19/2026|valid|
9|Ámbito - Lifestyle|<https://www.ambito.com/rss/pages/lifestyle.xml>|200|02/19/2026|valid|
10|Ámbito - Deportes|<https://www.ambito.com/rss/pages/deportes.xml>|200|02/19/2026|valid|
11|Ámbito - Tecnología|<https://www.ambito.com/rss/pages/tecnologia.xml>|200|02/19/2026|valid|
12|Ámbito - Autos|<https://www.ambito.com/rss/pages/autos.xml>|200|02/19/2026|valid|
13|Ámbito - Edición impresa|<https://www.ambito.com/rss/pages/edicion-impresa.xml>|200|02/19/2026|valid|
14|Página/12 - Portada|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/portada>|200|02/19/2026|valid|
15|Página/12 - Edición impresa|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/edicion-impresa>|200|02/19/2026|valid|
16|Página/12 - El País|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/el-pais/notas>|200|02/19/2026|valid|
17|Página/12 - Economía|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/economia/notas>|200|02/19/2026|valid|
18|Página/12 - Sociedad|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/sociedad/notas>|200|02/19/2026|valid|
19|Página/12 - El Mundo|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/el-mundo/notas>|200|02/19/2026|valid|
20|Página/12 - Deportes|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/deportes/notas>|200|02/19/2026|valid|
21|Página/12 - Ciencia|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/ciencia/notas>|200|02/19/2026|valid|
22|Página/12 - Psicología|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/psicologia/notas>|200|02/19/2026|valid|
23|Página/12 - Cartas de Lectores|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/cartas-de-lectores/notas>|200|02/19/2026|valid|
24|Página/12 - Cash|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/suplementos/cash/notas>|200|02/19/2026|valid|
25|Página/12 - Las 12|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/suplementos/las12/notas>|200|02/19/2026|valid|
26|Página/12 - Radar|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/suplementos/radar/notas>|200|02/19/2026|valid|
27|Página/12 - Turismo|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/suplementos/turismo/notas>|200|02/19/2026|valid|
28|LA NACION - General|<https://www.lanacion.com.ar/arc/outboundfeeds/rss/?outputType=xml>|200|02/19/2026|valid|
29|El Cronista - Noticias|<https://www.cronista.com/files/rss/news.xml>|200|02/19/2026|valid|

### Chile (CL)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|Diario Financiero|<https://www.df.cl/noticias/site/list/port/rss.xml>|200|02/19/2026|valid|
2|The Clinic|<https://www.theclinic.cl/feed/>|200|02/19/2026|valid|
3|El Rancagüino|<https://www.elrancaguino.cl/feed/>|200|02/19/2026|valid|
4|Cambio21|<https://cambio21.cl/rss>|200|02/19/2026|valid|
5|La Discusión|<https://ladiscusion.cl/feed/>|200|02/19/2026|valid|
6|La Nación (Chile)|<https://www.lanacion.cl/feed>|200|02/19/2026|valid|
7|El Siglo|<https://elsiglo.cl/feed>|200|02/19/2026|valid|
8|The Santiago Times|<https://santiagotimes.cl/feed>|200|02/19/2026|valid|
9|Infoweek|<https://infoweek.biz/feed>|200|02/19/2026|valid|
10|El Mostrador|<https://www.elmostrador.cl/feed/>|200|02/19/2026|valid|
11|El Desconcierto|<https://www.eldesconcierto.cl/feed/>|200|02/19/2026|valid|
12|El Dínamo|<https://www.eldinamo.cl/feed/>|200|02/19/2026|valid|
13|La Prensa Austral|<https://laprensaaustral.cl/feed/>|200|02/19/2026|valid|
14|CIPER Chile|<https://www.ciperchile.cl/feed/>|200|02/19/2026|valid|
15|Radio Universidad de Chile|<https://radio.uchile.cl/feed/>|200|02/19/2026|valid|
16|Bing News - Chile (Top)|<https://www.bing.com/news/search?q=Chile&format=RSS>|200|02/19/2026|valid|
17|Bing News - Chile política|<https://www.bing.com/news/search?q=Chile%20politica&format=RSS>|200|02/19/2026|valid|
18|Bing News - Chile economía|<https://www.bing.com/news/search?q=Chile%20economia&format=RSS>|200|02/19/2026|valid|
19|Bing News - Chile energía|<https://www.bing.com/news/search?q=Chile%20energia&format=RSS>|200|02/19/2026|valid|
20|Bing News - Chile minería|<https://www.bing.com/news/search?q=Chile%20mineria&format=RSS>|200|02/19/2026|valid|
21|Bing News - Chile tecnología|<https://www.bing.com/news/search?q=Chile%20tecnologia&format=RSS>|200|02/19/2026|valid|
22|Bing News - Chile deportes|<https://www.bing.com/news/search?q=Chile%20deportes&format=RSS>|200|02/19/2026|valid|
23|Bing News - Chile fútbol|<https://www.bing.com/news/search?q=Chile%20futbol&format=RSS>|200|02/19/2026|valid|
24|Bing News - Santiago Chile|<https://www.bing.com/news/search?q=Santiago%20Chile&format=RSS>|200|02/19/2026|valid|
25|Bing News - site:df.cl|<https://www.bing.com/news/search?q=site%3Adf.cl&format=RSS>|200|02/19/2026|valid|
26|Bing News - site:theclinic.cl|<https://www.bing.com/news/search?q=site%3Atheclinic.cl&format=RSS>|200|02/19/2026|valid|
27|Bing News - site:lanacion.cl|<https://www.bing.com/news/search?q=site%3Alanacion.cl&format=RSS>|200|02/19/2026|valid|
28|Bing News - site:biobiochile.cl|<https://www.bing.com/news/search?q=site%3Abiobiochile.cl&format=RSS>|200|02/19/2026|valid|
29|Bing News - site:emol.com|<https://www.bing.com/news/search?q=site%3Aemol.com&format=RSS>|200|02/19/2026|valid|
30|Bing News - site:latercera.com|<https://www.bing.com/news/search?q=site%3Alatercera.com&format=RSS>|200|02/19/2026|valid|

### Dominican Republic (DO)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|Diario Libre - Portada|<https://www.diariolibre.com/rss/portada.xml>|200|02/19/2026|valid|
2|Diario Libre - Actualidad|<https://www.diariolibre.com/rss/actualidad.xml>|200|02/19/2026|valid|
3|Diario Libre - Política|<https://www.diariolibre.com/rss/politica.xml>|200|02/19/2026|valid|
4|Diario Libre - Economía|<https://www.diariolibre.com/rss/economia.xml>|200|02/19/2026|valid|
5|Diario Libre - Opinión|<https://www.diariolibre.com/rss/opinion.xml>|200|02/19/2026|valid|
6|Diario Libre - Revista|<https://www.diariolibre.com/rss/revista.xml>|200|02/19/2026|valid|
7|Diario Libre - Deportes|<https://www.diariolibre.com/rss/deportes.xml>|200|02/19/2026|valid|
8|Diario Libre - Mundo|<https://www.diariolibre.com/rss/mundo.xml>|200|02/19/2026|valid|
9|Diario Libre - Planeta|<https://www.diariolibre.com/rss/planeta.xml>|200|02/19/2026|valid|
10|Diario Libre - Videos|<https://www.diariolibre.com/rss/videos.xml>|200|02/19/2026|valid|
11|Diario Libre - Edición USA|<https://www.diariolibre.com/rss/dl-usa.xml>|200|02/19/2026|valid|
12|AlMomento - Portada|<https://almomento.net/feed/>|200|02/19/2026|valid|
13|AlMomento - Política|<https://almomento.net/categoria/politica/feed/>|200|02/19/2026|valid|
14|AlMomento - Deportes|<https://almomento.net/categoria/deportes/feed/>|200|02/19/2026|valid|
15|AlMomento - Económicas|<https://almomento.net/categoria/economicas/feed/>|200|02/19/2026|valid|
16|AlMomento - Dominicanos en el Exterior|<https://almomento.net/categoria/dominicanos-en-el-exterior/feed/>|200|02/19/2026|valid|
17|AlMomento - Internacionales|<https://almomento.net/categoria/internacionales/feed/>|200|02/19/2026|valid|
18|AlMomento - Variedades|<https://almomento.net/categoria/variedades/feed/>|200|02/19/2026|valid|
19|AlMomento - Opinión|<https://almomento.net/categoria/opinion/feed/>|200|02/19/2026|valid|
20|AlMomento - Haití|<https://almomento.net/categoria/haiti/feed/>|200|02/19/2026|valid|
21|AlMomento - Provincias|<https://almomento.net/categoria/provincias/feed/>|200|02/19/2026|valid|
22|Acento - Portada|<https://acento.com.do/feed/>|200|02/19/2026|valid|
23|Acento - Actualidad|<https://acento.com.do/categoria/actualidad/feed/>|200|02/19/2026|valid|
24|Acento - Economía|<https://acento.com.do/categoria/economia/feed/>|200|02/19/2026|valid|
25|Acento - Opinión|<https://acento.com.do/categoria/opinion/feed/>|200|02/19/2026|valid|
26|Acento - Deportes|<https://acento.com.do/categoria/deportes/feed/>|200|02/19/2026|valid|
27|elCaribe|<https://www.elcaribe.com.do/feed/>|200|02/19/2026|valid|
28|Hoy Digital|<https://hoy.com.do/feed/>|200|02/19/2026|valid|
29|El Nacional|<https://elnacional.com.do/feed/>|200|02/19/2026|valid|
30|El Nuevo Diario|<https://elnuevodiario.com.do/feed/>|200|02/19/2026|valid|

### Uruguay (UY)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|El Observador - Home|<https://www.elobservador.com.uy/rss/pages/home.xml>|200|02/19/2026|valid|
2|El Observador - Último momento|<https://www.elobservador.com.uy/rss/pages/ultimo-momento.xml>|200|02/19/2026|valid|
3|El Observador - Mundo|<https://www.elobservador.com.uy/rss/pages/Mundo.xml>|200|02/19/2026|valid|
4|El Observador - Nacional|<https://www.elobservador.com.uy/rss/pages/nacional.xml>|200|02/19/2026|valid|
5|El Observador - Sociales|<https://www.elobservador.com.uy/rss/pages/sociales.xml>|200|02/19/2026|valid|
6|El Observador - Café y Negocios|<https://www.elobservador.com.uy/rss/pages/cafe-y-negocios.xml>|200|02/19/2026|valid|
7|El Observador - Agro|<https://www.elobservador.com.uy/rss/pages/Agro.xml>|200|02/19/2026|valid|
8|El Observador - Economía y Empresas|<https://www.elobservador.com.uy/rss/pages/economia.xml>|200|02/19/2026|valid|
9|El Observador - Opinión|<https://www.elobservador.com.uy/rss/pages/opinion.xml>|200|02/19/2026|valid|
10|El Observador - Salud|<https://www.elobservador.com.uy/rss/pages/salud.xml>|200|02/19/2026|valid|
11|El Observador - Ciencia y Tecnología|<https://www.elobservador.com.uy/rss/pages/ciencia-y-tecnologia.xml>|200|02/19/2026|valid|
12|El Observador - Cultura y Espectáculos|<https://www.elobservador.com.uy/rss/pages/cultura-y-espectaculos.xml>|200|02/19/2026|valid|
13|El Observador - Ediciones especiales|<https://www.elobservador.com.uy/rss/pages/ediciones-especiales.xml>|200|02/19/2026|valid|
14|El Observador - Referí|<https://www.elobservador.com.uy/rss/pages/referi.xml>|200|02/19/2026|valid|
15|El Observador - Running|<https://www.elobservador.com.uy/rss/pages/running.xml>|200|02/19/2026|valid|
16|El Observador - Selección|<https://www.elobservador.com.uy/rss/pages/seleccion.xml>|200|02/19/2026|valid|
17|El Observador - Rugby|<https://www.elobservador.com.uy/rss/pages/rugby.xml>|200|02/19/2026|valid|
18|El Observador - Polideportivo|<https://www.elobservador.com.uy/rss/pages/polideportivo.xml>|200|02/19/2026|valid|
19|El Observador - Básquetbol|<https://www.elobservador.com.uy/rss/pages/basquetbol.xml>|200|02/19/2026|valid|
20|El Observador - Copa América|<https://www.elobservador.com.uy/rss/pages/copa-america-odl.xml>|200|02/19/2026|valid|
21|El Observador - Motor|<https://www.elobservador.com.uy/rss/pages/motor.xml>|200|02/19/2026|valid|
22|El Observador - Fútbol internacional|<https://www.elobservador.com.uy/rss/pages/futbol-internacional.xml>|200|02/19/2026|valid|
23|El Observador - Fútbol|<https://www.elobservador.com.uy/rss/pages/futbol.xml>|200|02/19/2026|valid|
24|El Observador - Copa Libertadores|<https://www.elobservador.com.uy/rss/pages/copa-libertadores.xml>|200|02/19/2026|valid|
25|Montevideo Portal - Información destacada|<https://www.montevideo.com.uy/anxml.aspx?58>|200|02/19/2026|valid|
26|Montevideo Portal - Noticias|<https://www.montevideo.com.uy/anxml.aspx?59>|200|02/19/2026|valid|
27|Montevideo Portal - Tiempo Libre|<https://www.montevideo.com.uy/anxml.aspx?60>|200|02/19/2026|valid|
28|Montevideo Portal - Tecnología|<https://www.montevideo.com.uy/anxml.aspx?133>|200|02/19/2026|valid|
29|Montevideo Portal - Negocios & Tendencias|<https://www.montevideo.com.uy/anxml.aspx?728>|200|02/19/2026|valid|
30|Montevideo Portal - Deportes|<https://www.montevideo.com.uy/anxml.aspx?1727>|200|02/19/2026|valid|

### Austria (AT)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|Der Standard|<https://www.derstandard.at/rss>|200|02/19/2026|valid|
3|ORF|<https://rss.orf.at/news.xml>|200|02/19/2026|valid|
5|Die Presse|<https://www.diepresse.com/rss>|200|02/19/2026|valid|
8|Tiroler Tageszeitung|<https://www.tt.com/rss/news.xml>|200|02/19/2026|valid|
11|Der Standard|<https://www.derstandard.at/rss>|200|02/19/2026|valid|
14|ORF Aktuell|<https://rss.orf.at/>|200|02/19/2026|valid|
16|Kurier (Top News)|<https://kurier.at/xml/rssd>|200|02/19/2026|valid|
17|Neue Donau|<https://www.neue.at/feed>|200|02/19/2026|valid|
22|Der Standard|<https://www.derstandard.at/rss?section=welt>|200|02/19/2026|valid|
24|Kleine Zeitung|<https://www.kleinezeitung.at/rss/home>|200|02/19/2026|valid|
26|Der Standard|<https://www.derstandard.at/rss?output=amp>|200|02/19/2026|valid|
29|ORF|<https://rss.orf.at/news.xml>|200|02/19/2026|valid|
30|Der Standard Plus|<https://www.derstandard.at/rss/wirtschaft>|200|02/19/2026|valid|

### Norway (NO)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|NRK|<https://www.nrk.no/toppsaker.rss>|200|02/19/2026|valid|
5|NRK News|<https://www.nrk.no/nyheter/siste.rss>|200|02/19/2026|valid|
10|TV2|<https://www.tv2.no/rss/toppsaker.xml>|200|02/19/2026|valid|
12|E24|<https://e24.no/rss>|200|02/19/2026|valid|
16|Dagbladet|<https://www.dagbladet.no/rss/nyheter>|200|02/19/2026|valid|
18|TV2|<https://www.tv2.no/rss/nyheter/>|200|02/19/2026|valid|
22|E24|<https://e24.no/rss/okonomi.xml>|200|02/19/2026|valid|
27|TV2|<https://www.tv2.no/rss/politikk.xml>|200|02/19/2026|valid|
30|E24|<https://e24.no/rss/nyheter.xml>|200|02/19/2026|valid|

### Global Energy & Grid (Global)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|OilPrice|<https://oilprice.com/rss/main>|200|02/19/2026|valid|
3|Power Engineering|<https://www.power-eng.com/feed/>|200|02/19/2026|valid|
4|Renewable Energy World|<https://www.renewableenergyworld.com/feed/>|200|02/19/2026|valid|
5|Utility Dive|<https://www.utilitydive.com/feeds/news/>|200|02/19/2026|valid|
6|CleanTechnica|<https://cleantechnica.com/feed/>|200|02/19/2026|valid|
11|Carbon Brief|<https://www.carbonbrief.org/feed/>|200|02/19/2026|valid|
12|Power Magazine|<https://www.powermag.com/feed/>|200|02/19/2026|valid|
15|PV Magazine|<https://www.pv-magazine.com/feed/>|200|02/19/2026|valid|
17|Energy Post|<https://energypost.eu/feed/>|200|02/19/2026|valid|
28|Energy Storage News|<https://www.energy-storage.news/rss>|200|02/19/2026|valid|
29|Energy Storage News|<https://www.energy-storage.news/feed>|200|02/19/2026|valid|
