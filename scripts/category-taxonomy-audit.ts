#!/usr/bin/env bun

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { resolveDatabaseUrl } from '../lib/database-url';

type CliOptions = {
  hours: number;
  top: number;
  minCountryRows: number;
  minSourceRows: number;
  minRecoverableRows: number;
  countries: string[];
  sources: string[];
  writeJson: boolean;
  writeMd: boolean;
  outputDir: string;
  databaseUrl: string | null;
};

type TotalsRow = {
  total: string;
  feed_categories_empty: string;
  feed_categories_empty_pct: string;
  primary_section_others: string;
  primary_section_others_pct: string;
  both_empty_and_others: string;
  both_pct: string;
  total_with_feed_categories: string;
  present_but_others: string;
  present_but_others_pct: string;
};

type CountryRow = {
  source_country: string | null;
  total: string;
  others_count: string;
  others_pct: string;
  empty_feed_categories: string;
  empty_and_others: string;
  present_but_others: string;
};

type MissingSignalSourceRow = {
  source_country: string | null;
  source: string;
  total: string;
  empty_feed_categories: string;
  others_count: string;
  empty_and_others: string;
  empty_and_others_pct: string;
};

type RecoverableSourceRow = {
  source_country: string | null;
  source: string;
  total: string;
  with_feed_categories: string;
  present_but_others: string;
  present_but_others_pct: string;
};

type CategoryRow = {
  category: string;
  article_count: string;
  source_count: string;
  sample_sources: string;
};

type AuditReport = {
  generatedAt: string;
  databaseUrlUsed: string;
  windowHours: number;
  filters: {
    countries: string[];
    sources: string[];
    minCountryRows: number;
    minSourceRows: number;
    minRecoverableRows: number;
    top: number;
  };
  totals: {
    total: number;
    feedCategoriesEmpty: number;
    feedCategoriesEmptyPct: number;
    primarySectionOthers: number;
    primarySectionOthersPct: number;
    bothEmptyAndOthers: number;
    bothPct: number;
    totalWithFeedCategories: number;
    presentButOthers: number;
    presentButOthersPct: number;
  };
  topCountriesByOthers: Array<{
    country: string;
    total: number;
    othersCount: number;
    othersPct: number;
    emptyFeedCategories: number;
    emptyAndOthers: number;
    presentButOthers: number;
  }>;
  topSourcesMissingSignal: Array<{
    country: string;
    source: string;
    total: number;
    emptyFeedCategories: number;
    othersCount: number;
    emptyAndOthers: number;
    emptyAndOthersPct: number;
  }>;
  topSourcesRecoverable: Array<{
    country: string;
    source: string;
    total: number;
    withFeedCategories: number;
    presentButOthers: number;
    presentButOthersPct: number;
  }>;
  topUnmappedCategories: Array<{
    category: string;
    articleCount: number;
    sourceCount: number;
    sampleSources: string;
  }>;
  recommendations: string[];
};

const argv = process.argv.slice(2);
const options: CliOptions = {
  hours: parseIntArg(argv, 'hours', 24, 1, 24 * 365),
  top: parseIntArg(argv, 'top', 20, 1, 200),
  minCountryRows: parseIntArg(argv, 'min-country-rows', 200, 1, 1000000),
  minSourceRows: parseIntArg(argv, 'min-source-rows', 40, 1, 1000000),
  minRecoverableRows: parseIntArg(argv, 'min-recoverable-rows', 20, 1, 1000000),
  countries: parseCsvArg(argv, 'countries'),
  sources: parseCsvArg(argv, 'sources'),
  writeJson: parseBoolArg(argv, 'write-json'),
  writeMd: parseBoolArg(argv, 'write-md'),
  outputDir: parseArgValue(argv, 'output-dir') || resolve(process.cwd(), 'audits'),
  databaseUrl: parseArgValue(argv, 'database-url'),
};

const { client, databaseUrlUsed } = await connectWithFallback(options.databaseUrl);

