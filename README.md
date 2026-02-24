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

- Last checked: 02/23/2026
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

















## Latest RSS verification snapshot

- Checked endpoints: `1087`
- Valid: `1038`
- Invalid: `49`
- Recovered via sitemap: `51`
- No-source rows: `0`
- Sitemap fallback checks: checked `100`, attempted `100`, success `51`, failed `49`, no-candidate `0`, candidates `105`
- Snapshot date: `02/23/2026`
- RSS ingest baseline: `2026-02-20`
- RSS daily window: `1d` (runner: worker)
- Source artifact: `audits/readme_rss_health_latest.json`

### Failure reasons
|Reason|Count|
|---|---:|
|HTML_RETURNED|13|
|HTTP_403|11|
|HTTP_REDIRECT_LOOP|11|
|TIMEOUT|9|
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

#### HTTP_403 (11)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Belgium|De Standaard (example section)|<https://www.standaard.be/rss/section/1f2838d4-99ea-49f0-9102-138784c7ea7c>|403|
|Belgium|Le Soir (main)|<https://www.lesoir.be/rss2/9/cible_principale>|403|
|Japan|Nikkei|<https://assets.nikkei.jp/release/v1/rss/news.xml>|403|
|Mexico|El Economista - Empresas|<https://www.eleconomista.com.mx/rss/empresas>|403|
|Mexico|El Economista - Top Noticias (멕시코 경제 1위)|<https://www.eleconomista.com.mx/rss/top-noticias>|403|
|Netherlands|Telegraaf (Financieel)|<https://www.telegraaf.nl/rss/financieel>|403|
|Saudi Arabia|Asharq Business (Bloomberg Arabic)|<https://asharqbusiness.com/feed>|403|
|Spain|El Economista - Mercados (주식/마켓)|<https://www.eleconomista.es/rss/rss-mercados.php>|403|
|Spain|El Economista - Portada (스페인 금융 1위)|<https://www.eleconomista.es/rss/rss-portada.php>|403|
|Uruguay|El País - Economía|<https://www.elpais.com.uy/rss/economia-y-mercado>|403|
|Uruguay|El País - Portada|<https://www.elpais.com.uy/rss>|403|

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

#### TIMEOUT (9)
|Country|Outlet|RSS URL|HTTP|
|---|---|---|---:|
|Canada|CBC News - Business|<https://www.cbc.ca/cmlink/rss-business>|-|
|Canada|CBC News - World|<https://www.cbc.ca/cmlink/rss-world>|-|
|Indonesia|ANTARA - Dunia (ASEAN)|<https://www.antaranews.com/rss/dunia-asean.xml>|-|
|Indonesia|ANTARA - Ekonomi|<https://www.antaranews.com/rss/ekonomi.xml>|-|
|Indonesia|ANTARA - Olahraga|<https://www.antaranews.com/rss/olahraga.xml>|-|
|Indonesia|ANTARA - Olahraga (Balap)|<https://www.antaranews.com/rss/olahraga-balap.xml>|-|
|Indonesia|ANTARA - Sepakbola (Internasional)|<https://www.antaranews.com/rss/sepakbola-internasional.xml>|-|
|Indonesia|ANTARA - Sepakbola (Liga Indonesia)|<https://www.antaranews.com/rss/sepakbola-liga-indonesia.xml>|-|
|Iran|Mehr News|<https://www.mehrnews.com/rss>|-|

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
|Japan|Sankei News Flash|<https://www.sankei.com/rss/news/flash.xml>|<https://www.sankei.com/feeds/sitemap-oriconnews/?outputType=xml&amp;from=0>|
|Japan|Sankei Economy|<https://www.sankei.com/rss/news/economy.xml>|<https://www.sankei.com/feeds/sitemap-oriconnews/?outputType=xml&amp;from=0>|
|Japan|Wired Japan|<https://wired.jp/feed/rss2>|<https://wired.jp/feed/google-latest-news/sitemap-google-news>|
|Japan|PR TIMES - Business/Economy|<https://prtimes.jp/business.rdf>|<https://prtimes.jp/sitemap-news.xml>|
|Japan|PR TIMES - Technology|<https://prtimes.jp/technology.rdf>|<https://prtimes.jp/sitemap-news.xml>|
|Japan|Newsweek Japan|<https://www.newsweekjapan.jp/headlines.rss>|<https://www.newsweekjapan.jp/stories/sitemap_stories_2008.xml>|
|Japan|President Online (Business)|<https://president.jp/list/feed/rss>|<https://president.jp/common/files/sitemap-2026.xml>|
|Canada|CTV News - Top Stories|<https://www.ctvnews.ca/rss/ctvnews-ca-top-stories-public-rss-1.822009>|<https://www.ctvnews.ca/arc/outboundfeeds/sitemap-news/latest/>|
|Canada|CTV News - Business|<https://www.ctvnews.ca/rss/business/ctvnews-ca-business-public-rss-1.822283>|<https://www.ctvnews.ca/arc/outboundfeeds/sitemap-news/latest/>|
|Canada|BNN Bloomberg (Canada Biz)|<https://www.bnnbloomberg.ca/business/rss>|<https://www.bnnbloomberg.ca/arc/outboundfeeds/sitemap-news/latest/>|
|South Korea|Seoul Newspaper|<https://www.seoul.co.kr/xml/rss/rss_top.xml>|<https://www.seoul.co.kr/sitemap/sitemap_latestArticle>|
|Australia|The Conversation AU (오피니언/정책)|<https://theconversation.com/au/rss>|<https://theconversation.com/africa/sitemap_news.xml>|
|Spain|Xataka (스페인어권 최대 테크 매체)|<https://www.xataka.com/feed>|<https://www.xataka.com/sitemap_news.xml>|
|Mexico|ADN40 (TV Azteca - Economy)|<https://www.adn40.mx/economia/rss>|<https://www.adn40.mx/newslatest-sitemap-latest.xml>|
|Mexico|ADN40 (TV Azteca - Mexico)|<https://www.adn40.mx/mexico/rss>|<https://www.adn40.mx/newslatest-sitemap-latest.xml>|
|Mexico|El Universal - General (최대 일간지)|<https://www.eluniversal.com.mx/rss.xml>|<https://www.eluniversal.com.mx/arc/outboundfeeds/sitemap/category/tendencias/?outputType=xml>|
|Mexico|El Universal - Cartera (경제/지갑)|<https://www.eluniversal.com.mx/cartera/rss.xml>|<https://www.eluniversal.com.mx/arc/outboundfeeds/sitemap/category/tendencias/?outputType=xml>|
|Mexico|Milenio (전국지)|<https://www.milenio.com/rss>|<https://www.milenio.com/sitemap/google-news/sitemap-google-news-current-2.xml>|
|Mexico|Excelsior (보수 유력지)|<https://www.excelsior.com.mx/rss.xml>|<https://www.excelsior.com.mx/sitemap-google-news.xml>|
|Mexico|Forbes México|<https://www.forbes.com.mx/feed/>|<https://www.forbes.com.mx/news-sitemap.xml>|

### No-source rows
- none
### United States (US)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|The New York Times|<https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml>|200|02/23/2026|valid|27|1555|
2|Wall Street Journal|<https://feeds.a.dj.com/rss/RSSWorldNews.xml>|200|02/23/2026|valid|20|1280|
3|LA Times|<https://www.latimes.com/local/rss2.0.xml>|200|02/23/2026|valid|94|6010|
4|CNN|<http://rss.cnn.com/rss/cnn_topstories.rss>|200|02/23/2026|valid|69|3924|
5|Fox News|<http://moxie.foxnews.com/google-publisher/latest.xml>|200|02/23/2026|valid|25|1600|
6|NBC News|<http://feeds.nbcnews.com/nbcnews/public/news>|200|02/23/2026|valid|25|1600|
7|CBS News|<https://www.cbsnews.com/latest/rss/main>|200|02/23/2026|valid|30|1920|
8|ABC News|<https://abcnews.go.com/abcnews/topstories>|200|02/23/2026|valid|25|1600|
9|NPR|<https://feeds.npr.org/1001/rss.xml>|200|02/23/2026|valid|10|640|
10|HuffPost|<https://www.huffpost.com/section/front-page/feed>|200|02/23/2026|valid|0|0|
11|BuzzFeed News|<https://www.buzzfeednews.com/news.xml>|200|02/23/2026|valid|40|2560|
12|Vox|<https://www.vox.com/rss/index.xml>|200|02/23/2026|valid|10|640|
13|CNBC|<https://www.cnbc.com/id/100003114/device/rss/rss.html>|200|02/23/2026|valid|30|1920|
14|Financial Times|<https://www.ft.com/?format=rss>|200|02/23/2026|valid|10|625|
15|Forbes|<https://www.forbes.com/most-popular/feed/>|200|02/23/2026|valid|11|704|
16|Fortune|<https://fortune.com/feed>|200|02/23/2026|valid|10|640|
17|Business Insider|<https://www.businessinsider.com/rss>|200|02/23/2026|valid|20|1280|
18|MarketWatch|<http://feeds.marketwatch.com/marketwatch/topstories/>|200|02/23/2026|valid|10|640|
19|Fast Company|<https://www.fastcompany.com/rss>|200|02/23/2026|valid|20|1274|
20|TechCrunch|<https://techcrunch.com/feed/>|200|02/23/2026|valid|20|1280|
21|The Verge|<https://www.theverge.com/rss/index.xml>|200|02/23/2026|valid|10|640|
22|Wired|<https://www.wired.com/feed/rss>|200|02/23/2026|valid|50|3200|
23|Ars Technica|<http://feeds.arstechnica.com/arstechnica/index>|200|02/23/2026|valid|20|1280|
24|Engadget|<https://www.engadget.com/rss.xml>|200|02/23/2026|valid|50|3200|
25|VentureBeat|<https://venturebeat.com/feed/>|200|02/23/2026|valid|7|448|
26|Mashable|<https://mashable.com/feed>|200|02/23/2026|valid|100|6400|
27|Gizmodo|<https://gizmodo.com/rss>|200|02/23/2026|valid|20|1280|
28|CNET|<https://www.cnet.com/rss/news/>|200|02/23/2026|valid|25|1600|
29|ZDNet|<https://www.zdnet.com/news/rss.xml>|200|02/23/2026|valid|20|1280|
30|The Hill|<https://thehill.com/feed>|200|02/23/2026|valid|100|6400|
31|Axios|<https://api.axios.com/feed/>|200|02/23/2026|valid|100|6400|
32|Breitbart|<http://feeds.feedburner.com/breitbart>|200|02/23/2026|valid|50|3146|
33|National Review|<https://www.nationalreview.com/feed/>|200|02/23/2026|valid|20|1280|
34|Slate|<https://slate.com/feeds/all.rss>|200|02/23/2026|valid|25|1600|
35|The New Yorker|<https://www.newyorker.com/feed/everything>|200|02/23/2026|valid|50|3200|
36|The Atlantic|<https://www.theatlantic.com/feed/all/>|200|02/23/2026|valid|25|1600|
37|Boston Globe|<https://www.bostonglobe.com/arc/outboundfeeds/rss?outputType=xml>|200|02/23/2026|valid|100|6400|
38|New York Post|<https://nypost.com/feed>|200|02/23/2026|valid|22|1408|
39|Chicago Tribune|<https://chicagotribune.com/feed>|200|02/23/2026|valid|10|640|
40|Seattle Times|<https://seattletimes.com/feed>|200|02/23/2026|valid|34|1219|
41|Denver Post|<https://denverpost.com/feed>|200|02/23/2026|valid|10|610|
42|San Jose Mercury News|<https://mercurynews.com/feed>|200|02/23/2026|valid|10|640|
43|Las Vegas Review-Journal|<https://reviewjournal.com/feed>|200|02/23/2026|valid|30|1920|
44|San Diego Union-Tribune|<https://sandiegouniontribune.com/feed>|200|02/23/2026|valid|100|6400|
45|Honolulu Star-Advertiser|<https://staradvertiser.com/feed>|200|02/23/2026|valid|40|2560|
46|Variety|<https://variety.com/feed>|200|02/23/2026|valid|10|640|
47|The Hollywood Reporter|<https://hollywoodreporter.com/feed>|200|02/23/2026|valid|10|640|
48|Deadline|<https://deadline.com/feed>|200|02/23/2026|valid|12|768|
49|Rolling Stone|<https://rollingstone.com/feed>|200|02/23/2026|valid|10|640|
50|Billboard|<https://billboard.com/feed>|200|02/23/2026|valid|10|640|
51|Vanity Fair|<http://feeds.feedburner.com/vfdotcomrss>|200|02/23/2026|valid|35|2240|
52|Esquire|<https://www.esquire.com/rss/entertainment.xml>|200|02/23/2026|valid|50|3200|
53|GQ|<https://www.gq.com/feed/rss>|200|02/23/2026|valid|30|1920|
54|Space.com|<https://www.space.com/feeds/all>|200|02/23/2026|valid|50|3200|
55|ESPN|<https://www.espn.com/espn/rss/news>|200|02/23/2026|valid|34|2278|
56|Sports Illustrated|<https://si.com/feed>|200|02/23/2026|valid|89|5653|
57|Mother Jones|<https://motherjones.com/feed>|200|02/23/2026|valid|10|640|
58|ProPublica|<https://propublica.org/feed>|200|02/23/2026|valid|10|640|
59|Reason|<https://reason.com/feed>|200|02/23/2026|valid|48|3024|
60|Jacobin|<https://jacobin.com/feed>|200|02/23/2026|valid|20|1280|
61|Quartz|<https://qz.com/feed>|200|02/23/2026|valid|50|3200|
62|The Intercept|<https://theintercept.com/feed>|200|02/23/2026|valid|20|1280|
63|Newsweek|<https://www.newsweek.com/rss>|200|02/23/2026|valid|20|1080|
64|Time|<https://time.com/feed>|200|02/23/2026|valid|100|6400|
65|PBS NewsHour|<https://www.pbs.org/newshour/feeds/rss/headlines>|200|02/23/2026|valid|20|1280|

### China (CN)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|China Daily|<http://www.chinadaily.com.cn/rss/world_rss.xml>|200|02/23/2026|valid|100|6400|
2|TechNode|<https://technode.com/feed>|200|02/23/2026|valid|120|7680|
3|South China Morning Post|<https://www.scmp.com/rss/91/feed>|200|02/23/2026|valid|50|3200|
4|Initium|<https://theinitium.com/feed>|200|02/23/2026|valid|15|960|
5|Liberty Times|<https://news.ltn.com.tw/rss/all.xml>|200|02/23/2026|valid|40|2560|
6|People China|<https://people.com.cn/rss/politics.xml>|200|02/23/2026|valid|100|6400|
7|China Daily English|<https://www.chinadaily.com.cn/rss/world_rss.xml>|200|02/23/2026|valid|100|6400|
8|China Daily - China|<http://www.chinadaily.com.cn/rss/china_rss.xml>|200|02/23/2026|valid|100|6400|
9|China Daily - BizChina|<http://www.chinadaily.com.cn/rss/bizchina_rss.xml>|200|02/23/2026|valid|100|6400|
10|China Daily - Opinion|<http://www.chinadaily.com.cn/rss/opinion_rss.xml>|200|02/23/2026|valid|120|7680|
11|China Daily - Sports|<http://www.chinadaily.com.cn/rss/sports_rss.xml>|200|02/23/2026|valid|100|6400|
12|China Daily - Entertainment|<http://www.chinadaily.com.cn/rss/entertainment_rss.xml>|200|02/23/2026|valid|120|7680|
13|China Daily - Lifestyle|<http://www.chinadaily.com.cn/rss/lifestyle_rss.xml>|200|02/23/2026|valid|100|6400|
14|China Daily - Photos|<http://www.chinadaily.com.cn/rss/photo_rss.xml>|200|02/23/2026|valid|120|7680|
15|China Daily - China Daily (main)|<http://www.chinadaily.com.cn/rss/cndy_rss.xml>|200|02/23/2026|valid|120|7680|
16|China Daily - HK Edition|<http://www.chinadaily.com.cn/rss/hk_rss.xml>|200|02/23/2026|valid|120|7680|
17|China Daily - USA (kindle)|<http://usa.chinadaily.com.cn/usa_kindle.xml>|200|02/23/2026|valid|0|0|
18|China Daily - EU Weekly|<http://europe.chinadaily.com.cn/euweekly_rss.xml>|200|02/23/2026|valid|120|7680|
19|People.cn - Politics|<http://www.people.com.cn/rss/politics.xml>|200|02/23/2026|valid|100|6400|
20|People.cn - Society|<http://www.people.com.cn/rss/society.xml>|200|02/23/2026|valid|100|6400|
21|People.cn - Legal|<http://www.people.com.cn/rss/legal.xml>|200|02/23/2026|valid|100|6400|
22|People.cn - World|<http://www.people.com.cn/rss/world.xml>|200|02/23/2026|valid|100|6400|
23|People.cn - Opinion|<http://www.people.com.cn/rss/opinion.xml>|200|02/23/2026|valid|100|6400|
24|People.cn - ChinaPic|<http://www.people.com.cn/rss/chinapic.xml>|200|02/23/2026|valid|100|6400|
25|CGTN Documentary|<https://news.cgtn.com/rss/documentary/CGTN-Documentary.rss>|200|02/23/2026|valid|2|126|
26|Zaobao (realtime)|<https://www.zaobao.com.sg/rss/realtime>|404 (HTTP_404)|02/23/2026|invalid|0|0|
27|RTHK|<https://rthk.hk/rthk/news/rss/c_expressnews_clocal.xml>|200|02/23/2026|valid|20|40|
28|FT Chinese|<http://www.ftchinese.com/rss/feed>|200|02/23/2026|valid|20|40|
29|Xinhua|<http://www.xinhuanet.com/politics/news_politics.xml>|200|02/23/2026|valid|120|240|

