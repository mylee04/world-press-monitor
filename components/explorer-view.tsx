'use client';

import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useNewsApiFilters, useNewsApiNews } from '@/components/news-api-hooks';
import { useManifest, useShard } from '@/components/public-data-hooks';
import { buildNewsApiUrl, hasNewsApiBaseUrl, type NewsApiItem } from '@/lib/news-api';
import type { PublicNewsArticle } from '@/lib/public-data';

type ExplorerCsvRow = {
  id: string;
  source: string;
  country: string;
  countryCode: string;
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
    'countryCode',
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
  if (!section || section === 'others') return 'general / uncategorized';
  if (section === 'entertainment') return 'entertainment';
  if (section === 'lifestyle') return 'lifestyle';
  if (section === 'arts') return 'arts';
  return section;
}

function toExplorerCsvRow(article: PublicNewsArticle | NewsApiItem): ExplorerCsvRow {
  const countryCode = 'countryCode' in article ? article.countryCode || '' : '';
  const updatedAt = 'updatedAt' in article ? article.updatedAt || '' : '';
  return {
    id: article.id,
    source: article.source || '',
    country: article.country || '',
    countryCode,
    language: article.language || '',
    section: article.section || '',
    title: article.title || '',
    snippet: article.snippet || '',
    url: article.url || '',
    publicationDatetime: article.publicationDatetime || '',
    createdAt: article.createdAt || '',
    updatedAt,
  };
}

function toDayRange(date: string): { from: string; to: string } {
  return {
    from: new Date(`${date}T00:00:00.000Z`).toISOString(),
    to: new Date(`${date}T23:59:59.999Z`).toISOString(),
  };
}

