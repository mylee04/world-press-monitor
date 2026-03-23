'use client';

import { CustomerAccessPanel } from '@/components/customer-access-panel';
import { useCustomerAccess } from '@/components/customer-access-provider';
import { useNewsApiDashboardSummary } from '@/components/news-api-hooks';
import { NEWS_SECTION_ORDER } from '@/lib/article-taxonomy';

function renderGeneratedAt(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  try {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  }
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

function renderSectionList(sections: string[] | null | undefined): string {
  const normalized = [...new Set((sections || []).filter(Boolean))];
  if (!normalized.length) return renderSectionLabel('others');
  return normalized.map((section) => renderSectionLabel(section)).join(', ');
}

function renderTopicList(topics: string[] | null | undefined): string {
  const normalized = [...new Set((topics || []).filter(Boolean))];
  if (!normalized.length) return 'No detailed topic mapped yet';
  return normalized.join(', ');
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

  const totals = {
    rowsWindow: Number(summary.totals?.rowsWindow || 0),
    inserted24h: Number(summary.totals?.inserted24h || 0),
    published24h: Number(summary.totals?.published24h || 0),
    checkedSources24h: Number(summary.totals?.checkedSources24h || 0),
  };
  const latestHours = Number(summary.latestHours || 0);
  const topicSampleSize = Number(summary.topicSampleSize || 0);
  const sectionTotals = summary.sectionTotals && typeof summary.sectionTotals === 'object' ? summary.sectionTotals : {};
  const recentDates = Array.isArray(summary.recentDates) ? summary.recentDates : [];
  const preview =
    summary.preview && typeof summary.preview === 'object'
      ? {
          articleCount: Number(summary.preview.articleCount || 0),
          topCountries: Array.isArray(summary.preview.topCountries)
            ? summary.preview.topCountries.map((item) => ({
                ...item,
                count: Number(item?.count || 0),
              }))
            : [],
          headlines: Array.isArray(summary.preview.headlines)
            ? summary.preview.headlines.map((article) => ({
                ...article,
                sections: Array.isArray(article?.sections) ? article.sections : [],
                topics: Array.isArray(article?.topics) ? article.topics : [],
                sourceCategories: Array.isArray(article?.sourceCategories) ? article.sourceCategories : [],
              }))
            : [],
        }
      : { articleCount: 0, topCountries: [], headlines: [] };
  const sectionRollup = NEWS_SECTION_ORDER.map((section) => ({
    key: section,
    count: Number(sectionTotals[section as keyof typeof sectionTotals] || 0),
  })).filter((item) => item.count > 0);
  const topicGroups = Array.isArray(summary.topicGroups)
    ? summary.topicGroups
        .map((group) => ({
          ...group,
          articleCount: Number(group?.articleCount || 0),
          topics: Array.isArray(group?.topics)
            ? group.topics.map((item) => ({
                ...item,
                count: Number(item?.count || 0),
              }))
            : [],
        }))
        .filter((group) => group.topics.length > 0)
    : [];

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
          Coverage metrics reflect the current rolling window from PostgreSQL.
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
          <strong>{totals.rowsWindow.toLocaleString()}</strong>
          <small>Articles currently available in the rolling 31-day view</small>
        </article>
        <article className="metric-card">
          <span>Added in last 24h</span>
          <strong>{totals.inserted24h.toLocaleString()}</strong>
          <small>Articles inserted by the ingestion pipeline in the last 24 hours</small>
        </article>
        <article className="metric-card">
          <span>Published in last 24h</span>
          <strong>{totals.published24h.toLocaleString()}</strong>
          <small>Articles whose publication time falls within the latest rolling day</small>
        </article>
        <article className="metric-card">
          <span>Sources checked in last 24h</span>
          <strong>{totals.checkedSources24h.toLocaleString()}</strong>
          <small>Distinct source health checks completed by the worker</small>
        </article>
      </section>

      <section className="grid-two">
        <article className="panel">
          <div className="section-head">
            <h2>Top countries on latest UTC publication date</h2>
            <span>{summary.previewDate ? `${summary.previewDate} · ${preview.articleCount.toLocaleString()} articles` : 'No data'}</span>
          </div>
          <div className="stat-list">
            {preview.topCountries.length > 0 ? (
              preview.topCountries.map((item) => (
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
            <span>{recentDates.length} dates</span>
          </div>
          <div className="stat-list">
            {recentDates.length > 0 ? (
              recentDates.map((item) => (
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
          <h2>Primary section mix in 31d window</h2>
          <span>{totals.rowsWindow.toLocaleString()} articles</span>
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
          <h2>Detailed topic leaders</h2>
          <span>
            {topicSampleSize.toLocaleString()} recent articles sampled across the latest {latestHours}h window
          </span>
        </div>
        {topicGroups.length > 0 ? (
          <div className="topic-group-grid">
            {topicGroups.map((group) => (
              <article className="topic-group" key={group.section}>
                <div className="topic-group-head">
                  <strong>{renderSectionLabel(group.section)}</strong>
                  <small>{group.articleCount.toLocaleString()} sampled</small>
                </div>
                <div className="topic-pill-row">
                  {group.topics.map((item) => (
                    <span className="topic-pill" key={`${group.section}-${item.topic}`}>
                      <strong>{item.topic}</strong>
                      <small>{item.count.toLocaleString()}</small>
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="muted">Detailed topic leaders are still warming up.</div>
        )}
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>Recent headlines</h2>
          <span>{preview.headlines.length > 0 ? `Preview date · ${summary.previewDate || '-'} UTC` : 'Waiting for live rows'}</span>
        </div>
        <div className="headline-list">
          {preview.headlines.map((article) => (
            <a className="headline-card" key={article.id} href={article.url} rel="noreferrer" target="_blank">
              <small>
                {article.country || 'Unknown'} · {article.source} · {renderSectionLabel(article.primarySection)}
              </small>
              <strong>{article.title}</strong>
              <small>
                {article.topics.length > 0
                  ? `Topics · ${renderTopicList(article.topics)}`
                  : `Sections · ${renderSectionList(article.sections)}`}
              </small>
              <span>{article.snippet || 'Snippet unavailable in customer API preview.'}</span>
            </a>
          ))}
          {preview.headlines.length === 0 ? <div className="muted">No recent headlines available yet.</div> : null}
        </div>
      </section>
    </div>
  );
}
