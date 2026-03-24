'use client';

import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { CustomerAccessPanel } from '@/components/customer-access-panel';
import { useCustomerAccess } from '@/components/customer-access-provider';
import { useNewsApiDashboardSummary, useNewsApiFilters, useNewsApiNews } from '@/components/news-api-hooks';
import { buildNewsApiUrl, type NewsApiItem } from '@/lib/news-api';
import { usePublicationTimePreference } from '@/components/publication-time-provider';
import { useTaxonomyLocalePreference } from '@/components/taxonomy-locale-provider';
import {
  expandTopLevelTaxonomySections,
  getTaxonomyLocaleLabel,
  getTopLevelTaxonomyLabel,
  getTopLevelTaxonomyListLabel,
  getTopicListLabel,
  mapSectionToTopLevelTaxonomy,
  TAXONOMY_TOP_LEVEL_ORDER,
  type TaxonomyTopLevelGroup,
  type TaxonomyLocaleMode,
} from '@/lib/taxonomy-display';
import { formatPublicationTime, renderPublicationTimeZoneLabel } from '@/lib/timezone-display';

type ExplorerCsvRow = {
  id: string;
  source: string;
  country: string;
  language: string;
  primarySection: string;
  sections: string;
  primaryTopic: string;
  topics: string;
  sourceCategories: string;
  title: string;
  snippet: string;
  url: string;
  publicationDatetime: string;
  createdAt: string;
  updatedAt: string;
};

function escapeCsvValue(value: string): string {
  return value.split('"').join('""');
}

