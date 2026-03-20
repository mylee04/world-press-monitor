'use client';

import { CustomerAccessPanel } from '@/components/customer-access-panel';
import { useCustomerAccess } from '@/components/customer-access-provider';
import { useNewsApiDashboardSummary } from '@/components/news-api-hooks';
import { hasNewsApiBaseUrl } from '@/lib/news-api';
import { PUBLIC_DATA_SECTIONS } from '@/lib/public-data';

function renderGeneratedAt(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function renderRelativeTime(value: string | null | undefined): string {
  if (!value) return 'time unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'time unavailable';

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / (60 * 1000));

  if (Math.abs(diffMinutes) < 1) return 'just now';
  if (Math.abs(diffMinutes) < 60) return `${Math.abs(diffMinutes)} min ${diffMinutes >= 0 ? 'ago' : 'ahead'}`;

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return `${Math.abs(diffHours)} hr ${diffHours >= 0 ? 'ago' : 'ahead'}`;

  const diffDays = Math.round(diffHours / 24);
  return `${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'} ${diffDays >= 0 ? 'ago' : 'ahead'}`;
}

function renderSectionLabel(section: string | null | undefined): string {
  if (!section || section === 'others') return 'general / uncategorized';
  if (section === 'entertainment') return 'entertainment';
  if (section === 'lifestyle') return 'lifestyle';
  if (section === 'arts') return 'arts';
  return section;
}

export function DashboardView() {
  const { hasToken, isReady } = useCustomerAccess();
  const summaryState = useNewsApiDashboardSummary();
  const summary = summaryState.data?.storage === 'postgres' ? summaryState.data : null;

  if (!hasNewsApiBaseUrl()) {
    return (
      <CustomerAccessPanel
        title="Portal API Not Configured"
        description="This customer portal is configured to require authenticated API access, but the API base URL is missing."
      />
    );
  }

  if (!isReady) {
    return <div className="panel muted">Checking customer access...</div>;
  }

  if (!hasToken) {
    return <CustomerAccessPanel />;
  }

  if (summaryState.loading && !summary) {
    return <div className="panel muted">Loading live dashboard summary...</div>;
  }

  if (summaryState.error) {
    return (
      <CustomerAccessPanel
        title="Customer Token Required"
        description="The live dashboard only loads for customers with a valid API token or API key."
        error={summaryState.error}
      />
    );
  }

  if (!summary) {
    return <div className="panel danger">Dashboard summary is unavailable.</div>;
  }

  const sectionRollup = PUBLIC_DATA_SECTIONS.map((section) => ({
    key: section,
    count: summary.sectionTotals[section] || 0,
  })).filter((item) => item.count > 0);

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div className="eyebrow">Customer Dashboard</div>
        <h1>Live category, country, and date coverage from the authenticated news API.</h1>
        <p>
          This dashboard reads directly from the customer API. Anonymous visitors do not receive article
          data, static shards, or downloadable snapshots.
        </p>
        <div className="hero-note">
          <strong>Live refresh:</strong> last update {renderRelativeTime(summary.generatedAt)}.
          Coverage metrics reflect the current database-backed window rather than a static export.
        </div>
      </section>

      <section className="metric-grid">
        <article className="metric-card">
          <span>Latest refresh</span>
          <strong>{renderGeneratedAt(summary.generatedAt)}</strong>
          <small>{renderRelativeTime(summary.generatedAt)}</small>
        </article>
        <article className="metric-card">
          <span>Rows in 31d window</span>
          <strong>{summary.totals.rowsWindow.toLocaleString()}</strong>
          <small>raw publicationDatetime rows currently available to the portal</small>
        </article>
        <article className="metric-card">
          <span>Inserted in last 24h</span>
          <strong>{summary.totals.inserted24h.toLocaleString()}</strong>
          <small>createdAt rows loaded by the ingestion pipeline</small>
        </article>
        <article className="metric-card">
          <span>Published in last 24h</span>
          <strong>{summary.totals.published24h.toLocaleString()}</strong>
          <small>publicationDatetime rows in the latest rolling day</small>
        </article>
        <article className="metric-card">
          <span>Sources checked in last 24h</span>
          <strong>{summary.totals.checkedSources24h.toLocaleString()}</strong>
          <small>distinct country/source health checks by worker</small>
        </article>
      </section>

      <section className="grid-two">
        <article className="panel">
          <div className="section-head">
            <h2>Top countries in latest preview date</h2>
            <span>{summary.previewDate ? `${summary.previewDate} · ${summary.preview.articleCount.toLocaleString()} rows` : 'No data'}</span>
          </div>
          <div className="stat-list">
            {summary.preview.topCountries.length > 0 ? (
              summary.preview.topCountries.map((item) => (
                <div className="stat-row" key={item.country}>
                  <span>{item.country}</span>
                  <strong>{item.count.toLocaleString()}</strong>
                </div>
              ))
            ) : (
              <div className="muted">No preview country counts available yet.</div>
            )}
          </div>
        </article>

        <article className="panel">
          <div className="section-head">
            <h2>Recent date counts</h2>
            <span>{summary.recentDates.length} dates</span>
          </div>
          <div className="stat-list">
            {summary.recentDates.length > 0 ? (
              summary.recentDates.map((item) => (
                <div className="stat-row" key={item.date}>
                  <span>{item.date}</span>
                  <strong>{item.count.toLocaleString()}</strong>
                </div>
              ))
            ) : (
              <div className="muted">No recent date rollup available yet.</div>
            )}
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>Category mix in 31d window</h2>
          <span>{summary.totals.rowsWindow.toLocaleString()} rows</span>
        </div>
        <div className="stat-list">
          {sectionRollup.length > 0 ? (
            sectionRollup.map((item) => (
              <div className="stat-row" key={item.key}>
                <span>{renderSectionLabel(item.key)}</span>
                <strong>{item.count.toLocaleString()}</strong>
              </div>
            ))
          ) : (
            <div className="muted">No section distribution available yet.</div>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>Recent headlines</h2>
          <span>{summary.preview.headlines.length > 0 ? `Preview date · ${summary.previewDate || '-'}` : 'Waiting for live rows'}</span>
        </div>
        <div className="headline-list">
          {summary.preview.headlines.map((article) => (
            <a className="headline-card" key={article.id} href={article.url} rel="noreferrer" target="_blank">
              <small>
                {article.country || 'Unknown'} · {article.source} · {renderSectionLabel(article.section)}
              </small>
              <strong>{article.title}</strong>
              <span>{article.snippet || 'Snippet unavailable in customer API preview.'}</span>
            </a>
          ))}
          {summary.preview.headlines.length === 0 ? <div className="muted">No recent headlines available yet.</div> : null}
        </div>
      </section>
    </div>
  );
}
