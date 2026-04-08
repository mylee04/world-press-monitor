'use client';

import { useDeferredValue, useEffect, useState } from 'react';
import styles from '@/components/ops-page.module.css';
import type { CountryBenchmarkResponse } from '@/lib/benchmark-types';
import type {
  MapCountryMetricRow,
  MapCountryMetricsResponse,
  MapCountrySourcesResponse,
  MapMetricWindow,
  MapSourceMetricRow,
} from '@/lib/map-types';
import type {
  NewsApiDashboardSummaryResponse,
  NewsApiDashboardTopicGroup,
  NewsApiFiltersResponse,
  NewsApiItem,
  NewsApiResponse,
} from '@/lib/news-api';

type OpsExplorerProps = {
  summary: NewsApiDashboardSummaryResponse | null;
  benchmark: CountryBenchmarkResponse | null;
  mapCountries: MapCountryMetricsResponse | null;
  defaultCountry: string | null;
};

type CountryLens = 'hourly' | 'daily' | 'weekly' | 'monthly';
type CountrySortKey = 'published' | 'inserted' | 'activeSources' | 'lateShare' | 'lateCount';
type CategorySortKey = 'articleCount' | 'unassignedCount' | 'topicCount';
type SourceSortKey = 'published' | 'firstSeen' | 'late' | 'health' | 'name';
type ArticleSortKey = 'publicationDatetime' | 'createdAt' | 'updatedAt' | 'source' | 'country' | 'category';
type SortDirection = 'asc' | 'desc';

type CountryExplorerRow = {
  country: string;
  countryCode: string | null;
  published: number;
  inserted: number;
  activeSources: number;
  lateCount: number;
  lateShare: number;
  firstSeen24h: number;
};

