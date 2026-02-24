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

- Checked endpoints: `1087`
- Valid: `1045`
- Invalid: `42`
- Recovered via sitemap: `60`
- No-source rows: `0`
- Sitemap fallback checks: checked `102`, attempted `102`, success `60`, failed `42`, no-candidate `0`, candidates `121`
- Snapshot date: `02/24/2026`
- RSS ingest baseline: `2026-02-20`
- RSS daily window: `1d` (runner: worker)
- Source artifact: `audits/readme_rss_health_latest.json`

### Failure reasons
|Reason|Count|
|---|---:|
|HTML_RETURNED|13|
|HTTP_REDIRECT_LOOP|11|
|HTTP_403|9|
|TIMEOUT|4|
|HTTP_404|2|
|TLS|2|
|NETWORK|1|

### Invalid feeds by reason

#### HTML_RETURNED (13)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Iran|ISNA (EN) - Culture & Art|<https://en.isna.ir/rss/tp/19>|200|
|Iran|ISNA (EN) - Economy|<https://en.isna.ir/rss/tp/33>|200|
|Iran|ISNA (EN) - Photos|<https://en.isna.ir/rss/tp/27>|200|
|Iran|ISNA (EN) - Politics|<https://en.isna.ir/rss/tp/13>|200|
|Iran|ISNA (EN) - Social|<https://en.isna.ir/rss/tp/8>|200|
|Iran|ISNA (EN) - Sports|<https://en.isna.ir/rss/tp/23>|200|
|Japan|Diamond Online|<https://diamond.jp/list/feed/rss>|200|
|Japan|Goo News (Business)|<https://news.goo.ne.jp/rss/topstories/business/index.rdf>|200|
|Japan|Goo News (Politics)|<https://news.goo.ne.jp/rss/topstories/politics/index.rdf>|200|
|Norway|DN - RSS directory|<https://services.dn.no/tools/rss>|200|
|Saudi Arabia|Gulf Business (Saudi Section)|<https://gulfbusiness.com/region/saudi-arabia/feed/>|200|
|Switzerland|Le Temps|<https://www.letemps.ch/rss>|200|
|Turkey|Hürriyet (Sağlık)|<http://www.hurriyet.com.tr/rss/saglik>|200|

#### HTTP_REDIRECT_LOOP (11)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Iran|Tehran Times - Breaking|<https://www.tehrantimes.com/rss/pl/617>|-|
|Iran|Tehran Times - Culture|<https://www.tehrantimes.com/rss/tp/700>|-|
|Iran|Tehran Times - Economy|<https://www.tehrantimes.com/rss/tp/697>|-|
|Iran|Tehran Times - Homepage|<https://www.tehrantimes.com/rss-homepage>|-|
|Iran|Tehran Times - International|<https://www.tehrantimes.com/rss/tp/702>|-|
|Iran|Tehran Times - Latest|<https://www.tehrantimes.com/rss>|-|
|Iran|Tehran Times - Multimedia|<https://www.tehrantimes.com/rss/tp/717>|-|
|Iran|Tehran Times - Politics|<https://www.tehrantimes.com/rss/tp/698>|-|
|Iran|Tehran Times - Society|<https://www.tehrantimes.com/rss/tp/696>|-|
|Iran|Tehran Times - Sports|<https://www.tehrantimes.com/rss/tp/699>|-|
|Iran|Tehran Times - Tourism|<https://www.tehrantimes.com/rss/tp/807>|-|

#### HTTP_403 (9)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Belgium|Le Soir (main)|<https://www.lesoir.be/rss2/9/cible_principale>|403|
|Japan|Nikkei|<https://assets.nikkei.jp/release/v1/rss/news.xml>|403|
|Mexico|El Economista - Empresas|<https://www.eleconomista.com.mx/rss/empresas>|403|
|Mexico|El Economista - Top Noticias (멕시코 경제 1위)|<https://www.eleconomista.com.mx/rss/top-noticias>|403|
|Saudi Arabia|Arab News|<https://www.arabnews.com/rss.xml>|403|
|Saudi Arabia|Asharq Business (Bloomberg Arabic)|<https://asharqbusiness.com/feed>|403|
|Spain|El Economista - Mercados (주식/마켓)|<https://www.eleconomista.es/rss/rss-mercados.php>|403|
|Spain|El Economista - Portada (스페인 금융 1위)|<https://www.eleconomista.es/rss/rss-portada.php>|403|
|Uruguay|El País - Portada|<https://www.elpais.com.uy/rss>|403|

#### TIMEOUT (4)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Canada|CBC News - Business|<https://www.cbc.ca/cmlink/rss-business>|-|
|Canada|CBC News - World|<https://www.cbc.ca/cmlink/rss-world>|-|
|Indonesia|ANTARA - Ekonomi (Finansial)|<https://www.antaranews.com/rss/ekonomi-finansial.xml>|-|
|Indonesia|ANTARA - Politik|<https://www.antaranews.com/rss/politik.xml>|-|

#### HTTP_404 (2)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Chile|Reporte Minero|<https://www.reporteminero.cl/feed>|404|
|China|Zaobao (realtime)|<https://www.zaobao.com.sg/rss/realtime>|404|

#### TLS (2)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Japan|TechCrunch Japan|<https://jp.techcrunch.com/feed/>|-|
|Saudi Arabia|Al Riyadh (Main - Arabic)|<https://www.alriyadh.com/rss>|-|

#### NETWORK (1)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Japan|Yomiuri Latest|<https://assets.yomiuri.co.jp/rss/latestnews.rdf>|-|

### Sitemap fallback successes
|Country|Outlet|Failed RSS URL|Recovered via sitemap|
|---|---|---|---|
|Japan|Reuters Japan|<https://news.yahoo.co.jp/rss/media/reut/all.xml>|<https://news.yahoo.co.jp/sitemaps/list.xml>|
|Japan|Bloomberg Japan|<https://news.yahoo.co.jp/rss/media/bloom_st/all.xml>|<https://news.yahoo.co.jp/sitemaps/list.xml>|
|Japan|Forbes Japan|<https://news.yahoo.co.jp/rss/media/fminfo/all.xml>|<https://news.yahoo.co.jp/sitemaps/list.xml>|
|Japan|Sankei News Flash|<https://www.sankei.com/rss/news/flash.xml>|<https://www.sankei.com/feeds/sitemap-oriconnews/?outputType=xml&amp;from=0>|
|Japan|Sankei Economy|<https://www.sankei.com/rss/news/economy.xml>|<https://www.sankei.com/feeds/sitemap-oriconnews/?outputType=xml&amp;from=0>|
|Japan|Wired Japan|<https://wired.jp/feed/rss2>|<https://wired.jp/feed/google-latest-news/sitemap-google-news>|
|Japan|Boundless (TechCrunch Japan Archive)|<https://news.yahoo.co.jp/rss/media/boundless/all.xml>|<https://news.yahoo.co.jp/sitemaps/list.xml>|
|Japan|PR TIMES - Business/Economy|<https://prtimes.jp/business.rdf>|<https://prtimes.jp/sitemap-news.xml>|
|Japan|PR TIMES - Technology|<https://prtimes.jp/technology.rdf>|<https://prtimes.jp/sitemap-news.xml>|
|Japan|Newsweek Japan|<https://www.newsweekjapan.jp/headlines.rss>|<https://www.newsweekjapan.jp/stories/sitemap_stories_2008.xml>|
|Japan|President Online (Business)|<https://president.jp/list/feed/rss>|<https://president.jp/common/files/sitemap-2026.xml>|
|Italy|Florence Daily News|<https://florencedailynews.com/feed>|<https://www.florencedailynews.com/post-sitemap.xml>|
|Canada|CTV News - Top Stories|<https://www.ctvnews.ca/rss/ctvnews-ca-top-stories-public-rss-1.822009>|<https://www.ctvnews.ca/arc/outboundfeeds/sitemap-news/latest/>|
|Canada|CTV News - Business|<https://www.ctvnews.ca/rss/business/ctvnews-ca-business-public-rss-1.822283>|<https://www.ctvnews.ca/arc/outboundfeeds/sitemap-news/latest/>|
|Canada|Toronto Star - Politics|<https://www.thestar.com/search/?f=rss&t=article&c=politics&l=50&s=start_time&sd=desc>|<https://www.thestar.com/tncms/sitemap/news.xml>|
|Canada|BNN Bloomberg (Canada Biz)|<https://www.bnnbloomberg.ca/business/rss>|<https://www.bnnbloomberg.ca/arc/outboundfeeds/sitemap-news/latest/>|
|South Korea|Daily NK (EN)|<https://www.dailynk.com/english/feed>|<https://www.dailynk.com/sitemap-misc.xml>|
|Australia|The Conversation AU (오피니언/정책)|<https://theconversation.com/au/rss>|<https://theconversation.com/africa/sitemap_news.xml>|
|Spain|Xataka (스페인어권 최대 테크 매체)|<https://www.xataka.com/feed>|<https://www.xataka.com/sitemap_news.xml>|
|Mexico|ADN40 (TV Azteca - Economy)|<https://www.adn40.mx/economia/rss>|<https://www.adn40.mx/newslatest-sitemap-latest.xml>|

### No-source rows
- none
### United States (US)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|The New York Times|<https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml>|200|02/24/2026|valid|113|1641|
2|Wall Street Journal|<https://feeds.a.dj.com/rss/RSSWorldNews.xml>|200|02/24/2026|valid|80|1340|
3|LA Times|<https://www.latimes.com/local/rss2.0.xml>|200|02/24/2026|valid|376|6292|
4|CNN|<http://rss.cnn.com/rss/cnn_topstories.rss>|200|02/24/2026|valid|276|4131|
5|Fox News|<http://moxie.foxnews.com/google-publisher/latest.xml>|200|02/24/2026|valid|100|1675|
6|NBC News|<http://feeds.nbcnews.com/nbcnews/public/news>|200|02/24/2026|valid|100|1675|
7|CBS News|<https://www.cbsnews.com/latest/rss/main>|200|02/24/2026|valid|120|2010|
8|ABC News|<https://abcnews.go.com/abcnews/topstories>|200|02/24/2026|valid|100|1675|
9|NPR|<https://feeds.npr.org/1001/rss.xml>|200|02/24/2026|valid|40|670|
10|HuffPost|<https://www.huffpost.com/section/front-page/feed>|200|02/24/2026|valid|0|0|
11|BuzzFeed News|<https://www.buzzfeednews.com/news.xml>|200|02/24/2026|valid|160|2680|
12|Vox|<https://www.vox.com/rss/index.xml>|200|02/24/2026|valid|40|670|
13|CNBC|<https://www.cnbc.com/id/100003114/device/rss/rss.html>|200|02/24/2026|valid|120|2010|
14|Financial Times|<https://www.ft.com/?format=rss>|200|02/24/2026|valid|39|654|
15|Forbes|<https://www.forbes.com/most-popular/feed/>|200|02/24/2026|valid|44|737|
16|Fortune|<https://fortune.com/feed>|200|02/24/2026|valid|40|670|
17|Business Insider|<https://www.businessinsider.com/rss>|200|02/24/2026|valid|80|1340|
18|MarketWatch|<http://feeds.marketwatch.com/marketwatch/topstories/>|200|02/24/2026|valid|40|670|
19|Fast Company|<https://www.fastcompany.com/rss>|200|02/24/2026|valid|80|1334|
20|TechCrunch|<https://techcrunch.com/feed/>|200|02/24/2026|valid|80|1340|
21|The Verge|<https://www.theverge.com/rss/index.xml>|200|02/24/2026|valid|40|670|
22|Wired|<https://www.wired.com/feed/rss>|200|02/24/2026|valid|200|3350|
23|Ars Technica|<http://feeds.arstechnica.com/arstechnica/index>|200|02/24/2026|valid|80|1340|
24|Engadget|<https://www.engadget.com/rss.xml>|200|02/24/2026|valid|200|3350|
25|VentureBeat|<https://venturebeat.com/feed/>|200|02/24/2026|valid|28|469|
26|Mashable|<https://mashable.com/feed>|200|02/24/2026|valid|400|6700|
27|Gizmodo|<https://gizmodo.com/rss>|200|02/24/2026|valid|80|1340|
28|CNET|<https://www.cnet.com/rss/news/>|200|02/24/2026|valid|100|1675|
29|ZDNet|<https://www.zdnet.com/news/rss.xml>|200|02/24/2026|valid|80|1340|
30|The Hill|<https://thehill.com/feed>|200|02/24/2026|valid|400|6700|
31|Axios|<https://api.axios.com/feed/>|200|02/24/2026|valid|400|6700|
32|Breitbart|<http://feeds.feedburner.com/breitbart>|200|02/24/2026|valid|200|3296|
33|National Review|<https://www.nationalreview.com/feed/>|200|02/24/2026|valid|80|1340|
34|Slate|<https://slate.com/feeds/all.rss>|200|02/24/2026|valid|100|1675|
35|The New Yorker|<https://www.newyorker.com/feed/everything>|200|02/24/2026|valid|200|3350|
36|The Atlantic|<https://www.theatlantic.com/feed/all/>|200|02/24/2026|valid|100|1675|
37|Boston Globe|<https://www.bostonglobe.com/arc/outboundfeeds/rss?outputType=xml>|200|02/24/2026|valid|400|6700|
38|New York Post|<https://nypost.com/feed>|200|02/24/2026|valid|86|1472|
39|Chicago Tribune|<https://chicagotribune.com/feed>|200|02/24/2026|valid|40|670|
40|Seattle Times|<https://seattletimes.com/feed>|200|02/24/2026|valid|69|1254|
41|Denver Post|<https://denverpost.com/feed>|200|02/24/2026|valid|40|640|
42|San Jose Mercury News|<https://mercurynews.com/feed>|200|02/24/2026|valid|40|670|
43|Las Vegas Review-Journal|<https://reviewjournal.com/feed>|200|02/24/2026|valid|120|2010|
44|San Diego Union-Tribune|<https://sandiegouniontribune.com/feed>|200|02/24/2026|valid|400|6700|
45|Honolulu Star-Advertiser|<https://staradvertiser.com/feed>|200|02/24/2026|valid|160|2680|
46|Variety|<https://variety.com/feed>|200|02/24/2026|valid|40|670|
47|The Hollywood Reporter|<https://hollywoodreporter.com/feed>|200|02/24/2026|valid|40|670|
48|Deadline|<https://deadline.com/feed>|200|02/24/2026|valid|48|804|
49|Rolling Stone|<https://rollingstone.com/feed>|200|02/24/2026|valid|40|670|
50|Billboard|<https://billboard.com/feed>|200|02/24/2026|valid|40|670|
51|Vanity Fair|<http://feeds.feedburner.com/vfdotcomrss>|200|02/24/2026|valid|140|2345|
52|Esquire|<https://www.esquire.com/rss/entertainment.xml>|200|02/24/2026|valid|200|3350|
53|GQ|<https://www.gq.com/feed/rss>|200|02/24/2026|valid|120|2010|
54|Space.com|<https://www.space.com/feeds/all>|200|02/24/2026|valid|200|3350|
55|ESPN|<https://www.espn.com/espn/rss/news>|200|02/24/2026|valid|133|2377|
56|Sports Illustrated|<https://si.com/feed>|200|02/24/2026|valid|358|5922|
57|Mother Jones|<https://motherjones.com/feed>|200|02/24/2026|valid|40|670|
58|ProPublica|<https://propublica.org/feed>|200|02/24/2026|valid|40|670|
59|Reason|<https://reason.com/feed>|200|02/24/2026|valid|192|3168|
60|Jacobin|<https://jacobin.com/feed>|200|02/24/2026|valid|80|1340|
61|Quartz|<https://qz.com/feed>|200|02/24/2026|valid|200|3350|
62|The Intercept|<https://theintercept.com/feed>|200|02/24/2026|valid|80|1340|
63|Newsweek|<https://www.newsweek.com/rss>|200|02/24/2026|valid|60|1120|
64|Time|<https://time.com/feed>|200|02/24/2026|valid|400|6700|
65|PBS NewsHour|<https://www.pbs.org/newshour/feeds/rss/headlines>|200|02/24/2026|valid|80|1340|

### China (CN)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|China Daily|<http://www.chinadaily.com.cn/rss/world_rss.xml>|200|02/24/2026|valid|400|6700|
2|TechNode|<https://technode.com/feed>|200|02/24/2026|valid|360|7920|
3|South China Morning Post|<https://www.scmp.com/rss/91/feed>|200|02/24/2026|valid|200|3350|
4|Initium|<https://theinitium.com/feed>|200|02/24/2026|valid|60|1005|
5|Liberty Times|<https://news.ltn.com.tw/rss/all.xml>|200|02/24/2026|valid|160|2680|
6|People China|<https://people.com.cn/rss/politics.xml>|200|02/24/2026|valid|400|6700|
7|China Daily English|<https://www.chinadaily.com.cn/rss/world_rss.xml>|200|02/24/2026|valid|400|6700|
8|China Daily - China|<http://www.chinadaily.com.cn/rss/china_rss.xml>|200|02/24/2026|valid|400|6700|
9|China Daily - BizChina|<http://www.chinadaily.com.cn/rss/bizchina_rss.xml>|200|02/24/2026|valid|400|6700|
10|China Daily - Opinion|<http://www.chinadaily.com.cn/rss/opinion_rss.xml>|200|02/24/2026|valid|480|8040|
11|China Daily - Sports|<http://www.chinadaily.com.cn/rss/sports_rss.xml>|200|02/24/2026|valid|400|6700|
12|China Daily - Entertainment|<http://www.chinadaily.com.cn/rss/entertainment_rss.xml>|200|02/24/2026|valid|480|8040|
13|China Daily - Lifestyle|<http://www.chinadaily.com.cn/rss/lifestyle_rss.xml>|200|02/24/2026|valid|400|6700|
14|China Daily - Photos|<http://www.chinadaily.com.cn/rss/photo_rss.xml>|200|02/24/2026|valid|480|8040|
15|China Daily - China Daily (main)|<http://www.chinadaily.com.cn/rss/cndy_rss.xml>|200|02/24/2026|valid|480|8040|
16|China Daily - HK Edition|<http://www.chinadaily.com.cn/rss/hk_rss.xml>|200|02/24/2026|valid|480|8040|
17|China Daily - USA (kindle)|<http://usa.chinadaily.com.cn/usa_kindle.xml>|200|02/24/2026|valid|0|0|
18|China Daily - EU Weekly|<http://europe.chinadaily.com.cn/euweekly_rss.xml>|200|02/24/2026|valid|480|8040|
19|People.cn - Politics|<http://www.people.com.cn/rss/politics.xml>|200|02/24/2026|valid|400|6700|
20|People.cn - Society|<http://www.people.com.cn/rss/society.xml>|200|02/24/2026|valid|400|6700|
21|People.cn - Legal|<http://www.people.com.cn/rss/legal.xml>|200|02/24/2026|valid|400|6700|
22|People.cn - World|<http://www.people.com.cn/rss/world.xml>|200|02/24/2026|valid|400|6700|
23|People.cn - Opinion|<http://www.people.com.cn/rss/opinion.xml>|200|02/24/2026|valid|400|6700|
24|People.cn - ChinaPic|<http://www.people.com.cn/rss/chinapic.xml>|200|02/24/2026|valid|400|6700|
25|CGTN Documentary|<https://news.cgtn.com/rss/documentary/CGTN-Documentary.rss>|200|02/24/2026|valid|8|132|
26|Zaobao (realtime)|<https://www.zaobao.com.sg/rss/realtime>|404 (HTTP_404)|02/24/2026|invalid|0|0|
27|RTHK|<https://rthk.hk/rthk/news/rss/c_expressnews_clocal.xml>|200|02/24/2026|valid|60|80|
28|FT Chinese|<http://www.ftchinese.com/rss/feed>|200|02/24/2026|valid|60|80|
29|Xinhua|<http://www.xinhuanet.com/politics/news_politics.xml>|200|02/24/2026|valid|360|480|