### Japan (JP)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|NHK World (EN)|<https://www3.nhk.or.jp/rss/news/cat0.xml>|200|02/23/2026|valid|7|448|
2|Mainichi (Biz)|<https://mainichi.jp/rss/etc/english_latest.rss>|200|02/23/2026|valid|0|0|
3|Asahi Shimbun|<https://www.asahi.com/rss/asahi/newsheadlines.rdf>|200|02/23/2026|valid|0|0|
4|The Japan Times|<https://www.japantimes.co.jp/feed/>|200|02/23/2026|valid|30|1920|
5|Automotive Ten-Navi|<https://automotive.ten-navi.com/rss/>|200|02/23/2026|valid|0|0|
6|The Bridge|<https://thebridge.jp/feed/>|200|02/23/2026|valid|20|360|
7|Nippon|<https://www.nippon.com/en/feed/>|200|02/23/2026|valid|20|1280|
8|NHK News Web - cat1|<https://www3.nhk.or.jp/rss/news/cat1.xml>|200|02/23/2026|valid|110|7564|
9|NHK News Web - cat2|<https://www3.nhk.or.jp/rss/news/cat2.xml>|200|02/23/2026|valid|15|1078|
10|NHK News Web - cat3|<https://www3.nhk.or.jp/rss/news/cat3.xml>|200|02/23/2026|valid|19|1355|
11|NHK News Web - cat4|<https://www3.nhk.or.jp/rss/news/cat4.xml>|200|02/23/2026|valid|69|5568|
12|NHK News Web - cat5|<https://www3.nhk.or.jp/rss/news/cat5.xml>|200|02/23/2026|valid|57|3865|
13|NHK News Web - cat6|<https://www3.nhk.or.jp/rss/news/cat6.xml>|200|02/23/2026|valid|101|6604|
14|NHK News Web - cat7|<https://www3.nhk.or.jp/rss/news/cat7.xml>|200|02/23/2026|valid|120|7680|
15|ITmedia - 総合記事一覧|<https://rss.itmedia.co.jp/rss/2.0/itmedia_all.xml>|200|02/23/2026|valid|50|3200|
16|ITmedia - TOP STORIES|<https://rss.itmedia.co.jp/rss/2.0/topstory.xml>|200|02/23/2026|valid|20|1280|
17|ITmedia NEWS - 新着(速報)|<https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml>|200|02/23/2026|valid|50|3200|
18|ITmedia NEWS - 国内|<https://rss.itmedia.co.jp/rss/2.0/news_domestic.xml>|200|02/23/2026|valid|30|1920|
19|ITmedia NEWS - 海外|<https://rss.itmedia.co.jp/rss/2.0/news_foreign.xml>|200|02/23/2026|valid|30|1920|
20|ITmedia NEWS - 製品動向|<https://rss.itmedia.co.jp/rss/2.0/news_products.xml>|200|02/23/2026|valid|30|1920|
21|ITmedia NEWS - セキュリティ|<https://rss.itmedia.co.jp/rss/2.0/news_security.xml>|200|02/23/2026|valid|30|1920|
22|ITmedia NEWS - 科学・テクノロジー|<https://rss.itmedia.co.jp/rss/2.0/news_technology.xml>|200|02/23/2026|valid|30|1920|
23|ITmedia NEWS - ネットトピック|<https://rss.itmedia.co.jp/rss/2.0/news_nettopics.xml>|200|02/23/2026|valid|30|1920|
24|ITmedia NEWS - 企業・業界動向|<https://rss.itmedia.co.jp/rss/2.0/news_industry.xml>|200|02/23/2026|valid|30|1920|
25|ITmedia NEWS - Special|<https://rss.itmedia.co.jp/rss/2.0/news_special.xml>|200|02/23/2026|valid|30|1920|
26|ITmedia AI+|<https://rss.itmedia.co.jp/rss/2.0/aiplus.xml>|200|02/23/2026|valid|20|1280|
27|ITmedia Mobile|<https://rss.itmedia.co.jp/rss/2.0/mobile.xml>|200|02/23/2026|valid|20|1280|
28|ITmedia PC USER|<https://rss.itmedia.co.jp/rss/2.0/pcuser.xml>|200|02/23/2026|valid|20|1280|
29|ITmedia ビジネスオンライン|<https://rss.itmedia.co.jp/rss/2.0/business.xml>|200|02/23/2026|valid|20|1280|
30|ITmedia エンタープライズ|<https://rss.itmedia.co.jp/rss/2.0/enterprise.xml>|200|02/23/2026|valid|50|3200|
31|J-CASTニュース (総合)|<https://www.j-cast.com/index.xml>|200|02/23/2026|valid|56|3584|
32|J-CASTトレンド|<https://www.j-cast.com/trend/index.xml>|200|02/23/2026|valid|3|207|
33|J-CAST会社ウォッチ|<https://www.j-cast.com/kaisha/index.xml>|200|02/23/2026|valid|1|64|
34|BOOKウォッチ|<https://books.j-cast.com/rss.xml>|200|02/23/2026|valid|0|0|
35|INTERNET Watch (Impress)|<https://internet.watch.impress.co.jp/data/rss/1.0/iw/feed.rdf>|200|02/23/2026|valid|0|0|
36|Impress Watch (総合)|<https://www.watch.impress.co.jp/data/rss/1.0/ipw/feed.rdf>|200|02/23/2026|valid|0|0|
37|GIGAZINE (Atom)|<https://gigazine.net/news/rss_atom/>|200|02/23/2026|valid|30|1920|
38|PR TIMES (プレスリリース)|<https://prtimes.jp/index.rdf>|200|02/23/2026|valid|0|0|
39|Yahoo Japan - Business|<https://news.yahoo.co.jp/rss/topics/business.xml>|200|02/23/2026|valid|8|248|
40|Yahoo Japan - World|<https://news.yahoo.co.jp/rss/topics/world.xml>|200|02/23/2026|valid|8|248|
41|Yahoo Japan - IT/Tech|<https://news.yahoo.co.jp/rss/topics/it.xml>|200|02/23/2026|valid|8|248|
42|Reuters Japan|<https://news.yahoo.co.jp/rss/media/reut/all.xml>|200|02/23/2026|valid|0|0|
43|Bloomberg Japan|<https://news.yahoo.co.jp/rss/media/bloom_st/all.xml>|200|02/23/2026|valid|0|0|
44|Forbes Japan|<https://news.yahoo.co.jp/rss/media/fminfo/all.xml>|200|02/23/2026|valid|0|0|
45|Kyodo News|<https://news.yahoo.co.jp/rss/media/kyodonews/all.xml>|200|02/23/2026|valid|50|1550|
46|Toyo Keizai|<https://toyokeizai.net/list/feed/rss>|200|02/23/2026|valid|20|620|
47|Diamond Online|<https://diamond.jp/list/feed/rss>|200 (HTML_RETURNED)|02/23/2026|invalid|0|1509|
48|Sankei News Flash|<https://www.sankei.com/rss/news/flash.xml>|Recovered via sitemap|02/23/2026|valid|0|0|
49|Sankei Economy|<https://www.sankei.com/rss/news/economy.xml>|Recovered via sitemap|02/23/2026|valid|0|0|
50|CNET Japan|<https://feeds.japan.cnet.com/rss/cnet/all.rdf>|200|02/23/2026|valid|0|0|
51|Wired Japan|<https://wired.jp/feed/rss2>|Recovered via sitemap|02/23/2026|valid|0|0|
52|Boundless (TechCrunch Japan Archive)|<https://news.yahoo.co.jp/rss/media/boundless/all.xml>|200|02/23/2026|valid|0|0|
53|Smart Japan|<https://rss.itmedia.co.jp/rss/2.0/smartjapan.xml>|200|02/23/2026|valid|20|620|
54|Nikkei|<https://assets.nikkei.jp/release/v1/rss/news.xml>|403 (HTTP_403)|02/23/2026|invalid|0|0|
55|Yomiuri Latest|<https://assets.yomiuri.co.jp/rss/latestnews.rdf>|ERR (NETWORK)|02/23/2026|invalid|0|0|
56|Mainichi Flash|<https://mainichi.jp/rss/etc/mainichi-flash.rss>|200|02/23/2026|valid|0|0|
57|Gizmodo Japan|<https://www.gizmodo.jp/index.xml>|200|02/23/2026|valid|25|775|
58|PR TIMES - Business/Economy|<https://prtimes.jp/business.rdf>|Recovered via sitemap|02/23/2026|valid|0|0|
59|PR TIMES - Technology|<https://prtimes.jp/technology.rdf>|Recovered via sitemap|02/23/2026|valid|0|0|
60|Goo News (Business)|<https://news.goo.ne.jp/rss/topstories/business/index.rdf>|200 (HTML_RETURNED)|02/23/2026|invalid|0|0|
61|Goo News (Politics)|<https://news.goo.ne.jp/rss/topstories/politics/index.rdf>|200 (HTML_RETURNED)|02/23/2026|invalid|0|0|
62|Newsweek Japan|<https://www.newsweekjapan.jp/headlines.rss>|Recovered via sitemap|02/23/2026|valid|0|0|
63|JBpress (Japan Business Press)|<https://jbpress.ismedia.jp/list/feed/rss>|200|02/23/2026|valid|20|60|
64|TechCrunch Japan|<https://jp.techcrunch.com/feed/>|ERR (TLS)|02/23/2026|invalid|0|0|
65|President Online (Business)|<https://president.jp/list/feed/rss>|Recovered via sitemap|02/23/2026|valid|0|0|
66|Zenn (Tech)|<https://zenn.dev/feed>|200|02/23/2026|valid|20|40|

### Germany (DE)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Handelsblatt - Top|<https://www.handelsblatt.com/contentexport/feed/top-themen>|200|02/23/2026|valid|24|1443|
2|Handelsblatt - Finance|<https://www.handelsblatt.com/contentexport/feed/finanzen>|200|02/23/2026|valid|20|1280|
3|Tagesschau|<https://www.tagesschau.de/xml/rss2>|200|02/23/2026|valid|40|2560|
4|Der Spiegel|<https://www.spiegel.de/schlagzeilen/tops/index.rss>|200|02/23/2026|valid|18|1315|
5|FAZ|<https://www.faz.net/rss/aktuell/>|200|02/23/2026|valid|67|4460|
6|Die Zeit|<https://newsfeed.zeit.de/index>|200|02/23/2026|valid|15|960|
7|Manager Magazin|<https://www.manager-magazin.de/unternehmen/index.rss>|200|02/23/2026|valid|20|1280|
8|WirtschaftsWoche|<https://www.wiwo.de/contentexport/feed/rss/schlagzeilen>|200|02/23/2026|valid|20|1280|
9|Deutsche Welle (EN)|<https://rss.dw.com/xml/rss-en-all>|200|02/23/2026|valid|120|7680|
10|Heise Online|<https://www.heise.de/rss/heise-atom.xml>|200|02/23/2026|valid|120|7680|
11|Der Spiegel|<https://www.spiegel.de/schlagzeilen/index.rss>|200|02/23/2026|valid|30|1920|
12|Die Welt|<https://www.welt.de/feeds/topnews.rss>|200|02/23/2026|valid|18|1232|
13|Focus|<https://www.focus.de/rss/>|200|02/23/2026|valid|120|3600|
14|Handelsblatt Economy|<https://www.handelsblatt.com/contentexport/feed/finanzen/>|200|02/23/2026|valid|20|1280|
15|Frankfurter Allgemeine|<https://www.faz.net/rss/aktuell/wirtschaft/>|200|02/23/2026|valid|23|1472|
16|Tagesspiegel|<https://www.tagesspiegel.de/contentexport/feed/>|200|02/23/2026|valid|100|6400|
17|Handelsblatt World|<https://www.handelsblatt.com/contentexport/feed/wirtschaft>|200|02/23/2026|valid|20|1280|
18|Zeit Welt|<https://newsfeed.zeit.de/wirtschaft/index>|200|02/23/2026|valid|15|960|
19|Financial Times Germany|<https://www.ft.com/rss/home>|200|02/23/2026|valid|11|629|
20|Süddeutsche - Top-Themen|<https://rss.sueddeutsche.de/rss/Topthemen>|200|02/23/2026|valid|15|960|
21|Süddeutsche - Alles|<https://rss.sueddeutsche.de/rss/Alles>|200|02/23/2026|valid|15|960|
22|Süddeutsche - Eilmeldungen|<https://rss.sueddeutsche.de/rss/Eilmeldungen>|200|02/23/2026|valid|15|960|
23|Süddeutsche - Politik|<https://rss.sueddeutsche.de/rss/Politik>|200|02/23/2026|valid|15|960|
24|Süddeutsche - Wirtschaft|<https://rss.sueddeutsche.de/rss/Wirtschaft>|200|02/23/2026|valid|15|960|
25|Süddeutsche - Panorama|<https://rss.sueddeutsche.de/rss/Panorama>|200|02/23/2026|valid|15|960|
26|Süddeutsche - Sport|<https://rss.sueddeutsche.de/rss/Sport>|200|02/23/2026|valid|15|960|
27|Süddeutsche - München|<https://rss.sueddeutsche.de/rss/Muenchen>|200|02/23/2026|valid|15|960|
28|Süddeutsche - Bayern|<https://rss.sueddeutsche.de/rss/Bayern>|200|02/23/2026|valid|15|960|
29|Süddeutsche - Kultur|<https://rss.sueddeutsche.de/rss/Kultur>|200|02/23/2026|valid|15|960|
30|Süddeutsche - Medien|<https://rss.sueddeutsche.de/rss/Medien>|200|02/23/2026|valid|15|960|
31|Süddeutsche - Wissen|<https://rss.sueddeutsche.de/rss/Wissen>|200|02/23/2026|valid|15|960|
32|Süddeutsche - Gesundheit|<https://rss.sueddeutsche.de/rss/Gesundheit>|200|02/23/2026|valid|15|960|
33|Süddeutsche - Karriere|<https://rss.sueddeutsche.de/rss/Karriere>|200|02/23/2026|valid|15|960|
34|Süddeutsche - Bildung|<https://rss.sueddeutsche.de/rss/Bildung>|200|02/23/2026|valid|15|960|
35|Süddeutsche - Reise|<https://rss.sueddeutsche.de/rss/Reise>|200|02/23/2026|valid|15|960|
36|Süddeutsche - Auto|<https://rss.sueddeutsche.de/rss/Auto>|200|02/23/2026|valid|15|960|
37|Süddeutsche - Stil|<https://rss.sueddeutsche.de/rss/Stil>|200|02/23/2026|valid|15|960|
38|Deutschlandfunk - Nachrichten|<https://www.deutschlandfunk.de/nachrichten-100.rss>|200|02/23/2026|valid|22|2206|
39|Deutschlandfunk - Politikportal|<https://www.deutschlandfunk.de/politikportal-100.rss>|200|02/23/2026|valid|119|7488|
40|Deutschlandfunk - Wirtschaft|<https://www.deutschlandfunk.de/wirtschaft-106.rss>|200|02/23/2026|valid|120|7680|
41|Deutschlandfunk - Wissen|<https://www.deutschlandfunk.de/wissen-106.rss>|200|02/23/2026|valid|120|7680|
42|Deutschlandfunk - Kulturportal|<https://www.deutschlandfunk.de/kulturportal-100.rss>|200|02/23/2026|valid|120|7680|
43|Deutschlandfunk - Europa|<https://www.deutschlandfunk.de/europa-112.rss>|200|02/23/2026|valid|120|7680|
44|Deutschlandfunk - Gesellschaft|<https://www.deutschlandfunk.de/gesellschaft-106.rss>|200|02/23/2026|valid|120|7680|
45|Deutschlandfunk - Sportportal|<https://www.deutschlandfunk.de/sportportal-100.rss>|200|02/23/2026|valid|111|7104|
46|taz.de (gesamt)|<https://taz.de/!a=;rss/>|200|02/23/2026|valid|0|0|
47|Tagesschau|<https://www.tagesschau.de/xml/rss2/>|200|02/23/2026|valid|40|80|

### India (IN)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|The Times of India (Top Stories)|<https://timesofindia.indiatimes.com/rssfeedstopstories.cms>|200|02/23/2026|valid|48|2967|
2|NDTV (Latest)|<https://feeds.feedburner.com/NDTV-LatestNews>|200|02/23/2026|valid|20|1280|
3|India Today (India)|<https://www.indiatoday.in/rss/1206578>|200|02/23/2026|valid|20|1280|
4|The Indian Express|<https://indianexpress.com/feed>|200|02/23/2026|valid|120|7680|
5|The Hindu (National)|<https://www.thehindu.com/news/national/?service=rss>|200|02/23/2026|valid|100|6400|
6|Firstpost|<https://www.firstpost.com/commonfeeds/v1/mfp/rss/web-stories.xml>|200|02/23/2026|valid|120|3600|
7|DNA India (India)|<https://www.dnaindia.com/feeds/india.xml>|200|02/23/2026|valid|0|1120|
8|Storify News|<https://www.storifynews.com/feed>|200|02/23/2026|valid|107|6206|
9|Amar Ujala (Breaking)|<https://www.amarujala.com/rss/breaking-news.xml>|200|02/23/2026|valid|11|704|
10|Odishabarta|<https://odishabarta.com/feed>|200|02/23/2026|valid|10|640|
11|The Times of Bengal|<https://thetimesofbengal.com/feed>|200|02/23/2026|valid|10|600|
12|Scroll.in|<https://feeds.feedburner.com/ScrollinArticles.rss>|200|02/23/2026|valid|100|6400|
13|Northlines|<https://thenorthlines.com/feed>|200|02/23/2026|valid|10|420|
14|Chandigarh Metro|<https://chandigarhmetro.com/feed>|200|02/23/2026|valid|10|630|
15|Chandigarh City News|<https://feeds.feedburner.com/ChandigarhCityNews>|200|02/23/2026|valid|10|640|
16|The Quint|<https://prod-qt-images.s3.amazonaws.com/production/thequint/feed.xml>|200|02/23/2026|valid|20|1280|
17|Telangana Today|<https://telanganatoday.com/feed>|200|02/23/2026|valid|120|7680|
18|News Today (TN)|<https://newstodaynet.com/feed>|200|02/23/2026|valid|10|550|
19|IndiaVision|<https://www.indiavision.com/feed>|200|02/23/2026|valid|25|1600|
20|OpIndia|<https://www.opindia.com/feed>|200|02/23/2026|valid|10|640|
21|OrissaPOST|<https://www.orissapost.com/feed>|200|02/23/2026|valid|20|1266|
22|India's News.Net|<https://feeds.indiasnews.net/rss/701ee96610c884a6>|200|02/23/2026|valid|100|6400|
23|TechGenYZ|<https://techgenyz.com/feed>|200|02/23/2026|valid|10|580|
24|WYM News (Blogspot)|<https://latestnewsupdate4you.blogspot.com/feeds/posts/default>|200|02/23/2026|valid|25|1600|
25|Star of Mysore|<https://starofmysore.com/feed>|200|02/23/2026|valid|10|630|
26|ABP News|<https://news.abplive.com/home/feed>|200|02/23/2026|valid|21|1289|
27|The India Bizz|<https://theindiabizz.com/feed>|200|02/23/2026|valid|10|580|

