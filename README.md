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

These defaults keep coverage broad while preventing giant sitemap endpoints from exploding into 5,000-item fan-out work on a single hourly run.

Recommended operational pattern:

1. ingest articles normally
2. let `suspect` rows stay hidden from customer reads
3. run `repair:suspect-titles` on a schedule
4. only show recovered titles after they pass the quality gate

## What customers can do

- open the portal and unlock access with an issued customer token
- browse dashboard counts by primary section, country, and date
- filter article lists in Explorer by multiple normalized sections, source tags, country, and date
- download only authenticated result sets when enabled for their account

## Customer access model

World Press Radar is no longer designed around public static article dumps. The primary product path is:

1. customer opens the web app
2. customer enters a valid API token on the access screen
3. web app calls the authenticated news API
4. API queries PostgreSQL and returns only the requested slice of data

Without a valid token:

- the dashboard does not load article counts
- the explorer does not load article lists
- article downloads stay locked
- anonymous article browsing is blocked

This keeps the UI fast, avoids multi-hundred-megabyte JSON downloads, and lets the product scale beyond the old public export cap.

## Customer quick start

1. Open the customer portal URL shared with you.
2. Enter the token you received from the World Press Radar team.
3. Use `Dashboard` for summary counts.
4. Use `Explorer` for filtered article lists by one or more normalized sections, country, and date.
5. If your account has download rights, export only from authenticated screens.

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

- Last checked: 03/18/2026
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

- Checked endpoints: `1734`
- Valid: `1669`
- Invalid: `65`
- Recovered via sitemap: `34`
- No-source rows: `319`
- Sitemap fallback checks: checked `99`, attempted `99`, success `34`, failed `65`, no-candidate `0`, candidates `832`
- Snapshot date: `03/18/2026`
- README volume column: `Ingested 24h` (unique rows in `news_articles.created_at`)
- Source artifact: `audits/readme_rss_health_latest.json`

### Failure reasons
|Reason|Count|
|---|---:|
|HTTP_403|28|
|TIMEOUT|13|
|HTTP_502|8|
|HTTP_503|7|
|HTML_RETURNED|6|
|NETWORK|2|
|HTTP_404|1|

### Invalid feeds by reason

#### HTTP_403 (28)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Argentina|BAE Negocios|<https://www.baenegocios.com/feed/>|403|
|Argentina|Cronica|<https://www.cronica.com.ar/feed/>|403|
|Austria|Finanzen.at (Stocks/Finance)|<https://www.finanzen.at/rss/news>|403|
|India|DNA India (India)|<https://www.dnaindia.com/feeds/india.xml>|403|
|India|Firstpost|<https://www.firstpost.com/commonfeeds/v1/mfp/rss/web-stories.xml>|403|
|Indonesia|Tempo.co (Politics and Investigations)|<https://tempo.co/rss>|403|
|Ireland|Belfast Telegraph|<https://www.belfasttelegraph.co.uk/rss>|403|
|Ireland|Sunday World|<https://www.sundayworld.com/feed>|403|
|Japan|Mainichi Flash|<https://mainichi.jp/rss/etc/mainichi-flash.rss>|403|
|Netherlands|De Telegraaf|<https://www.telegraaf.nl/rss>|403|
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
|Thailand|Khaosod English|<https://www.khaosodenglish.com/rss>|403|
|Thailand|Khaosod English - Food (category)|<http://www.khaosodenglish.com/category/life/food/feed>|403|
|Thailand|Matichon|<https://www.matichon.co.th/rss>|403|
|Thailand|Prachachat|<https://prachachat.net/feed/>|403|
|United States|Chicago Tribune|<https://chicagotribune.com/feed>|403|
|United States|Denver Post|<https://denverpost.com/feed>|403|
|United States|San Diego Union-Tribune|<https://sandiegouniontribune.com/feed>|403|
|United States|San Jose Mercury News|<https://mercurynews.com/feed>|403|

#### TIMEOUT (13)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Canada|Financial Post (Economy)|<https://financialpost.com/feed>|-|
|Canada|Owen Sound Sun Times|<https://owensoundsuntimes.com/feed>|-|
|Chile|The Santiago Times|<https://santiagotimes.cl/feed>|-|
|Dominican Republic|Z101 Digital|<https://www.z101digital.com/feed/>|-|
|Indonesia|ANTARA - Ekonomi (Bisnis)|<https://www.antaranews.com/rss/ekonomi-bisnis.xml>|-|
|Indonesia|ANTARA - Sepakbola (Internasional)|<https://www.antaranews.com/rss/sepakbola-internasional.xml>|-|
|Indonesia|ANTARA - Tekno|<https://www.antaranews.com/rss/tekno.xml>|-|
|Iran|Mehr News|<https://www.mehrnews.com/rss>|-|
|Iran|MehrNews (EN) - Iran|<https://en.mehrnews.com/rss/tp/575>|-|
|Iran|MehrNews (EN) - Iran > Iran|<https://en.mehrnews.com/rss/tp/905>|-|
|Iran|MehrNews (EN) - Latest|<https://en.mehrnews.com/rss/pl/118>|-|
|Iran|MehrNews (EN) - Nature|<https://en.mehrnews.com/rss/tp/898>|-|
|Iran|MehrNews (EN) - Persian Cuisine|<https://en.mehrnews.com/rss/tp/901>|-|

#### HTTP_502 (8)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Canada|Calgary Herald|<https://calgaryherald.com/feed>|502|
|Canada|Calgary Sun|<https://calgarysun.com/feed>|502|
|Canada|Canada.com|<https://o.canada.com/feed>|502|
|Canada|Edmonton Journal|<https://edmontonjournal.com/feed>|502|
|Canada|Edmonton Sun|<https://edmontonsun.com/feed>|502|
|Canada|Stratford Beacon Herald|<https://stratfordbeaconherald.com/feed>|502|
|Canada|The StarPhoenix|<https://thestarphoenix.com/feed>|502|
|Canada|Windsor Star|<https://windsorstar.com/feed>|502|

#### HTTP_503 (7)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Canada|National Post|<https://nationalpost.com/feed>|503|
|Canada|Ottawa Sun|<https://ottawasun.com/feed>|503|
|Canada|The Province|<https://theprovince.com/feed>|503|
|Canada|Toronto Sun|<https://torontosun.com/feed>|503|
|Thailand|Khaosod - Breaking News|<https://www.khaosod.co.th/breaking-news/feed>|503|
|Thailand|Khaosod - Foreign|<https://www.khaosod.co.th/around-the-world-news/feed>|503|
|Thailand|Khaosod - Sports|<https://www.khaosod.co.th/sports/feed>|503|

#### HTML_RETURNED (6)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Ireland|The Sun Ireland|<https://www.thesun.ie/feed/>|200|
|Japan|Diamond Online|<https://diamond.jp/list/feed/rss>|200|
|Japan|Goo News (Business)|<https://news.goo.ne.jp/rss/topstories/business/index.rdf>|200|
|Japan|Goo News (Politics)|<https://news.goo.ne.jp/rss/topstories/politics/index.rdf>|200|
|Turkey|Hurriyet (Saglk)|<http://www.hurriyet.com.tr/rss/saglik>|200|
|United Kingdom|The Sun|<https://www.thesun.co.uk/feed/>|200|

#### NETWORK (2)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Iran|Khabar Online|<https://www.khabaronline.ir/rss>|-|
|South Korea|Donga Ilbo|<https://rss.donga.com/total.xml>|-|

#### HTTP_404 (1)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Brazil|CNN Brasil (Business)|<https://www.cnnbrasil.com.br/business/feed/>|404|

### Sitemap fallback successes
|Country|Outlet|Failed RSS URL|Recovered via sitemap|
|---|---|---|---|
|China|Tencent Tech (Tencent Technology News)|<https://new.qq.com/ch/tech/>|<https://news.qq.com/sitemap/sitemap_1182200090.xml>|
|United Kingdom|Financial Times - World|<https://www.ft.com/rss/world>|<https://www.ft.com/sitemaps/news.xml>|
|United Kingdom|Financial Times - Energy|<https://www.ft.com/rss/companies/energy>|<https://www.ft.com/sitemaps/news.xml>|
|United Kingdom|Telegraph - Business|<https://www.telegraph.co.uk/business/rss.xml>|<https://www.telegraph.co.uk/vouchercodes/sitemap/shops.xml>|
|United Kingdom|The Telegraph UK|<https://www.telegraph.co.uk/rss.xml>|<https://www.telegraph.co.uk/vouchercodes/sitemap/shops.xml>|
|Canada|CTV News - Business|<https://www.ctvnews.ca/rss/business/ctvnews-ca-business-public-rss-1.822283>|<https://www.ctvnews.ca/arc/outboundfeeds/sitemap-news/latest/>|
|Russia|Expert.ru (Economy Magazine)|<https://www.expert.ru/rss/>|<https://expert.ru/sitemap-files.xml>|
|Mexico|Forbes México|<https://www.forbes.com.mx/feed/>|<https://www.forbes.com.mx/news-sitemap.xml>|
|Indonesia|Suara (Independent News)|<https://www.suara.com/rss>|<https://www.suara.com/news/sitemap-news.xml>|
|Netherlands|NRC|<https://www.nrc.nl/rss>|<https://www.nrc.nl/sitemap/2026-3.xml>|
|Netherlands|NRC|<https://www.nrc.nl/nieuws/rss/>|<https://www.nrc.nl/sitemap/2026-3.xml>|
|Netherlands|NRC|<https://www.nrc.nl/rss/>|<https://www.nrc.nl/sitemap/2026-3.xml>|
|Netherlands|RTL Z (Business)|<https://www.rtlnieuws.nl/economie/rss.xml>|<https://www.rtl.nl/sitemap-news.xml>|
|Netherlands|Omroep Delft|<https://omroepdelft.nl/feed/>|<https://www.omroepdelft.nl/post-sitemap1.xml>|
|Turkey|T24 (Independent Digital Media)|<https://t24.com.tr/rss>|<https://media-cdn.t24.com.tr/media/sitemaps/authors.xml>|
|Saudi Arabia|Gulf Business (Saudi Section)|<https://gulfbusiness.com/region/saudi-arabia/feed/>|<https://gulfbusiness.com/sitemap.xml>|
|Saudi Arabia|Akhbaar24 (General Portal)|<https://akhbaar24.argaam.com/rss>|<https://www.akhbaar24.com/sitemaps/2023/3/sitemap_0.xml?v=1.1>|
|Sweden|Radio Sweden - Sweden Today (podcast xml)|<http://sverigesradio.se/Podradio/xml/SRI_en_sweToday.xml>|<https://www.sverigesradio.se/newssitemap>|
|Belgium|Brussels Times|<https://www.brusselstimes.com/rss-feed>|<https://www.brusselstimes.com/google-news-sitemap.xml>|
|Thailand|Thairath (News)|<http://www.thairath.co.th/rss/news.xml>|<https://www.thairath.co.th/sitemap-news-daily.xml>|

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
|Australia|AdelaideNow - Sitemap Index|
|Australia|AFR (Financial Review)|
|Australia|Geelong Advertiser - Sitemap Index|
|Australia|Gold Coast Bulletin - Sitemap Index|
|Australia|News.com.au - Sitemap Index|
|Australia|NT News - Sitemap Index|
|Australia|PerthNow - Sitemap Index|
|Australia|SBS Dateline - Sitemap|
|Australia|SBS News - English Sitemap|
|Australia|SBS News - Sitemap|
|Australia|The Australian - Sitemap Index|
|Australia|The Chronicle - Sitemap Index|
|Australia|The Mercury - Sitemap Index|
|Australia|The West Australian - Sitemap Index|
|Australia|Townsville Bulletin - Sitemap Index|
|Australia|Weekly Times - Sitemap Index|
|Austria|Die Presse - News Sitemap|
|Austria|Salzburger Nachrichten - News Sitemap|
|Belgium|DHnet - News Sitemap|
|Belgium|L'Avenir - News Sitemap|
|Belgium|La Libre - News Sitemap|
|Belgium|Le Soir - News Sitemap|
|Belgium|Sudinfo - News Sitemap|
|Belgium|VRT News - News Sitemap|
|Bulgaria|24 Chasa|
|Bulgaria|BNR - Sitemap Index|
|Bulgaria|BNT News|
|Bulgaria|NOVA - Latest Accents|
|Bulgaria|NOVA - Latest News|
|Bulgaria|SEGA - Google News Sitemap|
|Canada|CP24 - Sitemap Index|
|Canada|CP24 - Sitemap News Index|
|Canada|CTV News - Sitemap News Index|
|Canada|Global News - News Sitemap|
|Canada|La Presse - News Sitemap|
|Canada|National Post - News Sitemap|
|Canada|The Globe and Mail - Sitemap Index|
|Canada|Toronto Star - Sitemap Index|
|Chile|Chilevision Noticias|
|Chile|CNN Chile|
|Chile|El Dinamo|
|Chile|El Mostrador|
|Chile|Meganoticias|
|Chile|Radio Agricultura|
|China|CGTN - Latest News Sitemap|
|China|HK01 - News Sitemap|
|China|People.cn - News Sitemap Index|
|China|Shine - News Sitemap|
|China|The Standard - News Sitemap|
|Croatia|24sata|
|Croatia|Dnevnik.hr|
|Croatia|N1 Hrvatska|
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
|Denmark|Avisen Danmark - Sitemap Index|
|Denmark|Avisen.dk|
|Denmark|Berlingske|
|Denmark|BT|
|Denmark|Finans.dk - Sitemap Index|
|Denmark|Fyens - Sitemap Index|
|Denmark|Information - Latest Sitemap|
|Denmark|Jyllands-Posten|
|Denmark|Nordjyske - Sitemap Index|
|Denmark|Weekendavisen|
|Dominican Republic|Acento|
|Dominican Republic|El Caribe|
|Dominican Republic|Listin Diario - Portada|
|Estonia|Arileht|
|Estonia|Delfi Estonia|
|Estonia|ERR|
|Estonia|Ohtuleht|
|Estonia|Postimees|
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
|France|BFM TV - News Sitemap|
|France|CNEWS - Google News Sitemap|
|France|France Info - News Sitemap|
|France|Le Figaro - News Sitemap|
|France|Le Monde - News Sitemap|
|France|Le Point - News Sitemap|
|France|Le Telegramme - News Sitemap|
|France|Liberation - News Sitemap|
|France|TF1 Info - News Sitemap|
|Germany|Augsburger Allgemeine - News Sitemap|
|Germany|BILD - News Sitemap|
|Germany|Der Spiegel - News Sitemap|
|Germany|Die Zeit - Sitemap Index|
|Germany|Handelsblatt - Agentur News Sitemap|
|Germany|Handelsblatt - News Sitemap|
|Germany|Handelsblatt - Premium News Sitemap|
|Germany|Merkur - News Sitemap|
|Germany|n-tv - News Sitemap|
|Germany|Tagesspiegel - News Sitemap|
|Germany|WELT - News Sitemap|
|Hungary|Index.hu|
|Hungary|Portfolio|
|Iceland|Visir|
|Ireland|Independent.ie - Sitemap Index|
|Ireland|Irish Mirror|
|Ireland|Leinster Leader|
|Ireland|Limerick Leader|
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
|Latvia|Apollo|
|Latvia|Delfi Latvia|
|Latvia|Jauns.lv|
|Latvia|TVNET|
|Lithuania|15min|
|Lithuania|15min - Articles Index|
|Lithuania|Delfi Lithuania|
|Lithuania|Delfi Lithuania - Sitemap Index|
|Lithuania|Diena|
|Lithuania|TV3 Lithuania|
|Luxembourg|Luxembourg Times|
|Luxembourg|Luxemburger Wort|
|Mexico|Animal Politico - News Sitemap|
|Mexico|El Heraldo de Mexico - News Sitemap Index|
|Mexico|El Sol de Mexico - Update Sitemap|
|Mexico|El Universal - Ciencia Sitemap|
|Mexico|El Universal - Cultura Sitemap|
|Mexico|El Universal - De Ultima Sitemap|
|Mexico|El Universal - Edomex Sitemap|
|Mexico|El Universal - Elecciones Sitemap|
|Mexico|El Universal - Estados Sitemap|
|Mexico|El Universal - Mundo Sitemap|
|Mexico|El Universal - Nacion Sitemap|
|Mexico|El Universal - Opinion Sitemap|
|Mexico|El Universal - Techbit Sitemap|
|Mexico|Excelsior - News Sitemap|
|Mexico|Excelsior - Sitemap Index|
|Mexico|Milenio - Articles Sitemap Index|
|Mexico|Milenio - Google News Sitemap|
|Mexico|N+MAS - News Sitemap|
|Mexico|UnoTV - News Sitemap|
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
|Norway|VG - Dine Penger Sitemap|
|Poland|PolskieRadio24 - Sitemap|
|Poland|Rzeczpospolita - News Sitemap|
|Poland|SE.pl - News Sitemap|
|Portugal|24 Noticias|
|Portugal|A Bola|
|Portugal|Correio da Manha|
|Portugal|Diario de Noticias|
|Portugal|Jornal de Negocios|
|Portugal|Record|
|Portugal|RTP Noticias|
|Portugal|Sol|
|Romania|Antena3|
|Romania|DCNews|
|Romania|Economedia|
|Romania|Gandul|
|Romania|Libertatea|
|Romania|Mediafax|
|Romania|Stirile ProTV|
|Romania|Ziare.com|
|Serbia|Blic - Latest Sitemap|
|Serbia|Kurir|
|Serbia|N1|
|Serbia|N1 Serbia|
|Serbia|Novosti|
|Serbia|Telegraf|
|Slovakia|Aktuality.sk|
|Slovakia|Dennik N|
|Slovakia|TVNoviny.sk|
|Slovenia|24ur|
|Spain|ABC.es - Sitemap|
|Spain|El Correo - Incremental Sitemap|
|Spain|El Espanol - Google News Sitemap|
|Spain|El Pais - News Sitemap|
|Spain|El Periodico - News Sitemap|
|Spain|eldiario.es - Google News Sitemap|
|Spain|La Vanguardia - News Sitemap|
|Spain|OKdiario - Google News Sitemap|
|Spain|RTVE - News Sitemap|
|Switzerland|20 Minuten - Articles Sitemap (German)|
|Switzerland|20 Minutes - Articles Sitemap (French)|
|Switzerland|24 heures - News Sitemap|
|Switzerland|Basler Zeitung - News Sitemap|
|Switzerland|Berner Zeitung - News Sitemap|
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
|Switzerland|Tele1 - Sitemap|
|Switzerland|TeleBarn - Sitemap|
|Switzerland|TeleM1 - Sitemap|
|Switzerland|TeleZuri - Sitemap|
|Switzerland|Ticinonline - Sitemap|
|Switzerland|Tribune de Geneve - News Sitemap|
|Switzerland|Watson - Google News Sitemap|
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
|Thailand|Bangkok Biz News - Sitemap Index|
|Thailand|Bangkok Post - Sitemap Index|
|Thailand|Nation Thailand - Sitemap Index|
|Thailand|Nation TV - Sitemap Index|
|Thailand|Post Today - Sitemap Index|
|Thailand|PPTVHD36 - Sitemap Index|
|Thailand|Thairath - Hourly Sitemap|
|Thailand|Thairath - Sitemap Index|
|Ukraine|Interfax-Ukraine|
|Ukraine|Kyiv Independent|
|United Kingdom|BBC News - Sitemap Index|
|United Kingdom|Birmingham Live - News Sitemap|
|United Kingdom|ChronicleLive - News Sitemap|
|United Kingdom|Daily Express - Google News Sitemap|
|United Kingdom|Daily Record - News Sitemap|
|United Kingdom|ExaminerLive - News Sitemap|
|United Kingdom|Liverpool Echo - News Sitemap|
|United Kingdom|Manchester Evening News - News Sitemap|
|United Kingdom|Mirror - News Sitemap|
|United Kingdom|MyLondon - News Sitemap|
|United Kingdom|The Sun - News Sitemap|
|United Kingdom|WalesOnline - News Sitemap|
|Uruguay|El Observador Uruguay - Sitemap|
|Uruguay|El Pais Uruguay|
|Uruguay|Subrayado|
|Uruguay|Telenoche|
### United States (US)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|The New York Times|<https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml>|200|03/18/2026|valid|52|
2|Wall Street Journal|<https://feeds.a.dj.com/rss/RSSWorldNews.xml>|200|03/18/2026|valid|0|
3|LA Times|<https://www.latimes.com/local/rss2.0.xml>|200|03/18/2026|valid|22|
4|CNN|<http://rss.cnn.com/rss/cnn_topstories.rss>|200|03/18/2026|valid|0|
5|Fox News|<http://moxie.foxnews.com/google-publisher/latest.xml>|200|03/18/2026|valid|135|
6|NBC News|<http://feeds.nbcnews.com/nbcnews/public/news>|200|03/18/2026|valid|12|
7|CBS News|<https://www.cbsnews.com/latest/rss/main>|200|03/18/2026|valid|75|
8|ABC News|<https://abcnews.go.com/abcnews/topstories>|200|03/18/2026|valid|17|
9|NPR|<https://feeds.npr.org/1001/rss.xml>|200|03/18/2026|valid|18|
10|HuffPost|<https://www.huffpost.com/section/front-page/feed>|200|03/18/2026|valid|53|
11|BuzzFeed News|<https://www.buzzfeednews.com/news.xml>|200|03/18/2026|valid|12|
12|Vox|<https://www.vox.com/rss/index.xml>|200|03/18/2026|valid|5|
13|CNBC|<https://www.cnbc.com/id/100003114/device/rss/rss.html>|200|03/18/2026|valid|34|
14|Financial Times|<https://www.ft.com/?format=rss>|200|03/18/2026|valid|0|
15|Forbes|<https://www.forbes.com/most-popular/feed/>|200|03/18/2026|valid|0|
16|Fortune|<https://fortune.com/feed>|200|03/18/2026|valid|22|
17|Business Insider|<https://www.businessinsider.com/rss>|200|03/18/2026|valid|69|
18|MarketWatch|<http://feeds.marketwatch.com/marketwatch/topstories/>|200|03/18/2026|valid|28|
19|Fast Company|<https://www.fastcompany.com/rss>|200|03/18/2026|valid|39|
20|TechCrunch|<https://techcrunch.com/feed/>|200|03/18/2026|valid|14|
21|The Verge|<https://www.theverge.com/rss/index.xml>|200|03/18/2026|valid|23|
22|Wired|<https://www.wired.com/feed/rss>|200|03/18/2026|valid|21|
23|Ars Technica|<http://feeds.arstechnica.com/arstechnica/index>|200|03/18/2026|valid|16|
24|Engadget|<https://www.engadget.com/rss.xml>|200|03/18/2026|valid|27|
25|VentureBeat|<https://venturebeat.com/feed/>|200|03/18/2026|valid|6|
26|Mashable|<https://mashable.com/feed>|200|03/18/2026|valid|43|
27|Gizmodo|<https://gizmodo.com/rss>|200|03/18/2026|valid|34|
28|CNET|<https://www.cnet.com/rss/news/>|200|03/18/2026|valid|40|
29|ZDNet|<https://www.zdnet.com/news/rss.xml>|200|03/18/2026|valid|28|
30|The Hill|<https://thehill.com/feed>|200|03/18/2026|valid|89|
31|Axios|<https://api.axios.com/feed/>|200|03/18/2026|valid|8|
32|Breitbart|<http://feeds.feedburner.com/breitbart>|200|03/18/2026|valid|45|
33|National Review|<https://www.nationalreview.com/feed/>|200|03/18/2026|valid|8|
34|Slate|<https://slate.com/feeds/all.rss>|200|03/18/2026|valid|17|
35|The New Yorker|<https://www.newyorker.com/feed/everything>|200|03/18/2026|valid|4|
36|The Atlantic|<https://www.theatlantic.com/feed/all/>|200|03/18/2026|valid|18|
37|Boston Globe|<https://www.bostonglobe.com/arc/outboundfeeds/rss?outputType=xml>|200|03/18/2026|valid|120|
38|New York Post|<https://nypost.com/feed>|200|03/18/2026|valid|299|
39|Chicago Tribune|<https://chicagotribune.com/feed>|403 (HTTP_403)|03/18/2026|invalid|0|
40|Seattle Times|<https://seattletimes.com/feed>|200|03/18/2026|valid|110|
41|Denver Post|<https://denverpost.com/feed>|403 (HTTP_403)|03/18/2026|invalid|0|
42|San Jose Mercury News|<https://mercurynews.com/feed>|403 (HTTP_403)|03/18/2026|invalid|0|
43|Las Vegas Review-Journal|<https://reviewjournal.com/feed>|200|03/18/2026|valid|44|
44|San Diego Union-Tribune|<https://sandiegouniontribune.com/feed>|403 (HTTP_403)|03/18/2026|invalid|0|
45|Honolulu Star-Advertiser|<https://staradvertiser.com/feed>|200|03/18/2026|valid|54|
46|Variety|<https://variety.com/feed>|200|03/18/2026|valid|69|
47|The Hollywood Reporter|<https://hollywoodreporter.com/feed>|200|03/18/2026|valid|58|
48|Deadline|<https://deadline.com/feed>|200|03/18/2026|valid|64|
49|Rolling Stone|<https://rollingstone.com/feed>|200|03/18/2026|valid|24|
50|Billboard|<https://billboard.com/feed>|200|03/18/2026|valid|57|
51|Vanity Fair|<http://feeds.feedburner.com/vfdotcomrss>|200|03/18/2026|valid|0|
52|Esquire|<https://www.esquire.com/rss/entertainment.xml>|200|03/18/2026|valid|2|
53|GQ|<https://www.gq.com/feed/rss>|200|03/18/2026|valid|10|
54|Space.com|<https://www.space.com/feeds/all>|200|03/18/2026|valid|14|
55|ESPN|<https://www.espn.com/espn/rss/news>|200|03/18/2026|valid|61|
56|Sports Illustrated|<https://si.com/feed>|200|03/18/2026|valid|1026|
57|Mother Jones|<https://motherjones.com/feed>|200|03/18/2026|valid|5|
58|ProPublica|<https://propublica.org/feed>|200|03/18/2026|valid|1|
59|Reason|<https://reason.com/feed>|200|03/18/2026|valid|21|
60|Jacobin|<https://jacobin.com/feed>|200|03/18/2026|valid|3|
61|Quartz|<https://qz.com/feed>|200|03/18/2026|valid|32|
62|The Intercept|<https://theintercept.com/feed>|200|03/18/2026|valid|2|
63|Newsweek|<https://www.newsweek.com/rss>|200|03/18/2026|valid|249|
64|Time|<https://time.com/feed>|200|03/18/2026|valid|0|
65|PBS NewsHour|<https://www.pbs.org/newshour/feeds/rss/headlines>|200|03/18/2026|valid|19|

### China (CN)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|China Daily|<http://www.chinadaily.com.cn/rss/world_rss.xml>|200|03/18/2026|valid|0|
2|TechNode|<https://technode.com/feed>|200|03/18/2026|valid|5|
3|South China Morning Post|<https://www.scmp.com/rss/91/feed>|200|03/18/2026|valid|82|
4|Initium|<https://theinitium.com/feed>|200|03/18/2026|valid|3|
5|Liberty Times|<https://news.ltn.com.tw/rss/all.xml>|200|03/18/2026|valid|657|
6|People China|<https://people.com.cn/rss/politics.xml>|200|03/18/2026|valid|0|
7|China Daily English|<https://www.chinadaily.com.cn/rss/world_rss.xml>|200|03/18/2026|valid|0|
8|China Daily - China|<http://www.chinadaily.com.cn/rss/china_rss.xml>|200|03/18/2026|valid|0|
9|China Daily - BizChina|<http://www.chinadaily.com.cn/rss/bizchina_rss.xml>|200|03/18/2026|valid|0|
10|China Daily - Opinion|<http://www.chinadaily.com.cn/rss/opinion_rss.xml>|200|03/18/2026|valid|0|
11|China Daily - Sports|<http://www.chinadaily.com.cn/rss/sports_rss.xml>|200|03/18/2026|valid|0|
12|China Daily - Entertainment|<http://www.chinadaily.com.cn/rss/entertainment_rss.xml>|200|03/18/2026|valid|0|
13|China Daily - Lifestyle|<http://www.chinadaily.com.cn/rss/lifestyle_rss.xml>|200|03/18/2026|valid|0|
14|China Daily - Photos|<http://www.chinadaily.com.cn/rss/photo_rss.xml>|200|03/18/2026|valid|0|
15|China Daily - China Daily (main)|<http://www.chinadaily.com.cn/rss/cndy_rss.xml>|200|03/18/2026|valid|0|
16|China Daily - HK Edition|<http://www.chinadaily.com.cn/rss/hk_rss.xml>|200|03/18/2026|valid|0|
17|China Daily - USA (kindle)|<http://usa.chinadaily.com.cn/usa_kindle.xml>|needs check|03/18/2026|needs verification|0|
18|China Daily - EU Weekly|<http://europe.chinadaily.com.cn/euweekly_rss.xml>|200|03/18/2026|valid|0|
19|People.cn - Politics|<http://www.people.com.cn/rss/politics.xml>|200|03/18/2026|valid|0|
20|People.cn - Society|<http://www.people.com.cn/rss/society.xml>|200|03/18/2026|valid|0|
21|People.cn - Legal|<http://www.people.com.cn/rss/legal.xml>|200|03/18/2026|valid|0|
22|People.cn - World|<http://www.people.com.cn/rss/world.xml>|200|03/18/2026|valid|0|
23|People.cn - Opinion|<http://www.people.com.cn/rss/opinion.xml>|200|03/18/2026|valid|0|
24|People.cn - ChinaPic|<http://www.people.com.cn/rss/chinapic.xml>|200|03/18/2026|valid|0|
25|CGTN Documentary|<https://news.cgtn.com/rss/documentary/CGTN-Documentary.rss>|200|03/18/2026|valid|0|
26|Zaobao (realtime)|<https://www.zaobao.com.sg/rss/realtime>|needs check|03/18/2026|needs verification|0|
27|RTHK|<https://rthk.hk/rthk/news/rss/c_expressnews_clocal.xml>|200|03/18/2026|valid|60|
28|FT Chinese|<http://www.ftchinese.com/rss/feed>|200|03/18/2026|valid|5|
29|Xinhua|<http://www.xinhuanet.com/politics/news_politics.xml>|200|03/18/2026|valid|0|
30|Sina Finance (Top Financial Portal)|<https://rss.sina.com.cn/roll/finance/hot_roll.xml>|needs check|03/18/2026|needs verification|0|
31|Sina News (General Breaking News)|<https://rss.sina.com.cn/news/world/focus15.xml>|200|03/18/2026|valid|0|
32|HK01 (Hong Kong Digital Media Top Feed)|<https://www.hk01.com/rss>|needs check|03/18/2026|needs verification|0|
33|Ming Pao (Hong Kong Flagship Newspaper)|<https://news.mingpao.com/rss/pns/s00001.xml>|200|03/18/2026|valid|2|
34|HKET (Hong Kong Economic Times)|<https://www.hket.com/rss/hongkong>|needs check|03/18/2026|needs verification|0|
35|Tencent Tech (Tencent Technology News)|<https://new.qq.com/ch/tech/>|Recovered via sitemap|03/18/2026|valid|0|
36|China News Service - Scroll News|<https://www.chinanews.com.cn/rss/scroll-news.xml>|200|03/18/2026|valid|248|
37|China News Service - China|<https://www.chinanews.com.cn/rss/china.xml>|200|03/18/2026|valid|102|
38|China News Service - World|<https://www.chinanews.com.cn/rss/world.xml>|200|03/18/2026|valid|13|
39|China News Service - Finance|<https://www.chinanews.com.cn/rss/finance.xml>|200|03/18/2026|valid|124|
40|People.cn - News Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
41|CGTN - Latest News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
42|HK01 - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
43|The Standard - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
44|Hong Kong Free Press|<https://hongkongfp.com/feed/>|200|03/18/2026|valid|5|
45|Shine - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|

