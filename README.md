# World Press Monitor Core API

Backend API and ingestion hub, adapted from key World Monitor patterns:
- RSS proxy with allowlist
- Sitemap fallback ingestion
- Per-source circuit breaker (5-minute cooldown)
- Metadata-first records (title, feed description, source, link)

## Country-level RSS Atlas (Top 30 countries by GDP)

This list covers top 30 countries by GDP (high-level order) and all configured RSS outlets per country.
- Last checked: 02/18/2026
- `❌ NO_SOURCE` means no RSS source is configured for this country yet.
- `❌ 000` means not verified in the current environment yet.

## Health Check Workflow

- Source-of-truth config: `data/rss-atlas.json`
- Run one-time verification/update: `bun run verify:readme-rss`
- Run precheck only (DNS + sample HTTP) before full verification: `bun run verify:readme-rss --precheck` (or `bun run verify:readme-rss:precheck`)
  - If precheck fails (DNS/BASIC egress), command exits with `NO_NETWORK/DNS_BROKEN` and skips full verification.
- Run one-time verification + catalog export (with network precheck): `bun run rss:health:once`
- Generate editable backlog CSV for failures: `bun run rss:health:backlog`
- Optional focus only: `bun run rss:health:backlog -- --reasons=HTTP_404,HTML_RETURNED --limit=100`
- Export `data/rss-atlas.json` from the current README: `bun run atlas:export`
- Export CSV + OPML subscription catalogs from current atlas: `bun run atlas:export-catalog`
- Generated health reports are written to:
  - `audits/readme_rss_health_latest.json`
  - `audits/readme_rss_health_YYYY-MM-DD.json`
  - `audits/readme_network_precheck_latest.json` (when `--precheck` runs)
- `getent` + `nsswitch` checks are Linux-specific; on macOS they are intentionally marked `SKIP`.
- HTTP Status column now carries quick failure clues:
  - `ERR (DNS)`: domain lookup/host resolution failed
  - `ERR (TIMEOUT)`: request timed out
  - `ERR (TLS)`: certificate or TLS issue
  - `ERR (NETWORK)`: generic network failure
- Daily cron install: `bun run cron:install` (runs health verification at midnight, then exports catalog)
- Optional tuning envs:
  - `RSS_BATCH_SIZE` (default 30)
  - `RSS_BATCH_DELAY_MS` (default 500)
  - `RSS_REQUEST_TIMEOUT_MS` (default 15000)
  - `RSS_REQUEST_JITTER_MS` (default 150)
- Migrate search-aggregated sources (Google/Bing style URLs) to candidate official RSS URLs:
  - `RSS_MIGRATE_OFFLINE_MODE=1 bun run rss:migrate-official`
- Regenerate README from atlas after manual migration: `bun run atlas:export`
 


## Latest RSS verification snapshot

- Checked endpoints: `349`
- Valid: `241`
- Invalid: `108`
- No-source rows: `50`
- Snapshot date: `02/18/2026`
- Source artifact: `audits/readme_rss_health_latest.json`

### Failure reasons
|Reason|Count|
|---|---:|
|HTTP_404|68|
|HTML_RETURNED|17|
|HTTP_403|9|
|TIMEOUT|4|
|TLS|4|
|HTTP_401|3|
|NETWORK|1|
|HTTP_530|1|
|HTTP_429|1|

### Invalid feeds by reason

#### HTTP_404 (68)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Australia|ABC News - World|<https://www.abc.net.au/news/feed/52278/rss.xml>|404|
|Brazil|Estadão (Economy)|<https://www.estadao.com.br/rss/economia>|404|
|China|Caixin Global|<https://caixinglobal.com/feed>|404|
|China|China Times|<https://chinatimes.com/feed>|404|
|China|Global Times|<https://globaltimes.cn/feed>|404|
|China|Jiemian|<https://jiemian.com/feed>|404|
|China|People's Daily|<https://people.com.cn/feed>|404|
|China|The Paper|<https://thepaper.cn/feed>|404|
|China|United Daily News|<https://udn.com/feed>|404|
|China|Yicaiglobal|<https://yicaiglobal.com/feed>|404|
|France|Midi Libre|<https://www.midilibre.fr/essentiel/rss.xml>|404|
|Global Energy & Grid|Energy Intelligence|<https://www.energyintel.com/rss>|404|
|Japan|Bloomberg Japan|<https://www.bloomberg.co.jp/feed/>|404|
|Japan|DIAMOND|<https://diamond.jp/feed/>|404|
|Japan|DIAMOND (President)|<https://president.jp/feed/>|404|
|Japan|ITmedia (EEtimes)|<https://eetimes.itmedia.co.jp/rss/>|404|
|Japan|Kabutan|<https://kabutan.jp/rss.xml>|404|
|Japan|Nikkei|<https://www.nikkei.com/rss/>|404|
|Japan|Toyo Keizai|<https://toyokeizai.net/feed/>|404|
|Japan|Yomiuri Shimbun|<https://www.yomiuri.co.jp/rss/>|404|
|Mexico|El Universal|<https://www.eluniversal.com.mx/rss.xml>|404|
|Mexico|Excelsior|<https://www.excelsior.com.mx/rss.xml>|404|
|Russia|Kommersant|<https://kommersant.ru/feed>|404|
|Russia|Neftgaz|<https://neftegaz.ru/feed>|404|
|Russia|Novaya Gazeta|<https://novayagazeta.eu/feed>|404|
|Russia|RIA|<https://ria.ru/feed>|404|
|Russia|TASS|<https://tass.com/feed>|404|
|Russia|The Moscow Times|<https://themoscowtimes.com/feed>|404|
|Russia|Vedomosti|<https://vedomosti.ru/feed>|404|
|Spain|RTVE - Economy|<https://www.rtve.es/api/noticias/economia/rss>|404|
|Taiwan|Focus Taiwan (Economics - EN)|<https://focustaiwan.tw/rss/economics>|404|
|Taiwan|Focus Taiwan (Sci-Tech - EN)|<https://focustaiwan.tw/rss/science-technology>|404|
|Taiwan|Taipei Times - Business|<https://www.taipeitimes.com/xml/biz.rss>|404|
|United Kingdom|Reuters UK (legacy)|<https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best>|404|
|United States|AP News|<https://apnews.com/feed>|404|
|United States|Atlanta Journal-Constitution|<https://ajc.com/feed>|404|
|United States|Austin American-Statesman|<https://statesman.com/feed>|404|
|United States|Bleacher Report|<https://bleacherreport.com/feed>|404|
|United States|Boston Globe|<https://bostonglobe.com/feed>|404|
|United States|CBS Sports|<https://cbssports.com/feed>|404|
|United States|Christian Science Monitor|<https://csmonitor.com/feed>|404|
|United States|Cleveland Plain Dealer|<https://cleveland.com/feed>|404|
|United States|Complex|<https://complex.com/feed>|404|
|United States|Dallas Morning News|<https://dallasnews.com/feed>|404|
|United States|Detroit Free Press|<https://freep.com/feed>|404|
|United States|ESPN|<https://espn.com/feed>|404|
|United States|Esquire|<https://esquire.com/feed>|404|
|United States|GQ|<https://gq.com/feed>|404|
|United States|Houston Chronicle|<https://houstonchronicle.com/feed>|404|
|United States|Inc Magazine|<https://www.inc.com/rss.xml>|404|
|United States|National Geographic|<https://nationalgeographic.com/feed>|404|
|United States|Newsweek|<https://newsweek.com/feed>|404|
|United States|PBS NewsHour|<https://pbs.org/feed>|404|
|United States|People|<https://people.com/feed>|404|
|United States|Philadelphia Inquirer|<https://inquirer.com/feed>|404|
|United States|Refinery29|<https://refinery29.com/feed>|404|
|United States|San Francisco Chronicle|<https://sfchronicle.com/feed>|404|
|United States|Scientific American|<https://scientificamerican.com/feed>|404|
|United States|Scripps News|<https://scrippsnews.com/feed>|404|
|United States|Semafor|<https://semafor.com/feed>|404|
|United States|Space.com|<https://space.com/feed>|404|
|United States|Star Tribune|<https://startribune.com/feed>|404|
|United States|Tampa Bay Times|<https://tampabay.com/feed>|404|
|United States|The Daily Beast|<https://thedailybeast.com/feed>|404|
|United States|Vanity Fair|<https://vanityfair.com/feed>|404|
|United States|Vice News|<https://vice.com/feed>|404|
|United States|Vulture|<https://vulture.com/feed>|404|
|United States|WebMD|<https://webmd.com/feed>|404|

