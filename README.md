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

- Last checked: 03/08/2026
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

GitHub Actions is also configured:
- Workflow: `.github/workflows/rss-health-daily.yml`
- Schedule: 00:30 AM America/Chicago (cron is UTC in Actions; currently set at 06:30 UTC, so it runs at 01:30 during CDT and 00:30 during CST)
- Manual run: Actions tab → `RSS Health Daily` → `Run workflow`

Note about "Last checked" date in README:
- This workflow runs with `contents: write` and auto-commits RSS health snapshot changes when `README.md`/catalog outputs change.
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

- Checked endpoints: `1096`
- Valid: `1081`
- Invalid: `15`
- Recovered via sitemap: `20`
- No-source rows: `0`
- Sitemap fallback checks: checked `35`, attempted `35`, success `20`, failed `15`, no-candidate `0`, candidates `582`
- Snapshot date: `03/08/2026`
- RSS ingest baseline: `2026-03-04`
- RSS daily window: `1d` (runner: worker)
- Source artifact: `audits/readme_rss_health_latest.json`

### Failure reasons
|Reason|Count|
|---|---:|
|HTML_RETURNED|6|
|HTTP_403|4|
|HTTP_500|2|
|TIMEOUT|2|
|HTTP_404|1|

### Invalid feeds by reason

#### HTML_RETURNED (6)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Japan|Diamond Online|<https://diamond.jp/list/feed/rss>|200|
|Japan|Goo News (Business)|<https://news.goo.ne.jp/rss/topstories/business/index.rdf>|200|
|Japan|Goo News (Politics)|<https://news.goo.ne.jp/rss/topstories/politics/index.rdf>|200|
|Saudi Arabia|Gulf Business (Saudi Section)|<https://gulfbusiness.com/region/saudi-arabia/feed/>|200|
|Turkey|Hurriyet (Saglk)|<http://www.hurriyet.com.tr/rss/saglik>|200|
|United States|Seattle Times|<https://seattletimes.com/feed>|202|

#### HTTP_403 (4)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|France|Le Telegramme|<https://www.letelegramme.fr/rss.xml>|403|
|Indonesia|Tempo.co (Politics and Investigations)|<https://tempo.co/rss>|403|
|Uruguay|El Pais - Economia|<https://www.elpais.com.uy/rss/economia-y-mercado>|403|
|Uruguay|El Pais - Portada|<https://www.elpais.com.uy/rss>|403|

#### HTTP_500 (2)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|India|Odishabarta|<https://odishabarta.com/feed>|500|
|Poland|TVN24 Najnowsze (TVN24 News)|<https://tvn24.pl/najnowsze.xml>|500|

#### TIMEOUT (2)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Canada|CBC News - Business|<https://www.cbc.ca/cmlink/rss-business>|-|
|Canada|CBC News - World|<https://www.cbc.ca/cmlink/rss-world>|-|

#### HTTP_404 (1)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Brazil|CNN Brasil (Business)|<https://www.cnnbrasil.com.br/business/feed/>|404|

### Sitemap fallback successes
|Country|Outlet|Failed RSS URL|Recovered via sitemap|
|---|---|---|---|
|United States|Newsweek|<https://www.newsweek.com/rss>|<https://www.newsweek.com/googlenews.xml>|
|China|Tencent Tech (Tencent Technology News)|<https://new.qq.com/ch/tech/>|<https://news.qq.com/sitemap/sitemap_1081500468.xml>|
|Canada|CTV News - Business|<https://www.ctvnews.ca/rss/business/ctvnews-ca-business-public-rss-1.822283>|<https://www.ctvnews.ca/arc/outboundfeeds/sitemap-news/latest/>|
|Russia|Expert.ru (Economy Magazine)|<https://www.expert.ru/rss/>|<https://expert.ru/sitemap-files.xml>|
|Mexico|Forbes México|<https://www.forbes.com.mx/feed/>|<https://www.forbes.com.mx/news-sitemap.xml>|
|Indonesia|Suara (Independent News)|<https://www.suara.com/rss>|<https://www.suara.com/news/sitemap-news.xml>|
|Netherlands|RTL Z (Business)|<https://www.rtlnieuws.nl/economie/rss.xml>|<https://www.rtl.nl/sitemap-news.xml>|
|Turkey|T24 (Independent Digital Media)|<https://t24.com.tr/rss>|<https://media-cdn.t24.com.tr/media/sitemaps/authors.xml>|
|Saudi Arabia|Akhbaar24 (General Portal)|<https://akhbaar24.argaam.com/rss>|<https://www.akhbaar24.com/sitemaps/2023/3/sitemap_0.xml?v=1.1>|
|Sweden|Radio Sweden - Sweden Today (podcast xml)|<http://sverigesradio.se/Podradio/xml/SRI_en_sweToday.xml>|<https://www.sverigesradio.se/newssitemap>|
|Thailand|Thairath (News)|<http://www.thairath.co.th/rss/news.xml>|<https://www.thairath.co.th/sitemap-news-daily.xml>|
|Thailand|Thairath (Sport)|<http://www.thairath.co.th/rss/sport.xml>|<https://www.thairath.co.th/sitemap-news-daily.xml>|
|Thailand|Bangkok Biz News (Economy)|<https://www.bangkokbiznews.com/rss/feed>|<https://image.bangkokbiznews.com/sitemap/xml/2026/sitemap_2026_03.xml>|
|Thailand|Thansettakij|<https://www.thansettakij.com/rss/feed>|<https://medias.thansettakij.com/sitemap/xml/2026/sitemap_2026_03.xml>|
|Thailand|Nation TV|<https://www.nationtv.tv/rss/feed>|<https://resource.nationtv.tv/sitemap/xml/2026/sitemap_2026_02.xml>|
|Thailand|Post Today|<https://www.posttoday.com/rss/feed>|<https://image.posttoday.com/sitemap/xml/2026/sitemap_2026_03.xml>|
|Chile|Emol - Nacional|<https://www.emol.com/rss/rss_nacional.xml>|<http://www.emol.com/sitemap/xml/sitemap1_2000.xml>|
|Chile|Emol - Economía|<https://www.emol.com/rss/rss_economia.xml>|<http://www.emol.com/sitemap/xml/sitemap1_2000.xml>|
|Chile|Pauta|<https://www.pauta.cl/feed>|<https://www.pauta.cl/sitemap_news.xml>|
|Dominican Republic|Acento - Author Feed|<https://acento.com.do/author/jcastillo/feed/>|<https://acento.com.do/sitemaps/sitemaps-googlenews.xml>|

### No-source rows
- none
### United States (US)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|The New York Times|<https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml>|200|03/08/2026|valid|67|1974|
2|Wall Street Journal|<https://feeds.a.dj.com/rss/RSSWorldNews.xml>|200|03/08/2026|valid|80|1540|
3|LA Times|<https://www.latimes.com/local/rss2.0.xml>|200|03/08/2026|valid|380|7344|
4|CNN|<http://rss.cnn.com/rss/cnn_topstories.rss>|200|03/08/2026|valid|228|4389|
5|Fox News|<http://moxie.foxnews.com/google-publisher/latest.xml>|200|03/08/2026|valid|100|1925|
6|NBC News|<http://feeds.nbcnews.com/nbcnews/public/news>|200|03/08/2026|valid|100|1925|
7|CBS News|<https://www.cbsnews.com/latest/rss/main>|200|03/08/2026|valid|120|2310|
8|ABC News|<https://abcnews.go.com/abcnews/topstories>|200|03/08/2026|valid|100|1925|
9|NPR|<https://feeds.npr.org/1001/rss.xml>|200|03/08/2026|valid|40|770|
10|HuffPost|<https://www.huffpost.com/section/front-page/feed>|200|03/08/2026|valid|0|0|
11|BuzzFeed News|<https://www.buzzfeednews.com/news.xml>|200|03/08/2026|valid|160|3080|
12|Vox|<https://www.vox.com/rss/index.xml>|200|03/08/2026|valid|40|770|
13|CNBC|<https://www.cnbc.com/id/100003114/device/rss/rss.html>|200|03/08/2026|valid|120|2310|
14|Financial Times|<https://www.ft.com/?format=rss>|200|03/08/2026|valid|42|917|
15|Forbes|<https://www.forbes.com/most-popular/feed/>|200|03/08/2026|valid|44|847|
16|Fortune|<https://fortune.com/feed>|200|03/08/2026|valid|40|770|
17|Business Insider|<https://www.businessinsider.com/rss>|200|03/08/2026|valid|80|1540|
18|MarketWatch|<http://feeds.marketwatch.com/marketwatch/topstories/>|200|03/08/2026|valid|40|770|
19|Fast Company|<https://www.fastcompany.com/rss>|200|03/08/2026|valid|74|1480|
20|TechCrunch|<https://techcrunch.com/feed/>|200|03/08/2026|valid|80|1540|
21|The Verge|<https://www.theverge.com/rss/index.xml>|200|03/08/2026|valid|40|770|
22|Wired|<https://www.wired.com/feed/rss>|200|03/08/2026|valid|200|3850|
23|Ars Technica|<http://feeds.arstechnica.com/arstechnica/index>|200|03/08/2026|valid|80|1540|
24|Engadget|<https://www.engadget.com/rss.xml>|200|03/08/2026|valid|200|3850|
25|VentureBeat|<https://venturebeat.com/feed/>|200|03/08/2026|valid|28|539|
26|Mashable|<https://mashable.com/feed>|200|03/08/2026|valid|400|7700|
27|Gizmodo|<https://gizmodo.com/rss>|200|03/08/2026|valid|80|1540|
28|CNET|<https://www.cnet.com/rss/news/>|200|03/08/2026|valid|100|1925|
29|ZDNet|<https://www.zdnet.com/news/rss.xml>|200|03/08/2026|valid|80|1520|
30|The Hill|<https://thehill.com/feed>|200|03/08/2026|valid|400|7500|
31|Axios|<https://api.axios.com/feed/>|200|03/08/2026|valid|400|7700|
32|Breitbart|<http://feeds.feedburner.com/breitbart>|200|03/08/2026|valid|197|3823|
33|National Review|<https://www.nationalreview.com/feed/>|200|03/08/2026|valid|80|1540|
34|Slate|<https://slate.com/feeds/all.rss>|200|03/08/2026|valid|100|1925|
35|The New Yorker|<https://www.newyorker.com/feed/everything>|200|03/08/2026|valid|200|3850|
36|The Atlantic|<https://www.theatlantic.com/feed/all/>|200|03/08/2026|valid|100|1925|
37|Boston Globe|<https://www.bostonglobe.com/arc/outboundfeeds/rss?outputType=xml>|200|03/08/2026|valid|400|7600|
38|New York Post|<https://nypost.com/feed>|200|03/08/2026|valid|82|1699|
39|Chicago Tribune|<https://chicagotribune.com/feed>|200|03/08/2026|valid|40|770|
40|Seattle Times|<https://seattletimes.com/feed>|202 (HTML_RETURNED)|03/08/2026|invalid|130|1007|
41|Denver Post|<https://denverpost.com/feed>|200|03/08/2026|valid|40|710|
42|San Jose Mercury News|<https://mercurynews.com/feed>|200|03/08/2026|valid|40|770|
43|Las Vegas Review-Journal|<https://reviewjournal.com/feed>|200|03/08/2026|valid|120|2310|
44|San Diego Union-Tribune|<https://sandiegouniontribune.com/feed>|200|03/08/2026|valid|400|7700|
45|Honolulu Star-Advertiser|<https://staradvertiser.com/feed>|200|03/08/2026|valid|160|3080|
46|Variety|<https://variety.com/feed>|200|03/08/2026|valid|40|770|
47|The Hollywood Reporter|<https://hollywoodreporter.com/feed>|200|03/08/2026|valid|40|770|
48|Deadline|<https://deadline.com/feed>|200|03/08/2026|valid|48|924|
49|Rolling Stone|<https://rollingstone.com/feed>|200|03/08/2026|valid|40|770|
50|Billboard|<https://billboard.com/feed>|200|03/08/2026|valid|40|770|
51|Vanity Fair|<http://feeds.feedburner.com/vfdotcomrss>|200|03/08/2026|valid|140|2695|
52|Esquire|<https://www.esquire.com/rss/entertainment.xml>|200|03/08/2026|valid|200|3850|
53|GQ|<https://www.gq.com/feed/rss>|200|03/08/2026|valid|120|2310|
54|Space.com|<https://www.space.com/feeds/all>|200|03/08/2026|valid|200|3850|
55|ESPN|<https://www.espn.com/espn/rss/news>|200|03/08/2026|valid|126|3210|
56|Sports Illustrated|<https://si.com/feed>|200|03/08/2026|valid|359|6805|
57|Mother Jones|<https://motherjones.com/feed>|200|03/08/2026|valid|0|420|
58|ProPublica|<https://propublica.org/feed>|200|03/08/2026|valid|40|770|
59|Reason|<https://reason.com/feed>|200|03/08/2026|valid|192|3696|
60|Jacobin|<https://jacobin.com/feed>|200|03/08/2026|valid|80|1520|
61|Quartz|<https://qz.com/feed>|200|03/08/2026|valid|200|3850|
62|The Intercept|<https://theintercept.com/feed>|200|03/08/2026|valid|80|1540|
63|Newsweek|<https://www.newsweek.com/rss>|Recovered via sitemap|03/08/2026|valid|80|1140|
64|Time|<https://time.com/feed>|200|03/08/2026|valid|400|7700|
65|PBS NewsHour|<https://www.pbs.org/newshour/feeds/rss/headlines>|200|03/08/2026|valid|80|1540|

### China (CN)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|China Daily|<http://www.chinadaily.com.cn/rss/world_rss.xml>|200|03/08/2026|valid|400|7700|
2|TechNode|<https://technode.com/feed>|200|03/08/2026|valid|480|9240|
3|South China Morning Post|<https://www.scmp.com/rss/91/feed>|200|03/08/2026|valid|200|3850|
4|Initium|<https://theinitium.com/feed>|200|03/08/2026|valid|60|1155|
5|Liberty Times|<https://news.ltn.com.tw/rss/all.xml>|200|03/08/2026|valid|160|3080|
6|People China|<https://people.com.cn/rss/politics.xml>|200|03/08/2026|valid|400|7700|
7|China Daily English|<https://www.chinadaily.com.cn/rss/world_rss.xml>|200|03/08/2026|valid|400|7700|
8|China Daily - China|<http://www.chinadaily.com.cn/rss/china_rss.xml>|200|03/08/2026|valid|400|7700|
9|China Daily - BizChina|<http://www.chinadaily.com.cn/rss/bizchina_rss.xml>|200|03/08/2026|valid|400|7700|
10|China Daily - Opinion|<http://www.chinadaily.com.cn/rss/opinion_rss.xml>|200|03/08/2026|valid|480|9240|
11|China Daily - Sports|<http://www.chinadaily.com.cn/rss/sports_rss.xml>|200|03/08/2026|valid|400|7700|
12|China Daily - Entertainment|<http://www.chinadaily.com.cn/rss/entertainment_rss.xml>|200|03/08/2026|valid|480|9240|
13|China Daily - Lifestyle|<http://www.chinadaily.com.cn/rss/lifestyle_rss.xml>|200|03/08/2026|valid|400|7700|
14|China Daily - Photos|<http://www.chinadaily.com.cn/rss/photo_rss.xml>|200|03/08/2026|valid|480|9240|
15|China Daily - China Daily (main)|<http://www.chinadaily.com.cn/rss/cndy_rss.xml>|200|03/08/2026|valid|480|9240|
16|China Daily - HK Edition|<http://www.chinadaily.com.cn/rss/hk_rss.xml>|200|03/08/2026|valid|480|9240|
17|China Daily - USA (kindle)|<http://usa.chinadaily.com.cn/usa_kindle.xml>|needs check|03/08/2026|needs verification|0|0|
18|China Daily - EU Weekly|<http://europe.chinadaily.com.cn/euweekly_rss.xml>|200|03/08/2026|valid|480|9240|
19|People.cn - Politics|<http://www.people.com.cn/rss/politics.xml>|200|03/08/2026|valid|400|7700|
20|People.cn - Society|<http://www.people.com.cn/rss/society.xml>|200|03/08/2026|valid|400|7700|
21|People.cn - Legal|<http://www.people.com.cn/rss/legal.xml>|200|03/08/2026|valid|400|7700|
22|People.cn - World|<http://www.people.com.cn/rss/world.xml>|200|03/08/2026|valid|400|7700|
23|People.cn - Opinion|<http://www.people.com.cn/rss/opinion.xml>|200|03/08/2026|valid|400|7700|
24|People.cn - ChinaPic|<http://www.people.com.cn/rss/chinapic.xml>|200|03/08/2026|valid|400|7700|
25|CGTN Documentary|<https://news.cgtn.com/rss/documentary/CGTN-Documentary.rss>|200|03/08/2026|valid|8|152|
26|Zaobao (realtime)|<https://www.zaobao.com.sg/rss/realtime>|needs check|03/08/2026|needs verification|0|0|
27|RTHK|<https://rthk.hk/rthk/news/rss/c_expressnews_clocal.xml>|200|03/08/2026|valid|80|1540|
28|FT Chinese|<http://www.ftchinese.com/rss/feed>|200|03/08/2026|valid|80|1480|
29|Xinhua|<http://www.xinhuanet.com/politics/news_politics.xml>|200|03/08/2026|valid|0|0|
30|Sina Finance (Top Financial Portal)|<https://rss.sina.com.cn/roll/finance/hot_roll.xml>|needs check|03/08/2026|needs verification|0|0|
31|Sina News (General Breaking News)|<https://rss.sina.com.cn/news/world/focus15.xml>|200|03/08/2026|valid|60|1155|
32|HK01 (Hong Kong Digital Media Top Feed)|<https://www.hk01.com/rss>|needs check|03/08/2026|needs verification|0|0|
33|Ming Pao (Hong Kong Flagship Newspaper)|<https://news.mingpao.com/rss/pns/s00001.xml>|200|03/08/2026|valid|44|1337|
34|HKET (Hong Kong Economic Times)|<https://www.hket.com/rss/hongkong>|needs check|03/08/2026|needs verification|0|33|
35|Tencent Tech (Tencent Technology News)|<https://new.qq.com/ch/tech/>|Recovered via sitemap|03/08/2026|valid|0|0|