### Japan (JP)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|NHK World (EN)|<https://www3.nhk.or.jp/rss/news/cat0.xml>|200|02/24/2026|valid|28|469|
2|Mainichi (Biz)|<https://mainichi.jp/rss/etc/english_latest.rss>|200|02/24/2026|valid|0|0|
3|Asahi Shimbun|<https://www.asahi.com/rss/asahi/newsheadlines.rdf>|200|02/24/2026|valid|0|0|
4|The Japan Times|<https://www.japantimes.co.jp/feed/>|200|02/24/2026|valid|120|2010|
5|Automotive Ten-Navi|<https://automotive.ten-navi.com/rss/>|200|02/24/2026|valid|0|0|
6|The Bridge|<https://thebridge.jp/feed/>|200|02/24/2026|valid|20|360|
7|Nippon|<https://www.nippon.com/en/feed/>|200|02/24/2026|valid|80|1340|
8|NHK News Web - cat1|<https://www3.nhk.or.jp/rss/news/cat1.xml>|200|02/24/2026|valid|447|7901|
9|NHK News Web - cat2|<https://www3.nhk.or.jp/rss/news/cat2.xml>|200|02/24/2026|valid|63|1126|
10|NHK News Web - cat3|<https://www3.nhk.or.jp/rss/news/cat3.xml>|200|02/24/2026|valid|78|1414|
11|NHK News Web - cat4|<https://www3.nhk.or.jp/rss/news/cat4.xml>|200|02/24/2026|valid|290|5789|
12|NHK News Web - cat5|<https://www3.nhk.or.jp/rss/news/cat5.xml>|200|02/24/2026|valid|240|4048|
13|NHK News Web - cat6|<https://www3.nhk.or.jp/rss/news/cat6.xml>|200|02/24/2026|valid|417|6920|
14|NHK News Web - cat7|<https://www3.nhk.or.jp/rss/news/cat7.xml>|200|02/24/2026|valid|480|8040|
15|ITmedia - 総合記事一覧|<https://rss.itmedia.co.jp/rss/2.0/itmedia_all.xml>|200|02/24/2026|valid|200|3350|
16|ITmedia - TOP STORIES|<https://rss.itmedia.co.jp/rss/2.0/topstory.xml>|200|02/24/2026|valid|80|1340|
17|ITmedia NEWS - 新着(速報)|<https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml>|200|02/24/2026|valid|300|3450|
18|ITmedia NEWS - 国内|<https://rss.itmedia.co.jp/rss/2.0/news_domestic.xml>|200|02/24/2026|valid|120|2010|
19|ITmedia NEWS - 海外|<https://rss.itmedia.co.jp/rss/2.0/news_foreign.xml>|200|02/24/2026|valid|120|2010|
20|ITmedia NEWS - 製品動向|<https://rss.itmedia.co.jp/rss/2.0/news_products.xml>|200|02/24/2026|valid|120|2010|
21|ITmedia NEWS - セキュリティ|<https://rss.itmedia.co.jp/rss/2.0/news_security.xml>|200|02/24/2026|valid|120|2010|
22|ITmedia NEWS - 科学・テクノロジー|<https://rss.itmedia.co.jp/rss/2.0/news_technology.xml>|200|02/24/2026|valid|120|2010|
23|ITmedia NEWS - ネットトピック|<https://rss.itmedia.co.jp/rss/2.0/news_nettopics.xml>|200|02/24/2026|valid|120|2010|
24|ITmedia NEWS - 企業・業界動向|<https://rss.itmedia.co.jp/rss/2.0/news_industry.xml>|200|02/24/2026|valid|120|2010|
25|ITmedia NEWS - Special|<https://rss.itmedia.co.jp/rss/2.0/news_special.xml>|200|02/24/2026|valid|120|2010|
26|ITmedia AI+|<https://rss.itmedia.co.jp/rss/2.0/aiplus.xml>|200|02/24/2026|valid|80|1340|
27|ITmedia Mobile|<https://rss.itmedia.co.jp/rss/2.0/mobile.xml>|200|02/24/2026|valid|80|1340|
28|ITmedia PC USER|<https://rss.itmedia.co.jp/rss/2.0/pcuser.xml>|200|02/24/2026|valid|80|1340|
29|ITmedia ビジネスオンライン|<https://rss.itmedia.co.jp/rss/2.0/business.xml>|200|02/24/2026|valid|80|1340|
30|ITmedia エンタープライズ|<https://rss.itmedia.co.jp/rss/2.0/enterprise.xml>|200|02/24/2026|valid|200|3350|
31|J-CASTニュース (総合)|<https://www.j-cast.com/index.xml>|200|02/24/2026|valid|224|3752|
32|J-CASTトレンド|<https://www.j-cast.com/trend/index.xml>|200|02/24/2026|valid|15|219|
33|J-CAST会社ウォッチ|<https://www.j-cast.com/kaisha/index.xml>|200|02/24/2026|valid|4|67|
34|BOOKウォッチ|<https://books.j-cast.com/rss.xml>|200|02/24/2026|valid|0|0|
35|INTERNET Watch (Impress)|<https://internet.watch.impress.co.jp/data/rss/1.0/iw/feed.rdf>|200|02/24/2026|valid|0|0|
36|Impress Watch (総合)|<https://www.watch.impress.co.jp/data/rss/1.0/ipw/feed.rdf>|200|02/24/2026|valid|0|0|
37|GIGAZINE (Atom)|<https://gigazine.net/news/rss_atom/>|200|02/24/2026|valid|120|2010|
38|PR TIMES (プレスリリース)|<https://prtimes.jp/index.rdf>|200|02/24/2026|valid|0|0|
39|Yahoo Japan - Business|<https://news.yahoo.co.jp/rss/topics/business.xml>|200|02/24/2026|valid|32|272|
40|Yahoo Japan - World|<https://news.yahoo.co.jp/rss/topics/world.xml>|200|02/24/2026|valid|32|272|
41|Yahoo Japan - IT/Tech|<https://news.yahoo.co.jp/rss/topics/it.xml>|200|02/24/2026|valid|32|272|
42|Reuters Japan|<https://news.yahoo.co.jp/rss/media/reut/all.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
43|Bloomberg Japan|<https://news.yahoo.co.jp/rss/media/bloom_st/all.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
44|Forbes Japan|<https://news.yahoo.co.jp/rss/media/fminfo/all.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
45|Kyodo News|<https://news.yahoo.co.jp/rss/media/kyodonews/all.xml>|200|02/24/2026|valid|200|1700|
46|Toyo Keizai|<https://toyokeizai.net/list/feed/rss>|200|02/24/2026|valid|80|680|
47|Diamond Online|<https://diamond.jp/list/feed/rss>|200 (HTML_RETURNED)|02/24/2026|invalid|0|1509|
48|Sankei News Flash|<https://www.sankei.com/rss/news/flash.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
49|Sankei Economy|<https://www.sankei.com/rss/news/economy.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
50|CNET Japan|<https://feeds.japan.cnet.com/rss/cnet/all.rdf>|200|02/24/2026|valid|0|0|
51|Wired Japan|<https://wired.jp/feed/rss2>|Recovered via sitemap|02/24/2026|valid|0|0|
52|Boundless (TechCrunch Japan Archive)|<https://news.yahoo.co.jp/rss/media/boundless/all.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
53|Smart Japan|<https://rss.itmedia.co.jp/rss/2.0/smartjapan.xml>|200|02/24/2026|valid|80|680|
54|Nikkei|<https://assets.nikkei.jp/release/v1/rss/news.xml>|403 (HTTP_403)|02/24/2026|invalid|0|0|
55|Yomiuri Latest|<https://assets.yomiuri.co.jp/rss/latestnews.rdf>|ERR (NETWORK)|02/24/2026|invalid|0|0|
56|Mainichi Flash|<https://mainichi.jp/rss/etc/mainichi-flash.rss>|200|02/24/2026|valid|0|0|
57|Gizmodo Japan|<https://www.gizmodo.jp/index.xml>|200|02/24/2026|valid|100|850|
58|PR TIMES - Business/Economy|<https://prtimes.jp/business.rdf>|Recovered via sitemap|02/24/2026|valid|0|0|
59|PR TIMES - Technology|<https://prtimes.jp/technology.rdf>|Recovered via sitemap|02/24/2026|valid|0|0|
60|Goo News (Business)|<https://news.goo.ne.jp/rss/topstories/business/index.rdf>|200 (HTML_RETURNED)|02/24/2026|invalid|0|0|
61|Goo News (Politics)|<https://news.goo.ne.jp/rss/topstories/politics/index.rdf>|200 (HTML_RETURNED)|02/24/2026|invalid|0|0|
62|Newsweek Japan|<https://www.newsweekjapan.jp/headlines.rss>|Recovered via sitemap|02/24/2026|valid|0|0|
63|JBpress (Japan Business Press)|<https://jbpress.ismedia.jp/list/feed/rss>|200|02/24/2026|valid|60|100|
64|TechCrunch Japan|<https://jp.techcrunch.com/feed/>|ERR (TLS)|02/24/2026|invalid|0|0|
65|President Online (Business)|<https://president.jp/list/feed/rss>|Recovered via sitemap|02/24/2026|valid|0|0|
66|Zenn (Tech)|<https://zenn.dev/feed>|200|02/24/2026|valid|60|80|

### Germany (DE)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Handelsblatt - Top|<https://www.handelsblatt.com/contentexport/feed/top-themen>|200|02/24/2026|valid|96|1515|
2|Handelsblatt - Finance|<https://www.handelsblatt.com/contentexport/feed/finanzen>|200|02/24/2026|valid|80|1340|
3|Tagesschau|<https://www.tagesschau.de/xml/rss2>|200|02/24/2026|valid|160|2680|
4|Der Spiegel|<https://www.spiegel.de/schlagzeilen/tops/index.rss>|200|02/24/2026|valid|73|1370|
5|FAZ|<https://www.faz.net/rss/aktuell/>|200|02/24/2026|valid|269|4662|
6|Die Zeit|<https://newsfeed.zeit.de/index>|200|02/24/2026|valid|60|1005|
7|Manager Magazin|<https://www.manager-magazin.de/unternehmen/index.rss>|200|02/24/2026|valid|80|1340|
8|WirtschaftsWoche|<https://www.wiwo.de/contentexport/feed/rss/schlagzeilen>|200|02/24/2026|valid|80|1340|
9|Deutsche Welle (EN)|<https://rss.dw.com/xml/rss-en-all>|200|02/24/2026|valid|480|8040|
10|Heise Online|<https://www.heise.de/rss/heise-atom.xml>|200|02/24/2026|valid|480|8040|
11|Der Spiegel|<https://www.spiegel.de/schlagzeilen/index.rss>|200|02/24/2026|valid|120|2010|
12|Die Welt|<https://www.welt.de/feeds/topnews.rss>|200|02/24/2026|valid|75|1289|
13|Focus|<https://www.focus.de/rss/>|200|02/24/2026|valid|480|3960|
14|Handelsblatt Economy|<https://www.handelsblatt.com/contentexport/feed/finanzen/>|200|02/24/2026|valid|80|1340|
15|Frankfurter Allgemeine|<https://www.faz.net/rss/aktuell/wirtschaft/>|200|02/24/2026|valid|92|1541|
16|Tagesspiegel|<https://www.tagesspiegel.de/contentexport/feed/>|200|02/24/2026|valid|400|6700|
17|Handelsblatt World|<https://www.handelsblatt.com/contentexport/feed/wirtschaft>|200|02/24/2026|valid|80|1340|
18|Zeit Welt|<https://newsfeed.zeit.de/wirtschaft/index>|200|02/24/2026|valid|60|1005|
19|Financial Times Germany|<https://www.ft.com/rss/home>|200|02/24/2026|valid|44|662|
20|Süddeutsche - Top-Themen|<https://rss.sueddeutsche.de/rss/Topthemen>|200|02/24/2026|valid|60|1005|
21|Süddeutsche - Alles|<https://rss.sueddeutsche.de/rss/Alles>|200|02/24/2026|valid|60|1005|
22|Süddeutsche - Eilmeldungen|<https://rss.sueddeutsche.de/rss/Eilmeldungen>|200|02/24/2026|valid|60|1005|
23|Süddeutsche - Politik|<https://rss.sueddeutsche.de/rss/Politik>|200|02/24/2026|valid|60|1005|
24|Süddeutsche - Wirtschaft|<https://rss.sueddeutsche.de/rss/Wirtschaft>|200|02/24/2026|valid|60|1005|
25|Süddeutsche - Panorama|<https://rss.sueddeutsche.de/rss/Panorama>|200|02/24/2026|valid|60|1005|
26|Süddeutsche - Sport|<https://rss.sueddeutsche.de/rss/Sport>|200|02/24/2026|valid|60|1005|
27|Süddeutsche - München|<https://rss.sueddeutsche.de/rss/Muenchen>|200|02/24/2026|valid|60|1005|
28|Süddeutsche - Bayern|<https://rss.sueddeutsche.de/rss/Bayern>|200|02/24/2026|valid|60|1005|
29|Süddeutsche - Kultur|<https://rss.sueddeutsche.de/rss/Kultur>|200|02/24/2026|valid|60|1005|
30|Süddeutsche - Medien|<https://rss.sueddeutsche.de/rss/Medien>|200|02/24/2026|valid|60|1005|
31|Süddeutsche - Wissen|<https://rss.sueddeutsche.de/rss/Wissen>|200|02/24/2026|valid|60|1005|
32|Süddeutsche - Gesundheit|<https://rss.sueddeutsche.de/rss/Gesundheit>|200|02/24/2026|valid|60|1005|
33|Süddeutsche - Karriere|<https://rss.sueddeutsche.de/rss/Karriere>|200|02/24/2026|valid|60|1005|
34|Süddeutsche - Bildung|<https://rss.sueddeutsche.de/rss/Bildung>|200|02/24/2026|valid|60|1005|
35|Süddeutsche - Reise|<https://rss.sueddeutsche.de/rss/Reise>|200|02/24/2026|valid|60|1005|
36|Süddeutsche - Auto|<https://rss.sueddeutsche.de/rss/Auto>|200|02/24/2026|valid|60|1005|
37|Süddeutsche - Stil|<https://rss.sueddeutsche.de/rss/Stil>|200|02/24/2026|valid|60|1005|
38|Deutschlandfunk - Nachrichten|<https://www.deutschlandfunk.de/nachrichten-100.rss>|200|02/24/2026|valid|92|2276|
39|Deutschlandfunk - Politikportal|<https://www.deutschlandfunk.de/politikportal-100.rss>|200|02/24/2026|valid|476|7845|
40|Deutschlandfunk - Wirtschaft|<https://www.deutschlandfunk.de/wirtschaft-106.rss>|200|02/24/2026|valid|480|8040|
41|Deutschlandfunk - Wissen|<https://www.deutschlandfunk.de/wissen-106.rss>|200|02/24/2026|valid|480|8040|
42|Deutschlandfunk - Kulturportal|<https://www.deutschlandfunk.de/kulturportal-100.rss>|200|02/24/2026|valid|480|8040|
43|Deutschlandfunk - Europa|<https://www.deutschlandfunk.de/europa-112.rss>|200|02/24/2026|valid|480|8040|
44|Deutschlandfunk - Gesellschaft|<https://www.deutschlandfunk.de/gesellschaft-106.rss>|200|02/24/2026|valid|480|8040|
45|Deutschlandfunk - Sportportal|<https://www.deutschlandfunk.de/sportportal-100.rss>|200|02/24/2026|valid|444|7437|
46|taz.de (gesamt)|<https://taz.de/!a=;rss/>|200|02/24/2026|valid|0|0|
47|Tagesschau|<https://www.tagesschau.de/xml/rss2/>|200|02/24/2026|valid|120|160|

### India (IN)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|The Times of India (Top Stories)|<https://timesofindia.indiatimes.com/rssfeedstopstories.cms>|200|02/24/2026|valid|184|3103|
2|NDTV (Latest)|<https://feeds.feedburner.com/NDTV-LatestNews>|200|02/24/2026|valid|80|1340|
3|India Today (India)|<https://www.indiatoday.in/rss/1206578>|200|02/24/2026|valid|80|1340|
4|The Indian Express|<https://indianexpress.com/feed>|200|02/24/2026|valid|480|8040|
5|The Hindu (National)|<https://www.thehindu.com/news/national/?service=rss>|200|02/24/2026|valid|400|6700|
6|Firstpost|<https://www.firstpost.com/commonfeeds/v1/mfp/rss/web-stories.xml>|200|02/24/2026|valid|480|3960|
7|DNA India (India)|<https://www.dnaindia.com/feeds/india.xml>|200|02/24/2026|valid|60|1180|
8|Storify News|<https://www.storifynews.com/feed>|200|02/24/2026|valid|428|6527|
9|Amar Ujala (Breaking)|<https://www.amarujala.com/rss/breaking-news.xml>|200|02/24/2026|valid|44|737|
10|Odishabarta|<https://odishabarta.com/feed>|200|02/24/2026|valid|40|670|
11|The Times of Bengal|<https://thetimesofbengal.com/feed>|200|02/24/2026|valid|30|620|
12|Scroll.in|<https://feeds.feedburner.com/ScrollinArticles.rss>|200|02/24/2026|valid|400|6700|
13|Northlines|<https://thenorthlines.com/feed>|200|02/24/2026|valid|10|420|
14|Chandigarh Metro|<https://chandigarhmetro.com/feed>|200|02/24/2026|valid|40|660|
15|Chandigarh City News|<https://feeds.feedburner.com/ChandigarhCityNews>|200|02/24/2026|valid|40|670|
16|The Quint|<https://prod-qt-images.s3.amazonaws.com/production/thequint/feed.xml>|200|02/24/2026|valid|80|1340|
17|Telangana Today|<https://telanganatoday.com/feed>|200|02/24/2026|valid|480|8040|
18|News Today (TN)|<https://newstodaynet.com/feed>|200|02/24/2026|valid|40|580|
19|IndiaVision|<https://www.indiavision.com/feed>|200|02/24/2026|valid|100|1675|
20|OpIndia|<https://www.opindia.com/feed>|200|02/24/2026|valid|40|670|
21|OrissaPOST|<https://www.orissapost.com/feed>|200|02/24/2026|valid|80|1326|
22|India's News.Net|<https://feeds.indiasnews.net/rss/701ee96610c884a6>|200|02/24/2026|valid|400|6700|
23|TechGenYZ|<https://techgenyz.com/feed>|200|02/24/2026|valid|40|610|
24|WYM News (Blogspot)|<https://latestnewsupdate4you.blogspot.com/feeds/posts/default>|200|02/24/2026|valid|100|1675|
25|Star of Mysore|<https://starofmysore.com/feed>|200|02/24/2026|valid|40|660|
26|ABP News|<https://news.abplive.com/home/feed>|200|02/24/2026|valid|84|1352|
27|The India Bizz|<https://theindiabizz.com/feed>|200|02/24/2026|valid|40|610|

