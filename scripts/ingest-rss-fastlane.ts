#!/usr/bin/env bun
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { makeOutletId } from '../lib/outlet-id';

type RiskMode = 'strict' | 'one-miss' | 'all';

type AtlasFeed = {
  name?: string;
  url?: string | null;
  sitemapUrl?: string | null;
  enabled?: boolean;
};

type AtlasCountry = {
  name?: string;
  code?: string;
  feeds?: AtlasFeed[];
};

type AtlasCatalog = {
  countries?: AtlasCountry[];
};

type WatchlistRow = {
  source: string;
  country: string;
  riskBand: 'STRICT' | 'ONE_MISS';
};

type CliOptions = {
  mode: RiskMode;
  headMinCreated: number;
  maxOutlets: number | null;
  countries: Set<string> | null;
  fetchConcurrency: number;
  itemMapConcurrency: number;
  printCommand: boolean;
};

const DEFAULT_HEAD_MIN_CREATED = 50;
const DEFAULT_FETCH_CONCURRENCY = 8;
const DEFAULT_ITEM_MAP_CONCURRENCY = 16;
const ATLAS_PATH = resolve(process.cwd(), 'data/rss-atlas.json');
const STATE_DIR = resolve(process.cwd(), '.wpr-state');
const FASTLANE_LOCK_DIR = resolve(STATE_DIR, 'ingest-rss-fastlane.lock');
const FASTLANE_LOCK_PID_FILE = resolve(FASTLANE_LOCK_DIR, 'pid');
function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function parseArgValue(prefix: string): string | null {
  const token = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return token ? token.slice(prefix.length).trim() : null;
}

function parseIntArg(prefix: string, fallback: number, min = 1, max = 100000): number {
  const raw = parseArgValue(prefix);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseOptionalIntArg(prefix: string): number | null {
  const raw = parseArgValue(prefix);
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseMode(): RiskMode {
  const raw = (parseArgValue('--mode=') || 'strict').trim().toLowerCase();
  if (raw === 'all' || raw === 'one-miss') return raw;
  return 'strict';
}

function parseCountries(): Set<string> | null {
  const raw = parseArgValue('--country=') || parseArgValue('--countries=');
  if (!raw) return null;
  const normalized = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => normalizeText(part));
  return normalized.length > 0 ? new Set(normalized) : null;
}

function parseOptions(): CliOptions {
  return {
    mode: parseMode(),
    headMinCreated: parseIntArg('--head-min-created=', DEFAULT_HEAD_MIN_CREATED, 1, 100000),
    maxOutlets: parseOptionalIntArg('--max-outlets='),
    countries: parseCountries(),
    fetchConcurrency: parseIntArg('--fetch-concurrency=', DEFAULT_FETCH_CONCURRENCY, 1, 64),
    itemMapConcurrency: parseIntArg('--item-map-concurrency=', DEFAULT_ITEM_MAP_CONCURRENCY, 1, 64),
    printCommand: process.argv.includes('--print-command'),
  };
}

function makeSourceCountryKey(source: string, country: string): string {
  return `${normalizeText(source)}|||${normalizeText(country || 'Global')}`;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ',') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    if (char === '\r') {
      continue;
    }
    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((candidate) => candidate.length > 0 && candidate.some((value) => value.length > 0));
}

function readWatchlistRows(csvPath: string): WatchlistRow[] {
  const raw = readFileSync(csvPath, 'utf8').replace(/\u0000/g, '');
  const rows = parseCsv(raw);
  if (rows.length === 0) return [];

  const [header, ...body] = rows;
  const headerIndex = new Map(header.map((value, index) => [value, index]));
  const sourceIndex = headerIndex.get('source');
  const countryIndex = headerIndex.get('country');
  const riskBandIndex = headerIndex.get('risk_band');
  if (sourceIndex === undefined || countryIndex === undefined || riskBandIndex === undefined) {
    throw new Error(`watchlist csv missing required columns: ${csvPath}`);
  }

  return body
    .map((cells) => ({
      source: (cells[sourceIndex] || '').trim(),
      country: (cells[countryIndex] || '').trim() || 'Global',
      riskBand: ((cells[riskBandIndex] || '').trim().toUpperCase() === 'ONE_MISS' ? 'ONE_MISS' : 'STRICT') as WatchlistRow['riskBand'],
    }))
    .filter((row) => row.source.length > 0);
}

function loadOutletIdsBySourceCountry(atlasPath: string): Map<string, string[]> {
  const raw = readFileSync(atlasPath, 'utf8');
  const atlas = JSON.parse(raw) as AtlasCatalog;
  const lookup = new Map<string, string[]>();

  for (const country of atlas.countries || []) {
    const countryName = (country.name || country.code || 'Global').trim() || 'Global';
    for (const feed of country.feeds || []) {
      if (feed.enabled === false) continue;
      const rssUrl = typeof feed.url === 'string' && feed.url.trim().length > 0 ? feed.url.trim() : '';
      if (!rssUrl) continue;
      const sourceName = (feed.name || '').trim();
      if (!sourceName) continue;
      const outletId = makeOutletId(countryName, sourceName, rssUrl);
      const key = makeSourceCountryKey(sourceName, countryName);
      const current = lookup.get(key) || [];
      current.push(outletId);
      lookup.set(key, current);
    }
  }

  return lookup;
}

