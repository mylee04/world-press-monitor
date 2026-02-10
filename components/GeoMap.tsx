'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { NewsItem } from '@/lib/types';

interface GeoMapProps {
  items: NewsItem[];
  selectedCountry: string;
  onCountrySelect: (country: string) => void;
  selectedOutletFilter: string;
  onOutletSelect: (outletName: string) => void;
  mapViewMode: 'map' | 'bubble_country' | 'bubble_outlet';
  onMapViewModeChange: (mode: 'map' | 'bubble_country' | 'bubble_outlet') => void;
  samplingLabel?: string;
  locale?: 'en' | 'es';
}

const AMERICAS_BOUNDS = new maplibregl.LngLatBounds([-170, -60], [-20, 80]);
const MAP_FOCUS_COUNTRIES = new Set(['United States', 'Argentina', 'Chile', 'Uruguay']);
const COUNTRY_CENTROIDS: Record<string, { lat: number; lon: number }> = {
  'United States': { lat: 39.8, lon: -98.6 },
  Argentina: { lat: -38.4, lon: -63.6 },
  Chile: { lat: -35.7, lon: -71.5 },
  Uruguay: { lat: -32.5, lon: -55.8 }
};
const MAP_TEXT = {
  en: {
    global: 'Global',
    storiesWindow: 'stories in current window',
    noBeatData: 'No beat data',
    newsroom: 'NEWSROOM',
    coverage: 'Americas Coverage',
    resetCountry: 'Reset Country',
    countryView: 'Country view',
    articleView: 'Article view'
    ,
    mapView: 'Map View',
    viewMap: 'Map',
    viewCountryBubble: 'Country list',
    viewOutletBubble: 'Outlet list',
    allOutlets: 'All outlets',
    countryCounts: 'Country counts',
    outletCounts: 'Outlet counts',
    noCountData: 'No count data for current filters',
    stories: 'stories'
  },
  es: {
    global: 'Global',
    storiesWindow: 'noticias en la ventana actual',
    noBeatData: 'Sin datos de sección',
    newsroom: 'REDACCIÓN',
    coverage: 'Cobertura Américas',
    resetCountry: 'Reiniciar país',
    countryView: 'Vista país',
    articleView: 'Vista artículo'
    ,
    mapView: 'Vista mapa',
    viewMap: 'Mapa',
    viewCountryBubble: 'Lista por país',
    viewOutletBubble: 'Lista por medio',
    allOutlets: 'Todos los medios',
    countryCounts: 'Conteo por país',
    outletCounts: 'Conteo por medio',
    noCountData: 'Sin datos para los filtros actuales',
    stories: 'noticias'
  }
} as const;

function isAmericasPoint(item: NewsItem): boolean {
  if (typeof item.lat !== 'number' || typeof item.lon !== 'number') return false;
  const { lat, lon } = item;
  return lon >= -170 && lon <= -20 && lat >= -60 && lat <= 75;
}

function normalizeCountryName(value?: string): string {
  if (!value) return '';
  const key = value.trim().toLowerCase();
  if (key === 'us' || key === 'united states') return 'United States';
  if (key === 'mx' || key === 'mexico') return 'Mexico';
  if (key === 'ar' || key === 'argentina') return 'Argentina';
  if (key === 'cl' || key === 'chile') return 'Chile';
  if (key === 'uy' || key === 'uruguay') return 'Uruguay';
  if (key === 'latam' || key === 'latin america') return 'LATAM';
  return value;
}

