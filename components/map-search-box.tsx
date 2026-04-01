'use client';

import type { RefObject } from 'react';
import type { MapSearchResult } from '@/lib/map-view-state';

type SearchMode = 'countries' | 'publishers';

type MapSearchBoxProps = {
  searchOpen: boolean;
  searchQuery: string;
  searchMode: SearchMode;
  searchResults: MapSearchResult[];
  countriesLoading: boolean;
  publishersLoading: boolean;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onSearchOpen: () => void;
  onSearchClose: () => void;
  onSearchChange: (value: string) => void;
  onCommitSearchResult: (result: MapSearchResult) => void;
};

export function MapSearchBox({
  searchOpen,
  searchQuery,
  searchMode,
  searchResults,
  countriesLoading,
  publishersLoading,
  searchInputRef,
  onSearchOpen,
  onSearchClose,
  onSearchChange,
  onCommitSearchResult,
}: MapSearchBoxProps) {
  const searchHeading = searchMode === 'publishers' ? 'Publisher search' : 'Country search';
  const searchPlaceholder = searchMode === 'publishers' ? 'Search publisher' : 'Search country';
  const searchLabel = searchMode === 'publishers' ? 'Search publisher' : 'Search country';
  const emptyLabel = searchMode === 'publishers'
    ? (publishersLoading ? 'Loading publishers…' : 'No matching publishers.')
    : (countriesLoading ? 'Loading countries…' : 'No matching countries.');

  return (
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
  );
}
