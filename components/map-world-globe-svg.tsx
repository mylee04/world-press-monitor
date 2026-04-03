'use client';

import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useMemo } from 'react';
import { geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import { formatNumber, getCountryWindowMetrics, mapWindowDescriptor } from '@/lib/map-display';
import type { MapCountryMetricRow, MapMetricWindow } from '@/lib/map-types';
import type { MapLayerState, MapMode } from '@/lib/map-view-state';
import {
  buildFlowPath,
  buildNonOverlappingLabels,
  getCountryBubbleColor,
  GLOBE_CENTER_X,
  GLOBE_CENTER_Y,
  GLOBE_HEIGHT,
  GLOBE_RADIUS,
  GLOBE_ROTATION_LAT,
  projectToGlobe,
  round,
  STAR_FIELD,
  type WorldGeoJson,
  GLOBE_WIDTH,
} from '@/components/map-stage-utils';

type WorldGlobeSvgProps = {
  countries: MapCountryMetricRow[];
  world: WorldGeoJson | null;
  layers: MapLayerState;
  mapMode: MapMode;
  window: MapMetricWindow;
  rotationLon: number;
  selectedCountry: string | null;
  publisherFocused: boolean;
  onSelectCountry: (country: MapCountryMetricRow) => void;
};

function handleKeyboardActivate(event: ReactKeyboardEvent<SVGGElement>, onActivate: () => void) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  onActivate();
}

