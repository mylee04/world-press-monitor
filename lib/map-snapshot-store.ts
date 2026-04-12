import { Pool } from 'pg';
import { resolveDatabaseUrl } from '@/lib/database-url';
import { DEFAULT_MAP_WINDOW, normalizeMapMetricWindow } from '@/lib/map-store-windows';
import type {
  MapCountryMetricsResponse,
  MapCountrySourcesResponse,
  MapMetricWindow,
  MapPublishersResponse,
} from '@/lib/map-types';

type SnapshotKind = 'countries' | 'publishers';

type SnapshotRow = {
  generated_at: string;
  payload: unknown;
};

const DEFAULT_MAP_SNAPSHOT_VERSION = 'v1';

let pool: Pool | null = null;
let schemaReady = false;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: resolveDatabaseUrl(),
    });
  }
  return pool;
}

export async function closeMapSnapshotStorePool(): Promise<void> {
  schemaReady = false;
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end().catch(() => undefined);
}

async function ensureMapSnapshotSchema(): Promise<void> {
  if (schemaReady) return;
  const db = getPool();
  await db.query(`
    create table if not exists map_country_metrics_snapshots (
      metric_window text not null,
      metric_version text not null default 'v1',
      generated_at timestamptz not null,
      payload jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (metric_window, metric_version)
    );
    create index if not exists idx_map_country_metrics_snapshots_generated_at
      on map_country_metrics_snapshots(generated_at desc);

    create table if not exists map_publishers_snapshots (
      metric_window text not null,
      metric_version text not null default 'v1',
      generated_at timestamptz not null,
      payload jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (metric_window, metric_version)
    );
    create index if not exists idx_map_publishers_snapshots_generated_at
      on map_publishers_snapshots(generated_at desc);

    create table if not exists map_country_sources_snapshots (
      country text not null,
      metric_window text not null,
      metric_version text not null default 'v1',
      generated_at timestamptz not null,
      payload jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (country, metric_window, metric_version)
    );
    create index if not exists idx_map_country_sources_snapshots_generated_at
      on map_country_sources_snapshots(generated_at desc);
  `);
  schemaReady = true;
}

function getSnapshotTable(kind: SnapshotKind): string {
  return kind === 'countries' ? 'map_country_metrics_snapshots' : 'map_publishers_snapshots';
}

function normalizeSnapshotPayload<T extends { window: MapMetricWindow; generatedAt: string; storage: 'postgres' | 'snapshot' }>(
  payload: unknown,
  generatedAt: string
): T | null {
  try {
    const parsed = (typeof payload === 'string' ? JSON.parse(payload) : payload) as T | null;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      ...parsed,
      generatedAt,
      storage: 'snapshot',
    };
  } catch {
    return null;
  }
}

function normalizeCountrySourcesSnapshotPayload(
  payload: unknown,
  generatedAt: string
): MapCountrySourcesResponse | null {
  try {
    const parsed = (typeof payload === 'string' ? JSON.parse(payload) : payload) as MapCountrySourcesResponse | null;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      ...parsed,
      generatedAt,
    };
  } catch {
    return null;
  }
}

async function readSnapshot<T extends { window: MapMetricWindow; generatedAt: string; storage: 'postgres' | 'snapshot' }>(
  kind: SnapshotKind,
  window: MapMetricWindow = DEFAULT_MAP_WINDOW,
  metricVersion = DEFAULT_MAP_SNAPSHOT_VERSION
): Promise<T | null> {
  await ensureMapSnapshotSchema();
  const selectedWindow = normalizeMapMetricWindow(window);
  const result = await getPool().query<SnapshotRow>(
    `
    select generated_at::text, payload
    from ${getSnapshotTable(kind)}
    where metric_window = $1
      and metric_version = $2
    limit 1
    `,
    [selectedWindow, metricVersion],
  );
  const row = result.rows[0];
  if (!row) return null;
  return normalizeSnapshotPayload<T>(row.payload, row.generated_at);
}

