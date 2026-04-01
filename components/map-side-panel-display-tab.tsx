'use client';

import type { MapLayerState } from '@/lib/map-view-state';
import type { MapMode } from '@/lib/map-view-state';

type MapSidePanelDisplayTabProps = {
  mapMode: MapMode;
  motionEnabled: boolean;
  layers: MapLayerState;
  onToggleLayer: (key: keyof MapLayerState) => void;
  onToggleMotion: () => void;
};

export function MapSidePanelDisplayTab({
  mapMode,
  motionEnabled,
  layers,
  onToggleLayer,
  onToggleMotion,
}: MapSidePanelDisplayTabProps) {
  return (
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
  );
}
