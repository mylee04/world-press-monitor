#!/usr/bin/env bun

import { Pool } from 'pg';
import { auditArticleUrl, isSafeLandingPruneCandidate } from '@/lib/article-url-audit';
import { resolveDatabaseUrl } from '@/lib/database-url';

type Row = {
  external_id: string;
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
  sourcePrefixes: string[];
  country: string | null;
  apply: boolean;
};

const argv = process.argv.slice(2);
const options: CliOptions = {
  hours: parseIntArg(argv, 'hours', 72, 1, 24 * 30),
  limit: parseIntArg(argv, 'limit', 200, 1, 2000),
  timeoutMs: parseIntArg(argv, 'timeout-ms', 15000, 1000, 120000),
  concurrency: parseIntArg(argv, 'concurrency', 8, 1, 32),
  sourcePrefixes: parseCsvArg(argv, 'source-prefix'),
  country: parseStringArg(argv, 'country'),
  apply: hasFlag(argv, 'apply')
};

await main();

async function main(): Promise<void> {
  const pool = new Pool({
    connectionString: resolveDatabaseUrl()
  });

  try {
    const rows = await readRows(pool, options);
    if (!rows.length) {
      console.log(JSON.stringify({ apply: options.apply, checked: 0, matches: 0 }, null, 2));
      return;
    }

    const audited = await auditRows(rows, options);
    const matches = audited.filter((entry) => isSafeLandingPruneCandidate(entry.result));

    if (!options.apply) {
      console.log(
        JSON.stringify(
          {
            apply: false,
            checked: audited.length,
            matches: matches.length,
            sample: matches.slice(0, 20).map((entry) => ({
              source: entry.row.source,
              country: entry.row.country,
              publicationDatetime: entry.row.publication_datetime,
              url: entry.row.url,
              finalUrl: entry.result.finalUrl,
              status: entry.result.status,
              reasons: entry.result.reasons,
              title: entry.row.title_original,
              pageTitle: entry.result.pageTitle
            }))
          },
          null,
          2
        )
      );
      return;
    }

    if (!matches.length) {
      console.log(JSON.stringify({ apply: true, checked: audited.length, matches: 0, deleted: 0 }, null, 2));
      return;
    }

    let deleted = 0;
    for (let index = 0; index < matches.length; index += 250) {
      const chunk = matches.slice(index, index + 250);
      const ids = chunk.map((entry) => entry.row.external_id);
      const result = await pool.query(`delete from news_articles where external_id = any($1::text[])`, [ids]);
      deleted += result.rowCount || 0;
    }

    console.log(
      JSON.stringify(
        {
          apply: true,
          checked: audited.length,
          matches: matches.length,
          deleted
        },
        null,
        2
      )
    );
  } finally {
    await pool.end();
  }
}

async function readRows(pool: Pool, options: CliOptions): Promise<Row[]> {
  const values: Array<string | number | string[]> = [options.hours];
  const filters = [
    `publication_datetime >= now() - ($1::int * interval '1 hour')`,
    `publication_datetime <= now() + interval '30 minutes'`,
    `url like 'http%'`
  ];

  if (options.sourcePrefixes.length > 0) {
    values.push(options.sourcePrefixes.map((value) => `${value}%`));
    filters.push(`source like any($${values.length}::text[])`);
  }

  if (options.country) {
    values.push(options.country);
    filters.push(`country = $${values.length}`);
  }

  values.push(options.limit);

  const { rows } = await pool.query<Row>(
    `
      select external_id, source, country, publication_datetime, created_at, url, title_original
      from news_articles
      where ${filters.join('\n        and ')}
      order by publication_datetime desc nulls last, created_at desc
      limit $${values.length}
    `,
    values
  );

  return rows;
}

async function auditRows(
  rows: Row[],
  options: CliOptions
): Promise<Array<{ row: Row; result: Awaited<ReturnType<typeof auditArticleUrl>> }>> {
  const results = new Array<{ row: Row; result: Awaited<ReturnType<typeof auditArticleUrl>> }>(rows.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: options.concurrency }, async () => {
      while (cursor < rows.length) {
        const index = cursor;
        const row = rows[cursor];
        cursor += 1;
        const result = await auditArticleUrl({
          source: row.source,
          country: row.country,
          publicationDatetime: row.publication_datetime,
          createdAt: row.created_at,
          url: row.url,
          title: row.title_original,
          timeoutMs: options.timeoutMs
        });
        results[index] = { row, result };
      }
    })
  );

  return results.filter(Boolean);
}

function parseIntArg(argv: string[], name: string, fallback: number, min: number, max: number): number {
  const raw = parseStringArg(argv, name);
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function parseCsvArg(argv: string[], name: string): string[] {
  const raw = parseStringArg(argv, name);
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseStringArg(argv: string[], name: string): string | null {
  const prefix = `--${name}=`;
  const inline = argv.find((arg) => arg.startsWith(prefix));
  if (inline) {
    const value = inline.slice(prefix.length).trim();
    return value ? value : null;
  }

  const flag = `--${name}`;
  const index = argv.indexOf(flag);
  if (index >= 0 && argv[index + 1]) {
    const value = argv[index + 1].trim();
    return value ? value : null;
  }

  return null;
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(`--${name}`);
}
