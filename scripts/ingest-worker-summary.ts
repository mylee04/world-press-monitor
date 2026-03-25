import type { NewsItem } from '../lib/types';
import type { IngestionEndpointRun, MissingPublishedAtCandidate, SitemapPolicyState } from '../lib/ingestion-store';
import { formatPercent } from './ingest-worker-support';

type EndpointResult = {
  items: NewsItem[];
  run: IngestionEndpointRun;
  fallbackUsed: 'none' | 'sitemap';
};

type WorkerSummary = {
  generatedAt: string;
  elapsedMs: number;
  worker: {
    outletsTotal: number;
    outletsAfterCountryFilter: number;
    outletsSelected: number;
    outletOffset: number;
    nextOutletOffset: number;
    countryFilter: string[] | null;
    methodFilter: ('rss' | 'sitemap')[] | null;
    endpointsAttempted: number;
    endpointsOk: number;
    endpointsFailed: number;
    endpointFailureRate: number;
    uniqueItems: number;
    persisted: number;
    newsArticlesPersisted: number;
    missingPublishedAtPersisted: number;
    diagnosticsPersisted: number;
    fallback: {
      rssSitemapFallbackAttempts: number;
      rssSitemapFallbackSuccess: number;
      rssSitemapFallbackSkipped: number;
      rssBackoffSkipped: number;
      sitemapBackoffSkipped: number;
      sitemapPolicyDisabled: number;
    };
  };
};

export function summarizeEndpointResults(results: Array<{ attempted: boolean; ok: boolean }>) {
  const attempted = results.filter((d) => d.attempted).length;
  const ok = results.filter((d) => d.attempted && d.ok).length;
  const failed = results.filter((d) => d.attempted && !d.ok).length;
  return { attempted, ok, failed };
}

export function buildWorkerSummary(params: {
  started: number;
  allOutletsCount: number;
  countryFilteredOutletsCount: number;
  selectedCount: number;
  offset: number;
  nextOffset: number;
  countryFilter: string[] | null;
  methodFilter: ('rss' | 'sitemap')[] | null;
  diagnostics: IngestionEndpointRun[];
  mergedItems: NewsItem[];
  persistedArticles: number;
  persistedMissingPublishedAt: number;
  persistedDiagnostics: number;
  fallbackSummary: WorkerSummary['worker']['fallback'];
}): WorkerSummary {
  const counts = summarizeEndpointResults(params.diagnostics);
  return {
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - params.started,
    worker: {
      outletsTotal: params.allOutletsCount,
      outletsAfterCountryFilter: params.countryFilteredOutletsCount,
      outletsSelected: params.selectedCount,
      outletOffset: params.offset,
      nextOutletOffset: params.nextOffset,
      countryFilter: params.countryFilter,
      methodFilter: params.methodFilter,
      endpointsAttempted: counts.attempted,
      endpointsOk: counts.ok,
      endpointsFailed: counts.failed,
      endpointFailureRate: counts.attempted > 0 ? counts.failed / counts.attempted : 0,
      uniqueItems: params.mergedItems.length,
      persisted: params.persistedArticles,
      newsArticlesPersisted: params.persistedArticles,
      missingPublishedAtPersisted: params.persistedMissingPublishedAt,
      diagnosticsPersisted: params.persistedDiagnostics,
      fallback: params.fallbackSummary,
    },
  };
}

export function formatWorkerSummaryLog(params: {
  selectedCount: number;
  countryFilteredOutletsCount: number;
  allOutletsCount: number;
  attempted: number;
  ok: number;
  failed: number;
  countryFilter: string[] | null;
  backfillLabel: string;
  explicitSitemapParallel: boolean;
  failingKeysSize: number;
  fallbackSummary: WorkerSummary['worker']['fallback'];
  methodStats: Record<'rss' | 'sitemap', { attempted: number; ok: number; fail: number }>;
  mergedCount: number;
  persistedArticles: number;
  elapsedMs: number;
  missingPublishedAtPersisted: number;
}): string {
  return (
    `[ingest-worker] outlets=${params.selectedCount}/${params.countryFilteredOutletsCount}/${params.allOutletsCount} endpoints=${params.attempted} ok=${params.ok} failed=${params.failed} ` +
    `country_filter=${params.countryFilter ? params.countryFilter.join('|') : 'ALL'} ` +
    `backfill=${params.backfillLabel} ` +
    `explicit_sitemap_parallel=${params.explicitSitemapParallel ? 'on' : 'off'} ` +
    `backoff_skipped_total=${params.failingKeysSize} backoff_skipped=[rss=${params.fallbackSummary.rssBackoffSkipped}, sitemap=${params.fallbackSummary.sitemapBackoffSkipped}] ` +
    `sitemap_policy_disabled=${params.fallbackSummary.sitemapPolicyDisabled} ` +
    `method_stats= [rss attempted=${params.methodStats.rss.attempted}, ok=${params.methodStats.rss.ok}, fail=${params.methodStats.rss.fail}(${formatPercent(params.methodStats.rss.fail, params.methodStats.rss.attempted)}%); ` +
    `[sitemap attempted=${params.methodStats.sitemap.attempted}, ok=${params.methodStats.sitemap.ok}, fail=${params.methodStats.sitemap.fail}(${formatPercent(params.methodStats.sitemap.fail, params.methodStats.sitemap.attempted)}%)] ` +
    `sitemapFallback=${params.fallbackSummary.rssSitemapFallbackSuccess}/${params.fallbackSummary.rssSitemapFallbackAttempts} skipped=${params.fallbackSummary.rssSitemapFallbackSkipped} unique=${params.mergedCount} persisted=${params.persistedArticles} newsArticles=${params.persistedArticles} elapsedMs=${params.elapsedMs}` +
    ` missingPublishedAtPersisted=${params.missingPublishedAtPersisted}`
  );
}
