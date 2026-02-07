import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';

const HOURS = 24;
const TARGET_24H = 15000;
const AUDITS_DIR = resolve(process.cwd(), 'audits');

type DbRow = {
  source: string;
  country: string;
  unique_24h: string;
  raw_24h: string;
  failed_runs_24h: string;
  endpoint_runs_24h: string;
};

type CsvRow = {
  outletId: string;
  source: string;
  tier: number;
  country: string;
  sourceType: string;
  reviewDecision: string;
  rssParsed: number;
  sitemapParsed: number;
  rss24h: number;
  sitemap24h: number;
  total24h: number;
  rssUnique24h: number;
  sitemapUnique24h: number;
  unique24h: number;
  dedupeRate: number;
  rssUrl?: string;
  sitemapUrl?: string;
  errors: string[];
};

function getDatabaseUrl(): string {
  const env = process.env.DATABASE_URL || '';
  if (env) return env;
  const envLocal = resolve(process.cwd(), '.env.local');
  if (existsSync(envLocal)) {
    const raw = readFileSync(envLocal, 'utf8');
    const line = raw.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
    if (line) return line.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
  }
  throw new Error('Missing DATABASE_URL. Set it in env or .env.local to run fast DB report.');
}

function normalizeCountry(country: string): string {
  const c = (country || '').trim().toLowerCase();
  if (c === 'us') return 'United States';
  if (c === 'argentina') return 'Argentina';
  if (c === 'chile') return 'Chile';
  if (c === 'uruguay') return 'Uruguay';
  if (c === 'latam' || c === 'latin america') return 'LATAM';
  return country || 'Unknown';
}

function inScope(country: string): boolean {
  const c = normalizeCountry(country).toLowerCase();
  return c === 'united states' || c === 'argentina' || c === 'chile' || c === 'uruguay' || c === 'latam';
}

function csvEscape(value: string | number): string {
  const raw = String(value ?? '');
  if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
    return `"${raw.replaceAll('"', '""')}"`;
  }
  return raw;
}

function toCsv(rows: CsvRow[]): string {
  const header = [
    'outlet_id', 'source', 'tier', 'country', 'source_type', 'review_decision',
    'rss_parsed', 'sitemap_parsed', 'rss_24h', 'sitemap_24h', 'total_24h',
    'rss_unique_24h', 'sitemap_unique_24h', 'unique_24h', 'dedupe_rate',
    'rss_url', 'sitemap_url', 'errors'
  ];

  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      r.outletId,
      r.source,
      r.tier,
      r.country,
      r.sourceType,
      r.reviewDecision,
      r.rssParsed,
      r.sitemapParsed,
      r.rss24h,
      r.sitemap24h,
      r.total24h,
      r.rssUnique24h,
      r.sitemapUnique24h,
      r.unique24h,
      r.dedupeRate.toFixed(4),
      r.rssUrl || '',
      r.sitemapUrl || '',
      r.errors.join(' | ')
    ].map(csvEscape).join(','));
  }

  return `${lines.join('\n')}\n`;
}

function sum(rows: CsvRow[]): number {
  return rows.reduce((acc, row) => acc + row.total24h, 0);
}

function sumUnique(rows: CsvRow[]): number {
  return rows.reduce((acc, row) => acc + row.unique24h, 0);
}

function top(rows: CsvRow[], n = 25): CsvRow[] {
  return [...rows].sort((a, b) => b.total24h - a.total24h || a.source.localeCompare(b.source)).slice(0, n);
}

