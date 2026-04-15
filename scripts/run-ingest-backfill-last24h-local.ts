import { spawnSync } from 'node:child_process';
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { makeOutletId } from '../lib/outlet-id';

type AtlasCatalog = {
  countries?: AtlasCountry[];
};

type AtlasCountry = {
  name?: string;
  code?: string;
  feeds?: AtlasFeed[];
};

type AtlasFeed = {
  enabled?: boolean;
  name?: string;
  url?: string | null;
  sitemapUrl?: string | null;
};

type BackfillChunkResult = {
  index: number;
  outletCount: number;
  startedAt: string;
  totalOutlets?: number;
  totalEndpointRuns?: number;
  completedOutlets?: number;
  completedEndpointRuns?: number;
  lastCompletedOutletId?: string | null;
  createdRows?: number;
  updatedRows?: number;
  persistedRows?: number;
  progressPhase?: 'fetching' | 'persisting' | 'completed';
  progressUpdatedAt?: string;
  completedAt?: string;
  failedAt?: string;
  exitCode?: number;
};

type BackfillCheckpoint = {
  version: 1;
  label: 'last24h';
  status: 'running' | 'failed' | 'completed';
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  from: string;
  to: string;
  chunkSize: number;
  orderedOutletIds: string[];
  totalChunks: number;
  nextChunkIndex: number;
  currentChunkIndex: number | null;
  chunkResults: BackfillChunkResult[];
  hourlyDisabledAt?: string;
  hourlyResumedAt?: string;
  lastError?: string;
};

const PROJECT_ROOT = process.cwd();
const STATE_DIR = process.env.WPR_STATE_DIR || resolve(PROJECT_ROOT, '.wpr-state');
const LOG_DIR = process.env.WPR_LOG_DIR || resolve(PROJECT_ROOT, 'logs');
const CHECKPOINT_FILE = resolve(STATE_DIR, 'ingest-backfill-last24h-state.json');
const LOG_FILE = resolve(LOG_DIR, 'ingest-backfill-last24h-local.log');
const ATLAS_PATH = process.env.ATLAS_PATH || resolve(PROJECT_ROOT, 'data/rss-atlas.json');
const HOURLY_LABEL = 'com.wpr.ingest-hourly';
const LAUNCHD_DIR = process.env.WPR_LAUNCHD_DIR || resolve(process.env.HOME || '', 'Library/LaunchAgents');
const HOURLY_PLIST_PATH = resolve(LAUNCHD_DIR, `${HOURLY_LABEL}.plist`);
const BACKFILL_DISABLE_TITLE_FALLBACK = parseBoolEnv(process.env.INGEST_BACKFILL_DISABLE_TITLE_FALLBACK, true);
const BACKFILL_DISABLE_META_CATEGORY_FALLBACK = parseBoolEnv(
  process.env.INGEST_BACKFILL_DISABLE_META_CATEGORY_FALLBACK,
  true
);

