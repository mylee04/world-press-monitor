'use client';

import type { RefObject } from 'react';
import type { MapCountryMetricRow } from '@/lib/map-types';
import type { MapMode, MapSearchResult } from '@/lib/map-view-state';

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
  onResetZoom,
  onToggleMotion,
  onSearchOpen,
  onSearchClose,
  onSearchChange,
  onCommitSearchResult,
}: MapFloatingToolbarProps) {
  const searchHeading = searchMode === 'publishers' ? 'Publisher search' : 'Country search';
  const searchPlaceholder = searchMode === 'publishers' ? 'Search publisher' : 'Search country';
  const searchLabel = searchMode === 'publishers' ? 'Search publisher' : 'Search country';
  const emptyLabel = searchMode === 'publishers'
    ? (publishersLoading ? 'Loading publishers…' : 'No matching publishers.')
    : (countriesLoading ? 'Loading countries…' : 'No matching countries.');

  return (
    <div className="map-floating-toolbar">
      {selectedCountry ? (
        <>
          <button type="button" className="button" onClick={onResetToGlobe}>
            Back To Globe
          </button>
          <div className="map-toolbar-chip">{countryZoomLabel}</div>
          <button type="button" className="map-toolbar-chip map-toolbar-button" onClick={onResetZoom}>
            Reset Zoom
          </button>
          <div className={`map-search-shell ${searchOpen ? 'is-open' : ''}`}>
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              className="map-search-input"
              placeholder="Jump to country"
              aria-label="Search country"
              onFocus={onSearchOpen}
              onBlur={() => window.setTimeout(onSearchClose, 120)}
              onChange={(event) => onSearchChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  onSearchClose();
                  searchInputRef.current?.blur();
                }
                if (event.key === 'Enter' && searchResults[0]) {
                  event.preventDefault();
                  onCommitSearchResult(searchResults[0]);
                }
              }}
            />
            {searchOpen ? (
              <div className="map-search-dropdown">
                <div className="map-search-heading">Country search</div>
                <div className="map-search-results">
                  {searchResults.length > 0 ? (
                    searchResults.map((result) => (
                      <button
                        key={result.key}
                        type="button"
                        className="map-search-option"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => onCommitSearchResult(result)}
                      >
                        <strong>{result.title}</strong>
                        <span>{result.subtitle}</span>
                      </button>
                    ))
                  ) : (
                    <div className="map-search-empty">
                      {countriesLoading ? 'Loading countries…' : 'No matching countries.'}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <div className="map-toolbar-chip">
            {mapMode === 'publishers' ? 'Publisher Globe' : mapMode === 'health' ? 'Health Globe' : '3D Globe View'}
          </div>
          <div className={`map-search-shell ${searchOpen ? 'is-open' : ''}`}>
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              className="map-search-input"
              placeholder={searchPlaceholder}
              aria-label={searchLabel}
              onFocus={onSearchOpen}
              onBlur={() => window.setTimeout(onSearchClose, 120)}
              onChange={(event) => onSearchChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  onSearchClose();
                  searchInputRef.current?.blur();
                }
                if (event.key === 'Enter' && searchResults[0]) {
                  event.preventDefault();
                  onCommitSearchResult(searchResults[0]);
                }
              }}
            />
            {searchOpen ? (
              <div className="map-search-dropdown">
                <div className="map-search-heading">{searchHeading}</div>
                <div className="map-search-results">
                  {searchResults.length > 0 ? (
                    searchResults.map((result) => (
                      <button
                        key={result.key}
                        type="button"
                        className="map-search-option"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => onCommitSearchResult(result)}
                      >
                        <strong>{result.title}</strong>
                        <span>{result.subtitle}</span>
                      </button>
                    ))
                  ) : (
                    <div className="map-search-empty">{emptyLabel}</div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
          <button type="button" className="map-toolbar-chip map-toolbar-button" onClick={onToggleMotion}>
            {motionEnabled ? 'Pause Motion' : 'Resume Motion'}
          </button>
        </>
      )}
    </div>
  );
}