### United Kingdom (GB)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Financial Times - World|<https://www.ft.com/rss/world>|200|02/23/2026|valid|25|1600|
2|Financial Times - Energy|<https://www.ft.com/rss/companies/energy>|200|02/23/2026|valid|25|1600|
3|BBC News - Business|<https://feeds.bbci.co.uk/news/business/rss.xml>|200|02/23/2026|valid|54|3231|
4|BBC News - World|<https://feeds.bbci.co.uk/news/world/rss.xml>|200|02/23/2026|valid|43|2401|
5|The Guardian - World|<https://www.theguardian.com/world/rss>|200|02/23/2026|valid|45|2880|
6|The Guardian - Business|<https://www.theguardian.com/business/rss>|200|02/23/2026|valid|20|1280|
7|Sky News - World|<https://feeds.skynews.com/feeds/rss/world.xml>|200|02/23/2026|valid|10|640|
8|Sky News - Business|<https://feeds.skynews.com/feeds/rss/business.xml>|200|02/23/2026|valid|10|640|
9|Telegraph - Business|<https://www.telegraph.co.uk/business/rss.xml>|200|02/23/2026|valid|0|6720|
10|City A.M. (London Finance)|<https://www.cityam.com/feed/>|200|02/23/2026|valid|30|1830|
11|The Independent|<https://www.independent.co.uk/rss>|200|02/23/2026|valid|100|6400|
12|Financial Times UK|<https://www.ft.com/?format=rss>|200|02/23/2026|valid|10|625|
13|The Telegraph UK|<https://www.telegraph.co.uk/rss.xml>|200|02/23/2026|valid|0|6720|
14|Daily Mail|<https://www.dailymail.co.uk/home/index.rss>|200|02/23/2026|valid|120|7680|
15|Metro UK|<https://metro.co.uk/feed/>|200|02/23/2026|valid|30|1648|
16|The Sun|<https://www.thesun.co.uk/feed/>|200|02/23/2026|valid|0|962|
17|The Guardian UK|<https://www.theguardian.com/uk/rss>|200|02/23/2026|valid|120|7680|
18|Sky News|<https://feeds.skynews.com/feeds/rss/uk.xml>|200|02/23/2026|valid|10|640|
19|Financial Times|<https://www.ft.com/rss/home>|200|02/23/2026|valid|11|631|
20|iNews|<https://inews.co.uk/rss>|200|02/23/2026|valid|10|640|
21|BBC Culture|<https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml>|200|02/23/2026|valid|22|1555|
22|The Evening Standard|<https://www.standard.co.uk/rss>|200|02/23/2026|valid|100|6186|

### France (FR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|France 24|<https://www.france24.com/en/rss>|200|02/23/2026|valid|23|1526|
2|The Local (France)|<https://feeds.thelocal.com/rss/fr>|200|02/23/2026|valid|20|1280|
3|RFI (France)|<https://www.rfi.fr/en/france/rss>|200|02/23/2026|valid|30|1920|
4|RFI (All / EN)|<https://www.rfi.fr/en/rss>|200|02/23/2026|valid|22|1352|
5|Mediapart|<https://www.mediapart.fr/articles/feed>|200|02/23/2026|valid|10|640|
6|Le Monde diplomatique|<https://mondediplo.com/backend>|200|02/23/2026|valid|0|0|
7|Sud Ouest|<https://www.sudouest.fr/essentiel/rss.xml>|200|02/23/2026|valid|20|1280|
8|L'Est Républicain|<https://www.estrepublicain.fr/rss>|200|02/23/2026|valid|20|1280|
9|France Soir|<https://www.francesoir.fr/rss.xml>|200|02/23/2026|valid|10|420|
10|Dernières Nouvelles d'Alsace (DNA)|<https://www.dna.fr/rss>|200|02/23/2026|valid|20|1280|
11|La Croix|<https://www.la-croix.com/feeds/rss/site.xml>|200|02/23/2026|valid|50|3200|
12|La Dépêche|<https://www.ladepeche.fr/rss.xml>|200|02/23/2026|valid|100|6400|
13|20 Minutes|<https://www.20minutes.fr/feeds/rss-une.xml>|200|02/23/2026|valid|30|1920|
14|Yahoo Actualités|<https://fr.news.yahoo.com/rss>|200|02/23/2026|valid|5|320|
15|InfoMigrants (EN)|<https://www.infomigrants.net/en/rss/all.xml>|200|02/23/2026|valid|0|680|
16|France Today|<https://www.francetoday.com/feed>|200|02/23/2026|valid|12|504|
17|FrenchDailyNews|<https://frenchdailynews.com/feed>|200|02/23/2026|valid|10|640|
18|Le Monde (EN – Main)|<https://www.lemonde.fr/en/rss/une.xml>|200|02/23/2026|valid|18|1152|
19|Le Monde (EN – International)|<https://www.lemonde.fr/en/international/rss_full.xml>|200|02/23/2026|valid|20|1280|
20|Le Monde (EN – Editorials)|<https://www.lemonde.fr/en/editorials/rss_full.xml>|200|02/23/2026|valid|20|1280|
21|Le Monde (EN – Europe)|<https://www.lemonde.fr/en/europe/rss_full.xml>|200|02/23/2026|valid|20|1280|
22|Le Monde (EN – United States)|<https://www.lemonde.fr/en/united-states/rss_full.xml>|200|02/23/2026|valid|20|1280|
23|Le Monde (EN – Economy)|<https://www.lemonde.fr/en/economy/rss_full.xml>|200|02/23/2026|valid|20|1280|
24|Le Monde (EN – Culture)|<https://www.lemonde.fr/en/culture/rss_full.xml>|200|02/23/2026|valid|20|1280|
25|Le Monde (EN – Sports)|<https://www.lemonde.fr/en/sports/rss_full.xml>|200|02/23/2026|valid|20|1280|
26|Le Monde (EN – Environment)|<https://www.lemonde.fr/en/environment/rss_full.xml>|200|02/23/2026|valid|20|1280|
27|Le Monde (EN – Science)|<https://www.lemonde.fr/en/science/rss_full.xml>|200|02/23/2026|valid|20|1280|

### Italy (IT)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|ANSA (Main)|<https://www.ansa.it/sito/ansait_rss.xml>|200|02/23/2026|valid|28|1801|
2|ANSA (Top News)|<https://www.ansa.it/sito/notizie/topnews/topnews_rss.xml>|200|02/23/2026|valid|10|640|
3|ANSA (Cronaca)|<https://www.ansa.it/sito/notizie/cronaca/cronaca_rss.xml>|200|02/23/2026|valid|120|7680|
4|ANSA (Politica)|<https://www.ansa.it/sito/notizie/politica/politica_rss.xml>|200|02/23/2026|valid|13|986|
5|ANSA (Mondo)|<https://www.ansa.it/sito/notizie/mondo/mondo_rss.xml>|200|02/23/2026|valid|47|2422|
6|ANSA (Economia)|<https://www.ansa.it/sito/notizie/economia/economia_rss.xml>|200|02/23/2026|valid|52|1949|
7|ANSA (Calcio)|<https://www.ansa.it/sito/notizie/sport/calcio/calcio_rss.xml>|200|02/23/2026|valid|56|4129|
8|ANSA (Sport)|<https://www.ansa.it/sito/notizie/sport/sport_rss.xml>|200|02/23/2026|valid|28|3583|
9|ANSA (Cinema)|<https://www.ansa.it/sito/notizie/cultura/cinema/cinema_rss.xml>|200|02/23/2026|valid|24|1400|
10|ANSA (Cultura e Tendenze)|<https://www.ansa.it/sito/notizie/cultura/cultura_rss.xml>|200|02/23/2026|valid|108|7232|
11|ANSA (Foto)|<https://www.ansa.it/sito/photogallery/foto_rss.xml>|200|02/23/2026|valid|120|7680|
12|ANSA (Video)|<https://www.ansa.it/sito/videogallery/video_rss.xml>|200|02/23/2026|valid|120|7680|
13|Corriere della Sera (Homepage)|<https://www.corriere.it/rss/homepage.xml>|200|02/23/2026|valid|69|4416|
14|Corriere della Sera (Ultimora)|<https://www.corriere.it/rss/ultimora.xml>|200|02/23/2026|valid|0|0|
15|Corriere della Sera (feed-hp Homepage)|<https://www.corriere.it/feed-hp/homepage.xml>|200|02/23/2026|valid|119|7599|
16|la Repubblica|<https://www.repubblica.it/rss/homepage/rss2.0.xml>|200|02/23/2026|valid|30|1897|
17|La Stampa|<https://www.lastampa.it/rss/copertina.xml>|200|02/23/2026|valid|86|4838|
18|Il Sole 24 Ore (Italia)|<https://www.ilsole24ore.com/rss/italia.xml>|200|02/23/2026|valid|12|768|
19|Il Fatto Quotidiano|<https://www.ilfattoquotidiano.it/feed/>|200|02/23/2026|valid|25|1600|
20|La Gazzetta dello Sport|<https://www.gazzetta.it/rss/home.xml>|200|02/23/2026|valid|120|7680|
21|IL Tempo|<https://www.iltempo.it/rss.xml>|200|02/23/2026|valid|60|5610|
22|Libero Quotidiano|<https://www.liberoquotidiano.it/rss.xml>|200|02/23/2026|valid|60|5455|
23|MilanoToday|<https://www.milanotoday.it/rss>|200|02/23/2026|valid|25|1400|
24|The Florentine|<https://www.theflorentine.net/feed>|200|02/23/2026|valid|0|340|
25|Wanted in Rome|<https://www.wantedinrome.com/news?format=rss>|200|02/23/2026|valid|20|1280|
26|Florence Daily News|<https://florencedailynews.com/feed>|200|02/23/2026|valid|10|640|
27|Alto Adige (Cronaca)|<https://www.altoadige.it/feed-rss/cronaca-1.169>|200|02/23/2026|valid|20|482|
28|Italia a Tavola|<https://rss.italiaatavola.net/feed.xml>|200|02/23/2026|valid|30|1920|
29|la Città di Salerno|<https://www.lacittadisalerno.it/feed>|200|02/23/2026|valid|10|640|
30|Notizie Geopolitiche|<https://www.notiziegeopolitiche.net/feed>|200|02/23/2026|valid|10|630|

### Canada (CA)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Global News|<https://globalnews.ca/feed>|200|02/23/2026|valid|10|640|
2|rabble.ca|<https://rabble.ca/feed>|200|02/23/2026|valid|12|768|
3|National Post|<https://nationalpost.com/feed>|200|02/23/2026|valid|10|640|
4|Toronto Sun|<https://torontosun.com/feed>|200|02/23/2026|valid|10|640|
5|Financial Post|<https://feeds.feedburner.com/FP_TopStories>|200|02/23/2026|valid|10|680|
6|CityNews Toronto|<https://toronto.citynews.ca/feed>|200|02/23/2026|valid|15|960|
7|Calgary Herald|<https://calgaryherald.com/feed>|200|02/23/2026|valid|10|640|
8|Edmonton Journal|<https://edmontonjournal.com/feed>|200|02/23/2026|valid|10|640|
9|Windsor Star|<https://windsorstar.com/feed>|200|02/23/2026|valid|10|640|
10|The Province|<https://theprovince.com/feed>|200|02/23/2026|valid|10|640|
11|Calgary Sun|<https://calgarysun.com/feed>|200|02/23/2026|valid|10|640|
12|Ottawa Sun|<https://ottawasun.com/feed>|200|02/23/2026|valid|10|640|
13|The Tyee|<https://thetyee.ca/rss2.xml>|200|02/23/2026|valid|21|1988|
14|The StarPhoenix|<https://thestarphoenix.com/feed>|200|02/23/2026|valid|10|640|
15|Edmonton Sun|<https://edmontonsun.com/feed>|200|02/23/2026|valid|10|640|
16|Canada.com|<https://o.canada.com/feed>|200|02/23/2026|valid|10|640|
17|Business In Vancouver (BIV)|<https://biv.com/rss>|200|02/23/2026|valid|20|1280|
18|Regina Leader Post|<https://leaderpost.com/feed>|200|02/23/2026|valid|10|630|
19|Owen Sound Sun Times|<https://owensoundsuntimes.com/feed>|200|02/23/2026|valid|8|512|
20|Stratford Beacon Herald|<https://stratfordbeaconherald.com/feed>|200|02/23/2026|valid|8|512|
21|The Georgia Straight|<https://straight.com/content/rss>|200|02/23/2026|valid|15|945|
22|Grande Prairie Daily Herald Tribune|<https://dailyheraldtribune.com/feed>|200|02/23/2026|valid|8|512|
23|YGK News (Kingston)|<https://ygknews.ca/feed>|200|02/23/2026|valid|10|630|
24|Prince Albert Daily Herald|<https://paherald.sk.ca/feed>|200|02/23/2026|valid|10|630|
25|Sunny South News|<https://sunnysouthnews.com/feed>|200|02/23/2026|valid|10|640|
26|The Afro News|<https://theafronews.com/feed>|200|02/23/2026|valid|10|620|
27|CTV News - Top Stories|<https://www.ctvnews.ca/rss/ctvnews-ca-top-stories-public-rss-1.822009>|Recovered via sitemap|02/23/2026|valid|0|0|
28|CTV News - Business|<https://www.ctvnews.ca/rss/business/ctvnews-ca-business-public-rss-1.822283>|Recovered via sitemap|02/23/2026|valid|0|0|
29|Global News - Politics|<https://globalnews.ca/politics/feed/>|200|02/23/2026|valid|10|30|
30|Toronto Star - Politics|<https://www.thestar.com/search/?f=rss&t=article&c=politics&l=50&s=start_time&sd=desc>|200|02/23/2026|valid|50|150|
31|BNN Bloomberg (Canada Biz)|<https://www.bnnbloomberg.ca/business/rss>|Recovered via sitemap|02/23/2026|valid|0|0|
32|CBC News - Business|<https://www.cbc.ca/cmlink/rss-business>|ERR (TIMEOUT)|02/23/2026|invalid|0|0|
33|CBC News - World|<https://www.cbc.ca/cmlink/rss-world>|ERR (TIMEOUT)|02/23/2026|invalid|0|0|
34|Financial Post (Economy)|<https://financialpost.com/feed>|200|02/23/2026|valid|10|20|

### Russia (RU)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|RT|<https://rt.com/feed>|200|02/23/2026|valid|100|6400|
2|The Bell|<https://thebell.io/feed>|200|02/23/2026|valid|20|1280|
3|Interfax|<https://www.interfax.ru/rss.asp>|200|02/23/2026|valid|25|1600|
4|RT Economy|<https://www.rt.com/rss/business>|200|02/23/2026|valid|100|6400|
5|The Bell|<https://thebell.io/feed/>|200|02/23/2026|valid|20|1280|
6|Lenta|<https://lenta.ru/rss/news>|200|02/23/2026|valid|120|7680|
7|TASS Finance|<https://tass.com/rss/v2.xml>|200|02/23/2026|valid|100|5181|
8|RT News|<https://www.rt.com/rss/>|200|02/23/2026|valid|100|6400|
9|Kommersant (Главное)|<https://www.kommersant.ru/RSS/main.xml>|200|02/23/2026|valid|33|1026|
10|The Moscow Times|<https://www.themoscowtimes.com/rss/news>|200|02/23/2026|valid|50|3200|
11|PravdaReport|<https://www.pravdareport.com/export.xml>|200|02/23/2026|valid|20|1280|
12|Meduza (all)|<https://meduza.io/rss2/all>|200|02/23/2026|valid|30|1920|
13|Habr (all)|<https://habr.com/ru/rss/all/all/?fl=ru>|200|02/23/2026|valid|40|2560|

### South Korea (KR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Yonhap (EN)|<https://en.yna.co.kr/RSS/news.xml>|200|02/23/2026|valid|96|6564|
2|Donga Ilbo|<https://rss.donga.com/total.xml>|200|02/23/2026|valid|50|3200|
3|Seoul Newspaper|<https://www.seoul.co.kr/xml/rss/rss_top.xml>|Recovered via sitemap|02/23/2026|valid|26|1638|
4|Newsis|<https://www.newsis.com/RSS/sokbo.xml>|200|02/23/2026|valid|100|6400|
5|Aju News|<https://rss.ajunews.com/sokbo.xml>|200|02/23/2026|valid|50|3200|
6|KED Global (Korea Economic Daily)|<https://www.kedglobal.com/newsRss>|200|02/23/2026|valid|0|1159|
7|Daily NK (EN)|<https://www.dailynk.com/english/feed>|200|02/23/2026|valid|10|590|
8|Korea Times (RSS directory)|<https://feed.koreatimes.co.kr/k/allnews.xml>|200|02/23/2026|valid|26|1562|
9|Korea Herald (RSS directory)|<https://www.koreaherald.com/rss/newsAll>|200|02/23/2026|valid|45|3031|
10|KBS World Radio (RSS directory)|<http://world.kbs.co.kr/rss/rss_news.htm?lang=e>|200|02/23/2026|valid|0|1020|
11|한국경제 - 전체뉴스|<https://www.hankyung.com/feed/all-news>|200|02/23/2026|valid|50|3200|
12|한국경제 - 증권|<https://www.hankyung.com/feed/finance>|200|02/23/2026|valid|50|3200|
13|한국경제 - 경제|<https://www.hankyung.com/feed/economy>|200|02/23/2026|valid|50|3200|
14|한국경제 - 부동산|<https://www.hankyung.com/feed/realestate>|200|02/23/2026|valid|50|3200|
15|한국경제 - IT|<https://www.hankyung.com/feed/it>|200|02/23/2026|valid|50|3200|
16|한국경제 - 정치|<https://www.hankyung.com/feed/politics>|200|02/23/2026|valid|50|3200|
17|한국경제 - 국제|<https://www.hankyung.com/feed/international>|200|02/23/2026|valid|50|3200|
18|매일경제 - 뉴스 헤드라인|<https://www.mk.co.kr/rss/30000001/>|200|02/23/2026|valid|50|3200|
19|매일경제 - 뉴스 전체뉴스|<https://www.mk.co.kr/rss/40300001/>|200|02/23/2026|valid|50|3200|
20|매일경제 - 뉴스 경제|<https://www.mk.co.kr/rss/30100041/>|200|02/23/2026|valid|50|3200|
21|매일경제 - 뉴스 정치|<https://www.mk.co.kr/rss/30200030/>|200|02/23/2026|valid|50|3200|
22|매일경제 - 뉴스 사회|<https://www.mk.co.kr/rss/50400012/>|200|02/23/2026|valid|50|3200|
23|SBS - 정치|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=01&plink=RSSREADER>|200|02/23/2026|valid|29|1856|
24|SBS - 경제|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=02&plink=RSSREADER>|200|02/23/2026|valid|29|1856|
25|SBS - 사회|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=03&plink=RSSREADER>|200|02/23/2026|valid|29|1856|
26|SBS - 생활/문화|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=07&plink=RSSREADER>|200|02/23/2026|valid|29|1856|
27|SBS - 국제/글로벌|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=08&plink=RSSREADER>|200|02/23/2026|valid|29|1856|
28|SBS - 연예/방송|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=14&plink=RSSREADER>|200|02/23/2026|valid|29|1856|
29|SBS - 스포츠|<https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=09&plink=RSSREADER>|200|02/23/2026|valid|29|1856|
30|한겨레 - 국제|<https://www.hani.co.kr/rss/international/>|200|02/23/2026|valid|29|689|
31|한겨레 - 문화|<https://www.hani.co.kr/rss/culture/>|200|02/23/2026|valid|30|690|
32|한겨레 - 스포츠|<https://www.hani.co.kr/rss/sports/>|200|02/23/2026|valid|30|690|
33|한겨레:온 - 섹션1|<https://www.hanion.co.kr/rss/S1N1.xml>|200|02/23/2026|valid|20|1260|
34|한겨레:온 - 섹션2|<https://www.hanion.co.kr/rss/S1N2.xml>|200|02/23/2026|valid|20|1260|
35|한겨레:온 - 섹션3|<https://www.hanion.co.kr/rss/S1N3.xml>|200|02/23/2026|valid|20|1260|
36|경향신문 - 전체|<https://www.khan.co.kr/rss/rssdata/total_news.xml>|200|02/23/2026|valid|50|3200|
37|MBC 주요뉴스|<https://imnews.imbc.com/rss/google_news/narrativeNews.rss>|200|02/23/2026|valid|0|0|
38|조선닷컴 (전체)|<https://www.chosun.com/arc/outboundfeeds/rss/?outputType=xml>|200|02/23/2026|valid|100|6400|

