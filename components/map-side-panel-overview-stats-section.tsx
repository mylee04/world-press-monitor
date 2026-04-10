import { formatNumber, getCountryWindowMetrics } from '@/lib/map-display';
import type {
  MapCountryMetricRow,
  MapCountryMetricsResponse,
  MapMetricWindow,
  MapPublisherMetricRow,
} from '@/lib/map-types';
import type { MapMode } from '@/lib/map-view-state';
import type { MapSidePanelCountrySummaryDisplay } from '@/components/map-side-panel-types';
import { round } from '@/components/map-side-panel-overview-utils';

type OverviewStatsSectionProps = {
  activeWindowDescriptor: string;
  countryDataReady: boolean;
  healthTotals: {
    healthySources24h: number;
    degradedSources24h: number;
    countriesWithIssues: number;
  };
  mapMode: MapMode;
  mapWindow: MapMetricWindow;
  selectedCountry: MapCountryMetricRow | null;
  selectedCountrySummaryDisplay: MapSidePanelCountrySummaryDisplay;
  selectedPublisher: MapPublisherMetricRow | null;
  selectedPublisherWindowMetrics: MapPublisherMetricRow['windows'][MapMetricWindow] | null;
  totals: MapCountryMetricsResponse['totals'] | null;
  totalWindowMetrics: MapCountryMetricsResponse['totals']['windows'][MapMetricWindow] | null;
};

const SOURCE_COVERAGE_WARNING_THRESHOLD = 0.2;

