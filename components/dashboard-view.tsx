'use client';

import { CustomerAccessPanel } from '@/components/customer-access-panel';
import { useCustomerAccess } from '@/components/customer-access-provider';
import { useNewsApiDashboardSummary } from '@/components/news-api-hooks';
import { useTaxonomyLocalePreference } from '@/components/taxonomy-locale-provider';
import { NEWS_SECTION_ORDER } from '@/lib/article-taxonomy';
import {
  getTaxonomyLocaleLabel,
  getTopLevelTaxonomyLabel,
  getTopicLabel,
  mapSectionToTopLevelTaxonomy,
  TAXONOMY_TOP_LEVEL_ORDER,
  type TaxonomyLocaleMode,
} from '@/lib/taxonomy-display';

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

function getDisabledSummaryMessage(reason?: string): string {
  if (!reason) {
    return 'Dashboard summary is unavailable.';
  }

  const normalizedReason = reason.trim();
  if (!normalizedReason) {
    return 'Dashboard summary is unavailable.';
  }

  if (normalizedReason === 'not_initialized') {
    return 'Dashboard snapshot is not initialized yet. Please check the latest deployment and try again.';
  }

  if (normalizedReason === 'missing_database_url') {
    return 'Dashboard snapshot is waiting for database configuration.';
  }

  return reason;
}