### Brazil (BR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|G1 (Globo - Economy)|<https://g1.globo.com/rss/g1/economia/>|200|02/23/2026|valid|100|6400|
2|G1 (Globo - Tech)|<https://g1.globo.com/rss/g1/tecnologia/>|200|02/23/2026|valid|100|6400|
3|Folha de S.Paulo - Top|<https://feeds.folha.uol.com.br/emcimadahora/rss091.xml>|200|02/23/2026|valid|100|6400|
4|Folha de S.Paulo - Market|<https://feeds.folha.uol.com.br/mercado/rss091.xml>|200|02/23/2026|valid|100|6400|
5|Correio Braziliense|<https://www.correiobraziliense.com.br/rss/noticia/economia/rss.xml>|200|02/23/2026|valid|30|1920|
6|InfoMoney|<https://www.infomoney.com.br/feed/>|200|02/23/2026|valid|10|640|
7|Canaltech|<https://canaltech.com.br/rss/>|200|02/23/2026|valid|50|3150|
8|Forbes Brazil|<https://forbes.com.br/feed/>|200|02/23/2026|valid|50|3200|
9|Estado de Minas|<https://www.em.com.br/feed/>|200|02/23/2026|valid|0|2440|
10|Veja|<https://veja.abril.com.br/feed/>|200|02/23/2026|valid|20|1280|
11|Folha - Poder (정치)|<https://feeds.folha.uol.com.br/poder/rss091.xml>|200|02/23/2026|valid|100|6400|
12|Folha - Mundo|<https://feeds.folha.uol.com.br/mundo/rss091.xml>|200|02/23/2026|valid|100|6400|
13|Folha - Cotidiano|<https://feeds.folha.uol.com.br/cotidiano/rss091.xml>|200|02/23/2026|valid|100|6400|
14|Folha - Esporte|<https://feeds.folha.uol.com.br/esporte/rss091.xml>|200|02/23/2026|valid|100|6400|
15|Folha - Ilustrada (문화)|<https://feeds.folha.uol.com.br/ilustrada/rss091.xml>|200|02/23/2026|valid|100|6400|
16|Agência Pública|<https://apublica.org/feed/>|200|02/23/2026|valid|10|640|
17|Nexo Jornal|<https://www.nexojornal.com.br/rss.xml>|200|02/23/2026|valid|20|1280|
18|Jornal GGN|<https://jornalggn.com.br/feed/>|200|02/23/2026|valid|12|504|
19|Jacobin Brasil|<https://jacobin.com.br/feed>|200|02/23/2026|valid|30|1230|
20|CartaCapital|<https://www.cartacapital.com.br/feed>|200|02/23/2026|valid|20|1280|

### Australia (AU)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|ABC News - Business|<https://www.abc.net.au/news/feed/51892/rss.xml>|200|02/23/2026|valid|25|1575|
2|ABC News - World|<https://www.abc.net.au/news/feed/104217382/rss.xml>|200|02/23/2026|valid|4|252|
3|ABC News - Top Stories|<https://www.abc.net.au/news/feed/10719986/rss.xml>|200|02/23/2026|valid|25|1575|
4|Sydney Morning Herald - Business|<https://www.smh.com.au/rss/business.xml>|200|02/23/2026|valid|20|1280|
5|The Age - Business|<https://www.theage.com.au/rss/business.xml>|200|02/23/2026|valid|20|1280|
6|The Australian - Business|<https://www.theaustralian.com.au/business/rss>|200|02/23/2026|valid|0|0|
7|The Guardian Australia|<https://www.theguardian.com/au/rss>|200|02/23/2026|valid|108|7417|
8|ABC News (Top)|<https://www.abc.net.au/news/feed/1106/rss.xml>|200|02/23/2026|valid|8|504|
9|Australian Broadcasting Corporation - World|<https://www.abc.net.au/news/feed/51892/rss.xml?edition=world>|200|02/23/2026|valid|25|1575|
10|The Guardian Australia|<https://www.theguardian.com/australia-news/rss>|200|02/23/2026|valid|24|1469|
11|SBS World News|<https://www.sbs.com.au/news/topic/latest/feed>|200|02/23/2026|valid|25|1600|
12|SBS News (Breaking)|<https://www.sbs.com.au/news/feed>|200|02/23/2026|valid|24|1536|
13|9News|<https://www.9news.com.au/rss>|200|02/23/2026|valid|19|1002|
14|Sydney Morning Herald|<https://www.smh.com.au/rss/feed.xml>|200|02/23/2026|valid|20|1280|
15|The Age|<https://www.theage.com.au/rss/feed.xml>|200|02/23/2026|valid|20|1280|
16|Canberra Times|<https://www.canberratimes.com.au/rss.xml>|200|02/23/2026|valid|16|1126|
17|PerthNow|<https://www.perthnow.com.au/news/feed>|200|02/23/2026|valid|100|6400|
18|The Australian|<https://www.theaustralian.com.au/business/markets/rss>|200|02/23/2026|valid|0|0|
19|7news|<https://7news.com.au/feed>|200|02/23/2026|valid|100|6400|
20|RenewEconomy (호주 신재생/전력망 1위)|<https://reneweconomy.com.au/feed/>|200|02/23/2026|valid|10|300|
21|Australian Mining (광물/리튬)|<https://www.australianmining.com.au/feed/>|200|02/23/2026|valid|5|150|
22|MacroBusiness (매크로/부동산 심층분석)|<https://www.macrobusiness.com.au/feed/>|200|02/23/2026|valid|30|900|
23|SmartCompany (스타트업/비즈니스)|<https://www.smartcompany.com.au/feed/>|200|02/23/2026|valid|10|300|
24|Startup Daily (테크)|<https://www.startupdaily.net/feed/>|200|02/23/2026|valid|10|300|
25|The Conversation AU (오피니언/정책)|<https://theconversation.com/au/rss>|Recovered via sitemap|02/23/2026|valid|36|2085|

### Spain (ES)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Expansión (Financial)|<https://e00-expansion.uecdn.es/rss/empresas.xml>|200|02/23/2026|valid|49|3126|
2|Cinco Días (Economy)|<https://cincodias.elpais.com/arc/outboundfeeds/rss/?outputType=xml>|200|02/23/2026|valid|100|6400|
3|El País - Economy|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/economia/portada>|200|02/23/2026|valid|39|2403|
4|El Mundo - Economy|<https://e00-elmundo.uecdn.es/elmundo/rss/economia.xml>|200|02/23/2026|valid|52|3461|
5|El Confidencial|<https://rss.elconfidencial.com/espana/>|200|02/23/2026|valid|15|960|
6|El Periodico|<https://www.elperiodico.com/es/rss/rss_portada.xml>|200|02/23/2026|valid|0|0|
7|20 Minutos|<https://www.20minutos.es/rss/>|200|02/23/2026|valid|120|7680|
8|El Diario|<https://www.eldiario.es/rss/>|200|02/23/2026|valid|110|6424|
9|eldiario|<https://www.eldiario.es/rss/>|200|02/23/2026|valid|110|6424|
10|Marca|<https://www.marca.com/rss/>|200|02/23/2026|valid|0|0|
11|El Pais|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada>|200|02/23/2026|valid|120|7667|
12|EL PAÍS - Últimas|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/ultimas-noticias/portada>|200|02/23/2026|valid|83|4876|
13|EL PAÍS - Internacional|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/internacional/portada>|200|02/23/2026|valid|22|1320|
14|EL PAÍS - Opinión|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/opinion/portada>|200|02/23/2026|valid|25|1543|
15|EL PAÍS - España|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/espana/portada>|200|02/23/2026|valid|19|1147|
16|EL PAÍS - Sociedad|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/sociedad/portada>|200|02/23/2026|valid|28|1756|
17|EL PAÍS - Ciencia|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/ciencia/portada>|200|02/23/2026|valid|39|2379|
18|EL PAÍS - Tecnología|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/tecnologia/portada>|200|02/23/2026|valid|16|976|
19|EL PAÍS - Cultura|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/cultura/portada>|200|02/23/2026|valid|31|1933|
20|EL PAÍS - Deportes|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/deportes/portada>|200|02/23/2026|valid|29|1756|
21|EL PAÍS - Gente|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/gente/portada>|200|02/23/2026|valid|21|1315|
22|EL PAÍS - Clima y medio ambiente|<https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/clima-y-medio-ambiente/portada>|200|02/23/2026|valid|19|1174|
23|La Vanguardia - Portada|<https://www.lavanguardia.com/rss/home.xml>|200|02/23/2026|valid|120|7320|
24|La Vanguardia - Internacional|<https://www.lavanguardia.com/rss/internacional.xml>|200|02/23/2026|valid|100|6100|
25|La Vanguardia - Política|<https://www.lavanguardia.com/rss/politica.xml>|200|02/23/2026|valid|100|6100|
26|La Vanguardia - Opinión|<https://www.lavanguardia.com/rss/opinion.xml>|200|02/23/2026|valid|93|5651|
27|La Vanguardia - Sociedad|<https://www.lavanguardia.com/rss/sociedad.xml>|200|02/23/2026|valid|99|6039|
28|La Vanguardia - Deportes|<https://www.lavanguardia.com/rss/deportes.xml>|200|02/23/2026|valid|100|6100|
29|El Mundo - Portada|<https://e00-elmundo.uecdn.es/rss/portada.xml>|200|02/23/2026|valid|24|1583|
30|The Local Spain (EN)|<https://feeds.thelocal.com/rss/es>|200|02/23/2026|valid|20|1220|
31|El Economista - Portada (스페인 금융 1위)|<https://www.eleconomista.es/rss/rss-portada.php>|403 (HTTP_403)|02/23/2026|invalid|0|234|
32|El Economista - Mercados (주식/마켓)|<https://www.eleconomista.es/rss/rss-mercados.php>|403 (HTTP_403)|02/23/2026|invalid|14|180|
33|ABC.es - Economía (보수 3대장)|<https://www.abc.es/rss/feeds/abc_economia.xml>|200|02/23/2026|valid|20|600|
34|Vozpópuli (경제/정치 탐사)|<https://www.vozpopuli.com/rss>|200|02/23/2026|valid|25|750|
35|El Periódico de la Energía (에너지/전력망 특화)|<https://elperiodicodelaenergia.com/feed/>|200|02/23/2026|valid|50|1500|
36|Xataka (스페인어권 최대 테크 매체)|<https://www.xataka.com/feed>|Recovered via sitemap|02/23/2026|valid|67|2046|
37|ABC.es|<https://www.abc.es/rss/feeds/abc_ultima.xml>|200|02/23/2026|valid|20|40|

### Mexico (MX)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Proceso (Investigative)|<https://www.proceso.com.mx/rss/feed.html>|200|02/23/2026|valid|0|1052|
2|Expansion (Biz)|<https://expansion.mx/rss>|200|02/23/2026|valid|47|2987|
3|Contralínea|<https://www.contralinea.com.mx/feed>|200|02/23/2026|valid|6|384|
4|El Financiero|<https://www.elfinanciero.com.mx/rss/mundo>|200|02/23/2026|valid|100|6311|
5|Proceso World|<https://www.proceso.com.mx/rss/feed.html?output=xml>|200|02/23/2026|valid|0|1052|
6|El Financiero|<https://www.elfinanciero.com.mx/rss>|200|02/23/2026|valid|100|6311|
7|ADN40 (TV Azteca - Economy)|<https://www.adn40.mx/economia/rss>|Recovered via sitemap|02/23/2026|valid|0|0|
8|ADN40 (TV Azteca - Mexico)|<https://www.adn40.mx/mexico/rss>|Recovered via sitemap|02/23/2026|valid|0|0|
9|El Financiero (Economía)|<https://www.elfinanciero.com.mx/rss/economia>|200|02/23/2026|valid|100|300|
10|El Financiero (Mercados)|<https://www.elfinanciero.com.mx/rss/mercados>|200|02/23/2026|valid|100|300|
11|La Jornada - Economía|<https://www.jornada.com.mx/rss/economia.xml>|200|02/23/2026|valid|13|39|
12|Aristegui (Main)|<https://editorial.aristeguinoticias.com/feed/>|200|02/23/2026|valid|10|630|
13|Aristegui (México)|<https://editorial.aristeguinoticias.com/category/mexico/feed/>|200|02/23/2026|valid|15|945|
14|Aristegui (Dinero y Economía)|<https://editorial.aristeguinoticias.com/category/dinero-y-economia/feed/>|200|02/23/2026|valid|15|945|
15|Aristegui (Mundo)|<https://editorial.aristeguinoticias.com/category/mundo/feed/>|200|02/23/2026|valid|15|945|
16|Aristegui En Vivo - Entérate|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/enterate/feed>|200|02/23/2026|valid|15|945|
17|Aristegui En Vivo - Programas completos|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/programas-completos/feed>|200|02/23/2026|valid|15|945|
18|Aristegui En Vivo - Entrevistas completas|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/entrevistas-completos/feed>|200|02/23/2026|valid|0|0|
19|Aristegui En Vivo - Mesa política|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/mesa-politica-en-vivo/feed>|200|02/23/2026|valid|15|945|
20|Aristegui En Vivo - Investigaciones especiales|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/investigaciones-especiales/feed>|200|02/23/2026|valid|15|945|
21|Aristegui En Vivo - Enlaces en vivo|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/enlaces-en-vivo/feed>|200|02/23/2026|valid|15|945|
22|Aristegui En Vivo - Titulares del día|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/titulares-del-dia/feed>|200|02/23/2026|valid|15|945|
23|Aristegui En Vivo - Deportes|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/deportes-aristegui-en-vivo/feed>|200|02/23/2026|valid|15|945|
24|Aristegui En Vivo - Dinero y Economía|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/dinero-y-economia/feed>|200|02/23/2026|valid|15|945|
25|Aristegui En Vivo - Niñonautas|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/ninonautas/feed>|200|02/23/2026|valid|15|945|
26|Aristegui En Vivo - Las plumas de la serpiente|<https://editorial.aristeguinoticias.com/category/aristegui-en-vivo/las-plumas-de-la-serpiente/feed>|200|02/23/2026|valid|15|945|
27|El Economista - Top Noticias (멕시코 경제 1위)|<https://www.eleconomista.com.mx/rss/top-noticias>|403 (HTTP_403)|02/23/2026|invalid|0|0|
28|El Economista - Empresas|<https://www.eleconomista.com.mx/rss/empresas>|403 (HTTP_403)|02/23/2026|invalid|0|0|
29|El Universal - General (최대 일간지)|<https://www.eluniversal.com.mx/rss.xml>|Recovered via sitemap|02/23/2026|valid|0|0|
30|El Universal - Cartera (경제/지갑)|<https://www.eluniversal.com.mx/cartera/rss.xml>|Recovered via sitemap|02/23/2026|valid|0|0|
31|Milenio (전국지)|<https://www.milenio.com/rss>|Recovered via sitemap|02/23/2026|valid|0|0|
32|Excelsior (보수 유력지)|<https://www.excelsior.com.mx/rss.xml>|Recovered via sitemap|02/23/2026|valid|0|0|
33|Forbes México|<https://www.forbes.com.mx/feed/>|Recovered via sitemap|02/23/2026|valid|0|962|
34|Energía a Debate (멕시코 에너지 전문)|<https://energiaadebate.com/feed/>|200|02/23/2026|valid|90|2700|

