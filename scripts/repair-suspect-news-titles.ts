#!/usr/bin/env bun

import { Pool } from 'pg';
import { runWithConcurrency } from '@/lib/concurrency';
import { fetchWithRetry, readResponseText } from '@/lib/fetch-utils';
import { extractArticlePageTitle } from '@/lib/article-page-title';
import { buildArticlePageFetchHeaders } from '@/lib/article-page-fetch';
import { isKnownNonArticleUrl } from '@/lib/article-url-filters';
import { looksLikeLowSignalArticleTitle, normalizeReadableArticleTitle } from '@/lib/html-entities';
import { assessNewsTitle } from '@/lib/title-quality';
import type { NewsTitleQuality, NewsTitleRepairSource, NewsTitleRepairStatus } from '@/lib/types';

type Row = {
  external_id: string;
  source: string;
  url: string;
  title_original: string;
  publication_datetime: string;
  title_quality: string | null;
  title_repair_status: string | null;
};

type TitleStateUpdate = {
  externalId: string;
  source: string;
  url: string;
  previousTitle: string;
  nextTitle: string;
  titleQuality: NewsTitleQuality;
  titleQualityReason: string;
  titleRepairStatus: NewsTitleRepairStatus;
  titleRepairSource: NewsTitleRepairSource | null;
  attemptedRepair: boolean;
  repaired: boolean;
};

