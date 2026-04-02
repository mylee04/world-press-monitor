'use client';

import type { ReactNode } from 'react';
import {
  formatNumber,
  getPublisherCountryWindowMetrics,
  getSourceWindowMetrics,
  publisherConfidenceLabel,
  sourceLocationKindLabel,
  sourceMethodLabel,
} from '@/lib/map-display';
import type {
  MapMetricWindow,
  MapCountryMetricRow,
  MapPublisherMetricRow,
  MapSourceDetailResponse,
  MapSourceMetricRow,
} from '@/lib/map-types';

type DetailTab = 'metrics' | 'health';
type MapMode = 'countries' | 'publishers' | 'health';

type CountrySourceCluster = {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
  point: { x: number; y: number };
  pub7d: number;
  pub24h: number;
  pub1h: number;
  windows: Record<MapMetricWindow, { published: number }>;
  sourceCount: number;
  headquartersCount: number;
  health: MapSourceMetricRow['health'];
  sources: MapSourceMetricRow[];
};

type MapDetailDrawerProps = {
  mapMode: MapMode;
  mapWindow: MapMetricWindow;
  activeWindowDescriptor: string;
  selectedCountry: MapCountryMetricRow | null;
  selectedCluster: CountrySourceCluster | null;
  selectedSource: MapSourceMetricRow | null;
  selectedPublisher: MapPublisherMetricRow | null;
  selectedPublisherWindowMetrics: MapPublisherMetricRow['windows'][MapMetricWindow] | null;
  selectedPublisherReliability: number;
  sourceDetail: MapSourceDetailResponse | null;
  sourceDetailLoading: boolean;
  sourceDetailError: string | null;
  selectedClusterSourcesDisplay: MapSourceMetricRow[];
  topDegradedCountries: MapCountryMetricRow[];
  healthTotals: {
    healthySources24h: number;
    degradedSources24h: number;
    countriesWithIssues: number;
  };
  detailTab: DetailTab;
  onDetailTabChange: (tab: DetailTab) => void;
  onFocusCountry: (country: string) => void;
  onSelectSource: (source: MapSourceMetricRow) => void;
  onClearSelectedSource: () => void;
};

function round(value: number, digits = 1): number {
  const precision = 10 ** digits;
  return Math.round(value * precision) / precision;
}

function degradedShare(row: MapCountryMetricRow, window: MapMetricWindow): number {
  const metrics = row.windows[window];
  if (metrics.activeSources <= 0) return 0;
  return metrics.degradedSources / metrics.activeSources;
}

function renderPanelHead(props: MapDetailDrawerProps): ReactNode {
  const {
    mapMode,
    selectedCountry,
    selectedCluster,
    selectedPublisher,
    selectedPublisherWindowMetrics,
    sourceDetail,
    healthTotals,
  } = props;

  return (
    <div className="map-panel-head">
      <div>
        <div className="eyebrow">
          {sourceDetail
            ? 'Source Detail'
            : selectedCluster
              ? 'Cluster Detail'
              : !selectedCountry && mapMode === 'publishers'
                ? 'Publisher Detail'
                : !selectedCountry && mapMode === 'health'
                  ? 'Health Detail'
                  : 'Source Detail'}
        </div>
        <h2>
          {sourceDetail?.source ||
            selectedCluster?.name ||
            (!selectedCountry && mapMode === 'publishers' ? selectedPublisher?.publisher || 'Select a publisher' : null) ||
            (!selectedCountry && mapMode === 'health' ? 'Source Health' : null) ||
            'Select a source'}
        </h2>
      </div>
      {sourceDetail ? <div className={`map-status-pill ${sourceDetail.health.status === 'healthy' ? 'globe' : 'flat'}`}>{sourceDetail.health.status}</div> : null}
      {sourceDetail ? (
        <div className={`map-status-pill confidence-${sourceDetail.publisherConfidence}`}>
          {publisherConfidenceLabel(sourceDetail.publisherConfidence)}
        </div>
      ) : null}
      {!sourceDetail && selectedCluster ? <div className="map-status-pill globe">{selectedCluster.sourceCount} sources</div> : null}
      {!selectedCountry && mapMode === 'publishers' && selectedPublisher && selectedPublisherWindowMetrics ? <div className="map-status-pill globe">{selectedPublisherWindowMetrics.activeCountries} countries</div> : null}
      {!selectedCountry && mapMode === 'publishers' && selectedPublisher ? (
        <div className={`map-status-pill confidence-${selectedPublisher.publisherConfidence}`}>
          {publisherConfidenceLabel(selectedPublisher.publisherConfidence)}
        </div>
      ) : null}
      {!selectedCountry && mapMode === 'health' ? <div className="map-status-pill flat">{healthTotals.degradedSources24h} degraded</div> : null}
    </div>
  );
}