try {
  const report = await buildAuditReport(client, databaseUrlUsed, options);
  printConsoleSummary(report);

  if (options.writeJson || options.writeMd) {
    mkdirSync(options.outputDir, { recursive: true });
  }
  if (options.writeJson) {
    const outputPath = resolve(options.outputDir, 'category_taxonomy_audit_latest.json');
    writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`[taxonomy-audit] wrote ${outputPath}`);
  }
  if (options.writeMd) {
    const outputPath = resolve(options.outputDir, 'category_taxonomy_audit_latest.md');
    writeFileSync(outputPath, renderMarkdown(report));
    console.log(`[taxonomy-audit] wrote ${outputPath}`);
  }
} finally {
  await client.end().catch(() => undefined);
}

async function buildAuditReport(client: Client, databaseUrlUsed: string, options: CliOptions): Promise<AuditReport> {
  const totalsRow = (await queryTotals(client, options)).rows[0];
  const topCountries = (await queryTopCountries(client, options)).rows;
  const topSourcesMissingSignal = (await queryTopSourcesMissingSignal(client, options)).rows;
  const topSourcesRecoverable = (await queryTopSourcesRecoverable(client, options)).rows;
  const topUnmappedCategories = (await queryTopUnmappedCategories(client, options)).rows;

  const totals = {
    total: toInt(totalsRow?.total),
    feedCategoriesEmpty: toInt(totalsRow?.feed_categories_empty),
    feedCategoriesEmptyPct: toFloat(totalsRow?.feed_categories_empty_pct),
    primarySectionOthers: toInt(totalsRow?.primary_section_others),
    primarySectionOthersPct: toFloat(totalsRow?.primary_section_others_pct),
    bothEmptyAndOthers: toInt(totalsRow?.both_empty_and_others),
    bothPct: toFloat(totalsRow?.both_pct),
    totalWithFeedCategories: toInt(totalsRow?.total_with_feed_categories),
    presentButOthers: toInt(totalsRow?.present_but_others),
    presentButOthersPct: toFloat(totalsRow?.present_but_others_pct),
  };

  const report: AuditReport = {
    generatedAt: new Date().toISOString(),
    databaseUrlUsed,
    windowHours: options.hours,
    filters: {
      countries: options.countries,
      sources: options.sources,
      minCountryRows: options.minCountryRows,
      minSourceRows: options.minSourceRows,
      minRecoverableRows: options.minRecoverableRows,
      top: options.top,
    },
    totals,
    topCountriesByOthers: topCountries.map((row) => ({
      country: normalizeLabel(row.source_country),
      total: toInt(row.total),
      othersCount: toInt(row.others_count),
      othersPct: toFloat(row.others_pct),
      emptyFeedCategories: toInt(row.empty_feed_categories),
      emptyAndOthers: toInt(row.empty_and_others),
      presentButOthers: toInt(row.present_but_others),
    })),
    topSourcesMissingSignal: topSourcesMissingSignal.map((row) => ({
      country: normalizeLabel(row.source_country),
      source: row.source,
      total: toInt(row.total),
      emptyFeedCategories: toInt(row.empty_feed_categories),
      othersCount: toInt(row.others_count),
      emptyAndOthers: toInt(row.empty_and_others),
      emptyAndOthersPct: toFloat(row.empty_and_others_pct),
    })),
    topSourcesRecoverable: topSourcesRecoverable.map((row) => ({
      country: normalizeLabel(row.source_country),
      source: row.source,
      total: toInt(row.total),
      withFeedCategories: toInt(row.with_feed_categories),
      presentButOthers: toInt(row.present_but_others),
      presentButOthersPct: toFloat(row.present_but_others_pct),
    })),
    topUnmappedCategories: topUnmappedCategories.map((row) => ({
      category: row.category,
      articleCount: toInt(row.article_count),
      sourceCount: toInt(row.source_count),
      sampleSources: row.sample_sources,
    })),
    recommendations: buildRecommendations({
      totals,
      topSourcesMissingSignal,
      topSourcesRecoverable,
      topUnmappedCategories,
    }),
  };

  return report;
}

