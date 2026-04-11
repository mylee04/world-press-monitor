export type SourceSitemapKind = 'none' | 'news_sitemap' | 'sitemap_index' | 'other_sitemap';

export type SourceEndpointProfile =
  | 'rss_only'
  | 'news_sitemap_only'
  | 'sitemap_index_only'
  | 'other_sitemap_only'
  | 'rss_plus_news_sitemap'
  | 'rss_plus_sitemap_index'
  | 'rss_plus_other_sitemap';

export type SourceEndpointBreakdown = {
  rssOnly: number;
  newsSitemapOnly: number;
  sitemapIndexOnly: number;
  otherSitemapOnly: number;
  rssPlusNewsSitemap: number;
  rssPlusSitemapIndex: number;
  rssPlusOtherSitemap: number;
};

export function emptySourceEndpointBreakdown(): SourceEndpointBreakdown {
  return {
    rssOnly: 0,
    newsSitemapOnly: 0,
    sitemapIndexOnly: 0,
    otherSitemapOnly: 0,
    rssPlusNewsSitemap: 0,
    rssPlusSitemapIndex: 0,
    rssPlusOtherSitemap: 0,
  };
}

export function cloneSourceEndpointBreakdown(value?: SourceEndpointBreakdown | null): SourceEndpointBreakdown {
  const current = value || emptySourceEndpointBreakdown();
  return {
    rssOnly: current.rssOnly || 0,
    newsSitemapOnly: current.newsSitemapOnly || 0,
    sitemapIndexOnly: current.sitemapIndexOnly || 0,
    otherSitemapOnly: current.otherSitemapOnly || 0,
    rssPlusNewsSitemap: current.rssPlusNewsSitemap || 0,
    rssPlusSitemapIndex: current.rssPlusSitemapIndex || 0,
    rssPlusOtherSitemap: current.rssPlusOtherSitemap || 0,
  };
}

export function addSourceEndpointProfile(
  target: SourceEndpointBreakdown,
  profile: SourceEndpointProfile
): void {
  if (profile === 'rss_only') {
    target.rssOnly += 1;
    return;
  }
  if (profile === 'news_sitemap_only') {
    target.newsSitemapOnly += 1;
    return;
  }
  if (profile === 'sitemap_index_only') {
    target.sitemapIndexOnly += 1;
    return;
  }
  if (profile === 'other_sitemap_only') {
    target.otherSitemapOnly += 1;
    return;
  }
  if (profile === 'rss_plus_news_sitemap') {
    target.rssPlusNewsSitemap += 1;
    return;
  }
  if (profile === 'rss_plus_sitemap_index') {
    target.rssPlusSitemapIndex += 1;
    return;
  }
  target.rssPlusOtherSitemap += 1;
}

export function mergeSourceEndpointBreakdown(
  target: SourceEndpointBreakdown,
  source?: SourceEndpointBreakdown | null
): void {
  const current = source || emptySourceEndpointBreakdown();
  target.rssOnly += current.rssOnly || 0;
  target.newsSitemapOnly += current.newsSitemapOnly || 0;
  target.sitemapIndexOnly += current.sitemapIndexOnly || 0;
  target.otherSitemapOnly += current.otherSitemapOnly || 0;
  target.rssPlusNewsSitemap += current.rssPlusNewsSitemap || 0;
  target.rssPlusSitemapIndex += current.rssPlusSitemapIndex || 0;
  target.rssPlusOtherSitemap += current.rssPlusOtherSitemap || 0;
}

export function classifySitemapKindFromUrl(url: string | null | undefined): SourceSitemapKind {
  const normalized = (url || '').trim().toLowerCase();
  if (!normalized) return 'none';

  if (
    /(?:^|[/?._-])sitemap(?:_|-)?index(?:\.xml|$|[?#])/.test(normalized)
    || normalized.includes('/sitemaps/index')
    || normalized.includes('sitemapindex')
  ) {
    return 'sitemap_index';
  }

  if (
    normalized.includes('news-sitemap')
    || normalized.includes('sitemap-news')
    || normalized.includes('sitemap_news')
    || normalized.includes('google-news')
    || normalized.includes('google_news')
    || normalized.includes('googlenews')
    || normalized.includes('map_news')
    || /(?:^|[/?._-])news\.xml(?:$|[?#])/.test(normalized)
    || normalized.includes('48hrs')
    || normalized.includes('48-hours')
  ) {
    return 'news_sitemap';
  }

  return 'other_sitemap';
}

export function classifySourceEndpointProfile(params: {
  hasRss: boolean;
  hasSitemap: boolean;
  sitemapKind: SourceSitemapKind;
}): SourceEndpointProfile {
  if (!params.hasSitemap || params.sitemapKind === 'none') {
    return 'rss_only';
  }
  if (!params.hasRss) {
    if (params.sitemapKind === 'news_sitemap') return 'news_sitemap_only';
    if (params.sitemapKind === 'sitemap_index') return 'sitemap_index_only';
    return 'other_sitemap_only';
  }
  if (params.sitemapKind === 'news_sitemap') return 'rss_plus_news_sitemap';
  if (params.sitemapKind === 'sitemap_index') return 'rss_plus_sitemap_index';
  return 'rss_plus_other_sitemap';
}