#### HTML_RETURNED (17)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Argentina|Infobae (General)|<https://www.infobae.com/arc/outboundfeeds/rss/?outputType=amp>|200|
|Argentina|Reporte Energía|<https://www.reporteenergia.com>|200|
|China|China Daily|<https://chinadaily.com.cn/feed>|200|
|China|Liberty Times|<https://ltn.com.tw/feed>|200|
|China|South China Morning Post|<https://scmp.com/feed>|200|
|France|Le Point|<https://www.lepoint.fr/24h-infos/rss.xml>|200|
|Japan|Mainichi (Biz)|<https://mainichi.jp/rss/etc/biz-k-b.rss>|200|
|Japan|Nippon|<https://www.nippon.com/en/>|200|
|Japan|Sangyo Times|<https://sangyo-times.jp/rss/>|200|
|Mexico|Aristegui Noticias|<https://aristeguinoticias.com/feed/>|200|
|Mexico|Reforma|<https://www.reforma.com/rss>|200|
|Russia|Oil Capital|<https://oilcapital.ru/feed>|200|
|South Korea|KBS World Radio (RSS directory)|<https://world.kbs.co.kr/service/about_rss.htm?lang=e>|200|
|South Korea|Korea Herald (RSS directory)|<https://www.koreaherald.com/rss>|200|
|South Korea|Korea Times (RSS directory)|<https://www.koreatimes.co.kr/rss>|200|
|United States|The Athletic|<https://theathletic.com/feed>|200|
|United States|USA Today|<http://rssfeeds.usatoday.com/UsatodaycomNation-TopStories>|200|

#### HTTP_403 (9)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Australia|News.com.au - Finance|<https://www.news.com.au/finance/feed>|403|
|Canada|Canada's National Observer|<https://nationalobserver.com/front/rss>|403|
|France|Marianne|<https://www.marianne.net/rss.xml>|403|
|India|Business Standard (Latest)|<https://www.business-standard.com/rss/latest.rss>|403|
|Mexico|El Economista (Empresas)|<https://www.eleconomista.com.mx/rss/empresas>|403|
|Mexico|El Economista (Top)|<https://www.eleconomista.com.mx/rss/top-noticias>|403|
|United Kingdom|Energy Voice (North Sea Oil)|<https://www.energyvoice.com/feed/>|403|
|United States|Bloomberg|<https://bloomberg.com/feed>|403|
|United States|Politico|<https://www.politico.com/rss/politicopicks.xml>|403|

#### TIMEOUT (4)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Canada|CBC News (Top Stories)|<https://www.cbc.ca/webfeed/rss/rss-topstories>|-|
|Russia|Meduza|<https://meduza.io/feed>|-|
|United States|Miami Herald|<https://miamiherald.com/feed>|-|
|United States|Washington Post|<https://washingtonpost.com/feed>|-|

#### TLS (4)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Argentina|Mining Press|<https://miningpress.com>|-|
|China|Xinhua Net|<https://xinhuanet.com/feed>|-|
|Japan|Denki Shimbun|<https://denkishimbun.com/feed/>|-|
|Japan|TechCrunch Japan|<https://jp.techcrunch.com/feed/>|-|

#### HTTP_401 (3)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Japan|Reuters Japan|<https://www.reuters.com/world/asia-pacific/>|401|
|Russia|RG.ru|<https://rg.ru/feed>|401|
|United States|Reuters|<https://reuters.com/feed>|401|

#### NETWORK (1)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|United States|Barrons|<https://feeds.barrons.com/rss/TGW>|-|

#### HTTP_530 (1)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Japan|Japan Macro Advisors|<https://japanmacroadvisors.com/>|530|

#### HTTP_429 (1)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Canada|TheCanadianPressNews (search)|<https://www.thecanadianpressnews.ca/search/?f=rss>|429|

