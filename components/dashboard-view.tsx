'use client';

import { useState } from 'react';
import { useNewsApiDashboardSummary } from '@/components/news-api-hooks';
import { useTaxonomyLocalePreference } from '@/components/taxonomy-locale-provider';
import { NEWS_SECTION_ORDER } from '@/lib/article-taxonomy';
import type { DashboardDataSource, NewsApiDashboardSummaryResponse } from '@/lib/news-api';
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

  if (normalizedReason.startsWith('Dashboard summary unavailable from portal:')) {
    return 'Dashboard summary service is temporarily unavailable. Please try again shortly.';
  }

  return reason;
}

function getSummarySourceLabel(source?: DashboardDataSource): string {
  if (source === 'upstream') return 'Live portal';
  if (source === 'snapshot-fallback') return 'Snapshot fallback';
  if (source === 'disabled-snapshot-fallback') return 'Disabled snapshot fallback';
  if (source === 'disabled-fallback') return 'Disabled fallback';
  return 'Unknown source';
}

function getSummarySourceMessage(summary: NewsApiDashboardSummaryResponse): string {
  if (summary.dataSource === 'upstream') {
    return 'Using the live portal API. Metrics may lag the source database by up to 1 hour.';
  }

  const reason = summary.reason?.trim() || '';
  if (/timed out after/i.test(reason)) {
    return 'Using the bundled fallback snapshot because the live portal timed out.';
  }

  if (reason.startsWith('Dashboard summary unavailable from portal:')) {
    return 'Using the bundled fallback snapshot because the live portal is temporarily unavailable.';
  }

  if (summary.dataSource === 'snapshot-fallback') {
    return 'Using the bundled fallback snapshot because live portal data is unavailable right now.';
  }

  return 'Using fallback dashboard data.';
}

