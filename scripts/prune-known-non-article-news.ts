import { Pool } from 'pg';
import { isKnownNonArticleUrl } from '@/lib/article-url-filters';

type Row = {
  external_id: string;
  source: string;
  url: string;
  title_original: string;
  publication_datetime: string;
};

function parseArgValue(flag: string): string | null {
  const inline = process.argv.find((token) => token.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1).trim() || null;
  const index = process.argv.indexOf(flag);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1].trim() || null;
  return null;
}

function parseIntArg(flag: string, fallback: number, min = 1, max = 24 * 90): number {
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

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const hours = parseIntArg('--hours', 72);
  const sourcePrefixes = parseCsvArg('--source-prefix');
  const apply = hasFlag('--apply');
  const db = new Pool({ connectionString: databaseUrl });

  try {
    const whereClauses = [
      `publication_datetime >= now() - ($1::int * interval '1 hour')`,
      `publication_datetime <= now() + interval '30 minutes'`
    ];
    const values: unknown[] = [hours];
    if (sourcePrefixes.length > 0) {
      values.push(sourcePrefixes.map((prefix) => `${prefix}%`));
      whereClauses.push(`source like any($${values.length}::text[])`);
    }

    const result = await db.query<Row>(
      `
      select external_id, source, url, title_original, publication_datetime
      from news_articles
      where ${whereClauses.join(' and ')}
      order by publication_datetime desc
      `,
      values
    );

    const matches = result.rows.filter((row) => isKnownNonArticleUrl(row.source, row.url));
    if (!apply) {
      console.log(JSON.stringify({
        apply: false,
        hours,
        sourcePrefixes,
        matches: matches.length,
        sample: matches.slice(0, 20),
      }, null, 2));
      return;
    }

    if (matches.length === 0) {
      console.log(JSON.stringify({ apply: true, hours, sourcePrefixes, matches: 0, deleted: 0 }, null, 2));
      return;
    }

    let deleted = 0;
    for (let i = 0; i < matches.length; i += 250) {
      const chunk = matches.slice(i, i + 250);
      const ids = chunk.map((row) => row.external_id);
      const deletion = await db.query(`delete from news_articles where external_id = any($1::text[])`, [ids]);
      deleted += deletion.rowCount || 0;
    }

    console.log(JSON.stringify({
      apply: true,
      hours,
      sourcePrefixes,
      matches: matches.length,
      deleted,
    }, null, 2));
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error('[prune-known-non-article-news] failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