### Indonesia (ID)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Republika|<https://www.republika.co.id/rss>|200|02/23/2026|valid|15|960|
2|Sindo News|<https://www.sindonews.com/rss/home/>|200|02/23/2026|valid|30|1920|
3|Kapanlagi|<https://www.kapanlagi.com/feed/>|200|02/23/2026|valid|120|6518|
4|Antara TV|<https://www.antaranews.com/rss/terkini>|200|02/23/2026|valid|50|2900|
5|Sindonews|<https://www.sindonews.com/rss/>|200|02/23/2026|valid|30|1920|
6|Republika|<https://www.republika.co.id/rss/terkini>|200|02/23/2026|valid|0|0|
7|ANTARA - Terkini|<https://www.antaranews.com/rss/terkini.xml>|200|02/23/2026|valid|50|2750|
8|ANTARA - Top News|<https://www.antaranews.com/rss/top-news.xml>|200|02/23/2026|valid|30|1800|
9|ANTARA - Politik|<https://www.antaranews.com/rss/politik.xml>|200|02/23/2026|valid|20|1180|
10|ANTARA - Hukum|<https://www.antaranews.com/rss/hukum.xml>|200|02/23/2026|valid|20|1160|
11|ANTARA - Ekonomi|<https://www.antaranews.com/rss/ekonomi.xml>|ERR (TIMEOUT)|02/23/2026|invalid|20|1240|
12|ANTARA - Ekonomi (Finansial)|<https://www.antaranews.com/rss/ekonomi-finansial.xml>|200|02/23/2026|valid|20|1200|
13|ANTARA - Ekonomi (Bisnis)|<https://www.antaranews.com/rss/ekonomi-bisnis.xml>|200|02/23/2026|valid|0|1160|
14|ANTARA - Ekonomi (Bursa)|<https://www.antaranews.com/rss/ekonomi-bursa.xml>|200|02/23/2026|valid|20|1240|
15|ANTARA - Metro|<https://www.antaranews.com/rss/metro.xml>|200|02/23/2026|valid|20|1200|
16|ANTARA - Metro (Kriminalitas)|<https://www.antaranews.com/rss/metro-kriminalitas.xml>|200|02/23/2026|valid|20|1200|
17|ANTARA - Metro (Lintas Kota)|<https://www.antaranews.com/rss/metro-lintas-kota.xml>|200|02/23/2026|valid|20|1200|
18|ANTARA - Metro (Lenggang Jakarta)|<https://www.antaranews.com/rss/metro-lenggang-jakarta.xml>|200|02/23/2026|valid|20|1220|
19|ANTARA - Sepakbola|<https://www.antaranews.com/rss/sepakbola.xml>|200|02/23/2026|valid|20|1200|
20|ANTARA - Sepakbola (Liga Indonesia)|<https://www.antaranews.com/rss/sepakbola-liga-indonesia.xml>|ERR (TIMEOUT)|02/23/2026|invalid|20|1200|
21|ANTARA - Sepakbola (Internasional)|<https://www.antaranews.com/rss/sepakbola-internasional.xml>|ERR (TIMEOUT)|02/23/2026|invalid|20|1120|
22|ANTARA - Sepakbola (Liga Inggris)|<https://www.antaranews.com/rss/sepakbola-liga-inggris-premier.xml>|200|02/23/2026|valid|20|1240|
23|ANTARA - Sepakbola (Liga Spanyol)|<https://www.antaranews.com/rss/sepakbola-liga-spanyol.xml>|200|02/23/2026|valid|20|1220|
24|ANTARA - Sepakbola (Liga Italia)|<https://www.antaranews.com/rss/sepakbola-liga-italia-seri-a.xml>|200|02/23/2026|valid|20|1120|
25|ANTARA - Liga Champions|<https://www.antaranews.com/rss/sepakbola-liga-champions.xml>|200|02/23/2026|valid|20|1120|
26|ANTARA - Olahraga|<https://www.antaranews.com/rss/olahraga.xml>|ERR (TIMEOUT)|02/23/2026|invalid|20|1120|
27|ANTARA - Olahraga (Bulutangkis)|<https://www.antaranews.com/rss/olahraga-bulutangkis.xml>|200|02/23/2026|valid|20|1160|
28|ANTARA - Olahraga (Bola Basket)|<https://www.antaranews.com/rss/olahraga-bola-basket.xml>|200|02/23/2026|valid|20|1200|
29|ANTARA - Olahraga (Tenis)|<https://www.antaranews.com/rss/olahraga-tenis.xml>|200|02/23/2026|valid|20|1240|
30|ANTARA - Olahraga (Balap)|<https://www.antaranews.com/rss/olahraga-balap.xml>|ERR (TIMEOUT)|02/23/2026|invalid|20|1160|
31|ANTARA - Humaniora|<https://www.antaranews.com/rss/humaniora.xml>|200|02/23/2026|valid|0|1160|
32|ANTARA - Lifestyle|<https://www.antaranews.com/rss/lifestyle.xml>|200|02/23/2026|valid|20|1220|
33|ANTARA - Hiburan|<https://www.antaranews.com/rss/hiburan.xml>|200|02/23/2026|valid|20|1200|
34|ANTARA - Dunia|<https://www.antaranews.com/rss/dunia.xml>|200|02/23/2026|valid|20|1240|
35|ANTARA - Dunia (ASEAN)|<https://www.antaranews.com/rss/dunia-asean.xml>|ERR (TIMEOUT)|02/23/2026|invalid|20|1160|
36|ANTARA - Tekno|<https://www.antaranews.com/rss/tekno.xml>|200|02/23/2026|valid|20|1160|
37|RM.ID - Semua berita|<https://rm.id/rss-rakyat-merdeka>|200|02/23/2026|valid|10|630|
38|RM.ID - Nasional|<https://rm.id/rss-rakyat-merdeka/nasional>|200|02/23/2026|valid|0|330|
39|RM.ID - Internasional|<https://rm.id/rss-rakyat-merdeka/internasional>|200|02/23/2026|valid|10|630|
40|RM.ID - Ekonomi Bisnis|<https://rm.id/rss-rakyat-merdeka/ekonomi-bisnis>|200|02/23/2026|valid|10|630|
41|RM.ID - Bank & Finance|<https://rm.id/rss-rakyat-merdeka/bank-finance>|200|02/23/2026|valid|0|0|
42|RM.ID - Indonesianomics|<https://rm.id/rss-rakyat-merdeka/indonesianomics>|200|02/23/2026|valid|0|0|

### Netherlands (NL)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|NOS|<https://feeds.nos.nl/nosnieuwsalgemeen>|200|02/23/2026|valid|20|1280|
2|NRC|<https://www.nrc.nl/rss>|200|02/23/2026|valid|119|7603|
3|AD|<https://www.ad.nl/rss.xml>|200|02/23/2026|valid|30|1920|
4|Nu|<https://www.nu.nl/rss/algemeen>|200|02/23/2026|valid|30|1920|
5|NPO Radio 1|<https://www.npo3fm.nl/rss/>|200|02/23/2026|valid|50|3200|
6|NOS Tech|<https://feeds.nos.nl/nosnieuwstech>|200|02/23/2026|valid|20|1280|
7|NRC|<https://www.nrc.nl/nieuws/rss/>|200|02/23/2026|valid|14|1190|
8|Nieuwsuur|<https://feeds.nos.nl/nieuwsuuralgemeen>|200|02/23/2026|valid|20|1280|
9|RTL|<https://www.rtlnieuws.nl/nieuws/rss.xml>|200|02/23/2026|valid|12|768|
10|NRC|<https://www.nrc.nl/rss/>|200|02/23/2026|valid|119|7603|
11|NOS Nieuws - Binnenland|<https://feeds.nos.nl/nosnieuwsbinnenland>|200|02/23/2026|valid|20|1220|
12|NOS Nieuws - Buitenland|<https://feeds.nos.nl/nosnieuwsbuitenland>|200|02/23/2026|valid|20|1220|
13|NOS Nieuws - Politiek|<https://feeds.nos.nl/nosnieuwspolitiek>|200|02/23/2026|valid|20|1220|
14|NOS Nieuws - Economie|<https://feeds.nos.nl/nosnieuwseconomie>|200|02/23/2026|valid|20|1220|
15|NOS Nieuws - Opmerkelijk|<https://feeds.nos.nl/nosnieuwsopmerkelijk>|200|02/23/2026|valid|20|1220|
16|NOS Nieuws - Koningshuis|<https://feeds.nos.nl/nosnieuwskoningshuis>|200|02/23/2026|valid|20|1220|
17|NOS Nieuws - Cultuur & media|<https://feeds.nos.nl/nosnieuwscultuurenmedia>|200|02/23/2026|valid|20|1220|
18|NOS Sport - Algemeen|<https://feeds.nos.nl/nossportalgemeen>|200|02/23/2026|valid|20|1220|
19|NOS Sport - Voetbal|<https://feeds.nos.nl/nosvoetbal>|200|02/23/2026|valid|20|1220|
20|NOS Sport - Wielrennen|<https://feeds.nos.nl/nossportwielrennen>|200|02/23/2026|valid|20|1220|
21|NOS Sport - Schaatsen|<https://feeds.nos.nl/nossportschaatsen>|200|02/23/2026|valid|20|1220|
22|NOS Sport - Tennis|<https://feeds.nos.nl/nossporttennis>|200|02/23/2026|valid|20|1220|
23|NOS Sport - Formule 1|<https://feeds.nos.nl/nossportformule1>|200|02/23/2026|valid|20|1220|
24|NOS op 3|<https://feeds.nos.nl/nosop3>|200|02/23/2026|valid|20|1220|
25|NOS Jeugdjournaal|<https://feeds.nos.nl/jeugdjournaal>|200|02/23/2026|valid|20|1220|
26|De Telegraaf|<https://www.telegraaf.nl/rss>|200|02/23/2026|valid|0|0|
27|de Volkskrant|<https://www.volkskrant.nl/voorpagina/rss.xml>|200|02/23/2026|valid|8|470|
28|Trouw|<https://www.trouw.nl/voorpagina/rss.xml>|200|02/23/2026|valid|20|1220|
29|Het Parool|<https://www.parool.nl/voorpagina/rss.xml>|200|02/23/2026|valid|9|477|
30|Het Financieele Dagblad (FD)|<https://fd.nl/?rss>|200|02/23/2026|valid|40|1209|
31|Tweakers (Mixed)|<https://tweakers.net/feeds/mixed.xml>|200|02/23/2026|valid|40|2440|
32|BNR Nieuwsradio (Economie)|<https://www.bnr.nl/rss/economie>|Recovered via sitemap|02/23/2026|valid|0|0|
33|Telegraaf (Financieel)|<https://www.telegraaf.nl/rss/financieel>|403 (HTTP_403)|02/23/2026|invalid|0|0|
34|RTL Z (Business)|<https://www.rtlnieuws.nl/economie/rss.xml>|Recovered via sitemap|02/23/2026|valid|0|0|
35|Nu.nl|<https://www.nu.nl/rss/Algemeen>|200|02/23/2026|valid|30|60|
36|Tweakers|<https://tweakers.net/feeds/nieuws.xml>|200|02/23/2026|valid|0|0|

### Switzerland (CH)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Le Temps Economy|<https://www.letemps.ch/economie.rss>|200|02/23/2026|valid|21|1323|
2|NZZ|<https://www.nzz.ch/reisen.rss>|200|02/23/2026|valid|27|1728|
3|NDR|<https://www.ndr.ch/rss/>|200|02/23/2026|valid|10|630|
4|SRF News (Latest)|<https://www.srf.ch/news/bnf/rss/19032223>|200|02/23/2026|valid|60|3780|
5|SRF News (Switzerland)|<https://www.srf.ch/news/bnf/rss/1890>|200|02/23/2026|valid|60|3780|
6|SRF News (International)|<https://www.srf.ch/news/bnf/rss/1922>|200|02/23/2026|valid|60|3780|
7|SRF News (Economy)|<https://www.srf.ch/news/bnf/rss/1926>|200|02/23/2026|valid|60|3780|
8|SRF Sport (Football)|<https://www.srf.ch/sport/bnf/rss/2562>|200|02/23/2026|valid|61|3843|
9|SRF Sport (Ice Hockey)|<https://www.srf.ch/sport/bnf/rss/3418>|200|02/23/2026|valid|32|2016|
10|SRF Sport (Tennis)|<https://www.srf.ch/sport/bnf/rss/2814>|200|02/23/2026|valid|62|3906|
11|SRF Sport (Alpine Skiing)|<https://www.srf.ch/sport/bnf/rss/787950>|200|02/23/2026|valid|30|1890|
12|SRF Wissen (Health)|<https://www.srf.ch/bnf/rss/19919909>|200|02/23/2026|valid|120|7560|
13|SRF Wissen (Tech)|<https://www.srf.ch/bnf/rss/19920122>|200|02/23/2026|valid|86|5418|
14|Blick (Schweiz)|<https://www.blick.ch/schweiz/rss.xml>|200|02/23/2026|valid|0|2297|
15|Blick (Ausland)|<https://www.blick.ch/ausland/rss.xml>|200|02/23/2026|valid|0|2139|
16|Blick (Wirtschaft)|<https://www.blick.ch/wirtschaft/rss.xml>|200|02/23/2026|valid|0|1337|
17|Blick (Politik)|<https://www.blick.ch/politik/rss.xml>|200|02/23/2026|valid|0|1120|
18|Blick (Sport)|<https://www.blick.ch/sport/rss.xml>|200|02/23/2026|valid|0|2750|
19|Blick Sport (Fussball)|<https://www.blick.ch/sport/fussball/rss.xml>|200|02/23/2026|valid|0|2172|
20|Blick Sport (Eishockey)|<https://www.blick.ch/sport/eishockey/rss.xml>|200|02/23/2026|valid|0|646|
21|Blick Sport (Ski)|<https://www.blick.ch/sport/ski/rss.xml>|200|02/23/2026|valid|0|457|
22|Blick Sport (Tennis)|<https://www.blick.ch/sport/tennis/rss.xml>|200|02/23/2026|valid|0|38|
23|Blick (Digital)|<https://www.blick.ch/digital/rss.xml>|200|02/23/2026|valid|0|56|
24|Le News (EN)|<https://lenews.ch/feed>|200|02/23/2026|valid|10|630|
25|The Local Switzerland (EN)|<https://feeds.thelocal.com/rss/ch>|200|02/23/2026|valid|20|1260|
26|NZZ (Latest)|<https://www.nzz.ch/recent.rss>|200|02/23/2026|valid|20|1210|
27|Swissinfo (Business - EN)|<https://www.swissinfo.ch/eng/business/feed>|Recovered via sitemap|02/23/2026|valid|0|0|
28|Finews.ch (Swiss Finance)|<https://www.finews.ch/news/finanzplatz?format=feed&type=rss>|200|02/23/2026|valid|15|30|
29|20 Minuten (Wirtschaft)|<https://www.20min.ch/rss/wirtschaft>|Recovered via sitemap|02/23/2026|valid|0|0|
30|Le Temps|<https://www.letemps.ch/rss>|200 (HTML_RETURNED)|02/23/2026|invalid|0|0|
31|Finanz und Wirtschaft|<https://www.fuw.ch/feed>|Recovered via sitemap|02/23/2026|valid|0|0|

### Turkey (TR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Hürriyet|<https://www.hurriyet.com.tr/rss/anasayfa>|200|02/23/2026|valid|0|0|
2|Sabah|<https://www.sabah.com.tr/rss/sondakika.xml>|200|02/23/2026|valid|50|2549|
3|Haberturk|<https://www.haberturk.com/rss>|200|02/23/2026|valid|100|6400|
4|Cumhuriyet|<https://www.cumhuriyet.com.tr/Rss/>|200|02/23/2026|valid|100|6400|
5|Aksam|<https://www.aksam.com.tr/rss>|200|02/23/2026|valid|20|1280|
6|Takvim|<https://www.takvim.com.tr/rss/feed>|200|02/23/2026|valid|0|0|
7|Cumhuriyet|<https://www.cumhuriyet.com.tr/RSS>|200|02/23/2026|valid|100|6400|
8|HuffPost Turkey|<https://www.hurriyetdailynews.com/rss>|200|02/23/2026|valid|0|0|
9|Haber Turk|<https://www.haberturk.com/rss/>|200|02/23/2026|valid|100|6400|
10|Hürriyet (Anasayfa)|<http://www.hurriyet.com.tr/rss/anasayfa>|200|02/23/2026|valid|0|0|
11|Hürriyet (Gündem)|<http://www.hurriyet.com.tr/rss/gundem>|200|02/23/2026|valid|0|0|
12|Hürriyet (Ekonomi)|<http://www.hurriyet.com.tr/rss/ekonomi>|200|02/23/2026|valid|0|0|
13|Hürriyet (Magazin)|<http://www.hurriyet.com.tr/rss/magazin>|200|02/23/2026|valid|0|0|
14|Hürriyet (Spor)|<http://www.hurriyet.com.tr/rss/spor>|200|02/23/2026|valid|0|0|
15|Hürriyet (Dünya)|<http://www.hurriyet.com.tr/rss/dunya>|200|02/23/2026|valid|0|0|
16|Hürriyet (Teknoloji)|<http://www.hurriyet.com.tr/rss/teknoloji>|200|02/23/2026|valid|0|0|
17|Hürriyet (Sağlık)|<http://www.hurriyet.com.tr/rss/saglik>|200 (HTML_RETURNED)|02/23/2026|invalid|0|0|
18|Hürriyet (Astroloji)|<http://www.hurriyet.com.tr/rss/astroloji>|200|02/23/2026|valid|0|0|
19|Sabah (Anasayfa)|<https://www.sabah.com.tr/rss/anasayfa.xml>|200|02/23/2026|valid|10|630|
20|Sabah (Ekonomi)|<https://www.sabah.com.tr/rss/ekonomi.xml>|200|02/23/2026|valid|10|630|
21|Sabah (Spor)|<https://www.sabah.com.tr/rss/spor.xml>|200|02/23/2026|valid|10|630|
22|Sabah (Gündem)|<https://www.sabah.com.tr/rss/gundem.xml>|200|02/23/2026|valid|10|630|
23|Sabah (Yaşam)|<https://www.sabah.com.tr/rss/yasam.xml>|200|02/23/2026|valid|10|630|
24|Sabah (Dünya)|<https://www.sabah.com.tr/rss/dunya.xml>|200|02/23/2026|valid|10|630|
25|Sabah (Teknoloji)|<https://www.sabah.com.tr/rss/teknoloji.xml>|200|02/23/2026|valid|0|0|
26|Sabah (Turizm)|<https://www.sabah.com.tr/rss/turizm.xml>|200|02/23/2026|valid|0|0|
27|Sabah (Otomobil)|<https://www.sabah.com.tr/rss/otomobil.xml>|200|02/23/2026|valid|0|0|
28|CNN Türk (All / News)|<https://www.cnnturk.com/feed/rss/all/news>|200|02/23/2026|valid|35|2205|
29|CNN Türk (Türkiye / News)|<https://www.cnnturk.com/feed/rss/turkiye/news>|200|02/23/2026|valid|35|2205|
30|CNN Türk (Dünya / News)|<https://www.cnnturk.com/feed/rss/dunya/news>|200|02/23/2026|valid|35|2205|
31|CNN Türk (Ekonomi / News)|<https://www.cnnturk.com/feed/rss/ekonomi/news>|200|02/23/2026|valid|35|2205|
32|CNN Türk (Bilim-Teknoloji / News)|<https://www.cnnturk.com/feed/rss/bilim-teknoloji/news>|200|02/23/2026|valid|0|0|
33|CNN Türk (Spor / News)|<https://www.cnnturk.com/feed/rss/spor/news>|200|02/23/2026|valid|35|2205|
34|CNN Türk (Sağlık / News)|<https://www.cnnturk.com/feed/rss/saglik/news>|200|02/23/2026|valid|35|2205|
35|TRT Haber (Son Dakika)|<http://www.trthaber.com/sondakika.rss>|200|02/23/2026|valid|50|3150|
36|Habertürk (Main)|<http://www.haberturk.com/rss>|200|02/23/2026|valid|100|6300|
37|Dünya (Main)|<https://www.dunya.com/rss?dunya>|200|02/23/2026|valid|25|1575|
38|BBC Türkçe|<https://feeds.bbci.co.uk/turkce/rss.xml>|200|02/23/2026|valid|20|1280|

