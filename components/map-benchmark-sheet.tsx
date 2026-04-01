'use client';

import Link from 'next/link';
import { BENCHMARK_COLUMN_HELP, HelpTooltipLabel } from '@/components/help-tooltip-label';
import type { CountryBenchmarkCountryRow, CountryBenchmarkResponse } from '@/lib/benchmark-types';
import { formatLateShare, formatNumber, formatPercentFromBps } from '@/lib/map-display';

export type MapBenchmarkSheetRow = CountryBenchmarkCountryRow & {
  linked: boolean;
  selected: boolean;
};

type MapBenchmarkSheetProps = {
  benchmark: CountryBenchmarkResponse | null;
  rows: MapBenchmarkSheetRow[];
  loading: boolean;
  error: string | null;
  generatedLabel: string | null;
  open: boolean;
  onToggle: () => void;
  onSelectCountry: (country: string) => void;
};

export function MapBenchmarkSheet({
  benchmark,
  rows,
  loading,
  error,
  generatedLabel,
  open,
  onToggle,
  onSelectCountry,
}: MapBenchmarkSheetProps) {
  return (
    <section className={`map-benchmark-sheet ${open ? 'is-open' : 'is-collapsed'}`}>
      <div className="map-benchmark-head">
        <div>
          <div className="eyebrow">Observed Benchmark</div>
          <h3>Country publishing table</h3>
        </div>
        <div className="map-benchmark-actions">
          <span className="map-benchmark-meta">
            {generatedLabel
              ? `Snapshot ${generatedLabel}`
              : loading
                ? 'Loading snapshot'
                : 'Snapshot unavailable'}
          </span>
          <Link href="/benchmark/" className="map-inline-action map-benchmark-link">
            Open Full Table
          </Link>
          <button type="button" className="map-inline-action" onClick={onToggle}>
            {open ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      {open ? (
        benchmark ? (
          <>
            <div className="map-benchmark-summary">
              <article className="map-benchmark-stat">
                <span>Published 24h</span>
                <strong>{formatNumber(benchmark.totals.hourlyPublished24h)}</strong>
              </article>
              <article className="map-benchmark-stat">
                <span>Fresh 24h</span>
                <strong>{formatNumber(benchmark.totals.hourlyFresh24h)}</strong>
              </article>
              <article className="map-benchmark-stat">
                <span>Countries</span>
                <strong>{formatNumber(benchmark.totals.countries)}</strong>
              </article>
              <article className="map-benchmark-stat">
                <span>Prev Day</span>
                <strong>{formatNumber(benchmark.totals.dailyPublishedCount)}</strong>
              </article>
            </div>

            <div className="map-benchmark-table-wrap">
              <table className="map-benchmark-table">
                <thead>
                  <tr>
                    <th>Country</th>
                    <th><HelpTooltipLabel label="24h" description={BENCHMARK_COLUMN_HELP.published24h} /></th>
                    <th><HelpTooltipLabel label="Late" description="Main line is late share, subline is the raw 24h late count." /></th>
                    <th><HelpTooltipLabel label="Active" description={BENCHMARK_COLUMN_HELP.activeSources} /></th>
                    <th><HelpTooltipLabel label="Top 5" description={BENCHMARK_COLUMN_HELP.top5Share} /></th>
                    <th><HelpTooltipLabel label="Prev Day" description={BENCHMARK_COLUMN_HELP.prevDayPublished} /></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.country} className={row.selected ? 'is-selected' : ''}>
                      <td>
                        <button
                          type="button"
                          className="map-benchmark-country"
                          onClick={() => onSelectCountry(row.country)}
                          disabled={!row.linked}
                        >
                          <strong>{row.country}</strong>
                          <span>{row.countryCode || 'n/a'}</span>
                        </button>
                      </td>
                      <td>
                        <strong>{formatNumber(row.hourlyPublished24h)}</strong>
                        <span>fresh {formatNumber(row.hourlyFresh24h)}</span>
                      </td>
                      <td>
                        <strong>{formatLateShare(row.hourlyLate24h, row.hourlyInserted24h)}</strong>
                        <span>{formatNumber(row.hourlyLate24h)} late</span>
                      </td>
                      <td>
                        <strong>{formatNumber(row.hourlyActiveSources24h)}</strong>
                        <span>1h {formatNumber(row.hourlyActiveSources1h)}</span>
                      </td>
                      <td>
                        <strong>{formatPercentFromBps(row.hourlyTop5SourceShareBps)}</strong>
                        <span>top 1 {formatPercentFromBps(row.hourlyTopSourceShareBps)}</span>
                      </td>
                      <td>
                        <strong>{formatNumber(row.dailyPublishedCount)}</strong>
                        <span>{formatNumber(row.dailyActiveSourcesCount)} active</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : error ? (
          <div className="panel danger map-benchmark-empty">{error}</div>
        ) : loading ? (
          <div className="panel muted map-benchmark-empty">Loading benchmark snapshot...</div>
        ) : (
          <div className="panel muted map-benchmark-empty">No benchmark snapshot is available yet.</div>
        )
      ) : null}
    </section>
  );
}