export function DashboardView() {
  const { isReady, apiConfigured } = useCustomerAccess();
  const { mode: taxonomyLocaleMode, browserLocale, resolvedLocale, setMode: setTaxonomyLocaleMode } = useTaxonomyLocalePreference();
  const summaryState = useNewsApiDashboardSummary();
  const summary = summaryState.data?.storage === 'postgres' ? summaryState.data : null;
  const disabledReason =
    summaryState.data && summaryState.data.storage !== 'postgres'
      ? getDisabledSummaryMessage(summaryState.data.reason)
      : null;

  if (!apiConfigured && isReady) {
    return (
      <div className="page-stack dashboard-page-root">
        <CustomerAccessPanel
          title="Portal API Not Configured"
          description="This customer portal requires a server-side World Press Radar API base URL before dashboard data can load."
        />
      </div>
    );
  }

  if (!isReady) {
    return <div className="page-stack dashboard-page-root"><div className="panel muted">Checking customer access...</div></div>;
  }

  if (summaryState.loading && !summary) {
    return <div className="page-stack dashboard-page-root"><div className="panel muted">Loading live dashboard summary...</div></div>;
  }

  if (summaryState.error) {
    return (
      <div className="page-stack dashboard-page-root">
        <section className="panel danger">
          <h2>Dashboard data unavailable</h2>
          <p>{summaryState.error}</p>
        </section>
      </div>
    );
  }

  if (!summary) {
    return <div className="page-stack dashboard-page-root"><div className="panel danger">{disabledReason || 'Dashboard summary is unavailable.'}</div></div>;
  }

  const totals = {
    rowsWindow: Number(summary.totals?.rowsWindow || 0),
    inserted24h: Number(summary.totals?.inserted24h || 0),
    published24h: Number(summary.totals?.published24h || 0),
    checkedSources24h: Number(summary.totals?.checkedSources24h || 0),
  };
  const windowDays = Number(summary.windowDays || 31);
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
        }
      : { articleCount: 0, topCountries: [] };
  const sectionRollup = NEWS_SECTION_ORDER.map((section) => ({
    key: section,
    count: Number(sectionTotals[section as keyof typeof sectionTotals] || 0),
    share: totals.rowsWindow > 0 ? Number(sectionTotals[section as keyof typeof sectionTotals] || 0) / totals.rowsWindow : 0,
  })).filter((item) => item.count > 0);
  const topLevelRollup = TAXONOMY_TOP_LEVEL_ORDER.map((group) => {
    const count = sectionRollup
      .filter((item) => mapSectionToTopLevelTaxonomy(item.key) === group)
      .reduce((sum, item) => sum + item.count, 0);
    return {
      key: group,
      count,
      share: totals.rowsWindow > 0 ? count / totals.rowsWindow : 0,
    };
  }).filter((item) => item.count > 0);
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
  const groupedTopicGroups = TAXONOMY_TOP_LEVEL_ORDER.map((group) => {
    const sectionGroups = topicGroups.filter((item) => mapSectionToTopLevelTaxonomy(item.section) === group);
    const articleCount = sectionRollup
      .filter((item) => mapSectionToTopLevelTaxonomy(item.key) === group)
      .reduce((sum, item) => sum + item.count, 0);
    const topicCounts = new Map<string, number>();
    for (const sectionGroup of sectionGroups) {
      for (const topic of sectionGroup.topics) {
        topicCounts.set(topic.topic, (topicCounts.get(topic.topic) || 0) + topic.count);
      }
    }
    const topics = [...topicCounts.entries()]
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic))
      .slice(0, 10);
    return {
      group,
      articleCount,
      topics,
    };
  }).filter((group) => group.group !== 'general_other' && group.topics.length > 0);

  return (
    <div className="page-stack dashboard-page-root">
      <section className="hero-panel">
        <div className="eyebrow">Customer Dashboard</div>
        <h1>Hourly snapshot coverage metrics by top-level category, topic, country, and UTC publication date.</h1>
        <p>
          This dashboard uses hourly customer snapshots for aggregate coverage views only.
          Raw article titles and source rows are not exposed here.
        </p>
        <div className="hero-note">
          <strong>Snapshot freshness:</strong> updated {renderRelativeTime(summary.generatedAt)} from the latest hourly snapshot.
          Metrics may lag the source database by up to 1 hour.
        </div>
        <div className="hero-actions">
          <label style={{ minWidth: 220 }}>
            <span>Category language</span>
            <select
              value={taxonomyLocaleMode}
              onChange={(event) => setTaxonomyLocaleMode(event.target.value as TaxonomyLocaleMode)}
            >
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
      </section>

      <section className="metric-grid">
        <article className="metric-card">
          <span>Latest snapshot</span>
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
          <h2>Coverage by top-level category</h2>
          <span>{totals.rowsWindow.toLocaleString()} articles</span>
        </div>
        <p className="muted" style={{ marginBottom: 12 }}>
          These are World Press Radar&apos;s product categories, grouped from the underlying normalized sections rather than raw publisher labels.
        </p>
        <div className="stat-list">
          {topLevelRollup.length > 0 ? (
            topLevelRollup.map((item) => (
              <div className="stat-row" key={item.key}>
                <span>
                  {getTopLevelTaxonomyLabel(item.key, resolvedLocale)}
                  <small style={{ display: 'block' }}>{(item.share * 100).toFixed(1)}%</small>
                </span>
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
          <h2>Top normalized topics by category</h2>
          <span>
            {totals.rowsWindow.toLocaleString()} articles across the full {windowDays}d window
          </span>
        </div>
        <p className="muted" style={{ marginBottom: 12 }}>
          Topic leaders are grouped under the top-level product category so related sections such as Technology + Science or Culture + Entertainment read together.
          Low-signal tails are hidden so the panel reflects material themes instead of one-off noise.
        </p>
        {groupedTopicGroups.length > 0 ? (
          <div className="topic-group-grid">
            {groupedTopicGroups.map((group) => (
              <article className="topic-group" key={group.group}>
                <div className="topic-group-head">
                  <strong>{getTopLevelTaxonomyLabel(group.group, resolvedLocale)}</strong>
                  <small>{group.articleCount.toLocaleString()} articles</small>
                </div>
                <div className="topic-pill-row">
                  {group.topics.map((item) => (
                    <span className="topic-pill" key={`${group.group}-${item.topic}`}>
                      <strong>{getTopicLabel(item.topic, resolvedLocale)}</strong>
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
    </div>
  );
}
