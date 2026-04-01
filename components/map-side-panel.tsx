'use client';

import {
  formatNumber,
  getCountryWindowMetrics,
  getPublisherCountryWindowMetrics,
  getPublisherWindowMetrics,
  getSourceWindowMetrics,
  mapWindowLabel,
  publisherConfidenceLabel,
} from '@/lib/map-display';
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

type RankedCount = {
  name: string;
  count: number;
};

type RegionCount = {
  name: string;
  count: number;
  sources: number;
};

type DegradedRegion = {
  name: string;
  degradedSources: number;
  sources: number;
  degradedShare: number;
};

type CountryTrendBar = {
  bucket: string;
  count: number;
};

type CountrySummaryDisplay = {
  published: number;
  fresh: number;
  rssSources: number;
  sitemapSources: number;
  healthySources: number;
  degradedSources: number;
};

type MapSidePanelProps = {
  mapMode: MapMode;
  mapWindow: MapMetricWindow;
  leftTab: LeftTab;
  selectedCountry: MapCountryMetricRow | null;
  countryDataReady: boolean;
  selectedPublisher: MapPublisherMetricRow | null;
  selectedPublisherWindowMetrics: MapPublisherMetricRow['windows'][MapMetricWindow] | null;
  totals: MapCountryMetricsResponse['totals'] | null;
  totalWindowMetrics: MapCountryMetricsResponse['totals']['windows'][MapMetricWindow] | null;
  topCountries: MapCountryMetricRow[];
  topPublishers: MapPublisherMetricRow[];
  topDegradedCountries: MapCountryMetricRow[];
  selectedCountrySummaryDisplay: CountrySummaryDisplay;
  selectedCountryTrendTitle: string;
  selectedCountryTrendWindowLabel: string;
  selectedCountryTrendBars: CountryTrendBar[];
  selectedCountryTopRegionsDisplay: RegionCount[];
  selectedCountryTopPublishers: RankedCount[];
  selectedCountryTopSourcesDisplay: RankedCount[];
  derivedTopDegradedRegions: DegradedRegion[];
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
  onSelectSource: (source: MapSourceMetricRow | RankedCount) => void;
};

function round(value: number, digits = 1): number {
  const precision = 10 ** digits;
  return Math.round(value * precision) / precision;
}

function itemDegradedShare(row: MapCountryMetricRow, window: MapMetricWindow): number {
  const metrics = row.windows[window];
  return metrics.activeSources > 0 ? metrics.degradedSources / metrics.activeSources : 0;
}