### Japan (JP)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|NHK World (EN)|<https://www3.nhk.or.jp/rss/news/cat0.xml>|200|03/08/2026|valid|28|539|
2|Mainichi (Biz)|<https://mainichi.jp/rss/etc/english_latest.rss>|needs check|03/08/2026|needs verification|0|0|
3|Asahi Shimbun|<https://www.asahi.com/rss/asahi/newsheadlines.rdf>|needs check|03/08/2026|needs verification|0|0|
4|The Japan Times|<https://www.japantimes.co.jp/feed/>|200|03/08/2026|valid|120|2310|
5|Automotive Ten-Navi|<https://automotive.ten-navi.com/rss/>|200|03/08/2026|valid|0|0|
6|The Bridge|<https://thebridge.jp/feed/>|needs check|03/08/2026|needs verification|0|0|
7|Nippon|<https://www.nippon.com/en/feed/>|200|03/08/2026|valid|80|1540|
8|NHK News Web - cat1|<https://www3.nhk.or.jp/rss/news/cat1.xml>|200|03/08/2026|valid|480|9240|
9|NHK News Web - cat2|<https://www3.nhk.or.jp/rss/news/cat2.xml>|200|03/08/2026|valid|92|1777|
10|NHK News Web - cat3|<https://www3.nhk.or.jp/rss/news/cat3.xml>|200|03/08/2026|valid|91|1690|
11|NHK News Web - cat4|<https://www3.nhk.or.jp/rss/news/cat4.xml>|200|03/08/2026|valid|399|7288|
12|NHK News Web - cat5|<https://www3.nhk.or.jp/rss/news/cat5.xml>|200|03/08/2026|valid|300|5891|
13|NHK News Web - cat6|<https://www3.nhk.or.jp/rss/news/cat6.xml>|200|03/08/2026|valid|480|9240|
14|NHK News Web - cat7|<https://www3.nhk.or.jp/rss/news/cat7.xml>|200|03/08/2026|valid|394|5494|
15|ITmedia - |<https://rss.itmedia.co.jp/rss/2.0/itmedia_all.xml>|200|03/08/2026|valid|200|3850|
16|ITmedia - TOP STORIES|<https://rss.itmedia.co.jp/rss/2.0/topstory.xml>|200|03/08/2026|valid|80|1540|
17|ITmedia NEWS - ()|<https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml>|200|03/08/2026|valid|200|3850|
18|ITmedia NEWS - |<https://rss.itmedia.co.jp/rss/2.0/news_domestic.xml>|200|03/08/2026|valid|120|2310|
19|ITmedia NEWS - |<https://rss.itmedia.co.jp/rss/2.0/news_foreign.xml>|200|03/08/2026|valid|120|2310|
20|ITmedia NEWS - |<https://rss.itmedia.co.jp/rss/2.0/news_products.xml>|200|03/08/2026|valid|120|2310|
21|ITmedia NEWS - |<https://rss.itmedia.co.jp/rss/2.0/news_security.xml>|200|03/08/2026|valid|120|2310|
22|ITmedia NEWS - |<https://rss.itmedia.co.jp/rss/2.0/news_technology.xml>|200|03/08/2026|valid|120|2310|
23|ITmedia NEWS - |<https://rss.itmedia.co.jp/rss/2.0/news_nettopics.xml>|200|03/08/2026|valid|120|2310|
24|ITmedia NEWS - |<https://rss.itmedia.co.jp/rss/2.0/news_industry.xml>|200|03/08/2026|valid|120|2310|
25|ITmedia NEWS - Special|<https://rss.itmedia.co.jp/rss/2.0/news_special.xml>|200|03/08/2026|valid|120|2310|
26|ITmedia AI+|<https://rss.itmedia.co.jp/rss/2.0/aiplus.xml>|200|03/08/2026|valid|80|1540|
27|ITmedia Mobile|<https://rss.itmedia.co.jp/rss/2.0/mobile.xml>|200|03/08/2026|valid|80|1540|
28|ITmedia PC USER|<https://rss.itmedia.co.jp/rss/2.0/pcuser.xml>|200|03/08/2026|valid|80|1540|
29|ITmedia |<https://rss.itmedia.co.jp/rss/2.0/business.xml>|200|03/08/2026|valid|80|1540|
30|ITmedia |<https://rss.itmedia.co.jp/rss/2.0/enterprise.xml>|200|03/08/2026|valid|200|3850|
31|J-CAST ()|<https://www.j-cast.com/index.xml>|200|03/08/2026|valid|224|4312|
32|J-CAST|<https://www.j-cast.com/trend/index.xml>|200|03/08/2026|valid|12|355|
33|J-CAST|<https://www.j-cast.com/kaisha/index.xml>|200|03/08/2026|valid|4|77|
34|BOOK|<https://books.j-cast.com/rss.xml>|needs check|03/08/2026|needs verification|0|0|
35|INTERNET Watch (Impress)|<https://internet.watch.impress.co.jp/data/rss/1.0/iw/feed.rdf>|needs check|03/08/2026|needs verification|0|0|
36|Impress Watch ()|<https://www.watch.impress.co.jp/data/rss/1.0/ipw/feed.rdf>|needs check|03/08/2026|needs verification|0|0|
37|GIGAZINE (Atom)|<https://gigazine.net/news/rss_atom/>|200|03/08/2026|valid|120|2310|
38|PR TIMES ()|<https://prtimes.jp/index.rdf>|needs check|03/08/2026|needs verification|0|0|
39|Yahoo Japan - Business|<https://news.yahoo.co.jp/rss/topics/business.xml>|200|03/08/2026|valid|32|616|
40|Yahoo Japan - World|<https://news.yahoo.co.jp/rss/topics/world.xml>|200|03/08/2026|valid|32|616|
41|Yahoo Japan - IT/Tech|<https://news.yahoo.co.jp/rss/topics/it.xml>|200|03/08/2026|valid|32|616|
42|Reuters Japan|<https://news.yahoo.co.jp/rss/media/reut/all.xml>|needs check|03/08/2026|needs verification|0|0|
43|Bloomberg Japan|<https://news.yahoo.co.jp/rss/media/bloom_st/all.xml>|needs check|03/08/2026|needs verification|0|0|
44|Forbes Japan|<https://news.yahoo.co.jp/rss/media/fminfo/all.xml>|needs check|03/08/2026|needs verification|0|0|
45|Kyodo News|<https://news.yahoo.co.jp/rss/media/kyodonews/all.xml>|200|03/08/2026|valid|200|3850|
46|Toyo Keizai|<https://toyokeizai.net/list/feed/rss>|200|03/08/2026|valid|80|1540|
47|Diamond Online|<https://diamond.jp/list/feed/rss>|200 (HTML_RETURNED)|03/08/2026|invalid|0|0|
48|Sankei News Flash|<https://www.sankei.com/rss/news/flash.xml>|needs check|03/08/2026|needs verification|0|0|
49|Sankei Economy|<https://www.sankei.com/rss/news/economy.xml>|needs check|03/08/2026|needs verification|0|0|
50|CNET Japan|<https://feeds.japan.cnet.com/rss/cnet/all.rdf>|needs check|03/08/2026|needs verification|0|0|
51|Wired Japan|<https://wired.jp/feed/rss2>|needs check|03/08/2026|needs verification|0|0|
52|Boundless (TechCrunch Japan Archive)|<https://news.yahoo.co.jp/rss/media/boundless/all.xml>|needs check|03/08/2026|needs verification|0|0|
53|Smart Japan|<https://rss.itmedia.co.jp/rss/2.0/smartjapan.xml>|200|03/08/2026|valid|80|1540|
54|Nikkei|<https://assets.nikkei.jp/release/v1/rss/news.xml>|needs check|03/08/2026|needs verification|0|0|
55|Yomiuri Latest|<https://assets.yomiuri.co.jp/rss/latestnews.rdf>|needs check|03/08/2026|needs verification|0|0|
56|Mainichi Flash|<https://mainichi.jp/rss/etc/mainichi-flash.rss>|needs check|03/08/2026|needs verification|0|0|
57|Gizmodo Japan|<https://www.gizmodo.jp/index.xml>|200|03/08/2026|valid|100|1925|
58|PR TIMES - Business/Economy|<https://prtimes.jp/business.rdf>|needs check|03/08/2026|needs verification|0|0|
59|PR TIMES - Technology|<https://prtimes.jp/technology.rdf>|needs check|03/08/2026|needs verification|0|0|
60|Goo News (Business)|<https://news.goo.ne.jp/rss/topstories/business/index.rdf>|200 (HTML_RETURNED)|03/08/2026|invalid|0|0|
61|Goo News (Politics)|<https://news.goo.ne.jp/rss/topstories/politics/index.rdf>|200 (HTML_RETURNED)|03/08/2026|invalid|0|0|
62|Newsweek Japan|<https://www.newsweekjapan.jp/headlines.rss>|needs check|03/08/2026|needs verification|0|0|
63|JBpress (Japan Business Press)|<https://jbpress.ismedia.jp/list/feed/rss>|200|03/08/2026|valid|80|1540|
64|TechCrunch Japan|<https://jp.techcrunch.com/feed/>|needs check|03/08/2026|needs verification|0|0|
65|President Online (Business)|<https://president.jp/list/feed/rss>|needs check|03/08/2026|needs verification|0|0|
66|Zenn (Tech)|<https://zenn.dev/feed>|200|03/08/2026|valid|80|1540|
67|NHK News (Politics - Category 1)|<https://www.nhk.or.jp/rss/news/cat1.xml>|200|03/08/2026|valid|480|9240|
68|NHK News (Economy/Business - Category 3)|<https://www.nhk.or.jp/rss/news/cat3.xml>|200|03/08/2026|valid|91|1667|
69|Nikkan Kogyo (Industrial Manufacturing News)|<https://www.nikkan.co.jp/rss/news>|needs check|03/08/2026|needs verification|0|0|
70|Livedoor News (General Top Stories)|<https://news.livedoor.com/topics/rss/top.xml>|200|03/08/2026|valid|83|1720|
71|Livedoor News (Economy)|<https://news.livedoor.com/topics/rss/eco.xml>|200|03/08/2026|valid|48|914|
72|GIGAZINE (Tech)|<https://gigazine.net/news/rss_2.0/>|200|03/08/2026|valid|120|2310|
73|Qiita (Japanese IT Trends)|<https://qiita.com/popular-items/feed>|200|03/08/2026|valid|120|2310|
74|Minkabu (Stocks/Investing)|<https://minkabu.jp/news/feed>|needs check|03/08/2026|needs verification|0|0|
75|Tokyo Shimbun General News|<https://www.tokyo-np.co.jp/rss/news>|needs check|03/08/2026|needs verification|0|0|
76|ASCII.jp Mac Tech|<https://ascii.jp/mac/rss.xml>|200|03/08/2026|valid|300|5775|
77|Business Insider Japan|<https://www.businessinsider.jp/feed/index.xml>|200|03/08/2026|valid|80|1540|
78|Hatena Bookmark Economy|<https://b.hatena.ne.jp/hotentry/economics.rss>|needs check|03/08/2026|needs verification|0|0|
79|Hatena Bookmark IT|<https://b.hatena.ne.jp/hotentry/it.rss>|needs check|03/08/2026|needs verification|0|0|
80|Hatena Bookmark Social|<https://b.hatena.ne.jp/hotentry/social.rss>|needs check|03/08/2026|needs verification|0|0|
81|AFP BB News|<https://feeds.afpbb.com/afpbb/news/all>|needs check|03/08/2026|needs verification|0|0|

### Germany (DE)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Handelsblatt - Top|<https://www.handelsblatt.com/contentexport/feed/top-themen>|200|03/08/2026|valid|96|2004|
2|Handelsblatt - Finance|<https://www.handelsblatt.com/contentexport/feed/finanzen>|200|03/08/2026|valid|80|1540|
3|Tagesschau|<https://www.tagesschau.de/xml/rss2>|200|03/08/2026|valid|160|3080|
4|Der Spiegel|<https://www.spiegel.de/schlagzeilen/tops/index.rss>|200|03/08/2026|valid|102|1555|
5|FAZ|<https://www.faz.net/rss/aktuell/>|200|03/08/2026|valid|280|5853|
6|Die Zeit|<https://newsfeed.zeit.de/index>|200|03/08/2026|valid|60|1155|
7|Manager Magazin|<https://www.manager-magazin.de/unternehmen/index.rss>|200|03/08/2026|valid|80|1540|
8|WirtschaftsWoche|<https://www.wiwo.de/contentexport/feed/rss/schlagzeilen>|200|03/08/2026|valid|80|1540|
9|Deutsche Welle (EN)|<https://rss.dw.com/xml/rss-en-all>|200|03/08/2026|valid|480|9240|
10|Heise Online|<https://www.heise.de/rss/heise-atom.xml>|200|03/08/2026|valid|480|9240|
11|Der Spiegel|<https://www.spiegel.de/schlagzeilen/index.rss>|200|03/08/2026|valid|120|2310|
12|Die Welt|<https://www.welt.de/feeds/topnews.rss>|200|03/08/2026|valid|76|1689|
13|Focus|<https://www.focus.de/rss/>|200|03/08/2026|valid|480|9240|
14|Handelsblatt Economy|<https://www.handelsblatt.com/contentexport/feed/finanzen/>|200|03/08/2026|valid|80|1540|
15|Frankfurter Allgemeine|<https://www.faz.net/rss/aktuell/wirtschaft/>|200|03/08/2026|valid|92|1771|
16|Tagesspiegel|<https://www.tagesspiegel.de/contentexport/feed/>|200|03/08/2026|valid|400|7700|
17|Handelsblatt World|<https://www.handelsblatt.com/contentexport/feed/wirtschaft>|200|03/08/2026|valid|80|1540|
18|Zeit Welt|<https://newsfeed.zeit.de/wirtschaft/index>|200|03/08/2026|valid|60|1155|
19|Financial Times Germany|<https://www.ft.com/rss/home>|200|03/08/2026|valid|38|890|
20|Suddeutsche - Top-Themen|<https://rss.sueddeutsche.de/rss/Topthemen>|200|03/08/2026|valid|60|1155|
21|Suddeutsche - Alles|<https://rss.sueddeutsche.de/rss/Alles>|200|03/08/2026|valid|60|1155|
22|Suddeutsche - Eilmeldungen|<https://rss.sueddeutsche.de/rss/Eilmeldungen>|200|03/08/2026|valid|60|1155|
23|Suddeutsche - Politik|<https://rss.sueddeutsche.de/rss/Politik>|200|03/08/2026|valid|60|1155|
24|Suddeutsche - Wirtschaft|<https://rss.sueddeutsche.de/rss/Wirtschaft>|200|03/08/2026|valid|60|1155|
25|Suddeutsche - Panorama|<https://rss.sueddeutsche.de/rss/Panorama>|200|03/08/2026|valid|60|1155|
26|Suddeutsche - Sport|<https://rss.sueddeutsche.de/rss/Sport>|200|03/08/2026|valid|60|1155|
27|Suddeutsche - Munchen|<https://rss.sueddeutsche.de/rss/Muenchen>|200|03/08/2026|valid|60|1155|
28|Suddeutsche - Bayern|<https://rss.sueddeutsche.de/rss/Bayern>|200|03/08/2026|valid|60|1155|
29|Suddeutsche - Kultur|<https://rss.sueddeutsche.de/rss/Kultur>|200|03/08/2026|valid|60|1155|
30|Suddeutsche - Medien|<https://rss.sueddeutsche.de/rss/Medien>|200|03/08/2026|valid|60|1155|
31|Suddeutsche - Wissen|<https://rss.sueddeutsche.de/rss/Wissen>|200|03/08/2026|valid|60|1155|
32|Suddeutsche - Gesundheit|<https://rss.sueddeutsche.de/rss/Gesundheit>|200|03/08/2026|valid|60|1155|
33|Suddeutsche - Karriere|<https://rss.sueddeutsche.de/rss/Karriere>|200|03/08/2026|valid|60|1155|
34|Suddeutsche - Bildung|<https://rss.sueddeutsche.de/rss/Bildung>|200|03/08/2026|valid|60|1155|
35|Suddeutsche - Reise|<https://rss.sueddeutsche.de/rss/Reise>|200|03/08/2026|valid|60|1155|
36|Suddeutsche - Auto|<https://rss.sueddeutsche.de/rss/Auto>|200|03/08/2026|valid|60|1155|
37|Suddeutsche - Stil|<https://rss.sueddeutsche.de/rss/Stil>|200|03/08/2026|valid|60|1155|
38|Deutschlandfunk - Nachrichten|<https://www.deutschlandfunk.de/nachrichten-100.rss>|200|03/08/2026|valid|94|2189|
39|Deutschlandfunk - Politikportal|<https://www.deutschlandfunk.de/politikportal-100.rss>|200|03/08/2026|valid|468|9032|
40|Deutschlandfunk - Wirtschaft|<https://www.deutschlandfunk.de/wirtschaft-106.rss>|200|03/08/2026|valid|480|9240|
41|Deutschlandfunk - Wissen|<https://www.deutschlandfunk.de/wissen-106.rss>|200|03/08/2026|valid|480|9240|
42|Deutschlandfunk - Kulturportal|<https://www.deutschlandfunk.de/kulturportal-100.rss>|200|03/08/2026|valid|480|9240|
43|Deutschlandfunk - Europa|<https://www.deutschlandfunk.de/europa-112.rss>|200|03/08/2026|valid|480|9240|
44|Deutschlandfunk - Gesellschaft|<https://www.deutschlandfunk.de/gesellschaft-106.rss>|200|03/08/2026|valid|480|9240|
45|Deutschlandfunk - Sportportal|<https://www.deutschlandfunk.de/sportportal-100.rss>|200|03/08/2026|valid|444|8547|
46|taz.de (gesamt)|<https://taz.de/!a=;rss/>|needs check|03/08/2026|needs verification|0|0|
47|Tagesschau|<https://www.tagesschau.de/xml/rss2/>|200|03/08/2026|valid|160|3080|

### India (IN)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|The Times of India (Top Stories)|<https://timesofindia.indiatimes.com/rssfeedstopstories.cms>|200|03/08/2026|valid|184|3360|
2|NDTV (Latest)|<https://feeds.feedburner.com/NDTV-LatestNews>|200|03/08/2026|valid|80|1520|
3|India Today (India)|<https://www.indiatoday.in/rss/1206578>|200|03/08/2026|valid|80|1540|
4|The Indian Express|<https://indianexpress.com/feed>|200|03/08/2026|valid|480|9240|
5|The Hindu (National)|<https://www.thehindu.com/news/national/?service=rss>|200|03/08/2026|valid|400|7700|
6|Firstpost|<https://www.firstpost.com/commonfeeds/v1/mfp/rss/web-stories.xml>|200|03/08/2026|valid|480|9240|
7|DNA India (India)|<https://www.dnaindia.com/feeds/india.xml>|200|03/08/2026|valid|80|1540|
8|Storify News|<https://www.storifynews.com/feed>|200|03/08/2026|valid|428|7597|
9|Amar Ujala (Breaking)|<https://www.amarujala.com/rss/breaking-news.xml>|200|03/08/2026|valid|44|847|
10|Odishabarta|<https://odishabarta.com/feed>|500 (HTTP_500)|03/08/2026|invalid|30|760|
11|The Times of Bengal|<https://thetimesofbengal.com/feed>|200|03/08/2026|valid|20|660|
12|Scroll.in|<https://feeds.feedburner.com/ScrollinArticles.rss>|200|03/08/2026|valid|400|7700|
13|Northlines|<https://thenorthlines.com/feed>|needs check|03/08/2026|needs verification|0|0|
14|Chandigarh Metro|<https://chandigarhmetro.com/feed>|200|03/08/2026|valid|40|750|
15|Chandigarh City News|<https://feeds.feedburner.com/ChandigarhCityNews>|200|03/08/2026|valid|40|770|
16|The Quint|<https://prod-qt-images.s3.amazonaws.com/production/thequint/feed.xml>|200|03/08/2026|valid|80|1540|
17|Telangana Today|<https://telanganatoday.com/feed>|200|03/08/2026|valid|480|9120|
18|News Today (TN)|<https://newstodaynet.com/feed>|200|03/08/2026|valid|40|750|
19|IndiaVision|<https://www.indiavision.com/feed>|200|03/08/2026|valid|100|1925|
20|OpIndia|<https://www.opindia.com/feed>|200|03/08/2026|valid|40|770|
21|OrissaPOST|<https://www.orissapost.com/feed>|200|03/08/2026|valid|80|1540|
22|India's News.Net|<https://feeds.indiasnews.net/rss/701ee96610c884a6>|200|03/08/2026|valid|400|7700|
23|TechGenYZ|<https://techgenyz.com/feed>|200|03/08/2026|valid|40|750|
24|WYM News (Blogspot)|<https://latestnewsupdate4you.blogspot.com/feeds/posts/default>|200|03/08/2026|valid|100|1925|
25|Star of Mysore|<https://starofmysore.com/feed>|200|03/08/2026|valid|40|770|
26|ABP News|<https://news.abplive.com/home/feed>|200|03/08/2026|valid|84|1556|
27|The India Bizz|<https://theindiabizz.com/feed>|200|03/08/2026|valid|40|710|

### United Kingdom (GB)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Financial Times - World|<https://www.ft.com/rss/world>|200|03/08/2026|valid|100|1925|
2|Financial Times - Energy|<https://www.ft.com/rss/companies/energy>|200|03/08/2026|valid|100|1925|
3|BBC News - Business|<https://feeds.bbci.co.uk/news/business/rss.xml>|200|03/08/2026|valid|236|4464|
4|BBC News - World|<https://feeds.bbci.co.uk/news/world/rss.xml>|200|03/08/2026|valid|104|2118|
5|The Guardian - World|<https://www.theguardian.com/world/rss>|200|03/08/2026|valid|180|3465|
6|The Guardian - Business|<https://www.theguardian.com/business/rss>|200|03/08/2026|valid|80|1536|
7|Sky News - World|<https://feeds.skynews.com/feeds/rss/world.xml>|200|03/08/2026|valid|40|770|
8|Sky News - Business|<https://feeds.skynews.com/feeds/rss/business.xml>|200|03/08/2026|valid|40|770|
9|Telegraph - Business|<https://www.telegraph.co.uk/business/rss.xml>|200|03/08/2026|valid|480|9237|
10|City A.M. (London Finance)|<https://www.cityam.com/feed/>|200|03/08/2026|valid|120|2310|
11|The Independent|<https://www.independent.co.uk/rss>|200|03/08/2026|valid|400|7700|
12|Financial Times UK|<https://www.ft.com/?format=rss>|200|03/08/2026|valid|42|917|
13|The Telegraph UK|<https://www.telegraph.co.uk/rss.xml>|200|03/08/2026|valid|480|9237|
14|Daily Mail|<https://www.dailymail.co.uk/home/index.rss>|200|03/08/2026|valid|480|9240|
15|Metro UK|<https://metro.co.uk/feed/>|200|03/08/2026|valid|117|1976|
16|The Sun|<https://www.thesun.co.uk/feed/>|needs check|03/08/2026|needs verification|0|0|
17|The Guardian UK|<https://www.theguardian.com/uk/rss>|200|03/08/2026|valid|480|9240|
18|Sky News|<https://feeds.skynews.com/feeds/rss/uk.xml>|200|03/08/2026|valid|40|770|
19|Financial Times|<https://www.ft.com/rss/home>|200|03/08/2026|valid|38|891|
20|iNews|<https://inews.co.uk/rss>|200|03/08/2026|valid|40|770|
21|BBC Culture|<https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml>|200|03/08/2026|valid|108|1846|
22|The Evening Standard|<https://www.standard.co.uk/rss>|200|03/08/2026|valid|311|7544|

