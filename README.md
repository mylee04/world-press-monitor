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

- Last checked: 02/24/2026
- `❌ NO_SOURCE` means no RSS source is configured for this country yet.
- `❌ 000` means not verified in the current environment yet.

## Health Check Workflow

Source of truth:
- `data/rss-atlas.json`

Run health check (daily) locally:
- `bun run rss:health:daily`

GitHub Actions is also configured:
- Workflow: `.github/workflows/rss-health-daily.yml`
- Schedule: 00:30 AM America/Chicago (cron is UTC in Actions; currently set at 06:30 UTC, so it runs at 01:30 during CDT and 00:30 during CST)
- Manual run: Actions tab → `RSS Health Daily` → `Run workflow`

Data retention policy used by the daily job:
- `news_articles`: keep last **3 days**

Retention values can be changed at runtime by setting:
- `NEWS_ARTICLES_RETENTION_DAYS`




















## Latest RSS verification snapshot

- Checked endpoints: `54`
- Valid: `52`
- Invalid: `2`
- Recovered via sitemap: `10`
- No-source rows: `0`
- Sitemap fallback checks: checked `12`, attempted `12`, success `10`, failed `2`, no-candidate `0`, candidates `21`
- Snapshot date: `02/24/2026`
- RSS ingest baseline: `2026-02-20`
- RSS daily window: `1d` (runner: worker)
- Source artifact: `audits/readme_rss_health_latest.json`

### Failure reasons
|Reason|Count|
|---|---:|
|HTML_RETURNED|1|
|HTTP_403|1|

### Invalid feeds by reason

#### HTML_RETURNED (1)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Japan|Nikkan Kogyo (Industrial Manufacturing News)|<https://www.nikkan.co.jp/rss/news>|200|

#### HTTP_403 (1)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Austria|Finanzen.at (Stocks/Finance)|<https://www.finanzen.at/rss/news>|403|

### Sitemap fallback successes
|Country|Outlet|Failed RSS URL|Recovered via sitemap|
|---|---|---|---|
|Japan|Minkabu (Stocks/Investing)|<https://minkabu.jp/news/feed>|<https://minkabu.jp/hikaku/sitemap.xml>|
|Poland|Rzeczpospolita (Economy/Politics)|<https://www.rp.pl/rss/all>|<https://www.rp.pl/sitemaps/news-sitemap.xml>|
|Austria|Die Presse (Political Headlines)|<https://www.diepresse.com/rss/Home>|<https://www.diepresse.com/news-sitemap>|
|Austria|Trend.at (Business Magazine)|<https://www.trend.at/xml/rss>|<https://www.trend.at/sitemaps/sitemap-trend-googlenews.xml>|
|Norway|Finansavisen (Finance/Investment)|<https://finansavisen.no/rss>|<https://ws.finansavisen.no/sitemap/sitemap-articles-2005-1.xml>|
|Norway|Teknisk Ukeblad (Tech/Energy/Marine)|<https://www.tu.no/feed>|<https://www.tu.no/sitemap.xml?n=0>|
|Norway|E24 Energi (Energy/Marine Industry)|<https://e24.no/energi/rss>|<https://e24.no/sitemaps/files/articles-48hrs.xml>|
|Thailand|Thairath (Top News)|<https://www.thairath.co.th/rss/news.xml>|<https://www.thairath.co.th/sitemap-news-daily.xml>|
|Thailand|Bangkok Biz News (Economy)|<https://www.bangkokbiznews.com/rss/feed>|<https://image.bangkokbiznews.com/sitemap/xml/2026/sitemap_2026_02.xml>|
|Thailand|Manager Online (Politics/Society)|<https://mgronline.com/rss>|<https://mgronline.com/store/sitemap/sitemap-global.xml>|

