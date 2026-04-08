'use client';

import { useDeferredValue, useEffect, useState } from 'react';
import styles from '@/components/ops-page.module.css';
import type { NewsApiFiltersResponse, NewsApiItem, NewsApiResponse } from '@/lib/news-api';
import type {
  OpsBenchmarkGranularity,
  OpsBenchmarkMetricsResponse,
  OpsFeedStatusResponse,
  OpsIngestRunsResponse,
  OpsMapMetricKind,
  OpsMapMetricsResponse,
  OpsSortDirection,
} from '@/lib/ops-types';

type OpsTableTab = 'articles' | 'ingestRuns' | 'feedStatus' | 'benchmarkMetrics' | 'mapMetrics';
type ArticleSortKey = 'publicationDatetime' | 'createdAt' | 'updatedAt' | 'source' | 'country' | 'category';

const ARTICLE_WINDOW_OPTIONS = [
  { label: '6h', value: '6' },
  { label: '24h', value: '24' },
  { label: '72h', value: '72' },
  { label: '7d', value: '168' },
];

const INGEST_WINDOW_OPTIONS = [
  { label: '6h', value: '6' },
  { label: '24h', value: '24' },
  { label: '72h', value: '72' },
  { label: '7d', value: '168' },
];

const BENCHMARK_RANGE_OPTIONS: Record<OpsBenchmarkGranularity, Array<{ label: string; value: string }>> = {
  hourly: [
    { label: '24h', value: '24' },
    { label: '72h', value: '72' },
    { label: '7d', value: '168' },
  ],
  daily: [
    { label: '7d', value: '7' },
    { label: '30d', value: '30' },
    { label: '90d', value: '90' },
  ],
};

function formatInt(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0';
  return value.toLocaleString();
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0.0%';
  return `${(value * 100).toFixed(1)}%`;
}

function formatBps(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0.0%';
  return `${(value / 100).toFixed(1)}%`;
}

function formatHours(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Unavailable';
  return `${value.toFixed(1)}h`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Unavailable';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
}

function extractArticleDomain(row: NewsApiItem): string {
  try {
    return new URL(row.url).hostname.replace(/^www\./, '');
  } catch {
    return 'No domain';
  }
}

function normalizeText(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase();
}

