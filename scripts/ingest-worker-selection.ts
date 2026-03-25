import type { EndpointBackoffRow } from '../lib/news-ops-store';
import type { OutletFeed } from '../lib/types';

export type EndpointRun = {
  outlet: OutletFeed;
  method: 'rss' | 'sitemap';
  url: string;
};

export function buildEndpointRuns(
  selected: OutletFeed[],
  methodMatchesFilter: (method: 'rss' | 'sitemap', filter: any) => boolean,
  methodFilter: any
): {
  endpointLookup: Map<string, EndpointRun>;
  dedupedEndpoints: EndpointRun[];
  rssEndpoints: EndpointRun[];
  allSitemapEndpoints: EndpointRun[];
} {
  const endpointLookup = new Map<string, EndpointRun>();
  const allEndpoints: EndpointRun[] = selected.flatMap((outlet) => {
    const runs: EndpointRun[] = [];
    if (outlet.rssUrl && methodMatchesFilter('rss', methodFilter)) runs.push({ outlet, method: 'rss', url: outlet.rssUrl });
    if (outlet.sitemapUrl && methodMatchesFilter('sitemap', methodFilter)) runs.push({ outlet, method: 'sitemap', url: outlet.sitemapUrl });
    return runs;
  });
  for (const endpoint of allEndpoints) {
    endpointLookup.set(`${endpoint.outlet.id}:${endpoint.method}`, endpoint);
  }
  const dedupedEndpoints = [...endpointLookup.values()];
  return {
    endpointLookup,
    dedupedEndpoints,
    rssEndpoints: dedupedEndpoints.filter((endpoint) => endpoint.method === 'rss'),
    allSitemapEndpoints: dedupedEndpoints.filter((endpoint) => endpoint.method === 'sitemap'),
  };
}

export function buildFailingEndpointSet(rows: EndpointBackoffRow[], ignoreBackoff: boolean): Set<string> {
  if (ignoreBackoff) return new Set<string>();
  return new Set(rows.map((row) => `${row.outletId}:${row.method}`));
}

export function buildDisabledSitemapOutletIds(params: {
  rows: EndpointBackoffRow[];
  sitemapDisableEnabled: boolean;
  ignoreBackoff: boolean;
  minAttempts: number;
  minFailPct: number;
}): Set<string> {
  if (!params.sitemapDisableEnabled || params.ignoreBackoff) return new Set<string>();
  return new Set(
    params.rows
      .filter((row) => row.method === 'rss')
      .filter((row) => row.attempted >= params.minAttempts && row.failPct >= params.minFailPct)
      .map((row) => row.outletId),
  );
}

export function buildSitemapExecutionPlan(params: {
  allSitemapEndpoints: EndpointRun[];
  failedRssOutletIds: Set<string>;
  enableExplicitSitemapParallel: boolean;
}): {
  explicitParallelSitemapEndpoints: EndpointRun[];
  fallbackSitemapEndpoints: EndpointRun[];
  sitemapEndpoints: EndpointRun[];
} {
  const explicitParallelSitemapEndpoints = params.enableExplicitSitemapParallel
    ? params.allSitemapEndpoints.filter((endpoint) => endpoint.outlet.hasExplicitSitemapUrl)
    : [];
  const explicitParallelEndpointKeys = new Set(
    explicitParallelSitemapEndpoints.map((endpoint) => `${endpoint.outlet.id}:${endpoint.method}`)
  );
  const fallbackSitemapEndpoints = params.allSitemapEndpoints.filter(
    (endpoint) => params.failedRssOutletIds.has(endpoint.outlet.id) && !explicitParallelEndpointKeys.has(`${endpoint.outlet.id}:${endpoint.method}`)
  );
  return {
    explicitParallelSitemapEndpoints,
    fallbackSitemapEndpoints,
    sitemapEndpoints: [...explicitParallelSitemapEndpoints, ...fallbackSitemapEndpoints],
  };
}
