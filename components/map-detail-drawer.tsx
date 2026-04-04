'use client';

import Link from 'next/link';
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
  detailAccessLocked: boolean;
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

function formatHourlyTickLabel(hour: string): string {
  const date = new Date(hour);
  if (Number.isNaN(date.getTime())) {
    return hour;
  }
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    hour12: false,
  });
}

function buildHourlyAxisTicks(maxCount: number): number[] {
  const top = Math.max(maxCount, 1);
  const middle = top <= 1 ? 1 : Math.ceil(top / 2);
  return [...new Set([top, middle, 0])].sort((a, b) => b - a);
}

function degradedShare(row: MapCountryMetricRow, window: MapMetricWindow): number {
  const metrics = row.windows[window];
  if (metrics.activeSources <= 0) return 0;
  return metrics.degradedSources / metrics.activeSources;
}

function formatPlace(city: string | null, region: string | null, country?: string | null): string {
  const parts: string[] = [];
  if (city) parts.push(city);
  if (region && region !== city) parts.push(region);
  if (country && country !== region && country !== city) parts.push(country);
  return parts.length > 0 ? parts.join(', ') : 'n/a';
}

function operatingLocationLabel(sourceDetail: MapSourceDetailResponse): string {
  if (sourceDetail.locationKind === 'foreign-operated') return 'No in-country operating point';
  if (sourceDetail.locationKind === 'country-fallback') return 'National / Unmapped';
  return sourceDetail.city || sourceDetail.region || sourceDetail.country;
}

function corporateHqLabel(sourceDetail: MapSourceDetailResponse): string {
  if (sourceDetail.corporateCountry) {
    return formatPlace(sourceDetail.corporateCity, sourceDetail.corporateRegion, sourceDetail.corporateCountry);
  }
  if (sourceDetail.locationKind === 'headquarters') {
    return formatPlace(sourceDetail.city, sourceDetail.region, sourceDetail.country);
  }
  return 'n/a';
}

function mapUserFacingError(error: string): string {
  const normalized = error.trim();
  const normalizedKey = normalized.toLowerCase();
  if (
    normalizedKey === 'customer api base url is not configured on the portal server.' ||
    normalizedKey === 'internal api token is not configured on the portal server.'
  ) {
    return 'Map metrics data is currently unavailable. Please try again later.';
  }
  return normalized;
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
    detailAccessLocked,
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
              {selectedPublisher.countries.slice(0, 10).map((item, index) => (
                <button
                  key={`${item.country}-${index}`}
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
              {topDegradedCountries.slice(0, 8).map((item, index) => (
                <button
                  key={`${item.country}-${index}`}
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
      ) : selectedCountry && detailAccessLocked ? (
        <div className="panel muted">
          {selectedCountry.country} source and regional detail is locked until you add a customer token.{' '}
          <Link href="/access/">Open Access</Link>
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
                  ? 'Click a city or region bubble to inspect sources. National fallback and foreign-operated sources stay in the country panel and are not plotted on the map.'
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
        <div className="map-source-detail map-source-detail--source">
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

          <div className="map-detail-meta map-detail-meta--source">
            <div className="map-detail-meta-card" title={sourceDetail.publisher || sourceDetail.source}>
              <span>Publisher</span>
              <strong>{sourceDetail.publisher || sourceDetail.source}</strong>
            </div>
            <div className="map-detail-meta-card" title={publisherConfidenceLabel(sourceDetail.publisherConfidence)}>
              <span>Publisher Confidence</span>
              <strong>{publisherConfidenceLabel(sourceDetail.publisherConfidence)}</strong>
            </div>
            <div className="map-detail-meta-card" title={sourceDetail.country}>
              <span>Market Country</span>
              <strong>{sourceDetail.country}</strong>
            </div>
            <div className="map-detail-meta-card" title={sourceMethodLabel(sourceDetail.method)}>
              <span>Method</span>
              <strong>{sourceMethodLabel(sourceDetail.method)}</strong>
            </div>
            <div className="map-detail-meta-card" title={operatingLocationLabel(sourceDetail)}>
              <span>Operating Location</span>
              <strong>{operatingLocationLabel(sourceDetail)}</strong>
            </div>
            <div className="map-detail-meta-card" title={corporateHqLabel(sourceDetail)}>
              <span>Corporate HQ</span>
              <strong>{corporateHqLabel(sourceDetail)}</strong>
            </div>
            <div className="map-detail-meta-card" title={sourceLocationKindLabel(sourceDetail.locationKind)}>
              <span>Location Basis</span>
              <strong>{sourceLocationKindLabel(sourceDetail.locationKind)}</strong>
            </div>
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
                  {sourceDetail.hourly24h.length > 0 ? (() => {
                    const maxCount = Math.max(...sourceDetail.hourly24h.map((hour) => hour.count), 0);
                    const scaleMax = Math.max(maxCount, 1);
                    const yAxisTicks = buildHourlyAxisTicks(maxCount);
                    return (
                      <div className="detail-hourly-chart-shell">
                        <div className="detail-hourly-axis-meta">
                          <span>Y: published items</span>
                          <span>X: hour</span>
                        </div>
                        <div className="detail-hourly-chart">
                          <div className="detail-hourly-y-axis" aria-hidden="true">
                            {yAxisTicks.map((tick) => (
                              <span key={tick}>{formatNumber(tick)}</span>
                            ))}
                          </div>
                          <div className="detail-hourly-plot-wrap">
                            <div className="detail-hourly-plot">
                              <div className="detail-hourly-guides" aria-hidden="true">
                                {yAxisTicks.map((tick) => (
                                  <span key={tick} className="detail-hourly-guide" />
                                ))}
                              </div>
                              <div className="detail-hourly-bars">
                                {sourceDetail.hourly24h.map((item) => {
                                  const heightPercent =
                                    maxCount <= 0 ? 0 : Math.max((item.count / scaleMax) * 100, item.count > 0 ? 6 : 0);
                                  const tickLabel = formatHourlyTickLabel(item.hour);
                                  return (
                                    <div key={item.hour} className="detail-hourly-bar-col" title={`${tickLabel}: ${formatNumber(item.count)}`}>
                                      <div className="detail-hourly-bar" style={{ height: `${heightPercent}%` }} />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="detail-hourly-x-axis" aria-hidden="true">
                              {sourceDetail.hourly24h.map((item, index) => {
                                const showTick =
                                  sourceDetail.hourly24h.length <= 8 ||
                                  index === 0 ||
                                  index === sourceDetail.hourly24h.length - 1 ||
                                  index % 6 === 0;
                                return (
                                  <span key={item.hour} className="detail-hourly-x-tick">
                                    {showTick ? formatHourlyTickLabel(item.hour) : ''}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })() : <span className="muted">No hourly data yet.</span>}
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
        <div className="panel danger">{mapUserFacingError(sourceDetailError)}</div>
      ) : (
        <div className="panel muted">Source detail is unavailable.</div>
      )}
    </aside>
  );
}
