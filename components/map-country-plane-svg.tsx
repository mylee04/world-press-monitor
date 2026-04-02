'use client';

import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import { formatNumber, getSourceWindowMetrics, mapWindowDescriptor } from '@/lib/map-display';
import type { MapCountryMetricRow, MapMetricWindow, MapSourceMetricRow } from '@/lib/map-types';
import type { MapLayerState } from '@/lib/map-view-state';
import {
  buildCountrySourceClusters,
  buildNonOverlappingLabels,
  buildSyntheticCountryFeature,
  clamp,
  COUNTRY_ZOOM_MAX,
  COUNTRY_ZOOM_MIN,
  COUNTRY_ZOOM_STEP,
  findWorldFeature,
  getClusterWindowPublished,
  getHealthColor,
  GLOBE_HEIGHT,
  GLOBE_WIDTH,
  projectCountryToPlane,
  round,
  sameCountryViewport,
  selectDisplayFeature,
  type CountrySafeInsets,
  type CountrySourceCluster,
  type CountryViewport,
  type WorldGeoJson,
} from '@/components/map-stage-utils';

type CountryPlaneSvgProps = {
  country: MapCountryMetricRow;
  world: WorldGeoJson | null;
  sources: MapSourceMetricRow[];
  window: MapMetricWindow;
  layers: MapLayerState;
  viewport: CountryViewport;
  safeInsets: CountrySafeInsets;
  onViewportChange: (viewport: CountryViewport) => void;
  selectedClusterId: string | null;
  selectedSourceId: string | null;
  onSelectCluster: (cluster: CountrySourceCluster) => void;
};

function handleKeyboardActivate(event: ReactKeyboardEvent<SVGGElement>, onActivate: () => void) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  onActivate();
}

