import {
  formatNumber,
  getCountryWindowMetrics,
  getPublisherCountryWindowMetrics,
  getPublisherWindowMetrics,
  getSourceWindowMetrics,
  publisherConfidenceLabel,
} from '@/lib/map-display';
import type {
  MapCountryMetricRow,
  MapMetricWindow,
  MapPublisherMetricRow,
  MapSourceMetricRow,
} from '@/lib/map-types';
import type { MapMode } from '@/lib/map-view-state';
import type {
  MapSidePanelCountrySummaryDisplay,
  MapSidePanelDegradedRegion,
  MapSidePanelRankedCount,
  MapSidePanelRegionCount,
} from '@/components/map-side-panel-types';
import { itemDegradedShare, round } from '@/components/map-side-panel-overview-utils';

type OverviewBreakdownSectionProps = {
  activeWindowDescriptor: string;
  countryDataReady: boolean;
  detailSelectionActive: boolean;
  derivedTopDegradedRegions: MapSidePanelDegradedRegion[];
  derivedTopDegradedSources: MapSourceMetricRow[];
  mapMode: MapMode;
  mapWindow: MapMetricWindow;
  onFocusCountryName: (country: string) => void;
  onSelectPublisher: (publisher: MapPublisherMetricRow) => void;
  onSelectSource: (source: MapSourceMetricRow | MapSidePanelRankedCount) => void;
  selectedCountry: MapCountryMetricRow | null;
  selectedCountrySummaryDisplay: MapSidePanelCountrySummaryDisplay;
  selectedCountryTopPublishers: MapSidePanelRankedCount[];
  selectedCountryTopRegionsDisplay: MapSidePanelRegionCount[];
  selectedCountryTopSourceRows: MapSourceMetricRow[];
  selectedPublisher: MapPublisherMetricRow | null;
  topCountries: MapCountryMetricRow[];
  topDegradedCountries: MapCountryMetricRow[];
  topPublishers: MapPublisherMetricRow[];
};

export function OverviewBreakdownSection({
  activeWindowDescriptor,
  countryDataReady,
  detailSelectionActive,
  derivedTopDegradedRegions,
  derivedTopDegradedSources,
  mapMode,
  mapWindow,
  onFocusCountryName,
  onSelectPublisher,
  onSelectSource,
  selectedCountry,
  selectedCountrySummaryDisplay,
  selectedCountryTopPublishers,
  selectedCountryTopRegionsDisplay,
  selectedCountryTopSourceRows,
  selectedPublisher,
  topCountries,
  topDegradedCountries,
  topPublishers,
}: OverviewBreakdownSectionProps) {
  const publisherComparisonMode = !selectedCountry && mapMode === 'publishers' && Boolean(selectedPublisher);
  const comparisonPublishers =
    mapMode === 'publishers' && selectedPublisher
      ? topPublishers.filter((item) => item.publisher !== selectedPublisher.publisher)
      : topPublishers;

  return (
    <div className="map-panel-block">
      <div className="section-head">
        <h3>
          {selectedCountry
            ? 'Country Breakdown'
            : mapMode === 'publishers'
              ? publisherComparisonMode
                ? 'Other Publishers'
                : 'Top Publishers'
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
                ? 'degraded count, then share'
                : `${activeWindowDescriptor} core country output`}
        </span>
      </div>

      {!selectedCountry && mapMode === 'countries' ? (
        <div className="map-list">
          {topCountries.map((item, index) => (
            <button
              key={`${item.country}-${index}`}
              type="button"
              className="map-list-row"
              onClick={() => onFocusCountryName(item.country)}
            >
              <strong>{item.country}</strong>
              <span>{formatNumber(getCountryWindowMetrics(item, mapWindow).published)}</span>
            </button>
          ))}
        </div>
      ) : null}

      {!selectedCountry && mapMode === 'publishers' ? (
        <>
          <div className="map-list">
            {comparisonPublishers.map((item, index) => (
              <button
                key={`${item.publisher}-${index}`}
                type="button"
                className="map-list-row"
                onClick={() => onSelectPublisher(item)}
              >
                <div className="map-list-copy">
                  <strong>{item.publisher}</strong>
                  <span>
                    {formatNumber(getPublisherWindowMetrics(item, mapWindow).activeCountries)} active countries ·{' '}
                    {publisherConfidenceLabel(item.publisherConfidence)}
                  </span>
                </div>
                <span>{formatNumber(getPublisherWindowMetrics(item, mapWindow).published)}</span>
              </button>
            ))}
          </div>
          {selectedPublisher && !publisherComparisonMode ? (
            <>
              <div className="section-head sub">
                <h3>Publisher Countries</h3>
                <span>{activeWindowDescriptor} footprint</span>
              </div>
              <div className="map-list">
                {selectedPublisher.countries.slice(0, 10).map((item, index) => (
                  <button
                    key={`${item.country}-${index}`}
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
          {topDegradedCountries.map((item, index) => (
            <button
              key={`${item.country}-${index}`}
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
            ).map((item, index) => (
              <div key={`${item.name}-${index}`} className="map-list-row static">
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
                  ? derivedTopDegradedRegions.map((item, index) => (
                      <div key={`${item.name}-${index}`} className="map-list-row static">
                        <div className="map-list-copy">
                          <strong>{item.name}</strong>
                          <span>{formatNumber(item.degradedSources)} degraded · {formatNumber(item.sources)} total</span>
                        </div>
                        <span>{round(item.degradedShare * 100, 1)}%</span>
                      </div>
                    ))
                  : selectedCountryTopRegionsDisplay.map((item, index) => (
                      <div key={`${item.name}-${index}`} className="map-list-row static">
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
                  ? derivedTopDegradedSources.map((item, index) => (
                      <button
                        key={`${item.sourceId}-${index}`}
                        type="button"
                        className="map-list-row"
                        onClick={() => onSelectSource(item)}
                      >
                        <div className="map-list-copy">
                          <strong>{item.source}</strong>
                          <span>{item.health} · {item.region || item.city || item.country}</span>
                        </div>
                        <span>{formatNumber(getSourceWindowMetrics(item, mapWindow).published)}</span>
                      </button>
                    ))
                  : selectedCountryTopSourceRows.map((item, index) => (
                      <button
                        key={`${item.sourceId}-${index}`}
                        type="button"
                        className="map-list-row"
                        onClick={() => onSelectSource(item)}
                      >
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
  );
}