function buildClientCsv(rows: ExplorerCsvRow[]): string {
  const header = [
    'id',
    'source',
    'country',
    'language',
    'primarySection',
    'sections',
    'primaryTopic',
    'topics',
    'sourceCategories',
    'title',
    'snippet',
    'url',
    'publicationDatetime',
    'createdAt',
    'updatedAt',
  ];
  const body = rows.map((row) =>
    header
      .map((key) => {
        const value = row[key as keyof ExplorerCsvRow];
        if (!/[",\n]/.test(value)) return value;
        return `"${escapeCsvValue(value)}"`;
      })
      .join(',')
  );
  return `${header.join(',')}\n${body.join('\n')}${body.length ? '\n' : ''}`;
}

function triggerCsvDownload(rows: ExplorerCsvRow[], filename: string): void {
  const csv = buildClientCsv(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function toExplorerCsvRow(article: NewsApiItem): ExplorerCsvRow {
  return {
    id: article.id,
    source: article.source || '',
    country: article.country || '',
    language: article.language || '',
    primarySection: article.primarySection || '',
    sections: (article.sections || []).join('|'),
    primaryTopic: article.primaryTopic || '',
    topics: (article.topics || []).join('|'),
    sourceCategories: (article.sourceCategories || []).join('|'),
    title: article.title || '',
    snippet: article.snippet || '',
    url: article.url || '',
    publicationDatetime: article.publicationDatetime || '',
    createdAt: article.createdAt || '',
    updatedAt: article.updatedAt || '',
  };
}

function toDayRange(date: string): { from: string; to: string } {
  return {
    from: new Date(`${date}T00:00:00.000Z`).toISOString(),
    to: new Date(`${date}T23:59:59.999Z`).toISOString(),
  };
}

export function ExplorerView() {
  const { hasToken, isReady, apiConfigured } = useCustomerAccess();
  const { mode: publicationTimeMode, localTimeZone, setMode: setPublicationTimeMode } = usePublicationTimePreference();
  const { mode: taxonomyLocaleMode, browserLocale, resolvedLocale, setMode: setTaxonomyLocaleMode } = useTaxonomyLocalePreference();
  const filtersState = useNewsApiFilters();
  const summaryState = useNewsApiDashboardSummary();
  const filters = filtersState.data?.storage === 'postgres' ? filtersState.data.filters : null;
  const [country, setCountry] = useState('');
  const [date, setDate] = useState('');
  const [topLevelGroups, setTopLevelGroups] = useState<TaxonomyTopLevelGroup[]>([]);
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const deferredQuery = useDeferredValue(query.trim());
  const limit = 100;
  const publicationRange = useMemo(() => (date ? toDayRange(date) : null), [date]);
  const selectedSections = useMemo(() => expandTopLevelTaxonomySections(topLevelGroups), [topLevelGroups]);

  useEffect(() => {
    startTransition(() => {
      setOffset(0);
    });
  }, [country, date, topLevelGroups, deferredQuery]);

  const newsState = useNewsApiNews({
    countries: country ? [country] : undefined,
    sections: selectedSections.length > 0 ? selectedSections : undefined,
    q: deferredQuery || null,
    limit,
    offset,
    hours: publicationRange ? undefined : 48,
    publicationFrom: publicationRange?.from || null,
    publicationTo: publicationRange?.to || null,
  });

  const response = newsState.data?.storage === 'postgres' ? newsState.data : null;
  const rows = response?.items || [];
  const total = response?.total || 0;
  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentCsvRows = rows.map(toExplorerCsvRow);
  const apiUrl = buildNewsApiUrl('/api/news');
  const sourceCategoryCoverage =
    summaryState.data?.storage === 'postgres' && summaryState.data.sourceCategoryCoverage
      ? {
          categorizedArticles: Number(summaryState.data.sourceCategoryCoverage.categorizedArticles || 0),
          uncategorizedArticles: Number(summaryState.data.sourceCategoryCoverage.uncategorizedArticles || 0),
          distinctCategories: Number(summaryState.data.sourceCategoryCoverage.distinctCategories || 0),
          topCategories: Array.isArray(summaryState.data.sourceCategoryCoverage.topCategories)
            ? summaryState.data.sourceCategoryCoverage.topCategories.map((item) => ({
                category: item?.category || '',
                count: Number(item?.count || 0),
              }))
            : [],
        }
      : null;
  const sourceCategoryCoveragePct = sourceCategoryCoverage && summaryState.data?.storage === 'postgres' && summaryState.data.totals.rowsWindow > 0
    ? (sourceCategoryCoverage.categorizedArticles / summaryState.data.totals.rowsWindow) * 100
    : 0;

  if (!apiConfigured && isReady) {
    return (
      <CustomerAccessPanel
        title="Portal API Not Configured"
        description="This customer portal requires a server-side World Press Radar API base URL before filtered article browsing can work."
      />
    );
  }

  if (!isReady) {
    return <div className="panel muted">Checking customer access...</div>;
  }

  if (!hasToken) {
    return (
      <CustomerAccessPanel description="Customers need a valid token before the Explorer will load category, country, or date-filtered article results." />
    );
  }

  if (filtersState.error) {
    return (
      <CustomerAccessPanel
        title="Customer Token Required"
        description="The Explorer only loads for customers with a valid API token or API key."
        error={filtersState.error}
      />
    );
  }

  return (
    <div className="page-stack">
      <section className="hero-panel compact">
        <div className="eyebrow">Explorer</div>
        <h1>Filter live article results by top-level category, normalized topics, source tags, country, UTC publication date, and keyword.</h1>
        <p>
          Every result comes from the authenticated customer API,
          with server-side filtering and page-level CSV export only for signed-in customers.
        </p>
      </section>

      <section className="panel">
        <div className="control-grid">
          <label>
            <span>Country</span>
            <select value={country} onChange={(event) => setCountry(event.target.value)}>
              <option value="">All countries</option>
              {(filters?.countries || []).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Date</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label>
            <span>Top-level categories</span>
            <select
              multiple
              size={6}
              value={topLevelGroups}
              onChange={(event) => {
                const values = Array.from(event.target.selectedOptions).map((option) => option.value as TaxonomyTopLevelGroup);
                setTopLevelGroups(values);
              }}
            >
              {TAXONOMY_TOP_LEVEL_ORDER.map((item) => (
                <option key={item} value={item}>
                  {getTopLevelTaxonomyLabel(item, resolvedLocale)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Keyword</span>
            <input
              placeholder="Search title, source, country, source tags"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label>
            <span>Publication Time</span>
            <select value={publicationTimeMode} onChange={(event) => setPublicationTimeMode(event.target.value as 'local' | 'utc' | 'chicago')}>
              <option value="local">{renderPublicationTimeZoneLabel('local', localTimeZone)}</option>
              <option value="utc">{renderPublicationTimeZoneLabel('utc', localTimeZone)}</option>
              <option value="chicago">{renderPublicationTimeZoneLabel('chicago', localTimeZone)}</option>
            </select>
          </label>
          <label>
            <span>Category Language</span>
            <select value={taxonomyLocaleMode} onChange={(event) => setTaxonomyLocaleMode(event.target.value as TaxonomyLocaleMode)}>
              <option value="auto">{getTaxonomyLocaleLabel('auto', browserLocale)}</option>
              <option value="en">{getTaxonomyLocaleLabel('en', browserLocale)}</option>
              <option value="ko">{getTaxonomyLocaleLabel('ko', browserLocale)}</option>
              <option value="ja">{getTaxonomyLocaleLabel('ja', browserLocale)}</option>
              <option value="es">{getTaxonomyLocaleLabel('es', browserLocale)}</option>
              <option value="pt">{getTaxonomyLocaleLabel('pt', browserLocale)}</option>
              <option value="it">{getTaxonomyLocaleLabel('it', browserLocale)}</option>
              <option value="fr">{getTaxonomyLocaleLabel('fr', browserLocale)}</option>
            </select>
          </label>
        </div>

        <div className="toolbar">
          <div className="muted">
            API mode: <code>{apiUrl || '-'}</code>
          </div>
          <button
            className="button"
            type="button"
            onClick={() => triggerCsvDownload(currentCsvRows, `wpr-customer-explorer-page-${page}.csv`)}
            disabled={currentCsvRows.length === 0}
          >
            Download current page CSV
          </button>
          <button
            className="button"
            type="button"
            onClick={() => setOffset((current) => Math.max(0, current - limit))}
            disabled={offset === 0}
          >
            Previous page
          </button>
          <button
            className="button"
            type="button"
            onClick={() => setOffset((current) => current + limit)}
            disabled={offset + limit >= total}
          >
            Next page
          </button>
        </div>
        <div className="muted">
          {date
            ? `Filtering to the UTC publication date ${date}.`
            : 'No date selected: defaulting to the latest 48-hour publication window.'}
        </div>
        <div className="muted">
          Publication Time display: {renderPublicationTimeZoneLabel(publicationTimeMode, localTimeZone)}.
        </div>
        <div className="muted">Category filter uses World Press Radar top-level groups. Hold Command/Ctrl to select more than one.</div>
      </section>

      <details className="panel">
        <summary className="details-summary">Advanced source tags (raw publisher labels)</summary>
        <p className="muted" style={{ marginTop: 12 }}>
          These raw tags come from publisher feeds and article pages. They are multilingual and source-specific, so they are best used for deep drilling rather than as the primary product taxonomy.
        </p>
        {sourceCategoryCoverage ? (
          <>
            <div className="stat-list" style={{ marginTop: 12 }}>
              <div className="stat-row">
                <span>Source-tag coverage in 31d window</span>
                <strong>{sourceCategoryCoveragePct.toFixed(1)}%</strong>
              </div>
              <div className="stat-row">
                <span>Articles with raw source tags</span>
                <strong>{sourceCategoryCoverage.categorizedArticles.toLocaleString()}</strong>
              </div>
              <div className="stat-row">
                <span>Distinct raw source tags</span>
                <strong>{sourceCategoryCoverage.distinctCategories.toLocaleString()}</strong>
              </div>
            </div>
            <div className="topic-pill-row" style={{ marginTop: 12 }}>
              {sourceCategoryCoverage.topCategories.map((item) => (
                <span className="topic-pill" key={`explorer-source-category-${item.category}`}>
                  <strong>{item.category}</strong>
                  <small>{item.count.toLocaleString()}</small>
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="muted" style={{ marginTop: 12 }}>Raw source tag leaders are still warming up.</div>
        )}
      </details>

      {newsState.error ? <div className="panel danger">News query failed: {newsState.error}</div> : null}

      <section className="panel">
        <div className="section-head">
          <h2>Results</h2>
          <span>
            {total.toLocaleString()} articles
            {total > 0 ? ` · page ${page} / ${totalPages}` : ''}
          </span>
        </div>

        {filtersState.loading && !filters ? <div className="muted">Loading filter options...</div> : null}
        {newsState.loading && !response ? <div className="muted">Loading live API results...</div> : null}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Publication Time</th>
                <th>Country</th>
                <th>Source</th>
                <th>Category</th>
                <th>Mapped categories</th>
                <th>Topics</th>
                <th>Publisher tags</th>
                <th>Title</th>
                <th>Link</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((article) => (
                <tr key={article.id}>
                  <td>{formatPublicationTime(article.publicationDatetime, publicationTimeMode, localTimeZone)}</td>
                  <td>{article.country || 'Unknown'}</td>
                  <td>{article.source}</td>
                  <td>{getTopLevelTaxonomyLabel(mapSectionToTopLevelTaxonomy(article.primarySection), resolvedLocale)}</td>
                  <td>{getTopLevelTaxonomyListLabel(article.sections, resolvedLocale, 'general_other')}</td>
                  <td>{getTopicListLabel(article.topics, resolvedLocale)}</td>
                  <td>{article.sourceCategories.length > 0 ? article.sourceCategories.join(', ') : '-'}</td>
                  <td>{article.title}</td>
                  <td>
                    <a href={article.url} rel="noreferrer" target="_blank">
                      Open
                    </a>
                  </td>
                </tr>
              ))}
              {!newsState.loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={9}>No rows match the current filter set.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
