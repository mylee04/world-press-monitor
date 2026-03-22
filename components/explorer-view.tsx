'use client';

import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { CustomerAccessPanel } from '@/components/customer-access-panel';
import { useCustomerAccess } from '@/components/customer-access-provider';
import { useNewsApiFilters, useNewsApiNews } from '@/components/news-api-hooks';
import { buildNewsApiUrl, type NewsApiItem } from '@/lib/news-api';

type ExplorerCsvRow = {
  id: string;
  source: string;
  country: string;
  language: string;
  section: string;
  title: string;
  snippet: string;
  url: string;
  publicationDatetime: string;
  createdAt: string;
  updatedAt: string;
};

function buildClientCsv(rows: ExplorerCsvRow[]): string {
  const header = [
    'id',
    'source',
    'country',
    'language',
    'section',
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
        return `"${value.replaceAll('"', '""')}"`;
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

function renderSectionLabel(section: string | null | undefined): string {
  if (!section || section === 'others') return 'general / unclassified';
  if (section === 'entertainment') return 'entertainment';
  if (section === 'lifestyle') return 'lifestyle';
  if (section === 'arts') return 'arts';
  return section;
}

function toExplorerCsvRow(article: NewsApiItem): ExplorerCsvRow {
  return {
    id: article.id,
    source: article.source || '',
    country: article.country || '',
    language: article.language || '',
    section: article.section || '',
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
  const filtersState = useNewsApiFilters();
  const filters = filtersState.data?.storage === 'postgres' ? filtersState.data.filters : null;
  const [country, setCountry] = useState('');
  const [date, setDate] = useState('');
  const [section, setSection] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const deferredQuery = useDeferredValue(query.trim());
  const limit = 100;
  const publicationRange = useMemo(() => (date ? toDayRange(date) : null), [date]);

  useEffect(() => {
    startTransition(() => {
      setOffset(0);
    });
  }, [country, date, section, deferredQuery]);

  const newsState = useNewsApiNews({
    countries: country ? [country] : undefined,
    sections: section ? [section] : undefined,
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
        <h1>Filter live article results by section, country, UTC publication date, and keyword.</h1>
        <p>
          This page no longer loads public JSON shards. Every result comes from the authenticated customer API,
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
            <span>Section</span>
            <select value={section} onChange={(event) => setSection(event.target.value)}>
              <option value="">All sections</option>
              {(filters?.sections || []).map((item) => (
                <option key={item} value={item}>
                  {renderSectionLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Keyword</span>
            <input
              placeholder="Search title, source, country"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>

        <div className="toolbar">
          <div className="muted">
            API mode: <code>{apiUrl || '-'}</code>
          </div>
          <button
            className="button"
            type="button"
            onClick={() => triggerCsvDownload(currentCsvRows, `wpm-customer-explorer-page-${page}.csv`)}
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
      </section>

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
                <th>Date</th>
                <th>Country</th>
                <th>Source</th>
                <th>Category</th>
                <th>Title</th>
                <th>Link</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((article) => (
                <tr key={article.id}>
                  <td>{article.publicationDatetime.replace('T', ' ').slice(0, 16)}</td>
                  <td>{article.country || 'Unknown'}</td>
                  <td>{article.source}</td>
                  <td>{renderSectionLabel(article.section)}</td>
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
                  <td colSpan={6}>No rows match the current filter set.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
