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
  us_general: [
    { name: 'The New York Times', tier: 1, beat: 'world', country: 'US', rssUrl: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml' },
    { name: 'Washington Post', tier: 1, beat: 'politics', country: 'US', rssUrl: 'https://feeds.washingtonpost.com/rss/politics' },
    { name: 'Wall Street Journal', tier: 1, beat: 'business', country: 'US', rssUrl: 'https://feeds.a.dj.com/rss/RSSWorldNews.xml' },
    { name: 'USA Today', tier: 1, beat: 'world', country: 'US', rssUrl: 'http://rssfeeds.usatoday.com/UsatodaycomNation-TopStories' },
    { name: 'LA Times', tier: 1, beat: 'world', country: 'US', rssUrl: 'https://www.latimes.com/local/rss2.0.xml' },
    { name: 'CNN', tier: 2, beat: 'world', country: 'US', rssUrl: 'http://rss.cnn.com/rss/cnn_topstories.rss' },
    { name: 'Fox News', tier: 2, beat: 'world', country: 'US', rssUrl: 'http://moxie.foxnews.com/google-publisher/latest.xml' },
    { name: 'NBC News', tier: 2, beat: 'world', country: 'US', rssUrl: 'http://feeds.nbcnews.com/nbcnews/public/news' },
    { name: 'CBS News', tier: 2, beat: 'world', country: 'US', rssUrl: 'https://www.cbsnews.com/latest/rss/main' },
    { name: 'ABC News', tier: 2, beat: 'world', country: 'US', rssUrl: 'https://abcnews.go.com/abcnews/topstories' },
    { name: 'NPR', tier: 2, beat: 'world', country: 'US', rssUrl: 'https://feeds.npr.org/1001/rss.xml' },
    { name: 'AP News', tier: 1, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:apnews.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Reuters', tier: 1, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:reuters.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'HuffPost', tier: 2, beat: 'world', country: 'US', rssUrl: 'https://www.huffpost.com/section/front-page/feed' },
    { name: 'BuzzFeed News', tier: 2, beat: 'world', country: 'US', rssUrl: 'https://www.buzzfeednews.com/news.xml' },
    { name: 'Vice News', tier: 2, beat: 'world', country: 'US', rssUrl: 'https://www.vice.com/en_us/rss' },
    { name: 'Vox', tier: 2, beat: 'politics', country: 'US', rssUrl: 'https://www.vox.com/rss/index.xml' }
  ],
  us_business: [
    { name: 'Bloomberg', tier: 1, beat: 'business', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:bloomberg.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'CNBC', tier: 1, beat: 'business', country: 'US', rssUrl: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' },
    { name: 'Financial Times', tier: 1, beat: 'business', country: 'US', rssUrl: 'https://www.ft.com/?format=rss' },
    { name: 'Forbes', tier: 2, beat: 'business', country: 'US', rssUrl: 'https://www.forbes.com/most-popular/feed/' },
    { name: 'Fortune', tier: 2, beat: 'business', country: 'US', rssUrl: 'https://fortune.com/feed' },
    { name: 'Business Insider', tier: 2, beat: 'business', country: 'US', rssUrl: 'https://www.businessinsider.com/rss' },
    { name: 'MarketWatch', tier: 2, beat: 'business', country: 'US', rssUrl: 'http://feeds.marketwatch.com/marketwatch/topstories/' },
    { name: 'Barrons', tier: 2, beat: 'business', country: 'US', rssUrl: 'https://feeds.barrons.com/rss/TGW' },
    { name: 'Inc Magazine', tier: 2, beat: 'business', country: 'US', rssUrl: 'https://www.inc.com/rss.xml' },
    { name: 'Fast Company', tier: 2, beat: 'business', country: 'US', rssUrl: 'https://www.fastcompany.com/rss' }
  ],
  us_tech: [
    { name: 'TechCrunch', tier: 2, beat: 'tech', country: 'US', rssUrl: 'https://techcrunch.com/feed/' },
    { name: 'The Verge', tier: 2, beat: 'tech', country: 'US', rssUrl: 'https://www.theverge.com/rss/index.xml' },
    { name: 'Wired', tier: 2, beat: 'tech', country: 'US', rssUrl: 'https://www.wired.com/feed/rss' },
    { name: 'Ars Technica', tier: 2, beat: 'tech', country: 'US', rssUrl: 'http://feeds.arstechnica.com/arstechnica/index' },
    { name: 'Engadget', tier: 2, beat: 'tech', country: 'US', rssUrl: 'https://www.engadget.com/rss.xml' },
    { name: 'VentureBeat', tier: 2, beat: 'tech', country: 'US', rssUrl: 'https://venturebeat.com/feed/' },
    { name: 'Mashable', tier: 3, beat: 'tech', country: 'US', rssUrl: 'https://mashable.com/feed' },
    { name: 'Gizmodo', tier: 3, beat: 'tech', country: 'US', rssUrl: 'https://gizmodo.com/rss' },
    { name: 'CNET', tier: 2, beat: 'tech', country: 'US', rssUrl: 'https://www.cnet.com/rss/news/' },
    { name: 'ZDNet', tier: 2, beat: 'tech', country: 'US', rssUrl: 'https://www.zdnet.com/news/rss.xml' }
  ],
  us_politics: [
    { name: 'Politico', tier: 1, beat: 'politics', country: 'US', rssUrl: 'https://www.politico.com/rss/politicopicks.xml' },
    { name: 'The Hill', tier: 2, beat: 'politics', country: 'US', rssUrl: 'https://thehill.com/feed' },
    { name: 'Axios', tier: 2, beat: 'politics', country: 'US', rssUrl: 'https://api.axios.com/feed/' },
    { name: 'Breitbart', tier: 3, beat: 'politics', country: 'US', rssUrl: 'http://feeds.feedburner.com/breitbart' },
    { name: 'National Review', tier: 3, beat: 'politics', country: 'US', rssUrl: 'https://www.nationalreview.com/feed/' },
    { name: 'Slate', tier: 2, beat: 'politics', country: 'US', rssUrl: 'https://slate.com/feeds/all.rss' },
    { name: 'The New Yorker', tier: 2, beat: 'politics', country: 'US', rssUrl: 'https://www.newyorker.com/feed/everything' },
    { name: 'The Atlantic', tier: 2, beat: 'politics', country: 'US', rssUrl: 'https://www.theatlantic.com/feed/all/' }
  ],
  latam_argentina: [
    { name: 'Infobae', tier: 1, beat: 'world', country: 'Argentina', language: 'es', sourceType: 'local', rssUrl: 'https://www.infobae.com/arc/outboundfeeds/rss/?outputType=xml' },
    { name: 'Clarin', tier: 1, beat: 'world', country: 'Argentina', language: 'es', sourceType: 'local', rssUrl: 'https://www.clarin.com/rss/lo-ultimo/' },
    { name: 'La Nacion AR', tier: 1, beat: 'world', country: 'Argentina', language: 'es', sourceType: 'local', rssUrl: 'https://www.lanacion.com.ar/arc/outboundfeeds/rss/' },
    { name: 'Pagina12', tier: 2, beat: 'politics', country: 'Argentina', language: 'es', sourceType: 'local', rssUrl: 'https://news.google.com/rss/search?q=site:pagina12.com.ar&ceid=AR:es-419&hl=es-419&gl=AR' },
    { name: 'Ambito Financiero', tier: 2, beat: 'business', country: 'Argentina', language: 'es', sourceType: 'local', rssUrl: 'https://www.ambito.com/rss/home.xml' },
    { name: 'El Cronista', tier: 2, beat: 'business', country: 'Argentina', language: 'es', sourceType: 'local', rssUrl: 'https://www.cronista.com/files/rss/news.xml' }
  ],
  latam_chile: [
    { name: 'Emol', tier: 1, beat: 'world', country: 'Chile', language: 'es', sourceType: 'local', rssUrl: 'https://news.google.com/rss/search?q=site:emol.com&ceid=CL:es-419&hl=es-419&gl=CL' },
    { name: 'La Tercera', tier: 1, beat: 'world', country: 'Chile', language: 'es', sourceType: 'local', rssUrl: 'https://news.google.com/rss/search?q=site:latercera.com&ceid=CL:es-419&hl=es-419&gl=CL' },
    { name: 'BioBioChile', tier: 1, beat: 'world', country: 'Chile', language: 'es', sourceType: 'local', rssUrl: 'https://news.google.com/rss/search?q=site:biobiochile.cl&ceid=CL:es-419&hl=es-419&gl=CL' },
    { name: 'Cooperativa', tier: 2, beat: 'world', country: 'Chile', language: 'es', sourceType: 'local', rssUrl: 'https://news.google.com/rss/search?q=site:cooperativa.cl&ceid=CL:es-419&hl=es-419&gl=CL' },
    { name: 'Diario Financiero', tier: 2, beat: 'business', country: 'Chile', language: 'es', sourceType: 'local', rssUrl: 'https://news.google.com/rss/search?q=site:df.cl&ceid=CL:es-419&hl=es-419&gl=CL' }
  ],
  latam_uruguay: [
    { name: 'El Pais UY', tier: 1, beat: 'world', country: 'Uruguay', language: 'es', sourceType: 'local', rssUrl: 'https://news.google.com/rss/search?q=site:elpais.com.uy&ceid=UY:es-419&hl=es-419&gl=UY' },
    { name: 'El Observador', tier: 1, beat: 'world', country: 'Uruguay', language: 'es', sourceType: 'local', rssUrl: 'https://news.google.com/rss/search?q=site:elobservador.com.uy&ceid=UY:es-419&hl=es-419&gl=UY' },
    { name: 'Montevideo Portal', tier: 2, beat: 'world', country: 'Uruguay', language: 'es', sourceType: 'local', rssUrl: 'https://www.montevideo.com.uy/anxml.aspx?59' },
    { name: 'Busqueda', tier: 2, beat: 'politics', country: 'Uruguay', language: 'es', sourceType: 'local', rssUrl: 'https://news.google.com/rss/search?q=site:busqueda.com.uy&ceid=UY:es-419&hl=es-419&gl=UY' }
  ],
  us_broad_topics: [
    { name: 'Google US World Topic', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=US+world+news+when:1d&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Google US Politics Topic', tier: 2, beat: 'politics', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=US+politics+when:1d&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Google US Business Topic', tier: 2, beat: 'business', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=US+business+when:1d&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Google US Tech Topic', tier: 2, beat: 'tech', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=US+technology+when:1d&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Google California News', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=California+news+when:1d&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Google Texas News', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=Texas+news+when:1d&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Google Florida News', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=Florida+news+when:1d&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Google New York News', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=New+York+news+when:1d&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Google Illinois News', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=Illinois+news+when:1d&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Google Arizona News', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=Arizona+news+when:1d&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Google Georgia News', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=Georgia+news+when:1d&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Google Ohio News', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=Ohio+news+when:1d&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Google Pennsylvania News', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=Pennsylvania+news+when:1d&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Google Washington News', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=Washington+state+news+when:1d&ceid=US:en&hl=en-US&gl=US' }
  ],
  latam_broad_topics: [
    { name: 'Google LATAM Regional Topic', tier: 2, beat: 'world', country: 'LATAM', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=Latinoamerica+noticias+when:1d&ceid=US:es-419&hl=es-419&gl=US' },
    { name: 'Google Argentina Topic', tier: 2, beat: 'world', country: 'Argentina', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=Argentina+noticias+when:1d&ceid=AR:es-419&hl=es-419&gl=AR' },
    { name: 'Google Chile Topic', tier: 2, beat: 'world', country: 'Chile', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=Chile+noticias+when:1d&ceid=CL:es-419&hl=es-419&gl=CL' },
    { name: 'Google Uruguay Topic', tier: 2, beat: 'world', country: 'Uruguay', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=Uruguay+noticias+when:1d&ceid=UY:es-419&hl=es-419&gl=UY' },
    { name: 'Google LATAM Politics Topic', tier: 2, beat: 'politics', country: 'LATAM', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=Latinoamerica+politica+when:1d&ceid=US:es-419&hl=es-419&gl=US' },
    { name: 'Google LATAM Business Topic', tier: 2, beat: 'business', country: 'LATAM', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=Latinoamerica+economia+when:1d&ceid=US:es-419&hl=es-419&gl=US' }
  ],
  us_expansion: [
    { name: 'Boston Globe', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:bostonglobe.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Philadelphia Inquirer', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:inquirer.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Miami Herald', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:miamiherald.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Atlanta Journal-Constitution', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:ajc.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'New York Post', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:nypost.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Chicago Tribune', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:chicagotribune.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Detroit Free Press', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:freep.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Star Tribune', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:startribune.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Cleveland Plain Dealer', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:cleveland.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Houston Chronicle', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:houstonchronicle.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Dallas Morning News', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:dallasnews.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Austin American-Statesman', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:statesman.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Tampa Bay Times', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:tampabay.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'San Francisco Chronicle', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:sfchronicle.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Seattle Times', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:seattletimes.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Denver Post', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:denverpost.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'San Jose Mercury News', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:mercurynews.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Las Vegas Review-Journal', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:reviewjournal.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'San Diego Union-Tribune', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:sandiegouniontribune.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Honolulu Star-Advertiser', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:staradvertiser.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Variety', tier: 2, beat: 'business', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:variety.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'The Hollywood Reporter', tier: 2, beat: 'business', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:hollywoodreporter.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Deadline', tier: 2, beat: 'business', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:deadline.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Rolling Stone', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:rollingstone.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Billboard', tier: 2, beat: 'business', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:billboard.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Vulture', tier: 3, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:vulture.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Vanity Fair', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:vanityfair.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Esquire', tier: 3, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:esquire.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'GQ', tier: 3, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:gq.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'People', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:people.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Scientific American', tier: 2, beat: 'tech', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:scientificamerican.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'National Geographic', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:nationalgeographic.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'STAT News', tier: 2, beat: 'business', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:statnews.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'WebMD', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:webmd.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Space.com', tier: 2, beat: 'tech', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:space.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'ESPN', tier: 2, beat: 'business', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:espn.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Sports Illustrated', tier: 2, beat: 'business', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:si.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Bleacher Report', tier: 2, beat: 'business', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:bleacherreport.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'The Athletic', tier: 2, beat: 'business', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:theathletic.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'CBS Sports', tier: 2, beat: 'business', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:cbssports.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'The Daily Beast', tier: 2, beat: 'politics', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:thedailybeast.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Mother Jones', tier: 2, beat: 'politics', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:motherjones.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'ProPublica', tier: 2, beat: 'politics', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:propublica.org&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Reason', tier: 3, beat: 'politics', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:reason.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Jacobin', tier: 3, beat: 'politics', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:jacobin.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Quartz', tier: 2, beat: 'business', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:qz.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'The Intercept', tier: 2, beat: 'politics', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:theintercept.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Complex', tier: 3, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:complex.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Refinery29', tier: 3, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:refinery29.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Newsweek', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:newsweek.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Time', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:time.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'PBS NewsHour', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:pbs.org/newshour&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Christian Science Monitor', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:csmonitor.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Semafor', tier: 2, beat: 'business', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:semafor.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Scripps News', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:scrippsnews.com&ceid=US:en&hl=en-US&gl=US' }
  ],
  latam_expansion: [
    { name: 'MinutoUno', tier: 2, beat: 'world', country: 'Argentina', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:minutouno.com&ceid=AR:es-419&hl=es-419&gl=AR' },
    { name: 'El Destape', tier: 2, beat: 'politics', country: 'Argentina', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:eldestapeweb.com&ceid=AR:es-419&hl=es-419&gl=AR' },
    { name: 'La Politica Online', tier: 2, beat: 'politics', country: 'Argentina', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:lapoliticaonline.com&ceid=AR:es-419&hl=es-419&gl=AR' },
    { name: 'Chequeado', tier: 2, beat: 'politics', country: 'Argentina', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:chequeado.com&ceid=AR:es-419&hl=es-419&gl=AR' },
    { name: 'TN Argentina', tier: 2, beat: 'world', country: 'Argentina', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:tn.com.ar&ceid=AR:es-419&hl=es-419&gl=AR' },
    { name: 'C5N Argentina', tier: 2, beat: 'world', country: 'Argentina', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:c5n.com&ceid=AR:es-419&hl=es-419&gl=AR' },
    { name: 'America TV AR', tier: 2, beat: 'world', country: 'Argentina', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:a24.com&ceid=AR:es-419&hl=es-419&gl=AR' },
    { name: 'La Voz del Interior', tier: 2, beat: 'world', country: 'Argentina', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:lavoz.com.ar&ceid=AR:es-419&hl=es-419&gl=AR' },
    { name: 'Los Andes', tier: 2, beat: 'world', country: 'Argentina', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:losandes.com.ar&ceid=AR:es-419&hl=es-419&gl=AR' },
    { name: 'La Capital Rosario', tier: 2, beat: 'world', country: 'Argentina', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:lacapital.com.ar&ceid=AR:es-419&hl=es-419&gl=AR' },
    { name: 'El Tribuno', tier: 2, beat: 'world', country: 'Argentina', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:eltribuno.com&ceid=AR:es-419&hl=es-419&gl=AR' },
    { name: 'Ole', tier: 2, beat: 'business', country: 'Argentina', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:ole.com.ar&ceid=AR:es-419&hl=es-419&gl=AR' },
    { name: 'BAE Negocios', tier: 2, beat: 'business', country: 'Argentina', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:baenegocios.com&ceid=AR:es-419&hl=es-419&gl=AR' },
    { name: 'Perfil', tier: 2, beat: 'world', country: 'Argentina', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:perfil.com&ceid=AR:es-419&hl=es-419&gl=AR' },
    { name: 'iProfesional', tier: 2, beat: 'business', country: 'Argentina', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:iprofesional.com&ceid=AR:es-419&hl=es-419&gl=AR' },
    { name: 'El Mostrador', tier: 2, beat: 'politics', country: 'Chile', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:elmostrador.cl&ceid=CL:es-419&hl=es-419&gl=CL' },
    { name: 'The Clinic Chile', tier: 2, beat: 'politics', country: 'Chile', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:theclinic.cl&ceid=CL:es-419&hl=es-419&gl=CL' },
    { name: 'El Desconcierto', tier: 2, beat: 'politics', country: 'Chile', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:eldesconcierto.cl&ceid=CL:es-419&hl=es-419&gl=CL' },
    { name: 'CNN Chile', tier: 2, beat: 'world', country: 'Chile', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:cnnchile.com&ceid=CL:es-419&hl=es-419&gl=CL' },
    { name: '24 Horas Chile', tier: 2, beat: 'world', country: 'Chile', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:24horas.cl&ceid=CL:es-419&hl=es-419&gl=CL' },
    { name: 'T13 Chile', tier: 2, beat: 'world', country: 'Chile', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:t13.cl&ceid=CL:es-419&hl=es-419&gl=CL' },
    { name: 'Meganoticias', tier: 2, beat: 'world', country: 'Chile', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:meganoticias.cl&ceid=CL:es-419&hl=es-419&gl=CL' },
    { name: 'Pulso Chile', tier: 2, beat: 'business', country: 'Chile', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:pulso.cl&ceid=CL:es-419&hl=es-419&gl=CL' },
    { name: 'El Sur Chile', tier: 2, beat: 'world', country: 'Chile', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:elsur.cl&ceid=CL:es-419&hl=es-419&gl=CL' },
    { name: 'La Discusion', tier: 2, beat: 'world', country: 'Chile', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:ladiscusion.cl&ceid=CL:es-419&hl=es-419&gl=CL' },
    { name: 'El Mercurio CL', tier: 2, beat: 'world', country: 'Chile', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:elmercurio.com&ceid=CL:es-419&hl=es-419&gl=CL' },
    { name: 'Pauta', tier: 2, beat: 'business', country: 'Chile', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:pauta.cl&ceid=CL:es-419&hl=es-419&gl=CL' },
    { name: 'La Diaria', tier: 2, beat: 'world', country: 'Uruguay', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:ladiaria.com.uy&ceid=UY:es-419&hl=es-419&gl=UY' },
    { name: 'Brecha', tier: 2, beat: 'politics', country: 'Uruguay', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:brecha.com.uy&ceid=UY:es-419&hl=es-419&gl=UY' },
    { name: 'La Republica UY', tier: 2, beat: 'world', country: 'Uruguay', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:republica.com.uy&ceid=UY:es-419&hl=es-419&gl=UY' },
    { name: 'Subrayado', tier: 2, beat: 'world', country: 'Uruguay', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:subrayado.com.uy&ceid=UY:es-419&hl=es-419&gl=UY' },
    { name: 'Telemundo UY', tier: 2, beat: 'world', country: 'Uruguay', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:teledoce.com&ceid=UY:es-419&hl=es-419&gl=UY' },
    { name: 'Telenoche UY', tier: 2, beat: 'world', country: 'Uruguay', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=telenoche+uruguay&ceid=UY:es-419&hl=es-419&gl=UY' },
    { name: 'UyPress', tier: 2, beat: 'world', country: 'Uruguay', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:uypress.net&ceid=UY:es-419&hl=es-419&gl=UY' },
    { name: 'Canal 10 UY', tier: 2, beat: 'world', country: 'Uruguay', language: 'es', sourceType: 'portal', rssUrl: 'https://news.google.com/rss/search?q=site:canal10.com.uy&ceid=UY:es-419&hl=es-419&gl=UY' },
    { name: 'Reuters Argentina Desk', tier: 2, beat: 'world', country: 'Argentina', language: 'en', sourceType: 'global', rssUrl: 'https://news.google.com/rss/search?q=Argentina+site:reuters.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'AP Argentina Desk', tier: 2, beat: 'world', country: 'Argentina', language: 'en', sourceType: 'global', rssUrl: 'https://news.google.com/rss/search?q=Argentina+site:apnews.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Reuters Chile Desk', tier: 2, beat: 'world', country: 'Chile', language: 'en', sourceType: 'global', rssUrl: 'https://news.google.com/rss/search?q=Chile+site:reuters.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'AP Chile Desk', tier: 2, beat: 'world', country: 'Chile', language: 'en', sourceType: 'global', rssUrl: 'https://news.google.com/rss/search?q=Chile+OR+Santiago+site:apnews.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'Reuters Uruguay Desk', tier: 2, beat: 'world', country: 'Uruguay', language: 'en', sourceType: 'global', rssUrl: 'https://news.google.com/rss/search?q=Uruguay+site:reuters.com&ceid=US:en&hl=en-US&gl=US' },
    { name: 'AP Uruguay Desk', tier: 2, beat: 'world', country: 'Uruguay', language: 'en', sourceType: 'global', rssUrl: 'https://news.google.com/rss/search?q=Uruguay+site:apnews.com&ceid=US:en&hl=en-US&gl=US' }
  ]
};

const US_STATE_NAMES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia',
  'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland',
  'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey',
  'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina',
  'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'
];

const US_STATE_TOPIC_SEEDS: OutletSeed[] = US_STATE_NAMES.flatMap((state) => ([
  {
    name: `Google State: ${state}`,
    tier: 2,
    beat: 'politics',
    country: 'US',
    sourceType: 'portal',
    rssUrl: `https://news.google.com/rss/search?q=${encodeURIComponent(`${state} politics policy when:1d`)}&ceid=US:en&hl=en-US&gl=US`
  },
  {
    name: `Bing State: ${state}`,
    tier: 2,
    beat: 'business',
    country: 'US',
    sourceType: 'portal',
    rssUrl: `https://www.bing.com/news/search?q=${encodeURIComponent(`${state} business economy`)}&format=RSS&setlang=en-us`
  }
]));

const US_BING_TOPIC_SEEDS: OutletSeed[] = [
  { name: 'Bing US Politics Topic', tier: 2, beat: 'politics', country: 'US', sourceType: 'portal', rssUrl: 'https://www.bing.com/news/search?q=US+politics&format=RSS&setlang=en-us' },
  { name: 'Bing US Business Topic', tier: 2, beat: 'business', country: 'US', sourceType: 'portal', rssUrl: 'https://www.bing.com/news/search?q=US+business&format=RSS&setlang=en-us' },
  { name: 'Bing US Tech Topic', tier: 2, beat: 'tech', country: 'US', sourceType: 'portal', rssUrl: 'https://www.bing.com/news/search?q=US+technology&format=RSS&setlang=en-us' },
  { name: 'Bing US World Topic', tier: 2, beat: 'world', country: 'US', sourceType: 'portal', rssUrl: 'https://www.bing.com/news/search?q=US+world+news&format=RSS&setlang=en-us' }
];

const LATAM_BING_TOPIC_SEEDS: OutletSeed[] = [
  { name: 'Bing LATAM Topic', tier: 2, beat: 'world', country: 'LATAM', language: 'es', sourceType: 'portal', rssUrl: 'https://www.bing.com/news/search?q=Latinoamerica+noticias&format=RSS&setlang=es' },
  { name: 'Bing Argentina Topic', tier: 2, beat: 'world', country: 'Argentina', language: 'es', sourceType: 'portal', rssUrl: 'https://www.bing.com/news/search?q=Argentina+noticias&format=RSS&setlang=es' },
  { name: 'Bing Chile Topic', tier: 2, beat: 'world', country: 'Chile', language: 'es', sourceType: 'portal', rssUrl: 'https://www.bing.com/news/search?q=Chile+noticias&format=RSS&setlang=es' },
  { name: 'Bing Uruguay Topic', tier: 2, beat: 'world', country: 'Uruguay', language: 'es', sourceType: 'portal', rssUrl: 'https://www.bing.com/news/search?q=Uruguay+noticias&format=RSS&setlang=es' },
  { name: 'Bing LATAM Politics Topic', tier: 2, beat: 'politics', country: 'LATAM', language: 'es', sourceType: 'portal', rssUrl: 'https://www.bing.com/news/search?q=Latinoamerica+politica&format=RSS&setlang=es' },
  { name: 'Bing LATAM Business Topic', tier: 2, beat: 'business', country: 'LATAM', language: 'es', sourceType: 'portal', rssUrl: 'https://www.bing.com/news/search?q=Latinoamerica+economia&format=RSS&setlang=es' }
];

const US_METRO_NAMES = [
  'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego', 'Dallas',
  'San Jose', 'Austin', 'Jacksonville', 'Fort Worth', 'Columbus', 'Charlotte', 'San Francisco', 'Indianapolis',
  'Seattle', 'Denver', 'Washington DC', 'Boston', 'El Paso', 'Nashville', 'Detroit', 'Oklahoma City', 'Portland',
  'Las Vegas', 'Memphis', 'Louisville', 'Baltimore', 'Milwaukee', 'Albuquerque', 'Tucson', 'Fresno', 'Sacramento',
  'Kansas City', 'Atlanta', 'Miami', 'Cleveland', 'Raleigh', 'Omaha', 'Minneapolis', 'Tulsa', 'Arlington',
  'Tampa', 'New Orleans', 'Wichita', 'Bakersfield', 'Aurora', 'Honolulu'
];

const US_METRO_TOPIC_SEEDS: OutletSeed[] = US_METRO_NAMES.flatMap((metro) => ([
  {
    name: `Google Metro: ${metro}`,
    tier: 2,
    beat: 'business',
    country: 'US',
    sourceType: 'portal',
    rssUrl: `https://news.google.com/rss/search?q=${encodeURIComponent(`${metro} economy business when:1d`)}&ceid=US:en&hl=en-US&gl=US`
  },
  {
    name: `Bing Metro: ${metro}`,
    tier: 2,
    beat: 'tech',
    country: 'US',
    sourceType: 'portal',
    rssUrl: `https://www.bing.com/news/search?q=${encodeURIComponent(`${metro} technology startups ai`)}&format=RSS&setlang=en-us`
  }
]));

const US_TOPIC_VARIANTS: Array<{ key: string; beat: OutletFeed['beat']; q: string; provider: 'google' | 'bing' }> = [
  { key: 'policy-election', beat: 'politics', q: 'US elections policy latest', provider: 'google' },
  { key: 'congress-senate', beat: 'politics', q: 'US congress senate house latest', provider: 'bing' },
  { key: 'markets-macro', beat: 'business', q: 'US markets inflation rates latest', provider: 'google' },
  { key: 'earnings-corporate', beat: 'business', q: 'US earnings corporate results latest', provider: 'bing' },
  { key: 'ai-startups', beat: 'tech', q: 'US AI startups funding latest', provider: 'google' },
  { key: 'cyber-cloud', beat: 'tech', q: 'US cybersecurity cloud enterprise latest', provider: 'bing' },
  { key: 'breaking-national', beat: 'world', q: 'US breaking national news', provider: 'google' },
  { key: 'regional-watch', beat: 'world', q: 'United States regional news latest', provider: 'bing' }
];

const US_TOPIC_VARIANT_SEEDS: OutletSeed[] = US_TOPIC_VARIANTS.map((variant) => {
  const name = `${variant.provider === 'google' ? 'Google' : 'Bing'} US Variant: ${variant.key}`;
  const rssUrl = variant.provider === 'google'
    ? `https://news.google.com/rss/search?q=${encodeURIComponent(`${variant.q} when:1d`)}&ceid=US:en&hl=en-US&gl=US`
    : `https://www.bing.com/news/search?q=${encodeURIComponent(variant.q)}&format=RSS&setlang=en-us`;
  return {
    name,
    tier: 2,
    beat: variant.beat,
    country: 'US',
    sourceType: 'portal',
    rssUrl
  };
});

const US_LATAM_FOCUS_VARIANTS: Array<{ key: string; beat: OutletFeed['beat']; q: string; provider: 'google' | 'bing' }> = [
  { key: 'latam-politics-us-desk', beat: 'politics', q: 'Argentina Chile Uruguay politics US coverage', provider: 'google' },
  { key: 'latam-economy-us-desk', beat: 'business', q: 'Argentina Chile Uruguay economy markets US', provider: 'google' },
  { key: 'latam-trade-us-desk', beat: 'business', q: 'LATAM trade tariffs exports imports US', provider: 'bing' },
  { key: 'latam-energy-us-desk', beat: 'business', q: 'LATAM energy oil gas lithium US', provider: 'google' },
  { key: 'latam-finance-us-desk', beat: 'business', q: 'LATAM central bank inflation currency', provider: 'bing' },
  { key: 'latam-tech-us-desk', beat: 'tech', q: 'LATAM startups AI technology venture capital', provider: 'google' },
  { key: 'latam-cyber-us-desk', beat: 'tech', q: 'LATAM cybersecurity telecom cloud', provider: 'bing' },
  { key: 'argentina-elections-us', beat: 'politics', q: 'Argentina election congress senate latest', provider: 'google' },
  { key: 'chile-politics-us', beat: 'politics', q: 'Chile government congress reform latest', provider: 'bing' },
  { key: 'uruguay-politics-us', beat: 'politics', q: 'Uruguay government policy elections latest', provider: 'google' },
  { key: 'argentina-markets-us', beat: 'business', q: 'Argentina stocks bonds peso inflation', provider: 'bing' },
  { key: 'chile-markets-us', beat: 'business', q: 'Chile copper markets inflation rates', provider: 'google' },
  { key: 'uruguay-markets-us', beat: 'business', q: 'Uruguay economy inflation markets exports', provider: 'bing' },
  { key: 'mercosur-business-us', beat: 'business', q: 'Mercosur business economy supply chain', provider: 'google' },
  { key: 'andes-mining-us', beat: 'business', q: 'Andes mining lithium copper business', provider: 'bing' },
  { key: 'southern-cone-security-us', beat: 'politics', q: 'Southern Cone diplomacy defense policy', provider: 'google' },
];

const US_LATAM_FOCUS_SEEDS: OutletSeed[] = US_LATAM_FOCUS_VARIANTS.map((variant) => {
  const name = `${variant.provider === 'google' ? 'Google' : 'Bing'} US LATAM Focus: ${variant.key}`;
  const rssUrl = variant.provider === 'google'
    ? `https://news.google.com/rss/search?q=${encodeURIComponent(`${variant.q} when:1d`)}&ceid=US:en&hl=en-US&gl=US`
    : `https://www.bing.com/news/search?q=${encodeURIComponent(variant.q)}&format=RSS&setlang=en-us`;
  return {
    name,
    tier: 2,
    beat: variant.beat,
    country: 'US',
    sourceType: 'portal',
    rssUrl
  };
});

const LATAM_COUNTRY_TOPIC_VARIANTS: Array<{ country: 'Argentina' | 'Chile' | 'Uruguay'; lang: string; beat: OutletFeed['beat']; q: string }> = [
  { country: 'Argentina', lang: 'es', beat: 'politics', q: 'Argentina politica hoy' },
  { country: 'Argentina', lang: 'es', beat: 'business', q: 'Argentina economia hoy' },
  { country: 'Argentina', lang: 'es', beat: 'world', q: 'Argentina sociedad hoy' },
  { country: 'Chile', lang: 'es', beat: 'politics', q: 'Chile politica hoy' },
  { country: 'Chile', lang: 'es', beat: 'business', q: 'Chile economia hoy' },
  { country: 'Chile', lang: 'es', beat: 'world', q: 'Chile sociedad hoy' },
  { country: 'Uruguay', lang: 'es', beat: 'politics', q: 'Uruguay politica hoy' },
  { country: 'Uruguay', lang: 'es', beat: 'business', q: 'Uruguay economia hoy' },
  { country: 'Uruguay', lang: 'es', beat: 'world', q: 'Uruguay sociedad hoy' }
];

const LATAM_DETAIL_TOPIC_SEEDS: OutletSeed[] = LATAM_COUNTRY_TOPIC_VARIANTS.flatMap((variant) => {
  const googleName = `Google ${variant.country} Detail: ${variant.beat}`;
  const bingName = `Bing ${variant.country} Detail: ${variant.beat}`;
  const googleRss = `https://news.google.com/rss/search?q=${encodeURIComponent(`${variant.q} when:1d`)}&ceid=${variant.country === 'Argentina' ? 'AR' : variant.country === 'Chile' ? 'CL' : 'UY'}:es-419&hl=es-419&gl=${variant.country === 'Argentina' ? 'AR' : variant.country === 'Chile' ? 'CL' : 'UY'}`;
  const bingRss = `https://www.bing.com/news/search?q=${encodeURIComponent(variant.q)}&format=RSS&setlang=es`;
  return [
    {
      name: googleName,
      tier: 2,
      beat: variant.beat,
      country: variant.country,
      language: variant.lang,
      sourceType: 'portal',
      rssUrl: googleRss
    },
    {
      name: bingName,
      tier: 2,
      beat: variant.beat,
      country: variant.country,
      language: variant.lang,
      sourceType: 'portal',
      rssUrl: bingRss
    }
  ];
});

const SITEMAP_BOOSTERS: OutletSeed[] = [
  { name: 'The New York Times', tier: 1, beat: 'world', country: 'US', sitemapUrl: 'https://www.nytimes.com/sitemaps/new/news.xml' },
  { name: 'LA Times', tier: 1, beat: 'world', country: 'US', sitemapUrl: 'https://www.latimes.com/sitemaps/news-sitemap.xml' },
  { name: 'CNBC', tier: 1, beat: 'business', country: 'US', sitemapUrl: 'https://www.cnbc.com/sitemap_news.xml' },
  { name: 'Fox News', tier: 2, beat: 'world', country: 'US', sitemapUrl: 'https://www.foxnews.com/sitemap.xml' },
  { name: 'NPR', tier: 2, beat: 'world', country: 'US', sitemapUrl: 'https://www.npr.org/sitemaps/sitemap-index.xml' },
  { name: 'Infobae', tier: 1, beat: 'world', country: 'Argentina', language: 'es', sourceType: 'local', sitemapUrl: 'https://www.infobae.com/sitemap-news.xml' },
  { name: 'La Nacion AR', tier: 1, beat: 'world', country: 'Argentina', language: 'es', sourceType: 'local', sitemapUrl: 'https://www.lanacion.com.ar/arc/outboundfeeds/sitemap-index/?outputType=xml' },
  { name: 'Emol', tier: 1, beat: 'world', country: 'Chile', language: 'es', sourceType: 'local', sitemapUrl: 'https://www.emol.com/sitemap.xml' },
  { name: 'El Pais UY', tier: 1, beat: 'world', country: 'Uruguay', language: 'es', sourceType: 'local', sitemapUrl: 'https://www.elpais.com.uy/sitemap.xml' }
];

PRESET_SEEDS.us_state_topics = US_STATE_TOPIC_SEEDS;
PRESET_SEEDS.us_bing_topics = US_BING_TOPIC_SEEDS;
PRESET_SEEDS.latam_bing_topics = LATAM_BING_TOPIC_SEEDS;
PRESET_SEEDS.us_metro_topics = US_METRO_TOPIC_SEEDS;
PRESET_SEEDS.us_topic_variants = US_TOPIC_VARIANT_SEEDS;
PRESET_SEEDS.us_latam_focus = US_LATAM_FOCUS_SEEDS;
PRESET_SEEDS.latam_detail_topics = LATAM_DETAIL_TOPIC_SEEDS;
PRESET_SEEDS.sitemap_boosters = SITEMAP_BOOSTERS;

const CATEGORY_ALIAS: Record<string, OutletFeed['categories'][number]> = {
  us_general: 'global',
  us_business: 'business',
  us_tech: 'tech',
  us_politics: 'politics',
  latam_argentina: 'world',
  latam_chile: 'world',
  latam_uruguay: 'world',
  us_broad_topics: 'world',
  latam_broad_topics: 'world',
  us_state_topics: 'world',
  us_bing_topics: 'world',
  latam_bing_topics: 'world',
  us_metro_topics: 'world',
  us_topic_variants: 'world',
  us_latam_focus: 'world',
  latam_detail_topics: 'world',
  sitemap_boosters: 'world',
  us_expansion: 'world',
  latam_expansion: 'world'
};

const ALL_EXPANSION_SOURCE_NAMES = new Set([
  ...PRESET_SEEDS.us_expansion.map((seed) => seed.name),
  ...PRESET_SEEDS.latam_expansion.map((seed) => seed.name)
]);

const PROMOTED_EXPANSION = new Set<string>([
  '24 Horas Chile',
  'America TV AR',
  'Atlanta Journal-Constitution',
  'BAE Negocios',
  'Billboard',
  'Bleacher Report',
  'Boston Globe',
  'Brecha',
  'C5N Argentina',
  'CBS Sports',
  'Chicago Tribune',
  'Christian Science Monitor',
  'Cleveland Plain Dealer',
  'CNN Chile',
  'Complex',
  'Dallas Morning News',
  'Deadline',
  'Denver Post',
  'Detroit Free Press',
  'El Desconcierto',
  'El Destape',
  'El Mostrador',
  'El Tribuno',
  'ESPN',
  'Esquire',
  'GQ',
  'Honolulu Star-Advertiser',
  'iProfesional',
  'La Capital Rosario',
  'La Discusion',
  'La Politica Online',
  'La Voz del Interior',
  'Los Andes',
  'Meganoticias',
  'Miami Herald',
  'MinutoUno',
  'New York Post',
  'Newsweek',
  'Ole',
  'Pauta',
  'PBS NewsHour',
  'People',
  'Perfil',
  'Philadelphia Inquirer',
  'ProPublica',
  'Quartz',
  'Reason',
  'Refinery29',
  'Rolling Stone',
  'San Diego Union-Tribune',
  'San Francisco Chronicle',
  'San Jose Mercury News',
  'Scripps News',
  'Seattle Times',
  'Semafor',
  'Space.com',
  'Sports Illustrated',
  'Star Tribune',
  'STAT News',
  'Subrayado',
  'T13 Chile',
  'Tampa Bay Times',
  'Telemundo UY',
  'Telenoche UY',
  'The Clinic Chile',
  'The Daily Beast',
  'The Hollywood Reporter',
  'TN Argentina',
  'Reuters Argentina Desk',
  'AP Argentina Desk',
  'Reuters Chile Desk',
  'AP Chile Desk',
  'Reuters Uruguay Desk',
  'AP Uruguay Desk',
  'Variety',
  'Vulture',
]);

const EXPLORATORY_OFF_BY_DEFAULT = new Set(
  [...ALL_EXPANSION_SOURCE_NAMES].filter((name) => !PROMOTED_EXPANSION.has(name))
);

function getReviewDecision(seed: OutletSeed): OutletFeed['reviewDecision'] {
  if (EXPLORATORY_OFF_BY_DEFAULT.has(seed.name)) return 'exploratory_off_by_default';
  if (seed.tier === 1) return 'verified_core';
  return 'keep_secondary';
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
        if (!existing.rssUrl && seed.rssUrl) existing.rssUrl = seed.rssUrl;
        if (!existing.sitemapUrl && seed.sitemapUrl) existing.sitemapUrl = seed.sitemapUrl;
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
        reviewDecision: getReviewDecision(seed),
        defaultEnabled: !EXPLORATORY_OFF_BY_DEFAULT.has(seed.name),
        country: seed.country,
        rssUrl: seed.rssUrl,
        sitemapUrl: seed.sitemapUrl
      });
    }
  }

  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export const OUTLET_FEEDS: OutletFeed[] = buildOutlets();

const LATAM_SEEDS = [
  ...PRESET_SEEDS.latam_argentina,
  ...PRESET_SEEDS.latam_chile,
  ...PRESET_SEEDS.latam_uruguay,
  ...PRESET_SEEDS.latam_broad_topics,
  ...PRESET_SEEDS.latam_bing_topics,
  ...PRESET_SEEDS.latam_detail_topics,
  ...PRESET_SEEDS.latam_expansion
];

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
    description: 'Operational default: verified_core + keep_secondary (expansion candidates OFF).',
    outletIds: OUTLET_FEEDS.filter((outlet) => outlet.defaultEnabled).map((outlet) => outlet.id)
  },
  {
    key: 'verified_core',
    label: 'Verified Core',
    description: 'Tier 1 major newsrooms and wires.',
    outletIds: OUTLET_FEEDS
      .filter((outlet) => outlet.reviewDecision === 'verified_core')
      .map((outlet) => outlet.id)
  },
  {
    key: 'global_core',
    label: 'US National General',
    description: 'US national desks and major broadcasters.',
    outletIds: PRESET_SEEDS.us_general.map((seed) => slugify(seed.name))
  },
  {
    key: 'macro_watch',
    label: 'US Business & Finance',
    description: 'US business and macro outlets.',
    outletIds: PRESET_SEEDS.us_business.map((seed) => slugify(seed.name))
  },
  {
    key: 'policy_watch',
    label: 'US Politics',
    description: 'US politics and long-form policy outlets.',
    outletIds: PRESET_SEEDS.us_politics.map((seed) => slugify(seed.name))
  },
  {
    key: 'tech_ai',
    label: 'US Tech & Science',
    description: 'US technology and science outlets.',
    outletIds: PRESET_SEEDS.us_tech.map((seed) => slugify(seed.name))
  },
  {
    key: 'multilingual_core',
    label: 'LATAM Core',
    description: 'Spanish-language core outlets in AR/CL/UY.',
    outletIds: [
      ...PRESET_SEEDS.latam_argentina,
      ...PRESET_SEEDS.latam_chile,
      ...PRESET_SEEDS.latam_uruguay
    ].map((seed) => slugify(seed.name))
  },
  {
    key: 'regional',
    label: 'LATAM Regional',
    description: 'Argentina, Chile, and Uruguay regional coverage.',
    outletIds: LATAM_SEEDS.map((seed) => slugify(seed.name))
  },
  {
    key: 'broad_capture_us',
    label: 'US Broad Capture',
    description: 'Google broad topic/state capture feeds for volume.',
    outletIds: [
      ...PRESET_SEEDS.us_broad_topics,
      ...PRESET_SEEDS.us_state_topics,
      ...PRESET_SEEDS.us_bing_topics,
      ...PRESET_SEEDS.us_metro_topics,
      ...PRESET_SEEDS.us_topic_variants,
      ...PRESET_SEEDS.us_latam_focus
    ].map((seed) => slugify(seed.name))
  },
  {
    key: 'broad_capture_latam',
    label: 'LATAM Broad Capture',
    description: 'Google regional topic feeds for LATAM volume.',
    outletIds: [
      ...PRESET_SEEDS.latam_broad_topics,
      ...PRESET_SEEDS.latam_bing_topics,
      ...PRESET_SEEDS.latam_detail_topics
    ].map((seed) => slugify(seed.name))
  },
  {
    key: 'sitemap_boosters',
    label: 'Sitemap Boosters',
    description: 'RSS+sitemap dual-path feeds for higher recall.',
    outletIds: PRESET_SEEDS.sitemap_boosters.map((seed) => slugify(seed.name))
  },
  {
    key: 'us_expansion_candidates',
    label: 'US Expansion Candidates',
    description: 'US Top-100 expansion candidates (default OFF until verified).',
    outletIds: PRESET_SEEDS.us_expansion.map((seed) => slugify(seed.name))
  },
  {
    key: 'latam_expansion_candidates',
    label: 'LATAM Expansion Candidates',
    description: 'LATAM Top-50 expansion candidates (default OFF until verified).',
    outletIds: PRESET_SEEDS.latam_expansion.map((seed) => slugify(seed.name))
  },
  {
    key: 'defense_intel',
    label: 'US Political Analysis',
    description: 'Policy-heavy analysis subset.',
    outletIds: [
      'politico',
      'the-hill',
      'axios',
      'national-review',
      'the-new-yorker',
      'the-atlantic',
      'propublica',
      'mother-jones'
    ]
  }
];

export const OUTLET_BY_ID = new Map(OUTLET_FEEDS.map((o) => [o.id, o]));
export const PRESET_BY_KEY = new Map(SOURCE_PRESETS.map((preset) => [preset.key, preset]));
