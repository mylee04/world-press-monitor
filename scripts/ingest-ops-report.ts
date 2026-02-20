#!/usr/bin/env bun

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  readIngestOpsDaily,
  readIngestOpsHourly,
  type IngestOpsDailyRow,
  type IngestOpsHourlyRow
} from '../lib/ingestion-store';

type Mode = 'hourly' | 'daily';

type Aggregates = {
  attempts: number;
  successes: number;
  failures: number;
  fetched: number;
  valid: number;
  missingTitle: number;
  missingSummary: number;
  missingPublishedAt: number;
  missingLink: number;
};

type KeyedRow = {
  key: string;
  value: Aggregates;
};

const mode = resolveMode(process.argv.slice(2));
const limit = parseIntArg(process.argv.slice(2), 'limit', mode === 'daily' ? 500 : 5000);
const runnerArg = parseArgValue(process.argv.slice(2), 'runner');
const methodArg = parseArgValue(process.argv.slice(2), 'method');
const runner = parseRunner(runnerArg || process.env.INGEST_OPS_REPORT_RUNNER || process.env.INGEST_OPS_RUNNER || 'worker');
const method = parseMethod(methodArg || process.env.INGEST_OPS_METHOD || '');
const countriesFilter = parseCsvArg(process.argv.slice(2), 'countries');
const outletsFilter = parseCsvArg(process.argv.slice(2), 'outlets');
const sourcesFilter = parseCsvArg(process.argv.slice(2), 'sources');
const hours = parseIntArg(process.argv.slice(2), 'hours', 1, 1, 24 * 30);
const days = parseIntArg(process.argv.slice(2), 'days', 1, 1, 365);
const writeJson = parseBoolArg(process.argv.slice(2), 'write-json');

if (mode === 'hourly') {
  runHourlyReport({
    runner,
    limit,
    method: method === 'rss' || method === 'sitemap' ? method : undefined,
    countries: countriesFilter,
    outletIds: outletsFilter,
    sourceNames: sourcesFilter,
    hours
  });
} else {
  runDailyReport({
    runner,
    limit,
    method: method === 'rss' || method === 'sitemap' ? method : undefined,
    countries: countriesFilter,
    outletIds: outletsFilter,
    sourceNames: sourcesFilter,
    days
  });
}

async function runHourlyReport(filters: {
  runner: 'worker' | 'api_news' | 'warm';
  method?: 'rss' | 'sitemap';
  countries: string[];
  outletIds: string[];
  sourceNames: string[];
  hours: number;
  limit: number;
}): Promise<void> {
  const result = await readIngestOpsHourly({
    runner: filters.runner,
    method: filters.method,
    countries: filters.countries,
    outletIds: filters.outletIds,
    sourceNames: filters.sourceNames,
    hours: filters.hours,
    limit: filters.limit
  });

  if (result.storage !== 'postgres') {
    console.error(`[ingest-ops] storage_disabled: ${result.reason || 'unknown'}`);
    process.exitCode = 1;
    return;
  }

  if (!result.rows.length) {
    console.log(`[ingest-ops] mode=hourly runner=${filters.runner} rows=0`);
    console.log(`[ingest-ops] no diagnostic rows in last ${filters.hours}h for table ingest_ops_hourly.`);
    console.log('[ingest-ops] likely causes: no recent ingest run, different runner, or ingest diagnostics not yet persisted.');
    console.log('[ingest-ops] quick checks: bun run ingest:once (or run worker loop), then re-run with --hours=24');
    return;
  }

  const totals = sumRows(result.rows);
  const topSources = topFailureRows(result.rows, filters.limit);
  const byCountry = aggregateByCountry(result.rows);
  const status = totals.failures > 0 ? 'degraded' : 'healthy';

  console.log(`[ingest-ops] mode=hourly status=${status} runner=${filters.runner} records=${result.rows.length} buckets=${filters.hours}h`);
  console.log(`[ingest-ops] attempts=${totals.attempts} ok=${totals.successes} fail=${totals.failures} failureRate=${percent(totals.failures, totals.attempts)}%`);
  console.log(
    `[ingest-ops] fetched=${totals.fetched} valid=${totals.valid} missingTitle=${totals.missingTitle} missingSummary=${totals.missingSummary} missingPublished=${totals.missingPublishedAt} missingLink=${totals.missingLink}`
  );
  console.log(`[ingest-ops] countries=${byCountry.length} topCountries=${byCountry.slice(0, 5).map((item) => `${item.key}:${item.value.failures}`).join(', ') || 'none'}`);
  console.log('[ingest-ops] top_failed_sources=');
  for (const item of topSources.slice(0, 10)) {
    const f = item.value;
    console.log(
      `  - ${item.key} attempts=${f.attempts} fail=${f.failures} success=${f.successes} failureRate=${percent(f.failures, f.attempts)}%`
    );
  }

  if (writeJson) {
    writeReportJson('hourly', {
      generatedAt: new Date().toISOString(),
      mode,
      filters: {
        runner: filters.runner,
        method: filters.method,
        countries: filters.countries,
        outletIds: filters.outletIds,
        sourceNames: filters.sourceNames,
        hours: filters.hours,
      },
      rows: result.rows,
      totals,
      topSources: topSources.slice(0, 20)
    });
  }
}

