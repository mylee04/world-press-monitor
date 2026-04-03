import { formatNumber } from '@/lib/map-display';
import type { MapCountryMetricRow, MapPublisherMetricRow } from '@/lib/map-types';
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
    sourceCount: number;
    published: number;
  } | null;
  selectedCountrySummaryDisplay: MapSidePanelCountrySummaryDisplay;
  selectedPublisher: MapPublisherMetricRow | null;
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
}: OverviewStorySectionProps) {
  const publisherComparisonMode = !selectedCountry && mapMode === 'publishers' && Boolean(selectedPublisher);

  if (selectedCountry && countryDataReady) {
    return (
      <div className="map-story-card">
        <div className="eyebrow">{mapMode === 'health' ? 'Country Health' : 'Country Pulse'}</div>
        <strong>
          {selectedCountry.country} has {formatNumber(selectedCountrySummaryDisplay.published)} published items across{' '}
          {formatNumber(selectedCountrySummaryDisplay.activeSources)} active sources in the last {activeWindowDescriptor}.
        </strong>
        {selectedCountryFallbackSummary ? (
          <span>
            National fallback: {formatNumber(selectedCountryFallbackSummary.sourceCount)} sources ·{' '}
            {formatNumber(selectedCountryFallbackSummary.published)} published kept off-map.
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

  if (!selectedCountry && !publisherComparisonMode) {
    return (
      <div className="map-story-card">
        <div className="eyebrow">
          {mapMode === 'publishers'
            ? 'Publisher Footprint'
            : mapMode === 'health'
              ? 'Health Overlay'
              : 'World Publishing Pulse'}
        </div>
        <strong>
          {mapMode === 'publishers'
            ? `${selectedPublisher?.publisher || 'Publisher'} country footprint`
            : mapMode === 'health'
              ? 'Country health globe'
              : 'Country publishing globe'}
        </strong>
        <span>
          {mapMode === 'publishers'
            ? `Country bubbles show where the selected publisher is active across borders and how much output each market generated in the last ${activeWindowDescriptor}.`
            : mapMode === 'health'
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
