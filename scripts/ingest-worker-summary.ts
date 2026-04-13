import type { NewsItem } from '../lib/types';
import type { IngestionEndpointRun } from '../lib/ingestion-store';
import { formatPercent } from './ingest-worker-support';

type WorkerSummary = {
  generatedAt: string;
  elapsedMs: number;
  worker: {
    outletsTotal: number;
    outletsAfterCountryFilter: number;
    outletsAfterSourceFilter: number;
    outletsSelected: number;
    outletOffset: number;
    nextOutletOffset: number;
    countryFilter: string[] | null;
    sourceFilter: string[] | null;
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
    articlePageFallback: {
      pageFetch: {
        fetchesStarted: number;
        cacheHits: number;
        fetchFailures: number;
        totalElapsedMs: number;
        averageElapsedMs: number;
      };
      title: {
        requested: number;
        triggered: number;
        fulfilled: number;
        budgetSkipped: number;
      };
      publishedAt: {
        requested: number;
        triggered: number;
        fulfilled: number;
        budgetSkipped: number;
      };
      metaCategory: {
        requested: number;
        triggered: number;
        fulfilled: number;
        budgetSkipped: number;
      };
    };
    selection: {
      mode: 'all' | 'chunk' | 'hybrid';
      reason: string;
      dbBacked: boolean;
      pinnedOutlets: number;
      pinnedReason: string | null;
      headOutlets: number;
      longTailOutlets: number;
      longTailSelected: number;
      headWindowHours: number | null;
      headMinArticles: number | null;
      headMaxOutlets: number | null;
      rotationHours: number | null;
      rotationBucket: number | null;
      longTailBucketOffset: number | null;
      longTailBucketNextOffset: number | null;
      longTailBucketSize: number | null;
      maxOutletsPerRun: number | null;
      reservedLongTailOutlets: number | null;
      budgetCapped: boolean;
    };
    mergedItemsBySource: Array<{
      source: string;
      count: number;
    }>;
  };
};

function buildSourceCounts(items: NewsItem[]): Array<{ source: string; count: number }> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const source = (item.source || '').trim() || '(unknown)';
    counts.set(source, (counts.get(source) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .map(([source, count]) => ({ source, count }));
}

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
  sourceFilteredOutletsCount: number;
  selectedCount: number;
  offset: number;
  nextOffset: number;
  countryFilter: string[] | null;
  sourceFilter: string[] | null;
  methodFilter: ('rss' | 'sitemap')[] | null;
  diagnostics: IngestionEndpointRun[];
  mergedItems: NewsItem[];
  persistedArticles: number;
  persistedMissingPublishedAt: number;
  persistedDiagnostics: number;
  fallbackSummary: WorkerSummary['worker']['fallback'];
  articlePageFallbackSummary: WorkerSummary['worker']['articlePageFallback'];
  selectionSummary: WorkerSummary['worker']['selection'];
}): WorkerSummary {
  const counts = summarizeEndpointResults(params.diagnostics);
  return {
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - params.started,
    worker: {
      outletsTotal: params.allOutletsCount,
      outletsAfterCountryFilter: params.countryFilteredOutletsCount,
      outletsAfterSourceFilter: params.sourceFilteredOutletsCount,
      outletsSelected: params.selectedCount,
      outletOffset: params.offset,
      nextOutletOffset: params.nextOffset,
      countryFilter: params.countryFilter,
      sourceFilter: params.sourceFilter,
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
      articlePageFallback: params.articlePageFallbackSummary,
      selection: params.selectionSummary,
      mergedItemsBySource: buildSourceCounts(params.mergedItems),
    },
  };
}

