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
          <span>Countries</span>
          <strong>{formatNumber(totals.countries)}</strong>
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
          <span>Countries</span>
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
          <span>Countries</span>
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