### Japan (JP)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|NHK World (EN)|<https://www3.nhk.or.jp/rss/news/cat0.xml>|200|03/18/2026|valid|2|
2|Mainichi (Biz)|<https://mainichi.jp/rss/etc/english_latest.rss>|needs check|03/18/2026|needs verification|0|
3|Asahi Shimbun|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
4|The Japan Times|<https://www.japantimes.co.jp/feed/>|200|03/18/2026|valid|18|
5|Automotive Ten-Navi|<https://automotive.ten-navi.com/rss/>|200|03/18/2026|valid|0|
6|The Bridge|<https://thebridge.jp/feed/>|needs check|03/18/2026|needs verification|0|
7|Nippon|<https://www.nippon.com/en/feed/>|200|03/18/2026|valid|3|
8|NHK News Web - cat1|<https://www3.nhk.or.jp/rss/news/cat1.xml>|200|03/18/2026|valid|23|
9|NHK News Web - cat2|<https://www3.nhk.or.jp/rss/news/cat2.xml>|200|03/18/2026|valid|1|
10|NHK News Web - cat3|<https://www3.nhk.or.jp/rss/news/cat3.xml>|200|03/18/2026|valid|1|
11|NHK News Web - cat4|<https://www3.nhk.or.jp/rss/news/cat4.xml>|200|03/18/2026|valid|13|
12|NHK News Web - cat5|<https://www3.nhk.or.jp/rss/news/cat5.xml>|200|03/18/2026|valid|13|
13|NHK News Web - cat6|<https://www3.nhk.or.jp/rss/news/cat6.xml>|200|03/18/2026|valid|6|
14|NHK News Web - cat7|<https://www3.nhk.or.jp/rss/news/cat7.xml>|200|03/18/2026|valid|15|
15|ITmedia - |<https://rss.itmedia.co.jp/rss/2.0/itmedia_all.xml>|200|03/18/2026|valid|35|
16|ITmedia - TOP STORIES|<https://rss.itmedia.co.jp/rss/2.0/topstory.xml>|200|03/18/2026|valid|28|
17|ITmedia NEWS - ()|<https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml>|200|03/18/2026|valid|0|
18|ITmedia NEWS - |<https://rss.itmedia.co.jp/rss/2.0/news_domestic.xml>|200|03/18/2026|valid|0|
19|ITmedia NEWS - |<https://rss.itmedia.co.jp/rss/2.0/news_foreign.xml>|200|03/18/2026|valid|0|
20|ITmedia NEWS - |<https://rss.itmedia.co.jp/rss/2.0/news_products.xml>|200|03/18/2026|valid|0|
21|ITmedia NEWS - |<https://rss.itmedia.co.jp/rss/2.0/news_security.xml>|200|03/18/2026|valid|0|
22|ITmedia NEWS - |<https://rss.itmedia.co.jp/rss/2.0/news_technology.xml>|200|03/18/2026|valid|0|
23|ITmedia NEWS - |<https://rss.itmedia.co.jp/rss/2.0/news_nettopics.xml>|200|03/18/2026|valid|0|
24|ITmedia NEWS - |<https://rss.itmedia.co.jp/rss/2.0/news_industry.xml>|200|03/18/2026|valid|0|
25|ITmedia NEWS - Special|<https://rss.itmedia.co.jp/rss/2.0/news_special.xml>|200|03/18/2026|valid|1|
26|ITmedia AI+|<https://rss.itmedia.co.jp/rss/2.0/aiplus.xml>|200|03/18/2026|valid|6|
27|ITmedia Mobile|<https://rss.itmedia.co.jp/rss/2.0/mobile.xml>|200|03/18/2026|valid|4|
28|ITmedia PC USER|<https://rss.itmedia.co.jp/rss/2.0/pcuser.xml>|200|03/18/2026|valid|0|
29|ITmedia |<https://rss.itmedia.co.jp/rss/2.0/business.xml>|200|03/18/2026|valid|0|
30|ITmedia |<https://rss.itmedia.co.jp/rss/2.0/enterprise.xml>|200|03/18/2026|valid|0|
31|J-CAST ()|<https://www.j-cast.com/index.xml>|200|03/18/2026|valid|26|
32|J-CAST|<https://www.j-cast.com/trend/index.xml>|200|03/18/2026|valid|2|
33|J-CAST|<https://www.j-cast.com/kaisha/index.xml>|200|03/18/2026|valid|0|
34|BOOK|<https://books.j-cast.com/rss.xml>|needs check|03/18/2026|needs verification|0|
35|INTERNET Watch (Impress)|<https://internet.watch.impress.co.jp/data/rss/1.0/iw/feed.rdf>|needs check|03/18/2026|needs verification|0|
36|Impress Watch ()|<https://www.watch.impress.co.jp/data/rss/1.0/ipw/feed.rdf>|needs check|03/18/2026|needs verification|0|
37|GIGAZINE (Atom)|<https://gigazine.net/news/rss_atom/>|200|03/18/2026|valid|20|
38|PR TIMES ()|<https://prtimes.jp/index.rdf>|needs check|03/18/2026|needs verification|0|
39|Yahoo Japan - Business|<https://news.yahoo.co.jp/rss/topics/business.xml>|200|03/18/2026|valid|15|
40|Yahoo Japan - World|<https://news.yahoo.co.jp/rss/topics/world.xml>|200|03/18/2026|valid|8|
41|Yahoo Japan - IT/Tech|<https://news.yahoo.co.jp/rss/topics/it.xml>|200|03/18/2026|valid|1|
42|Reuters Japan|<https://news.yahoo.co.jp/rss/media/reut/all.xml>|needs check|03/18/2026|needs verification|0|
43|Bloomberg Japan|<https://news.yahoo.co.jp/rss/media/bloom_st/all.xml>|needs check|03/18/2026|needs verification|0|
44|Forbes Japan|<https://news.yahoo.co.jp/rss/media/fminfo/all.xml>|needs check|03/18/2026|needs verification|0|
45|Kyodo News|<https://news.yahoo.co.jp/rss/media/kyodonews/all.xml>|200|03/18/2026|valid|298|
46|Toyo Keizai|<https://toyokeizai.net/list/feed/rss>|200|03/18/2026|valid|28|
47|Diamond Online|<https://diamond.jp/list/feed/rss>|200 (HTML_RETURNED)|03/18/2026|invalid|0|
48|Sankei News Flash|<https://www.sankei.com/rss/news/flash.xml>|needs check|03/18/2026|needs verification|0|
49|Sankei Economy|<https://www.sankei.com/rss/news/economy.xml>|needs check|03/18/2026|needs verification|0|
50|CNET Japan|<https://feeds.japan.cnet.com/rss/cnet/all.rdf>|needs check|03/18/2026|needs verification|0|
51|Wired Japan|<https://wired.jp/feed/rss2>|needs check|03/18/2026|needs verification|0|
52|Boundless (TechCrunch Japan Archive)|<https://news.yahoo.co.jp/rss/media/boundless/all.xml>|needs check|03/18/2026|needs verification|0|
53|Smart Japan|<https://rss.itmedia.co.jp/rss/2.0/smartjapan.xml>|200|03/18/2026|valid|2|
54|Nikkei|<https://assets.nikkei.jp/release/v1/rss/news.xml>|needs check|03/18/2026|needs verification|0|
55|Nikkei - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
56|Yomiuri Latest|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
57|Yomiuri - Full Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
58|Mainichi Flash|<https://mainichi.jp/rss/etc/mainichi-flash.rss>|403 (HTTP_403)|03/18/2026|invalid|0|
59|Sankei - Google Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
60|FNN Prime - Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
61|Jiji Press - Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
62|NTV - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
63|Abema Times - Latest Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
64|Oricon - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
65|Sponichi - Recent Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
66|Chunichi - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
67|TBS News DIG - Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
68|Tokyo Sports - Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
69|Gizmodo Japan|<https://www.gizmodo.jp/index.xml>|200|03/18/2026|valid|38|
70|PR TIMES - Business/Economy|<https://prtimes.jp/business.rdf>|needs check|03/18/2026|needs verification|0|
71|PR TIMES - Technology|<https://prtimes.jp/technology.rdf>|needs check|03/18/2026|needs verification|0|
72|Goo News (Business)|<https://news.goo.ne.jp/rss/topstories/business/index.rdf>|200 (HTML_RETURNED)|03/18/2026|invalid|0|
73|Goo News (Politics)|<https://news.goo.ne.jp/rss/topstories/politics/index.rdf>|200 (HTML_RETURNED)|03/18/2026|invalid|0|
74|Newsweek Japan|<https://www.newsweekjapan.jp/headlines.rss>|needs check|03/18/2026|needs verification|0|
75|JBpress (Japan Business Press)|<https://jbpress.ismedia.jp/list/feed/rss>|200|03/18/2026|valid|21|
76|TechCrunch Japan|<https://jp.techcrunch.com/feed/>|needs check|03/18/2026|needs verification|0|
77|President Online (Business)|<https://president.jp/list/feed/rss>|needs check|03/18/2026|needs verification|0|
78|Zenn (Tech)|<https://zenn.dev/feed>|200|03/18/2026|valid|8|
79|NHK News (Politics - Category 1)|<https://www.nhk.or.jp/rss/news/cat1.xml>|200|03/18/2026|valid|21|
80|NHK News (Economy/Business - Category 3)|<https://www.nhk.or.jp/rss/news/cat3.xml>|200|03/18/2026|valid|4|
81|Nikkan Kogyo (Industrial Manufacturing News)|<https://www.nikkan.co.jp/rss/news>|needs check|03/18/2026|needs verification|0|
82|Livedoor News (General Top Stories)|<https://news.livedoor.com/topics/rss/top.xml>|200|03/18/2026|valid|106|
83|Livedoor News (Economy)|<https://news.livedoor.com/topics/rss/eco.xml>|200|03/18/2026|valid|17|
84|GIGAZINE (Tech)|<https://gigazine.net/news/rss_2.0/>|200|03/18/2026|valid|1|
85|Qiita (Japanese IT Trends)|<https://qiita.com/popular-items/feed>|200|03/18/2026|valid|10|
86|Minkabu (Stocks/Investing)|<https://minkabu.jp/news/feed>|needs check|03/18/2026|needs verification|0|
87|Tokyo Shimbun General News|<https://www.tokyo-np.co.jp/rss/news>|needs check|03/18/2026|needs verification|0|
88|ASCII.jp Mac Tech|<https://ascii.jp/mac/rss.xml>|200|03/18/2026|valid|2|
89|Business Insider Japan|<https://www.businessinsider.jp/feed/index.xml>|200|03/18/2026|valid|17|
90|Hatena Bookmark Economy|<https://b.hatena.ne.jp/hotentry/economics.rss>|needs check|03/18/2026|needs verification|0|
91|Hatena Bookmark IT|<https://b.hatena.ne.jp/hotentry/it.rss>|needs check|03/18/2026|needs verification|0|
92|Hatena Bookmark Social|<https://b.hatena.ne.jp/hotentry/social.rss>|needs check|03/18/2026|needs verification|0|
93|AFP BB News|<https://feeds.afpbb.com/afpbb/news/all>|needs check|03/18/2026|needs verification|0|

### Germany (DE)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Handelsblatt - Top|<https://www.handelsblatt.com/contentexport/feed/top-themen>|200|03/18/2026|valid|5|
2|Handelsblatt - Finance|<https://www.handelsblatt.com/contentexport/feed/finanzen>|200|03/18/2026|valid|7|
3|Tagesschau|<https://www.tagesschau.de/xml/rss2>|200|03/18/2026|valid|24|
4|Der Spiegel|<https://www.spiegel.de/schlagzeilen/tops/index.rss>|200|03/18/2026|valid|48|
5|FAZ|<https://www.faz.net/rss/aktuell/>|200|03/18/2026|valid|83|
6|Die Zeit|<https://newsfeed.zeit.de/index>|200|03/18/2026|valid|127|
7|Manager Magazin|<https://www.manager-magazin.de/unternehmen/index.rss>|200|03/18/2026|valid|9|
8|WirtschaftsWoche|<https://www.wiwo.de/contentexport/feed/rss/schlagzeilen>|200|03/18/2026|valid|49|
9|Deutsche Welle (EN)|<https://rss.dw.com/xml/rss-en-all>|200|03/18/2026|valid|11|
10|Heise Online|<https://www.heise.de/rss/heise-atom.xml>|200|03/18/2026|valid|54|
11|Der Spiegel|<https://www.spiegel.de/schlagzeilen/index.rss>|200|03/18/2026|valid|48|
12|Die Welt|<https://www.welt.de/feeds/topnews.rss>|200|03/18/2026|valid|3|
13|WELT - Latest|<https://www.welt.de/feeds/latest.rss>|200|03/18/2026|valid|31|
14|WELT - Politik|<https://www.welt.de/feeds/section/politik.rss>|200|03/18/2026|valid|1|
15|WELT - Wirtschaft|<https://www.welt.de/feeds/section/wirtschaft.rss>|200|03/18/2026|valid|0|
16|WELT - Sport|<https://www.welt.de/feeds/section/sport.rss>|200|03/18/2026|valid|0|
17|WELT - Regionales|<https://www.welt.de/feeds/section/regionales.rss>|200|03/18/2026|valid|0|
18|WELT - Wissenschaft|<https://www.welt.de/feeds/section/wissenschaft.rss>|200|03/18/2026|valid|0|
19|WELT - Vermischtes|<https://www.welt.de/feeds/section/vermischtes.rss>|200|03/18/2026|valid|0|
20|WELT - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
21|BILD - Alles|<https://www.bild.de/feed/alles.xml>|200|03/18/2026|valid|263|
22|BILD - News|<https://www.bild.de/feed/news.xml>|200|03/18/2026|valid|8|
23|BILD - Politik|<https://www.bild.de/feed/politik.xml>|200|03/18/2026|valid|0|
24|BILD - Digital|<https://www.bild.de/feed/digital.xml>|200|03/18/2026|valid|1|
25|BILD - Sport|<https://www.bild.de/feed/sport.xml>|200|03/18/2026|valid|10|
26|BILD - Unterhaltung|<https://www.bild.de/feed/unterhaltung.xml>|200|03/18/2026|valid|0|
27|BILD - Regional Chemnitz|<https://www.bild.de/feed/regional-chemnitz.xml>|200|03/18/2026|valid|0|
28|BILD - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
29|Focus|<https://www.focus.de/rss/>|200|03/18/2026|valid|186|
30|Handelsblatt Economy|<https://www.handelsblatt.com/contentexport/feed/finanzen/>|200|03/18/2026|valid|0|
31|Frankfurter Allgemeine|<https://www.faz.net/rss/aktuell/wirtschaft/>|200|03/18/2026|valid|7|
32|Tagesspiegel|<https://www.tagesspiegel.de/contentexport/feed/>|200|03/18/2026|valid|106|
33|Handelsblatt World|<https://www.handelsblatt.com/contentexport/feed/wirtschaft>|200|03/18/2026|valid|30|
34|Zeit Welt|<https://newsfeed.zeit.de/wirtschaft/index>|200|03/18/2026|valid|0|
35|Financial Times Germany|<https://www.ft.com/rss/home>|200|03/18/2026|valid|1|
36|Suddeutsche - Top-Themen|<https://rss.sueddeutsche.de/rss/Topthemen>|200|03/18/2026|valid|5|
37|Suddeutsche - Alles|<https://rss.sueddeutsche.de/rss/Alles>|200|03/18/2026|valid|76|
38|Suddeutsche - Eilmeldungen|<https://rss.sueddeutsche.de/rss/Eilmeldungen>|200|03/18/2026|valid|0|
39|Suddeutsche - Politik|<https://rss.sueddeutsche.de/rss/Politik>|200|03/18/2026|valid|1|
40|Suddeutsche - Wirtschaft|<https://rss.sueddeutsche.de/rss/Wirtschaft>|200|03/18/2026|valid|1|
41|Suddeutsche - Panorama|<https://rss.sueddeutsche.de/rss/Panorama>|200|03/18/2026|valid|1|
42|Suddeutsche - Sport|<https://rss.sueddeutsche.de/rss/Sport>|200|03/18/2026|valid|4|
43|Suddeutsche - Munchen|<https://rss.sueddeutsche.de/rss/Muenchen>|200|03/18/2026|valid|5|
44|Suddeutsche - Bayern|<https://rss.sueddeutsche.de/rss/Bayern>|200|03/18/2026|valid|3|
45|Suddeutsche - Kultur|<https://rss.sueddeutsche.de/rss/Kultur>|200|03/18/2026|valid|3|
46|Suddeutsche - Medien|<https://rss.sueddeutsche.de/rss/Medien>|200|03/18/2026|valid|0|
47|Suddeutsche - Wissen|<https://rss.sueddeutsche.de/rss/Wissen>|200|03/18/2026|valid|0|
48|Suddeutsche - Gesundheit|<https://rss.sueddeutsche.de/rss/Gesundheit>|200|03/18/2026|valid|0|
49|Suddeutsche - Karriere|<https://rss.sueddeutsche.de/rss/Karriere>|200|03/18/2026|valid|0|
50|Suddeutsche - Bildung|<https://rss.sueddeutsche.de/rss/Bildung>|200|03/18/2026|valid|0|
51|Suddeutsche - Reise|<https://rss.sueddeutsche.de/rss/Reise>|200|03/18/2026|valid|1|
52|Suddeutsche - Auto|<https://rss.sueddeutsche.de/rss/Auto>|200|03/18/2026|valid|0|
53|Suddeutsche - Stil|<https://rss.sueddeutsche.de/rss/Stil>|200|03/18/2026|valid|0|
54|Deutschlandfunk - Nachrichten|<https://www.deutschlandfunk.de/nachrichten-100.rss>|200|03/18/2026|valid|54|
55|Deutschlandfunk - Politikportal|<https://www.deutschlandfunk.de/politikportal-100.rss>|200|03/18/2026|valid|2|
56|Deutschlandfunk - Wirtschaft|<https://www.deutschlandfunk.de/wirtschaft-106.rss>|200|03/18/2026|valid|0|
57|Deutschlandfunk - Wissen|<https://www.deutschlandfunk.de/wissen-106.rss>|200|03/18/2026|valid|1|
58|Deutschlandfunk - Kulturportal|<https://www.deutschlandfunk.de/kulturportal-100.rss>|200|03/18/2026|valid|0|
59|Deutschlandfunk - Europa|<https://www.deutschlandfunk.de/europa-112.rss>|200|03/18/2026|valid|1|
60|Deutschlandfunk - Gesellschaft|<https://www.deutschlandfunk.de/gesellschaft-106.rss>|200|03/18/2026|valid|1|
61|Deutschlandfunk - Sportportal|<https://www.deutschlandfunk.de/sportportal-100.rss>|200|03/18/2026|valid|0|
62|taz.de (gesamt)|<https://taz.de/!a=;rss/>|needs check|03/18/2026|needs verification|0|
63|Tagesschau|<https://www.tagesschau.de/xml/rss2/>|200|03/18/2026|valid|24|
64|Der Spiegel - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
65|Die Zeit - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
66|n-tv - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
67|Handelsblatt - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
68|Handelsblatt - Premium News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
69|Handelsblatt - Agentur News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
70|Tagesspiegel - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
71|Merkur - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
72|Augsburger Allgemeine - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|

### India (IN)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|The Times of India (Top Stories)|<https://timesofindia.indiatimes.com/rssfeedstopstories.cms>|200|03/18/2026|valid|1437|
2|NDTV (Latest)|<https://feeds.feedburner.com/NDTV-LatestNews>|200|03/18/2026|valid|215|
3|India Today (India)|<https://www.indiatoday.in/rss/1206578>|200|03/18/2026|valid|245|
4|The Indian Express|<https://indianexpress.com/feed>|200|03/18/2026|valid|320|
5|The Hindu (National)|<https://www.thehindu.com/news/national/?service=rss>|200|03/18/2026|valid|464|
6|Firstpost|<https://www.firstpost.com/commonfeeds/v1/mfp/rss/web-stories.xml>|403 (HTTP_403)|03/18/2026|invalid|0|
7|DNA India (India)|<https://www.dnaindia.com/feeds/india.xml>|403 (HTTP_403)|03/18/2026|invalid|0|
8|Storify News|<https://www.storifynews.com/feed>|200|03/18/2026|valid|3|
9|Amar Ujala (Breaking)|<https://www.amarujala.com/rss/breaking-news.xml>|200|03/18/2026|valid|6|
10|Odishabarta|<https://odishabarta.com/feed>|200|03/18/2026|valid|5|
11|The Times of Bengal|<https://thetimesofbengal.com/feed>|200|03/18/2026|valid|101|
12|Scroll.in|<https://feeds.feedburner.com/ScrollinArticles.rss>|200|03/18/2026|valid|16|
13|Northlines|<https://thenorthlines.com/feed>|needs check|03/18/2026|needs verification|0|
14|Chandigarh Metro|<https://chandigarhmetro.com/feed>|200|03/18/2026|valid|1|
15|Chandigarh City News|<https://feeds.feedburner.com/ChandigarhCityNews>|200|03/18/2026|valid|5|
16|The Quint|<https://prod-qt-images.s3.amazonaws.com/production/thequint/feed.xml>|200|03/18/2026|valid|13|
17|Telangana Today|<https://telanganatoday.com/feed>|200|03/18/2026|valid|96|
18|News Today (TN)|<https://newstodaynet.com/feed>|200|03/18/2026|valid|31|
19|IndiaVision|<https://www.indiavision.com/feed>|200|03/18/2026|valid|16|
20|OpIndia|<https://www.opindia.com/feed>|200|03/18/2026|valid|1|
21|OrissaPOST|<https://www.orissapost.com/feed>|200|03/18/2026|valid|44|
22|India's News.Net|<https://feeds.indiasnews.net/rss/701ee96610c884a6>|200|03/18/2026|valid|163|
23|TechGenYZ|<https://techgenyz.com/feed>|200|03/18/2026|valid|4|
24|WYM News (Blogspot)|<https://latestnewsupdate4you.blogspot.com/feeds/posts/default>|200|03/18/2026|valid|2|
25|Star of Mysore|<https://starofmysore.com/feed>|200|03/18/2026|valid|20|
26|ABP News|<https://news.abplive.com/home/feed>|200|03/18/2026|valid|115|
27|The India Bizz|<https://theindiabizz.com/feed>|200|03/18/2026|valid|0|

### United Kingdom (GB)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Financial Times - World|<https://www.ft.com/rss/world>|Recovered via sitemap|03/18/2026|valid|29|
2|Financial Times - Energy|<https://www.ft.com/rss/companies/energy>|Recovered via sitemap|03/18/2026|valid|2|
3|BBC News - Business|<https://feeds.bbci.co.uk/news/business/rss.xml>|200|03/18/2026|valid|5|
4|BBC News - World|<https://feeds.bbci.co.uk/news/world/rss.xml>|200|03/18/2026|valid|6|
5|The Guardian - World|<https://www.theguardian.com/world/rss>|200|03/18/2026|valid|38|
6|The Guardian - Business|<https://www.theguardian.com/business/rss>|200|03/18/2026|valid|3|
7|Sky News - World|<https://feeds.skynews.com/feeds/rss/world.xml>|200|03/18/2026|valid|3|
8|Sky News - Business|<https://feeds.skynews.com/feeds/rss/business.xml>|200|03/18/2026|valid|1|
9|Telegraph - Business|<https://www.telegraph.co.uk/business/rss.xml>|Recovered via sitemap|03/18/2026|valid|0|
10|City A.M. (London Finance)|<https://www.cityam.com/feed/>|200|03/18/2026|valid|43|
11|The Independent|<https://www.independent.co.uk/rss>|200|03/18/2026|valid|586|
12|Financial Times UK|<https://www.ft.com/?format=rss>|200|03/18/2026|valid|2|
13|The Telegraph UK|<https://www.telegraph.co.uk/rss.xml>|Recovered via sitemap|03/18/2026|valid|0|
14|Daily Mail|<https://www.dailymail.co.uk/home/index.rss>|200|03/18/2026|valid|576|
15|Metro UK|<https://metro.co.uk/feed/>|200|03/18/2026|valid|120|
16|The Sun|<https://www.thesun.co.uk/feed/>|200 (HTML_RETURNED)|03/18/2026|invalid|0|
17|The Sun - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
18|The Guardian UK|<https://www.theguardian.com/uk/rss>|200|03/18/2026|valid|53|
19|Sky News|<https://feeds.skynews.com/feeds/rss/uk.xml>|200|03/18/2026|valid|12|
20|Financial Times|<https://www.ft.com/rss/home>|200|03/18/2026|valid|75|
21|iNews|<https://inews.co.uk/rss>|200|03/18/2026|valid|38|
22|BBC Culture|<https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml>|200|03/18/2026|valid|6|
23|BBC News - UK|<https://feeds.bbci.co.uk/news/uk/rss.xml>|200|03/18/2026|valid|24|
24|BBC News - Politics|<https://feeds.bbci.co.uk/news/politics/rss.xml>|200|03/18/2026|valid|8|
25|BBC News - Technology|<https://feeds.bbci.co.uk/news/technology/rss.xml>|200|03/18/2026|valid|3|
26|The Guardian - Politics|<https://www.theguardian.com/politics/rss>|200|03/18/2026|valid|22|
27|The Guardian - Technology|<https://www.theguardian.com/uk/technology/rss>|200|03/18/2026|valid|2|
28|The Evening Standard|<https://www.standard.co.uk/rss>|200|03/18/2026|valid|207|
29|BBC News - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
30|Mirror - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
31|Daily Express - Google News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
32|Daily Record - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
33|Manchester Evening News - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
34|Liverpool Echo - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
35|Birmingham Live - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
36|WalesOnline - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
37|MyLondon - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
38|ExaminerLive - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
39|ChronicleLive - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|

### France (FR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|France 24|<https://www.france24.com/en/rss>|200|03/18/2026|valid|27|
2|The Local (France)|<https://feeds.thelocal.com/rss/fr>|200|03/18/2026|valid|8|
3|RFI (France)|<https://www.rfi.fr/en/france/rss>|needs check|03/18/2026|needs verification|0|
4|RFI (All / EN)|<https://www.rfi.fr/en/rss>|200|03/18/2026|valid|8|
5|Mediapart|<https://www.mediapart.fr/articles/feed>|200|03/18/2026|valid|9|
6|Le Monde diplomatique|<https://mondediplo.com/backend>|needs check|03/18/2026|needs verification|0|
7|Sud Ouest|<https://www.sudouest.fr/essentiel/rss.xml>|200|03/18/2026|valid|42|
8|L'Est Republicain|<https://www.estrepublicain.fr/rss>|200|03/18/2026|valid|48|
9|France Soir|<https://www.francesoir.fr/rss.xml>|needs check|03/18/2026|needs verification|0|
10|Dernieres Nouvelles d'Alsace (DNA)|<https://www.dna.fr/rss>|200|03/18/2026|valid|27|
11|La Croix|<https://www.la-croix.com/feeds/rss/site.xml>|200|03/18/2026|valid|42|
12|La Depeche|<https://www.ladepeche.fr/rss.xml>|200|03/18/2026|valid|61|
13|20 Minutes|<https://www.20minutes.fr/feeds/rss-une.xml>|200|03/18/2026|valid|25|
14|Yahoo Actualites|<https://fr.news.yahoo.com/rss>|200|03/18/2026|valid|68|
15|InfoMigrants (EN)|<https://www.infomigrants.net/en/rss/all.xml>|needs check|03/18/2026|needs verification|0|
16|France Today|<https://www.francetoday.com/feed>|200|03/18/2026|valid|1|
17|FrenchDailyNews|<https://frenchdailynews.com/feed>|200|03/18/2026|valid|0|
18|Le Monde (EN  Main)|<https://www.lemonde.fr/en/rss/une.xml>|200|03/18/2026|valid|3|
19|Le Monde (EN  International)|<https://www.lemonde.fr/en/international/rss_full.xml>|200|03/18/2026|valid|5|
20|Le Monde (EN  Editorials)|<https://www.lemonde.fr/en/editorials/rss_full.xml>|200|03/18/2026|valid|0|
21|Le Monde (EN  Europe)|<https://www.lemonde.fr/en/europe/rss_full.xml>|200|03/18/2026|valid|1|
22|Le Monde (EN  United States)|<https://www.lemonde.fr/en/united-states/rss_full.xml>|200|03/18/2026|valid|0|
23|Le Monde (EN  Economy)|<https://www.lemonde.fr/en/economy/rss_full.xml>|200|03/18/2026|valid|2|
24|Le Monde (EN  Culture)|<https://www.lemonde.fr/en/culture/rss_full.xml>|200|03/18/2026|valid|1|
25|Le Monde (EN  Sports)|<https://www.lemonde.fr/en/sports/rss_full.xml>|200|03/18/2026|valid|0|
26|Le Monde (EN  Environment)|<https://www.lemonde.fr/en/environment/rss_full.xml>|200|03/18/2026|valid|1|
27|Le Monde (EN  Science)|<https://www.lemonde.fr/en/science/rss_full.xml>|needs check|03/18/2026|needs verification|0|
28|Les Echos (Finance/Markets)|<https://services.lesechos.fr/api/rss/univers/finance-marches>|needs check|03/18/2026|needs verification|0|
29|Les Echos (Tech/Media)|<https://services.lesechos.fr/api/rss/univers/tech-medias>|needs check|03/18/2026|needs verification|0|
30|Le Monde (Economy)|<https://www.lemonde.fr/economie/rss_full.xml>|200|03/18/2026|valid|3|
31|Le Monde (Politics)|<https://www.lemonde.fr/politique/rss_full.xml>|200|03/18/2026|valid|0|
32|Le Figaro (Top Stories)|<https://www.lefigaro.fr/rss/figaro_actualites.xml>|200|03/18/2026|valid|9|
33|Le Figaro (Economy)|<https://www.lefigaro.fr/rss/figaro_economie.xml>|200|03/18/2026|valid|12|
34|Le Figaro - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
35|Le Figaro (Flash Actu)|<https://www.lefigaro.fr/rss/figaro_flash-actu.xml>|200|03/18/2026|valid|69|
36|Le Figaro (France)|<https://www.lefigaro.fr/rss/figaro_actualite-france.xml>|200|03/18/2026|valid|5|
37|Le Figaro (International)|<https://www.lefigaro.fr/rss/figaro_international.xml>|200|03/18/2026|valid|4|
38|Le Figaro (Politics)|<https://www.lefigaro.fr/rss/figaro_politique.xml>|200|03/18/2026|valid|5|
39|Le Figaro (Flash Eco)|<https://www.lefigaro.fr/rss/figaro_flash-eco.xml>|200|03/18/2026|valid|13|
40|Le Figaro (Society)|<https://www.lefigaro.fr/rss/figaro_societes.xml>|200|03/18/2026|valid|0|
41|Le Figaro (Sport)|<https://www.lefigaro.fr/rss/figaro_sport.xml>|200|03/18/2026|valid|17|
42|Le Figaro (Science)|<https://www.lefigaro.fr/rss/figaro_sciences.xml>|200|03/18/2026|valid|2|
43|La Tribune (Economy)|<https://www.latribune.fr/feed.xml>|needs check|03/18/2026|needs verification|0|
44|Liberation (Society/Politics)|<https://www.liberation.fr/rss/>|needs check|03/18/2026|needs verification|0|
45|L'Express (Current Affairs Magazine)|<https://www.lexpress.fr/arc/outboundfeeds/rss/>|needs check|03/18/2026|needs verification|0|
46|Le Point (Current Affairs/Economy)|<https://www.lepoint.fr/rss.xml>|needs check|03/18/2026|needs verification|0|
47|France Info (Economy)|<https://www.francetvinfo.fr/economie.rss>|200|03/18/2026|valid|14|
48|France Info (Politics)|<https://www.francetvinfo.fr/politique.rss>|200|03/18/2026|valid|8|
49|BFM TV (Economy/Business)|<https://www.bfmtv.com/rss/economie/>|200|03/18/2026|valid|78|
50|Capital.fr (Economy/Capital)|<https://www.capital.fr/rss.xml>|needs check|03/18/2026|needs verification|0|
51|Challenges.fr (Business)|<https://www.challenges.fr/rss.xml>|200|03/18/2026|valid|15|
52|Ouest-France (Regional News/Society)|<https://www.ouest-france.fr/rss-en-continu.xml>|200|03/18/2026|valid|105|
53|20 Minutes (Economy Breaking)|<https://www.20minutes.fr/feeds/rss-economie.xml>|200|03/18/2026|valid|3|
54|L'Obs (General Current Affairs)|<https://www.nouvelobs.com/rss.xml>|200|03/18/2026|valid|27|
55|Usine Nouvelle (Industry/Energy/Manufacturing)|<https://www.usinenouvelle.com/rss/>|needs check|03/18/2026|needs verification|0|
56|Midi Libre|<https://www.midilibre.fr/rss.xml>|200|03/18/2026|valid|36|
57|Nice-Matin|<https://www.nicematin.com/rss>|200|03/18/2026|valid|82|
58|CNEWS|<https://www.cnews.fr/rss.xml>|200|03/18/2026|valid|38|
59|RFI (FR)|<https://www.rfi.fr/fr/rss>|200|03/18/2026|valid|22|
60|France 24 (FR)|<https://www.france24.com/fr/rss>|200|03/18/2026|valid|30|
61|Euronews FR|<https://fr.euronews.com/rss>|200|03/18/2026|valid|20|
62|Numerama|<https://www.numerama.com/feed/>|200|03/18/2026|valid|23|
63|Clubic|<https://www.clubic.com/feed/news.rss>|200|03/18/2026|valid|23|
64|01Net|<https://www.01net.com/rss/actualites/>|200|03/18/2026|valid|16|
65|Presse Citron|<https://www.presse-citron.net/feed/>|200|03/18/2026|valid|17|
66|Journal du Geek|<https://www.journaldugeek.com/feed/>|200|03/18/2026|valid|29|
67|Le Progres|<https://www.leprogres.fr/rss>|200|03/18/2026|valid|59|
68|BFM TV|<https://www.bfmtv.com/rss/news-24-7/>|200|03/18/2026|valid|224|
69|France Info|<https://www.francetvinfo.fr/titres.rss>|200|03/18/2026|valid|39|
70|Le Telegramme|<https://www.letelegramme.fr/rss.xml>|200|03/18/2026|valid|12|
71|Siecle Digital|<https://siecledigital.fr/feed/>|200|03/18/2026|valid|0|
72|Le Monde|<https://www.lemonde.fr/rss/une.xml>|200|03/18/2026|valid|7|
73|Le Dauphine Libere|<https://www.ledauphine.com/rss>|200|03/18/2026|valid|80|
74|Mediacites|<https://www.mediacites.fr/feed/>|200|03/18/2026|valid|5|
75|StreetPress|<https://www.streetpress.com/rss.xml>|200|03/18/2026|valid|1|
76|Disclose|<https://disclose.ngo/feed/>|200|03/18/2026|valid|1|
77|Le Monde - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
78|Liberation - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
79|Le Point - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
80|BFM TV - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
81|France Info - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
82|TF1 Info - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
83|20 Minutes - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
84|CNEWS - Google News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
85|Le Telegramme - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|

