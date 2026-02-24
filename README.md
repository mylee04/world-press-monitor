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

- Checked endpoints: `1287`
- Valid: `1212`
- Invalid: `75`
- Recovered via sitemap: `122`
- No-source rows: `0`
- Sitemap fallback checks: checked `197`, attempted `197`, success `122`, failed `75`, no-candidate `0`, candidates `291`
- Snapshot date: `02/24/2026`
- RSS ingest baseline: `2026-02-20`
- RSS daily window: `1d` (runner: worker)
- Source artifact: `audits/readme_rss_health_latest.json`

### Failure reasons
|Reason|Count|
|---|---:|
|HTML_RETURNED|19|
|HTTP_403|18|
|HTTP_404|13|
|HTTP_REDIRECT_LOOP|11|
|TIMEOUT|6|
|NETWORK|5|
|TLS|3|

### Invalid feeds by reason

#### HTML_RETURNED (19)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Indonesia|Kontan (Investment/Finance)|<https://www.kontan.co.id/rss>|200|
|Iran|ISNA (EN) - Culture & Art|<https://en.isna.ir/rss/tp/19>|200|
|Iran|ISNA (EN) - Economy|<https://en.isna.ir/rss/tp/33>|200|
|Iran|ISNA (EN) - Photos|<https://en.isna.ir/rss/tp/27>|200|
|Iran|ISNA (EN) - Politics|<https://en.isna.ir/rss/tp/13>|200|
|Iran|ISNA (EN) - Social|<https://en.isna.ir/rss/tp/8>|200|
|Iran|ISNA (EN) - Sports|<https://en.isna.ir/rss/tp/23>|200|
|Japan|Diamond Online|<https://diamond.jp/list/feed/rss>|200|
|Japan|Goo News (Business)|<https://news.goo.ne.jp/rss/topstories/business/index.rdf>|200|
|Japan|Goo News (Politics)|<https://news.goo.ne.jp/rss/topstories/politics/index.rdf>|200|
|Japan|Nikkan Kogyo (Industrial Manufacturing News)|<https://www.nikkan.co.jp/rss/news>|200|
|Norway|DN - RSS directory|<https://services.dn.no/tools/rss>|200|
|Saudi Arabia|CNBC Arabia (Middle East Economy)|<https://www.cnbcarabia.com/RSS/117>|200|
|Saudi Arabia|Gulf Business (Saudi Section)|<https://gulfbusiness.com/region/saudi-arabia/feed/>|200|
|Saudi Arabia|Maaal (Saudi Business)|<https://www.maaal.com/feed>|200|
|Switzerland|Le Temps|<https://www.letemps.ch/rss>|200|
|Thailand|MCOT Economy|<https://tna.mcot.net/category/economy/feed>|200|
|Turkey|Hurriyet (Saglk)|<http://www.hurriyet.com.tr/rss/saglik>|200|
|Turkey|Sozcu (National Daily)|<https://www.sozcu.com.tr/rss>|200|

#### HTTP_403 (18)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Austria|Finanzen.at (Stocks/Finance)|<https://www.finanzen.at/rss/news>|403|
|Belgium|Le Soir (main)|<https://www.lesoir.be/rss2/9/cible_principale>|403|
|China|HKET (Hong Kong Economic Times)|<https://www.hket.com/rss/hongkong>|403|
|France|Les Echos (Finance/Markets)|<https://services.lesechos.fr/api/rss/univers/finance-marches>|403|
|France|Les Echos (Tech/Media)|<https://services.lesechos.fr/api/rss/univers/tech-medias>|403|
|France|Usine Nouvelle (Industry/Energy/Manufacturing)|<https://www.usinenouvelle.com/rss/>|403|
|Indonesia|Tempo.co (Politics and Investigations)|<https://tempo.co/rss>|403|
|Japan|Nikkei|<https://assets.nikkei.jp/release/v1/rss/news.xml>|403|
|Mexico|El Economista - Empresas|<https://www.eleconomista.com.mx/rss/empresas>|403|
|Mexico|El Economista - Top Noticias|<https://www.eleconomista.com.mx/rss/top-noticias>|403|
|Netherlands|De Telegraaf|<https://www.telegraaf.nl/rss>|403|
|Saudi Arabia|Al Yaum (Domestic Trends)|<https://www.alyaum.com/rss>|403|
|Saudi Arabia|Arab News|<https://www.arabnews.com/rss.xml>|403|
|Saudi Arabia|Asharq Business (Bloomberg Arabic)|<https://asharqbusiness.com/feed>|403|
|Spain|El Economista - Mercados|<https://www.eleconomista.es/rss/rss-mercados.php>|403|
|Spain|El Economista - Portada|<https://www.eleconomista.es/rss/rss-portada.php>|403|
|Switzerland|Aargauer Zeitung (Regional Major Daily - German)|<https://www.aargauerzeitung.ch/rss>|403|
|Uruguay|El Pais - Portada|<https://www.elpais.com.uy/rss>|403|

