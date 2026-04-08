'use client';

import { useEffect, useState } from 'react';
import type {
  MapCountryMetricRow,
  MapCountryMetricsResponse,
  MapMetricWindow,
  MapPublisherMetricRow,
  MapSourceMetricRow,
} from '@/lib/map-types';
import type { MapMode } from '@/lib/map-view-state';
import { OverviewBreakdownSection } from '@/components/map-side-panel-overview-breakdown-section';
import { OverviewHighlightsSection } from '@/components/map-side-panel-overview-highlights-section';
import { OverviewStatsSection } from '@/components/map-side-panel-overview-stats-section';
import { OverviewStorySection } from '@/components/map-side-panel-overview-story-section';
import { OverviewTrendSection } from '@/components/map-side-panel-overview-trend-section';
import type {
  MapSidePanelCountrySummaryDisplay,
  MapSidePanelCountryTrendBar,
  MapSidePanelDegradedRegion,
  MapSidePanelRankedCount,
  MapSidePanelRegionCount,
} from '@/components/map-side-panel-types';

type MapSidePanelOverviewTabProps = {
  mapMode: MapMode;
  mapWindow: MapMetricWindow;
  selectedCountry: MapCountryMetricRow | null;
  countryDataReady: boolean;
  detailSelectionActive: boolean;
  selectedPublisher: MapPublisherMetricRow | null;
  selectedPublisherWindowMetrics: MapPublisherMetricRow['windows'][MapMetricWindow] | null;
  totals: MapCountryMetricsResponse['totals'] | null;
  totalWindowMetrics: MapCountryMetricsResponse['totals']['windows'][MapMetricWindow] | null;
  topCountries: MapCountryMetricRow[];
  topPublishers: MapPublisherMetricRow[];
  topDegradedCountries: MapCountryMetricRow[];
  selectedCountrySummaryDisplay: MapSidePanelCountrySummaryDisplay;
  selectedCountryTrendTitle: string;
  selectedCountryTrendWindowLabel: string;
  selectedCountryTrendBars: MapSidePanelCountryTrendBar[];
  selectedCountryTopRegionsDisplay: MapSidePanelRegionCount[];
  selectedCountryTopPublishers: MapSidePanelRankedCount[];
  selectedCountryTopSourceRows: MapSourceMetricRow[];
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
  derivedTopDegradedRegions: MapSidePanelDegradedRegion[];
  derivedTopDegradedSources: MapSourceMetricRow[];
  activeWindowDescriptor: string;
  latestMapUpdatedLabel: string | null;
  mapProvenanceLabel: string;
  mapProvenanceNote: string;
  healthTotals: {
    healthySources24h: number;
    degradedSources24h: number;
    countriesWithIssues: number;
  };
  onFocusCountryName: (country: string) => void;
  onSelectPublisher: (publisher: MapPublisherMetricRow) => void;
  onSelectSource: (source: MapSourceMetricRow | MapSidePanelRankedCount) => void;
};

export function MapSidePanelOverviewTab({
  mapMode,
  mapWindow,
  selectedCountry,
  countryDataReady,
  detailSelectionActive,
  selectedPublisher,
  selectedPublisherWindowMetrics,
  totals,
  totalWindowMetrics,
  topCountries,
  topPublishers,
  topDegradedCountries,
  selectedCountrySummaryDisplay,
  selectedCountryTrendTitle,
  selectedCountryTrendWindowLabel,
  selectedCountryTrendBars,
  selectedCountryTopRegionsDisplay,
  selectedCountryTopPublishers,
  selectedCountryTopSourceRows,
  selectedCountryFallbackSummary,
  derivedTopDegradedRegions,
  derivedTopDegradedSources,
  activeWindowDescriptor,
  latestMapUpdatedLabel,
  mapProvenanceLabel,
  mapProvenanceNote,
  healthTotals,
  onFocusCountryName,
  onSelectPublisher,
  onSelectSource,
}: MapSidePanelOverviewTabProps) {
  const [browserTimeZone, setBrowserTimeZone] = useState<string | null>(null);

  useEffect(() => {
    const resolvedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!resolvedTimeZone) return;
    setBrowserTimeZone(resolvedTimeZone);
  }, []);

  return (
    <>
      <OverviewStatsSection
        activeWindowDescriptor={activeWindowDescriptor}
        countryDataReady={countryDataReady}
        healthTotals={healthTotals}
        mapMode={mapMode}
        mapWindow={mapWindow}
        selectedCountry={selectedCountry}
        selectedCountrySummaryDisplay={selectedCountrySummaryDisplay}
        selectedPublisher={selectedPublisher}
        selectedPublisherWindowMetrics={selectedPublisherWindowMetrics}
        totals={totals}
        totalWindowMetrics={totalWindowMetrics}
      />

      <OverviewStorySection
        activeWindowDescriptor={activeWindowDescriptor}
        countryDataReady={countryDataReady}
        latestMapUpdatedLabel={latestMapUpdatedLabel}
        mapMode={mapMode}
        mapProvenanceLabel={mapProvenanceLabel}
        mapProvenanceNote={mapProvenanceNote}
        selectedCountry={selectedCountry}
        selectedCountryFallbackSummary={selectedCountryFallbackSummary}
        selectedCountrySummaryDisplay={selectedCountrySummaryDisplay}
        selectedPublisher={selectedPublisher}
        selectedPublisherWindowMetrics={selectedPublisherWindowMetrics}
      />

      <OverviewHighlightsSection
        browserTimeZone={browserTimeZone}
        countryDataReady={countryDataReady}
        detailSelectionActive={detailSelectionActive}
        derivedTopDegradedSources={derivedTopDegradedSources}
        mapMode={mapMode}
        mapWindow={mapWindow}
        selectedCountry={selectedCountry}
        selectedCountrySummaryDisplay={selectedCountrySummaryDisplay}
        selectedCountryTopSourceRows={selectedCountryTopSourceRows}
        selectedCountryTrendBars={selectedCountryTrendBars}
      />

      <OverviewTrendSection
        browserTimeZone={browserTimeZone}
        countryDataReady={countryDataReady}
        mapWindow={mapWindow}
        selectedCountry={selectedCountry}
        selectedCountryTrendBars={selectedCountryTrendBars}
        selectedCountryTrendTitle={selectedCountryTrendTitle}
        selectedCountryTrendWindowLabel={selectedCountryTrendWindowLabel}
      />

      <OverviewBreakdownSection
        activeWindowDescriptor={activeWindowDescriptor}
        countryDataReady={countryDataReady}
        detailSelectionActive={detailSelectionActive}
        derivedTopDegradedRegions={derivedTopDegradedRegions}
        derivedTopDegradedSources={derivedTopDegradedSources}
        mapMode={mapMode}
        mapWindow={mapWindow}
        onFocusCountryName={onFocusCountryName}
        onSelectPublisher={onSelectPublisher}
        onSelectSource={onSelectSource}
        selectedCountry={selectedCountry}
        selectedCountrySummaryDisplay={selectedCountrySummaryDisplay}
        selectedCountryTopPublishers={selectedCountryTopPublishers}
        selectedCountryTopRegionsDisplay={selectedCountryTopRegionsDisplay}
        selectedCountryTopSourceRows={selectedCountryTopSourceRows}
        selectedPublisher={selectedPublisher}
        topCountries={topCountries}
        topDegradedCountries={topDegradedCountries}
        topPublishers={topPublishers}
      />
    </>
  );
}