async function runDailyReport(filters: {
  runner: 'worker' | 'api_news' | 'warm';
  method?: 'rss' | 'sitemap';
  countries: string[];
  outletIds: string[];
  sourceNames: string[];
  days: number;
  limit: number;
}): Promise<void> {
  const result = await readIngestOpsDaily({
    runner: filters.runner,
    method: filters.method,
    countries: filters.countries,
    outletIds: filters.outletIds,
    sourceNames: filters.sourceNames,
    days: filters.days,
    limit: filters.limit
  });

  if (result.storage !== 'postgres') {
    console.error(`[ingest-ops] storage_disabled: ${result.reason || 'unknown'}`);
    process.exitCode = 1;
    return;
  }

  if (!result.rows.length) {
    console.log(`[ingest-ops] mode=daily runner=${filters.runner} rows=0`);
    console.log('[ingest-ops] no diagnostic rows in last ' + `${filters.days}d for table ingest_ops_daily.`);
    console.log('[ingest-ops] likely causes: no completed daily rollup yet, different runner, or missing pipeline persistence.');
    console.log('[ingest-ops] quick checks: bun run ingest:once (or run worker loop), then rerun with --days=2');
    return;
  }

  const totals = sumRows(result.rows);
  const topSources = topFailureRows(result.rows, filters.limit);
  const byCountry = aggregateByCountry(result.rows);
  const status = totals.failures > 0 ? 'degraded' : 'healthy';

  console.log(`[ingest-ops] mode=daily status=${status} runner=${filters.runner} records=${result.rows.length} days=${filters.days}`);
  console.log(`[ingest-ops] attempts=${totals.attempts} ok=${totals.successes} fail=${totals.failures} failureRate=${percent(totals.failures, totals.attempts)}%`);
  console.log(
    `[ingest-ops] fetched=${totals.fetched} valid=${totals.valid} missingTitle=${totals.missingTitle} missingSummary=${totals.missingSummary} missingPublished=${totals.missingPublishedAt} missingLink=${totals.missingLink}`
  );
  console.log(`[ingest-ops] countries=${byCountry.length} topCountries=${byCountry.slice(0, 5).map((item) => `${item.key}:${item.value.failures}`).join(', ') || 'none'}`);
  console.log('[ingest-ops] top_failed_sources=');
  for (const item of topSources.slice(0, 10)) {
    const f = item.value;
    console.log(
      `  - ${item.key} attempts=${f.attempts} fail=${f.failures} success=${f.successes} failureRate=${percent(f.failures, f.attempts)}%`
    );
  }

  if (writeJson) {
    writeReportJson('daily', {
      generatedAt: new Date().toISOString(),
      mode,
      filters: {
        runner: filters.runner,
        method: filters.method,
        countries: filters.countries,
        outletIds: filters.outletIds,
        sourceNames: filters.sourceNames,
        days: filters.days,
      },
      rows: result.rows,
      totals,
      topSources: topSources.slice(0, 20)
    });
  }
}

function parseArgValue(argv: string[], key: string): string | undefined {
  const eq = `--${key}=`;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg === `--${key}` && i + 1 < argv.length) {
      return argv[i + 1];
    }
    if (arg.startsWith(eq)) {
      return arg.slice(eq.length);
    }
  }
  return undefined;
}