### No-source rows
|Country|Outlet|
|---|---|
|Austria|No RSS source configured|
|Belgium|No RSS source configured|
|Indonesia|No RSS source configured|
|Iran|No RSS source configured|
|Netherlands|No RSS source configured|
|Norway|No RSS source configured|
|Poland|No RSS source configured|
|Saudi Arabia|No RSS source configured|
|South Korea|BusinessKorea|
|South Korea|Chosun Ilbo|
|South Korea|E Today|
|South Korea|E-Daily|
|South Korea|Hankooki|
|South Korea|Hankyoreh (EN)|
|South Korea|JoongAng (Korean)|
|South Korea|KBS/공영방송(추적용) - RSS directory|
|South Korea|Korea Economic Daily (KED, site)|
|South Korea|Korea JoongAng Daily|
|South Korea|Kyunghyang Shinmun|
|South Korea|MediaToday|
|South Korea|NewDaily|
|South Korea|News1|
|South Korea|OhmyNews|
|South Korea|Pressian|
|South Korea|Pulse (MK)|
|South Korea|Reuters Institute (Korea) - 자료/리포트|
|South Korea|Segye Ilbo|
|Sweden|No RSS source configured|
|Switzerland|No RSS source configured|
|Thailand|No RSS source configured|
|Turkey|No RSS source configured|
|United Arab Emirates|No RSS source configured|
|United States|Bing US Business Topic|
|United States|Bing US Politics Topic|
|United States|Bing US Tech Topic|
|United States|Bing US World Topic|
|United States|Google Arizona News|
|United States|Google California News|
|United States|Google Florida News|
|United States|Google Georgia News|
|United States|Google Illinois News|
|United States|Google New York News|
|United States|Google Ohio News|
|United States|Google Pennsylvania News|
|United States|Google Texas News|
|United States|Google US Business Topic|
|United States|Google US Politics Topic|
|United States|Google US Tech Topic|
|United States|Google US World Topic|
|United States|Google Washington News|
### United States (US)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|The New York Times|<https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml>|200|02/18/2026|valid|
2|Washington Post|<https://washingtonpost.com/feed>|ERR (TIMEOUT)|02/18/2026|invalid|
3|Wall Street Journal|<https://feeds.a.dj.com/rss/RSSWorldNews.xml>|200|02/18/2026|valid|
4|USA Today|<http://rssfeeds.usatoday.com/UsatodaycomNation-TopStories>|200 (HTML_RETURNED)|02/18/2026|invalid|
5|LA Times|<https://www.latimes.com/local/rss2.0.xml>|200|02/18/2026|valid|
6|CNN|<http://rss.cnn.com/rss/cnn_topstories.rss>|200|02/18/2026|valid|
7|Fox News|<http://moxie.foxnews.com/google-publisher/latest.xml>|200|02/18/2026|valid|
8|NBC News|<http://feeds.nbcnews.com/nbcnews/public/news>|200|02/18/2026|valid|
9|CBS News|<https://www.cbsnews.com/latest/rss/main>|200|02/18/2026|valid|
10|ABC News|<https://abcnews.go.com/abcnews/topstories>|200|02/18/2026|valid|
11|NPR|<https://feeds.npr.org/1001/rss.xml>|200|02/18/2026|valid|
12|AP News|<https://apnews.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
13|Reuters|<https://reuters.com/feed>|401 (HTTP_401)|02/18/2026|invalid|
14|HuffPost|<https://www.huffpost.com/section/front-page/feed>|200|02/18/2026|valid|
15|BuzzFeed News|<https://www.buzzfeednews.com/news.xml>|200|02/18/2026|valid|
16|Vice News|<https://vice.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
17|Vox|<https://www.vox.com/rss/index.xml>|200|02/18/2026|valid|
18|Bloomberg|<https://bloomberg.com/feed>|403 (HTTP_403)|02/18/2026|invalid|
19|CNBC|<https://www.cnbc.com/id/100003114/device/rss/rss.html>|200|02/18/2026|valid|
20|Financial Times|<https://www.ft.com/?format=rss>|200|02/18/2026|valid|
21|Forbes|<https://www.forbes.com/most-popular/feed/>|200|02/18/2026|valid|
22|Fortune|<https://fortune.com/feed>|200|02/18/2026|valid|
23|Business Insider|<https://www.businessinsider.com/rss>|200|02/18/2026|valid|
24|MarketWatch|<http://feeds.marketwatch.com/marketwatch/topstories/>|200|02/18/2026|valid|
25|Barrons|<https://feeds.barrons.com/rss/TGW>|ERR (NETWORK)|02/18/2026|invalid|
26|Inc Magazine|<https://www.inc.com/rss.xml>|404 (HTTP_404)|02/18/2026|invalid|
27|Fast Company|<https://www.fastcompany.com/rss>|200|02/18/2026|valid|
28|TechCrunch|<https://techcrunch.com/feed/>|200|02/18/2026|valid|
29|The Verge|<https://www.theverge.com/rss/index.xml>|200|02/18/2026|valid|
30|Wired|<https://www.wired.com/feed/rss>|200|02/18/2026|valid|
31|Ars Technica|<http://feeds.arstechnica.com/arstechnica/index>|200|02/18/2026|valid|
32|Engadget|<https://www.engadget.com/rss.xml>|200|02/18/2026|valid|
33|VentureBeat|<https://venturebeat.com/feed/>|200|02/18/2026|valid|
34|Mashable|<https://mashable.com/feed>|200|02/18/2026|valid|
35|Gizmodo|<https://gizmodo.com/rss>|200|02/18/2026|valid|
36|CNET|<https://www.cnet.com/rss/news/>|200|02/18/2026|valid|
37|ZDNet|<https://www.zdnet.com/news/rss.xml>|200|02/18/2026|valid|
38|Politico|<https://www.politico.com/rss/politicopicks.xml>|403 (HTTP_403)|02/18/2026|invalid|
39|The Hill|<https://thehill.com/feed>|200|02/18/2026|valid|
40|Axios|<https://api.axios.com/feed/>|200|02/18/2026|valid|
41|Breitbart|<http://feeds.feedburner.com/breitbart>|200|02/18/2026|valid|
42|National Review|<https://www.nationalreview.com/feed/>|200|02/18/2026|valid|
43|Slate|<https://slate.com/feeds/all.rss>|200|02/18/2026|valid|
44|The New Yorker|<https://www.newyorker.com/feed/everything>|200|02/18/2026|valid|
45|The Atlantic|<https://www.theatlantic.com/feed/all/>|200|02/18/2026|valid|
46|Google US World Topic|N/A|❌ NO_SOURCE|02/18/2026|needs verification|
47|Google US Politics Topic|N/A|❌ NO_SOURCE|02/18/2026|needs verification|
48|Google US Business Topic|N/A|❌ NO_SOURCE|02/18/2026|needs verification|
49|Google US Tech Topic|N/A|❌ NO_SOURCE|02/18/2026|needs verification|
50|Google California News|N/A|❌ NO_SOURCE|02/18/2026|needs verification|
51|Google Texas News|N/A|❌ NO_SOURCE|02/18/2026|needs verification|
52|Google Florida News|N/A|❌ NO_SOURCE|02/18/2026|needs verification|
53|Google New York News|N/A|❌ NO_SOURCE|02/18/2026|needs verification|
54|Google Illinois News|N/A|❌ NO_SOURCE|02/18/2026|needs verification|
55|Google Arizona News|N/A|❌ NO_SOURCE|02/18/2026|needs verification|
56|Google Georgia News|N/A|❌ NO_SOURCE|02/18/2026|needs verification|
57|Google Ohio News|N/A|❌ NO_SOURCE|02/18/2026|needs verification|
58|Google Pennsylvania News|N/A|❌ NO_SOURCE|02/18/2026|needs verification|
59|Google Washington News|N/A|❌ NO_SOURCE|02/18/2026|needs verification|
60|Boston Globe|<https://bostonglobe.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
61|Philadelphia Inquirer|<https://inquirer.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
62|Miami Herald|<https://miamiherald.com/feed>|ERR (TIMEOUT)|02/18/2026|invalid|
63|Atlanta Journal-Constitution|<https://ajc.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
64|New York Post|<https://nypost.com/feed>|200|02/18/2026|valid|
65|Chicago Tribune|<https://chicagotribune.com/feed>|200|02/18/2026|valid|
66|Detroit Free Press|<https://freep.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
67|Star Tribune|<https://startribune.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
68|Cleveland Plain Dealer|<https://cleveland.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
69|Houston Chronicle|<https://houstonchronicle.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
70|Dallas Morning News|<https://dallasnews.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
71|Austin American-Statesman|<https://statesman.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
72|Tampa Bay Times|<https://tampabay.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
73|San Francisco Chronicle|<https://sfchronicle.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
74|Seattle Times|<https://seattletimes.com/feed>|200|02/18/2026|valid|
75|Denver Post|<https://denverpost.com/feed>|200|02/18/2026|valid|
76|San Jose Mercury News|<https://mercurynews.com/feed>|200|02/18/2026|valid|
77|Las Vegas Review-Journal|<https://reviewjournal.com/feed>|200|02/18/2026|valid|
78|San Diego Union-Tribune|<https://sandiegouniontribune.com/feed>|200|02/18/2026|valid|
79|Honolulu Star-Advertiser|<https://staradvertiser.com/feed>|200|02/18/2026|valid|
80|Variety|<https://variety.com/feed>|200|02/18/2026|valid|
81|The Hollywood Reporter|<https://hollywoodreporter.com/feed>|200|02/18/2026|valid|
82|Deadline|<https://deadline.com/feed>|200|02/18/2026|valid|
83|Rolling Stone|<https://rollingstone.com/feed>|200|02/18/2026|valid|
84|Billboard|<https://billboard.com/feed>|200|02/18/2026|valid|
85|Vulture|<https://vulture.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
86|Vanity Fair|<https://vanityfair.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
87|Esquire|<https://esquire.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
88|GQ|<https://gq.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
89|People|<https://people.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
90|Scientific American|<https://scientificamerican.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
91|National Geographic|<https://nationalgeographic.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
92|STAT News|<https://statnews.com/feed>|200|02/18/2026|valid|
93|WebMD|<https://webmd.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
94|Space.com|<https://space.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
95|ESPN|<https://espn.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
96|Sports Illustrated|<https://si.com/feed>|200|02/18/2026|valid|
97|Bleacher Report|<https://bleacherreport.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
98|The Athletic|<https://theathletic.com/feed>|200 (HTML_RETURNED)|02/18/2026|invalid|
99|CBS Sports|<https://cbssports.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
100|The Daily Beast|<https://thedailybeast.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
101|Mother Jones|<https://motherjones.com/feed>|200|02/18/2026|valid|
102|ProPublica|<https://propublica.org/feed>|200|02/18/2026|valid|
103|Reason|<https://reason.com/feed>|200|02/18/2026|valid|
104|Jacobin|<https://jacobin.com/feed>|200|02/18/2026|valid|
105|Quartz|<https://qz.com/feed>|200|02/18/2026|valid|
106|The Intercept|<https://theintercept.com/feed>|200|02/18/2026|valid|
107|Complex|<https://complex.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
108|Refinery29|<https://refinery29.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
109|Newsweek|<https://newsweek.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
110|Time|<https://time.com/feed>|200|02/18/2026|valid|
111|PBS NewsHour|<https://pbs.org/feed>|404 (HTTP_404)|02/18/2026|invalid|
112|Christian Science Monitor|<https://csmonitor.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
113|Semafor|<https://semafor.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
114|Scripps News|<https://scrippsnews.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
115|Bing US Politics Topic|N/A|❌ NO_SOURCE|02/18/2026|needs verification|
116|Bing US Business Topic|N/A|❌ NO_SOURCE|02/18/2026|needs verification|
117|Bing US Tech Topic|N/A|❌ NO_SOURCE|02/18/2026|needs verification|
118|Bing US World Topic|N/A|❌ NO_SOURCE|02/18/2026|needs verification|

