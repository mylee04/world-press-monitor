#!/usr/bin/env bun

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readIngestOpsDaily } from '../lib/ingestion-store';

type StabilityStatus = 'stable' | 'warning' | 'unstable' | 'no_data';
type AtlasAction = 'none' | 'disable' | 'delete';

type AtlasFeed = {
  name: string;
  url: string | null;
  status: string | null;
  checkedDate: string | null;
  valid: string | null;
  row: number;
  sitemapUrl?: string;
  enabled?: boolean;
};

type AtlasCountry = {
  name: string;
  code: string;
  feeds: AtlasFeed[];
};

type Atlas = {
  version: number;
  generatedAt: string;
  lastChecked: string;
  countries: AtlasCountry[];
};

type StabilityRow = {
  outletId: string;
  source: string;
  country: string;
  method: 'rss' | 'sitemap';
  days: number;
  attemptedRuns: number;
  successfulRuns: number;
  failedRuns: number;
  fetchedCount: number;
  validCount: number;
  missingTitleCount: number;
  missingSummaryCount: number;
  missingPublishedAtCount: number;
  missingLinkCount: number;
  status: StabilityStatus;
  failureRate: number;
  validPerAttempt: number;
};

type StabilitySummary = {
  generatedAt: string;
  days: number;
  runner: 'worker' | 'api_news' | 'warm';
  method?: 'rss' | 'sitemap';
  countries: string[];
  totalFeeds: number;
  stable: number;
  warning: number;
  unstable: number;
  noData: number;
  zeroAction: AtlasAction;
  zeroFeedCandidates: number;
  zeroFeedActionSummary: ZeroActionSummary;
  rows: StabilityRow[];
};

type ZeroActionSummary = {
  requested: number;
  matched: number;
  deleted: number;
  disabled: number;
  skipped: number;
  touched: number;
};

type CliOptions = {
  days: number;
  runner: 'worker' | 'api_news' | 'warm';
  method?: 'rss' | 'sitemap';
  countries: string[];
  outlets: string[];
  sources: string[];
  minAttempts: number;
  stableFailRate: number;
  warningFailRate: number;
  top: number;
  writeJson: boolean;
  zeroAction: AtlasAction;
  atlasPath: string;
};

const argv = process.argv.slice(2);
const options: CliOptions = {
  days: parseIntArg(argv, 'days', 1, 1, 365),
  runner: (parseArgValue(argv, 'runner') as 'worker' | 'api_news' | 'warm') || 'worker',
  method: parseMethodArg(argv, 'method'),
  countries: parseCsvArg(argv, 'countries'),
  outlets: parseCsvArg(argv, 'outlets'),
  sources: parseCsvArg(argv, 'sources'),
  minAttempts: parseIntArg(argv, 'min-attempts', 1, 1, 100000),
  stableFailRate: parseIntArg(argv, 'stable-fail-rate', 20, 0, 100),
  warningFailRate: parseIntArg(argv, 'warning-fail-rate', 60, 0, 100),
  top: parseIntArg(argv, 'top', 30, 1, 500),
  writeJson: parseBoolArg(argv, 'write-json'),
  zeroAction: parseZeroActionArg(argv),
  atlasPath: process.env.ATLAS_PATH || resolve(process.cwd(), 'data/rss-atlas.json')
};

const result = await run(options);

if (options.writeJson) {
  writeReport(result);
}

function runReportSummary(result: StabilitySummary): void {
  console.log(`[rss-stability] days=${result.days} runner=${result.runner} method=${result.method || 'rss+sitemap'}`);
  console.log(`[rss-stability] total=${result.totalFeeds} stable=${result.stable} warning=${result.warning} unstable=${result.unstable} no_data=${result.noData}`);
  console.log(
    `[rss-stability] zero-feed candidates=${result.zeroFeedCandidates} action=${result.zeroAction} touched=${result.zeroFeedActionSummary.touched} deleted=${result.zeroFeedActionSummary.deleted} disabled=${result.zeroFeedActionSummary.disabled} skipped=${result.zeroFeedActionSummary.skipped}`
  );
  if (result.rows.length === 0) {
    console.log('[rss-stability] no data in window');
    return;
  }

  const statusOrder: StabilityStatus[] = ['unstable', 'warning', 'stable', 'no_data'];
  for (const status of statusOrder) {
    const rows = result.rows.filter((row) => row.status === status).slice(0, 10);
    if (!rows.length) continue;
    console.log(`\n${status.toUpperCase()} (${rows.length})`);
    for (const row of rows) {
      const attempts = `${row.attemptedRuns}/${row.successfulRuns}/${row.failedRuns}`;
      const counts = `attempts=${attempts} fetched=${row.fetchedCount} valid=${row.validCount}`;
      const rates = `failure=${row.failureRate.toFixed(1)}% valid/attempt=${row.validPerAttempt.toFixed(2)}`;
      console.log(`  - ${row.outletId} / ${row.source} (${row.country}/${row.method}) ${counts} ${rates}`);
    }
  }
}

