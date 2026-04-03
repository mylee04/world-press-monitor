import { formatNumber } from '@/lib/map-display';
import type { MapCountryMetricRow, MapMetricWindow } from '@/lib/map-types';
import type { MapSidePanelCountryTrendBar } from '@/components/map-side-panel-types';
import { formatTrendBucket } from '@/components/map-side-panel-overview-utils';

type OverviewTrendSectionProps = {
  browserTimeZone: string | null;
  countryDataReady: boolean;
  mapWindow: MapMetricWindow;
  selectedCountry: MapCountryMetricRow | null;
  selectedCountryTrendBars: MapSidePanelCountryTrendBar[];
  selectedCountryTrendTitle: string;
  selectedCountryTrendWindowLabel: string;
};

export function OverviewTrendSection({
  browserTimeZone,
  countryDataReady,
  mapWindow,
  selectedCountry,
  selectedCountryTrendBars,
  selectedCountryTrendTitle,
  selectedCountryTrendWindowLabel,
}: OverviewTrendSectionProps) {
  const selectedCountryPeakBucket = selectedCountryTrendBars.reduce<MapSidePanelCountryTrendBar | null>((current, item) => {
    if (!current || item.count > current.count) return item;
    return current;
  }, null);
  const selectedCountryPeakBucketLabel = selectedCountryPeakBucket
    ? formatTrendBucket(selectedCountryPeakBucket.bucket, mapWindow, browserTimeZone)
    : null;
  const maxTrendCount = Math.max(...selectedCountryTrendBars.map((bucket) => bucket.count), 1);

  if (!(selectedCountry && countryDataReady)) return null;

  return (
    <div className="map-panel-block compact">
      <div className="section-head sub">
        <h3>{selectedCountryTrendTitle}</h3>
        <span>{selectedCountryTrendWindowLabel}</span>
      </div>
      <div className="map-trend-summary">
        <span>
          {selectedCountryPeakBucket
            ? `${mapWindow === '7d' ? 'Peak day' : 'Peak hour'} ${selectedCountryPeakBucketLabel}`
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
          const height = Math.max(8, Math.round((item.count / maxTrendCount) * 84));
          return (
            <div key={item.bucket} className="mini-bar-col" title={`${formatTrendBucket(item.bucket, mapWindow, browserTimeZone)}: ${item.count}`}>
              <div className="mini-bar" style={{ height }} />
            </div>
          );
        }) : <span className="muted">{mapWindow === '7d' ? 'No daily country data yet.' : 'No hourly country data yet.'}</span>}
      </div>
    </div>
  );
}