### China (CN)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|Xinhua Net|<https://xinhuanet.com/feed>|ERR (TLS)|02/18/2026|invalid|
2|People's Daily|<https://people.com.cn/feed>|404 (HTTP_404)|02/18/2026|invalid|
3|Global Times|<https://globaltimes.cn/feed>|404 (HTTP_404)|02/18/2026|invalid|
4|China Daily|<https://chinadaily.com.cn/feed>|200 (HTML_RETURNED)|02/18/2026|invalid|
5|Caixin Global|<https://caixinglobal.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
6|The Paper|<https://thepaper.cn/feed>|404 (HTTP_404)|02/18/2026|invalid|
7|Jiemian|<https://jiemian.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
8|Yicaiglobal|<https://yicaiglobal.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
9|TechNode|<https://technode.com/feed>|200|02/18/2026|valid|
10|South China Morning Post|<https://scmp.com/feed>|200 (HTML_RETURNED)|02/18/2026|invalid|
11|Initium|<https://theinitium.com/feed>|200|02/18/2026|valid|
12|United Daily News|<https://udn.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
13|Liberty Times|<https://ltn.com.tw/feed>|200 (HTML_RETURNED)|02/18/2026|invalid|
14|China Times|<https://chinatimes.com/feed>|404 (HTTP_404)|02/18/2026|invalid|

### Japan (JP)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|NHK World (EN)|<https://www3.nhk.or.jp/rss/news/cat0.xml>|200|02/18/2026|valid|
2|Mainichi (Biz)|<https://mainichi.jp/rss/etc/biz-k-b.rss>|200 (HTML_RETURNED)|02/18/2026|invalid|
3|Asahi Shimbun|<https://www.asahi.com/rss/asahi/newsheadlines.rdf>|200|02/18/2026|valid|
4|The Japan Times|<https://www.japantimes.co.jp/feed/>|200|02/18/2026|valid|
5|Nikkei|<https://www.nikkei.com/rss/>|404 (HTTP_404)|02/18/2026|invalid|
6|Yomiuri Shimbun|<https://www.yomiuri.co.jp/rss/>|404 (HTTP_404)|02/18/2026|invalid|
7|Toyo Keizai|<https://toyokeizai.net/feed/>|404 (HTTP_404)|02/18/2026|invalid|
8|DIAMOND|<https://diamond.jp/feed/>|404 (HTTP_404)|02/18/2026|invalid|
9|DIAMOND (President)|<https://president.jp/feed/>|404 (HTTP_404)|02/18/2026|invalid|
10|Japan Macro Advisors|<https://japanmacroadvisors.com/>|530 (HTTP_530)|02/18/2026|invalid|
11|Denki Shimbun|<https://denkishimbun.com/feed/>|ERR (TLS)|02/18/2026|invalid|
12|ITmedia (EEtimes)|<https://eetimes.itmedia.co.jp/rss/>|404 (HTTP_404)|02/18/2026|invalid|
13|Sangyo Times|<https://sangyo-times.jp/rss/>|200 (HTML_RETURNED)|02/18/2026|invalid|
14|Automotive Ten-Navi|<https://automotive.ten-navi.com/rss/>|200|02/18/2026|valid|
15|The Bridge|<https://thebridge.jp/feed/>|200|02/18/2026|valid|
16|TechCrunch Japan|<https://jp.techcrunch.com/feed/>|ERR (TLS)|02/18/2026|invalid|
17|Kabutan|<https://kabutan.jp/rss.xml>|404 (HTTP_404)|02/18/2026|invalid|
18|Bloomberg Japan|<https://www.bloomberg.co.jp/feed/>|404 (HTTP_404)|02/18/2026|invalid|
19|Reuters Japan|<https://www.reuters.com/world/asia-pacific/>|401 (HTTP_401)|02/18/2026|invalid|
20|Nippon|<https://www.nippon.com/en/>|200 (HTML_RETURNED)|02/18/2026|invalid|