function hasCoverageValue(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatCoverageValue(value: number | null | undefined): string {
  return hasCoverageValue(value) ? formatNumber(value) : '-';
}

function isLowCoverage(configured: number | null | undefined, checked: number | null | undefined): boolean {
  if (!hasCoverageValue(configured) || !hasCoverageValue(checked)) return false;
  return configured > 0 && checked / configured <= SOURCE_COVERAGE_WARNING_THRESHOLD;
}

function formatSourceCoverageSourceStats(configured: number | null | undefined, checked: number | null | undefined): string {
  if (!hasCoverageValue(configured) || configured <= 0) return 'Configured unavailable';
  if (!hasCoverageValue(checked)) return `${formatNumber(configured)} configured · checked unavailable`;
  return `${formatNumber(checked)} of ${formatNumber(configured)} checked`;
}

function sourceCoveragePercent(configured: number | null | undefined, checked: number | null | undefined): string {
  if (!hasCoverageValue(configured) || !hasCoverageValue(checked) || configured <= 0) {
    return '-';
  }

  return `${round((checked / configured) * 100, 1)}%`;
}

function isSourceCoverageWarning(configured: number | null | undefined, checked: number | null | undefined): boolean {
  return isLowCoverage(configured, checked);
}

export function OverviewStatsSection({
  activeWindowDescriptor,
  countryDataReady,
  healthTotals,
  mapMode,
  mapWindow,
  selectedCountry,
  selectedCountrySummaryDisplay,
  selectedPublisher,
  selectedPublisherWindowMetrics,
  totals,
  totalWindowMetrics,
}: OverviewStatsSectionProps) {
  const selectedCountryLivePublished = selectedCountry ? getCountryWindowMetrics(selectedCountry, '1h').published : 0;
  const selectedCountryLateShare = selectedCountrySummaryDisplay.firstSeen > 0
    ? selectedCountrySummaryDisplay.late / selectedCountrySummaryDisplay.firstSeen
    : 0;
  const selectedCountryCoverageClass = selectedCountry && isSourceCoverageWarning(
    selectedCountry.configuredSources24h,
    selectedCountry.checkedSources24h
  )
    ? 'is-low-coverage'
    : '';
  const totalCoverageClass = totals && isSourceCoverageWarning(
    totals.configuredSources24h,
    totals.checkedSources24h
  )
    ? 'is-low-coverage'
    : '';

  if (!selectedCountry && mapMode === 'countries' && totals) {
    return (
      <div className="map-stat-grid">
        <article className="map-stat-card">
          <span>Published {activeWindowDescriptor}</span>
          <strong>{formatNumber(totalWindowMetrics?.published || 0)}</strong>
        </article>
        <article className="map-stat-card">
          <span>{mapWindow === '1h' ? 'Ingested 1h' : `Ingested ${activeWindowDescriptor}`}</span>
          <strong>{formatNumber(totalWindowMetrics?.firstSeen || 0)}</strong>
        </article>
        <article className="map-stat-card">
          <span>Active Countries</span>
          <strong>{formatNumber(totals.countries)}</strong>
        </article>
        <article className="map-stat-card">
          <span>Configured Sources</span>
          <strong>{formatCoverageValue(totals.configuredSources24h)}</strong>
        </article>
        <article className="map-stat-card">
          <span>Checked Sources 24h</span>
          <strong>{formatCoverageValue(totals.checkedSources24h)}</strong>
        </article>
        <article className={`map-stat-card ${totalCoverageClass}`}>
          <span>Checked Coverage (24h)</span>
          <strong>{sourceCoveragePercent(totals.configuredSources24h, totals.checkedSources24h)}</strong>
          <span className="map-stat-alert-label">
            {!hasCoverageValue(totals.checkedSources24h)
              ? 'Checked coverage unavailable in this snapshot'
              : isLowCoverage(totals.configuredSources24h, totals.checkedSources24h)
              ? `Low coverage · ${formatSourceCoverageSourceStats(totals.configuredSources24h, totals.checkedSources24h)}`
              : formatSourceCoverageSourceStats(totals.configuredSources24h, totals.checkedSources24h)}
          </span>
        </article>
        <article className="map-stat-card">
          <span>Active Sources</span>
          <strong>{formatNumber(totalWindowMetrics?.activeSources || 0)}</strong>
        </article>
      </div>
    );
  }

  if (!selectedCountry && mapMode === 'publishers' && selectedPublisher && selectedPublisherWindowMetrics) {
    return (
      <div className="map-stat-grid">
        <article className="map-stat-card">
          <span>Publisher {activeWindowDescriptor}</span>
          <strong>{formatNumber(selectedPublisherWindowMetrics.published)}</strong>
        </article>
        <article className="map-stat-card">
          <span>Active Countries</span>
          <strong>{formatNumber(selectedPublisherWindowMetrics.activeCountries)}</strong>
        </article>
        <article className="map-stat-card">
          <span>Active Sources</span>
          <strong>{formatNumber(selectedPublisherWindowMetrics.activeSources)}</strong>
        </article>
        <article className="map-stat-card">
          <span>Degraded Sources</span>
          <strong>{formatNumber(selectedPublisherWindowMetrics.degradedSources)}</strong>
        </article>
      </div>
    );
  }

  if (!selectedCountry && mapMode === 'health') {
    return (
      <div className="map-stat-grid">
        <article className="map-stat-card">
          <span>Healthy Sources</span>
          <strong>{formatNumber(healthTotals.healthySources24h)}</strong>
        </article>
        <article className="map-stat-card">
          <span>Degraded Sources</span>
          <strong>{formatNumber(healthTotals.degradedSources24h)}</strong>
        </article>
        <article className="map-stat-card">
          <span>Countries With Issues</span>
          <strong>{formatNumber(healthTotals.countriesWithIssues)}</strong>
        </article>
        <article className="map-stat-card">
          <span>Active Countries</span>
          <strong>{formatNumber(totals?.countries || 0)}</strong>
        </article>
      </div>
    );
  }

  if (selectedCountry && countryDataReady) {
    return (
      <div className="map-stat-grid">
        <article className="map-stat-card">
          <span>Published {activeWindowDescriptor}</span>
          <strong>{formatNumber(selectedCountrySummaryDisplay.published)}</strong>
        </article>
        <article className="map-stat-card">
          <span>Published 1h</span>
          <strong>{formatNumber(selectedCountryLivePublished)}</strong>
        </article>
        <article className="map-stat-card">
          <span>Configured Sources</span>
          <strong>{formatCoverageValue(selectedCountry.configuredSources24h)}</strong>
        </article>
        <article className="map-stat-card">
          <span>Checked Sources 24h</span>
          <strong>{formatCoverageValue(selectedCountry.checkedSources24h)}</strong>
        </article>
        <article className={`map-stat-card ${selectedCountryCoverageClass}`}>
          <span>Checked Coverage (24h)</span>
          <strong>
            {sourceCoveragePercent(selectedCountry.configuredSources24h, selectedCountry.checkedSources24h)}
          </strong>
          <span className="map-stat-alert-label">
            {!hasCoverageValue(selectedCountry.checkedSources24h)
              ? 'Checked coverage unavailable in this snapshot'
              : isLowCoverage(selectedCountry.configuredSources24h, selectedCountry.checkedSources24h)
              ? `Low coverage · ${formatSourceCoverageSourceStats(
                  selectedCountry.configuredSources24h,
                  selectedCountry.checkedSources24h
                )}`
              : formatSourceCoverageSourceStats(selectedCountry.configuredSources24h, selectedCountry.checkedSources24h)}
          </span>
        </article>
        <article className="map-stat-card">
          <span>Active Sources</span>
          <strong>{formatNumber(selectedCountrySummaryDisplay.activeSources)}</strong>
        </article>
        <article className="map-stat-card">
          <span>{mapMode === 'health' ? 'Degraded Share' : 'Late Share'}</span>
          <strong>
            {mapMode === 'health'
              ? `${round(selectedCountrySummaryDisplay.activeSources > 0
                  ? (selectedCountrySummaryDisplay.degradedSources / selectedCountrySummaryDisplay.activeSources) * 100
                  : 0, 1)}%`
              : `${round(selectedCountryLateShare * 100, 1)}%`}
          </strong>
        </article>
      </div>
    );
  }

  return null;
}
