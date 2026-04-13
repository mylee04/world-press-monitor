import { isBlackPressHost, isVillageMediaHost } from './canada-network-groups';

function safeParseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function trimTrailingSlashes(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

const VILLAGE_MEDIA_NON_ARTICLE_PATH_PATTERN = /^\/(?:classifieds|contests|events|flyers|newsletters?|obituaries|weather)(?:\/|$)/;
const BLACK_PRESS_NON_ARTICLE_PATH_PATTERN = /^\/(?:classifieds|contests|crossword|e-edition|events|flyers|horoscope|obituaries|weather)(?:\/|$)/;
const POLSKA_PRESS_REGIONAL_HOST_PATTERN =
  /(?:^|\.)(?:gazetakrakowska|dziennikzachodni|gazetawroclawska|gloswielkopolski|dziennikbaltycki|kurierlubelski|expressilustrowany|dzienniklodzki|echodnia|nowiny24|poranny)\.(?:pl|eu)$/;
const POLSKA_PRESS_SOFT_CATEGORY_PATH_PATTERN = /\/ar\/c(?:6|7|8|9|11|13|14|17)-\d+/;

function isPolskaPressRegionalHost(hostname: string): boolean {
  return POLSKA_PRESS_REGIONAL_HOST_PATTERN.test(hostname);
}

export function isKnownNonArticleUrl(source: string, url: string): boolean {
  const parsed = safeParseUrl(url);
  if (!parsed) return false;

  const hostname = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname.toLowerCase();
  const trimmedPathname = trimTrailingSlashes(pathname);
  const normalizedSource = (source || '').toLowerCase();

  if (/^\/(?:annoncoerbetaltindhold|advertorials?|sisuturundus)(?:\/|$)/.test(pathname)) {
    return true;
  }

  if (hostname === 'acento.com.do' && normalizedSource.includes('acento')) {
    if (pathname.startsWith('/seccion/')) return true;
    if (pathname.startsWith('/tags/')) return true;
    if (pathname.startsWith('/resources/')) return true;
  }

  if (hostname.endsWith('pptvhd36.com') && pathname.startsWith('/tags/')) {
    return true;
  }

  if (hostname.endsWith('liputan6.com') && pathname.startsWith('/tag/')) {
    return true;
  }

  if (hostname.endsWith('merdeka.com') && pathname.startsWith('/tag/')) {
    return true;
  }

  if (hostname.endsWith('grupormultimedio.com') && pathname.startsWith('/tag/')) {
    return true;
  }

  if (hostname.endsWith('grupormultimedio.com') && /^\/author\/[^/]+\/?$/.test(pathname)) {
    return true;
  }

  if (hostname.endsWith('nepszava.hu') && pathname.startsWith('/tag/')) {
    return true;
  }

  if (hostname.endsWith('teledoce.com') && pathname.startsWith('/tag/')) {
    return true;
  }

  if (hostname.endsWith('ciperchile.cl') && pathname.startsWith('/tag/')) {
    return true;
  }

  if (hostname.endsWith('ciperchile.cl') && /^\/category\/[^/]+\/?$/.test(pathname)) {
    return true;
  }

  if (hostname.endsWith('ciperchile.cl') && /^\/author\/[^/]+\/?$/.test(pathname)) {
    return true;
  }

  if (hostname.endsWith('delo.si') && pathname.startsWith('/tag/')) {
    return true;
  }

  if (hostname.endsWith('campo.dk')) {
    if (trimmedPathname === '/nyheder') return true;
    if (pathname.startsWith('/club/')) return true;
    if (pathname.startsWith('/player/')) return true;
    if (pathname.startsWith('/staff/')) return true;
    if (pathname.startsWith('/tag/')) return true;
    if (pathname.startsWith('/type/')) return true;
    if (pathname.startsWith('/turneringer/')) return true;
    if (pathname.startsWith('/liga/')) return true;
  }

  if (hostname.endsWith('denoffentlige.dk') && /^\/[^/]+\/?$/.test(trimmedPathname)) {
    return true;
  }

  if (hostname.endsWith('dagens.dk') || hostname.endsWith('nyheder24.dk')) {
    if (/^\/skribent\/[^/]+\/?$/.test(trimmedPathname)) return true;
    if (/^\/[^/]+\/?$/.test(trimmedPathname)) return true;
  }

  if (hostname.endsWith('alt.dk') && pathname.startsWith('/sponsored/')) {
    return true;
  }

  if (hostname.endsWith('journalisten.dk') && pathname.startsWith('/jobannoncer/')) {
    return true;
  }

  if (hostname.endsWith('dinavis.dk')) {
    if (pathname.startsWith('/arkiv/')) return true;
    if (pathname.startsWith('/direkte/')) return true;
  }

  if (hostname.endsWith('meremobil.dk')) {
    if (pathname.startsWith('/tag/')) return true;
    if (trimmedPathname === '/annonce' || trimmedPathname === '/nyheder' || trimmedPathname === '/seneste-nyheder') return true;
  }

  if (hostname.endsWith('mobilsiden.dk') && trimmedPathname === '/') {
    return true;
  }

  if (hostname.endsWith('localmatters.co.nz')) {
    if (pathname.startsWith('/category/')) return true;
    if (pathname.startsWith('/tag/')) return true;
  }

  if (hostname.endsWith('chrislynchmedia.com')) {
    if (trimmedPathname === '/news-more') return true;
    if (pathname.startsWith('/category/')) return true;
    if (pathname.startsWith('/tag/')) return true;
  }

  if (hostname.endsWith('farmersweekly.co.nz')) {
    if (pathname.startsWith('/tag/')) return true;
    if (pathname.startsWith('/author/')) return true;
    if (
      trimmedPathname === '/property'
      || trimmedPathname === '/opinion'
      || trimmedPathname === '/markets'
      || trimmedPathname === '/people'
      || trimmedPathname === '/politics'
      || trimmedPathname === '/technology'
      || trimmedPathname === '/news/dairy'
      || trimmedPathname === '/lifestyle/rural-lifestyle-leisure'
    ) return true;
  }

  if (
    hostname.endsWith('securitybrief.co.nz')
    || hostname.endsWith('itbrief.co.nz')
    || hostname.endsWith('channellife.co.nz')
    || hostname.endsWith('techday.co.nz')
  ) {
    if (!pathname.startsWith('/story/')) return true;
  }

  if ((hostname === 'ing.dk' || hostname.endsWith('.ing.dk')) && normalizedSource.includes('sitemap index')) {
    if (trimmedPathname === '/nyheder' || trimmedPathname === '/debat' || trimmedPathname === '/redaktion' || trimmedPathname === '/blogs' || trimmedPathname === '/podcast' || trimmedPathname === '/emner' || trimmedPathname === '/vidensbank' || trimmedPathname === '/app' || trimmedPathname === '/rss-feeds-fra-ingenioeren') return true;
    if (pathname.startsWith('/emne/')) return true;
    if (pathname.startsWith('/holdninger/')) return true;
    if (pathname.startsWith('/noter/')) return true;
    if (/^\/[^/]+\/?$/.test(trimmedPathname) && !trimmedPathname.startsWith('/artikel/')) return true;
  }

  if (hostname.endsWith('version2.dk') && normalizedSource.includes('sitemap index')) {
    if (trimmedPathname === '/artikler' || trimmedPathname === '/blogs' || trimmedPathname === '/debat' || trimmedPathname === '/nyhedsbreve' || trimmedPathname === '/redaktion' || trimmedPathname === '/emner' || trimmedPathname === '/vidensbank' || trimmedPathname === '/feeds' || trimmedPathname === '/ingenioren-abonnement' || trimmedPathname === '/fokus') return true;
    if (pathname.startsWith('/emne/')) return true;
    if (pathname.startsWith('/fokus/')) return true;
    if (/^\/[^/]+\/?$/.test(trimmedPathname) && !trimmedPathname.startsWith('/artikel/')) return true;
  }

  if (hostname.endsWith('altinget.dk') && normalizedSource.includes('sitemap index')) {
    if (!pathname.startsWith('/artikel/')) return true;
  }

  if (hostname.endsWith('dbrs.dk') || hostname.endsWith('kobenhavnliv.dk')) {
    if (pathname.startsWith('/arkiv')) return true;
    if (trimmedPathname === '/video' || trimmedPathname === '/jfmplay') return true;
    if (/^\/[^/]+\/?$/.test(trimmedPathname)) return true;
  }

  if (hostname.endsWith('dailymaverick.co.za')) {
    if (pathname.startsWith('/opinionista/')) return true;
    if (pathname.startsWith('/crossword/')) return true;
    if (pathname.startsWith('/cartoon/')) return true;
  }

  if (hostname.endsWith('abc.net.au') && normalizedSource.includes('abc news')) {
    if (pathname.startsWith('/news/newschannel/')) return true;
    if (pathname.includes('/latest-news-just-in-')) return true;
    if (/^\/news\/20\d{2}-\d{2}-\d{2}\/abc-news\/\d+\/?$/.test(pathname)) return true;
  }

  if (hostname.endsWith('indiatimes.com') && normalizedSource.includes('times of india')) {
    if (pathname.startsWith('/astrology/')) return true;
    if (pathname.startsWith('/entertainment/')) return true;
    if (pathname.startsWith('/life-style/')) return true;
    if (pathname.startsWith('/sports/')) return true;
  }

  if (hostname.endsWith('hindustantimes.com') && normalizedSource.includes('hindustan times')) {
    if (pathname.startsWith('/astrology/')) return true;
    if (pathname.startsWith('/car-bike/')) return true;
    if (pathname.startsWith('/cricket/')) return true;
    if (pathname.startsWith('/entertainment/')) return true;
    if (pathname.startsWith('/lifestyle/')) return true;
  }

  if (hostname.endsWith('indiatoday.in') && normalizedSource.includes('india today')) {
    if (pathname.startsWith('/auto/')) return true;
  }

  if (hostname.endsWith('abplive.com') && normalizedSource.includes('abp news')) {
    if (pathname.startsWith('/astro/')) return true;
    if (pathname.startsWith('/entertainment/')) return true;
    if (pathname.startsWith('/sports/')) return true;
  }

  if (hostname.endsWith('ndtv.com') && normalizedSource.includes('ndtv')) {
    if (hostname === 'food.ndtv.com') return true;
  }

  if (hostname.endsWith('gadgets360.com') && normalizedSource.includes('ndtv')) {
    return true;
  }

  if (hostname.endsWith('deccanherald.com') && normalizedSource.includes('deccan herald')) {
    if (pathname.startsWith('/ampstories/')) return true;
    if (pathname.startsWith('/lifestyle/')) return true;
  }

  if (hostname.endsWith('nytimes.com') && normalizedSource === 'the new york times') {
    if (pathname.startsWith('/athletic/')) return true;
    if (pathname.startsWith('/crosswords/')) return true;
    if (pathname.startsWith('/opinion/')) return true;
    if (pathname.startsWith('/interactive/')) return true;
    if (pathname.startsWith('/magazine/')) return true;
    if (pathname.startsWith('/arts/')) return true;
    if (pathname.startsWith('/theater/')) return true;
  }

  if (hostname.endsWith('latimes.com') && normalizedSource === 'la times') {
    if (pathname.includes('/newsletter/')) return true;
    if (pathname.startsWith('/sports/')) return true;
    if (pathname.startsWith('/opinion/')) return true;
    if (pathname.startsWith('/entertainment-arts/')) return true;
  }

  if (hostname.endsWith('scrippsnews.com') && normalizedSource.includes('scripps news - news sitemap')) {
    if (pathname.startsWith('/life/')) return true;
    if (pathname.startsWith('/sports/')) return true;
  }

  if (hostname.endsWith('bloomberg.com') && normalizedSource.includes('bloomberg - latest news sitemap')) {
    if (pathname.startsWith('/news/newsletters/')) return true;
  }

  if (hostname.endsWith('abcnyheter.no') && normalizedSource.includes('abc nyheter')) {
    if (pathname.startsWith('/stemmer/')) return true;
  }

  if (hostname.endsWith('ve.lt') && normalizedSource.includes('ve.lt')) {
    if (pathname.startsWith('/gyvenimas/')) return true;
    if (pathname.startsWith('/horoskopai/')) return true;
    if (pathname.startsWith('/nuomones/')) return true;
    if (pathname.startsWith('/renginiai/')) return true;
    if (pathname.startsWith('/orai/')) return true;
  }

  if (hostname.endsWith('dnevno.hr') && normalizedSource.includes('dnevno')) {
    if (pathname.startsWith('/magazin/')) return true;
    if (pathname.startsWith('/zdravlje/')) return true;
    if (pathname.startsWith('/planet-x/')) return true;
    if (pathname.startsWith('/vjera/')) return true;
    if (pathname.startsWith('/auto-moto/')) return true;
  }

  if (hostname.endsWith('dagen.no') && normalizedSource.includes('dagen')) {
    if (pathname.startsWith('/meninger/')) return true;
    if (pathname.startsWith('/reportasjer/')) return true;
    if (pathname.startsWith('/tro/')) return true;
    if (pathname.startsWith('/kultur/')) return true;
    if (pathname.startsWith('/korsets-seier/')) return true;
  }

  if (hostname.endsWith('dagsavisen.no') && pathname.startsWith('/kommentar/')) {
    return true;
  }

  if (hostname.endsWith('protothema.gr') && normalizedSource.includes('proto thema')) {
    if (pathname.startsWith('/advertorial/')) return true;
    if (pathname.startsWith('/life-style/')) return true;
  }

  if (hostname.endsWith('newsbeast.gr') && normalizedSource.includes('newsbeast')) {
    if (pathname.startsWith('/apopseis/')) return true;
    if (pathname.startsWith('/lifestyle/')) return true;
  }

  if (hostname.endsWith('newsbomb.gr') && normalizedSource.includes('newsbomb')) {
    if (pathname.startsWith('/aftokinito/')) return true;
    if (pathname.startsWith('/sports/')) return true;
  }

  if (hostname.endsWith('zougla.gr') && normalizedSource.includes('zougla')) {
    if (pathname.startsWith('/apopseis/')) return true;
    if (pathname.startsWith('/automoto/')) return true;
    if (pathname.startsWith('/lifestyle/')) return true;
    if (pathname.startsWith('/sports/')) return true;
  }

  if (hostname.endsWith('iefimerida.gr') && normalizedSource.includes('iefimerida')) {
    if (pathname.startsWith('/aytokinito/')) return true;
    if (pathname.startsWith('/zoi/')) return true;
  }

  if (hostname.endsWith('newsit.gr') && normalizedSource.includes('newsit')) {
    if (pathname.startsWith('/athlitika/')) return true;
    if (pathname.startsWith('/opinion/')) return true;
  }

  if (hostname.endsWith('enikos.gr') && normalizedSource.includes('enikos')) {
    if (pathname.startsWith('/arthra/')) return true;
    if (pathname.startsWith('/lifestyle/')) return true;
    if (pathname.startsWith('/media/')) return true;
  }

  if (hostname.endsWith('naftemporiki.gr') && normalizedSource.includes('naftemporiki')) {
    if (pathname.startsWith('/afieromata/')) return true;
  }

  if (hostname.endsWith('fvn.no') && normalizedSource.includes('fædrelandsvennen')) {
    if (pathname.startsWith('/mening/')) return true;
  }

  if (hostname.endsWith('vl.no') && normalizedSource.includes('vårt land')) {
    if (pathname.startsWith('/meninger/')) return true;
  }

  if (hostname.endsWith('kommunal-rapport.no') && normalizedSource.includes('kommunal rapport')) {
    if (pathname.startsWith('/meninger/')) return true;
  }

  if (hostname.endsWith('plo.vn') && trimmedPathname === '/') {
    return true;
  }

  if (hostname.endsWith('vietnamnews.vn') && pathname.startsWith('/media-outreach/')) {
    return true;
  }

  if (hostname.endsWith('daidoanket.vn')) {
    if (trimmedPathname === '/') return true;
    if (pathname.startsWith('/chuyen-muc/')) return true;
  }

  if (hostname.endsWith('stomp.sg') && pathname.startsWith('/lifestyle/')) {
    return true;
  }

  if (hostname.endsWith('info.cz') && pathname.startsWith('/podcasty/')) {
    return true;
  }

  if (hostname.endsWith('baotintuc.vn') && pathname.startsWith('/video/')) {
    return true;
  }

  if (hostname.endsWith('ahlmasrnews.com') && normalizedSource.includes('ahl masr')) {
    if (!pathname.startsWith('/news/')) return true;
    if (pathname.startsWith('/news/art/')) return true;
    if (pathname.startsWith('/news/sport/')) return true;
    if (pathname.startsWith('/news/opinion/')) return true;
    if (pathname.startsWith('/news/talk-show/')) return true;
    if (pathname.startsWith('/news/auto/')) return true;
    if (pathname.startsWith('/news/cases-news/')) return true;
  }

  if (hostname.endsWith('7news.com.au')) {
    if (pathname.startsWith('/7you/')) return true;
    if (pathname.startsWith('/sunrise/')) return true;
    if (pathname.startsWith('/the-morning-show/')) return true;
    if (pathname.startsWith('/podcasts/')) return true;
  }

  if (hostname.endsWith('news.com.au') && pathname.startsWith('/checkout/')) {
    return true;
  }

  if (hostname.endsWith('news.com.au') && normalizedSource.includes('news.com.au - sitemap')) {
    if (pathname.startsWith('/entertainment/')) return true;
    if (pathname.startsWith('/lifestyle/')) return true;
    if (pathname.startsWith('/travel/')) return true;
    if (pathname.startsWith('/motoring/')) return true;
  }

  if (hostname.endsWith('9news.com.au') && normalizedSource.includes('9news')) {
    if (trimmedPathname === '/') return true;
    if (pathname.startsWith('/meet-the-team/')) return true;
    if (pathname.startsWith('/videos/')) return true;
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length < 3) return true;
  }

  if (
    (
      hostname.endsWith('smh.com.au') ||
      hostname.endsWith('theage.com.au') ||
      hostname.endsWith('brisbanetimes.com.au') ||
      hostname.endsWith('watoday.com.au')
    ) &&
    normalizedSource.includes('news sitemap')
  ) {
    if (pathname.startsWith('/goodfood/')) return true;
    if (pathname.startsWith('/life-and-relationships/')) return true;
  }

  if (hostname.endsWith('skynews.com.au') && pathname.startsWith('/lifestyle/')) {
    return true;
  }

  if (hostname.endsWith('news.tvbs.com.tw') && normalizedSource.includes('tvbs')) {
    if (pathname.startsWith('/life/')) return true;
    if (pathname.startsWith('/entertainment/')) return true;
    if (pathname.startsWith('/health/')) return true;
    if (pathname.startsWith('/focus/')) return true;
    if (pathname.startsWith('/english/')) return true;
    if (pathname.startsWith('/compilation/')) return true;
    if (pathname.startsWith('/cars/')) return true;
    if (pathname.startsWith('/fun/')) return true;
    if (pathname.startsWith('/travel/')) return true;
  }

  if (hostname.endsWith('dailymail.co.uk') && normalizedSource.includes('daily mail australia')) {
    if (!/^\/news\/article-\d+(?:\/|$)/.test(pathname)) {
      return true;
    }
  }

  if (hostname.endsWith('dailymail.co.uk') && normalizedSource.includes('daily mail')) {
    if (!/^\/news(?:\/[^/]+)?\/article-\d+(?:\/|$)/.test(pathname)) {
      return true;
    }
  }

  if (hostname.endsWith('mirror.co.uk') && normalizedSource.includes('mirror')) {
    if (pathname.startsWith('/sport/')) return true;
    if (pathname.startsWith('/3am/')) return true;
    if (pathname.startsWith('/tv/')) return true;
    if (pathname.startsWith('/money/')) return true;
    if (pathname.startsWith('/lifestyle/')) return true;
    if (pathname.startsWith('/travel/')) return true;
    if (pathname.startsWith('/gaming/')) return true;
    if (pathname.startsWith('/film/')) return true;
    if (pathname.startsWith('/opinion/')) return true;
  }

  if (hostname.endsWith('express.co.uk') && normalizedSource.includes('express')) {
    if (pathname.startsWith('/sport/')) return true;
    if (pathname.startsWith('/life-style/')) return true;
    if (pathname.startsWith('/showbiz/')) return true;
    if (pathname.startsWith('/finance/')) return true;
    if (pathname.startsWith('/celebrity-news/')) return true;
    if (pathname.startsWith('/travel/')) return true;
    if (pathname.startsWith('/entertainment/')) return true;
  }

  if (hostname.endsWith('filgoal.com') && normalizedSource.includes('filgoal')) {
    if (pathname.startsWith('/videos/')) return true;
    if (!pathname.startsWith('/articles/')) return true;
  }

  if (hostname.endsWith('ensonhaber.com') && normalizedSource.includes('ensonhaber')) {
    if (pathname.startsWith('/3-sayfa/')) return true;
    if (pathname.startsWith('/kralspor/')) return true;
  }

  if (
    (
      hostname.endsWith('adelaidenow.com.au') ||
      hostname.endsWith('townsvillebulletin.com.au') ||
      hostname.endsWith('goldcoastbulletin.com.au') ||
      hostname.endsWith('ntnews.com.au') ||
      hostname.endsWith('themercury.com.au') ||
      hostname.endsWith('couriermail.com.au') ||
      hostname.endsWith('dailytelegraph.com.au')
    ) &&
    pathname.includes('/hyperlocal/')
  ) {
    return true;
  }

  if (hostname.endsWith('berliner-zeitung.de') && /^\/topics(?:\/|$)/.test(pathname)) {
    return true;
  }

  if (hostname.endsWith('berliner-zeitung.de') && normalizedSource.includes('berliner zeitung')) {
    if (trimmedPathname === '/') return true;
  }

  if (hostname === '24.hu' && normalizedSource.includes('24.hu')) {
    if (trimmedPathname === '/') return true;
  }

  if (hostname.endsWith('index.hu') && normalizedSource.includes('index.hu')) {
    if (trimmedPathname === '/') {
      return true;
    }
    if (pathname.startsWith('/api/')) {
      return true;
    }
    if (!/\/20\d{2}\//.test(pathname)) {
      return true;
    }
  }

  if (hostname.endsWith('tyden.cz') && normalizedSource.includes('tyden.cz')) {
    if (/^\/+soutez(?:-|\/|$)/.test(pathname)) {
      return true;
    }
  }

  if (hostname.endsWith('economedia.ro') && normalizedSource.includes('economedia')) {
    if (!pathname.endsWith('.html')) {
      return true;
    }
  }

  if (hostname.endsWith('sindonews.com') && normalizedSource.includes('sindo')) {
    if (pathname.startsWith('/topic/')) return true;
    if (pathname.startsWith('/terkait/')) return true;
    if (pathname.startsWith('/blog/')) return true;
    if (hostname === 'media.sindonews.com') return true;
    if (
      hostname === 'kalam.sindonews.com' &&
      /^(?:\/quran|\/murottal|\/juzamma|\/jadwalsholat)\/?$/i.test(pathname)
    ) {
      return true;
    }
    if (!pathname.startsWith('/read/')) {
      return true;
    }
  }

  if (hostname.endsWith('citynews.ca') && /^\/author\/[^/]+\/?$/.test(pathname)) {
    return true;
  }

  if (hostname.endsWith('adnkronos.com') && normalizedSource.includes('adnkronos')) {
    if (trimmedPathname === '/') return true;
    if (pathname.startsWith('/speciali/')) return true;
    if (pathname.startsWith('/newsletter/')) return true;
    if (pathname.startsWith('/top/')) return true;
    if (pathname.startsWith('/showcase/')) return true;
    if (trimmedPathname === '/milano-cortina-2026') return true;
    if (pathname.endsWith('/index.html')) return true;
  }

  if (hostname.endsWith('970universal.com') && pathname.startsWith('/category/')) {
    return true;
  }

  if (hostname.endsWith('n.com.do') && /^\/author\/[^/]+\/?$/.test(pathname)) {
    return true;
  }

  if (hostname.endsWith('times.abema.tv')) {
    if (pathname.startsWith('/tags/')) return true;
    if (!/^\/(?:[a-z]{2}\/)?articles\/(?:-|photo)\/\d+\/?$/i.test(pathname)) {
      return true;
    }
  }

  if (hostname.endsWith('24horas.cl') && normalizedSource.includes('24horas')) {
    if (trimmedPathname === '/') {
      return true;
    }
    if (
      [
        '/internacional',
        '/envivo',
        '/noticiarios',
        '/programas',
        '/regiones',
        '/tendencias',
        '/el-tiempo',
        '/deportes',
        '/coronavirus',
        '/proceso-constituyente',
        '/data',
        '/senal-24hplay',
        '/deportes-24horas',
      ].includes(trimmedPathname)
    ) {
      return true;
    }

    if (trimmedPathname === '/deportes/rallymobil') return true;
    if (trimmedPathname === '/informe-especial/capitulos') return true;
    if (trimmedPathname === '/informe-especial/prueba-linea-de-tiempo-informe-especial') return true;
    if (pathname.startsWith('/24horas/site/edic/base/port/')) return true;
  }

  if (hostname.endsWith('tgrthaber.com') && normalizedSource.includes('tgrt haber')) {
    if (pathname.startsWith('/3-sayfa/')) return true;
    if (pathname.startsWith('/magazin/')) return true;
    if (pathname.startsWith('/spor/')) return true;
    if (pathname.startsWith('/yasam/')) return true;
    if (pathname.startsWith('/yasam-videolari/')) return true;
  }

  if (hostname.endsWith('mynet.com') && normalizedSource.includes('mynet - google news sitemap')) {
    if (hostname === 'www.mynet.com') return true;
    if (pathname.startsWith('/hayat')) return true;
  }

  if (hostname.endsWith('iz.ru') && normalizedSource.includes('izvestia')) {
    if (pathname.includes('/video/')) return true;
  }

  if (hostname.endsWith('ledevoir.com') && normalizedSource.includes('le devoir')) {
    if (!/\/\d{5,}(?:\/|$)/.test(pathname)) return true;
  }

  if (hostname.endsWith('mandiner.hu') && normalizedSource.includes('mandiner')) {
    if (pathname.startsWith('/cimke/')) return true;
  }

  if (hostname.endsWith('magyarnemzet.hu') && normalizedSource.includes('magyar nemzet')) {
    if (pathname.startsWith('/cimke/')) return true;
  }

  if (hostname.endsWith('origo.hu') && pathname.startsWith('/cimke/')) {
    return true;
  }

  if (hostname.endsWith('fanatik.ro') && normalizedSource.includes('fanatik')) {
    if (pathname.startsWith('/tags/')) return true;
    if (pathname.startsWith('/autor/')) return true;
    if (/^\/[a-z0-9-]+\/?$/.test(trimmedPathname) && !/\d{5,}/.test(trimmedPathname)) {
      return true;
    }
  }

  if (hostname.endsWith('zeit.de') && normalizedSource.includes('die zeit')) {
    if (trimmedPathname === '/index') {
      return true;
    }
    if (pathname.startsWith('/thema/')) {
      return true;
    }
    if (/^\/20\d{2}\/\d{2}\/playlist\/?$/.test(pathname)) {
      return true;
    }
  }

  if (hostname.endsWith('cnnturk.com') && pathname.startsWith('/resmi-ilanlar/')) {
    return true;
  }

  if (hostname.endsWith('carmeloportal.com') && /^\/author\/[^/]+\/?$/.test(pathname)) {
    return true;
  }

  if (hostname.endsWith('carmeloportal.com') && pathname.startsWith('/temas/')) {
    return true;
  }

  if (hostname.endsWith('20min.ch') && pathname.endsWith('/analysis')) {
    return true;
  }

  if (hostname.endsWith('fortune.com')) {
    if (pathname.startsWith('/tag/')) return true;
    if (pathname.startsWith('/section/')) return true;
  }

  if (hostname.endsWith('yomiuri.co.jp') && normalizedSource.includes('yomiuri')) {
    if (pathname.startsWith('/giants/archive/')) return true;
  }

  if (hostname.endsWith('nikkei.com') && normalizedSource.includes('nikkei')) {
    if (trimmedPathname === '/') return true;
    if (trimmedPathname === '/money/borrow') return true;
    if (trimmedPathname === '/politics/column') return true;
  }

  if (hostname === 'blog.idnes.cz' && /^\/bg\d{8}\/?$/i.test(pathname)) {
    return true;
  }

  if (hostname.endsWith('vesti.bg')) {
    if (
      normalizedSource.includes('vesti - bulgaria sitemap') &&
      /^\/bulgaria(?:\/[^/]+)?\/?$/.test(pathname) &&
      !/-\d{5,}$/.test(trimmedPathname)
    ) {
      return true;
    }

    if (
      normalizedSource.includes('vesti - world sitemap') &&
      /^\/sviat(?:\/[^/]+)?\/?$/.test(pathname) &&
      !/-\d{5,}$/.test(trimmedPathname)
    ) {
      return true;
    }
  }

  if (hostname.endsWith('wsj.com') && normalizedSource.includes('wall street journal')) {
    if (trimmedPathname === '/') return true;
    if (/^\/topics(?:\/|$)/.test(pathname)) return true;
    if (/^\/audio\/?$/.test(pathname)) return true;
    if (/^\/recipes\/?$/.test(pathname)) return true;
    if (/^\/podcasts(?:\/|$)/.test(pathname)) return true;
    if (/^\/newsletters(?:\/|$)/.test(pathname)) return true;
    if (/^\/video\/?$/.test(pathname)) return true;
    if (/^\/video\/browse(?:\/|$)/.test(pathname)) return true;
    if (/^\/livecoverage\/?$/.test(pathname)) return true;
    if (/^\/cfo-journal\/?$/.test(pathname)) return true;
    if (/^\/cmo-today\/?$/.test(pathname)) return true;
    if (/^\/cio-journal\/?$/.test(pathname)) return true;
    if (/^\/journal-reports\/?$/.test(pathname)) return true;
    if (/^\/risk-compliance-journal\/?$/.test(pathname)) return true;
    if (/^\/logistics-report\/?$/.test(pathname)) return true;
    if (/^\/future-of-everything\/?$/.test(pathname)) return true;
    if (/^\/investment-banking-scorecard\/?$/.test(pathname)) return true;
    if (/^\/market-data\/?$/.test(pathname)) return true;
    if (/^\/opinion\/?$/.test(pathname)) return true;
    if (/^\/(?:health|style|us-news|real-estate|lifestyle|science|business|tech|finance|personal-finance)\/?$/.test(pathname)) {
      return true;
    }
    if (/^\/news\/author\/[^/]+\/?$/.test(pathname)) return true;
    if (/^\/news\/types\/[^/]+\/?$/.test(pathname)) return true;
    if (/^\/news\/heard-on-the-street\/?$/.test(pathname)) return true;
    if (/^\/news\/puzzle\/?$/.test(pathname)) return true;
    if (/^\/arts-culture\/?$/.test(pathname)) return true;
    if (/^\/sports\/?$/.test(pathname)) return true;
    if (/^\/pro\/[^/]+\/?$/.test(pathname)) return true;
    if (/^\/market-data\/[^/]+\/?$/.test(pathname)) return true;
    if (/^\/(?:world|science|business|sports|politics|lifestyle|arts-culture|tech|economy|finance|personal-finance|us-news|health|style|real-estate)(?:\/[^/]+){0,2}\/?$/.test(pathname)) {
      const lastSegment = trimmedPathname.split('/').filter(Boolean).at(-1) || '';
      const slugParts = lastSegment.split('-').filter(Boolean);
      const looksLikeLandingSlug = slugParts.length <= 3 && lastSegment.length <= 32 && !/\d{5,}/.test(lastSegment);
      if (looksLikeLandingSlug) return true;
    }
    if (/^\/news\/(?:business|markets|books-arts)\/[^/]+\/?$/.test(pathname)) return true;
    if (/^\/opinion\/free-expression(?:\/[^/]+)?\/?$/.test(pathname)) return true;
    if (/^\/lifestyle\/(?:fitness|workplace)\/?$/.test(pathname)) return true;
    if (/^\/personal-finance\/mortgages\/?$/.test(pathname)) return true;
    if (/^\/real-estate\/luxury-homes\/?$/.test(pathname)) return true;
    if (/^\/news\/markets\/real-estate-commercial\/?$/.test(pathname)) return true;
  }

  if (hostname.endsWith('cumhuriyet.com.tr')) {
    if (pathname.startsWith('/astroloji/')) return true;
    if (pathname.startsWith('/magazin/')) return true;
    if (pathname.startsWith('/resmi-ilanlar/')) return true;
    if (pathname.startsWith('/saglik/')) return true;
    if (pathname.startsWith('/spor/')) return true;
    if (pathname.startsWith('/tv-rehberi/')) return true;
    if (pathname.startsWith('/yasam/')) return true;
  }

  if (
    (hostname.endsWith('orlandosentinel.com') ||
      hostname.endsWith('sandiegouniontribune.com') ||
      hostname.endsWith('denverpost.com') ||
      hostname.endsWith('mercurynews.com')) &&
    pathname.startsWith('/obituaries/')
  ) {
    return true;
  }

  if (isPolskaPressRegionalHost(hostname) && POLSKA_PRESS_SOFT_CATEGORY_PATH_PATTERN.test(pathname)) {
    return true;
  }

  if (
    (hostname.endsWith('miamiherald.com') ||
      hostname.endsWith('kansascity.com') ||
      hostname.endsWith('sacbee.com') ||
      hostname.endsWith('charlotteobserver.com') ||
      hostname.endsWith('newsobserver.com') ||
      hostname.endsWith('star-telegram.com') ||
      hostname.endsWith('fresnobee.com') ||
      hostname.endsWith('idahostatesman.com') ||
      hostname.endsWith('kentucky.com') ||
      hostname.endsWith('thestate.com')) &&
    /^\/(?:sports|entertainment|living|opinion|charlottefive|miami-com|contributor-content|paid)(?:\/|$)/.test(pathname)
  ) {
    return true;
  }

  if (isVillageMediaHost(hostname) && VILLAGE_MEDIA_NON_ARTICLE_PATH_PATTERN.test(pathname)) {
    return true;
  }

  if (isBlackPressHost(hostname) && BLACK_PRESS_NON_ARTICLE_PATH_PATTERN.test(pathname)) {
    return true;
  }

  if (pathname.startsWith('/iframe/')) {
    return true;
  }

  if (hostname === 'bb.lv' && normalizedSource.includes('bb.lv')) {
    if (!pathname.startsWith('/statja/')) {
      return true;
    }
  }

  if (hostname === 'mixnews.lv' && normalizedSource.includes('mixnews')) {
    if (
      !pathname.startsWith('/latviya/') &&
      !pathname.startsWith('/v-mire/') &&
      !pathname.startsWith('/culture/')
    ) {
      return true;
    }
  }

  if (hostname.endsWith('setn.com') && normalizedSource.includes('setn')) {
    if (trimmedPathname === '/catalog.aspx' && parsed.searchParams.has('PageGroupID')) {
      return true;
    }
  }

  if (hostname.endsWith('eluniversal.com.mx') && normalizedSource.includes('el universal')) {
    if (trimmedPathname === '/') return true;
  }

  return false;
}