### Saudi Arabia (SA)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Okaz|<https://www.okaz.com.sa/rss/news>|200|02/23/2026|valid|0|0|
2|Al Jazirah|<https://www.aljazeera.net/rss>|200|02/23/2026|valid|25|1600|
3|Al Madina|<https://www.al-madina.com/rssFeed/193>|200|02/23/2026|valid|50|3150|
4|Al Bilad Daily|<https://albiladdaily.com/feed>|200|02/23/2026|valid|10|620|
5|Makkah Newspaper|<https://makkahnewspaper.com/rssFeed/0>|200|02/23/2026|valid|50|3150|
6|Al Jazirah|<https://www.al-jazirah.com/rss/ln.xml>|200|02/23/2026|valid|10|774|
7|Al Arabiya (EN - Business)|<https://english.alarabiya.net/feed/business>|Recovered via sitemap|02/23/2026|valid|0|0|
8|Al Arabiya (EN - Middle East)|<https://english.alarabiya.net/feed/middle-east>|Recovered via sitemap|02/23/2026|valid|0|0|
9|Asharq Business (Bloomberg Arabic)|<https://asharqbusiness.com/feed>|403 (HTTP_403)|02/23/2026|invalid|0|0|
10|Gulf Business (Saudi Section)|<https://gulfbusiness.com/region/saudi-arabia/feed/>|200 (HTML_RETURNED)|02/23/2026|invalid|0|0|
11|Saudi Gazette (Business)|<https://saudigazette.com.sa/rss/3>|200|02/23/2026|valid|0|0|
12|Zawya (Middle East Business 1위 - EN)|<https://www.zawya.com/en/rss>|Recovered via sitemap|02/23/2026|valid|0|0|
13|Arab News|<https://www.arabnews.com/rss.xml>|200|02/23/2026|valid|0|0|
14|Al Eqtisadiah (Economy - Arabic)|<https://www.aleqt.com/feed>|Recovered via sitemap|02/23/2026|valid|0|0|
15|Saudi Press Agency (Arabic)|<https://www.spa.gov.sa/rss>|Recovered via sitemap|02/23/2026|valid|0|0|
16|Al Riyadh (Main - Arabic)|<https://www.alriyadh.com/rss>|ERR (TLS)|02/23/2026|invalid|0|0|
17|Al Arabiya (Business - Arabic)|<https://www.alarabiya.net/feed/business>|Recovered via sitemap|02/23/2026|valid|0|0|

### Taiwan (TW)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Liberty Times - Business|<https://news.ltn.com.tw/rss/business.xml>|200|02/23/2026|valid|40|2560|
2|TechNews Taiwan|<https://technews.tw/feed/>|200|02/23/2026|valid|40|2560|
3|CNA (Central News Agency)|<https://feeds.feedburner.com/cnaFirstNews>|200|02/23/2026|valid|6|384|
4|Formosa Reporter|<https://www.formosapost.com/feed/>|200|02/23/2026|valid|10|630|
5|CNA 政治|<https://feeds.feedburner.com/rsscna/politics>|200|02/23/2026|valid|20|1260|
6|CNA 國際|<https://feeds.feedburner.com/rsscna/intworld>|200|02/23/2026|valid|20|1260|
7|CNA 兩岸|<https://feeds.feedburner.com/rsscna/mainland>|200|02/23/2026|valid|20|1260|
8|CNA 產經證券|<https://feeds.feedburner.com/rsscna/finance>|200|02/23/2026|valid|20|1260|
9|CNA 科技|<https://feeds.feedburner.com/rsscna/technology>|200|02/23/2026|valid|20|1260|
10|CNA 生活|<https://feeds.feedburner.com/rsscna/lifehealth>|200|02/23/2026|valid|20|1260|
11|CNA 社會|<https://feeds.feedburner.com/rsscna/social>|200|02/23/2026|valid|20|1260|
12|CNA 地方|<https://feeds.feedburner.com/rsscna/local>|200|02/23/2026|valid|20|1260|
13|CNA 文化|<https://feeds.feedburner.com/rsscna/culture>|200|02/23/2026|valid|20|1260|
14|CNA 運動|<https://feeds.feedburner.com/rsscna/sport>|200|02/23/2026|valid|20|1260|
15|CNA 娛樂|<https://feeds.feedburner.com/rsscna/stars>|200|02/23/2026|valid|20|1260|
16|Liberty Times 即時|<https://news.ltn.com.tw/rss/all.xml>|200|02/23/2026|valid|40|2520|
17|Liberty Times 政治|<https://news.ltn.com.tw/rss/politics.xml>|200|02/23/2026|valid|40|2480|
18|Liberty Times 社會|<https://news.ltn.com.tw/rss/society.xml>|200|02/23/2026|valid|40|2480|
19|Liberty Times 生活|<https://news.ltn.com.tw/rss/life.xml>|200|02/23/2026|valid|40|2520|
20|Liberty Times 評論|<https://news.ltn.com.tw/rss/opinion.xml>|200|02/23/2026|valid|40|2520|
21|Liberty Times 國際|<https://news.ltn.com.tw/rss/world.xml>|200|02/23/2026|valid|40|2520|
22|Liberty Times 體育|<https://news.ltn.com.tw/rss/sports.xml>|200|02/23/2026|valid|40|2520|
23|Liberty Times 娛樂|<https://news.ltn.com.tw/rss/entertainment.xml>|200|02/23/2026|valid|40|2480|
24|Liberty Times 藝文|<https://news.ltn.com.tw/rss/art.xml>|200|02/23/2026|valid|40|2480|
25|Liberty Times 軍武|<https://news.ltn.com.tw/rss/def.xml>|200|02/23/2026|valid|40|2480|
26|Liberty Times 地方|<https://news.ltn.com.tw/rss/local.xml>|200|02/23/2026|valid|40|2480|
27|Liberty Times 蒐奇|<https://news.ltn.com.tw/rss/novelty.xml>|200|02/23/2026|valid|40|2520|
28|Taipei Times (EN)|<https://www.taipeitimes.com/xml/index.rss>|200|02/23/2026|valid|0|0|
29|The Reporter|<https://www.twreporter.org/a/rss2.xml>|200|02/23/2026|valid|10|630|
30|Newtalk 全部|<https://newtalk.tw/rss/all/>|200|02/23/2026|valid|100|6300|
31|Newtalk 政治|<https://newtalk.tw/rss/category/2>|200|02/23/2026|valid|100|6300|
32|Youth Daily News 軍聞|<https://www.ydn.com.tw/tw/Home/RSS.aspx?TID=2>|200|02/23/2026|valid|18|1099|

### Poland (PL)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Onet|<https://wiadomosci.onet.pl/rss>|200|02/23/2026|valid|20|1280|
2|TVN24|<https://tvn24.pl/tvnmeteo.xml>|200|02/23/2026|valid|32|2016|
3|Fakt|<https://www.fakt.pl/rss/>|200|02/23/2026|valid|20|2965|
4|Wprost|<https://www.wprost.pl/rss/>|200|02/23/2026|valid|62|4347|
5|RMF24 (Main)|<https://www.rmf24.pl/feed>|200|02/23/2026|valid|15|945|
6|RMF24 Fakty|<https://www.rmf24.pl/fakty/feed>|200|02/23/2026|valid|50|3150|
7|RMF24 Polska|<https://www.rmf24.pl/fakty/polska/feed>|200|02/23/2026|valid|50|3150|
8|RMF24 Polityka|<https://www.rmf24.pl/fakty/polityka/feed>|200|02/23/2026|valid|50|3150|
9|RMF24 Świat|<https://www.rmf24.pl/fakty/swiat/feed>|200|02/23/2026|valid|50|3150|
10|RMF24 Ekonomia|<https://www.rmf24.pl/ekonomia/feed>|200|02/23/2026|valid|50|3150|
11|RMF24 Nauka|<https://www.rmf24.pl/nauka/feed>|200|02/23/2026|valid|50|3150|
12|RMF24 Kultura|<https://www.rmf24.pl/kultura/feed>|200|02/23/2026|valid|50|3150|
13|RMF24 Sport|<https://www.rmf24.pl/sport/feed>|200|02/23/2026|valid|50|3150|
14|RMF24 Ciekawostki|<https://www.rmf24.pl/rozrywka/ciekawostki/feed>|200|02/23/2026|valid|50|3150|
15|RMF24 Komentarze|<https://www.rmf24.pl/tylko-w-rmf24/komentarze/feed>|200|02/23/2026|valid|50|3150|
16|RMF24 Podsumowanie dnia|<https://www.rmf24.pl/fakty/podsumowanie-dnia/feed>|200|02/23/2026|valid|50|3150|
17|PolsatNews Wszystkie|<https://www.polsatnews.pl/rss/wszystkie.xml>|200|02/23/2026|valid|50|3150|
18|PolsatNews Polska|<https://www.polsatnews.pl/rss/polska.xml>|200|02/23/2026|valid|50|3150|
19|PolsatNews Świat|<https://www.polsatnews.pl/rss/swiat.xml>|200|02/23/2026|valid|50|3150|
20|PolsatNews Wideo|<https://www.polsatnews.pl/rss/wideo.xml>|200|02/23/2026|valid|50|3150|
21|PolsatNews Biznes|<https://www.polsatnews.pl/rss/biznes.xml>|200|02/23/2026|valid|50|3150|
22|PolsatNews Technologie|<https://www.polsatnews.pl/rss/technologie.xml>|200|02/23/2026|valid|50|3150|
23|PolsatNews Moto|<https://www.polsatnews.pl/rss/moto.xml>|200|02/23/2026|valid|50|3150|
24|PolsatNews Kultura|<https://www.polsatnews.pl/rss/kultura.xml>|200|02/23/2026|valid|50|3150|
25|PolsatNews Sport|<https://www.polsatnews.pl/rss/sport.xml>|200|02/23/2026|valid|50|3150|
26|PolsatNews Czysta Polska|<https://www.polsatnews.pl/rss/czysta-polska.xml>|200|02/23/2026|valid|50|3150|
27|Nauka w Polsce (All)|<https://naukawpolsce.pl/all/rss.xml>|200|02/23/2026|valid|10|630|
28|Nauka w Polsce (Science categories)|<https://naukawpolsce.pl/naukowy/rss.xml>|200|02/23/2026|valid|10|630|
29|Nauka w Polsce (Technologia)|<https://naukawpolsce.pl/technologia/rss.xml>|200|02/23/2026|valid|10|630|
30|Nauka w Polsce (Blog)|<https://naukawpolsce.pl/blog/rss.xml>|200|02/23/2026|valid|10|630|
31|PAP MediaRoom (All)|<https://pap-mediaroom.pl/rss.xml>|200|02/23/2026|valid|0|162|
32|PAP MediaRoom (Biznes i finanse)|<https://pap-mediaroom.pl/kategoria/biznes-i-finanse/rss.xml>|200|02/23/2026|valid|10|230|
33|PAP MediaRoom (Nauka i technologie)|<https://pap-mediaroom.pl/kategoria/nauka-i-technologie/rss.xml>|200|02/23/2026|valid|10|230|
34|PAP MediaRoom (Kalendarium)|<https://pap-mediaroom.pl/kalendarium/rss.xml>|200|02/23/2026|valid|10|630|

### Sweden (SE)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Dagens Nyheter|<https://www.dn.se/nyheter/rss/>|200|02/23/2026|valid|120|7504|
2|Dagens Industri|<https://www.di.se/rss/>|200|02/23/2026|valid|20|1280|
3|SVT Nyheter|<https://www.svt.se/nyheter/rss.xml>|200|02/23/2026|valid|20|1280|
4|Göteborgs-Posten|<https://www.gp.se/rss>|200|02/23/2026|valid|46|4149|
5|Sveriges Television|<https://www.svt.se/nyheter/ekonomi/rss.xml>|200|02/23/2026|valid|20|1280|
6|Svt|<https://www.svt.se/nyheter/rss.xml?sectionId=2>|200|02/23/2026|valid|20|1280|
7|Dagens Nyheter Sport|<https://www.dn.se/sport/rss>|200|02/23/2026|valid|100|6400|
8|Dagens Nyheter Business|<https://www.dn.se/ekonomi/rss>|200|02/23/2026|valid|104|6624|
9|Norran|<https://www.norran.se/rss>|200|02/23/2026|valid|30|1920|
10|Aftonbladet - Nyheter (All)|<https://rss.aftonbladet.se/rss2/small/pages/sections/senastenytt/>|200|02/23/2026|valid|34|2074|
11|Aftonbladet - Sportbladet|<https://rss.aftonbladet.se/rss2/small/pages/sections/senastenytt/sport/>|200|02/23/2026|valid|35|2135|
12|Aftonbladet - Sportbladet Fotboll|<https://rss.aftonbladet.se/rss2/small/pages/sections/sportbladet/fotboll/>|200|02/23/2026|valid|35|2135|
13|Aftonbladet - Sportbladet Hockey|<https://rss.aftonbladet.se/rss2/small/pages/sections/sportbladet/hockey/>|200|02/23/2026|valid|35|2135|
14|Aftonbladet - Nöjesbladet|<https://rss.aftonbladet.se/rss2/small/pages/sections/nojesbladet/>|200|02/23/2026|valid|47|2743|
15|Aftonbladet - Kultur|<https://rss.aftonbladet.se/rss2/small/pages/sections/kultur/>|200|02/23/2026|valid|35|2135|
16|Expressen - Nyheter|<https://feeds.expressen.se/nyheter/>|200|02/23/2026|valid|20|1220|
17|GT - Nyheter|<https://feeds.expressen.se/gt/>|200|02/23/2026|valid|20|1220|
18|Svenska Dagbladet - Frontpage|<https://www.svd.se/?service=rss>|200|02/23/2026|valid|30|1830|
19|The Local Sweden (EN)|<https://feeds.thelocal.com/rss/se>|200|02/23/2026|valid|20|1220|
20|Sveriges Radio - Ekot nyhetssändning (pod)|<https://api.sr.se/api/rss/pod/3795>|200|02/23/2026|valid|120|7320|
21|Sveriges Radio - P3 Nyheter på en minut (pod)|<https://api.sr.se/api/rss/pod/22376>|200|02/23/2026|valid|120|7320|
22|Sveriges Radio - Radio Sweden på lätt svenska (program)|<https://api.sr.se/api/rss/program/4916?format=1>|200|02/23/2026|valid|20|1220|
23|Radio Sweden - Sweden Today (podcast xml)|<http://sverigesradio.se/Podradio/xml/SRI_en_sweToday.xml>|Recovered via sitemap|02/23/2026|valid|0|0|
24|Proletären|<https://proletaren.se/rss.xml>|200|02/23/2026|valid|10|686|
25|SVT Lokal - Sydnytt|<http://svt.se/nyheter/regionalt/sydnytt/rss.xml>|200|02/23/2026|valid|20|1220|
26|SVT Lokal - Blekingenytt|<http://svt.se/nyheter/regionalt/blekingenytt/rss.xml>|200|02/23/2026|valid|20|1220|
27|SVT Lokal - Mittnytt|<http://svt.se/nyheter/regionalt/mittnytt/rss.xml>|200|02/23/2026|valid|20|1220|
28|SVT Lokal - Jämtlandsnytt|<http://svt.se/nyheter/regionalt/jamtlandsnytt/rss.xml>|200|02/23/2026|valid|20|1220|
29|Sydsvenskan (fallback)|<https://www.sydsvenskan.se/feeds/feed.xml>|200|02/23/2026|valid|43|2678|
30|Nerikes Allehanda (fallback)|<https://www.na.se/feeds/feed.xml>|200|02/23/2026|valid|49|3018|

### Belgium (BE)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|De Morgen|<https://www.demorgen.be/rss.xml>|200|02/23/2026|valid|20|1280|
2|La Libre|<https://www.lalibre.be/arc/outboundfeeds/rss/section/belgique/?outputType=xml>|200|02/23/2026|valid|100|6400|
3|Knack|<https://www.knack.be/feed/>|200|02/23/2026|valid|50|3200|
4|VRT News|<https://www.vrt.be/vrtnws/nl.rss.articles.xml>|200|02/23/2026|valid|50|3000|
5|La Dernière Heure|<https://www.dhnet.be/rss.xml>|200|02/23/2026|valid|100|6400|
6|Le Vif|<https://www.levif.be/feed/>|200|02/23/2026|valid|50|3200|
7|RTBF|<https://rss.rtbf.be/article/rss/highlight_rtbf_info.xml?source=internal>|200|02/23/2026|valid|20|1280|
8|Het Nieuwsblad|<https://www.nieuwsblad.be/rss/>|200|02/23/2026|valid|50|3200|
9|La Libre Belgique|<https://www.lalibre.be/rss/>|200|02/23/2026|valid|100|6400|
10|La Libre|<https://www.lalibre.be/rss>|200|02/23/2026|valid|100|6400|
11|The Bulletin (EN)|<https://www.thebulletin.be/rss.xml>|200|02/23/2026|valid|10|610|
12|HLN (Het Laatste Nieuws)|<https://www.hln.be/home/rss.xml>|200|02/23/2026|valid|30|1830|
13|Brussels Morning|<https://brusselsmorning.com/feed>|200|02/23/2026|valid|50|2950|
14|L'Echo|<https://www.lecho.be/rss/top_stories.xml>|200|02/23/2026|valid|10|610|
15|De Standaard (example section)|<https://www.standaard.be/rss/section/1f2838d4-99ea-49f0-9102-138784c7ea7c>|403 (HTTP_403)|02/23/2026|invalid|0|0|
16|Het Nieuwsblad (example section)|<https://www.nieuwsblad.be/rss/section/55178e67-15a8-4ddd-a3d8-bfe5708f8932>|Recovered via sitemap|02/23/2026|valid|0|0|
17|Le Soir (main)|<https://www.lesoir.be/rss2/9/cible_principale>|403 (HTTP_403)|02/23/2026|invalid|0|310|
18|Brussels Times|<https://www.brusselstimes.com/rss-feed>|Recovered via sitemap|02/23/2026|valid|0|0|
19|City of Brussels (official)|<https://www.brussels.be/rss.xml>|200|02/23/2026|valid|10|610|

