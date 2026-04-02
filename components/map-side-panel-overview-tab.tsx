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
    sourceCount: number;
    published: number;
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
  const selectedCountryLivePublished = selectedCountry ? getCountryWindowMetrics(selectedCountry, '1h').published : 0;
  const selectedCountryLateShare = selectedCountrySummaryDisplay.firstSeen > 0
    ? selectedCountrySummaryDisplay.late / selectedCountrySummaryDisplay.firstSeen
    : 0;
  const selectedCountryTopRegion = selectedCountryTopRegionsDisplay[0] || null;
  const selectedCountryTopPublisher = selectedCountryTopPublishers[0] || null;
  const selectedCountryTopSource = selectedCountryTopSourceRows[0] || null;
  const selectedCountryPeakBucket = selectedCountryTrendBars.reduce<MapSidePanelCountryTrendBar | null>((current, item) => {
    if (!current || item.count > current.count) {
      return item;
    }
    return current;
  }, null);
  const selectedCountryAveragePerBucket = selectedCountryTrendBars.length > 0
    ? selectedCountryTrendBars.reduce((sum, item) => sum + item.count, 0) / selectedCountryTrendBars.length
    : 0;
  const selectedCountryAveragePerSource = selectedCountrySummaryDisplay.activeSources > 0
    ? selectedCountrySummaryDisplay.published / selectedCountrySummaryDisplay.activeSources
    : 0;
  const selectedCountryHealthShare = selectedCountrySummaryDisplay.activeSources > 0
    ? selectedCountrySummaryDisplay.degradedSources / selectedCountrySummaryDisplay.activeSources
    : 0;
  const showCountrySourceSignals = selectedCountry && countryDataReady && !detailSelectionActive;

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

      {selectedCountry && countryDataReady ? (
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
      ) : null}

      {selectedCountry && countryDataReady ? (
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
            <strong>{selectedCountryPeakBucket?.bucket || 'No trend yet'}</strong>
            <p>
              {selectedCountryPeakBucket
                ? `${formatNumber(selectedCountryPeakBucket.count)} published · avg ${round(selectedCountryAveragePerBucket, 1)} per ${mapWindow === '7d' ? 'day' : 'hour'}`
                : `No ${mapWindow === '7d' ? 'daily' : 'hourly'} country trend has been collected yet.`}
            </p>
          </div>
        </div>
      ) : null}

      {selectedCountry && countryDataReady ? (
        <div className="map-panel-block compact">
          <div className="section-head sub">
            <h3>{selectedCountryTrendTitle}</h3>
            <span>{selectedCountryTrendWindowLabel}</span>
          </div>
          <div className="map-trend-summary">
            <span>
              {selectedCountryPeakBucket
                ? `${mapWindow === '7d' ? 'Peak day' : 'Peak hour'} ${selectedCountryPeakBucket.bucket}`
                : 'Awaiting trend buckets'}
            </span>
            <strong>
              {selectedCountryPeakBucket
                ? `${formatNumber(selectedCountryPeakBucket.count)} published`
                : 'No trend signal yet'}
            </strong>
          </div>
          <div className="mini-bars">
            {selectedCountryTrendBars.length > 0 ? selectedCountryTrendBars.map((item) => {
              const max = Math.max(...selectedCountryTrendBars.map((bucket) => bucket.count), 1);
              const height = Math.max(8, Math.round((item.count / max) * 84));
              return (
                <div key={item.bucket} className="mini-bar-col" title={`${item.bucket}: ${item.count}`}>
                  <div className="mini-bar" style={{ height }} />
                </div>
              );
            }) : <span className="muted">{mapWindow === '7d' ? 'No daily country data yet.' : 'No hourly country data yet.'}</span>}
          </div>
        </div>
      ) : null}

      {!selectedCountry ? (
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
                : `Country bubbles are sized by ${activeWindowDescriptor} publishing volume and color-shift on freshness and late share.`}
          </span>
          <span>
            {latestMapUpdatedLabel
              ? `${mapProvenanceLabel} · ${mapProvenanceNote} · last updated ${latestMapUpdatedLabel}`
              : `${mapProvenanceLabel} · ${mapProvenanceNote}`}
          </span>
        </div>
      ) : null}

      <div className="map-panel-block">
        <div className="section-head">
          <h3>
            {selectedCountry
              ? 'Country Breakdown'
              : mapMode === 'publishers'
                ? 'Top Publishers'
                : mapMode === 'health'
                  ? 'Most Degraded'
                  : 'Top Countries'}
          </h3>
          <span>
            {selectedCountry
              ? detailSelectionActive
                ? 'publishers'
                : 'publishers · regions · sources'
              : mapMode === 'publishers'
                ? `${activeWindowDescriptor} network output`
                : mapMode === 'health'
                  ? 'degraded share and count'
                  : `${activeWindowDescriptor} country output`}
          </span>
        </div>

        {!selectedCountry && mapMode === 'countries' ? (
          <div className="map-list">
            {topCountries.map((item) => (
              <button key={item.country} type="button" className="map-list-row" onClick={() => onFocusCountryName(item.country)}>
                <strong>{item.country}</strong>
                <span>{formatNumber(getCountryWindowMetrics(item, mapWindow).published)}</span>
              </button>
            ))}
          </div>
        ) : null}

        {!selectedCountry && mapMode === 'publishers' ? (
          <>
            <div className="map-list">
              {topPublishers.map((item) => (
                <button
                  key={item.publisher}
                  type="button"
                  className={`map-list-row ${selectedPublisher?.publisher === item.publisher ? 'selected' : ''}`}
                  onClick={() => onSelectPublisher(item)}
                >
                  <div className="map-list-copy">
                    <strong>{item.publisher}</strong>
                    <span>
                      {formatNumber(getPublisherWindowMetrics(item, mapWindow).activeCountries)} countries ·{' '}
                      {publisherConfidenceLabel(item.publisherConfidence)}
                    </span>
                  </div>
                  <span>{formatNumber(getPublisherWindowMetrics(item, mapWindow).published)}</span>
                </button>
              ))}
            </div>
            {selectedPublisher ? (
              <>
                <div className="section-head sub">
                  <h3>Publisher Countries</h3>
                  <span>{activeWindowDescriptor} footprint</span>
                </div>
                <div className="map-list">
                  {selectedPublisher.countries.slice(0, 10).map((item) => (
                    <button
                      key={item.country}
                      type="button"
                      className="map-list-row"
                      onClick={() => onFocusCountryName(item.country)}
                    >
                      <div className="map-list-copy">
                        <strong>{item.country}</strong>
                        <span>{formatNumber(getPublisherCountryWindowMetrics(item, mapWindow).activeSources)} sources</span>
                      </div>
                      <span>{formatNumber(getPublisherCountryWindowMetrics(item, mapWindow).published)}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </>
        ) : null}

        {!selectedCountry && mapMode === 'health' ? (
          <div className="map-list">
            {topDegradedCountries.map((item) => (
              <button
                key={item.country}
                type="button"
                className="map-list-row"
                onClick={() => onFocusCountryName(item.country)}
              >
                <div className="map-list-copy">
                  <strong>{item.country}</strong>
                  <span>{formatNumber(item.windows[mapWindow].degradedSources)} degraded</span>
                </div>
                <span>{round(itemDegradedShare(item, mapWindow) * 100, 1)}%</span>
              </button>
            ))}
          </div>
        ) : null}

        {selectedCountry && countryDataReady ? (
          <>
            <div className="section-head sub">
              <h3>Top Publishers</h3>
              <span>{activeWindowDescriptor} output</span>
            </div>
            <div className="map-list">
              {(mapMode === 'publishers'
                ? [{ name: selectedPublisher?.publisher || 'Selected Publisher', count: selectedCountrySummaryDisplay.published }]
                : selectedCountryTopPublishers
              ).slice(0, 8).map((item) => (
                <div key={item.name} className="map-list-row static">
                  <strong>{item.name}</strong>
                  <span>{formatNumber(item.count)}</span>
                </div>
              ))}
            </div>
            {!detailSelectionActive ? (
              <>
                <div className="section-head sub">
                  <h3>{mapMode === 'health' ? 'Top Degraded Regions' : 'Top Regions'}</h3>
                  <span>{mapMode === 'health' ? 'degraded' : `${activeWindowDescriptor} output`}</span>
                </div>
                <div className="map-list">
                  {mapMode === 'health'
                    ? derivedTopDegradedRegions.slice(0, 8).map((item) => (
                        <div key={item.name} className="map-list-row static">
                          <div className="map-list-copy">
                            <strong>{item.name}</strong>
                            <span>{formatNumber(item.degradedSources)} degraded · {formatNumber(item.sources)} total</span>
                          </div>
                          <span>{round(item.degradedShare * 100, 1)}%</span>
                        </div>
                      ))
                    : selectedCountryTopRegionsDisplay.slice(0, 8).map((item) => (
                        <div key={item.name} className="map-list-row static">
                          <div className="map-list-copy">
                            <strong>{item.name}</strong>
                            <span>{formatNumber(item.sources)} sources</span>
                          </div>
                          <span>{formatNumber(item.count)}</span>
                        </div>
                      ))}
                </div>
              </>
            ) : null}
            {!detailSelectionActive ? (
              <>
                <div className="section-head sub">
                  <h3>{mapMode === 'health' ? 'Top Degraded Sources' : 'Top Sources'}</h3>
                  <span>{mapMode === 'health' ? 'degraded' : `${activeWindowDescriptor} output`}</span>
                </div>
                <div className="map-list">
                  {mapMode === 'health'
                    ? derivedTopDegradedSources.slice(0, 10).map((item) => (
                        <button key={item.sourceId} type="button" className="map-list-row" onClick={() => onSelectSource(item)}>
                          <div className="map-list-copy">
                            <strong>{item.source}</strong>
                            <span>{item.health} · {item.region || item.city || item.country}</span>
                          </div>
                          <span>{formatNumber(getSourceWindowMetrics(item, mapWindow).published)}</span>
                        </button>
                      ))
                    : selectedCountryTopSourceRows.slice(0, 10).map((item) => (
                        <button key={item.sourceId} type="button" className="map-list-row" onClick={() => onSelectSource(item)}>
                          <div className="map-list-copy">
                            <strong>{item.source}</strong>
                            <span>
                              {(item.publisher && item.publisher !== item.source ? `${item.publisher} · ` : '') +
                                (item.region || item.city || item.country)}
                            </span>
                          </div>
                          <span>{formatNumber(getSourceWindowMetrics(item, mapWindow).published)}</span>
                        </button>
                      ))}
                </div>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </>
  );
}