async function run(options: CliOptions): Promise<StabilitySummary> {
  const result = await readIngestOpsDaily({
    runner: options.runner,
    method: options.method,
    countries: options.countries,
    outletIds: options.outlets,
    sourceNames: options.sources,
    days: options.days,
    limit: 50000
  });

  if (result.storage !== 'postgres') {
    console.error(`[rss-stability] storage disabled: ${result.reason || 'unknown'}`);
    process.exitCode = 1;
    return {
      generatedAt: new Date().toISOString(),
      days: options.days,
      runner: options.runner,
      method: options.method,
      countries: options.countries,
      totalFeeds: 0,
      stable: 0,
      warning: 0,
      unstable: 0,
      noData: 0,
      zeroAction: options.zeroAction,
      zeroFeedCandidates: 0,
      zeroFeedActionSummary: {
        requested: 0,
        matched: 0,
        deleted: 0,
        disabled: 0,
        skipped: 0,
        touched: 0
      },
      rows: []
    };
  }

  const byFeed = new Map<string, StabilityRow>();
  for (const row of result.rows) {
    const key = `${row.outletId}|||${row.source}|||${row.method}`;
    const existing = byFeed.get(key);
    if (existing) {
      existing.attemptedRuns += row.attemptedRuns;
      existing.successfulRuns += row.successfulRuns;
      existing.failedRuns += row.failedRuns;
      existing.fetchedCount += row.fetchedCount;
      existing.validCount += row.validCount;
      existing.missingTitleCount += row.missingTitleCount;
      existing.missingSummaryCount += row.missingSummaryCount;
      existing.missingPublishedAtCount += row.missingPublishedAtCount;
      existing.missingLinkCount += row.missingLinkCount;
      existing.days += 1;
      continue;
    }
    byFeed.set(key, {
      outletId: row.outletId,
      source: row.source,
      country: row.country,
      method: row.method,
      days: 1,
      attemptedRuns: row.attemptedRuns,
      successfulRuns: row.successfulRuns,
      failedRuns: row.failedRuns,
      fetchedCount: row.fetchedCount,
      validCount: row.validCount,
      missingTitleCount: row.missingTitleCount,
      missingSummaryCount: row.missingSummaryCount,
      missingPublishedAtCount: row.missingPublishedAtCount,
      missingLinkCount: row.missingLinkCount,
      status: 'no_data',
      failureRate: 0,
      validPerAttempt: 0
    });
  }

  const rows = [...byFeed.values()].map((row) => {
    const attempts = row.attemptedRuns;
    const failures = row.failedRuns;
    const valid = row.validCount;
    const successRate = attempts > 0 ? ((attempts - failures) / attempts) * 100 : 0;
    const status: StabilityStatus = attempts < options.minAttempts
      ? 'no_data'
      : valid === 0
        ? 'unstable'
        : successRate >= (100 - options.stableFailRate)
          ? 'stable'
          : successRate >= (100 - options.warningFailRate)
            ? 'warning'
            : 'unstable';

    return {
      ...row,
      status,
      failureRate: attempts > 0 ? (failures / attempts) * 100 : 0,
      validPerAttempt: attempts > 0 ? valid / attempts : 0
    };
  });

  const sorted: StabilityRow[] = rows
    .sort((a, b) => {
      if (a.status !== b.status) {
        const order: Record<StabilityStatus, number> = { stable: 0, warning: 1, unstable: 2, no_data: 3 };
        return order[a.status] - order[b.status] || b.validCount - a.validCount;
      }
      return b.validCount - a.validCount;
    })
    .map((row): StabilityRow => ({ ...row }));

  const zeroCandidates = sorted.filter(
    (row) => row.status === 'unstable' && row.method === 'rss' && row.attemptedRuns >= options.minAttempts && row.validCount === 0
  );
  const zeroActionSummary = runZeroFeedAction({
    action: options.zeroAction,
    atlasPath: options.atlasPath,
    zeroCandidates
  });

  const report: StabilitySummary = {
    generatedAt: new Date().toISOString(),
    days: options.days,
    runner: options.runner,
    method: options.method,
    countries: options.countries,
    totalFeeds: sorted.length,
    stable: sorted.filter((row) => row.status === 'stable').length,
    warning: sorted.filter((row) => row.status === 'warning').length,
    unstable: sorted.filter((row) => row.status === 'unstable').length,
    noData: sorted.filter((row) => row.status === 'no_data').length,
    zeroAction: options.zeroAction,
    zeroFeedCandidates: zeroCandidates.length,
    zeroFeedActionSummary: zeroActionSummary,
    rows: sorted
  };

  const stableRows = sorted.slice(0, Math.min(options.top, sorted.length));
  runReportSummary({ ...report, rows: stableRows });
  return report;
}