async function queryTotals(client: Client, options: CliOptions) {
  const query = buildRecentQuery(options, (whereSql) => `
    with recent as (
      select
        source_country,
        source,
        coalesce(cardinality(feed_categories), 0) as feed_category_count,
        coalesce(nullif(trim(primary_section), ''), 'others') as primary_section,
        coalesce(feed_categories, '{}'::text[]) as feed_categories
      from news_articles
      where ${whereSql}
    )
    select
      count(*)::text as total,
      count(*) filter (where feed_category_count = 0)::text as feed_categories_empty,
      round(100.0 * count(*) filter (where feed_category_count = 0) / nullif(count(*), 0), 1)::text as feed_categories_empty_pct,
      count(*) filter (where primary_section = 'others')::text as primary_section_others,
      round(100.0 * count(*) filter (where primary_section = 'others') / nullif(count(*), 0), 1)::text as primary_section_others_pct,
      count(*) filter (where feed_category_count = 0 and primary_section = 'others')::text as both_empty_and_others,
      round(100.0 * count(*) filter (where feed_category_count = 0 and primary_section = 'others') / nullif(count(*), 0), 1)::text as both_pct,
      count(*) filter (where feed_category_count > 0)::text as total_with_feed_categories,
      count(*) filter (where feed_category_count > 0 and primary_section = 'others')::text as present_but_others,
      round(
        100.0 * count(*) filter (where feed_category_count > 0 and primary_section = 'others')
        / nullif(count(*) filter (where feed_category_count > 0), 0),
        1
      )::text as present_but_others_pct
    from recent
  `);
  return client.query<TotalsRow>(query.text, query.values);
}

async function queryTopCountries(client: Client, options: CliOptions) {
  const query = buildRecentQuery(options, (whereSql, nextParamIndex) => `
    with recent as (
      select
        source_country,
        source,
        coalesce(cardinality(feed_categories), 0) as feed_category_count,
        coalesce(nullif(trim(primary_section), ''), 'others') as primary_section,
        coalesce(feed_categories, '{}'::text[]) as feed_categories
      from news_articles
      where ${whereSql}
    )
    select
      source_country,
      count(*)::text as total,
      count(*) filter (where primary_section = 'others')::text as others_count,
      round(100.0 * count(*) filter (where primary_section = 'others') / nullif(count(*), 0), 1)::text as others_pct,
      count(*) filter (where feed_category_count = 0)::text as empty_feed_categories,
      count(*) filter (where feed_category_count = 0 and primary_section = 'others')::text as empty_and_others,
      count(*) filter (where feed_category_count > 0 and primary_section = 'others')::text as present_but_others
    from recent
    where coalesce(source_country, '') <> ''
    group by source_country
    having count(*) >= $${nextParamIndex}
    order by count(*) filter (where primary_section = 'others') desc, others_pct desc, count(*) desc
    limit $${nextParamIndex + 1}
  `, [options.minCountryRows, options.top]);
  return client.query<CountryRow>(query.text, query.values);
}

async function queryTopSourcesMissingSignal(client: Client, options: CliOptions) {
  const query = buildRecentQuery(options, (whereSql, nextParamIndex) => `
    with recent as (
      select
        source_country,
        source,
        coalesce(cardinality(feed_categories), 0) as feed_category_count,
        coalesce(nullif(trim(primary_section), ''), 'others') as primary_section,
        coalesce(feed_categories, '{}'::text[]) as feed_categories
      from news_articles
      where ${whereSql}
    )
    select
      source_country,
      source,
      count(*)::text as total,
      count(*) filter (where feed_category_count = 0)::text as empty_feed_categories,
      count(*) filter (where primary_section = 'others')::text as others_count,
      count(*) filter (where feed_category_count = 0 and primary_section = 'others')::text as empty_and_others,
      round(
        100.0 * count(*) filter (where feed_category_count = 0 and primary_section = 'others')
        / nullif(count(*), 0),
        1
      )::text as empty_and_others_pct
    from recent
    group by source_country, source
    having count(*) >= $${nextParamIndex}
    order by count(*) filter (where feed_category_count = 0 and primary_section = 'others') desc, empty_and_others_pct desc, count(*) desc
    limit $${nextParamIndex + 1}
  `, [options.minSourceRows, options.top]);
  return client.query<MissingSignalSourceRow>(query.text, query.values);
}