const COUNTRY_LENS_LABELS: Record<CountryLens, string> = {
  hourly: 'Hourly 24h',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

const SOURCE_WINDOW_LABELS: Record<MapMetricWindow, string> = {
  '1h': '1h',
  '24h': '24h',
  '7d': '7d',
};

const ARTICLE_WINDOW_OPTIONS = [
  { label: '6h', value: '6' },
  { label: '24h', value: '24' },
  { label: '72h', value: '72' },
  { label: '7d', value: '168' },
];

function formatInt(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0';
  return value.toLocaleString();
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0.0%';
  return `${(value * 100).toFixed(1)}%`;
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

function extractDomain(row: MapSourceMetricRow): string {
  const candidate = row.rssUrl || row.sitemapUrl;
  if (!candidate) return 'No domain';
  try {
    return new URL(candidate).hostname.replace(/^www\./, '');
  } catch {
    return 'No domain';
  }
}

function extractArticleDomain(row: NewsApiItem): string {
  try {
    return new URL(row.url).hostname.replace(/^www\./, '');
  } catch {
    return 'No domain';
  }
}

function toHealthRank(status: MapSourceMetricRow['health']): number {
  switch (status) {
    case 'degraded':
      return 4;
    case 'failing':
      return 3;
    case 'warning':
      return 2;
    case 'unknown':
      return 1;
    case 'healthy':
    default:
      return 0;
  }
}

function toIsoFromLocalInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizeText(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase();
}

function parseDateValue(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildCountryRows(
  benchmark: CountryBenchmarkResponse | null,
  mapCountries: MapCountryMetricsResponse | null,
  lens: CountryLens
): CountryExplorerRow[] {
  const mapByCountry = new Map<string, MapCountryMetricRow>();
  for (const row of mapCountries?.countries || []) {
    mapByCountry.set(row.country, row);
  }

  const rows: CountryExplorerRow[] = [];
  const seen = new Set<string>();

  for (const row of benchmark?.countries || []) {
    const mapRow = mapByCountry.get(row.country);
    let published = 0;
    let inserted = 0;
    let activeSources = 0;
    let lateCount = 0;
    if (lens === 'hourly') {
      published = row.hourlyPublished24h;
      inserted = row.hourlyInserted24h;
      activeSources = row.hourlyActiveSources24h;
      lateCount = row.hourlyLate24h;
    } else if (lens === 'daily') {
      published = row.dailyPublishedCount;
      inserted = row.dailyInsertedCount;
      activeSources = row.dailyActiveSourcesCount;
      lateCount = row.dailyLateCount;
    } else if (lens === 'weekly') {
      published = row.weeklyPublishedCount;
      inserted = row.weeklyInsertedCount;
      activeSources = row.weeklyAverageActiveSourcesCount;
      lateCount = row.weeklyLateCount;
    } else {
      published = row.monthlyPublishedCount;
      inserted = row.monthlyInsertedCount;
      activeSources = row.monthlyAverageActiveSourcesCount;
      lateCount = row.monthlyLateCount;
    }

    rows.push({
      country: row.country,
      countryCode: row.countryCode,
      published,
      inserted,
      activeSources,
      lateCount,
      lateShare: published > 0 ? lateCount / published : 0,
      firstSeen24h: mapRow?.firstSeen24h || 0,
    });
    seen.add(row.country);
  }

  for (const row of mapCountries?.countries || []) {
    if (seen.has(row.country)) continue;
    const published = lens === 'hourly' ? row.pub24h : row.windows['24h']?.published || row.pub24h;
    const activeSources = row.windows['24h']?.activeSources || row.activeSources24h;
    const lateCount = row.windows['24h']?.late || row.late24h;
    rows.push({
      country: row.country,
      countryCode: row.countryCode,
      published,
      inserted: row.windows['24h']?.firstSeen || row.firstSeen24h,
      activeSources,
      lateCount,
      lateShare: row.windows['24h']?.lateShare || row.lateShare || 0,
      firstSeen24h: row.firstSeen24h,
    });
  }

  return rows;
}

function renderCategoryTopics(group: NewsApiDashboardTopicGroup): string {
  return group.topics
    .slice(0, 3)
    .map((topic) => `${topic.topic} ${formatInt(topic.count)}`)
    .join(' · ');
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
        normalizeText(right.primarySection || right.sections[0] || '')
      );
    case 'publicationDatetime':
    default:
      return parseDateValue(right.publicationDatetime) - parseDateValue(left.publicationDatetime);
  }
}

export function OpsExplorer({ summary, benchmark, mapCountries, defaultCountry }: OpsExplorerProps) {
  const [countryLens, setCountryLens] = useState<CountryLens>('hourly');
  const [countrySort, setCountrySort] = useState<CountrySortKey>('published');
  const [countrySearch, setCountrySearch] = useState('');
  const deferredCountrySearch = useDeferredValue(countrySearch);

  const [categorySort, setCategorySort] = useState<CategorySortKey>('articleCount');
  const [categorySearch, setCategorySearch] = useState('');
  const deferredCategorySearch = useDeferredValue(categorySearch);

  const [selectedCountry, setSelectedCountry] = useState(defaultCountry || '');
  const [sourceWindow, setSourceWindow] = useState<MapMetricWindow>('24h');
  const [sourceSort, setSourceSort] = useState<SourceSortKey>('published');
  const [sourceSearch, setSourceSearch] = useState('');
  const deferredSourceSearch = useDeferredValue(sourceSearch);
  const [sourcePayload, setSourcePayload] = useState<MapCountrySourcesResponse | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);

  const [articleFilters, setArticleFilters] = useState<NewsApiFiltersResponse['filters'] | null>(null);
  const [articlePayload, setArticlePayload] = useState<NewsApiResponse | null>(null);
  const [articleLoading, setArticleLoading] = useState(false);
  const [articleError, setArticleError] = useState<string | null>(null);
  const [articleWindowHours, setArticleWindowHours] = useState('24');
  const [articleCountry, setArticleCountry] = useState('');
  const [articleSection, setArticleSection] = useState('');
  const [articleQuery, setArticleQuery] = useState('');
  const deferredArticleQuery = useDeferredValue(articleQuery);
  const [articleSourceSearch, setArticleSourceSearch] = useState('');
  const deferredArticleSourceSearch = useDeferredValue(articleSourceSearch);
  const [articlePublicationFrom, setArticlePublicationFrom] = useState('');
  const [articlePublicationTo, setArticlePublicationTo] = useState('');
  const deferredArticlePublicationFrom = useDeferredValue(articlePublicationFrom);
  const deferredArticlePublicationTo = useDeferredValue(articlePublicationTo);
  const [articleSort, setArticleSort] = useState<ArticleSortKey>('publicationDatetime');
  const [articleDirection, setArticleDirection] = useState<SortDirection>('desc');
  const [articleLimit, setArticleLimit] = useState('50');
  const [articleOffset, setArticleOffset] = useState(0);

  const countryRows = buildCountryRows(benchmark, mapCountries, countryLens)
    .filter((row) => {
      const query = deferredCountrySearch.trim().toLowerCase();
      if (!query) return true;
      return row.country.toLowerCase().includes(query) || (row.countryCode || '').toLowerCase().includes(query);
    })
    .sort((left, right) => {
      if (countrySort === 'published') return right.published - left.published || left.country.localeCompare(right.country);
      if (countrySort === 'inserted') return right.inserted - left.inserted || left.country.localeCompare(right.country);
      if (countrySort === 'activeSources') return right.activeSources - left.activeSources || left.country.localeCompare(right.country);
      if (countrySort === 'lateCount') return right.lateCount - left.lateCount || left.country.localeCompare(right.country);
      return right.lateShare - left.lateShare || left.country.localeCompare(right.country);
    });

  const categoryRows = (summary?.topicGroups || [])
    .filter((group) => {
      const query = deferredCategorySearch.trim().toLowerCase();
      if (!query) return true;
      if (group.section.toLowerCase().includes(query)) return true;
      return group.topics.some((topic) => topic.topic.toLowerCase().includes(query));
    })
    .sort((left, right) => {
      if (categorySort === 'unassignedCount') {
        return right.unassignedCount - left.unassignedCount || left.section.localeCompare(right.section);
      }
      if (categorySort === 'topicCount') {
        return right.topics.length - left.topics.length || left.section.localeCompare(right.section);
      }
      return right.articleCount - left.articleCount || left.section.localeCompare(right.section);
    });

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
        if (!controller.signal.aborted) {
          setArticleLoading(false);
        }
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
    if (!selectedCountry) {
      setSourcePayload(null);
      setSourceError(null);
      return;
    }

    const controller = new AbortController();
    setSourceLoading(true);
    setSourceError(null);

    const params = new URLSearchParams({
      country: selectedCountry,
      window: sourceWindow,
    });

    fetch(`/api/ops/country-sources/?${params.toString()}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message || 'Failed to load source explorer data.');
        }
        return (await response.json()) as MapCountrySourcesResponse;
      })
      .then((payload) => {
        setSourcePayload(payload);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setSourcePayload(null);
        setSourceError(error instanceof Error ? error.message : 'Failed to load source explorer data.');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setSourceLoading(false);
        }
      });

    return () => controller.abort();
  }, [selectedCountry, sourceWindow]);

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

  const sourceRows = (sourcePayload?.sources || [])
    .filter((row) => {
      const query = deferredSourceSearch.trim().toLowerCase();
      if (!query) return true;
      const domain = extractDomain(row).toLowerCase();
      return (
        row.source.toLowerCase().includes(query)
        || (row.publisher || '').toLowerCase().includes(query)
        || domain.includes(query)
        || (row.city || '').toLowerCase().includes(query)
        || (row.region || '').toLowerCase().includes(query)
      );
    })
    .sort((left, right) => {
      if (sourceSort === 'name') return left.source.localeCompare(right.source);
      if (sourceSort === 'firstSeen') return right.firstSeen24h - left.firstSeen24h || left.source.localeCompare(right.source);
      if (sourceSort === 'late') return right.late24h - left.late24h || left.source.localeCompare(right.source);
      if (sourceSort === 'health') return toHealthRank(right.health) - toHealthRank(left.health) || right.late24h - left.late24h;
      return right.pub24h - left.pub24h || left.source.localeCompare(right.source);
    });

  const timeBuckets = sourceWindow === '7d' ? (sourcePayload?.daily7d || []) : (sourcePayload?.hourly24h || []);
  const articleRangeStart = articlePayload && articlePayload.total > 0 ? articleOffset + 1 : 0;
  const articleRangeEnd = articlePayload ? articleOffset + articleRows.length : 0;
  const articleHasPrev = articleOffset > 0;
  const articleHasNext = Boolean(articlePayload && articleOffset + Number(articleLimit) < articlePayload.total);

  return (
    <section className={styles.explorerSection}>
      <div className={styles.explorerHeader}>
        <div>
          <div className="eyebrow">Private Explorer</div>
          <h2>Inspect raw article rows, country scale, and source behavior.</h2>
          <p>Use this panel to inspect real article titles, publish times, categories, countries, and source-domain behavior without exposing anything in the public product.</p>
        </div>
      </div>

      <div className={styles.explorerGrid}>
        <article className={`${styles.explorerPanel} ${styles.widePanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <h3>Articles</h3>
              <p>Raw article rows with country, category, source, and publication-time filtering.</p>
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
              <select className={styles.control} value={articleDirection} onChange={(event) => setArticleDirection(event.target.value as SortDirection)}>
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
              placeholder="Filter current rows by source or domain"
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
            <span className={styles.chip}>
              {articleRangeStart > 0 ? `${articleRangeStart}-${articleRangeEnd}` : '0'} visible
            </span>
            <span className={styles.chip}>{formatDateTime(articlePayload?.generatedAt)}</span>
          </div>

          {articleLoading ? <div className={styles.emptyState}>Loading article explorer…</div> : null}
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

              <div className={styles.paginationRow}>
                <button
                  className={styles.pageButton}
                  type="button"
                  onClick={() => setArticleOffset((current) => Math.max(0, current - Number(articleLimit)))}
                  disabled={!articleHasPrev}
                >
                  Previous
                </button>
                <span className={styles.pageMeta}>
                  {articleRangeStart > 0 ? `${articleRangeStart}-${articleRangeEnd}` : '0'} of {formatInt(articlePayload?.total)}
                </span>
                <button
                  className={styles.pageButton}
                  type="button"
                  onClick={() => setArticleOffset((current) => current + Number(articleLimit))}
                  disabled={!articleHasNext}
                >
                  Next
                </button>
              </div>
            </>
          ) : null}
        </article>

        <article className={styles.explorerPanel}>
          <div className={styles.panelHeader}>
            <div>
              <h3>Countries</h3>
              <p>{COUNTRY_LENS_LABELS[countryLens]} lens across benchmark and map coverage.</p>
            </div>
            <div className={styles.controlRow}>
              <select className={styles.control} value={countryLens} onChange={(event) => setCountryLens(event.target.value as CountryLens)}>
                <option value="hourly">Hourly 24h</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              <select className={styles.control} value={countrySort} onChange={(event) => setCountrySort(event.target.value as CountrySortKey)}>
                <option value="published">Sort by published</option>
                <option value="inserted">Sort by ingested</option>
                <option value="activeSources">Sort by sources</option>
                <option value="lateShare">Sort by late share</option>
                <option value="lateCount">Sort by late count</option>
              </select>
            </div>
          </div>
          <input
            className={styles.searchInput}
            type="search"
            value={countrySearch}
            onChange={(event) => setCountrySearch(event.target.value)}
            placeholder="Search country"
          />
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Country</th>
                  <th>Published</th>
                  <th>Ingested</th>
                  <th>Sources</th>
                  <th>Late</th>
                </tr>
              </thead>
              <tbody>
                {countryRows.slice(0, 25).map((row) => (
                  <tr
                    key={row.country}
                    className={selectedCountry === row.country ? styles.activeRow : undefined}
                    onClick={() => setSelectedCountry(row.country)}
                  >
                    <td>
                      <strong>{row.country}</strong>
                      <span>{row.countryCode || 'No code'}</span>
                    </td>
                    <td>{formatInt(row.published)}</td>
                    <td>{formatInt(row.inserted)}</td>
                    <td>{formatInt(row.activeSources)}</td>
                    <td>{formatPercent(row.lateShare)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className={styles.explorerPanel}>
          <div className={styles.panelHeader}>
            <div>
              <h3>Categories</h3>
              <p>31d taxonomy mix from the current dashboard summary snapshot.</p>
            </div>
            <div className={styles.controlRow}>
              <select className={styles.control} value={categorySort} onChange={(event) => setCategorySort(event.target.value as CategorySortKey)}>
                <option value="articleCount">Sort by articles</option>
                <option value="unassignedCount">Sort by unassigned</option>
                <option value="topicCount">Sort by topic count</option>
              </select>
            </div>
          </div>
          <input
            className={styles.searchInput}
            type="search"
            value={categorySearch}
            onChange={(event) => setCategorySearch(event.target.value)}
            placeholder="Search section or topic"
          />
          <div className={styles.categoryList}>
            {categoryRows.slice(0, 16).map((group) => (
              <div className={styles.categoryCard} key={group.section}>
                <div className={styles.categoryTop}>
                  <strong>{group.section}</strong>
                  <span>{formatInt(group.articleCount)}</span>
                </div>
                <p>{renderCategoryTopics(group) || 'No top topics'}</p>
                <div className={styles.categoryMeta}>
                  <span>{formatInt(group.topics.length)} topics</span>
                  <span>{formatInt(group.unassignedCount)} unassigned</span>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className={`${styles.explorerPanel} ${styles.widePanel}`}>
          <div className={styles.panelHeader}>
            <div>
              <h3>Sources</h3>
              <p>Private source-domain drill-down for the selected country.</p>
            </div>
            <div className={styles.controlRow}>
              <select className={styles.control} value={selectedCountry} onChange={(event) => setSelectedCountry(event.target.value)}>
                {(countryRows.length
                  ? countryRows
                  : [{
                      country: defaultCountry || '',
                      countryCode: null,
                      published: 0,
                      inserted: 0,
                      activeSources: 0,
                      lateCount: 0,
                      lateShare: 0,
                      firstSeen24h: 0,
                    }]
                )
                  .filter((row) => row.country)
                  .map((row) => (
                    <option key={row.country} value={row.country}>
                      {row.country}
                    </option>
                  ))}
              </select>
              <select className={styles.control} value={sourceWindow} onChange={(event) => setSourceWindow(event.target.value as MapMetricWindow)}>
                <option value="1h">Window 1h</option>
                <option value="24h">Window 24h</option>
                <option value="7d">Window 7d</option>
              </select>
              <select className={styles.control} value={sourceSort} onChange={(event) => setSourceSort(event.target.value as SourceSortKey)}>
                <option value="published">Sort by published</option>
                <option value="firstSeen">Sort by first seen</option>
                <option value="late">Sort by late</option>
                <option value="health">Sort by health</option>
                <option value="name">Sort by name</option>
              </select>
            </div>
          </div>
          <input
            className={styles.searchInput}
            type="search"
            value={sourceSearch}
            onChange={(event) => setSourceSearch(event.target.value)}
            placeholder="Search source, publisher, domain, city"
          />

          <div className={styles.summaryRow}>
            <span className={styles.chip}>{selectedCountry || 'No country selected'}</span>
            <span className={styles.chip}>{SOURCE_WINDOW_LABELS[sourceWindow]} window</span>
            <span className={styles.chip}>{formatInt(sourcePayload?.summary.pub24h)} published</span>
            <span className={styles.chip}>{formatInt(sourcePayload?.summary.activeSources24h)} active sources</span>
            <span className={styles.chip}>{formatInt(sourcePayload?.summary.rssSources24h)} rss</span>
            <span className={styles.chip}>{formatInt(sourcePayload?.summary.sitemapSources24h)} sitemap</span>
          </div>

          <div className={styles.bucketStrip}>
            {(timeBuckets || []).slice(-12).map((bucket) => (
              <div className={styles.bucketCard} key={'hour' in bucket ? bucket.hour : bucket.day}>
                <strong>{'hour' in bucket ? bucket.hour.slice(11, 16) : bucket.day.slice(5)}</strong>
                <span>{formatInt(bucket.count)}</span>
              </div>
            ))}
          </div>

          {sourceLoading ? <div className={styles.emptyState}>Loading source explorer…</div> : null}
          {sourceError ? <div className={styles.emptyState}>{sourceError}</div> : null}

          {!sourceLoading && !sourceError ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Domain</th>
                    <th>Published</th>
                    <th>First seen</th>
                    <th>Late</th>
                    <th>Health</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceRows.slice(0, 40).map((row) => (
                    <tr key={row.sourceId}>
                      <td>
                        <strong>{row.source}</strong>
                        <span>{row.publisher || row.city || row.region || 'No publisher'}</span>
                      </td>
                      <td>{extractDomain(row)}</td>
                      <td>{formatInt(row.pub24h)}</td>
                      <td>{formatInt(row.firstSeen24h)}</td>
                      <td>{formatInt(row.late24h)}</td>
                      <td>
                        <span className={styles.healthPill} data-health={row.health}>
                          {row.health}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </article>
      </div>
    </section>
  );
}