### France (FR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|France 24|<https://www.france24.com/en/rss>|200|03/08/2026|valid|92|1828|
2|The Local (France)|<https://feeds.thelocal.com/rss/fr>|200|03/08/2026|valid|80|1520|
3|RFI (France)|<https://www.rfi.fr/en/france/rss>|needs check|03/08/2026|needs verification|0|1830|
4|RFI (All / EN)|<https://www.rfi.fr/en/rss>|200|03/08/2026|valid|88|1694|
5|Mediapart|<https://www.mediapart.fr/articles/feed>|200|03/08/2026|valid|40|790|
6|Le Monde diplomatique|<https://mondediplo.com/backend>|needs check|03/08/2026|needs verification|0|0|
7|Sud Ouest|<https://www.sudouest.fr/essentiel/rss.xml>|200|03/08/2026|valid|80|1580|
8|L'Est Republicain|<https://www.estrepublicain.fr/rss>|200|03/08/2026|valid|80|1540|
9|France Soir|<https://www.francesoir.fr/rss.xml>|needs check|03/08/2026|needs verification|0|0|
10|Dernieres Nouvelles d'Alsace (DNA)|<https://www.dna.fr/rss>|200|03/08/2026|valid|80|1360|
11|La Croix|<https://www.la-croix.com/feeds/rss/site.xml>|200|03/08/2026|valid|200|3950|
12|La Depeche|<https://www.ladepeche.fr/rss.xml>|200|03/08/2026|valid|400|7900|
13|20 Minutes|<https://www.20minutes.fr/feeds/rss-une.xml>|200|03/08/2026|valid|120|2370|
14|Yahoo Actualites|<https://fr.news.yahoo.com/rss>|200|03/08/2026|valid|20|390|
15|InfoMigrants (EN)|<https://www.infomigrants.net/en/rss/all.xml>|needs check|03/08/2026|needs verification|0|0|
16|France Today|<https://www.francetoday.com/feed>|needs check|03/08/2026|needs verification|0|0|
17|FrenchDailyNews|<https://frenchdailynews.com/feed>|200|03/08/2026|valid|40|790|
18|Le Monde (EN  Main)|<https://www.lemonde.fr/en/rss/une.xml>|200|03/08/2026|valid|68|1335|
19|Le Monde (EN  International)|<https://www.lemonde.fr/en/international/rss_full.xml>|200|03/08/2026|valid|80|1580|
20|Le Monde (EN  Editorials)|<https://www.lemonde.fr/en/editorials/rss_full.xml>|needs check|03/08/2026|needs verification|0|1240|
21|Le Monde (EN  Europe)|<https://www.lemonde.fr/en/europe/rss_full.xml>|needs check|03/08/2026|needs verification|0|1240|
22|Le Monde (EN  United States)|<https://www.lemonde.fr/en/united-states/rss_full.xml>|needs check|03/08/2026|needs verification|0|1240|
23|Le Monde (EN  Economy)|<https://www.lemonde.fr/en/economy/rss_full.xml>|needs check|03/08/2026|needs verification|0|1240|
24|Le Monde (EN  Culture)|<https://www.lemonde.fr/en/culture/rss_full.xml>|needs check|03/08/2026|needs verification|0|1240|
25|Le Monde (EN  Sports)|<https://www.lemonde.fr/en/sports/rss_full.xml>|needs check|03/08/2026|needs verification|0|1240|
26|Le Monde (EN  Environment)|<https://www.lemonde.fr/en/environment/rss_full.xml>|200|03/08/2026|valid|80|1580|
27|Le Monde (EN  Science)|<https://www.lemonde.fr/en/science/rss_full.xml>|needs check|03/08/2026|needs verification|0|1240|
28|Les Echos (Finance/Markets)|<https://services.lesechos.fr/api/rss/univers/finance-marches>|needs check|03/08/2026|needs verification|0|0|
29|Les Echos (Tech/Media)|<https://services.lesechos.fr/api/rss/univers/tech-medias>|needs check|03/08/2026|needs verification|0|0|
30|Le Monde (Economy)|<https://www.lemonde.fr/economie/rss_full.xml>|200|03/08/2026|valid|80|1580|
31|Le Monde (Politics)|<https://www.lemonde.fr/politique/rss_full.xml>|200|03/08/2026|valid|80|1580|
32|Le Figaro (Top Stories)|<https://www.lefigaro.fr/rss/figaro_actualites.xml>|200|03/08/2026|valid|74|1528|
33|Le Figaro (Economy)|<https://www.lefigaro.fr/rss/figaro_economie.xml>|200|03/08/2026|valid|80|1580|
34|La Tribune (Economy)|<https://www.latribune.fr/feed.xml>|needs check|03/08/2026|needs verification|0|0|
35|Liberation (Society/Politics)|<https://www.liberation.fr/rss/>|needs check|03/08/2026|needs verification|0|0|
36|L'Express (Current Affairs Magazine)|<https://www.lexpress.fr/arc/outboundfeeds/rss/>|needs check|03/08/2026|needs verification|0|0|
37|Le Point (Current Affairs/Economy)|<https://www.lepoint.fr/rss.xml>|needs check|03/08/2026|needs verification|0|0|
38|France Info (Economy)|<https://www.francetvinfo.fr/economie.rss>|200|03/08/2026|valid|80|1562|
39|France Info (Politics)|<https://www.francetvinfo.fr/politique.rss>|200|03/08/2026|valid|80|1580|
40|BFM TV (Economy/Business)|<https://www.bfmtv.com/rss/economie/>|200|03/08/2026|valid|120|2370|
41|Capital.fr (Economy/Capital)|<https://www.capital.fr/rss.xml>|needs check|03/08/2026|needs verification|0|0|
42|Challenges.fr (Business)|<https://www.challenges.fr/rss.xml>|200|03/08/2026|valid|200|3950|
43|Ouest-France (Regional News/Society)|<https://www.ouest-france.fr/rss-en-continu.xml>|200|03/08/2026|valid|40|780|
44|20 Minutes (Economy Breaking)|<https://www.20minutes.fr/feeds/rss-economie.xml>|200|03/08/2026|valid|80|1580|
45|L'Obs (General Current Affairs)|<https://www.nouvelobs.com/rss.xml>|200|03/08/2026|valid|480|9480|
46|Usine Nouvelle (Industry/Energy/Manufacturing)|<https://www.usinenouvelle.com/rss/>|needs check|03/08/2026|needs verification|0|0|
47|Midi Libre|<https://www.midilibre.fr/rss.xml>|200|03/08/2026|valid|400|3900|
48|Nice-Matin|<https://www.nicematin.com/rss>|200|03/08/2026|valid|200|1950|
49|CNEWS|<https://www.cnews.fr/rss.xml>|200|03/08/2026|valid|395|3893|
50|RFI (FR)|<https://www.rfi.fr/fr/rss>|200|03/08/2026|valid|96|936|
51|France 24 (FR)|<https://www.france24.com/fr/rss>|200|03/08/2026|valid|96|898|
52|Euronews FR|<https://fr.euronews.com/rss>|200|03/08/2026|valid|200|1950|
53|Numerama|<https://www.numerama.com/feed/>|200|03/08/2026|valid|160|1560|
54|Clubic|<https://www.clubic.com/feed/news.rss>|200|03/08/2026|valid|200|1950|
55|01Net|<https://www.01net.com/rss/actualites/>|200|03/08/2026|valid|120|1170|
56|Presse Citron|<https://www.presse-citron.net/feed/>|200|03/08/2026|valid|120|1170|
57|Journal du Geek|<https://www.journaldugeek.com/feed/>|200|03/08/2026|valid|120|1170|
58|Le Progres|<https://www.leprogres.fr/rss>|200|03/08/2026|valid|80|780|
59|BFM TV|<https://www.bfmtv.com/rss/news-24-7/>|200|03/08/2026|valid|120|1170|
60|France Info|<https://www.francetvinfo.fr/titres.rss>|200|03/08/2026|valid|140|1351|
61|Le Telegramme|<https://www.letelegramme.fr/rss.xml>|403 (HTTP_403)|03/08/2026|invalid|80|760|
62|Siecle Digital|<https://siecledigital.fr/feed/>|200|03/08/2026|valid|80|780|
63|Le Monde|<https://www.lemonde.fr/rss/une.xml>|200|03/08/2026|valid|68|661|
64|Le Dauphine Libere|<https://www.ledauphine.com/rss>|200|03/08/2026|valid|80|780|
65|Mediacites|<https://www.mediacites.fr/feed/>|200|03/08/2026|valid|40|370|
66|StreetPress|<https://www.streetpress.com/rss.xml>|200|03/08/2026|valid|80|740|
67|Disclose|<https://disclose.ngo/feed/>|200|03/08/2026|valid|88|858|

### Italy (IT)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|ANSA (Main)|<https://www.ansa.it/sito/ansait_rss.xml>|200|03/08/2026|valid|112|2082|
2|ANSA (Top News)|<https://www.ansa.it/sito/notizie/topnews/topnews_rss.xml>|200|03/08/2026|valid|40|755|
3|ANSA (Cronaca)|<https://www.ansa.it/sito/notizie/cronaca/cronaca_rss.xml>|200|03/08/2026|valid|480|9123|
4|ANSA (Politica)|<https://www.ansa.it/sito/notizie/politica/politica_rss.xml>|200|03/08/2026|valid|52|1096|
5|ANSA (Mondo)|<https://www.ansa.it/sito/notizie/mondo/mondo_rss.xml>|200|03/08/2026|valid|131|3409|
6|ANSA (Economia)|<https://www.ansa.it/sito/notizie/economia/economia_rss.xml>|200|03/08/2026|valid|48|4215|
7|ANSA (Calcio)|<https://www.ansa.it/sito/notizie/sport/calcio/calcio_rss.xml>|200|03/08/2026|valid|244|4499|
8|ANSA (Sport)|<https://www.ansa.it/sito/notizie/sport/sport_rss.xml>|200|03/08/2026|valid|189|3425|
9|ANSA (Cinema)|<https://www.ansa.it/sito/notizie/cultura/cinema/cinema_rss.xml>|200|03/08/2026|valid|88|1947|
10|ANSA (Cultura e Tendenze)|<https://www.ansa.it/sito/notizie/cultura/cultura_rss.xml>|200|03/08/2026|valid|480|9121|
11|ANSA (Foto)|<https://www.ansa.it/sito/photogallery/foto_rss.xml>|200|03/08/2026|valid|480|9240|
12|ANSA (Video)|<https://www.ansa.it/sito/videogallery/video_rss.xml>|200|03/08/2026|valid|480|9122|
13|Corriere della Sera (Homepage)|<https://www.corriere.it/rss/homepage.xml>|200|03/08/2026|valid|276|5313|
14|Corriere della Sera (Ultimora)|<https://www.corriere.it/rss/ultimora.xml>|needs check|03/08/2026|needs verification|0|0|
15|Corriere della Sera (feed-hp Homepage)|<https://www.corriere.it/feed-hp/homepage.xml>|200|03/08/2026|valid|476|9161|
16|la Repubblica|<https://www.repubblica.it/rss/homepage/rss2.0.xml>|200|03/08/2026|valid|120|2280|
17|La Stampa|<https://www.lastampa.it/rss/copertina.xml>|200|03/08/2026|valid|295|5324|
18|Il Sole 24 Ore (Italia)|<https://www.ilsole24ore.com/rss/italia.xml>|200|03/08/2026|valid|48|924|
19|Il Fatto Quotidiano|<https://www.ilfattoquotidiano.it/feed/>|200|03/08/2026|valid|100|1925|
20|La Gazzetta dello Sport|<https://www.gazzetta.it/rss/home.xml>|200|03/08/2026|valid|480|9240|
21|IL Tempo|<https://www.iltempo.it/rss.xml>|200|03/08/2026|valid|240|4620|
22|Libero Quotidiano|<https://www.liberoquotidiano.it/rss.xml>|200|03/08/2026|valid|240|4620|
23|MilanoToday|<https://www.milanotoday.it/rss>|200|03/08/2026|valid|100|1725|
24|The Florentine|<https://www.theflorentine.net/feed>|needs check|03/08/2026|needs verification|0|0|
25|Wanted in Rome|<https://www.wantedinrome.com/news?format=rss>|200|03/08/2026|valid|80|1520|
26|Florence Daily News|<https://florencedailynews.com/feed>|200|03/08/2026|valid|40|770|
27|Alto Adige (Cronaca)|<https://www.altoadige.it/feed-rss/cronaca-1.169>|200|03/08/2026|valid|7|134|
28|Italia a Tavola|<https://rss.italiaatavola.net/feed.xml>|200|03/08/2026|valid|120|2310|
29|la Citta di Salerno|<https://www.lacittadisalerno.it/feed>|200|03/08/2026|valid|40|770|
30|Notizie Geopolitiche|<https://www.notiziegeopolitiche.net/feed>|200|03/08/2026|valid|40|750|

### Canada (CA)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Global News|<https://globalnews.ca/feed>|200|03/08/2026|valid|40|770|
2|rabble.ca|<https://rabble.ca/feed>|200|03/08/2026|valid|48|924|
3|National Post|<https://nationalpost.com/feed>|200|03/08/2026|valid|40|770|
4|Toronto Sun|<https://torontosun.com/feed>|200|03/08/2026|valid|40|760|
5|Financial Post|<https://feeds.feedburner.com/FP_TopStories>|200|03/08/2026|valid|40|810|
6|CityNews Toronto|<https://toronto.citynews.ca/feed>|200|03/08/2026|valid|60|1155|
7|Calgary Herald|<https://calgaryherald.com/feed>|200|03/08/2026|valid|40|770|
8|Edmonton Journal|<https://edmontonjournal.com/feed>|200|03/08/2026|valid|40|760|
9|Windsor Star|<https://windsorstar.com/feed>|200|03/08/2026|valid|40|760|
10|The Province|<https://theprovince.com/feed>|200|03/08/2026|valid|40|760|
11|Calgary Sun|<https://calgarysun.com/feed>|200|03/08/2026|valid|40|770|
12|Ottawa Sun|<https://ottawasun.com/feed>|200|03/08/2026|valid|40|770|
13|The Tyee|<https://thetyee.ca/rss2.xml>|200|03/08/2026|valid|84|1617|
14|The StarPhoenix|<https://thestarphoenix.com/feed>|200|03/08/2026|valid|40|750|
15|Edmonton Sun|<https://edmontonsun.com/feed>|200|03/08/2026|valid|40|760|
16|Canada.com|<https://o.canada.com/feed>|200|03/08/2026|valid|40|760|
17|Business In Vancouver (BIV)|<https://biv.com/rss>|200|03/08/2026|valid|80|1540|
18|Regina Leader Post|<https://leaderpost.com/feed>|200|03/08/2026|valid|40|770|
19|Owen Sound Sun Times|<https://owensoundsuntimes.com/feed>|200|03/08/2026|valid|32|616|
20|Stratford Beacon Herald|<https://stratfordbeaconherald.com/feed>|200|03/08/2026|valid|32|616|
21|The Georgia Straight|<https://straight.com/content/rss>|200|03/08/2026|valid|60|1125|
22|Grande Prairie Daily Herald Tribune|<https://dailyheraldtribune.com/feed>|200|03/08/2026|valid|32|608|
23|YGK News (Kingston)|<https://ygknews.ca/feed>|200|03/08/2026|valid|40|750|
24|Prince Albert Daily Herald|<https://paherald.sk.ca/feed>|200|03/08/2026|valid|40|770|
25|Sunny South News|<https://sunnysouthnews.com/feed>|200|03/08/2026|valid|40|770|
26|The Afro News|<https://theafronews.com/feed>|200|03/08/2026|valid|40|740|
27|CTV News - Top Stories|<https://www.ctvnews.ca/rss/ctvnews-ca-top-stories-public-rss-1.822009>|needs check|03/08/2026|needs verification|0|0|
28|CTV News - Business|<https://www.ctvnews.ca/rss/business/ctvnews-ca-business-public-rss-1.822283>|Recovered via sitemap|03/08/2026|valid|0|0|
29|Global News - Politics|<https://globalnews.ca/politics/feed/>|200|03/08/2026|valid|40|770|
30|Toronto Star - Politics|<https://www.thestar.com/search/?f=rss&t=article&c=politics&l=50&s=start_time&sd=desc>|200|03/08/2026|valid|50|1900|
31|BNN Bloomberg (Canada Biz)|<https://www.bnnbloomberg.ca/business/rss>|needs check|03/08/2026|needs verification|0|0|
32|CBC News - Business|<https://www.cbc.ca/cmlink/rss-business>|ERR (TIMEOUT)|03/08/2026|invalid|0|0|
33|CBC News - World|<https://www.cbc.ca/cmlink/rss-world>|ERR (TIMEOUT)|03/08/2026|invalid|0|0|
34|Financial Post (Economy)|<https://financialpost.com/feed>|200|03/08/2026|valid|40|770|