function parseDateValue(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareArticleRows(left: NewsApiItem, right: NewsApiItem, sortKey: ArticleSortKey): number {
  switch (sortKey) {
    case 'createdAt':
      return parseDateValue(right.createdAt) - parseDateValue(left.createdAt);
    case 'updatedAt':
      return parseDateValue(right.updatedAt) - parseDateValue(left.updatedAt);
    case 'source':
      return normalizeText(left.sourceDisplay || left.source).localeCompare(normalizeText(right.sourceDisplay || right.source));
    case 'country':
      return normalizeText(left.country).localeCompare(normalizeText(right.country));
    case 'category':
      return normalizeText(left.primarySection || left.sections[0] || '').localeCompare(
        normalizeText(right.primarySection || right.sections[0] || ''),
      );
    case 'publicationDatetime':
    default:
      return parseDateValue(right.publicationDatetime) - parseDateValue(left.publicationDatetime);
  }
}

function toIsoFromLocalInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

type PaginationProps = {
  offset: number;
  limit: number;
  total: number;
  currentCount: number;
  hasMore?: boolean;
  totalIsEstimate?: boolean;
  onPrev: () => void;
  onNext: () => void;
};

function PaginationRow({ offset, limit, total, currentCount, hasMore, totalIsEstimate, onPrev, onNext }: PaginationProps) {
  const rangeStart = total > 0 ? offset + 1 : 0;
  const rangeEnd = total > 0 ? offset + currentCount : 0;
  const hasPrev = offset > 0;
  const hasNext = typeof hasMore === 'boolean' ? hasMore : offset + limit < total;

  return (
    <div className={styles.paginationRow}>
      <button className={styles.pageButton} type="button" onClick={onPrev} disabled={!hasPrev}>
        Previous
      </button>
      <span className={styles.pageMeta}>
        {rangeStart > 0 ? `${rangeStart}-${rangeEnd}` : '0'} of {formatInt(total)}{totalIsEstimate ? '+' : ''}
      </span>
      <button className={styles.pageButton} type="button" onClick={onNext} disabled={!hasNext}>
        Next
      </button>
    </div>
  );
}

export function OpsExplorer() {
  const [activeTab, setActiveTab] = useState<OpsTableTab>('articles');

  const [articleFilters, setArticleFilters] = useState<NewsApiFiltersResponse['filters'] | null>(null);
  const [articlePayload, setArticlePayload] = useState<NewsApiResponse | null>(null);
  const [articleLoading, setArticleLoading] = useState(false);
  const [articleError, setArticleError] = useState<string | null>(null);
  const [articleWindowHours, setArticleWindowHours] = useState('24');
  const [articleCountry, setArticleCountry] = useState('');
  const [articleSection, setArticleSection] = useState('');
  const [articleQuery, setArticleQuery] = useState('');
  const [articleSourceSearch, setArticleSourceSearch] = useState('');
  const [articlePublicationFrom, setArticlePublicationFrom] = useState('');
  const [articlePublicationTo, setArticlePublicationTo] = useState('');
  const [articleSort, setArticleSort] = useState<ArticleSortKey>('publicationDatetime');
  const [articleDirection, setArticleDirection] = useState<OpsSortDirection>('desc');
  const [articleLimit, setArticleLimit] = useState('50');
  const [articleOffset, setArticleOffset] = useState(0);
  const deferredArticleQuery = useDeferredValue(articleQuery);
  const deferredArticleSourceSearch = useDeferredValue(articleSourceSearch);
  const deferredArticlePublicationFrom = useDeferredValue(articlePublicationFrom);
  const deferredArticlePublicationTo = useDeferredValue(articlePublicationTo);

  const [ingestPayload, setIngestPayload] = useState<OpsIngestRunsResponse | null>(null);
  const [ingestLoading, setIngestLoading] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [ingestHours, setIngestHours] = useState('24');
  const [ingestRunner, setIngestRunner] = useState('');
  const [ingestMethod, setIngestMethod] = useState('');
  const [ingestSearch, setIngestSearch] = useState('');
  const [ingestSort, setIngestSort] = useState('bucket');
  const [ingestDirection, setIngestDirection] = useState<OpsSortDirection>('desc');
  const [ingestLimit, setIngestLimit] = useState('50');
  const [ingestOffset, setIngestOffset] = useState(0);
  const deferredIngestSearch = useDeferredValue(ingestSearch);

  const [feedPayload, setFeedPayload] = useState<OpsFeedStatusResponse | null>(null);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [feedMethod, setFeedMethod] = useState('');
  const [feedSearch, setFeedSearch] = useState('');
  const [feedSort, setFeedSort] = useState('lagHours');
  const [feedDirection, setFeedDirection] = useState<OpsSortDirection>('desc');
  const [feedLimit, setFeedLimit] = useState('50');
  const [feedOffset, setFeedOffset] = useState(0);
  const deferredFeedSearch = useDeferredValue(feedSearch);

  const [benchmarkPayload, setBenchmarkPayload] = useState<OpsBenchmarkMetricsResponse | null>(null);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null);
  const [benchmarkGranularity, setBenchmarkGranularity] = useState<OpsBenchmarkGranularity>('hourly');
  const [benchmarkRange, setBenchmarkRange] = useState('72');
  const [benchmarkSearch, setBenchmarkSearch] = useState('');
  const [benchmarkSort, setBenchmarkSort] = useState('bucket');
  const [benchmarkDirection, setBenchmarkDirection] = useState<OpsSortDirection>('desc');
  const [benchmarkLimit, setBenchmarkLimit] = useState('50');
  const [benchmarkOffset, setBenchmarkOffset] = useState(0);
  const deferredBenchmarkSearch = useDeferredValue(benchmarkSearch);

  const [mapPayload, setMapPayload] = useState<OpsMapMetricsResponse | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapKind, setMapKind] = useState<OpsMapMetricKind>('countries');
  const [mapMetricWindow, setMapMetricWindow] = useState('24h');
  const [mapSort, setMapSort] = useState('generatedAt');
  const [mapDirection, setMapDirection] = useState<OpsSortDirection>('desc');
  const [mapLimit, setMapLimit] = useState('50');
  const [mapOffset, setMapOffset] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/ops/article-filters/', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message || 'Failed to load article filters.');
        }
        return (await response.json()) as NewsApiFiltersResponse;
      })
      .then((payload) => {
        setArticleFilters(payload.filters);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setArticleFilters({ countries: [], languages: [], sections: [], sources: [] });
        }
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    setArticleOffset(0);
  }, [
    articleWindowHours,
    articleCountry,
    articleSection,
    deferredArticleQuery,
    deferredArticlePublicationFrom,
    deferredArticlePublicationTo,
    articleSort,
    articleDirection,
    articleLimit,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      hours: articleWindowHours,
      limit: articleLimit,
      offset: String(articleOffset),
      sort: articleSort,
      direction: articleDirection,
    });

    if (articleCountry) params.set('countries', articleCountry);
    if (articleSection) params.set('sections', articleSection);
    if (deferredArticleQuery.trim()) params.set('q', deferredArticleQuery.trim());

    const publicationFromIso = toIsoFromLocalInput(deferredArticlePublicationFrom);
    const publicationToIso = toIsoFromLocalInput(deferredArticlePublicationTo);
    if (publicationFromIso) params.set('publicationFrom', publicationFromIso);
    if (publicationToIso) params.set('publicationTo', publicationToIso);

    setArticleLoading(true);
    setArticleError(null);

    fetch(`/api/ops/articles/?${params.toString()}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message || 'Failed to load article rows.');
        }
        return (await response.json()) as NewsApiResponse;
      })
      .then((payload) => {
        setArticlePayload(payload);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setArticlePayload(null);
        setArticleError(error instanceof Error ? error.message : 'Failed to load article rows.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setArticleLoading(false);
      });

    return () => controller.abort();
  }, [
    articleWindowHours,
    articleCountry,
    articleSection,
    deferredArticleQuery,
    deferredArticlePublicationFrom,
    deferredArticlePublicationTo,
    articleSort,
    articleDirection,
    articleLimit,
    articleOffset,
  ]);

  useEffect(() => {
    setIngestOffset(0);
  }, [ingestHours, ingestRunner, ingestMethod, deferredIngestSearch, ingestSort, ingestDirection, ingestLimit]);

  useEffect(() => {
    if (activeTab !== 'ingestRuns') return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      hours: ingestHours,
      limit: ingestLimit,
      offset: String(ingestOffset),
      sort: ingestSort,
      direction: ingestDirection,
    });
    if (ingestRunner) params.set('runner', ingestRunner);
    if (ingestMethod) params.set('method', ingestMethod);
    if (deferredIngestSearch.trim()) params.set('q', deferredIngestSearch.trim());

    setIngestLoading(true);
    setIngestError(null);

    fetch(`/api/ops/ingest-runs/?${params.toString()}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message || 'Failed to load ingest runs.');
        }
        return (await response.json()) as OpsIngestRunsResponse;
      })
      .then((payload) => {
        setIngestPayload(payload);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setIngestPayload(null);
        setIngestError(error instanceof Error ? error.message : 'Failed to load ingest runs.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIngestLoading(false);
      });

    return () => controller.abort();
  }, [activeTab, ingestHours, ingestRunner, ingestMethod, deferredIngestSearch, ingestSort, ingestDirection, ingestLimit, ingestOffset]);

  useEffect(() => {
    setFeedOffset(0);
  }, [feedMethod, deferredFeedSearch, feedSort, feedDirection, feedLimit]);

  useEffect(() => {
    if (activeTab !== 'feedStatus') return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      limit: feedLimit,
      offset: String(feedOffset),
      sort: feedSort,
      direction: feedDirection,
    });
    if (feedMethod) params.set('method', feedMethod);
    if (deferredFeedSearch.trim()) params.set('q', deferredFeedSearch.trim());

    setFeedLoading(true);
    setFeedError(null);

    fetch(`/api/ops/feed-status/?${params.toString()}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message || 'Failed to load feed status.');
        }
        return (await response.json()) as OpsFeedStatusResponse;
      })
      .then((payload) => {
        setFeedPayload(payload);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setFeedPayload(null);
        setFeedError(error instanceof Error ? error.message : 'Failed to load feed status.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setFeedLoading(false);
      });

    return () => controller.abort();
  }, [activeTab, feedMethod, deferredFeedSearch, feedSort, feedDirection, feedLimit, feedOffset]);

  useEffect(() => {
    setBenchmarkRange(benchmarkGranularity === 'hourly' ? '72' : '30');
    setBenchmarkOffset(0);
  }, [benchmarkGranularity]);

  useEffect(() => {
    setBenchmarkOffset(0);
  }, [benchmarkRange, deferredBenchmarkSearch, benchmarkSort, benchmarkDirection, benchmarkLimit]);

  useEffect(() => {
    if (activeTab !== 'benchmarkMetrics') return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      granularity: benchmarkGranularity,
      range: benchmarkRange,
      limit: benchmarkLimit,
      offset: String(benchmarkOffset),
      sort: benchmarkSort,
      direction: benchmarkDirection,
    });
    if (deferredBenchmarkSearch.trim()) params.set('q', deferredBenchmarkSearch.trim());

    setBenchmarkLoading(true);
    setBenchmarkError(null);

    fetch(`/api/ops/benchmark-metrics/?${params.toString()}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message || 'Failed to load benchmark metrics.');
        }
        return (await response.json()) as OpsBenchmarkMetricsResponse;
      })
      .then((payload) => {
        setBenchmarkPayload(payload);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setBenchmarkPayload(null);
        setBenchmarkError(error instanceof Error ? error.message : 'Failed to load benchmark metrics.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setBenchmarkLoading(false);
      });

    return () => controller.abort();
  }, [
    activeTab,
    benchmarkGranularity,
    benchmarkRange,
    deferredBenchmarkSearch,
    benchmarkSort,
    benchmarkDirection,
    benchmarkLimit,
    benchmarkOffset,
  ]);

  useEffect(() => {
    setMapOffset(0);
  }, [mapKind, mapMetricWindow, mapSort, mapDirection, mapLimit]);

  useEffect(() => {
    if (activeTab !== 'mapMetrics') return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      kind: mapKind,
      metricWindow: mapMetricWindow,
      limit: mapLimit,
      offset: String(mapOffset),
      sort: mapSort,
      direction: mapDirection,
    });

    setMapLoading(true);
    setMapError(null);

    fetch(`/api/ops/map-metrics/?${params.toString()}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message || 'Failed to load map metrics.');
        }
        return (await response.json()) as OpsMapMetricsResponse;
      })
      .then((payload) => {
        setMapPayload(payload);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setMapPayload(null);
        setMapError(error instanceof Error ? error.message : 'Failed to load map metrics.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setMapLoading(false);
      });

    return () => controller.abort();
  }, [activeTab, mapKind, mapMetricWindow, mapSort, mapDirection, mapLimit, mapOffset]);

  const articleRows = (articlePayload?.items || [])
    .filter((row) => {
      const query = deferredArticleSourceSearch.trim().toLowerCase();
      if (!query) return true;
      return (
        row.source.toLowerCase().includes(query)
        || row.sourceDisplay.toLowerCase().includes(query)
        || extractArticleDomain(row).toLowerCase().includes(query)
      );
    })
    .sort((left, right) => {
      const base = compareArticleRows(left, right, articleSort);
      if (base !== 0) return articleDirection === 'asc' ? -base : base;
      const fallback = parseDateValue(right.publicationDatetime) - parseDateValue(left.publicationDatetime);
      if (fallback !== 0) return fallback;
      return normalizeText(left.title).localeCompare(normalizeText(right.title));
    });

  const tabButtons: Array<{ key: OpsTableTab; label: string }> = [
    { key: 'articles', label: 'Articles' },
    { key: 'ingestRuns', label: 'Ingest Runs' },
    { key: 'feedStatus', label: 'Feed Status' },
    { key: 'benchmarkMetrics', label: 'Benchmark Metrics' },
    { key: 'mapMetrics', label: 'Map Metrics' },
  ];

  return (
    <section className={styles.explorerSection}>
      <div className={styles.explorerHeader}>
        <div>
          <div className="eyebrow">Private Table Browser</div>
          <h2>Inspect real rows, not just summaries.</h2>
          <p>Browse raw articles plus ingest, feed, benchmark, and map tables in a hidden internal viewer.</p>
        </div>
      </div>

      <div className={styles.tabBar}>
        {tabButtons.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={tab.key === activeTab ? `${styles.tabButton} ${styles.tabButtonActive}` : styles.tabButton}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'articles' ? (
        <article className={`${styles.explorerPanel} ${styles.widePanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <h3>Articles</h3>
              <p>`news_articles` rows with title, source, country, category, publication time, and URL.</p>
            </div>
            <div className={styles.controlRow}>
              <select className={styles.control} value={articleWindowHours} onChange={(event) => setArticleWindowHours(event.target.value)}>
                {ARTICLE_WINDOW_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    Window {option.label}
                  </option>
                ))}
              </select>
              <select className={styles.control} value={articleCountry} onChange={(event) => setArticleCountry(event.target.value)}>
                <option value="">All countries</option>
                {(articleFilters?.countries || []).map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
              <select className={styles.control} value={articleSection} onChange={(event) => setArticleSection(event.target.value)}>
                <option value="">All categories</option>
                {(articleFilters?.sections || []).map((section) => (
                  <option key={section} value={section}>
                    {section}
                  </option>
                ))}
              </select>
              <select className={styles.control} value={articleSort} onChange={(event) => setArticleSort(event.target.value as ArticleSortKey)}>
                <option value="publicationDatetime">Sort by publication</option>
                <option value="createdAt">Sort by ingested</option>
                <option value="updatedAt">Sort by updated</option>
                <option value="source">Sort by source</option>
                <option value="country">Sort by country</option>
                <option value="category">Sort by category</option>
              </select>
              <select className={styles.control} value={articleDirection} onChange={(event) => setArticleDirection(event.target.value as OpsSortDirection)}>
                <option value="desc">Newest / Z-A first</option>
                <option value="asc">Oldest / A-Z first</option>
              </select>
              <select className={styles.control} value={articleLimit} onChange={(event) => setArticleLimit(event.target.value)}>
                <option value="50">50 rows</option>
                <option value="100">100 rows</option>
                <option value="200">200 rows</option>
              </select>
            </div>
          </div>

          <div className={styles.articleFiltersGrid}>
            <input
              className={styles.searchInput}
              type="search"
              value={articleQuery}
              onChange={(event) => setArticleQuery(event.target.value)}
              placeholder="Search title, snippet, keyword"
            />
            <input
              className={styles.searchInput}
              type="search"
              value={articleSourceSearch}
              onChange={(event) => setArticleSourceSearch(event.target.value)}
              placeholder="Filter visible rows by source or domain"
            />
            <input
              className={styles.searchInput}
              type="datetime-local"
              value={articlePublicationFrom}
              onChange={(event) => setArticlePublicationFrom(event.target.value)}
              aria-label="Published after"
            />
            <input
              className={styles.searchInput}
              type="datetime-local"
              value={articlePublicationTo}
              onChange={(event) => setArticlePublicationTo(event.target.value)}
              aria-label="Published before"
            />
          </div>

          <div className={styles.summaryRow}>
            <span className={styles.chip}>{articlePayload?.storage || 'unknown'}</span>
            <span className={styles.chip}>{formatInt(articlePayload?.total)} total rows</span>
            <span className={styles.chip}>{formatDateTime(articlePayload?.generatedAt)}</span>
          </div>

          {articleLoading ? <div className={styles.emptyState}>Loading raw article rows…</div> : null}
          {articleError ? <div className={styles.emptyState}>{articleError}</div> : null}

          {!articleLoading && !articleError ? (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Published</th>
                      <th>Ingested</th>
                      <th>Country</th>
                      <th>Source</th>
                      <th>Category</th>
                      <th>Title</th>
                    </tr>
                  </thead>
                  <tbody>
                    {articleRows.length === 0 ? (
                      <tr>
                        <td colSpan={6}>
                          <div className={styles.emptyInline}>No article rows matched these filters.</div>
                        </td>
                      </tr>
                    ) : (
                      articleRows.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <strong>{formatDateTime(row.publicationDatetime)}</strong>
                            <span>{row.language || 'Unknown language'}</span>
                          </td>
                          <td>
                            <strong>{formatDateTime(row.createdAt)}</strong>
                            <span>{formatDateTime(row.updatedAt)}</span>
                          </td>
                          <td>
                            <strong>{row.country || 'Unknown'}</strong>
                            <span>{extractArticleDomain(row)}</span>
                          </td>
                          <td>
                            <strong>{row.sourceDisplay || row.source}</strong>
                            <span>{row.source}</span>
                          </td>
                          <td>
                            <strong>{row.primarySection || row.sections[0] || 'Unassigned'}</strong>
                            <span>{row.primaryTopic || row.topics[0] || 'No topic'}</span>
                          </td>
                          <td>
                            <a className={styles.articleLink} href={row.url} target="_blank" rel="noreferrer">
                              {row.title}
                            </a>
                            <span>{row.snippet || 'No snippet'}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

            <PaginationRow
              offset={articleOffset}
              limit={Number(articleLimit)}
              total={articlePayload?.total || 0}
              currentCount={articleRows.length}
              hasMore={articlePayload?.hasMore}
              totalIsEstimate={articlePayload?.totalIsEstimate}
              onPrev={() => setArticleOffset((current) => Math.max(0, current - Number(articleLimit)))}
              onNext={() => setArticleOffset((current) => current + Number(articleLimit))}
            />
            </>
          ) : null}
        </article>
      ) : null}

      {activeTab === 'ingestRuns' ? (
        <article className={`${styles.explorerPanel} ${styles.widePanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <h3>Ingest Runs</h3>
              <p>`ingest_ops_hourly` rows for feed runs, fetch volume, failures, and missing-field counts.</p>
            </div>
            <div className={styles.controlRow}>
              <select className={styles.control} value={ingestHours} onChange={(event) => setIngestHours(event.target.value)}>
                {INGEST_WINDOW_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    Window {option.label}
                  </option>
                ))}
              </select>
              <select className={styles.control} value={ingestRunner} onChange={(event) => setIngestRunner(event.target.value)}>
                <option value="">All runners</option>
                <option value="worker">worker</option>
                <option value="api_news">api_news</option>
                <option value="warm">warm</option>
              </select>
              <select className={styles.control} value={ingestMethod} onChange={(event) => setIngestMethod(event.target.value)}>
                <option value="">All methods</option>
                <option value="rss">rss</option>
                <option value="sitemap">sitemap</option>
              </select>
              <select className={styles.control} value={ingestSort} onChange={(event) => setIngestSort(event.target.value)}>
                <option value="bucket">Sort by bucket</option>
                <option value="fetchedCount">Sort by fetched</option>
                <option value="validCount">Sort by valid</option>
                <option value="failedRuns">Sort by failed</option>
                <option value="attemptedRuns">Sort by attempts</option>
                <option value="source">Sort by source</option>
                <option value="country">Sort by country</option>
              </select>
              <select className={styles.control} value={ingestDirection} onChange={(event) => setIngestDirection(event.target.value as OpsSortDirection)}>
                <option value="desc">Desc</option>
                <option value="asc">Asc</option>
              </select>
              <select className={styles.control} value={ingestLimit} onChange={(event) => setIngestLimit(event.target.value)}>
                <option value="50">50 rows</option>
                <option value="100">100 rows</option>
                <option value="200">200 rows</option>
              </select>
            </div>
          </div>

          <input
            className={styles.searchInput}
            type="search"
            value={ingestSearch}
            onChange={(event) => setIngestSearch(event.target.value)}
            placeholder="Search source, outlet id, country"
          />

          <div className={styles.summaryRow}>
            <span className={styles.chip}>{ingestPayload?.storage || 'unknown'}</span>
            <span className={styles.chip}>{formatInt(ingestPayload?.total)} total rows</span>
            <span className={styles.chip}>{formatDateTime(ingestPayload?.generatedAt)}</span>
          </div>

          {ingestLoading ? <div className={styles.emptyState}>Loading ingest runs…</div> : null}
          {ingestError ? <div className={styles.emptyState}>{ingestError}</div> : null}

          {!ingestLoading && !ingestError ? (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Bucket</th>
                      <th>Source</th>
                      <th>Country</th>
                      <th>Method</th>
                      <th>Attempts</th>
                      <th>Fetched / Valid</th>
                      <th>Missing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(ingestPayload?.items || []).length === 0 ? (
                      <tr>
                        <td colSpan={7}>
                          <div className={styles.emptyInline}>No ingest rows matched these filters.</div>
                        </td>
                      </tr>
                    ) : (
                      (ingestPayload?.items || []).map((row) => (
                        <tr key={`${row.bucket}:${row.runner}:${row.outletId}:${row.method}`}>
                          <td>
                            <strong>{formatDateTime(row.bucket)}</strong>
                            <span>{row.runner}</span>
                          </td>
                          <td>
                            <strong>{row.source}</strong>
                            <span>{row.outletId}</span>
                          </td>
                          <td>{row.country}</td>
                          <td>{row.method}</td>
                          <td>
                            <strong>{formatInt(row.attemptedRuns)}</strong>
                            <span>{formatInt(row.failedRuns)} failed</span>
                          </td>
                          <td>
                            <strong>{formatInt(row.fetchedCount)} fetched</strong>
                            <span>{formatInt(row.validCount)} valid</span>
                          </td>
                          <td>
                            <strong>{formatInt(row.missingPublishedAtCount)} no pub time</strong>
                            <span>
                              title {formatInt(row.missingTitleCount)} · summary {formatInt(row.missingSummaryCount)} · link {formatInt(row.missingLinkCount)}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <PaginationRow
                offset={ingestOffset}
                limit={Number(ingestLimit)}
                total={ingestPayload?.total || 0}
                currentCount={ingestPayload?.items.length || 0}
                onPrev={() => setIngestOffset((current) => Math.max(0, current - Number(ingestLimit)))}
                onNext={() => setIngestOffset((current) => current + Number(ingestLimit))}
              />
            </>
          ) : null}
        </article>
      ) : null}

      {activeTab === 'feedStatus' ? (
        <article className={`${styles.explorerPanel} ${styles.widePanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <h3>Feed Status</h3>
              <p>`ingest_feed_watermarks_v2` rows for feed freshness, publication lag, and fetch recency.</p>
            </div>
            <div className={styles.controlRow}>
              <select className={styles.control} value={feedMethod} onChange={(event) => setFeedMethod(event.target.value)}>
                <option value="">All methods</option>
                <option value="rss">rss</option>
                <option value="sitemap">sitemap</option>
              </select>
              <select className={styles.control} value={feedSort} onChange={(event) => setFeedSort(event.target.value)}>
                <option value="lagHours">Sort by publication gap</option>
                <option value="lastPublicationAt">Sort by last publication</option>
                <option value="lastFetchedAt">Sort by last fetched</option>
                <option value="source">Sort by source</option>
                <option value="country">Sort by country</option>
              </select>
              <select className={styles.control} value={feedDirection} onChange={(event) => setFeedDirection(event.target.value as OpsSortDirection)}>
                <option value="desc">Desc</option>
                <option value="asc">Asc</option>
              </select>
              <select className={styles.control} value={feedLimit} onChange={(event) => setFeedLimit(event.target.value)}>
                <option value="50">50 rows</option>
                <option value="100">100 rows</option>
                <option value="200">200 rows</option>
              </select>
            </div>
          </div>

          <input
            className={styles.searchInput}
            type="search"
            value={feedSearch}
            onChange={(event) => setFeedSearch(event.target.value)}
            placeholder="Search source, outlet id, country"
          />

          <div className={styles.summaryRow}>
            <span className={styles.chip}>{feedPayload?.storage || 'unknown'}</span>
            <span className={styles.chip}>{formatInt(feedPayload?.total)} total rows</span>
            <span className={styles.chip}>{formatDateTime(feedPayload?.generatedAt)}</span>
          </div>

          {feedLoading ? <div className={styles.emptyState}>Loading feed status…</div> : null}
          {feedError ? <div className={styles.emptyState}>{feedError}</div> : null}

          {!feedLoading && !feedError ? (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Country</th>
                      <th>Method</th>
                      <th>Last publication</th>
                      <th>Last fetched</th>
                      <th>Gap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(feedPayload?.items || []).length === 0 ? (
                      <tr>
                        <td colSpan={6}>
                          <div className={styles.emptyInline}>No feed status rows matched these filters.</div>
                        </td>
                      </tr>
                    ) : (
                      (feedPayload?.items || []).map((row) => (
                        <tr key={`${row.outletId}:${row.method}`}>
                          <td>
                            <strong>{row.source}</strong>
                            <span>{row.outletId}</span>
                          </td>
                          <td>{row.country}</td>
                          <td>{row.method}</td>
                          <td>{formatDateTime(row.lastPublicationAt)}</td>
                          <td>{formatDateTime(row.lastFetchedAt)}</td>
                          <td>
                            <strong>{formatHours(row.lagHours)}</strong>
                            <span>{formatDateTime(row.updatedAt)}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <PaginationRow
                offset={feedOffset}
                limit={Number(feedLimit)}
                total={feedPayload?.total || 0}
                currentCount={feedPayload?.items.length || 0}
                onPrev={() => setFeedOffset((current) => Math.max(0, current - Number(feedLimit)))}
                onNext={() => setFeedOffset((current) => current + Number(feedLimit))}
              />
            </>
          ) : null}
        </article>
      ) : null}

      {activeTab === 'benchmarkMetrics' ? (
        <article className={`${styles.explorerPanel} ${styles.widePanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <h3>Benchmark Metrics</h3>
              <p>`country_benchmark_hourly` and `country_benchmark_daily` rows with real bucket-level country metrics.</p>
            </div>
            <div className={styles.controlRow}>
              <select
                className={styles.control}
                value={benchmarkGranularity}
                onChange={(event) => setBenchmarkGranularity(event.target.value as OpsBenchmarkGranularity)}
              >
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
              </select>
              <select className={styles.control} value={benchmarkRange} onChange={(event) => setBenchmarkRange(event.target.value)}>
                {BENCHMARK_RANGE_OPTIONS[benchmarkGranularity].map((option) => (
                  <option key={option.value} value={option.value}>
                    Range {option.label}
                  </option>
                ))}
              </select>
              <select className={styles.control} value={benchmarkSort} onChange={(event) => setBenchmarkSort(event.target.value)}>
                <option value="bucket">Sort by bucket</option>
                <option value="published">Sort by published</option>
                <option value="inserted">Sort by inserted</option>
                <option value="late">Sort by late</option>
                <option value="activeSources">Sort by active sources</option>
                <option value="country">Sort by country</option>
              </select>
              <select className={styles.control} value={benchmarkDirection} onChange={(event) => setBenchmarkDirection(event.target.value as OpsSortDirection)}>
                <option value="desc">Desc</option>
                <option value="asc">Asc</option>
              </select>
              <select className={styles.control} value={benchmarkLimit} onChange={(event) => setBenchmarkLimit(event.target.value)}>
                <option value="50">50 rows</option>
                <option value="100">100 rows</option>
                <option value="200">200 rows</option>
              </select>
            </div>
          </div>

          <input
            className={styles.searchInput}
            type="search"
            value={benchmarkSearch}
            onChange={(event) => setBenchmarkSearch(event.target.value)}
            placeholder="Search country"
          />

          <div className={styles.summaryRow}>
            <span className={styles.chip}>{benchmarkPayload?.storage || 'unknown'}</span>
            <span className={styles.chip}>{formatInt(benchmarkPayload?.total)} total rows</span>
            <span className={styles.chip}>{formatDateTime(benchmarkPayload?.generatedAt)}</span>
          </div>

          {benchmarkLoading ? <div className={styles.emptyState}>Loading benchmark rows…</div> : null}
          {benchmarkError ? <div className={styles.emptyState}>{benchmarkError}</div> : null}

          {!benchmarkLoading && !benchmarkError ? (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Bucket</th>
                      <th>Country</th>
                      <th>Published</th>
                      <th>Inserted</th>
                      <th>Late</th>
                      <th>Active sources</th>
                      <th>Source concentration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(benchmarkPayload?.items || []).length === 0 ? (
                      <tr>
                        <td colSpan={7}>
                          <div className={styles.emptyInline}>No benchmark rows matched these filters.</div>
                        </td>
                      </tr>
                    ) : (
                      (benchmarkPayload?.items || []).map((row) => (
                        <tr key={`${row.granularity}:${row.bucket}:${row.country}:${row.metricVersion}`}>
                          <td>
                            <strong>{row.bucket}</strong>
                            <span>{formatDateTime(row.updatedAt)}</span>
                          </td>
                          <td>
                            <strong>{row.country}</strong>
                            <span>{row.metricVersion}{row.atlasVersion ? ` · ${row.atlasVersion}` : ''}</span>
                          </td>
                          <td>
                            <strong>{formatInt(row.publishedCount)}</strong>
                            <span>{formatInt(row.freshCount)} fresh</span>
                          </td>
                          <td>
                            <strong>{formatInt(row.insertedCount)}</strong>
                            <span>
                              {row.insertedWindowCount == null ? 'No short window' : `${formatInt(row.insertedWindowCount)} short window`}
                            </span>
                          </td>
                          <td>{formatInt(row.lateCount)}</td>
                          <td>
                            <strong>{formatInt(row.activeSourcesCount)}</strong>
                            <span>
                              {row.activeSourcesWindowCount == null ? 'No short window' : `${formatInt(row.activeSourcesWindowCount)} short window`}
                            </span>
                          </td>
                          <td>
                            <strong>{formatBps(row.topSourceShareBps)}</strong>
                            <span>top 5 {formatBps(row.top5SourceShareBps)} · top 10 {formatBps(row.top10SourceShareBps)}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <PaginationRow
                offset={benchmarkOffset}
                limit={Number(benchmarkLimit)}
                total={benchmarkPayload?.total || 0}
                currentCount={benchmarkPayload?.items.length || 0}
                onPrev={() => setBenchmarkOffset((current) => Math.max(0, current - Number(benchmarkLimit)))}
                onNext={() => setBenchmarkOffset((current) => current + Number(benchmarkLimit))}
              />
            </>
          ) : null}
        </article>
      ) : null}

      {activeTab === 'mapMetrics' ? (
        <article className={`${styles.explorerPanel} ${styles.widePanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <h3>Map Metrics</h3>
              <p>`map_country_metrics_snapshots` and `map_publishers_snapshots` rows with snapshot metadata and extracted totals.</p>
            </div>
            <div className={styles.controlRow}>
              <select className={styles.control} value={mapKind} onChange={(event) => setMapKind(event.target.value as OpsMapMetricKind)}>
                <option value="countries">Country snapshots</option>
                <option value="publishers">Publisher snapshots</option>
              </select>
              <select className={styles.control} value={mapMetricWindow} onChange={(event) => setMapMetricWindow(event.target.value)}>
                <option value="1h">Window 1h</option>
                <option value="24h">Window 24h</option>
                <option value="7d">Window 7d</option>
              </select>
              <select className={styles.control} value={mapSort} onChange={(event) => setMapSort(event.target.value)}>
                <option value="generatedAt">Sort by generated</option>
                <option value="metricWindow">Sort by window</option>
                <option value="rowCount">Sort by row count</option>
                <option value="published24h">Sort by published 24h</option>
                <option value="activeSources24h">Sort by active sources</option>
              </select>
              <select className={styles.control} value={mapDirection} onChange={(event) => setMapDirection(event.target.value as OpsSortDirection)}>
                <option value="desc">Desc</option>
                <option value="asc">Asc</option>
              </select>
              <select className={styles.control} value={mapLimit} onChange={(event) => setMapLimit(event.target.value)}>
                <option value="50">50 rows</option>
                <option value="100">100 rows</option>
                <option value="200">200 rows</option>
              </select>
            </div>
          </div>

          <div className={styles.summaryRow}>
            <span className={styles.chip}>{mapPayload?.storage || 'unknown'}</span>
            <span className={styles.chip}>{formatInt(mapPayload?.total)} total rows</span>
            <span className={styles.chip}>{formatDateTime(mapPayload?.generatedAt)}</span>
          </div>

          {mapLoading ? <div className={styles.emptyState}>Loading map snapshots…</div> : null}
          {mapError ? <div className={styles.emptyState}>{mapError}</div> : null}

          {!mapLoading && !mapError ? (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Snapshot</th>
                      <th>Window</th>
                      <th>Rows</th>
                      <th>Countries</th>
                      <th>Published 24h</th>
                      <th>Active sources</th>
                      <th>Late share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(mapPayload?.items || []).length === 0 ? (
                      <tr>
                        <td colSpan={7}>
                          <div className={styles.emptyInline}>No map snapshot rows matched these filters.</div>
                        </td>
                      </tr>
                    ) : (
                      (mapPayload?.items || []).map((row) => (
                        <tr key={`${row.kind}:${row.metricWindow}:${row.metricVersion}`}>
                          <td>
                            <strong>{formatDateTime(row.generatedAt)}</strong>
                            <span>{row.metricVersion}</span>
                          </td>
                          <td>{row.metricWindow}</td>
                          <td>{formatInt(row.rowCount)}</td>
                          <td>{row.countriesCount == null ? 'Unavailable' : formatInt(row.countriesCount)}</td>
                          <td>{row.published24h == null ? 'Unavailable' : formatInt(row.published24h)}</td>
                          <td>{row.activeSources24h == null ? 'Unavailable' : formatInt(row.activeSources24h)}</td>
                          <td>{row.lateShare24h == null ? 'Unavailable' : formatPercent(row.lateShare24h)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <PaginationRow
                offset={mapOffset}
                limit={Number(mapLimit)}
                total={mapPayload?.total || 0}
                currentCount={mapPayload?.items.length || 0}
                onPrev={() => setMapOffset((current) => Math.max(0, current - Number(mapLimit)))}
                onNext={() => setMapOffset((current) => current + Number(mapLimit))}
              />
            </>
          ) : null}
        </article>
      ) : null}
    </section>
  );
}