### United Kingdom (GB)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Financial Times - World|<https://www.ft.com/rss/world>|200|02/24/2026|valid|100|1675|
2|Financial Times - Energy|<https://www.ft.com/rss/companies/energy>|200|02/24/2026|valid|100|1675|
3|BBC News - Business|<https://feeds.bbci.co.uk/news/business/rss.xml>|200|02/24/2026|valid|216|3393|
4|BBC News - World|<https://feeds.bbci.co.uk/news/world/rss.xml>|200|02/24/2026|valid|165|2523|
5|The Guardian - World|<https://www.theguardian.com/world/rss>|200|02/24/2026|valid|180|3015|
6|The Guardian - Business|<https://www.theguardian.com/business/rss>|200|02/24/2026|valid|80|1340|
7|Sky News - World|<https://feeds.skynews.com/feeds/rss/world.xml>|200|02/24/2026|valid|40|670|
8|Sky News - Business|<https://feeds.skynews.com/feeds/rss/business.xml>|200|02/24/2026|valid|40|670|
9|Telegraph - Business|<https://www.telegraph.co.uk/business/rss.xml>|200|02/24/2026|valid|360|7080|
10|City A.M. (London Finance)|<https://www.cityam.com/feed/>|200|02/24/2026|valid|120|1920|
11|The Independent|<https://www.independent.co.uk/rss>|200|02/24/2026|valid|400|6700|
12|Financial Times UK|<https://www.ft.com/?format=rss>|200|02/24/2026|valid|39|654|
13|The Telegraph UK|<https://www.telegraph.co.uk/rss.xml>|200|02/24/2026|valid|360|7080|
14|Daily Mail|<https://www.dailymail.co.uk/home/index.rss>|200|02/24/2026|valid|480|8040|
15|Metro UK|<https://metro.co.uk/feed/>|200|02/24/2026|valid|120|1738|
16|The Sun|<https://www.thesun.co.uk/feed/>|200|02/24/2026|valid|0|962|
17|The Guardian UK|<https://www.theguardian.com/uk/rss>|200|02/24/2026|valid|480|8040|
18|Sky News|<https://feeds.skynews.com/feeds/rss/uk.xml>|200|02/24/2026|valid|40|670|
19|Financial Times|<https://www.ft.com/rss/home>|200|02/24/2026|valid|44|664|
20|iNews|<https://inews.co.uk/rss>|200|02/24/2026|valid|40|670|
21|BBC Culture|<https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml>|200|02/24/2026|valid|88|1621|
22|The Evening Standard|<https://www.standard.co.uk/rss>|200|02/24/2026|valid|400|6486|

### France (FR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|France 24|<https://www.france24.com/en/rss>|200|02/24/2026|valid|92|1595|
2|The Local (France)|<https://feeds.thelocal.com/rss/fr>|200|02/24/2026|valid|80|1340|
3|RFI (France)|<https://www.rfi.fr/en/france/rss>|200|02/24/2026|valid|120|2010|
4|RFI (All / EN)|<https://www.rfi.fr/en/rss>|200|02/24/2026|valid|88|1418|
5|Mediapart|<https://www.mediapart.fr/articles/feed>|200|02/24/2026|valid|50|680|
6|Le Monde diplomatique|<https://mondediplo.com/backend>|200|02/24/2026|valid|0|0|
7|Sud Ouest|<https://www.sudouest.fr/essentiel/rss.xml>|200|02/24/2026|valid|80|1340|
8|L'Est Républicain|<https://www.estrepublicain.fr/rss>|200|02/24/2026|valid|80|1340|
9|France Soir|<https://www.francesoir.fr/rss.xml>|200|02/24/2026|valid|10|420|
10|Dernières Nouvelles d'Alsace (DNA)|<https://www.dna.fr/rss>|200|02/24/2026|valid|80|1340|
11|La Croix|<https://www.la-croix.com/feeds/rss/site.xml>|200|02/24/2026|valid|200|3350|
12|La Dépêche|<https://www.ladepeche.fr/rss.xml>|200|02/24/2026|valid|400|6700|
13|20 Minutes|<https://www.20minutes.fr/feeds/rss-une.xml>|200|02/24/2026|valid|120|2010|
14|Yahoo Actualités|<https://fr.news.yahoo.com/rss>|200|02/24/2026|valid|20|335|
15|InfoMigrants (EN)|<https://www.infomigrants.net/en/rss/all.xml>|200|02/24/2026|valid|0|680|
16|France Today|<https://www.francetoday.com/feed>|200|02/24/2026|valid|12|504|
17|FrenchDailyNews|<https://frenchdailynews.com/feed>|200|02/24/2026|valid|40|670|
18|Le Monde (EN – Main)|<https://www.lemonde.fr/en/rss/une.xml>|200|02/24/2026|valid|72|1206|
19|Le Monde (EN – International)|<https://www.lemonde.fr/en/international/rss_full.xml>|200|02/24/2026|valid|80|1340|
20|Le Monde (EN – Editorials)|<https://www.lemonde.fr/en/editorials/rss_full.xml>|200|02/24/2026|valid|80|1340|
21|Le Monde (EN – Europe)|<https://www.lemonde.fr/en/europe/rss_full.xml>|200|02/24/2026|valid|80|1340|
22|Le Monde (EN – United States)|<https://www.lemonde.fr/en/united-states/rss_full.xml>|200|02/24/2026|valid|80|1340|
23|Le Monde (EN – Economy)|<https://www.lemonde.fr/en/economy/rss_full.xml>|200|02/24/2026|valid|80|1340|
24|Le Monde (EN – Culture)|<https://www.lemonde.fr/en/culture/rss_full.xml>|200|02/24/2026|valid|80|1340|
25|Le Monde (EN – Sports)|<https://www.lemonde.fr/en/sports/rss_full.xml>|200|02/24/2026|valid|80|1340|
26|Le Monde (EN – Environment)|<https://www.lemonde.fr/en/environment/rss_full.xml>|200|02/24/2026|valid|80|1340|
27|Le Monde (EN – Science)|<https://www.lemonde.fr/en/science/rss_full.xml>|200|02/24/2026|valid|80|1340|

### Italy (IT)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|ANSA (Main)|<https://www.ansa.it/sito/ansait_rss.xml>|200|02/24/2026|valid|112|1885|
2|ANSA (Top News)|<https://www.ansa.it/sito/notizie/topnews/topnews_rss.xml>|200|02/24/2026|valid|40|670|
3|ANSA (Cronaca)|<https://www.ansa.it/sito/notizie/cronaca/cronaca_rss.xml>|200|02/24/2026|valid|480|8040|
4|ANSA (Politica)|<https://www.ansa.it/sito/notizie/politica/politica_rss.xml>|200|02/24/2026|valid|52|1025|
5|ANSA (Mondo)|<https://www.ansa.it/sito/notizie/mondo/mondo_rss.xml>|200|02/24/2026|valid|191|2566|
6|ANSA (Economia)|<https://www.ansa.it/sito/notizie/economia/economia_rss.xml>|200|02/24/2026|valid|212|2109|
7|ANSA (Calcio)|<https://www.ansa.it/sito/notizie/sport/calcio/calcio_rss.xml>|200|02/24/2026|valid|224|4297|
8|ANSA (Sport)|<https://www.ansa.it/sito/notizie/sport/sport_rss.xml>|200|02/24/2026|valid|112|3667|
9|ANSA (Cinema)|<https://www.ansa.it/sito/notizie/cultura/cinema/cinema_rss.xml>|200|02/24/2026|valid|96|1472|
10|ANSA (Cultura e Tendenze)|<https://www.ansa.it/sito/notizie/cultura/cultura_rss.xml>|200|02/24/2026|valid|432|7556|
11|ANSA (Foto)|<https://www.ansa.it/sito/photogallery/foto_rss.xml>|200|02/24/2026|valid|480|8040|
12|ANSA (Video)|<https://www.ansa.it/sito/videogallery/video_rss.xml>|200|02/24/2026|valid|480|8040|
13|Corriere della Sera (Homepage)|<https://www.corriere.it/rss/homepage.xml>|200|02/24/2026|valid|276|4623|
14|Corriere della Sera (Ultimora)|<https://www.corriere.it/rss/ultimora.xml>|200|02/24/2026|valid|0|0|
15|Corriere della Sera (feed-hp Homepage)|<https://www.corriere.it/feed-hp/homepage.xml>|200|02/24/2026|valid|476|7956|
16|la Repubblica|<https://www.repubblica.it/rss/homepage/rss2.0.xml>|200|02/24/2026|valid|120|1987|
17|La Stampa|<https://www.lastampa.it/rss/copertina.xml>|200|02/24/2026|valid|330|5082|
18|Il Sole 24 Ore (Italia)|<https://www.ilsole24ore.com/rss/italia.xml>|200|02/24/2026|valid|48|804|
19|Il Fatto Quotidiano|<https://www.ilfattoquotidiano.it/feed/>|200|02/24/2026|valid|100|1675|
20|La Gazzetta dello Sport|<https://www.gazzetta.it/rss/home.xml>|200|02/24/2026|valid|480|8040|
21|IL Tempo|<https://www.iltempo.it/rss.xml>|200|02/24/2026|valid|240|5790|
22|Libero Quotidiano|<https://www.liberoquotidiano.it/rss.xml>|200|02/24/2026|valid|240|5635|
23|MilanoToday|<https://www.milanotoday.it/rss>|200|02/24/2026|valid|75|1450|
24|The Florentine|<https://www.theflorentine.net/feed>|200|02/24/2026|valid|0|340|
25|Wanted in Rome|<https://www.wantedinrome.com/news?format=rss>|200|02/24/2026|valid|80|1340|
26|Florence Daily News|<https://florencedailynews.com/feed>|Recovered via sitemap|02/24/2026|valid|40|670|
27|Alto Adige (Cronaca)|<https://www.altoadige.it/feed-rss/cronaca-1.169>|200|02/24/2026|valid|80|542|
28|Italia a Tavola|<https://rss.italiaatavola.net/feed.xml>|200|02/24/2026|valid|120|2010|
29|la Città di Salerno|<https://www.lacittadisalerno.it/feed>|200|02/24/2026|valid|40|670|
30|Notizie Geopolitiche|<https://www.notiziegeopolitiche.net/feed>|200|02/24/2026|valid|40|660|

### Canada (CA)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Global News|<https://globalnews.ca/feed>|200|02/24/2026|valid|40|670|
2|rabble.ca|<https://rabble.ca/feed>|200|02/24/2026|valid|48|804|
3|National Post|<https://nationalpost.com/feed>|200|02/24/2026|valid|40|670|
4|Toronto Sun|<https://torontosun.com/feed>|200|02/24/2026|valid|40|670|
5|Financial Post|<https://feeds.feedburner.com/FP_TopStories>|200|02/24/2026|valid|40|710|
6|CityNews Toronto|<https://toronto.citynews.ca/feed>|200|02/24/2026|valid|60|1005|
7|Calgary Herald|<https://calgaryherald.com/feed>|200|02/24/2026|valid|40|670|
8|Edmonton Journal|<https://edmontonjournal.com/feed>|200|02/24/2026|valid|40|670|
9|Windsor Star|<https://windsorstar.com/feed>|200|02/24/2026|valid|40|670|
10|The Province|<https://theprovince.com/feed>|200|02/24/2026|valid|40|670|
11|Calgary Sun|<https://calgarysun.com/feed>|200|02/24/2026|valid|40|670|
12|Ottawa Sun|<https://ottawasun.com/feed>|200|02/24/2026|valid|40|670|
13|The Tyee|<https://thetyee.ca/rss2.xml>|200|02/24/2026|valid|84|2051|
14|The StarPhoenix|<https://thestarphoenix.com/feed>|200|02/24/2026|valid|40|670|
15|Edmonton Sun|<https://edmontonsun.com/feed>|200|02/24/2026|valid|40|670|
16|Canada.com|<https://o.canada.com/feed>|200|02/24/2026|valid|40|670|
17|Business In Vancouver (BIV)|<https://biv.com/rss>|200|02/24/2026|valid|80|1340|
18|Regina Leader Post|<https://leaderpost.com/feed>|200|02/24/2026|valid|40|660|
19|Owen Sound Sun Times|<https://owensoundsuntimes.com/feed>|200|02/24/2026|valid|32|536|
20|Stratford Beacon Herald|<https://stratfordbeaconherald.com/feed>|200|02/24/2026|valid|32|536|
21|The Georgia Straight|<https://straight.com/content/rss>|200|02/24/2026|valid|60|990|
22|Grande Prairie Daily Herald Tribune|<https://dailyheraldtribune.com/feed>|200|02/24/2026|valid|32|536|
23|YGK News (Kingston)|<https://ygknews.ca/feed>|200|02/24/2026|valid|40|660|
24|Prince Albert Daily Herald|<https://paherald.sk.ca/feed>|200|02/24/2026|valid|40|660|
25|Sunny South News|<https://sunnysouthnews.com/feed>|200|02/24/2026|valid|40|670|
26|The Afro News|<https://theafronews.com/feed>|200|02/24/2026|valid|40|650|
27|CTV News - Top Stories|<https://www.ctvnews.ca/rss/ctvnews-ca-top-stories-public-rss-1.822009>|Recovered via sitemap|02/24/2026|valid|0|0|
28|CTV News - Business|<https://www.ctvnews.ca/rss/business/ctvnews-ca-business-public-rss-1.822283>|Recovered via sitemap|02/24/2026|valid|0|0|
29|Global News - Politics|<https://globalnews.ca/politics/feed/>|200|02/24/2026|valid|30|50|
30|Toronto Star - Politics|<https://www.thestar.com/search/?f=rss&t=article&c=politics&l=50&s=start_time&sd=desc>|Recovered via sitemap|02/24/2026|valid|150|250|
31|BNN Bloomberg (Canada Biz)|<https://www.bnnbloomberg.ca/business/rss>|Recovered via sitemap|02/24/2026|valid|0|0|
32|CBC News - Business|<https://www.cbc.ca/cmlink/rss-business>|ERR (TIMEOUT)|02/24/2026|invalid|0|0|
33|CBC News - World|<https://www.cbc.ca/cmlink/rss-world>|ERR (TIMEOUT)|02/24/2026|invalid|0|0|
34|Financial Post (Economy)|<https://financialpost.com/feed>|200|02/24/2026|valid|30|40|

### Russia (RU)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|RT|<https://rt.com/feed>|200|02/24/2026|valid|400|6700|
2|The Bell|<https://thebell.io/feed>|200|02/24/2026|valid|80|1340|
3|Interfax|<https://www.interfax.ru/rss.asp>|200|02/24/2026|valid|125|1700|
4|RT Economy|<https://www.rt.com/rss/business>|200|02/24/2026|valid|400|6700|
5|The Bell|<https://thebell.io/feed/>|200|02/24/2026|valid|80|1340|
6|Lenta|<https://lenta.ru/rss/news>|200|02/24/2026|valid|480|8040|
7|TASS Finance|<https://tass.com/rss/v2.xml>|200|02/24/2026|valid|267|5348|
8|RT News|<https://www.rt.com/rss/>|200|02/24/2026|valid|400|6700|
9|Kommersant (Главное)|<https://www.kommersant.ru/RSS/main.xml>|200|02/24/2026|valid|147|1140|
10|The Moscow Times|<https://www.themoscowtimes.com/rss/news>|200|02/24/2026|valid|200|3350|
11|PravdaReport|<https://www.pravdareport.com/export.xml>|200|02/24/2026|valid|80|1340|
12|Meduza (all)|<https://meduza.io/rss2/all>|200|02/24/2026|valid|120|2010|
13|Habr (all)|<https://habr.com/ru/rss/all/all/?fl=ru>|200|02/24/2026|valid|160|2680|