const DEFAULT_FETCH_TIMEOUT_MS = 12_000;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_ATTEMPTS = 1;
const APPROXIMATE_LOW_SIGNAL_WHERE = `
  (
    coalesce(title_original, '') = ''
    or coalesce(title_original, '') ~* '^story[0-9]{8}(?:[-_ ]?[0-9]+)?(?:\\.html)?$'
    or coalesce(title_original, '') ~ '^[0-9]{6,}$'
    or coalesce(title_original, '') ~* '^[[:xdigit:]]{32}$'
    or coalesce(title_original, '') ~* '^Cision[[:alnum:]]+$'
    or coalesce(title_original, '') ~* '^Catalog(?:\\.aspx)?(?:\\?.+)?$'
    or coalesce(title_original, '') ~ '^[[:lower:][:space:]''’.-]{1,40}$'
    or coalesce(title_original, '') = coalesce(url, '')
    or coalesce(title_original, '') ilike 'http%'
    or coalesce(title_original, '') ~* '^(news|latest|domestic|international|photo|video|full|anime|comic|voiceactor|vest)$'
    or (source ~* 'parapolitika' and coalesce(title_original, '') ~* '^[a-z0-9_-]{4,180}$')
    or (source ~* 'zaobao' and coalesce(title_original, '') ~* '^(china|singapore|world|finance|lifestyle|entertainment|forum|sports|sea|columns|views|talk|shorts|culture|gen|food|health|comic|zodiac|history[ -]heritage|design[ -]decor|fashion[ -]beauty|travel|campus|gadget|feature|motoring|zbclub)$')
    or coalesce(nullif(trim(title_quality), ''), 'ok') = 'suspect'
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

function buildStateUpdate(row: Row, options: {
  nextTitle: string;
  repairAttempted: boolean;
  repairSource?: NewsTitleRepairSource | null;
}): TitleStateUpdate {
  const assessment = assessNewsTitle({
    title: options.nextTitle,
    source: row.source || '',
    url: maybeDecodeUrl(row.url || ''),
    repairAttempted: options.repairAttempted,
    repairSource: options.repairSource || null,
  });

  return {
    externalId: row.external_id,
    source: row.source,
    url: row.url,
    previousTitle: row.title_original,
    nextTitle: assessment.normalizedTitle || row.title_original,
    titleQuality: assessment.quality,
    titleQualityReason: assessment.qualityReason,
    titleRepairStatus: assessment.repairStatus,
    titleRepairSource: assessment.repairSource,
    attemptedRepair: options.repairAttempted,
    repaired: assessment.quality === 'recovered',
  };
}

async function repairRow(row: Row, timeoutMs: number, attempts: number): Promise<TitleStateUpdate | null> {
  const repairUrl = maybeDecodeUrl(row.url || '');
  const currentAssessment = assessNewsTitle({
    title: row.title_original || '',
    source: row.source || '',
    url: repairUrl,
  });

  if (!repairUrl) {
    return null;
  }

  if (isKnownNonArticleUrl(row.source || '', repairUrl)) {
    return {
      externalId: row.external_id,
      source: row.source,
      url: row.url,
      previousTitle: row.title_original,
      nextTitle: currentAssessment.normalizedTitle || row.title_original,
      titleQuality: 'suspect',
      titleQualityReason: 'known_non_article_url',
      titleRepairStatus: 'failed',
      titleRepairSource: null,
      attemptedRepair: false,
      repaired: false,
    };
  }

  if (currentAssessment.quality !== 'suspect') {
    return {
      externalId: row.external_id,
      source: row.source,
      url: row.url,
      previousTitle: row.title_original,
      nextTitle: currentAssessment.normalizedTitle || row.title_original,
      titleQuality: currentAssessment.quality,
      titleQualityReason: currentAssessment.qualityReason,
      titleRepairStatus: currentAssessment.repairStatus,
      titleRepairSource: currentAssessment.repairSource,
      attemptedRepair: false,
      repaired: currentAssessment.quality === 'recovered',
    };
  }

  const fallbackTitle = normalizeReadableArticleTitle(
    row.title_original || '',
    repairUrl,
    row.source || ''
  );
  if (
    fallbackTitle
    && fallbackTitle !== (row.title_original || '').trim()
    && !looksLikeLowSignalArticleTitle(fallbackTitle, row.source || '', repairUrl)
  ) {
    return buildStateUpdate(row, {
      nextTitle: fallbackTitle,
      repairAttempted: false,
    });
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
      return buildStateUpdate(row, {
        nextTitle: fallbackTitle || row.title_original,
        repairAttempted: true,
      });
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType && !contentType.includes('html') && !contentType.includes('xml')) {
      return buildStateUpdate(row, {
        nextTitle: fallbackTitle || row.title_original,
        repairAttempted: true,
      });
    }

    const finalUrl = response.url || repairUrl;
    const html = (await readResponseText(response, finalUrl)).text;
    const recoveredTitle = normalizeReadableArticleTitle(
      extractArticlePageTitle(html),
      finalUrl,
      row.source || ''
    );
    const nextTitle = recoveredTitle || fallbackTitle || row.title_original;
    return buildStateUpdate(row, {
      nextTitle,
      repairAttempted: true,
      repairSource: recoveredTitle ? 'background' : null,
    });
  } catch {
    return buildStateUpdate(row, {
      nextTitle: fallbackTitle || row.title_original,
      repairAttempted: true,
    });
  }
}

function needsDatabaseUpdate(row: Row, update: TitleStateUpdate): boolean {
  const currentQuality = (row.title_quality || 'ok').trim() || 'ok';
  const currentRepairStatus = (row.title_repair_status || 'not_needed').trim() || 'not_needed';
  return (
    (row.title_original || '') !== update.nextTitle
    || currentQuality !== update.titleQuality
    || currentRepairStatus !== update.titleRepairStatus
  );
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const hours = parseIntArg('--hours', 24 * 31, 1, 24 * 180);
  const limit = parseIntArg('--limit', 5000, 1, 50_000);
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
      select
        external_id,
        source,
        url,
        title_original,
        publication_datetime,
        title_quality,
        title_repair_status
      from news_articles
      where ${whereClauses.join(' and ')}
      order by publication_datetime desc
      limit $${values.length}
      `,
      values
    );

    const updates = await runWithConcurrency(
      result.rows,
      concurrency,
      (row) => repairRow(row, timeoutMs, attempts)
    );

    const pending = updates.reduce<TitleStateUpdate[]>((acc, update, index) => {
      if (update && needsDatabaseUpdate(result.rows[index], update)) {
        acc.push(update);
      }
      return acc;
    }, []);

    if (!apply) {
      console.log(JSON.stringify({
        apply: false,
        hours,
        limit,
        concurrency,
        attempts,
        sourcePrefixes,
        scanned: result.rows.length,
        candidates: updates.filter((row) => row !== null).length,
        pendingUpdates: pending.length,
        recovered: updates.filter((row) => row?.repaired).length,
        suspect: updates.filter((row) => row?.titleQuality === 'suspect').length,
        sample: updates.filter((row): row is TitleStateUpdate => row !== null).slice(0, 20),
      }, null, 2));
      return;
    }

    let updated = 0;
    for (let index = 0; index < result.rows.length; index += 1) {
      const row = result.rows[index];
      const update = updates[index];
      if (!update || !needsDatabaseUpdate(row, update)) continue;
      const updateResult = await db.query(
        `
        update news_articles
        set title_original = $2,
            title_quality = $3,
            title_quality_reason = $4,
            title_quality_checked_at = now(),
            title_repair_status = $5,
            title_repair_source = $6,
            title_repair_attempted_at = case when $7::boolean then now() else title_repair_attempted_at end,
            title_repaired_at = case when $8::boolean then now() else title_repaired_at end,
            updated_at = now()
        where external_id = $1
        `,
        [
          update.externalId,
          update.nextTitle,
          update.titleQuality,
          update.titleQualityReason,
          update.titleRepairStatus,
          update.titleRepairSource,
          update.attemptedRepair,
          update.repaired,
        ]
      );
      updated += updateResult.rowCount || 0;
    }

    console.log(JSON.stringify({
      apply: true,
      hours,
      limit,
      concurrency,
      attempts,
      sourcePrefixes,
      scanned: result.rows.length,
      candidates: updates.filter((row) => row !== null).length,
      updated,
      recovered: updates.filter((row) => row?.repaired).length,
      suspect: updates.filter((row) => row?.titleQuality === 'suspect').length,
      sample: updates.filter((row): row is TitleStateUpdate => row !== null).slice(0, 20),
    }, null, 2));
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error('[repair-suspect-news-titles] failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
