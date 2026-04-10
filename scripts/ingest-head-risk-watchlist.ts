#!/usr/bin/env bun
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Pool } from 'pg';
import { resolveDatabaseUrl } from '@/lib/database-url';

type AtlasFeed = {
  name: string;
  url?: string | null;
  sitemapUrl?: string | null;
  schedulingSource?: string | null;
};

type AtlasCountry = {
  name: string;
  feeds: AtlasFeed[];
};

type Atlas = {
  countries: AtlasCountry[];
};

type SourceCountryRow = {
  source: string;
  country: string;
};

type HeadSourceRow = SourceCountryRow & {
  created24h: number;
};

type HourlyPeakRow = SourceCountryRow & {
  peakPublished1h: number;
};

type HealthAggregateRow = SourceCountryRow & {
  rssSuccessRuns: number;
  rssFailRuns: number;
  rssMinFetched: number | null;
  rssMedianFetched: number | null;
  rssCappedRuns: number;
  sitemapSuccessRuns: number;
  sitemapFailRuns: number;
  sitemapCappedRuns: number;
  latestRanAt: string | null;
};

type AtlasMethodInfo = {
  hasRss: boolean;
  hasSitemap: boolean;
};

type SchedulingSiblingInfo = SourceCountryRow & {
  hasRss: boolean;
  hasSitemap: boolean;
};

type RiskMode = 'strict' | 'one-miss' | 'all';

type CliOptions = {
  atlasPath: string;
  headHours: number;
  headMinCreated24h: number;
  historyDays: number;
  healthHours: number;
  mode: RiskMode;
  outputCsvPath: string;
  outputSchedulingCsvPath: string;
  outputSchedulingMdPath: string;
};

type WatchlistRow = {
  source: string;
  country: string;
  created24h: number;
  peakPublished1h: number;
  rssMinFetched48h: number;
  rssMedianFetched48h: number;
  rssSuccessRuns48h: number;
  rssFailRuns48h: number;
  rssCappedRuns48h: number;
  sitemapSuccessRuns48h: number;
  sitemapFailRuns48h: number;
  sitemapCappedRuns48h: number;
  peakVsRssMedian: number;
  twoHourVsRssMin: number;
  riskBand: 'STRICT' | 'ONE_MISS';
  rationale: string;
};

type SchedulingCoverageStatus =
  | 'NO_SCHEDULING_SIBLINGS'
  | 'CONFIGURED_NOT_ACTIVE'
  | 'ACTIVE_SIBLING_RSS_COVERAGE'
  | 'ACTIVE_SIBLING_SITEMAP_COVERAGE';

type SchedulingCoverageRow = {
  source: string;
  country: string;
  riskBand: 'STRICT' | 'ONE_MISS';
  created24h: number;
  configuredSiblingCount: number;
  siblingsSeenInCreated24h: number;
  siblingCreated24hSum: number;
  siblingRssSuccessRuns48h: number;
  siblingSitemapSuccessRuns48h: number;
  siblingLatestRanAt: string;
  status: SchedulingCoverageStatus;
  configuredSiblingNames: string;
  activeSiblingNames: string;
  rationale: string;
};

function parseArgValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

