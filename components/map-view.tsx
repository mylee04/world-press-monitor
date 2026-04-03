'use client';

import type { CSSProperties } from 'react';
import { CountryPlaneSvg } from '@/components/map-country-plane-svg';
import { MapDetailDrawer } from '@/components/map-detail-drawer';
import { MapFloatingToolbar } from '@/components/map-floating-toolbar';
import { HelpTooltipLabel } from '@/components/help-tooltip-label';
import { MapSidePanel } from '@/components/map-side-panel';
import { useMapViewModel } from '@/components/use-map-view-model';
import { WorldGlobeSvg } from '@/components/map-world-globe-svg';

export function MapView() {
  const { detailDrawer, layout, sidePanel, stage } = useMapViewModel();

  return (
    <div className="page-stack map-page-stack map-page-root">
      <section className={`map-workbench ${layout.compactDetailHint ? 'is-compact-detail-hint' : ''} ${layout.publisherFocusActive ? 'has-publisher-focus' : ''}`}>
        <div className="map-stage-shell">
          <div
            ref={stage.stageRef}
            className="map-stage"
            onPointerEnter={stage.onPointerEnter}
            onPointerLeave={stage.onPointerLeave}
          >
            <MapFloatingToolbar
              selectedCountry={stage.selectedCountry}
              mapMode={stage.mapMode}
              motionEnabled={stage.motionEnabled}
              searchOpen={stage.searchOpen}
              searchQuery={stage.searchQuery}
              searchMode={stage.searchMode}
              searchResults={stage.searchResults}
              countryZoomLabel={stage.countryZoomLabel}
              countriesLoading={stage.countriesLoading}
              publishersLoading={stage.publishersLoading}
              searchInputRef={stage.searchInputRef}
              onResetToGlobe={stage.onResetToGlobe}
              onZoomOut={stage.onZoomOut}
              onZoomIn={stage.onZoomIn}
              onResetZoom={stage.onResetZoom}
              onToggleMotion={stage.onToggleMotion}
              onSearchOpen={stage.onSearchOpen}
              onSearchClose={stage.onSearchClose}
              onSearchChange={stage.onSearchChange}
              onCommitSearchResult={stage.onCommitSearchResult}
            />

            {!stage.selectedCountry ? (
              <div className="map-stage-legend" aria-label="Bubble color meaning">
                {stage.stageLegendItems.map((item) => (
                  <div key={item.label} className="map-stage-legend-item">
                    <span className={`legend-dot ${item.dotClassName}`} />
                    <HelpTooltipLabel label={item.label} description={item.description} />
                  </div>
                ))}
              </div>
            ) : null}

            <div
              key={stage.sceneMode === 'country' ? `country-${stage.selectedCountry?.country}` : 'globe'}
              className={`map-scene-frame ${stage.sceneMode === 'country' ? 'is-country' : 'is-globe'}`}
              style={
                {
                  ['--map-origin-x' as string]: `${stage.sceneOrigin.x}%`,
                  ['--map-origin-y' as string]: `${stage.sceneOrigin.y}%`,
                } as CSSProperties
              }
            >
              {stage.selectedCountry ? (
                stage.sourcesDataReady ? (
                  <CountryPlaneSvg
                    country={stage.selectedCountry}
                    world={stage.world}
                    sources={stage.mappedCountrySources}
                    window={stage.mapWindow}
                    layers={stage.layers}
                    viewport={stage.countryViewport}
                    safeInsets={stage.countrySafeInsets}
                    onViewportChange={stage.onViewportChange}
                    selectedClusterId={stage.selectedCluster?.id || null}
                    selectedSourceId={stage.selectedSource?.sourceId || null}
                    onSelectCluster={stage.onSelectCluster}
                  />
                ) : (
                  <div className="map-country-transition">
                    <div className="map-country-transition-card">
                      <div className="eyebrow">Camera Shift</div>
                      <strong>
                        {stage.sourcesLoading
                          ? `Loading ${stage.selectedCountry.country} regional map`
                          : stage.sourcesError
                            ? `${stage.selectedCountry.country} regional map unavailable`
                            : `Preparing ${stage.selectedCountry.country} regional map`}
                      </strong>
                      <span>
                        {stage.sourcesLoading
                          ? 'Switching from the globe to a focused flat country view.'
                          : stage.sourcesError
                            ? 'Country-level source clusters could not be loaded for this selection.'
                            : 'Building the flat map scene and source clusters.'}
                      </span>
                    </div>
                  </div>
                )
              ) : (
                <WorldGlobeSvg
                  countries={stage.globeCountries}
                  world={stage.world}
                  layers={stage.layers}
                  mapMode={stage.mapMode}
                  window={stage.mapWindow}
                  rotationLon={stage.globeRotationLon}
                  selectedCountry={null}
                  publisherFocused={stage.publisherFocusActive}
                  onSelectCountry={stage.onSelectCountry}
                />
              )}
            </div>
          </div>

          <MapSidePanel {...sidePanel} />

          <MapDetailDrawer {...detailDrawer} />
        </div>
      </section>
    </div>
  );
}