### Germany (DE)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|Handelsblatt - Top|<https://www.handelsblatt.com/contentexport/feed/top-themen>|200|02/18/2026|valid|
2|Handelsblatt - Finance|<https://www.handelsblatt.com/contentexport/feed/finanzen>|200|02/18/2026|valid|
3|Tagesschau|<https://www.tagesschau.de/xml/rss2>|200|02/18/2026|valid|
4|Der Spiegel|<https://www.spiegel.de/schlagzeilen/tops/index.rss>|200|02/18/2026|valid|
5|FAZ|<https://www.faz.net/rss/aktuell/>|200|02/18/2026|valid|
6|Die Zeit|<https://newsfeed.zeit.de/index>|200|02/18/2026|valid|
7|Manager Magazin|<https://www.manager-magazin.de/unternehmen/index.rss>|200|02/18/2026|valid|
8|WirtschaftsWoche|<https://www.wiwo.de/contentexport/feed/rss/schlagzeilen>|200|02/18/2026|valid|
9|Deutsche Welle (EN)|<https://rss.dw.com/xml/rss-en-all>|200|02/18/2026|valid|
10|Heise Online|<https://www.heise.de/rss/heise-atom.xml>|200|02/18/2026|valid|

### India (IN)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|The Times of India (Top Stories)|<https://timesofindia.indiatimes.com/rssfeedstopstories.cms>|200|02/18/2026|valid|
2|NDTV (Latest)|<https://feeds.feedburner.com/NDTV-LatestNews>|200|02/18/2026|valid|
3|India Today (India)|<https://www.indiatoday.in/rss/1206578>|200|02/18/2026|valid|
4|The Indian Express|<https://indianexpress.com/feed>|200|02/18/2026|valid|
5|The Hindu (National)|<https://www.thehindu.com/news/national/?service=rss>|200|02/18/2026|valid|
6|Firstpost|<https://www.firstpost.com/commonfeeds/v1/mfp/rss/web-stories.xml>|200|02/18/2026|valid|
7|Business Standard (Latest)|<https://www.business-standard.com/rss/latest.rss>|403 (HTTP_403)|02/18/2026|invalid|
8|DNA India (India)|<https://www.dnaindia.com/feeds/india.xml>|200|02/18/2026|valid|
9|Storify News|<https://www.storifynews.com/feed>|200|02/18/2026|valid|
10|Amar Ujala (Breaking)|<https://www.amarujala.com/rss/breaking-news.xml>|200|02/18/2026|valid|
11|Odishabarta|<https://odishabarta.com/feed>|200|02/18/2026|valid|
12|The Times of Bengal|<https://thetimesofbengal.com/feed>|200|02/18/2026|valid|
13|Scroll.in|<https://feeds.feedburner.com/ScrollinArticles.rss>|200|02/18/2026|valid|
14|Northlines|<https://thenorthlines.com/feed>|200|02/18/2026|valid|
15|Chandigarh Metro|<https://chandigarhmetro.com/feed>|200|02/18/2026|valid|
16|Chandigarh City News|<https://feeds.feedburner.com/ChandigarhCityNews>|200|02/18/2026|valid|
17|The Quint|<https://prod-qt-images.s3.amazonaws.com/production/thequint/feed.xml>|200|02/18/2026|valid|
18|Telangana Today|<https://telanganatoday.com/feed>|200|02/18/2026|valid|
19|Daily Excelsior|<https://www.dailyexcelsior.com/feed>|200|02/18/2026|valid|
20|News Today (TN)|<https://newstodaynet.com/feed>|200|02/18/2026|valid|
21|IndiaVision|<https://www.indiavision.com/feed>|200|02/18/2026|valid|
22|OpIndia|<https://www.opindia.com/feed>|200|02/18/2026|valid|
23|OrissaPOST|<https://www.orissapost.com/feed>|200|02/18/2026|valid|
24|India's News.Net|<https://feeds.indiasnews.net/rss/701ee96610c884a6>|200|02/18/2026|valid|
25|TechGenYZ|<https://techgenyz.com/feed>|200|02/18/2026|valid|
26|Kashmir News|<https://kashmirnews.in/feed>|200|02/18/2026|valid|
27|WYM News (Blogspot)|<https://latestnewsupdate4you.blogspot.com/feeds/posts/default>|200|02/18/2026|valid|
28|Star of Mysore|<https://starofmysore.com/feed>|200|02/18/2026|valid|
29|ABP News|<https://news.abplive.com/home/feed>|200|02/18/2026|valid|
30|The India Bizz|<https://theindiabizz.com/feed>|200|02/18/2026|valid|

### United Kingdom (GB)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|Financial Times - World|<https://www.ft.com/rss/world>|200|02/18/2026|valid|
2|Financial Times - Energy|<https://www.ft.com/rss/companies/energy>|200|02/18/2026|valid|
3|BBC News - Business|<https://feeds.bbci.co.uk/news/business/rss.xml>|200|02/18/2026|valid|
4|BBC News - World|<https://feeds.bbci.co.uk/news/world/rss.xml>|200|02/18/2026|valid|
5|The Guardian - World|<https://www.theguardian.com/world/rss>|200|02/18/2026|valid|
6|The Guardian - Business|<https://www.theguardian.com/business/rss>|200|02/18/2026|valid|
7|Sky News - World|<https://feeds.skynews.com/feeds/rss/world.xml>|200|02/18/2026|valid|
8|Sky News - Business|<https://feeds.skynews.com/feeds/rss/business.xml>|200|02/18/2026|valid|
9|Telegraph - Business|<https://www.telegraph.co.uk/business/rss.xml>|200|02/18/2026|valid|
10|City A.M. (London Finance)|<https://www.cityam.com/feed/>|200|02/18/2026|valid|
11|Energy Voice (North Sea Oil)|<https://www.energyvoice.com/feed/>|403 (HTTP_403)|02/18/2026|invalid|
12|Reuters UK (legacy)|<https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best>|404 (HTTP_404)|02/18/2026|invalid|

