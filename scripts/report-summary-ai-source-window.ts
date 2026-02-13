import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';

type Args = {
  hours: number;
  limit: number;
  all: boolean;
};

type SummaryRow = {
  total_rows: string;
  summarized_rows: string;
  ai_summary_rows: string;
  article_meta_summary_rows: string;
  feed_or_other_summary_rows: string;
};

type SourceRow = {
  source: string;
  added_count: string;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let hours = 24;
  let limit = 50;
  let all = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--hours' && argv[i + 1]) {
      hours = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--limit' && argv[i + 1]) {
      limit = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--all') {
      all = true;
    }
  }

  const safeHours = Number.isFinite(hours) ? Math.max(1, Math.min(168, Math.floor(hours))) : 24;
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(5000, Math.floor(limit))) : 50;

  return { hours: safeHours, limit: safeLimit, all };
}

function getDatabaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL || '';
  if (fromEnv) return fromEnv;

  const envLocal = resolve(process.cwd(), '.env.local');
  if (!existsSync(envLocal)) {
    throw new Error('Missing DATABASE_URL. Set env or add DATABASE_URL in .env.local.');
  }

  const raw = readFileSync(envLocal, 'utf8');
  const line = raw
    .split('\n')
    .find((l) => l.trim().startsWith('DATABASE_URL='));
  if (!line) {
    throw new Error('Missing DATABASE_URL in .env.local.');
  }

  return line.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
}

function pct(n: number, d: number): number {
  if (d <= 0) return 0;
  return (n / d) * 100;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const pool = new Pool({ connectionString: getDatabaseUrl() });

  try {
    const summaryResult = await pool.query<SummaryRow>(
      `
      with win as (
        select now() - ($1::text || ' hours')::interval as since
      )
      select
        count(*)::text as total_rows,
        count(*) filter (
          where coalesce(btrim(summary_original), '') <> ''
             or coalesce(btrim(summary_en), '') <> ''
        )::text as summarized_rows,
        count(*) filter (where summary_source = 'ai_article')::text as ai_summary_rows,
        count(*) filter (where summary_source = 'article_meta')::text as article_meta_summary_rows,
        count(*) filter (where summary_source not in ('ai_article', 'article_meta') or summary_source is null)::text as feed_or_other_summary_rows
      from external_news_articles
      where last_seen_at > (select since from win)
      `,
      [String(args.hours)]
    );

    const sourceResult = await pool.query<SourceRow>(
      `
      with win as (
        select now() - ($1::text || ' hours')::interval as since
      )
      select source, count(*)::text as added_count
      from external_news_articles
      where created_at > (select since from win)
      group by source
      order by count(*) desc, source asc
      ${args.all ? '' : 'limit $2'}
      `,
      args.all ? [String(args.hours)] : [String(args.hours), args.limit]
    );

    const s = summaryResult.rows[0] || {
      total_rows: '0',
      summarized_rows: '0',
      ai_summary_rows: '0',
      article_meta_summary_rows: '0',
      feed_or_other_summary_rows: '0'
    };

    const totalRows = Number(s.total_rows || 0);
    const summarizedRows = Number(s.summarized_rows || 0);
    const aiRows = Number(s.ai_summary_rows || 0);
    const articleMetaRows = Number(s.article_meta_summary_rows || 0);
    const feedOtherRows = Number(s.feed_or_other_summary_rows || 0);

    console.log(`Window: last ${args.hours}h`);
    console.log(`Articles touched (last_seen_at): ${totalRows}`);
    console.log(`Articles with summary text: ${summarizedRows}`);
    console.log(
      `AI summary ratio (summary_source='ai_article', base=touched): ${pct(aiRows, Math.max(totalRows, 1)).toFixed(1)}% (${aiRows}/${totalRows})`
    );
    console.log(
      `AI summary ratio (summary_source='ai_article', base=summarized): ${pct(aiRows, Math.max(summarizedRows, 1)).toFixed(1)}% (${aiRows}/${summarizedRows})`
    );
    console.log(
      `Summary source mix (touched base): ai_article ${pct(aiRows, Math.max(totalRows, 1)).toFixed(1)}% | article_meta ${pct(articleMetaRows, Math.max(totalRows, 1)).toFixed(1)}% | feed/other ${pct(feedOtherRows, Math.max(totalRows, 1)).toFixed(1)}%`
    );
    console.log('');
    console.log(`Added articles by source (created_at, last ${args.hours}h): ${sourceResult.rows.length} sources${args.all ? '' : ` (top ${args.limit})`}`);
    for (const row of sourceResult.rows) {
      console.log(`${row.source}\t${row.added_count}`);
    }
  } finally {
    await pool.end();
  }
}

void main().catch((err) => {
  console.error(`[report-summary-ai-source-window] ${String(err?.message || err)}`);
  process.exit(1);
});