### No-source rows
- none
### Japan (JP)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|NHK News (Politics - Category 1)|<https://www.nhk.or.jp/rss/news/cat1.xml>|200|02/24/2026|valid|116|116|
2|NHK News (Economy/Business - Category 3)|<https://www.nhk.or.jp/rss/news/cat3.xml>|200|02/24/2026|valid|21|21|
3|Mainichi Shimbun (Mainichi Flash)|<https://mainichi.jp/rss/etc/mainichi-flash.rss>|200|02/24/2026|valid|0|0|
4|Asahi Shimbun (Headlines)|<https://www.asahi.com/rss/asahi/newsheadlines.rdf>|200|02/24/2026|valid|0|0|
5|Nikkan Kogyo (Industrial Manufacturing News)|<https://www.nikkan.co.jp/rss/news>|200 (HTML_RETURNED)|02/24/2026|invalid|0|0|
6|Livedoor News (General Top Stories)|<https://news.livedoor.com/topics/rss/top.xml>|200|02/24/2026|valid|20|20|
7|Livedoor News (Economy)|<https://news.livedoor.com/topics/rss/eco.xml>|200|02/24/2026|valid|12|12|
8|GIGAZINE (Tech)|<https://gigazine.net/news/rss_2.0/>|200|02/24/2026|valid|30|30|
9|Zenn (Developer/Tech Community)|<https://zenn.dev/feed>|200|02/24/2026|valid|20|20|
10|Qiita (Japanese IT Trends)|<https://qiita.com/popular-items/feed>|200|02/24/2026|valid|30|30|
11|ITmedia Business Online (Business)|<https://rss.itmedia.co.jp/rss/2.0/business.xml>|200|02/24/2026|valid|20|20|
12|ITmedia NEWS (Tech Breaking)|<https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml>|200|02/24/2026|valid|50|50|
13|Toyo Keizai (Economy/Management)|<https://toyokeizai.net/list/feed/rss>|200|02/24/2026|valid|20|20|
14|Minkabu (Stocks/Investing)|<https://minkabu.jp/news/feed>|Recovered via sitemap|02/24/2026|valid|0|0|