function previousDayNewSourceRatio(stamp: string, currentRows: CsvRow[]): string {
  try {
    const files = readdirSync(AUDITS_DIR)
      .filter((name) => /^source_daily_counts_\d{4}-\d{2}-\d{2}\.csv$/.test(name) && !name.includes(stamp))
      .sort();
    const previous = files[files.length - 1];
    if (!previous) return 'n/a';
    const raw = readFileSync(resolve(AUDITS_DIR, previous), 'utf8').trim();
    if (!raw) return 'n/a';
    const lines = raw.split('\n');
    if (lines.length < 2) return 'n/a';
    const header = lines[0].split(',');
    const sourceIdx = header.indexOf('source');
    const totalIdx = header.indexOf('total_24h');
    if (sourceIdx < 0 || totalIdx < 0) return 'n/a';

    const previousActive = new Set<string>();
    for (let i = 1; i < lines.length; i += 1) {
      const cols = lines[i].split(',');
      if (!cols[sourceIdx]) continue;
      const total = Number(cols[totalIdx] || 0);
      if (Number.isFinite(total) && total > 0) previousActive.add(cols[sourceIdx]);
    }

    const currentActive = currentRows.filter((row) => row.total24h > 0).map((row) => row.source);
    if (currentActive.length === 0) return 'n/a';
    const newCount = currentActive.filter((source) => !previousActive.has(source)).length;
    return `${((newCount / currentActive.length) * 100).toFixed(1)}% (${newCount}/${currentActive.length})`;
  } catch {
    return 'n/a';
  }
}