async function queryTopSourcesRecoverable(client: Client, options: CliOptions) {
  const query = buildRecentQuery(options, (whereSql, nextParamIndex) => `
    with recent as (
      select
        source_country,
        source,
        coalesce(cardinality(feed_categories), 0) as feed_category_count,
        coalesce(nullif(trim(primary_section), ''), 'others') as primary_section,
        coalesce(feed_categories, '{}'::text[]) as feed_categories
      from news_articles
      where ${whereSql}
    )
    select
      source_country,
      source,
      count(*)::text as total,
      count(*) filter (where feed_category_count > 0)::text as with_feed_categories,
      count(*) filter (where feed_category_count > 0 and primary_section = 'others')::text as present_but_others,
      round(
        100.0 * count(*) filter (where feed_category_count > 0 and primary_section = 'others')
        / nullif(count(*) filter (where feed_category_count > 0), 0),
        1
      )::text as present_but_others_pct
    from recent
    group by source_country, source
    having count(*) filter (where feed_category_count > 0) >= $${nextParamIndex}
    order by count(*) filter (where feed_category_count > 0 and primary_section = 'others') desc, present_but_others_pct desc, count(*) desc
    limit $${nextParamIndex + 1}
  `, [options.minRecoverableRows, options.top]);
  return client.query<RecoverableSourceRow>(query.text, query.values);
}

async function queryTopUnmappedCategories(client: Client, options: CliOptions) {
  const query = buildRecentQuery(options, (whereSql, nextParamIndex) => `
    with recent as (
      select
        source_country,
        source,
        coalesce(cardinality(feed_categories), 0) as feed_category_count,
        coalesce(nullif(trim(primary_section), ''), 'others') as primary_section,
        coalesce(feed_categories, '{}'::text[]) as feed_categories
      from news_articles
      where ${whereSql}
    ),
    expanded as (
      select
        source_country,
        source,
        trim(category) as category
      from recent
      cross join lateral unnest(feed_categories) as category
      where feed_category_count > 0
        and primary_section = 'others'
        and trim(category) <> ''
    ),
    category_totals as (
      select
        category,
        count(*)::text as article_count,
        count(distinct source)::text as source_count
      from expanded
      group by category
    ),
    category_source_rank as (
      select
        category,
        source,
        source_country,
        count(*) as article_count,
        row_number() over (
          partition by category
          order by count(*) desc, source asc
        ) as rn
      from expanded
      group by category, source, source_country
    ),
    sample_sources as (
      select
        category,
        string_agg(format('%s (%s)', source, coalesce(source_country, '(unknown)')), ', ' order by article_count desc, source asc) as sample_sources
      from category_source_rank
      where rn <= 3
      group by category
    )
    select
      totals.category,
      totals.article_count,
      totals.source_count,
      coalesce(samples.sample_sources, '') as sample_sources
    from category_totals totals
    left join sample_sources samples on samples.category = totals.category
    order by totals.article_count::int desc, totals.category asc
    limit $${nextParamIndex}
  `, [options.top]);
  return client.query<CategoryRow>(query.text, query.values);
}

function buildRecommendations(input: {
  totals: AuditReport['totals'];
  topSourcesMissingSignal: MissingSignalSourceRow[];
  topSourcesRecoverable: RecoverableSourceRow[];
  topUnmappedCategories: CategoryRow[];
}): string[] {
  const recommendations: string[] = [];
  if (input.totals.feedCategoriesEmptyPct >= input.totals.presentButOthersPct) {
    recommendations.push(
      `Prioritize input-signal recovery first: empty feed_categories is ${formatPercent(input.totals.feedCategoriesEmptyPct)} of recent volume.`
    );
  }
  if (input.topUnmappedCategories.length > 0) {
    recommendations.push(
      `Patch deterministic mapping for top category strings first: ${input.topUnmappedCategories.slice(0, 5).map((row) => row.category).join(', ')}.`
    );
  }
  if (input.topSourcesMissingSignal.length > 0) {
    recommendations.push(
      `Evaluate article-page category extraction for sitemap-heavy sources: ${input.topSourcesMissingSignal.slice(0, 5).map((row) => row.source).join(', ')}.`
    );
  }
  if (input.topSourcesRecoverable.length > 0) {
    recommendations.push(
      `Add source-specific rules only for high-yield misses: ${input.topSourcesRecoverable.slice(0, 5).map((row) => row.source).join(', ')}.`
    );
  }
  return recommendations;
}