function runWatchlist(options: CliOptions, outputCsvPath: string): void {
  const args = [
    'scripts/ingest-head-risk-watchlist.ts',
    `--mode=${options.mode}`,
    `--head-min-created=${options.headMinCreated}`,
    `--output-csv=${outputCsvPath}`,
  ];
  const result = spawnSync('bun', args, {
    stdio: options.printCommand ? 'pipe' : 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    const stderr = result.stderr ? result.stderr.toString('utf8') : '';
    const stdout = result.stdout ? result.stdout.toString('utf8') : '';
    throw new Error(`watchlist run failed: ${stderr || stdout || `exit ${result.status}`}`.trim());
  }
}

function buildWatchlistOutputPath(mode: RiskMode): string {
  return resolve(process.cwd(), `audits/ingest_rss_fastlane_candidates_${mode}.csv`);
}

function selectOutletIds(options: CliOptions, rows: WatchlistRow[], lookup: Map<string, string[]>): {
  outletIds: string[];
  selectedRows: WatchlistRow[];
  missingRows: WatchlistRow[];
} {
  const outletIds: string[] = [];
  const selectedRows: WatchlistRow[] = [];
  const missingRows: WatchlistRow[] = [];
  const seenIds = new Set<string>();

  for (const row of rows) {
    if (options.countries && !options.countries.has(normalizeText(row.country))) continue;
    const matches = lookup.get(makeSourceCountryKey(row.source, row.country)) || [];
    if (matches.length === 0) {
      missingRows.push(row);
      continue;
    }
    let addedForRow = false;
    for (const outletId of matches) {
      if (seenIds.has(outletId)) continue;
      seenIds.add(outletId);
      outletIds.push(outletId);
      addedForRow = true;
      if (options.maxOutlets && outletIds.length >= options.maxOutlets) {
        selectedRows.push(row);
        return { outletIds, selectedRows, missingRows };
      }
    }
    if (addedForRow) {
      selectedRows.push(row);
    }
  }

  return { outletIds, selectedRows, missingRows };
}

function buildIngestCommand(options: CliOptions, outletIds: string[]): { args: string[]; env: Record<string, string> } {
  return {
    args: [
      'scripts/ingest-worker.ts',
      '--once',
      `--outlet-id=${outletIds.join(',')}`,
      '--method=rss',
    ],
    env: {
      INGEST_FETCH_CONCURRENCY: String(options.fetchConcurrency),
      INGEST_ITEM_MAP_CONCURRENCY: String(options.itemMapConcurrency),
      INGEST_HYBRID_OUTLET_SCHEDULING: 'false',
    },
  };
}

function processIsAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireFastlaneLock(): (() => void) | null {
  mkdirSync(STATE_DIR, { recursive: true });

  try {
    mkdirSync(FASTLANE_LOCK_DIR);
    writeFileSync(FASTLANE_LOCK_PID_FILE, `${process.pid}\n`, 'utf8');
  } catch {
    const existingPidRaw = readFileSync(FASTLANE_LOCK_PID_FILE, 'utf8').trim();
    const existingPid = Number.parseInt(existingPidRaw, 10);
    if (processIsAlive(existingPid)) {
      console.log(`[ingest-rss-fastlane] skip: existing run still active (pid=${existingPid})`);
      return null;
    }

    rmSync(FASTLANE_LOCK_DIR, { recursive: true, force: true });
    mkdirSync(FASTLANE_LOCK_DIR, { recursive: false });
    writeFileSync(FASTLANE_LOCK_PID_FILE, `${process.pid}\n`, 'utf8');
  }

  const release = () => {
    rmSync(FASTLANE_LOCK_DIR, { recursive: true, force: true });
  };
  process.on('exit', release);
  process.on('SIGINT', () => {
    release();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    release();
    process.exit(143);
  });
  return release;
}

function main(): void {
  const options = parseOptions();
  if (options.mode === 'all' && !options.maxOutlets) {
    console.log('[ingest-rss-fastlane] note: uncapped mode=all is manual-only; use --max-outlets for recurring scheduling');
  }
  const releaseLock = acquireFastlaneLock();
  if (!releaseLock) {
    process.exitCode = 0;
    return;
  }

  const watchlistOutputPath = buildWatchlistOutputPath(options.mode);
  try {
    runWatchlist(options, watchlistOutputPath);
    const rows = readWatchlistRows(watchlistOutputPath);
    const lookup = loadOutletIdsBySourceCountry(ATLAS_PATH);
    const { outletIds, selectedRows, missingRows } = selectOutletIds(options, rows, lookup);
    if (outletIds.length === 0) {
      throw new Error('no rss fastlane outlets selected');
    }

    const { args, env } = buildIngestCommand(options, outletIds);
    const strictCount = selectedRows.filter((row) => row.riskBand === 'STRICT').length;
    const oneMissCount = selectedRows.filter((row) => row.riskBand === 'ONE_MISS').length;
    const selectedCountries = [...new Set(selectedRows.map((row) => row.country))].sort((left, right) => left.localeCompare(right));

    if (options.printCommand) {
      console.log(JSON.stringify({
        mode: options.mode,
        rows: rows.length,
        selectedRows: selectedRows.length,
        selectedOutletIds: outletIds.length,
        strict: strictCount,
        oneMiss: oneMissCount,
        countries: selectedCountries,
        missingRows: missingRows.length,
      }, null, 2));
      console.log(['bun', ...args].join(' '));
      console.log(JSON.stringify(env, null, 2));
      return;
    }

    console.log(`[ingest-rss-fastlane] mode=${options.mode} selected_rows=${selectedRows.length} outlet_ids=${outletIds.length} strict=${strictCount} one_miss=${oneMissCount} countries=${selectedCountries.length} missing=${missingRows.length}`);
    const result = spawnSync('bun', args, {
      stdio: 'inherit',
      env: {
        ...process.env,
        ...env,
      },
    });

    if (typeof result.status === 'number') {
      process.exitCode = result.status;
      return;
    }

    if (result.error) {
      throw result.error;
    }
  } finally {
    releaseLock();
  }
}

main();