### South Korea (KR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Yonhap (EN)|<https://en.yna.co.kr/RSS/news.xml>|200|02/24/2026|valid|390|6858|
2|Donga Ilbo|<https://rss.donga.com/total.xml>|200|02/24/2026|valid|200|3350|
3|Seoul Newspaper|<https://www.seoul.co.kr/xml/rss/rss_top.xml>|200|02/24/2026|valid|104|1716|
4|Newsis|<https://www.newsis.com/RSS/sokbo.xml>|200|02/24/2026|valid|400|6700|
5|Aju News|<https://rss.ajunews.com/sokbo.xml>|200|02/24/2026|valid|200|3350|
6|KED Global (Korea Economic Daily)|<https://www.kedglobal.com/newsRss>|200|02/24/2026|valid|0|1159|
7|Daily NK (EN)|<https://www.dailynk.com/english/feed>|Recovered via sitemap|02/24/2026|valid|40|620|
8|Korea Times (RSS directory)|<https://feed.koreatimes.co.kr/k/allnews.xml>|200|02/24/2026|valid|145|1681|
9|Korea Herald (RSS directory)|<https://www.koreaherald.com/rss/newsAll>|200|02/24/2026|valid|178|3164|
10|KBS World Radio (RSS directory)|<http://world.kbs.co.kr/rss/rss_news.htm?lang=e>|200|02/24/2026|valid|0|1020|
11|한국경제 - 전체뉴스|<https://www.hankyung.com/feed/all-news>|200|02/24/2026|valid|200|3350|
12|한국경제 - 증권|<https://www.hankyung.com/feed/finance>|200|02/24/2026|valid|200|3350|
13|한국경제 - 경제|<https://www.hankyung.com/feed/economy>|200|02/24/2026|valid|200|3350|
14|한국경제 - 부동산|<https://www.hankyung.com/feed/realestate>|200|02/24/2026|valid|200|3350|
15|한국경제 - IT|<https://www.hankyung.com/feed/it>|200|02/24/2026|valid|200|3350|
16|한국경제 - 정치|<https://www.hankyung.com/feed/politics>|200|02/24/2026|valid|200|3350|
17|한국경제 - 국제|<https://www.hankyung.com/feed/international>|200|02/24/2026|valid|200|3350|
18|매일경제 - 뉴스 헤드라인|<https://www.mk.co.kr/rss/30000001/>|200|02/24/2026|valid|200|3350|
19|매일경제 - 뉴스 전체뉴스|<https://www.mk.co.kr/rss/40300001/>|200|02/24/2026|valid|200|3350|
20|매일경제 - 뉴스 경제|<https://www.mk.co.kr/rss/30100041/>|200|02/24/2026|valid|200|3350|
21|매일경제 - 뉴스 정치|<https://www.mk.co.kr/rss/30200030/>|200|02/24/2026|valid|200|3350|
22|매일경제 - 뉴스 사회|<https://www.mk.co.kr/rss/50400012/>|200|02/24/2026|valid|200|3350|
23|SBS - 정치|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=01&plink=RSSREADER>|200|02/24/2026|valid|116|1943|
24|SBS - 경제|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=02&plink=RSSREADER>|200|02/24/2026|valid|116|1943|
25|SBS - 사회|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=03&plink=RSSREADER>|200|02/24/2026|valid|116|1943|
26|SBS - 생활/문화|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=07&plink=RSSREADER>|200|02/24/2026|valid|116|1943|
27|SBS - 국제/글로벌|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=08&plink=RSSREADER>|200|02/24/2026|valid|116|1943|
28|SBS - 연예/방송|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=14&plink=RSSREADER>|200|02/24/2026|valid|116|1943|
29|SBS - 스포츠|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=09&plink=RSSREADER>|200|02/24/2026|valid|116|1943|
30|한겨레 - 국제|<https://www.hani.co.kr/rss/international/>|200|02/24/2026|valid|116|776|
31|한겨레 - 문화|<https://www.hani.co.kr/rss/culture/>|200|02/24/2026|valid|120|780|
32|한겨레 - 스포츠|<https://www.hani.co.kr/rss/sports/>|200|02/24/2026|valid|120|780|
33|한겨레:온 - 섹션1|<https://www.hanion.co.kr/rss/S1N1.xml>|200|02/24/2026|valid|80|1320|
34|한겨레:온 - 섹션2|<https://www.hanion.co.kr/rss/S1N2.xml>|200|02/24/2026|valid|80|1320|
35|한겨레:온 - 섹션3|<https://www.hanion.co.kr/rss/S1N3.xml>|200|02/24/2026|valid|80|1320|
36|경향신문 - 전체|<https://www.khan.co.kr/rss/rssdata/total_news.xml>|200|02/24/2026|valid|200|3350|
37|MBC 주요뉴스|<https://imnews.imbc.com/rss/google_news/narrativeNews.rss>|200|02/24/2026|valid|0|0|
38|조선닷컴 (전체)|<https://www.chosun.com/arc/outboundfeeds/rss/?outputType=xml>|200|02/24/2026|valid|400|6700|

### Brazil (BR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|G1 (Globo - Economy)|<https://g1.globo.com/rss/g1/economia/>|200|02/24/2026|valid|400|6700|
2|G1 (Globo - Tech)|<https://g1.globo.com/rss/g1/tecnologia/>|200|02/24/2026|valid|400|6700|
3|Folha de S.Paulo - Top|<https://feeds.folha.uol.com.br/emcimadahora/rss091.xml>|200|02/24/2026|valid|400|6700|
4|Folha de S.Paulo - Market|<https://feeds.folha.uol.com.br/mercado/rss091.xml>|200|02/24/2026|valid|500|6800|
5|Correio Braziliense|<https://www.correiobraziliense.com.br/rss/noticia/economia/rss.xml>|200|02/24/2026|valid|120|2010|
6|InfoMoney|<https://www.infomoney.com.br/feed/>|200|02/24/2026|valid|40|670|
7|Canaltech|<https://canaltech.com.br/rss/>|200|02/24/2026|valid|200|3300|
8|Forbes Brazil|<https://forbes.com.br/feed/>|200|02/24/2026|valid|200|3350|
9|Estado de Minas|<https://www.em.com.br/feed/>|200|02/24/2026|valid|0|2440|
10|Veja|<https://veja.abril.com.br/feed/>|200|02/24/2026|valid|80|1340|
11|Folha - Poder (정치)|<https://feeds.folha.uol.com.br/poder/rss091.xml>|200|02/24/2026|valid|400|6700|
12|Folha - Mundo|<https://feeds.folha.uol.com.br/mundo/rss091.xml>|200|02/24/2026|valid|400|6700|
13|Folha - Cotidiano|<https://feeds.folha.uol.com.br/cotidiano/rss091.xml>|200|02/24/2026|valid|400|6700|
14|Folha - Esporte|<https://feeds.folha.uol.com.br/esporte/rss091.xml>|200|02/24/2026|valid|400|6700|
15|Folha - Ilustrada (문화)|<https://feeds.folha.uol.com.br/ilustrada/rss091.xml>|200|02/24/2026|valid|400|6700|
16|Agência Pública|<https://apublica.org/feed/>|200|02/24/2026|valid|40|670|
17|Nexo Jornal|<https://www.nexojornal.com.br/rss.xml>|200|02/24/2026|valid|80|1340|
18|Jornal GGN|<https://jornalggn.com.br/feed/>|200|02/24/2026|valid|12|504|
19|Jacobin Brasil|<https://jacobin.com.br/feed>|200|02/24/2026|valid|30|1230|
20|CartaCapital|<https://www.cartacapital.com.br/feed>|200|02/24/2026|valid|80|1340|

### Australia (AU)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|ABC News - Business|<https://www.abc.net.au/news/feed/51892/rss.xml>|200|02/24/2026|valid|100|1650|
2|ABC News - World|<https://www.abc.net.au/news/feed/104217382/rss.xml>|200|02/24/2026|valid|16|264|
3|ABC News - Top Stories|<https://www.abc.net.au/news/feed/10719986/rss.xml>|200|02/24/2026|valid|100|1650|
4|Sydney Morning Herald - Business|<https://www.smh.com.au/rss/business.xml>|200|02/24/2026|valid|80|1340|
5|The Age - Business|<https://www.theage.com.au/rss/business.xml>|200|02/24/2026|valid|80|1340|
6|The Australian - Business|<https://www.theaustralian.com.au/business/rss>|200|02/24/2026|valid|0|0|
7|The Guardian Australia|<https://www.theguardian.com/au/rss>|200|02/24/2026|valid|431|7740|
8|ABC News (Top)|<https://www.abc.net.au/news/feed/1106/rss.xml>|200|02/24/2026|valid|32|528|
9|Australian Broadcasting Corporation - World|<https://www.abc.net.au/news/feed/51892/rss.xml?edition=world>|200|02/24/2026|valid|100|1650|
10|The Guardian Australia|<https://www.theguardian.com/australia-news/rss>|200|02/24/2026|valid|95|1540|
11|SBS World News|<https://www.sbs.com.au/news/topic/latest/feed>|200|02/24/2026|valid|100|1675|
12|SBS News (Breaking)|<https://www.sbs.com.au/news/feed>|200|02/24/2026|valid|96|1608|
13|9News|<https://www.9news.com.au/rss>|200|02/24/2026|valid|76|1059|
14|Sydney Morning Herald|<https://www.smh.com.au/rss/feed.xml>|200|02/24/2026|valid|100|1360|
15|The Age|<https://www.theage.com.au/rss/feed.xml>|200|02/24/2026|valid|100|1360|
16|Canberra Times|<https://www.canberratimes.com.au/rss.xml>|200|02/24/2026|valid|66|1176|
17|PerthNow|<https://www.perthnow.com.au/news/feed>|200|02/24/2026|valid|400|6700|
18|The Australian|<https://www.theaustralian.com.au/business/markets/rss>|200|02/24/2026|valid|0|0|
19|7news|<https://7news.com.au/feed>|200|02/24/2026|valid|400|6700|
20|RenewEconomy (호주 신재생/전력망 1위)|<https://reneweconomy.com.au/feed/>|200|02/24/2026|valid|40|330|
21|Australian Mining (광물/리튬)|<https://www.australianmining.com.au/feed/>|200|02/24/2026|valid|20|165|
22|MacroBusiness (매크로/부동산 심층분석)|<https://www.macrobusiness.com.au/feed/>|200|02/24/2026|valid|120|990|
23|SmartCompany (스타트업/비즈니스)|<https://www.smartcompany.com.au/feed/>|200|02/24/2026|valid|40|330|
24|Startup Daily (테크)|<https://www.startupdaily.net/feed/>|200|02/24/2026|valid|40|330|
25|The Conversation AU (오피니언/정책)|<https://theconversation.com/au/rss>|Recovered via sitemap|02/24/2026|valid|145|2194|

### Spain (ES)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Expansión (Financial)|<https://e00-expansion.uecdn.es/rss/empresas.xml>|200|02/24/2026|valid|196|3273|
2|Cinco Días (Economy)|<https://cincodias.elpais.com/arc/outboundfeeds/rss/?outputType=xml>|200|02/24/2026|valid|400|6700|
3|El País - Economy|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/economia/portada>|200|02/24/2026|valid|155|2519|
4|El Mundo - Economy|<https://e00-elmundo.uecdn.es/elmundo/rss/economia.xml>|200|02/24/2026|valid|208|3617|
5|El Confidencial|<https://rss.elconfidencial.com/espana/>|200|02/24/2026|valid|60|1005|
6|El Periodico|<https://www.elperiodico.com/es/rss/rss_portada.xml>|200|02/24/2026|valid|0|0|
7|20 Minutos|<https://www.20minutos.es/rss/>|200|02/24/2026|valid|480|8040|
8|El Diario|<https://www.eldiario.es/rss/>|200|02/24/2026|valid|435|6749|
9|eldiario|<https://www.eldiario.es/rss/>|200|02/24/2026|valid|435|6749|
10|Marca|<https://www.marca.com/rss/>|200|02/24/2026|valid|0|0|
11|El Pais|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada>|200|02/24/2026|valid|480|8027|
12|EL PAÍS - Últimas|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/ultimas-noticias/portada>|200|02/24/2026|valid|324|5117|
13|EL PAÍS - Internacional|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/internacional/portada>|200|02/24/2026|valid|87|1385|
14|EL PAÍS - Opinión|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/opinion/portada>|200|02/24/2026|valid|102|1620|
15|EL PAÍS - España|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/espana/portada>|200|02/24/2026|valid|76|1204|
16|EL PAÍS - Sociedad|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/sociedad/portada>|200|02/24/2026|valid|114|1842|
17|EL PAÍS - Ciencia|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/ciencia/portada>|200|02/24/2026|valid|156|2496|
18|EL PAÍS - Tecnología|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/tecnologia/portada>|200|02/24/2026|valid|64|1024|
19|EL PAÍS - Cultura|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/cultura/portada>|200|02/24/2026|valid|124|2026|
20|EL PAÍS - Deportes|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/deportes/portada>|200|02/24/2026|valid|114|1841|
21|EL PAÍS - Gente|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/gente/portada>|200|02/24/2026|valid|84|1378|
22|EL PAÍS - Clima y medio ambiente|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/clima-y-medio-ambiente/portada>|200|02/24/2026|valid|76|1231|
23|La Vanguardia - Portada|<https://www.lavanguardia.com/rss/home.xml>|200|02/24/2026|valid|480|7680|
24|La Vanguardia - Internacional|<https://www.lavanguardia.com/rss/internacional.xml>|200|02/24/2026|valid|400|6400|
25|La Vanguardia - Política|<https://www.lavanguardia.com/rss/politica.xml>|200|02/24/2026|valid|400|6400|
26|La Vanguardia - Opinión|<https://www.lavanguardia.com/rss/opinion.xml>|200|02/24/2026|valid|372|5930|
27|La Vanguardia - Sociedad|<https://www.lavanguardia.com/rss/sociedad.xml>|200|02/24/2026|valid|396|6336|
28|La Vanguardia - Deportes|<https://www.lavanguardia.com/rss/deportes.xml>|200|02/24/2026|valid|400|6400|
29|El Mundo - Portada|<https://e00-elmundo.uecdn.es/rss/portada.xml>|200|02/24/2026|valid|96|1655|
30|The Local Spain (EN)|<https://feeds.thelocal.com/rss/es>|200|02/24/2026|valid|80|1280|
31|El Economista - Portada (스페인 금융 1위)|<https://www.eleconomista.es/rss/rss-portada.php>|403 (HTTP_403)|02/24/2026|invalid|0|234|
32|El Economista - Mercados (주식/마켓)|<https://www.eleconomista.es/rss/rss-mercados.php>|403 (HTTP_403)|02/24/2026|invalid|60|226|
33|ABC.es - Economía (보수 3대장)|<https://www.abc.es/rss/feeds/abc_economia.xml>|200|02/24/2026|valid|80|660|
34|Vozpópuli (경제/정치 탐사)|<https://www.vozpopuli.com/rss>|200|02/24/2026|valid|100|825|
35|El Periódico de la Energía (에너지/전력망 특화)|<https://elperiodicodelaenergia.com/feed/>|200|02/24/2026|valid|200|1650|
36|Xataka (스페인어권 최대 테크 매체)|<https://www.xataka.com/feed>|Recovered via sitemap|02/24/2026|valid|268|2247|
37|ABC.es|<https://www.abc.es/rss/feeds/abc_ultima.xml>|200|02/24/2026|valid|60|80|

### Mexico (MX)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Proceso (Investigative)|<https://www.proceso.com.mx/rss/feed.html>|200|02/24/2026|valid|60|1112|
2|Expansion (Biz)|<https://expansion.mx/rss>|200|02/24/2026|valid|192|3132|
3|Contralínea|<https://www.contralinea.com.mx/feed>|200|02/24/2026|valid|24|402|
4|El Financiero|<https://www.elfinanciero.com.mx/rss/mundo>|200|02/24/2026|valid|400|6611|
5|Proceso World|<https://www.proceso.com.mx/rss/feed.html?output=xml>|200|02/24/2026|valid|60|1112|
6|El Financiero|<https://www.elfinanciero.com.mx/rss>|200|02/24/2026|valid|400|6611|
7|ADN40 (TV Azteca - Economy)|<https://www.adn40.mx/economia/rss>|Recovered via sitemap|02/24/2026|valid|0|0|
8|ADN40 (TV Azteca - Mexico)|<https://www.adn40.mx/mexico/rss>|Recovered via sitemap|02/24/2026|valid|0|0|
9|El Financiero (Economía)|<https://www.elfinanciero.com.mx/rss/economia>|200|02/24/2026|valid|300|500|
10|El Financiero (Mercados)|<https://www.elfinanciero.com.mx/rss/mercados>|200|02/24/2026|valid|300|500|
11|La Jornada - Economía|<https://www.jornada.com.mx/rss/economia.xml>|200|02/24/2026|valid|39|65|
12|Aristegui (Main)|<https://editorial.aristeguinoticias.com/feed/>|200|02/24/2026|valid|40|660|
13|Aristegui (México)|<https://editorial.aristeguinoticias.com/category/mexico/feed/>|200|02/24/2026|valid|60|990|
14|Aristegui (Dinero y Economía)|<https://editorial.aristeguinoticias.com/category/dinero-y-economia/feed/>|200|02/24/2026|valid|60|990|
15|Aristegui (Mundo)|<https://editorial.aristeguinoticias.com/category/mundo/feed/>|200|02/24/2026|valid|60|990|
16|Aristegui En Vivo - Entérate|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/enterate/feed>|200|02/24/2026|valid|60|990|
17|Aristegui En Vivo - Programas completos|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/programas-completos/feed>|200|02/24/2026|valid|60|990|
18|Aristegui En Vivo - Entrevistas completas|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/entrevistas-completos/feed>|200|02/24/2026|valid|0|0|
19|Aristegui En Vivo - Mesa política|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/mesa-politica-en-vivo/feed>|200|02/24/2026|valid|60|990|
20|Aristegui En Vivo - Investigaciones especiales|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/investigaciones-especiales/feed>|200|02/24/2026|valid|60|990|
21|Aristegui En Vivo - Enlaces en vivo|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/enlaces-en-vivo/feed>|200|02/24/2026|valid|60|990|
22|Aristegui En Vivo - Titulares del día|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/titulares-del-dia/feed>|200|02/24/2026|valid|60|990|
23|Aristegui En Vivo - Deportes|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/deportes-aristegui-en-vivo/feed>|200|02/24/2026|valid|60|990|
24|Aristegui En Vivo - Dinero y Economía|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/dinero-y-economia/feed>|200|02/24/2026|valid|60|990|
25|Aristegui En Vivo - Niñonautas|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/ninonautas/feed>|200|02/24/2026|valid|60|990|
26|Aristegui En Vivo - Las plumas de la serpiente|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/las-plumas-de-la-serpiente/feed>|200|02/24/2026|valid|60|990|
27|El Economista - Top Noticias (멕시코 경제 1위)|<https://www.eleconomista.com.mx/rss/top-noticias>|403 (HTTP_403)|02/24/2026|invalid|0|0|
28|El Economista - Empresas|<https://www.eleconomista.com.mx/rss/empresas>|403 (HTTP_403)|02/24/2026|invalid|0|0|
29|El Universal - General (최대 일간지)|<https://www.eluniversal.com.mx/rss.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
30|El Universal - Cartera (경제/지갑)|<https://www.eluniversal.com.mx/cartera/rss.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
31|Milenio (전국지)|<https://www.milenio.com/rss>|Recovered via sitemap|02/24/2026|valid|0|0|
32|Excelsior (보수 유력지)|<https://www.excelsior.com.mx/rss.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
33|Forbes México|<https://www.forbes.com.mx/feed/>|Recovered via sitemap|02/24/2026|valid|0|962|
34|Energía a Debate (멕시코 에너지 전문)|<https://energiaadebate.com/feed/>|200|02/24/2026|valid|360|2970|

