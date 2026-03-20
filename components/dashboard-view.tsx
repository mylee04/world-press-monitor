'use client';

import Link from 'next/link';
import { useNewsApiDashboardSummary } from '@/components/news-api-hooks';
import { useManifest, useShard } from '@/components/public-data-hooks';
import { hasNewsApiBaseUrl, type NewsApiCountryCount, type NewsApiDashboardItem } from '@/lib/news-api';
import type { PublicDashboardCountryCount, PublicNewsArticle } from '@/lib/public-data';
import { PUBLIC_DATA_SECTIONS } from '@/lib/public-data';
import { withBasePath } from '@/lib/site-paths';

type DashboardCountryCount = PublicDashboardCountryCount | NewsApiCountryCount;
type DashboardHeadline = PublicNewsArticle | NewsApiDashboardItem;

function countBy<T>(items: T[], getKey: (item: T) => string): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = getKey(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

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

function renderCountryCode(value: string | null | undefined): string {
  return value?.trim() || '-';
}

export function DashboardView() {
  const manifestState = useManifest();
  const apiSummaryState = useNewsApiDashboardSummary();
  const manifest = manifestState.data;
  const liveSummary =
    hasNewsApiBaseUrl() && apiSummaryState.data?.storage === 'postgres' ? apiSummaryState.data : null;
  const previewShardPath = manifest?.shards.featuredByDate || manifest?.shards.byDate || null;
  const shouldLoadPreviewShard = !liveSummary && !manifest?.dashboardPreview;
  const latestShardState = useShard(shouldLoadPreviewShard ? previewShardPath : null);

  if (manifestState.loading && !manifest && !liveSummary) {
    return <div className="panel muted">Loading dashboard data...</div>;
  }

  if (manifestState.error && !manifest && !liveSummary) {
    return <div className="panel danger">Dashboard load failed: {manifestState.error}</div>;
  }

  if (!manifest && !liveSummary) {
    return <div className="panel muted">No dashboard data found yet.</div>;
  }

  const preview = manifest?.dashboardPreview;
  const latestArticles: DashboardHeadline[] = liveSummary
    ? liveSummary.preview.headlines
    : preview?.headlines || latestShardState.data?.articles?.slice(0, 8) || [];
  const countryRollup: DashboardCountryCount[] = liveSummary
    ? liveSummary.preview.topCountries
    : preview?.topCountries || countBy(latestShardState.data?.articles || [], (article) => `${article.countryCode}|${article.country}`)
      .slice(0, 6)
      .map((item) => {
        const [countryCode, country] = item.key.split('|');
        return { countryCode, country, count: item.count };
      });
  const previewArticleCount = liveSummary
    ? liveSummary.preview.articleCount
    : preview?.articleCount ?? latestShardState.data?.articles?.length ?? 0;
  const previewDate = liveSummary
    ? liveSummary.previewDate || liveSummary.latestDate || null
    : manifest?.featuredDate || manifest?.latestDate || null;
  const usingFallbackPreviewDate = liveSummary
    ? Boolean(previewDate && liveSummary.latestDate && previewDate !== liveSummary.latestDate)
    : Boolean(previewDate && manifest?.latestDate && previewDate !== manifest.latestDate);
  const cadence = manifest?.cadence;
  const exportStats = manifest?.exportStats;
  const generatedAt = liveSummary?.generatedAt || manifest?.generatedAt || null;
  const cadenceLabel = liveSummary
    ? 'Live API summary backed by the database. Static downloads remain available below.'
    : cadence
      ? `${cadence.frequency} export pipeline in ${cadence.timezone}. Actual publish time depends on ingest, export, build, and deploy.`
      : 'Snapshot export cadence not published in manifest yet.';
  const staticExportCaption = exportStats
    ? exportStats.rowLimitHit
      ? `${exportStats.rawRowsInWindow.toLocaleString()} raw rows in ${exportStats.windowDays}d window before the ${exportStats.maxRows.toLocaleString()}-row cap`
      : `${exportStats.rawRowsInWindow.toLocaleString()} raw rows in ${exportStats.windowDays}d window`
    : 'filtered rows written to the public snapshot';
  const liveSectionTotals = liveSummary ? liveSummary.sectionTotals : null;
  const sectionRollup = (liveSummary ? PUBLIC_DATA_SECTIONS : manifest?.sections || []).map((section) => ({
    key: section,
    count: liveSectionTotals ? liveSectionTotals[section] || 0 : manifest?.sectionTotals[section] || 0,
  }));

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div className="eyebrow">{liveSummary ? 'API-backed dashboard' : 'Static export dashboard'}</div>
        <h1>{liveSummary ? 'Live news windows, filters, and downloadable snapshots.' : 'Published news snapshots and downloads.'}</h1>
        <p>
          {liveSummary
            ? 'The dashboard summary now reads directly from the database-backed API. Static CSV and JSON snapshots remain available as batch downloads.'
            : 'Explore published JSON and CSV snapshots of monitored coverage by date, country, source, and section.'}
        </p>
        <div className="hero-note">
          <strong>{liveSummary ? 'Live snapshot:' : 'Public snapshot:'}</strong> last refresh {renderRelativeTime(generatedAt)}. {cadenceLabel}
        </div>
        <div className="hero-actions">
          <Link href="/explorer/">Open Explorer</Link>
          {manifest?.downloads.latest24h ? (
            <a href={withBasePath(manifest.downloads.latest24h) || '#'}>Download latest 24h CSV</a>
          ) : null}
        </div>
      </section>

      {hasNewsApiBaseUrl() && apiSummaryState.error ? (
        <div className="panel danger">Live API summary failed: {apiSummaryState.error}. Falling back to static export data.</div>
      ) : null}
      {manifestState.error && manifest ? (
        <div className="panel danger">Manifest load degraded: {manifestState.error}</div>
      ) : null}
      {latestShardState.error && !liveSummary ? (
        <div className="panel danger">Shard load failed: {latestShardState.error}</div>
      ) : null}

      <section className="metric-grid">
        <article className="metric-card">
          <span>{liveSummary ? 'Latest refresh' : 'Latest export'}</span>
          <strong>{renderGeneratedAt(generatedAt)}</strong>
          <small>{renderRelativeTime(generatedAt)}</small>
        </article>
        <article className="metric-card">
          <span>Rows in 31d window</span>
          <strong>{(liveSummary?.totals.rowsWindow ?? exportStats?.rawRowsInWindow ?? 0).toLocaleString()}</strong>
          <small>{liveSummary ? 'raw publicationDatetime rows currently queryable in the rolling window' : 'raw publicationDatetime rows in the export window'}</small>
        </article>
        {liveSummary ? (
          <article className="metric-card">
            <span>Inserted in last 24h</span>
            <strong>{liveSummary.totals.inserted24h.toLocaleString()}</strong>
            <small>createdAt rows currently queryable via API</small>
          </article>
        ) : (
          <article className="metric-card">
            <span>Rows in public export</span>
            <strong>{manifest?.totals.articles.toLocaleString() || '-'}</strong>
            <small>{staticExportCaption}</small>
          </article>
        )}
        {liveSummary ? (
          <article className="metric-card">
            <span>Published in last 24h</span>
            <strong>{liveSummary.totals.published24h.toLocaleString()}</strong>
            <small>publicationDatetime rows currently queryable via API</small>
          </article>
        ) : (
          <article className="metric-card">
            <span>Latest 24h CSV rows</span>
            <strong>{manifest?.totals.latest24h.toLocaleString() || '-'}</strong>
            <small>
              {exportStats
                ? `${exportStats.rawLatest24hInserted.toLocaleString()} raw inserted rows before filtering`
                : 'createdAt rows in latest-24h.csv'}
            </small>
          </article>
        )}
        <article className="metric-card">
          <span>Registered sources</span>
          <strong>{manifest?.totals.sources.toLocaleString() || '-'}</strong>
          <small>atlas inventory published in sources.json</small>
        </article>
        <article className="metric-card">
          <span>Sources checked in last 24h</span>
          <strong>{(liveSummary?.totals.checkedSources24h ?? exportStats?.checkedSources24h ?? 0).toLocaleString()}</strong>
          <small>distinct country/source health checks by worker</small>
        </article>
        <article className="metric-card">
          <span>Configured schedule</span>
          <strong>{cadence ? 'Hourly' : liveSummary ? 'Live API' : 'Unavailable'}</strong>
          <small>
            {cadence
              ? `${cadence.timezone} · actual publish time varies`
              : liveSummary
                ? 'API reads current database state on request'
                : 'Static snapshot schedule'}
          </small>
        </article>
      </section>

      <section className="grid-two">
        <article className="panel">
          <div className="section-head">
            <h2>{liveSummary ? 'Top countries in live preview date' : 'Top countries in current date shard'}</h2>
            <span>{previewDate ? `${previewDate} · ${previewArticleCount.toLocaleString()} rows` : 'No data'}</span>
          </div>
          {usingFallbackPreviewDate ? (
            <div className="muted">
              Latest UTC shard/date is still thin, so the dashboard previews {previewDate}.
            </div>
          ) : null}
          <div className="stat-list">
            {countryRollup.length > 0 ? (
              countryRollup.map((item) => (
                <div className="stat-row" key={`${item.countryCode || 'na'}-${item.country}`}>
                  <span>
                    {item.country} <small>{renderCountryCode(item.countryCode)}</small>
                  </span>
                  <strong>{item.count.toLocaleString()}</strong>
                </div>
              ))
            ) : (
              <div className="muted">{liveSummary ? 'No preview rows in the live API window yet.' : 'No latest date shard rows yet.'}</div>
            )}
          </div>
        </article>

        <article className="panel">
          <div className="section-head">
            <h2>{liveSummary ? 'Section mix in live window' : 'Section mix in full export'}</h2>
            <span>
              {(liveSummary?.totals.rowsWindow ?? manifest?.totals.articles ?? 0).toLocaleString()} rows
            </span>
          </div>
          <div className="stat-list">
            {sectionRollup.length > 0 ? (
              sectionRollup
                .filter((item) => item.count > 0)
                .map((item) => (
                  <div className="stat-row" key={item.key}>
                    <span>{renderSectionLabel(item.key)}</span>
                    <strong>{item.count.toLocaleString()}</strong>
                  </div>
                ))
            ) : (
              <div className="muted">No section distribution available yet.</div>
            )}
          </div>
          <div className="muted">
            {liveSummary ? 'Live section totals come from direct database aggregation.' : 'Separate from the latest date shard preview below.'}
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>Recent headlines</h2>
          <span>
            {latestArticles.length > 0
              ? `${liveSummary ? 'Live preview' : 'Date-shard preview'} · ${previewDate || '-'}`
              : liveSummary
                ? 'Waiting for live rows'
                : 'Waiting for export'}
          </span>
        </div>
        <div className="headline-list">
          {latestArticles.map((article) => (
            <a className="headline-card" key={article.id} href={article.url} rel="noreferrer" target="_blank">
              <small>
                {article.country || 'Unknown'} {article.countryCode ? `· ${article.countryCode}` : ''} · {article.source} · {renderSectionLabel(article.section)}
              </small>
              <strong>{article.title}</strong>
              <span>{article.snippet || 'No snippet available.'}</span>
            </a>
          ))}
          {latestArticles.length === 0 ? (
            <div className="muted">{liveSummary ? 'No rows in the live preview yet.' : 'No articles in the latest shard yet.'}</div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