function isMapFocusCountry(country: string): boolean {
  return MAP_FOCUS_COUNTRIES.has(country);
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatClock(now: Date, timeZone: string, withDate = false): string {
  return new Intl.DateTimeFormat('en-US', {
    ...(withDate ? { dateStyle: 'medium' as const } : {}),
    timeStyle: 'medium',
    hour12: false,
    timeZone
  }).format(now);
}

export function GeoMap({
  items,
  selectedCountry,
  onCountrySelect,
  selectedOutletFilter,
  onOutletSelect,
  mapViewMode,
  onMapViewModeChange,
  samplingLabel,
  locale = 'en'
}: GeoMapProps) {
  const mt = MAP_TEXT[locale];
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemMarkersRef = useRef<maplibregl.Marker[]>([]);
  const countryMarkersRef = useRef<maplibregl.Marker[]>([]);
  const [now, setNow] = useState<Date | null>(null);
  const [zoom, setZoom] = useState<number>(2.1);

  const markerItems = useMemo(
    () => items.filter((item) => {
      if (!isAmericasPoint(item)) return false;
      const country = normalizeCountryName(item.country || item.locationName || '');
      return isMapFocusCountry(country);
    }),
    [items]
  );
  const countryAggregates = useMemo(() => {
    const byCountry = new Map<string, { country: string; lat: number; lon: number; count: number; beats: Map<string, number>; latestTs: number }>();

    for (const item of items) {
      const country = normalizeCountryName(item.country || item.locationName || mt.global);
      // Keep this panel country-only and scoped to US + target LATAM countries.
      if (!isMapFocusCountry(country)) continue;
      const key = country;
      const hasGeo = isAmericasPoint(item);
      const fallback = COUNTRY_CENTROIDS[country];
      if (!hasGeo && !fallback) continue;
      const lat = hasGeo ? (item.lat as number) : fallback.lat;
      const lon = hasGeo ? (item.lon as number) : fallback.lon;
      const ts = new Date(item.publishedAt).getTime();
      const existing = byCountry.get(key);
      if (!existing) {
        byCountry.set(key, {
          country,
          lat,
          lon,
          count: 1,
          beats: new Map([[item.beat, 1]]),
          latestTs: Number.isFinite(ts) ? ts : 0
        });
        continue;
      }
      existing.count += 1;
      existing.lat = (existing.lat * (existing.count - 1) + lat) / existing.count;
      existing.lon = (existing.lon * (existing.count - 1) + lon) / existing.count;
      existing.beats.set(item.beat, (existing.beats.get(item.beat) ?? 0) + 1);
      if (Number.isFinite(ts)) existing.latestTs = Math.max(existing.latestTs, ts);
    }

    return [...byCountry.values()]
      .filter((row) => isMapFocusCountry(row.country))
      .sort((a, b) => b.count - a.count);
  }, [items, mt.global]);
  const outletAggregates = useMemo(() => {
    const byOutlet = new Map<string, { outlet: string; count: number; country: string }>();
    for (const item of markerItems) {
      const key = item.source;
      const row = byOutlet.get(key) ?? {
        outlet: key,
        count: 0,
        country: item.country || mt.global
      };
      row.count += 1;
      byOutlet.set(key, row);
    }
    return [...byOutlet.values()].sort((a, b) => b.count - a.count).slice(0, 24);
  }, [markerItems, mt.global]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [-78, 12],
      zoom: 2.35,
      maxBounds: AMERICAS_BOUNDS
    });

    mapRef.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    mapRef.current.on('load', () => {
      mapRef.current?.fitBounds(AMERICAS_BOUNDS, {
        padding: { top: 18, bottom: 18, left: 18, right: 18 },
        maxZoom: 3
      });
    });
    mapRef.current.on('zoomend', () => setZoom(mapRef.current?.getZoom() ?? 2.1));

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    for (const marker of itemMarkersRef.current) marker.remove();
    itemMarkersRef.current = [];

    if (!mapRef.current) return;
    if (zoom <= 2.4) return;

    for (const item of markerItems) {
      const el = document.createElement('button');
      el.className = item.country && item.country === selectedCountry ? 'map-marker active' : 'map-marker';
      el.type = 'button';
      el.setAttribute('aria-label', `${item.country || item.locationName || 'news point'} marker`);
      el.addEventListener('click', () => onCountrySelect(item.country || item.locationName || 'Global'));

      const popupHtml = `
        <div class="map-popup-card">
          <div class="map-popup-source">${escapeHtml(item.source)}</div>
          <div class="map-popup-title">${escapeHtml(item.title.slice(0, 160))}</div>
          <div class="map-popup-meta">${escapeHtml(item.country || item.locationName || mt.global)} · ${escapeHtml(item.beat)}</div>
        </div>
      `;

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([item.lon as number, item.lat as number])
        .setPopup(new maplibregl.Popup({ closeButton: false, offset: 14 }).setHTML(popupHtml))
        .addTo(mapRef.current);

      itemMarkersRef.current.push(marker);
    }
  }, [markerItems, onCountrySelect, selectedCountry, zoom]);

  useEffect(() => {
    for (const marker of countryMarkersRef.current) marker.remove();
    countryMarkersRef.current = [];

    if (!mapRef.current) return;
    if (zoom > 2.4) return;

    for (const row of countryAggregates) {
      const el = document.createElement('button');
      const size = Math.min(44, 16 + Math.sqrt(row.count) * 5);
      el.className = row.country === selectedCountry ? 'country-bubble active' : 'country-bubble';
      el.type = 'button';
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.innerText = `${row.count}`;
      el.setAttribute('aria-label', `${row.country} ${row.count} stories`);
      el.addEventListener('click', () => onCountrySelect(row.country));

      const topBeats = [...row.beats.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([beat, count]) => `${beat} ${count}`)
        .join(' · ');

      const popupHtml = `
        <div class="map-popup-card">
          <div class="map-popup-source">${escapeHtml(row.country)}</div>
          <div class="map-popup-title">${row.count} ${mt.storiesWindow}</div>
          <div class="map-popup-meta">${escapeHtml(topBeats || mt.noBeatData)}</div>
        </div>
      `;

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([row.lon, row.lat])
        .setPopup(new maplibregl.Popup({ closeButton: false, offset: 14 }).setHTML(popupHtml))
        .addTo(mapRef.current);

      countryMarkersRef.current.push(marker);
    }
  }, [countryAggregates, onCountrySelect, selectedCountry, zoom]);

  useEffect(() => {
    if (!mapRef.current || !selectedCountry) return;
    if (selectedCountry === 'Global') {
      mapRef.current.fitBounds(AMERICAS_BOUNDS, {
        padding: { top: 18, bottom: 18, left: 18, right: 18 },
        maxZoom: 3,
        duration: 650
      });
      return;
    }
    const target = markerItems.find((item) => item.country === selectedCountry);
    if (!target) return;
    mapRef.current.flyTo({
      center: [target.lon as number, target.lat as number],
      zoom: 3.2,
      speed: 0.8
    });
  }, [markerItems, selectedCountry]);

  return (
    <div className="map-shell">
      <div className="map-toolbar">
        <div className="map-toolbar-left">
          <strong className="map-brand">PRESSLAB</strong>
          <span className="map-brand-tag">{mt.newsroom}</span>
          <span className="region-clock-chip">{mt.coverage}</span>
        </div>
        <div className="map-toolbar-right">
          <label>
            {mt.mapView}
            <select value={mapViewMode} onChange={(event) => onMapViewModeChange(event.target.value as 'map' | 'bubble_country' | 'bubble_outlet')}>
              <option value="map">{mt.viewMap}</option>
              <option value="bubble_country">{mt.viewCountryBubble}</option>
              <option value="bubble_outlet">{mt.viewOutletBubble}</option>
            </select>
          </label>
          <button type="button" onClick={() => onCountrySelect('Global')}>{mt.resetCountry}</button>
          {samplingLabel ? <span className="region-clock-chip">{samplingLabel}</span> : null}
          <code>{now ? `${formatClock(now, 'UTC', true)} UTC` : '-- UTC'}</code>
          <span className="region-clock-chip">{zoom <= 2.4 ? mt.countryView : mt.articleView}</span>
        </div>
      </div>
      <div className="map-content">
        <div ref={containerRef} className="map" />
        <aside className="map-side-panel">
          <div className="map-side-head">
            <strong>{mapViewMode === 'bubble_outlet' ? mt.outletCounts : mt.countryCounts}</strong>
            <span className="meta">
              {mapViewMode === 'bubble_outlet' ? `${outletAggregates.length} ${mt.stories}` : `${countryAggregates.length} ${mt.stories}`}
            </span>
          </div>
          <div className="map-side-list">
            {mapViewMode === 'bubble_outlet' ? (
              <>
                <button
                  type="button"
                  className={selectedOutletFilter === 'all' ? 'map-side-row active' : 'map-side-row'}
                  onClick={() => onOutletSelect('all')}
                >
                  <span>{mt.allOutlets}</span>
                  <strong>{markerItems.length}</strong>
                </button>
                {outletAggregates.map((row) => (
                  <button
                    key={`outlet-${row.outlet}`}
                    type="button"
                    className={row.outlet === selectedOutletFilter ? 'map-side-row active' : 'map-side-row'}
                    onClick={() => onOutletSelect(row.outlet)}
                    title={`${row.outlet} · ${row.country}`}
                  >
                    <span>{row.outlet}</span>
                    <strong>{row.count}</strong>
                  </button>
                ))}
              </>
            ) : (
              <>
                {countryAggregates.map((row) => (
                  <button
                    key={`country-${row.country}`}
                    type="button"
                    className={row.country === selectedCountry ? 'map-side-row active' : 'map-side-row'}
                    onClick={() => onCountrySelect(row.country)}
                    title={row.country}
                  >
                    <span>{row.country}</span>
                    <strong>{row.count}</strong>
                  </button>
                ))}
              </>
            )}
            {((mapViewMode === 'bubble_outlet' && outletAggregates.length === 0) || (mapViewMode !== 'bubble_outlet' && countryAggregates.length === 0)) ? (
              <p className="map-side-empty">{mt.noCountData}</p>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