### Indonesia (ID)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Republika|<https://www.republika.co.id/rss>|200|02/24/2026|valid|60|1005|
2|Sindo News|<https://www.sindonews.com/rss/home/>|200|02/24/2026|valid|120|2010|
3|Kapanlagi|<https://www.kapanlagi.com/feed/>|200|02/24/2026|valid|480|6878|
4|Antara TV|<https://www.antaranews.com/rss/terkini>|200|02/24/2026|valid|200|3050|
5|Sindonews|<https://www.sindonews.com/rss/>|200|02/24/2026|valid|120|2010|
6|Republika|<https://www.republika.co.id/rss/terkini>|200|02/24/2026|valid|0|0|
7|ANTARA - Terkini|<https://www.antaranews.com/rss/terkini.xml>|200|02/24/2026|valid|200|2900|
8|ANTARA - Top News|<https://www.antaranews.com/rss/top-news.xml>|200|02/24/2026|valid|120|1890|
9|ANTARA - Politik|<https://www.antaranews.com/rss/politik.xml>|ERR (TIMEOUT)|02/24/2026|invalid|80|1240|
10|ANTARA - Hukum|<https://www.antaranews.com/rss/hukum.xml>|200|02/24/2026|valid|80|1220|
11|ANTARA - Ekonomi|<https://www.antaranews.com/rss/ekonomi.xml>|200|02/24/2026|valid|80|1300|
12|ANTARA - Ekonomi (Finansial)|<https://www.antaranews.com/rss/ekonomi-finansial.xml>|ERR (TIMEOUT)|02/24/2026|invalid|60|1240|
13|ANTARA - Ekonomi (Bisnis)|<https://www.antaranews.com/rss/ekonomi-bisnis.xml>|200|02/24/2026|valid|60|1220|
14|ANTARA - Ekonomi (Bursa)|<https://www.antaranews.com/rss/ekonomi-bursa.xml>|200|02/24/2026|valid|80|1300|
15|ANTARA - Metro|<https://www.antaranews.com/rss/metro.xml>|200|02/24/2026|valid|80|1260|
16|ANTARA - Metro (Kriminalitas)|<https://www.antaranews.com/rss/metro-kriminalitas.xml>|200|02/24/2026|valid|80|1260|
17|ANTARA - Metro (Lintas Kota)|<https://www.antaranews.com/rss/metro-lintas-kota.xml>|200|02/24/2026|valid|80|1260|
18|ANTARA - Metro (Lenggang Jakarta)|<https://www.antaranews.com/rss/metro-lenggang-jakarta.xml>|200|02/24/2026|valid|80|1280|
19|ANTARA - Sepakbola|<https://www.antaranews.com/rss/sepakbola.xml>|200|02/24/2026|valid|80|1260|
20|ANTARA - Sepakbola (Liga Indonesia)|<https://www.antaranews.com/rss/sepakbola-liga-indonesia.xml>|200|02/24/2026|valid|80|1260|
21|ANTARA - Sepakbola (Internasional)|<https://www.antaranews.com/rss/sepakbola-internasional.xml>|200|02/24/2026|valid|80|1180|
22|ANTARA - Sepakbola (Liga Inggris)|<https://www.antaranews.com/rss/sepakbola-liga-inggris-premier.xml>|200|02/24/2026|valid|80|1300|
23|ANTARA - Sepakbola (Liga Spanyol)|<https://www.antaranews.com/rss/sepakbola-liga-spanyol.xml>|200|02/24/2026|valid|80|1280|
24|ANTARA - Sepakbola (Liga Italia)|<https://www.antaranews.com/rss/sepakbola-liga-italia-seri-a.xml>|200|02/24/2026|valid|80|1180|
25|ANTARA - Liga Champions|<https://www.antaranews.com/rss/sepakbola-liga-champions.xml>|200|02/24/2026|valid|60|1160|
26|ANTARA - Olahraga|<https://www.antaranews.com/rss/olahraga.xml>|200|02/24/2026|valid|80|1180|
27|ANTARA - Olahraga (Bulutangkis)|<https://www.antaranews.com/rss/olahraga-bulutangkis.xml>|200|02/24/2026|valid|80|1220|
28|ANTARA - Olahraga (Bola Basket)|<https://www.antaranews.com/rss/olahraga-bola-basket.xml>|200|02/24/2026|valid|80|1260|
29|ANTARA - Olahraga (Tenis)|<https://www.antaranews.com/rss/olahraga-tenis.xml>|200|02/24/2026|valid|80|1300|
30|ANTARA - Olahraga (Balap)|<https://www.antaranews.com/rss/olahraga-balap.xml>|200|02/24/2026|valid|80|1220|
31|ANTARA - Humaniora|<https://www.antaranews.com/rss/humaniora.xml>|200|02/24/2026|valid|60|1220|
32|ANTARA - Lifestyle|<https://www.antaranews.com/rss/lifestyle.xml>|200|02/24/2026|valid|80|1280|
33|ANTARA - Hiburan|<https://www.antaranews.com/rss/hiburan.xml>|200|02/24/2026|valid|80|1260|
34|ANTARA - Dunia|<https://www.antaranews.com/rss/dunia.xml>|200|02/24/2026|valid|80|1300|
35|ANTARA - Dunia (ASEAN)|<https://www.antaranews.com/rss/dunia-asean.xml>|200|02/24/2026|valid|80|1220|
36|ANTARA - Tekno|<https://www.antaranews.com/rss/tekno.xml>|200|02/24/2026|valid|80|1220|
37|RM.ID - Semua berita|<https://rm.id/rss-rakyat-merdeka>|200|02/24/2026|valid|40|660|
38|RM.ID - Nasional|<https://rm.id/rss-rakyat-merdeka/nasional>|200|02/24/2026|valid|0|330|
39|RM.ID - Internasional|<https://rm.id/rss-rakyat-merdeka/internasional>|200|02/24/2026|valid|40|660|
40|RM.ID - Ekonomi Bisnis|<https://rm.id/rss-rakyat-merdeka/ekonomi-bisnis>|200|02/24/2026|valid|40|660|
41|RM.ID - Bank & Finance|<https://rm.id/rss-rakyat-merdeka/bank-finance>|200|02/24/2026|valid|0|0|
42|RM.ID - Indonesianomics|<https://rm.id/rss-rakyat-merdeka/indonesianomics>|200|02/24/2026|valid|0|0|

### Netherlands (NL)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|NOS|<https://feeds.nos.nl/nosnieuwsalgemeen>|200|02/24/2026|valid|80|1340|
2|NRC|<https://www.nrc.nl/rss>|200|02/24/2026|valid|476|7960|
3|AD|<https://www.ad.nl/rss.xml>|200|02/24/2026|valid|120|2010|
4|Nu|<https://www.nu.nl/rss/algemeen>|200|02/24/2026|valid|120|2010|
5|NPO Radio 1|<https://www.npo3fm.nl/rss/>|200|02/24/2026|valid|200|3350|
6|NOS Tech|<https://feeds.nos.nl/nosnieuwstech>|200|02/24/2026|valid|80|1340|
7|NRC|<https://www.nrc.nl/nieuws/rss/>|200|02/24/2026|valid|56|1232|
8|Nieuwsuur|<https://feeds.nos.nl/nieuwsuuralgemeen>|200|02/24/2026|valid|80|1340|
9|RTL|<https://www.rtlnieuws.nl/nieuws/rss.xml>|200|02/24/2026|valid|48|804|
10|NRC|<https://www.nrc.nl/rss/>|200|02/24/2026|valid|595|8079|
11|NOS Nieuws - Binnenland|<https://feeds.nos.nl/nosnieuwsbinnenland>|200|02/24/2026|valid|80|1280|
12|NOS Nieuws - Buitenland|<https://feeds.nos.nl/nosnieuwsbuitenland>|200|02/24/2026|valid|80|1280|
13|NOS Nieuws - Politiek|<https://feeds.nos.nl/nosnieuwspolitiek>|200|02/24/2026|valid|80|1280|
14|NOS Nieuws - Economie|<https://feeds.nos.nl/nosnieuwseconomie>|200|02/24/2026|valid|80|1280|
15|NOS Nieuws - Opmerkelijk|<https://feeds.nos.nl/nosnieuwsopmerkelijk>|200|02/24/2026|valid|80|1280|
16|NOS Nieuws - Koningshuis|<https://feeds.nos.nl/nosnieuwskoningshuis>|200|02/24/2026|valid|80|1280|
17|NOS Nieuws - Cultuur & media|<https://feeds.nos.nl/nosnieuwscultuurenmedia>|200|02/24/2026|valid|80|1280|
18|NOS Sport - Algemeen|<https://feeds.nos.nl/nossportalgemeen>|200|02/24/2026|valid|80|1280|
19|NOS Sport - Voetbal|<https://feeds.nos.nl/nosvoetbal>|200|02/24/2026|valid|80|1280|
20|NOS Sport - Wielrennen|<https://feeds.nos.nl/nossportwielrennen>|200|02/24/2026|valid|80|1280|
21|NOS Sport - Schaatsen|<https://feeds.nos.nl/nossportschaatsen>|200|02/24/2026|valid|80|1280|
22|NOS Sport - Tennis|<https://feeds.nos.nl/nossporttennis>|200|02/24/2026|valid|80|1280|
23|NOS Sport - Formule 1|<https://feeds.nos.nl/nossportformule1>|200|02/24/2026|valid|80|1280|
24|NOS op 3|<https://feeds.nos.nl/nosop3>|200|02/24/2026|valid|80|1280|
25|NOS Jeugdjournaal|<https://feeds.nos.nl/jeugdjournaal>|200|02/24/2026|valid|80|1280|
26|De Telegraaf|<https://www.telegraaf.nl/rss>|Recovered via sitemap|02/24/2026|valid|0|0|
27|de Volkskrant|<https://www.volkskrant.nl/voorpagina/rss.xml>|200|02/24/2026|valid|50|512|
28|Trouw|<https://www.trouw.nl/voorpagina/rss.xml>|200|02/24/2026|valid|100|1300|
29|Het Parool|<https://www.parool.nl/voorpagina/rss.xml>|200|02/24/2026|valid|43|511|
30|Het Financieele Dagblad (FD)|<https://fd.nl/?rss>|200|02/24/2026|valid|160|1329|
31|Tweakers (Mixed)|<https://tweakers.net/feeds/mixed.xml>|200|02/24/2026|valid|160|2560|
32|BNR Nieuwsradio (Economie)|<https://www.bnr.nl/rss/economie>|Recovered via sitemap|02/24/2026|valid|0|0|
33|Telegraaf (Financieel)|<https://www.telegraaf.nl/rss/financieel>|Recovered via sitemap|02/24/2026|valid|0|0|
34|RTL Z (Business)|<https://www.rtlnieuws.nl/economie/rss.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
35|Nu.nl|<https://www.nu.nl/rss/Algemeen>|200|02/24/2026|valid|90|120|
36|Tweakers|<https://tweakers.net/feeds/nieuws.xml>|200|02/24/2026|valid|0|0|

### Switzerland (CH)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Le Temps Economy|<https://www.letemps.ch/economie.rss>|200|02/24/2026|valid|84|1386|
2|NZZ|<https://www.nzz.ch/reisen.rss>|200|02/24/2026|valid|108|1809|
3|NDR|<https://www.ndr.ch/rss/>|200|02/24/2026|valid|40|660|
4|SRF News (Latest)|<https://www.srf.ch/news/bnf/rss/19032223>|200|02/24/2026|valid|240|3960|
5|SRF News (Switzerland)|<https://www.srf.ch/news/bnf/rss/1890>|200|02/24/2026|valid|240|3960|
6|SRF News (International)|<https://www.srf.ch/news/bnf/rss/1922>|200|02/24/2026|valid|240|3960|
7|SRF News (Economy)|<https://www.srf.ch/news/bnf/rss/1926>|200|02/24/2026|valid|240|3960|
8|SRF Sport (Football)|<https://www.srf.ch/sport/bnf/rss/2562>|200|02/24/2026|valid|244|4026|
9|SRF Sport (Ice Hockey)|<https://www.srf.ch/sport/bnf/rss/3418>|200|02/24/2026|valid|128|2112|
10|SRF Sport (Tennis)|<https://www.srf.ch/sport/bnf/rss/2814>|200|02/24/2026|valid|248|4092|
11|SRF Sport (Alpine Skiing)|<https://www.srf.ch/sport/bnf/rss/787950>|200|02/24/2026|valid|120|1980|
12|SRF Wissen (Health)|<https://www.srf.ch/bnf/rss/19919909>|200|02/24/2026|valid|480|7920|
13|SRF Wissen (Tech)|<https://www.srf.ch/bnf/rss/19920122>|200|02/24/2026|valid|344|5676|
14|Blick (Schweiz)|<https://www.blick.ch/schweiz/rss.xml>|200|02/24/2026|valid|109|2406|
15|Blick (Ausland)|<https://www.blick.ch/ausland/rss.xml>|200|02/24/2026|valid|121|2260|
16|Blick (Wirtschaft)|<https://www.blick.ch/wirtschaft/rss.xml>|200|02/24/2026|valid|52|1389|
17|Blick (Politik)|<https://www.blick.ch/politik/rss.xml>|200|02/24/2026|valid|51|1171|
18|Blick (Sport)|<https://www.blick.ch/sport/rss.xml>|200|02/24/2026|valid|150|2900|
19|Blick Sport (Fussball)|<https://www.blick.ch/sport/fussball/rss.xml>|200|02/24/2026|valid|112|2284|
20|Blick Sport (Eishockey)|<https://www.blick.ch/sport/eishockey/rss.xml>|200|02/24/2026|valid|30|676|
21|Blick Sport (Ski)|<https://www.blick.ch/sport/ski/rss.xml>|200|02/24/2026|valid|18|475|
22|Blick Sport (Tennis)|<https://www.blick.ch/sport/tennis/rss.xml>|200|02/24/2026|valid|7|45|
23|Blick (Digital)|<https://www.blick.ch/digital/rss.xml>|200|02/24/2026|valid|3|59|
24|Le News (EN)|<https://lenews.ch/feed>|200|02/24/2026|valid|40|660|
25|The Local Switzerland (EN)|<https://feeds.thelocal.com/rss/ch>|200|02/24/2026|valid|80|1320|
26|NZZ (Latest)|<https://www.nzz.ch/recent.rss>|200|02/24/2026|valid|80|1270|
27|Swissinfo (Business - EN)|<https://www.swissinfo.ch/eng/business/feed>|Recovered via sitemap|02/24/2026|valid|0|0|
28|Finews.ch (Swiss Finance)|<https://www.finews.ch/news/finanzplatz?format=feed&type=rss>|200|02/24/2026|valid|45|60|
29|20 Minuten (Wirtschaft)|<https://www.20min.ch/rss/wirtschaft>|Recovered via sitemap|02/24/2026|valid|0|0|
30|Le Temps|<https://www.letemps.ch/rss>|200 (HTML_RETURNED)|02/24/2026|invalid|0|0|
31|Finanz und Wirtschaft|<https://www.fuw.ch/feed>|Recovered via sitemap|02/24/2026|valid|0|0|

### Turkey (TR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Hürriyet|<https://www.hurriyet.com.tr/rss/anasayfa>|200|02/24/2026|valid|0|0|
2|Sabah|<https://www.sabah.com.tr/rss/sondakika.xml>|200|02/24/2026|valid|113|2612|
3|Haberturk|<https://www.haberturk.com/rss>|200|02/24/2026|valid|400|6700|
4|Cumhuriyet|<https://www.cumhuriyet.com.tr/Rss/>|200|02/24/2026|valid|400|6700|
5|Aksam|<https://www.aksam.com.tr/rss>|200|02/24/2026|valid|80|1340|
6|Takvim|<https://www.takvim.com.tr/rss/feed>|200|02/24/2026|valid|0|0|
7|Cumhuriyet|<https://www.cumhuriyet.com.tr/RSS>|200|02/24/2026|valid|400|6700|
8|HuffPost Turkey|<https://www.hurriyetdailynews.com/rss>|200|02/24/2026|valid|0|0|
9|Haber Turk|<https://www.haberturk.com/rss/>|200|02/24/2026|valid|400|6700|
10|Hürriyet (Anasayfa)|<http://www.hurriyet.com.tr/rss/anasayfa>|200|02/24/2026|valid|0|0|
11|Hürriyet (Gündem)|<http://www.hurriyet.com.tr/rss/gundem>|200|02/24/2026|valid|0|0|
12|Hürriyet (Ekonomi)|<http://www.hurriyet.com.tr/rss/ekonomi>|200|02/24/2026|valid|0|0|
13|Hürriyet (Magazin)|<http://www.hurriyet.com.tr/rss/magazin>|200|02/24/2026|valid|0|0|
14|Hürriyet (Spor)|<http://www.hurriyet.com.tr/rss/spor>|200|02/24/2026|valid|0|0|
15|Hürriyet (Dünya)|<http://www.hurriyet.com.tr/rss/dunya>|200|02/24/2026|valid|0|0|
16|Hürriyet (Teknoloji)|<http://www.hurriyet.com.tr/rss/teknoloji>|200|02/24/2026|valid|0|0|
17|Hürriyet (Sağlık)|<http://www.hurriyet.com.tr/rss/saglik>|200 (HTML_RETURNED)|02/24/2026|invalid|0|0|
18|Hürriyet (Astroloji)|<http://www.hurriyet.com.tr/rss/astroloji>|200|02/24/2026|valid|0|0|
19|Sabah (Anasayfa)|<https://www.sabah.com.tr/rss/anasayfa.xml>|200|02/24/2026|valid|40|660|
20|Sabah (Ekonomi)|<https://www.sabah.com.tr/rss/ekonomi.xml>|200|02/24/2026|valid|40|660|
21|Sabah (Spor)|<https://www.sabah.com.tr/rss/spor.xml>|200|02/24/2026|valid|40|660|
22|Sabah (Gündem)|<https://www.sabah.com.tr/rss/gundem.xml>|200|02/24/2026|valid|40|660|
23|Sabah (Yaşam)|<https://www.sabah.com.tr/rss/yasam.xml>|200|02/24/2026|valid|40|660|
24|Sabah (Dünya)|<https://www.sabah.com.tr/rss/dunya.xml>|200|02/24/2026|valid|40|660|
25|Sabah (Teknoloji)|<https://www.sabah.com.tr/rss/teknoloji.xml>|200|02/24/2026|valid|0|0|
26|Sabah (Turizm)|<https://www.sabah.com.tr/rss/turizm.xml>|200|02/24/2026|valid|0|0|
27|Sabah (Otomobil)|<https://www.sabah.com.tr/rss/otomobil.xml>|200|02/24/2026|valid|0|0|
28|CNN Türk (All / News)|<https://www.cnnturk.com/feed/rss/all/news>|200|02/24/2026|valid|140|2310|
29|CNN Türk (Türkiye / News)|<https://www.cnnturk.com/feed/rss/turkiye/news>|200|02/24/2026|valid|140|2310|
30|CNN Türk (Dünya / News)|<https://www.cnnturk.com/feed/rss/dunya/news>|200|02/24/2026|valid|140|2310|
31|CNN Türk (Ekonomi / News)|<https://www.cnnturk.com/feed/rss/ekonomi/news>|200|02/24/2026|valid|140|2310|
32|CNN Türk (Bilim-Teknoloji / News)|<https://www.cnnturk.com/feed/rss/bilim-teknoloji/news>|200|02/24/2026|valid|0|0|
33|CNN Türk (Spor / News)|<https://www.cnnturk.com/feed/rss/spor/news>|200|02/24/2026|valid|140|2310|
34|CNN Türk (Sağlık / News)|<https://www.cnnturk.com/feed/rss/saglik/news>|200|02/24/2026|valid|140|2310|
35|TRT Haber (Son Dakika)|<http://www.trthaber.com/sondakika.rss>|200|02/24/2026|valid|200|3300|
36|Habertürk (Main)|<http://www.haberturk.com/rss>|200|02/24/2026|valid|400|6600|
37|Dünya (Main)|<https://www.dunya.com/rss?dunya>|200|02/24/2026|valid|100|1650|
38|BBC Türkçe|<https://feeds.bbci.co.uk/turkce/rss.xml>|200|02/24/2026|valid|80|1340|