### Thailand (TH)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|The Thaiger|<https://thethaiger.com/feed>|200|02/23/2026|valid|10|640|
2|Khaosod English|<https://www.khaosodenglish.com/rss>|200|02/23/2026|valid|0|110|
3|Matichon|<https://www.matichon.co.th/rss>|200|02/23/2026|valid|0|2750|
4|Prachachat|<https://prachachat.net/feed/>|200|02/23/2026|valid|0|660|
5|Daily News|<https://www.dailynews.co.th/rss>|200|02/23/2026|valid|0|0|
6|Prachatai English (Feedburner)|<http://feeds.feedburner.com/prachataienglish>|200|02/23/2026|valid|10|630|
7|Thai PBS (news feed endpoint)|<https://news.thaipbs.or.th/rss/news>|200|02/23/2026|valid|20|1260|
8|Thairath (News)|<http://www.thairath.co.th/rss/news.xml>|Recovered via sitemap|02/23/2026|valid|0|303|
9|Thairath (Sport)|<http://www.thairath.co.th/rss/sport.xml>|Recovered via sitemap|02/23/2026|valid|0|303|
10|Sanook - Hot News|<http://rssfeeds.sanook.com/rss/feeds/sanook/hot.news.xml>|200|02/23/2026|valid|20|1260|
11|Sanook - Daily News|<http://rssfeeds.sanook.com/rss/feeds/sanook/news.index.xml>|200|02/23/2026|valid|20|1260|
12|Sanook - Politics|<http://rssfeeds.sanook.com/rss/feeds/sanook/news.politic.xml>|200|02/23/2026|valid|20|1260|
13|Sanook - Crime|<http://rssfeeds.sanook.com/rss/feeds/sanook/news.crime.xml>|200|02/23/2026|valid|20|1260|
14|Sanook - World|<http://rssfeeds.sanook.com/rss/feeds/sanook/news.world.xml>|200|02/23/2026|valid|20|1260|
15|Sanook - Economy|<http://rssfeeds.sanook.com/rss/feeds/sanook/news.economic.xml>|200|02/23/2026|valid|10|630|
16|Sanook - Tech (News)|<http://rssfeeds.sanook.com/rss/feeds/sanook/hitech.news.xml>|200|02/23/2026|valid|20|1260|
17|Sanook - Tech (Computer)|<http://rssfeeds.sanook.com/rss/feeds/sanook/hitech.computer.index.xml>|200|02/23/2026|valid|20|1260|
18|Sanook - Tech (Mobile)|<http://rssfeeds.sanook.com/rss/feeds/sanook/hitech.mobile.index.xml>|200|02/23/2026|valid|20|1260|
19|Sanook - Travel|<http://rssfeeds.sanook.com/rss/feeds/sanook/travel.index.xml>|200|02/23/2026|valid|10|630|
20|Sanook - Movies|<http://rssfeeds.sanook.com/rss/feeds/sanook/movie.news.xml>|200|02/23/2026|valid|20|1260|
21|PressDisplay - Bangkok Post|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=1264>|200|02/23/2026|valid|6|57|
22|PressDisplay - Daily News Thailand|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=4863>|200|02/23/2026|valid|0|0|
23|PressDisplay - Krungthep Turakij|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=5261&type=full>|200|02/23/2026|valid|0|0|
24|PressDisplay - The Phuket News|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=eff9&type=full>|200|02/23/2026|valid|33|759|
25|PressDisplay - Novosti Phuketa|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=9wv3&type=full>|200|02/23/2026|valid|26|598|
26|PressDisplay - Window On Phuket|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=9wv4&type=full>|200|02/23/2026|valid|0|0|
27|PressDisplay - Where to Eat in Phuket|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=9wv5&type=full>|200|02/23/2026|valid|0|0|
28|PressDisplay - Prestige (Thailand)|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=9vw7&type=full>|200|02/23/2026|valid|61|1403|
29|PressDisplay - Hello! (Thailand)|<https://www.pressdisplay.com/pressdisplay/services/rss.ashx?cid=9vw6&type=full>|200|02/23/2026|valid|47|1081|
30|Khaosod English - Food (category)|<http://www.khaosodenglish.com/category/life/food/feed>|200|02/23/2026|valid|0|110|

### Iran (IR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|IRNA|<https://www.irna.ir/rss>|200|02/23/2026|valid|30|1650|
2|Mehr News|<https://www.mehrnews.com/rss>|ERR (TIMEOUT)|02/23/2026|invalid|30|1770|
3|ILNA|<https://www.ilna.news/rss>|200|02/23/2026|valid|30|1860|
4|Khabar Online|<https://www.khabaronline.ir/rss>|200|02/23/2026|valid|30|1890|
5|Iran International|<https://www.iranintl.com/feed>|200|02/23/2026|valid|100|6400|
6|ILNA|<https://www.ilna.ir/rss>|200|02/23/2026|valid|30|1890|
7|Tejarat News|<https://www.tejaratnews.com/rss>|200|02/23/2026|valid|100|6200|
8|Tehran Times - Latest|<https://www.tehrantimes.com/rss>|ERR (HTTP_REDIRECT_LOOP)|02/23/2026|invalid|0|0|
9|Tehran Times - Homepage|<https://www.tehrantimes.com/rss-homepage>|ERR (HTTP_REDIRECT_LOOP)|02/23/2026|invalid|0|0|
10|Tehran Times - Breaking|<https://www.tehrantimes.com/rss/pl/617>|ERR (HTTP_REDIRECT_LOOP)|02/23/2026|invalid|0|0|
11|Tehran Times - Society|<https://www.tehrantimes.com/rss/tp/696>|ERR (HTTP_REDIRECT_LOOP)|02/23/2026|invalid|0|0|
12|Tehran Times - Economy|<https://www.tehrantimes.com/rss/tp/697>|ERR (HTTP_REDIRECT_LOOP)|02/23/2026|invalid|0|0|
13|Tehran Times - Politics|<https://www.tehrantimes.com/rss/tp/698>|ERR (HTTP_REDIRECT_LOOP)|02/23/2026|invalid|0|0|
14|Tehran Times - Sports|<https://www.tehrantimes.com/rss/tp/699>|ERR (HTTP_REDIRECT_LOOP)|02/23/2026|invalid|0|0|
15|Tehran Times - Culture|<https://www.tehrantimes.com/rss/tp/700>|ERR (HTTP_REDIRECT_LOOP)|02/23/2026|invalid|0|0|
16|Tehran Times - International|<https://www.tehrantimes.com/rss/tp/702>|ERR (HTTP_REDIRECT_LOOP)|02/23/2026|invalid|0|0|
17|Tehran Times - Multimedia|<https://www.tehrantimes.com/rss/tp/717>|ERR (HTTP_REDIRECT_LOOP)|02/23/2026|invalid|0|0|
18|Tehran Times - Tourism|<https://www.tehrantimes.com/rss/tp/807>|ERR (HTTP_REDIRECT_LOOP)|02/23/2026|invalid|0|0|
19|MehrNews (EN) - Latest|<https://en.mehrnews.com/rss/pl/118>|200|02/23/2026|valid|30|1740|
20|MehrNews (EN) - Iran|<https://en.mehrnews.com/rss/tp/575>|200|02/23/2026|valid|30|1740|
21|MehrNews (EN) - Iran > Iran|<https://en.mehrnews.com/rss/tp/905>|200|02/23/2026|valid|0|1710|
22|MehrNews (EN) - Ethnic Groups|<https://en.mehrnews.com/rss/tp/897>|200|02/23/2026|valid|0|0|
23|MehrNews (EN) - Nature|<https://en.mehrnews.com/rss/tp/898>|200|02/23/2026|valid|5|278|
24|MehrNews (EN) - Historical Sites|<https://en.mehrnews.com/rss/tp/899>|200|02/23/2026|valid|0|0|
25|MehrNews (EN) - Souvenirs|<https://en.mehrnews.com/rss/tp/900>|200|02/23/2026|valid|0|0|
26|MehrNews (EN) - Persian Cuisine|<https://en.mehrnews.com/rss/tp/901>|200|02/23/2026|valid|2|77|
27|ISNA (EN) - Social|<https://en.isna.ir/rss/tp/8>|200 (HTML_RETURNED)|02/23/2026|invalid|0|0|
28|ISNA (EN) - Economy|<https://en.isna.ir/rss/tp/33>|200 (HTML_RETURNED)|02/23/2026|invalid|0|0|
29|ISNA (EN) - Politics|<https://en.isna.ir/rss/tp/13>|200 (HTML_RETURNED)|02/23/2026|invalid|0|0|
30|ISNA (EN) - Culture & Art|<https://en.isna.ir/rss/tp/19>|200 (HTML_RETURNED)|02/23/2026|invalid|0|0|
31|ISNA (EN) - Sports|<https://en.isna.ir/rss/tp/23>|200 (HTML_RETURNED)|02/23/2026|invalid|0|0|
32|ISNA (EN) - Photos|<https://en.isna.ir/rss/tp/27>|200 (HTML_RETURNED)|02/23/2026|invalid|0|0|
33|Tasnim (EN) - Top Stories|<https://www.tasnimnews.ir/en/rss/feed/0/0/8/1/TopStories>|200|02/23/2026|valid|25|1575|
34|Tasnim (EN) - All Stories|<https://www.tasnimnews.ir/en/rss/feed/0/0/0/0/AllStories>|200|02/23/2026|valid|0|594|
35|Tasnim (EN) - Politics|<https://www.tasnimnews.ir/en/rss/feeds/1192/0/0/0>|200|02/23/2026|valid|0|188|
36|Tasnim (EN) - Economy|<https://www.tasnimnews.ir/en/rss/feeds/1193/0/0/0>|200|02/23/2026|valid|0|3|
37|Tasnim (EN) - World|<https://www.tasnimnews.ir/en/rss/feeds/1194/0/0/0>|200|02/23/2026|valid|0|102|

### Argentina (AR)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Ámbito - Portada|<https://www.ambito.com/rss/pages/home.xml>|200|02/23/2026|valid|20|1340|
2|Ámbito - Últimas noticias|<https://www.ambito.com/rss/pages/ultimas-noticias.xml>|200|02/23/2026|valid|15|983|
3|Ámbito - Economía|<https://www.ambito.com/rss/pages/economia.xml>|200|02/23/2026|valid|20|1658|
4|Ámbito - Finanzas|<https://www.ambito.com/rss/pages/finanzas.xml>|200|02/23/2026|valid|20|2208|
5|Ámbito - Negocios|<https://www.ambito.com/rss/pages/negocios.xml>|200|02/23/2026|valid|20|1340|
6|Ámbito - Política|<https://www.ambito.com/rss/pages/politica.xml>|200|02/23/2026|valid|20|1590|
7|Ámbito - Nacional|<https://www.ambito.com/rss/pages/nacional.xml>|200|02/23/2026|valid|20|1340|
8|Ámbito - Mundo|<https://www.ambito.com/rss/pages/mundo.xml>|200|02/23/2026|valid|100|4129|
9|Ámbito - Lifestyle|<https://www.ambito.com/rss/pages/lifestyle.xml>|200|02/23/2026|valid|20|1420|
10|Ámbito - Deportes|<https://www.ambito.com/rss/pages/deportes.xml>|200|02/23/2026|valid|20|1820|
11|Ámbito - Tecnología|<https://www.ambito.com/rss/pages/tecnologia.xml>|200|02/23/2026|valid|20|1340|
12|Ámbito - Autos|<https://www.ambito.com/rss/pages/autos.xml>|200|02/23/2026|valid|20|1340|
13|Ámbito - Edición impresa|<https://www.ambito.com/rss/pages/edicion-impresa.xml>|200|02/23/2026|valid|20|1340|
14|Página/12 - Portada|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/portada>|200|02/23/2026|valid|6|402|
15|Página/12 - Edición impresa|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/edicion-impresa>|200|02/23/2026|valid|9|3148|
16|Página/12 - El País|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/el-pais/notas>|200|02/23/2026|valid|25|1675|
17|Página/12 - Economía|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/economia/notas>|200|02/23/2026|valid|25|1675|
18|Página/12 - Sociedad|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/sociedad/notas>|200|02/23/2026|valid|25|1675|
19|Página/12 - El Mundo|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/el-mundo/notas>|200|02/23/2026|valid|25|1675|
20|Página/12 - Deportes|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/deportes/notas>|200|02/23/2026|valid|25|1675|
21|Página/12 - Ciencia|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/ciencia/notas>|200|02/23/2026|valid|25|1675|
22|Página/12 - Psicología|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/psicologia/notas>|200|02/23/2026|valid|25|1675|
23|Página/12 - Cartas de Lectores|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/secciones/cartas-de-lectores/notas>|200|02/23/2026|valid|0|0|
24|Página/12 - Cash|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/suplementos/cash/notas>|200|02/23/2026|valid|25|1675|
25|Página/12 - Las 12|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/suplementos/las12/notas>|200|02/23/2026|valid|25|1675|
26|Página/12 - Radar|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/suplementos/radar/notas>|200|02/23/2026|valid|25|1675|
27|Página/12 - Turismo|<https://www.pagina12.com.ar/arc/outboundfeeds/rss/suplementos/turismo/notas>|200|02/23/2026|valid|0|0|
28|LA NACION - General|<https://www.lanacion.com.ar/arc/outboundfeeds/rss/?outputType=xml>|200|02/23/2026|valid|100|6693|
29|El Cronista - Noticias|<https://www.cronista.com/files/rss/news.xml>|200|02/23/2026|valid|59|4211|
30|Clarín - Ultimo Momento (속보)|<https://www.clarin.com/rss/lo-ultimo/>|200|02/23/2026|valid|10|330|
31|Clarín - Economía|<https://www.clarin.com/rss/economia/>|200|02/23/2026|valid|10|330|
32|Clarín - Política|<https://www.clarin.com/rss/politica/>|200|02/23/2026|valid|10|330|
33|La Nación - Economía|<https://www.lanacion.com.ar/arc/outboundfeeds/rss/?outputType=xml&rotation=economia>|200|02/23/2026|valid|100|3300|
34|La Nación - Política|<https://www.lanacion.com.ar/arc/outboundfeeds/rss/?outputType=xml&rotation=politica>|200|02/23/2026|valid|100|3300|
35|Infobae - Argentina|<https://www.infobae.com/feeds/rss/argentina/>|Recovered via sitemap|02/23/2026|valid|0|0|
36|Infobae - Economía|<https://www.infobae.com/feeds/rss/economia/>|Recovered via sitemap|02/23/2026|valid|0|0|
37|El Cronista - Finanzas|<https://www.cronista.com/files/rss/finanzas_markets.xml>|Recovered via sitemap|02/23/2026|valid|0|0|
38|El Cronista - Economía|<https://www.cronista.com/files/rss/economia_politica.xml>|Recovered via sitemap|02/23/2026|valid|0|0|
39|Rosario3 - Home|<https://www.rosario3.com/rss/feed.xml>|200|02/23/2026|valid|50|300|

### Chile (CL)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Diario Financiero|<https://www.df.cl/noticias/site/list/port/rss.xml>|200|02/23/2026|valid|50|3350|
2|The Clinic|<https://www.theclinic.cl/feed/>|200|02/23/2026|valid|10|660|
3|El Rancagüino|<https://www.elrancaguino.cl/feed/>|200|02/23/2026|valid|10|650|
4|Cambio21|<https://cambio21.cl/rss>|200|02/23/2026|valid|100|6700|
5|La Discusión|<https://ladiscusion.cl/feed/>|200|02/23/2026|valid|10|670|
6|La Nación (Chile)|<https://www.lanacion.cl/feed>|200|02/23/2026|valid|10|670|
7|El Siglo|<https://elsiglo.cl/feed>|200|02/23/2026|valid|10|670|
8|The Santiago Times|<https://santiagotimes.cl/feed>|200|02/23/2026|valid|10|650|
9|Infoweek|<https://infoweek.biz/feed>|200|02/23/2026|valid|0|0|
10|El Desconcierto|<https://www.eldesconcierto.cl/feed/>|200|02/23/2026|valid|100|4500|
11|La Prensa Austral|<https://laprensaaustral.cl/feed/>|200|02/23/2026|valid|10|670|
12|CIPER Chile|<https://www.ciperchile.cl/feed/>|200|02/23/2026|valid|16|1072|
13|Radio Universidad de Chile|<https://radio.uchile.cl/feed/>|200|02/23/2026|valid|30|1950|
14|La Tercera - Home|<https://www.latercera.com/arc/outboundfeeds/rss/?outputType=xml>|200|02/23/2026|valid|100|3300|
15|Pulso (La Tercera Biz)|<https://www.latercera.com/arc/outboundfeeds/rss/?outputType=xml&rotation=pulso>|200|02/23/2026|valid|100|3300|
16|Emol - Nacional|<https://www.emol.com/rss/rss_nacional.xml>|Recovered via sitemap|02/23/2026|valid|0|0|
17|Emol - Economía|<https://www.emol.com/rss/rss_economia.xml>|Recovered via sitemap|02/23/2026|valid|0|0|
18|BioBioChile - Home|<https://www.biobiochile.cl/feed>|Recovered via sitemap|02/23/2026|valid|0|0|
19|Cooperativa - Economía|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_5___1.xml>|200|02/23/2026|valid|15|495|
20|Cooperativa - País|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_3___1.xml>|200|02/23/2026|valid|15|90|
21|Cooperativa - País (모바일)|<https://m.cooperativa.cl/noticias/site/tax/port/all/rss_3___1.xml>|200|02/23/2026|valid|15|90|
22|Cooperativa - Deportes|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_1___24.xml>|200|02/23/2026|valid|15|90|
23|Cooperativa - Deportes (모바일)|<https://m.cooperativa.cl/noticias/site/tax/port/all/rss_1___24.xml>|200|02/23/2026|valid|15|90|
24|Cooperativa - Cine|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_4_4__1.xml>|200|02/23/2026|valid|15|90|
25|Cooperativa - Música|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_4_11__1.xml>|200|02/23/2026|valid|15|90|
26|Cooperativa - Banco Central (경제)|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_6_82__1.xml>|200|02/23/2026|valid|15|90|
27|Cooperativa - Banco Central (모바일)|<https://m.cooperativa.cl/noticias/site/tax/port/all/rss_6_82__1.xml>|200|02/23/2026|valid|15|90|
28|Cooperativa - Banco Central (모바일 fid_noticia)|<https://m.cooperativa.cl/noticias/site/tax/port/fid_noticia/rss_6_82__1.xml>|200|02/23/2026|valid|15|90|
29|Cooperativa - Banco Central (오디오)|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_6_82__1.xml>|200|02/23/2026|valid|15|90|
30|Cooperativa - Fútbol|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_1_30__1.xml>|200|02/23/2026|valid|15|90|
31|Cooperativa - Universidad de Chile|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_1_30_332_1.xml>|200|02/23/2026|valid|15|90|
32|Cooperativa - Copa Davis|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_1_58_534_1.xml>|200|02/23/2026|valid|15|90|
33|Cooperativa - Sociedad|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_7_136__1.xml>|200|02/23/2026|valid|15|90|
34|Cooperativa - Genética (Sociedad)|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_7_221_1735_1.xml>|200|02/23/2026|valid|3|18|
35|Cooperativa - Genética (88frases)|<https://88frases.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_7_221_1735_1.xml>|200|02/23/2026|valid|3|9|
36|Cooperativa - Oftalmología (Sociedad)|<https://88frases.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_7_120_1804_1.xml>|200|02/23/2026|valid|8|48|
37|Cooperativa - Donald Trump|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_2_76_2384_1.xml>|200|02/23/2026|valid|15|90|
38|Cooperativa - Argentina|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_2_70__1.xml>|200|02/23/2026|valid|15|90|
39|Cooperativa - Música Chilena|<https://www.cooperativa.cl/noticias/site/tax/port/all/rss_4_11_779_1.xml>|200|02/23/2026|valid|15|90|
40|Cooperativa - Cine (오디오)|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_4_4__1.xml>|200|02/23/2026|valid|15|90|
41|Cooperativa - Música (오디오)|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_4_11__1.xml>|200|02/23/2026|valid|15|90|
42|Cooperativa - Venezuela (오디오)|<https://www.cooperativa.cl/noticias/site/tax/port/fid_audio/rss_3_81_1474_1.xml>|200|02/23/2026|valid|15|90|
43|Reporte Minero|<https://www.reporteminero.cl/feed>|404 (HTTP_404)|02/23/2026|invalid|0|1794|