### Italy (IT)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|ANSA (Main)|<https://www.ansa.it/sito/ansait_rss.xml>|200|03/18/2026|valid|26|
2|ANSA (Top News)|<https://www.ansa.it/sito/notizie/topnews/topnews_rss.xml>|200|03/18/2026|valid|38|
3|ANSA (Cronaca)|<https://www.ansa.it/sito/notizie/cronaca/cronaca_rss.xml>|200|03/18/2026|valid|63|
4|ANSA (Politica)|<https://www.ansa.it/sito/notizie/politica/politica_rss.xml>|200|03/18/2026|valid|15|
5|ANSA (Mondo)|<https://www.ansa.it/sito/notizie/mondo/mondo_rss.xml>|200|03/18/2026|valid|19|
6|ANSA (Economia)|<https://www.ansa.it/sito/notizie/economia/economia_rss.xml>|200|03/18/2026|valid|39|
7|ANSA (Calcio)|<https://www.ansa.it/sito/notizie/sport/calcio/calcio_rss.xml>|200|03/18/2026|valid|29|
8|ANSA (Sport)|<https://www.ansa.it/sito/notizie/sport/sport_rss.xml>|200|03/18/2026|valid|13|
9|ANSA (Cinema)|<https://www.ansa.it/sito/notizie/cultura/cinema/cinema_rss.xml>|200|03/18/2026|valid|10|
10|ANSA (Cultura e Tendenze)|<https://www.ansa.it/sito/notizie/cultura/cultura_rss.xml>|200|03/18/2026|valid|51|
11|ANSA (Foto)|<https://www.ansa.it/sito/photogallery/foto_rss.xml>|200|03/18/2026|valid|7|
12|ANSA (Video)|<https://www.ansa.it/sito/videogallery/video_rss.xml>|200|03/18/2026|valid|29|
13|Corriere della Sera (Homepage)|<https://www.corriere.it/rss/homepage.xml>|200|03/18/2026|valid|0|
14|Corriere della Sera (Ultimora)|<https://www.corriere.it/rss/ultimora.xml>|needs check|03/18/2026|needs verification|0|
15|Corriere della Sera (feed-hp Homepage)|<https://www.corriere.it/feed-hp/homepage.xml>|200|03/18/2026|valid|102|
16|la Repubblica|<https://www.repubblica.it/rss/homepage/rss2.0.xml>|200|03/18/2026|valid|23|
17|La Stampa|<https://www.lastampa.it/rss/copertina.xml>|200|03/18/2026|valid|13|
18|Il Sole 24 Ore (Italia)|<https://www.ilsole24ore.com/rss/italia.xml>|200|03/18/2026|valid|10|
19|Il Fatto Quotidiano|<https://www.ilfattoquotidiano.it/feed/>|200|03/18/2026|valid|106|
20|La Gazzetta dello Sport|<https://www.gazzetta.it/rss/home.xml>|200|03/18/2026|valid|0|
21|IL Tempo|<https://www.iltempo.it/rss.xml>|200|03/18/2026|valid|114|
22|Libero Quotidiano|<https://www.liberoquotidiano.it/rss.xml>|200|03/18/2026|valid|116|
23|MilanoToday|<https://www.milanotoday.it/rss>|200|03/18/2026|valid|0|
24|The Florentine|<https://www.theflorentine.net/feed>|needs check|03/18/2026|needs verification|0|
25|Wanted in Rome|<https://www.wantedinrome.com/news?format=rss>|200|03/18/2026|valid|6|
26|Florence Daily News|<https://florencedailynews.com/feed>|200|03/18/2026|valid|1|
27|Alto Adige (Cronaca)|<https://www.altoadige.it/feed-rss/cronaca-1.169>|200|03/18/2026|valid|2|
28|Italia a Tavola|<https://rss.italiaatavola.net/feed.xml>|200|03/18/2026|valid|27|
29|la Citta di Salerno|<https://www.lacittadisalerno.it/feed>|200|03/18/2026|valid|18|
30|Notizie Geopolitiche|<https://www.notiziegeopolitiche.net/feed>|200|03/18/2026|valid|9|
31|la Repubblica - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
32|La Stampa - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
33|Il Messaggero - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
34|Il Sole 24 Ore - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
35|ANSA - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
36|Corriere della Sera - Interni Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
37|Corriere della Sera - Esteri Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
38|Corriere della Sera - Politica Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
39|Corriere della Sera - Economia Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
40|RaiNews - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
41|TgCom24 - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
42|Adnkronos - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
43|AGI - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
44|Quotidiano.net - Day Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|

### Canada (CA)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Global News|<https://globalnews.ca/feed>|200|03/18/2026|valid|16|
2|rabble.ca|<https://rabble.ca/feed>|200|03/18/2026|valid|3|
3|National Post|<https://nationalpost.com/feed>|503 (HTTP_503)|03/18/2026|invalid|23|
4|Toronto Sun|<https://torontosun.com/feed>|503 (HTTP_503)|03/18/2026|invalid|51|
5|Financial Post|<https://feeds.feedburner.com/FP_TopStories>|200|03/18/2026|valid|1|
6|CityNews Toronto|<https://toronto.citynews.ca/feed>|200|03/18/2026|valid|19|
7|Calgary Herald|<https://calgaryherald.com/feed>|502 (HTTP_502)|03/18/2026|invalid|21|
8|Edmonton Journal|<https://edmontonjournal.com/feed>|502 (HTTP_502)|03/18/2026|invalid|14|
9|Windsor Star|<https://windsorstar.com/feed>|502 (HTTP_502)|03/18/2026|invalid|6|
10|The Province|<https://theprovince.com/feed>|503 (HTTP_503)|03/18/2026|invalid|2|
11|Calgary Sun|<https://calgarysun.com/feed>|502 (HTTP_502)|03/18/2026|invalid|0|
12|Ottawa Sun|<https://ottawasun.com/feed>|503 (HTTP_503)|03/18/2026|invalid|1|
13|The Tyee|<https://thetyee.ca/rss2.xml>|200|03/18/2026|valid|3|
14|The StarPhoenix|<https://thestarphoenix.com/feed>|502 (HTTP_502)|03/18/2026|invalid|5|
15|Edmonton Sun|<https://edmontonsun.com/feed>|502 (HTTP_502)|03/18/2026|invalid|1|
16|Canada.com|<https://o.canada.com/feed>|502 (HTTP_502)|03/18/2026|invalid|0|
17|Business In Vancouver (BIV)|<https://biv.com/rss>|200|03/18/2026|valid|13|
18|Regina Leader Post|<https://leaderpost.com/feed>|200|03/18/2026|valid|1|
19|Owen Sound Sun Times|<https://owensoundsuntimes.com/feed>|ERR (TIMEOUT)|03/18/2026|invalid|2|
20|Stratford Beacon Herald|<https://stratfordbeaconherald.com/feed>|502 (HTTP_502)|03/18/2026|invalid|0|
21|The Georgia Straight|<https://straight.com/content/rss>|200|03/18/2026|valid|0|
22|Grande Prairie Daily Herald Tribune|<https://dailyheraldtribune.com/feed>|200|03/18/2026|valid|0|
23|YGK News (Kingston)|<https://ygknews.ca/feed>|200|03/18/2026|valid|0|
24|Prince Albert Daily Herald|<https://paherald.sk.ca/feed>|200|03/18/2026|valid|14|
25|Sunny South News|<https://sunnysouthnews.com/feed>|200|03/18/2026|valid|0|
26|The Afro News|<https://theafronews.com/feed>|200|03/18/2026|valid|0|
27|CTV News - Top Stories|<https://www.ctvnews.ca/rss/ctvnews-ca-top-stories-public-rss-1.822009>|needs check|03/18/2026|needs verification|0|
28|CTV News - Business|<https://www.ctvnews.ca/rss/business/ctvnews-ca-business-public-rss-1.822283>|Recovered via sitemap|03/18/2026|valid|0|
29|Global News - Politics|<https://globalnews.ca/politics/feed/>|200|03/18/2026|valid|0|
30|Toronto Star - Politics|<https://www.thestar.com/search/?f=rss&t=article&c=politics&l=50&s=start_time&sd=desc>|200|03/18/2026|valid|16|
31|BNN Bloomberg (Canada Biz)|<https://www.bnnbloomberg.ca/business/rss>|needs check|03/18/2026|needs verification|0|
32|CBC News - Business|<https://www.cbc.ca/cmlink/rss-business>|200|03/18/2026|valid|2|
33|CBC News - World|<https://www.cbc.ca/cmlink/rss-world>|200|03/18/2026|valid|4|
34|Financial Post (Economy)|<https://financialpost.com/feed>|ERR (TIMEOUT)|03/18/2026|invalid|85|
35|CBC News - Top Stories|<https://www.cbc.ca/cmlink/rss-topstories>|200|03/18/2026|valid|11|
36|CBC News - Canada|<https://www.cbc.ca/cmlink/rss-canada>|200|03/18/2026|valid|13|
37|CBC News - Politics|<https://www.cbc.ca/cmlink/rss-politics>|200|03/18/2026|valid|2|
38|The Globe and Mail - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
39|CTV News - Sitemap News Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
40|La Presse - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
41|CP24 - Sitemap News Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
42|National Post - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
43|Global News - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
44|Toronto Star - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
45|CP24 - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|

