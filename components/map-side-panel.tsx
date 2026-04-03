'use client';

import Link from 'next/link';
import {
  MAP_WINDOW_OPTIONS,
  type LeftTab,
  type MapLayerState,
  type MapMode,
} from '@/lib/map-view-state';
import type {
  MapMetricWindow,
  MapCountryMetricRow,
  MapCountryMetricsResponse,
  MapPublisherMetricRow,
  MapSourceMetricRow,
} from '@/lib/map-types';
import { MapSidePanelDisplayTab } from '@/components/map-side-panel-display-tab';
import { MapSidePanelOverviewTab } from '@/components/map-side-panel-overview-tab';
import type {
  MapSidePanelCountrySummaryDisplay,
  MapSidePanelCountryTrendBar,
  MapSidePanelDegradedRegion,
  MapSidePanelRankedCount,
  MapSidePanelRegionCount,
} from '@/components/map-side-panel-types';

type MapSidePanelProps = {
  mapMode: MapMode;
  mapWindow: MapMetricWindow;
  leftTab: LeftTab;
  selectedCountry: MapCountryMetricRow | null;
  countryDataReady: boolean;
  detailSelectionActive: boolean;
  detailAccessLocked: boolean;
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
    sourceCount: number;
    published: number;
  } | null;
  derivedTopDegradedRegions: MapSidePanelDegradedRegion[];
  derivedTopDegradedSources: MapSourceMetricRow[];
  activeWindowDescriptor: string;
  latestMapUpdatedLabel: string | null;
  mapProvenanceLabel: string;
  mapProvenanceNote: string;
  motionEnabled: boolean;
  layers: MapLayerState;
  healthTotals: {
    healthySources24h: number;
    degradedSources24h: number;
    countriesWithIssues: number;
  };
  loading: boolean;
  errors: string[];
  onMapModeChange: (mode: MapMode) => void;
  onMapWindowChange: (window: MapMetricWindow) => void;
  onLeftTabChange: (tab: LeftTab) => void;
  onToggleLayer: (key: keyof MapLayerState) => void;
  onToggleMotion: () => void;
  onFocusCountryName: (country: string) => void;
  onSelectPublisher: (publisher: MapPublisherMetricRow) => void;
  onSelectSource: (source: MapSourceMetricRow | MapSidePanelRankedCount) => void;
};

const MAP_WINDOW_SELECT_LABELS: Record<MapMetricWindow, string> = {
  '1h': 'Last 1 hour',
  '24h': 'Rolling 24 hours',
  '7d': 'Rolling 7 days',
};