export function MapDetailDrawer(props: MapDetailDrawerProps) {
  const {
    mapMode,
    mapWindow,
    activeWindowDescriptor,
    selectedCountry,
    selectedCluster,
    selectedSource,
    selectedPublisher,
    selectedPublisherWindowMetrics,
    selectedPublisherReliability,
    sourceDetail,
    sourceDetailLoading,
    sourceDetailError,
    selectedClusterSourcesDisplay,
    topDegradedCountries,
    healthTotals,
    detailTab,
    onDetailTabChange,
    onFocusCountry,
    onSelectSource,
    onClearSelectedSource,
  } = props;
  const compactHint = mapMode === 'countries' && !selectedSource && !selectedCluster;

  return (
    <aside className={`map-detail-drawer ${selectedCountry ? 'is-country-view' : ''} ${compactHint ? 'is-compact-hint' : ''}`}>
      {renderPanelHead(props)}

      {!selectedCountry && !selectedSource && mapMode === 'publishers' && selectedPublisher && selectedPublisherWindowMetrics ? (
        <div className="map-source-detail">
          <div className="map-detail-meta">
            <div><span>Publisher</span><strong>{selectedPublisher.publisher}</strong></div>
            <div><span>Grouping Confidence</span><strong>{publisherConfidenceLabel(selectedPublisher.publisherConfidence)}</strong></div>
            <div><span>{activeWindowDescriptor} Output</span><strong>{formatNumber(selectedPublisherWindowMetrics.published)}</strong></div>
            <div><span>Countries</span><strong>{formatNumber(selectedPublisherWindowMetrics.activeCountries)}</strong></div>
            <div><span>Active Sources</span><strong>{formatNumber(selectedPublisherWindowMetrics.activeSources)}</strong></div>
            <div><span>Reliability</span><strong>{round(selectedPublisherReliability * 100, 1)}%</strong></div>
          </div>

          <div className="map-stat-grid compact">
            <article className="map-stat-card">
              <span>Healthy Sources</span>
              <strong>{formatNumber(selectedPublisherWindowMetrics.healthySources)}</strong>
            </article>
            <article className="map-stat-card">
              <span>Degraded Sources</span>
              <strong>{formatNumber(selectedPublisherWindowMetrics.degradedSources)}</strong>
            </article>
            <article className="map-stat-card">
              <span>Top Market</span>
              <strong>{selectedPublisher.countries[0]?.country || 'n/a'}</strong>
            </article>
            <article className="map-stat-card">
              <span>Top Market {activeWindowDescriptor}</span>
              <strong>{formatNumber(selectedPublisher.countries[0] ? getPublisherCountryWindowMetrics(selectedPublisher.countries[0], mapWindow).published : 0)}</strong>
            </article>
          </div>

          <div className="map-panel-block compact">
            <div className="section-head">
              <h3>Country Footprint</h3>
              <span>click a market to drill down</span>
            </div>
            <div className="map-list">
              {selectedPublisher.countries.slice(0, 10).map((item) => (
                <button
                  key={item.country}
                  type="button"
                  className="map-list-row"
                  onClick={() => onFocusCountry(item.country)}
                >
                  <div className="map-list-copy">
                    <strong>{item.country}</strong>
                    <span>{formatNumber(getPublisherCountryWindowMetrics(item, mapWindow).activeSources)} sources · {formatNumber(getPublisherCountryWindowMetrics(item, mapWindow).degradedSources)} degraded</span>
                  </div>
                  <span>{formatNumber(getPublisherCountryWindowMetrics(item, mapWindow).published)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : !selectedCountry && !selectedSource && mapMode === 'health' ? (
        <div className="map-source-detail">
          <div className="map-detail-meta">
            <div><span>Healthy Sources</span><strong>{formatNumber(healthTotals.healthySources24h)}</strong></div>
            <div><span>Degraded Sources</span><strong>{formatNumber(healthTotals.degradedSources24h)}</strong></div>
            <div><span>Countries With Issues</span><strong>{formatNumber(healthTotals.countriesWithIssues)}</strong></div>
            <div><span>Mode</span><strong>Global health</strong></div>
          </div>

          <div className="map-panel-block compact">
            <div className="section-head">
              <h3>Most Degraded Countries</h3>
              <span>sorted by degraded share</span>
            </div>
            <div className="map-list">
              {topDegradedCountries.slice(0, 8).map((item) => (
                <button
                  key={item.country}
                  type="button"
                  className="map-list-row"
                  onClick={() => onFocusCountry(item.country)}
                >
                  <div className="map-list-copy">
                    <strong>{item.country}</strong>
                    <span>{formatNumber(item.windows[mapWindow].degradedSources)} degraded · {formatNumber(item.windows[mapWindow].activeSources)} active</span>
                  </div>
                  <span>{round(degradedShare(item, mapWindow) * 100, 1)}%</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : !selectedSource && !selectedCluster ? (
        <div className="panel muted">
          {mapMode === 'health'
            ? 'Choose a country, then click a city or region bubble. The drawer will prioritize degraded sources and show source-level health detail.'
            : mapMode === 'publishers'
              ? 'Choose a country from the selected publisher footprint, then click a city or region bubble to inspect sources from that network.'
              : compactHint && !selectedCountry
                ? 'Choose a country, then click a city or region bubble to inspect sources.'
                : compactHint && selectedCountry
                  ? 'Click a city or region bubble to inspect sources. National fallback sources stay in the country panel and are not plotted on the map.'
                  : 'Choose a country, then click a city or region bubble. The drawer will list sources in that area, and from there you can open full source detail.'}
        </div>
      ) : !selectedSource && selectedCluster ? (
        <div className="map-source-detail">
          <div className="map-detail-meta">
            <div><span>Area</span><strong>{selectedCluster.city || selectedCluster.region || selectedCountry?.country || 'National'}</strong></div>
            <div><span>Sources</span><strong>{formatNumber(selectedCluster.sourceCount)}</strong></div>
            <div><span>{activeWindowDescriptor} Output</span><strong>{formatNumber(selectedCluster.windows[mapWindow].published)}</strong></div>
            <div><span>24h Context</span><strong>{formatNumber(selectedCluster.pub24h)}</strong></div>
            <div><span>HQ Sources</span><strong>{formatNumber(selectedCluster.headquartersCount)}</strong></div>
          </div>

              <div className="map-panel-block compact">
                <div className="section-head">
                  <h3>Cluster Sources</h3>
                  <span>{mapMode === 'health' ? 'Degraded sources appear first' : 'Choose a source for detail'}</span>
                </div>
                <div className="map-list">
                  {selectedClusterSourcesDisplay.map((source) => (
                    <button
                      key={source.sourceId}
                      type="button"
                  className="map-list-row"
                  onClick={() => onSelectSource(source)}
                >
                  <div className="map-list-copy">
                    <strong>{source.source}</strong>
                    <span>
                      {source.region || source.city || source.country}
                      {mapMode === 'health'
                        ? ` · ${source.health}`
                        : source.publisher && source.publisher !== source.source
                          ? ` · ${source.publisher} · ${publisherConfidenceLabel(source.publisherConfidence)}`
                          : ''}
                    </span>
                  </div>
                  <span>{formatNumber(getSourceWindowMetrics(source, mapWindow).published)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : sourceDetailLoading && !sourceDetail ? (
        <div className="panel muted">Loading source detail...</div>
      ) : sourceDetail ? (
        <div className="map-source-detail">
          {selectedCluster ? (
            <div className="map-panel-block compact">
              <div className="section-head">
                <h3>{selectedCluster.region || selectedCluster.city || 'Selected Region'}</h3>
                <button type="button" className="map-inline-action" onClick={onClearSelectedSource}>
                  Back To Region
                </button>
              </div>
            </div>
          ) : null}

          <div className="map-detail-meta">
            <div><span>Publisher</span><strong>{sourceDetail.publisher || sourceDetail.source}</strong></div>
            <div><span>Publisher Confidence</span><strong>{publisherConfidenceLabel(sourceDetail.publisherConfidence)}</strong></div>
            <div><span>Country</span><strong>{sourceDetail.country}</strong></div>
            <div><span>Method</span><strong>{sourceMethodLabel(sourceDetail.method)}</strong></div>
            <div><span>Location</span><strong>{sourceDetail.region || sourceDetail.city || 'National'}</strong></div>
            <div><span>Coordinate</span><strong>{sourceLocationKindLabel(sourceDetail.locationKind)}</strong></div>
          </div>

          <div className="map-detail-tab-row" role="tablist" aria-label="Source detail sections">
            <button
              type="button"
              role="tab"
              aria-selected={detailTab === 'metrics'}
              className={`map-detail-tab ${detailTab === 'metrics' ? 'active' : ''}`}
              onClick={() => onDetailTabChange('metrics')}
            >
              Metrics
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={detailTab === 'health'}
              className={`map-detail-tab ${detailTab === 'health' ? 'active' : ''}`}
              onClick={() => onDetailTabChange('health')}
            >
              Health
            </button>
          </div>

          <div className="map-detail-tab-panel">
            {detailTab === 'metrics' ? (
              <>
                <div className="map-stat-grid compact">
                  <article className="map-stat-card">
                    <span>Pub 24h</span>
                    <strong>{formatNumber(sourceDetail.metrics.pub24h)}</strong>
                  </article>
                  <article className="map-stat-card">
                    <span>Pub 1h</span>
                    <strong>{formatNumber(sourceDetail.metrics.pub1h)}</strong>
                  </article>
                  <article className="map-stat-card">
                    <span>Fresh 24h</span>
                    <strong>{formatNumber(sourceDetail.metrics.fresh24h)}</strong>
                  </article>
                  <article className="map-stat-card">
                    <span>Late 24h</span>
                    <strong>{formatNumber(sourceDetail.metrics.late24h)}</strong>
                  </article>
                </div>

                <div className="map-panel-block">
                  <div className="section-head">
                    <h3>Hourly Output</h3>
                    <span>Last 24 hours</span>
                  </div>
                  <div className="mini-bars">
                    {sourceDetail.hourly24h.length > 0 ? sourceDetail.hourly24h.map((item) => {
                      const max = Math.max(...sourceDetail.hourly24h.map((hour) => hour.count), 1);
                      const height = Math.max(8, Math.round((item.count / max) * 84));
                      return (
                        <div key={item.hour} className="mini-bar-col" title={`${item.hour}: ${item.count}`}>
                          <div className="mini-bar" style={{ height }} />
                        </div>
                      );
                    }) : <span className="muted">No hourly data yet.</span>}
                  </div>
                </div>
              </>
            ) : null}

            {detailTab === 'health' ? (
              <div className="map-panel-block compact">
                <div className="map-health-grid">
                  <div>
                    <span>Fail Rate 24h</span>
                    <strong>{sourceDetail.health.failRate24h === null ? 'n/a' : `${round(sourceDetail.health.failRate24h * 100, 1)}%`}</strong>
                  </div>
                  <div>
                    <span>Last Checked</span>
                    <strong>{sourceDetail.health.lastCheckedAt ? new Date(sourceDetail.health.lastCheckedAt).toLocaleString() : 'Unavailable'}</strong>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : sourceDetailError ? (
        <div className="panel danger">{sourceDetailError}</div>
      ) : (
        <div className="panel muted">Source detail is unavailable.</div>
      )}
    </aside>
  );
}
