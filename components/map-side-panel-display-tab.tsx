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
      {!mapMode ? null : <div className="map-inline-note">Bubble color help is shown above the globe.</div>}
    </div>
  );
}
