import type { Pool } from 'pg';

export type FeedWatermark = {
  outletId: string;
  source: string;
  country: string;
  method: 'rss' | 'sitemap';
  lastPublicationAt: string | null;
};

type FeedWatermarkDbRow = {
  outlet_id: string;
  source: string;
  country: string;
  method: string;
  last_publication_at: string | null;
};

type FeedWatermarkDeps = {
  getPool: () => Pool | null;
  ensureSchema: () => Promise<void>;
  executeIngestionQuery: (
    db: Pool,
    queryText: string,
    values: unknown[],
    label: string
  ) => Promise<void>;
};

const INGEST_FEED_WATERMARKS_TABLE = 'ingest_feed_watermarks_v2';

function getFeedWatermarkKey(outletId: string, method: 'rss' | 'sitemap'): string {
  return `${outletId}:${method}`;
}

function isRecoverableIngestionStateError(error: unknown, relationNames: string[]): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('pg_toast_2619')
    || message.includes('pg_statistic')
    || message.includes('missing chunk number')
    || relationNames.some((name) => message.includes(name))
  );
}

function isRecoverableFeedWatermarkError(error: unknown): boolean {
  return isRecoverableIngestionStateError(error, ['ingest_feed_watermarks', INGEST_FEED_WATERMARKS_TABLE]);
}

export async function readIngestionFeedWatermarksWithDeps(
  deps: FeedWatermarkDeps,
  rows: Array<{ outletId: string; method: 'rss' | 'sitemap' }>
): Promise<Map<string, string | null>> {
  const db = deps.getPool();
  if (!db) return new Map();
  if (!rows.length) return new Map();
  await deps.ensureSchema();

  const unique = new Map<string, { outletId: string; method: 'rss' | 'sitemap' }>();
  for (const row of rows) {
    if (!row.outletId) continue;
    unique.set(getFeedWatermarkKey(row.outletId, row.method), row);
  }
  const requests = [...unique.values()];
  if (!requests.length) return new Map();

  const values: string[] = [];
  const placeholders = requests
    .map((request, index) => {
      const base = index * 2;
      values.push(request.outletId);
      values.push(request.method);
      return `($${base + 1}, $${base + 2})`;
    })
    .join(', ');
  const map = new Map<string, string | null>();
  for (const request of requests) {
    map.set(getFeedWatermarkKey(request.outletId, request.method), null);
  }

  try {
    const result = await db.query<FeedWatermarkDbRow>(
      `
      with requested(outlet_id, method) as (
        values ${placeholders}
      )
      select
        r.outlet_id,
        r.method,
        w.source,
        w.country,
        w.last_publication_at
      from requested r
      left join ingest_feed_watermarks_v2 w
        on w.outlet_id = r.outlet_id
        and w.method = r.method
      `,
      values
    );

    for (const row of result.rows) {
      map.set(getFeedWatermarkKey(row.outlet_id, row.method as 'rss' | 'sitemap'), row.last_publication_at || null);
    }
  } catch (error) {
    if (!isRecoverableFeedWatermarkError(error)) throw error;
    console.warn('[ingestion-store] skipping feed watermark reads due to recoverable catalog error:', error instanceof Error ? error.message : String(error));
  }
  return map;
}

export async function upsertIngestionFeedWatermarksWithDeps(
  deps: FeedWatermarkDeps,
  rows: FeedWatermark[]
): Promise<void> {
  const db = deps.getPool();
  if (!db || !rows.length) return;
  await deps.ensureSchema();

  const deduped = new Map<string, FeedWatermark>();
  for (const row of rows) {
    if (!row.outletId || !row.method) continue;
    const key = getFeedWatermarkKey(row.outletId, row.method);
    const current = deduped.get(key);
    if (!current || (row.lastPublicationAt && (!current.lastPublicationAt || row.lastPublicationAt > current.lastPublicationAt))) {
      deduped.set(key, row);
    }
  }

  const values: unknown[] = [];
  const parts: string[] = [];
  [...deduped.values()].forEach((row, index) => {
    const base = index * 5;
    parts.push(
      `($${base + 1}::text,$${base + 2}::text,$${base + 3}::text,$${base + 4}::text,$${base + 5}::timestamptz,now(),now())`
    );
    values.push(
      row.outletId,
      row.source,
      row.country,
      row.method,
      row.lastPublicationAt
    );
  });

  if (!parts.length) return;

  try {
    await deps.executeIngestionQuery(
      db,
      `
      insert into ingest_feed_watermarks_v2 (
        outlet_id, source, country, method, last_publication_at, last_fetched_at, updated_at
      ) values ${parts.join(',')}
      on conflict (outlet_id, method) do update set
        source = excluded.source,
        country = excluded.country,
        last_publication_at = case
          when ingest_feed_watermarks_v2.last_publication_at is null then excluded.last_publication_at
          when excluded.last_publication_at is null then ingest_feed_watermarks_v2.last_publication_at
          when excluded.last_publication_at > ingest_feed_watermarks_v2.last_publication_at then excluded.last_publication_at
          else ingest_feed_watermarks_v2.last_publication_at
        end,
        last_fetched_at = excluded.last_fetched_at,
        updated_at = now()
      `,
      values,
      'upsertIngestionFeedWatermarks'
    );
  } catch (error) {
    if (!isRecoverableFeedWatermarkError(error)) throw error;
    console.warn('[ingestion-store] skipping feed watermark writes due to recoverable catalog error:', error instanceof Error ? error.message : String(error));
  }
}