### Saudi Arabia (SA)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Okaz|<https://www.okaz.com.sa/rss/news>|200|02/24/2026|valid|0|0|
2|Al Jazirah|<https://www.aljazeera.net/rss>|200|02/24/2026|valid|100|1675|
3|Al Madina|<https://www.al-madina.com/rssFeed/193>|200|02/24/2026|valid|250|3350|
4|Al Bilad Daily|<https://albiladdaily.com/feed>|200|02/24/2026|valid|40|650|
5|Makkah Newspaper|<https://makkahnewspaper.com/rssFeed/0>|200|02/24/2026|valid|200|3300|
6|Al Jazirah|<https://www.al-jazirah.com/rss/ln.xml>|200|02/24/2026|valid|50|814|
7|Al Arabiya (EN - Business)|<https://english.alarabiya.net/feed/business>|Recovered via sitemap|02/24/2026|valid|0|0|
8|Al Arabiya (EN - Middle East)|<https://english.alarabiya.net/feed/middle-east>|Recovered via sitemap|02/24/2026|valid|0|0|
9|Asharq Business (Bloomberg Arabic)|<https://asharqbusiness.com/feed>|403 (HTTP_403)|02/24/2026|invalid|0|0|
10|Gulf Business (Saudi Section)|<https://gulfbusiness.com/region/saudi-arabia/feed/>|200 (HTML_RETURNED)|02/24/2026|invalid|0|0|
11|Saudi Gazette (Business)|<https://saudigazette.com.sa/rss/3>|200|02/24/2026|valid|0|0|
12|Zawya (Middle East Business 1위 - EN)|<https://www.zawya.com/en/rss>|Recovered via sitemap|02/24/2026|valid|0|0|
13|Arab News|<https://www.arabnews.com/rss.xml>|403 (HTTP_403)|02/24/2026|invalid|0|0|
14|Al Eqtisadiah (Economy - Arabic)|<https://www.aleqt.com/feed>|Recovered via sitemap|02/24/2026|valid|0|0|
15|Saudi Press Agency (Arabic)|<https://www.spa.gov.sa/rss>|Recovered via sitemap|02/24/2026|valid|0|0|
16|Al Riyadh (Main - Arabic)|<https://www.alriyadh.com/rss>|ERR (TLS)|02/24/2026|invalid|0|0|
17|Al Arabiya (Business - Arabic)|<https://www.alarabiya.net/feed/business>|Recovered via sitemap|02/24/2026|valid|0|0|

### Taiwan (TW)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Liberty Times - Business|<https://news.ltn.com.tw/rss/business.xml>|200|02/24/2026|valid|160|2680|
2|TechNews Taiwan|<https://technews.tw/feed/>|200|02/24/2026|valid|160|2680|
3|CNA (Central News Agency)|<https://feeds.feedburner.com/cnaFirstNews>|200|02/24/2026|valid|24|402|
4|Formosa Reporter|<https://www.formosapost.com/feed/>|200|02/24/2026|valid|40|660|
5|CNA 政治|<https://feeds.feedburner.com/rsscna/politics>|200|02/24/2026|valid|80|1320|
6|CNA 國際|<https://feeds.feedburner.com/rsscna/intworld>|200|02/24/2026|valid|80|1320|
7|CNA 兩岸|<https://feeds.feedburner.com/rsscna/mainland>|200|02/24/2026|valid|80|1320|
8|CNA 產經證券|<https://feeds.feedburner.com/rsscna/finance>|200|02/24/2026|valid|80|1320|
9|CNA 科技|<https://feeds.feedburner.com/rsscna/technology>|200|02/24/2026|valid|80|1320|
10|CNA 生活|<https://feeds.feedburner.com/rsscna/lifehealth>|200|02/24/2026|valid|80|1320|
11|CNA 社會|<https://feeds.feedburner.com/rsscna/social>|200|02/24/2026|valid|80|1320|
12|CNA 地方|<https://feeds.feedburner.com/rsscna/local>|200|02/24/2026|valid|80|1320|
13|CNA 文化|<https://feeds.feedburner.com/rsscna/culture>|200|02/24/2026|valid|80|1320|
14|CNA 運動|<https://feeds.feedburner.com/rsscna/sport>|200|02/24/2026|valid|80|1320|
15|CNA 娛樂|<https://feeds.feedburner.com/rsscna/stars>|200|02/24/2026|valid|80|1320|
16|Liberty Times 即時|<https://news.ltn.com.tw/rss/all.xml>|200|02/24/2026|valid|160|2640|
17|Liberty Times 政治|<https://news.ltn.com.tw/rss/politics.xml>|200|02/24/2026|valid|160|2600|
18|Liberty Times 社會|<https://news.ltn.com.tw/rss/society.xml>|200|02/24/2026|valid|160|2600|
19|Liberty Times 生活|<https://news.ltn.com.tw/rss/life.xml>|200|02/24/2026|valid|160|2640|
20|Liberty Times 評論|<https://news.ltn.com.tw/rss/opinion.xml>|200|02/24/2026|valid|160|2640|
21|Liberty Times 國際|<https://news.ltn.com.tw/rss/world.xml>|200|02/24/2026|valid|160|2640|
22|Liberty Times 體育|<https://news.ltn.com.tw/rss/sports.xml>|200|02/24/2026|valid|160|2640|
23|Liberty Times 娛樂|<https://news.ltn.com.tw/rss/entertainment.xml>|200|02/24/2026|valid|160|2600|
24|Liberty Times 藝文|<https://news.ltn.com.tw/rss/art.xml>|200|02/24/2026|valid|160|2600|
25|Liberty Times 軍武|<https://news.ltn.com.tw/rss/def.xml>|200|02/24/2026|valid|160|2600|
26|Liberty Times 地方|<https://news.ltn.com.tw/rss/local.xml>|200|02/24/2026|valid|160|2600|
27|Liberty Times 蒐奇|<https://news.ltn.com.tw/rss/novelty.xml>|200|02/24/2026|valid|160|2640|
28|Taipei Times (EN)|<https://www.taipeitimes.com/xml/index.rss>|200|02/24/2026|valid|0|0|
29|The Reporter|<https://www.twreporter.org/a/rss2.xml>|200|02/24/2026|valid|40|660|
30|Newtalk 全部|<https://newtalk.tw/rss/all/>|200|02/24/2026|valid|400|6600|
31|Newtalk 政治|<https://newtalk.tw/rss/category/2>|200|02/24/2026|valid|400|6600|
32|Youth Daily News 軍聞|<https://www.ydn.com.tw/tw/Home/RSS.aspx?TID=2>|200|02/24/2026|valid|72|1153|

### Poland (PL)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Onet|<https://wiadomosci.onet.pl/rss>|200|02/24/2026|valid|80|1340|
2|TVN24|<https://tvn24.pl/tvnmeteo.xml>|200|02/24/2026|valid|128|2112|
3|Fakt|<https://www.fakt.pl/rss/>|200|02/24/2026|valid|80|3025|
4|Wprost|<https://www.wprost.pl/rss/>|200|02/24/2026|valid|241|4526|
5|RMF24 (Main)|<https://www.rmf24.pl/feed>|200|02/24/2026|valid|60|990|
6|RMF24 Fakty|<https://www.rmf24.pl/fakty/feed>|200|02/24/2026|valid|200|3300|
7|RMF24 Polska|<https://www.rmf24.pl/fakty/polska/feed>|200|02/24/2026|valid|200|3300|
8|RMF24 Polityka|<https://www.rmf24.pl/fakty/polityka/feed>|200|02/24/2026|valid|200|3300|
9|RMF24 Świat|<https://www.rmf24.pl/fakty/swiat/feed>|200|02/24/2026|valid|200|3300|
10|RMF24 Ekonomia|<https://www.rmf24.pl/ekonomia/feed>|200|02/24/2026|valid|200|3300|
11|RMF24 Nauka|<https://www.rmf24.pl/nauka/feed>|200|02/24/2026|valid|200|3300|
12|RMF24 Kultura|<https://www.rmf24.pl/kultura/feed>|200|02/24/2026|valid|200|3300|
13|RMF24 Sport|<https://www.rmf24.pl/sport/feed>|200|02/24/2026|valid|200|3300|
14|RMF24 Ciekawostki|<https://www.rmf24.pl/rozrywka/ciekawostki/feed>|200|02/24/2026|valid|200|3300|
15|RMF24 Komentarze|<https://www.rmf24.pl/tylko-w-rmf24/komentarze/feed>|200|02/24/2026|valid|200|3300|
16|RMF24 Podsumowanie dnia|<https://www.rmf24.pl/fakty/podsumowanie-dnia/feed>|200|02/24/2026|valid|200|3300|
17|PolsatNews Wszystkie|<https://www.polsatnews.pl/rss/wszystkie.xml>|200|02/24/2026|valid|200|3300|
18|PolsatNews Polska|<https://www.polsatnews.pl/rss/polska.xml>|200|02/24/2026|valid|200|3300|
19|PolsatNews Świat|<https://www.polsatnews.pl/rss/swiat.xml>|200|02/24/2026|valid|200|3300|
20|PolsatNews Wideo|<https://www.polsatnews.pl/rss/wideo.xml>|200|02/24/2026|valid|200|3300|
21|PolsatNews Biznes|<https://www.polsatnews.pl/rss/biznes.xml>|200|02/24/2026|valid|200|3300|
22|PolsatNews Technologie|<https://www.polsatnews.pl/rss/technologie.xml>|200|02/24/2026|valid|200|3300|
23|PolsatNews Moto|<https://www.polsatnews.pl/rss/moto.xml>|200|02/24/2026|valid|200|3300|
24|PolsatNews Kultura|<https://www.polsatnews.pl/rss/kultura.xml>|200|02/24/2026|valid|200|3300|
25|PolsatNews Sport|<https://www.polsatnews.pl/rss/sport.xml>|200|02/24/2026|valid|200|3300|
26|PolsatNews Czysta Polska|<https://www.polsatnews.pl/rss/czysta-polska.xml>|200|02/24/2026|valid|200|3300|
27|Nauka w Polsce (All)|<https://naukawpolsce.pl/all/rss.xml>|200|02/24/2026|valid|40|660|
28|Nauka w Polsce (Science categories)|<https://naukawpolsce.pl/naukowy/rss.xml>|200|02/24/2026|valid|40|660|
29|Nauka w Polsce (Technologia)|<https://naukawpolsce.pl/technologia/rss.xml>|200|02/24/2026|valid|40|660|
30|Nauka w Polsce (Blog)|<https://naukawpolsce.pl/blog/rss.xml>|200|02/24/2026|valid|40|660|
31|PAP MediaRoom (All)|<https://pap-mediaroom.pl/rss.xml>|200|02/24/2026|valid|10|172|
32|PAP MediaRoom (Biznes i finanse)|<https://pap-mediaroom.pl/kategoria/biznes-i-finanse/rss.xml>|200|02/24/2026|valid|40|260|
33|PAP MediaRoom (Nauka i technologie)|<https://pap-mediaroom.pl/kategoria/nauka-i-technologie/rss.xml>|200|02/24/2026|valid|40|260|
34|PAP MediaRoom (Kalendarium)|<https://pap-mediaroom.pl/kalendarium/rss.xml>|200|02/24/2026|valid|40|660|

### Sweden (SE)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Dagens Nyheter|<https://www.dn.se/nyheter/rss/>|200|02/24/2026|valid|480|7864|
2|Dagens Industri|<https://www.di.se/rss/>|200|02/24/2026|valid|80|1340|
3|SVT Nyheter|<https://www.svt.se/nyheter/rss.xml>|200|02/24/2026|valid|80|1340|
4|Göteborgs-Posten|<https://www.gp.se/rss>|200|02/24/2026|valid|105|4208|
5|Sveriges Television|<https://www.svt.se/nyheter/ekonomi/rss.xml>|200|02/24/2026|valid|80|1340|
6|Svt|<https://www.svt.se/nyheter/rss.xml?sectionId=2>|200|02/24/2026|valid|80|1340|
7|Dagens Nyheter Sport|<https://www.dn.se/sport/rss>|200|02/24/2026|valid|400|6700|
8|Dagens Nyheter Business|<https://www.dn.se/ekonomi/rss>|200|02/24/2026|valid|416|6936|
9|Norran|<https://www.norran.se/rss>|200|02/24/2026|valid|120|2010|
10|Aftonbladet - Nyheter (All)|<https://rss.aftonbladet.se/rss2/small/pages/sections/senastenytt/>|200|02/24/2026|valid|136|2176|
11|Aftonbladet - Sportbladet|<https://rss.aftonbladet.se/rss2/small/pages/sections/senastenytt/sport/>|200|02/24/2026|valid|140|2240|
12|Aftonbladet - Sportbladet Fotboll|<https://rss.aftonbladet.se/rss2/small/pages/sections/sportbladet/fotboll/>|200|02/24/2026|valid|140|2240|
13|Aftonbladet - Sportbladet Hockey|<https://rss.aftonbladet.se/rss2/small/pages/sections/sportbladet/hockey/>|200|02/24/2026|valid|140|2240|
14|Aftonbladet - Nöjesbladet|<https://rss.aftonbladet.se/rss2/small/pages/sections/nojesbladet/>|200|02/24/2026|valid|185|2881|
15|Aftonbladet - Kultur|<https://rss.aftonbladet.se/rss2/small/pages/sections/kultur/>|200|02/24/2026|valid|140|2240|
16|Expressen - Nyheter|<https://feeds.expressen.se/nyheter/>|200|02/24/2026|valid|80|1280|
17|GT - Nyheter|<https://feeds.expressen.se/gt/>|200|02/24/2026|valid|80|1280|
18|Svenska Dagbladet - Frontpage|<https://www.svd.se/?service=rss>|200|02/24/2026|valid|120|1920|
19|The Local Sweden (EN)|<https://feeds.thelocal.com/rss/se>|200|02/24/2026|valid|80|1280|
20|Sveriges Radio - Ekot nyhetssändning (pod)|<https://api.sr.se/api/rss/pod/3795>|200|02/24/2026|valid|480|7680|
21|Sveriges Radio - P3 Nyheter på en minut (pod)|<https://api.sr.se/api/rss/pod/22376>|200|02/24/2026|valid|480|7680|
22|Sveriges Radio - Radio Sweden på lätt svenska (program)|<https://api.sr.se/api/rss/program/4916?format=1>|200|02/24/2026|valid|80|1280|
23|Radio Sweden - Sweden Today (podcast xml)|<http://sverigesradio.se/Podradio/xml/SRI_en_sweToday.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
24|Proletären|<https://proletaren.se/rss.xml>|200|02/24/2026|valid|40|716|
25|SVT Lokal - Sydnytt|<http://svt.se/nyheter/regionalt/sydnytt/rss.xml>|200|02/24/2026|valid|80|1280|
26|SVT Lokal - Blekingenytt|<http://svt.se/nyheter/regionalt/blekingenytt/rss.xml>|200|02/24/2026|valid|80|1280|
27|SVT Lokal - Mittnytt|<http://svt.se/nyheter/regionalt/mittnytt/rss.xml>|200|02/24/2026|valid|80|1280|
28|SVT Lokal - Jämtlandsnytt|<http://svt.se/nyheter/regionalt/jamtlandsnytt/rss.xml>|200|02/24/2026|valid|80|1280|
29|Sydsvenskan (fallback)|<https://www.sydsvenskan.se/feeds/feed.xml>|200|02/24/2026|valid|176|2811|
30|Nerikes Allehanda (fallback)|<https://www.na.se/feeds/feed.xml>|200|02/24/2026|valid|196|3165|

### Belgium (BE)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|De Morgen|<https://www.demorgen.be/rss.xml>|200|02/24/2026|valid|80|1340|
2|La Libre|<https://www.lalibre.be/arc/outboundfeeds/rss/section/belgique/?outputType=xml>|200|02/24/2026|valid|400|6700|
3|Knack|<https://www.knack.be/feed/>|200|02/24/2026|valid|200|3350|
4|VRT News|<https://www.vrt.be/vrtnws/nl.rss.articles.xml>|200|02/24/2026|valid|200|3150|
5|La Dernière Heure|<https://www.dhnet.be/rss.xml>|200|02/24/2026|valid|400|6700|
6|Le Vif|<https://www.levif.be/feed/>|200|02/24/2026|valid|150|3300|
7|RTBF|<https://rss.rtbf.be/article/rss/highlight_rtbf_info.xml?source=internal>|200|02/24/2026|valid|80|1340|
8|Het Nieuwsblad|<https://www.nieuwsblad.be/rss/>|200|02/24/2026|valid|200|3350|
9|La Libre Belgique|<https://www.lalibre.be/rss/>|200|02/24/2026|valid|400|6700|
10|La Libre|<https://www.lalibre.be/rss>|200|02/24/2026|valid|400|6700|
11|The Bulletin (EN)|<https://www.thebulletin.be/rss.xml>|200|02/24/2026|valid|40|640|
12|HLN (Het Laatste Nieuws)|<https://www.hln.be/home/rss.xml>|200|02/24/2026|valid|120|1920|
13|Brussels Morning|<https://brusselsmorning.com/feed>|200|02/24/2026|valid|200|3100|
14|L'Echo|<https://www.lecho.be/rss/top_stories.xml>|200|02/24/2026|valid|40|640|
15|De Standaard (example section)|<https://www.standaard.be/rss/section/1f2838d4-99ea-49f0-9102-138784c7ea7c>|Recovered via sitemap|02/24/2026|valid|0|0|
16|Het Nieuwsblad (example section)|<https://www.nieuwsblad.be/rss/section/55178e67-15a8-4ddd-a3d8-bfe5708f8932>|Recovered via sitemap|02/24/2026|valid|0|0|
17|Le Soir (main)|<https://www.lesoir.be/rss2/9/cible_principale>|403 (HTTP_403)|02/24/2026|invalid|0|310|
18|Brussels Times|<https://www.brusselstimes.com/rss-feed>|Recovered via sitemap|02/24/2026|valid|0|0|
19|City of Brussels (official)|<https://www.brussels.be/rss.xml>|200|02/24/2026|valid|40|640|