export function formatWorkerSummaryLog(params: {
  selectedCount: number;
  countryFilteredOutletsCount: number;
  sourceFilteredOutletsCount: number;
  allOutletsCount: number;
  attempted: number;
  ok: number;
  failed: number;
  countryFilter: string[] | null;
  sourceFilter: string[] | null;
  backfillLabel: string;
  explicitSitemapParallel: boolean;
  failingKeysSize: number;
  fallbackSummary: WorkerSummary['worker']['fallback'];
  articlePageFallbackSummary: WorkerSummary['worker']['articlePageFallback'];
  selectionSummary: WorkerSummary['worker']['selection'];
  methodStats: Record<'rss' | 'sitemap', { attempted: number; ok: number; fail: number }>;
  mergedCount: number;
  persistedArticles: number;
  elapsedMs: number;
  missingPublishedAtPersisted: number;
  mergedItemsBySource: Array<{ source: string; count: number }>;
}): string {
  const topSourceSummary = params.mergedItemsBySource
    .slice(0, 5)
    .map(({ source, count }) => `${source}:${count}`)
    .join(', ');
  const selectionSummary = params.selectionSummary.mode === 'hybrid'
    ? `selection=hybrid(${params.selectionSummary.reason}) pinned=${params.selectionSummary.pinnedOutlets}${params.selectionSummary.pinnedReason ? `(${params.selectionSummary.pinnedReason})` : ''} head=${params.selectionSummary.headOutlets} long_tail=${params.selectionSummary.longTailOutlets} long_tail_selected=${params.selectionSummary.longTailSelected} rotation=${(params.selectionSummary.rotationBucket ?? 0) + 1}/${params.selectionSummary.rotationHours ?? 1} bucket_offset=${params.selectionSummary.longTailBucketOffset ?? 0}->${params.selectionSummary.longTailBucketNextOffset ?? 0}/${params.selectionSummary.longTailBucketSize ?? 0} cap=${params.selectionSummary.maxOutletsPerRun ?? 'none'} reserved_long_tail=${params.selectionSummary.reservedLongTailOutlets ?? 0} capped=${params.selectionSummary.budgetCapped ? 'yes' : 'no'}`
    : `selection=${params.selectionSummary.mode}(${params.selectionSummary.reason})`;
  return (
    `[ingest-worker] outlets=${params.selectedCount}/${params.sourceFilteredOutletsCount}/${params.countryFilteredOutletsCount}/${params.allOutletsCount} endpoints=${params.attempted} ok=${params.ok} failed=${params.failed} ` +
    `country_filter=${params.countryFilter ? params.countryFilter.join('|') : 'ALL'} ` +
    `source_filter=${params.sourceFilter ? params.sourceFilter.join('|') : 'ALL'} ` +
    `backfill=${params.backfillLabel} ` +
    `${selectionSummary} ` +
    `explicit_sitemap_parallel=${params.explicitSitemapParallel ? 'on' : 'off'} ` +
    `backoff_skipped_total=${params.failingKeysSize} backoff_skipped=[rss=${params.fallbackSummary.rssBackoffSkipped}, sitemap=${params.fallbackSummary.sitemapBackoffSkipped}] ` +
    `sitemap_policy_disabled=${params.fallbackSummary.sitemapPolicyDisabled} ` +
    `article_page_fetch=[fetches=${params.articlePageFallbackSummary.pageFetch.fetchesStarted}, cache_hits=${params.articlePageFallbackSummary.pageFetch.cacheHits}, failures=${params.articlePageFallbackSummary.pageFetch.fetchFailures}, total_elapsed_ms=${params.articlePageFallbackSummary.pageFetch.totalElapsedMs}, avg_elapsed_ms=${params.articlePageFallbackSummary.pageFetch.averageElapsedMs}] ` +
    `title_fallback=[requested=${params.articlePageFallbackSummary.title.requested}, triggered=${params.articlePageFallbackSummary.title.triggered}, fulfilled=${params.articlePageFallbackSummary.title.fulfilled}, budget_skipped=${params.articlePageFallbackSummary.title.budgetSkipped}] ` +
    `published_at_fallback=[requested=${params.articlePageFallbackSummary.publishedAt.requested}, triggered=${params.articlePageFallbackSummary.publishedAt.triggered}, fulfilled=${params.articlePageFallbackSummary.publishedAt.fulfilled}, budget_skipped=${params.articlePageFallbackSummary.publishedAt.budgetSkipped}] ` +
    `meta_category_fallback=[requested=${params.articlePageFallbackSummary.metaCategory.requested}, triggered=${params.articlePageFallbackSummary.metaCategory.triggered}, fulfilled=${params.articlePageFallbackSummary.metaCategory.fulfilled}, budget_skipped=${params.articlePageFallbackSummary.metaCategory.budgetSkipped}] ` +
    `method_stats= [rss attempted=${params.methodStats.rss.attempted}, ok=${params.methodStats.rss.ok}, fail=${params.methodStats.rss.fail}(${formatPercent(params.methodStats.rss.fail, params.methodStats.rss.attempted)}%); ` +
    `[sitemap attempted=${params.methodStats.sitemap.attempted}, ok=${params.methodStats.sitemap.ok}, fail=${params.methodStats.sitemap.fail}(${formatPercent(params.methodStats.sitemap.fail, params.methodStats.sitemap.attempted)}%)] ` +
    `sitemapFallback=${params.fallbackSummary.rssSitemapFallbackSuccess}/${params.fallbackSummary.rssSitemapFallbackAttempts} skipped=${params.fallbackSummary.rssSitemapFallbackSkipped} unique=${params.mergedCount} persisted=${params.persistedArticles} newsArticles=${params.persistedArticles} elapsedMs=${params.elapsedMs}` +
    ` top_sources=[${topSourceSummary}]` +
    ` missingPublishedAtPersisted=${params.missingPublishedAtPersisted}`
  );
}
