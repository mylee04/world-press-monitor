'use client';

import { startTransition, useDeferredValue, useEffect, useState } from 'react';
import { useManifest, useShard } from '@/components/public-data-hooks';
import type { PublicNewsArticle } from '@/lib/public-data';
import { withBasePath } from '@/lib/site-paths';

function buildClientCsv(rows: PublicNewsArticle[]): string {
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
  ];
  const body = rows.map((row) =>
    [
      row.id,
      row.source,
      row.country,
      row.countryCode,
      row.language,
      row.section,
      row.title,
      row.snippet,
      row.url,
      row.publicationDatetime,
      row.createdAt,
    ]
      .map((value) => {
        if (!/[",\n]/.test(value)) return value;
        return `"${value.replaceAll('"', '""')}"`;
      })
      .join(',')
  );
  return `${header.join(',')}\n${body.join('\n')}${body.length ? '\n' : ''}`;
}

function triggerCsvDownload(rows: PublicNewsArticle[], filename: string): void {
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

function renderSectionLabel(section: string): string {
  if (section === 'entertainment') return 'entertainment';
  if (section === 'lifestyle') return 'lifestyle';
  if (section === 'arts') return 'arts';
  if (section === 'others') return 'general / uncategorized';
  return section;
}

export function ExplorerView() {
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
            onClick={() => triggerCsvDownload(filteredArticles, `wpm-export-${countryCode || 'all'}-${date || month || 'all'}.csv`)}
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
