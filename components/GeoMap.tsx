'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { NewsItem } from '@/lib/types';

interface GeoMapProps {
  items: NewsItem[];
  selectedCountry: string;
  onCountrySelect: (country: string) => void;
}

const AMERICAS_BOUNDS = new maplibregl.LngLatBounds([-170, -60], [-20, 80]);

function isAmericasPoint(item: NewsItem): boolean {
  if (typeof item.lat !== 'number' || typeof item.lon !== 'number') return false;
  const { lat, lon } = item;
  return lon >= -170 && lon <= -20 && lat >= -60 && lat <= 75;
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

export function GeoMap({ items, selectedCountry, onCountrySelect }: GeoMapProps) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemMarkersRef = useRef<maplibregl.Marker[]>([]);
  const countryMarkersRef = useRef<maplibregl.Marker[]>([]);
  const [now, setNow] = useState<Date | null>(null);
  const [zoom, setZoom] = useState<number>(2.1);

  const markerItems = useMemo(
    () => items.filter((item) => isAmericasPoint(item)),
    [items]
  );
  const countryAggregates = useMemo(() => {
    const byCountry = new Map<string, { country: string; lat: number; lon: number; count: number; beats: Map<string, number>; latestTs: number }>();

    for (const item of markerItems) {
      const country = item.country || item.locationName || 'Unknown';
      const key = country;
      const lat = item.lat as number;
      const lon = item.lon as number;
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

    return [...byCountry.values()].sort((a, b) => b.count - a.count);
  }, [markerItems]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
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
          <div class="map-popup-meta">${escapeHtml(item.country || item.locationName || 'Global')} · ${escapeHtml(item.beat)}</div>
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
          <div class="map-popup-title">${row.count} stories in current window</div>
          <div class="map-popup-meta">${escapeHtml(topBeats || 'No beat data')}</div>
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
          <span className="map-brand-tag">NEWSROOM</span>
          <span className="region-clock-chip">Americas Coverage</span>
        </div>
        <div className="map-toolbar-right">
          <button type="button" onClick={() => onCountrySelect('Global')}>Reset Country</button>
          <code>{now ? `${formatClock(now, 'UTC', true)} UTC` : '-- UTC'}</code>
          <span className="region-clock-chip">{zoom <= 2.4 ? 'Country view' : 'Article view'}</span>
        </div>
      </div>
      <div ref={containerRef} className="map" />
    </div>
  );
}
