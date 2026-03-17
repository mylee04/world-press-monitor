'use client';

import Link from 'next/link';
import { useManifest, useShard } from '@/components/public-data-hooks';
import type { PublicNewsArticle } from '@/lib/public-data';
import { withBasePath } from '@/lib/site-paths';

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

function renderSectionLabel(section: string): string {
  if (section === 'entertainment') return 'entertainment';
  if (section === 'lifestyle') return 'lifestyle';
  if (section === 'arts') return 'arts';
  if (section === 'others') return 'general / uncategorized';
  return section;
}

export function DashboardView() {
  const manifestState = useManifest();
  const latestShardState = useShard(manifestState.data?.shards.byDate || null);

  const latestArticles = latestShardState.data?.articles || [];
  const countryRollup = countBy(latestArticles, (article) => `${article.countryCode}|${article.country}`)
    .slice(0, 6)
    .map((item) => {
      const [countryCode, country] = item.key.split('|');
      return { countryCode, country, count: item.count };
    });
  if (manifestState.loading && !manifestState.data) {
    return <div className="panel muted">Loading latest manifest...</div>;
  }

  if (manifestState.error) {
    return <div className="panel danger">Manifest load failed: {manifestState.error}</div>;
  }

  if (!manifestState.data) {
    return <div className="panel muted">No public export found yet. Run `bun run export:public:local` first.</div>;
  }

  const manifest = manifestState.data;
  const sectionRollup = manifest.sections.map((section) => ({
    key: section,
    count: manifest.sectionTotals[section] || 0,
  }));
  const cadence = manifest.cadence;
  const cadenceLabel = cadence
    ? `${cadence.frequency} snapshot, scheduled around :${String(cadence.scheduledMinute).padStart(2, '0')} ${cadence.timezone}`
    : 'Snapshot export cadence not published in manifest yet.';

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div className="eyebrow">Static export dashboard</div>
        <h1>Published news snapshots and downloads.</h1>
        <p>
          Explore published JSON and CSV snapshots of monitored coverage by date, country, source,
          and section.
        </p>
        <div className="hero-note">
          <strong>Public snapshot:</strong> last export {renderRelativeTime(manifest.generatedAt)}. {cadenceLabel}
        </div>
        <div className="hero-actions">
          <Link href="/explorer/">Open Explorer</Link>
          <a href={withBasePath(manifest.downloads.latest24h) || '#'}>Download latest 24h CSV</a>
        </div>
      </section>

      <section className="metric-grid">
        <article className="metric-card">
          <span>Latest export</span>
          <strong>{renderGeneratedAt(manifest.generatedAt)}</strong>
          <small>{renderRelativeTime(manifest.generatedAt)}</small>
        </article>
        <article className="metric-card">
          <span>Articles in export</span>
          <strong>{manifest.totals.articles.toLocaleString()}</strong>
        </article>
        <article className="metric-card">
          <span>Latest 24h CSV rows</span>
          <strong>{manifest.totals.latest24h.toLocaleString()}</strong>
        </article>
        <article className="metric-card">
          <span>Tracked sources</span>
          <strong>{manifest.totals.sources.toLocaleString()}</strong>
        </article>
        <article className="metric-card">
          <span>Publish cadence</span>
          <strong>{cadence ? `:${String(cadence.scheduledMinute).padStart(2, '0')}` : 'Hourly'}</strong>
          <small>{cadence ? cadence.timezone : 'Static snapshot schedule'}</small>
        </article>
      </section>

      <section className="grid-two">
        <article className="panel">
          <div className="section-head">
            <h2>Top countries in latest date shard</h2>
            <span>{manifest.latestDate || 'No data'}</span>
          </div>
          <div className="stat-list">
            {countryRollup.length > 0 ? (
              countryRollup.map((item) => (
                <div className="stat-row" key={`${item.countryCode}-${item.country}`}>
                  <span>
                    {item.country} <small>{item.countryCode}</small>
                  </span>
                  <strong>{item.count.toLocaleString()}</strong>
                </div>
              ))
            ) : (
              <div className="muted">No latest date shard rows yet.</div>
            )}
          </div>
        </article>

        <article className="panel">
          <div className="section-head">
            <h2>Section mix in full export</h2>
            <span>{manifest.totals.articles.toLocaleString()} rows</span>
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
          <div className="muted">Separate from the latest date shard preview below.</div>
        </article>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>Recent headlines</h2>
          <span>{latestArticles.length > 0 ? 'Latest shard preview' : 'Waiting for export'}</span>
        </div>
        <div className="headline-list">
          {latestArticles.slice(0, 8).map((article: PublicNewsArticle) => (
            <a className="headline-card" key={article.id} href={article.url} rel="noreferrer" target="_blank">
              <small>
                {article.countryCode} · {article.source} · {renderSectionLabel(article.section)}
              </small>
              <strong>{article.title}</strong>
              <span>{article.snippet || 'No snippet available.'}</span>
            </a>
          ))}
          {latestArticles.length === 0 ? <div className="muted">No articles in the latest shard yet.</div> : null}
        </div>
      </section>
    </div>
  );
}