#### HTTP_404 (13)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Brazil|CNN Brasil (Business)|<https://www.cnnbrasil.com.br/business/feed/>|404|
|Chile|Reporte Minero|<https://www.reporteminero.cl/feed>|404|
|China|Zaobao (realtime)|<https://www.zaobao.com.sg/rss/realtime>|404|
|Indonesia|Bisnis Indonesia (Business/Industry)|<https://www.bisnis.com/rss>|404|
|Mexico|El Sol de Mexico (Domestic Breaking)|<https://www.elsoldemexico.com.mx/rss.xml>|404|
|Netherlands|De Correspondent (In-Depth Analysis)|<https://decorrespondent.nl/feed>|404|
|Netherlands|FOK! (News/Community)|<https://frontpage.fok.nl/xml/rss>|404|
|Netherlands|IEX.nl (Stocks/Investments)|<https://www.iex.nl/rss/nieuws.xml>|404|
|Saudi Arabia|Argaam (Arabic Economy/Stocks #1)|<https://www.argaam.com/ar/rss/news/type/1>|404|
|Sweden|Expressen Din Ekonomi (Economy)|<https://feeds.expressen.se/din-ekonomi/>|404|
|Sweden|Omni (Swedish News Aggregator)|<https://omni.se/rss>|404|
|Turkey|Sozcu Ekonomi (Economy)|<https://www.sozcu.com.tr/kategori/ekonomi/rss>|404|
|Uruguay|La Republica|<https://www.republica.com.uy/feed/>|404|

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

#### TIMEOUT (6)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Canada|CBC News - Business|<https://www.cbc.ca/cmlink/rss-business>|-|
|Canada|CBC News - World|<https://www.cbc.ca/cmlink/rss-world>|-|
|Indonesia|ANTARA - Dunia (ASEAN)|<https://www.antaranews.com/rss/dunia-asean.xml>|-|
|Indonesia|ANTARA - Ekonomi|<https://www.antaranews.com/rss/ekonomi.xml>|-|
|Indonesia|ANTARA - Sepakbola (Liga Indonesia)|<https://www.antaranews.com/rss/sepakbola-liga-indonesia.xml>|-|
|Indonesia|ANTARA - Terkini|<https://www.antaranews.com/rss/terkini.xml>|-|

#### NETWORK (5)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Indonesia|Detik Finance (Finance and Economy)|<https://laporan.detik.com/rss/detikfinance.xml>|-|
|Indonesia|Detikcom (Top Breaking Portal)|<https://laporan.detik.com/rss/detiknews.xml>|-|
|Indonesia|Kompas (Mainstream Daily)|<https://sindikasi.kompas.com/xml/nasional>|-|
|Indonesia|Kompas Ekonomi (Economy)|<https://sindikasi.kompas.com/xml/ekonomi>|-|
|Japan|Yomiuri Latest|<https://assets.yomiuri.co.jp/rss/latestnews.rdf>|-|

#### TLS (3)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Japan|AFP BB News|<https://feeds.afpbb.com/afpbb/news/all>|-|
|Japan|TechCrunch Japan|<https://jp.techcrunch.com/feed/>|-|
|Saudi Arabia|Al Riyadh (Main - Arabic)|<https://www.alriyadh.com/rss>|-|

### Sitemap fallback successes
|Country|Outlet|Failed RSS URL|Recovered via sitemap|
|---|---|---|---|
|China|HK01 (Hong Kong Digital Media Top Feed)|<https://www.hk01.com/rss>|<https://www.hk01.com/sitemap.xml>|
|China|Tencent Tech (Tencent Technology News)|<https://new.qq.com/ch/tech/>|<https://news.qq.com/sitemap/sitemap_1241500660.xml>|
|Japan|Forbes Japan|<https://news.yahoo.co.jp/rss/media/fminfo/all.xml>|<https://news.yahoo.co.jp/sitemaps/list.xml>|
|Japan|Sankei News Flash|<https://www.sankei.com/rss/news/flash.xml>|<https://www.sankei.com/feeds/sitemap-oriconnews/?outputType=xml&amp;from=0>|
|Japan|Sankei Economy|<https://www.sankei.com/rss/news/economy.xml>|<https://www.sankei.com/feeds/sitemap-oriconnews/?outputType=xml&amp;from=0>|
|Japan|Wired Japan|<https://wired.jp/feed/rss2>|<https://wired.jp/feed/google-latest-news/sitemap-google-news>|
|Japan|Boundless (TechCrunch Japan Archive)|<https://news.yahoo.co.jp/rss/media/boundless/all.xml>|<https://news.yahoo.co.jp/sitemaps/list.xml>|
|Japan|PR TIMES - Business/Economy|<https://prtimes.jp/business.rdf>|<https://prtimes.jp/sitemap-news.xml>|
|Japan|PR TIMES - Technology|<https://prtimes.jp/technology.rdf>|<https://prtimes.jp/sitemap-news.xml>|
|Japan|Newsweek Japan|<https://www.newsweekjapan.jp/headlines.rss>|<https://www.newsweekjapan.jp/stories/sitemap_stories_2008.xml>|
|Japan|President Online (Business)|<https://president.jp/list/feed/rss>|<https://president.jp/common/files/sitemap-2026.xml>|
|Japan|Minkabu (Stocks/Investing)|<https://minkabu.jp/news/feed>|<https://minkabu.jp/hikaku/sitemap.xml>|
|Japan|Tokyo Shimbun General News|<https://www.tokyo-np.co.jp/rss/news>|<https://www.tokyo-np.co.jp/sitemap_tokyo.xml>|
|France|Liberation (Society/Politics)|<https://www.liberation.fr/rss/>|<https://www.liberation.fr/arc/outboundfeeds/sitemap_news.xml?outputType=xml>|
|France|L'Express (Current Affairs Magazine)|<https://www.lexpress.fr/arc/outboundfeeds/rss/>|<https://www.lexpress.fr/arc/outboundfeeds/sitemap-news.xml>|
|France|Le Point (Current Affairs/Economy)|<https://www.lepoint.fr/rss.xml>|<https://www.lepoint.fr/arc/outboundfeeds/sitemap-news.xml>|
|France|Capital.fr (Economy/Capital)|<https://www.capital.fr/rss.xml>|<https://www.capital.fr/sitemap/news.xml>|
|Canada|CTV News - Top Stories|<https://www.ctvnews.ca/rss/ctvnews-ca-top-stories-public-rss-1.822009>|<https://www.ctvnews.ca/arc/outboundfeeds/sitemap-news/latest/>|
|Canada|CTV News - Business|<https://www.ctvnews.ca/rss/business/ctvnews-ca-business-public-rss-1.822283>|<https://www.ctvnews.ca/arc/outboundfeeds/sitemap-news/latest/>|
|Canada|BNN Bloomberg (Canada Biz)|<https://www.bnnbloomberg.ca/business/rss>|<https://www.bnnbloomberg.ca/arc/outboundfeeds/sitemap-news/latest/>|

### No-source rows
- none
### United States (US)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|The New York Times|<https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml>|200|02/24/2026|valid|141|1669|
2|Wall Street Journal|<https://feeds.a.dj.com/rss/RSSWorldNews.xml>|200|02/24/2026|valid|100|1360|
3|LA Times|<https://www.latimes.com/local/rss2.0.xml>|200|02/24/2026|valid|470|6386|
4|CNN|<http://rss.cnn.com/rss/cnn_topstories.rss>|200|02/24/2026|valid|345|4200|
5|Fox News|<http://moxie.foxnews.com/google-publisher/latest.xml>|200|02/24/2026|valid|125|1700|
6|NBC News|<http://feeds.nbcnews.com/nbcnews/public/news>|200|02/24/2026|valid|125|1700|
7|CBS News|<https://www.cbsnews.com/latest/rss/main>|200|02/24/2026|valid|150|2040|
8|ABC News|<https://abcnews.go.com/abcnews/topstories>|200|02/24/2026|valid|125|1700|
9|NPR|<https://feeds.npr.org/1001/rss.xml>|200|02/24/2026|valid|50|680|
10|HuffPost|<https://www.huffpost.com/section/front-page/feed>|200|02/24/2026|valid|0|0|
11|BuzzFeed News|<https://www.buzzfeednews.com/news.xml>|200|02/24/2026|valid|200|2720|
12|Vox|<https://www.vox.com/rss/index.xml>|200|02/24/2026|valid|50|680|
13|CNBC|<https://www.cnbc.com/id/100003114/device/rss/rss.html>|200|02/24/2026|valid|150|2040|
14|Financial Times|<https://www.ft.com/?format=rss>|200|02/24/2026|valid|48|663|
15|Forbes|<https://www.forbes.com/most-popular/feed/>|200|02/24/2026|valid|55|748|
16|Fortune|<https://fortune.com/feed>|200|02/24/2026|valid|50|680|
17|Business Insider|<https://www.businessinsider.com/rss>|200|02/24/2026|valid|100|1360|
18|MarketWatch|<http://feeds.marketwatch.com/marketwatch/topstories/>|200|02/24/2026|valid|50|680|
19|Fast Company|<https://www.fastcompany.com/rss>|200|02/24/2026|valid|100|1354|
20|TechCrunch|<https://techcrunch.com/feed/>|200|02/24/2026|valid|100|1360|
21|The Verge|<https://www.theverge.com/rss/index.xml>|200|02/24/2026|valid|50|680|
22|Wired|<https://www.wired.com/feed/rss>|200|02/24/2026|valid|250|3400|
23|Ars Technica|<http://feeds.arstechnica.com/arstechnica/index>|200|02/24/2026|valid|100|1360|
24|Engadget|<https://www.engadget.com/rss.xml>|200|02/24/2026|valid|250|3400|
25|VentureBeat|<https://venturebeat.com/feed/>|200|02/24/2026|valid|35|476|
26|Mashable|<https://mashable.com/feed>|200|02/24/2026|valid|500|6800|
27|Gizmodo|<https://gizmodo.com/rss>|200|02/24/2026|valid|100|1360|
28|CNET|<https://www.cnet.com/rss/news/>|200|02/24/2026|valid|125|1700|
29|ZDNet|<https://www.zdnet.com/news/rss.xml>|200|02/24/2026|valid|100|1360|
30|The Hill|<https://thehill.com/feed>|200|02/24/2026|valid|500|6800|
31|Axios|<https://api.axios.com/feed/>|200|02/24/2026|valid|500|6800|
32|Breitbart|<http://feeds.feedburner.com/breitbart>|200|02/24/2026|valid|250|3346|
33|National Review|<https://www.nationalreview.com/feed/>|200|02/24/2026|valid|100|1360|
34|Slate|<https://slate.com/feeds/all.rss>|200|02/24/2026|valid|125|1700|
35|The New Yorker|<https://www.newyorker.com/feed/everything>|200|02/24/2026|valid|250|3400|
36|The Atlantic|<https://www.theatlantic.com/feed/all/>|200|02/24/2026|valid|125|1700|
37|Boston Globe|<https://www.bostonglobe.com/arc/outboundfeeds/rss?outputType=xml>|200|02/24/2026|valid|500|6800|
38|New York Post|<https://nypost.com/feed>|200|02/24/2026|valid|108|1494|
39|Chicago Tribune|<https://chicagotribune.com/feed>|200|02/24/2026|valid|50|680|
40|Seattle Times|<https://seattletimes.com/feed>|200|02/24/2026|valid|104|1289|
41|Denver Post|<https://denverpost.com/feed>|200|02/24/2026|valid|50|650|
42|San Jose Mercury News|<https://mercurynews.com/feed>|200|02/24/2026|valid|50|680|
43|Las Vegas Review-Journal|<https://reviewjournal.com/feed>|200|02/24/2026|valid|150|2040|
44|San Diego Union-Tribune|<https://sandiegouniontribune.com/feed>|200|02/24/2026|valid|500|6800|
45|Honolulu Star-Advertiser|<https://staradvertiser.com/feed>|200|02/24/2026|valid|200|2720|
46|Variety|<https://variety.com/feed>|200|02/24/2026|valid|50|680|
47|The Hollywood Reporter|<https://hollywoodreporter.com/feed>|200|02/24/2026|valid|50|680|
48|Deadline|<https://deadline.com/feed>|200|02/24/2026|valid|60|816|
49|Rolling Stone|<https://rollingstone.com/feed>|200|02/24/2026|valid|50|680|
50|Billboard|<https://billboard.com/feed>|200|02/24/2026|valid|50|680|
51|Vanity Fair|<http://feeds.feedburner.com/vfdotcomrss>|200|02/24/2026|valid|175|2380|
52|Esquire|<https://www.esquire.com/rss/entertainment.xml>|200|02/24/2026|valid|250|3400|
53|GQ|<https://www.gq.com/feed/rss>|200|02/24/2026|valid|150|2040|
54|Space.com|<https://www.space.com/feeds/all>|200|02/24/2026|valid|250|3400|
55|ESPN|<https://www.espn.com/espn/rss/news>|200|02/24/2026|valid|166|2410|
56|Sports Illustrated|<https://si.com/feed>|200|02/24/2026|valid|448|6012|
57|Mother Jones|<https://motherjones.com/feed>|200|02/24/2026|valid|50|680|
58|ProPublica|<https://propublica.org/feed>|200|02/24/2026|valid|50|680|
59|Reason|<https://reason.com/feed>|200|02/24/2026|valid|240|3216|
60|Jacobin|<https://jacobin.com/feed>|200|02/24/2026|valid|100|1360|
61|Quartz|<https://qz.com/feed>|200|02/24/2026|valid|250|3400|
62|The Intercept|<https://theintercept.com/feed>|200|02/24/2026|valid|100|1360|
63|Newsweek|<https://www.newsweek.com/rss>|200|02/24/2026|valid|80|1140|
64|Time|<https://time.com/feed>|200|02/24/2026|valid|500|6800|
65|PBS NewsHour|<https://www.pbs.org/newshour/feeds/rss/headlines>|200|02/24/2026|valid|100|1360|

### China (CN)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|China Daily|<http://www.chinadaily.com.cn/rss/world_rss.xml>|200|02/24/2026|valid|500|6800|
2|TechNode|<https://technode.com/feed>|200|02/24/2026|valid|480|8040|
3|South China Morning Post|<https://www.scmp.com/rss/91/feed>|200|02/24/2026|valid|250|3400|
4|Initium|<https://theinitium.com/feed>|200|02/24/2026|valid|75|1020|
5|Liberty Times|<https://news.ltn.com.tw/rss/all.xml>|200|02/24/2026|valid|200|2720|
6|People China|<https://people.com.cn/rss/politics.xml>|200|02/24/2026|valid|500|6800|
7|China Daily English|<https://www.chinadaily.com.cn/rss/world_rss.xml>|200|02/24/2026|valid|500|6800|
8|China Daily - China|<http://www.chinadaily.com.cn/rss/china_rss.xml>|200|02/24/2026|valid|500|6800|
9|China Daily - BizChina|<http://www.chinadaily.com.cn/rss/bizchina_rss.xml>|200|02/24/2026|valid|500|6800|
10|China Daily - Opinion|<http://www.chinadaily.com.cn/rss/opinion_rss.xml>|200|02/24/2026|valid|600|8160|
11|China Daily - Sports|<http://www.chinadaily.com.cn/rss/sports_rss.xml>|200|02/24/2026|valid|500|6800|
12|China Daily - Entertainment|<http://www.chinadaily.com.cn/rss/entertainment_rss.xml>|200|02/24/2026|valid|600|8160|
13|China Daily - Lifestyle|<http://www.chinadaily.com.cn/rss/lifestyle_rss.xml>|200|02/24/2026|valid|500|6800|
14|China Daily - Photos|<http://www.chinadaily.com.cn/rss/photo_rss.xml>|200|02/24/2026|valid|600|8160|
15|China Daily - China Daily (main)|<http://www.chinadaily.com.cn/rss/cndy_rss.xml>|200|02/24/2026|valid|600|8160|
16|China Daily - HK Edition|<http://www.chinadaily.com.cn/rss/hk_rss.xml>|200|02/24/2026|valid|600|8160|
17|China Daily - USA (kindle)|<http://usa.chinadaily.com.cn/usa_kindle.xml>|200|02/24/2026|valid|0|0|
18|China Daily - EU Weekly|<http://europe.chinadaily.com.cn/euweekly_rss.xml>|200|02/24/2026|valid|600|8160|
19|People.cn - Politics|<http://www.people.com.cn/rss/politics.xml>|200|02/24/2026|valid|500|6800|
20|People.cn - Society|<http://www.people.com.cn/rss/society.xml>|200|02/24/2026|valid|500|6800|
21|People.cn - Legal|<http://www.people.com.cn/rss/legal.xml>|200|02/24/2026|valid|500|6800|
22|People.cn - World|<http://www.people.com.cn/rss/world.xml>|200|02/24/2026|valid|500|6800|
23|People.cn - Opinion|<http://www.people.com.cn/rss/opinion.xml>|200|02/24/2026|valid|500|6800|
24|People.cn - ChinaPic|<http://www.people.com.cn/rss/chinapic.xml>|200|02/24/2026|valid|500|6800|
25|CGTN Documentary|<https://news.cgtn.com/rss/documentary/CGTN-Documentary.rss>|200|02/24/2026|valid|10|134|
26|Zaobao (realtime)|<https://www.zaobao.com.sg/rss/realtime>|404 (HTTP_404)|02/24/2026|invalid|0|0|
27|RTHK|<https://rthk.hk/rthk/news/rss/c_expressnews_clocal.xml>|200|02/24/2026|valid|80|100|
28|FT Chinese|<http://www.ftchinese.com/rss/feed>|200|02/24/2026|valid|80|100|
29|Xinhua|<http://www.xinhuanet.com/politics/news_politics.xml>|200|02/24/2026|valid|480|600|
30|Sina Finance (Top Financial Portal)|<https://rss.sina.com.cn/roll/finance/hot_roll.xml>|200|02/24/2026|valid|0|0|
31|Sina News (General Breaking News)|<https://rss.sina.com.cn/news/world/focus15.xml>|200|02/24/2026|valid|30|30|
32|HK01 (Hong Kong Digital Media Top Feed)|<https://www.hk01.com/rss>|Recovered via sitemap|02/24/2026|valid|0|0|
33|Ming Pao (Hong Kong Flagship Newspaper)|<https://news.mingpao.com/rss/pns/s00001.xml>|200|02/24/2026|valid|26|26|
34|HKET (Hong Kong Economic Times)|<https://www.hket.com/rss/hongkong>|403 (HTTP_403)|02/24/2026|invalid|4|4|
35|Tencent Tech (Tencent Technology News)|<https://new.qq.com/ch/tech/>|Recovered via sitemap|02/24/2026|valid|0|0|

### Japan (JP)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|NHK World (EN)|<https://www3.nhk.or.jp/rss/news/cat0.xml>|200|02/24/2026|valid|35|476|
2|Mainichi (Biz)|<https://mainichi.jp/rss/etc/english_latest.rss>|200|02/24/2026|valid|0|0|
3|Asahi Shimbun|<https://www.asahi.com/rss/asahi/newsheadlines.rdf>|200|02/24/2026|valid|0|0|
4|The Japan Times|<https://www.japantimes.co.jp/feed/>|200|02/24/2026|valid|150|2040|
5|Automotive Ten-Navi|<https://automotive.ten-navi.com/rss/>|200|02/24/2026|valid|0|0|
6|The Bridge|<https://thebridge.jp/feed/>|200|02/24/2026|valid|40|380|
7|Nippon|<https://www.nippon.com/en/feed/>|200|02/24/2026|valid|100|1360|
8|NHK News Web - cat1|<https://www3.nhk.or.jp/rss/news/cat1.xml>|200|02/24/2026|valid|564|8018|
9|NHK News Web - cat2|<https://www3.nhk.or.jp/rss/news/cat2.xml>|200|02/24/2026|valid|79|1142|
10|NHK News Web - cat3|<https://www3.nhk.or.jp/rss/news/cat3.xml>|200|02/24/2026|valid|99|1435|
11|NHK News Web - cat4|<https://www3.nhk.or.jp/rss/news/cat4.xml>|200|02/24/2026|valid|366|5865|
12|NHK News Web - cat5|<https://www3.nhk.or.jp/rss/news/cat5.xml>|200|02/24/2026|valid|302|4110|
13|NHK News Web - cat6|<https://www3.nhk.or.jp/rss/news/cat6.xml>|200|02/24/2026|valid|525|7028|
14|NHK News Web - cat7|<https://www3.nhk.or.jp/rss/news/cat7.xml>|200|02/24/2026|valid|600|8160|
15|ITmedia - 総合記事一覧|<https://rss.itmedia.co.jp/rss/2.0/itmedia_all.xml>|200|02/24/2026|valid|250|3400|
16|ITmedia - TOP STORIES|<https://rss.itmedia.co.jp/rss/2.0/topstory.xml>|200|02/24/2026|valid|100|1360|
17|ITmedia NEWS - 新着(速報)|<https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml>|200|02/24/2026|valid|350|3500|
18|ITmedia NEWS - 国内|<https://rss.itmedia.co.jp/rss/2.0/news_domestic.xml>|200|02/24/2026|valid|150|2040|
19|ITmedia NEWS - 海外|<https://rss.itmedia.co.jp/rss/2.0/news_foreign.xml>|200|02/24/2026|valid|150|2040|
20|ITmedia NEWS - 製品動向|<https://rss.itmedia.co.jp/rss/2.0/news_products.xml>|200|02/24/2026|valid|150|2040|
21|ITmedia NEWS - セキュリティ|<https://rss.itmedia.co.jp/rss/2.0/news_security.xml>|200|02/24/2026|valid|150|2040|
22|ITmedia NEWS - 科学・テクノロジー|<https://rss.itmedia.co.jp/rss/2.0/news_technology.xml>|200|02/24/2026|valid|150|2040|
23|ITmedia NEWS - ネットトピック|<https://rss.itmedia.co.jp/rss/2.0/news_nettopics.xml>|200|02/24/2026|valid|150|2040|
24|ITmedia NEWS - 企業・業界動向|<https://rss.itmedia.co.jp/rss/2.0/news_industry.xml>|200|02/24/2026|valid|150|2040|
25|ITmedia NEWS - Special|<https://rss.itmedia.co.jp/rss/2.0/news_special.xml>|200|02/24/2026|valid|150|2040|
26|ITmedia AI+|<https://rss.itmedia.co.jp/rss/2.0/aiplus.xml>|200|02/24/2026|valid|100|1360|
27|ITmedia Mobile|<https://rss.itmedia.co.jp/rss/2.0/mobile.xml>|200|02/24/2026|valid|100|1360|
28|ITmedia PC USER|<https://rss.itmedia.co.jp/rss/2.0/pcuser.xml>|200|02/24/2026|valid|100|1360|
29|ITmedia ビジネスオンライン|<https://rss.itmedia.co.jp/rss/2.0/business.xml>|200|02/24/2026|valid|100|1360|
30|ITmedia エンタープライズ|<https://rss.itmedia.co.jp/rss/2.0/enterprise.xml>|200|02/24/2026|valid|250|3400|
31|J-CASTニュース (総合)|<https://www.j-cast.com/index.xml>|200|02/24/2026|valid|280|3808|
32|J-CASTトレンド|<https://www.j-cast.com/trend/index.xml>|200|02/24/2026|valid|19|223|
33|J-CAST会社ウォッチ|<https://www.j-cast.com/kaisha/index.xml>|200|02/24/2026|valid|5|68|
34|BOOKウォッチ|<https://books.j-cast.com/rss.xml>|200|02/24/2026|valid|0|0|
35|INTERNET Watch (Impress)|<https://internet.watch.impress.co.jp/data/rss/1.0/iw/feed.rdf>|200|02/24/2026|valid|0|0|
36|Impress Watch (総合)|<https://www.watch.impress.co.jp/data/rss/1.0/ipw/feed.rdf>|200|02/24/2026|valid|0|0|
37|GIGAZINE (Atom)|<https://gigazine.net/news/rss_atom/>|200|02/24/2026|valid|150|2040|
38|PR TIMES (プレスリリース)|<https://prtimes.jp/index.rdf>|200|02/24/2026|valid|0|0|
39|Yahoo Japan - Business|<https://news.yahoo.co.jp/rss/topics/business.xml>|200|02/24/2026|valid|40|280|
40|Yahoo Japan - World|<https://news.yahoo.co.jp/rss/topics/world.xml>|200|02/24/2026|valid|40|280|
41|Yahoo Japan - IT/Tech|<https://news.yahoo.co.jp/rss/topics/it.xml>|200|02/24/2026|valid|40|280|
42|Reuters Japan|<https://news.yahoo.co.jp/rss/media/reut/all.xml>|200|02/24/2026|valid|0|0|
43|Bloomberg Japan|<https://news.yahoo.co.jp/rss/media/bloom_st/all.xml>|200|02/24/2026|valid|0|0|
44|Forbes Japan|<https://news.yahoo.co.jp/rss/media/fminfo/all.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
45|Kyodo News|<https://news.yahoo.co.jp/rss/media/kyodonews/all.xml>|200|02/24/2026|valid|250|1750|
46|Toyo Keizai|<https://toyokeizai.net/list/feed/rss>|200|02/24/2026|valid|100|700|
47|Diamond Online|<https://diamond.jp/list/feed/rss>|200 (HTML_RETURNED)|02/24/2026|invalid|0|1509|
48|Sankei News Flash|<https://www.sankei.com/rss/news/flash.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
49|Sankei Economy|<https://www.sankei.com/rss/news/economy.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
50|CNET Japan|<https://feeds.japan.cnet.com/rss/cnet/all.rdf>|200|02/24/2026|valid|0|0|
51|Wired Japan|<https://wired.jp/feed/rss2>|Recovered via sitemap|02/24/2026|valid|0|0|
52|Boundless (TechCrunch Japan Archive)|<https://news.yahoo.co.jp/rss/media/boundless/all.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
53|Smart Japan|<https://rss.itmedia.co.jp/rss/2.0/smartjapan.xml>|200|02/24/2026|valid|100|700|
54|Nikkei|<https://assets.nikkei.jp/release/v1/rss/news.xml>|403 (HTTP_403)|02/24/2026|invalid|0|0|
55|Yomiuri Latest|<https://assets.yomiuri.co.jp/rss/latestnews.rdf>|ERR (NETWORK)|02/24/2026|invalid|0|0|
56|Mainichi Flash|<https://mainichi.jp/rss/etc/mainichi-flash.rss>|200|02/24/2026|valid|0|0|
57|Gizmodo Japan|<https://www.gizmodo.jp/index.xml>|200|02/24/2026|valid|125|875|
58|PR TIMES - Business/Economy|<https://prtimes.jp/business.rdf>|Recovered via sitemap|02/24/2026|valid|0|0|
59|PR TIMES - Technology|<https://prtimes.jp/technology.rdf>|Recovered via sitemap|02/24/2026|valid|0|0|
60|Goo News (Business)|<https://news.goo.ne.jp/rss/topstories/business/index.rdf>|200 (HTML_RETURNED)|02/24/2026|invalid|0|0|
61|Goo News (Politics)|<https://news.goo.ne.jp/rss/topstories/politics/index.rdf>|200 (HTML_RETURNED)|02/24/2026|invalid|0|0|
62|Newsweek Japan|<https://www.newsweekjapan.jp/headlines.rss>|Recovered via sitemap|02/24/2026|valid|0|0|
63|JBpress (Japan Business Press)|<https://jbpress.ismedia.jp/list/feed/rss>|200|02/24/2026|valid|80|120|
64|TechCrunch Japan|<https://jp.techcrunch.com/feed/>|ERR (TLS)|02/24/2026|invalid|0|0|
65|President Online (Business)|<https://president.jp/list/feed/rss>|Recovered via sitemap|02/24/2026|valid|0|0|
66|Zenn (Tech)|<https://zenn.dev/feed>|200|02/24/2026|valid|80|100|
67|NHK News (Politics - Category 1)|<https://www.nhk.or.jp/rss/news/cat1.xml>|200|02/24/2026|valid|349|349|
68|NHK News (Economy/Business - Category 3)|<https://www.nhk.or.jp/rss/news/cat3.xml>|200|02/24/2026|valid|63|63|
69|Nikkan Kogyo (Industrial Manufacturing News)|<https://www.nikkan.co.jp/rss/news>|200 (HTML_RETURNED)|02/24/2026|invalid|0|0|
70|Livedoor News (General Top Stories)|<https://news.livedoor.com/topics/rss/top.xml>|200|02/24/2026|valid|60|60|
71|Livedoor News (Economy)|<https://news.livedoor.com/topics/rss/eco.xml>|200|02/24/2026|valid|36|36|
72|GIGAZINE (Tech)|<https://gigazine.net/news/rss_2.0/>|200|02/24/2026|valid|90|90|
73|Qiita (Japanese IT Trends)|<https://qiita.com/popular-items/feed>|200|02/24/2026|valid|90|90|
74|Minkabu (Stocks/Investing)|<https://minkabu.jp/news/feed>|Recovered via sitemap|02/24/2026|valid|0|0|
75|Tokyo Shimbun General News|<https://www.tokyo-np.co.jp/rss/news>|Recovered via sitemap|02/24/2026|valid|0|0|
76|ASCII.jp Mac Tech|<https://ascii.jp/mac/rss.xml>|200|02/24/2026|valid|150|150|
77|Business Insider Japan|<https://www.businessinsider.jp/feed/index.xml>|200|02/24/2026|valid|80|80|
78|Hatena Bookmark Economy|<https://b.hatena.ne.jp/hotentry/economics.rss>|200|02/24/2026|valid|0|0|
79|Hatena Bookmark IT|<https://b.hatena.ne.jp/hotentry/it.rss>|200|02/24/2026|valid|0|0|
80|Hatena Bookmark Social|<https://b.hatena.ne.jp/hotentry/social.rss>|200|02/24/2026|valid|0|0|
81|AFP BB News|<https://feeds.afpbb.com/afpbb/news/all>|ERR (TLS)|02/24/2026|invalid|0|0|

### Germany (DE)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Handelsblatt - Top|<https://www.handelsblatt.com/contentexport/feed/top-themen>|200|02/24/2026|valid|120|1539|
2|Handelsblatt - Finance|<https://www.handelsblatt.com/contentexport/feed/finanzen>|200|02/24/2026|valid|100|1360|
3|Tagesschau|<https://www.tagesschau.de/xml/rss2>|200|02/24/2026|valid|200|2720|
4|Der Spiegel|<https://www.spiegel.de/schlagzeilen/tops/index.rss>|200|02/24/2026|valid|92|1389|
5|FAZ|<https://www.faz.net/rss/aktuell/>|200|02/24/2026|valid|338|4731|
6|Die Zeit|<https://newsfeed.zeit.de/index>|200|02/24/2026|valid|75|1020|
7|Manager Magazin|<https://www.manager-magazin.de/unternehmen/index.rss>|200|02/24/2026|valid|100|1360|
8|WirtschaftsWoche|<https://www.wiwo.de/contentexport/feed/rss/schlagzeilen>|200|02/24/2026|valid|100|1360|
9|Deutsche Welle (EN)|<https://rss.dw.com/xml/rss-en-all>|200|02/24/2026|valid|600|8160|
10|Heise Online|<https://www.heise.de/rss/heise-atom.xml>|200|02/24/2026|valid|600|8160|
11|Der Spiegel|<https://www.spiegel.de/schlagzeilen/index.rss>|200|02/24/2026|valid|150|2040|
12|Die Welt|<https://www.welt.de/feeds/topnews.rss>|200|02/24/2026|valid|96|1310|
13|Focus|<https://www.focus.de/rss/>|200|02/24/2026|valid|600|4080|
14|Handelsblatt Economy|<https://www.handelsblatt.com/contentexport/feed/finanzen/>|200|02/24/2026|valid|100|1360|
15|Frankfurter Allgemeine|<https://www.faz.net/rss/aktuell/wirtschaft/>|200|02/24/2026|valid|115|1564|
16|Tagesspiegel|<https://www.tagesspiegel.de/contentexport/feed/>|200|02/24/2026|valid|500|6800|
17|Handelsblatt World|<https://www.handelsblatt.com/contentexport/feed/wirtschaft>|200|02/24/2026|valid|100|1360|
18|Zeit Welt|<https://newsfeed.zeit.de/wirtschaft/index>|200|02/24/2026|valid|75|1020|
19|Financial Times Germany|<https://www.ft.com/rss/home>|200|02/24/2026|valid|55|673|
20|Süddeutsche - Top-Themen|<https://rss.sueddeutsche.de/rss/Topthemen>|200|02/24/2026|valid|75|1020|
21|Süddeutsche - Alles|<https://rss.sueddeutsche.de/rss/Alles>|200|02/24/2026|valid|75|1020|
22|Süddeutsche - Eilmeldungen|<https://rss.sueddeutsche.de/rss/Eilmeldungen>|200|02/24/2026|valid|75|1020|
23|Süddeutsche - Politik|<https://rss.sueddeutsche.de/rss/Politik>|200|02/24/2026|valid|75|1020|
24|Süddeutsche - Wirtschaft|<https://rss.sueddeutsche.de/rss/Wirtschaft>|200|02/24/2026|valid|75|1020|
25|Süddeutsche - Panorama|<https://rss.sueddeutsche.de/rss/Panorama>|200|02/24/2026|valid|75|1020|
26|Süddeutsche - Sport|<https://rss.sueddeutsche.de/rss/Sport>|200|02/24/2026|valid|75|1020|
27|Süddeutsche - München|<https://rss.sueddeutsche.de/rss/Muenchen>|200|02/24/2026|valid|75|1020|
28|Süddeutsche - Bayern|<https://rss.sueddeutsche.de/rss/Bayern>|200|02/24/2026|valid|75|1020|
29|Süddeutsche - Kultur|<https://rss.sueddeutsche.de/rss/Kultur>|200|02/24/2026|valid|75|1020|
30|Süddeutsche - Medien|<https://rss.sueddeutsche.de/rss/Medien>|200|02/24/2026|valid|75|1020|
31|Süddeutsche - Wissen|<https://rss.sueddeutsche.de/rss/Wissen>|200|02/24/2026|valid|75|1020|
32|Süddeutsche - Gesundheit|<https://rss.sueddeutsche.de/rss/Gesundheit>|200|02/24/2026|valid|75|1020|
33|Süddeutsche - Karriere|<https://rss.sueddeutsche.de/rss/Karriere>|200|02/24/2026|valid|75|1020|
34|Süddeutsche - Bildung|<https://rss.sueddeutsche.de/rss/Bildung>|200|02/24/2026|valid|75|1020|
35|Süddeutsche - Reise|<https://rss.sueddeutsche.de/rss/Reise>|200|02/24/2026|valid|75|1020|
36|Süddeutsche - Auto|<https://rss.sueddeutsche.de/rss/Auto>|200|02/24/2026|valid|75|1020|
37|Süddeutsche - Stil|<https://rss.sueddeutsche.de/rss/Stil>|200|02/24/2026|valid|75|1020|
38|Deutschlandfunk - Nachrichten|<https://www.deutschlandfunk.de/nachrichten-100.rss>|200|02/24/2026|valid|123|2307|
39|Deutschlandfunk - Politikportal|<https://www.deutschlandfunk.de/politikportal-100.rss>|200|02/24/2026|valid|595|7964|
40|Deutschlandfunk - Wirtschaft|<https://www.deutschlandfunk.de/wirtschaft-106.rss>|200|02/24/2026|valid|600|8160|
41|Deutschlandfunk - Wissen|<https://www.deutschlandfunk.de/wissen-106.rss>|200|02/24/2026|valid|600|8160|
42|Deutschlandfunk - Kulturportal|<https://www.deutschlandfunk.de/kulturportal-100.rss>|200|02/24/2026|valid|600|8160|
43|Deutschlandfunk - Europa|<https://www.deutschlandfunk.de/europa-112.rss>|200|02/24/2026|valid|600|8160|
44|Deutschlandfunk - Gesellschaft|<https://www.deutschlandfunk.de/gesellschaft-106.rss>|200|02/24/2026|valid|600|8160|
45|Deutschlandfunk - Sportportal|<https://www.deutschlandfunk.de/sportportal-100.rss>|200|02/24/2026|valid|555|7548|
46|taz.de (gesamt)|<https://taz.de/!a=;rss/>|200|02/24/2026|valid|0|0|
47|Tagesschau|<https://www.tagesschau.de/xml/rss2/>|200|02/24/2026|valid|160|200|

### India (IN)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|The Times of India (Top Stories)|<https://timesofindia.indiatimes.com/rssfeedstopstories.cms>|200|02/24/2026|valid|229|3148|
2|NDTV (Latest)|<https://feeds.feedburner.com/NDTV-LatestNews>|200|02/24/2026|valid|100|1360|
3|India Today (India)|<https://www.indiatoday.in/rss/1206578>|200|02/24/2026|valid|100|1360|
4|The Indian Express|<https://indianexpress.com/feed>|200|02/24/2026|valid|600|8160|
5|The Hindu (National)|<https://www.thehindu.com/news/national/?service=rss>|200|02/24/2026|valid|500|6800|
6|Firstpost|<https://www.firstpost.com/commonfeeds/v1/mfp/rss/web-stories.xml>|200|02/24/2026|valid|600|4080|
7|DNA India (India)|<https://www.dnaindia.com/feeds/india.xml>|200|02/24/2026|valid|60|1180|
8|Storify News|<https://www.storifynews.com/feed>|200|02/24/2026|valid|535|6634|
9|Amar Ujala (Breaking)|<https://www.amarujala.com/rss/breaking-news.xml>|200|02/24/2026|valid|55|748|
10|Odishabarta|<https://odishabarta.com/feed>|200|02/24/2026|valid|50|680|
11|The Times of Bengal|<https://thetimesofbengal.com/feed>|200|02/24/2026|valid|30|620|
12|Scroll.in|<https://feeds.feedburner.com/ScrollinArticles.rss>|200|02/24/2026|valid|500|6800|
13|Northlines|<https://thenorthlines.com/feed>|200|02/24/2026|valid|20|430|
14|Chandigarh Metro|<https://chandigarhmetro.com/feed>|200|02/24/2026|valid|50|670|
15|Chandigarh City News|<https://feeds.feedburner.com/ChandigarhCityNews>|200|02/24/2026|valid|50|680|
16|The Quint|<https://prod-qt-images.s3.amazonaws.com/production/thequint/feed.xml>|200|02/24/2026|valid|100|1360|
17|Telangana Today|<https://telanganatoday.com/feed>|200|02/24/2026|valid|600|8160|
18|News Today (TN)|<https://newstodaynet.com/feed>|200|02/24/2026|valid|50|590|
19|IndiaVision|<https://www.indiavision.com/feed>|200|02/24/2026|valid|125|1700|
20|OpIndia|<https://www.opindia.com/feed>|200|02/24/2026|valid|50|680|
21|OrissaPOST|<https://www.orissapost.com/feed>|200|02/24/2026|valid|100|1346|
22|India's News.Net|<https://feeds.indiasnews.net/rss/701ee96610c884a6>|200|02/24/2026|valid|500|6800|
23|TechGenYZ|<https://techgenyz.com/feed>|200|02/24/2026|valid|50|620|
24|WYM News (Blogspot)|<https://latestnewsupdate4you.blogspot.com/feeds/posts/default>|200|02/24/2026|valid|125|1700|
25|Star of Mysore|<https://starofmysore.com/feed>|200|02/24/2026|valid|50|670|
26|ABP News|<https://news.abplive.com/home/feed>|200|02/24/2026|valid|105|1373|
27|The India Bizz|<https://theindiabizz.com/feed>|200|02/24/2026|valid|50|620|

### United Kingdom (GB)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Financial Times - World|<https://www.ft.com/rss/world>|200|02/24/2026|valid|125|1700|
2|Financial Times - Energy|<https://www.ft.com/rss/companies/energy>|200|02/24/2026|valid|125|1700|
3|BBC News - Business|<https://feeds.bbci.co.uk/news/business/rss.xml>|200|02/24/2026|valid|270|3447|
4|BBC News - World|<https://feeds.bbci.co.uk/news/world/rss.xml>|200|02/24/2026|valid|201|2559|
5|The Guardian - World|<https://www.theguardian.com/world/rss>|200|02/24/2026|valid|225|3060|
6|The Guardian - Business|<https://www.theguardian.com/business/rss>|200|02/24/2026|valid|100|1360|
7|Sky News - World|<https://feeds.skynews.com/feeds/rss/world.xml>|200|02/24/2026|valid|50|680|
8|Sky News - Business|<https://feeds.skynews.com/feeds/rss/business.xml>|200|02/24/2026|valid|50|680|
9|Telegraph - Business|<https://www.telegraph.co.uk/business/rss.xml>|200|02/24/2026|valid|360|7080|
10|City A.M. (London Finance)|<https://www.cityam.com/feed/>|200|02/24/2026|valid|120|1920|
11|The Independent|<https://www.independent.co.uk/rss>|200|02/24/2026|valid|500|6800|
12|Financial Times UK|<https://www.ft.com/?format=rss>|200|02/24/2026|valid|48|663|
13|The Telegraph UK|<https://www.telegraph.co.uk/rss.xml>|200|02/24/2026|valid|360|7080|
14|Daily Mail|<https://www.dailymail.co.uk/home/index.rss>|200|02/24/2026|valid|600|8160|
15|Metro UK|<https://metro.co.uk/feed/>|200|02/24/2026|valid|150|1768|
16|The Sun|<https://www.thesun.co.uk/feed/>|200|02/24/2026|valid|0|962|
17|The Guardian UK|<https://www.theguardian.com/uk/rss>|200|02/24/2026|valid|600|8160|
18|Sky News|<https://feeds.skynews.com/feeds/rss/uk.xml>|200|02/24/2026|valid|50|680|
19|Financial Times|<https://www.ft.com/rss/home>|200|02/24/2026|valid|55|675|
20|iNews|<https://inews.co.uk/rss>|200|02/24/2026|valid|50|680|
21|BBC Culture|<https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml>|200|02/24/2026|valid|110|1643|
22|The Evening Standard|<https://www.standard.co.uk/rss>|200|02/24/2026|valid|500|6586|

### France (FR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|France 24|<https://www.france24.com/en/rss>|200|02/24/2026|valid|115|1618|
2|The Local (France)|<https://feeds.thelocal.com/rss/fr>|200|02/24/2026|valid|100|1360|
3|RFI (France)|<https://www.rfi.fr/en/france/rss>|200|02/24/2026|valid|150|2040|
4|RFI (All / EN)|<https://www.rfi.fr/en/rss>|200|02/24/2026|valid|110|1440|
5|Mediapart|<https://www.mediapart.fr/articles/feed>|200|02/24/2026|valid|60|690|
6|Le Monde diplomatique|<https://mondediplo.com/backend>|200|02/24/2026|valid|0|0|
7|Sud Ouest|<https://www.sudouest.fr/essentiel/rss.xml>|200|02/24/2026|valid|100|1360|
8|L'Est Républicain|<https://www.estrepublicain.fr/rss>|200|02/24/2026|valid|100|1360|
9|France Soir|<https://www.francesoir.fr/rss.xml>|200|02/24/2026|valid|20|430|
10|Dernières Nouvelles d'Alsace (DNA)|<https://www.dna.fr/rss>|200|02/24/2026|valid|100|1360|
11|La Croix|<https://www.la-croix.com/feeds/rss/site.xml>|200|02/24/2026|valid|250|3400|
12|La Dépêche|<https://www.ladepeche.fr/rss.xml>|200|02/24/2026|valid|500|6800|
13|20 Minutes|<https://www.20minutes.fr/feeds/rss-une.xml>|200|02/24/2026|valid|150|2040|
14|Yahoo Actualités|<https://fr.news.yahoo.com/rss>|200|02/24/2026|valid|25|340|
15|InfoMigrants (EN)|<https://www.infomigrants.net/en/rss/all.xml>|200|02/24/2026|valid|0|680|
16|France Today|<https://www.francetoday.com/feed>|200|02/24/2026|valid|24|516|
17|FrenchDailyNews|<https://frenchdailynews.com/feed>|200|02/24/2026|valid|50|680|
18|Le Monde (EN – Main)|<https://www.lemonde.fr/en/rss/une.xml>|200|02/24/2026|valid|90|1224|
19|Le Monde (EN – International)|<https://www.lemonde.fr/en/international/rss_full.xml>|200|02/24/2026|valid|100|1360|
20|Le Monde (EN – Editorials)|<https://www.lemonde.fr/en/editorials/rss_full.xml>|200|02/24/2026|valid|100|1360|
21|Le Monde (EN – Europe)|<https://www.lemonde.fr/en/europe/rss_full.xml>|200|02/24/2026|valid|100|1360|
22|Le Monde (EN – United States)|<https://www.lemonde.fr/en/united-states/rss_full.xml>|200|02/24/2026|valid|100|1360|
23|Le Monde (EN – Economy)|<https://www.lemonde.fr/en/economy/rss_full.xml>|200|02/24/2026|valid|100|1360|
24|Le Monde (EN – Culture)|<https://www.lemonde.fr/en/culture/rss_full.xml>|200|02/24/2026|valid|100|1360|
25|Le Monde (EN – Sports)|<https://www.lemonde.fr/en/sports/rss_full.xml>|200|02/24/2026|valid|100|1360|
26|Le Monde (EN – Environment)|<https://www.lemonde.fr/en/environment/rss_full.xml>|200|02/24/2026|valid|100|1360|
27|Le Monde (EN – Science)|<https://www.lemonde.fr/en/science/rss_full.xml>|200|02/24/2026|valid|100|1360|
28|Les Echos (Finance/Markets)|<https://services.lesechos.fr/api/rss/univers/finance-marches>|403 (HTTP_403)|02/24/2026|invalid|0|0|
29|Les Echos (Tech/Media)|<https://services.lesechos.fr/api/rss/univers/tech-medias>|403 (HTTP_403)|02/24/2026|invalid|0|0|
30|Le Monde (Economy)|<https://www.lemonde.fr/economie/rss_full.xml>|200|02/24/2026|valid|60|60|
31|Le Monde (Politics)|<https://www.lemonde.fr/politique/rss_full.xml>|200|02/24/2026|valid|60|60|
32|Le Figaro (Top Stories)|<https://www.lefigaro.fr/rss/figaro_actualites.xml>|200|02/24/2026|valid|60|60|
33|Le Figaro (Economy)|<https://www.lefigaro.fr/rss/figaro_economie.xml>|200|02/24/2026|valid|60|60|
34|La Tribune (Economy)|<https://www.latribune.fr/feed.xml>|200|02/24/2026|valid|0|0|
35|Libération (Society/Politics)|<https://www.liberation.fr/rss/>|Recovered via sitemap|02/24/2026|valid|0|0|
36|L'Express (Current Affairs Magazine)|<https://www.lexpress.fr/arc/outboundfeeds/rss/>|Recovered via sitemap|02/24/2026|valid|0|0|
37|Le Point (Current Affairs/Economy)|<https://www.lepoint.fr/rss.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
38|France Info (Economy)|<https://www.francetvinfo.fr/economie.rss>|200|02/24/2026|valid|60|60|
39|France Info (Politics)|<https://www.francetvinfo.fr/politique.rss>|200|02/24/2026|valid|60|60|
40|BFM TV (Economy/Business)|<https://www.bfmtv.com/rss/economie/>|200|02/24/2026|valid|90|90|
41|Capital.fr (Economy/Capital)|<https://www.capital.fr/rss.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
42|Challenges.fr (Business)|<https://www.challenges.fr/rss.xml>|200|02/24/2026|valid|150|150|
43|Ouest-France (Regional News/Society)|<https://www.ouest-france.fr/rss-en-continu.xml>|200|02/24/2026|valid|30|30|
44|20 Minutes (Economy Breaking)|<https://www.20minutes.fr/feeds/rss-economie.xml>|200|02/24/2026|valid|60|60|
45|L'Obs (General Current Affairs)|<https://www.nouvelobs.com/rss.xml>|200|02/24/2026|valid|360|360|
46|Usine Nouvelle (Industry/Energy/Manufacturing)|<https://www.usinenouvelle.com/rss/>|403 (HTTP_403)|02/24/2026|invalid|0|0|

### Italy (IT)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|ANSA (Main)|<https://www.ansa.it/sito/ansait_rss.xml>|200|02/24/2026|valid|140|1913|
2|ANSA (Top News)|<https://www.ansa.it/sito/notizie/topnews/topnews_rss.xml>|200|02/24/2026|valid|50|680|
3|ANSA (Cronaca)|<https://www.ansa.it/sito/notizie/cronaca/cronaca_rss.xml>|200|02/24/2026|valid|600|8160|
4|ANSA (Politica)|<https://www.ansa.it/sito/notizie/politica/politica_rss.xml>|200|02/24/2026|valid|65|1038|
5|ANSA (Mondo)|<https://www.ansa.it/sito/notizie/mondo/mondo_rss.xml>|200|02/24/2026|valid|241|2616|
6|ANSA (Economia)|<https://www.ansa.it/sito/notizie/economia/economia_rss.xml>|200|02/24/2026|valid|266|2163|
7|ANSA (Calcio)|<https://www.ansa.it/sito/notizie/sport/calcio/calcio_rss.xml>|200|02/24/2026|valid|280|4353|
8|ANSA (Sport)|<https://www.ansa.it/sito/notizie/sport/sport_rss.xml>|200|02/24/2026|valid|140|3695|
9|ANSA (Cinema)|<https://www.ansa.it/sito/notizie/cultura/cinema/cinema_rss.xml>|200|02/24/2026|valid|120|1496|
10|ANSA (Cultura e Tendenze)|<https://www.ansa.it/sito/notizie/cultura/cultura_rss.xml>|200|02/24/2026|valid|540|7664|
11|ANSA (Foto)|<https://www.ansa.it/sito/photogallery/foto_rss.xml>|200|02/24/2026|valid|600|8160|
12|ANSA (Video)|<https://www.ansa.it/sito/videogallery/video_rss.xml>|200|02/24/2026|valid|600|8160|
13|Corriere della Sera (Homepage)|<https://www.corriere.it/rss/homepage.xml>|200|02/24/2026|valid|345|4692|
14|Corriere della Sera (Ultimora)|<https://www.corriere.it/rss/ultimora.xml>|200|02/24/2026|valid|0|0|
15|Corriere della Sera (feed-hp Homepage)|<https://www.corriere.it/feed-hp/homepage.xml>|200|02/24/2026|valid|595|8075|
16|la Repubblica|<https://www.repubblica.it/rss/homepage/rss2.0.xml>|200|02/24/2026|valid|150|2017|
17|La Stampa|<https://www.lastampa.it/rss/copertina.xml>|200|02/24/2026|valid|403|5155|
18|Il Sole 24 Ore (Italia)|<https://www.ilsole24ore.com/rss/italia.xml>|200|02/24/2026|valid|60|816|
19|Il Fatto Quotidiano|<https://www.ilfattoquotidiano.it/feed/>|200|02/24/2026|valid|125|1700|
20|La Gazzetta dello Sport|<https://www.gazzetta.it/rss/home.xml>|200|02/24/2026|valid|600|8160|
21|IL Tempo|<https://www.iltempo.it/rss.xml>|200|02/24/2026|valid|300|5850|
22|Libero Quotidiano|<https://www.liberoquotidiano.it/rss.xml>|200|02/24/2026|valid|300|5695|
23|MilanoToday|<https://www.milanotoday.it/rss>|200|02/24/2026|valid|100|1475|
24|The Florentine|<https://www.theflorentine.net/feed>|200|02/24/2026|valid|0|340|
25|Wanted in Rome|<https://www.wantedinrome.com/news?format=rss>|200|02/24/2026|valid|100|1360|
26|Florence Daily News|<https://florencedailynews.com/feed>|200|02/24/2026|valid|50|680|
27|Alto Adige (Cronaca)|<https://www.altoadige.it/feed-rss/cronaca-1.169>|200|02/24/2026|valid|100|562|
28|Italia a Tavola|<https://rss.italiaatavola.net/feed.xml>|200|02/24/2026|valid|150|2040|
29|la Città di Salerno|<https://www.lacittadisalerno.it/feed>|200|02/24/2026|valid|50|680|
30|Notizie Geopolitiche|<https://www.notiziegeopolitiche.net/feed>|200|02/24/2026|valid|50|670|

### Canada (CA)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Global News|<https://globalnews.ca/feed>|200|02/24/2026|valid|50|680|
2|rabble.ca|<https://rabble.ca/feed>|200|02/24/2026|valid|60|816|
3|National Post|<https://nationalpost.com/feed>|200|02/24/2026|valid|50|680|
4|Toronto Sun|<https://torontosun.com/feed>|200|02/24/2026|valid|50|680|
5|Financial Post|<https://feeds.feedburner.com/FP_TopStories>|200|02/24/2026|valid|50|720|
6|CityNews Toronto|<https://toronto.citynews.ca/feed>|200|02/24/2026|valid|75|1020|
7|Calgary Herald|<https://calgaryherald.com/feed>|200|02/24/2026|valid|50|680|
8|Edmonton Journal|<https://edmontonjournal.com/feed>|200|02/24/2026|valid|50|680|
9|Windsor Star|<https://windsorstar.com/feed>|200|02/24/2026|valid|50|680|
10|The Province|<https://theprovince.com/feed>|200|02/24/2026|valid|50|680|
11|Calgary Sun|<https://calgarysun.com/feed>|200|02/24/2026|valid|50|680|
12|Ottawa Sun|<https://ottawasun.com/feed>|200|02/24/2026|valid|50|680|
13|The Tyee|<https://thetyee.ca/rss2.xml>|200|02/24/2026|valid|105|2072|
14|The StarPhoenix|<https://thestarphoenix.com/feed>|200|02/24/2026|valid|50|680|
15|Edmonton Sun|<https://edmontonsun.com/feed>|200|02/24/2026|valid|50|680|
16|Canada.com|<https://o.canada.com/feed>|200|02/24/2026|valid|50|680|
17|Business In Vancouver (BIV)|<https://biv.com/rss>|200|02/24/2026|valid|100|1360|
18|Regina Leader Post|<https://leaderpost.com/feed>|200|02/24/2026|valid|50|670|
19|Owen Sound Sun Times|<https://owensoundsuntimes.com/feed>|200|02/24/2026|valid|40|544|
20|Stratford Beacon Herald|<https://stratfordbeaconherald.com/feed>|200|02/24/2026|valid|40|544|
21|The Georgia Straight|<https://straight.com/content/rss>|200|02/24/2026|valid|75|1005|
22|Grande Prairie Daily Herald Tribune|<https://dailyheraldtribune.com/feed>|200|02/24/2026|valid|40|544|
23|YGK News (Kingston)|<https://ygknews.ca/feed>|200|02/24/2026|valid|50|670|
24|Prince Albert Daily Herald|<https://paherald.sk.ca/feed>|200|02/24/2026|valid|50|670|
25|Sunny South News|<https://sunnysouthnews.com/feed>|200|02/24/2026|valid|50|680|
26|The Afro News|<https://theafronews.com/feed>|200|02/24/2026|valid|50|660|
27|CTV News - Top Stories|<https://www.ctvnews.ca/rss/ctvnews-ca-top-stories-public-rss-1.822009>|Recovered via sitemap|02/24/2026|valid|0|0|
28|CTV News - Business|<https://www.ctvnews.ca/rss/business/ctvnews-ca-business-public-rss-1.822283>|Recovered via sitemap|02/24/2026|valid|0|0|
29|Global News - Politics|<https://globalnews.ca/politics/feed/>|200|02/24/2026|valid|40|60|
30|Toronto Star - Politics|<https://www.thestar.com/search/?f=rss&t=article&c=politics&l=50&s=start_time&sd=desc>|200|02/24/2026|valid|200|300|
31|BNN Bloomberg (Canada Biz)|<https://www.bnnbloomberg.ca/business/rss>|Recovered via sitemap|02/24/2026|valid|0|0|
32|CBC News - Business|<https://www.cbc.ca/cmlink/rss-business>|ERR (TIMEOUT)|02/24/2026|invalid|0|0|
33|CBC News - World|<https://www.cbc.ca/cmlink/rss-world>|ERR (TIMEOUT)|02/24/2026|invalid|0|0|
34|Financial Post (Economy)|<https://financialpost.com/feed>|200|02/24/2026|valid|40|50|

### Russia (RU)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|RT|<https://rt.com/feed>|200|02/24/2026|valid|500|6800|
2|The Bell|<https://thebell.io/feed>|200|02/24/2026|valid|100|1360|
3|Interfax|<https://www.interfax.ru/rss.asp>|200|02/24/2026|valid|150|1725|
4|RT Economy|<https://www.rt.com/rss/business>|200|02/24/2026|valid|500|6800|
5|The Bell|<https://thebell.io/feed/>|200|02/24/2026|valid|100|1360|
6|Lenta|<https://lenta.ru/rss/news>|200|02/24/2026|valid|600|8160|
7|TASS Finance|<https://tass.com/rss/v2.xml>|200|02/24/2026|valid|367|5448|
8|RT News|<https://www.rt.com/rss/>|200|02/24/2026|valid|500|6800|
9|Kommersant (Главное)|<https://www.kommersant.ru/RSS/main.xml>|200|02/24/2026|valid|190|1183|
10|The Moscow Times|<https://www.themoscowtimes.com/rss/news>|200|02/24/2026|valid|250|3400|
11|PravdaReport|<https://www.pravdareport.com/export.xml>|200|02/24/2026|valid|100|1360|
12|Meduza (all)|<https://meduza.io/rss2/all>|200|02/24/2026|valid|150|2040|
13|Habr (all)|<https://habr.com/ru/rss/all/all/?fl=ru>|200|02/24/2026|valid|200|2720|
14|RIA Novosti (Russian State Broadcaster)|<https://ria.ru/export/rss2/archive/index.xml>|200|02/24/2026|valid|279|279|
15|TASS (TASS Russian Main)|<https://tass.ru/rss/v2.xml>|200|02/24/2026|valid|300|300|
16|RBC (Russian Finance/Economy #1)|<https://rssexport.rbc.ru/rbcnews/news/30/full.rss>|200|02/24/2026|valid|90|90|
17|Kommersant (Economy/Business Major Daily)|<https://www.kommersant.ru/RSS/news.xml>|200|02/24/2026|valid|360|360|
18|Vedomosti (Economy Major Daily)|<https://www.vedomosti.ru/rss/news>|200|02/24/2026|valid|360|360|
19|Gazeta.ru (General News)|<https://www.gazeta.ru/export/rss/lenta.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
20|Izvestia (Traditional Daily)|<https://iz.ru/xml/rss/all.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
21|RT Russian (RT Russian Main)|<https://russian.rt.com/rss>|200|02/24/2026|valid|150|150|
22|Rossiyskaya Gazeta (Official Gazette)|<https://rg.ru/xml/index.xml>|200|02/24/2026|valid|300|300|
23|Forbes Russia (Forbes Russia Edition)|<https://www.forbes.ru/newrss.xml>|200|02/24/2026|valid|0|0|
24|BFM.ru (Business Radio)|<https://www.bfm.ru/news.rss>|200|02/24/2026|valid|150|150|
25|Expert.ru (Economy Magazine)|<https://www.expert.ru/rss/>|Recovered via sitemap|02/24/2026|valid|0|0|
26|Finmarket.ru (Finance/Investment)|<http://www.finmarket.ru/rss/mainnews.asp>|200|02/24/2026|valid|60|60|
27|NTV (major broadcaster)|<https://www.ntv.ru/exp/news_rss.jsp>|Recovered via sitemap|02/24/2026|valid|0|0|
28|Komsomolskaya Pravda (Mass outlet #1)|<https://www.kp.ru/rss/all.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
29|Moskovsky Komsomolets (Mass outlet #2)|<https://www.mk.ru/rss/news/index.xml>|200|02/24/2026|valid|0|0|
30|Rambler News (Portal News)|<https://news.rambler.ru/rss/>|Recovered via sitemap|02/24/2026|valid|0|0|

### South Korea (KR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Yonhap (EN)|<https://en.yna.co.kr/RSS/news.xml>|200|02/24/2026|valid|483|6951|
2|Donga Ilbo|<https://rss.donga.com/total.xml>|200|02/24/2026|valid|250|3400|
3|Seoul Newspaper|<https://www.seoul.co.kr/xml/rss/rss_top.xml>|200|02/24/2026|valid|130|1742|
4|Newsis|<https://www.newsis.com/RSS/sokbo.xml>|200|02/24/2026|valid|500|6800|
5|Aju News|<https://rss.ajunews.com/sokbo.xml>|200|02/24/2026|valid|250|3400|
6|KED Global (Korea Economic Daily)|<https://www.kedglobal.com/newsRss>|200|02/24/2026|valid|0|1159|
7|Daily NK (EN)|<https://www.dailynk.com/english/feed>|200|02/24/2026|valid|50|630|
8|Korea Times (RSS directory)|<https://feed.koreatimes.co.kr/k/allnews.xml>|200|02/24/2026|valid|203|1739|
9|Korea Herald (RSS directory)|<https://www.koreaherald.com/rss/newsAll>|200|02/24/2026|valid|223|3209|
10|KBS World Radio (RSS directory)|<http://world.kbs.co.kr/rss/rss_news.htm?lang=e>|200|02/24/2026|valid|0|1020|
11|hankyung.com|<https://www.hankyung.com/feed/all-news>|200|02/24/2026|valid|250|3400|
12|hankyung.com|<https://www.hankyung.com/feed/finance>|200|02/24/2026|valid|250|3400|
13|hankyung.com|<https://www.hankyung.com/feed/economy>|200|02/24/2026|valid|250|3400|
14|hankyung.com|<https://www.hankyung.com/feed/realestate>|200|02/24/2026|valid|250|3400|
15|IT|<https://www.hankyung.com/feed/it>|200|02/24/2026|valid|250|3400|
16|hankyung.com|<https://www.hankyung.com/feed/politics>|200|02/24/2026|valid|250|3400|
17|hankyung.com|<https://www.hankyung.com/feed/international>|200|02/24/2026|valid|250|3400|
18|mk.co.kr|<https://www.mk.co.kr/rss/30000001/>|200|02/24/2026|valid|250|3400|
19|mk.co.kr|<https://www.mk.co.kr/rss/40300001/>|200|02/24/2026|valid|250|3400|
20|mk.co.kr|<https://www.mk.co.kr/rss/30100041/>|200|02/24/2026|valid|250|3400|
21|mk.co.kr|<https://www.mk.co.kr/rss/30200030/>|200|02/24/2026|valid|250|3400|
22|mk.co.kr|<https://www.mk.co.kr/rss/50400012/>|200|02/24/2026|valid|250|3400|
23|SBS|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=01&plink=RSSREADER>|200|02/24/2026|valid|145|1972|
24|SBS|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=02&plink=RSSREADER>|200|02/24/2026|valid|145|1972|
25|SBS|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=03&plink=RSSREADER>|200|02/24/2026|valid|145|1972|
26|SBS - /|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=07&plink=RSSREADER>|200|02/24/2026|valid|145|1972|
27|SBS - /|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=08&plink=RSSREADER>|200|02/24/2026|valid|145|1972|
28|SBS - /|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=14&plink=RSSREADER>|200|02/24/2026|valid|145|1972|
29|SBS|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=09&plink=RSSREADER>|200|02/24/2026|valid|145|1972|
30|hani.co.kr|<https://www.hani.co.kr/rss/international/>|200|02/24/2026|valid|145|805|
31|hani.co.kr|<https://www.hani.co.kr/rss/culture/>|200|02/24/2026|valid|150|810|
32|hani.co.kr|<https://www.hani.co.kr/rss/sports/>|200|02/24/2026|valid|150|810|
33|hanion.co.kr|<https://www.hanion.co.kr/rss/S1N1.xml>|200|02/24/2026|valid|100|1340|
34|hanion.co.kr|<https://www.hanion.co.kr/rss/S1N2.xml>|200|02/24/2026|valid|100|1340|
35|hanion.co.kr|<https://www.hanion.co.kr/rss/S1N3.xml>|200|02/24/2026|valid|100|1340|
36|khan.co.kr|<https://www.khan.co.kr/rss/rssdata/total_news.xml>|200|02/24/2026|valid|250|3400|
37|MBC|<https://imnews.imbc.com/rss/google_news/narrativeNews.rss>|200|02/24/2026|valid|0|0|
38|chosun.com|<https://www.chosun.com/arc/outboundfeeds/rss/?outputType=xml>|200|02/24/2026|valid|500|6800|

### Brazil (BR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|G1 (Globo - Economy)|<https://g1.globo.com/rss/g1/economia/>|200|02/24/2026|valid|500|6800|
2|G1 (Globo - Tech)|<https://g1.globo.com/rss/g1/tecnologia/>|200|02/24/2026|valid|500|6800|
3|Folha de S.Paulo - Top|<https://feeds.folha.uol.com.br/emcimadahora/rss091.xml>|200|02/24/2026|valid|500|6800|
4|Folha de S.Paulo - Market|<https://feeds.folha.uol.com.br/mercado/rss091.xml>|200|02/24/2026|valid|600|6900|
5|Correio Braziliense|<https://www.correiobraziliense.com.br/rss/noticia/economia/rss.xml>|200|02/24/2026|valid|150|2040|
6|InfoMoney|<https://www.infomoney.com.br/feed/>|200|02/24/2026|valid|50|680|
7|Canaltech|<https://canaltech.com.br/rss/>|200|02/24/2026|valid|250|3350|
8|Forbes Brazil|<https://forbes.com.br/feed/>|200|02/24/2026|valid|250|3400|
9|Estado de Minas|<https://www.em.com.br/feed/>|200|02/24/2026|valid|0|2440|
10|Veja|<https://veja.abril.com.br/feed/>|200|02/24/2026|valid|100|1360|
11|Folha - Poder|<https://feeds.folha.uol.com.br/poder/rss091.xml>|200|02/24/2026|valid|500|6800|
12|Folha - Mundo|<https://feeds.folha.uol.com.br/mundo/rss091.xml>|200|02/24/2026|valid|500|6800|
13|Folha - Cotidiano|<https://feeds.folha.uol.com.br/cotidiano/rss091.xml>|200|02/24/2026|valid|500|6800|
14|Folha - Esporte|<https://feeds.folha.uol.com.br/esporte/rss091.xml>|200|02/24/2026|valid|500|6800|
15|Folha - Ilustrada|<https://feeds.folha.uol.com.br/ilustrada/rss091.xml>|200|02/24/2026|valid|500|6800|
16|Agência Pública|<https://apublica.org/feed/>|200|02/24/2026|valid|50|680|
17|Nexo Jornal|<https://www.nexojornal.com.br/rss.xml>|200|02/24/2026|valid|100|1360|
18|Jornal GGN|<https://jornalggn.com.br/feed/>|200|02/24/2026|valid|24|516|
19|Jacobin Brasil|<https://jacobin.com.br/feed>|200|02/24/2026|valid|60|1260|
20|CartaCapital|<https://www.cartacapital.com.br/feed>|200|02/24/2026|valid|100|1360|
21|G1 Globo (General Top Portal)|<https://g1.globo.com/rss/g1/>|200|02/24/2026|valid|200|200|
22|G1 Política (Politics)|<https://g1.globo.com/rss/g1/politica/>|200|02/24/2026|valid|200|200|
23|UOL Notícias (Breaking and Top Stories)|<https://rss.uol.com.br/feed/noticias.xml>|200|02/24/2026|valid|30|30|
24|UOL Economia (Portal Economy)|<https://rss.uol.com.br/feed/economia.xml>|200|02/24/2026|valid|30|30|
25|Estadão (Mainstream Daily)|<https://www.estadao.com.br/rss/ultimas>|Recovered via sitemap|02/24/2026|valid|0|0|
26|Exame (Business/Economy Magazine)|<https://exame.com/feed/>|200|02/24/2026|valid|50|50|
27|Valor Econômico (Financial Daily)|<https://valor.globo.com/rss/valor>|200|02/24/2026|valid|200|200|
28|CNN Brasil (Business)|<https://www.cnnbrasil.com.br/business/feed/>|404 (HTTP_404)|02/24/2026|invalid|0|0|
29|CartaCapital (Investigative/Analysis)|<https://www.cartacapital.com.br/feed/>|200|02/24/2026|valid|40|40|
30|Poder360 (Politics/Policy)|<https://www.poder360.com.br/feed/>|200|02/24/2026|valid|20|20|
31|Correio Braziliense (Political Coverage)|<https://www.correiobraziliense.com.br/rss/noticia/politica/rss.xml>|200|02/24/2026|valid|60|60|

### Australia (AU)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|ABC News - Business|<https://www.abc.net.au/news/feed/51892/rss.xml>|200|02/24/2026|valid|125|1675|
2|ABC News - World|<https://www.abc.net.au/news/feed/104217382/rss.xml>|200|02/24/2026|valid|20|268|
3|ABC News - Top Stories|<https://www.abc.net.au/news/feed/10719986/rss.xml>|200|02/24/2026|valid|125|1675|
4|Sydney Morning Herald - Business|<https://www.smh.com.au/rss/business.xml>|200|02/24/2026|valid|100|1360|
5|The Age - Business|<https://www.theage.com.au/rss/business.xml>|200|02/24/2026|valid|100|1360|
6|The Australian - Business|<https://www.theaustralian.com.au/business/rss>|200|02/24/2026|valid|0|0|
7|The Guardian Australia|<https://www.theguardian.com/au/rss>|200|02/24/2026|valid|538|7847|
8|ABC News (Top)|<https://www.abc.net.au/news/feed/1106/rss.xml>|200|02/24/2026|valid|40|536|
9|Australian Broadcasting Corporation - World|<https://www.abc.net.au/news/feed/51892/rss.xml?edition=world>|200|02/24/2026|valid|125|1675|
10|The Guardian Australia|<https://www.theguardian.com/australia-news/rss>|200|02/24/2026|valid|118|1563|
11|SBS World News|<https://www.sbs.com.au/news/topic/latest/feed>|200|02/24/2026|valid|125|1700|
12|SBS News (Breaking)|<https://www.sbs.com.au/news/feed>|200|02/24/2026|valid|120|1632|
13|9News|<https://www.9news.com.au/rss>|200|02/24/2026|valid|95|1078|
14|Sydney Morning Herald|<https://www.smh.com.au/rss/feed.xml>|200|02/24/2026|valid|120|1380|
15|The Age|<https://www.theage.com.au/rss/feed.xml>|200|02/24/2026|valid|120|1380|
16|Canberra Times|<https://www.canberratimes.com.au/rss.xml>|200|02/24/2026|valid|83|1193|
17|PerthNow|<https://www.perthnow.com.au/news/feed>|200|02/24/2026|valid|500|6800|
18|The Australian|<https://www.theaustralian.com.au/business/markets/rss>|200|02/24/2026|valid|0|0|
19|7news|<https://7news.com.au/feed>|200|02/24/2026|valid|500|6800|
20|RenewEconomy|<https://reneweconomy.com.au/feed/>|200|02/24/2026|valid|50|340|
21|Australian Mining|<https://www.australianmining.com.au/feed/>|200|02/24/2026|valid|25|170|
22|MacroBusiness|<https://www.macrobusiness.com.au/feed/>|200|02/24/2026|valid|150|1020|
23|SmartCompany|<https://www.smartcompany.com.au/feed/>|200|02/24/2026|valid|50|340|
24|Startup Daily|<https://www.startupdaily.net/feed/>|200|02/24/2026|valid|50|340|
25|The Conversation AU|<https://theconversation.com/au/rss>|Recovered via sitemap|02/24/2026|valid|182|2231|
26|AFR (Financial Review)|<https://www.afr.com/rss>|Recovered via sitemap|02/24/2026|valid|0|0|
27|News.com.au National Top News|<https://www.news.com.au/content-feeds/latest-news-national/>|200|02/24/2026|valid|60|60|
28|News.com.au Finance|<https://www.news.com.au/content-feeds/latest-news-finance/>|200|02/24/2026|valid|60|60|
29|ABC News Australia|<https://www.abc.net.au/news/feed/51120/rss.xml>|200|02/24/2026|valid|50|50|

### Spain (ES)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Expansión (Financial)|<https://e00-expansion.uecdn.es/rss/empresas.xml>|200|02/24/2026|valid|245|3322|
2|Cinco Días (Economy)|<https://cincodias.elpais.com/arc/outboundfeeds/rss/?outputType=xml>|200|02/24/2026|valid|500|6800|
3|El País - Economy|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/economia/portada>|200|02/24/2026|valid|193|2557|
4|El Mundo - Economy|<https://e00-elmundo.uecdn.es/elmundo/rss/economia.xml>|200|02/24/2026|valid|260|3669|
5|El Confidencial|<https://rss.elconfidencial.com/espana/>|200|02/24/2026|valid|75|1020|
6|El Periodico|<https://www.elperiodico.com/es/rss/rss_portada.xml>|200|02/24/2026|valid|0|0|
7|20 Minutos|<https://www.20minutos.es/rss/>|200|02/24/2026|valid|600|8160|
8|El Diario|<https://www.eldiario.es/rss/>|200|02/24/2026|valid|533|6847|
9|eldiario|<https://www.eldiario.es/rss/>|200|02/24/2026|valid|533|6847|
10|Marca|<https://www.marca.com/rss/>|200|02/24/2026|valid|0|0|
11|El Pais|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada>|200|02/24/2026|valid|600|8147|
12|EL PAÍS - Últimas|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/ultimas-noticias/portada>|200|02/24/2026|valid|400|5193|
13|EL PAÍS - Internacional|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/internacional/portada>|200|02/24/2026|valid|108|1406|
14|EL PAÍS - Opinión|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/opinion/portada>|200|02/24/2026|valid|128|1646|
15|EL PAÍS - España|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/espana/portada>|200|02/24/2026|valid|95|1223|
16|EL PAÍS - Sociedad|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/sociedad/portada>|200|02/24/2026|valid|143|1871|
17|EL PAÍS - Ciencia|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/ciencia/portada>|200|02/24/2026|valid|195|2535|
18|EL PAÍS - Tecnología|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/tecnologia/portada>|200|02/24/2026|valid|80|1040|
19|EL PAÍS - Cultura|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/cultura/portada>|200|02/24/2026|valid|155|2057|
20|EL PAÍS - Deportes|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/deportes/portada>|200|02/24/2026|valid|142|1869|
21|EL PAÍS - Gente|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/gente/portada>|200|02/24/2026|valid|105|1399|
22|EL PAÍS - Clima y medio ambiente|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/clima-y-medio-ambiente/portada>|200|02/24/2026|valid|95|1250|
23|La Vanguardia - Portada|<https://www.lavanguardia.com/rss/home.xml>|200|02/24/2026|valid|600|7800|
24|La Vanguardia - Internacional|<https://www.lavanguardia.com/rss/internacional.xml>|200|02/24/2026|valid|500|6500|
25|La Vanguardia - Política|<https://www.lavanguardia.com/rss/politica.xml>|200|02/24/2026|valid|500|6500|
26|La Vanguardia - Opinión|<https://www.lavanguardia.com/rss/opinion.xml>|200|02/24/2026|valid|465|6023|
27|La Vanguardia - Sociedad|<https://www.lavanguardia.com/rss/sociedad.xml>|200|02/24/2026|valid|495|6435|
28|La Vanguardia - Deportes|<https://www.lavanguardia.com/rss/deportes.xml>|200|02/24/2026|valid|500|6500|
29|El Mundo - Portada|<https://e00-elmundo.uecdn.es/rss/portada.xml>|200|02/24/2026|valid|119|1678|
30|The Local Spain (EN)|<https://feeds.thelocal.com/rss/es>|200|02/24/2026|valid|100|1300|
31|El Economista - Portada|<https://www.eleconomista.es/rss/rss-portada.php>|403 (HTTP_403)|02/24/2026|invalid|0|234|
32|El Economista - Mercados|<https://www.eleconomista.es/rss/rss-mercados.php>|403 (HTTP_403)|02/24/2026|invalid|78|244|
33|ABC.es - Economía|<https://www.abc.es/rss/feeds/abc_economia.xml>|200|02/24/2026|valid|100|680|
34|Vozpópuli|<https://www.vozpopuli.com/rss>|200|02/24/2026|valid|125|850|
35|El Periódico de la Energía|<https://elperiodicodelaenergia.com/feed/>|200|02/24/2026|valid|250|1700|
36|Xataka|<https://www.xataka.com/feed>|Recovered via sitemap|02/24/2026|valid|336|2315|
37|ABC.es|<https://www.abc.es/rss/feeds/abc_ultima.xml>|200|02/24/2026|valid|80|100|

### Mexico (MX)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Proceso (Investigative)|<https://www.proceso.com.mx/rss/feed.html>|200|02/24/2026|valid|66|1118|
2|Expansion (Biz)|<https://expansion.mx/rss>|200|02/24/2026|valid|241|3181|
3|Contralínea|<https://www.contralinea.com.mx/feed>|200|02/24/2026|valid|30|408|
4|El Financiero|<https://www.elfinanciero.com.mx/rss/mundo>|200|02/24/2026|valid|500|6711|
5|Proceso World|<https://www.proceso.com.mx/rss/feed.html?output=xml>|200|02/24/2026|valid|66|1118|
6|El Financiero|<https://www.elfinanciero.com.mx/rss>|200|02/24/2026|valid|500|6711|
7|ADN40 (TV Azteca - Economy)|<https://www.adn40.mx/economia/rss>|Recovered via sitemap|02/24/2026|valid|0|0|
8|ADN40 (TV Azteca - Mexico)|<https://www.adn40.mx/mexico/rss>|Recovered via sitemap|02/24/2026|valid|0|0|
9|El Financiero (Economía)|<https://www.elfinanciero.com.mx/rss/economia>|200|02/24/2026|valid|400|600|
10|El Financiero (Mercados)|<https://www.elfinanciero.com.mx/rss/mercados>|200|02/24/2026|valid|400|600|
11|La Jornada - Economía|<https://www.jornada.com.mx/rss/economia.xml>|200|02/24/2026|valid|52|78|
12|Aristegui (Main)|<https://editorial.aristeguinoticias.com/feed/>|200|02/24/2026|valid|50|670|
13|Aristegui (México)|<https://editorial.aristeguinoticias.com/category/mexico/feed/>|200|02/24/2026|valid|75|1005|
14|Aristegui (Dinero y Economía)|<https://editorial.aristeguinoticias.com/category/dinero-y-economia/feed/>|200|02/24/2026|valid|75|1005|
15|Aristegui (Mundo)|<https://editorial.aristeguinoticias.com/category/mundo/feed/>|200|02/24/2026|valid|75|1005|
16|Aristegui En Vivo - Entérate|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/enterate/feed>|200|02/24/2026|valid|75|1005|
17|Aristegui En Vivo - Programas completos|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/programas-completos/feed>|200|02/24/2026|valid|75|1005|
18|Aristegui En Vivo - Entrevistas completas|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/entrevistas-completos/feed>|200|02/24/2026|valid|0|0|
19|Aristegui En Vivo - Mesa política|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/mesa-politica-en-vivo/feed>|200|02/24/2026|valid|75|1005|
20|Aristegui En Vivo - Investigaciones especiales|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/investigaciones-especiales/feed>|200|02/24/2026|valid|75|1005|
21|Aristegui En Vivo - Enlaces en vivo|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/enlaces-en-vivo/feed>|200|02/24/2026|valid|75|1005|
22|Aristegui En Vivo - Titulares del día|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/titulares-del-dia/feed>|200|02/24/2026|valid|75|1005|
23|Aristegui En Vivo - Deportes|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/deportes-aristegui-en-vivo/feed>|200|02/24/2026|valid|75|1005|
24|Aristegui En Vivo - Dinero y Economía|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/dinero-y-economia/feed>|200|02/24/2026|valid|75|1005|
25|Aristegui En Vivo - Niñonautas|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/ninonautas/feed>|200|02/24/2026|valid|75|1005|
26|Aristegui En Vivo - Las plumas de la serpiente|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/las-plumas-de-la-serpiente/feed>|200|02/24/2026|valid|75|1005|
27|El Economista - Top Noticias|<https://www.eleconomista.com.mx/rss/top-noticias>|403 (HTTP_403)|02/24/2026|invalid|0|0|
28|El Economista - Empresas|<https://www.eleconomista.com.mx/rss/empresas>|403 (HTTP_403)|02/24/2026|invalid|0|0|
29|El Universal - General|<https://www.eluniversal.com.mx/rss.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
30|El Universal - Cartera|<https://www.eluniversal.com.mx/cartera/rss.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
31|Milenio|<https://www.milenio.com/rss>|Recovered via sitemap|02/24/2026|valid|0|0|
32|Excelsior|<https://www.excelsior.com.mx/rss.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
33|Forbes México|<https://www.forbes.com.mx/feed/>|Recovered via sitemap|02/24/2026|valid|0|962|
34|Energía a Debate|<https://energiaadebate.com/feed/>|200|02/24/2026|valid|450|3060|
35|Milenio Negocios (Business)|<https://www.milenio.com/negocios/rss>|Recovered via sitemap|02/24/2026|valid|0|0|
36|Aristegui Noticias (Political Investigation)|<https://aristeguinoticias.com/feed/>|Recovered via sitemap|02/24/2026|valid|0|0|
37|La Jornada (Progressive Daily)|<https://www.jornada.com.mx/rss/edicion.xml>|200|02/24/2026|valid|212|212|
38|El Sol de México (Domestic Breaking)|<https://www.elsoldemexico.com.mx/rss.xml>|404 (HTTP_404)|02/24/2026|invalid|0|0|
39|Expansión Economía (Economy Specialist)|<https://expansion.mx/rss/economia>|200|02/24/2026|valid|94|94|
40|Expansión Empresas (Corporate News)|<https://expansion.mx/rss/empresas>|200|02/24/2026|valid|98|98|
41|Sopitas (Millennial Portal)|<https://www.sopitas.com/feed/>|200|02/24/2026|valid|20|20|
42|Animal Político (Political Deep Coverage)|<https://www.animalpolitico.com/feed>|Recovered via sitemap|02/24/2026|valid|0|0|
43|Xataka México (Tech/IT)|<https://www.xataka.com.mx/feed>|Recovered via sitemap|02/24/2026|valid|64|64|

### Indonesia (ID)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Republika|<https://www.republika.co.id/rss>|200|02/24/2026|valid|75|1020|
2|Sindo News|<https://www.sindonews.com/rss/home/>|200|02/24/2026|valid|150|2040|
3|Kapanlagi|<https://www.kapanlagi.com/feed/>|200|02/24/2026|valid|600|6998|
4|Antara TV|<https://www.antaranews.com/rss/terkini>|200|02/24/2026|valid|250|3100|
5|Sindonews|<https://www.sindonews.com/rss/>|200|02/24/2026|valid|150|2040|
6|Republika|<https://www.republika.co.id/rss/terkini>|200|02/24/2026|valid|0|0|
7|ANTARA - Terkini|<https://www.antaranews.com/rss/terkini.xml>|ERR (TIMEOUT)|02/24/2026|invalid|250|2950|
8|ANTARA - Top News|<https://www.antaranews.com/rss/top-news.xml>|200|02/24/2026|valid|150|1920|
9|ANTARA - Politik|<https://www.antaranews.com/rss/politik.xml>|200|02/24/2026|valid|100|1260|
10|ANTARA - Hukum|<https://www.antaranews.com/rss/hukum.xml>|200|02/24/2026|valid|100|1240|
11|ANTARA - Ekonomi|<https://www.antaranews.com/rss/ekonomi.xml>|ERR (TIMEOUT)|02/24/2026|invalid|100|1320|
12|ANTARA - Ekonomi (Finansial)|<https://www.antaranews.com/rss/ekonomi-finansial.xml>|200|02/24/2026|valid|60|1240|
13|ANTARA - Ekonomi (Bisnis)|<https://www.antaranews.com/rss/ekonomi-bisnis.xml>|200|02/24/2026|valid|60|1220|
14|ANTARA - Ekonomi (Bursa)|<https://www.antaranews.com/rss/ekonomi-bursa.xml>|200|02/24/2026|valid|100|1320|
15|ANTARA - Metro|<https://www.antaranews.com/rss/metro.xml>|200|02/24/2026|valid|80|1260|
16|ANTARA - Metro (Kriminalitas)|<https://www.antaranews.com/rss/metro-kriminalitas.xml>|200|02/24/2026|valid|80|1260|
17|ANTARA - Metro (Lintas Kota)|<https://www.antaranews.com/rss/metro-lintas-kota.xml>|200|02/24/2026|valid|100|1280|
18|ANTARA - Metro (Lenggang Jakarta)|<https://www.antaranews.com/rss/metro-lenggang-jakarta.xml>|200|02/24/2026|valid|100|1300|
19|ANTARA - Sepakbola|<https://www.antaranews.com/rss/sepakbola.xml>|200|02/24/2026|valid|100|1280|
20|ANTARA - Sepakbola (Liga Indonesia)|<https://www.antaranews.com/rss/sepakbola-liga-indonesia.xml>|ERR (TIMEOUT)|02/24/2026|invalid|100|1280|
21|ANTARA - Sepakbola (Internasional)|<https://www.antaranews.com/rss/sepakbola-internasional.xml>|200|02/24/2026|valid|100|1200|
22|ANTARA - Sepakbola (Liga Inggris)|<https://www.antaranews.com/rss/sepakbola-liga-inggris-premier.xml>|200|02/24/2026|valid|100|1320|
23|ANTARA - Sepakbola (Liga Spanyol)|<https://www.antaranews.com/rss/sepakbola-liga-spanyol.xml>|200|02/24/2026|valid|100|1300|
24|ANTARA - Sepakbola (Liga Italia)|<https://www.antaranews.com/rss/sepakbola-liga-italia-seri-a.xml>|200|02/24/2026|valid|100|1200|
25|ANTARA - Liga Champions|<https://www.antaranews.com/rss/sepakbola-liga-champions.xml>|200|02/24/2026|valid|80|1180|
26|ANTARA - Olahraga|<https://www.antaranews.com/rss/olahraga.xml>|200|02/24/2026|valid|100|1200|
27|ANTARA - Olahraga (Bulutangkis)|<https://www.antaranews.com/rss/olahraga-bulutangkis.xml>|200|02/24/2026|valid|100|1240|
28|ANTARA - Olahraga (Bola Basket)|<https://www.antaranews.com/rss/olahraga-bola-basket.xml>|200|02/24/2026|valid|100|1280|
29|ANTARA - Olahraga (Tenis)|<https://www.antaranews.com/rss/olahraga-tenis.xml>|200|02/24/2026|valid|100|1320|
30|ANTARA - Olahraga (Balap)|<https://www.antaranews.com/rss/olahraga-balap.xml>|200|02/24/2026|valid|100|1240|
31|ANTARA - Humaniora|<https://www.antaranews.com/rss/humaniora.xml>|200|02/24/2026|valid|80|1240|
32|ANTARA - Lifestyle|<https://www.antaranews.com/rss/lifestyle.xml>|200|02/24/2026|valid|100|1300|
33|ANTARA - Hiburan|<https://www.antaranews.com/rss/hiburan.xml>|200|02/24/2026|valid|100|1280|
34|ANTARA - Dunia|<https://www.antaranews.com/rss/dunia.xml>|200|02/24/2026|valid|100|1320|
35|ANTARA - Dunia (ASEAN)|<https://www.antaranews.com/rss/dunia-asean.xml>|ERR (TIMEOUT)|02/24/2026|invalid|100|1240|
36|ANTARA - Tekno|<https://www.antaranews.com/rss/tekno.xml>|200|02/24/2026|valid|100|1240|
37|RM.ID - Semua berita|<https://rm.id/rss-rakyat-merdeka>|200|02/24/2026|valid|50|670|
38|RM.ID - Nasional|<https://rm.id/rss-rakyat-merdeka/nasional>|200|02/24/2026|valid|0|330|
39|RM.ID - Internasional|<https://rm.id/rss-rakyat-merdeka/internasional>|200|02/24/2026|valid|50|670|
40|RM.ID - Ekonomi Bisnis|<https://rm.id/rss-rakyat-merdeka/ekonomi-bisnis>|200|02/24/2026|valid|50|670|
41|RM.ID - Bank & Finance|<https://rm.id/rss-rakyat-merdeka/bank-finance>|200|02/24/2026|valid|0|0|
42|RM.ID - Indonesianomics|<https://rm.id/rss-rakyat-merdeka/indonesianomics>|200|02/24/2026|valid|0|0|
43|Kompas (Mainstream Daily)|<https://sindikasi.kompas.com/xml/nasional>|ERR (NETWORK)|02/24/2026|invalid|0|0|
44|Kompas Ekonomi (Economy)|<https://sindikasi.kompas.com/xml/ekonomi>|ERR (NETWORK)|02/24/2026|invalid|0|0|
45|Detikcom (Top Breaking Portal)|<https://laporan.detik.com/rss/detiknews.xml>|ERR (NETWORK)|02/24/2026|invalid|0|0|
46|Detik Finance (Finance and Economy)|<https://laporan.detik.com/rss/detikfinance.xml>|ERR (NETWORK)|02/24/2026|invalid|0|0|
47|CNBC Indonesia (Business News)|<https://www.cnbcindonesia.com/news/rss>|200|02/24/2026|valid|200|200|
48|CNBC Indonesia (Market/Stocks)|<https://www.cnbcindonesia.com/market/rss>|200|02/24/2026|valid|200|200|
49|Bisnis Indonesia (Business/Industry)|<https://www.bisnis.com/rss>|404 (HTTP_404)|02/24/2026|invalid|0|0|
50|Kontan (Investment/Finance)|<https://www.kontan.co.id/rss>|200 (HTML_RETURNED)|02/24/2026|invalid|0|0|
51|Tempo.co (Politics and Investigations)|<https://tempo.co/rss>|403 (HTTP_403)|02/24/2026|invalid|0|0|
52|Liputan6 (General Portal)|<https://www.liputan6.com/rss>|Recovered via sitemap|02/24/2026|valid|160|160|
53|Suara (Independent News)|<https://www.suara.com/rss>|Recovered via sitemap|02/24/2026|valid|122|122|
54|Merdeka (Online News)|<https://www.merdeka.com/feed>|Recovered via sitemap|02/24/2026|valid|0|0|
55|Viva.co.id (General Breaking)|<https://www.viva.co.id/rss>|Recovered via sitemap|02/24/2026|valid|0|0|
56|Republika Ekonomi (Business Economy)|<https://republika.co.id/rss/ekonomi>|200|02/24/2026|valid|30|30|

### Netherlands (NL)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|NOS|<https://feeds.nos.nl/nosnieuwsalgemeen>|200|02/24/2026|valid|100|1360|
2|NRC|<https://www.nrc.nl/rss>|200|02/24/2026|valid|595|8079|
3|AD|<https://www.ad.nl/rss.xml>|200|02/24/2026|valid|150|2040|
4|Nu|<https://www.nu.nl/rss/algemeen>|200|02/24/2026|valid|150|2040|
5|NPO Radio 1|<https://www.npo3fm.nl/rss/>|200|02/24/2026|valid|250|3400|
6|NOS Tech|<https://feeds.nos.nl/nosnieuwstech>|200|02/24/2026|valid|100|1360|
7|NRC|<https://www.nrc.nl/nieuws/rss/>|200|02/24/2026|valid|70|1246|
8|Nieuwsuur|<https://feeds.nos.nl/nieuwsuuralgemeen>|200|02/24/2026|valid|100|1360|
9|RTL|<https://www.rtlnieuws.nl/nieuws/rss.xml>|200|02/24/2026|valid|60|816|
10|NRC|<https://www.nrc.nl/rss/>|200|02/24/2026|valid|714|8198|
11|NOS Nieuws - Binnenland|<https://feeds.nos.nl/nosnieuwsbinnenland>|200|02/24/2026|valid|100|1300|
12|NOS Nieuws - Buitenland|<https://feeds.nos.nl/nosnieuwsbuitenland>|200|02/24/2026|valid|100|1300|
13|NOS Nieuws - Politiek|<https://feeds.nos.nl/nosnieuwspolitiek>|200|02/24/2026|valid|100|1300|
14|NOS Nieuws - Economie|<https://feeds.nos.nl/nosnieuwseconomie>|200|02/24/2026|valid|100|1300|
15|NOS Nieuws - Opmerkelijk|<https://feeds.nos.nl/nosnieuwsopmerkelijk>|200|02/24/2026|valid|100|1300|
16|NOS Nieuws - Koningshuis|<https://feeds.nos.nl/nosnieuwskoningshuis>|200|02/24/2026|valid|100|1300|
17|NOS Nieuws - Cultuur & media|<https://feeds.nos.nl/nosnieuwscultuurenmedia>|200|02/24/2026|valid|100|1300|
18|NOS Sport - Algemeen|<https://feeds.nos.nl/nossportalgemeen>|200|02/24/2026|valid|100|1300|
19|NOS Sport - Voetbal|<https://feeds.nos.nl/nosvoetbal>|200|02/24/2026|valid|100|1300|
20|NOS Sport - Wielrennen|<https://feeds.nos.nl/nossportwielrennen>|200|02/24/2026|valid|100|1300|
21|NOS Sport - Schaatsen|<https://feeds.nos.nl/nossportschaatsen>|200|02/24/2026|valid|100|1300|
22|NOS Sport - Tennis|<https://feeds.nos.nl/nossporttennis>|200|02/24/2026|valid|100|1300|
23|NOS Sport - Formule 1|<https://feeds.nos.nl/nossportformule1>|200|02/24/2026|valid|100|1300|
24|NOS op 3|<https://feeds.nos.nl/nosop3>|200|02/24/2026|valid|100|1300|
25|NOS Jeugdjournaal|<https://feeds.nos.nl/jeugdjournaal>|200|02/24/2026|valid|100|1300|
26|De Telegraaf|<https://www.telegraaf.nl/rss>|403 (HTTP_403)|02/24/2026|invalid|0|0|
27|de Volkskrant|<https://www.volkskrant.nl/voorpagina/rss.xml>|200|02/24/2026|valid|58|520|
28|Trouw|<https://www.trouw.nl/voorpagina/rss.xml>|200|02/24/2026|valid|120|1320|
29|Het Parool|<https://www.parool.nl/voorpagina/rss.xml>|200|02/24/2026|valid|51|519|
30|Het Financieele Dagblad (FD)|<https://fd.nl/?rss>|200|02/24/2026|valid|201|1370|
31|Tweakers (Mixed)|<https://tweakers.net/feeds/mixed.xml>|200|02/24/2026|valid|200|2600|
32|BNR Nieuwsradio (Economie)|<https://www.bnr.nl/rss/economie>|Recovered via sitemap|02/24/2026|valid|0|0|
33|Telegraaf (Financieel)|<https://www.telegraaf.nl/rss/financieel>|Recovered via sitemap|02/24/2026|valid|0|0|
34|RTL Z (Business)|<https://www.rtlnieuws.nl/economie/rss.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
35|Nu.nl|<https://www.nu.nl/rss/Algemeen>|200|02/24/2026|valid|120|150|
36|Tweakers|<https://tweakers.net/feeds/nieuws.xml>|200|02/24/2026|valid|0|0|
37|NU.nl Economie (Portal Economy)|<https://www.nu.nl/rss/Economie>|200|02/24/2026|valid|90|90|
38|RTL Nieuws (General Breaking)|<https://www.rtlnieuws.nl/rss.xml>|200|02/24/2026|valid|30|30|
39|FOK! (News/Community)|<https://frontpage.fok.nl/xml/rss>|404 (HTTP_404)|02/24/2026|invalid|0|0|
40|IEX.nl (Stocks/Investments)|<https://www.iex.nl/rss/nieuws.xml>|404 (HTTP_404)|02/24/2026|invalid|0|0|
41|De Correspondent (In-Depth Analysis)|<https://decorrespondent.nl/feed>|404 (HTTP_404)|02/24/2026|invalid|0|0|
42|AG Connect (IT/Industry Trends)|<https://www.agconnect.nl/rss>|Recovered via sitemap|02/24/2026|valid|0|0|

### Switzerland (CH)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Le Temps Economy|<https://www.letemps.ch/economie.rss>|200|02/24/2026|valid|105|1407|
2|NZZ|<https://www.nzz.ch/reisen.rss>|200|02/24/2026|valid|135|1836|
3|NDR|<https://www.ndr.ch/rss/>|200|02/24/2026|valid|50|670|
4|SRF News (Latest)|<https://www.srf.ch/news/bnf/rss/19032223>|200|02/24/2026|valid|300|4020|
5|SRF News (Switzerland)|<https://www.srf.ch/news/bnf/rss/1890>|200|02/24/2026|valid|300|4020|
6|SRF News (International)|<https://www.srf.ch/news/bnf/rss/1922>|200|02/24/2026|valid|300|4020|
7|SRF News (Economy)|<https://www.srf.ch/news/bnf/rss/1926>|200|02/24/2026|valid|300|4020|
8|SRF Sport (Football)|<https://www.srf.ch/sport/bnf/rss/2562>|200|02/24/2026|valid|305|4087|
9|SRF Sport (Ice Hockey)|<https://www.srf.ch/sport/bnf/rss/3418>|200|02/24/2026|valid|160|2144|
10|SRF Sport (Tennis)|<https://www.srf.ch/sport/bnf/rss/2814>|200|02/24/2026|valid|310|4154|
11|SRF Sport (Alpine Skiing)|<https://www.srf.ch/sport/bnf/rss/787950>|200|02/24/2026|valid|150|2010|
12|SRF Wissen (Health)|<https://www.srf.ch/bnf/rss/19919909>|200|02/24/2026|valid|600|8040|
13|SRF Wissen (Tech)|<https://www.srf.ch/bnf/rss/19920122>|200|02/24/2026|valid|430|5762|
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
24|Le News (EN)|<https://lenews.ch/feed>|200|02/24/2026|valid|50|670|
25|The Local Switzerland (EN)|<https://feeds.thelocal.com/rss/ch>|200|02/24/2026|valid|100|1340|
26|NZZ (Latest)|<https://www.nzz.ch/recent.rss>|200|02/24/2026|valid|99|1289|
27|Swissinfo (Business - EN)|<https://www.swissinfo.ch/eng/business/feed>|Recovered via sitemap|02/24/2026|valid|0|0|
28|Finews.ch (Swiss Finance)|<https://www.finews.ch/news/finanzplatz?format=feed&type=rss>|200|02/24/2026|valid|60|75|
29|20 Minuten (Wirtschaft)|<https://www.20min.ch/rss/wirtschaft>|Recovered via sitemap|02/24/2026|valid|0|0|
30|Le Temps|<https://www.letemps.ch/rss>|200 (HTML_RETURNED)|02/24/2026|invalid|0|0|
31|Finanz und Wirtschaft|<https://www.fuw.ch/feed>|Recovered via sitemap|02/24/2026|valid|0|0|
32|NZZ Wirtschaft (Economy - German)|<https://www.nzz.ch/wirtschaft.rss>|200|02/24/2026|valid|117|117|
33|Tages-Anzeiger (Zurich Headlines - German)|<https://www.tagesanzeiger.ch/rss.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
34|Blick (Swiss #1 Popular Daily - German)|<https://www.blick.ch/rss.xml>|200|02/24/2026|valid|0|0|
35|Handelszeitung (Economy Weekly - German)|<https://www.handelszeitung.ch/rss.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
36|Cash.ch (Finance/Investment - German)|<https://www.cash.ch/rss>|Recovered via sitemap|02/24/2026|valid|0|0|
37|RTS Info (French-speaking public broadcaster Breaking - French)|<https://www.rts.ch/info/rss>|Recovered via sitemap|02/24/2026|valid|0|0|
38|Le Temps Suisse (Domestic - French)|<https://www.letemps.ch/suisse.rss>|200|02/24/2026|valid|63|63|
39|Bilan.ch (Economy - French)|<https://www.bilan.ch/rss.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
40|20 Minuten Schweiz (Domestic - German)|<https://www.20min.ch/rss/schweiz>|Recovered via sitemap|02/24/2026|valid|0|0|
41|Watson.ch (News Portal - German)|<https://www.watson.ch/api/rss>|Recovered via sitemap|02/24/2026|valid|0|0|
42|Aargauer Zeitung (Regional Major Daily - German)|<https://www.aargauerzeitung.ch/rss>|403 (HTTP_403)|02/24/2026|invalid|0|0|
43|Berner Zeitung (Bern Major Daily - German)|<https://www.bernerzeitung.ch/rss.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
44|Basler Zeitung (Basel Major Daily - German)|<https://www.bazonline.ch/rss.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
45|Le Matin|<https://www.lematin.ch/rss.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
46|Tribune de Geneve|<https://www.tdg.ch/rss.xml>|Recovered via sitemap|02/24/2026|valid|0|0|

### Turkey (TR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Hürriyet|<https://www.hurriyet.com.tr/rss/anasayfa>|200|02/24/2026|valid|0|0|
2|Sabah|<https://www.sabah.com.tr/rss/sondakika.xml>|200|02/24/2026|valid|134|2633|
3|Haberturk|<https://www.haberturk.com/rss>|200|02/24/2026|valid|500|6800|
4|Cumhuriyet|<https://www.cumhuriyet.com.tr/Rss/>|200|02/24/2026|valid|500|6800|
5|Aksam|<https://www.aksam.com.tr/rss>|200|02/24/2026|valid|100|1360|
6|Takvim|<https://www.takvim.com.tr/rss/feed>|200|02/24/2026|valid|0|0|
7|Cumhuriyet|<https://www.cumhuriyet.com.tr/RSS>|200|02/24/2026|valid|500|6800|
8|HuffPost Turkey|<https://www.hurriyetdailynews.com/rss>|200|02/24/2026|valid|0|0|
9|Haber Turk|<https://www.haberturk.com/rss/>|200|02/24/2026|valid|500|6800|
10|Hürriyet (Anasayfa)|<http://www.hurriyet.com.tr/rss/anasayfa>|200|02/24/2026|valid|0|0|
11|Hürriyet (Gündem)|<http://www.hurriyet.com.tr/rss/gundem>|200|02/24/2026|valid|0|0|
12|Hürriyet (Ekonomi)|<http://www.hurriyet.com.tr/rss/ekonomi>|200|02/24/2026|valid|0|0|
13|Hürriyet (Magazin)|<http://www.hurriyet.com.tr/rss/magazin>|200|02/24/2026|valid|0|0|
14|Hürriyet (Spor)|<http://www.hurriyet.com.tr/rss/spor>|200|02/24/2026|valid|0|0|
15|Hürriyet (Dünya)|<http://www.hurriyet.com.tr/rss/dunya>|200|02/24/2026|valid|0|0|
16|Hürriyet (Teknoloji)|<http://www.hurriyet.com.tr/rss/teknoloji>|200|02/24/2026|valid|0|0|
17|Hürriyet (Sağlık)|<http://www.hurriyet.com.tr/rss/saglik>|200 (HTML_RETURNED)|02/24/2026|invalid|0|0|
18|Hürriyet (Astroloji)|<http://www.hurriyet.com.tr/rss/astroloji>|200|02/24/2026|valid|0|0|
19|Sabah (Anasayfa)|<https://www.sabah.com.tr/rss/anasayfa.xml>|200|02/24/2026|valid|50|670|
20|Sabah (Ekonomi)|<https://www.sabah.com.tr/rss/ekonomi.xml>|200|02/24/2026|valid|50|670|
21|Sabah (Spor)|<https://www.sabah.com.tr/rss/spor.xml>|200|02/24/2026|valid|50|670|
22|Sabah (Gündem)|<https://www.sabah.com.tr/rss/gundem.xml>|200|02/24/2026|valid|50|670|
23|Sabah (Yaşam)|<https://www.sabah.com.tr/rss/yasam.xml>|200|02/24/2026|valid|50|670|
24|Sabah (Dünya)|<https://www.sabah.com.tr/rss/dunya.xml>|200|02/24/2026|valid|50|670|
25|Sabah (Teknoloji)|<https://www.sabah.com.tr/rss/teknoloji.xml>|200|02/24/2026|valid|0|0|
26|Sabah (Turizm)|<https://www.sabah.com.tr/rss/turizm.xml>|200|02/24/2026|valid|0|0|
27|Sabah (Otomobil)|<https://www.sabah.com.tr/rss/otomobil.xml>|200|02/24/2026|valid|0|0|
28|CNN Türk (All / News)|<https://www.cnnturk.com/feed/rss/all/news>|200|02/24/2026|valid|175|2345|
29|CNN Türk (Türkiye / News)|<https://www.cnnturk.com/feed/rss/turkiye/news>|200|02/24/2026|valid|175|2345|
30|CNN Türk (Dünya / News)|<https://www.cnnturk.com/feed/rss/dunya/news>|200|02/24/2026|valid|175|2345|
31|CNN Türk (Ekonomi / News)|<https://www.cnnturk.com/feed/rss/ekonomi/news>|200|02/24/2026|valid|175|2345|
32|CNN Türk (Bilim-Teknoloji / News)|<https://www.cnnturk.com/feed/rss/bilim-teknoloji/news>|200|02/24/2026|valid|0|0|
33|CNN Türk (Spor / News)|<https://www.cnnturk.com/feed/rss/spor/news>|200|02/24/2026|valid|175|2345|
34|CNN Türk (Sağlık / News)|<https://www.cnnturk.com/feed/rss/saglik/news>|200|02/24/2026|valid|175|2345|
35|TRT Haber (Son Dakika)|<http://www.trthaber.com/sondakika.rss>|200|02/24/2026|valid|250|3350|
36|Habertürk (Main)|<http://www.haberturk.com/rss>|200|02/24/2026|valid|500|6700|
37|Dünya (Main)|<https://www.dunya.com/rss?dunya>|200|02/24/2026|valid|125|1675|
38|BBC Türkçe|<https://feeds.bbci.co.uk/turkce/rss.xml>|200|02/24/2026|valid|100|1360|
39|Hürriyet Ekonomi (Major Economy)|<https://www.hurriyet.com.tr/rss/ekonomi>|200|02/24/2026|valid|0|0|
40|Bloomberg HT (Economy and Finance)|<https://www.bloomberght.com/rss>|200|02/24/2026|valid|40|40|
41|Dünya (Economy Specialist)|<https://www.dunya.com/rss>|200|02/24/2026|valid|50|50|
42|NTV (Main Broadcaster)|<https://www.ntv.com.tr/rss>|Recovered via sitemap|02/24/2026|valid|0|0|
43|NTV Ekonomi (Economy)|<https://www.ntv.com.tr/ekonomi.rss>|200|02/24/2026|valid|40|40|
44|Sözcü (National Daily)|<https://www.sozcu.com.tr/rss>|200 (HTML_RETURNED)|02/24/2026|invalid|0|0|
45|Sözcü Ekonomi (Economy)|<https://www.sozcu.com.tr/kategori/ekonomi/rss>|404 (HTTP_404)|02/24/2026|invalid|0|0|
46|Habertürk Ekonomi (Portal Economy)|<https://www.haberturk.com/rss/ekonomi.xml>|200|02/24/2026|valid|60|60|
47|TRT Haber (Public Broadcaster Breaking)|<https://www.trthaber.com/sondakika.rss>|200|02/24/2026|valid|100|100|
48|Milliyet (Major Daily)|<https://www.milliyet.com.tr/rss/rssnew/sondakikarss.xml>|200|02/24/2026|valid|0|0|
49|Karar (Politics and Analysis)|<https://www.karar.com/rss>|200|02/24/2026|valid|80|80|
50|Yeni Şafak (Conservative Daily)|<https://www.yenisafak.com/rss>|200|02/24/2026|valid|30|30|
51|Ensonhaber (General Breaking)|<https://www.ensonhaber.com/rss/ensonhaber.xml>|200|02/24/2026|valid|50|50|
52|T24 (Independent Digital Media)|<https://t24.com.tr/rss>|Recovered via sitemap|02/24/2026|valid|0|0|
53|Webtekno (Tech/IT)|<https://www.webtekno.com/rss.xml>|200|02/24/2026|valid|75|75|

### Saudi Arabia (SA)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Okaz|<https://www.okaz.com.sa/rss/news>|200|02/24/2026|valid|0|0|
2|Al Jazirah|<https://www.aljazeera.net/rss>|200|02/24/2026|valid|125|1700|
3|Al Madina|<https://www.al-madina.com/rssFeed/193>|200|02/24/2026|valid|300|3400|
4|Al Bilad Daily|<https://albiladdaily.com/feed>|200|02/24/2026|valid|50|660|
5|Makkah Newspaper|<https://makkahnewspaper.com/rssFeed/0>|200|02/24/2026|valid|250|3350|
6|Al Jazirah|<https://www.al-jazirah.com/rss/ln.xml>|200|02/24/2026|valid|60|824|
7|Al Arabiya (EN - Business)|<https://english.alarabiya.net/feed/business>|Recovered via sitemap|02/24/2026|valid|0|0|
8|Al Arabiya (EN - Middle East)|<https://english.alarabiya.net/feed/middle-east>|Recovered via sitemap|02/24/2026|valid|0|0|
9|Asharq Business (Bloomberg Arabic)|<https://asharqbusiness.com/feed>|403 (HTTP_403)|02/24/2026|invalid|0|0|
10|Gulf Business (Saudi Section)|<https://gulfbusiness.com/region/saudi-arabia/feed/>|200 (HTML_RETURNED)|02/24/2026|invalid|0|0|
11|Saudi Gazette (Business)|<https://saudigazette.com.sa/rss/3>|200|02/24/2026|valid|0|0|
12|Zawya|<https://www.zawya.com/en/rss>|Recovered via sitemap|02/24/2026|valid|0|0|
13|Arab News|<https://www.arabnews.com/rss.xml>|403 (HTTP_403)|02/24/2026|invalid|0|0|
14|Al Eqtisadiah (Economy - Arabic)|<https://www.aleqt.com/feed>|Recovered via sitemap|02/24/2026|valid|0|0|
15|Saudi Press Agency (Arabic)|<https://www.spa.gov.sa/rss>|Recovered via sitemap|02/24/2026|valid|0|0|
16|Al Riyadh (Main - Arabic)|<https://www.alriyadh.com/rss>|ERR (TLS)|02/24/2026|invalid|0|0|
17|Al Arabiya (Business - Arabic)|<https://www.alarabiya.net/feed/business>|Recovered via sitemap|02/24/2026|valid|0|0|
18|Argaam (Arabic Economy/Stocks #1)|<https://www.argaam.com/ar/rss/news/type/1>|404 (HTTP_404)|02/24/2026|invalid|0|0|
19|Mubasher Saudi (Finance/Markets)|<https://www.mubasher.info/countries/sa/rss>|Recovered via sitemap|02/24/2026|valid|0|0|
20|Al Arabiya Saudi (Saudi Domestic)|<https://www.alarabiya.net/feed/saudi-today>|Recovered via sitemap|02/24/2026|valid|0|0|
21|Sabq (Saudi Top Online Outlet)|<https://sabq.org/feed>|Recovered via sitemap|02/24/2026|valid|0|0|
22|Maaal (Saudi Business)|<https://www.maaal.com/feed>|200 (HTML_RETURNED)|02/24/2026|invalid|0|0|
23|Al Watan (Saudi Domestic Breaking)|<https://www.alwatan.com.sa/rss>|Recovered via sitemap|02/24/2026|valid|0|0|
24|Sky News Arabia (Arabic Business)|<https://www.skynewsarabia.com/rss.xml>|200|02/24/2026|valid|188|188|
25|CNBC Arabia (Middle East Economy)|<https://www.cnbcarabia.com/RSS/117>|200 (HTML_RETURNED)|02/24/2026|invalid|0|0|
26|Independent Arabia (Independent Arabic)|<https://www.independentarabia.com/rss.xml>|200|02/24/2026|valid|300|300|
27|Akhbaar24 (General Portal)|<https://akhbaar24.argaam.com/rss>|Recovered via sitemap|02/24/2026|valid|0|0|
28|Al Yaum (Domestic Trends)|<https://www.alyaum.com/rss>|403 (HTTP_403)|02/24/2026|invalid|0|0|
29|Zawya Arabic (Middle East Business)|<https://www.zawya.com/ar/rss>|Recovered via sitemap|02/24/2026|valid|0|0|

### Taiwan (TW)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Liberty Times - Business|<https://news.ltn.com.tw/rss/business.xml>|200|02/24/2026|valid|200|2720|
2|TechNews Taiwan|<https://technews.tw/feed/>|200|02/24/2026|valid|200|2720|
3|CNA (Central News Agency)|<https://feeds.feedburner.com/cnaFirstNews>|200|02/24/2026|valid|30|408|
4|Formosa Reporter|<https://www.formosapost.com/feed/>|200|02/24/2026|valid|50|670|
5|CNA 政治|<https://feeds.feedburner.com/rsscna/politics>|200|02/24/2026|valid|100|1340|
6|CNA 國際|<https://feeds.feedburner.com/rsscna/intworld>|200|02/24/2026|valid|100|1340|
7|CNA 兩岸|<https://feeds.feedburner.com/rsscna/mainland>|200|02/24/2026|valid|100|1340|
8|CNA 產經證券|<https://feeds.feedburner.com/rsscna/finance>|200|02/24/2026|valid|100|1340|
9|CNA 科技|<https://feeds.feedburner.com/rsscna/technology>|200|02/24/2026|valid|100|1340|
10|CNA 生活|<https://feeds.feedburner.com/rsscna/lifehealth>|200|02/24/2026|valid|100|1340|
11|CNA 社會|<https://feeds.feedburner.com/rsscna/social>|200|02/24/2026|valid|100|1340|
12|CNA 地方|<https://feeds.feedburner.com/rsscna/local>|200|02/24/2026|valid|100|1340|
13|CNA 文化|<https://feeds.feedburner.com/rsscna/culture>|200|02/24/2026|valid|100|1340|
14|CNA 運動|<https://feeds.feedburner.com/rsscna/sport>|200|02/24/2026|valid|100|1340|
15|CNA 娛樂|<https://feeds.feedburner.com/rsscna/stars>|200|02/24/2026|valid|100|1340|
16|Liberty Times 即時|<https://news.ltn.com.tw/rss/all.xml>|200|02/24/2026|valid|200|2680|
17|Liberty Times 政治|<https://news.ltn.com.tw/rss/politics.xml>|200|02/24/2026|valid|200|2640|
18|Liberty Times 社會|<https://news.ltn.com.tw/rss/society.xml>|200|02/24/2026|valid|200|2640|
19|Liberty Times 生活|<https://news.ltn.com.tw/rss/life.xml>|200|02/24/2026|valid|200|2680|
20|Liberty Times 評論|<https://news.ltn.com.tw/rss/opinion.xml>|200|02/24/2026|valid|200|2680|
21|Liberty Times 國際|<https://news.ltn.com.tw/rss/world.xml>|200|02/24/2026|valid|200|2680|
22|Liberty Times 體育|<https://news.ltn.com.tw/rss/sports.xml>|200|02/24/2026|valid|200|2680|
23|Liberty Times 娛樂|<https://news.ltn.com.tw/rss/entertainment.xml>|200|02/24/2026|valid|200|2640|
24|Liberty Times 藝文|<https://news.ltn.com.tw/rss/art.xml>|200|02/24/2026|valid|200|2640|
25|Liberty Times 軍武|<https://news.ltn.com.tw/rss/def.xml>|200|02/24/2026|valid|200|2640|
26|Liberty Times 地方|<https://news.ltn.com.tw/rss/local.xml>|200|02/24/2026|valid|200|2640|
27|Liberty Times 蒐奇|<https://news.ltn.com.tw/rss/novelty.xml>|200|02/24/2026|valid|200|2680|
28|Taipei Times (EN)|<https://www.taipeitimes.com/xml/index.rss>|200|02/24/2026|valid|0|0|
29|The Reporter|<https://www.twreporter.org/a/rss2.xml>|200|02/24/2026|valid|50|670|
30|Newtalk 全部|<https://newtalk.tw/rss/all/>|200|02/24/2026|valid|500|6700|
31|Newtalk 政治|<https://newtalk.tw/rss/category/2>|200|02/24/2026|valid|500|6700|
32|Youth Daily News 軍聞|<https://www.ydn.com.tw/tw/Home/RSS.aspx?TID=2>|200|02/24/2026|valid|90|1171|

### Poland (PL)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Onet|<https://wiadomosci.onet.pl/rss>|200|02/24/2026|valid|100|1360|
2|TVN24|<https://tvn24.pl/tvnmeteo.xml>|200|02/24/2026|valid|160|2144|
3|Fakt|<https://www.fakt.pl/rss/>|200|02/24/2026|valid|100|3045|
4|Wprost|<https://www.wprost.pl/rss/>|200|02/24/2026|valid|300|4585|
5|RMF24 (Main)|<https://www.rmf24.pl/feed>|200|02/24/2026|valid|75|1005|
6|RMF24 Fakty|<https://www.rmf24.pl/fakty/feed>|200|02/24/2026|valid|250|3350|
7|RMF24 Polska|<https://www.rmf24.pl/fakty/polska/feed>|200|02/24/2026|valid|250|3350|
8|RMF24 Polityka|<https://www.rmf24.pl/fakty/polityka/feed>|200|02/24/2026|valid|250|3350|
9|RMF24 Świat|<https://www.rmf24.pl/fakty/swiat/feed>|200|02/24/2026|valid|250|3350|
10|RMF24 Ekonomia|<https://www.rmf24.pl/ekonomia/feed>|200|02/24/2026|valid|250|3350|
11|RMF24 Nauka|<https://www.rmf24.pl/nauka/feed>|200|02/24/2026|valid|250|3350|
12|RMF24 Kultura|<https://www.rmf24.pl/kultura/feed>|200|02/24/2026|valid|250|3350|
13|RMF24 Sport|<https://www.rmf24.pl/sport/feed>|200|02/24/2026|valid|250|3350|
14|RMF24 Ciekawostki|<https://www.rmf24.pl/rozrywka/ciekawostki/feed>|200|02/24/2026|valid|250|3350|
15|RMF24 Komentarze|<https://www.rmf24.pl/tylko-w-rmf24/komentarze/feed>|200|02/24/2026|valid|250|3350|
16|RMF24 Podsumowanie dnia|<https://www.rmf24.pl/fakty/podsumowanie-dnia/feed>|200|02/24/2026|valid|250|3350|
17|PolsatNews Wszystkie|<https://www.polsatnews.pl/rss/wszystkie.xml>|200|02/24/2026|valid|250|3350|
18|PolsatNews Polska|<https://www.polsatnews.pl/rss/polska.xml>|200|02/24/2026|valid|250|3350|
19|PolsatNews Świat|<https://www.polsatnews.pl/rss/swiat.xml>|200|02/24/2026|valid|250|3350|
20|PolsatNews Wideo|<https://www.polsatnews.pl/rss/wideo.xml>|200|02/24/2026|valid|250|3350|
21|PolsatNews Biznes|<https://www.polsatnews.pl/rss/biznes.xml>|200|02/24/2026|valid|250|3350|
22|PolsatNews Technologie|<https://www.polsatnews.pl/rss/technologie.xml>|200|02/24/2026|valid|250|3350|
23|PolsatNews Moto|<https://www.polsatnews.pl/rss/moto.xml>|200|02/24/2026|valid|250|3350|
24|PolsatNews Kultura|<https://www.polsatnews.pl/rss/kultura.xml>|200|02/24/2026|valid|250|3350|
25|PolsatNews Sport|<https://www.polsatnews.pl/rss/sport.xml>|200|02/24/2026|valid|250|3350|
26|PolsatNews Czysta Polska|<https://www.polsatnews.pl/rss/czysta-polska.xml>|200|02/24/2026|valid|250|3350|
27|Nauka w Polsce (All)|<https://naukawpolsce.pl/all/rss.xml>|200|02/24/2026|valid|50|670|
28|Nauka w Polsce (Science categories)|<https://naukawpolsce.pl/naukowy/rss.xml>|200|02/24/2026|valid|50|670|
29|Nauka w Polsce (Technologia)|<https://naukawpolsce.pl/technologia/rss.xml>|200|02/24/2026|valid|50|670|
30|Nauka w Polsce (Blog)|<https://naukawpolsce.pl/blog/rss.xml>|200|02/24/2026|valid|50|670|
31|PAP MediaRoom (All)|<https://pap-mediaroom.pl/rss.xml>|200|02/24/2026|valid|20|182|
32|PAP MediaRoom (Biznes i finanse)|<https://pap-mediaroom.pl/kategoria/biznes-i-finanse/rss.xml>|200|02/24/2026|valid|50|270|
33|PAP MediaRoom (Nauka i technologie)|<https://pap-mediaroom.pl/kategoria/nauka-i-technologie/rss.xml>|200|02/24/2026|valid|50|270|
34|PAP MediaRoom (Kalendarium)|<https://pap-mediaroom.pl/kalendarium/rss.xml>|200|02/24/2026|valid|50|670|
35|Onet Wiadomości (Top Portal News)|<https://wiadomosci.onet.pl/.feed>|200|02/24/2026|valid|60|60|
36|TVN24 Najnowsze (TVN24 News)|<https://tvn24.pl/najnowsze.xml>|200|02/24/2026|valid|79|79|
37|TVN24 Biznes (TVN24 Business)|<https://tvn24.pl/biznes.xml>|200|02/24/2026|valid|108|108|
38|Money.pl (Polish Economy Portal #1)|<https://www.money.pl/rss/>|200|02/24/2026|valid|45|45|
39|Bankier.pl (Finance/Investing)|<https://www.bankier.pl/rss/wiadomosci.xml>|200|02/24/2026|valid|142|142|
40|Wprost (Politics/Current Affairs)|<https://www.wprost.pl/rss>|200|02/24/2026|valid|175|175|
41|Rzeczpospolita (Economy/Politics)|<https://www.rp.pl/rss/all>|Recovered via sitemap|02/24/2026|valid|0|0|
42|Gazeta.pl (Top Portal News)|<https://rss.gazeta.pl/pub/rss/wiadomosci.xml>|200|02/24/2026|valid|90|90|
43|Wiadomosci WP (Wirtualna Polska News)|<https://wiadomosci.wp.pl/rss.xml>|200|02/24/2026|valid|45|45|
44|Dziennik Gazeta Prawna (Business/Legal)|<https://www.gazetaprawna.pl/rss.xml>|200|02/24/2026|valid|57|57|

### Sweden (SE)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Dagens Nyheter|<https://www.dn.se/nyheter/rss/>|200|02/24/2026|valid|600|7984|
2|Dagens Industri|<https://www.di.se/rss/>|200|02/24/2026|valid|100|1360|
3|SVT Nyheter|<https://www.svt.se/nyheter/rss.xml>|200|02/24/2026|valid|100|1360|
4|Göteborgs-Posten|<https://www.gp.se/rss>|200|02/24/2026|valid|114|4217|
5|Sveriges Television|<https://www.svt.se/nyheter/ekonomi/rss.xml>|200|02/24/2026|valid|100|1360|
6|Svt|<https://www.svt.se/nyheter/rss.xml?sectionId=2>|200|02/24/2026|valid|100|1360|
7|Dagens Nyheter Sport|<https://www.dn.se/sport/rss>|200|02/24/2026|valid|500|6800|
8|Dagens Nyheter Business|<https://www.dn.se/ekonomi/rss>|200|02/24/2026|valid|520|7040|
9|Norran|<https://www.norran.se/rss>|200|02/24/2026|valid|150|2040|
10|Aftonbladet - Nyheter (All)|<https://rss.aftonbladet.se/rss2/small/pages/sections/senastenytt/>|200|02/24/2026|valid|170|2210|
11|Aftonbladet - Sportbladet|<https://rss.aftonbladet.se/rss2/small/pages/sections/senastenytt/sport/>|200|02/24/2026|valid|175|2275|
12|Aftonbladet - Sportbladet Fotboll|<https://rss.aftonbladet.se/rss2/small/pages/sections/sportbladet/fotboll/>|200|02/24/2026|valid|175|2275|
13|Aftonbladet - Sportbladet Hockey|<https://rss.aftonbladet.se/rss2/small/pages/sections/sportbladet/hockey/>|200|02/24/2026|valid|175|2275|
14|Aftonbladet - Nöjesbladet|<https://rss.aftonbladet.se/rss2/small/pages/sections/nojesbladet/>|200|02/24/2026|valid|230|2926|
15|Aftonbladet - Kultur|<https://rss.aftonbladet.se/rss2/small/pages/sections/kultur/>|200|02/24/2026|valid|175|2275|
16|Expressen - Nyheter|<https://feeds.expressen.se/nyheter/>|200|02/24/2026|valid|100|1300|
17|GT - Nyheter|<https://feeds.expressen.se/gt/>|200|02/24/2026|valid|100|1300|
18|Svenska Dagbladet - Frontpage|<https://www.svd.se/?service=rss>|200|02/24/2026|valid|150|1950|
19|The Local Sweden (EN)|<https://feeds.thelocal.com/rss/se>|200|02/24/2026|valid|100|1300|
20|Sveriges Radio - Ekot nyhetssändning (pod)|<https://api.sr.se/api/rss/pod/3795>|200|02/24/2026|valid|600|7800|
21|Sveriges Radio - P3 Nyheter på en minut (pod)|<https://api.sr.se/api/rss/pod/22376>|200|02/24/2026|valid|600|7800|
22|Sveriges Radio - Radio Sweden på lätt svenska (program)|<https://api.sr.se/api/rss/program/4916?format=1>|200|02/24/2026|valid|100|1300|
23|Radio Sweden - Sweden Today (podcast xml)|<http://sverigesradio.se/Podradio/xml/SRI_en_sweToday.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
24|Proletären|<https://proletaren.se/rss.xml>|200|02/24/2026|valid|50|726|
25|SVT Lokal - Sydnytt|<http://svt.se/nyheter/regionalt/sydnytt/rss.xml>|200|02/24/2026|valid|100|1300|
26|SVT Lokal - Blekingenytt|<http://svt.se/nyheter/regionalt/blekingenytt/rss.xml>|200|02/24/2026|valid|100|1300|
27|SVT Lokal - Mittnytt|<http://svt.se/nyheter/regionalt/mittnytt/rss.xml>|200|02/24/2026|valid|100|1300|
28|SVT Lokal - Jämtlandsnytt|<http://svt.se/nyheter/regionalt/jamtlandsnytt/rss.xml>|200|02/24/2026|valid|100|1300|
29|Sydsvenskan (fallback)|<https://www.sydsvenskan.se/feeds/feed.xml>|200|02/24/2026|valid|222|2857|
30|Nerikes Allehanda (fallback)|<https://www.na.se/feeds/feed.xml>|200|02/24/2026|valid|245|3214|
31|Dagens Industri (Economy #1 Daily)|<https://www.di.se/rss>|200|02/24/2026|valid|40|40|
32|Expressen Din Ekonomi (Economy)|<https://feeds.expressen.se/din-ekonomi/>|404 (HTTP_404)|02/24/2026|invalid|0|0|
33|Dagens Nyheter Ekonomi (Economy)|<https://www.dn.se/ekonomi/rss/>|200|02/24/2026|valid|208|208|
34|Svenska Dagbladet Näringsliv (Business)|<https://www.svd.se/naringsliv/?service=rss>|200|02/24/2026|valid|60|60|
35|Omni (Swedish News Aggregator)|<https://omni.se/rss>|404 (HTTP_404)|02/24/2026|invalid|0|0|
36|Ny Teknik (Tech and Engineering)|<https://www.nyteknik.se/rss.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
37|Breakit (Startups and VC)|<https://www.breakit.se/feed/artiklar>|200|02/24/2026|valid|37|37|
38|Privata Affärer (Personal Finance/Investing)|<https://www.privataaffarer.se/rss.xml>|200|02/24/2026|valid|200|200|

### Belgium (BE)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|De Morgen|<https://www.demorgen.be/rss.xml>|200|02/24/2026|valid|100|1360|
2|La Libre|<https://www.lalibre.be/arc/outboundfeeds/rss/section/belgique/?outputType=xml>|200|02/24/2026|valid|500|6800|
3|Knack|<https://www.knack.be/feed/>|200|02/24/2026|valid|250|3400|
4|VRT News|<https://www.vrt.be/vrtnws/nl.rss.articles.xml>|200|02/24/2026|valid|250|3200|
5|La Dernière Heure|<https://www.dhnet.be/rss.xml>|200|02/24/2026|valid|500|6800|
6|Le Vif|<https://www.levif.be/feed/>|200|02/24/2026|valid|200|3350|
7|RTBF|<https://rss.rtbf.be/article/rss/highlight_rtbf_info.xml?source=internal>|200|02/24/2026|valid|100|1360|
8|Het Nieuwsblad|<https://www.nieuwsblad.be/rss/>|200|02/24/2026|valid|250|3400|
9|La Libre Belgique|<https://www.lalibre.be/rss/>|200|02/24/2026|valid|500|6800|
10|La Libre|<https://www.lalibre.be/rss>|200|02/24/2026|valid|500|6800|
11|The Bulletin (EN)|<https://www.thebulletin.be/rss.xml>|200|02/24/2026|valid|50|650|
12|HLN (Het Laatste Nieuws)|<https://www.hln.be/home/rss.xml>|200|02/24/2026|valid|150|1950|
13|Brussels Morning|<https://brusselsmorning.com/feed>|200|02/24/2026|valid|250|3150|
14|L'Echo|<https://www.lecho.be/rss/top_stories.xml>|200|02/24/2026|valid|50|650|
15|De Standaard (example section)|<https://www.standaard.be/rss/section/1f2838d4-99ea-49f0-9102-138784c7ea7c>|Recovered via sitemap|02/24/2026|valid|0|0|
16|Het Nieuwsblad (example section)|<https://www.nieuwsblad.be/rss/section/55178e67-15a8-4ddd-a3d8-bfe5708f8932>|Recovered via sitemap|02/24/2026|valid|0|0|
17|Le Soir (main)|<https://www.lesoir.be/rss2/9/cible_principale>|403 (HTTP_403)|02/24/2026|invalid|0|310|
18|Brussels Times|<https://www.brusselstimes.com/rss-feed>|Recovered via sitemap|02/24/2026|valid|0|0|
19|City of Brussels (official)|<https://www.brussels.be/rss.xml>|200|02/24/2026|valid|50|650|

### Thailand (TH)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|The Thaiger|<https://thethaiger.com/feed>|200|02/24/2026|valid|50|680|
2|Khaosod English|<https://www.khaosodenglish.com/rss>|200|02/24/2026|valid|15|125|
3|Matichon|<https://www.matichon.co.th/rss>|200|02/24/2026|valid|150|2900|
4|Prachachat|<https://prachachat.net/feed/>|200|02/24/2026|valid|90|750|
5|Daily News|<https://www.dailynews.co.th/rss>|200|02/24/2026|valid|0|0|
6|Prachatai English (Feedburner)|<http://feeds.feedburner.com/prachataienglish>|200|02/24/2026|valid|50|670|
7|Thai PBS (news feed endpoint)|<https://news.thaipbs.or.th/rss/news>|200|02/24/2026|valid|100|1340|
8|Thairath (News)|<http://www.thairath.co.th/rss/news.xml>|Recovered via sitemap|02/24/2026|valid|0|303|
9|Thairath (Sport)|<http://www.thairath.co.th/rss/sport.xml>|Recovered via sitemap|02/24/2026|valid|0|303|
10|Sanook - Hot News|<http://rssfeeds.sanook.com/rss/feeds/sanook/hot.news.xml>|200|02/24/2026|valid|100|1340|
11|Sanook - Daily News|<http://rssfeeds.sanook.com/rss/feeds/sanook/news.index.xml>|200|02/24/2026|valid|100|1340|
12|Sanook - Politics|<http://rssfeeds.sanook.com/rss/feeds/sanook/news.politic.xml>|200|02/24/2026|valid|100|1340|
13|Sanook - Crime|<http://rssfeeds.sanook.com/rss/feeds/sanook/news.crime.xml>|200|02/24/2026|valid|100|1340|
14|Sanook - World|<http://rssfeeds.sanook.com/rss/feeds/sanook/news.world.xml>|200|02/24/2026|valid|100|1340|
15|Sanook - Economy|<http://rssfeeds.sanook.com/rss/feeds/sanook/news.economic.xml>|200|02/24/2026|valid|50|670|
16|Sanook - Tech (News)|<http://rssfeeds.sanook.com/rss/feeds/sanook/hitech.news.xml>|200|02/24/2026|valid|100|1340|
17|Sanook - Tech (Computer)|<http://rssfeeds.sanook.com/rss/feeds/sanook/hitech.computer.index.xml>|200|02/24/2026|valid|100|1340|
18|Sanook - Tech (Mobile)|<http://rssfeeds.sanook.com/rss/feeds/sanook/hitech.mobile.index.xml>|200|02/24/2026|valid|100|1340|
19|Sanook - Travel|<http://rssfeeds.sanook.com/rss/feeds/sanook/travel.index.xml>|200|02/24/2026|valid|50|670|
20|Sanook - Movies|<http://rssfeeds.sanook.com/rss/feeds/sanook/movie.news.xml>|200|02/24/2026|valid|100|1340|
21|PressDisplay - Bangkok Post|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=1264>|200|02/24/2026|valid|30|81|
22|PressDisplay - Daily News Thailand|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=4863>|200|02/24/2026|valid|0|0|
23|PressDisplay - Krungthep Turakij|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=5261&type=full>|200|02/24/2026|valid|0|0|
24|PressDisplay - The Phuket News|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=eff9&type=full>|200|02/24/2026|valid|165|891|
25|PressDisplay - Novosti Phuketa|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=9wv3&type=full>|200|02/24/2026|valid|130|702|
26|PressDisplay - Window On Phuket|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=9wv4&type=full>|200|02/24/2026|valid|0|0|
27|PressDisplay - Where to Eat in Phuket|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=9wv5&type=full>|200|02/24/2026|valid|0|0|
28|PressDisplay - Prestige (Thailand)|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=9vw7&type=full>|200|02/24/2026|valid|305|1647|
29|PressDisplay - Hello! (Thailand)|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=9vw6&type=full>|200|02/24/2026|valid|235|1269|
30|Khaosod English - Food (category)|<http://www.khaosodenglish.com/category/life/food/feed>|200|02/24/2026|valid|15|125|
31|Thairath (Top News)|<https://www.thairath.co.th/rss/news.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
32|Matichon (Leading Political Daily)|<https://www.matichon.co.th/feed>|200|02/24/2026|valid|150|150|
33|Prachachat (Business/Economy #1)|<https://www.prachachat.net/feed>|200|02/24/2026|valid|90|90|
34|Khaosod (Popular General News)|<https://www.khaosod.co.th/feed>|200|02/24/2026|valid|150|150|
35|Sanook News (Top Portal)|<https://rssfeeds.sanook.com/rss/feeds/sanook/news.index.xml>|200|02/24/2026|valid|60|60|
36|Sanook Economy (Portal Economy)|<https://rssfeeds.sanook.com/rss/feeds/sanook/news.economic.xml>|200|02/24/2026|valid|30|30|
37|Bangkok Biz News (Economy)|<https://www.bangkokbiznews.com/rss/feed>|Recovered via sitemap|02/24/2026|valid|0|0|
38|Manager Online (Politics/Society)|<https://mgronline.com/rss>|Recovered via sitemap|02/24/2026|valid|0|0|
39|The Standard (Top Media)|<https://thestandard.co/feed/>|200|02/24/2026|valid|0|0|
40|Thansettakij|<https://www.thansettakij.com/rss/feed>|Recovered via sitemap|02/24/2026|valid|0|0|
41|Bangkok Insight|<https://www.thebangkokinsight.com/feed/>|200|02/24/2026|valid|20|20|
42|Nation TV|<https://www.nationtv.tv/rss/feed>|Recovered via sitemap|02/24/2026|valid|0|0|
43|Post Today|<https://www.posttoday.com/rss/feed>|Recovered via sitemap|02/24/2026|valid|0|0|
44|MCOT Economy|<https://tna.mcot.net/category/economy/feed>|200 (HTML_RETURNED)|02/24/2026|invalid|0|0|

### Iran (IR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|IRNA|<https://www.irna.ir/rss>|200|02/24/2026|valid|120|1740|
2|Mehr News|<https://www.mehrnews.com/rss>|200|02/24/2026|valid|150|1890|
3|ILNA|<https://www.ilna.news/rss>|200|02/24/2026|valid|150|1980|
4|Khabar Online|<https://www.khabaronline.ir/rss>|200|02/24/2026|valid|150|2010|
5|Iran International|<https://www.iranintl.com/feed>|200|02/24/2026|valid|500|6800|
6|ILNA|<https://www.ilna.ir/rss>|200|02/24/2026|valid|150|2010|
7|Tejarat News|<https://www.tejaratnews.com/rss>|200|02/24/2026|valid|500|6600|
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
19|MehrNews (EN) - Latest|<https://en.mehrnews.com/rss/pl/118>|200|02/24/2026|valid|150|1860|
20|MehrNews (EN) - Iran|<https://en.mehrnews.com/rss/tp/575>|200|02/24/2026|valid|150|1860|
21|MehrNews (EN) - Iran > Iran|<https://en.mehrnews.com/rss/tp/905>|200|02/24/2026|valid|120|1830|
22|MehrNews (EN) - Ethnic Groups|<https://en.mehrnews.com/rss/tp/897>|200|02/24/2026|valid|0|0|
23|MehrNews (EN) - Nature|<https://en.mehrnews.com/rss/tp/898>|200|02/24/2026|valid|25|298|
24|MehrNews (EN) - Historical Sites|<https://en.mehrnews.com/rss/tp/899>|200|02/24/2026|valid|0|0|
25|MehrNews (EN) - Souvenirs|<https://en.mehrnews.com/rss/tp/900>|200|02/24/2026|valid|0|0|
26|MehrNews (EN) - Persian Cuisine|<https://en.mehrnews.com/rss/tp/901>|200|02/24/2026|valid|10|85|
27|ISNA (EN) - Social|<https://en.isna.ir/rss/tp/8>|200 (HTML_RETURNED)|02/24/2026|invalid|0|0|
28|ISNA (EN) - Economy|<https://en.isna.ir/rss/tp/33>|200 (HTML_RETURNED)|02/24/2026|invalid|0|0|
29|ISNA (EN) - Politics|<https://en.isna.ir/rss/tp/13>|200 (HTML_RETURNED)|02/24/2026|invalid|0|0|
30|ISNA (EN) - Culture & Art|<https://en.isna.ir/rss/tp/19>|200 (HTML_RETURNED)|02/24/2026|invalid|0|0|
31|ISNA (EN) - Sports|<https://en.isna.ir/rss/tp/23>|200 (HTML_RETURNED)|02/24/2026|invalid|0|0|
32|ISNA (EN) - Photos|<https://en.isna.ir/rss/tp/27>|200 (HTML_RETURNED)|02/24/2026|invalid|0|0|
33|Tasnim (EN) - Top Stories|<https://www.tasnimnews.ir/en/rss/feed/0/0/8/1/TopStories>|200|02/24/2026|valid|125|1675|
34|Tasnim (EN) - All Stories|<https://www.tasnimnews.ir/en/rss/feed/0/0/0/0/AllStories>|200|02/24/2026|valid|2|596|
35|Tasnim (EN) - Politics|<https://www.tasnimnews.ir/en/rss/feeds/1192/0/0/0>|200|02/24/2026|valid|2|190|
36|Tasnim (EN) - Economy|<https://www.tasnimnews.ir/en/rss/feeds/1193/0/0/0>|200|02/24/2026|valid|0|3|
37|Tasnim (EN) - World|<https://www.tasnimnews.ir/en/rss/feeds/1194/0/0/0>|200|02/24/2026|valid|0|102|

### Argentina (AR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Ámbito - Portada|<https://www.ambito.com/rss/pages/home.xml>|200|02/24/2026|valid|100|1420|
2|Ámbito - Últimas noticias|<https://www.ambito.com/rss/pages/ultimas-noticias.xml>|200|02/24/2026|valid|75|1043|
3|Ámbito - Economía|<https://www.ambito.com/rss/pages/economia.xml>|200|02/24/2026|valid|100|1738|
4|Ámbito - Finanzas|<https://www.ambito.com/rss/pages/finanzas.xml>|200|02/24/2026|valid|100|2288|
5|Ámbito - Negocios|<https://www.ambito.com/rss/pages/negocios.xml>|200|02/24/2026|valid|100|1420|
6|Ámbito - Política|<https://www.ambito.com/rss/pages/politica.xml>|200|02/24/2026|valid|100|1670|
7|Ámbito - Nacional|<https://www.ambito.com/rss/pages/nacional.xml>|200|02/24/2026|valid|100|1420|
8|Ámbito - Mundo|<https://www.ambito.com/rss/pages/mundo.xml>|200|02/24/2026|valid|500|4529|
9|Ámbito - Lifestyle|<https://www.ambito.com/rss/pages/lifestyle.xml>|200|02/24/2026|valid|100|1500|
10|Ámbito - Deportes|<https://www.ambito.com/rss/pages/deportes.xml>|200|02/24/2026|valid|100|1900|
11|Ámbito - Tecnología|<https://www.ambito.com/rss/pages/tecnologia.xml>|200|02/24/2026|valid|100|1420|
12|Ámbito - Autos|<https://www.ambito.com/rss/pages/autos.xml>|200|02/24/2026|valid|100|1420|
13|Ámbito - Edición impresa|<https://www.ambito.com/rss/pages/edicion-impresa.xml>|200|02/24/2026|valid|100|1420|
14|Página/12 - Portada|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/portada>|200|02/24/2026|valid|30|426|
15|Página/12 - Edición impresa|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/edicion-impresa>|200|02/24/2026|valid|112|3251|
16|Página/12 - El País|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/el-pais/notas>|200|02/24/2026|valid|125|1775|
17|Página/12 - Economía|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/economia/notas>|200|02/24/2026|valid|125|1775|
18|Página/12 - Sociedad|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/sociedad/notas>|200|02/24/2026|valid|125|1775|
19|Página/12 - El Mundo|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/el-mundo/notas>|200|02/24/2026|valid|125|1775|
20|Página/12 - Deportes|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/deportes/notas>|200|02/24/2026|valid|125|1775|
21|Página/12 - Ciencia|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/ciencia/notas>|200|02/24/2026|valid|125|1775|
22|Página/12 - Psicología|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/psicologia/notas>|200|02/24/2026|valid|125|1775|
23|Página/12 - Cartas de Lectores|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/cartas-de-lectores/notas>|200|02/24/2026|valid|0|0|
24|Página/12 - Cash|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/suplementos/cash/notas>|200|02/24/2026|valid|125|1775|
25|Página/12 - Las 12|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/suplementos/las12/notas>|200|02/24/2026|valid|125|1775|
26|Página/12 - Radar|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/suplementos/radar/notas>|200|02/24/2026|valid|125|1775|
27|Página/12 - Turismo|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/suplementos/turismo/notas>|200|02/24/2026|valid|0|0|
28|LA NACION - General|<https://www.lanacion.com.ar/arc/outboundfeeds/rss/?outputType=xml>|200|02/24/2026|valid|500|7093|
29|El Cronista - Noticias|<https://www.cronista.com/files/rss/news.xml>|200|02/24/2026|valid|295|4447|
30|Clarín - Ultimo Momento|<https://www.clarin.com/rss/lo-ultimo/>|200|02/24/2026|valid|50|370|
31|Clarín - Economía|<https://www.clarin.com/rss/economia/>|200|02/24/2026|valid|50|370|
32|Clarín - Política|<https://www.clarin.com/rss/politica/>|200|02/24/2026|valid|50|370|
33|La Nación - Economía|<https://www.lanacion.com.ar/arc/outboundfeeds/rss/?outputType=xml&rotation=economia>|200|02/24/2026|valid|500|3700|
34|La Nación - Política|<https://www.lanacion.com.ar/arc/outboundfeeds/rss/?outputType=xml&rotation=politica>|200|02/24/2026|valid|500|3700|
35|Infobae - Argentina|<https://www.infobae.com/feeds/rss/argentina/>|Recovered via sitemap|02/24/2026|valid|0|0|
36|Infobae - Economía|<https://www.infobae.com/feeds/rss/economia/>|Recovered via sitemap|02/24/2026|valid|0|0|
37|El Cronista - Finanzas|<https://www.cronista.com/files/rss/finanzas_markets.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
38|El Cronista - Economía|<https://www.cronista.com/files/rss/economia_politica.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
39|Rosario3 - Home|<https://www.rosario3.com/rss/feed.xml>|200|02/24/2026|valid|200|450|

### Chile (CL)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Diario Financiero|<https://www.df.cl/noticias/site/list/port/rss.xml>|200|02/24/2026|valid|300|3600|
2|The Clinic|<https://www.theclinic.cl/feed/>|200|02/24/2026|valid|50|700|
3|El Rancagüino|<https://www.elrancaguino.cl/feed/>|200|02/24/2026|valid|50|690|
4|Cambio21|<https://cambio21.cl/rss>|200|02/24/2026|valid|500|7100|
5|La Discusión|<https://ladiscusion.cl/feed/>|200|02/24/2026|valid|50|710|
6|La Nación (Chile)|<https://www.lanacion.cl/feed>|200|02/24/2026|valid|50|710|
7|El Siglo|<https://elsiglo.cl/feed>|200|02/24/2026|valid|50|710|
8|The Santiago Times|<https://santiagotimes.cl/feed>|200|02/24/2026|valid|50|690|
9|Infoweek|<https://infoweek.biz/feed>|200|02/24/2026|valid|0|0|
10|El Desconcierto|<https://www.eldesconcierto.cl/feed/>|200|02/24/2026|valid|200|4600|
11|La Prensa Austral|<https://laprensaaustral.cl/feed/>|200|02/24/2026|valid|50|710|
12|CIPER Chile|<https://www.ciperchile.cl/feed/>|200|02/24/2026|valid|80|1136|
13|Radio Universidad de Chile|<https://radio.uchile.cl/feed/>|200|02/24/2026|valid|150|2070|
14|La Tercera - Home|<https://www.latercera.com/arc/outboundfeeds/rss/?outputType=xml>|200|02/24/2026|valid|500|3700|
15|Pulso (La Tercera Biz)|<https://www.latercera.com/arc/outboundfeeds/rss/?outputType=xml&rotation=pulso>|200|02/24/2026|valid|500|3700|
16|Emol - Nacional|<https://www.emol.com/rss/rss_nacional.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
17|Emol - Economía|<https://www.emol.com/rss/rss_economia.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
18|BioBioChile - Home|<https://www.biobiochile.cl/feed>|Recovered via sitemap|02/24/2026|valid|0|0|
19|Cooperativa - Economía|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_5___1.xml>|200|02/24/2026|valid|75|555|
20|Cooperativa - País|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_3___1.xml>|200|02/24/2026|valid|60|135|
21|Cooperativa - País|<https://m.cooperativa.cl/noticias/site/tax/port/all/rss_3___1.xml>|200|02/24/2026|valid|60|135|
22|Cooperativa - Deportes|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_1___24.xml>|200|02/24/2026|valid|60|135|
23|Cooperativa - Deportes|<https://m.cooperativa.cl/noticias/site/tax/port/all/rss_1___24.xml>|200|02/24/2026|valid|60|135|
24|Cooperativa - Cine|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_4_4__1.xml>|200|02/24/2026|valid|60|135|
25|Cooperativa - Música|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_4_11__1.xml>|200|02/24/2026|valid|60|135|
26|Cooperativa - Banco Central|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_6_82__1.xml>|200|02/24/2026|valid|60|135|
27|Cooperativa - Banco Central|<https://m.cooperativa.cl/noticias/site/tax/port/all/rss_6_82__1.xml>|200|02/24/2026|valid|60|135|
28|Cooperativa - Banco Central|<https://m.cooperativa.cl/noticias/site/tax/port/fid_noticia/rss_6_82__1.xml>|200|02/24/2026|valid|60|135|
29|Cooperativa - Banco Central|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_6_82__1.xml>|200|02/24/2026|valid|60|135|
30|Cooperativa - Fútbol|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_1_30__1.xml>|200|02/24/2026|valid|60|135|
31|Cooperativa - Universidad de Chile|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_1_30_332_1.xml>|200|02/24/2026|valid|60|135|
32|Cooperativa - Copa Davis|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_1_58_534_1.xml>|200|02/24/2026|valid|60|135|
33|Cooperativa - Sociedad|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_7_136__1.xml>|200|02/24/2026|valid|60|135|
34|Cooperativa - Genética (Sociedad)|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_7_221_1735_1.xml>|200|02/24/2026|valid|12|27|
35|Cooperativa - Genética (88frases)|<https://88frases.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_7_221_1735_1.xml>|200|02/24/2026|valid|12|18|
36|Cooperativa - Oftalmología (Sociedad)|<https://88frases.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_7_120_1804_1.xml>|200|02/24/2026|valid|32|72|
37|Cooperativa - Donald Trump|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_2_76_2384_1.xml>|200|02/24/2026|valid|60|135|
38|Cooperativa - Argentina|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_2_70__1.xml>|200|02/24/2026|valid|60|135|
39|Cooperativa - Música Chilena|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_4_11_779_1.xml>|200|02/24/2026|valid|60|135|
40|Cooperativa - Cine|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_4_4__1.xml>|200|02/24/2026|valid|60|135|
41|Cooperativa - Música|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_4_11__1.xml>|200|02/24/2026|valid|60|135|
42|Cooperativa - Venezuela|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_3_81_1474_1.xml>|200|02/24/2026|valid|60|135|
43|Reporte Minero|<https://www.reporteminero.cl/feed>|404 (HTTP_404)|02/24/2026|invalid|0|1794|
44|Diario Concepcion|<https://www.diarioconcepcion.cl/feed>|Recovered via sitemap|02/24/2026|valid|160|160|

### Dominican Republic (DO)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Diario Libre - Portada|<https://www.diariolibre.com/rss/portada.xml>|200|02/24/2026|valid|147|2533|
2|Diario Libre - Actualidad|<https://www.diariolibre.com/rss/actualidad.xml>|200|02/24/2026|valid|150|2130|
3|Diario Libre - Política|<https://www.diariolibre.com/rss/politica.xml>|200|02/24/2026|valid|150|2130|
4|Diario Libre - Economía|<https://www.diariolibre.com/rss/economia.xml>|200|02/24/2026|valid|150|2130|
5|Diario Libre - Opinión|<https://www.diariolibre.com/rss/opinion.xml>|200|02/24/2026|valid|150|2130|
6|Diario Libre - Deportes|<https://www.diariolibre.com/rss/deportes.xml>|200|02/24/2026|valid|150|2130|
7|Diario Libre - Mundo|<https://www.diariolibre.com/rss/mundo.xml>|200|02/24/2026|valid|150|2130|
8|Diario Libre - Videos|<https://www.diariolibre.com/rss/videos.xml>|200|02/24/2026|valid|150|2130|
9|Diario Libre - Edición USA|<https://www.diariolibre.com/rss/dl-usa.xml>|200|02/24/2026|valid|150|2130|
10|AlMomento - Portada|<https://almomento.net/feed/>|200|02/24/2026|valid|100|1420|
11|AlMomento - Política|<https://almomento.net/categoria/politica/feed/>|200|02/24/2026|valid|100|1400|
12|AlMomento - Deportes|<https://almomento.net/categoria/deportes/feed/>|200|02/24/2026|valid|100|1400|
13|AlMomento - Económicas|<https://almomento.net/categoria/economicas/feed/>|200|02/24/2026|valid|80|1380|
14|AlMomento - Dominicanos en el Exterior|<https://almomento.net/categoria/dominicanos-en-el-exterior/feed/>|200|02/24/2026|valid|0|0|
15|AlMomento - Internacionales|<https://almomento.net/categoria/internacionales/feed/>|200|02/24/2026|valid|100|1420|
16|AlMomento - Variedades|<https://almomento.net/categoria/variedades/feed/>|200|02/24/2026|valid|80|1380|
17|AlMomento - Opinión|<https://almomento.net/categoria/opinion/feed/>|200|02/24/2026|valid|100|1400|
18|AlMomento - Haití|<https://almomento.net/categoria/haiti/feed/>|200|02/24/2026|valid|100|1400|
19|AlMomento - Provincias|<https://almomento.net/categoria/provincias/feed/>|200|02/24/2026|valid|80|1400|
20|El Nacional|<https://elnacional.com.do/feed/>|200|02/24/2026|valid|105|1080|
21|El Nuevo Diario|<https://elnuevodiario.com.do/feed/>|200|02/24/2026|valid|70|730|
22|Listín Diario - Portada|<https://listindiario.com/rss/portada.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
23|Listín Diario - Economía|<https://listindiario.com/rss/economia.xml>|200|02/24/2026|valid|500|3700|
24|Periódico Hoy|<https://hoy.com.do/feed/>|Recovered via sitemap|02/24/2026|valid|0|0|
25|El Dinero|<https://eldinero.com.do/feed/>|200|02/24/2026|valid|100|740|
26|Acento|<https://acento.com.do/feed/>|Recovered via sitemap|02/24/2026|valid|0|0|
27|Acento - Author Feed|<https://acento.com.do/author/jcastillo/feed/>|Recovered via sitemap|02/24/2026|valid|0|0|
28|Noticias SIN|<https://feeds.feedburner.com/noticiassin1>|200|02/24/2026|valid|40|90|
29|Noticias SIN|<https://noticiassin.com/feed/>|Recovered via sitemap|02/24/2026|valid|0|0|
30|El Caribe|<https://www.elcaribe.com.do/feed/>|Recovered via sitemap|02/24/2026|valid|0|0|

### Uruguay (UY)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|El Observador - Home|<https://www.elobservador.com.uy/rss/pages/home.xml>|200|02/24/2026|valid|100|1420|
2|El Observador - Último momento|<https://www.elobservador.com.uy/rss/pages/ultimo-momento.xml>|200|02/24/2026|valid|95|1305|
3|El Observador - Mundo|<https://www.elobservador.com.uy/rss/pages/Mundo.xml>|200|02/24/2026|valid|100|1420|
4|El Observador - Nacional|<https://www.elobservador.com.uy/rss/pages/nacional.xml>|200|02/24/2026|valid|100|1420|
5|El Observador - Sociales|<https://www.elobservador.com.uy/rss/pages/sociales.xml>|200|02/24/2026|valid|100|1420|
6|El Observador - Café y Negocios|<https://www.elobservador.com.uy/rss/pages/cafe-y-negocios.xml>|200|02/24/2026|valid|100|1420|
7|El Observador - Agro|<https://www.elobservador.com.uy/rss/pages/Agro.xml>|200|02/24/2026|valid|100|1420|
8|El Observador - Economía y Empresas|<https://www.elobservador.com.uy/rss/pages/economia.xml>|200|02/24/2026|valid|100|1420|
9|El Observador - Opinión|<https://www.elobservador.com.uy/rss/pages/opinion.xml>|200|02/24/2026|valid|100|1420|
10|El Observador - Salud|<https://www.elobservador.com.uy/rss/pages/salud.xml>|200|02/24/2026|valid|100|1420|
11|El Observador - Ciencia y Tecnología|<https://www.elobservador.com.uy/rss/pages/ciencia-y-tecnologia.xml>|200|02/24/2026|valid|100|1420|
12|El Observador - Cultura y Espectáculos|<https://www.elobservador.com.uy/rss/pages/cultura-y-espectaculos.xml>|200|02/24/2026|valid|100|1420|
13|El Observador - Ediciones especiales|<https://www.elobservador.com.uy/rss/pages/ediciones-especiales.xml>|200|02/24/2026|valid|100|1420|
14|El Observador - Referí|<https://www.elobservador.com.uy/rss/pages/referi.xml>|200|02/24/2026|valid|100|1420|
15|El Observador - Running|<https://www.elobservador.com.uy/rss/pages/running.xml>|200|02/24/2026|valid|100|1420|
16|El Observador - Selección|<https://www.elobservador.com.uy/rss/pages/seleccion.xml>|200|02/24/2026|valid|100|1420|
17|El Observador - Rugby|<https://www.elobservador.com.uy/rss/pages/rugby.xml>|200|02/24/2026|valid|100|1420|
18|El Observador - Polideportivo|<https://www.elobservador.com.uy/rss/pages/polideportivo.xml>|200|02/24/2026|valid|100|1420|
19|El Observador - Básquetbol|<https://www.elobservador.com.uy/rss/pages/basquetbol.xml>|200|02/24/2026|valid|100|1420|
20|El Observador - Copa América|<https://www.elobservador.com.uy/rss/pages/copa-america-odl.xml>|200|02/24/2026|valid|100|1420|
21|El Observador - Motor|<https://www.elobservador.com.uy/rss/pages/motor.xml>|200|02/24/2026|valid|100|1420|
22|El Observador - Fútbol internacional|<https://www.elobservador.com.uy/rss/pages/futbol-internacional.xml>|200|02/24/2026|valid|100|1420|
23|El Observador - Fútbol|<https://www.elobservador.com.uy/rss/pages/futbol.xml>|200|02/24/2026|valid|100|1420|
24|El Observador - Copa Libertadores|<https://www.elobservador.com.uy/rss/pages/copa-libertadores.xml>|200|02/24/2026|valid|100|1420|
25|Montevideo Portal - Información destacada|<https://www.montevideo.com.uy/anxml.aspx?58>|200|02/24/2026|valid|204|3417|
26|Montevideo Portal - Noticias|<https://www.montevideo.com.uy/anxml.aspx?59>|200|02/24/2026|valid|32|560|
27|Montevideo Portal - Tiempo Libre|<https://www.montevideo.com.uy/anxml.aspx?60>|200|02/24/2026|valid|32|560|
28|Montevideo Portal - Tecnología|<https://www.montevideo.com.uy/anxml.aspx?133>|200|02/24/2026|valid|24|420|
29|Montevideo Portal - Negocios & Tendencias|<https://www.montevideo.com.uy/anxml.aspx?728>|200|02/24/2026|valid|52|897|
30|Montevideo Portal - Deportes|<https://www.montevideo.com.uy/anxml.aspx?1727>|200|02/24/2026|valid|64|1120|
31|El País - Portada|<https://www.elpais.com.uy/rss>|403 (HTTP_403)|02/24/2026|invalid|100|740|
32|El País - Economía|<https://www.elpais.com.uy/rss/economia-y-mercado>|200|02/24/2026|valid|100|740|
33|Montevideo Portal - Negocios|<https://www.montevideo.com.uy/anxml.aspx?728>|200|02/24/2026|valid|52|468|
34|La Diaria - Política|<https://ladiaria.com.uy/feeds/section/politica/>|Recovered via sitemap|02/24/2026|valid|0|234|
35|La Diaria - Economía|<https://ladiaria.com.uy/feeds/section/economia/>|Recovered via sitemap|02/24/2026|valid|0|234|
36|Subrayado - Home|<https://www.subrayado.com.uy/rss/pages/home.xml>|200|02/24/2026|valid|80|180|
37|Subrayado - Sociedad|<https://www.subrayado.com.uy/rss/pages/sociedad.xml>|200|02/24/2026|valid|80|180|
38|Subrayado - Nacional|<https://www.subrayado.com.uy/rss/pages/nacional.xml>|200|02/24/2026|valid|80|180|
39|Subrayado - Política|<https://www.subrayado.com.uy/rss/pages/politica.xml>|200|02/24/2026|valid|80|180|
40|Subrayado - Policiales|<https://www.subrayado.com.uy/rss/pages/policiales.xml>|200|02/24/2026|valid|80|180|
41|Subrayado - Internacionales|<https://www.subrayado.com.uy/rss/pages/internacionales.xml>|200|02/24/2026|valid|80|180|
42|Subrayado - Opinión|<https://www.subrayado.com.uy/rss/pages/opinion.xml>|200|02/24/2026|valid|80|180|
43|Subrayado - Tecnología e Internet|<https://www.subrayado.com.uy/rss/pages/tecnologia-internet.xml>|200|02/24/2026|valid|80|180|
44|Subrayado - Deportes|<https://www.subrayado.com.uy/rss/pages/deportes.xml>|200|02/24/2026|valid|80|180|
45|Subrayado - Economía|<https://www.subrayado.com.uy/rss/pages/economia.xml>|200|02/24/2026|valid|80|180|
46|Subrayado|<https://www.subrayado.com.uy/rss/pages/ultimas-noticias.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
47|Teledoce|<https://www.teledoce.com/feed/>|200|02/24/2026|valid|30|30|
48|La Diaria|<https://ladiaria.com.uy/feeds/articles/>|Recovered via sitemap|02/24/2026|valid|0|0|
49|La Republica|<https://www.republica.com.uy/feed/>|404 (HTTP_404)|02/24/2026|invalid|0|0|
50|Caras y Caretas|<https://www.carasycaretas.com.uy/feed>|Recovered via sitemap|02/24/2026|valid|0|0|
51|El Pais Uruguay|<https://www.elpais.com.uy/rss/ultimas-noticias>|200|02/24/2026|valid|0|0|

### Austria (AT)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Der Standard|<https://www.derstandard.at/rss>|200|02/24/2026|valid|840|8400|
2|ORF|<https://rss.orf.at/news.xml>|200|02/24/2026|valid|0|0|
3|Die Presse|<https://www.diepresse.com/rss>|200|02/24/2026|valid|398|5016|
4|Tiroler Tageszeitung|<https://www.tt.com/rss/news.xml>|200|02/24/2026|valid|355|4484|
5|ORF Aktuell|<https://rss.orf.at/>|200|02/24/2026|valid|0|240|
6|Kurier (Top News)|<https://kurier.at/xml/rssd>|200|02/24/2026|valid|100|1360|
7|Neue Donau|<https://www.neue.at/feed>|200|02/24/2026|valid|50|670|
8|Der Standard|<https://www.derstandard.at/rss?section=welt>|200|02/24/2026|valid|600|8160|
9|Kleine Zeitung|<https://www.kleinezeitung.at/rss/home>|200|02/24/2026|valid|7|70|
10|Der Standard|<https://www.derstandard.at/rss?output=amp>|200|02/24/2026|valid|600|8160|
11|Der Standard Plus|<https://www.derstandard.at/rss/wirtschaft>|200|02/24/2026|valid|160|2176|
12|derStandard - International|<https://www.derstandard.at/rss/international>|200|02/24/2026|valid|172|2409|
13|derStandard - Inland|<https://www.derstandard.at/rss/inland>|200|02/24/2026|valid|160|2176|
14|derStandard - Web|<https://www.derstandard.at/rss/web>|200|02/24/2026|valid|255|3468|
15|derStandard - Sport|<https://www.derstandard.at/rss/sport>|200|02/24/2026|valid|210|2856|
16|derStandard - Panorama|<https://www.derstandard.at/rss/panorama>|200|02/24/2026|valid|160|2180|
17|derStandard - Etat|<https://www.derstandard.at/rss/etat>|200|02/24/2026|valid|170|2315|
18|derStandard - Kultur|<https://www.derstandard.at/rss/kultur>|200|02/24/2026|valid|175|2380|
19|derStandard - Wissenschaft|<https://www.derstandard.at/rss/wissenschaft>|200|02/24/2026|valid|265|3551|
20|derStandard - Gesundheit|<https://www.derstandard.at/rss/gesundheit>|200|02/24/2026|valid|80|1088|
21|derStandard - Lifestyle|<https://www.derstandard.at/rss/lifestyle>|200|02/24/2026|valid|235|3197|
22|derStandard - Karriere|<https://www.derstandard.at/rss/karriere>|200|02/24/2026|valid|140|1904|
23|derStandard - Immobilien|<https://www.derstandard.at/rss/immobilien>|200|02/24/2026|valid|120|1632|
24|derStandard - Diskurs|<https://www.derstandard.at/rss/diskurs>|200|02/24/2026|valid|230|3157|
25|derStandard - dieStandard.at|<https://www.derstandard.at/rss/diestandard>|200|02/24/2026|valid|135|1836|
26|derStandard - Live|<https://www.derstandard.at/rss/live>|200|02/24/2026|valid|110|1474|
27|derStandard - Video|<https://www.derstandard.at/rss/video>|200|02/24/2026|valid|100|1340|
28|derStandard - Podcast|<https://www.derstandard.at/rss/podcast>|200|02/24/2026|valid|135|1836|
29|derStandard - Recht|<https://www.derstandard.at/rss/recht>|200|02/24/2026|valid|80|1088|
30|ORF Wien (Vienna Local/Business)|<https://rss.orf.at/wien.xml>|200|02/24/2026|valid|57|57|
31|Die Presse (Political Headlines)|<https://www.diepresse.com/rss/Home>|Recovered via sitemap|02/24/2026|valid|0|0|
32|Die Presse (Economy)|<https://www.diepresse.com/rss/Wirtschaft>|200|02/24/2026|valid|147|147|
33|Kurier (Top Daily)|<https://kurier.at/xml/rss>|200|02/24/2026|valid|60|60|
34|Finanzen.at (Stocks/Finance)|<https://www.finanzen.at/rss/news>|403 (HTTP_403)|02/24/2026|invalid|0|0|
35|Trend.at (Business Magazine)|<https://www.trend.at/xml/rss>|Recovered via sitemap|02/24/2026|valid|0|0|
36|Kronen Zeitung|<https://www.krone.at/rss.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
37|Heute|<https://www.heute.at/rss/news>|Recovered via sitemap|02/24/2026|valid|0|0|
38|OE24|<https://www.oe24.at/news/rss>|Recovered via sitemap|02/24/2026|valid|0|0|
39|OR Nachrichten|<https://www.nachrichten.at/news/rss.xml>|Recovered via sitemap|02/24/2026|valid|0|0|
40|Vienna Online|<https://www.vienna.at/news/feed>|Recovered via sitemap|02/24/2026|valid|0|0|

### Norway (NO)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|NRK|<https://www.nrk.no/toppsaker.rss>|200|02/24/2026|valid|500|6700|
2|NRK News|<https://www.nrk.no/nyheter/siste.rss>|200|02/24/2026|valid|100|1360|
3|TV2|<https://www.tv2.no/rss/toppsaker.xml>|200|02/24/2026|valid|0|0|
4|E24|<https://e24.no/rss>|200|02/24/2026|valid|30|484|
5|Dagbladet|<https://www.dagbladet.no/rss/nyheter>|200|02/24/2026|valid|575|7820|
6|TV2|<https://www.tv2.no/rss/nyheter/>|200|02/24/2026|valid|100|1360|
7|E24|<https://e24.no/rss/okonomi.xml>|200|02/24/2026|valid|24|479|
8|TV2|<https://www.tv2.no/rss/politikk.xml>|200|02/24/2026|valid|0|0|
9|E24|<https://e24.no/rss/nyheter.xml>|200|02/24/2026|valid|24|478|
10|VG - Forsiden|<https://www.vg.no/rss/feed/forsiden/>|Recovered via sitemap|02/24/2026|valid|0|138|
11|VG - Innenriks|<https://www.vg.no/rss/feed/?categories=1069>|200|02/24/2026|valid|50|650|
12|VG - Utenriks|<https://www.vg.no/rss/feed/?categories=1070>|200|02/24/2026|valid|50|650|
13|E24 - Børs og finans|<https://e24.no/rss2/?seksjon=boers-og-finans>|200|02/24/2026|valid|50|650|
14|E24 - Aksjetips|<http://e24.no/rss2/?seksjon=aksjetips>|200|02/24/2026|valid|25|453|
15|E24 - IT & Telekom|<http://e24.no/rss2/?seksjon=it>|200|02/24/2026|valid|25|455|
16|NRK - RSS oversikt (directory)|<https://www.nrk.no/rss/>|Recovered via sitemap|02/24/2026|valid|0|1794|
17|NRK - Innenriks|<https://www.nrk.no/norge/toppsaker.rss>|200|02/24/2026|valid|100|1300|
18|TV2 - Nyheter|<https://www.tv2.no/rss/nyheter>|200|02/24/2026|valid|140|1340|
19|TV2 - Innenriks|<https://www.tv2.no/rss/nyheter/innenriks>|200|02/24/2026|valid|100|1300|
20|TV2 - Utenriks|<https://www.tv2.no/rss/nyheter/utenriks>|200|02/24/2026|valid|100|1300|
21|TV2 - Sport|<https://www.tv2.no/rss/sport>|200|02/24/2026|valid|100|1300|
22|TV2 - Underholdning|<https://www.tv2.no/rss/underholdning>|200|02/24/2026|valid|100|1300|
23|Nettavisen - Alle saker|<https://www.nettavisen.no/service/rich-rss>|200|02/24/2026|valid|0|465|
24|Nettavisen - Nyheter|<https://www.nettavisen.no/service/rich-rss?tag=nyheter>|200|02/24/2026|valid|0|465|
25|Nettavisen - Sport|<https://www.nettavisen.no/service/rich-rss?tag=sport>|200|02/24/2026|valid|0|465|
26|Dagbladet|<https://www.dagbladet.no/?lab_viewport=rss>|200|02/24/2026|valid|316|2986|
27|Aftenposten|<https://www.aftenposten.no/rss/>|200|02/24/2026|valid|175|1675|
28|Dagsavisen|<https://www.dagsavisen.no/rss>|200|02/24/2026|valid|546|6800|
29|DN - RSS directory|<https://services.dn.no/tools/rss>|200 (HTML_RETURNED)|02/24/2026|invalid|0|0|
30|DN - Alle nyheter|<https://services.dn.no/api/feed/rss/>|200|02/24/2026|valid|135|1478|
31|Finansavisen|<https://ws.finansavisen.no/api/articles.rss>|200|02/24/2026|valid|50|650|
32|Finansavisen - Børs|<https://ws.finansavisen.no/api/articles.rss?category=B%C3%B8rs>|200|02/24/2026|valid|50|650|
33|VG (Verdens Gang)|<https://www.vg.no/rss/feed>|200|02/24/2026|valid|30|30|
34|Finansavisen (Finance/Investment)|<https://finansavisen.no/rss>|Recovered via sitemap|02/24/2026|valid|0|0|
35|Teknisk Ukeblad (Tech/Energy/Marine)|<https://www.tu.no/feed>|Recovered via sitemap|02/24/2026|valid|0|0|
36|E24 Energi (Energy/Marine Industry)|<https://e24.no/energi/rss>|Recovered via sitemap|02/24/2026|valid|0|0|
37|Adresseavisen|<https://www.adressa.no/rss/>|200|02/24/2026|valid|300|300|

### Global Energy & Grid (Global)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|OilPrice|<https://oilprice.com/rss/main>|200|02/24/2026|valid|75|1020|
2|Power Engineering|<https://www.power-eng.com/feed/>|200|02/24/2026|valid|50|670|
3|Renewable Energy World|<https://www.renewableenergyworld.com/feed/>|200|02/24/2026|valid|50|680|
4|Utility Dive|<https://www.utilitydive.com/feeds/news/>|200|02/24/2026|valid|50|680|
5|CleanTechnica|<https://cleantechnica.com/feed/>|200|02/24/2026|valid|225|3060|
6|Carbon Brief|<https://www.carbonbrief.org/feed/>|200|02/24/2026|valid|50|680|
7|Power Magazine|<https://www.powermag.com/feed/>|200|02/24/2026|valid|50|680|
8|PV Magazine|<https://www.pv-magazine.com/feed/>|200|02/24/2026|valid|125|1700|
9|Energy Post|<https://energypost.eu/feed/>|200|02/24/2026|valid|0|0|
10|Energy Storage News|<https://www.energy-storage.news/rss>|200|02/24/2026|valid|250|3400|
11|Energy Storage News|<https://www.energy-storage.news/feed>|200|02/24/2026|valid|250|3400|





