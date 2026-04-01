# World Press Radar

![TypeScript](https://img.shields.io/badge/TypeScript-5.7.3-3178c6?logo=typescript&logoColor=white)
![Bun](https://img.shields.io/badge/Bun-1.2-000000?logo=bun)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Ready-336791?logo=postgresql&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-blue)

Customer-only news intelligence portal backed by hourly RSS ingest, PostgreSQL, and a token-gated read API. Customers browse article counts and article lists by normalized multi-category labels, source tags, country, and date through the web app. Anonymous users are not allowed to browse or download article data.

## Title quality gate

World Press Radar now treats article-title quality as a first-class ingestion concern.

Every newly ingested article is classified into one of three title states:

- `ok`
  - feed or sitemap title is already good enough to show to customers
- `recovered`
  - feed title looked weak, but the pipeline recovered a better headline from the article page
- `suspect`
  - title still looks low-signal, numeric, URL-like, hub-like, or otherwise unsafe for customer display

Operational rules:

- `ok` and `recovered` rows are eligible for customer API and dashboard visibility
- `suspect` rows stay in PostgreSQL but are hidden from customer-facing reads by default
- a background repair worker can retry only the suspect subset instead of re-fetching every article page

Schema fields used for this flow:

- `title_quality`
- `title_quality_reason`
- `title_quality_checked_at`
- `title_repair_status`
- `title_repair_source`
- `title_repair_attempted_at`
- `title_repaired_at`

Useful commands:

```bash
bun run backfill:low-signal-titles
bun run repair:suspect-titles
```

Throughput defaults for the hourly path:

- `INGEST_SITEMAP_LIMIT=2000`
- `INGEST_ITEM_MAP_CONCURRENCY=24`
- `INGEST_ARTICLE_META_CATEGORY_MAX_FETCHES=400`
- `INGEST_ARTICLE_META_CATEGORY_MAX_FETCHES_PER_SOURCE=40`

These defaults keep coverage broad while preventing giant sitemap endpoints from exploding into 5,000-item fan-out work on a single hourly run. They also cap expensive article-page category fallback during hourly ingest while leaving backfill mode uncapped.

Recommended operational pattern:

1. ingest articles normally
2. let `suspect` rows stay hidden from customer reads
3. run `repair:suspect-titles` on a schedule
4. only show recovered titles after they pass the quality gate

## What customers can do

- open the portal and unlock access with an issued customer token
- browse dashboard counts by primary section, country, and date
- compare country-level publishing output in Benchmark
- inspect geographic coverage and publisher footprints in Map

## Customer access model

World Press Radar is no longer designed around public static article dumps. The primary product path is:

1. customer opens the web app
2. customer enters a valid API token on the access screen
3. web app calls the authenticated news API
4. API queries PostgreSQL and returns only the requested slice of data

Without a valid token:

- the dashboard does not load article counts
- the benchmark does not load customer-only benchmark views
- the map overview remains available, but customer-only article detail and live overlays do not load
- anonymous article browsing is blocked

This keeps the UI fast, avoids multi-hundred-megabyte JSON downloads, and lets the product scale beyond the old public export cap.

## Customer quick start

1. Open the customer portal URL shared with you.
2. Enter the token you received from the World Press Radar team.
3. Use `Dashboard` for summary counts.
4. Use `Benchmark` for country-level publishing comparisons.
5. Use `Map` for country and publisher drill-downs.

Customer token handling rules:

- treat your token like a password
- do not post it in shared chats, tickets, or email threads
- request a rotation immediately if it was exposed
- expect your token to be revoked if it is shared outside your organization

Shareable customer instructions live in `docs/customer-api-access.md`.

## Product architecture

The customer portal uses an authenticated API instead of shipping the full article corpus as static files.

Primary read path:

- web app on Vercel
- `api-news` service with PostgreSQL access
- token-based authorization through `NEWS_API_TOKEN_POLICIES`

Why this structure exists:

- customers need live filtering and pagination
- article volume is too large for browser-side static shard loading
- access control must block anonymous readers
- per-customer token issuance and revocation must be possible

## Operator deployment overview

There are three required runtime pieces:

1. a web app deployment
2. an API host that can reach PostgreSQL
3. issued customer tokens

Detailed operations notes live in `docs/customer-portal-ops.md`.

Production domain cutover steps live in `docs/worldpressradar-domain-setup.md`.

### Web app environment

Set this on Vercel:

```bash
NEXT_PUBLIC_NEWS_API_BASE_URL=https://api.worldpressradar.com
```

Notes:

- this should point to a stable HTTPS API hostname
- do not use a temporary tunnel URL for production
- the web app should never embed customer tokens at build time

### API environment

Set these on the API host:

```bash
DATABASE_URL=postgres://...
NEWS_API_HOST=0.0.0.0
NEWS_API_PORT=4100
NEWS_API_ALLOW_PUBLIC_READ_ONLY=0
NEWS_API_CORS_ORIGINS=https://app.worldpressradar.com
NEWS_API_TOKEN=<internal-admin-token>
NEWS_API_TOKEN_POLICIES='[{"token":"...","roles":["read"]}]'
```

Run the API:

```bash
bash scripts/run-api-news.sh
```

The API must return `401` for anonymous article requests in production.

### Deployment behavior

Current production rollout path:

- pushing `develop` updates the Vercel web app automatically
- the local API runtime watchdog syncs pushed `develop` commits into the runtime repo and restarts `api-news` when the runtime head changes

This means:

- web changes are production-deployed through Vercel after push
- API runtime code changes are pulled into the Mac mini runtime automatically after push
- local uncommitted changes are not used for runtime sync; only pushed commits are applied

## Token issuance model

World Press Radar supports two token classes:

- `NEWS_API_TOKEN`
  - internal admin token for operational checks and protected tooling
  - do not share with customers
- `NEWS_API_TOKEN_POLICIES`
  - customer tokens with explicit read policies
  - these are the tokens you issue to customer accounts

Recommended policy:

- issue at least one token per customer company
- prefer one token per end user if you want clean revocation and audit trails
- rotate tokens rather than reusing one shared token across every customer

## Production rollout checklist

1. Start PostgreSQL and confirm the ingest database is healthy.
2. Start `api-news` and verify `GET /health` returns `200`.
3. Keep `NEWS_API_ALLOW_PUBLIC_READ_ONLY=0`.
4. Set `NEXT_PUBLIC_NEWS_API_BASE_URL` on the web app deployment.
5. Redeploy the web app.
6. Verify anonymous API requests return `401`.
7. Verify a customer token can load dashboard summary and article results.

Smoke tests:

```bash
curl -i https://<stable-api-host>/api/news
```

```bash
curl -i \
  -H "Authorization: Bearer <customer-token>" \
  "https://<stable-api-host>/api/dashboard/summary"
```

## Mac mini local operation

The primary local runtime assumes:

- local Docker PostgreSQL on the Mac mini
- hourly ingest jobs against `127.0.0.1`
- daily RSS health checks against the same database
- an `api-news` process managed locally for customer-portal reads

Runtime naming defaults:

- `WPR_*` env keys are the primary runtime contract
- runtime paths default to `~/srv/world-press-radar/*`
- launchd labels default to `com.wpr.*`
- legacy env aliases remain in scripts only as temporary migration fallbacks

Key files:

- `docker-compose.yml`
- `.env.macmini.local`
- `scripts/run-ingest-hourly-local.sh`
- `scripts/run-rss-health-daily-local.sh`
- `scripts/run-api-news.sh`
- `scripts/setup-launchd-local.sh`
- `ops/launchd/*.plist`
- `docs/customer-portal-ops.md`

Useful commands:

```bash
docker compose up -d postgres
bash scripts/bootstrap-wpr-db.sh
bun run ingest:local:run
bun run rss:health:local:run
bash scripts/setup-launchd-local.sh update
bash scripts/run-api-news.sh
```

## Repository scope

- maintain a global RSS source catalog with clear health status
- ingest and normalize article data into PostgreSQL
- power a token-gated customer portal for browsing tracked coverage
- support repeatable health checks, API reads, and operational workflows

Suggested GitHub tags: `rss`, `news`, `feed`, `typescript`, `postgresql`, `docker`, `bun`, `radar`

### Repository metadata

Use `scripts/setup-github-metadata.sh` to set repository description and topics once:

```bash
bash scripts/setup-github-metadata.sh mylee04/world-press-radar
```

You can also set them in GitHub settings manually.

## Country-level RSS Atlas

This list covers the currently configured countries and their RSS outlets.

- Covered countries:
🇺🇸 United States, 🇨🇳 China, 🇯🇵 Japan, 🇩🇪 Germany, 🇮🇳 India, 🇬🇧 United Kingdom, 🇫🇷 France, 🇮🇹 Italy, 🇨🇦 Canada, 🇷🇺 Russia, 🇰🇷 South Korea, 🇧🇷 Brazil, 🇦🇺 Australia, 🇪🇸 Spain, 🇲🇽 Mexico, 🇮🇩 Indonesia, 🇳🇱 Netherlands, 🇨🇭 Switzerland, 🇹🇷 Turkey, 🇸🇦 Saudi Arabia, 🇹🇼 Taiwan, 🇵🇱 Poland, 🇸🇪 Sweden, 🇧🇪 Belgium, 🇹🇭 Thailand, 🇮🇷 Iran, 🇦🇷 Argentina, 🇦🇹 Austria, 🇳🇴 Norway, 🇦🇪 United Arab Emirates

- Last checked: 04/01/2026
- `❌ NO_SOURCE` means no RSS source is configured for this country yet.
- `❌ 000` means not verified in the current environment yet.

## Health Check Workflow

Source of truth:
- `data/rss-atlas.json`

Run health check (daily) locally:
- `bun run rss:health:daily`
- `bun run rss:failure:watchlist` (Generate a DB-backed watch/disable-candidate report for persistently failing endpoints)
- `bun run rss:failure:watchlist:apply` (Apply `DISABLE_CANDIDATE` rows to `data/rss-atlas.json` by setting `enabled:false`)
- `bun run rss:failure:3d:report` (Recommended policy: evaluate sustained failures over 3 days)
- `bun run rss:failure:3d:apply` (Recommended policy: disable sustained failures over 3 days)
- `bun run rss:failure:24h:report` (Strict policy: report endpoints with 24h full failure)
- `bun run rss:failure:24h:apply` (Strict policy: disable endpoints with 24h full failure)

GitHub Actions:
- Only `.github/workflows/security-audit.yml` remains for repo-level dependency checks.
- Ingest, Discord reporting, RSS health, and retention jobs now run locally via `launchd`/local scripts.

Note about "Last checked" date in README:
- Local RSS health runs update `README.md`/catalog outputs when those snapshots change.
- If no commit appears for a given day, the generated snapshot was identical (no diff), so there was nothing to push.
- `Daily` / `Since baseline` columns are filled from Postgres ingest aggregates. If `DATABASE_URL` is missing or DB has no ingest rows for an outlet yet, they appear as `-` (DB unavailable) or `0` (available but no rows).

Data retention policy used by the daily job:
- `news_articles`: keep last **3 days**

Retention values can be changed at runtime by setting:
- `NEWS_ARTICLES_RETENTION_DAYS`

## Beat Classification Strategy

Classification uses a hybrid order for better multilingual accuracy and cost control:

1. RSS category metadata first (`category`, `dc:subject`, atom `category term`) when available
2. Locale keyword rules as fallback/augmentation
3. LLM fallback only for low-confidence cases

Locale keyword dictionaries are split by language under:

- `lib/classifier/locales/en.ts`
- `lib/classifier/locales/es.ts`
- `lib/classifier/locales/ko.ts`
- `lib/classifier/locales/ja.ts`
- `lib/classifier/locales/fr.ts`
- `lib/classifier/locales/ru.ts`
- `lib/classifier/locales/it.ts`
- `lib/classifier/locales/pt.ts`
- `lib/classifier/locales/zh.ts`
- `lib/classifier/locales/vi.ts`
- `lib/classifier/locales/nl.ts`


































## Latest RSS verification snapshot

- Checked endpoints: `2519`
- Valid: `2446`
- Invalid: `73`
- Recovered via sitemap: `35`
- No-source rows: `752`
- Sitemap fallback checks: checked `108`, attempted `108`, success `35`, failed `73`, no-candidate `0`, candidates `750`
- Snapshot date: `04/01/2026`
- README volume column: `Ingested 24h` (unique rows in `news_articles.created_at`)
- Source artifact: `audits/readme_rss_health_latest.json`

### Failure reasons
|Reason|Count|
|---|---:|
|HTTP_403|42|
|HTML_RETURNED|13|
|TIMEOUT|8|
|NETWORK|3|
|HTTP_503|3|
|HTTP_404|2|
|HTTP_500|1|
|TLS|1|

### Invalid feeds by reason

#### HTTP_403 (42)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Argentina|BAE Negocios|<https://www.baenegocios.com/feed/>|403|
|Argentina|Cronica|<https://www.cronica.com.ar/feed/>|403|
|Austria|Finanzen.at (Stocks/Finance)|<https://www.finanzen.at/rss/news>|403|
|Egypt|Dostor|<https://www.dostor.org/RSS.aspx>|403|
|India|DNA India (India)|<https://www.dnaindia.com/feeds/india.xml>|403|
|India|Firstpost|<https://www.firstpost.com/commonfeeds/v1/mfp/rss/web-stories.xml>|403|
|Indonesia|RM.ID - Ekonomi Bisnis|<https://rm.id/rss-rakyat-merdeka/ekonomi-bisnis>|403|
|Ireland|Sunday World|<https://www.sundayworld.com/feed>|403|
|Japan|Mainichi Flash|<https://mainichi.jp/rss/etc/mainichi-flash.rss>|403|
|Qatar|Doha News|<https://www.dohanews.co/feed/>|403|
|Saudi Arabia|Arab News|<https://www.arabnews.com/rss.xml>|403|
|Switzerland|Blick (Ausland)|<https://www.blick.ch/ausland/rss.xml>|403|
|Switzerland|Blick (Politik)|<https://www.blick.ch/politik/rss.xml>|403|
|Switzerland|Blick (Schweiz)|<https://www.blick.ch/schweiz/rss.xml>|403|
|Switzerland|Blick (Sport)|<https://www.blick.ch/sport/rss.xml>|403|
|Switzerland|Blick (Swiss #1 Popular Daily - German)|<https://www.blick.ch/rss.xml>|403|
|Switzerland|Blick (Wirtschaft)|<https://www.blick.ch/wirtschaft/rss.xml>|403|
|Switzerland|Blick Sport (Eishockey)|<https://www.blick.ch/sport/eishockey/rss.xml>|403|
|Switzerland|Blick Sport (Fussball)|<https://www.blick.ch/sport/fussball/rss.xml>|403|
|Switzerland|Blick Sport (Ski)|<https://www.blick.ch/sport/ski/rss.xml>|403|
|Switzerland|Blick Sport (Tennis)|<https://www.blick.ch/sport/tennis/rss.xml>|403|
|Taiwan|Liberty Times - Business|<https://news.ltn.com.tw/rss/business.xml>|403|
|Taiwan|Liberty Times |<https://news.ltn.com.tw/rss/all.xml>|403|
|Taiwan|Liberty Times |<https://news.ltn.com.tw/rss/world.xml>|403|
|Taiwan|Liberty Times |<https://news.ltn.com.tw/rss/local.xml>|403|
|Taiwan|Liberty Times |<https://news.ltn.com.tw/rss/entertainment.xml>|403|
|Taiwan|Liberty Times |<https://news.ltn.com.tw/rss/politics.xml>|403|
|Taiwan|Liberty Times |<https://news.ltn.com.tw/rss/life.xml>|403|
|Taiwan|Liberty Times |<https://news.ltn.com.tw/rss/society.xml>|403|
|Taiwan|Liberty Times |<https://news.ltn.com.tw/rss/art.xml>|403|
|Taiwan|Liberty Times |<https://news.ltn.com.tw/rss/def.xml>|403|
|Taiwan|Liberty Times |<https://news.ltn.com.tw/rss/sports.xml>|403|
|Thailand|Khaosod English|<https://www.khaosodenglish.com/rss>|403|
|Thailand|Khaosod English - Food (category)|<http://www.khaosodenglish.com/category/life/food/feed>|403|
|Thailand|Matichon|<https://www.matichon.co.th/rss>|403|
|Thailand|Prachachat|<https://prachachat.net/feed/>|403|
|Turkey|T24 (Independent Digital Media)|<https://t24.com.tr/rss>|403|
|United Arab Emirates|Arabian Business|<https://www.arabianbusiness.com/feed/>|403|
|United States|Chicago Tribune|<https://chicagotribune.com/feed>|403|
|United States|Denver Post|<https://denverpost.com/feed>|403|
|United States|San Diego Union-Tribune|<https://sandiegouniontribune.com/feed>|403|
|United States|San Jose Mercury News|<https://mercurynews.com/feed>|403|

#### HTML_RETURNED (13)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Austria|PULS 24|<https://www.puls24.at/rssfeed>|200|
|Ecuador|El Comercio - Actualidad|<https://elcomercio.com/rss/actualidad>|200|
|Ecuador|El Comercio - Deportes|<https://elcomercio.com/rss/deportes>|200|
|Ecuador|El Comercio - Opinion|<https://elcomercio.com/rss/opinion>|200|
|Ecuador|El Comercio - Tendencias|<https://elcomercio.com/rss/tendencias>|200|
|Estonia|Geenius|<https://geenius.ee/feed/>|200|
|Ireland|The Sun Ireland|<https://www.thesun.ie/feed/>|200|
|Japan|Diamond Online|<https://diamond.jp/list/feed/rss>|200|
|Japan|Goo News (Business)|<https://news.goo.ne.jp/rss/topstories/business/index.rdf>|200|
|Japan|Goo News (Politics)|<https://news.goo.ne.jp/rss/topstories/politics/index.rdf>|200|
|Turkey|Hurriyet (Saglk)|<http://www.hurriyet.com.tr/rss/saglik>|200|
|United Kingdom|The Sun|<https://www.thesun.co.uk/feed/>|200|
|United States|Airline Geeks|<https://airlinegeeks.com/feed/>|200|

#### TIMEOUT (8)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Indonesia|ANTARA - Dunia|<https://www.antaranews.com/rss/dunia.xml>|-|
|Iran|Khabar Online|<https://www.khabaronline.ir/rss>|-|
|Iran|Mehr News|<https://www.mehrnews.com/rss>|-|
|Iran|MehrNews (EN) - Iran|<https://en.mehrnews.com/rss/tp/575>|-|
|Iran|MehrNews (EN) - Iran > Iran|<https://en.mehrnews.com/rss/tp/905>|-|
|Iran|MehrNews (EN) - Latest|<https://en.mehrnews.com/rss/pl/118>|-|
|Iran|MehrNews (EN) - Nature|<https://en.mehrnews.com/rss/tp/898>|-|
|Iran|MehrNews (EN) - Persian Cuisine|<https://en.mehrnews.com/rss/tp/901>|-|

#### NETWORK (3)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Chile|Radio Universidad de Chile|<https://radio.uchile.cl/feed/>|-|
|Spain|La Vanguardia - Opinion|<https://www.lavanguardia.com/rss/opinion.xml>|-|
|Spain|La Vanguardia - Politica|<https://www.lavanguardia.com/rss/politica.xml>|-|

#### HTTP_503 (3)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Thailand|Khaosod - Breaking News|<https://www.khaosod.co.th/breaking-news/feed>|503|
|Thailand|Khaosod - Covid|<https://www.khaosod.co.th/covid-19/feed>|503|
|Thailand|Khaosod - Economics|<https://www.khaosod.co.th/economics/feed>|503|

#### HTTP_404 (2)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Brazil|CNN Brasil (Business)|<https://www.cnnbrasil.com.br/business/feed/>|404|
|Indonesia|Tempo.co (Politics and Investigations)|<https://tempo.co/rss>|404|

#### HTTP_500 (1)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|India|The Times of Bengal|<https://thetimesofbengal.com/feed>|500|

#### TLS (1)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Dominican Republic|Diario 55|<https://diario55.com/feed/>|-|

### Sitemap fallback successes
|Country|Outlet|Failed RSS URL|Recovered via sitemap|
|---|---|---|---|
|United States|Aviation Pros|<https://www.aviationpros.com/rss>|<https://www.aviationpros.com/sitemap-google-news.xml>|
|United States|Aviation Week|<https://www.aviationweek.com/rss>|<https://aviationweek.com/sitemap.xml?page=1>|
|China|Tencent Tech (Tencent Technology News)|<https://new.qq.com/ch/tech/>|<https://news.qq.com/sitemap/sitemap_1012230446.xml>|
|United Kingdom|Financial Times - World|<https://www.ft.com/rss/world>|<https://www.ft.com/sitemaps/news.xml>|
|United Kingdom|Financial Times - Energy|<https://www.ft.com/rss/companies/energy>|<https://www.ft.com/sitemaps/news.xml>|
|United Kingdom|Telegraph - Business|<https://www.telegraph.co.uk/business/rss.xml>|<https://www.telegraph.co.uk/vouchercodes/sitemap/shops.xml>|
|United Kingdom|The Telegraph UK|<https://www.telegraph.co.uk/rss.xml>|<https://www.telegraph.co.uk/vouchercodes/sitemap/shops.xml>|
|Canada|CTV News - Business|<https://www.ctvnews.ca/rss/business/ctvnews-ca-business-public-rss-1.822283>|<https://www.ctvnews.ca/arc/outboundfeeds/sitemap-news/latest/>|
|Canada|BNN Bloomberg (Canada Biz)|<https://www.bnnbloomberg.ca/business/rss>|<https://www.bnnbloomberg.ca/arc/outboundfeeds/sitemap-news/latest/>|
|Russia|Expert.ru (Economy Magazine)|<https://www.expert.ru/rss/>|<https://expert.ru/sitemap-files.xml>|
|Brazil|Nexo Jornal|<https://www.nexojornal.com.br/rss.xml>|<https://www.nexojornal.com.br/nexo-video-sitemap.xml>|
|Mexico|Forbes México|<https://www.forbes.com.mx/feed/>|<https://www.forbes.com.mx/news-sitemap.xml>|
|Indonesia|Suara (Independent News)|<https://www.suara.com/rss>|<https://www.suara.com/news/sitemap-news.xml>|
|Netherlands|RTL Z (Business)|<https://www.rtlnieuws.nl/economie/rss.xml>|<https://www.rtl.nl/sitemap-news.xml>|
|Sweden|Radio Sweden - Sweden Today (podcast xml)|<http://sverigesradio.se/Podradio/xml/SRI_en_sweToday.xml>|<https://www.sverigesradio.se/newssitemap>|
|Belgium|Brussels Times|<https://www.brusselstimes.com/rss-feed>|<https://www.brusselstimes.com/google-news-sitemap.xml>|
|Thailand|Thairath (News)|<http://www.thairath.co.th/rss/news.xml>|<https://www.thairath.co.th/sitemap-news-daily.xml>|
|Thailand|Thairath (Sport)|<http://www.thairath.co.th/rss/sport.xml>|<https://www.thairath.co.th/sitemap-news-daily.xml>|
|Thailand|Bangkok Biz News (Economy)|<https://www.bangkokbiznews.com/rss/feed>|<https://image.bangkokbiznews.com/sitemap/xml/2026/sitemap_2026_03.xml>|
|Thailand|Thansettakij|<https://www.thansettakij.com/rss/feed>|<https://medias.thansettakij.com/sitemap/xml/2026/sitemap_2026_03.xml>|

### No-source rows
|Country|Outlet|
|---|---|
|Argentina|A24|
|Argentina|Canal 26|
|Argentina|El Destape Web|
|Argentina|La Capital|
|Argentina|La Voz|
|Argentina|Los Andes|
|Argentina|Minutouno|
|Argentina|TyC Sports|
|Argentina|Urgente24|
|Australia|AAP - Sitemap|
|Australia|ABC News - Sitemap|
|Australia|AdelaideNow - Sitemap Index|
|Australia|AFR (Financial Review)|
|Australia|Brisbane Times - News Sitemap|
|Australia|Courier Mail - Sitemap Index|
|Australia|Daily Telegraph Australia - Sitemap Index|
|Australia|Geelong Advertiser - Sitemap Index|
|Australia|Gold Coast Bulletin - Sitemap Index|
|Australia|Herald Sun - Sitemap Index|
|Australia|InDaily QLD - News Sitemap|
|Australia|InDaily SA - News Sitemap|
|Australia|News.com.au - Sitemap Index|
|Australia|NT News - Sitemap Index|
|Australia|PerthNow - News Sitemap|
|Australia|SBS Dateline - Sitemap|
|Australia|SBS News - English Sitemap|
|Australia|SBS News - Sitemap|
|Australia|Sky News - Sitemap Index|
|Australia|Sydney Morning Herald - Articles Sitemap Index|
|Australia|The Age - Articles Sitemap Index|
|Australia|The Australian - News Sitemap|
|Australia|The Australian - Sitemap Index|
|Australia|The Chronicle - Sitemap Index|
|Australia|The Mercury - Sitemap Index|
|Australia|The West Australian - News Sitemap|
|Australia|Townsville Bulletin - Sitemap Index|
|Australia|WAtoday - News Sitemap|
|Australia|Weekly Times - Sitemap Index|
|Australia|Yahoo News Australia - Google News Sitemap|
|Austria|Die Presse - News Sitemap|
|Austria|exxpress|
|Austria|Heute - Sitemap Index|
|Austria|Kleine Zeitung - News Sitemap|
|Austria|Kurier - Google News Sitemap|
|Austria|MeinBezirk|
|Austria|PULS 24 - Article Sitemap|
|Austria|Salzburg24 - News Artikel Sitemap|
|Austria|Salzburger Nachrichten - News Sitemap|
|Austria|Wiener Zeitung - News Sitemap|
|Belgium|De Standaard - News Sitemap|
|Belgium|DHnet - News Sitemap|
|Belgium|Gazet van Antwerpen - News Sitemap|
|Belgium|Het Belang van Limburg - News Sitemap|
|Belgium|Het Nieuwsblad - News Sitemap|
|Belgium|L'Avenir - News Sitemap|
|Belgium|La Libre - News Sitemap|
|Belgium|Le Soir - News Sitemap|
|Belgium|Sudinfo - News Sitemap|
|Belgium|VRT News - News Sitemap|
|Brazil|Estadao - Sitemap Index by Day|
|Brazil|Metropoles - Google News Sitemap|
|Brazil|O Globo - News Sitemap|
|Bulgaria|24 Chasa|
|Bulgaria|Blitz - Google News Sitemap|
|Bulgaria|BNR - Sitemap Index|
|Bulgaria|BNT News|
|Bulgaria|Dnes.bg - Current Sitemap|
|Bulgaria|Fakti - Google News Sitemap|
|Bulgaria|Fakti - Sitemap Index|
|Bulgaria|NOVA - Bulgaria|
|Bulgaria|NOVA - Crime|
|Bulgaria|NOVA - Latest Accents|
|Bulgaria|NOVA - Latest News|
|Bulgaria|NOVA - World|
|Bulgaria|SEGA - Google News Sitemap|
|Bulgaria|Vesti - Bulgaria Sitemap|
|Bulgaria|Vesti - Latest News Sitemap|
|Bulgaria|Vesti - Sitemap Index|
|Bulgaria|Vesti - World Sitemap|
|Canada|Cambridge Times - News Sitemap|
|Canada|CP24 - Sitemap Index|
|Canada|CP24 - Sitemap News Index|
|Canada|CTV Atlantic - Sitemap News Index|
|Canada|CTV Barrie - Sitemap News Index|
|Canada|CTV Calgary - Sitemap News Index|
|Canada|CTV Edmonton - Sitemap News Index|
|Canada|CTV Kitchener - Sitemap News Index|
|Canada|CTV London - Sitemap News Index|
|Canada|CTV Montreal - Sitemap News Index|
|Canada|CTV News - Sitemap News Index|
|Canada|CTV Northern Ontario - Sitemap News Index|
|Canada|CTV Ottawa - Sitemap News Index|
|Canada|CTV Regina - Sitemap News Index|
|Canada|CTV Saskatoon - Sitemap News Index|
|Canada|CTV Toronto - Sitemap News Index|
|Canada|CTV Vancouver - Sitemap News Index|
|Canada|CTV Vancouver Island - Sitemap News Index|
|Canada|CTV Winnipeg - Sitemap News Index|
|Canada|Global News - News Sitemap|
|Canada|Guelph Mercury - News Sitemap|
|Canada|Hamilton Spectator - News Sitemap|
|Canada|InsideHalton - News Sitemap|
|Canada|Journal de Montreal - News Sitemap|
|Canada|Journal de Quebec - News Sitemap|
|Canada|La Presse - News Sitemap|
|Canada|La Tribune - News Sitemap|
|Canada|La Voix de l'Est - News Sitemap|
|Canada|Le Devoir - Sitemap|
|Canada|Le Droit - News Sitemap|
|Canada|Le Nouvelliste - News Sitemap|
|Canada|Le Quotidien - News Sitemap|
|Canada|Le Soleil - News Sitemap|
|Canada|National Post - News Sitemap|
|Canada|Niagara Falls Review - News Sitemap|
|Canada|Noovo Info - Latest News Sitemap|
|Canada|Noovo Info - News Sitemap Index|
|Canada|Peterborough Examiner - News Sitemap|
|Canada|Radio-Canada - Info Sitemap|
|Canada|Simcoe - News Sitemap|
|Canada|St. Catharines Standard - News Sitemap|
|Canada|Standard-Freeholder|
|Canada|The Globe and Mail - Sitemap Index|
|Canada|Toronto Star - Sitemap Index|
|Canada|Toronto.com - News Sitemap|
|Canada|TVA Nouvelles - News Sitemap|
|Canada|TVA Sports - News Sitemap|
|Canada|Waterloo Region Record - News Sitemap|
|Canada|Welland Tribune - News Sitemap|
|Chile|24Horas - Sitemap 202603|
|Chile|24Horas - Sitemap Index|
|Chile|Chilevision Noticias|
|Chile|CNN Chile|
|Chile|El Dinamo|
|Chile|El Mostrador|
|Chile|Emol - Autos Sitemap 2026|
|Chile|Emol - Cronica Sitemap 2026|
|Chile|Emol - Deportes Sitemap 2026|
|Chile|Emol - Economia Sitemap 2026|
|Chile|Emol - Espectaculos Sitemap 2026|
|Chile|Emol - Internacional Sitemap 2026|
|Chile|Emol - Nacional Sitemap 2026|
|Chile|Emol - Tecnologia Sitemap 2026|
|Chile|Meganoticias|
|Chile|Meganoticias - News Sitemap|
|Chile|Radio Agricultura|
|China|CGTN - Latest News Sitemap|
|China|Global Times - News Sitemap|
|China|HK01 - News Sitemap|
|China|People.cn - News Sitemap Index|
|China|Shine - News Sitemap|
|China|The Standard - News Sitemap|
|Colombia|Blu Radio - Latest Sitemap|
|Colombia|Caracol Radio - News Sitemap|
|Colombia|El Colombiano - News Sitemap|
|Colombia|El Heraldo - News Sitemap|
|Colombia|Portafolio - News Sitemap|
|Croatia|24sata|
|Croatia|Dnevnik.hr|
|Croatia|Dnevno - Sitemap|
|Croatia|HRT Vijesti|
|Croatia|Jutarnji list - March 2026 Sitemap|
|Croatia|N1 Hrvatska|
|Croatia|Net.hr - News Sitemap|
|Croatia|RTL Hrvatska - Latest Pages|
|Croatia|Telegram.hr|
|Czech Republic|Blesk|
|Czech Republic|Blesk - Elections Sitemap|
|Czech Republic|Blesk - Videoarticle Sitemap|
|Czech Republic|Denik - News Sitemap|
|Czech Republic|E15|
|Czech Republic|Extra.cz - Google News Sitemap|
|Czech Republic|iDNES.cz|
|Czech Republic|Lidovky.cz|
|Czech Republic|Reflex|
|Czech Republic|Sport.cz - Articles Sitemap|
|Czech Republic|Sport.cz - News Sitemap|
|Czech Republic|Sport.cz - Online Sitemap|
|Czech Republic|Super.cz - News Sitemap|
|Czech Republic|TN Nova - News Sitemap 2|
|Czech Republic|TN Nova - News Sitemap 3|
|Denmark|Amtsavisen - Sitemap|
|Denmark|Avisen Danmark - Sitemap Index|
|Denmark|Avisen.dk|
|Denmark|Berlingske|
|Denmark|BT|
|Denmark|Dagbladet Holstebro-Struer - Sitemap|
|Denmark|FAA - Sitemap|
|Denmark|Finans.dk - Sitemap Index|
|Denmark|Folketidende - Sitemap|
|Denmark|Fyens - Sitemap Index|
|Denmark|HSFO - Sitemap|
|Denmark|Information - Latest Sitemap|
|Denmark|JV - Sitemap|
|Denmark|Jyllands-Posten|
|Denmark|Nordjyske - Sitemap Index|
|Denmark|SN.dk - News Sitemap|
|Denmark|Stiften - Sitemap|
|Denmark|VAFO - Sitemap|
|Denmark|Viborg Folkeblad - Sitemap|
|Denmark|Weekendavisen|
|Dominican Republic|Acento|
|Dominican Republic|Acento - Daily Sitemap|
|Dominican Republic|CDN - News Sitemap|
|Dominican Republic|Diario Libre - March 2026 Sitemap|
|Dominican Republic|Diario Libre - News Sitemap|
|Dominican Republic|El Caribe|
|Dominican Republic|Listin Diario - Google News Sitemap|
|Dominican Republic|Listin Diario - March 2026 Sitemap|
|Dominican Republic|Listin Diario - Portada|
|Dominican Republic|Periodico Hoy - Google News Sitemap|
|Egypt|Ahl Masr - Sitemap|
|Egypt|Al Mal - Sitemap Index|
|Egypt|Al Wafd - Sitemap Index|
|Egypt|Cairo24 - Newsmap|
|Egypt|El Balad - Sitemap Index|
|Egypt|El Watan - News Sitemap|
|Egypt|FilGoal - Articles Sitemap Index|
|Egypt|Masrawy - Economy Sitemap|
|Egypt|Masrawy - General News Sitemap|
|Egypt|Masrawy - Sports Sitemap|
|Egypt|SEE News - Sitemap|
|Egypt|Veto - Newsmap|
|Egypt|Yallakora - Egypt News Sitemap|
|Egypt|Yallakora - International News Sitemap|
|Estonia|Anne & Stiil - News 1|
|Estonia|Arileht|
|Estonia|Arileht - News 1|
|Estonia|Arvamus - News 1|
|Estonia|Delfi Estonia|
|Estonia|Delfi Estonia - News 1|
|Estonia|Delfi Russia - News 1|
|Estonia|Delfi Sport - News 1|
|Estonia|Eesti Naine - News 1|
|Estonia|Ekspress - News 1|
|Estonia|Forte - News 1|
|Estonia|Kroonika - News 1|
|Estonia|Maaleht - News 1|
|Estonia|Moodne Kodu - News 1|
|Finland|Aamulehti|
|Finland|Aamulehti - Sitemap Index|
|Finland|Helsingin Sanomat - Sitemap Index|
|Finland|Ilta-Sanomat - Sitemap Index|
|Finland|Iltalehti - Sitemap Index|
|Finland|Kauppalehti|
|Finland|MTV Uutiset|
|Finland|MTV Uutiset - Sitemap Index|
|Finland|Satakunnan Kansa|
|Finland|Suur-Keuruu|
|Finland|Talouselama - Sitemap Index|
|Finland|Tekniikkatalous - Sitemap Index|
|Finland|Turun Sanomat - Google News|
|Finland|Turun Sanomat - Latest Sitemap|
|Finland|Uusi Suomi - Sitemap Index|
|France|20 Minutes - News Sitemap|
|France|Actu.fr - News Sitemap|
|France|BFM TV - News Sitemap|
|France|CNEWS - Google News Sitemap|
|France|France Info - News Sitemap|
|France|L'Equipe - Dynamic News Sitemap|
|France|Le Figaro - News Sitemap|
|France|Le Monde - News Sitemap|
|France|Le Parisien - News Sitemap Index|
|France|Le Point - News Sitemap|
|France|Le Telegramme - News Sitemap|
|France|Liberation - News Sitemap|
|France|TF1 Info - News Sitemap|
|Germany|Augsburger Allgemeine - News Sitemap|
|Germany|Berliner Morgenpost - News Sitemap|
|Germany|Berliner Zeitung - Sitemap Index|
|Germany|BILD - News Sitemap|
|Germany|Der Spiegel - News Sitemap|
|Germany|Die Zeit - Sitemap Index|
|Germany|Frankfurter Allgemeine - News Sitemap|
|Germany|Frankfurter Rundschau - News Sitemap|
|Germany|Handelsblatt - Agentur News Sitemap|
|Germany|Handelsblatt - News Sitemap|
|Germany|Handelsblatt - Premium News Sitemap|
|Germany|kicker - Google News Sitemap|
|Germany|Merkur - News Sitemap|
|Germany|n-tv - News Sitemap|
|Germany|RTL.de - News Sitemap|
|Germany|TAG24 - Google News Sitemap|
|Germany|Tagesspiegel - News Sitemap|
|Germany|tz.de - News Sitemap|
|Germany|WELT - News Sitemap|
|Greece|Capital.gr - Google News Sitemap|
|Greece|CNN Greece - News Sitemap|
|Greece|Documento - News Sitemap|
|Greece|Enikos - News Sitemap|
|Greece|Gazzetta - News Sitemap|
|Greece|Liberal - News Sitemap|
|Greece|Mononews - Sitemap|
|Greece|News247 - News Sitemap|
|Greece|Newsbomb - Articles Sitemap|
|Greece|Newsbomb - Google News Sitemap|
|Greece|Newsit - News Sitemap|
|Greece|Parapolitika - News Sitemap|
|Greece|Powergame - News Sitemap|
|Greece|Ta Nea - News Sitemap|
|Greece|Zougla - News Sitemap|
|Hungary|24.hu - Fresh Sitemap|
|Hungary|444.hu - News Sitemap|
|Hungary|Blikk - News Sitemap|
|Hungary|Economx - News Sitemap|
|Hungary|Index.hu|
|Hungary|Magyar Nemzet - Sitemap Index|
|Hungary|Mandiner - Sitemap Index|
|Hungary|Nepszava - Sitemap|
|Hungary|Origo - News Sitemap|
|Hungary|Penzcentrum - Sitemap Index|
|Hungary|Portfolio|
|Hungary|VG.hu - News Sitemap|
|India|Deccan Herald - News Sitemap|
|India|Hindustan Times - News Sitemap|
|India|Livemint - Today Sitemap|
|India|ThePrint - Google News Sitemap|
|Indonesia|Bisnis.com - News Sitemap|
|Indonesia|CNBC Indonesia - Sitemap Index|
|Indonesia|CNN Indonesia - Edukasi Sitemap|
|Indonesia|CNN Indonesia - Ekonomi Sitemap|
|Indonesia|CNN Indonesia - Gaya Hidup Sitemap|
|Indonesia|CNN Indonesia - Hiburan Sitemap|
|Indonesia|CNN Indonesia - Internasional Sitemap|
|Indonesia|CNN Indonesia - Nasional Sitemap|
|Indonesia|CNN Indonesia - Olahraga Sitemap|
|Indonesia|CNN Indonesia - Otomotif Sitemap|
|Indonesia|CNN Indonesia - Teknologi Sitemap|
|Indonesia|Detik - Sitemap Index|
|Indonesia|Kompas - Sitemap Index|
|Indonesia|Kontan - Sitemap Index|
|Indonesia|Liputan6 - Sitemap Index|
|Indonesia|Merdeka - Sitemap Index|
|Indonesia|MetroTV News - Ekonomi Sitemap|
|Indonesia|MetroTV News - Internasional Sitemap|
|Indonesia|MetroTV News - Nasional Sitemap|
|Indonesia|MetroTV News - News Sitemap|
|Indonesia|Sindo News - Sitemap Index|
|Indonesia|Viva - Sitemap Index|
|Ireland|Independent.ie - Sitemap Index|
|Ireland|Irish Examiner - Google Sitemap|
|Ireland|Irish Legal News|
|Ireland|Irish Mirror|
|Ireland|Irish Mirror - Sitemap Index|
|Ireland|Irish News - Sitemap Index|
|Ireland|Kilkenny People - Sitemap|
|Ireland|Leinster Leader|
|Ireland|Leitrim Observer - Sitemap|
|Ireland|Limerick Leader|
|Ireland|Longford Leader - Sitemap|
|Ireland|Mayo News - Sitemap|
|Ireland|Tipperary Live - Sitemap|
|Ireland|Waterford Live - Sitemap|
|Italy|Adnkronos - Sitemap Index|
|Italy|AGI - News Sitemap|
|Italy|ANSA - Sitemap Index|
|Italy|Corriere della Sera - Economia Sitemap|
|Italy|Corriere della Sera - Esteri Sitemap|
|Italy|Corriere della Sera - Interni Sitemap|
|Italy|Corriere della Sera - Politica Sitemap|
|Italy|Il Messaggero - News Sitemap|
|Italy|Il Sole 24 Ore - News Sitemap|
|Italy|la Repubblica - News Sitemap|
|Italy|La Stampa - News Sitemap|
|Italy|Open.online - News Sitemap|
|Italy|Quotidiano.net - Day Sitemap|
|Italy|RaiNews - Sitemap Index|
|Italy|TgCom24 - News Sitemap|
|Japan|Abema Times - Latest Sitemap|
|Japan|Asahi Shimbun|
|Japan|Chunichi - News Sitemap|
|Japan|FNN Prime - Sitemap|
|Japan|Jiji Press - Sitemap|
|Japan|Nikkei - News Sitemap|
|Japan|NTV - News Sitemap|
|Japan|Oricon - News Sitemap|
|Japan|Sankei - Google Sitemap Index|
|Japan|Sponichi - Recent Sitemap|
|Japan|TBS News DIG - Sitemap|
|Japan|Tokyo Sports - Sitemap|
|Japan|Yomiuri - Full Sitemap|
|Japan|Yomiuri Latest|
|Latvia|Delfi Latvia|
|Latvia|Rus Delfi Latvia - News 1|
|Lithuania|15min|
|Lithuania|15min - Articles Index|
|Lithuania|15min - Live Sitemap|
|Lithuania|Delfi Lithuania|
|Lithuania|Delfi Lithuania - Latest Sitemap|
|Lithuania|Delfi Lithuania - Sitemap Index|
|Lithuania|Diena|
|Lithuania|Kauno Diena - Sitemap Index|
|Lithuania|TV3 Lithuania|
|Lithuania|TV3 Lithuania - Sitemap Index|
|Lithuania|TV3 Lithuania - Week 2026-12 Sitemap|
|Lithuania|VE.lt - News Sitemap|
|Luxembourg|Contacto - March 2026 Articles Sitemap|
|Luxembourg|Delano - Articles Sitemap|
|Luxembourg|L'essentiel - DE Articles Sitemap|
|Luxembourg|L'essentiel - FR Articles Sitemap|
|Luxembourg|Luxembourg Times|
|Luxembourg|Luxemburger Wort|
|Luxembourg|Luxtoday - Articles Sitemap|
|Luxembourg|Luxtoday - News Sitemap|
|Luxembourg|Paperjam - Articles Sitemap|
|Luxembourg|Virgule - March 2026 Articles Sitemap|
|Mexico|Animal Politico - News Sitemap|
|Mexico|Azteca Noticias - News Latest Sitemap|
|Mexico|Azteca Noticias - Sitemap Latest|
|Mexico|El Heraldo de Mexico - News Sitemap Index|
|Mexico|El Sol de Mexico - Update Sitemap|
|Mexico|El Universal - Cartera Sitemap|
|Mexico|El Universal - Ciencia Sitemap|
|Mexico|El Universal - Cultura Sitemap|
|Mexico|El Universal - De Ultima Sitemap|
|Mexico|El Universal - Deportes Sitemap|
|Mexico|El Universal - Edomex Sitemap|
|Mexico|El Universal - Elecciones Sitemap|
|Mexico|El Universal - Espectaculos Sitemap|
|Mexico|El Universal - Estados Sitemap|
|Mexico|El Universal - General Sitemap|
|Mexico|El Universal - Mundo Sitemap|
|Mexico|El Universal - Nacion Sitemap|
|Mexico|El Universal - News Sitemap|
|Mexico|El Universal - Opinion Sitemap|
|Mexico|El Universal - Techbit Sitemap|
|Mexico|El Universal - Tendencias Sitemap|
|Mexico|Excelsior - News Sitemap|
|Mexico|Excelsior - Sitemap Index|
|Mexico|Expansion Politica - News Sitemap|
|Mexico|Milenio - Articles Sitemap Index|
|Mexico|Milenio - Google News Sitemap|
|Mexico|N+MAS - News Sitemap|
|Mexico|Proceso - News Index|
|Mexico|Reforma - News Sitemap|
|Mexico|SDP Noticias - Sitemap Index|
|Mexico|UnoTV - News Sitemap|
|Mexico|Xataka Mexico - News Sitemap|
|Netherlands|AD - News Sitemap|
|Netherlands|AT5 - News Sitemap|
|Netherlands|BNR - Google News Sitemap|
|Netherlands|BNR - Sitemap Index|
|Netherlands|De Telegraaf - News Sitemap|
|Netherlands|FD - Google News Sitemap|
|Netherlands|FD - Sitemap Index|
|Netherlands|Hart van Nederland - Economie Sitemap|
|Netherlands|Hart van Nederland - Milieu & Gezondheid Sitemap|
|Netherlands|Hart van Nederland - News Sitemap|
|Netherlands|Hart van Nederland - Politiek Sitemap|
|Netherlands|Hart van Nederland - Weer Sitemap|
|Netherlands|NH Nieuws - News Sitemap|
|Netherlands|NOS - News Sitemap|
|Netherlands|NRC - Sitemap Index|
|Netherlands|NU.nl - News Sitemap|
|Netherlands|Omrop Fryslan - NL Sitemap|
|Netherlands|Rijnmond - Sitemap|
|Netherlands|WNL - News Sitemap|
|Nigeria|TheCable - Sitemap Index|
|Norway|ABC Nyheter - Article Sitemap|
|Norway|Dagen - Sitemap|
|Norway|Dagsavisen - Sitemap|
|Norway|Kampanje - Sitemap|
|Norway|Khrono - Sitemap|
|Norway|Kommunal Rapport - Sitemap|
|Norway|Vart Land - Sitemap|
|Norway|VG - Dine Penger Sitemap|
|Oman|Muscat Daily - Post Sitemap|
|Poland|PolsatNews - Sitemap 0|
|Poland|PolsatNews - Sitemap 1|
|Poland|PolskieRadio24 - Sitemap|
|Poland|RadioZet - Google News Sitemap|
|Poland|Rzeczpospolita - News Sitemap|
|Poland|SE.pl - March 2026 Sitemap|
|Poland|SE.pl - News Sitemap|
|Poland|TVP Info - Sitemap 2026|
|Portugal|24 Noticias|
|Portugal|A Bola|
|Portugal|Correio da Manha|
|Portugal|Diario de Noticias|
|Portugal|Jornal de Negocios|
|Portugal|Record|
|Portugal|RTP Noticias|
|Portugal|SAPO - Article Sitemap|
|Portugal|Sol|
|Qatar|Qatar Living - Articles Sitemap|
|Qatar|The Peninsula Qatar|
|Qatar|The Peninsula Qatar - March 2026 Sitemap|
|Romania|Adevarul - Sitemap Index|
|Romania|Antena3|
|Romania|B1TV - News Sitemap|
|Romania|Business Magazin|
|Romania|Capital - Google News Sitemap|
|Romania|Capital - March 2026 Sitemap|
|Romania|Click - Google News Sitemap|
|Romania|DCNews|
|Romania|Economedia|
|Romania|EVZ - Google News Sitemap|
|Romania|EVZ - March 2026 Sitemap|
|Romania|Fanatik - Google News Sitemap|
|Romania|Gandul|
|Romania|GSP - Google News Sitemap|
|Romania|HotNews - Sitemap Index|
|Romania|Libertatea|
|Romania|Libertatea - Articles Index|
|Romania|Mediafax|
|Romania|Observator News - Google News Sitemap|
|Romania|ProSport - News Sitemap|
|Romania|RomaniaTV - WP Sitemap Index|
|Romania|Spynews - Google News Sitemap|
|Romania|Stirile Kanal D - News RSS|
|Romania|Stirile ProTV|
|Romania|Stiripesurse - Google News Sitemap|
|Romania|Stiripesurse - Sitemap Index|
|Romania|ZF - Sitemap|
|Romania|Ziare.com|
|Saudi Arabia|Ajel - Sitemap|
|Saudi Arabia|Al Eqtisadiah (Economy - Arabic)|
|Saudi Arabia|Okaz - News Sitemap|
|Saudi Arabia|Sabq - News Sitemap|
|Saudi Arabia|Saudi Gazette - News Sitemap|
|Saudi Arabia|Saudi Press Agency (Arabic)|
|Serbia|Alo - Sitemap Index|
|Serbia|Blic - Latest Sitemap|
|Serbia|Informer - News Sitemap|
|Serbia|Kurir|
|Serbia|Mondo - News Sitemap|
|Serbia|N1|
|Serbia|N1 Serbia|
|Serbia|NIN - News Sitemap|
|Serbia|Nova.rs - News Sitemap|
|Serbia|Novosti|
|Serbia|Republika - News Sitemap|
|Serbia|Tanjug - News Sitemap|
|Serbia|Telegraf|
|Serbia|Vreme - Sitemap Index|
|Singapore|8world - News Sitemap|
|Singapore|BERITA Mediacorp - News Sitemap|
|Singapore|HardwareZone - Sitemap|
|Singapore|Seithi Mediacorp - News Sitemap|
|Singapore|Shin Min - News Sitemap|
|Singapore|Singapore Business Review - Sitemap|
|Singapore|Straits Times - Current Month Feeds Sitemap|
|Singapore|ThinkChina - Sitemap|
|Singapore|Zaobao - News Sitemap|
|Slovakia|Novy Cas - Google News Sitemap|
|Slovakia|Pluska - Google News Sitemap|
|Slovakia|Standard|
|Slovakia|Trend - Google News Sitemap|
|Slovakia|TVNoviny.sk|
|Slovakia|Webnoviny - Current Sitemap|
|Slovenia|Finance - News Sitemap|
|Slovenia|Slovenske novice - Sitemap Index|
|South Africa|Daily Maverick - News Sitemap|
|South Africa|EWN - Sitemap|
|South Korea|JoongAng - Latest Articles|
|South Korea|JTBC - Latest Articles|
|South Korea|KBS News - Recent Sitemap|
|South Korea|Yonhap Korea - News Sitemap 3|
|South Korea|Yonhap Korea - News Sitemap 4|
|South Korea|Yonhap Korea - News Sitemap 5|
|South Korea|Yonhap Korea - News Sitemap 6|
|Spain|20 Minutos - Google News Sitemap|
|Spain|20 Minutos - Incremental Sitemap|
|Spain|ABC.es - Sitemap|
|Spain|El Correo - Incremental Sitemap|
|Spain|El Espanol - Google News Sitemap|
|Spain|El Pais - News Sitemap|
|Spain|El Periodico - Month Sitemap|
|Spain|El Periodico - News Sitemap|
|Spain|eldiario.es - Google News Sitemap|
|Spain|La Vanguardia - News Sitemap|
|Spain|OKdiario - Google News Sitemap|
|Spain|RTVE - News Sitemap|
|Sweden|Aftonbladet - 48h Sitemap|
|Sweden|Barometern - News Sitemap|
|Sweden|BLT - News Sitemap|
|Sweden|Boras Tidning - News Sitemap|
|Sweden|Expressen - Google News Sitemap|
|Sweden|Nerikes Allehanda - News Sitemap|
|Sweden|Norra Skane - News Sitemap|
|Sweden|Smalandsposten - News Sitemap|
|Sweden|Svenska Dagbladet - 48h Sitemap|
|Sweden|Sydsvenskan - News Sitemap|
|Sweden|TV4 - Article Sitemap 2026-3|
|Sweden|TV4 - Breaking News Sitemap 2026-3|
|Sweden|Ystads Allehanda - News Sitemap|
|Switzerland|20 Minuten - Articles Sitemap (German)|
|Switzerland|20 Minuten - News Sitemap (German)|
|Switzerland|20 Minutes - Articles Sitemap (French)|
|Switzerland|20 Minutes - News Sitemap (French)|
|Switzerland|24 heures - News Sitemap|
|Switzerland|Basler Zeitung - News Sitemap|
|Switzerland|Berner Zeitung - News Sitemap|
|Switzerland|Blick - Article Sitemap|
|Switzerland|Blick - News Sitemap|
|Switzerland|Blick FR - Article Sitemap|
|Switzerland|Blick FR - News Sitemap|
|Switzerland|Bote der Urschweiz - Articles Sitemap|
|Switzerland|Cash.ch - Articles Sitemap|
|Switzerland|Corriere del Ticino - Sitemap|
|Switzerland|Frapp - French Articles Sitemap|
|Switzerland|Handelszeitung - Articles Sitemap|
|Switzerland|laRegione - News Sitemap|
|Switzerland|Le Matin - Articles Sitemap|
|Switzerland|Nau.ch - News Sitemap|
|Switzerland|RSI - Sitemap|
|Switzerland|SRF - News Sitemap|
|Switzerland|Swissinfo DE - News Sitemap|
|Switzerland|Swissinfo EN - News Sitemap|
|Switzerland|Swissinfo ES - News Sitemap|
|Switzerland|Swissinfo FR - News Sitemap|
|Switzerland|Swissinfo IT - News Sitemap|
|Switzerland|Tele1 - Sitemap|
|Switzerland|TeleBarn - Sitemap|
|Switzerland|TeleM1 - Sitemap|
|Switzerland|TeleZuri - Sitemap|
|Switzerland|Ticinonline - Sitemap|
|Switzerland|Tribune de Geneve - News Sitemap|
|Switzerland|Watson - Google News Sitemap|
|Switzerland|Watson - Google Sitemap DE|
|Switzerland|Watson - Google Sitemap FR|
|Switzerland|zentralplus - News Sitemap|
|Taiwan|Business Today - News Sitemap|
|Taiwan|CTS News - Google Sitemap|
|Taiwan|CTWant - News Sitemap|
|Taiwan|EBC News - Realtime Sitemap|
|Taiwan|ETtoday - News Sitemap|
|Taiwan|Mirror Media - Externals News Sitemap|
|Taiwan|Mirror Media - Posts News Sitemap|
|Taiwan|Nownews - Daily News Sitemap|
|Taiwan|SETN - Google News Sitemap|
|Taiwan|Storm Media - Sitemap|
|Taiwan|TVBS - Latest Sitemap|
|Taiwan|UDN - News Sitemap Index|
|Taiwan|Yahoo Taiwan - News Sitemap p0|
|Taiwan|Yahoo Taiwan - News Sitemap p1|
|Taiwan|Yahoo Taiwan - News Sitemap p2|
|Thailand|Bangkok Biz News - Latest Sitemap|
|Thailand|Bangkok Biz News - March 2026 Sitemap|
|Thailand|Bangkok Biz News - Sitemap Index|
|Thailand|Bangkok Post - Sitemap Index|
|Thailand|Daily News - Article Sitemap|
|Thailand|Nation Thailand - Sitemap Index|
|Thailand|Nation TV - Latest Sitemap|
|Thailand|Nation TV - March 2026 Sitemap|
|Thailand|Nation TV - Sitemap Index|
|Thailand|Post Today - Sitemap Index|
|Thailand|PPTVHD36 - Sitemap Index|
|Thailand|Thairath - Hourly Sitemap|
|Thailand|Thairath - March 2026 Sitemap|
|Thailand|Thairath - News Daily Sitemap|
|Thailand|Thairath - Sitemap Index|
|Turkey|Ahaber - News Sitemap|
|Turkey|Ensonhaber - Google News Sitemap|
|Turkey|Haber Global - Google News Sitemap|
|Turkey|Haber Global - News Sitemap|
|Turkey|Mynet - Google News Sitemap|
|Turkey|NTV - News Sitemap|
|Turkey|Sozcu - Sitemap Index|
|Turkey|T24 - Sitemap Index|
|Turkey|TGRT Haber - Google News Sitemap|
|Turkey|TRT Haber - March 2026 Sitemap|
|Turkey|TRT Haber - News Sitemap|
|Turkey|TRT Haber - Sitemap Index|
|Ukraine|24tv.ua - News 202603|
|Ukraine|Babel|
|Ukraine|Censor.net - News 202603|
|Ukraine|Espreso - News Sitemap|
|Ukraine|Focus - News Sitemap|
|Ukraine|Gazeta.ua - Fresh Sitemap|
|Ukraine|Hromadske - News Sitemap|
|Ukraine|Interfax-Ukraine|
|Ukraine|Kyiv Independent|
|Ukraine|LB.ua - News Sitemap|
|Ukraine|Liga.net - News Sitemap|
|Ukraine|Obozrevatel - News Last 24h|
|Ukraine|RBC Ukraine - News Sitemap|
|Ukraine|TSN - Google News UK|
|Ukraine|Ukrinform - Currentweek Sitemap|
|Ukraine|UNN - Google News Sitemap|
|United Arab Emirates|Al Ittihad - News Sitemap|
|United Arab Emirates|Al Khaleej - News Sitemap|
|United Arab Emirates|Albayan - News Sitemap|
|United Arab Emirates|Emarat Al Youm - Business Section|
|United Arab Emirates|Emarat Al Youm - Local Section|
|United Arab Emirates|Emarat Al Youm - News Sitemap|
|United Arab Emirates|Emarat Al Youm - Politics Section|
|United Arab Emirates|Emarat Al Youm - Sports Section|
|United Arab Emirates|Emirates 24/7 - Sitemap|
|United Arab Emirates|Gulf News - News Sitemap|
|United Arab Emirates|Khaleej Times - Arabic News Sitemap|
|United Arab Emirates|Khaleej Times - News Sitemap|
|United Kingdom|BBC News - Sitemap Index|
|United Kingdom|Birmingham Live - News Sitemap|
|United Kingdom|ChronicleLive - News Sitemap|
|United Kingdom|Daily Express - Google News Sitemap|
|United Kingdom|Daily Record - News Sitemap|
|United Kingdom|Daily Star - News Sitemap|
|United Kingdom|ExaminerLive - News Sitemap|
|United Kingdom|Liverpool Echo - News Sitemap|
|United Kingdom|Manchester Evening News - News Sitemap|
|United Kingdom|Mirror - News Sitemap|
|United Kingdom|MyLondon - News Sitemap|
|United Kingdom|The Sun - News Sitemap|
|United Kingdom|WalesOnline - News Sitemap|
|United States|Arizona Republic|
|United States|Asbury Park Press|
|United States|Associated Press - News Sitemap|
|United States|Austin American-Statesman|
|United States|Baltimore Sun|
|United States|Cincinnati Enquirer|
|United States|CNN - News Sitemap|
|United States|Courier Journal|
|United States|Dallas Morning News|
|United States|Des Moines Register|
|United States|Detroit Free Press|
|United States|Florida Times-Union|
|United States|Florida Today|
|United States|Houston Chronicle|
|United States|IndyStar|
|United States|Knox News|
|United States|Lansing State Journal|
|United States|Milwaukee Journal Sentinel|
|United States|Newsday|
|United States|NorthJersey.com|
|United States|OregonLive|
|United States|Orlando Sentinel|
|United States|Palm Beach Post|
|United States|Politico - News Sitemap|
|United States|The Columbus Dispatch|
|United States|The Oklahoman|
|United States|The Philadelphia Inquirer|
|United States|The Tennessean|
|United States|USA Today - News Sitemap|
|United States|Washington Post|
|Uruguay|Canal 10 Uruguay - Sitemap|
|Uruguay|El Observador Uruguay - Sitemap|
|Uruguay|El Pais Uruguay|
|Uruguay|El Pais Uruguay - Content Sitemap|
|Uruguay|Subrayado|
|Uruguay|Telenoche|
|Vietnam|Bao Phap Luat - Latest Articles|
|Vietnam|Bao Tin Tuc - Sitemap Index|
|Vietnam|Cong Thuong - News Sitemap|
|Vietnam|Dai Doan Ket - Sitemap Index|
|Vietnam|Nong Nghiep Moi Truong - Sitemap News|
|Vietnam|PLO - News Index|
|Vietnam|QDND - Top 300 Sitemap|
|Vietnam|Vietnam News - Sitemap|
|Vietnam|VietnamFinance - Sitemap|
|Vietnam|VietnamNet - News Sitemap|
|Vietnam|VnEconomy - Google News Sitemap|
|Vietnam|Znews - Sitemap News|
### United States (US)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|The New York Times|<https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml>|200|04/01/2026|valid|-|
2|Wall Street Journal|<https://feeds.a.dj.com/rss/RSSWorldNews.xml>|200|04/01/2026|valid|-|
3|USA Today - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
4|LA Times|<https://www.latimes.com/local/rss2.0.xml>|200|04/01/2026|valid|-|
5|CNN|<http://rss.cnn.com/rss/cnn_topstories.rss>|200|04/01/2026|valid|-|
6|CNN - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
7|Fox News|<https://feeds.foxnews.com/foxnews/latest>|200|04/01/2026|valid|-|
8|NBC News|<https://feeds.nbcnews.com/nbcnews/public/news>|200|04/01/2026|valid|-|
9|CBS News|<https://www.cbsnews.com/latest/rss/main>|200|04/01/2026|valid|-|
10|ABC News|<https://feeds.abcnews.com/abcnews/topstories>|200|04/01/2026|valid|-|
11|ABC News - U.S.|<https://feeds.abcnews.com/abcnews/usheadlines>|200|04/01/2026|valid|-|
12|ABC News - Politics|<https://feeds.abcnews.com/abcnews/politicsheadlines>|200|04/01/2026|valid|-|
13|ABC News - International|<https://feeds.abcnews.com/abcnews/internationalheadlines>|200|04/01/2026|valid|-|
14|ABC News - Business|<https://feeds.abcnews.com/abcnews/businessheadlines>|200|04/01/2026|valid|-|
15|ABC News - Technology|<https://feeds.abcnews.com/abcnews/technologyheadlines>|200|04/01/2026|valid|-|
16|NPR|<https://feeds.npr.org/1001/rss.xml>|200|04/01/2026|valid|-|
17|Washington Post|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
18|Associated Press - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
19|The New York Times - U.S.|<https://rss.nytimes.com/services/xml/rss/nyt/US.xml>|200|04/01/2026|valid|-|
20|The New York Times - Business|<https://rss.nytimes.com/services/xml/rss/nyt/Business.xml>|200|04/01/2026|valid|-|
21|The New York Times - Technology|<https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml>|200|04/01/2026|valid|-|
22|The New York Times - World|<https://rss.nytimes.com/services/xml/rss/nyt/World.xml>|200|04/01/2026|valid|-|
23|The New York Times - Politics|<https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml>|200|04/01/2026|valid|-|
24|LA Times - World & Nation|<https://www.latimes.com/world-nation/rss2.0.xml>|200|04/01/2026|valid|-|
25|LA Times - Politics|<https://www.latimes.com/politics/rss2.0.xml>|200|04/01/2026|valid|-|
26|LA Times - Business|<https://www.latimes.com/business/rss2.0.xml>|200|04/01/2026|valid|-|
27|LA Times - California|<https://www.latimes.com/california/rss2.0.xml>|200|04/01/2026|valid|-|
28|Politico Politics|<https://rss.politico.com/politics-news.xml>|200|04/01/2026|valid|-|
29|Politico Congress|<https://rss.politico.com/congress.xml>|200|04/01/2026|valid|-|
30|Politico White House|<https://rss.politico.com/whitehouse.xml>|200|04/01/2026|valid|-|
31|Politico Playbook|<https://rss.politico.com/playbook.xml>|200|04/01/2026|valid|-|
32|Washington Post - World|<https://feeds.washingtonpost.com/rss/world>|200|04/01/2026|valid|-|
33|Washington Post - National|<https://feeds.washingtonpost.com/rss/national>|200|04/01/2026|valid|-|
34|Washington Post - Politics|<https://feeds.washingtonpost.com/rss/politics>|200|04/01/2026|valid|-|
35|NPR - Politics|<https://feeds.npr.org/1014/rss.xml>|200|04/01/2026|valid|-|
36|NPR - Business|<https://feeds.npr.org/1003/rss.xml>|200|04/01/2026|valid|-|
37|NPR - World|<https://feeds.npr.org/1004/rss.xml>|200|04/01/2026|valid|-|
38|NPR - Science|<https://feeds.npr.org/1007/rss.xml>|200|04/01/2026|valid|-|
39|NPR - Technology|<https://feeds.npr.org/1019/rss.xml>|200|04/01/2026|valid|-|
40|Fox News - Politics|<https://feeds.foxnews.com/foxnews/politics>|200|04/01/2026|valid|-|
41|Fox News - National|<https://feeds.foxnews.com/foxnews/national>|200|04/01/2026|valid|-|
42|Fox News - World|<https://feeds.foxnews.com/foxnews/world>|200|04/01/2026|valid|-|
43|CBS News - Politics|<https://www.cbsnews.com/latest/rss/politics>|200|04/01/2026|valid|-|
44|CBS News - World|<https://www.cbsnews.com/latest/rss/world>|200|04/01/2026|valid|-|
45|CBS News - U.S.|<https://www.cbsnews.com/latest/rss/us>|200|04/01/2026|valid|-|
46|NBC News - Politics|<https://feeds.nbcnews.com/nbcnews/public/politics>|200|04/01/2026|valid|-|
47|NBC News - World|<https://feeds.nbcnews.com/nbcnews/public/world>|200|04/01/2026|valid|-|
48|NBC News - U.S.|<https://feeds.nbcnews.com/nbcnews/public/us-news>|200|04/01/2026|valid|-|
49|NBC News - Business|<https://feeds.nbcnews.com/nbcnews/public/business>|200|04/01/2026|valid|-|
50|HuffPost|<https://www.huffpost.com/section/front-page/feed>|200|04/01/2026|valid|-|
51|BuzzFeed News|<https://www.buzzfeednews.com/news.xml>|200|04/01/2026|valid|-|
52|Vox|<https://www.vox.com/rss/index.xml>|200|04/01/2026|valid|-|
53|CNBC|<https://www.cnbc.com/id/100003114/device/rss/rss.html>|200|04/01/2026|valid|-|
54|Financial Times|<https://www.ft.com/?format=rss>|200|04/01/2026|valid|-|
55|Forbes|<https://www.forbes.com/most-popular/feed/>|200|04/01/2026|valid|-|
56|Fortune|<https://fortune.com/feed>|200|04/01/2026|valid|-|
57|Business Insider|<https://www.businessinsider.com/rss>|200|04/01/2026|valid|-|
58|MarketWatch|<http://feeds.marketwatch.com/marketwatch/topstories/>|200|04/01/2026|valid|-|
59|Fast Company|<https://www.fastcompany.com/rss>|200|04/01/2026|valid|-|
60|TechCrunch|<https://techcrunch.com/feed/>|200|04/01/2026|valid|-|
61|The Verge|<https://www.theverge.com/rss/index.xml>|200|04/01/2026|valid|-|
62|Wired|<https://www.wired.com/feed/rss>|200|04/01/2026|valid|-|
63|Ars Technica|<http://feeds.arstechnica.com/arstechnica/index>|200|04/01/2026|valid|-|
64|Engadget|<https://www.engadget.com/rss.xml>|200|04/01/2026|valid|-|
65|VentureBeat|<https://venturebeat.com/feed/>|200|04/01/2026|valid|-|
66|Mashable|<https://mashable.com/feed>|200|04/01/2026|valid|-|
67|Gizmodo|<https://gizmodo.com/rss>|200|04/01/2026|valid|-|
68|CNET|<https://www.cnet.com/rss/news/>|200|04/01/2026|valid|-|
69|ZDNet|<https://www.zdnet.com/news/rss.xml>|200|04/01/2026|valid|-|
70|The Hill|<https://thehill.com/feed>|200|04/01/2026|valid|-|
71|Axios|<https://api.axios.com/feed/>|200|04/01/2026|valid|-|
72|Breitbart|<http://feeds.feedburner.com/breitbart>|200|04/01/2026|valid|-|
73|National Review|<https://www.nationalreview.com/feed/>|200|04/01/2026|valid|-|
74|Slate|<https://slate.com/feeds/all.rss>|200|04/01/2026|valid|-|
75|The New Yorker|<https://www.newyorker.com/feed/everything>|200|04/01/2026|valid|-|
76|The Atlantic|<https://www.theatlantic.com/feed/all/>|200|04/01/2026|valid|-|
77|Boston Globe|<https://www.bostonglobe.com/arc/outboundfeeds/rss?outputType=xml>|200|04/01/2026|valid|-|
78|New York Post|<https://nypost.com/feed>|200|04/01/2026|valid|-|
79|Chicago Tribune|<https://chicagotribune.com/feed>|403 (HTTP_403)|04/01/2026|invalid|-|
80|Seattle Times|<https://seattletimes.com/feed>|200|04/01/2026|valid|-|
81|Denver Post|<https://denverpost.com/feed>|403 (HTTP_403)|04/01/2026|invalid|-|
82|San Jose Mercury News|<https://mercurynews.com/feed>|403 (HTTP_403)|04/01/2026|invalid|-|
83|Las Vegas Review-Journal|<https://reviewjournal.com/feed>|200|04/01/2026|valid|-|
84|San Diego Union-Tribune|<https://sandiegouniontribune.com/feed>|403 (HTTP_403)|04/01/2026|invalid|-|
85|Houston Chronicle|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
86|Dallas Morning News|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
87|The Philadelphia Inquirer|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
88|OregonLive|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
89|Newsday|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
90|Baltimore Sun|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
91|Orlando Sentinel|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
92|Detroit Free Press|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
93|Arizona Republic|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
94|Milwaukee Journal Sentinel|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
95|The Tennessean|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
96|IndyStar|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
97|The Columbus Dispatch|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
98|Cincinnati Enquirer|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
99|Des Moines Register|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
100|Austin American-Statesman|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
101|Palm Beach Post|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
102|The Oklahoman|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
103|Asbury Park Press|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
104|Courier Journal|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
105|NorthJersey.com|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
106|Knox News|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
107|Florida Today|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
108|Florida Times-Union|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
109|Lansing State Journal|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
110|Press Herald|<https://www.pressherald.com/feed/>|200|04/01/2026|valid|-|
111|Arizona Daily Star|<https://tucson.com/search/?f=rss&t=article&c=news/local*&l=50&s=start_time&sd=desc>|200|04/01/2026|valid|-|
112|Tulsa World|<https://tulsaworld.com/search/?f=rss&t=article&c=news/local*&l=50&s=start_time&sd=desc>|200|04/01/2026|valid|-|
113|Honolulu Star-Advertiser|<https://staradvertiser.com/feed>|200|04/01/2026|valid|-|
114|Variety|<https://variety.com/feed>|200|04/01/2026|valid|-|
115|The Hollywood Reporter|<https://hollywoodreporter.com/feed>|200|04/01/2026|valid|-|
116|Deadline|<https://deadline.com/feed>|200|04/01/2026|valid|-|
117|Rolling Stone|<https://rollingstone.com/feed>|200|04/01/2026|valid|-|
118|Billboard|<https://billboard.com/feed>|200|04/01/2026|valid|-|
119|Vanity Fair|<http://feeds.feedburner.com/vfdotcomrss>|200|04/01/2026|valid|-|
120|Esquire|<https://www.esquire.com/rss/entertainment.xml>|200|04/01/2026|valid|-|
121|GQ|<https://www.gq.com/feed/rss>|200|04/01/2026|valid|-|
122|Space.com|<https://www.space.com/feeds/all>|200|04/01/2026|valid|-|
123|ESPN|<https://www.espn.com/espn/rss/news>|200|04/01/2026|valid|-|
124|Sports Illustrated|<https://si.com/feed>|200|04/01/2026|valid|-|
125|Mother Jones|<https://motherjones.com/feed>|200|04/01/2026|valid|-|
126|ProPublica|<https://propublica.org/feed>|200|04/01/2026|valid|-|
127|Reason|<https://reason.com/feed>|200|04/01/2026|valid|-|
128|Jacobin|<https://jacobin.com/feed>|200|04/01/2026|valid|-|
129|Quartz|<https://qz.com/feed>|200|04/01/2026|valid|-|
130|The Intercept|<https://theintercept.com/feed>|200|04/01/2026|valid|-|
131|Newsweek|<https://www.newsweek.com/rss>|200|04/01/2026|valid|-|
132|Time|<https://time.com/feed>|200|04/01/2026|valid|-|
133|PBS NewsHour|<https://www.pbs.org/newshour/feeds/rss/headlines>|200|04/01/2026|valid|-|
134|Wall Street Journal - U.S.|<https://feeds.content.dowjones.io/public/rss/RSSUSnews>|200|04/01/2026|valid|-|
135|Politico Tech|<https://rss.politico.com/technology.xml>|200|04/01/2026|valid|-|
136|Politico - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
137|TechCrunch Startups|<https://techcrunch.com/category/startups/feed/>|200|04/01/2026|valid|-|
138|TechCrunch Layoffs|<https://techcrunch.com/tag/layoffs/feed/>|200|04/01/2026|valid|-|
139|The Verge AI|<https://www.theverge.com/rss/ai-artificial-intelligence/index.xml>|200|04/01/2026|valid|-|
140|Yahoo Finance - Top Stories|<https://finance.yahoo.com/rss/topstories>|200|04/01/2026|valid|-|
141|The Diplomat|<https://thediplomat.com/feed/>|200|04/01/2026|valid|-|
142|Foreign Affairs|<https://www.foreignaffairs.com/rss.xml>|200|04/01/2026|valid|-|
143|Foreign Policy|<https://foreignpolicy.com/feed/>|200|04/01/2026|valid|-|
144|Defense One|<https://www.defenseone.com/rss/all/>|200|04/01/2026|valid|-|
145|Defense News|<https://www.defensenews.com/arc/outboundfeeds/rss/?outputType=xml>|200|04/01/2026|valid|-|
146|Military Times|<https://www.militarytimes.com/arc/outboundfeeds/rss/?outputType=xml>|200|04/01/2026|valid|-|
147|War on the Rocks|<https://warontherocks.com/feed/>|200|04/01/2026|valid|-|
148|gCaptain|<https://gcaptain.com/feed/>|200|04/01/2026|valid|-|
149|CoinDesk|<https://www.coindesk.com/arc/outboundfeeds/rss/>|200|04/01/2026|valid|-|
150|Cointelegraph|<https://cointelegraph.com/rss>|200|04/01/2026|valid|-|
151|Blockworks|<https://blockworks.co/feed>|200|04/01/2026|valid|-|
152|Decrypt|<https://decrypt.co/feed>|200|04/01/2026|valid|-|
153|KrebsOnSecurity|<https://krebsonsecurity.com/feed/>|200|04/01/2026|valid|-|
154|Dark Reading|<https://www.darkreading.com/rss.xml>|200|04/01/2026|valid|-|
155|ScienceDaily|<https://www.sciencedaily.com/rss/all.xml>|200|04/01/2026|valid|-|
156|MIT Technology Review|<https://www.technologyreview.com/feed/>|200|04/01/2026|valid|-|
157|Crunchbase News|<https://news.crunchbase.com/feed/>|200|04/01/2026|valid|-|
158|The New Stack|<https://thenewstack.io/feed/>|200|04/01/2026|valid|-|
159|The Points Guy|<https://thepointsguy.com/feed/>|200|04/01/2026|valid|-|
160|Airline Geeks|<https://airlinegeeks.com/feed/>|200 (HTML_RETURNED)|04/01/2026|invalid|-|
161|One Mile at a Time|<https://onemileatatime.com/feed/>|200|04/01/2026|valid|-|
162|View from the Wing|<https://viewfromthewing.com/feed/>|200|04/01/2026|valid|-|
163|Aviation Pros|<https://www.aviationpros.com/rss>|Recovered via sitemap|04/01/2026|valid|-|
164|Aviation Week|<https://www.aviationweek.com/rss>|Recovered via sitemap|04/01/2026|valid|-|

### China (CN)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|China Daily|<https://www.chinadaily.com.cn/rss/world_rss.xml>|200|04/01/2026|valid|-|
2|TechNode|<https://technode.com/feed>|200|04/01/2026|valid|-|
3|South China Morning Post|<https://www.scmp.com/rss/91/feed>|200|04/01/2026|valid|-|
4|Initium|<https://theinitium.com/feed>|200|04/01/2026|valid|-|
5|Liberty Times|<https://news.ltn.com.tw/rss/all.xml>|200|04/01/2026|valid|-|
6|People China|<https://people.com.cn/rss/politics.xml>|200|04/01/2026|valid|-|
7|China Daily English|<https://www.chinadaily.com.cn/rss/world_rss.xml>|200|04/01/2026|valid|-|
8|China Daily - China|<https://www.chinadaily.com.cn/rss/china_rss.xml>|200|04/01/2026|valid|-|
9|China Daily - BizChina|<https://www.chinadaily.com.cn/rss/bizchina_rss.xml>|200|04/01/2026|valid|-|
10|China Daily - Opinion|<https://www.chinadaily.com.cn/rss/opinion_rss.xml>|200|04/01/2026|valid|-|
11|China Daily - Sports|<https://www.chinadaily.com.cn/rss/sports_rss.xml>|200|04/01/2026|valid|-|
12|China Daily - Entertainment|<https://www.chinadaily.com.cn/rss/entertainment_rss.xml>|200|04/01/2026|valid|-|
13|China Daily - Lifestyle|<https://www.chinadaily.com.cn/rss/lifestyle_rss.xml>|200|04/01/2026|valid|-|
14|China Daily - Photos|<https://www.chinadaily.com.cn/rss/photo_rss.xml>|200|04/01/2026|valid|-|
15|China Daily - China Daily (main)|<https://www.chinadaily.com.cn/rss/cndy_rss.xml>|200|04/01/2026|valid|-|
16|China Daily - HK Edition|<https://www.chinadaily.com.cn/rss/hk_rss.xml>|200|04/01/2026|valid|-|
17|China Daily - USA (kindle)|<http://usa.chinadaily.com.cn/usa_kindle.xml>|needs check|04/01/2026|needs verification|-|
18|China Daily - EU Weekly|<https://europe.chinadaily.com.cn/euweekly_rss.xml>|200|04/01/2026|valid|-|
19|People.cn - Politics|<https://www.people.com.cn/rss/politics.xml>|200|04/01/2026|valid|-|
20|People.cn - Society|<https://www.people.com.cn/rss/society.xml>|200|04/01/2026|valid|-|
21|People.cn - Legal|<https://www.people.com.cn/rss/legal.xml>|200|04/01/2026|valid|-|
22|People.cn - World|<https://www.people.com.cn/rss/world.xml>|200|04/01/2026|valid|-|
23|People.cn - Opinion|<https://www.people.com.cn/rss/opinion.xml>|200|04/01/2026|valid|-|
24|People.cn - ChinaPic|<https://www.people.com.cn/rss/chinapic.xml>|200|04/01/2026|valid|-|
25|CGTN - Documentary|<https://www.cgtn.com/subscribe/rss/section/documentary.xml>|200|04/01/2026|valid|-|
26|Zaobao (realtime)|<https://www.zaobao.com.sg/rss/realtime>|needs check|04/01/2026|needs verification|-|
27|RTHK|<https://rthk.hk/rthk/news/rss/c_expressnews_clocal.xml>|200|04/01/2026|valid|-|
28|FT Chinese|<https://www.ftchinese.com/rss/feed>|200|04/01/2026|valid|-|
29|Xinhua|<https://www.xinhuanet.com/politics/news_politics.xml>|200|04/01/2026|valid|-|
30|People.cn - Finance|<https://www.people.com.cn/rss/finance.xml>|200|04/01/2026|valid|-|
31|People.cn - Military|<https://www.people.com.cn/rss/military.xml>|200|04/01/2026|valid|-|
32|People.cn - Culture|<https://www.people.com.cn/rss/culture.xml>|200|04/01/2026|valid|-|
33|Sina Finance (Top Financial Portal)|<https://rss.sina.com.cn/roll/finance/hot_roll.xml>|needs check|04/01/2026|needs verification|-|
34|Sina News (General Breaking News)|<https://rss.sina.com.cn/news/world/focus15.xml>|200|04/01/2026|valid|-|
35|HK01 (Hong Kong Digital Media Top Feed)|<https://www.hk01.com/rss>|needs check|04/01/2026|needs verification|-|
36|Ming Pao (Hong Kong Flagship Newspaper)|<https://news.mingpao.com/rss/pns/s00001.xml>|200|04/01/2026|valid|-|
37|HKET (Hong Kong Economic Times)|<https://www.hket.com/rss/hongkong>|needs check|04/01/2026|needs verification|-|
38|Tencent Tech (Tencent Technology News)|<https://new.qq.com/ch/tech/>|Recovered via sitemap|04/01/2026|valid|-|
39|China News Service - Scroll News|<https://www.chinanews.com.cn/rss/scroll-news.xml>|200|04/01/2026|valid|-|
40|China News Service - China|<https://www.chinanews.com.cn/rss/china.xml>|200|04/01/2026|valid|-|
41|China News Service - World|<https://www.chinanews.com.cn/rss/world.xml>|200|04/01/2026|valid|-|
42|China News Service - Finance|<https://www.chinanews.com.cn/rss/finance.xml>|200|04/01/2026|valid|-|
43|People.cn - News Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
44|CGTN - Latest News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
45|HK01 - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
46|The Standard - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
47|Hong Kong Free Press|<https://hongkongfp.com/feed/>|200|04/01/2026|valid|-|
48|Shine - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
49|Global Times - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
50|Caixin Global|<https://gateway.caixin.com/api/data/global/feedlyRss.xml>|200|04/01/2026|valid|-|
51|Sixth Tone|<https://www.sixthtone.com/rss/index.xml>|200|04/01/2026|valid|-|
52|ECNS|<https://www.ecns.cn/rss/rss.xml>|200|04/01/2026|valid|-|
53|CGTN - China|<https://www.cgtn.com/subscribe/rss/section/china.xml>|200|04/01/2026|valid|-|
54|CGTN - World|<https://www.cgtn.com/subscribe/rss/section/world.xml>|200|04/01/2026|valid|-|
55|CGTN - Politics|<https://www.cgtn.com/subscribe/rss/section/politics.xml>|200|04/01/2026|valid|-|
56|CGTN - Business|<https://www.cgtn.com/subscribe/rss/section/business.xml>|200|04/01/2026|valid|-|
57|CGTN - Opinion|<https://www.cgtn.com/subscribe/rss/section/opinion.xml>|200|04/01/2026|valid|-|
58|CGTN - Tech & Sci|<https://www.cgtn.com/subscribe/rss/section/tech-sci.xml>|200|04/01/2026|valid|-|
59|CGTN - Culture|<https://www.cgtn.com/subscribe/rss/section/culture.xml>|200|04/01/2026|valid|-|
60|CGTN - Sports|<https://www.cgtn.com/subscribe/rss/section/sports.xml>|200|04/01/2026|valid|-|
61|CGTN - Travel|<https://www.cgtn.com/subscribe/rss/section/travel.xml>|200|04/01/2026|valid|-|
62|CGTN - Nature|<https://www.cgtn.com/subscribe/rss/section/nature.xml>|200|04/01/2026|valid|-|
63|CGTN - Live|<https://www.cgtn.com/subscribe/rss/section/live.xml>|200|04/01/2026|valid|-|
64|CGTN - Video|<https://www.cgtn.com/subscribe/rss/section/video.xml>|200|04/01/2026|valid|-|
65|CGTN - Global Stringer|<https://www.cgtn.com/subscribe/rss/section/gstringer.xml>|200|04/01/2026|valid|-|

### Japan (JP)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|NHK World (EN)|<https://www3.nhk.or.jp/rss/news/cat0.xml>|200|04/01/2026|valid|-|
2|Mainichi (Biz)|<https://mainichi.jp/rss/etc/english_latest.rss>|needs check|04/01/2026|needs verification|-|
3|Asahi Shimbun|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
4|The Japan Times|<https://www.japantimes.co.jp/feed/>|200|04/01/2026|valid|-|
5|Automotive Ten-Navi|<https://automotive.ten-navi.com/rss/>|200|04/01/2026|valid|-|
6|The Bridge|<https://thebridge.jp/feed/>|needs check|04/01/2026|needs verification|-|
7|Nippon|<https://www.nippon.com/en/feed/>|200|04/01/2026|valid|-|
8|NHK News Web - cat1|<https://www3.nhk.or.jp/rss/news/cat1.xml>|200|04/01/2026|valid|-|
9|NHK News Web - cat2|<https://www3.nhk.or.jp/rss/news/cat2.xml>|200|04/01/2026|valid|-|
10|NHK News Web - cat3|<https://www3.nhk.or.jp/rss/news/cat3.xml>|200|04/01/2026|valid|-|
11|NHK News Web - cat4|<https://www3.nhk.or.jp/rss/news/cat4.xml>|200|04/01/2026|valid|-|
12|NHK News Web - cat5|<https://www3.nhk.or.jp/rss/news/cat5.xml>|200|04/01/2026|valid|-|
13|NHK News Web - cat6|<https://www3.nhk.or.jp/rss/news/cat6.xml>|200|04/01/2026|valid|-|
14|NHK News Web - cat7|<https://www3.nhk.or.jp/rss/news/cat7.xml>|200|04/01/2026|valid|-|
15|ITmedia - |<https://rss.itmedia.co.jp/rss/2.0/itmedia_all.xml>|200|04/01/2026|valid|-|
16|ITmedia - TOP STORIES|<https://rss.itmedia.co.jp/rss/2.0/topstory.xml>|200|04/01/2026|valid|-|
17|ITmedia NEWS - ()|<https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml>|200|04/01/2026|valid|-|
18|ITmedia NEWS - |<https://rss.itmedia.co.jp/rss/2.0/news_domestic.xml>|200|04/01/2026|valid|-|
19|ITmedia NEWS - |<https://rss.itmedia.co.jp/rss/2.0/news_foreign.xml>|200|04/01/2026|valid|-|
20|ITmedia NEWS - |<https://rss.itmedia.co.jp/rss/2.0/news_products.xml>|200|04/01/2026|valid|-|
21|ITmedia NEWS - |<https://rss.itmedia.co.jp/rss/2.0/news_security.xml>|200|04/01/2026|valid|-|
22|ITmedia NEWS - |<https://rss.itmedia.co.jp/rss/2.0/news_technology.xml>|200|04/01/2026|valid|-|
23|ITmedia NEWS - |<https://rss.itmedia.co.jp/rss/2.0/news_nettopics.xml>|200|04/01/2026|valid|-|
24|ITmedia NEWS - |<https://rss.itmedia.co.jp/rss/2.0/news_industry.xml>|200|04/01/2026|valid|-|
25|ITmedia NEWS - Special|<https://rss.itmedia.co.jp/rss/2.0/news_special.xml>|200|04/01/2026|valid|-|
26|ITmedia AI+|<https://rss.itmedia.co.jp/rss/2.0/aiplus.xml>|200|04/01/2026|valid|-|
27|ITmedia Mobile|<https://rss.itmedia.co.jp/rss/2.0/mobile.xml>|200|04/01/2026|valid|-|
28|ITmedia PC USER|<https://rss.itmedia.co.jp/rss/2.0/pcuser.xml>|200|04/01/2026|valid|-|
29|ITmedia |<https://rss.itmedia.co.jp/rss/2.0/business.xml>|200|04/01/2026|valid|-|
30|ITmedia |<https://rss.itmedia.co.jp/rss/2.0/enterprise.xml>|200|04/01/2026|valid|-|
31|J-CAST ()|<https://www.j-cast.com/index.xml>|200|04/01/2026|valid|-|
32|J-CAST|<https://www.j-cast.com/trend/index.xml>|200|04/01/2026|valid|-|
33|J-CAST|<https://www.j-cast.com/kaisha/index.xml>|200|04/01/2026|valid|-|
34|BOOK|<https://books.j-cast.com/rss.xml>|needs check|04/01/2026|needs verification|-|
35|INTERNET Watch (Impress)|<https://internet.watch.impress.co.jp/data/rss/1.0/iw/feed.rdf>|needs check|04/01/2026|needs verification|-|
36|Impress Watch ()|<https://www.watch.impress.co.jp/data/rss/1.0/ipw/feed.rdf>|needs check|04/01/2026|needs verification|-|
37|GIGAZINE (Atom)|<https://gigazine.net/news/rss_atom/>|200|04/01/2026|valid|-|
38|PR TIMES ()|<https://prtimes.jp/index.rdf>|needs check|04/01/2026|needs verification|-|
39|Yahoo Japan - Business|<https://news.yahoo.co.jp/rss/topics/business.xml>|200|04/01/2026|valid|-|
40|Yahoo Japan - World|<https://news.yahoo.co.jp/rss/topics/world.xml>|200|04/01/2026|valid|-|
41|Yahoo Japan - IT/Tech|<https://news.yahoo.co.jp/rss/topics/it.xml>|200|04/01/2026|valid|-|
42|Reuters Japan|<https://news.yahoo.co.jp/rss/media/reut/all.xml>|needs check|04/01/2026|needs verification|-|
43|Bloomberg Japan|<https://news.yahoo.co.jp/rss/media/bloom_st/all.xml>|needs check|04/01/2026|needs verification|-|
44|Forbes Japan|<https://news.yahoo.co.jp/rss/media/fminfo/all.xml>|needs check|04/01/2026|needs verification|-|
45|Kyodo News|<https://news.yahoo.co.jp/rss/media/kyodonews/all.xml>|200|04/01/2026|valid|-|
46|Toyo Keizai|<https://toyokeizai.net/list/feed/rss>|200|04/01/2026|valid|-|
47|Diamond Online|<https://diamond.jp/list/feed/rss>|200 (HTML_RETURNED)|04/01/2026|invalid|-|
48|Sankei News Flash|<https://www.sankei.com/rss/news/flash.xml>|needs check|04/01/2026|needs verification|-|
49|Sankei Economy|<https://www.sankei.com/rss/news/economy.xml>|needs check|04/01/2026|needs verification|-|
50|CNET Japan|<https://feeds.japan.cnet.com/rss/cnet/all.rdf>|needs check|04/01/2026|needs verification|-|
51|Wired Japan|<https://wired.jp/feed/rss2>|needs check|04/01/2026|needs verification|-|
52|Boundless (TechCrunch Japan Archive)|<https://news.yahoo.co.jp/rss/media/boundless/all.xml>|needs check|04/01/2026|needs verification|-|
53|Smart Japan|<https://rss.itmedia.co.jp/rss/2.0/smartjapan.xml>|200|04/01/2026|valid|-|
54|Nikkei|<https://assets.nikkei.jp/release/v1/rss/news.xml>|needs check|04/01/2026|needs verification|-|
55|Nikkei - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
56|Yomiuri Latest|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
57|Yomiuri - Full Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
58|Mainichi Flash|<https://mainichi.jp/rss/etc/mainichi-flash.rss>|403 (HTTP_403)|04/01/2026|invalid|-|
59|Sankei - Google Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
60|FNN Prime - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
61|Jiji Press - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
62|NTV - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
63|Abema Times - Latest Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
64|Oricon - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
65|Sponichi - Recent Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
66|Chunichi - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
67|TBS News DIG - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
68|Tokyo Sports - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
69|Gizmodo Japan|<https://www.gizmodo.jp/index.xml>|200|04/01/2026|valid|-|
70|PR TIMES - Business/Economy|<https://prtimes.jp/business.rdf>|needs check|04/01/2026|needs verification|-|
71|PR TIMES - Technology|<https://prtimes.jp/technology.rdf>|needs check|04/01/2026|needs verification|-|
72|Goo News (Business)|<https://news.goo.ne.jp/rss/topstories/business/index.rdf>|200 (HTML_RETURNED)|04/01/2026|invalid|-|
73|Goo News (Politics)|<https://news.goo.ne.jp/rss/topstories/politics/index.rdf>|200 (HTML_RETURNED)|04/01/2026|invalid|-|
74|Newsweek Japan|<https://www.newsweekjapan.jp/headlines.rss>|needs check|04/01/2026|needs verification|-|
75|JBpress (Japan Business Press)|<https://jbpress.ismedia.jp/list/feed/rss>|200|04/01/2026|valid|-|
76|TechCrunch Japan|<https://jp.techcrunch.com/feed/>|needs check|04/01/2026|needs verification|-|
77|President Online (Business)|<https://president.jp/list/feed/rss>|needs check|04/01/2026|needs verification|-|
78|Zenn (Tech)|<https://zenn.dev/feed>|200|04/01/2026|valid|-|
79|NHK News (Politics - Category 1)|<https://www.nhk.or.jp/rss/news/cat1.xml>|200|04/01/2026|valid|-|
80|NHK News (Economy/Business - Category 3)|<https://www.nhk.or.jp/rss/news/cat3.xml>|200|04/01/2026|valid|-|
81|Nikkan Kogyo (Industrial Manufacturing News)|<https://www.nikkan.co.jp/rss/news>|needs check|04/01/2026|needs verification|-|
82|Livedoor News (General Top Stories)|<https://news.livedoor.com/topics/rss/top.xml>|200|04/01/2026|valid|-|
83|Livedoor News (Economy)|<https://news.livedoor.com/topics/rss/eco.xml>|200|04/01/2026|valid|-|
84|GIGAZINE (Tech)|<https://gigazine.net/news/rss_2.0/>|200|04/01/2026|valid|-|
85|Qiita (Japanese IT Trends)|<https://qiita.com/popular-items/feed>|200|04/01/2026|valid|-|
86|Minkabu (Stocks/Investing)|<https://minkabu.jp/news/feed>|needs check|04/01/2026|needs verification|-|
87|Tokyo Shimbun General News|<https://www.tokyo-np.co.jp/rss/news>|needs check|04/01/2026|needs verification|-|
88|ASCII.jp Mac Tech|<https://ascii.jp/mac/rss.xml>|200|04/01/2026|valid|-|
89|Business Insider Japan|<https://www.businessinsider.jp/feed/index.xml>|200|04/01/2026|valid|-|
90|Hatena Bookmark Economy|<https://b.hatena.ne.jp/hotentry/economics.rss>|needs check|04/01/2026|needs verification|-|
91|Hatena Bookmark IT|<https://b.hatena.ne.jp/hotentry/it.rss>|needs check|04/01/2026|needs verification|-|
92|Hatena Bookmark Social|<https://b.hatena.ne.jp/hotentry/social.rss>|needs check|04/01/2026|needs verification|-|
93|AFP BB News|<https://feeds.afpbb.com/afpbb/news/all>|needs check|04/01/2026|needs verification|-|

### Germany (DE)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Handelsblatt - Top|<https://www.handelsblatt.com/contentexport/feed/top-themen>|200|04/01/2026|valid|-|
2|Handelsblatt - Finance|<https://www.handelsblatt.com/contentexport/feed/finanzen>|200|04/01/2026|valid|-|
3|Tagesschau|<https://www.tagesschau.de/xml/rss2>|200|04/01/2026|valid|-|
4|Der Spiegel|<https://www.spiegel.de/schlagzeilen/tops/index.rss>|200|04/01/2026|valid|-|
5|FAZ|<https://www.faz.net/rss/aktuell/>|200|04/01/2026|valid|-|
6|Die Zeit|<https://newsfeed.zeit.de/index>|200|04/01/2026|valid|-|
7|Manager Magazin|<https://www.manager-magazin.de/unternehmen/index.rss>|200|04/01/2026|valid|-|
8|WirtschaftsWoche|<https://www.wiwo.de/contentexport/feed/rss/schlagzeilen>|200|04/01/2026|valid|-|
9|Deutsche Welle (EN)|<https://rss.dw.com/xml/rss-en-all>|200|04/01/2026|valid|-|
10|Heise Online|<https://www.heise.de/rss/heise-atom.xml>|200|04/01/2026|valid|-|
11|Der Spiegel|<https://www.spiegel.de/schlagzeilen/index.rss>|200|04/01/2026|valid|-|
12|Die Welt|<https://www.welt.de/feeds/topnews.rss>|200|04/01/2026|valid|-|
13|WELT - Latest|<https://www.welt.de/feeds/latest.rss>|200|04/01/2026|valid|-|
14|WELT - Politik|<https://www.welt.de/feeds/section/politik.rss>|200|04/01/2026|valid|-|
15|WELT - Wirtschaft|<https://www.welt.de/feeds/section/wirtschaft.rss>|200|04/01/2026|valid|-|
16|WELT - Sport|<https://www.welt.de/feeds/section/sport.rss>|200|04/01/2026|valid|-|
17|WELT - Regionales|<https://www.welt.de/feeds/section/regionales.rss>|200|04/01/2026|valid|-|
18|WELT - Wissenschaft|<https://www.welt.de/feeds/section/wissenschaft.rss>|200|04/01/2026|valid|-|
19|WELT - Vermischtes|<https://www.welt.de/feeds/section/vermischtes.rss>|200|04/01/2026|valid|-|
20|WELT - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
21|BILD - Alles|<https://www.bild.de/feed/alles.xml>|200|04/01/2026|valid|-|
22|BILD - News|<https://www.bild.de/feed/news.xml>|200|04/01/2026|valid|-|
23|BILD - Politik|<https://www.bild.de/feed/politik.xml>|200|04/01/2026|valid|-|
24|BILD - Digital|<https://www.bild.de/feed/digital.xml>|200|04/01/2026|valid|-|
25|BILD - Sport|<https://www.bild.de/feed/sport.xml>|200|04/01/2026|valid|-|
26|BILD - Unterhaltung|<https://www.bild.de/feed/unterhaltung.xml>|200|04/01/2026|valid|-|
27|BILD - Regional Chemnitz|<https://www.bild.de/feed/regional-chemnitz.xml>|200|04/01/2026|valid|-|
28|BILD - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
29|Focus|<https://www.focus.de/rss/>|200|04/01/2026|valid|-|
30|Handelsblatt Economy|<https://www.handelsblatt.com/contentexport/feed/finanzen/>|200|04/01/2026|valid|-|
31|Frankfurter Allgemeine|<https://www.faz.net/rss/aktuell/wirtschaft/>|200|04/01/2026|valid|-|
32|Frankfurter Allgemeine - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
33|RTL.de - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
34|TAG24 - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
35|Frankfurter Rundschau - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
36|Berliner Morgenpost - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
37|tz.de - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
38|Berliner Zeitung - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
39|kicker - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
40|Tagesspiegel|<https://www.tagesspiegel.de/contentexport/feed/>|200|04/01/2026|valid|-|
41|Handelsblatt World|<https://www.handelsblatt.com/contentexport/feed/wirtschaft>|200|04/01/2026|valid|-|
42|Zeit Welt|<https://newsfeed.zeit.de/wirtschaft/index>|200|04/01/2026|valid|-|
43|Financial Times Germany|<https://www.ft.com/rss/home>|200|04/01/2026|valid|-|
44|Suddeutsche - Top-Themen|<https://rss.sueddeutsche.de/rss/Topthemen>|200|04/01/2026|valid|-|
45|Suddeutsche - Alles|<https://rss.sueddeutsche.de/rss/Alles>|200|04/01/2026|valid|-|
46|Suddeutsche - Eilmeldungen|<https://rss.sueddeutsche.de/rss/Eilmeldungen>|200|04/01/2026|valid|-|
47|Suddeutsche - Politik|<https://rss.sueddeutsche.de/rss/Politik>|200|04/01/2026|valid|-|
48|Suddeutsche - Wirtschaft|<https://rss.sueddeutsche.de/rss/Wirtschaft>|200|04/01/2026|valid|-|
49|Suddeutsche - Panorama|<https://rss.sueddeutsche.de/rss/Panorama>|200|04/01/2026|valid|-|
50|Suddeutsche - Sport|<https://rss.sueddeutsche.de/rss/Sport>|200|04/01/2026|valid|-|
51|Suddeutsche - Munchen|<https://rss.sueddeutsche.de/rss/Muenchen>|200|04/01/2026|valid|-|
52|Suddeutsche - Bayern|<https://rss.sueddeutsche.de/rss/Bayern>|200|04/01/2026|valid|-|
53|Suddeutsche - Kultur|<https://rss.sueddeutsche.de/rss/Kultur>|200|04/01/2026|valid|-|
54|Suddeutsche - Medien|<https://rss.sueddeutsche.de/rss/Medien>|200|04/01/2026|valid|-|
55|Suddeutsche - Wissen|<https://rss.sueddeutsche.de/rss/Wissen>|200|04/01/2026|valid|-|
56|Suddeutsche - Gesundheit|<https://rss.sueddeutsche.de/rss/Gesundheit>|200|04/01/2026|valid|-|
57|Suddeutsche - Karriere|<https://rss.sueddeutsche.de/rss/Karriere>|200|04/01/2026|valid|-|
58|Suddeutsche - Bildung|<https://rss.sueddeutsche.de/rss/Bildung>|200|04/01/2026|valid|-|
59|Suddeutsche - Reise|<https://rss.sueddeutsche.de/rss/Reise>|200|04/01/2026|valid|-|
60|Suddeutsche - Auto|<https://rss.sueddeutsche.de/rss/Auto>|200|04/01/2026|valid|-|
61|Suddeutsche - Stil|<https://rss.sueddeutsche.de/rss/Stil>|200|04/01/2026|valid|-|
62|Deutschlandfunk - Nachrichten|<https://www.deutschlandfunk.de/nachrichten-100.rss>|200|04/01/2026|valid|-|
63|Deutschlandfunk - Politikportal|<https://www.deutschlandfunk.de/politikportal-100.rss>|200|04/01/2026|valid|-|
64|Deutschlandfunk - Wirtschaft|<https://www.deutschlandfunk.de/wirtschaft-106.rss>|200|04/01/2026|valid|-|
65|Deutschlandfunk - Wissen|<https://www.deutschlandfunk.de/wissen-106.rss>|200|04/01/2026|valid|-|
66|Deutschlandfunk - Kulturportal|<https://www.deutschlandfunk.de/kulturportal-100.rss>|200|04/01/2026|valid|-|
67|Deutschlandfunk - Europa|<https://www.deutschlandfunk.de/europa-112.rss>|200|04/01/2026|valid|-|
68|Deutschlandfunk - Gesellschaft|<https://www.deutschlandfunk.de/gesellschaft-106.rss>|200|04/01/2026|valid|-|
69|Deutschlandfunk - Sportportal|<https://www.deutschlandfunk.de/sportportal-100.rss>|200|04/01/2026|valid|-|
70|taz.de (gesamt)|<https://taz.de/!a=;rss/>|needs check|04/01/2026|needs verification|-|
71|Tagesschau|<https://www.tagesschau.de/xml/rss2/>|200|04/01/2026|valid|-|
72|Der Spiegel - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
73|Die Zeit - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
74|n-tv - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
75|Handelsblatt - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
76|Handelsblatt - Premium News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
77|Handelsblatt - Agentur News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
78|Tagesspiegel - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
79|Merkur - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
80|Augsburger Allgemeine - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|

### India (IN)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|The Times of India (Top Stories)|<https://timesofindia.indiatimes.com/rssfeedstopstories.cms>|200|04/01/2026|valid|-|
2|NDTV (Latest)|<https://feeds.feedburner.com/NDTV-LatestNews>|200|04/01/2026|valid|-|
3|India Today (India)|<https://www.indiatoday.in/rss/1206578>|200|04/01/2026|valid|-|
4|The Indian Express|<https://indianexpress.com/feed>|200|04/01/2026|valid|-|
5|The Hindu (National)|<https://www.thehindu.com/news/national/?service=rss>|200|04/01/2026|valid|-|
6|Firstpost|<https://www.firstpost.com/commonfeeds/v1/mfp/rss/web-stories.xml>|403 (HTTP_403)|04/01/2026|invalid|-|
7|DNA India (India)|<https://www.dnaindia.com/feeds/india.xml>|403 (HTTP_403)|04/01/2026|invalid|-|
8|Storify News|<https://www.storifynews.com/feed>|200|04/01/2026|valid|-|
9|Amar Ujala (Breaking)|<https://www.amarujala.com/rss/breaking-news.xml>|200|04/01/2026|valid|-|
10|Odishabarta|<https://odishabarta.com/feed>|200|04/01/2026|valid|-|
11|The Times of Bengal|<https://thetimesofbengal.com/feed>|500 (HTTP_500)|04/01/2026|invalid|-|
12|Scroll.in|<https://feeds.feedburner.com/ScrollinArticles.rss>|200|04/01/2026|valid|-|
13|Northlines|<https://thenorthlines.com/feed>|needs check|04/01/2026|needs verification|-|
14|Chandigarh Metro|<https://chandigarhmetro.com/feed>|200|04/01/2026|valid|-|
15|Chandigarh City News|<https://feeds.feedburner.com/ChandigarhCityNews>|200|04/01/2026|valid|-|
16|The Quint|<https://prod-qt-images.s3.amazonaws.com/production/thequint/feed.xml>|200|04/01/2026|valid|-|
17|Telangana Today|<https://telanganatoday.com/feed>|200|04/01/2026|valid|-|
18|News Today (TN)|<https://newstodaynet.com/feed>|200|04/01/2026|valid|-|
19|IndiaVision|<https://www.indiavision.com/feed>|200|04/01/2026|valid|-|
20|OpIndia|<https://www.opindia.com/feed>|200|04/01/2026|valid|-|
21|OrissaPOST|<https://www.orissapost.com/feed>|200|04/01/2026|valid|-|
22|India's News.Net|<https://feeds.indiasnews.net/rss/701ee96610c884a6>|200|04/01/2026|valid|-|
23|TechGenYZ|<https://techgenyz.com/feed>|200|04/01/2026|valid|-|
24|WYM News (Blogspot)|<https://latestnewsupdate4you.blogspot.com/feeds/posts/default>|200|04/01/2026|valid|-|
25|Star of Mysore|<https://starofmysore.com/feed>|200|04/01/2026|valid|-|
26|ABP News|<https://news.abplive.com/home/feed>|200|04/01/2026|valid|-|
27|The India Bizz|<https://theindiabizz.com/feed>|200|04/01/2026|valid|-|
28|Hindustan Times - India News RSS|<https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml>|200|04/01/2026|valid|-|
29|Hindustan Times - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
30|ThePrint - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
31|Deccan Herald - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
32|Livemint - Today Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
33|Livemint - RSS News|<https://www.livemint.com/rss/news>|200|04/01/2026|valid|-|
34|NDTV - Top Stories|<https://feeds.feedburner.com/ndtvnews-top-stories>|200|04/01/2026|valid|-|
35|Inc42|<https://inc42.com/feed/>|200|04/01/2026|valid|-|

### United Kingdom (GB)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Financial Times - World|<https://www.ft.com/rss/world>|Recovered via sitemap|04/01/2026|valid|-|
2|Financial Times - Energy|<https://www.ft.com/rss/companies/energy>|Recovered via sitemap|04/01/2026|valid|-|
3|BBC News - Business|<https://feeds.bbci.co.uk/news/business/rss.xml>|200|04/01/2026|valid|-|
4|BBC News - World|<https://feeds.bbci.co.uk/news/world/rss.xml>|200|04/01/2026|valid|-|
5|The Guardian - World|<https://www.theguardian.com/world/rss>|200|04/01/2026|valid|-|
6|The Guardian - Business|<https://www.theguardian.com/business/rss>|200|04/01/2026|valid|-|
7|Sky News - World|<https://feeds.skynews.com/feeds/rss/world.xml>|200|04/01/2026|valid|-|
8|Sky News - Business|<https://feeds.skynews.com/feeds/rss/business.xml>|200|04/01/2026|valid|-|
9|Telegraph - Business|<https://www.telegraph.co.uk/business/rss.xml>|Recovered via sitemap|04/01/2026|valid|-|
10|City A.M. (London Finance)|<https://www.cityam.com/feed/>|200|04/01/2026|valid|-|
11|The Independent|<https://www.independent.co.uk/rss>|200|04/01/2026|valid|-|
12|Financial Times UK|<https://www.ft.com/?format=rss>|200|04/01/2026|valid|-|
13|The Telegraph UK|<https://www.telegraph.co.uk/rss.xml>|Recovered via sitemap|04/01/2026|valid|-|
14|Daily Mail|<https://www.dailymail.co.uk/home/index.rss>|200|04/01/2026|valid|-|
15|Metro UK|<https://metro.co.uk/feed/>|200|04/01/2026|valid|-|
16|The Sun|<https://www.thesun.co.uk/feed/>|200 (HTML_RETURNED)|04/01/2026|invalid|-|
17|The Sun - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
18|The Guardian UK|<https://www.theguardian.com/uk/rss>|200|04/01/2026|valid|-|
19|Sky News|<https://feeds.skynews.com/feeds/rss/uk.xml>|200|04/01/2026|valid|-|
20|Financial Times|<https://www.ft.com/rss/home>|200|04/01/2026|valid|-|
21|iNews|<https://inews.co.uk/rss>|200|04/01/2026|valid|-|
22|BBC Culture|<https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml>|200|04/01/2026|valid|-|
23|BBC News - UK|<https://feeds.bbci.co.uk/news/uk/rss.xml>|200|04/01/2026|valid|-|
24|BBC News - Politics|<https://feeds.bbci.co.uk/news/politics/rss.xml>|200|04/01/2026|valid|-|
25|BBC News - Technology|<https://feeds.bbci.co.uk/news/technology/rss.xml>|200|04/01/2026|valid|-|
26|The Guardian - Politics|<https://www.theguardian.com/politics/rss>|200|04/01/2026|valid|-|
27|The Guardian - Technology|<https://www.theguardian.com/uk/technology/rss>|200|04/01/2026|valid|-|
28|The Evening Standard|<https://www.standard.co.uk/rss>|200|04/01/2026|valid|-|
29|BBC News - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
30|Mirror - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
31|Daily Express - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
32|Daily Star - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
33|Daily Record - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
34|Manchester Evening News - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
35|Liverpool Echo - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
36|Birmingham Live - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
37|WalesOnline - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
38|MyLondon - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
39|ExaminerLive - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
40|ChronicleLive - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
41|BBC Africa|<https://feeds.bbci.co.uk/news/world/africa/rss.xml>|200|04/01/2026|valid|-|
42|BBC Asia|<https://feeds.bbci.co.uk/news/world/asia/rss.xml>|200|04/01/2026|valid|-|
43|BBC Latin America|<https://feeds.bbci.co.uk/news/world/latin_america/rss.xml>|200|04/01/2026|valid|-|
44|BBC Middle East|<https://feeds.bbci.co.uk/news/world/middle_east/rss.xml>|200|04/01/2026|valid|-|
45|BBC Persian|<https://feeds.bbci.co.uk/persian/rss.xml>|200|04/01/2026|valid|-|
46|The Guardian - Americas|<https://www.theguardian.com/world/americas/rss>|200|04/01/2026|valid|-|
47|The Guardian - Middle East|<https://www.theguardian.com/world/middleeast/rss>|200|04/01/2026|valid|-|
48|FlightGlobal|<https://www.flightglobal.com/rss>|200|04/01/2026|valid|-|
49|Simple Flying|<https://simpleflying.com/feed/>|200|04/01/2026|valid|-|
50|Nature News|<https://feeds.nature.com/nature/rss/current>|200|04/01/2026|valid|-|

### France (FR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|France 24|<https://www.france24.com/en/rss>|200|04/01/2026|valid|-|
2|The Local (France)|<https://feeds.thelocal.com/rss/fr>|200|04/01/2026|valid|-|
3|RFI (France)|<https://www.rfi.fr/en/france/rss>|needs check|04/01/2026|needs verification|-|
4|RFI (All / EN)|<https://www.rfi.fr/en/rss>|200|04/01/2026|valid|-|
5|Mediapart|<https://www.mediapart.fr/articles/feed>|200|04/01/2026|valid|-|
6|Le Monde diplomatique|<https://mondediplo.com/backend>|needs check|04/01/2026|needs verification|-|
7|Sud Ouest|<https://www.sudouest.fr/essentiel/rss.xml>|200|04/01/2026|valid|-|
8|L'Est Republicain|<https://www.estrepublicain.fr/rss>|200|04/01/2026|valid|-|
9|France Soir|<https://www.francesoir.fr/rss.xml>|needs check|04/01/2026|needs verification|-|
10|Dernieres Nouvelles d'Alsace (DNA)|<https://www.dna.fr/rss>|200|04/01/2026|valid|-|
11|La Croix|<https://www.la-croix.com/feeds/rss/site.xml>|200|04/01/2026|valid|-|
12|La Depeche|<https://www.ladepeche.fr/rss.xml>|200|04/01/2026|valid|-|
13|20 Minutes|<https://www.20minutes.fr/feeds/rss-une.xml>|200|04/01/2026|valid|-|
14|Yahoo Actualites|<https://fr.news.yahoo.com/rss>|200|04/01/2026|valid|-|
15|InfoMigrants (EN)|<https://www.infomigrants.net/en/rss/all.xml>|needs check|04/01/2026|needs verification|-|
16|France Today|<https://www.francetoday.com/feed>|200|04/01/2026|valid|-|
17|FrenchDailyNews|<https://frenchdailynews.com/feed>|200|04/01/2026|valid|-|
18|Le Monde (EN  Main)|<https://www.lemonde.fr/en/rss/une.xml>|200|04/01/2026|valid|-|
19|Le Monde (EN  International)|<https://www.lemonde.fr/en/international/rss_full.xml>|200|04/01/2026|valid|-|
20|Le Monde (EN  Editorials)|<https://www.lemonde.fr/en/editorials/rss_full.xml>|200|04/01/2026|valid|-|
21|Le Monde (EN  Europe)|<https://www.lemonde.fr/en/europe/rss_full.xml>|200|04/01/2026|valid|-|
22|Le Monde (EN  United States)|<https://www.lemonde.fr/en/united-states/rss_full.xml>|200|04/01/2026|valid|-|
23|Le Monde (EN  Economy)|<https://www.lemonde.fr/en/economy/rss_full.xml>|200|04/01/2026|valid|-|
24|Le Monde (EN  Culture)|<https://www.lemonde.fr/en/culture/rss_full.xml>|200|04/01/2026|valid|-|
25|Le Monde (EN  Sports)|<https://www.lemonde.fr/en/sports/rss_full.xml>|200|04/01/2026|valid|-|
26|Le Monde (EN  Environment)|<https://www.lemonde.fr/en/environment/rss_full.xml>|200|04/01/2026|valid|-|
27|Le Monde (EN  Science)|<https://www.lemonde.fr/en/science/rss_full.xml>|needs check|04/01/2026|needs verification|-|
28|Les Echos (Finance/Markets)|<https://services.lesechos.fr/api/rss/univers/finance-marches>|needs check|04/01/2026|needs verification|-|
29|Les Echos (Tech/Media)|<https://services.lesechos.fr/api/rss/univers/tech-medias>|needs check|04/01/2026|needs verification|-|
30|Le Monde (Economy)|<https://www.lemonde.fr/economie/rss_full.xml>|200|04/01/2026|valid|-|
31|Le Monde (Politics)|<https://www.lemonde.fr/politique/rss_full.xml>|200|04/01/2026|valid|-|
32|Le Figaro (Top Stories)|<https://www.lefigaro.fr/rss/figaro_actualites.xml>|200|04/01/2026|valid|-|
33|Le Figaro (Economy)|<https://www.lefigaro.fr/rss/figaro_economie.xml>|200|04/01/2026|valid|-|
34|Le Figaro - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
35|Le Figaro (Flash Actu)|<https://www.lefigaro.fr/rss/figaro_flash-actu.xml>|200|04/01/2026|valid|-|
36|Le Figaro (France)|<https://www.lefigaro.fr/rss/figaro_actualite-france.xml>|200|04/01/2026|valid|-|
37|Le Figaro (International)|<https://www.lefigaro.fr/rss/figaro_international.xml>|200|04/01/2026|valid|-|
38|Le Figaro (Politics)|<https://www.lefigaro.fr/rss/figaro_politique.xml>|200|04/01/2026|valid|-|
39|Le Figaro (Flash Eco)|<https://www.lefigaro.fr/rss/figaro_flash-eco.xml>|200|04/01/2026|valid|-|
40|Le Figaro (Society)|<https://www.lefigaro.fr/rss/figaro_societes.xml>|200|04/01/2026|valid|-|
41|Le Figaro (Sport)|<https://www.lefigaro.fr/rss/figaro_sport.xml>|200|04/01/2026|valid|-|
42|Le Figaro (Science)|<https://www.lefigaro.fr/rss/figaro_sciences.xml>|200|04/01/2026|valid|-|
43|La Tribune (Economy)|<https://www.latribune.fr/feed.xml>|needs check|04/01/2026|needs verification|-|
44|Liberation (Society/Politics)|<https://www.liberation.fr/rss/>|needs check|04/01/2026|needs verification|-|
45|L'Express (Current Affairs Magazine)|<https://www.lexpress.fr/rss/alaune.xml>|200|04/01/2026|valid|-|
46|Le Point (Current Affairs/Economy)|<https://www.lepoint.fr/rss.xml>|needs check|04/01/2026|needs verification|-|
47|France Info (Economy)|<https://www.francetvinfo.fr/economie.rss>|200|04/01/2026|valid|-|
48|France Info (Politics)|<https://www.francetvinfo.fr/politique.rss>|200|04/01/2026|valid|-|
49|BFM TV (Economy/Business)|<https://www.bfmtv.com/rss/economie/>|200|04/01/2026|valid|-|
50|Capital.fr (Economy/Capital)|<https://www.capital.fr/rss.xml>|needs check|04/01/2026|needs verification|-|
51|Challenges.fr (Business)|<https://www.challenges.fr/rss.xml>|200|04/01/2026|valid|-|
52|Ouest-France (Regional News/Society)|<https://www.ouest-france.fr/rss-en-continu.xml>|200|04/01/2026|valid|-|
53|20 Minutes (Economy Breaking)|<https://www.20minutes.fr/feeds/rss-economie.xml>|200|04/01/2026|valid|-|
54|L'Obs (General Current Affairs)|<https://www.nouvelobs.com/rss.xml>|200|04/01/2026|valid|-|
55|Usine Nouvelle (Industry/Energy/Manufacturing)|<https://www.usinenouvelle.com/rss/>|needs check|04/01/2026|needs verification|-|
56|Midi Libre|<https://www.midilibre.fr/rss.xml>|200|04/01/2026|valid|-|
57|Nice-Matin|<https://www.nicematin.com/rss>|200|04/01/2026|valid|-|
58|CNEWS|<https://www.cnews.fr/rss.xml>|200|04/01/2026|valid|-|
59|RFI (FR)|<https://www.rfi.fr/fr/rss>|200|04/01/2026|valid|-|
60|France 24 (FR)|<https://www.france24.com/fr/rss>|200|04/01/2026|valid|-|
61|Euronews FR|<https://fr.euronews.com/rss>|200|04/01/2026|valid|-|
62|Numerama|<https://www.numerama.com/feed/>|200|04/01/2026|valid|-|
63|Clubic|<https://www.clubic.com/feed/news.rss>|200|04/01/2026|valid|-|
64|01Net|<https://www.01net.com/rss/actualites/>|200|04/01/2026|valid|-|
65|Presse Citron|<https://www.presse-citron.net/feed/>|200|04/01/2026|valid|-|
66|Journal du Geek|<https://www.journaldugeek.com/feed/>|200|04/01/2026|valid|-|
67|Le Progres|<https://www.leprogres.fr/rss>|200|04/01/2026|valid|-|
68|BFM TV|<https://www.bfmtv.com/rss/news-24-7/>|200|04/01/2026|valid|-|
69|France Info|<https://www.francetvinfo.fr/titres.rss>|200|04/01/2026|valid|-|
70|Le Telegramme|<https://www.letelegramme.fr/rss.xml>|200|04/01/2026|valid|-|
71|Siecle Digital|<https://siecledigital.fr/feed/>|200|04/01/2026|valid|-|
72|Le Monde|<https://www.lemonde.fr/rss/une.xml>|200|04/01/2026|valid|-|
73|Le JDD|<https://www.lejdd.fr/rss.xml>|200|04/01/2026|valid|-|
74|Le Dauphine Libere|<https://www.ledauphine.com/rss>|200|04/01/2026|valid|-|
75|Mediacites|<https://www.mediacites.fr/feed/>|200|04/01/2026|valid|-|
76|StreetPress|<https://www.streetpress.com/rss.xml>|200|04/01/2026|valid|-|
77|Disclose|<https://disclose.ngo/feed/>|200|04/01/2026|valid|-|
78|Le Monde - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
79|Liberation - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
80|Le Point - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
81|BFM TV - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
82|France Info - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
83|Le Parisien - News Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
84|TF1 Info - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
85|20 Minutes - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
86|CNEWS - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
87|Le Telegramme - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
88|Actu.fr - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
89|L'Equipe - Dynamic News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
90|Africanews|<https://www.africanews.com/feed/>|200|04/01/2026|valid|-|
91|Jeune Afrique|<https://www.jeuneafrique.com/feed/>|200|04/01/2026|valid|-|

### Italy (IT)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|ANSA (Main)|<https://www.ansa.it/sito/ansait_rss.xml>|200|04/01/2026|valid|-|
2|ANSA (Top News)|<https://www.ansa.it/sito/notizie/topnews/topnews_rss.xml>|200|04/01/2026|valid|-|
3|ANSA (Cronaca)|<https://www.ansa.it/sito/notizie/cronaca/cronaca_rss.xml>|200|04/01/2026|valid|-|
4|ANSA (Politica)|<https://www.ansa.it/sito/notizie/politica/politica_rss.xml>|200|04/01/2026|valid|-|
5|ANSA (Mondo)|<https://www.ansa.it/sito/notizie/mondo/mondo_rss.xml>|200|04/01/2026|valid|-|
6|ANSA (Economia)|<https://www.ansa.it/sito/notizie/economia/economia_rss.xml>|200|04/01/2026|valid|-|
7|ANSA (Calcio)|<https://www.ansa.it/sito/notizie/sport/calcio/calcio_rss.xml>|200|04/01/2026|valid|-|
8|ANSA (Sport)|<https://www.ansa.it/sito/notizie/sport/sport_rss.xml>|200|04/01/2026|valid|-|
9|ANSA (Cinema)|<https://www.ansa.it/sito/notizie/cultura/cinema/cinema_rss.xml>|200|04/01/2026|valid|-|
10|ANSA (Cultura e Tendenze)|<https://www.ansa.it/sito/notizie/cultura/cultura_rss.xml>|200|04/01/2026|valid|-|
11|ANSA (Foto)|<https://www.ansa.it/sito/photogallery/foto_rss.xml>|200|04/01/2026|valid|-|
12|ANSA (Video)|<https://www.ansa.it/sito/videogallery/video_rss.xml>|200|04/01/2026|valid|-|
13|Corriere della Sera (Homepage)|<https://www.corriere.it/rss/homepage.xml>|200|04/01/2026|valid|-|
14|Corriere della Sera (Ultimora)|<https://www.corriere.it/rss/ultimora.xml>|needs check|04/01/2026|needs verification|-|
15|Corriere della Sera (feed-hp Homepage)|<https://www.corriere.it/feed-hp/homepage.xml>|200|04/01/2026|valid|-|
16|la Repubblica|<https://www.repubblica.it/rss/homepage/rss2.0.xml>|200|04/01/2026|valid|-|
17|La Stampa|<https://www.lastampa.it/rss/copertina.xml>|200|04/01/2026|valid|-|
18|Il Sole 24 Ore (Italia)|<https://www.ilsole24ore.com/rss/italia.xml>|200|04/01/2026|valid|-|
19|Il Fatto Quotidiano|<https://www.ilfattoquotidiano.it/feed/>|200|04/01/2026|valid|-|
20|La Gazzetta dello Sport|<https://www.gazzetta.it/rss/home.xml>|200|04/01/2026|valid|-|
21|IL Tempo|<https://www.iltempo.it/rss.xml>|200|04/01/2026|valid|-|
22|Libero Quotidiano|<https://www.liberoquotidiano.it/rss.xml>|200|04/01/2026|valid|-|
23|MilanoToday|<https://www.milanotoday.it/rss>|200|04/01/2026|valid|-|
24|The Florentine|<https://www.theflorentine.net/feed>|needs check|04/01/2026|needs verification|-|
25|Wanted in Rome|<https://www.wantedinrome.com/news?format=rss>|200|04/01/2026|valid|-|
26|Florence Daily News|<https://florencedailynews.com/feed>|200|04/01/2026|valid|-|
27|Alto Adige (Cronaca)|<https://www.altoadige.it/feed-rss/cronaca-1.169>|200|04/01/2026|valid|-|
28|Italia a Tavola|<https://rss.italiaatavola.net/feed.xml>|200|04/01/2026|valid|-|
29|la Citta di Salerno|<https://www.lacittadisalerno.it/feed>|200|04/01/2026|valid|-|
30|Notizie Geopolitiche|<https://www.notiziegeopolitiche.net/feed>|200|04/01/2026|valid|-|
31|Il Messaggero - Home RSS|<https://www.ilmessaggero.it/rss/home.xml>|200|04/01/2026|valid|-|
32|Il Giornale|<https://www.ilgiornale.it/feed.xml>|200|04/01/2026|valid|-|
33|Leggo - Home RSS|<https://www.leggo.it/rss/home.xml>|200|04/01/2026|valid|-|
34|Today.it|<https://www.today.it/rss>|200|04/01/2026|valid|-|
35|Il Giorno|<https://www.ilgiorno.it/rss>|200|04/01/2026|valid|-|
36|Il Resto del Carlino|<https://www.ilrestodelcarlino.it/rss>|200|04/01/2026|valid|-|
37|la Repubblica - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
38|La Stampa - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
39|Il Messaggero - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
40|Il Sole 24 Ore - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
41|ANSA - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
42|Corriere della Sera - Interni Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
43|Corriere della Sera - Esteri Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
44|Corriere della Sera - Politica Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
45|Corriere della Sera - Economia Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
46|RaiNews - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
47|TgCom24 - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
48|Adnkronos - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
49|AGI - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
50|Open.online - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
51|Quotidiano.net - Day Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|

### Canada (CA)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Global News|<https://globalnews.ca/feed>|200|04/01/2026|valid|-|
2|rabble.ca|<https://rabble.ca/feed>|200|04/01/2026|valid|-|
3|National Post|<https://nationalpost.com/feed/atom>|200|04/01/2026|valid|-|
4|Toronto Sun|<https://torontosun.com/feed/atom>|200|04/01/2026|valid|-|
5|Financial Post|<https://feeds.feedburner.com/FP_TopStories>|200|04/01/2026|valid|-|
6|CityNews Toronto|<https://toronto.citynews.ca/feed>|200|04/01/2026|valid|-|
7|Calgary Herald|<https://calgaryherald.com/feed/atom>|200|04/01/2026|valid|-|
8|Edmonton Journal|<https://edmontonjournal.com/feed/atom>|200|04/01/2026|valid|-|
9|Windsor Star|<https://windsorstar.com/feed/atom>|200|04/01/2026|valid|-|
10|The Province|<https://theprovince.com/feed/atom>|200|04/01/2026|valid|-|
11|Calgary Sun|<https://calgarysun.com/feed/atom>|200|04/01/2026|valid|-|
12|Ottawa Sun|<https://ottawasun.com/feed/atom>|200|04/01/2026|valid|-|
13|The Tyee|<https://thetyee.ca/rss2.xml>|200|04/01/2026|valid|-|
14|The StarPhoenix|<https://thestarphoenix.com/feed/atom>|200|04/01/2026|valid|-|
15|Edmonton Sun|<https://edmontonsun.com/feed>|200|04/01/2026|valid|-|
16|Canada.com|<https://o.canada.com/feed>|200|04/01/2026|valid|-|
17|Business In Vancouver (BIV)|<https://biv.com/rss>|200|04/01/2026|valid|-|
18|Regina Leader Post|<https://leaderpost.com/feed/atom>|200|04/01/2026|valid|-|
19|Owen Sound Sun Times|<https://owensoundsuntimes.com/feed>|200|04/01/2026|valid|-|
20|Stratford Beacon Herald|<https://stratfordbeaconherald.com/feed>|200|04/01/2026|valid|-|
21|The Georgia Straight|<https://straight.com/content/rss>|200|04/01/2026|valid|-|
22|Grande Prairie Daily Herald Tribune|<https://dailyheraldtribune.com/feed>|200|04/01/2026|valid|-|
23|YGK News (Kingston)|<https://ygknews.ca/feed>|200|04/01/2026|valid|-|
24|Prince Albert Daily Herald|<https://paherald.sk.ca/feed>|200|04/01/2026|valid|-|
25|Sunny South News|<https://sunnysouthnews.com/feed>|200|04/01/2026|valid|-|
26|The Afro News|<https://theafronews.com/feed>|200|04/01/2026|valid|-|
27|CTV News - Top Stories|<https://www.ctvnews.ca/rss/ctvnews-ca-top-stories-public-rss-1.822009>|needs check|04/01/2026|needs verification|-|
28|CTV News - Business|<https://www.ctvnews.ca/rss/business/ctvnews-ca-business-public-rss-1.822283>|Recovered via sitemap|04/01/2026|valid|-|
29|Global News - Politics|<https://globalnews.ca/politics/feed/>|200|04/01/2026|valid|-|
30|Global News - Canada|<https://globalnews.ca/canada/feed/>|200|04/01/2026|valid|-|
31|Global News - Money|<https://globalnews.ca/money/feed/>|200|04/01/2026|valid|-|
32|Global News - Consumer|<https://globalnews.ca/consumer/feed/>|200|04/01/2026|valid|-|
33|Global News - Calgary|<https://globalnews.ca/calgary/feed/>|200|04/01/2026|valid|-|
34|Global News - Edmonton|<https://globalnews.ca/edmonton/feed/>|200|04/01/2026|valid|-|
35|Global News - Halifax|<https://globalnews.ca/halifax/feed/>|200|04/01/2026|valid|-|
36|Global News - Montreal|<https://globalnews.ca/montreal/feed/>|200|04/01/2026|valid|-|
37|Global News - National|<https://globalnews.ca/national/feed/>|200|04/01/2026|valid|-|
38|Global News - Toronto|<https://globalnews.ca/toronto/feed/>|200|04/01/2026|valid|-|
39|Global News - Winnipeg|<https://globalnews.ca/winnipeg/feed/>|200|04/01/2026|valid|-|
40|Global News - Ottawa|<https://globalnews.ca/ottawa/feed/>|200|04/01/2026|valid|-|
41|Global News - Kitchener|<https://globalnews.ca/kitchener/feed/>|200|04/01/2026|valid|-|
42|Global News - BC|<https://globalnews.ca/bc/feed/>|200|04/01/2026|valid|-|
43|Global News - Hamilton|<https://globalnews.ca/hamilton/feed/>|200|04/01/2026|valid|-|
44|Global News - Barrie|<https://globalnews.ca/barrie/feed/>|200|04/01/2026|valid|-|
45|Global News - London|<https://globalnews.ca/london/feed/>|200|04/01/2026|valid|-|
46|Global News - Kingston|<https://globalnews.ca/kingston/feed/>|200|04/01/2026|valid|-|
47|Global News - Durham|<https://globalnews.ca/durham/feed/>|200|04/01/2026|valid|-|
48|Global News - Guelph|<https://globalnews.ca/guelph/feed/>|200|04/01/2026|valid|-|
49|Global News - Okanagan|<https://globalnews.ca/okanagan/feed/>|200|04/01/2026|valid|-|
50|Global News - New Brunswick|<https://globalnews.ca/new-brunswick/feed/>|200|04/01/2026|valid|-|
51|Global News - Regina|<https://globalnews.ca/regina/feed/>|200|04/01/2026|valid|-|
52|Global News - Saskatoon|<https://globalnews.ca/saskatoon/feed/>|200|04/01/2026|valid|-|
53|Global News - Lethbridge|<https://globalnews.ca/lethbridge/feed/>|200|04/01/2026|valid|-|
54|Global News - Peterborough|<https://globalnews.ca/peterborough/feed/>|200|04/01/2026|valid|-|
55|Toronto Star - Politics|<https://www.thestar.com/search/?f=rss&t=article&c=politics&l=50&s=start_time&sd=desc>|200|04/01/2026|valid|-|
56|BNN Bloomberg (Canada Biz)|<https://www.bnnbloomberg.ca/business/rss>|Recovered via sitemap|04/01/2026|valid|-|
57|CBC News - Business|<https://www.cbc.ca/cmlink/rss-business>|200|04/01/2026|valid|-|
58|CBC News - World|<https://www.cbc.ca/cmlink/rss-world>|200|04/01/2026|valid|-|
59|Financial Post (Economy)|<https://financialpost.com/feed>|200|04/01/2026|valid|-|
60|CBC News - Top Stories|<https://www.cbc.ca/cmlink/rss-topstories>|200|04/01/2026|valid|-|
61|CBC News - Canada|<https://www.cbc.ca/cmlink/rss-canada>|200|04/01/2026|valid|-|
62|CBC News - Politics|<https://www.cbc.ca/cmlink/rss-politics>|200|04/01/2026|valid|-|
63|The Globe and Mail - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
64|CTV News - Sitemap News Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
65|CTV Calgary - Sitemap News Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
66|CTV Edmonton - Sitemap News Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
67|CTV Montreal - Sitemap News Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
68|CTV Toronto - Sitemap News Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
69|CTV Ottawa - Sitemap News Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
70|CTV Vancouver - Sitemap News Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
71|CTV Vancouver Island - Sitemap News Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
72|CTV Kitchener - Sitemap News Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
73|CTV London - Sitemap News Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
74|CTV Atlantic - Sitemap News Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
75|CTV Winnipeg - Sitemap News Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
76|CTV Regina - Sitemap News Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
77|CTV Saskatoon - Sitemap News Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
78|CTV Barrie - Sitemap News Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
79|CTV Northern Ontario - Sitemap News Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
80|La Presse - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
81|Le Devoir - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
82|Journal de Montreal - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
83|Journal de Quebec - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
84|Le Droit - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
85|Le Soleil - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
86|La Tribune - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
87|Le Nouvelliste - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
88|Le Quotidien - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
89|La Voix de l'Est - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
90|TVA Nouvelles - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
91|Radio-Canada - Info Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
92|Noovo Info - Latest News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
93|Noovo Info - News Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
94|TVA Sports - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
95|CP24 - Sitemap News Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
96|National Post - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
97|Global News - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
98|Toronto Star - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
99|CP24 - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
100|CBC BC|<https://www.cbc.ca/cmlink/rss-canada-britishcolumbia>|200|04/01/2026|valid|-|
101|CBC Toronto|<https://www.cbc.ca/cmlink/rss-canada-toronto>|200|04/01/2026|valid|-|
102|CBC Montreal|<https://www.cbc.ca/cmlink/rss-canada-montreal>|200|04/01/2026|valid|-|
103|CBC Calgary|<https://www.cbc.ca/cmlink/rss-canada-calgary>|200|04/01/2026|valid|-|
104|CBC Edmonton|<https://www.cbc.ca/cmlink/rss-canada-edmonton>|200|04/01/2026|valid|-|
105|CBC Ottawa|<https://www.cbc.ca/cmlink/rss-canada-ottawa>|200|04/01/2026|valid|-|
106|CBC Saskatchewan|<https://www.cbc.ca/cmlink/rss-canada-saskatchewan>|200|04/01/2026|valid|-|
107|CBC Manitoba|<https://www.cbc.ca/cmlink/rss-canada-manitoba>|200|04/01/2026|valid|-|
108|CBC New Brunswick|<https://www.cbc.ca/cmlink/rss-canada-newbrunswick>|200|04/01/2026|valid|-|
109|CBC Nova Scotia|<https://www.cbc.ca/cmlink/rss-canada-novascotia>|200|04/01/2026|valid|-|
110|CBC Windsor|<https://www.cbc.ca/cmlink/rss-canada-windsor>|200|04/01/2026|valid|-|
111|CBC Thunder Bay|<https://www.cbc.ca/cmlink/rss-canada-thunderbay>|200|04/01/2026|valid|-|
112|CBC Sudbury|<https://www.cbc.ca/cmlink/rss-canada-sudbury>|200|04/01/2026|valid|-|
113|CBC North|<https://www.cbc.ca/cmlink/rss-canada-north>|200|04/01/2026|valid|-|
114|CBC Kitchener-Waterloo|<https://www.cbc.ca/cmlink/rss-canada-kitchenerwaterloo>|200|04/01/2026|valid|-|
115|CBC Newfoundland|<https://www.cbc.ca/cmlink/rss-canada-newfoundland>|200|04/01/2026|valid|-|
116|CBC PEI|<https://www.cbc.ca/cmlink/rss-canada-pei>|200|04/01/2026|valid|-|
117|CBC London|<https://www.cbc.ca/cmlink/rss-canada-london>|200|04/01/2026|valid|-|
118|CBC Kamloops|<https://www.cbc.ca/cmlink/rss-canada-kamloops>|200|04/01/2026|valid|-|
119|CBC Saskatoon|<https://www.cbc.ca/cmlink/rss-canada-saskatoon>|200|04/01/2026|valid|-|
120|Montreal Gazette|<https://montrealgazette.com/feed/atom>|200|04/01/2026|valid|-|
121|Vancouver Sun|<https://vancouversun.com/feed/atom>|200|04/01/2026|valid|-|
122|Ottawa Citizen|<https://ottawacitizen.com/feed/atom>|200|04/01/2026|valid|-|
123|660 NewsRadio Calgary|<https://calgary.citynews.ca/feed/>|200|04/01/2026|valid|-|
124|1130 NewsRadio Vancouver|<https://vancouver.citynews.ca/feed/>|200|04/01/2026|valid|-|
125|CHEK News|<https://cheknews.ca/feed/>|200|04/01/2026|valid|-|
126|HalifaxToday|<https://halifax.citynews.ca/feed/>|200|04/01/2026|valid|-|
127|CityNews Montreal|<https://montreal.citynews.ca/feed/>|200|04/01/2026|valid|-|
128|CityNews Ottawa|<https://ottawa.citynews.ca/feed/>|200|04/01/2026|valid|-|
129|CityNews Edmonton|<https://edmonton.citynews.ca/feed/>|200|04/01/2026|valid|-|
130|CityNews Winnipeg|<https://winnipeg.citynews.ca/feed/>|200|04/01/2026|valid|-|
131|CityNews Kitchener|<https://kitchener.citynews.ca/feed/>|200|04/01/2026|valid|-|
132|London Free Press|<https://lfpress.com/feed/atom>|200|04/01/2026|valid|-|
133|Kingston Whig-Standard|<https://thewhig.com/feed/atom>|200|04/01/2026|valid|-|
134|Sudbury Star|<https://www.thesudburystar.com/feed/atom>|200|04/01/2026|valid|-|
135|Sarnia Observer|<https://theobserver.ca/feed/atom>|200|04/01/2026|valid|-|
136|Timmins Press|<https://timminspress.com/feed/atom>|200|04/01/2026|valid|-|
137|Woodstock Sentinel-Review|<https://woodstocksentinelreview.com/feed/atom>|200|04/01/2026|valid|-|
138|Brantford Expositor|<https://www.brantfordexpositor.ca/feed/atom>|200|04/01/2026|valid|-|
139|Chatham Daily News|<https://chathamdailynews.ca/feed/atom>|200|04/01/2026|valid|-|
140|Standard-Freeholder|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
141|Winnipeg Free Press|<https://www.winnipegfreepress.com/feed/>|200|04/01/2026|valid|-|
142|Hamilton Spectator - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
143|Waterloo Region Record - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
144|Niagara Falls Review - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
145|St. Catharines Standard - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
146|Welland Tribune - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
147|Toronto.com - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
148|InsideHalton - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
149|Simcoe - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
150|Guelph Mercury - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
151|Peterborough Examiner - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
152|Cambridge Times - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
153|The Recorder|<https://www.recorder.ca/feed/>|200|04/01/2026|valid|-|

### Russia (RU)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|RT|<https://rt.com/feed>|200|04/01/2026|valid|-|
2|The Bell|<https://thebell.io/feed>|200|04/01/2026|valid|-|
3|Interfax|<https://www.interfax.ru/rss.asp>|200|04/01/2026|valid|-|
4|RT Economy|<https://www.rt.com/rss/business>|200|04/01/2026|valid|-|
5|The Bell|<https://thebell.io/feed/>|200|04/01/2026|valid|-|
6|Lenta|<https://lenta.ru/rss/news>|200|04/01/2026|valid|-|
7|TASS Finance|<https://tass.com/rss/v2.xml>|200|04/01/2026|valid|-|
8|RT News|<https://www.rt.com/rss/>|200|04/01/2026|valid|-|
9|Kommersant ()|<https://www.kommersant.ru/RSS/main.xml>|200|04/01/2026|valid|-|
10|The Moscow Times|<https://www.themoscowtimes.com/rss/news>|200|04/01/2026|valid|-|
11|PravdaReport|<https://www.pravdareport.com/export.xml>|200|04/01/2026|valid|-|
12|Meduza (all)|<https://meduza.io/rss2/all>|200|04/01/2026|valid|-|
13|Habr (all)|<https://habr.com/ru/rss/all/all/?fl=ru>|200|04/01/2026|valid|-|
14|RIA Novosti (Russian State Broadcaster)|<https://ria.ru/export/rss2/archive/index.xml>|200|04/01/2026|valid|-|
15|TASS (TASS Russian Main)|<https://tass.ru/rss/v2.xml>|200|04/01/2026|valid|-|
16|RBC (Russian Finance/Economy #1)|<https://rssexport.rbc.ru/rbcnews/news/30/full.rss>|200|04/01/2026|valid|-|
17|Kommersant (Economy/Business Major Daily)|<https://www.kommersant.ru/RSS/news.xml>|200|04/01/2026|valid|-|
18|Vedomosti (Economy Major Daily)|<https://www.vedomosti.ru/rss/news>|200|04/01/2026|valid|-|
19|Gazeta.ru (General News)|<https://www.gazeta.ru/export/rss/lenta.xml>|needs check|04/01/2026|needs verification|-|
20|Izvestia (Traditional Daily)|<https://iz.ru/xml/rss/all.xml>|200|04/01/2026|valid|-|
21|RT Russian (RT Russian Main)|<https://russian.rt.com/rss>|200|04/01/2026|valid|-|
22|Rossiyskaya Gazeta (Official Gazette)|<https://rg.ru/xml/index.xml>|200|04/01/2026|valid|-|
23|Forbes Russia (Forbes Russia Edition)|<https://www.forbes.ru/newrss.xml>|200|04/01/2026|valid|-|
24|BFM.ru (Business Radio)|<https://www.bfm.ru/news.rss>|200|04/01/2026|valid|-|
25|Expert.ru (Economy Magazine)|<https://www.expert.ru/rss/>|Recovered via sitemap|04/01/2026|valid|-|
26|Finmarket.ru (Finance/Investment)|<http://www.finmarket.ru/rss/mainnews.asp>|200|04/01/2026|valid|-|
27|NTV (major broadcaster)|<https://www.ntv.ru/exp/news_rss.jsp>|needs check|04/01/2026|needs verification|-|
28|Komsomolskaya Pravda (Mass outlet #1)|<https://www.kp.ru/rss/all.xml>|needs check|04/01/2026|needs verification|-|
29|Moskovsky Komsomolets (Mass outlet #2)|<https://www.mk.ru/rss/news/index.xml>|needs check|04/01/2026|needs verification|-|
30|Rambler News (Portal News)|<https://news.rambler.ru/rss/>|needs check|04/01/2026|needs verification|-|

### South Korea (KR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Yonhap (EN)|<https://en.yna.co.kr/RSS/news.xml>|200|04/01/2026|valid|-|
2|Donga Ilbo|<https://rss.donga.com/total.xml>|200|04/01/2026|valid|-|
3|Seoul Newspaper|<https://www.seoul.co.kr/xml/rss/rss_top.xml>|200|04/01/2026|valid|-|
4|Newsis|<https://www.newsis.com/RSS/sokbo.xml>|200|04/01/2026|valid|-|
5|Aju News|<https://rss.ajunews.com/sokbo.xml>|200|04/01/2026|valid|-|
6|KED Global (Korea Economic Daily)|<https://www.kedglobal.com/newsRss>|needs check|04/01/2026|needs verification|-|
7|Daily NK (EN)|<https://www.dailynk.com/english/feed>|200|04/01/2026|valid|-|
8|Korea Times (RSS directory)|<https://feed.koreatimes.co.kr/k/allnews.xml>|200|04/01/2026|valid|-|
9|Korea Herald (RSS directory)|<https://www.koreaherald.com/rss/newsAll>|200|04/01/2026|valid|-|
10|KBS World Radio (RSS directory)|<http://world.kbs.co.kr/rss/rss_news.htm?lang=e>|needs check|04/01/2026|needs verification|-|
11|hankyung.com|<https://www.hankyung.com/feed/all-news>|200|04/01/2026|valid|-|
12|hankyung.com|<https://www.hankyung.com/feed/finance>|200|04/01/2026|valid|-|
13|hankyung.com|<https://www.hankyung.com/feed/economy>|200|04/01/2026|valid|-|
14|hankyung.com|<https://www.hankyung.com/feed/realestate>|200|04/01/2026|valid|-|
15|IT|<https://www.hankyung.com/feed/it>|200|04/01/2026|valid|-|
16|hankyung.com|<https://www.hankyung.com/feed/politics>|200|04/01/2026|valid|-|
17|hankyung.com|<https://www.hankyung.com/feed/international>|200|04/01/2026|valid|-|
18|mk.co.kr|<https://www.mk.co.kr/rss/30000001/>|200|04/01/2026|valid|-|
19|mk.co.kr|<https://www.mk.co.kr/rss/40300001/>|200|04/01/2026|valid|-|
20|mk.co.kr|<https://www.mk.co.kr/rss/30100041/>|200|04/01/2026|valid|-|
21|mk.co.kr|<https://www.mk.co.kr/rss/30200030/>|200|04/01/2026|valid|-|
22|mk.co.kr|<https://www.mk.co.kr/rss/50400012/>|200|04/01/2026|valid|-|
23|SBS|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=01&plink=RSSREADER>|200|04/01/2026|valid|-|
24|SBS|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=02&plink=RSSREADER>|200|04/01/2026|valid|-|
25|SBS|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=03&plink=RSSREADER>|200|04/01/2026|valid|-|
26|SBS|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=07&plink=RSSREADER>|200|04/01/2026|valid|-|
27|SBS|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=08&plink=RSSREADER>|200|04/01/2026|valid|-|
28|SBS|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=14&plink=RSSREADER>|200|04/01/2026|valid|-|
29|SBS|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=09&plink=RSSREADER>|200|04/01/2026|valid|-|
30|hani.co.kr|<https://www.hani.co.kr/rss/international/>|200|04/01/2026|valid|-|
31|hani.co.kr|<https://www.hani.co.kr/rss/culture/>|200|04/01/2026|valid|-|
32|hani.co.kr|<https://www.hani.co.kr/rss/sports/>|200|04/01/2026|valid|-|
33|hanion.co.kr|<https://www.hanion.co.kr/rss/S1N1.xml>|200|04/01/2026|valid|-|
34|hanion.co.kr|<https://www.hanion.co.kr/rss/S1N2.xml>|200|04/01/2026|valid|-|
35|hanion.co.kr|<https://www.hanion.co.kr/rss/S1N3.xml>|200|04/01/2026|valid|-|
36|khan.co.kr|<https://www.khan.co.kr/rss/rssdata/total_news.xml>|200|04/01/2026|valid|-|
37|MBC|<https://imnews.imbc.com/rss/google_news/narrativeNews.rss>|needs check|04/01/2026|needs verification|-|
38|chosun.com|<https://www.chosun.com/arc/outboundfeeds/rss/?outputType=xml>|200|04/01/2026|valid|-|
39|JoongAng - Latest Articles|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
40|JTBC - Latest Articles|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
41|KBS News - Recent Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
42|Yonhap Korea - News Sitemap 3|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
43|Yonhap Korea - News Sitemap 4|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
44|Yonhap Korea - News Sitemap 5|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
45|Yonhap Korea - News Sitemap 6|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|

### Brazil (BR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|G1 (Globo - Economy)|<https://g1.globo.com/rss/g1/economia/>|200|04/01/2026|valid|-|
2|G1 (Globo - Tech)|<https://g1.globo.com/rss/g1/tecnologia/>|200|04/01/2026|valid|-|
3|Folha de S.Paulo - Top|<https://feeds.folha.uol.com.br/emcimadahora/rss091.xml>|200|04/01/2026|valid|-|
4|Folha de S.Paulo - Market|<https://feeds.folha.uol.com.br/mercado/rss091.xml>|200|04/01/2026|valid|-|
5|Correio Braziliense|<https://www.correiobraziliense.com.br/rss/noticia/economia/rss.xml>|200|04/01/2026|valid|-|
6|InfoMoney|<https://www.infomoney.com.br/feed/>|200|04/01/2026|valid|-|
7|Canaltech|<https://canaltech.com.br/rss/>|200|04/01/2026|valid|-|
8|Forbes Brazil|<https://forbes.com.br/feed/>|200|04/01/2026|valid|-|
9|Estado de Minas|<https://www.em.com.br/feed/>|200|04/01/2026|valid|-|
10|Veja|<https://veja.abril.com.br/feed/>|200|04/01/2026|valid|-|
11|Folha - Poder|<https://feeds.folha.uol.com.br/poder/rss091.xml>|200|04/01/2026|valid|-|
12|Folha - Mundo|<https://feeds.folha.uol.com.br/mundo/rss091.xml>|200|04/01/2026|valid|-|
13|Folha - Cotidiano|<https://feeds.folha.uol.com.br/cotidiano/rss091.xml>|200|04/01/2026|valid|-|
14|Folha - Esporte|<https://feeds.folha.uol.com.br/esporte/rss091.xml>|200|04/01/2026|valid|-|
15|Folha - Ilustrada|<https://feeds.folha.uol.com.br/ilustrada/rss091.xml>|200|04/01/2026|valid|-|
16|Agencia Publica|<https://apublica.org/feed/>|200|04/01/2026|valid|-|
17|Nexo Jornal|<https://www.nexojornal.com.br/rss.xml>|Recovered via sitemap|04/01/2026|valid|-|
18|Jornal GGN|<https://jornalggn.com.br/feed/>|needs check|04/01/2026|needs verification|-|
19|Jacobin Brasil|<https://jacobin.com.br/feed>|needs check|04/01/2026|needs verification|-|
20|CartaCapital|<https://www.cartacapital.com.br/feed>|200|04/01/2026|valid|-|
21|G1 Globo (General Top Portal)|<https://g1.globo.com/rss/g1/>|200|04/01/2026|valid|-|
22|G1 Politica (Politics)|<https://g1.globo.com/rss/g1/politica/>|200|04/01/2026|valid|-|
23|G1 Mundo|<https://g1.globo.com/rss/g1/mundo/>|200|04/01/2026|valid|-|
24|G1 Ciencia e Saude|<https://g1.globo.com/rss/g1/ciencia-e-saude/>|200|04/01/2026|valid|-|
25|G1 Economia - Tecnologia|<https://g1.globo.com/rss/g1/economia/tecnologia/>|200|04/01/2026|valid|-|
26|G1 Carros|<https://g1.globo.com/rss/g1/carros/>|200|04/01/2026|valid|-|
27|UOL Noticias (Breaking and Top Stories)|<https://rss.uol.com.br/feed/noticias.xml>|200|04/01/2026|valid|-|
28|UOL Economia (Portal Economy)|<https://rss.uol.com.br/feed/economia.xml>|200|04/01/2026|valid|-|
29|Estadao (Mainstream Daily)|<https://www.estadao.com.br/rss/ultimas>|needs check|04/01/2026|needs verification|-|
30|Exame (Business/Economy Magazine)|<https://exame.com/feed/>|200|04/01/2026|valid|-|
31|Valor Economico (Financial Daily)|<https://valor.globo.com/rss/valor>|200|04/01/2026|valid|-|
32|CNN Brasil (Business)|<https://www.cnnbrasil.com.br/business/feed/>|404 (HTTP_404)|04/01/2026|invalid|-|
33|CartaCapital (Investigative/Analysis)|<https://www.cartacapital.com.br/feed/>|200|04/01/2026|valid|-|
34|Poder360 (Politics/Policy)|<https://www.poder360.com.br/feed/>|200|04/01/2026|valid|-|
35|Correio Braziliense (Political Coverage)|<https://www.correiobraziliense.com.br/rss/noticia/politica/rss.xml>|200|04/01/2026|valid|-|
36|Metropoles - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
37|Metropoles - Main Feed|<https://www.metropoles.com/feed>|200|04/01/2026|valid|-|
38|Metropoles - Brasil Feed|<https://www.metropoles.com/brasil/feed>|200|04/01/2026|valid|-|
39|Metropoles - Saude Feed|<https://www.metropoles.com/saude/feed>|200|04/01/2026|valid|-|
40|O Globo - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
41|Estadao - Sitemap Index by Day|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|

### Australia (AU)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|ABC News - Business|<https://www.abc.net.au/news/feed/51892/rss.xml>|200|04/01/2026|valid|-|
2|ABC News - World|<https://www.abc.net.au/news/feed/104217382/rss.xml>|200|04/01/2026|valid|-|
3|ABC News - Top Stories|<https://www.abc.net.au/news/feed/10719986/rss.xml>|200|04/01/2026|valid|-|
4|Sydney Morning Herald - Business|<https://www.smh.com.au/rss/business.xml>|200|04/01/2026|valid|-|
5|The Age - Business|<https://www.theage.com.au/rss/business.xml>|200|04/01/2026|valid|-|
6|The Australian - Business|<https://www.theaustralian.com.au/business/rss>|needs check|04/01/2026|needs verification|-|
7|The Guardian Australia|<https://www.theguardian.com/au/rss>|200|04/01/2026|valid|-|
8|The Guardian Australia - Business|<https://www.theguardian.com/au/business/rss>|200|04/01/2026|valid|-|
9|The Guardian Australia - Environment|<https://www.theguardian.com/au/environment/rss>|200|04/01/2026|valid|-|
10|The Guardian Australia - Media|<https://www.theguardian.com/au/media/rss>|200|04/01/2026|valid|-|
11|ABC News (Top)|<https://www.abc.net.au/news/feed/1106/rss.xml>|200|04/01/2026|valid|-|
12|Australian Broadcasting Corporation - World|<https://www.abc.net.au/news/feed/51892/rss.xml?edition=world>|200|04/01/2026|valid|-|
13|The Guardian Australia|<https://www.theguardian.com/australia-news/rss>|200|04/01/2026|valid|-|
14|SBS World News|<https://www.sbs.com.au/news/topic/latest/feed>|200|04/01/2026|valid|-|
15|SBS News (Breaking)|<https://www.sbs.com.au/news/feed>|200|04/01/2026|valid|-|
16|9News|<https://www.9news.com.au/rss>|200|04/01/2026|valid|-|
17|Sydney Morning Herald|<https://www.smh.com.au/rss/feed.xml>|200|04/01/2026|valid|-|
18|The Age|<https://www.theage.com.au/rss/feed.xml>|200|04/01/2026|valid|-|
19|Sydney Morning Herald - Articles Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
20|The Age - Articles Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
21|Brisbane Times|<https://www.brisbanetimes.com.au/rss/feed.xml>|200|04/01/2026|valid|-|
22|Brisbane Times - Business|<https://www.brisbanetimes.com.au/rss/business.xml>|200|04/01/2026|valid|-|
23|Brisbane Times - National|<https://www.brisbanetimes.com.au/rss/national.xml>|200|04/01/2026|valid|-|
24|Brisbane Times - World|<https://www.brisbanetimes.com.au/rss/world.xml>|200|04/01/2026|valid|-|
25|Brisbane Times - Technology|<https://www.brisbanetimes.com.au/rss/technology.xml>|200|04/01/2026|valid|-|
26|Brisbane Times - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
27|WAtoday|<https://www.watoday.com.au/rss/feed.xml>|200|04/01/2026|valid|-|
28|WAtoday - Business|<https://www.watoday.com.au/rss/business.xml>|200|04/01/2026|valid|-|
29|WAtoday - National|<https://www.watoday.com.au/rss/national.xml>|200|04/01/2026|valid|-|
30|WAtoday - World|<https://www.watoday.com.au/rss/world.xml>|200|04/01/2026|valid|-|
31|WAtoday - Technology|<https://www.watoday.com.au/rss/technology.xml>|200|04/01/2026|valid|-|
32|WAtoday - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
33|Canberra Times|<https://www.canberratimes.com.au/rss.xml>|200|04/01/2026|valid|-|
34|PerthNow|<https://www.perthnow.com.au/news/feed>|200|04/01/2026|valid|-|
35|The Australian|<https://www.theaustralian.com.au/business/markets/rss>|needs check|04/01/2026|needs verification|-|
36|The Australian - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
37|7news|<https://7news.com.au/feed>|200|04/01/2026|valid|-|
38|RenewEconomy|<https://reneweconomy.com.au/feed/>|200|04/01/2026|valid|-|
39|Australian Mining|<https://www.australianmining.com.au/feed/>|200|04/01/2026|valid|-|
40|MacroBusiness|<https://www.macrobusiness.com.au/feed/>|200|04/01/2026|valid|-|
41|SmartCompany|<https://www.smartcompany.com.au/feed/>|200|04/01/2026|valid|-|
42|Startup Daily|<https://www.startupdaily.net/feed/>|200|04/01/2026|valid|-|
43|The Conversation AU|<https://theconversation.com/au/articles.atom>|200|04/01/2026|valid|-|
44|AFR (Financial Review)|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
45|AFR - Latest News|<https://www.afr.com/rss/feed.xml>|200|04/01/2026|valid|-|
46|AFR - Politics|<https://www.afr.com/rss/politics.xml>|200|04/01/2026|valid|-|
47|AFR - World|<https://www.afr.com/rss/world.xml>|200|04/01/2026|valid|-|
48|AFR - Technology|<https://www.afr.com/rss/technology.xml>|200|04/01/2026|valid|-|
49|AFR - Policy|<https://www.afr.com/rss/policy.xml>|200|04/01/2026|valid|-|
50|AFR - Company|<https://www.afr.com/rss/company.xml>|200|04/01/2026|valid|-|
51|AFR - Markets|<https://www.afr.com/rss/markets.xml>|200|04/01/2026|valid|-|
52|Crikey|<https://www.crikey.com.au/feed/>|200|04/01/2026|valid|-|
53|The Mandarin|<https://www.themandarin.com.au/feed/>|200|04/01/2026|valid|-|
54|AAP - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
55|News.com.au National Top News|<https://www.news.com.au/content-feeds/latest-news-national/>|200|04/01/2026|valid|-|
56|News.com.au Finance|<https://www.news.com.au/content-feeds/latest-news-finance/>|200|04/01/2026|valid|-|
57|ABC News Australia|<https://www.abc.net.au/news/feed/51120/rss.xml>|200|04/01/2026|valid|-|
58|ABC News - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
59|News.com.au World|<https://www.news.com.au/content-feeds/latest-news-world/>|200|04/01/2026|valid|-|
60|News.com.au Technology|<https://www.news.com.au/content-feeds/latest-news-technology/>|200|04/01/2026|valid|-|
61|Sky News Australia|<https://www.skynews.com.au/australia-news/rss>|needs check|04/01/2026|needs verification|-|
62|Sky News World|<https://www.skynews.com.au/world-news/rss>|needs check|04/01/2026|needs verification|-|
63|Sky News - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
64|Daily Mail Australia|<https://www.dailymail.co.uk/auhome/index.rss>|200|04/01/2026|valid|-|
65|Yahoo News Australia - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
66|ABC News - Politics|<https://www.abc.net.au/news/feed/45910/rss.xml>|200|04/01/2026|valid|-|
67|Sydney Morning Herald - National|<https://www.smh.com.au/rss/national.xml>|200|04/01/2026|valid|-|
68|The Age - National|<https://www.theage.com.au/rss/national.xml>|200|04/01/2026|valid|-|
69|Herald Sun|<https://www.heraldsun.com.au/rss>|200|04/01/2026|valid|-|
70|Herald Sun - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
71|ABC News - Rural|<https://www.abc.net.au/news/feed/52498/rss.xml>|200|04/01/2026|valid|-|
72|ABC News - Science|<https://www.abc.net.au/news/feed/45914/rss.xml>|200|04/01/2026|valid|-|
73|ABC News - Politics (Topic)|<https://www.abc.net.au/news/feed/45910/rss.xml?topic=technology>|200|04/01/2026|valid|-|
74|News.com.au - Sport|<https://www.news.com.au/content-feeds/latest-news-sport/>|200|04/01/2026|valid|-|
75|SBS News - Australia|<https://www.sbs.com.au/news/topic/australia/feed>|200|04/01/2026|valid|-|
76|SBS News - World|<https://www.sbs.com.au/news/topic/world/feed>|200|04/01/2026|valid|-|
77|News.com.au - Lifestyle|<https://www.news.com.au/content-feeds/latest-news-lifestyle/>|200|04/01/2026|valid|-|
78|News.com.au - Entertainment|<https://www.news.com.au/content-feeds/latest-news-entertainment/>|200|04/01/2026|valid|-|
79|News.com.au - Travel|<https://www.news.com.au/content-feeds/latest-news-travel/>|200|04/01/2026|valid|-|
80|ABC News - Analysis|<https://www.abc.net.au/news/feed/45924/rss.xml>|200|04/01/2026|valid|-|
81|The West Australian|<https://thewest.com.au/rss>|200|04/01/2026|valid|-|
82|Courier Mail|<https://www.couriermail.com.au/rss>|200|04/01/2026|valid|-|
83|Courier Mail - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
84|Daily Telegraph Australia|<https://www.dailytelegraph.com.au/rss>|200|04/01/2026|valid|-|
85|Daily Telegraph Australia - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
86|Geelong Advertiser|<https://www.geelongadvertiser.com.au/rss>|200|04/01/2026|valid|-|
87|News.com.au - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
88|SBS News - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
89|SBS News - English Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
90|SBS Dateline - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
91|Cairns Post|<https://www.cairnspost.com.au/rss>|200|04/01/2026|valid|-|
92|AdelaideNow - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
93|The Mercury - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
94|Gold Coast Bulletin - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
95|Townsville Bulletin - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
96|NT News - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
97|Geelong Advertiser - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
98|PerthNow - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
99|The West Australian - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
100|The Chronicle - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
101|Weekly Times - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
102|The Australian - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
103|Newcastle Herald|<https://www.newcastleherald.com.au/rss.xml>|200|04/01/2026|valid|-|
104|Illawarra Mercury|<https://www.illawarramercury.com.au/rss.xml>|200|04/01/2026|valid|-|
105|The Courier|<https://www.thecourier.com.au/rss.xml>|200|04/01/2026|valid|-|
106|Border Mail|<https://www.bordermail.com.au/rss.xml>|200|04/01/2026|valid|-|
107|The Advocate|<https://www.theadvocate.com.au/rss.xml>|200|04/01/2026|valid|-|
108|Daily Advertiser|<https://www.dailyadvertiser.com.au/rss.xml>|200|04/01/2026|valid|-|
109|Central Western Daily|<https://www.centralwesterndaily.com.au/rss.xml>|200|04/01/2026|valid|-|
110|The Examiner|<https://www.examiner.com.au/rss.xml>|200|04/01/2026|valid|-|
111|Bendigo Advertiser|<https://www.bendigoadvertiser.com.au/rss.xml>|200|04/01/2026|valid|-|
112|North West Star|<https://www.northweststar.com.au/rss.xml>|200|04/01/2026|valid|-|
113|Goulburn Post|<https://www.goulburnpost.com.au/rss.xml>|200|04/01/2026|valid|-|
114|The Land|<https://www.theland.com.au/rss.xml>|200|04/01/2026|valid|-|
115|Manning River Times|<https://www.manningrivertimes.com.au/rss.xml>|200|04/01/2026|valid|-|
116|Port Macquarie News|<https://www.portnews.com.au/rss.xml>|200|04/01/2026|valid|-|
117|Blue Mountains Gazette|<https://www.bluemountainsgazette.com.au/rss.xml>|200|04/01/2026|valid|-|
118|Warrnambool Standard|<https://www.standard.net.au/rss.xml>|200|04/01/2026|valid|-|
119|Daily Liberal|<https://www.dailyliberal.com.au/rss.xml>|200|04/01/2026|valid|-|
120|Northern Daily Leader|<https://www.northerndailyleader.com.au/rss.xml>|200|04/01/2026|valid|-|
121|Western Advocate|<https://www.westernadvocate.com.au/rss.xml>|200|04/01/2026|valid|-|
122|Queensland Country Life|<https://www.queenslandcountrylife.com.au/rss.xml>|200|04/01/2026|valid|-|
123|North Queensland Register|<https://www.northqueenslandregister.com.au/rss.xml>|200|04/01/2026|valid|-|
124|Stock & Land|<https://www.stockandland.com.au/rss.xml>|200|04/01/2026|valid|-|
125|Stock Journal|<https://www.stockjournal.com.au/rss.xml>|200|04/01/2026|valid|-|
126|Farm Weekly|<https://www.farmweekly.com.au/rss.xml>|200|04/01/2026|valid|-|
127|Farmonline|<https://www.farmonline.com.au/rss.xml>|200|04/01/2026|valid|-|
128|The Senior|<https://www.thesenior.com.au/rss.xml>|200|04/01/2026|valid|-|
129|Maitland Mercury|<https://www.maitlandmercury.com.au/rss.xml>|200|04/01/2026|valid|-|
130|Armidale Express|<https://www.armidaleexpress.com.au/rss.xml>|200|04/01/2026|valid|-|
131|Area News|<https://www.areanews.com.au/rss.xml>|200|04/01/2026|valid|-|
132|Singleton Argus|<https://www.singletonargus.com.au/rss.xml>|200|04/01/2026|valid|-|
133|Glen Innes Examiner|<https://www.gleninnesexaminer.com.au/rss.xml>|200|04/01/2026|valid|-|
134|Moree Champion|<https://www.moreechampion.com.au/rss.xml>|200|04/01/2026|valid|-|
135|Tenterfield Star|<https://www.tenterfieldstar.com.au/rss.xml>|200|04/01/2026|valid|-|
136|The New Daily|<https://wp.thenewdaily.com.au/feed>|200|04/01/2026|valid|-|
137|The Nightly|<https://thenightly.com.au/feed/>|200|04/01/2026|valid|-|
138|InDaily SA - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
139|InDaily QLD - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
140|Region Canberra|<https://region.com.au/feed/>|200|04/01/2026|valid|-|
141|Canberra Daily|<https://canberradaily.com.au/feed/>|200|04/01/2026|valid|-|
142|Byron Shire Echo|<https://www.echo.net.au/feed/>|200|04/01/2026|valid|-|
143|Western Weekender|<https://westernweekender.com.au/feed/>|200|04/01/2026|valid|-|
144|Michael West|<https://michaelwest.com.au/feed/>|200|04/01/2026|valid|-|
145|Region Riverina|<https://regionriverina.com.au/feed/>|200|04/01/2026|valid|-|
146|Region Illawarra|<https://regionillawarra.com.au/feed/>|200|04/01/2026|valid|-|
147|Newcastle Weekly|<https://newcastleweekly.com.au/feed/>|200|04/01/2026|valid|-|
148|Sunraysia Daily|<https://www.sunraysiadaily.com.au/feed/>|200|04/01/2026|valid|-|
149|Murray Pioneer|<https://www.murraypioneer.com.au/feed/>|200|04/01/2026|valid|-|
150|Port Lincoln Times|<https://portlincolntimes.com.au/feed/>|200|04/01/2026|valid|-|
151|Border Watch|<https://borderwatch.com.au/feed/>|200|04/01/2026|valid|-|
152|Geraldton Guardian|<https://www.geraldtonguardian.com.au/feed/>|200|04/01/2026|valid|-|
153|Kalgoorlie Miner|<https://www.kalminer.com.au/feed/>|200|04/01/2026|valid|-|

### Spain (ES)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Expansion (Financial)|<https://e00-expansion.uecdn.es/rss/empresas.xml>|200|04/01/2026|valid|-|
2|Cinco Dias (Economy)|<https://cincodias.elpais.com/arc/outboundfeeds/rss/?outputType=xml>|200|04/01/2026|valid|-|
3|El Pais - Economy|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/economia/portada>|200|04/01/2026|valid|-|
4|El Mundo - Economy|<https://e00-elmundo.uecdn.es/elmundo/rss/economia.xml>|200|04/01/2026|valid|-|
5|El Confidencial|<https://rss.elconfidencial.com/espana/>|200|04/01/2026|valid|-|
6|El Periodico|<https://www.elperiodico.com/es/rss/rss_portada.xml>|needs check|04/01/2026|needs verification|-|
7|20 Minutos|<https://www.20minutos.es/rss/>|200|04/01/2026|valid|-|
8|20 Minutos - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
9|20 Minutos - Incremental Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
10|El Diario|<https://www.eldiario.es/rss/>|200|04/01/2026|valid|-|
11|eldiario|<https://www.eldiario.es/rss/>|200|04/01/2026|valid|-|
12|Marca|<https://www.marca.com/rss/>|needs check|04/01/2026|needs verification|-|
13|El Pais|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada>|200|04/01/2026|valid|-|
14|EL PAIS - Ultimas|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/ultimas-noticias/portada>|200|04/01/2026|valid|-|
15|EL PAIS - Internacional|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/internacional/portada>|200|04/01/2026|valid|-|
16|EL PAIS - Opinion|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/opinion/portada>|200|04/01/2026|valid|-|
17|EL PAIS - Espana|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/espana/portada>|200|04/01/2026|valid|-|
18|EL PAIS - Sociedad|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/sociedad/portada>|200|04/01/2026|valid|-|
19|EL PAIS - Ciencia|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/ciencia/portada>|200|04/01/2026|valid|-|
20|EL PAIS - Tecnologia|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/tecnologia/portada>|200|04/01/2026|valid|-|
21|EL PAIS - Cultura|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/cultura/portada>|200|04/01/2026|valid|-|
22|EL PAIS - Deportes|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/deportes/portada>|200|04/01/2026|valid|-|
23|EL PAIS - Gente|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/gente/portada>|200|04/01/2026|valid|-|
24|EL PAIS - Clima y medio ambiente|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/clima-y-medio-ambiente/portada>|200|04/01/2026|valid|-|
25|La Vanguardia - Portada|<https://www.lavanguardia.com/rss/home.xml>|200|04/01/2026|valid|-|
26|La Vanguardia - Internacional|<https://www.lavanguardia.com/rss/internacional.xml>|200|04/01/2026|valid|-|
27|La Vanguardia - Politica|<https://www.lavanguardia.com/rss/politica.xml>|ERR (NETWORK)|04/01/2026|invalid|-|
28|La Vanguardia - Opinion|<https://www.lavanguardia.com/rss/opinion.xml>|ERR (NETWORK)|04/01/2026|invalid|-|
29|La Vanguardia - Sociedad|<https://www.lavanguardia.com/rss/sociedad.xml>|200|04/01/2026|valid|-|
30|La Vanguardia - Deportes|<https://www.lavanguardia.com/rss/deportes.xml>|200|04/01/2026|valid|-|
31|El Mundo - Portada|<https://e00-elmundo.uecdn.es/rss/portada.xml>|200|04/01/2026|valid|-|
32|The Local Spain (EN)|<https://feeds.thelocal.com/rss/es>|200|04/01/2026|valid|-|
33|El Economista - Portada|<https://www.eleconomista.es/rss/rss-portada.php>|needs check|04/01/2026|needs verification|-|
34|El Economista - Mercados|<https://www.eleconomista.es/rss/rss-mercados.php>|needs check|04/01/2026|needs verification|-|
35|ABC.es - Economía|<https://www.abc.es/rss/feeds/abc_economia.xml>|200|04/01/2026|valid|-|
36|Vozpópuli|<https://www.vozpopuli.com/rss>|200|04/01/2026|valid|-|
37|El Periódico de la Energía|<https://elperiodicodelaenergia.com/feed/>|200|04/01/2026|valid|-|
38|Xataka|<https://www.xataka.com/feed>|needs check|04/01/2026|needs verification|-|
39|ABC.es|<https://www.abc.es/rss/feeds/abc_ultima.xml>|200|04/01/2026|valid|-|
40|El Espanol - RSS|<https://www.elespanol.com/rss/>|200|04/01/2026|valid|-|
41|RTVE - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
42|El Pais - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
43|La Vanguardia - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
44|El Espanol - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
45|ABC.es - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
46|OKdiario - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
47|El Correo - Incremental Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
48|El Periodico - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
49|El Periodico - Month Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
50|eldiario.es - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|

### Mexico (MX)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Proceso (Investigative)|<https://www.proceso.com.mx/rss/feed.html>|200|04/01/2026|valid|-|
2|Expansion (Biz)|<https://expansion.mx/rss>|200|04/01/2026|valid|-|
3|Contralinea|<https://www.contralinea.com.mx/feed>|200|04/01/2026|valid|-|
4|El Financiero|<https://www.elfinanciero.com.mx/rss/mundo>|200|04/01/2026|valid|-|
5|Proceso World|<https://www.proceso.com.mx/rss/feed.html?output=xml>|200|04/01/2026|valid|-|
6|El Financiero|<https://www.elfinanciero.com.mx/rss>|200|04/01/2026|valid|-|
7|ADN40 (TV Azteca - Economy)|<https://www.adn40.mx/economia/rss>|needs check|04/01/2026|needs verification|-|
8|ADN40 (TV Azteca - Mexico)|<https://www.adn40.mx/mexico/rss>|needs check|04/01/2026|needs verification|-|
9|Azteca Noticias - Sitemap Latest|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
10|Azteca Noticias - News Latest Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
11|Reforma - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
12|El Financiero (Economia)|<https://www.elfinanciero.com.mx/rss/economia>|200|04/01/2026|valid|-|
13|El Financiero (Mercados)|<https://www.elfinanciero.com.mx/rss/mercados>|200|04/01/2026|valid|-|
14|La Jornada - Economia|<https://www.jornada.com.mx/rss/economia.xml>|200|04/01/2026|valid|-|
15|Aristegui (Main)|<https://editorial.aristeguinoticias.com/feed/>|200|04/01/2026|valid|-|
16|Aristegui (Mexico)|<https://editorial.aristeguinoticias.com/category/mexico/feed/>|200|04/01/2026|valid|-|
17|Aristegui (Dinero y Economia)|<https://editorial.aristeguinoticias.com/category/dinero-y-economia/feed/>|200|04/01/2026|valid|-|
18|Aristegui (Mundo)|<https://editorial.aristeguinoticias.com/category/mundo/feed/>|200|04/01/2026|valid|-|
19|Aristegui En Vivo - Enterate|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/enterate/feed>|200|04/01/2026|valid|-|
20|Aristegui En Vivo - Programas completos|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/programas-completos/feed>|200|04/01/2026|valid|-|
21|Aristegui En Vivo - Entrevistas completas|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/entrevistas-completos/feed>|needs check|04/01/2026|needs verification|-|
22|Aristegui En Vivo - Mesa politica|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/mesa-politica-en-vivo/feed>|200|04/01/2026|valid|-|
23|Aristegui En Vivo - Investigaciones especiales|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/investigaciones-especiales/feed>|200|04/01/2026|valid|-|
24|Aristegui En Vivo - Enlaces en vivo|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/enlaces-en-vivo/feed>|200|04/01/2026|valid|-|
25|Aristegui En Vivo - Titulares del dia|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/titulares-del-dia/feed>|200|04/01/2026|valid|-|
26|Aristegui En Vivo - Deportes|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/deportes-aristegui-en-vivo/feed>|200|04/01/2026|valid|-|
27|Aristegui En Vivo - Dinero y Economia|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/dinero-y-economia/feed>|200|04/01/2026|valid|-|
28|Aristegui En Vivo - Ninonautas|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/ninonautas/feed>|200|04/01/2026|valid|-|
29|Aristegui En Vivo - Las plumas de la serpiente|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/las-plumas-de-la-serpiente/feed>|200|04/01/2026|valid|-|
30|El Economista - Top Noticias|<https://www.eleconomista.com.mx/rss/top-noticias>|needs check|04/01/2026|needs verification|-|
31|El Economista - Empresas|<https://www.eleconomista.com.mx/rss/empresas>|needs check|04/01/2026|needs verification|-|
32|El Universal - General|<https://www.eluniversal.com.mx/rss.xml>|needs check|04/01/2026|needs verification|-|
33|El Universal - Cartera|<https://www.eluniversal.com.mx/cartera/rss.xml>|needs check|04/01/2026|needs verification|-|
34|Milenio|<https://www.milenio.com/rss>|needs check|04/01/2026|needs verification|-|
35|Excelsior|<https://www.excelsior.com.mx/rss.xml>|needs check|04/01/2026|needs verification|-|
36|Forbes Mexico|<https://www.forbes.com.mx/feed/>|Recovered via sitemap|04/01/2026|valid|-|
37|Energía a Debate|<https://energiaadebate.com/feed/>|200|04/01/2026|valid|-|
38|Milenio Negocios (Business)|<https://www.milenio.com/negocios/rss>|needs check|04/01/2026|needs verification|-|
39|Aristegui Noticias (Political Investigation)|<https://aristeguinoticias.com/feed/>|needs check|04/01/2026|needs verification|-|
40|La Jornada (Progressive Daily)|<https://www.jornada.com.mx/rss/edicion.xml>|200|04/01/2026|valid|-|
41|El Sol de Mexico (Domestic Breaking)|<https://www.elsoldemexico.com.mx/rss.xml>|200|04/01/2026|valid|-|
42|Expansion Economia (Economy Specialist)|<https://expansion.mx/rss/economia>|200|04/01/2026|valid|-|
43|Expansion Empresas (Corporate News)|<https://expansion.mx/rss/empresas>|200|04/01/2026|valid|-|
44|Expansion Politica - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
45|Sopitas (Millennial Portal)|<https://www.sopitas.com/feed/>|200|04/01/2026|valid|-|
46|Animal Politico (Political Deep Coverage)|<https://www.animalpolitico.com/feed>|needs check|04/01/2026|needs verification|-|
47|Xataka Mexico (Tech/IT)|<https://www.xataka.com.mx/feed>|needs check|04/01/2026|needs verification|-|
48|Xataka Mexico - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
49|El Financiero - Google News Feed|<https://www.elfinanciero.com.mx/arc/outboundfeeds/google-news-feed/?outputType=xml>|200|04/01/2026|valid|-|
50|Milenio - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
51|Excelsior - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
52|Animal Politico - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
53|El Universal - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
54|El Universal - General Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
55|El Universal - Nacion Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
56|El Universal - Mundo Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
57|El Universal - Estados Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
58|El Universal - Cartera Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
59|El Universal - Deportes Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
60|El Universal - Espectaculos Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
61|El Universal - Tendencias Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
62|Milenio - Articles Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
63|Excelsior - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
64|Proceso - News Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
65|SDP Noticias - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
66|El Sol de Mexico - Update Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
67|El Universal - De Ultima Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
68|El Universal - Ciencia Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
69|El Universal - Elecciones Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
70|El Universal - Edomex Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
71|La Jornada - Politica|<https://www.jornada.com.mx/rss/politica.xml>|200|04/01/2026|valid|-|
72|La Jornada - Estados|<https://www.jornada.com.mx/rss/estados.xml>|200|04/01/2026|valid|-|
73|La Jornada - Mundo|<https://www.jornada.com.mx/rss/mundo.xml>|200|04/01/2026|valid|-|
74|La Jornada - Capital|<https://www.jornada.com.mx/rss/capital.xml>|200|04/01/2026|valid|-|
75|La Jornada - Deportes|<https://www.jornada.com.mx/rss/deportes.xml>|200|04/01/2026|valid|-|
76|La Jornada - Opinion|<https://www.jornada.com.mx/rss/opinion.xml>|200|04/01/2026|valid|-|
77|El Universal - Cultura Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
78|El Universal - Techbit Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
79|El Universal - Opinion Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
80|N+MAS - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
81|UnoTV - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
82|El Heraldo de Mexico - News Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|

### Indonesia (ID)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Republika|<https://www.republika.co.id/rss>|200|04/01/2026|valid|-|
2|Sindo News|<https://www.sindonews.com/rss/home/>|200|04/01/2026|valid|-|
3|Kapanlagi|<https://www.kapanlagi.com/feed/>|200|04/01/2026|valid|-|
4|Antara TV|<https://www.antaranews.com/rss/terkini>|200|04/01/2026|valid|-|
5|Sindonews|<https://www.sindonews.com/rss/>|200|04/01/2026|valid|-|
6|Republika|<https://www.republika.co.id/rss/terkini>|needs check|04/01/2026|needs verification|-|
7|ANTARA - Terkini|<https://www.antaranews.com/rss/terkini.xml>|200|04/01/2026|valid|-|
8|ANTARA - Top News|<https://www.antaranews.com/rss/top-news.xml>|200|04/01/2026|valid|-|
9|ANTARA - Politik|<https://www.antaranews.com/rss/politik.xml>|200|04/01/2026|valid|-|
10|ANTARA - Hukum|<https://www.antaranews.com/rss/hukum.xml>|200|04/01/2026|valid|-|
11|ANTARA - Ekonomi|<https://www.antaranews.com/rss/ekonomi.xml>|200|04/01/2026|valid|-|
12|ANTARA - Ekonomi (Finansial)|<https://www.antaranews.com/rss/ekonomi-finansial.xml>|200|04/01/2026|valid|-|
13|ANTARA - Ekonomi (Bisnis)|<https://www.antaranews.com/rss/ekonomi-bisnis.xml>|200|04/01/2026|valid|-|
14|ANTARA - Ekonomi (Bursa)|<https://www.antaranews.com/rss/ekonomi-bursa.xml>|200|04/01/2026|valid|-|
15|ANTARA - Metro|<https://www.antaranews.com/rss/metro.xml>|200|04/01/2026|valid|-|
16|ANTARA - Metro (Kriminalitas)|<https://www.antaranews.com/rss/metro-kriminalitas.xml>|200|04/01/2026|valid|-|
17|ANTARA - Metro (Lintas Kota)|<https://www.antaranews.com/rss/metro-lintas-kota.xml>|200|04/01/2026|valid|-|
18|ANTARA - Metro (Lenggang Jakarta)|<https://www.antaranews.com/rss/metro-lenggang-jakarta.xml>|200|04/01/2026|valid|-|
19|ANTARA - Sepakbola|<https://www.antaranews.com/rss/sepakbola.xml>|200|04/01/2026|valid|-|
20|ANTARA - Sepakbola (Liga Indonesia)|<https://www.antaranews.com/rss/sepakbola-liga-indonesia.xml>|200|04/01/2026|valid|-|
21|ANTARA - Sepakbola (Internasional)|<https://www.antaranews.com/rss/sepakbola-internasional.xml>|200|04/01/2026|valid|-|
22|ANTARA - Sepakbola (Liga Inggris)|<https://www.antaranews.com/rss/sepakbola-liga-inggris-premier.xml>|200|04/01/2026|valid|-|
23|ANTARA - Sepakbola (Liga Spanyol)|<https://www.antaranews.com/rss/sepakbola-liga-spanyol.xml>|200|04/01/2026|valid|-|
24|ANTARA - Sepakbola (Liga Italia)|<https://www.antaranews.com/rss/sepakbola-liga-italia-seri-a.xml>|200|04/01/2026|valid|-|
25|ANTARA - Liga Champions|<https://www.antaranews.com/rss/sepakbola-liga-champions.xml>|200|04/01/2026|valid|-|
26|ANTARA - Olahraga|<https://www.antaranews.com/rss/olahraga.xml>|200|04/01/2026|valid|-|
27|ANTARA - Olahraga (Bulutangkis)|<https://www.antaranews.com/rss/olahraga-bulutangkis.xml>|200|04/01/2026|valid|-|
28|ANTARA - Olahraga (Bola Basket)|<https://www.antaranews.com/rss/olahraga-bola-basket.xml>|200|04/01/2026|valid|-|
29|ANTARA - Olahraga (Tenis)|<https://www.antaranews.com/rss/olahraga-tenis.xml>|200|04/01/2026|valid|-|
30|ANTARA - Olahraga (Balap)|<https://www.antaranews.com/rss/olahraga-balap.xml>|200|04/01/2026|valid|-|
31|ANTARA - Humaniora|<https://www.antaranews.com/rss/humaniora.xml>|200|04/01/2026|valid|-|
32|ANTARA - Lifestyle|<https://www.antaranews.com/rss/lifestyle.xml>|200|04/01/2026|valid|-|
33|ANTARA - Hiburan|<https://www.antaranews.com/rss/hiburan.xml>|200|04/01/2026|valid|-|
34|ANTARA - Dunia|<https://www.antaranews.com/rss/dunia.xml>|ERR (TIMEOUT)|04/01/2026|invalid|-|
35|ANTARA - Dunia (ASEAN)|<https://www.antaranews.com/rss/dunia-asean.xml>|200|04/01/2026|valid|-|
36|ANTARA - Tekno|<https://www.antaranews.com/rss/tekno.xml>|200|04/01/2026|valid|-|
37|RM.ID - Semua berita|<https://rm.id/rss-rakyat-merdeka>|200|04/01/2026|valid|-|
38|RM.ID - Nasional|<https://rm.id/rss-rakyat-merdeka/nasional>|needs check|04/01/2026|needs verification|-|
39|RM.ID - Internasional|<https://rm.id/rss-rakyat-merdeka/internasional>|200|04/01/2026|valid|-|
40|RM.ID - Ekonomi Bisnis|<https://rm.id/rss-rakyat-merdeka/ekonomi-bisnis>|403 (HTTP_403)|04/01/2026|invalid|-|
41|RM.ID - Bank & Finance|<https://rm.id/rss-rakyat-merdeka/bank-finance>|needs check|04/01/2026|needs verification|-|
42|RM.ID - Indonesianomics|<https://rm.id/rss-rakyat-merdeka/indonesianomics>|needs check|04/01/2026|needs verification|-|
43|Kompas (Mainstream Daily)|<https://sindikasi.kompas.com/xml/nasional>|needs check|04/01/2026|needs verification|-|
44|Kompas Ekonomi (Economy)|<https://sindikasi.kompas.com/xml/ekonomi>|needs check|04/01/2026|needs verification|-|
45|Detikcom (Top Breaking Portal)|<https://laporan.detik.com/rss/detiknews.xml>|needs check|04/01/2026|needs verification|-|
46|Detik Finance (Finance and Economy)|<https://laporan.detik.com/rss/detikfinance.xml>|needs check|04/01/2026|needs verification|-|
47|CNBC Indonesia (Business News)|<https://www.cnbcindonesia.com/news/rss>|needs check|04/01/2026|needs verification|-|
48|CNBC Indonesia (Market/Stocks)|<https://www.cnbcindonesia.com/market/rss>|needs check|04/01/2026|needs verification|-|
49|Bisnis Indonesia (Business/Industry)|<https://www.bisnis.com/rss>|needs check|04/01/2026|needs verification|-|
50|Kontan (Investment/Finance)|<https://www.kontan.co.id/rss>|needs check|04/01/2026|needs verification|-|
51|Tempo.co (Politics and Investigations)|<https://tempo.co/rss>|404 (HTTP_404)|04/01/2026|invalid|-|
52|Liputan6 (General Portal)|<https://www.liputan6.com/rss>|needs check|04/01/2026|needs verification|-|
53|Suara (Independent News)|<https://www.suara.com/rss>|Recovered via sitemap|04/01/2026|valid|-|
54|Merdeka (Online News)|<https://www.merdeka.com/feed>|needs check|04/01/2026|needs verification|-|
55|Viva.co.id (General Breaking)|<https://www.viva.co.id/rss>|needs check|04/01/2026|needs verification|-|
56|Republika Ekonomi (Business Economy)|<https://republika.co.id/rss/ekonomi>|200|04/01/2026|valid|-|
57|Kompas - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
58|Detik - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
59|Liputan6 - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
60|Viva - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
61|Merdeka - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
62|CNBC Indonesia - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
63|Bisnis.com - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
64|Kontan - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
65|Sindo News - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
66|CNN Indonesia - Nasional Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
67|CNN Indonesia - Internasional Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
68|CNN Indonesia - Ekonomi Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
69|CNN Indonesia - Olahraga Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
70|CNN Indonesia - Teknologi Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
71|CNN Indonesia - Otomotif Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
72|CNN Indonesia - Edukasi Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
73|CNN Indonesia - Hiburan Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
74|CNN Indonesia - Gaya Hidup Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
75|MetroTV News - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
76|MetroTV News - Nasional Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
77|MetroTV News - Internasional Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
78|MetroTV News - Ekonomi Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|

### Netherlands (NL)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|NOS|<https://feeds.nos.nl/nosnieuwsalgemeen>|200|04/01/2026|valid|-|
2|NRC|<https://www.nrc.nl/rss>|200|04/01/2026|valid|-|
3|AD|<https://www.ad.nl/rss.xml>|200|04/01/2026|valid|-|
4|AD - Binnenland|<https://www.ad.nl/binnenland/rss.xml>|200|04/01/2026|valid|-|
5|AD - Buitenland|<https://www.ad.nl/buitenland/rss.xml>|200|04/01/2026|valid|-|
6|AD - Politiek|<https://www.ad.nl/politiek/rss.xml>|200|04/01/2026|valid|-|
7|AD - Sport|<https://www.ad.nl/sport/rss.xml>|200|04/01/2026|valid|-|
8|AD - Economie|<https://www.ad.nl/economie/rss.xml>|200|04/01/2026|valid|-|
9|AD - Show|<https://www.ad.nl/show/rss.xml>|200|04/01/2026|valid|-|
10|Nu|<https://www.nu.nl/rss/algemeen>|200|04/01/2026|valid|-|
11|NPO Radio 1|<https://www.npo3fm.nl/rss/>|200|04/01/2026|valid|-|
12|NOS Tech|<https://feeds.nos.nl/nosnieuwstech>|200|04/01/2026|valid|-|
13|NRC|<https://www.nrc.nl/nieuws/rss/>|200|04/01/2026|valid|-|
14|Nieuwsuur|<https://feeds.nos.nl/nieuwsuuralgemeen>|200|04/01/2026|valid|-|
15|RTL|<https://www.rtlnieuws.nl/nieuws/rss.xml>|200|04/01/2026|valid|-|
16|NRC|<https://www.nrc.nl/rss/>|200|04/01/2026|valid|-|
17|NOS Nieuws - Binnenland|<https://feeds.nos.nl/nosnieuwsbinnenland>|200|04/01/2026|valid|-|
18|NOS Nieuws - Buitenland|<https://feeds.nos.nl/nosnieuwsbuitenland>|200|04/01/2026|valid|-|
19|NOS Nieuws - Politiek|<https://feeds.nos.nl/nosnieuwspolitiek>|200|04/01/2026|valid|-|
20|NOS Nieuws - Economie|<https://feeds.nos.nl/nosnieuwseconomie>|200|04/01/2026|valid|-|
21|NOS Nieuws - Opmerkelijk|<https://feeds.nos.nl/nosnieuwsopmerkelijk>|200|04/01/2026|valid|-|
22|NOS Nieuws - Koningshuis|<https://feeds.nos.nl/nosnieuwskoningshuis>|200|04/01/2026|valid|-|
23|NOS Nieuws - Cultuur & media|<https://feeds.nos.nl/nosnieuwscultuurenmedia>|200|04/01/2026|valid|-|
24|NOS Sport - Algemeen|<https://feeds.nos.nl/nossportalgemeen>|200|04/01/2026|valid|-|
25|NOS Sport - Voetbal|<https://feeds.nos.nl/nosvoetbal>|200|04/01/2026|valid|-|
26|NOS Sport - Wielrennen|<https://feeds.nos.nl/nossportwielrennen>|200|04/01/2026|valid|-|
27|NOS Sport - Schaatsen|<https://feeds.nos.nl/nossportschaatsen>|200|04/01/2026|valid|-|
28|NOS Sport - Tennis|<https://feeds.nos.nl/nossporttennis>|200|04/01/2026|valid|-|
29|NOS Sport - Formule 1|<https://feeds.nos.nl/nossportformule1>|200|04/01/2026|valid|-|
30|NOS op 3|<https://feeds.nos.nl/nosop3>|200|04/01/2026|valid|-|
31|NOS Jeugdjournaal|<https://feeds.nos.nl/jeugdjournaal>|200|04/01/2026|valid|-|
32|De Telegraaf|<https://www.telegraaf.nl/rss>|200|04/01/2026|valid|-|
33|de Volkskrant|<https://www.volkskrant.nl/voorpagina/rss.xml>|200|04/01/2026|valid|-|
34|de Volkskrant - Binnenland|<https://www.volkskrant.nl/binnenland/rss.xml>|200|04/01/2026|valid|-|
35|de Volkskrant - Buitenland|<https://www.volkskrant.nl/buitenland/rss.xml>|200|04/01/2026|valid|-|
36|de Volkskrant - Politiek|<https://www.volkskrant.nl/politiek/rss.xml>|200|04/01/2026|valid|-|
37|de Volkskrant - Sport|<https://www.volkskrant.nl/sport/rss.xml>|200|04/01/2026|valid|-|
38|de Volkskrant - Economie|<https://www.volkskrant.nl/economie/rss.xml>|200|04/01/2026|valid|-|
39|de Volkskrant - Cultuur & Media|<https://www.volkskrant.nl/cultuur-media/rss.xml>|200|04/01/2026|valid|-|
40|Trouw|<https://www.trouw.nl/voorpagina/rss.xml>|200|04/01/2026|valid|-|
41|Trouw - Binnenland|<https://www.trouw.nl/binnenland/rss.xml>|200|04/01/2026|valid|-|
42|Trouw - Buitenland|<https://www.trouw.nl/buitenland/rss.xml>|200|04/01/2026|valid|-|
43|Trouw - Politiek|<https://www.trouw.nl/politiek/rss.xml>|200|04/01/2026|valid|-|
44|Trouw - Sport|<https://www.trouw.nl/sport/rss.xml>|200|04/01/2026|valid|-|
45|Trouw - Economie|<https://www.trouw.nl/economie/rss.xml>|200|04/01/2026|valid|-|
46|Trouw - Cultuur & Media|<https://www.trouw.nl/cultuur-media/rss.xml>|200|04/01/2026|valid|-|
47|Het Parool|<https://www.parool.nl/voorpagina/rss.xml>|200|04/01/2026|valid|-|
48|Het Parool - Binnenland|<https://www.parool.nl/binnenland/rss.xml>|200|04/01/2026|valid|-|
49|Het Parool - Buitenland|<https://www.parool.nl/buitenland/rss.xml>|200|04/01/2026|valid|-|
50|Het Parool - Politiek|<https://www.parool.nl/politiek/rss.xml>|200|04/01/2026|valid|-|
51|Het Parool - Sport|<https://www.parool.nl/sport/rss.xml>|200|04/01/2026|valid|-|
52|Het Parool - Economie|<https://www.parool.nl/economie/rss.xml>|200|04/01/2026|valid|-|
53|Het Financieele Dagblad (FD)|<https://fd.nl/?rss>|200|04/01/2026|valid|-|
54|Tweakers (Mixed)|<https://tweakers.net/feeds/mixed.xml>|200|04/01/2026|valid|-|
55|BNR Nieuwsradio (Economie)|<https://www.bnr.nl/rss/economie>|needs check|04/01/2026|needs verification|-|
56|Telegraaf (Financieel)|<https://www.telegraaf.nl/rss/financieel>|needs check|04/01/2026|needs verification|-|
57|RTL Z (Business)|<https://www.rtlnieuws.nl/economie/rss.xml>|Recovered via sitemap|04/01/2026|valid|-|
58|Nu.nl|<https://www.nu.nl/rss/Algemeen>|200|04/01/2026|valid|-|
59|NU.nl Binnenland|<https://www.nu.nl/rss/Binnenland>|200|04/01/2026|valid|-|
60|NU.nl Buitenland|<https://www.nu.nl/rss/Buitenland>|200|04/01/2026|valid|-|
61|NU.nl Politiek|<https://www.nu.nl/rss/Politiek>|200|04/01/2026|valid|-|
62|NU.nl Sport|<https://www.nu.nl/rss/Sport>|200|04/01/2026|valid|-|
63|Tweakers|<https://tweakers.net/feeds/nieuws.xml>|needs check|04/01/2026|needs verification|-|
64|NU.nl Economie (Portal Economy)|<https://www.nu.nl/rss/Economie>|200|04/01/2026|valid|-|
65|RTL Nieuws (General Breaking)|<https://www.rtlnieuws.nl/rss.xml>|200|04/01/2026|valid|-|
66|FOK! (News/Community)|<https://frontpage.fok.nl/xml/rss>|needs check|04/01/2026|needs verification|-|
67|IEX.nl (Stocks/Investments)|<https://www.iex.nl/rss/nieuws.xml>|needs check|04/01/2026|needs verification|-|
68|De Correspondent (In-Depth Analysis)|<https://decorrespondent.nl/feed>|needs check|04/01/2026|needs verification|-|
69|AG Connect (IT/Industry Trends)|<https://www.agconnect.nl/rss>|needs check|04/01/2026|needs verification|-|
70|Omroep Brabant|<https://www.omroepbrabant.nl/rss>|200|04/01/2026|valid|-|
71|Oost - Index|<https://www.oost.nl/rss/index.xml>|200|04/01/2026|valid|-|
72|Rijnmond - Index|<https://www.rijnmond.nl/rss/index.xml>|200|04/01/2026|valid|-|
73|Omroep West - Index|<https://www.omroepwest.nl/rss/index.xml>|200|04/01/2026|valid|-|
74|Omroep West - Den Haag|<https://www.omroepwest.nl/rss/denhaag.xml>|200|04/01/2026|valid|-|
75|Omroep West - Sport|<https://www.omroepwest.nl/rss/sport.xml>|200|04/01/2026|valid|-|
76|RTV Utrecht - Nieuws|<https://www.rtvutrecht.nl/rss/nieuws.xml>|200|04/01/2026|valid|-|
77|GLD - Index|<https://www.gld.nl/rss/index.xml>|200|04/01/2026|valid|-|
78|GLD - Arnhem|<https://www.gld.nl/rss/arnhem.xml>|200|04/01/2026|valid|-|
79|GLD - Nijmegen|<https://www.gld.nl/rss/nijmegen.xml>|200|04/01/2026|valid|-|
80|GLD - Achterhoek|<https://www.gld.nl/rss/achterhoek.xml>|200|04/01/2026|valid|-|
81|GLD - Economie|<https://www.gld.nl/rss/economie.xml>|200|04/01/2026|valid|-|
82|RTV Drenthe - Home|<https://www.rtvdrenthe.nl/rss/home>|200|04/01/2026|valid|-|
83|RTV Noord - Index|<https://www.rtvnoord.nl/rss/index.xml>|200|04/01/2026|valid|-|
84|L1 Nieuws - Home|<https://www.l1nieuws.nl/rss/home>|200|04/01/2026|valid|-|
85|Omroep Zeeland - Index|<https://www.omroepzeeland.nl/rss/index.xml>|200|04/01/2026|valid|-|
86|NU.nl - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
87|NOS - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
88|AD - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
89|NRC - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
90|AT5 - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
91|NH Nieuws - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
92|Hart van Nederland - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
93|Hart van Nederland - Economie Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
94|Hart van Nederland - Politiek Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
95|Hart van Nederland - Weer Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
96|Hart van Nederland - Milieu & Gezondheid Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
97|De Telegraaf - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
98|FD - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
99|FD - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
100|Oost - Binnenland|<https://www.oost.nl/rss/binnenland.xml>|200|04/01/2026|valid|-|
101|Oost - Overijssel|<https://www.oost.nl/rss/overijssel.xml>|200|04/01/2026|valid|-|
102|Oost - Sport|<https://www.oost.nl/rss/sport.xml>|200|04/01/2026|valid|-|
103|RTV Noord - Groningen|<https://www.rtvnoord.nl/rss/groningen.xml>|200|04/01/2026|valid|-|
104|RTV Noord - Sport|<https://www.rtvnoord.nl/rss/sport.xml>|200|04/01/2026|valid|-|
105|L1 Nieuws - Limburg|<https://www.l1nieuws.nl/rss/limburg>|200|04/01/2026|valid|-|
106|Omroep Zeeland - Nieuws|<https://www.omroepzeeland.nl/rss/nieuws.xml>|200|04/01/2026|valid|-|
107|RTV Utrecht - Sport|<https://www.rtvutrecht.nl/rss/sport.xml>|200|04/01/2026|valid|-|
108|RTV Utrecht - Utrecht Stad|<https://www.rtvutrecht.nl/rss/utrecht-stad.xml>|200|04/01/2026|valid|-|
109|Rijnmond - Rotterdam|<https://www.rijnmond.nl/rss/rotterdam.xml>|200|04/01/2026|valid|-|
110|RTV Drenthe - Nieuws|<https://www.rtvdrenthe.nl/rss/nieuws>|200|04/01/2026|valid|-|
111|BNR - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
112|BNR - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
113|Omrop Fryslan - NL Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
114|Rijnmond - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
115|WNL - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
116|BNNVARA|<https://www.bnnvara.nl/api/rss/bnnvara>|200|04/01/2026|valid|-|
117|Joop|<https://www.bnnvara.nl/api/rss/joop>|200|04/01/2026|valid|-|
118|Zembla|<https://www.bnnvara.nl/api/rss/zembla>|200|04/01/2026|valid|-|
119|Omrop Fryslan - Nieuws RSS|<https://www.omropfryslan.nl/rss/nieuws>|200|04/01/2026|valid|-|
120|Sleutelstad|<https://sleutelstad.nl/feed/>|200|04/01/2026|valid|-|
121|Unity.NU|<https://unity.nu/feed/>|200|04/01/2026|valid|-|
122|Omroep Delft|<https://omroepdelft.nl/feed/>|200|04/01/2026|valid|-|
123|Open Rotterdam|<https://openrotterdam.nl/feed/>|200|04/01/2026|valid|-|
124|WEEFF|<https://www.weeff.nl/feed/>|200|04/01/2026|valid|-|
125|Omroep Tilburg|<https://www.omroeptilburg.nl/feed/>|200|04/01/2026|valid|-|
126|Omroep Almere|<https://www.omroepalmere.nl/feed/>|200|04/01/2026|valid|-|
127|LC|<https://lc.nl/api/feed/rss>|200|04/01/2026|valid|-|
128|DVHN|<https://dvhn.nl/api/feed/rss>|200|04/01/2026|valid|-|
129|L1 Nieuws - Index|<https://www.l1nieuws.nl/rss/index.xml>|200|04/01/2026|valid|-|
130|L1 Nieuws - Sport|<https://www.l1nieuws.nl/rss/sport.xml>|200|04/01/2026|valid|-|
131|RTV Focus Zwolle|<https://www.rtvfocuszwolle.nl/feed/>|200|04/01/2026|valid|-|
132|Salland1|<https://www.salland1.nl/feed/>|200|04/01/2026|valid|-|
133|RTV NOF|<https://www.rtvnof.nl/feed/>|200|04/01/2026|valid|-|
134|1Zwolle|<https://1zwolle.nl/feed>|200|04/01/2026|valid|-|
135|Dordt Centraal|<https://dordtcentraal.nl/feed/>|200|04/01/2026|valid|-|
136|RTV Papendrecht|<https://www.rtvpapendrecht.nl/feed/>|200|04/01/2026|valid|-|
137|De Westkrant|<https://www.dewestkrant.nl/feed/>|200|04/01/2026|valid|-|
138|PZC - Nieuws|<https://www.pzc.nl/nieuws/rss.xml>|200|04/01/2026|valid|-|
139|PZC - Sport|<https://www.pzc.nl/sport/rss.xml>|200|04/01/2026|valid|-|
140|PZC - Show|<https://www.pzc.nl/show/rss.xml>|200|04/01/2026|valid|-|
141|PZC - Economie|<https://www.pzc.nl/economie/rss.xml>|200|04/01/2026|valid|-|
142|PZC - Binnenland|<https://www.pzc.nl/binnenland/rss.xml>|200|04/01/2026|valid|-|
143|Tubantia - Nieuws|<https://www.tubantia.nl/nieuws/rss.xml>|200|04/01/2026|valid|-|
144|Tubantia - Sport|<https://www.tubantia.nl/sport/rss.xml>|200|04/01/2026|valid|-|
145|Tubantia - Show|<https://www.tubantia.nl/show/rss.xml>|200|04/01/2026|valid|-|
146|Tubantia - Economie|<https://www.tubantia.nl/economie/rss.xml>|200|04/01/2026|valid|-|
147|De Stentor - Nieuws|<https://www.destentor.nl/nieuws/rss.xml>|200|04/01/2026|valid|-|
148|De Stentor - Sport|<https://www.destentor.nl/sport/rss.xml>|200|04/01/2026|valid|-|
149|De Stentor - Show|<https://www.destentor.nl/show/rss.xml>|200|04/01/2026|valid|-|
150|De Stentor - Economie|<https://www.destentor.nl/economie/rss.xml>|200|04/01/2026|valid|-|
151|De Gelderlander - Nieuws|<https://www.gelderlander.nl/nieuws/rss.xml>|200|04/01/2026|valid|-|
152|De Gelderlander - Sport|<https://www.gelderlander.nl/sport/rss.xml>|200|04/01/2026|valid|-|
153|De Gelderlander - Show|<https://www.gelderlander.nl/show/rss.xml>|200|04/01/2026|valid|-|
154|De Gelderlander - Economie|<https://www.gelderlander.nl/economie/rss.xml>|200|04/01/2026|valid|-|
155|De Gelderlander - Binnenland|<https://www.gelderlander.nl/binnenland/rss.xml>|200|04/01/2026|valid|-|
156|Brabants Dagblad - Nieuws|<https://www.bd.nl/nieuws/rss.xml>|200|04/01/2026|valid|-|
157|Brabants Dagblad - Sport|<https://www.bd.nl/sport/rss.xml>|200|04/01/2026|valid|-|
158|Brabants Dagblad - Show|<https://www.bd.nl/show/rss.xml>|200|04/01/2026|valid|-|
159|Brabants Dagblad - Economie|<https://www.bd.nl/economie/rss.xml>|200|04/01/2026|valid|-|
160|Eindhovens Dagblad - Nieuws|<https://www.ed.nl/nieuws/rss.xml>|200|04/01/2026|valid|-|
161|Eindhovens Dagblad - Sport|<https://www.ed.nl/sport/rss.xml>|200|04/01/2026|valid|-|
162|Eindhovens Dagblad - Economie|<https://www.ed.nl/economie/rss.xml>|200|04/01/2026|valid|-|
163|Eindhovens Dagblad - Show|<https://www.ed.nl/show/rss.xml>|200|04/01/2026|valid|-|
164|Eindhovens Dagblad - Binnenland|<https://www.ed.nl/binnenland/rss.xml>|200|04/01/2026|valid|-|
165|BN DeStem - Nieuws|<https://www.bndestem.nl/nieuws/rss.xml>|200|04/01/2026|valid|-|
166|BN DeStem - Sport|<https://www.bndestem.nl/sport/rss.xml>|200|04/01/2026|valid|-|
167|BN DeStem - Show|<https://www.bndestem.nl/show/rss.xml>|200|04/01/2026|valid|-|
168|BN DeStem - Economie|<https://www.bndestem.nl/economie/rss.xml>|200|04/01/2026|valid|-|

### Switzerland (CH)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Le Temps Economy|<https://www.letemps.ch/economie.rss>|200|04/01/2026|valid|-|
2|NZZ|<https://www.nzz.ch/startseite.rss>|200|04/01/2026|valid|-|
3|NDR|<https://www.ndr.ch/rss/>|needs check|04/01/2026|needs verification|-|
4|SRF News (Latest)|<https://www.srf.ch/news/bnf/rss/19032223>|200|04/01/2026|valid|-|
5|SRF News (Switzerland)|<https://www.srf.ch/news/bnf/rss/1890>|200|04/01/2026|valid|-|
6|SRF News (International)|<https://www.srf.ch/news/bnf/rss/1922>|200|04/01/2026|valid|-|
7|SRF News (Economy)|<https://www.srf.ch/news/bnf/rss/1926>|200|04/01/2026|valid|-|
8|SRF Sport (Football)|<https://www.srf.ch/sport/bnf/rss/2562>|200|04/01/2026|valid|-|
9|SRF Sport (Ice Hockey)|<https://www.srf.ch/sport/bnf/rss/3418>|200|04/01/2026|valid|-|
10|SRF Sport (Tennis)|<https://www.srf.ch/sport/bnf/rss/2814>|200|04/01/2026|valid|-|
11|SRF Sport (Alpine Skiing)|<https://www.srf.ch/sport/bnf/rss/787950>|200|04/01/2026|valid|-|
12|SRF Wissen (Health)|<https://www.srf.ch/bnf/rss/19919909>|200|04/01/2026|valid|-|
13|SRF Wissen (Tech)|<https://www.srf.ch/bnf/rss/19920122>|200|04/01/2026|valid|-|
14|Blick (Schweiz)|<https://www.blick.ch/schweiz/rss.xml>|403 (HTTP_403)|04/01/2026|invalid|-|
15|Blick (Ausland)|<https://www.blick.ch/ausland/rss.xml>|403 (HTTP_403)|04/01/2026|invalid|-|
16|Blick (Wirtschaft)|<https://www.blick.ch/wirtschaft/rss.xml>|403 (HTTP_403)|04/01/2026|invalid|-|
17|Blick (Politik)|<https://www.blick.ch/politik/rss.xml>|403 (HTTP_403)|04/01/2026|invalid|-|
18|Blick (Sport)|<https://www.blick.ch/sport/rss.xml>|403 (HTTP_403)|04/01/2026|invalid|-|
19|Blick Sport (Fussball)|<https://www.blick.ch/sport/fussball/rss.xml>|403 (HTTP_403)|04/01/2026|invalid|-|
20|Blick Sport (Eishockey)|<https://www.blick.ch/sport/eishockey/rss.xml>|403 (HTTP_403)|04/01/2026|invalid|-|
21|Blick Sport (Ski)|<https://www.blick.ch/sport/ski/rss.xml>|403 (HTTP_403)|04/01/2026|invalid|-|
22|Blick Sport (Tennis)|<https://www.blick.ch/sport/tennis/rss.xml>|403 (HTTP_403)|04/01/2026|invalid|-|
23|Blick (Digital)|<https://www.blick.ch/digital/rss.xml>|needs check|04/01/2026|needs verification|-|
24|Le News (EN)|<https://lenews.ch/feed>|200|04/01/2026|valid|-|
25|The Local Switzerland (EN)|<https://feeds.thelocal.com/rss/ch>|200|04/01/2026|valid|-|
26|NZZ (Latest)|<https://www.nzz.ch/recent.rss>|200|04/01/2026|valid|-|
27|Tages-Anzeiger|<https://partner-feeds.publishing.tamedia.ch/rss/tagesanzeiger/>|200|04/01/2026|valid|-|
28|Swissinfo (Business - EN)|<https://www.swissinfo.ch/eng/business/feed>|needs check|04/01/2026|needs verification|-|
29|Swissinfo EN - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
30|Swissinfo DE - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
31|Swissinfo FR - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
32|Swissinfo IT - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
33|Swissinfo ES - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
34|Finews.ch (Swiss Finance)|<https://www.finews.ch/news/finanzplatz?format=feed&type=rss>|200|04/01/2026|valid|-|
35|20 Minuten (Wirtschaft)|<https://www.20min.ch/rss/wirtschaft>|needs check|04/01/2026|needs verification|-|
36|Le Temps|<https://www.letemps.ch/rss>|needs check|04/01/2026|needs verification|-|
37|Finanz und Wirtschaft|<https://www.fuw.ch/feed>|needs check|04/01/2026|needs verification|-|
38|NZZ Wirtschaft (Economy - German)|<https://www.nzz.ch/wirtschaft.rss>|200|04/01/2026|valid|-|
39|Tages-Anzeiger (Zurich Headlines - German)|<https://www.tagesanzeiger.ch/rss.xml>|needs check|04/01/2026|needs verification|-|
40|Blick (Swiss #1 Popular Daily - German)|<https://www.blick.ch/rss.xml>|403 (HTTP_403)|04/01/2026|invalid|-|
41|Blick - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
42|Blick FR - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
43|Blick - Article Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
44|Blick FR - Article Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
45|Handelszeitung (Economy Weekly - German)|<https://www.handelszeitung.ch/rss.xml>|needs check|04/01/2026|needs verification|-|
46|Cash.ch (Finance/Investment - German)|<https://www.cash.ch/rss>|needs check|04/01/2026|needs verification|-|
47|RTS Info (French-speaking public broadcaster Breaking - French)|<https://www.rts.ch/info/rss>|needs check|04/01/2026|needs verification|-|
48|Le Temps Suisse (Domestic - French)|<https://www.letemps.ch/suisse.rss>|200|04/01/2026|valid|-|
49|Bilan.ch (Economy - French)|<https://www.bilan.ch/rss.xml>|needs check|04/01/2026|needs verification|-|
50|20 Minuten Schweiz (Domestic - German)|<https://www.20min.ch/rss/schweiz>|needs check|04/01/2026|needs verification|-|
51|Watson.ch (News Portal - German)|<https://www.watson.ch/api/rss>|needs check|04/01/2026|needs verification|-|
52|Watson - Google Sitemap DE|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
53|Watson - Google Sitemap FR|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
54|Aargauer Zeitung (Regional Major Daily - German)|<https://www.aargauerzeitung.ch/rss>|needs check|04/01/2026|needs verification|-|
55|Berner Zeitung (Bern Major Daily - German)|<https://www.bernerzeitung.ch/rss.xml>|needs check|04/01/2026|needs verification|-|
56|Basler Zeitung (Basel Major Daily - German)|<https://www.bazonline.ch/rss.xml>|needs check|04/01/2026|needs verification|-|
57|Le Matin|<https://www.lematin.ch/rss.xml>|needs check|04/01/2026|needs verification|-|
58|Nau.ch - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
59|Blue News (German)|<https://www.bluewin.ch/de/feed.xml>|200|04/01/2026|valid|-|
60|Blue News (French)|<https://www.bluewin.ch/fr/feed.xml>|200|04/01/2026|valid|-|
61|Blue News (Italian)|<https://www.bluewin.ch/it/feed.xml>|200|04/01/2026|valid|-|
62|Blue News (English)|<https://www.bluewin.ch/en/feed.xml>|200|04/01/2026|valid|-|
63|20 Minuten - Articles Sitemap (German)|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
64|20 Minuten - News Sitemap (German)|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
65|20 Minutes - Articles Sitemap (French)|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
66|20 Minutes - News Sitemap (French)|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
67|Le Matin - Articles Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
68|RSI - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
69|Corriere del Ticino - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
70|Ticinonline - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
71|laRegione - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
72|zentralplus - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
73|Bote der Urschweiz - Articles Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
74|Cash.ch - Articles Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
75|Handelszeitung - Articles Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
76|Bilanz|<https://www.bilanz.ch/rss.xml>|200|04/01/2026|valid|-|
77|Inside Paradeplatz|<https://insideparadeplatz.ch/feed/>|200|04/01/2026|valid|-|
78|Moneycab|<https://www.moneycab.com/feed/>|200|04/01/2026|valid|-|
79|persoenlich.com|<https://www.persoenlich.com/rss/news.xml>|200|04/01/2026|valid|-|
80|LFM la radio|<https://www.lfm.ch/feed/>|200|04/01/2026|valid|-|
81|Radio Lac|<https://www.radiolac.ch/feed/>|200|04/01/2026|valid|-|
82|Frapp - French Articles Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
83|TeleZuri - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
84|TeleBarn - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
85|TeleM1 - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
86|Tele1 - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
87|NZZ Sport|<https://www.nzz.ch/sport.rss>|200|04/01/2026|valid|-|
88|NZZ Wissenschaft|<https://www.nzz.ch/wissenschaft.rss>|200|04/01/2026|valid|-|
89|NZZ Feuilleton|<https://www.nzz.ch/feuilleton.rss>|200|04/01/2026|valid|-|
90|Le Temps Articles|<https://www.letemps.ch/articles.rss>|200|04/01/2026|valid|-|
91|Le Temps Monde|<https://www.letemps.ch/monde.rss>|200|04/01/2026|valid|-|
92|Le Temps Societe|<https://www.letemps.ch/societe.rss>|200|04/01/2026|valid|-|
93|Le Temps Sport|<https://www.letemps.ch/sport.rss>|200|04/01/2026|valid|-|
94|Le Temps Culture|<https://www.letemps.ch/culture.rss>|200|04/01/2026|valid|-|
95|Le Temps Sciences|<https://www.letemps.ch/sciences.rss>|200|04/01/2026|valid|-|
96|Le Temps Opinions|<https://www.letemps.ch/opinions.rss>|200|04/01/2026|valid|-|
97|Tribune de Geneve|<https://www.tdg.ch/rss.xml>|needs check|04/01/2026|needs verification|-|
98|SRF - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
99|Watson - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
100|24 heures - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
101|Berner Zeitung - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
102|Basler Zeitung - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
103|Tribune de Geneve - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|

### Turkey (TR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Hurriyet|<https://www.hurriyet.com.tr/rss/anasayfa>|needs check|04/01/2026|needs verification|-|
2|Sabah|<https://www.sabah.com.tr/rss/sondakika.xml>|200|04/01/2026|valid|-|
3|Haberturk|<https://www.haberturk.com/rss>|200|04/01/2026|valid|-|
4|Cumhuriyet|<https://www.cumhuriyet.com.tr/Rss/>|200|04/01/2026|valid|-|
5|Aksam|<https://www.aksam.com.tr/rss>|200|04/01/2026|valid|-|
6|Takvim|<https://www.takvim.com.tr/rss/feed>|needs check|04/01/2026|needs verification|-|
7|Cumhuriyet|<https://www.cumhuriyet.com.tr/RSS>|200|04/01/2026|valid|-|
8|HuffPost Turkey|<https://www.hurriyetdailynews.com/rss>|needs check|04/01/2026|needs verification|-|
9|Haber Turk|<https://www.haberturk.com/rss/>|200|04/01/2026|valid|-|
10|Hurriyet (Anasayfa)|<http://www.hurriyet.com.tr/rss/anasayfa>|200|04/01/2026|valid|-|
11|Hurriyet (Gundem)|<http://www.hurriyet.com.tr/rss/gundem>|200|04/01/2026|valid|-|
12|Hurriyet (Ekonomi)|<http://www.hurriyet.com.tr/rss/ekonomi>|200|04/01/2026|valid|-|
13|Hurriyet (Magazin)|<http://www.hurriyet.com.tr/rss/magazin>|200|04/01/2026|valid|-|
14|Hurriyet (Spor)|<http://www.hurriyet.com.tr/rss/spor>|200|04/01/2026|valid|-|
15|Hurriyet (Dunya)|<http://www.hurriyet.com.tr/rss/dunya>|200|04/01/2026|valid|-|
16|Hurriyet (Teknoloji)|<http://www.hurriyet.com.tr/rss/teknoloji>|200|04/01/2026|valid|-|
17|Hurriyet (Saglk)|<http://www.hurriyet.com.tr/rss/saglik>|200 (HTML_RETURNED)|04/01/2026|invalid|-|
18|Hurriyet (Astroloji)|<http://www.hurriyet.com.tr/rss/astroloji>|200|04/01/2026|valid|-|
19|Sabah (Anasayfa)|<https://www.sabah.com.tr/rss/anasayfa.xml>|200|04/01/2026|valid|-|
20|Sabah (Ekonomi)|<https://www.sabah.com.tr/rss/ekonomi.xml>|200|04/01/2026|valid|-|
21|Sabah (Spor)|<https://www.sabah.com.tr/rss/spor.xml>|200|04/01/2026|valid|-|
22|Sabah (Gundem)|<https://www.sabah.com.tr/rss/gundem.xml>|200|04/01/2026|valid|-|
23|Sabah (Yasam)|<https://www.sabah.com.tr/rss/yasam.xml>|200|04/01/2026|valid|-|
24|Sabah (Dunya)|<https://www.sabah.com.tr/rss/dunya.xml>|200|04/01/2026|valid|-|
25|Sabah (Teknoloji)|<https://www.sabah.com.tr/rss/teknoloji.xml>|needs check|04/01/2026|needs verification|-|
26|Sabah (Turizm)|<https://www.sabah.com.tr/rss/turizm.xml>|needs check|04/01/2026|needs verification|-|
27|Sabah (Otomobil)|<https://www.sabah.com.tr/rss/otomobil.xml>|needs check|04/01/2026|needs verification|-|
28|CNN Turk (All / News)|<https://www.cnnturk.com/feed/rss/all/news>|200|04/01/2026|valid|-|
29|CNN Turk (Turkiye / News)|<https://www.cnnturk.com/feed/rss/turkiye/news>|200|04/01/2026|valid|-|
30|CNN Turk (Dunya / News)|<https://www.cnnturk.com/feed/rss/dunya/news>|200|04/01/2026|valid|-|
31|CNN Turk (Ekonomi / News)|<https://www.cnnturk.com/feed/rss/ekonomi/news>|200|04/01/2026|valid|-|
32|CNN Turk (Bilim-Teknoloji / News)|<https://www.cnnturk.com/feed/rss/bilim-teknoloji/news>|needs check|04/01/2026|needs verification|-|
33|CNN Turk (Spor / News)|<https://www.cnnturk.com/feed/rss/spor/news>|200|04/01/2026|valid|-|
34|CNN Turk (Saglk / News)|<https://www.cnnturk.com/feed/rss/saglik/news>|200|04/01/2026|valid|-|
35|TRT Haber (Son Dakika)|<http://www.trthaber.com/sondakika.rss>|200|04/01/2026|valid|-|
36|Haberturk (Main)|<http://www.haberturk.com/rss>|200|04/01/2026|valid|-|
37|Dunya (Main)|<https://www.dunya.com/rss?dunya>|200|04/01/2026|valid|-|
38|BBC Turkce|<https://feeds.bbci.co.uk/turkce/rss.xml>|200|04/01/2026|valid|-|
39|Hurriyet Ekonomi (Major Economy)|<https://www.hurriyet.com.tr/rss/ekonomi>|needs check|04/01/2026|needs verification|-|
40|Bloomberg HT (Economy and Finance)|<https://www.bloomberght.com/rss>|200|04/01/2026|valid|-|
41|Dunya (Economy Specialist)|<https://www.dunya.com/rss>|200|04/01/2026|valid|-|
42|NTV (Main Broadcaster)|<https://www.ntv.com.tr/rss>|needs check|04/01/2026|needs verification|-|
43|NTV Ekonomi (Economy)|<https://www.ntv.com.tr/ekonomi.rss>|200|04/01/2026|valid|-|
44|NTV Turkiye|<https://www.ntv.com.tr/turkiye.rss>|200|04/01/2026|valid|-|
45|NTV Gundem|<https://www.ntv.com.tr/gundem.rss>|200|04/01/2026|valid|-|
46|NTV Dunya|<https://www.ntv.com.tr/dunya.rss>|200|04/01/2026|valid|-|
47|NTV Teknoloji|<https://www.ntv.com.tr/teknoloji.rss>|200|04/01/2026|valid|-|
48|NTV Yasam|<https://www.ntv.com.tr/yasam.rss>|200|04/01/2026|valid|-|
49|Sozcu (National Daily)|<https://www.sozcu.com.tr/rss>|needs check|04/01/2026|needs verification|-|
50|Sozcu Ekonomi (Economy)|<https://www.sozcu.com.tr/kategori/ekonomi/rss>|needs check|04/01/2026|needs verification|-|
51|Haberturk Ekonomi (Portal Economy)|<https://www.haberturk.com/rss/ekonomi.xml>|200|04/01/2026|valid|-|
52|TRT Haber (Public Broadcaster Breaking)|<https://www.trthaber.com/sondakika.rss>|200|04/01/2026|valid|-|
53|Milliyet (Major Daily)|<https://www.milliyet.com.tr/rss/rssnew/sondakikarss.xml>|needs check|04/01/2026|needs verification|-|
54|Karar (Politics and Analysis)|<https://www.karar.com/rss>|200|04/01/2026|valid|-|
55|Yeni Safak (Conservative Daily)|<https://www.yenisafak.com/rss>|200|04/01/2026|valid|-|
56|Ensonhaber (General Breaking)|<https://www.ensonhaber.com/rss/ensonhaber.xml>|200|04/01/2026|valid|-|
57|Ensonhaber - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
58|T24 (Independent Digital Media)|<https://t24.com.tr/rss>|403 (HTTP_403)|04/01/2026|invalid|-|
59|T24 - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
60|Webtekno (Tech/IT)|<https://www.webtekno.com/rss.xml>|200|04/01/2026|valid|-|
61|Mynet - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
62|TRT Haber - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
63|TRT Haber - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
64|TRT Haber - March 2026 Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
65|Haber Global - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
66|Haber Global - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
67|Ahaber - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
68|TGRT Haber - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
69|Sozcu - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
70|NTV - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|

### Saudi Arabia (SA)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Okaz|<https://www.okaz.com.sa/rss/news>|needs check|04/01/2026|needs verification|-|
2|Okaz - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
3|Ajel - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
4|Al Jazirah|<https://www.aljazeera.net/rss>|200|04/01/2026|valid|-|
5|Al Madina|<https://www.al-madina.com/rssFeed/193>|200|04/01/2026|valid|-|
6|Al Madina - Main|<https://www.al-madina.com/rssFeed/0>|200|04/01/2026|valid|-|
7|Al Madina - Local|<https://www.al-madina.com/rssFeed/1>|200|04/01/2026|valid|-|
8|Al Bilad Daily|<https://albiladdaily.com/feed>|200|04/01/2026|valid|-|
9|Makkah Newspaper|<https://makkahnewspaper.com/rssFeed/0>|200|04/01/2026|valid|-|
10|Al Jazirah|<https://www.al-jazirah.com/rss/ln.xml>|200|04/01/2026|valid|-|
11|Al Arabiya (EN - Business)|<https://english.alarabiya.net/feed/business>|needs check|04/01/2026|needs verification|-|
12|Al Arabiya (EN - Middle East)|<https://english.alarabiya.net/feed/middle-east>|needs check|04/01/2026|needs verification|-|
13|Asharq Business (Bloomberg Arabic)|<https://asharqbusiness.com/feed>|needs check|04/01/2026|needs verification|-|
14|Gulf Business (Saudi Section)|<https://gulfbusiness.com/region/saudi-arabia/feed/>|needs check|04/01/2026|needs verification|-|
15|Saudi Gazette (Business)|<https://saudigazette.com.sa/rss/3>|needs check|04/01/2026|needs verification|-|
16|Zawya|<https://www.zawya.com/en/rss>|needs check|04/01/2026|needs verification|-|
17|Arab News|<https://www.arabnews.com/rss.xml>|403 (HTTP_403)|04/01/2026|invalid|-|
18|Al Eqtisadiah (Economy - Arabic)|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
19|Saudi Press Agency (Arabic)|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
20|Al Riyadh (Main - Arabic)|<https://www.alriyadh.com/rss>|needs check|04/01/2026|needs verification|-|
21|Al Arabiya (Business - Arabic)|<https://www.alarabiya.net/feed/business>|needs check|04/01/2026|needs verification|-|
22|Argaam (Arabic Economy/Stocks #1)|<https://www.argaam.com/ar/rss/news/type/1>|needs check|04/01/2026|needs verification|-|
23|Mubasher Saudi (Finance/Markets)|<https://www.mubasher.info/countries/sa/rss>|needs check|04/01/2026|needs verification|-|
24|Al Arabiya Saudi (Saudi Domestic)|<https://www.alarabiya.net/feed/saudi-today>|needs check|04/01/2026|needs verification|-|
25|Sabq (Saudi Top Online Outlet)|<https://sabq.org/feed>|needs check|04/01/2026|needs verification|-|
26|Sabq - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
27|Maaal (Saudi Business)|<https://www.maaal.com/feed>|needs check|04/01/2026|needs verification|-|
28|Al Watan (Saudi Domestic Breaking)|<https://www.alwatan.com.sa/rss>|needs check|04/01/2026|needs verification|-|
29|Sky News Arabia (Arabic Business)|<https://www.skynewsarabia.com/rss.xml>|200|04/01/2026|valid|-|
30|CNBC Arabia (Middle East Economy)|<https://www.cnbcarabia.com/RSS/117>|needs check|04/01/2026|needs verification|-|
31|Independent Arabia (Independent Arabic)|<https://www.independentarabia.com/rss.xml>|200|04/01/2026|valid|-|
32|Akhbaar24 (General Portal)|<https://akhbaar24.argaam.com/rss>|needs check|04/01/2026|needs verification|-|
33|Al Yaum (Domestic Trends)|<https://www.alyaum.com/rss>|needs check|04/01/2026|needs verification|-|
34|Zawya Arabic (Middle East Business)|<https://www.zawya.com/ar/rss>|needs check|04/01/2026|needs verification|-|
35|Saudi Gazette|<https://saudigazette.com.sa/rssFeed/0>|200|04/01/2026|valid|-|
36|Saudi Gazette - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|

### Taiwan (TW)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Liberty Times - Business|<https://news.ltn.com.tw/rss/business.xml>|403 (HTTP_403)|04/01/2026|invalid|-|
2|TechNews Taiwan|<https://technews.tw/feed/>|200|04/01/2026|valid|-|
3|CNA (Central News Agency)|<https://feeds.feedburner.com/cnaFirstNews>|200|04/01/2026|valid|-|
4|Formosa Reporter|<https://www.formosapost.com/feed/>|200|04/01/2026|valid|-|
5|CNA |<https://feeds.feedburner.com/rsscna/politics>|200|04/01/2026|valid|-|
6|CNA |<https://feeds.feedburner.com/rsscna/intworld>|200|04/01/2026|valid|-|
7|CNA |<https://feeds.feedburner.com/rsscna/mainland>|200|04/01/2026|valid|-|
8|CNA |<https://feeds.feedburner.com/rsscna/finance>|200|04/01/2026|valid|-|
9|CNA |<https://feeds.feedburner.com/rsscna/technology>|200|04/01/2026|valid|-|
10|CNA |<https://feeds.feedburner.com/rsscna/lifehealth>|200|04/01/2026|valid|-|
11|CNA |<https://feeds.feedburner.com/rsscna/social>|200|04/01/2026|valid|-|
12|CNA |<https://feeds.feedburner.com/rsscna/local>|200|04/01/2026|valid|-|
13|CNA |<https://feeds.feedburner.com/rsscna/culture>|200|04/01/2026|valid|-|
14|CNA |<https://feeds.feedburner.com/rsscna/sport>|200|04/01/2026|valid|-|
15|CNA |<https://feeds.feedburner.com/rsscna/stars>|200|04/01/2026|valid|-|
16|Liberty Times |<https://news.ltn.com.tw/rss/all.xml>|403 (HTTP_403)|04/01/2026|invalid|-|
17|Liberty Times |<https://news.ltn.com.tw/rss/politics.xml>|403 (HTTP_403)|04/01/2026|invalid|-|
18|Liberty Times |<https://news.ltn.com.tw/rss/society.xml>|403 (HTTP_403)|04/01/2026|invalid|-|
19|Liberty Times |<https://news.ltn.com.tw/rss/life.xml>|403 (HTTP_403)|04/01/2026|invalid|-|
20|Liberty Times |<https://news.ltn.com.tw/rss/opinion.xml>|200|04/01/2026|valid|-|
21|Liberty Times |<https://news.ltn.com.tw/rss/world.xml>|403 (HTTP_403)|04/01/2026|invalid|-|
22|Liberty Times |<https://news.ltn.com.tw/rss/sports.xml>|403 (HTTP_403)|04/01/2026|invalid|-|
23|Liberty Times |<https://news.ltn.com.tw/rss/entertainment.xml>|403 (HTTP_403)|04/01/2026|invalid|-|
24|Liberty Times |<https://news.ltn.com.tw/rss/art.xml>|403 (HTTP_403)|04/01/2026|invalid|-|
25|Liberty Times |<https://news.ltn.com.tw/rss/def.xml>|403 (HTTP_403)|04/01/2026|invalid|-|
26|Liberty Times |<https://news.ltn.com.tw/rss/local.xml>|403 (HTTP_403)|04/01/2026|invalid|-|
27|Liberty Times |<https://news.ltn.com.tw/rss/novelty.xml>|200|04/01/2026|valid|-|
28|Taipei Times (EN)|<https://www.taipeitimes.com/xml/index.rss>|200|04/01/2026|valid|-|
29|The Reporter|<https://www.twreporter.org/a/rss2.xml>|200|04/01/2026|valid|-|
30|Newtalk |<https://newtalk.tw/rss/all/>|200|04/01/2026|valid|-|
31|Newtalk |<https://newtalk.tw/rss/category/2>|200|04/01/2026|valid|-|
32|Youth Daily News |<https://www.ydn.com.tw/tw/Home/RSS.aspx?TID=2>|200|04/01/2026|valid|-|
33|UDN - News Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
34|ETtoday - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
35|Storm Media - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
36|Nownews - Daily News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
37|SETN - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
38|TVBS - Latest Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
39|CTWant - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
40|Business Today - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
41|EBC News - Realtime Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
42|Yahoo Taiwan - News Sitemap p0|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
43|Yahoo Taiwan - News Sitemap p1|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
44|Yahoo Taiwan - News Sitemap p2|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
45|Mirror Media - Posts News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
46|Mirror Media - Externals News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
47|PTS News|<https://news.pts.org.tw/xml/newsfeed.xml>|200|04/01/2026|valid|-|
48|CTS News - Google Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
49|People News Taiwan|<https://www.peoplenews.tw/feed>|200|04/01/2026|valid|-|

### Poland (PL)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Onet|<https://wiadomosci.onet.pl/rss>|200|04/01/2026|valid|-|
2|TVN24|<https://tvn24.pl/tvnmeteo.xml>|needs check|04/01/2026|needs verification|-|
3|Fakt|<https://www.fakt.pl/rss/>|200|04/01/2026|valid|-|
4|Wprost|<https://www.wprost.pl/rss/>|200|04/01/2026|valid|-|
5|RMF24 (Main)|<https://www.rmf24.pl/feed>|200|04/01/2026|valid|-|
6|RMF24 Fakty|<https://www.rmf24.pl/fakty/feed>|200|04/01/2026|valid|-|
7|RMF24 Polska|<https://www.rmf24.pl/fakty/polska/feed>|200|04/01/2026|valid|-|
8|RMF24 Polityka|<https://www.rmf24.pl/fakty/polityka/feed>|200|04/01/2026|valid|-|
9|RMF24 Swiat|<https://www.rmf24.pl/fakty/swiat/feed>|200|04/01/2026|valid|-|
10|RMF24 Ekonomia|<https://www.rmf24.pl/ekonomia/feed>|200|04/01/2026|valid|-|
11|RMF24 Nauka|<https://www.rmf24.pl/nauka/feed>|200|04/01/2026|valid|-|
12|RMF24 Kultura|<https://www.rmf24.pl/kultura/feed>|200|04/01/2026|valid|-|
13|RMF24 Sport|<https://www.rmf24.pl/sport/feed>|200|04/01/2026|valid|-|
14|RMF24 Ciekawostki|<https://www.rmf24.pl/rozrywka/ciekawostki/feed>|200|04/01/2026|valid|-|
15|RMF24 Komentarze|<https://www.rmf24.pl/tylko-w-rmf24/komentarze/feed>|200|04/01/2026|valid|-|
16|RMF24 Podsumowanie dnia|<https://www.rmf24.pl/fakty/podsumowanie-dnia/feed>|200|04/01/2026|valid|-|
17|RadioZet - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
18|TVP Info - Sitemap 2026|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
19|PolsatNews Wszystkie|<https://www.polsatnews.pl/rss/wszystkie.xml>|200|04/01/2026|valid|-|
20|PolsatNews Polska|<https://www.polsatnews.pl/rss/polska.xml>|200|04/01/2026|valid|-|
21|PolsatNews Swiat|<https://www.polsatnews.pl/rss/swiat.xml>|200|04/01/2026|valid|-|
22|PolsatNews Wideo|<https://www.polsatnews.pl/rss/wideo.xml>|200|04/01/2026|valid|-|
23|PolsatNews Biznes|<https://www.polsatnews.pl/rss/biznes.xml>|200|04/01/2026|valid|-|
24|PolsatNews Technologie|<https://www.polsatnews.pl/rss/technologie.xml>|200|04/01/2026|valid|-|
25|PolsatNews Moto|<https://www.polsatnews.pl/rss/moto.xml>|200|04/01/2026|valid|-|
26|PolsatNews Kultura|<https://www.polsatnews.pl/rss/kultura.xml>|200|04/01/2026|valid|-|
27|PolsatNews Sport|<https://www.polsatnews.pl/rss/sport.xml>|200|04/01/2026|valid|-|
28|PolsatNews Czysta Polska|<https://www.polsatnews.pl/rss/czysta-polska.xml>|200|04/01/2026|valid|-|
29|Nauka w Polsce (All)|<https://naukawpolsce.pl/all/rss.xml>|200|04/01/2026|valid|-|
30|Nauka w Polsce (Science categories)|<https://naukawpolsce.pl/naukowy/rss.xml>|200|04/01/2026|valid|-|
31|Nauka w Polsce (Technologia)|<https://naukawpolsce.pl/technologia/rss.xml>|200|04/01/2026|valid|-|
32|Nauka w Polsce (Blog)|<https://naukawpolsce.pl/blog/rss.xml>|200|04/01/2026|valid|-|
33|PAP MediaRoom (All)|<https://pap-mediaroom.pl/rss.xml>|200|04/01/2026|valid|-|
34|PAP MediaRoom (Biznes i finanse)|<https://pap-mediaroom.pl/kategoria/biznes-i-finanse/rss.xml>|200|04/01/2026|valid|-|
35|PAP MediaRoom (Nauka i technologie)|<https://pap-mediaroom.pl/kategoria/nauka-i-technologie/rss.xml>|200|04/01/2026|valid|-|
36|PAP MediaRoom (Kalendarium)|<https://pap-mediaroom.pl/kalendarium/rss.xml>|200|04/01/2026|valid|-|
37|Onet Wiadomosci (Top Portal News)|<https://wiadomosci.onet.pl/.feed>|200|04/01/2026|valid|-|
38|TVN24 Najnowsze (TVN24 News)|<https://tvn24.pl/najnowsze.xml>|200|04/01/2026|valid|-|
39|TVN24 Biznes (TVN24 Business)|<https://tvn24.pl/biznes.xml>|needs check|04/01/2026|needs verification|-|
40|Money.pl (Polish Economy Portal #1)|<https://www.money.pl/rss/>|200|04/01/2026|valid|-|
41|Bankier.pl (Finance/Investing)|<https://www.bankier.pl/rss/wiadomosci.xml>|200|04/01/2026|valid|-|
42|Wprost (Politics/Current Affairs)|<https://www.wprost.pl/rss>|200|04/01/2026|valid|-|
43|Rzeczpospolita (Economy/Politics)|<https://www.rp.pl/rss/all>|needs check|04/01/2026|needs verification|-|
44|Gazeta.pl (Top Portal News)|<https://rss.gazeta.pl/pub/rss/wiadomosci.xml>|200|04/01/2026|valid|-|
45|Interia - Wydarzenia|<https://wydarzenia.interia.pl/feed>|200|04/01/2026|valid|-|
46|Interia - Biznes|<https://biznes.interia.pl/feed>|200|04/01/2026|valid|-|
47|Interia - Sport|<https://sport.interia.pl/feed>|200|04/01/2026|valid|-|
48|Business Insider Polska|<https://businessinsider.com.pl/.feed>|200|04/01/2026|valid|-|
49|Forsal|<https://forsal.pl/.feed>|200|04/01/2026|valid|-|
50|DoRzeczy|<https://dorzeczy.pl/feed>|200|04/01/2026|valid|-|
51|Wiadomosci WP (Wirtualna Polska News)|<https://wiadomosci.wp.pl/rss.xml>|200|04/01/2026|valid|-|
52|Dziennik Gazeta Prawna (Business/Legal)|<https://www.gazetaprawna.pl/rss.xml>|needs check|04/01/2026|needs verification|-|
53|Rzeczpospolita - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
54|Rzeczpospolita - RSS Main|<https://www.rp.pl/rss_main>|200|04/01/2026|valid|-|
55|Wyborcza - Najnowsze|<https://wyborcza.pl/pub/rss/najnowsze_wyborcza.xml>|200|04/01/2026|valid|-|
56|Wiadomosci WP - Aktualnosci|<https://wiadomosci.wp.pl/rss/aktualnosci>|200|04/01/2026|valid|-|
57|PolskieRadio24 - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
58|SE.pl - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
59|PolsatNews - Sitemap 0|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
60|PolsatNews - Sitemap 1|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
61|SE.pl - March 2026 Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|

### Sweden (SE)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Dagens Nyheter|<https://www.dn.se/nyheter/rss/>|200|04/01/2026|valid|-|
2|Dagens Industri|<https://www.di.se/rss/>|200|04/01/2026|valid|-|
3|SVT Nyheter|<https://www.svt.se/nyheter/rss.xml>|200|04/01/2026|valid|-|
4|Goteborgs-Posten|<https://www.gp.se/rss>|200|04/01/2026|valid|-|
5|Sveriges Television|<https://www.svt.se/nyheter/ekonomi/rss.xml>|200|04/01/2026|valid|-|
6|Svt|<https://www.svt.se/nyheter/rss.xml?sectionId=2>|200|04/01/2026|valid|-|
7|Dagens Nyheter Sport|<https://www.dn.se/sport/rss>|200|04/01/2026|valid|-|
8|Dagens Nyheter Business|<https://www.dn.se/ekonomi/rss>|200|04/01/2026|valid|-|
9|Norran|<https://www.norran.se/rss>|200|04/01/2026|valid|-|
10|Aftonbladet - Nyheter (All)|<https://rss.aftonbladet.se/rss2/small/pages/sections/senastenytt/>|200|04/01/2026|valid|-|
11|Aftonbladet - 48h Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
12|Aftonbladet - Sportbladet|<https://rss.aftonbladet.se/rss2/small/pages/sections/senastenytt/sport/>|200|04/01/2026|valid|-|
13|Aftonbladet - Sportbladet Fotboll|<https://rss.aftonbladet.se/rss2/small/pages/sections/sportbladet/fotboll/>|200|04/01/2026|valid|-|
14|Aftonbladet - Sportbladet Hockey|<https://rss.aftonbladet.se/rss2/small/pages/sections/sportbladet/hockey/>|200|04/01/2026|valid|-|
15|Aftonbladet - Nojesbladet|<https://rss.aftonbladet.se/rss2/small/pages/sections/nojesbladet/>|200|04/01/2026|valid|-|
16|Aftonbladet - Kultur|<https://rss.aftonbladet.se/rss2/small/pages/sections/kultur/>|200|04/01/2026|valid|-|
17|Expressen - Nyheter|<https://feeds.expressen.se/nyheter/>|200|04/01/2026|valid|-|
18|Expressen - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
19|GT - Nyheter|<https://feeds.expressen.se/gt/>|200|04/01/2026|valid|-|
20|Svenska Dagbladet - Frontpage|<https://www.svd.se/?service=rss>|200|04/01/2026|valid|-|
21|Svenska Dagbladet - 48h Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
22|TV4 - Article Sitemap 2026-3|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
23|TV4 - Breaking News Sitemap 2026-3|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
24|The Local Sweden (EN)|<https://feeds.thelocal.com/rss/se>|200|04/01/2026|valid|-|
25|Sveriges Radio - Ekot nyhetssandning (pod)|<https://api.sr.se/api/rss/pod/3795>|200|04/01/2026|valid|-|
26|Sveriges Radio - P3 Nyheter pa en minut (pod)|<https://api.sr.se/api/rss/pod/22376>|200|04/01/2026|valid|-|
27|Sveriges Radio - Radio Sweden pa latt svenska (program)|<https://api.sr.se/api/rss/program/4916?format=1>|200|04/01/2026|valid|-|
28|Radio Sweden - Sweden Today (podcast xml)|<http://sverigesradio.se/Podradio/xml/SRI_en_sweToday.xml>|Recovered via sitemap|04/01/2026|valid|-|
29|Proletaren|<https://proletaren.se/rss.xml>|200|04/01/2026|valid|-|
30|SVT Lokal - Sydnytt|<http://svt.se/nyheter/regionalt/sydnytt/rss.xml>|200|04/01/2026|valid|-|
31|SVT Lokal - Blekingenytt|<http://svt.se/nyheter/regionalt/blekingenytt/rss.xml>|200|04/01/2026|valid|-|
32|SVT Lokal - Mittnytt|<http://svt.se/nyheter/regionalt/mittnytt/rss.xml>|200|04/01/2026|valid|-|
33|SVT Lokal - Jamtlandsnytt|<http://svt.se/nyheter/regionalt/jamtlandsnytt/rss.xml>|200|04/01/2026|valid|-|
34|Sydsvenskan (fallback)|<https://www.sydsvenskan.se/feeds/feed.xml>|200|04/01/2026|valid|-|
35|Sydsvenskan - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
36|Boras Tidning - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
37|Smalandsposten - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
38|Barometern - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
39|BLT - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
40|Ystads Allehanda - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
41|Norra Skane - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
42|Nerikes Allehanda - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
43|Sundsvalls Tidning|<https://www.st.nu/feeds/feed.xml>|200|04/01/2026|valid|-|
44|Lanstidningen Sodertalje|<https://www.lt.se/feeds/feed.xml>|200|04/01/2026|valid|-|
45|Allehanda|<https://www.allehanda.se/feeds/feed.xml>|200|04/01/2026|valid|-|
46|Arbetarbladet|<https://www.arbetarbladet.se/feeds/feed.xml>|200|04/01/2026|valid|-|
47|Gefle Dagblad|<https://www.gd.se/feeds/feed.xml>|200|04/01/2026|valid|-|
48|Ostersunds-Posten|<https://www.op.se/feeds/feed.xml>|200|04/01/2026|valid|-|
49|Norrtalje Tidning|<https://www.norrteljetidning.se/feeds/feed.xml>|200|04/01/2026|valid|-|
50|VLT|<https://www.vlt.se/feeds/feed.xml>|200|04/01/2026|valid|-|
51|Jonkopings-Posten|<https://www.jp.se/feeds/feed.xml>|200|04/01/2026|valid|-|
52|Varnamo Nyheter|<https://www.vn.se/feeds/feed.xml>|200|04/01/2026|valid|-|
53|Skanska Dagbladet|<https://www.skd.se/feeds/feed.xml>|200|04/01/2026|valid|-|
54|Helsingborgs Dagblad|<https://www.hd.se/feeds/feed.xml>|200|04/01/2026|valid|-|
55|Skovde Nyheter|<https://www.skovdenyheter.se/feeds/feed.xml>|200|04/01/2026|valid|-|
56|Nerikes Allehanda (fallback)|<https://www.na.se/feeds/feed.xml>|200|04/01/2026|valid|-|
57|Dagens Industri (Economy #1 Daily)|<https://www.di.se/rss>|200|04/01/2026|valid|-|
58|Expressen Din Ekonomi (Economy)|<https://feeds.expressen.se/din-ekonomi/>|needs check|04/01/2026|needs verification|-|
59|Dagens Nyheter Ekonomi (Economy)|<https://www.dn.se/ekonomi/rss/>|200|04/01/2026|valid|-|
60|Svenska Dagbladet Naringsliv (Business)|<https://www.svd.se/naringsliv/?service=rss>|200|04/01/2026|valid|-|
61|Omni (Swedish News Aggregator)|<https://omni.se/rss>|needs check|04/01/2026|needs verification|-|
62|Ny Teknik (Tech and Engineering)|<https://www.nyteknik.se/rss.xml>|needs check|04/01/2026|needs verification|-|
63|Breakit (Startups and VC)|<https://www.breakit.se/feed/artiklar>|200|04/01/2026|valid|-|
64|Privata Affarer (Personal Finance/Investing)|<https://www.privataaffarer.se/rss.xml>|200|04/01/2026|valid|-|
65|SVT Lokal - Stockholm|<https://www.svt.se/nyheter/lokalt/stockholm/rss.xml>|200|04/01/2026|valid|-|
66|SVT Lokal - Vast|<https://www.svt.se/nyheter/lokalt/vast/rss.xml>|200|04/01/2026|valid|-|
67|SVT Lokal - Uppsala|<https://www.svt.se/nyheter/lokalt/uppsala/rss.xml>|200|04/01/2026|valid|-|
68|SVT Lokal - Orebro|<https://www.svt.se/nyheter/lokalt/orebro/rss.xml>|200|04/01/2026|valid|-|
69|SVT Lokal - Halland|<https://www.svt.se/nyheter/lokalt/halland/rss.xml>|200|04/01/2026|valid|-|
70|SVT Lokal - Vasterbotten|<https://www.svt.se/nyheter/lokalt/vasterbotten/rss.xml>|200|04/01/2026|valid|-|
71|SVT Lokal - Gavleborg|<https://www.svt.se/nyheter/lokalt/gavleborg/rss.xml>|200|04/01/2026|valid|-|
72|SVT Lokal - Dalarna|<https://www.svt.se/nyheter/lokalt/dalarna/rss.xml>|200|04/01/2026|valid|-|
73|SVT Lokal - Norrbotten|<https://www.svt.se/nyheter/lokalt/norrbotten/rss.xml>|200|04/01/2026|valid|-|
74|SVT Lokal - Smaland|<https://www.svt.se/nyheter/lokalt/smaland/rss.xml>|200|04/01/2026|valid|-|
75|SVT Lokal - Sormland|<https://www.svt.se/nyheter/lokalt/sormland/rss.xml>|200|04/01/2026|valid|-|
76|SVT Lokal - Ost|<https://www.svt.se/nyheter/lokalt/ost/rss.xml>|200|04/01/2026|valid|-|

### Belgium (BE)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|De Morgen|<https://www.demorgen.be/rss.xml>|200|04/01/2026|valid|-|
2|La Libre|<https://www.lalibre.be/arc/outboundfeeds/rss/section/belgique/?outputType=xml>|200|04/01/2026|valid|-|
3|Knack|<https://www.knack.be/feed/>|200|04/01/2026|valid|-|
4|VRT News|<https://www.vrt.be/vrtnws/nl.rss.articles.xml>|200|04/01/2026|valid|-|
5|La Derniere Heure|<https://www.dhnet.be/rss.xml>|200|04/01/2026|valid|-|
6|Le Vif|<https://www.levif.be/feed/>|200|04/01/2026|valid|-|
7|RTBF|<https://rss.rtbf.be/article/rss/highlight_rtbf_info.xml?source=internal>|200|04/01/2026|valid|-|
8|Het Nieuwsblad|<https://www.nieuwsblad.be/rss/>|needs check|04/01/2026|needs verification|-|
9|La Libre Belgique|<https://www.lalibre.be/rss/>|200|04/01/2026|valid|-|
10|La Libre|<https://www.lalibre.be/rss>|200|04/01/2026|valid|-|
11|The Bulletin (EN)|<https://www.thebulletin.be/rss.xml>|200|04/01/2026|valid|-|
12|HLN (Het Laatste Nieuws)|<https://www.hln.be/home/rss.xml>|200|04/01/2026|valid|-|
13|Brussels Morning|<https://brusselsmorning.com/feed>|200|04/01/2026|valid|-|
14|7sur7|<https://www.7sur7.be/rss.xml>|200|04/01/2026|valid|-|
15|Business AM|<https://businessam.be/feed/>|200|04/01/2026|valid|-|
16|Bruzz|<https://www.bruzz.be/rss.xml>|200|04/01/2026|valid|-|
17|L'Echo|<https://www.lecho.be/rss/top_stories.xml>|200|04/01/2026|valid|-|
18|De Standaard (example section)|<https://www.standaard.be/rss/section/1f2838d4-99ea-49f0-9102-138784c7ea7c>|needs check|04/01/2026|needs verification|-|
19|Het Nieuwsblad (example section)|<https://www.nieuwsblad.be/rss/section/55178e67-15a8-4ddd-a3d8-bfe5708f8932>|needs check|04/01/2026|needs verification|-|
20|Le Soir (main)|<https://www.lesoir.be/rss2/9/cible_principale>|needs check|04/01/2026|needs verification|-|
21|Brussels Times|<https://www.brusselstimes.com/rss-feed>|Recovered via sitemap|04/01/2026|valid|-|
22|City of Brussels (official)|<https://www.brussels.be/rss.xml>|200|04/01/2026|valid|-|
23|Le Soir - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
24|VRT News - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
25|Sudinfo - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
26|La Libre - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
27|DHnet - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
28|L'Avenir - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
29|De Standaard - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
30|Het Nieuwsblad - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
31|Gazet van Antwerpen - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
32|Het Belang van Limburg - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
33|BX1|<https://bx1.be/feed/>|200|04/01/2026|valid|-|

### Thailand (TH)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|The Thaiger|<https://thethaiger.com/feed>|200|04/01/2026|valid|-|
2|Khaosod English|<https://www.khaosodenglish.com/rss>|403 (HTTP_403)|04/01/2026|invalid|-|
3|Matichon|<https://www.matichon.co.th/rss>|403 (HTTP_403)|04/01/2026|invalid|-|
4|Prachachat|<https://prachachat.net/feed/>|403 (HTTP_403)|04/01/2026|invalid|-|
5|Daily News|<https://www.dailynews.co.th/rss>|200|04/01/2026|valid|-|
6|Prachatai English (Feedburner)|<http://feeds.feedburner.com/prachataienglish>|200|04/01/2026|valid|-|
7|Thai PBS (news feed endpoint)|<https://news.thaipbs.or.th/rss/news>|200|04/01/2026|valid|-|
8|Thairath (News)|<http://www.thairath.co.th/rss/news.xml>|Recovered via sitemap|04/01/2026|valid|-|
9|Thairath (Sport)|<http://www.thairath.co.th/rss/sport.xml>|Recovered via sitemap|04/01/2026|valid|-|
10|Sanook - Hot News|<http://rssfeeds.sanook.com/rss/feeds/sanook/hot.news.xml>|200|04/01/2026|valid|-|
11|Sanook - Daily News|<http://rssfeeds.sanook.com/rss/feeds/sanook/news.index.xml>|200|04/01/2026|valid|-|
12|Sanook - Politics|<http://rssfeeds.sanook.com/rss/feeds/sanook/news.politic.xml>|200|04/01/2026|valid|-|
13|Sanook - Crime|<http://rssfeeds.sanook.com/rss/feeds/sanook/news.crime.xml>|200|04/01/2026|valid|-|
14|Sanook - World|<http://rssfeeds.sanook.com/rss/feeds/sanook/news.world.xml>|200|04/01/2026|valid|-|
15|Sanook - Economy|<http://rssfeeds.sanook.com/rss/feeds/sanook/news.economic.xml>|200|04/01/2026|valid|-|
16|Sanook - Tech (News)|<http://rssfeeds.sanook.com/rss/feeds/sanook/hitech.news.xml>|200|04/01/2026|valid|-|
17|Sanook - Tech (Computer)|<http://rssfeeds.sanook.com/rss/feeds/sanook/hitech.computer.index.xml>|200|04/01/2026|valid|-|
18|Sanook - Tech (Mobile)|<http://rssfeeds.sanook.com/rss/feeds/sanook/hitech.mobile.index.xml>|200|04/01/2026|valid|-|
19|Sanook - Travel|<http://rssfeeds.sanook.com/rss/feeds/sanook/travel.index.xml>|200|04/01/2026|valid|-|
20|Sanook - Movies|<http://rssfeeds.sanook.com/rss/feeds/sanook/movie.news.xml>|200|04/01/2026|valid|-|
21|PressDisplay - Bangkok Post|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=1264>|200|04/01/2026|valid|-|
22|PressDisplay - Daily News Thailand|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=4863>|needs check|04/01/2026|needs verification|-|
23|PressDisplay - Krungthep Turakij|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=5261&type=full>|needs check|04/01/2026|needs verification|-|
24|PressDisplay - The Phuket News|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=eff9&type=full>|200|04/01/2026|valid|-|
25|PressDisplay - Novosti Phuketa|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=9wv3&type=full>|200|04/01/2026|valid|-|
26|PressDisplay - Window On Phuket|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=9wv4&type=full>|needs check|04/01/2026|needs verification|-|
27|PressDisplay - Where to Eat in Phuket|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=9wv5&type=full>|needs check|04/01/2026|needs verification|-|
28|PressDisplay - Prestige (Thailand)|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=9vw7&type=full>|200|04/01/2026|valid|-|
29|PressDisplay - Hello! (Thailand)|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=9vw6&type=full>|200|04/01/2026|valid|-|
30|Khaosod English - Food (category)|<http://www.khaosodenglish.com/category/life/food/feed>|403 (HTTP_403)|04/01/2026|invalid|-|
31|Thairath (Top News)|<https://www.thairath.co.th/rss/news.xml>|needs check|04/01/2026|needs verification|-|
32|Matichon (Leading Political Daily)|<https://www.matichon.co.th/feed>|200|04/01/2026|valid|-|
33|Prachachat (Business/Economy #1)|<https://www.prachachat.net/feed>|200|04/01/2026|valid|-|
34|Khaosod (Popular General News)|<https://www.khaosod.co.th/feed>|200|04/01/2026|valid|-|
35|Sanook News (Top Portal)|<https://rssfeeds.sanook.com/rss/feeds/sanook/news.index.xml>|200|04/01/2026|valid|-|
36|Sanook Economy (Portal Economy)|<https://rssfeeds.sanook.com/rss/feeds/sanook/news.economic.xml>|200|04/01/2026|valid|-|
37|Bangkok Biz News (Economy)|<https://www.bangkokbiznews.com/rss/feed>|Recovered via sitemap|04/01/2026|valid|-|
38|Manager Online (Politics/Society)|<https://mgronline.com/rss>|needs check|04/01/2026|needs verification|-|
39|The Standard (Top Media)|<https://thestandard.co/feed/>|200|04/01/2026|valid|-|
40|Thansettakij|<https://www.thansettakij.com/rss/feed>|Recovered via sitemap|04/01/2026|valid|-|
41|Bangkok Insight|<https://www.thebangkokinsight.com/feed/>|200|04/01/2026|valid|-|
42|Nation TV|<https://www.nationtv.tv/rss/feed>|Recovered via sitemap|04/01/2026|valid|-|
43|Post Today|<https://www.posttoday.com/rss/feed>|Recovered via sitemap|04/01/2026|valid|-|
44|MCOT Economy|<https://tna.mcot.net/category/economy/feed>|needs check|04/01/2026|needs verification|-|
45|Bangkok Post - Top Stories|<https://www.bangkokpost.com/rss/data/topstories.xml>|200|04/01/2026|valid|-|
46|Bangkok Post - Business|<https://www.bangkokpost.com/rss/data/business.xml>|200|04/01/2026|valid|-|
47|Bangkok Post - World|<https://www.bangkokpost.com/rss/data/world.xml>|200|04/01/2026|valid|-|
48|Bangkok Post - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
49|Bangkok Post - Thailand|<https://www.bangkokpost.com/rss/data/thailand.xml>|200|04/01/2026|valid|-|
50|Bangkok Post - Sports|<https://www.bangkokpost.com/rss/data/sports.xml>|200|04/01/2026|valid|-|
51|Bangkok Post - Opinion|<https://www.bangkokpost.com/rss/data/opinion.xml>|200|04/01/2026|valid|-|
52|Bangkok Post - Life|<https://www.bangkokpost.com/rss/data/life.xml>|200|04/01/2026|valid|-|
53|Bangkok Post - Auto|<https://www.bangkokpost.com/rss/data/auto.xml>|200|04/01/2026|valid|-|
54|Matichon - Politics|<https://www.matichon.co.th/politics/feed>|200|04/01/2026|valid|-|
55|Matichon - Economy|<https://www.matichon.co.th/economy/feed>|200|04/01/2026|valid|-|
56|Khaosod - Politics|<https://www.khaosod.co.th/politics/feed>|200|04/01/2026|valid|-|
57|Khaosod - Special Stories|<https://www.khaosod.co.th/special-stories/feed>|200|04/01/2026|valid|-|
58|Matichon - Foreign|<https://www.matichon.co.th/foreign/feed>|200|04/01/2026|valid|-|
59|Matichon - Region|<https://www.matichon.co.th/region/feed>|200|04/01/2026|valid|-|
60|Matichon - Lifestyle|<https://www.matichon.co.th/lifestyle/feed>|200|04/01/2026|valid|-|
61|Khaosod - Economics|<https://www.khaosod.co.th/economics/feed>|503 (HTTP_503)|04/01/2026|invalid|-|
62|Khaosod - Breaking News|<https://www.khaosod.co.th/breaking-news/feed>|503 (HTTP_503)|04/01/2026|invalid|-|
63|Khaosod - Around Thailand|<https://www.khaosod.co.th/around-thailand/feed>|200|04/01/2026|valid|-|
64|Khaosod - Sports|<https://www.khaosod.co.th/sports/feed>|200|04/01/2026|valid|-|
65|Khaosod - Foreign|<https://www.khaosod.co.th/around-the-world-news/feed>|200|04/01/2026|valid|-|
66|Khaosod - Covid|<https://www.khaosod.co.th/covid-19/feed>|503 (HTTP_503)|04/01/2026|invalid|-|
67|Matichon - Sports|<https://www.matichon.co.th/sport/feed>|200|04/01/2026|valid|-|
68|Matichon - Education|<https://www.matichon.co.th/education/feed>|200|04/01/2026|valid|-|
69|Prachachat - Politics|<https://www.prachachat.net/politics/feed>|200|04/01/2026|valid|-|
70|Prachachat - Economy|<https://www.prachachat.net/economy/feed>|200|04/01/2026|valid|-|
71|Prachachat - Finance|<https://www.prachachat.net/finance/feed>|200|04/01/2026|valid|-|
72|Bangkok Post - Learning|<https://www.bangkokpost.com/rss/data/learning.xml>|200|04/01/2026|valid|-|
73|Thairath - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
74|Thairath - Hourly Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
75|Thairath - News Daily Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
76|Thairath - March 2026 Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
77|Nation TV - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
78|Nation TV - Latest Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
79|Nation TV - March 2026 Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
80|Nation Thailand - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
81|Post Today - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
82|Bangkok Biz News - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
83|Bangkok Biz News - Latest Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
84|Bangkok Biz News - March 2026 Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
85|PPTVHD36 - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
86|Daily News - Article Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|

### Iran (IR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|IRNA|<https://www.irna.ir/rss>|needs check|04/01/2026|needs verification|-|
2|Mehr News|<https://www.mehrnews.com/rss>|ERR (TIMEOUT)|04/01/2026|invalid|-|
3|ILNA|<https://www.ilna.news/rss>|needs check|04/01/2026|needs verification|-|
4|Khabar Online|<https://www.khabaronline.ir/rss>|ERR (TIMEOUT)|04/01/2026|invalid|-|
5|Iran International|<https://www.iranintl.com/feed>|200|04/01/2026|valid|-|
6|ILNA|<https://www.ilna.ir/rss>|needs check|04/01/2026|needs verification|-|
7|Tejarat News|<https://www.tejaratnews.com/rss>|needs check|04/01/2026|needs verification|-|
8|Tehran Times - Latest|<https://www.tehrantimes.com/rss>|needs check|04/01/2026|needs verification|-|
9|Tehran Times - Homepage|<https://www.tehrantimes.com/rss-homepage>|needs check|04/01/2026|needs verification|-|
10|Tehran Times - Breaking|<https://www.tehrantimes.com/rss/pl/617>|needs check|04/01/2026|needs verification|-|
11|Tehran Times - Society|<https://www.tehrantimes.com/rss/tp/696>|needs check|04/01/2026|needs verification|-|
12|Tehran Times - Economy|<https://www.tehrantimes.com/rss/tp/697>|needs check|04/01/2026|needs verification|-|
13|Tehran Times - Politics|<https://www.tehrantimes.com/rss/tp/698>|needs check|04/01/2026|needs verification|-|
14|Tehran Times - Sports|<https://www.tehrantimes.com/rss/tp/699>|needs check|04/01/2026|needs verification|-|
15|Tehran Times - Culture|<https://www.tehrantimes.com/rss/tp/700>|needs check|04/01/2026|needs verification|-|
16|Tehran Times - International|<https://www.tehrantimes.com/rss/tp/702>|needs check|04/01/2026|needs verification|-|
17|Tehran Times - Multimedia|<https://www.tehrantimes.com/rss/tp/717>|needs check|04/01/2026|needs verification|-|
18|Tehran Times - Tourism|<https://www.tehrantimes.com/rss/tp/807>|needs check|04/01/2026|needs verification|-|
19|MehrNews (EN) - Latest|<https://en.mehrnews.com/rss/pl/118>|ERR (TIMEOUT)|04/01/2026|invalid|-|
20|MehrNews (EN) - Iran|<https://en.mehrnews.com/rss/tp/575>|ERR (TIMEOUT)|04/01/2026|invalid|-|
21|MehrNews (EN) - Iran > Iran|<https://en.mehrnews.com/rss/tp/905>|ERR (TIMEOUT)|04/01/2026|invalid|-|
22|MehrNews (EN) - Ethnic Groups|<https://en.mehrnews.com/rss/tp/897>|needs check|04/01/2026|needs verification|-|
23|MehrNews (EN) - Nature|<https://en.mehrnews.com/rss/tp/898>|ERR (TIMEOUT)|04/01/2026|invalid|-|
24|MehrNews (EN) - Historical Sites|<https://en.mehrnews.com/rss/tp/899>|needs check|04/01/2026|needs verification|-|
25|MehrNews (EN) - Souvenirs|<https://en.mehrnews.com/rss/tp/900>|needs check|04/01/2026|needs verification|-|
26|MehrNews (EN) - Persian Cuisine|<https://en.mehrnews.com/rss/tp/901>|ERR (TIMEOUT)|04/01/2026|invalid|-|
27|ISNA (EN) - Social|<https://en.isna.ir/rss/tp/8>|needs check|04/01/2026|needs verification|-|
28|ISNA (EN) - Economy|<https://en.isna.ir/rss/tp/33>|needs check|04/01/2026|needs verification|-|
29|ISNA (EN) - Politics|<https://en.isna.ir/rss/tp/13>|needs check|04/01/2026|needs verification|-|
30|ISNA (EN) - Culture & Art|<https://en.isna.ir/rss/tp/19>|needs check|04/01/2026|needs verification|-|
31|ISNA (EN) - Sports|<https://en.isna.ir/rss/tp/23>|needs check|04/01/2026|needs verification|-|
32|ISNA (EN) - Photos|<https://en.isna.ir/rss/tp/27>|needs check|04/01/2026|needs verification|-|
33|Tasnim (EN) - Top Stories|<https://www.tasnimnews.ir/en/rss/feed/0/0/8/1/TopStories>|200|04/01/2026|valid|-|
34|Tasnim (EN) - All Stories|<https://www.tasnimnews.ir/en/rss/feed/0/0/0/0/AllStories>|200|04/01/2026|valid|-|
35|Tasnim (EN) - Politics|<https://www.tasnimnews.ir/en/rss/feeds/1192/0/0/0>|200|04/01/2026|valid|-|
36|Tasnim (EN) - Economy|<https://www.tasnimnews.ir/en/rss/feeds/1193/0/0/0>|needs check|04/01/2026|needs verification|-|
37|Tasnim (EN) - World|<https://www.tasnimnews.ir/en/rss/feeds/1194/0/0/0>|200|04/01/2026|valid|-|
38|IFP News|<https://ifpnews.com/feed/>|200|04/01/2026|valid|-|

### Argentina (AR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Ambito - Portada|<https://www.ambito.com/rss/pages/home.xml>|200|04/01/2026|valid|-|
2|Ambito - Ultimas noticias|<https://www.ambito.com/rss/pages/ultimas-noticias.xml>|200|04/01/2026|valid|-|
3|Ambito - Economia|<https://www.ambito.com/rss/pages/economia.xml>|200|04/01/2026|valid|-|
4|Ambito - Finanzas|<https://www.ambito.com/rss/pages/finanzas.xml>|200|04/01/2026|valid|-|
5|Ambito - Negocios|<https://www.ambito.com/rss/pages/negocios.xml>|200|04/01/2026|valid|-|
6|Ambito - Politica|<https://www.ambito.com/rss/pages/politica.xml>|200|04/01/2026|valid|-|
7|Ambito - Nacional|<https://www.ambito.com/rss/pages/nacional.xml>|200|04/01/2026|valid|-|
8|Ambito - Mundo|<https://www.ambito.com/rss/pages/mundo.xml>|200|04/01/2026|valid|-|
9|Ambito - Lifestyle|<https://www.ambito.com/rss/pages/lifestyle.xml>|200|04/01/2026|valid|-|
10|Ambito - Deportes|<https://www.ambito.com/rss/pages/deportes.xml>|200|04/01/2026|valid|-|
11|Ambito - Tecnologia|<https://www.ambito.com/rss/pages/tecnologia.xml>|200|04/01/2026|valid|-|
12|Ambito - Autos|<https://www.ambito.com/rss/pages/autos.xml>|200|04/01/2026|valid|-|
13|Ambito - Edicion impresa|<https://www.ambito.com/rss/pages/edicion-impresa.xml>|200|04/01/2026|valid|-|
14|Pagina/12 - Portada|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/portada>|200|04/01/2026|valid|-|
15|Pagina/12 - Edicion impresa|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/edicion-impresa>|200|04/01/2026|valid|-|
16|Pagina/12 - El Pais|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/el-pais/notas>|200|04/01/2026|valid|-|
17|Pagina/12 - Economia|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/economia/notas>|200|04/01/2026|valid|-|
18|Pagina/12 - Sociedad|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/sociedad/notas>|200|04/01/2026|valid|-|
19|Pagina/12 - El Mundo|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/el-mundo/notas>|200|04/01/2026|valid|-|
20|Pagina/12 - Deportes|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/deportes/notas>|200|04/01/2026|valid|-|
21|Pagina/12 - Ciencia|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/ciencia/notas>|200|04/01/2026|valid|-|
22|Pagina/12 - Psicologia|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/psicologia/notas>|200|04/01/2026|valid|-|
23|Pagina/12 - Cartas de Lectores|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/cartas-de-lectores/notas>|needs check|04/01/2026|needs verification|-|
24|Pagina/12 - Cash|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/suplementos/cash/notas>|200|04/01/2026|valid|-|
25|Pagina/12 - Las 12|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/suplementos/las12/notas>|200|04/01/2026|valid|-|
26|Pagina/12 - Radar|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/suplementos/radar/notas>|200|04/01/2026|valid|-|
27|Pagina/12 - Turismo|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/suplementos/turismo/notas>|needs check|04/01/2026|needs verification|-|
28|LA NACION - General|<https://www.lanacion.com.ar/arc/outboundfeeds/rss/?outputType=xml>|200|04/01/2026|valid|-|
29|El Cronista - Noticias|<https://www.cronista.com/files/rss/news.xml>|200|04/01/2026|valid|-|
30|Clarín - Ultimo Momento|<https://www.clarin.com/rss/lo-ultimo/>|200|04/01/2026|valid|-|
31|Clarin - Economia|<https://www.clarin.com/rss/economia/>|200|04/01/2026|valid|-|
32|Clarin - Politica|<https://www.clarin.com/rss/politica/>|200|04/01/2026|valid|-|
33|La Nacion - Economia|<https://www.lanacion.com.ar/arc/outboundfeeds/rss/?outputType=xml&rotation=economia>|200|04/01/2026|valid|-|
34|La Nacion - Politica|<https://www.lanacion.com.ar/arc/outboundfeeds/rss/?outputType=xml&rotation=politica>|200|04/01/2026|valid|-|
35|Infobae|<https://www.infobae.com/arc/outboundfeeds/rss/?outputType=xml>|200|04/01/2026|valid|-|
36|Infobae - Economia|<https://www.infobae.com/feeds/rss/economia/>|needs check|04/01/2026|needs verification|-|
37|El Cronista - Finanzas|<https://www.cronista.com/files/rss/finanzas_markets.xml>|needs check|04/01/2026|needs verification|-|
38|El Cronista - Economia|<https://www.cronista.com/files/rss/economia_politica.xml>|needs check|04/01/2026|needs verification|-|
39|Rosario3 - Home|<https://www.rosario3.com/rss/feed.xml>|200|04/01/2026|valid|-|
40|TN|<https://tn.com.ar/rss.xml>|200|04/01/2026|valid|-|
41|La Nacion|<https://www.lanacion.com.ar/arc/outboundfeeds/rss/>|200|04/01/2026|valid|-|
42|Cronica|<https://www.cronica.com.ar/feed/>|403 (HTTP_403)|04/01/2026|invalid|-|
43|El Economista|<https://eleconomista.com.ar/feed/>|200|04/01/2026|valid|-|
44|BAE Negocios|<https://www.baenegocios.com/feed/>|403 (HTTP_403)|04/01/2026|invalid|-|
45|Perfil|<https://www.perfil.com/feed/>|200|04/01/2026|valid|-|
46|Buenos Aires Times|<https://www.batimes.com.ar/feed>|200|04/01/2026|valid|-|
47|El Tribuno|<https://www.eltribuno.com/feed/>|200|04/01/2026|valid|-|
48|Diario Registrado|<https://www.diarioregistrado.com/rss.xml>|200|04/01/2026|valid|-|
49|Rio Negro|<https://www.rionegro.com.ar/feed/>|200|04/01/2026|valid|-|
50|Econojournal|<https://econojournal.com.ar/feed/>|200|04/01/2026|valid|-|
51|TecnoGeek|<https://tecnogeek.com/feed/>|200|04/01/2026|valid|-|
52|La Gaceta Tucuman|<https://www.lagaceta.com.ar/rss>|200|04/01/2026|valid|-|
53|MercoPress|<https://en.mercopress.com/rss>|200|04/01/2026|valid|-|
54|Chequeado|<https://chequeado.com/feed/>|200|04/01/2026|valid|-|
55|Ole|<https://www.ole.com.ar/rss/ultimas-noticias/>|200|04/01/2026|valid|-|
56|Border Periodismo|<https://borderperiodismo.com/feed/>|200|04/01/2026|valid|-|
57|Data Diario|<https://datadiario.com/feed/>|200|04/01/2026|valid|-|
58|Primera Edicion|<https://www.primeraedicion.com.ar/feed/>|200|04/01/2026|valid|-|
59|Surtidores|<https://surtidores.com.ar/feed/>|200|04/01/2026|valid|-|
60|Jujuy al Dia|<https://www.jujuyaldia.com.ar/feed/>|200|04/01/2026|valid|-|
61|El Diario Parana|<https://www.eldiario.com.ar/rss>|200|04/01/2026|valid|-|
62|El Inversor Energetico|<https://elinversorenergetico.com/feed/>|200|04/01/2026|valid|-|
63|Misiones Online|<https://misionesonline.net/feed/>|200|04/01/2026|valid|-|
64|Clarin - Mundo|<https://www.clarin.com/rss/mundo/>|200|04/01/2026|valid|-|
65|Pagina/12 - Cultura|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/cultura-y-espectaculos/notas>|200|04/01/2026|valid|-|
66|MDZ Online - Ultimas noticias|<https://www.mdzol.com/rss/pages/noticias.xml>|200|04/01/2026|valid|-|
67|MDZ Online - Ultimas noticias Argentina|<https://www.mdzol.com/rss/pages/ultimas-noticias-argentina.xml>|200|04/01/2026|valid|-|
68|MDZ Online - Ultimas noticias Mendoza|<https://www.mdzol.com/rss/pages/ultimas-noticias-mendoza.xml>|200|04/01/2026|valid|-|
69|MDZ Online - Deportes|<https://www.mdzol.com/rss/pages/deportes.xml>|200|04/01/2026|valid|-|
70|MDZ Online - Economia|<https://www.mdzol.com/rss/pages/dinero.xml>|200|04/01/2026|valid|-|
71|MDZ Online - Mundo|<https://www.mdzol.com/rss/pages/mundo.xml>|200|04/01/2026|valid|-|
72|MDZ Online - Policiales|<https://www.mdzol.com/rss/pages/policiales.xml>|200|04/01/2026|valid|-|
73|MDZ Online - Politica|<https://www.mdzol.com/rss/pages/politica.xml>|200|04/01/2026|valid|-|
74|MDZ Online - Sociedad|<https://www.mdzol.com/rss/pages/sociedad.xml>|200|04/01/2026|valid|-|
75|MDZ Online - Tecnologia|<https://www.mdzol.com/rss/pages/tecnologia.xml>|200|04/01/2026|valid|-|
76|La Opinion Rafaela|<https://www.laopinion.com.ar/rss>|200|04/01/2026|valid|-|
77|C5N - Home|<https://www.c5n.com/rss/pages/home.xml>|200|04/01/2026|valid|-|
78|C5N - Politica|<https://www.c5n.com/rss/pages/politica.xml>|200|04/01/2026|valid|-|
79|C5N - Economia|<https://www.c5n.com/rss/pages/economia.xml>|200|04/01/2026|valid|-|
80|C5N - Sociedad|<https://www.c5n.com/rss/pages/sociedad.xml>|200|04/01/2026|valid|-|
81|C5N - Enfoque|<https://www.c5n.com/rss/pages/enfoque.xml>|200|04/01/2026|valid|-|
82|C5N - Deportes|<https://www.c5n.com/rss/pages/deportes.xml>|200|04/01/2026|valid|-|
83|C5N - Autos|<https://www.c5n.com/rss/pages/autos.xml>|200|04/01/2026|valid|-|
84|C5N - Mundo|<https://www.c5n.com/rss/pages/mundo.xml>|200|04/01/2026|valid|-|
85|C5N - Ultimas noticias|<https://www.c5n.com/rss/pages/ultimas-noticias.xml>|200|04/01/2026|valid|-|
86|C5N - Tecnologia|<https://www.c5n.com/rss/pages/tecnologia.xml>|200|04/01/2026|valid|-|
87|C5N - RatingCero|<https://www.c5n.com/rss/pages/ratingcero.xml>|200|04/01/2026|valid|-|
88|C5N - Astrologia|<https://www.c5n.com/rss/pages/astrologia.xml>|200|04/01/2026|valid|-|
89|C5N - Lifestyle|<https://www.c5n.com/rss/pages/lifestyle.xml>|200|04/01/2026|valid|-|
90|A24|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
91|Canal 26|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
92|La Voz|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
93|Los Andes|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
94|La Capital|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
95|Minutouno|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
96|Urgente24|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
97|El Destape Web|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
98|TyC Sports|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|

### Chile (CL)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Diario Financiero|<https://www.df.cl/noticias/site/list/port/rss.xml>|200|04/01/2026|valid|-|
2|The Clinic|<https://www.theclinic.cl/feed/>|200|04/01/2026|valid|-|
3|El Rancaguino|<https://www.elrancaguino.cl/feed/>|200|04/01/2026|valid|-|
4|Cambio21|<https://cambio21.cl/rss>|200|04/01/2026|valid|-|
5|La Discusion|<https://ladiscusion.cl/feed/>|200|04/01/2026|valid|-|
6|La Nacion (Chile)|<https://www.lanacion.cl/feed>|200|04/01/2026|valid|-|
7|El Siglo|<https://elsiglo.cl/feed>|200|04/01/2026|valid|-|
8|The Santiago Times|<https://santiagotimes.cl/feed>|200|04/01/2026|valid|-|
9|Infoweek|<https://infoweek.biz/feed>|needs check|04/01/2026|needs verification|-|
10|El Desconcierto|<https://eldesconcierto.cl/feeds/rss.xml>|Recovered via sitemap|04/01/2026|valid|-|
11|La Prensa Austral|<https://laprensaaustral.cl/feed/>|200|04/01/2026|valid|-|
12|CIPER Chile|<https://www.ciperchile.cl/feed/>|200|04/01/2026|valid|-|
13|Radio Universidad de Chile|<https://radio.uchile.cl/feed/>|ERR (NETWORK)|04/01/2026|invalid|-|
14|La Tercera - Home|<https://www.latercera.com/arc/outboundfeeds/rss/?outputType=xml>|200|04/01/2026|valid|-|
15|Pulso (La Tercera Biz)|<https://www.latercera.com/arc/outboundfeeds/rss/?outputType=xml&rotation=pulso>|200|04/01/2026|valid|-|
16|Emol - Nacional|<https://www.emol.com/rss/rss_nacional.xml>|needs check|04/01/2026|needs verification|-|
17|Emol - Economia|<https://www.emol.com/rss/rss_economia.xml>|needs check|04/01/2026|needs verification|-|
18|Emol - Nacional Sitemap 2026|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
19|Emol - Internacional Sitemap 2026|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
20|Emol - Economia Sitemap 2026|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
21|Emol - Deportes Sitemap 2026|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
22|BioBioChile - Home|<https://feeds.feedburner.com/radiobiobio/NNeJ>|200|04/01/2026|valid|-|
23|24Horas - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
24|24Horas - Sitemap 202603|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
25|Cooperativa - Economia|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_5___1.xml>|200|04/01/2026|valid|-|
26|Cooperativa - Pais|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_3___1.xml>|200|04/01/2026|valid|-|
27|Cooperativa - País|<https://m.cooperativa.cl/noticias/site/tax/port/all/rss_3___1.xml>|200|04/01/2026|valid|-|
28|Cooperativa - Deportes|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_1___24.xml>|200|04/01/2026|valid|-|
29|Cooperativa - Deportes|<https://m.cooperativa.cl/noticias/site/tax/port/all/rss_1___24.xml>|200|04/01/2026|valid|-|
30|Cooperativa - Cine|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_4_4__1.xml>|200|04/01/2026|valid|-|
31|Cooperativa - Musica|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_4_11__1.xml>|200|04/01/2026|valid|-|
32|Cooperativa - Banco Central|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_6_82__1.xml>|200|04/01/2026|valid|-|
33|Cooperativa - Banco Central|<https://m.cooperativa.cl/noticias/site/tax/port/all/rss_6_82__1.xml>|200|04/01/2026|valid|-|
34|Cooperativa - Banco Central|<https://m.cooperativa.cl/noticias/site/tax/port/fid_noticia/rss_6_82__1.xml>|200|04/01/2026|valid|-|
35|Cooperativa - Banco Central|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_6_82__1.xml>|200|04/01/2026|valid|-|
36|Cooperativa - Futbol|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_1_30__1.xml>|200|04/01/2026|valid|-|
37|Cooperativa - Universidad de Chile|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_1_30_332_1.xml>|200|04/01/2026|valid|-|
38|Cooperativa - Copa Davis|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_1_58_534_1.xml>|200|04/01/2026|valid|-|
39|Cooperativa - Sociedad|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_7_136__1.xml>|200|04/01/2026|valid|-|
40|Cooperativa - Sociedad (all)|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_7___1.xml>|200|04/01/2026|valid|-|
41|Cooperativa - Mundo (all)|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_2___1.xml>|200|04/01/2026|valid|-|
42|Cooperativa - Entretencion (all)|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_4___1.xml>|200|04/01/2026|valid|-|
43|Cooperativa - Economia y Politica (all)|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_6___1.xml>|200|04/01/2026|valid|-|
44|Cooperativa - Deportes (all)|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_1___1.xml>|200|04/01/2026|valid|-|
45|Cooperativa - Tecnologia y Ciencia (all)|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_8___1.xml>|200|04/01/2026|valid|-|
46|Cooperativa - Genetica (Sociedad)|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_7_221_1735_1.xml>|200|04/01/2026|valid|-|
47|Cooperativa - Genetica (88frases)|<https://88frases.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_7_221_1735_1.xml>|200|04/01/2026|valid|-|
48|Cooperativa - Oftalmologia (Sociedad)|<https://88frases.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_7_120_1804_1.xml>|200|04/01/2026|valid|-|
49|Cooperativa - Donald Trump|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_2_76_2384_1.xml>|200|04/01/2026|valid|-|
50|Cooperativa - Argentina|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_2_70__1.xml>|200|04/01/2026|valid|-|
51|Cooperativa - Musica Chilena|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_4_11_779_1.xml>|200|04/01/2026|valid|-|
52|Cooperativa - Cine|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_4_4__1.xml>|200|04/01/2026|valid|-|
53|Cooperativa - Música|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_4_11__1.xml>|200|04/01/2026|valid|-|
54|Cooperativa - Venezuela|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_3_81_1474_1.xml>|200|04/01/2026|valid|-|
55|Reporte Minero|<https://www.reporteminero.cl/feed>|needs check|04/01/2026|needs verification|-|
56|Diario Concepcion|<https://www.diarioconcepcion.cl/feed>|needs check|04/01/2026|needs verification|-|
57|Pauta|<https://www.pauta.cl/feed>|Recovered via sitemap|04/01/2026|valid|-|
58|El Pinguino|<https://elpinguino.com/feed/>|200|04/01/2026|valid|-|
59|Fast Check CL|<https://www.fastcheck.cl/feed/>|200|04/01/2026|valid|-|
60|Diario El Centro|<https://www.diarioelcentro.cl/feed/>|200|04/01/2026|valid|-|
61|Ex-Ante|<https://www.ex-ante.cl/feed/>|200|04/01/2026|valid|-|
62|El Ciudadano|<https://www.elciudadano.com/feed/>|200|04/01/2026|valid|-|
63|El Insular|<https://www.elinsular.cl/feed/>|200|04/01/2026|valid|-|
64|Interferencia|<https://interferencia.cl/rss.xml>|200|04/01/2026|valid|-|
65|Diario Constitucional|<https://www.diarioconstitucional.cl/feed/>|200|04/01/2026|valid|-|
66|Concierto|<https://www.concierto.cl/feed/>|200|04/01/2026|valid|-|
67|Futuro|<https://www.futuro.cl/feed/>|200|04/01/2026|valid|-|
68|Rock&Pop|<https://www.rockandpop.cl/feed/>|200|04/01/2026|valid|-|
69|Diario Talca|<https://www.diariotalca.cl/feed/>|200|04/01/2026|valid|-|
70|Publimetro Chile - Home|<https://www.publimetro.cl/arc/outboundfeeds/rss/>|200|04/01/2026|valid|-|
71|Cooperativa - Portada|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss____1.xml>|200|04/01/2026|valid|-|
72|Cooperativa - Google News RSS|<https://www.cooperativa.cl/noticias/google_news_rss.xml>|200|04/01/2026|valid|-|
73|ADN Radio - Portada|<https://www.adnradio.cl/arc/outboundfeeds/rss/?outputType=xml>|200|04/01/2026|valid|-|
74|La Cuarta|<https://www.lacuarta.com/arc/outboundfeeds/rss/?outputType=xml>|200|04/01/2026|valid|-|
75|Radio Agricultura|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
76|Meganoticias|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
77|Meganoticias - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
78|CNN Chile|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
79|El Mostrador|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
80|El Dinamo|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
81|Chilevision Noticias|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
82|Emol - Espectaculos Sitemap 2026|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
83|Emol - Cronica Sitemap 2026|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
84|Emol - Tecnologia Sitemap 2026|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
85|Emol - Autos Sitemap 2026|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|

### Dominican Republic (DO)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Diario Libre - Portada|<https://www.diariolibre.com/rss/portada.xml>|200|04/01/2026|valid|-|
2|Diario Libre - Actualidad|<https://www.diariolibre.com/rss/actualidad.xml>|200|04/01/2026|valid|-|
3|Diario Libre - Politica|<https://www.diariolibre.com/rss/politica.xml>|200|04/01/2026|valid|-|
4|Diario Libre - Economia|<https://www.diariolibre.com/rss/economia.xml>|200|04/01/2026|valid|-|
5|Diario Libre - Opinion|<https://www.diariolibre.com/rss/opinion.xml>|200|04/01/2026|valid|-|
6|Diario Libre - Deportes|<https://www.diariolibre.com/rss/deportes.xml>|200|04/01/2026|valid|-|
7|Diario Libre - Mundo|<https://www.diariolibre.com/rss/mundo.xml>|200|04/01/2026|valid|-|
8|Diario Libre - Videos|<https://www.diariolibre.com/rss/videos.xml>|200|04/01/2026|valid|-|
9|Diario Libre - Edicion USA|<https://www.diariolibre.com/rss/dl-usa.xml>|200|04/01/2026|valid|-|
10|AlMomento - Portada|<https://almomento.net/feed/>|200|04/01/2026|valid|-|
11|AlMomento - Politica|<https://almomento.net/categoria/politica/feed/>|200|04/01/2026|valid|-|
12|AlMomento - Deportes|<https://almomento.net/categoria/deportes/feed/>|200|04/01/2026|valid|-|
13|AlMomento - Economicas|<https://almomento.net/categoria/economicas/feed/>|200|04/01/2026|valid|-|
14|AlMomento - Dominicanos en el Exterior|<https://almomento.net/categoria/dominicanos-en-el-exterior/feed/>|needs check|04/01/2026|needs verification|-|
15|AlMomento - Internacionales|<https://almomento.net/categoria/internacionales/feed/>|200|04/01/2026|valid|-|
16|AlMomento - Variedades|<https://almomento.net/categoria/variedades/feed/>|200|04/01/2026|valid|-|
17|AlMomento - Opinion|<https://almomento.net/categoria/opinion/feed/>|200|04/01/2026|valid|-|
18|AlMomento - Haiti|<https://almomento.net/categoria/haiti/feed/>|200|04/01/2026|valid|-|
19|AlMomento - Provincias|<https://almomento.net/categoria/provincias/feed/>|200|04/01/2026|valid|-|
20|El Nacional|<https://elnacional.com.do/feed/>|200|04/01/2026|valid|-|
21|El Nuevo Diario|<https://elnuevodiario.com.do/feed/>|200|04/01/2026|valid|-|
22|Listin Diario - Portada|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
23|Listin Diario - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
24|Listin Diario - March 2026 Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
25|Listin Diario - Economia|<https://listindiario.com/rss/economia.xml>|200|04/01/2026|valid|-|
26|Periodico Hoy|<https://hoy.com.do/rss/home.xml>|200|04/01/2026|valid|-|
27|El Dinero|<https://eldinero.com.do/feed/>|200|04/01/2026|valid|-|
28|Acento|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
29|Acento - Daily Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
30|Acento - Author Feed|<https://acento.com.do/author/jcastillo/feed/>|needs check|04/01/2026|needs verification|-|
31|Noticias SIN|<https://noticiassin.com/feed/>|200|04/01/2026|valid|-|
32|CDN - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
33|Diario Libre - Revista|<https://www.diariolibre.com/rss/revista.xml>|200|04/01/2026|valid|-|
34|Diario Libre - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
35|Diario Libre - March 2026 Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
36|El Dia|<https://eldia.com.do/feed/>|200|04/01/2026|valid|-|
37|N Digital|<https://n.com.do/feed/>|200|04/01/2026|valid|-|
38|Z101 Digital|<https://www.z101digital.com/feed/>|200|04/01/2026|valid|-|
39|Z101 Digital - Nacionales|<https://z101digital.com/category/nacionales/feed/>|200|04/01/2026|valid|-|
40|El Caribe|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
41|Periodico Hoy - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
42|Teleuniverso|<https://teleuniversotv.com/feed/>|200|04/01/2026|valid|-|
43|Remolacha|<https://remolacha.net/feed/>|200|04/01/2026|valid|-|
44|De Ultimo Minuto|<https://deultimominuto.net/feed/>|200|04/01/2026|valid|-|
45|De Ultimo Minuto - Nacionales|<https://deultimominuto.net/category/nacionales/feed/>|200|04/01/2026|valid|-|
46|De Ultimo Minuto - Internacionales|<https://deultimominuto.net/category/internacionales/feed/>|200|04/01/2026|valid|-|
47|De Ultimo Minuto - Deportes|<https://deultimominuto.net/category/deportes/feed/>|200|04/01/2026|valid|-|
48|De Ultimo Minuto - Entretenimiento|<https://deultimominuto.net/category/entretenimiento/feed/>|200|04/01/2026|valid|-|
49|De Ultimo Minuto - Economia|<https://deultimominuto.net/category/economia/feed/>|200|04/01/2026|valid|-|
50|Telenoticias|<https://telenoticias.com.do/feed/>|200|04/01/2026|valid|-|
51|EnSegundos|<https://ensegundos.do/feed/>|200|04/01/2026|valid|-|
52|7 Dias|<https://7dias.com.do/feed/>|200|04/01/2026|valid|-|
53|Roberto Cavada|<https://robertocavada.com/feed/>|200|04/01/2026|valid|-|
54|Panorama|<https://panorama.com.do/feed/>|200|04/01/2026|valid|-|
55|DominicanosHoy|<https://www.dominicanoshoy.com/feed/>|200|04/01/2026|valid|-|
56|El Pregonero RD|<https://elpregonerord.com/feed/>|200|04/01/2026|valid|-|
57|Diario Digital RD|<https://diariodigitalrd.com/feed/>|200|04/01/2026|valid|-|
58|Ciudad Oriental|<https://ciudadoriental.com/feed/>|200|04/01/2026|valid|-|
59|El Jaya|<https://www.eljaya.com/feed/>|200|04/01/2026|valid|-|
60|Diario 55|<https://diario55.com/feed/>|ERR (TLS)|04/01/2026|invalid|-|
61|Noticia.do|<https://noticia.do/feed/>|200|04/01/2026|valid|-|
62|Bavaro News|<https://bavaronews.com/feed/>|200|04/01/2026|valid|-|
63|El Jacaguero|<https://eljacaguero.com.do/feed/>|200|04/01/2026|valid|-|
64|Diario Azua|<https://www.diarioazua.com/feeds/posts/default?alt=rss>|200|04/01/2026|valid|-|
65|Tras las Huellas Digital|<http://www.traslashuellasdigital.com.do/feed>|200|04/01/2026|valid|-|
66|Noticiario Barahona|<https://www.noticiariobarahona.com/feeds/posts/default?alt=rss>|200|04/01/2026|valid|-|
67|El Sol de Santiago|<https://elsoldesantiago.com/feed/>|200|04/01/2026|valid|-|
68|Diario Puerto Plata|<https://diariopuertoplata.com.do/feed/>|200|04/01/2026|valid|-|
69|Barriga Verde|<https://barrigaverde.net/feed/>|200|04/01/2026|valid|-|
70|La Informacion|<https://lainformacion.com.do/news/feed>|200|04/01/2026|valid|-|
71|Costa Verde DR|<https://costaverdedr.com/feed/>|200|04/01/2026|valid|-|

### Uruguay (UY)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|El Observador - Home|<https://www.elobservador.com.uy/rss/pages/home.xml>|200|04/01/2026|valid|-|
2|El Observador - Ultimo momento|<https://www.elobservador.com.uy/rss/pages/ultimo-momento.xml>|200|04/01/2026|valid|-|
3|El Observador - Mundo|<https://www.elobservador.com.uy/rss/pages/Mundo.xml>|200|04/01/2026|valid|-|
4|El Observador - Nacional|<https://www.elobservador.com.uy/rss/pages/nacional.xml>|200|04/01/2026|valid|-|
5|El Observador - Sociales|<https://www.elobservador.com.uy/rss/pages/sociales.xml>|200|04/01/2026|valid|-|
6|El Observador - Cafe y Negocios|<https://www.elobservador.com.uy/rss/pages/cafe-y-negocios.xml>|200|04/01/2026|valid|-|
7|El Observador - Agro|<https://www.elobservador.com.uy/rss/pages/Agro.xml>|200|04/01/2026|valid|-|
8|El Observador - Economia y Empresas|<https://www.elobservador.com.uy/rss/pages/economia.xml>|200|04/01/2026|valid|-|
9|El Observador - Opinion|<https://www.elobservador.com.uy/rss/pages/opinion.xml>|200|04/01/2026|valid|-|
10|El Observador - Salud|<https://www.elobservador.com.uy/rss/pages/salud.xml>|200|04/01/2026|valid|-|
11|El Observador - Ciencia y Tecnologia|<https://www.elobservador.com.uy/rss/pages/ciencia-y-tecnologia.xml>|200|04/01/2026|valid|-|
12|El Observador - Cultura y Espectaculos|<https://www.elobservador.com.uy/rss/pages/cultura-y-espectaculos.xml>|200|04/01/2026|valid|-|
13|El Observador - Ediciones especiales|<https://www.elobservador.com.uy/rss/pages/ediciones-especiales.xml>|200|04/01/2026|valid|-|
14|El Observador - Referi|<https://www.elobservador.com.uy/rss/pages/referi.xml>|200|04/01/2026|valid|-|
15|El Observador - Running|<https://www.elobservador.com.uy/rss/pages/running.xml>|200|04/01/2026|valid|-|
16|El Observador - Seleccion|<https://www.elobservador.com.uy/rss/pages/seleccion.xml>|200|04/01/2026|valid|-|
17|El Observador - Rugby|<https://www.elobservador.com.uy/rss/pages/rugby.xml>|200|04/01/2026|valid|-|
18|El Observador - Polideportivo|<https://www.elobservador.com.uy/rss/pages/polideportivo.xml>|200|04/01/2026|valid|-|
19|El Observador - Basquetbol|<https://www.elobservador.com.uy/rss/pages/basquetbol.xml>|200|04/01/2026|valid|-|
20|El Observador - Copa America|<https://www.elobservador.com.uy/rss/pages/copa-america-odl.xml>|200|04/01/2026|valid|-|
21|El Observador - Motor|<https://www.elobservador.com.uy/rss/pages/motor.xml>|200|04/01/2026|valid|-|
22|El Observador - Futbol internacional|<https://www.elobservador.com.uy/rss/pages/futbol-internacional.xml>|200|04/01/2026|valid|-|
23|El Observador - Futbol|<https://www.elobservador.com.uy/rss/pages/futbol.xml>|200|04/01/2026|valid|-|
24|El Observador - Copa Libertadores|<https://www.elobservador.com.uy/rss/pages/copa-libertadores.xml>|200|04/01/2026|valid|-|
25|Montevideo Portal - Informacion destacada|<https://www.montevideo.com.uy/anxml.aspx?58>|200|04/01/2026|valid|-|
26|Montevideo Portal - Noticias|<https://www.montevideo.com.uy/anxml.aspx?59>|200|04/01/2026|valid|-|
27|Montevideo Portal - Tiempo Libre|<https://www.montevideo.com.uy/anxml.aspx?60>|200|04/01/2026|valid|-|
28|Montevideo Portal - Tecnologia|<https://www.montevideo.com.uy/anxml.aspx?133>|200|04/01/2026|valid|-|
29|Montevideo Portal - Negocios & Tendencias|<https://www.montevideo.com.uy/anxml.aspx?728>|200|04/01/2026|valid|-|
30|Montevideo Portal - Deportes|<https://www.montevideo.com.uy/anxml.aspx?1727>|200|04/01/2026|valid|-|
31|El Pais - Portada|<https://www.elpais.com.uy/rss>|200|04/01/2026|valid|-|
32|El Pais - Economia|<https://www.elpais.com.uy/rss/economia-y-mercado>|200|04/01/2026|valid|-|
33|El Pais - Mundo|<https://www.elpais.com.uy/rss/mundo>|200|04/01/2026|valid|-|
34|El Pais - Ovacion|<https://www.elpais.com.uy/rss/ovacion>|200|04/01/2026|valid|-|
35|El Pais - Informacion|<https://www.elpais.com.uy/rss/informacion>|200|04/01/2026|valid|-|
36|El Pais - Bienestar|<https://www.elpais.com.uy/rss/bienestar>|200|04/01/2026|valid|-|
37|El Pais - TV Show|<https://www.elpais.com.uy/rss/tvshow>|200|04/01/2026|valid|-|
38|El Pais - Opinion|<https://www.elpais.com.uy/rss/opinion>|200|04/01/2026|valid|-|
39|El Pais - Domingo|<https://www.elpais.com.uy/rss/domingo>|200|04/01/2026|valid|-|
40|El Pais - Negocios|<https://www.elpais.com.uy/rss/negocios>|200|04/01/2026|valid|-|
41|El Pais - Vida Actual|<https://www.elpais.com.uy/rss/vida-actual>|200|04/01/2026|valid|-|
42|El Pais - Que Pasa|<https://www.elpais.com.uy/rss/que-pasa>|200|04/01/2026|valid|-|
43|Montevideo Portal - Negocios|<https://www.montevideo.com.uy/anxml.aspx?728>|200|04/01/2026|valid|-|
44|La Diaria - Politica|<https://ladiaria.com.uy/feeds/section/politica/>|needs check|04/01/2026|needs verification|-|
45|La Diaria - Economia|<https://ladiaria.com.uy/feeds/section/economia/>|needs check|04/01/2026|needs verification|-|
46|Subrayado - Home|<https://www.subrayado.com.uy/rss/pages/home.xml>|200|04/01/2026|valid|-|
47|Subrayado - Sociedad|<https://www.subrayado.com.uy/rss/pages/sociedad.xml>|200|04/01/2026|valid|-|
48|Subrayado - Nacional|<https://www.subrayado.com.uy/rss/pages/nacional.xml>|200|04/01/2026|valid|-|
49|Subrayado - Politica|<https://www.subrayado.com.uy/rss/pages/politica.xml>|200|04/01/2026|valid|-|
50|Subrayado - Policiales|<https://www.subrayado.com.uy/rss/pages/policiales.xml>|200|04/01/2026|valid|-|
51|Subrayado - Internacionales|<https://www.subrayado.com.uy/rss/pages/internacionales.xml>|200|04/01/2026|valid|-|
52|Subrayado - Opinion|<https://www.subrayado.com.uy/rss/pages/opinion.xml>|200|04/01/2026|valid|-|
53|Subrayado - Tecnologia e Internet|<https://www.subrayado.com.uy/rss/pages/tecnologia-internet.xml>|200|04/01/2026|valid|-|
54|Subrayado - Deportes|<https://www.subrayado.com.uy/rss/pages/deportes.xml>|200|04/01/2026|valid|-|
55|Subrayado - Economia|<https://www.subrayado.com.uy/rss/pages/economia.xml>|200|04/01/2026|valid|-|
56|Subrayado - Futbol Uruguayo|<https://www.subrayado.com.uy/rss/pages/futbol-uruguayo.xml>|200|04/01/2026|valid|-|
57|Subrayado - Futbol Internacional|<https://www.subrayado.com.uy/rss/pages/futbol-internacional.xml>|200|04/01/2026|valid|-|
58|Subrayado - Turf|<https://www.subrayado.com.uy/rss/pages/turf.xml>|200|04/01/2026|valid|-|
59|Subrayado - Empresariales|<https://www.subrayado.com.uy/rss/pages/empresariales.xml>|200|04/01/2026|valid|-|
60|Subrayado - Curiosidades|<https://www.subrayado.com.uy/rss/pages/curiosidades.xml>|200|04/01/2026|valid|-|
61|Subrayado - Cultura|<https://www.subrayado.com.uy/rss/pages/cultura.xml>|200|04/01/2026|valid|-|
62|Subrayado - Show|<https://www.subrayado.com.uy/rss/pages/show.xml>|200|04/01/2026|valid|-|
63|Subrayado|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
64|Teledoce|<https://www.teledoce.com/feed/>|200|04/01/2026|valid|-|
65|La Diaria - Home|<https://ladiaria.com.uy/feeds/articulos/>|200|04/01/2026|valid|-|
66|La Republica|<https://www.republica.com.uy/feed/>|needs check|04/01/2026|needs verification|-|
67|Caras y Caretas - Home|<https://www.carasycaretas.com.uy/rss/pages/home.xml>|200|04/01/2026|valid|-|
68|Telenoche|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
69|Telemundo Uruguay|<https://www.telemundo.com.uy/feed/>|200|04/01/2026|valid|-|
70|Uypress - Internacionales|<https://www.uypress.net/anxml.aspx?13>|200|04/01/2026|valid|-|
71|El Pais Uruguay|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
72|El Pais Uruguay - Content Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
73|970 Universal|<https://970universal.com/feed/>|200|04/01/2026|valid|-|
74|El Telegrafo|<https://www.eltelegrafo.com/feed/>|200|04/01/2026|valid|-|
75|Carmelo Portal|<https://www.carmeloportal.com/feed>|200|04/01/2026|valid|-|
76|San Jose Ahora|<https://sanjoseahora.com.uy/feed/>|200|04/01/2026|valid|-|
77|Sarandi 690|<https://www.sarandi690.com.uy/feed/>|200|04/01/2026|valid|-|
78|Canal 10 Uruguay - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
79|El Popular|<https://elpopular.uy/feed/>|200|04/01/2026|valid|-|
80|Grupo R Multimedio|<https://grupormultimedio.com/feed/>|200|04/01/2026|valid|-|
81|El Observador Uruguay - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
82|Tenfield|<https://www.tenfield.com.uy/feed/>|200|04/01/2026|valid|-|
83|El Bocon|<https://www.elbocon.com.uy/feed/>|200|04/01/2026|valid|-|
84|El Acontecer|<https://elacontecer.com.uy/feed/>|200|04/01/2026|valid|-|

### Austria (AT)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Der Standard|<https://www.derstandard.at/rss>|200|04/01/2026|valid|-|
2|ORF|<https://rss.orf.at/news.xml>|200|04/01/2026|valid|-|
3|Die Presse|<https://www.diepresse.com/rss>|200|04/01/2026|valid|-|
4|Tiroler Tageszeitung|<https://www.tt.com/rss/news.xml>|200|04/01/2026|valid|-|
5|ORF Aktuell|<https://rss.orf.at/>|needs check|04/01/2026|needs verification|-|
6|Kurier (Top News)|<https://kurier.at/xml/rssd>|200|04/01/2026|valid|-|
7|Neue Donau|<https://www.neue.at/feed>|200|04/01/2026|valid|-|
8|Der Standard|<https://www.derstandard.at/rss?section=welt>|200|04/01/2026|valid|-|
9|Kleine Zeitung|<https://www.kleinezeitung.at/rss/home>|200|04/01/2026|valid|-|
10|Kleine Zeitung - Politik|<https://www.kleinezeitung.at/rss/politik>|200|04/01/2026|valid|-|
11|Kleine Zeitung - Osterreich|<https://www.kleinezeitung.at/rss/oesterreich>|200|04/01/2026|valid|-|
12|Der Standard|<https://www.derstandard.at/rss?output=amp>|200|04/01/2026|valid|-|
13|Der Standard Plus|<https://www.derstandard.at/rss/wirtschaft>|200|04/01/2026|valid|-|
14|derStandard - International|<https://www.derstandard.at/rss/international>|200|04/01/2026|valid|-|
15|derStandard - Inland|<https://www.derstandard.at/rss/inland>|200|04/01/2026|valid|-|
16|derStandard - Web|<https://www.derstandard.at/rss/web>|200|04/01/2026|valid|-|
17|derStandard - Sport|<https://www.derstandard.at/rss/sport>|200|04/01/2026|valid|-|
18|derStandard - Panorama|<https://www.derstandard.at/rss/panorama>|200|04/01/2026|valid|-|
19|derStandard - Etat|<https://www.derstandard.at/rss/etat>|200|04/01/2026|valid|-|
20|derStandard - Kultur|<https://www.derstandard.at/rss/kultur>|200|04/01/2026|valid|-|
21|derStandard - Wissenschaft|<https://www.derstandard.at/rss/wissenschaft>|200|04/01/2026|valid|-|
22|derStandard - Gesundheit|<https://www.derstandard.at/rss/gesundheit>|200|04/01/2026|valid|-|
23|derStandard - Lifestyle|<https://www.derstandard.at/rss/lifestyle>|200|04/01/2026|valid|-|
24|derStandard - Karriere|<https://www.derstandard.at/rss/karriere>|200|04/01/2026|valid|-|
25|derStandard - Immobilien|<https://www.derstandard.at/rss/immobilien>|200|04/01/2026|valid|-|
26|derStandard - Diskurs|<https://www.derstandard.at/rss/diskurs>|200|04/01/2026|valid|-|
27|derStandard - dieStandard.at|<https://www.derstandard.at/rss/diestandard>|200|04/01/2026|valid|-|
28|derStandard - Live|<https://www.derstandard.at/rss/live>|200|04/01/2026|valid|-|
29|derStandard - Video|<https://www.derstandard.at/rss/video>|200|04/01/2026|valid|-|
30|derStandard - Podcast|<https://www.derstandard.at/rss/podcast>|200|04/01/2026|valid|-|
31|derStandard - Recht|<https://www.derstandard.at/rss/recht>|200|04/01/2026|valid|-|
32|ORF Wien (Vienna Local/Business)|<https://rss.orf.at/wien.xml>|200|04/01/2026|valid|-|
33|Die Presse (Political Headlines)|<https://www.diepresse.com/rss/Home>|needs check|04/01/2026|needs verification|-|
34|Die Presse (Economy)|<https://www.diepresse.com/rss/Wirtschaft>|200|04/01/2026|valid|-|
35|Die Presse - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
36|Kurier (Top Daily)|<https://kurier.at/xml/rss>|200|04/01/2026|valid|-|
37|PULS 24|<https://www.puls24.at/rssfeed>|200 (HTML_RETURNED)|04/01/2026|invalid|-|
38|PULS 24 - Article Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
39|exxpress|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
40|MeinBezirk|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
41|Finanzen.at (Stocks/Finance)|<https://www.finanzen.at/rss/news>|403 (HTTP_403)|04/01/2026|invalid|-|
42|Trend.at (Business Magazine)|<https://www.trend.at/xml/rss>|needs check|04/01/2026|needs verification|-|
43|Kronen Zeitung|<https://www.krone.at/rss.xml>|Recovered via sitemap|04/01/2026|valid|-|
44|Heute|<https://www.heute.at/rss/news>|needs check|04/01/2026|needs verification|-|
45|Heute - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
46|OE24|<https://www.oe24.at/news/rss>|Recovered via sitemap|04/01/2026|valid|-|
47|OR Nachrichten|<https://www.nachrichten.at/news/rss.xml>|Recovered via sitemap|04/01/2026|valid|-|
48|Vienna Online|<https://www.vienna.at/news/feed>|Recovered via sitemap|04/01/2026|valid|-|
49|Salzburger Nachrichten - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
50|Salzburg24 - News Artikel Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
51|Wiener Zeitung - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
52|Kurier - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
53|Kleine Zeitung - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
54|ORF Niederosterreich|<https://rss.orf.at/noe.xml>|200|04/01/2026|valid|-|
55|ORF Oberosterreich|<https://rss.orf.at/ooe.xml>|200|04/01/2026|valid|-|
56|ORF Salzburg|<https://rss.orf.at/salzburg.xml>|200|04/01/2026|valid|-|
57|ORF Tirol|<https://rss.orf.at/tirol.xml>|200|04/01/2026|valid|-|
58|ORF Vorarlberg|<https://rss.orf.at/vorarlberg.xml>|200|04/01/2026|valid|-|
59|ORF Karnten|<https://rss.orf.at/kaernten.xml>|200|04/01/2026|valid|-|
60|ORF Burgenland|<https://rss.orf.at/burgenland.xml>|200|04/01/2026|valid|-|
61|ORF Steiermark|<https://rss.orf.at/steiermark.xml>|200|04/01/2026|valid|-|
62|VOL.AT|<https://www.vol.at/rss>|200|04/01/2026|valid|-|
63|NON.at|<https://www.noen.at/xml/rss>|200|04/01/2026|valid|-|

### Norway (NO)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|NRK|<https://www.nrk.no/toppsaker.rss>|200|04/01/2026|valid|-|
2|NRK News|<https://www.nrk.no/nyheter/siste.rss>|200|04/01/2026|valid|-|
3|TV2|<https://www.tv2.no/rss/toppsaker.xml>|needs check|04/01/2026|needs verification|-|
4|E24|<https://e24.no/rss>|200|04/01/2026|valid|-|
5|Dagbladet|<https://www.dagbladet.no/rss/nyheter>|200|04/01/2026|valid|-|
6|TV2|<https://www.tv2.no/rss/nyheter/>|200|04/01/2026|valid|-|
7|E24|<https://e24.no/rss/okonomi.xml>|200|04/01/2026|valid|-|
8|TV2|<https://www.tv2.no/rss/politikk.xml>|needs check|04/01/2026|needs verification|-|
9|E24|<https://e24.no/rss/nyheter.xml>|200|04/01/2026|valid|-|
10|VG - Forsiden|<https://www.vg.no/rss/feed/forsiden/>|Recovered via sitemap|04/01/2026|valid|-|
11|VG - Innenriks|<https://www.vg.no/rss/feed/?categories=1069>|200|04/01/2026|valid|-|
12|VG - Utenriks|<https://www.vg.no/rss/feed/?categories=1070>|200|04/01/2026|valid|-|
13|E24 - Brs og finans|<https://e24.no/rss2/?seksjon=boers-og-finans>|200|04/01/2026|valid|-|
14|E24 - Aksjetips|<http://e24.no/rss2/?seksjon=aksjetips>|200|04/01/2026|valid|-|
15|E24 - IT & Telekom|<http://e24.no/rss2/?seksjon=it>|200|04/01/2026|valid|-|
16|NRK - RSS oversikt (directory)|<https://www.nrk.no/rss/>|needs check|04/01/2026|needs verification|-|
17|NRK - Innenriks|<https://www.nrk.no/norge/toppsaker.rss>|200|04/01/2026|valid|-|
18|TV2 - Nyheter|<https://www.tv2.no/rss/nyheter>|200|04/01/2026|valid|-|
19|TV2 - Innenriks|<https://www.tv2.no/rss/nyheter/innenriks>|200|04/01/2026|valid|-|
20|TV2 - Utenriks|<https://www.tv2.no/rss/nyheter/utenriks>|200|04/01/2026|valid|-|
21|TV2 - Sport|<https://www.tv2.no/rss/sport>|200|04/01/2026|valid|-|
22|TV2 - Underholdning|<https://www.tv2.no/rss/underholdning>|200|04/01/2026|valid|-|
23|Nettavisen - Alle saker|<https://www.nettavisen.no/service/rich-rss>|200|04/01/2026|valid|-|
24|Nettavisen - Nyheter|<https://www.nettavisen.no/service/rich-rss?tag=nyheter>|200|04/01/2026|valid|-|
25|Nettavisen - Sport|<https://www.nettavisen.no/service/rich-rss?tag=sport>|200|04/01/2026|valid|-|
26|Dagbladet|<https://www.dagbladet.no/?lab_viewport=rss>|200|04/01/2026|valid|-|
27|Aftenposten|<https://www.aftenposten.no/rss/>|200|04/01/2026|valid|-|
28|Dagsavisen|<https://www.dagsavisen.no/rss>|200|04/01/2026|valid|-|
29|DN - RSS directory|<https://services.dn.no/tools/rss>|needs check|04/01/2026|needs verification|-|
30|DN - Alle nyheter|<https://services.dn.no/api/feed/rss/>|200|04/01/2026|valid|-|
31|Finansavisen|<https://ws.finansavisen.no/api/articles.rss>|200|04/01/2026|valid|-|
32|Finansavisen - Brs|<https://ws.finansavisen.no/api/articles.rss?category=B%C3%B8rs>|200|04/01/2026|valid|-|
33|VG (Verdens Gang)|<https://www.vg.no/rss/feed>|200|04/01/2026|valid|-|
34|Finansavisen (Finance/Investment)|<https://finansavisen.no/rss>|needs check|04/01/2026|needs verification|-|
35|Teknisk Ukeblad (Tech/Energy/Marine)|<https://www.tu.no/feed>|Recovered via sitemap|04/01/2026|valid|-|
36|E24 Energi (Energy/Marine Industry)|<https://e24.no/energi/rss>|needs check|04/01/2026|needs verification|-|
37|Adresseavisen|<https://www.adressa.no/rss/>|200|04/01/2026|valid|-|
38|VG|<https://www.vg.no/rss/feed/>|200|04/01/2026|valid|-|
39|VG - Dine Penger Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
40|NRK - Oslo og Viken|<https://www.nrk.no/osloogviken/toppsaker.rss>|200|04/01/2026|valid|-|
41|NRK - Innlandet|<https://www.nrk.no/innlandet/toppsaker.rss>|200|04/01/2026|valid|-|
42|NRK - Vestland|<https://www.nrk.no/vestland/toppsaker.rss>|200|04/01/2026|valid|-|
43|NRK - Trondelag|<https://www.nrk.no/trondelag/toppsaker.rss>|200|04/01/2026|valid|-|
44|NRK - Rogaland|<https://www.nrk.no/rogaland/toppsaker.rss>|200|04/01/2026|valid|-|
45|NRK - Nordland|<https://www.nrk.no/nordland/toppsaker.rss>|200|04/01/2026|valid|-|
46|TV2 - Broom|<https://www.tv2.no/rss/broom>|200|04/01/2026|valid|-|
47|TV2 - Helse|<https://www.tv2.no/rss/nyheter/innenriks/helse>|200|04/01/2026|valid|-|
48|Bergens Tidende|<https://www.bt.no/rss>|200|04/01/2026|valid|-|
49|iTromso|<https://www.itromso.no/rss>|200|04/01/2026|valid|-|
50|NRK - Sorlandet|<https://www.nrk.no/sorlandet/toppsaker.rss>|200|04/01/2026|valid|-|
51|NRK - More og Romsdal|<https://www.nrk.no/mr/toppsaker.rss>|200|04/01/2026|valid|-|
52|NRK - Troms og Finnmark|<https://www.nrk.no/tromsogfinnmark/toppsaker.rss>|200|04/01/2026|valid|-|
53|NRK - Ostfold|<https://www.nrk.no/ostfold/toppsaker.rss>|200|04/01/2026|valid|-|
54|NRK - Telemark|<https://www.nrk.no/telemark/toppsaker.rss>|200|04/01/2026|valid|-|
55|Stavanger Aftenblad|<https://www.aftenbladet.no/rss>|200|04/01/2026|valid|-|
56|Sunnmorsposten|<https://www.smp.no/rss>|200|04/01/2026|valid|-|
57|NRK - Buskerud|<https://www.nrk.no/buskerud/toppsaker.rss>|200|04/01/2026|valid|-|
58|NRK - Vestfold|<https://www.nrk.no/vestfold/toppsaker.rss>|200|04/01/2026|valid|-|
59|NRK - Sogn og Fjordane|<https://www.nrk.no/sognogfjordane/toppsaker.rss>|200|04/01/2026|valid|-|
60|NRK - Agder|<https://www.nrk.no/agder/toppsaker.rss>|200|04/01/2026|valid|-|
61|NRK - Finnmark|<https://www.nrk.no/finnmark/toppsaker.rss>|200|04/01/2026|valid|-|
62|Avisa ST|<https://www.avisa-st.no/rss>|200|04/01/2026|valid|-|
63|Framtid i Nord|<https://www.framtidinord.no/rss>|200|04/01/2026|valid|-|
64|Altaposten|<https://www.altaposten.no/rss>|200|04/01/2026|valid|-|
65|Folkebladet|<https://www.folkebladet.no/rss>|200|04/01/2026|valid|-|
66|Varden|<https://www.varden.no/rss>|200|04/01/2026|valid|-|
67|Agderposten|<https://www.agderposten.no/rss>|200|04/01/2026|valid|-|
68|Lister24|<https://www.lister24.no/rss>|200|04/01/2026|valid|-|
69|Romsdals Budstikke|<https://www.rbnett.no/rss>|200|04/01/2026|valid|-|
70|Fosna-Folket|<https://www.fosna-folket.no/rss>|200|04/01/2026|valid|-|
71|VOL|<https://www.vol.no/rss>|200|04/01/2026|valid|-|
72|Innherred|<https://www.innherred.no/rss>|200|04/01/2026|valid|-|
73|Hallingdlen|<https://www.hallingdolen.no/rss>|200|04/01/2026|valid|-|
74|Sunnhordland|<https://www.sunnhordland.no/rss>|200|04/01/2026|valid|-|
75|ABC Nyheter - Article Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
76|Dagen - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
77|Dagsavisen - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
78|Vart Land - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
79|Khrono - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
80|Kampanje - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
81|Kommunal Rapport - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
82|Fdrelandsvennen|<https://www.fvn.no/rss>|200|04/01/2026|valid|-|

### Ireland (IE)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|RTE News|<https://www.rte.ie/feeds/rss/?index=/news/>|200|04/01/2026|valid|-|
2|TheJournal.ie|<https://www.thejournal.ie/feed/>|200|04/01/2026|valid|-|
3|Independent.ie|<https://www.independent.ie/rss/section/ada62966-6b00-4ead-a0ba-2c179a0730b0>|200|04/01/2026|valid|-|
4|Irish Times|<https://www.irishtimes.com/arc/outboundfeeds/rss/>|200|04/01/2026|valid|-|
5|DublinLive|<https://www.dublinlive.ie/rss.xml>|200|04/01/2026|valid|-|
6|Irish Examiner|<https://www.irishexaminer.com/feed/35-top_news.xml>|200|04/01/2026|valid|-|
7|Irish Examiner - Google Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
8|Irish Legal News|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
9|Irish Mirror|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
10|Irish Mirror - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
11|Irish Star|<https://www.irishstar.com/rss.xml>|200|04/01/2026|valid|-|
12|CorkBeo|<https://www.corkbeo.ie/rss.xml>|200|04/01/2026|valid|-|
13|GalwayBeo|<https://www.galwaybeo.ie/rss.xml>|200|04/01/2026|valid|-|
14|Leinster Leader|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
15|Limerick Leader|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
16|BreakingNews.ie|<https://feeds.breakingnews.ie/bntopstories>|200|04/01/2026|valid|-|
17|Extra.ie|<https://extra.ie/feed>|200|04/01/2026|valid|-|
18|Sunday World|<https://www.sundayworld.com/feed>|403 (HTTP_403)|04/01/2026|invalid|-|
19|RTE News - World|<https://www.rte.ie/feeds/rss/?index=/news/world/>|200|04/01/2026|valid|-|
20|RTE News - Business|<https://www.rte.ie/feeds/rss/?index=/news/business/>|200|04/01/2026|valid|-|
21|RTE News - Politics|<https://www.rte.ie/feeds/rss/?index=/news/politics/>|200|04/01/2026|valid|-|
22|RTE News - Regional|<https://www.rte.ie/feeds/rss/?index=/news/regional/>|200|04/01/2026|valid|-|
23|Independent.ie - News|<https://www.independent.ie/rss/section/1f0f9d8c-1f0e-4c8e-9d95-4d7b5c6f8a0c>|200|04/01/2026|valid|-|
24|Independent.ie - World|<https://www.independent.ie/rss/section/9d5837b5-d2c4-400f-b668-56d7cb7781ef>|200|04/01/2026|valid|-|
25|BreakingNews.ie - Ireland|<https://feeds.breakingnews.ie/bnireland>|200|04/01/2026|valid|-|
26|RTE News - Europe|<https://www.rte.ie/feeds/rss/?index=/news/europe/>|200|04/01/2026|valid|-|
27|RTE News - Dublin|<https://www.rte.ie/feeds/rss/?index=/news/dublin/>|200|04/01/2026|valid|-|
28|RTE News - Munster|<https://www.rte.ie/feeds/rss/?index=/news/munster/>|200|04/01/2026|valid|-|
29|RTE News - Leinster|<https://www.rte.ie/feeds/rss/?index=/news/leinster/>|200|04/01/2026|valid|-|
30|RTE News - Connacht|<https://www.rte.ie/feeds/rss/?index=/news/connacht/>|200|04/01/2026|valid|-|
31|RTE News - Ulster|<https://www.rte.ie/feeds/rss/?index=/news/ulster/>|200|04/01/2026|valid|-|
32|Independent.ie - Business|<https://www.independent.ie/rss/section/business/>|200|04/01/2026|valid|-|
33|Independent.ie - Sport|<https://www.independent.ie/rss/section/sport/>|200|04/01/2026|valid|-|
34|Independent.ie - Irish News|<https://www.independent.ie/rss/section/irish-news/>|200|04/01/2026|valid|-|
35|Independent.ie - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
36|The Sun Ireland|<https://www.thesun.ie/feed/>|200 (HTML_RETURNED)|04/01/2026|invalid|-|
37|BelfastLive|<https://www.belfastlive.co.uk/rss.xml>|200|04/01/2026|valid|-|
38|Buzz.ie|<https://www.buzz.ie/rss.xml>|200|04/01/2026|valid|-|
39|BreakingNews.ie - World|<https://feeds.breakingnews.ie/bnworld>|200|04/01/2026|valid|-|
40|BreakingNews.ie - Business|<https://feeds.breakingnews.ie/bnbusiness>|200|04/01/2026|valid|-|
41|BreakingNews.ie - Sport|<https://feeds.breakingnews.ie/bnsport>|200|04/01/2026|valid|-|
42|Extra.ie - News|<https://extra.ie/category/news/feed>|200|04/01/2026|valid|-|
43|Extra.ie - Business|<https://extra.ie/category/business/feed>|200|04/01/2026|valid|-|
44|Extra.ie - Sport|<https://extra.ie/category/sport/feed>|200|04/01/2026|valid|-|
45|Extra.ie - Entertainment|<https://extra.ie/category/entertainment/feed>|200|04/01/2026|valid|-|
46|Newstalk|<https://www.newstalk.com/feed>|200|04/01/2026|valid|-|
47|Agriland|<https://www.agriland.ie/feed/>|200|04/01/2026|valid|-|
48|The42|<https://www.the42.ie/feed/>|200|04/01/2026|valid|-|
49|Silicon Republic|<https://www.siliconrepublic.com/feed>|200|04/01/2026|valid|-|
50|The Currency|<https://thecurrency.news/feed/>|200|04/01/2026|valid|-|
51|Off The Ball|<https://www.offtheball.com/feed>|200|04/01/2026|valid|-|
52|Business Plus|<https://businessplus.ie/feed/>|200|04/01/2026|valid|-|
53|Irish Tech News|<https://irishtechnews.ie/feed/>|200|04/01/2026|valid|-|
54|RTE Sport|<https://www.rte.ie/feeds/rss/?index=/sport/>|200|04/01/2026|valid|-|
55|Belfast Telegraph|<https://www.belfasttelegraph.co.uk/rss>|200|04/01/2026|valid|-|
56|Irish Post|<https://www.irishpost.com/feed>|200|04/01/2026|valid|-|
57|Donegal Daily|<https://www.donegaldaily.com/feed/>|200|04/01/2026|valid|-|
58|Clare Echo|<https://www.clareecho.ie/feed/>|200|04/01/2026|valid|-|
59|Echo Live|<https://www.echolive.ie/feed/395-EE_Top_news.xml>|200|04/01/2026|valid|-|
60|IrishCentral|<https://www.irishcentral.com/feeds/section-articles.atom>|200|04/01/2026|valid|-|
61|Connacht Tribune|<https://www.connachttribune.ie/rss>|200|04/01/2026|valid|-|
62|Limerick Post|<https://www.limerickpost.ie/feed/>|200|04/01/2026|valid|-|
63|Irish News - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
64|Mayo News - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
65|Kilkenny People - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
66|Longford Leader - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
67|Leitrim Observer - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
68|Waterford Live - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
69|Tipperary Live - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
70|Clare Champion|<https://clarechampion.ie/feed/>|200|04/01/2026|valid|-|
71|Donegal News|<https://donegalnews.com/feed/>|200|04/01/2026|valid|-|
72|Independent.ie - Wexford People|<https://www.independent.ie/rss/section/2320c30a-4d55-4ddc-ac2d-e5dafaefd385/>|200|04/01/2026|valid|-|
73|Independent.ie - Wicklow People|<https://www.independent.ie/rss/section/72e3f15d-512a-4694-9184-7413cb673582/>|200|04/01/2026|valid|-|
74|Independent.ie - Louth|<https://www.independent.ie/rss/section/1095fba6-e53c-4aba-8f19-420bff2fdc77/>|200|04/01/2026|valid|-|
75|Independent.ie - Galway|<https://www.independent.ie/rss/section/206fde0b-458a-4fe4-b0c1-b076011030b7/>|200|04/01/2026|valid|-|
76|Independent.ie - Tipperary|<https://www.independent.ie/rss/section/fce880c7-e884-493a-934d-b07601174bfa/>|200|04/01/2026|valid|-|
77|Independent.ie - Clare|<https://www.independent.ie/rss/section/c3822c5d-48bc-4f56-9f4b-b076010a2da0/>|200|04/01/2026|valid|-|
78|Independent.ie - Longford|<https://www.independent.ie/rss/section/69967d4d-6418-480f-ad6b-b0760114a17f/>|200|04/01/2026|valid|-|
79|Independent.ie - Sligo Champion|<https://www.independent.ie/rss/section/d46264f9-3ba1-4c55-a3fa-0b395c6fd904/>|200|04/01/2026|valid|-|
80|Independent.ie - Kerryman|<https://www.independent.ie/rss/section/f26f027f-1420-42b9-8bdf-bcafbf9e4b18/>|200|04/01/2026|valid|-|

### Portugal (PT)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Observador|<https://observador.pt/feed/>|200|04/01/2026|valid|-|
2|ECO|<https://eco.sapo.pt/feed/>|200|04/01/2026|valid|-|
3|Publico|<https://feeds.feedburner.com/PublicoRSS>|200|04/01/2026|valid|-|
4|Diario de Noticias|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
5|Dinheiro Vivo|<https://dinheirovivo.dn.pt/feed>|200|04/01/2026|valid|-|
6|Jornal Economico|<https://jornaleconomico.sapo.pt/feed/>|200|04/01/2026|valid|-|
7|SIC Noticias|<https://rss.impresa.pt/feed/latest/sicnot.rss?type=ARTICLE,VIDEO,GALLERY,STREAM,PLAYLIST,EVENT,NEWSLETTER&limit=100&pubsubhub=true>|200|04/01/2026|valid|-|
8|Expresso|<https://rss.impresa.pt/feed/latest/expresso.rss?type=ARTICLE,VIDEO,STREAM,PLAYLIST,EVENT&limit=100&pubsubhub=true>|200|04/01/2026|valid|-|
9|RTP Noticias|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
10|RTP - Pais|<https://www.rtp.pt/noticias/rss/pais>|200|04/01/2026|valid|-|
11|RTP - Mundo|<https://www.rtp.pt/noticias/rss/mundo>|200|04/01/2026|valid|-|
12|RTP - Politica|<https://www.rtp.pt/noticias/rss/politica>|200|04/01/2026|valid|-|
13|RTP - Economia|<https://www.rtp.pt/noticias/rss/economia>|200|04/01/2026|valid|-|
14|RTP - Desporto|<https://www.rtp.pt/noticias/rss/desporto>|200|04/01/2026|valid|-|
15|RTP - Cultura|<https://www.rtp.pt/noticias/rss/cultura>|200|04/01/2026|valid|-|
16|RTP - Videos|<https://www.rtp.pt/noticias/rss/videos>|200|04/01/2026|valid|-|
17|RTP - Audios|<https://www.rtp.pt/noticias/rss/audios>|200|04/01/2026|valid|-|
18|CNN Portugal|<https://cnnportugal.iol.pt/rss.xml>|200|04/01/2026|valid|-|
19|Noticias ao Minuto - Ultima Hora|<https://www.noticiasaominuto.com/rss/ultima-hora>|200|04/01/2026|valid|-|
20|Noticias ao Minuto - Pais|<https://www.noticiasaominuto.com/rss/pais>|200|04/01/2026|valid|-|
21|Noticias ao Minuto - Mundo|<https://www.noticiasaominuto.com/rss/mundo>|200|04/01/2026|valid|-|
22|Noticias ao Minuto - Economia|<https://www.noticiasaominuto.com/rss/economia>|200|04/01/2026|valid|-|
23|Executive Digest|<https://executivedigest.sapo.pt/feed/>|200|04/01/2026|valid|-|
24|Visao|<https://visao.pt/feed/>|200|04/01/2026|valid|-|
25|NiT|<https://www.nit.pt/feed>|200|04/01/2026|valid|-|
26|24 Noticias|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
27|SAPO - Article Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
28|Jornal de Negocios|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
29|Correio da Manha|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
30|Sol|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
31|A Bola|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
32|Record|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
33|Noticias ao Minuto - Desporto|<https://www.noticiasaominuto.com/rss/desporto>|200|04/01/2026|valid|-|
34|Noticias ao Minuto - Tech|<https://www.noticiasaominuto.com/rss/tech>|200|04/01/2026|valid|-|
35|Noticias ao Minuto - Fama|<https://www.noticiasaominuto.com/rss/fama>|200|04/01/2026|valid|-|

### Denmark (DK)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|DR Nyheder|<https://www.dr.dk/nyheder/service/feeds/allenyheder>|200|04/01/2026|valid|-|
2|Politiken|<https://politiken.dk/rss/senestenyt.rss>|200|04/01/2026|valid|-|
3|Ekstra Bladet|<https://ekstrabladet.dk/rssfeed/nyheder/>|200|04/01/2026|valid|-|
4|Berlingske|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
5|BT|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
6|Jyllands-Posten|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
7|Jyllands-Posten - Topnyheder|<https://feeds.jp.dk/jp/topnyheder>|200|04/01/2026|valid|-|
8|Jyllands-Posten - Seneste|<https://feeds.jp.dk/jp/seneste>|200|04/01/2026|valid|-|
9|Avisen.dk|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
10|TV Syd|<https://www.tvsyd.dk/rss>|200|04/01/2026|valid|-|
11|TV Midtvest|<https://www.tvmidtvest.dk/rss>|200|04/01/2026|valid|-|
12|MigogKBH|<https://migogkbh.dk/feed/>|200|04/01/2026|valid|-|
13|MigogAarhus|<https://migogaarhus.dk/feed/>|200|04/01/2026|valid|-|
14|MigogOdense|<https://migogodense.dk/feed/>|200|04/01/2026|valid|-|
15|MigogAalborg|<https://migogaalborg.dk/feed/>|200|04/01/2026|valid|-|
16|DR Indland|<https://www.dr.dk/nyheder/service/feeds/indland>|200|04/01/2026|valid|-|
17|DR Udland|<https://www.dr.dk/nyheder/service/feeds/udland>|200|04/01/2026|valid|-|
18|DR Penge|<https://www.dr.dk/nyheder/service/feeds/penge>|200|04/01/2026|valid|-|
19|DR Sporten|<https://www.dr.dk/nyheder/service/feeds/sporten>|200|04/01/2026|valid|-|
20|DR Kultur|<https://www.dr.dk/nyheder/service/feeds/kultur>|200|04/01/2026|valid|-|
21|Politiken - Indland|<https://politiken.dk/rss/indland.rss>|200|04/01/2026|valid|-|
22|Politiken - Udland|<https://politiken.dk/rss/udland.rss>|200|04/01/2026|valid|-|
23|Politiken - Kultur|<https://politiken.dk/rss/kultur.rss>|200|04/01/2026|valid|-|
24|Politiken - Sport|<https://politiken.dk/rss/sport.rss>|200|04/01/2026|valid|-|
25|Borsen|<https://borsen.dk/rss>|200|04/01/2026|valid|-|
26|Borsen - Finans|<https://borsen.dk/rss/finans>|200|04/01/2026|valid|-|
27|Borsen - Investor|<https://borsen.dk/rss/investor>|200|04/01/2026|valid|-|
28|Borsen - Politik|<https://borsen.dk/rss/politik>|200|04/01/2026|valid|-|
29|Borsen - Udland|<https://borsen.dk/rss/udland>|200|04/01/2026|valid|-|
30|Borsen - Ejendomme|<https://borsen.dk/rss/ejendomme>|200|04/01/2026|valid|-|
31|Borsen - Executive|<https://borsen.dk/rss/executive>|200|04/01/2026|valid|-|
32|Borsen - Opinion|<https://borsen.dk/rss/opinion>|200|04/01/2026|valid|-|
33|Borsen - Markedsberetninger|<https://borsen.dk/rss/markedsberetninger>|200|04/01/2026|valid|-|
34|Borsen - Baeredygtig|<https://borsen.dk/rss/baeredygtig>|200|04/01/2026|valid|-|
35|Borsen - Virksomheder|<https://borsen.dk/rss/virksomheder>|200|04/01/2026|valid|-|
36|TV2 Kosmopol - Sitemap|<https://www.tv2kosmopol.dk/rss>|200|04/01/2026|valid|-|
37|TV2 Fyn - Sitemap|<https://www.tv2fyn.dk/rss>|200|04/01/2026|valid|-|
38|TV MIDTVEST - Sitemap|<https://www.tvmidtvest.dk/rss>|200|04/01/2026|valid|-|
39|TV2 Nord - Sitemap|<https://www.tv2nord.dk/rss>|200|04/01/2026|valid|-|
40|TV2 Ostjylland - Sitemap|<https://www.tv2ostjylland.dk/rss>|200|04/01/2026|valid|-|
41|TV2 East - Sitemap|<https://www.tv2east.dk/rss>|200|04/01/2026|valid|-|
42|TV2 Bornholm - Sitemap|<https://www.tv2bornholm.dk/rss>|200|04/01/2026|valid|-|
43|TV2 Lorry - Sitemap|<https://www.tv2lorry.dk/rss>|200|04/01/2026|valid|-|
44|Nordjyske - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
45|Fyens - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
46|Information - Sitemap|<https://www.information.dk/feed>|200|04/01/2026|valid|-|
47|Finans.dk - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
48|Finans.dk - Topnyheder|<https://feeds.finans.dk/topnyheder>|200|04/01/2026|valid|-|
49|Finans.dk - Seneste|<https://feeds.finans.dk/seneste>|200|04/01/2026|valid|-|
50|DR Seneste Nyt|<https://www.dr.dk/nyheder/service/feeds/senestenyt>|200|04/01/2026|valid|-|
51|Avisen Danmark - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
52|Jyllands-Posten - Mest Laeste|<https://feeds.jp.dk/jp/mest-laeste>|200|04/01/2026|valid|-|
53|Information - Latest Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
54|Altinget|<https://www.altinget.dk/rss>|200|04/01/2026|valid|-|
55|Weekendavisen|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
56|Ingenioren|<https://ing.dk/rss>|200|04/01/2026|valid|-|
57|Version2|<https://version2.dk/rss>|200|04/01/2026|valid|-|
58|Kristeligt Dagblad - Latest RSS|<https://www.kristeligt-dagblad.dk/feed/rss/latest>|200|04/01/2026|valid|-|
59|Nordjyske - Nyheder|<https://nordjyske.dk/rss/nyheder>|200|04/01/2026|valid|-|
60|Nordjyske - Aalborg|<https://nordjyske.dk/rss/aalborg>|200|04/01/2026|valid|-|
61|Nordjyske - Frederikshavn|<https://nordjyske.dk/rss/frederikshavn>|200|04/01/2026|valid|-|
62|Nordjyske - Hjorring|<https://nordjyske.dk/rss/hjoerring>|200|04/01/2026|valid|-|
63|Nordjyske - Bronderslev|<https://nordjyske.dk/rss/broenderslev>|200|04/01/2026|valid|-|
64|Nordjyske - Jammerbugt|<https://nordjyske.dk/rss/jammerbugt>|200|04/01/2026|valid|-|
65|Nordjyske - Mariagerfjord|<https://nordjyske.dk/rss/mariagerfjord>|200|04/01/2026|valid|-|
66|Nordjyske - Mors|<https://nordjyske.dk/rss/mors>|200|04/01/2026|valid|-|
67|Nordjyske - Rebild|<https://nordjyske.dk/rss/rebild>|200|04/01/2026|valid|-|
68|Nordjyske - Vesthimmerland|<https://nordjyske.dk/rss/vesthimmerland>|200|04/01/2026|valid|-|
69|Nordjyske - Thisted|<https://nordjyske.dk/rss/thisted>|200|04/01/2026|valid|-|
70|Nordjyske - Sport|<https://nordjyske.dk/rss/sport>|200|04/01/2026|valid|-|
71|Nordjyske - Erhverv|<https://nordjyske.dk/rss/erhverv>|200|04/01/2026|valid|-|
72|Folketidende - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
73|SN.dk - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
74|Stiften - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
75|HSFO - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
76|Amtsavisen - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
77|VAFO - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
78|Viborg Folkeblad - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
79|Dagbladet Holstebro-Struer - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
80|JV - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
81|FAA - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
82|Copenhagen Post|<https://cphpost.dk/feed/>|200|04/01/2026|valid|-|
83|Arbejderen|<https://arbejderen.dk/feed/>|200|04/01/2026|valid|-|

### Finland (FI)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Yle Uutiset|<https://feeds.yle.fi/uutiset/v1/majorHeadlines/YLE_UUTISET.rss?publisherIds=YLE_UUTISET>|200|04/01/2026|valid|-|
2|Helsingin Sanomat|<https://www.hs.fi/rss/tuoreimmat.xml>|200|04/01/2026|valid|-|
3|Ilta-Sanomat|<https://www.is.fi/rss/tuoreimmat.xml>|200|04/01/2026|valid|-|
4|Iltalehti|<https://www.iltalehti.fi/rss.xml>|200|04/01/2026|valid|-|
5|MTV Uutiset|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
6|Kauppalehti|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
7|HBL|<https://www.hbl.fi/feeds/feed.xml>|200|04/01/2026|valid|-|
8|ESS|<https://www.ess.fi/feed/rss>|200|04/01/2026|valid|-|
9|Turun Sanomat - Latest Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
10|Turun Sanomat - Google News|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
11|Kaleva - Uusimmat|<https://kaleva.fi/feedit/rss/managed-listing/rss-uusimmat/>|200|04/01/2026|valid|-|
12|Lapin Kansa - Lappi|<https://www.lapinkansa.fi/feedit/rss/managed-listing/lappi/>|200|04/01/2026|valid|-|
13|Lapin Kansa - Urheilu|<https://www.lapinkansa.fi/feedit/rss/managed-listing/urheilu/>|200|04/01/2026|valid|-|
14|Aamulehti|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
15|Satakunnan Kansa|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
16|KSML|<https://www.ksml.fi/feed/rss>|200|04/01/2026|valid|-|
17|Maaseudun Tulevaisuus|<https://www.maaseuduntulevaisuus.fi/feeds/maaseuduntulevaisuus>|200|04/01/2026|valid|-|
18|Aamuposti|<https://www.aamuposti.fi/feed/rss>|200|04/01/2026|valid|-|
19|Lansi-Savo|<https://www.lansi-savo.fi/feed/rss>|200|04/01/2026|valid|-|
20|Warkauden Lehti|<https://www.warkaudenlehti.fi/feed/rss>|200|04/01/2026|valid|-|
21|Suur-Keuruu|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
22|Ita-Savo|<https://www.ita-savo.fi/feed/rss>|200|04/01/2026|valid|-|
23|Yle Uutiset - Kotimaa|<https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_UUTISET&concepts=18-34837>|200|04/01/2026|valid|-|
24|Ilta-Sanomat - Kotimaa|<https://www.is.fi/rss/kotimaa.xml>|200|04/01/2026|valid|-|
25|Ilta-Sanomat - Ulkomaat|<https://www.is.fi/rss/ulkomaat.xml>|200|04/01/2026|valid|-|
26|Ilta-Sanomat - Taloussanomat|<https://www.is.fi/rss/taloussanomat.xml>|200|04/01/2026|valid|-|
27|Ilta-Sanomat - Urheilu|<https://www.is.fi/rss/urheilu.xml>|200|04/01/2026|valid|-|
28|Iltalehti - Uutiset|<https://www.iltalehti.fi/rss/uutiset.xml>|200|04/01/2026|valid|-|
29|Iltalehti - Kotimaa|<https://www.iltalehti.fi/rss/kotimaa.xml>|200|04/01/2026|valid|-|
30|Iltalehti - Ulkomaat|<https://www.iltalehti.fi/rss/ulkomaat.xml>|200|04/01/2026|valid|-|
31|Iltalehti - Talous|<https://www.iltalehti.fi/rss/talous.xml>|200|04/01/2026|valid|-|
32|Helsingin Sanomat - Talous|<https://www.hs.fi/rss/talous.xml>|200|04/01/2026|valid|-|
33|Helsingin Sanomat - Urheilu|<https://www.hs.fi/rss/urheilu.xml>|200|04/01/2026|valid|-|
34|Yle Uutiset - Maailma|<https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_UUTISET&concepts=18-34953>|200|04/01/2026|valid|-|
35|Yle Uutiset - Talous|<https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_UUTISET&concepts=18-19274>|200|04/01/2026|valid|-|
36|Yle Urheilu|<https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_URHEILU>|200|04/01/2026|valid|-|
37|Yle Uutiset - Kulttuuri|<https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_UUTISET&concepts=18-150067>|200|04/01/2026|valid|-|
38|Yle Uutiset - Paakaupunkiseutu|<https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_UUTISET&concepts=18-34953,18-34837>|200|04/01/2026|valid|-|
39|Savon Sanomat|<https://www.savonsanomat.fi/feed/rss>|200|04/01/2026|valid|-|
40|Karjalainen|<https://www.karjalainen.fi/rss>|200|04/01/2026|valid|-|
41|Hameen Sanomat|<https://www.hameensanomat.fi/feed/rss>|200|04/01/2026|valid|-|
42|Kouvolan Sanomat|<https://www.kouvolansanomat.fi/feed/rss>|200|04/01/2026|valid|-|
43|Keskipohjanmaa|<https://www.keskipohjanmaa.fi/feed/rss>|200|04/01/2026|valid|-|
44|Kymen Sanomat|<https://www.kymensanomat.fi/feed/rss>|200|04/01/2026|valid|-|
45|Etela-Saimaa|<https://www.esaimaa.fi/feed/rss>|200|04/01/2026|valid|-|
46|Uusimaa|<https://www.uusimaa.fi/feed/rss>|200|04/01/2026|valid|-|
47|Kainuun Sanomat|<https://www.kainuunsanomat.fi/feed/rss>|200|04/01/2026|valid|-|
48|Aamulehti - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
49|Talouselama - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
50|Tekniikkatalous - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
51|Verkkouutiset|<https://www.verkkouutiset.fi/feed/>|200|04/01/2026|valid|-|
52|Ilta-Sanomat - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
53|Helsingin Sanomat - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
54|MTV Uutiset - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
55|Iltalehti - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
56|Helsingin Sanomat - Politiikka|<https://www.hs.fi/rss/politiikka.xml>|200|04/01/2026|valid|-|
57|Helsingin Sanomat - Kulttuuri|<https://www.hs.fi/rss/kulttuuri.xml>|200|04/01/2026|valid|-|
58|Ilta-Sanomat - Viihde|<https://www.is.fi/rss/viihde.xml>|200|04/01/2026|valid|-|
59|Ilta-Sanomat - Digitoday|<https://www.is.fi/rss/digitoday.xml>|200|04/01/2026|valid|-|
60|Ilta-Sanomat - Autot|<https://www.is.fi/rss/autot.xml>|200|04/01/2026|valid|-|
61|Iltalehti - Viihde|<https://www.iltalehti.fi/rss/viihde.xml>|200|04/01/2026|valid|-|
62|Iltalehti - Urheilu|<https://www.iltalehti.fi/rss/urheilu.xml>|200|04/01/2026|valid|-|
63|Iltalehti - Digiuutiset|<https://www.iltalehti.fi/rss/digiuutiset.xml>|200|04/01/2026|valid|-|
64|Iltalehti - TV ja leffat|<https://www.iltalehti.fi/rss/tv-ja-leffat.xml>|200|04/01/2026|valid|-|
65|Ilta-Sanomat - Politiikka|<https://www.is.fi/rss/politiikka.xml>|200|04/01/2026|valid|-|
66|Ilta-Sanomat - Tiede|<https://www.is.fi/rss/tiede.xml>|200|04/01/2026|valid|-|
67|Ilta-Sanomat - Terveys|<https://www.is.fi/rss/terveys.xml>|200|04/01/2026|valid|-|
68|Ilta-Sanomat - Matkat|<https://www.is.fi/rss/matkat.xml>|200|04/01/2026|valid|-|
69|Ilta-Sanomat - Formula 1|<https://www.is.fi/rss/formula1.xml>|200|04/01/2026|valid|-|
70|Iltalehti - Politiikka|<https://www.iltalehti.fi/rss/politiikka.xml>|200|04/01/2026|valid|-|
71|Iltalehti - Autot|<https://www.iltalehti.fi/rss/autot.xml>|200|04/01/2026|valid|-|
72|Iltalehti - Terveys|<https://www.iltalehti.fi/rss/terveys.xml>|200|04/01/2026|valid|-|
73|Iltalehti - Jalkapallo|<https://www.iltalehti.fi/rss/jalkapallo.xml>|200|04/01/2026|valid|-|
74|Iltalehti - Jaakiekko|<https://www.iltalehti.fi/rss/jaakiekko.xml>|200|04/01/2026|valid|-|
75|Ilta-Sanomat - Jaakiekko|<https://www.is.fi/rss/jaakiekko.xml>|200|04/01/2026|valid|-|
76|Ilta-Sanomat - Jalkapallo|<https://www.is.fi/rss/jalkapallo.xml>|200|04/01/2026|valid|-|
77|Ilta-Sanomat - Ralli|<https://www.is.fi/rss/ralli.xml>|200|04/01/2026|valid|-|
78|Iltalehti - Musiikki|<https://www.iltalehti.fi/rss/musiikki.xml>|200|04/01/2026|valid|-|
79|Iltalehti - NHL|<https://www.iltalehti.fi/rss/nhl.xml>|200|04/01/2026|valid|-|
80|Uusi Suomi - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
81|Suomenmaa|<https://www.suomenmaa.fi/feed/>|200|04/01/2026|valid|-|
82|Demokraatti|<https://demokraatti.fi/feed/>|200|04/01/2026|valid|-|
83|Tivi|<https://www.tivi.fi/api/feed/v2/rss/tv>|200|04/01/2026|valid|-|
84|Mikrobitti|<https://www.mikrobitti.fi/rss/bitti.xml>|Recovered via sitemap|04/01/2026|valid|-|
85|Tekniikka & Talous|<https://www.tekniikkatalous.fi/api/feed/v2/rss/tt>|200|04/01/2026|valid|-|
86|Talouselama|<https://www.talouselama.fi/api/feed/v2/rss/te>|200|04/01/2026|valid|-|
87|Arvopaperi|<https://www.arvopaperi.fi/api/feed/v2/rss/ap>|200|04/01/2026|valid|-|
88|Seiska|<https://www.seiska.fi/latest.rss>|200|04/01/2026|valid|-|
89|Suomen Kuvalehti|<https://suomenkuvalehti.fi/feed/>|200|04/01/2026|valid|-|

### Czech Republic (CZ)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|CT24|<https://ct24.ceskatelevize.cz/rss/tema/vyber-redakce-84313>|200|04/01/2026|valid|-|
2|Aktualne.cz|<https://zpravy.aktualne.cz/rss/>|200|04/01/2026|valid|-|
3|Novinky.cz|<https://www.novinky.cz/rss>|200|04/01/2026|valid|-|
4|Seznam Zpravy|<https://www.seznamzpravy.cz/rss>|200|04/01/2026|valid|-|
5|Denik|<https://www.denik.cz/rss/zpravy.html>|200|04/01/2026|valid|-|
6|iDNES.cz|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
7|Blesk|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
8|E15|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
9|Lidovky.cz|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
10|Echo24|<https://www.echo24.cz/rss/s/homepage>|200|04/01/2026|valid|-|
11|iROZHLAS|<https://www.irozhlas.cz/rss/irozhlas>|200|04/01/2026|valid|-|
12|iROZHLAS - Domov|<https://www.irozhlas.cz/rss/irozhlas/section/zpravy-domov>|200|04/01/2026|valid|-|
13|iROZHLAS - Svet|<https://www.irozhlas.cz/rss/irozhlas/section/zpravy-svet>|200|04/01/2026|valid|-|
14|iROZHLAS - Sport|<https://www.irozhlas.cz/rss/irozhlas/section/sport>|200|04/01/2026|valid|-|
15|CNN Prima|<https://cnn.iprima.cz/rss>|200|04/01/2026|valid|-|
16|Forum24|<https://www.forum24.cz/feed>|200|04/01/2026|valid|-|
17|Reflex|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
18|ParlamentniListy|<http://www.parlamentnilisty.cz/export/rss.aspx>|200|04/01/2026|valid|-|
19|Hospodarske noviny|<https://archiv.hn.cz/rss/zpravodajstvi>|200|04/01/2026|valid|-|
20|HN - Byznys|<https://byznys.hn.cz/?m=rss>|200|04/01/2026|valid|-|
21|HN - Domaci|<https://domaci.hn.cz/?m=rss>|200|04/01/2026|valid|-|
22|HN - Zahranicni|<https://zahranicni.hn.cz/?m=rss>|200|04/01/2026|valid|-|
23|iSport|<https://isport.blesk.cz/rss>|200|04/01/2026|valid|-|
24|Blesk - Zpravy|<https://www.blesk.cz/rss/zpravy>|200|04/01/2026|valid|-|
25|Seznam Zpravy - Domaci|<https://www.seznamzpravy.cz/rss/domaci>|200|04/01/2026|valid|-|
26|Seznam Zpravy - Zahranicni|<https://www.seznamzpravy.cz/rss/zahranicni>|200|04/01/2026|valid|-|
27|Zive.cz|<https://www.zive.cz/rss/sc-47/>|200|04/01/2026|valid|-|
28|Auto.cz|<https://www.auto.cz/rss>|200|04/01/2026|valid|-|
29|Denik N|<https://denikn.cz/feed/>|200|04/01/2026|valid|-|
30|Lupa.cz|<https://www.lupa.cz/rss/clanky/>|200|04/01/2026|valid|-|
31|Aktualne.cz - Domaci|<https://zpravy.aktualne.cz/rss/domaci/>|200|04/01/2026|valid|-|
32|Aktualne.cz - Zahranici|<https://zpravy.aktualne.cz/rss/zahranici/>|200|04/01/2026|valid|-|
33|Sport.cz|<https://www.sport.cz/rss/>|200|04/01/2026|valid|-|
34|Novinky.cz - Domaci|<https://www.novinky.cz/rss/domaci>|200|04/01/2026|valid|-|
35|Novinky.cz - Zahranicni|<https://www.novinky.cz/rss/zahranicni>|200|04/01/2026|valid|-|
36|Novinky.cz - Ekonomika|<https://www.novinky.cz/rss/ekonomika>|200|04/01/2026|valid|-|
37|iDNES.cz - Ekonomika|<https://servis.idnes.cz/rss.aspx?c=ekonomika>|200|04/01/2026|valid|-|
38|iROZHLAS - Ekonomika|<https://www.irozhlas.cz/rss/irozhlas/section/ekonomika>|200|04/01/2026|valid|-|
39|iROZHLAS - Komentare|<https://www.irozhlas.cz/rss/irozhlas/section/komentare>|200|04/01/2026|valid|-|
40|iROZHLAS - Kultura|<https://www.irozhlas.cz/rss/irozhlas/section/kultura>|200|04/01/2026|valid|-|
41|Seznam Zpravy - Byznys|<https://www.seznamzpravy.cz/rss/byznys>|200|04/01/2026|valid|-|
42|Seznam Zpravy - Domaci Politika|<https://www.seznamzpravy.cz/rss/domaci-politika>|200|04/01/2026|valid|-|
43|iDNES.cz - Zpravodaj|<https://servis.idnes.cz/rss.aspx?c=zpravodaj>|200|04/01/2026|valid|-|
44|iDNES.cz - Domaci|<https://servis.idnes.cz/rss.aspx?c=domaci>|200|04/01/2026|valid|-|
45|iDNES.cz - Zahranicni|<https://servis.idnes.cz/rss.aspx?c=zahranicni>|200|04/01/2026|valid|-|
46|iDNES.cz - Sport|<https://servis.idnes.cz/rss.aspx?c=sport>|200|04/01/2026|valid|-|
47|iDNES.cz - Technet|<https://servis.idnes.cz/rss.aspx?c=technet>|200|04/01/2026|valid|-|
48|TN Nova|<https://tn.nova.cz/rss>|200|04/01/2026|valid|-|
49|Blesk - Home|<https://www.blesk.cz/rss>|200|04/01/2026|valid|-|
50|TN Nova - News Sitemap 2|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
51|TN Nova - News Sitemap 3|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
52|iDNES.cz - Kultura|<https://servis.idnes.cz/rss.aspx?c=kultura>|200|04/01/2026|valid|-|
53|iDNES.cz - Fotbal|<https://servis.idnes.cz/rss.aspx?c=fotbal>|200|04/01/2026|valid|-|
54|iDNES.cz - Hokej|<https://servis.idnes.cz/rss.aspx?c=hokej>|200|04/01/2026|valid|-|
55|Blesk - Sport|<https://www.blesk.cz/rss/sport>|200|04/01/2026|valid|-|
56|Blesk - Celebrity|<https://www.blesk.cz/rss/celebrity>|200|04/01/2026|valid|-|
57|Blesk - Krimi|<https://www.blesk.cz/rss/krimi>|200|04/01/2026|valid|-|
58|Blesk - Regiony|<https://www.blesk.cz/rss/regiony>|200|04/01/2026|valid|-|
59|Blesk - Ekonomika|<https://www.blesk.cz/rss/ekonomika>|200|04/01/2026|valid|-|
60|Blesk - Zahranici|<https://www.blesk.cz/rss/zahranici>|200|04/01/2026|valid|-|
61|Ahaonline.cz|<https://www.ahaonline.cz/rss>|200|04/01/2026|valid|-|
62|Sport.cz - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
63|Sport.cz - Online Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
64|iDNES.cz - Ostrava|<https://servis.idnes.cz/rss.aspx?c=ostrava>|200|04/01/2026|valid|-|
65|iDNES.cz - Olomouc|<https://servis.idnes.cz/rss.aspx?c=olomouc>|200|04/01/2026|valid|-|
66|iDNES.cz - Plzen|<https://servis.idnes.cz/rss.aspx?c=plzen>|200|04/01/2026|valid|-|
67|iDNES.cz - Liberec|<https://servis.idnes.cz/rss.aspx?c=liberec>|200|04/01/2026|valid|-|
68|iDNES.cz - Usti|<https://servis.idnes.cz/rss.aspx?c=usti>|200|04/01/2026|valid|-|
69|iDNES.cz - Hradec|<https://servis.idnes.cz/rss.aspx?c=hradec>|200|04/01/2026|valid|-|
70|iDNES.cz - Pardubice|<https://servis.idnes.cz/rss.aspx?c=pardubice>|200|04/01/2026|valid|-|
71|iDNES.cz - Zlin|<https://servis.idnes.cz/rss.aspx?c=zlin>|200|04/01/2026|valid|-|
72|iDNES.cz - Vary|<https://servis.idnes.cz/rss.aspx?c=vary>|200|04/01/2026|valid|-|
73|iDNES.cz - Jihlava|<https://servis.idnes.cz/rss.aspx?c=jihlava>|200|04/01/2026|valid|-|
74|iDNES.cz - Budejovice|<https://servis.idnes.cz/rss.aspx?c=budejovice>|200|04/01/2026|valid|-|
75|Blesk - Auto|<https://www.blesk.cz/rss/auto>|200|04/01/2026|valid|-|
76|Blesk - Zdravi|<https://www.blesk.cz/rss/zdravi>|200|04/01/2026|valid|-|
77|Blesk - Cestovani|<https://www.blesk.cz/rss/cestovani>|200|04/01/2026|valid|-|
78|Blesk - Bydleni|<https://www.blesk.cz/rss/bydleni>|200|04/01/2026|valid|-|
79|Blesk - Praha|<https://www.blesk.cz/rss/praha>|200|04/01/2026|valid|-|
80|Blesk - Plzen|<https://www.blesk.cz/rss/plzen>|200|04/01/2026|valid|-|
81|Blesk - Ostrava Region|<https://www.blesk.cz/rss/ostrava>|200|04/01/2026|valid|-|
82|Blesk - Brno|<https://www.blesk.cz/rss/brno>|200|04/01/2026|valid|-|
83|Blesk - Olomouc Region|<https://www.blesk.cz/rss/olomouc>|200|04/01/2026|valid|-|
84|Sport.cz - Fotbal|<https://www.sport.cz/rss/fotbal>|200|04/01/2026|valid|-|
85|Sport.cz - Hokej|<https://www.sport.cz/rss/hokej>|200|04/01/2026|valid|-|
86|Sport.cz - Tenis|<https://www.sport.cz/rss/tenis>|200|04/01/2026|valid|-|
87|Denik - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
88|Sport.cz - Articles Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
89|Blesk - Videoarticle Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
90|Blesk - Elections Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
91|Denik - Sport|<https://www.denik.cz/rss/sport.html>|200|04/01/2026|valid|-|
92|Denik - Ekonomika|<https://www.denik.cz/rss/ekonomika.html>|200|04/01/2026|valid|-|
93|Denik - Kultura|<https://www.denik.cz/rss/kultura.html>|200|04/01/2026|valid|-|
94|Denik - Regiony|<https://www.denik.cz/rss/regiony.html>|200|04/01/2026|valid|-|
95|Denik - Krimi|<https://www.denik.cz/rss/krimi.html>|200|04/01/2026|valid|-|
96|Novinky.cz - Kultura|<https://www.novinky.cz/rss/kultura>|200|04/01/2026|valid|-|
97|Novinky.cz - Krimi|<https://www.novinky.cz/rss/krimi>|200|04/01/2026|valid|-|
98|Novinky.cz - Koktejl|<https://www.novinky.cz/rss/koktejl>|200|04/01/2026|valid|-|
99|Denik - Zdravi|<https://www.denik.cz/rss/zdravi.html>|200|04/01/2026|valid|-|
100|Denik - Cestovani|<https://www.denik.cz/rss/cestovani.html>|200|04/01/2026|valid|-|
101|Super.cz - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
102|Extra.cz - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
103|Refresher CZ|<https://refresher.cz/rss>|200|04/01/2026|valid|-|
104|Ceske noviny - Zpravy|<https://www.ceskenoviny.cz/sluzby/rss/zpravy.php>|200|04/01/2026|valid|-|
105|Ceske noviny - Ekonomika|<https://www.ceskenoviny.cz/sluzby/rss/ekonomika.php>|200|04/01/2026|valid|-|
106|Ceske noviny - Sport|<https://www.ceskenoviny.cz/sluzby/rss/sport.php>|200|04/01/2026|valid|-|
107|Ceske noviny - Domov|<https://www.ceskenoviny.cz/sluzby/rss/domov.php>|200|04/01/2026|valid|-|
108|Info.cz|<https://www.info.cz/rss>|200|04/01/2026|valid|-|
109|CzechCrunch|<https://cc.cz/feed/>|200|04/01/2026|valid|-|
110|Ceska justice|<https://www.ceska-justice.cz/feed/>|200|04/01/2026|valid|-|
111|HlidaciPes|<https://hlidacipes.org/feed/>|200|04/01/2026|valid|-|
112|Tyden.cz|<https://www.tyden.cz/rss>|200|04/01/2026|valid|-|

### Greece (GR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|eKathimerini|<https://www.ekathimerini.com/infeeds/rss/nx-rss-feed.xml>|200|04/01/2026|valid|-|
2|Kathimerini|<https://www.kathimerini.gr/infeeds/rss/nx-rss-feed.xml>|200|04/01/2026|valid|-|
3|Naftemporiki|<https://www.naftemporiki.gr/feed/>|200|04/01/2026|valid|-|
4|Proto Thema|<https://www.protothema.gr/rss/>|200|04/01/2026|valid|-|
5|In.gr|<https://www.in.gr/feed/>|200|04/01/2026|valid|-|
6|To Vima|<https://www.tovima.gr/feed/>|200|04/01/2026|valid|-|
7|Newsbeast|<https://www.newsbeast.gr/feed>|200|04/01/2026|valid|-|
8|Ethnos|<https://www.ethnos.gr/rss.xml>|200|04/01/2026|valid|-|
9|Newsit - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
10|Liberal - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
11|Enikos - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
12|Capital.gr - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
13|Parapolitika - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
14|Powergame - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
15|Newsbomb - Articles Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
16|Mononews - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
17|News247 - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
18|Zougla - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
19|CNN Greece - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
20|iefimerida|<https://www.iefimerida.gr/rss.xml>|200|04/01/2026|valid|-|
21|SKAI|<https://www.skai.gr/feed.xml>|200|04/01/2026|valid|-|
22|Documento - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
23|Ta Nea - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
24|Gazzetta - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
25|Newsbomb - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|

### Romania (RO)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Digi24|<https://www.digi24.ro/rss>|200|04/01/2026|valid|-|
2|HotNews|<https://hotnews.ro/feed>|200|04/01/2026|valid|-|
3|HotNews - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
4|Adevarul|<https://adevarul.ro/rss/index>|200|04/01/2026|valid|-|
5|Adevarul - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
6|G4Media|<https://www.g4media.ro/feed>|200|04/01/2026|valid|-|
7|Mediafax|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
8|Economedia|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
9|Stirile ProTV|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
10|Antena3|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
11|Stiripesurse - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
12|Stiripesurse - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
13|Libertatea|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
14|Libertatea - Articles Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
15|Ziare.com|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
16|DCNews|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
17|Gandul|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
18|RomaniaTV - WP Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
19|Profit.ro|<https://www.profit.ro/rss>|200|04/01/2026|valid|-|
20|Business Magazin|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
21|Romania Insider|<https://www.romania-insider.com/feed/>|200|04/01/2026|valid|-|
22|SpotMedia|<https://spotmedia.ro/feed/>|200|04/01/2026|valid|-|
23|Curs de Guvernare|<https://cursdeguvernare.ro/feed/>|200|04/01/2026|valid|-|
24|Economica|<https://www.economica.net/feed>|200|04/01/2026|valid|-|
25|Aktual24|<https://www.aktual24.ro/feed/>|200|04/01/2026|valid|-|
26|EVZ - March 2026 Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
27|EVZ - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
28|Capital - March 2026 Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
29|Capital - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
30|Observator News - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
31|Fanatik - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
32|ZF - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
33|Stirile Kanal D - News RSS|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
34|GSP - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
35|ProSport - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
36|Click - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
37|Spynews - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
38|B1TV - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|

### Ukraine (UA)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Kyiv Independent|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
2|Kyiv Post|<https://www.kyivpost.com/feed>|200|04/01/2026|valid|-|
3|European Pravda|<https://www.eurointegration.com.ua/rss/>|200|04/01/2026|valid|-|
4|NV|<https://nv.ua/rss/all.xml>|200|04/01/2026|valid|-|
5|Ukrainska Pravda|<https://www.pravda.com.ua/rss/>|200|04/01/2026|valid|-|
6|Interfax-Ukraine|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
7|UNIAN|<https://www.unian.net/rss>|200|04/01/2026|valid|-|
8|TSN|<https://tsn.ua/rss/full.rss>|200|04/01/2026|valid|-|
9|TSN - Google News UK|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
10|RBC Ukraine - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
11|Liga.net - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
12|Focus - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
13|Ukrinform - Currentweek Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
14|Espreso - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
15|Hromadske - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
16|UNN - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
17|Obozrevatel - News Last 24h|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
18|24tv.ua - News 202603|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
19|Censor.net - News 202603|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
20|LB.ua - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
21|Gazeta.ua - Fresh Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
22|Babel|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
23|ZN.UA|<https://zn.ua/rss.xml>|needs check|04/01/2026|needs verification|-|

### Luxembourg (LU)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Luxembourg Times|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
2|Luxemburger Wort|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
3|Delano - Articles Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
4|Paperjam - Articles Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
5|RTL Luxembourg - National|<https://www.rtl.lu/news/national.rss>|200|04/01/2026|valid|-|
6|RTL Luxembourg - International|<https://www.rtl.lu/news/international.rss>|200|04/01/2026|valid|-|
7|RTL Today - Luxembourg|<https://today.rtl.lu/news/luxembourg.rss>|200|04/01/2026|valid|-|
8|RTL Today - World|<https://today.rtl.lu/news/world.rss>|200|04/01/2026|valid|-|
9|RTL Infos - Luxembourg|<https://infos.rtl.lu/news/luxembourg.rss>|200|04/01/2026|valid|-|
10|RTL Infos - Monde|<https://infos.rtl.lu/news/monde.rss>|200|04/01/2026|valid|-|
11|L'essentiel - FR Articles Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
12|L'essentiel - DE Articles Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
13|Luxtoday - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
14|Luxtoday - Articles Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
15|Virgule - March 2026 Articles Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
16|Contacto - March 2026 Articles Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|

### Slovakia (SK)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Aktuality.sk|<https://www.aktuality.sk/rss/>|200|04/01/2026|valid|-|
2|Dennik N|<https://dennikn.sk/feed/>|200|04/01/2026|valid|-|
3|SME|<https://www.sme.sk/rss>|200|04/01/2026|valid|-|
4|Pravda|<https://spravy.pravda.sk/rss/xml/>|200|04/01/2026|valid|-|
5|HNonline|<https://hnonline.sk/feed>|200|04/01/2026|valid|-|
6|TVNoviny.sk|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
7|TA3|<https://www.ta3.com/rss/top-spravy>|200|04/01/2026|valid|-|
8|Teraz.sk|<https://www.teraz.sk/rss/vsetky-spravy.rss>|200|04/01/2026|valid|-|
9|Teraz.sk - Slovakia|<https://www.teraz.sk/rss/slovensko.rss>|200|04/01/2026|valid|-|
10|Teraz.sk - Regions|<https://www.teraz.sk/rss/regiony.rss>|200|04/01/2026|valid|-|
11|Teraz.sk - World|<https://www.teraz.sk/rss/zahranicie.rss>|200|04/01/2026|valid|-|
12|Teraz.sk - Economy|<https://www.teraz.sk/rss/ekonomika.rss>|200|04/01/2026|valid|-|
13|Teraz.sk - Culture|<https://www.teraz.sk/rss/kultura.rss>|200|04/01/2026|valid|-|
14|Teraz.sk - Sport|<https://www.teraz.sk/rss/sport.rss>|200|04/01/2026|valid|-|
15|Teraz.sk - Magazine|<https://www.teraz.sk/rss/magazin.rss>|200|04/01/2026|valid|-|
16|Teraz.sk - Health|<https://www.teraz.sk/rss/zdravie.rss>|200|04/01/2026|valid|-|
17|Topky|<https://www.topky.sk/rss/8/TOPKY>|200|04/01/2026|valid|-|
18|Novy Cas - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
19|Pluska - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
20|Trend - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
21|Standard|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
22|Refresher Slovakia - News Sitemap|<https://www.refresher.sk/rss>|200|04/01/2026|valid|-|
23|Webnoviny - Current Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|

### Hungary (HU)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Index.hu|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
2|Portfolio|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
3|Telex|<https://telex.hu/rss>|200|04/01/2026|valid|-|
4|24.hu - Fresh Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
5|444.hu - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
6|HVG|<https://hvg.hu/rss>|200|04/01/2026|valid|-|
7|Infostart - 24 ora|<https://infostart.hu/24ora/rss/>|200|04/01/2026|valid|-|
8|Infostart - Belfold|<https://infostart.hu/belfold/rss/>|200|04/01/2026|valid|-|
9|Infostart - Kulfold|<https://infostart.hu/kulfold/rss/>|200|04/01/2026|valid|-|
10|Infostart - Gazdasag|<https://infostart.hu/gazdasag/rss/>|200|04/01/2026|valid|-|
11|Infostart - Sport|<https://infostart.hu/sport/rss/>|200|04/01/2026|valid|-|
12|Infostart - Eletmod|<https://infostart.hu/eletmod/rss/>|200|04/01/2026|valid|-|
13|Infostart - Tudomany|<https://infostart.hu/tudomany/rss/>|200|04/01/2026|valid|-|
14|Infostart - Bulvar|<https://infostart.hu/bulvar/rss/>|200|04/01/2026|valid|-|
15|Infostart - Bunugyek|<https://infostart.hu/bunugyek/rss/>|200|04/01/2026|valid|-|
16|Infostart - Tudositoink|<https://infostart.hu/tudositoink/rss/>|200|04/01/2026|valid|-|
17|Penzcentrum - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
18|Mandiner - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
19|Blikk - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
20|Magyar Nemzet - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
21|Nepszava - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
22|Origo - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
23|ATV|<https://www.atv.hu/feed/>|200|04/01/2026|valid|-|
24|Magyar Hirlap|<https://magyarhirlap.hu/rss>|200|04/01/2026|valid|-|
25|Hungary Today|<https://hungarytoday.hu/feed/>|200|04/01/2026|valid|-|
26|Economx - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
27|VG.hu - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
28|Nemzeti Sport|<https://www.nemzetisport.hu/publicapi/hu/rss/nso/articles>|200|04/01/2026|valid|-|
29|Magyar Hang|<https://hang.hu/rss/>|200|04/01/2026|valid|-|
30|Tenyek|<https://tenyek.hu/publicapi/hu/rss>|200|04/01/2026|valid|-|
31|Mfor|<https://mfor.hu/rss/>|200|04/01/2026|valid|-|
32|Privatbankar|<https://privatbankar.hu/rss>|200|04/01/2026|valid|-|
33|Agrarszektor|<https://agrarszektor.hu/rss>|200|04/01/2026|valid|-|
34|Novekedes|<https://novekedes.hu/feed/>|200|04/01/2026|valid|-|
35|Tozsdeforum|<https://tozsdeforum.hu/feed/>|200|04/01/2026|valid|-|
36|Forbes Hungary|<https://forbes.hu/feed/>|200|04/01/2026|valid|-|

### Bulgaria (BG)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|BNT News|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
2|24Plovdiv|<https://www.24plovdiv.bg/rss>|200|04/01/2026|valid|-|
3|Burgas24|<https://burgas24.bg/rss.php>|200|04/01/2026|valid|-|
4|Varna24|<https://varna24.bg/rss.php>|200|04/01/2026|valid|-|
5|Sofia24|<https://sofia24.bg/rss.php>|200|04/01/2026|valid|-|
6|Plovdiv24|<https://plovdiv24.bg/rss.php>|200|04/01/2026|valid|-|
7|Ruse24|<https://ruse24.bg/rss.php>|200|04/01/2026|valid|-|
8|Blagoevgrad24|<https://blagoevgrad24.bg/rss.php>|200|04/01/2026|valid|-|
9|24 Chasa|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
10|Dir.bg|<https://dir.bg/feeds/rss>|200|04/01/2026|valid|-|
11|Capital|<https://www.capital.bg/rss/>|200|04/01/2026|valid|-|
12|Investor.bg - Latest|<https://www.investor.bg/rss/latest>|200|04/01/2026|valid|-|
13|Investor.bg - Economy & Politics|<https://www.investor.bg/rss/c/514-ikonomika-i-politika>|200|04/01/2026|valid|-|
14|Focus News|<https://www.focus-news.net/rss.php>|200|04/01/2026|valid|-|
15|Novsport|<https://www.novsport.com/feed/last>|200|04/01/2026|valid|-|
16|Mediapool|<https://www.mediapool.bg/rss>|200|04/01/2026|valid|-|
17|BNR - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
18|Dnevnik|<https://www.dnevnik.bg/rss>|200|04/01/2026|valid|-|
19|Novinite|<https://www.novinite.com/services/rss.php>|200|04/01/2026|valid|-|
20|Darik News|<https://dariknews.bg/rss.php>|200|04/01/2026|valid|-|
21|StandartNews|<https://www.standartnews.com/rss>|200|04/01/2026|valid|-|
22|Actualno|<https://www.actualno.com/rss>|200|04/01/2026|valid|-|
23|Club Z|<https://clubz.bg/rss.xml>|200|04/01/2026|valid|-|
24|Marica|<https://www.marica.bg/rss>|200|04/01/2026|valid|-|
25|Dnes.bg - Current Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
26|NOVA - Latest News|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
27|NOVA - Latest Accents|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
28|NOVA - Bulgaria|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
29|NOVA - World|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
30|NOVA - Crime|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
31|Blitz - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
32|SEGA - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
33|Vesti - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
34|Fakti - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
35|Fakti - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
36|Vesti - Latest News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
37|Vesti - Bulgaria Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
38|Vesti - World Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|

### Croatia (HR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Dnevnik.hr|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
2|Index.hr|<https://www.index.hr/rss>|200|04/01/2026|valid|-|
3|Vecernji list|<https://www.vecernji.hr/feeds/latest>|200|04/01/2026|valid|-|
4|24sata|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
5|Novi List|<https://www.novilist.hr/feed/>|200|04/01/2026|valid|-|
6|Tportal|<https://www.tportal.hr/rss>|200|04/01/2026|valid|-|
7|Telegram.hr|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
8|N1 Hrvatska|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
9|Jutarnji list - March 2026 Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
10|Net.hr - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
11|RTL Hrvatska - Latest Pages|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
12|Slobodna Dalmacija|<https://slobodnadalmacija.hr/feed>|200|04/01/2026|valid|-|
13|Glas Istre|<https://www.glasistre.hr/rss.xml>|200|04/01/2026|valid|-|
14|Glas Slavonije|<https://glas-slavonije.hr/rss.xml>|200|04/01/2026|valid|-|
15|Poslovni dnevnik|<https://www.poslovni.hr/feed/>|200|04/01/2026|valid|-|
16|Nacional|<https://www.nacional.hr/feed/>|200|04/01/2026|valid|-|
17|Dnevno - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
18|HRT Vijesti|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|

### Slovenia (SI)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|24ur|<https://www.24ur.com/rss>|200|04/01/2026|valid|-|
2|RTVSLO - All News|<https://www.rtvslo.si/feeds/00.xml>|200|04/01/2026|valid|-|
3|RTVSLO - Slovenia|<https://www.rtvslo.si/feeds/01.xml>|200|04/01/2026|valid|-|
4|RTVSLO - World|<https://www.rtvslo.si/feeds/02.xml>|200|04/01/2026|valid|-|
5|RTVSLO - Sport|<https://www.rtvslo.si/feeds/03.xml>|200|04/01/2026|valid|-|
6|RTVSLO - Business|<https://www.rtvslo.si/feeds/04.xml>|200|04/01/2026|valid|-|
7|RTVSLO - Culture|<https://www.rtvslo.si/feeds/05.xml>|200|04/01/2026|valid|-|
8|RTVSLO - Entertainment|<https://www.rtvslo.si/feeds/06.xml>|200|04/01/2026|valid|-|
9|RTVSLO - Crime|<https://www.rtvslo.si/feeds/08.xml>|200|04/01/2026|valid|-|
10|RTVSLO - Science & Tech|<https://www.rtvslo.si/feeds/09.xml>|200|04/01/2026|valid|-|
11|RTVSLO - Environment|<https://www.rtvslo.si/feeds/12.xml>|200|04/01/2026|valid|-|
12|RTVSLO - EU|<https://www.rtvslo.si/feeds/16.xml>|200|04/01/2026|valid|-|
13|RTVSLO - Travel|<https://www.rtvslo.si/feeds/28.xml>|200|04/01/2026|valid|-|
14|Siol - Latest|<https://siol.net/feeds/latest>|200|04/01/2026|valid|-|
15|Zurnal24 - Latest|<https://www.zurnal24.si/feeds/latest>|200|04/01/2026|valid|-|
16|N1 Slovenia|<https://n1info.si/feed>|200|04/01/2026|valid|-|
17|Delo|<https://www.delo.si/rss>|200|04/01/2026|valid|-|
18|Dnevnik|<https://www.dnevnik.si/rss.xml>|200|04/01/2026|valid|-|
19|Primorske|<https://www.primorske.si/rss.xml>|200|04/01/2026|valid|-|
20|STA - News|<https://www.sta.si/rss-0>|200|04/01/2026|valid|-|
21|STA - Slovenia|<https://www.sta.si/rss-1>|200|04/01/2026|valid|-|
22|STA - World|<https://www.sta.si/rss-2>|200|04/01/2026|valid|-|
23|STA - Business|<https://www.sta.si/rss-3>|200|04/01/2026|valid|-|
24|STA - Sport|<https://www.sta.si/rss-4>|200|04/01/2026|valid|-|
25|STA - Culture|<https://www.sta.si/rss-5>|200|04/01/2026|valid|-|
26|Slovenske novice - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
27|Slovenske novice|<https://slovenskenovice.delo.si/rss>|200|04/01/2026|valid|-|
28|Domovina|<https://www.domovina.je/feed>|200|04/01/2026|valid|-|
29|Finance - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
30|Nova24TV|<https://nova24tv.si/feed/>|200|04/01/2026|valid|-|

### Serbia (RS)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|N1 Serbia|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
2|Telegraf|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
3|Novosti|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
4|Blic - Latest Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
5|Blic|<https://www.blic.rs/rss/danasnje-vesti>|200|04/01/2026|valid|-|
6|RTS|<https://www.rts.rs/page/stories/sr/rss/10/vesti.html>|200|04/01/2026|valid|-|
7|NIN - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
8|Tanjug - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
9|Vreme|<https://vreme.com/feed/>|200|04/01/2026|valid|-|
10|Vreme - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
11|Politika - Najnovije|<https://www.politika.rs/sr/columns/rss/63>|200|04/01/2026|valid|-|
12|Politika - Politika|<https://www.politika.rs/sr/columns/rss/2>|200|04/01/2026|valid|-|
13|Politika - Drustvo|<https://www.politika.rs/sr/columns/rss/3>|200|04/01/2026|valid|-|
14|Politika - Ekonomija|<https://www.politika.rs/sr/columns/rss/6>|200|04/01/2026|valid|-|
15|Politika - Srbija|<https://www.politika.rs/sr/columns/rss/9>|200|04/01/2026|valid|-|
16|Politika - Beograd|<https://www.politika.rs/sr/columns/rss/10>|200|04/01/2026|valid|-|
17|B92 - Info|<https://www.b92.net/rss/b92/info>|200|04/01/2026|valid|-|
18|B92 - Biz|<https://www.b92.net/rss/biz>|200|04/01/2026|valid|-|
19|B92 - Lokal|<https://www.b92.net/rss/lokal>|200|04/01/2026|valid|-|
20|021.rs - All|<https://www.021.rs/rss/all>|200|04/01/2026|valid|-|
21|Nova Ekonomija|<https://novaekonomija.rs/feed/>|200|04/01/2026|valid|-|
22|Danas|<https://www.danas.rs/feed/>|200|04/01/2026|valid|-|
23|Dnevnik.rs|<https://www.dnevnik.rs/rss.xml>|200|04/01/2026|valid|-|
24|Beta|<https://www.beta.rs/rss>|200|04/01/2026|valid|-|
25|Srbija Danas|<https://www.sd.rs/rss.xml>|200|04/01/2026|valid|-|
26|Euronews Serbia - Srbija|<https://www.euronews.rs/rss/srbija>|200|04/01/2026|valid|-|
27|Euronews Serbia - Svet|<https://www.euronews.rs/rss/svet>|200|04/01/2026|valid|-|
28|Euronews Serbia - Evropa|<https://www.euronews.rs/rss/evropa>|200|04/01/2026|valid|-|
29|Euronews Serbia - Biznis|<https://www.euronews.rs/rss/biznis>|200|04/01/2026|valid|-|
30|Euronews Serbia - Sport|<https://www.euronews.rs/rss/sport>|200|04/01/2026|valid|-|
31|N1|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
32|Kurir|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
33|Nova.rs - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
34|Informer - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
35|Mondo - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
36|Republika - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
37|Alo - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|

### Lithuania (LT)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Delfi Lithuania|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
2|15min|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
3|LRT|<https://www.lrt.lt/?rss>|200|04/01/2026|valid|-|
4|TV3 Lithuania|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
5|Verslo zinios|<https://www.vz.lt/rss>|200|04/01/2026|valid|-|
6|Delfi Lithuania - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
7|Delfi Lithuania - Latest Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
8|15min - Articles Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
9|15min - Live Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
10|Lrytas|<https://www.lrytas.lt/rss>|200|04/01/2026|valid|-|
11|Diena|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
12|TV3 Lithuania - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
13|Kauno Diena - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
14|TV3 Lithuania - Week 2026-12 Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
15|Bernardinai|<https://www.bernardinai.lt/feed/rss>|200|04/01/2026|valid|-|
16|VE.lt - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
17|AeroTime|<https://aerotime.aero/feed>|200|04/01/2026|valid|-|

### Latvia (LV)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|TVNET|<https://www.tvnet.lv/rss>|200|04/01/2026|valid|-|
2|LA.LV|<https://www.la.lv/feed>|200|04/01/2026|valid|-|
3|Apollo|<https://www.apollo.lv/rss>|200|04/01/2026|valid|-|
4|Delfi Latvia|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
5|Rus Delfi Latvia - News 1|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
6|Jauns.lv|<https://jauns.lv/rss>|200|04/01/2026|valid|-|
7|NRA|<https://nra.lv/rss/jaunakas-zinas/>|200|04/01/2026|valid|-|
8|LSM|<https://www.lsm.lv/rss/>|200|04/01/2026|valid|-|
9|Rus TVNET Latvia|<https://rus.tvnet.lv/rss>|200|04/01/2026|valid|-|
10|LSM - Russian|<https://rus.lsm.lv/rss/?lang=ru>|200|04/01/2026|valid|-|
11|BB.lv|<https://bb.lv/rss>|200|04/01/2026|valid|-|
12|TV3 Latvia|<https://www.tv3.lv/feed>|200|04/01/2026|valid|-|
13|Mixnews Latvia|<https://mixnews.lv/feed/>|200|04/01/2026|valid|-|
14|Gorod.lv|<https://gorod.lv/rss>|200|04/01/2026|valid|-|
15|LSM - Latvia|<https://www.lsm.lv/rss/?lang=lv&catid=20>|200|04/01/2026|valid|-|
16|LSM - Economy|<https://www.lsm.lv/rss/?lang=lv&catid=22>|200|04/01/2026|valid|-|
17|LSM - World|<https://www.lsm.lv/rss/?lang=lv&catid=21>|200|04/01/2026|valid|-|
18|Diena|<https://www.diena.lv/rss>|200|04/01/2026|valid|-|
19|Diena - Latvia|<https://www.diena.lv/rss/?c=3>|200|04/01/2026|valid|-|
20|Diena - News|<https://www.diena.lv/rss/?c=71>|200|04/01/2026|valid|-|
21|Diena - Politics|<https://www.diena.lv/rss/?c=19>|200|04/01/2026|valid|-|
22|Diena - Riga|<https://www.diena.lv/rss/?c=20>|200|04/01/2026|valid|-|
23|Diena - Regions|<https://www.diena.lv/rss/?c=21>|200|04/01/2026|valid|-|
24|Diena - Crime|<https://www.diena.lv/rss/?c=23>|200|04/01/2026|valid|-|
25|Diena - World|<https://www.diena.lv/rss/?c=4>|200|04/01/2026|valid|-|
26|Sportacentrs|<https://sportacentrs.com/static/non-publish/rss/sc/rss.xml>|200|04/01/2026|valid|-|

### Estonia (EE)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Postimees|<https://www.postimees.ee/rss>|200|04/01/2026|valid|-|
2|Postimees - Sport|<https://sport.postimees.ee/rss>|200|04/01/2026|valid|-|
3|Postimees - World|<https://maailm.postimees.ee/rss>|200|04/01/2026|valid|-|
4|Postimees - Business|<https://majandus.postimees.ee/rss>|200|04/01/2026|valid|-|
5|Postimees - Elu24|<https://elu24.postimees.ee/rss>|200|04/01/2026|valid|-|
6|Postimees - Science|<https://teadus.postimees.ee/rss>|200|04/01/2026|valid|-|
7|Postimees - Opinion|<https://arvamus.postimees.ee/rss>|200|04/01/2026|valid|-|
8|Postimees - Russian|<https://rus.postimees.ee/rss>|200|04/01/2026|valid|-|
9|Ohtuleht|<https://www.ohtuleht.ee/rss>|200|04/01/2026|valid|-|
10|ERR|<https://www.err.ee/rss>|200|04/01/2026|valid|-|
11|ERR - Sport|<https://sport.err.ee/rss>|200|04/01/2026|valid|-|
12|ERR - Culture|<https://kultuur.err.ee/rss>|200|04/01/2026|valid|-|
13|ERR - Economy|<https://www.err.ee/rss/majandus>|200|04/01/2026|valid|-|
14|ERR - World|<https://www.err.ee/rss/valismaa>|200|04/01/2026|valid|-|
15|ERR - Russian|<https://rus.err.ee/rss>|200|04/01/2026|valid|-|
16|ERR - Novaator|<https://novaator.err.ee/rss>|200|04/01/2026|valid|-|
17|Delfi Estonia|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
18|Delfi Estonia - News 1|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
19|Geenius|<https://geenius.ee/feed/>|200 (HTML_RETURNED)|04/01/2026|invalid|-|
20|Elu24|<https://elu24.postimees.ee/rss>|200|04/01/2026|valid|-|
21|Tartu Postimees|<https://tartu.postimees.ee/rss>|200|04/01/2026|valid|-|
22|Parnu Postimees|<https://parnu.postimees.ee/rss>|200|04/01/2026|valid|-|
23|Virumaa Teataja|<https://virumaateataja.postimees.ee/rss>|200|04/01/2026|valid|-|
24|Sakala|<https://sakala.postimees.ee/rss>|200|04/01/2026|valid|-|
25|Postimees - Limon|<https://limon.postimees.ee/rss>|200|04/01/2026|valid|-|
26|Postimees - Kodu|<https://kodu.postimees.ee/rss>|200|04/01/2026|valid|-|
27|Postimees - Naine|<https://naine.postimees.ee/rss>|200|04/01/2026|valid|-|
28|Arileht|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
29|Arileht - News 1|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
30|Maaleht - News 1|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
31|Ekspress - News 1|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
32|Delfi Russia - News 1|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
33|Forte - News 1|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
34|Kroonika - News 1|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
35|Delfi Sport - News 1|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
36|Arvamus - News 1|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
37|Eesti Naine - News 1|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
38|Moodne Kodu - News 1|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
39|Jarva Teataja|<https://jarvateataja.postimees.ee/rss>|200|04/01/2026|valid|-|
40|Louna-Eesti Postimees|<https://lounapostimees.postimees.ee/rss>|200|04/01/2026|valid|-|
41|Postimees - Tervis|<https://tervis.postimees.ee/rss>|200|04/01/2026|valid|-|
42|Postimees - Lemmik|<https://lemmik.postimees.ee/rss>|200|04/01/2026|valid|-|
43|Maaelu|<https://maaelu.postimees.ee/rss>|200|04/01/2026|valid|-|
44|Anne & Stiil - News 1|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
45|Aripaev|<https://www.aripaev.ee/rss>|200|04/01/2026|valid|-|
46|DV.ee|<https://www.dv.ee/rss>|200|04/01/2026|valid|-|

### Iceland (IS)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Visir|<https://www.visir.is/rss/allt>|200|04/01/2026|valid|-|
2|Visir - Lifi|<https://www.visir.is/rss/lifid>|200|04/01/2026|valid|-|
3|Visir - Viskipti|<https://www.visir.is/rss/vidskipti>|200|04/01/2026|valid|-|
4|RUV|<https://www.ruv.is/rss/frettir>|200|04/01/2026|valid|-|
5|RUV - Innlent|<https://www.ruv.is/rss/innlent>|200|04/01/2026|valid|-|
6|RUV - Erlent|<https://www.ruv.is/rss/erlent>|200|04/01/2026|valid|-|
7|RUV - Sport|<https://www.ruv.is/rss/ithrottir>|200|04/01/2026|valid|-|
8|RUV - Culture|<https://www.ruv.is/rss/menning>|200|04/01/2026|valid|-|
9|MBL Innlent|<https://www.mbl.is/feeds/innlent/>|200|04/01/2026|valid|-|
10|MBL Erlent|<https://www.mbl.is/feeds/erlent/>|200|04/01/2026|valid|-|
11|MBL Sport|<https://www.mbl.is/feeds/sport/>|200|04/01/2026|valid|-|
12|MBL Business|<https://www.mbl.is/feeds/vidskipti/>|200|04/01/2026|valid|-|
13|MBL Folk|<https://www.mbl.is/feeds/folk/>|200|04/01/2026|valid|-|
14|MBL Smartland|<https://www.mbl.is/feeds/smartland/>|200|04/01/2026|valid|-|
15|MBL Travel|<https://www.mbl.is/feeds/ferdalog/>|200|04/01/2026|valid|-|
16|Visir - News|<https://www.visir.is/rss/frettir>|200|04/01/2026|valid|-|
17|Visir - Domestic|<https://www.visir.is/rss/innlent>|200|04/01/2026|valid|-|
18|Visir - World|<https://www.visir.is/rss/erlent>|200|04/01/2026|valid|-|
19|Visir - Business|<https://www.visir.is/rss/vidskipti>|200|04/01/2026|valid|-|
20|Visir - Sport|<https://www.visir.is/rss/sport>|200|04/01/2026|valid|-|
21|DV|<https://www.dv.is/feed/>|200|04/01/2026|valid|-|

### Egypt (EG)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Egypt Independent|<https://egyptindependent.com/feed/>|200|04/01/2026|valid|-|
2|Egyptian Gazette|<https://egyptian-gazette.com/feed/>|200|04/01/2026|valid|-|
3|Daily News Egypt|<https://www.dailynewsegypt.com/feed/>|200|04/01/2026|valid|-|
4|Dostor|<https://www.dostor.org/RSS.aspx>|403 (HTTP_403)|04/01/2026|invalid|-|
5|EnterpriseAM Egypt|<https://enterpriseam.com/egypt/feed/>|200|04/01/2026|valid|-|
6|Cairo24 - Newsmap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
7|Al Wafd - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
8|El Balad - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
9|Al Mal - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
10|Al Masry Al Youm|<https://www.almasryalyoum.com/rss/rssfeeds>|200|04/01/2026|valid|-|
11|El Watan - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
12|Masrawy - General News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
13|Masrawy - Sports Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
14|Masrawy - Economy Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
15|FilGoal - Articles Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
16|Yallakora - Egypt News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
17|Yallakora - International News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
18|Alborsa News|<https://www.alborsaanews.com/feed>|200|04/01/2026|valid|-|
19|Btolat|<https://www.btolat.com/rss/newsfeed>|200|04/01/2026|valid|-|
20|Veto - Newsmap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
21|Amwal Al Ghad - Atom|<https://amwalalghad.com/feed/atom/>|200|04/01/2026|valid|-|
22|Shorouk - Egypt|<https://www.shorouknews.com/egypt/rss>|200|04/01/2026|valid|-|
23|Shorouk - Politics|<https://www.shorouknews.com/Politics/rss>|200|04/01/2026|valid|-|
24|Shorouk - Arab|<https://www.shorouknews.com/Politics/arab/rss>|200|04/01/2026|valid|-|
25|Shorouk - Economy|<https://www.shorouknews.com/Economy/rss>|200|04/01/2026|valid|-|
26|Shorouk - Citizens|<https://www.shorouknews.com/Economy/citizines/rss>|200|04/01/2026|valid|-|
27|Shorouk - Local|<https://www.shorouknews.com/local/rss>|200|04/01/2026|valid|-|
28|Shorouk - Accidents|<https://www.shorouknews.com/accidents/rss>|200|04/01/2026|valid|-|
29|Shorouk - Sports|<https://www.shorouknews.com/sports/rss>|200|04/01/2026|valid|-|
30|Ahl Masr - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
31|Economy Plus|<https://economyplusme.com/feed/>|200|04/01/2026|valid|-|
32|SEE News - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|

### Nigeria (NG)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Punch Nigeria|<https://rss.punchng.com/v1/category/latest_news>|200|04/01/2026|valid|-|
2|Vanguard Nigeria|<https://www.vanguardngr.com/feed/>|200|04/01/2026|valid|-|
3|Premium Times Nigeria|<https://www.premiumtimesng.com/feed>|200|04/01/2026|valid|-|
4|Daily Trust|<https://dailytrust.com/feed/>|200|04/01/2026|valid|-|
5|Channels TV|<https://www.channelstv.com/feed/>|200|04/01/2026|valid|-|
6|BusinessDay Nigeria|<https://businessday.ng/feed/>|200|04/01/2026|valid|-|
7|Nigerian Eye|<https://www.nigerianeye.com/feeds/posts/default>|200|04/01/2026|valid|-|
8|THISDAY Live|<https://www.thisdaylive.com/feed/>|200|04/01/2026|valid|-|
9|Ripples Nigeria|<https://www.ripplesnigeria.com/feed/>|200|04/01/2026|valid|-|
10|People's Gazette|<https://gazettengr.com/feed/>|200|04/01/2026|valid|-|
11|Leadership Nigeria|<https://leadership.ng/feed/>|200|04/01/2026|valid|-|
12|Blueprint Nigeria|<https://blueprint.ng/feed/>|200|04/01/2026|valid|-|
13|Daily Post Nigeria|<https://dailypost.ng/feed/>|200|04/01/2026|valid|-|
14|PM News Nigeria|<https://pmnewsnigeria.com/feed/>|200|04/01/2026|valid|-|
15|Independent Nigeria|<https://independent.ng/feed/>|Recovered via sitemap|04/01/2026|valid|-|
16|TheCable - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
17|Sahara Reporters|<https://saharareporters.com/articles/rss-feed>|200|04/01/2026|valid|-|
18|TechCabal|<https://techcabal.com/feed/>|200|04/01/2026|valid|-|

### Singapore (SG)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Straits Times World|<https://www.straitstimes.com/news/world/rss.xml>|200|04/01/2026|valid|-|
2|Straits Times Asia|<https://www.straitstimes.com/news/asia/rss.xml>|200|04/01/2026|valid|-|
3|Business Times Singapore|<https://www.businesstimes.com.sg/rss.xml>|200|04/01/2026|valid|-|
4|CNA Top Stories|<https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml>|200|04/01/2026|valid|-|
5|Straits Times Singapore|<https://www.straitstimes.com/news/singapore/rss.xml>|200|04/01/2026|valid|-|
6|Mothership|<https://mothership.sg/feed/>|200|04/01/2026|valid|-|
7|CNA Singapore|<https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=1821876>|200|04/01/2026|valid|-|
8|Straits Times Sport|<https://www.straitstimes.com/news/sport/rss.xml>|200|04/01/2026|valid|-|
9|Straits Times Business|<https://www.straitstimes.com/news/business/rss.xml>|200|04/01/2026|valid|-|
10|Straits Times Life|<https://www.straitstimes.com/news/life/rss.xml>|200|04/01/2026|valid|-|
11|Straits Times Opinion|<https://www.straitstimes.com/news/opinion/rss.xml>|200|04/01/2026|valid|-|
12|Straits Times - Current Month Feeds Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
13|Business Times International|<https://www.businesstimes.com.sg/rss/international>|200|04/01/2026|valid|-|
14|Business Times Top Stories|<https://www.businesstimes.com.sg/rss/top-stories>|200|04/01/2026|valid|-|
15|Business Times Economy & Policy|<https://www.businesstimes.com.sg/rss/economy-policy>|200|04/01/2026|valid|-|
16|Business Times Global Enterprise|<https://www.businesstimes.com.sg/rss/global-enterprise>|200|04/01/2026|valid|-|
17|Business Times Companies & Markets|<https://www.businesstimes.com.sg/rss/companies-markets>|200|04/01/2026|valid|-|
18|Business Times Wealth|<https://www.businesstimes.com.sg/rss/wealth>|needs check|04/01/2026|needs verification|-|
19|Business Times Property|<https://www.businesstimes.com.sg/rss/property>|needs check|04/01/2026|needs verification|-|
20|Business Times Startups & Tech|<https://www.businesstimes.com.sg/rss/startups-tech>|needs check|04/01/2026|needs verification|-|
21|Business Times - Google News Sitemap|<https://www.businesstimes.com.sg/googlenews.xml>|200|04/01/2026|valid|-|
22|MustShareNews|<https://mustsharenews.com/feed/>|200|04/01/2026|valid|-|
23|Yahoo News Singapore|<https://sg.news.yahoo.com/rss/>|200|04/01/2026|valid|-|
24|The Independent Singapore|<https://theindependent.sg/feed/>|200|04/01/2026|valid|-|
25|Singapore Business Review|<https://sbr.com.sg/rss.xml>|200|04/01/2026|valid|-|
26|EdgeProp Singapore|<https://www.edgeprop.sg/rss.xml>|200|04/01/2026|valid|-|
27|Berita Harian|<https://www.beritaharian.sg/rss.xml>|200|04/01/2026|valid|-|
28|Tamil Murasu|<https://www.tamilmurasu.com.sg/rss.xml>|200|04/01/2026|valid|-|
29|Tamil Murasu - Google News Sitemap|<https://www.tamilmurasu.com.sg/googlenews.xml>|200|04/01/2026|valid|-|
30|Zaobao - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
31|8world - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
32|Straits Times - Google News Sitemap|<https://www.straitstimes.com/googlenews.xml>|200|04/01/2026|valid|-|
33|AsiaOne - Google News Sitemap|<https://www.asiaone.com/googlenews.xml>|200|04/01/2026|valid|-|
34|STOMP - Google News Sitemap|<https://www.stomp.sg/googlenews.xml>|200|04/01/2026|valid|-|
35|STOMP RSS|<https://www.stomp.sg/rss.xml>|200|04/01/2026|valid|-|
36|CNA Latest News|<https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6511>|200|04/01/2026|valid|-|
37|CNA East Asia|<https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=10416>|200|04/01/2026|valid|-|
38|CNA World|<https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=10296>|200|04/01/2026|valid|-|
39|CNA Business|<https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6311>|200|04/01/2026|valid|-|
40|CNA Asia|<https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6936>|200|04/01/2026|valid|-|
41|Singapore Business Review - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
42|Shin Min - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
43|8days Latest Stories|<https://www.8days.sg/api/v1/rss-outbound-feed?_format=xml>|200|04/01/2026|valid|-|
44|ThinkChina - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
45|HardwareZone - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
46|BERITA Mediacorp|<https://berita.mediacorp.sg/api/v1/rss-outbound-feed?_format=xml>|200|04/01/2026|valid|-|
47|BERITA Mediacorp - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
48|Seithi Mediacorp|<https://seithi.mediacorp.sg/api/v1/rss-outbound-feed?_format=xml>|200|04/01/2026|valid|-|
49|Seithi Mediacorp - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
50|Tech in Asia|<https://www.techinasia.com/feed>|200|04/01/2026|valid|-|

### South Africa (ZA)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|TimesLIVE|<https://www.timeslive.co.za/arc/outboundfeeds/rss/>|200|04/01/2026|valid|-|
2|The Citizen|<https://www.citizen.co.za/feed/>|200|04/01/2026|valid|-|
3|The South African|<https://www.thesouthafrican.com/feed/>|200|04/01/2026|valid|-|
4|TimesLIVE News|<https://www.timeslive.co.za/arc/outboundfeeds/rss/category/news/>|200|04/01/2026|valid|-|
5|SABC News|<https://www.sabcnews.com/sabcnews/feed/>|200|04/01/2026|valid|-|
6|TimesLIVE Politics|<https://www.timeslive.co.za/arc/outboundfeeds/rss/category/politics/>|200|04/01/2026|valid|-|
7|TimesLIVE Sport|<https://www.timeslive.co.za/arc/outboundfeeds/rss/category/sport/>|200|04/01/2026|valid|-|
8|TimesLIVE Lifestyle|<https://www.timeslive.co.za/arc/outboundfeeds/rss/category/lifestyle/>|200|04/01/2026|valid|-|
9|News24 South Africa|<https://feeds.capi24.com/v1/Search/articles/news24/SouthAfrica/rss>|200|04/01/2026|valid|-|
10|News24 Top Stories|<https://feeds.capi24.com/v1/Search/articles/news24/TopStories/rss>|200|04/01/2026|valid|-|
11|News24 World|<https://feeds.capi24.com/v1/Search/articles/news24/World/rss>|200|04/01/2026|valid|-|
12|News24 Sport|<https://feeds.capi24.com/v1/Search/articles/news24/Sport/rss>|200|04/01/2026|valid|-|
13|News24 Business|<https://feeds.capi24.com/v1/Search/articles/news24/Business/rss>|200|04/01/2026|valid|-|
14|News24 Life|<https://feeds.capi24.com/v1/Search/articles/news24/Life/rss>|200|04/01/2026|valid|-|
15|Business Day South Africa|<https://www.businessday.co.za/arc/outboundfeeds/rss/>|200|04/01/2026|valid|-|
16|Sowetan|<https://www.sowetan.co.za/arc/outboundfeeds/rss/>|200|04/01/2026|valid|-|
17|Mail & Guardian|<https://mg.co.za/feed/>|200|04/01/2026|valid|-|
18|TechCentral|<https://techcentral.co.za/feed/>|200|04/01/2026|valid|-|
19|IOL|<https://www.iol.co.za/rss>|200|04/01/2026|valid|-|
20|Moneyweb|<https://www.moneyweb.co.za/feed/>|200|04/01/2026|valid|-|
21|The Herald|<https://www.theherald.co.za/arc/outboundfeeds/rss/>|200|04/01/2026|valid|-|
22|Daily Dispatch|<https://www.dailydispatch.co.za/arc/outboundfeeds/rss/>|200|04/01/2026|valid|-|
23|Sunday World|<https://sundayworld.co.za/feed/>|200|04/01/2026|valid|-|
24|The Citizen Business|<https://www.citizen.co.za/business/feed/>|200|04/01/2026|valid|-|
25|BizNews|<https://www.biznews.com/stories.rss>|200|04/01/2026|valid|-|
26|Daily Maverick - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
27|eNCA|<https://www.enca.com/rss.xml>|200|04/01/2026|valid|-|
28|EWN - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|

### Qatar (QA)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Al Jazeera|<https://www.aljazeera.com/xml/rss/all.xml>|200|04/01/2026|valid|-|
2|The Peninsula Qatar|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
3|The Peninsula Qatar - March 2026 Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
4|Gulf Times|<https://www.gulf-times.com/rssFeed/0>|200|04/01/2026|valid|-|
5|Gulf Times - Business|<https://www.gulf-times.com/rssFeed/2>|200|04/01/2026|valid|-|
6|Gulf Times - Region|<https://www.gulf-times.com/rssFeed/6>|200|04/01/2026|valid|-|
7|Gulf Times - International|<https://www.gulf-times.com/rssFeed/9>|200|04/01/2026|valid|-|
8|Gulf Times - Qatar Local|<https://www.gulf-times.com/rssFeed/8>|200|04/01/2026|valid|-|
9|Qatar Tribune|<https://www.qatar-tribune.com/rssFeed/0>|200|04/01/2026|valid|-|
10|Doha News|<https://www.dohanews.co/feed/>|403 (HTTP_403)|04/01/2026|invalid|-|
11|Gulf Times - Sports|<https://www.gulf-times.com/rssFeed/4>|200|04/01/2026|valid|-|
12|Qatar Living - Articles Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
13|QNA - Qatar|<https://qna.org.qa/en/Pages/RSS-Feeds/Qatar>|200|04/01/2026|valid|-|
14|QNA - Economy Local|<https://qna.org.qa/en/Pages/RSS-Feeds/Economy-Local>|200|04/01/2026|valid|-|
15|QNA - Sport Local|<https://qna.org.qa/en/Pages/RSS-Feeds/Sport-Local>|200|04/01/2026|valid|-|
16|QNA - Miscellaneous Local|<https://qna.org.qa/en/Pages/RSS-Feeds/Miscellaneous-Local>|200|04/01/2026|valid|-|
17|QNA - Reports and Analysis|<https://qna.org.qa/en/Pages/RSS-Feeds/Analysis-and-Reports>|200|04/01/2026|valid|-|
18|QNA - General|<https://qna.org.qa/en/Pages/RSS-Feeds/General>|200|04/01/2026|valid|-|
19|QNA - Economy International|<https://qna.org.qa/en/Pages/RSS-Feeds/Economy-International>|200|04/01/2026|valid|-|
20|QNA - Sport International|<https://qna.org.qa/en/Pages/RSS-Feeds/Sport-International>|200|04/01/2026|valid|-|
21|QNA - Miscellaneous International|<https://qna.org.qa/en/Pages/RSS-Feeds/Miscellaneous-International>|200|04/01/2026|valid|-|

### United Arab Emirates (AE)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|The National|<https://www.thenationalnews.com/arc/outboundfeeds/rss/?outputType=xml>|200|04/01/2026|valid|-|
2|Gulf News - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
3|Khaleej Times - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
4|Khaleej Times - Arabic News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
5|Emirates 24/7 - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
6|Khaleej Times - UAE RSS|<https://www.khaleejtimes.com/api/v1/collections/uae.rss>|200|04/01/2026|valid|-|
7|Khaleej Times - Business RSS|<https://www.khaleejtimes.com/api/v1/collections/business.rss>|200|04/01/2026|valid|-|
8|Khaleej Times - Top Section RSS|<https://www.khaleejtimes.com/api/v1/collections/top-section.rss>|200|04/01/2026|valid|-|
9|Al Ittihad - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
10|Al Khaleej - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
11|Gulf Business|<https://gulfbusiness.com/feed/>|200|04/01/2026|valid|-|
12|Economy Middle East|<https://economymiddleeast.com/feed/>|200|04/01/2026|valid|-|
13|Arabian Business|<https://www.arabianbusiness.com/feed/>|403 (HTTP_403)|04/01/2026|invalid|-|
14|Albayan - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
15|Emarat Al Youm - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
16|Emarat Al Youm - Local Section|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
17|Emarat Al Youm - Business Section|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
18|Emarat Al Youm - Politics Section|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
19|Emarat Al Youm - Sports Section|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|

### Ecuador (EC)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Primicias|<https://www.primicias.ec/feed/>|Recovered via sitemap|04/01/2026|valid|-|
2|El Universo|<https://www.eluniverso.com/arc/outboundfeeds/rss/category/noticias/?outputType=xml>|200|04/01/2026|valid|-|
3|El Comercio - Titulares|<https://elcomercio.com/rss>|200|04/01/2026|valid|-|
4|El Comercio - Actualidad|<https://elcomercio.com/rss/actualidad>|200 (HTML_RETURNED)|04/01/2026|invalid|-|
5|El Comercio - Tendencias|<https://elcomercio.com/rss/tendencias>|200 (HTML_RETURNED)|04/01/2026|invalid|-|
6|El Comercio - Deportes|<https://elcomercio.com/rss/deportes>|200 (HTML_RETURNED)|04/01/2026|invalid|-|
7|El Comercio - Opinion|<https://elcomercio.com/rss/opinion>|200 (HTML_RETURNED)|04/01/2026|invalid|-|

### Oman (OM)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Oman Observer|<https://www.omanobserver.om/rssFeed/1>|200|04/01/2026|valid|-|
2|Oman Observer - Main|<https://www.omanobserver.om/rssFeed/0>|200|04/01/2026|valid|-|
3|Oman Observer - Sports|<https://www.omanobserver.om/rssFeed/3>|200|04/01/2026|valid|-|
4|Oman Observer - Business|<https://www.omanobserver.om/rssFeed/4>|200|04/01/2026|valid|-|
5|Times of Oman|<https://timesofoman.com/feed/>|200|04/01/2026|valid|-|
6|The Arabian Stories|<https://www.thearabianstories.com/feed/>|200|04/01/2026|valid|-|
7|Muscat Daily - Post Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
8|Muscat Daily - Oman|<https://www.muscatdaily.com/category/oman/feed/>|Recovered via sitemap|04/01/2026|valid|-|
9|Muscat Daily - Business|<https://www.muscatdaily.com/category/business/feed/>|Recovered via sitemap|04/01/2026|valid|-|

### Colombia (CO)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|InSight Crime|<https://insightcrime.org/feed/>|200|04/01/2026|valid|-|
2|El Tiempo|<https://www.eltiempo.com/rss/colombia.xml>|200|04/01/2026|valid|-|
3|El Espectador|<https://www.elespectador.com/arc/outboundfeeds/rss/?outputType=xml>|200|04/01/2026|valid|-|
4|Semana|<https://www.semana.com/arc/outboundfeeds/rss/?outputType=xml>|200|04/01/2026|valid|-|
5|La Republica|<https://www.larepublica.co/rss>|200|04/01/2026|valid|-|
6|Portafolio - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
7|El Colombiano - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
8|El Heraldo - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
9|Caracol Radio - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
10|Blu Radio - Latest Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
11|El Pais - Colombia|<https://www.elpais.com.co/arc/outboundfeeds/rss/category/colombia/?outputType=xml>|200|04/01/2026|valid|-|

### Vietnam (VN)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|VnExpress|<https://vnexpress.net/rss/tin-moi-nhat.rss>|200|04/01/2026|valid|-|
2|VnExpress - Thoi Su|<https://vnexpress.net/rss/thoi-su.rss>|200|04/01/2026|valid|-|
3|VnExpress - The Gioi|<https://vnexpress.net/rss/the-gioi.rss>|200|04/01/2026|valid|-|
4|VnExpress - Kinh Doanh|<https://vnexpress.net/rss/kinh-doanh.rss>|200|04/01/2026|valid|-|
5|VnExpress - Phap Luat|<https://vnexpress.net/rss/phap-luat.rss>|200|04/01/2026|valid|-|
6|VnExpress - Giao Duc|<https://vnexpress.net/rss/giao-duc.rss>|200|04/01/2026|valid|-|
7|Tuoi Tre|<https://tuoitre.vn/rss/tin-moi-nhat.rss>|200|04/01/2026|valid|-|
8|Dan Tri|<https://dantri.com.vn/rss/home.rss>|200|04/01/2026|valid|-|
9|Dan Tri - Thoi Su|<https://dantri.com.vn/rss/thoi-su.rss>|200|04/01/2026|valid|-|
10|Dan Tri - Kinh Doanh|<https://dantri.com.vn/rss/kinh-doanh.rss>|200|04/01/2026|valid|-|
11|Dan Tri - The Gioi|<https://dantri.com.vn/rss/the-gioi.rss>|200|04/01/2026|valid|-|
12|Dan Tri - Phap Luat|<https://dantri.com.vn/rss/phap-luat.rss>|200|04/01/2026|valid|-|
13|Dan Tri - Giao Duc|<https://dantri.com.vn/rss/giao-duc.rss>|200|04/01/2026|valid|-|
14|Thanh Nien|<https://thanhnien.vn/rss/home.rss>|200|04/01/2026|valid|-|
15|Thanh Nien - Chinh Tri|<https://thanhnien.vn/rss/chinh-tri.rss>|200|04/01/2026|valid|-|
16|Thanh Nien - Kinh Te|<https://thanhnien.vn/rss/kinh-te.rss>|200|04/01/2026|valid|-|
17|Thanh Nien - Doi Song|<https://thanhnien.vn/rss/doi-song.rss>|200|04/01/2026|valid|-|
18|Thanh Nien - Giao Duc|<https://thanhnien.vn/rss/giao-duc.rss>|200|04/01/2026|valid|-|
19|Tien Phong|<https://tienphong.vn/rss/home.rss>|200|04/01/2026|valid|-|
20|Nguoi Lao Dong|<https://nld.com.vn/rss/home.rss>|200|04/01/2026|valid|-|
21|Nguoi Lao Dong - Kinh Te|<https://nld.com.vn/rss/kinh-te.rss>|200|04/01/2026|valid|-|
22|Nguoi Lao Dong - Giao Duc Khoa Hoc|<https://nld.com.vn/rss/giao-duc-khoa-hoc.rss>|200|04/01/2026|valid|-|
23|VOV|<https://vov.vn/rss/home.rss>|200|04/01/2026|valid|-|
24|Suc Khoe & Doi Song|<https://suckhoedoisong.vn/index.rss>|200|04/01/2026|valid|-|
25|VietnamPlus|<https://www.vietnamplus.vn/rss/home.rss>|200|04/01/2026|valid|-|
26|Bao Chinh Phu|<https://baochinhphu.vn/home.rss>|200|04/01/2026|valid|-|
27|VnEconomy - Google News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
28|Nong Nghiep Moi Truong - Sitemap News|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
29|VietnamNet - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
30|PLO - News Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
31|Znews - Sitemap News|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
32|Nhan Dan|<https://nhandan.vn/rss/home.rss>|200|04/01/2026|valid|-|
33|SGGP|<https://www.sggp.org.vn/rss/home.rss>|200|04/01/2026|valid|-|
34|VietTimes|<https://viettimes.vn/rss/home.rss>|200|04/01/2026|valid|-|
35|Vietnam News - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
36|Bao Tin Tuc - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
37|Dai Doan Ket - Sitemap Index|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
38|Cong Thuong - News Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
39|An Ninh Thu Do|<https://anninhthudo.vn/rss/home.rss>|200|04/01/2026|valid|-|
40|VTV|<https://vtv.vn/rss/home.rss>|200|04/01/2026|valid|-|
41|VietnamBiz|<https://vietnambiz.vn/tin-moi-nhat.rss>|200|04/01/2026|valid|-|
42|VietnamFinance - Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
43|Bao Phap Luat - Latest Articles|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|
44|QDND - Top 300 Sitemap|N/A|❌ NO_SOURCE|04/01/2026|needs verification|-|