export function MapSidePanel({
  mapMode,
  mapWindow,
  leftTab,
  selectedCountry,
  countryDataReady,
  detailSelectionActive,
  detailAccessLocked,
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
  motionEnabled,
  layers,
  healthTotals,
  loading,
  errors,
  onMapModeChange,
  onMapWindowChange,
  onLeftTabChange,
  onToggleLayer,
  onToggleMotion,
  onFocusCountryName,
  onSelectPublisher,
  onSelectSource,
}: MapSidePanelProps) {
  return (
    <aside className={`map-side-panel ${selectedCountry ? 'is-country-view' : ''}`}>
      <div className="map-panel-head">
        <div>
          <div className="eyebrow">
            {selectedCountry
              ? 'Country Detail'
              : mapMode === 'publishers' && selectedPublisher
                ? 'Publisher Compare'
                : mapMode === 'health'
                  ? 'Health Overview'
                  : 'Global Overview'}
          </div>
          <h2 className={!selectedCountry && mapMode === 'countries' ? 'map-panel-title is-global-pulse' : 'map-panel-title'}>
            {selectedCountry
              ? selectedCountry.country
              : mapMode === 'publishers' && selectedPublisher
                ? selectedPublisher.publisher
                : mapMode === 'health'
                  ? 'Source Health Overlay'
                  : 'World Publishing Pulse'}
          </h2>
        </div>
        {selectedCountry ? <div className="map-status-pill flat">Flat Map</div> : null}
      </div>

      {!selectedCountry ? (
        <div className="map-mode-row" role="tablist" aria-label="Map metric mode">
          <button type="button" className={`map-mode-chip ${mapMode === 'countries' ? 'active' : ''}`} onClick={() => onMapModeChange('countries')}>
            Countries
          </button>
          <button type="button" className={`map-mode-chip ${mapMode === 'publishers' ? 'active' : ''}`} onClick={() => onMapModeChange('publishers')}>
            Publishers
          </button>
          <button type="button" className={`map-mode-chip ${mapMode === 'health' ? 'active' : ''}`} onClick={() => onMapModeChange('health')}>
            Health
          </button>
        </div>
      ) : null}

      {!selectedCountry ? (
        <div className="map-secondary-controls">
          <div className="map-tab-row map-tab-row-secondary" role="tablist" aria-label="Map side panel sections">
            <button
              type="button"
              role="tab"
              aria-selected={leftTab === 'overview'}
              className={`map-tab-chip map-tab-chip-secondary ${leftTab === 'overview' ? 'active' : ''}`}
              onClick={() => onLeftTabChange('overview')}
            >
              Overview
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={leftTab === 'display'}
              className={`map-tab-chip map-tab-chip-secondary ${leftTab === 'display' ? 'active' : ''}`}
              onClick={() => onLeftTabChange('display')}
            >
              Display
            </button>
          </div>
          <label className="map-select-control">
            <span>Window</span>
            <select value={mapWindow} onChange={(event) => onMapWindowChange(event.target.value as MapMetricWindow)}>
              {MAP_WINDOW_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {MAP_WINDOW_SELECT_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {selectedCountry ? (
        <div className="map-tab-row" role="tablist" aria-label="Map side panel sections">
          <button
            type="button"
            role="tab"
            aria-selected={leftTab === 'overview'}
            className={`map-tab-chip ${leftTab === 'overview' ? 'active' : ''}`}
            onClick={() => onLeftTabChange('overview')}
          >
            Overview
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={leftTab === 'display'}
            className={`map-tab-chip ${leftTab === 'display' ? 'active' : ''}`}
            onClick={() => onLeftTabChange('display')}
          >
            Display
          </button>
        </div>
      ) : null}

      {detailAccessLocked ? (
        <div className="panel muted">
          {selectedCountry
            ? `${selectedCountry.country} regional and source drill-down is available after you add a customer token.`
            : 'Map overview is public. Add a customer token to unlock country, region, and source drill-down.'}{' '}
          <Link href="/access/">Open Access</Link>
        </div>
      ) : null}

      <div className="map-tab-panel">
        {leftTab === 'overview' ? (
          <MapSidePanelOverviewTab
            mapMode={mapMode}
            mapWindow={mapWindow}
            selectedCountry={selectedCountry}
            countryDataReady={countryDataReady}
            detailSelectionActive={detailSelectionActive}
            selectedPublisher={selectedPublisher}
            selectedPublisherWindowMetrics={selectedPublisherWindowMetrics}
            totals={totals}
            totalWindowMetrics={totalWindowMetrics}
            topCountries={topCountries}
            topPublishers={topPublishers}
            topDegradedCountries={topDegradedCountries}
            selectedCountrySummaryDisplay={selectedCountrySummaryDisplay}
            selectedCountryTrendTitle={selectedCountryTrendTitle}
            selectedCountryTrendWindowLabel={selectedCountryTrendWindowLabel}
            selectedCountryTrendBars={selectedCountryTrendBars}
            selectedCountryTopRegionsDisplay={selectedCountryTopRegionsDisplay}
            selectedCountryTopPublishers={selectedCountryTopPublishers}
            selectedCountryTopSourceRows={selectedCountryTopSourceRows}
            selectedCountryFallbackSummary={selectedCountryFallbackSummary}
            derivedTopDegradedRegions={derivedTopDegradedRegions}
            derivedTopDegradedSources={derivedTopDegradedSources}
            activeWindowDescriptor={activeWindowDescriptor}
            latestMapUpdatedLabel={latestMapUpdatedLabel}
            mapProvenanceLabel={mapProvenanceLabel}
            mapProvenanceNote={mapProvenanceNote}
            healthTotals={healthTotals}
            onFocusCountryName={onFocusCountryName}
            onSelectPublisher={onSelectPublisher}
            onSelectSource={onSelectSource}
          />
        ) : null}
        {leftTab === 'display' ? (
          <MapSidePanelDisplayTab
            mapMode={mapMode}
            motionEnabled={motionEnabled}
            layers={layers}
            onToggleLayer={onToggleLayer}
            onToggleMotion={onToggleMotion}
          />
        ) : null}
      </div>

      {loading ? <div className="panel muted">Loading map metrics...</div> : null}
      {errors.map((error) => (
        <div key={error} className="panel danger">{error}</div>
      ))}
    </aside>
  );
}
