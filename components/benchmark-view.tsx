'use client';

import { useMemo, useState } from 'react';
import { useCustomerAccess } from '@/components/customer-access-provider';
import { BENCHMARK_COLUMN_HELP, HelpTooltipLabel } from '@/components/help-tooltip-label';
import { useCountryBenchmark } from '@/components/news-api-hooks';
import type { CountryBenchmarkCountryRow, CountryBenchmarkResponse, CountryBenchmarkWindow } from '@/lib/benchmark-types';

type BenchmarkPeriod = 'hourly' | 'daily' | 'weekly' | 'monthly';
type BenchmarkBadgeTone = 'emerald' | 'teal' | 'amber' | 'rose' | 'slate';

type BenchmarkPeriodMetrics = {
  output: number;
  fresh: number;
  late: number;
  inserted: number;
  active: number;
  top1: number;
  top5: number;
  activeDescriptor: string;
};

type BenchmarkBadge = {
  label: string;
  tone: BenchmarkBadgeTone;
};

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

function formatRate(numerator: number, denominator: number): string {
  if (denominator <= 0) return '-';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function formatLateShare(late: number, inserted: number): string {
  return formatRate(late, inserted);
}

function formatBucketLabel(value: { bucket: string; label?: string | null } | null | undefined): string {
  if (!value) return '-';
  return value.label || value.bucket || '-';
}

function formatDateTimeShort(value: string | null | undefined): string {
  return formatDateTime(value);
}

function getPeriodWindow(benchmark: CountryBenchmarkResponse, period: BenchmarkPeriod): CountryBenchmarkWindow | null {
  if (period === 'hourly') return benchmark.hourly;
  if (period === 'daily') return benchmark.daily;
  if (period === 'weekly') return benchmark.weekly;
  return benchmark.monthly;
}

function getPeriodLabel(period: BenchmarkPeriod): string {
  if (period === 'hourly') return 'Rolling 24h';
  if (period === 'daily') return 'Latest day';
  if (period === 'weekly') return 'Week';
  return 'Month';
}

function getPeriodDescription(period: BenchmarkPeriod): string {
  if (period === 'hourly') return 'Rolling observed output ranked by the latest 24-hour window.';
  if (period === 'daily') return 'Latest completed daily bucket, ranked by daily observed output.';
  if (period === 'weekly') return 'Current week bucket using month-local 7-day slices.';
  return 'Current calendar month rollup from stored daily snapshots.';
}

function getPeriodMetrics(row: CountryBenchmarkCountryRow, period: BenchmarkPeriod): BenchmarkPeriodMetrics {
  if (period === 'hourly') {
    return {
      output: row.hourlyPublished24h,
      fresh: row.hourlyFresh24h,
      late: row.hourlyLate24h,
      inserted: row.hourlyInserted24h,
      active: row.hourlyActiveSources24h,
      top1: row.hourlyTopSourceShareBps,
      top5: row.hourlyTop5SourceShareBps,
      activeDescriptor: 'active sources',
    };
  }

  if (period === 'daily') {
    return {
      output: row.dailyPublishedCount,
      fresh: row.dailyFreshCount,
      late: row.dailyLateCount,
      inserted: row.dailyInsertedCount,
      active: row.dailyActiveSourcesCount,
      top1: row.dailyTopSourceShareBps,
      top5: row.dailyTop5SourceShareBps,
      activeDescriptor: 'active sources',
    };
  }

  if (period === 'weekly') {
    return {
      output: row.weeklyPublishedCount,
      fresh: row.weeklyFreshCount,
      late: row.weeklyLateCount,
      inserted: row.weeklyInsertedCount,
      active: row.weeklyAverageActiveSourcesCount,
      top1: row.weeklyTopSourceShareBps,
      top5: row.weeklyTop5SourceShareBps,
      activeDescriptor: 'avg active/day',
    };
  }

  return {
    output: row.monthlyPublishedCount,
    fresh: row.monthlyFreshCount,
    late: row.monthlyLateCount,
    inserted: row.monthlyInsertedCount,
    active: row.monthlyAverageActiveSourcesCount,
    top1: row.monthlyTopSourceShareBps,
    top5: row.monthlyTop5SourceShareBps,
    activeDescriptor: 'avg active/day',
  };
}

function getCoverageBadge(metrics: BenchmarkPeriodMetrics): BenchmarkBadge {
  if (metrics.active >= 40 && metrics.top5 <= 5500) return { label: 'Broad', tone: 'emerald' };
  if (metrics.active >= 18 && metrics.top5 <= 7000) return { label: 'Established', tone: 'teal' };
  if (metrics.active >= 8) return { label: 'Narrow', tone: 'amber' };
  return { label: 'Thin', tone: 'rose' };
}

function getConcentrationBadge(top5Bps: number): BenchmarkBadge {
  if (top5Bps <= 3500) return { label: 'Balanced', tone: 'emerald' };
  if (top5Bps <= 5500) return { label: 'Mixed', tone: 'teal' };
  if (top5Bps <= 7500) return { label: 'Concentrated', tone: 'amber' };
  return { label: 'Dominated', tone: 'rose' };
}

function getConfidenceBadge(metrics: BenchmarkPeriodMetrics, period: BenchmarkPeriod): BenchmarkBadge {
  const lateShare = metrics.inserted > 0 ? metrics.late / metrics.inserted : 0;
  const outputFloor = period === 'monthly' ? 300 : period === 'weekly' ? 80 : 20;
  let score = 0;
  if (metrics.output >= outputFloor) score += 1;
  if (metrics.active >= 8) score += 1;
  if (metrics.top5 <= 7000) score += 1;
  if (lateShare <= 0.15) score += 1;

  if (score >= 4) return { label: 'High', tone: 'emerald' };
  if (score === 3) return { label: 'Moderate', tone: 'teal' };
  if (score === 2) return { label: 'Watch', tone: 'amber' };
  return { label: 'Limited', tone: 'rose' };
}

function getSpotlightRows(rows: CountryBenchmarkCountryRow[], period: BenchmarkPeriod) {
  const eligible = rows.filter((row) => getPeriodMetrics(row, period).output > 0);
  const leaderMetrics = eligible[0] ? getPeriodMetrics(eligible[0], period) : null;
  const balanceFloor = leaderMetrics ? Math.max(50, Math.round(leaderMetrics.output * 0.01)) : 50;
  const speedFloor = leaderMetrics ? Math.max(100, Math.round(leaderMetrics.output * 0.02)) : 100;
  const leader = eligible[0] || null;
  const broadest = [...eligible].sort((left, right) => {
    const rightMetrics = getPeriodMetrics(right, period);
    const leftMetrics = getPeriodMetrics(left, period);
    return rightMetrics.active - leftMetrics.active || rightMetrics.output - leftMetrics.output || left.country.localeCompare(right.country);
  })[0] || null;
  const balanced = [...eligible]
    .filter((row) => {
      const metrics = getPeriodMetrics(row, period);
      return metrics.output >= balanceFloor && metrics.active >= 5;
    })
    .sort((left, right) => {
      const rightMetrics = getPeriodMetrics(right, period);
      const leftMetrics = getPeriodMetrics(left, period);
      return leftMetrics.top5 - rightMetrics.top5 || rightMetrics.output - leftMetrics.output || left.country.localeCompare(right.country);
    })[0] || null;
  const fastest = [...eligible]
    .filter((row) => {
      const metrics = getPeriodMetrics(row, period);
      return metrics.output >= speedFloor && metrics.inserted > 0;
    })
    .sort((left, right) => {
      const rightMetrics = getPeriodMetrics(right, period);
      const leftMetrics = getPeriodMetrics(left, period);
      return (leftMetrics.late / Math.max(leftMetrics.inserted, 1)) - (rightMetrics.late / Math.max(rightMetrics.inserted, 1))
        || rightMetrics.output - leftMetrics.output
        || left.country.localeCompare(right.country);
    })[0] || null;

  return { leader, broadest, balanced, fastest };
}

export function BenchmarkView() {
  const { isReady } = useCustomerAccess();
  const benchmarkState = useCountryBenchmark();
  const benchmark = benchmarkState.data?.storage === 'postgres' ? benchmarkState.data : null;
  const disabledReason =
    benchmarkState.data && benchmarkState.data.storage !== 'postgres'
      ? benchmarkState.data.reason || 'Benchmark snapshots are unavailable.'
      : null;
  const [period, setPeriod] = useState<BenchmarkPeriod>('hourly');
  const [showAllRows, setShowAllRows] = useState(false);

  const selectedWindow = benchmark ? getPeriodWindow(benchmark, period) : null;
  const rankedRows = useMemo(() => {
    if (!benchmark) return [];
    return [...benchmark.countries].sort((left, right) => {
      const rightMetrics = getPeriodMetrics(right, period);
      const leftMetrics = getPeriodMetrics(left, period);
      return rightMetrics.output - leftMetrics.output || rightMetrics.active - leftMetrics.active || left.country.localeCompare(right.country);
    });
  }, [benchmark, period]);
  const visibleRows = showAllRows ? rankedRows : rankedRows.slice(0, 25);
  const spotlights = useMemo(() => getSpotlightRows(rankedRows, period), [rankedRows, period]);

  if (!isReady) {
    return <div className="page-stack benchmark-page-root"><div className="panel muted">Checking customer access...</div></div>;
  }

  if (benchmarkState.loading && !benchmark) {
    return <div className="page-stack benchmark-page-root"><div className="panel muted">Loading country benchmark snapshots...</div></div>;
  }

  if (benchmarkState.error) {
    return (
      <div className="page-stack benchmark-page-root">
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
    return <div className="page-stack benchmark-page-root"><div className="panel danger">{disabledReason || 'No benchmark snapshot is available yet.'}</div></div>;
  }

  return (
    <div className="page-stack benchmark-page-root">
      <section className="hero-panel benchmark-hero">
        <div className="eyebrow">Country Benchmark</div>
        <h1>Observed country-level news publishing benchmark from local snapshot tables.</h1>
        <p>
          This view is snapshot-based, keyed by <code>source_country</code>, and should be read as observed publishing output rather than an official national total.
        </p>
        <div className="hero-note">
          <strong>Snapshot freshness:</strong> hourly snapshot {formatRelative(benchmark.hourly?.generatedAt)}.
          Daily snapshot bucket {benchmark.daily?.bucket || '-'} (completed UTC day, generated {formatDateTimeShort(benchmark.daily?.generatedAt)}).
        </div>
        <div className="hero-note">
          <strong>Weekly buckets:</strong> month-local 7-day slices labeled like {`"March 2026 Week 1"`}. Monthly buckets roll up the full calendar month.
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
          <span>Latest daily bucket (UTC)</span>
          <strong>{formatBucketLabel(benchmark.daily)}</strong>
          <small>{benchmark.daily ? `${benchmark.totals.dailyPublishedCount.toLocaleString()} published` : 'No daily snapshot'}</small>
        </article>
        <article className="metric-card metric-card--wide">
          <span>Latest weekly bucket</span>
          <strong>{formatBucketLabel(benchmark.weekly)}</strong>
          <small>{benchmark.weekly ? `${benchmark.totals.weeklyPublishedCount.toLocaleString()} published` : 'No weekly snapshot'}</small>
        </article>
        <article className="metric-card metric-card--wide">
          <span>Latest monthly bucket</span>
          <strong>{formatBucketLabel(benchmark.monthly)}</strong>
          <small>{benchmark.monthly ? `${benchmark.totals.monthlyPublishedCount.toLocaleString()} published` : 'No monthly snapshot'}</small>
        </article>
        <article className="metric-card metric-card--wide metric-card--generated">
          <span>Generated</span>
          <strong>{formatDateTime(benchmark.generatedAt)}</strong>
          <small>{formatRelative(benchmark.generatedAt)}</small>
        </article>
      </section>

      <details className="panel benchmark-metadata-panel">
        <summary className="details-summary benchmark-fold-summary">
          <div>
            <div className="benchmark-fold-title">Snapshot metadata</div>
            <div className="benchmark-fold-copy">Current benchmark inputs</div>
          </div>
          <span className="benchmark-fold-chip" aria-hidden="true" />
        </summary>
        <div className="grid-two benchmark-fold-body">
          <details className="benchmark-bucket-card">
            <summary className="details-summary benchmark-bucket-summary">
              <div>
                <div className="benchmark-bucket-title">Hourly snapshot</div>
                <div className="benchmark-bucket-copy">{benchmark.hourly?.bucket || '-'}</div>
              </div>
              <span className="benchmark-bucket-toggle" aria-hidden="true" />
            </summary>
            <div className="link-list benchmark-bucket-body">
              <div><strong>Hourly bucket:</strong> {benchmark.hourly?.bucket || '-'}</div>
              <div><strong>Hourly window:</strong> {benchmark.hourly ? `${formatDateTime(benchmark.hourly.windowStart)} to ${formatDateTime(benchmark.hourly.windowEnd)}` : '-'}</div>
              <div><strong>Hourly metric version:</strong> {benchmark.hourly?.metricVersion || '-'}</div>
              <div><strong>Hourly atlas version:</strong> {benchmark.hourly?.atlasVersion || '-'}</div>
            </div>
          </details>
          <details className="benchmark-bucket-card">
            <summary className="details-summary benchmark-bucket-summary">
              <div>
                <div className="benchmark-bucket-title">Daily snapshot</div>
                <div className="benchmark-bucket-copy">{formatBucketLabel(benchmark.daily)}</div>
              </div>
              <span className="benchmark-bucket-toggle" aria-hidden="true" />
            </summary>
            <div className="link-list benchmark-bucket-body">
              <div><strong>Daily bucket (UTC):</strong> {formatBucketLabel(benchmark.daily)}</div>
              <div><strong>Daily window:</strong> {benchmark.daily ? `${formatDateTime(benchmark.daily.windowStart)} to ${formatDateTime(benchmark.daily.windowEnd)}` : '-'}</div>
              <div><strong>Daily metric version:</strong> {benchmark.daily?.metricVersion || '-'}</div>
              <div><strong>Daily atlas version:</strong> {benchmark.daily?.atlasVersion || '-'}</div>
            </div>
          </details>
          <details className="benchmark-bucket-card">
            <summary className="details-summary benchmark-bucket-summary">
              <div>
                <div className="benchmark-bucket-title">Weekly snapshot</div>
                <div className="benchmark-bucket-copy">{formatBucketLabel(benchmark.weekly)}</div>
              </div>
              <span className="benchmark-bucket-toggle" aria-hidden="true" />
            </summary>
            <div className="link-list benchmark-bucket-body">
              <div><strong>Weekly bucket:</strong> {formatBucketLabel(benchmark.weekly)}</div>
              <div><strong>Weekly window:</strong> {benchmark.weekly ? `${formatDateTime(benchmark.weekly.windowStart)} to ${formatDateTime(benchmark.weekly.windowEnd)}` : '-'}</div>
              <div><strong>Weekly metric version:</strong> {benchmark.weekly?.metricVersion || '-'}</div>
              <div><strong>Weekly atlas version:</strong> {benchmark.weekly?.atlasVersion || '-'}</div>
            </div>
          </details>
          <details className="benchmark-bucket-card">
            <summary className="details-summary benchmark-bucket-summary">
              <div>
                <div className="benchmark-bucket-title">Monthly snapshot</div>
                <div className="benchmark-bucket-copy">{formatBucketLabel(benchmark.monthly)}</div>
              </div>
              <span className="benchmark-bucket-toggle" aria-hidden="true" />
            </summary>
            <div className="link-list benchmark-bucket-body">
              <div><strong>Monthly bucket:</strong> {formatBucketLabel(benchmark.monthly)}</div>
              <div><strong>Monthly window:</strong> {benchmark.monthly ? `${formatDateTime(benchmark.monthly.windowStart)} to ${formatDateTime(benchmark.monthly.windowEnd)}` : '-'}</div>
              <div><strong>Monthly metric version:</strong> {benchmark.monthly?.metricVersion || '-'}</div>
              <div><strong>Monthly atlas version:</strong> {benchmark.monthly?.atlasVersion || '-'}</div>
            </div>
          </details>
        </div>
      </details>

      <section className="panel benchmark-ranking-panel">
        <div className="section-head">
          <div>
            <h2>Country Ranking</h2>
            <span className="benchmark-ranking-copy">{benchmark.countries.length.toLocaleString()} markets ranked by observed output</span>
          </div>
          <span>{getPeriodLabel(period)}</span>
        </div>

        <div className="benchmark-toolbar">
          <div className="benchmark-pill-row" role="tablist" aria-label="Benchmark period">
            {(['hourly', 'daily', 'weekly', 'monthly'] as BenchmarkPeriod[]).map((option) => (
              <button
                key={option}
                type="button"
                className={`benchmark-pill ${period === option ? 'is-active' : ''}`}
                onClick={() => setPeriod(option)}
              >
                {getPeriodLabel(option)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="button benchmark-toggle-button"
            onClick={() => setShowAllRows((current) => !current)}
          >
            {showAllRows ? 'Show top 25' : `Show all ${rankedRows.length.toLocaleString()}`}
          </button>
        </div>

        <div className="benchmark-period-banner">
          <div className="benchmark-period-meta">
            <strong>{getPeriodLabel(period)}</strong>
            <span>{selectedWindow ? formatBucketLabel(selectedWindow) : 'No snapshot'}</span>
          </div>
          <div className="benchmark-period-subcopy">
            <span>{getPeriodDescription(period)}</span>
            <span>{selectedWindow ? `${formatDateTime(selectedWindow.windowStart)} to ${formatDateTime(selectedWindow.windowEnd)}` : '-'}</span>
          </div>
        </div>

        <div className="benchmark-spotlight-grid">
          <article className="benchmark-spotlight-card">
            <span>Output leader</span>
            <strong>{spotlights.leader?.country || '-'}</strong>
            <small>{spotlights.leader ? `${getPeriodMetrics(spotlights.leader, period).output.toLocaleString()} observed articles` : 'No data in this lens'}</small>
          </article>
          <article className="benchmark-spotlight-card">
            <span>Broadest source base</span>
            <strong>{spotlights.broadest?.country || '-'}</strong>
            <small>{spotlights.broadest ? `${getPeriodMetrics(spotlights.broadest, period).active.toLocaleString()} ${getPeriodMetrics(spotlights.broadest, period).activeDescriptor}` : 'No data in this lens'}</small>
          </article>
          <article className="benchmark-spotlight-card">
            <span>Most balanced market</span>
            <strong>{spotlights.balanced?.country || '-'}</strong>
            <small>{spotlights.balanced ? `Top 5 share ${formatPercentFromBps(getPeriodMetrics(spotlights.balanced, period).top5)}` : 'Not enough breadth yet'}</small>
          </article>
          <article className="benchmark-spotlight-card">
            <span>Lowest delay pressure</span>
            <strong>{spotlights.fastest?.country || '-'}</strong>
            <small>{spotlights.fastest ? `Late share ${formatLateShare(getPeriodMetrics(spotlights.fastest, period).late, getPeriodMetrics(spotlights.fastest, period).inserted)}` : 'Not enough inserted rows yet'}</small>
          </article>
        </div>

        <div className="table-wrap benchmark-table-wrap">
          <table className="benchmark-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Market</th>
                <th><HelpTooltipLabel label="Observed Output" description={BENCHMARK_COLUMN_HELP.benchmarkOutput} /></th>
                <th><HelpTooltipLabel label="Timeliness" description={BENCHMARK_COLUMN_HELP.benchmarkFreshness} /></th>
                <th><HelpTooltipLabel label="Coverage" description={BENCHMARK_COLUMN_HELP.benchmarkCoverage} /></th>
                <th><HelpTooltipLabel label="Concentration" description={BENCHMARK_COLUMN_HELP.benchmarkConcentration} /></th>
                <th><HelpTooltipLabel label="Confidence" description={BENCHMARK_COLUMN_HELP.benchmarkConfidence} /></th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => {
                const metrics = getPeriodMetrics(row, period);
                const coverageBadge = getCoverageBadge(metrics);
                const concentrationBadge = getConcentrationBadge(metrics.top5);
                const confidenceBadge = getConfidenceBadge(metrics, period);
                const freshRate = formatRate(metrics.fresh, metrics.output);
                const lateShare = formatLateShare(metrics.late, metrics.inserted);
                const rank = index + 1;
                return (
                  <tr key={`${period}-${row.country}`}>
                    <td>
                      <span className={`benchmark-rank-badge ${rank <= 3 ? 'is-podium' : ''}`}>#{rank}</span>
                    </td>
                    <td>
                      <div className="benchmark-market-cell">
                        <strong>{row.country}</strong>
                        <span>{row.countryCode || 'n/a'}</span>
                      </div>
                    </td>
                    <td>
                      <strong>{metrics.output.toLocaleString()}</strong>
                      <div className="muted">fresh {metrics.fresh.toLocaleString()} · late {metrics.late.toLocaleString()}</div>
                    </td>
                    <td>
                      <strong>{lateShare}</strong>
                      <div className="muted">fresh rate {freshRate}</div>
                    </td>
                    <td>
                      <span className={`benchmark-badge is-${coverageBadge.tone}`}>{coverageBadge.label}</span>
                      <div className="muted">{metrics.active.toLocaleString()} {metrics.activeDescriptor}</div>
                    </td>
                    <td>
                      <span className={`benchmark-badge is-${concentrationBadge.tone}`}>{concentrationBadge.label}</span>
                      <div className="muted">Top 5 {formatPercentFromBps(metrics.top5)} · Top 1 {formatPercentFromBps(metrics.top1)}</div>
                    </td>
                    <td>
                      <span className={`benchmark-badge is-${confidenceBadge.tone}`}>{confidenceBadge.label}</span>
                      <div className="muted">observed benchmark read</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
