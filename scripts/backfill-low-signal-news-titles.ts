#!/usr/bin/env bun

import { Pool } from 'pg';
import { runWithConcurrency } from '@/lib/concurrency';
import { fetchWithRetry, readResponseText } from '@/lib/fetch-utils';
import { extractArticlePageTitle } from '@/lib/article-page-title';
import { isKnownNonArticleUrl } from '@/lib/article-url-filters';
import { looksLikeLowSignalArticleTitle, normalizeReadableArticleTitle } from '@/lib/html-entities';

type Row = {
  external_id: string;
  source: string;
  url: string;
  title_original: string;
  publication_datetime: string;
};

type RepairResult = {
  externalId: string;
  source: string;
  url: string;
  previousTitle: string;
  recoveredTitle: string;
};

const DEFAULT_FETCH_TIMEOUT_MS = 12_000;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_ATTEMPTS = 1;
const DEFAULT_USER_AGENT =
  process.env.INGEST_USER_AGENT
  || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
const APPROXIMATE_LOW_SIGNAL_WHERE = `
  (
    coalesce(title_original, '') = ''
    or coalesce(title_original, '') ~ '^[0-9]{6,}$'
    or coalesce(title_original, '') ~ '^[[:lower:][:space:]''’.-]{1,40}$'
    or coalesce(title_original, '') = coalesce(url, '')
    or coalesce(title_original, '') ilike 'http%'
    or coalesce(title_original, '') ~* '^(news|latest|domestic|international|photo|video|full|anime|comic|voiceactor|vest)$'
  )
`;

function parseArgValue(flag: string): string | null {
  const inline = process.argv.find((token) => token.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1).trim() || null;
  const index = process.argv.indexOf(flag);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1].trim() || null;
  return null;
}

function parseIntArg(flag: string, fallback: number, min: number, max: number): number {
  const raw = parseArgValue(flag);
  const parsed = Number.parseInt(raw || '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseCsvArg(flag: string): string[] {
  const raw = parseArgValue(flag);
  if (!raw) return [];
  return raw.split(',').map((value) => value.trim()).filter(Boolean);
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function recoverTitle(row: Row, timeoutMs: number, attempts: number): Promise<RepairResult | null> {
  if (!row.url || isKnownNonArticleUrl(row.source || '', row.url)) {
    return null;
  }
  if (!looksLikeLowSignalArticleTitle(row.title_original || '', row.source || '', row.url || '')) {
    return null;
  }

  try {
    const response = await fetchWithRetry(row.url, {
      timeoutMs,
      attempts,
      fetchOptions: {
        headers: {
          'User-Agent': DEFAULT_USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': process.env.INGEST_ACCEPT_LANGUAGE || 'en-US,en;q=0.9,es;q=0.8,ja;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
        redirect: 'follow',
      },
    });
    if (!response.ok) return null;
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType && !contentType.includes('html') && !contentType.includes('xml')) return null;
    const html = (await readResponseText(response, response.url || row.url)).text;
    const recoveredTitle = normalizeReadableArticleTitle(
      extractArticlePageTitle(html),
      response.url || row.url,
      row.source || ''
    );
    if (!recoveredTitle) return null;
    if (looksLikeLowSignalArticleTitle(recoveredTitle, row.source || '', response.url || row.url)) return null;
    if (recoveredTitle === (row.title_original || '').trim()) return null;
    return {
      externalId: row.external_id,
      source: row.source,
      url: row.url,
      previousTitle: row.title_original,
      recoveredTitle,
    };
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const hours = parseIntArg('--hours', 24 * 31, 1, 24 * 90);
  const limit = parseIntArg('--limit', 1000, 1, 20_000);
  const concurrency = parseIntArg('--concurrency', DEFAULT_CONCURRENCY, 1, 24);
  const timeoutMs = parseIntArg('--timeout-ms', DEFAULT_FETCH_TIMEOUT_MS, 1000, 60_000);
  const attempts = parseIntArg('--attempts', DEFAULT_ATTEMPTS, 1, 5);
  const sourcePrefixes = parseCsvArg('--source-prefix');
  const apply = hasFlag('--apply');
  const db = new Pool({ connectionString: databaseUrl });

  try {
    const whereClauses = [
      `publication_datetime >= now() - ($1::int * interval '1 hour')`,
      `publication_datetime <= now() + interval '30 minutes'`,
      APPROXIMATE_LOW_SIGNAL_WHERE,
    ];
    const values: unknown[] = [hours];
    if (sourcePrefixes.length > 0) {
      values.push(sourcePrefixes.map((prefix) => `${prefix}%`));
      whereClauses.push(`source like any($${values.length}::text[])`);
    }
    values.push(limit);

    const result = await db.query<Row>(
      `
      select external_id, source, url, title_original, publication_datetime
      from news_articles
      where ${whereClauses.join(' and ')}
      order by publication_datetime desc
      limit $${values.length}
      `,
      values
    );

    const candidates = result.rows.filter(
      (row) =>
        !isKnownNonArticleUrl(row.source || '', row.url || '')
        && looksLikeLowSignalArticleTitle(row.title_original || '', row.source || '', row.url || '')
    );

    const repairs = (await runWithConcurrency(candidates, concurrency, (row) => recoverTitle(row, timeoutMs, attempts)))
      .filter((row): row is RepairResult => row !== null);

    if (!apply) {
      console.log(JSON.stringify({
        apply: false,
        hours,
        limit,
        concurrency,
        attempts,
        sourcePrefixes,
        scanned: result.rows.length,
        candidates: candidates.length,
        repairs: repairs.length,
        sample: repairs.slice(0, 20),
      }, null, 2));
      return;
    }

    let updated = 0;
    for (let index = 0; index < repairs.length; index += 1) {
      const row = repairs[index];
      const update = await db.query(
        `
        update news_articles
        set title_original = $2,
            updated_at = now()
        where external_id = $1
        `,
        [row.externalId, row.recoveredTitle]
      );
      updated += update.rowCount || 0;
    }

    console.log(JSON.stringify({
      apply: true,
      hours,
      limit,
      concurrency,
      attempts,
      sourcePrefixes,
      scanned: result.rows.length,
      candidates: candidates.length,
      repairs: repairs.length,
      updated,
      sample: repairs.slice(0, 20),
    }, null, 2));
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error('[backfill-low-signal-news-titles] failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
