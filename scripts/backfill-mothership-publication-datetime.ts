#!/usr/bin/env bun

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { runWithConcurrency } from '@/lib/concurrency';
import { resolveDatabaseUrl } from '@/lib/database-url';

type CandidateRow = {
  external_id: string;
  url: string;
  publication_datetime: string;
  created_at: string;
};

type BackfillResult = {
  externalId: string;
  url: string;
  createdAt: string;
  currentPublicationDatetime: string;
  publicationDatetime: string | null;
  error: string | null;
};

const DEFAULT_DAYS = 7;
const DEFAULT_CONCURRENCY = 4;
const SOURCE = 'Mothership';
const JINA_PREFIX = 'https://r.jina.ai/http://';
const PAGE_FETCH_TIMEOUT_MS = 30_000;
const ARTICLE_PUBLISHED_TIME_PATTERN = /^Published Time:\s*(.+)$/m;
const ARTICLE_TIME_PATTERN = /^### ([A-Z][a-z]+ \d{1,2}, \d{4}, \d{2}:\d{2} (?:AM|PM))$/m;
const CREATED_AT_FUTURE_TOLERANCE_MS = 30 * 60 * 1000;
const execFileAsync = promisify(execFile);

function parseIntArg(flag: string, fallback: number, min: number, max: number): number {
  const token = process.argv.find((value) => value.startsWith(`${flag}=`));
  const parsed = Number.parseInt(token?.slice(flag.length + 1) || '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function toJinaUrl(articleUrl: string): string {
  return `${JINA_PREFIX}${articleUrl}`;
}

function parseArticleDatetime(markdown: string): string | null {
  const publishedTimeMatch = markdown.match(ARTICLE_PUBLISHED_TIME_PATTERN);
  if (publishedTimeMatch) {
    const publishedTimeTs = new Date(publishedTimeMatch[1].trim()).getTime();
    if (Number.isFinite(publishedTimeTs)) {
      return new Date(publishedTimeTs).toISOString();
    }
  }

  const match = markdown.match(ARTICLE_TIME_PATTERN);
  if (!match) return null;
  const ts = new Date(`${match[1]} GMT+0800`).getTime();
  if (!Number.isFinite(ts)) return null;
  return new Date(ts).toISOString();
}

async function fetchPublishedAt(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { stdout } = await execFileAsync(
        'curl',
        [
          '-sS',
          '--retry',
          '2',
          '--retry-delay',
          '1',
          '--max-time',
          String(Math.ceil(PAGE_FETCH_TIMEOUT_MS / 1000)),
          toJinaUrl(url),
        ],
        {
          maxBuffer: 8 * 1024 * 1024,
        }
      );
      const body = stdout || '';
      const publishedAt = parseArticleDatetime(body);
      if (publishedAt) return publishedAt;
      if (attempt === 1) return null;
    } catch {
      if (attempt === 1) return null;
    }
  }
  return null;
}

async function loadCandidates(pool: Pool, days: number): Promise<CandidateRow[]> {
  const result = await pool.query<CandidateRow>(
    `
    select
      external_id,
      url,
      publication_datetime,
      created_at
    from news_articles
    where source = $1
      and created_at >= now() - ($2::int * interval '1 day')
    order by created_at asc
    `,
    [SOURCE, days]
  );
  return result.rows;
}

async function applyUpdates(
  pool: Pool,
  updates: Array<{ externalId: string; publicationDatetime: string }>
): Promise<number> {
  let updated = 0;
  for (let index = 0; index < updates.length; index += 200) {
    const chunk = updates.slice(index, index + 200);
    const values: unknown[] = [];
    const parts = chunk.map((row, chunkIndex) => {
      const base = chunkIndex * 2;
      values.push(row.externalId, row.publicationDatetime);
      return `($${base + 1}::text, $${base + 2}::timestamptz)`;
    });
    const result = await pool.query(
      `
      update news_articles as n
      set publication_datetime = data.publication_datetime,
          updated_at = now()
      from (values ${parts.join(',')}) as data(external_id, publication_datetime)
      where n.external_id = data.external_id
        and n.publication_datetime is distinct from data.publication_datetime
      `,
      values
    );
    updated += result.rowCount || 0;
  }
  return updated;
}

async function main(): Promise<void> {
  const databaseUrl = resolveDatabaseUrl();
  const apply = hasFlag('--apply');
  const days = parseIntArg('--days', DEFAULT_DAYS, 1, 30);
  const concurrency = parseIntArg('--concurrency', DEFAULT_CONCURRENCY, 1, 12);
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const rows = await loadCandidates(pool, days);
    let processed = 0;

    const results = await runWithConcurrency(rows, concurrency, async (row): Promise<BackfillResult> => {
      const publicationDatetime = await fetchPublishedAt(row.url);
      processed += 1;
      if (processed % 10 === 0 || processed === rows.length) {
        console.log(`[backfill-mothership-publication-datetime] processed ${processed}/${rows.length}`);
      }

      if (!publicationDatetime) {
        return {
          externalId: row.external_id,
          url: row.url,
          createdAt: row.created_at,
          currentPublicationDatetime: row.publication_datetime,
          publicationDatetime: null,
          error: 'published_time_not_found',
        };
      }

      const createdAtTs = new Date(row.created_at).getTime();
      const publicationTs = new Date(publicationDatetime).getTime();
      if (Number.isFinite(createdAtTs) && Number.isFinite(publicationTs) && publicationTs > createdAtTs + CREATED_AT_FUTURE_TOLERANCE_MS) {
        return {
          externalId: row.external_id,
          url: row.url,
          createdAt: row.created_at,
          currentPublicationDatetime: row.publication_datetime,
          publicationDatetime: null,
          error: 'publication_after_created_at',
        };
      }

      return {
        externalId: row.external_id,
        url: row.url,
        createdAt: row.created_at,
        currentPublicationDatetime: row.publication_datetime,
        publicationDatetime,
        error: null,
      };
    });

    const successful = results.filter((row) => row.publicationDatetime && !row.error);
    const updates = successful
      .filter((row) => row.publicationDatetime !== row.currentPublicationDatetime)
      .map((row) => ({
        externalId: row.externalId,
        publicationDatetime: row.publicationDatetime!,
      }));
    const failed = results.filter((row) => row.error);
    const nowTs = Date.now();
    const window72hStart = nowTs - 72 * 60 * 60 * 1000;
    const updates72h = successful.filter((row) => new Date(row.createdAt).getTime() >= window72hStart).length;

    const updated = apply ? await applyUpdates(pool, updates) : 0;

    console.log(JSON.stringify({
      source: SOURCE,
      apply,
      days,
      scanned: rows.length,
      parsed: successful.length,
      failed: failed.length,
      updatesPlanned: updates.length,
      updatesApplied: updated,
      updated72h: updates72h,
      updated7d: updates.length,
      sampleFailures: failed.slice(0, 10).map((row) => ({
        url: row.url,
        error: row.error,
      })),
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(
    '[backfill-mothership-publication-datetime] failed:',
    error instanceof Error ? error.message : String(error)
  );
  process.exit(1);
});