function toMarkdown(rows: CsvRow[], worldStats: { worldTotal: number; worldLatam: number; ratio: number }): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const total24h = sum(rows);
  const totalUnique24h = sumUnique(rows);
  const dedupeRate = total24h > 0 ? 1 - totalUnique24h / total24h : 0;
  const attainment = TARGET_24H > 0 ? (total24h / TARGET_24H) * 100 : 0;
  const withErrors = rows.filter((r) => r.errors.length > 0).length;
  const newSourceRatio = previousDayNewSourceRatio(stamp, rows);

  const usRows = rows.filter((r) => normalizeCountry(r.country) === 'United States');
  const latamRows = rows.filter((r) => normalizeCountry(r.country) !== 'United States');

  const lines: string[] = [];
  lines.push('# Daily Source Metadata Volume (US + LATAM)');
  lines.push('');
  lines.push(`- Generated at: ${new Date().toISOString()}`);
  lines.push(`- Mode: fast DB report (ingested_articles + ingestion_endpoint_runs)`);
  lines.push(`- Window: last ${HOURS} hours`);
  lines.push(`- Sources measured (active, US+LATAM): ${rows.length}`);
  lines.push(`- Total metadata items observed (24h, raw): ${total24h}`);
  lines.push(`- Target attainment (raw vs ${TARGET_24H}/24h): ${attainment.toFixed(1)}%`);
  lines.push(`- Total metadata items observed (24h, unique): ${totalUnique24h}`);
  lines.push(`- Dedupe rate: ${(dedupeRate * 100).toFixed(1)}%`);
  lines.push(`- World LATAM coverage: ${worldStats.worldLatam}/${worldStats.worldTotal} (${(worldStats.ratio * 100).toFixed(1)}% of world)`);
  lines.push(`- New-source ratio vs previous report: ${newSourceRatio}`);
  lines.push(`- Sources with endpoint failures: ${withErrors}`);
  lines.push('');

  lines.push('## Region Summary');
  lines.push('');
  lines.push(`- US: raw ${sum(usRows)} / unique ${sumUnique(usRows)} across ${usRows.length} sources`);
  lines.push(`- LATAM: raw ${sum(latamRows)} / unique ${sumUnique(latamRows)} across ${latamRows.length} sources`);
  lines.push('');

  lines.push('## Top 25 Sources (US + LATAM, 24h raw)');
  lines.push('');
  lines.push('| Source | 24h raw | 24h unique | Dedupe | Country | Errors |');
  lines.push('| --- | ---: | ---: | ---: | --- | --- |');
  for (const row of top(rows, 25)) {
    lines.push(`| ${row.source} | ${row.total24h} | ${row.unique24h} | ${(row.dedupeRate * 100).toFixed(1)}% | ${row.country} | ${row.errors.join('; ') || '-'} |`);
  }

  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- This report reads persisted metadata and endpoint-run logs from PostgreSQL.');
  lines.push('- Use `bun run audit:daily-sources` for full network re-validation of RSS/sitemap endpoints.');

  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: getDatabaseUrl() });
  const sinceHours = HOURS;
  try {
    const sourceResult = await pool.query<DbRow>(`
    with article_rollup as (
      select
        source,
        coalesce(nullif(country, ''), 'Unknown') as country,
        count(*)::text as unique_24h,
        coalesce(sum(seen_count), 0)::text as raw_24h
      from ingested_articles
      where last_seen_at > now() - ($1::text || ' hours')::interval
      group by source, coalesce(nullif(country, ''), 'Unknown')
    ),
    run_rollup as (
      select
        source,
        count(*)::text as endpoint_runs_24h,
        count(*) filter (where attempted and not ok)::text as failed_runs_24h
      from ingestion_endpoint_runs
      where ran_at > now() - ($1::text || ' hours')::interval
      group by source
    )
    select
      a.source,
      a.country,
      a.unique_24h,
      a.raw_24h,
      coalesce(r.failed_runs_24h, '0') as failed_runs_24h,
      coalesce(r.endpoint_runs_24h, '0') as endpoint_runs_24h
    from article_rollup a
    left join run_rollup r on r.source = a.source
    order by a.raw_24h::int desc, a.source asc
  `, [sinceHours]);

    const worldResult = await pool.query<{
    world_total: string;
    world_latam: string;
  }>(`
    select
      count(*)::text as world_total,
      count(*) filter (where world_latam)::text as world_latam
    from ingested_articles
    where last_seen_at > now() - ($1::text || ' hours')::interval
      and beat = 'world'
  `, [sinceHours]);

    const rows: CsvRow[] = sourceResult.rows
      .map((row) => {
        const raw = Number(row.raw_24h || '0');
        const unique = Number(row.unique_24h || '0');
        const failedRuns = Number(row.failed_runs_24h || '0');
        const endpointRuns = Number(row.endpoint_runs_24h || '0');
        return {
          outletId: '',
          source: row.source,
          tier: 0,
          country: normalizeCountry(row.country),
          sourceType: '',
          reviewDecision: '',
          rssParsed: 0,
          sitemapParsed: 0,
          rss24h: 0,
          sitemap24h: 0,
          total24h: raw,
          rssUnique24h: 0,
          sitemapUnique24h: 0,
          unique24h: unique,
          dedupeRate: raw > 0 ? 1 - unique / raw : 0,
          rssUrl: '',
          sitemapUrl: '',
          errors: failedRuns > 0 ? [`runs_failed:${failedRuns}/${endpointRuns}`] : []
        } satisfies CsvRow;
      })
      .filter((row) => inScope(row.country));

    rows.sort((a, b) => b.total24h - a.total24h || a.source.localeCompare(b.source));

    const world = worldResult.rows[0] || { world_total: '0', world_latam: '0' };
    const worldTotal = Number(world.world_total || 0);
    const worldLatam = Number(world.world_latam || 0);

    const stamp = new Date().toISOString().slice(0, 10);
    const csvPath = resolve(process.cwd(), `audits/source_daily_counts_${stamp}.csv`);
    const mdPath = resolve(process.cwd(), `audits/source_daily_counts_${stamp}.md`);

    writeFileSync(csvPath, toCsv(rows), 'utf8');
    writeFileSync(mdPath, toMarkdown(rows, {
      worldTotal,
      worldLatam,
      ratio: worldTotal > 0 ? worldLatam / worldTotal : 0
    }), 'utf8');

    console.log(`Wrote ${csvPath}`);
    console.log(`Wrote ${mdPath}`);
  } catch (error) {
    throw new Error(
      `Fast DB report failed. Ensure PostgreSQL is running and DATABASE_URL is reachable. ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    await pool.end().catch(() => undefined);
  }
}

void main();