export function WorldGlobeSvg({
  countries,
  world,
  layers,
  mapMode,
  window,
  rotationLon,
  selectedCountry,
  publisherFocused,
  onSelectCountry,
}: WorldGlobeSvgProps) {
  const projection = useMemo(
    () =>
      geoOrthographic()
        .translate([GLOBE_CENTER_X, GLOBE_CENTER_Y])
        .scale(GLOBE_RADIUS)
        .rotate([-rotationLon, -GLOBE_ROTATION_LAT])
        .clipAngle(90)
        .precision(0.4),
    [rotationLon]
  );

  const pathFactory = useMemo(() => geoPath(projection), [projection]);
  const globeSpherePath = useMemo(() => pathFactory({ type: 'Sphere' } as never) || '', [pathFactory]);
  const globeGraticulePath = useMemo(() => pathFactory(geoGraticule10() as never) || '', [pathFactory]);

  const landPaths = useMemo(
    () =>
      (world?.features || [])
        .map((feature, index) => ({
          id: String(feature.id || feature.properties?.name || index),
          name: feature.properties?.name || 'Unknown',
          d: pathFactory(feature as never) || '',
        }))
        .filter((feature) => feature.d),
    [world, pathFactory]
  );

  const visibleCountries = useMemo(
    () =>
      countries
        .map((row) => ({ row, point: projectToGlobe(row.lat, row.lon, rotationLon) }))
        .filter((item) => item.point.visible)
        .sort((a, b) => getCountryWindowMetrics(a.row, window).published - getCountryWindowMetrics(b.row, window).published),
    [countries, rotationLon, window]
  );

  const flowPaths = useMemo(() => {
    const candidates = [...visibleCountries]
      .sort((a, b) => getCountryWindowMetrics(b.row, window).published - getCountryWindowMetrics(a.row, window).published)
      .slice(0, 10);
    const pairs = new Map<string, { d: string; width: number; opacity: number }>();

    for (let index = 0; index < candidates.length; index += 1) {
      const current = candidates[index];
      const neighbors = candidates
        .filter((_, neighborIndex) => neighborIndex !== index)
        .map((neighbor) => ({
          neighbor,
          distance: Math.hypot(current.point.x - neighbor.point.x, current.point.y - neighbor.point.y),
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 2);

      for (const { neighbor, distance } of neighbors) {
        const key = [current.row.country, neighbor.row.country].sort().join('::');
        if (!pairs.has(key)) {
          const weight = Math.min(
            getCountryWindowMetrics(current.row, window).published,
            getCountryWindowMetrics(neighbor.row, window).published
          );
          pairs.set(key, {
            d: buildFlowPath(current.point, neighbor.point),
            width: round(Math.max(1.1, Math.min(2.8, Math.sqrt(weight) / 24)), 2),
            opacity: round(Math.max(0.16, 0.34 - distance / 1600), 2),
          });
        }
      }
    }

    return [...pairs.values()];
  }, [visibleCountries, window]);

  const labelCandidates = useMemo(() => {
    return buildNonOverlappingLabels(
      [...visibleCountries]
        .sort((a, b) => getCountryWindowMetrics(b.row, window).published - getCountryWindowMetrics(a.row, window).published)
        .slice(0, 14)
        .map(({ row, point }) => ({
          row,
          point,
          x: round(point.x + (point.x >= GLOBE_CENTER_X ? 16 : -16), 2),
          y: round(point.y - 12, 2),
          anchor: (point.x >= GLOBE_CENTER_X ? 'start' : 'end') as 'start' | 'end',
        })),
      68
    );
  }, [visibleCountries, window]);

  return (
    <svg
      viewBox={`0 0 ${GLOBE_WIDTH} ${GLOBE_HEIGHT}`}
      className={`map-svg-stage ${publisherFocused ? 'map-svg-stage--publisher-focus' : 'map-svg-stage--globe-default'}`}
      role="img"
      aria-label="Global publishing globe"
    >
      <defs>
        <radialGradient id="globe-ocean-fill" cx="34%" cy="28%" r="76%">
          <stop offset="0%" stopColor="#173e73" />
          <stop offset="48%" stopColor="#0a1d39" />
          <stop offset="100%" stopColor="#050913" />
        </radialGradient>
        <linearGradient id="land-fill" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#16324d" />
          <stop offset="60%" stopColor="#0b1d31" />
          <stop offset="100%" stopColor="#08121d" />
        </linearGradient>
        <radialGradient id="globe-aura-fill" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(108,229,255,0.16)" />
          <stop offset="65%" stopColor="rgba(108,229,255,0.06)" />
          <stop offset="100%" stopColor="rgba(108,229,255,0)" />
        </radialGradient>
        <filter id="bubble-glow" x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="9" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect x="0" y="0" width={GLOBE_WIDTH} height={GLOBE_HEIGHT} fill="#040812" />

      {STAR_FIELD.map((star, index) => (
        <circle key={index} cx={star.x} cy={star.y} r={star.r} fill={`rgba(188,236,255,${star.opacity})`} />
      ))}

      <ellipse
        cx={GLOBE_CENTER_X}
        cy={GLOBE_CENTER_Y + GLOBE_RADIUS + 76}
        rx={GLOBE_RADIUS * 0.84}
        ry={70}
        fill="rgba(4, 10, 24, 0.82)"
      />

      {layers.glow ? (
        <path
          d={globeSpherePath}
          fill="url(#globe-aura-fill)"
          transform="scale(1.08)"
          style={{ transformOrigin: `${GLOBE_CENTER_X}px ${GLOBE_CENTER_Y}px` }}
        />
      ) : null}
      <path d={globeSpherePath} fill="url(#globe-ocean-fill)" />

      {layers.glow ? (
        <ellipse
          cx={GLOBE_CENTER_X - 160}
          cy={GLOBE_CENTER_Y - 148}
          rx={GLOBE_RADIUS * 0.56}
          ry={140}
          fill="rgba(156, 224, 255, 0.08)"
          transform={`rotate(-18 ${GLOBE_CENTER_X - 160} ${GLOBE_CENTER_Y - 148})`}
        />
      ) : null}

      {layers.graticule ? (
        <path d={globeGraticulePath} fill="none" stroke="rgba(112, 201, 255, 0.11)" strokeWidth="1.1" />
      ) : null}

      {layers.land ? (
        <>
          {layers.glow
            ? landPaths.map((feature) => (
                <path
                  key={`${feature.id}-glow`}
                  d={feature.d}
                  fill="none"
                  stroke="rgba(88, 204, 255, 0.12)"
                  strokeWidth="3.6"
                />
              ))
            : null}
          {landPaths.map((feature) => (
            <path key={feature.id} d={feature.d} fill="url(#land-fill)" stroke="rgba(135, 228, 255, 0.12)" strokeWidth="0.9">
              <title>{feature.name}</title>
            </path>
          ))}
        </>
      ) : null}

      <path d={globeSpherePath} fill="none" stroke="rgba(146, 232, 255, 0.16)" strokeWidth="1.4" />
      {layers.glow ? (
        <path
          d={globeSpherePath}
          fill="none"
          stroke="rgba(47, 159, 255, 0.12)"
          strokeWidth="12"
          strokeLinecap="round"
          opacity="0.26"
        />
      ) : null}

      {layers.flows
        ? flowPaths.map((flow, index) => (
            <path
              key={`flow-${index}`}
              d={flow.d}
              fill="none"
              stroke="rgba(99, 220, 255, 0.18)"
              strokeWidth={flow.width}
              opacity={flow.opacity}
              strokeLinecap="round"
            />
          ))
        : null}

      {visibleCountries.map(({ row, point }) => {
        const windowMetrics = getCountryWindowMetrics(row, window);
        const radius = Math.max(4, Math.min(18, Math.sqrt(windowMetrics.published) / 3.8));
        const hitRadius = Math.max(18, radius * 2.4);
        const color = getCountryBubbleColor(row, mapMode, window);
        const active = selectedCountry === row.country;
        return (
          <g
            key={row.country}
            className="map-hit-dot"
            role="button"
            tabIndex={0}
            aria-label={`Focus ${row.country}`}
            onClick={() => onSelectCountry(row)}
            onKeyDown={(event) => handleKeyboardActivate(event, () => onSelectCountry(row))}
          >
            <circle
              cx={point.x}
              cy={point.y}
              r={hitRadius}
              fill="transparent"
            />
            {layers.glow ? (
              <circle cx={point.x} cy={point.y} r={radius * 2.6} fill={color} opacity={0.05} filter="url(#bubble-glow)" />
            ) : null}
            <circle cx={point.x} cy={point.y} r={radius * 1.42} fill={color} opacity={layers.glow ? 0.14 : 0.08} />
            <circle
              cx={point.x}
              cy={point.y}
              r={radius}
              fill={color}
              stroke={active ? '#ffffff' : 'rgba(236,248,255,0.86)'}
              strokeWidth={active ? 2.2 : 1}
            >
              <title>{`${row.country}\n${formatNumber(windowMetrics.published)} / ${mapWindowDescriptor(window)}\n${formatNumber(windowMetrics.activeSources)} active sources`}</title>
            </circle>
            <circle cx={point.x} cy={point.y} r={Math.max(1.4, radius * 0.28)} fill="#ffffff" opacity={0.72} />
          </g>
        );
      })}

      {layers.labels
        ? labelCandidates.map(({ row, point, x, y, anchor }) => (
            <g
              key={`${row.country}-label`}
              className="map-hit-dot"
              role="button"
              tabIndex={0}
              aria-label={`Focus ${row.country}`}
              onClick={() => onSelectCountry(row)}
              onKeyDown={(event) => handleKeyboardActivate(event, () => onSelectCountry(row))}
            >
              <line
                x1={point.x}
                y1={point.y}
                x2={anchor === 'start' ? x - 6 : x + 6}
                y2={y - 5}
                stroke="rgba(170, 232, 255, 0.3)"
                strokeWidth="1"
              />
              <text x={x} y={y} textAnchor={anchor} className="map-country-label">
                {row.country}
              </text>
            </g>
          ))
        : null}
    </svg>
  );
}
