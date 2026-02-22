#!/usr/bin/env bun

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  readIngestFailureReasons,
  readIngestOpsDaily,
  readIngestOpsHourly,
  type IngestOpsDailyRow,
  type IngestOpsHourlyRow
} from '../lib/ingestion-store';

type Mode = 'hourly' | 'daily';

const DEFAULT_LOG_PREFIX = '[ingest-ops]';
const DISCORD_WEBHOOK_ENV_KEYS = ['WPM_HOURLY_DISCORD_WEBHOOK', 'INGEST_OPS_DISCORD_WEBHOOK', 'RSS_HEALTH_DISCORD_WEBHOOK', 'DISCORD_WEBHOOK_URL'];
const DISCORD_MAX_CHARS = 1900;

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
const sendDiscord = parseBoolArg(process.argv.slice(2), 'discord');

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
  const failureReasons = await readIngestFailureReasons({
    runner: filters.runner,
    method: filters.method,
    countries: filters.countries,
    outletIds: filters.outletIds,
    sourceNames: filters.sourceNames,
    hours: filters.hours,
    limit: Math.max(filters.limit, 20)
  });
  const status = totals.failures > 0 ? 'degraded' : 'healthy';
  const shouldNotifyDiscord = sendDiscord && shouldSendDiscordMessage(filters, false);

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
  if (failureReasons.storage === 'postgres') {
    console.log('[ingest-ops] top_failure_reasons=');
    if (failureReasons.rows.length > 0) {
      for (const row of failureReasons.rows.slice(0, 10)) {
        console.log(`  - ${row.reason}: ${row.count} (${percent(row.count, totals.failures)}%)`);
      }
    } else {
      console.log('  - none');
    }
  } else {
    console.log('[ingest-ops] top_failure_reasons=storage_disabled');
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
      topSources: topSources.slice(0, 20),
      topFailureReasons: failureReasons.storage === 'postgres' ? failureReasons.rows.slice(0, 20) : []
    });
  }

  if (shouldNotifyDiscord) {
    await sendIngestOpsDiscordReport({
      mode,
      status,
      filters,
      totals,
      results: result.rows,
      topSources: topSources.slice(0, 10),
      failureReasons: failureReasons.storage === 'postgres' ? failureReasons.rows : [],
      topFailureReasonCap: 10
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
  const failureReasons = await readIngestFailureReasons({
    runner: filters.runner,
    method: filters.method,
    countries: filters.countries,
    outletIds: filters.outletIds,
    sourceNames: filters.sourceNames,
    days: filters.days,
    limit: Math.max(filters.limit, 20)
  });
  const status = totals.failures > 0 ? 'degraded' : 'healthy';
  const shouldNotifyDiscord = sendDiscord && shouldSendDiscordMessage(filters, true);

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
  if (failureReasons.storage === 'postgres') {
    console.log('[ingest-ops] top_failure_reasons=');
    if (failureReasons.rows.length > 0) {
      for (const row of failureReasons.rows.slice(0, 10)) {
        console.log(`  - ${row.reason}: ${row.count} (${percent(row.count, totals.failures)}%)`);
      }
    } else {
      console.log('  - none');
    }
  } else {
    console.log('[ingest-ops] top_failure_reasons=storage_disabled');
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
      topSources: topSources.slice(0, 20),
      topFailureReasons: failureReasons.storage === 'postgres' ? failureReasons.rows.slice(0, 20) : []
    });
  }

  if (shouldNotifyDiscord) {
    await sendIngestOpsDiscordReport({
      mode,
      status,
      filters,
      totals,
      results: result.rows,
      topSources: topSources.slice(0, 10),
      failureReasons: failureReasons.storage === 'postgres' ? failureReasons.rows : [],
      topFailureReasonCap: 10
    });
  }
}