function runZeroFeedAction(params: {
  action: AtlasAction;
  atlasPath: string;
  zeroCandidates: StabilityRow[];
}): ZeroActionSummary {
  const { action, atlasPath, zeroCandidates } = params;
  const requested = zeroCandidates.length;
  if (action === 'none' || requested === 0) {
    return {
      requested,
      matched: 0,
      deleted: 0,
      disabled: 0,
      skipped: 0,
      touched: 0,
    };
  }

  const atlas = loadAtlasForAction(atlasPath);
  const candidateIds = new Set(zeroCandidates.map((row) => row.outletId));
  const summary: ZeroActionSummary = {
    requested,
    matched: 0,
    deleted: 0,
    disabled: 0,
    skipped: 0,
    touched: 0,
  };
  let changed = false;

  for (const country of atlas.countries) {
    const countryName = country.name || country.code || 'Global';
    if (action === 'delete') {
      const keep: AtlasFeed[] = [];
      for (const feed of country.feeds) {
        if (!feed.url) {
          keep.push(feed);
          continue;
        }
        const outletId = makeAtlasOutletId(countryName, feed.name, feed.url);
        if (!candidateIds.has(outletId)) {
          keep.push(feed);
          continue;
        }
        summary.matched += 1;
        summary.deleted += 1;
        summary.touched += 1;
        changed = true;
      }
      country.feeds = keep;
      continue;
    }

    for (const feed of country.feeds) {
      if (!feed.url) continue;
      const outletId = makeAtlasOutletId(countryName, feed.name, feed.url);
      if (!candidateIds.has(outletId)) continue;

      summary.matched += 1;
      if (feed.enabled === false) {
        summary.skipped += 1;
        continue;
      }
      feed.enabled = false;
      summary.disabled += 1;
      summary.touched += 1;
      changed = true;
    }
  }

  if (changed) {
    writeFileSync(atlasPath, `${JSON.stringify(atlas, null, 2)}\n`);
    console.log(`[rss-stability] auto-${action} applied and atlas updated: ${atlasPath}`);
  } else {
    console.log('[rss-stability] auto-action requested but no matching atlas feed URLs were found');
  }

  return summary;
}

function loadAtlasForAction(atlasPath: string): Atlas {
  const raw = readFileSync(atlasPath, 'utf8');
  const parsed = JSON.parse(raw) as Atlas;
  if (!Array.isArray(parsed.countries)) {
    throw new Error(`Invalid atlas format in ${atlasPath}`);
  }
  return parsed;
}

function makeAtlasOutletId(countryName: string, sourceName: string, feedUrl: string): string {
  const safe = normalizeText(`${countryName} ${sourceName}`)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 120);
  let hash = 2166136261;
  for (let i = 0; i < feedUrl.length; i += 1) {
    hash ^= feedUrl.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${safe || 'source'}-${(hash >>> 0).toString(36)}`;
}

function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function parseZeroActionArg(argv: string[]): AtlasAction {
  const value = parseArgValue(argv, 'zero-action') || process.env.RSS_ZERO_FEED_ACTION;
  if (value === 'disable' || value === 'delete' || value === 'none') {
    return value;
  }
  if (argv.includes('--auto-disable-zero')) return 'disable';
  if (argv.includes('--auto-delete-zero')) return 'delete';
  return 'delete';
}

function writeReport(report: StabilitySummary): void {
  const payload = {
    ...report,
    generatedAt: report.generatedAt
  };
  const outputDir = resolve(process.cwd(), 'audits');
  mkdirSync(outputDir, { recursive: true });

  const stamp = new Date().toISOString().slice(0, 10);
  const latest = resolve(outputDir, 'rss_feed_stability_latest.json');
  const dated = resolve(outputDir, `rss_feed_stability_${stamp}.json`);
  writeFileSync(latest, `${JSON.stringify(payload, null, 2)}\n`);
  writeFileSync(dated, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`[rss-stability] wrote ${latest}`);
  console.log(`[rss-stability] wrote ${dated}`);
}

function parseArgValue(argv: string[], key: string): string | undefined {
  const prefix = `--${key}=`;
  const withEqual = argv.find((item) => item.startsWith(prefix));
  if (withEqual) return withEqual.slice(prefix.length);
  const idx = argv.indexOf(`--${key}`);
  if (idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith('--')) {
    return argv[idx + 1];
  }
  return undefined;
}

function parseMethodArg(argv: string[], key: string): 'rss' | 'sitemap' | undefined {
  const value = parseArgValue(argv, key);
  if (!value) return undefined;
  if (value === 'rss' || value === 'sitemap') return value;
  return undefined;
}

function parseCsvArg(argv: string[], key: string): string[] {
  const value = parseArgValue(argv, key);
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseIntArg(argv: string[], key: string, fallback: number, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY): number {
  const raw = parseArgValue(argv, key);
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return fallback;
  if (Number.isFinite(min)) {
    if (value < min) return fallback;
  }
  if (Number.isFinite(max)) {
    if (value > max) return fallback;
  }
  return value;
}

function parseBoolArg(argv: string[], key: string): boolean {
  return argv.includes(`--${key}`) || parseArgValue(argv, key) === '1' || parseArgValue(argv, key) === 'true';
}
