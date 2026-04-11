import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildDisplaySourceName } from '@/lib/source-display';
import {
  addSourceEndpointProfile,
  classifySitemapKindFromUrl,
  classifySourceEndpointProfile,
  cloneSourceEndpointBreakdown,
  emptySourceEndpointBreakdown,
  type SourceEndpointBreakdown,
  type SourceEndpointProfile,
  type SourceSitemapKind,
} from '@/lib/source-endpoint-classification';

type AtlasFeed = {
  name?: string;
  url?: string | null;
  sitemapUrl?: string | null;
  distributionClass?: SourceDistributionClass;
};

type AtlasCountry = {
  name?: string;
  code?: string | null;
  feeds?: AtlasFeed[];
};

type AtlasFile = {
  countries?: AtlasCountry[];
};

export type SourceDistributionClass = 'publisher' | 'portal';

export type SourceMethodMeta = {
  country: string;
  countryCode: string | null;
  source: string;
  displaySource: string;
  rssUrl: string | null;
  sitemapUrl: string | null;
  hasRss: boolean;
  hasSitemap: boolean;
  sitemapKind: SourceSitemapKind;
  endpointProfile: SourceEndpointProfile;
  distributionClass: SourceDistributionClass;
};

let atlasSourceMetaCache: Map<string, SourceMethodMeta> | null = null;
let atlasCountryCodeCache: Map<string, string | null> | null = null;
let atlasConfiguredSourcesByCountryCache: Map<string, number> | null = null;
let atlasConfiguredEndpointBreakdownByCountryCache: Map<string, SourceEndpointBreakdown> | null = null;

export function normalizeSourceKey(value: string): string {
  return buildDisplaySourceName(value || '').trim().toLowerCase();
}

export function buildMapSourceId(country: string, source: string): string {
  return `${country}::${buildDisplaySourceName(source)}`;
}

export function parseMapSourceId(value: string): { countryHint: string | null; source: string } {
  const decoded = decodeURIComponent(value || '');
  const separatorIndex = decoded.indexOf('::');
  if (separatorIndex === -1) {
    return {
      countryHint: null,
      source: buildDisplaySourceName(decoded),
    };
  }

  return {
    countryHint: decoded.slice(0, separatorIndex).trim() || null,
    source: buildDisplaySourceName(decoded.slice(separatorIndex + 2)),
  };
}

export function matchesDisplaySource(rawSource: string, displaySource: string): boolean {
  return normalizeSourceKey(rawSource) === normalizeSourceKey(displaySource);
}

function getAtlasPath(): string {
  return path.join(process.cwd(), 'data', 'rss-atlas.json');
}

function mergeDistributionClass(
  current: SourceDistributionClass | undefined,
  next: SourceDistributionClass | undefined
): SourceDistributionClass {
  if (current === 'publisher') return 'publisher';
  if (next !== 'portal') return 'publisher';
  return 'portal';
}

function loadAtlasSourceMeta(): {
  sourceMeta: Map<string, SourceMethodMeta>;
  countryCodes: Map<string, string | null>;
  configuredSourcesByCountry: Map<string, number>;
  configuredEndpointBreakdownByCountry: Map<string, SourceEndpointBreakdown>;
} {
  if (
    atlasSourceMetaCache
    && atlasCountryCodeCache
    && atlasConfiguredSourcesByCountryCache
    && atlasConfiguredEndpointBreakdownByCountryCache
  ) {
    return {
      sourceMeta: atlasSourceMetaCache,
      countryCodes: atlasCountryCodeCache,
      configuredSourcesByCountry: atlasConfiguredSourcesByCountryCache,
      configuredEndpointBreakdownByCountry: atlasConfiguredEndpointBreakdownByCountryCache,
    };
  }

  const raw = readFileSync(getAtlasPath(), 'utf8');
  const parsed = JSON.parse(raw) as AtlasFile;
  const sourceMeta = new Map<string, SourceMethodMeta>();
  const countryCodes = new Map<string, string | null>();
  const configuredSourcesByCountry = new Map<string, Set<string>>();

  for (const country of parsed.countries || []) {
    const countryName = (country.name || '').trim();
    const countryCode = (country.code || '').trim() || null;
    if (!countryName) continue;
    countryCodes.set(countryName, countryCode);

    for (const feed of country.feeds || []) {
      const rawName = (feed.name || '').trim();
      if (!rawName) continue;
      const isPortal = feed.distributionClass === 'portal';
      const normalizedSource = normalizeSourceKey(rawName);

      if (!isPortal) {
        const configuredSet = configuredSourcesByCountry.get(countryName) || new Set<string>();
        configuredSet.add(normalizedSource);
        configuredSourcesByCountry.set(countryName, configuredSet);
      }

      const displaySource = buildDisplaySourceName(rawName);
      const key = normalizeSourceKey(displaySource);
      const current = sourceMeta.get(key);
      const rssUrl = current?.rssUrl || feed.url || null;
      const sitemapUrl = current?.sitemapUrl || feed.sitemapUrl || null;
      const hasRss = Boolean(rssUrl);
      const hasSitemap = Boolean(sitemapUrl);
      const sitemapKind = classifySitemapKindFromUrl(sitemapUrl);
      const next: SourceMethodMeta = {
        country: current?.country || countryName,
        countryCode: current?.countryCode || countryCode,
        source: current?.source || rawName,
        displaySource,
        rssUrl,
        sitemapUrl,
        hasRss,
        hasSitemap,
        sitemapKind,
        endpointProfile: classifySourceEndpointProfile({ hasRss, hasSitemap, sitemapKind }),
        distributionClass: mergeDistributionClass(current?.distributionClass, feed.distributionClass),
      };
      sourceMeta.set(key, next);
      sourceMeta.set(normalizeSourceKey(rawName), next);
    }
  }

  const configuredSourceCounts = new Map<string, number>();
  const configuredEndpointBreakdownByCountry = new Map<string, SourceEndpointBreakdown>();
  for (const [countryName, values] of configuredSourcesByCountry.entries()) {
    configuredSourceCounts.set(countryName, values.size);
    const breakdown = emptySourceEndpointBreakdown();
    for (const sourceKey of values) {
      const meta = sourceMeta.get(sourceKey);
      if (!meta) continue;
      addSourceEndpointProfile(breakdown, meta.endpointProfile);
    }
    configuredEndpointBreakdownByCountry.set(countryName, breakdown);
  }

  atlasSourceMetaCache = sourceMeta;
  atlasCountryCodeCache = countryCodes;
  atlasConfiguredSourcesByCountryCache = configuredSourceCounts;
  atlasConfiguredEndpointBreakdownByCountryCache = configuredEndpointBreakdownByCountry;
  return {
    sourceMeta,
    countryCodes,
    configuredSourcesByCountry: configuredSourceCounts,
    configuredEndpointBreakdownByCountry,
  };
}

