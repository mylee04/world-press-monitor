'use client';

import { useState } from 'react';
import { useManifest, useSources } from '@/components/public-data-hooks';

export function SourceHealthView() {
  const manifestState = useManifest();
  const sourcesState = useSources();
  const manifest = manifestState.data;
  const sources = sourcesState.data?.sources || [];
  const [countryCode, setCountryCode] = useState('');
  const [status, setStatus] = useState<'all' | 'healthy' | 'failing'>('all');
  const [query, setQuery] = useState('');

  const filtered = sources.filter((item) => {
    if (countryCode && item.countryCode !== countryCode) return false;
    if (status === 'healthy' && item.latestHealth && !item.latestHealth.ok) return false;
    if (status === 'failing' && (!item.latestHealth || item.latestHealth.ok)) return false;
    if (!query.trim()) return true;
    const haystack = `${item.source} ${item.country} ${item.rssUrl || ''}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  if ((manifestState.loading && !manifest) || (sourcesState.loading && !sourcesState.data)) {
    return <div className="panel muted">Loading source health snapshot...</div>;
  }

  if (manifestState.error) {
    return <div className="panel danger">Manifest load failed: {manifestState.error}</div>;
  }

  if (sourcesState.error) {
    return <div className="panel danger">Sources load failed: {sourcesState.error}</div>;
  }

  return (
    <div className="page-stack">
      <section className="hero-panel compact">
        <div className="eyebrow">Source health</div>
        <h1>Latest feed status by source</h1>
        <p>
          This page mirrors the most recent <code>rss_health_status</code> snapshot exported from the
          local database.
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
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as 'all' | 'healthy' | 'failing')}>
              <option value="all">All</option>
              <option value="healthy">Healthy</option>
              <option value="failing">Failing or missing</option>
            </select>
          </label>
          <label>
            <span>Search</span>
            <input
              placeholder="Source or URL"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>Sources</h2>
          <span>{filtered.length.toLocaleString()} rows</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Country</th>
                <th>Source</th>
                <th>Method</th>
                <th>Status</th>
                <th>Last checked</th>
                <th>Feed</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={`${item.countryCode}-${item.source}`}>
                  <td>
                    {item.country}
                    <small>{item.countryCode}</small>
                  </td>
                  <td>{item.source}</td>
                  <td>{item.latestHealth?.method || '-'}</td>
                  <td>
                    {item.latestHealth
                      ? item.latestHealth.ok
                        ? `OK${item.latestHealth.statusCode ? ` ${item.latestHealth.statusCode}` : ''}`
                        : `FAIL${item.latestHealth.statusCode ? ` ${item.latestHealth.statusCode}` : ''}`
                      : 'No snapshot'}
                  </td>
                  <td>{item.latestHealth?.ranAt?.replace('T', ' ').slice(0, 16) || '-'}</td>
                  <td>
                    {item.rssUrl ? (
                      <a href={item.rssUrl} rel="noreferrer" target="_blank">
                        Feed
                      </a>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6}>No source rows match the current filter.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