### Russia (RU)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|RT|<https://rt.com/feed>|200|03/18/2026|valid|12|
2|The Bell|<https://thebell.io/feed>|200|03/18/2026|valid|11|
3|Interfax|<https://www.interfax.ru/rss.asp>|200|03/18/2026|valid|204|
4|RT Economy|<https://www.rt.com/rss/business>|200|03/18/2026|valid|0|
5|The Bell|<https://thebell.io/feed/>|200|03/18/2026|valid|11|
6|Lenta|<https://lenta.ru/rss/news>|200|03/18/2026|valid|622|
7|TASS Finance|<https://tass.com/rss/v2.xml>|200|03/18/2026|valid|61|
8|RT News|<https://www.rt.com/rss/>|200|03/18/2026|valid|0|
9|Kommersant ()|<https://www.kommersant.ru/RSS/main.xml>|200|03/18/2026|valid|43|
10|The Moscow Times|<https://www.themoscowtimes.com/rss/news>|200|03/18/2026|valid|7|
11|PravdaReport|<https://www.pravdareport.com/export.xml>|200|03/18/2026|valid|10|
12|Meduza (all)|<https://meduza.io/rss2/all>|200|03/18/2026|valid|46|
13|Habr (all)|<https://habr.com/ru/rss/all/all/?fl=ru>|200|03/18/2026|valid|119|
14|RIA Novosti (Russian State Broadcaster)|<https://ria.ru/export/rss2/archive/index.xml>|200|03/18/2026|valid|842|
15|TASS (TASS Russian Main)|<https://tass.ru/rss/v2.xml>|200|03/18/2026|valid|1129|
16|RBC (Russian Finance/Economy #1)|<https://rssexport.rbc.ru/rbcnews/news/30/full.rss>|200|03/18/2026|valid|233|
17|Kommersant (Economy/Business Major Daily)|<https://www.kommersant.ru/RSS/news.xml>|200|03/18/2026|valid|209|
18|Vedomosti (Economy Major Daily)|<https://www.vedomosti.ru/rss/news>|200|03/18/2026|valid|112|
19|Gazeta.ru (General News)|<https://www.gazeta.ru/export/rss/lenta.xml>|needs check|03/18/2026|needs verification|0|
20|Izvestia (Traditional Daily)|<https://iz.ru/xml/rss/all.xml>|200|03/18/2026|valid|515|
21|RT Russian (RT Russian Main)|<https://russian.rt.com/rss>|200|03/18/2026|valid|435|
22|Rossiyskaya Gazeta (Official Gazette)|<https://rg.ru/xml/index.xml>|200|03/18/2026|valid|542|
23|Forbes Russia (Forbes Russia Edition)|<https://www.forbes.ru/newrss.xml>|200|03/18/2026|valid|55|
24|BFM.ru (Business Radio)|<https://www.bfm.ru/news.rss>|200|03/18/2026|valid|91|
25|Expert.ru (Economy Magazine)|<https://www.expert.ru/rss/>|Recovered via sitemap|03/18/2026|valid|0|
26|Finmarket.ru (Finance/Investment)|<http://www.finmarket.ru/rss/mainnews.asp>|200|03/18/2026|valid|6|
27|NTV (major broadcaster)|<https://www.ntv.ru/exp/news_rss.jsp>|needs check|03/18/2026|needs verification|0|
28|Komsomolskaya Pravda (Mass outlet #1)|<https://www.kp.ru/rss/all.xml>|needs check|03/18/2026|needs verification|0|
29|Moskovsky Komsomolets (Mass outlet #2)|<https://www.mk.ru/rss/news/index.xml>|needs check|03/18/2026|needs verification|0|
30|Rambler News (Portal News)|<https://news.rambler.ru/rss/>|needs check|03/18/2026|needs verification|0|

### South Korea (KR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Yonhap (EN)|<https://en.yna.co.kr/RSS/news.xml>|200|03/18/2026|valid|383|
2|Donga Ilbo|<https://rss.donga.com/total.xml>|ERR (NETWORK)|03/18/2026|invalid|419|
3|Seoul Newspaper|<https://www.seoul.co.kr/xml/rss/rss_top.xml>|200|03/18/2026|valid|121|
4|Newsis|<https://www.newsis.com/RSS/sokbo.xml>|200|03/18/2026|valid|1251|
5|Aju News|<https://rss.ajunews.com/sokbo.xml>|200|03/18/2026|valid|362|
6|KED Global (Korea Economic Daily)|<https://www.kedglobal.com/newsRss>|needs check|03/18/2026|needs verification|0|
7|Daily NK (EN)|<https://www.dailynk.com/english/feed>|200|03/18/2026|valid|5|
8|Korea Times (RSS directory)|<https://feed.koreatimes.co.kr/k/allnews.xml>|200|03/18/2026|valid|103|
9|Korea Herald (RSS directory)|<https://www.koreaherald.com/rss/newsAll>|200|03/18/2026|valid|61|
10|KBS World Radio (RSS directory)|<http://world.kbs.co.kr/rss/rss_news.htm?lang=e>|needs check|03/18/2026|needs verification|0|
11|hankyung.com|<https://www.hankyung.com/feed/all-news>|200|03/18/2026|valid|207|
12|hankyung.com|<https://www.hankyung.com/feed/finance>|200|03/18/2026|valid|14|
13|hankyung.com|<https://www.hankyung.com/feed/economy>|200|03/18/2026|valid|68|
14|hankyung.com|<https://www.hankyung.com/feed/realestate>|200|03/18/2026|valid|22|
15|IT|<https://www.hankyung.com/feed/it>|200|03/18/2026|valid|36|
16|hankyung.com|<https://www.hankyung.com/feed/politics>|200|03/18/2026|valid|9|
17|hankyung.com|<https://www.hankyung.com/feed/international>|200|03/18/2026|valid|38|
18|mk.co.kr|<https://www.mk.co.kr/rss/30000001/>|200|03/18/2026|valid|122|
19|mk.co.kr|<https://www.mk.co.kr/rss/40300001/>|200|03/18/2026|valid|377|
20|mk.co.kr|<https://www.mk.co.kr/rss/30100041/>|200|03/18/2026|valid|40|
21|mk.co.kr|<https://www.mk.co.kr/rss/30200030/>|200|03/18/2026|valid|0|
22|mk.co.kr|<https://www.mk.co.kr/rss/50400012/>|200|03/18/2026|valid|78|
23|SBS|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=01&plink=RSSREADER>|200|03/18/2026|valid|47|
24|SBS|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=02&plink=RSSREADER>|200|03/18/2026|valid|44|
25|SBS|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=03&plink=RSSREADER>|200|03/18/2026|valid|103|
26|SBS|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=07&plink=RSSREADER>|200|03/18/2026|valid|96|
27|SBS|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=08&plink=RSSREADER>|200|03/18/2026|valid|8|
28|SBS|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=14&plink=RSSREADER>|200|03/18/2026|valid|28|
29|SBS|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=09&plink=RSSREADER>|200|03/18/2026|valid|37|
30|hani.co.kr|<https://www.hani.co.kr/rss/international/>|200|03/18/2026|valid|0|
31|hani.co.kr|<https://www.hani.co.kr/rss/culture/>|200|03/18/2026|valid|0|
32|hani.co.kr|<https://www.hani.co.kr/rss/sports/>|200|03/18/2026|valid|0|
33|hanion.co.kr|<https://www.hanion.co.kr/rss/S1N1.xml>|200|03/18/2026|valid|2|
34|hanion.co.kr|<https://www.hanion.co.kr/rss/S1N2.xml>|200|03/18/2026|valid|1|
35|hanion.co.kr|<https://www.hanion.co.kr/rss/S1N3.xml>|200|03/18/2026|valid|3|
36|khan.co.kr|<https://www.khan.co.kr/rss/rssdata/total_news.xml>|200|03/18/2026|valid|283|
37|MBC|<https://imnews.imbc.com/rss/google_news/narrativeNews.rss>|needs check|03/18/2026|needs verification|0|
38|chosun.com|<https://www.chosun.com/arc/outboundfeeds/rss/?outputType=xml>|200|03/18/2026|valid|1609|

### Brazil (BR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|G1 (Globo - Economy)|<https://g1.globo.com/rss/g1/economia/>|200|03/18/2026|valid|25|
2|G1 (Globo - Tech)|<https://g1.globo.com/rss/g1/tecnologia/>|200|03/18/2026|valid|0|
3|Folha de S.Paulo - Top|<https://feeds.folha.uol.com.br/emcimadahora/rss091.xml>|200|03/18/2026|valid|211|
4|Folha de S.Paulo - Market|<https://feeds.folha.uol.com.br/mercado/rss091.xml>|200|03/18/2026|valid|48|
5|Correio Braziliense|<https://www.correiobraziliense.com.br/rss/noticia/economia/rss.xml>|200|03/18/2026|valid|5|
6|InfoMoney|<https://www.infomoney.com.br/feed/>|200|03/18/2026|valid|114|
7|Canaltech|<https://canaltech.com.br/rss/>|200|03/18/2026|valid|54|
8|Forbes Brazil|<https://forbes.com.br/feed/>|200|03/18/2026|valid|28|
9|Estado de Minas|<https://www.em.com.br/feed/>|needs check|03/18/2026|needs verification|0|
10|Veja|<https://veja.abril.com.br/feed/>|200|03/18/2026|valid|153|
11|Folha - Poder|<https://feeds.folha.uol.com.br/poder/rss091.xml>|200|03/18/2026|valid|23|
12|Folha - Mundo|<https://feeds.folha.uol.com.br/mundo/rss091.xml>|200|03/18/2026|valid|10|
13|Folha - Cotidiano|<https://feeds.folha.uol.com.br/cotidiano/rss091.xml>|200|03/18/2026|valid|43|
14|Folha - Esporte|<https://feeds.folha.uol.com.br/esporte/rss091.xml>|200|03/18/2026|valid|7|
15|Folha - Ilustrada|<https://feeds.folha.uol.com.br/ilustrada/rss091.xml>|200|03/18/2026|valid|24|
16|Agencia Publica|<https://apublica.org/feed/>|200|03/18/2026|valid|2|
17|Nexo Jornal|<https://www.nexojornal.com.br/rss.xml>|200|03/18/2026|valid|7|
18|Jornal GGN|<https://jornalggn.com.br/feed/>|needs check|03/18/2026|needs verification|0|
19|Jacobin Brasil|<https://jacobin.com.br/feed>|needs check|03/18/2026|needs verification|0|
20|CartaCapital|<https://www.cartacapital.com.br/feed>|200|03/18/2026|valid|71|
21|G1 Globo (General Top Portal)|<https://g1.globo.com/rss/g1/>|200|03/18/2026|valid|711|
22|G1 Politica (Politics)|<https://g1.globo.com/rss/g1/politica/>|200|03/18/2026|valid|1|
23|UOL Noticias (Breaking and Top Stories)|<https://rss.uol.com.br/feed/noticias.xml>|200|03/18/2026|valid|242|
24|UOL Economia (Portal Economy)|<https://rss.uol.com.br/feed/economia.xml>|200|03/18/2026|valid|30|
25|Estadao (Mainstream Daily)|<https://www.estadao.com.br/rss/ultimas>|needs check|03/18/2026|needs verification|0|
26|Exame (Business/Economy Magazine)|<https://exame.com/feed/>|200|03/18/2026|valid|116|
27|Valor Economico (Financial Daily)|<https://valor.globo.com/rss/valor>|200|03/18/2026|valid|235|
28|CNN Brasil (Business)|<https://www.cnnbrasil.com.br/business/feed/>|404 (HTTP_404)|03/18/2026|invalid|426|
29|CartaCapital (Investigative/Analysis)|<https://www.cartacapital.com.br/feed/>|200|03/18/2026|valid|0|
30|Poder360 (Politics/Policy)|<https://www.poder360.com.br/feed/>|200|03/18/2026|valid|87|
31|Correio Braziliense (Political Coverage)|<https://www.correiobraziliense.com.br/rss/noticia/politica/rss.xml>|200|03/18/2026|valid|27|

### Australia (AU)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|ABC News - Business|<https://www.abc.net.au/news/feed/51892/rss.xml>|200|03/18/2026|valid|6|
2|ABC News - World|<https://www.abc.net.au/news/feed/104217382/rss.xml>|200|03/18/2026|valid|2|
3|ABC News - Top Stories|<https://www.abc.net.au/news/feed/10719986/rss.xml>|200|03/18/2026|valid|1|
4|Sydney Morning Herald - Business|<https://www.smh.com.au/rss/business.xml>|200|03/18/2026|valid|4|
5|The Age - Business|<https://www.theage.com.au/rss/business.xml>|200|03/18/2026|valid|4|
6|The Australian - Business|<https://www.theaustralian.com.au/business/rss>|needs check|03/18/2026|needs verification|0|
7|The Guardian Australia|<https://www.theguardian.com/au/rss>|200|03/18/2026|valid|66|
8|ABC News (Top)|<https://www.abc.net.au/news/feed/1106/rss.xml>|200|03/18/2026|valid|0|
9|Australian Broadcasting Corporation - World|<https://www.abc.net.au/news/feed/51892/rss.xml?edition=world>|200|03/18/2026|valid|0|
10|The Guardian Australia|<https://www.theguardian.com/australia-news/rss>|200|03/18/2026|valid|66|
11|SBS World News|<https://www.sbs.com.au/news/topic/latest/feed>|200|03/18/2026|valid|9|
12|SBS News (Breaking)|<https://www.sbs.com.au/news/feed>|200|03/18/2026|valid|0|
13|9News|<https://www.9news.com.au/rss>|200|03/18/2026|valid|20|
14|Sydney Morning Herald|<https://www.smh.com.au/rss/feed.xml>|200|03/18/2026|valid|155|
15|The Age|<https://www.theage.com.au/rss/feed.xml>|200|03/18/2026|valid|155|
16|Canberra Times|<https://www.canberratimes.com.au/rss.xml>|200|03/18/2026|valid|15|
17|PerthNow|<https://www.perthnow.com.au/news/feed>|200|03/18/2026|valid|70|
18|The Australian|<https://www.theaustralian.com.au/business/markets/rss>|needs check|03/18/2026|needs verification|0|
19|7news|<https://7news.com.au/feed>|200|03/18/2026|valid|67|
20|RenewEconomy|<https://reneweconomy.com.au/feed/>|200|03/18/2026|valid|8|
21|Australian Mining|<https://www.australianmining.com.au/feed/>|200|03/18/2026|valid|9|
22|MacroBusiness|<https://www.macrobusiness.com.au/feed/>|200|03/18/2026|valid|11|
23|SmartCompany|<https://www.smartcompany.com.au/feed/>|200|03/18/2026|valid|4|
24|Startup Daily|<https://www.startupdaily.net/feed/>|200|03/18/2026|valid|5|
25|The Conversation AU|<https://theconversation.com/au/articles.atom>|200|03/18/2026|valid|57|
26|AFR (Financial Review)|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
27|Crikey|<https://www.crikey.com.au/feed/>|200|03/18/2026|valid|16|
28|News.com.au National Top News|<https://www.news.com.au/content-feeds/latest-news-national/>|200|03/18/2026|valid|0|
29|News.com.au Finance|<https://www.news.com.au/content-feeds/latest-news-finance/>|200|03/18/2026|valid|0|
30|ABC News Australia|<https://www.abc.net.au/news/feed/51120/rss.xml>|200|03/18/2026|valid|2|
31|News.com.au World|<https://www.news.com.au/content-feeds/latest-news-world/>|200|03/18/2026|valid|0|
32|News.com.au Technology|<https://www.news.com.au/content-feeds/latest-news-technology/>|200|03/18/2026|valid|0|
33|Sky News Australia|<https://www.skynews.com.au/australia-news/rss>|200|03/18/2026|valid|0|
34|Sky News World|<https://www.skynews.com.au/world-news/rss>|200|03/18/2026|valid|0|
35|ABC News - Politics|<https://www.abc.net.au/news/feed/45910/rss.xml>|200|03/18/2026|valid|47|
36|Sydney Morning Herald - National|<https://www.smh.com.au/rss/national.xml>|200|03/18/2026|valid|6|
37|The Age - National|<https://www.theage.com.au/rss/national.xml>|200|03/18/2026|valid|5|
38|Herald Sun|<https://www.heraldsun.com.au/rss>|200|03/18/2026|valid|0|
39|ABC News - Rural|<https://www.abc.net.au/news/feed/52498/rss.xml>|200|03/18/2026|valid|2|
40|ABC News - Science|<https://www.abc.net.au/news/feed/45914/rss.xml>|200|03/18/2026|valid|15|
41|ABC News - Politics (Topic)|<https://www.abc.net.au/news/feed/45910/rss.xml?topic=technology>|200|03/18/2026|valid|0|
42|News.com.au - Sport|<https://www.news.com.au/content-feeds/latest-news-sport/>|200|03/18/2026|valid|0|
43|SBS News - Australia|<https://www.sbs.com.au/news/topic/australia/feed>|200|03/18/2026|valid|5|
44|SBS News - World|<https://www.sbs.com.au/news/topic/world/feed>|200|03/18/2026|valid|4|
45|News.com.au - Lifestyle|<https://www.news.com.au/content-feeds/latest-news-lifestyle/>|200|03/18/2026|valid|0|
46|News.com.au - Entertainment|<https://www.news.com.au/content-feeds/latest-news-entertainment/>|200|03/18/2026|valid|0|
47|News.com.au - Travel|<https://www.news.com.au/content-feeds/latest-news-travel/>|200|03/18/2026|valid|0|
48|ABC News - Analysis|<https://www.abc.net.au/news/feed/45924/rss.xml>|200|03/18/2026|valid|7|
49|The West Australian|<https://thewest.com.au/rss>|200|03/18/2026|valid|243|
50|Courier Mail|<https://www.couriermail.com.au/rss>|200|03/18/2026|valid|0|
51|Daily Telegraph Australia|<https://www.dailytelegraph.com.au/rss>|200|03/18/2026|valid|0|
52|Geelong Advertiser|<https://www.geelongadvertiser.com.au/rss>|200|03/18/2026|valid|15|
53|News.com.au - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
54|SBS News - Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
55|SBS News - English Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
56|SBS Dateline - Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
57|Cairns Post|<https://www.cairnspost.com.au/rss>|200|03/18/2026|valid|0|
58|AdelaideNow - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
59|The Mercury - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
60|Gold Coast Bulletin - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
61|Townsville Bulletin - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
62|NT News - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
63|Geelong Advertiser - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
64|PerthNow - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
65|The West Australian - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
66|The Chronicle - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
67|Weekly Times - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
68|The Australian - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
69|Newcastle Herald|<https://www.newcastleherald.com.au/rss.xml>|200|03/18/2026|valid|19|
70|Illawarra Mercury|<https://www.illawarramercury.com.au/rss.xml>|200|03/18/2026|valid|21|
71|The Courier|<https://www.thecourier.com.au/rss.xml>|200|03/18/2026|valid|10|
72|Border Mail|<https://www.bordermail.com.au/rss.xml>|200|03/18/2026|valid|23|
73|The Advocate|<https://www.theadvocate.com.au/rss.xml>|200|03/18/2026|valid|7|
74|Daily Advertiser|<https://www.dailyadvertiser.com.au/rss.xml>|200|03/18/2026|valid|12|
75|Central Western Daily|<https://www.centralwesterndaily.com.au/rss.xml>|200|03/18/2026|valid|11|
76|The Examiner|<https://www.examiner.com.au/rss.xml>|200|03/18/2026|valid|13|
77|Bendigo Advertiser|<https://www.bendigoadvertiser.com.au/rss.xml>|200|03/18/2026|valid|4|
78|North West Star|<https://www.northweststar.com.au/rss.xml>|200|03/18/2026|valid|2|
79|Goulburn Post|<https://www.goulburnpost.com.au/rss.xml>|200|03/18/2026|valid|3|
80|The Land|<https://www.theland.com.au/rss.xml>|200|03/18/2026|valid|8|
81|Manning River Times|<https://www.manningrivertimes.com.au/rss.xml>|200|03/18/2026|valid|3|
82|Port Macquarie News|<https://www.portnews.com.au/rss.xml>|200|03/18/2026|valid|3|
83|Blue Mountains Gazette|<https://www.bluemountainsgazette.com.au/rss.xml>|200|03/18/2026|valid|3|
84|Warrnambool Standard|<https://www.standard.net.au/rss.xml>|200|03/18/2026|valid|11|

### Spain (ES)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Expansion (Financial)|<https://e00-expansion.uecdn.es/rss/empresas.xml>|200|03/18/2026|valid|30|
2|Cinco Dias (Economy)|<https://cincodias.elpais.com/arc/outboundfeeds/rss/?outputType=xml>|200|03/18/2026|valid|58|
3|El Pais - Economy|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/economia/portada>|200|03/18/2026|valid|3|
4|El Mundo - Economy|<https://e00-elmundo.uecdn.es/elmundo/rss/economia.xml>|200|03/18/2026|valid|13|
5|El Confidencial|<https://rss.elconfidencial.com/espana/>|200|03/18/2026|valid|17|
6|El Periodico|<https://www.elperiodico.com/es/rss/rss_portada.xml>|needs check|03/18/2026|needs verification|0|
7|20 Minutos|<https://www.20minutos.es/rss/>|200|03/18/2026|valid|167|
8|El Diario|<https://www.eldiario.es/rss/>|200|03/18/2026|valid|62|
9|eldiario|<https://www.eldiario.es/rss/>|200|03/18/2026|valid|0|
10|Marca|<https://www.marca.com/rss/>|needs check|03/18/2026|needs verification|0|
11|El Pais|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada>|200|03/18/2026|valid|134|
12|EL PAIS - Ultimas|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/ultimas-noticias/portada>|200|03/18/2026|valid|53|
13|EL PAIS - Internacional|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/internacional/portada>|200|03/18/2026|valid|4|
14|EL PAIS - Opinion|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/opinion/portada>|200|03/18/2026|valid|6|
15|EL PAIS - Espana|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/espana/portada>|200|03/18/2026|valid|2|
16|EL PAIS - Sociedad|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/sociedad/portada>|200|03/18/2026|valid|0|
17|EL PAIS - Ciencia|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/ciencia/portada>|200|03/18/2026|valid|0|
18|EL PAIS - Tecnologia|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/tecnologia/portada>|200|03/18/2026|valid|0|
19|EL PAIS - Cultura|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/cultura/portada>|200|03/18/2026|valid|3|
20|EL PAIS - Deportes|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/deportes/portada>|200|03/18/2026|valid|1|
21|EL PAIS - Gente|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/gente/portada>|200|03/18/2026|valid|1|
22|EL PAIS - Clima y medio ambiente|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/clima-y-medio-ambiente/portada>|200|03/18/2026|valid|0|
23|La Vanguardia - Portada|<https://www.lavanguardia.com/rss/home.xml>|200|03/18/2026|valid|79|
24|La Vanguardia - Internacional|<https://www.lavanguardia.com/rss/internacional.xml>|200|03/18/2026|valid|12|
25|La Vanguardia - Politica|<https://www.lavanguardia.com/rss/politica.xml>|200|03/18/2026|valid|26|
26|La Vanguardia - Opinion|<https://www.lavanguardia.com/rss/opinion.xml>|200|03/18/2026|valid|11|
27|La Vanguardia - Sociedad|<https://www.lavanguardia.com/rss/sociedad.xml>|200|03/18/2026|valid|0|
28|La Vanguardia - Deportes|<https://www.lavanguardia.com/rss/deportes.xml>|200|03/18/2026|valid|20|
29|El Mundo - Portada|<https://e00-elmundo.uecdn.es/rss/portada.xml>|200|03/18/2026|valid|37|
30|The Local Spain (EN)|<https://feeds.thelocal.com/rss/es>|200|03/18/2026|valid|4|
31|El Economista - Portada|<https://www.eleconomista.es/rss/rss-portada.php>|needs check|03/18/2026|needs verification|0|
32|El Economista - Mercados|<https://www.eleconomista.es/rss/rss-mercados.php>|needs check|03/18/2026|needs verification|0|
33|ABC.es - Economía|<https://www.abc.es/rss/feeds/abc_economia.xml>|200|03/18/2026|valid|1|
34|Vozpópuli|<https://www.vozpopuli.com/rss>|200|03/18/2026|valid|0|
35|El Periódico de la Energía|<https://elperiodicodelaenergia.com/feed/>|200|03/18/2026|valid|42|
36|Xataka|<https://www.xataka.com/feed>|needs check|03/18/2026|needs verification|0|
37|ABC.es|<https://www.abc.es/rss/feeds/abc_ultima.xml>|200|03/18/2026|valid|331|
38|RTVE - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
39|El Pais - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
40|La Vanguardia - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
41|El Espanol - Google News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
42|ABC.es - Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
43|OKdiario - Google News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
44|El Correo - Incremental Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
45|El Periodico - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
46|eldiario.es - Google News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|

### Mexico (MX)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Proceso (Investigative)|<https://www.proceso.com.mx/rss/feed.html>|200|03/18/2026|valid|45|
2|Expansion (Biz)|<https://expansion.mx/rss>|200|03/18/2026|valid|34|
3|Contralinea|<https://www.contralinea.com.mx/feed>|200|03/18/2026|valid|9|
4|El Financiero|<https://www.elfinanciero.com.mx/rss/mundo>|200|03/18/2026|valid|106|
5|Proceso World|<https://www.proceso.com.mx/rss/feed.html?output=xml>|200|03/18/2026|valid|0|
6|El Financiero|<https://www.elfinanciero.com.mx/rss>|200|03/18/2026|valid|106|
7|ADN40 (TV Azteca - Economy)|<https://www.adn40.mx/economia/rss>|needs check|03/18/2026|needs verification|0|
8|ADN40 (TV Azteca - Mexico)|<https://www.adn40.mx/mexico/rss>|needs check|03/18/2026|needs verification|0|
9|El Financiero (Economia)|<https://www.elfinanciero.com.mx/rss/economia>|200|03/18/2026|valid|0|
10|El Financiero (Mercados)|<https://www.elfinanciero.com.mx/rss/mercados>|200|03/18/2026|valid|0|
11|La Jornada - Economia|<https://www.jornada.com.mx/rss/economia.xml>|200|03/18/2026|valid|9|
12|Aristegui (Main)|<https://editorial.aristeguinoticias.com/feed/>|200|03/18/2026|valid|47|
13|Aristegui (Mexico)|<https://editorial.aristeguinoticias.com/category/mexico/feed/>|200|03/18/2026|valid|0|
14|Aristegui (Dinero y Economia)|<https://editorial.aristeguinoticias.com/category/dinero-y-economia/feed/>|200|03/18/2026|valid|0|
15|Aristegui (Mundo)|<https://editorial.aristeguinoticias.com/category/mundo/feed/>|200|03/18/2026|valid|0|
16|Aristegui En Vivo - Enterate|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/enterate/feed>|200|03/18/2026|valid|0|
17|Aristegui En Vivo - Programas completos|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/programas-completos/feed>|200|03/18/2026|valid|0|
18|Aristegui En Vivo - Entrevistas completas|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/entrevistas-completos/feed>|needs check|03/18/2026|needs verification|0|
19|Aristegui En Vivo - Mesa politica|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/mesa-politica-en-vivo/feed>|200|03/18/2026|valid|0|
20|Aristegui En Vivo - Investigaciones especiales|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/investigaciones-especiales/feed>|200|03/18/2026|valid|0|
21|Aristegui En Vivo - Enlaces en vivo|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/enlaces-en-vivo/feed>|200|03/18/2026|valid|0|
22|Aristegui En Vivo - Titulares del dia|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/titulares-del-dia/feed>|200|03/18/2026|valid|0|
23|Aristegui En Vivo - Deportes|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/deportes-aristegui-en-vivo/feed>|200|03/18/2026|valid|0|
24|Aristegui En Vivo - Dinero y Economia|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/dinero-y-economia/feed>|200|03/18/2026|valid|0|
25|Aristegui En Vivo - Ninonautas|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/ninonautas/feed>|200|03/18/2026|valid|0|
26|Aristegui En Vivo - Las plumas de la serpiente|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/las-plumas-de-la-serpiente/feed>|200|03/18/2026|valid|0|
27|El Economista - Top Noticias|<https://www.eleconomista.com.mx/rss/top-noticias>|needs check|03/18/2026|needs verification|0|
28|El Economista - Empresas|<https://www.eleconomista.com.mx/rss/empresas>|needs check|03/18/2026|needs verification|0|
29|El Universal - General|<https://www.eluniversal.com.mx/rss.xml>|needs check|03/18/2026|needs verification|0|
30|El Universal - Cartera|<https://www.eluniversal.com.mx/cartera/rss.xml>|needs check|03/18/2026|needs verification|0|
31|Milenio|<https://www.milenio.com/rss>|needs check|03/18/2026|needs verification|0|
32|Excelsior|<https://www.excelsior.com.mx/rss.xml>|needs check|03/18/2026|needs verification|0|
33|Forbes Mexico|<https://www.forbes.com.mx/feed/>|Recovered via sitemap|03/18/2026|valid|0|
34|Energía a Debate|<https://energiaadebate.com/feed/>|200|03/18/2026|valid|1|
35|Milenio Negocios (Business)|<https://www.milenio.com/negocios/rss>|needs check|03/18/2026|needs verification|0|
36|Aristegui Noticias (Political Investigation)|<https://aristeguinoticias.com/feed/>|needs check|03/18/2026|needs verification|0|
37|La Jornada (Progressive Daily)|<https://www.jornada.com.mx/rss/edicion.xml>|200|03/18/2026|valid|21|
38|El Sol de Mexico (Domestic Breaking)|<https://www.elsoldemexico.com.mx/rss.xml>|needs check|03/18/2026|needs verification|0|
39|Expansion Economia (Economy Specialist)|<https://expansion.mx/rss/economia>|200|03/18/2026|valid|0|
40|Expansion Empresas (Corporate News)|<https://expansion.mx/rss/empresas>|200|03/18/2026|valid|0|
41|Sopitas (Millennial Portal)|<https://www.sopitas.com/feed/>|200|03/18/2026|valid|1|
42|Animal Politico (Political Deep Coverage)|<https://www.animalpolitico.com/feed>|needs check|03/18/2026|needs verification|0|
43|Xataka Mexico (Tech/IT)|<https://www.xataka.com.mx/feed>|needs check|03/18/2026|needs verification|0|
44|Milenio - Google News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
45|Excelsior - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
46|Animal Politico - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
47|El Universal - Nacion Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
48|El Universal - Mundo Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
49|El Universal - Estados Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
50|Milenio - Articles Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
51|Excelsior - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
52|El Sol de Mexico - Update Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
53|El Universal - De Ultima Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
54|El Universal - Ciencia Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
55|El Universal - Elecciones Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
56|El Universal - Edomex Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
57|La Jornada - Politica|<https://www.jornada.com.mx/rss/politica.xml>|200|03/18/2026|valid|34|
58|La Jornada - Estados|<https://www.jornada.com.mx/rss/estados.xml>|200|03/18/2026|valid|9|
59|La Jornada - Mundo|<https://www.jornada.com.mx/rss/mundo.xml>|200|03/18/2026|valid|14|
60|La Jornada - Capital|<https://www.jornada.com.mx/rss/capital.xml>|200|03/18/2026|valid|9|
61|La Jornada - Deportes|<https://www.jornada.com.mx/rss/deportes.xml>|200|03/18/2026|valid|5|
62|El Universal - Cultura Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
63|El Universal - Techbit Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
64|El Universal - Opinion Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
65|N+MAS - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
66|UnoTV - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
67|El Heraldo de Mexico - News Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|

### Indonesia (ID)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Republika|<https://www.republika.co.id/rss>|200|03/18/2026|valid|154|
2|Sindo News|<https://www.sindonews.com/rss/home/>|200|03/18/2026|valid|118|
3|Kapanlagi|<https://www.kapanlagi.com/feed/>|200|03/18/2026|valid|86|
4|Antara TV|<https://www.antaranews.com/rss/terkini>|200|03/18/2026|valid|32|
5|Sindonews|<https://www.sindonews.com/rss/>|200|03/18/2026|valid|2|
6|Republika|<https://www.republika.co.id/rss/terkini>|needs check|03/18/2026|needs verification|154|
7|ANTARA - Terkini|<https://www.antaranews.com/rss/terkini.xml>|200|03/18/2026|valid|211|
8|ANTARA - Top News|<https://www.antaranews.com/rss/top-news.xml>|200|03/18/2026|valid|4|
9|ANTARA - Politik|<https://www.antaranews.com/rss/politik.xml>|200|03/18/2026|valid|0|
10|ANTARA - Hukum|<https://www.antaranews.com/rss/hukum.xml>|200|03/18/2026|valid|0|
11|ANTARA - Ekonomi|<https://www.antaranews.com/rss/ekonomi.xml>|200|03/18/2026|valid|0|
12|ANTARA - Ekonomi (Finansial)|<https://www.antaranews.com/rss/ekonomi-finansial.xml>|200|03/18/2026|valid|3|
13|ANTARA - Ekonomi (Bisnis)|<https://www.antaranews.com/rss/ekonomi-bisnis.xml>|ERR (TIMEOUT)|03/18/2026|invalid|56|
14|ANTARA - Ekonomi (Bursa)|<https://www.antaranews.com/rss/ekonomi-bursa.xml>|200|03/18/2026|valid|1|
15|ANTARA - Metro|<https://www.antaranews.com/rss/metro.xml>|200|03/18/2026|valid|0|
16|ANTARA - Metro (Kriminalitas)|<https://www.antaranews.com/rss/metro-kriminalitas.xml>|200|03/18/2026|valid|3|
17|ANTARA - Metro (Lintas Kota)|<https://www.antaranews.com/rss/metro-lintas-kota.xml>|200|03/18/2026|valid|26|
18|ANTARA - Metro (Lenggang Jakarta)|<https://www.antaranews.com/rss/metro-lenggang-jakarta.xml>|200|03/18/2026|valid|3|
19|ANTARA - Sepakbola|<https://www.antaranews.com/rss/sepakbola.xml>|200|03/18/2026|valid|0|
20|ANTARA - Sepakbola (Liga Indonesia)|<https://www.antaranews.com/rss/sepakbola-liga-indonesia.xml>|200|03/18/2026|valid|1|
21|ANTARA - Sepakbola (Internasional)|<https://www.antaranews.com/rss/sepakbola-internasional.xml>|ERR (TIMEOUT)|03/18/2026|invalid|1|
22|ANTARA - Sepakbola (Liga Inggris)|<https://www.antaranews.com/rss/sepakbola-liga-inggris-premier.xml>|200|03/18/2026|valid|0|
23|ANTARA - Sepakbola (Liga Spanyol)|<https://www.antaranews.com/rss/sepakbola-liga-spanyol.xml>|200|03/18/2026|valid|1|
24|ANTARA - Sepakbola (Liga Italia)|<https://www.antaranews.com/rss/sepakbola-liga-italia-seri-a.xml>|200|03/18/2026|valid|0|
25|ANTARA - Liga Champions|<https://www.antaranews.com/rss/sepakbola-liga-champions.xml>|200|03/18/2026|valid|9|
26|ANTARA - Olahraga|<https://www.antaranews.com/rss/olahraga.xml>|200|03/18/2026|valid|0|
27|ANTARA - Olahraga (Bulutangkis)|<https://www.antaranews.com/rss/olahraga-bulutangkis.xml>|200|03/18/2026|valid|2|
28|ANTARA - Olahraga (Bola Basket)|<https://www.antaranews.com/rss/olahraga-bola-basket.xml>|200|03/18/2026|valid|3|
29|ANTARA - Olahraga (Tenis)|<https://www.antaranews.com/rss/olahraga-tenis.xml>|200|03/18/2026|valid|0|
30|ANTARA - Olahraga (Balap)|<https://www.antaranews.com/rss/olahraga-balap.xml>|200|03/18/2026|valid|2|
31|ANTARA - Humaniora|<https://www.antaranews.com/rss/humaniora.xml>|200|03/18/2026|valid|0|
32|ANTARA - Lifestyle|<https://www.antaranews.com/rss/lifestyle.xml>|200|03/18/2026|valid|0|
33|ANTARA - Hiburan|<https://www.antaranews.com/rss/hiburan.xml>|200|03/18/2026|valid|0|
34|ANTARA - Dunia|<https://www.antaranews.com/rss/dunia.xml>|200|03/18/2026|valid|0|
35|ANTARA - Dunia (ASEAN)|<https://www.antaranews.com/rss/dunia-asean.xml>|200|03/18/2026|valid|1|
36|ANTARA - Tekno|<https://www.antaranews.com/rss/tekno.xml>|ERR (TIMEOUT)|03/18/2026|invalid|0|
37|RM.ID - Semua berita|<https://rm.id/rss-rakyat-merdeka>|200|03/18/2026|valid|35|
38|RM.ID - Nasional|<https://rm.id/rss-rakyat-merdeka/nasional>|needs check|03/18/2026|needs verification|0|
39|RM.ID - Internasional|<https://rm.id/rss-rakyat-merdeka/internasional>|200|03/18/2026|valid|1|
40|RM.ID - Ekonomi Bisnis|<https://rm.id/rss-rakyat-merdeka/ekonomi-bisnis>|200|03/18/2026|valid|18|
41|RM.ID - Bank & Finance|<https://rm.id/rss-rakyat-merdeka/bank-finance>|needs check|03/18/2026|needs verification|0|
42|RM.ID - Indonesianomics|<https://rm.id/rss-rakyat-merdeka/indonesianomics>|needs check|03/18/2026|needs verification|0|
43|Kompas (Mainstream Daily)|<https://sindikasi.kompas.com/xml/nasional>|needs check|03/18/2026|needs verification|0|
44|Kompas Ekonomi (Economy)|<https://sindikasi.kompas.com/xml/ekonomi>|needs check|03/18/2026|needs verification|0|
45|Detikcom (Top Breaking Portal)|<https://laporan.detik.com/rss/detiknews.xml>|needs check|03/18/2026|needs verification|0|
46|Detik Finance (Finance and Economy)|<https://laporan.detik.com/rss/detikfinance.xml>|needs check|03/18/2026|needs verification|0|
47|CNBC Indonesia (Business News)|<https://www.cnbcindonesia.com/news/rss>|needs check|03/18/2026|needs verification|0|
48|CNBC Indonesia (Market/Stocks)|<https://www.cnbcindonesia.com/market/rss>|needs check|03/18/2026|needs verification|0|
49|Bisnis Indonesia (Business/Industry)|<https://www.bisnis.com/rss>|needs check|03/18/2026|needs verification|0|
50|Kontan (Investment/Finance)|<https://www.kontan.co.id/rss>|needs check|03/18/2026|needs verification|0|
51|Tempo.co (Politics and Investigations)|<https://tempo.co/rss>|403 (HTTP_403)|03/18/2026|invalid|0|
52|Liputan6 (General Portal)|<https://www.liputan6.com/rss>|needs check|03/18/2026|needs verification|0|
53|Suara (Independent News)|<https://www.suara.com/rss>|Recovered via sitemap|03/18/2026|valid|229|
54|Merdeka (Online News)|<https://www.merdeka.com/feed>|needs check|03/18/2026|needs verification|0|
55|Viva.co.id (General Breaking)|<https://www.viva.co.id/rss>|needs check|03/18/2026|needs verification|0|
56|Republika Ekonomi (Business Economy)|<https://republika.co.id/rss/ekonomi>|200|03/18/2026|valid|3|

### Netherlands (NL)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|NOS|<https://feeds.nos.nl/nosnieuwsalgemeen>|200|03/18/2026|valid|35|
2|NRC|<https://www.nrc.nl/rss>|Recovered via sitemap|03/18/2026|valid|34|
3|AD|<https://www.ad.nl/rss.xml>|200|03/18/2026|valid|111|
4|Nu|<https://www.nu.nl/rss/algemeen>|200|03/18/2026|valid|33|
5|NPO Radio 1|<https://www.npo3fm.nl/rss/>|200|03/18/2026|valid|2|
6|NOS Tech|<https://feeds.nos.nl/nosnieuwstech>|200|03/18/2026|valid|0|
7|NRC|<https://www.nrc.nl/nieuws/rss/>|Recovered via sitemap|03/18/2026|valid|34|
8|Nieuwsuur|<https://feeds.nos.nl/nieuwsuuralgemeen>|200|03/18/2026|valid|0|
9|RTL|<https://www.rtlnieuws.nl/nieuws/rss.xml>|200|03/18/2026|valid|18|
10|NRC|<https://www.nrc.nl/rss/>|Recovered via sitemap|03/18/2026|valid|34|
11|NOS Nieuws - Binnenland|<https://feeds.nos.nl/nosnieuwsbinnenland>|200|03/18/2026|valid|0|
12|NOS Nieuws - Buitenland|<https://feeds.nos.nl/nosnieuwsbuitenland>|200|03/18/2026|valid|0|
13|NOS Nieuws - Politiek|<https://feeds.nos.nl/nosnieuwspolitiek>|200|03/18/2026|valid|0|
14|NOS Nieuws - Economie|<https://feeds.nos.nl/nosnieuwseconomie>|200|03/18/2026|valid|0|
15|NOS Nieuws - Opmerkelijk|<https://feeds.nos.nl/nosnieuwsopmerkelijk>|200|03/18/2026|valid|0|
16|NOS Nieuws - Koningshuis|<https://feeds.nos.nl/nosnieuwskoningshuis>|200|03/18/2026|valid|1|
17|NOS Nieuws - Cultuur & media|<https://feeds.nos.nl/nosnieuwscultuurenmedia>|200|03/18/2026|valid|0|
18|NOS Sport - Algemeen|<https://feeds.nos.nl/nossportalgemeen>|200|03/18/2026|valid|13|
19|NOS Sport - Voetbal|<https://feeds.nos.nl/nosvoetbal>|200|03/18/2026|valid|0|
20|NOS Sport - Wielrennen|<https://feeds.nos.nl/nossportwielrennen>|200|03/18/2026|valid|0|
21|NOS Sport - Schaatsen|<https://feeds.nos.nl/nossportschaatsen>|200|03/18/2026|valid|0|
22|NOS Sport - Tennis|<https://feeds.nos.nl/nossporttennis>|200|03/18/2026|valid|0|
23|NOS Sport - Formule 1|<https://feeds.nos.nl/nossportformule1>|200|03/18/2026|valid|0|
24|NOS op 3|<https://feeds.nos.nl/nosop3>|200|03/18/2026|valid|0|
25|NOS Jeugdjournaal|<https://feeds.nos.nl/jeugdjournaal>|200|03/18/2026|valid|10|
26|De Telegraaf|<https://www.telegraaf.nl/rss>|403 (HTTP_403)|03/18/2026|invalid|0|
27|de Volkskrant|<https://www.volkskrant.nl/voorpagina/rss.xml>|200|03/18/2026|valid|12|
28|Trouw|<https://www.trouw.nl/voorpagina/rss.xml>|200|03/18/2026|valid|17|
29|Het Parool|<https://www.parool.nl/voorpagina/rss.xml>|200|03/18/2026|valid|7|
30|Het Financieele Dagblad (FD)|<https://fd.nl/?rss>|200|03/18/2026|valid|0|
31|Tweakers (Mixed)|<https://tweakers.net/feeds/mixed.xml>|200|03/18/2026|valid|24|
32|BNR Nieuwsradio (Economie)|<https://www.bnr.nl/rss/economie>|needs check|03/18/2026|needs verification|0|
33|Telegraaf (Financieel)|<https://www.telegraaf.nl/rss/financieel>|needs check|03/18/2026|needs verification|0|
34|RTL Z (Business)|<https://www.rtlnieuws.nl/economie/rss.xml>|Recovered via sitemap|03/18/2026|valid|28|
35|Nu.nl|<https://www.nu.nl/rss/Algemeen>|200|03/18/2026|valid|0|
36|NU.nl Binnenland|<https://www.nu.nl/rss/Binnenland>|200|03/18/2026|valid|0|
37|NU.nl Buitenland|<https://www.nu.nl/rss/Buitenland>|200|03/18/2026|valid|0|
38|NU.nl Politiek|<https://www.nu.nl/rss/Politiek>|200|03/18/2026|valid|0|
39|NU.nl Sport|<https://www.nu.nl/rss/Sport>|200|03/18/2026|valid|16|
40|Tweakers|<https://tweakers.net/feeds/nieuws.xml>|needs check|03/18/2026|needs verification|0|
41|NU.nl Economie (Portal Economy)|<https://www.nu.nl/rss/Economie>|200|03/18/2026|valid|5|
42|RTL Nieuws (General Breaking)|<https://www.rtlnieuws.nl/rss.xml>|200|03/18/2026|valid|109|
43|FOK! (News/Community)|<https://frontpage.fok.nl/xml/rss>|needs check|03/18/2026|needs verification|0|
44|IEX.nl (Stocks/Investments)|<https://www.iex.nl/rss/nieuws.xml>|needs check|03/18/2026|needs verification|0|
45|De Correspondent (In-Depth Analysis)|<https://decorrespondent.nl/feed>|needs check|03/18/2026|needs verification|0|
46|AG Connect (IT/Industry Trends)|<https://www.agconnect.nl/rss>|needs check|03/18/2026|needs verification|0|
47|Omroep Brabant|<https://www.omroepbrabant.nl/rss>|200|03/18/2026|valid|31|
48|Oost - Index|<https://www.oost.nl/rss/index.xml>|200|03/18/2026|valid|1|
49|Rijnmond - Index|<https://www.rijnmond.nl/rss/index.xml>|200|03/18/2026|valid|6|
50|Omroep West - Index|<https://www.omroepwest.nl/rss/index.xml>|200|03/18/2026|valid|17|
51|Omroep West - Den Haag|<https://www.omroepwest.nl/rss/denhaag.xml>|200|03/18/2026|valid|6|
52|Omroep West - Sport|<https://www.omroepwest.nl/rss/sport.xml>|200|03/18/2026|valid|7|
53|RTV Utrecht - Nieuws|<https://www.rtvutrecht.nl/rss/nieuws.xml>|200|03/18/2026|valid|18|
54|GLD - Index|<https://www.gld.nl/rss/index.xml>|200|03/18/2026|valid|4|
55|GLD - Arnhem|<https://www.gld.nl/rss/arnhem.xml>|200|03/18/2026|valid|5|
56|GLD - Nijmegen|<https://www.gld.nl/rss/nijmegen.xml>|200|03/18/2026|valid|2|
57|GLD - Achterhoek|<https://www.gld.nl/rss/achterhoek.xml>|200|03/18/2026|valid|11|
58|GLD - Economie|<https://www.gld.nl/rss/economie.xml>|200|03/18/2026|valid|29|
59|RTV Drenthe - Home|<https://www.rtvdrenthe.nl/rss/home>|200|03/18/2026|valid|17|
60|RTV Noord - Index|<https://www.rtvnoord.nl/rss/index.xml>|200|03/18/2026|valid|0|
61|L1 Nieuws - Home|<https://www.l1nieuws.nl/rss/home>|200|03/18/2026|valid|7|
62|Omroep Zeeland - Index|<https://www.omroepzeeland.nl/rss/index.xml>|200|03/18/2026|valid|12|
63|NU.nl - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
64|NOS - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
65|AD - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
66|NRC - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
67|AT5 - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
68|NH Nieuws - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
69|Hart van Nederland - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
70|Hart van Nederland - Economie Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
71|Hart van Nederland - Politiek Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
72|Hart van Nederland - Weer Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
73|Hart van Nederland - Milieu & Gezondheid Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
74|De Telegraaf - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
75|FD - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
76|FD - Google News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
77|Oost - Binnenland|<https://www.oost.nl/rss/binnenland.xml>|200|03/18/2026|valid|25|
78|Oost - Overijssel|<https://www.oost.nl/rss/overijssel.xml>|200|03/18/2026|valid|0|
79|Oost - Sport|<https://www.oost.nl/rss/sport.xml>|200|03/18/2026|valid|8|
80|RTV Noord - Groningen|<https://www.rtvnoord.nl/rss/groningen.xml>|200|03/18/2026|valid|15|
81|RTV Noord - Sport|<https://www.rtvnoord.nl/rss/sport.xml>|200|03/18/2026|valid|4|
82|L1 Nieuws - Limburg|<https://www.l1nieuws.nl/rss/limburg>|200|03/18/2026|valid|0|
83|Omroep Zeeland - Nieuws|<https://www.omroepzeeland.nl/rss/nieuws.xml>|200|03/18/2026|valid|0|
84|RTV Utrecht - Sport|<https://www.rtvutrecht.nl/rss/sport.xml>|200|03/18/2026|valid|3|
85|RTV Utrecht - Utrecht Stad|<https://www.rtvutrecht.nl/rss/utrecht-stad.xml>|200|03/18/2026|valid|4|
86|Rijnmond - Rotterdam|<https://www.rijnmond.nl/rss/rotterdam.xml>|200|03/18/2026|valid|30|
87|RTV Drenthe - Nieuws|<https://www.rtvdrenthe.nl/rss/nieuws>|200|03/18/2026|valid|0|
88|BNR - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
89|BNR - Google News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
90|Omrop Fryslan - NL Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
91|Rijnmond - Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
92|WNL - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
93|BNNVARA|<https://www.bnnvara.nl/api/rss/bnnvara>|200|03/18/2026|valid|5|
94|Joop|<https://www.bnnvara.nl/api/rss/joop>|200|03/18/2026|valid|17|
95|Zembla|<https://www.bnnvara.nl/api/rss/zembla>|200|03/18/2026|valid|1|
96|Omrop Fryslan - Nieuws RSS|<https://www.omropfryslan.nl/rss/nieuws>|200|03/18/2026|valid|55|
97|Sleutelstad|<https://sleutelstad.nl/feed/>|200|03/18/2026|valid|74|
98|Unity.NU|<https://unity.nu/feed/>|200|03/18/2026|valid|92|
99|Omroep Delft|<https://omroepdelft.nl/feed/>|Recovered via sitemap|03/18/2026|valid|9|
100|Open Rotterdam|<https://openrotterdam.nl/feed/>|200|03/18/2026|valid|11|
101|WEEFF|<https://www.weeff.nl/feed/>|200|03/18/2026|valid|12|
102|Omroep Tilburg|<https://www.omroeptilburg.nl/feed/>|200|03/18/2026|valid|14|
103|Omroep Almere|<https://www.omroepalmere.nl/feed/>|200|03/18/2026|valid|13|
104|LC|<https://lc.nl/api/feed/rss>|200|03/18/2026|valid|35|
105|DVHN|<https://dvhn.nl/api/feed/rss>|200|03/18/2026|valid|44|
106|L1 Nieuws - Index|<https://www.l1nieuws.nl/rss/index.xml>|200|03/18/2026|valid|20|
107|L1 Nieuws - Sport|<https://www.l1nieuws.nl/rss/sport.xml>|200|03/18/2026|valid|10|
108|RTV Focus Zwolle|<https://www.rtvfocuszwolle.nl/feed/>|200|03/18/2026|valid|14|
109|Salland1|<https://www.salland1.nl/feed/>|200|03/18/2026|valid|22|
110|RTV NOF|<https://www.rtvnof.nl/feed/>|200|03/18/2026|valid|49|
111|1Zwolle|<https://1zwolle.nl/feed>|200|03/18/2026|valid|49|
112|Dordt Centraal|<https://dordtcentraal.nl/feed/>|200|03/18/2026|valid|20|
113|RTV Papendrecht|<https://www.rtvpapendrecht.nl/feed/>|200|03/18/2026|valid|14|
114|De Westkrant|<https://www.dewestkrant.nl/feed/>|200|03/18/2026|valid|5|
115|PZC - Nieuws|<https://www.pzc.nl/nieuws/rss.xml>|200|03/18/2026|valid|72|
116|Tubantia - Nieuws|<https://www.tubantia.nl/nieuws/rss.xml>|200|03/18/2026|valid|71|
117|De Stentor - Nieuws|<https://www.destentor.nl/nieuws/rss.xml>|200|03/18/2026|valid|70|
118|De Gelderlander - Nieuws|<https://www.gelderlander.nl/nieuws/rss.xml>|200|03/18/2026|valid|65|
119|Brabants Dagblad - Nieuws|<https://www.bd.nl/nieuws/rss.xml>|200|03/18/2026|valid|83|
120|Eindhovens Dagblad - Nieuws|<https://www.ed.nl/nieuws/rss.xml>|200|03/18/2026|valid|75|
121|BN DeStem - Nieuws|<https://www.bndestem.nl/nieuws/rss.xml>|200|03/18/2026|valid|73|

### Switzerland (CH)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Le Temps Economy|<https://www.letemps.ch/economie.rss>|200|03/18/2026|valid|0|
2|NZZ|<https://www.nzz.ch/startseite.rss>|200|03/18/2026|valid|33|
3|NDR|<https://www.ndr.ch/rss/>|needs check|03/18/2026|needs verification|0|
4|SRF News (Latest)|<https://www.srf.ch/news/bnf/rss/19032223>|200|03/18/2026|valid|35|
5|SRF News (Switzerland)|<https://www.srf.ch/news/bnf/rss/1890>|200|03/18/2026|valid|0|
6|SRF News (International)|<https://www.srf.ch/news/bnf/rss/1922>|200|03/18/2026|valid|4|
7|SRF News (Economy)|<https://www.srf.ch/news/bnf/rss/1926>|200|03/18/2026|valid|9|
8|SRF Sport (Football)|<https://www.srf.ch/sport/bnf/rss/2562>|200|03/18/2026|valid|1|
9|SRF Sport (Ice Hockey)|<https://www.srf.ch/sport/bnf/rss/3418>|200|03/18/2026|valid|0|
10|SRF Sport (Tennis)|<https://www.srf.ch/sport/bnf/rss/2814>|200|03/18/2026|valid|1|
11|SRF Sport (Alpine Skiing)|<https://www.srf.ch/sport/bnf/rss/787950>|200|03/18/2026|valid|0|
12|SRF Wissen (Health)|<https://www.srf.ch/bnf/rss/19919909>|200|03/18/2026|valid|0|
13|SRF Wissen (Tech)|<https://www.srf.ch/bnf/rss/19920122>|200|03/18/2026|valid|0|
14|Blick (Schweiz)|<https://www.blick.ch/schweiz/rss.xml>|403 (HTTP_403)|03/18/2026|invalid|0|
15|Blick (Ausland)|<https://www.blick.ch/ausland/rss.xml>|403 (HTTP_403)|03/18/2026|invalid|0|
16|Blick (Wirtschaft)|<https://www.blick.ch/wirtschaft/rss.xml>|403 (HTTP_403)|03/18/2026|invalid|0|
17|Blick (Politik)|<https://www.blick.ch/politik/rss.xml>|403 (HTTP_403)|03/18/2026|invalid|0|
18|Blick (Sport)|<https://www.blick.ch/sport/rss.xml>|403 (HTTP_403)|03/18/2026|invalid|0|
19|Blick Sport (Fussball)|<https://www.blick.ch/sport/fussball/rss.xml>|403 (HTTP_403)|03/18/2026|invalid|0|
20|Blick Sport (Eishockey)|<https://www.blick.ch/sport/eishockey/rss.xml>|403 (HTTP_403)|03/18/2026|invalid|0|
21|Blick Sport (Ski)|<https://www.blick.ch/sport/ski/rss.xml>|403 (HTTP_403)|03/18/2026|invalid|0|
22|Blick Sport (Tennis)|<https://www.blick.ch/sport/tennis/rss.xml>|403 (HTTP_403)|03/18/2026|invalid|0|
23|Blick (Digital)|<https://www.blick.ch/digital/rss.xml>|needs check|03/18/2026|needs verification|0|
24|Le News (EN)|<https://lenews.ch/feed>|200|03/18/2026|valid|0|
25|The Local Switzerland (EN)|<https://feeds.thelocal.com/rss/ch>|200|03/18/2026|valid|5|
26|NZZ (Latest)|<https://www.nzz.ch/recent.rss>|200|03/18/2026|valid|2|
27|Tages-Anzeiger|<https://partner-feeds.publishing.tamedia.ch/rss/tagesanzeiger/>|200|03/18/2026|valid|77|
28|Swissinfo (Business - EN)|<https://www.swissinfo.ch/eng/business/feed>|needs check|03/18/2026|needs verification|0|
29|Finews.ch (Swiss Finance)|<https://www.finews.ch/news/finanzplatz?format=feed&type=rss>|200|03/18/2026|valid|1|
30|20 Minuten (Wirtschaft)|<https://www.20min.ch/rss/wirtschaft>|needs check|03/18/2026|needs verification|0|
31|Le Temps|<https://www.letemps.ch/rss>|needs check|03/18/2026|needs verification|0|
32|Finanz und Wirtschaft|<https://www.fuw.ch/feed>|needs check|03/18/2026|needs verification|0|
33|NZZ Wirtschaft (Economy - German)|<https://www.nzz.ch/wirtschaft.rss>|200|03/18/2026|valid|1|
34|Tages-Anzeiger (Zurich Headlines - German)|<https://www.tagesanzeiger.ch/rss.xml>|needs check|03/18/2026|needs verification|0|
35|Blick (Swiss #1 Popular Daily - German)|<https://www.blick.ch/rss.xml>|403 (HTTP_403)|03/18/2026|invalid|0|
36|Handelszeitung (Economy Weekly - German)|<https://www.handelszeitung.ch/rss.xml>|needs check|03/18/2026|needs verification|0|
37|Cash.ch (Finance/Investment - German)|<https://www.cash.ch/rss>|needs check|03/18/2026|needs verification|0|
38|RTS Info (French-speaking public broadcaster Breaking - French)|<https://www.rts.ch/info/rss>|needs check|03/18/2026|needs verification|0|
39|Le Temps Suisse (Domestic - French)|<https://www.letemps.ch/suisse.rss>|200|03/18/2026|valid|0|
40|Bilan.ch (Economy - French)|<https://www.bilan.ch/rss.xml>|needs check|03/18/2026|needs verification|0|
41|20 Minuten Schweiz (Domestic - German)|<https://www.20min.ch/rss/schweiz>|needs check|03/18/2026|needs verification|0|
42|Watson.ch (News Portal - German)|<https://www.watson.ch/api/rss>|needs check|03/18/2026|needs verification|0|
43|Aargauer Zeitung (Regional Major Daily - German)|<https://www.aargauerzeitung.ch/rss>|needs check|03/18/2026|needs verification|0|
44|Berner Zeitung (Bern Major Daily - German)|<https://www.bernerzeitung.ch/rss.xml>|needs check|03/18/2026|needs verification|0|
45|Basler Zeitung (Basel Major Daily - German)|<https://www.bazonline.ch/rss.xml>|needs check|03/18/2026|needs verification|0|
46|Le Matin|<https://www.lematin.ch/rss.xml>|needs check|03/18/2026|needs verification|0|
47|Nau.ch - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
48|Blue News (German)|<https://www.bluewin.ch/de/feed.xml>|200|03/18/2026|valid|104|
49|Blue News (French)|<https://www.bluewin.ch/fr/feed.xml>|200|03/18/2026|valid|66|
50|Blue News (Italian)|<https://www.bluewin.ch/it/feed.xml>|200|03/18/2026|valid|70|
51|Blue News (English)|<https://www.bluewin.ch/en/feed.xml>|200|03/18/2026|valid|93|
52|20 Minuten - Articles Sitemap (German)|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
53|20 Minutes - Articles Sitemap (French)|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
54|Le Matin - Articles Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
55|RSI - Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
56|Corriere del Ticino - Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
57|Ticinonline - Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
58|laRegione - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
59|zentralplus - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
60|Bote der Urschweiz - Articles Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
61|Cash.ch - Articles Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
62|Handelszeitung - Articles Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
63|Bilanz|<https://www.bilanz.ch/rss.xml>|200|03/18/2026|valid|7|
64|Inside Paradeplatz|<https://insideparadeplatz.ch/feed/>|200|03/18/2026|valid|8|
65|Moneycab|<https://www.moneycab.com/feed/>|200|03/18/2026|valid|21|
66|persoenlich.com|<https://www.persoenlich.com/rss/news.xml>|200|03/18/2026|valid|13|
67|LFM la radio|<https://www.lfm.ch/feed/>|200|03/18/2026|valid|26|
68|Radio Lac|<https://www.radiolac.ch/feed/>|200|03/18/2026|valid|29|
69|Frapp - French Articles Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
70|TeleZuri - Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
71|TeleBarn - Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
72|TeleM1 - Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
73|Tele1 - Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
74|NZZ Sport|<https://www.nzz.ch/sport.rss>|200|03/18/2026|valid|0|
75|NZZ Wissenschaft|<https://www.nzz.ch/wissenschaft.rss>|200|03/18/2026|valid|0|
76|NZZ Feuilleton|<https://www.nzz.ch/feuilleton.rss>|200|03/18/2026|valid|0|
77|Le Temps Articles|<https://www.letemps.ch/articles.rss>|200|03/18/2026|valid|30|
78|Le Temps Monde|<https://www.letemps.ch/monde.rss>|200|03/18/2026|valid|0|
79|Le Temps Societe|<https://www.letemps.ch/societe.rss>|200|03/18/2026|valid|0|
80|Le Temps Sport|<https://www.letemps.ch/sport.rss>|200|03/18/2026|valid|0|
81|Le Temps Culture|<https://www.letemps.ch/culture.rss>|200|03/18/2026|valid|0|
82|Le Temps Sciences|<https://www.letemps.ch/sciences.rss>|200|03/18/2026|valid|0|
83|Le Temps Opinions|<https://www.letemps.ch/opinions.rss>|200|03/18/2026|valid|0|
84|Tribune de Geneve|<https://www.tdg.ch/rss.xml>|needs check|03/18/2026|needs verification|0|
85|SRF - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
86|Watson - Google News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
87|24 heures - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
88|Berner Zeitung - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
89|Basler Zeitung - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
90|Tribune de Geneve - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|

### Turkey (TR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Hurriyet|<https://www.hurriyet.com.tr/rss/anasayfa>|needs check|03/18/2026|needs verification|0|
2|Sabah|<https://www.sabah.com.tr/rss/sondakika.xml>|200|03/18/2026|valid|150|
3|Haberturk|<https://www.haberturk.com/rss>|200|03/18/2026|valid|1|
4|Cumhuriyet|<https://www.cumhuriyet.com.tr/Rss/>|200|03/18/2026|valid|214|
5|Aksam|<https://www.aksam.com.tr/rss>|200|03/18/2026|valid|231|
6|Takvim|<https://www.takvim.com.tr/rss/feed>|needs check|03/18/2026|needs verification|0|
7|Cumhuriyet|<https://www.cumhuriyet.com.tr/RSS>|200|03/18/2026|valid|214|
8|HuffPost Turkey|<https://www.hurriyetdailynews.com/rss>|needs check|03/18/2026|needs verification|0|
9|Haber Turk|<https://www.haberturk.com/rss/>|200|03/18/2026|valid|57|
10|Hurriyet (Anasayfa)|<http://www.hurriyet.com.tr/rss/anasayfa>|200|03/18/2026|valid|95|
11|Hurriyet (Gundem)|<http://www.hurriyet.com.tr/rss/gundem>|200|03/18/2026|valid|29|
12|Hurriyet (Ekonomi)|<http://www.hurriyet.com.tr/rss/ekonomi>|200|03/18/2026|valid|0|
13|Hurriyet (Magazin)|<http://www.hurriyet.com.tr/rss/magazin>|200|03/18/2026|valid|0|
14|Hurriyet (Spor)|<http://www.hurriyet.com.tr/rss/spor>|200|03/18/2026|valid|18|
15|Hurriyet (Dunya)|<http://www.hurriyet.com.tr/rss/dunya>|200|03/18/2026|valid|6|
16|Hurriyet (Teknoloji)|<http://www.hurriyet.com.tr/rss/teknoloji>|200|03/18/2026|valid|2|
17|Hurriyet (Saglk)|<http://www.hurriyet.com.tr/rss/saglik>|200 (HTML_RETURNED)|03/18/2026|invalid|0|
18|Hurriyet (Astroloji)|<http://www.hurriyet.com.tr/rss/astroloji>|200|03/18/2026|valid|0|
19|Sabah (Anasayfa)|<https://www.sabah.com.tr/rss/anasayfa.xml>|200|03/18/2026|valid|13|
20|Sabah (Ekonomi)|<https://www.sabah.com.tr/rss/ekonomi.xml>|200|03/18/2026|valid|3|
21|Sabah (Spor)|<https://www.sabah.com.tr/rss/spor.xml>|200|03/18/2026|valid|9|
22|Sabah (Gundem)|<https://www.sabah.com.tr/rss/gundem.xml>|200|03/18/2026|valid|8|
23|Sabah (Yasam)|<https://www.sabah.com.tr/rss/yasam.xml>|200|03/18/2026|valid|3|
24|Sabah (Dunya)|<https://www.sabah.com.tr/rss/dunya.xml>|200|03/18/2026|valid|3|
25|Sabah (Teknoloji)|<https://www.sabah.com.tr/rss/teknoloji.xml>|needs check|03/18/2026|needs verification|0|
26|Sabah (Turizm)|<https://www.sabah.com.tr/rss/turizm.xml>|needs check|03/18/2026|needs verification|0|
27|Sabah (Otomobil)|<https://www.sabah.com.tr/rss/otomobil.xml>|needs check|03/18/2026|needs verification|0|
28|CNN Turk (All / News)|<https://www.cnnturk.com/feed/rss/all/news>|200|03/18/2026|valid|151|
29|CNN Turk (Turkiye / News)|<https://www.cnnturk.com/feed/rss/turkiye/news>|200|03/18/2026|valid|3|
30|CNN Turk (Dunya / News)|<https://www.cnnturk.com/feed/rss/dunya/news>|200|03/18/2026|valid|3|
31|CNN Turk (Ekonomi / News)|<https://www.cnnturk.com/feed/rss/ekonomi/news>|200|03/18/2026|valid|0|
32|CNN Turk (Bilim-Teknoloji / News)|<https://www.cnnturk.com/feed/rss/bilim-teknoloji/news>|needs check|03/18/2026|needs verification|0|
33|CNN Turk (Spor / News)|<https://www.cnnturk.com/feed/rss/spor/news>|200|03/18/2026|valid|2|
34|CNN Turk (Saglk / News)|<https://www.cnnturk.com/feed/rss/saglik/news>|200|03/18/2026|valid|0|
35|TRT Haber (Son Dakika)|<http://www.trthaber.com/sondakika.rss>|200|03/18/2026|valid|0|
36|Haberturk (Main)|<http://www.haberturk.com/rss>|200|03/18/2026|valid|0|
37|Dunya (Main)|<https://www.dunya.com/rss?dunya>|200|03/18/2026|valid|5|
38|BBC Turkce|<https://feeds.bbci.co.uk/turkce/rss.xml>|200|03/18/2026|valid|9|
39|Hurriyet Ekonomi (Major Economy)|<https://www.hurriyet.com.tr/rss/ekonomi>|needs check|03/18/2026|needs verification|0|
40|Bloomberg HT (Economy and Finance)|<https://www.bloomberght.com/rss>|200|03/18/2026|valid|44|
41|Dunya (Economy Specialist)|<https://www.dunya.com/rss>|200|03/18/2026|valid|109|
42|NTV (Main Broadcaster)|<https://www.ntv.com.tr/rss>|needs check|03/18/2026|needs verification|0|
43|NTV Ekonomi (Economy)|<https://www.ntv.com.tr/ekonomi.rss>|200|03/18/2026|valid|2|
44|Sozcu (National Daily)|<https://www.sozcu.com.tr/rss>|needs check|03/18/2026|needs verification|0|
45|Sozcu Ekonomi (Economy)|<https://www.sozcu.com.tr/kategori/ekonomi/rss>|needs check|03/18/2026|needs verification|0|
46|Haberturk Ekonomi (Portal Economy)|<https://www.haberturk.com/rss/ekonomi.xml>|200|03/18/2026|valid|25|
47|TRT Haber (Public Broadcaster Breaking)|<https://www.trthaber.com/sondakika.rss>|200|03/18/2026|valid|107|
48|Milliyet (Major Daily)|<https://www.milliyet.com.tr/rss/rssnew/sondakikarss.xml>|needs check|03/18/2026|needs verification|0|
49|Karar (Politics and Analysis)|<https://www.karar.com/rss>|200|03/18/2026|valid|215|
50|Yeni Safak (Conservative Daily)|<https://www.yenisafak.com/rss>|200|03/18/2026|valid|83|
51|Ensonhaber (General Breaking)|<https://www.ensonhaber.com/rss/ensonhaber.xml>|200|03/18/2026|valid|199|
52|T24 (Independent Digital Media)|<https://t24.com.tr/rss>|Recovered via sitemap|03/18/2026|valid|0|
53|Webtekno (Tech/IT)|<https://www.webtekno.com/rss.xml>|200|03/18/2026|valid|38|

### Saudi Arabia (SA)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Okaz|<https://www.okaz.com.sa/rss/news>|needs check|03/18/2026|needs verification|0|
2|Al Jazirah|<https://www.aljazeera.net/rss>|200|03/18/2026|valid|170|
3|Al Madina|<https://www.al-madina.com/rssFeed/193>|200|03/18/2026|valid|0|
4|Al Bilad Daily|<https://albiladdaily.com/feed>|200|03/18/2026|valid|33|
5|Makkah Newspaper|<https://makkahnewspaper.com/rssFeed/0>|200|03/18/2026|valid|39|
6|Al Jazirah|<https://www.al-jazirah.com/rss/ln.xml>|200|03/18/2026|valid|170|
7|Al Arabiya (EN - Business)|<https://english.alarabiya.net/feed/business>|needs check|03/18/2026|needs verification|0|
8|Al Arabiya (EN - Middle East)|<https://english.alarabiya.net/feed/middle-east>|needs check|03/18/2026|needs verification|0|
9|Asharq Business (Bloomberg Arabic)|<https://asharqbusiness.com/feed>|needs check|03/18/2026|needs verification|0|
10|Gulf Business (Saudi Section)|<https://gulfbusiness.com/region/saudi-arabia/feed/>|Recovered via sitemap|03/18/2026|valid|0|
11|Saudi Gazette (Business)|<https://saudigazette.com.sa/rss/3>|needs check|03/18/2026|needs verification|0|
12|Zawya|<https://www.zawya.com/en/rss>|needs check|03/18/2026|needs verification|0|
13|Arab News|<https://www.arabnews.com/rss.xml>|needs check|03/18/2026|needs verification|0|
14|Al Eqtisadiah (Economy - Arabic)|<https://www.aleqt.com/feed>|needs check|03/18/2026|needs verification|0|
15|Saudi Press Agency (Arabic)|<https://www.spa.gov.sa/rss>|needs check|03/18/2026|needs verification|0|
16|Al Riyadh (Main - Arabic)|<https://www.alriyadh.com/rss>|needs check|03/18/2026|needs verification|0|
17|Al Arabiya (Business - Arabic)|<https://www.alarabiya.net/feed/business>|needs check|03/18/2026|needs verification|0|
18|Argaam (Arabic Economy/Stocks #1)|<https://www.argaam.com/ar/rss/news/type/1>|needs check|03/18/2026|needs verification|0|
19|Mubasher Saudi (Finance/Markets)|<https://www.mubasher.info/countries/sa/rss>|needs check|03/18/2026|needs verification|0|
20|Al Arabiya Saudi (Saudi Domestic)|<https://www.alarabiya.net/feed/saudi-today>|needs check|03/18/2026|needs verification|0|
21|Sabq (Saudi Top Online Outlet)|<https://sabq.org/feed>|needs check|03/18/2026|needs verification|0|
22|Maaal (Saudi Business)|<https://www.maaal.com/feed>|needs check|03/18/2026|needs verification|0|
23|Al Watan (Saudi Domestic Breaking)|<https://www.alwatan.com.sa/rss>|needs check|03/18/2026|needs verification|0|
24|Sky News Arabia (Arabic Business)|<https://www.skynewsarabia.com/rss.xml>|200|03/18/2026|valid|88|
25|CNBC Arabia (Middle East Economy)|<https://www.cnbcarabia.com/RSS/117>|needs check|03/18/2026|needs verification|0|
26|Independent Arabia (Independent Arabic)|<https://www.independentarabia.com/rss.xml>|200|03/18/2026|valid|2|
27|Akhbaar24 (General Portal)|<https://akhbaar24.argaam.com/rss>|Recovered via sitemap|03/18/2026|valid|0|
28|Al Yaum (Domestic Trends)|<https://www.alyaum.com/rss>|needs check|03/18/2026|needs verification|0|
29|Zawya Arabic (Middle East Business)|<https://www.zawya.com/ar/rss>|needs check|03/18/2026|needs verification|0|
30|Saudi Gazette|<https://saudigazette.com.sa/rssFeed/1>|200|03/18/2026|valid|0|

### Taiwan (TW)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Liberty Times - Business|<https://news.ltn.com.tw/rss/business.xml>|200|03/18/2026|valid|63|
2|TechNews Taiwan|<https://technews.tw/feed/>|200|03/18/2026|valid|97|
3|CNA (Central News Agency)|<https://feeds.feedburner.com/cnaFirstNews>|200|03/18/2026|valid|13|
4|Formosa Reporter|<https://www.formosapost.com/feed/>|200|03/18/2026|valid|0|
5|CNA |<https://feeds.feedburner.com/rsscna/politics>|200|03/18/2026|valid|39|
6|CNA |<https://feeds.feedburner.com/rsscna/intworld>|200|03/18/2026|valid|76|
7|CNA |<https://feeds.feedburner.com/rsscna/mainland>|200|03/18/2026|valid|25|
8|CNA |<https://feeds.feedburner.com/rsscna/finance>|200|03/18/2026|valid|76|
9|CNA |<https://feeds.feedburner.com/rsscna/technology>|200|03/18/2026|valid|3|
10|CNA |<https://feeds.feedburner.com/rsscna/lifehealth>|200|03/18/2026|valid|50|
11|CNA |<https://feeds.feedburner.com/rsscna/social>|200|03/18/2026|valid|30|
12|CNA |<https://feeds.feedburner.com/rsscna/local>|200|03/18/2026|valid|47|
13|CNA |<https://feeds.feedburner.com/rsscna/culture>|200|03/18/2026|valid|4|
14|CNA |<https://feeds.feedburner.com/rsscna/sport>|200|03/18/2026|valid|21|
15|CNA |<https://feeds.feedburner.com/rsscna/stars>|200|03/18/2026|valid|7|
16|Liberty Times |<https://news.ltn.com.tw/rss/all.xml>|200|03/18/2026|valid|26|
17|Liberty Times |<https://news.ltn.com.tw/rss/politics.xml>|200|03/18/2026|valid|71|
18|Liberty Times |<https://news.ltn.com.tw/rss/society.xml>|200|03/18/2026|valid|55|
19|Liberty Times |<https://news.ltn.com.tw/rss/life.xml>|200|03/18/2026|valid|105|
20|Liberty Times |<https://news.ltn.com.tw/rss/opinion.xml>|200|03/18/2026|valid|12|
21|Liberty Times |<https://news.ltn.com.tw/rss/world.xml>|200|03/18/2026|valid|34|
22|Liberty Times |<https://news.ltn.com.tw/rss/sports.xml>|200|03/18/2026|valid|48|
23|Liberty Times |<https://news.ltn.com.tw/rss/entertainment.xml>|200|03/18/2026|valid|43|
24|Liberty Times |<https://news.ltn.com.tw/rss/art.xml>|200|03/18/2026|valid|4|
25|Liberty Times |<https://news.ltn.com.tw/rss/def.xml>|200|03/18/2026|valid|7|
26|Liberty Times |<https://news.ltn.com.tw/rss/local.xml>|200|03/18/2026|valid|365|
27|Liberty Times |<https://news.ltn.com.tw/rss/novelty.xml>|200|03/18/2026|valid|1|
28|Taipei Times (EN)|<https://www.taipeitimes.com/xml/index.rss>|200|03/18/2026|valid|44|
29|The Reporter|<https://www.twreporter.org/a/rss2.xml>|200|03/18/2026|valid|0|
30|Newtalk |<https://newtalk.tw/rss/all/>|200|03/18/2026|valid|199|
31|Newtalk |<https://newtalk.tw/rss/category/2>|200|03/18/2026|valid|1|
32|Youth Daily News |<https://www.ydn.com.tw/tw/Home/RSS.aspx?TID=2>|200|03/18/2026|valid|5|
33|UDN - News Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
34|ETtoday - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
35|Storm Media - Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
36|Nownews - Daily News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
37|SETN - Google News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
38|TVBS - Latest Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
39|CTWant - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
40|Business Today - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
41|EBC News - Realtime Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
42|Yahoo Taiwan - News Sitemap p0|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
43|Yahoo Taiwan - News Sitemap p1|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
44|Yahoo Taiwan - News Sitemap p2|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
45|Mirror Media - Posts News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
46|Mirror Media - Externals News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
47|PTS News|<https://news.pts.org.tw/xml/newsfeed.xml>|200|03/18/2026|valid|49|
48|CTS News - Google Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
49|People News Taiwan|<https://www.peoplenews.tw/feed>|200|03/18/2026|valid|24|

### Poland (PL)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Onet|<https://wiadomosci.onet.pl/rss>|200|03/18/2026|valid|127|
2|TVN24|<https://tvn24.pl/tvnmeteo.xml>|needs check|03/18/2026|needs verification|0|
3|Fakt|<https://www.fakt.pl/rss/>|200|03/18/2026|valid|39|
4|Wprost|<https://www.wprost.pl/rss/>|200|03/18/2026|valid|36|
5|RMF24 (Main)|<https://www.rmf24.pl/feed>|200|03/18/2026|valid|76|
6|RMF24 Fakty|<https://www.rmf24.pl/fakty/feed>|200|03/18/2026|valid|20|
7|RMF24 Polska|<https://www.rmf24.pl/fakty/polska/feed>|200|03/18/2026|valid|0|
8|RMF24 Polityka|<https://www.rmf24.pl/fakty/polityka/feed>|200|03/18/2026|valid|0|
9|RMF24 Swiat|<https://www.rmf24.pl/fakty/swiat/feed>|200|03/18/2026|valid|1|
10|RMF24 Ekonomia|<https://www.rmf24.pl/ekonomia/feed>|200|03/18/2026|valid|1|
11|RMF24 Nauka|<https://www.rmf24.pl/nauka/feed>|200|03/18/2026|valid|0|
12|RMF24 Kultura|<https://www.rmf24.pl/kultura/feed>|200|03/18/2026|valid|0|
13|RMF24 Sport|<https://www.rmf24.pl/sport/feed>|200|03/18/2026|valid|0|
14|RMF24 Ciekawostki|<https://www.rmf24.pl/rozrywka/ciekawostki/feed>|200|03/18/2026|valid|2|
15|RMF24 Komentarze|<https://www.rmf24.pl/tylko-w-rmf24/komentarze/feed>|200|03/18/2026|valid|0|
16|RMF24 Podsumowanie dnia|<https://www.rmf24.pl/fakty/podsumowanie-dnia/feed>|200|03/18/2026|valid|0|
17|PolsatNews Wszystkie|<https://www.polsatnews.pl/rss/wszystkie.xml>|200|03/18/2026|valid|5|
18|PolsatNews Polska|<https://www.polsatnews.pl/rss/polska.xml>|200|03/18/2026|valid|19|
19|PolsatNews Swiat|<https://www.polsatnews.pl/rss/swiat.xml>|200|03/18/2026|valid|12|
20|PolsatNews Wideo|<https://www.polsatnews.pl/rss/wideo.xml>|200|03/18/2026|valid|4|
21|PolsatNews Biznes|<https://www.polsatnews.pl/rss/biznes.xml>|200|03/18/2026|valid|1|
22|PolsatNews Technologie|<https://www.polsatnews.pl/rss/technologie.xml>|200|03/18/2026|valid|0|
23|PolsatNews Moto|<https://www.polsatnews.pl/rss/moto.xml>|200|03/18/2026|valid|0|
24|PolsatNews Kultura|<https://www.polsatnews.pl/rss/kultura.xml>|200|03/18/2026|valid|0|
25|PolsatNews Sport|<https://www.polsatnews.pl/rss/sport.xml>|200|03/18/2026|valid|50|
26|PolsatNews Czysta Polska|<https://www.polsatnews.pl/rss/czysta-polska.xml>|200|03/18/2026|valid|0|
27|Nauka w Polsce (All)|<https://naukawpolsce.pl/all/rss.xml>|200|03/18/2026|valid|2|
28|Nauka w Polsce (Science categories)|<https://naukawpolsce.pl/naukowy/rss.xml>|200|03/18/2026|valid|4|
29|Nauka w Polsce (Technologia)|<https://naukawpolsce.pl/technologia/rss.xml>|200|03/18/2026|valid|0|
30|Nauka w Polsce (Blog)|<https://naukawpolsce.pl/blog/rss.xml>|200|03/18/2026|valid|0|
31|PAP MediaRoom (All)|<https://pap-mediaroom.pl/rss.xml>|200|03/18/2026|valid|0|
32|PAP MediaRoom (Biznes i finanse)|<https://pap-mediaroom.pl/kategoria/biznes-i-finanse/rss.xml>|200|03/18/2026|valid|0|
33|PAP MediaRoom (Nauka i technologie)|<https://pap-mediaroom.pl/kategoria/nauka-i-technologie/rss.xml>|200|03/18/2026|valid|0|
34|PAP MediaRoom (Kalendarium)|<https://pap-mediaroom.pl/kalendarium/rss.xml>|200|03/18/2026|valid|4|
35|Onet Wiadomosci (Top Portal News)|<https://wiadomosci.onet.pl/.feed>|200|03/18/2026|valid|3|
36|TVN24 Najnowsze (TVN24 News)|<https://tvn24.pl/najnowsze.xml>|200|03/18/2026|valid|111|
37|TVN24 Biznes (TVN24 Business)|<https://tvn24.pl/biznes.xml>|needs check|03/18/2026|needs verification|0|
38|Money.pl (Polish Economy Portal #1)|<https://www.money.pl/rss/>|200|03/18/2026|valid|20|
39|Bankier.pl (Finance/Investing)|<https://www.bankier.pl/rss/wiadomosci.xml>|200|03/18/2026|valid|62|
40|Wprost (Politics/Current Affairs)|<https://www.wprost.pl/rss>|200|03/18/2026|valid|0|
41|Rzeczpospolita (Economy/Politics)|<https://www.rp.pl/rss/all>|needs check|03/18/2026|needs verification|0|
42|Gazeta.pl (Top Portal News)|<https://rss.gazeta.pl/pub/rss/wiadomosci.xml>|200|03/18/2026|valid|37|
43|Interia - Wydarzenia|<https://wydarzenia.interia.pl/feed>|200|03/18/2026|valid|45|
44|Interia - Biznes|<https://biznes.interia.pl/feed>|200|03/18/2026|valid|25|
45|Interia - Sport|<https://sport.interia.pl/feed>|200|03/18/2026|valid|87|
46|Business Insider Polska|<https://businessinsider.com.pl/.feed>|200|03/18/2026|valid|71|
47|Forsal|<https://forsal.pl/.feed>|200|03/18/2026|valid|51|
48|DoRzeczy|<https://dorzeczy.pl/feed>|200|03/18/2026|valid|63|
49|Wiadomosci WP (Wirtualna Polska News)|<https://wiadomosci.wp.pl/rss.xml>|200|03/18/2026|valid|14|
50|Dziennik Gazeta Prawna (Business/Legal)|<https://www.gazetaprawna.pl/rss.xml>|needs check|03/18/2026|needs verification|0|
51|Rzeczpospolita - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
52|Rzeczpospolita - RSS Main|<https://www.rp.pl/rss_main>|200|03/18/2026|valid|95|
53|Wyborcza - Najnowsze|<https://wyborcza.pl/pub/rss/najnowsze_wyborcza.xml>|200|03/18/2026|valid|13|
54|Wiadomosci WP - Aktualnosci|<https://wiadomosci.wp.pl/rss/aktualnosci>|200|03/18/2026|valid|88|
55|PolskieRadio24 - Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
56|SE.pl - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|

### Sweden (SE)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Dagens Nyheter|<https://www.dn.se/nyheter/rss/>|200|03/18/2026|valid|59|
2|Dagens Industri|<https://www.di.se/rss/>|200|03/18/2026|valid|126|
3|SVT Nyheter|<https://www.svt.se/nyheter/rss.xml>|200|03/18/2026|valid|0|
4|Goteborgs-Posten|<https://www.gp.se/rss>|200|03/18/2026|valid|47|
5|Sveriges Television|<https://www.svt.se/nyheter/ekonomi/rss.xml>|200|03/18/2026|valid|1|
6|Svt|<https://www.svt.se/nyheter/rss.xml?sectionId=2>|200|03/18/2026|valid|46|
7|Dagens Nyheter Sport|<https://www.dn.se/sport/rss>|200|03/18/2026|valid|0|
8|Dagens Nyheter Business|<https://www.dn.se/ekonomi/rss>|200|03/18/2026|valid|0|
9|Norran|<https://www.norran.se/rss>|200|03/18/2026|valid|36|
10|Aftonbladet - Nyheter (All)|<https://rss.aftonbladet.se/rss2/small/pages/sections/senastenytt/>|200|03/18/2026|valid|255|
11|Aftonbladet - Sportbladet|<https://rss.aftonbladet.se/rss2/small/pages/sections/senastenytt/sport/>|200|03/18/2026|valid|13|
12|Aftonbladet - Sportbladet Fotboll|<https://rss.aftonbladet.se/rss2/small/pages/sections/sportbladet/fotboll/>|200|03/18/2026|valid|0|
13|Aftonbladet - Sportbladet Hockey|<https://rss.aftonbladet.se/rss2/small/pages/sections/sportbladet/hockey/>|200|03/18/2026|valid|0|
14|Aftonbladet - Nojesbladet|<https://rss.aftonbladet.se/rss2/small/pages/sections/nojesbladet/>|200|03/18/2026|valid|4|
15|Aftonbladet - Kultur|<https://rss.aftonbladet.se/rss2/small/pages/sections/kultur/>|200|03/18/2026|valid|0|
16|Expressen - Nyheter|<https://feeds.expressen.se/nyheter/>|200|03/18/2026|valid|156|
17|GT - Nyheter|<https://feeds.expressen.se/gt/>|200|03/18/2026|valid|0|
18|Svenska Dagbladet - Frontpage|<https://www.svd.se/?service=rss>|200|03/18/2026|valid|108|
19|The Local Sweden (EN)|<https://feeds.thelocal.com/rss/se>|200|03/18/2026|valid|6|
20|Sveriges Radio - Ekot nyhetssandning (pod)|<https://api.sr.se/api/rss/pod/3795>|200|03/18/2026|valid|6|
21|Sveriges Radio - P3 Nyheter pa en minut (pod)|<https://api.sr.se/api/rss/pod/22376>|200|03/18/2026|valid|3|
22|Sveriges Radio - Radio Sweden pa latt svenska (program)|<https://api.sr.se/api/rss/program/4916?format=1>|200|03/18/2026|valid|3|
23|Radio Sweden - Sweden Today (podcast xml)|<http://sverigesradio.se/Podradio/xml/SRI_en_sweToday.xml>|Recovered via sitemap|03/18/2026|valid|225|
24|Proletaren|<https://proletaren.se/rss.xml>|200|03/18/2026|valid|4|
25|SVT Lokal - Sydnytt|<http://svt.se/nyheter/regionalt/sydnytt/rss.xml>|200|03/18/2026|valid|6|
26|SVT Lokal - Blekingenytt|<http://svt.se/nyheter/regionalt/blekingenytt/rss.xml>|200|03/18/2026|valid|8|
27|SVT Lokal - Mittnytt|<http://svt.se/nyheter/regionalt/mittnytt/rss.xml>|200|03/18/2026|valid|8|
28|SVT Lokal - Jamtlandsnytt|<http://svt.se/nyheter/regionalt/jamtlandsnytt/rss.xml>|200|03/18/2026|valid|4|
29|Sydsvenskan (fallback)|<https://www.sydsvenskan.se/feeds/feed.xml>|200|03/18/2026|valid|86|
30|Nerikes Allehanda (fallback)|<https://www.na.se/feeds/feed.xml>|200|03/18/2026|valid|69|
31|Dagens Industri (Economy #1 Daily)|<https://www.di.se/rss>|200|03/18/2026|valid|9|
32|Expressen Din Ekonomi (Economy)|<https://feeds.expressen.se/din-ekonomi/>|needs check|03/18/2026|needs verification|0|
33|Dagens Nyheter Ekonomi (Economy)|<https://www.dn.se/ekonomi/rss/>|200|03/18/2026|valid|0|
34|Svenska Dagbladet Naringsliv (Business)|<https://www.svd.se/naringsliv/?service=rss>|200|03/18/2026|valid|0|
35|Omni (Swedish News Aggregator)|<https://omni.se/rss>|needs check|03/18/2026|needs verification|0|
36|Ny Teknik (Tech and Engineering)|<https://www.nyteknik.se/rss.xml>|needs check|03/18/2026|needs verification|0|
37|Breakit (Startups and VC)|<https://www.breakit.se/feed/artiklar>|200|03/18/2026|valid|11|
38|Privata Affarer (Personal Finance/Investing)|<https://www.privataaffarer.se/rss.xml>|200|03/18/2026|valid|30|

### Belgium (BE)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|De Morgen|<https://www.demorgen.be/rss.xml>|200|03/18/2026|valid|45|
2|La Libre|<https://www.lalibre.be/arc/outboundfeeds/rss/section/belgique/?outputType=xml>|200|03/18/2026|valid|14|
3|Knack|<https://www.knack.be/feed/>|200|03/18/2026|valid|18|
4|VRT News|<https://www.vrt.be/vrtnws/nl.rss.articles.xml>|200|03/18/2026|valid|102|
5|La Derniere Heure|<https://www.dhnet.be/rss.xml>|200|03/18/2026|valid|71|
6|Le Vif|<https://www.levif.be/feed/>|200|03/18/2026|valid|12|
7|RTBF|<https://rss.rtbf.be/article/rss/highlight_rtbf_info.xml?source=internal>|200|03/18/2026|valid|41|
8|Het Nieuwsblad|<https://www.nieuwsblad.be/rss/>|needs check|03/18/2026|needs verification|0|
9|La Libre Belgique|<https://www.lalibre.be/rss/>|200|03/18/2026|valid|0|
10|La Libre|<https://www.lalibre.be/rss>|200|03/18/2026|valid|14|
11|The Bulletin (EN)|<https://www.thebulletin.be/rss.xml>|200|03/18/2026|valid|4|
12|HLN (Het Laatste Nieuws)|<https://www.hln.be/home/rss.xml>|200|03/18/2026|valid|150|
13|Brussels Morning|<https://brusselsmorning.com/feed>|200|03/18/2026|valid|2|
14|L'Echo|<https://www.lecho.be/rss/top_stories.xml>|200|03/18/2026|valid|0|
15|De Standaard (example section)|<https://www.standaard.be/rss/section/1f2838d4-99ea-49f0-9102-138784c7ea7c>|needs check|03/18/2026|needs verification|0|
16|Het Nieuwsblad (example section)|<https://www.nieuwsblad.be/rss/section/55178e67-15a8-4ddd-a3d8-bfe5708f8932>|needs check|03/18/2026|needs verification|0|
17|Le Soir (main)|<https://www.lesoir.be/rss2/9/cible_principale>|needs check|03/18/2026|needs verification|0|
18|Brussels Times|<https://www.brusselstimes.com/rss-feed>|Recovered via sitemap|03/18/2026|valid|41|
19|City of Brussels (official)|<https://www.brussels.be/rss.xml>|200|03/18/2026|valid|0|
20|Le Soir - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
21|VRT News - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
22|Sudinfo - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
23|La Libre - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
24|DHnet - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
25|L'Avenir - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
26|BX1|<https://bx1.be/feed/>|200|03/18/2026|valid|25|

### Thailand (TH)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|The Thaiger|<https://thethaiger.com/feed>|200|03/18/2026|valid|19|
2|Khaosod English|<https://www.khaosodenglish.com/rss>|403 (HTTP_403)|03/18/2026|invalid|0|
3|Matichon|<https://www.matichon.co.th/rss>|403 (HTTP_403)|03/18/2026|invalid|0|
4|Prachachat|<https://prachachat.net/feed/>|403 (HTTP_403)|03/18/2026|invalid|0|
5|Daily News|<https://www.dailynews.co.th/rss>|200|03/18/2026|valid|0|
6|Prachatai English (Feedburner)|<http://feeds.feedburner.com/prachataienglish>|200|03/18/2026|valid|0|
7|Thai PBS (news feed endpoint)|<https://news.thaipbs.or.th/rss/news>|200|03/18/2026|valid|42|
8|Thairath (News)|<http://www.thairath.co.th/rss/news.xml>|Recovered via sitemap|03/18/2026|valid|0|
9|Thairath (Sport)|<http://www.thairath.co.th/rss/sport.xml>|Recovered via sitemap|03/18/2026|valid|0|
10|Sanook - Hot News|<http://rssfeeds.sanook.com/rss/feeds/sanook/hot.news.xml>|200|03/18/2026|valid|0|
11|Sanook - Daily News|<http://rssfeeds.sanook.com/rss/feeds/sanook/news.index.xml>|200|03/18/2026|valid|39|
12|Sanook - Politics|<http://rssfeeds.sanook.com/rss/feeds/sanook/news.politic.xml>|200|03/18/2026|valid|0|
13|Sanook - Crime|<http://rssfeeds.sanook.com/rss/feeds/sanook/news.crime.xml>|200|03/18/2026|valid|0|
14|Sanook - World|<http://rssfeeds.sanook.com/rss/feeds/sanook/news.world.xml>|200|03/18/2026|valid|1|
15|Sanook - Economy|<http://rssfeeds.sanook.com/rss/feeds/sanook/news.economic.xml>|200|03/18/2026|valid|0|
16|Sanook - Tech (News)|<http://rssfeeds.sanook.com/rss/feeds/sanook/hitech.news.xml>|200|03/18/2026|valid|0|
17|Sanook - Tech (Computer)|<http://rssfeeds.sanook.com/rss/feeds/sanook/hitech.computer.index.xml>|200|03/18/2026|valid|0|
18|Sanook - Tech (Mobile)|<http://rssfeeds.sanook.com/rss/feeds/sanook/hitech.mobile.index.xml>|200|03/18/2026|valid|2|
19|Sanook - Travel|<http://rssfeeds.sanook.com/rss/feeds/sanook/travel.index.xml>|200|03/18/2026|valid|1|
20|Sanook - Movies|<http://rssfeeds.sanook.com/rss/feeds/sanook/movie.news.xml>|200|03/18/2026|valid|2|
21|PressDisplay - Bangkok Post|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=1264>|200|03/18/2026|valid|0|
22|PressDisplay - Daily News Thailand|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=4863>|needs check|03/18/2026|needs verification|0|
23|PressDisplay - Krungthep Turakij|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=5261&type=full>|needs check|03/18/2026|needs verification|0|
24|PressDisplay - The Phuket News|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=eff9&type=full>|200|03/18/2026|valid|0|
25|PressDisplay - Novosti Phuketa|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=9wv3&type=full>|200|03/18/2026|valid|0|
26|PressDisplay - Window On Phuket|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=9wv4&type=full>|needs check|03/18/2026|needs verification|0|
27|PressDisplay - Where to Eat in Phuket|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=9wv5&type=full>|needs check|03/18/2026|needs verification|0|
28|PressDisplay - Prestige (Thailand)|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=9vw7&type=full>|200|03/18/2026|valid|0|
29|PressDisplay - Hello! (Thailand)|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=9vw6&type=full>|200|03/18/2026|valid|0|
30|Khaosod English - Food (category)|<http://www.khaosodenglish.com/category/life/food/feed>|403 (HTTP_403)|03/18/2026|invalid|0|
31|Thairath (Top News)|<https://www.thairath.co.th/rss/news.xml>|needs check|03/18/2026|needs verification|0|
32|Matichon (Leading Political Daily)|<https://www.matichon.co.th/feed>|200|03/18/2026|valid|53|
33|Prachachat (Business/Economy #1)|<https://www.prachachat.net/feed>|200|03/18/2026|valid|43|
34|Khaosod (Popular General News)|<https://www.khaosod.co.th/feed>|200|03/18/2026|valid|88|
35|Sanook News (Top Portal)|<https://rssfeeds.sanook.com/rss/feeds/sanook/news.index.xml>|200|03/18/2026|valid|0|
36|Sanook Economy (Portal Economy)|<https://rssfeeds.sanook.com/rss/feeds/sanook/news.economic.xml>|200|03/18/2026|valid|0|
37|Bangkok Biz News (Economy)|<https://www.bangkokbiznews.com/rss/feed>|Recovered via sitemap|03/18/2026|valid|0|
38|Manager Online (Politics/Society)|<https://mgronline.com/rss>|needs check|03/18/2026|needs verification|0|
39|The Standard (Top Media)|<https://thestandard.co/feed/>|200|03/18/2026|valid|34|
40|Thansettakij|<https://www.thansettakij.com/rss/feed>|Recovered via sitemap|03/18/2026|valid|0|
41|Bangkok Insight|<https://www.thebangkokinsight.com/feed/>|200|03/18/2026|valid|81|
42|Nation TV|<https://www.nationtv.tv/rss/feed>|Recovered via sitemap|03/18/2026|valid|0|
43|Post Today|<https://www.posttoday.com/rss/feed>|Recovered via sitemap|03/18/2026|valid|0|
44|MCOT Economy|<https://tna.mcot.net/category/economy/feed>|needs check|03/18/2026|needs verification|0|
45|Bangkok Post - Top Stories|<https://www.bangkokpost.com/rss/data/topstories.xml>|200|03/18/2026|valid|1|
46|Bangkok Post - Business|<https://www.bangkokpost.com/rss/data/business.xml>|200|03/18/2026|valid|13|
47|Bangkok Post - World|<https://www.bangkokpost.com/rss/data/world.xml>|200|03/18/2026|valid|1|
48|Bangkok Post - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
49|Bangkok Post - Thailand|<https://www.bangkokpost.com/rss/data/thailand.xml>|200|03/18/2026|valid|25|
50|Bangkok Post - Sports|<https://www.bangkokpost.com/rss/data/sports.xml>|200|03/18/2026|valid|4|
51|Bangkok Post - Opinion|<https://www.bangkokpost.com/rss/data/opinion.xml>|200|03/18/2026|valid|3|
52|Bangkok Post - Life|<https://www.bangkokpost.com/rss/data/life.xml>|200|03/18/2026|valid|8|
53|Bangkok Post - Auto|<https://www.bangkokpost.com/rss/data/auto.xml>|200|03/18/2026|valid|0|
54|Matichon - Politics|<https://www.matichon.co.th/politics/feed>|200|03/18/2026|valid|44|
55|Matichon - Economy|<https://www.matichon.co.th/economy/feed>|200|03/18/2026|valid|30|
56|Khaosod - Politics|<https://www.khaosod.co.th/politics/feed>|200|03/18/2026|valid|27|
57|Khaosod - Special Stories|<https://www.khaosod.co.th/special-stories/feed>|200|03/18/2026|valid|7|
58|Matichon - Foreign|<https://www.matichon.co.th/foreign/feed>|200|03/18/2026|valid|17|
59|Matichon - Region|<https://www.matichon.co.th/region/feed>|200|03/18/2026|valid|34|
60|Matichon - Lifestyle|<https://www.matichon.co.th/lifestyle/feed>|200|03/18/2026|valid|6|
61|Khaosod - Economics|<https://www.khaosod.co.th/economics/feed>|200|03/18/2026|valid|19|
62|Khaosod - Breaking News|<https://www.khaosod.co.th/breaking-news/feed>|503 (HTTP_503)|03/18/2026|invalid|14|
63|Khaosod - Around Thailand|<https://www.khaosod.co.th/around-thailand/feed>|200|03/18/2026|valid|46|
64|Khaosod - Sports|<https://www.khaosod.co.th/sports/feed>|503 (HTTP_503)|03/18/2026|invalid|18|
65|Khaosod - Foreign|<https://www.khaosod.co.th/around-the-world-news/feed>|503 (HTTP_503)|03/18/2026|invalid|1|
66|Khaosod - Covid|<https://www.khaosod.co.th/covid-19/feed>|200|03/18/2026|valid|0|
67|Matichon - Sports|<https://www.matichon.co.th/sport/feed>|200|03/18/2026|valid|23|
68|Matichon - Education|<https://www.matichon.co.th/education/feed>|200|03/18/2026|valid|6|
69|Prachachat - Politics|<https://www.prachachat.net/politics/feed>|200|03/18/2026|valid|11|
70|Prachachat - Economy|<https://www.prachachat.net/economy/feed>|200|03/18/2026|valid|10|
71|Prachachat - Finance|<https://www.prachachat.net/finance/feed>|200|03/18/2026|valid|8|
72|Bangkok Post - Learning|<https://www.bangkokpost.com/rss/data/learning.xml>|200|03/18/2026|valid|2|
73|Thairath - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
74|Thairath - Hourly Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
75|Nation TV - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
76|Nation Thailand - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
77|Post Today - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
78|Bangkok Biz News - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
79|PPTVHD36 - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|

### Iran (IR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|IRNA|<https://www.irna.ir/rss>|needs check|03/18/2026|needs verification|0|
2|Mehr News|<https://www.mehrnews.com/rss>|ERR (TIMEOUT)|03/18/2026|invalid|0|
3|ILNA|<https://www.ilna.news/rss>|needs check|03/18/2026|needs verification|0|
4|Khabar Online|<https://www.khabaronline.ir/rss>|ERR (NETWORK)|03/18/2026|invalid|0|
5|Iran International|<https://www.iranintl.com/feed>|200|03/18/2026|valid|53|
6|ILNA|<https://www.ilna.ir/rss>|needs check|03/18/2026|needs verification|0|
7|Tejarat News|<https://www.tejaratnews.com/rss>|needs check|03/18/2026|needs verification|0|
8|Tehran Times - Latest|<https://www.tehrantimes.com/rss>|needs check|03/18/2026|needs verification|0|
9|Tehran Times - Homepage|<https://www.tehrantimes.com/rss-homepage>|needs check|03/18/2026|needs verification|0|
10|Tehran Times - Breaking|<https://www.tehrantimes.com/rss/pl/617>|needs check|03/18/2026|needs verification|0|
11|Tehran Times - Society|<https://www.tehrantimes.com/rss/tp/696>|needs check|03/18/2026|needs verification|0|
12|Tehran Times - Economy|<https://www.tehrantimes.com/rss/tp/697>|needs check|03/18/2026|needs verification|0|
13|Tehran Times - Politics|<https://www.tehrantimes.com/rss/tp/698>|needs check|03/18/2026|needs verification|0|
14|Tehran Times - Sports|<https://www.tehrantimes.com/rss/tp/699>|needs check|03/18/2026|needs verification|0|
15|Tehran Times - Culture|<https://www.tehrantimes.com/rss/tp/700>|needs check|03/18/2026|needs verification|0|
16|Tehran Times - International|<https://www.tehrantimes.com/rss/tp/702>|needs check|03/18/2026|needs verification|0|
17|Tehran Times - Multimedia|<https://www.tehrantimes.com/rss/tp/717>|needs check|03/18/2026|needs verification|0|
18|Tehran Times - Tourism|<https://www.tehrantimes.com/rss/tp/807>|needs check|03/18/2026|needs verification|0|
19|MehrNews (EN) - Latest|<https://en.mehrnews.com/rss/pl/118>|ERR (TIMEOUT)|03/18/2026|invalid|0|
20|MehrNews (EN) - Iran|<https://en.mehrnews.com/rss/tp/575>|ERR (TIMEOUT)|03/18/2026|invalid|0|
21|MehrNews (EN) - Iran > Iran|<https://en.mehrnews.com/rss/tp/905>|ERR (TIMEOUT)|03/18/2026|invalid|0|
22|MehrNews (EN) - Ethnic Groups|<https://en.mehrnews.com/rss/tp/897>|needs check|03/18/2026|needs verification|0|
23|MehrNews (EN) - Nature|<https://en.mehrnews.com/rss/tp/898>|ERR (TIMEOUT)|03/18/2026|invalid|0|
24|MehrNews (EN) - Historical Sites|<https://en.mehrnews.com/rss/tp/899>|needs check|03/18/2026|needs verification|0|
25|MehrNews (EN) - Souvenirs|<https://en.mehrnews.com/rss/tp/900>|needs check|03/18/2026|needs verification|0|
26|MehrNews (EN) - Persian Cuisine|<https://en.mehrnews.com/rss/tp/901>|ERR (TIMEOUT)|03/18/2026|invalid|0|
27|ISNA (EN) - Social|<https://en.isna.ir/rss/tp/8>|needs check|03/18/2026|needs verification|0|
28|ISNA (EN) - Economy|<https://en.isna.ir/rss/tp/33>|needs check|03/18/2026|needs verification|0|
29|ISNA (EN) - Politics|<https://en.isna.ir/rss/tp/13>|needs check|03/18/2026|needs verification|0|
30|ISNA (EN) - Culture & Art|<https://en.isna.ir/rss/tp/19>|needs check|03/18/2026|needs verification|0|
31|ISNA (EN) - Sports|<https://en.isna.ir/rss/tp/23>|needs check|03/18/2026|needs verification|0|
32|ISNA (EN) - Photos|<https://en.isna.ir/rss/tp/27>|needs check|03/18/2026|needs verification|0|
33|Tasnim (EN) - Top Stories|<https://www.tasnimnews.ir/en/rss/feed/0/0/8/1/TopStories>|200|03/18/2026|valid|2|
34|Tasnim (EN) - All Stories|<https://www.tasnimnews.ir/en/rss/feed/0/0/0/0/AllStories>|200|03/18/2026|valid|6|
35|Tasnim (EN) - Politics|<https://www.tasnimnews.ir/en/rss/feeds/1192/0/0/0>|200|03/18/2026|valid|1|
36|Tasnim (EN) - Economy|<https://www.tasnimnews.ir/en/rss/feeds/1193/0/0/0>|needs check|03/18/2026|needs verification|0|
37|Tasnim (EN) - World|<https://www.tasnimnews.ir/en/rss/feeds/1194/0/0/0>|200|03/18/2026|valid|0|

### Argentina (AR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Ambito - Portada|<https://www.ambito.com/rss/pages/home.xml>|200|03/18/2026|valid|6|
2|Ambito - Ultimas noticias|<https://www.ambito.com/rss/pages/ultimas-noticias.xml>|200|03/18/2026|valid|0|
3|Ambito - Economia|<https://www.ambito.com/rss/pages/economia.xml>|200|03/18/2026|valid|13|
4|Ambito - Finanzas|<https://www.ambito.com/rss/pages/finanzas.xml>|200|03/18/2026|valid|0|
5|Ambito - Negocios|<https://www.ambito.com/rss/pages/negocios.xml>|200|03/18/2026|valid|0|
6|Ambito - Politica|<https://www.ambito.com/rss/pages/politica.xml>|200|03/18/2026|valid|5|
7|Ambito - Nacional|<https://www.ambito.com/rss/pages/nacional.xml>|200|03/18/2026|valid|0|
8|Ambito - Mundo|<https://www.ambito.com/rss/pages/mundo.xml>|200|03/18/2026|valid|0|
9|Ambito - Lifestyle|<https://www.ambito.com/rss/pages/lifestyle.xml>|200|03/18/2026|valid|4|
10|Ambito - Deportes|<https://www.ambito.com/rss/pages/deportes.xml>|200|03/18/2026|valid|9|
11|Ambito - Tecnologia|<https://www.ambito.com/rss/pages/tecnologia.xml>|200|03/18/2026|valid|0|
12|Ambito - Autos|<https://www.ambito.com/rss/pages/autos.xml>|200|03/18/2026|valid|4|
13|Ambito - Edicion impresa|<https://www.ambito.com/rss/pages/edicion-impresa.xml>|200|03/18/2026|valid|94|
14|Pagina/12 - Portada|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/portada>|200|03/18/2026|valid|9|
15|Pagina/12 - Edicion impresa|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/edicion-impresa>|200|03/18/2026|valid|15|
16|Pagina/12 - El Pais|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/el-pais/notas>|200|03/18/2026|valid|7|
17|Pagina/12 - Economia|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/economia/notas>|200|03/18/2026|valid|10|
18|Pagina/12 - Sociedad|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/sociedad/notas>|200|03/18/2026|valid|11|
19|Pagina/12 - El Mundo|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/el-mundo/notas>|200|03/18/2026|valid|9|
20|Pagina/12 - Deportes|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/deportes/notas>|200|03/18/2026|valid|13|
21|Pagina/12 - Ciencia|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/ciencia/notas>|200|03/18/2026|valid|0|
22|Pagina/12 - Psicologia|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/psicologia/notas>|200|03/18/2026|valid|0|
23|Pagina/12 - Cartas de Lectores|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/cartas-de-lectores/notas>|needs check|03/18/2026|needs verification|0|
24|Pagina/12 - Cash|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/suplementos/cash/notas>|200|03/18/2026|valid|0|
25|Pagina/12 - Las 12|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/suplementos/las12/notas>|200|03/18/2026|valid|1|
26|Pagina/12 - Radar|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/suplementos/radar/notas>|200|03/18/2026|valid|0|
27|Pagina/12 - Turismo|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/suplementos/turismo/notas>|needs check|03/18/2026|needs verification|0|
28|LA NACION - General|<https://www.lanacion.com.ar/arc/outboundfeeds/rss/?outputType=xml>|200|03/18/2026|valid|69|
29|El Cronista - Noticias|<https://www.cronista.com/files/rss/news.xml>|200|03/18/2026|valid|388|
30|Clarín - Ultimo Momento|<https://www.clarin.com/rss/lo-ultimo/>|200|03/18/2026|valid|522|
31|Clarin - Economia|<https://www.clarin.com/rss/economia/>|200|03/18/2026|valid|24|
32|Clarin - Politica|<https://www.clarin.com/rss/politica/>|200|03/18/2026|valid|24|
33|La Nacion - Economia|<https://www.lanacion.com.ar/arc/outboundfeeds/rss/?outputType=xml&rotation=economia>|200|03/18/2026|valid|0|
34|La Nacion - Politica|<https://www.lanacion.com.ar/arc/outboundfeeds/rss/?outputType=xml&rotation=politica>|200|03/18/2026|valid|0|
35|Infobae|<https://www.infobae.com/arc/outboundfeeds/rss/?outputType=xml>|200|03/18/2026|valid|1364|
36|Infobae - Economia|<https://www.infobae.com/feeds/rss/economia/>|needs check|03/18/2026|needs verification|0|
37|El Cronista - Finanzas|<https://www.cronista.com/files/rss/finanzas_markets.xml>|needs check|03/18/2026|needs verification|0|
38|El Cronista - Economia|<https://www.cronista.com/files/rss/economia_politica.xml>|needs check|03/18/2026|needs verification|0|
39|Rosario3 - Home|<https://www.rosario3.com/rss/feed.xml>|200|03/18/2026|valid|54|
40|TN|<https://tn.com.ar/rss.xml>|200|03/18/2026|valid|275|
41|La Nacion|<https://www.lanacion.com.ar/arc/outboundfeeds/rss/>|200|03/18/2026|valid|300|
42|Cronica|<https://www.cronica.com.ar/feed/>|403 (HTTP_403)|03/18/2026|invalid|0|
43|El Economista|<https://eleconomista.com.ar/feed/>|200|03/18/2026|valid|23|
44|BAE Negocios|<https://www.baenegocios.com/feed/>|403 (HTTP_403)|03/18/2026|invalid|0|
45|Perfil|<https://www.perfil.com/feed/>|200|03/18/2026|valid|132|
46|Buenos Aires Times|<https://www.batimes.com.ar/feed>|200|03/18/2026|valid|3|
47|El Tribuno|<https://www.eltribuno.com/feed/>|200|03/18/2026|valid|50|
48|Diario Registrado|<https://www.diarioregistrado.com/rss.xml>|200|03/18/2026|valid|24|
49|Rio Negro|<https://www.rionegro.com.ar/feed/>|200|03/18/2026|valid|127|
50|Econojournal|<https://econojournal.com.ar/feed/>|200|03/18/2026|valid|8|
51|TecnoGeek|<https://tecnogeek.com/feed/>|200|03/18/2026|valid|2|
52|La Gaceta Tucuman|<https://www.lagaceta.com.ar/rss>|200|03/18/2026|valid|127|
53|MercoPress|<https://en.mercopress.com/rss>|200|03/18/2026|valid|5|
54|Chequeado|<https://chequeado.com/feed/>|200|03/18/2026|valid|0|
55|Ole|<https://www.ole.com.ar/rss/ultimas-noticias/>|200|03/18/2026|valid|197|
56|Border Periodismo|<https://borderperiodismo.com/feed/>|200|03/18/2026|valid|29|
57|Data Diario|<https://datadiario.com/feed/>|200|03/18/2026|valid|32|
58|Primera Edicion|<https://www.primeraedicion.com.ar/feed/>|200|03/18/2026|valid|67|
59|Surtidores|<https://surtidores.com.ar/feed/>|200|03/18/2026|valid|6|
60|Jujuy al Dia|<https://www.jujuyaldia.com.ar/feed/>|200|03/18/2026|valid|48|
61|El Diario Parana|<https://www.eldiario.com.ar/rss>|200|03/18/2026|valid|5|
62|El Inversor Energetico|<https://elinversorenergetico.com/feed/>|200|03/18/2026|valid|4|
63|Misiones Online|<https://misionesonline.net/feed/>|200|03/18/2026|valid|94|
64|Clarin - Mundo|<https://www.clarin.com/rss/mundo/>|200|03/18/2026|valid|18|
65|Pagina/12 - Cultura|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/cultura-y-espectaculos/notas>|200|03/18/2026|valid|8|
66|MDZ Online - Ultimas noticias|<https://www.mdzol.com/rss/pages/noticias.xml>|200|03/18/2026|valid|82|
67|MDZ Online - Ultimas noticias Argentina|<https://www.mdzol.com/rss/pages/ultimas-noticias-argentina.xml>|200|03/18/2026|valid|16|
68|MDZ Online - Ultimas noticias Mendoza|<https://www.mdzol.com/rss/pages/ultimas-noticias-mendoza.xml>|200|03/18/2026|valid|7|
69|MDZ Online - Deportes|<https://www.mdzol.com/rss/pages/deportes.xml>|200|03/18/2026|valid|22|
70|MDZ Online - Economia|<https://www.mdzol.com/rss/pages/dinero.xml>|200|03/18/2026|valid|18|
71|MDZ Online - Mundo|<https://www.mdzol.com/rss/pages/mundo.xml>|200|03/18/2026|valid|12|
72|MDZ Online - Policiales|<https://www.mdzol.com/rss/pages/policiales.xml>|200|03/18/2026|valid|19|
73|MDZ Online - Politica|<https://www.mdzol.com/rss/pages/politica.xml>|200|03/18/2026|valid|34|
74|MDZ Online - Sociedad|<https://www.mdzol.com/rss/pages/sociedad.xml>|200|03/18/2026|valid|29|
75|MDZ Online - Tecnologia|<https://www.mdzol.com/rss/pages/tecnologia.xml>|200|03/18/2026|valid|0|
76|La Opinion Rafaela|<https://www.laopinion.com.ar/rss>|200|03/18/2026|valid|14|
77|C5N - Home|<https://www.c5n.com/rss/pages/home.xml>|200|03/18/2026|valid|29|
78|C5N - Politica|<https://www.c5n.com/rss/pages/politica.xml>|200|03/18/2026|valid|2|
79|C5N - Economia|<https://www.c5n.com/rss/pages/economia.xml>|200|03/18/2026|valid|16|
80|C5N - Sociedad|<https://www.c5n.com/rss/pages/sociedad.xml>|200|03/18/2026|valid|9|
81|C5N - Enfoque|<https://www.c5n.com/rss/pages/enfoque.xml>|200|03/18/2026|valid|0|
82|C5N - Deportes|<https://www.c5n.com/rss/pages/deportes.xml>|200|03/18/2026|valid|9|
83|C5N - Autos|<https://www.c5n.com/rss/pages/autos.xml>|200|03/18/2026|valid|1|
84|C5N - Mundo|<https://www.c5n.com/rss/pages/mundo.xml>|200|03/18/2026|valid|0|
85|C5N - Ultimas noticias|<https://www.c5n.com/rss/pages/ultimas-noticias.xml>|200|03/18/2026|valid|6|
86|C5N - Tecnologia|<https://www.c5n.com/rss/pages/tecnologia.xml>|200|03/18/2026|valid|1|
87|C5N - RatingCero|<https://www.c5n.com/rss/pages/ratingcero.xml>|200|03/18/2026|valid|14|
88|C5N - Astrologia|<https://www.c5n.com/rss/pages/astrologia.xml>|200|03/18/2026|valid|1|
89|C5N - Lifestyle|<https://www.c5n.com/rss/pages/lifestyle.xml>|200|03/18/2026|valid|5|
90|A24|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
91|Canal 26|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
92|La Voz|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
93|Los Andes|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
94|La Capital|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
95|Minutouno|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
96|Urgente24|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
97|El Destape Web|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
98|TyC Sports|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|

### Chile (CL)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Diario Financiero|<https://www.df.cl/noticias/site/list/port/rss.xml>|200|03/18/2026|valid|50|
2|The Clinic|<https://www.theclinic.cl/feed/>|200|03/18/2026|valid|39|
3|El Rancaguino|<https://www.elrancaguino.cl/feed/>|200|03/18/2026|valid|24|
4|Cambio21|<https://cambio21.cl/rss>|200|03/18/2026|valid|14|
5|La Discusion|<https://ladiscusion.cl/feed/>|200|03/18/2026|valid|28|
6|La Nacion (Chile)|<https://www.lanacion.cl/feed>|200|03/18/2026|valid|30|
7|El Siglo|<https://elsiglo.cl/feed>|200|03/18/2026|valid|4|
8|The Santiago Times|<https://santiagotimes.cl/feed>|ERR (TIMEOUT)|03/18/2026|invalid|0|
9|Infoweek|<https://infoweek.biz/feed>|needs check|03/18/2026|needs verification|0|
10|El Desconcierto|<https://eldesconcierto.cl/feeds/rss.xml>|200|03/18/2026|valid|29|
11|La Prensa Austral|<https://laprensaaustral.cl/feed/>|200|03/18/2026|valid|22|
12|CIPER Chile|<https://www.ciperchile.cl/feed/>|200|03/18/2026|valid|23|
13|Radio Universidad de Chile|<https://radio.uchile.cl/feed/>|200|03/18/2026|valid|18|
14|La Tercera - Home|<https://www.latercera.com/arc/outboundfeeds/rss/?outputType=xml>|200|03/18/2026|valid|176|
15|Pulso (La Tercera Biz)|<https://www.latercera.com/arc/outboundfeeds/rss/?outputType=xml&rotation=pulso>|200|03/18/2026|valid|0|
16|Emol - Nacional|<https://www.emol.com/rss/rss_nacional.xml>|needs check|03/18/2026|needs verification|0|
17|Emol - Economia|<https://www.emol.com/rss/rss_economia.xml>|needs check|03/18/2026|needs verification|0|
18|BioBioChile - Home|<https://feeds.feedburner.com/radiobiobio/NNeJ>|200|03/18/2026|valid|113|
19|Cooperativa - Economia|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_5___1.xml>|200|03/18/2026|valid|0|
20|Cooperativa - Pais|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_3___1.xml>|200|03/18/2026|valid|4|
21|Cooperativa - País|<https://m.cooperativa.cl/noticias/site/tax/port/all/rss_3___1.xml>|200|03/18/2026|valid|0|
22|Cooperativa - Deportes|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_1___24.xml>|200|03/18/2026|valid|30|
23|Cooperativa - Deportes|<https://m.cooperativa.cl/noticias/site/tax/port/all/rss_1___24.xml>|200|03/18/2026|valid|0|
24|Cooperativa - Cine|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_4_4__1.xml>|200|03/18/2026|valid|1|
25|Cooperativa - Musica|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_4_11__1.xml>|200|03/18/2026|valid|1|
26|Cooperativa - Banco Central|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_6_82__1.xml>|200|03/18/2026|valid|0|
27|Cooperativa - Banco Central|<https://m.cooperativa.cl/noticias/site/tax/port/all/rss_6_82__1.xml>|200|03/18/2026|valid|0|
28|Cooperativa - Banco Central|<https://m.cooperativa.cl/noticias/site/tax/port/fid_noticia/rss_6_82__1.xml>|200|03/18/2026|valid|0|
29|Cooperativa - Banco Central|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_6_82__1.xml>|200|03/18/2026|valid|0|
30|Cooperativa - Futbol|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_1_30__1.xml>|200|03/18/2026|valid|29|
31|Cooperativa - Universidad de Chile|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_1_30_332_1.xml>|200|03/18/2026|valid|0|
32|Cooperativa - Copa Davis|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_1_58_534_1.xml>|200|03/18/2026|valid|0|
33|Cooperativa - Sociedad|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_7_136__1.xml>|200|03/18/2026|valid|0|
34|Cooperativa - Genetica (Sociedad)|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_7_221_1735_1.xml>|200|03/18/2026|valid|0|
35|Cooperativa - Genetica (88frases)|<https://88frases.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_7_221_1735_1.xml>|200|03/18/2026|valid|0|
36|Cooperativa - Oftalmologia (Sociedad)|<https://88frases.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_7_120_1804_1.xml>|200|03/18/2026|valid|0|
37|Cooperativa - Donald Trump|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_2_76_2384_1.xml>|200|03/18/2026|valid|1|
38|Cooperativa - Argentina|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_2_70__1.xml>|200|03/18/2026|valid|0|
39|Cooperativa - Musica Chilena|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_4_11_779_1.xml>|200|03/18/2026|valid|0|
40|Cooperativa - Cine|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_4_4__1.xml>|200|03/18/2026|valid|0|
41|Cooperativa - Música|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_4_11__1.xml>|200|03/18/2026|valid|0|
42|Cooperativa - Venezuela|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_3_81_1474_1.xml>|200|03/18/2026|valid|0|
43|Reporte Minero|<https://www.reporteminero.cl/feed>|needs check|03/18/2026|needs verification|0|
44|Diario Concepcion|<https://www.diarioconcepcion.cl/feed>|needs check|03/18/2026|needs verification|0|
45|Pauta|<https://www.pauta.cl/feed>|Recovered via sitemap|03/18/2026|valid|39|
46|El Pinguino|<https://elpinguino.com/feed/>|200|03/18/2026|valid|27|
47|Fast Check CL|<https://www.fastcheck.cl/feed/>|200|03/18/2026|valid|2|
48|Diario El Centro|<https://www.diarioelcentro.cl/feed/>|200|03/18/2026|valid|11|
49|Ex-Ante|<https://www.ex-ante.cl/feed/>|200|03/18/2026|valid|9|
50|El Ciudadano|<https://www.elciudadano.com/feed/>|200|03/18/2026|valid|35|
51|El Insular|<https://www.elinsular.cl/feed/>|200|03/18/2026|valid|10|
52|Interferencia|<https://interferencia.cl/rss.xml>|200|03/18/2026|valid|3|
53|Diario Constitucional|<https://www.diarioconstitucional.cl/feed/>|200|03/18/2026|valid|5|
54|Concierto|<https://www.concierto.cl/feed/>|200|03/18/2026|valid|28|
55|Futuro|<https://www.futuro.cl/feed/>|200|03/18/2026|valid|21|
56|Rock&Pop|<https://www.rockandpop.cl/feed/>|200|03/18/2026|valid|26|
57|Diario Talca|<https://www.diariotalca.cl/feed/>|200|03/18/2026|valid|5|
58|Publimetro Chile - Home|<https://www.publimetro.cl/arc/outboundfeeds/rss/>|200|03/18/2026|valid|34|
59|Cooperativa - Portada|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss____1.xml>|200|03/18/2026|valid|87|
60|Cooperativa - Google News RSS|<https://www.cooperativa.cl/noticias/google_news_rss.xml>|200|03/18/2026|valid|0|
61|ADN Radio - Portada|<https://www.adnradio.cl/arc/outboundfeeds/rss/?outputType=xml>|200|03/18/2026|valid|150|
62|La Cuarta|<https://www.lacuarta.com/arc/outboundfeeds/rss/?outputType=xml>|200|03/18/2026|valid|79|
63|Radio Agricultura|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
64|Meganoticias|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
65|CNN Chile|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
66|El Mostrador|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
67|El Dinamo|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
68|Chilevision Noticias|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|

### Dominican Republic (DO)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Diario Libre - Portada|<https://www.diariolibre.com/rss/portada.xml>|200|03/18/2026|valid|93|
2|Diario Libre - Actualidad|<https://www.diariolibre.com/rss/actualidad.xml>|200|03/18/2026|valid|10|
3|Diario Libre - Politica|<https://www.diariolibre.com/rss/politica.xml>|200|03/18/2026|valid|4|
4|Diario Libre - Economia|<https://www.diariolibre.com/rss/economia.xml>|200|03/18/2026|valid|8|
5|Diario Libre - Opinion|<https://www.diariolibre.com/rss/opinion.xml>|200|03/18/2026|valid|9|
6|Diario Libre - Deportes|<https://www.diariolibre.com/rss/deportes.xml>|200|03/18/2026|valid|2|
7|Diario Libre - Mundo|<https://www.diariolibre.com/rss/mundo.xml>|200|03/18/2026|valid|6|
8|Diario Libre - Videos|<https://www.diariolibre.com/rss/videos.xml>|200|03/18/2026|valid|0|
9|Diario Libre - Edicion USA|<https://www.diariolibre.com/rss/dl-usa.xml>|200|03/18/2026|valid|3|
10|AlMomento - Portada|<https://almomento.net/feed/>|200|03/18/2026|valid|20|
11|AlMomento - Politica|<https://almomento.net/categoria/politica/feed/>|200|03/18/2026|valid|4|
12|AlMomento - Deportes|<https://almomento.net/categoria/deportes/feed/>|200|03/18/2026|valid|5|
13|AlMomento - Economicas|<https://almomento.net/categoria/economicas/feed/>|200|03/18/2026|valid|3|
14|AlMomento - Dominicanos en el Exterior|<https://almomento.net/categoria/dominicanos-en-el-exterior/feed/>|needs check|03/18/2026|needs verification|0|
15|AlMomento - Internacionales|<https://almomento.net/categoria/internacionales/feed/>|200|03/18/2026|valid|3|
16|AlMomento - Variedades|<https://almomento.net/categoria/variedades/feed/>|200|03/18/2026|valid|0|
17|AlMomento - Opinion|<https://almomento.net/categoria/opinion/feed/>|200|03/18/2026|valid|6|
18|AlMomento - Haiti|<https://almomento.net/categoria/haiti/feed/>|200|03/18/2026|valid|2|
19|AlMomento - Provincias|<https://almomento.net/categoria/provincias/feed/>|200|03/18/2026|valid|0|
20|El Nacional|<https://elnacional.com.do/feed/>|200|03/18/2026|valid|47|
21|El Nuevo Diario|<https://elnuevodiario.com.do/feed/>|200|03/18/2026|valid|238|
22|Listin Diario - Portada|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
23|Listin Diario - Economia|<https://listindiario.com/rss/economia.xml>|200|03/18/2026|valid|6|
24|Periodico Hoy|<https://hoy.com.do/rss/home.xml>|200|03/18/2026|valid|116|
25|El Dinero|<https://eldinero.com.do/feed/>|200|03/18/2026|valid|34|
26|Acento|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
27|Acento - Author Feed|<https://acento.com.do/author/jcastillo/feed/>|Recovered via sitemap|03/18/2026|valid|0|
28|Noticias SIN|<https://noticiassin.com/feed/>|200|03/18/2026|valid|81|
29|Diario Libre - Revista|<https://www.diariolibre.com/rss/revista.xml>|200|03/18/2026|valid|4|
30|El Dia|<https://eldia.com.do/feed/>|200|03/18/2026|valid|110|
31|N Digital|<https://n.com.do/feed/>|200|03/18/2026|valid|69|
32|Z101 Digital|<https://www.z101digital.com/feed/>|ERR (TIMEOUT)|03/18/2026|invalid|18|
33|Z101 Digital - Nacionales|<https://z101digital.com/category/nacionales/feed/>|200|03/18/2026|valid|0|
34|El Caribe|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
35|Teleuniverso|<https://teleuniversotv.com/feed/>|200|03/18/2026|valid|10|
36|Remolacha|<https://remolacha.net/feed/>|200|03/18/2026|valid|97|
37|De Ultimo Minuto|<https://deultimominuto.net/feed/>|200|03/18/2026|valid|103|
38|De Ultimo Minuto - Nacionales|<https://deultimominuto.net/category/nacionales/feed/>|200|03/18/2026|valid|8|
39|De Ultimo Minuto - Internacionales|<https://deultimominuto.net/category/internacionales/feed/>|200|03/18/2026|valid|2|
40|De Ultimo Minuto - Deportes|<https://deultimominuto.net/category/deportes/feed/>|200|03/18/2026|valid|4|
41|De Ultimo Minuto - Entretenimiento|<https://deultimominuto.net/category/entretenimiento/feed/>|200|03/18/2026|valid|3|
42|De Ultimo Minuto - Economia|<https://deultimominuto.net/category/economia/feed/>|200|03/18/2026|valid|0|
43|Telenoticias|<https://telenoticias.com.do/feed/>|200|03/18/2026|valid|30|
44|EnSegundos|<https://ensegundos.do/feed/>|200|03/18/2026|valid|23|

### Uruguay (UY)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|El Observador - Home|<https://www.elobservador.com.uy/rss/pages/home.xml>|200|03/18/2026|valid|31|
2|El Observador - Ultimo momento|<https://www.elobservador.com.uy/rss/pages/ultimo-momento.xml>|200|03/18/2026|valid|10|
3|El Observador - Mundo|<https://www.elobservador.com.uy/rss/pages/Mundo.xml>|200|03/18/2026|valid|0|
4|El Observador - Nacional|<https://www.elobservador.com.uy/rss/pages/nacional.xml>|200|03/18/2026|valid|18|
5|El Observador - Sociales|<https://www.elobservador.com.uy/rss/pages/sociales.xml>|200|03/18/2026|valid|0|
6|El Observador - Cafe y Negocios|<https://www.elobservador.com.uy/rss/pages/cafe-y-negocios.xml>|200|03/18/2026|valid|3|
7|El Observador - Agro|<https://www.elobservador.com.uy/rss/pages/Agro.xml>|200|03/18/2026|valid|3|
8|El Observador - Economia y Empresas|<https://www.elobservador.com.uy/rss/pages/economia.xml>|200|03/18/2026|valid|4|
9|El Observador - Opinion|<https://www.elobservador.com.uy/rss/pages/opinion.xml>|200|03/18/2026|valid|0|
10|El Observador - Salud|<https://www.elobservador.com.uy/rss/pages/salud.xml>|200|03/18/2026|valid|0|
11|El Observador - Ciencia y Tecnologia|<https://www.elobservador.com.uy/rss/pages/ciencia-y-tecnologia.xml>|200|03/18/2026|valid|0|
12|El Observador - Cultura y Espectaculos|<https://www.elobservador.com.uy/rss/pages/cultura-y-espectaculos.xml>|200|03/18/2026|valid|1|
13|El Observador - Ediciones especiales|<https://www.elobservador.com.uy/rss/pages/ediciones-especiales.xml>|200|03/18/2026|valid|0|
14|El Observador - Referi|<https://www.elobservador.com.uy/rss/pages/referi.xml>|200|03/18/2026|valid|4|
15|El Observador - Running|<https://www.elobservador.com.uy/rss/pages/running.xml>|200|03/18/2026|valid|0|
16|El Observador - Seleccion|<https://www.elobservador.com.uy/rss/pages/seleccion.xml>|200|03/18/2026|valid|1|
17|El Observador - Rugby|<https://www.elobservador.com.uy/rss/pages/rugby.xml>|200|03/18/2026|valid|0|
18|El Observador - Polideportivo|<https://www.elobservador.com.uy/rss/pages/polideportivo.xml>|200|03/18/2026|valid|0|
19|El Observador - Basquetbol|<https://www.elobservador.com.uy/rss/pages/basquetbol.xml>|200|03/18/2026|valid|1|
20|El Observador - Copa America|<https://www.elobservador.com.uy/rss/pages/copa-america-odl.xml>|200|03/18/2026|valid|0|
21|El Observador - Motor|<https://www.elobservador.com.uy/rss/pages/motor.xml>|200|03/18/2026|valid|0|
22|El Observador - Futbol internacional|<https://www.elobservador.com.uy/rss/pages/futbol-internacional.xml>|200|03/18/2026|valid|6|
23|El Observador - Futbol|<https://www.elobservador.com.uy/rss/pages/futbol.xml>|200|03/18/2026|valid|7|
24|El Observador - Copa Libertadores|<https://www.elobservador.com.uy/rss/pages/copa-libertadores.xml>|200|03/18/2026|valid|0|
25|Montevideo Portal - Informacion destacada|<https://www.montevideo.com.uy/anxml.aspx?58>|200|03/18/2026|valid|47|
26|Montevideo Portal - Noticias|<https://www.montevideo.com.uy/anxml.aspx?59>|200|03/18/2026|valid|20|
27|Montevideo Portal - Tiempo Libre|<https://www.montevideo.com.uy/anxml.aspx?60>|200|03/18/2026|valid|0|
28|Montevideo Portal - Tecnologia|<https://www.montevideo.com.uy/anxml.aspx?133>|200|03/18/2026|valid|4|
29|Montevideo Portal - Negocios & Tendencias|<https://www.montevideo.com.uy/anxml.aspx?728>|200|03/18/2026|valid|0|
30|Montevideo Portal - Deportes|<https://www.montevideo.com.uy/anxml.aspx?1727>|200|03/18/2026|valid|22|
31|El Pais - Portada|<https://www.elpais.com.uy/rss>|200|03/18/2026|valid|140|
32|El Pais - Economia|<https://www.elpais.com.uy/rss/economia-y-mercado>|200|03/18/2026|valid|1|
33|Montevideo Portal - Negocios|<https://www.montevideo.com.uy/anxml.aspx?728>|200|03/18/2026|valid|3|
34|La Diaria - Politica|<https://ladiaria.com.uy/feeds/section/politica/>|needs check|03/18/2026|needs verification|0|
35|La Diaria - Economia|<https://ladiaria.com.uy/feeds/section/economia/>|needs check|03/18/2026|needs verification|0|
36|Subrayado - Home|<https://www.subrayado.com.uy/rss/pages/home.xml>|200|03/18/2026|valid|21|
37|Subrayado - Sociedad|<https://www.subrayado.com.uy/rss/pages/sociedad.xml>|200|03/18/2026|valid|6|
38|Subrayado - Nacional|<https://www.subrayado.com.uy/rss/pages/nacional.xml>|200|03/18/2026|valid|0|
39|Subrayado - Politica|<https://www.subrayado.com.uy/rss/pages/politica.xml>|200|03/18/2026|valid|6|
40|Subrayado - Policiales|<https://www.subrayado.com.uy/rss/pages/policiales.xml>|200|03/18/2026|valid|9|
41|Subrayado - Internacionales|<https://www.subrayado.com.uy/rss/pages/internacionales.xml>|200|03/18/2026|valid|0|
42|Subrayado - Opinion|<https://www.subrayado.com.uy/rss/pages/opinion.xml>|200|03/18/2026|valid|0|
43|Subrayado - Tecnologia e Internet|<https://www.subrayado.com.uy/rss/pages/tecnologia-internet.xml>|200|03/18/2026|valid|0|
44|Subrayado - Deportes|<https://www.subrayado.com.uy/rss/pages/deportes.xml>|200|03/18/2026|valid|2|
45|Subrayado - Economia|<https://www.subrayado.com.uy/rss/pages/economia.xml>|200|03/18/2026|valid|1|
46|Subrayado|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
47|Teledoce|<https://www.teledoce.com/feed/>|200|03/18/2026|valid|53|
48|La Diaria - Home|<https://ladiaria.com.uy/feeds/articulos/>|200|03/18/2026|valid|43|
49|La Republica|<https://www.republica.com.uy/feed/>|needs check|03/18/2026|needs verification|0|
50|Caras y Caretas - Home|<https://www.carasycaretas.com.uy/rss/pages/home.xml>|200|03/18/2026|valid|33|
51|Telenoche|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
52|El Pais Uruguay|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
53|970 Universal|<https://970universal.com/feed/>|200|03/18/2026|valid|2|
54|El Telegrafo|<https://www.eltelegrafo.com/feed/>|200|03/18/2026|valid|0|
55|Carmelo Portal|<https://www.carmeloportal.com/feed>|200|03/18/2026|valid|13|
56|San Jose Ahora|<https://sanjoseahora.com.uy/feed/>|200|03/18/2026|valid|15|
57|Sarandi 690|<https://www.sarandi690.com.uy/feed/>|200|03/18/2026|valid|8|
58|El Popular|<https://elpopular.uy/feed/>|200|03/18/2026|valid|5|
59|Grupo R Multimedio|<https://grupormultimedio.com/feed/>|200|03/18/2026|valid|41|
60|El Observador Uruguay - Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|

### Austria (AT)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Der Standard|<https://www.derstandard.at/rss>|200|03/18/2026|valid|114|
2|ORF|<https://rss.orf.at/news.xml>|200|03/18/2026|valid|27|
3|Die Presse|<https://www.diepresse.com/rss>|200|03/18/2026|valid|69|
4|Tiroler Tageszeitung|<https://www.tt.com/rss/news.xml>|200|03/18/2026|valid|73|
5|ORF Aktuell|<https://rss.orf.at/>|needs check|03/18/2026|needs verification|0|
6|Kurier (Top News)|<https://kurier.at/xml/rssd>|200|03/18/2026|valid|17|
7|Neue Donau|<https://www.neue.at/feed>|200|03/18/2026|valid|19|
8|Der Standard|<https://www.derstandard.at/rss?section=welt>|200|03/18/2026|valid|114|
9|Kleine Zeitung|<https://www.kleinezeitung.at/rss/home>|200|03/18/2026|valid|160|
10|Der Standard|<https://www.derstandard.at/rss?output=amp>|200|03/18/2026|valid|114|
11|Der Standard Plus|<https://www.derstandard.at/rss/wirtschaft>|200|03/18/2026|valid|0|
12|derStandard - International|<https://www.derstandard.at/rss/international>|200|03/18/2026|valid|0|
13|derStandard - Inland|<https://www.derstandard.at/rss/inland>|200|03/18/2026|valid|1|
14|derStandard - Web|<https://www.derstandard.at/rss/web>|200|03/18/2026|valid|0|
15|derStandard - Sport|<https://www.derstandard.at/rss/sport>|200|03/18/2026|valid|0|
16|derStandard - Panorama|<https://www.derstandard.at/rss/panorama>|200|03/18/2026|valid|1|
17|derStandard - Etat|<https://www.derstandard.at/rss/etat>|200|03/18/2026|valid|1|
18|derStandard - Kultur|<https://www.derstandard.at/rss/kultur>|200|03/18/2026|valid|0|
19|derStandard - Wissenschaft|<https://www.derstandard.at/rss/wissenschaft>|200|03/18/2026|valid|0|
20|derStandard - Gesundheit|<https://www.derstandard.at/rss/gesundheit>|200|03/18/2026|valid|0|
21|derStandard - Lifestyle|<https://www.derstandard.at/rss/lifestyle>|200|03/18/2026|valid|0|
22|derStandard - Karriere|<https://www.derstandard.at/rss/karriere>|200|03/18/2026|valid|0|
23|derStandard - Immobilien|<https://www.derstandard.at/rss/immobilien>|200|03/18/2026|valid|0|
24|derStandard - Diskurs|<https://www.derstandard.at/rss/diskurs>|200|03/18/2026|valid|3|
25|derStandard - dieStandard.at|<https://www.derstandard.at/rss/diestandard>|200|03/18/2026|valid|0|
26|derStandard - Live|<https://www.derstandard.at/rss/live>|200|03/18/2026|valid|0|
27|derStandard - Video|<https://www.derstandard.at/rss/video>|200|03/18/2026|valid|0|
28|derStandard - Podcast|<https://www.derstandard.at/rss/podcast>|200|03/18/2026|valid|0|
29|derStandard - Recht|<https://www.derstandard.at/rss/recht>|200|03/18/2026|valid|0|
30|ORF Wien (Vienna Local/Business)|<https://rss.orf.at/wien.xml>|200|03/18/2026|valid|11|
31|Die Presse (Political Headlines)|<https://www.diepresse.com/rss/Home>|needs check|03/18/2026|needs verification|0|
32|Die Presse (Economy)|<https://www.diepresse.com/rss/Wirtschaft>|200|03/18/2026|valid|0|
33|Die Presse - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
34|Kurier (Top Daily)|<https://kurier.at/xml/rss>|200|03/18/2026|valid|113|
35|Finanzen.at (Stocks/Finance)|<https://www.finanzen.at/rss/news>|403 (HTTP_403)|03/18/2026|invalid|0|
36|Trend.at (Business Magazine)|<https://www.trend.at/xml/rss>|needs check|03/18/2026|needs verification|0|
37|Kronen Zeitung|<https://www.krone.at/rss.xml>|Recovered via sitemap|03/18/2026|valid|226|
38|Heute|<https://www.heute.at/rss/news>|needs check|03/18/2026|needs verification|0|
39|OE24|<https://www.oe24.at/news/rss>|Recovered via sitemap|03/18/2026|valid|141|
40|OR Nachrichten|<https://www.nachrichten.at/news/rss.xml>|Recovered via sitemap|03/18/2026|valid|87|
41|Vienna Online|<https://www.vienna.at/news/feed>|Recovered via sitemap|03/18/2026|valid|28|
42|Salzburger Nachrichten - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|

### Norway (NO)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|NRK|<https://www.nrk.no/toppsaker.rss>|200|03/18/2026|valid|28|
2|NRK News|<https://www.nrk.no/nyheter/siste.rss>|200|03/18/2026|valid|37|
3|TV2|<https://www.tv2.no/rss/toppsaker.xml>|needs check|03/18/2026|needs verification|16|
4|E24|<https://e24.no/rss>|200|03/18/2026|valid|16|
5|Dagbladet|<https://www.dagbladet.no/rss/nyheter>|200|03/18/2026|valid|53|
6|TV2|<https://www.tv2.no/rss/nyheter/>|200|03/18/2026|valid|16|
7|E24|<https://e24.no/rss/okonomi.xml>|200|03/18/2026|valid|16|
8|TV2|<https://www.tv2.no/rss/politikk.xml>|needs check|03/18/2026|needs verification|16|
9|E24|<https://e24.no/rss/nyheter.xml>|200|03/18/2026|valid|16|
10|VG - Forsiden|<https://www.vg.no/rss/feed/forsiden/>|Recovered via sitemap|03/18/2026|valid|31|
11|VG - Innenriks|<https://www.vg.no/rss/feed/?categories=1069>|200|03/18/2026|valid|0|
12|VG - Utenriks|<https://www.vg.no/rss/feed/?categories=1070>|200|03/18/2026|valid|0|
13|E24 - Brs og finans|<https://e24.no/rss2/?seksjon=boers-og-finans>|200|03/18/2026|valid|2|
14|E24 - Aksjetips|<http://e24.no/rss2/?seksjon=aksjetips>|200|03/18/2026|valid|1|
15|E24 - IT & Telekom|<http://e24.no/rss2/?seksjon=it>|200|03/18/2026|valid|0|
16|NRK - RSS oversikt (directory)|<https://www.nrk.no/rss/>|needs check|03/18/2026|needs verification|0|
17|NRK - Innenriks|<https://www.nrk.no/norge/toppsaker.rss>|200|03/18/2026|valid|30|
18|TV2 - Nyheter|<https://www.tv2.no/rss/nyheter>|200|03/18/2026|valid|0|
19|TV2 - Innenriks|<https://www.tv2.no/rss/nyheter/innenriks>|200|03/18/2026|valid|0|
20|TV2 - Utenriks|<https://www.tv2.no/rss/nyheter/utenriks>|200|03/18/2026|valid|0|
21|TV2 - Sport|<https://www.tv2.no/rss/sport>|200|03/18/2026|valid|14|
22|TV2 - Underholdning|<https://www.tv2.no/rss/underholdning>|200|03/18/2026|valid|9|
23|Nettavisen - Alle saker|<https://www.nettavisen.no/service/rich-rss>|200|03/18/2026|valid|0|
24|Nettavisen - Nyheter|<https://www.nettavisen.no/service/rich-rss?tag=nyheter>|200|03/18/2026|valid|0|
25|Nettavisen - Sport|<https://www.nettavisen.no/service/rich-rss?tag=sport>|200|03/18/2026|valid|0|
26|Dagbladet|<https://www.dagbladet.no/?lab_viewport=rss>|200|03/18/2026|valid|53|
27|Aftenposten|<https://www.aftenposten.no/rss/>|200|03/18/2026|valid|89|
28|Dagsavisen|<https://www.dagsavisen.no/rss>|200|03/18/2026|valid|21|
29|DN - RSS directory|<https://services.dn.no/tools/rss>|needs check|03/18/2026|needs verification|0|
30|DN - Alle nyheter|<https://services.dn.no/api/feed/rss/>|200|03/18/2026|valid|28|
31|Finansavisen|<https://ws.finansavisen.no/api/articles.rss>|200|03/18/2026|valid|66|
32|Finansavisen - Brs|<https://ws.finansavisen.no/api/articles.rss?category=B%C3%B8rs>|200|03/18/2026|valid|0|
33|VG (Verdens Gang)|<https://www.vg.no/rss/feed>|200|03/18/2026|valid|0|
34|Finansavisen (Finance/Investment)|<https://finansavisen.no/rss>|needs check|03/18/2026|needs verification|0|
35|Teknisk Ukeblad (Tech/Energy/Marine)|<https://www.tu.no/feed>|Recovered via sitemap|03/18/2026|valid|0|
36|E24 Energi (Energy/Marine Industry)|<https://e24.no/energi/rss>|needs check|03/18/2026|needs verification|0|
37|Adresseavisen|<https://www.adressa.no/rss/>|200|03/18/2026|valid|152|
38|VG|<https://www.vg.no/rss/feed/>|200|03/18/2026|valid|58|
39|VG - Dine Penger Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
40|NRK - Oslo og Viken|<https://www.nrk.no/osloogviken/toppsaker.rss>|200|03/18/2026|valid|0|
41|NRK - Innlandet|<https://www.nrk.no/innlandet/toppsaker.rss>|200|03/18/2026|valid|1|
42|NRK - Vestland|<https://www.nrk.no/vestland/toppsaker.rss>|200|03/18/2026|valid|0|
43|NRK - Trondelag|<https://www.nrk.no/trondelag/toppsaker.rss>|200|03/18/2026|valid|0|
44|NRK - Rogaland|<https://www.nrk.no/rogaland/toppsaker.rss>|200|03/18/2026|valid|0|
45|NRK - Nordland|<https://www.nrk.no/nordland/toppsaker.rss>|200|03/18/2026|valid|1|
46|TV2 - Broom|<https://www.tv2.no/rss/broom>|200|03/18/2026|valid|5|
47|TV2 - Helse|<https://www.tv2.no/rss/nyheter/innenriks/helse>|200|03/18/2026|valid|0|
48|Bergens Tidende|<https://www.bt.no/rss>|200|03/18/2026|valid|71|
49|iTromso|<https://www.itromso.no/rss>|200|03/18/2026|valid|17|
50|NRK - Sorlandet|<https://www.nrk.no/sorlandet/toppsaker.rss>|200|03/18/2026|valid|0|
51|NRK - More og Romsdal|<https://www.nrk.no/mr/toppsaker.rss>|200|03/18/2026|valid|3|
52|NRK - Troms og Finnmark|<https://www.nrk.no/tromsogfinnmark/toppsaker.rss>|200|03/18/2026|valid|0|
53|NRK - Ostfold|<https://www.nrk.no/ostfold/toppsaker.rss>|200|03/18/2026|valid|1|
54|NRK - Telemark|<https://www.nrk.no/telemark/toppsaker.rss>|200|03/18/2026|valid|2|
55|Stavanger Aftenblad|<https://www.aftenbladet.no/rss>|200|03/18/2026|valid|65|
56|Sunnmorsposten|<https://www.smp.no/rss>|200|03/18/2026|valid|48|
57|NRK - Buskerud|<https://www.nrk.no/buskerud/toppsaker.rss>|200|03/18/2026|valid|5|
58|NRK - Vestfold|<https://www.nrk.no/vestfold/toppsaker.rss>|200|03/18/2026|valid|0|
59|NRK - Sogn og Fjordane|<https://www.nrk.no/sognogfjordane/toppsaker.rss>|200|03/18/2026|valid|2|
60|NRK - Agder|<https://www.nrk.no/agder/toppsaker.rss>|200|03/18/2026|valid|5|
61|NRK - Finnmark|<https://www.nrk.no/finnmark/toppsaker.rss>|200|03/18/2026|valid|12|
62|Avisa ST|<https://www.avisa-st.no/rss>|200|03/18/2026|valid|11|
63|Framtid i Nord|<https://www.framtidinord.no/rss>|200|03/18/2026|valid|16|
64|Altaposten|<https://www.altaposten.no/rss>|200|03/18/2026|valid|26|
65|Folkebladet|<https://www.folkebladet.no/rss>|200|03/18/2026|valid|21|
66|Varden|<https://www.varden.no/rss>|200|03/18/2026|valid|26|
67|Agderposten|<https://www.agderposten.no/rss>|200|03/18/2026|valid|31|
68|Lister24|<https://www.lister24.no/rss>|200|03/18/2026|valid|23|
69|Romsdals Budstikke|<https://www.rbnett.no/rss>|200|03/18/2026|valid|49|
70|Fosna-Folket|<https://www.fosna-folket.no/rss>|200|03/18/2026|valid|11|
71|VOL|<https://www.vol.no/rss>|200|03/18/2026|valid|21|
72|Innherred|<https://www.innherred.no/rss>|200|03/18/2026|valid|16|
73|Hallingdlen|<https://www.hallingdolen.no/rss>|200|03/18/2026|valid|14|
74|Sunnhordland|<https://www.sunnhordland.no/rss>|200|03/18/2026|valid|10|

### Ireland (IE)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|RTE News|<https://www.rte.ie/feeds/rss/?index=/news/>|200|03/18/2026|valid|22|
2|TheJournal.ie|<https://www.thejournal.ie/feed/>|200|03/18/2026|valid|28|
3|Independent.ie|<https://www.independent.ie/rss/section/ada62966-6b00-4ead-a0ba-2c179a0730b0>|200|03/18/2026|valid|15|
4|Irish Times|<https://www.irishtimes.com/arc/outboundfeeds/rss/>|200|03/18/2026|valid|83|
5|DublinLive|<https://www.dublinlive.ie/rss.xml>|200|03/18/2026|valid|15|
6|Irish Examiner|<https://www.irishexaminer.com/feed/35-top_news.xml>|200|03/18/2026|valid|90|
7|Irish Mirror|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
8|Irish Star|<https://www.irishstar.com/rss.xml>|200|03/18/2026|valid|70|
9|CorkBeo|<https://www.corkbeo.ie/rss.xml>|200|03/18/2026|valid|15|
10|GalwayBeo|<https://www.galwaybeo.ie/rss.xml>|200|03/18/2026|valid|11|
11|Leinster Leader|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
12|Limerick Leader|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
13|BreakingNews.ie|<https://feeds.breakingnews.ie/bntopstories>|200|03/18/2026|valid|0|
14|Extra.ie|<https://extra.ie/feed>|200|03/18/2026|valid|23|
15|Sunday World|<https://www.sundayworld.com/feed>|403 (HTTP_403)|03/18/2026|invalid|0|
16|RTE News - World|<https://www.rte.ie/feeds/rss/?index=/news/world/>|200|03/18/2026|valid|0|
17|RTE News - Business|<https://www.rte.ie/feeds/rss/?index=/news/business/>|200|03/18/2026|valid|17|
18|RTE News - Politics|<https://www.rte.ie/feeds/rss/?index=/news/politics/>|200|03/18/2026|valid|0|
19|RTE News - Regional|<https://www.rte.ie/feeds/rss/?index=/news/regional/>|200|03/18/2026|valid|1|
20|Independent.ie - News|<https://www.independent.ie/rss/section/1f0f9d8c-1f0e-4c8e-9d95-4d7b5c6f8a0c>|200|03/18/2026|valid|0|
21|Independent.ie - World|<https://www.independent.ie/rss/section/9d5837b5-d2c4-400f-b668-56d7cb7781ef>|200|03/18/2026|valid|0|
22|BreakingNews.ie - Ireland|<https://feeds.breakingnews.ie/bnireland>|200|03/18/2026|valid|0|
23|RTE News - Europe|<https://www.rte.ie/feeds/rss/?index=/news/europe/>|200|03/18/2026|valid|0|
24|RTE News - Dublin|<https://www.rte.ie/feeds/rss/?index=/news/dublin/>|200|03/18/2026|valid|0|
25|RTE News - Munster|<https://www.rte.ie/feeds/rss/?index=/news/munster/>|200|03/18/2026|valid|1|
26|RTE News - Leinster|<https://www.rte.ie/feeds/rss/?index=/news/leinster/>|200|03/18/2026|valid|2|
27|RTE News - Connacht|<https://www.rte.ie/feeds/rss/?index=/news/connacht/>|200|03/18/2026|valid|1|
28|RTE News - Ulster|<https://www.rte.ie/feeds/rss/?index=/news/ulster/>|200|03/18/2026|valid|0|
29|Independent.ie - Business|<https://www.independent.ie/rss/section/business/>|200|03/18/2026|valid|1|
30|Independent.ie - Sport|<https://www.independent.ie/rss/section/sport/>|200|03/18/2026|valid|0|
31|Independent.ie - Irish News|<https://www.independent.ie/rss/section/irish-news/>|200|03/18/2026|valid|0|
32|Independent.ie - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
33|The Sun Ireland|<https://www.thesun.ie/feed/>|200 (HTML_RETURNED)|03/18/2026|invalid|0|
34|BelfastLive|<https://www.belfastlive.co.uk/rss.xml>|200|03/18/2026|valid|42|
35|Buzz.ie|<https://www.buzz.ie/rss.xml>|200|03/18/2026|valid|0|
36|BreakingNews.ie - World|<https://feeds.breakingnews.ie/bnworld>|200|03/18/2026|valid|0|
37|BreakingNews.ie - Business|<https://feeds.breakingnews.ie/bnbusiness>|200|03/18/2026|valid|0|
38|BreakingNews.ie - Sport|<https://feeds.breakingnews.ie/bnsport>|200|03/18/2026|valid|0|
39|Extra.ie - News|<https://extra.ie/category/news/feed>|200|03/18/2026|valid|0|
40|Extra.ie - Business|<https://extra.ie/category/business/feed>|200|03/18/2026|valid|0|
41|Extra.ie - Sport|<https://extra.ie/category/sport/feed>|200|03/18/2026|valid|0|
42|Extra.ie - Entertainment|<https://extra.ie/category/entertainment/feed>|200|03/18/2026|valid|0|
43|Newstalk|<https://www.newstalk.com/feed>|200|03/18/2026|valid|6|
44|Agriland|<https://www.agriland.ie/feed/>|200|03/18/2026|valid|14|
45|The42|<https://www.the42.ie/feed/>|200|03/18/2026|valid|22|
46|Silicon Republic|<https://www.siliconrepublic.com/feed>|200|03/18/2026|valid|5|
47|The Currency|<https://thecurrency.news/feed/>|200|03/18/2026|valid|4|
48|Off The Ball|<https://www.offtheball.com/feed>|200|03/18/2026|valid|0|
49|Business Plus|<https://businessplus.ie/feed/>|200|03/18/2026|valid|13|
50|Irish Tech News|<https://irishtechnews.ie/feed/>|200|03/18/2026|valid|1|
51|RTE Sport|<https://www.rte.ie/feeds/rss/?index=/sport/>|200|03/18/2026|valid|20|
52|Belfast Telegraph|<https://www.belfasttelegraph.co.uk/rss>|403 (HTTP_403)|03/18/2026|invalid|0|
53|Irish Post|<https://www.irishpost.com/feed>|200|03/18/2026|valid|5|

### Portugal (PT)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Observador|<https://observador.pt/feed/>|200|03/18/2026|valid|169|
2|ECO|<https://eco.sapo.pt/feed/>|200|03/18/2026|valid|77|
3|Publico|<https://feeds.feedburner.com/PublicoRSS>|200|03/18/2026|valid|91|
4|Diario de Noticias|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
5|SIC Noticias|<https://rss.impresa.pt/feed/latest/sicnot.rss?type=ARTICLE,VIDEO,GALLERY,STREAM,PLAYLIST,EVENT,NEWSLETTER&limit=100&pubsubhub=true>|200|03/18/2026|valid|89|
6|Expresso|<https://rss.impresa.pt/feed/latest/expresso.rss?type=ARTICLE,VIDEO,STREAM,PLAYLIST,EVENT&limit=100&pubsubhub=true>|200|03/18/2026|valid|57|
7|RTP Noticias|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
8|RTP - Pais|<https://www.rtp.pt/noticias/rss/pais>|200|03/18/2026|valid|19|
9|RTP - Mundo|<https://www.rtp.pt/noticias/rss/mundo>|200|03/18/2026|valid|21|
10|RTP - Economia|<https://www.rtp.pt/noticias/rss/economia>|200|03/18/2026|valid|12|
11|RTP - Desporto|<https://www.rtp.pt/noticias/rss/desporto>|200|03/18/2026|valid|20|
12|RTP - Cultura|<https://www.rtp.pt/noticias/rss/cultura>|200|03/18/2026|valid|2|
13|RTP - Videos|<https://www.rtp.pt/noticias/rss/videos>|200|03/18/2026|valid|7|
14|RTP - Audios|<https://www.rtp.pt/noticias/rss/audios>|200|03/18/2026|valid|1|
15|CNN Portugal|<https://cnnportugal.iol.pt/rss.xml>|200|03/18/2026|valid|92|
16|Noticias ao Minuto - Ultima Hora|<https://www.noticiasaominuto.com/rss/ultima-hora>|200|03/18/2026|valid|346|
17|Executive Digest|<https://executivedigest.sapo.pt/feed/>|200|03/18/2026|valid|93|
18|Visao|<https://visao.pt/feed/>|200|03/18/2026|valid|9|
19|NiT|<https://www.nit.pt/feed>|200|03/18/2026|valid|34|
20|24 Noticias|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
21|Jornal de Negocios|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
22|Correio da Manha|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
23|Sol|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
24|A Bola|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
25|Record|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|

### Denmark (DK)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|DR Nyheder|<https://www.dr.dk/nyheder/service/feeds/allenyheder>|200|03/18/2026|valid|27|
2|Politiken|<https://politiken.dk/rss/senestenyt.rss>|200|03/18/2026|valid|51|
3|Ekstra Bladet|<https://ekstrabladet.dk/rssfeed/nyheder/>|200|03/18/2026|valid|133|
4|Berlingske|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
5|BT|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
6|Jyllands-Posten|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
7|Jyllands-Posten - Topnyheder|<https://feeds.jp.dk/jp/topnyheder>|200|03/18/2026|valid|6|
8|Jyllands-Posten - Seneste|<https://feeds.jp.dk/jp/seneste>|200|03/18/2026|valid|28|
9|Avisen.dk|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
10|TV Syd|<https://www.tvsyd.dk/rss>|200|03/18/2026|valid|27|
11|TV Midtvest|<https://www.tvmidtvest.dk/rss>|200|03/18/2026|valid|21|
12|MigogKBH|<https://migogkbh.dk/feed/>|200|03/18/2026|valid|16|
13|MigogAarhus|<https://migogaarhus.dk/feed/>|200|03/18/2026|valid|20|
14|MigogOdense|<https://migogodense.dk/feed/>|200|03/18/2026|valid|12|
15|MigogAalborg|<https://migogaalborg.dk/feed/>|200|03/18/2026|valid|14|
16|DR Indland|<https://www.dr.dk/nyheder/service/feeds/indland>|200|03/18/2026|valid|9|
17|DR Udland|<https://www.dr.dk/nyheder/service/feeds/udland>|200|03/18/2026|valid|12|
18|DR Penge|<https://www.dr.dk/nyheder/service/feeds/penge>|200|03/18/2026|valid|2|
19|DR Sporten|<https://www.dr.dk/nyheder/service/feeds/sporten>|200|03/18/2026|valid|4|
20|DR Kultur|<https://www.dr.dk/nyheder/service/feeds/kultur>|200|03/18/2026|valid|2|
21|Politiken - Indland|<https://politiken.dk/rss/indland.rss>|200|03/18/2026|valid|0|
22|Politiken - Udland|<https://politiken.dk/rss/udland.rss>|200|03/18/2026|valid|1|
23|Politiken - Kultur|<https://politiken.dk/rss/kultur.rss>|200|03/18/2026|valid|0|
24|Politiken - Sport|<https://politiken.dk/rss/sport.rss>|200|03/18/2026|valid|0|
25|Borsen|<https://borsen.dk/rss>|200|03/18/2026|valid|23|
26|Borsen - Finans|<https://borsen.dk/rss/finans>|200|03/18/2026|valid|16|
27|Borsen - Investor|<https://borsen.dk/rss/investor>|200|03/18/2026|valid|11|
28|Borsen - Politik|<https://borsen.dk/rss/politik>|200|03/18/2026|valid|12|
29|Borsen - Udland|<https://borsen.dk/rss/udland>|200|03/18/2026|valid|2|
30|Borsen - Ejendomme|<https://borsen.dk/rss/ejendomme>|200|03/18/2026|valid|3|
31|Borsen - Executive|<https://borsen.dk/rss/executive>|200|03/18/2026|valid|4|
32|Borsen - Opinion|<https://borsen.dk/rss/opinion>|200|03/18/2026|valid|17|
33|Borsen - Markedsberetninger|<https://borsen.dk/rss/markedsberetninger>|200|03/18/2026|valid|8|
34|Borsen - Baeredygtig|<https://borsen.dk/rss/baeredygtig>|200|03/18/2026|valid|10|
35|Borsen - Virksomheder|<https://borsen.dk/rss/virksomheder>|200|03/18/2026|valid|0|
36|TV2 Kosmopol - Sitemap|<https://www.tv2kosmopol.dk/rss>|200|03/18/2026|valid|34|
37|TV2 Fyn - Sitemap|<https://www.tv2fyn.dk/rss>|200|03/18/2026|valid|28|
38|TV MIDTVEST - Sitemap|<https://www.tvmidtvest.dk/rss>|200|03/18/2026|valid|23|
39|TV2 Nord - Sitemap|<https://www.tv2nord.dk/rss>|200|03/18/2026|valid|32|
40|TV2 Ostjylland - Sitemap|<https://www.tv2ostjylland.dk/rss>|200|03/18/2026|valid|33|
41|TV2 East - Sitemap|<https://www.tv2east.dk/rss>|200|03/18/2026|valid|63|
42|TV2 Bornholm - Sitemap|<https://www.tv2bornholm.dk/rss>|200|03/18/2026|valid|89|
43|TV2 Lorry - Sitemap|<https://www.tv2lorry.dk/rss>|200|03/18/2026|valid|0|
44|Nordjyske - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
45|Fyens - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
46|Information - Sitemap|<https://www.information.dk/feed>|200|03/18/2026|valid|5|
47|Finans.dk - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
48|Finans.dk - Topnyheder|<https://feeds.finans.dk/topnyheder>|200|03/18/2026|valid|3|
49|Finans.dk - Seneste|<https://feeds.finans.dk/seneste>|200|03/18/2026|valid|44|
50|DR Seneste Nyt|<https://www.dr.dk/nyheder/service/feeds/senestenyt>|200|03/18/2026|valid|2|
51|Avisen Danmark - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
52|Jyllands-Posten - Mest Laeste|<https://feeds.jp.dk/jp/mest-laeste>|200|03/18/2026|valid|7|
53|Information - Latest Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
54|Altinget|<https://www.altinget.dk/rss>|200|03/18/2026|valid|21|
55|Weekendavisen|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
56|Ingenioren|<https://ing.dk/rss>|200|03/18/2026|valid|53|
57|Version2|<https://version2.dk/rss>|200|03/18/2026|valid|15|
58|Kristeligt Dagblad - Latest RSS|<https://www.kristeligt-dagblad.dk/feed/rss/latest>|200|03/18/2026|valid|287|
59|Nordjyske - Nyheder|<https://nordjyske.dk/rss/nyheder>|200|03/18/2026|valid|15|
60|Nordjyske - Aalborg|<https://nordjyske.dk/rss/aalborg>|200|03/18/2026|valid|2|
61|Nordjyske - Frederikshavn|<https://nordjyske.dk/rss/frederikshavn>|200|03/18/2026|valid|0|
62|Nordjyske - Hjorring|<https://nordjyske.dk/rss/hjoerring>|200|03/18/2026|valid|0|
63|Nordjyske - Bronderslev|<https://nordjyske.dk/rss/broenderslev>|200|03/18/2026|valid|0|
64|Nordjyske - Jammerbugt|<https://nordjyske.dk/rss/jammerbugt>|200|03/18/2026|valid|0|
65|Nordjyske - Mariagerfjord|<https://nordjyske.dk/rss/mariagerfjord>|200|03/18/2026|valid|0|
66|Nordjyske - Mors|<https://nordjyske.dk/rss/mors>|200|03/18/2026|valid|0|
67|Nordjyske - Rebild|<https://nordjyske.dk/rss/rebild>|200|03/18/2026|valid|0|
68|Nordjyske - Vesthimmerland|<https://nordjyske.dk/rss/vesthimmerland>|200|03/18/2026|valid|0|
69|Nordjyske - Thisted|<https://nordjyske.dk/rss/thisted>|200|03/18/2026|valid|0|
70|Nordjyske - Sport|<https://nordjyske.dk/rss/sport>|200|03/18/2026|valid|9|
71|Nordjyske - Erhverv|<https://nordjyske.dk/rss/erhverv>|200|03/18/2026|valid|13|

### Finland (FI)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Yle Uutiset|<https://feeds.yle.fi/uutiset/v1/majorHeadlines/YLE_UUTISET.rss?publisherIds=YLE_UUTISET>|200|03/18/2026|valid|27|
2|Helsingin Sanomat|<https://www.hs.fi/rss/tuoreimmat.xml>|200|03/18/2026|valid|38|
3|Ilta-Sanomat|<https://www.is.fi/rss/tuoreimmat.xml>|200|03/18/2026|valid|79|
4|Iltalehti|<https://www.iltalehti.fi/rss.xml>|200|03/18/2026|valid|118|
5|MTV Uutiset|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
6|Kauppalehti|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
7|HBL|<https://www.hbl.fi/feeds/feed.xml>|200|03/18/2026|valid|34|
8|ESS|<https://www.ess.fi/feed/rss>|200|03/18/2026|valid|25|
9|Turun Sanomat - Latest Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
10|Turun Sanomat - Google News|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
11|Kaleva - Uusimmat|<https://kaleva.fi/feedit/rss/managed-listing/rss-uusimmat/>|200|03/18/2026|valid|13|
12|Aamulehti|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
13|Satakunnan Kansa|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
14|KSML|<https://www.ksml.fi/feed/rss>|200|03/18/2026|valid|45|
15|Maaseudun Tulevaisuus|<https://www.maaseuduntulevaisuus.fi/feeds/maaseuduntulevaisuus>|200|03/18/2026|valid|12|
16|Aamuposti|<https://www.aamuposti.fi/feed/rss>|200|03/18/2026|valid|10|
17|Lansi-Savo|<https://www.lansi-savo.fi/feed/rss>|200|03/18/2026|valid|9|
18|Warkauden Lehti|<https://www.warkaudenlehti.fi/feed/rss>|200|03/18/2026|valid|5|
19|Suur-Keuruu|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
20|Ita-Savo|<https://www.ita-savo.fi/feed/rss>|200|03/18/2026|valid|15|
21|Yle Uutiset - Kotimaa|<https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_UUTISET&concepts=18-34837>|200|03/18/2026|valid|9|
22|Ilta-Sanomat - Kotimaa|<https://www.is.fi/rss/kotimaa.xml>|200|03/18/2026|valid|0|
23|Ilta-Sanomat - Ulkomaat|<https://www.is.fi/rss/ulkomaat.xml>|200|03/18/2026|valid|0|
24|Ilta-Sanomat - Taloussanomat|<https://www.is.fi/rss/taloussanomat.xml>|200|03/18/2026|valid|0|
25|Ilta-Sanomat - Urheilu|<https://www.is.fi/rss/urheilu.xml>|200|03/18/2026|valid|0|
26|Iltalehti - Uutiset|<https://www.iltalehti.fi/rss/uutiset.xml>|200|03/18/2026|valid|0|
27|Iltalehti - Kotimaa|<https://www.iltalehti.fi/rss/kotimaa.xml>|200|03/18/2026|valid|0|
28|Iltalehti - Ulkomaat|<https://www.iltalehti.fi/rss/ulkomaat.xml>|200|03/18/2026|valid|0|
29|Iltalehti - Talous|<https://www.iltalehti.fi/rss/talous.xml>|200|03/18/2026|valid|0|
30|Helsingin Sanomat - Talous|<https://www.hs.fi/rss/talous.xml>|200|03/18/2026|valid|0|
31|Helsingin Sanomat - Urheilu|<https://www.hs.fi/rss/urheilu.xml>|200|03/18/2026|valid|0|
32|Yle Uutiset - Maailma|<https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_UUTISET&concepts=18-34953>|200|03/18/2026|valid|10|
33|Yle Uutiset - Talous|<https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_UUTISET&concepts=18-19274>|200|03/18/2026|valid|0|
34|Yle Urheilu|<https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_URHEILU>|200|03/18/2026|valid|13|
35|Yle Uutiset - Kulttuuri|<https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_UUTISET&concepts=18-150067>|200|03/18/2026|valid|0|
36|Yle Uutiset - Paakaupunkiseutu|<https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_UUTISET&concepts=18-34953,18-34837>|200|03/18/2026|valid|0|
37|Savon Sanomat|<https://www.savonsanomat.fi/feed/rss>|200|03/18/2026|valid|35|
38|Karjalainen|<https://www.karjalainen.fi/rss>|200|03/18/2026|valid|29|
39|Hameen Sanomat|<https://www.hameensanomat.fi/feed/rss>|200|03/18/2026|valid|36|
40|Kouvolan Sanomat|<https://www.kouvolansanomat.fi/feed/rss>|200|03/18/2026|valid|8|
41|Keskipohjanmaa|<https://www.keskipohjanmaa.fi/feed/rss>|200|03/18/2026|valid|0|
42|Kymen Sanomat|<https://www.kymensanomat.fi/feed/rss>|200|03/18/2026|valid|17|
43|Etela-Saimaa|<https://www.esaimaa.fi/feed/rss>|200|03/18/2026|valid|10|
44|Uusimaa|<https://www.uusimaa.fi/feed/rss>|200|03/18/2026|valid|10|
45|Kainuun Sanomat|<https://www.kainuunsanomat.fi/feed/rss>|200|03/18/2026|valid|0|
46|Aamulehti - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
47|Talouselama - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
48|Tekniikkatalous - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
49|Verkkouutiset|<https://www.verkkouutiset.fi/feed/>|200|03/18/2026|valid|24|
50|Ilta-Sanomat - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
51|Helsingin Sanomat - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
52|MTV Uutiset - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
53|Iltalehti - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
54|Helsingin Sanomat - Politiikka|<https://www.hs.fi/rss/politiikka.xml>|200|03/18/2026|valid|0|
55|Helsingin Sanomat - Kulttuuri|<https://www.hs.fi/rss/kulttuuri.xml>|200|03/18/2026|valid|0|
56|Ilta-Sanomat - Viihde|<https://www.is.fi/rss/viihde.xml>|200|03/18/2026|valid|0|
57|Ilta-Sanomat - Digitoday|<https://www.is.fi/rss/digitoday.xml>|200|03/18/2026|valid|0|
58|Ilta-Sanomat - Autot|<https://www.is.fi/rss/autot.xml>|200|03/18/2026|valid|0|
59|Iltalehti - Viihde|<https://www.iltalehti.fi/rss/viihde.xml>|200|03/18/2026|valid|0|
60|Iltalehti - Urheilu|<https://www.iltalehti.fi/rss/urheilu.xml>|200|03/18/2026|valid|0|
61|Iltalehti - Digiuutiset|<https://www.iltalehti.fi/rss/digiuutiset.xml>|200|03/18/2026|valid|1|
62|Iltalehti - TV ja leffat|<https://www.iltalehti.fi/rss/tv-ja-leffat.xml>|200|03/18/2026|valid|0|
63|Ilta-Sanomat - Politiikka|<https://www.is.fi/rss/politiikka.xml>|200|03/18/2026|valid|0|
64|Ilta-Sanomat - Tiede|<https://www.is.fi/rss/tiede.xml>|200|03/18/2026|valid|0|
65|Ilta-Sanomat - Terveys|<https://www.is.fi/rss/terveys.xml>|200|03/18/2026|valid|0|
66|Ilta-Sanomat - Matkat|<https://www.is.fi/rss/matkat.xml>|200|03/18/2026|valid|0|
67|Ilta-Sanomat - Formula 1|<https://www.is.fi/rss/formula1.xml>|200|03/18/2026|valid|0|
68|Iltalehti - Politiikka|<https://www.iltalehti.fi/rss/politiikka.xml>|200|03/18/2026|valid|0|
69|Iltalehti - Autot|<https://www.iltalehti.fi/rss/autot.xml>|200|03/18/2026|valid|0|
70|Iltalehti - Terveys|<https://www.iltalehti.fi/rss/terveys.xml>|200|03/18/2026|valid|0|
71|Iltalehti - Jalkapallo|<https://www.iltalehti.fi/rss/jalkapallo.xml>|200|03/18/2026|valid|1|
72|Iltalehti - Jaakiekko|<https://www.iltalehti.fi/rss/jaakiekko.xml>|200|03/18/2026|valid|0|
73|Ilta-Sanomat - Jaakiekko|<https://www.is.fi/rss/jaakiekko.xml>|200|03/18/2026|valid|0|
74|Ilta-Sanomat - Jalkapallo|<https://www.is.fi/rss/jalkapallo.xml>|200|03/18/2026|valid|0|
75|Ilta-Sanomat - Ralli|<https://www.is.fi/rss/ralli.xml>|200|03/18/2026|valid|0|
76|Iltalehti - Musiikki|<https://www.iltalehti.fi/rss/musiikki.xml>|200|03/18/2026|valid|0|
77|Iltalehti - NHL|<https://www.iltalehti.fi/rss/nhl.xml>|200|03/18/2026|valid|0|
78|Uusi Suomi - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
79|Suomenmaa|<https://www.suomenmaa.fi/feed/>|200|03/18/2026|valid|17|
80|Demokraatti|<https://demokraatti.fi/feed/>|200|03/18/2026|valid|15|
81|Tivi|<https://www.tivi.fi/api/feed/v2/rss/tv>|200|03/18/2026|valid|12|
82|Mikrobitti|<https://www.mikrobitti.fi/rss/bitti.xml>|Recovered via sitemap|03/18/2026|valid|0|
83|Tekniikka & Talous|<https://www.tekniikkatalous.fi/api/feed/v2/rss/tt>|200|03/18/2026|valid|23|
84|Talouselama|<https://www.talouselama.fi/api/feed/v2/rss/te>|200|03/18/2026|valid|14|
85|Arvopaperi|<https://www.arvopaperi.fi/api/feed/v2/rss/ap>|200|03/18/2026|valid|15|
86|Seiska|<https://www.seiska.fi/latest.rss>|200|03/18/2026|valid|0|
87|Suomen Kuvalehti|<https://suomenkuvalehti.fi/feed/>|200|03/18/2026|valid|25|

### Czech Republic (CZ)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|CT24|<https://ct24.ceskatelevize.cz/rss/tema/vyber-redakce-84313>|200|03/18/2026|valid|33|
2|Aktualne.cz|<https://zpravy.aktualne.cz/rss/>|200|03/18/2026|valid|47|
3|Novinky.cz|<https://www.novinky.cz/rss>|200|03/18/2026|valid|116|
4|Seznam Zpravy|<https://www.seznamzpravy.cz/rss>|200|03/18/2026|valid|58|
5|Denik|<https://www.denik.cz/rss/zpravy.html>|200|03/18/2026|valid|46|
6|iDNES.cz|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
7|Blesk|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
8|E15|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
9|Lidovky.cz|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
10|Echo24|<https://www.echo24.cz/rss/s/homepage>|200|03/18/2026|valid|26|
11|iROZHLAS|<https://www.irozhlas.cz/rss/irozhlas>|200|03/18/2026|valid|76|
12|iROZHLAS - Domov|<https://www.irozhlas.cz/rss/irozhlas/section/zpravy-domov>|200|03/18/2026|valid|0|
13|iROZHLAS - Svet|<https://www.irozhlas.cz/rss/irozhlas/section/zpravy-svet>|200|03/18/2026|valid|0|
14|iROZHLAS - Sport|<https://www.irozhlas.cz/rss/irozhlas/section/sport>|200|03/18/2026|valid|1|
15|CNN Prima|<https://cnn.iprima.cz/rss>|200|03/18/2026|valid|55|
16|Forum24|<https://www.forum24.cz/feed>|200|03/18/2026|valid|35|
17|Reflex|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
18|ParlamentniListy|<http://www.parlamentnilisty.cz/export/rss.aspx>|200|03/18/2026|valid|40|
19|Hospodarske noviny|<https://archiv.hn.cz/rss/zpravodajstvi>|200|03/18/2026|valid|23|
20|iSport|<https://isport.blesk.cz/rss>|200|03/18/2026|valid|41|
21|Blesk - Zpravy|<https://www.blesk.cz/rss/zpravy>|200|03/18/2026|valid|0|
22|Seznam Zpravy - Domaci|<https://www.seznamzpravy.cz/rss/domaci>|200|03/18/2026|valid|0|
23|Seznam Zpravy - Zahranicni|<https://www.seznamzpravy.cz/rss/zahranicni>|200|03/18/2026|valid|0|
24|Zive.cz|<https://www.zive.cz/rss/sc-47/>|200|03/18/2026|valid|15|
25|Auto.cz|<https://www.auto.cz/rss>|200|03/18/2026|valid|6|
26|Denik N|<https://denikn.cz/feed/>|200|03/18/2026|valid|20|
27|Lupa.cz|<https://www.lupa.cz/rss/clanky/>|200|03/18/2026|valid|6|
28|Aktualne.cz - Domaci|<https://zpravy.aktualne.cz/rss/domaci/>|200|03/18/2026|valid|0|
29|Aktualne.cz - Zahranici|<https://zpravy.aktualne.cz/rss/zahranici/>|200|03/18/2026|valid|0|
30|Sport.cz|<https://www.sport.cz/rss/>|200|03/18/2026|valid|40|
31|Novinky.cz - Domaci|<https://www.novinky.cz/rss/domaci>|200|03/18/2026|valid|0|
32|Novinky.cz - Zahranicni|<https://www.novinky.cz/rss/zahranicni>|200|03/18/2026|valid|0|
33|Novinky.cz - Ekonomika|<https://www.novinky.cz/rss/ekonomika>|200|03/18/2026|valid|0|
34|iDNES.cz - Ekonomika|<https://servis.idnes.cz/rss.aspx?c=ekonomika>|200|03/18/2026|valid|4|
35|iROZHLAS - Ekonomika|<https://www.irozhlas.cz/rss/irozhlas/section/ekonomika>|200|03/18/2026|valid|0|
36|iROZHLAS - Komentare|<https://www.irozhlas.cz/rss/irozhlas/section/komentare>|200|03/18/2026|valid|0|
37|iROZHLAS - Kultura|<https://www.irozhlas.cz/rss/irozhlas/section/kultura>|200|03/18/2026|valid|0|
38|Seznam Zpravy - Byznys|<https://www.seznamzpravy.cz/rss/byznys>|200|03/18/2026|valid|0|
39|Seznam Zpravy - Domaci Politika|<https://www.seznamzpravy.cz/rss/domaci-politika>|200|03/18/2026|valid|0|
40|iDNES.cz - Zpravodaj|<https://servis.idnes.cz/rss.aspx?c=zpravodaj>|200|03/18/2026|valid|17|
41|iDNES.cz - Domaci|<https://servis.idnes.cz/rss.aspx?c=domaci>|200|03/18/2026|valid|15|
42|iDNES.cz - Zahranicni|<https://servis.idnes.cz/rss.aspx?c=zahranicni>|200|03/18/2026|valid|17|
43|iDNES.cz - Sport|<https://servis.idnes.cz/rss.aspx?c=sport>|200|03/18/2026|valid|39|
44|iDNES.cz - Technet|<https://servis.idnes.cz/rss.aspx?c=technet>|200|03/18/2026|valid|4|
45|TN Nova|<https://tn.nova.cz/rss>|200|03/18/2026|valid|33|
46|Blesk - Home|<https://www.blesk.cz/rss>|200|03/18/2026|valid|0|
47|TN Nova - News Sitemap 2|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
48|TN Nova - News Sitemap 3|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
49|iDNES.cz - Kultura|<https://servis.idnes.cz/rss.aspx?c=kultura>|200|03/18/2026|valid|10|
50|iDNES.cz - Fotbal|<https://servis.idnes.cz/rss.aspx?c=fotbal>|200|03/18/2026|valid|0|
51|iDNES.cz - Hokej|<https://servis.idnes.cz/rss.aspx?c=hokej>|200|03/18/2026|valid|4|
52|Blesk - Sport|<https://www.blesk.cz/rss/sport>|200|03/18/2026|valid|0|
53|Blesk - Celebrity|<https://www.blesk.cz/rss/celebrity>|200|03/18/2026|valid|0|
54|Blesk - Krimi|<https://www.blesk.cz/rss/krimi>|200|03/18/2026|valid|0|
55|Blesk - Regiony|<https://www.blesk.cz/rss/regiony>|200|03/18/2026|valid|0|
56|Blesk - Ekonomika|<https://www.blesk.cz/rss/ekonomika>|200|03/18/2026|valid|0|
57|Blesk - Zahranici|<https://www.blesk.cz/rss/zahranici>|200|03/18/2026|valid|0|
58|Ahaonline.cz|<https://www.ahaonline.cz/rss>|200|03/18/2026|valid|68|
59|Sport.cz - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
60|Sport.cz - Online Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
61|iDNES.cz - Ostrava|<https://servis.idnes.cz/rss.aspx?c=ostrava>|200|03/18/2026|valid|6|
62|iDNES.cz - Olomouc|<https://servis.idnes.cz/rss.aspx?c=olomouc>|200|03/18/2026|valid|6|
63|iDNES.cz - Plzen|<https://servis.idnes.cz/rss.aspx?c=plzen>|200|03/18/2026|valid|5|
64|iDNES.cz - Liberec|<https://servis.idnes.cz/rss.aspx?c=liberec>|200|03/18/2026|valid|1|
65|iDNES.cz - Usti|<https://servis.idnes.cz/rss.aspx?c=usti>|200|03/18/2026|valid|5|
66|iDNES.cz - Hradec|<https://servis.idnes.cz/rss.aspx?c=hradec>|200|03/18/2026|valid|2|
67|iDNES.cz - Pardubice|<https://servis.idnes.cz/rss.aspx?c=pardubice>|200|03/18/2026|valid|3|
68|iDNES.cz - Zlin|<https://servis.idnes.cz/rss.aspx?c=zlin>|200|03/18/2026|valid|1|
69|iDNES.cz - Vary|<https://servis.idnes.cz/rss.aspx?c=vary>|200|03/18/2026|valid|2|
70|iDNES.cz - Jihlava|<https://servis.idnes.cz/rss.aspx?c=jihlava>|200|03/18/2026|valid|3|
71|iDNES.cz - Budejovice|<https://servis.idnes.cz/rss.aspx?c=budejovice>|200|03/18/2026|valid|2|
72|Blesk - Auto|<https://www.blesk.cz/rss/auto>|200|03/18/2026|valid|74|
73|Blesk - Zdravi|<https://www.blesk.cz/rss/zdravi>|200|03/18/2026|valid|0|
74|Blesk - Cestovani|<https://www.blesk.cz/rss/cestovani>|200|03/18/2026|valid|0|
75|Blesk - Bydleni|<https://www.blesk.cz/rss/bydleni>|200|03/18/2026|valid|0|
76|Blesk - Praha|<https://www.blesk.cz/rss/praha>|200|03/18/2026|valid|0|
77|Blesk - Plzen|<https://www.blesk.cz/rss/plzen>|200|03/18/2026|valid|0|
78|Blesk - Ostrava Region|<https://www.blesk.cz/rss/ostrava>|200|03/18/2026|valid|0|
79|Blesk - Brno|<https://www.blesk.cz/rss/brno>|200|03/18/2026|valid|0|
80|Blesk - Olomouc Region|<https://www.blesk.cz/rss/olomouc>|200|03/18/2026|valid|0|
81|Sport.cz - Fotbal|<https://www.sport.cz/rss/fotbal>|200|03/18/2026|valid|1|
82|Sport.cz - Hokej|<https://www.sport.cz/rss/hokej>|200|03/18/2026|valid|0|
83|Sport.cz - Tenis|<https://www.sport.cz/rss/tenis>|200|03/18/2026|valid|0|
84|Denik - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
85|Sport.cz - Articles Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
86|Blesk - Videoarticle Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
87|Blesk - Elections Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
88|Denik - Sport|<https://www.denik.cz/rss/sport.html>|200|03/18/2026|valid|12|
89|Denik - Ekonomika|<https://www.denik.cz/rss/ekonomika.html>|200|03/18/2026|valid|0|
90|Denik - Kultura|<https://www.denik.cz/rss/kultura.html>|200|03/18/2026|valid|1|
91|Denik - Regiony|<https://www.denik.cz/rss/regiony.html>|200|03/18/2026|valid|1|
92|Denik - Krimi|<https://www.denik.cz/rss/krimi.html>|200|03/18/2026|valid|0|
93|Novinky.cz - Kultura|<https://www.novinky.cz/rss/kultura>|200|03/18/2026|valid|0|
94|Novinky.cz - Krimi|<https://www.novinky.cz/rss/krimi>|200|03/18/2026|valid|0|
95|Novinky.cz - Koktejl|<https://www.novinky.cz/rss/koktejl>|200|03/18/2026|valid|0|
96|Denik - Zdravi|<https://www.denik.cz/rss/zdravi.html>|200|03/18/2026|valid|0|
97|Denik - Cestovani|<https://www.denik.cz/rss/cestovani.html>|200|03/18/2026|valid|2|
98|Super.cz - News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
99|Extra.cz - Google News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
100|Refresher CZ|<https://refresher.cz/rss>|200|03/18/2026|valid|30|

### Greece (GR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|eKathimerini|<https://www.ekathimerini.com/infeeds/rss/nx-rss-feed.xml>|200|03/18/2026|valid|39|
2|Kathimerini|<https://www.kathimerini.gr/infeeds/rss/nx-rss-feed.xml>|200|03/18/2026|valid|184|
3|Naftemporiki|<https://www.naftemporiki.gr/feed/>|200|03/18/2026|valid|208|
4|Proto Thema|<https://www.protothema.gr/rss/>|200|03/18/2026|valid|338|
5|In.gr|<https://www.in.gr/feed/>|200|03/18/2026|valid|253|
6|To Vima|<https://www.tovima.gr/feed/>|200|03/18/2026|valid|79|
7|Newsbeast|<https://www.newsbeast.gr/feed>|200|03/18/2026|valid|338|
8|Ethnos|<https://www.ethnos.gr/rss.xml>|200|03/18/2026|valid|123|

### Romania (RO)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Digi24|<https://www.digi24.ro/rss>|200|03/18/2026|valid|84|
2|HotNews|<https://hotnews.ro/feed>|200|03/18/2026|valid|66|
3|Adevarul|<https://adevarul.ro/rss/index>|200|03/18/2026|valid|106|
4|G4Media|<https://www.g4media.ro/feed>|200|03/18/2026|valid|86|
5|Mediafax|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
6|Economedia|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
7|Stirile ProTV|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
8|Antena3|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
9|Libertatea|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
10|Ziare.com|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
11|DCNews|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
12|Gandul|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|

### Ukraine (UA)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Kyiv Independent|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
2|Kyiv Post|<https://www.kyivpost.com/feed>|200|03/18/2026|valid|7|
3|European Pravda|<https://www.eurointegration.com.ua/rss/>|200|03/18/2026|valid|5|
4|NV|<https://nv.ua/rss/all.xml>|200|03/18/2026|valid|477|
5|Ukrainska Pravda|<https://www.pravda.com.ua/rss/>|200|03/18/2026|valid|498|
6|Interfax-Ukraine|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
7|UNIAN|<https://www.unian.net/rss>|200|03/18/2026|valid|211|
8|TSN|<https://tsn.ua/rss/full.rss>|200|03/18/2026|valid|205|

### Luxembourg (LU)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Luxembourg Times|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
2|Luxemburger Wort|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|

### Slovakia (SK)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Aktuality.sk|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
2|Dennik N|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
3|SME|<https://www.sme.sk/rss>|200|03/18/2026|valid|98|
4|Pravda|<https://spravy.pravda.sk/rss/xml/>|200|03/18/2026|valid|46|
5|HNonline|<https://hnonline.sk/feed>|200|03/18/2026|valid|98|
6|TVNoviny.sk|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
7|TA3|<https://www.ta3.com/rss/top-spravy>|200|03/18/2026|valid|21|
8|Topky|<https://www.topky.sk/rss/8/TOPKY>|200|03/18/2026|valid|106|

### Hungary (HU)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Index.hu|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
2|Portfolio|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
3|Telex|<https://telex.hu/rss>|200|03/18/2026|valid|62|

### Bulgaria (BG)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|BNT News|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
2|24 Chasa|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
3|Mediapool|<https://www.mediapool.bg/rss>|200|03/18/2026|valid|50|
4|BNR - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
5|Dnevnik|<https://www.dnevnik.bg/rss>|200|03/18/2026|valid|77|
6|Novinite|<https://www.novinite.com/services/rss.php>|200|03/18/2026|valid|9|
7|Darik News|<https://dariknews.bg/rss.php>|200|03/18/2026|valid|80|
8|StandartNews|<https://www.standartnews.com/rss>|200|03/18/2026|valid|107|
9|Actualno|<https://www.actualno.com/rss>|200|03/18/2026|valid|213|
10|Club Z|<https://clubz.bg/rss.xml>|200|03/18/2026|valid|0|
11|Marica|<https://www.marica.bg/rss>|200|03/18/2026|valid|142|
12|NOVA - Latest News|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
13|NOVA - Latest Accents|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
14|SEGA - Google News Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|

### Croatia (HR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Dnevnik.hr|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
2|Index.hr|<https://www.index.hr/rss>|200|03/18/2026|valid|319|
3|Vecernji list|<https://www.vecernji.hr/feeds/latest>|200|03/18/2026|valid|154|
4|24sata|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
5|Novi List|<https://www.novilist.hr/feed/>|200|03/18/2026|valid|91|
6|Tportal|<https://www.tportal.hr/rss>|200|03/18/2026|valid|182|
7|Telegram.hr|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
8|N1 Hrvatska|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|

### Slovenia (SI)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|24ur|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
2|Delo|<https://www.delo.si/rss>|200|03/18/2026|valid|79|

### Serbia (RS)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|N1 Serbia|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
2|Telegraf|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
3|Novosti|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
4|Blic - Latest Sitemap|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
5|Blic|<https://www.blic.rs/rss/danasnje-vesti>|200|03/18/2026|valid|226|
6|RTS|<https://www.rts.rs/page/stories/sr/rss/10/vesti.html>|200|03/18/2026|valid|0|
7|N1|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
8|Kurir|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|

### Lithuania (LT)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Delfi Lithuania|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
2|15min|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
3|LRT|<https://www.lrt.lt/?rss>|200|03/18/2026|valid|144|
4|TV3 Lithuania|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
5|Verslo zinios|<https://www.vz.lt/rss>|200|03/18/2026|valid|32|
6|Delfi Lithuania - Sitemap Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
7|15min - Articles Index|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
8|Lrytas|<https://www.lrytas.lt/rss>|200|03/18/2026|valid|172|
9|Diena|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|

### Latvia (LV)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|TVNET|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
2|Apollo|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
3|Delfi Latvia|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
4|Jauns.lv|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
5|NRA|<https://nra.lv/rss/jaunakas-zinas/>|200|03/18/2026|valid|90|
6|LSM|<https://www.lsm.lv/rss/>|200|03/18/2026|valid|75|
7|Diena|<https://www.diena.lv/rss>|200|03/18/2026|valid|46|

### Estonia (EE)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Postimees|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
2|Ohtuleht|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
3|ERR|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
4|Delfi Estonia|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
5|Geenius|<https://geenius.ee/feed/>|200|03/18/2026|valid|21|
6|Elu24|<https://elu24.postimees.ee/rss>|200|03/18/2026|valid|50|
7|Arileht|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|

### Iceland (IS)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|Visir|N/A|❌ NO_SOURCE|03/18/2026|needs verification|-|
2|RUV|<https://www.ruv.is/rss/frettir>|200|03/18/2026|valid|62|

### Global Energy & Grid (Global)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Ingested 24h|
|---|---|---|---|---|---|---:|
1|OilPrice|<https://oilprice.com/rss/main>|200|03/18/2026|valid|14|
2|Power Engineering|<https://www.power-eng.com/feed/>|200|03/18/2026|valid|3|
3|Renewable Energy World|<https://www.renewableenergyworld.com/feed/>|200|03/18/2026|valid|0|
4|Utility Dive|<https://www.utilitydive.com/feeds/news/>|200|03/18/2026|valid|5|
5|CleanTechnica|<https://cleantechnica.com/feed/>|200|03/18/2026|valid|8|
6|Carbon Brief|<https://www.carbonbrief.org/feed/>|200|03/18/2026|valid|0|
7|Power Magazine|<https://www.powermag.com/feed/>|200|03/18/2026|valid|1|
8|PV Magazine|<https://www.pv-magazine.com/feed/>|200|03/18/2026|valid|5|
9|Energy Post|<https://energypost.eu/feed/>|needs check|03/18/2026|needs verification|0|
10|Energy Storage News|<https://www.energy-storage.news/rss>|200|03/18/2026|valid|8|
11|Energy Storage News|<https://www.energy-storage.news/feed>|200|03/18/2026|valid|8|
