import { formatNumber, getSourceWindowMetrics } from '@/lib/map-display';
import type {
  MapCountryMetricRow,
  MapMetricWindow,
  MapSourceMetricRow,
} from '@/lib/map-types';
import type { MapMode } from '@/lib/map-view-state';
import type {
  MapSidePanelCountrySummaryDisplay,
  MapSidePanelCountryTrendBar,
} from '@/components/map-side-panel-types';
import {
  formatPercent,
  formatTrendBucket,
  round,
} from '@/components/map-side-panel-overview-utils';

type OverviewHighlightsSectionProps = {
  browserTimeZone: string | null;
  countryDataReady: boolean;
  detailSelectionActive: boolean;
  derivedTopDegradedSources: MapSourceMetricRow[];
  mapMode: MapMode;
  mapWindow: MapMetricWindow;
  selectedCountry: MapCountryMetricRow | null;
  selectedCountrySummaryDisplay: MapSidePanelCountrySummaryDisplay;
  selectedCountryTopSourceRows: MapSourceMetricRow[];
  selectedCountryTrendBars: MapSidePanelCountryTrendBar[];
};

export function OverviewHighlightsSection({
  browserTimeZone,
  countryDataReady,
  detailSelectionActive,
  derivedTopDegradedSources,
  mapMode,
  mapWindow,
  selectedCountry,
  selectedCountrySummaryDisplay,
  selectedCountryTopSourceRows,
  selectedCountryTrendBars,
}: OverviewHighlightsSectionProps) {
  const showCountrySourceSignals = selectedCountry && countryDataReady && !detailSelectionActive;
  const selectedCountryTopSource = selectedCountryTopSourceRows[0] || null;
  const selectedCountryPeakBucket = selectedCountryTrendBars.reduce<MapSidePanelCountryTrendBar | null>((current, item) => {
    if (!current || item.count > current.count) {
      return item;
    }
    return current;
  }, null);
  const selectedCountryPeakBucketLabel = selectedCountryPeakBucket
    ? formatTrendBucket(selectedCountryPeakBucket.bucket, mapWindow, browserTimeZone)
    : null;
  const selectedCountryAveragePerBucket = selectedCountryTrendBars.length > 0
    ? selectedCountryTrendBars.reduce((sum, item) => sum + item.count, 0) / selectedCountryTrendBars.length
    : 0;
  const selectedCountryAveragePerSource = selectedCountrySummaryDisplay.activeSources > 0
    ? selectedCountrySummaryDisplay.published / selectedCountrySummaryDisplay.activeSources
    : 0;
  const selectedCountryHealthShare = selectedCountrySummaryDisplay.activeSources > 0
    ? selectedCountrySummaryDisplay.degradedSources / selectedCountrySummaryDisplay.activeSources
    : 0;

  if (!(selectedCountry && countryDataReady)) return null;

  return (
    <div className="map-highlight-grid">
      {showCountrySourceSignals ? (
        <div className="map-highlight-card">
          <span>{mapMode === 'health' ? 'Most Degraded Source' : 'Lead Source'}</span>
          <strong>
            {mapMode === 'health'
              ? derivedTopDegradedSources[0]?.source || 'No degraded source'
              : selectedCountryTopSource?.source || 'No source signal yet'}
          </strong>
          <p>
            {mapMode === 'health'
              ? derivedTopDegradedSources[0]
                ? `${derivedTopDegradedSources[0].health} · ${formatNumber(getSourceWindowMetrics(derivedTopDegradedSources[0], mapWindow).published)} published`
                : 'No failing or degraded source is currently leading the country.'
              : selectedCountryTopSource
                ? `${selectedCountryTopSource.publisher && selectedCountryTopSource.publisher !== selectedCountryTopSource.source ? `${selectedCountryTopSource.publisher} · ` : ''}${selectedCountryTopSource.region || selectedCountryTopSource.city || selectedCountryTopSource.country}`
                : 'No source is active in the current window.'}
          </p>
        </div>
      ) : null}
      <div className="map-highlight-card">
        <span>{mapMode === 'health' ? 'Health Mix' : 'Avg Per Source'}</span>
        <strong>
          {mapMode === 'health'
            ? `${formatPercent(1 - selectedCountryHealthShare)} healthy`
            : `${round(selectedCountryAveragePerSource, 1)}`}
        </strong>
        <p>
          {mapMode === 'health'
            ? `${formatNumber(selectedCountrySummaryDisplay.healthySources)} healthy · ${formatNumber(selectedCountrySummaryDisplay.degradedSources)} degraded`
            : `${formatNumber(selectedCountrySummaryDisplay.published)} published across ${formatNumber(selectedCountrySummaryDisplay.activeSources)} active sources.`}
        </p>
      </div>
      <div className="map-highlight-card">
        <span>{mapWindow === '7d' ? 'Peak Day' : 'Peak Hour'}</span>
        <strong>{selectedCountryPeakBucketLabel || 'No trend yet'}</strong>
        <p>
          {selectedCountryPeakBucket
            ? `${formatNumber(selectedCountryPeakBucket.count)} published · avg ${round(selectedCountryAveragePerBucket, 1)}/${mapWindow === '7d' ? 'day' : 'hr'}`
            : `No ${mapWindow === '7d' ? 'daily' : 'hourly'} country trend has been collected yet.`}
        </p>
      </div>
    </div>
  );
}