### France (FR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|France 24|<https://www.france24.com/en/rss>|200|02/18/2026|valid|
2|The Local (France)|<https://feeds.thelocal.com/rss/fr>|200|02/18/2026|valid|
3|RFI (France)|<https://www.rfi.fr/en/france/rss>|200|02/18/2026|valid|
4|RFI (All / EN)|<https://www.rfi.fr/en/rss>|200|02/18/2026|valid|
5|Mediapart|<https://www.mediapart.fr/articles/feed>|200|02/18/2026|valid|
6|Le Monde diplomatique|<https://mondediplo.com/backend>|200|02/18/2026|valid|
7|Midi Libre|<https://www.midilibre.fr/essentiel/rss.xml>|404 (HTTP_404)|02/18/2026|invalid|
8|Sud Ouest|<https://www.sudouest.fr/essentiel/rss.xml>|200|02/18/2026|valid|
9|L'Est Républicain|<https://www.estrepublicain.fr/rss>|200|02/18/2026|valid|
10|France Soir|<https://www.francesoir.fr/rss.xml>|200|02/18/2026|valid|
11|Dernières Nouvelles d'Alsace (DNA)|<https://www.dna.fr/rss>|200|02/18/2026|valid|
12|La Croix|<https://www.la-croix.com/feeds/rss/site.xml>|200|02/18/2026|valid|
13|Marianne|<https://www.marianne.net/rss.xml>|403 (HTTP_403)|02/18/2026|invalid|
14|La Dépêche|<https://www.ladepeche.fr/rss.xml>|200|02/18/2026|valid|
15|20 Minutes|<https://www.20minutes.fr/feeds/rss-une.xml>|200|02/18/2026|valid|
16|Le Point|<https://www.lepoint.fr/24h-infos/rss.xml>|200 (HTML_RETURNED)|02/18/2026|invalid|
17|Yahoo Actualités|<https://fr.news.yahoo.com/rss>|200|02/18/2026|valid|
18|InfoMigrants (EN)|<https://www.infomigrants.net/en/rss/all.xml>|200|02/18/2026|valid|
19|France Today|<https://www.francetoday.com/feed>|200|02/18/2026|valid|
20|FrenchDailyNews|<https://frenchdailynews.com/feed>|200|02/18/2026|valid|
21|Le Monde (EN – Main)|<https://www.lemonde.fr/en/rss/une.xml>|200|02/18/2026|valid|
22|Le Monde (EN – International)|<https://www.lemonde.fr/en/international/rss_full.xml>|200|02/18/2026|valid|
23|Le Monde (EN – Editorials)|<https://www.lemonde.fr/en/editorials/rss_full.xml>|200|02/18/2026|valid|
24|Le Monde (EN – Europe)|<https://www.lemonde.fr/en/europe/rss_full.xml>|200|02/18/2026|valid|
25|Le Monde (EN – United States)|<https://www.lemonde.fr/en/united-states/rss_full.xml>|200|02/18/2026|valid|
26|Le Monde (EN – Economy)|<https://www.lemonde.fr/en/economy/rss_full.xml>|200|02/18/2026|valid|
27|Le Monde (EN – Culture)|<https://www.lemonde.fr/en/culture/rss_full.xml>|200|02/18/2026|valid|
28|Le Monde (EN – Sports)|<https://www.lemonde.fr/en/sports/rss_full.xml>|200|02/18/2026|valid|
29|Le Monde (EN – Environment)|<https://www.lemonde.fr/en/environment/rss_full.xml>|200|02/18/2026|valid|
30|Le Monde (EN – Science)|<https://www.lemonde.fr/en/science/rss_full.xml>|200|02/18/2026|valid|

### Italy (IT)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|ANSA (Main)|<https://www.ansa.it/sito/ansait_rss.xml>|200|02/18/2026|valid|
2|ANSA (Top News)|<https://www.ansa.it/sito/notizie/topnews/topnews_rss.xml>|200|02/18/2026|valid|
3|ANSA (Cronaca)|<https://www.ansa.it/sito/notizie/cronaca/cronaca_rss.xml>|200|02/18/2026|valid|
4|ANSA (Politica)|<https://www.ansa.it/sito/notizie/politica/politica_rss.xml>|200|02/18/2026|valid|
5|ANSA (Mondo)|<https://www.ansa.it/sito/notizie/mondo/mondo_rss.xml>|200|02/18/2026|valid|
6|ANSA (Economia)|<https://www.ansa.it/sito/notizie/economia/economia_rss.xml>|200|02/18/2026|valid|
7|ANSA (Calcio)|<https://www.ansa.it/sito/notizie/sport/calcio/calcio_rss.xml>|200|02/18/2026|valid|
8|ANSA (Sport)|<https://www.ansa.it/sito/notizie/sport/sport_rss.xml>|200|02/18/2026|valid|
9|ANSA (Cinema)|<https://www.ansa.it/sito/notizie/cultura/cinema/cinema_rss.xml>|200|02/18/2026|valid|
10|ANSA (Cultura e Tendenze)|<https://www.ansa.it/sito/notizie/cultura/cultura_rss.xml>|200|02/18/2026|valid|
11|ANSA (Foto)|<https://www.ansa.it/sito/photogallery/foto_rss.xml>|200|02/18/2026|valid|
12|ANSA (Video)|<https://www.ansa.it/sito/videogallery/video_rss.xml>|200|02/18/2026|valid|
13|Corriere della Sera (Homepage)|<https://www.corriere.it/rss/homepage.xml>|200|02/18/2026|valid|
14|Corriere della Sera (Ultimora)|<https://www.corriere.it/rss/ultimora.xml>|200|02/18/2026|valid|
15|Corriere della Sera (feed-hp Homepage)|<https://www.corriere.it/feed-hp/homepage.xml>|200|02/18/2026|valid|
16|la Repubblica|<https://www.repubblica.it/rss/homepage/rss2.0.xml>|200|02/18/2026|valid|
17|La Stampa|<https://www.lastampa.it/rss/copertina.xml>|200|02/18/2026|valid|
18|Il Sole 24 Ore (Italia)|<https://www.ilsole24ore.com/rss/italia.xml>|200|02/18/2026|valid|
19|Il Fatto Quotidiano|<https://www.ilfattoquotidiano.it/feed/>|200|02/18/2026|valid|
20|La Gazzetta dello Sport|<https://www.gazzetta.it/rss/home.xml>|200|02/18/2026|valid|
21|IL Tempo|<https://www.iltempo.it/rss.xml>|200|02/18/2026|valid|
22|Libero Quotidiano|<https://www.liberoquotidiano.it/rss.xml>|200|02/18/2026|valid|
23|MilanoToday|<https://www.milanotoday.it/rss>|200|02/18/2026|valid|
24|The Florentine|<https://www.theflorentine.net/feed>|200|02/18/2026|valid|
25|Wanted in Rome|<https://www.wantedinrome.com/news?format=rss>|200|02/18/2026|valid|
26|Florence Daily News|<https://florencedailynews.com/feed>|200|02/18/2026|valid|
27|Alto Adige (Cronaca)|<https://www.altoadige.it/feed-rss/cronaca-1.169>|200|02/18/2026|valid|
28|Italia a Tavola|<https://rss.italiaatavola.net/feed.xml>|200|02/18/2026|valid|
29|la Città di Salerno|<https://www.lacittadisalerno.it/feed>|200|02/18/2026|valid|
30|Notizie Geopolitiche|<https://www.notiziegeopolitiche.net/feed>|200|02/18/2026|valid|