### Dominican Republic (DO)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Diario Libre - Portada|<https://www.diariolibre.com/rss/portada.xml>|200|02/23/2026|valid|28|2414|
2|Diario Libre - Actualidad|<https://www.diariolibre.com/rss/actualidad.xml>|200|02/23/2026|valid|30|2010|
3|Diario Libre - Política|<https://www.diariolibre.com/rss/politica.xml>|200|02/23/2026|valid|30|2010|
4|Diario Libre - Economía|<https://www.diariolibre.com/rss/economia.xml>|200|02/23/2026|valid|30|2010|
5|Diario Libre - Opinión|<https://www.diariolibre.com/rss/opinion.xml>|200|02/23/2026|valid|30|2010|
6|Diario Libre - Deportes|<https://www.diariolibre.com/rss/deportes.xml>|200|02/23/2026|valid|30|2010|
7|Diario Libre - Mundo|<https://www.diariolibre.com/rss/mundo.xml>|200|02/23/2026|valid|30|2010|
8|Diario Libre - Videos|<https://www.diariolibre.com/rss/videos.xml>|200|02/23/2026|valid|30|2010|
9|Diario Libre - Edición USA|<https://www.diariolibre.com/rss/dl-usa.xml>|200|02/23/2026|valid|30|2010|
10|AlMomento - Portada|<https://almomento.net/feed/>|200|02/23/2026|valid|20|1340|
11|AlMomento - Política|<https://almomento.net/categoria/politica/feed/>|200|02/23/2026|valid|20|1320|
12|AlMomento - Deportes|<https://almomento.net/categoria/deportes/feed/>|200|02/23/2026|valid|20|1320|
13|AlMomento - Económicas|<https://almomento.net/categoria/economicas/feed/>|200|02/23/2026|valid|0|1300|
14|AlMomento - Dominicanos en el Exterior|<https://almomento.net/categoria/dominicanos-en-el-exterior/feed/>|200|02/23/2026|valid|0|0|
15|AlMomento - Internacionales|<https://almomento.net/categoria/internacionales/feed/>|200|02/23/2026|valid|20|1340|
16|AlMomento - Variedades|<https://almomento.net/categoria/variedades/feed/>|200|02/23/2026|valid|0|1300|
17|AlMomento - Opinión|<https://almomento.net/categoria/opinion/feed/>|200|02/23/2026|valid|20|1320|
18|AlMomento - Haití|<https://almomento.net/categoria/haiti/feed/>|200|02/23/2026|valid|20|1320|
19|AlMomento - Provincias|<https://almomento.net/categoria/provincias/feed/>|200|02/23/2026|valid|0|1320|
20|El Nacional|<https://elnacional.com.do/feed/>|200|02/23/2026|valid|15|990|
21|El Nuevo Diario|<https://elnuevodiario.com.do/feed/>|200|02/23/2026|valid|10|670|
22|Listín Diario - Portada|<https://listindiario.com/rss/portada.xml>|Recovered via sitemap|02/23/2026|valid|0|0|
23|Listín Diario - Economía|<https://listindiario.com/rss/economia.xml>|200|02/23/2026|valid|100|3300|
24|Periódico Hoy|<https://hoy.com.do/feed/>|Recovered via sitemap|02/23/2026|valid|0|0|
25|El Dinero|<https://eldinero.com.do/feed/>|200|02/23/2026|valid|20|660|
26|Acento|<https://acento.com.do/feed/>|Recovered via sitemap|02/23/2026|valid|0|0|
27|Acento - Author Feed|<https://acento.com.do/author/jcastillo/feed/>|Recovered via sitemap|02/23/2026|valid|0|0|
28|Noticias SIN|<https://feeds.feedburner.com/noticiassin1>|200|02/23/2026|valid|10|60|

### Uruguay (UY)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|El Observador - Home|<https://www.elobservador.com.uy/rss/pages/home.xml>|200|02/23/2026|valid|20|1340|
2|El Observador - Último momento|<https://www.elobservador.com.uy/rss/pages/ultimo-momento.xml>|200|02/23/2026|valid|19|1229|
3|El Observador - Mundo|<https://www.elobservador.com.uy/rss/pages/Mundo.xml>|200|02/23/2026|valid|20|1340|
4|El Observador - Nacional|<https://www.elobservador.com.uy/rss/pages/nacional.xml>|200|02/23/2026|valid|20|1340|
5|El Observador - Sociales|<https://www.elobservador.com.uy/rss/pages/sociales.xml>|200|02/23/2026|valid|20|1340|
6|El Observador - Café y Negocios|<https://www.elobservador.com.uy/rss/pages/cafe-y-negocios.xml>|200|02/23/2026|valid|20|1340|
7|El Observador - Agro|<https://www.elobservador.com.uy/rss/pages/Agro.xml>|200|02/23/2026|valid|20|1340|
8|El Observador - Economía y Empresas|<https://www.elobservador.com.uy/rss/pages/economia.xml>|200|02/23/2026|valid|20|1340|
9|El Observador - Opinión|<https://www.elobservador.com.uy/rss/pages/opinion.xml>|200|02/23/2026|valid|20|1340|
10|El Observador - Salud|<https://www.elobservador.com.uy/rss/pages/salud.xml>|200|02/23/2026|valid|20|1340|
11|El Observador - Ciencia y Tecnología|<https://www.elobservador.com.uy/rss/pages/ciencia-y-tecnologia.xml>|200|02/23/2026|valid|20|1340|
12|El Observador - Cultura y Espectáculos|<https://www.elobservador.com.uy/rss/pages/cultura-y-espectaculos.xml>|200|02/23/2026|valid|20|1340|
13|El Observador - Ediciones especiales|<https://www.elobservador.com.uy/rss/pages/ediciones-especiales.xml>|200|02/23/2026|valid|20|1340|
14|El Observador - Referí|<https://www.elobservador.com.uy/rss/pages/referi.xml>|200|02/23/2026|valid|20|1340|
15|El Observador - Running|<https://www.elobservador.com.uy/rss/pages/running.xml>|200|02/23/2026|valid|20|1340|
16|El Observador - Selección|<https://www.elobservador.com.uy/rss/pages/seleccion.xml>|200|02/23/2026|valid|20|1340|
17|El Observador - Rugby|<https://www.elobservador.com.uy/rss/pages/rugby.xml>|200|02/23/2026|valid|20|1340|
18|El Observador - Polideportivo|<https://www.elobservador.com.uy/rss/pages/polideportivo.xml>|200|02/23/2026|valid|20|1340|
19|El Observador - Básquetbol|<https://www.elobservador.com.uy/rss/pages/basquetbol.xml>|200|02/23/2026|valid|20|1340|
20|El Observador - Copa América|<https://www.elobservador.com.uy/rss/pages/copa-america-odl.xml>|200|02/23/2026|valid|20|1340|
21|El Observador - Motor|<https://www.elobservador.com.uy/rss/pages/motor.xml>|200|02/23/2026|valid|20|1340|
22|El Observador - Fútbol internacional|<https://www.elobservador.com.uy/rss/pages/futbol-internacional.xml>|200|02/23/2026|valid|20|1340|
23|El Observador - Fútbol|<https://www.elobservador.com.uy/rss/pages/futbol.xml>|200|02/23/2026|valid|20|1340|
24|El Observador - Copa Libertadores|<https://www.elobservador.com.uy/rss/pages/copa-libertadores.xml>|200|02/23/2026|valid|20|1340|
25|Montevideo Portal - Información destacada|<https://www.montevideo.com.uy/anxml.aspx?58>|200|02/23/2026|valid|51|3264|
26|Montevideo Portal - Noticias|<https://www.montevideo.com.uy/anxml.aspx?59>|200|02/23/2026|valid|8|536|
27|Montevideo Portal - Tiempo Libre|<https://www.montevideo.com.uy/anxml.aspx?60>|200|02/23/2026|valid|8|536|
28|Montevideo Portal - Tecnología|<https://www.montevideo.com.uy/anxml.aspx?133>|200|02/23/2026|valid|6|402|
29|Montevideo Portal - Negocios & Tendencias|<https://www.montevideo.com.uy/anxml.aspx?728>|200|02/23/2026|valid|13|858|
30|Montevideo Portal - Deportes|<https://www.montevideo.com.uy/anxml.aspx?1727>|200|02/23/2026|valid|16|1072|
31|El País - Portada|<https://www.elpais.com.uy/rss>|403 (HTTP_403)|02/23/2026|invalid|20|660|
32|El País - Economía|<https://www.elpais.com.uy/rss/economia-y-mercado>|403 (HTTP_403)|02/23/2026|invalid|20|660|
33|Montevideo Portal - Negocios|<https://www.montevideo.com.uy/anxml.aspx?728>|200|02/23/2026|valid|13|429|
34|La Diaria - Política|<https://ladiaria.com.uy/feeds/section/politica/>|Recovered via sitemap|02/23/2026|valid|0|234|
35|La Diaria - Economía|<https://ladiaria.com.uy/feeds/section/economia/>|Recovered via sitemap|02/23/2026|valid|0|234|
36|Subrayado - Home|<https://www.subrayado.com.uy/rss/pages/home.xml>|200|02/23/2026|valid|20|120|
37|Subrayado - Sociedad|<https://www.subrayado.com.uy/rss/pages/sociedad.xml>|200|02/23/2026|valid|20|120|
38|Subrayado - Nacional|<https://www.subrayado.com.uy/rss/pages/nacional.xml>|200|02/23/2026|valid|20|120|
39|Subrayado - Política|<https://www.subrayado.com.uy/rss/pages/politica.xml>|200|02/23/2026|valid|20|120|
40|Subrayado - Policiales|<https://www.subrayado.com.uy/rss/pages/policiales.xml>|200|02/23/2026|valid|20|120|
41|Subrayado - Internacionales|<https://www.subrayado.com.uy/rss/pages/internacionales.xml>|200|02/23/2026|valid|20|120|
42|Subrayado - Opinión|<https://www.subrayado.com.uy/rss/pages/opinion.xml>|200|02/23/2026|valid|20|120|
43|Subrayado - Tecnología e Internet|<https://www.subrayado.com.uy/rss/pages/tecnologia-internet.xml>|200|02/23/2026|valid|20|120|
44|Subrayado - Deportes|<https://www.subrayado.com.uy/rss/pages/deportes.xml>|200|02/23/2026|valid|20|120|
45|Subrayado - Economía|<https://www.subrayado.com.uy/rss/pages/economia.xml>|200|02/23/2026|valid|20|120|

### Austria (AT)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|Der Standard|<https://www.derstandard.at/rss>|200|02/23/2026|valid|120|7680|
2|ORF|<https://rss.orf.at/news.xml>|200|02/23/2026|valid|0|0|
3|Die Presse|<https://www.diepresse.com/rss>|200|02/23/2026|valid|78|4696|
4|Tiroler Tageszeitung|<https://www.tt.com/rss/news.xml>|200|02/23/2026|valid|70|4199|
5|ORF Aktuell|<https://rss.orf.at/>|200|02/23/2026|valid|0|240|
6|Kurier (Top News)|<https://kurier.at/xml/rssd>|200|02/23/2026|valid|20|1280|
7|Neue Donau|<https://www.neue.at/feed>|200|02/23/2026|valid|10|630|
8|Der Standard|<https://www.derstandard.at/rss?section=welt>|200|02/23/2026|valid|120|7680|
9|Kleine Zeitung|<https://www.kleinezeitung.at/rss/home>|200|02/23/2026|valid|1|64|
10|Der Standard|<https://www.derstandard.at/rss?output=amp>|200|02/23/2026|valid|120|7680|
11|Der Standard Plus|<https://www.derstandard.at/rss/wirtschaft>|200|02/23/2026|valid|32|2048|
12|derStandard - International|<https://www.derstandard.at/rss/international>|200|02/23/2026|valid|38|2275|
13|derStandard - Inland|<https://www.derstandard.at/rss/inland>|200|02/23/2026|valid|32|2048|
14|derStandard - Web|<https://www.derstandard.at/rss/web>|200|02/23/2026|valid|51|3264|
15|derStandard - Sport|<https://www.derstandard.at/rss/sport>|200|02/23/2026|valid|42|2688|
16|derStandard - Panorama|<https://www.derstandard.at/rss/panorama>|200|02/23/2026|valid|32|2052|
17|derStandard - Etat|<https://www.derstandard.at/rss/etat>|200|02/23/2026|valid|34|2179|
18|derStandard - Kultur|<https://www.derstandard.at/rss/kultur>|200|02/23/2026|valid|35|2240|
19|derStandard - Wissenschaft|<https://www.derstandard.at/rss/wissenschaft>|200|02/23/2026|valid|53|3339|
20|derStandard - Gesundheit|<https://www.derstandard.at/rss/gesundheit>|200|02/23/2026|valid|16|1024|
21|derStandard - Lifestyle|<https://www.derstandard.at/rss/lifestyle>|200|02/23/2026|valid|47|3009|
22|derStandard - Karriere|<https://www.derstandard.at/rss/karriere>|200|02/23/2026|valid|28|1792|
23|derStandard - Immobilien|<https://www.derstandard.at/rss/immobilien>|200|02/23/2026|valid|24|1536|
24|derStandard - Diskurs|<https://www.derstandard.at/rss/diskurs>|200|02/23/2026|valid|46|2973|
25|derStandard - dieStandard.at|<https://www.derstandard.at/rss/diestandard>|200|02/23/2026|valid|27|1728|
26|derStandard - Live|<https://www.derstandard.at/rss/live>|200|02/23/2026|valid|22|1386|
27|derStandard - Video|<https://www.derstandard.at/rss/video>|200|02/23/2026|valid|20|1260|
28|derStandard - Podcast|<https://www.derstandard.at/rss/podcast>|200|02/23/2026|valid|27|1728|
29|derStandard - Recht|<https://www.derstandard.at/rss/recht>|200|02/23/2026|valid|16|1024|

### Norway (NO)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|NRK|<https://www.nrk.no/toppsaker.rss>|200|02/23/2026|valid|100|6300|
2|NRK News|<https://www.nrk.no/nyheter/siste.rss>|200|02/23/2026|valid|20|1280|
3|TV2|<https://www.tv2.no/rss/toppsaker.xml>|200|02/23/2026|valid|0|0|
4|E24|<https://e24.no/rss>|200|02/23/2026|valid|6|460|
5|Dagbladet|<https://www.dagbladet.no/rss/nyheter>|200|02/23/2026|valid|115|7360|
6|TV2|<https://www.tv2.no/rss/nyheter/>|200|02/23/2026|valid|20|1280|
7|E24|<https://e24.no/rss/okonomi.xml>|200|02/23/2026|valid|6|461|
8|TV2|<https://www.tv2.no/rss/politikk.xml>|200|02/23/2026|valid|0|0|
9|E24|<https://e24.no/rss/nyheter.xml>|200|02/23/2026|valid|6|460|
10|VG - Forsiden|<https://www.vg.no/rss/feed/forsiden/>|Recovered via sitemap|02/23/2026|valid|0|138|
11|VG - Innenriks|<https://www.vg.no/rss/feed/?categories=1069>|200|02/23/2026|valid|10|610|
12|VG - Utenriks|<https://www.vg.no/rss/feed/?categories=1070>|200|02/23/2026|valid|10|610|
13|E24 - Børs og finans|<https://e24.no/rss2/?seksjon=boers-og-finans>|200|02/23/2026|valid|10|610|
14|E24 - Aksjetips|<http://e24.no/rss2/?seksjon=aksjetips>|200|02/23/2026|valid|6|434|
15|E24 - IT & Telekom|<http://e24.no/rss2/?seksjon=it>|200|02/23/2026|valid|6|436|
16|NRK - RSS oversikt (directory)|<https://www.nrk.no/rss/>|Recovered via sitemap|02/23/2026|valid|0|1794|
17|NRK - Innenriks|<https://www.nrk.no/norge/toppsaker.rss>|200|02/23/2026|valid|20|1220|
18|TV2 - Nyheter|<https://www.tv2.no/rss/nyheter>|200|02/23/2026|valid|20|1220|
19|TV2 - Innenriks|<https://www.tv2.no/rss/nyheter/innenriks>|200|02/23/2026|valid|20|1220|
20|TV2 - Utenriks|<https://www.tv2.no/rss/nyheter/utenriks>|200|02/23/2026|valid|20|1220|
21|TV2 - Sport|<https://www.tv2.no/rss/sport>|200|02/23/2026|valid|20|1220|
22|TV2 - Underholdning|<https://www.tv2.no/rss/underholdning>|200|02/23/2026|valid|20|1220|
23|Nettavisen - Alle saker|<https://www.nettavisen.no/service/rich-rss>|200|02/23/2026|valid|0|465|
24|Nettavisen - Nyheter|<https://www.nettavisen.no/service/rich-rss?tag=nyheter>|200|02/23/2026|valid|0|465|
25|Nettavisen - Sport|<https://www.nettavisen.no/service/rich-rss?tag=sport>|200|02/23/2026|valid|0|465|
26|Dagbladet|<https://www.dagbladet.no/?lab_viewport=rss>|200|02/23/2026|valid|42|2712|
27|Aftenposten|<https://www.aftenposten.no/rss/>|200|02/23/2026|valid|25|1525|
28|Dagsavisen|<https://www.dagsavisen.no/rss>|200|02/23/2026|valid|84|6338|
29|DN - RSS directory|<https://services.dn.no/tools/rss>|200 (HTML_RETURNED)|02/23/2026|invalid|0|0|
30|DN - Alle nyheter|<https://services.dn.no/api/feed/rss/>|200|02/23/2026|valid|25|1368|
31|Finansavisen|<https://ws.finansavisen.no/api/articles.rss>|200|02/23/2026|valid|10|610|
32|Finansavisen - Børs|<https://ws.finansavisen.no/api/articles.rss?category=B%C3%B8rs>|200|02/23/2026|valid|10|610|

### Global Energy & Grid (Global)
|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|
|---|---|---|---|---|---|---:|---:|
1|OilPrice|<https://oilprice.com/rss/main>|200|02/23/2026|valid|15|960|
2|Power Engineering|<https://www.power-eng.com/feed/>|200|02/23/2026|valid|10|630|
3|Renewable Energy World|<https://www.renewableenergyworld.com/feed/>|200|02/23/2026|valid|10|640|
4|Utility Dive|<https://www.utilitydive.com/feeds/news/>|200|02/23/2026|valid|10|640|
5|CleanTechnica|<https://cleantechnica.com/feed/>|200|02/23/2026|valid|45|2880|
6|Carbon Brief|<https://www.carbonbrief.org/feed/>|200|02/23/2026|valid|10|640|
7|Power Magazine|<https://www.powermag.com/feed/>|200|02/23/2026|valid|10|640|
8|PV Magazine|<https://www.pv-magazine.com/feed/>|200|02/23/2026|valid|25|1600|
9|Energy Post|<https://energypost.eu/feed/>|200|02/23/2026|valid|0|0|
10|Energy Storage News|<https://www.energy-storage.news/rss>|200|02/23/2026|valid|50|3200|
11|Energy Storage News|<https://www.energy-storage.news/feed>|200|02/23/2026|valid|50|3200|

