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

export function isKnownNonArticleUrl(source: string, url: string): boolean {
  const parsed = safeParseUrl(url);
  if (!parsed) return false;

  const hostname = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname.toLowerCase();
  const trimmedPathname = trimTrailingSlashes(pathname);
  const normalizedSource = (source || '').toLowerCase();

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

  if (hostname.endsWith('berliner-zeitung.de') && /^\/topics(?:\/|$)/.test(pathname)) {
    return true;
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
    if (pathname.endsWith('/index.html')) return true;
  }

  if (hostname.endsWith('970universal.com') && /^\/category\/[^/]+\/?$/.test(pathname)) {
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

  if (hostname.endsWith('ledevoir.com') && normalizedSource.includes('le devoir')) {
    if (!/\/\d{5,}(?:\/|$)/.test(pathname)) return true;
  }

  if (hostname.endsWith('mandiner.hu') && normalizedSource.includes('mandiner')) {
    if (pathname.startsWith('/cimke/')) return true;
  }

  if (hostname.endsWith('magyarnemzet.hu') && normalizedSource.includes('magyar nemzet')) {
    if (pathname.startsWith('/cimke/')) return true;
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
  }

  if (hostname.endsWith('cnnturk.com') && pathname.startsWith('/resmi-ilanlar/')) {
    return true;
  }

  if (hostname.endsWith('carmeloportal.com') && /^\/author\/[^/]+\/?$/.test(pathname)) {
    return true;
  }

  if (hostname.endsWith('fortune.com')) {
    if (pathname.startsWith('/tag/')) return true;
    if (pathname.startsWith('/section/')) return true;
  }

  if (hostname.endsWith('yomiuri.co.jp') && normalizedSource.includes('yomiuri')) {
    if (pathname.startsWith('/giants/archive/')) return true;
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
    if (/^\/topics(?:\/|$)/.test(pathname)) return true;
    if (/^\/audio\/?$/.test(pathname)) return true;
    if (/^\/recipes\/?$/.test(pathname)) return true;
    if (/^\/podcasts(?:\/|$)/.test(pathname)) return true;
    if (/^\/newsletters(?:\/|$)/.test(pathname)) return true;
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
    if (pathname.startsWith('/resmi-ilanlar/')) return true;
    if (pathname.startsWith('/tv-rehberi/')) return true;
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

  return false;
}