### Canada (CA)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|Global News|<https://globalnews.ca/feed>|200|02/18/2026|valid|
2|rabble.ca|<https://rabble.ca/feed>|200|02/18/2026|valid|
3|National Post|<https://nationalpost.com/feed>|200|02/18/2026|valid|
4|Toronto Sun|<https://torontosun.com/feed>|200|02/18/2026|valid|
5|Financial Post|<https://feeds.feedburner.com/FP_TopStories>|200|02/18/2026|valid|
6|CityNews Toronto|<https://toronto.citynews.ca/feed>|200|02/18/2026|valid|
7|Calgary Herald|<https://calgaryherald.com/feed>|200|02/18/2026|valid|
8|Edmonton Journal|<https://edmontonjournal.com/feed>|200|02/18/2026|valid|
9|Windsor Star|<https://windsorstar.com/feed>|200|02/18/2026|valid|
10|The Province|<https://theprovince.com/feed>|200|02/18/2026|valid|
11|Calgary Sun|<https://calgarysun.com/feed>|200|02/18/2026|valid|
12|Ottawa Sun|<https://ottawasun.com/feed>|200|02/18/2026|valid|
13|The Tyee|<https://thetyee.ca/rss2.xml>|200|02/18/2026|valid|
14|The StarPhoenix|<https://thestarphoenix.com/feed>|200|02/18/2026|valid|
15|Edmonton Sun|<https://edmontonsun.com/feed>|200|02/18/2026|valid|
16|Canada.com|<https://o.canada.com/feed>|200|02/18/2026|valid|
17|Canada's National Observer|<https://nationalobserver.com/front/rss>|403 (HTTP_403)|02/18/2026|invalid|
18|Business In Vancouver (BIV)|<https://biv.com/rss>|200|02/18/2026|valid|
19|Regina Leader Post|<https://leaderpost.com/feed>|200|02/18/2026|valid|
20|Owen Sound Sun Times|<https://owensoundsuntimes.com/feed>|200|02/18/2026|valid|
21|Ottawa Citizen|<https://ottawacitizen.com/feed>|200|02/18/2026|valid|
22|Stratford Beacon Herald|<https://stratfordbeaconherald.com/feed>|200|02/18/2026|valid|
23|The Georgia Straight|<https://straight.com/content/rss>|200|02/18/2026|valid|
24|Grande Prairie Daily Herald Tribune|<https://dailyheraldtribune.com/feed>|200|02/18/2026|valid|
25|YGK News (Kingston)|<https://ygknews.ca/feed>|200|02/18/2026|valid|
26|Prince Albert Daily Herald|<https://paherald.sk.ca/feed>|200|02/18/2026|valid|
27|Sunny South News|<https://sunnysouthnews.com/feed>|200|02/18/2026|valid|
28|The Afro News|<https://theafronews.com/feed>|200|02/18/2026|valid|
29|TheCanadianPressNews (search)|<https://www.thecanadianpressnews.ca/search/?f=rss>|429 (HTTP_429)|02/18/2026|invalid|
30|CBC News (Top Stories)|<https://www.cbc.ca/webfeed/rss/rss-topstories>|ERR (TIMEOUT)|02/18/2026|invalid|

### Russia (RU)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|TASS|<https://tass.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
2|RIA|<https://ria.ru/feed>|404 (HTTP_404)|02/18/2026|invalid|
3|RT|<https://rt.com/feed>|200|02/18/2026|valid|
4|RG.ru|<https://rg.ru/feed>|401 (HTTP_401)|02/18/2026|invalid|
5|Kommersant|<https://kommersant.ru/feed>|404 (HTTP_404)|02/18/2026|invalid|
6|Vedomosti|<https://vedomosti.ru/feed>|404 (HTTP_404)|02/18/2026|invalid|
7|Meduza|<https://meduza.io/feed>|ERR (TIMEOUT)|02/18/2026|invalid|
8|The Moscow Times|<https://themoscowtimes.com/feed>|404 (HTTP_404)|02/18/2026|invalid|
9|Novaya Gazeta|<https://novayagazeta.eu/feed>|404 (HTTP_404)|02/18/2026|invalid|
10|The Bell|<https://thebell.io/feed>|200|02/18/2026|valid|
11|Oil Capital|<https://oilcapital.ru/feed>|200 (HTML_RETURNED)|02/18/2026|invalid|
12|Neftgaz|<https://neftegaz.ru/feed>|404 (HTTP_404)|02/18/2026|invalid|

### South Korea (KR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|Yonhap (EN)|<https://en.yna.co.kr/RSS/news.xml>|200|02/18/2026|valid|
2|Donga Ilbo|<https://rss.donga.com/total.xml>|200|02/18/2026|valid|
3|Seoul Newspaper|<https://www.seoul.co.kr/xml/rss/rss_top.xml>|200|02/18/2026|valid|
4|Newsis|<https://www.newsis.com/RSS/sokbo.xml>|200|02/18/2026|valid|
5|Aju News|<https://rss.ajunews.com/sokbo.xml>|200|02/18/2026|valid|
6|KED Global (Korea Economic Daily)|<https://www.kedglobal.com/newsRss>|200|02/18/2026|valid|
7|Daily NK (EN)|<https://www.dailynk.com/english/feed>|200|02/18/2026|valid|
8|Korea Times (RSS directory)|<https://www.koreatimes.co.kr/rss>|200 (HTML_RETURNED)|02/18/2026|invalid|
9|Korea Herald (RSS directory)|<https://www.koreaherald.com/rss>|200 (HTML_RETURNED)|02/18/2026|invalid|
10|Korea Herald (NewsAll)|<https://www.koreaherald.com/rss/newsAll>|200|02/18/2026|valid|
11|KBS World Radio (RSS directory)|<https://world.kbs.co.kr/service/about_rss.htm?lang=e>|200 (HTML_RETURNED)|02/18/2026|invalid|
12|Hankyoreh (EN)|N/A|❌ NO_SOURCE|02/18/2026|needs verification|
13|Kyunghyang Shinmun|N/A|❌ NO_SOURCE|02/18/2026|needs verification|
14|MediaToday|N/A|❌ NO_SOURCE|02/18/2026|needs verification|
15|Segye Ilbo|N/A|❌ NO_SOURCE|02/18/2026|needs verification|
16|Pressian|N/A|❌ NO_SOURCE|02/18/2026|needs verification|
17|E Today|N/A|❌ NO_SOURCE|02/18/2026|needs verification|
18|E-Daily|N/A|❌ NO_SOURCE|02/18/2026|needs verification|
19|OhmyNews|N/A|❌ NO_SOURCE|02/18/2026|needs verification|
20|Korea JoongAng Daily|N/A|❌ NO_SOURCE|02/18/2026|needs verification|
21|News1|N/A|❌ NO_SOURCE|02/18/2026|needs verification|
22|NewDaily|N/A|❌ NO_SOURCE|02/18/2026|needs verification|
23|JoongAng (Korean)|N/A|❌ NO_SOURCE|02/18/2026|needs verification|
24|Hankooki|N/A|❌ NO_SOURCE|02/18/2026|needs verification|
25|Pulse (MK)|N/A|❌ NO_SOURCE|02/18/2026|needs verification|
26|BusinessKorea|N/A|❌ NO_SOURCE|02/18/2026|needs verification|
27|Korea Economic Daily (KED, site)|N/A|❌ NO_SOURCE|02/18/2026|needs verification|
28|Reuters Institute (Korea) - 자료/리포트|N/A|❌ NO_SOURCE|02/18/2026|needs verification|
29|KBS/공영방송(추적용) - RSS directory|N/A|❌ NO_SOURCE|02/18/2026|needs verification|
30|Chosun Ilbo|N/A|❌ NO_SOURCE|02/18/2026|needs verification|

### Brazil (BR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|G1 (Globo - Economy)|<https://g1.globo.com/rss/g1/economia/>|200|02/18/2026|valid|
2|G1 (Globo - Tech)|<https://g1.globo.com/rss/g1/tecnologia/>|200|02/18/2026|valid|
3|Folha de S.Paulo - Top|<https://feeds.folha.uol.com.br/emcimadahora/rss091.xml>|200|02/18/2026|valid|
4|Folha de S.Paulo - Market|<https://feeds.folha.uol.com.br/mercado/rss091.xml>|200|02/18/2026|valid|
5|Estadão (Economy)|<https://www.estadao.com.br/rss/economia>|404 (HTTP_404)|02/18/2026|invalid|
6|Correio Braziliense|<https://www.correiobraziliense.com.br/rss/noticia/economia/rss.xml>|200|02/18/2026|valid|
7|InfoMoney|<https://www.infomoney.com.br/feed/>|200|02/18/2026|valid|
8|Canaltech|<https://canaltech.com.br/rss/>|200|02/18/2026|valid|
9|Forbes Brazil|<https://forbes.com.br/feed/>|200|02/18/2026|valid|

