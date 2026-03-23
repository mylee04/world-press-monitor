function safeParseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function isKnownNonArticleUrl(source: string, url: string): boolean {
  const parsed = safeParseUrl(url);
  if (!parsed) return false;

  const hostname = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname.toLowerCase();
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

  if (hostname.endsWith('nepszava.hu') && pathname.startsWith('/tag/')) {
    return true;
  }

  if (hostname.endsWith('teledoce.com') && pathname.startsWith('/tag/')) {
    return true;
  }

  if (hostname.endsWith('ciperchile.cl') && pathname.startsWith('/tag/')) {
    return true;
  }

  if (hostname.endsWith('delo.si') && pathname.startsWith('/tag/')) {
    return true;
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
