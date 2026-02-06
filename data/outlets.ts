import type { OutletFeed, SourcePreset } from '@/lib/types';

interface OutletSeed {
  name: string;
  tier: 1 | 2 | 3;
  beat: OutletFeed['beat'];
  country: string;
  language?: string;
  sourceType?: 'global' | 'local' | 'portal';
  rssUrl?: string;
  sitemapUrl?: string;
}

const PRESET_SEEDS: Record<string, OutletSeed[]> = {
  global_core: [
    { name: 'BBC World', tier: 1, beat: 'world', country: 'UK', rssUrl: 'https://feeds.bbci.co.uk/news/world/rss.xml', sitemapUrl: 'https://www.bbc.com/sitemaps/https-index-com-archive.xml' },
    { name: 'Reuters World', tier: 1, beat: 'world', country: 'US', rssUrl: 'https://news.google.com/rss/search?q=site:reuters.com+world&hl=en-US&gl=US&ceid=US:en' },
    { name: 'AP News', tier: 1, beat: 'world', country: 'US', rssUrl: 'https://news.google.com/rss/search?q=site:apnews.com&hl=en-US&gl=US&ceid=US:en' },
    { name: 'The Guardian World', tier: 2, beat: 'world', country: 'UK', rssUrl: 'https://www.theguardian.com/world/rss' },
    { name: 'NPR News', tier: 2, beat: 'world', country: 'US', rssUrl: 'https://feeds.npr.org/1001/rss.xml' },
    { name: 'Al Jazeera', tier: 2, beat: 'world', country: 'QA', rssUrl: 'https://www.aljazeera.com/xml/rss/all.xml' },
    { name: 'CNN World', tier: 2, beat: 'world', country: 'US', rssUrl: 'http://rss.cnn.com/rss/cnn_world.rss' },
    { name: 'Politico Picks', tier: 2, beat: 'politics', country: 'US', rssUrl: 'https://www.politico.com/rss/politicopicks.xml' },
    { name: 'The Diplomat', tier: 2, beat: 'politics', country: 'US', rssUrl: 'https://thediplomat.com/feed/' },
    { name: 'Foreign Policy', tier: 2, beat: 'politics', country: 'US', rssUrl: 'https://foreignpolicy.com/feed/' },
    { name: 'Foreign Affairs', tier: 2, beat: 'politics', country: 'US', rssUrl: 'https://www.foreignaffairs.com/rss.xml' },
    { name: 'Atlantic Council', tier: 3, beat: 'politics', country: 'US', rssUrl: 'https://www.atlanticcouncil.org/feed/' }
  ],
  macro_watch: [
    { name: 'Bloomberg Markets', tier: 1, beat: 'business', country: 'US', rssUrl: 'https://feeds.bloomberg.com/markets/news.rss' },
    { name: 'Financial Times', tier: 1, beat: 'business', country: 'UK', rssUrl: 'https://www.ft.com/world?format=rss' },
    { name: 'WSJ World', tier: 1, beat: 'business', country: 'US', rssUrl: 'https://feeds.a.dj.com/rss/RSSWorldNews.xml' },
    { name: 'Reuters Business', tier: 1, beat: 'business', country: 'US', rssUrl: 'https://news.google.com/rss/search?q=site:reuters.com+business+markets&hl=en-US&gl=US&ceid=US:en' },
    { name: 'CNBC', tier: 2, beat: 'business', country: 'US', rssUrl: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' },
    { name: 'MarketWatch', tier: 2, beat: 'business', country: 'US', rssUrl: 'https://feeds.marketwatch.com/marketwatch/topstories' },
    { name: 'Yahoo Finance', tier: 2, beat: 'business', country: 'US', rssUrl: 'https://finance.yahoo.com/news/rssindex' },
    { name: 'Federal Reserve', tier: 2, beat: 'business', country: 'US', rssUrl: 'https://www.federalreserve.gov/feeds/press_all.xml' },
    { name: 'SEC', tier: 2, beat: 'business', country: 'US', rssUrl: 'https://www.sec.gov/news/pressreleases.rss' },
    { name: 'Treasury', tier: 2, beat: 'business', country: 'US', rssUrl: 'https://news.google.com/rss/search?q=site:treasury.gov+OR+"Treasury+Department"&hl=en-US&gl=US&ceid=US:en' },
    { name: 'Oil and Gas', tier: 3, beat: 'business', country: 'US', rssUrl: 'https://news.google.com/rss/search?q=(oil+price+OR+OPEC+OR+natural+gas+OR+pipeline+OR+LNG)+when:2d&hl=en-US&gl=US&ceid=US:en' },
    { name: 'Mining and Resources', tier: 3, beat: 'business', country: 'US', rssUrl: 'https://news.google.com/rss/search?q=(lithium+OR+rare+earth+OR+cobalt+OR+mining)+when:3d&hl=en-US&gl=US&ceid=US:en' }
  ],
  policy_watch: [
    { name: 'Politico', tier: 2, beat: 'politics', country: 'US', rssUrl: 'https://www.politico.com/rss/politicopicks.xml' },
    { name: 'White House', tier: 1, beat: 'politics', country: 'US', rssUrl: 'https://news.google.com/rss/search?q=site:whitehouse.gov&hl=en-US&gl=US&ceid=US:en' },
    { name: 'State Department', tier: 1, beat: 'politics', country: 'US', rssUrl: 'https://news.google.com/rss/search?q=site:state.gov+OR+"State+Department"&hl=en-US&gl=US&ceid=US:en' },
    { name: 'Pentagon', tier: 1, beat: 'security', country: 'US', rssUrl: 'https://news.google.com/rss/search?q=site:defense.gov+OR+Pentagon&hl=en-US&gl=US&ceid=US:en' },
    { name: 'DOJ', tier: 2, beat: 'politics', country: 'US', rssUrl: 'https://news.google.com/rss/search?q=site:justice.gov+OR+DOJ&hl=en-US&gl=US&ceid=US:en' },
    { name: 'DHS', tier: 2, beat: 'security', country: 'US', rssUrl: 'https://news.google.com/rss/search?q=site:dhs.gov+OR+"Homeland+Security"&hl=en-US&gl=US&ceid=US:en' },
    { name: 'UN News', tier: 1, beat: 'world', country: 'UN', rssUrl: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml' },
    { name: 'WHO News', tier: 1, beat: 'world', country: 'UN', rssUrl: 'https://www.who.int/rss-feeds/news-english.xml' },
    { name: 'IAEA', tier: 1, beat: 'security', country: 'UN', rssUrl: 'https://www.iaea.org/feeds/topnews' },
    { name: 'Crisis Group', tier: 3, beat: 'politics', country: 'INT', rssUrl: 'https://www.crisisgroup.org/rss' },
    { name: 'Brookings', tier: 3, beat: 'politics', country: 'US', rssUrl: 'https://news.google.com/rss/search?q=site:brookings.edu+when:7d&hl=en-US&gl=US&ceid=US:en' },
    { name: 'CSIS', tier: 3, beat: 'security', country: 'US', rssUrl: 'https://news.google.com/rss/search?q=site:csis.org+when:7d&hl=en-US&gl=US&ceid=US:en' }
  ],
  tech_ai: [
    { name: 'TechCrunch', tier: 2, beat: 'tech', country: 'US', rssUrl: 'https://techcrunch.com/feed/' },
    { name: 'The Verge', tier: 2, beat: 'tech', country: 'US', rssUrl: 'https://www.theverge.com/rss/index.xml' },
    { name: 'Ars Technica', tier: 2, beat: 'tech', country: 'US', rssUrl: 'https://feeds.arstechnica.com/arstechnica/technology-lab' },
    { name: 'Hacker News', tier: 3, beat: 'tech', country: 'US', rssUrl: 'https://hnrss.org/frontpage' },
    { name: 'MIT Tech Review', tier: 2, beat: 'tech', country: 'US', rssUrl: 'https://www.technologyreview.com/feed/' },
    { name: 'ZDNet', tier: 3, beat: 'tech', country: 'US', rssUrl: 'https://www.zdnet.com/news/rss.xml' },
    { name: 'TechMeme', tier: 3, beat: 'tech', country: 'US', rssUrl: 'https://www.techmeme.com/feed.xml' },
    { name: 'Engadget', tier: 3, beat: 'tech', country: 'US', rssUrl: 'https://www.engadget.com/rss.xml' },
    { name: 'AI News', tier: 3, beat: 'tech', country: 'US', rssUrl: 'https://news.google.com/rss/search?q=(OpenAI+OR+Anthropic+OR+Google+AI+OR+ChatGPT+OR+Claude)+when:2d&hl=en-US&gl=US&ceid=US:en' },
    { name: 'VentureBeat AI', tier: 3, beat: 'tech', country: 'US', rssUrl: 'https://venturebeat.com/category/ai/feed/' },
    { name: 'MIT Research', tier: 3, beat: 'tech', country: 'US', rssUrl: 'https://news.mit.edu/rss/research' },
    { name: 'ArXiv AI', tier: 3, beat: 'tech', country: 'US', rssUrl: 'https://export.arxiv.org/rss/cs.AI' },
    { name: 'ArXiv ML', tier: 3, beat: 'tech', country: 'US', rssUrl: 'https://export.arxiv.org/rss/cs.LG' },
    { name: 'Anthropic News', tier: 3, beat: 'tech', country: 'US', rssUrl: 'https://news.google.com/rss/search?q=Anthropic+Claude+AI+when:7d&hl=en-US&gl=US&ceid=US:en' },
    { name: 'OpenAI News', tier: 3, beat: 'tech', country: 'US', rssUrl: 'https://news.google.com/rss/search?q=OpenAI+ChatGPT+GPT-4+when:7d&hl=en-US&gl=US&ceid=US:en' },
    { name: 'The Hacker News', tier: 3, beat: 'security', country: 'US', rssUrl: 'https://feeds.feedburner.com/TheHackersNews' },
    { name: 'Krebs on Security', tier: 3, beat: 'security', country: 'US', rssUrl: 'https://krebsonsecurity.com/feed/' },
    { name: 'Dark Reading', tier: 3, beat: 'security', country: 'US', rssUrl: 'https://www.darkreading.com/rss.xml' }
  ],
  startups_vc: [
    { name: 'Crunchbase News', tier: 2, beat: 'business', country: 'US', rssUrl: 'https://news.crunchbase.com/feed/' },
    { name: 'SaaStr', tier: 3, beat: 'business', country: 'US', rssUrl: 'https://www.saastr.com/feed/' },
    { name: 'TechCrunch Startups', tier: 2, beat: 'tech', country: 'US', rssUrl: 'https://techcrunch.com/category/startups/feed/' },
    { name: 'TechCrunch Venture', tier: 2, beat: 'business', country: 'US', rssUrl: 'https://techcrunch.com/category/venture/feed/' },
    { name: 'PitchBook News', tier: 2, beat: 'business', country: 'US', rssUrl: 'https://news.google.com/rss/search?q=site:pitchbook.com+when:7d&hl=en-US&gl=US&ceid=US:en' },
    { name: 'CB Insights', tier: 2, beat: 'business', country: 'US', rssUrl: 'https://www.cbinsights.com/research/feed/' },
    { name: 'Y Combinator Blog', tier: 2, beat: 'tech', country: 'US', rssUrl: 'https://www.ycombinator.com/blog/rss/' },
    { name: 'a16z Blog', tier: 2, beat: 'tech', country: 'US', rssUrl: 'https://a16z.com/feed/' },
    { name: 'Sequoia Blog', tier: 2, beat: 'business', country: 'US', rssUrl: 'https://www.sequoiacap.com/feed/' },
    { name: 'Lenny Newsletter', tier: 3, beat: 'business', country: 'US', rssUrl: 'https://www.lennysnewsletter.com/feed' },
    { name: 'Stratechery', tier: 2, beat: 'tech', country: 'US', rssUrl: 'https://stratechery.com/feed/' },
    { name: 'All-In Podcast', tier: 3, beat: 'business', country: 'US', rssUrl: 'https://news.google.com/rss/search?q="All-In+podcast"+when:7d&hl=en-US&gl=US&ceid=US:en' }
  ],
  regional: [
    { name: 'BBC Middle East', tier: 2, beat: 'world', country: 'UK', rssUrl: 'https://feeds.bbci.co.uk/news/world/middle_east/rss.xml' },
    { name: 'Al Arabiya', tier: 3, beat: 'world', country: 'SA', rssUrl: 'https://news.google.com/rss/search?q=site:english.alarabiya.net+when:2d&hl=en-US&gl=US&ceid=US:en' },
    { name: 'Kyiv Independent', tier: 2, beat: 'world', country: 'UA', rssUrl: 'https://kyivindependent.com/feed/' },
    { name: 'Moscow Times', tier: 3, beat: 'world', country: 'RU', rssUrl: 'https://www.themoscowtimes.com/rss/news' },
    { name: 'Africa News', tier: 3, beat: 'world', country: 'ZA', rssUrl: 'https://news.google.com/rss/search?q=(Africa+OR+Nigeria+OR+Kenya+OR+Ethiopia)+when:2d&hl=en-US&gl=US&ceid=US:en' },
    { name: 'BBC Africa', tier: 2, beat: 'world', country: 'UK', rssUrl: 'https://feeds.bbci.co.uk/news/world/africa/rss.xml' },
    { name: 'Latin America', tier: 3, beat: 'world', country: 'LATAM', rssUrl: 'https://news.google.com/rss/search?q=(Brazil+OR+Mexico+OR+Argentina+OR+Colombia)+when:2d&hl=en-US&gl=US&ceid=US:en' },
    { name: 'BBC Latin America', tier: 2, beat: 'world', country: 'UK', rssUrl: 'https://feeds.bbci.co.uk/news/world/latin_america/rss.xml' },
    { name: 'Reuters LatAm', tier: 1, beat: 'world', country: 'US', rssUrl: 'https://news.google.com/rss/search?q=site:reuters.com+(Brazil+OR+Mexico+OR+Argentina)+when:3d&hl=en-US&gl=US&ceid=US:en' },
    { name: 'Asia News', tier: 3, beat: 'world', country: 'ASIA', rssUrl: 'https://news.google.com/rss/search?q=(China+OR+Japan+OR+Korea+OR+India+OR+ASEAN)+when:2d&hl=en-US&gl=US&ceid=US:en' },
    { name: 'BBC Asia', tier: 2, beat: 'world', country: 'UK', rssUrl: 'https://feeds.bbci.co.uk/news/world/asia/rss.xml' },
    { name: 'South China Morning Post', tier: 2, beat: 'world', country: 'HK', rssUrl: 'https://www.scmp.com/rss/91/feed/' },
    { name: 'Reuters Asia', tier: 1, beat: 'world', country: 'US', rssUrl: 'https://news.google.com/rss/search?q=site:reuters.com+(China+OR+Japan+OR+Taiwan+OR+Korea)+when:3d&hl=en-US&gl=US&ceid=US:en' },
    { name: 'Tech in Asia', tier: 3, beat: 'tech', country: 'SG', rssUrl: 'https://www.techinasia.com/feed' },
    { name: 'KrASIA', tier: 3, beat: 'tech', country: 'SG', rssUrl: 'https://news.google.com/rss/search?q=site:kr-asia.com+OR+KrASIA+when:7d&hl=en-US&gl=US&ceid=US:en' },
    { name: 'EU Startups', tier: 3, beat: 'tech', country: 'EU', rssUrl: 'https://www.eu-startups.com/feed/' },
    { name: 'Tech.eu', tier: 3, beat: 'tech', country: 'EU', rssUrl: 'https://tech.eu/feed/' },
    { name: 'Sifted Europe', tier: 3, beat: 'tech', country: 'EU', rssUrl: 'https://sifted.eu/feed' },
    { name: 'TechCabal', tier: 3, beat: 'tech', country: 'NG', rssUrl: 'https://techcabal.com/feed/' },
    { name: 'Inc42', tier: 3, beat: 'tech', country: 'IN', rssUrl: 'https://inc42.com/feed/' },
    { name: 'YourStory', tier: 3, beat: 'tech', country: 'IN', rssUrl: 'https://yourstory.com/feed' },
    { name: 'LAVCA', tier: 3, beat: 'business', country: 'LATAM', rssUrl: 'https://lavca.org/feed/' }
  ],
  defense_intel: [
    { name: 'Defense One', tier: 3, beat: 'security', country: 'US', rssUrl: 'https://www.defenseone.com/rss/all/' },
    { name: 'Breaking Defense', tier: 3, beat: 'security', country: 'US', rssUrl: 'https://breakingdefense.com/feed/' },
    { name: 'The War Zone', tier: 3, beat: 'security', country: 'US', rssUrl: 'https://www.thedrive.com/the-war-zone/rss' },
    { name: 'Defense News', tier: 3, beat: 'security', country: 'US', rssUrl: 'https://www.defensenews.com/arc/outboundfeeds/rss/?outputType=xml' },
    { name: 'Janes', tier: 3, beat: 'security', country: 'UK', rssUrl: 'https://news.google.com/rss/search?q=site:janes.com+when:3d&hl=en-US&gl=US&ceid=US:en' },
    { name: 'Bellingcat', tier: 3, beat: 'security', country: 'NL', rssUrl: 'https://www.bellingcat.com/feed/' },
    { name: 'Chatham House', tier: 3, beat: 'politics', country: 'UK', rssUrl: 'https://news.google.com/rss/search?q=site:chathamhouse.org+when:7d&hl=en-US&gl=US&ceid=US:en' },
    { name: 'ECFR', tier: 3, beat: 'politics', country: 'EU', rssUrl: 'https://ecfr.eu/feed/' },
    { name: 'Middle East Institute', tier: 3, beat: 'politics', country: 'US', rssUrl: 'https://www.mei.edu/rss.xml' },
    { name: 'RAND', tier: 3, beat: 'politics', country: 'US', rssUrl: 'https://www.rand.org/rss/all.xml' },
    { name: 'Carnegie', tier: 3, beat: 'politics', country: 'US', rssUrl: 'https://carnegieendowment.org/rss/' },
    { name: 'NTI', tier: 3, beat: 'security', country: 'US', rssUrl: 'https://www.nti.org/rss/' }
  ],
  multilingual_core: [
    { name: 'Google News KR Top', tier: 2, beat: 'world', country: 'South Korea', language: 'ko', sourceType: 'portal', rssUrl: 'https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko' },
    { name: 'Naver News KR', tier: 2, beat: 'world', country: 'South Korea', language: 'ko', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:news.naver.com&hl=ko&gl=KR&ceid=KR:ko' },
    { name: 'Daum News KR', tier: 2, beat: 'world', country: 'South Korea', language: 'ko', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:v.daum.net&hl=ko&gl=KR&ceid=KR:ko' },
    { name: 'Google News JTBC KR', tier: 2, beat: 'world', country: 'South Korea', language: 'ko', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:news.jtbc.co.kr&hl=ko&gl=KR&ceid=KR:ko' },
    { name: 'Google News KR Politics', tier: 2, beat: 'politics', country: 'South Korea', language: 'ko', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=정치+속보+site:news.naver.com+OR+site:v.daum.net&hl=ko&gl=KR&ceid=KR:ko' },
    { name: 'Google News KR Business', tier: 2, beat: 'business', country: 'South Korea', language: 'ko', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=경제+속보+site:news.naver.com+OR+site:v.daum.net&hl=ko&gl=KR&ceid=KR:ko' },
    { name: 'Yonhap KR', tier: 1, beat: 'world', country: 'South Korea', language: 'ko', sourceType: 'local', rssUrl: 'https://en.yna.co.kr/RSS/news.xml' },
    { name: 'Yonhap KR Local', tier: 1, beat: 'world', country: 'South Korea', language: 'ko', sourceType: 'local', rssUrl: 'https://www.yna.co.kr/rss/all.xml' },
    { name: 'Korea Local Mix', tier: 2, beat: 'world', country: 'South Korea', language: 'ko', sourceType: 'local', rssUrl: 'https://news.google.com/rss/search?q=(site:yna.co.kr+OR+site:khan.co.kr+OR+site:hani.co.kr+OR+site:joongang.co.kr)+when:2d&hl=ko&gl=KR&ceid=KR:ko' },
    { name: 'KBS News KR', tier: 2, beat: 'world', country: 'South Korea', language: 'ko', sourceType: 'local', rssUrl: 'http://news.kbs.co.kr/rss/news9.xml', sitemapUrl: 'https://news.kbs.co.kr/sitemap.xml' },
    { name: 'SBS News KR', tier: 2, beat: 'world', country: 'South Korea', language: 'ko', sourceType: 'local', rssUrl: 'https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=01&plink=RSSREADER', sitemapUrl: 'https://news.sbs.co.kr/news/sitemap.xml' },
    { name: 'MBC News KR', tier: 2, beat: 'world', country: 'South Korea', language: 'ko', sourceType: 'local', rssUrl: 'https://news.google.com/rss/search?q=site:imnews.imbc.com&hl=ko&gl=KR&ceid=KR:ko', sitemapUrl: 'https://imnews.imbc.com/sitemap/sitemap_index.xml' },
    { name: 'JTBC News KR', tier: 2, beat: 'world', country: 'South Korea', language: 'ko', sourceType: 'local', rssUrl: 'https://fs.jtbc.co.kr/RSS/newsflash.xml', sitemapUrl: 'https://news.jtbc.co.kr/sitemap/sitemap_index.xml' },
    { name: 'YTN News KR', tier: 2, beat: 'world', country: 'South Korea', language: 'ko', sourceType: 'local', rssUrl: 'https://news.google.com/rss/search?q=site:ytn.co.kr&hl=ko&gl=KR&ceid=KR:ko', sitemapUrl: 'https://www.ytn.co.kr/sitemap/sitemap_index.xml' },
    { name: 'Yahoo Japan News', tier: 2, beat: 'world', country: 'Japan', language: 'ja', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:news.yahoo.co.jp&hl=ja&gl=JP&ceid=JP:ja' },
    { name: 'NHK World Japan', tier: 1, beat: 'world', country: 'Japan', language: 'ja', sourceType: 'local', rssUrl: 'https://www3.nhk.or.jp/rss/news/cat0.xml' },
    { name: 'Japan Local Mix', tier: 2, beat: 'world', country: 'Japan', language: 'ja', sourceType: 'local', rssUrl: 'https://news.google.com/rss/search?q=(site:asahi.com+OR+site:mainichi.jp+OR+site:nikkei.com)+when:2d&hl=ja&gl=JP&ceid=JP:ja' },
    { name: 'Yandex Russia News', tier: 2, beat: 'world', country: 'Russia', language: 'ru', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=(site:yandex.ru+OR+site:dzen.ru)+новости&hl=ru&gl=RU&ceid=RU:ru' },
    { name: 'RT Russian', tier: 2, beat: 'world', country: 'Russia', language: 'ru', sourceType: 'local', rssUrl: 'https://russian.rt.com/rss' },
    { name: 'Russia Local Mix', tier: 2, beat: 'world', country: 'Russia', language: 'ru', sourceType: 'local', rssUrl: 'https://news.google.com/rss/search?q=(site:tass.ru+OR+site:ria.ru+OR+site:kommersant.ru)+when:2d&hl=ru&gl=RU&ceid=RU:ru' },
    { name: 'Google Italia News', tier: 2, beat: 'world', country: 'Italy', language: 'it', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=Italia+notizie&hl=it&gl=IT&ceid=IT:it' },
    { name: 'ANSA Italia', tier: 1, beat: 'world', country: 'Italy', language: 'it', sourceType: 'local', rssUrl: 'https://www.ansa.it/sito/ansait_rss.xml' },
    { name: 'Italy Local Mix', tier: 2, beat: 'world', country: 'Italy', language: 'it', sourceType: 'local', rssUrl: 'https://news.google.com/rss/search?q=(site:repubblica.it+OR+site:corriere.it+OR+site:ilsole24ore.com)+when:2d&hl=it&gl=IT&ceid=IT:it' },
    { name: 'Google Espana News', tier: 2, beat: 'world', country: 'Spain', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=Espana+noticias&hl=es&gl=ES&ceid=ES:es' },
    { name: 'El Pais', tier: 1, beat: 'world', country: 'Spain', language: 'es', sourceType: 'local', rssUrl: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada' },
    { name: 'Spain Local Mix', tier: 2, beat: 'world', country: 'Spain', language: 'es', sourceType: 'local', rssUrl: 'https://news.google.com/rss/search?q=(site:elmundo.es+OR+site:abc.es+OR+site:lavanguardia.com)+when:2d&hl=es&gl=ES&ceid=ES:es' },
    { name: 'Google France News', tier: 2, beat: 'world', country: 'France', language: 'fr', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=France+actualites&hl=fr&gl=FR&ceid=FR:fr' },
    { name: 'Le Monde', tier: 1, beat: 'world', country: 'France', language: 'fr', sourceType: 'local', rssUrl: 'https://www.lemonde.fr/rss/une.xml' },
    { name: 'France Local Mix', tier: 2, beat: 'world', country: 'France', language: 'fr', sourceType: 'local', rssUrl: 'https://news.google.com/rss/search?q=(site:lefigaro.fr+OR+site:liberation.fr+OR+site:francetvinfo.fr)+when:2d&hl=fr&gl=FR&ceid=FR:fr' }
  ]
};

const CATEGORY_ALIAS: Record<string, OutletFeed['categories'][number]> = {
  global_core: 'global',
  macro_watch: 'business',
  policy_watch: 'politics',
  tech_ai: 'tech',
  startups_vc: 'business',
  regional: 'world',
  defense_intel: 'security',
  multilingual_core: 'world'
};

const KEEP_PRIMARY_OR_REPLACE_WITH_DIRECT = new Set([
  'Reuters World',
  'AP News',
  'Reuters Business',
  'Reuters LatAm',
  'Reuters Asia'
]);

const KEEP_SECONDARY = new Set([
  'Brookings',
  'Chatham House',
  'CSIS',
  'Daum News KR',
  'DHS',
  'DOJ',
  'France Local Mix',
  'Google Espana News',
  'Google France News',
  'Google Italia News',
  'Google News JTBC KR',
  'Google News KR Business',
  'Google News KR Politics',
  'Google News KR Top',
  'Italy Local Mix',
  'Janes',
  'Japan Local Mix',
  'JTBC News KR',
  'KBS News KR',
  'Korea Local Mix',
  'Naver News KR',
  'Pentagon',
  'PitchBook News',
  'Russia Local Mix',
  'SBS News KR',
  'Spain Local Mix',
  'State Department',
  'Treasury',
  'White House',
  'Yahoo Japan News',
  'Yandex Russia News',
  'Yonhap KR Local'
]);

const EXPLORATORY_OFF_BY_DEFAULT = new Set([
  'Oil and Gas',
  'Mining and Resources',
  'AI News',
  'Anthropic News',
  'OpenAI News',
  'All-In Podcast',
  'Africa News',
  'Latin America',
  'Asia News'
]);

const MANUAL_REVIEW = new Set([
  'Al Arabiya',
  'KrASIA',
  'MBC News KR',
  'YTN News KR'
]);

const DEPRECATED_OUTLETS = new Set([
  'MBC News KR',
  'YTN News KR'
]);

function getReviewDecision(
  name: string
): 'verified_core' | 'keep_secondary' | 'exploratory_off_by_default' | 'manual_review' {
  if (MANUAL_REVIEW.has(name)) return 'manual_review';
  if (EXPLORATORY_OFF_BY_DEFAULT.has(name)) return 'exploratory_off_by_default';
  if (KEEP_SECONDARY.has(name)) return 'keep_secondary';
  if (KEEP_PRIMARY_OR_REPLACE_WITH_DIRECT.has(name)) return 'verified_core';
  return 'verified_core';
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function buildOutlets(): OutletFeed[] {
  const merged = new Map<string, OutletFeed>();

  for (const [presetKey, seeds] of Object.entries(PRESET_SEEDS)) {
    for (const seed of seeds) {
      const id = slugify(seed.name);
      const existing = merged.get(seed.name);
      const category = CATEGORY_ALIAS[presetKey];

      if (existing) {
        if (!existing.categories.includes(category)) {
          existing.categories.push(category);
        }
        continue;
      }

      merged.set(seed.name, {
        id,
        name: seed.name,
        tier: seed.tier,
        beat: seed.beat,
        categories: [category],
        language: seed.language || 'en',
        sourceType: seed.sourceType || 'global',
        reviewDecision: getReviewDecision(seed.name),
        defaultEnabled: !EXPLORATORY_OFF_BY_DEFAULT.has(seed.name) && !MANUAL_REVIEW.has(seed.name),
        country: seed.country,
        rssUrl: seed.rssUrl,
        sitemapUrl: seed.sitemapUrl
      });
    }
  }

  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export const OUTLET_FEEDS: OutletFeed[] = buildOutlets()
  .filter((outlet) => !DEPRECATED_OUTLETS.has(outlet.name));

export const SOURCE_PRESETS: SourcePreset[] = [
  {
    key: 'all',
    label: 'All Sources',
    description: `Enable all configured outlets (${OUTLET_FEEDS.length}).`,
    outletIds: OUTLET_FEEDS.map((outlet) => outlet.id)
  },
  {
    key: 'default_live',
    label: 'Default Live',
    description: 'Operational default: excludes exploratory and manual-review feeds.',
    outletIds: OUTLET_FEEDS.filter((outlet) => outlet.defaultEnabled).map((outlet) => outlet.id)
  },
  {
    key: 'verified_core',
    label: 'Verified Core',
    description: 'Most trusted core newsroom set for production monitoring.',
    outletIds: OUTLET_FEEDS
      .filter((outlet) => outlet.reviewDecision === 'verified_core' && outlet.defaultEnabled)
      .map((outlet) => outlet.id)
  },
  {
    key: 'global_core',
    label: 'Global Core',
    description: 'Wire and major international desks.',
    outletIds: PRESET_SEEDS.global_core.map((seed) => slugify(seed.name))
  },
  {
    key: 'macro_watch',
    label: 'Macro Economy',
    description: 'Markets, macroeconomics, and business desks.',
    outletIds: PRESET_SEEDS.macro_watch.map((seed) => slugify(seed.name))
  },
  {
    key: 'policy_watch',
    label: 'Policy and Elections',
    description: 'Government and policy coverage focus.',
    outletIds: PRESET_SEEDS.policy_watch.map((seed) => slugify(seed.name))
  },
  {
    key: 'tech_ai',
    label: 'Tech and AI',
    description: 'Tech, AI, and cyber coverage.',
    outletIds: PRESET_SEEDS.tech_ai.map((seed) => slugify(seed.name))
  },
  {
    key: 'startups_vc',
    label: 'Startups and VC',
    description: 'Funding, VC, and startup ecosystem watchlist.',
    outletIds: PRESET_SEEDS.startups_vc.map((seed) => slugify(seed.name))
  },
  {
    key: 'multilingual_core',
    label: 'Multilingual Country Core',
    description: 'Country-native language and portal-heavy coverage for KR/JP/RU/IT/ES/FR.',
    outletIds: PRESET_SEEDS.multilingual_core.map((seed) => slugify(seed.name))
  },
  {
    key: 'regional',
    label: 'Regional Desks',
    description: 'Asia, LATAM, Africa, and MENA coverage.',
    outletIds: PRESET_SEEDS.regional.map((seed) => slugify(seed.name))
  },
  {
    key: 'defense_intel',
    label: 'Defense and Intel',
    description: 'Defense, strategy, and think tank sources.',
    outletIds: PRESET_SEEDS.defense_intel.map((seed) => slugify(seed.name))
  }
];

export const OUTLET_BY_ID = new Map(OUTLET_FEEDS.map((o) => [o.id, o]));
export const PRESET_BY_KEY = new Map(SOURCE_PRESETS.map((preset) => [preset.key, preset]));