async function writeSnapshot<T extends { window: MapMetricWindow; generatedAt: string }>(
  kind: SnapshotKind,
  payload: T,
  metricVersion = DEFAULT_MAP_SNAPSHOT_VERSION
): Promise<void> {
  await ensureMapSnapshotSchema();
  const selectedWindow = normalizeMapMetricWindow(payload.window);
  await getPool().query(
    `
    insert into ${getSnapshotTable(kind)} (
      metric_window,
      metric_version,
      generated_at,
      payload
    )
    values ($1, $2, $3::timestamptz, $4::jsonb)
    on conflict (metric_window, metric_version)
    do update set
      generated_at = excluded.generated_at,
      payload = excluded.payload,
      updated_at = now()
    `,
    [selectedWindow, metricVersion, payload.generatedAt, JSON.stringify(payload)],
  );
}

export async function readMapCountryMetricsSnapshot(
  window: MapMetricWindow = DEFAULT_MAP_WINDOW,
  metricVersion = DEFAULT_MAP_SNAPSHOT_VERSION
): Promise<MapCountryMetricsResponse | null> {
  return readSnapshot<MapCountryMetricsResponse>('countries', window, metricVersion);
}

export async function readMapPublishersSnapshot(
  window: MapMetricWindow = DEFAULT_MAP_WINDOW,
  metricVersion = DEFAULT_MAP_SNAPSHOT_VERSION
): Promise<MapPublishersResponse | null> {
  return readSnapshot<MapPublishersResponse>('publishers', window, metricVersion);
}

export async function writeMapCountryMetricsSnapshot(
  payload: MapCountryMetricsResponse,
  metricVersion = DEFAULT_MAP_SNAPSHOT_VERSION
): Promise<void> {
  await writeSnapshot('countries', payload, metricVersion);
}

export async function writeMapPublishersSnapshot(
  payload: MapPublishersResponse,
  metricVersion = DEFAULT_MAP_SNAPSHOT_VERSION
): Promise<void> {
  await writeSnapshot('publishers', payload, metricVersion);
}

export async function readMapCountrySourcesSnapshot(
  country: string,
  window: MapMetricWindow = DEFAULT_MAP_WINDOW,
  metricVersion = DEFAULT_MAP_SNAPSHOT_VERSION
): Promise<MapCountrySourcesResponse | null> {
  await ensureMapSnapshotSchema();
  const selectedWindow = normalizeMapMetricWindow(window);
  const normalizedCountry = country.trim();
  const result = await getPool().query<SnapshotRow>(
    `
    select generated_at::text, payload
    from map_country_sources_snapshots
    where country = $1
      and metric_window = $2
      and metric_version = $3
    limit 1
    `,
    [normalizedCountry, selectedWindow, metricVersion],
  );
  const row = result.rows[0];
  if (!row) return null;
  return normalizeCountrySourcesSnapshotPayload(row.payload, row.generated_at);
}

export async function writeMapCountrySourcesSnapshot(
  payload: MapCountrySourcesResponse,
  metricVersion = DEFAULT_MAP_SNAPSHOT_VERSION
): Promise<void> {
  await ensureMapSnapshotSchema();
  const selectedWindow = normalizeMapMetricWindow(payload.window);
  const normalizedCountry = payload.country.trim();
  await getPool().query(
    `
    insert into map_country_sources_snapshots (
      country,
      metric_window,
      metric_version,
      generated_at,
      payload
    )
    values ($1, $2, $3, $4::timestamptz, $5::jsonb)
    on conflict (country, metric_window, metric_version)
    do update set
      generated_at = excluded.generated_at,
      payload = excluded.payload,
      updated_at = now()
    `,
    [normalizedCountry, selectedWindow, metricVersion, payload.generatedAt, JSON.stringify(payload)],
  );
}
