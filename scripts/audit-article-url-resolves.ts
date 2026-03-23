#!/usr/bin/env bun

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { auditArticleUrl, type ArticleUrlAuditResult } from '@/lib/article-url-audit';
import { resolveDatabaseUrl } from '../lib/database-url';

type ArticleRow = {
  source: string;
  country: string;
  publication_datetime: string | null;
  created_at: string;
  url: string;
  title_original: string;
};

type CliOptions = {
  hours: number;
  limit: number;
  timeoutMs: number;
  concurrency: number;
  distinctSource: boolean;
  writeJson: boolean;
  source: string | null;
  country: string | null;
};

const OUTPUT_PATH = resolve(process.cwd(), 'audits/article-url-resolves-latest.json');

const argv = process.argv.slice(2);
const options: CliOptions = {
  hours: parseIntArg(argv, 'hours', 48, 1, 24 * 30),
  limit: parseIntArg(argv, 'limit', 120, 1, 1000),
  timeoutMs: parseIntArg(argv, 'timeout-ms', 15000, 1000, 120000),
  concurrency: parseIntArg(argv, 'concurrency', 8, 1, 32),
  distinctSource: parseBoolArg(argv, 'distinct-source', true),
  writeJson: parseBoolArg(argv, 'write-json', false),
  source: parseStringArg(argv, 'source'),
  country: parseStringArg(argv, 'country')
};

await main();

async function main(): Promise<void> {
  const pool = new Pool({
    connectionString: resolveDatabaseUrl()
  });

  try {
    const rows = await readCandidateRows(pool, options);
    if (!rows.length) {
      console.log('[article-url-audit] no candidate rows found for the selected window.');
      return;
    }

    const results = await auditRows(rows, options);
    const suspicious = results.filter((result) => result.suspicious);

    console.log(
      `[article-url-audit] checked=${results.length} suspicious=${suspicious.length} hours=${options.hours} distinctSource=${options.distinctSource}`
    );

    if (!suspicious.length) {
      console.log('[article-url-audit] no suspicious article landing results found in the sampled rows.');
    } else {
      for (const result of suspicious.slice(0, 25)) {
        console.log(
          [
            `[${result.reasons.join(',')}]`,
            `${result.source} (${result.country})`,
            `status=${result.status ?? 'ERR'}`,
            `url=${result.url}`,
            `final=${result.finalUrl || 'n/a'}`,
            `title="${trimForConsole(result.title, 90)}"`,
            `pageTitle="${trimForConsole(result.pageTitle, 90)}"`,
            result.error ? `error=${result.error}` : ''
          ]
            .filter(Boolean)
            .join(' | ')
        );
      }
    }

    if (options.writeJson) {
      mkdirSync(resolve(process.cwd(), 'audits'), { recursive: true });
      writeFileSync(
        OUTPUT_PATH,
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            options,
            checked: results.length,
            suspiciousCount: suspicious.length,
            results
          },
          null,
          2
        )
      );
      console.log(`[article-url-audit] wrote ${OUTPUT_PATH}`);
    }
  } finally {
    await pool.end();
  }
}

async function readCandidateRows(pool: Pool, options: CliOptions): Promise<ArticleRow[]> {
  const params: Array<string | number> = [options.hours];
  const filters: string[] = [
    `publication_datetime >= now() - ($1::int * interval '1 hour')`,
    `publication_datetime <= now() + interval '30 minutes'`,
    `url like 'http%'`
  ];

  if (options.source) {
    params.push(options.source);
    filters.push(`source = $${params.length}`);
  }

  if (options.country) {
    params.push(options.country);
    filters.push(`country = $${params.length}`);
  }

  params.push(options.limit);
  const limitParam = `$${params.length}`;
  const whereClause = filters.join('\n        and ');

  const query = options.distinctSource
    ? `
      with ranked as (
        select
          source,
          country,
          publication_datetime,
          created_at,
          url,
          title_original,
          row_number() over (
            partition by source
            order by publication_datetime desc nulls last, created_at desc
          ) as rn
        from news_articles
        where ${whereClause}
      )
      select source, country, publication_datetime, created_at, url, title_original
      from ranked
      where rn = 1
      order by publication_datetime desc nulls last, created_at desc
      limit ${limitParam}
    `
    : `
      select source, country, publication_datetime, created_at, url, title_original
      from news_articles
      where ${whereClause}
      order by publication_datetime desc nulls last, created_at desc
      limit ${limitParam}
    `;

  const { rows } = await pool.query<ArticleRow>(query, params);
  return rows;
}

async function auditRows(rows: ArticleRow[], options: CliOptions): Promise<ArticleUrlAuditResult[]> {
  const results = new Array<ArticleUrlAuditResult>(rows.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: options.concurrency }, async () => {
      while (cursor < rows.length) {
        const index = cursor;
        const row = rows[cursor];
        cursor += 1;
        results[index] = await auditArticleUrl({
          source: row.source,
          country: row.country,
          publicationDatetime: row.publication_datetime,
          createdAt: row.created_at,
          url: row.url,
          title: row.title_original,
          timeoutMs: options.timeoutMs
        });
      }
    })
  );

  return results.filter(Boolean);
}

function trimForConsole(value: string, maxLength: number): string {
  if (!value) return '';
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function parseIntArg(argv: string[], name: string, fallback: number, min: number, max: number): number {
  const raw = parseStringArg(argv, name);
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function parseBoolArg(argv: string[], name: string, fallback: boolean): boolean {
  const raw = parseStringArg(argv, name);
  if (!raw) return fallback;
  if (/^(1|true|yes|on)$/i.test(raw)) return true;
  if (/^(0|false|no|off)$/i.test(raw)) return false;
  return fallback;
}

function parseStringArg(argv: string[], name: string): string | null {
  const prefix = `--${name}=`;
  const match = argv.find((arg) => arg.startsWith(prefix));
  if (!match) return null;
  const value = match.slice(prefix.length).trim();
  return value ? value : null;
}