function parseCsvArg(argv: string[], key: string): string[] {
  const raw = parseArgValue(argv, key);
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseIntArg(argv: string[], key: string, fallback: number, min?: number, max?: number): number {
  const raw = parseArgValue(argv, key);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (typeof min === 'number' && parsed < min) return min;
  if (typeof max === 'number' && parsed > max) return max;
  return parsed;
}

function parseRunner(raw: string): 'worker' | 'api_news' | 'warm' {
  if (raw === 'api_news' || raw === 'warm') {
    return raw;
  }
  return 'worker';
}

function parseMethod(raw: string): 'rss' | 'sitemap' | '' {
  if (raw === 'rss' || raw === 'sitemap') {
    return raw;
  }
  return '';
}

function parseBoolArg(argv: string[], key: string): boolean {
  return argv.includes(`--${key}`);
}

function resolveMode(argv: string[]): Mode {
  const modeArg = parseArgValue(argv, 'mode');
  if (modeArg === 'daily') return 'daily';
  if (argv.includes('--daily')) return 'daily';
  return 'hourly';
}

function percent(numerator: number, denominator: number): string {
  if (!denominator) return '0.00';
  return (numerator / denominator * 100).toFixed(2);
}

function sumRows(rows: IngestOpsHourlyRow[] | IngestOpsDailyRow[]): Aggregates {
  return rows.reduce(
    (acc, row) => {
      acc.attempts += row.attemptedRuns;
      acc.successes += row.successfulRuns;
      acc.failures += row.failedRuns;
      acc.fetched += row.fetchedCount;
      acc.valid += row.validCount;
      acc.missingTitle += row.missingTitleCount;
      acc.missingSummary += row.missingSummaryCount;
      acc.missingPublishedAt += row.missingPublishedAtCount;
      acc.missingLink += row.missingLinkCount;
      return acc;
    },
    {
      attempts: 0,
      successes: 0,
      failures: 0,
      fetched: 0,
      valid: 0,
      missingTitle: 0,
      missingSummary: 0,
      missingPublishedAt: 0,
      missingLink: 0
    }
  );
}

function topFailureRows(
  rows: IngestOpsHourlyRow[] | IngestOpsDailyRow[],
  limit: number
): Array<{ key: string; value: Aggregates }> {
  const grouped = new Map<string, Aggregates>();
  for (const row of rows) {
    const key = `${row.source} / ${row.country} / ${row.outletId} / ${row.method}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        attempts: row.attemptedRuns,
        successes: row.successfulRuns,
        failures: row.failedRuns,
        fetched: row.fetchedCount,
        valid: row.validCount,
        missingTitle: row.missingTitleCount,
        missingSummary: row.missingSummaryCount,
        missingPublishedAt: row.missingPublishedAtCount,
        missingLink: row.missingLinkCount
      });
      continue;
    }
    existing.attempts += row.attemptedRuns;
    existing.successes += row.successfulRuns;
    existing.failures += row.failedRuns;
    existing.fetched += row.fetchedCount;
    existing.valid += row.validCount;
    existing.missingTitle += row.missingTitleCount;
    existing.missingSummary += row.missingSummaryCount;
    existing.missingPublishedAt += row.missingPublishedAtCount;
    existing.missingLink += row.missingLinkCount;
  }
  return [...grouped.entries()]
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value.failures - a.value.failures || b.value.attempts - a.value.attempts)
    .slice(0, limit);
}

function aggregateByCountry(rows: IngestOpsHourlyRow[] | IngestOpsDailyRow[]): Array<{ key: string; value: Aggregates }> {
  const grouped = new Map<string, Aggregates>();
  for (const row of rows) {
    const key = row.country || 'Global';
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        attempts: row.attemptedRuns,
        successes: row.successfulRuns,
        failures: row.failedRuns,
        fetched: row.fetchedCount,
        valid: row.validCount,
        missingTitle: row.missingTitleCount,
        missingSummary: row.missingSummaryCount,
        missingPublishedAt: row.missingPublishedAtCount,
        missingLink: row.missingLinkCount
      });
      continue;
    }
    existing.attempts += row.attemptedRuns;
    existing.successes += row.successfulRuns;
    existing.failures += row.failedRuns;
    existing.fetched += row.fetchedCount;
    existing.valid += row.validCount;
    existing.missingTitle += row.missingTitleCount;
    existing.missingSummary += row.missingSummaryCount;
    existing.missingPublishedAt += row.missingPublishedAtCount;
    existing.missingLink += row.missingLinkCount;
  }
  return [...grouped.entries()]
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value.failures - a.value.failures || b.value.attempts - a.value.attempts);
}

function writeReportJson(mode: string, payload: unknown): void {
  const dir = resolve(process.cwd(), 'audits');
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, `ingest-ops-${mode}-latest.json`);
  writeFileSync(path, JSON.stringify(payload, null, 2), 'utf8');
}
