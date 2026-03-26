#!/usr/bin/env bun

import { Pool } from 'pg';
import { runWithConcurrency } from '@/lib/concurrency';
import { fetchWithRetry, readResponseText } from '@/lib/fetch-utils';
import { extractArticlePageTitle } from '@/lib/article-page-title';
import { buildArticlePageFetchHeaders } from '@/lib/article-page-fetch';
import { isKnownNonArticleUrl } from '@/lib/article-url-filters';
import { looksLikeLowSignalArticleTitle, normalizeReadableArticleTitle } from '@/lib/html-entities';
import { assessNewsTitle } from '@/lib/title-quality';

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
const APPROXIMATE_LOW_SIGNAL_WHERE = `
  (
    coalesce(title_original, '') = ''
    or coalesce(title_original, '') ~ '^[0-9]{6,}$'
    or coalesce(title_original, '') ~* '^[[:xdigit:]]{32}$'
    or coalesce(title_original, '') ~* '^Cision[[:alnum:]]+$'
    or coalesce(title_original, '') ~* '^Catalog(?:\\.aspx)?(?:\\?.+)?$'
    or coalesce(title_original, '') ~ '^[[:lower:][:space:]''’.-]{1,40}$'
    or coalesce(title_original, '') = coalesce(url, '')
    or coalesce(title_original, '') ilike 'http%'
    or coalesce(title_original, '') ~* '^(news|latest|domestic|international|photo|video|full|anime|comic|voiceactor|vest)$'
    or (source ~* 'parapolitika' and coalesce(title_original, '') ~* '^[a-z0-9_-]{4,180}$')
  )
`;

function maybeDecodeUrl(value: string): string {
  const raw = (value || '').trim();
  if (!raw) return raw;
  if (/^http:\/\/(?:www\.)?emol\.com\//i.test(raw)) {
    return raw.replace(/^http:\/\//i, 'https://');
  }
  if (/^https?%3a%2f%2f/i.test(raw)) {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

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
  const repairUrl = maybeDecodeUrl(row.url || '');
  const fallbackTitle = normalizeReadableArticleTitle(
    row.title_original || '',
    repairUrl,
    row.source || ''
  );

  if (!repairUrl || isKnownNonArticleUrl(row.source || '', repairUrl)) {
    return null;
  }
  if (!looksLikeLowSignalArticleTitle(row.title_original || '', row.source || '', repairUrl)) {
    return null;
  }
  if (
    fallbackTitle
    && fallbackTitle !== (row.title_original || '').trim()
    && !looksLikeLowSignalArticleTitle(fallbackTitle, row.source || '', repairUrl)
  ) {
    return {
      externalId: row.external_id,
      source: row.source,
      url: row.url,
      previousTitle: row.title_original,
      recoveredTitle: fallbackTitle,
    };
  }

  try {
    const response = await fetchWithRetry(repairUrl, {
      timeoutMs,
      attempts,
      fetchOptions: {
        headers: buildArticlePageFetchHeaders(repairUrl),
        redirect: 'follow',
      },
    });
    if (!response.ok) {
      if (fallbackTitle && fallbackTitle !== (row.title_original || '').trim()) {
        return {
          externalId: row.external_id,
          source: row.source,
          url: row.url,
          previousTitle: row.title_original,
          recoveredTitle: fallbackTitle,
        };
      }
      return null;
    }
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType && !contentType.includes('html') && !contentType.includes('xml')) {
      if (fallbackTitle && fallbackTitle !== (row.title_original || '').trim()) {
        return {
          externalId: row.external_id,
          source: row.source,
          url: row.url,
          previousTitle: row.title_original,
          recoveredTitle: fallbackTitle,
        };
      }
      return null;
    }
    const finalUrl = response.url || repairUrl;
    const html = (await readResponseText(response, finalUrl)).text;
    const recoveredTitle = normalizeReadableArticleTitle(
      extractArticlePageTitle(html),
      finalUrl,
      row.source || ''
    );
    const finalTitle =
      recoveredTitle && !looksLikeLowSignalArticleTitle(recoveredTitle, row.source || '', finalUrl)
        ? recoveredTitle
        : fallbackTitle;
    if (!finalTitle) return null;
    if (looksLikeLowSignalArticleTitle(finalTitle, row.source || '', finalUrl)) return null;
    if (finalTitle === (row.title_original || '').trim()) return null;
    return {
      externalId: row.external_id,
      source: row.source,
      url: row.url,
      previousTitle: row.title_original,
      recoveredTitle: finalTitle,
    };
  } catch {
    if (fallbackTitle && fallbackTitle !== (row.title_original || '').trim()) {
      return {
        externalId: row.external_id,
        source: row.source,
        url: row.url,
        previousTitle: row.title_original,
        recoveredTitle: fallbackTitle,
      };
    }
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
      `created_at >= now() - ($1::int * interval '1 hour')`,
      `created_at <= now() + interval '30 minutes'`,
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
            title_quality = $3,
            title_quality_reason = $4,
            title_quality_checked_at = now(),
            title_repair_status = 'recovered',
            title_repair_source = 'background',
            title_repair_attempted_at = now(),
            title_repaired_at = now(),
            updated_at = now()
        where external_id = $1
        `,
        [
          row.externalId,
          row.recoveredTitle,
          assessNewsTitle({
            title: row.recoveredTitle,
            source: row.source,
            url: row.url,
            repairAttempted: true,
            repairSource: 'background',
          }).quality,
          'recovered_in_background',
        ]
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
