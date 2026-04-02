'use client';

import type { RefObject } from 'react';
import type { MapCountryMetricRow } from '@/lib/map-types';
import type { MapMode, MapSearchResult } from '@/lib/map-view-state';
import { MapSearchBox } from '@/components/map-search-box';

type MapFloatingToolbarProps = {
  selectedCountry: MapCountryMetricRow | null;
  mapMode: MapMode;
  motionEnabled: boolean;
  searchOpen: boolean;
  searchQuery: string;
  searchMode: 'countries' | 'publishers';
  searchResults: MapSearchResult[];
  countryZoomLabel: string;
  countriesLoading: boolean;
  publishersLoading: boolean;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onResetToGlobe: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onResetZoom: () => void;
  onToggleMotion: () => void;
  onSearchOpen: () => void;
  onSearchClose: () => void;
  onSearchChange: (value: string) => void;
  onCommitSearchResult: (result: MapSearchResult) => void;
};

export function MapFloatingToolbar({
  selectedCountry,
  mapMode,
  motionEnabled,
  searchOpen,
  searchQuery,
  searchMode,
  searchResults,
  countryZoomLabel,
  countriesLoading,
  publishersLoading,
  searchInputRef,
  onResetToGlobe,
  onZoomOut,
  onZoomIn,
  onResetZoom,
  onToggleMotion,
  onSearchOpen,
  onSearchClose,
  onSearchChange,
  onCommitSearchResult,
}: MapFloatingToolbarProps) {
  return (
    <div className={`map-floating-toolbar ${selectedCountry ? 'is-country' : 'is-globe'}`}>
      {selectedCountry ? (
        <>
          <button type="button" className="button" onClick={onResetToGlobe}>
            Back To Globe
          </button>
          <button type="button" className="map-toolbar-chip map-toolbar-button" onClick={onZoomOut} aria-label="Zoom out">
            -
          </button>
          <div className="map-toolbar-chip">{countryZoomLabel}</div>
          <button type="button" className="map-toolbar-chip map-toolbar-button" onClick={onZoomIn} aria-label="Zoom in">
            +
          </button>
          <button type="button" className="map-toolbar-chip map-toolbar-button" onClick={onResetZoom}>
            Reset Zoom
          </button>
          <MapSearchBox
            searchOpen={searchOpen}
            searchQuery={searchQuery}
            searchMode="countries"
            searchResults={searchResults}
            countriesLoading={countriesLoading}
            publishersLoading={publishersLoading}
            searchInputRef={searchInputRef}
            onSearchOpen={onSearchOpen}
            onSearchClose={onSearchClose}
            onSearchChange={onSearchChange}
            onCommitSearchResult={onCommitSearchResult}
          />
        </>
      ) : (
        <>
          <div className="map-toolbar-chip">
            {mapMode === 'publishers'
              ? 'Publisher Globe'
              : mapMode === 'health'
                ? 'Health Globe'
                : 'World Publishing Pulse'}
          </div>
          <MapSearchBox
            searchOpen={searchOpen}
            searchQuery={searchQuery}
            searchMode={searchMode}
            searchResults={searchResults}
            countriesLoading={countriesLoading}
            publishersLoading={publishersLoading}
            searchInputRef={searchInputRef}
            onSearchOpen={onSearchOpen}
            onSearchClose={onSearchClose}
            onSearchChange={onSearchChange}
            onCommitSearchResult={onCommitSearchResult}
          />
          <button type="button" className="map-toolbar-chip map-toolbar-button" onClick={onToggleMotion}>
            {motionEnabled ? 'Pause Motion' : 'Resume Motion'}
          </button>
        </>
      )}
    </div>
  );
}
