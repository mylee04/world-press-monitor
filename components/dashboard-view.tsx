'use client';

import { CustomerAccessPanel } from '@/components/customer-access-panel';
import { useCustomerAccess } from '@/components/customer-access-provider';
import { useNewsApiDashboardSummary } from '@/components/news-api-hooks';
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
  if (!section || section === 'others') return 'general / unclassified';
  if (section === 'entertainment') return 'entertainment';
  if (section === 'lifestyle') return 'lifestyle';
  if (section === 'arts') return 'arts';
  return section;
}

export function DashboardView() {
  const { hasToken, isReady, apiConfigured } = useCustomerAccess();
  const summaryState = useNewsApiDashboardSummary();
  const summary = summaryState.data?.storage === 'postgres' ? summaryState.data : null;

  if (!apiConfigured && isReady) {
    return (
      <CustomerAccessPanel
        title="Portal API Not Configured"
        description="This customer portal requires a server-side World Press Radar API base URL before authenticated article access can work."
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
        <h1>Live article coverage by section, country, and UTC publication date.</h1>
        <p>
          This dashboard reads live counts and preview headlines from the authenticated customer API.
          Anonymous visitors do not receive article data or downloads.
        </p>
        <div className="hero-note">
          <strong>Live refresh:</strong> updated {renderRelativeTime(summary.generatedAt)} from the live database.
          Coverage metrics reflect the current rolling window, not a static export.
        </div>
      </section>

      <section className="metric-grid">
        <article className="metric-card">
          <span>Latest refresh</span>
          <strong>{renderGeneratedAt(summary.generatedAt)}</strong>
          <small>{renderRelativeTime(summary.generatedAt)}</small>
        </article>
        <article className="metric-card">
          <span>Articles in 31d window</span>
          <strong>{summary.totals.rowsWindow.toLocaleString()}</strong>
          <small>Articles currently available in the rolling 31-day view</small>
        </article>
        <article className="metric-card">
          <span>Added in last 24h</span>
          <strong>{summary.totals.inserted24h.toLocaleString()}</strong>
          <small>Articles inserted by the ingestion pipeline in the last 24 hours</small>
        </article>
        <article className="metric-card">
          <span>Published in last 24h</span>
          <strong>{summary.totals.published24h.toLocaleString()}</strong>
          <small>Articles whose publication time falls within the latest rolling day</small>
        </article>
        <article className="metric-card">
          <span>Sources checked in last 24h</span>
          <strong>{summary.totals.checkedSources24h.toLocaleString()}</strong>
          <small>Distinct source health checks completed by the worker</small>
        </article>
      </section>

      <section className="grid-two">
        <article className="panel">
          <div className="section-head">
            <h2>Top countries on latest UTC publication date</h2>
            <span>{summary.previewDate ? `${summary.previewDate} · ${summary.preview.articleCount.toLocaleString()} articles` : 'No data'}</span>
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
            <h2>Recent UTC date counts</h2>
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
          <h2>Section mix in 31d window</h2>
          <span>{summary.totals.rowsWindow.toLocaleString()} articles</span>
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
          <span>{summary.preview.headlines.length > 0 ? `Preview date · ${summary.previewDate || '-'} UTC` : 'Waiting for live rows'}</span>
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