### Thailand (TH)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|The Thaiger|<https://thethaiger.com/feed>|200|02/24/2026|valid|40|670|
2|Khaosod English|<https://www.khaosodenglish.com/rss>|200|02/24/2026|valid|15|125|
3|Matichon|<https://www.matichon.co.th/rss>|200|02/24/2026|valid|150|2900|
4|Prachachat|<https://prachachat.net/feed/>|200|02/24/2026|valid|90|750|
5|Daily News|<https://www.dailynews.co.th/rss>|200|02/24/2026|valid|0|0|
6|Prachatai English (Feedburner)|<http://feeds.feedburner.com/prachataienglish>|200|02/24/2026|valid|40|660|
7|Thai PBS (news feed endpoint)|<https://news.thaipbs.or.th/rss/news>|200|02/24/2026|valid|80|1320|
8|Thairath (News)|<http://www.thairath.co.th/rss/news.xml>|Recovered via sitemap|02/24/2026|valid|0|303|
9|Thairath (Sport)|<http://www.thairath.co.th/rss/sport.xml>|Recovered via sitemap|02/24/2026|valid|0|303|
10|Sanook - Hot News|<http://rssfeeds.sanook.com/rss/feeds/sanook/hot.news.xml>|200|02/24/2026|valid|80|1320|
11|Sanook - Daily News|<http://rssfeeds.sanook.com/rss/feeds/sanook/news.index.xml>|200|02/24/2026|valid|80|1320|
12|Sanook - Politics|<http://rssfeeds.sanook.com/rss/feeds/sanook/news.politic.xml>|200|02/24/2026|valid|80|1320|
13|Sanook - Crime|<http://rssfeeds.sanook.com/rss/feeds/sanook/news.crime.xml>|200|02/24/2026|valid|80|1320|
14|Sanook - World|<http://rssfeeds.sanook.com/rss/feeds/sanook/news.world.xml>|200|02/24/2026|valid|80|1320|
15|Sanook - Economy|<http://rssfeeds.sanook.com/rss/feeds/sanook/news.economic.xml>|200|02/24/2026|valid|40|660|
16|Sanook - Tech (News)|<http://rssfeeds.sanook.com/rss/feeds/sanook/hitech.news.xml>|200|02/24/2026|valid|80|1320|
17|Sanook - Tech (Computer)|<http://rssfeeds.sanook.com/rss/feeds/sanook/hitech.computer.index.xml>|200|02/24/2026|valid|80|1320|
18|Sanook - Tech (Mobile)|<http://rssfeeds.sanook.com/rss/feeds/sanook/hitech.mobile.index.xml>|200|02/24/2026|valid|80|1320|
19|Sanook - Travel|<http://rssfeeds.sanook.com/rss/feeds/sanook/travel.index.xml>|200|02/24/2026|valid|40|660|
20|Sanook - Movies|<http://rssfeeds.sanook.com/rss/feeds/sanook/movie.news.xml>|200|02/24/2026|valid|80|1320|
21|PressDisplay - Bangkok Post|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=1264>|200|02/24/2026|valid|24|75|
22|PressDisplay - Daily News Thailand|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=4863>|200|02/24/2026|valid|0|0|
23|PressDisplay - Krungthep Turakij|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=5261&type=full>|200|02/24/2026|valid|0|0|
24|PressDisplay - The Phuket News|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=eff9&type=full>|200|02/24/2026|valid|132|858|
25|PressDisplay - Novosti Phuketa|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=9wv3&type=full>|200|02/24/2026|valid|104|676|
26|PressDisplay - Window On Phuket|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=9wv4&type=full>|200|02/24/2026|valid|0|0|
27|PressDisplay - Where to Eat in Phuket|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=9wv5&type=full>|200|02/24/2026|valid|0|0|
28|PressDisplay - Prestige (Thailand)|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=9vw7&type=full>|200|02/24/2026|valid|244|1586|
29|PressDisplay - Hello! (Thailand)|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=9vw6&type=full>|200|02/24/2026|valid|188|1222|
30|Khaosod English - Food (category)|<http://www.khaosodenglish.com/category/life/food/feed>|200|02/24/2026|valid|15|125|

### Iran (IR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|IRNA|<https://www.irna.ir/rss>|200|02/24/2026|valid|90|1710|
2|Mehr News|<https://www.mehrnews.com/rss>|200|02/24/2026|valid|120|1860|
3|ILNA|<https://www.ilna.news/rss>|200|02/24/2026|valid|120|1950|
4|Khabar Online|<https://www.khabaronline.ir/rss>|200|02/24/2026|valid|120|1980|
5|Iran International|<https://www.iranintl.com/feed>|200|02/24/2026|valid|400|6700|
6|ILNA|<https://www.ilna.ir/rss>|200|02/24/2026|valid|120|1980|
7|Tejarat News|<https://www.tejaratnews.com/rss>|200|02/24/2026|valid|400|6500|
8|Tehran Times - Latest|<https://www.tehrantimes.com/rss>|ERR (HTTP_REDIRECT_LOOP)|02/24/2026|invalid|0|0|
9|Tehran Times - Homepage|<https://www.tehrantimes.com/rss-homepage>|ERR (HTTP_REDIRECT_LOOP)|02/24/2026|invalid|0|0|
10|Tehran Times - Breaking|<https://www.tehrantimes.com/rss/pl/617>|ERR (HTTP_REDIRECT_LOOP)|02/24/2026|invalid|0|0|
11|Tehran Times - Society|<https://www.tehrantimes.com/rss/tp/696>|ERR (HTTP_REDIRECT_LOOP)|02/24/2026|invalid|0|0|
12|Tehran Times - Economy|<https://www.tehrantimes.com/rss/tp/697>|ERR (HTTP_REDIRECT_LOOP)|02/24/2026|invalid|0|0|
13|Tehran Times - Politics|<https://www.tehrantimes.com/rss/tp/698>|ERR (HTTP_REDIRECT_LOOP)|02/24/2026|invalid|0|0|
14|Tehran Times - Sports|<https://www.tehrantimes.com/rss/tp/699>|ERR (HTTP_REDIRECT_LOOP)|02/24/2026|invalid|0|0|
15|Tehran Times - Culture|<https://www.tehrantimes.com/rss/tp/700>|ERR (HTTP_REDIRECT_LOOP)|02/24/2026|invalid|0|0|
16|Tehran Times - International|<https://www.tehrantimes.com/rss/tp/702>|ERR (HTTP_REDIRECT_LOOP)|02/24/2026|invalid|0|0|
17|Tehran Times - Multimedia|<https://www.tehrantimes.com/rss/tp/717>|ERR (HTTP_REDIRECT_LOOP)|02/24/2026|invalid|0|0|
18|Tehran Times - Tourism|<https://www.tehrantimes.com/rss/tp/807>|ERR (HTTP_REDIRECT_LOOP)|02/24/2026|invalid|0|0|
19|MehrNews (EN) - Latest|<https://en.mehrnews.com/rss/pl/118>|200|02/24/2026|valid|120|1830|
20|MehrNews (EN) - Iran|<https://en.mehrnews.com/rss/tp/575>|200|02/24/2026|valid|120|1830|
21|MehrNews (EN) - Iran > Iran|<https://en.mehrnews.com/rss/tp/905>|200|02/24/2026|valid|90|1800|
22|MehrNews (EN) - Ethnic Groups|<https://en.mehrnews.com/rss/tp/897>|200|02/24/2026|valid|0|0|
23|MehrNews (EN) - Nature|<https://en.mehrnews.com/rss/tp/898>|200|02/24/2026|valid|20|293|
24|MehrNews (EN) - Historical Sites|<https://en.mehrnews.com/rss/tp/899>|200|02/24/2026|valid|0|0|
25|MehrNews (EN) - Souvenirs|<https://en.mehrnews.com/rss/tp/900>|200|02/24/2026|valid|0|0|
26|MehrNews (EN) - Persian Cuisine|<https://en.mehrnews.com/rss/tp/901>|200|02/24/2026|valid|8|83|
27|ISNA (EN) - Social|<https://en.isna.ir/rss/tp/8>|200 (HTML_RETURNED)|02/24/2026|invalid|0|0|
28|ISNA (EN) - Economy|<https://en.isna.ir/rss/tp/33>|200 (HTML_RETURNED)|02/24/2026|invalid|0|0|
29|ISNA (EN) - Politics|<https://en.isna.ir/rss/tp/13>|200 (HTML_RETURNED)|02/24/2026|invalid|0|0|
30|ISNA (EN) - Culture & Art|<https://en.isna.ir/rss/tp/19>|200 (HTML_RETURNED)|02/24/2026|invalid|0|0|
31|ISNA (EN) - Sports|<https://en.isna.ir/rss/tp/23>|200 (HTML_RETURNED)|02/24/2026|invalid|0|0|
32|ISNA (EN) - Photos|<https://en.isna.ir/rss/tp/27>|200 (HTML_RETURNED)|02/24/2026|invalid|0|0|
33|Tasnim (EN) - Top Stories|<https://www.tasnimnews.ir/en/rss/feed/0/0/8/1/TopStories>|200|02/24/2026|valid|100|1650|
34|Tasnim (EN) - All Stories|<https://www.tasnimnews.ir/en/rss/feed/0/0/0/0/AllStories>|200|02/24/2026|valid|0|594|
35|Tasnim (EN) - Politics|<https://www.tasnimnews.ir/en/rss/feeds/1192/0/0/0>|200|02/24/2026|valid|0|188|
36|Tasnim (EN) - Economy|<https://www.tasnimnews.ir/en/rss/feeds/1193/0/0/0>|200|02/24/2026|valid|0|3|
37|Tasnim (EN) - World|<https://www.tasnimnews.ir/en/rss/feeds/1194/0/0/0>|200|02/24/2026|valid|0|102|

### Argentina (AR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Ámbito - Portada|<https://www.ambito.com/rss/pages/home.xml>|200|02/24/2026|valid|80|1400|
2|Ámbito - Últimas noticias|<https://www.ambito.com/rss/pages/ultimas-noticias.xml>|200|02/24/2026|valid|60|1028|
3|Ámbito - Economía|<https://www.ambito.com/rss/pages/economia.xml>|200|02/24/2026|valid|80|1718|
4|Ámbito - Finanzas|<https://www.ambito.com/rss/pages/finanzas.xml>|200|02/24/2026|valid|80|2268|
5|Ámbito - Negocios|<https://www.ambito.com/rss/pages/negocios.xml>|200|02/24/2026|valid|80|1400|
6|Ámbito - Política|<https://www.ambito.com/rss/pages/politica.xml>|200|02/24/2026|valid|80|1650|
7|Ámbito - Nacional|<https://www.ambito.com/rss/pages/nacional.xml>|200|02/24/2026|valid|80|1400|
8|Ámbito - Mundo|<https://www.ambito.com/rss/pages/mundo.xml>|200|02/24/2026|valid|400|4429|
9|Ámbito - Lifestyle|<https://www.ambito.com/rss/pages/lifestyle.xml>|200|02/24/2026|valid|80|1480|
10|Ámbito - Deportes|<https://www.ambito.com/rss/pages/deportes.xml>|200|02/24/2026|valid|80|1880|
11|Ámbito - Tecnología|<https://www.ambito.com/rss/pages/tecnologia.xml>|200|02/24/2026|valid|80|1400|
12|Ámbito - Autos|<https://www.ambito.com/rss/pages/autos.xml>|200|02/24/2026|valid|80|1400|
13|Ámbito - Edición impresa|<https://www.ambito.com/rss/pages/edicion-impresa.xml>|200|02/24/2026|valid|80|1400|
14|Página/12 - Portada|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/portada>|200|02/24/2026|valid|24|420|
15|Página/12 - Edición impresa|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/edicion-impresa>|200|02/24/2026|valid|86|3225|
16|Página/12 - El País|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/el-pais/notas>|200|02/24/2026|valid|100|1750|
17|Página/12 - Economía|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/economia/notas>|200|02/24/2026|valid|100|1750|
18|Página/12 - Sociedad|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/sociedad/notas>|200|02/24/2026|valid|100|1750|
19|Página/12 - El Mundo|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/el-mundo/notas>|200|02/24/2026|valid|100|1750|
20|Página/12 - Deportes|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/deportes/notas>|200|02/24/2026|valid|100|1750|
21|Página/12 - Ciencia|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/ciencia/notas>|200|02/24/2026|valid|100|1750|
22|Página/12 - Psicología|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/psicologia/notas>|200|02/24/2026|valid|100|1750|
23|Página/12 - Cartas de Lectores|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/cartas-de-lectores/notas>|200|02/24/2026|valid|0|0|
24|Página/12 - Cash|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/suplementos/cash/notas>|200|02/24/2026|valid|100|1750|
25|Página/12 - Las 12|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/suplementos/las12/notas>|200|02/24/2026|valid|100|1750|
26|Página/12 - Radar|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/suplementos/radar/notas>|200|02/24/2026|valid|100|1750|
27|Página/12 - Turismo|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/suplementos/turismo/notas>|200|02/24/2026|valid|0|0|
28|LA NACION - General|<https://www.lanacion.com.ar/arc/outboundfeeds/rss/?outputType=xml>|200|02/24/2026|valid|400|6993|
29|El Cronista - Noticias|<https://www.cronista.com/files/rss/news.xml>|200|02/24/2026|valid|236|4388|
30|Clarín - Ultimo Momento (속보)|<https://www.clarin.com/rss/lo-ultimo/>|200|02/24/2026|valid|40|360|
31|Clarín - Economía|<https://www.clarin.com/rss/economia/>|200|02/24/2026|valid|40|360|
32|Clarín - Política|<https://www.clarin.com/rss/politica/>|200|02/24/2026|valid|40|360|
33|La Nación - Economía|<https://www.lanacion.com.ar/arc/outboundfeeds/rss/?outputType=xml&rotation=economia>|200|02/24/2026|valid|400|3600|
34|La Nación - Política|<https://www.lanacion.com.ar/arc/outboundfeeds/rss/?outputType=xml&rotation=politica>|200|02/24/2026|valid|400|3600|
35|Infobae - Argentina|<https://www.infobae.com/feeds/rss/argentina/>|Recovered via sitemap|02/24/2026|valid|0|0|
36|Infobae - Economía|<https://www.infobae.com/feeds/rss/economia/>|Recovered via sitemap|02/24/2026|valid|0|0|
37|El Cronista - Finanzas|<https://www.cronista.com/files/rss/finanzas_markets.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
38|El Cronista - Economía|<https://www.cronista.com/files/rss/economia_politica.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
39|Rosario3 - Home|<https://www.rosario3.com/rss/feed.xml>|200|02/24/2026|valid|150|400|

### Chile (CL)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Diario Financiero|<https://www.df.cl/noticias/site/list/port/rss.xml>|200|02/24/2026|valid|250|3550|
2|The Clinic|<https://www.theclinic.cl/feed/>|200|02/24/2026|valid|40|690|
3|El Rancagüino|<https://www.elrancaguino.cl/feed/>|200|02/24/2026|valid|40|680|
4|Cambio21|<https://cambio21.cl/rss>|200|02/24/2026|valid|400|7000|
5|La Discusión|<https://ladiscusion.cl/feed/>|200|02/24/2026|valid|40|700|
6|La Nación (Chile)|<https://www.lanacion.cl/feed>|200|02/24/2026|valid|40|700|
7|El Siglo|<https://elsiglo.cl/feed>|200|02/24/2026|valid|40|700|
8|The Santiago Times|<https://santiagotimes.cl/feed>|200|02/24/2026|valid|40|680|
9|Infoweek|<https://infoweek.biz/feed>|200|02/24/2026|valid|0|0|
10|El Desconcierto|<https://www.eldesconcierto.cl/feed/>|200|02/24/2026|valid|100|4500|
11|La Prensa Austral|<https://laprensaaustral.cl/feed/>|200|02/24/2026|valid|40|700|
12|CIPER Chile|<https://www.ciperchile.cl/feed/>|200|02/24/2026|valid|64|1120|
13|Radio Universidad de Chile|<https://radio.uchile.cl/feed/>|200|02/24/2026|valid|120|2040|
14|La Tercera - Home|<https://www.latercera.com/arc/outboundfeeds/rss/?outputType=xml>|200|02/24/2026|valid|400|3600|
15|Pulso (La Tercera Biz)|<https://www.latercera.com/arc/outboundfeeds/rss/?outputType=xml&rotation=pulso>|200|02/24/2026|valid|400|3600|
16|Emol - Nacional|<https://www.emol.com/rss/rss_nacional.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
17|Emol - Economía|<https://www.emol.com/rss/rss_economia.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
18|BioBioChile - Home|<https://www.biobiochile.cl/feed>|Recovered via sitemap|02/24/2026|valid|0|0|
19|Cooperativa - Economía|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_5___1.xml>|200|02/24/2026|valid|60|540|
20|Cooperativa - País|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_3___1.xml>|200|02/24/2026|valid|45|120|
21|Cooperativa - País (모바일)|<https://m.cooperativa.cl/noticias/site/tax/port/all/rss_3___1.xml>|200|02/24/2026|valid|45|120|
22|Cooperativa - Deportes|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_1___24.xml>|200|02/24/2026|valid|45|120|
23|Cooperativa - Deportes (모바일)|<https://m.cooperativa.cl/noticias/site/tax/port/all/rss_1___24.xml>|200|02/24/2026|valid|45|120|
24|Cooperativa - Cine|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_4_4__1.xml>|200|02/24/2026|valid|45|120|
25|Cooperativa - Música|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_4_11__1.xml>|200|02/24/2026|valid|45|120|
26|Cooperativa - Banco Central (경제)|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_6_82__1.xml>|200|02/24/2026|valid|45|120|
27|Cooperativa - Banco Central (모바일)|<https://m.cooperativa.cl/noticias/site/tax/port/all/rss_6_82__1.xml>|200|02/24/2026|valid|45|120|
28|Cooperativa - Banco Central (모바일 fid_noticia)|<https://m.cooperativa.cl/noticias/site/tax/port/fid_noticia/rss_6_82__1.xml>|200|02/24/2026|valid|45|120|
29|Cooperativa - Banco Central (오디오)|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_6_82__1.xml>|200|02/24/2026|valid|45|120|
30|Cooperativa - Fútbol|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_1_30__1.xml>|200|02/24/2026|valid|45|120|
31|Cooperativa - Universidad de Chile|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_1_30_332_1.xml>|200|02/24/2026|valid|45|120|
32|Cooperativa - Copa Davis|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_1_58_534_1.xml>|200|02/24/2026|valid|45|120|
33|Cooperativa - Sociedad|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_7_136__1.xml>|200|02/24/2026|valid|45|120|
34|Cooperativa - Genética (Sociedad)|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_7_221_1735_1.xml>|200|02/24/2026|valid|9|24|
35|Cooperativa - Genética (88frases)|<https://88frases.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_7_221_1735_1.xml>|200|02/24/2026|valid|9|15|
36|Cooperativa - Oftalmología (Sociedad)|<https://88frases.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_7_120_1804_1.xml>|200|02/24/2026|valid|24|64|
37|Cooperativa - Donald Trump|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_2_76_2384_1.xml>|200|02/24/2026|valid|45|120|
38|Cooperativa - Argentina|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_2_70__1.xml>|200|02/24/2026|valid|45|120|
39|Cooperativa - Música Chilena|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_4_11_779_1.xml>|200|02/24/2026|valid|45|120|
40|Cooperativa - Cine (오디오)|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_4_4__1.xml>|200|02/24/2026|valid|45|120|
41|Cooperativa - Música (오디오)|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_4_11__1.xml>|200|02/24/2026|valid|45|120|
42|Cooperativa - Venezuela (오디오)|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_3_81_1474_1.xml>|200|02/24/2026|valid|45|120|
43|Reporte Minero|<https://www.reporteminero.cl/feed>|404 (HTTP_404)|02/24/2026|invalid|0|1794|