export function CountryPlaneSvg({
  country,
  world,
  sources,
  window,
  layers,
  viewport,
  safeInsets,
  onViewportChange,
  selectedClusterId,
  selectedSourceId,
  onSelectCluster,
}: CountryPlaneSvgProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    startTx: number;
    startTy: number;
    moved: boolean;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    startTx: 0,
    startTy: 0,
    moved: false,
  });
  const suppressClickUntilRef = useRef(0);
  const countryFeature = useMemo(() => findWorldFeature(world, country.country), [world, country.country]);
  const displayCountryFeature = useMemo(() => {
    const selected = selectDisplayFeature(countryFeature, sources);
    if (selected) return selected;
    return buildSyntheticCountryFeature(sources);
  }, [countryFeature, sources]);

  const projection = useMemo(() => {
    if (!displayCountryFeature) return null;
    return geoMercator().fitExtent(
      [
        [safeInsets.left + 36, safeInsets.top + 42],
        [GLOBE_WIDTH - safeInsets.right - 44, GLOBE_HEIGHT - safeInsets.bottom - 52],
      ],
      displayCountryFeature as never
    );
  }, [displayCountryFeature, safeInsets]);

  const pathFactory = useMemo(() => (projection ? geoPath(projection) : null), [projection]);
  const countryPath = useMemo(
    () => (pathFactory && displayCountryFeature ? pathFactory(displayCountryFeature as never) || '' : ''),
    [pathFactory, displayCountryFeature]
  );
  const projectedCountryBounds = useMemo(() => {
    if (!pathFactory || !displayCountryFeature) return null;
    return pathFactory.bounds(displayCountryFeature as never);
  }, [pathFactory, displayCountryFeature]);

  const bounds = useMemo(() => {
    const lats = sources.map((source) => source.lat);
    const lons = sources.map((source) => source.lon);
    return {
      minLat: Math.min(...lats, 0) - 0.6,
      maxLat: Math.max(...lats, 0) + 0.6,
      minLon: Math.min(...lons, 0) - 0.8,
      maxLon: Math.max(...lons, 0) + 0.8,
    };
  }, [sources]);

  const projected = useMemo(
    () =>
      sources
        .map((source) => {
          if (projection) {
            const point = projection([source.lon, source.lat]);
            if (!point) return null;
            return {
              source,
              point: {
                x: round(point[0], 2),
                y: round(point[1], 2),
              },
            };
          }
          return {
            source,
            point: projectCountryToPlane(source, bounds),
          };
        })
        .filter((item): item is { source: MapSourceMetricRow; point: { x: number; y: number } } => Boolean(item)),
    [sources, projection, bounds]
  );

  const clusters = useMemo(() => buildCountrySourceClusters(projected, window), [projected, window]);

  const clusterLabels = useMemo(() => {
    return buildNonOverlappingLabels(
      [...clusters]
        .sort((a, b) => getClusterWindowPublished(b, window) - getClusterWindowPublished(a, window))
        .slice(0, 8)
        .map((cluster) => ({
          cluster,
          point: cluster.point,
          x: round(cluster.point.x + 12, 2),
          y: round(cluster.point.y - 10, 2),
        })),
      76
    );
  }, [clusters, window]);

  const contentBounds = useMemo(() => {
    const fallback = {
      minX: safeInsets.left + 36,
      maxX: GLOBE_WIDTH - safeInsets.right - 36,
      minY: safeInsets.top + 36,
      maxY: GLOBE_HEIGHT - safeInsets.bottom - 36,
    };

    const xs = clusters.map((cluster) => cluster.point.x);
    const ys = clusters.map((cluster) => cluster.point.y);

    if (projectedCountryBounds) {
      xs.push(projectedCountryBounds[0][0], projectedCountryBounds[1][0]);
      ys.push(projectedCountryBounds[0][1], projectedCountryBounds[1][1]);
    }

    if (xs.length === 0 || ys.length === 0) {
      return fallback;
    }

    return {
      minX: Math.min(...xs) - 56,
      maxX: Math.max(...xs) + 56,
      minY: Math.min(...ys) - 56,
      maxY: Math.max(...ys) + 56,
    };
  }, [clusters, projectedCountryBounds, safeInsets]);

  function clampViewport(next: CountryViewport): CountryViewport {
    const frameLeft = safeInsets.left;
    const frameTop = safeInsets.top;
    const frameWidth = GLOBE_WIDTH - safeInsets.left - safeInsets.right;
    const frameHeight = GLOBE_HEIGHT - safeInsets.top - safeInsets.bottom;
    const contentWidth = contentBounds.maxX - contentBounds.minX;
    const contentHeight = contentBounds.maxY - contentBounds.minY;
    const scale = clamp(next.scale, COUNTRY_ZOOM_MIN, COUNTRY_ZOOM_MAX);

    let tx = next.tx;
    let ty = next.ty;

    if (contentWidth * scale <= frameWidth) {
      tx = frameLeft + (frameWidth - contentWidth * scale) / 2 - contentBounds.minX * scale;
    } else {
      const minTx = frameLeft + frameWidth - contentBounds.maxX * scale;
      const maxTx = frameLeft - contentBounds.minX * scale;
      tx = clamp(tx, minTx, maxTx);
    }

    if (contentHeight * scale <= frameHeight) {
      ty = frameTop + (frameHeight - contentHeight * scale) / 2 - contentBounds.minY * scale;
    } else {
      const minTy = frameTop + frameHeight - contentBounds.maxY * scale;
      const maxTy = frameTop - contentBounds.minY * scale;
      ty = clamp(ty, minTy, maxTy);
    }

    return {
      scale: round(scale, 4),
      tx: round(tx, 2),
      ty: round(ty, 2),
    };
  }

  useEffect(() => {
    const clamped = clampViewport(viewport);
    if (sameCountryViewport(clamped, viewport)) return;
    onViewportChange(clamped);
  }, [viewport, safeInsets, contentBounds, onViewportChange]);

  function applyViewport(next: CountryViewport) {
    onViewportChange(clampViewport(next));
  }

  function handleWheel(event: ReactWheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * GLOBE_WIDTH;
    const py = ((event.clientY - rect.top) / rect.height) * GLOBE_HEIGHT;
    const factor = event.deltaY < 0 ? COUNTRY_ZOOM_STEP : 1 / COUNTRY_ZOOM_STEP;
    const nextScale = clamp(viewport.scale * factor, COUNTRY_ZOOM_MIN, COUNTRY_ZOOM_MAX);
    if (Math.abs(nextScale - viewport.scale) < 0.0001) return;

    const worldX = (px - viewport.tx) / viewport.scale;
    const worldY = (py - viewport.ty) / viewport.scale;
    applyViewport({
      scale: nextScale,
      tx: px - worldX * nextScale,
      ty: py - worldY * nextScale,
    });
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (viewport.scale <= 1.001 || event.button !== 0) return;
    dragStateRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      startTx: viewport.tx,
      startTy: viewport.ty,
      moved: false,
    };
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragStateRef.current;
    if (!drag.active) return;
    const svg = svgRef.current;
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const dx = ((event.clientX - drag.startX) / rect.width) * GLOBE_WIDTH;
    const dy = ((event.clientY - drag.startY) / rect.height) * GLOBE_HEIGHT;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      drag.moved = true;
      suppressClickUntilRef.current = Date.now() + 180;
    }
    applyViewport({
      scale: viewport.scale,
      tx: drag.startTx + dx,
      ty: drag.startTy + dy,
    });
  }

  function endPointerInteraction(event: ReactPointerEvent<SVGSVGElement>) {
    if (dragStateRef.current.active) {
      dragStateRef.current.active = false;
      setIsDragging(false);
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleSelectCluster(cluster: CountrySourceCluster) {
    if (Date.now() < suppressClickUntilRef.current) return;
    onSelectCluster(cluster);
  }

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 1800 1120"
      className={`map-svg-stage map-svg-stage--country ${viewport.scale > 1.001 ? 'is-zoomed' : ''} ${isDragging ? 'is-dragging' : ''}`}
      role="img"
      aria-label={`${country.country} source map`}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPointerInteraction}
      onPointerCancel={endPointerInteraction}
      style={{ touchAction: 'none' }}
    >
      <defs>
        <linearGradient id="plane-fill" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#071120" />
          <stop offset="55%" stopColor="#08101b" />
          <stop offset="100%" stopColor="#050913" />
        </linearGradient>
        <linearGradient id="country-fill" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgba(21, 58, 90, 0.92)" />
          <stop offset="100%" stopColor="rgba(8, 22, 36, 0.9)" />
        </linearGradient>
        <clipPath id="country-map-clip">
          <rect
            x={safeInsets.left}
            y={safeInsets.top}
            width={GLOBE_WIDTH - safeInsets.left - safeInsets.right}
            height={GLOBE_HEIGHT - safeInsets.top - safeInsets.bottom}
            rx="28"
          />
        </clipPath>
      </defs>

      <rect x="0" y="0" width="1800" height="1120" fill="url(#plane-fill)" />

      {layers.graticule ? (
        <g opacity="0.38">
          {Array.from({ length: 9 }).map((_, index) => {
            const span = GLOBE_WIDTH - safeInsets.left - safeInsets.right;
            const x = safeInsets.left + (index * span) / 8;
            return (
              <line
                key={`vx-${index}`}
                x1={x}
                y1={safeInsets.top}
                x2={x}
                y2={GLOBE_HEIGHT - safeInsets.bottom}
                stroke="rgba(102, 196, 255, 0.07)"
                strokeWidth="1"
              />
            );
          })}
          {Array.from({ length: 6 }).map((_, index) => {
            const span = GLOBE_HEIGHT - safeInsets.top - safeInsets.bottom;
            const y = safeInsets.top + (index * span) / 5;
            return (
              <line
                key={`hy-${index}`}
                x1={safeInsets.left}
                y1={y}
                x2={GLOBE_WIDTH - safeInsets.right}
                y2={y}
                stroke="rgba(102, 196, 255, 0.07)"
                strokeWidth="1"
              />
            );
          })}
        </g>
      ) : null}

      <rect
        x={safeInsets.left}
        y={safeInsets.top}
        width={GLOBE_WIDTH - safeInsets.left - safeInsets.right}
        height={GLOBE_HEIGHT - safeInsets.top - safeInsets.bottom}
        rx="28"
        fill="none"
        stroke="rgba(126, 226, 255, 0.12)"
        strokeWidth="1.1"
      />

      <g clipPath="url(#country-map-clip)" transform={`translate(${viewport.tx} ${viewport.ty}) scale(${viewport.scale})`}>
        {layers.land && countryPath ? (
          <>
            {layers.glow ? (
              <path d={countryPath} fill="none" stroke="rgba(88, 204, 255, 0.14)" strokeWidth={6 / viewport.scale} />
            ) : null}
            <path d={countryPath} fill="url(#country-fill)" stroke="rgba(150, 232, 255, 0.22)" strokeWidth={1.3 / viewport.scale} />
          </>
        ) : null}

        {clusters.map((cluster) => {
          const point = cluster.point;
          const radius = Math.max(6, Math.min(22, Math.sqrt(getClusterWindowPublished(cluster, window)) / 2.8 + cluster.sourceCount * 0.8));
          const hitRadius = Math.max(14, radius * 2.1);
          const active = selectedClusterId === cluster.id || cluster.sources.some((source) => source.sourceId === selectedSourceId);
          return (
            <g
              key={cluster.id}
              className="map-hit-dot"
              role="button"
              tabIndex={0}
              aria-label={`Focus ${cluster.name}`}
              onClick={() => handleSelectCluster(cluster)}
              onKeyDown={(event) => handleKeyboardActivate(event, () => handleSelectCluster(cluster))}
            >
              <circle
                cx={point.x}
                cy={point.y}
                r={hitRadius}
                fill="transparent"
              />
              {layers.glow ? (
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={radius * 2.6}
                  fill={getHealthColor(cluster.health)}
                  opacity={0.05}
                  filter="url(#bubble-glow)"
                  pointerEvents="none"
                />
              ) : null}
              <circle
                cx={point.x}
                cy={point.y}
                r={radius * 1.44}
                fill={getHealthColor(cluster.health)}
                opacity={layers.glow ? 0.14 : 0.08}
                pointerEvents="none"
              />
              <circle
                cx={point.x}
                cy={point.y}
                r={radius}
                fill={getHealthColor(cluster.health)}
                stroke={active ? '#ffffff' : 'rgba(239,248,255,0.86)'}
                strokeWidth={active ? 2 / viewport.scale : 0.9 / viewport.scale}
              >
                <title>{`${cluster.name}\n${formatNumber(getClusterWindowPublished(cluster, window))} / ${mapWindowDescriptor(window)}\n${formatNumber(cluster.pub24h)} / 24h\n${cluster.sourceCount} sources`}</title>
              </circle>
              <circle cx={point.x} cy={point.y} r={Math.max(1.1, radius * 0.24)} fill="#ffffff" opacity={0.72} pointerEvents="none" />
              {cluster.sourceCount > 1 ? (
                <text x={point.x} y={point.y + 4} textAnchor="middle" className="map-cluster-count">
                  {cluster.sourceCount}
                </text>
              ) : null}
            </g>
          );
        })}

        {layers.labels
          ? clusterLabels.map(({ cluster, point, x, y }) => (
              <g key={`${cluster.id}-label`} style={{ pointerEvents: 'none' }}>
                <line x1={point.x} y1={point.y} x2={x - 6} y2={y - 4} stroke="rgba(170, 232, 255, 0.24)" strokeWidth={1 / viewport.scale} />
                <text x={x} y={y} className="map-source-label">
                  {cluster.sourceCount > 1 ? `${cluster.name} (${cluster.sourceCount})` : cluster.name}
                </text>
              </g>
            ))
          : null}
      </g>
    </svg>
  );
}