function parseIntArg(name: string, fallback: number, min: number, max: number): number {
  const raw = parseArgValue(name);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseModeArg(): RiskMode {
  const raw = (parseArgValue('mode') || 'strict').trim().toLowerCase();
  if (raw === 'strict' || raw === 'one-miss' || raw === 'all') return raw;
  return 'strict';
}

function buildDefaultOutputPath(mode: RiskMode): string {
  if (mode === 'strict') {
    return resolve(process.cwd(), 'audits/ingest_head_rss_strict_risk_watchlist_latest.csv');
  }
  if (mode === 'one-miss') {
    return resolve(process.cwd(), 'audits/ingest_head_rss_one_miss_watchlist_latest.csv');
  }
  return resolve(process.cwd(), 'audits/ingest_head_rss_risk_watchlist_latest.csv');
}

function buildDefaultSchedulingOutputPath(mode: RiskMode, extension: 'csv' | 'md'): string {
  const base =
    mode === 'strict'
      ? 'ingest_head_rss_strict_risk_scheduling_coverage_latest'
      : mode === 'one-miss'
        ? 'ingest_head_rss_one_miss_scheduling_coverage_latest'
        : 'ingest_head_rss_risk_scheduling_coverage_latest';
  return resolve(process.cwd(), `audits/${base}.${extension}`);
}

function parseOptions(): CliOptions {
  const mode = parseModeArg();
  const outputCsvPath = parseArgValue('output-csv')
    ? resolve(process.cwd(), parseArgValue('output-csv')!)
    : buildDefaultOutputPath(mode);

  return {
    atlasPath: process.env.ATLAS_PATH || resolve(process.cwd(), 'data/rss-atlas.json'),
    headHours: parseIntArg('head-hours', 24, 1, 24 * 30),
    headMinCreated24h: parseIntArg('head-min-created', 50, 1, 100000),
    historyDays: parseIntArg('history-days', 7, 1, 30),
    healthHours: parseIntArg('health-hours', 48, 1, 24 * 30),
    mode,
    outputCsvPath,
    outputSchedulingCsvPath: buildDefaultSchedulingOutputPath(mode, 'csv'),
    outputSchedulingMdPath: buildDefaultSchedulingOutputPath(mode, 'md'),
  };
}

function makeKey(source: string, country: string): string {
  return `${source}|||${country}`;
}

function loadAtlasData(atlasPath: string): {
  methodsByKey: Map<string, AtlasMethodInfo>;
  siblingsByParentKey: Map<string, SchedulingSiblingInfo[]>;
} {
  const raw = readFileSync(atlasPath, 'utf8');
  const parsed = JSON.parse(raw) as Atlas;
  if (!Array.isArray(parsed.countries)) {
    throw new Error(`Invalid atlas format in ${atlasPath}`);
  }

  const methodsByKey = new Map<string, AtlasMethodInfo>();
  const siblingsByParentKey = new Map<string, SchedulingSiblingInfo[]>();

  for (const country of parsed.countries) {
    const countryName = (country.name || 'Global').trim() || 'Global';
    for (const feed of country.feeds || []) {
      const key = makeKey(feed.name, countryName);
      const current = methodsByKey.get(key) || { hasRss: false, hasSitemap: false };
      if ((feed.url || '').trim()) current.hasRss = true;
      if ((feed.sitemapUrl || '').trim()) current.hasSitemap = true;
      methodsByKey.set(key, current);

      const schedulingSource = (feed.schedulingSource || '').trim();
      if (!schedulingSource || schedulingSource === feed.name) continue;

      const parentKey = makeKey(schedulingSource, countryName);
      const siblings = siblingsByParentKey.get(parentKey) || [];
      siblings.push({
        source: feed.name,
        country: countryName,
        hasRss: Boolean((feed.url || '').trim()),
        hasSitemap: Boolean((feed.sitemapUrl || '').trim()),
      });
      siblingsByParentKey.set(parentKey, siblings);
    }
  }

  return { methodsByKey, siblingsByParentKey };
}

function coerceInt(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function coerceNullableInt(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

async function readHeadSources(db: Pool, options: CliOptions): Promise<HeadSourceRow[]> {
  const result = await db.query<{
    source: string;
    country: string | null;
    created_24h: string;
  }>(
    `
    select source, country, count(*)::text as created_24h
    from news_articles
    where created_at > now() - ($1::int * interval '1 hour')
    group by source, country
    having count(*) >= $2::int
    order by count(*) desc, source asc
    `,
    [options.headHours, options.headMinCreated24h]
  );

  return result.rows.map((row) => ({
    source: row.source,
    country: row.country || 'Global',
    created24h: coerceInt(row.created_24h),
  }));
}

async function readHourlyPeaks(
  db: Pool,
  sourceRows: SourceCountryRow[],
  options: CliOptions
): Promise<Map<string, HourlyPeakRow>> {
  if (!sourceRows.length) return new Map();
  const sources = sourceRows.map((row) => row.source);
  const countries = sourceRows.map((row) => row.country);

  const result = await db.query<{
    source: string;
    country: string | null;
    peak_published_1h: string;
  }>(
    `
    with requested(source, country) as (
      select distinct * from unnest($1::text[], $2::text[])
    ),
    hourly as (
      select source, country, date_trunc('hour', publication_datetime) as hour_bucket, count(*)::int as cnt
      from news_articles
      where publication_datetime > now() - ($3::int * interval '1 day')
      group by source, country, hour_bucket
    )
    select requested.source, requested.country, max(hourly.cnt)::text as peak_published_1h
    from requested
    join hourly using (source, country)
    group by requested.source, requested.country
    `,
    [sources, countries, options.historyDays]
  );

  const map = new Map<string, HourlyPeakRow>();
  for (const row of result.rows) {
    const country = row.country || 'Global';
    map.set(makeKey(row.source, country), {
      source: row.source,
      country,
      peakPublished1h: coerceInt(row.peak_published_1h),
    });
  }
  return map;
}

async function readHealthAggregates(
  db: Pool,
  sourceRows: SourceCountryRow[],
  options: CliOptions
): Promise<Map<string, HealthAggregateRow>> {
  if (!sourceRows.length) return new Map();
  const sources = sourceRows.map((row) => row.source);
  const countries = sourceRows.map((row) => row.country);

  const result = await db.query<{
    source: string;
    country: string | null;
    rss_success_runs: string;
    rss_fail_runs: string;
    rss_min_fetched: string | null;
    rss_median_fetched: string | null;
    rss_capped_runs: string;
    sitemap_success_runs: string;
    sitemap_fail_runs: string;
    sitemap_capped_runs: string;
    latest_ran_at: string | null;
  }>(
    `
    with requested(source, country) as (
      select distinct * from unnest($1::text[], $2::text[])
    )
    select
      requested.source,
      requested.country,
      count(*) filter (where rhs.attempted and rhs.ok and rhs.method = 'rss')::text as rss_success_runs,
      count(*) filter (where rhs.attempted and not rhs.ok and rhs.method = 'rss')::text as rss_fail_runs,
      min(rhs.fetched_count) filter (where rhs.attempted and rhs.ok and rhs.method = 'rss')::text as rss_min_fetched,
      percentile_disc(0.5) within group (order by rhs.fetched_count)
        filter (where rhs.attempted and rhs.ok and rhs.method = 'rss')::text as rss_median_fetched,
      count(*) filter (where rhs.attempted and rhs.ok and rhs.method = 'rss' and rhs.sample_capped)::text as rss_capped_runs,
      count(*) filter (where rhs.attempted and rhs.ok and rhs.method = 'sitemap')::text as sitemap_success_runs,
      count(*) filter (where rhs.attempted and not rhs.ok and rhs.method = 'sitemap')::text as sitemap_fail_runs,
      count(*) filter (where rhs.attempted and rhs.ok and rhs.method = 'sitemap' and rhs.sample_capped)::text as sitemap_capped_runs,
      max(rhs.ran_at)::text as latest_ran_at
    from requested
    left join rss_health_status rhs
      on rhs.source = requested.source
      and rhs.country = requested.country
      and rhs.runner = 'worker'
      and rhs.ran_at > now() - ($3::int * interval '1 hour')
    group by requested.source, requested.country
    `,
    [sources, countries, options.healthHours]
  );

  const map = new Map<string, HealthAggregateRow>();
  for (const row of result.rows) {
    const country = row.country || 'Global';
    map.set(makeKey(row.source, country), {
      source: row.source,
      country,
      rssSuccessRuns: coerceInt(row.rss_success_runs),
      rssFailRuns: coerceInt(row.rss_fail_runs),
      rssMinFetched: coerceNullableInt(row.rss_min_fetched),
      rssMedianFetched: coerceNullableInt(row.rss_median_fetched),
      rssCappedRuns: coerceInt(row.rss_capped_runs),
      sitemapSuccessRuns: coerceInt(row.sitemap_success_runs),
      sitemapFailRuns: coerceInt(row.sitemap_fail_runs),
      sitemapCappedRuns: coerceInt(row.sitemap_capped_runs),
      latestRanAt: row.latest_ran_at,
    });
  }
  return map;
}

async function readCreatedCounts(
  db: Pool,
  sourceRows: SourceCountryRow[],
  hours: number
): Promise<Map<string, number>> {
  if (!sourceRows.length) return new Map();
  const sources = sourceRows.map((row) => row.source);
  const countries = sourceRows.map((row) => row.country);

  const result = await db.query<{
    source: string;
    country: string | null;
    created_24h: string;
  }>(
    `
    with requested(source, country) as (
      select distinct * from unnest($1::text[], $2::text[])
    )
    select
      requested.source,
      requested.country,
      count(news_articles.*)::text as created_24h
    from requested
    left join news_articles
      on news_articles.source = requested.source
      and coalesce(news_articles.country, 'Global') = requested.country
      and news_articles.created_at > now() - ($3::int * interval '1 hour')
    group by requested.source, requested.country
    `,
    [sources, countries, hours]
  );

  const map = new Map<string, number>();
  for (const row of result.rows) {
    map.set(makeKey(row.source, row.country || 'Global'), coerceInt(row.created_24h));
  }
  return map;
}

function formatCsvValue(value: string | number): string {
  const normalized = String(value);
  if (!/[",\n\r]/.test(normalized)) return normalized;
  return `"${normalized.replaceAll('"', '""')}"`;
}

function buildCsv(rows: WatchlistRow[]): string {
  const header = [
    'source',
    'country',
    'created24h',
    'peak_published_1h_7d',
    'rss_min_fetched_48h',
    'rss_median_fetched_48h',
    'rss_success_runs_48h',
    'rss_fail_runs_48h',
    'rss_capped_runs_48h',
    'sitemap_success_runs_48h',
    'sitemap_fail_runs_48h',
    'sitemap_capped_runs_48h',
    'peak_vs_rss_median',
    'two_hour_vs_rss_min',
    'risk_band',
    'rationale',
  ];

  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push([
      formatCsvValue(row.source),
      formatCsvValue(row.country),
      formatCsvValue(row.created24h),
      formatCsvValue(row.peakPublished1h),
      formatCsvValue(row.rssMinFetched48h),
      formatCsvValue(row.rssMedianFetched48h),
      formatCsvValue(row.rssSuccessRuns48h),
      formatCsvValue(row.rssFailRuns48h),
      formatCsvValue(row.rssCappedRuns48h),
      formatCsvValue(row.sitemapSuccessRuns48h),
      formatCsvValue(row.sitemapFailRuns48h),
      formatCsvValue(row.sitemapCappedRuns48h),
      formatCsvValue(row.peakVsRssMedian.toFixed(2)),
      formatCsvValue(row.twoHourVsRssMin.toFixed(2)),
      formatCsvValue(row.riskBand),
      formatCsvValue(row.rationale),
    ].join(','));
  }

  return `${lines.join('\n')}\n`;
}

function buildSchedulingCoverageCsv(rows: SchedulingCoverageRow[]): string {
  const header = [
    'source',
    'country',
    'risk_band',
    'created24h',
    'configured_sibling_count',
    'siblings_seen_in_created24h',
    'sibling_created24h_sum',
    'sibling_rss_success_runs_48h',
    'sibling_sitemap_success_runs_48h',
    'sibling_latest_ran_at',
    'status',
    'configured_sibling_names',
    'active_sibling_names',
    'rationale',
  ];

  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push([
      formatCsvValue(row.source),
      formatCsvValue(row.country),
      formatCsvValue(row.riskBand),
      formatCsvValue(row.created24h),
      formatCsvValue(row.configuredSiblingCount),
      formatCsvValue(row.siblingsSeenInCreated24h),
      formatCsvValue(row.siblingCreated24hSum),
      formatCsvValue(row.siblingRssSuccessRuns48h),
      formatCsvValue(row.siblingSitemapSuccessRuns48h),
      formatCsvValue(row.siblingLatestRanAt),
      formatCsvValue(row.status),
      formatCsvValue(row.configuredSiblingNames),
      formatCsvValue(row.activeSiblingNames),
      formatCsvValue(row.rationale),
    ].join(','));
  }

  return `${lines.join('\n')}\n`;
}

function buildSchedulingCoverageMarkdown(rows: SchedulingCoverageRow[], options: CliOptions): string {
  const byStatus = new Map<SchedulingCoverageStatus, number>();
  for (const row of rows) {
    byStatus.set(row.status, (byStatus.get(row.status) || 0) + 1);
  }

  const lines = [
    '# Scheduling Coverage View',
    '',
    `- Mode: \`${options.mode}\``,
    `- Head window: last \`${options.headHours}h\``,
    `- Health window: last \`${options.healthHours}h\``,
    `- Rows: \`${rows.length}\``,
    '',
    '## Status Summary',
    '',
    `- NO_SCHEDULING_SIBLINGS: \`${byStatus.get('NO_SCHEDULING_SIBLINGS') || 0}\``,
    `- CONFIGURED_NOT_ACTIVE: \`${byStatus.get('CONFIGURED_NOT_ACTIVE') || 0}\``,
    `- ACTIVE_SIBLING_RSS_COVERAGE: \`${byStatus.get('ACTIVE_SIBLING_RSS_COVERAGE') || 0}\``,
    `- ACTIVE_SIBLING_SITEMAP_COVERAGE: \`${byStatus.get('ACTIVE_SIBLING_SITEMAP_COVERAGE') || 0}\``,
    '',
    '## Rows',
    '',
    '| Source | Country | Risk | Status | Siblings | Created24h Sum | RSS Runs | Sitemap Runs | Active Siblings |',
    '| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |',
  ];

  for (const row of rows) {
    lines.push(
      `| ${row.source} | ${row.country} | ${row.riskBand} | ${row.status} | ${row.configuredSiblingCount} | ${row.siblingCreated24hSum} | ${row.siblingRssSuccessRuns48h} | ${row.siblingSitemapSuccessRuns48h} | ${row.activeSiblingNames || '-'} |`
    );
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

function buildWatchlistRows(
  headSources: HeadSourceRow[],
  atlasMethods: Map<string, AtlasMethodInfo>,
  peaks: Map<string, HourlyPeakRow>,
  health: Map<string, HealthAggregateRow>,
  mode: RiskMode
): WatchlistRow[] {
  const rows: WatchlistRow[] = [];

  for (const head of headSources) {
    const key = makeKey(head.source, head.country);
    const methods = atlasMethods.get(key) || { hasRss: false, hasSitemap: false };
    if (!methods.hasRss || methods.hasSitemap) continue;

    const peak = peaks.get(key);
    const aggregate = health.get(key);
    if (!peak || !aggregate || aggregate.rssMinFetched === null || aggregate.rssMedianFetched === null) {
      continue;
    }

    const strictRisk = peak.peakPublished1h >= aggregate.rssMinFetched;
    const oneMissRisk = peak.peakPublished1h < aggregate.rssMinFetched
      && peak.peakPublished1h * 2 >= aggregate.rssMinFetched;

    if (
      (mode === 'strict' && !strictRisk) ||
      (mode === 'one-miss' && !oneMissRisk) ||
      (mode === 'all' && !strictRisk && !oneMissRisk)
    ) {
      continue;
    }

    const peakVsMedian = aggregate.rssMedianFetched > 0
      ? peak.peakPublished1h / aggregate.rssMedianFetched
      : 0;
    const twoHourVsMin = aggregate.rssMinFetched > 0
      ? (peak.peakPublished1h * 2) / aggregate.rssMinFetched
      : 0;
    const riskBand = strictRisk ? 'STRICT' : 'ONE_MISS';

    rows.push({
      source: head.source,
      country: head.country,
      created24h: head.created24h,
      peakPublished1h: peak.peakPublished1h,
      rssMinFetched48h: aggregate.rssMinFetched,
      rssMedianFetched48h: aggregate.rssMedianFetched,
      rssSuccessRuns48h: aggregate.rssSuccessRuns,
      rssFailRuns48h: aggregate.rssFailRuns,
      rssCappedRuns48h: aggregate.rssCappedRuns,
      sitemapSuccessRuns48h: aggregate.sitemapSuccessRuns,
      sitemapFailRuns48h: aggregate.sitemapFailRuns,
      sitemapCappedRuns48h: aggregate.sitemapCappedRuns,
      peakVsRssMedian: peakVsMedian,
      twoHourVsRssMin: twoHourVsMin,
      riskBand,
      rationale: strictRisk
        ? 'rss_only_head_and_peak_1h_meets_or_exceeds_observed_rss_depth'
        : 'rss_only_head_and_single_skip_can_exceed_observed_rss_depth',
    });
  }

  rows.sort((a, b) => {
    const bandScore = (value: WatchlistRow['riskBand']) => value === 'STRICT' ? 1 : 0;
    const byBand = bandScore(b.riskBand) - bandScore(a.riskBand);
    if (byBand !== 0) return byBand;
    const byPeakRatio = b.peakVsRssMedian - a.peakVsRssMedian;
    if (byPeakRatio !== 0) return byPeakRatio;
    const byPeak = b.peakPublished1h - a.peakPublished1h;
    if (byPeak !== 0) return byPeak;
    return b.created24h - a.created24h;
  });

  return rows;
}

function buildSchedulingCoverageRows(params: {
  watchlistRows: WatchlistRow[];
  siblingsByParentKey: Map<string, SchedulingSiblingInfo[]>;
  siblingCreatedCounts: Map<string, number>;
  siblingHealth: Map<string, HealthAggregateRow>;
}): SchedulingCoverageRow[] {
  const rows: SchedulingCoverageRow[] = [];

  for (const watchlistRow of params.watchlistRows) {
    const parentKey = makeKey(watchlistRow.source, watchlistRow.country);
    const siblings = (params.siblingsByParentKey.get(parentKey) || []).filter((sibling) => sibling.source !== watchlistRow.source);

    let siblingsSeenInCreated24h = 0;
    let siblingCreated24hSum = 0;
    let siblingRssSuccessRuns48h = 0;
    let siblingSitemapSuccessRuns48h = 0;
    let siblingLatestRanAt: string | null = null;
    const activeSiblingNames: string[] = [];

    for (const sibling of siblings) {
      const siblingKey = makeKey(sibling.source, sibling.country);
      const created24h = params.siblingCreatedCounts.get(siblingKey) || 0;
      const aggregate = params.siblingHealth.get(siblingKey);
      siblingCreated24hSum += created24h;
      if (created24h > 0) {
        siblingsSeenInCreated24h += 1;
        activeSiblingNames.push(sibling.source);
      }
      siblingRssSuccessRuns48h += aggregate?.rssSuccessRuns || 0;
      siblingSitemapSuccessRuns48h += aggregate?.sitemapSuccessRuns || 0;
      if (aggregate?.latestRanAt && (!siblingLatestRanAt || aggregate.latestRanAt > siblingLatestRanAt)) {
        siblingLatestRanAt = aggregate.latestRanAt;
      }
    }

    let status: SchedulingCoverageStatus = 'NO_SCHEDULING_SIBLINGS';
    if (siblings.length > 0) {
      if (siblingsSeenInCreated24h === 0 && siblingRssSuccessRuns48h === 0 && siblingSitemapSuccessRuns48h === 0) {
        status = 'CONFIGURED_NOT_ACTIVE';
      } else if (siblingSitemapSuccessRuns48h > 0) {
        status = 'ACTIVE_SIBLING_SITEMAP_COVERAGE';
      } else {
        status = 'ACTIVE_SIBLING_RSS_COVERAGE';
      }
    }

    rows.push({
      source: watchlistRow.source,
      country: watchlistRow.country,
      riskBand: watchlistRow.riskBand,
      created24h: watchlistRow.created24h,
      configuredSiblingCount: siblings.length,
      siblingsSeenInCreated24h,
      siblingCreated24hSum,
      siblingRssSuccessRuns48h,
      siblingSitemapSuccessRuns48h,
      siblingLatestRanAt: siblingLatestRanAt || '-',
      status,
      configuredSiblingNames: siblings.map((sibling) => sibling.source).join(' | '),
      activeSiblingNames: activeSiblingNames.join(' | '),
      rationale:
        status === 'NO_SCHEDULING_SIBLINGS'
          ? 'no_scheduling_source_children_configured'
          : status === 'CONFIGURED_NOT_ACTIVE'
            ? 'scheduling_source_children_configured_but_not_seen_recently'
            : status === 'ACTIVE_SIBLING_SITEMAP_COVERAGE'
              ? 'scheduling_source_children_active_with_recent_sitemap_coverage'
              : 'scheduling_source_children_active_with_recent_rss_coverage',
    });
  }

  return rows;
}

async function main(): Promise<void> {
  const options = parseOptions();
  const atlasData = loadAtlasData(options.atlasPath);
  const db = new Pool({
    connectionString: resolveDatabaseUrl(),
    max: 4,
  });

  try {
    const headSources = await readHeadSources(db, options);
    const peaks = await readHourlyPeaks(db, headSources, options);
    const health = await readHealthAggregates(db, headSources, options);
    const rows = buildWatchlistRows(headSources, atlasData.methodsByKey, peaks, health, options.mode);

    const siblingSourceRows = [...new Set(
      rows.flatMap((row) => (atlasData.siblingsByParentKey.get(makeKey(row.source, row.country)) || [])
        .map((sibling) => makeKey(sibling.source, sibling.country)))
    )]
      .map((key) => {
        const [source, country] = key.split('|||');
        return { source, country } satisfies SourceCountryRow;
      });

    const siblingCreatedCounts = await readCreatedCounts(db, siblingSourceRows, options.headHours);
    const siblingHealth = await readHealthAggregates(db, siblingSourceRows, options);
    const schedulingRows = buildSchedulingCoverageRows({
      watchlistRows: rows,
      siblingsByParentKey: atlasData.siblingsByParentKey,
      siblingCreatedCounts,
      siblingHealth,
    });

    mkdirSync(dirname(options.outputCsvPath), { recursive: true });
    mkdirSync(dirname(options.outputSchedulingCsvPath), { recursive: true });
    writeFileSync(options.outputCsvPath, buildCsv(rows), 'utf8');
    writeFileSync(options.outputSchedulingCsvPath, buildSchedulingCoverageCsv(schedulingRows), 'utf8');
    writeFileSync(options.outputSchedulingMdPath, buildSchedulingCoverageMarkdown(schedulingRows, options), 'utf8');

    const strictCount = rows.filter((row) => row.riskBand === 'STRICT').length;
    const oneMissCount = rows.filter((row) => row.riskBand === 'ONE_MISS').length;
    const activeSiblingCoverageCount = schedulingRows.filter((row) =>
      row.status === 'ACTIVE_SIBLING_RSS_COVERAGE' || row.status === 'ACTIVE_SIBLING_SITEMAP_COVERAGE'
    ).length;

    console.log(`[ingest-head-risk-watchlist] mode=${options.mode}`);
    console.log(`[ingest-head-risk-watchlist] head_sources=${headSources.length}`);
    console.log(`[ingest-head-risk-watchlist] rows=${rows.length} strict=${strictCount} one_miss=${oneMissCount}`);
    console.log(`[ingest-head-risk-watchlist] wrote_csv=${options.outputCsvPath}`);
    console.log(`[ingest-head-risk-watchlist] scheduling_rows=${schedulingRows.length} active_sibling_coverage=${activeSiblingCoverageCount}`);
    console.log(`[ingest-head-risk-watchlist] wrote_scheduling_csv=${options.outputSchedulingCsvPath}`);
    console.log(`[ingest-head-risk-watchlist] wrote_scheduling_md=${options.outputSchedulingMdPath}`);
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[ingest-head-risk-watchlist] ${message}`);
  process.exitCode = 1;
});