function printConsoleSummary(report: AuditReport): void {
  console.log(`[taxonomy-audit] window=${report.windowHours}h db=${redactDatabaseUrl(report.databaseUrlUsed)}`);
  console.log(
    `[taxonomy-audit] total=${formatInt(report.totals.total)} empty_feed_categories=${formatInt(report.totals.feedCategoriesEmpty)} (${formatPercent(report.totals.feedCategoriesEmptyPct)}) others=${formatInt(report.totals.primarySectionOthers)} (${formatPercent(report.totals.primarySectionOthersPct)})`
  );
  console.log(
    `[taxonomy-audit] both_empty_and_others=${formatInt(report.totals.bothEmptyAndOthers)} (${formatPercent(report.totals.bothPct)}) present_but_others=${formatInt(report.totals.presentButOthers)}/${formatInt(report.totals.totalWithFeedCategories)} (${formatPercent(report.totals.presentButOthersPct)})`
  );
  console.log(
    `[taxonomy-audit] top_missing_signal=${report.topSourcesMissingSignal.slice(0, 5).map((row) => `${row.source}:${formatInt(row.emptyAndOthers)}`).join(', ') || 'none'}`
  );
  console.log(
    `[taxonomy-audit] top_recoverable=${report.topSourcesRecoverable.slice(0, 5).map((row) => `${row.source}:${formatInt(row.presentButOthers)}`).join(', ') || 'none'}`
  );
  console.log(
    `[taxonomy-audit] top_unmapped_categories=${report.topUnmappedCategories.slice(0, 8).map((row) => `${row.category}:${formatInt(row.articleCount)}`).join(', ') || 'none'}`
  );
}

function renderMarkdown(report: AuditReport): string {
  const lines: string[] = [];
  lines.push('# Category Taxonomy Audit');
  lines.push('');
  lines.push(`- Generated at: ${report.generatedAt}`);
  lines.push(`- Window: last ${report.windowHours} hours`);
  lines.push(`- Database: \`${redactDatabaseUrl(report.databaseUrlUsed)}\``);
  if (report.filters.countries.length > 0) {
    lines.push(`- Countries filter: ${report.filters.countries.join(', ')}`);
  }
  if (report.filters.sources.length > 0) {
    lines.push(`- Sources filter: ${report.filters.sources.join(', ')}`);
  }
  lines.push('');
  lines.push('## Baseline');
  lines.push('');
  lines.push(`- Total articles: ${formatInt(report.totals.total)}`);
  lines.push(`- Empty \`feed_categories\`: ${formatInt(report.totals.feedCategoriesEmpty)} (${formatPercent(report.totals.feedCategoriesEmptyPct)})`);
  lines.push(`- \`primary_section='others'\`: ${formatInt(report.totals.primarySectionOthers)} (${formatPercent(report.totals.primarySectionOthersPct)})`);
  lines.push(`- Empty \`feed_categories\` and \`others\`: ${formatInt(report.totals.bothEmptyAndOthers)} (${formatPercent(report.totals.bothPct)})`);
  lines.push(
    `- \`feed_categories\` present but still \`others\`: ${formatInt(report.totals.presentButOthers)} / ${formatInt(report.totals.totalWithFeedCategories)} (${formatPercent(report.totals.presentButOthersPct)})`
  );
  lines.push('');
  lines.push('## Top Countries By Others Volume');
  lines.push('');
  lines.push('| Country | Total | Others | Others % | Empty feed_categories | Empty + Others | Present + Others |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const row of report.topCountriesByOthers) {
    lines.push(`| ${row.country} | ${formatInt(row.total)} | ${formatInt(row.othersCount)} | ${formatPercent(row.othersPct)} | ${formatInt(row.emptyFeedCategories)} | ${formatInt(row.emptyAndOthers)} | ${formatInt(row.presentButOthers)} |`);
  }
  lines.push('');
  lines.push('## Top Sources With Missing-Signal Problems');
  lines.push('');
  lines.push('| Country | Source | Total | Empty feed_categories | Others | Empty + Others | Empty + Others % |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: |');
  for (const row of report.topSourcesMissingSignal) {
    lines.push(`| ${row.country} | ${row.source} | ${formatInt(row.total)} | ${formatInt(row.emptyFeedCategories)} | ${formatInt(row.othersCount)} | ${formatInt(row.emptyAndOthers)} | ${formatPercent(row.emptyAndOthersPct)} |`);
  }
  lines.push('');
  lines.push('## Top Sources With Recoverable Mapping Problems');
  lines.push('');
  lines.push('| Country | Source | Total | With feed_categories | Present + Others | Present + Others % |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: |');
  for (const row of report.topSourcesRecoverable) {
    lines.push(`| ${row.country} | ${row.source} | ${formatInt(row.total)} | ${formatInt(row.withFeedCategories)} | ${formatInt(row.presentButOthers)} | ${formatPercent(row.presentButOthersPct)} |`);
  }
  lines.push('');
  lines.push('## Top Unmapped Category Strings');
  lines.push('');
  lines.push('| Category | Articles | Sources | Example sources |');
  lines.push('| --- | ---: | ---: | --- |');
  for (const row of report.topUnmappedCategories) {
    lines.push(`| ${row.category} | ${formatInt(row.articleCount)} | ${formatInt(row.sourceCount)} | ${escapeMdTableCell(row.sampleSources)} |`);
  }
  lines.push('');
  lines.push('## Recommended Next Moves');
  lines.push('');
  for (const recommendation of report.recommendations) {
    lines.push(`- ${recommendation}`);
  }
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- This report is meant to guide deterministic taxonomy work before AI fallback evaluation.');
  lines.push('- High `empty feed_categories` points to extraction gaps.');
  lines.push('- High `present + others` points to mapping or heuristic gaps.');
  return `${lines.join('\n')}\n`;
}