### Poland (PL)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Onet Wiadomości (Top Portal News)|<https://wiadomosci.onet.pl/.feed>|200|02/24/2026|valid|20|20|
2|TVN24 Najnowsze (TVN24 News)|<https://tvn24.pl/najnowsze.xml>|200|02/24/2026|valid|26|26|
3|TVN24 Biznes (TVN24 Business)|<https://tvn24.pl/biznes.xml>|200|02/24/2026|valid|36|36|
4|Money.pl (Polish Economy Portal #1)|<https://www.money.pl/rss/>|200|02/24/2026|valid|15|15|
5|Bankier.pl (Finance/Investing)|<https://www.bankier.pl/rss/wiadomosci.xml>|200|02/24/2026|valid|47|47|
6|Wprost (Politics/Current Affairs)|<https://www.wprost.pl/rss>|200|02/24/2026|valid|58|58|
7|Rzeczpospolita (Economy/Politics)|<https://www.rp.pl/rss/all>|Recovered via sitemap|02/24/2026|valid|0|0|
8|Gazeta.pl (Top Portal News)|<https://rss.gazeta.pl/pub/rss/wiadomosci.xml>|200|02/24/2026|valid|30|30|
9|Wiadomosci WP (Wirtualna Polska News)|<https://wiadomosci.wp.pl/rss.xml>|200|02/24/2026|valid|15|15|
10|Dziennik Gazeta Prawna (Business/Legal)|<https://www.gazetaprawna.pl/rss.xml>|200|02/24/2026|valid|19|19|

### Austria (AT)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|ORF News|<https://rss.orf.at/news.xml>|200|02/24/2026|valid|0|0|
2|ORF Wien (Vienna Local/Business)|<https://rss.orf.at/wien.xml>|200|02/24/2026|valid|19|19|
3|Der Standard (Political Headlines)|<https://www.derstandard.at/rss>|200|02/24/2026|valid|120|120|
4|Der Standard (Economy)|<https://www.derstandard.at/rss/wirtschaft>|200|02/24/2026|valid|32|32|
5|Die Presse (Political Headlines)|<https://www.diepresse.com/rss/Home>|Recovered via sitemap|02/24/2026|valid|0|0|
6|Die Presse (Economy)|<https://www.diepresse.com/rss/Wirtschaft>|200|02/24/2026|valid|49|49|
7|Kurier (Top Daily)|<https://kurier.at/xml/rss>|200|02/24/2026|valid|20|20|
8|Kleine Zeitung (Top Regional Daily)|<https://www.kleinezeitung.at/rss/home>|200|02/24/2026|valid|1|1|
9|Finanzen.at (Stocks/Finance)|<https://www.finanzen.at/rss/news>|403 (HTTP_403)|02/24/2026|invalid|0|0|
10|Trend.at (Business Magazine)|<https://www.trend.at/xml/rss>|Recovered via sitemap|02/24/2026|valid|0|0|

### Norway (NO)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|NRK Nyheter (Top Broadcaster)|<https://www.nrk.no/nyheter/siste.rss>|200|02/24/2026|valid|20|20|
2|VG (Verdens Gang)|<https://www.vg.no/rss/feed>|200|02/24/2026|valid|10|10|
3|E24 (Top Economics Portal)|<https://e24.no/rss>|200|02/24/2026|valid|3|3|
4|Aftenposten (Major Daily)|<https://www.aftenposten.no/rss/>|200|02/24/2026|valid|25|25|
5|Dagens Næringsliv (DN Economics)|<https://services.dn.no/api/feed/rss/>|200|02/24/2026|valid|28|28|
6|Finansavisen (Finance/Investment)|<https://finansavisen.no/rss>|Recovered via sitemap|02/24/2026|valid|0|0|
7|Teknisk Ukeblad (Tech/Energy/Marine)|<https://www.tu.no/feed>|Recovered via sitemap|02/24/2026|valid|0|0|
8|Nettavisen (Digital General News)|<https://www.nettavisen.no/service/rich-rss>|200|02/24/2026|valid|0|0|
9|Dagbladet (Major Daily)|<https://www.dagbladet.no/?lab_viewport=rss>|200|02/24/2026|valid|46|46|
10|E24 Energi (Energy/Marine Industry)|<https://e24.no/energi/rss>|Recovered via sitemap|02/24/2026|valid|0|0|

### Thailand (TH)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Thairath (Top News)|<https://www.thairath.co.th/rss/news.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
2|Matichon (Leading Political Daily)|<https://www.matichon.co.th/feed>|200|02/24/2026|valid|50|50|
3|Prachachat (Business/Economy #1)|<https://www.prachachat.net/feed>|200|02/24/2026|valid|30|30|
4|Khaosod (Popular General News)|<https://www.khaosod.co.th/feed>|200|02/24/2026|valid|50|50|
5|Sanook News (Top Portal)|<https://rssfeeds.sanook.com/rss/feeds/sanook/news.index.xml>|200|02/24/2026|valid|20|20|
6|Sanook Economy (Portal Economy)|<https://rssfeeds.sanook.com/rss/feeds/sanook/news.economic.xml>|200|02/24/2026|valid|10|10|
7|Bangkok Biz News (Economy)|<https://www.bangkokbiznews.com/rss/feed>|Recovered via sitemap|02/24/2026|valid|0|0|
8|Manager Online (Politics/Society)|<https://mgronline.com/rss>|Recovered via sitemap|02/24/2026|valid|0|0|
9|Thai PBS (Public Broadcaster)|<https://news.thaipbs.or.th/rss/news>|200|02/24/2026|valid|20|20|
10|The Standard (Top Media)|<https://thestandard.co/feed/>|200|02/24/2026|valid|0|0|