type CliOptions = {
  chunkSize: number;
  from?: string;
  to?: string;
  reset: boolean;
};

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function parseBoolEnv(raw: string | undefined, defaultValue: boolean): boolean {
  if (!raw) return defaultValue;
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function log(message: string): void {
  const line = `[${nowIso()}] ${message}`;
  console.log(line);
  appendFileSync(LOG_FILE, `${line}\n`, 'utf8');
}

function fail(message: string): never {
  log(`ERROR: ${message}`);
  throw new Error(message);
}

function parseArgs(argv: string[]): CliOptions {
  let chunkSize = Math.max(
    500,
    Math.min(700, Number.parseInt(process.env.INGEST_BACKFILL_CHUNK_SIZE || '600', 10) || 600)
  );
  let from: string | undefined;
  let to: string | undefined;
  let reset = false;

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--reset') {
      reset = true;
      continue;
    }
    if (token.startsWith('--chunk-size=')) {
      chunkSize = Number.parseInt(token.slice('--chunk-size='.length), 10);
      continue;
    }
    if (token === '--chunk-size') {
      chunkSize = Number.parseInt(argv[i + 1] || '', 10);
      i += 1;
      continue;
    }
    if (token.startsWith('--from=')) {
      from = token.slice('--from='.length).trim();
      continue;
    }
    if (token === '--from') {
      from = (argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (token.startsWith('--to=')) {
      to = token.slice('--to='.length).trim();
      continue;
    }
    if (token === '--to') {
      to = (argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
  }

  if (!Number.isFinite(chunkSize) || chunkSize < 1) {
    fail(`Invalid chunk size: ${chunkSize}`);
  }

  return {
    chunkSize: Math.max(500, Math.min(700, Math.floor(chunkSize))),
    from,
    to,
    reset,
  };
}

function parseBoundaryMs(raw: string): number {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = new Date(`${trimmed}T00:00:00.000Z`).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  if (trimmed.includes('T') && /(Z|[+-]\d{2}:\d{2})$/i.test(trimmed)) {
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  fail(`Invalid backfill boundary: ${raw}`);
}

function buildDefaultWindow(): { from: string; to: string } {
  const toMs = Date.now();
  const fromMs = toMs - 24 * 60 * 60 * 1000;
  return {
    from: new Date(fromMs).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    to: new Date(toMs).toISOString().replace(/\.\d{3}Z$/, 'Z'),
  };
}

function loadAtlasOutletIds(): string[] {
  const raw = readFileSync(ATLAS_PATH, 'utf8');
  const atlas = JSON.parse(raw) as AtlasCatalog;
  const rows = (Array.isArray(atlas.countries) ? atlas.countries : []).flatMap((country) => {
    const countryName = country.name || country.code || 'Global';
    return (Array.isArray(country.feeds) ? country.feeds : [])
      .filter((feed): feed is AtlasFeed => {
        if (feed.enabled === false) return false;
        const hasRssUrl = typeof feed.url === 'string' && feed.url.trim().length > 0;
        const hasSitemapUrl = typeof feed.sitemapUrl === 'string' && feed.sitemapUrl.trim().length > 0;
        return hasRssUrl || hasSitemapUrl;
      })
      .map((feed) => {
        const name = (feed.name || 'Unknown source').trim() || 'Unknown source';
        const identity = (typeof feed.url === 'string' && feed.url.trim().length > 0
          ? feed.url.trim()
          : (typeof feed.sitemapUrl === 'string' && feed.sitemapUrl.trim().length > 0 ? feed.sitemapUrl.trim() : name));
        return {
          country: countryName,
          name,
          id: makeOutletId(countryName, name, identity),
        };
      });
  });

  rows.sort((left, right) => {
    return left.country.localeCompare(right.country) || left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
  });
  return rows.map((row) => row.id);
}

function writeCheckpoint(checkpoint: BackfillCheckpoint): void {
  checkpoint.updatedAt = nowIso();
  writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2), 'utf8');
}

function readCheckpoint(): BackfillCheckpoint | null {
  if (!existsSync(CHECKPOINT_FILE)) return null;
  const raw = readFileSync(CHECKPOINT_FILE, 'utf8');
  return JSON.parse(raw) as BackfillCheckpoint;
}

function mergeCheckpointFromDisk(checkpoint: BackfillCheckpoint): void {
  const current = readCheckpoint();
  if (!current) return;
  checkpoint.status = current.status;
  checkpoint.updatedAt = current.updatedAt;
  checkpoint.completedAt = current.completedAt;
  checkpoint.nextChunkIndex = current.nextChunkIndex;
  checkpoint.currentChunkIndex = current.currentChunkIndex;
  checkpoint.chunkResults = current.chunkResults;
  checkpoint.hourlyDisabledAt = current.hourlyDisabledAt;
  checkpoint.hourlyResumedAt = current.hourlyResumedAt;
  checkpoint.lastError = current.lastError;
}

function createCheckpoint(options: CliOptions): BackfillCheckpoint {
  const window = buildDefaultWindow();
  const from = options.from?.trim() || window.from;
  const to = options.to?.trim() || window.to;
  const fromMs = parseBoundaryMs(from);
  const toMs = parseBoundaryMs(to);
  if (toMs <= fromMs) {
    fail(`Backfill window must be increasing: from=${from} to=${to}`);
  }

  const orderedOutletIds = loadAtlasOutletIds();
  const totalChunks = Math.ceil(orderedOutletIds.length / options.chunkSize);
  const checkpoint: BackfillCheckpoint = {
    version: 1,
    label: 'last24h',
    status: 'running',
    startedAt: nowIso(),
    updatedAt: nowIso(),
    from,
    to,
    chunkSize: options.chunkSize,
    orderedOutletIds,
    totalChunks,
    nextChunkIndex: 0,
    currentChunkIndex: null,
    chunkResults: [],
  };
  writeCheckpoint(checkpoint);
  return checkpoint;
}

function prepareCheckpoint(options: CliOptions): BackfillCheckpoint {
  if (options.reset && existsSync(CHECKPOINT_FILE)) {
    rmSync(CHECKPOINT_FILE, { force: true });
  }

  const checkpoint = readCheckpoint();
  if (!checkpoint) return createCheckpoint(options);
  if (checkpoint.status === 'completed') {
    return createCheckpoint(options);
  }
  return checkpoint;
}

function getUid(): number {
  const uid = typeof process.getuid === 'function' ? process.getuid() : Number.NaN;
  if (!Number.isFinite(uid)) {
    fail('Unable to determine current uid for launchctl operations');
  }
  return uid;
}

function runSmallCommand(command: string, args: string[], allowFailure = false): void {
  const result = spawnSync(command, args, {
    cwd: PROJECT_ROOT,
    env: process.env,
    encoding: 'utf8',
  });
  const stdout = result.stdout?.trim();
  const stderr = result.stderr?.trim();
  if (stdout) appendFileSync(LOG_FILE, `${stdout}\n`, 'utf8');
  if (stderr) appendFileSync(LOG_FILE, `${stderr}\n`, 'utf8');
  if (result.status !== 0 && !allowFailure) {
    fail(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}`);
  }
}

function pidExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function listChildPids(pid: number): number[] {
  const result = spawnSync('pgrep', ['-P', String(pid)], {
    cwd: PROJECT_ROOT,
    env: process.env,
    encoding: 'utf8',
  });
  if (result.status !== 0 || !result.stdout) return [];
  return result.stdout
    .split('\n')
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value));
}

function collectPidTree(rootPid: number, seen = new Set<number>()): number[] {
  if (seen.has(rootPid)) return [];
  seen.add(rootPid);
  const descendants = listChildPids(rootPid);
  const nested = descendants.flatMap((pid) => collectPidTree(pid, seen));
  return [...descendants, ...nested];
}

function waitForExit(pid: number, timeoutMs: number): boolean {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!pidExists(pid)) return true;
    sleepMs(500);
  }
  return !pidExists(pid);
}

function stopActiveHourlyRun(lockDir: string): void {
  const pidFile = resolve(lockDir, 'pid');
  if (!existsSync(pidFile)) {
    return;
  }

  const rawPid = readFileSync(pidFile, 'utf8').trim();
  const pid = Number.parseInt(rawPid, 10);
  if (!Number.isFinite(pid) || !pidExists(pid)) {
    rmSync(lockDir, { recursive: true, force: true });
    return;
  }

  const pidTree = [...collectPidTree(pid), pid].filter((value, index, all) => all.indexOf(value) === index);
  log(`Stopping active hourly ingest pid tree: ${pidTree.join(', ')}`);
  for (const childPid of pidTree) {
    try {
      process.kill(childPid, 'SIGTERM');
    } catch {
      // ignore
    }
  }
  if (!waitForExit(pid, 20_000)) {
    for (const childPid of pidTree.reverse()) {
      try {
        process.kill(childPid, 'SIGKILL');
      } catch {
        // ignore
      }
    }
    if (!waitForExit(pid, 5_000)) {
      fail(`Unable to stop active hourly ingest pid ${pid}`);
    }
  }
  rmSync(lockDir, { recursive: true, force: true });
}

function disableHourlyAgent(checkpoint: BackfillCheckpoint): void {
  const uid = getUid();
  log(`Disabling ${HOURLY_LABEL} in user/${uid}`);
  stopActiveHourlyRun(resolve(STATE_DIR, 'ingest-hourly.lock'));
  runSmallCommand('launchctl', ['disable', `user/${uid}/${HOURLY_LABEL}`], true);
  runSmallCommand('launchctl', ['bootout', `user/${uid}/${HOURLY_LABEL}`], true);
  runSmallCommand('launchctl', ['bootout', `gui/${uid}/${HOURLY_LABEL}`], true);
  checkpoint.hourlyDisabledAt = nowIso();
  writeCheckpoint(checkpoint);
}

function reenableHourlyAgent(checkpoint: BackfillCheckpoint): void {
  const uid = getUid();
  if (!existsSync(HOURLY_PLIST_PATH)) {
    fail(`Hourly plist not found: ${HOURLY_PLIST_PATH}`);
  }
  log(`Re-enabling ${HOURLY_LABEL} in user/${uid}`);
  runSmallCommand('launchctl', ['enable', `user/${uid}/${HOURLY_LABEL}`], true);
  const printBefore = spawnSync('launchctl', ['print', `user/${uid}/${HOURLY_LABEL}`], {
    cwd: PROJECT_ROOT,
    env: process.env,
    encoding: 'utf8',
  });
  if (printBefore.status !== 0) {
    runSmallCommand('launchctl', ['bootstrap', `user/${uid}`, HOURLY_PLIST_PATH], true);
  }
  runSmallCommand('launchctl', ['kickstart', '-k', `user/${uid}/${HOURLY_LABEL}`], false);
  checkpoint.hourlyResumedAt = nowIso();
  writeCheckpoint(checkpoint);
}

function runChunk(checkpoint: BackfillCheckpoint, chunkIndex: number): void {
  const start = chunkIndex * checkpoint.chunkSize;
  const end = Math.min(start + checkpoint.chunkSize, checkpoint.orderedOutletIds.length);
  const chunkOutletIds = checkpoint.orderedOutletIds.slice(start, end);
  if (chunkOutletIds.length === 0) return;

  const startedAt = nowIso();
  checkpoint.status = 'running';
  checkpoint.currentChunkIndex = chunkIndex;
  checkpoint.lastError = undefined;
  checkpoint.chunkResults[chunkIndex] = {
    index: chunkIndex,
    outletCount: chunkOutletIds.length,
    startedAt,
  };
  writeCheckpoint(checkpoint);

  log(`Backfill chunk ${chunkIndex + 1}/${checkpoint.totalChunks}: ${chunkOutletIds.length} outlets`);
  const logFd = openSync(LOG_FILE, 'a');
  const workerEnv = {
    ...process.env,
    ...(BACKFILL_DISABLE_TITLE_FALLBACK ? { INGEST_ARTICLE_TITLE_FALLBACK: '0' } : {}),
    ...(BACKFILL_DISABLE_META_CATEGORY_FALLBACK ? { INGEST_ARTICLE_META_CATEGORY_FALLBACK: '0' } : {}),
    INGEST_BACKFILL_CHECKPOINT_FILE: CHECKPOINT_FILE,
    INGEST_BACKFILL_CHUNK_INDEX: String(chunkIndex),
  };
  const result = spawnSync(
    'bun',
    [
      'scripts/ingest-worker.ts',
      '--once',
      `--backfill-from=${checkpoint.from}`,
      `--backfill-to=${checkpoint.to}`,
      `--outlet-ids=${chunkOutletIds.join(',')}`,
    ],
    {
      cwd: PROJECT_ROOT,
      env: workerEnv,
      stdio: ['ignore', logFd, logFd],
    }
  );
  closeSync(logFd);

  if (result.status !== 0) {
    mergeCheckpointFromDisk(checkpoint);
    checkpoint.status = 'failed';
    checkpoint.currentChunkIndex = null;
    checkpoint.lastError = `chunk ${chunkIndex + 1} failed with exit code ${result.status ?? 'unknown'}`;
    checkpoint.chunkResults[chunkIndex] = {
      ...checkpoint.chunkResults[chunkIndex],
      failedAt: nowIso(),
      exitCode: result.status ?? 1,
    };
    writeCheckpoint(checkpoint);
    fail(checkpoint.lastError);
  }

  mergeCheckpointFromDisk(checkpoint);
  checkpoint.chunkResults[chunkIndex] = {
    ...checkpoint.chunkResults[chunkIndex],
    completedAt: nowIso(),
    exitCode: 0,
  };
  checkpoint.nextChunkIndex = chunkIndex + 1;
  checkpoint.currentChunkIndex = null;
  writeCheckpoint(checkpoint);
}

function main(): void {
  mkdirSync(STATE_DIR, { recursive: true });
  mkdirSync(LOG_DIR, { recursive: true });

  const options = parseArgs(process.argv.slice(2));
  const checkpoint = prepareCheckpoint(options);
  disableHourlyAgent(checkpoint);

  log(
    `Starting chunked 24h backfill window ${checkpoint.from}..${checkpoint.to} ` +
      `with ${checkpoint.orderedOutletIds.length} outlets in ${checkpoint.totalChunks} chunk(s) of ${checkpoint.chunkSize}`
  );
  log(
    `Backfill fallback mode: title=${BACKFILL_DISABLE_TITLE_FALLBACK ? 'off' : 'on'}, ` +
      `meta=${BACKFILL_DISABLE_META_CATEGORY_FALLBACK ? 'off' : 'on'}, published_at=on`
  );

  for (let chunkIndex = checkpoint.nextChunkIndex; chunkIndex < checkpoint.totalChunks; chunkIndex += 1) {
    runChunk(checkpoint, chunkIndex);
  }

  mergeCheckpointFromDisk(checkpoint);
  checkpoint.status = 'completed';
  checkpoint.completedAt = nowIso();
  checkpoint.currentChunkIndex = null;
  writeCheckpoint(checkpoint);
  log(`Completed chunked 24h backfill: ${checkpoint.totalChunks} chunk(s)`);

  reenableHourlyAgent(checkpoint);
  log(`Hourly ingest re-enabled and kickstarted after backfill completion`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  appendFileSync(LOG_FILE, `[${nowIso()}] FATAL: ${message}\n`, 'utf8');
  process.exit(1);
}