function buildRecentQuery(
  options: CliOptions,
  buildSql: (whereSql: string, nextParamIndex: number) => string,
  extraValues: unknown[] = [],
): { text: string; values: unknown[] } {
  const values: unknown[] = [options.hours];
  const conditions = [`created_at >= now() - ($1::int * interval '1 hour')`];

  if (options.countries.length > 0) {
    values.push(options.countries);
    conditions.push(`source_country = any($${values.length}::text[])`);
  }
  if (options.sources.length > 0) {
    values.push(options.sources);
    conditions.push(`source = any($${values.length}::text[])`);
  }

  values.push(...extraValues);
  return {
    text: buildSql(conditions.join('\n        and '), values.length - extraValues.length + 1),
    values,
  };
}

async function connectWithFallback(explicitUrl: string | null): Promise<{ client: Client; databaseUrlUsed: string }> {
  const candidates = unique([
    explicitUrl || '',
    process.env.DATABASE_URL || '',
    resolveDatabaseUrl(),
    'postgresql://postgres:postgres@127.0.0.1:1304/wpr',
    'postgresql://postgres:postgres@127.0.0.1:5432/wpr',
  ]).filter(Boolean);

  let lastError: unknown = null;
  for (const candidate of candidates) {
    const client = new Client({ connectionString: candidate });
    try {
      await client.connect();
      await client.query('select 1');
      return { client, databaseUrlUsed: candidate };
    } catch (error) {
      lastError = error;
      await client.end().catch(() => undefined);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unable to connect to PostgreSQL for taxonomy audit');
}

function parseIntArg(argv: string[], name: string, fallback: number, min: number, max: number): number {
  const raw = parseArgValue(argv, name);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseBoolArg(argv: string[], name: string): boolean {
  return argv.includes(`--${name}`);
}

function parseCsvArg(argv: string[], name: string): string[] {
  const raw = parseArgValue(argv, name);
  if (!raw) return [];
  return unique(raw.split(',').map((value) => value.trim()).filter(Boolean));
}

function parseArgValue(argv: string[], name: string): string | null {
  const match = argv.find((arg) => arg.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : null;
}

function toInt(value: string | null | undefined): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toFloat(value: string | null | undefined): number {
  const parsed = Number.parseFloat(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatInt(value: number): string {
  return value.toLocaleString();
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function normalizeLabel(value: string | null | undefined): string {
  const trimmed = (value || '').trim();
  return trimmed || '(unknown)';
}

function redactDatabaseUrl(value: string): string {
  try {
    const url = new URL(value);
    const auth = url.username ? `${url.username}:***@` : '';
    const port = url.port ? `:${url.port}` : '';
    return `${url.protocol}//${auth}${url.hostname}${port}${url.pathname}`;
  } catch {
    return value;
  }
}

function escapeMdTableCell(value: string): string {
  return value.replace(/\|/g, '\\|');
}
