import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildDisplaySourceName } from '@/lib/source-display';

type AtlasFeed = {
  name?: string;
  url?: string | null;
  sitemapUrl?: string | null;
  enabled?: boolean;
};

type AtlasCountry = {
  feeds?: AtlasFeed[];
};

type AtlasFile = {
  countries?: AtlasCountry[];
};

type RunnableAtlasStatsCache = {
  sourceKeys: Set<string>;
  outletRows: number;
};

let cache: RunnableAtlasStatsCache | null = null;

function loadRunnableAtlasStats(): RunnableAtlasStatsCache {
  if (cache) return cache;

  const atlasPath = path.join(process.cwd(), 'data', 'rss-atlas.json');
  const parsed = JSON.parse(readFileSync(atlasPath, 'utf8')) as AtlasFile;
  const sourceKeys = new Set<string>();
  let outletRows = 0;

  for (const country of parsed.countries || []) {
    for (const feed of country.feeds || []) {
      if (feed?.enabled === false) continue;
      const hasRssUrl = typeof feed?.url === 'string' && feed.url.trim().length > 0;
      const hasSitemapUrl = typeof feed?.sitemapUrl === 'string' && feed.sitemapUrl.trim().length > 0;
      if (!hasRssUrl && !hasSitemapUrl) continue;
      const rawName = (feed?.name || '').trim();
      if (!rawName) continue;
      outletRows += 1;
      sourceKeys.add(buildDisplaySourceName(rawName).toLowerCase());
    }
  }

  cache = {
    sourceKeys,
    outletRows,
  };
  return cache;
}

export function getRunnableAtlasSourceStats(): { sourceNames: number; outletRows: number } {
  const stats = loadRunnableAtlasStats();
  return {
    sourceNames: stats.sourceKeys.size,
    outletRows: stats.outletRows,
  };
}

export function isRunnableAtlasSource(source: string): boolean {
  const normalized = buildDisplaySourceName(source || '').trim().toLowerCase();
  if (!normalized) return false;
  return loadRunnableAtlasStats().sourceKeys.has(normalized);
}