export function MapSidePanel({
  mapMode,
  mapWindow,
  leftTab,
  selectedCountry,
  countryDataReady,
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
  selectedCountryTopSourcesDisplay,
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
          <div className="eyebrow">{selectedCountry ? 'Country Detail' : 'Global Overview'}</div>
          <h2>
            {selectedCountry
              ? selectedCountry.country
              : mapMode === 'publishers' && selectedPublisher
                ? selectedPublisher.publisher
                : mapMode === 'health'
                  ? 'Source Health Overlay'
                  : 'World Publishing Pulse'}
          </h2>
        </div>
        <div className={`map-status-pill ${selectedCountry ? 'flat' : 'globe'}`}>
          {selectedCountry ? 'Flat Map' : '3D Globe'}
        </div>
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
        <div className="map-mode-row" role="tablist" aria-label="Map time window">
          {MAP_WINDOW_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={`map-mode-chip ${mapWindow === option ? 'active' : ''}`}
              onClick={() => onMapWindowChange(option)}
            >
              {mapWindowLabel(option)}
            </button>
          ))}
        </div>
      ) : null}

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

      <div className="map-tab-panel">
        {leftTab === 'overview' ? (
          <>
            {!selectedCountry && mapMode === 'countries' && totals ? (
              <div className="map-stat-grid">
                <article className="map-stat-card">
                  <span>Published {activeWindowDescriptor}</span>
                  <strong>{formatNumber(totalWindowMetrics?.published || 0)}</strong>
                </article>
                <article className="map-stat-card">
                  <span>{mapWindow === '1h' ? 'Fresh 1h' : `Fresh ${activeWindowDescriptor}`}</span>
                  <strong>{formatNumber(totalWindowMetrics?.fresh || 0)}</strong>
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
            ) : null}

            {!selectedCountry && mapMode === 'publishers' && selectedPublisher && selectedPublisherWindowMetrics ? (
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
            ) : null}

            {!selectedCountry && mapMode === 'health' ? (
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
            ) : null}

            {selectedCountry && countryDataReady ? (
              <div className="map-stat-grid">
                <article className="map-stat-card">
                  <span>Published {activeWindowDescriptor}</span>
                  <strong>{formatNumber(selectedCountrySummaryDisplay.published)}</strong>
                </article>
                <article className="map-stat-card">
                  <span>{mapWindow === '1h' ? 'Fresh 1h' : `Fresh ${activeWindowDescriptor}`}</span>
                  <strong>{formatNumber(selectedCountrySummaryDisplay.fresh)}</strong>
                </article>
                <article className="map-stat-card">
                  <span>{mapMode === 'health' ? 'Healthy Sources' : 'RSS Sources'}</span>
                  <strong>
                    {formatNumber(mapMode === 'health' ? selectedCountrySummaryDisplay.healthySources : selectedCountrySummaryDisplay.rssSources)}
                  </strong>
                </article>
                <article className="map-stat-card">
                  <span>{mapMode === 'health' ? 'Degraded Sources' : 'Sitemap Sources'}</span>
                  <strong>
                    {formatNumber(mapMode === 'health' ? selectedCountrySummaryDisplay.degradedSources : selectedCountrySummaryDisplay.sitemapSources)}
                  </strong>
                </article>
              </div>
            ) : null}

            {selectedCountry && countryDataReady ? (
              <div className="map-panel-block compact">
                <div className="section-head sub">
                  <h3>{selectedCountryTrendTitle}</h3>
                  <span>{selectedCountryTrendWindowLabel}</span>
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

            {selectedCountry && countryDataReady ? (
              <div className="map-panel-block compact">
                <div className="section-head sub">
                  <h3>Top Regions</h3>
                  <span>{activeWindowDescriptor} output</span>
                </div>
                <div className="map-list">
                  {selectedCountryTopRegionsDisplay.slice(0, 5).map((item) => (
                    <div key={item.name} className="map-list-row static">
                      <div className="map-list-copy">
                        <strong>{item.name}</strong>
                        <span>{formatNumber(item.sources)} sources</span>
                      </div>
                      <span>{formatNumber(item.count)}</span>
                    </div>
                  ))}
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
                    ? 'Rankings'
                    : mapMode === 'publishers'
                      ? 'Top Publishers'
                      : mapMode === 'health'
                        ? 'Most Degraded'
                        : 'Top Countries'}
                </h3>
                <span>
                  {selectedCountry
                    ? 'publishers · regions · sources'
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
                            {formatNumber(getPublisherWindowMetrics(item, mapWindow).activeCountries)} countries · {publisherConfidenceLabel(item.publisherConfidence)}
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
                          <button key={item.country} type="button" className="map-list-row" onClick={() => onFocusCountryName(item.country)}>
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
                    <button key={item.country} type="button" className="map-list-row" onClick={() => onFocusCountryName(item.country)}>
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
                      : selectedCountryTopSourcesDisplay.slice(0, 10).map((item) => (
                          <button key={item.name} type="button" className="map-list-row" onClick={() => onSelectSource(item)}>
                            <strong>{item.name}</strong>
                            <span>{formatNumber(item.count)}</span>
                          </button>
                        ))}
                  </div>
                </>
              ) : null}
            </div>
          </>
        ) : null}
        {leftTab === 'display' ? (
          <div className="map-panel-block compact">
            <div className="section-head">
              <h3>Layer Controls</h3>
              <span>Show or mute map detail</span>
            </div>
            <div className="map-layer-list">
              <button type="button" className="map-layer-row" onClick={() => onToggleLayer('labels')}>
                <div>
                  <strong>Labels</strong>
                  <span>Country and source callouts</span>
                </div>
                <span className={`map-switch ${layers.labels ? 'on' : ''}`} />
              </button>
              <button type="button" className="map-layer-row" onClick={() => onToggleLayer('graticule')}>
                <div>
                  <strong>Grid</strong>
                  <span>Latitude, longitude, and regional guides</span>
                </div>
                <span className={`map-switch ${layers.graticule ? 'on' : ''}`} />
              </button>
              <button type="button" className="map-layer-row" onClick={() => onToggleLayer('land')}>
                <div>
                  <strong>Landmass</strong>
                  <span>Country shapes and coastline definition</span>
                </div>
                <span className={`map-switch ${layers.land ? 'on' : ''}`} />
              </button>
              <button type="button" className="map-layer-row" onClick={() => onToggleLayer('glow')}>
                <div>
                  <strong>Atmosphere</strong>
                  <span>Halo, pulse, and glow depth</span>
                </div>
                <span className={`map-switch ${layers.glow ? 'on' : ''}`} />
              </button>
              <button type="button" className="map-layer-row" onClick={() => onToggleLayer('flows')}>
                <div>
                  <strong>Flows</strong>
                  <span>Publishing network arcs between major countries</span>
                </div>
                <span className={`map-switch ${layers.flows ? 'on' : ''}`} />
              </button>
              <button type="button" className="map-layer-row" onClick={onToggleMotion}>
                <div>
                  <strong>Motion</strong>
                  <span>Idle globe rotation while in global view</span>
                </div>
                <span className={`map-switch ${motionEnabled ? 'on' : ''}`} />
              </button>
            </div>
            <div className="map-legend compact">
              <div><span className="legend-dot late-low" /> {mapMode === 'health' ? 'Healthy source base' : 'Healthy / fresh'}</div>
              <div><span className="legend-dot late-mid" /> {mapMode === 'health' ? 'Moderate degraded share' : 'Moderate late share'}</div>
              <div><span className="legend-dot late-high" /> {mapMode === 'health' ? 'High degraded share' : 'High late share / degraded'}</div>
            </div>
          </div>
        ) : null}
      </div>

      {loading ? <div className="panel muted">Loading map metrics...</div> : null}
      {errors.map((error) => (
        <div key={error} className="panel danger">{error}</div>
      ))}
    </aside>
  );
}
