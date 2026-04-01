'use client';

import { CustomerAccessPanel } from '@/components/customer-access-panel';
import { useCustomerAccess } from '@/components/customer-access-provider';
import { useCountryBenchmark } from '@/components/news-api-hooks';

function formatDateTime(value: string | null | undefined): string {
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
      timeZoneName: 'short',
    }).format(date);
  } catch {
    return value;
  }
}

function formatRelative(value: string | null | undefined): string {
  if (!value) return 'time unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'time unavailable';
  const diffMinutes = Math.round((Date.now() - date.getTime()) / (60 * 1000));
  if (Math.abs(diffMinutes) < 1) return 'just now';
  if (Math.abs(diffMinutes) < 60) return `${Math.abs(diffMinutes)} min ${diffMinutes >= 0 ? 'ago' : 'ahead'}`;
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return `${Math.abs(diffHours)} hr ${diffHours >= 0 ? 'ago' : 'ahead'}`;
  const diffDays = Math.round(diffHours / 24);
  return `${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'} ${diffDays >= 0 ? 'ago' : 'ahead'}`;
}

function formatPercentFromBps(value: number): string {
  return `${(value / 100).toFixed(1)}%`;
}

function formatLateShare(late: number, inserted: number): string {
  if (inserted <= 0) return '-';
  return `${((late / inserted) * 100).toFixed(1)}%`;
}