async function sendIngestOpsDiscordReport(params: {
  mode: Mode;
  status: 'healthy' | 'degraded';
  filters: {
    runner: 'worker' | 'api_news' | 'warm';
    method?: 'rss' | 'sitemap';
    countries: string[];
    outletIds: string[];
    sourceNames: string[];
    hours?: number;
    days?: number;
  };
  totals: Aggregates;
  results: Array<IngestOpsHourlyRow | IngestOpsDailyRow>;
  topSources: Array<{ key: string; value: Aggregates }>;
  failureReasons: Array<{ reason: string; count: number }>;
  topFailureReasonCap: number;
}): Promise<void> {
  const webhookUrl = pickWebhookUrl();
  if (!webhookUrl) {
    console.log(`${DEFAULT_LOG_PREFIX} SKIP: no webhook configured. Set one of ${DISCORD_WEBHOOK_ENV_KEYS.join(', ')}.`);
    return;
  }

  const totalAttempts = params.totals.attempts;
  const totalFailures = params.totals.failures;

  const header = params.mode === 'hourly' ? `🛰️ WPM Ingest Hourly (${new Date().toISOString()})` : `🛰️ WPM Ingest Daily (${new Date().toISOString()})`;
  const statusLine = params.status === 'healthy'
    ? '✅ Healthy'
    : totalFailures >= 400
      ? '🚨 Critical'
      : '⚠️ Degraded';

  const lines: string[] = [
    header,
    `Status: ${statusLine}`,
    `Mode: ${params.mode}`,
    `Runner: ${params.filters.runner}`,
    `Method: ${params.filters.method || 'rss+sitemap'}`,
    `Rows: ${params.results.length}`,
    `Attempts: ${totalAttempts}`,
    `OK: ${params.totals.successes}`,
    `Fail: ${totalFailures} (${percent(totalFailures, totalAttempts)}%)`,
    `Fetched: ${params.totals.fetched}`,
    `Valid: ${params.totals.valid}`,
  ];

  if (params.filters.hours) {
    lines.push(`Window: ${params.filters.hours}h`);
  }
  if (params.filters.days) {
    lines.push(`Window: ${params.filters.days}d`);
  }

  if (params.topSources.length > 0) {
    lines.push('Top failed sources:');
    for (const item of params.topSources.slice(0, 5)) {
      if (item.value.failures <= 0) continue;
      lines.push(`- ${item.key} (attempts=${item.value.attempts}, fail=${item.value.failures}, rate=${percent(item.value.failures, item.value.attempts)}%)`);
    }
  }

  if (params.failureReasons.length > 0) {
    lines.push('Top failure reasons:');
    const totalFailureForReasons = params.failureReasons.reduce((acc, row) => acc + row.count, 0);
    for (const row of params.failureReasons.slice(0, params.topFailureReasonCap)) {
      lines.push(`- ${row.reason}: ${row.count}${totalFailureForReasons > 0 ? ` (${percent(row.count, totalFailureForReasons)}%)` : ''}`);
    }
  } else {
    lines.push('No failure reasons found.');
  }

  if (params.filters.countries.length > 0) {
    lines.push(`Countries filter: ${params.filters.countries.slice(0, 20).join(', ')}`);
  }
  if (params.filters.sourceNames.length > 0) {
    lines.push(`Source filter: ${params.filters.sourceNames.slice(0, 20).join(', ')}`);
  }
  if (params.filters.outletIds.length > 0) {
    lines.push(`Outlet filter: ${params.filters.outletIds.slice(0, 20).join(', ')}`);
  }

  const chunks = splitIntoDiscordChunks(lines);
  for (const content of chunks) {
    await postToDiscord(webhookUrl, content);
  }
}

function shouldSendDiscordMessage(
  filters: {
    runner: 'worker' | 'api_news' | 'warm';
    method?: 'rss' | 'sitemap';
    countries: string[];
    outletIds: string[];
    sourceNames: string[];
    hours?: number;
    days?: number;
  },
  isDaily: boolean
): boolean {
  if (process.env.INGEST_OPS_DISCORD_FORCE === '1') return true;

  if (!process.env.INGEST_OPS_DISCORD_ALLOW_WORKER && filters.runner !== 'worker') {
    return false;
  }

  if (!isDaily && filters.hours !== undefined && filters.hours <= 0) {
    return false;
  }
  if (isDaily && filters.days !== undefined && filters.days <= 0) {
    return false;
  }

  if (process.env.INGEST_OPS_DISCORD_SKIP_FILTERED === '1' && (filters.countries.length > 0 || filters.outletIds.length > 0 || filters.sourceNames.length > 0)) {
    return false;
  }

  return true;
}

function splitIntoDiscordChunks(lines: string[]): string[] {
  const chunks: string[] = [''];
  let current = 0;

  for (const line of lines) {
    const row = line.replace(/\s+$/u, '');
    if (!row) continue;

    const prefix = chunks[current].length > 0 ? '\n' : '';
    const next = `${chunks[current]}${prefix}${row}`;
    if (next.length > DISCORD_MAX_CHARS && chunks[current].length > 0) {
      chunks.push(row);
      current += 1;
      continue;
    }

    if (row.length > DISCORD_MAX_CHARS) {
      if (chunks[current].length > 0) {
        chunks.push('');
        current += 1;
      }
      for (let i = 0; i < row.length; i += DISCORD_MAX_CHARS - 50) {
        chunks.push(row.slice(i, i + DISCORD_MAX_CHARS - 50));
        current += 1;
      }
      continue;
    }

    chunks[current] = next;
  }

  return chunks
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}

function pickWebhookUrl(): string {
  for (const key of DISCORD_WEBHOOK_ENV_KEYS) {
    const raw = process.env[key];
    if (!raw) continue;
    const trimmed = raw.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function redactWebhookUrlForLog(raw: string): string {
  try {
    const parsed = new URL(raw);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const id = parts[parts.length - 2] ?? '';
    const token = parts[parts.length - 1] ?? '';
    return `${parsed.origin}${parts.length > 0 ? `.../${id}/${token.slice(-8)}` : ''}`;
  } catch {
    return '[invalid-url]';
  }
}

async function postToDiscord(webhookUrl: string, content: string): Promise<void> {
  const startedAt = Date.now();
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ content })
  });

  console.log(`${DEFAULT_LOG_PREFIX} discord_http_status=${response.status} elapsed_ms=${Date.now() - startedAt} url=${redactWebhookUrlForLog(webhookUrl)}`);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`discord_webhook_http_${response.status}: ${text.slice(0, 400)}`);
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
