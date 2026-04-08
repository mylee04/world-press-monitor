import { formatNumber } from '@/lib/map-display';
import type { MapCountryMetricRow, MapMetricWindow, MapPublisherMetricRow } from '@/lib/map-types';
import type { MapMode } from '@/lib/map-view-state';
import type { MapSidePanelCountrySummaryDisplay } from '@/components/map-side-panel-types';

type OverviewStorySectionProps = {
  activeWindowDescriptor: string;
  countryDataReady: boolean;
  latestMapUpdatedLabel: string | null;
  mapMode: MapMode;
  mapProvenanceLabel: string;
  mapProvenanceNote: string;
  selectedCountry: MapCountryMetricRow | null;
  selectedCountryFallbackSummary: {
    fallback: {
      sourceCount: number;
      published: number;
    } | null;
    foreignOperated: {
      sourceCount: number;
      published: number;
    } | null;
  } | null;
  selectedCountrySummaryDisplay: MapSidePanelCountrySummaryDisplay;
  selectedPublisher: MapPublisherMetricRow | null;
  selectedPublisherWindowMetrics: MapPublisherMetricRow['windows'][MapMetricWindow] | null;
};

export function OverviewStorySection({
  activeWindowDescriptor,
  countryDataReady,
  latestMapUpdatedLabel,
  mapMode,
  mapProvenanceLabel,
  mapProvenanceNote,
  selectedCountry,
  selectedCountryFallbackSummary,
  selectedCountrySummaryDisplay,
  selectedPublisher,
  selectedPublisherWindowMetrics,
}: OverviewStorySectionProps) {
  if (selectedCountry && countryDataReady) {
    return (
      <div className="map-story-card">
        <div className="eyebrow">{mapMode === 'health' ? 'Country Health' : 'Country Pulse'}</div>
        <strong>
          {selectedCountry.country} has {formatNumber(selectedCountrySummaryDisplay.published)} published items across{' '}
          {formatNumber(selectedCountrySummaryDisplay.activeSources)} active sources in the last {activeWindowDescriptor}.
        </strong>
        {selectedCountryFallbackSummary?.fallback ? (
          <span>
            Unmapped domestic: {formatNumber(selectedCountryFallbackSummary.fallback.sourceCount)} sources ·{' '}
            {formatNumber(selectedCountryFallbackSummary.fallback.published)} published kept off-map.
          </span>
        ) : null}
        {selectedCountryFallbackSummary?.foreignOperated ? (
          <span>
            Foreign-operated: {formatNumber(selectedCountryFallbackSummary.foreignOperated.sourceCount)} sources ·{' '}
            {formatNumber(selectedCountryFallbackSummary.foreignOperated.published)} published kept off-map.
          </span>
        ) : null}
        <div className="map-story-metrics">
          <div>
            <span>RSS-linked</span>
            <strong>{formatNumber(selectedCountrySummaryDisplay.rssSources)}</strong>
          </div>
          <div>
            <span>Sitemap-linked</span>
            <strong>{formatNumber(selectedCountrySummaryDisplay.sitemapSources)}</strong>
          </div>
          <div>
            <span>Healthy</span>
            <strong>{formatNumber(selectedCountrySummaryDisplay.healthySources)}</strong>
          </div>
          <div>
            <span>Degraded</span>
            <strong>{formatNumber(selectedCountrySummaryDisplay.degradedSources)}</strong>
          </div>
        </div>
      </div>
    );
  }

  if (!selectedCountry && mapMode === 'publishers' && selectedPublisher && selectedPublisherWindowMetrics) {
    return (
      <div className="map-story-card">
        <div className="eyebrow">Publisher Footprint</div>
        <strong>
          {selectedPublisher.publisher} is active across {formatNumber(selectedPublisherWindowMetrics.activeCountries)} countries and{' '}
          {formatNumber(selectedPublisherWindowMetrics.activeSources)} active sources in the last {activeWindowDescriptor}.
        </strong>
        <span>
          Country bubbles show where the selected publisher is active across borders and how much output each market generated in the last {activeWindowDescriptor}.
        </span>
        <span>
          {latestMapUpdatedLabel
            ? `${mapProvenanceLabel} · ${mapProvenanceNote} · last updated ${latestMapUpdatedLabel}`
            : `${mapProvenanceLabel} · ${mapProvenanceNote}`}
        </span>
      </div>
    );
  }

  if (!selectedCountry) {
    return (
      <div className="map-story-card">
        <div className="eyebrow">
          {mapMode === 'health'
              ? 'Health Overlay'
              : 'World Publishing Pulse'}
        </div>
        <strong>
          {mapMode === 'health'
              ? 'Country health globe'
              : 'Country publishing globe'}
        </strong>
        <span>
          {mapMode === 'health'
              ? `Country bubbles are colored by degraded-source share and sized by active source count in the last ${activeWindowDescriptor}.`
              : `Country bubbles are sized by core publishing volume in the last ${activeWindowDescriptor} and color-shift on freshness and late share.`}
        </span>
        <span>
          {latestMapUpdatedLabel
            ? `${mapProvenanceLabel} · ${mapProvenanceNote} · last updated ${latestMapUpdatedLabel}`
            : `${mapProvenanceLabel} · ${mapProvenanceNote}`}
        </span>
      </div>
    );
  }

  return null;
}