export function DashboardView() {
  const { mode: taxonomyLocaleMode, browserLocale, resolvedLocale, setMode: setTaxonomyLocaleMode } = useTaxonomyLocalePreference();
  const summaryState = useNewsApiDashboardSummary();
  const [expandedTopicGroups, setExpandedTopicGroups] = useState<Record<string, boolean>>({});
  const summary = summaryState.data?.storage === 'postgres' ? summaryState.data : null;
  const disabledReason =
    summaryState.data && summaryState.data.storage !== 'postgres'
      ? getDisabledSummaryMessage(summaryState.data.reason)
      : null;

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
          unassignedCount: Number(group?.unassignedCount || 0),
          topics: Array.isArray(group?.topics)
            ? group.topics.map((item) => ({
                ...item,
                count: Number(item?.count || 0),
              }))
            : [],
        }))
        .filter((group) => group.articleCount > 0)
    : [];
  const groupedTopicGroups = TAXONOMY_TOP_LEVEL_ORDER.map((group) => {
    const sectionGroups = topicGroups.filter((item) => mapSectionToTopLevelTaxonomy(item.section) === group);
    const articleCount = sectionRollup
      .filter((item) => mapSectionToTopLevelTaxonomy(item.key) === group)
      .reduce((sum, item) => sum + item.count, 0);
    const unassignedCount = sectionGroups.reduce((sum, item) => sum + item.unassignedCount, 0);
    const topicCounts = new Map<string, number>();
    for (const sectionGroup of sectionGroups) {
      for (const topic of sectionGroup.topics) {
        topicCounts.set(topic.topic, (topicCounts.get(topic.topic) || 0) + topic.count);
      }
    }
    const topics = [...topicCounts.entries()]
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic));
    return {
      group,
      articleCount,
      unassignedCount,
      topics,
    };
  }).filter((group) => group.group !== 'general_other' && group.articleCount > 0);

  return (
    <div className="page-stack dashboard-page-root">
      <section className="hero-panel">
        <div className="eyebrow">Customer Dashboard</div>
        <h1>Hourly snapshot coverage across rolling output, top countries, category mix, and topic structure.</h1>
        <p>
          This dashboard shows aggregate coverage views only.
          Raw article titles and source rows are not exposed here.
        </p>
        <div className="hero-note">
          <strong>{summary.dataSource === 'upstream' ? 'Live freshness:' : 'Fallback freshness:'}</strong>{' '}
          updated {renderRelativeTime(summary.generatedAt)}. {getSummarySourceMessage(summary)}
        </div>
        <div className="hero-note">
          <strong>Current source:</strong> {getSummarySourceLabel(summary.dataSource)}.
        </div>
        <div className="hero-note">
          Dashboard tracks the current rolling 24-hour window.
          Benchmark is reserved for fixed-period cross-country comparison across hourly, daily, weekly, and monthly lenses.
        </div>
        <div className="hero-actions">
          <label style={{ minWidth: 220 }}>
            <span>Category language</span>
            <select
              value={taxonomyLocaleMode}
              onChange={(event) => setTaxonomyLocaleMode(event.target.value as TaxonomyLocaleMode)}
              style={{
                background: 'rgba(11, 19, 34, 0.88)',
                color: '#f4fbff',
                border: '1px solid rgba(120, 199, 255, 0.18)',
                boxShadow: 'inset 0 0 0 1px rgba(120, 199, 255, 0.08)',
              }}
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
          <span>Snapshot ingestion in last 24h</span>
          <strong>{totals.inserted24h.toLocaleString()}</strong>
          <small>Articles inserted by the ingestion pipeline in the last 24 hours</small>
        </article>
        <article className="metric-card">
          <span>Published in last 24h</span>
          <strong>{totals.published24h.toLocaleString()}</strong>
          <small>Articles whose publication time falls within the latest rolling 24-hour window</small>
        </article>
        <article className="metric-card">
          <span>Sources checked in last 24h</span>
          <strong>{totals.checkedSources24h.toLocaleString()}</strong>
          <small>Distinct source health checks completed by the worker</small>
        </article>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>Top direct publisher countries in rolling 24h</h2>
          <span>{preview.articleCount.toLocaleString()} direct published</span>
        </div>
        <p className="muted" style={{ marginBottom: 12 }}>
          Ranked by publisher country when available, falling back to the article country only when source-country metadata is missing. Portal-classified feeds are excluded from this ranking.
        </p>
        <div className="stat-list">
          {preview.topCountries.length > 0 ? (
            preview.topCountries.map((item) => (
              <div className="stat-row" key={item.country}>
                <span>{item.country}</span>
                <strong>{item.count.toLocaleString()}</strong>
              </div>
            ))
          ) : (
            <div className="muted">No rolling 24-hour country counts available yet.</div>
          )}
        </div>
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
          <h2>Topic distribution by category</h2>
          <span>
            {totals.rowsWindow.toLocaleString()} articles across the full {windowDays}d window
          </span>
        </div>
        <p className="muted" style={{ marginBottom: 12 }}>
          Each article is assigned to one primary topic inside its product category.
          By default this shows the top 15 topics, surfaces Unassigned separately, and rolls the remaining long tail into Other so the visible rows still explain the full category total.
          Other now means hidden tail topics plus legacy topic values that do not match the current category taxonomy.
        </p>
        {groupedTopicGroups.length > 0 ? (
          <div className="topic-group-grid">
            {groupedTopicGroups.map((group) => (
              (() => {
                const isExpanded = Boolean(expandedTopicGroups[group.group]);
                const visibleLimit = isExpanded ? 30 : 15;
                const visibleTopics = group.topics.slice(0, visibleLimit);
                const visibleCount = visibleTopics.reduce((sum, item) => sum + item.count, 0);
                const otherCount = Math.max(0, group.articleCount - visibleCount - group.unassignedCount);
                const hasMoreTopics = group.topics.length > 15;

                return (
                  <article className="topic-group" key={group.group}>
                    <div className="topic-group-head">
                      <strong>{getTopLevelTaxonomyLabel(group.group, resolvedLocale)}</strong>
                      <small>{group.articleCount.toLocaleString()} articles</small>
                    </div>
                    <div className="stat-list">
                      {visibleTopics.map((item) => {
                        const share = group.articleCount > 0 ? (item.count / group.articleCount) * 100 : 0;
                        return (
                          <div className="stat-row" key={`${group.group}-${item.topic}`}>
                            <span>
                              {getTopicLabel(item.topic, resolvedLocale)}
                              <small style={{ display: 'block' }}>{share.toFixed(1)}%</small>
                            </span>
                            <strong>{item.count.toLocaleString()}</strong>
                          </div>
                        );
                      })}
                      {group.unassignedCount > 0 ? (
                        <div className="stat-row" key={`${group.group}-unassigned`}>
                          <span>
                            Unassigned
                            <small style={{ display: 'block' }}>
                              {group.articleCount > 0 ? ((group.unassignedCount / group.articleCount) * 100).toFixed(1) : '0.0'}%
                            </small>
                          </span>
                          <strong>{group.unassignedCount.toLocaleString()}</strong>
                        </div>
                      ) : null}
                      {otherCount > 0 ? (
                        <div className="stat-row" key={`${group.group}-other`}>
                          <span>
                            Other
                            <small style={{ display: 'block' }}>
                              {group.articleCount > 0 ? ((otherCount / group.articleCount) * 100).toFixed(1) : '0.0'}%
                            </small>
                          </span>
                          <strong>{otherCount.toLocaleString()}</strong>
                        </div>
                      ) : null}
                    </div>
                    {hasMoreTopics ? (
                      <button
                        type="button"
                        className="button"
                        style={{ marginTop: 12 }}
                        onClick={() => setExpandedTopicGroups((current) => ({ ...current, [group.group]: !isExpanded }))}
                      >
                        {isExpanded ? 'Show fewer topics' : `Show more topics (${Math.min(group.topics.length, 30).toLocaleString()} total)`}
                      </button>
                    ) : null}
                  </article>
                );
              })()
            ))}
          </div>
        ) : (
          <div className="muted">Detailed topic leaders are still warming up.</div>
        )}
      </section>
    </div>
  );
}