### Australia (AU)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|ABC News - Business|<https://www.abc.net.au/news/feed/51892/rss.xml>|200|02/18/2026|valid|
2|ABC News - World|<https://www.abc.net.au/news/feed/52278/rss.xml>|404 (HTTP_404)|02/18/2026|invalid|
3|Sydney Morning Herald - Business|<https://www.smh.com.au/rss/business.xml>|200|02/18/2026|valid|
4|The Age - Business|<https://www.theage.com.au/rss/business.xml>|200|02/18/2026|valid|
5|News.com.au - Finance|<https://www.news.com.au/finance/feed>|403 (HTTP_403)|02/18/2026|invalid|
6|The Australian - Business|<https://www.theaustralian.com.au/business/rss>|200|02/18/2026|valid|

### Spain (ES)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|Expansión (Financial)|<https://e00-expansion.uecdn.es/rss/empresas.xml>|200|02/18/2026|valid|
2|Cinco Días (Economy)|<https://cincodias.elpais.com/arc/outboundfeeds/rss/?outputType=xml>|200|02/18/2026|valid|
3|El País - Economy|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/economia/portada>|200|02/18/2026|valid|
4|El Mundo - Economy|<https://e00-elmundo.uecdn.es/elmundo/rss/economia.xml>|200|02/18/2026|valid|
5|RTVE - Economy|<https://www.rtve.es/api/noticias/economia/rss>|404 (HTTP_404)|02/18/2026|invalid|

### Mexico (MX)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|El Economista (Top)|<https://www.eleconomista.com.mx/rss/top-noticias>|403 (HTTP_403)|02/18/2026|invalid|
2|El Economista (Empresas)|<https://www.eleconomista.com.mx/rss/empresas>|403 (HTTP_403)|02/18/2026|invalid|
3|El Universal|<https://www.eluniversal.com.mx/rss.xml>|404 (HTTP_404)|02/18/2026|invalid|
4|Milenio|<https://www.milenio.com/rss>|200|02/18/2026|valid|
5|Excelsior|<https://www.excelsior.com.mx/rss.xml>|404 (HTTP_404)|02/18/2026|invalid|
6|Proceso (Investigative)|<https://www.proceso.com.mx/rss/feed.html>|200|02/18/2026|valid|
7|Aristegui Noticias|<https://aristeguinoticias.com/feed/>|200 (HTML_RETURNED)|02/18/2026|invalid|
8|Expansion (Biz)|<https://expansion.mx/rss>|200|02/18/2026|valid|
9|Reforma|<https://www.reforma.com/rss>|200 (HTML_RETURNED)|02/18/2026|invalid|

### Indonesia (ID)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|No RSS source configured|N/A|❌ NO_SOURCE|02/18/2026|needs verification|

### Netherlands (NL)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|No RSS source configured|N/A|❌ NO_SOURCE|02/18/2026|needs verification|

### Switzerland (CH)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|No RSS source configured|N/A|❌ NO_SOURCE|02/18/2026|needs verification|

### Turkey (TR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|No RSS source configured|N/A|❌ NO_SOURCE|02/18/2026|needs verification|

### Saudi Arabia (SA)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|No RSS source configured|N/A|❌ NO_SOURCE|02/18/2026|needs verification|

### Taiwan (TW)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|Focus Taiwan (Economics - EN)|<https://focustaiwan.tw/rss/economics>|404 (HTTP_404)|02/18/2026|invalid|
2|Focus Taiwan (Sci-Tech - EN)|<https://focustaiwan.tw/rss/science-technology>|404 (HTTP_404)|02/18/2026|invalid|
3|Taipei Times - Business|<https://www.taipeitimes.com/xml/biz.rss>|404 (HTTP_404)|02/18/2026|invalid|
4|Liberty Times - Business|<https://news.ltn.com.tw/rss/business.xml>|200|02/18/2026|valid|
5|TechNews Taiwan|<https://technews.tw/feed/>|200|02/18/2026|valid|
6|CNA (Central News Agency)|<https://feeds.feedburner.com/cnaFirstNews>|200|02/18/2026|valid|

### Poland (PL)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|No RSS source configured|N/A|❌ NO_SOURCE|02/18/2026|needs verification|

### Sweden (SE)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|No RSS source configured|N/A|❌ NO_SOURCE|02/18/2026|needs verification|

### Belgium (BE)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|No RSS source configured|N/A|❌ NO_SOURCE|02/18/2026|needs verification|

### Thailand (TH)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|No RSS source configured|N/A|❌ NO_SOURCE|02/18/2026|needs verification|

### Iran (IR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|No RSS source configured|N/A|❌ NO_SOURCE|02/18/2026|needs verification|

### Argentina (AR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|La Nacion (Economy)|<https://www.lanacion.com.ar/arc/outboundfeeds/rss/?outputType=xml&rotation=economia>|200|02/18/2026|valid|
2|Clarín (Politics)|<https://www.clarin.com/rss/politica/>|200|02/18/2026|valid|
3|Infobae (General)|<https://www.infobae.com/arc/outboundfeeds/rss/?outputType=amp>|200 (HTML_RETURNED)|02/18/2026|invalid|
4|Cronista (Finance)|<https://www.cronista.com/files/rss/news.xml>|200|02/18/2026|valid|
5|Ambito Financiero|<https://www.ambito.com/rss/pages/home.xml>|200|02/18/2026|valid|
6|Perfil|<https://www.perfil.com/feed/>|200|02/18/2026|valid|
7|EconoJournal|<https://www.econojournal.com.ar/rss>|200|02/18/2026|valid|
8|Reporte Energía|<https://www.reporteenergia.com>|200 (HTML_RETURNED)|02/18/2026|invalid|
9|Mining Press|<https://miningpress.com>|ERR (TLS)|02/18/2026|invalid|

### Austria (AT)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|No RSS source configured|N/A|❌ NO_SOURCE|02/18/2026|needs verification|

### Norway (NO)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|No RSS source configured|N/A|❌ NO_SOURCE|02/18/2026|needs verification|

### United Arab Emirates (AE)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|No RSS source configured|N/A|❌ NO_SOURCE|02/18/2026|needs verification|

### Global Energy & Grid (Global)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|
|---|---|---|---|---|---|
1|OilPrice|<https://oilprice.com/rss/main>|200|02/18/2026|valid|
2|Energy Intelligence|<https://www.energyintel.com/rss>|404 (HTTP_404)|02/18/2026|invalid|
3|Power Engineering|<https://www.power-eng.com/feed/>|200|02/18/2026|valid|
4|Renewable Energy World|<https://www.renewableenergyworld.com/feed/>|200|02/18/2026|valid|
5|Utility Dive|<https://www.utilitydive.com/feeds/news/>|200|02/18/2026|valid|
6|CleanTechnica|<https://cleantechnica.com/feed/>|200|02/18/2026|valid|