function ApiExplorerView() {
  const filtersState = useNewsApiFilters();
  const filters = filtersState.data?.storage === 'postgres' ? filtersState.data.filters : null;
  const [country, setCountry] = useState('');
  const [date, setDate] = useState('');
  const [section, setSection] = useState('');
  const [source, setSource] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const deferredQuery = useDeferredValue(query.trim());
  const limit = 100;
  const publicationRange = useMemo(() => (date ? toDayRange(date) : null), [date]);

  useEffect(() => {
    startTransition(() => {
      setOffset(0);
    });
  }, [country, date, section, source, deferredQuery]);

  const newsState = useNewsApiNews({
    countries: country ? [country] : undefined,
    sections: section ? [section] : undefined,
    sources: source ? [source] : undefined,
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

  return (
    <div className="page-stack">
      <section className="hero-panel compact">
        <div className="eyebrow">Explorer</div>
        <h1>Query the live news API with server-side filtering.</h1>
        <p>
          Results come from the database-backed API instead of loading giant date shards in the browser.
          Filtering, search, and pagination now happen on the server.
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
            <span>Source</span>
            <select value={source} onChange={(event) => setSource(event.target.value)}>
              <option value="">All sources</option>
              {(filters?.sources || []).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Keyword</span>
            <input
              placeholder="Search title, snippet, source, country"
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
            onClick={() => triggerCsvDownload(currentCsvRows, `wpm-api-page-${page}.csv`)}
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
            ? `Filtering publicationDatetime to ${date} UTC.`
            : 'No date selected: defaulting to the latest 48h publication window.'}
        </div>
      </section>

      {filtersState.error ? <div className="panel danger">Filter load failed: {filtersState.error}</div> : null}
      {newsState.error ? <div className="panel danger">News query failed: {newsState.error}</div> : null}

      <section className="panel">
        <div className="section-head">
          <h2>Results</h2>
          <span>
            {total.toLocaleString()} rows
            {total > 0 ? ` · page ${page} / ${totalPages}` : ''}
          </span>
        </div>

        {filtersState.loading && !filters ? <div className="muted">Loading API filter options...</div> : null}
        {newsState.loading && !response ? <div className="muted">Loading live API results...</div> : null}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Country</th>
                <th>Source</th>
                <th>Section</th>
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

function StaticExplorerView() {
  const manifestState = useManifest();
  const manifest = manifestState.data;

  const [countryCode, setCountryCode] = useState('');
  const [month, setMonth] = useState('');
  const [date, setDate] = useState('');
  const [section, setSection] = useState('');
  const [source, setSource] = useState('');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const defaultDate = manifest?.featuredDate || manifest?.latestDate || '';

  useEffect(() => {
    if (!defaultDate) return;
    if (!date) {
      startTransition(() => {
        setDate(defaultDate);
      });
    }
  }, [date, defaultDate]);

  useEffect(() => {
    if (!manifest || !countryCode) return;
    const months = manifest.countryMonths[countryCode] || [];
    if (!months.length && month) {
      startTransition(() => setMonth(''));
      return;
    }
    if (!month || !months.includes(month)) {
      startTransition(() => {
        setMonth(months[0] || '');
      });
    }
  }, [countryCode, manifest, month]);

  const shardPath =
    countryCode && month
      ? `/data/by-country/${countryCode}/${month}.json`
      : date
        ? `/data/by-date/${date}.json`
        : manifest?.shards.byDate || null;

  const shardState = useShard(shardPath);
  const shardArticles = shardState.data?.articles || [];
  const sourceOptions = [...new Set(shardArticles.map((article) => article.source))].sort((a, b) => a.localeCompare(b));

  const filteredArticles = shardArticles.filter((article) => {
    if (countryCode && article.countryCode !== countryCode) return false;
    if (date && article.publicationDatetime.slice(0, 10) !== date) return false;
    if (section && article.section !== section) return false;
    if (source && article.source !== source) return false;
    if (!deferredQuery) return true;
    const haystack = `${article.title} ${article.snippet} ${article.source} ${article.country}`.toLowerCase();
    return haystack.includes(deferredQuery);
  });

  const tableRows = filteredArticles.slice(0, 200);
  const selectedCountryMonths = countryCode && manifest ? manifest.countryMonths[countryCode] || [] : [];

  return (
    <div className="page-stack">
      <section className="hero-panel compact">
        <div className="eyebrow">Explorer</div>
        <h1>Filter public shards without touching the database.</h1>
        <p>
          Date shards serve the latest overview. Country-month shards back deeper country views.
          CSV export happens in the browser against the current filtered result set.
        </p>
      </section>

      <section className="panel">
        <div className="control-grid">
          <label>
            <span>Country</span>
            <select value={countryCode} onChange={(event) => setCountryCode(event.target.value)}>
              <option value="">All countries</option>
              {(manifest?.countries || []).map((code) => (
                <option key={code} value={code}>
                  {manifest?.countryNames[code] || code}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Date</span>
            <select value={date} onChange={(event) => setDate(event.target.value)}>
              <option value="">All dates in shard</option>
              {(manifest?.availableDates || []).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Country month</span>
            <select value={month} onChange={(event) => setMonth(event.target.value)} disabled={!countryCode}>
              <option value="">{countryCode ? 'Choose month' : 'Select country first'}</option>
              {selectedCountryMonths.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Section</span>
            <select value={section} onChange={(event) => setSection(event.target.value)}>
              <option value="">All sections</option>
              {(manifest?.sections || []).map((item) => (
                <option key={item} value={item}>
                  {renderSectionLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Source</span>
            <select value={source} onChange={(event) => setSource(event.target.value)}>
              <option value="">All sources</option>
              {sourceOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Keyword</span>
            <input
              placeholder="Search title or snippet"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>

        <div className="toolbar">
          <div className="muted">
            Loaded shard: <code>{shardPath || '-'}</code>
          </div>
          <button
            className="button"
            type="button"
            onClick={() =>
              triggerCsvDownload(
                filteredArticles.map(toExplorerCsvRow),
                `wpm-export-${countryCode || 'all'}-${date || month || 'all'}.csv`
              )
            }
            disabled={filteredArticles.length === 0}
          >
            Download current CSV
          </button>
        </div>
      </section>

      {manifestState.error ? <div className="panel danger">Manifest load failed: {manifestState.error}</div> : null}
      {shardState.error ? <div className="panel danger">Shard load failed: {shardState.error}</div> : null}

      <section className="panel">
        <div className="section-head">
          <h2>Results</h2>
          <span>
            {filteredArticles.length.toLocaleString()} rows
            {filteredArticles.length > tableRows.length ? ` · showing first ${tableRows.length.toLocaleString()}` : ''}
          </span>
        </div>

        {manifestState.loading && !manifest ? <div className="muted">Loading manifest...</div> : null}
        {shardState.loading && !shardState.data ? <div className="muted">Loading shard...</div> : null}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Country</th>
                <th>Source</th>
                <th>Section</th>
                <th>Title</th>
                <th>Link</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((article) => (
                <tr key={article.id}>
                  <td>{article.publicationDatetime.replace('T', ' ').slice(0, 16)}</td>
                  <td>
                    {article.country}
                    <small>{article.countryCode}</small>
                  </td>
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
              {!manifestState.loading && !shardState.loading && tableRows.length === 0 ? (
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

export function ExplorerView() {
  return hasNewsApiBaseUrl() ? <ApiExplorerView /> : <StaticExplorerView />;
}