export function getCountryCode(country: string): string | null {
  const { countryCodes } = loadAtlasSourceMeta();
  return countryCodes.get(country) || null;
}

export function getConfiguredDirectSourceCountByCountry(country: string): number {
  const { configuredSourcesByCountry } = loadAtlasSourceMeta();
  return configuredSourcesByCountry.get(country) || 0;
}

export function getConfiguredDirectSourcesTotal(): number {
  const { configuredSourcesByCountry } = loadAtlasSourceMeta();
  let total = 0;
  for (const count of configuredSourcesByCountry.values()) {
    total += count;
  }
  return total;
}

export function getConfiguredDirectSourceEndpointBreakdownByCountry(country: string): SourceEndpointBreakdown {
  const { configuredEndpointBreakdownByCountry } = loadAtlasSourceMeta();
  return cloneSourceEndpointBreakdown(configuredEndpointBreakdownByCountry.get(country));
}

export function getConfiguredDirectSourceEndpointBreakdownTotal(): SourceEndpointBreakdown {
  const { configuredEndpointBreakdownByCountry } = loadAtlasSourceMeta();
  const total = emptySourceEndpointBreakdown();
  for (const breakdown of configuredEndpointBreakdownByCountry.values()) {
    total.rssOnly += breakdown.rssOnly;
    total.newsSitemapOnly += breakdown.newsSitemapOnly;
    total.sitemapIndexOnly += breakdown.sitemapIndexOnly;
    total.otherSitemapOnly += breakdown.otherSitemapOnly;
    total.rssPlusNewsSitemap += breakdown.rssPlusNewsSitemap;
    total.rssPlusSitemapIndex += breakdown.rssPlusSitemapIndex;
    total.rssPlusOtherSitemap += breakdown.rssPlusOtherSitemap;
  }
  return total;
}

export function getSourceMeta(source: string): SourceMethodMeta | null {
  const { sourceMeta } = loadAtlasSourceMeta();
  return sourceMeta.get(normalizeSourceKey(source)) || null;
}

export function classifySourceMethod(meta: SourceMethodMeta | null): 'rss' | 'sitemap' | 'rss+sitemap' {
  if (meta?.hasRss && meta?.hasSitemap) return 'rss+sitemap';
  if (meta?.hasSitemap) return 'sitemap';
  return 'rss';
}

export function classifySourceSitemapKind(meta: SourceMethodMeta | null): SourceSitemapKind {
  return meta?.sitemapKind || 'none';
}

export function classifySourceEndpoint(meta: SourceMethodMeta | null): SourceEndpointProfile {
  return meta?.endpointProfile || 'rss_only';
}

export function classifySourceDistribution(meta: SourceMethodMeta | null): SourceDistributionClass {
  return meta?.distributionClass === 'portal' ? 'portal' : 'publisher';
}

export function isDirectPublisherSource(meta: SourceMethodMeta | null): boolean {
  if (!meta) return true;
  return meta.distributionClass !== 'portal';
}

export function resolvePublisherCountryForSource(
  sourceCountry: string | null | undefined,
  source: string,
  articleCountry?: string | null
): string | null {
  const normalizedSourceCountry = (sourceCountry || '').trim();
  if (normalizedSourceCountry) return normalizedSourceCountry;
  const meta = getSourceMeta(source);
  return meta?.country || articleCountry || null;
}

export function resolveSourceCountry(source: string, fallbackCountry?: string | null): string | null {
  const meta = getSourceMeta(source);
  return meta?.country || fallbackCountry || null;
}
