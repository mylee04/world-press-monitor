#!/usr/bin/env bun
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { normalizeLinkForId } from '../lib/pipeline';

type IngestionRow = {
  ran_at: string;
  country: string | null;
  source: string;
  outlet_id: string;
  method: string;
  requested_url: string | null;
  final_url: string | null;
  attempted: boolean;
  ok: boolean;
  status_code: number | null;
  error: string | null;
};

type AggregatedEndpoint = {
  endpointUrl: string;
  outletId: string;
  source: string;
  country: string;
  method: string;
  attemptedRuns: number;
  failedRuns: number;
  successRuns: number;
  failRate: number;
  consecutiveFailures: number;
  lastSeenAt: string;
  lastFailedAt: string | null;
  lastSuccessAt: string | null;
  topFailureReason: string;
  topStatusCode: number | null;
  permanentFailureRatio: number;
  action: 'KEEP' | 'WATCH' | 'DISABLE_CANDIDATE';
  rationale: string;
};

type AtlasFeed = {
  name: string;
  url: string | null;
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

type CliOptions = {
  days: number;
  minAttempts: number;
  minDisableAttempts: number;
  watchFailRate: number;
  disableFailRate: number;
  disableConsecutiveFailures: number;
  applyDisable: boolean;
  runner: string;
  atlasPath: string;
  outputJsonPath: string;
  outputMdPath: string;
};

const PERMANENT_STATUS_CODES = new Set([401, 403, 404, 410, 451]);

function parseArgValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

function parseNumberArg(name: string, fallback: number, min: number, max: number): number {
  const raw = parseArgValue(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseFloatArg(name: string, fallback: number, min: number, max: number): number {
  const raw = parseArgValue(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseOptions(): CliOptions {
  const applyDisable = process.argv.includes('--apply-disable');
  const runner = parseArgValue('runner') || process.env.RSS_FAILURE_RUNNER || 'worker';

  return {
    days: parseNumberArg('days', 7, 1, 90),
    minAttempts: parseNumberArg('min-attempts', 12, 1, 5000),
    minDisableAttempts: parseNumberArg('min-disable-attempts', 20, 1, 5000),
    watchFailRate: parseFloatArg('watch-fail-rate', 0.6, 0, 1),
    disableFailRate: parseFloatArg('disable-fail-rate', 0.9, 0, 1),
    disableConsecutiveFailures: parseNumberArg('disable-consecutive', 18, 1, 5000),
    applyDisable,
    runner,
    atlasPath: process.env.ATLAS_PATH || resolve(process.cwd(), 'data/rss-atlas.json'),
    outputJsonPath: resolve(process.cwd(), 'audits/rss_failure_watchlist_latest.json'),
    outputMdPath: resolve(process.cwd(), 'audits/rss_failure_watchlist_latest.md')
  };
}

function keyForRow(row: IngestionRow): string {
  const endpointUrl = row.final_url || row.requested_url || row.source;
  const normalized = normalizeLinkForId(endpointUrl || '');
  const endpointKey = normalized || endpointUrl || row.source;
  return `${row.outlet_id}|${row.method}|${endpointKey}`;
}

function chooseTopKey(counts: Map<string, number>): string {
  let winner = 'unknown';
  let best = -1;
  for (const [key, value] of counts.entries()) {
    if (value > best) {
      winner = key;
      best = value;
    }
  }
  return winner;
}

function parseTopStatusCode(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIso(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return new Date(0).toISOString();
  return parsed.toISOString();
}

function aggregateRows(rows: IngestionRow[], options: CliOptions): AggregatedEndpoint[] {
  const grouped = new Map<string, IngestionRow[]>();
  for (const row of rows) {
    const key = keyForRow(row);
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(row);
    } else {
      grouped.set(key, [row]);
    }
  }

  const result: AggregatedEndpoint[] = [];

  for (const bucketRows of grouped.values()) {
    bucketRows.sort((a, b) => new Date(b.ran_at).getTime() - new Date(a.ran_at).getTime());
    const first = bucketRows[0];
    const endpointUrl = normalizeLinkForId(first.final_url || first.requested_url || first.source) || first.final_url || first.requested_url || first.source;

    let attemptedRuns = 0;
    let failedRuns = 0;
    let successRuns = 0;
    let permanentFailures = 0;
    let lastFailedAt: string | null = null;
    let lastSuccessAt: string | null = null;
    const reasonCounts = new Map<string, number>();
    const statusCounts = new Map<string, number>();

    for (const row of bucketRows) {
      if (!row.attempted) continue;
      attemptedRuns += 1;
      if (row.ok) {
        successRuns += 1;
        if (!lastSuccessAt) lastSuccessAt = toIso(row.ran_at);
      } else {
        failedRuns += 1;
        if (!lastFailedAt) lastFailedAt = toIso(row.ran_at);

        const reasonKey = (row.error || 'unknown').trim() || 'unknown';
        reasonCounts.set(reasonKey, (reasonCounts.get(reasonKey) || 0) + 1);

        const statusKey = row.status_code !== null ? String(row.status_code) : 'none';
        statusCounts.set(statusKey, (statusCounts.get(statusKey) || 0) + 1);

        if (row.status_code !== null && PERMANENT_STATUS_CODES.has(row.status_code)) {
          permanentFailures += 1;
        }
      }
    }

    if (attemptedRuns < options.minAttempts) continue;

    let consecutiveFailures = 0;
    for (const row of bucketRows) {
      if (!row.attempted) continue;
      if (row.ok) break;
      consecutiveFailures += 1;
    }

    const failRate = attemptedRuns > 0 ? failedRuns / attemptedRuns : 0;
    const permanentFailureRatio = failedRuns > 0 ? permanentFailures / failedRuns : 0;
    const topFailureReason = chooseTopKey(reasonCounts);
    const topStatusCode = parseTopStatusCode(chooseTopKey(statusCounts));

    let action: AggregatedEndpoint['action'] = 'KEEP';
    let rationale = 'healthy_or_insufficient_signal';

    const qualifiesForDisable = (
      failedRuns >= options.minDisableAttempts
      && consecutiveFailures >= options.disableConsecutiveFailures
      && (
        failRate >= options.disableFailRate
        || (successRuns === 0 && permanentFailureRatio >= 0.8)
      )
    );

    if (qualifiesForDisable) {
      action = 'DISABLE_CANDIDATE';
      rationale = `high_fail_rate=${(failRate * 100).toFixed(1)}% consecutive=${consecutiveFailures} permanent_ratio=${(permanentFailureRatio * 100).toFixed(1)}%`;
    } else if (failRate >= options.watchFailRate) {
      action = 'WATCH';
      rationale = `watch_fail_rate=${(failRate * 100).toFixed(1)}%`; 
    }

    result.push({
      endpointUrl,
      outletId: first.outlet_id,
      source: first.source,
      country: first.country || 'Global',
      method: first.method,
      attemptedRuns,
      failedRuns,
      successRuns,
      failRate,
      consecutiveFailures,
      lastSeenAt: toIso(first.ran_at),
      lastFailedAt,
      lastSuccessAt,
      topFailureReason,
      topStatusCode,
      permanentFailureRatio,
      action,
      rationale
    });
  }

  result.sort((a, b) => {
    const actionScore = (value: AggregatedEndpoint['action']) => value === 'DISABLE_CANDIDATE' ? 2 : value === 'WATCH' ? 1 : 0;
    const byAction = actionScore(b.action) - actionScore(a.action);
    if (byAction !== 0) return byAction;
    const byConsecutive = b.consecutiveFailures - a.consecutiveFailures;
    if (byConsecutive !== 0) return byConsecutive;
    return b.failRate - a.failRate;
  });

  return result;
}

function loadAtlas(atlasPath: string): Atlas {
  const raw = readFileSync(atlasPath, 'utf8');
  const parsed = JSON.parse(raw) as Atlas;
  if (!Array.isArray(parsed.countries)) {
    throw new Error(`Invalid atlas format: ${atlasPath}`);
  }
  return parsed;
}

function applyDisableToAtlas(atlas: Atlas, endpoints: AggregatedEndpoint[]): number {
  const disableSet = new Set(
    endpoints
      .filter((row) => row.action === 'DISABLE_CANDIDATE')
      .map((row) => normalizeLinkForId(row.endpointUrl) || row.endpointUrl)
      .filter(Boolean)
  );

  if (disableSet.size === 0) return 0;

  let updated = 0;
  for (const country of atlas.countries) {
    for (const feed of country.feeds || []) {
      if (!feed.url) continue;
      const normalized = normalizeLinkForId(feed.url) || feed.url;
      if (!disableSet.has(normalized)) continue;
      if (feed.enabled === false) continue;
      feed.enabled = false;
      updated += 1;
    }
  }
  return updated;
}

function writeMarkdown(path: string, rows: AggregatedEndpoint[], options: CliOptions): void {
  const disabled = rows.filter((row) => row.action === 'DISABLE_CANDIDATE');
  const watch = rows.filter((row) => row.action === 'WATCH');

  const lines: string[] = [];
  lines.push('# RSS Failure Watchlist');
  lines.push('');
  lines.push(`- Generated at: ${new Date().toISOString()}`);
  lines.push(`- Window: last ${options.days} days`);
  lines.push(`- Runner: ${options.runner}`);
  lines.push(`- Thresholds: min_attempts=${options.minAttempts}, watch_fail_rate=${options.watchFailRate}, disable_fail_rate=${options.disableFailRate}, disable_consecutive=${options.disableConsecutiveFailures}`);
  lines.push(`- Disable apply mode: ${options.applyDisable ? 'enabled' : 'dry-run'}`);
  lines.push('');

  lines.push('## Disable candidates');
  lines.push('');
  lines.push('|Country|Source|URL|Attempts|Fail|Rate|Consecutive|Top Reason|Rationale|');
  lines.push('|---|---|---|---:|---:|---:|---:|---|---|');
  for (const row of disabled.slice(0, 300)) {
    lines.push(`|${row.country}|${row.source}|<${row.endpointUrl}>|${row.attemptedRuns}|${row.failedRuns}|${(row.failRate * 100).toFixed(1)}%|${row.consecutiveFailures}|${row.topFailureReason}|${row.rationale}|`);
  }
  if (disabled.length === 0) {
    lines.push('|-|-|-|0|0|0%|0|-|none|');
  }
  lines.push('');

  lines.push('## Watch list');
  lines.push('');
  lines.push('|Country|Source|URL|Attempts|Fail|Rate|Consecutive|Top Reason|');
  lines.push('|---|---|---|---:|---:|---:|---:|---|');
  for (const row of watch.slice(0, 500)) {
    lines.push(`|${row.country}|${row.source}|<${row.endpointUrl}>|${row.attemptedRuns}|${row.failedRuns}|${(row.failRate * 100).toFixed(1)}%|${row.consecutiveFailures}|${row.topFailureReason}|`);
  }
  if (watch.length === 0) {
    lines.push('|-|-|-|0|0|0%|0|-|');
  }

  writeFileSync(path, `${lines.join('\n')}\n`, 'utf8');
}

async function main(): Promise<void> {
  const options = parseOptions();
  const databaseUrl = (process.env.DATABASE_URL || '').trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  mkdirSync(resolve(process.cwd(), 'audits'), { recursive: true });

  const db = new Pool({ connectionString: databaseUrl });

  try {
    const result = await db.query<IngestionRow>(
      `
      select
        ran_at,
        country,
        source,
        outlet_id,
        method,
        requested_url,
        final_url,
        attempted,
        ok,
        status_code,
        error
      from rss_health_status
      where ran_at > now() - ($1::text || ' days')::interval
        and runner = $2
      order by ran_at desc
      `,
      [String(options.days), options.runner]
    );

    const aggregated = aggregateRows(result.rows, options);

    let atlasUpdated = 0;
    if (options.applyDisable) {
      const atlas = loadAtlas(options.atlasPath);
      atlasUpdated = applyDisableToAtlas(atlas, aggregated);
      if (atlasUpdated > 0) {
        atlas.generatedAt = new Date().toISOString();
        writeFileSync(options.atlasPath, `${JSON.stringify(atlas, null, 2)}\n`, 'utf8');
      }
    }

    const summary = {
      generatedAt: new Date().toISOString(),
      runner: options.runner,
      windowDays: options.days,
      totalRows: result.rowCount,
      evaluatedEndpoints: aggregated.length,
      disableCandidates: aggregated.filter((row) => row.action === 'DISABLE_CANDIDATE').length,
      watchList: aggregated.filter((row) => row.action === 'WATCH').length,
      atlasUpdated,
      thresholds: {
        minAttempts: options.minAttempts,
        minDisableAttempts: options.minDisableAttempts,
        watchFailRate: options.watchFailRate,
        disableFailRate: options.disableFailRate,
        disableConsecutiveFailures: options.disableConsecutiveFailures
      }
    };

    writeFileSync(
      options.outputJsonPath,
      `${JSON.stringify({ summary, rows: aggregated }, null, 2)}\n`,
      'utf8'
    );

    writeMarkdown(options.outputMdPath, aggregated, options);

    console.log(`[rss-failure-watchlist] evaluated_endpoints=${summary.evaluatedEndpoints}`);
    console.log(`[rss-failure-watchlist] disable_candidates=${summary.disableCandidates} watch=${summary.watchList}`);
    console.log(`[rss-failure-watchlist] wrote_json=${options.outputJsonPath}`);
    console.log(`[rss-failure-watchlist] wrote_markdown=${options.outputMdPath}`);
    if (options.applyDisable) {
      console.log(`[rss-failure-watchlist] atlas_updated=${atlasUpdated} apply_disable=true`);
    } else {
      console.log('[rss-failure-watchlist] apply_disable=false (dry-run)');
    }
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[rss-failure-watchlist] ${message}`);
  process.exit(1);
});