### Russia (RU)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|RT|<https://rt.com/feed>|200|03/08/2026|valid|400|7700|
2|The Bell|<https://thebell.io/feed>|200|03/08/2026|valid|80|1540|
3|Interfax|<https://www.interfax.ru/rss.asp>|200|03/08/2026|valid|100|1925|
4|RT Economy|<https://www.rt.com/rss/business>|200|03/08/2026|valid|400|7700|
5|The Bell|<https://thebell.io/feed/>|200|03/08/2026|valid|80|1540|
6|Lenta|<https://lenta.ru/rss/news>|200|03/08/2026|valid|480|9240|
7|TASS Finance|<https://tass.com/rss/v2.xml>|200|03/08/2026|valid|265|7163|
8|RT News|<https://www.rt.com/rss/>|200|03/08/2026|valid|400|7700|
9|Kommersant ()|<https://www.kommersant.ru/RSS/main.xml>|200|03/08/2026|valid|68|1811|
10|The Moscow Times|<https://www.themoscowtimes.com/rss/news>|200|03/08/2026|valid|200|3850|
11|PravdaReport|<https://www.pravdareport.com/export.xml>|200|03/08/2026|valid|80|1520|
12|Meduza (all)|<https://meduza.io/rss2/all>|200|03/08/2026|valid|120|2310|
13|Habr (all)|<https://habr.com/ru/rss/all/all/?fl=ru>|200|03/08/2026|valid|160|3065|
14|RIA Novosti (Russian State Broadcaster)|<https://ria.ru/export/rss2/archive/index.xml>|200|03/08/2026|valid|385|7234|
15|TASS (TASS Russian Main)|<https://tass.ru/rss/v2.xml>|200|03/08/2026|valid|400|7444|
16|RBC (Russian Finance/Economy #1)|<https://rssexport.rbc.ru/rbcnews/news/30/full.rss>|200|03/08/2026|valid|120|2310|
17|Kommersant (Economy/Business Major Daily)|<https://www.kommersant.ru/RSS/news.xml>|200|03/08/2026|valid|480|9120|
18|Vedomosti (Economy Major Daily)|<https://www.vedomosti.ru/rss/news>|200|03/08/2026|valid|480|9240|
19|Gazeta.ru (General News)|<https://www.gazeta.ru/export/rss/lenta.xml>|needs check|03/08/2026|needs verification|0|0|
20|Izvestia (Traditional Daily)|<https://iz.ru/xml/rss/all.xml>|200|03/08/2026|valid|100|1650|
21|RT Russian (RT Russian Main)|<https://russian.rt.com/rss>|200|03/08/2026|valid|200|3850|
22|Rossiyskaya Gazeta (Official Gazette)|<https://rg.ru/xml/index.xml>|200|03/08/2026|valid|400|7700|
23|Forbes Russia (Forbes Russia Edition)|<https://www.forbes.ru/newrss.xml>|200|03/08/2026|valid|80|1404|
24|BFM.ru (Business Radio)|<https://www.bfm.ru/news.rss>|200|03/08/2026|valid|200|3850|
25|Expert.ru (Economy Magazine)|<https://www.expert.ru/rss/>|Recovered via sitemap|03/08/2026|valid|0|0|
26|Finmarket.ru (Finance/Investment)|<http://www.finmarket.ru/rss/mainnews.asp>|200|03/08/2026|valid|80|1540|
27|NTV (major broadcaster)|<https://www.ntv.ru/exp/news_rss.jsp>|needs check|03/08/2026|needs verification|0|0|
28|Komsomolskaya Pravda (Mass outlet #1)|<https://www.kp.ru/rss/all.xml>|needs check|03/08/2026|needs verification|0|0|
29|Moskovsky Komsomolets (Mass outlet #2)|<https://www.mk.ru/rss/news/index.xml>|needs check|03/08/2026|needs verification|0|0|
30|Rambler News (Portal News)|<https://news.rambler.ru/rss/>|needs check|03/08/2026|needs verification|0|0|

### South Korea (KR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Yonhap (EN)|<https://en.yna.co.kr/RSS/news.xml>|200|03/08/2026|valid|409|7836|
2|Donga Ilbo|<https://rss.donga.com/total.xml>|200|03/08/2026|valid|200|3850|
3|Seoul Newspaper|<https://www.seoul.co.kr/xml/rss/rss_top.xml>|200|03/08/2026|valid|104|1986|
4|Newsis|<https://www.newsis.com/RSS/sokbo.xml>|200|03/08/2026|valid|400|7700|
5|Aju News|<https://rss.ajunews.com/sokbo.xml>|200|03/08/2026|valid|200|3850|
6|KED Global (Korea Economic Daily)|<https://www.kedglobal.com/newsRss>|needs check|03/08/2026|needs verification|0|0|
7|Daily NK (EN)|<https://www.dailynk.com/english/feed>|200|03/08/2026|valid|40|670|
8|Korea Times (RSS directory)|<https://feed.koreatimes.co.kr/k/allnews.xml>|200|03/08/2026|valid|144|3200|
9|Korea Herald (RSS directory)|<https://www.koreaherald.com/rss/newsAll>|200|03/08/2026|valid|163|2892|
10|KBS World Radio (RSS directory)|<http://world.kbs.co.kr/rss/rss_news.htm?lang=e>|needs check|03/08/2026|needs verification|0|0|
11|hankyung.com|<https://www.hankyung.com/feed/all-news>|200|03/08/2026|valid|200|3850|
12|hankyung.com|<https://www.hankyung.com/feed/finance>|200|03/08/2026|valid|200|3850|
13|hankyung.com|<https://www.hankyung.com/feed/economy>|200|03/08/2026|valid|200|3850|
14|hankyung.com|<https://www.hankyung.com/feed/realestate>|200|03/08/2026|valid|200|3850|
15|IT|<https://www.hankyung.com/feed/it>|200|03/08/2026|valid|200|3850|
16|hankyung.com|<https://www.hankyung.com/feed/politics>|200|03/08/2026|valid|200|3850|
17|hankyung.com|<https://www.hankyung.com/feed/international>|200|03/08/2026|valid|200|3850|
18|mk.co.kr|<https://www.mk.co.kr/rss/30000001/>|200|03/08/2026|valid|200|3850|
19|mk.co.kr|<https://www.mk.co.kr/rss/40300001/>|200|03/08/2026|valid|200|3850|
20|mk.co.kr|<https://www.mk.co.kr/rss/30100041/>|200|03/08/2026|valid|200|3850|
21|mk.co.kr|<https://www.mk.co.kr/rss/30200030/>|200|03/08/2026|valid|200|3850|
22|mk.co.kr|<https://www.mk.co.kr/rss/50400012/>|200|03/08/2026|valid|200|3850|
23|SBS|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=01&plink=RSSREADER>|200|03/08/2026|valid|116|2233|
24|SBS|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=02&plink=RSSREADER>|200|03/08/2026|valid|116|2233|
25|SBS|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=03&plink=RSSREADER>|200|03/08/2026|valid|116|2233|
26|SBS|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=07&plink=RSSREADER>|200|03/08/2026|valid|116|2233|
27|SBS|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=08&plink=RSSREADER>|200|03/08/2026|valid|116|2233|
28|SBS|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=14&plink=RSSREADER>|200|03/08/2026|valid|116|2233|
29|SBS|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=09&plink=RSSREADER>|200|03/08/2026|valid|116|2233|
30|hani.co.kr|<https://www.hani.co.kr/rss/international/>|200|03/08/2026|valid|0|0|
31|hani.co.kr|<https://www.hani.co.kr/rss/culture/>|200|03/08/2026|valid|0|0|
32|hani.co.kr|<https://www.hani.co.kr/rss/sports/>|200|03/08/2026|valid|0|0|
33|hanion.co.kr|<https://www.hanion.co.kr/rss/S1N1.xml>|200|03/08/2026|valid|80|1540|
34|hanion.co.kr|<https://www.hanion.co.kr/rss/S1N2.xml>|200|03/08/2026|valid|80|1540|
35|hanion.co.kr|<https://www.hanion.co.kr/rss/S1N3.xml>|200|03/08/2026|valid|80|1540|
36|khan.co.kr|<https://www.khan.co.kr/rss/rssdata/total_news.xml>|200|03/08/2026|valid|200|3824|
37|MBC|<https://imnews.imbc.com/rss/google_news/narrativeNews.rss>|needs check|03/08/2026|needs verification|0|0|
38|chosun.com|<https://www.chosun.com/arc/outboundfeeds/rss/?outputType=xml>|200|03/08/2026|valid|400|5900|

### Brazil (BR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|G1 (Globo - Economy)|<https://g1.globo.com/rss/g1/economia/>|200|03/08/2026|valid|400|7700|
2|G1 (Globo - Tech)|<https://g1.globo.com/rss/g1/tecnologia/>|200|03/08/2026|valid|400|7700|
3|Folha de S.Paulo - Top|<https://feeds.folha.uol.com.br/emcimadahora/rss091.xml>|200|03/08/2026|valid|400|7700|
4|Folha de S.Paulo - Market|<https://feeds.folha.uol.com.br/mercado/rss091.xml>|200|03/08/2026|valid|400|7700|
5|Correio Braziliense|<https://www.correiobraziliense.com.br/rss/noticia/economia/rss.xml>|200|03/08/2026|valid|120|2048|
6|InfoMoney|<https://www.infomoney.com.br/feed/>|200|03/08/2026|valid|40|770|
7|Canaltech|<https://canaltech.com.br/rss/>|200|03/08/2026|valid|200|3750|
8|Forbes Brazil|<https://forbes.com.br/feed/>|200|03/08/2026|valid|200|3850|
9|Estado de Minas|<https://www.em.com.br/feed/>|needs check|03/08/2026|needs verification|0|0|
10|Veja|<https://veja.abril.com.br/feed/>|200|03/08/2026|valid|80|1540|
11|Folha - Poder|<https://feeds.folha.uol.com.br/poder/rss091.xml>|200|03/08/2026|valid|400|7700|
12|Folha - Mundo|<https://feeds.folha.uol.com.br/mundo/rss091.xml>|200|03/08/2026|valid|400|7700|
13|Folha - Cotidiano|<https://feeds.folha.uol.com.br/cotidiano/rss091.xml>|200|03/08/2026|valid|400|7700|
14|Folha - Esporte|<https://feeds.folha.uol.com.br/esporte/rss091.xml>|200|03/08/2026|valid|400|7700|
15|Folha - Ilustrada|<https://feeds.folha.uol.com.br/ilustrada/rss091.xml>|200|03/08/2026|valid|400|7700|
16|Agencia Publica|<https://apublica.org/feed/>|200|03/08/2026|valid|40|770|
17|Nexo Jornal|<https://www.nexojornal.com.br/rss.xml>|200|03/08/2026|valid|80|1440|
18|Jornal GGN|<https://jornalggn.com.br/feed/>|needs check|03/08/2026|needs verification|0|0|
19|Jacobin Brasil|<https://jacobin.com.br/feed>|needs check|03/08/2026|needs verification|0|0|
20|CartaCapital|<https://www.cartacapital.com.br/feed>|200|03/08/2026|valid|80|1540|
21|G1 Globo (General Top Portal)|<https://g1.globo.com/rss/g1/>|200|03/08/2026|valid|400|7700|
22|G1 Politica (Politics)|<https://g1.globo.com/rss/g1/politica/>|200|03/08/2026|valid|400|7700|
23|UOL Noticias (Breaking and Top Stories)|<https://rss.uol.com.br/feed/noticias.xml>|200|03/08/2026|valid|60|1140|
24|UOL Economia (Portal Economy)|<https://rss.uol.com.br/feed/economia.xml>|200|03/08/2026|valid|60|1140|
25|Estadao (Mainstream Daily)|<https://www.estadao.com.br/rss/ultimas>|needs check|03/08/2026|needs verification|0|0|
26|Exame (Business/Economy Magazine)|<https://exame.com/feed/>|200|03/08/2026|valid|100|1900|
27|Valor Economico (Financial Daily)|<https://valor.globo.com/rss/valor>|200|03/08/2026|valid|400|7700|
28|CNN Brasil (Business)|<https://www.cnnbrasil.com.br/business/feed/>|404 (HTTP_404)|03/08/2026|invalid|0|0|
29|CartaCapital (Investigative/Analysis)|<https://www.cartacapital.com.br/feed/>|200|03/08/2026|valid|80|1540|
30|Poder360 (Politics/Policy)|<https://www.poder360.com.br/feed/>|200|03/08/2026|valid|40|770|
31|Correio Braziliense (Political Coverage)|<https://www.correiobraziliense.com.br/rss/noticia/politica/rss.xml>|200|03/08/2026|valid|120|2220|

### Australia (AU)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|ABC News - Business|<https://www.abc.net.au/news/feed/51892/rss.xml>|200|03/08/2026|valid|100|1925|
2|ABC News - World|<https://www.abc.net.au/news/feed/104217382/rss.xml>|200|03/08/2026|valid|16|308|
3|ABC News - Top Stories|<https://www.abc.net.au/news/feed/10719986/rss.xml>|200|03/08/2026|valid|100|1925|
4|Sydney Morning Herald - Business|<https://www.smh.com.au/rss/business.xml>|200|03/08/2026|valid|80|1540|
5|The Age - Business|<https://www.theage.com.au/rss/business.xml>|200|03/08/2026|valid|80|1540|
6|The Australian - Business|<https://www.theaustralian.com.au/business/rss>|needs check|03/08/2026|needs verification|0|0|
7|The Guardian Australia|<https://www.theguardian.com/au/rss>|200|03/08/2026|valid|459|9176|
8|ABC News (Top)|<https://www.abc.net.au/news/feed/1106/rss.xml>|200|03/08/2026|valid|32|616|
9|Australian Broadcasting Corporation - World|<https://www.abc.net.au/news/feed/51892/rss.xml?edition=world>|200|03/08/2026|valid|100|1925|
10|The Guardian Australia|<https://www.theguardian.com/australia-news/rss>|200|03/08/2026|valid|92|1767|
11|SBS World News|<https://www.sbs.com.au/news/topic/latest/feed>|200|03/08/2026|valid|100|1925|
12|SBS News (Breaking)|<https://www.sbs.com.au/news/feed>|200|03/08/2026|valid|96|1848|
13|9News|<https://www.9news.com.au/rss>|200|03/08/2026|valid|55|1236|
14|Sydney Morning Herald|<https://www.smh.com.au/rss/feed.xml>|200|03/08/2026|valid|80|1540|
15|The Age|<https://www.theage.com.au/rss/feed.xml>|200|03/08/2026|valid|80|1540|
16|Canberra Times|<https://www.canberratimes.com.au/rss.xml>|200|03/08/2026|valid|80|1264|
17|PerthNow|<https://www.perthnow.com.au/news/feed>|200|03/08/2026|valid|400|7700|
18|The Australian|<https://www.theaustralian.com.au/business/markets/rss>|needs check|03/08/2026|needs verification|0|0|
19|7news|<https://7news.com.au/feed>|200|03/08/2026|valid|400|7700|
20|RenewEconomy|<https://reneweconomy.com.au/feed/>|200|03/08/2026|valid|40|770|
21|Australian Mining|<https://www.australianmining.com.au/feed/>|200|03/08/2026|valid|20|385|
22|MacroBusiness|<https://www.macrobusiness.com.au/feed/>|200|03/08/2026|valid|120|2310|
23|SmartCompany|<https://www.smartcompany.com.au/feed/>|200|03/08/2026|valid|40|770|
24|Startup Daily|<https://www.startupdaily.net/feed/>|200|03/08/2026|valid|40|770|
25|The Conversation AU|<https://theconversation.com/au/rss>|needs check|03/08/2026|needs verification|0|0|
26|AFR (Financial Review)|<https://www.afr.com/rss>|needs check|03/08/2026|needs verification|0|0|
27|News.com.au National Top News|<https://www.news.com.au/content-feeds/latest-news-national/>|200|03/08/2026|valid|0|0|
28|News.com.au Finance|<https://www.news.com.au/content-feeds/latest-news-finance/>|200|03/08/2026|valid|0|0|
29|ABC News Australia|<https://www.abc.net.au/news/feed/51120/rss.xml>|200|03/08/2026|valid|100|1925|

### Spain (ES)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Expansion (Financial)|<https://e00-expansion.uecdn.es/rss/empresas.xml>|200|03/08/2026|valid|200|3828|
2|Cinco Dias (Economy)|<https://cincodias.elpais.com/arc/outboundfeeds/rss/?outputType=xml>|200|03/08/2026|valid|400|7700|
3|El Pais - Economy|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/economia/portada>|200|03/08/2026|valid|167|3307|
4|El Mundo - Economy|<https://e00-elmundo.uecdn.es/elmundo/rss/economia.xml>|200|03/08/2026|valid|228|4202|
5|El Confidencial|<https://rss.elconfidencial.com/espana/>|200|03/08/2026|valid|60|1155|
6|El Periodico|<https://www.elperiodico.com/es/rss/rss_portada.xml>|needs check|03/08/2026|needs verification|0|0|
7|20 Minutos|<https://www.20minutos.es/rss/>|200|03/08/2026|valid|480|9240|
8|El Diario|<https://www.eldiario.es/rss/>|200|03/08/2026|valid|394|7844|
9|eldiario|<https://www.eldiario.es/rss/>|200|03/08/2026|valid|394|7844|
10|Marca|<https://www.marca.com/rss/>|needs check|03/08/2026|needs verification|0|0|
11|El Pais|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada>|200|03/08/2026|valid|480|9240|
12|EL PAIS - Ultimas|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/ultimas-noticias/portada>|200|03/08/2026|valid|331|6128|
13|EL PAIS - Internacional|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/internacional/portada>|200|03/08/2026|valid|85|1772|
14|EL PAIS - Opinion|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/opinion/portada>|200|03/08/2026|valid|104|2002|
15|EL PAIS - Espana|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/espana/portada>|200|03/08/2026|valid|76|1463|
16|EL PAIS - Sociedad|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/sociedad/portada>|200|03/08/2026|valid|124|2299|
17|EL PAIS - Ciencia|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/ciencia/portada>|200|03/08/2026|valid|160|3080|
18|EL PAIS - Tecnologia|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/tecnologia/portada>|200|03/08/2026|valid|64|1232|
19|EL PAIS - Cultura|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/cultura/portada>|200|03/08/2026|valid|132|2441|
20|EL PAIS - Deportes|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/deportes/portada>|200|03/08/2026|valid|116|2270|
21|EL PAIS - Gente|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/gente/portada>|200|03/08/2026|valid|88|1694|
22|EL PAIS - Clima y medio ambiente|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/clima-y-medio-ambiente/portada>|200|03/08/2026|valid|79|1448|
23|La Vanguardia - Portada|<https://www.lavanguardia.com/rss/home.xml>|200|03/08/2026|valid|480|9240|
24|La Vanguardia - Internacional|<https://www.lavanguardia.com/rss/internacional.xml>|200|03/08/2026|valid|400|7700|
25|La Vanguardia - Politica|<https://www.lavanguardia.com/rss/politica.xml>|200|03/08/2026|valid|400|7700|
26|La Vanguardia - Opinion|<https://www.lavanguardia.com/rss/opinion.xml>|200|03/08/2026|valid|372|7140|
27|La Vanguardia - Sociedad|<https://www.lavanguardia.com/rss/sociedad.xml>|200|03/08/2026|valid|396|7623|
28|La Vanguardia - Deportes|<https://www.lavanguardia.com/rss/deportes.xml>|200|03/08/2026|valid|400|7700|
29|El Mundo - Portada|<https://e00-elmundo.uecdn.es/rss/portada.xml>|200|03/08/2026|valid|102|2147|
30|The Local Spain (EN)|<https://feeds.thelocal.com/rss/es>|200|03/08/2026|valid|80|1480|
31|El Economista - Portada|<https://www.eleconomista.es/rss/rss-portada.php>|needs check|03/08/2026|needs verification|0|0|
32|El Economista - Mercados|<https://www.eleconomista.es/rss/rss-mercados.php>|needs check|03/08/2026|needs verification|0|0|
33|ABC.es - Economía|<https://www.abc.es/rss/feeds/abc_economia.xml>|200|03/08/2026|valid|80|1540|
34|Vozpópuli|<https://www.vozpopuli.com/rss>|200|03/08/2026|valid|100|1925|
35|El Periódico de la Energía|<https://elperiodicodelaenergia.com/feed/>|200|03/08/2026|valid|200|3850|
36|Xataka|<https://www.xataka.com/feed>|needs check|03/08/2026|needs verification|0|0|
37|ABC.es|<https://www.abc.es/rss/feeds/abc_ultima.xml>|200|03/08/2026|valid|80|1540|

### Mexico (MX)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Proceso (Investigative)|<https://www.proceso.com.mx/rss/feed.html>|200|03/08/2026|valid|62|1399|
2|Expansion (Biz)|<https://expansion.mx/rss>|200|03/08/2026|valid|180|3498|
3|Contralinea|<https://www.contralinea.com.mx/feed>|200|03/08/2026|valid|24|462|
4|El Financiero|<https://www.elfinanciero.com.mx/rss/mundo>|200|03/08/2026|valid|400|7700|
5|Proceso World|<https://www.proceso.com.mx/rss/feed.html?output=xml>|200|03/08/2026|valid|62|1399|
6|El Financiero|<https://www.elfinanciero.com.mx/rss>|200|03/08/2026|valid|400|7600|
7|ADN40 (TV Azteca - Economy)|<https://www.adn40.mx/economia/rss>|needs check|03/08/2026|needs verification|0|0|
8|ADN40 (TV Azteca - Mexico)|<https://www.adn40.mx/mexico/rss>|needs check|03/08/2026|needs verification|0|0|
9|El Financiero (Economia)|<https://www.elfinanciero.com.mx/rss/economia>|200|03/08/2026|valid|400|7700|
10|El Financiero (Mercados)|<https://www.elfinanciero.com.mx/rss/mercados>|200|03/08/2026|valid|400|7700|
11|La Jornada - Economia|<https://www.jornada.com.mx/rss/economia.xml>|200|03/08/2026|valid|36|885|
12|Aristegui (Main)|<https://editorial.aristeguinoticias.com/feed/>|200|03/08/2026|valid|40|770|
13|Aristegui (Mexico)|<https://editorial.aristeguinoticias.com/category/mexico/feed/>|200|03/08/2026|valid|60|1155|
14|Aristegui (Dinero y Economia)|<https://editorial.aristeguinoticias.com/category/dinero-y-economia/feed/>|200|03/08/2026|valid|60|1155|
15|Aristegui (Mundo)|<https://editorial.aristeguinoticias.com/category/mundo/feed/>|200|03/08/2026|valid|60|1155|
16|Aristegui En Vivo - Enterate|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/enterate/feed>|200|03/08/2026|valid|60|1155|
17|Aristegui En Vivo - Programas completos|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/programas-completos/feed>|200|03/08/2026|valid|60|1155|
18|Aristegui En Vivo - Entrevistas completas|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/entrevistas-completos/feed>|needs check|03/08/2026|needs verification|0|0|
19|Aristegui En Vivo - Mesa politica|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/mesa-politica-en-vivo/feed>|200|03/08/2026|valid|60|1155|
20|Aristegui En Vivo - Investigaciones especiales|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/investigaciones-especiales/feed>|200|03/08/2026|valid|60|1155|
21|Aristegui En Vivo - Enlaces en vivo|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/enlaces-en-vivo/feed>|200|03/08/2026|valid|60|1155|
22|Aristegui En Vivo - Titulares del dia|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/titulares-del-dia/feed>|200|03/08/2026|valid|60|1155|
23|Aristegui En Vivo - Deportes|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/deportes-aristegui-en-vivo/feed>|200|03/08/2026|valid|60|1155|
24|Aristegui En Vivo - Dinero y Economia|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/dinero-y-economia/feed>|200|03/08/2026|valid|60|1155|
25|Aristegui En Vivo - Ninonautas|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/ninonautas/feed>|200|03/08/2026|valid|60|1155|
26|Aristegui En Vivo - Las plumas de la serpiente|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/las-plumas-de-la-serpiente/feed>|200|03/08/2026|valid|60|1155|
27|El Economista - Top Noticias|<https://www.eleconomista.com.mx/rss/top-noticias>|needs check|03/08/2026|needs verification|0|0|
28|El Economista - Empresas|<https://www.eleconomista.com.mx/rss/empresas>|needs check|03/08/2026|needs verification|0|0|
29|El Universal - General|<https://www.eluniversal.com.mx/rss.xml>|needs check|03/08/2026|needs verification|0|0|
30|El Universal - Cartera|<https://www.eluniversal.com.mx/cartera/rss.xml>|needs check|03/08/2026|needs verification|0|0|
31|Milenio|<https://www.milenio.com/rss>|needs check|03/08/2026|needs verification|0|0|
32|Excelsior|<https://www.excelsior.com.mx/rss.xml>|needs check|03/08/2026|needs verification|0|0|
33|Forbes Mexico|<https://www.forbes.com.mx/feed/>|Recovered via sitemap|03/08/2026|valid|0|0|
34|Energía a Debate|<https://energiaadebate.com/feed/>|200|03/08/2026|valid|360|6930|
35|Milenio Negocios (Business)|<https://www.milenio.com/negocios/rss>|needs check|03/08/2026|needs verification|0|0|
36|Aristegui Noticias (Political Investigation)|<https://aristeguinoticias.com/feed/>|needs check|03/08/2026|needs verification|0|0|
37|La Jornada (Progressive Daily)|<https://www.jornada.com.mx/rss/edicion.xml>|200|03/08/2026|valid|408|8411|
38|El Sol de Mexico (Domestic Breaking)|<https://www.elsoldemexico.com.mx/rss.xml>|needs check|03/08/2026|needs verification|0|0|
39|Expansion Economia (Economy Specialist)|<https://expansion.mx/rss/economia>|200|03/08/2026|valid|196|3809|
40|Expansion Empresas (Corporate News)|<https://expansion.mx/rss/empresas>|200|03/08/2026|valid|200|3850|
41|Sopitas (Millennial Portal)|<https://www.sopitas.com/feed/>|200|03/08/2026|valid|40|770|
42|Animal Politico (Political Deep Coverage)|<https://www.animalpolitico.com/feed>|needs check|03/08/2026|needs verification|0|0|
43|Xataka Mexico (Tech/IT)|<https://www.xataka.com.mx/feed>|needs check|03/08/2026|needs verification|0|0|

### Indonesia (ID)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Republika|<https://www.republika.co.id/rss>|200|03/08/2026|valid|60|1155|
2|Sindo News|<https://www.sindonews.com/rss/home/>|200|03/08/2026|valid|120|2310|
3|Kapanlagi|<https://www.kapanlagi.com/feed/>|200|03/08/2026|valid|311|8230|
4|Antara TV|<https://www.antaranews.com/rss/terkini>|200|03/08/2026|valid|200|3600|
5|Sindonews|<https://www.sindonews.com/rss/>|200|03/08/2026|valid|120|2310|
6|Republika|<https://www.republika.co.id/rss/terkini>|needs check|03/08/2026|needs verification|0|0|
7|ANTARA - Terkini|<https://www.antaranews.com/rss/terkini.xml>|200|03/08/2026|valid|200|3350|
8|ANTARA - Top News|<https://www.antaranews.com/rss/top-news.xml>|200|03/08/2026|valid|120|2190|
9|ANTARA - Politik|<https://www.antaranews.com/rss/politik.xml>|200|03/08/2026|valid|80|1480|
10|ANTARA - Hukum|<https://www.antaranews.com/rss/hukum.xml>|200|03/08/2026|valid|60|1520|
11|ANTARA - Ekonomi|<https://www.antaranews.com/rss/ekonomi.xml>|200|03/08/2026|valid|80|1540|
12|ANTARA - Ekonomi (Finansial)|<https://www.antaranews.com/rss/ekonomi-finansial.xml>|200|03/08/2026|valid|80|1460|
13|ANTARA - Ekonomi (Bisnis)|<https://www.antaranews.com/rss/ekonomi-bisnis.xml>|200|03/08/2026|valid|80|1520|
14|ANTARA - Ekonomi (Bursa)|<https://www.antaranews.com/rss/ekonomi-bursa.xml>|200|03/08/2026|valid|80|1540|
15|ANTARA - Metro|<https://www.antaranews.com/rss/metro.xml>|200|03/08/2026|valid|80|1480|
16|ANTARA - Metro (Kriminalitas)|<https://www.antaranews.com/rss/metro-kriminalitas.xml>|200|03/08/2026|valid|80|1520|
17|ANTARA - Metro (Lintas Kota)|<https://www.antaranews.com/rss/metro-lintas-kota.xml>|200|03/08/2026|valid|80|1420|
18|ANTARA - Metro (Lenggang Jakarta)|<https://www.antaranews.com/rss/metro-lenggang-jakarta.xml>|200|03/08/2026|valid|80|1540|
19|ANTARA - Sepakbola|<https://www.antaranews.com/rss/sepakbola.xml>|200|03/08/2026|valid|60|1500|
20|ANTARA - Sepakbola (Liga Indonesia)|<https://www.antaranews.com/rss/sepakbola-liga-indonesia.xml>|200|03/08/2026|valid|80|1500|
21|ANTARA - Sepakbola (Internasional)|<https://www.antaranews.com/rss/sepakbola-internasional.xml>|200|03/08/2026|valid|80|1500|
22|ANTARA - Sepakbola (Liga Inggris)|<https://www.antaranews.com/rss/sepakbola-liga-inggris-premier.xml>|200|03/08/2026|valid|60|1380|
23|ANTARA - Sepakbola (Liga Spanyol)|<https://www.antaranews.com/rss/sepakbola-liga-spanyol.xml>|200|03/08/2026|valid|80|1500|
24|ANTARA - Sepakbola (Liga Italia)|<https://www.antaranews.com/rss/sepakbola-liga-italia-seri-a.xml>|200|03/08/2026|valid|80|1500|
25|ANTARA - Liga Champions|<https://www.antaranews.com/rss/sepakbola-liga-champions.xml>|200|03/08/2026|valid|80|1500|
26|ANTARA - Olahraga|<https://www.antaranews.com/rss/olahraga.xml>|200|03/08/2026|valid|80|1440|
27|ANTARA - Olahraga (Bulutangkis)|<https://www.antaranews.com/rss/olahraga-bulutangkis.xml>|200|03/08/2026|valid|80|1500|
28|ANTARA - Olahraga (Bola Basket)|<https://www.antaranews.com/rss/olahraga-bola-basket.xml>|200|03/08/2026|valid|80|1480|
29|ANTARA - Olahraga (Tenis)|<https://www.antaranews.com/rss/olahraga-tenis.xml>|200|03/08/2026|valid|80|1500|
30|ANTARA - Olahraga (Balap)|<https://www.antaranews.com/rss/olahraga-balap.xml>|200|03/08/2026|valid|80|1460|
31|ANTARA - Humaniora|<https://www.antaranews.com/rss/humaniora.xml>|200|03/08/2026|valid|80|1500|
32|ANTARA - Lifestyle|<https://www.antaranews.com/rss/lifestyle.xml>|200|03/08/2026|valid|80|1500|
33|ANTARA - Hiburan|<https://www.antaranews.com/rss/hiburan.xml>|200|03/08/2026|valid|80|1520|
34|ANTARA - Dunia|<https://www.antaranews.com/rss/dunia.xml>|200|03/08/2026|valid|80|1540|
35|ANTARA - Dunia (ASEAN)|<https://www.antaranews.com/rss/dunia-asean.xml>|200|03/08/2026|valid|60|1500|
36|ANTARA - Tekno|<https://www.antaranews.com/rss/tekno.xml>|200|03/08/2026|valid|80|1460|
37|RM.ID - Semua berita|<https://rm.id/rss-rakyat-merdeka>|200|03/08/2026|valid|40|760|
38|RM.ID - Nasional|<https://rm.id/rss-rakyat-merdeka/nasional>|needs check|03/08/2026|needs verification|0|0|
39|RM.ID - Internasional|<https://rm.id/rss-rakyat-merdeka/internasional>|200|03/08/2026|valid|40|760|
40|RM.ID - Ekonomi Bisnis|<https://rm.id/rss-rakyat-merdeka/ekonomi-bisnis>|200|03/08/2026|valid|40|760|
41|RM.ID - Bank & Finance|<https://rm.id/rss-rakyat-merdeka/bank-finance>|needs check|03/08/2026|needs verification|0|0|
42|RM.ID - Indonesianomics|<https://rm.id/rss-rakyat-merdeka/indonesianomics>|needs check|03/08/2026|needs verification|0|0|
43|Kompas (Mainstream Daily)|<https://sindikasi.kompas.com/xml/nasional>|needs check|03/08/2026|needs verification|0|0|
44|Kompas Ekonomi (Economy)|<https://sindikasi.kompas.com/xml/ekonomi>|needs check|03/08/2026|needs verification|0|0|
45|Detikcom (Top Breaking Portal)|<https://laporan.detik.com/rss/detiknews.xml>|needs check|03/08/2026|needs verification|0|0|
46|Detik Finance (Finance and Economy)|<https://laporan.detik.com/rss/detikfinance.xml>|needs check|03/08/2026|needs verification|0|0|
47|CNBC Indonesia (Business News)|<https://www.cnbcindonesia.com/news/rss>|needs check|03/08/2026|needs verification|0|0|
48|CNBC Indonesia (Market/Stocks)|<https://www.cnbcindonesia.com/market/rss>|needs check|03/08/2026|needs verification|0|0|
49|Bisnis Indonesia (Business/Industry)|<https://www.bisnis.com/rss>|needs check|03/08/2026|needs verification|0|0|
50|Kontan (Investment/Finance)|<https://www.kontan.co.id/rss>|needs check|03/08/2026|needs verification|0|0|
51|Tempo.co (Politics and Investigations)|<https://tempo.co/rss>|403 (HTTP_403)|03/08/2026|invalid|0|0|
52|Liputan6 (General Portal)|<https://www.liputan6.com/rss>|needs check|03/08/2026|needs verification|0|0|
53|Suara (Independent News)|<https://www.suara.com/rss>|Recovered via sitemap|03/08/2026|valid|227|4123|
54|Merdeka (Online News)|<https://www.merdeka.com/feed>|needs check|03/08/2026|needs verification|0|0|
55|Viva.co.id (General Breaking)|<https://www.viva.co.id/rss>|needs check|03/08/2026|needs verification|0|0|
56|Republika Ekonomi (Business Economy)|<https://republika.co.id/rss/ekonomi>|200|03/08/2026|valid|60|1155|

### Netherlands (NL)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|NOS|<https://feeds.nos.nl/nosnieuwsalgemeen>|200|03/08/2026|valid|80|1540|
2|NRC|<https://www.nrc.nl/rss>|200|03/08/2026|valid|480|9120|
3|AD|<https://www.ad.nl/rss.xml>|200|03/08/2026|valid|120|2310|
4|Nu|<https://www.nu.nl/rss/algemeen>|200|03/08/2026|valid|120|2310|
5|NPO Radio 1|<https://www.npo3fm.nl/rss/>|200|03/08/2026|valid|200|3850|
6|NOS Tech|<https://feeds.nos.nl/nosnieuwstech>|200|03/08/2026|valid|80|1540|
7|NRC|<https://www.nrc.nl/nieuws/rss/>|200|03/08/2026|valid|20|1427|
8|Nieuwsuur|<https://feeds.nos.nl/nieuwsuuralgemeen>|200|03/08/2026|valid|80|1540|
9|RTL|<https://www.rtlnieuws.nl/nieuws/rss.xml>|200|03/08/2026|valid|48|924|
10|NRC|<https://www.nrc.nl/rss/>|200|03/08/2026|valid|480|9120|
11|NOS Nieuws - Binnenland|<https://feeds.nos.nl/nosnieuwsbinnenland>|200|03/08/2026|valid|80|1540|
12|NOS Nieuws - Buitenland|<https://feeds.nos.nl/nosnieuwsbuitenland>|200|03/08/2026|valid|80|1540|
13|NOS Nieuws - Politiek|<https://feeds.nos.nl/nosnieuwspolitiek>|200|03/08/2026|valid|80|1540|
14|NOS Nieuws - Economie|<https://feeds.nos.nl/nosnieuwseconomie>|200|03/08/2026|valid|80|1540|
15|NOS Nieuws - Opmerkelijk|<https://feeds.nos.nl/nosnieuwsopmerkelijk>|200|03/08/2026|valid|80|1540|
16|NOS Nieuws - Koningshuis|<https://feeds.nos.nl/nosnieuwskoningshuis>|200|03/08/2026|valid|80|1540|
17|NOS Nieuws - Cultuur & media|<https://feeds.nos.nl/nosnieuwscultuurenmedia>|200|03/08/2026|valid|80|1540|
18|NOS Sport - Algemeen|<https://feeds.nos.nl/nossportalgemeen>|200|03/08/2026|valid|80|1540|
19|NOS Sport - Voetbal|<https://feeds.nos.nl/nosvoetbal>|200|03/08/2026|valid|80|1540|
20|NOS Sport - Wielrennen|<https://feeds.nos.nl/nossportwielrennen>|200|03/08/2026|valid|80|1540|
21|NOS Sport - Schaatsen|<https://feeds.nos.nl/nossportschaatsen>|200|03/08/2026|valid|80|1540|
22|NOS Sport - Tennis|<https://feeds.nos.nl/nossporttennis>|200|03/08/2026|valid|80|1540|
23|NOS Sport - Formule 1|<https://feeds.nos.nl/nossportformule1>|200|03/08/2026|valid|80|1540|
24|NOS op 3|<https://feeds.nos.nl/nosop3>|200|03/08/2026|valid|80|1540|
25|NOS Jeugdjournaal|<https://feeds.nos.nl/jeugdjournaal>|200|03/08/2026|valid|80|1540|
26|De Telegraaf|<https://www.telegraaf.nl/rss>|needs check|03/08/2026|needs verification|0|0|
27|de Volkskrant|<https://www.volkskrant.nl/voorpagina/rss.xml>|200|03/08/2026|valid|39|620|
28|Trouw|<https://www.trouw.nl/voorpagina/rss.xml>|200|03/08/2026|valid|80|1539|
29|Het Parool|<https://www.parool.nl/voorpagina/rss.xml>|200|03/08/2026|valid|28|586|
30|Het Financieele Dagblad (FD)|<https://fd.nl/?rss>|200|03/08/2026|valid|152|2928|
31|Tweakers (Mixed)|<https://tweakers.net/feeds/mixed.xml>|200|03/08/2026|valid|160|3080|
32|BNR Nieuwsradio (Economie)|<https://www.bnr.nl/rss/economie>|needs check|03/08/2026|needs verification|0|0|
33|Telegraaf (Financieel)|<https://www.telegraaf.nl/rss/financieel>|needs check|03/08/2026|needs verification|0|0|
34|RTL Z (Business)|<https://www.rtlnieuws.nl/economie/rss.xml>|Recovered via sitemap|03/08/2026|valid|0|0|
35|Nu.nl|<https://www.nu.nl/rss/Algemeen>|200|03/08/2026|valid|120|2310|
36|Tweakers|<https://tweakers.net/feeds/nieuws.xml>|needs check|03/08/2026|needs verification|0|0|
37|NU.nl Economie (Portal Economy)|<https://www.nu.nl/rss/Economie>|200|03/08/2026|valid|120|2310|
38|RTL Nieuws (General Breaking)|<https://www.rtlnieuws.nl/rss.xml>|200|03/08/2026|valid|40|760|
39|FOK! (News/Community)|<https://frontpage.fok.nl/xml/rss>|needs check|03/08/2026|needs verification|0|0|
40|IEX.nl (Stocks/Investments)|<https://www.iex.nl/rss/nieuws.xml>|needs check|03/08/2026|needs verification|0|0|
41|De Correspondent (In-Depth Analysis)|<https://decorrespondent.nl/feed>|needs check|03/08/2026|needs verification|0|0|
42|AG Connect (IT/Industry Trends)|<https://www.agconnect.nl/rss>|needs check|03/08/2026|needs verification|0|0|

### Switzerland (CH)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Le Temps Economy|<https://www.letemps.ch/economie.rss>|200|03/08/2026|valid|84|1554|
2|NZZ|<https://www.nzz.ch/reisen.rss>|200|03/08/2026|valid|108|2079|
3|NDR|<https://www.ndr.ch/rss/>|200|03/08/2026|valid|40|770|
4|SRF News (Latest)|<https://www.srf.ch/news/bnf/rss/19032223>|200|03/08/2026|valid|240|4620|
5|SRF News (Switzerland)|<https://www.srf.ch/news/bnf/rss/1890>|200|03/08/2026|valid|240|4620|
6|SRF News (International)|<https://www.srf.ch/news/bnf/rss/1922>|200|03/08/2026|valid|240|4620|
7|SRF News (Economy)|<https://www.srf.ch/news/bnf/rss/1926>|200|03/08/2026|valid|240|4620|
8|SRF Sport (Football)|<https://www.srf.ch/sport/bnf/rss/2562>|200|03/08/2026|valid|244|4697|
9|SRF Sport (Ice Hockey)|<https://www.srf.ch/sport/bnf/rss/3418>|200|03/08/2026|valid|128|2464|
10|SRF Sport (Tennis)|<https://www.srf.ch/sport/bnf/rss/2814>|200|03/08/2026|valid|248|4774|
11|SRF Sport (Alpine Skiing)|<https://www.srf.ch/sport/bnf/rss/787950>|200|03/08/2026|valid|120|2310|
12|SRF Wissen (Health)|<https://www.srf.ch/bnf/rss/19919909>|200|03/08/2026|valid|480|9240|
13|SRF Wissen (Tech)|<https://www.srf.ch/bnf/rss/19920122>|200|03/08/2026|valid|344|6622|
14|Blick (Schweiz)|<https://www.blick.ch/schweiz/rss.xml>|200|03/08/2026|valid|172|2747|
15|Blick (Ausland)|<https://www.blick.ch/ausland/rss.xml>|200|03/08/2026|valid|127|3104|
16|Blick (Wirtschaft)|<https://www.blick.ch/wirtschaft/rss.xml>|200|03/08/2026|valid|107|2069|
17|Blick (Politik)|<https://www.blick.ch/politik/rss.xml>|200|03/08/2026|valid|120|2086|
18|Blick (Sport)|<https://www.blick.ch/sport/rss.xml>|200|03/08/2026|valid|200|3850|
19|Blick Sport (Fussball)|<https://www.blick.ch/sport/fussball/rss.xml>|200|03/08/2026|valid|192|3761|
20|Blick Sport (Eishockey)|<https://www.blick.ch/sport/eishockey/rss.xml>|200|03/08/2026|valid|119|2098|
21|Blick Sport (Ski)|<https://www.blick.ch/sport/ski/rss.xml>|200|03/08/2026|valid|52|1067|
22|Blick Sport (Tennis)|<https://www.blick.ch/sport/tennis/rss.xml>|200|03/08/2026|valid|11|267|
23|Blick (Digital)|<https://www.blick.ch/digital/rss.xml>|needs check|03/08/2026|needs verification|0|0|
24|Le News (EN)|<https://lenews.ch/feed>|200|03/08/2026|valid|40|750|
25|The Local Switzerland (EN)|<https://feeds.thelocal.com/rss/ch>|200|03/08/2026|valid|80|1480|
26|NZZ (Latest)|<https://www.nzz.ch/recent.rss>|200|03/08/2026|valid|78|1468|
27|Swissinfo (Business - EN)|<https://www.swissinfo.ch/eng/business/feed>|needs check|03/08/2026|needs verification|0|0|
28|Finews.ch (Swiss Finance)|<https://www.finews.ch/news/finanzplatz?format=feed&type=rss>|200|03/08/2026|valid|60|1155|
29|20 Minuten (Wirtschaft)|<https://www.20min.ch/rss/wirtschaft>|needs check|03/08/2026|needs verification|0|0|
30|Le Temps|<https://www.letemps.ch/rss>|needs check|03/08/2026|needs verification|0|0|
31|Finanz und Wirtschaft|<https://www.fuw.ch/feed>|needs check|03/08/2026|needs verification|0|0|
32|NZZ Wirtschaft (Economy - German)|<https://www.nzz.ch/wirtschaft.rss>|200|03/08/2026|valid|156|3003|
33|Tages-Anzeiger (Zurich Headlines - German)|<https://www.tagesanzeiger.ch/rss.xml>|needs check|03/08/2026|needs verification|0|0|
34|Blick (Swiss #1 Popular Daily - German)|<https://www.blick.ch/rss.xml>|200|03/08/2026|valid|200|3850|
35|Handelszeitung (Economy Weekly - German)|<https://www.handelszeitung.ch/rss.xml>|needs check|03/08/2026|needs verification|0|0|
36|Cash.ch (Finance/Investment - German)|<https://www.cash.ch/rss>|needs check|03/08/2026|needs verification|0|0|
37|RTS Info (French-speaking public broadcaster Breaking - French)|<https://www.rts.ch/info/rss>|needs check|03/08/2026|needs verification|0|0|
38|Le Temps Suisse (Domestic - French)|<https://www.letemps.ch/suisse.rss>|200|03/08/2026|valid|84|1554|
39|Bilan.ch (Economy - French)|<https://www.bilan.ch/rss.xml>|needs check|03/08/2026|needs verification|0|0|
40|20 Minuten Schweiz (Domestic - German)|<https://www.20min.ch/rss/schweiz>|needs check|03/08/2026|needs verification|0|0|
41|Watson.ch (News Portal - German)|<https://www.watson.ch/api/rss>|needs check|03/08/2026|needs verification|0|0|
42|Aargauer Zeitung (Regional Major Daily - German)|<https://www.aargauerzeitung.ch/rss>|needs check|03/08/2026|needs verification|0|0|
43|Berner Zeitung (Bern Major Daily - German)|<https://www.bernerzeitung.ch/rss.xml>|needs check|03/08/2026|needs verification|0|0|
44|Basler Zeitung (Basel Major Daily - German)|<https://www.bazonline.ch/rss.xml>|needs check|03/08/2026|needs verification|0|0|
45|Le Matin|<https://www.lematin.ch/rss.xml>|needs check|03/08/2026|needs verification|0|0|
46|Tribune de Geneve|<https://www.tdg.ch/rss.xml>|needs check|03/08/2026|needs verification|0|0|

### Turkey (TR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Hurriyet|<https://www.hurriyet.com.tr/rss/anasayfa>|needs check|03/08/2026|needs verification|0|0|
2|Sabah|<https://www.sabah.com.tr/rss/sondakika.xml>|200|03/08/2026|valid|71|3137|
3|Haberturk|<https://www.haberturk.com/rss>|200|03/08/2026|valid|400|7700|
4|Cumhuriyet|<https://www.cumhuriyet.com.tr/Rss/>|200|03/08/2026|valid|400|7700|
5|Aksam|<https://www.aksam.com.tr/rss>|200|03/08/2026|valid|80|1540|
6|Takvim|<https://www.takvim.com.tr/rss/feed>|needs check|03/08/2026|needs verification|0|0|
7|Cumhuriyet|<https://www.cumhuriyet.com.tr/RSS>|200|03/08/2026|valid|400|7700|
8|HuffPost Turkey|<https://www.hurriyetdailynews.com/rss>|needs check|03/08/2026|needs verification|0|0|
9|Haber Turk|<https://www.haberturk.com/rss/>|200|03/08/2026|valid|400|7700|
10|Hurriyet (Anasayfa)|<http://www.hurriyet.com.tr/rss/anasayfa>|200|03/08/2026|valid|0|0|
11|Hurriyet (Gundem)|<http://www.hurriyet.com.tr/rss/gundem>|200|03/08/2026|valid|0|0|
12|Hurriyet (Ekonomi)|<http://www.hurriyet.com.tr/rss/ekonomi>|200|03/08/2026|valid|0|0|
13|Hurriyet (Magazin)|<http://www.hurriyet.com.tr/rss/magazin>|200|03/08/2026|valid|0|0|
14|Hurriyet (Spor)|<http://www.hurriyet.com.tr/rss/spor>|200|03/08/2026|valid|0|0|
15|Hurriyet (Dunya)|<http://www.hurriyet.com.tr/rss/dunya>|200|03/08/2026|valid|0|0|
16|Hurriyet (Teknoloji)|<http://www.hurriyet.com.tr/rss/teknoloji>|200|03/08/2026|valid|0|0|
17|Hurriyet (Saglk)|<http://www.hurriyet.com.tr/rss/saglik>|200 (HTML_RETURNED)|03/08/2026|invalid|0|0|
18|Hurriyet (Astroloji)|<http://www.hurriyet.com.tr/rss/astroloji>|200|03/08/2026|valid|0|0|
19|Sabah (Anasayfa)|<https://www.sabah.com.tr/rss/anasayfa.xml>|200|03/08/2026|valid|40|770|
20|Sabah (Ekonomi)|<https://www.sabah.com.tr/rss/ekonomi.xml>|200|03/08/2026|valid|40|770|
21|Sabah (Spor)|<https://www.sabah.com.tr/rss/spor.xml>|200|03/08/2026|valid|40|770|
22|Sabah (Gundem)|<https://www.sabah.com.tr/rss/gundem.xml>|200|03/08/2026|valid|40|770|
23|Sabah (Yasam)|<https://www.sabah.com.tr/rss/yasam.xml>|200|03/08/2026|valid|40|770|
24|Sabah (Dunya)|<https://www.sabah.com.tr/rss/dunya.xml>|200|03/08/2026|valid|40|770|
25|Sabah (Teknoloji)|<https://www.sabah.com.tr/rss/teknoloji.xml>|needs check|03/08/2026|needs verification|0|0|
26|Sabah (Turizm)|<https://www.sabah.com.tr/rss/turizm.xml>|needs check|03/08/2026|needs verification|0|0|
27|Sabah (Otomobil)|<https://www.sabah.com.tr/rss/otomobil.xml>|needs check|03/08/2026|needs verification|0|0|
28|CNN Turk (All / News)|<https://www.cnnturk.com/feed/rss/all/news>|200|03/08/2026|valid|140|2695|
29|CNN Turk (Turkiye / News)|<https://www.cnnturk.com/feed/rss/turkiye/news>|200|03/08/2026|valid|140|2695|
30|CNN Turk (Dunya / News)|<https://www.cnnturk.com/feed/rss/dunya/news>|200|03/08/2026|valid|140|2695|
31|CNN Turk (Ekonomi / News)|<https://www.cnnturk.com/feed/rss/ekonomi/news>|200|03/08/2026|valid|140|2695|
32|CNN Turk (Bilim-Teknoloji / News)|<https://www.cnnturk.com/feed/rss/bilim-teknoloji/news>|needs check|03/08/2026|needs verification|0|0|
33|CNN Turk (Spor / News)|<https://www.cnnturk.com/feed/rss/spor/news>|200|03/08/2026|valid|140|2695|
34|CNN Turk (Saglk / News)|<https://www.cnnturk.com/feed/rss/saglik/news>|200|03/08/2026|valid|140|2695|
35|TRT Haber (Son Dakika)|<http://www.trthaber.com/sondakika.rss>|200|03/08/2026|valid|200|3850|
36|Haberturk (Main)|<http://www.haberturk.com/rss>|200|03/08/2026|valid|400|7700|
37|Dunya (Main)|<https://www.dunya.com/rss?dunya>|200|03/08/2026|valid|100|1925|
38|BBC Turkce|<https://feeds.bbci.co.uk/turkce/rss.xml>|200|03/08/2026|valid|81|1537|
39|Hurriyet Ekonomi (Major Economy)|<https://www.hurriyet.com.tr/rss/ekonomi>|needs check|03/08/2026|needs verification|0|0|
40|Bloomberg HT (Economy and Finance)|<https://www.bloomberght.com/rss>|200|03/08/2026|valid|80|1540|
41|Dunya (Economy Specialist)|<https://www.dunya.com/rss>|200|03/08/2026|valid|100|1925|
42|NTV (Main Broadcaster)|<https://www.ntv.com.tr/rss>|needs check|03/08/2026|needs verification|0|0|
43|NTV Ekonomi (Economy)|<https://www.ntv.com.tr/ekonomi.rss>|200|03/08/2026|valid|80|1540|
44|Sozcu (National Daily)|<https://www.sozcu.com.tr/rss>|needs check|03/08/2026|needs verification|0|0|
45|Sozcu Ekonomi (Economy)|<https://www.sozcu.com.tr/kategori/ekonomi/rss>|needs check|03/08/2026|needs verification|0|0|
46|Haberturk Ekonomi (Portal Economy)|<https://www.haberturk.com/rss/ekonomi.xml>|200|03/08/2026|valid|120|2310|
47|TRT Haber (Public Broadcaster Breaking)|<https://www.trthaber.com/sondakika.rss>|200|03/08/2026|valid|200|3850|
48|Milliyet (Major Daily)|<https://www.milliyet.com.tr/rss/rssnew/sondakikarss.xml>|needs check|03/08/2026|needs verification|0|0|
49|Karar (Politics and Analysis)|<https://www.karar.com/rss>|200|03/08/2026|valid|160|3080|
50|Yeni Safak (Conservative Daily)|<https://www.yenisafak.com/rss>|200|03/08/2026|valid|60|1155|
51|Ensonhaber (General Breaking)|<https://www.ensonhaber.com/rss/ensonhaber.xml>|200|03/08/2026|valid|100|1925|
52|T24 (Independent Digital Media)|<https://t24.com.tr/rss>|Recovered via sitemap|03/08/2026|valid|0|0|
53|Webtekno (Tech/IT)|<https://www.webtekno.com/rss.xml>|200|03/08/2026|valid|198|3848|

### Saudi Arabia (SA)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Okaz|<https://www.okaz.com.sa/rss/news>|needs check|03/08/2026|needs verification|0|0|
2|Al Jazirah|<https://www.aljazeera.net/rss>|200|03/08/2026|valid|100|1923|
3|Al Madina|<https://www.al-madina.com/rssFeed/193>|200|03/08/2026|valid|200|3850|
4|Al Bilad Daily|<https://albiladdaily.com/feed>|200|03/08/2026|valid|40|770|
5|Makkah Newspaper|<https://makkahnewspaper.com/rssFeed/0>|200|03/08/2026|valid|200|3850|
6|Al Jazirah|<https://www.al-jazirah.com/rss/ln.xml>|200|03/08/2026|valid|60|1036|
7|Al Arabiya (EN - Business)|<https://english.alarabiya.net/feed/business>|needs check|03/08/2026|needs verification|0|0|
8|Al Arabiya (EN - Middle East)|<https://english.alarabiya.net/feed/middle-east>|needs check|03/08/2026|needs verification|0|0|
9|Asharq Business (Bloomberg Arabic)|<https://asharqbusiness.com/feed>|needs check|03/08/2026|needs verification|0|0|
10|Gulf Business (Saudi Section)|<https://gulfbusiness.com/region/saudi-arabia/feed/>|200 (HTML_RETURNED)|03/08/2026|invalid|0|0|
11|Saudi Gazette (Business)|<https://saudigazette.com.sa/rss/3>|needs check|03/08/2026|needs verification|0|0|
12|Zawya|<https://www.zawya.com/en/rss>|needs check|03/08/2026|needs verification|0|0|
13|Arab News|<https://www.arabnews.com/rss.xml>|needs check|03/08/2026|needs verification|0|0|
14|Al Eqtisadiah (Economy - Arabic)|<https://www.aleqt.com/feed>|needs check|03/08/2026|needs verification|0|0|
15|Saudi Press Agency (Arabic)|<https://www.spa.gov.sa/rss>|needs check|03/08/2026|needs verification|0|0|
16|Al Riyadh (Main - Arabic)|<https://www.alriyadh.com/rss>|needs check|03/08/2026|needs verification|0|0|
17|Al Arabiya (Business - Arabic)|<https://www.alarabiya.net/feed/business>|needs check|03/08/2026|needs verification|0|0|
18|Argaam (Arabic Economy/Stocks #1)|<https://www.argaam.com/ar/rss/news/type/1>|needs check|03/08/2026|needs verification|0|0|
19|Mubasher Saudi (Finance/Markets)|<https://www.mubasher.info/countries/sa/rss>|needs check|03/08/2026|needs verification|0|0|
20|Al Arabiya Saudi (Saudi Domestic)|<https://www.alarabiya.net/feed/saudi-today>|needs check|03/08/2026|needs verification|0|0|
21|Sabq (Saudi Top Online Outlet)|<https://sabq.org/feed>|needs check|03/08/2026|needs verification|0|0|
22|Maaal (Saudi Business)|<https://www.maaal.com/feed>|needs check|03/08/2026|needs verification|0|0|
23|Al Watan (Saudi Domestic Breaking)|<https://www.alwatan.com.sa/rss>|needs check|03/08/2026|needs verification|0|0|
24|Sky News Arabia (Arabic Business)|<https://www.skynewsarabia.com/rss.xml>|200|03/08/2026|valid|248|6271|
25|CNBC Arabia (Middle East Economy)|<https://www.cnbcarabia.com/RSS/117>|needs check|03/08/2026|needs verification|0|0|
26|Independent Arabia (Independent Arabic)|<https://www.independentarabia.com/rss.xml>|200|03/08/2026|valid|400|7700|
27|Akhbaar24 (General Portal)|<https://akhbaar24.argaam.com/rss>|Recovered via sitemap|03/08/2026|valid|0|0|
28|Al Yaum (Domestic Trends)|<https://www.alyaum.com/rss>|needs check|03/08/2026|needs verification|0|0|
29|Zawya Arabic (Middle East Business)|<https://www.zawya.com/ar/rss>|needs check|03/08/2026|needs verification|0|0|

### Taiwan (TW)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Liberty Times - Business|<https://news.ltn.com.tw/rss/business.xml>|200|03/08/2026|valid|160|3080|
2|TechNews Taiwan|<https://technews.tw/feed/>|200|03/08/2026|valid|160|3040|
3|CNA (Central News Agency)|<https://feeds.feedburner.com/cnaFirstNews>|200|03/08/2026|valid|24|462|
4|Formosa Reporter|<https://www.formosapost.com/feed/>|200|03/08/2026|valid|40|750|
5|CNA |<https://feeds.feedburner.com/rsscna/politics>|200|03/08/2026|valid|80|1540|
6|CNA |<https://feeds.feedburner.com/rsscna/intworld>|200|03/08/2026|valid|80|1540|
7|CNA |<https://feeds.feedburner.com/rsscna/mainland>|200|03/08/2026|valid|80|1540|
8|CNA |<https://feeds.feedburner.com/rsscna/finance>|200|03/08/2026|valid|80|1540|
9|CNA |<https://feeds.feedburner.com/rsscna/technology>|200|03/08/2026|valid|80|1540|
10|CNA |<https://feeds.feedburner.com/rsscna/lifehealth>|200|03/08/2026|valid|80|1540|
11|CNA |<https://feeds.feedburner.com/rsscna/social>|200|03/08/2026|valid|80|1540|
12|CNA |<https://feeds.feedburner.com/rsscna/local>|200|03/08/2026|valid|80|1540|
13|CNA |<https://feeds.feedburner.com/rsscna/culture>|200|03/08/2026|valid|80|1540|
14|CNA |<https://feeds.feedburner.com/rsscna/sport>|200|03/08/2026|valid|80|1540|
15|CNA |<https://feeds.feedburner.com/rsscna/stars>|200|03/08/2026|valid|80|1540|
16|Liberty Times |<https://news.ltn.com.tw/rss/all.xml>|200|03/08/2026|valid|160|3080|
17|Liberty Times |<https://news.ltn.com.tw/rss/politics.xml>|200|03/08/2026|valid|160|3080|
18|Liberty Times |<https://news.ltn.com.tw/rss/society.xml>|200|03/08/2026|valid|160|3080|
19|Liberty Times |<https://news.ltn.com.tw/rss/life.xml>|200|03/08/2026|valid|160|3080|
20|Liberty Times |<https://news.ltn.com.tw/rss/opinion.xml>|200|03/08/2026|valid|160|3080|
21|Liberty Times |<https://news.ltn.com.tw/rss/world.xml>|200|03/08/2026|valid|160|3080|
22|Liberty Times |<https://news.ltn.com.tw/rss/sports.xml>|200|03/08/2026|valid|160|3080|
23|Liberty Times |<https://news.ltn.com.tw/rss/entertainment.xml>|200|03/08/2026|valid|160|3080|
24|Liberty Times |<https://news.ltn.com.tw/rss/art.xml>|200|03/08/2026|valid|160|3080|
25|Liberty Times |<https://news.ltn.com.tw/rss/def.xml>|200|03/08/2026|valid|160|3080|
26|Liberty Times |<https://news.ltn.com.tw/rss/local.xml>|200|03/08/2026|valid|160|3080|
27|Liberty Times |<https://news.ltn.com.tw/rss/novelty.xml>|200|03/08/2026|valid|160|3080|
28|Taipei Times (EN)|<https://www.taipeitimes.com/xml/index.rss>|needs check|03/08/2026|needs verification|0|0|
29|The Reporter|<https://www.twreporter.org/a/rss2.xml>|200|03/08/2026|valid|40|770|
30|Newtalk |<https://newtalk.tw/rss/all/>|200|03/08/2026|valid|400|7700|
31|Newtalk |<https://newtalk.tw/rss/category/2>|200|03/08/2026|valid|400|7700|
32|Youth Daily News |<https://www.ydn.com.tw/tw/Home/RSS.aspx?TID=2>|200|03/08/2026|valid|72|1386|

### Poland (PL)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Onet|<https://wiadomosci.onet.pl/rss>|200|03/08/2026|valid|80|1540|
2|TVN24|<https://tvn24.pl/tvnmeteo.xml>|needs check|03/08/2026|needs verification|0|0|
3|Fakt|<https://www.fakt.pl/rss/>|200|03/08/2026|valid|80|1540|
4|Wprost|<https://www.wprost.pl/rss/>|200|03/08/2026|valid|246|4690|
5|RMF24 (Main)|<https://www.rmf24.pl/feed>|200|03/08/2026|valid|60|1163|
6|RMF24 Fakty|<https://www.rmf24.pl/fakty/feed>|200|03/08/2026|valid|200|3850|
7|RMF24 Polska|<https://www.rmf24.pl/fakty/polska/feed>|200|03/08/2026|valid|200|3850|
8|RMF24 Polityka|<https://www.rmf24.pl/fakty/polityka/feed>|200|03/08/2026|valid|200|3850|
9|RMF24 Swiat|<https://www.rmf24.pl/fakty/swiat/feed>|200|03/08/2026|valid|200|3850|
10|RMF24 Ekonomia|<https://www.rmf24.pl/ekonomia/feed>|200|03/08/2026|valid|200|3850|
11|RMF24 Nauka|<https://www.rmf24.pl/nauka/feed>|200|03/08/2026|valid|200|3850|
12|RMF24 Kultura|<https://www.rmf24.pl/kultura/feed>|200|03/08/2026|valid|200|3850|
13|RMF24 Sport|<https://www.rmf24.pl/sport/feed>|200|03/08/2026|valid|200|3850|
14|RMF24 Ciekawostki|<https://www.rmf24.pl/rozrywka/ciekawostki/feed>|200|03/08/2026|valid|200|3850|
15|RMF24 Komentarze|<https://www.rmf24.pl/tylko-w-rmf24/komentarze/feed>|200|03/08/2026|valid|200|3850|
16|RMF24 Podsumowanie dnia|<https://www.rmf24.pl/fakty/podsumowanie-dnia/feed>|200|03/08/2026|valid|200|3850|
17|PolsatNews Wszystkie|<https://www.polsatnews.pl/rss/wszystkie.xml>|200|03/08/2026|valid|200|3750|
18|PolsatNews Polska|<https://www.polsatnews.pl/rss/polska.xml>|200|03/08/2026|valid|200|3750|
19|PolsatNews Swiat|<https://www.polsatnews.pl/rss/swiat.xml>|200|03/08/2026|valid|200|3750|
20|PolsatNews Wideo|<https://www.polsatnews.pl/rss/wideo.xml>|200|03/08/2026|valid|200|3750|
21|PolsatNews Biznes|<https://www.polsatnews.pl/rss/biznes.xml>|200|03/08/2026|valid|200|3750|
22|PolsatNews Technologie|<https://www.polsatnews.pl/rss/technologie.xml>|200|03/08/2026|valid|200|3750|
23|PolsatNews Moto|<https://www.polsatnews.pl/rss/moto.xml>|200|03/08/2026|valid|200|3750|
24|PolsatNews Kultura|<https://www.polsatnews.pl/rss/kultura.xml>|200|03/08/2026|valid|200|3750|
25|PolsatNews Sport|<https://www.polsatnews.pl/rss/sport.xml>|200|03/08/2026|valid|200|3750|
26|PolsatNews Czysta Polska|<https://www.polsatnews.pl/rss/czysta-polska.xml>|200|03/08/2026|valid|200|3750|
27|Nauka w Polsce (All)|<https://naukawpolsce.pl/all/rss.xml>|200|03/08/2026|valid|40|770|
28|Nauka w Polsce (Science categories)|<https://naukawpolsce.pl/naukowy/rss.xml>|200|03/08/2026|valid|40|770|
29|Nauka w Polsce (Technologia)|<https://naukawpolsce.pl/technologia/rss.xml>|200|03/08/2026|valid|40|770|
30|Nauka w Polsce (Blog)|<https://naukawpolsce.pl/blog/rss.xml>|200|03/08/2026|valid|40|770|
31|PAP MediaRoom (All)|<https://pap-mediaroom.pl/rss.xml>|200|03/08/2026|valid|0|0|
32|PAP MediaRoom (Biznes i finanse)|<https://pap-mediaroom.pl/kategoria/biznes-i-finanse/rss.xml>|200|03/08/2026|valid|0|0|
33|PAP MediaRoom (Nauka i technologie)|<https://pap-mediaroom.pl/kategoria/nauka-i-technologie/rss.xml>|200|03/08/2026|valid|0|0|
34|PAP MediaRoom (Kalendarium)|<https://pap-mediaroom.pl/kalendarium/rss.xml>|200|03/08/2026|valid|40|770|
35|Onet Wiadomosci (Top Portal News)|<https://wiadomosci.onet.pl/.feed>|200|03/08/2026|valid|80|1540|
36|TVN24 Najnowsze (TVN24 News)|<https://tvn24.pl/najnowsze.xml>|500 (HTTP_500)|03/08/2026|invalid|32|1258|
37|TVN24 Biznes (TVN24 Business)|<https://tvn24.pl/biznes.xml>|needs check|03/08/2026|needs verification|0|0|
38|Money.pl (Polish Economy Portal #1)|<https://www.money.pl/rss/>|200|03/08/2026|valid|60|1155|
39|Bankier.pl (Finance/Investing)|<https://www.bankier.pl/rss/wiadomosci.xml>|200|03/08/2026|valid|208|4017|
40|Wprost (Politics/Current Affairs)|<https://www.wprost.pl/rss>|200|03/08/2026|valid|246|4690|
41|Rzeczpospolita (Economy/Politics)|<https://www.rp.pl/rss/all>|needs check|03/08/2026|needs verification|0|0|
42|Gazeta.pl (Top Portal News)|<https://rss.gazeta.pl/pub/rss/wiadomosci.xml>|200|03/08/2026|valid|120|2310|
43|Wiadomosci WP (Wirtualna Polska News)|<https://wiadomosci.wp.pl/rss.xml>|200|03/08/2026|valid|60|1155|
44|Dziennik Gazeta Prawna (Business/Legal)|<https://www.gazetaprawna.pl/rss.xml>|needs check|03/08/2026|needs verification|0|0|

### Sweden (SE)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Dagens Nyheter|<https://www.dn.se/nyheter/rss/>|200|03/08/2026|valid|474|9221|
2|Dagens Industri|<https://www.di.se/rss/>|200|03/08/2026|valid|80|1540|
3|SVT Nyheter|<https://www.svt.se/nyheter/rss.xml>|200|03/08/2026|valid|80|1540|
4|Goteborgs-Posten|<https://www.gp.se/rss>|200|03/08/2026|valid|178|3358|
5|Sveriges Television|<https://www.svt.se/nyheter/ekonomi/rss.xml>|200|03/08/2026|valid|80|1540|
6|Svt|<https://www.svt.se/nyheter/rss.xml?sectionId=2>|200|03/08/2026|valid|80|1540|
7|Dagens Nyheter Sport|<https://www.dn.se/sport/rss>|200|03/08/2026|valid|400|7700|
8|Dagens Nyheter Business|<https://www.dn.se/ekonomi/rss>|200|03/08/2026|valid|412|7951|
9|Norran|<https://www.norran.se/rss>|200|03/08/2026|valid|120|2310|
10|Aftonbladet - Nyheter (All)|<https://rss.aftonbladet.se/rss2/small/pages/sections/senastenytt/>|200|03/08/2026|valid|136|2618|
11|Aftonbladet - Sportbladet|<https://rss.aftonbladet.se/rss2/small/pages/sections/senastenytt/sport/>|200|03/08/2026|valid|140|2695|
12|Aftonbladet - Sportbladet Fotboll|<https://rss.aftonbladet.se/rss2/small/pages/sections/sportbladet/fotboll/>|200|03/08/2026|valid|140|2695|
13|Aftonbladet - Sportbladet Hockey|<https://rss.aftonbladet.se/rss2/small/pages/sections/sportbladet/hockey/>|200|03/08/2026|valid|140|2695|
14|Aftonbladet - Nojesbladet|<https://rss.aftonbladet.se/rss2/small/pages/sections/nojesbladet/>|200|03/08/2026|valid|146|3607|
15|Aftonbladet - Kultur|<https://rss.aftonbladet.se/rss2/small/pages/sections/kultur/>|200|03/08/2026|valid|140|2695|
16|Expressen - Nyheter|<https://feeds.expressen.se/nyheter/>|200|03/08/2026|valid|80|1540|
17|GT - Nyheter|<https://feeds.expressen.se/gt/>|200|03/08/2026|valid|80|1540|
18|Svenska Dagbladet - Frontpage|<https://www.svd.se/?service=rss>|200|03/08/2026|valid|120|2310|
19|The Local Sweden (EN)|<https://feeds.thelocal.com/rss/se>|200|03/08/2026|valid|80|1480|
20|Sveriges Radio - Ekot nyhetssandning (pod)|<https://api.sr.se/api/rss/pod/3795>|200|03/08/2026|valid|480|9240|
21|Sveriges Radio - P3 Nyheter pa en minut (pod)|<https://api.sr.se/api/rss/pod/22376>|200|03/08/2026|valid|480|9240|
22|Sveriges Radio - Radio Sweden pa latt svenska (program)|<https://api.sr.se/api/rss/program/4916?format=1>|200|03/08/2026|valid|80|1540|
23|Radio Sweden - Sweden Today (podcast xml)|<http://sverigesradio.se/Podradio/xml/SRI_en_sweToday.xml>|Recovered via sitemap|03/08/2026|valid|0|0|
24|Proletaren|<https://proletaren.se/rss.xml>|200|03/08/2026|valid|40|770|
25|SVT Lokal - Sydnytt|<http://svt.se/nyheter/regionalt/sydnytt/rss.xml>|200|03/08/2026|valid|80|1540|
26|SVT Lokal - Blekingenytt|<http://svt.se/nyheter/regionalt/blekingenytt/rss.xml>|200|03/08/2026|valid|80|1540|
27|SVT Lokal - Mittnytt|<http://svt.se/nyheter/regionalt/mittnytt/rss.xml>|200|03/08/2026|valid|80|1540|
28|SVT Lokal - Jamtlandsnytt|<http://svt.se/nyheter/regionalt/jamtlandsnytt/rss.xml>|200|03/08/2026|valid|80|1540|
29|Sydsvenskan (fallback)|<https://www.sydsvenskan.se/feeds/feed.xml>|200|03/08/2026|valid|162|3357|
30|Nerikes Allehanda (fallback)|<https://www.na.se/feeds/feed.xml>|200|03/08/2026|valid|196|3794|
31|Dagens Industri (Economy #1 Daily)|<https://www.di.se/rss>|200|03/08/2026|valid|80|1540|
32|Expressen Din Ekonomi (Economy)|<https://feeds.expressen.se/din-ekonomi/>|needs check|03/08/2026|needs verification|0|0|
33|Dagens Nyheter Ekonomi (Economy)|<https://www.dn.se/ekonomi/rss/>|200|03/08/2026|valid|412|7951|
34|Svenska Dagbladet Naringsliv (Business)|<https://www.svd.se/naringsliv/?service=rss>|200|03/08/2026|valid|120|2310|
35|Omni (Swedish News Aggregator)|<https://omni.se/rss>|needs check|03/08/2026|needs verification|0|0|
36|Ny Teknik (Tech and Engineering)|<https://www.nyteknik.se/rss.xml>|needs check|03/08/2026|needs verification|0|0|
37|Breakit (Startups and VC)|<https://www.breakit.se/feed/artiklar>|200|03/08/2026|valid|104|1408|
38|Privata Affarer (Personal Finance/Investing)|<https://www.privataaffarer.se/rss.xml>|200|03/08/2026|valid|400|7700|

### Belgium (BE)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|De Morgen|<https://www.demorgen.be/rss.xml>|200|03/08/2026|valid|80|1538|
2|La Libre|<https://www.lalibre.be/arc/outboundfeeds/rss/section/belgique/?outputType=xml>|200|03/08/2026|valid|400|7700|
3|Knack|<https://www.knack.be/feed/>|200|03/08/2026|valid|200|3850|
4|VRT News|<https://www.vrt.be/vrtnws/nl.rss.articles.xml>|200|03/08/2026|valid|200|3850|
5|La Derniere Heure|<https://www.dhnet.be/rss.xml>|200|03/08/2026|valid|400|7700|
6|Le Vif|<https://www.levif.be/feed/>|200|03/08/2026|valid|200|3850|
7|RTBF|<https://rss.rtbf.be/article/rss/highlight_rtbf_info.xml?source=internal>|200|03/08/2026|valid|80|1540|
8|Het Nieuwsblad|<https://www.nieuwsblad.be/rss/>|needs check|03/08/2026|needs verification|0|0|
9|La Libre Belgique|<https://www.lalibre.be/rss/>|200|03/08/2026|valid|400|7700|
10|La Libre|<https://www.lalibre.be/rss>|200|03/08/2026|valid|400|7700|
11|The Bulletin (EN)|<https://www.thebulletin.be/rss.xml>|200|03/08/2026|valid|40|760|
12|HLN (Het Laatste Nieuws)|<https://www.hln.be/home/rss.xml>|200|03/08/2026|valid|120|2310|
13|Brussels Morning|<https://brusselsmorning.com/feed>|200|03/08/2026|valid|200|3700|
14|L'Echo|<https://www.lecho.be/rss/top_stories.xml>|200|03/08/2026|valid|40|770|
15|De Standaard (example section)|<https://www.standaard.be/rss/section/1f2838d4-99ea-49f0-9102-138784c7ea7c>|needs check|03/08/2026|needs verification|0|0|
16|Het Nieuwsblad (example section)|<https://www.nieuwsblad.be/rss/section/55178e67-15a8-4ddd-a3d8-bfe5708f8932>|needs check|03/08/2026|needs verification|0|0|
17|Le Soir (main)|<https://www.lesoir.be/rss2/9/cible_principale>|needs check|03/08/2026|needs verification|0|0|
18|Brussels Times|<https://www.brusselstimes.com/rss-feed>|needs check|03/08/2026|needs verification|0|0|
19|City of Brussels (official)|<https://www.brussels.be/rss.xml>|200|03/08/2026|valid|40|770|

### Thailand (TH)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|The Thaiger|<https://thethaiger.com/feed>|200|03/08/2026|valid|40|770|
2|Khaosod English|<https://www.khaosodenglish.com/rss>|200|03/08/2026|valid|20|385|
3|Matichon|<https://www.matichon.co.th/rss>|200|03/08/2026|valid|200|3850|
4|Prachachat|<https://prachachat.net/feed/>|200|03/08/2026|valid|120|2250|
5|Daily News|<https://www.dailynews.co.th/rss>|200|03/08/2026|valid|0|0|
6|Prachatai English (Feedburner)|<http://feeds.feedburner.com/prachataienglish>|200|03/08/2026|valid|40|770|
7|Thai PBS (news feed endpoint)|<https://news.thaipbs.or.th/rss/news>|200|03/08/2026|valid|80|1540|
8|Thairath (News)|<http://www.thairath.co.th/rss/news.xml>|Recovered via sitemap|03/08/2026|valid|0|0|
9|Thairath (Sport)|<http://www.thairath.co.th/rss/sport.xml>|Recovered via sitemap|03/08/2026|valid|0|0|
10|Sanook - Hot News|<http://rssfeeds.sanook.com/rss/feeds/sanook/hot.news.xml>|200|03/08/2026|valid|80|1540|
11|Sanook - Daily News|<http://rssfeeds.sanook.com/rss/feeds/sanook/news.index.xml>|200|03/08/2026|valid|80|1540|
12|Sanook - Politics|<http://rssfeeds.sanook.com/rss/feeds/sanook/news.politic.xml>|200|03/08/2026|valid|80|1540|
13|Sanook - Crime|<http://rssfeeds.sanook.com/rss/feeds/sanook/news.crime.xml>|200|03/08/2026|valid|80|1540|
14|Sanook - World|<http://rssfeeds.sanook.com/rss/feeds/sanook/news.world.xml>|200|03/08/2026|valid|80|1540|
15|Sanook - Economy|<http://rssfeeds.sanook.com/rss/feeds/sanook/news.economic.xml>|200|03/08/2026|valid|40|770|
16|Sanook - Tech (News)|<http://rssfeeds.sanook.com/rss/feeds/sanook/hitech.news.xml>|200|03/08/2026|valid|80|1540|
17|Sanook - Tech (Computer)|<http://rssfeeds.sanook.com/rss/feeds/sanook/hitech.computer.index.xml>|200|03/08/2026|valid|80|1540|
18|Sanook - Tech (Mobile)|<http://rssfeeds.sanook.com/rss/feeds/sanook/hitech.mobile.index.xml>|200|03/08/2026|valid|80|1540|
19|Sanook - Travel|<http://rssfeeds.sanook.com/rss/feeds/sanook/travel.index.xml>|200|03/08/2026|valid|40|770|
20|Sanook - Movies|<http://rssfeeds.sanook.com/rss/feeds/sanook/movie.news.xml>|200|03/08/2026|valid|80|1540|
21|PressDisplay - Bangkok Post|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=1264>|200|03/08/2026|valid|0|0|
22|PressDisplay - Daily News Thailand|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=4863>|needs check|03/08/2026|needs verification|0|0|
23|PressDisplay - Krungthep Turakij|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=5261&type=full>|needs check|03/08/2026|needs verification|0|0|
24|PressDisplay - The Phuket News|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=eff9&type=full>|200|03/08/2026|valid|0|0|
25|PressDisplay - Novosti Phuketa|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=9wv3&type=full>|200|03/08/2026|valid|0|0|
26|PressDisplay - Window On Phuket|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=9wv4&type=full>|needs check|03/08/2026|needs verification|0|0|
27|PressDisplay - Where to Eat in Phuket|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=9wv5&type=full>|needs check|03/08/2026|needs verification|0|0|
28|PressDisplay - Prestige (Thailand)|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=9vw7&type=full>|200|03/08/2026|valid|0|0|
29|PressDisplay - Hello! (Thailand)|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=9vw6&type=full>|200|03/08/2026|valid|0|0|
30|Khaosod English - Food (category)|<http://www.khaosodenglish.com/category/life/food/feed>|200|03/08/2026|valid|20|380|
31|Thairath (Top News)|<https://www.thairath.co.th/rss/news.xml>|needs check|03/08/2026|needs verification|0|0|
32|Matichon (Leading Political Daily)|<https://www.matichon.co.th/feed>|200|03/08/2026|valid|200|3850|
33|Prachachat (Business/Economy #1)|<https://www.prachachat.net/feed>|200|03/08/2026|valid|120|2310|
34|Khaosod (Popular General News)|<https://www.khaosod.co.th/feed>|200|03/08/2026|valid|200|3849|
35|Sanook News (Top Portal)|<https://rssfeeds.sanook.com/rss/feeds/sanook/news.index.xml>|200|03/08/2026|valid|80|1540|
36|Sanook Economy (Portal Economy)|<https://rssfeeds.sanook.com/rss/feeds/sanook/news.economic.xml>|200|03/08/2026|valid|40|770|
37|Bangkok Biz News (Economy)|<https://www.bangkokbiznews.com/rss/feed>|Recovered via sitemap|03/08/2026|valid|0|0|
38|Manager Online (Politics/Society)|<https://mgronline.com/rss>|needs check|03/08/2026|needs verification|0|0|
39|The Standard (Top Media)|<https://thestandard.co/feed/>|200|03/08/2026|valid|0|260|
40|Thansettakij|<https://www.thansettakij.com/rss/feed>|Recovered via sitemap|03/08/2026|valid|0|0|
41|Bangkok Insight|<https://www.thebangkokinsight.com/feed/>|200|03/08/2026|valid|40|750|
42|Nation TV|<https://www.nationtv.tv/rss/feed>|Recovered via sitemap|03/08/2026|valid|0|0|
43|Post Today|<https://www.posttoday.com/rss/feed>|Recovered via sitemap|03/08/2026|valid|0|0|
44|MCOT Economy|<https://tna.mcot.net/category/economy/feed>|needs check|03/08/2026|needs verification|0|0|

### Iran (IR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|IRNA|<https://www.irna.ir/rss>|needs check|03/08/2026|needs verification|0|0|
2|Mehr News|<https://www.mehrnews.com/rss>|200|03/08/2026|valid|90|900|
3|ILNA|<https://www.ilna.news/rss>|needs check|03/08/2026|needs verification|0|0|
4|Khabar Online|<https://www.khabaronline.ir/rss>|200|03/08/2026|valid|90|990|
5|Iran International|<https://www.iranintl.com/feed>|200|03/08/2026|valid|400|7700|
6|ILNA|<https://www.ilna.ir/rss>|needs check|03/08/2026|needs verification|0|0|
7|Tejarat News|<https://www.tejaratnews.com/rss>|needs check|03/08/2026|needs verification|0|0|
8|Tehran Times - Latest|<https://www.tehrantimes.com/rss>|needs check|03/08/2026|needs verification|0|0|
9|Tehran Times - Homepage|<https://www.tehrantimes.com/rss-homepage>|needs check|03/08/2026|needs verification|0|0|
10|Tehran Times - Breaking|<https://www.tehrantimes.com/rss/pl/617>|needs check|03/08/2026|needs verification|0|0|
11|Tehran Times - Society|<https://www.tehrantimes.com/rss/tp/696>|needs check|03/08/2026|needs verification|0|0|
12|Tehran Times - Economy|<https://www.tehrantimes.com/rss/tp/697>|needs check|03/08/2026|needs verification|0|0|
13|Tehran Times - Politics|<https://www.tehrantimes.com/rss/tp/698>|needs check|03/08/2026|needs verification|0|0|
14|Tehran Times - Sports|<https://www.tehrantimes.com/rss/tp/699>|needs check|03/08/2026|needs verification|0|0|
15|Tehran Times - Culture|<https://www.tehrantimes.com/rss/tp/700>|needs check|03/08/2026|needs verification|0|0|
16|Tehran Times - International|<https://www.tehrantimes.com/rss/tp/702>|needs check|03/08/2026|needs verification|0|0|
17|Tehran Times - Multimedia|<https://www.tehrantimes.com/rss/tp/717>|needs check|03/08/2026|needs verification|0|0|
18|Tehran Times - Tourism|<https://www.tehrantimes.com/rss/tp/807>|needs check|03/08/2026|needs verification|0|0|
19|MehrNews (EN) - Latest|<https://en.mehrnews.com/rss/pl/118>|200|03/08/2026|valid|90|900|
20|MehrNews (EN) - Iran|<https://en.mehrnews.com/rss/tp/575>|200|03/08/2026|valid|90|900|
21|MehrNews (EN) - Iran > Iran|<https://en.mehrnews.com/rss/tp/905>|200|03/08/2026|valid|90|900|
22|MehrNews (EN) - Ethnic Groups|<https://en.mehrnews.com/rss/tp/897>|needs check|03/08/2026|needs verification|0|0|
23|MehrNews (EN) - Nature|<https://en.mehrnews.com/rss/tp/898>|200|03/08/2026|valid|3|66|
24|MehrNews (EN) - Historical Sites|<https://en.mehrnews.com/rss/tp/899>|needs check|03/08/2026|needs verification|0|0|
25|MehrNews (EN) - Souvenirs|<https://en.mehrnews.com/rss/tp/900>|needs check|03/08/2026|needs verification|0|0|
26|MehrNews (EN) - Persian Cuisine|<https://en.mehrnews.com/rss/tp/901>|200|03/08/2026|valid|6|60|
27|ISNA (EN) - Social|<https://en.isna.ir/rss/tp/8>|needs check|03/08/2026|needs verification|0|0|
28|ISNA (EN) - Economy|<https://en.isna.ir/rss/tp/33>|needs check|03/08/2026|needs verification|0|0|
29|ISNA (EN) - Politics|<https://en.isna.ir/rss/tp/13>|needs check|03/08/2026|needs verification|0|0|
30|ISNA (EN) - Culture & Art|<https://en.isna.ir/rss/tp/19>|needs check|03/08/2026|needs verification|0|0|
31|ISNA (EN) - Sports|<https://en.isna.ir/rss/tp/23>|needs check|03/08/2026|needs verification|0|0|
32|ISNA (EN) - Photos|<https://en.isna.ir/rss/tp/27>|needs check|03/08/2026|needs verification|0|0|
33|Tasnim (EN) - Top Stories|<https://www.tasnimnews.ir/en/rss/feed/0/0/8/1/TopStories>|200|03/08/2026|valid|100|1925|
34|Tasnim (EN) - All Stories|<https://www.tasnimnews.ir/en/rss/feed/0/0/0/0/AllStories>|200|03/08/2026|valid|4|531|
35|Tasnim (EN) - Politics|<https://www.tasnimnews.ir/en/rss/feeds/1192/0/0/0>|200|03/08/2026|valid|4|321|
36|Tasnim (EN) - Economy|<https://www.tasnimnews.ir/en/rss/feeds/1193/0/0/0>|needs check|03/08/2026|needs verification|0|0|
37|Tasnim (EN) - World|<https://www.tasnimnews.ir/en/rss/feeds/1194/0/0/0>|200|03/08/2026|valid|4|122|

### Argentina (AR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Ambito - Portada|<https://www.ambito.com/rss/pages/home.xml>|200|03/08/2026|valid|80|1560|
2|Ambito - Ultimas noticias|<https://www.ambito.com/rss/pages/ultimas-noticias.xml>|200|03/08/2026|valid|59|1130|
3|Ambito - Economia|<https://www.ambito.com/rss/pages/economia.xml>|200|03/08/2026|valid|80|2113|
4|Ambito - Finanzas|<https://www.ambito.com/rss/pages/finanzas.xml>|200|03/08/2026|valid|158|2891|
5|Ambito - Negocios|<https://www.ambito.com/rss/pages/negocios.xml>|200|03/08/2026|valid|80|1560|
6|Ambito - Politica|<https://www.ambito.com/rss/pages/politica.xml>|200|03/08/2026|valid|80|2086|
7|Ambito - Nacional|<https://www.ambito.com/rss/pages/nacional.xml>|200|03/08/2026|valid|80|3321|
8|Ambito - Mundo|<https://www.ambito.com/rss/pages/mundo.xml>|200|03/08/2026|valid|80|3634|
9|Ambito - Lifestyle|<https://www.ambito.com/rss/pages/lifestyle.xml>|200|03/08/2026|valid|80|2440|
10|Ambito - Deportes|<https://www.ambito.com/rss/pages/deportes.xml>|200|03/08/2026|valid|80|1960|
11|Ambito - Tecnologia|<https://www.ambito.com/rss/pages/tecnologia.xml>|200|03/08/2026|valid|80|1560|
12|Ambito - Autos|<https://www.ambito.com/rss/pages/autos.xml>|200|03/08/2026|valid|80|1560|
13|Ambito - Edicion impresa|<https://www.ambito.com/rss/pages/edicion-impresa.xml>|200|03/08/2026|valid|80|1560|
14|Pagina/12 - Portada|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/portada>|200|03/08/2026|valid|24|466|
15|Pagina/12 - Edicion impresa|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/edicion-impresa>|200|03/08/2026|valid|203|4035|
16|Pagina/12 - El Pais|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/el-pais/notas>|200|03/08/2026|valid|100|1950|
17|Pagina/12 - Economia|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/economia/notas>|200|03/08/2026|valid|100|1950|
18|Pagina/12 - Sociedad|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/sociedad/notas>|200|03/08/2026|valid|100|1950|
19|Pagina/12 - El Mundo|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/el-mundo/notas>|200|03/08/2026|valid|100|1950|
20|Pagina/12 - Deportes|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/deportes/notas>|200|03/08/2026|valid|100|1950|
21|Pagina/12 - Ciencia|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/ciencia/notas>|200|03/08/2026|valid|100|1950|
22|Pagina/12 - Psicologia|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/psicologia/notas>|200|03/08/2026|valid|100|1950|
23|Pagina/12 - Cartas de Lectores|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/cartas-de-lectores/notas>|needs check|03/08/2026|needs verification|0|0|
24|Pagina/12 - Cash|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/suplementos/cash/notas>|200|03/08/2026|valid|100|1950|
25|Pagina/12 - Las 12|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/suplementos/las12/notas>|200|03/08/2026|valid|100|1950|
26|Pagina/12 - Radar|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/suplementos/radar/notas>|200|03/08/2026|valid|100|1950|
27|Pagina/12 - Turismo|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/suplementos/turismo/notas>|needs check|03/08/2026|needs verification|0|0|
28|LA NACION - General|<https://www.lanacion.com.ar/arc/outboundfeeds/rss/?outputType=xml>|200|03/08/2026|valid|400|7788|
29|El Cronista - Noticias|<https://www.cronista.com/files/rss/news.xml>|200|03/08/2026|valid|221|4408|
30|Clarín - Ultimo Momento|<https://www.clarin.com/rss/lo-ultimo/>|200|03/08/2026|valid|40|780|
31|Clarin - Economia|<https://www.clarin.com/rss/economia/>|200|03/08/2026|valid|40|780|
32|Clarin - Politica|<https://www.clarin.com/rss/politica/>|200|03/08/2026|valid|40|780|
33|La Nacion - Economia|<https://www.lanacion.com.ar/arc/outboundfeeds/rss/?outputType=xml&rotation=economia>|200|03/08/2026|valid|400|7788|
34|La Nacion - Politica|<https://www.lanacion.com.ar/arc/outboundfeeds/rss/?outputType=xml&rotation=politica>|200|03/08/2026|valid|400|7788|
35|Infobae - Argentina|<https://www.infobae.com/feeds/rss/argentina/>|needs check|03/08/2026|needs verification|0|0|
36|Infobae - Economia|<https://www.infobae.com/feeds/rss/economia/>|needs check|03/08/2026|needs verification|0|0|
37|El Cronista - Finanzas|<https://www.cronista.com/files/rss/finanzas_markets.xml>|needs check|03/08/2026|needs verification|0|0|
38|El Cronista - Economia|<https://www.cronista.com/files/rss/economia_politica.xml>|needs check|03/08/2026|needs verification|0|0|
39|Rosario3 - Home|<https://www.rosario3.com/rss/feed.xml>|200|03/08/2026|valid|200|3900|
40|TN|<https://tn.com.ar/rss.xml>|200|03/08/2026|valid|400|1800|
41|La Nacion|<https://www.lanacion.com.ar/arc/outboundfeeds/rss/>|200|03/08/2026|valid|400|1793|
42|Cronica|<https://www.cronica.com.ar/feed/>|200|03/08/2026|valid|400|1700|
43|El Economista|<https://eleconomista.com.ar/feed/>|200|03/08/2026|valid|480|2160|
44|BAE Negocios|<https://www.baenegocios.com/feed/>|200|03/08/2026|valid|200|900|
45|Perfil|<https://www.perfil.com/feed/>|200|03/08/2026|valid|200|900|
46|Buenos Aires Times|<https://www.batimes.com.ar/feed>|200|03/08/2026|valid|400|1800|
47|El Tribuno|<https://www.eltribuno.com/feed/>|200|03/08/2026|valid|100|425|
48|Diario Registrado|<https://www.diarioregistrado.com/rss.xml>|200|03/08/2026|valid|80|360|
49|Rio Negro|<https://www.rionegro.com.ar/feed/>|200|03/08/2026|valid|80|360|
50|Econojournal|<https://econojournal.com.ar/feed/>|200|03/08/2026|valid|40|180|
51|TecnoGeek|<https://tecnogeek.com/feed/>|200|03/08/2026|valid|40|180|
52|La Gaceta Tucuman|<https://www.lagaceta.com.ar/rss>|200|03/08/2026|valid|127|559|
53|MercoPress|<https://en.mercopress.com/rss>|200|03/08/2026|valid|40|180|
54|Chequeado|<https://chequeado.com/feed/>|200|03/08/2026|valid|200|900|
55|Ole|<https://www.ole.com.ar/rss/ultimas-noticias/>|200|03/08/2026|valid|40|180|
56|Border Periodismo|<https://borderperiodismo.com/feed/>|200|03/08/2026|valid|104|442|
57|Data Diario|<https://datadiario.com/feed/>|200|03/08/2026|valid|100|425|
58|Primera Edicion|<https://www.primeraedicion.com.ar/feed/>|200|03/08/2026|valid|80|340|
59|Surtidores|<https://surtidores.com.ar/feed/>|200|03/08/2026|valid|40|170|
60|Jujuy al Dia|<https://www.jujuyaldia.com.ar/feed/>|200|03/08/2026|valid|40|170|
61|El Diario Parana|<https://www.eldiario.com.ar/rss>|200|03/08/2026|valid|40|170|
62|El Inversor Energetico|<https://elinversorenergetico.com/feed/>|200|03/08/2026|valid|40|170|
63|Misiones Online|<https://misionesonline.net/feed/>|200|03/08/2026|valid|40|170|
64|Clarin - Mundo|<https://www.clarin.com/rss/mundo/>|200|03/08/2026|valid|40|170|
65|Pagina/12 - Cultura|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/cultura-y-espectaculos/notas>|200|03/08/2026|valid|100|425|
66|MDZ Online - Ultimas noticias|<https://www.mdzol.com/rss/pages/noticias.xml>|200|03/08/2026|valid|36|152|
67|MDZ Online - Ultimas noticias Argentina|<https://www.mdzol.com/rss/pages/ultimas-noticias-argentina.xml>|200|03/08/2026|valid|36|153|
68|MDZ Online - Ultimas noticias Mendoza|<https://www.mdzol.com/rss/pages/ultimas-noticias-mendoza.xml>|200|03/08/2026|valid|36|153|
69|MDZ Online - Deportes|<https://www.mdzol.com/rss/pages/deportes.xml>|200|03/08/2026|valid|80|340|
70|MDZ Online - Economia|<https://www.mdzol.com/rss/pages/dinero.xml>|200|03/08/2026|valid|80|340|
71|MDZ Online - Mundo|<https://www.mdzol.com/rss/pages/mundo.xml>|200|03/08/2026|valid|80|340|
72|MDZ Online - Policiales|<https://www.mdzol.com/rss/pages/policiales.xml>|200|03/08/2026|valid|80|340|
73|MDZ Online - Politica|<https://www.mdzol.com/rss/pages/politica.xml>|200|03/08/2026|valid|80|340|
74|MDZ Online - Sociedad|<https://www.mdzol.com/rss/pages/sociedad.xml>|200|03/08/2026|valid|80|340|
75|MDZ Online - Tecnologia|<https://www.mdzol.com/rss/pages/tecnologia.xml>|200|03/08/2026|valid|80|340|

### Chile (CL)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Diario Financiero|<https://www.df.cl/noticias/site/list/port/rss.xml>|200|03/08/2026|valid|200|3850|
2|The Clinic|<https://www.theclinic.cl/feed/>|200|03/08/2026|valid|40|770|
3|El Rancaguino|<https://www.elrancaguino.cl/feed/>|200|03/08/2026|valid|40|740|
4|Cambio21|<https://cambio21.cl/rss>|200|03/08/2026|valid|400|7700|
5|La Discusion|<https://ladiscusion.cl/feed/>|200|03/08/2026|valid|40|760|
6|La Nacion (Chile)|<https://www.lanacion.cl/feed>|200|03/08/2026|valid|40|770|
7|El Siglo|<https://elsiglo.cl/feed>|200|03/08/2026|valid|40|770|
8|The Santiago Times|<https://santiagotimes.cl/feed>|200|03/08/2026|valid|40|770|
9|Infoweek|<https://infoweek.biz/feed>|needs check|03/08/2026|needs verification|0|0|
10|El Desconcierto|<https://eldesconcierto.cl/feeds/rss.xml>|200|03/08/2026|valid|400|1800|
11|La Prensa Austral|<https://laprensaaustral.cl/feed/>|200|03/08/2026|valid|40|770|
12|CIPER Chile|<https://www.ciperchile.cl/feed/>|200|03/08/2026|valid|64|1232|
13|Radio Universidad de Chile|<https://radio.uchile.cl/feed/>|200|03/08/2026|valid|120|2160|
14|La Tercera - Home|<https://www.latercera.com/arc/outboundfeeds/rss/?outputType=xml>|200|03/08/2026|valid|400|7700|
15|Pulso (La Tercera Biz)|<https://www.latercera.com/arc/outboundfeeds/rss/?outputType=xml&rotation=pulso>|200|03/08/2026|valid|400|7700|
16|Emol - Nacional|<https://www.emol.com/rss/rss_nacional.xml>|Recovered via sitemap|03/08/2026|valid|0|0|
17|Emol - Economia|<https://www.emol.com/rss/rss_economia.xml>|Recovered via sitemap|03/08/2026|valid|0|0|
18|BioBioChile - Home|<https://www.biobiochile.cl/feed>|needs check|03/08/2026|needs verification|0|0|
19|Cooperativa - Economia|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_5___1.xml>|200|03/08/2026|valid|60|1005|
20|Cooperativa - Pais|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_3___1.xml>|200|03/08/2026|valid|60|1005|
21|Cooperativa - País|<https://m.cooperativa.cl/noticias/site/tax/port/all/rss_3___1.xml>|200|03/08/2026|valid|60|1005|
22|Cooperativa - Deportes|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_1___24.xml>|200|03/08/2026|valid|60|1005|
23|Cooperativa - Deportes|<https://m.cooperativa.cl/noticias/site/tax/port/all/rss_1___24.xml>|200|03/08/2026|valid|60|1005|
24|Cooperativa - Cine|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_4_4__1.xml>|200|03/08/2026|valid|60|1005|
25|Cooperativa - Musica|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_4_11__1.xml>|200|03/08/2026|valid|60|1005|
26|Cooperativa - Banco Central|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_6_82__1.xml>|200|03/08/2026|valid|60|1005|
27|Cooperativa - Banco Central|<https://m.cooperativa.cl/noticias/site/tax/port/all/rss_6_82__1.xml>|200|03/08/2026|valid|60|1005|
28|Cooperativa - Banco Central|<https://m.cooperativa.cl/noticias/site/tax/port/fid_noticia/rss_6_82__1.xml>|200|03/08/2026|valid|60|1005|
29|Cooperativa - Banco Central|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_6_82__1.xml>|200|03/08/2026|valid|60|1005|
30|Cooperativa - Futbol|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_1_30__1.xml>|200|03/08/2026|valid|60|1005|
31|Cooperativa - Universidad de Chile|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_1_30_332_1.xml>|200|03/08/2026|valid|60|1005|
32|Cooperativa - Copa Davis|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_1_58_534_1.xml>|200|03/08/2026|valid|60|1005|
33|Cooperativa - Sociedad|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_7_136__1.xml>|200|03/08/2026|valid|60|1005|
34|Cooperativa - Genetica (Sociedad)|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_7_221_1735_1.xml>|200|03/08/2026|valid|12|201|
35|Cooperativa - Genetica (88frases)|<https://88frases.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_7_221_1735_1.xml>|200|03/08/2026|valid|12|201|
36|Cooperativa - Oftalmologia (Sociedad)|<https://88frases.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_7_120_1804_1.xml>|200|03/08/2026|valid|32|536|
37|Cooperativa - Donald Trump|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_2_76_2384_1.xml>|200|03/08/2026|valid|60|1005|
38|Cooperativa - Argentina|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_2_70__1.xml>|200|03/08/2026|valid|60|1005|
39|Cooperativa - Musica Chilena|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_4_11_779_1.xml>|200|03/08/2026|valid|60|1005|
40|Cooperativa - Cine|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_4_4__1.xml>|200|03/08/2026|valid|60|1005|
41|Cooperativa - Música|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_4_11__1.xml>|200|03/08/2026|valid|60|1005|
42|Cooperativa - Venezuela|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_3_81_1474_1.xml>|200|03/08/2026|valid|60|1005|
43|Reporte Minero|<https://www.reporteminero.cl/feed>|needs check|03/08/2026|needs verification|0|0|
44|Diario Concepcion|<https://www.diarioconcepcion.cl/feed>|needs check|03/08/2026|needs verification|0|0|
45|Pauta|<https://www.pauta.cl/feed>|Recovered via sitemap|03/08/2026|valid|320|1360|
46|El Pinguino|<https://elpinguino.com/feed/>|200|03/08/2026|valid|160|680|
47|Fast Check CL|<https://www.fastcheck.cl/feed/>|200|03/08/2026|valid|400|1700|
48|Diario El Centro|<https://www.diarioelcentro.cl/feed/>|200|03/08/2026|valid|40|170|
49|Ex-Ante|<https://www.ex-ante.cl/feed/>|200|03/08/2026|valid|40|170|
50|El Ciudadano|<https://www.elciudadano.com/feed/>|200|03/08/2026|valid|40|170|
51|El Insular|<https://www.elinsular.cl/feed/>|200|03/08/2026|valid|16|64|
52|Interferencia|<https://interferencia.cl/rss.xml>|200|03/08/2026|valid|40|180|
53|Diario Constitucional|<https://www.diarioconstitucional.cl/feed/>|200|03/08/2026|valid|80|360|
54|Concierto|<https://www.concierto.cl/feed/>|200|03/08/2026|valid|80|360|
55|Futuro|<https://www.futuro.cl/feed/>|200|03/08/2026|valid|40|180|
56|Rock&Pop|<https://www.rockandpop.cl/feed/>|200|03/08/2026|valid|40|180|

### Dominican Republic (DO)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Diario Libre - Portada|<https://www.diariolibre.com/rss/portada.xml>|200|03/08/2026|valid|156|2643|
2|Diario Libre - Actualidad|<https://www.diariolibre.com/rss/actualidad.xml>|200|03/08/2026|valid|120|2310|
3|Diario Libre - Politica|<https://www.diariolibre.com/rss/politica.xml>|200|03/08/2026|valid|120|2310|
4|Diario Libre - Economia|<https://www.diariolibre.com/rss/economia.xml>|200|03/08/2026|valid|120|2310|
5|Diario Libre - Opinion|<https://www.diariolibre.com/rss/opinion.xml>|200|03/08/2026|valid|120|2310|
6|Diario Libre - Deportes|<https://www.diariolibre.com/rss/deportes.xml>|200|03/08/2026|valid|120|2310|
7|Diario Libre - Mundo|<https://www.diariolibre.com/rss/mundo.xml>|200|03/08/2026|valid|120|2310|
8|Diario Libre - Videos|<https://www.diariolibre.com/rss/videos.xml>|200|03/08/2026|valid|120|2280|
9|Diario Libre - Edicion USA|<https://www.diariolibre.com/rss/dl-usa.xml>|200|03/08/2026|valid|120|2310|
10|AlMomento - Portada|<https://almomento.net/feed/>|200|03/08/2026|valid|80|1540|
11|AlMomento - Politica|<https://almomento.net/categoria/politica/feed/>|200|03/08/2026|valid|80|1540|
12|AlMomento - Deportes|<https://almomento.net/categoria/deportes/feed/>|200|03/08/2026|valid|80|1540|
13|AlMomento - Economicas|<https://almomento.net/categoria/economicas/feed/>|200|03/08/2026|valid|80|1540|
14|AlMomento - Dominicanos en el Exterior|<https://almomento.net/categoria/dominicanos-en-el-exterior/feed/>|needs check|03/08/2026|needs verification|0|0|
15|AlMomento - Internacionales|<https://almomento.net/categoria/internacionales/feed/>|200|03/08/2026|valid|80|1540|
16|AlMomento - Variedades|<https://almomento.net/categoria/variedades/feed/>|200|03/08/2026|valid|80|1540|
17|AlMomento - Opinion|<https://almomento.net/categoria/opinion/feed/>|200|03/08/2026|valid|80|1500|
18|AlMomento - Haiti|<https://almomento.net/categoria/haiti/feed/>|200|03/08/2026|valid|80|1500|
19|AlMomento - Provincias|<https://almomento.net/categoria/provincias/feed/>|200|03/08/2026|valid|80|1520|
20|El Nacional|<https://elnacional.com.do/feed/>|200|03/08/2026|valid|60|1140|
21|El Nuevo Diario|<https://elnuevodiario.com.do/feed/>|200|03/08/2026|valid|40|740|
22|Listin Diario - Portada|<https://listindiario.com/rss/portada.xml>|needs check|03/08/2026|needs verification|0|0|
23|Listin Diario - Economia|<https://listindiario.com/rss/economia.xml>|200|03/08/2026|valid|400|7700|
24|Periodico Hoy|<https://hoy.com.do/feed/>|needs check|03/08/2026|needs verification|0|0|
25|El Dinero|<https://eldinero.com.do/feed/>|200|03/08/2026|valid|80|1540|
26|Acento|<https://acento.com.do/feed/>|needs check|03/08/2026|needs verification|0|0|
27|Acento - Author Feed|<https://acento.com.do/author/jcastillo/feed/>|Recovered via sitemap|03/08/2026|valid|0|0|
28|Noticias SIN|<https://feeds.feedburner.com/noticiassin1>|200|03/08/2026|valid|40|770|
29|Noticias SIN|<https://noticiassin.com/feed/>|needs check|03/08/2026|needs verification|0|0|
30|El Caribe|<https://www.elcaribe.com.do/feed/>|needs check|03/08/2026|needs verification|0|0|

### Uruguay (UY)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|El Observador - Home|<https://www.elobservador.com.uy/rss/pages/home.xml>|200|03/08/2026|valid|80|1540|
2|El Observador - Ultimo momento|<https://www.elobservador.com.uy/rss/pages/ultimo-momento.xml>|200|03/08/2026|valid|73|1430|
3|El Observador - Mundo|<https://www.elobservador.com.uy/rss/pages/Mundo.xml>|200|03/08/2026|valid|80|1540|
4|El Observador - Nacional|<https://www.elobservador.com.uy/rss/pages/nacional.xml>|200|03/08/2026|valid|80|1540|
5|El Observador - Sociales|<https://www.elobservador.com.uy/rss/pages/sociales.xml>|200|03/08/2026|valid|80|1540|
6|El Observador - Cafe y Negocios|<https://www.elobservador.com.uy/rss/pages/cafe-y-negocios.xml>|200|03/08/2026|valid|80|1540|
7|El Observador - Agro|<https://www.elobservador.com.uy/rss/pages/Agro.xml>|200|03/08/2026|valid|80|1540|
8|El Observador - Economia y Empresas|<https://www.elobservador.com.uy/rss/pages/economia.xml>|200|03/08/2026|valid|80|1540|
9|El Observador - Opinion|<https://www.elobservador.com.uy/rss/pages/opinion.xml>|200|03/08/2026|valid|80|1540|
10|El Observador - Salud|<https://www.elobservador.com.uy/rss/pages/salud.xml>|200|03/08/2026|valid|80|1540|
11|El Observador - Ciencia y Tecnologia|<https://www.elobservador.com.uy/rss/pages/ciencia-y-tecnologia.xml>|200|03/08/2026|valid|80|1540|
12|El Observador - Cultura y Espectaculos|<https://www.elobservador.com.uy/rss/pages/cultura-y-espectaculos.xml>|200|03/08/2026|valid|80|1540|
13|El Observador - Ediciones especiales|<https://www.elobservador.com.uy/rss/pages/ediciones-especiales.xml>|200|03/08/2026|valid|80|1540|
14|El Observador - Referi|<https://www.elobservador.com.uy/rss/pages/referi.xml>|200|03/08/2026|valid|80|1540|
15|El Observador - Running|<https://www.elobservador.com.uy/rss/pages/running.xml>|200|03/08/2026|valid|80|1540|
16|El Observador - Seleccion|<https://www.elobservador.com.uy/rss/pages/seleccion.xml>|200|03/08/2026|valid|80|1540|
17|El Observador - Rugby|<https://www.elobservador.com.uy/rss/pages/rugby.xml>|200|03/08/2026|valid|80|1540|
18|El Observador - Polideportivo|<https://www.elobservador.com.uy/rss/pages/polideportivo.xml>|200|03/08/2026|valid|80|1540|
19|El Observador - Basquetbol|<https://www.elobservador.com.uy/rss/pages/basquetbol.xml>|200|03/08/2026|valid|80|1540|
20|El Observador - Copa America|<https://www.elobservador.com.uy/rss/pages/copa-america-odl.xml>|200|03/08/2026|valid|80|1540|
21|El Observador - Motor|<https://www.elobservador.com.uy/rss/pages/motor.xml>|200|03/08/2026|valid|80|1540|
22|El Observador - Futbol internacional|<https://www.elobservador.com.uy/rss/pages/futbol-internacional.xml>|200|03/08/2026|valid|80|1540|
23|El Observador - Futbol|<https://www.elobservador.com.uy/rss/pages/futbol.xml>|200|03/08/2026|valid|80|1540|
24|El Observador - Copa Libertadores|<https://www.elobservador.com.uy/rss/pages/copa-libertadores.xml>|200|03/08/2026|valid|80|1540|
25|Montevideo Portal - Informacion destacada|<https://www.montevideo.com.uy/anxml.aspx?58>|200|03/08/2026|valid|204|3824|
26|Montevideo Portal - Noticias|<https://www.montevideo.com.uy/anxml.aspx?59>|200|03/08/2026|valid|32|608|
27|Montevideo Portal - Tiempo Libre|<https://www.montevideo.com.uy/anxml.aspx?60>|200|03/08/2026|valid|32|600|
28|Montevideo Portal - Tecnologia|<https://www.montevideo.com.uy/anxml.aspx?133>|200|03/08/2026|valid|24|456|
29|Montevideo Portal - Negocios & Tendencias|<https://www.montevideo.com.uy/anxml.aspx?728>|200|03/08/2026|valid|52|988|
30|Montevideo Portal - Deportes|<https://www.montevideo.com.uy/anxml.aspx?1727>|200|03/08/2026|valid|64|1216|
31|El Pais - Portada|<https://www.elpais.com.uy/rss>|403 (HTTP_403)|03/08/2026|invalid|80|1540|
32|El Pais - Economia|<https://www.elpais.com.uy/rss/economia-y-mercado>|403 (HTTP_403)|03/08/2026|invalid|80|1540|
33|Montevideo Portal - Negocios|<https://www.montevideo.com.uy/anxml.aspx?728>|200|03/08/2026|valid|52|988|
34|La Diaria - Politica|<https://ladiaria.com.uy/feeds/section/politica/>|needs check|03/08/2026|needs verification|0|0|
35|La Diaria - Economia|<https://ladiaria.com.uy/feeds/section/economia/>|needs check|03/08/2026|needs verification|0|0|
36|Subrayado - Home|<https://www.subrayado.com.uy/rss/pages/home.xml>|200|03/08/2026|valid|80|1540|
37|Subrayado - Sociedad|<https://www.subrayado.com.uy/rss/pages/sociedad.xml>|200|03/08/2026|valid|80|1540|
38|Subrayado - Nacional|<https://www.subrayado.com.uy/rss/pages/nacional.xml>|200|03/08/2026|valid|80|1540|
39|Subrayado - Politica|<https://www.subrayado.com.uy/rss/pages/politica.xml>|200|03/08/2026|valid|80|1540|
40|Subrayado - Policiales|<https://www.subrayado.com.uy/rss/pages/policiales.xml>|200|03/08/2026|valid|80|1540|
41|Subrayado - Internacionales|<https://www.subrayado.com.uy/rss/pages/internacionales.xml>|200|03/08/2026|valid|80|1540|
42|Subrayado - Opinion|<https://www.subrayado.com.uy/rss/pages/opinion.xml>|200|03/08/2026|valid|80|1540|
43|Subrayado - Tecnologia e Internet|<https://www.subrayado.com.uy/rss/pages/tecnologia-internet.xml>|200|03/08/2026|valid|80|1540|
44|Subrayado - Deportes|<https://www.subrayado.com.uy/rss/pages/deportes.xml>|200|03/08/2026|valid|80|1540|
45|Subrayado - Economia|<https://www.subrayado.com.uy/rss/pages/economia.xml>|200|03/08/2026|valid|80|1540|
46|Subrayado|<https://www.subrayado.com.uy/rss/pages/ultimas-noticias.xml>|needs check|03/08/2026|needs verification|0|0|
47|Teledoce|<https://www.teledoce.com/feed/>|200|03/08/2026|valid|40|770|
48|La Diaria|<https://ladiaria.com.uy/feeds/articles/>|needs check|03/08/2026|needs verification|0|0|
49|La Republica|<https://www.republica.com.uy/feed/>|needs check|03/08/2026|needs verification|0|0|
50|Caras y Caretas|<https://www.carasycaretas.com.uy/feed>|needs check|03/08/2026|needs verification|0|0|
51|El Pais Uruguay|<https://www.elpais.com.uy/rss/ultimas-noticias>|needs check|03/08/2026|needs verification|0|0|

### Austria (AT)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Der Standard|<https://www.derstandard.at/rss>|200|03/08/2026|valid|480|9240|
2|ORF|<https://rss.orf.at/news.xml>|needs check|03/08/2026|needs verification|0|0|
3|Die Presse|<https://www.diepresse.com/rss>|needs check|03/08/2026|needs verification|0|0|
4|Tiroler Tageszeitung|<https://www.tt.com/rss/news.xml>|200|03/08/2026|valid|244|5892|
5|ORF Aktuell|<https://rss.orf.at/>|needs check|03/08/2026|needs verification|0|0|
6|Kurier (Top News)|<https://kurier.at/xml/rssd>|200|03/08/2026|valid|80|1540|
7|Neue Donau|<https://www.neue.at/feed>|200|03/08/2026|valid|40|724|
8|Der Standard|<https://www.derstandard.at/rss?section=welt>|200|03/08/2026|valid|480|9240|
9|Kleine Zeitung|<https://www.kleinezeitung.at/rss/home>|200|03/08/2026|valid|4|77|
10|Der Standard|<https://www.derstandard.at/rss?output=amp>|200|03/08/2026|valid|480|9240|
11|Der Standard Plus|<https://www.derstandard.at/rss/wirtschaft>|200|03/08/2026|valid|128|2464|
12|derStandard - International|<https://www.derstandard.at/rss/international>|200|03/08/2026|valid|127|2569|
13|derStandard - Inland|<https://www.derstandard.at/rss/inland>|200|03/08/2026|valid|128|2464|
14|derStandard - Web|<https://www.derstandard.at/rss/web>|200|03/08/2026|valid|204|3927|
15|derStandard - Sport|<https://www.derstandard.at/rss/sport>|200|03/08/2026|valid|180|3465|
16|derStandard - Panorama|<https://www.derstandard.at/rss/panorama>|200|03/08/2026|valid|128|2464|
17|derStandard - Etat|<https://www.derstandard.at/rss/etat>|200|03/08/2026|valid|136|2630|
18|derStandard - Kultur|<https://www.derstandard.at/rss/kultur>|200|03/08/2026|valid|140|2695|
19|derStandard - Wissenschaft|<https://www.derstandard.at/rss/wissenschaft>|200|03/08/2026|valid|212|4081|
20|derStandard - Gesundheit|<https://www.derstandard.at/rss/gesundheit>|200|03/08/2026|valid|64|1232|
21|derStandard - Lifestyle|<https://www.derstandard.at/rss/lifestyle>|200|03/08/2026|valid|186|3556|
22|derStandard - Karriere|<https://www.derstandard.at/rss/karriere>|200|03/08/2026|valid|112|2156|
23|derStandard - Immobilien|<https://www.derstandard.at/rss/immobilien>|200|03/08/2026|valid|96|1848|
24|derStandard - Diskurs|<https://www.derstandard.at/rss/diskurs>|200|03/08/2026|valid|184|3700|
25|derStandard - dieStandard.at|<https://www.derstandard.at/rss/diestandard>|200|03/08/2026|valid|108|2079|
26|derStandard - Live|<https://www.derstandard.at/rss/live>|200|03/08/2026|valid|92|1771|
27|derStandard - Video|<https://www.derstandard.at/rss/video>|200|03/08/2026|valid|80|1540|
28|derStandard - Podcast|<https://www.derstandard.at/rss/podcast>|200|03/08/2026|valid|104|2002|
29|derStandard - Recht|<https://www.derstandard.at/rss/recht>|200|03/08/2026|valid|64|1232|
30|ORF Wien (Vienna Local/Business)|<https://rss.orf.at/wien.xml>|200|03/08/2026|valid|72|1463|
31|Die Presse (Political Headlines)|<https://www.diepresse.com/rss/Home>|needs check|03/08/2026|needs verification|0|0|
32|Die Presse (Economy)|<https://www.diepresse.com/rss/Wirtschaft>|needs check|03/08/2026|needs verification|0|0|
33|Kurier (Top Daily)|<https://kurier.at/xml/rss>|200|03/08/2026|valid|80|1540|
34|Finanzen.at (Stocks/Finance)|<https://www.finanzen.at/rss/news>|200|03/08/2026|valid|40|750|
35|Trend.at (Business Magazine)|<https://www.trend.at/xml/rss>|needs check|03/08/2026|needs verification|0|0|
36|Kronen Zeitung|<https://www.krone.at/rss.xml>|needs check|03/08/2026|needs verification|0|0|
37|Heute|<https://www.heute.at/rss/news>|needs check|03/08/2026|needs verification|0|0|
38|OE24|<https://www.oe24.at/news/rss>|needs check|03/08/2026|needs verification|0|0|
39|OR Nachrichten|<https://www.nachrichten.at/news/rss.xml>|needs check|03/08/2026|needs verification|0|0|
40|Vienna Online|<https://www.vienna.at/news/feed>|needs check|03/08/2026|needs verification|0|0|

### Norway (NO)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|NRK|<https://www.nrk.no/toppsaker.rss>|200|03/08/2026|valid|400|7700|
2|NRK News|<https://www.nrk.no/nyheter/siste.rss>|200|03/08/2026|valid|80|1540|
3|TV2|<https://www.tv2.no/rss/toppsaker.xml>|needs check|03/08/2026|needs verification|0|0|
4|E24|<https://e24.no/rss>|200|03/08/2026|valid|28|502|
5|Dagbladet|<https://www.dagbladet.no/rss/nyheter>|200|03/08/2026|valid|460|8855|
6|TV2|<https://www.tv2.no/rss/nyheter/>|200|03/08/2026|valid|80|1540|
7|E24|<https://e24.no/rss/okonomi.xml>|200|03/08/2026|valid|28|503|
8|TV2|<https://www.tv2.no/rss/politikk.xml>|needs check|03/08/2026|needs verification|0|0|
9|E24|<https://e24.no/rss/nyheter.xml>|200|03/08/2026|valid|28|502|
10|VG - Forsiden|<https://www.vg.no/rss/feed/forsiden/>|needs check|03/08/2026|needs verification|0|0|
11|VG - Innenriks|<https://www.vg.no/rss/feed/?categories=1069>|200|03/08/2026|valid|40|770|
12|VG - Utenriks|<https://www.vg.no/rss/feed/?categories=1070>|200|03/08/2026|valid|40|770|
13|E24 - Brs og finans|<https://e24.no/rss2/?seksjon=boers-og-finans>|200|03/08/2026|valid|40|770|
14|E24 - Aksjetips|<http://e24.no/rss2/?seksjon=aksjetips>|200|03/08/2026|valid|28|502|
15|E24 - IT & Telekom|<http://e24.no/rss2/?seksjon=it>|200|03/08/2026|valid|28|503|
16|NRK - RSS oversikt (directory)|<https://www.nrk.no/rss/>|needs check|03/08/2026|needs verification|0|0|
17|NRK - Innenriks|<https://www.nrk.no/norge/toppsaker.rss>|200|03/08/2026|valid|80|1540|
18|TV2 - Nyheter|<https://www.tv2.no/rss/nyheter>|200|03/08/2026|valid|80|1540|
19|TV2 - Innenriks|<https://www.tv2.no/rss/nyheter/innenriks>|200|03/08/2026|valid|80|1540|
20|TV2 - Utenriks|<https://www.tv2.no/rss/nyheter/utenriks>|200|03/08/2026|valid|80|1520|
21|TV2 - Sport|<https://www.tv2.no/rss/sport>|200|03/08/2026|valid|80|1540|
22|TV2 - Underholdning|<https://www.tv2.no/rss/underholdning>|200|03/08/2026|valid|80|1540|
23|Nettavisen - Alle saker|<https://www.nettavisen.no/service/rich-rss>|needs check|03/08/2026|needs verification|0|0|
24|Nettavisen - Nyheter|<https://www.nettavisen.no/service/rich-rss?tag=nyheter>|needs check|03/08/2026|needs verification|0|0|
25|Nettavisen - Sport|<https://www.nettavisen.no/service/rich-rss?tag=sport>|needs check|03/08/2026|needs verification|0|0|
26|Dagbladet|<https://www.dagbladet.no/?lab_viewport=rss>|200|03/08/2026|valid|131|3238|
27|Aftenposten|<https://www.aftenposten.no/rss/>|200|03/08/2026|valid|100|1925|
28|Dagsavisen|<https://www.dagsavisen.no/rss>|200|03/08/2026|valid|350|6339|
29|DN - RSS directory|<https://services.dn.no/tools/rss>|needs check|03/08/2026|needs verification|0|0|
30|DN - Alle nyheter|<https://services.dn.no/api/feed/rss/>|200|03/08/2026|valid|32|2617|
31|Finansavisen|<https://ws.finansavisen.no/api/articles.rss>|200|03/08/2026|valid|40|770|
32|Finansavisen - Brs|<https://ws.finansavisen.no/api/articles.rss?category=B%C3%B8rs>|200|03/08/2026|valid|40|770|
33|VG (Verdens Gang)|<https://www.vg.no/rss/feed>|200|03/08/2026|valid|40|770|
34|Finansavisen (Finance/Investment)|<https://finansavisen.no/rss>|needs check|03/08/2026|needs verification|0|0|
35|Teknisk Ukeblad (Tech/Energy/Marine)|<https://www.tu.no/feed>|needs check|03/08/2026|needs verification|0|0|
36|E24 Energi (Energy/Marine Industry)|<https://e24.no/energi/rss>|needs check|03/08/2026|needs verification|0|0|
37|Adresseavisen|<https://www.adressa.no/rss/>|200|03/08/2026|valid|408|7761|

### Global Energy & Grid (Global)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|OilPrice|<https://oilprice.com/rss/main>|200|03/08/2026|valid|60|1155|
2|Power Engineering|<https://www.power-eng.com/feed/>|200|03/08/2026|valid|40|750|
3|Renewable Energy World|<https://www.renewableenergyworld.com/feed/>|200|03/08/2026|valid|40|760|
4|Utility Dive|<https://www.utilitydive.com/feeds/news/>|200|03/08/2026|valid|40|760|
5|CleanTechnica|<https://cleantechnica.com/feed/>|200|03/08/2026|valid|180|3465|
6|Carbon Brief|<https://www.carbonbrief.org/feed/>|200|03/08/2026|valid|40|770|
7|Power Magazine|<https://www.powermag.com/feed/>|200|03/08/2026|valid|40|770|
8|PV Magazine|<https://www.pv-magazine.com/feed/>|200|03/08/2026|valid|100|1925|
9|Energy Post|<https://energypost.eu/feed/>|needs check|03/08/2026|needs verification|0|0|
10|Energy Storage News|<https://www.energy-storage.news/rss>|200|03/08/2026|valid|200|3850|
11|Energy Storage News|<https://www.energy-storage.news/feed>|200|03/08/2026|valid|200|3850|