export function BenchmarkView() {
  const { hasToken, isReady } = useCustomerAccess();
  const benchmarkState = useCountryBenchmark();
  const benchmark = benchmarkState.data?.storage === 'postgres' ? benchmarkState.data : null;

  if (!isReady) {
    return <div className="panel muted">Checking customer access...</div>;
  }

  if (!hasToken) {
    return (
      <CustomerAccessPanel
        title="Benchmark Access Required"
        description="Country benchmark tables are available only inside an authenticated customer session."
      />
    );
  }

  if (benchmarkState.loading && !benchmark) {
    return <div className="panel muted">Loading country benchmark snapshots...</div>;
  }

  if (benchmarkState.error) {
    return (
      <div className="page-stack">
        <section className="panel danger">
          <div className="section-head">
            <h2>Benchmark unavailable</h2>
            <span>API error</span>
          </div>
          <p>{benchmarkState.error}</p>
        </section>
      </div>
    );
  }

  if (!benchmark) {
    return <div className="panel danger">No benchmark snapshot is available yet.</div>;
  }

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div className="eyebrow">Country Benchmark</div>
        <h1>Observed country-level news publishing benchmark from local snapshot tables.</h1>
        <p>
          This view is snapshot-based, keyed by <code>source_country</code>, and should be read as observed publishing output rather than an official national total.
        </p>
        <div className="hero-note">
          <strong>Snapshot freshness:</strong> hourly snapshot {formatRelative(benchmark.hourly?.generatedAt)}.
          Daily snapshot bucket {benchmark.daily?.bucket || '-'}.
        </div>
      </section>

      <section className="metric-grid">
        <article className="metric-card">
          <span>Countries tracked</span>
          <strong>{benchmark.totals.countries.toLocaleString()}</strong>
          <small>Countries with at least one benchmark row</small>
        </article>
        <article className="metric-card">
          <span>Published 24h</span>
          <strong>{benchmark.totals.hourlyPublished24h.toLocaleString()}</strong>
          <small>Latest rolling 24-hour observed output</small>
        </article>
        <article className="metric-card">
          <span>Fresh 24h</span>
          <strong>{benchmark.totals.hourlyFresh24h.toLocaleString()}</strong>
          <small>Published and first-seen within the same 24-hour window</small>
        </article>
        <article className="metric-card">
          <span>Inserted 24h</span>
          <strong>{benchmark.totals.hourlyInserted24h.toLocaleString()}</strong>
          <small>Rows first stored in the latest rolling 24 hours</small>
        </article>
        <article className="metric-card">
          <span>Latest daily bucket</span>
          <strong>{benchmark.daily?.bucket || '-'}</strong>
          <small>{benchmark.daily ? `${benchmark.totals.dailyPublishedCount.toLocaleString()} published` : 'No daily snapshot'}</small>
        </article>
        <article className="metric-card">
          <span>Generated</span>
          <strong>{formatDateTime(benchmark.generatedAt)}</strong>
          <small>{formatRelative(benchmark.generatedAt)}</small>
        </article>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>Snapshot metadata</h2>
          <span>Current benchmark inputs</span>
        </div>
        <div className="grid-two">
          <div className="link-list">
            <div><strong>Hourly bucket:</strong> {benchmark.hourly?.bucket || '-'}</div>
            <div><strong>Hourly window:</strong> {benchmark.hourly ? `${formatDateTime(benchmark.hourly.windowStart)} to ${formatDateTime(benchmark.hourly.windowEnd)}` : '-'}</div>
            <div><strong>Hourly metric version:</strong> {benchmark.hourly?.metricVersion || '-'}</div>
            <div><strong>Hourly atlas version:</strong> {benchmark.hourly?.atlasVersion || '-'}</div>
          </div>
          <div className="link-list">
            <div><strong>Daily bucket:</strong> {benchmark.daily?.bucket || '-'}</div>
            <div><strong>Daily window:</strong> {benchmark.daily ? `${formatDateTime(benchmark.daily.windowStart)} to ${formatDateTime(benchmark.daily.windowEnd)}` : '-'}</div>
            <div><strong>Daily metric version:</strong> {benchmark.daily?.metricVersion || '-'}</div>
            <div><strong>Daily atlas version:</strong> {benchmark.daily?.atlasVersion || '-'}</div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>Country Table</h2>
          <span>{benchmark.countries.length.toLocaleString()} countries</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Country</th>
                <th>24h Published</th>
                <th>24h Fresh</th>
                <th>24h Late</th>
                <th>Late Share</th>
                <th>Active Sources</th>
                <th>Top 5 Share</th>
                <th>Prev Day Published</th>
                <th>Prev Day Active</th>
                <th>Prev Day Top 5</th>
              </tr>
            </thead>
            <tbody>
              {benchmark.countries.map((row) => (
                <tr key={row.country}>
                  <td>
                    <strong>{row.country}</strong>
                    <div className="muted">{row.countryCode || 'n/a'}</div>
                  </td>
                  <td>
                    <strong>{row.hourlyPublished24h.toLocaleString()}</strong>
                    <div className="muted">Inserted 1h: {row.hourlyInserted1h.toLocaleString()}</div>
                  </td>
                  <td>{row.hourlyFresh24h.toLocaleString()}</td>
                  <td>{row.hourlyLate24h.toLocaleString()}</td>
                  <td>{formatLateShare(row.hourlyLate24h, row.hourlyInserted24h)}</td>
                  <td>
                    <strong>{row.hourlyActiveSources24h.toLocaleString()}</strong>
                    <div className="muted">1h active: {row.hourlyActiveSources1h.toLocaleString()}</div>
                  </td>
                  <td>
                    <strong>{formatPercentFromBps(row.hourlyTop5SourceShareBps)}</strong>
                    <div className="muted">Top 1: {formatPercentFromBps(row.hourlyTopSourceShareBps)}</div>
                  </td>
                  <td>
                    <strong>{row.dailyPublishedCount.toLocaleString()}</strong>
                    <div className="muted">Fresh: {row.dailyFreshCount.toLocaleString()}</div>
                  </td>
                  <td>{row.dailyActiveSourcesCount.toLocaleString()}</td>
                  <td>
                    <strong>{formatPercentFromBps(row.dailyTop5SourceShareBps)}</strong>
                    <div className="muted">Top 1: {formatPercentFromBps(row.dailyTopSourceShareBps)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