### Dominican Republic (DO)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Diario Libre - Portada|<https://www.diariolibre.com/rss/portada.xml>|200|02/24/2026|valid|115|2501|
2|Diario Libre - Actualidad|<https://www.diariolibre.com/rss/actualidad.xml>|200|02/24/2026|valid|120|2100|
3|Diario Libre - Política|<https://www.diariolibre.com/rss/politica.xml>|200|02/24/2026|valid|120|2100|
4|Diario Libre - Economía|<https://www.diariolibre.com/rss/economia.xml>|200|02/24/2026|valid|120|2100|
5|Diario Libre - Opinión|<https://www.diariolibre.com/rss/opinion.xml>|200|02/24/2026|valid|120|2100|
6|Diario Libre - Deportes|<https://www.diariolibre.com/rss/deportes.xml>|200|02/24/2026|valid|120|2100|
7|Diario Libre - Mundo|<https://www.diariolibre.com/rss/mundo.xml>|200|02/24/2026|valid|120|2100|
8|Diario Libre - Videos|<https://www.diariolibre.com/rss/videos.xml>|200|02/24/2026|valid|120|2100|
9|Diario Libre - Edición USA|<https://www.diariolibre.com/rss/dl-usa.xml>|200|02/24/2026|valid|120|2100|
10|AlMomento - Portada|<https://almomento.net/feed/>|200|02/24/2026|valid|80|1400|
11|AlMomento - Política|<https://almomento.net/categoria/politica/feed/>|200|02/24/2026|valid|80|1380|
12|AlMomento - Deportes|<https://almomento.net/categoria/deportes/feed/>|200|02/24/2026|valid|80|1380|
13|AlMomento - Económicas|<https://almomento.net/categoria/economicas/feed/>|200|02/24/2026|valid|60|1360|
14|AlMomento - Dominicanos en el Exterior|<https://almomento.net/categoria/dominicanos-en-el-exterior/feed/>|200|02/24/2026|valid|0|0|
15|AlMomento - Internacionales|<https://almomento.net/categoria/internacionales/feed/>|200|02/24/2026|valid|80|1400|
16|AlMomento - Variedades|<https://almomento.net/categoria/variedades/feed/>|200|02/24/2026|valid|60|1360|
17|AlMomento - Opinión|<https://almomento.net/categoria/opinion/feed/>|200|02/24/2026|valid|80|1380|
18|AlMomento - Haití|<https://almomento.net/categoria/haiti/feed/>|200|02/24/2026|valid|80|1380|
19|AlMomento - Provincias|<https://almomento.net/categoria/provincias/feed/>|200|02/24/2026|valid|60|1380|
20|El Nacional|<https://elnacional.com.do/feed/>|200|02/24/2026|valid|90|1065|
21|El Nuevo Diario|<https://elnuevodiario.com.do/feed/>|200|02/24/2026|valid|60|720|
22|Listín Diario - Portada|<https://listindiario.com/rss/portada.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
23|Listín Diario - Economía|<https://listindiario.com/rss/economia.xml>|200|02/24/2026|valid|400|3600|
24|Periódico Hoy|<https://hoy.com.do/feed/>|Recovered via sitemap|02/24/2026|valid|0|0|
25|El Dinero|<https://eldinero.com.do/feed/>|200|02/24/2026|valid|80|720|
26|Acento|<https://acento.com.do/feed/>|Recovered via sitemap|02/24/2026|valid|0|0|
27|Acento - Author Feed|<https://acento.com.do/author/jcastillo/feed/>|Recovered via sitemap|02/24/2026|valid|0|0|
28|Noticias SIN|<https://feeds.feedburner.com/noticiassin1>|200|02/24/2026|valid|30|80|

### Uruguay (UY)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|El Observador - Home|<https://www.elobservador.com.uy/rss/pages/home.xml>|200|02/24/2026|valid|80|1400|
2|El Observador - Último momento|<https://www.elobservador.com.uy/rss/pages/ultimo-momento.xml>|200|02/24/2026|valid|76|1286|
3|El Observador - Mundo|<https://www.elobservador.com.uy/rss/pages/Mundo.xml>|200|02/24/2026|valid|80|1400|
4|El Observador - Nacional|<https://www.elobservador.com.uy/rss/pages/nacional.xml>|200|02/24/2026|valid|80|1400|
5|El Observador - Sociales|<https://www.elobservador.com.uy/rss/pages/sociales.xml>|200|02/24/2026|valid|80|1400|
6|El Observador - Café y Negocios|<https://www.elobservador.com.uy/rss/pages/cafe-y-negocios.xml>|200|02/24/2026|valid|80|1400|
7|El Observador - Agro|<https://www.elobservador.com.uy/rss/pages/Agro.xml>|200|02/24/2026|valid|80|1400|
8|El Observador - Economía y Empresas|<https://www.elobservador.com.uy/rss/pages/economia.xml>|200|02/24/2026|valid|80|1400|
9|El Observador - Opinión|<https://www.elobservador.com.uy/rss/pages/opinion.xml>|200|02/24/2026|valid|80|1400|
10|El Observador - Salud|<https://www.elobservador.com.uy/rss/pages/salud.xml>|200|02/24/2026|valid|80|1400|
11|El Observador - Ciencia y Tecnología|<https://www.elobservador.com.uy/rss/pages/ciencia-y-tecnologia.xml>|200|02/24/2026|valid|80|1400|
12|El Observador - Cultura y Espectáculos|<https://www.elobservador.com.uy/rss/pages/cultura-y-espectaculos.xml>|200|02/24/2026|valid|80|1400|
13|El Observador - Ediciones especiales|<https://www.elobservador.com.uy/rss/pages/ediciones-especiales.xml>|200|02/24/2026|valid|80|1400|
14|El Observador - Referí|<https://www.elobservador.com.uy/rss/pages/referi.xml>|200|02/24/2026|valid|80|1400|
15|El Observador - Running|<https://www.elobservador.com.uy/rss/pages/running.xml>|200|02/24/2026|valid|80|1400|
16|El Observador - Selección|<https://www.elobservador.com.uy/rss/pages/seleccion.xml>|200|02/24/2026|valid|80|1400|
17|El Observador - Rugby|<https://www.elobservador.com.uy/rss/pages/rugby.xml>|200|02/24/2026|valid|80|1400|
18|El Observador - Polideportivo|<https://www.elobservador.com.uy/rss/pages/polideportivo.xml>|200|02/24/2026|valid|80|1400|
19|El Observador - Básquetbol|<https://www.elobservador.com.uy/rss/pages/basquetbol.xml>|200|02/24/2026|valid|80|1400|
20|El Observador - Copa América|<https://www.elobservador.com.uy/rss/pages/copa-america-odl.xml>|200|02/24/2026|valid|80|1400|
21|El Observador - Motor|<https://www.elobservador.com.uy/rss/pages/motor.xml>|200|02/24/2026|valid|80|1400|
22|El Observador - Fútbol internacional|<https://www.elobservador.com.uy/rss/pages/futbol-internacional.xml>|200|02/24/2026|valid|80|1400|
23|El Observador - Fútbol|<https://www.elobservador.com.uy/rss/pages/futbol.xml>|200|02/24/2026|valid|80|1400|
24|El Observador - Copa Libertadores|<https://www.elobservador.com.uy/rss/pages/copa-libertadores.xml>|200|02/24/2026|valid|80|1400|
25|Montevideo Portal - Información destacada|<https://www.montevideo.com.uy/anxml.aspx?58>|200|02/24/2026|valid|204|3417|
26|Montevideo Portal - Noticias|<https://www.montevideo.com.uy/anxml.aspx?59>|200|02/24/2026|valid|32|560|
27|Montevideo Portal - Tiempo Libre|<https://www.montevideo.com.uy/anxml.aspx?60>|200|02/24/2026|valid|32|560|
28|Montevideo Portal - Tecnología|<https://www.montevideo.com.uy/anxml.aspx?133>|200|02/24/2026|valid|24|420|
29|Montevideo Portal - Negocios & Tendencias|<https://www.montevideo.com.uy/anxml.aspx?728>|200|02/24/2026|valid|52|897|
30|Montevideo Portal - Deportes|<https://www.montevideo.com.uy/anxml.aspx?1727>|200|02/24/2026|valid|64|1120|
31|El País - Portada|<https://www.elpais.com.uy/rss>|403 (HTTP_403)|02/24/2026|invalid|80|720|
32|El País - Economía|<https://www.elpais.com.uy/rss/economia-y-mercado>|200|02/24/2026|valid|80|720|
33|Montevideo Portal - Negocios|<https://www.montevideo.com.uy/anxml.aspx?728>|200|02/24/2026|valid|52|468|
34|La Diaria - Política|<https://ladiaria.com.uy/feeds/section/politica/>|Recovered via sitemap|02/24/2026|valid|0|234|
35|La Diaria - Economía|<https://ladiaria.com.uy/feeds/section/economia/>|Recovered via sitemap|02/24/2026|valid|0|234|
36|Subrayado - Home|<https://www.subrayado.com.uy/rss/pages/home.xml>|200|02/24/2026|valid|60|160|
37|Subrayado - Sociedad|<https://www.subrayado.com.uy/rss/pages/sociedad.xml>|200|02/24/2026|valid|60|160|
38|Subrayado - Nacional|<https://www.subrayado.com.uy/rss/pages/nacional.xml>|200|02/24/2026|valid|60|160|
39|Subrayado - Política|<https://www.subrayado.com.uy/rss/pages/politica.xml>|200|02/24/2026|valid|60|160|
40|Subrayado - Policiales|<https://www.subrayado.com.uy/rss/pages/policiales.xml>|200|02/24/2026|valid|60|160|
41|Subrayado - Internacionales|<https://www.subrayado.com.uy/rss/pages/internacionales.xml>|200|02/24/2026|valid|60|160|
42|Subrayado - Opinión|<https://www.subrayado.com.uy/rss/pages/opinion.xml>|200|02/24/2026|valid|60|160|
43|Subrayado - Tecnología e Internet|<https://www.subrayado.com.uy/rss/pages/tecnologia-internet.xml>|200|02/24/2026|valid|60|160|
44|Subrayado - Deportes|<https://www.subrayado.com.uy/rss/pages/deportes.xml>|200|02/24/2026|valid|60|160|
45|Subrayado - Economía|<https://www.subrayado.com.uy/rss/pages/economia.xml>|200|02/24/2026|valid|60|160|

### Austria (AT)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Der Standard|<https://www.derstandard.at/rss>|200|02/24/2026|valid|720|8280|
2|ORF|<https://rss.orf.at/news.xml>|200|02/24/2026|valid|0|0|
3|Die Presse|<https://www.diepresse.com/rss>|200|02/24/2026|valid|318|4936|
4|Tiroler Tageszeitung|<https://www.tt.com/rss/news.xml>|200|02/24/2026|valid|280|4409|
5|ORF Aktuell|<https://rss.orf.at/>|200|02/24/2026|valid|0|240|
6|Kurier (Top News)|<https://kurier.at/xml/rssd>|200|02/24/2026|valid|80|1340|
7|Neue Donau|<https://www.neue.at/feed>|200|02/24/2026|valid|40|660|
8|Der Standard|<https://www.derstandard.at/rss?section=welt>|200|02/24/2026|valid|480|8040|
9|Kleine Zeitung|<https://www.kleinezeitung.at/rss/home>|200|02/24/2026|valid|6|69|
10|Der Standard|<https://www.derstandard.at/rss?output=amp>|200|02/24/2026|valid|480|8040|
11|Der Standard Plus|<https://www.derstandard.at/rss/wirtschaft>|200|02/24/2026|valid|128|2144|
12|derStandard - International|<https://www.derstandard.at/rss/international>|200|02/24/2026|valid|139|2376|
13|derStandard - Inland|<https://www.derstandard.at/rss/inland>|200|02/24/2026|valid|128|2144|
14|derStandard - Web|<https://www.derstandard.at/rss/web>|200|02/24/2026|valid|204|3417|
15|derStandard - Sport|<https://www.derstandard.at/rss/sport>|200|02/24/2026|valid|168|2814|
16|derStandard - Panorama|<https://www.derstandard.at/rss/panorama>|200|02/24/2026|valid|128|2148|
17|derStandard - Etat|<https://www.derstandard.at/rss/etat>|200|02/24/2026|valid|136|2281|
18|derStandard - Kultur|<https://www.derstandard.at/rss/kultur>|200|02/24/2026|valid|140|2345|
19|derStandard - Wissenschaft|<https://www.derstandard.at/rss/wissenschaft>|200|02/24/2026|valid|212|3498|
20|derStandard - Gesundheit|<https://www.derstandard.at/rss/gesundheit>|200|02/24/2026|valid|64|1072|
21|derStandard - Lifestyle|<https://www.derstandard.at/rss/lifestyle>|200|02/24/2026|valid|188|3150|
22|derStandard - Karriere|<https://www.derstandard.at/rss/karriere>|200|02/24/2026|valid|112|1876|
23|derStandard - Immobilien|<https://www.derstandard.at/rss/immobilien>|200|02/24/2026|valid|96|1608|
24|derStandard - Diskurs|<https://www.derstandard.at/rss/diskurs>|200|02/24/2026|valid|184|3111|
25|derStandard - dieStandard.at|<https://www.derstandard.at/rss/diestandard>|200|02/24/2026|valid|108|1809|
26|derStandard - Live|<https://www.derstandard.at/rss/live>|200|02/24/2026|valid|88|1452|
27|derStandard - Video|<https://www.derstandard.at/rss/video>|200|02/24/2026|valid|80|1320|
28|derStandard - Podcast|<https://www.derstandard.at/rss/podcast>|200|02/24/2026|valid|108|1809|
29|derStandard - Recht|<https://www.derstandard.at/rss/recht>|200|02/24/2026|valid|64|1072|

### Norway (NO)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|NRK|<https://www.nrk.no/toppsaker.rss>|200|02/24/2026|valid|400|6600|
2|NRK News|<https://www.nrk.no/nyheter/siste.rss>|200|02/24/2026|valid|80|1340|
3|TV2|<https://www.tv2.no/rss/toppsaker.xml>|200|02/24/2026|valid|0|0|
4|E24|<https://e24.no/rss>|200|02/24/2026|valid|27|481|
5|Dagbladet|<https://www.dagbladet.no/rss/nyheter>|200|02/24/2026|valid|460|7705|
6|TV2|<https://www.tv2.no/rss/nyheter/>|200|02/24/2026|valid|80|1340|
7|E24|<https://e24.no/rss/okonomi.xml>|200|02/24/2026|valid|21|476|
8|TV2|<https://www.tv2.no/rss/politikk.xml>|200|02/24/2026|valid|0|0|
9|E24|<https://e24.no/rss/nyheter.xml>|200|02/24/2026|valid|21|475|
10|VG - Forsiden|<https://www.vg.no/rss/feed/forsiden/>|Recovered via sitemap|02/24/2026|valid|0|138|
11|VG - Innenriks|<https://www.vg.no/rss/feed/?categories=1069>|200|02/24/2026|valid|40|640|
12|VG - Utenriks|<https://www.vg.no/rss/feed/?categories=1070>|200|02/24/2026|valid|40|640|
13|E24 - Børs og finans|<https://e24.no/rss2/?seksjon=boers-og-finans>|200|02/24/2026|valid|40|640|
14|E24 - Aksjetips|<http://e24.no/rss2/?seksjon=aksjetips>|200|02/24/2026|valid|22|450|
15|E24 - IT & Telekom|<http://e24.no/rss2/?seksjon=it>|200|02/24/2026|valid|22|452|
16|NRK - RSS oversikt (directory)|<https://www.nrk.no/rss/>|Recovered via sitemap|02/24/2026|valid|0|1794|
17|NRK - Innenriks|<https://www.nrk.no/norge/toppsaker.rss>|200|02/24/2026|valid|80|1280|
18|TV2 - Nyheter|<https://www.tv2.no/rss/nyheter>|200|02/24/2026|valid|120|1320|
19|TV2 - Innenriks|<https://www.tv2.no/rss/nyheter/innenriks>|200|02/24/2026|valid|80|1280|
20|TV2 - Utenriks|<https://www.tv2.no/rss/nyheter/utenriks>|200|02/24/2026|valid|80|1280|
21|TV2 - Sport|<https://www.tv2.no/rss/sport>|200|02/24/2026|valid|80|1280|
22|TV2 - Underholdning|<https://www.tv2.no/rss/underholdning>|200|02/24/2026|valid|80|1280|
23|Nettavisen - Alle saker|<https://www.nettavisen.no/service/rich-rss>|200|02/24/2026|valid|0|465|
24|Nettavisen - Nyheter|<https://www.nettavisen.no/service/rich-rss?tag=nyheter>|200|02/24/2026|valid|0|465|
25|Nettavisen - Sport|<https://www.nettavisen.no/service/rich-rss?tag=sport>|200|02/24/2026|valid|0|465|
26|Dagbladet|<https://www.dagbladet.no/?lab_viewport=rss>|200|02/24/2026|valid|269|2939|
27|Aftenposten|<https://www.aftenposten.no/rss/>|200|02/24/2026|valid|150|1650|
28|Dagsavisen|<https://www.dagsavisen.no/rss>|200|02/24/2026|valid|478|6732|
29|DN - RSS directory|<https://services.dn.no/tools/rss>|200 (HTML_RETURNED)|02/24/2026|invalid|0|0|
30|DN - Alle nyheter|<https://services.dn.no/api/feed/rss/>|200|02/24/2026|valid|105|1448|
31|Finansavisen|<https://ws.finansavisen.no/api/articles.rss>|200|02/24/2026|valid|40|640|
32|Finansavisen - Børs|<https://ws.finansavisen.no/api/articles.rss?category=B%C3%B8rs>|200|02/24/2026|valid|40|640|

### Global Energy & Grid (Global)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|OilPrice|<https://oilprice.com/rss/main>|200|02/24/2026|valid|60|1005|
2|Power Engineering|<https://www.power-eng.com/feed/>|200|02/24/2026|valid|40|660|
3|Renewable Energy World|<https://www.renewableenergyworld.com/feed/>|200|02/24/2026|valid|40|670|
4|Utility Dive|<https://www.utilitydive.com/feeds/news/>|200|02/24/2026|valid|40|670|
5|CleanTechnica|<https://cleantechnica.com/feed/>|200|02/24/2026|valid|180|3015|
6|Carbon Brief|<https://www.carbonbrief.org/feed/>|200|02/24/2026|valid|40|670|
7|Power Magazine|<https://www.powermag.com/feed/>|200|02/24/2026|valid|40|670|
8|PV Magazine|<https://www.pv-magazine.com/feed/>|200|02/24/2026|valid|100|1675|
9|Energy Post|<https://energypost.eu/feed/>|200|02/24/2026|valid|0|0|
10|Energy Storage News|<https://www.energy-storage.news/rss>|200|02/24/2026|valid|200|3350|
11|Energy Storage News|<https://www.energy-storage.news/feed>|200|02/24/2026|valid|200|3350|

